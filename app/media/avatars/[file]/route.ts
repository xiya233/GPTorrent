import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

const mimeMap: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const safeFile = path.basename(file);
  const ext = path.extname(safeFile).toLowerCase();

  if (!mimeMap[ext]) {
    return new Response("Not Found", { status: 404 });
  }

  const target = path.join(process.cwd(), "data", "avatars", safeFile);
  try {
    const body = await readFile(target);
    return new Response(body, {
      headers: {
        "Content-Type": mimeMap[ext],
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
