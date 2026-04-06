"use client";

import { Suspense, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { DiagnosisRecord } from "../lib/types";
import { normalizeData } from "../lib/normalize";
import SankeyChart, { type SankeySelection } from "../components/SankeyChart";
import DetailTable from "../components/DetailTable";
import type { ResultSummary } from "../components/RunCard";

type ViewMode = "all" | "incorrect" | "correct";

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">Loading...</div>}>
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const [allData, setAllData] = useState<DiagnosisRecord[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [selection, setSelection] = useState<SankeySelection | null>(null);
  const [manualFilter, setManualFilter] = useState<{
    issue?: string;
    resolution?: string;
    diff?: string;
  }>({});
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [loadError, setLoadError] = useState<string>("");
  const [sankeyOpen, setSankeyOpen] = useState(true);
  const [availableResults, setAvailableResults] = useState<ResultSummary[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [serverLoading, setServerLoading] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available results on mount
  useEffect(() => {
    fetch("/api/results")
      .then((res) => res.json())
      .then((data) => {
        if (data.results) setAvailableResults(data.results);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load results");
      })
      .finally(() => setLoadingResults(false));
  }, []);

  // Load from server when ?file= URL param is present
  useEffect(() => {
    const filePath = searchParams.get("file");
    if (!filePath || allData.length > 0) return;

    setLoadError("");
    fetch(`/api/results/load?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        if (raw.error) throw new Error(raw.error);
        const records = normalizeData(raw);
        setAllData(records);
        setFileName(filePath.split("/").pop() || filePath);
        const hasIncorrect = records.some((r: DiagnosisRecord) => !r.execution_match);
        const hasCorrect = records.some((r: DiagnosisRecord) => r.execution_match);
        if (hasIncorrect && hasCorrect) setViewMode("all");
        else if (hasIncorrect) setViewMode("incorrect");
        else setViewMode("all");
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [searchParams, allData.length]);

  // Derive displayed data based on view mode
  const data = useMemo(
    () =>
      viewMode === "incorrect"
        ? allData.filter((r) => !r.execution_match)
        : viewMode === "correct"
          ? allData.filter((r) => r.execution_match)
          : allData,
    [allData, viewMode]
  );

  const hasDiagnosis = useMemo(
    () => data.some((r) => r.issue !== "undiagnosed"),
    [data]
  );

  const filter = deriveSankeyFilter(selection);
  const activeFilter = selection ? filter : manualFilter;

  const handleSelect = useCallback((s: SankeySelection | null) => {
    setSelection(s);
    if (s && tableRef.current) {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, []);

  const handleFilterChange = useCallback(
    (f: { issue?: string; resolution?: string; diff?: string }) => {
      setSelection(null);
      setManualFilter(f);
    },
    []
  );

  const { incorrectCount, correctCount } = useMemo(() => {
    let incorrect = 0;
    let correct = 0;
    for (const r of allData) {
      if (r.execution_match) correct++;
      else incorrect++;
    }
    return { incorrectCount: incorrect, correctCount: correct };
  }, [allData]);

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const records = normalizeData(raw);
        setAllData(records);
        setFileName(file.name);
        setSelection(null);
        setManualFilter({});
        const hasIncorrect = records.some((r) => !r.execution_match);
        const hasCorrect = records.some((r) => r.execution_match);
        if (hasIncorrect && hasCorrect) {
          setViewMode("all");
        } else if (hasIncorrect) {
          setViewMode("incorrect");
        } else {
          setViewMode("all");
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  }

  function loadFromServer(filePath: string, label: string) {
    setLoadError("");
    setServerLoading(filePath);
    fetch(`/api/results/load?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        if (raw.error) throw new Error(raw.error);
        const records = normalizeData(raw);
        setAllData(records);
        setFileName(label);
        setSelection(null);
        setManualFilter({});
        const hasIncorrect = records.some((r: DiagnosisRecord) => !r.execution_match);
        const hasCorrect = records.some((r: DiagnosisRecord) => r.execution_match);
        if (hasIncorrect && hasCorrect) setViewMode("all");
        else if (hasIncorrect) setViewMode("incorrect");
        else setViewMode("all");
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setServerLoading(null));
  }

  // ── No data loaded yet — show file picker ──
  if (allData.length === 0) {
    return (
      <ExploreFilePicker
        onUpload={handleFileLoad}
        onSelectServer={loadFromServer}
        loadError={loadError}
        serverLoading={serverLoading}
        fileInputRef={fileInputRef}
        availableResults={availableResults}
        loadingResults={loadingResults}
      />
    );
  }

  // ── Explore view ──
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-auto">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-950 px-6 py-3 z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">Explore</h1>
            <p className="text-sm text-gray-500 truncate">
              {fileName} — {data.length} questions shown
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* View mode toggle */}
            <div className="flex rounded-md border border-gray-700 overflow-hidden text-xs">
              <ViewButton
                active={viewMode === "all"}
                onClick={() => setViewMode("all")}
              >
                All ({allData.length})
              </ViewButton>
              {incorrectCount > 0 && (
                <ViewButton
                  active={viewMode === "incorrect"}
                  onClick={() => setViewMode("incorrect")}
                >
                  Incorrect ({incorrectCount})
                </ViewButton>
              )}
              {correctCount > 0 && (
                <ViewButton
                  active={viewMode === "correct"}
                  onClick={() => setViewMode("correct")}
                >
                  Correct ({correctCount})
                </ViewButton>
              )}
            </div>

            {selection && (
              <button
                onClick={() => setSelection(null)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Clear selection
              </button>
            )}

            <button
              onClick={() => {
                setAllData([]);
                setFileName("");
                setSelection(null);
                setManualFilter({});
                setLoadError("");
              }}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Switch file
            </button>
          </div>
        </div>
        {selection && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
            <span className="rounded bg-blue-900/40 px-2 py-0.5 text-blue-300">
              {selectionLabel(selection)}
            </span>
          </div>
        )}
      </header>

      {/* Sankey chart (only if diagnosed data) */}
      {hasDiagnosis && (
        <section className="shrink-0 border-b border-gray-800 relative z-0">
          <button
            onClick={() => setSankeyOpen(!sankeyOpen)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/40 transition-colors cursor-pointer"
          >
            <svg
              className={`w-3 h-3 transition-transform ${sankeyOpen ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            Sankey Diagram
          </button>
          {sankeyOpen && (
            <div className="h-[90vh] overflow-hidden">
              <SankeyChart
                data={data}
                selection={selection}
                onSelect={handleSelect}
              />
            </div>
          )}
        </section>
      )}

      {/* Table */}
      <section ref={tableRef} className="min-h-screen z-10">
        <DetailTable
          data={data}
          filter={activeFilter}
          onFilterChange={handleFilterChange}
          sankeyActive={!!selection}
          hasDiagnosis={hasDiagnosis}
        />
      </section>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  if (!ts || ts.length < 15) return ts;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}`;
}

function ExploreFilePicker({
  onUpload,
  onSelectServer,
  loadError,
  serverLoading,
  fileInputRef,
  availableResults,
  loadingResults,
}: {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectServer: (filePath: string, label: string) => void;
  loadError: string;
  serverLoading: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  availableResults: ResultSummary[];
  loadingResults: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? availableResults.filter(
        (r) =>
          r.dirName.toLowerCase().includes(search.toLowerCase()) ||
          (r.runConfig?.model && String(r.runConfig.model).toLowerCase().includes(search.toLowerCase()))
      )
    : availableResults;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Explore</h1>
          <p className="text-sm text-gray-500">
            Select an evaluation result to explore, or upload a JSON file.
          </p>
        </div>

        {/* Upload button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-dashed border-gray-700 px-5 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer"
          >
            Upload JSON file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={onUpload}
            className="hidden"
          />
          {loadError && (
            <p className="text-sm text-red-400">{loadError}</p>
          )}
        </div>

        {/* Available results from server */}
        {loadingResults ? (
          <div className="text-sm text-gray-600">Scanning results directory...</div>
        ) : availableResults.length === 0 ? (
          <div className="text-sm text-gray-600">
            No evaluation results found in the results/ directory.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Available Results ({availableResults.length})
              </div>
              <input
                type="text"
                placeholder="Search runs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-600 w-48"
              />
            </div>

            <div className="rounded-lg border border-gray-800 overflow-hidden divide-y divide-gray-800/60">
              {filtered.map((r) => {
                const accPct = (r.accuracy * 100).toFixed(1);
                const config = r.runConfig;
                const pills: string[] = [];
                if (config) {
                  if (config.model) pills.push(String(config.model).replace("gemini-", "").replace("-preview", ""));
                  if (config.linking_mode) pills.push(String(config.linking_mode));
                  if (config.thinking_level) pills.push(`think:${config.thinking_level}`);
                  if (config.use_evidence === false) pills.push("no-evidence");
                  if (config.use_refinement === false) pills.push("no-refine");
                }

                const isLoading = serverLoading === r.filePath;

                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectServer(r.filePath, r.dirName)}
                    disabled={!!serverLoading}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {/* Accuracy */}
                    <div className="shrink-0 w-14 text-right">
                      <span className={`text-sm font-bold tabular-nums ${
                        r.accuracy >= 0.8 ? "text-green-400" :
                        r.accuracy >= 0.6 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {accPct}%
                      </span>
                    </div>

                    {/* Accuracy mini bar */}
                    <div className="shrink-0 w-16">
                      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            r.accuracy >= 0.8 ? "bg-green-500" :
                            r.accuracy >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                          }`}
                          style={{ width: `${r.accuracy * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Run name + pills */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">
                        {r.dirName}
                      </div>
                      {pills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {pills.map((p) => (
                            <span key={p} className="rounded px-1.5 py-0.5 text-[9px] bg-gray-800 text-gray-500">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-500 tabular-nums">
                        {r.correct}/{r.total}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        {formatTimestamp(r.timestamp)}
                      </div>
                    </div>

                    {/* Loading indicator */}
                    <div className="shrink-0 w-4">
                      {isLoading && (
                        <svg className="animate-spin w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && search && (
                <div className="px-4 py-6 text-center text-gray-600 text-xs">
                  No results matching &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 transition-colors cursor-pointer ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-800 text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function deriveSankeyFilter(
  sel: SankeySelection | null
): { issue?: string; resolution?: string; diff?: string } {
  if (!sel) return {};
  if (sel.type === "node") {
    if (sel.layer === 0) return { diff: sel.name };
    if (sel.layer === 1) return { issue: sel.name };
    if (sel.layer === 2) return { resolution: sel.name };
  }
  if (sel.type === "link") {
    const f: { issue?: string; resolution?: string; diff?: string } = {};
    if (sel.sourceLayer === 0) f.diff = sel.source;
    if (sel.sourceLayer === 1) f.issue = sel.source;
    if (sel.targetLayer === 1) f.issue = sel.target;
    if (sel.targetLayer === 2) f.resolution = sel.target;
    return f;
  }
  return {};
}

function selectionLabel(sel: SankeySelection): string {
  if (sel.type === "node") return `${sel.name}`;
  if (sel.type === "link") return `${sel.source} → ${sel.target}`;
  return "";
}
