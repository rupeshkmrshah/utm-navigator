// db-monthly-wipe.js
import cron from 'node-cron';
import 'dotenv/config';
import { getDbPool } from './src/db.js';

const TABLES_TO_WIPE = [
  'activity_logs',
  'resolution_stats',
  'sessions',
];

const TIMEZONE = process.env.WIPE_TIMEZONE || 'Asia/Kolkata';
const WIPE_ENABLED = String(process.env.DB_WIPE_ENABLED).toLowerCase() === 'true';
const DRY_RUN = String(process.env.WIPE_DRY_RUN).toLowerCase() === 'true';
const FORCE_WIPE = String(process.env.FORCE_WIPE).toLowerCase() === 'true';
// Optional: if set, only wipe this single table (helpful for iterative testing)
const WIPE_ONLY_TABLE = process.env.WIPE_ONLY_TABLE || '';

const DEFAULT_HOUR = 23;
const DEFAULT_MINUTE = 59;

function parseEnvInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) {
    console.warn(
      `[Monthly Wipe] Invalid ${name}="${raw}". Falling back to ${fallback}. Must be integer between ${min} and ${max}.`
    );
    return fallback;
  }
  return v;
}

const WIPE_HOUR = parseEnvInt('WIPE_HOUR', DEFAULT_HOUR, 0, 23);
const WIPE_MINUTE = parseEnvInt('WIPE_MINUTE', DEFAULT_MINUTE, 0, 59);

function getYMDInTimeZone(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function isLastDayOfMonth() {
  const { year, month, day } = getYMDInTimeZone(TIMEZONE);
  const lastDay = new Date(year, month, 0).getDate();
  return day === lastDay;
}

function zonedMidnightUtc(year, month, day, timeZone) {
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += Date.UTC(year, month - 1, day, 0, 0, 0) - representedAsUtc;
  }
  return new Date(guess);
}

function nextMonthStartUtc() {
  const { year, month } = getYMDInTimeZone(TIMEZONE);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return zonedMidnightUtc(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1, TIMEZONE);
}

/**
 * Exported for manual testing/imports
 */
