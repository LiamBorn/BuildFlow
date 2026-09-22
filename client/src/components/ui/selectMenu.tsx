/**
 * Every dropdown in the program, drawn in the program's own language.
 *
 * WHY THIS EXISTS. A `<select>`'s popup list is drawn by the operating system, not
 * by the page: no stylesheet can reach it, so on macOS every one of the product's
 * ninety dropdowns opened a gray panel with a system-blue highlight — the one
 * surface in the app that ignored the skin entirely. The only fix is to draw the
 * list ourselves.
 *
 * WHY IT IS ONE LAYER AND NOT NINETY CALL SITES. Eighty-one of those selects live
 * in App.tsx. Replacing each with a component would be a very large diff in a file
 * more than one person edits, and every existing `onChange` would have to be
 * re-checked. So this is an enhancement laid OVER the native control instead: the
 * `<select>` stays exactly where it is and remains the source of truth — it keeps
 * its name, its value, its form binding and its `onChange` — and this layer paints
 * the list and writes the choice back through a real `change` event. Nothing else
 * in the app knows it is here, and the 77 tests that drive a select with
 * `fireEvent.change` are untouched.
 *
 * SCOPE. Only selects inside the app shell and its three portals are enhanced — and,
 * since 2026-09-22, the signup and sign-in screens (`.onb`), which moved onto the
 * program's own language that day and so stopped being the reason to keep the system
 * panel ("change the dropdown to match the design", about the invite step's access
 * level). The marketing pages still keep the native control.
 *
 * KEYBOARD. Pointer and keyboard open the SAME list, because a keyboard user
 * pressing Space on a select would otherwise be the one person still seeing the
 * system panel. The menu takes focus, moves on the arrows, chooses on Enter, closes
 * on Escape and returns focus to the select, which is what the native control does.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * The control the list belongs to, its box in the shell's own (pre-zoom) space — see
 * below — and where the list ended up. `placed` is null for the first frame: the list
 * is measured once it exists and then positioned, because whether it fits beneath the
 * control depends on its real height, and these ninety selects sit everywhere from a
 * page header to the last row of a table.
 */
type Anchor = {
  select: HTMLSelectElement;
  left: number;
  below: number;
  above: number;
  width: number;
  placed: { left: number; top: number; above: boolean; goo: Goo } | null;
  /** The control's effective zoom — the list is laid out in it (see `zoomOf`). */
  zoom: number;
  /**
   * How it was opened, which decides whether handing focus back should show a focus
   * ring. `select.focus()` is PROGRAMMATIC, and Chrome treats programmatic focus on a
   * control that takes keyboard input as focus-visible — so after a mouse choice the
   * control lit up with a ring it never had before the click. A pointer-opened list
   * marks the control quiet for that one focus; the skin (section 55) reads the mark.
   */
  openedWith: "pointer" | "keyboard";
};

type Choice = { value: string; label: string; disabled: boolean };

/**
 * THE LIST TAKES ITS CONTROL'S ZOOM. The shell carries `zoom: var(--bf-ui-scale)`, and
 * this list is a portal to `document.body` that the skin zooms by the same property
 * (section 53). A rect is in rendered pixels, so it is divided by the control's zoom to
 * land in the space the list is laid out in — the correction the board's drag math uses
 * (dragZoom.ts) — which is only right if the list is zoomed exactly as its control is.
 *
 * Inside the shell that held by coincidence: both were `--bf-ui-scale`. The signup
 * screens broke it (2026-09-22) — they are not zoomed, but the property still sits on
 * <body> at the person's scale, so the list opened 10% small and 10% short of its
 * control. So the portal now carries the control's own zoom in that property: the same
 * value as before everywhere inside the shell, and 1 wherever the control is unzoomed.
 */
const zoomOf = (element: Element): number => {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
};

/**
 * WHERE THE LIST COMES OUT OF. The list's entrance is the program's gooey one (skin
 * section 64): it starts on the control's own box — same place, same width, the control
 * radius — and grows into the panel, blurred, so the two never show a seam between them.
 * The keyframes are written in five custom properties and these are the four that
 * depend on the two real boxes, which only this layer knows:
 *
 *   dx, y  how far the panel has to move to sit on the control
 *   x, h   the fraction of its own width and height it starts at
 *
 * A list that opened UPWARD grows from its bottom edge instead (the skin turns the
 * origin over for it), so `y` is measured from that edge.
 */
type Goo = { dx: number; y: number; x: number; h: number };

