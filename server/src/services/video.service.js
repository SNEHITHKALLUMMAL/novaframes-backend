import { Video } from '../models/Video.model.js';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { Project } from '../models/Project.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getStorageProvider } from './storage/index.js';

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
};

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

  return { videos, total, page, limit };
}

export async function getOwnedVideo(userId, videoId) {
  const video = await Video.findById(videoId).populate('project', 'name');
  if (!video || !video.owner.equals(userId)) {
    throw ApiError.notFound('Video not found');
  }
  return video;
}

export async function renameVideo(userId, videoId, title) {
  const video = await getOwnedVideo(userId, videoId);
  video.title = title;
  await video.save();
  return video;
}

export async function assignVideoProject(userId, videoId, projectId) {
  const video = await getOwnedVideo(userId, videoId);

  if (projectId) {
    const project = await Project.findById(projectId);
    if (!project || !project.owner.equals(userId)) {
      throw ApiError.notFound('Project not found');
    }
  }

  video.project = projectId || null;
  await video.save();
  return video;
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
