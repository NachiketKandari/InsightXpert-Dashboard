"use client";

import { Fragment, useRef, useEffect, useMemo, useState } from "react";
import type { DiagnosisRecord } from "../lib/types";
import { DIFF_COLORS, ISSUE_COLORS, RESOLUTION_COLORS } from "../lib/colors";
import Badge from "./Badge";
import Dropdown from "./Dropdown";
import ExpandedRow from "./ExpandedRow";

interface Props {
  data: DiagnosisRecord[];
  filter: { issue?: string; resolution?: string; diff?: string };
  onFilterChange: (f: {
    issue?: string;
    resolution?: string;
    diff?: string;
  }) => void;
  sankeyActive?: boolean;
  hasDiagnosis?: boolean;
}

export default function DetailTable({
  data,
  filter,
  onFilterChange,
  sankeyActive,
  hasDiagnosis = true,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      data.filter((r) => {
        if (filter.issue && r.issue !== filter.issue) return false;
        if (filter.resolution && r.resolution !== filter.resolution) return false;
        if (filter.diff && r.diff !== filter.diff) return false;
        return true;
      }),
    [data, filter.issue, filter.resolution, filter.diff]
  );

  const { issues, resolutions, diffs, issueCounts, resCounts, diffCounts } =
    useMemo(() => {
      const issueSet = new Set<string>();
      const resSet = new Set<string>();
      const diffSet = new Set<string>();
      const ic = new Map<string, number>();
      const rc = new Map<string, number>();
      const dc = new Map<string, number>();
      for (const r of data) {
        issueSet.add(r.issue);
        resSet.add(r.resolution);
        diffSet.add(r.diff);
        ic.set(r.issue, (ic.get(r.issue) || 0) + 1);
        rc.set(r.resolution, (rc.get(r.resolution) || 0) + 1);
        dc.set(r.diff, (dc.get(r.diff) || 0) + 1);
      }
      return {
        issues: [...issueSet].sort(),
        resolutions: [...resSet].sort(),
        diffs: [...diffSet].sort(
          (a, b) =>
            ["simple", "moderate", "challenging"].indexOf(a) -
            ["simple", "moderate", "challenging"].indexOf(b)
        ),
        issueCounts: ic,
        resCounts: rc,
        diffCounts: dc,
      };
    }, [data]);

  const hasFilter = !!(filter.issue || filter.resolution || filter.diff);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setExpandedRow(null);
  }, [filter.issue, filter.resolution, filter.diff]);

  function rowKey(r: DiagnosisRecord, idx: number) {
    return `${r.qid}-${r.db}-${idx}`;
  }

  const colSpan = hasDiagnosis ? 10 : 6;

  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      {/* Filter bar */}
      <div className="shrink-0 flex gap-3 flex-wrap items-center">
        <span className="text-sm text-gray-400">Filter:</span>

        <Dropdown
          value={filter.diff || ""}
          placeholder="All difficulties"
          onChange={(v) =>
            onFilterChange({ ...filter, diff: v || undefined })
          }
          options={diffs.map((d) => ({
            value: d,
            label: `${d} (${diffCounts.get(d) ?? 0})`,
          }))}
        />

        {hasDiagnosis && (
          <>
            <Dropdown
              value={filter.issue || ""}
              placeholder="All issues"
              onChange={(v) =>
                onFilterChange({ ...filter, issue: v || undefined })
              }
              options={issues.map((i) => ({
                value: i,
                label: `${i} (${issueCounts.get(i) ?? 0})`,
              }))}
            />

            <Dropdown
              value={filter.resolution || ""}
              placeholder="All resolutions"
              onChange={(v) =>
                onFilterChange({ ...filter, resolution: v || undefined })
              }
              options={resolutions.map((r) => ({
                value: r,
                label: `${r} (${resCounts.get(r) ?? 0})`,
              }))}
            />
          </>
        )}

        {hasFilter && !sankeyActive && (
          <button
            onClick={() => onFilterChange({})}
            className="rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}

        <span className="text-sm text-gray-500 ml-auto tabular-nums">
          {filtered.length} / {data.length} questions
        </span>
      </div>

      {/* Table */}
      <div
        ref={scrollRef}
        className="overflow-auto rounded-lg border border-gray-700 max-h-[85vh]"
      >
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-800 text-gray-400 sticky top-0 z-[5]">
            <tr>
              <th className="px-3 py-2.5 font-medium w-6"></th>
              <th className="px-3 py-2.5 font-medium">QID</th>
              <th className="px-3 py-2.5 font-medium">DB</th>
              <th className="px-3 py-2.5 font-medium">Diff</th>
              <th className="px-3 py-2.5 font-medium">Match</th>
              <th className="px-3 py-2.5 font-medium min-w-[220px]">
                Question
              </th>
              {hasDiagnosis && (
                <>
                  <th className="px-3 py-2.5 font-medium">Issue</th>
                  <th className="px-3 py-2.5 font-medium min-w-[250px]">
                    Issue Detail
                  </th>
                  <th className="px-3 py-2.5 font-medium">Resolution</th>
                  <th className="px-3 py-2.5 font-medium min-w-[250px]">
                    Resolution Detail
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-12 text-center text-gray-500"
                >
                  No matching questions
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => {
                const key = rowKey(r, idx);
                const isExpanded = expandedRow === key;
                return (
                  <Fragment key={key}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className={`cursor-pointer transition-colors ${
                        isExpanded
                          ? "bg-gray-800/60"
                          : "hover:bg-gray-800/40"
                      }`}
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : key)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedRow(isExpanded ? null : key);
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
                      <td className="px-3 py-2.5 font-mono text-gray-400">
                        {r.qid}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">{r.db}</td>
                      <td className="px-3 py-2.5">
                        <Badge color={DIFF_COLORS[r.diff]}>{r.diff}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.execution_match ? (
                          <span className="text-green-400 font-medium">Y</span>
                        ) : (
                          <span className="text-red-400 font-medium">N</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-200 leading-relaxed">
                        {r.q}
                      </td>
                      {hasDiagnosis && (
                        <>
                          <td className="px-3 py-2.5">
                            <Badge color={ISSUE_COLORS[r.issue]}>
                              {r.issue}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-gray-300 leading-relaxed">
                            {r.issue_detail}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge color={RESOLUTION_COLORS[r.resolution]}>
                              {r.resolution}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-gray-300 leading-relaxed">
                            {r.resolution_detail}
                          </td>
                        </>
                      )}
                    </tr>
                    {isExpanded && (
                      <ExpandedRow
                        record={r}
                        colSpan={colSpan}
                        hasDiagnosis={hasDiagnosis}
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
