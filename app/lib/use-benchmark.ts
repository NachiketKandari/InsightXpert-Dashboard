"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ProgressEvent, BenchmarkStatus, QuestionEvent } from "./benchmark-types";

interface UseBenchmarkReturn {
  status: BenchmarkStatus;
  events: ProgressEvent[];
  questions: QuestionEvent[];
  start: (pipelineFlags: Record<string, unknown>, evalFlags: Record<string, unknown>) => Promise<void>;
  cancel: () => Promise<void>;
  isConnected: boolean;
  startError: string | null;
}

const EMPTY_STATUS: BenchmarkStatus = {
  running: false,
  runId: null,
  completed: 0,
  total: 0,
  correct: 0,
  failed: 0,
  elapsed: 0,
  config: null,
};

export function useBenchmark(): UseBenchmarkReturn {
  const [status, setStatus] = useState<BenchmarkStatus>(EMPTY_STATUS);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [questions, setQuestions] = useState<QuestionEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastIndexRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Close SSE connection
  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  // Connect to SSE stream
  const connectSSE = useCallback((runId: string, since = 0) => {
    closeSSE();
    lastIndexRef.current = since;

    const url = `/api/benchmark/stream?runId=${runId}&since=${since}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      // EventSource auto-reconnects; just update connected state
      setIsConnected(false);
    };

    const handleEvent = (e: MessageEvent) => {
      try {
        const event: ProgressEvent = JSON.parse(e.data);
        lastIndexRef.current = (event.index ?? lastIndexRef.current) + 1;

        setEvents((prev) => [...prev, event]);

        if (event.type === "question") {
          setQuestions((prev) => [...prev, event as QuestionEvent]);
          setStatus((prev) => ({
            ...prev,
            completed: event.completed,
            total: event.total,
            correct: (event as QuestionEvent).match ? prev.correct + 1 : prev.correct,
            failed: (event as QuestionEvent).match ? prev.failed : prev.failed + 1,
          }));
        } else if (event.type === "error") {
          setStatus((prev) => ({
            ...prev,
            completed: event.completed,
            total: event.total,
            failed: prev.failed + 1,
          }));
        } else if (event.type === "meta") {
          if (event.totalCases) {
            setStatus((prev) => ({ ...prev, total: event.totalCases! }));
          }
        } else if (event.type === "done") {
          setStatus((prev) => ({ ...prev, running: false }));
          closeSSE();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("question", handleEvent);
    es.addEventListener("meta", handleEvent);
    es.addEventListener("error", handleEvent);
    es.addEventListener("done", handleEvent);
  }, [closeSSE]);

  // Start elapsed timer
  const startElapsedTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setStatus((prev) => ({
        ...prev,
        elapsed: (Date.now() - startTimeRef.current) / 1000,
      }));
    }, 1000);
  }, []);

  // Check for existing running benchmark on mount
  useEffect(() => {
    fetch("/api/benchmark/status")
      .then((res) => res.json())
      .then((data: BenchmarkStatus) => {
        setStatus(data);
        if (data.running && data.runId) {
          startTimeRef.current = Date.now() - data.elapsed * 1000;
          startElapsedTimer();
          connectSSE(data.runId, 0); // Replay all events
        }
      })
      .catch(() => {});

    return () => closeSSE();
  }, [connectSSE, closeSSE, startElapsedTimer]);

  // Warn on tab close when benchmark is running
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status.running) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status.running]);

  // Start a new benchmark
  const start = useCallback(async (
    pipelineFlags: Record<string, unknown>,
    evalFlags: Record<string, unknown>
  ) => {
    setStartError(null);
    setEvents([]);
    setQuestions([]);

    try {
      const res = await fetch("/api/benchmark/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineFlags, evalFlags }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error || `HTTP ${res.status}`);
        return;
      }

      setStatus({
        running: true,
        runId: data.runId,
        completed: 0,
        total: 0,
        correct: 0,
        failed: 0,
        elapsed: 0,
        config: { pipelineFlags, evalFlags },
      });

      startElapsedTimer();
      connectSSE(data.runId);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    }
  }, [connectSSE, startElapsedTimer]);

  // Cancel running benchmark
  const cancel = useCallback(async () => {
    try {
      await fetch("/api/benchmark/cancel", { method: "POST" });
      setStatus((prev) => ({ ...prev, running: false }));
      closeSSE();
    } catch {
      // ignore
    }
  }, [closeSSE]);

  return { status, events, questions, start, cancel, isConnected, startError };
}
