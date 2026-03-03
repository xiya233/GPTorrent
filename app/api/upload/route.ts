import { NextRequest, NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import path from "node:path";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { isValidTorrentCategory } from "@/lib/categories";
import { createTorrentWithMeta, getSiteFeatureFlags, getTorrentByInfoHash, getUploadPolicy } from "@/lib/db";
import { saveUploadedImageAsWebp } from "@/lib/image-upload";
import { parseTorrentMeta } from "@/lib/torrent";
import { formatBytes, saveUploadedFile } from "@/lib/storage";

const MAX_IMAGE_COUNT = 9;

function resolveDataPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const target = path.resolve(process.cwd(), "data", normalized);
  const dataRoot = path.resolve(process.cwd(), "data");
  if (!target.startsWith(`${dataRoot}${path.sep}`) && target !== dataRoot) {
    return null;
  }
  return target;
}

async function removeSavedRelativePath(relativePath: string) {
  if (!relativePath) {
    return;
  }
  const target = resolveDataPath(relativePath);
  if (!target) {
    return;
  }
  try {
    await rm(target, { force: true });
  } catch {
    // ignore cleanup errors
  }
}

function normalizeTags(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  const { user, blocked } = getUserStateFromToken(token ?? null);
  if (blocked) {
    return NextResponse.json({ error: "账号不可用，请重新登录" }, { status: 403 });
  }

  const flags = getSiteFeatureFlags();
  const uploadPolicy = getUploadPolicy();
  if (!user && !flags.allowGuestUpload) {
    return NextResponse.json({ error: "管理员已关闭游客上传功能" }, { status: 403 });
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
  if (!isValidTorrentCategory(category)) {
    return NextResponse.json({ error: "分类不合法" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "请填写描述" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传 .torrent 文件" }, { status: 400 });
  }

  let meta;
  try {
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    meta = await parseTorrentMeta(rawBytes);
  } catch {
    return NextResponse.json({ error: "种子文件解析失败，请确认文件有效" }, { status: 400 });
  }

  const duplicated = getTorrentByInfoHash(meta.infoHash);
  if (duplicated) {
    return NextResponse.json({ error: "该种子已存在，禁止重复上传" }, { status: 409 });
  }

  const savedTorrent = await saveUploadedFile({
    file,
    dir: "uploads",
    maxBytes: (user ? uploadPolicy.userTorrentFileMaxMb : uploadPolicy.guestTorrentFileMaxMb) * 1024 * 1024,
    allowedExts: [".torrent"],
  });

  if (!savedTorrent.ok) {
    return NextResponse.json({ error: savedTorrent.error }, { status: 400 });
  }

  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (imageFiles.length > MAX_IMAGE_COUNT) {
    return NextResponse.json({ error: `最多上传 ${MAX_IMAGE_COUNT} 张图片` }, { status: 400 });
  }
  if (!user && imageFiles.length > 0 && !uploadPolicy.allowGuestTorrentImageUpload) {
    return NextResponse.json({ error: "管理员已关闭游客上传种子图片功能" }, { status: 403 });
  }

  const imagePaths: string[] = [];

  for (const image of imageFiles) {
    if (!IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: "图片仅支持 jpg/png/webp/svg" }, { status: 400 });
    }

    const savedImage = await saveUploadedImageAsWebp({
      file: image,
      dir: "torrent-images",
      maxBytes: uploadPolicy.maxTorrentImageUploadMb * 1024 * 1024,
      maxWidth: 2200,
      maxHeight: 2200,
    });

    if (!savedImage.ok) {
      return NextResponse.json({ error: savedImage.error }, { status: 400 });
    }

    imagePaths.push(savedImage.relativePath);
  }

  const isAnonymous = user ? isAnonymousInput : true;

  try {
    const torrentId = createTorrentWithMeta({
      name,
      category,
      sizeBytes: file.size,
      sizeDisplay: formatBytes(file.size),
      tags: normalizeTags(tagsRaw),
      description,
      uploaderName: user ? user.username : "访客",
      uploaderUserId: user?.id ?? null,
      isAnonymous,
      filePath: savedTorrent.relativePath,
      infoHash: meta.infoHash,
      magnetUri: meta.magnetUri,
      trackers: meta.trackers,
      files: meta.files,
      imagePaths,
    });

    return NextResponse.json({ ok: true, redirect: `/torrent/${torrentId}` });
  } catch (error) {
    await Promise.all([
      removeSavedRelativePath(savedTorrent.relativePath),
      ...imagePaths.map((item) => removeSavedRelativePath(item)),
    ]);

    const maybeSqlite = error as { code?: string; message?: string };
    if (
      maybeSqlite.code === "SQLITE_CONSTRAINT_UNIQUE" &&
      maybeSqlite.message?.includes("torrents.info_hash")
    ) {
      return NextResponse.json({ error: "该种子已存在，禁止重复上传" }, { status: 409 });
    }

    console.error("[upload] createTorrentWithMeta failed:", error);
    return NextResponse.json({ error: "上传失败，请稍后重试" }, { status: 500 });
  }
}
