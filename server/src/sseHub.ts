/**
 * Server-Sent Event streams, kept in groups (a workspace), with the rules that make a reader who has
 * gone, or stopped reading, cost nothing.
 *
 * These rules were the schedule's live feed's own (schedule/live.ts, and live-stream-health.test.ts
 * for why each one exists). The Mac's nudges (/api/desktop/events) need exactly the same ones, so
 * they live here once and both feeds are built on them:
 *
 * - A frame is never written to a response that has finished or been destroyed; the stream is
 *   dropped instead. Writing there is at best pointless and at worst an unhandled 'error'.
 * - A stream with more than a megabyte queued is ended. `res.write()` to a socket nobody drains does
 *   not fail: Node buffers it and says so by returning false. A frame is a few hundred bytes, so a
 *   megabyte is thousands of missed frames: not a slow reader, a reader that is gone. Its client
 *   reconnects (the stream sets `retry:`), and gets a fresh start.
 * - 'error' is listened for as well as 'close'. An 'error' with no listener is how a Node process dies.
 * - The heartbeat, a comment frame every 25 seconds that keeps proxies from closing a quiet stream,
 *   goes through the same guard as a real frame, and stops with its stream.
 *
 * In memory only: a restart drops every stream and the clients reconnect on their own.
 */
import type { Response } from "express";

/** How often a quiet stream is sent a comment frame. */
export const SSE_HEARTBEAT_MS = 25_000;

/** How much unsent data a stream may have queued before it is ended (see above). */
export const SSE_MAX_BUFFERED_BYTES = 1_048_576;

type Stream<Meta> = { meta: Meta; heartbeat: ReturnType<typeof setInterval> };

export type SseOpenOptions<Meta> = {
  /** How long the client waits before reconnecting, sent as the stream's `retry:`. */
  retryMs: number;
  /** A frame sent first, after `retry:`: the feed's hello. */
  hello?: string;
  /**
   * Asked before each heartbeat. Answering false means the stream should not go on (its device was
   * revoked, say); the hook is expected to have ended it, and the heartbeat is not sent.
   */
  beforeHeartbeat?: (meta: Meta) => boolean;
};

export class SseHub<Meta = undefined> {
  private readonly groups = new Map<string, Map<Response, Stream<Meta>>>();
  private closing = false;

  constructor(private readonly heartbeatMs = SSE_HEARTBEAT_MS) {}

  /**
   * Opens the stream on `res` and keeps it until the client goes. False when the hub is shutting
   * down, in which case `res` has been answered 503.
   */
  open(group: string, res: Response, meta: Meta, options: SseOpenOptions<Meta>): boolean {
    if (this.closing) {
      res.status(503).end();
      return false;
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`retry: ${options.retryMs}\n\n`);
    if (options.hello) res.write(options.hello);
    const streams = this.groups.get(group) ?? new Map<Response, Stream<Meta>>();
    this.groups.set(group, streams);
    const heartbeat = setInterval(() => {
      if (options.beforeHeartbeat && !options.beforeHeartbeat(meta)) return;
      this.send(group, res, ": ping\n\n");
    }, this.heartbeatMs);
    heartbeat.unref?.();
    streams.set(res, { meta, heartbeat });
    const forget = () => this.drop(group, res);
    res.on("close", forget);
    res.on("error", forget);
    return true;
  }

  /**
   * One frame to every stream in the group, or to those whose meta passes `only`. Answers how many
   * were actually written to: a stream that has gone, or stopped reading, is dropped rather than counted.
   */
  broadcast(group: string, frame: string, only?: (meta: Meta) => boolean): number {
    const streams = this.groups.get(group);
    if (!streams) return 0;
    let heard = 0;
    for (const [res, stream] of [...streams]) {
      if (only && !only(stream.meta)) continue;
      if (this.send(group, res, frame)) heard += 1;
    }
    return heard;
  }

  /**
   * Ends the streams whose meta passes `which`, in every group, after writing `last` to each where it
   * still can be. Answers how many were ended.
   */
  end(which: (meta: Meta, group: string) => boolean, last?: string): number {
    let ended = 0;
    for (const [group, streams] of [...this.groups]) {
      for (const [res, stream] of [...streams]) {
        if (!which(stream.meta, group)) continue;
        if (last) this.send(group, res, last);
        this.drop(group, res);
        if (!res.writableEnded) res.end();
        ended += 1;
      }
    }
    return ended;
  }

  /** Every open stream's meta, with its group: for a sweep that decides which to end. */
  entries(): Array<{ group: string; meta: Meta }> {
    return [...this.groups].flatMap(([group, streams]) => [...streams.values()].map((stream) => ({ group, meta: stream.meta })));
  }

  /** How many streams the group has open. */
  size(group: string): number {
    return this.groups.get(group)?.size ?? 0;
  }

  /** Ends every stream and refuses new ones (shutdown, tests). */
  closeAll() {
    this.closing = true;
    for (const [group, streams] of [...this.groups]) {
      for (const res of [...streams.keys()]) {
        this.drop(group, res);
        res.end();
      }
    }
    this.groups.clear();
  }

  private drop(group: string, res: Response) {
    const streams = this.groups.get(group);
    const stream = streams?.get(res);
    if (!streams || !stream) return;
    clearInterval(stream.heartbeat);
    streams.delete(res);
    if (streams.size === 0) this.groups.delete(group);
  }

  /** One frame to one stream, or the stream goes (see the rules at the top). */
  private send(group: string, res: Response, frame: string): boolean {
    if (res.writableEnded || res.destroyed) {
      this.drop(group, res);
      return false;
    }
    if (res.writableLength > SSE_MAX_BUFFERED_BYTES) {
      this.drop(group, res);
      res.end();
      return false;
    }
    res.write(frame);
    return true;
  }
}
