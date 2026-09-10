import { describe, expect, it } from "vitest";
import {
  clampItem,
  collides,
  compact,
  dragFloor,
  itemRect,
  layoutRows,
  moveItem,
  placeItem,
  reconcileLayout,
  resizeItem,
  snapDelta,
  snapDragCell,
  snapDragColumn,
  snapToHalf,
  type GridItem, parseStoredBoard
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

  it("puts a dragged panel in the half its pointer is over", () => {
    expect(snapToHalf(0, 3)).toBe(0);
    expect(snapToHalf(1, 3)).toBe(0);
    expect(snapToHalf(2.9, 3)).toBe(0);
    expect(snapToHalf(3, 3)).toBe(3);
    expect(snapToHalf(5, 3)).toBe(3);
    expect(snapToHalf(-2, 3)).toBe(0);
  });

  it("a carried panel is full width past either edge or over the middle third, half width over an outer third", () => {
    // half a column beyond the left edge
    expect(snapDragColumn(-0.5, 3)).toEqual({ x: 0, w: 6, full: true });
    expect(snapDragColumn(-4, 3)).toEqual({ x: 0, w: 6, full: true });
    // the left third
    expect(snapDragColumn(-0.4, 3)).toEqual({ x: 0, w: 3, full: false });
    expect(snapDragColumn(0, 3)).toEqual({ x: 0, w: 3, full: false });
    expect(snapDragColumn(1.9, 3)).toEqual({ x: 0, w: 3, full: false });
    // the middle third, where the board's centre is
    expect(snapDragColumn(2, 3)).toEqual({ x: 0, w: 6, full: true });
    expect(snapDragColumn(2.85, 3)).toEqual({ x: 0, w: 6, full: true });
    expect(snapDragColumn(3.9, 3)).toEqual({ x: 0, w: 6, full: true });
    // the right third
    expect(snapDragColumn(4, 3)).toEqual({ x: 3, w: 3, full: false });
    expect(snapDragColumn(5.4, 3)).toEqual({ x: 3, w: 3, full: false });
    // within half a column of the right edge, and beyond it
    expect(snapDragColumn(5.5, 3)).toEqual({ x: 0, w: 6, full: true });
    expect(snapDragColumn(7, 3)).toEqual({ x: 0, w: 6, full: true });
  });

  it("past the top edge a carried panel is half width on the first row, whatever the column rules say", () => {
    expect(snapDragCell(-1, -1, 3, 10)).toEqual({ x: 0, y: 0, w: 3, full: false, top: true, bottom: false });
    expect(snapDragCell(5, -2, 3, 10)).toEqual({ x: 3, y: 0, w: 3, full: false, top: true, bottom: false });
    expect(snapDragCell(3.2, -1, 3, 10)).toEqual({ x: 3, y: 0, w: 3, full: false, top: true, bottom: false });
    // inside the board the column rules still apply: edges and the middle third take the row, an outer third stays half
    expect(snapDragCell(-1, 2, 3, 10)).toEqual({ x: 0, y: 2, w: 6, full: true, top: false, bottom: false });
    expect(snapDragCell(6, 0, 3, 10)).toEqual({ x: 0, y: 0, w: 6, full: true, top: false, bottom: false });
    expect(snapDragCell(1, 3, 3, 10)).toEqual({ x: 0, y: 3, w: 3, full: false, top: false, bottom: false });
    expect(snapDragCell(3, 3, 3, 10)).toEqual({ x: 0, y: 3, w: 6, full: true, top: false, bottom: false });
    expect(snapDragCell(4.5, 3, 3, 10)).toEqual({ x: 3, y: 3, w: 3, full: false, top: false, bottom: false });
    // the top and bottom zones ignore the middle: half width in the half the pointer is over
    expect(snapDragCell(2.5, -1, 3, 10)).toEqual({ x: 0, y: 0, w: 3, full: false, top: true, bottom: false });
    expect(snapDragCell(3.5, 10, 3, 10)).toEqual({ x: 3, y: 10, w: 3, full: false, top: false, bottom: true });
  });

  it("past the bottom a carried panel is half width on the floor row, whatever the side edges say", () => {
    // the floor is where the others end once the carried panel is gone and the rest pack upward
    const items = [
      { id: "a", x: 0, y: 0, w: 3, h: 6 },
      { id: "b", x: 3, y: 0, w: 3, h: 4 },
      { id: "c", x: 0, y: 6, w: 6, h: 5 }
    ];
    expect(dragFloor(items, "b")).toBe(11);
    expect(dragFloor(items, "c")).toBe(6);
    // its top at or below the floor: half width on the floor row, even past a side edge
    expect(snapDragCell(-1, 11, 3, 11)).toEqual({ x: 0, y: 11, w: 3, full: false, top: false, bottom: true });
    expect(snapDragCell(5, 14, 3, 11)).toEqual({ x: 3, y: 11, w: 3, full: false, top: false, bottom: true });
    // still overlapping the last row, the side edges still win
    expect(snapDragCell(-1, 10, 3, 11)).toEqual({ x: 0, y: 10, w: 6, full: true, top: false, bottom: false });
    // dropped there it packs under the full-width panel in its half
    const zone = snapDragCell(5, 14, 3, dragFloor(items, "b"));
    expect(placeItem(items, "b", zone.x, zone.y, zone.w, {})).toEqual([
      { id: "a", x: 0, y: 0, w: 3, h: 6 },
      { id: "c", x: 0, y: 6, w: 6, h: 5 },
      { id: "b", x: 3, y: 11, w: 3, h: 4 }
    ]);
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
