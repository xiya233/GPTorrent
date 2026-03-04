import { NextResponse } from "next/server";
import { getOfflineJobDetailByTorrentId } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const torrentId = Number(id);

  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const detail = getOfflineJobDetailByTorrentId(torrentId);
  if (!detail) {
    return NextResponse.json({ ok: true, job: null, files: [] });
  }

  return NextResponse.json({
    ok: true,
    job: detail.job,
    files: detail.files,
  });
}
