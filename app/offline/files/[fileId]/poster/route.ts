import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { getOfflineFileWithJob, touchOfflineFileAccess, touchOfflineJobAccess, touchOfflineUserJobAccess } from "@/lib/db";
import { canAccessOfflineJob, getRequestAuthUser } from "@/lib/offline/access";
import { getOfflineRetentionDays } from "@/lib/offline/config";
import { resolveDataRelativePath } from "@/lib/offline/path";

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const idNum = Number(fileId);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const { user, blocked } = getRequestAuthUser(request);
  if (!user || blocked) {
    return new Response("Unauthorized", { status: 401 });
  }

  const file = getOfflineFileWithJob(idNum);
  if (!file || file.job_status !== "completed" || file.poster_status !== "ready" || !file.poster_path) {
    return new Response("Not Found", { status: 404 });
  }
  if (!canAccessOfflineJob(user, file.job_id)) {
    return new Response("Forbidden", { status: 403 });
  }

  const target = resolveDataRelativePath(file.poster_path);
  if (!target) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const raw = await readFile(target);

    touchOfflineJobAccess(file.job_id, getOfflineRetentionDays());
    touchOfflineFileAccess(file.id);
    touchOfflineUserJobAccess(user.id, file.job_id);

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
