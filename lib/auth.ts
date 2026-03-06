import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import {
  createSession,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  getAuthUserById,
  getSiteFeatureFlags,
  getSessionWithUserByTokenHash,
  type AuthUser,
} from "@/lib/db";

const COOKIE_NAME = "bt_session";
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE_NAME = COOKIE_NAME;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function setSessionCookie(userId: number) {
  deleteExpiredSessions();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = getExpiresAt();

  createSession({
    tokenHash,
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function destroySessionFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    deleteSessionByTokenHash(hashSessionToken(token));
  }
  await clearSessionCookie();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const state = await getCurrentUserState();
  return state.user;
}

export function getUserStateFromToken(token?: string | null) {
  if (!token) {
    return { user: null, blocked: false };
  }

  const tokenHash = hashSessionToken(token);
  const session = getSessionWithUserByTokenHash(tokenHash);
  if (!session) {
    return { user: null, blocked: false };
  }

  const expired = new Date(session.expires_at).getTime() <= Date.now();
  if (expired || session.status !== "active") {
    deleteSessionByTokenHash(tokenHash);
    return { user: null, blocked: session.status !== "active" };
  }

  return {
    user: {
      id: session.user_id,
      username: session.username,
      avatar_path: session.avatar_path,
      bio: session.bio,
      is_profile_public: session.is_profile_public,
      role: session.role,
      status: session.status,
      offline_quota_bytes: session.offline_quota_bytes,
    },
    blocked: false,
  };
}

export async function getCurrentUserState(): Promise<{ user: AuthUser | null; blocked: boolean }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const state = getUserStateFromToken(token);
  if (!state.user && token) {
    await clearSessionCookie();
  }
  return state;
}

export async function enforceSingleUserModeForGuestPage() {
  const state = await getCurrentUserState();
  const flags = getSiteFeatureFlags();
  if (flags.singleUserMode && !state.user) {
    redirect("/auth/login");
  }
  return state;
}

export function isSingleUserModeGuestBlockedFromRequest(request: NextRequest) {
  const flags = getSiteFeatureFlags();
  if (!flags.singleUserMode) {
    return false;
  }
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const state = getUserStateFromToken(token);
  return !state.user;
}

export async function requireActiveUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }
  return user;
}

export async function requireAdminUser() {
  const user = await requireActiveUser();
  if (user.role !== "admin") {
    redirect("/");
  }
  return user;
}

export async function getUserByIdOrNull(userId: number) {
  const user = getAuthUserById(userId);
  if (!user || user.status !== "active") {
    return null;
  }
  return user;
}
