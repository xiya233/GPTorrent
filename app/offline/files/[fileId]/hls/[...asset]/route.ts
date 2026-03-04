import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { getOfflineFileWithJob, touchOfflineFileAccess, touchOfflineJobAccess, touchOfflineUserJobAccess } from "@/lib/db";
import { canAccessOfflineJob, getRequestAuthUser } from "@/lib/offline/access";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { resolveDataRelativePath } from "@/lib/offline/path";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  request: NextRequest,
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
  if (!segment.endsWith(".m3u8") && !segment.endsWith(".ts")) {
    return new Response("Not Found", { status: 404 });
  }

  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return new Response("Unauthorized", { status: 401 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed" || file.hls_status !== "ready" || !file.hls_playlist_path) {
    return new Response("Not Found", { status: 404 });
  }
  if (!canAccessOfflineJob(user, file.job_id)) {
    return new Response("Forbidden", { status: 403 });
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
    touchOfflineUserJobAccess(user.id, file.job_id);

    const contentType = segment.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";

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
