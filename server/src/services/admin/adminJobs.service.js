import { GenerationJob } from '../../models/GenerationJob.model.js';

export async function listAllJobs({ status, page, limit }) {
  const filter = {};
  if (status) filter.status = status;

  const [jobs, total] = await Promise.all([
    GenerationJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name email')
      .populate('aiModel', 'name modelId')
      .lean(),
    GenerationJob.countDocuments(filter),
  ]);

  return { jobs, total, page, limit };
}
