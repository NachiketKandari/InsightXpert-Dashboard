"use client";

import { useState } from "react";

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  truncated: boolean;
  error?: string;
}

interface Props {
  dbId: string;
  predSql: string;
  goldSql: string;
}

export default function SqlRunner({ dbId, predSql, goldSql }: Props) {
  const [predResult, setPredResult] = useState<QueryResult | null>(null);
  const [goldResult, setGoldResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runBoth() {
    setLoading(true);
    setPredResult(null);
    setGoldResult(null);

    const [pred, gold] = await Promise.all([
      execute(dbId, predSql),
      execute(dbId, goldSql),
    ]);

    setPredResult(pred);
    setGoldResult(gold);
    setLoading(false);
  }

  return (
    <div className="mt-4">
      <button
        onClick={runBoth}
        disabled={loading}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {loading ? "Running..." : "Run both SQLs"}
      </button>

      {(predResult || goldResult) && (
        <div className="grid grid-cols-2 gap-4 mt-3">
          <ResultPane
            label="Predicted"
            variant="red"
            result={predResult}
          />
          <ResultPane
            label="Gold"
            variant="green"
            result={goldResult}
          />
        </div>
      )}
    </div>
  );
}

async function execute(
  dbId: string,
  sql: string
): Promise<QueryResult> {
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db_id: dbId, sql }),
    });
    return await res.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { columns: [], rows: [], total_rows: 0, truncated: false, error: msg };
  }
}

function ResultPane({
  label,
  variant,
  result,
}: {
  label: string;
  variant: "red" | "green";
  result: QueryResult | null;
}) {
  if (!result) return <div className="text-gray-600 text-xs">Loading...</div>;

  const borderColor = variant === "red" ? "border-red-900/50" : "border-green-900/50";
  const headerBg = variant === "red" ? "bg-red-950/30" : "bg-green-950/30";
  const labelColor = variant === "red" ? "text-red-400" : "text-green-400";

  if (result.error) {
    return (
      <div className={`rounded-md border ${borderColor} overflow-hidden`}>
        <div className={`${headerBg} px-3 py-1.5 flex items-center justify-between`}>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>
            {label} Result
          </span>
        </div>
        <div className="px-3 py-3 text-xs text-red-400 font-mono whitespace-pre-wrap">
          {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-md border ${borderColor} overflow-hidden`}>
      <div className={`${headerBg} px-3 py-1.5 flex items-center justify-between`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>
          {label} Result
        </span>
        <span className="text-[10px] text-gray-500">
          {result.total_rows} row{result.total_rows !== 1 ? "s" : ""}
          {result.truncated ? " (showing 50)" : ""}
        </span>
      </div>
      <div className="overflow-auto max-h-[250px]">
        {result.rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-500 italic">
            Empty result set
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-900">
              <tr>
                {result.columns.map((col) => (
                  <th
                    key={col}
                    className="px-2 py-1.5 text-left font-medium text-gray-400 border-b border-gray-800"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-800/40 hover:bg-gray-800/30"
                >
                  {result.columns.map((col) => (
                    <td
                      key={col}
                      className="px-2 py-1 text-gray-300 whitespace-nowrap"
                    >
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string" && value.length > 100)
    return value.slice(0, 100) + "...";
  return String(value);
}
