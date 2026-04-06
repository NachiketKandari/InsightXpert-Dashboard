import type { DiagnosisRecord } from "./types";

export interface RunConfig {
  model: string;
  linking_mode: string;
  thinking_level: string;
  use_evidence: boolean;
  [key: string]: unknown;
}

export interface LoadedRun {
  id: string;
  fileName: string;
  label: string;
  color: string;
  runConfig: RunConfig | null;
  totalQuestions: number;
  accuracy: number;
  records: Map<number, DiagnosisRecord>;
}

export interface RunQuestionResult {
  execution_match: boolean;
  pred_sql: string;
  error: string | null;
  prompt: string | null;
}

export interface ComparedQuestion {
  qid: number;
  db: string;
  diff: string;
  question: string;
  gold_sql: string;
  evidence: string;
  results: Map<string, RunQuestionResult>;
  category: "all_correct" | "all_wrong" | "mixed";
}

export interface DifficultyStats {
  difficulty: string;
  total: number;
  perRun: { runId: string; correct: number; pct: number }[];
  allCorrect: number;
  allWrong: number;
}

export interface ComparisonResult {
  runs: LoadedRun[];
  commonCount: number;
  questions: ComparedQuestion[];
  byDifficulty: DifficultyStats[];
}
