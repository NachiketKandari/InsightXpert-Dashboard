# Extending the Dashboard

Step-by-step guides for common extension tasks.

## Adding a New Pipeline Flag

When a new CLI flag is added to `python -m insightxpert ask` or `evaluate`:

**1. Edit `app/lib/pipeline-flags.ts`**

Add an entry to `PIPELINE_FLAGS` (for `ask` flags) or `EVALUATE_FLAGS` (for `evaluate`-only flags):

```ts
{
  flag: "my-new-flag",        // CLI name without --
  key: "myNewFlag",           // camelCase for React state
  label: "My New Flag",       // UI display label
  type: "boolean",            // boolean | choice | int | string
  default: false,             // Match the Python CLI default
  description: "What it does",
  group: "linking",           // linking | refinement | generation | model | metadata | evaluate
}
```

For `choice` type, add `choices: ["option1", "option2"]`.
For `int` type, add `min` and `max`.

**2. That's it.**

The UI automatically renders the control (FlagControls.tsx reads the array dynamically), and `buildCliArgs()` / `buildEvalCliArgs()` automatically converts it to CLI arguments. No other files need changes.

**Adding a new group:** Add the group name to the `FlagDef.group` union type, add a label in `FlagControls.tsx`'s `GROUP_LABELS` object, and add it to `GROUP_ORDER`.

---

## Adding a New API Route

**1. Create the route file**

```
app/api/my-route/route.ts
```

For nested routes: `app/api/my-route/sub/route.ts` → `/api/my-route/sub`

**2. Basic template**

```ts
import { NextRequest, NextResponse } from "next/server";
import { REPO_ROOT } from "../../lib/paths";  // adjust depth

export const runtime = "nodejs";  // required if using fs, child_process, etc.

export async function GET(req: NextRequest) {
  try {
    // your logic
    return NextResponse.json({ data: "..." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**3. Use shared paths**

Always import from `lib/paths.ts` for filesystem paths. Never hardcode `../../` or `process.cwd()` in route files.

**4. Input validation**

- Validate `db_id` with `/[^a-zA-Z0-9_-]/` regex
- Validate file paths are within expected directories (prevent traversal)
- Use `execFile` (not `exec`) for subprocess spawning

---

## Adding a New Page/Mode

**1. Create the page directory and file**

```
app/my-mode/page.tsx
```

```tsx
"use client";

export default function MyModePage() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200">
      <header className="shrink-0 border-b border-gray-800 px-6 py-3">
        <h1 className="text-lg font-semibold">My Mode</h1>
      </header>
      <div className="flex-1 p-6">
        {/* content */}
      </div>
    </div>
  );
}
```

**2. Add to the sidebar**

Edit `app/components/Sidebar.tsx` — add an entry to the `NAV_ITEMS` array:

```ts
{
  href: "/my-mode",
  label: "My Mode",
  icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      {/* your SVG icon path */}
    </svg>
  ),
},
```

**3. If using URL params**, wrap in `<Suspense>`:

```tsx
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function MyModePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyModeContent />
    </Suspense>
  );
}

function MyModeContent() {
  const params = useSearchParams();
  // ...
}
```

---

## Adding a New JSON Format

**1. Edit `app/lib/normalize.ts`**

Add detection logic in `normalizeData()`:

```ts
if (/* detect your format */) {
  items = raw.yourField;
}
```

Then add a mapping in `normalizeRecord()` to produce `DiagnosisRecord` from your format's fields.

**2. Update README.md**

Add the new format to the "Accepted JSON Formats" table.

---

## Modifying the Sankey Diagram

The Sankey is built from `DiagnosisRecord[]` in three steps:

1. `build-graph.ts` → constructs `SankeyNode[]` and `SankeyLink[]` with 3 layers: difficulty → issue → resolution
2. `SankeyChart.tsx` → runs d3-sankey layout, renders SVG with drag + click
3. `colors.ts` → provides color mappings for node labels

**To add a new layer:** Modify `buildGraph()` in `build-graph.ts` to add nodes at a new `layer` value, and add links from/to adjacent layers.

**To change colors:** Edit the color maps in `colors.ts`.

---

## Working with the Benchmark System

### How it works internally

1. **Start:** `POST /api/benchmark/start` calls `benchmark-state.ts:startBenchmark()` which spawns `python -m insightxpert evaluate` via `execFile`
2. **Parse:** `benchmark-state.ts` attaches a readline parser to stderr, calling `progress-parser.ts:parseProgressLine()` on each line
3. **Buffer:** Parsed events are pushed to an in-memory array (max 10,000 entries)
4. **Stream:** `GET /api/benchmark/stream` polls the buffer every 500ms and sends new events as SSE
5. **Client:** `use-benchmark.ts` connects an `EventSource` and accumulates events into React state
6. **Done:** When the process exits, a `done` event is emitted with the results file path

### To modify progress parsing

Edit `progress-parser.ts`. The regexes match against Python's `logger.info/warning/error` output. If you change the Python logging format, update the regexes here.

### Key constraint

Only one benchmark can run at a time. The `benchmark-state.ts` singleton rejects `startBenchmark()` if a run is already active.

---

## Code Conventions

- **Components:** `app/components/`, `"use client"` directive, PascalCase filenames
- **Utilities:** `app/lib/`, no React imports in pure utility files
- **API routes:** `app/api/<name>/route.ts`, always handle errors with try/catch
- **Styling:** Tailwind utility classes, dark theme (gray-950 background)
- **State:** React useState/useEffect, no external state management library
- **Types:** TypeScript interfaces in `lib/types.ts` and `lib/*-types.ts`
- **Paths:** Always use `lib/paths.ts` constants for filesystem access
