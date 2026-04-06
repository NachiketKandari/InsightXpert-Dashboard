"use client";

import { useState } from "react";
import { PIPELINE_FLAGS, EVALUATE_FLAGS, getDefaults, getEvalDefaults } from "../lib/pipeline-flags";
import FlagControls from "./FlagControls";

interface Props {
  onStart: (pipelineFlags: Record<string, unknown>, evalFlags: Record<string, unknown>) => void;
  startError: string | null;
}

const PRESETS: { label: string; pipeline: Record<string, unknown>; eval: Record<string, unknown> }[] = [
  {
    label: "All mini_dev (default)",
    pipeline: getDefaults(),
    eval: getEvalDefaults(),
  },
  {
    label: "Quick test (limit=10)",
    pipeline: getDefaults(),
    eval: { ...getEvalDefaults(), limit: 10 },
  },
  {
    label: "Single DB (toxicology)",
    pipeline: getDefaults(),
    eval: { ...getEvalDefaults(), db: "toxicology" },
  },
  {
    label: "Parallel (5 concurrent)",
    pipeline: getDefaults(),
    eval: { ...getEvalDefaults(), maxConcurrent: 5 },
  },
];

export default function BenchmarkRunner({ onStart, startError }: Props) {
  const [pipelineFlags, setPipelineFlags] = useState<Record<string, unknown>>(getDefaults());
  const [evalFlags, setEvalFlags] = useState<Record<string, unknown>>(getEvalDefaults());
  const [configOpen, setConfigOpen] = useState(true);

  function applyPreset(idx: number) {
    setPipelineFlags({ ...PRESETS[idx].pipeline });
    setEvalFlags({ ...PRESETS[idx].eval });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-200 p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Benchmark</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure and launch an evaluation run
          </p>
        </div>

        {/* Presets */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Quick Presets
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => applyPreset(i)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div>
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer mb-3"
          >
            <svg
              className={`w-3 h-3 transition-transform ${configOpen ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            Configuration
          </button>
          {configOpen && (
            <div className="space-y-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              {/* Evaluate-specific flags */}
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-2">
                  Evaluation Settings
                </div>
                <FlagControls
                  flags={EVALUATE_FLAGS}
                  values={evalFlags}
                  onChange={(key, val) => setEvalFlags((prev) => ({ ...prev, [key]: val }))}
                />
              </div>

              <div className="border-t border-gray-800" />

              {/* Pipeline flags */}
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-2">
                  Pipeline Settings
                </div>
                <FlagControls
                  flags={PIPELINE_FLAGS}
                  values={pipelineFlags}
                  onChange={(key, val) => setPipelineFlags((prev) => ({ ...prev, [key]: val }))}
                />
              </div>
            </div>
          )}
        </div>

        {/* Start button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onStart(pipelineFlags, evalFlags)}
            className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Start Benchmark
          </button>
          {startError && (
            <p className="text-sm text-red-400">{startError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
