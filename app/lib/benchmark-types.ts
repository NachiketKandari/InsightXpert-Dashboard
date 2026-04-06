export interface QuestionEvent {
  type: "question";
  index: number;
  completed: number;
  total: number;
  qid: number;
  match: boolean;
  error: string | null;
  timestamp: number;
}

export interface MetaEvent {
  type: "meta";
  index: number;
  totalCases?: number;
  resumed?: number;
  timestamp: number;
}

export interface ErrorEvent {
  type: "error";
  index: number;
  completed: number;
  total: number;
  qid: number;
  error: string;
  timestamp: number;
}

export interface DoneEvent {
  type: "done";
  index: number;
  exitCode: number | null;
  signal: string | null;
  resultsPath: string | null;
  timestamp: number;
}

export type ProgressEvent = QuestionEvent | MetaEvent | ErrorEvent | DoneEvent;

export interface BenchmarkStatus {
  running: boolean;
  runId: string | null;
  completed: number;
  total: number;
  correct: number;
  failed: number;
  elapsed: number;
  config: Record<string, unknown> | null;
}
