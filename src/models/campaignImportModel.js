import { getDbPool } from "../db.js";

export async function createCampaignImport({ userId, fileName, items }) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [batchResult] = await connection.query(
      "INSERT INTO campaign_resolution_batches (user_id, file_name, total_urls, status) VALUES (?, ?, ?, ?)",
      [
        userId,
        String(fileName || "campaign-import").slice(0, 255),
        items.length,
        "queued",
      ],
    );
    const batchId = batchResult.insertId;
    for (let offset = 0; offset < items.length; offset += 100) {
      const rows = items
        .slice(offset, offset + 100)
        .map((item, index) => [
          batchId,
          offset + index,
          item.url,
          item.tags || null,
          item.country,
          item.uaType,
        ]);
      await connection.query(
        "INSERT INTO campaign_resolution_items (batch_id, row_index, original_url, tags, country, ua_type) VALUES ?",
        [rows],
      );
    }
    await connection.commit();
    return batchId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCampaignImports({ userId, limit = 25, offset = 0 }) {
  const pool = getDbPool();
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const [rows] = await pool.query(
    `
    SELECT b.id, b.file_name, b.status, b.total_urls, b.created_at, b.started_at, b.completed_at,
      COUNT(i.id) AS item_count,
      SUM(i.status IN ('resolved','failed','cancelled')) AS processed_urls,
      SUM(i.status = 'resolved') AS resolved_urls,
      SUM(i.status = 'failed') AS failed_urls,
      SUM(i.status = 'processing') AS processing_urls
    FROM campaign_resolution_batches b
    LEFT JOIN campaign_resolution_items i ON i.batch_id = b.id
    WHERE b.user_id = ?
    GROUP BY b.id
    ORDER BY b.id DESC
    LIMIT ? OFFSET ?`,
    [userId, safeLimit, safeOffset],
  );
  return rows.map((row) => ({
    ...row,
    total_urls: Number(row.total_urls || 0),
    item_count: Number(row.item_count || 0),
    processed_urls: Number(row.processed_urls || 0),
    resolved_urls: Number(row.resolved_urls || 0),
    failed_urls: Number(row.failed_urls || 0),
    processing_urls: Number(row.processing_urls || 0),
  }));
}

export async function getCampaignImport({ batchId, userId }) {
  const pool = getDbPool();
  const [batches] = await pool.query(
    `SELECT * FROM campaign_resolution_batches WHERE id = ? AND user_id = ?`,
    [batchId, userId],
  );
  if (!batches.length) return null;
  const [items] = await pool.query(
    `SELECT * FROM campaign_resolution_items WHERE batch_id = ? ORDER BY row_index`,
    [batchId],
  );
  return {
    ...batches[0],
    items: items.map((item) => ({
      ...item,
      redirect_chain: parseJson(item.redirect_chain, []),
    })),
  };
}

