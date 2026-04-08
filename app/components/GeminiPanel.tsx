"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import SqlRunner from "./SqlRunner";

interface Props {
  question: string;
  dbId: string;
  goldSql: string;
  predSql: string;
  /** The full rendered SQL generation prompt from the pipeline (stored in the JSON). */
  pipelinePrompt: string | null;
}

type Tab = "sql-gen" | "schema-link";
type ThinkingLevel = "none" | "low" | "medium" | "high";

const THINKING_LEVELS: ThinkingLevel[] = ["none", "low", "medium", "high"];
const DEFAULT_THINKING: ThinkingLevel =
  (process.env.NEXT_PUBLIC_GEMINI_THINKING_LEVEL as ThinkingLevel) || "low";

/** Extract the "== Database Schema ==" section from a pipeline prompt. */
function extractSchemaSection(prompt: string): {
  before: string;
  schema: string;
  after: string;
} | null {
  // Find start: "== Database Schema ==" or similar
  const startRe = /^==\s*Database Schema\s*==\s*$/m;
  const startMatch = startRe.exec(prompt);
  if (!startMatch) return null;

  const schemaStart = startMatch.index + startMatch[0].length;

  // Find end: the next "== ... ==" section header
  const afterStart = prompt.slice(schemaStart);
  const endRe = /^==\s*.+?\s*==\s*$/m;
  const endMatch = endRe.exec(afterStart);

  if (endMatch) {
    const schemaEnd = schemaStart + endMatch.index;
    return {
      before: prompt.slice(0, startMatch.index + startMatch[0].length),
      schema: prompt.slice(schemaStart, schemaEnd).trim(),
      after: prompt.slice(schemaEnd),
    };
  }

  // No next section — schema goes to end
  return {
    before: prompt.slice(0, startMatch.index + startMatch[0].length),
    schema: afterStart.trim(),
    after: "",
  };
}

interface GeminiResult {
  text: string;
  thinking: string | null;
  sql: string | null;
  model: string;
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  } | null;
}

