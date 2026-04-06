"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CompareDashboard from "../components/CompareDashboard";
import type { LoadedRun } from "../lib/compare-types";
import { normalizeData, extractRunConfig, extractReportMeta } from "../lib/normalize";

const RUN_COLORS = [
  "#3b82f6", "#f97316", "#22c55e", "#a855f7",
  "#ef4444", "#06b6d4", "#eab308", "#ec4899",
];

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const [serverRuns, setServerRuns] = useState<LoadedRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const filesParam = searchParams.get("files");
    if (!filesParam) return;

    const paths = filesParam.split(",").filter(Boolean);
    if (paths.length < 2) return;

    Promise.all(
      paths.map(async (p, i) => {
        const res = await fetch(`/api/results/load?path=${encodeURIComponent(p)}`);
        if (!res.ok) throw new Error(`Failed to load ${p}: HTTP ${res.status}`);
        const raw = await res.json();
        if (raw.error) throw new Error(raw.error);

        const records = normalizeData(raw);
        const config = extractRunConfig(raw);
        const meta = extractReportMeta(raw);

        const recordMap = new Map<number, (typeof records)[0]>();
        for (const r of records) recordMap.set(r.qid, r);

        const label = config
          ? [
              config.model?.replace("gemini-", "").replace("-preview", ""),
              config.linking_mode,
            ]
              .filter(Boolean)
              .join(" / ") || p.split("/").pop() || p
          : p.split("/").pop() || p;

        return {
          id: crypto.randomUUID(),
          fileName: p.split("/").pop() || p,
          label,
          color: RUN_COLORS[i % RUN_COLORS.length],
          runConfig: config,
          totalQuestions: meta.total || records.length,
          accuracy: meta.accuracy,
          records: recordMap,
        } as LoadedRun;
      })
    )
      .then(setServerRuns)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [searchParams]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400 text-sm">
        {loadError}
      </div>
    );
  }

  return <CompareDashboard initialRuns={serverRuns ?? undefined} />;
}
