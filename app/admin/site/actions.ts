"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { updateSiteBranding } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export type AdminSiteActionState = {
  error: string | null;
  success: string | null;
};

const LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

export async function adminUpdateSiteBrandingAction(
  _prevState: AdminSiteActionState,
  formData: FormData,
): Promise<AdminSiteActionState> {
  await requireAdminUser();

  const titleText = ((formData.get("titleText") as string | null) ?? "").trim();
  const logoFile = formData.get("logoFile");
  const allowGuestUpload = formData.get("allowGuestUpload") === "on";
  const allowUserDeleteTorrent = formData.get("allowUserDeleteTorrent") === "on";

  if (!titleText || titleText.length > 60) {
    return { error: "标题长度需在 1-60 字符之间", success: null };
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

  updateSiteBranding({
    titleText,
    logoPath,
    allowGuestUpload,
    allowUserDeleteTorrent,
  });

  revalidatePath("/");
  revalidatePath("/admin/site");

  return { error: null, success: "站点配置已更新" };
}
