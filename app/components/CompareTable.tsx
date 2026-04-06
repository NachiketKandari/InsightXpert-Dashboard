"use client";

import { Fragment, useRef, useEffect, useMemo, useState } from "react";
import type { ComparisonResult, ComparedQuestion, LoadedRun, RunQuestionResult } from "../lib/compare-types";
import { DIFF_COLORS } from "../lib/colors";
import Badge from "./Badge";
import Dropdown from "./Dropdown";
import SqlRunner from "./SqlRunner";
import PromptRunner from "./PromptRunner";

interface Props {
  comparison: ComparisonResult;
}

const CATEGORY_COLORS: Record<string, string> = {
  all_correct: "#22c55e",
  all_wrong: "#ef4444",
  mixed: "#eab308",
};

const CATEGORY_LABELS: Record<string, string> = {
  all_correct: "All Correct",
  all_wrong: "All Wrong",
  mixed: "Mixed",
};

export default function CompareTable({ comparison }: Props) {
  const { runs, questions } = comparison;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [diffFilter, setDiffFilter] = useState("");
  const [dbFilter, setDbFilter] = useState("");

  const filtered = useMemo(
    () =>
      questions.filter((q) => {
        if (categoryFilter && q.category !== categoryFilter) return false;
        if (diffFilter && q.diff !== diffFilter) return false;
        if (dbFilter && q.db !== dbFilter) return false;
        return true;
      }),
    [questions, categoryFilter, diffFilter, dbFilter]
  );

  const { categories, diffs, dbs, catCounts, diffCounts, dbCounts } =
    useMemo(() => {
      const catSet = new Set<string>();
      const diffSet = new Set<string>();
      const dbSet = new Set<string>();
      const cc = new Map<string, number>();
      const dc = new Map<string, number>();
      const dbc = new Map<string, number>();
      for (const q of questions) {
        catSet.add(q.category);
        diffSet.add(q.diff);
        dbSet.add(q.db);
        cc.set(q.category, (cc.get(q.category) || 0) + 1);
        dc.set(q.diff, (dc.get(q.diff) || 0) + 1);
        dbc.set(q.db, (dbc.get(q.db) || 0) + 1);
      }
      return {
        categories: [...catSet],
        diffs: [...diffSet].sort(
          (a, b) =>
            ["simple", "moderate", "challenging"].indexOf(a) -
            ["simple", "moderate", "challenging"].indexOf(b)
        ),
        dbs: [...dbSet].sort(),
        catCounts: cc,
        diffCounts: dc,
        dbCounts: dbc,
      };
    }, [questions]);

  const hasFilter = !!(categoryFilter || diffFilter || dbFilter);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setExpandedRow(null);
  }, [categoryFilter, diffFilter, dbFilter]);

  const colSpan = 5 + runs.length + 1; // expand + qid + db + diff + question + N runs + category

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Filter bar */}
      <div className="shrink-0 flex gap-3 flex-wrap items-center">
        <span className="text-sm text-gray-400">Filter:</span>

        <Dropdown
          value={diffFilter}
          placeholder="All difficulties"
          onChange={(v) => setDiffFilter(v)}
          options={diffs.map((d) => ({
            value: d,
            label: `${d} (${diffCounts.get(d) ?? 0})`,
          }))}
        />

        <Dropdown
          value={categoryFilter}
          placeholder="All categories"
          onChange={(v) => setCategoryFilter(v)}
          options={categories.map((c) => ({
            value: c,
            label: `${CATEGORY_LABELS[c] || c} (${catCounts.get(c) ?? 0})`,
          }))}
        />

        <Dropdown
          value={dbFilter}
          placeholder="All databases"
          onChange={(v) => setDbFilter(v)}
          options={dbs.map((d) => ({
            value: d,
            label: `${d} (${dbCounts.get(d) ?? 0})`,
          }))}
        />

        {hasFilter && (
          <button
            onClick={() => {
              setCategoryFilter("");
              setDiffFilter("");
              setDbFilter("");
            }}
            className="rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}

        <span className="text-sm text-gray-500 ml-auto tabular-nums">
          {filtered.length} / {questions.length} questions
        </span>
      </div>

      {/* Table */}
      <div
        ref={scrollRef}
        className="overflow-auto rounded-lg border border-gray-700 max-h-[75vh]"
      >
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-800 text-gray-400 sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2.5 font-medium w-6"></th>
              <th className="px-3 py-2.5 font-medium">QID</th>
              <th className="px-3 py-2.5 font-medium">DB</th>
              <th className="px-3 py-2.5 font-medium">Diff</th>
              <th className="px-3 py-2.5 font-medium min-w-[200px]">Question</th>
              {runs.map((run) => (
                <th key={run.id} className="px-3 py-2.5 font-medium text-center">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: run.color }}
                  />
                  <span className="truncate max-w-[80px] inline-block align-middle" title={run.label}>
                    {run.label}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-12 text-center text-gray-500">
                  No matching questions
                </td>
              </tr>
            ) : (
              filtered.map((q) => {
                const isExpanded = expandedRow === q.qid;
                return (
                  <Fragment key={q.qid}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className={`cursor-pointer transition-colors ${
                        isExpanded ? "bg-gray-800/60" : "hover:bg-gray-800/40"
                      }`}
                      onClick={() => setExpandedRow(isExpanded ? null : q.qid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedRow(isExpanded ? null : q.qid);
                        }
                      }}
                    >
                      <td className="px-3 py-2.5 text-gray-500">
                        <svg
                          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M6 4l8 6-8 6V4z" />
                        </svg>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-gray-400">{q.qid}</td>
                      <td className="px-3 py-2.5 text-gray-300">{q.db}</td>
                      <td className="px-3 py-2.5">
                        <Badge color={DIFF_COLORS[q.diff]}>{q.diff}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-gray-200 leading-relaxed">{q.question}</td>
                      {runs.map((run) => {
                        const result = q.results.get(run.id);
                        return (
                          <td key={run.id} className="px-3 py-2.5 text-center">
                            {result?.execution_match ? (
                              <span className="text-green-400 font-medium">Y</span>
                            ) : (
                              <span className="text-red-400 font-medium">N</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5">
                        <Badge color={CATEGORY_COLORS[q.category]}>
                          {CATEGORY_LABELS[q.category] || q.category}
                        </Badge>
                      </td>
                    </tr>
                    {isExpanded && (
                      <CompareExpandedRow
                        question={q}
                        runs={runs}
                        colSpan={colSpan}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareExpandedRow({
  question,
  runs,
  colSpan,
}: {
  question: ComparedQuestion;
  runs: LoadedRun[];
  colSpan: number;
}) {
  return (
    <tr className="bg-gray-900/80">
      <td colSpan={colSpan} className="px-4 py-4">
        {/* Per-run panels */}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${runs.length}, 1fr)` }}
        >
          {runs.map((run) => {
            const result = question.results.get(run.id);
            return (
              <RunPanel
                key={run.id}
                run={run}
                result={result ?? null}
                dbId={question.db}
                goldSql={question.gold_sql}
              />
            );
          })}
        </div>

        {/* Gold SQL (shared) */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400">
              Gold SQL
            </span>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[200px] overflow-auto">
            {question.gold_sql}
          </pre>
        </div>
      </td>
    </tr>
  );
}

/** Per-run panel with editable SQL, SqlRunner, and collapsible prompt. */
function RunPanel({
  run,
  result,
  dbId,
  goldSql,
}: {
  run: LoadedRun;
  result: RunQuestionResult | null;
  dbId: string;
  goldSql: string;
}) {
  const [sql, setSql] = useState(result?.pred_sql ?? "");
  const [promptOpen, setPromptOpen] = useState(false);

  const edited = sql !== (result?.pred_sql ?? "");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: run.color }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {run.label}
        </span>
        <span
          className={`text-[10px] rounded px-1.5 py-0.5 ${
            result?.execution_match
              ? "bg-green-900/30 text-green-400"
              : "bg-red-900/30 text-red-400"
          }`}
        >
          {result?.execution_match ? "correct" : "wrong"}
        </span>
        {edited && (
          <>
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
              edited
            </span>
            <button
              onClick={() => setSql(result?.pred_sql ?? "")}
              className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
            >
              reset
            </button>
          </>
        )}
      </div>

      {/* Editable SQL */}
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
        className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[250px] min-h-[80px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
      />
      {result?.error && (
        <p className="mt-1 text-[10px] text-red-400 font-mono truncate" title={result.error}>
          {result.error}
        </p>
      )}

      {/* SqlRunner */}
      <SqlRunner dbId={dbId} predSql={sql} goldSql={goldSql} />

      {/* Collapsible prompt */}
      {result?.prompt && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPromptOpen(!promptOpen)}
            className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform ${promptOpen ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            Prompt
          </button>
          {promptOpen && (
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[10px] leading-relaxed text-gray-400 font-mono max-h-[400px] overflow-auto">
              {result.prompt}
            </pre>
          )}
        </div>
      )}

      {/* Quick Prompt Run */}
      {result?.prompt && (
        <PromptRunner
          initialPrompt={result.prompt}
          dbId={dbId}
          goldSql={goldSql}
          originalPredSql={result?.pred_sql ?? ""}
        />
      )}
    </div>
  );
}
