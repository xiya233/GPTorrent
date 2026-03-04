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

type HlsVariantPreset = {
  height: number;
  bitrateK: number;
  maxrateK: number;
  bufsizeK: number;
};

type HlsVariantOutput = {
  label: string;
  height: number;
  bandwidth: number;
};

type PosterResult = {
  posterAbs: string;
  score: number;
  pickTime: number;
  strategy: "sample" | "thumbnail_fallback";
};

type FrameStats = {
  yavg: number;
  ydif: number;
  satavg: number;
  pblack: number;
};

const DEFAULT_POSTER_AT_SECONDS = 1;
const DEFAULT_POSTER_QUALITY = 82;
const SMART_POSTER_MIN_LUMA = 24;
const SMART_POSTER_SAMPLE_FRACTIONS = [0.03, 0.08, 0.15, 0.25, 0.4, 0.6];

const LADDER_PRESETS: HlsVariantPreset[] = [
  { height: 360, bitrateK: 800, maxrateK: 856, bufsizeK: 1200 },
  { height: 720, bitrateK: 2800, maxrateK: 2996, bufsizeK: 4200 },
  { height: 1080, bitrateK: 5000, maxrateK: 5350, bufsizeK: 7500 },
];

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
    "format=duration:stream=codec_type,width,height",
    "-of",
    "json",
    input.sourceAbs,
  ]);

  const payload = JSON.parse(stdout || "{}") as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const duration = Number(payload.format?.duration ?? 0);
  const streams = payload.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const hasAudio = streams.some((stream) => stream.codec_type === "audio");

  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    width: Number.isFinite(video?.width) ? Math.max(0, Number(video?.width)) : 0,
    height: Number.isFinite(video?.height) ? Math.max(0, Number(video?.height)) : 0,
    hasAudio,
  };
}

function buildVariantPresets(sourceHeight: number) {
  const normalized = Math.max(0, Math.floor(sourceHeight));
  const list = LADDER_PRESETS.filter((preset) => normalized === 0 || preset.height <= normalized);
  if (list.length > 0) {
    return list;
  }

  const rawFallbackHeight = normalized > 0 ? Math.min(normalized, 1080) : 360;
  const fallbackHeight = Math.max(2, rawFallbackHeight - (rawFallbackHeight % 2));
  const fallbackBitrate = fallbackHeight <= 360 ? 800 : fallbackHeight <= 720 ? 2800 : 5000;
  return [
    {
      height: fallbackHeight,
      bitrateK: fallbackBitrate,
      maxrateK: Math.round(fallbackBitrate * 1.07),
      bufsizeK: Math.round(fallbackBitrate * 1.5),
    },
  ];
}

function toFixedTime(value: number) {
  return Math.max(0, value).toFixed(3);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseStatNumber(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function parseMetadataLine(line: string, state: { stats: FrameStats }) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) {
    return;
  }
  const key = trimmed.slice(0, eqIndex).trim();
  const value = parseStatNumber(trimmed.slice(eqIndex + 1).trim());
  if (!Number.isFinite(value)) {
    return;
  }

  if (key.endsWith("lavfi.signalstats.YAVG")) {
    state.stats.yavg = value;
    return;
  }
  if (key.endsWith("lavfi.signalstats.YDIF")) {
    state.stats.ydif = value;
    return;
  }
  if (key.endsWith("lavfi.signalstats.SATAVG")) {
    state.stats.satavg = value;
    return;
  }
  if (key.endsWith("lavfi.blackframe.pblack")) {
    state.stats.pblack = value;
  }
}

function buildPosterCandidateTimes(durationSeconds: number, defaultAtSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [Math.max(0.1, defaultAtSeconds), 0.2, 0.5, 1.0];
  }

  const maxTime = Math.max(0.1, durationSeconds - 0.2);
  const minTime = Math.min(maxTime, 0.8);
  const raw = SMART_POSTER_SAMPLE_FRACTIONS.map((fraction) => clamp(durationSeconds * fraction, minTime, maxTime));
  raw.push(clamp(defaultAtSeconds, minTime, maxTime));
  const unique = [...new Set(raw.map((item) => Number(item.toFixed(3))))];
  unique.sort((a, b) => a - b);
  return unique;
}

