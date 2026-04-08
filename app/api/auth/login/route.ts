import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const AUTH_USERNAME = process.env.AUTH_USERNAME ?? "";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? "";
const AUTH_ENABLED = AUTH_USERNAME.length > 0 && AUTH_PASSWORD.length > 0;

/** HMAC-SHA256 session token — verifiable without a database. */
function makeSessionToken(): string {
  const payload = `session:${AUTH_USERNAME}:${Date.now()}`;
  const sig = createHmac("sha256", AUTH_PASSWORD).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${sig}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  if (!AUTH_ENABLED) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 400 });
  }

  try {
    const { username, password } = await req.json();

    if (
      !username ||
      !password ||
      !safeEqual(username, AUTH_USERNAME) ||
      !safeEqual(password, AUTH_PASSWORD)
    ) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = makeSessionToken();
    const res = NextResponse.json({ ok: true });

    res.cookies.set("ix-session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
