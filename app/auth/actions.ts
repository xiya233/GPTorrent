"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie, destroySessionFromCookie, setSessionCookie } from "@/lib/auth";
import { verifyAndConsumeCaptcha } from "@/lib/captcha";
import { createUser, getAuthCaptchaPolicy, getSiteFeatureFlags, getUserByUsername } from "@/lib/db";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";

export type AuthActionState = {
  error: string | null;
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

function validateCaptcha(formData: FormData, purpose: "login" | "register") {
  const captchaId = ((formData.get("captchaId") as string | null) ?? "").trim();
  const captchaAnswer = ((formData.get("captchaAnswer") as string | null) ?? "").trim();
  if (!captchaId || !captchaAnswer) {
    return false;
  }
  return verifyAndConsumeCaptcha({
    captchaId,
    answer: captchaAnswer,
    purpose,
  });
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const flags = getSiteFeatureFlags();
  if (!flags.allowUserRegister) {
    return { error: "当前站点已关闭注册" };
  }

  const captchaPolicy = getAuthCaptchaPolicy();
  const username = normalizeUsername((formData.get("username") as string | null) ?? "");
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";

  const usernameError = validateUsername(username);
  if (usernameError) {
    return { error: usernameError };
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return { error: passwordError };
  }

  if (password !== confirmPassword) {
    return { error: "两次密码输入不一致" };
  }

  if (captchaPolicy.enableRegisterCaptcha && !validateCaptcha(formData, "register")) {
    return { error: "验证码错误或已过期" };
  }

  const exists = getUserByUsername(username);
  if (exists && exists.status !== "deleted") {
    return { error: "用户名已存在" };
  }

  if (exists && exists.status === "deleted") {
    return { error: "该用户名不可用" };
  }

  const userId = createUser({
    username,
    passwordHash: hashPassword(password),
    role: "user",
    status: "active",
  });

  await setSessionCookie(userId);
  revalidatePath("/");
  redirect("/");
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const captchaPolicy = getAuthCaptchaPolicy();
  const username = normalizeUsername((formData.get("username") as string | null) ?? "");
  const password = (formData.get("password") as string | null) ?? "";

  if (!username || !password) {
    return { error: "用户名或密码错误" };
  }

  if (captchaPolicy.enableLoginCaptcha && !validateCaptcha(formData, "login")) {
    return { error: "验证码错误或已过期" };
  }

  const user = getUserByUsername(username);
  if (!user) {
    return { error: "用户名或密码错误" };
  }
  if (user.status !== "active") {
    await clearSessionCookie();
    return { error: "账号不可用，请联系管理员" };
  }

  const ok = verifyPassword(password, user.password_hash);
  if (!ok) {
    return { error: "用户名或密码错误" };
  }

  await setSessionCookie(user.id);
  revalidatePath("/");
  redirect("/");
}

export async function logoutAction() {
  await destroySessionFromCookie();
  redirect("/");
}
