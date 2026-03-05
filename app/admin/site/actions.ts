"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { updateSiteSettings } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export type AdminSiteActionState = {
  error: string | null;
  success: string | null;
};

const LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

function parsePositiveInt(formData: FormData, key: string, fallback: number) {
  const raw = (formData.get(key) as string | null) ?? "";
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(1, Math.floor(num));
}

export async function adminUpdateSiteBrandingAction(
  _prevState: AdminSiteActionState,
  formData: FormData,
): Promise<AdminSiteActionState> {
  await requireAdminUser();

  const titleText = ((formData.get("titleText") as string | null) ?? "").trim();
  const descriptionText = ((formData.get("descriptionText") as string | null) ?? "").trim();
  const logoFile = formData.get("logoFile");
  const allowGuestUpload = formData.get("allowGuestUpload") === "on";
  const allowUserDeleteTorrent = formData.get("allowUserDeleteTorrent") === "on";
  const allowGuestTorrentImageUpload = formData.get("allowGuestTorrentImageUpload") === "on";
  const allowUserRegister = formData.get("allowUserRegister") === "on";
  const enableLoginCaptcha = formData.get("enableLoginCaptcha") === "on";
  const enableRegisterCaptcha = formData.get("enableRegisterCaptcha") === "on";
  const maxAvatarUploadMb = parsePositiveInt(formData, "maxAvatarUploadMb", 2);
  const maxTorrentImageUploadMb = parsePositiveInt(formData, "maxTorrentImageUploadMb", 2);
  const guestTorrentFileMaxMb = parsePositiveInt(formData, "guestTorrentFileMaxMb", 1);
  const userTorrentFileMaxMb = parsePositiveInt(formData, "userTorrentFileMaxMb", 10);

  if (!titleText || titleText.length > 60) {
    return { error: "标题长度需在 1-60 字符之间", success: null };
  }
  if (descriptionText.length > 160) {
    return { error: "网站描述最多 160 字符", success: null };
  }

  let logoPath: string | undefined;

  if (logoFile instanceof File && logoFile.size > 0) {
    if (!LOGO_TYPES.has(logoFile.type)) {
      return { error: "LOGO 仅支持 jpg/png/webp/svg", success: null };
    }

    const saved = await saveUploadedFile({
      file: logoFile,
      dir: "site",
      maxBytes: 2 * 1024 * 1024,
      allowedExts: [".jpg", ".jpeg", ".png", ".webp", ".svg"],
    });

    if (!saved.ok) {
      return { error: saved.error, success: null };
    }

    logoPath = saved.relativePath;
  }

  updateSiteSettings({
    titleText,
    descriptionText,
    logoPath,
    allowGuestUpload,
    allowUserDeleteTorrent,
    allowGuestTorrentImageUpload,
    allowUserRegister,
    enableLoginCaptcha,
    enableRegisterCaptcha,
    maxAvatarUploadMb,
    maxTorrentImageUploadMb,
    guestTorrentFileMaxMb,
    userTorrentFileMaxMb,
  });

  revalidatePath("/");
  revalidatePath("/admin/site");

  return { error: null, success: "站点配置已更新" };
}
