const { pool } = require('../config/db');
const crypto = require('crypto');

async function create({ orgId, name, description, createdBy }) {
  const apiKey = crypto.randomBytes(24).toString('hex');
  const [result] = await pool.query(
    `INSERT INTO projects (org_id, name, description, api_key, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [orgId, name, description || null, apiKey, createdBy]
  );
  return getById(result.insertId, orgId);
}

async function listByOrg(orgId, { limit = 50, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT p.*,
            (SELECT COUNT(*) FROM queues q WHERE q.project_id = p.id) AS queue_count
     FROM projects p WHERE p.org_id = ?
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [orgId, Number(limit), Number(offset)]
  );
  return rows;
}

async function getById(id, orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM projects WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );
  return rows[0] || null;
}

async function update(id, orgId, { name, description }) {
  await pool.query(
    'UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ? AND org_id = ?',
    [name || null, description || null, id, orgId]
  );
  return getById(id, orgId);
}

async function remove(id, orgId) {
  const [result] = await pool.query('DELETE FROM projects WHERE id = ? AND org_id = ?', [id, orgId]);
  return result.affectedRows > 0;
}

module.exports = { create, listByOrg, getById, update, remove };
