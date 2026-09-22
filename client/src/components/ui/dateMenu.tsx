/**
 * Every date field's calendar, drawn in the program's own language.
 *
 * WHY THIS EXISTS. The popup behind `<input type="date">` is drawn by the BROWSER,
 * not by the page: no stylesheet can reach it, so every one of the product's eleven
 * date fields opened a gray panel with a system-blue selection — the same problem
 * the `<select>` popup had (selectMenu.tsx), and the last surface in the app that
 * ignored the skin. The only fix is to draw the calendar ourselves.
 *
 * WHY IT IS ONE LAYER. Exactly as with the dropdowns: the native `<input>` stays
 * where it is and remains the value — its name, its form binding, its `onChange`,
 * its typing and its validation all keep working — and this layer paints the
 * calendar and writes the choice back through a real `change` event. Nothing else
 * in the app knows it is here, and no call site changed.
 *
 * HOW THE NATIVE ONE IS SUPPRESSED. Chrome opens its picker from the little
 * calendar glyph at the end of the field. The skin (section 57) makes that glyph
 * INERT (`pointer-events: none`) rather than hiding it, so the affordance stays
 * exactly where people already click, and this layer answers a press in that zone.
 * `Alt+ArrowDown`, the keyboard way into the native picker, opens this one too.
 * Typing into the field is untouched: a press on the date text still lands in the
 * segment it always did.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The field the calendar belongs to, its box in the shell's own (pre-zoom) space, and
 * where the calendar ended up. `placed` is null for the first frame: the panel is
 * measured once it exists and then positioned, because these fields sit everywhere
 * from the top of a dialog to the last row of a drawer.
 */
type Anchor = {
  input: HTMLInputElement;
  left: number;
  below: number;
  above: number;
  placed: { left: number; top: number } | null;
};

/** The last stretch of the field, where the browser draws its calendar glyph. */
const ICON_ZONE = 34;
/** The air between the field and its calendar, matching the other anchored menus. */
const GAP = 6;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The shell carries `zoom: var(--bf-ui-scale)`, and this panel is a portal to
 * `document.body` that the skin zooms the same way (section 57). A rect is in
 * rendered pixels, so it is divided by the zoom to land in the space the panel is
 * laid out in. The same correction the board's drag math uses (dragZoom.ts).
 */
const zoomOf = (element: Element): number => {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
};

/** A date field the layer takes over: inside the program, and open for editing. */
const isEnhanceable = (input: HTMLInputElement): boolean => {
  if (input.type !== "date") return false;
  if (input.disabled || input.readOnly) return false;
  if (input.dataset.bfDateNative === "true") return false;
  return Boolean(input.closest(".app-shell.hs-shell, .pdx, .bf-breeze, .schedule-dialog-backdrop"));
};

/**
 * Dates are handled as their own parts, never through `new Date(value)` or
 * `toISOString()`: both go via UTC, which lands a morning in the previous day for
 * anyone west of Greenwich — the field's value is a plain local calendar day.
 */
const toValue = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const parseValue = (value: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
};

/** Which day of the week a value falls on, built from its parts (never `new Date(value)`). */
const weekdayOf = (value: string | null): number => {
  const parts = value ? parseValue(value) : null;
  if (!parts) return 0;
  return new Date(parts.year, parts.month, parts.day).getDay();
};

const startOfToday = (): { year: number; month: number; day: number } => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
};

type Cell = { year: number; month: number; day: number; outside: boolean; value: string };

/** Six weeks from the Sunday on or before the first, which is the shape every month gets. */
const monthGrid = (year: number, month: number): Cell[] => {
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const cells: Cell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, 1 - lead + index);
    cells.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      outside: date.getMonth() !== month,
      value: toValue(date.getFullYear(), date.getMonth(), date.getDate())
    });
  }
  return cells;
};

