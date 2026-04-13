#!/usr/bin/env node

/**
 * Upload evaluation result JSON files to Cloudflare R2 via S3-compatible API.
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs [--source <dir>]
 *
 * Requires env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Optional: R2_BUCKET (default: insightxpert-results)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: path.join(process.cwd(), "data", "results") },
  },
});

const SOURCE_DIR = path.resolve(values.source);
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "insightxpert-results";
const REGION = "auto";
const HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Error: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY env vars are required");
  process.exit(1);
}

// --- AWS Signature V4 helpers ---

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function signRequest(method, objectKey, body, contentType) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(body);
  const canonicalUri = `/${BUCKET}/${objectKey}`;
  const canonicalQueryString = "";

  const headers = {
    host: HOST,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": contentType,
  };

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join("");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, "s3");
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${HOST}${canonicalUri}`,
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}

// --- File discovery ---

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

function isResultFile(name) {
  return (name.startsWith("eval_results_") || name.startsWith("diagnosed_")) && name.endsWith(".json");
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

async function uploadObject(key, body, contentType) {
  const { url, headers } = signRequest("PUT", key, body, contentType);
  const resp = await fetch(url, { method: "PUT", headers, body });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
}

// --- Main ---

const files = findResultFiles(SOURCE_DIR);
console.log(`Found ${files.length} JSON files in ${SOURCE_DIR}`);

let uploaded = 0;
let failed = 0;

for (const file of files) {
  const key = path.relative(SOURCE_DIR, file).split(path.sep).join("/");
  const body = fs.readFileSync(file);

  try {
    await uploadObject(key, body, "application/json");
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${files.length}`);
  } catch (err) {
    failed++;
    console.error(`\n  Failed: ${key} — ${err.message}`);
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);

// --- Build & upload _manifest.json ---

console.log("\nBuilding _manifest.json ...");
const summaries = [];
for (const file of files) {
  const relPath = path.relative(SOURCE_DIR, file).split(path.sep).join("/");
  if (!isResultFile(path.basename(file))) continue;
  const s = readSummary(file, relPath);
  if (s) summaries.push(s);
}
summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

const manifestBody = Buffer.from(JSON.stringify({ results: summaries }));
try {
  await uploadObject("_manifest.json", manifestBody, "application/json");
  console.log(`Uploaded _manifest.json (${summaries.length} entries, ${manifestBody.length} bytes)`);
} catch (err) {
  console.error(`Failed to upload _manifest.json — ${err.message}`);
}
