import { getDbPool, handlePoolError } from "../db.js";

/**
 * Creates a new scheduled job in the database.
 *
 * @param {object} jobDetails - The details of the job.
 * @param {number} jobDetails.userId - The ID of the user who owns the job.
 * @param {string} jobDetails.fileName - The name of the uploaded file.
 * @param {string} jobDetails.mimeType - The MIME type of the file.
 * @param {Buffer} jobDetails.fileContent - The content of the file.
 * @param {string} jobDetails.scheduledAt - The ISO 8601 string for when the job should run.
 * @returns {Promise<number>} The ID of the newly created job.
 */
export async function createScheduledJob({
  userId,
  fileName,
  mimeType,
  fileContent,
  scheduledAt,
  totalUrls,
}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      "INSERT INTO scheduled_jobs (user_id, file_name, mime_type, file_content, scheduled_at, total_urls) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, fileName, mimeType, fileContent, scheduledAt, totalUrls],
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Fetches all jobs with a 'pending' status that are due to be run.
 *
 * @returns {Promise<Array<object>>} A list of pending jobs.
 */
// export async function getPendingJobs() {
//   const pool = getDbPool();
//   const connection = await pool.getConnection();
//   try {
//     const [rows] = await connection.query('SELECT * FROM scheduled_jobs WHERE status = \'pending\' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC');
//     return rows;
//   } finally {
//     connection.release();
//   }
// }
export async function getPendingJobs() {
  const pool = getDbPool();

  await pool.query(`UPDATE scheduled_jobs SET
    status = CASE control_requested WHEN 'pause' THEN 'paused' WHEN 'cancel' THEN 'cancelled' ELSE 'pending' END,
    control_requested = NULL, worker_heartbeat_at = NULL
    WHERE status = 'processing' AND (worker_heartbeat_at IS NULL OR worker_heartbeat_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))`);

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use pool.query so the driver hands out a fresh working connection
      const [rows] = await pool.query(
        "SELECT * FROM scheduled_jobs WHERE status = 'pending' AND scheduled_at <= UTC_TIMESTAMP() ORDER BY scheduled_at ASC",
      );
      return rows;
    } catch (err) {
      console.error(
        `[getPendingJobs] Attempt ${attempt} failed:`,
        err?.code || err?.message,
      );

      const transient = new Set([
        "PROTOCOL_CONNECTION_LOST",
        "ECONNRESET",
        "ETIMEDOUT",
        "ER_SERVER_SHUTDOWN",
        "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
        "PROTOCOL_ENQUEUE_HANDSHAKE_TWICE",
      ]);
      if (transient.has(err?.code) && attempt < maxRetries) {
        handlePoolError(err);
        const delayMs = attempt * 500;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      // Non-recoverable or out of retries
      handlePoolError(err);
      return [];
    }
  }

  return [];
}

/**
 * Updates the status of a scheduled job.
 *
 * @param {object} details - The job update details.
 * @param {number} details.jobId - The ID of the job to update.
 * @param {'pending'|'processing'|'completed'|'failed'} details.status - The new status.
 * @returns {Promise<void>}
 */
export async function updateJobStatus({ jobId, status }) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.query(
      "UPDATE scheduled_jobs SET status = ?, control_requested = IF(? IN ('paused', 'cancelled', 'completed', 'partially_completed', 'failed'), NULL, control_requested), worker_heartbeat_at = IF(? = 'processing', UTC_TIMESTAMP(), NULL) WHERE id = ?",
      [status, status, status, jobId],
    );
  } finally {
    connection.release();
  }
}

export async function claimScheduledJob(jobId) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE scheduled_jobs SET status = 'processing', control_requested = NULL, worker_heartbeat_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'pending' AND scheduled_at <= UTC_TIMESTAMP()`,
    [jobId],
  );
  return result.affectedRows === 1;
}

export async function touchJobHeartbeat(jobId) {
  const pool = getDbPool();
  await pool.query(
    `UPDATE scheduled_jobs SET worker_heartbeat_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'processing'`,
    [jobId],
  );
}

export async function updateJobTotalUrls(jobId, totalUrls) {
  const pool = getDbPool();
  await pool.query(
    "UPDATE scheduled_jobs SET total_urls = ? WHERE id = ? AND status = 'processing'",
    [totalUrls, jobId],
  );
}

export async function pauseJobIfRequested(jobId) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE scheduled_jobs SET status = 'paused', control_requested = NULL, worker_heartbeat_at = NULL WHERE id = ? AND status = 'processing' AND control_requested = 'pause'`,
    [jobId],
  );
  return result.affectedRows === 1;
}

