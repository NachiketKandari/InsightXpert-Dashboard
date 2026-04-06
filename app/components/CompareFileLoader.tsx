"use client";

import { useRef, useState } from "react";
import type { LoadedRun } from "../lib/compare-types";
import { loadRunFromFile } from "../lib/compare-logic";

interface Props {
  onCompare: (runs: LoadedRun[]) => void;
}

export default function CompareFileLoader({ onCompare }: Props) {
  const [runs, setRuns] = useState<LoadedRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const newRuns: LoadedRun[] = [];
      const startIdx = runs.length;
      for (let i = 0; i < files.length; i++) {
        const run = await loadRunFromFile(files[i], startIdx + i);
        newRuns.push(run);
      }
      setRuns((prev) => [...prev, ...newRuns]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeRun(id: string) {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // Compute intersection size for preview
  let intersectionSize = 0;
  if (runs.length >= 2) {
    let common = new Set<number>(runs[0].records.keys());
    for (let i = 1; i < runs.length; i++) {
      const records = runs[i].records;
      common = new Set([...common].filter((id) => records.has(id)));
    }
    intersectionSize = common.size;
  }

  // Check benchmark mismatch
  const benchmarks = new Set(
    runs.map((r) => r.runConfig?.benchmark).filter(Boolean)
  );
  const benchmarkWarning = benchmarks.size > 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-200 p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Compare Runs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Load 2 or more evaluation JSONs to compare results across runs
            </p>
          </div>
        </div>

        {/* Run cards */}
        {runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
                style={{ borderLeftColor: run.color, borderLeftWidth: 3 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-200 truncate">
                    {run.fileName}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {run.label} — {run.totalQuestions} questions —{" "}
                    {(run.accuracy * 100).toFixed(1)}% accuracy
                  </div>
                </div>
                <button
                  onClick={() => removeRun(run.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Intersection preview */}
        {runs.length >= 2 && (
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <span className="tabular-nums">
              {intersectionSize} common questions
            </span>
            {benchmarkWarning && (
              <span className="text-yellow-500 text-xs">
                Warning: runs use different benchmarks
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="rounded-lg border border-dashed border-gray-700 px-6 py-3 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Loading..." : runs.length === 0 ? "Add JSON files" : "Add more files"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            multiple
            onChange={handleFiles}
            className="hidden"
          />

          {runs.length >= 2 && (
            <button
              onClick={() => onCompare(runs)}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors cursor-pointer"
            >
              Compare ({runs.length} runs)
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
