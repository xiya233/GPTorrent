import { NextResponse } from "next/server";
import {
  getOfflineFileWithJob,
  markOfflineFileHlsStatus,
  touchOfflineFileAccess,
  touchOfflineJobAccess,
  updateOfflineFileHlsProgress,
} from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";

function playlistUrl(fileId: number) {
  return `/offline/files/${fileId}/hls/index.m3u8`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
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
    return NextResponse.json({ error: "离线任务尚未完成" }, { status: 409 });
  }

  if (file.is_video !== 1) {
    return NextResponse.json({ error: "该文件不支持在线播放" }, { status: 400 });
  }

  touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
  touchOfflineFileAccess(file.id);

  if (file.hls_status === "ready") {
    return NextResponse.json({
      ok: true,
      hlsStatus: "ready",
      playlistUrl: playlistUrl(file.id),
      error: "",
      hlsProgress: 1,
    });
  }

  if (file.hls_status === "running" || file.hls_status === "pending") {
    return NextResponse.json({
      ok: true,
      hlsStatus: file.hls_status,
      playlistUrl: "",
      error: file.hls_error,
      hlsProgress: Math.max(0, Math.min(1, Number(file.hls_progress || 0))),
    });
  }

  markOfflineFileHlsStatus(file.id, {
    status: "pending",
    playlistPath: "",
    error: "",
  });
  updateOfflineFileHlsProgress(file.id, 0);

  return NextResponse.json({
    ok: true,
    hlsStatus: "pending",
    playlistUrl: "",
    error: "",
    hlsProgress: 0,
  });
}
