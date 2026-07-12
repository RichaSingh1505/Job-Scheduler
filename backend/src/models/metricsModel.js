const { pool } = require('../config/db');

async function throughput(orgId, { hours = 24 } = {}) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(j.completed_at, '%Y-%m-%d %H:00:00') AS bucket,
            COUNT(*) AS completed,
            SUM(j.status='failed') AS failed
     FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE p.org_id = ? AND j.completed_at >= (NOW() - INTERVAL ? HOUR)
     GROUP BY bucket ORDER BY bucket ASC`,
    [orgId, Number(hours)]
  );
  return rows;
}

async function systemHealth(orgId) {
  const [[jobCounts]] = await pool.query(
    `SELECT
       SUM(j.status='queued') AS queued,
       SUM(j.status IN ('claimed','running')) AS in_progress,
       SUM(j.status='dead_letter') AS dead_letter,
       SUM(j.status='retrying') AS retrying
     FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE p.org_id = ?`,
    [orgId]
  );
  const [[workerCounts]] = await pool.query(
    `SELECT SUM(status='busy') AS busy, SUM(status='idle') AS idle, SUM(status='offline') AS offline
     FROM workers`
  );
  const [[avgDuration]] = await pool.query(
    `SELECT AVG(duration_ms) AS avg_duration_ms FROM job_executions
     WHERE status='completed' AND started_at >= (NOW() - INTERVAL 1 HOUR)`
  );
  return { jobs: jobCounts, workers: workerCounts, avg_duration_ms: avgDuration.avg_duration_ms };
}

module.exports = { throughput, systemHealth };
