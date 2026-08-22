import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BaseVideoModel } from '../BaseVideoModel.js';
import { runPythonInference } from './pythonBridge.js';
import { runFfmpegCommand } from '../../../utils/ffmpeg.js';
import { getStorageProvider } from '../../storage/index.js';
import { Video } from '../../../models/Video.model.js';
import { UploadedFile } from '../../../models/UploadedFile.model.js';
import { VIDEO_STATUS } from '../../../constants/enums.js';
import { env } from '../../../config/env.js';

/**
 * Real adapter for Wan 2.2 (Alibaba, Apache 2.0 — see docs/AI_MODEL_SELECTION.md
 * for the license/hardware research behind this choice). Implements the same
 * BaseVideoModel contract as DevelopmentMockAdapter, so the worker and
 * adapterRegistry require zero changes to support it.
 *
 * Node never runs PyTorch in-process — it shells out via pythonBridge.js to
 * ai-worker/pipelines/wan_inference.py, which does the actual model loading
 * and generation. This keeps the Express/worker process entirely free of ML
 * dependencies (Phase 1 architecture decision) and means this adapter can be
 * pointed at a Python environment on the same machine or, with the process
 * spawn replaced by a remote call in a future iteration, a separate GPU host.
 *
 * NOT LIVE-TESTED: this sandbox has no CUDA GPU and cannot install
 * PyTorch/diffusers or download Wan's weights. The code here is complete
 * and internally consistent with the tested mock adapter's patterns
 * (ffmpeg thumbnail extraction, StorageProvider usage, Video creation) but
 * its correctness against the real `wan_inference.py` script is unverified
 * until run against real GPU infrastructure — see ai-worker/README.md.
 */
export class WanAdapter extends BaseVideoModel {
  constructor() {
    super();
    this.activeProcesses = new Map(); // jobId -> ChildProcess, for cancel()
  }

  async load() {
    if (!env.wanAdapter.modelPath) {
      throw Object.assign(
        new Error('WAN_MODEL_PATH is not configured — see ai-worker/README.md'),
        { code: 'ADAPTER_NOT_CONFIGURED' }
      );
    }
  }

  async validateInput({ job, model }) {
    if (!model.capabilities.includes(job.type)) {
      throw Object.assign(new Error(`Wan model does not support "${job.type}"`), {
        code: 'INVALID_INPUT',
      });
    }
    if (job.type === 'image-to-video' || job.type === 'text-image-to-video') {
      if (job.inputFiles.length === 0) {
        throw Object.assign(new Error(`"${job.type}" requires at least one input image`), {
          code: 'INVALID_INPUT',
        });
      }
    }
    if (job.type !== 'image-to-video' && !job.prompt?.trim()) {
      throw Object.assign(new Error('A text prompt is required for this generation type'), {
        code: 'INVALID_INPUT',
      });
    }
  }

  async generate({ job, model, onProgress }) {
    await this.load();
    await this.validateInput({ job, model });

    const durationSeconds = job.parameters?.durationSeconds ?? model.supportedDurationsSeconds[0] ?? 5;
    const resolution = model.supportedResolutions.includes(job.parameters?.resolution)
      ? job.parameters.resolution
      : model.supportedResolutions[0];

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-video-wan-'));
    const outputVideoPath = path.join(workDir, 'output.mp4');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    try {
      const args = [
        '--mode', job.type,
        '--prompt', job.prompt || '',
        '--negative-prompt', job.negativePrompt || '',
        '--resolution', resolution,
        '--duration-seconds', String(durationSeconds),
        '--model-path', env.wanAdapter.modelPath,
        '--device', env.wanAdapter.device,
        '--output', outputVideoPath,
      ];

      if (job.type !== 'text-to-video') {
        const inputImagePath = await this.#resolveInputImagePath(job);
        args.push('--input-image', inputImagePath);
      }

      if (job.parameters?.seed !== undefined) {
        args.push('--seed', String(job.parameters.seed));
      }

      await runPythonInference({
        pythonBin: env.wanAdapter.pythonBin,
        scriptPath: env.wanAdapter.scriptPath,
        args,
        timeoutMs: env.wanAdapter.inferenceTimeoutMs,
        onProgress,
        onChildProcess: (child) => this.activeProcesses.set(job._id.toString(), child),
      });

      await runFfmpegCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', outputVideoPath, '-ss', '00:00:01', '-vframes', '1', '-y', thumbnailPath,
      ]);

      const storage = getStorageProvider();
      const keyPrefix = `videos/${job.owner.toString()}/${job._id.toString()}`;
      const [videoAsset, thumbAsset] = await Promise.all([
        storage.saveFile(outputVideoPath, `${keyPrefix}/output.mp4`),
        storage.saveFile(thumbnailPath, `${keyPrefix}/thumbnail.jpg`),
      ]);

      const video = await Video.create({
        owner: job.owner,
        project: job.project,
        generationJob: job._id,
        aiModel: model._id,
        type: job.type,
        title: deriveTitle(job.prompt),
        status: VIDEO_STATUS.READY,
        fileUrl: videoAsset.url,
        fileKey: videoAsset.key,
        thumbnailUrl: thumbAsset.url,
        thumbnailKey: thumbAsset.key,
        durationSeconds,
        resolution,
        fileSizeBytes: videoAsset.sizeBytes,
        format: 'mp4',
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        metadata: { model: 'wan-2.2', mock: false },
      });

      return { videoId: video._id, thumbnailUrl: thumbAsset.url };
    } finally {
      this.activeProcesses.delete(job._id.toString());
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  async cancel(jobId) {
    const child = this.activeProcesses.get(jobId.toString());
    if (!child) return false;
    child.kill('SIGTERM');
    this.activeProcesses.delete(jobId.toString());
    return true;
  }

  async cleanup(jobId) {
    this.activeProcesses.delete(jobId.toString());
  }

  getCapabilities() {
    return {
      generationTypes: ['text-to-video', 'image-to-video'],
      resolutions: ['1280x720', '854x480'],
      durationsSeconds: [2, 3, 5],
    };
  }

  async #resolveInputImagePath(job) {
    const fileDoc = await UploadedFile.findById(job.inputFiles[0]);
    if (!fileDoc) {
      throw Object.assign(new Error('Referenced input file no longer exists'), {
        code: 'INVALID_INPUT',
      });
    }
    const storage = getStorageProvider();
    // Only meaningful for the local storage backend, where files sit on the
    // same disk the worker runs on — a cloud StorageProvider (Phase 18+)
    // would need to download the object to a temp path here instead.
    if (typeof storage.getAbsolutePath !== 'function') {
      throw new Error(
        'Current StorageProvider cannot resolve a local file path for WanAdapter input — ' +
          'a download-to-temp step is needed for non-local storage backends.'
      );
    }
    return storage.getAbsolutePath(fileDoc.storageKey);
  }
}

function deriveTitle(prompt) {
  if (!prompt) return 'Untitled generation';
  const trimmed = prompt.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}