export async function performMonthlyWipe() {
  if (!WIPE_ENABLED) {
    console.log('[Monthly Wipe] Disabled (set DB_WIPE_ENABLED=true). Skipping.');
    return;
  }

  if (!isLastDayOfMonth() && !FORCE_WIPE) {
    console.log('[Monthly Wipe] Not the last day of the month. Skipping wipe.');
    return;
  }

  console.log(
    `[Monthly Wipe] Starting monthly database wipe (tz=${TIMEZONE}) at ${String(WIPE_HOUR).padStart(2, '0')}:${String(
      WIPE_MINUTE
    ).padStart(2, '0')} — DRY_RUN=${DRY_RUN} — FORCE_WIPE=${FORCE_WIPE}`
  );

  const pool = getDbPool();
  if (!pool || typeof pool.query !== 'function') {
    console.error('[Monthly Wipe] getDbPool() must return a pool with a .query(...) Promise API.');
    return;
  }

  // A table override can select ordinary wipe tables or the retention-aware scheduled job cleanup.
  const tables = WIPE_ONLY_TABLE ? [WIPE_ONLY_TABLE] : TABLES_TO_WIPE;
  const safeTables = new Set([...TABLES_TO_WIPE, 'scheduled_jobs', 'scheduled_results']);
  if (tables.some(table => !safeTables.has(table))) {
    console.error('[Monthly Wipe] Refusing unknown WIPE_ONLY_TABLE value.');
    return;
  }

  try {
    console.log('[Monthly Wipe] Will process tables:', tables.join(', '));
    if (DRY_RUN) {
      console.log('[Monthly Wipe] DRY_RUN enabled — no truncation will be performed.');
      // Optionally, you can test DB connectivity by running a harmless query:
      await pool.query('SELECT 1');
      if (!WIPE_ONLY_TABLE || tables.includes('scheduled_jobs') || tables.includes('scheduled_results')) {
        const cutoff = nextMonthStartUtc();
        const [rows] = await pool.query(`SELECT
          SUM(scheduled_at >= ? OR status IN ('pending','processing','paused')) AS retained,
          SUM(scheduled_at < ? AND status IN ('completed','partially_completed','failed','cancelled')) AS purgeable
          FROM scheduled_jobs`, [cutoff, cutoff]);
        console.log(`[Monthly Wipe] Scheduled jobs: ${rows[0]?.retained || 0} future or active jobs retained; ${rows[0]?.purgeable || 0} old terminal jobs eligible for cleanup.`);
      }
      console.log('[Monthly Wipe] DB connectivity OK (dry-run).');
      return;
    }

    for (const table of tables) {
      if (table === 'scheduled_jobs' || table === 'scheduled_results') continue;
      console.log(`[Monthly Wipe] Truncating ${table}...`);
      await pool.query(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`[Monthly Wipe] Truncated ${table}.`);
    }

    if (!WIPE_ONLY_TABLE || WIPE_ONLY_TABLE === 'scheduled_jobs' || WIPE_ONLY_TABLE === 'scheduled_results') {
      const cutoff = nextMonthStartUtc();
      const [counts] = await pool.query(`SELECT COUNT(*) AS retained FROM scheduled_jobs WHERE scheduled_at >= ? OR status IN ('pending','processing','paused')`, [cutoff]);
      const [deleted] = await pool.query(`DELETE FROM scheduled_jobs WHERE scheduled_at < ? AND status IN ('completed','partially_completed','failed','cancelled')`, [cutoff]);
      console.log(`[Monthly Wipe] Scheduled-job retention: retained ${counts[0]?.retained || 0} future or active jobs; deleted ${deleted.affectedRows} terminal jobs scheduled before ${cutoff.toISOString()}.`);
      const [attemptsTable] = await pool.query(`SHOW TABLES LIKE 'resolution_attempts'`);
      if (attemptsTable.length) {
        const [pruned] = await pool.query(`DELETE FROM resolution_attempts WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 DAY)`);
        console.log(`[Monthly Wipe] Removed ${pruned.affectedRows} resolution-attempt records older than 31 days.`);
      }
    }

    console.log('[Monthly Wipe] Database wipe completed successfully.');
  } catch (err) {
    console.error('[Monthly Wipe] Error during database wipe:', err);
  }
}

// Build cron expression
const cronExpr = `${WIPE_MINUTE} ${WIPE_HOUR} * * *`;

// Schedule job
cron.schedule(cronExpr, () => {
  // call but don't await in scheduler
  performMonthlyWipe().catch((err) => console.error('[Monthly Wipe] Scheduler error:', err));
}, { timezone: TIMEZONE });

console.log(
  `[Monthly Wipe] Scheduled to check daily at ${String(WIPE_HOUR).padStart(2, '0')}:${String(
    WIPE_MINUTE
  ).padStart(2, '0')} ${TIMEZONE}. (Will only truncate on the last day unless FORCE_WIPE=true)`
);

// Manual-run helper: RUN_NOW env triggers a single-run immediately (useful for testing)
if (String(process.env.RUN_NOW).toLowerCase() === 'true') {
  console.log('[Monthly Wipe] RUN_NOW=true — executing wipe now (manual test).');
  performMonthlyWipe().then(() => {
    console.log('[Monthly Wipe] Manual run finished.');
    // exit only if this was intended as a one-off test process
    if (process.env.EXIT_AFTER_RUN === 'true') process.exit(0);
  }).catch(err => {
    console.error('[Monthly Wipe] Manual run error:', err);
    if (process.env.EXIT_AFTER_RUN === 'true') process.exit(1);
  });
}

process.on('SIGINT', () => {
  console.log('[Monthly Wipe] Script stopped (SIGINT).');
  process.exit(0);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Monthly Wipe] Unhandled Rejection:', reason);
});