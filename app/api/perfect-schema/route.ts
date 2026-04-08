import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "perfect_linking");

const LINKING_FILES = [
  "perfect_linking_mini_dev.json",
  "perfect_linking_bird_dev.json",
];

let cache: Record<string, string> | null = null;

/** Load and merge all perfect linking files into a single question→schema map. */
function loadPerfectLinking(): Record<string, string> {
  if (cache) return cache;

  const merged: Record<string, string> = {};
  for (const file of LINKING_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, string>;
      Object.assign(merged, data);
    }
  }

  cache = merged;
  return cache;
}

/**
 * GET /api/perfect-schema?question=...
 * Returns the perfect-linked schema for a question.
 * Searches across both mini_dev and bird_dev perfect linking files.
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
