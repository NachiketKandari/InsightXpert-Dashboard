"use client";

import { useState } from "react";
import type { ComparisonResult } from "../lib/compare-types";

interface Props {
  comparison: ComparisonResult;
}

export default function CompareSummary({ comparison }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const { runs, byDifficulty } = comparison;

  // Find config keys that differ across runs
  const configDiffs = getConfigDiffs(runs.map((r) => r.runConfig));

  return (
    <div className="space-y-4">
      {/* Stats table */}
      <div className="overflow-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">Difficulty</th>
              <th className="px-3 py-2.5 font-medium text-right">Total</th>
              {runs.map((run) => (
                <th
                  key={run.id}
                  className="px-3 py-2.5 font-medium text-right"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: run.color }}
                  />
                  <span className="truncate max-w-[120px] inline-block align-middle" title={run.label}>
                    {run.label}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium text-right text-green-500">
                All Correct
              </th>
              <th className="px-3 py-2.5 font-medium text-right text-red-500">
                All Wrong
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {byDifficulty.map((row) => {
              const isAll = row.difficulty === "all";
              return (
                <tr
                  key={row.difficulty}
                  className={isAll ? "bg-gray-800/30 font-medium" : ""}
                >
                  <td className="px-3 py-2 text-gray-300 capitalize">
                    {isAll ? "All" : row.difficulty}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-right tabular-nums">
                    {row.total}
                  </td>
                  {runs.map((run) => {
                    const stat = row.perRun.find((p) => p.runId === run.id);
                    if (!stat) return <td key={run.id} />;
                    return (
                      <td
                        key={run.id}
                        className="px-3 py-2 text-right tabular-nums"
                      >
                        <span className="text-gray-200">{stat.correct}</span>
                        <span className="text-gray-600 ml-1">
                          ({stat.pct.toFixed(1)}%)
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-green-400">
                    {row.allCorrect}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-400">
                    {row.allWrong}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Config diffs */}
      {configDiffs.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setConfigOpen(!configOpen)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          >
            <svg
              className={`w-3 h-3 transition-transform ${configOpen ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            Config Differences ({configDiffs.length} keys differ)
          </button>
          {configOpen && (
            <div className="mt-2 overflow-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-800 text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Key</th>
                    {runs.map((run) => (
                      <th key={run.id} className="px-3 py-2 font-medium">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1"
                          style={{ backgroundColor: run.color }}
                        />
                        {run.fileName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {configDiffs.map((key) => (
                    <tr key={key}>
                      <td className="px-3 py-1.5 text-gray-400 font-mono">
                        {key}
                      </td>
                      {runs.map((run) => {
                        const val = run.runConfig?.[key];
                        return (
                          <td
                            key={run.id}
                            className="px-3 py-1.5 text-gray-300 font-mono"
                          >
                            {val === undefined ? "—" : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getConfigDiffs(
  configs: (Record<string, unknown> | null)[]
): string[] {
  const allKeys = new Set<string>();
  for (const c of configs) {
    if (c) Object.keys(c).forEach((k) => allKeys.add(k));
  }

  const diffKeys: string[] = [];
  for (const key of allKeys) {
    const values = configs.map((c) => (c ? String(c[key] ?? "") : ""));
    const unique = new Set(values);
    if (unique.size > 1) diffKeys.push(key);
  }

  return diffKeys.sort();
}
