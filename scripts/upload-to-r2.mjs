#!/usr/bin/env node

/**
 * Upload evaluation result JSON files to Cloudflare R2.
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs [--source <dir>]
 *
 * Requires env vars: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
 */

import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: path.join(process.cwd(), "data", "results") },
  },
});

const SOURCE_DIR = path.resolve(values.source);

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET || "insightxpert-results";

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
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }));
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${files.length}`);
  } catch (err) {
    failed++;
    console.error(`\n  Failed: ${key} — ${err.message}`);
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
