const projectModel = require('../models/projectModel');
const { ApiError } = require('../middleware/error');

async function list(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const projects = await projectModel.listByOrg(req.user.orgId, { limit, offset });
    res.json({ projects });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) throw new ApiError(400, 'name is required');
    const project = await projectModel.create({
      orgId: req.user.orgId, name, description, createdBy: req.user.id
    });
    res.status(201).json({ project });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const project = await projectModel.getById(req.params.id, req.user.orgId);
    if (!project) throw new ApiError(404, 'Project not found');
    res.json({ project });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const project = await projectModel.update(req.params.id, req.user.orgId, req.body);
    res.json({ project });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const ok = await projectModel.remove(req.params.id, req.user.orgId);
    if (!ok) throw new ApiError(404, 'Project not found');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, getOne, update, remove };
