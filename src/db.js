import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
let pool;

function createPool() {
  const newPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
  });

  // Keep MySQL TIMESTAMP reads/writes in UTC. The browser formats API dates
  // for Asia/Kolkata; relying on the server's local MySQL session timezone
  // shifts TIMESTAMP columns before mysql2 serializes them.
  newPool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error)
        console.error(
          "[DB] Could not set connection timezone to UTC:",
          error.message,
        );
    });
  });

  newPool.on("error", (err) => {
    console.error("[DB] Pool error:", err);
    handlePoolError(err);
  });

  return newPool;
}

export function getDbPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

// Optional: Reset pool if connection is lost
export function handlePoolError(err) {
  if (!err) return;
  const recoverable = new Set([
    "PROTOCOL_CONNECTION_LOST",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ER_SERVER_SHUTDOWN",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    "PROTOCOL_ENQUEUE_HANDSHAKE_TWICE",
  ]);
  if (recoverable.has(err.code)) {
    console.warn(
      "[DB] Connection issue detected, recreating pool...",
      err.code,
    );
    pool = null;
    getDbPool();
    console.log("[DB] Pool recreated.");
  } else {
    console.error("[DB] Non-recoverable error:", err);
  }
}

//Check Connection Health
export async function checkConnectionHealth() {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query("SELECT 1 as health_check");
    return rows.length > 0;
  } catch (error) {
    console.error("[DB] Health check failed:", error);
    handlePoolError(error);
    return false;
  }
}

