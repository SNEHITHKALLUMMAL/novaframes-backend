#!/usr/bin/env python3
"""
Wan 2.2 inference entry point, invoked by pythonBridge.js
(src/services/adapters/wan/pythonBridge.js) as a subprocess -- one process
per generation job (see the architecture note in ai-worker/README.md
about what that does and doesn't cost).

CONFIDENCE LEVEL -- READ THIS BEFORE USING:
This script has two parts with very different confidence levels, kept
clearly separated below:

1. The I/O protocol (argument parsing, the line-delimited JSON progress/
   result/error format on stdout, signal handling, output validation) is
   fully specified by the existing, already-tested Node code
   (pythonBridge.js, WanAdapter.js) and is written to match it exactly.
   This part is correct with the same confidence as the rest of this
   codebase.

2. The actual model-loading and inference calls (marked below with
   "VERIFY AGAINST WAN'S ACTUAL DOCS") are written from general knowledge
   of how diffusers-style video pipelines are typically structured, in an
   environment with no GPU, no network access to install PyTorch/diffusers,
   and no way to download Wan's weights or check its real API reference.
   That part is a structural best-effort scaffold, not verified code --
   treat it as "what an engineer would fill in and check against Wan
   2.2's actual model card / repo," not as tested, working inference
   code. Do NOT treat this script as production-ready without a human
   with real GPU access verifying part 2 against Wan's current docs.
"""

import argparse
import json
import signal
import sys
from pathlib import Path

# --- I/O protocol helpers (high confidence -- matches pythonBridge.js exactly) ---

def emit(payload: dict) -> None:
    """One JSON object per line on stdout -- pythonBridge.js's readline
    parser expects exactly this shape and ignores non-JSON lines, so this
    is the only way this script communicates progress/results/errors."""
    print(json.dumps(payload), flush=True)


def emit_progress(percent: float) -> None:
    emit({"type": "progress", "percent": max(0, min(100, percent))})


def emit_result(output_path: str, duration_seconds: float) -> None:
    emit({"type": "result", "output_path": output_path, "duration_seconds": duration_seconds})


def emit_error(message: str) -> None:
    emit({"type": "error", "message": message})


def parse_args() -> argparse.Namespace:
    """Flag names and defaults matched exactly against the args array
    WanAdapter.js#generate() builds -- changing a flag name here without
    changing it there (or vice versa) breaks the integration silently."""
    parser = argparse.ArgumentParser(description="Wan 2.2 video generation")
    parser.add_argument("--mode", required=True, choices=["text-to-video", "image-to-video", "text-image-to-video"])
    parser.add_argument("--prompt", default="")
    parser.add_argument("--negative-prompt", default="")
    parser.add_argument("--resolution", required=True, help='e.g. "1280x720"')
    parser.add_argument("--duration-seconds", type=int, required=True)
    parser.add_argument("--model-path", required=True, help="Local path to downloaded Wan 2.2 weights")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--output", required=True, help="Path to write the resulting .mp4 to")
    parser.add_argument("--input-image", default=None, help="Required for image-to-video / text-image-to-video")
    parser.add_argument("--seed", type=int, default=None)
    return parser.parse_args()


# Cooperative cancellation: WanAdapter.js#cancel() sends SIGTERM to this
# process. A single flag checked between generation steps is the simplest
# correct approach for a synchronous, mostly-GPU-bound inference loop --
# an abrupt kill -9 would leave GPU memory in an undefined state, whereas
# this lets the script at least attempt torch.cuda.empty_cache() (see the
# `finally` block in main()) before exiting.
_cancelled = False


def _handle_sigterm(signum, frame):
    global _cancelled
    _cancelled = True


signal.signal(signal.SIGTERM, _handle_sigterm)


