require('dotenv').config();
const os = require('os');
const crypto = require('crypto');
const { pool } = require('./config/db');
const { getHandler } = require('./handlers');
const { computeRetryDelayMs } = require('./retryStrategy');
const { summarizeFailure } = require('./services/aiSummary');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 1500;
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 5000;
const QUEUE_FILTER = (process.env.WORKER_QUEUES || '').split(',').map((s) => s.trim()).filter(Boolean);

const WORKER_UID = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

let workerId = null;
let pollTimer = null;
let heartbeatTimer = null;
let shuttingDown = false;
const activeJobs = new Map(); // jobId -> Promise

function log(level, message, meta = {}) {
  // Lightweight structured console logger (kept dependency-free for the worker's hot path).
  const line = { level, message, worker: WORKER_UID, time: new Date().toISOString(), ...meta };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(line));
}

// ---------------------------------------------------------------------
// Worker registration & heartbeats
// ---------------------------------------------------------------------
async function registerWorker() {
  const [result] = await pool.query(
    `INSERT INTO workers (worker_uid, hostname, pid, status, concurrency, queues, last_heartbeat_at)
     VALUES (?, ?, ?, 'idle', ?, ?, NOW())`,
    [WORKER_UID, os.hostname(), process.pid, CONCURRENCY, QUEUE_FILTER.join(',') || null]
  );
  workerId = result.insertId;
  log('info', `Worker registered`, { workerId, concurrency: CONCURRENCY });
}

