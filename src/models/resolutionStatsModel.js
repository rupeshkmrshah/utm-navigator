import { getDbPool } from "../db.js";
import { istDateBoundaryUtc } from "../timezone.js";

/**
 * Updates the resolution statistics for a given region.
 *
 * @param {object} details - The details for the update.
 * @param {string} details.region - The region code (e.g., 'US', 'GB').
 * @param {boolean} details.isSuccess - True if the resolution was successful, false otherwise.
 */
export async function updateResolutionStats({ region, isSuccess }) {
  const pool = getDbPool();
  const columnToIncrement = isSuccess ? "success_count" : "failure_count";

  await pool.query(
    `INSERT INTO resolution_stats (region, ${columnToIncrement}) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE ${columnToIncrement} = ${columnToIncrement} + 1, last_updated = CURRENT_TIMESTAMP`,
    [region],
  );
}

/**
 * Retrieves all resolution statistics.
 *
 * @returns {Promise<Array<object>>} A list of all resolution stats per region.
 */
export async function getResolutionStats() {
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT region, success_count, failure_count FROM resolution_stats",
  );
  return rows;
}

/**
 * Resets all resolution statistics.
 */
export async function resetResolutionStats() {
  const pool = getDbPool();
  await pool.query("TRUNCATE TABLE resolution_stats");
}

export async function recordResolutionAttempt({
  requestId,
  jobId = null,
  userId = null,
  originalUrl,
  finalUrl = null,
  redirectChain = [],
  region,
  status,
  failureReason = null,
  durationMs = null,
}) {
  const pool = getDbPool();
  const safeFinalUrl = isUsableFinalUrl(finalUrl) ? finalUrl : null;
  const safeStatus =
    status === "resolved" && safeFinalUrl ? "resolved" : "failed";
  const reason =
    safeStatus === "failed"
      ? failureReason ||
        (finalUrl
          ? `Invalid final destination: ${finalUrl}`
          : "URL resolution failed")
      : null;
  await pool.query(
    `INSERT INTO resolution_attempts (request_id, job_id, user_id, original_url, final_url, redirect_chain, region, status, failure_reason, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(requestId || "").slice(0, 64),
      jobId,
      userId,
      originalUrl,
      safeFinalUrl,
      JSON.stringify(Array.isArray(redirectChain) ? redirectChain : []),
      String(region || "US")
        .toUpperCase()
        .slice(0, 10),
      safeStatus,
      reason,
      durationMs,
    ],
  );
  return { status: safeStatus, finalUrl: safeFinalUrl, failureReason: reason };
}

export function isUsableFinalUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /^(about:blank|chrome-error:\/\/)/i.test(value.trim())
  )
    return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function getResolutionAnalytics({ from, to, region } = {}) {
  const pool = getDbPool();
  const clauses = [];
  const params = [];
  if (from) {
    const boundary = istDateBoundaryUtc(from);
    if (boundary) {
      clauses.push("created_at >= ?");
      params.push(boundary);
    }
  }
  if (to) {
    const boundary = istDateBoundaryUtc(to, 1);
    if (boundary) {
      clauses.push("created_at < ?");
      params.push(boundary);
    }
  }
  if (region) {
    clauses.push("region = ?");
    params.push(String(region).toUpperCase());
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [[totals]] = await pool.query(
    `SELECT SUM(status = 'resolved') AS totalSuccess, SUM(status = 'failed') AS totalFailure FROM resolution_attempts ${where}`,
    params,
  );
  const [regionRows] = await pool.query(
    `SELECT region, SUM(status = 'resolved') AS success, SUM(status = 'failed') AS failure FROM resolution_attempts ${where} GROUP BY region ORDER BY region`,
    params,
  );
  const [failedUrls] = await pool.query(
    `SELECT id, request_id AS requestId, original_url AS url, region, failure_reason AS reason, created_at AS timestamp FROM resolution_attempts ${where}${where ? " AND" : " WHERE"} status = 'failed' ORDER BY created_at DESC LIMIT 500`,
    params,
  );
  return {
    totalSuccess: Number(totals?.totalSuccess || 0),
    totalFailure: Number(totals?.totalFailure || 0),
    perRegion: Object.fromEntries(
      regionRows.map((row) => [
        row.region,
        { success: Number(row.success), failure: Number(row.failure) },
      ]),
    ),
    failedUrls,
  };
}

export async function getResolutionTimingRows({ start, end } = {}) {
  const pool = getDbPool();
  const [rows] =
    await pool.query(`SELECT request_id, original_url, region, status, duration_ms, created_at
    FROM resolution_attempts WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 DAY) ORDER BY created_at DESC`);
  return rows
    .filter((row) => {
      const date = getIstDate(new Date(row.created_at));
      return (!start || date >= start) && (!end || date <= end);
    })
    .map((row) => ({
      requestId: row.request_id,
      url: row.original_url,
      region: row.region,
      status: row.status,
      time: Number(row.duration_ms || 0),
      date: getIstDate(new Date(row.created_at)),
      timestamp: new Date(row.created_at).toISOString(),
    }));
}

function getIstDate(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}