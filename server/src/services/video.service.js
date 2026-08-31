import { Video } from '../models/Video.model.js';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { Project } from '../models/Project.model.js';
import { ApiError } from '../utils/ApiError.js';
import { assertOwned } from '../utils/ownership.js';
import { getStorageProvider } from './storage/index.js';

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
};

/**
 * Generates fresh, time-limited URLs at READ time rather than trusting
 * the stored fileUrl/thumbnailUrl fields — closes the gap flagged since
 * PHASE_07 (see docs/STORAGE.md's "known limitation"): those fields are
 * written once, at generation-completion time, from
 * storage.getUrl()'s return value, which for ObjectStorageProvider is
 * deliberately NOT a signed URL (a signed URL is time-limited and would
 * go stale if persisted — see PHASE_07's ObjectStorageProvider.js).
 * Concretely, for a private S3-compatible bucket with no
 * STORAGE_PUBLIC_BASE_URL configured, the stored fileUrl was never
 * actually fetchable at all, from the moment the video was created — not
 * "eventually stale", just non-functional. This is the fix.
 *
 * No-ops for LocalStorageProvider (getSignedReadUrl doesn't exist on it —
 * its stored fileUrl is already a real, directly-servable path, so
 * nothing needs regenerating).
 *
 * CALLER CONTRACT: only call this on a document AFTER any .save() has
 * already happened, and never call .save() again afterward — the signed
 * URL this attaches is for this one response only and must never be
 * persisted (mutating fileUrl in memory doesn't write it to MongoDB by
 * itself, but a subsequent .save() would).
 */
export async function attachSignedUrls(video) {
  const storage = getStorageProvider();
  if (typeof storage.getSignedReadUrl !== 'function') return video;

  const [fileUrl, thumbnailUrl] = await Promise.all([
    video.fileKey ? storage.getSignedReadUrl(video.fileKey) : null,
    video.thumbnailKey ? storage.getSignedReadUrl(video.thumbnailKey) : null,
  ]);
  if (fileUrl) video.fileUrl = fileUrl;
  if (thumbnailUrl) video.thumbnailUrl = thumbnailUrl;
  return video;
}

export async function listVideos(userId, { search, type, status, projectId, sort, page, limit }) {
  const filter = { owner: userId };
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (projectId === 'none') filter.project = null;
  else if (projectId) filter.project = projectId;
  if (search) filter.$text = { $search: search };

  const [videos, total] = await Promise.all([
    Video.find(filter)
      .sort(SORT_MAP[sort] ?? SORT_MAP.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('project', 'name')
      .lean(), // read-only list — skip Mongoose document hydration overhead
    Video.countDocuments(filter),
  ]);

  // .lean() results are plain objects, never Mongoose documents — no risk
  // of an accidental .save() persisting these ephemeral signed URLs.
  await Promise.all(videos.map((video) => attachSignedUrls(video)));

  return { videos, total, page, limit };
}

export async function getOwnedVideo(userId, videoId) {
  const video = await Video.findById(videoId).populate('project', 'name');
  return assertOwned(video, userId, 'Video not found');
}

/**
 * For the GET /videos/:id read path specifically — getOwnedVideo() itself
 * stays signed-URL-free since renameVideo/assignVideoProject/deleteVideo
 * also call it internally and then .save() the result; attaching a signed
 * URL before a save() risks persisting it (see attachSignedUrls' contract
 * above). This wrapper is the one intended for direct client responses.
 */
export async function getOwnedVideoForDisplay(userId, videoId) {
  const video = await getOwnedVideo(userId, videoId);
  return attachSignedUrls(video);
}

export async function renameVideo(userId, videoId, title) {
  const video = await getOwnedVideo(userId, videoId);
  video.title = title;
  await video.save();
  return attachSignedUrls(video);
}

export async function assignVideoProject(userId, videoId, projectId) {
  const video = await getOwnedVideo(userId, videoId);

  if (projectId) {
    assertOwned(await Project.findById(projectId), userId, 'Project not found');
  }

  video.project = projectId || null;
  await video.save();
  return attachSignedUrls(video);
}

export async function deleteVideo(userId, videoId) {
  const video = await getOwnedVideo(userId, videoId);
  return deleteVideoRecord(video);
}

/**
 * Admin/moderation delete — bypasses ownership entirely (an admin needs to
 * be able to remove any video, e.g. for content moderation). Shares the
 * same real storage-cleanup logic as the owner-initiated delete above,
 * rather than duplicating it.
 */
export async function adminDeleteVideo(videoId) {
  const video = await Video.findById(videoId);
  if (!video) throw ApiError.notFound('Video not found');
  return deleteVideoRecord(video);
}

async function deleteVideoRecord(video) {
  const storage = getStorageProvider();

  // Best-effort real file cleanup — if storage deletion fails (e.g. file
  // already gone), the database record is still removed rather than
  // leaving an orphaned, undeletable-looking entry in the user's library.
  await Promise.allSettled([
    video.fileKey ? storage.delete(video.fileKey) : Promise.resolve(),
    video.thumbnailKey ? storage.delete(video.thumbnailKey) : Promise.resolve(),
  ]);

  await Video.deleteOne({ _id: video._id });
  // The GenerationJob that produced this video still records the
  // generation happened (history) — just clear the now-dangling reference.
  await GenerationJob.updateOne({ outputVideo: video._id }, { $set: { outputVideo: null } });

  return { deleted: true };
}
