import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

type RunResult = {
  stdout: string;
  stderr: string;
};

type RunOptions = {
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

function run(bin: string, args: string[], options: RunOptions = {}) {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    let stderrLineBuffer = "";

    function emitLines(source: "stdout" | "stderr") {
      if (source === "stdout") {
        const parts = stdoutLineBuffer.split(/\r?\n/);
        stdoutLineBuffer = parts.pop() ?? "";
        parts.forEach((line) => {
          options.onStdoutLine?.(line);
        });
        return;
      }

      const parts = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = parts.pop() ?? "";
      parts.forEach((line) => {
        options.onStderrLine?.(line);
      });
    }

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      stdoutLineBuffer += text;
      emitLines("stdout");
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      stderrLineBuffer += text;
      emitLines("stderr");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutLineBuffer.trim()) {
        options.onStdoutLine?.(stdoutLineBuffer.trim());
      }
      if (stderrLineBuffer.trim()) {
        options.onStderrLine?.(stderrLineBuffer.trim());
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || `${bin} exited with code ${code ?? -1}`));
    });
  });
}

export async function probeVideo(input: { ffprobeBin: string; sourceAbs: string }) {
  const { stdout } = await run(input.ffprobeBin, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    input.sourceAbs,
  ]);

  const duration = Number(stdout.trim());
  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
  };
}

export async function transcodeToHls(input: {
  ffmpegBin: string;
  ffprobeBin: string;
  sourceAbs: string;
  outDirAbs: string;
  onProgress?: (progress: number) => void | Promise<void>;
}) {
  const probe = await probeVideo({
    ffprobeBin: input.ffprobeBin,
    sourceAbs: input.sourceAbs,
  });
  const durationMs = Math.max(0, Math.floor(probe.durationSeconds * 1000));

  await rm(input.outDirAbs, { recursive: true, force: true });
  await mkdir(input.outDirAbs, { recursive: true });

  const outputPlaylist = path.join(input.outDirAbs, "index.m3u8");
  const segmentPattern = path.join(input.outDirAbs, "seg_%05d.ts");
  let lastProgress = -1;

  await run(input.ffmpegBin, [
    "-y",
    "-i",
    input.sourceAbs,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-progress",
    "pipe:1",
    "-nostats",
    "-hls_segment_filename",
    segmentPattern,
    outputPlaylist,
  ], {
    onStdoutLine: (line) => {
      if (!line.startsWith("out_time_ms=")) {
        return;
      }
      if (durationMs <= 0) {
        return;
      }

      const outTimeUs = Number(line.slice("out_time_ms=".length));
      if (!Number.isFinite(outTimeUs) || outTimeUs < 0) {
        return;
      }

      const outTimeMs = Math.floor(outTimeUs / 1000);
      const progress = Math.max(0, Math.min(0.99, outTimeMs / durationMs));
      if (Math.abs(progress - lastProgress) < 0.01) {
        return;
      }
      lastProgress = progress;
      void input.onProgress?.(progress);
    },
  });

  return {
    playlistAbs: outputPlaylist,
  };
}
