"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth";
import { getUserById, updateUserPasswordHash, updateUserProfile } from "@/lib/db";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { saveUploadedFile } from "@/lib/storage";

export type ProfileActionState = {
  error: string | null;
  success: string | null;
};

const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireActiveUser();
  const bio = ((formData.get("bio") as string | null) ?? "").trim();
  const avatar = formData.get("avatarFile");

  if (bio.length > 300) {
    return { error: "Bio 不能超过 300 字", success: null };
  }

  let avatarPath: string | undefined;

  if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_TYPES.has(avatar.type)) {
      return { error: "头像仅支持 jpg/png/webp/svg", success: null };
    }

    const saved = await saveUploadedFile({
      file: avatar,
      dir: "avatars",
      maxBytes: 2 * 1024 * 1024,
      allowedExts: [".jpg", ".jpeg", ".png", ".webp", ".svg"],
    });

    if (!saved.ok) {
      return { error: saved.error, success: null };
    }

    avatarPath = saved.relativePath;
  }

  updateUserProfile(user.id, {
    bio,
    avatarPath,
  });

  revalidatePath("/");
  revalidatePath("/settings/profile");

  return { error: null, success: "资料已更新" };
}

export async function changePasswordAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireActiveUser();
  const oldPassword = (formData.get("oldPassword") as string | null) ?? "";
  const newPassword = (formData.get("newPassword") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";

  const current = getUserById(user.id);
  if (!current) {
    return { error: "用户不存在", success: null };
  }

  if (!verifyPassword(oldPassword, current.password_hash)) {
    return { error: "旧密码错误", success: null };
  }

  const passwordErr = validatePasswordStrength(newPassword);
  if (passwordErr) {
    return { error: passwordErr, success: null };
  }

  if (newPassword !== confirmPassword) {
    return { error: "两次新密码不一致", success: null };
  }

  updateUserPasswordHash(user.id, hashPassword(newPassword));
  revalidatePath("/settings/profile");

  return { error: null, success: "密码已更新" };
}
