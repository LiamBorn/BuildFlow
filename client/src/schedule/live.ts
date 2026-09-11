/**
 * Live updates: while a schedule page is open it listens to the org's change feed
 * (GET /api/schedule/events, Server-Sent Events), reloads when another tab changes
 * a booking or a job, and flashes the changed cards with who did it for a few
 * seconds. A tab's own writes carry its CLIENT_ID and are not flashed back at it.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ScheduleLiveEvent } from "@buildflow/shared";
import { CLIENT_ID, apiUrl } from "../api";

/** How long a changed card stays marked. */
export const LIVE_FLASH_MS = 6000;
/** A burst of events (one drop can touch several bookings) becomes one reload. */
const RELOAD_COALESCE_MS = 250;

export type LiveChange = { by: string; op: ScheduleLiveEvent["op"]; at: number };

let changes = new Map<string, LiveChange>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => changes;

/** Marks ids as just changed by someone else; the mark clears itself after LIVE_FLASH_MS. */
export function flashLiveChange(ids: string[], change: Omit<LiveChange, "at">, now = Date.now()) {
  if (ids.length === 0) return;
  const next = new Map(changes);
  for (const id of ids) next.set(id, { ...change, at: now });
  changes = next;
  emit();
  const timer = setTimeout(() => {
    const later = new Map(changes);
    let dropped = false;
    for (const id of ids) {
      if (later.get(id)?.at === now) {
        later.delete(id);
        dropped = true;
      }
    }
    if (dropped) {
      changes = later;
      emit();
    }
  }, LIVE_FLASH_MS);
  (timer as { unref?: () => void }).unref?.();
}

/** Every live change still showing, keyed by booking or job id. */
export function useLiveChanges(): Map<string, LiveChange> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The freshest live change among these ids (a card asks for its booking and its job), or null. */
export function liveChangeFor(map: Map<string, LiveChange>, ...ids: Array<string | undefined>): LiveChange | null {
  let best: LiveChange | null = null;
  for (const id of ids) {
    const change = id ? map.get(id) : undefined;
    if (change && (!best || change.at > best.at)) best = change;
  }
  return best;
}

/** The live change on one card, or null. */
export function useLiveChange(...ids: Array<string | undefined>): LiveChange | null {
  return liveChangeFor(useLiveChanges(), ...ids);
}

/** "Moved by Matt Johnson" — the badge a flashed card wears. */
export function liveChangeLabel(change: LiveChange) {
  const verb =
    change.op === "move" || change.op === "book" || change.op === "dates"
      ? "Moved"
      : change.op === "unbook"
        ? "Unbooked"
        : // A deletion needs its own word. Everything unrecognised falls through to "Updated", so
          // without this another planner's tab would announce a job being destroyed as an edit.
          change.op === "delete"
          ? "Deleted"
          : "Updated";
  return `${verb} by ${change.by}`;
}

/** Forgets every mark (tests). */
export function resetLiveChanges() {
  changes = new Map();
  emit();
}

export function liveEventsUrl() {
  return apiUrl(`/api/schedule/events?client=${encodeURIComponent(CLIENT_ID)}`);
}

/** What the feed does with one event: another tab's change flashes (and asks for a reload); our own is already on screen. */
export function receiveLiveEvent(event: ScheduleLiveEvent, clientId: string): boolean {
  if (event.client && event.client === clientId) return false;
  flashLiveChange(event.ids, { by: event.by.name, op: event.op });
  return true;
}

/**
 * Listens to the org's change feed while the page is open; reloads on others' changes, flashes their
 * cards, and — because a flash is silent — says once who changed what.
 */
export function useScheduleLive(reload: () => Promise<void>, announce?: (text: string) => void) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const announceRef = useRef(announce);
  announceRef.current = announce;
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(liveEventsUrl(), { withCredentials: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending: ScheduleLiveEvent[] = [];
    const onSchedule = (message: Event) => {
      let event: ScheduleLiveEvent;
      try {
        event = JSON.parse((message as MessageEvent<string>).data) as ScheduleLiveEvent;
      } catch {
        return;
      }
      if (!receiveLiveEvent(event, CLIENT_ID)) return;
      // one sentence for the burst, in the words the flashed cards use
      pending.push(event);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const burst = pending.splice(0, pending.length);
        void reloadRef.current().catch(() => undefined);
        const who = [...new Set(burst.map((item) => item.by.name))];
        const count = new Set(burst.flatMap((item) => item.ids)).size;
        announceRef.current?.(
          `${who.length === 1 ? who[0] : "Someone else"} changed ${count === 1 ? "a booking" : `${count} things`} in another tab.`
        );
      }, RELOAD_COALESCE_MS);
    };
    source.addEventListener("schedule", onSchedule);
    return () => {
      source.removeEventListener("schedule", onSchedule);
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
