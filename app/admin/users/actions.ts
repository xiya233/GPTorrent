"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import {
  createUser,
  deleteSessionsByUserId,
  getUserById,
  getUserByUsername,
  setUserOfflineQuotaBytes,
  setUserStatus,
  softDeleteUser,
} from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export type AdminUserActionState = {
  error: string | null;
  success: string | null;
};

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

function validateUsername(username: string) {
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return "用户名需为 3-24 位小写字母、数字或下划线";
  }
  return null;
}

export async function adminCreateUserAction(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  await requireAdminUser();

  const username = normalizeUsername((formData.get("username") as string | null) ?? "");
  const password = (formData.get("password") as string | null) ?? "";
  const roleRaw = (formData.get("role") as string | null) ?? "user";
  const role = roleRaw === "admin" ? "admin" : "user";

  const usernameError = validateUsername(username);
  if (usernameError) {
    return { error: usernameError, success: null };
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  const existing = getUserByUsername(username);
  if (existing && existing.status !== "deleted") {
    return { error: "用户名已存在", success: null };
  }
  if (existing && existing.status === "deleted") {
    return { error: "该用户名不可用", success: null };
  }

  createUser({
    username,
    passwordHash: hashPassword(password),
    role,
    status: "active",
  });

  revalidatePath("/admin/users");
  return { error: null, success: `用户 ${username} 创建成功` };
}

export async function adminBanUserAction(userId: number): Promise<void> {
  const admin = await requireAdminUser();
  if (admin.id === userId) {
    return;
  }

  const target = getUserById(userId);
  if (!target || target.status === "deleted") {
    return;
  }

  setUserStatus(userId, "banned");
  deleteSessionsByUserId(userId);
  revalidatePath("/admin/users");
}

export async function adminUnbanUserAction(userId: number): Promise<void> {
  await requireAdminUser();

  const target = getUserById(userId);
  if (!target || target.status === "deleted") {
    return;
  }

  setUserStatus(userId, "active");
  revalidatePath("/admin/users");
}

export async function adminDeleteUserAction(userId: number): Promise<void> {
  const admin = await requireAdminUser();
  if (admin.id === userId) {
    return;
  }

  const target = getUserById(userId);
  if (!target || target.status === "deleted") {
    return;
  }

  softDeleteUser(userId);
  deleteSessionsByUserId(userId);
  revalidatePath("/admin/users");
}

export async function adminUpdateUserOfflineQuotaAction(userId: number, formData: FormData): Promise<void> {
  await requireAdminUser();

  const target = getUserById(userId);
  if (!target || target.status === "deleted") {
    return;
  }

  const quotaGbRaw = ((formData.get("offlineQuotaGb") as string | null) ?? "").trim();
  const quotaGb = Number(quotaGbRaw);
  if (!Number.isFinite(quotaGb)) {
    return;
  }

  const safeGb = Math.max(1, Math.min(10240, Math.floor(quotaGb)));
  const quotaBytes = safeGb * 1024 * 1024 * 1024;

  setUserOfflineQuotaBytes(userId, quotaBytes);
  revalidatePath("/admin/users");
  revalidatePath("/my/offline");
}
