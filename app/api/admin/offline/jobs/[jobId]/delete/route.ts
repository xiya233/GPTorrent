import { NextRequest, NextResponse } from "next/server";
import { adminDeleteOfflineJob } from "@/lib/db";
import { getRequestAuthUser } from "@/lib/offline/access";

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { jobId } = await params;
  const idNum = Number(jobId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const deleted = adminDeleteOfflineJob(idNum);
  if (!deleted) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
