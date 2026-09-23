/**
 * Signing in to Google or Microsoft from the Meetings panel without leaving the Dashboard
 * (2026-09-23, asked for as "make it so that users are able to login to Google & outlook within
 * the meeting Section/Widget").
 *
 * WHY A WINDOW, NOT THE CARD ITSELF. Google's and Microsoft's sign-in pages refuse to be framed,
 * and a form of our own asking for a Google password is exactly what people are taught never to
 * fill in. So the provider's own page opens in a small window over the Dashboard, the card says it
 * is waiting, and it is the card that changes when the window is done.
 *
 * HOW THE CARD KNOWS, three ways, because any one of them can fail:
 * - the window's last page tells it (server: calendarPopupPage). Instant, and it says WHY a
 *   sign-in failed; it is only taken from the window this card opened;
 * - the connection is re-read from the server every couple of seconds while it waits. This is the
 *   one that decides "connected": a message can be cut off on the way (a cross-origin-opener
 *   policy on the provider's pages severs `window.opener`), the server's answer cannot;
 * - a window closed before it finished stops the wait, after a moment for a read in flight.
 * A blocked pop-up is reported to the caller, whose link then signs in in the tab as before.
 *
 * Durations are measured on `performance.now()`, not `Date.now()`: the test setup pins the Date
 * clock, and a wait measured on it would never end there.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { calendarConnectUrl, type CalendarProviderId, type CalendarStatus } from "../api";
import { PROVIDER_LABEL } from "./calendarModel";

/** How often the wait re-reads and looks at the window, and how long it waits. Tests run it faster. */
export const SIGN_IN_TIMING = { pollMs: 2000, watchMs: 500, closedGraceMs: 4000, giveUpMs: 5 * 60_000 };

export type SignInOutcome = "connected" | "error" | "closed" | "timeout" | "cancelled";
export type SignInResult = { provider: CalendarProviderId; outcome: SignInOutcome; reason: string };
export type SignIn = {
  /** The provider whose window is open, or null. */
  waitingFor: CalendarProviderId | null;
  /** Open the sign-in window. False when the browser blocked it: let the link sign in in the tab. */
  start: (provider: CalendarProviderId) => boolean;
  cancel: () => void;
};

type Waiting = { provider: CalendarProviderId; popup: Window; startedAt: number };

const WIDTH = 520;
const HEIGHT = 680;

export function useSignInWindow({
  readStatus,
  onFinished
}: {
  /** Read the connections again: the panel's own load, which re-renders it as it goes. */
  readStatus: () => Promise<CalendarStatus | null>;
  onFinished: (result: SignInResult) => void;
}): SignIn {
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const waitingRef = useRef<Waiting | null>(null);
  waitingRef.current = waiting;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  const readRef = useRef(readStatus);
  readRef.current = readStatus;

  const start = useCallback((provider: CalendarProviderId) => {
    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    // over the middle of this window, where the person is already looking
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - WIDTH) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - HEIGHT) / 2));
    let popup: Window | null;
    try {
      popup = window.open(
        calendarConnectUrl(provider, { popup: true }),
        "bf-calendar-sign-in",
        `popup=yes,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`
      );
    } catch {
      popup = null;
    }
    if (!popup) return false;
    try {
      popup.focus();
    } catch {
      // a browser may refuse; the window is open either way
    }
    // a second click while one is open reuses the same named window, and the wait restarts on it
    setWaiting({ provider, popup, startedAt: performance.now() });
    return true;
  }, []);

  const cancel = useCallback(() => {
    const current = waitingRef.current;
    if (!current) return;
    try {
      current.popup.close();
    } catch {
      // already gone
    }
    setWaiting(null);
    finishedRef.current({ provider: current.provider, outcome: "cancelled", reason: "" });
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const { provider, popup, startedAt } = waiting;
    let over = false;
    let closedAt = 0;
    const finish = (outcome: SignInOutcome, reason = "") => {
      if (over) return;
      over = true;
      if (outcome !== "closed") {
        try {
          if (!popup.closed) popup.close();
        } catch {
          // nothing to close
        }
      }
      setWaiting(null);
      finishedRef.current({ provider, outcome, reason });
    };
    const confirmConnected = () =>
      readRef
        .current()
        .then((status) => {
          if (status?.providers[provider]?.connected) finish("connected");
        })
        .catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      // only the window this card opened can end its wait
      if (event.source !== popup) return;
      const data = event.data as { type?: unknown; calendar?: unknown; reason?: unknown } | null;
      if (!data || data.type !== "bf-calendar") return;
      // "connected" is the server's to say, so it is read rather than taken; a failure ends the wait
      if (data.calendar === "connected") void confirmConnected();
      else finish("error", typeof data.reason === "string" ? data.reason : "");
    };
    window.addEventListener("message", onMessage);
    const poll = window.setInterval(() => void confirmConnected(), SIGN_IN_TIMING.pollMs);
    const watch = window.setInterval(() => {
      const now = performance.now();
      if (now - startedAt > SIGN_IN_TIMING.giveUpMs) {
        finish("timeout");
        return;
      }
      let closed: boolean;
      try {
        closed = popup.closed;
      } catch {
        closed = false;
      }
      if (!closed) {
        closedAt = 0;
        return;
      }
      if (!closedAt) {
        // one last read, for a window that finished as it went
        closedAt = now;
        void confirmConnected();
        return;
      }
      if (now - closedAt >= SIGN_IN_TIMING.closedGraceMs) finish("closed");
    }, SIGN_IN_TIMING.watchMs);
    return () => {
      over = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      window.clearInterval(watch);
    };
  }, [waiting]);

  return { waitingFor: waiting?.provider ?? null, start, cancel };
}

/** What the card says while the window is open. */
export function SignInWaiting({ provider, onCancel }: { provider: CalendarProviderId; onCancel: () => void }) {
  return (
    <div className="bfmt-signin" role="status">
      <span className="bfmt-signin-spin" aria-hidden="true" />
      <span className="bfmt-signin-text">
        <strong>Finish signing in with {PROVIDER_LABEL[provider]}</strong>
        <em>Sign in and allow BuildFlow to read your calendar in the window that opened. This card updates on its own.</em>
      </span>
      <span className="bfmt-signin-actions">
        {/* for a window that went behind this one, or a browser that shows it as a tab */}
        <a className="bfmt-link" href={calendarConnectUrl(provider)}>
          Use this tab instead
        </a>
        <button type="button" className="bfmt-link" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </div>
  );
}
