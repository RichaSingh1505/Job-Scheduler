const { pool } = require('../config/db');

async function list() {
  const [rows] = await pool.query(
    `SELECT * FROM workers ORDER BY
       CASE status WHEN 'busy' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END,
       last_heartbeat_at DESC`
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM workers WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function heartbeatHistory(id, limit = 50) {
  const [rows] = await pool.query(
    'SELECT * FROM worker_heartbeats WHERE worker_id = ? ORDER BY heartbeat_at DESC LIMIT ?',
    [id, Number(limit)]
  );
  return rows;
}

// Marks workers stale if no heartbeat for > 30s as offline (called periodically or lazily on read).
async function markStaleOffline(staleSeconds = 30) {
  await pool.query(
    `UPDATE workers SET status = 'offline'
     WHERE status != 'offline' AND last_heartbeat_at < (NOW() - INTERVAL ? SECOND)`,
    [staleSeconds]
  );
}

module.exports = { list, getById, heartbeatHistory, markStaleOffline };
