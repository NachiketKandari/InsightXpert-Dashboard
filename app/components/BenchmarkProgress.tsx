"use client";

import { useRouter } from "next/navigation";
import type { BenchmarkStatus, QuestionEvent, ProgressEvent, DoneEvent } from "../lib/benchmark-types";

interface Props {
  status: BenchmarkStatus;
  questions: QuestionEvent[];
  events: ProgressEvent[];
  onCancel: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function BenchmarkProgress({ status, questions, events, onCancel }: Props) {
  const router = useRouter();

  const { completed, total, correct, failed, elapsed, running } = status;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const accPct = completed > 0 ? ((correct / completed) * 100).toFixed(1) : "0.0";
  const correctPct = total > 0 ? (correct / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;

  // Find done event for results path
  const doneEvent = events.find((e) => e.type === "done") as DoneEvent | undefined;

  // Compute per-difficulty stats from question events
  const byDiff = new Map<string, { correct: number; total: number }>();
  // We don't have difficulty in QuestionEvent, so skip per-difficulty for now

  // Recent questions (last 20)
  const recentQuestions = questions.slice(-20).reverse();

  // Error questions
  const errorQuestions = questions.filter((q) => !q.match);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-auto">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-950 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">
              {running ? "Benchmark Running" : "Benchmark Complete"}
            </h1>
            <p className="text-sm text-gray-500">
              {completed}/{total} questions — {formatElapsed(elapsed)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {running && (
              <button
                onClick={onCancel}
                className="rounded-md bg-red-600/20 border border-red-600/40 px-4 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
            {!running && doneEvent?.resultsPath && (
              <>
                <button
                  onClick={() => router.push(`/explore?file=${encodeURIComponent(doneEvent.resultsPath!)}`)}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Open in Explore
                </button>
                <button
                  onClick={() => router.push("/history")}
                  className="rounded-md border border-gray-700 bg-gray-800 px-4 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  View History
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6">
        {/* Completion banner */}
        {!running && (
          <div className={`rounded-lg border p-4 ${
            doneEvent?.exitCode === 0
              ? "border-green-700/40 bg-green-900/10"
              : "border-red-700/40 bg-red-900/10"
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold tabular-nums ${
                doneEvent?.exitCode === 0 ? "text-green-400" : "text-red-400"
              }`}>
                {accPct}%
              </span>
              <div className="text-sm">
                <p className={doneEvent?.exitCode === 0 ? "text-green-400" : "text-red-400"}>
                  {doneEvent?.exitCode === 0 ? "Benchmark completed" : "Benchmark failed or was cancelled"}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {correct} correct, {failed} wrong out of {completed} in {formatElapsed(elapsed)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main progress bar */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums text-gray-100">
                {pct.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-500">
                {completed} / {total || "?"}
              </span>
            </div>
            <span className="text-sm text-gray-400 tabular-nums">
              Accuracy: <span className="text-gray-200 font-medium">{accPct}%</span>
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-800 overflow-hidden flex">
            {correctPct > 0 && (
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${correctPct}%` }}
              />
            )}
            {failedPct > 0 && (
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${failedPct}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-gray-600">
            <span>{correct} correct</span>
            <span>{failed} wrong</span>
          </div>
        </div>

        {/* Two-column layout: recent feed + errors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent questions feed */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recent Questions
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 max-h-[400px] overflow-auto">
              {recentQuestions.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-600 text-xs">
                  {running ? "Waiting for results..." : "No questions processed"}
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {recentQuestions.map((q, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className={`font-medium ${q.match ? "text-green-400" : "text-red-400"}`}>
                        {q.match ? "Y" : "N"}
                      </span>
                      <span className="text-gray-400 font-mono">{q.qid}</span>
                      {q.error && (
                        <span className="text-gray-600 truncate flex-1" title={q.error}>
                          {q.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error log */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Failed Questions ({errorQuestions.length})
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 max-h-[400px] overflow-auto">
              {errorQuestions.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-600 text-xs">
                  No failures yet
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {errorQuestions.map((q, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-red-400 font-mono">{q.qid}</span>
                        <span className="text-gray-600 truncate" title={q.error || ""}>
                          {q.error || "wrong result"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
