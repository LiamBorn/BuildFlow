import type http from "node:http";
import type { FileDurability } from "./fileDurability.js";
import type { ScheduleLiveHub } from "./schedule/live.js";

/** Close long-lived streams first so server.close can finish and release the PG lock. */
export function createShutdown(
  server: http.Server,
  live: ScheduleLiveHub,
  durability?: Pick<FileDurability, "close" | "flush">,
  exit: (code: number) => void = (code) => process.exit(code),
  timeoutMs = 10_000
): (signal: string) => void {
  let closing = false;
  return (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n[server] ${signal} — ending live streams, then finishing in-flight requests.`);
    live.closeAll();
    server.closeIdleConnections();

    // The first timer starts one last save even if another request is still open.
    // The second is a firm deadline, including if PostgreSQL is unavailable.
    const lastSave = setTimeout(
      () => {
        console.warn("[server] shutdown deadline approaching — trying one last PostgreSQL save.");
        void durability?.flush().catch((error: unknown) => console.error("[server] last save failed:", error));
      },
      Math.max(0, timeoutMs - 2000)
    );
    const deadline = setTimeout(() => {
      console.error("[server] shutdown timed out; exiting.");
      exit(1);
    }, timeoutMs);
    lastSave.unref();
    deadline.unref();

    server.close(() => {
      void (async () => {
        await durability?.close();
        clearTimeout(lastSave);
        clearTimeout(deadline);
        console.log("[server] closed cleanly.");
        exit(0);
      })().catch((error: unknown) => {
        clearTimeout(lastSave);
        clearTimeout(deadline);
        console.error("[server] failed to flush saved files:", error);
        exit(1);
      });
    });
  };
}
