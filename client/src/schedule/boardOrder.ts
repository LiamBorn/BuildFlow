/**
 * A SECTION'S OWN ORDER, for every board in the Schedule that holds jobs in sections.
 *
 * The Kanban got this first (2026-09-17): a lane stopped being a bucket and became a list a
 * planner arranges — carry a card between two others and it goes there, the rest moving aside.
 * Asked for on the other pages straight after ("add the same animation the Kanban has ... and when
 * a job gets in a specific section it's able to move other jobs around depending on where the user
 * wants to put that job"), so the rules moved here and the four boards share them:
 *
 *   Kanban  a section is a STATUS LANE   and an item is a job
 *   Week    a section is a CREW-DAY CELL and an item is a booking
 *   Month   a section is a DAY           and an item is a job's chip
 *   List    a section is a DAY           and an item is a booking's row
 *
 * Everything here is pure, so each board's rules can be asked without a board. What the sections
 * are called, and what a drop into ANOTHER section means, stays with each page — that part is the
 * page's own (a lane drop writes a status, a cell drop re-books a crew, a day drop moves dates).
 */

/** Ids per section, front first. */
export type BoardOrder = Record<string, string[]>;

/**
 * A card held over ANOTHER section: which item, where it is held, and what it is over. `from` is
 * the section it was picked up in — an item's own section prop follows the preview, so by the drop
 * nothing else remembers where it started.
 */
export type BoardHover = { itemId: string; section: string; overId: string | null; from: string };

/**
 * Capped: the setting holds 8,000 characters (the server's limit) and an id is about thirty, so
 * forty a section across a handful of sections leaves room to spare. Past that the tail of a very
 * long section keeps the board's own order, which is where an untouched item sits anyway.
 */
export const MAX_GROUP_ORDER = 40;

/** The stored JSON, read leniently: a broken section is dropped, never the whole arrangement. */
export function parseBoardOrder(raw: string | null | undefined): BoardOrder {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BoardOrder = {};
    for (const [section, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      const clean = ids.filter((id): id is string => typeof id === "string").slice(0, MAX_GROUP_ORDER);
      if (clean.length > 0) out[section] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

/** What the setting stores: empty sections dropped, each section capped. */
export function serializeBoardOrder(order: BoardOrder): string {
  const out: BoardOrder = {};
  for (const [section, ids] of Object.entries(order)) {
    const clean = ids.slice(0, MAX_GROUP_ORDER);
    if (clean.length > 0) out[section] = clean;
  }
  return JSON.stringify(out);
}

/**
 * A section's items in the order it shows them: the ones the planner has placed, in that order,
 * then everything else in the board's own order. An item nobody has moved therefore keeps its
 * place, and one that arrives later joins the end rather than pushing anything about.
 */
export function orderGroupItems<T>(items: T[], ids: string[] | undefined, idOf: (item: T) => string): T[] {
  if (!ids || ids.length === 0) return items;
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const placed = ids.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    byId.delete(id);
    return [item];
  });
  return [...placed, ...items.filter((item) => byId.has(idOf(item)))];
}

/**
 * An item dropped on another in the SAME section: it takes that one's place and the rest close up
 * behind it — the list as dnd-kit's own sortable preview showed it while the hand was moving.
 * `over` null (the section's own space, past the items) sends it to the end.
 */
export function moveInGroup(displayed: string[], activeId: string, overId: string | null): string[] {
  const from = displayed.indexOf(activeId);
  if (from < 0) return displayed;
  const to = overId ? displayed.indexOf(overId) : displayed.length - 1;
  if (to < 0 || to === from) return displayed;
  const next = displayed.filter((id) => id !== activeId);
  next.splice(to, 0, activeId);
  return next;
}

/** An item arriving from ANOTHER section: it lands where it was dropped, or at the end. */
export function insertInGroup(displayed: string[], activeId: string, overId: string | null): string[] {
  const without = displayed.filter((id) => id !== activeId);
  const at = overId ? without.indexOf(overId) : -1;
  if (at < 0) return [...without, activeId];
  return [...without.slice(0, at), activeId, ...without.slice(at)];
}

/**
 * A section's items with the carried one among them, at the place `overId` puts it (the end when
 * it is null). The carried item comes in whole because it is not one of this section's own — it
 * belongs to the section it came from until the drop is written.
 */
export function placeInGroup<T>(items: T[], carried: T, overId: string | null, idOf: (item: T) => string): T[] {
  const byId = new Map([...items, carried].map((item) => [idOf(item), item]));
  return insertInGroup(
    items.map((item) => idOf(item)),
    idOf(carried),
    overId
  ).flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
