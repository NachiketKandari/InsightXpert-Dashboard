"use client";

import { useState, useEffect } from "react";

export interface PromptTemplate {
  key: string;
  label: string;
  content: string;
}

interface Props {
  /** Called whenever the user edits any prompt. Keys are template keys, values are content. */
  onChange: (overrides: Record<string, string>) => void;
}

export default function PromptEditor({ onChange }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/prompts");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }

        const tmpls: PromptTemplate[] = [];
        const orig: Record<string, string> = {};
        for (const [key, val] of Object.entries(data.templates) as [string, { label: string; content: string }][]) {
          tmpls.push({ key, label: val.label, content: val.content });
          orig[key] = val.content;
        }
        setTemplates(tmpls);
        setOriginals(orig);
        if (tmpls.length > 0) setActiveTab(tmpls[0].key);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleEdit(key: string, content: string) {
    const newEdits = { ...edits };
    // Only track as override if different from original
    if (content !== originals[key]) {
      newEdits[key] = content;
    } else {
      delete newEdits[key];
    }
    setEdits(newEdits);
    onChange(newEdits);
  }

  function resetTemplate(key: string) {
    const newEdits = { ...edits };
    delete newEdits[key];
    setEdits(newEdits);
    onChange(newEdits);
  }

  function resetAll() {
    setEdits({});
    onChange({});
  }

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Loading templates...</div>;
  }

  if (error) {
    return <div className="text-xs text-red-400 py-2">Failed to load templates: {error}</div>;
  }

  if (templates.length === 0) return null;

  const editCount = Object.keys(edits).length;
  const active = templates.find((t) => t.key === activeTab);
  const currentContent = edits[activeTab] ?? originals[activeTab] ?? "";
  const isEdited = activeTab in edits;

  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/50 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-800 bg-gray-900/80">
        <div className="flex overflow-x-auto">
          {templates.map((t) => {
            const edited = t.key in edits;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 text-[11px] whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  t.key === activeTab
                    ? "border-blue-500 text-blue-300"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
                {edited && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-400" />
                )}
              </button>
            );
          })}
        </div>
        {editCount > 0 && (
          <button
            type="button"
            onClick={resetAll}
            className="ml-auto mr-2 text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer shrink-0"
          >
            reset all ({editCount})
          </button>
        )}
      </div>

      {/* Editor */}
      {active && (
        <div>
          <div className="flex items-center justify-between px-3 py-1 bg-gray-950/50">
            <span className="text-[10px] text-gray-600 font-mono">
              {active.key}.j2
            </span>
            <div className="flex items-center gap-2">
              {isEdited && (
                <>
                  <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400">
                    modified
                  </span>
                  <button
                    type="button"
                    onClick={() => resetTemplate(activeTab)}
                    className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
                  >
                    reset
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={currentContent}
            onChange={(e) => handleEdit(activeTab, e.target.value)}
            spellCheck={false}
            className="w-full bg-gray-950 px-3 py-2 text-[11px] leading-relaxed text-gray-300 font-mono min-h-[250px] max-h-[500px] resize-y focus:outline-none border-none"
            style={{ tabSize: 2 }}
          />
        </div>
      )}
    </div>
  );
}
