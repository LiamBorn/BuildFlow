/**
 * <SegmentPill> — the selected option is a pill that TRAVELS (2026-09-19).
 *
 * docs/motion-spec.md §5's last unbuilt row ("active pill slides between items"),
 * built from the reference clip the user gave for it. Before this, choosing another
 * option cross-faded one background out and another in, and nothing moved: the two
 * options read as separate lamps rather than as one selection with a place.
 *
 * HOW IT ATTACHES. The pill is the group's own `::before` (skin §78), placed by two
 * custom properties this layer writes on the group — `--bfm-pill-x` and
 * `--bfm-pill-w`. Both edges interpolate, so it changes WIDTH to fit its target
 * rather than sliding at a fixed size, which is what the reference does and what
 * makes a narrow option next to a wide one look right.
 *
 * WHY A LAYER AND NOT A COMPONENT. framer's `layoutId` is the usual answer, and it
 * needs the indicator rendered inside the active child — a change at every call
 * site, in a 40k-line App.tsx another session is editing. Writing two properties
 * onto the group element touches nothing React owns: React only overwrites `style`
 * on elements whose components set it, and none of these do. The same layer then
 * serves any group named in PILL_GROUPS, including ones that live in body portals.
 *
 * It degrades to exactly what was there before: with no JS the group is never
 * marked, the pill is never painted, and the selected option keeps its own
 * background (§78 only takes that away once the pill is live).
 *
 * SELECTION ONLY, NOT HOVER. Letting the pill follow the pointer was the first
 * shape of this and it is wrong twice over: the reference does not do it (the
 * cursor is nowhere near the controls while they change), and the pill IS the
 * dark background the selected option's light text sits on — parked under an
 * option that is only hovered, it puts that option's muted ink on its own fill.
 */
import { useEffect } from "react";

/**
 * Groups whose selection is drawn by a travelling pill.
 *
 * Every one of these is a row (or, for the rail, a column) of options where
 * exactly one is chosen at a time. Groups NOT in this list, deliberately: the
 * command palette, whose rows are keyboard-driven and scroll under the
 * selection; Settings' navigation, whose items are split across sections, so a
 * pill would have to jump a heading to get between them; and anything whose
 * "active" is a button's own state rather than one option out of several.
 */
export const PILL_GROUPS = [
  ".hs-home-seg", // Dashboard — Pending Approvals: Open / Resolved
  ".pref-segmented", // Preferences — every radio row
  ".hs-views", // Projects, Crews, Equipment, Materials, Field, DelayIQ, Contacts, Deals, Companies
  ".tc-seg", // Timecards — the breakdown dimension
  ".tc-tabs", // Timecards — its sections
  ".gantt-seg", // Gantt — the timeline range
  ".bfnt-tabs", // the notifications drawer's filters
  ".bf-breeze-nav", // BuildFlow AI's own nav
  ".route-goal-control", // Map & Field Ops — the optimisation goal
  ".hs-rail-list" // the icon rail: the page you are on (docs/motion-spec.md §5)
].join(", ");

/** How each of them says which option is selected. */
const SELECTED = '.active, .is-active, [aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]';

const optionsOf = (group: HTMLElement) => [...group.children].filter((c): c is HTMLElement => c instanceof HTMLElement);

/**
 * The element the pill should sit on — which is not always a direct child.
 *
 * The icon rail marks the BUTTON inside its slot, and the slot is taller than
 * the button; measuring the child would draw a pill the wrong size in the wrong
 * place. So the selected element is found at any depth and measured itself.
 */
const selectedIn = (group: HTMLElement) => group.querySelector<HTMLElement>(SELECTED);

/**
 * Where `el` sits inside `group`, in the group's own coordinates.
 *
 * Walks the offsetParent chain rather than using getBoundingClientRect: the shell
 * carries a CSS `zoom` (skin §42), which scales a client rect but not an offset,
 * and the pill is positioned in the same unscaled pixels these return. Yields
 * null if the group is not in the chain, which means it is not a positioned
 * ancestor and the sheet has forgotten to give it `position: relative`.
 */
const offsetWithin = (el: HTMLElement, group: HTMLElement) => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== group) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === group ? { x, y } : null;
};

/**
 * Put the pill under `option`. `settled` is what tells the sheet it may animate:
 * the first placement of a group has nowhere to travel FROM, and without this the
 * pill would fly in from the group's left edge every time a panel mounted.
 */
const place = (group: HTMLElement, option: HTMLElement | null) => {
  if (!option) {
    group.removeAttribute("data-bfm-pill");
    return;
  }
  const at = offsetWithin(option, group);
  if (!at) {
    group.removeAttribute("data-bfm-pill");
    return;
  }
  group.style.setProperty("--bfm-pill-x", `${at.x}px`);
  group.style.setProperty("--bfm-pill-y", `${at.y}px`);
  group.style.setProperty("--bfm-pill-w", `${option.offsetWidth}px`);
  group.style.setProperty("--bfm-pill-h", `${option.offsetHeight}px`);
  if (group.dataset.bfmPill === undefined) {
    // The first placement has nowhere to travel from, so it must land without a
    // transition. Reading offsetWidth flushes it into a real computed style while
    // the group is still `placed` — the sheet defines no transition in that state
    // — and only then does `live` turn one on, for every move after this one.
    //
    // This was a requestAnimationFrame, which does not fire in a background tab:
    // the group stayed `placed`, the sheet's transition never applied, and the
    // pill teleported instead of travelling. Nothing here may wait for a frame.
    group.dataset.bfmPill = "placed";
    void group.offsetWidth;
    group.dataset.bfmPill = "live";
  }
};

export function SegmentPill() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const groups = new Map<HTMLElement, () => void>();

    const track = (group: HTMLElement) => {
      if (groups.has(group)) return;
      // the selection moved, or an option's label changed width
      const watch = new MutationObserver(() => place(group, selectedIn(group)));
      watch.observe(group, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed", "aria-checked", "aria-selected"]
      });
      const resize = new ResizeObserver(() => place(group, selectedIn(group)));
      resize.observe(group);
      for (const option of optionsOf(group)) resize.observe(option);

      groups.set(group, () => {
        watch.disconnect();
        resize.disconnect();
      });
      place(group, selectedIn(group));
    };

    const sweep = () => {
      for (const group of document.querySelectorAll<HTMLElement>(PILL_GROUPS)) track(group);
      for (const [group, stop] of groups) {
        if (group.isConnected) continue;
        stop();
        groups.delete(group);
      }
    };

    sweep();

    // Groups arrive with a panel or a portal, long after this layer mounts, so the
    // whole body has to be watched. That fires on EVERY node this app adds or
    // removes — a board drag, a list re-render, a menu opening — and a
    // querySelectorAll on each would be a real cost on a busy page. Two things
    // keep it cheap: a mutation is ignored unless something that arrived could
    // BE or CONTAIN a group, and the sweeps that survive that are coalesced into
    // one microtask, so a render that adds fifty nodes still sweeps once.
    let queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        sweep();
      });
    };
    const interesting = (nodes: NodeList) => {
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(PILL_GROUPS) || node.querySelector(PILL_GROUPS)) return true;
      }
      return false;
    };
    const added = new MutationObserver((records) => {
      for (const record of records) {
        // a removal only matters while there is something tracked to let go of
        if (interesting(record.addedNodes) || (groups.size > 0 && record.removedNodes.length > 0)) {
          later();
          return;
        }
      }
    });
    added.observe(document.body, { childList: true, subtree: true });
    return () => {
      added.disconnect();
      for (const stop of groups.values()) stop();
    };
  }, []);
  return null;
}
