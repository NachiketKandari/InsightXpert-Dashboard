# InsightXpert Dashboard — Implementation Plans

## Phase 1: Project Relocation (DONE)

**Goal**: Move from `incorrect/sankey/` to `dashboard/` at repo root.

**What was done**:
- Copied `incorrect/sankey/` to `dashboard/`
- Reorganized: components → `app/components/`, utilities → `app/lib/`
- Created `app/lib/paths.ts` — single source of truth for REPO_ROOT, VENV_PYTHON, DB_ROOT, PROMPTS_DIR, RESULTS_DIR
- Updated all 3 API routes to import from `paths.ts` (changed `../../` → `../` for repo root resolution)
- Updated all component imports (lib refs: `./x` → `../lib/x`)
- Renamed package to `insightxpert-dashboard`, updated layout metadata

---

## Phase 2: Sidebar + Page-Based Routing

**Goal**: Replace landing-page mode switcher with persistent sidebar and URL-routed pages.

**Key changes**:
- Create `Sidebar.tsx` — thin left sidebar (48px collapsed, 200px on hover), 4 nav items with SVG icons
- Update `layout.tsx` — wrap children with sidebar in a flex layout
- Create `app/page.tsx` — redirect to `/explore`
- Create `app/explore/page.tsx` — extract from Dashboard.tsx (file upload, viewMode, Sankey, DetailTable)
- Create `app/compare/page.tsx` — extract from CompareDashboard.tsx
- Create `app/benchmark/page.tsx` — placeholder
- Create `app/history/page.tsx` — placeholder

**Navigation**: `/explore`, `/compare`, `/benchmark`, `/history` via sidebar `<Link>` + `usePathname()`

---

## Phase 3: Evaluate-Specific CLI Flags

**Goal**: Add evaluate-only flags (db, difficulty, limit, max-concurrent, resume, no-evidence) for benchmark runner.

**Key changes**:
- Add `EVALUATE_FLAGS: FlagDef[]` to `pipeline-flags.ts`
- Add `buildEvalCliArgs(pipelineValues, evalValues)` function
- Add `"evaluate"` group label to `FlagControls.tsx`

---

## Phase 4: Benchmark Runner Backend

**Goal**: Server-side subprocess management for `python -m insightxpert evaluate` with SSE progress streaming.

**Key changes**:
- `lib/benchmark-state.ts` — server-side singleton holding subprocess ref, event buffer
- `lib/progress-parser.ts` — parses stderr for `[N/total] ✓/✗ qid` patterns
- `lib/benchmark-types.ts` — ProgressEvent, BenchmarkStatus interfaces
- `POST /api/benchmark/start` — spawns evaluate subprocess, returns runId
- `GET /api/benchmark/stream` — SSE endpoint streaming parsed progress events
- `POST /api/benchmark/cancel` — SIGTERM + SIGKILL fallback
- `GET /api/benchmark/status` — returns running/idle state

**SSE events**: meta, question, error, done

---

## Phase 5: Benchmark Runner Frontend

**Goal**: UI for configuring and monitoring benchmark runs.

**Key changes**:
- `lib/use-benchmark.ts` — React hook managing SSE lifecycle, event accumulation, live stats
- `BenchmarkRunner.tsx` — config panel with FlagControls for both pipeline + evaluate flags, presets
- `BenchmarkProgress.tsx` — progress bar, live accuracy, per-difficulty bars, question feed, error log
- `benchmark/page.tsx` — idle → BenchmarkRunner, running → BenchmarkProgress, done → results actions

---

## Phase 6: Run History Browser

**Goal**: Browse and load past evaluation results from `results/` directory.

**Key changes**:
- `GET /api/results` — scans results/ for eval_results_*.json, returns metadata
- `GET /api/results/load?path=` — reads specific result file (with path traversal prevention)
- `RunCard.tsx` — displays single run: config pills, accuracy bar, per-difficulty breakdown
- `RunHistoryBrowser.tsx` — card grid, click to explore, multi-select to compare
- `history/page.tsx` — renders RunHistoryBrowser

---

## Phase 7: Cross-Feature Integration

**Goal**: Connect all features together.

**7.1 — Server-loaded files**: `/explore?file=path` and `/compare?files=p1,p2` URL params load from server
**7.2 — Sidebar indicator**: poll `/api/benchmark/status`, show pulsing dot when running
**7.3 — Tab close warning**: `beforeunload` when benchmark is active
