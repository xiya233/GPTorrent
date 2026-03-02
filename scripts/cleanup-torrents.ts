import { rm } from "node:fs/promises";
import path from "node:path";
import {
  getTorrentDetailById,
  listDeletedTorrentCleanupCandidates,
  markTorrentAssetsCleaned,
} from "../lib/db";

function resolveRetentionDays() {
  const arg = process.argv.find((item) => item.startsWith("--retention-days="));
  const fromArg = arg ? Number(arg.split("=")[1]) : NaN;
  const fromEnv = Number(process.env.TORRENT_CLEANUP_RETENTION_DAYS || "7");
  const value = Number.isFinite(fromArg) ? fromArg : fromEnv;
  if (!Number.isFinite(value) || value < 0) {
    return 7;
  }
  return Math.floor(value);
}

const RETENTION_DAYS = resolveRetentionDays();
const projectRoot = path.resolve(process.cwd());
const dataRoot = path.resolve(projectRoot, "data");

function normalizeRelativeLikePath(rawPath: string) {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathInside(baseDir: string, targetPath: string) {
  const relative = path.relative(baseDir, targetPath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveCleanupTargets(rawPath: string) {
  const normalized = normalizeRelativeLikePath(rawPath);

  const targets = new Set<string>();
  if (path.isAbsolute(rawPath)) {
    targets.add(path.resolve(rawPath));
  } else {
    targets.add(path.resolve(dataRoot, normalized));
    targets.add(path.resolve(projectRoot, normalized));
  }

  return Array.from(targets).filter((target) => {
    return isPathInside(dataRoot, target) || isPathInside(projectRoot, target);
  });
}

async function removeFile(relativePath: string) {
  if (!relativePath) {
    return;
  }

  const targets = resolveCleanupTargets(relativePath);
  for (const target of targets) {
    try {
      await rm(target, { force: true });
    } catch {
      // ignore
    }
  }
}

async function run() {
  const targets = listDeletedTorrentCleanupCandidates(RETENTION_DAYS);
  let cleaned = 0;

  for (const target of targets) {
    const detail = getTorrentDetailById(target.id);
    if (!detail) {
      continue;
    }

    await removeFile(detail.torrent.file_path);
    for (const image of detail.images) {
      await removeFile(image.image_path);
    }

    markTorrentAssetsCleaned(target.id);
    cleaned += 1;
  }

  console.log(`[cleanup] retentionDays=${RETENTION_DAYS} candidates=${targets.length} cleaned=${cleaned}`);
}

run().catch((err) => {
  console.error("[cleanup] fatal:", err);
  process.exit(1);
});
