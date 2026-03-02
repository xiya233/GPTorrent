import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getTorrentByInfoHash,
  getTorrentsNeedingMetaBackfill,
  upsertTorrentMetaForExisting,
} from "../lib/db";
import { parseTorrentMeta } from "../lib/torrent";

function safeResolveInData(relativePath: string) {
  const dataRoot = path.resolve(process.cwd(), "data");
  const absolutePath = path.resolve(dataRoot, relativePath);
  if (!absolutePath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("非法文件路径");
  }
  return absolutePath;
}

async function run() {
  const rows = getTorrentsNeedingMetaBackfill(500);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const absolute = safeResolveInData(row.file_path);
      const bytes = new Uint8Array(await readFile(absolute));
      const meta = await parseTorrentMeta(bytes);

      const dup = getTorrentByInfoHash(meta.infoHash);
      if (dup && dup.id !== row.id && dup.status === "active") {
        skipped += 1;
        continue;
      }

      upsertTorrentMetaForExisting(row.id, {
        infoHash: meta.infoHash,
        magnetUri: meta.magnetUri,
        trackers: meta.trackers,
        files: meta.files,
      });
      ok += 1;
    } catch {
      failed += 1;
    }
  }

  console.log(`[backfill] total=${rows.length} ok=${ok} skipped=${skipped} failed=${failed}`);
}

run().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
