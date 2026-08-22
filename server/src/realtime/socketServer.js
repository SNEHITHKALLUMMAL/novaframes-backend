import { Server } from 'socket.io';
import cookie from 'cookie';

import { env } from '../config/env.js';
import { verifyAccessToken } from '../services/token.service.js';
import { subscribeToJobEvents } from './jobEventsPubSub.js';
import { logger } from '../utils/logger.js';

/**
 * Reuses the same access-token cookie the REST API already trusts
 * (services/token.service.js / middleware/auth.js) — no separate socket
 * auth scheme to maintain. A socket that fails this check never completes
 * its handshake; there's no unauthenticated fallback.
 */
function authenticateSocket(socket, next) {
  try {
    const rawCookie = socket.request.headers.cookie || '';
    const cookies = cookie.parse(rawCookie);
    const token = cookies.accessToken;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyAccessToken(token);
    socket.userId = payload.sub;
    next();
  } catch {
    next(new Error('Authentication required'));
  }
}

/**
 * Every connected socket joins a room named after its user ID, so pushing
 * an update to "everyone who cares about this job" is just "everyone
 * connected as this job's owner" — a user can have the app open in
 * multiple tabs/devices and all of them get the update.
 */
export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.frontendUrl, credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    logger.debug('Socket connected', { userId: socket.userId, socketId: socket.id });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { userId: socket.userId, socketId: socket.id });
    });
  });

  subscribeToJobEvents((event) => {
    io.to(`user:${event.ownerId}`).emit('job:update', event);
  });

  logger.info('Socket.IO server initialized');
  return io;
}
