import { NextRequest, NextResponse } from "next/server";
import { listAdminOfflineJobs } from "@/lib/db";
import { getRequestAuthUser } from "@/lib/offline/access";

export async function GET(request: NextRequest) {
  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const byUser = (url.searchParams.get("user") ?? "").trim();

  const items = listAdminOfflineJobs({
    q,
    status: (status as "" | "queued" | "downloading" | "completed" | "failed" | "expired") ?? "",
    user: byUser,
  });

  return NextResponse.json({ ok: true, items });
}
