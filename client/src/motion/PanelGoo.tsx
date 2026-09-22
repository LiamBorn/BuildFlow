/**
 * <PanelGoo> — a panel comes OUT of the thing you opened it with.
 *
 * The same effect as skin §64, which the dropdowns already use: at the first
 * frame the panel IS the button — same place, same size, the button's radius —
 * and for the whole morph it is one soft surface, its own blur standing in for
 * the merge, so while the two shapes overlap there is no seam between them.
 * That overlap is what reads as gooey.
 *
 * SIX PANELS SHARE IT. BuildFlow AI, which used to play `bfz-in` (a fade and a
 * 16px slide from the left), and the five right-side panels, which all came in
 * from the right edge on `bfe-drawer-in`. Both are §64's own description of what
 * every dropdown did before it — "a small copy of itself growing in the middle
 * of nowhere, nothing tying it to the control that opened it".
 *
 * The two arrive differently and are measured differently because of it. The
 * assistant is always mounted and opened by a class, so it is watched for that
 * class; the five panels MOUNT when they open, so they are measured as they
 * arrive. What they share is the moment of measuring — before the first paint,
 * so the animation can never start ahead of the numbers behind it — and the
 * `data-bfm-goo` mark the sheet keys on, so a panel opened with no button
 * behind it keeps the entrance it always had.
 *
 * WHY A LAYER, AND WHY IT LISTENS FOR THE CLICK. §64 works because
 * selectMenu.tsx measures the real control and writes the five numbers. Here
 * the control is measured the same way, but it cannot be measured when the
 * panel opens: the floating "Ask AI" button UNMOUNTS the moment the panel is
 * open, so by then there is nothing left to measure. The rect is therefore
 * taken in the capture phase of the click, before React has heard it. Both
 * buttons that open the panel carry the same label, so one listener serves
 * them; a keyboard route, or any way in with no click behind it, leaves the
 * mark unset and the panel keeps the entrance it always had.
 *
 * AND THE WAY IT GOES BACK. The same morph, run in reverse: the panel shrinks
 * into the button it came out of and its blur comes back as it goes, so the two
 * are one soft surface again before it disappears. That needs the panel to still
 * be on screen, and it is hidden by `display: none` the instant `is-open` goes —
 * so `bfm-closing` holds it in the layout for exactly as long as the animation,
 * inert and untouchable, and then lets it go.
 *
 * components/ui/panelExit.tsx does this for the dialogs, by putting a CLONE back
 * after React has unmounted them. That is the right answer there and the wrong
 * one here: this panel is never unmounted, so there is nothing to replace — and
 * cloning it would mean cloning a whole conversation to throw it away.
 *
 * The mounting model is untouched: the panel stays always-mounted and hidden by
 * `display: none`, which app-shell-daylight.css §14 requires — switching it to
 * opacity or visibility, or mounting it conditionally, breaks viewKeys.ts's
 * dialogIsOpen() and the 1-6 schedule shortcuts with it. Holding it for the exit
 * is safe from that because dialogIsOpen() reads `aria-hidden`, which React has
 * already set to "true" by then: the shortcuts come back the moment you close,
 * not when the animation ends. Going from `display: none` back into the layout
 * is itself what restarts the opening animation.
 */
import { useEffect } from "react";

/** Either way in to the assistant: the top bar's spark, and the floating button. */
const TRIGGER = '[aria-label="Ask BuildFlow AI"]';
const PANEL = ".bf-breeze";
const SURFACE = ".bf-breeze-main";

/**
 * The right-side panels, which are the same five components/ui/panelExit.tsx
 * watches out for — the dialogs, the Contacts record, the Gantt's job drawer,
 * the add-job form and the Dashboard's section picker. Unlike the assistant
 * these MOUNT when they open, so there is no class to watch: they are measured
 * as they arrive.
 */
const RIGHT_PANELS = ".pdx, .gantt-drawer-layer, .schedule-dialog-backdrop, .bfsp"; // (the Sales record panel's layer left with its hub, 2026-09-22)
/**
 * The icon rail's flyout, which is the one panel here opened by HOVER rather
 * than by a click — so it is measured from the rail button the pointer is on,
 * not from the last thing pressed. It is its own surface: there is no inner
 * element, the flyout IS the panel.
 */
