/**
 * Every time field's list, drawn as the program's own dropdown.
 *
 * WHY THIS EXISTS. The popup behind `<input type="time">` is drawn by the BROWSER, so no
 * stylesheet can reach it: TimeCard's Time in and Time out opened Chrome's dark hour, minute
 * and AM/PM columns with a system-blue selection, beside a Project and a Break dropdown that
 * open the program's white list. Asked 2026-09-27: "make the drop down look the same to all
 * other dropdowns". The only fix is to draw it ourselves — the third of these layers, after
 * the dropdown list (selectMenu.tsx) and the calendar (dateMenu.tsx).
 *
 * IT IS THE DROPDOWN LIST, NOT A LOOK-ALIKE. The portal is a `.bfsel` and its rows are
 * `.bfsel-item`s, so it wears skin section 53 and opens with section 64's gooey entrance out
 * of its own field — the same card, rows, check and motion as every other dropdown, and it
 * cannot drift from them. `.bftime` only adds what a list of times needs (aligned digits).
 * Being a `.bfsel` also puts it in OWN_POPUPS, so a panel that dismisses on an outside press
 * already treats a press in this list as inside.
 *
 * ONE LAYER, SAME CONTRACT as the other two: the native `<input>` stays where it is and
 * remains the value — its name, its `onChange`, its validation — and the choice is written
 * back through a real `input` + `change`. Typing is untouched: only a press on the clock
 * glyph at the end of the field opens the list (skin section 57 makes that glyph inert, which
 * is what stops the browser's picker), and a press on the digits still lands in the segment
 * it always did. `Alt+ArrowDown`, the keyboard way into the native picker, opens this one.
 *
 * THE ROWS are the day in steps of the field's `step` (15 minutes when it has none), inside
 * its `min`/`max`. A time that is not on that grid — typed, or set by "Clock in now" — still
 * gets its own row, checked, so the list never hides what the field says.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/** The field, its box in the shell's own (pre-zoom) space, and where the list ended up. */
type Anchor = {
  input: HTMLInputElement;
  left: number;
  below: number;
  above: number;
  width: number;
  placed: { left: number; top: number; above: boolean; goo: Goo } | null;
  zoom: number;
};

/** Where the gooey entrance starts: on the field's own box (see selectMenu.tsx `gooFrom`). */
type Goo = { dx: number; y: number; x: number; h: number };

type Row = { value: string; label: string };

/** The last stretch of the field, where the browser draws its clock glyph. */
const ICON_ZONE = 34;
/** The air between the field and its list, matching the other anchored menus. */
const GAP = 6;
const DAY_MINUTES = 24 * 60;
const DEFAULT_STEP = 15;

/** The same scope the calendar and the dropdown enhance; section 57's inert glyph uses it too. */
const SURFACES = ".app-shell.hs-shell, .pdx, .bf-breeze, .schedule-dialog-backdrop";

const zoomOf = (element: Element): number => {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
};

/** A time field the layer takes over: inside the program, and open for editing. */
const isEnhanceable = (input: HTMLInputElement): boolean => {
  if (input.type !== "time") return false;
  if (input.disabled || input.readOnly) return false;
  if (input.dataset.bfTimeNative === "true") return false;
  return Boolean(input.closest(SURFACES));
};

/** "HH:MM" (seconds, if any, are ignored) to minutes after midnight. */
const toMinutes = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const toValue = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** 9:00 AM — how the program writes a time everywhere else. */
const labelOf = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

/** The field's `step` in whole minutes when it divides the day, else every quarter hour. */
const stepOf = (input: HTMLInputElement): number => {
  const seconds = Number(input.getAttribute("step"));
  if (!Number.isFinite(seconds) || seconds < 60 || seconds % 60 !== 0) return DEFAULT_STEP;
  const minutes = seconds / 60;
  return DAY_MINUTES % minutes === 0 ? minutes : DEFAULT_STEP;
};

const rowsFor = (input: HTMLInputElement): Row[] => {
  const step = stepOf(input);
  const min = toMinutes(input.min) ?? 0;
  const max = toMinutes(input.max) ?? DAY_MINUTES - 1;
  const minutes: number[] = [];
  for (let at = 0; at < DAY_MINUTES; at += step) if (at >= min && at <= max) minutes.push(at);
  const current = toMinutes(input.value);
  if (current !== null && !minutes.includes(current)) {
    minutes.push(current);
    minutes.sort((a, b) => a - b);
  }
  return minutes.map((at) => ({ value: toValue(at), label: labelOf(at) }));
};

/** The row the list opens on: the field's own time, or the one nearest now when it is empty. */
const startIndex = (rows: Row[], value: string): number => {
  const chosen = rows.findIndex((row) => row.value === value);
  if (chosen >= 0) return chosen;
  const now = new Date();
  const target = now.getHours() * 60 + now.getMinutes();
  let best = 0;
  rows.forEach((row, index) => {
    if (Math.abs((toMinutes(row.value) ?? 0) - target) < Math.abs((toMinutes(rows[best].value) ?? 0) - target)) best = index;
  });
  return best;
};

/** The field is named by its `aria-label` or its `<label>` — TimeCard's are the second kind. */
const nameOf = (input: HTMLInputElement): string | undefined =>
  input.getAttribute("aria-label") ?? (input.labels?.[0]?.textContent?.trim() || undefined);

