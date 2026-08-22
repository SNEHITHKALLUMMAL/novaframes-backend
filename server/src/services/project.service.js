import { Project } from '../models/Project.model.js';
import { Video } from '../models/Video.model.js';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { ApiError } from '../utils/ApiError.js';

export async function createProject(userId, { name, description }) {
  return Project.create({ owner: userId, name, description });
}

export async function listProjects(userId) {
  const projects = await Project.find({ owner: userId }).sort({ createdAt: -1 }).lean();

  // Video counts per project in one aggregation rather than N+1 queries.
  const counts = await Video.aggregate([
    { $match: { owner: userId, project: { $ne: null } } },
    { $group: { _id: '$project', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return projects.map((p) => ({ ...p, videoCount: countMap.get(p._id.toString()) ?? 0 }));
}

export async function getOwnedProject(userId, projectId) {
  const project = await Project.findById(projectId);
  if (!project || !project.owner.equals(userId)) {
    throw ApiError.notFound('Project not found');
  }
  return project;
}

export async function updateProject(userId, projectId, updates) {
  const project = await getOwnedProject(userId, projectId);
  if (updates.name !== undefined) project.name = updates.name;
  if (updates.description !== undefined) project.description = updates.description;
  await project.save();
  return project;
}

export async function deleteProject(userId, projectId) {
  const project = await getOwnedProject(userId, projectId);

  // Videos and jobs aren't deleted with the project — only unfiled. This
  // matches the Phase 4 data-model decision (Video.project is a reverse
  // reference, not an owned array) and avoids silently destroying a
  // user's generated videos as a side effect of tidying up a project.
  await Promise.all([
    Video.updateMany({ owner: userId, project: project._id }, { $set: { project: null } }),
    GenerationJob.updateMany({ owner: userId, project: project._id }, { $set: { project: null } }),
  ]);

  await Project.deleteOne({ _id: project._id });
  return { deleted: true };
}
