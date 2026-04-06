"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

const ALL_NAV_ITEMS: NavItem[] = [
  {
    href: "/explore",
    label: "Explore",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    href: "/compare",
    label: "Compare",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M2 4.5A2.5 2.5 0 014.5 2h3A2.5 2.5 0 0110 4.5v3A2.5 2.5 0 017.5 10h-3A2.5 2.5 0 012 7.5v-3zM10 12.5a2.5 2.5 0 012.5-2.5h3a2.5 2.5 0 012.5 2.5v3a2.5 2.5 0 01-2.5 2.5h-3a2.5 2.5 0 01-2.5-2.5v-3zM2 12.5A2.5 2.5 0 014.5 10h3a2.5 2.5 0 012.5 2.5v3A2.5 2.5 0 017.5 18h-3A2.5 2.5 0 012 15.5v-3zM10 4.5A2.5 2.5 0 0112.5 2h3A2.5 2.5 0 0118 4.5v3A2.5 2.5 0 0115.5 10h-3A2.5 2.5 0 0110 7.5v-3z" />
      </svg>
    ),
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

const NAV_ITEMS = IS_HOSTED
  ? ALL_NAV_ITEMS.filter((item) => item.href !== "/benchmark")
  : ALL_NAV_ITEMS;

export default function Sidebar() {
  const pathname = usePathname();
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  // Poll benchmark status with adaptive interval (5s running, 30s idle).
  // Skip polling entirely in hosted mode.
  useEffect(() => {
    if (IS_HOSTED) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      timer = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      try {
        const res = await fetch("/api/benchmark/status");
        if (res.ok && mounted) {
          const data = await res.json();
          const running = data.running === true;
          setBenchmarkRunning(running);
          if (mounted) schedule(running ? 5000 : 30000);
        } else if (mounted) {
          schedule(30000);
        }
      } catch {
        // API not available yet — retry after idle interval
        if (mounted) schedule(30000);
      }
    };

    poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <nav className="group/sidebar shrink-0 flex flex-col bg-gray-950 border-r border-gray-800 w-12 hover:w-48 transition-all duration-200 overflow-hidden">
      {/* Logo / brand */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-800">
        <div className="shrink-0 w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
          IX
        </div>
        <span className="text-sm font-semibold text-gray-200 whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
          InsightXpert
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1 py-3 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>

              {/* Benchmark running indicator */}
              {item.href === "/benchmark" && benchmarkRunning && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
