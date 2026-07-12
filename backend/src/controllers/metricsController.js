const metricsModel = require('../models/metricsModel');

async function throughput(req, res, next) {
  try {
    const { hours } = req.query;
    const data = await metricsModel.throughput(req.user.orgId, { hours });
    res.json({ throughput: data });
  } catch (err) { next(err); }
}

async function health(req, res, next) {
  try {
    const data = await metricsModel.systemHealth(req.user.orgId);
    res.json({ health: data });
  } catch (err) { next(err); }
}

module.exports = { throughput, health };
