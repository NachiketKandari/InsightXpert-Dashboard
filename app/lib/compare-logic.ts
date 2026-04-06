import type { DiagnosisRecord } from "./types";
import type {
  LoadedRun,
  RunConfig,
  ComparedQuestion,
  ComparisonResult,
  DifficultyStats,
} from "./compare-types";
import { normalizeData, extractRunConfig, extractReportMeta } from "./normalize";

const RUN_COLORS = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#22c55e", // green
  "#a855f7", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
  "#eab308", // yellow
  "#ec4899", // pink
];

const DIFF_ORDER = ["simple", "moderate", "challenging"];

/** Derive a short human-readable label from run config. */
export function deriveRunLabel(config: RunConfig | null, fileName: string): string {
  if (!config) return fileName.replace(/\.json$/, "");

  const parts: string[] = [];

  if (config.model) {
    // Shorten common model names
    const m = String(config.model)
      .replace("gemini-", "")
      .replace("-preview", "");
    parts.push(m);
  }

  if (config.linking_mode && config.linking_mode !== "multi-variant") {
    parts.push(config.linking_mode);
  }

  if (config.use_evidence === true) parts.push("evidence");
  if (config.use_evidence === false) parts.push("no-evidence");

  return parts.length > 0 ? parts.join(" / ") : fileName.replace(/\.json$/, "");
}

/** Load a File into a LoadedRun. */
export function loadRunFromFile(
  file: File,
  index: number
): Promise<LoadedRun> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const records = normalizeData(raw);
        const config = extractRunConfig(raw);
        const meta = extractReportMeta(raw);

        const recordMap = new Map<number, DiagnosisRecord>();
        for (const r of records) {
          recordMap.set(r.qid, r);
        }

        resolve({
          id: crypto.randomUUID(),
          fileName: file.name,
          label: deriveRunLabel(config, file.name),
          color: RUN_COLORS[index % RUN_COLORS.length],
          runConfig: config,
          totalQuestions: meta.total || records.length,
          accuracy: meta.accuracy,
          records: recordMap,
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.readAsText(file);
  });
}

/** Compute the full comparison across N loaded runs. */
export function computeComparison(runs: LoadedRun[]): ComparisonResult {
  if (runs.length < 2) {
    return { runs, commonCount: 0, questions: [], byDifficulty: [] };
  }

  // Intersect question IDs across all runs
  let commonIds = new Set<number>(runs[0].records.keys());
  for (let i = 1; i < runs.length; i++) {
    const ids = runs[i].records;
    commonIds = new Set([...commonIds].filter((id) => ids.has(id)));
  }

  // Build ComparedQuestion for each common question
  const questions: ComparedQuestion[] = [];
  for (const qid of commonIds) {
    const first = runs[0].records.get(qid)!;

    const results = new Map<string, { execution_match: boolean; pred_sql: string; error: string | null; prompt: string | null }>();
    let allMatch = true;
    let noneMatch = true;

    for (const run of runs) {
      const rec = run.records.get(qid)!;
      results.set(run.id, {
        execution_match: rec.execution_match,
        pred_sql: rec.pred_sql,
        error: rec.error,
        prompt: rec.prompt,
      });
      if (rec.execution_match) noneMatch = false;
      else allMatch = false;
    }

    const category = allMatch ? "all_correct" : noneMatch ? "all_wrong" : "mixed";

    questions.push({
      qid,
      db: first.db,
      diff: first.diff,
      question: first.q,
      gold_sql: first.gold_sql,
      evidence: "",
      results,
      category,
    });
  }

  // Sort by difficulty order, then qid
  questions.sort((a, b) => {
    const da = DIFF_ORDER.indexOf(a.diff);
    const db = DIFF_ORDER.indexOf(b.diff);
    if (da !== db) return da - db;
    return a.qid - b.qid;
  });

  // Compute per-difficulty stats
  const byDifficulty = computeDifficultyStats(questions, runs);

  return {
    runs,
    commonCount: commonIds.size,
    questions,
    byDifficulty,
  };
}

function computeDifficultyStats(
  questions: ComparedQuestion[],
  runs: LoadedRun[]
): DifficultyStats[] {
  const groups = new Map<string, ComparedQuestion[]>();
  groups.set("all", questions);

  for (const q of questions) {
    const list = groups.get(q.diff) || [];
    list.push(q);
    groups.set(q.diff, list);
  }

  const order = ["all", ...DIFF_ORDER];
  const stats: DifficultyStats[] = [];

  for (const diff of order) {
    const qs = groups.get(diff);
    if (!qs || qs.length === 0) continue;

    const perRun = runs.map((run) => {
      const correct = qs.filter(
        (q) => q.results.get(run.id)?.execution_match === true
      ).length;
      return {
        runId: run.id,
        correct,
        pct: qs.length > 0 ? (correct / qs.length) * 100 : 0,
      };
    });

    stats.push({
      difficulty: diff,
      total: qs.length,
      perRun,
      allCorrect: qs.filter((q) => q.category === "all_correct").length,
      allWrong: qs.filter((q) => q.category === "all_wrong").length,
    });
  }

  return stats;
}
