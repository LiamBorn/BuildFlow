/* =============================================================================
   The panel board — the Dashboard's customize, as one module (2026-09-15)

   Every section of a page sits on a six-column grid (dashGrid.ts is the engine):
   drag one anywhere by its grip, resize it from its corner, remove it to the
   "+" drawer, and put the whole board back with Reset layout. The board follows
   the person — an account setting, mirrored on the device — and one page can
   host it as well as another: the Dashboard did first; the Schedule page asked
   for "the same way as the Dashboard" and this is what it takes. Nothing here
   knows which page it is on: the limits a section has, the order a phone stacks
   them in and the setting key are the page's to say.
   ============================================================================= */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { Eye, EyeOff, GripVertical, Plus, RotateCcw, SlidersHorizontal, Trash2, type LucideIcon } from "lucide-react";
import { setUserSetting } from "../api";
import { usePanelFocus } from "../recordFocus";
import { readUserSetting, rememberUserSetting } from "../userSettings";
import {
  cellSize,
  compact,
  DASH_COLS,
  DASH_GAP,
  DASH_ROW_UNIT,
  dragFloor,
  itemRect,
  layoutRows,
  layoutsEqual,
  moveItem,
  parseStoredBoard,
  placeItem,
  sortByPosition,
  reconcileLayout,
  resizeItem,
  snapDelta,
  snapDragSameShape,
  type GridItem,
  type GridLimits,
  type StoredBoard
} from "../dashGrid";

/** Grid rows a block needs to show `contentPx` of body plus its chrome, on 40px rows with the board's gap. */
const rowsForHeight = (px: number) => Math.max(1, Math.ceil((px + DASH_GAP) / (DASH_ROW_UNIT + DASH_GAP)));

export type PanelLayoutOptions = {
  /** The smallest a given section may be. */
  limits: (id: string) => GridLimits;
  /** The account setting that carries the board ("dash:layout" for the Dashboard). */
  settingKey: string;
};

/**
 * The per-user panel board: where every panel sits, how big it is, and which
 * panels are hidden. It lives on the account (the setting that bootstrap
 * brings down) and is mirrored on this device, so a second device opens the
 * same board and this one keeps it when the API is slow.
 */
