import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RESULTS_DIR } from "../../lib/paths";

export const runtime = "nodejs";

interface ResultSummary {
  id: string;
  filePath: string;
  dirName: string;
  timestamp: string;
  total: number;
  correct: number;
  accuracy: number;
  accuracyRelaxed: number;
  byDifficulty: Record<string, { total: number; correct: number }>;
  runConfig: Record<string, unknown> | null;
}

/** Simple hash for stable IDs. */
function hashPath(p: string): string {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    h = ((h << 5) - h + p.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Recursively find all eval_results_*.json files. */
function findResultFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findResultFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.startsWith("eval_results_") &&
      entry.name.endsWith(".json")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Read top-level fields from a result file without parsing the full results array. */
function readSummary(filePath: string): ResultSummary | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Optimisation: try to parse only summary fields by truncating before
    // the large "results" array. Falls back to full parse on failure.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    const resultsIdx = content.indexOf('"results"');
    if (resultsIdx > 0) {
      const truncated =
        content.slice(0, resultsIdx).replace(/,\s*$/, "") + "}";
      try {
        data = JSON.parse(truncated);
      } catch {
        data = JSON.parse(content);
      }
    } else {
      data = JSON.parse(content);
    }

    const relPath = path.relative(RESULTS_DIR, filePath);
    const dirName = path.dirname(relPath);

    // Extract timestamp from filename: eval_results_YYYYMMDD_HHMMSS.json
    const match = path.basename(filePath).match(/eval_results_(\d{8}_\d{6})/);
    const timestamp = match ? match[1] : "";

    return {
      id: hashPath(relPath),
      filePath: relPath,
      dirName,
      timestamp,
      total: data.total ?? 0,
      correct: data.correct ?? 0,
      accuracy: data.accuracy ?? 0,
      accuracyRelaxed: data.accuracy_relaxed ?? 0,
      byDifficulty: data.by_difficulty ?? {},
      runConfig: data.run_config ?? null,
    };
  } catch {
    return null;
  }
}

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

export async function GET() {
  try {
    // In hosted mode, serve the pre-built manifest instead of scanning filesystem
    if (IS_HOSTED) {
      const manifestPath = path.join(process.cwd(), "public", "data", "manifest.json");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        return NextResponse.json(manifest, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      }
      return NextResponse.json({ results: [] });
    }

    const files = findResultFiles(RESULTS_DIR);
    const summaries: ResultSummary[] = [];

    for (const file of files) {
      const summary = readSummary(file);
      if (summary) summaries.push(summary);
    }

    // Sort newest first (by timestamp descending)
    summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json(
      { results: summaries },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
