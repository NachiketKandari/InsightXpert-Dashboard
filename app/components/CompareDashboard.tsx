"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { LoadedRun, ComparisonResult } from "../lib/compare-types";
import { computeComparison, loadRunFromFile } from "../lib/compare-logic";
import CompareFileLoader from "./CompareFileLoader";
import CompareSummary from "./CompareSummary";
import CompareTable from "./CompareTable";

interface Props {
  /** Pre-loaded runs from server (e.g. from ?files= URL param) */
  initialRuns?: LoadedRun[];
}

export default function CompareDashboard({ initialRuns }: Props) {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [runs, setRuns] = useState<LoadedRun[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-compare when initialRuns are provided
  useEffect(() => {
    if (initialRuns && initialRuns.length >= 2 && !comparison) {
      setRuns(initialRuns);
      setComparison(computeComparison(initialRuns));
    }
  }, [initialRuns, comparison]);

  const handleCompare = useCallback((loadedRuns: LoadedRun[]) => {
    setRuns(loadedRuns);
    setComparison(computeComparison(loadedRuns));
  }, []);

  async function handleAddMore(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newRuns: LoadedRun[] = [...runs];
    for (let i = 0; i < files.length; i++) {
      const run = await loadRunFromFile(files[i], newRuns.length);
      newRuns.push(run);
    }
    setRuns(newRuns);
    setComparison(computeComparison(newRuns));
    if (fileRef.current) fileRef.current.value = "";
  }

  // File loading phase
  if (!comparison) {
    return <CompareFileLoader onCompare={handleCompare} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-auto">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-950 px-6 py-3 z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Compare Runs</h1>
            <p className="text-sm text-gray-500">
              {comparison.runs.length} runs — {comparison.commonCount} common
              questions
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Run color legend */}
            <div className="flex items-center gap-3 mr-2">
              {comparison.runs.map((run) => (
                <div key={run.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: run.color }}
                  />
                  <span className="text-xs text-gray-400 max-w-[100px] truncate" title={run.label}>
                    {run.label}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Add file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleAddMore}
              className="hidden"
            />

            <button
              onClick={() => {
                setComparison(null);
                setRuns([]);
              }}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              New comparison
            </button>

          </div>
        </div>
      </header>

      {/* Summary */}
      <section className="shrink-0 px-6 py-4 border-b border-gray-800">
        <CompareSummary comparison={comparison} />
      </section>

      {/* Question table */}
      <section className="flex-1 px-6 py-4">
        <CompareTable comparison={comparison} />
      </section>
    </div>
  );
}