async function sendHeartbeat() {
  const activeCount = activeJobs.size;
  const status = shuttingDown ? 'offline' : activeCount >= CONCURRENCY ? 'busy' : 'idle';
  const mem = process.memoryUsage().rss / (1024 * 1024);
  const load = os.loadavg()[0];

  await pool.query(
    `UPDATE workers SET status = ?, active_job_count = ?, last_heartbeat_at = NOW() WHERE id = ?`,
    [status, activeCount, workerId]
  );
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_id, active_jobs, cpu_load, memory_mb) VALUES (?, ?, ?, ?)`,
    [workerId, activeCount, load, mem]
  );
}

// ---------------------------------------------------------------------
// Atomic claim: SELECT ... FOR UPDATE SKIP LOCKED + UPDATE inside one
// transaction. SKIP LOCKED lets N worker processes poll concurrently
// without blocking on each other or double-claiming a row.
// ---------------------------------------------------------------------
async function claimJobs(limit) {
  if (limit <= 0) return [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const queueFilterSql = QUEUE_FILTER.length ? 'AND q.name IN (?)' : '';
    const params = [];
    if (QUEUE_FILTER.length) params.push(QUEUE_FILTER);
    params.push(limit);

    const [rows] = await conn.query(
      `SELECT j.id FROM jobs j
       JOIN queues q ON q.id = j.queue_id
       WHERE q.is_paused = 0
         AND j.status IN ('queued', 'retrying')
         AND j.run_at <= NOW()
         AND (
           SELECT COUNT(*) FROM jobs j2
           WHERE j2.queue_id = j.queue_id AND j2.status IN ('claimed', 'running')
         ) < q.concurrency_limit
         AND NOT EXISTS (
           SELECT 1 FROM job_dependencies jd
           JOIN jobs dep ON dep.id = jd.depends_on_job_id
           WHERE jd.job_id = j.id AND dep.status <> 'completed'
         )
         ${queueFilterSql}
       ORDER BY q.priority DESC, j.priority DESC, j.run_at ASC
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      params
    );

    if (rows.length === 0) {
      await conn.commit();
      return [];
    }

    const ids = rows.map((r) => r.id);
    await conn.query(
      `UPDATE jobs SET status = 'claimed', claimed_by = ?, claimed_at = NOW() WHERE id IN (?)`,
      [workerId, ids]
    );

    const [jobs] = await conn.query(`SELECT * FROM jobs WHERE id IN (?)`, [ids]);
    await conn.commit();
    return jobs;
  } catch (err) {
    await conn.rollback();
    log('error', 'claimJobs failed', { error: err.message });
    return [];
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
// Execute a single job (one attempt), then route to completed / retrying / DLQ.
// ---------------------------------------------------------------------
async function runJob(job) {
  const attemptNumber = job.attempt_count + 1;
  const startedAt = Date.now();

  await pool.query(
    `UPDATE jobs SET status = 'running', started_at = NOW(), attempt_count = ? WHERE id = ?`,
    [attemptNumber, job.id]
  );

  const [execResult] = await pool.query(
    `INSERT INTO job_executions (job_id, worker_id, attempt_number, status) VALUES (?, ?, ?, 'running')`,
    [job.id, workerId, attemptNumber]
  );
  const executionId = execResult.insertId;

  await writeLog(job.id, executionId, 'info', `Attempt ${attemptNumber} started on worker ${WORKER_UID}`);

  const payload = job.payload ? (typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload) : null;
  const handler = getHandler(job.job_type);

  try {
    const result = await handler(payload);
    const durationMs = Date.now() - startedAt;

    await pool.query(
      `UPDATE job_executions SET status='completed', finished_at=NOW(), duration_ms=?, result=? WHERE id=?`,
      [durationMs, result != null ? JSON.stringify(result) : null, executionId]
    );
    await pool.query(
      `UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=?`,
      [job.id]
    );
    await writeLog(job.id, executionId, 'info', `Attempt ${attemptNumber} completed in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err?.message || String(err);

    await pool.query(
      `UPDATE job_executions SET status='failed', finished_at=NOW(), duration_ms=?, error_message=? WHERE id=?`,
      [durationMs, errorMessage, executionId]
    );
    await writeLog(job.id, executionId, 'error', `Attempt ${attemptNumber} failed: ${errorMessage}`);

    if (attemptNumber >= job.max_attempts) {
      await moveToDeadLetter(job, executionId, errorMessage);
    } else {
      const delayMs = computeRetryDelayMs({
        strategy: job.retry_strategy,
        baseDelayMs: job.retry_base_delay_ms,
        attempt: attemptNumber
      });
      await pool.query(
        `UPDATE jobs SET status='retrying', run_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error=? WHERE id=?`,
        [delayMs / 1000, errorMessage, job.id]
      );
      await writeLog(job.id, executionId, 'warn', `Scheduling retry ${attemptNumber + 1}/${job.max_attempts} in ${delayMs}ms (${job.retry_strategy})`);
    }
  }
}

async function moveToDeadLetter(job, executionId, reason) {
  await pool.query(`UPDATE jobs SET status='dead_letter', last_error=? WHERE id=?`, [reason, job.id]);
  const [insertResult] = await pool.query(
    `INSERT INTO dead_letter_queue (job_id, queue_id, last_execution_id, reason, payload_snapshot)
     VALUES (?, ?, ?, ?, ?)`,
    [job.id, job.queue_id, executionId, reason, job.payload || null]
  );
  await writeLog(job.id, executionId, 'error', `Exhausted ${job.max_attempts} attempts — moved to Dead Letter Queue`);

  // Bonus feature: AI-generated failure summary (best-effort, no-op without ANTHROPIC_API_KEY).
  try {
    const [recentLogs] = await pool.query(
      `SELECT level, message FROM job_logs WHERE job_id = ? ORDER BY created_at DESC LIMIT 10`,
      [job.id]
    );
    const summary = await summarizeFailure({ jobType: job.job_type, errorMessage: reason, recentLogs: recentLogs.reverse() });
    if (summary) {
      await pool.query(`UPDATE dead_letter_queue SET ai_summary = ? WHERE id = ?`, [summary, insertResult.insertId]);
    }
  } catch (e) { /* best effort — never break the DLQ pipeline over a summary */ }
}

async function writeLog(jobId, executionId, level, message) {
  await pool.query(
    `INSERT INTO job_logs (job_id, execution_id, level, message) VALUES (?, ?, ?, ?)`,
    [jobId, executionId, level, message]
  );
}

// ---------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------
async function pollOnce() {
  if (shuttingDown) return;
  const available = CONCURRENCY - activeJobs.size;
  if (available <= 0) return;

  const jobs = await claimJobs(available);
  for (const job of jobs) {
    const promise = runJob(job)
      .catch((err) => log('error', 'Unhandled error running job', { jobId: job.id, error: err.message }))
      .finally(() => activeJobs.delete(job.id));
    activeJobs.set(job.id, promise);
  }
}

function startLoops() {
  pollTimer = setInterval(() => pollOnce().catch((e) => log('error', 'poll loop error', { error: e.message })), POLL_INTERVAL_MS);
  heartbeatTimer = setInterval(() => sendHeartbeat().catch((e) => log('error', 'heartbeat error', { error: e.message })), HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------------
// Graceful shutdown: stop claiming new work, let in-flight jobs finish
// (bounded by a timeout), mark worker offline, exit cleanly.
// ---------------------------------------------------------------------
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `Received ${signal}, draining ${activeJobs.size} active job(s) before exit...`);

  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);

  const DRAIN_TIMEOUT_MS = 30000;
  const timeout = new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS));
  await Promise.race([Promise.allSettled([...activeJobs.values()]), timeout]);

  try {
    await pool.query(`UPDATE workers SET status='offline', stopped_at=NOW() WHERE id=?`, [workerId]);
  } catch (e) { /* best effort */ }

  log('info', 'Worker shut down cleanly');
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  await registerWorker();
  await sendHeartbeat();
  startLoops();
  log('info', `Worker polling started (concurrency=${CONCURRENCY}, interval=${POLL_INTERVAL_MS}ms, queues=${QUEUE_FILTER.join(',') || 'ALL'})`);
}

main().catch((err) => {
  log('error', 'Worker failed to start', { error: err.message });
  process.exit(1);
});
