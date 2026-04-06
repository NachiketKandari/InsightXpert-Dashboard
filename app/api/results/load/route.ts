import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RESULTS_DIR } from "../../../lib/paths";
import { getResultJson } from "../../../lib/r2";

export const runtime = "nodejs";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

export async function GET(req: NextRequest) {
  try {
    const relPath = req.nextUrl.searchParams.get("path");
    if (!relPath) {
      return NextResponse.json(
        { error: "path parameter is required" },
        { status: 400 }
      );
    }

    // Block path traversal attempts
    if (relPath.includes("..")) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    // In hosted mode, fetch from R2
    if (IS_HOSTED) {
      try {
        const data = await getResultJson(relPath);
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      } catch {
        return NextResponse.json(
          { error: `File not found: ${relPath}` },
          { status: 404 }
        );
      }
    }

    // Local mode: read from filesystem
    const resolved = path.resolve(RESULTS_DIR, relPath);
    if (!resolved.startsWith(RESULTS_DIR)) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json(
        { error: `File not found: ${relPath}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const data = JSON.parse(content);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