async function analyzeFrameAtTime(input: {
  ffmpegBin: string;
  sourceAbs: string;
  atSeconds: number;
}) {
  const state = {
    stats: {
      yavg: 0,
      ydif: 0,
      satavg: 0,
      pblack: 0,
    } satisfies FrameStats,
  };

  await run(
    input.ffmpegBin,
    [
      "-v",
      "error",
      "-ss",
      toFixedTime(input.atSeconds),
      "-i",
      input.sourceAbs,
      "-frames:v",
      "1",
      "-vf",
      "signalstats,blackframe=amount=98:threshold=32,metadata=print:file=-",
      "-f",
      "null",
      "-",
    ],
    {
      onStdoutLine: (line) => parseMetadataLine(line, state),
      onStderrLine: (line) => parseMetadataLine(line, state),
    },
  );

  return state.stats;
}

function scoreFrame(stats: FrameStats) {
  if (stats.yavg < SMART_POSTER_MIN_LUMA) {
    return -1;
  }

  const brightness = clamp(stats.yavg / 255, 0, 1);
  const contrast = clamp(stats.ydif / 80, 0, 1);
  const saturation = clamp(stats.satavg / 180, 0, 1);
  const blackPenalty = clamp(stats.pblack / 100, 0, 1);

  const score = brightness * 0.5 + contrast * 0.3 + saturation * 0.2 - blackPenalty * 0.7;
  return Number(score.toFixed(6));
}

async function writePosterAtTime(input: {
  ffmpegBin: string;
  sourceAbs: string;
  posterAbs: string;
  atSeconds: number;
  quality: number;
}) {
  await run(input.ffmpegBin, [
    "-y",
    "-ss",
    toFixedTime(input.atSeconds),
    "-i",
    input.sourceAbs,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libwebp",
    "-quality",
    String(input.quality),
    "-compression_level",
    "4",
    input.posterAbs,
  ]);
}

async function writePosterWithThumbnailFallback(input: {
  ffmpegBin: string;
  sourceAbs: string;
  posterAbs: string;
  quality: number;
}) {
  await run(input.ffmpegBin, [
    "-y",
    "-i",
    input.sourceAbs,
    "-frames:v",
    "1",
    "-vf",
    "thumbnail=120,scale='min(1280,iw)':-2",
    "-c:v",
    "libwebp",
    "-quality",
    String(input.quality),
    "-compression_level",
    "4",
    input.posterAbs,
  ]);
}

