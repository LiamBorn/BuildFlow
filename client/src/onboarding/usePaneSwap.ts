/**
 * One screen leaving and the next arriving, on the reference recording's timing (2026-09-22).
 *
 * Measured at 40ms (frames 36.52–37.36): the outgoing pane fades as ONE piece over ~160ms,
 * the column then stands empty for ~120ms, and only then does the incoming pane mount and
 * begin its own cascade. The rungs nearest those are `DUR.exit` and `STAGGER.row`.
 *
 * `shown` is the other half of what the recording does: the preview and the progress move
 * FIRST — the next screen is already on the right while the outgoing form is still fading —
 * so anything that should lead the form reads `shown` rather than `current`.
 *
 * Under reduced motion there is no fade and no gap: the next screen is simply there.
 */
import { useEffect, useRef, useState } from "react";
import { DUR, STAGGER, ms } from "../motion/tokens";

/** The outgoing pane's fade, and the empty beat before the next one starts to arrive. */
export const PANE_EXIT = DUR.exit;
export const PANE_GAP = STAGGER.row;

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type PaneSwap<T> = {
  /** What the pane is rendering — it lags `shown` by one transition. */
  current: T;
  /** Where the flow is going: what the preview and the progress show at once. */
  shown: T;
  /** The pane is on its way out; onboarding.css fades it. */
  leaving: boolean;
  /** What `current` will be once the transition finishes — `current` when nothing is in flight. */
  target: T;
  go: (next: T) => void;
};

export function usePaneSwap<T>(initial: T): PaneSwap<T> {
  const [current, setCurrent] = useState<T>(initial);
  const [shown, setShown] = useState<T>(initial);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef<T | null>(null);
  const timer = useRef<number | null>(null);

  const go = (next: T) => {
    if (next === (pending.current ?? current)) return;
    pending.current = next;
    setShown(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (reducedMotion()) {
      setCurrent(next);
      pending.current = null;
      return;
    }
    setLeaving(true);
    timer.current = window.setTimeout(
      () => {
        setCurrent(next);
        setLeaving(false);
        pending.current = null;
        timer.current = null;
      },
      ms(PANE_EXIT) + ms(PANE_GAP)
    );
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return { current, shown, leaving, target: pending.current ?? current, go };
}
