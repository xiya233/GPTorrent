import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { insertTorrent } from "@/lib/db";
import { formatBytes, saveUploadedFile } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function normalizeTags(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  const { user, blocked } = getUserStateFromToken(token ?? null);
  if (blocked) {
    return NextResponse.json({ error: "账号不可用，请重新登录" }, { status: 403 });
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const tagsRaw = (formData.get("tags") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const isAnonymousInput = formData.get("anonymous") === "on";
  const file = formData.get("torrentFile");

  if (!name) {
    return NextResponse.json({ error: "请填写种子名称" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "请选择分类" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "请填写描述" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传 .torrent 文件" }, { status: 400 });
  }

  const saved = await saveUploadedFile({
    file,
    dir: "uploads",
    maxBytes: MAX_FILE_SIZE,
    allowedExts: [".torrent"],
  });

  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  const isAnonymous = user ? isAnonymousInput : true;

  insertTorrent({
    name,
    category,
    sizeBytes: file.size,
    sizeDisplay: formatBytes(file.size),
    tags: normalizeTags(tagsRaw),
    description,
    uploaderName: user ? user.username : "访客",
    uploaderUserId: user?.id ?? null,
    isAnonymous,
    filePath: saved.relativePath,
  });

  return NextResponse.json({ ok: true, redirect: "/" });
}
