import { Video } from '../../models/Video.model.js';
import { UploadedFile } from '../../models/UploadedFile.model.js';

export async function getStorageStats() {
  const [videoAgg, uploadAgg] = await Promise.all([
    Video.aggregate([
      { $match: { fileSizeBytes: { $ne: null } } },
      { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' }, count: { $sum: 1 } } },
    ]),
    UploadedFile.aggregate([
      { $group: { _id: null, totalBytes: { $sum: '$sizeBytes' }, count: { $sum: 1 } } },
    ]),
  ]);

  const videos = { totalBytes: videoAgg[0]?.totalBytes ?? 0, count: videoAgg[0]?.count ?? 0 };
  const uploads = { totalBytes: uploadAgg[0]?.totalBytes ?? 0, count: uploadAgg[0]?.count ?? 0 };

  return {
    videos,
    uploads,
    totalBytes: videos.totalBytes + uploads.totalBytes,
  };
}
