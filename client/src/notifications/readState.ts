/**
 * Which notifications this person has seen and read — kept on the SERVER since 2026-09-26 (notch
 * step 3), so the bell and the Mac's notch agree. It used to live only in this browser's storage.
 *
 * SEEN is what the bell's badge counts: opening the drawer shows you everything in it, so opening
 * marks the lot seen and the badge clears. READ is per row: the dot and "Unread only", changed only
 * by clicking the row or "Mark all as read". Marking read implies seen; seeing does not imply read.
 *
 * Where it is kept, and how it survives trouble:
 * - The server copy arrives with the bootstrap (`userSettings["notifications:state"]`) and is folded
 *   into what this browser already had. Nothing is ever unmarked, so folding is a union.
 * - A change is written to this browser's storage at once, and to the server a second later, in one
 *   PUT however many rows were clicked in that second ("batched"). The server MERGES what it is sent
 *   with what it has (so the Mac's marks survive a browser's write) and answers with the result,
 *   which is folded back in here.
 * - When the server cannot take it — the shared demo is read-only, the network is down — this
 *   browser's copy still stands, exactly as before this moved, and the next change tries again with
 *   everything marked so far. A refusal (401/403) stops the retries for this page.
 *
 * The state itself — the encoding that fits in a setting, the merge — is @buildflow/shared's
 * notificationState, the same code the server runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NOTIFICATION_STATE_SETTING,
  decodeNotificationState,
  emptyNotificationState,
  encodeNotificationState,
  isNotificationRead,
  isNotificationSeen,
  markNotifications,
  mergeNotificationStates,
  type NotificationReadState,
  type NotificationStamp
} from "@buildflow/shared";
import { ApiError, setUserSetting } from "../api";

/** How long the bell waits for more clicks before it writes, so a run of them is one request. */
export const NOTIFICATION_SYNC_DELAY_MS = 1_000;

const stateKey = (userId: string) => `bf:notifications:state:${userId}`;
/* What this browser kept before the server did: plain arrays of ids. Still read, so nobody's read
   dots come back when the new copy starts; no longer written. */
const legacyReadKey = (userId: string) => `bf:notifications:read:${userId}`;
const legacySeenKey = (userId: string) => `bf:notifications:seen:${userId}`;

function storedIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // private mode, or a corrupt value: everything simply reads as new
    return [];
  }
}

/** This browser's own copy: the stored state, plus anything the old per-id lists still hold. */
function browserState(userId: string): NotificationReadState {
  if (typeof window === "undefined") return emptyNotificationState();
  let state = emptyNotificationState();
  try {
    state = decodeNotificationState(window.localStorage.getItem(stateKey(userId)));
  } catch {
    /* unreadable storage: start from nothing */
  }
  state = markNotifications(state, storedIds(legacySeenKey(userId)), "seen");
  return markNotifications(state, storedIds(legacyReadKey(userId)), "read");
}

function keepInBrowser(userId: string, state: NotificationReadState, items: NotificationStamp[]) {
  try {
    window.localStorage.setItem(stateKey(userId), encodeNotificationState(state, items));
  } catch {
    /* the in-memory copy still stands for this session */
  }
}

export function useReadNotifications(userId: string, items: NotificationStamp[] = [], serverValue?: string) {
  const [state, setState] = useState<NotificationReadState>(() =>
    mergeNotificationStates(browserState(userId), decodeNotificationState(serverValue))
  );
  // what the timer and the unmount flush read: the latest, not the render they were made in
  const latest = useRef({ state, items, userId });
  useEffect(() => {
    latest.current = { state, items, userId };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = useRef(false);

  // another person on this browser: their own copy, not the last one's
  const shownFor = useRef(userId);
  useEffect(() => {
    if (shownFor.current === userId) return;
    shownFor.current = userId;
    setState(mergeNotificationStates(browserState(userId), decodeNotificationState(serverValue)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the person changing is the moment; their server copy arrives with them
  }, [userId]);

  // a fresh bootstrap brought the server's copy: what the Mac (or another tab) marked joins in
  useEffect(() => {
    if (serverValue) setState((current) => mergeNotificationStates(current, decodeNotificationState(serverValue)));
  }, [serverValue]);

  const sync = useCallback(() => {
    timer.current = null;
    if (blocked.current) return;
    const { state: now, items: listed, userId: forUser } = latest.current;
    setUserSetting(NOTIFICATION_STATE_SETTING, encodeNotificationState(now, listed))
      .then((answer) => {
        // the server's merge: ours, plus whatever the Mac or another tab marked meanwhile
        if (typeof answer?.value !== "string" || latest.current.userId !== forUser) return;
        const merged = decodeNotificationState(answer.value);
        setState((current) => mergeNotificationStates(current, merged));
      })
      .catch((error: unknown) => {
        // read-only demo, or signed out: this page stops trying; offline: the next change retries
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) blocked.current = true;
      });
  }, []);

  // anything still waiting goes when the bell goes, rather than being lost with the page's timer
  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        sync();
      }
    },
    [sync]
  );

  const mark = (ids: string[], how: "seen" | "read") => {
    const next = markNotifications(latest.current.state, ids, how);
    if (next === latest.current.state) return;
    latest.current = { ...latest.current, state: next };
    setState(next);
    keepInBrowser(userId, next, items);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(sync, NOTIFICATION_SYNC_DELAY_MS);
  };

  const stamps = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const stampOf = (id: string): NotificationStamp => stamps.get(id) ?? { id, timestamp: "" };
  return {
    isRead: (id: string) => isNotificationRead(state, stampOf(id)),
    isSeen: (id: string) => isNotificationSeen(state, stampOf(id)),
    markRead: (id: string) => mark([id], "read"),
    markAllRead: (all: string[]) => mark(all, "read"),
    /** The drawer has been opened on these: the badge stops counting them. */
    markSeen: (all: string[]) => mark(all, "seen")
  };
}
