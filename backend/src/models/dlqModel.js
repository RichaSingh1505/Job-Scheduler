const { pool } = require('../config/db');

async function list({ orgId, queueId, page = 1, pageSize = 25 }) {
  const conditions = ['p.org_id = ?'];
  const values = [orgId];
  if (queueId) { conditions.push('d.queue_id = ?'); values.push(queueId); }
  const where = conditions.join(' AND ');
  const offset = (Number(page) - 1) * Number(pageSize);

  const [rows] = await pool.query(
    `SELECT d.id, d.job_id, d.queue_id, d.last_execution_id, d.reason, d.ai_summary,
            d.failed_at, d.requeued_at, j.job_type, j.attempt_count, j.max_attempts
     FROM dead_letter_queue d
     JOIN queues q ON q.id = d.queue_id
     JOIN projects p ON p.id = q.project_id
     JOIN jobs j ON j.id = d.job_id
     WHERE ${where}
     ORDER BY d.failed_at DESC LIMIT ? OFFSET ?`,
    [...values, Number(pageSize), offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM dead_letter_queue d
     JOIN queues q ON q.id = d.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE ${where}`,
    values
  );
  return { rows, total, page: Number(page), pageSize: Number(pageSize) };
}

module.exports = { list };