export async function cancelJobIfRequested(jobId) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE scheduled_jobs SET status = 'cancelled', control_requested = NULL, worker_heartbeat_at = NULL WHERE id = ? AND status = 'processing' AND control_requested = 'cancel'`,
    [jobId],
  );
  return result.affectedRows === 1;
}

export async function finishJobIfUncontrolled(jobId, status) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE scheduled_jobs SET status = ?, worker_heartbeat_at = NULL WHERE id = ? AND status = 'processing' AND control_requested IS NULL`,
    [status, jobId],
  );
  return result.affectedRows === 1;
}

export async function getJobControl(jobId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT status, control_requested FROM scheduled_jobs WHERE id = ?",
    [jobId],
  );
  return rows[0] || null;
}

export async function getJobProgress(jobId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT row_index, status FROM scheduled_results WHERE job_id = ? ORDER BY id`,
    [jobId],
  );
  return {
    processed: rows.length,
    resolved: rows.filter((row) => row.status === "resolved").length,
    failed: rows.filter((row) => row.status === "failed").length,
    completedRowIndexes: rows
      .filter((row) => row.row_index !== null)
      .map((row) => Number(row.row_index)),
    legacyProcessed: rows.filter((row) => row.row_index === null).length,
  };
}

export async function requestJobControl({
  jobId,
  userId,
  isAdmin = false,
  action,
}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT id, status, control_requested FROM scheduled_jobs WHERE id = ? AND (? = 1 OR user_id = ?) FOR UPDATE",
      [jobId, isAdmin ? 1 : 0, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return { notFound: true };
    }
    const status = rows[0].status;
    const controlRequested = rows[0].control_requested;
    if (action === "pause") {
      if (status === "pending")
        await connection.query(
          `UPDATE scheduled_jobs SET status = 'paused' WHERE id = ?`,
          [jobId],
        );
      else if (status === "processing")
        await connection.query(
          `UPDATE scheduled_jobs SET control_requested = 'pause' WHERE id = ?`,
          [jobId],
        );
      else {
        await connection.rollback();
        return { invalidState: status };
      }
    } else if (action === "resume") {
      if (status === "paused")
        await connection.query(
          `UPDATE scheduled_jobs SET status = 'pending', control_requested = NULL WHERE id = ?`,
          [jobId],
        );
      else if (status === "processing" && controlRequested === "pause")
        await connection.query(
          `UPDATE scheduled_jobs SET control_requested = NULL WHERE id = ?`,
          [jobId],
        );
      else {
        await connection.rollback();
        return { invalidState: status };
      }
    } else if (action === "cancel") {
      if (
        ["completed", "partially_completed", "failed", "cancelled"].includes(
          status,
        )
      ) {
        await connection.rollback();
        return { invalidState: status };
      }
      if (status === "processing")
        await connection.query(
          `UPDATE scheduled_jobs SET control_requested = 'cancel' WHERE id = ?`,
          [jobId],
        );
      else
        await connection.query(
          `UPDATE scheduled_jobs SET status = 'cancelled', control_requested = NULL WHERE id = ?`,
          [jobId],
        );
    }
    await connection.commit();
    return {
      status:
        action === "pause" && status === "processing"
          ? "pause_requested"
          : action === "cancel" && status === "processing"
            ? "cancel_requested"
            : action === "resume"
              ? status === "processing"
                ? "processing"
                : "pending"
              : action === "cancel"
                ? "cancelled"
                : "paused",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateScheduledTime({
  jobId,
  userId,
  isAdmin = false,
  scheduledAt,
}) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE scheduled_jobs SET scheduled_at = ? WHERE id = ? AND (? = 1 OR user_id = ?) AND status IN ('pending', 'paused')`,
    [scheduledAt, jobId, isAdmin ? 1 : 0, userId],
  );
  return result.affectedRows === 1;
}

/**
 * Creates a new scheduled result in the database.
 *
 * @param {object} resultDetails - The details of the result.
 * @param {number} resultDetails.jobId - The ID of the parent job.
 * @param {string} resultDetails.originalUrl - The original URL from the file.
 * @param {string} [resultDetails.finalUrl] - The resolved final URL.
 * @param {string} [resultDetails.country] - The country used for resolution.
 * @param {string} [resultDetails.uaType] - The user agent type used.
 * @param {string} [resultDetails.notes] - Any notes from the file.
 * @param {'resolved'|'failed'} resultDetails.status - The resolution status.
 * @param {string} [resultDetails.errorMessage] - Any error message.
 * @returns {Promise<number>} The ID of the newly created result.
 */
