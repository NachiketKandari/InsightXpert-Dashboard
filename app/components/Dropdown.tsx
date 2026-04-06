"use client";

import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
}

export default function Dropdown({
  value,
  options,
  placeholder,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected ? selected.label : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm
          transition-colors cursor-pointer select-none
          ${value ? "border-blue-600 bg-blue-950/40 text-blue-300" : "border-gray-700 bg-gray-800 text-gray-200"}
          hover:border-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500
        `}
      >
        <span className="truncate max-w-[180px]">{displayLabel}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-max min-w-full max-h-[300px] overflow-auto rounded-md border border-gray-700 bg-gray-900 shadow-xl z-[200] py-1">
          {/* "All" option to clear */}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`
              block w-full text-left px-3 py-1.5 text-sm cursor-pointer
              ${!value ? "bg-blue-900/30 text-blue-300" : "text-gray-300 hover:bg-gray-800"}
            `}
          >
            {placeholder}
          </button>

          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`
                block w-full text-left px-3 py-1.5 text-sm cursor-pointer
                ${value === opt.value ? "bg-blue-900/30 text-blue-300" : "text-gray-300 hover:bg-gray-800"}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
