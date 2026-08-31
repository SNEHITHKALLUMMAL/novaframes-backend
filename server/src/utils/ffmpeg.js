import { spawn } from 'node:child_process';

/**
 * Runs ffmpeg/ffprobe with an explicit argument array via spawn() — never
 * through a shell (no exec/execSync with a template string). This is the
 * concrete implementation of the SRS's command-injection rules: "Never
 * execute user input directly as shell commands" and "Sanitize FFmpeg
 * arguments." Every caller builds `args` as an array of discrete tokens;
 * there is no code path here that concatenates user input into a single
 * shell-interpreted string.
 */
export function runFfmpegCommand(binary, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${binary} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ code });
      } else {
        reject(new Error(`${binary} exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

export function runFfmpeg(args, options) {
  return runFfmpegCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], options);
}
