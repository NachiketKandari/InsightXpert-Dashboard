import { NextRequest } from "next/server";
import { getEvents, getStatus, isDone } from "../../../lib/benchmark-state";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  const sinceStr = req.nextUrl.searchParams.get("since");
  const since = sinceStr ? parseInt(sinceStr, 10) : 0;

  const status = getStatus();
  if (!status.runId || (runId && status.runId !== runId)) {
    return new Response("data: " + JSON.stringify({ type: "error", message: "No matching benchmark run" }) + "\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const encoder = new TextEncoder();
  let lastIndex = since;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          const events = getEvents(lastIndex);
          for (const event of events) {
            const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
            lastIndex = event.index + 1;

            if (event.type === "done") {
              closed = true;
              clearInterval(interval);
              controller.close();
              return;
            }
          }

          // If the benchmark is done but we haven't seen the done event yet,
          // check isDone() as a safety net
          if (isDone() && events.length === 0) {
            const doneData = `event: done\ndata: ${JSON.stringify({ type: "done", exitCode: null, resultsPath: null })}\n\n`;
            controller.enqueue(encoder.encode(doneData));
            closed = true;
            clearInterval(interval);
            controller.close();
          }
        } catch {
          closed = true;
          clearInterval(interval);
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 500);

      // Clean up if the client disconnects
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
