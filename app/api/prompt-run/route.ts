import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { REPO_ROOT, VENV_PYTHON } from "../../lib/paths";
import { hostedModeGuard } from "../../lib/guards";

const TIMEOUT_MS = 120_000;
const MAX_BUFFER = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;

  let promptFile: string | null = null;

  try {
    const { prompt, model, thinking_level } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt (string) is required" },
        { status: 400 },
      );
    }

    if (!fs.existsSync(VENV_PYTHON)) {
      return NextResponse.json(
        { error: `Python venv not found at ${VENV_PYTHON}` },
        { status: 500 },
      );
    }

    // Write prompt to a temp file and pipe it via stdin
    promptFile = path.join(os.tmpdir(), `ixpert-prompt-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, prompt, "utf-8");

    const cmdArgs = ["-m", "insightxpert", "prompt-run"];
    if (model) {
      cmdArgs.push("--model", String(model));
    }
    if (thinking_level) {
      cmdArgs.push("--thinking-level", String(thinking_level));
    }

    const { stdout, stderr } = await new Promise<{
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const proc = execFile(
        VENV_PYTHON,
        cmdArgs,
        {
          cwd: REPO_ROOT,
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject({ error, stdout, stderr });
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
      // Pipe the prompt file to stdin
      const stream = fs.createReadStream(promptFile!);
      stream.pipe(proc.stdin!);
    }).catch((err: { error: Error; stdout: string; stderr: string }) => {
      const msg = err.error.message || "prompt-run failed";
      const stderrTail = (err.stderr || "").split("\n").slice(-20).join("\n");
      throw new Error(`${msg}\n\n--- stderr ---\n${stderrTail}`);
    });

    if (!stdout || stdout.trim().length === 0) {
      const stderrTail = (stderr || "").split("\n").slice(-10).join("\n");
      throw new Error(
        `prompt-run produced no output.\n\n--- stderr ---\n${stderrTail}`,
      );
    }

    const parsed = JSON.parse(stdout);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (promptFile && fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile);
    }
  }
}
