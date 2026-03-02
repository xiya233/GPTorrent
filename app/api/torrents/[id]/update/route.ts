import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import {
  addTorrentImages,
  deleteTorrentImagesByIds,
  getTorrentById,
  listTorrentImages,
  updateTorrentAsAdmin,
  updateTorrentByOwner,
} from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

const MAX_IMAGE_COUNT = 9;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const torrentId = Number(id);

  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const { user, blocked } = getUserStateFromToken(token);

  if (!user || blocked) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const torrent = getTorrentById(torrentId);
  if (!torrent) {
    return NextResponse.json({ error: "种子不存在" }, { status: 404 });
  }
  if (torrent.status !== "active") {
    return NextResponse.json({ error: "该种子不可编辑" }, { status: 400 });
  }

  const isAdmin = user.role === "admin";
  const isOwner = torrent.uploader_user_id === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const formData = await request.formData();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const tagsRaw = ((formData.get("tags") as string | null) ?? "").trim();
  const description = ((formData.get("description") as string | null) ?? "").trim();
  const removeImageIdsRaw = ((formData.get("removeImageIds") as string | null) ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "描述不能为空" }, { status: 400 });
  }

  const tags = tagsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const removeImageIds = removeImageIdsRaw
    ? removeImageIdsRaw
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isInteger(x) && x > 0)
    : [];

  const existingImages = listTorrentImages(torrentId);
  const removableSet = new Set(existingImages.map((img) => img.id));
  const safeRemoveIds = removeImageIds.filter((idNum) => removableSet.has(idNum));

  const uploadImages = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const remainCount = existingImages.length - safeRemoveIds.length;
  if (remainCount + uploadImages.length > MAX_IMAGE_COUNT) {
    return NextResponse.json({ error: `最多保留 ${MAX_IMAGE_COUNT} 张图片` }, { status: 400 });
  }

  const imagePaths: string[] = [];

  for (const image of uploadImages) {
    if (!IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: "图片仅支持 jpg/png/webp/svg" }, { status: 400 });
    }

    const saved = await saveUploadedFile({
      file: image,
      dir: "torrent-images",
      maxBytes: MAX_IMAGE_SIZE,
      allowedExts: [".jpg", ".jpeg", ".png", ".webp", ".svg"],
    });

    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }

    imagePaths.push(saved.relativePath);
  }

  if (isAdmin) {
    updateTorrentAsAdmin(torrentId, {
      name,
      tags,
      description,
    });
  } else {
    updateTorrentByOwner(torrentId, user.id, {
      name,
      tags,
      description,
    });
  }

  if (safeRemoveIds.length > 0) {
    deleteTorrentImagesByIds(torrentId, safeRemoveIds);
  }
  if (imagePaths.length > 0) {
    addTorrentImages(torrentId, imagePaths);
  }

  const redirectTo = `/torrent/${torrentId}`;
  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