// export async function createScheduledResult({ jobId, originalUrl, finalUrl, country, uaType, notes, status, errorMessage }) {
//   const pool = getDbPool();
//   const connection = await pool.getConnection();
//   try {
//     const [result] = await connection.query(
//       'INSERT INTO scheduled_results (job_id, original_url, final_url, country, uaType, notes, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
//       [jobId, originalUrl, finalUrl, country, uaType, notes, status, errorMessage]
//     );
//     return result.insertId;
//   } finally {
//     connection.release();
//   }
// }

//create schedule results with retries mechanism
export async function createScheduledResult({
  jobId,
  originalUrl,
  rowIndex = null,
  finalUrl,
  redirectChain = [],
  country,
  uaType,
  notes,
  status,
  errorMessage,
  actualCountry = null,
  actualCountryName = null,
  proxyIp = null,
  regionMatch = null,
  verificationStatus = null,
  verificationError = null,
}) {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const pool = getDbPool();
      const connection = await pool.getConnection();

      try {
        const [result] = await connection.query(
          `INSERT INTO scheduled_results (job_id, original_url, row_index, final_url, redirect_chain, country, uaType, notes, status, error_message, actual_country, actual_country_name, proxy_ip, region_match, verification_status, verification_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
           final_url = VALUES(final_url), redirect_chain = VALUES(redirect_chain), status = VALUES(status), error_message = VALUES(error_message),
           actual_country = VALUES(actual_country), actual_country_name = VALUES(actual_country_name), proxy_ip = VALUES(proxy_ip),
           region_match = VALUES(region_match), verification_status = VALUES(verification_status), verification_error = VALUES(verification_error), resolved_at = CURRENT_TIMESTAMP`,
          [
            jobId,
            originalUrl,
            rowIndex,
            status === "resolved" && isUsableStoredUrl(finalUrl)
              ? finalUrl
              : null,
            JSON.stringify(Array.isArray(redirectChain) ? redirectChain : []),
            country,
            uaType,
            notes,
            status === "resolved" && isUsableStoredUrl(finalUrl)
              ? "resolved"
              : status,
            status === "resolved" && isUsableStoredUrl(finalUrl)
              ? errorMessage
              : errorMessage || "Invalid final destination",
            actualCountry,
            actualCountryName,
            proxyIp,
            regionMatch == null ? null : regionMatch ? 1 : 0,
            verificationStatus,
            verificationError,
          ],
        );
        return result.insertId;
      } finally {
        connection.release();
      }
    } catch (err) {
      console.error(
        `[createScheduledResult] Attempt ${attempt} failed:`,
        err?.code || err?.message,
      );

      if (
        attempt < maxRetries &&
        ["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "ETIMEDOUT"].includes(
          err?.code,
        )
      ) {
        handlePoolError(err);
        const delayMs = attempt * 1000; // Exponential backoff
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      throw err; // Re-throw if max retries reached or non-recoverable error
    }
  }
}

/**
 * Lists scheduled jobs. If userId is provided, it lists jobs for that user.
 * Otherwise, it lists all jobs.
 *
 * @param {object} [details] - The user details.
 * @param {number} [details.userId] - The ID of the user.
 * @returns {Promise<Array<object>>} A list of jobs.
 */
