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

// --- Main ---

const files = findResultFiles(SOURCE_DIR);
console.log(`Found ${files.length} JSON files in ${SOURCE_DIR}`);

let uploaded = 0;
let failed = 0;

for (const file of files) {
  const key = path.relative(SOURCE_DIR, file);
  const body = fs.readFileSync(file);

  try {
    const { url, headers } = signRequest("PUT", key, body, "application/json");
    const resp = await fetch(url, {
      method: "PUT",
      headers,
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${files.length}`);
  } catch (err) {
    failed++;
    console.error(`\n  Failed: ${key} — ${err.message}`);
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
