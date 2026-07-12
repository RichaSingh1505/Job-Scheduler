const { pool } = require('../config/db');
const cronParser = require('cron-parser');

async function create(queueId, { name, jobType, cronExpression, payload }) {
  const next = cronParser.parseExpression(cronExpression).next().toDate();
  const [result] = await pool.query(
    `INSERT INTO scheduled_jobs (queue_id, name, job_type, cron_expression, payload, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [queueId, name, jobType, cronExpression, payload ? JSON.stringify(payload) : null, next]
  );
  return getById(result.insertId);
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM scheduled_jobs WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function listByQueue(queueId) {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_jobs WHERE queue_id = ? ORDER BY created_at DESC',
    [queueId]
  );
  return rows;
}

async function setActive(id, isActive) {
  await pool.query('UPDATE scheduled_jobs SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  return getById(id);
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM scheduled_jobs WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { create, getById, listByQueue, setActive, remove };
