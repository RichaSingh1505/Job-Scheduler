const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, orgId, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Simple RBAC: viewer < member < admin < owner
const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

function requireRole(minRole) {
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user?.role] ?? -1;
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: `Requires role >= ${minRole}` });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
