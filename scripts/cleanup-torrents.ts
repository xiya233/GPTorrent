import { rm } from "node:fs/promises";
import path from "node:path";
import {
  getTorrentDetailById,
  listDeletedTorrentCleanupCandidates,
  markTorrentAssetsCleaned,
} from "../lib/db";

const RETENTION_DAYS = Number(process.env.TORRENT_CLEANUP_RETENTION_DAYS || "7");

function safeResolveInData(relativePath: string) {
  const dataRoot = path.resolve(process.cwd(), "data");
  const absolutePath = path.resolve(dataRoot, relativePath);
  if (!absolutePath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("非法文件路径");
  }
  return absolutePath;
}

async function removeFile(relativePath: string) {
  if (!relativePath) {
    return;
  }

  try {
    await rm(safeResolveInData(relativePath), { force: true });
  } catch {
    // ignore
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

  console.log(`[cleanup] candidates=${targets.length} cleaned=${cleaned}`);
}

run().catch((err) => {
  console.error("[cleanup] fatal:", err);
  process.exit(1);
});
