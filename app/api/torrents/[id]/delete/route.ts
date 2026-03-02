import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { getSiteFeatureFlags, getTorrentById, softDeleteTorrent } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const torrent = getTorrentById(torrentId);
  if (!torrent) {
    return NextResponse.json({ error: "种子不存在" }, { status: 404 });
  }
  if (torrent.status !== "active") {
    return NextResponse.json({ error: "该种子已删除" }, { status: 400 });
  }

  const isAdmin = user.role === "admin";
  const isOwner = torrent.uploader_user_id === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  if (!isAdmin) {
    const flags = getSiteFeatureFlags();
    if (!flags.allowUserDeleteTorrent) {
      return NextResponse.json({ error: "管理员已关闭用户删除种子功能" }, { status: 403 });
    }
  }

  softDeleteTorrent(torrentId, user.id, isAdmin ? "admin" : "user");

  const formData = await request.formData().catch(() => null);
  const redirectTo = ((formData?.get("redirectTo") as string | null) ?? "").trim() || "/my/torrents";

  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