const gooFrom = (anchor: Anchor, box: { left: number; top: number; width: number; height: number }, above: boolean): Goo => ({
  dx: anchor.left - box.left,
  y: above ? anchor.below - (box.top + box.height) : anchor.above - box.top,
  // a control is never taller than its own list, and a list is never narrower than it
  x: box.width > 0 ? Math.min(1, anchor.width / box.width) : 1,
  h: box.height > 0 ? Math.min(1, (anchor.below - anchor.above) / box.height) : 0.2
});

/**
 * The popup layers this file and dateMenu.tsx draw into the BODY, for controls that live
 * inside a panel somewhere else in the tree.
 *
 * A panel that dismisses itself on an outside `mousedown` has to treat a click in one of these
 * as INSIDE, because it belongs to a control the panel owns. Preferences did not, and the order
 * of events made the colour picker look broken: `mousedown` on an option unmounted the panel and
 * the `<select>` with it, and the write-back on the following `click` then dispatched `change` at
 * a detached node, so React never saw the choice. Reported 2026-09-18 with a recording — the
 * dropdown opened, an option was clicked, and everything closed with nothing changed.
 */
export const OWN_POPUPS = ".bfsel, .bfdate";

/** Whether an event landed in one of those popups, for a panel deciding if it should close. */
export const isInOwnPopup = (target: EventTarget | null): boolean => {
  const node = target instanceof Element ? target : ((target as Node | null)?.parentElement ?? null);
  return Boolean(node?.closest(OWN_POPUPS));
};

/**
 * The list is named after its control, however the control is named: an `aria-label`, or a
 * `<label for>` — the signup screens label their selects the second way, and a list that only
 * read the first opened nameless there (2026-09-22), which a screen reader announces as just
 * "list box".
 */
const nameOf = (select: HTMLSelectElement): string | undefined =>
  select.getAttribute("aria-label") ?? (select.labels?.[0]?.textContent?.trim() || undefined);

/** A select the layer takes over: inside the program, and a plain single-choice list. */
const isEnhanceable = (select: HTMLSelectElement): boolean => {
  if (select.disabled || select.multiple || select.size > 1) return false;
  if (select.dataset.bfSelectNative === "true") return false;
  return Boolean(select.closest(".app-shell.hs-shell, .pdx, .hs-record-layer, .bf-breeze, .schedule-dialog-backdrop, .onb"));
};

const choicesOf = (select: HTMLSelectElement): Choice[] =>
  Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.label || option.textContent?.trim() || option.value,
    disabled: option.disabled
  }));

/** The air between the control and its list, matching the other anchored menus. */
const GAP = 6;

