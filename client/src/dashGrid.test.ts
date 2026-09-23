import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  clampItem,
  DASH_GAP,
  collides,
  compact,
  itemRect,
  layoutRows,
  moveItem,
  parseStoredBoard,
  placeItem,
  reconcileLayout,
  resizeItem,
  separate,
  snapDelta,
  snapDragSameShape,
  type GridItem
} from "./dashGrid";

const item = (id: string, x: number, y: number, w: number, h: number): GridItem => ({ id, x, y, w, h });
const at = (items: GridItem[], id: string) => items.find((entry) => entry.id === id)!;

describe("dashGrid", () => {
  it("detects overlap and ignores an item against itself", () => {
    expect(collides(item("a", 0, 0, 3, 2), item("b", 2, 1, 3, 2))).toBe(true);
    expect(collides(item("a", 0, 0, 3, 2), item("b", 3, 0, 3, 2))).toBe(false);
    expect(collides(item("a", 0, 0, 3, 2), item("a", 0, 0, 3, 2))).toBe(false);
  });

  it("compacts everything upward in reading order", () => {
    const packed = compact([item("a", 0, 4, 6, 2), item("b", 0, 10, 3, 2), item("c", 3, 12, 3, 2)]);
    expect(at(packed, "a").y).toBe(0);
    expect(at(packed, "b").y).toBe(2);
    expect(at(packed, "c").y).toBe(2);
  });

  it("a panel that grew where it stands pushes the one beneath it down, not under it", () => {
    // the content-fit on the default board, WeatherIQ's second pass: it was fitted to two rows
    // while it read the forecast, Equipment Conflicts packed up under it, and then it grew to six
    const grown = [
      item("apps", 0, 0, 6, 6),
      item("weather", 0, 6, 3, 6),
      item("readiness", 3, 6, 3, 5),
      item("conflicts", 0, 8, 3, 5),
      item("inspections", 3, 11, 3, 5),
      item("meetings", 0, 16, 6, 6)
    ];
    const packedOnly = compact(grown);
    expect(collides(at(packedOnly, "weather"), at(packedOnly, "conflicts"))).toBe(true);
    const fitted = separate(grown);
    expect(fitted.some((one) => fitted.some((other) => collides(one, other)))).toBe(false);
    expect(at(fitted, "weather")).toMatchObject({ y: 6, h: 6 });
    expect(at(fitted, "conflicts").y).toBe(12);
    expect(at(fitted, "inspections").y).toBe(11);
    expect(at(fitted, "meetings").y).toBe(17);
    // and a panel that shrank lets everything under it back up
    const shrunk = separate([item("a", 0, 0, 6, 2), item("b", 0, 6, 6, 2)]);
    expect(at(shrunk, "b").y).toBe(2);
  });

  it("moving a panel onto another pushes that one down, then packs", () => {
    const start = [item("a", 0, 0, 6, 2), item("b", 0, 2, 6, 2), item("c", 0, 4, 6, 2)];
    const next = moveItem(start, "c", 0, 0);
    expect(at(next, "c").y).toBe(0);
    expect(at(next, "a").y).toBe(2);
    expect(at(next, "b").y).toBe(4);
  });

  it("dragging a panel down past a neighbour swaps with it instead of shoving it forever", () => {
    const start = [item("a", 0, 0, 6, 3), item("b", 0, 3, 6, 2)];
    const next = moveItem(start, "a", 0, 4);
    expect(at(next, "b").y).toBe(0);
    expect(at(next, "a").y).toBe(2);
  });

  it("places side by side when there is room", () => {
    const start = [item("a", 0, 0, 3, 2), item("b", 0, 2, 3, 2)];
    const next = moveItem(start, "b", 3, 0);
    expect(at(next, "b")).toMatchObject({ x: 3, y: 0 });
    expect(at(next, "a")).toMatchObject({ x: 0, y: 0 });
  });

  it("a panel dragged toward the edge shrinks to the room there, down to its minimum", () => {
    const start = [item("a", 0, 0, 6, 2)];
    // full width dragged to the right half: becomes half width, sits at x 3
    expect(at(moveItem(start, "a", 3, 0, { minW: 2 }), "a")).toMatchObject({ x: 3, w: 3 });
    // pushed further than its minimum allows: keeps the minimum and hugs the edge
    expect(at(moveItem(start, "a", 5, -3, { minW: 2 }), "a")).toMatchObject({ x: 4, y: 0, w: 2 });
    // dragged left past the edge: position clamps, width untouched
    expect(at(moveItem([item("a", 2, 0, 3, 2)], "a", -4, 0, { minW: 2 }), "a")).toMatchObject({ x: 0, w: 3 });
  });

  it("a full-width panel dropped beside a half-width one lands side by side", () => {
    const start = [item("a", 0, 0, 3, 4), item("b", 0, 4, 6, 4)];
    const next = moveItem(start, "b", 3, 0, { minW: 2 });
    expect(at(next, "b")).toMatchObject({ x: 3, y: 0, w: 3 });
    expect(at(next, "a")).toMatchObject({ x: 0, y: 0 });
  });

  it("resizing pushes overlapped panels down and respects limits", () => {
    const start = [item("a", 0, 0, 3, 2), item("b", 0, 2, 6, 2)];
    const grown = resizeItem(start, "a", 6, 4, { minW: 2, minH: 2 });
    expect(at(grown, "a")).toMatchObject({ w: 6, h: 4 });
    expect(at(grown, "b").y).toBe(4);
    const shrunk = resizeItem(grown, "a", 1, 1, { minW: 2, minH: 2 });
    expect(at(shrunk, "a")).toMatchObject({ w: 2, h: 2 });
    expect(at(shrunk, "b").y).toBe(2);
  });

  it("resizing cannot grow past the right edge", () => {
    const start = [item("a", 4, 0, 2, 2)];
    expect(at(resizeItem(start, "a", 6, 2), "a").w).toBe(2);
  });

  it("reconciles storage: drops unknown ids, clamps, appends what is missing, compacts", () => {
    const defaults = [item("a", 0, 0, 6, 2), item("b", 0, 2, 6, 2), item("c", 0, 4, 6, 2)];
    const stored = [
      { id: "b", x: 9, y: 7, w: 3, h: 2 },
      { id: "zzz", x: 0, y: 0, w: 6, h: 2 },
      { id: "a", x: "nope", y: 20, w: 3, h: 2 }
    ];
    const layout = reconcileLayout(stored, defaults, () => ({ minW: 2 }));
    expect(layout.map((entry) => entry.id).sort()).toEqual(["a", "b", "c"]);
    expect(at(layout, "b")).toMatchObject({ x: 3, y: 0, w: 3 });
    expect(at(layout, "a")).toMatchObject({ x: 0, y: 0, w: 3 });
    expect(at(layout, "c").y).toBe(2);
    expect(layoutRows(layout)).toBe(4);
  });

  it("falls back to the defaults, side-by-side positions included, when nothing usable was stored", () => {
    const defaults = [item("a", 0, 0, 3, 4), item("b", 3, 0, 3, 2), item("c", 3, 2, 3, 2), item("d", 0, 4, 6, 2)];
    expect(reconcileLayout("garbage", defaults)).toEqual(defaults);
    expect(reconcileLayout(null, defaults)).toEqual(defaults);
    expect(reconcileLayout([{ id: "nope" }], defaults)).toEqual(defaults);
  });

  it("a panel added after the layout was saved keeps its default column and lifts into free space", () => {
    const defaults = [item("a", 0, 0, 3, 4), item("b", 3, 0, 3, 2), item("c", 3, 2, 3, 2)];
    // the user saved before "c" existed
    const stored = [item("a", 0, 0, 3, 4), item("b", 3, 0, 3, 2)];
    const layout = reconcileLayout(stored, defaults);
    expect(at(layout, "c")).toMatchObject({ x: 3, y: 2, w: 3 });
  });

  it("placing a panel at half width beside another lands them side by side and settles the rest", () => {
    const start = [item("a", 0, 0, 6, 4), item("b", 0, 4, 6, 4), item("c", 0, 8, 6, 2)];
    // b is picked up (full width), dropped in the right half of the top row at half width
    const next = placeItem(start, "b", 3, 0, 3, { minW: 2 });
    expect(at(next, "b")).toMatchObject({ x: 3, y: 0, w: 3 });
    // a is still full width, so it cannot share the row: it is pushed under b
    expect(at(next, "a")).toMatchObject({ x: 0, y: 4, w: 6 });
    expect(at(next, "c").y).toBe(8);
    // dropping back exactly where it was, at its own width, changes nothing
    expect(placeItem(start, "b", 0, 4, 6, { minW: 2 })).toBe(start);
  });

  it("reads a saved board in either form and ignores anything else", () => {
    // the current form: items plus the hidden panels, de-duplicated and strings only
    expect(parseStoredBoard({ items: [{ id: "a", x: 0, y: 0, w: 3, h: 4 }], hidden: ["weather", "weather", 7, "apps"] })).toEqual({
      items: [{ id: "a", x: 0, y: 0, w: 3, h: 4 }],
      hidden: ["weather", "apps"]
    });
    // a board saved before panels could be hidden is a bare array
    expect(parseStoredBoard([{ id: "a", x: 0, y: 0, w: 3, h: 4 }])).toEqual({ items: [{ id: "a", x: 0, y: 0, w: 3, h: 4 }], hidden: [] });
    // nothing usable saved
    expect(parseStoredBoard(null)).toBeNull();
    expect(parseStoredBoard("layout")).toBeNull();
    expect(parseStoredBoard({ hidden: ["weather"] })).toBeNull();
  });

  it("snaps pointer travel to whole cells and lays cells out in pixels", () => {
    expect(snapDelta(0, 100, 16)).toBe(0);
    expect(snapDelta(70, 100, 16)).toBe(1);
    expect(snapDelta(-60, 100, 16)).toBe(-1);
    expect(itemRect(item("a", 1, 2, 3, 2), 100, 40, 16)).toEqual({ left: 116, top: 112, width: 332, height: 96 });
    expect(clampItem(item("a", -2, -2, 9, 0), { minH: 1 }, 6)).toMatchObject({ x: 0, y: 0, w: 6, h: 1 });
  });
});

