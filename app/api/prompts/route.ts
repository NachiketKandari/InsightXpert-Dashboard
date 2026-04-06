import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { PROMPTS_DIR } from "../../lib/paths";
import { hostedModeGuard } from "../../lib/guards";

/** The 4 templates relevant to a pipeline ask() run. */
const PIPELINE_TEMPLATES = [
  { key: "sql_generation", file: "sql_generation.j2", label: "SQL Generation" },
  { key: "refine_sql", file: "refine_sql.j2", label: "SQL Refinement" },
  { key: "trial_query", file: "trial_query.j2", label: "Schema Linking (multi-variant)" },
  { key: "single_prompt_linking", file: "single_prompt_linking.j2", label: "Schema Linking (single-prompt)" },
];

export async function GET() {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;

  try {
    const templates: Record<string, { label: string; content: string }> = {};

    for (const t of PIPELINE_TEMPLATES) {
      const filePath = path.join(PROMPTS_DIR, t.file);
      if (fs.existsSync(filePath)) {
        templates[t.key] = {
          label: t.label,
          content: fs.readFileSync(filePath, "utf-8"),
        };
      }
    }

    return NextResponse.json({ templates });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
