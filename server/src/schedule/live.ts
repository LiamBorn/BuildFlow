/**
 * The schedule's live feed: one Server-Sent Events stream per open browser tab,
 * grouped by org, and a publish() every schedule write calls so the org's other
 * tabs reload and flash what changed. In memory only — a restart drops the streams
 * and the browsers reconnect on their own (EventSource retries).
 */
import type { Express, Response } from "express";
import type { ScheduleLiveEvent } from "@buildflow/shared";
import { SseHub } from "../sseHub.js";

/**
 * The rules that make a tab that has gone, or stopped reading, cost nothing — never writing to a
 * finished or destroyed response, ending a stream with more than a megabyte queued, listening for
 * 'error' as well as 'close', and a heartbeat that goes through the same guard — were written here
 * first. They moved to ../sseHub.ts (2026-09-26) so the Mac's nudges keep them too; this feed is
 * that hub with the schedule's frames. live-stream-health.test.ts still holds this class to them.
 */
export class ScheduleLiveHub {
  private readonly hub = new SseHub();

  /** Opens the stream on `res` and keeps it until the tab goes away. */
  subscribe(orgId: string, res: Response) {
    this.hub.open(orgId, res, undefined, {
      retryMs: 3000,
      hello: `event: hello\ndata: ${JSON.stringify({ orgId, at: new Date().toISOString() })}\n\n`
    });
  }

  /**
   * Tells every open tab of the org what changed; returns how many actually heard it.
   *
   * The count is of tabs written to, not tabs on the list: a stream that has died or stopped reading
   * is dropped here rather than counted, so `publish` returning 2 means two tabs were sent the frame.
   */
  publish(orgId: string, event: ScheduleLiveEvent) {
    return this.hub.broadcast(orgId, `event: schedule\ndata: ${JSON.stringify(event)}\n\n`);
  }

  /** How many tabs of the org are listening. */
  size(orgId: string) {
    return this.hub.size(orgId);
  }

  /** Ends every stream (shutdown, tests). */
  closeAll() {
    this.hub.closeAll();
  }
}

/** Fail before listening if the real app has not wired its live stream into shutdown. */
export function liveHubFor(app: Express): ScheduleLiveHub {
  const hub: unknown = app.locals.live;
  if (!(hub instanceof ScheduleLiveHub)) throw new Error("BuildFlow live-update hub is missing from the app.");
  return hub;
}