def validate_output(output_path: str, expected_duration_seconds: int) -> float:
    """Sanity-checks the model actually produced a real video before
    reporting success -- SRS PHASE_10 "Output validation". Catches the
    class of failure where the process exits 0 but wrote an empty or
    truncated file (a real, common failure mode for GPU OOM mid-write).
    Uses ffprobe (already a project dependency -- see utils/ffmpeg.js on
    the Node side) rather than a second video-parsing library.
    """
    path = Path(output_path)
    if not path.exists() or path.stat().st_size < 1024:
        raise RuntimeError(f"Output file missing or suspiciously small: {output_path}")

    import subprocess

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", output_path],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if probe.returncode != 0:
        raise RuntimeError(f"ffprobe could not read the output file: {probe.stderr}")

    actual_duration = float(json.loads(probe.stdout)["format"]["duration"])
    # Generous tolerance (50%) -- exact frame-count/duration matching
    # depends on the model's actual output FPS, which isn't something
    # this script should assume without checking against Wan's real specs.
    if actual_duration < expected_duration_seconds * 0.5:
        raise RuntimeError(
            f"Output duration ({actual_duration:.1f}s) is far shorter than requested "
            f"({expected_duration_seconds}s) -- likely a truncated/failed generation"
        )
    return actual_duration


def main() -> int:
    args = parse_args()

    if args.mode in ("image-to-video", "text-image-to-video") and not args.input_image:
        emit_error(f'--input-image is required for mode "{args.mode}"')
        return 1

    width, height = (int(x) for x in args.resolution.split("x"))

    pipeline = None
    try:
        emit_progress(0)

        # =====================================================================
        # VERIFY AGAINST WAN'S ACTUAL DOCS -- this block is the low-confidence
        # part described in the module docstring above. Structured the way a
        # typical diffusers video pipeline is used (load a pretrained
        # pipeline, move to device, call it with prompt/image/frame-count
        # kwargs, export frames to video) -- but the exact class name, kwarg
        # names, and post-processing helper are NOT verified against Wan
        # 2.2's real current API. Check Wan's model card / GitHub repo
        # (search "Wan2.2" on Hugging Face / GitHub) before relying on this.
        # =====================================================================
        import torch  # noqa: F401  -- imported here, not top-of-file, so the
                       # I/O-protocol code above can still be imported/tested
                       # without PyTorch installed, e.g. by a future unit test

        # from diffusers import WanPipeline  # <-- VERIFY: real import path/class name
        #
        # pipeline = WanPipeline.from_pretrained(
        #     args.model_path,
        #     torch_dtype=torch.float16,
        # ).to(args.device)
        #
        # generator = torch.Generator(device=args.device)
        # if args.seed is not None:
        #     generator = generator.manual_seed(args.seed)
        #
        # def _progress_callback(step, timestep, latents):
        #     # VERIFY: diffusers callback signature/name for the real pipeline
        #     if _cancelled:
        #         raise KeyboardInterrupt("Generation cancelled")
        #     emit_progress(min(95, int(step / total_steps * 90) + 5))
        #
        # kwargs = dict(
        #     prompt=args.prompt,
        #     negative_prompt=args.negative_prompt or None,
        #     height=height,
        #     width=width,
        #     num_frames=args.duration_seconds * WAN_FPS,  # VERIFY: Wan's actual FPS
        #     generator=generator,
        #     callback=_progress_callback,
        # )
        # if args.input_image:
        #     from PIL import Image
        #     kwargs["image"] = Image.open(args.input_image).convert("RGB")
        #
        # output = pipeline(**kwargs)
        #
        # from diffusers.utils import export_to_video  # VERIFY: real helper name
        # export_to_video(output.frames[0], args.output, fps=WAN_FPS)

        raise NotImplementedError(
            "Wan model integration is a scaffold, not implemented -- see the "
            "VERIFY AGAINST WAN'S ACTUAL DOCS block above and ai-worker/README.md. "
            "This NotImplementedError is intentional so the script fails loudly "
            "and immediately rather than silently producing no output."
        )
        # =====================================================================
        # END low-confidence block
        # =====================================================================

        emit_progress(95)
        actual_duration = validate_output(args.output, args.duration_seconds)
        emit_result(args.output, actual_duration)
        return 0

    except KeyboardInterrupt:
        emit_error("Generation cancelled")
        return 1
    except Exception as exc:  # noqa: BLE001 -- top-level boundary; any failure must reach Node as a clean error line, not a raw traceback on stdout
        emit_error(str(exc))
        return 1
    finally:
        # GPU memory management (SRS PHASE_10) -- release the pipeline and
        # clear the CUDA cache before this (per-job) process exits, so a
        # crashed or cancelled run doesn't leave memory pinned for
        # whichever job's process spawns next. Only meaningful once the
        # VERIFY block above is real; harmless no-op against `pipeline =
        # None` until then.
        try:
            import torch

            del pipeline
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass


if __name__ == "__main__":
    sys.exit(main())