export async function transcodeToHls(input: {
  ffmpegBin: string;
  ffprobeBin: string;
  sourceAbs: string;
  outDirAbs: string;
  mode?: "fresh" | "upgrade_in_place";
  onProgress?: (progress: number) => void | Promise<void>;
}) {
  const probe = await probeVideo({
    ffprobeBin: input.ffprobeBin,
    sourceAbs: input.sourceAbs,
  });
  const durationMs = Math.max(0, Math.floor(probe.durationSeconds * 1000));
  const variants = buildVariantPresets(probe.height);
  const mode = input.mode ?? "fresh";

  if (mode === "fresh") {
    await rm(input.outDirAbs, { recursive: true, force: true });
  }
  await mkdir(input.outDirAbs, { recursive: true });

  const outputPlaylist = path.join(input.outDirAbs, "index.m3u8");
  const segmentPattern = path.join(input.outDirAbs, "v%v_seg_%05d.ts");
  const variantPlaylistPattern = path.join(input.outDirAbs, "v%v.m3u8");
  let lastProgress = -1;

  const splitOutputs = variants.map((_, index) => `[vsrc${index}]`).join("");
  const filterChain = [
    `[0:v]split=${variants.length}${splitOutputs}`,
    ...variants.map((variant, index) => `[vsrc${index}]scale=-2:${variant.height}:flags=lanczos[v${index}]`),
  ].join(";");

  const args: string[] = [
    "-y",
    "-i",
    input.sourceAbs,
    "-filter_complex",
    filterChain,
  ];

  variants.forEach((_, index) => {
    args.push("-map", `[v${index}]`);
  });

  if (probe.hasAudio) {
    variants.forEach(() => {
      args.push("-map", "0:a:0?");
    });
  }

  variants.forEach((variant, index) => {
    args.push(
      `-c:v:${index}`,
      "libx264",
      `-preset:v:${index}`,
      "veryfast",
      `-profile:v:${index}`,
      "main",
      `-b:v:${index}`,
      `${variant.bitrateK}k`,
      `-maxrate:v:${index}`,
      `${variant.maxrateK}k`,
      `-bufsize:v:${index}`,
      `${variant.bufsizeK}k`,
      `-g:v:${index}`,
      "48",
      `-keyint_min:v:${index}`,
      "48",
      `-sc_threshold:v:${index}`,
      "0",
    );
  });

  if (probe.hasAudio) {
    args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  }

  const streamMap = variants
    .map((variant, index) =>
      probe.hasAudio
        ? `v:${index},a:${index},name:${variant.height}p`
        : `v:${index},name:${variant.height}p`,
    )
    .join(" ");

  args.push(
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-master_pl_name",
    "index.m3u8",
    "-hls_segment_filename",
    segmentPattern,
    "-var_stream_map",
    streamMap,
    "-progress",
    "pipe:1",
    "-nostats",
    variantPlaylistPattern,
  );

  await run(input.ffmpegBin, args, {
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

  let posterAbs = "";
  let posterError = "";
  let posterScore = 0;
  let posterPickTime = 0;
  try {
    const poster = await generatePosterFromVideo({
      ffmpegBin: input.ffmpegBin,
      ffprobeBin: input.ffprobeBin,
      sourceAbs: input.sourceAbs,
      outDirAbs: input.outDirAbs,
      atSeconds: DEFAULT_POSTER_AT_SECONDS,
      quality: DEFAULT_POSTER_QUALITY,
    });
    posterAbs = poster.posterAbs;
    posterScore = poster.score;
    posterPickTime = poster.pickTime;
  } catch (error) {
    posterError = error instanceof Error ? error.message : String(error);
  }

  return {
    playlistAbs: outputPlaylist,
    variantCount: variants.length,
    posterAbs,
    posterError,
    posterScore,
    posterPickTime,
    variants: variants.map(
      (variant) =>
        ({
          label: `${variant.height}p`,
          height: variant.height,
          bandwidth: variant.bitrateK * 1000,
        }) satisfies HlsVariantOutput,
    ),
  };
}

export async function generatePosterFromVideo(input: {
  ffmpegBin: string;
  ffprobeBin: string;
  sourceAbs: string;
  outDirAbs: string;
  atSeconds?: number;
  quality?: number;
}) {
  const posterAbs = path.join(input.outDirAbs, "poster.webp");
  const requestedAt = Number.isFinite(input.atSeconds) ? Math.max(0.1, Number(input.atSeconds)) : DEFAULT_POSTER_AT_SECONDS;
  const quality = Number.isFinite(input.quality)
    ? Math.max(1, Math.min(100, Math.floor(Number(input.quality))))
    : DEFAULT_POSTER_QUALITY;

  await mkdir(input.outDirAbs, { recursive: true });

  const probe = await probeVideo({
    ffprobeBin: input.ffprobeBin,
    sourceAbs: input.sourceAbs,
  });
  const candidates = buildPosterCandidateTimes(probe.durationSeconds, requestedAt);

  let best: { atSeconds: number; score: number } | null = null;
  let lastError = "";
  for (const atSeconds of candidates) {
    try {
      const stats = await analyzeFrameAtTime({
        ffmpegBin: input.ffmpegBin,
        sourceAbs: input.sourceAbs,
        atSeconds,
      });
      const score = scoreFrame(stats);
      if (!best || score > best.score) {
        best = { atSeconds, score };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (best && best.score >= 0) {
    await writePosterAtTime({
      ffmpegBin: input.ffmpegBin,
      sourceAbs: input.sourceAbs,
      posterAbs,
      atSeconds: best.atSeconds,
      quality,
    });
    return {
      posterAbs,
      score: best.score,
      pickTime: best.atSeconds,
      strategy: "sample",
    } satisfies PosterResult;
  }

  try {
    await writePosterWithThumbnailFallback({
      ffmpegBin: input.ffmpegBin,
      sourceAbs: input.sourceAbs,
      posterAbs,
      quality,
    });
    return {
      posterAbs,
      score: 0,
      pickTime: 0,
      strategy: "thumbnail_fallback",
    } satisfies PosterResult;
  } catch (error) {
    const fallbackError = error instanceof Error ? error.message : String(error);
    throw new Error(lastError || fallbackError || "封面生成失败");
  }
}
