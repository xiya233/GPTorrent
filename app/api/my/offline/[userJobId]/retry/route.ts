import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOfflineQuotaSnapshot, getTorrentById, retryOfflineUserJobForUser } from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { getRequestAuthUser } from "@/lib/offline/access";

export async function POST(request: NextRequest, { params }: { params: Promise<{ userJobId: string }> }) {
  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { userJobId } = await params;
  const idNum = Number(userJobId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const savePath = `offline/raw/retry-${idNum}-${Date.now()}-${randomUUID()}`;
  const quotaSnapshot = getOfflineQuotaSnapshot(user.id);
  const result = retryOfflineUserJobForUser({
    userId: user.id,
    userJobId: idNum,
    retentionDays: getOfflineRetentionDays(),
    savePath,
    estimatedBytes: 0,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "任务不存在或不可重试" }, { status: 404 });
    }
    if (result.reason === "invalid_status") {
      return NextResponse.json({ error: "仅 failed 状态的任务可以重试" }, { status: 409 });
    }
    if (result.reason === "quota_exceeded") {
      return NextResponse.json(
        {
          error: "离线存储空间不足，无法重试任务",
          quotaUsedBytes: result.quotaUsedBytes,
          quotaLimitBytes: result.quotaLimitBytes,
          reservedBytes: result.reservedBytes,
          reserveSource: result.reserveSource,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: "重试离线任务失败",
        quotaUsedBytes: quotaSnapshot.usedBytes,
        quotaLimitBytes: quotaSnapshot.limitBytes,
      },
      { status: 500 },
    );
  }

  const torrent = getTorrentById(result.job.torrent_id);
  return NextResponse.json({
    ok: true,
    createdJob: result.createdJob,
    reusedGlobalJob: result.reusedGlobalJob,
    job: result.job,
    userJobId: result.userJob.id,
    torrentName: torrent?.name ?? "",
    quotaUsedBytes: result.quotaUsedBytes,
    quotaLimitBytes: result.quotaLimitBytes,
    reservedBytes: result.reservedBytes,
    reserveSource: result.reserveSource,
  });
}
