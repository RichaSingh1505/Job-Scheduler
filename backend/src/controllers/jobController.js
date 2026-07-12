const jobModel = require('../models/jobModel');
const queueModel = require('../models/queueModel');
const { ApiError } = require('../middleware/error');
const { getIo } = require('../sockets/io');

// POST /api/queues/:queueId/jobs
// body: { jobType, payload, priority, runAt, maxAttempts, retryStrategy, retryBaseDelayMs, idempotencyKey }
//   - immediate job: omit runAt
//   - delayed job: runAt = now + N minutes
//   - scheduled job: runAt = a specific future timestamp
//   (recurring/cron jobs are created via /api/queues/:queueId/scheduled-jobs, see scheduledJobController)
async function create(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.queueId, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    if (!req.body.jobType) throw new ApiError(400, 'jobType is required');

    const job = await jobModel.create(queue.id, queue, req.body);
    getIo()?.to(`org:${req.user.orgId}`).emit('job:created', job);
    res.status(201).json({ job });
  } catch (err) { next(err); }
}

// POST /api/queues/:queueId/jobs/batch
// body: { jobs: [{ jobType, payload, priority, runAt }, ...] }
async function createBatch(req, res, next) {
  try {
    const queue = await queueModel.belongsToOrg(req.params.queueId, req.user.orgId);
    if (!queue) throw new ApiError(404, 'Queue not found');
    const { jobs } = req.body;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw new ApiError(400, 'jobs must be a non-empty array');
    }
    const result = await jobModel.createBatch(queue.id, queue, jobs);
    getIo()?.to(`org:${req.user.orgId}`).emit('job:batch_created', { batchId: result.batchId, count: result.jobs.length });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { queueId, status, jobType, batchId, page = 1, pageSize = 25 } = req.query;
    const result = await jobModel.list({ orgId: req.user.orgId, queueId, status, jobType, batchId, page, pageSize });
    res.json(result);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    res.json({ job });
  } catch (err) { next(err); }
}

async function retry(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const updated = await jobModel.retry(req.params.id);
    getIo()?.to(`org:${req.user.orgId}`).emit('job:updated', updated);
    res.json({ job: updated });
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const updated = await jobModel.cancel(req.params.id);
    getIo()?.to(`org:${req.user.orgId}`).emit('job:updated', updated);
    res.json({ job: updated });
  } catch (err) { next(err); }
}

async function getExecutions(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const executions = await jobModel.executions(req.params.id);
    res.json({ executions });
  } catch (err) { next(err); }
}

async function getLogs(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const logs = await jobModel.logs(req.params.id);
    res.json({ logs });
  } catch (err) { next(err); }
}

async function getDependencies(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.id, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const dependencies = await jobModel.dependencies(req.params.id);
    res.json({ dependencies });
  } catch (err) { next(err); }
}

module.exports = { create, createBatch, list, getOne, retry, cancel, getExecutions, getLogs, getDependencies };
