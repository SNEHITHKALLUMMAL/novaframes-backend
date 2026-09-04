import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Replicate from 'replicate';
import { BaseVideoModel } from '../BaseVideoModel.js';
import { runFfmpegCommand } from '../../../utils/ffmpeg.js';
import { getStorageProvider } from '../../storage/index.js';
import { Video } from '../../../models/Video.model.js';
import { UploadedFile } from '../../../models/UploadedFile.model.js';
import { VIDEO_STATUS } from '../../../constants/enums.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * ReplicateWanAdapter — generates videos via the Replicate API using
 * the Wan 2.2 models (wan-video/wan-2.2-t2v-fast and wan-2.2-i2v-fast).
 *
 * This adapter requires no GPU, no Python, no local model weights.
 * It only needs REPLICATE_API_TOKEN set in the environment.
 *
 * Implements the same BaseVideoModel contract as DevelopmentMockAdapter
 * and WanAdapter, so the worker and adapterRegistry require zero changes.
 */
export class ReplicateWanAdapter extends BaseVideoModel {
  constructor() {
    super();
    this.client = null;
    // Track active predictions for cancellation
    this.activePredictions = new Map(); // jobId -> predictionId
  }

  /**
   * Initialize the Replicate client. Called once per adapter lifetime.
   * The Replicate SDK reads REPLICATE_API_TOKEN from env by default,
   * but we pass it explicitly for clarity.
   */
  async load() {
    if (this.client) return;

    if (!env.replicate.apiToken) {
      throw Object.assign(
        new Error('REPLICATE_API_TOKEN is not configured'),
        { code: 'ADAPTER_NOT_CONFIGURED' }
      );
    }

    this.client = new Replicate({
      auth: env.replicate.apiToken,
    });

    logger.info('Replicate client initialized');
  }

  async validateInput({ job, model }) {
    if (!model.capabilities.includes(job.type)) {
      throw Object.assign(
        new Error(`Replicate Wan model does not support "${job.type}"`),
        { code: 'INVALID_INPUT' }
      );
    }

    if (job.type !== 'text-to-video' && job.inputFiles.length === 0) {
      throw Object.assign(
        new Error(`"${job.type}" requires at least one input image`),
        { code: 'INVALID_INPUT' }
      );
    }

    if ((job.type === 'text-to-video' || job.type === 'text-image-to-video') && !job.prompt?.trim()) {
      throw Object.assign(
        new Error('A text prompt is required for this generation type'),
        { code: 'INVALID_INPUT' }
      );
    }
  }