export function TimeMenuLayer() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((refocus: boolean) => {
    setAnchor((current) => {
      if (refocus && current) current.input.focus();
      return null;
    });
  }, []);

  const open = useCallback((input: HTMLInputElement) => {
    const list = rowsFor(input);
    if (list.length === 0) return;
    const rect = input.getBoundingClientRect();
    const zoom = zoomOf(input);
    setRows(list);
    setActive(startIndex(list, input.value));
    setAnchor({
      input,
      left: rect.left / zoom,
      below: rect.bottom / zoom,
      above: rect.top / zoom,
      width: rect.width / zoom,
      placed: null,
      zoom
    });
  }, []);

  /**
   * Writing the choice back. React's `onChange` on an input is the native `input` event, so
   * setting the value and dispatching one drives the field's handler exactly as the browser's
   * picker did. The prototype's setter, because a controlled input re-renders from state.
   */
  const choose = useCallback(
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

  // Opening: a press on the clock glyph, and the key the native picker opens on. A press on
  // the digits is left alone, so typing a time still works.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menuRef.current?.contains(target)) return;
      const input = target.closest("input");
      if (!(input instanceof HTMLInputElement) || !isEnhanceable(input)) {
        if (anchor) close(false);
        return;
      }
      const rect = input.getBoundingClientRect();
      if (event.clientX < rect.right - ICON_ZONE * zoomOf(input)) {
        if (anchor) close(false);
        return;
      }
      event.preventDefault();
      if (anchor?.input === input) close(true);
      else open(input);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape belongs to the topmost layer — taken in the capture phase on window and
      // stopped, so a dialog holding the field does not close behind the list (dateMenu.tsx).
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

  // Anything that moves the field from under the list closes it — except the list's OWN
  // scrolling. A day of quarter hours is 96 rows, so this list always scrolls, and a scroll
  // listener in the capture phase on window hears a scroll inside it too.
  useEffect(() => {
    if (!anchor) return;
    const dismiss = () => close(false);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      close(false);
    };
    const watchRemoval = new MutationObserver(() => {
      if (!anchor.input.isConnected) close(false);
    });
    watchRemoval.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      watchRemoval.disconnect();
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, close]);

  // One measuring pass before it is shown: beneath the field when it fits, above when it does
  // not, pulled inside the window — the dropdown list's placement, line for line.
  useEffect(() => {
    if (!anchor || anchor.placed) return;
    const menu = menuRef.current;
    if (!menu) return;
    const zoom = zoomOf(menu) || 1;
    const height = menu.offsetHeight;
    const width = menu.offsetWidth;
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
    const above = !fitsBelow;
    const goo: Goo = {
      dx: anchor.left - left,
      y: above ? anchor.below - (top + height) : anchor.above - top,
      x: width > 0 ? Math.min(1, anchor.width / width) : 1,
      h: height > 0 ? Math.min(1, (anchor.below - anchor.above) / height) : 0.2
    };
    // the time it opens on sits in the middle of the list, not at its bottom edge
    const row = rowsRef.current[active];
    if (row) menu.scrollTop = Math.max(0, row.offsetTop - (menu.clientHeight - row.offsetHeight) / 2);
    setAnchor({ ...anchor, placed: { left, top, above, goo } });
  }, [anchor, active]);

  // The list takes focus so the arrows reach it, and follows the arrows by scrolling ITSELF —
  // never `scrollIntoView`, which may scroll the page too, and a page scroll closes the list.
  useEffect(() => {
    if (!anchor?.placed) return;
    const menu = menuRef.current;
    const row = rowsRef.current[active];
    if (!menu || !row) return;
    row.focus({ preventScroll: true });
    const pad = 8;
    if (row.offsetTop < menu.scrollTop + pad) menu.scrollTop = row.offsetTop - pad;
    else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight - pad)
      menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight + pad;
  }, [anchor, active]);

  if (!anchor) return null;

  const chosen = anchor.input.value.slice(0, 5);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moveTo = (index: number) => {
      event.preventDefault();
      setActive(Math.min(rows.length - 1, Math.max(0, index)));
    };
    if (event.key === "ArrowDown") moveTo(active + 1);
    else if (event.key === "ArrowUp") moveTo(active - 1);
    else if (event.key === "PageDown") moveTo(active + 4);
    else if (event.key === "PageUp") moveTo(active - 4);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(rows.length - 1);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const row = rows[active];
      if (row) choose(row.value);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return createPortal(
    <div
      className="bfsel bftime"
      role="presentation"
      style={{ "--bf-ui-scale": String(anchor.zoom) } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={menuRef}
        className="bfsel-menu"
        role="listbox"
        aria-label={nameOf(anchor.input)}
        tabIndex={-1}
        onKeyDown={onMenuKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false);
        }}
        data-bfsel-above={anchor.placed?.above ? "true" : undefined}
        // the entrance waits for the placement, like the dropdown list's (skin section 64)
        data-bfsel-ready={anchor.placed ? "true" : undefined}
        style={
          {
            left: `${anchor.placed ? anchor.placed.left : anchor.left}px`,
            top: `${anchor.placed ? anchor.placed.top : anchor.below + GAP}px`,
            minWidth: `${anchor.width}px`,
            visibility: anchor.placed ? undefined : "hidden",
            ...(anchor.placed && {
              "--bf-goo-dx": `${anchor.placed.goo.dx}px`,
              "--bf-goo-y": `${anchor.placed.goo.y}px`,
              "--bf-goo-x": anchor.placed.goo.x,
              "--bf-goo-h": anchor.placed.goo.h
            })
          } as CSSProperties
        }
      >
        {rows.map((row, index) => (
          <button
            key={row.value}
            ref={(node) => {
              rowsRef.current[index] = node;
            }}
            type="button"
            className="bfsel-item"
            role="option"
            aria-selected={row.value === chosen}
            tabIndex={index === active ? 0 : -1}
            onClick={() => choose(row.value)}
            onPointerEnter={() => setActive(index)}
          >
            <span className="bfsel-mark" aria-hidden="true">
              {row.value === chosen && <Check size={14} />}
            </span>
            <span className="bfsel-label">{row.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
