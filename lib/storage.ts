import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function sanitizeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export async function saveUploadedFile(params: {
  file: File;
  dir: string;
  maxBytes: number;
  allowedExts: string[];
}) {
  const { file, dir, maxBytes, allowedExts } = params;

  const lowerName = file.name.toLowerCase();
  const validExt = allowedExts.some((ext) => lowerName.endsWith(ext));

  if (!validExt) {
    return { ok: false, error: `文件类型必须是: ${allowedExts.join(", ")}` } as const;
  }

  if (file.size <= 0 || file.size > maxBytes) {
    return {
      ok: false,
      error: `文件大小必须在 1B 到 ${Math.floor(maxBytes / 1024 / 1024)}MB 之间`,
    } as const;
  }

  const absoluteDir = path.join(process.cwd(), "data", dir);
  await mkdir(absoluteDir, { recursive: true });

  const fileName = `${Date.now()}-${randomUUID()}-${sanitizeName(file.name)}`;
  const relativePath = path.join(dir, fileName);
  const absolutePath = path.join(process.cwd(), "data", relativePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return { ok: true, relativePath, fileName } as const;
}

export function formatBytes(sizeBytes: number) {
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
