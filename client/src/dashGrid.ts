/**
 * Dashboard panel grid — the layout engine behind the Home page's
 * "move it anywhere, make it any size" editor.
 *
 * Pure functions over a list of items on a fixed-column grid, in the style of
 * react-grid-layout's vertical compaction: a moved or resized panel pushes
 * whatever it lands on out of the way (above it when that fits, otherwise
 * below), then every panel packs back up as far as it can. No DOM in here, so
 * it is unit-tested in dashGrid.test.ts.
 */

export type GridItem = { id: string; x: number; y: number; w: number; h: number };
export type GridLimits = { minW?: number; minH?: number; maxW?: number; maxH?: number };

/** Six columns, the way HubSpot's dashboard editor divides the page. */
export const DASH_COLS = 6;
/** One grid row in px, and the gutter between cells. */
export const DASH_ROW_UNIT = 40;
export const DASH_GAP = 16;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export const collides = (a: GridItem, b: GridItem) =>
  a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Reading order: top to bottom, then left to right. */
export const sortByPosition = (items: GridItem[]) => [...items].sort((p, q) => p.y - q.y || p.x - q.x);

/** Keeps an item inside the grid and within its own size limits. */
export function clampItem(item: GridItem, limits: GridLimits = {}, cols = DASH_COLS): GridItem {
  const maxW = Math.min(limits.maxW ?? cols, cols);
  const w = clamp(Math.round(item.w), limits.minW ?? 1, maxW);
  const h = clamp(Math.round(item.h), limits.minH ?? 1, limits.maxH ?? Number.MAX_SAFE_INTEGER);
  const x = clamp(Math.round(item.x), 0, cols - w);
  const y = Math.max(0, Math.round(item.y));
  return { ...item, x, y, w, h };
}

/** Pull every item up as far as it will go, in reading order. */
export function compact(items: GridItem[]): GridItem[] {
  const placed: GridItem[] = [];
  for (const item of sortByPosition(items)) {
    const next = { ...item };
    while (next.y > 0 && !placed.some((other) => collides(other, { ...next, y: next.y - 1 }))) next.y -= 1;
    placed.push(next);
  }
  return placed;
}

/**
 * With `fixedId` pinned where it is, move everything it overlaps out of the way
 * — above it when that fits (so dragging down past a panel swaps with it,
 * rather than shoving it down forever), otherwise below — then compact.
 */
export function settle(items: GridItem[], fixedId: string): GridItem[] {
  const fixed = items.find((item) => item.id === fixedId);
  if (!fixed) return compact(items);
  const placed: GridItem[] = [fixed];
  for (const original of sortByPosition(items.filter((item) => item.id !== fixedId))) {
    const item = { ...original };
    if (collides(fixed, item)) {
      const above = { ...item, y: Math.max(0, fixed.y - item.h) };
      if (!collides(fixed, above) && !placed.some((other) => collides(other, above))) item.y = above.y;
    }
    while (placed.some((other) => collides(other, item))) item.y += 1;
    placed.push(item);
  }
  return compact(placed);
}

/**
 * Move a panel. A panel dragged toward the right edge shrinks to the columns
 * that remain there (never below its minimum), so a full-width panel can be
 * dropped beside another in one motion instead of needing a resize first. If
 * even its minimum width will not fit, the position is pulled back instead.
 */
export function moveItem(items: GridItem[], id: string, x: number, y: number, limits: GridLimits = {}, cols = DASH_COLS): GridItem[] {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  const wantedX = Math.max(0, Math.round(x));
  const room = cols - wantedX;
  const w = room < current.w ? Math.max(limits.minW ?? 1, room) : current.w;
  const moved = clampItem({ ...current, x: wantedX, y, w }, limits, cols);
  if (moved.x === current.x && moved.y === current.y && moved.w === current.w) return items;
  return settle([moved, ...items.filter((item) => item.id !== id)], id);
}

/** Half the board: the width a dragged panel snaps to. */
export const HALF_COLS = DASH_COLS / 2;

/**
 * The half of the board a carried panel belongs to for a raw column — the
 * unrounded column its left side (where the grip, and so the pointer, sits) is
 * over: the left half while that is left of the middle, else the right.
 */
export const snapToHalf = (x: number, w: number, cols = DASH_COLS) => (x < cols / 2 ? 0 : cols - w);

/**
 * Where a carried panel lands for a raw column, read as where the pointer is
 * over the board: past either edge — half a column beyond the left edge, or
 * within half a column of the right edge and beyond — or over the middle third,
 * it takes the full width; over an outer third it is half width in that half.
 */
export const snapDragColumn = (rawX: number, halfW: number, cols = DASH_COLS): { x: number; w: number; full: boolean } => {
  const third = cols / 3;
  const pastEdge = rawX <= -0.5 || rawX >= cols - 0.5;
  const middle = rawX >= third && rawX < cols - third;
  return pastEdge || middle ? { x: 0, w: cols, full: true } : { x: snapToHalf(rawX, halfW, cols), w: halfW, full: false };
};

/**
 * The row a carried panel counts as "past the bottom" from: the last row the
 * other panels occupy once `id` leaves and the rest pack upward into its space.
 */
export const dragFloor = (items: GridItem[], id: string): number => layoutRows(compact(items.filter((item) => item.id !== id)));

/**
 * Where a carried panel lands for a raw cell. Pushed past the top edge it is
 * half width, in the half the pointer is over, on the first row; pushed past
 * the bottom — its top at or below `floor` — the same on the floor row. Top and
 * bottom win over the column rules, so a panel dragged up or down never flips
 * to full width on the way. Anywhere between, the column rules apply.
 */
