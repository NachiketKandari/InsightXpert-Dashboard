import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RESULTS_DIR } from "../../lib/paths";
import { getResultJson } from "../../lib/r2";

export const runtime = "nodejs";

const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN;

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

/** Check if filename is a result or diagnosis JSON. */
function isResultFile(name: string): boolean {
  return (
    (name.startsWith("eval_results_") || name.startsWith("diagnosed_")) &&
    name.endsWith(".json")
  );
}

/** Recursively find all result/diagnosis JSON files. */
function findResultFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findResultFiles(fullPath));
    } else if (entry.isFile() && isResultFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Read top-level fields from a result file without parsing the full results array. */
function readSummary(filePath: string): ResultSummary | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

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
    // In hosted mode, fetch the pre-built manifest from R2 (single request)
    if (IS_HOSTED && R2_PUBLIC_DOMAIN) {
      const manifestUrl = `https://${R2_PUBLIC_DOMAIN}/_manifest.json`;
      const resp = await fetch(manifestUrl);
      if (resp.ok) {
        const manifest = await resp.json();
        return NextResponse.json(manifest, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      }
      // Fallback: return empty
      return NextResponse.json({ results: [] });
    }

    // Local mode: scan filesystem
    const files = findResultFiles(RESULTS_DIR);
    const summaries: ResultSummary[] = [];

    for (const file of files) {
      const summary = readSummary(file);
      if (summary) summaries.push(summary);
    }

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
