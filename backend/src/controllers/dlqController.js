const dlqModel = require('../models/dlqModel');
const jobModel = require('../models/jobModel');
const { ApiError } = require('../middleware/error');
const { getIo } = require('../sockets/io');

async function list(req, res, next) {
  try {
    const { queueId, page, pageSize } = req.query;
    const result = await dlqModel.list({ orgId: req.user.orgId, queueId, page, pageSize });
    res.json(result);
  } catch (err) { next(err); }
}

// Requeue a job straight from the DLQ back into its queue.
async function requeue(req, res, next) {
  try {
    const job = await jobModel.belongsToOrg(req.params.jobId, req.user.orgId);
    if (!job) throw new ApiError(404, 'Job not found');
    const updated = await jobModel.retry(req.params.jobId);
    getIo()?.to(`org:${req.user.orgId}`).emit('job:updated', updated);
    res.json({ job: updated });
  } catch (err) { next(err); }
}

module.exports = { list, requeue };
