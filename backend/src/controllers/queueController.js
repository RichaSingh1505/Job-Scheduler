const queueModel = require('../models/queueModel');
const projectModel = require('../models/projectModel');
const { ApiError } = require('../middleware/error');

async function create(req, res, next) {
  try {
    const project = await projectModel.getById(req.params.projectId, req.user.orgId);
    if (!project) throw new ApiError(404, 'Project not found');
    if (!req.body.name) throw new ApiError(400, 'name is required');
    const queue = await queueModel.create(project.id, req.body);
    res.status(201).json({ queue });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const project = await projectModel.getById(req.params.projectId, req.user.orgId);
    if (!project) throw new ApiError(404, 'Project not found');
    const queues = await queueModel.listByProject(project.id);
    res.json({ queues });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    res.json({ queue });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const updated = await queueModel.update(req.params.id, req.body);
    res.json({ queue: updated });
  } catch (err) { next(err); }
}

async function pause(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const updated = await queueModel.setPaused(req.params.id, true);
    res.json({ queue: updated });
  } catch (err) { next(err); }
}

async function resume(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const updated = await queueModel.setPaused(req.params.id, false);
    res.json({ queue: updated });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    await queueModel.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function getStats(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const stats = await queueModel.stats(req.params.id);
    res.json({ stats });
  } catch (err) { next(err); }
}

module.exports = { create, list, getOne, update, pause, resume, remove, getStats };
