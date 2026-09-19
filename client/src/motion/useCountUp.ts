/**
 * The numeric roll — docs/motion-spec.md §2.5.
 *
 * One engine, used by both `<CountUp>` and the count-up the pages already call,
 * `components/ui/animated-figure.tsx`. It drives framer's `animate()`, which is
 * requestAnimationFrame underneath and takes EASE.out as the curve it is — no
 * hand-rolled bezier, and no `setInterval`.
 *
 * It re-rolls when the NUMBER changes and not when the component re-renders:
 * the effect's only dependencies are the target and the duration, so a parent
 * that re-renders for an unrelated reason does not restart a figure mid-count.
 *
 * It animates only in a real browser with motion allowed. jsdom has no
 * `document.fonts`, so a test reads the finished figure on the first paint —
 * which is also what a reader who asked for less motion gets (§1).
 */
import { animate } from "framer-motion";
import { useEffect, useState } from "react";
import { DUR, EASE } from "./tokens";

export const canCountUp = () =>
  typeof document !== "undefined" &&
  "fonts" in document &&
  typeof window !== "undefined" &&
  typeof window.requestAnimationFrame === "function" &&
  !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function useCountUp(target: number, { duration = DUR.count, from = 0 }: { duration?: number; from?: number } = {}) {
  const rolls = Number.isFinite(target) && canCountUp();
  const [value, setValue] = useState(rolls ? from : target);

  useEffect(() => {
    if (!rolls) {
      setValue(target);
      return;
    }
    const controls = animate(from, target, {
      duration,
      ease: EASE.out,
      onUpdate: setValue
    });
    return () => controls.stop();
    // `from` is the start of the roll, fixed for a given figure; re-reading it
    // here would restart the count every time the caller passed a fresh literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, rolls]);

  return rolls ? value : target;
}
