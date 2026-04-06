import type { DiagnosisRecord } from "./types";
import type { RunConfig } from "./compare-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Normalize any of the three JSON formats into DiagnosisRecord[]:
 *
 * 1. Raw eval results  — { results: [{ question_id, db_id, ... }] }
 * 2. Diagnosed results  — { results: [{ question_id, db_id, ..., diagnosis: {...} }] }
 * 3. Compact viz format — [{ qid, db, q, diff, ... }]
 */
export function normalizeData(raw: any): DiagnosisRecord[] {
  // Detect format
  let items: any[];

  if (Array.isArray(raw)) {
    // Format 3: compact array
    items = raw;
  } else if (raw.results && Array.isArray(raw.results)) {
    // Format 1 or 2: eval report with results array
    items = raw.results;
  } else {
    throw new Error("Unrecognized JSON format: expected an array or an object with a 'results' key");
  }

  return items.map(normalizeRecord);
}

/** Extract run_config from a raw eval report JSON, if present. */
export function extractRunConfig(raw: any): RunConfig | null {
  if (raw && typeof raw === "object" && raw.run_config) {
    return raw.run_config as RunConfig;
  }
  return null;
}

/** Extract top-level report metadata (total, accuracy). */
export function extractReportMeta(raw: any): { total: number; accuracy: number } {
  return {
    total: raw?.total ?? 0,
    accuracy: raw?.accuracy ?? 0,
  };
}

function normalizeRecord(r: any): DiagnosisRecord {
  // Already in compact format?
  if ("qid" in r && "db" in r && "diff" in r) {
    return {
      qid: r.qid,
      db: r.db,
      diff: r.diff,
      q: r.q || r.question || "",
      issue: r.issue || "undiagnosed",
      issue_detail: r.issue_detail || "",
      issue_other: r.issue_other ?? null,
      resolution: r.resolution || "undiagnosed",
      resolution_detail: r.resolution_detail || "",
      resolution_other: r.resolution_other ?? null,
      prompt_change: r.prompt_change ?? null,
      confidence: r.confidence || "",
      pred_sql: r.pred_sql || "",
      gold_sql: r.gold_sql || "",
      execution_match: r.execution_match ?? false,
      error: r.error ?? null,
      prompt: r.prompt ?? null,
    };
  }

  // EvalResult format (raw or diagnosed)
  const diag = r.diagnosis || {};

  return {
    qid: r.question_id,
    db: r.db_id,
    diff: r.difficulty || "unknown",
    q: r.question || "",
    issue: diag.issue_type || "undiagnosed",
    issue_detail: diag.issue_detail || "",
    issue_other: diag.issue_type_other ?? null,
    resolution: diag.resolution_type || "undiagnosed",
    resolution_detail: diag.resolution_detail || "",
    resolution_other: diag.resolution_type_other ?? null,
    prompt_change: diag.prompt_change ?? null,
    confidence: diag.confidence || "",
    pred_sql: r.refined_sql || r.predicted_sql || "",
    gold_sql: r.gold_sql || "",
    execution_match: r.execution_match ?? false,
    error: r.error ?? null,
    prompt: r.prompt ?? null,
  };
}
