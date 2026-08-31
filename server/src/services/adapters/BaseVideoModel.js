/**
 * BaseVideoModel — the common interface every generation adapter implements,
 * per the SRS's model_abstraction requirement. DevelopmentMockAdapter
 * (this phase) and every real adapter added in Phase 12+ (WanAdapter,
 * LTXVideoAdapter, ...) extend this so the worker (workers/generation.worker.js)
 * and adapterRegistry never need model-specific logic.
 *
 * Not abstract in the strict JS-class sense (no `new.target` enforcement) —
 * it exists to document the contract and provide a clear extension point;
 * subclasses are expected to override every method below.
 */
export class BaseVideoModel {
  /** One-time setup (load weights, warm up a pipeline, etc). No-op for the mock. */
  async load() {}

  /**
   * Throws if the job's inputs aren't valid for this model (e.g. missing
   * image for image-to-video, unsupported resolution/duration). Called by
   * the worker before generate() — keeps validation logic colocated with
   * the model that defines what's valid, rather than duplicated per model
   * inside the worker.
   */
  async validateInput(/* { job, model } */) {
    throw new Error('validateInput() must be implemented by the adapter');
  }

  /**
   * Runs the actual generation. Receives { job, model, onProgress }.
   * Must return { videoId, thumbnailUrl } on success (videoId references
   * the Video document the adapter itself creates via the Video model —
   * adapters own persisting their own output, since only they know its
   * real shape/metadata).
   */
  async generate(/* { job, model, onProgress } */) {
    throw new Error('generate() must be implemented by the adapter');
  }

  /** Best-effort cancellation of an in-flight generate() call. */
  async cancel(/* jobId */) {
    throw new Error('cancel() must be implemented by the adapter');
  }

  /** Release any resources (temp files, loaded model memory) held for a job. */
  async cleanup(/* jobId */) {}

  /** Returns { generationTypes, resolutions, durationsSeconds } this model supports. */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by the adapter');
  }
}
