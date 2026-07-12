const workerModel = require('../models/workerModel');
const { ApiError } = require('../middleware/error');

async function list(req, res, next) {
  try {
    await workerModel.markStaleOffline();
    const workers = await workerModel.list();
    res.json({ workers });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const worker = await workerModel.getById(req.params.id);
    if (!worker) throw new ApiError(404, 'Worker not found');
    const heartbeats = await workerModel.heartbeatHistory(req.params.id);
    res.json({ worker, heartbeats });
  } catch (err) { next(err); }
}

module.exports = { list, getOne };
