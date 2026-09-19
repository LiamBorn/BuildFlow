/**
 * Does this reader want less motion? — docs/motion-spec.md §1.
 *
 * Framer ships this hook, and on its own it is not enough here. It answers `null`
 * until its own effect has run, and it reads the query once per page load into a
 * module global — so at the moment an entrance is deciding whether to play, the
 * answer can still be a stale "no", and the reader gets the first frame of a
 * cascade they asked not to see. So both are asked and LESS MOTION WINS THE TIE:
 * framer notices the setting being changed mid-session, the query is right now.
 *
 * When it is true the caller collapses to a 150ms opacity fade: no transform, no
 * blur, no stagger. Colour is not motion — hovers still tint.
 */
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

const askNow = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReducedMotion(): boolean {
  const framer = useFramerReducedMotion();
  return framer === true || askNow();
}
