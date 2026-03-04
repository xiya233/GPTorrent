import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { getOfflineJobDetailByTorrentId, getUserOfflineJobDetailByTorrentId } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const torrentId = Number(id);

  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const { user, blocked } = getUserStateFromToken(token);
  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const detail =
    user.role === "admin"
      ? getOfflineJobDetailByTorrentId(torrentId)
      : getUserOfflineJobDetailByTorrentId(user.id, torrentId);
  if (!detail) {
    return NextResponse.json({ ok: true, job: null, files: [] });
  }

  return NextResponse.json({
    ok: true,
    job: detail.job,
    files: detail.files,
  });
}
