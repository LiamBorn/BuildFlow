/**
 * When this person was last here, for the greeting's "Welcome back" (2026-09-26, notch plan feature
 * 1): three hours or more away, and the Dashboard says "Welcome back, Liam" instead of repeating the
 * time of day.
 *
 * Kept per person in this browser (`bf:last-active:<userId>`), written while they are here — at most
 * once a minute on a click or a key, and whenever the page is hidden or the Dashboard closes. It is
 * read ONCE per visit (page load), before this visit writes anything, so the greeting says the same
 * thing for the whole visit — moving between pages does not turn "Welcome back" into "Good
 * afternoon" — and React's development double-run of effects cannot read back its own write. A
 * browser that refuses storage simply never says "Welcome back".
 */
import { useEffect } from "react";

const lastActiveKey = (userId: string) => `bf:last-active:${userId}`;
const WRITE_EVERY_MS = 60_000;

function readLastActive(userId: string): number | null {
  try {
    const stored = Number(window.localStorage.getItem(lastActiveKey(userId)));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function writeLastActive(userId: string, at = Date.now()) {
  try {
    window.localStorage.setItem(lastActiveKey(userId), String(at));
  } catch {
    /* storage refused: no "Welcome back", nothing else lost */
  }
}

/** Per person, what the store said when this visit first asked — before this visit wrote to it. */
const beforeThisVisit = new Map<string, number | null>();

/** Tests only: start a new "visit", as a reload would. */
export function __forgetLastActive() {
  beforeThisVisit.clear();
}

/** The time this person was last active BEFORE this visit (ms), or null when it is not known. */
export function useLastActive(userId: string | undefined): number | null {
  let before: number | null = null;
  if (userId && typeof window !== "undefined") {
    if (!beforeThisVisit.has(userId)) beforeThisVisit.set(userId, readLastActive(userId));
    before = beforeThisVisit.get(userId) ?? null;
  }
  useEffect(() => {
    if (!userId || typeof window === "undefined") return undefined;
    writeLastActive(userId);
    let written = Date.now();
    const touch = () => {
      if (Date.now() - written < WRITE_EVERY_MS) return;
      written = Date.now();
      writeLastActive(userId, written);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") writeLastActive(userId);
    };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onHide);
      writeLastActive(userId);
    };
  }, [userId]);
  return before;
}
