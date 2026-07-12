const mysql = require('mysql2/promise');
require('dotenv').config();

// A single shared pool. `SKIP LOCKED` (used by the worker service) requires
// InnoDB + at least READ COMMITTED isolation so we set that explicitly —
// MySQL's default REPEATABLE READ can cause queue pollers to see phantom
// "locked" rows and stall under concurrency.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'job_scheduler',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true
});

pool.on('connection', (conn) => {
  conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
});

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
