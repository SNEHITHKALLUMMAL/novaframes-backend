import { Project } from '../models/Project.model.js';
import { Video } from '../models/Video.model.js';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { assertOwned } from '../utils/ownership.js';

export async function createProject(userId, { name, description }) {
  return Project.create({ owner: userId, name, description });
}

export async function listProjects(userId, { page = 1, limit = 20 } = {}) {
  // Pagination added (PHASE_25) — every other list endpoint in this
  // codebase (videos, generation jobs, admin subscriptions/payments) is
  // paginated; this one wasn't, found during a fresh performance audit.
  // Lower risk than an unbounded video/job list (projects are typically
  // low-cardinality — a user has a handful, not hundreds), but an
  // unbounded query is still an unbounded query, and consistency with
  // every sibling list endpoint matters on its own.
  const [projects, total] = await Promise.all([
    Project.find({ owner: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Project.countDocuments({ owner: userId }),
  ]);

  // Video counts per project in one aggregation rather than N+1 queries —
  // already correct before this phase, kept as-is. Scoped to just the
  // current page's project IDs (not every project this user has ever
  // made) now that this list itself is paginated.
  const projectIds = projects.map((p) => p._id);
  const counts = await Video.aggregate([
    { $match: { owner: userId, project: { $in: projectIds } } },
    { $group: { _id: '$project', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return {
    projects: projects.map((p) => ({ ...p, videoCount: countMap.get(p._id.toString()) ?? 0 })),
    total,
    page,
    limit,
  };
}

export async function getOwnedProject(userId, projectId) {
  const project = await Project.findById(projectId);
  return assertOwned(project, userId, 'Project not found');
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
