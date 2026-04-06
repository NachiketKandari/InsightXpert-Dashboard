/**
 * Pipeline flag definitions — single source of truth.
 *
 * When you add a new CLI flag to `python -m insightxpert ask`, add an entry
 * here and the dashboard UI will automatically render the control.
 */

export interface FlagDef {
  /** CLI flag name without leading --, e.g. "linking-mode" */
  flag: string;
  /** camelCase key used in the request body and React state */
  key: string;
  /** Display label in the UI */
  label: string;
  /** Control type for dynamic rendering */
  type: "boolean" | "choice" | "int" | "string";
  /** Default value (matches the Python CLI default) */
  default: boolean | string | number;
  /** For "choice" type only */
  choices?: string[];
  /** For "int" type only */
  min?: number;
  max?: number;
  /** Short help text shown below the control */
  description: string;
  /** Visual grouping in the UI panel */
  group: "linking" | "refinement" | "generation" | "model" | "metadata" | "evaluate";
}

export const PIPELINE_FLAGS: FlagDef[] = [
  // ── Linking ──
  {
    flag: "linking-mode",
    key: "linkingMode",
    label: "Linking Mode",
    type: "choice",
    default: "multi-variant",
    choices: ["multi-variant", "single-prompt", "none"],
    description: "Schema linking strategy (multi-variant=5 LLM calls, single-prompt=1, none=full schema)",
    group: "linking",
  },
  {
    flag: "evidence-profile",
    key: "evidenceProfile",
    label: "Evidence Profile",
    type: "boolean",
    default: false,
    description: "Use evidence-backed profile and vector index",
    group: "linking",
  },
  {
    flag: "literal-revision",
    key: "literalRevision",
    label: "Literal Revision",
    type: "boolean",
    default: false,
    description: "Iterative literal-field revision during schema linking",
    group: "linking",
  },

  // ── Refinement ──
  {
    flag: "no-refinement",
    key: "noRefinement",
    label: "Disable Refinement",
    type: "boolean",
    default: false,
    description: "Skip SQL self-refinement (Phase 5 feedback loop)",
    group: "refinement",
  },
  {
    flag: "max-refinement-iterations",
    key: "maxRefinementIterations",
    label: "Max Refinement Iters",
    type: "int",
    default: 2,
    min: 1,
    max: 5,
    description: "Maximum refinement iterations",
    group: "refinement",
  },

  // ── Generation ──
  {
    flag: "num-candidates",
    key: "numCandidates",
    label: "Num Candidates",
    type: "int",
    default: 1,
    min: 1,
    max: 5,
    description: "SQL candidates to generate (>1 enables majority voting)",
    group: "generation",
  },
  {
    flag: "construction-checks",
    key: "constructionChecks",
    label: "Construction Checks",
    type: "boolean",
    default: false,
    description: "Fix SQL anti-patterns (ORDER BY→MIN/MAX, concat→columns)",
    group: "generation",
  },

  // ── Model ──
  {
    flag: "model",
    key: "model",
    label: "Model",
    type: "string",
    default: "",
    description: "Override Gemini model (blank = .env default)",
    group: "model",
  },
  {
    flag: "thinking-level",
    key: "thinkingLevel",
    label: "Thinking Level",
    type: "choice",
    default: "",
    choices: ["", "none", "low", "medium", "high"],
    description: "Override Gemini thinking level (blank = .env default)",
    group: "model",
  },

  // ── Metadata ──
  {
    flag: "metadata-mode",
    key: "metadataMode",
    label: "Metadata Mode",
    type: "choice",
    default: "profiling",
    choices: ["none", "bird", "profiling", "fused"],
    description: "Column metadata: none=raw schema, bird=CSV, profiling=LLM summaries, fused=both",
    group: "metadata",
  },
  {
    flag: "benchmark",
    key: "benchmark",
    label: "Benchmark",
    type: "choice",
    default: "mini_dev",
    choices: ["bird_dev", "mini_dev"],
    description: "Which benchmark dataset to use",
    group: "metadata",
  },
];

/**
 * Evaluate-specific flags — only used when running `python -m insightxpert evaluate`.
 * These don't apply to single-question `ask` runs.
 */
export const EVALUATE_FLAGS: FlagDef[] = [
  {
    flag: "db",
    key: "db",
    label: "Database",
    type: "string",
    default: "",
    description: "Filter to a single database (blank = all databases)",
    group: "evaluate",
  },
  {
    flag: "difficulty",
    key: "difficulty",
    label: "Difficulty",
    type: "choice",
    default: "",
    choices: ["", "simple", "moderate", "challenging"],
    description: "Filter by difficulty (blank = all)",
    group: "evaluate",
  },
  {
    flag: "limit",
    key: "limit",
    label: "Limit",
    type: "int",
    default: 0,
    min: 0,
    max: 2000,
    description: "Max questions to evaluate (0 = unlimited)",
    group: "evaluate",
  },
  {
    flag: "max-concurrent",
    key: "maxConcurrent",
    label: "Max Concurrent",
    type: "int",
    default: 1,
    min: 1,
    max: 20,
    description: "Parallel question processing (1 = sequential)",
    group: "evaluate",
  },
  {
    flag: "resume",
    key: "resume",
    label: "Resume",
    type: "boolean",
    default: false,
    description: "Resume from checkpoint (skip already-evaluated questions)",
    group: "evaluate",
  },
  {
    flag: "no-evidence",
    key: "noEvidence",
    label: "No Evidence",
    type: "boolean",
    default: false,
    description: "Strip evidence from all test cases",
    group: "evaluate",
  },
];

/** Return default values keyed by flag `key`. */
export function getDefaults(): Record<string, boolean | string | number> {
  const defaults: Record<string, boolean | string | number> = {};
  for (const f of PIPELINE_FLAGS) {
    defaults[f.key] = f.default;
  }
  return defaults;
}

/** Return default values for evaluate-specific flags. */
export function getEvalDefaults(): Record<string, boolean | string | number> {
  const defaults: Record<string, boolean | string | number> = {};
  for (const f of EVALUATE_FLAGS) {
    defaults[f.key] = f.default;
  }
  return defaults;
}

/**
 * Convert flag values into CLI args, applying consistent rules:
 * - boolean: emit `--flag` only when true
 * - string: emit `--flag value` only when non-empty
 * - choice/int: ALWAYS emit — avoids Python CLI default mismatches
 */
function flagsToArgs(flags: FlagDef[], values: Record<string, unknown>): string[] {
  const args: string[] = [];

  for (const f of flags) {
    const val = values[f.key] ?? f.default;

    if (f.type === "boolean") {
      if (val === true) args.push(`--${f.flag}`);
    } else if (f.type === "string") {
      if (val !== "" && val !== undefined) args.push(`--${f.flag}`, String(val));
    } else {
      // choice / int — always emit so Python CLI defaults don't shadow UI values
      args.push(`--${f.flag}`, String(val));
    }
  }

  return args;
}

/**
 * Build CLI args for `python -m insightxpert ask`.
 */
export function buildCliArgs(values: Record<string, unknown>): string[] {
  return flagsToArgs(PIPELINE_FLAGS, values);
}

/**
 * Build CLI args for `python -m insightxpert evaluate`.
 * Combines pipeline flags + evaluate-specific flags.
 */
export function buildEvalCliArgs(
  pipelineValues: Record<string, unknown>,
  evalValues: Record<string, unknown>
): string[] {
  return [
    ...flagsToArgs(PIPELINE_FLAGS, pipelineValues),
    ...flagsToArgs(EVALUATE_FLAGS, evalValues),
  ];
}
