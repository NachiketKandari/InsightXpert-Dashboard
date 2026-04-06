/**
 * Server-side singleton managing the benchmark subprocess.
 * Module-level state persists across requests in the same Node.js process.
 */

import { execFile, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import fs from "fs";
import path from "path";
import { VENV_PYTHON, REPO_ROOT, RESULTS_DIR } from "./paths";
import { parseProgressLine } from "./progress-parser";
import type { ProgressEvent, BenchmarkStatus } from "./benchmark-types";

const MAX_EVENTS = 10_000;

interface RunState {
  runId: string;
  process: ChildProcess;
  startTime: number;
  config: Record<string, unknown>;
  events: ProgressEvent[];
  completed: number;
  total: number;
  correct: number;
  failed: number;
  done: boolean;
  exitCode: number | null;
}

let currentRun: RunState | null = null;

export function startBenchmark(
  runId: string,
  cliArgs: string[],
  config: Record<string, unknown>
): void {
  if (currentRun && !currentRun.done) {
    throw new Error("A benchmark is already running");
  }

  const proc = execFile(
    VENV_PYTHON,
    ["-m", "insightxpert", "evaluate", ...cliArgs],
    {
      cwd: REPO_ROOT,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    }
  );

  const state: RunState = {
    runId,
    process: proc,
    startTime: Date.now(),
    config,
    events: [],
    completed: 0,
    total: 0,
    correct: 0,
    failed: 0,
    done: false,
    exitCode: null,
  };

  currentRun = state;

  // Parse stderr line by line
  if (proc.stderr) {
    const rl = createInterface({ input: proc.stderr });
    rl.on("line", (line) => {
      const event = parseProgressLine(line, state.events.length);
      if (!event) return;

      // Update counters
      if (event.type === "question") {
        state.completed = event.completed;
        state.total = event.total;
        if (event.match) state.correct++;
        else state.failed++;
      } else if (event.type === "error") {
        state.completed = event.completed;
        state.total = event.total;
        state.failed++;
      } else if (event.type === "meta" && event.totalCases) {
        state.total = event.totalCases;
      }

      // Buffer event (bounded)
      if (state.events.length >= MAX_EVENTS) {
        state.events.shift();
      }
      state.events.push(event);
    });
  }

  // Handle process exit
  proc.on("exit", (code, signal) => {
    state.done = true;
    state.exitCode = code;

    // Try to find the results file
    let resultsPath: string | null = null;
    try {
      resultsPath = findLatestResultFile();
    } catch {
      // ignore
    }

    const doneEvent: ProgressEvent = {
      type: "done",
      index: state.events.length,
      exitCode: code,
      signal: signal || null,
      resultsPath,
      timestamp: Date.now(),
    };

    if (state.events.length >= MAX_EVENTS) {
      state.events.shift();
    }
    state.events.push(doneEvent);
  });

  proc.on("error", (err) => {
    state.done = true;
    state.exitCode = -1;

    const doneEvent: ProgressEvent = {
      type: "done",
      index: state.events.length,
      exitCode: -1,
      signal: null,
      resultsPath: null,
      timestamp: Date.now(),
    };
    state.events.push(doneEvent);
    console.error("Benchmark process error:", err.message);
  });
}

export function cancelBenchmark(): boolean {
  if (!currentRun || currentRun.done) return false;

  const proc = currentRun.process;
  proc.kill("SIGTERM");

  // Force kill after 5 seconds
  setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already dead
    }
  }, 5000);

  return true;
}

export function getStatus(): BenchmarkStatus {
  if (!currentRun) {
    return {
      running: false,
      runId: null,
      completed: 0,
      total: 0,
      correct: 0,
      failed: 0,
      elapsed: 0,
      config: null,
    };
  }

  return {
    running: !currentRun.done,
    runId: currentRun.runId,
    completed: currentRun.completed,
    total: currentRun.total,
    correct: currentRun.correct,
    failed: currentRun.failed,
    elapsed: (Date.now() - currentRun.startTime) / 1000,
    config: currentRun.config,
  };
}

export function getEvents(sinceIndex: number): ProgressEvent[] {
  if (!currentRun) return [];

  // Events may have shifted due to MAX_EVENTS cap
  const firstEventIndex = currentRun.events.length > 0
    ? currentRun.events[0].index
    : 0;

  if (sinceIndex < firstEventIndex) {
    // Client is too far behind — send everything we have
    return [...currentRun.events];
  }

  const offset = sinceIndex - firstEventIndex;
  return currentRun.events.slice(offset);
}

export function isDone(): boolean {
  return currentRun ? currentRun.done : true;
}

/** Find the most recently created eval_results_*.json file. */
function findLatestResultFile(): string | null {
  if (!fs.existsSync(RESULTS_DIR)) return null;

  let latestPath: string | null = null;
  let latestMtime = 0;

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (
        entry.name.startsWith("eval_results_") &&
        entry.name.endsWith(".json")
      ) {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > latestMtime) {
          latestPath = full;
          latestMtime = stat.mtimeMs;
        }
      }
    }
  }

  scan(RESULTS_DIR);
  return latestPath ? path.relative(RESULTS_DIR, latestPath) : null;
}
