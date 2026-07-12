const logger = require('../utils/logger');

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(err.message, { stack: err.stack });
  }
  res.status(status).json({
    error: err.message || 'Internal server error',
    details: err.details || undefined
  });
}

module.exports = { ApiError, notFound, errorHandler };
