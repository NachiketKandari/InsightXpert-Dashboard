import type { ProgressEvent } from "./benchmark-types";

/**
 * Parse a single stderr line from the Python evaluation pipeline.
 *
 * Known patterns from pipeline.py:
 *   INFO     [45/500] ✓ 198
 *   WARNING  [45/500] ✗ 199 | wrong result
 *   ERROR    [45/500] Error on question 200: timeout
 *   INFO     Loaded 500 test cases
 *   INFO     Resuming: 42 already completed, skipping those question IDs
 */
export function parseProgressLine(
  line: string,
  nextIndex: number
): ProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const now = Date.now();

  // Match: [N/total] ✓ qid
  const successMatch = trimmed.match(
    /\[(\d+)\/(\d+)\]\s*✓\s*(\d+)/
  );
  if (successMatch) {
    return {
      type: "question",
      index: nextIndex,
      completed: parseInt(successMatch[1], 10),
      total: parseInt(successMatch[2], 10),
      qid: parseInt(successMatch[3], 10),
      match: true,
      error: null,
      timestamp: now,
    };
  }

  // Match: [N/total] ✗ qid | error
  const failMatch = trimmed.match(
    /\[(\d+)\/(\d+)\]\s*✗\s*(\d+)\s*\|\s*(.*)/
  );
  if (failMatch) {
    return {
      type: "question",
      index: nextIndex,
      completed: parseInt(failMatch[1], 10),
      total: parseInt(failMatch[2], 10),
      qid: parseInt(failMatch[3], 10),
      match: false,
      error: failMatch[4] || null,
      timestamp: now,
    };
  }

  // Match: [N/total] Error on question qid: msg
  const errorMatch = trimmed.match(
    /\[(\d+)\/(\d+)\]\s*Error on question\s*(\d+):\s*(.*)/
  );
  if (errorMatch) {
    return {
      type: "error",
      index: nextIndex,
      completed: parseInt(errorMatch[1], 10),
      total: parseInt(errorMatch[2], 10),
      qid: parseInt(errorMatch[3], 10),
      error: errorMatch[4],
      timestamp: now,
    };
  }

  // Match: Loaded N test cases
  const loadedMatch = trimmed.match(/Loaded\s+(\d+)\s+test cases/);
  if (loadedMatch) {
    return {
      type: "meta",
      index: nextIndex,
      totalCases: parseInt(loadedMatch[1], 10),
      timestamp: now,
    };
  }

  // Match: Resuming: N already completed
  const resumeMatch = trimmed.match(
    /Resuming:\s*(\d+)\s+already completed/
  );
  if (resumeMatch) {
    return {
      type: "meta",
      index: nextIndex,
      resumed: parseInt(resumeMatch[1], 10),
      timestamp: now,
    };
  }

  return null;
}
