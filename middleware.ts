import { NextRequest, NextResponse } from "next/server";

/**
 * Simple session-cookie auth middleware.
 * Uses Web Crypto API (Edge-compatible) instead of Node.js crypto.
 * If AUTH_USERNAME and AUTH_PASSWORD are not set, all requests pass through.
 */

const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? "";
const AUTH_ENABLED =
  (process.env.AUTH_USERNAME ?? "").length > 0 && AUTH_PASSWORD.length > 0;

/** Import HMAC key from password string (cached after first call). */
let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(AUTH_PASSWORD),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return keyPromise;
}

/** Hex-encode an ArrayBuffer. */
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isValidSession(cookie: string): Promise<boolean> {
  const dotIdx = cookie.lastIndexOf(".");
  if (dotIdx === -1) return false;

  const payload = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);

  // Decode payload and compute expected HMAC
  const decoded = atob(payload);
  const key = await getKey();
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(decoded)),
  );

  // Constant-time compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function middleware(req: NextRequest) {
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
  if (session && (await isValidSession(session))) {
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
