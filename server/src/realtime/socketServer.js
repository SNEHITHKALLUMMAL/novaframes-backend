import { Server } from 'socket.io';
import cookie from 'cookie';

import { env } from '../config/env.js';
import { verifyAccessToken } from '../services/token.service.js';
import { subscribeToJobEvents } from './jobEventsPubSub.js';
import { subscribeToSessionRevocations } from './sessionEventsPubSub.js';
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

  // PHASE_11: force-disconnect every open socket for a user whose
  // sessions were just bulk-revoked (logout-everywhere, or automatic
  // revocation after detected refresh-token reuse — see
  // auth.service.js and sessionEventsPubSub.js's comment for why this
  // is scoped to bulk revocation only, not single-device logout).
  // Disconnecting forces the client's socket.io-client to attempt a
  // reconnect, which re-runs authenticateSocket() against the current
  // (now-invalid, since tokenVersion changed) access token — if the
  // client hasn't refreshed since, the reconnect handshake itself fails
  // closed, same as any other expired-session request would.
  subscribeToSessionRevocations(({ userId }) => {
    io.in(`user:${userId}`).disconnectSockets(true);
    logger.info(`Disconnected all sockets for user ${userId} due to session revocation`);
  });

  logger.info('Socket.IO server initialized');
  return io;
}