export default function GeminiPanel({
  question,
  dbId,
  goldSql,
  predSql,
  pipelinePrompt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("sql-gen");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(DEFAULT_THINKING);

  // SQL generation state — uses the pipeline prompt from the JSON
  const [sqlPrompt, setSqlPrompt] = useState(pipelinePrompt ?? "");
  const [sqlResult, setSqlResult] = useState<GeminiResult | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlElapsed, setSqlElapsed] = useState(0);

  // Schema linking state — editable schema extracted from the prompt
  const originalSchema = useMemo(
    () => (pipelinePrompt ? extractSchemaSection(pipelinePrompt) : null),
    [pipelinePrompt],
  );
  const [editedSchema, setEditedSchema] = useState(originalSchema?.schema ?? "");
  const [perfectSchema, setPerfectSchema] = useState<string | null>(null);
  const [perfectLoading, setPerfectLoading] = useState(false);
  const [perfectError, setPerfectError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<GeminiResult | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkElapsed, setLinkElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  /** Rebuild the full prompt with the edited schema section. */
  const rebuiltPrompt = useMemo(() => {
    if (!originalSchema) return sqlPrompt;
    return `${originalSchema.before}\n${editedSchema}\n\n${originalSchema.after}`;
  }, [originalSchema, editedSchema, sqlPrompt]);

  const schemaEdited = originalSchema
    ? editedSchema !== originalSchema.schema
    : false;

  async function runGemini(
    prompt: string,
    setResult: (r: GeminiResult | null) => void,
    setLoading: (l: boolean) => void,
    setError: (e: string | null) => void,
    setElapsed: (n: number) => void,
  ) {
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
      const body: Record<string, unknown> = { prompt };
      if (thinkingLevel !== "none") {
        body.thinking_level = thinkingLevel;
      }

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data as GeminiResult);
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
    setSqlLoading(false);
    setLinkLoading(false);
  }

  /** Apply edited schema back into the SQL gen prompt */
  function applySchemaToPrompt() {
    if (!originalSchema) return;
    const newPrompt = `${originalSchema.before}\n${editedSchema}\n\n${originalSchema.after}`;
    setSqlPrompt(newPrompt);
    setTab("sql-gen");
  }

  /** Fetch perfect schema linking for this question */
  async function fetchPerfectSchema() {
    setPerfectLoading(true);
    setPerfectError(null);
    try {
      const res = await fetch(
        `/api/perfect-schema?question=${encodeURIComponent(question)}`,
      );
      const data = await res.json();
      if (data.error) {
        setPerfectError(data.error);
      } else {
        setPerfectSchema(data.schema);
        setEditedSchema(data.schema);
      }
    } catch (e: unknown) {
      setPerfectError(e instanceof Error ? e.message : String(e));
    } finally {
      setPerfectLoading(false);
    }
  }

  /** Run with perfect schema: swap in perfect schema and run immediately */
  async function runWithPerfectSchema() {
    if (!originalSchema) return;

    // Fetch perfect schema if not already loaded
    let schema = perfectSchema;
    if (!schema) {
      setPerfectLoading(true);
      setPerfectError(null);
      try {
        const res = await fetch(
          `/api/perfect-schema?question=${encodeURIComponent(question)}`,
        );
        const data = await res.json();
        if (data.error) {
          setPerfectError(data.error);
          setPerfectLoading(false);
          return;
        }
        schema = data.schema;
        setPerfectSchema(data.schema);
        setEditedSchema(data.schema);
      } catch (e: unknown) {
        setPerfectError(e instanceof Error ? e.message : String(e));
        setPerfectLoading(false);
        return;
      } finally {
        setPerfectLoading(false);
      }
    }

    // Build prompt with perfect schema and run
    const perfectPrompt = `${originalSchema.before}\n${schema}\n\n${originalSchema.after}`;
    runGemini(perfectPrompt, setLinkResult, setLinkLoading, setLinkError, setLinkElapsed);
  }

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
          Gemini SQL Gen &amp; Schema Linking
          <span className="text-[10px] text-gray-600">
            (edit &amp; run prompts via Gemini)
          </span>
        </button>
      </div>
    );
  }

  if (!pipelinePrompt) {
    return (
      <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
          >
            <svg className="w-3 h-3 rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            Gemini SQL Gen &amp; Schema Linking
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          No pipeline prompt available for this question.
        </p>
      </div>
    );
  }

  const isLoading = sqlLoading || linkLoading;
  const currentElapsed = tab === "sql-gen" ? sqlElapsed : linkElapsed;
  const sqlPromptEdited = sqlPrompt !== pipelinePrompt;

  function renderUsage(result: GeminiResult) {
    if (!result.usage) return null;
    return (
      <div className="text-[10px] text-gray-600">
        {result.model} &middot;{" "}
        {result.usage.promptTokenCount?.toLocaleString() ?? "?"} in /{" "}
        {result.usage.candidatesTokenCount?.toLocaleString() ?? "?"} out
        {result.usage.thoughtsTokenCount
          ? ` / ${result.usage.thoughtsTokenCount.toLocaleString()} thinking`
          : ""}{" "}
        tokens
      </div>
    );
  }

  function renderThinking(result: GeminiResult) {
    if (!result.thinking) return null;
    return (
      <details className="text-xs">
        <summary className="text-purple-400/70 hover:text-purple-300 cursor-pointer">
          Thinking trace ({result.thinking.length.toLocaleString()} chars)
        </summary>
        <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-purple-950/20 border border-purple-900/30 p-3 text-[11px] leading-relaxed text-purple-300/80 font-mono max-h-[300px] overflow-auto">
          {result.thinking}
        </pre>
      </details>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gray-800 bg-gray-900/40 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3 rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
          Gemini SQL Gen &amp; Schema Linking
        </button>

        {/* Thinking level selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">Thinking:</span>
          <div className="flex gap-0.5">
            {THINKING_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setThinkingLevel(level)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
                  thinkingLevel === level
                    ? "bg-purple-600/30 text-purple-300 border border-purple-700/50"
                    : "text-gray-600 hover:text-gray-400 border border-transparent"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-1">
        <button
          type="button"
          onClick={() => setTab("sql-gen")}
          className={`px-3 py-1.5 text-xs rounded-t-md transition-colors cursor-pointer ${
            tab === "sql-gen"
              ? "bg-gray-800 text-blue-400 border border-gray-700 border-b-gray-900/40"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          SQL Generation
        </button>
        <button
          type="button"
          onClick={() => setTab("schema-link")}
          className={`px-3 py-1.5 text-xs rounded-t-md transition-colors cursor-pointer ${
            tab === "schema-link"
              ? "bg-gray-800 text-emerald-400 border border-gray-700 border-b-gray-900/40"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Schema Linking
          {schemaEdited && (
            <span className="ml-1 text-[9px] text-yellow-400">(edited)</span>
          )}
        </button>
      </div>

      {/* ─── SQL Generation tab ─── */}
      {tab === "sql-gen" && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            The actual prompt used by InsightXpert for this question. Edit and
            run via Gemini. Use the Schema Linking tab to edit the schema section.
          </p>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Prompt
              </span>
              {sqlPromptEdited && (
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
                  edited
                </span>
              )}
              <span className="text-[10px] text-gray-600 ml-auto">
                {sqlPrompt.length.toLocaleString()} chars
              </span>
            </div>
            <textarea
              value={sqlPrompt}
              onChange={(e) => setSqlPrompt(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[400px] min-h-[150px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                runGemini(
                  sqlPrompt,
                  setSqlResult,
                  setSqlLoading,
                  setSqlError,
                  setSqlElapsed,
                )
              }
              disabled={isLoading || !sqlPrompt.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {sqlLoading ? "Running..." : "Generate SQL"}
            </button>
            {sqlPromptEdited && (
              <button
                type="button"
                onClick={() => setSqlPrompt(pipelinePrompt)}
                className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
              >
                reset to original
              </button>
            )}
            {sqlLoading && (
              <>
                <span className="text-xs text-gray-500 tabular-nums">
                  {currentElapsed}s
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

          {sqlError && (
            <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Error
              </span>
              <pre className="mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">
                {sqlError}
              </pre>
            </div>
          )}

          {sqlResult && (
            <div className="space-y-3">
              {renderUsage(sqlResult)}
              {renderThinking(sqlResult)}

              {sqlResult.sql && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    Generated SQL
                  </span>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[200px] overflow-auto">
                    {sqlResult.sql}
                  </pre>
                </div>
              )}

              <details className="text-xs">
                <summary className="text-gray-500 hover:text-gray-300 cursor-pointer">
                  Full response
                </summary>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-400 font-mono max-h-[300px] overflow-auto">
                  {sqlResult.text}
                </pre>
              </details>

              {sqlResult.sql && (
                <>
                  <div className="text-[10px] text-gray-500">
                    {sqlResult.sql !== predSql && (
                      <span className="text-yellow-500">
                        SQL differs from original prediction.{" "}
                      </span>
                    )}
                    Run below to compare with gold SQL.
                  </div>
                  <SqlRunner dbId={dbId} predSql={sqlResult.sql} goldSql={goldSql} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Schema Linking tab ─── */}
      {tab === "schema-link" && (
        <div className="space-y-3">
          {originalSchema ? (
            <>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                This is the <strong className="text-gray-400">Database Schema</strong> section
                extracted from the pipeline prompt. Edit it to add/remove tables and columns,
                then apply it back to the SQL generation prompt or run the modified prompt
                directly.
              </p>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                    Database Schema
                  </span>
                  {schemaEdited && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
                      edited
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {editedSchema.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  value={editedSchema}
                  onChange={(e) => setEditedSchema(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-md bg-gray-950 border border-emerald-900/40 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[500px] min-h-[200px] overflow-auto resize-y focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={applySchemaToPrompt}
                  disabled={!schemaEdited}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Apply to Prompt &amp; Switch to SQL Gen
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runGemini(
                      rebuiltPrompt,
                      setLinkResult,
                      setLinkLoading,
                      setLinkError,
                      setLinkElapsed,
                    )
                  }
                  disabled={isLoading || !editedSchema.trim()}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {linkLoading ? "Running..." : "Run with Edited Schema"}
                </button>
                <button
                  type="button"
                  onClick={runWithPerfectSchema}
                  disabled={isLoading || perfectLoading}
                  className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {perfectLoading ? "Loading..." : "Run with Perfect Schema"}
                </button>
                {schemaEdited && (
                  <button
                    type="button"
                    onClick={() => setEditedSchema(originalSchema.schema)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
                  >
                    reset schema
                  </button>
                )}
                {perfectSchema && (
                  <button
                    type="button"
                    onClick={() => setEditedSchema(perfectSchema)}
                    className="text-[10px] text-amber-500 hover:text-amber-300 underline cursor-pointer"
                  >
                    load perfect schema
                  </button>
                )}
                {linkLoading && (
                  <>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {currentElapsed}s
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

              {perfectError && (
                <div className="text-[10px] text-amber-400">
                  Perfect schema: {perfectError}
                </div>
              )}

              {/* Preview the rebuilt prompt (collapsible) */}
              {schemaEdited && (
                <details className="text-xs">
                  <summary className="text-gray-500 hover:text-gray-300 cursor-pointer">
                    Preview full prompt with edited schema ({rebuiltPrompt.length.toLocaleString()} chars)
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-400 font-mono max-h-[300px] overflow-auto">
                    {rebuiltPrompt}
                  </pre>
                </details>
              )}

              {linkError && (
                <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    Error
                  </span>
                  <pre className="mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">
                    {linkError}
                  </pre>
                </div>
              )}

              {linkResult && (
                <div className="space-y-3">
                  {renderUsage(linkResult)}
                  {renderThinking(linkResult)}

                  {linkResult.sql && (
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                        Generated SQL (from edited schema)
                      </span>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[200px] overflow-auto">
                        {linkResult.sql}
                      </pre>
                    </div>
                  )}

                  <details className="text-xs">
                    <summary className="text-gray-500 hover:text-gray-300 cursor-pointer">
                      Full response
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-400 font-mono max-h-[300px] overflow-auto">
                      {linkResult.text}
                    </pre>
                  </details>

                  {linkResult.sql && (
                    <SqlRunner
                      dbId={dbId}
                      predSql={linkResult.sql}
                      goldSql={goldSql}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">
              Could not extract the Database Schema section from the pipeline prompt.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