export async function claimCampaignImport() {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id FROM campaign_resolution_batches WHERE status = 'queued' ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    const batchId = rows[0].id;
    await connection.query(
      `UPDATE campaign_resolution_batches SET status = 'processing', started_at = COALESCE(started_at, UTC_TIMESTAMP()) WHERE id = ? AND status = 'queued'`,
      [batchId],
    );
    await connection.commit();
    return batchId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function controlCampaignImport({
  batchId,
  userId,
  action,
  cancelledBy = "unknown user",
}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT id, status FROM campaign_resolution_batches WHERE id = ? AND user_id = ? FOR UPDATE",
      [batchId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return { notFound: true };
    }
    const current = rows[0].status;
    if (action === "pause" && ["queued", "processing"].includes(current)) {
      await connection.query(
        "UPDATE campaign_resolution_batches SET status = 'paused' WHERE id = ?",
        [batchId],
      );
    } else if (action === "resume" && current === "paused") {
      await connection.query(
        "UPDATE campaign_resolution_batches SET status = 'queued' WHERE id = ?",
        [batchId],
      );
    } else if (
      action === "cancel" &&
      ["queued", "processing", "paused"].includes(current)
    ) {
      const cancelReason = `Cancelled by ${String(cancelledBy || "unknown user").slice(0, 100)}`;
      await connection.query(
        "UPDATE campaign_resolution_items SET status = 'cancelled', failure_reason = ?, completed_at = UTC_TIMESTAMP() WHERE batch_id = ? AND status IN ('pending','processing')",
        [cancelReason, batchId],
      );
      await connection.query(
        "UPDATE campaign_resolution_batches SET status = 'cancelled', completed_at = UTC_TIMESTAMP() WHERE id = ?",
        [batchId],
      );
    } else {
      await connection.rollback();
      return { invalidState: true, status: current };
    }
    await connection.commit();
    const [updated] = await pool.query(
      "SELECT status FROM campaign_resolution_batches WHERE id = ?",
      [batchId],
    );
    return { status: updated[0].status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteCampaignImport({ batchId, userId }) {
  const pool = getDbPool();
  const [result] = await pool.query(
    "DELETE FROM campaign_resolution_batches WHERE id = ? AND user_id = ? AND status IN ('completed','completed_with_errors','failed','cancelled')",
    [batchId, userId],
  );
  return result.affectedRows > 0;
}

export async function getPendingCampaignImportItems(batchId) {
  const [rows] = await getDbPool().query(
    `SELECT i.*, b.user_id FROM campaign_resolution_items i JOIN campaign_resolution_batches b ON b.id = i.batch_id WHERE i.batch_id = ? AND i.status = 'pending' ORDER BY i.row_index`,
    [batchId],
  );
  return rows;
}

export async function getCampaignImportStatus(batchId) {
  const [[row]] = await getDbPool().query(
    "SELECT status FROM campaign_resolution_batches WHERE id = ?",
    [batchId],
  );
  return row?.status || "missing";
}

export async function setCampaignImportItemStatus(itemId, status) {
  const [result] = await getDbPool().query(
    "UPDATE campaign_resolution_items SET status = ? WHERE id = ? AND status = 'pending'",
    [status, itemId],
  );
  return result.affectedRows > 0;
}

export async function requeueCampaignImport(batchId) {
  const pool = getDbPool();
  await pool.query(
    `UPDATE campaign_resolution_items SET status = 'pending' WHERE batch_id = ? AND status = 'processing'`,
    [batchId],
  );
  await pool.query(
    `UPDATE campaign_resolution_batches SET status = 'queued' WHERE id = ? AND status = 'processing'`,
    [batchId],
  );
}

export async function updateCampaignImportItem({
  itemId,
  result,
  failureReason = null,
}) {
  const pool = getDbPool();
  const validUrl =
    result?.finalUrl &&
    /^https?:\/\//i.test(result.finalUrl) &&
    !/^(about:blank|chrome-error:\/\/)/i.test(result.finalUrl);
  const status = validUrl && !failureReason ? "resolved" : "failed";
  const ipData = result?.ipData || {};
  await pool.query(
    `UPDATE campaign_resolution_items SET status = ?, final_url = ?, redirect_chain = ?,
    actual_country = ?, actual_country_name = ?, proxy_ip = ?, region_match = ?, verification_status = ?,
    verification_error = ?, failure_reason = ?, request_id = ?, duration_ms = ?, completed_at = UTC_TIMESTAMP()
    WHERE id = ? AND status = 'processing'`,
    [
      status,
      validUrl ? result.finalUrl : null,
      JSON.stringify(
        Array.isArray(result?.redirectChain) ? result.redirectChain : [],
      ),
      String(ipData.country_code || "").toUpperCase() || null,
      ipData.country || null,
      ipData.ip || null,
      result?.countryMatch == null ? null : result.countryMatch ? 1 : 0,
      result?.countryMatch === true
        ? "match"
        : result?.countryMatch === false
          ? "mismatch"
          : "unavailable",
      result?.verificationError || ipData.error || null,
      failureReason || result?.error || null,
      result?.requestId || null,
      Number.isFinite(Number(result?.durationMs))
        ? Number(result.durationMs)
        : null,
      itemId,
    ],
  );
  return status;
}

export async function completeCampaignImport(batchId) {
  const pool = getDbPool();
  const [[counts]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status = 'failed') AS failed, SUM(status IN ('pending','processing')) AS unfinished FROM campaign_resolution_items WHERE batch_id = ?`,
    [batchId],
  );
  const status =
    Number(counts.unfinished) > 0
      ? "queued"
      : Number(counts.failed) === Number(counts.total)
        ? "failed"
        : Number(counts.failed) > 0
          ? "completed_with_errors"
          : "completed";
  await pool.query(
    `UPDATE campaign_resolution_batches SET status = IF(status IN ('paused','cancelled'), status, ?), completed_at = IF(? IN ('completed','completed_with_errors','failed'), UTC_TIMESTAMP(), NULL) WHERE id = ?`,
    [status, status, batchId],
  );
  const [[row]] = await pool.query(
    "SELECT status FROM campaign_resolution_batches WHERE id = ?",
    [batchId],
  );
  return row?.status || status;
}

function parseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}