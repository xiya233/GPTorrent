import { readFile } from "node:fs/promises";
import path from "node:path";
import { getOfflineFileWithJob, touchOfflineFileAccess, touchOfflineJobAccess } from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { resolveDataRelativePath } from "@/lib/offline/path";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string; asset: string[] }> },
) {
  const { fileId, asset } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0 || !Array.isArray(asset) || asset.length !== 1) {
    return new Response("Not Found", { status: 404 });
  }

  const [segment] = asset;
  if (!SAFE_SEGMENT.test(segment)) {
    return new Response("Not Found", { status: 404 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed" || file.hls_status !== "ready" || !file.hls_playlist_path) {
    return new Response("Not Found", { status: 404 });
  }

  const playlistAbs = resolveDataRelativePath(file.hls_playlist_path);
  if (!playlistAbs) {
    return new Response("Forbidden", { status: 403 });
  }

  const hlsDir = path.dirname(playlistAbs);
  const target = segment === "index.m3u8" ? playlistAbs : path.resolve(hlsDir, segment);

  if (segment !== "index.m3u8" && !target.startsWith(`${hlsDir}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const raw = await readFile(target);

    touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
    touchOfflineFileAccess(file.id);

    const contentType = segment === "index.m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t";

    return new Response(raw, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
