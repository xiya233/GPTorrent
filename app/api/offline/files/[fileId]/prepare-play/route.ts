import { NextRequest, NextResponse } from "next/server";
import {
  getOfflineFileWithJob,
  markOfflineFileHlsStatus,
  queueOfflineFilePoster,
  queueOfflineFileUpgrade,
  touchOfflineFileAccess,
  touchOfflineJobAccess,
  touchOfflineUserJobAccess,
  updateOfflineFileHlsProgress,
} from "@/lib/db";
import { canAccessOfflineJob, getRequestAuthUser } from "@/lib/offline/access";
import { getOfflineRetentionDays } from "@/lib/offline/config";

function playlistUrl(fileId: number) {
  return `/offline/files/${fileId}/hls/index.m3u8`;
}

function posterUrl(fileId: number, generatedAt: string) {
  const version = generatedAt ? encodeURIComponent(generatedAt) : String(Date.now());
  return `/offline/files/${fileId}/poster?v=${version}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  if (!canAccessOfflineJob(user, file.job_id)) {
    return NextResponse.json({ error: "无权限访问该离线资源" }, { status: 403 });
  }

  if (file.job_status !== "completed") {
    return NextResponse.json({ error: "离线任务尚未完成" }, { status: 409 });
  }

  if (file.is_video !== 1) {
    return NextResponse.json({ error: "该文件不支持在线播放" }, { status: 400 });
  }

  touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
  touchOfflineFileAccess(file.id);
  touchOfflineUserJobAccess(user.id, file.job_id);

  if (file.hls_status === "ready") {
    if (file.hls_variant_count <= 1 && (file.hls_upgrade_state === "none" || file.hls_upgrade_state === "failed")) {
      queueOfflineFileUpgrade(file.id);
    }
    let currentPosterStatus = file.poster_status || "none";
    if (file.poster_path === "" || file.poster_status === "none" || file.poster_status === "failed") {
      const queued = queueOfflineFilePoster(file.id);
      if (queued) {
        currentPosterStatus = "queued";
      }
    }

    return NextResponse.json({
      ok: true,
      hlsStatus: "ready",
      playlistUrl: playlistUrl(file.id),
      error: "",
      hlsProgress: 1,
      hlsVariantCount: Math.max(1, Math.floor(Number(file.hls_variant_count || 1))),
      hlsUpgradeState:
        file.hls_variant_count <= 1 && (file.hls_upgrade_state === "none" || file.hls_upgrade_state === "failed")
          ? "queued"
          : file.hls_upgrade_state,
      hlsUpgradeError: file.hls_upgrade_error || "",
      posterUrl:
        file.poster_status === "ready" && file.poster_path ? posterUrl(file.id, file.poster_generated_at || "") : "",
      posterStatus: currentPosterStatus,
      posterError: file.poster_error || "",
      posterScore: Math.max(0, Number(file.poster_score || 0)),
      posterPickTime: Math.max(0, Number(file.poster_pick_time || 0)),
      posterGeneratedAt: file.poster_generated_at || "",
    });
  }

  if (file.hls_status === "running" || file.hls_status === "pending") {
    return NextResponse.json({
      ok: true,
      hlsStatus: file.hls_status,
      playlistUrl: "",
      error: file.hls_error,
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
    hlsVariantCount: Math.max(1, Math.floor(Number(file.hls_variant_count || 1))),
    hlsUpgradeState: "none",
    hlsUpgradeError: "",
    posterUrl: "",
    posterStatus: file.poster_status || "none",
    posterError: file.poster_error || "",
    posterScore: Math.max(0, Number(file.poster_score || 0)),
    posterPickTime: Math.max(0, Number(file.poster_pick_time || 0)),
    posterGeneratedAt: file.poster_generated_at || "",
  });
}
