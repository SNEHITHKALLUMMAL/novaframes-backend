import mongoose from 'mongoose';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { AIModel } from '../models/AIModel.model.js';
import { Project } from '../models/Project.model.js';
import { UploadedFile } from '../models/UploadedFile.model.js';
import { ApiError } from '../utils/ApiError.js';
import { assertOwned } from '../utils/ownership.js';
import { env } from '../config/env.js';
import {
  enqueueGenerationJob,
  cancelQueuedBullJob,
  getQueueCounts,
  getQueuePosition,
} from '../queues/generation.queue.js';
import { JOB_STATUS } from '../constants/enums.js';
import { publishJobStatus } from '../realtime/publishJobStatus.js';
import { assertWithinQuota, chargeGenerationUsage, refundGenerationUsage } from './usage.service.js';
import { attachSignedUrls } from './video.service.js';
import { getMySubscriptionWithPlan } from './subscription.service.js';
import { getRequestContext } from '../utils/requestContext.js';

export async function createGenerationJob(userId, payload) {
  const { type, aiModelId, projectId, prompt, negativePrompt, inputFileIds, parameters } = payload;

  const aiModel = await AIModel.findById(aiModelId);
  if (!aiModel || !aiModel.isEnabled) {
    throw ApiError.badRequest('Selected AI model is not available');
  }
  if (!aiModel.capabilities.includes(type)) {
    throw ApiError.badRequest(`Selected model does not support "${type}" generation`);
  }

  // "Unsupported generation options are hidden or rejected" (SRS Phase 20
  // exit criterion). The client only ever offers a model's own declared
  // resolutions/durations, but the server is the actual enforcement point
  // — never trust that a request actually came from the client UI.
  if (parameters?.resolution && !aiModel.supportedResolutions.includes(parameters.resolution)) {
    throw ApiError.badRequest(
      `"${parameters.resolution}" is not supported by this model. Supported: ${aiModel.supportedResolutions.join(', ')}`
    );
  }
  if (
    parameters?.durationSeconds &&
    !aiModel.supportedDurationsSeconds.includes(parameters.durationSeconds)
  ) {
    throw ApiError.badRequest(
      `${parameters.durationSeconds}s is not a supported duration for this model. Supported: ${aiModel.supportedDurationsSeconds.join(', ')}s`
    );
  }

  if (projectId) {
    assertOwned(await Project.findById(projectId), userId, 'Project not found');
  }

  if (type !== 'text-to-video') {
    if (inputFileIds.length === 0) {
      throw ApiError.badRequest(`"${type}" requires at least one uploaded input image`);
    }
    const ownedCount = await UploadedFile.countDocuments({
      _id: { $in: inputFileIds },
      owner: userId,
    });
    if (ownedCount !== inputFileIds.length) {
      throw ApiError.badRequest('One or more input files were not found or do not belong to you');
    }
  }

  // Plan-based fair-use: monthly generation quota (Phase 18). A null
  // generationsPerMonth (Unlimited plan) always passes this check.
  await assertWithinQuota(userId);

  // Plan-based fair-use: duration/resolution ceilings. These are separate
  // from the model's own supportedDurations/supportedResolutions — a
  // parameter can be valid for the model but still exceed what the user's
  // plan allows.
  const { planDefinition } = await getMySubscriptionWithPlan(userId);
  if (parameters?.durationSeconds && parameters.durationSeconds > planDefinition.maxDurationSeconds) {
    throw ApiError.badRequest(
      `Your ${planDefinition.name} plan supports up to ${planDefinition.maxDurationSeconds}s clips. Upgrade for longer generations.`
    );
  }

  // Fair-use / resource control: reject new submissions once the global
  // queue is saturated, rather than accepting unbounded work (SRS:
  // "Never implement unlimited access as unlimited simultaneous GPU jobs").
  const counts = await getQueueCounts();
  const inFlight = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
  if (inFlight >= env.resourceLimits.maxQueueSize) {
    throw ApiError.tooManyRequests(
      'The generation queue is currently full. Please try again in a few minutes.'
    );
  }

  // The job record and its quota charge are two writes to two different
  // collections that must succeed or fail together — a job that exists
  // without a charge (or a charge without a job) is exactly the
  // inconsistency the SRS's "Add transaction usage where required" rule
  // exists to prevent. Wrapped in a session so both commit atomically;
  // note this covers only the two Mongo writes — the BullMQ enqueue below
  // is a separate system entirely and can't be part of a Mongo
  // transaction. That's why enqueue happens AFTER the transaction commits,
  // not inside it: if the transaction fails, nothing was ever enqueued for
  // the worker to pick up (fail closed). If enqueue itself then fails
  // (Redis down) after the transaction already committed, the catch block
  // below marks the job FAILED and refunds the charge — reusing the same
  // refund path the worker uses for a job that fails after it starts
  // (PHASE_12), so there's one refund mechanism, not two.
  const session = await mongoose.startSession();
  let job;
  try {
    await session.withTransaction(async () => {
      const [createdJob] = await GenerationJob.create(
        [
          {
            owner: userId,
            project: projectId || null,
            type,
            prompt,
            negativePrompt,
            inputFiles: inputFileIds,
            aiModel: aiModel._id,
            parameters,
            status: JOB_STATUS.PENDING,
            requestId: getRequestContext().requestId ?? null,
          },
        ],
        { session }
      );
      await chargeGenerationUsage(userId, createdJob._id, 'job_submitted', { session });
      job = createdJob;
    });
  } finally {
    await session.endSession();
  }

  try {
    // Plan-based queue priority (SRS PHASE_08) — found during this
    // phase's audit that enqueueGenerationJob() already accepted a
    // priority option but nothing ever passed one, so every job was
    // processed strictly FIFO regardless of plan. planDefinition is
    // already in scope from the duration/resolution check above.
    await enqueueGenerationJob(job._id.toString(), { priority: planDefinition.queuePriority });
  } catch (err) {
    job.status = JOB_STATUS.FAILED;
    job.error = { message: 'Failed to enqueue for processing', code: 'ENQUEUE_FAILED' };
    await job.save();
    await refundGenerationUsage(userId, job._id, 'enqueue_failed');
    throw ApiError.internal('Could not start generation — please try again');
  }

  job.status = JOB_STATUS.QUEUED;
  job.bullJobId = job._id.toString();
  job.queuePosition = await getQueuePosition(job._id.toString());
  await job.save();

  await publishJobStatus(job);

  return job;
}

