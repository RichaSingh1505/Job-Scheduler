const http = require('http');
require('dotenv').config();
const app = require('./app');
const { initIo } = require('./sockets/io');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
initIo(server);

server.listen(PORT, () => {
  logger.info(`API server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server');
  server.close(() => process.exit(0));
});
