import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getOfflineFileWithJob, touchOfflineFileAccess, touchOfflineJobAccess } from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { resolveDataRelativePath } from "@/lib/offline/path";
import { guessMimeType } from "@/lib/offline/video";

function safeFileName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 120) || "offline-file";
  return base;
}

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed") {
    return new Response("Not Found", { status: 404 });
  }

  const target = resolveDataRelativePath(file.relative_path);
  if (!target) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const meta = await stat(target);
    if (!meta.isFile()) {
      return new Response("Not Found", { status: 404 });
    }

    const raw = createReadStream(target);
    const fileName = safeFileName(path.basename(file.relative_path));

    touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
    touchOfflineFileAccess(file.id);

    return new Response(Readable.toWeb(raw) as unknown as ReadableStream, {
      headers: {
        "Content-Type": file.mime_type || guessMimeType(file.relative_path),
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Content-Length": String(meta.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
