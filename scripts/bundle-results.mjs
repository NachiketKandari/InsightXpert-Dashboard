#!/usr/bin/env node

/**
 * Bundle evaluation result JSON files for Vercel deployment.
 *
 * Scans a source directory for eval_results_*.json files, extracts summary
 * metadata (without the large results array), copies full files into
 * public/data/, and writes a manifest.json index.
 *
 * Usage:
 *   node scripts/bundle-results.mjs [--source <dir>] [--latest <N>]
 *
 * Defaults:
 *   --source  data/results/
 *   --latest  0 (all files)
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: path.join(process.cwd(), "data", "results") },
    latest: { type: "string", default: "0" },
  },
});

const SOURCE_DIR = path.resolve(values.source);
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const latestN = parseInt(values.latest, 10) || 0;

function findResultFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findResultFiles(fullPath));
    } else if (entry.isFile() && (entry.name.startsWith("eval_results_") || entry.name.startsWith("diagnosed_")) && entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

function readSummary(filePath, relPath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    let data;
    const resultsIdx = content.indexOf('"results"');
    if (resultsIdx > 0) {
      const truncated = content.slice(0, resultsIdx).replace(/,\s*$/, "") + "}";
      try { data = JSON.parse(truncated); } catch { data = JSON.parse(content); }
    } else {
      data = JSON.parse(content);
    }

    const dirName = path.dirname(relPath);
    const match = path.basename(filePath).match(/eval_results_(\d{8}_\d{6})/);
    const timestamp = match ? match[1] : "";

    // Simple hash for stable IDs
    let h = 0;
    for (let i = 0; i < relPath.length; i++) {
      h = ((h << 5) - h + relPath.charCodeAt(i)) | 0;
    }
    const id = Math.abs(h).toString(36);

    return {
      id,
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

// --- Main ---

console.log(`Scanning: ${SOURCE_DIR}`);
let files = findResultFiles(SOURCE_DIR);

// Sort newest first by timestamp in filename
files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));

if (latestN > 0 && files.length > latestN) {
  console.log(`Limiting to latest ${latestN} of ${files.length} files`);
  files = files.slice(0, latestN);
}

console.log(`Found ${files.length} result files`);

// Clean and recreate output dir
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const summaries = [];

for (const file of files) {
  const relPath = path.relative(SOURCE_DIR, file);
  const destPath = path.join(OUTPUT_DIR, relPath);

  // Copy the full file
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(file, destPath);

  // Extract summary
  const summary = readSummary(file, relPath);
  if (summary) summaries.push(summary);
}

// Sort newest first
summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

// Write manifest
const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({ results: summaries }, null, 2));

const totalSizeMB = files.reduce((acc, f) => acc + fs.statSync(f).size, 0) / (1024 * 1024);
console.log(`Bundled ${files.length} files (${totalSizeMB.toFixed(1)} MB) into ${OUTPUT_DIR}`);
console.log(`Manifest written: ${manifestPath} (${summaries.length} entries)`);
