import { readFile } from "node:fs/promises";
import { getOfflineFileWithJob, touchOfflineFileAccess, touchOfflineJobAccess } from "@/lib/db";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { resolveDataRelativePath } from "@/lib/offline/path";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed" || file.poster_status !== "ready" || !file.poster_path) {
    return new Response("Not Found", { status: 404 });
  }

  const target = resolveDataRelativePath(file.poster_path);
  if (!target) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const raw = await readFile(target);

    touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
    touchOfflineFileAccess(file.id);

    return new Response(raw, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