export function SelectMenuLayer() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [active, setActive] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);

  /** One pointer-driven focus that should not paint a ring; cleared on the next real interaction. */
  const focusQuietly = (select: HTMLSelectElement) => {
    select.dataset.bfselQuiet = "true";
    const clear = () => {
      delete select.dataset.bfselQuiet;
      select.removeEventListener("blur", clear);
      select.removeEventListener("keydown", clear);
    };
    select.addEventListener("blur", clear);
    select.addEventListener("keydown", clear);
    select.focus();
  };

  const close = useCallback((refocus: boolean) => {
    setAnchor((current) => {
      if (refocus && current) {
        if (current.openedWith === "pointer") focusQuietly(current.select);
        else current.select.focus();
      }
      return null;
    });
  }, []);

  const open = useCallback((select: HTMLSelectElement, openedWith: "pointer" | "keyboard") => {
    const list = choicesOf(select);
    if (list.length === 0) return;
    const rect = select.getBoundingClientRect();
    const zoom = zoomOf(select);
    setChoices(list);
    setActive(Math.max(0, select.selectedIndex));
    setAnchor({
      select,
      left: rect.left / zoom,
      below: rect.bottom / zoom,
      above: rect.top / zoom,
      width: rect.width / zoom,
      placed: null,
      zoom,
      openedWith
    });
  }, []);

  /**
   * Writing the choice back. React's `onChange` on a select is the native `change`
   * event, so setting the value and dispatching one drives every existing handler
   * exactly as the native popup did. The value goes through the prototype's setter
   * because a controlled select re-renders from state, not from the DOM.
   */
  const choose = useCallback(
    (value: string) => {
      const select = anchor?.select;
      if (!select) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (setter) setter.call(select, value);
      else select.value = value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      close(true);
    },
    [anchor, close]
  );

  // Opening: a pointer press on the control, captured before the browser can raise
  // the system panel, and the keys the native control opens on.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menuRef.current?.contains(target)) return;
      const select = target.closest("select");
      if (!(select instanceof HTMLSelectElement) || !isEnhanceable(select)) {
        if (anchor) close(false);
        return;
      }
      // preventDefault is what suppresses the system popup
      event.preventDefault();
      if (anchor?.select === select) close(true);
      else open(select, "pointer");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      /* Escape belongs to the TOPMOST layer. This list is a portal to the body, so the
         dialog or drawer holding the control sees the same keypress and would close itself
         behind the list — measured: one Escape closed both. Taken here, in the capture
         phase on window (which runs before any document-level listener) and stopped, so
         the first Escape dismisses the list and the second reaches the dialog. */
      if (anchor && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !isEnhanceable(target)) return;
      if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      open(target, "keyboard");
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, close, open]);

  // Anything that moves the control from under the list closes it, rather than
  // leaving the list pointing at nothing. The observer is the case scrolling and
  // resizing miss: opening a dropdown and then changing page unmounts the control,
  // and the list would otherwise stay on screen anchored to a removed element.
  useEffect(() => {
    if (!anchor) return;
    const dismiss = () => close(false);
    const watchRemoval = new MutationObserver(() => {
      if (!anchor.select.isConnected) close(false);
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
   * One measuring pass, before the list is shown. It goes beneath the control when it
   * fits, above it when it does not, and is then pulled inside the window on both axes
   * — so a dropdown in the last row of a table opens upward rather than off the screen.
   */
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
    setAnchor({
      ...anchor,
      placed: { left, top, above, goo: gooFrom(anchor, { left, top, width, height }, above) }
    });
  }, [anchor]);

  // The list takes focus so the arrows reach it, the way the native list does.
  useEffect(() => {
    if (!anchor?.placed) return;
    rowsRef.current[active]?.focus();
  }, [anchor, active]);

  if (!anchor) return null;

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (next: number) => {
      event.preventDefault();
      const count = choices.length;
      let index = next;
      for (let hops = 0; hops < count; hops += 1) {
        const candidate = ((index % count) + count) % count;
        if (!choices[candidate].disabled) {
          setActive(candidate);
          return;
        }
        index = next > active ? index + 1 : index - 1;
      }
    };
    if (event.key === "ArrowDown") step(active + 1);
    else if (event.key === "ArrowUp") step(active - 1);
    else if (event.key === "Home") step(0);
    else if (event.key === "End") step(choices.length - 1);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const choice = choices[active];
      if (choice && !choice.disabled) choose(choice.value);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return createPortal(
    <div
      className="bfsel"
      role="presentation"
      style={{ "--bf-ui-scale": String(anchor.zoom) } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={menuRef}
        className="bfsel-menu"
        role="listbox"
        aria-label={nameOf(anchor.select)}
        tabIndex={-1}
        onKeyDown={onMenuKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false);
        }}
        data-bfsel-above={anchor.placed?.above ? "true" : undefined}
        /* The list is mounted hidden for one frame so it can be measured (above), and an
           animation starts the moment it mounts — on this program's settling curve a frame is
           already a third of the way, so the frame that IS the button was never the frame anyone
           saw. The skin hangs the entrance off this mark instead, which arrives with the
           placement, and the morph starts where it is visible. */
        data-bfsel-ready={anchor.placed ? "true" : undefined}
        style={
          {
            left: `${anchor.placed ? anchor.placed.left : anchor.left}px`,
            top: `${anchor.placed ? anchor.placed.top : anchor.below + GAP}px`,
            minWidth: `${anchor.width}px`,
            visibility: anchor.placed ? undefined : "hidden",
            /* the four numbers the gooey entrance is drawn from; the skin holds the rest */
            ...(anchor.placed && {
              "--bf-goo-dx": `${anchor.placed.goo.dx}px`,
              "--bf-goo-y": `${anchor.placed.goo.y}px`,
              "--bf-goo-x": anchor.placed.goo.x,
              "--bf-goo-h": anchor.placed.goo.h
            })
          } as CSSProperties
        }
      >
        {choices.map((choice, index) => (
          <button
            key={`${choice.value}-${index}`}
            ref={(node) => {
              rowsRef.current[index] = node;
            }}
            type="button"
            className="bfsel-item"
            role="option"
            aria-selected={index === anchor.select.selectedIndex}
            disabled={choice.disabled}
            tabIndex={index === active ? 0 : -1}
            onClick={() => choose(choice.value)}
            onPointerEnter={() => setActive(index)}
          >
            <span className="bfsel-mark" aria-hidden="true">
              {index === anchor.select.selectedIndex && <Check size={14} />}
            </span>
            <span className="bfsel-label">{choice.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
