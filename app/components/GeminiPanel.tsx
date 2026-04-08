"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

const SCHEMA_LINK_TEMPLATE = (schema: string, question: string) =>
  `You are an expert SQL developer specializing in SQLite. Given a database schema and a natural language question, generate 5 diverse candidate SQL SELECT queries that might answer the question.

== Database Schema ==
${schema}

== Universal SQLite Formulation Rules ==
1. **Strict Dialect:** Use only valid SQLite syntax.
2. **Quoting:** Wrap ALL table and column identifiers in double quotes (e.g., "table_name"."column_name") to prevent reserved keyword conflicts. Strings must use single quotes.
3. **Mathematical Precision:** SQLite performs integer division by default. For any calculation involving ratios, percentages, or division, ALWAYS cast the numerator to REAL (e.g., \`CAST(SUM(...) AS REAL) * 100 / COUNT(...)\`).
4. **Deduplication:** When asked to "list," "name," or "show" categories, types, or items, default to using the \`DISTINCT\` keyword in your SELECT clause to prevent duplicate row returns, unless explicit counts or totals are requested.
5. **Completeness:** If the question asks for multiple specific data points (e.g., "Find the name and whether it is active"), ensure your SELECT clause explicitly includes columns for all requested points.
6. **Output Format:** Return ONLY the SQL queries wrapped in fenced code blocks (\`\`\`sql ... \`\`\`). Do not include any explanation, comments, or conversational text outside the code blocks.

== Question ==
${question}

Generate exactly 5 candidate SQL queries. Each query should explore a different approach — different join paths, column selections, aggregation strategies, or interpretations of the question. Use the column descriptions from the database schema to understand what each column contains.

Rules:
- Each query must be a valid SQLite SELECT statement.
- Use single quotes for string literals and double quotes for identifiers.
- Return each query in a numbered fenced code block.

Query 1:
\`\`\`sql
...
\`\`\`

Query 2:
\`\`\`sql
...
\`\`\`

Query 3:
\`\`\`sql
...
\`\`\`

Query 4:
\`\`\`sql
...
\`\`\`

Query 5:
\`\`\`sql
...
\`\`\``;

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

  // Schema fetching — only for schema linking tab
  const [schema, setSchema] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // SQL generation state — uses the pipeline prompt from the JSON
  const [sqlPrompt, setSqlPrompt] = useState(pipelinePrompt ?? "");
  const [sqlResult, setSqlResult] = useState<GeminiResult | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlElapsed, setSqlElapsed] = useState(0);

  // Schema linking state
  const [linkPrompt, setLinkPrompt] = useState("");
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

  // Fetch schema for the schema linking tab (only when that tab is first opened)
  useEffect(() => {
    if (!open || schema !== null || schemaLoading) return;
    // Only fetch if we're on the schema-link tab or if we have no pipeline prompt
    if (tab !== "schema-link" && pipelinePrompt) return;

    setSchemaLoading(true);
    fetch(`/api/schema?db_id=${encodeURIComponent(dbId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setSchemaError(data.error);
        } else {
          setSchema(data.schema);
          setLinkPrompt(SCHEMA_LINK_TEMPLATE(data.schema, question));
          // If no pipeline prompt, use schema to build a fallback SQL gen prompt
          if (!pipelinePrompt) {
            setSqlPrompt(
              `You are an expert SQL query writer. Given the following SQLite database schema and a natural language question, write a SQL query that answers the question.\n\n## Database Schema\n${data.schema}\n\n## Question\n${question}\n\n## Instructions\n- Write a single SQLite-compatible SQL query\n- Use only tables and columns from the schema above\n- Return ONLY the SQL query wrapped in \`\`\`sql ... \`\`\` tags`,
            );
          }
        }
      })
      .catch((e) => setSchemaError(e.message))
      .finally(() => setSchemaLoading(false));
  }, [open, schema, schemaLoading, dbId, question, tab, pipelinePrompt]);

  useEffect(
    () => () => {
      clearTimer();
      abortRef.current?.abort();
    },
    [clearTimer],
  );

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

  const isLoading = sqlLoading || linkLoading;
  const currentElapsed = tab === "sql-gen" ? sqlElapsed : linkElapsed;

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

  /** Extract all SQL blocks from a multi-query response */
  function extractAllSql(text: string): string[] {
    const matches = [...text.matchAll(/```sql\s*([\s\S]*?)```/gi)];
    return matches.map((m) => m[1].trim()).filter(Boolean);
  }

  const hasSqlPrompt = sqlPrompt.trim().length > 0;
  const sqlPromptEdited = pipelinePrompt ? sqlPrompt !== pipelinePrompt : false;

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
          {pipelinePrompt && (
            <span className="ml-1 text-[9px] text-gray-600">(pipeline prompt)</span>
          )}
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
        </button>
      </div>

      {/* SQL Generation tab */}
      {tab === "sql-gen" && (
        <div className="space-y-3">
          {!hasSqlPrompt && !pipelinePrompt ? (
            <div className="text-xs text-gray-500">
              No pipeline prompt available for this question. Switch to Schema
              Linking to fetch the database schema and generate a prompt.
            </div>
          ) : (
            <>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                {pipelinePrompt
                  ? "This is the actual prompt used by the InsightXpert pipeline for this question. Edit it and run via Gemini."
                  : "Edit the prompt below and send it to Gemini for SQL generation."}
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
                {pipelinePrompt && sqlPromptEdited && (
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

                  {/* Generated SQL */}
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

                  {/* Full response (collapsible) */}
                  <details className="text-xs">
                    <summary className="text-gray-500 hover:text-gray-300 cursor-pointer">
                      Full response
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-400 font-mono max-h-[300px] overflow-auto">
                      {sqlResult.text}
                    </pre>
                  </details>

                  {/* Run the generated SQL */}
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
            </>
          )}
        </div>
      )}

      {/* Schema Linking tab */}
      {tab === "schema-link" && (
        <div className="space-y-3">
          {/* Loading schema */}
          {schemaLoading && (
            <div className="text-xs text-gray-500">Loading database schema...</div>
          )}
          {schemaError && (
            <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
              Schema error: {schemaError}
            </div>
          )}

          {schema ? (
            <>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                Schema linking prompt (based on the trial_query template from InsightXpert).
                Generates 5 diverse candidate SQL queries. Edit and run via Gemini.
              </p>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Prompt
                  </span>
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {linkPrompt.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  value={linkPrompt}
                  onChange={(e) => setLinkPrompt(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[400px] min-h-[150px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    runGemini(
                      linkPrompt,
                      setLinkResult,
                      setLinkLoading,
                      setLinkError,
                      setLinkElapsed,
                    )
                  }
                  disabled={isLoading || !linkPrompt.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {linkLoading ? "Running..." : "Run Schema Linking"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLinkPrompt(SCHEMA_LINK_TEMPLATE(schema, question))
                  }
                  className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
                >
                  reset prompt
                </button>
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

                  {/* Schema linking response */}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Schema Linking Result
                    </span>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[400px] overflow-auto">
                      {linkResult.text}
                    </pre>
                  </div>

                  {/* Extract and display all SQL candidates */}
                  {(() => {
                    const allSql = extractAllSql(linkResult.text);
                    if (allSql.length === 0) return null;
                    return (
                      <div className="space-y-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                          Candidate Queries ({allSql.length})
                        </span>
                        {allSql.map((sql, i) => (
                          <div key={i} className="space-y-1">
                            <div className="text-[10px] text-gray-500">
                              Query {i + 1}:
                            </div>
                            <SqlRunner
                              dbId={dbId}
                              predSql={sql}
                              goldSql={goldSql}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
            !schemaLoading &&
            !schemaError && (
              <div className="text-xs text-gray-500">
                Schema will be loaded when this tab is opened.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
