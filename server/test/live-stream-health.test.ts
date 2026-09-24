/**
 * A live stream that dies, or stops reading, costs nothing.
 *
 * `res.write()` on a socket nobody is draining does not fail. Node buffers the frame in memory and
 * signals it by returning false, which `publish` ignored — so a tab that stopped reading (asleep, a
 * suspended phone, or a stream opened deliberately and never read) had every schedule frame kept for
 * it, and the schedule publishes on every write. Nothing freed that, and nothing noticed.
 *
 * The other half is the `'error'` listener. A socket that fails mid-write emits `'error'` on the
 * response, and an `'error'` event with no listener is how a Node process exits. The stream was removed
 * on `'close'` only, which leaves the window between a socket dying and close firing.
 *
 * Driven against the hub directly with stub responses rather than through HTTP, because the states
 * being tested — destroyed, and buffering without draining — are properties of the Response that real
 * sockets will not hold still in. The last case keeps a real request in the picture so this cannot
 * drift away from what Express actually hands `subscribe`.
 */
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ScheduleLiveHub } from "../src/schedule/live.js";

type Listener = () => void;

/** Just enough Response for the hub, with the three states that matter settable. */
function stubStream(state: Partial<{ writableEnded: boolean; destroyed: boolean; writableLength: number }> = {}) {
  const listeners = new Map<string, Listener[]>();
  const written: string[] = [];
  const res = {
    writableEnded: state.writableEnded ?? false,
    destroyed: state.destroyed ?? false,
    writableLength: state.writableLength ?? 0,
    status: vi.fn(() => res),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((frame: string) => {
      written.push(frame);
      return true;
    }),
    end: vi.fn(() => {
      res.writableEnded = true;
      (listeners.get("close") ?? []).forEach((fn) => fn());
    }),
    on: vi.fn((event: string, fn: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return res;
    }),
    emit: (event: string) => (listeners.get(event) ?? []).forEach((fn) => fn())
  };
  return { res: res as unknown as Response, written, raw: res };
}

const EVENT = { kind: "job", action: "moved", id: "j-1" } as unknown as Parameters<ScheduleLiveHub["publish"]>[1];

describe("a healthy stream", () => {
  it("receives what is published, and is counted", () => {
    const hub = new ScheduleLiveHub();
    const a = stubStream();
    const b = stubStream();
    hub.subscribe("org-1", a.res);
    hub.subscribe("org-1", b.res);

    expect(hub.publish("org-1", EVENT)).toBe(2);
    expect(a.written.some((f) => f.startsWith("event: schedule"))).toBe(true);
    expect(b.written.some((f) => f.startsWith("event: schedule"))).toBe(true);
    expect(hub.size("org-1")).toBe(2);
  });
});

describe("a stream that has gone", () => {
  it("is dropped rather than written to when the socket is destroyed", () => {
    const hub = new ScheduleLiveHub();
    const dead = stubStream();
    const alive = stubStream();
    hub.subscribe("org-1", dead.res);
    hub.subscribe("org-1", alive.res);
    dead.written.length = 0;
    dead.raw.destroyed = true; // socket gone, 'close' has not fired yet

    expect(hub.publish("org-1", EVENT), "only the living tab heard it").toBe(1);
    expect(dead.written, "and nothing was written at a destroyed response").toHaveLength(0);
    expect(hub.size("org-1")).toBe(1);
  });

  it("is dropped on an error, not only on a close", () => {
    /* An 'error' with no listener ends the process. This is the listener. */
    const hub = new ScheduleLiveHub();
    const failing = stubStream();
    hub.subscribe("org-1", failing.res);
    expect(hub.size("org-1")).toBe(1);

    failing.raw.emit("error");
    expect(hub.size("org-1"), "an errored stream should not still be on the list").toBe(0);
  });

  it("stops holding the org once its last tab goes", () => {
    const hub = new ScheduleLiveHub();
    const only = stubStream();
    hub.subscribe("org-9", only.res);
    only.raw.destroyed = true;
    hub.publish("org-9", EVENT);
    expect(hub.size("org-9")).toBe(0);
    expect(hub.publish("org-9", EVENT), "and the org is no longer a key at all").toBe(0);
  });
});

describe("a stream that has stopped reading", () => {
  it("is ended once it has queued more than it could plausibly be behind on", () => {
    const hub = new ScheduleLiveHub();
    const stalled = stubStream({ writableLength: 2 * 1024 * 1024 });
    hub.subscribe("org-1", stalled.res);
    stalled.written.length = 0;

    expect(hub.publish("org-1", EVENT), "a stalled tab has not heard it").toBe(0);
    expect(stalled.raw.end, "and it is ended so the browser reconnects instead of buffering").toHaveBeenCalled();
    expect(stalled.written).toHaveLength(0);
    expect(hub.size("org-1")).toBe(0);
  });

  it("keeps a merely busy one, because a little buffering is normal", () => {
    // The threshold has to be well clear of ordinary drain latency or this drops healthy tabs.
    const hub = new ScheduleLiveHub();
    const busy = stubStream({ writableLength: 8 * 1024 });
    hub.subscribe("org-1", busy.res);
    expect(hub.publish("org-1", EVENT)).toBe(1);
    expect(busy.raw.end).not.toHaveBeenCalled();
  });

  it("does not let a heartbeat write to a stream in either state", () => {
    vi.useFakeTimers();
    try {
      const hub = new ScheduleLiveHub();
      const dead = stubStream();
      hub.subscribe("org-1", dead.res);
      dead.written.length = 0;
      dead.raw.destroyed = true;
      vi.advanceTimersByTime(60_000); // two heartbeats
      expect(dead.written, "the heartbeat is a frame too").toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
