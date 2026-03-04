import { NextRequest, NextResponse } from "next/server";
import {
  getOfflineQuotaSnapshot,
  markOfflineJobCanceled,
  markOfflineJobFailed,
  removeOfflineUserJob,
} from "@/lib/db";
import { getQbClient } from "@/lib/offline/qb";
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

  const result = removeOfflineUserJob(user.id, idNum);
  if (!result.removed) {
    return NextResponse.json({ error: "任务不存在或已移除" }, { status: 404 });
  }

  let qbDeleteTried = false;
  let qbDeleteOk = false;
  let message = "";

  if (result.shouldStopGlobalJob) {
    if ((result.jobStatus === "queued" || result.jobStatus === "downloading") && result.qbHash) {
      qbDeleteTried = true;
      try {
        const qb = getQbClient();
        await qb.deleteTorrent(result.qbHash, true);
        qbDeleteOk = true;
        markOfflineJobCanceled(result.jobId, "用户移除任务");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        markOfflineJobFailed(result.jobId, `取消任务时删除 qB 失败: ${errorMessage}`, "cancel");
        message = "用户映射已移除，但删除 qB 下载任务失败，请检查 qB 服务状态";
      }
    } else {
      markOfflineJobCanceled(result.jobId, "用户移除任务");
    }
  }

  return NextResponse.json({
    ok: true,
    quota: getOfflineQuotaSnapshot(user.id),
    qbDeleteTried,
    qbDeleteOk,
    message,
  });
}
