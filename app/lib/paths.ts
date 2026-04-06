import path from "path";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

// In hosted mode, results are pre-bundled into public/data/ by the build script.
// In local mode, results live in data/results/ (copied from InsightXpert) or an override.
export const RESULTS_DIR = IS_HOSTED
  ? path.join(process.cwd(), "public", "data")
  : process.env.RESULTS_DIR || path.join(process.cwd(), "data", "results");

// InsightXpert repo root — only needed for local mode (Python CLI, DBs, prompts).
const REPO_ROOT = process.env.INSIGHTXPERT_REPO
  ? path.resolve(process.env.INSIGHTXPERT_REPO)
  : path.resolve(process.cwd(), "../InsightXpert");

export { REPO_ROOT };

export const VENV_PYTHON =
  process.env.VENV_PYTHON || path.join(REPO_ROOT, ".venv/bin/python");

export const DB_ROOT =
  process.env.DB_ROOT ||
  path.join(REPO_ROOT, "Test/mini_dev/minidev/MINIDEV/dev_databases");

export const PROMPTS_DIR =
  process.env.PROMPTS_DIR ||
  path.join(REPO_ROOT, "src/insightxpert/prompts");
