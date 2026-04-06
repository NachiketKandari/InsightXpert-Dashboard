"use client";

import { useState } from "react";
import type { DiagnosisRecord } from "../lib/types";
import SqlRunner from "./SqlRunner";
import PromptRunner from "./PromptRunner";
import PipelineRerunPanel from "./PipelineRerunPanel";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

interface Props {
  record: DiagnosisRecord;
  colSpan: number;
  hasDiagnosis: boolean;
}

export default function ExpandedRow({ record: r, colSpan, hasDiagnosis }: Props) {
  const [predSql, setPredSql] = useState(r.pred_sql);
  const [goldSql, setGoldSql] = useState(r.gold_sql);

  const predEdited = predSql !== r.pred_sql;
  const goldEdited = goldSql !== r.gold_sql;

  return (
    <tr className="bg-gray-900/80">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                Predicted SQL
              </span>
              <span
                className={`text-[10px] rounded px-1.5 py-0.5 ${
                  r.execution_match
                    ? "bg-green-900/30 text-green-400"
                    : "bg-red-900/30 text-red-400"
                }`}
              >
                {r.execution_match ? "correct" : "wrong"}
              </span>
              {predEdited && (
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
                  edited
                </span>
              )}
              {predEdited && (
                <button
                  onClick={() => setPredSql(r.pred_sql)}
                  className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
                >
                  reset
                </button>
              )}
            </div>
            <textarea
              value={predSql}
              onChange={(e) => setPredSql(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[300px] min-h-[100px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400">
                Gold SQL
              </span>
              {goldEdited && (
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
                  edited
                </span>
              )}
              {goldEdited && (
                <button
                  onClick={() => setGoldSql(r.gold_sql)}
                  className="text-[10px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
                >
                  reset
                </button>
              )}
            </div>
            <textarea
              value={goldSql}
              onChange={(e) => setGoldSql(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md bg-gray-950 border border-gray-800 p-3 text-[11px] leading-relaxed text-gray-300 font-mono max-h-[300px] min-h-[100px] overflow-auto resize-y focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>
        {hasDiagnosis && r.prompt_change && (
          <div className="mt-3 rounded-md border border-yellow-900/40 bg-yellow-950/20 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-500">
              Suggested Prompt Change
            </span>
            <p className="mt-1 text-xs text-yellow-200/80 leading-relaxed">
              {r.prompt_change}
            </p>
          </div>
        )}
        <SqlRunner dbId={r.db} predSql={predSql} goldSql={goldSql} />
        {!IS_HOSTED && (
          <>
            {r.prompt && (
              <PromptRunner
                initialPrompt={r.prompt}
                dbId={r.db}
                goldSql={r.gold_sql}
                originalPredSql={r.pred_sql}
              />
            )}
            <PipelineRerunPanel record={r} />
          </>
        )}
      </td>
    </tr>
  );
}
