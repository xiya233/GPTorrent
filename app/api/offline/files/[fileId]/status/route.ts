import path from "node:path";
import { NextResponse } from "next/server";
import { getOfflineFileWithJob } from "@/lib/db";
import type { OfflinePlayStatusResponse } from "@/lib/offline/player";

function playlistUrl(fileId: number) {
  return `/offline/files/${fileId}/hls/index.m3u8`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  if (file.job_status !== "completed") {
    return NextResponse.json({ error: "离线任务未完成" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    fileId: file.id,
    fileName: path.basename(file.relative_path),
    isVideo: file.is_video === 1,
    hlsStatus: file.hls_status,
    error: file.hls_error,
    playlistUrl: file.hls_status === "ready" ? playlistUrl(file.id) : "",
    downloadUrl: `/offline/files/${file.id}/download`,
    isReady: file.hls_status === "ready",
    canPlay: file.is_video === 1 && file.hls_status === "ready",
    canDownload: file.job_status === "completed",
    hlsProgress: Math.max(0, Math.min(1, Number(file.hls_progress || 0))),
    lastUpdatedAt: file.updated_at,
  } satisfies OfflinePlayStatusResponse);
}
