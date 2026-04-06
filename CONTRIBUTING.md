# Contributing

## Development Setup

### Prerequisites

- Node.js 18+
- The InsightXpert Python project at one directory up (`../`)
- Python venv at `../.venv/` with the package installed
- SQLite benchmark databases at `../Test/mini_dev/minidev/MINIDEV/dev_databases/`

### Install and Run

```bash
cd dashboard
npm install
npm run dev -- -p 3333
```

Open `http://localhost:3333`. The app redirects to `/explore` with a sidebar for navigation.

### Python venv (for API routes)

The `/api/rerun`, `/api/execute`, and `/api/benchmark/*` routes need the Python environment:

```bash
cd ..
uv venv
uv pip install -e .
```

Without this, Explore and Compare still work (they're client-side JSON viewers), but SQL execution and pipeline re-runs will fail.

### Environment variables

The Python pipeline reads from `../.env`:
```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_THINKING_LEVEL=low
```

The dashboard itself has no `.env` — all configuration comes from the pipeline flags UI.

---

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full layout and data flow diagrams.

Key directories:
- `app/components/` — React components (client-side, `"use client"`)
- `app/lib/` — Shared utilities and types (some server-only, some shared)
- `app/api/` — Next.js route handlers (server-side)
- `app/<mode>/page.tsx` — Page routes (explore, compare, benchmark, history)

---

## Development Guidelines

### Adding features

See [EXTENDING.md](EXTENDING.md) for step-by-step guides on:
- Adding new pipeline flags
- Adding new API routes
- Adding new pages/modes
- Adding new JSON formats

### Code style

- **TypeScript** for all files, strict mode
- **Tailwind CSS** for styling, no CSS modules or styled-components
- **Dark theme** — gray-950 backgrounds, gray-200 text, blue-600 accents
- **No external state management** — React useState/useEffect is sufficient
- **Functional components** — no class components

### Naming conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase.tsx | `BenchmarkRunner.tsx` |
| Utilities | camelCase.ts | `pipeline-flags.ts` |
| Types files | kebab-case.ts | `benchmark-types.ts` |
| API routes | kebab-case dirs | `api/benchmark/start/route.ts` |
| React hooks | use-*.ts | `use-benchmark.ts` |
| Flag keys | camelCase | `linkingMode`, `maxConcurrent` |
| CSS | Tailwind utilities | `bg-gray-950 text-gray-200` |

### Imports

```ts
// Components import lib files with ../lib/
import type { DiagnosisRecord } from "../lib/types";

// Components import other components with ./
import SqlRunner from "./SqlRunner";

// API routes import lib files with ../../lib/ (or deeper)
import { REPO_ROOT } from "../../lib/paths";
```

### Error handling

- API routes: wrap in try/catch, return `{ error: msg }` with appropriate status code
- Client-side: show error in UI via state, don't swallow silently
- subprocess calls: capture stderr, show last N lines on failure

---

## Building

```bash
npm run build    # Production build
npm run lint     # ESLint check
```

The build must pass cleanly before committing. Check for:
- TypeScript errors
- Import path issues (common after file moves)
- `useSearchParams` without `<Suspense>` wrapper (Next.js 16 requirement)

---

## Commit Messages

- Write concise, descriptive commit messages
- Focus on _why_ not _what_ (the diff shows what)
- No AI co-author lines
- Examples:
  ```
  Add benchmark runner with SSE progress streaming
  Fix path resolution after project relocation
  Extend pipeline-flags with evaluate-specific entries
  ```

---

## Common Tasks

### Test a specific API route

```bash
# SQL execution
curl -X POST http://localhost:3333/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"db_id":"toxicology","sql":"SELECT COUNT(*) FROM atom"}'

# Check benchmark status
curl http://localhost:3333/api/benchmark/status

# List past results
curl http://localhost:3333/api/results
```

### Test the benchmark flow

1. Go to `/benchmark`
2. Set "Quick test (limit=10)" preset
3. Click "Start Benchmark"
4. Watch the progress bar fill
5. On completion, click "Open in Explore"

### Debug Python subprocess issues

If `/api/rerun` or `/api/benchmark/start` fails:
1. Check that `../.venv/bin/python` exists
2. Run the CLI manually: `cd .. && .venv/bin/python -m insightxpert ask --json --db toxicology "test question"`
3. Check stderr output — the dashboard captures and returns the last 20 lines
