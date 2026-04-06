"use client";

interface RunConfig {
  model?: string;
  linking_mode?: string;
  thinking_level?: string;
  use_evidence?: boolean;
  use_refinement?: boolean;
  metadata_mode?: string;
  num_candidates?: number;
  [key: string]: unknown;
}

interface ByDifficulty {
  total: number;
  correct: number;
}

export interface ResultSummary {
  id: string;
  filePath: string;
  dirName: string;
  timestamp: string;
  total: number;
  correct: number;
  accuracy: number;
  accuracyRelaxed: number;
  byDifficulty: Record<string, ByDifficulty>;
  runConfig: RunConfig | null;
}

interface Props {
  result: ResultSummary;
  selected?: boolean;
  onToggleSelect?: () => void;
  onClick: () => void;
}

const DIFF_ORDER = ["simple", "moderate", "challenging"];

function formatTimestamp(ts: string): string {
  if (!ts || ts.length < 15) return ts;
  // YYYYMMDD_HHMMSS → YYYY-MM-DD HH:MM
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}`;
}

function accColor(pct: number): string {
  if (pct >= 80) return "text-green-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-red-400";
}

function barColor(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export default function RunCard({ result, selected, onToggleSelect, onClick }: Props) {
  const accPct = (result.accuracy * 100).toFixed(1);
  const config = result.runConfig;

  const pills: string[] = [];
  if (config) {
    if (config.model) {
      pills.push(String(config.model).replace("gemini-", "").replace("-preview", ""));
    }
    if (config.linking_mode) pills.push(config.linking_mode);
    if (config.thinking_level) pills.push(`think:${config.thinking_level}`);
    if (config.use_evidence === false) pills.push("no-evidence");
    if (config.use_refinement === false) pills.push("no-refine");
    if (config.metadata_mode && config.metadata_mode !== "profiling") {
      pills.push(config.metadata_mode);
    }
    if (config.num_candidates && config.num_candidates > 1) {
      pills.push(`${config.num_candidates}cand`);
    }
  }

  return (
    <div
      className={`rounded-lg border bg-gray-900/50 p-4 transition-colors cursor-pointer hover:bg-gray-800/60 ${
        selected ? "border-blue-500 bg-blue-900/10" : "border-gray-800"
      }`}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-200 truncate" title={result.dirName}>
            {result.dirName}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            {formatTimestamp(result.timestamp)}
          </div>
        </div>
        {onToggleSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`shrink-0 w-5 h-5 rounded border transition-colors cursor-pointer ${
              selected
                ? "bg-blue-600 border-blue-600"
                : "border-gray-600 hover:border-gray-400"
            }`}
          >
            {selected && (
              <svg viewBox="0 0 20 20" fill="white" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Accuracy bar */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className={`text-lg font-bold tabular-nums ${accColor(result.accuracy * 100)}`}>
            {accPct}%
          </span>
          <span className="text-[10px] text-gray-600">
            {result.correct}/{result.total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor(result.accuracy * 100)}`}
            style={{ width: `${result.accuracy * 100}%` }}
          />
        </div>
      </div>

      {/* Per-difficulty mini bars */}
      <div className="flex gap-3 mb-3">
        {DIFF_ORDER.map((diff) => {
          const stats = result.byDifficulty[diff];
          if (!stats || stats.total === 0) return null;
          const pct = (stats.correct / stats.total) * 100;
          return (
            <div key={diff} className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[9px] text-gray-500 capitalize truncate">
                  {diff}
                </span>
                <span className="text-[9px] text-gray-600 tabular-nums">
                  {stats.correct}/{stats.total}
                </span>
              </div>
              <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Config pills */}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pills.map((pill) => (
            <span
              key={pill}
              className="rounded px-1.5 py-0.5 text-[9px] bg-gray-800 text-gray-400"
            >
              {pill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
