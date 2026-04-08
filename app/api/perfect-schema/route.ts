import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "perfect_linking");

const LINKING_FILES = [
  "perfect_linking_mini_dev.json",
  "perfect_linking_bird_dev.json",
];

interface PerfectEntry {
  question_id: number;
  question: string;
  evidence: string;
  db_id: string;
  difficulty: string;
  schema_text: string;
}

/** question text (lowercased, trimmed) → PerfectEntry */
let cache: Map<string, PerfectEntry> | null = null;

function loadPerfectLinking(): Map<string, PerfectEntry> {
  if (cache) return cache;

  cache = new Map();
  for (const file of LINKING_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, PerfectEntry>;

    for (const entry of Object.values(data)) {
      const key = entry.question.trim().toLowerCase();
      cache.set(key, entry);
    }
  }

  return cache;
}

/**
 * GET /api/perfect-schema?question=...
 * Returns the perfect-linked schema and evidence for a question.
 */
export async function GET(req: NextRequest) {
  const question = req.nextUrl.searchParams.get("question");

  if (!question) {
    return NextResponse.json(
      { error: "question parameter is required" },
      { status: 400 },
    );
  }

  const mapping = loadPerfectLinking();
  const key = question.trim().toLowerCase();
  const entry = mapping.get(key);

  if (entry) {
    return NextResponse.json({
      schema: entry.schema_text,
      evidence: entry.evidence || "",
      db_id: entry.db_id,
      difficulty: entry.difficulty,
      question_id: entry.question_id,
    });
  }

  return NextResponse.json(
    { error: "No perfect schema found for this question" },
    { status: 404 },
  );
}