export function usePersistentLayout(storageKey: string, defaults: GridItem[], resetTo: GridItem[] = defaults, options: PanelLayoutOptions) {
  const { limits, settingKey } = options;
  /* `fitting`: the board's heights follow the content (the Reset layout) rather than the
     person's own. It is saved with the board, so the next login keeps fitting too. */
  type BoardState = { layout: GridItem[]; hidden: string[]; stored: boolean; fitting: boolean };
  const visibleDefaults = (hidden: string[]) => defaults.filter((item) => !hidden.includes(item.id));
  const resolve = (board: StoredBoard | null, stored: boolean): BoardState => {
    const hidden = (board?.hidden ?? []).filter((id) => defaults.some((item) => item.id === id));
    return {
      layout: reconcileLayout(board?.items ?? null, visibleDefaults(hidden), limits),
      hidden,
      stored,
      fitting: board?.fit === true
    };
  };
  // the account copy first — hydrated into this device's key — then the device's own
  const read = (): { board: StoredBoard | null; source: "account" | "device" | null } => {
    const remote = readUserSetting(settingKey);
    if (remote) {
      try {
        const board = parseStoredBoard(JSON.parse(remote));
        if (board) {
          try {
            localStorage.setItem(storageKey, remote);
          } catch {
            /* private mode: the account copy still stands */
          }
          return { board, source: "account" };
        }
      } catch {
        /* an unreadable account copy: fall through to the device copy */
      }
    }
    try {
      const raw = localStorage.getItem(storageKey);
      const board = raw ? parseStoredBoard(JSON.parse(raw)) : null;
      return { board, source: board ? "device" : null };
    } catch {
      return { board: null, source: null };
    }
  };
  const [state, setState] = useState<BoardState>(() => {
    const { board, source } = read();
    return resolve(board, source !== null);
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // One save per burst of changes: a drag commits once, but arrow-key nudges
  // come quickly. The device copy is written at once; the account copy follows.
  const pending = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const flush = useCallback(() => {
    saveTimer.current = null;
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    // fire-and-forget: a failed save leaves the device copy, and the next change tries again
    setUserSetting(settingKey, value).catch(() => undefined);
  }, [settingKey]);
  const queueSave = useCallback(
    (value: string) => {
      /* The same value again does not restart the clock. The content-fit hands the board back
         on every settle pass while the Reset layout is fitting, and a debounce that re-arms on
         each identical call never fires — the account copy simply never left. */
      if (pending.current === value && saveTimer.current !== null) return;
      pending.current = value;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, 600);
    },
    [flush]
  );
  const persist = useCallback(
    (layout: GridItem[], hidden: string[], fit = false) => {
      const board: StoredBoard = { items: layout, hidden, ...(fit ? { fit: true } : {}) };
      const value = JSON.stringify(board);
      rememberUserSetting(settingKey, value);
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        /* private mode: the board just does not persist on this device */
      }
      queueSave(value);
    },
    [storageKey, settingKey, queueSave]
  );
  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        flush();
      }
    },
    [flush]
  );
  // Re-read when the person changes; a board saved on this device before it could
  // follow the account goes up once, so their next device starts from it.
  useEffect(() => {
    const { board, source } = read();
    const next = resolve(board, source !== null);
    setState(next);
    if (source === "device") persist(next.layout, next.hidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* The board's content-fit hands back new heights. A default board keeps them in memory; the
     Reset layout keeps them AND saves them, so what was fitted here is what the next login gets. */
  const fit = useCallback(
    (next: GridItem[]) => {
      const { hidden, fitting } = stateRef.current;
      setState((current) => ({ ...current, layout: next }));
      if (fitting) persist(next, hidden, true);
    },
    [persist]
  );
  /* A drag or a resize: the heights are the person's from here on. */
  const update = useCallback(
    (next: GridItem[]) => {
      const { hidden } = stateRef.current;
      setState({ layout: next, hidden, stored: true, fitting: false });
      persist(next, hidden);
    },
    [persist]
  );
  /** Take a panel off the board; the rest pack up into its place. */
  const hide = useCallback(
    (id: string) => {
      const { layout, hidden, fitting } = stateRef.current;
      if (hidden.includes(id) || !defaults.some((item) => item.id === id)) return;
      const nextHidden = [...hidden, id];
      const next = compact(layout.filter((item) => item.id !== id));
      setState({ layout: next, hidden: nextHidden, stored: true, fitting });
      persist(next, nextHidden, fitting);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist]
  );
  /** Bring a hidden panel back, at its default width under everything else. */
  const show = useCallback(
    (id: string) => {
      const { layout, hidden, fitting } = stateRef.current;
      if (!hidden.includes(id)) return;
      const nextHidden = hidden.filter((other) => other !== id);
      const next = reconcileLayout(layout, visibleDefaults(nextHidden), limits);
      setState({ layout: next, hidden: nextHidden, stored: true, fitting });
      persist(next, nextHidden, fitting);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist]
  );
  /* Reset is not "forget the board" any more: it lays every section out full width, brings
     back anything removed, and SAVES that — to this device and to the account — so the next
     login opens on it. Heights keep following the content until the person drags something. */
  const reset = useCallback(() => {
    const next = resetTo.map((item) => ({ ...item }));
    setState({ layout: next, hidden: [], stored: true, fitting: true });
    persist(next, [], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);
  return { layout: state.layout, hidden: state.hidden, stored: state.stored, fitting: state.fitting, update, reset, fit, hide, show };
}

export type DashPanel = { id: string; title: string; icon?: LucideIcon; action?: ReactNode; body: ReactNode };

// One panel on the board: absolutely positioned by its grid cell, a grip to move
// it, a dotted corner handle to resize it. The interactive content inside stays
// clickable because only the grip and the handle start a drag.
/**
 * The scrollable middle of a panel. When its content overflows it becomes a
 * keyboard-reachable region named after the panel — otherwise a fitted body
 * would still trap keyboard users out of anything past the fold — and it stays
 * out of the tab order when nothing overflows.
 */
function DashBlockBody({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div
      ref={ref}
      className={`dash-block-body${scrolls ? " is-scrollable" : ""}`}
      role="region"
      aria-label={`${title} contents`}
      tabIndex={scrolls ? 0 : -1}
    >
      <div className="dash-block-content">{children}</div>
    </div>
  );
}

function DashSection({
  panel,
  style,
  dragging,
  resizing,
  landing,
  focused = false,
  editable,
  onDragStart,
  onResizeStart,
  onNudge,
  onHide
}: {
  panel: DashPanel;
  style?: CSSProperties;
  dragging: boolean;
  resizing: boolean;
  landing: boolean;
  /** Lit for a moment because a notification pointed here. */
  focused?: boolean;
  editable: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Arrow keys on the grip: move one cell; with Shift, resize one cell. */
  onNudge: (dx: number, dy: number, resize: boolean) => void;
  /** Takes the panel off the board, to wait under Hidden panels. Offered while customizing. */
  onHide?: () => void;
}) {
  const Icon = panel.icon;
  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    onNudge(delta[0], delta[1], event.shiftKey);
  };
  return (
    <div
      style={style}
      className={`dash-block${dragging ? " is-dragging" : ""}${resizing ? " is-resizing" : ""}${landing ? " is-landing" : ""}${focused ? " is-bf-focused" : ""}`}
      data-dash-drag-id={panel.id}
    >
      {editable && (
        <button
          type="button"
          className="dash-drag-handle"
          aria-label={`Move ${panel.title}. Arrow keys move it one cell; hold Shift to resize.`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
          title="Drag to move · arrow keys nudge, Shift + arrows resize"
          onPointerDown={onDragStart}
          onKeyDown={onGripKeyDown}
        >
          <GripVertical size={16} />
        </button>
      )}
      {/* Remove, the reference's way: a round trash button that floats at the panel's
          bottom-right corner while the board is being customized, shown on hover or focus.
          Nothing is deleted — the section waits in the "+" drawer (and under Hidden panels)
          until it is wanted again. Section 7 of the monday-panels sheet draws it. */}
      {editable && onHide && (
        <button
          type="button"
          className="dash-hide"
          aria-label={`Remove ${panel.title}`}
          title="Remove this section — add it back from +"
          onClick={onHide}
        >
          <Trash2 size={16} />
        </button>
      )}
      {/* The one header every box shares: icon + title on the left, the panel's own control on
          the right (View all, Manage, the approvals switch) — the reference's title row. The
          glyph is 20px because that is what the reference's is; the sheet sizes it too. */}
      <div className="hs-widget-head">
        <h2>
          {Icon && <Icon size={20} />}
          {panel.title}
        </h2>
        {panel.action && <div className="hs-widget-actions">{panel.action}</div>}
      </div>
      <DashBlockBody title={panel.title}>{panel.body}</DashBlockBody>
      {editable && (
        <button
          type="button"
          className="dash-resize"
          aria-label={`Resize ${panel.title}`}
          title="Drag to resize"
          onPointerDown={onResizeStart}
        />
      )}
    </div>
  );
}

type DashDrag = {
  kind: "move" | "resize";
  id: string;
  pointerX: number;
  pointerY: number;
  dx: number;
  dy: number;
  /** The panel's cell when the drag began; the floating box is drawn from here. */
  origin: GridItem;
  /** Width the panel is drawn at while carried: its own — a move never changes a panel's shape. */
  w: number;
  /** The layout when the drag began; every step is resolved from it, so nothing drifts. */
  base: GridItem[];
  /** Last row the other panels occupy once this one leaves; at or past it the carried panel is "at the bottom". */
  floor: number;
  /** Where everything would land if the pointer let go now. */
  preview: GridItem[];
};

// The board: measures its own width for the column size, positions every panel
// from the layout, and runs the move / resize drags. While a drag is under way
// the other panels animate to where they would settle, the grey cell grid
// shows through, and a dashed placeholder marks the drop cell.
export function DashBoard({
  layout,
  panels,
  onChange,
  onFit,
  fitToContent = false,
  onEditingChange,
  onHide,
  panelFocus,
  editable = true,
  limits,
  stackedRank
}: {
  layout: GridItem[];
  panels: Record<string, DashPanel>;
  onChange: (next: GridItem[]) => void;
  onEditingChange: (editing: boolean) => void;
  /** Fit default heights to content (in memory). Off once the person has saved a layout. */
  onFit?: (next: GridItem[]) => void;
  fitToContent?: boolean;
  /** Offered while customizing: takes the panel with this id off the board. */
  onHide?: (id: string) => void;
  /** A notification pointed at one of these panels: scroll it up and light it. */
  panelFocus?: { id: string; nonce: number } | null;
  /** Outside Customize (2026-09-15) the board is read-only: no grip, no resize handle, no
      arrow-key nudge, no remove. The mode is the only door to moving or sizing a section. */
  editable?: boolean;
  /** The smallest each section may be. */
  limits: (id: string) => GridLimits;
  /** The order the sections stack in on a phone; by default, the board's own top-down order. */
  stackedRank?: (id: string) => number;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const litPanel = usePanelFocus(panelFocus ?? null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [stacked, setStacked] = useState(false);
  const [drag, setDrag] = useState<DashDrag | null>(null);
  // the latest drag, readable from the window listeners without reaching into a state updater
  const dragRef = useRef<DashDrag | null>(null);
  dragRef.current = drag;
  const [landing, setLanding] = useState<string | null>(null);
  const colW = cellSize(boardWidth, DASH_COLS, DASH_GAP);
  const colWRef = useRef(colW);
  colWRef.current = colW;
  const rank = stackedRank ?? (() => 0);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBoardWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // below tablet width the grid gives way to a single stacked column
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setStacked(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => onEditingChange(drag !== null), [drag, onEditingChange]);

  // On a fresh (unstored) layout, size each block to what it holds so nothing is
  // clipped on first view. Re-runs when the panels' content or the board width
  // changes; stops the moment the person saves a layout of their own.
  const [fitTick, setFitTick] = useState(0);
  const panelIds = layout.map((item) => item.id).join("|");
  useEffect(() => {
    if (!fitToContent || typeof ResizeObserver === "undefined") return;
    const root = boardRef.current;
    if (!root) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setFitTick((tick) => tick + 1));
    });
    root.querySelectorAll<HTMLElement>(".dash-block-content").forEach((el) => observer.observe(el));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToContent, panelIds]);
  useEffect(() => {
    if (!fitToContent || !onFit || stacked || drag || typeof window === "undefined") return;
    const root = boardRef.current;
    if (!root) return;
    const frame = window.requestAnimationFrame(() => {
      const next = layout.map((item) => {
        const block = root.querySelector<HTMLElement>(`.dash-block[data-dash-drag-id="${item.id}"]`);
        const body = block?.querySelector<HTMLElement>(".dash-block-body");
        const content = body?.querySelector<HTMLElement>(":scope > .dash-block-content");
        if (!block || !body || !content) return item;
        // the body is stretched to the block, so its scrollHeight can only ever
        // grow a panel; the inner wrapper's height is the content's real height
        const bodyStyle = window.getComputedStyle(body);
        // `|| 0`: an unstyled environment (jsdom) answers "" here, and a NaN height never equals
        // itself, which made this effect re-fit on every render there
        const padding = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
        const chrome = block.offsetHeight - body.clientHeight;
        // a grid child can paint past its own box (Quick Actions' last row does); the
        // wrapper is an unstretched block, so its scrollHeight is the honest content height
        const contentPx = Math.max(content.offsetHeight, content.scrollHeight);
        const needed = rowsForHeight(chrome + padding + contentPx + 6);
        const own = limits(item.id);
        const h = Math.min(Math.max(needed, own.minH ?? 1), 14);
        return h === item.h ? item : { ...item, h };
      });
      const fitted = compact(next);
      if (!layoutsEqual(fitted, layout)) onFit(fitted);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitToContent, onFit, stacked, drag, layout, panels, boardWidth, fitTick, limits]);

  /* The Dashboard scales with the window (app-shell-client-desk.css section 42 puts a CSS
     zoom on the shell), and pointer deltas arrive in screen pixels while the board lays out
     in its own, so a carried panel would trail the hand by the zoom. currentCSSZoom is the
     browser's word for that factor; where it has none the factor is 1. */
  const boardZoom = () => {
    const zoom = (boardRef.current as (HTMLElement & { currentCSSZoom?: number }) | null)?.currentCSSZoom;
    return typeof zoom === "number" && zoom > 0 ? zoom : 1;
  };

  const startDrag = (kind: DashDrag["kind"], id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || stacked || !editable) return;
    const origin = layout.find((item) => item.id === id);
    if (!origin) return;
    event.preventDefault();
    // a carried panel keeps the shape it was picked up with; only the resize handle changes it
    const w = origin.w;
    const floor = dragFloor(layout, id);
    setDrag({ kind, id, pointerX: event.clientX, pointerY: event.clientY, dx: 0, dy: 0, origin, w, floor, base: layout, preview: layout });
  };

  useEffect(() => {
    if (!drag) return;
    /* Pointer events arrive faster than frames are drawn (120 a second on a fast mouse); each
       one used to re-render the whole board. The latest position is kept and applied once per
       animation frame, so the carried panel moves as smoothly as the screen can show and no
       slower than the hand. */
    let frame = 0;
    let latest: PointerEvent | null = null;
    const applyMove = (event: PointerEvent) =>
      setDrag((current) => {
        if (!current) return current;
        const zoom = boardZoom();
        const dx = (event.clientX - current.pointerX) / zoom;
        const dy = (event.clientY - current.pointerY) / zoom;
        const dCol = snapDelta(dx, colWRef.current, DASH_GAP);
        const dRow = snapDelta(dy, DASH_ROW_UNIT, DASH_GAP);
        const own = limits(current.id);
        let preview: GridItem[];
        if (current.kind === "move") {
          // the cell is read from where the panel's own top-left corner is over the board; the
          // panel keeps its width and height, so it snaps to the nearest column it still fits
          // in. Dropping back on the same cell leaves the layout as it was.
          const rawCol = current.origin.x + dx / (colWRef.current + DASH_GAP);
          const cell = snapDragSameShape(rawCol, current.origin.y + dRow, current.origin.w, current.floor);
          const moved = cell.x !== current.origin.x || cell.y !== current.origin.y;
          preview = moved ? placeItem(current.base, current.id, cell.x, cell.y, current.origin.w, own) : current.base;
          return { ...current, dx, dy, preview };
        } else {
          preview = resizeItem(current.base, current.id, current.origin.w + dCol, current.origin.h + dRow, own);
        }
        return { ...current, dx, dy, preview };
      });
    const onMove = (event: PointerEvent) => {
      latest = event;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (latest) applyMove(latest);
      });
    };
    const onUp = () => {
      // the last position counts even if its frame has not drawn yet
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (latest) applyMove(latest);
      // commit from the ref, not inside a state updater: updating the parent from
      // an updater is a state change during render, which React rejects
      const current = dragRef.current;
      if (current) {
        if (!layoutsEqual(current.preview, current.base)) onChange(current.preview);
        setLanding(current.id);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // the listeners only need re-binding when a drag starts or ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  useEffect(() => {
    if (!landing) return;
    const timer = window.setTimeout(() => setLanding(null), 900);
    return () => window.clearTimeout(timer);
  }, [landing]);

  // keyboard: one cell per press, announced for screen readers
  const [announcement, setAnnouncement] = useState("");
  const nudge = (id: string) => (dx: number, dy: number, resize: boolean) => {
    if (!editable) return;
    const item = layout.find((entry) => entry.id === id);
    if (!item || stacked) return;
    const title = panels[id]?.title ?? id;
    const own = limits(id);
    const next = resize ? resizeItem(layout, id, item.w + dx, item.h + dy, own) : moveItem(layout, id, item.x + dx, item.y + dy, own);
    const after = next.find((entry) => entry.id === id);
    if (!after || layoutsEqual(next, layout)) {
      const direction = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
      setAnnouncement(
        resize ? `${title} cannot get any ${dx < 0 || dy < 0 ? "smaller" : "larger"} here` : `${title} cannot move further ${direction}`
      );
      return;
    }
    onChange(next);
    setLanding(id);
    setAnnouncement(
      resize
        ? `${title} is now ${after.w} of ${DASH_COLS} columns wide and ${after.h} rows tall`
        : `${title} moved to column ${after.x + 1}, row ${after.y + 1}`
    );
  };

  const shown = drag ? drag.preview : layout;
  const rows = layoutRows(shown) + (drag ? 3 : 0);
  const boardHeight = rows * DASH_ROW_UNIT + Math.max(0, rows - 1) * DASH_GAP;
  const placeholder = drag ? shown.find((item) => item.id === drag.id) : undefined;
  const px = (item: { x: number; y: number; w: number; h: number }) => itemRect(item, colW, DASH_ROW_UNIT, DASH_GAP);

  // The entrance the sheet plays when the Dashboard opens (app-shell-client-desk §20): every
  // panel rises in turn, in reading order, and its rows follow it. The order is a CSS variable
  // on the panel so the sheet can stagger by it; a phone's stacked column plays in its own order.
  const entranceRank = new Map(sortByPosition(layout).map((item, index) => [item.id, index]));
  return (
    <div
      ref={boardRef}
      className={`dash-board${stacked ? " is-stacked" : ""}${drag ? ` is-editing is-${drag.kind}` : ""}`}
      style={stacked ? undefined : { height: boardHeight }}
    >
      {drag && !stacked && (
        <div className="dash-cells" aria-hidden="true">
          {Array.from({ length: rows * DASH_COLS }).map((_, index) => (
            <span key={index} className="dash-cell" style={px({ x: index % DASH_COLS, y: Math.floor(index / DASH_COLS), w: 1, h: 1 })} />
          ))}
        </div>
      )}
      {placeholder && !stacked && <div className="dash-placeholder" style={px(placeholder)} aria-hidden="true" />}
      {(stacked ? [...layout].sort((a, b) => rank(a.id) - rank(b.id) || a.y - b.y || a.x - b.x) : shown).map((item, index) => {
        const panel = panels[item.id];
        if (!panel) return null;
        const active = drag?.id === item.id ? drag : null;
        let style: CSSProperties | undefined;
        if (!stacked) {
          const rect = px(active ? { ...active.origin, w: active.w } : item);
          style = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          // the carried panel rides the pointer at its own size, tilted a touch the way the
          // reference's does (the sheet cannot add this: an inline transform replaces it)
          if (active?.kind === "move") style.transform = `translate(${active.dx}px, ${active.dy}px) rotate(-1.5deg)`;
          if (active?.kind === "resize") {
            const own = limits(item.id);
            const min = px({ x: 0, y: 0, w: own.minW ?? 1, h: own.minH ?? 1 });
            style.width = Math.max(min.width, rect.width + active.dx);
            style.height = Math.max(min.height, rect.height + active.dy);
          }
        }
        style = { ...style, "--bfe-i": stacked ? index : (entranceRank.get(item.id) ?? 0) } as CSSProperties;
        return (
          <DashSection
            key={item.id}
            panel={panel}
            style={style}
            dragging={active?.kind === "move"}
            resizing={active?.kind === "resize"}
            landing={landing === item.id}
            focused={litPanel === item.id}
            editable={!stacked && editable}
            onDragStart={startDrag("move", item.id)}
            onResizeStart={startDrag("resize", item.id)}
            onNudge={nudge(item.id)}
            onHide={onHide ? () => onHide(item.id) : undefined}
          />
        );
      })}
      <div className="dash-board-live" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

/* ---- the controls a board's page shows, shared so both pages read the same ----
   Reset layout on top — every section full width, one under the next, removed ones back, saved
   to the account — then "+" and Customize underneath, the reference's order. The classes are the
   Dashboard's (hs-home.css, dashboard-monday-panels.css, section-picker.css draw them), so a
   page hosting the board carries the Dashboard's scope classes where these render. */
export function BoardLayoutControls({
  customizing,
  pickerOpen,
  onToggleCustomize,
  onReset,
  onAdd
}: {
  customizing: boolean;
  pickerOpen: boolean;
  onToggleCustomize: () => void;
  onReset: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="hs-home-topline-actions">
      <button
        type="button"
        className="dash-reset"
        onClick={onReset}
        title="Lay every section out full width, top to bottom, bring back any that were removed, and save that to your account"
      >
        <RotateCcw size={14} />
        Reset layout
      </button>
      <div className="hs-home-topline-row">
        {/* "+" first, then Customize — the reference's order */}
        <button
          type="button"
          className="hs-home-add"
          aria-label="Add a section"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          title="Add a section to this page"
          onClick={onAdd}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className={`hs-home-customize${customizing ? " active" : ""}`}
          aria-pressed={customizing}
          onClick={onToggleCustomize}
          title={customizing ? "Finish customizing" : "Rearrange, resize or hide the panels on this page"}
        >
          <SlidersHorizontal size={14} />
          {customizing ? "Done" : "Customize"}
        </button>
      </div>
    </div>
  );
}

/** What Customize means, said once under the page's title while the mode is on. */
export function BoardCustomizeHint() {
  return (
    <p className="hs-home-hint" role="status">
      <GripVertical size={14} /> Drag any panel by its handle to rearrange this page, resize it from its corner, or remove it with the
      trash at its corner — it waits in + until you want it back. Your layout follows your account.
    </p>
  );
}

/** The sections taken off the board, each one click from coming back. */
export function HiddenPanelChips({ hidden, titles, onShow }: { hidden: string[]; titles: Record<string, string>; onShow: (id: string) => void }) {
  return (
    <div className="hs-home-hidden" role="group" aria-label="Hidden panels">
      <span className="hs-home-hidden-label">
        <EyeOff size={13} aria-hidden="true" />
        Hidden panels
      </span>
      {hidden.map((id) => (
        <button
          key={id}
          type="button"
          className="hs-home-hidden-chip"
          aria-label={`Show ${titles[id] ?? id}`}
          title="Put this panel back on the board"
          onClick={() => onShow(id)}
        >
          <Eye size={13} aria-hidden="true" />
          {titles[id] ?? id}
        </button>
      ))}
    </div>
  );
}