export const snapDragCell = (
  rawX: number,
  rawY: number,
  halfW: number,
  floor: number,
  cols = DASH_COLS
): { x: number; y: number; w: number; full: boolean; top: boolean; bottom: boolean } => {
  if (rawY < 0) return { x: snapToHalf(rawX, halfW, cols), y: 0, w: halfW, full: false, top: true, bottom: false };
  if (rawY >= floor) return { x: snapToHalf(rawX, halfW, cols), y: floor, w: halfW, full: false, top: false, bottom: true };
  return { ...snapDragColumn(rawX, halfW, cols), y: rawY, top: false, bottom: false };
};

/** Put a panel at a cell with a given width (a drag lands it at half width), then settle the rest. */
export function placeItem(
  items: GridItem[],
  id: string,
  x: number,
  y: number,
  w: number,
  limits: GridLimits = {},
  cols = DASH_COLS
): GridItem[] {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  const placed = clampItem({ ...current, x, y, w }, limits, cols);
  if (placed.x === current.x && placed.y === current.y && placed.w === current.w) return items;
  return settle([placed, ...items.filter((item) => item.id !== id)], id);
}

export function resizeItem(items: GridItem[], id: string, w: number, h: number, limits: GridLimits = {}, cols = DASH_COLS): GridItem[] {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  // a panel grows from its left edge, so its width is also capped by the room to its right
  const resized = clampItem({ ...current, w: Math.min(w, cols - current.x), h }, limits, cols);
  if (resized.w === current.w && resized.h === current.h) return items;
  return settle([resized, ...items.filter((item) => item.id !== id)], id);
}

/** Rows the layout occupies. */
export const layoutRows = (items: GridItem[]) => items.reduce((rows, item) => Math.max(rows, item.y + item.h), 0);

export const layoutsEqual = (a: GridItem[], b: GridItem[]) => {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.id, item]));
  return a.every((item) => {
    const other = byId.get(item.id);
    return !!other && other.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h;
  });
};

/**
 * Turns whatever was persisted into a valid layout: unknown ids are dropped,
 * numbers are clamped, panels missing from storage are appended below, and the
 * result is compacted so nothing floats.
 */
export function reconcileLayout(
  stored: unknown,
  defaults: GridItem[],
  limitsFor: (id: string) => GridLimits = () => ({}),
  cols = DASH_COLS
): GridItem[] {
  const known = new Map(defaults.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const items: GridItem[] = [];
  if (Array.isArray(stored)) {
    for (const raw of stored) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw as Partial<GridItem>;
      if (typeof candidate.id !== "string" || !known.has(candidate.id) || seen.has(candidate.id)) continue;
      const fallback = known.get(candidate.id)!;
      const numeric = (value: unknown, alt: number) => (typeof value === "number" && Number.isFinite(value) ? value : alt);
      items.push(
        clampItem(
          {
            id: candidate.id,
            x: numeric(candidate.x, fallback.x),
            y: numeric(candidate.y, fallback.y),
            w: numeric(candidate.w, fallback.w),
            h: numeric(candidate.h, fallback.h)
          },
          limitsFor(candidate.id),
          cols
        )
      );
      seen.add(candidate.id);
    }
  }
  // nothing usable stored: the defaults stand exactly as designed, side by side included
  if (items.length === 0) return compact(defaults.map((item) => clampItem(item, limitsFor(item.id), cols)));
  // panels the stored layout does not know about (added since it was saved) go
  // underneath, keeping their default column and width; compaction lifts them
  // into any space that fits
  let bottom = layoutRows(items);
  for (const item of defaults) {
    if (seen.has(item.id)) continue;
    const appended = clampItem({ ...item, y: bottom }, limitsFor(item.id), cols);
    items.push(appended);
    bottom += appended.h;
  }
  return compact(items);
}

/** What the board saves: where every shown panel sits, and which panels the person has hidden. */
export type StoredBoard = { items: unknown; hidden: string[] };

/**
 * Reads a saved board. The current form is `{ items, hidden }`; a board saved
 * before panels could be hidden is a bare array of items. Anything else counts
 * as nothing saved. The items are left for `reconcileLayout` to vet.
 */
export function parseStoredBoard(raw: unknown): StoredBoard | null {
  if (Array.isArray(raw)) return { items: raw, hidden: [] };
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { items?: unknown; hidden?: unknown };
  if (!Array.isArray(candidate.items)) return null;
  const hidden = Array.isArray(candidate.hidden) ? candidate.hidden.filter((id): id is string => typeof id === "string") : [];
  return { items: candidate.items, hidden: Array.from(new Set(hidden)) };
}

/** How many whole cells a pointer travelled. */
export const snapDelta = (px: number, cellPx: number, gap: number) => (cellPx + gap > 0 ? Math.round(px / (cellPx + gap)) : 0);

/** Column width for a board of the given pixel width. */
export const cellSize = (boardWidth: number, cols = DASH_COLS, gap = DASH_GAP) => Math.max(0, (boardWidth - gap * (cols - 1)) / cols);

/** The pixel box for an item. */
export const itemRect = (item: { x: number; y: number; w: number; h: number }, colW: number, unit = DASH_ROW_UNIT, gap = DASH_GAP) => ({
  left: item.x * (colW + gap),
  top: item.y * (unit + gap),
  width: item.w * colW + (item.w - 1) * gap,
  height: item.h * unit + (item.h - 1) * gap
});
