import { NextRequest, NextResponse } from "next/server";
import { listMyOfflineJobs, listOfflineFilesByJobId, getOfflineQuotaSnapshot } from "@/lib/db";
import { getRequestAuthUser } from "@/lib/offline/access";

export async function GET(request: NextRequest) {
  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();

  const jobs = listMyOfflineJobs(user.id, {
    q,
    status: (status as "" | "queued" | "downloading" | "completed" | "failed" | "expired") ?? "",
  });
  const quota = getOfflineQuotaSnapshot(user.id);

  const items = jobs.map((row) => ({
    ...row,
    files: row.job_status === "completed" ? listOfflineFilesByJobId(row.job_id) : [],
  }));

  return NextResponse.json({
    ok: true,
    quota,
    items,
  });
}
