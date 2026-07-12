const scheduledJobModel = require('../models/scheduledJobModel');
const queueModel = require('../models/queueModel');
const { ApiError } = require('../middleware/error');

async function create(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.queueId, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const { name, jobType, cronExpression, payload } = req.body;
    if (!name || !jobType || !cronExpression) {
      throw new ApiError(400, 'name, jobType, cronExpression are required');
    }
    const scheduledJob = await scheduledJobModel.create(queue.id, { name, jobType, cronExpression, payload });
    res.status(201).json({ scheduledJob });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.queueId, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const scheduledJobs = await scheduledJobModel.listByQueue(queue.id);
    res.json({ scheduledJobs });
  } catch (err) { next(err); }
}

async function toggle(req, res, next) {
  try {
    const { isActive } = req.body;
    const scheduledJob = await scheduledJobModel.setActive(req.params.id, isActive);
    res.json({ scheduledJob });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await scheduledJobModel.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { create, list, toggle, remove };
