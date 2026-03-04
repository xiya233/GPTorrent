import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, getUserStateFromToken } from "@/lib/auth";
import { hasActiveOfflineJobAccess, type AuthUser } from "@/lib/db";

export function getRequestAuthUser(request: NextRequest): { user: AuthUser | null; blocked: boolean } {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  return getUserStateFromToken(token);
}

export function canAccessOfflineJob(user: AuthUser, jobId: number) {
  if (user.role === "admin") {
    return true;
  }
  return hasActiveOfflineJobAccess(user.id, jobId);
}