  async generate({ job, model, onProgress }) {
    await this.load();
    await this.validateInput({ job, model });

    const startTime = Date.now();
    const durationSeconds = job.parameters?.durationSeconds ?? model.supportedDurationsSeconds[0] ?? 5;
    const resolution = model.supportedResolutions.includes(job.parameters?.resolution)
      ? job.parameters.resolution
      : model.supportedResolutions[0] || '1280x720';

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-video-replicate-'));
    const outputVideoPath = path.join(workDir, 'output.mp4');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    try {
      await onProgress?.(5);

      // Build the Replicate input based on generation type
      const input = await this.#buildInput(job);

      // Select the correct model based on generation type
      const modelName = this.#getModelName(job.type);

      logger.info('Starting Replicate prediction', {
        jobId: job._id.toString(),
        model: modelName,
        type: job.type,
      });

      await onProgress?.(10);

      // Use replicate.run() which blocks until prediction completes.
      // The worker's withTimeout() wraps this call, so we get automatic
      // timeout handling without managing our own polling loop.
      const output = await this.client.run(modelName, {
        input,
      });

      await onProgress?.(70);

      // output is a FileOutput (ReadableStream) for video models.
      // We need to save it to disk so ffmpeg can read it for thumbnail extraction.
      // The output might be a single item or an array.
      const videoData = Array.isArray(output) ? output[0] : output;

      if (!videoData) {
        throw Object.assign(
          new Error('Replicate returned empty output — generation may have failed'),
          { code: 'GENERATION_FAILED' }
        );
      }

      // Write the video output to disk.
      // FileOutput implements ReadableStream, so we can pipe it or use .url()
      // to get a download URL. Using .url() is simpler and more reliable.
      let videoUrl;
      if (typeof videoData.url === 'function') {
        videoUrl = videoData.url();
      } else if (typeof videoData === 'string') {
        videoUrl = videoData;
      } else {
        // Fallback: read as buffer
        const chunks = [];
        const reader = videoData.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(outputVideoPath, buffer);
        videoUrl = null; // Already saved to disk
      }

      // If we got a URL, download the video to disk
      if (videoUrl) {
        logger.info('Downloading Replicate output', {
          jobId: job._id.toString(),
          urlLength: videoUrl.length,
        });

        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw Object.assign(
            new Error(`Failed to download Replicate output: ${response.status} ${response.statusText}`),
            { code: 'DOWNLOAD_FAILED' }
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.writeFile(outputVideoPath, Buffer.from(arrayBuffer));
      }

      await onProgress?.(80);

      // Extract thumbnail using ffmpeg (same approach as mock and wan adapters)
      await runFfmpegCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', outputVideoPath,
        '-ss', '00:00:01',
        '-vframes', '1',
        '-y', thumbnailPath,
      ]);

      await onProgress?.(85);

      // Upload to storage (Cloudinary, S3, or local)
      const storage = getStorageProvider();
      const keyPrefix = `videos/${job.owner.toString()}/${job._id.toString()}`;
      const [videoAsset, thumbAsset] = await Promise.all([
        storage.saveFile(outputVideoPath, `${keyPrefix}/output.mp4`),
        storage.saveFile(thumbnailPath, `${keyPrefix}/thumbnail.jpg`),
      ]);

      await onProgress?.(95);

      // Create the Video document
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
        metadata: {
          provider: 'replicate',
          model: modelName,
          mock: false,
          generationTimeMs: Date.now() - startTime,
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info('Replicate generation completed', {
        jobId: job._id.toString(),
        videoId: video._id.toString(),
        model: modelName,
        elapsedSeconds: elapsed,
      });

      await onProgress?.(100);

      return { videoId: video._id, thumbnailUrl: thumbAsset.url };
    } finally {
      // Clean up temp files
      this.activePredictions.delete(job._id.toString());
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  async cancel(jobId) {
    const predictionId = this.activePredictions.get(jobId.toString());
    if (!predictionId || !this.client) return false;

    try {
      await this.client.predictions.cancel(predictionId);
      logger.info('Cancelled Replicate prediction', { jobId: jobId.toString(), predictionId });
      this.activePredictions.delete(jobId.toString());
      return true;
    } catch (err) {
      logger.warn('Failed to cancel Replicate prediction', {
        jobId: jobId.toString(),
        predictionId,
        error: err.message,
      });
      return false;
    }
  }

  async cleanup(jobId) {
    this.activePredictions.delete(jobId.toString());
  }

  getCapabilities() {
    return {
      generationTypes: ['text-to-video', 'image-to-video', 'text-image-to-video'],
      resolutions: ['1280x720', '854x480'],
      durationsSeconds: [2, 3, 5],
    };
  }

  /**
   * Build the Replicate input object based on generation type and job parameters.
   */
  async #buildInput(job) {
    const input = {};

    if (job.prompt?.trim()) {
      input.prompt = job.prompt.trim();
    }

    // For I2V and text-image-to-video, resolve the input image URL
    if (job.type !== 'text-to-video' && job.inputFiles.length > 0) {
      const imageUrl = await this.#resolveInputImageUrl(job);
      input.image = imageUrl;
    }

    // Optional seed for reproducibility
    if (job.parameters?.seed !== undefined) {
      input.seed = job.parameters.seed;
    }

    return input;
  }

  /**
   * Select the correct Replicate model based on generation type.
   */
  #getModelName(type) {
    switch (type) {
      case 'text-to-video':
        return env.replicate.t2vModel;
      case 'image-to-video':
      case 'text-image-to-video':
        return env.replicate.i2vModel;
      default:
        throw Object.assign(
          new Error(`Unsupported generation type for Replicate: ${type}`),
          { code: 'INVALID_INPUT' }
        );
    }
  }

  /**
   * Resolve a publicly accessible URL for an input image.
   * Replicate expects a public URL for image inputs.
   * The storage provider's URL should already be publicly accessible
   * (Cloudinary, S3 with public access, etc.).
   */
  async #resolveInputImageUrl(job) {
    const fileDoc = await UploadedFile.findById(job.inputFiles[0]);
    if (!fileDoc) {
      throw Object.assign(
        new Error('Referenced input file no longer exists'),
        { code: 'INVALID_INPUT' }
      );
    }

    // fileDoc.fileUrl should already be a public URL from the upload process.
    // For Cloudinary, this is the secure_url. For S3, it may be a signed URL.
    // If signed URLs are short-lived, we need to generate a fresh one.
    const storage = getStorageProvider();
    if (typeof storage.getSignedUrl === 'function' && fileDoc.storageKey) {
      return storage.getSignedUrl(fileDoc.storageKey);
    }

    if (fileDoc.fileUrl) {
      return fileDoc.fileUrl;
    }

    throw Object.assign(
      new Error('Cannot resolve a public URL for the input image'),
      { code: 'INVALID_INPUT' }
    );
  }
}

function deriveTitle(prompt) {
  if (!prompt) return 'Untitled generation';
  const trimmed = prompt.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}
