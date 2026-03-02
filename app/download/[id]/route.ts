import { readFile } from "node:fs/promises";
import path from "node:path";
import { getTorrentById } from "@/lib/db";

function safeFileName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80) || "torrent";
  return base.endsWith(".torrent") ? base : `${base}.torrent`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const torrentId = Number(id);

  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const row = getTorrentById(torrentId);
  if (!row || row.status !== "active" || !row.file_path) {
    return new Response("Not Found", { status: 404 });
  }

  const dataRoot = path.resolve(process.cwd(), "data");
  const absolutePath = path.resolve(dataRoot, row.file_path);

  if (!absolutePath.startsWith(`${dataRoot}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = await readFile(absolutePath);
    const filename = safeFileName(row.name);

    return new Response(file, {
      headers: {
        "Content-Type": "application/x-bittorrent",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
