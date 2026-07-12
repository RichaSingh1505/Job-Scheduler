const { pool } = require('../config/db');

async function createOrgAndOwner({ orgName, orgSlug, name, email, passwordHash }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orgResult] = await conn.query(
      'INSERT INTO organizations (name, slug) VALUES (?, ?)',
      [orgName, orgSlug]
    );
    const orgId = orgResult.insertId;
    const [userResult] = await conn.query(
      `INSERT INTO users (org_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'owner')`,
      [orgId, name, email, passwordHash]
    );
    await conn.commit();
    return { orgId, userId: userResult.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, org_id, name, email, role, is_active, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function inviteUser({ orgId, name, email, passwordHash, role }) {
  const [result] = await pool.query(
    `INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    [orgId, name, email, passwordHash, role || 'member']
  );
  return result.insertId;
}

module.exports = { createOrgAndOwner, findByEmail, findById, inviteUser };
