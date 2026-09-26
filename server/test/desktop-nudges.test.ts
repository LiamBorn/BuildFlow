/**
 * The Mac's nudges, driven directly: the timing of a burst, the cost of nobody listening, a device
 * revoked between pings, and the dead-reader rules the schedule feed already had (sseHub.ts).
 * desktop-inbox-live.test.ts drives the same hub through real writes and a real socket.
 */
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildFlowStore, DesktopDeviceRow } from "../src/database.js";
import { DesktopNudges, NUDGE_MAX_WAIT_MS, NUDGE_QUIET_MS } from "../src/desktopNudges.js";

type Listener = () => void;

/** Just enough Response for the hub, with the states that matter settable. */
function stubStream(state: Partial<{ destroyed: boolean; writableLength: number }> = {}) {
  const listeners = new Map<string, Listener[]>();
  const written: string[] = [];
  const res = {
    writableEnded: false,
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
    })
  };
  const inbox = () => written.filter((frame) => frame.startsWith("event: inbox")).length;
  return { res: res as unknown as Response, written, raw: res, inbox };
}

const device = (id: string, orgId = "org-x", accountId = `acct-${id}`) => ({ id, orgId, accountId }) as DesktopDeviceRow;

/** A control database with devices that can be revoked, and the two hooks the hub listens on. */
function world() {
  const devices = new Map<string, { orgId: string; accountId: string; revokedAt: string | null }>();
  let mainSaved: Listener = () => {};
  let orgSaved: (orgId: string) => void = () => {};
  const mainStore = {
    onSaved: (listener: Listener) => {
      mainSaved = listener;
      return () => {};
    },
    desktopDevice: (id: string) => (devices.has(id) ? { id, ...devices.get(id)! } : undefined),
    getAccountById: (id: string) => ({ id, email: `${id}@asphaltco.com`, orgId: "org-x" }),
    getOrg: (id: string) => ({ id, name: id }),
    workspaceMembership: () => ({})
  } as unknown as BuildFlowStore;
  const manager = {
    onOrgSaved: (listener: (orgId: string) => void) => {
      orgSaved = listener;
      return () => {};
    }
  };
  const nudges = new DesktopNudges(mainStore, manager, { quietMs: NUDGE_QUIET_MS, maxWaitMs: NUDGE_MAX_WAIT_MS, heartbeatMs: 25_000 });
  const connect = (id: string, orgId = "org-x") => {
    devices.set(id, { orgId, accountId: `acct-${id}`, revokedAt: null });
    const stream = stubStream();
    nudges.open(orgId, stream.res, device(id, orgId));
    return stream;
  };
  return {
    nudges,
    connect,
    writeIn: (orgId: string) => orgSaved(orgId),
    revoke: (id: string) => {
      devices.get(id)!.revokedAt = new Date().toISOString();
      mainSaved();
    },
    remove: (id: string) => devices.delete(id)
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a nudge", () => {
  it("opens every stream with one, for whatever changed while the Mac was away", () => {
    const { connect } = world();
    const mac = connect("d1");
    expect(mac.written).toEqual(["retry: 5000\n\n", 'event: inbox\ndata: {"etag":null}\n\n']);
  });

  it("waits out a burst of writes and sends one, a quarter of a second after the last", () => {
    const { connect, writeIn } = world();
    const mac = connect("d1");
    for (let n = 0; n < 4; n += 1) {
      writeIn("org-x");
      vi.advanceTimersByTime(100);
    }
    expect(mac.inbox()).toBe(1); // the opening nudge only
    vi.advanceTimersByTime(NUDGE_QUIET_MS);
    expect(mac.inbox()).toBe(2);
    vi.advanceTimersByTime(5_000);
    expect(mac.inbox()).toBe(2);
  });

  it("never holds one longer than a second, however long the writes go on", () => {
    const { connect, writeIn } = world();
    const mac = connect("d1");
    const heard: number[] = [];
    for (let at = 0; at < 3000; at += 100) {
      writeIn("org-x");
      vi.advanceTimersByTime(100);
      if (mac.inbox() > heard.length + 1) heard.push(at + 100);
    }
    // a write every tenth of a second never goes quiet, so each nudge comes at the one-second bound
    expect(heard).toEqual([NUDGE_MAX_WAIT_MS, 2 * NUDGE_MAX_WAIT_MS, 3 * NUDGE_MAX_WAIT_MS]);
  });

  it("goes only to the workspace that wrote, and costs nothing where nobody listens", () => {
    const { connect, writeIn } = world();
    const x = connect("d1", "org-x");
    const y = connect("d2", "org-y");
    writeIn("org-x");
    writeIn("org-nobody");
    expect(vi.getTimerCount(), "one timer for org-x's nudge, and the two heartbeats").toBe(3);
    vi.advanceTimersByTime(NUDGE_QUIET_MS);
    expect(x.inbox()).toBe(2);
    expect(y.inbox()).toBe(1);
  });

  it("reaches one person's Macs when something of theirs outside the workspace changed", () => {
    const { nudges, connect } = world();
    const mine = connect("d1");
    const theirs = connect("d2");
    nudges.nudgeAccount("acct-d1");
    expect(mine.inbox()).toBe(2);
    expect(theirs.inbox()).toBe(1);
  });
});

