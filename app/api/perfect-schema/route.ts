import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { REPO_ROOT } from "../../lib/paths";

let cache: Record<string, string> | null = null;

function loadPerfectLinking(): Record<string, string> {
  if (cache) return cache;

  const filePath = path.join(REPO_ROOT, "perfect_linking_mini_dev.json");
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  cache = JSON.parse(raw) as Record<string, string>;
  return cache;
}

/**
 * GET /api/perfect-schema?question=...
 * Returns the perfect-linked schema for a question from perfect_linking_mini_dev.json.
 */
export async function GET(req: NextRequest) {
  const question = req.nextUrl.searchParams.get("question");

  if (!question) {
    return NextResponse.json({ error: "question parameter is required" }, { status: 400 });
  }

  const mapping = loadPerfectLinking();

  // Exact match first
  if (mapping[question]) {
    return NextResponse.json({ schema: mapping[question], match: "exact" });
  }

  // Try case-insensitive / trimmed match
  const normalizedQ = question.trim().toLowerCase();
  for (const [key, value] of Object.entries(mapping)) {
    if (key.trim().toLowerCase() === normalizedQ) {
      return NextResponse.json({ schema: value, match: "normalized" });
    }
  }

  return NextResponse.json({ error: "No perfect schema found for this question" }, { status: 404 });
}
