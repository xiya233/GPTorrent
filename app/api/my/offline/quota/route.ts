import { NextRequest, NextResponse } from "next/server";
import { getOfflineQuotaSnapshot } from "@/lib/db";
import { getRequestAuthUser } from "@/lib/offline/access";

export async function GET(request: NextRequest) {
  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    quota: getOfflineQuotaSnapshot(user.id),
  });
}
