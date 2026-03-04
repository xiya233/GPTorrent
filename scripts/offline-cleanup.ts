import { rm } from "node:fs/promises";
import path from "node:path";
import {
  expireOfflineJobsByNow,
  listExpiredOfflineJobs,
  listOfflineFilesByJobId,
  markOfflineJobExpired,
} from "../lib/db";
import { getDataRoot } from "../lib/offline/config";
import { resolveDataRelativePath } from "../lib/offline/path";

async function removeRelativePath(relativePath: string) {
  if (!relativePath) {
    return;
  }

  const target = resolveDataRelativePath(relativePath);
  if (!target) {
    return;
  }

  try {
    await rm(target, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

async function run() {
  const nowIso = new Date().toISOString();
  expireOfflineJobsByNow(nowIso);

  const jobs = listExpiredOfflineJobs(nowIso);
  let cleaned = 0;

  for (const job of jobs) {
    const files = listOfflineFilesByJobId(job.id);

    for (const file of files) {
      await removeRelativePath(file.relative_path);

      if (file.hls_playlist_path) {
        const playlistAbs = resolveDataRelativePath(file.hls_playlist_path);
        if (playlistAbs) {
          const hlsDir = path.dirname(playlistAbs);
          const rel = path.relative(getDataRoot(), hlsDir).replace(/\\/g, "/");
          await removeRelativePath(rel);
        }
      }
    }

    await removeRelativePath(job.save_path);
    markOfflineJobExpired(job.id);
    cleaned += 1;
  }

  console.log(`[offline-cleanup] candidates=${jobs.length} cleaned=${cleaned}`);
}

run().catch((error) => {
  console.error("[offline-cleanup] fatal:", error);
  process.exit(1);
});
