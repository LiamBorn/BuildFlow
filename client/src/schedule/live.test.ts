import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleLiveEvent } from "@buildflow/shared";
import { CLIENT_ID } from "../api";
import {
  flashLiveChange,
  liveChangeLabel,
  liveEventsUrl,
  receiveLiveEvent,
  resetLiveChanges,
  useLiveChange,
  useScheduleLive
} from "./live";

/** jsdom has no EventSource; this one records what the hook opens and lets a test push frames in. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  private listeners = new Map<string, Set<(event: Event) => void>>();
  constructor(
    public url: string,
    public init?: EventSourceInit
  ) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {
    this.closed = true;
  }
  push(event: ScheduleLiveEvent) {
    for (const listener of this.listeners.get("schedule") ?? []) listener(new MessageEvent("schedule", { data: JSON.stringify(event) }));
  }
}

const event = (extra: Partial<ScheduleLiveEvent> = {}): ScheduleLiveEvent => ({
  kind: "assignments",
  op: "move",
  ids: ["as-1", "j-1"],
  by: { id: "u-matt", name: "Matt Johnson" },
  client: "another-tab",
  at: "2026-06-16T12:00:00.000Z",
  ...extra
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  resetLiveChanges();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useScheduleLive", () => {
  it("listens on the org's feed with this tab's id and the session cookie", () => {
    const reload = vi.fn(async () => {});
    const { unmount } = renderHook(() => useScheduleLive(reload));
    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe(liveEventsUrl());
    expect(source.url).toContain(`client=${encodeURIComponent(CLIENT_ID)}`);
    expect(source.init?.withCredentials).toBe(true);
    unmount();
    expect(source.closed).toBe(true);
  });

  it("reloads once for a burst of another tab's changes and flashes the cards they touched", async () => {
    const reload = vi.fn(async () => {});
    renderHook(() => useScheduleLive(reload));
    const card = renderHook(() => useLiveChange("as-1"));
    const source = FakeEventSource.instances[0];
    act(() => {
      source.push(event());
      source.push(event({ ids: ["as-2"] }));
    });
    expect(card.result.current).toMatchObject({ by: "Matt Johnson", op: "move" });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("ignores what this very tab did — the page already reloaded for it", async () => {
    const reload = vi.fn(async () => {});
    renderHook(() => useScheduleLive(reload));
    const card = renderHook(() => useLiveChange("as-1"));
    act(() => {
      FakeEventSource.instances[0].push(event({ client: CLIENT_ID }));
    });
    expect(card.result.current).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("live changes", () => {
  it("names the change on the card, and the freshest one wins", () => {
    expect(receiveLiveEvent(event(), "me")).toBe(true);
    expect(receiveLiveEvent(event({ client: "me" }), "me")).toBe(false);
    const { result } = renderHook(() => useLiveChange("missing", "j-1"));
    expect(result.current && liveChangeLabel(result.current)).toBe("Moved by Matt Johnson");
    act(() => flashLiveChange(["j-1"], { by: "Ana Lopez", op: "job" }, Date.now() + 1));
    expect(result.current && liveChangeLabel(result.current)).toBe("Updated by Ana Lopez");
    expect(liveChangeLabel({ by: "Sam", op: "unbook", at: 0 })).toBe("Unbooked by Sam");
    expect(liveChangeLabel({ by: "Sam", op: "dates", at: 0 })).toBe("Moved by Sam");
  });
});