export async function listGenerationJobs(userId, { status, page, limit }) {
  const filter = { owner: userId };
  if (status) filter.status = status;

  const [jobs, total] = await Promise.all([
    GenerationJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('aiModel', 'name modelId')
      .populate('outputVideo', 'title thumbnailUrl thumbnailKey status')
      .lean(), // read-only list — skip Mongoose document hydration overhead
    GenerationJob.countDocuments(filter),
  ]);

  // Regenerate thumbnailUrl fresh from thumbnailKey rather than trusting
  // the stored value — same reasoning as video.service.js's
  // attachSignedUrls (PHASE_14): for ObjectStorageProvider, the stored
  // value was never a working signed URL to begin with, not just stale.
  await Promise.all(
    jobs.map((job) => (job.outputVideo ? attachSignedUrls(job.outputVideo) : null))
  );

  return { jobs, total, page, limit };
}

export async function getGenerationJob(userId, jobId) {
  const job = await GenerationJob.findById(jobId)
    .populate('aiModel', 'name modelId')
    .populate('outputVideo', 'title thumbnailUrl thumbnailKey status fileUrl fileKey');

  const ownedJob = assertOwned(job, userId, 'Generation job not found');
  if (ownedJob.outputVideo) await attachSignedUrls(ownedJob.outputVideo);
  return ownedJob;
}

export async function cancelGenerationJob(userId, jobId) {
  const job = assertOwned(await GenerationJob.findById(jobId), userId, 'Generation job not found');

  if ([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(job.status)) {
    throw ApiError.conflict(`Job is already ${job.status.toLowerCase()} and cannot be cancelled`);
  }

  if (job.status === JOB_STATUS.PROCESSING) {
    // No in-flight cancellation signal to the worker exists yet (that needs
    // an adapter with a real cancel() implementation — Phase 10+). Refuse
    // rather than silently mark it cancelled while the worker keeps running.
    throw ApiError.conflict('Job is already processing and cannot be cancelled yet');
  }

  const removed = await cancelQueuedBullJob(job._id.toString());
  job.status = JOB_STATUS.CANCELLED;
  job.completedAt = new Date();
  if (!removed) {
    job.error = { message: 'Cancelled, but was no longer waiting in the queue', code: 'RACE' };
  }
  await job.save();

  await publishJobStatus(job);
  // Refund the quota unit charged at submission time — a cancelled job
  // never produced a video, so it shouldn't permanently count against the
  // user's monthly cap (SRS: "Refund credits for qualifying failures").
  await refundGenerationUsage(userId, job._id, 'job_cancelled');

  return job;
}

export async function getQueueStats() {
  return getQueueCounts();
}
