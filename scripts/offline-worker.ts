import path from "node:path";
import {
  countOfflineDownloadingJobs,
  expireOfflineJobsByNow,
  getTorrentDetailById,
  listDownloadingOfflineJobs,
  listPendingHlsOfflineFiles,
  listQueuedOfflineJobs,
  markOfflineFileHlsStatus,
  markOfflineJobCompleted,
  markOfflineJobDownloading,
  markOfflineJobFailed,
  replaceOfflineFiles,
  updateOfflineFileHlsProgress,
  updateOfflineJobProgress,
} from "../lib/db";
import {
  getFfmpegBin,
  getFfprobeBin,
  getOfflineHlsRoot,
  getOfflineMaxConcurrency,
  getOfflineRetentionDays,
} from "../lib/offline/config";
import { ensureDir, normalizeRelativePath, relativeToData, resolveDataRelativePath } from "../lib/offline/path";
import { getQbClient } from "../lib/offline/qb";
import { transcodeToHls } from "../lib/offline/transcode";
import { guessMimeType, isVideoPath } from "../lib/offline/video";

const DEFAULT_SLEEP_MS = 20_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(prefix: string) {
  const item = process.argv.find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

function toPositiveInt(raw: string, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildTorrentFileIdFinder(torrentId: number) {
  const detail = getTorrentDetailById(torrentId);
  if (!detail) {
    return () => null;
  }

  const byPath = new Map<string, number>();
  const byBaseSize = new Map<string, number>();

  detail.files.forEach((file) => {
    const normalized = normalizeRelativePath(file.file_path);
    byPath.set(normalized, file.id);

    const key = `${path.basename(normalized).toLowerCase()}::${file.file_size_bytes}`;
    if (!byBaseSize.has(key)) {
      byBaseSize.set(key, file.id);
    }
  });

  return (torrentPath: string, size: number) => {
    const normalized = normalizeRelativePath(torrentPath);
    const direct = byPath.get(normalized);
    if (direct) {
      return direct;
    }

    const key = `${path.basename(normalized).toLowerCase()}::${Math.max(0, Math.floor(size))}`;
    return byBaseSize.get(key) ?? null;
  };
}

async function processQueuedJobs(verbose: boolean) {
  const maxConcurrency = getOfflineMaxConcurrency();
  const running = countOfflineDownloadingJobs();
  const available = Math.max(0, maxConcurrency - running);
  if (available <= 0) {
    return { queuedPicked: 0, queuedStarted: 0, queuedFailed: 0 };
  }

  const jobs = listQueuedOfflineJobs(available);
  if (jobs.length === 0) {
    return { queuedPicked: 0, queuedStarted: 0, queuedFailed: 0 };
  }

  const qb = getQbClient();
  let queuedStarted = 0;
  let queuedFailed = 0;

  for (const job of jobs) {
    try {
      if (job.torrent_status !== "active") {
        markOfflineJobFailed(job.id, "种子已不可用");
        queuedFailed += 1;
        continue;
      }

      const infoHash = (job.torrent_info_hash || "").trim().toLowerCase();
      const magnetUri = (job.torrent_magnet_uri || "").trim();
      if (!infoHash || !magnetUri) {
        markOfflineJobFailed(job.id, "缺少 infohash 或磁力链接");
        queuedFailed += 1;
        continue;
      }

      const savePathAbs = resolveDataRelativePath(job.save_path);
      if (!savePathAbs) {
        markOfflineJobFailed(job.id, "离线路径非法");
        queuedFailed += 1;
        continue;
      }

      await ensureDir(savePathAbs);
      await qb.addMagnet({
        magnetUri,
        savePathAbs,
        tags: ["btshare-offline"],
      });

      const started = markOfflineJobDownloading(job.id, infoHash);
      if (started) {
        queuedStarted += 1;
        if (verbose) {
          console.log(`[offline-worker][verbose] queued->downloading job=${job.id} torrent=${job.torrent_id}`);
        }
      }
    } catch (error) {
      markOfflineJobFailed(job.id, formatError(error));
      queuedFailed += 1;
      if (verbose) {
        console.log(`[offline-worker][verbose] queued-failed job=${job.id} reason=${formatError(error)}`);
      }
    }
  }

  return {
    queuedPicked: jobs.length,
    queuedStarted,
    queuedFailed,
  };
}

async function processDownloadingJobs(verbose: boolean) {
  const jobs = listDownloadingOfflineJobs(500);
  if (jobs.length === 0) {
    return { downloading: 0, completed: 0, failed: 0 };
  }

  const qb = getQbClient();
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const hash = (job.qb_hash || "").trim().toLowerCase();
      if (!hash) {
        markOfflineJobFailed(job.id, "缺少 qB 哈希");
        failed += 1;
        continue;
      }

      const info = await qb.getTorrentInfo(hash);
      if (!info) {
        markOfflineJobFailed(job.id, "qB 任务不存在");
        failed += 1;
        continue;
      }

      const progress = Math.max(0, Math.min(1, Number(info.progress || 0)));
      const totalBytes = Math.max(0, Number(info.total_size || 0));
      const downloadedBytes = Math.max(0, Math.floor(totalBytes * progress));
      const etaSeconds = Number.isFinite(info.eta) && info.eta >= 0 ? Math.floor(info.eta) : null;

      const state = String(info.state || "").toLowerCase();
      if (state.includes("error") || state.includes("missing")) {
        markOfflineJobFailed(job.id, `qB 任务异常状态: ${state}`);
        failed += 1;
        continue;
      }

      updateOfflineJobProgress(job.id, {
        totalBytes,
        downloadedBytes,
        progress,
        downloadSpeed: Math.max(0, Number(info.dlspeed || 0)),
        etaSeconds,
      });

      const isCompleted = progress >= 0.9999 || Number(info.completion_on || 0) > 0;
      if (!isCompleted) {
        continue;
      }

      const qbFiles = await qb.getTorrentFiles(hash);
      if (qbFiles.length === 0) {
        markOfflineJobFailed(job.id, "离线完成但未获取到文件列表");
        failed += 1;
        continue;
      }

      const findTorrentFileId = buildTorrentFileIdFinder(job.torrent_id);
      const mapped = qbFiles.map((file) => {
        const name = normalizeRelativePath(file.name || "");
        const relativePath = normalizeRelativePath(path.join(job.save_path, name));
        const sizeBytes = Math.max(0, Number(file.size || 0));
        const torrentFileId = findTorrentFileId(name, sizeBytes);

        return {
          torrentFileId,
          relativePath,
          sizeBytes,
          mimeType: guessMimeType(name),
          isVideo: isVideoPath(name),
        };
      });

      replaceOfflineFiles(job.id, mapped);
      markOfflineJobCompleted(job.id, {
        totalBytes,
        downloadedBytes: Math.max(downloadedBytes, totalBytes),
        retentionDays: getOfflineRetentionDays(),
      });

      try {
        await qb.deleteTorrent(hash, false);
      } catch {
        // ignore remove errors
      }

      completed += 1;
      if (verbose) {
        console.log(`[offline-worker][verbose] completed job=${job.id} files=${mapped.length}`);
      }
    } catch (error) {
      markOfflineJobFailed(job.id, formatError(error));
      failed += 1;
      if (verbose) {
        console.log(`[offline-worker][verbose] downloading-failed job=${job.id} reason=${formatError(error)}`);
      }
    }
  }

  return {
    downloading: jobs.length,
    completed,
    failed,
  };
}

