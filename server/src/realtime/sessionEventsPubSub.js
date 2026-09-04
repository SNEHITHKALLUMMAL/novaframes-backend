import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const CHANNEL = 'session-revocation-events';

/**
 * Mirrors jobEventsPubSub.js's pattern for the same reason: auth.service.js
 * (where sessions are revoked) and socketServer.js (where sockets need to
 * be force-disconnected) don't otherwise share any reference to each
 * other, and shouldn't — Redis pub/sub is the same decoupling bridge
 * already used for job-status events.
 *
 * Closes a real gap found during the PHASE_11 realtime audit:
 * authenticateSocket() (socketServer.js) only checks the access token at
 * handshake time. PHASE_03's session revocation (logout-everywhere,
 * refresh-token-reuse detection) invalidates a user's ability to get a
 * NEW access token, but an already-open socket connection — authenticated
 * before the revocation — kept receiving job:update events until its
 * access token naturally expired (up to 15 minutes later), regardless of
 * the revocation.
 *
 * Deliberately only wired to the two "kick out everyone" cases
 * (logoutAllSessions, reuse-detection auto-revoke-all) — see
 * auth.service.js. NOT wired to a single-device logoutSession(), which
 * would force-disconnect every OTHER device's socket too; there's no
 * per-session identifier available at the socket layer to disconnect
 * selectively (the handshake only carries the access token, not a
 * session/jti — see socketServer.js's authenticateSocket). Selective
 * single-device socket revocation would need the handshake to also
 * verify a session identifier, a larger change than this phase's audit
 * scope justifies for a gap already bounded to a 15-minute access-token
 * TTL. Documented as a known remaining limit in docs/REALTIME.md.
 */

let publisherConnection = null;
let subscriberConnection = null;

function getPublisher() {
  publisherConnection ??= new Redis(env.redisUrl);
  return publisherConnection;
}

export async function publishAllSessionsRevoked(userId) {
  try {
    await getPublisher().publish(CHANNEL, JSON.stringify({ userId: userId.toString() }));
  } catch (err) {
    // Best-effort, same reasoning as publishJobStatus — a Redis publish
    // failure here must never break the actual logout/revocation flow,
    // which has already succeeded in the database by the time this runs.
    logger.warn('Failed to publish session revocation event', { error: err.message });
  }
}

export function subscribeToSessionRevocations(handler) {
  subscriberConnection ??= new Redis(env.redisUrl);
  subscriberConnection.subscribe(CHANNEL, (err) => {
    if (err) logger.error('Failed to subscribe to session revocation channel', { error: err.message });
  });
  subscriberConnection.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      handler(JSON.parse(message));
    } catch (err) {
      logger.warn('Failed to handle session revocation message', { error: err.message });
    }
  });
  return subscriberConnection;
}

export async function closeSessionEventsPubSub() {
  await Promise.all([publisherConnection?.quit(), subscriberConnection?.quit()].filter(Boolean));
  publisherConnection = null;
  subscriberConnection = null;
}
