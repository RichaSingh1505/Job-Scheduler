const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a job. Supports immediate, delayed, scheduled, and batch creation.
 * `runAt` defaults to now (immediate). Pass a future ISO date for delayed/scheduled.
 */
async function create(queueId, queueDefaults, data) {
  const {
    jobType, payload = null, priority = 0, runAt = null,
    maxAttempts, retryStrategy, retryBaseDelayMs, idempotencyKey = null, batchId = null,
    dependsOn = []
  } = data;

  const status = runAt && new Date(runAt) > new Date() ? 'scheduled' : 'queued';

  const [result] = await pool.query(
    `INSERT INTO jobs (queue_id, job_type, payload, priority, status, run_at,
                        max_attempts, retry_strategy, retry_base_delay_ms,
                        idempotency_key, batch_id)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      queueId, jobType, payload ? JSON.stringify(payload) : null, priority, status, runAt,
      maxAttempts ?? queueDefaults.max_attempts,
      retryStrategy ?? queueDefaults.retry_strategy,
      retryBaseDelayMs ?? queueDefaults.retry_base_delay_ms,
      idempotencyKey, batchId
    ]
  );

  const jobId = result.insertId;

  if (Array.isArray(dependsOn) && dependsOn.length > 0) {
    const values = dependsOn
      .filter((depId) => Number(depId) !== Number(jobId))
      .map((depId) => [jobId, depId]);
    if (values.length > 0) {
      await pool.query(
        `INSERT IGNORE INTO job_dependencies (job_id, depends_on_job_id) VALUES ?`,
        [values]
      );
    }
  }

  return getById(jobId);
}

async function dependencies(jobId) {
  const [rows] = await pool.query(
    `SELECT jd.depends_on_job_id AS job_id, j.status, j.job_type
     FROM job_dependencies jd
     JOIN jobs j ON j.id = jd.depends_on_job_id
     WHERE jd.job_id = ?`,
    [jobId]
  );
  return rows;
}

async function createBatch(queueId, queueDefaults, jobs) {
  const batchId = uuidv4();
  const created = [];
  for (const jobData of jobs) {
    created.push(await create(queueId, queueDefaults, { ...jobData, batchId }));
  }
  return { batchId, jobs: created };
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function belongsToOrg(jobId, orgId) {
  const [rows] = await pool.query(
    `SELECT j.* FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE j.id = ? AND p.org_id = ? LIMIT 1`,
    [jobId, orgId]
  );
  return rows[0] || null;
}

async function list({ orgId, queueId, status, jobType, batchId, page = 1, pageSize = 25 }) {
  const conditions = ['p.org_id = ?'];
  const values = [orgId];
  if (queueId) { conditions.push('j.queue_id = ?'); values.push(queueId); }
  if (status) { conditions.push('j.status = ?'); values.push(status); }
  if (jobType) { conditions.push('j.job_type = ?'); values.push(jobType); }
  if (batchId) { conditions.push('j.batch_id = ?'); values.push(batchId); }

  const where = conditions.join(' AND ');
  const offset = (Number(page) - 1) * Number(pageSize);

  const [rows] = await pool.query(
    `SELECT j.* FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE ${where}
     ORDER BY j.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, Number(pageSize), offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE ${where}`,
    values
  );

  return { rows, total, page: Number(page), pageSize: Number(pageSize) };
}

async function retry(id) {
  await pool.query(
    `UPDATE jobs SET status = 'queued', run_at = NOW(), last_error = NULL
     WHERE id = ? AND status IN ('failed','dead_letter')`,
    [id]
  );
  await pool.query('DELETE FROM dead_letter_queue WHERE job_id = ?', [id]);
  return getById(id);
}

async function cancel(id) {
  await pool.query(
    `UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status IN ('queued','scheduled','retrying')`,
    [id]
  );
  return getById(id);
}

async function executions(jobId) {
  const [rows] = await pool.query(
    'SELECT * FROM job_executions WHERE job_id = ? ORDER BY attempt_number ASC',
    [jobId]
  );
  return rows;
}

async function logs(jobId) {
  const [rows] = await pool.query(
    'SELECT * FROM job_logs WHERE job_id = ? ORDER BY created_at ASC',
    [jobId]
  );
  return rows;
}

module.exports = { create, createBatch, getById, belongsToOrg, list, retry, cancel, executions, logs, dependencies };
