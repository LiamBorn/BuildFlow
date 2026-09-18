/**
 * Carrying a card across a Schedule board (2026-09-17).
 *
 * One layer per page — dnd-kit's DragOverlay, a fixed layer over the page — holding a STATIC CLONE
 * of the card that was picked up: lifted off the page, tilted, and leaning the way the hand is
 * moving, while the card it came from stays where it is as the dashed slot it is leaving. The Month
 * calendar was built this way first; cloning rather than re-rendering is what let the other four
 * boards have the same gesture without a second copy of every card's face to keep in step — the
 * Week board's tile, the unbooked queue's strip, a Kanban card and a List row all carry themselves.
 *
 * A board whose card is styled through an ancestor (`.schedule-list-view button`) passes that
 * class as `host`, so the clone still matches the rules that dress it.
 */
import { DragOverlay, defaultDropAnimationSideEffects, useDndContext, type ClientRect } from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import { unzoomDropFlight, unzoomOverlay } from "../../dragZoom";

/**
 * How the carried card leans.
 *
 * A card held in a hand does not stay square to the page: push it right and it banks right, push it
 * down and its leading edge tips away. Both are read off the SPEED of the drag rather than the
 * distance, so the lean says which way the card is going right now — and speed is smoothed frame by
 * frame (a fifth of the way to the newest reading each time), which is what makes it a tween and
 * not a twitch: the card leans into a move, holds the lean while the hand keeps going, and eases
 * back to square in about a fifth of a second after it stops.
 *
 * The numbers are in degrees per pixel-per-millisecond, so a brisk drag (1px/ms) banks 6deg and
 * anything faster is held at the caps; the caps are what keep it a lean rather than a tumble.
 */
const LEAN = { ease: 0.2, bankPerSpeed: 6, bankCap: 8, tipPerSpeed: 5, tipCap: 10, depth: 700 };

/**
 * The lean at one speed, in pixels per millisecond: the card banks the way the hand is going, and
 * tips about the axis ACROSS that direction, so whichever way it travels the leading edge is the
 * one that dips. Below a twentieth of a degree of tip there is nothing to draw in three
 * dimensions, and a card at rest comes back flat.
 */
export function scheduleCarryLean(speed: { x: number; y: number }): string {
  const bank = Math.max(-LEAN.bankCap, Math.min(LEAN.bankCap, speed.x * LEAN.bankPerSpeed));
  const tip = Math.min(LEAN.tipCap, Math.hypot(speed.x, speed.y) * LEAN.tipPerSpeed);
  const turn = `rotate(${bank.toFixed(2)}deg)`;
  if (tip < 0.05) return turn;
  return `perspective(${LEAN.depth}px) rotate3d(${(-speed.y).toFixed(4)}, ${speed.x.toFixed(4)}, 0, ${tip.toFixed(2)}deg) ${turn}`;
}

/** The card settles into its place on the board's own curve. */
const CARRY_DROP = {
  duration: 240,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  keyframes: unzoomDropFlight,
  // the board has usually moved the card already, so without this the flight would land on a copy of itself
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })
};

/*
 * There is deliberately NO "tell the page what is in the air" callback here. The Month board had
 * one and used it to hold a `carrying` flag in page state; flipping that at the moment a drag began
 * re-rendered the whole page and cost 50-70ms of a 99-129ms stall, measured 2026-09-18 — the hitch
 * felt when picking a job up. A board that wants to dress for a carried card should set the class on
 * its own element instead (parts/month.tsx `CarryFlag`), which needs no render above it.
 */
