"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth";
import { isValidTorrentCategory } from "@/lib/categories";
import { getUploadPolicy, insertTorrent } from "@/lib/db";
import { formatBytes, saveUploadedFile } from "@/lib/storage";

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

export async function uploadTorrentAction(
  _prevState: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const { user, blocked } = await getCurrentUserState();
  const uploadPolicy = getUploadPolicy();
  if (blocked) {
    redirect("/auth/login");
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const tagsRaw = (formData.get("tags") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const isAnonymousInput = formData.get("anonymous") === "on";
  const file = formData.get("torrentFile");

  if (!name) {
    return { error: "请填写种子名称" };
  }
  if (!category) {
    return { error: "请选择分类" };
  }
  if (!isValidTorrentCategory(category)) {
    return { error: "分类不合法" };
  }
  if (!description) {
    return { error: "请填写描述" };
  }
  if (!(file instanceof File)) {
    return { error: "请上传 .torrent 文件" };
  }

  const saved = await saveUploadedFile({
    file,
    dir: "uploads",
    maxBytes: (user ? uploadPolicy.userTorrentFileMaxMb : uploadPolicy.guestTorrentFileMaxMb) * 1024 * 1024,
    allowedExts: [".torrent"],
  });

  if (!saved.ok) {
    return { error: saved.error };
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

  revalidatePath("/");
  redirect("/");
}
