import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

/**
 * Simple session-cookie auth middleware.
 * If AUTH_USERNAME and AUTH_PASSWORD are not set, all requests pass through.
 */

const AUTH_USERNAME = process.env.AUTH_USERNAME ?? "";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? "";
const AUTH_ENABLED = AUTH_USERNAME.length > 0 && AUTH_PASSWORD.length > 0;

function isValidSession(cookie: string): boolean {
  const dotIdx = cookie.lastIndexOf(".");
  if (dotIdx === -1) return false;

  const payload = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);

  // Verify HMAC signature
  const decoded = Buffer.from(payload, "base64").toString();
  const expected = createHmac("sha256", AUTH_PASSWORD).update(decoded).digest("hex");

  // Constant-time compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function middleware(req: NextRequest) {
  // Auth disabled — pass everything through
  if (!AUTH_ENABLED) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always allow login page and auth API
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const session = req.cookies.get("ix-session")?.value;
  if (session && isValidSession(session)) {
    return NextResponse.next();
  }

  // API routes get 401, pages get redirected to /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