describe("snapDragSameShape", () => {
  /* A carried panel keeps the shape it was lifted with (2026-09-15, on the reference): the
     column is the nearest it still fits in at its own width, the rows are clamped to the board. */
  it("keeps the width and snaps to the nearest column the panel fits in", () => {
    expect(snapDragSameShape(0.4, 2, 3, 10)).toEqual({ x: 0, y: 2 });
    expect(snapDragSameShape(2.6, 2, 3, 10)).toEqual({ x: 3, y: 2 });
    // a three-wide panel cannot start past column 3 on a six-column board
    expect(snapDragSameShape(5, 2, 3, 10)).toEqual({ x: 3, y: 2 });
    // a full-width panel always sits at 0
    expect(snapDragSameShape(2, 4, 6, 10)).toEqual({ x: 0, y: 4 });
  });
  it("takes the first row past the top and the floor row past the bottom", () => {
    expect(snapDragSameShape(1, -3, 3, 10)).toEqual({ x: 1, y: 0 });
    expect(snapDragSameShape(1, 14, 3, 10)).toEqual({ x: 1, y: 10 });
  });
});

describe("the board's gap", () => {
  /* The sections sit as far apart as the Schedule Status band sits from the first of them:
     that band is a child of the page stack `.dx-inner`, so its gap and DASH_GAP must agree. */
  it("equals the page stack's gap, so panels sit as far apart as the band sits from them", () => {
    const sheet = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "hs-home.css"), "utf8");
    // the sheet declares this selector twice (22px, then 30px); the later one is the one that wins
    const rules = [...sheet.matchAll(/\.dash-rx\.hs-home \.dx-inner \{[^}]*\}/g)];
    expect(rules.length, ".dx-inner rules").toBeGreaterThan(0);
    const gap = rules[rules.length - 1][0].match(/gap:\s*(\d+)px/);
    expect(gap?.[1]).toBe(String(DASH_GAP));
  });
});
