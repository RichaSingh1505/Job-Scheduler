require('dotenv').config();
const mysql = require('mysql2/promise');
const cronParser = require('cron-parser');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'job_scheduler',
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true
});

const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS) || 10000;

function log(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ service: 'scheduler', message, time: new Date().toISOString(), ...meta }));
}

/**
 * Runs once per tick. Uses SELECT ... FOR UPDATE SKIP LOCKED so that if this
 * service is ever scaled to multiple instances for high availability, they
 * don't double-promote the same due cron definition.
 */
async function promoteDueSchedules() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [due] = await conn.query(
      `SELECT * FROM scheduled_jobs
       WHERE is_active = 1 AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED`
    );

    for (const sched of due) {
      const [[queue]] = await conn.query('SELECT * FROM queues WHERE id = ?', [sched.queue_id]);
      if (!queue || queue.is_paused) {
        // Still advance next_run_at so a paused queue doesn't cause a backlog storm on resume.
      } else {
        await conn.query(
          `INSERT INTO jobs (queue_id, scheduled_job_id, job_type, payload, status, run_at,
                              max_attempts, retry_strategy, retry_base_delay_ms)
           VALUES (?, ?, ?, ?, 'queued', NOW(), ?, ?, ?)`,
          [
            sched.queue_id, sched.id, sched.job_type, sched.payload,
            queue.max_attempts, queue.retry_strategy, queue.retry_base_delay_ms
          ]
        );
      }

      const next = cronParser.parseExpression(sched.cron_expression, { currentDate: new Date() }).next().toDate();
      await conn.query(
        `UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = ? WHERE id = ?`,
        [next, sched.id]
      );
      log('Promoted scheduled job', { scheduledJobId: sched.id, name: sched.name, nextRunAt: next });
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    log('Error promoting schedules', { error: err.message });
  } finally {
    conn.release();
  }
}

function start() {
  log(`Scheduler started, checking every ${CHECK_INTERVAL_MS}ms`);
  setInterval(() => promoteDueSchedules().catch((e) => log('tick error', { error: e.message })), CHECK_INTERVAL_MS);
  promoteDueSchedules().catch((e) => log('initial tick error', { error: e.message }));
}

process.on('SIGINT', async () => { await pool.end(); process.exit(0); });
process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });

start();
