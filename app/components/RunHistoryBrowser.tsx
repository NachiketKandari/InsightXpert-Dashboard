"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RunCard, { type ResultSummary } from "./RunCard";

type SortMode = "newest" | "accuracy-high" | "accuracy-low";

export default function RunHistoryBrowser() {
  const router = useRouter();
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterModel, setFilterModel] = useState("");
  const [filterLinking, setFilterLinking] = useState("");

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchResults() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/results");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openInExplore(filePath: string) {
    router.push(`/explore?file=${encodeURIComponent(filePath)}`);
  }

  function compareSelected() {
    const paths = results
      .filter((r) => selected.has(r.id))
      .map((r) => r.filePath);
    router.push(`/compare?files=${encodeURIComponent(paths.join(","))}`);
  }

  // Derive filter options
  const models = [...new Set(
    results.map((r) => r.runConfig?.model).filter(Boolean) as string[]
  )].sort();
  const linkingModes = [...new Set(
    results.map((r) => r.runConfig?.linking_mode).filter(Boolean) as string[]
  )].sort();

  // Filter
  let filtered = results;
  if (filterModel) {
    filtered = filtered.filter((r) => r.runConfig?.model === filterModel);
  }
  if (filterLinking) {
    filtered = filtered.filter((r) => r.runConfig?.linking_mode === filterLinking);
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "newest") return b.timestamp.localeCompare(a.timestamp);
    if (sortMode === "accuracy-high") return b.accuracy - a.accuracy;
    return a.accuracy - b.accuracy;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500">
        <span className="text-sm">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-200 gap-4">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchResults}
          className="rounded-md bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-200 gap-4">
        <h1 className="text-2xl font-semibold">Run History</h1>
        <p className="text-sm text-gray-500">
          No evaluation results found in the results/ directory.
        </p>
        <p className="text-xs text-gray-600">
          Run a benchmark first, then come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-auto">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-950 px-6 py-3 z-30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Run History</h1>
            <p className="text-sm text-gray-500">
              {results.length} evaluation runs found
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filters */}
            {models.length > 1 && (
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 cursor-pointer"
              >
                <option value="">All models</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m.replace("gemini-", "")}</option>
                ))}
              </select>
            )}
            {linkingModes.length > 1 && (
              <select
                value={filterLinking}
                onChange={(e) => setFilterLinking(e.target.value)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 cursor-pointer"
              >
                <option value="">All linking</option>
                {linkingModes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="accuracy-high">Highest accuracy</option>
              <option value="accuracy-low">Lowest accuracy</option>
            </select>

            <button
              onClick={fetchResults}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
            >
              Refresh
            </button>

            {selected.size >= 2 && (
              <button
                onClick={compareSelected}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer"
              >
                Compare {selected.size} runs
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Card grid */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((r) => (
            <RunCard
              key={r.id}
              result={r}
              selected={selected.has(r.id)}
              onToggleSelect={() => toggleSelect(r.id)}
              onClick={() => openInExplore(r.filePath)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
