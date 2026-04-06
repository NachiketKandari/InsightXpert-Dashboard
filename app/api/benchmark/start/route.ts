import { NextRequest, NextResponse } from "next/server";
import { startBenchmark, getStatus } from "../../../lib/benchmark-state";
import { buildEvalCliArgs } from "../../../lib/pipeline-flags";
import { VENV_PYTHON } from "../../../lib/paths";
import { hostedModeGuard } from "../../../lib/guards";
import fs from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;

  try {
    // Check if already running
    const status = getStatus();
    if (status.running) {
      return NextResponse.json(
        { error: "A benchmark is already running", runId: status.runId },
        { status: 409 }
      );
    }

    if (!fs.existsSync(VENV_PYTHON)) {
      return NextResponse.json(
        { error: `Python venv not found at ${VENV_PYTHON}` },
        { status: 500 }
      );
    }

    const { pipelineFlags, evalFlags } = await req.json();

    const cliArgs = buildEvalCliArgs(
      pipelineFlags || {},
      evalFlags || {}
    );

    const runId = crypto.randomUUID();
    const config = { pipelineFlags, evalFlags };

    startBenchmark(runId, cliArgs, config);

    return NextResponse.json({ runId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
