export interface DiagnosisRecord {
  qid: number;
  db: string;
  diff: string;
  q: string;
  issue: string;
  issue_detail: string;
  issue_other: string | null;
  resolution: string;
  resolution_detail: string;
  resolution_other: string | null;
  prompt_change: string | null;
  confidence: string;
  pred_sql: string;
  gold_sql: string;
  execution_match: boolean;
  error: string | null;
  prompt: string | null;
}

// ── Pipeline re-run response types (mirrors Python QueryResponse) ──

export interface CandidateSQL {
  sql: string;
  prompt: string;
  reasoning: string;
  confidence: number;
}

export interface LinkedField {
  table: string;
  column: string;
}

export interface SchemaLinkResult {
  linked_tables: string[];
  linked_columns: LinkedField[];
  literals_found: string[];
  variant_contributions: Record<string, number>;
  schema_text: string;
  question_interpretation: string;
}

export interface RefinedSQL {
  sql: string;
  changes: string[];
  iterations: number;
  original_sql: string;
  final_error: string | null;
}

export interface PipelineQueryResult {
  sql: string;
  rows: unknown[][];
  columns: string[];
  error: string | null;
}

export interface PipelineResponse {
  request: { question: string; db_id: string; evidence: string };
  candidate: CandidateSQL | null;
  refined: RefinedSQL | null;
  result: PipelineQueryResult | null;
  linked_schema: SchemaLinkResult | null;
  all_candidates: CandidateSQL[] | null;
  all_results: PipelineQueryResult[] | null;
  vote_method: string | null;
}

// ── Sankey types ──

export interface SankeyNode {
  name: string;
  layer: number;
  index?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
}

export interface SankeyLink {
  source: number | SankeyNode;
  target: number | SankeyNode;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
}
