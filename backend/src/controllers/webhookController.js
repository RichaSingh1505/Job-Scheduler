const { pool } = require('../config/db');
const jobModel = require('../models/jobModel');
const { ApiError } = require('../middleware/error');
const { getIo } = require('../sockets/io');

/**
 * Event-driven job creation: external systems (webhooks from Stripe,
 * GitHub, an internal event bus, etc.) POST here using a project's
 * `api_key` instead of a user JWT. This lets jobs be triggered directly
 * by events rather than only by an authenticated dashboard user hitting
 * the standard /queues/:queueId/jobs route.
 *
 * POST /api/webhooks/:apiKey/trigger
 * body: { queueName, jobType, payload, priority }
 */
async function trigger(req, res, next) {
  try {
    const { apiKey } = req.params;
    const { queueName, jobType, payload, priority } = req.body;

    if (!queueName || !jobType) {
      throw new ApiError(400, 'queueName and jobType are required');
    }

    const [[project]] = await pool.query('SELECT * FROM projects WHERE api_key = ? LIMIT 1', [apiKey]);
    if (!project) throw new ApiError(401, 'Invalid API key');

    const [[queue]] = await pool.query(
      'SELECT * FROM queues WHERE project_id = ? AND name = ? LIMIT 1',
      [project.id, queueName]
    );
    if (!queue) throw new ApiError(404, `Queue "${queueName}" not found in this project`);

    const job = await jobModel.create(queue.id, queue, { jobType, payload, priority });
    getIo()?.to(`org:${project.org_id}`).emit('job:created', job);

    res.status(201).json({ job });
  } catch (err) { next(err); }
}

module.exports = { trigger };
