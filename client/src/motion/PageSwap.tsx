/**
 * <PageSwap> — the page you are leaving goes, rather than vanishing.
 *
 * docs/motion-spec.md §4: "outgoing content opacity -> 0, y: -8, 180ms
 * EASE.inOut; incoming replays the content beats (title onward) but NOT the
 * frame/nav/rail. Chrome stays put — it should feel like panels swapping inside
 * a persistent app, not a full page reload."
 *
 * Only the OUTGOING half is here. The incoming half was already built: every
 * page's beats replay on mount, shifted by `--bfm-shift` so the title leads
 * instead of waiting out a chrome cascade that has already happened. Giving the
 * arriving page a fade here as well would mute those beats behind a second one.
 *
 * WHY NOT `mode="wait"`, WHICH WOULD BE SIMPLER. It holds the incoming page
 * back until the outgoing one has finished, so for 180ms there is no page at
 * all — and §9.6 says motion never delays interactivity. Overlapping instead
 * means that for those 180ms the document has TWO pages in it, and everything
 * below is about making the one that is leaving count for nothing:
 *
 *   - out of the layout, so it cannot push the arriving page down the screen
 *     (framer's `mode="popLayout"`);
 *   - behind, and deaf to the pointer, so it cannot cover or swallow a click
 *     meant for the page arriving under it (its `exit` variant);
 *   - and `inert`, so it is out of the tab order and out of the accessibility
 *     tree. A screen reader would otherwise find two pages and read both, and
 *     every test that asks for "the heading" would find it twice — which is
 *     exactly what happened before this was added.
 */
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import type { ReactNode } from "react";
import { DUR, EASE, MOTION, REDUCED } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

/**
 * One page. Split out only so it can ask `useIsPresent()` — which is how a child
 * of AnimatePresence learns it is on its way out.
 */
function Page({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="bfm-page"
      // a page that is leaving is not a page anyone can reach: not by tab, not
      // by screen reader, not by pointer
      inert={present ? undefined : true}
      aria-hidden={present ? undefined : true}
      // no `initial` and no `animate`: the page arriving is the sheet's job
      exit={{ opacity: 0, y: reduce ? 0 : -(MOTION.rise / 2), zIndex: 0, pointerEvents: "none" }}
      transition={{ duration: reduce ? REDUCED.fade : DUR.exit, ease: EASE.inOut }}
    >
      {children}
    </motion.div>
  );
}

export function PageSwap({ page, children }: { page: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <Page key={page} reduce={reduce}>
        {children}
      </Page>
    </AnimatePresence>
  );
}