describe("a Mac that is no longer connected", () => {
  it("is told it was revoked, and its stream ends, as soon as the control database changes", () => {
    const { nudges, connect, revoke } = world();
    const kept = connect("d1");
    const cut = connect("d2");
    revoke("d2");
    vi.advanceTimersByTime(150);
    expect(cut.written.at(-1)).toBe('event: revoked\ndata: {"code":"device_revoked"}\n\n');
    expect(cut.raw.end).toHaveBeenCalled();
    expect(kept.raw.end).not.toHaveBeenCalled();
    expect(nudges.size("org-x")).toBe(1);
  });

  it("is caught at the next ping even when nothing said so", () => {
    const { nudges, connect, remove } = world();
    const gone = connect("d1");
    remove("d1"); // deleted by another process: no save here to hear
    vi.advanceTimersByTime(25_000);
    expect(gone.written.filter((frame) => frame.startsWith("event: revoked"))).toHaveLength(1);
    expect(gone.written).not.toContain(": ping\n\n");
    expect(nudges.size("org-x")).toBe(0);
  });

  it("gets a ping every 25 seconds while it is connected", () => {
    const { connect } = world();
    const mac = connect("d1");
    vi.advanceTimersByTime(50_000);
    expect(mac.written.filter((frame) => frame === ": ping\n\n")).toHaveLength(2);
  });
});

describe("a Mac that has gone or stopped reading", () => {
  it("is dropped rather than written to, and one that has stopped reading is ended", () => {
    const { nudges, connect, writeIn } = world();
    const dead = connect("d1");
    const stalled = connect("d2");
    const alive = connect("d3");
    dead.raw.destroyed = true;
    stalled.raw.writableLength = 2 * 1024 * 1024;
    const before = [dead.written.length, stalled.written.length];
    writeIn("org-x");
    vi.advanceTimersByTime(NUDGE_QUIET_MS);
    expect([dead.written.length, stalled.written.length]).toEqual(before);
    expect(stalled.raw.end).toHaveBeenCalled();
    expect(alive.inbox()).toBe(2);
    expect(nudges.size("org-x")).toBe(1);
  });

  it("ends every stream at shutdown, and takes no new one", () => {
    const { nudges, connect } = world();
    const mac = connect("d1");
    nudges.closeAll();
    expect(mac.raw.end).toHaveBeenCalled();
    const late = stubStream();
    nudges.open("org-x", late.res, device("d9"));
    expect(late.raw.status).toHaveBeenCalledWith(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});
