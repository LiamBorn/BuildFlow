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
import { DUR, EASE, PILL, ms } from "./tokens";

/**
 * Groups whose selection is drawn by a travelling pill.
 *
 * Every one of these is a row (or, for the two columns, a column) of options
 * where exactly one is chosen at a time. Groups NOT in this list, deliberately:
 * the command palette, whose rows are keyboard-driven and scroll under the
 * selection, and anything whose "active" is a button's own state rather than one
 * option out of several.
 *
 * SETTINGS' RAIL was left out when this was built, on the grounds that its items
 * are split across four headed sections and a pill would have to jump a heading
 * to get between them. That was the wrong conclusion from the right observation:
 * the group is the WHOLE RAIL, not one section, so the pill travels the column
 * and passes behind the headings — which is the thing itself, a selection moving
 * between categories rather than two lamps swapping. Taking the rail also reaches
 * the BuildFlow AI button, which is a category like the others but sits outside
 * the sections, and which no per-section group could ever have included.
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
  ".mx-goal", // Map & Field Ops — the optimisation goal (mapops/, painted in mapops.css)
  ".hs-rail-list", // the icon rail: the page you are on (docs/motion-spec.md §5)
  ".settings-rail", // Settings — the category you are reading, across all four sections
  /* Onboarding step 3 — the trade tiles (2026-09-22, "add some sort of clean effect for when a
     user selects"). A grid, not a row, and the pill is a RING rather than a fill: the tiles carry
     their own text and icon, and a fill travelling under them would cross two tiles' borders on
     the way. The ring is drawn by onboarding.css, not the skin — the flow lives outside the shell. */
  ".onb-tiles"
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

/* ── the stretch ────────────────────────────────────────────────────────────
   The pill's leading edge runs ahead of its trailing one, so the box flexes in
   the direction it is going and settles once it arrives.

   It cannot be done with the transition the sheet already has. Both edges of a
   `transform` + `width` pair are tied to the same two values, so when an option
   is the same width as the one before it the box CANNOT change length on the way
   — whatever easing either property is given. A stretch needs the two edges on
   separate paths, which means keyframes, which means driving it from here.

   `left`/`right` would express it directly and is what this wanted to be, but
   docs/motion-spec.md §6 is "animate only opacity, transform and filter", and
   those two are layout. So the stops are emitted as `transform` + `width`, which
   is the pair the sheet was already animating. ────────────────────────────── */

type Box = { x: number; y: number; w: number; h: number };

/** Where each group's pill is now, so the next move knows what it is leaving. */
const placedAt = new WeakMap<HTMLElement, Box>();

/** cubic-bezier(p1x, p1y, p2x, p2y) as a function of progress, by Newton-Raphson on x. */
const bezier = (p1x: number, p1y: number, p2x: number, p2y: number) => {
  const a = (u: number, v: number) => 1 - 3 * v + 3 * u;
  const b = (u: number, v: number) => 3 * v - 6 * u;
  const c = (u: number) => 3 * u;
  const curveX = (t: number) => ((a(p1x, p2x) * t + b(p1x, p2x)) * t + c(p1x)) * t;
  const curveY = (t: number) => ((a(p1y, p2y) * t + b(p1y, p2y)) * t + c(p1y)) * t;
  const slopeX = (t: number) => 3 * a(p1x, p2x) * t * t + 2 * b(p1x, p2x) * t + c(p1x);
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = curveX(t) - x;
      if (Math.abs(error) < 1e-6) break;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return curveY(Math.min(1, Math.max(0, t)));
  };
};
const travel = bezier(EASE.pill[0], EASE.pill[1], EASE.pill[2], EASE.pill[3]);

/**
 * How far ahead the leading edge may run for a move of `distance` px.
 *
 * The cap is turned back into a `lead` rather than clamping the width later: a
 * clamp would flatten the top of the bulge, and this keeps the curve a curve.
 *
 * 0.37 is the peak of `travel(p × (1 + lead)) − travel(p)` per unit of lead, for
 * the small leads a capped move ends up with. It is not the same ratio at
 * PILL.lead itself (0.33 there) — the curve is not linear in `lead`, and using
 * the wrong end of it let a 900px move overshoot the cap by 3.3px.
 */
const leadFor = (distance: number) => (distance <= 1 ? 0 : Math.min(PILL.lead, PILL.stretchCap / (distance * 0.37)));

const STOPS = 18;

/**
 * Run one move as a stretch. Each axis is measured on its own: the edge on the
 * side the pill is heading for leads, the other trails, and an axis that is not
 * moving is left alone (its edges share a path, so it keeps its size).
 */
const stretchTo = (group: HTMLElement, from: Box, to: Box) => {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const leadX = leadFor(Math.abs(dx));
  const leadY = leadFor(Math.abs(dy));
  if (leadX === 0 && leadY === 0) return false;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const frames: Keyframe[] = [];
  for (let i = 0; i < STOPS; i += 1) {
    const p = i / (STOPS - 1);
    const base = travel(p);
    const ahead = (lead: number) => (lead === 0 ? base : travel(Math.min(1, p * (1 + lead))));
    // on each axis the leading edge is the one in the direction of travel
    const [ex0, ex1] = dx >= 0 ? [base, ahead(leadX)] : [ahead(leadX), base];
    const [ey0, ey1] = dy >= 0 ? [base, ahead(leadY)] : [ahead(leadY), base];
    const left = lerp(from.x, to.x, ex0);
    const right = lerp(from.x + from.w, to.x + to.w, ex1);
    const top = lerp(from.y, to.y, ey0);
    const bottom = lerp(from.y + from.h, to.y + to.h, ey1);
    frames.push({
      offset: p,
      easing: "linear", // the curve is already in the numbers
      transform: `translate(${left.toFixed(2)}px, ${top.toFixed(2)}px)`,
      width: `${Math.max(1, right - left).toFixed(2)}px`,
      height: `${Math.max(1, bottom - top).toFixed(2)}px`
    });
  }
  try {
    group.animate(frames, { duration: ms(DUR.pill), easing: "linear", fill: "none", pseudoElement: "::before" });
    return true;
  } catch {
    // no pseudo-element animation here: the sheet's transition still carries the
    // move, exactly as it did before any of this
    return false;
  }
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
  const box: Box = { x: at.x, y: at.y, w: option.offsetWidth, h: option.offsetHeight };
  const was = placedAt.get(group);
  placedAt.set(group, box);

  group.style.setProperty("--bfm-pill-x", `${box.x}px`);
  group.style.setProperty("--bfm-pill-y", `${box.y}px`);
  group.style.setProperty("--bfm-pill-w", `${box.w}px`);
  group.style.setProperty("--bfm-pill-h", `${box.h}px`);

  /*
   * The stretch, for a move that HAS somewhere to come from and is allowed to
   * animate. It is deliberately additive: the properties above are written
   * either way, so the sheet's transition still carries the move on its own if
   * this browser cannot animate a pseudo-element, and a group landing for the
   * first time (below) never reaches here at all.
   *
   * Less motion is asked ONCE, here, rather than read at module load: the
   * setting can change while the app is open.
   */
  if (was && group.dataset.bfmPill === "live" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stretchTo(group, was, box);
  }

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
