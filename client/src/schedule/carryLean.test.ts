/**
 * The lean a carried card is drawn with, on every Schedule board. The frame loop that feeds it
 * lives in parts/carry.tsx and smooths the hand's speed a fifth of the way toward each new
 * reading — this is the half that decides what the card then looks like, and every case below is a
 * direction a hand can move in.
 *
 * jsdom applies no CSS and never runs a frame, so the transform string is the only thing a test in
 * this project can see of the lean.
 */
import { describe, expect, it } from "vitest";
import { scheduleCarryLean } from "./parts/carry";

/** The 2D bank, in degrees, out of the transform the card is given. */
const bankOf = (transform: string) => Number(/rotate\((-?[\d.]+)deg\)$/.exec(transform)?.[1]);
/** The tip's axis and angle: rotate3d(x, y, 0, Ndeg). */
const tipOf = (transform: string) => {
  const parts = /rotate3d\((-?[\d.]+), (-?[\d.]+), 0, (-?[\d.]+)deg\)/.exec(transform);
  return parts ? { x: Number(parts[1]), y: Number(parts[2]), deg: Number(parts[3]) } : null;
};

describe("the lean of a carried job", () => {
  it("is flat, and plainly flat, when the hand is still", () => {
    expect(scheduleCarryLean({ x: 0, y: 0 })).toBe("rotate(0.00deg)");
    // a crawl is not a lean: nothing in three dimensions until there is something to see
    expect(tipOf(scheduleCarryLean({ x: 0.001, y: 0 }))).toBeNull();
  });

  it("banks the way the hand is going", () => {
    expect(bankOf(scheduleCarryLean({ x: 0.5, y: 0 }))).toBeCloseTo(3, 5);
    expect(bankOf(scheduleCarryLean({ x: -0.5, y: 0 }))).toBeCloseTo(-3, 5);
    // and the faster the hand, the further it leans
    expect(bankOf(scheduleCarryLean({ x: 0.9, y: 0 }))).toBeGreaterThan(bankOf(scheduleCarryLean({ x: 0.4, y: 0 })));
  });

  it("tips about the axis across the travel, so the leading edge is the one that dips", () => {
    // right: the turn is about the vertical axis, and the right edge is the leading one
    expect(tipOf(scheduleCarryLean({ x: 1, y: 0 }))).toMatchObject({ x: 0, y: 1, deg: 5 });
    expect(tipOf(scheduleCarryLean({ x: -1, y: 0 }))).toMatchObject({ x: 0, y: -1 });
    // down: about the horizontal axis, negative so the BOTTOM edge dips away and not the top
    expect(tipOf(scheduleCarryLean({ x: 0, y: 1 }))).toMatchObject({ x: -1, y: 0, deg: 5 });
    expect(tipOf(scheduleCarryLean({ x: 0, y: -1 }))).toMatchObject({ x: 1, y: 0 });
    // a diagonal leans on both, and only the horizontal half banks
    const corner = scheduleCarryLean({ x: 0.6, y: 0.6 });
    expect(tipOf(corner)).toMatchObject({ x: -0.6, y: 0.6 });
    expect(bankOf(corner)).toBeCloseTo(3.6, 5);
  });

  it("holds a flick to a lean rather than a tumble", () => {
    const flick = scheduleCarryLean({ x: 40, y: 12 });
    expect(bankOf(flick)).toBe(8);
    expect(tipOf(flick)?.deg).toBe(10);
    expect(bankOf(scheduleCarryLean({ x: -40, y: 0 }))).toBe(-8);
  });
});
