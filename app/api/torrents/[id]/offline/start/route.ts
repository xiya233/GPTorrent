import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { createOfflineJob, getActiveOfflineJobByTorrentId, getTorrentById } from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";

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
  if (!torrent || torrent.status !== "active") {
    return NextResponse.json({ error: "种子不存在" }, { status: 404 });
  }

  if (!torrent.magnet_uri || !torrent.info_hash) {
    return NextResponse.json({ error: "当前种子缺少磁力信息，无法创建离线任务" }, { status: 400 });
  }

  const existing = getActiveOfflineJobByTorrentId(torrentId);
  if (existing) {
    return NextResponse.json({ ok: true, reused: true, job: existing });
  }

  const savePath = `offline/raw/torrent-${torrentId}-${Date.now()}-${randomUUID()}`;

  try {
    const result = createOfflineJob({
      torrentId,
      requestedByUserId: user.id,
      savePath,
      retentionDays: getOfflineRetentionDays(),
    });

    return NextResponse.json({
      ok: true,
      reused: !result.created,
      job: result.job,
    });
  } catch (error) {
    const maybeSqlite = error as { code?: string; message?: string };
    if (maybeSqlite.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const active = getActiveOfflineJobByTorrentId(torrentId);
      if (active) {
        return NextResponse.json({ ok: true, reused: true, job: active });
      }
    }

    console.error("[offline-start] failed:", error);
    return NextResponse.json({ error: "创建离线任务失败，请稍后重试" }, { status: 500 });
  }
}
