"use client";

import { useState } from "react";
import type { PipelineResponse } from "../lib/types";
import SqlRunner from "./SqlRunner";

interface Props {
  response: PipelineResponse;
  originalPredSql: string;
  goldSql: string;
  dbId: string;
}

export default function RerunResultDisplay({
  response,
  originalPredSql,
  goldSql,
  dbId,
}: Props) {
  const newSql = response.refined?.sql || response.candidate?.sql || "";
  const sqlChanged = newSql !== originalPredSql;
  const hasError = response.result?.error;

  return (
    <div className="space-y-3">
      {/* New SQL */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
            Generated SQL
          </span>
          {sqlChanged ? (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
              changed
            </span>
          ) : (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-gray-800 text-gray-500">
              same
            </span>
          )}
          {hasError ? (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-red-900/30 text-red-400">
              error
            </span>
          ) : (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-green-900/30 text-green-400">
              ok
            </span>
          )}
          <CopyButton text={newSql} />
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[200px] overflow-auto">
          {newSql}
        </pre>
      </div>

      {/* Execution result */}
      {response.result && (
        <div>
          {response.result.error ? (
            <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Execution Error
              </span>
              <pre className="mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap">
                {response.result.error}
              </pre>
            </div>
          ) : (
            <div className="rounded-md border border-gray-800 overflow-hidden">
              <div className="bg-gray-800/50 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Result
                </span>
                <span className="text-[10px] text-gray-500">
                  {response.result.rows.length} row{response.result.rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-auto max-h-[200px]">
                {response.result.rows.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-500 italic">Empty result set</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr>
                        {response.result.columns.map((col) => (
                          <th key={col} className="px-2 py-1.5 text-left font-medium text-gray-400 border-b border-gray-800">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {response.result.rows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-b border-gray-800/40">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1 text-gray-300 whitespace-nowrap">
                              {cell === null ? "NULL" : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Reasoning */}
        {response.candidate?.reasoning && (
          <CollapsibleSection title="Reasoning" color="purple">
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
              {response.candidate.reasoning}
            </p>
          </CollapsibleSection>
        )}

        {/* Linked Schema */}
        {response.linked_schema && (
          <CollapsibleSection title="Linked Schema" color="cyan">
            <div className="space-y-2">
              {response.linked_schema.question_interpretation && (
                <p className="text-xs text-gray-400 italic">
                  {response.linked_schema.question_interpretation}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {response.linked_schema.linked_tables.map((t) => (
                  <span key={t} className="rounded px-1.5 py-0.5 text-[10px] bg-cyan-900/30 text-cyan-400">
                    {t}
                  </span>
                ))}
              </div>
              {response.linked_schema.linked_columns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {response.linked_schema.linked_columns.map((c, i) => (
                    <span key={i} className="rounded px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400">
                      {c.table}.{c.column}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Refinement */}
        {response.refined && response.refined.iterations > 0 && (
          <CollapsibleSection title={`Refinement (${response.refined.iterations} iter)`} color="orange">
            <div className="space-y-1.5">
              {response.refined.changes.map((change, i) => (
                <div key={i} className="text-xs text-gray-300 border-l-2 border-orange-800 pl-2">
                  {change}
                </div>
              ))}
              {response.refined.final_error && (
                <p className="text-xs text-red-400 mt-1">
                  Final error: {response.refined.final_error}
                </p>
              )}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Run the new SQL against the DB */}
      <SqlRunner dbId={dbId} predSql={newSql} goldSql={goldSql} />
    </div>
  );
}

const SECTION_COLORS: Record<string, { text: string; border: string }> = {
  purple: { text: "text-purple-400", border: "border-purple-900/40" },
  cyan:   { text: "text-cyan-400",   border: "border-cyan-900/40" },
  orange: { text: "text-orange-400", border: "border-orange-900/40" },
};
const DEFAULT_SECTION_COLOR = { text: "text-gray-400", border: "border-gray-700" };

function CollapsibleSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { text: textColor, border: borderColor } =
    SECTION_COLORS[color] ?? DEFAULT_SECTION_COLOR;

  return (
    <div className={`rounded-md border ${borderColor} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-gray-800/40 transition-colors cursor-pointer"
      >
        <svg
          className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-90" : ""} ${textColor}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className={textColor}>{title}</span>
      </button>
      {open && <div className="px-3 py-2 border-t border-gray-800/50">{children}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Clipboard API unavailable (HTTP, old browser) — fallback to execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setState("copied");
      } catch {
        setState("failed");
      }
    }
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-[10px] cursor-pointer ${
        state === "failed" ? "text-red-400" : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {state === "copied" ? "copied!" : state === "failed" ? "failed" : "copy"}
    </button>
  );
}
