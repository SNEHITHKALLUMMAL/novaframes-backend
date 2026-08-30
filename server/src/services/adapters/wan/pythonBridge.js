import { spawn } from 'node:child_process';
import readline from 'node:readline';

/**
 * Runs a Python inference script as a child process via spawn() with an
 * explicit argument array — never a shell string — same discipline as
 * utils/ffmpeg.js. The script is expected to write one JSON object per
 * line to stdout: {"type": "progress", "percent": N} while running, and
 * exactly one {"type": "result", ...} line before exiting 0, or a non-zero
 * exit code (with an error message on stderr) on failure.
 *
 * This keeps the Node/Express side entirely free of ML dependencies —
 * PyTorch, diffusers, etc. only ever exist inside the ai-worker/ Python
 * process, per the Phase 1 architecture decision.
 */
export function runPythonInference({
  pythonBin,
  scriptPath,
  args,
  onProgress,
  onChildProcess,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    onChildProcess?.(child);

    let result = null;
    let stderr = '';
    let settled = false;

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return; // ignore non-JSON stdout noise (library warnings, etc.)
      }
      if (parsed.type === 'progress' && typeof parsed.percent === 'number') {
        onProgress?.(parsed.percent);
      } else if (parsed.type === 'result') {
        result = parsed;
      } else if (parsed.type === 'error') {
        stderr += `\n${parsed.message ?? 'Unknown error reported by inference script'}`;
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = timeoutMs
      ? setTimeout(() => {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`Wan inference timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to start Python inference process: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && result) {
        resolve(result);
      } else {
        reject(new Error(`Wan inference exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}
