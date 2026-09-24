/**
 * The schedule's live feed: one Server-Sent Events stream per open browser tab,
 * grouped by org, and a publish() every schedule write calls so the org's other
 * tabs reload and flash what changed. In memory only — a restart drops the streams
 * and the browsers reconnect on their own (EventSource retries).
 */
import type { Express, Response } from "express";
import type { ScheduleLiveEvent } from "@buildflow/shared";

const HEARTBEAT_MS = 25_000;

/**
 * How much unsent data a stream may have queued before it is dropped.
 *
 * `res.write()` on a socket that is not being drained does not fail; Node buffers it in memory and
 * says so by returning false, which this used to ignore. A tab that stops reading — asleep, a
 * suspended phone, or a client opened deliberately and never read from — therefore had every publish
 * frame kept for it, and a busy schedule publishes on every write. Nothing ever freed that.
 *
 * A frame here is a few hundred bytes, so a megabyte is thousands of missed events: not a slow
 * reader, a reader that is gone. Dropping it is safe and self-healing — the stream sets
 * `retry: 3000`, so a browser that is actually still there reconnects in three seconds and gets a
 * fresh `hello`.
 */
const MAX_BUFFERED_BYTES = 1_048_576;

export class ScheduleLiveHub {
  private streams = new Map<string, Set<Response>>();
  private closing = false;

  /** Opens the stream on `res` and keeps it until the tab goes away. */
  subscribe(orgId: string, res: Response) {
    if (this.closing) {
      res.status(503).end();
      return;
    }
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
    // a comment frame keeps proxies and browsers from closing a quiet stream — and goes through the
    // same guard as a real frame, because a heartbeat to a dead socket is the same mistake
    const heartbeat = setInterval(() => this.send(tabs, res, ": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();
    const forget = () => {
      clearInterval(heartbeat);
      tabs.delete(res);
      if (tabs.size === 0) this.streams.delete(orgId);
    };
    res.on("close", forget);
    /* A socket that fails mid-write emits 'error' on the response, and an 'error' with no listener is
       how a Node process dies. This is the listener, and it does the same thing as a close. */
    res.on("error", forget);
  }

  /**
   * Tells every open tab of the org what changed; returns how many actually heard it.
   *
   * The count is of tabs written to, not tabs on the list: a stream that has died or stopped reading
   * is dropped here rather than counted, so `publish` returning 2 means two tabs were sent the frame.
   */
  publish(orgId: string, event: ScheduleLiveEvent) {
    const tabs = this.streams.get(orgId);
    if (!tabs) return 0;
    const frame = `event: schedule\ndata: ${JSON.stringify(event)}\n\n`;
    let heard = 0;
    for (const res of [...tabs]) if (this.send(tabs, res, frame)) heard += 1;
    if (tabs.size === 0) this.streams.delete(orgId);
    return heard;
  }

  /**
   * One frame to one stream, or the stream goes.
   *
   * Three states a Response can be in that a bare `res.write()` does not distinguish. Already
   * finished or destroyed: writing to it is at best pointless and at worst an unhandled 'error' on a
   * stream nobody is listening to. Not draining: see MAX_BUFFERED_BYTES. Otherwise, write it.
   */
  private send(tabs: Set<Response>, res: Response, frame: string): boolean {
    if (res.writableEnded || res.destroyed) {
      tabs.delete(res);
      return false;
    }
    if (res.writableLength > MAX_BUFFERED_BYTES) {
      tabs.delete(res);
      res.end();
      return false;
    }
    res.write(frame);
    return true;
  }

  /** How many tabs of the org are listening. */
  size(orgId: string) {
    return this.streams.get(orgId)?.size ?? 0;
  }

  /** Ends every stream (shutdown, tests). */
  closeAll() {
    this.closing = true;
    for (const tabs of this.streams.values()) for (const res of tabs) res.end();
    this.streams.clear();
  }
}

/** Fail before listening if the real app has not wired its live stream into shutdown. */
export function liveHubFor(app: Express): ScheduleLiveHub {
  const hub: unknown = app.locals.live;
  if (!(hub instanceof ScheduleLiveHub)) throw new Error("BuildFlow live-update hub is missing from the app.");
  return hub;
}
