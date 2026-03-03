import { NextRequest, NextResponse } from "next/server";
import { createCaptchaChallengePayload } from "@/lib/captcha";
import type { CaptchaPurpose } from "@/lib/db";

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return request.headers.get("x-real-ip") ?? "";
}

function parsePurpose(value: string | null): CaptchaPurpose | null {
  if (value === "login" || value === "register") {
    return value;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const purpose = parsePurpose(request.nextUrl.searchParams.get("purpose"));
  if (!purpose) {
    return NextResponse.json({ error: "invalid purpose" }, { status: 400 });
  }

  const payload = await createCaptchaChallengePayload(purpose, getClientIp(request));
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
