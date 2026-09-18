/**
 * THE WAY A PANEL LEAVES.
 *
 * Asked for 2026-09-18 with a screen recording: a right-side panel should go back out the way it
 * came in, quickly. Ours could not — React unmounts a dialog or a record the moment it closes, so
 * by the time there is anything to animate there is no element left to animate.
 *
 * The obvious fix is a "closing" state at each call site, which keeps the panel mounted for the
 * length of its exit. There are a dozen `.pdx` call sites in App.tsx plus the record panel, and
 * App.tsx is edited by more than one person, so that is a dozen places to change and to keep in
 * step. This does it in one: it watches the body for a panel LEAVING, puts a copy of it back for
 * as long as the exit lasts, and takes the copy away when it is done. Nothing else in the app
 * knows this is here, and a panel that never animates loses nothing by it.
 *
 * The copy is inert on purpose — aria-hidden, no pointer events, not focusable. It is a picture of
 * a panel on its way out, and for the ~140ms it exists nobody should be able to reach into it.
 */
import { useEffect } from "react";

/**
 * The panels this watches for — the dialogs, the Contacts record, the Schedule's job drawer, the
 * add-job form and the Dashboard's section picker. Each is a layer that is a direct child of the
 * body, which is why watching the body's own children is enough (the job drawer is the exception
 * and needs `subtree: true`; see the observer below).
 *
 * `.bfsp` joined on 2026-09-18, when the picker was brought onto the panels' design: it had an
 * arrival of its own and no exit at all, so it vanished on the frame it was closed.
 */
const PANELS = ".pdx, .hs-record-layer, .gantt-drawer-layer, .schedule-dialog-backdrop, .bfsp";
const EXIT_CLASS = "bf-panel-exit";
/** Long enough for the CSS to finish; the copy goes whatever happens, so this is a backstop. */
const EXIT_MS = 420;

/**
 * A clone does not carry what the USER typed: `cloneNode` copies attributes, and a React-controlled
 * input's text lives in its `value` PROPERTY. Without this the panel would blank its own fields on
 * the way out, which is the one frame everybody would notice.
 */
const carryValues = (from: HTMLElement, to: HTMLElement) => {
  const originals = from.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const copies = to.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!copy) return;
    copy.value = original.value;
    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) copy.checked = original.checked;
  });
  // and where the reader had scrolled to, so the panel does not jump before it leaves
  const scrollers = from.querySelectorAll<HTMLElement>("*");
  const scrollCopies = to.querySelectorAll<HTMLElement>("*");
  scrollers.forEach((node, index) => {
    if (!node.scrollTop) return;
    const copy = scrollCopies[index];
    if (copy) copy.scrollTop = node.scrollTop;
  });
};

export function PanelExitLayer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // asked to keep still: a panel that cannot animate in should not animate out either
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const watch = new MutationObserver((records) => {
      for (const record of records) {
        /* WHERE THE COPY GOES BACK: the node's own parent, not the body. The dialogs and the
           record are portals whose parent IS the body, but the Schedule's job drawer is rendered
           inside its page, and its rules are written `.gantt-page .gantt-drawer` — a copy parked
           on the body would match none of them and arrive unstyled. Putting it back where it was
           keeps every ancestor its CSS depends on. */
        const parent = record.target;
        if (!(parent instanceof HTMLElement) || !parent.isConnected) continue;
        for (const gone of record.removedNodes) {
          if (!(gone instanceof HTMLElement) || !gone.matches?.(PANELS)) continue;
          /* A panel already on its way out was removed by us; and a page teardown removes many
             things at once, which is not a close and should not be dressed as one. */
          if (gone.classList.contains(EXIT_CLASS)) continue;
          const copy = gone.cloneNode(true) as HTMLElement;
          carryValues(gone, copy);
          copy.classList.add(EXIT_CLASS);
          copy.setAttribute("aria-hidden", "true");
          copy.setAttribute("inert", "");
          copy.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
          copy.removeAttribute("id");
          parent.appendChild(copy);
          window.setTimeout(() => copy.remove(), EXIT_MS);
        }
      }
    });
    /* `subtree`, because only two of the three panels are portals on the body — the job drawer
       lives inside its page. Only childList is asked for, so this wakes on nodes coming and going
       and never on an attribute or a character changing. */
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  return null;
}
