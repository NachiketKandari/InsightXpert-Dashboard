"use client";

import { useBenchmark } from "../lib/use-benchmark";
import BenchmarkRunner from "../components/BenchmarkRunner";
import BenchmarkProgress from "../components/BenchmarkProgress";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

export default function BenchmarkPage() {
  const { status, events, questions, start, cancel, startError } = useBenchmark();

  if (IS_HOSTED) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium mb-2">Benchmark Runner</p>
          <p className="text-sm">
            Not available in hosted mode. Run the dashboard locally for full functionality.
          </p>
        </div>
      </div>
    );
  }

  // Show progress if running or if we have events (just completed)
  if (status.running || events.length > 0) {
    return (
      <BenchmarkProgress
        status={status}
        questions={questions}
        events={events}
        onCancel={cancel}
      />
    );
  }

  // Show config panel
  return (
    <BenchmarkRunner
      onStart={(pf, ef) => start(pf, ef)}
      startError={startError}
    />
  );
}
