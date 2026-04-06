"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import SqlRunner from "./SqlRunner";

interface Props {
  /** The full rendered prompt from the previous run. */
  initialPrompt: string;
  /** Database ID for running the resulting SQL. */
  dbId: string;
  /** Gold SQL for comparison via SqlRunner. */
  goldSql: string;
  /** Original predicted SQL for comparison. */
  originalPredSql: string;
}

interface PromptRunResult {
  sql: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

export default function PromptRunner({
  initialPrompt,
  dbId,
  goldSql,
  originalPredSql,
}: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<PromptRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const edited = prompt !== initialPrompt;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      abortRef.current?.abort();
    },
    [clearTimer],
  );

  async function runPrompt() {
    setLoading(true);
    setElapsed(0);
    setResult(null);
    setError(null);

    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/prompt-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      if (data.error && !data.sql) {
        setError(data.error);
      } else {
        setResult(data as PromptRunResult);
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

  if (!initialPrompt) return null;

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Quick Prompt Run
          <span className="text-[10px] text-gray-600">
            (edit prompt, skip pipeline)
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gray-800 bg-gray-900/40 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          <svg
            className="w-3 h-3 rotate-90"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Quick Prompt Run
        </button>
        {edited && (
          <button
            onClick={() => setPrompt(initialPrompt)}
            className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
          >
            reset prompt
          </button>
        )}
      </div>

      <p className="text-[10px] text-gray-600 leading-relaxed">
        Edit the full prompt below and send it directly to the LLM. This skips
        profiling, schema linking, and refinement — just one API call.
      </p>

      {/* Editable prompt */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Prompt
          </span>
          {edited && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
              edited
            </span>
          )}
          <span className="text-[10px] text-gray-600 ml-auto">
            {prompt.length.toLocaleString()} chars
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
          className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[400px] min-h-[150px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
        />
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runPrompt}
          disabled={loading || !prompt.trim()}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? "Running..." : "Run Prompt"}
        </button>
        {loading && (
          <>
            <span className="text-xs text-gray-500 tabular-nums">
              {elapsed}s
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
            >
              cancel
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
            Error
          </span>
          <pre className="mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">
            {error}
          </pre>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Generated SQL */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                Generated SQL
              </span>
              <span className="text-[10px] text-gray-600">
                {result.input_tokens.toLocaleString()} in /{" "}
                {result.output_tokens.toLocaleString()} out tokens
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[200px] overflow-auto">
              {result.sql}
            </pre>
          </div>

          {/* Comparison with original */}
          {result.sql !== originalPredSql && (
            <div className="text-[10px] text-gray-500">
              <span className="text-yellow-500">SQL differs from original prediction.</span>
              {" "}Run both below to compare results.
            </div>
          )}

          {/* SqlRunner: prompt-run SQL vs gold */}
          <SqlRunner
            dbId={dbId}
            predSql={result.sql}
            goldSql={goldSql}
          />
        </div>
      )}
    </div>
  );
}
