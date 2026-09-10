/**
 * The schedule's live feed: one Server-Sent Events stream per open browser tab,
 * grouped by org, and a publish() every schedule write calls so the org's other
 * tabs reload and flash what changed. In memory only — a restart drops the streams
 * and the browsers reconnect on their own (EventSource retries).
 */
import type { Response } from "express";
import type { ScheduleLiveEvent } from "@buildflow/shared";

const HEARTBEAT_MS = 25_000;

export class ScheduleLiveHub {
  private streams = new Map<string, Set<Response>>();

  /** Opens the stream on `res` and keeps it until the tab goes away. */
  subscribe(orgId: string, res: Response) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    res.write(`event: hello\ndata: ${JSON.stringify({ orgId, at: new Date().toISOString() })}\n\n`);
    const tabs = this.streams.get(orgId) ?? new Set<Response>();
    tabs.add(res);
    this.streams.set(orgId, tabs);
    // a comment frame keeps proxies and browsers from closing a quiet stream
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();
    res.on("close", () => {
      clearInterval(heartbeat);
      tabs.delete(res);
      if (tabs.size === 0) this.streams.delete(orgId);
    });
  }

  /** Tells every open tab of the org what changed; returns how many heard it. */
  publish(orgId: string, event: ScheduleLiveEvent) {
    const tabs = this.streams.get(orgId);
    if (!tabs) return 0;
    const frame = `event: schedule\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of tabs) res.write(frame);
    return tabs.size;
  }

  /** How many tabs of the org are listening. */
  size(orgId: string) {
    return this.streams.get(orgId)?.size ?? 0;
  }

  /** Ends every stream (shutdown, tests). */
  closeAll() {
    for (const tabs of this.streams.values()) for (const res of tabs) res.end();
    this.streams.clear();
  }
}