export function ScheduleCarryLayer({
  host
}: {
  /** A class the card's own rules hang off, put on the layer so the clone still matches them. */
  host?: string;
}) {
  const { active, activeNodeRect, draggableNodes } = useDndContext();
  const carriedId = active ? String(active.id) : null;
  const source = active ? (draggableNodes.get(active.id)?.node.current ?? null) : null;
  /* The card's box as it was when it was picked up, which is where the carried one starts. dnd-kit's
     own `active.rect` is the OVERLAY's box once there is an overlay, and re-measures the card when a
     drop lands it somewhere else — either would move the card out from under the hand. */
  const pickedUpFrom = useRef<ClientRect | null>(null);
  if (!carriedId) pickedUpFrom.current = null;
  else if (activeNodeRect && !pickedUpFrom.current) pickedUpFrom.current = activeNodeRect;
  // the flight and the lean are motion; asked to keep still, the card simply arrives
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <DragOverlay dropAnimation={reduced ? null : CARRY_DROP} style={unzoomOverlay(pickedUpFrom.current)}>
      {source && active ? <CarriedCard source={source} itemId={String(active.id)} host={host} lean={!reduced} /> : null}
    </DragOverlay>
  );
}

/**
 * The card in the air: a clone of the one picked up, leaning where it is being taken.
 *
 * Every frame it asks where it has moved to — the overlay around it is the box dnd-kit carries, and
 * its centre is unaffected by the card's own tilt — and writes the lean onto its own `transform`.
 * Measuring the movement rather than listening to the pointer means the lean is the same whether a
 * card is dragged by mouse, by finger or by the arrow keys, and it eases out through the drop
 * flight as the card slows into place. The pick-up animation owns `rotate` and `scale` (the
 * individual properties) and a CSS animation outranks an inline style, so those two are the pair
 * the lean must not touch.
 */
function CarriedCard({
  source,
  itemId,
  host,
  lean
}: {
  source: HTMLElement;
  host?: string;
  /** What is being carried. The clone is keyed on this, not on the node (see below). */
  itemId: string;
  /** False with reduced motion asked for: the card is then carried square. */
  lean: boolean;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const latest = useRef(source);
  latest.current = source;
  useLayoutEffect(() => {
    const node = holder.current;
    if (!node) return;
    const clone = latest.current.cloneNode(true) as HTMLElement;
    /* The card it was cloned from is the dashed slot now, and may be mid-pulse or carrying the
       drag's own inline transform. None of that belongs on the card in the air. */
    clone.classList.remove("dragging");
    clone.removeAttribute("id");
    clone.removeAttribute("aria-describedby");
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("tabindex", "-1");
    clone.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
    clone.style.transform = "none";
    clone.style.translate = "none";
    clone.style.transition = "none";
    clone.style.animation = "none";
    clone.style.opacity = "1";
    clone.style.visibility = "visible";
    node.replaceChildren(clone);
    return () => node.replaceChildren();
    /* Keyed on WHAT is being carried, not on the node it currently is. A board that previews a
       drop in another section moves the real card between sections mid-drag, so `source` becomes a
       different element several times in one drag — and re-cloning it each time cost a
       `cloneNode(true)` and a restart of the lean loop for a picture that had not changed. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);
  useEffect(() => {
    const node = holder.current;
    const carrier = node?.parentElement;
    if (!node || !carrier || !lean) return;
    let frame = 0;
    const centre = () => {
      const box = carrier.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    let previous = { ...centre(), at: performance.now() };
    let speed = { x: 0, y: 0 };
    const draw = (now: number) => {
      const here = centre();
      // a floor and a ceiling on the gap: the first frame has no elapsed time, and a frame the tab
      // slept through would otherwise read as a flick
      const gap = Math.min(Math.max(now - previous.at, 8), 80);
      const toward = { x: (here.x - previous.x) / gap, y: (here.y - previous.y) / gap };
      previous = { ...here, at: now };
      speed = { x: speed.x + (toward.x - speed.x) * LEAN.ease, y: speed.y + (toward.y - speed.y) * LEAN.ease };
      node.style.transform = scheduleCarryLean(speed);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [lean]);
  return <div ref={holder} className={`sched-carry${host ? ` ${host}` : ""}`} aria-hidden="true" />;
}
