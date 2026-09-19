/**
 * What a page should wait for — docs/motion-spec.md §3 (first-load gating) and
 * §4 (route transitions).
 *
 * The chrome — frame, top bar, rail — assembles once per session. Every later
 * page runs the content beats only, and runs them from the top: the title does
 * not sit waiting out a rail cascade that already happened, so moving between
 * pages feels like panels swapping inside a shell that is already there.
 *
 * A reader who asked for less motion gets every delay as zero, so §1's 150ms
 * fade is the whole entrance rather than a 150ms fade at the end of a 2.4s wait.
 */
import { BEAT } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";
import { openingRunning } from "./AppFrame";

export function useOpening() {
  const reduce = useReducedMotion();
  // the same question the sheet asks: is `bfm-open` on the shell this moment?
  const chrome = openingRunning();
  // With the chrome already up, the cascade starts at the title (§4).
  const shift = chrome ? 0 : BEAT.title;
  return {
    /** is this the session's first open — should the chrome assemble? */
    chrome,
    /** seconds to wait before a BEAT, given what has already run */
    at: (beat: number) => (reduce ? 0 : Math.max(0, beat - shift))
  };
}
