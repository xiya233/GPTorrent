import { NextRequest, NextResponse } from "next/server";
import {
  getOfflineFileWithJob,
  queueOfflineFilePoster,
  touchOfflineFileAccess,
  touchOfflineJobAccess,
  touchOfflineUserJobAccess,
} from "@/lib/db";
import { canAccessOfflineJob, getRequestAuthUser } from "@/lib/offline/access";
import { getOfflineRetentionDays } from "@/lib/offline/config";

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
  if (file.is_video !== 1 || file.hls_status !== "ready") {
    return NextResponse.json({ error: "当前文件暂不支持重选封面" }, { status: 400 });
  }

  touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
  touchOfflineFileAccess(file.id);
  touchOfflineUserJobAccess(user.id, file.job_id);

  const queued = queueOfflineFilePoster(file.id, { force: true });
  return NextResponse.json({
    ok: true,
    queued,
    posterStatus: queued ? "queued" : file.poster_status || "none",
  });
}
