const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initIo(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' }
  });

  // Auth handshake: client sends { token } in `auth`, we scope them to an org room.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('missing token'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`org:${socket.user.orgId}`);
  });

  return io;
}

function getIo() {
  return io;
}

module.exports = { initIo, getIo };
