"use client";

import { PIPELINE_FLAGS, type FlagDef } from "../lib/pipeline-flags";

interface Props {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Override which flags to render (default: PIPELINE_FLAGS) */
  flags?: FlagDef[];
}

const GROUP_LABELS: Record<string, string> = {
  linking: "Schema Linking",
  refinement: "Refinement",
  generation: "Generation",
  model: "Model",
  metadata: "Metadata",
  evaluate: "Evaluation",
};

const GROUP_ORDER = ["model", "linking", "generation", "refinement", "metadata", "evaluate"];

export default function FlagControls({ values, onChange, flags }: Props) {
  const flagList = flags ?? PIPELINE_FLAGS;
  const grouped = new Map<string, FlagDef[]>();
  for (const f of flagList) {
    const list = grouped.get(f.group) || [];
    list.push(f);
    grouped.set(f.group, list);
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((group) => {
        const flags = grouped.get(group);
        if (!flags) return null;
        return (
          <div key={group}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              {GROUP_LABELS[group] || group}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
              {flags.map((f) => (
                <FlagControl
                  key={f.key}
                  flag={f}
                  value={values[f.key]}
                  onChange={(v) => onChange(f.key, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlagControl({
  flag,
  value,
  onChange,
}: {
  flag: FlagDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (flag.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer group">
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
            value ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
              value ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <div className="min-w-0">
          <span className="text-xs text-gray-300 group-hover:text-gray-100">
            {flag.label}
          </span>
          <p className="text-[10px] text-gray-600 truncate">{flag.description}</p>
        </div>
      </label>
    );
  }

  if (flag.type === "choice") {
    return (
      <div>
        <label className="text-xs text-gray-300">{flag.label}</label>
        <select
          value={String(value ?? flag.default)}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 block w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-600 cursor-pointer"
        >
          {flag.choices!.map((c) => (
            <option key={c} value={c}>
              {c || "(default from .env)"}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-600 mt-0.5 truncate">{flag.description}</p>
      </div>
    );
  }

  if (flag.type === "int") {
    return (
      <div>
        <label className="text-xs text-gray-300">{flag.label}</label>
        <input
          type="number"
          value={Number(value ?? flag.default)}
          min={flag.min}
          max={flag.max}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!isNaN(parsed)) onChange(parsed);
          }}
          className="mt-0.5 block w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-600"
        />
        <p className="text-[10px] text-gray-600 mt-0.5 truncate">{flag.description}</p>
      </div>
    );
  }

  // string
  return (
    <div>
      <label className="text-xs text-gray-300">{flag.label}</label>
      <input
        type="text"
        value={String(value ?? "")}
        placeholder={flag.description}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-600"
      />
      <p className="text-[10px] text-gray-600 mt-0.5 truncate">{flag.description}</p>
    </div>
  );
}