export async function listScheduledJobs({ userId } = {}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    let query = `
      SELECT j.id, j.file_name, j.total_urls, j.status, j.scheduled_at, j.created_at, u.username, j.control_requested,
        (SELECT COUNT(*) FROM scheduled_results r WHERE r.job_id = j.id) AS processed_urls,
        (SELECT COUNT(*) FROM scheduled_results r WHERE r.job_id = j.id AND r.status = 'resolved') AS resolved_urls,
        (SELECT COUNT(*) FROM scheduled_results r WHERE r.job_id = j.id AND r.status = 'failed') AS failed_urls,
        (SELECT COUNT(*) FROM scheduled_results r WHERE r.job_id = j.id AND r.status = 'cancelled') AS cancelled_urls
      FROM scheduled_jobs j
      JOIN users u ON j.user_id = u.id
    `;
    const params = [];

    if (userId) {
      query += " WHERE j.user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY j.created_at DESC";

    const [rows] = await connection.query(query, params);
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * Lists scheduled results. If userId is provided, it lists results for that user.
 * Otherwise, it lists all results.
 *
 * @param {object} [details] - The user details.
 * @param {number} [details.userId] - The ID of the user.
 * @returns {Promise<Array<object>>} A list of results.
 */
export async function getScheduledResults({ userId } = {}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    let query = `
      SELECT r.*, u.username
      FROM scheduled_results r
      JOIN scheduled_jobs j ON r.job_id = j.id
      JOIN users u ON j.user_id = u.id
    `;
    const params = [];

    if (userId) {
      query += " WHERE j.user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY r.resolved_at DESC";

    const [rows] = await connection.query(query, params);
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * Updates a single scheduled result.
 *
 * @param {object} details - The result update details.
 * @param {number} details.resultId - The ID of the result to update.
 * @param {string} details.finalUrl - The new final URL.
 * @param {'resolved'|'failed'} details.status - The new status.
 * @returns {Promise<void>}
 */
export async function updateScheduledResult({
  resultId,
  finalUrl,
  redirectChain,
  status,
  errorMessage,
  country,
  uaType,
  notes,
  actualCountry,
  actualCountryName,
  proxyIp,
  regionMatch,
  verificationStatus,
  verificationError,
  userId,
  isAdmin = false,
}) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `UPDATE scheduled_results r JOIN scheduled_jobs j ON r.job_id = j.id
       SET r.final_url = ?, r.redirect_chain = COALESCE(?, r.redirect_chain), r.status = ?, r.error_message = ?, r.country = COALESCE(?, r.country), r.uaType = COALESCE(?, r.uaType), r.notes = COALESCE(?, r.notes),
       r.actual_country = COALESCE(?, r.actual_country), r.actual_country_name = COALESCE(?, r.actual_country_name), r.proxy_ip = COALESCE(?, r.proxy_ip), r.region_match = COALESCE(?, r.region_match), r.verification_status = COALESCE(?, r.verification_status), r.verification_error = COALESCE(?, r.verification_error), r.resolved_at = CURRENT_TIMESTAMP
       WHERE r.id = ? AND (? = 1 OR j.user_id = ?)`,
      [
        status === "resolved" && isUsableStoredUrl(finalUrl) ? finalUrl : null,
        redirectChain == null
          ? null
          : JSON.stringify(Array.isArray(redirectChain) ? redirectChain : []),
        status === "resolved" && isUsableStoredUrl(finalUrl)
          ? "resolved"
          : "failed",
        status === "resolved" && isUsableStoredUrl(finalUrl)
          ? null
          : errorMessage || "Invalid final destination or resolution failed",
        country || null,
        uaType || null,
        notes ?? null,
        actualCountry || null,
        actualCountryName || null,
        proxyIp || null,
        regionMatch == null ? null : regionMatch ? 1 : 0,
        verificationStatus || null,
        verificationError || null,
        resultId,
        isAdmin ? 1 : 0,
        userId,
      ],
    );
    return result.affectedRows === 1;
  } finally {
    connection.release();
  }
}

export async function deleteScheduledResult({
  resultId,
  userId,
  isAdmin = false,
}) {
  const pool = getDbPool();
  const [result] = await pool.query(
    `DELETE r FROM scheduled_results r JOIN scheduled_jobs j ON r.job_id = j.id WHERE r.id = ? AND (? = 1 OR j.user_id = ?)`,
    [resultId, isAdmin ? 1 : 0, userId],
  );
  return result.affectedRows === 1;
}

/**
 * Deletes all scheduled results for a specific user.
 *
 * @param {object} details - The user details.
 * @param {number} details.userId - The ID of the user.
 * @returns {Promise<void>}
 */
export async function deleteAllScheduledResults({ userId, isAdmin = false }) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    // First, delete results associated with jobs of this user
    await connection.query(
      `DELETE sr FROM scheduled_results sr
       JOIN scheduled_jobs sj ON sr.job_id = sj.id
       WHERE (? = 1 OR sj.user_id = ?)`,
      [isAdmin ? 1 : 0, userId],
    );
  } finally {
    connection.release();
  }
}

/**
 * Deletes a specific scheduled job.
 *
 * @param {object} details - The job details.
 * @param {number} details.jobId - The ID of the job to delete.
 * @param {number} details.userId - The ID of the user who owns the job (for security).
 * @returns {Promise<void>}
 */
export async function deleteScheduledJob({ jobId, userId, isAdmin = false }) {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `DELETE FROM scheduled_jobs WHERE id = ? AND (? = 1 OR user_id = ?) AND status <> 'processing'`,
      [jobId, isAdmin ? 1 : 0, userId],
    );
    return result.affectedRows === 1;
  } finally {
    connection.release();
  }
}

function isUsableStoredUrl(value) {
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