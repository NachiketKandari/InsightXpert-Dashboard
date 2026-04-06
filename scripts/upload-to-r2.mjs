#!/usr/bin/env node

/**
 * Upload evaluation result JSON files to Cloudflare R2.
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs [--source <dir>]
 *
 * Requires env vars: R2_ACCOUNT_ID, R2_API_TOKEN, R2_BUCKET
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: path.join(process.cwd(), "data", "results") },
  },
});

const SOURCE_DIR = path.resolve(values.source);
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const API_TOKEN = process.env.R2_API_TOKEN;
const BUCKET = process.env.R2_BUCKET || "insightxpert-results";

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Error: R2_ACCOUNT_ID and R2_API_TOKEN env vars are required");
  process.exit(1);
}

function findResultFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findResultFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = findResultFiles(SOURCE_DIR);
console.log(`Found ${files.length} files in ${SOURCE_DIR}`);

let uploaded = 0;
let failed = 0;

for (const file of files) {
  const key = path.relative(SOURCE_DIR, file);
  const body = fs.readFileSync(file);
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${files.length}`);
  } catch (err) {
    failed++;
    console.error(`\n  Failed: ${key} — ${err.message}`);
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
