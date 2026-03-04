import path from "node:path";
import { NextResponse } from "next/server";
import { getOfflineFileWithJob } from "@/lib/db";
import type { OfflinePlayStatusResponse } from "@/lib/offline/player";

function playlistUrl(fileId: number) {
  return `/offline/files/${fileId}/hls/index.m3u8`;
}

function posterUrl(fileId: number, generatedAt: string) {
  const version = generatedAt ? encodeURIComponent(generatedAt) : String(Date.now());
  return `/offline/files/${fileId}/poster?v=${version}`;
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
    hlsVariantCount: Math.max(1, Math.floor(Number(file.hls_variant_count || 1))),
    hlsUpgradeState: file.hls_upgrade_state,
    hlsUpgradeError: file.hls_upgrade_error || "",
    posterUrl:
      file.poster_status === "ready" && file.poster_path ? posterUrl(file.id, file.poster_generated_at || "") : "",
    posterStatus: file.poster_status || "none",
    posterError: file.poster_error || "",
    posterScore: Math.max(0, Number(file.poster_score || 0)),
    posterPickTime: Math.max(0, Number(file.poster_pick_time || 0)),
    posterGeneratedAt: file.poster_generated_at || "",
    lastUpdatedAt: file.updated_at,
  } satisfies OfflinePlayStatusResponse);
}