const FLYOUT = ".hs-flyout";
/** What a hover can open a panel from. */
const HOVER_TRIGGERS = ".hs-rail-slot, .hs-rail-btn";
/**
 * The surface inside each one that actually moves.
 *
 * A centred confirm is left out: it never went to the edge, so it does not come
 * out of one (skin §65b). `.bffb-dialog` is the exception and is named here on
 * purpose — "Give feedback" is built on the confirm's markup but it is not a
 * confirmation, it is a panel opened from a button at the screen's edge, and it
 * was asked for by name (2026-09-19).
 */
const RIGHT_SURFACE = ".pdx-dialog:not(.pdx-confirm), .bffb-dialog, .gantt-drawer, .schedule-job-picker, .bfsp-drawer";
/** Anything a person could plausibly have opened a panel with. */
const CLICKABLE = "button, [role='button'], a[href], tr, [role='row'], summary, [role='menuitem'], label";

/**
 * Settings, where the thing that comes out of the button is the PAGE's own panel.
 *
 * Picking a category re-keys `.settings-panel-inner` in the JSX, so the whole
 * panel unmounts and a new one arrives — which is the same event the five right
 * panels are caught by, and it is measured the same way. What is different is
 * that this surface also arrives when the page itself opens, from the top bar's
 * gear, and then it must keep the page's own beats instead: a panel morphing out
 * of a gear in the chrome while the rail is still assembling is two openings at
 * once. So this one does not read `clicked` — it reads a rect taken only from a
 * CATEGORY control, and spends it, so the next arrival with no category behind
 * it is left alone.
 */
const CATEGORIES = ".settings-nav-item, .settings-ai-button";
const SWAP_SURFACE = ".settings-panel-inner";
/** Holds the panel in the layout while it shrinks back into the button. */
const CLOSING = "bfm-closing";

/**
 * Take the class off ONLY if it is on, and this is not a micro-optimisation.
 *
 * `classList.remove` writes the `class` attribute whether or not the class was
 * there, and MutationObserver records an attribute being SET, not an attribute
 * changing value. So a bare remove() inside this layer's own observer re-fires
 * it, which removes again, for ever — a main-thread lock, at the one moment it
 * is guaranteed to happen: the panel is closed and unmeasured the instant the
 * shell mounts. It froze the browser on sign-in and hung the test suite.
 */
const unclose = (panel: HTMLElement) => {
  if (panel.classList.contains(CLOSING)) panel.classList.remove(CLOSING);
};
/** The CSS finishes on its own; this is only a backstop, as panelExit.tsx keeps one. */
const CLOSE_BACKSTOP_MS = 600;

/**
 * Where the panel has to START so that its first frame is the button — §64's
 * five numbers, for two boxes instead of a control and a list.
 *
 * Both rects are viewport coordinates, which is what keeps this right under the
 * shell's CSS zoom: the button is inside the zoom and the panel is a portal on
 * the body, outside it, so their offsets are in different units but their
 * client rects are not.
 */
const gooFrom = (from: DOMRect, to: DOMRect) => ({
  dx: `${Math.round(from.left - to.left)}px`,
  y: `${Math.round(from.top - to.top)}px`,
  // a button is never bigger than the panel it opens
  x: to.width > 0 ? Math.min(1, from.width / to.width).toFixed(4) : "1",
  h: to.height > 0 ? Math.min(1, from.height / to.height).toFixed(4) : "0.2"
});