export async function ensureSchema() {
  const pool = getDbPool();
  // Create tables if not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(191) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('Admin','Subscriber','Analytics','Coordinator') NOT NULL DEFAULT 'Subscriber',
      approved TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Add approved column for existing deployments if missing
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'approved'`,
      [process.env.MYSQL_DB],
    );
    if (!cols.length) {
      await pool.query(
        `ALTER TABLE users ADD COLUMN approved TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  } catch (err) {
    // ignore if not permitted; startup will continue
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handlePoolError(err);
      console.log("[ensureSchema] Pool recreated.");
    }
  }

  // Add total_urls column for existing deployments if missing
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scheduled_jobs' AND COLUMN_NAME = 'total_urls'`,
      [process.env.MYSQL_DB],
    );
    if (!cols.length) {
      await pool.query(
        `ALTER TABLE scheduled_jobs ADD COLUMN total_urls INT NOT NULL DEFAULT 0`,
      );
    }
  } catch (err) {
    // ignore if not permitted
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handlePoolError(err);
      console.log(
        "[ensureSchema] Pool recreated for total_urls column addition.",
      );
    }
  }

  // Ensure all Admin users are approved (for existing deployments)
  try {
    await pool.query(
      `UPDATE users SET approved = 1 WHERE role = 'Admin' AND approved = 0`,
    );
  } catch (err) {
    // ignore
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handlePoolError(err);
      console.log("[ensureSchema] Pool recreated.");
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      action VARCHAR(100) NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_content LONGBLOB NOT NULL,
      total_urls INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      control_requested VARCHAR(16) NULL,
      worker_heartbeat_at DATETIME NULL,
      scheduled_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Add controls and richer statuses on existing installations.
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scheduled_jobs' AND COLUMN_NAME = 'control_requested'`,
      [process.env.MYSQL_DB],
    );
    if (!cols.length)
      await pool.query(
        `ALTER TABLE scheduled_jobs ADD COLUMN control_requested VARCHAR(16) NULL`,
      );
    const [heartbeatCols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scheduled_jobs' AND COLUMN_NAME = 'worker_heartbeat_at'`,
      [process.env.MYSQL_DB],
    );
    if (!heartbeatCols.length)
      await pool.query(
        `ALTER TABLE scheduled_jobs ADD COLUMN worker_heartbeat_at DATETIME NULL`,
      );
    await pool.query(
      `ALTER TABLE scheduled_jobs MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'`,
    );
  } catch (err) {
    console.error(
      "[ensureSchema] Failed to prepare scheduled job controls:",
      err.message,
    );
    throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_results (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      original_url TEXT NOT NULL,
      row_index INT NULL,
      final_url TEXT,
      country VARCHAR(10),
      uaType VARCHAR(100),
      notes TEXT,
      status VARCHAR(16) NOT NULL,
      error_message TEXT,
      redirect_chain JSON NULL,
      actual_country VARCHAR(10) NULL,
      actual_country_name VARCHAR(100) NULL,
      proxy_ip VARCHAR(64) NULL,
      region_match TINYINT(1) NULL,
      verification_status VARCHAR(16) NULL,
      verification_error TEXT NULL,
      resolved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(
    `ALTER TABLE scheduled_results MODIFY COLUMN status VARCHAR(16) NOT NULL`,
  );
  await pool.query(`UPDATE scheduled_results SET status = 'failed', final_url = NULL,
    error_message = COALESCE(NULLIF(error_message, ''), 'Browser returned an invalid final destination.')
    WHERE (status = 'resolved' OR final_url IS NOT NULL)
      AND (final_url IS NULL OR TRIM(final_url) = '' OR final_url = 'about:blank' OR final_url LIKE 'chrome-error://%' OR final_url NOT REGEXP '^https?://')`);
  try {
    const [resultColumns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scheduled_results'`,
      [process.env.MYSQL_DB],
    );
    const existingResultColumns = new Set(
      resultColumns.map((column) => column.COLUMN_NAME),
    );
    const resultAdditions = {
      redirect_chain: "JSON NULL",
      actual_country: "VARCHAR(10) NULL",
      actual_country_name: "VARCHAR(100) NULL",
      proxy_ip: "VARCHAR(64) NULL",
      region_match: "TINYINT(1) NULL",
      verification_status: "VARCHAR(16) NULL",
      verification_error: "TEXT NULL",
    };
    for (const [column, definition] of Object.entries(resultAdditions)) {
      if (!existingResultColumns.has(column))
        await pool.query(
          `ALTER TABLE scheduled_results ADD COLUMN ${column} ${definition}`,
        );
    }
    const [rowIndexCols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scheduled_results' AND COLUMN_NAME = 'row_index'`,
      [process.env.MYSQL_DB],
    );
    if (!rowIndexCols.length)
      await pool.query(
        `ALTER TABLE scheduled_results ADD COLUMN row_index INT NULL`,
      );
    const [rowIndexes] = await pool.query(
      `SHOW INDEX FROM scheduled_results WHERE Key_name = 'unique_job_row'`,
    );
    if (!rowIndexes.length)
      await pool.query(
        `ALTER TABLE scheduled_results ADD UNIQUE KEY unique_job_row (job_id, row_index)`,
      );
  } catch (err) {
    console.error(
      "[ensureSchema] Failed to add scheduled result row indexes:",
      err.message,
    );
    throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resolution_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      region VARCHAR(10) UNIQUE NOT NULL,
      success_count INT NOT NULL DEFAULT 0,
      failure_count INT NOT NULL DEFAULT 0,
      last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resolution_attempts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(64) NOT NULL,
      job_id INT NULL,
      user_id INT NULL,
      original_url TEXT NOT NULL,
      final_url TEXT NULL,
      redirect_chain JSON NULL,
      region VARCHAR(10) NOT NULL,
      status VARCHAR(16) NOT NULL,
      failure_reason TEXT NULL,
      duration_ms INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_attempts_created (created_at),
      INDEX idx_attempts_region_created (region, created_at),
      INDEX idx_attempts_status_created (status, created_at),
      INDEX idx_attempts_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [attemptColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'resolution_attempts'`,
    [process.env.MYSQL_DB],
  );
  if (
    !attemptColumns.some((column) => column.COLUMN_NAME === "redirect_chain")
  ) {
    await pool.query(
      "ALTER TABLE resolution_attempts ADD COLUMN redirect_chain JSON NULL AFTER final_url",
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_resolution_batches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      total_urls INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_campaign_batches_user_status (user_id, status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_resolution_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      batch_id BIGINT NOT NULL,
      row_index INT NOT NULL,
      original_url TEXT NOT NULL,
      tags TEXT NULL,
      country VARCHAR(10) NOT NULL DEFAULT 'US',
      ua_type VARCHAR(16) NOT NULL DEFAULT 'random',
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      final_url TEXT NULL,
      redirect_chain JSON NULL,
      actual_country VARCHAR(10) NULL,
      actual_country_name VARCHAR(100) NULL,
      proxy_ip VARCHAR(64) NULL,
      region_match TINYINT(1) NULL,
      verification_status VARCHAR(16) NULL,
      verification_error TEXT NULL,
      failure_reason TEXT NULL,
      request_id VARCHAR(64) NULL,
      duration_ms INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      FOREIGN KEY (batch_id) REFERENCES campaign_resolution_batches(id) ON DELETE CASCADE,
      UNIQUE KEY unique_campaign_batch_row (batch_id, row_index),
      INDEX idx_campaign_items_status (batch_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Resume imports interrupted by a server restart from the last completed item.
  await pool.query(
    `UPDATE campaign_resolution_items SET status = 'pending' WHERE status = 'processing'`,
  );
  await pool.query(
    `UPDATE campaign_resolution_batches SET status = 'queued', started_at = NULL WHERE status = 'processing'`,
  );

  await pool.query(`INSERT INTO resolution_attempts (request_id, job_id, user_id, original_url, final_url, region, status, failure_reason, created_at)
    SELECT CONCAT('legacy-result-', r.id), r.job_id, j.user_id, r.original_url, NULL, COALESCE(NULLIF(r.country, ''), 'US'), 'failed',
      COALESCE(NULLIF(r.error_message, ''), 'Previously recorded resolution failure.'), r.resolved_at
    FROM scheduled_results r JOIN scheduled_jobs j ON j.id = r.job_id
    WHERE r.status IN ('failed', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM resolution_attempts a WHERE a.request_id = CONCAT('legacy-result-', r.id))`);

  // Ensure at least one admin if env provided
  // const [rows] = await pool.query('SELECT COUNT(*) as c FROM users');
  // if (rows[0].c === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
  //   await pool.query(
  //     'INSERT INTO users (name, username, email, password_hash, role, approved) VALUES (?,?,?,?,?,1)',
  //     [process.env.ADMIN_NAME || 'Admin', process.env.ADMIN_USERNAME, process.env.ADMIN_EMAIL || null, process.env.ADMIN_PASSWORD_HASH, 'Admin']
  //   );
  // }

  // New Code to Ensure at least one admin if env provided
  const [rows] = await pool.query("SELECT COUNT(*) as c FROM users");
  if (
    rows[0].c === 0 &&
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD_HASH
  ) {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    await pool.query(
      "INSERT INTO users (name, username, email, password_hash, role, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        process.env.ADMIN_NAME || "Admin",
        process.env.ADMIN_USERNAME,
        process.env.ADMIN_EMAIL || null,
        process.env.ADMIN_PASSWORD_HASH,
        "Admin",
        1,
        now,
      ],
    );
  }
}