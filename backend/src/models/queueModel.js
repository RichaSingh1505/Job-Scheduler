const { pool } = require('../config/db');

async function create(projectId, data) {
  const {
    name, priority = 0, concurrencyLimit = 5, maxAttempts = 3,
    retryStrategy = 'exponential', retryBaseDelayMs = 5000, retryMaxDelayMs = 300000
  } = data;
  const [result] = await pool.query(
    `INSERT INTO queues (project_id, name, priority, concurrency_limit, max_attempts,
                          retry_strategy, retry_base_delay_ms, retry_max_delay_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, name, priority, concurrencyLimit, maxAttempts, retryStrategy, retryBaseDelayMs, retryMaxDelayMs]
  );
  return getById(result.insertId);
}

async function listByProject(projectId) {
  const [rows] = await pool.query(
    `SELECT q.*,
       (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'queued') AS queued_count,
       (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status IN ('claimed','running')) AS running_count,
       (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'completed') AS completed_count,
       (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'dead_letter') AS dead_letter_count
     FROM queues q WHERE q.project_id = ? ORDER BY q.priority DESC, q.created_at ASC`,
    [projectId]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM queues WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function belongsToOrg(queueId, orgId) {
  const [rows] = await pool.query(
    `SELECT q.* FROM queues q
     JOIN projects p ON p.id = q.project_id
     WHERE q.id = ? AND p.org_id = ? LIMIT 1`,
    [queueId, orgId]
  );
  return rows[0] || null;
}

async function update(id, fields) {
  const allowed = ['name', 'priority', 'concurrency_limit', 'max_attempts',
    'retry_strategy', 'retry_base_delay_ms', 'retry_max_delay_ms', 'is_paused'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getById(id);
  values.push(id);
  await pool.query(`UPDATE queues SET ${sets.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function setPaused(id, paused) {
  await pool.query('UPDATE queues SET is_paused = ? WHERE id = ?', [paused ? 1 : 0, id]);
  return getById(id);
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM queues WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function stats(id) {
  const [[counts]] = await pool.query(
    `SELECT
       SUM(status='queued') AS queued,
       SUM(status='scheduled') AS scheduled,
       SUM(status IN ('claimed','running')) AS in_progress,
       SUM(status='completed') AS completed,
       SUM(status='failed') AS failed,
       SUM(status='retrying') AS retrying,
       SUM(status='dead_letter') AS dead_letter,
       COUNT(*) AS total
     FROM jobs WHERE queue_id = ?`,
    [id]
  );
  const [[throughput]] = await pool.query(
    `SELECT COUNT(*) AS completed_last_hour FROM jobs
     WHERE queue_id = ? AND status = 'completed' AND completed_at >= (NOW() - INTERVAL 1 HOUR)`,
    [id]
  );
  return { ...counts, ...throughput };
}

module.exports = { create, listByProject, getById, belongsToOrg, update, setPaused, remove, stats };
