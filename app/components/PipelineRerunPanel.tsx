"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DiagnosisRecord, PipelineResponse } from "../lib/types";
import { getDefaults } from "../lib/pipeline-flags";
import FlagControls from "./FlagControls";
import PromptEditor from "./PromptEditor";
import RerunResultDisplay from "./RerunResultDisplay";

interface Props {
  record: DiagnosisRecord;
}

export default function PipelineRerunPanel({ record }: Props) {
  const [open, setOpen] = useState(false);
  const [flagValues, setFlagValues] = useState<Record<string, unknown>>(getDefaults);
  const [evidence, setEvidence] = useState("");
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTimer();
    abortRef.current?.abort();
  }, [clearTimer]);

  function handleFlagChange(key: string, value: unknown) {
    setFlagValues((prev) => ({ ...prev, [key]: value }));
  }

  function resetDefaults() {
    setFlagValues(getDefaults());
  }

  async function runPipeline() {
    setLoading(true);
    setElapsed(0);
    setResponse(null);
    setError(null);

    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    abortRef.current = new AbortController();

    try {
      const body: Record<string, unknown> = {
        question: record.q,
        db_id: record.db,
        evidence: evidence || undefined,
        flags: flagValues,
      };

      // Only send prompt overrides if any templates were actually edited
      if (Object.keys(promptOverrides).length > 0) {
        body.prompts = promptOverrides;
      }

      const res = await fetch("/api/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (data.error && !data.candidate) {
        setError(data.error);
      } else {
        setResponse(data as PipelineResponse);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimer();
      setLoading(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    clearTimer();
    setLoading(false);
  }

  const promptEditCount = Object.keys(promptOverrides).length;

  if (!open) {
    return (
      <div className="mt-4 border-t border-gray-800 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Re-run Pipeline
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-gray-800 pt-3 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
      >
        <svg className="w-3 h-3 rotate-90" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        Re-run Pipeline
      </button>

      {/* Question & DB (read-only context) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Database
          </label>
          <div className="mt-0.5 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-300">
            {record.db}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Question
          </label>
          <div className="mt-0.5 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-300 truncate">
            {record.q}
          </div>
        </div>
      </div>

      {/* Evidence */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Evidence (optional hint)
        </label>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Provide evidence/hint for the LLM..."
          rows={2}
          className="mt-0.5 w-full rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600 resize-y"
        />
      </div>

      {/* Flag controls */}
      <div className="rounded-md border border-gray-800 bg-gray-900/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Pipeline Flags
          </span>
          <button
            type="button"
            onClick={resetDefaults}
            className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
          >
            reset to defaults
          </button>
        </div>
        <FlagControls values={flagValues} onChange={handleFlagChange} />
      </div>

      {/* Prompt templates */}
      <div>
        <button
          type="button"
          onClick={() => setPromptsOpen(!promptsOpen)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          <svg
            className={`w-3 h-3 transition-transform ${promptsOpen ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Prompt Templates
          {promptEditCount > 0 && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
              {promptEditCount} modified
            </span>
          )}
        </button>
        {promptsOpen && (
          <div className="mt-2">
            <PromptEditor onChange={setPromptOverrides} />
          </div>
        )}
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runPipeline}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? "Running..." : "Run Pipeline"}
        </button>
        {loading && (
          <>
            <span className="text-xs text-gray-500 tabular-nums">{elapsed}s</span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
            >
              cancel
            </button>
          </>
        )}
        {promptEditCount > 0 && !loading && (
          <span className="text-[10px] text-yellow-500">
            {promptEditCount} prompt{promptEditCount > 1 ? "s" : ""} overridden
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
            Pipeline Error
          </span>
          <pre className="mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">
            {error}
          </pre>
        </div>
      )}

      {/* Result */}
      {response && (
        <RerunResultDisplay
          response={response}
          originalPredSql={record.pred_sql}
          goldSql={record.gold_sql}
          dbId={record.db}
        />
      )}
    </div>
  );
}
