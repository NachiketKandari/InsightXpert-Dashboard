import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { buildCliArgs } from "../../lib/pipeline-flags";
import { REPO_ROOT, VENV_PYTHON } from "../../lib/paths";
import { hostedModeGuard } from "../../lib/guards";
const TIMEOUT_MS = 120_000; // 2 min — LLM pipelines can be slow
const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB for large schema JSON output

/** Map of template key → .j2 filename */
const TEMPLATE_FILES: Record<string, string> = {
  sql_generation: "sql_generation.j2",
  refine_sql: "refine_sql.j2",
  trial_query: "trial_query.j2",
  single_prompt_linking: "single_prompt_linking.j2",
};

export async function POST(req: NextRequest) {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;

  let promptDir: string | null = null;

  try {
    const { question, db_id, evidence, flags, prompts } = await req.json();

    if (!question || !db_id) {
      return NextResponse.json(
        { error: "question and db_id are required" },
        { status: 400 }
      );
    }

    if (/[^a-zA-Z0-9_-]/.test(db_id)) {
      return NextResponse.json(
        { error: "Invalid db_id" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(VENV_PYTHON)) {
      return NextResponse.json(
        { error: `Python venv not found at ${VENV_PYTHON}` },
        { status: 500 }
      );
    }

    // Write prompt overrides to a temp directory if provided
    if (prompts && typeof prompts === "object") {
      promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "ixpert-prompts-"));
      for (const [key, content] of Object.entries(prompts)) {
        const filename = TEMPLATE_FILES[key];
        if (filename && typeof content === "string") {
          fs.writeFileSync(path.join(promptDir, filename), content, "utf-8");
        }
      }
    }

    const flagArgs = flags ? buildCliArgs(flags) : [];
    const cmdArgs = [
      "-m", "insightxpert", "ask",
      "--json",
      "--db", db_id,
      ...flagArgs,
    ];
    if (promptDir) {
      cmdArgs.push("--prompt-dir", promptDir);
    }
    if (evidence) {
      cmdArgs.push("--evidence", evidence);
    }
    cmdArgs.push(question);

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          VENV_PYTHON,
          cmdArgs,
          { cwd: REPO_ROOT, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
          (error, stdout, stderr) => {
            if (error) {
              reject({ error, stdout, stderr });
            } else {
              resolve({ stdout, stderr });
            }
          }
        );
      }
    ).catch((err: { error: Error; stdout: string; stderr: string }) => {
      const msg = err.error.message || "Pipeline execution failed";
      const stderrTail = (err.stderr || "").split("\n").slice(-20).join("\n");
      throw new Error(`${msg}\n\n--- stderr (last 20 lines) ---\n${stderrTail}`);
    });

    if (!stdout || stdout.trim().length === 0) {
      const stderrTail = (stderr || "").split("\n").slice(-10).join("\n");
      throw new Error(`Pipeline produced no output.\n\n--- stderr ---\n${stderrTail}`);
    }

    const parsed = JSON.parse(stdout);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // Clean up temp prompt directory
    if (promptDir) {
      fs.rmSync(promptDir, { recursive: true, force: true });
    }
  }
}
