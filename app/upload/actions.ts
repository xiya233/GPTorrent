"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { insertTorrent } from "@/lib/db";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type UploadActionState = {
  error: string | null;
};

function normalizeTags(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatSize(sizeBytes: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export async function uploadTorrentAction(
  _prevState: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const tagsRaw = (formData.get("tags") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const isAnonymous = formData.get("anonymous") === "on";
  const file = formData.get("torrentFile");

  if (!name) {
    return { error: "请填写种子名称" };
  }
  if (!category) {
    return { error: "请选择分类" };
  }
  if (!description) {
    return { error: "请填写描述" };
  }
  if (!(file instanceof File)) {
    return { error: "请上传 .torrent 文件" };
  }
  if (!file.name.toLowerCase().endsWith(".torrent")) {
    return { error: "文件扩展名必须是 .torrent" };
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return { error: "文件大小必须在 1B 到 10MB 之间" };
  }

  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const relativePath = path.join("uploads", storedFileName);
  const absolutePath = path.join(process.cwd(), "data", relativePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  insertTorrent({
    name,
    category,
    sizeBytes: file.size,
    sizeDisplay: formatSize(file.size),
    tags: normalizeTags(tagsRaw),
    description,
    uploaderName: "访客",
    isAnonymous,
    filePath: relativePath,
  });

  revalidatePath("/");
  redirect("/");
}
