import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sanitizeName } from "@/lib/storage";

type SaveImageAsWebpInput = {
  file: File;
  dir: string;
  maxBytes: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export async function saveUploadedImageAsWebp(input: SaveImageAsWebpInput) {
  const {
    file,
    dir,
    maxBytes,
    maxWidth = 2400,
    maxHeight = 2400,
    quality = 82,
  } = input;

  if (file.size <= 0 || file.size > maxBytes) {
    return {
      ok: false,
      error: `文件大小必须在 1B 到 ${Math.floor(maxBytes / 1024 / 1024)}MB 之间`,
    } as const;
  }

  const absoluteDir = path.join(process.cwd(), "data", dir);
  await mkdir(absoluteDir, { recursive: true });

  const source = Buffer.from(await file.arrayBuffer());
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(source)
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
  } catch {
    return {
      ok: false,
      error: "图片处理失败，请更换文件后重试",
    } as const;
  }

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const fileName = `${Date.now()}-${randomUUID()}-${sanitizeName(baseName)}.webp`;
  const relativePath = path.join(dir, fileName);
  const absolutePath = path.join(process.cwd(), "data", relativePath);
  await writeFile(absolutePath, webpBuffer);

  return { ok: true, relativePath, fileName } as const;
}
