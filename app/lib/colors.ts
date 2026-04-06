export const DIFF_COLORS: Record<string, string> = {
  simple: "#3fb950",
  moderate: "#d29922",
  challenging: "#f85149",
};

export const ISSUE_COLORS: Record<string, string> = {
  logic_error: "#8b5cf6",
  wrong_column: "#6366f1",
  missing_evidence: "#ec4899",
  wrong_filter: "#f97316",
  math_error: "#eab308",
  string_matching: "#22d3ee",
  wrong_aggregation: "#a78bfa",
  wrong_table: "#fb7185",
  order_limit_error: "#34d399",
  wrong_join: "#38bdf8",
  date_time_error: "#fbbf24",
  missing_distinct: "#c084fc",
  subquery_error: "#2dd4bf",
  syntax_quirk: "#94a3b8",
  other: "#64748b",
};

export const RESOLUTION_COLORS: Record<string, string> = {
  evidence_needed: "#ec4899",
  schema_enrichment: "#6366f1",
  few_shot_example: "#22d3ee",
  prompt_engineering: "#3fb950",
  refinement_gap: "#f97316",
  model_capability: "#f85149",
  linking_fix: "#a78bfa",
  other: "#64748b",
};

export function nodeColor(name: string, layer: number): string {
  if (layer === 0) return DIFF_COLORS[name] || "#8b949e";
  if (layer === 1) return ISSUE_COLORS[name] || "#8b949e";
  return RESOLUTION_COLORS[name] || "#8b949e";
}