export function DateMenuLayer() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /** Which month the calendar is showing, which is not the same as what is chosen. */
  const [view, setView] = useState<{ year: number; month: number }>(() => startOfToday());
  /** The day the arrows are on, so a keyboard can walk the grid the way the native one does. */
  const [active, setActive] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cellsRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const close = useCallback((refocus: boolean) => {
    setAnchor((current) => {
      if (refocus && current) current.input.focus();
      return null;
    });
  }, []);

  const open = useCallback((input: HTMLInputElement) => {
    const chosen = parseValue(input.value);
    const start = chosen ?? startOfToday();
    const rect = input.getBoundingClientRect();
    const zoom = zoomOf(input);
    setView({ year: start.year, month: start.month });
    setActive(toValue(start.year, start.month, start.day));
    setAnchor({
      input,
      left: rect.left / zoom,
      below: rect.bottom / zoom,
      above: rect.top / zoom,
      placed: null
    });
  }, []);

  /**
   * Writing the choice back. React's `onChange` on an input is the native `input`
   * event, so setting the value and dispatching one drives every existing handler
   * exactly as the native picker did. The value goes through the prototype's setter
   * because a controlled input re-renders from state, not from the DOM.
   */
  const commit = useCallback(
    (value: string) => {
      const input = anchor?.input;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close(true);
    },
    [anchor, close]
  );

  // Opening: a press on the field's calendar glyph, and the key the native picker
  // opens on. A press on the date TEXT is left alone, so typing still works.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      const input = target.closest("input");
      if (!(input instanceof HTMLInputElement) || !isEnhanceable(input)) {
        if (anchor) close(false);
        return;
      }
      const rect = input.getBoundingClientRect();
      const inIconZone = event.clientX >= rect.right - ICON_ZONE * zoomOf(input);
      if (!inIconZone) {
        if (anchor) close(false);
        return;
      }
      event.preventDefault();
      if (anchor?.input === input) close(true);
      else open(input);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      /* Escape belongs to the TOPMOST layer. This panel is a portal to the body, so the
         dialog or drawer holding the field sees the same keypress and would close itself
         behind the calendar — measured: one Escape closed both. Taken here, in the capture
         phase on window (which runs before any document-level listener) and stopped, so
         the first Escape dismisses the calendar and the second reaches the dialog. */
      if (anchor && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !isEnhanceable(target)) return;
      if (!(event.altKey && event.key === "ArrowDown")) return;
      event.preventDefault();
      open(target);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, close, open]);

  // Anything that moves the field from under the panel closes it, rather than leaving
  // the calendar pointing at nothing. The observer is the case scrolling and resizing
  // miss: closing a dialog unmounts the field, and the panel would otherwise stay on
  // screen anchored to a removed element.
  useEffect(() => {
    if (!anchor) return;
    const dismiss = () => close(false);
    const watchRemoval = new MutationObserver(() => {
      if (!anchor.input.isConnected) close(false);
    });
    watchRemoval.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      watchRemoval.disconnect();
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [anchor, close]);

  /**
   * One measuring pass, before the panel is shown. It goes beneath the field when it
   * fits, above it when it does not, and is then pulled inside the window on both axes
   * — so a date field in the last row of a drawer opens upward rather than off screen.
   */
  useEffect(() => {
    if (!anchor || anchor.placed) return;
    const panel = panelRef.current;
    if (!panel) return;
    const zoom = zoomOf(panel) || 1;
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const viewportH = window.innerHeight / zoom;
    const viewportW = window.innerWidth / zoom;
    const margin = 8;
    const fitsBelow = anchor.below + GAP + height <= viewportH - margin;
    let top = fitsBelow ? anchor.below + GAP : anchor.above - GAP - height;
    let left = anchor.left;
    if (top + height > viewportH - margin) top = viewportH - margin - height;
    if (top < margin) top = margin;
    if (left + width > viewportW - margin) left = viewportW - margin - width;
    if (left < margin) left = margin;
    setAnchor({ ...anchor, placed: { left, top } });
  }, [anchor]);

  // The panel takes focus so the arrows reach it, the way the native calendar does.
  useEffect(() => {
    if (!anchor?.placed || !active) return;
    cellsRef.current.get(active)?.focus();
  }, [anchor, active]);

  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);
  const today = useMemo(() => startOfToday(), []);

  if (!anchor) return null;

  const chosen = parseValue(anchor.input.value);
  const chosenValue = chosen ? toValue(chosen.year, chosen.month, chosen.day) : null;
  const todayValue = toValue(today.year, today.month, today.day);
  const min = anchor.input.min || null;
  const max = anchor.input.max || null;
  const outOfRange = (value: string): boolean => Boolean((min && value < min) || (max && value > max));

  const stepMonth = (by: number) => {
    const next = new Date(view.year, view.month + by, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  /** Walk the grid by days or months, bringing the month into view with the cursor. */
  const moveActive = (byDays: number, byMonths = 0) => {
    const from = active ? parseValue(active) : null;
    const base = from ?? { year: view.year, month: view.month, day: 1 };
    const next = new Date(base.year, base.month + byMonths, base.day + byDays);
    setView({ year: next.getFullYear(), month: next.getMonth() });
    setActive(toValue(next.getFullYear(), next.getMonth(), next.getDate()));
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveActive(-1),
      ArrowRight: () => moveActive(1),
      ArrowUp: () => moveActive(-7),
      ArrowDown: () => moveActive(7),
      PageUp: () => moveActive(0, -1),
      PageDown: () => moveActive(0, 1),
      Home: () => moveActive(-weekdayOf(active)),
      End: () => moveActive(6 - weekdayOf(active))
    };
    const move = keys[event.key];
    if (move) {
      event.preventDefault();
      move();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (active && !outOfRange(active)) commit(active);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return createPortal(
    <div className="bfdate" role="presentation" onPointerDown={(event) => event.stopPropagation()}>
      <div
        ref={panelRef}
        className="bfdate-panel"
        role="dialog"
        aria-label={`Choose a date${anchor.input.getAttribute("aria-label") ? ` for ${anchor.input.getAttribute("aria-label")}` : ""}`}
        onKeyDown={onPanelKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false);
        }}
        /* the entrance waits for the placement, so its first frame is one somebody sees
           (skin section 64, and the same mark on the dropdown list) */
        data-bfdate-ready={anchor.placed ? "true" : undefined}
        style={{
          left: `${anchor.placed ? anchor.placed.left : anchor.left}px`,
          top: `${anchor.placed ? anchor.placed.top : anchor.below + GAP}px`,

          visibility: anchor.placed ? undefined : "hidden"
        }}
      >
        <header className="bfdate-head">
          <button type="button" className="bfdate-step" aria-label="Previous month" onClick={() => stepMonth(-1)}>
            <ChevronLeft size={15} />
          </button>
          <strong className="bfdate-month" aria-live="polite">
            {MONTHS[view.month]} {view.year}
          </strong>
          <button type="button" className="bfdate-step" aria-label="Next month" onClick={() => stepMonth(1)}>
            <ChevronRight size={15} />
          </button>
        </header>
        <div className="bfdate-grid" role="grid" aria-label={`${MONTHS[view.month]} ${view.year}`}>
          <div className="bfdate-week bfdate-names" role="row">
            {WEEKDAYS.map((day, index) => (
              <span key={index} role="columnheader" aria-label={day}>
                {day}
              </span>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((week) => (
            <div className="bfdate-week" role="row" key={week}>
              {cells.slice(week * 7, week * 7 + 7).map((cell) => {
                const isChosen = cell.value === chosenValue;
                const blocked = outOfRange(cell.value);
                return (
                  <button
                    key={cell.value}
                    ref={(node) => {
                      cellsRef.current.set(cell.value, node);
                    }}
                    type="button"
                    className={`bfdate-day${cell.outside ? " is-outside" : ""}${isChosen ? " is-chosen" : ""}${
                      cell.value === todayValue ? " is-today" : ""
                    }`}
                    role="gridcell"
                    aria-selected={isChosen}
                    aria-label={`${MONTHS[cell.month]} ${cell.day}, ${cell.year}`}
                    disabled={blocked}
                    tabIndex={cell.value === active ? 0 : -1}
                    onClick={() => commit(cell.value)}
                    onPointerEnter={() => setActive(cell.value)}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="bfdate-foot">
          <button type="button" className="bfdate-action" onClick={() => commit("")}>
            Clear
          </button>
          <button type="button" className="bfdate-action" onClick={() => commit(todayValue)}>
            Today
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
