# AI Worker (Wan 2.2 GPU Inference)

## What this is
Python subprocess, invoked once per generation job by
`src/services/adapters/wan/pythonBridge.js` (Node side, already
implemented and correct) via `WanAdapter.js`. Node never runs PyTorch
in-process — this keeps the Express API and BullMQ worker entirely free
of ML dependencies (a Phase 1 architecture decision), and lets this
Python process eventually move to a separate GPU host without touching
the Node codebase, if that becomes necessary.

## Status: scaffold, not a working implementation
Read `pipelines/wan_inference.py`'s module docstring first — it's split
into two parts with very different confidence levels:
1. **I/O protocol** (argument parsing, the progress/result/error JSON
   lines on stdout, signal handling, output validation via `ffprobe`) —
   fully implemented and correct, verified against the existing,
   already-tested Node code it talks to.
2. **Actual model loading/inference** — a structural scaffold with the
   real API calls commented out and marked `VERIFY AGAINST WAN'S ACTUAL
   DOCS`, not verified working code. This sandbox has no GPU, no network
   access to install PyTorch/diffusers, and no way to download Wan's
   weights or check its current real API — so writing confident-looking
   inference code here would be exactly the "fake production
   implementation" this project's own rules forbid. The script currently
   raises `NotImplementedError` at the point where real inference should
   happen, deliberately, so it fails loudly rather than silently
   producing nothing.

**To finish this**: a human with real GPU access needs to (1) check Wan
2.2's actual model card/repo for the real pipeline class name, kwargs,
and FPS, (2) uncomment and correct the marked block, (3) actually run a
generation and confirm the output plays and matches the requested
prompt/duration.

## A real architectural limitation, found and documented (not fixed) this phase
This process is spawned **fresh for every single generation job** —
`pythonBridge.js` calls `spawn()`, waits for exit, and the whole Python
process (including whatever model it loaded) is gone before the next
job. This means **the model gets loaded from disk into GPU memory on
every job**, not once and reused — for a multi-gigabyte video diffusion
model, that's realistically 30–90+ seconds of pure loading overhead
added to every single generation, on top of the actual inference time.

This wasn't fixed in this phase because the correct fix — a persistent
model-server process that loads once and serves many jobs via a
lightweight per-job IPC channel (a Unix socket, a small HTTP server, or
similar) — is a real rewrite of `pythonBridge.js`'s spawn-per-job design,
and I have no way to test any part of that rewrite in this environment
(no GPU, no way to run either side of the IPC for real). Attempting it
blind would risk shipping a broken worker with no way to catch that
before it reaches your GPU infrastructure — worse than leaving the
current, at-least-functionally-correct-if-slow design in place with the
cost clearly documented.

**Recommended follow-up** (own scoped piece of work, not attempted here):
convert this to a persistent process — load the model once at startup,
then read job requests from stdin (or a socket) in a loop, writing the
same progress/result/error JSON protocol per job that `pythonBridge.js`
already expects on the Node side. `pythonBridge.js` itself would need a
corresponding change from "spawn and wait for exit" to "spawn once, then
send/receive framed messages over the long-lived process's stdio" — real
work, but well-scoped and independently testable once real GPU
infrastructure exists to verify it against.

## Setup (once the scaffold above is completed)
```bash
cd ai-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # see requirements.txt's own caveats
```
Download Wan 2.2 weights per its own distribution instructions (Hugging
Face / the model's official repo) to a local path, then set in the
server's `.env`:
```
WAN_ADAPTER_ENABLED=true
WAN_MODEL_PATH=/path/to/downloaded/weights
WAN_DEVICE=cuda
```

## Testing the I/O protocol without a GPU
The argument-parsing and JSON-emission functions
(`emit_progress`/`emit_result`/`emit_error`, `parse_args`) don't import
`torch` at module load time (deliberately — see the script's comment) —
they can be unit-tested with plain `pytest` on a CPU-only machine, ahead
of a real GPU/model integration. Not written this phase (no `pytest`
harness exists yet in this Python directory) — a reasonable small
follow-up alongside the persistent-process rewrite above.
