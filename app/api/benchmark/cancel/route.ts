import { NextResponse } from "next/server";
import { cancelBenchmark } from "../../../lib/benchmark-state";
import { hostedModeGuard } from "../../../lib/guards";

export const runtime = "nodejs";

export async function POST() {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;
  const cancelled = cancelBenchmark();
  return NextResponse.json({ cancelled });
}
