/**
 * "Take me to the thing that needs attention."
 *
 * A notification names a record; clicking it has to leave that record under the reader's eye
 * on the page that owns it. Four pages — Materials, Equipment, Field updates and DelayIQs —
 * are the same HubSpot-style index: a saved-view tab, three filters, a search box, a sort and
 * 25 rows to a page. Any one of those can be the reason the record is not on screen, so
 * "navigate to the page" is not enough on its own. This does the rest of it.
 *
 * THE PART WORTH READING. The pagination page is *not* computed from the record. It is read
 * back out of `rows` — the filtered, sorted list the table actually draws — after the filter
 * reset has applied. Working it out any other way means re-implementing each page's sort
 * comparator here, and those four comparators drift: Materials sorts by delivery date,
 * Equipment by name, DelayIQs by severity. Asking the render pipeline where the row landed
 * cannot drift, because it is the same list the table renders.
 *
 * The flash is returned as an id rather than applied with `classList.add`, because every one
 * of those rows has a React-managed `className` (`is-selected` for the checkbox) that would
 * wipe an imperatively added class on the next render.
 */
import { useEffect, useState } from "react";

/** A record to put on screen. The nonce is what makes clicking the same notification twice work. */
export type RecordFocusRequest = { id: string; nonce: number } | null;

/** How long the row stays lit. Long enough to find with your eye, short enough not to nag. */
const FLASH_MS = 2400;

/** Someone who has asked for less motion gets the jump, not the glide. */
const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export function useRecordFocus(
  request: RecordFocusRequest,
  /** The ids of the filtered + sorted list the table draws from, in draw order. */
  ids: string[],
  perPage: number,
  setIndexPage: (page: number) => void,
  /** Clears the saved view, the filters and the search — anything that could hide the row. */
  resetFilters: () => void
): string | null {
  // the record being hunted, and the one currently lit
  const [wanted, setWanted] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const nonce = request?.nonce ?? 0;
  const wantedId = request?.id ?? null;

  /* A new request: drop every filter, then start looking. Keyed on the nonce alone so that
     asking for the SAME record again still re-runs — which is what a second click is. */
  useEffect(() => {
    if (!nonce || !wantedId) return;
    resetFilters();
    setWanted(wantedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the request IS the trigger
  }, [nonce, wantedId]);

  /* Where did it land? `ids` is a fresh array every render, so this re-checks as the reset
     settles, and gives up the moment the record turns out not to exist any more. */
  useEffect(() => {
    if (!wanted) return undefined;
    const index = ids.indexOf(wanted);
    if (index < 0) {
      setWanted(null);
      return undefined;
    }
    setIndexPage(Math.floor(index / perPage) + 1);
    /* The row only exists in the DOM once that pagination page has been drawn, so look after
       the paint. Until it is there this simply re-schedules on the next render. */
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-bf-focus="${CSS.escape(wanted)}"]`);
      if (!row) return;
      setWanted(null);
      setFlash(wanted);
      /* Optional call: jsdom does not implement scrollIntoView, and the highlight — not the
         scroll — is what actually says "this one", so a host without it still works. */
      row.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setIndexPage/resetFilters are re-made every render
  }, [wanted, ids, perPage]);

  useEffect(() => {
    if (!flash) return undefined;
    const done = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(done);
  }, [flash]);

  return flash;
}

/**
 * The same landing for a Dashboard panel.
 *
 * Weather alerts and inspections are read on the Dashboard rather than on a page of their own,
 * so "take me to it" means that panel. Simpler than a row: nothing can filter a panel out and
 * there is no pagination, so this only has to scroll and light it. The panel element is already
 * addressable — `DashSection` has carried `data-dash-drag-id` since the board became draggable.
 */
export function usePanelFocus(request: { id: string; nonce: number } | null): string | null {
  const [lit, setLit] = useState<string | null>(null);
  const nonce = request?.nonce ?? 0;
  const id = request?.id ?? null;

  useEffect(() => {
    if (!nonce || !id) return undefined;
    setLit(id);
    /* One frame, so a board that is only now laying out has put the panel somewhere first. */
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-dash-drag-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
    const done = window.setTimeout(() => setLit(null), FLASH_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the nonce IS the trigger
  }, [nonce]);

  return lit;
}
