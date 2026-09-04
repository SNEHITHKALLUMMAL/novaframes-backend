import { ApiError } from './ApiError.js';

/**
 * Central IDOR-prevention check, extracted from the identical pattern that
 * was previously copy-pasted in generation.service.js, video.service.js,
 * and project.service.js:
 *
 *   const doc = await Model.findById(id);
 *   if (!doc || !doc.owner.equals(userId)) throw ApiError.notFound(...);
 *
 * Deliberately returns 404 (not 403) on an ownership mismatch, same as the
 * original call sites — this avoids confirming a resource ID exists to a
 * user who doesn't own it.
 *
 * @param {import('mongoose').Document|null} doc
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} notFoundMessage
 * @returns {import('mongoose').Document} the same doc, for chaining
 */
export function assertOwned(doc, userId, notFoundMessage) {
  if (!doc || !doc.owner.equals(userId)) {
    throw ApiError.notFound(notFoundMessage);
  }
  return doc;
}