async function processPendingTranscode(verbose: boolean) {
  const queue = listPendingHlsOfflineFiles(1);
  if (queue.length === 0) {
    return { transcodePicked: 0, transcodeReady: 0, transcodeFailed: 0 };
  }

  const file = queue[0];
  markOfflineFileHlsStatus(file.id, { status: "running", error: "" });
  updateOfflineFileHlsProgress(file.id, 0);

  try {
    const sourceAbs = resolveDataRelativePath(file.relative_path);
    if (!sourceAbs) {
      throw new Error("源文件路径非法");
    }

    const outDirAbs = path.join(getOfflineHlsRoot(), `file-${file.id}`);
    const result = await transcodeToHls({
      ffmpegBin: getFfmpegBin(),
      ffprobeBin: getFfprobeBin(),
      sourceAbs,
      outDirAbs,
      onProgress: (progress) => {
        updateOfflineFileHlsProgress(file.id, progress);
      },
    });

    const playlistPath = relativeToData(result.playlistAbs);
    if (!playlistPath) {
      throw new Error("HLS 输出路径非法");
    }

    markOfflineFileHlsStatus(file.id, {
      status: "ready",
      playlistPath,
      error: "",
    });
    updateOfflineFileHlsProgress(file.id, 1);

    if (verbose) {
      console.log(`[offline-worker][verbose] hls-ready file=${file.id} playlist=${playlistPath}`);
    }

    return {
      transcodePicked: 1,
      transcodeReady: 1,
      transcodeFailed: 0,
    };
  } catch (error) {
    markOfflineFileHlsStatus(file.id, {
      status: "failed",
      error: formatError(error),
    });

    if (verbose) {
      console.log(`[offline-worker][verbose] hls-failed file=${file.id} reason=${formatError(error)}`);
    }

    return {
      transcodePicked: 1,
      transcodeReady: 0,
      transcodeFailed: 1,
    };
  }
}

async function run() {
  const argSet = new Set(process.argv.slice(2));
  const once = argSet.has("--once");
  const verbose = argSet.has("--verbose");
  const sleepMs = toPositiveInt(getArgValue("--interval-ms="), DEFAULT_SLEEP_MS);

  console.log(
    `[offline-worker] started once=${once} verbose=${verbose} intervalMs=${sleepMs} maxConcurrency=${getOfflineMaxConcurrency()}`,
  );

  while (true) {
    const nowIso = new Date().toISOString();
    expireOfflineJobsByNow(nowIso);

    const queuedStat = await processQueuedJobs(verbose);
    const downloadingStat = await processDownloadingJobs(verbose);
    const transcodeStat = await processPendingTranscode(verbose);

    console.log(
      `[offline-worker] queued=${queuedStat.queuedPicked}/${queuedStat.queuedStarted}/${queuedStat.queuedFailed} downloading=${downloadingStat.downloading} completed=${downloadingStat.completed} failed=${downloadingStat.failed} transcode=${transcodeStat.transcodePicked}/${transcodeStat.transcodeReady}/${transcodeStat.transcodeFailed}`,
    );

    if (once) {
      break;
    }

    await sleep(sleepMs);
  }
}

run().catch((error) => {
  console.error("[offline-worker] fatal:", error);
  process.exit(1);
});