export function PanelGoo() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let asked: DOMRect | null = null; // the assistant's own button
    let clicked: DOMRect | null = null; // whatever was last pressed, for the panels
    let hovered: DOMRect | null = null; // the rail button under the pointer, for the flyout
    let category: DOMRect | null = null; // the Settings category just picked, spent on arrival

    // capture, so a rect is taken while the thing pressed is still on the page —
    // the floating "Ask AI" button unmounts the instant its panel opens, and a
    // row that opens a record can be replaced by the render that follows
    const remember = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const trigger = target?.closest?.(TRIGGER);
      asked = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : null;
      const any = target?.closest?.(CLICKABLE);
      clicked = any instanceof HTMLElement ? any.getBoundingClientRect() : null;
      const pick = target?.closest?.(CATEGORIES);
      category = pick instanceof HTMLElement ? pick.getBoundingClientRect() : null;
    };
    document.addEventListener("click", remember, true);

    // The rail's flyout opens on hover and never sees a click, so the button it
    // should come out of is the one the pointer is on.
    const rememberHover = (event: PointerEvent) => {
      const slot = (event.target as Element | null)?.closest?.(HOVER_TRIGGERS);
      if (slot instanceof HTMLElement) hovered = slot.getBoundingClientRect();
    };
    document.addEventListener("pointerover", rememberHover, true);

    /**
     * Start `surface` on `from`. Shared by the assistant and the five panels:
     * the numbers mean the same thing for both, and so does the mark the sheet
     * keys the animation on.
     */
    const startOn = (surface: HTMLElement, from: DOMRect | null) => {
      if (!from || surface.dataset.bfmGoo === "true") return;
      const box = surface.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const goo = gooFrom(from, box);
      surface.style.setProperty("--bf-goo-dx", goo.dx);
      surface.style.setProperty("--bf-goo-y", goo.y);
      surface.style.setProperty("--bf-goo-x", goo.x);
      surface.style.setProperty("--bf-goo-h", goo.h);
      surface.dataset.bfmGoo = "true";
    };

    /** A right panel has arrived: start it on whatever opened it. */
    const arrived = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      // panelExit.tsx puts a COPY of a leaving panel back; it is going, not coming
      if (node.classList.contains("bf-panel-exit")) return;
      // the flyout is hover-opened and is its own surface; everything else is
      // click-opened and holds the surface inside it
      const flyout = node.matches?.(FLYOUT) ? node : node.querySelector?.(FLYOUT);
      if (flyout instanceof HTMLElement) {
        startOn(flyout, hovered);
        return;
      }
      // Settings' panel, arriving because another category was picked
      const swap = node.matches?.(SWAP_SURFACE) ? node : node.querySelector?.(SWAP_SURFACE);
      if (swap instanceof HTMLElement) {
        // spent whether or not it was there: a category rect belongs to the ONE
        // panel that arrived because of it, never to the next thing to mount
        const from = category;
        category = null;
        startOn(swap, from);
        return;
      }
      const panel = node.matches?.(RIGHT_PANELS) ? node : node.querySelector?.(RIGHT_PANELS);
      if (!(panel instanceof HTMLElement)) return;
      const surface = panel.matches(RIGHT_SURFACE) ? panel : panel.querySelector<HTMLElement>(RIGHT_SURFACE);
      if (surface) startOn(surface, clicked);
    };

    let closing = 0;

    /** Let the panel go: it has finished shrinking, or the backstop ran out. */
    const done = (panel: HTMLElement, surface: HTMLElement) => {
      window.clearTimeout(closing);
      closing = 0;
      unclose(panel);
      if (surface.dataset.bfmGoo) delete surface.dataset.bfmGoo;
    };

    const place = () => {
      const panel = document.querySelector<HTMLElement>(PANEL);
      const surface = panel?.querySelector<HTMLElement>(SURFACE);
      if (!panel || !surface) return;
      if (!panel.classList.contains("is-open")) {
        // nothing measured, so there is nothing to go back into
        if (surface.dataset.bfmGoo !== "true") {
          unclose(panel);
          return;
        }
        if (panel.classList.contains(CLOSING)) return; // already on its way
        panel.classList.add(CLOSING);
        surface.addEventListener("animationend", () => done(panel, surface), { once: true });
        closing = window.setTimeout(() => done(panel, surface), CLOSE_BACKSTOP_MS);
        return;
      }
      // opened again before it had finished leaving
      if (panel.classList.contains(CLOSING)) done(panel, surface);
      // opened some other way with no button behind it: it keeps its old entrance
      startOn(surface, asked);
    };

    // Watch the PANEL's own class, not every class in the document: the panel is
    // one element and this fires on nothing else. A second, cheaper observer
    // waits for it to appear at all, since the layer mounts before the portal does.
    let onPanel: MutationObserver | null = null;
    const attach = () => {
      const panel = document.querySelector<HTMLElement>(PANEL);
      if (!panel || onPanel) return;
      onPanel = new MutationObserver(place);
      onPanel.observe(panel, { attributes: true, attributeFilter: ["class"] });
      place();
    };
    const waiting = new MutationObserver((records) => {
      if (!onPanel) attach();
      for (const record of records) for (const node of record.addedNodes) arrived(node);
    });
    // `subtree`, because only some of these are portals on the body — the Gantt's
    // job drawer is rendered inside its page (the same reason panelExit.tsx does)
    waiting.observe(document.body, { childList: true, subtree: true });
    attach();

    return () => {
      document.removeEventListener("click", remember, true);
      document.removeEventListener("pointerover", rememberHover, true);
      waiting.disconnect();
      onPanel?.disconnect();
      window.clearTimeout(closing);
    };
  }, []);
  return null;
}
