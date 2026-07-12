const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { ApiError } = require('../middleware/error');

function sign(user) {
  return jwt.sign(
    { id: user.id, orgId: user.org_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

async function register(req, res, next) {
  try {
    const { orgName, name, email, password } = req.body;
    if (!orgName || !name || !email || !password) {
      throw new ApiError(400, 'orgName, name, email, password are required');
    }
    const existing = await userModel.findByEmail(email);
    if (existing) throw new ApiError(409, 'Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

    const { orgId, userId } = await userModel.createOrgAndOwner({
      orgName, orgSlug, name, email, passwordHash
    });
    const user = await userModel.findById(userId);
    const token = sign({ ...user, org_id: orgId });
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, 'email and password are required');

    const user = await userModel.findByEmail(email);
    if (!user || !user.is_active) throw new ApiError(401, 'Invalid credentials');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid credentials');

    const token = sign(user);
    delete user.password_hash;
    res.json({ token, user });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ user });
  } catch (err) { next(err); }
}

module.exports = { register, login, me };
