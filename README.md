# InsightXpert Dashboard

An internal evaluation workbench for the InsightXpert text-to-SQL pipeline. Start benchmark runs, track progress in real time, explore results with Sankey diagrams, and compare runs side by side.

## Getting Started

```bash
cd dashboard
npm install
npm run dev -- -p 3333
```

Open `http://localhost:3333`. The sidebar provides four modes:

- **Explore** — Load a single eval JSON for Sankey diagrams and detailed question analysis
- **Compare** — Load 2+ eval JSONs to compare success/failure across runs
- **Benchmark** — Configure and launch evaluation runs with live progress tracking
- **History** — Browse all past evaluation results from the `results/` directory

## Modes

### Explore (`/explore`)
Load an evaluation JSON (file upload or `?file=<path>` URL param). Features:
- Sankey diagram: difficulty → issue → resolution flow (if diagnosis data present)
- Filterable question table (difficulty, issue, resolution, correct/incorrect)
- Expandable rows: editable SQL, direct execution against SQLite, full pipeline re-run with all flags
- Prompt editor for real-time Jinja2 template modifications

### Compare (`/compare`)
Load 2+ eval JSONs (file upload or `?files=path1,path2`). Features:
- Intersection of question IDs across runs
- Per-difficulty accuracy breakdown table
- Per-question pass/fail matrix with colored badges
- Expanded view: side-by-side predicted SQL, SqlRunner per run, formatted prompts

### Benchmark (`/benchmark`)
Start and monitor evaluation runs from the UI:
- Configure all pipeline flags (model, linking, refinement, generation)
- Configure evaluation flags (database filter, difficulty, limit, concurrency)
- Quick presets for common configurations
- Live progress bar with green (correct) / red (incorrect) segments
- Real-time accuracy counter, recent questions feed, error log
- On completion: navigate directly to Explore or History

### History (`/history`)
Browse past results from the `results/` directory:
- Card grid with accuracy bars, per-difficulty breakdowns, run config pills
- Filter by model and linking mode, sort by date or accuracy
- Click a card to open in Explore
- Multi-select cards, then "Compare Selected" to open in Compare

## Accepted JSON Formats

The app auto-detects the format on load.

| Format | Shape | Source |
|--------|-------|--------|
| Raw eval results | `{ results: [{ question_id, db_id, difficulty, predicted_sql, gold_sql, execution_match }] }` | `python -m insightxpert evaluate` |
| Diagnosed results | Same + `diagnosis: { issue_type, resolution_type, ... }` per item | `incorrect/diagnose.py` |
| Compact viz format | `[{ qid, db, diff, issue, resolution, pred_sql, gold_sql, execution_match }]` | Any pre-processed export |

## Pipeline Flags

Flags are defined in `app/lib/pipeline-flags.ts` — **the single source of truth**. Add a new CLI flag entry there and the UI automatically renders the control.

Two flag arrays:
- `PIPELINE_FLAGS` — flags for `python -m insightxpert ask` (used in single-question re-runs and benchmarks)
- `EVALUATE_FLAGS` — evaluate-only flags (db filter, difficulty, limit, concurrency, resume)

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/execute` | POST | Run SQL against a local SQLite DB |
| `/api/rerun` | POST | Re-run a question through the pipeline |
| `/api/prompts` | GET | Load Jinja2 prompt templates |
| `/api/benchmark/start` | POST | Start an evaluation run (spawns subprocess) |
| `/api/benchmark/stream` | GET | SSE stream of progress events |
| `/api/benchmark/cancel` | POST | Cancel a running benchmark |
| `/api/benchmark/status` | GET | Check if a benchmark is running |
| `/api/results` | GET | List all past eval results |
| `/api/results/load` | GET | Load a specific result file by path |

## Project Structure

```
app/
├── explore/page.tsx           Single-file exploration
├── compare/page.tsx           Multi-file comparison
├── benchmark/page.tsx         Benchmark runner
├── history/page.tsx           Results browser
├── components/
│   ├── Sidebar.tsx            Navigation sidebar
│   ├── SankeyChart.tsx        d3-sankey with drag + click-to-filter
│   ├── DetailTable.tsx        Filterable question table
│   ├── ExpandedRow.tsx        SQL editors + SqlRunner + re-run panel
│   ├── BenchmarkRunner.tsx    Config panel with flag controls + presets
│   ├── BenchmarkProgress.tsx  Live progress bar, question feed, error log
│   ├── RunHistoryBrowser.tsx  Card grid of past results
│   ├── RunCard.tsx            Single result card with accuracy bar
│   ├── Compare*.tsx           Comparison UI components
│   └── ...                    FlagControls, Dropdown, SqlRunner, etc.
├── lib/
│   ├── paths.ts               Single source of truth for filesystem paths
│   ├── pipeline-flags.ts      Flag definitions + CLI arg builders
│   ├── benchmark-state.ts     Server-side subprocess singleton
│   ├── progress-parser.ts     Parse Python stderr progress lines
│   ├── benchmark-types.ts     Progress event type definitions
│   ├── use-benchmark.ts       React hook for SSE connection
│   ├── normalize.ts           Auto-detect and normalize JSON formats
│   ├── types.ts               Core TypeScript interfaces
│   └── ...                    colors, build-graph, compare-logic
└── api/                       Next.js route handlers
```

## Dependencies

- `next` 16.2.2, `react` 19.2.4, `tailwindcss` 4
- `d3` + `d3-sankey` — Sankey diagram
- `better-sqlite3` — server-side SQLite execution

## Requirements

- Node.js 18+
- InsightXpert Python venv at `../.venv/` (one level up from dashboard/)
- SQLite databases at `../Test/mini_dev/minidev/MINIDEV/dev_databases/` (for execute and rerun routes)
- Evaluation results at `../results/` (for history and benchmark completion)
