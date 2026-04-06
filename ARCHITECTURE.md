# Architecture

## Overview

The dashboard is a Next.js 16 App Router application that provides a UI layer over the InsightXpert Python pipeline. All heavy computation (SQL generation, evaluation, execution matching) happens in Python — the dashboard handles visualization, configuration, and orchestration.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 19 + Tailwind)                          │
│                                                         │
│  ┌──────┐ ┌──────┐ ┌─────────┐ ┌───────┐              │
│  │Explore│ │Compare│ │Benchmark│ │History│              │
│  └──┬───┘ └──┬───┘ └────┬────┘ └───┬───┘              │
│     │        │          │           │                   │
│     │  File  │  File    │  SSE      │  GET              │
│     │  Upload│  Upload  │  Stream   │  /api/results     │
│     │        │          │           │                   │
└─────┼────────┼──────────┼───────────┼───────────────────┘
      │        │          │           │
┌─────┼────────┼──────────┼───────────┼───────────────────┐
│  Next.js API Routes (Node.js)       │                   │
│     │        │          │           │                   │
│  /api/execute  /api/rerun  /api/benchmark/*  /api/results│
│     │            │           │                          │
│  better-sqlite3  execFile    execFile (long-running)    │
│     │            │           │                          │
└─────┼────────────┼───────────┼──────────────────────────┘
      │            │           │
┌─────┼────────────┼───────────┼──────────────────────────┐
│  External Resources                                      │
│                                                          │
│  SQLite DBs          Python venv          results/ dir   │
│  (../Test/...)       (../.venv/)          (../results/)  │
│                                                          │
│  python -m insightxpert ask    ← single question         │
│  python -m insightxpert evaluate ← full benchmark        │
└──────────────────────────────────────────────────────────┘
```

## File Structure

```
dashboard/
├── app/
│   ├── layout.tsx              Root layout — Sidebar + main content area
│   ├── page.tsx                / → redirects to /explore
│   ├── explore/page.tsx        Single-file exploration with Sankey + table
│   ├── compare/page.tsx        Multi-file comparison
│   ├── benchmark/page.tsx      Benchmark config + live progress
│   ├── history/page.tsx        Past results browser
│   │
│   ├── components/             All React components
│   │   ├── Sidebar.tsx         Persistent navigation (48px → 200px hover)
│   │   ├── SankeyChart.tsx     d3-sankey diagram with interactive filtering
│   │   ├── DetailTable.tsx     Filterable question table with expandable rows
│   │   ├── ExpandedRow.tsx     SQL editors + SqlRunner + PromptRunner + PipelineRerunPanel
│   │   ├── SqlRunner.tsx       Execute SQL against SQLite, side-by-side results
│   │   ├── PromptRunner.tsx    Quick prompt-only LLM call (skip pipeline)
│   │   ├── PipelineRerunPanel.tsx   Re-run full pipeline with flag + prompt editing
│   │   ├── FlagControls.tsx    Dynamic control renderer from FlagDef arrays
│   │   ├── PromptEditor.tsx    Tabbed Jinja2 template editor
│   │   ├── Badge.tsx           Shared colored badge (used across tables)
│   │   ├── Dropdown.tsx        Custom accessible dropdown
│   │   ├── RerunResultDisplay.tsx   Pipeline response visualizer
│   │   ├── BenchmarkRunner.tsx    Config panel with presets
│   │   ├── BenchmarkProgress.tsx  Live progress with green/red bar
│   │   ├── RunHistoryBrowser.tsx  Card grid of past results
│   │   ├── RunCard.tsx         Single result card
│   │   ├── CompareDashboard.tsx   Comparison orchestrator
│   │   ├── CompareFileLoader.tsx  Multi-file picker
│   │   ├── CompareSummary.tsx     Per-difficulty stats table
│   │   └── CompareTable.tsx       Question-level comparison table
│   │
│   ├── lib/                    Shared utilities (no React)
│   │   ├── paths.ts            REPO_ROOT, VENV_PYTHON, DB_ROOT, etc.
│   │   ├── types.ts            DiagnosisRecord, PipelineResponse, etc.
│   │   ├── normalize.ts        Auto-detect 3 JSON formats → DiagnosisRecord[]
│   │   ├── pipeline-flags.ts   PIPELINE_FLAGS + EVALUATE_FLAGS + CLI arg builders
│   │   ├── benchmark-types.ts  ProgressEvent, BenchmarkStatus
│   │   ├── benchmark-state.ts  Server-side subprocess singleton
│   │   ├── progress-parser.ts  Parse Python stderr progress lines
│   │   ├── use-benchmark.ts    React hook for SSE connection
│   │   ├── compare-types.ts    LoadedRun, ComparedQuestion, etc.
│   │   ├── compare-logic.ts    computeComparison, loadRunFromFile
│   │   ├── build-graph.ts      Sankey node/link construction
│   │   └── colors.ts           Color maps for badges/categories
│   │
│   └── api/                    Next.js route handlers
│       ├── execute/route.ts    POST — run SQL via better-sqlite3
│       ├── rerun/route.ts      POST — re-run full pipeline via Python CLI
│       ├── prompt-run/route.ts POST — send raw prompt to LLM, extract SQL
│       ├── prompts/route.ts    GET — load Jinja2 templates from disk
│       ├── benchmark/
│       │   ├── start/route.ts  POST — spawn evaluate subprocess
│       │   ├── stream/route.ts GET — SSE progress event stream
│       │   ├── cancel/route.ts POST — SIGTERM the subprocess
│       │   └── status/route.ts GET — running/idle state
│       └── results/
│           ├── route.ts        GET — scan results/ for eval_results_*.json
│           └── load/route.ts   GET — read a specific result file
│
├── package.json
├── next.config.ts
├── tsconfig.json
└── postcss.config.mjs
```

## Data Flow

### Explore Mode
```
User drops JSON → FileReader → normalize.ts → DiagnosisRecord[]
                                                    │
                    ┌───────────────────────────────┤
                    │                               │
              SankeyChart                      DetailTable
              (d3 layout)                    (filter + expand)
                    │                               │
              click node/link               ExpandedRow
              → filter table                   │
                                     ┌────┴─────────────┐
                                SqlRunner   PromptRunner   PipelineRerunPanel
                                POST /api/  POST /api/     POST /api/rerun
                                execute     prompt-run     → full pipeline
                                            → 1 LLM call
```

### Compare Mode
```
User drops N files → loadRunFromFile() each
                          │
                    Map<qid, DiagnosisRecord> per run
                          │
                    computeComparison()
                    → intersect question IDs
                    → categorize: all_correct / all_wrong / mixed
                    → compute per-difficulty stats
                          │
                    ComparisonResult
                    ┌─────┴──────┐
              CompareSummary  CompareTable
              (stats table)   (per-question rows)
```

### Benchmark Mode
```
User configures flags → POST /api/benchmark/start
                              │
                        execFile("python -m insightxpert evaluate ...")
                              │
                        stderr parsed line-by-line
                        → benchmark-state.ts event buffer
                              │
                        GET /api/benchmark/stream (SSE)
                        → EventSource in browser
                        → use-benchmark.ts hook
                              │
                        BenchmarkProgress component
                        (live progress bar, question feed)
                              │
                        On done → results path → /explore?file=...
```

### History Mode
```
GET /api/results → scan results/ dir recursively
                   → read top-level fields from each JSON
                   → return sorted ResultSummary[]
                        │
                  RunHistoryBrowser
                  (card grid with filters)
                        │
                  Click → /explore?file=<path>
                  Multi-select → /compare?files=p1,p2
```

## Key Design Patterns

### Single Source of Truth for Flags
`pipeline-flags.ts` defines all CLI flags as data. The same array drives:
- UI rendering (FlagControls.tsx)
- CLI arg building (buildCliArgs / buildEvalCliArgs)
- Default value computation (getDefaults / getEvalDefaults)

### Server-Side Singleton for Benchmarks
`benchmark-state.ts` uses module-level variables that persist across HTTP requests in the same Node.js process. This holds the running subprocess reference and event buffer. Only one benchmark can run at a time.

### Normalized Data Model
All three JSON formats (raw eval, diagnosed, compact) are normalized to `DiagnosisRecord[]` at load time via `normalize.ts`. Downstream components never care about the source format.

### Path Resolution
All filesystem paths resolve through `paths.ts`. The dashboard sits one directory below the repo root (`../`), and all path constants are derived from `REPO_ROOT`.

## SSE Protocol (Benchmark Streaming)

The benchmark stream uses Server-Sent Events over `GET /api/benchmark/stream`.

**Events:**
```
event: meta
data: {"type":"meta","index":0,"totalCases":500,"timestamp":1712000000}

event: question
data: {"type":"question","index":1,"completed":1,"total":500,"qid":198,"match":true,"error":null,"timestamp":1712000001}

event: question
data: {"type":"question","index":2,"completed":2,"total":500,"qid":199,"match":false,"error":"wrong result","timestamp":1712000002}

event: done
data: {"type":"done","index":500,"exitCode":0,"signal":null,"resultsPath":"minidev_all_.../eval_results_20260404.json","timestamp":1712000500}
```

**Reconnection:** Client sends `?since=<lastIndex>` to replay missed events from the server buffer.

## Security Considerations

- `db_id` validated against `/[^a-zA-Z0-9_-]/` in all API routes
- Result file loading validates resolved path is within `RESULTS_DIR` (path traversal prevention)
- Python subprocess spawned via `execFile` (not `exec`) to prevent shell injection
- SQLite opened in readonly mode with `journal_mode = OFF`
- Tooltips use `textContent` (not `innerHTML`) to prevent XSS
- No authentication — this is an internal tool only

## Performance & Caching

### Client-side memoization
- Filter dropdowns in `DetailTable` and `CompareTable` use `useMemo` to compute
  unique values and counts in a single pass over the data. Dropdown label counts
  use pre-computed `Map<string, number>` instead of `data.filter()` per option.
- Filtered row arrays are memoized on `[data, ...filterValues]` to avoid
  re-filtering on unrelated state changes.
- Explore page memoizes view-mode filtered data, diagnosis detection, and
  correct/incorrect counts separately from render logic.

### HTTP caching
- `GET /api/results` — `Cache-Control: private, max-age=30` (result list is
  re-fetched at most every 30s during page navigation).
- `GET /api/results/load` — `Cache-Control: private, max-age=300` (eval result
  files are immutable once written).
- `readSummary()` truncates JSON before the `"results"` array to avoid parsing
  500+ records when only top-level summary fields are needed.

### Polling
- Sidebar benchmark status uses chained `setTimeout` (not `setInterval`) with
  adaptive delay: 5s while a benchmark is running, 30s when idle.

### Event buffer
- Benchmark events capped at `MAX_EVENTS = 10,000` with oldest-first eviction
  to bound memory.

## Engineering Practices

### Shared components
- `Badge.tsx` — single source for colored label badges (used in DetailTable,
  CompareTable, and other tables). Never duplicate inline.
- `SqlRunner.tsx` — reusable SQL execution panel with side-by-side pred/gold
  results. Used in ExpandedRow, CompareTable RunPanel, and PromptRunner.

### Accessibility
- Clickable table rows use `role="button"`, `tabIndex={0}`, `aria-expanded`,
  and `onKeyDown` handlers for Enter/Space key support.
- `FlagControls` toggle switches use `role="switch"` with `aria-checked`.
- Interactive buttons always include `type="button"` to prevent form submission.

### Error handling
- Fetch failures are surfaced to the user (e.g. Explore file picker shows load
  errors instead of silently swallowing them).
- API routes return structured `{ error: string }` responses with appropriate
  HTTP status codes.
- `AbortController` is used for cancellable fetch calls in `PipelineRerunPanel`
  and `PromptRunner`, with cleanup in `useEffect` teardown.

### Hooks discipline
- All hooks are called unconditionally before any early returns (React rules of
  hooks). Derived data that depends on conditional state is computed via
  `useMemo` placed before the early return, not after.
- `useCallback` is used for event handlers passed to child components or D3
  bindings to maintain stable references.

### Quick Prompt Run vs Full Pipeline Rerun
Two distinct re-execution paths are available per question:

| | Quick Prompt Run | Full Pipeline Rerun |
|---|---|---|
| **What it does** | Sends the saved prompt (with linked schema baked in) directly to the LLM | Runs profiling → linking → generation → refinement |
| **API calls** | 1 LLM call | Multiple LLM calls + DB queries |
| **Use case** | Prompt engineering — tweak instructions/rules, keep schema as-is | Test end-to-end pipeline changes (flags, templates, models) |
| **Endpoint** | `POST /api/prompt-run` | `POST /api/rerun` |
| **CLI command** | `echo "..." \| python -m insightxpert prompt-run` | `python -m insightxpert ask` |
