/**
 * THE STATE BEHIND A SECTION'S OWN ORDER, shared by the four boards that have one.
 *
 * ../boardOrder holds the rules; this holds the two pieces of state every board needs and got
 * wrong in the same two ways when the Kanban was written first:
 *
 *   the ORDER   seeded from the person's setting, kept locally between the drop and the save, and
 *               re-seeded only when the SETTING itself changes — a board that reloaded for another
 *               reason (the live feed, a filter) must not undo an arrangement just made.
 *   the HOVER   what the board draws while an item is held over ANOTHER section. dnd-kit's sortable
 *               only opens a gap inside the list the item belongs to, so without this a drag across
 *               sections shows nothing moving aside. It is deliberately null while the item is over
 *               its OWN section: doubling it there would fight the sortable's transforms.
 *
 * What a section is called, and what a drop into another one means, stays with each page.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setUserSetting } from "../api";
import { parseBoardOrder, serializeBoardOrder, type BoardHover, type BoardOrder } from "./boardOrder";

export function useBoardOrder({ settingKey, raw }: { settingKey: string; raw: string | null | undefined }) {
  const [order, setOrder] = useState<BoardOrder>(() => parseBoardOrder(raw));
  const seenRaw = useRef(raw);
  useEffect(() => {
    if (raw === seenRaw.current) return;
    seenRaw.current = raw;
    setOrder(parseBoardOrder(raw));
  }, [raw]);

  const persist = useCallback(
    async (next: BoardOrder) => {
      setOrder(next);
      const value = serializeBoardOrder(next);
      seenRaw.current = value;
      try {
        await setUserSetting(settingKey, value);
      } catch {
        // the arrangement holds for this session; the next drop saves it again
      }
    },
    [settingKey]
  );

  /* THE PREVIEW IS KEPT OUTSIDE REACT STATE, and this is a performance fix, not a style.
     Measured on the Kanban with a synthetic drag (2026-09-18, reported as "when a user moves a job
     it lags a little"): a lap INSIDE one section is clean — no long task, 90th-percentile frame
     17.5ms — while crossing into another section cost long tasks of 52-102ms. Three things were
     ruled out by measuring rather than guessing: a full page layout is 2ms, measuring every
     droppable is 0.1ms, and moving the carried card's node between sections is ~15ms. Holding the
     card still while STILL setting the state left the stalls exactly as they were (55-86ms), so
     what costs the frames is the re-render of the whole page that a `setState` here sets off —
     its hook, its KPI tiles, its alerts, its drawer, none of which care where the card is.

     So the hover lives in a tiny store instead: the page WRITES it and reads it at the drop
     without re-rendering, and only what actually draws the preview subscribes. */
  const listeners = useRef(new Set<() => void>());
  const hoverRef = useRef<BoardHover | null>(null);
  const hoverStore = useRef<HoverStore>({
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    get: () => hoverRef.current
  }).current;
  const setHover = useCallback((next: (current: BoardHover | null) => BoardHover | null) => {
    const value = next(hoverRef.current);
    if (value === hoverRef.current) return;
    hoverRef.current = value;
    for (const listener of listeners.current) listener();
  }, []);
  /**
   * What the page read off a drag-over: the item being carried, the section under it, the item it
   * is over (null for the section's own space) and the section the item's own props say it is in.
   * That last one is only trusted until a preview is up — from then on the preview's `from` is the
   * only thing that still knows where the item started, because the item is being drawn elsewhere.
   */
  const trackHover = useCallback(
    (read: { itemId?: string; section?: string; overId?: string | null; ownSection?: string }) => {
      setHover((current) => {
        const from = current?.from ?? read.ownSection;
        if (!read.itemId || !read.section || !from) return null;
        // the pointer is on the carried item's own slot: it already sits where it would land
        if (read.overId === read.itemId) return current;
        if (read.section === from) return null; // back home, and the sortable has it from here
        const overId = read.overId ?? null;
        const same = current?.itemId === read.itemId && current.section === read.section && current.overId === overId;
        return same ? current : { itemId: read.itemId, section: read.section, overId, from };
      });
    },
    [setHover]
  );
  const clearHover = useCallback(() => setHover(() => null), [setHover]);

  /** What the drop rule reads — no subscription, so asking costs nothing. */
  const readHover = useCallback(() => hoverRef.current, []);
  return { order, persist, hoverStore, readHover, trackHover, clearHover };
}

export type BoardOrderState = ReturnType<typeof useBoardOrder>;
export type { BoardHover, BoardOrder };

/** The preview, for whatever draws it. Subscribing here re-renders that and nothing above it. */
export type HoverStore = { subscribe: (listener: () => void) => () => void; get: () => BoardHover | null };

/**
 * The preview, but only when it concerns THIS section — the one an item is held over, or the one it
 * came from. Every other section reads null before and after, so it does not re-render at all: a
 * crossing then costs two sections instead of a whole board (the Week has 35 cells, the Month 30-odd).
 */
export function useHoverFor(store: HoverStore | undefined, section: string): BoardHover | null {
  const subscribe = useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => undefined), [store]);
  const get = useCallback(() => {
    const hover = store?.get() ?? null;
    return hover && (hover.section === section || hover.from === section) ? hover : null;
  }, [store, section]);
  return useSyncExternalStore(subscribe, get, get);
}

export function useHover(store: HoverStore | undefined): BoardHover | null {
  const subscribe = useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => undefined), [store]);
  const get = useCallback(() => store?.get() ?? null, [store]);
  return useSyncExternalStore(subscribe, get, get);
}
