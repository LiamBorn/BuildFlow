"use client";

/**
 * Gantt — the roadmap-ui / 21st.dev Gantt, ported to this codebase's stack.
 *
 * The original leans on shadcn (Card, ContextMenu), Tailwind, jotai, three nested
 * dnd-kit contexts per bar, @uidotdev/usehooks and date-fns. None of those
 * conventions exist here (no Tailwind, no `cn`, no `@/` alias), so:
 *  - Tailwind classes became `gantt-*` classes styled in src/hs-gantt.css with the
 *    HubSpot shell tokens (--hsx-*), the shell's easing (cubic-bezier(.22,1,.36,1))
 *    and the same lift / land tweens the Deals board plays on its cards;
 *  - jotai atoms became provider state behind the same hook names
 *    (useGanttDragging / useGanttScrollX);
 *  - the three DndContexts per bar became one pointer-capture drag with the same
 *    three zones (move, left edge, right edge) and the same date-by-mouse maths;
 *  - date-fns calls became the small helpers at the top of this file;
 *  - ContextMenu is a dependency-free menu that reuses the shell's `.hs-menu`
 *    look and its `hs-pop` entrance.
 * Component names, props and composition match the original, so the component
 * page's demo maps 1:1: GanttProvider > GanttSidebar + GanttTimeline > GanttHeader,
 * GanttFeatureList > GanttFeatureListGroup > GanttFeatureItem, GanttMarker, GanttToday.
 *
 * One deliberate difference: `endAt` is exclusive (a one-day bar runs from 00:00 on
 * its day to 00:00 the next), which keeps bar widths exact in every range.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";

/* ----------------------------------------------------------------------------
 * Dates. The handful of date-fns calls the original makes, done locally.
 * Everything is local-time and day-granular; `differenceInDays` rounds so a DST
 * change inside the span never produces an off-by-one.
 * ------------------------------------------------------------------------- */
const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
export const addMonths = (d: Date, n: number) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  first.setDate(Math.min(d.getDate(), getDaysInMonth(first)));
  return first;
};
export const differenceInDays = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
export const differenceInMonths = (a: Date, b: Date) => (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth();
export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** "2027-04-05" → local midnight. Anything after the date part is ignored. */
export const parseIsoDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type DatePattern = "MMMM yyyy" | "MMM" | "MMM d" | "MMM d, yyyy" | "d" | "EEEEE";
export const formatDate = (d: Date, pattern: DatePattern) => {
  const mon = MONTHS[d.getMonth()];
  switch (pattern) {
    case "MMMM yyyy":
      return `${mon} ${d.getFullYear()}`;
    case "MMM":
      return mon.slice(0, 3);
    case "MMM d":
      return `${mon.slice(0, 3)} ${d.getDate()}`;
    case "MMM d, yyyy":
      return `${mon.slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
    case "d":
      return String(d.getDate());
    case "EEEEE":
      return WEEKDAY_LETTERS[d.getDay()];
  }
};
/** "3 days" / "1 day" for an exclusive-end span. */
export const formatDuration = (startAt: Date, endAt: Date) => {
  const days = Math.max(1, differenceInDays(endAt, startAt));
  return `${days} day${days === 1 ? "" : "s"}`;
};

/* ----------------------------------------------------------------------------
 * Types (as in the original, plus an optional bar palette and progress).
 * ------------------------------------------------------------------------- */
export type GanttStatus = {
  id: string;
  name: string;
  /** The status dot. */
  color: string;
  /** Optional bar palette; the dot colour is used for all three when absent. */
  fill?: string;
  edge?: string;
  ink?: string;
};

export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  /** Exclusive: the bar ends at 00:00 on this day. */
  endAt: Date;
  status: GanttStatus;
  /** 0–100; paints the done share of the bar. */
  progress?: number;
};

export type GanttMarkerProps = {
  id: string;
  date: Date;
  label: string;
};

export type Range = "daily" | "monthly" | "quarterly";

/** Where a drag ended, and the bar that was dragged (so hit-tests can look past it). */
export type GanttPointer = { clientX: number; clientY: number; target: HTMLElement };

/** The element under a point, ignoring `ignore` (typically the bar being dragged, which sits under the pointer). */
export const elementUnderPointer = (clientX: number, clientY: number, ignore: HTMLElement | null) => {
  const previous = ignore?.style.visibility;
  if (ignore) ignore.style.visibility = "hidden";
  const element = document.elementFromPoint(clientX, clientY);
  if (ignore) ignore.style.visibility = previous ?? "";
  return element;
};

export type TimelineData = {
  year: number;
  quarters: { months: { days: number }[] }[];
}[];

export type GanttContextProps = {
  zoom: number;
  range: Range;
  columnWidth: number;
  sidebarWidth: number;
  headerHeight: number;
  rowHeight: number;
  onAddItem: ((date: Date) => void) | undefined;
  placeholderLength: number;
  timelineData: TimelineData;
  /** The scroll container. */
  ref: RefObject<HTMLDivElement | null>;
  /** The timeline element; pointer x is measured against its left edge. */
  timelineRef: RefObject<HTMLDivElement | null>;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  scrollX: number;
  /** How far the chart is scrolled down, and how tall its viewport is — what row windowing reads. */
  scrollY: number;
  viewportHeight: number;
};

const GanttContext = createContext<GanttContextProps>({
  zoom: 100,
  range: "monthly",
  columnWidth: 150,
  headerHeight: 56,
  sidebarWidth: 300,
  rowHeight: 36,
  onAddItem: undefined,
  placeholderLength: 2,
  timelineData: [],
  ref: { current: null },
  timelineRef: { current: null },
  dragging: false,
  setDragging: () => undefined,
  scrollX: 0,
  scrollY: 0,
  viewportHeight: 0
});

export const useGantt = () => useContext(GanttContext);
export const useGanttDragging = () => {
  const gantt = useGantt();
  return [gantt.dragging, gantt.setDragging] as const;
};
export const useGanttScrollX = () => useGantt().scrollX;

/** Rows drawn before the chart has been measured (tests, the first paint) — about a desktop viewport's worth. */
export const DEFAULT_VISIBLE_ROWS = 24;

/**
 * Which of `total` fixed-height rows are worth rendering: the ones in the viewport plus
 * `overscan` either side. A chart of 300 rows draws about 30 of them, and the rest are the
 * height of the spacers standing in for them, so scrolling still lands where it should.
 */
export const useGanttRowWindow = (total: number, overscan = 6) => {
  const { rowHeight, scrollY, viewportHeight } = useGantt();
  return useMemo(() => {
    if (total <= 0) return { first: 0, last: -1 };
    // no layout yet: the first screenful, which is what the chart paints first anyway
    if (viewportHeight <= 0) return { first: 0, last: Math.min(total, DEFAULT_VISIBLE_ROWS) - 1 };
    return {
      first: Math.max(0, Math.floor(scrollY / rowHeight) - overscan),
      last: Math.min(total - 1, Math.ceil((scrollY + viewportHeight) / rowHeight) + overscan)
    };
  }, [total, rowHeight, scrollY, viewportHeight, overscan]);
};

/** The height of the rows a window skipped, so the scrollbar and every row below it stay where they belong. */
export const GanttRowSpacer: FC<{ rows: number }> = ({ rows }) => {
  const { rowHeight } = useGantt();
  if (rows <= 0) return null;
  return <div className="gantt-row-spacer" style={{ height: rows * rowHeight }} aria-hidden="true" />;
};

/* ----------------------------------------------------------------------------
 * Geometry.
 * ------------------------------------------------------------------------- */
const columnWidthPx = (g: GanttContextProps) => (g.columnWidth * g.zoom) / 100;
const timelineStart = (g: GanttContextProps) => new Date(g.timelineData[0]?.year ?? new Date().getFullYear(), 0, 1);

/** Pixels from the timeline's left edge to 00:00 on `date`. */
export const getOffset = (date: Date, g: GanttContextProps) => {
  const colW = columnWidthPx(g);
  const start = timelineStart(g);
  if (g.range === "daily") return differenceInDays(date, start) * colW;
  const months = differenceInMonths(date, start);
  const pixelsPerDay = colW / getDaysInMonth(date);
  return months * colW + (date.getDate() - 1) * pixelsPerDay;
};

export const getWidth = (startAt: Date, endAt: Date | null, g: GanttContextProps) => {
  if (!endAt) return columnWidthPx(g) * g.placeholderLength;
  return Math.max(getOffset(endAt, g) - getOffset(startAt, g), 6);
};

/** The day under a timeline x. Days before the timeline start come back negative-offset, never clamped. */
export const getDateByMousePosition = (g: GanttContextProps, x: number) => {
  const colW = columnWidthPx(g);
  const start = timelineStart(g);
  if (g.range === "daily") return addDays(start, Math.floor(x / colW));
  const monthIndex = Math.floor(x / colW);
  const month = addMonths(start, monthIndex);
  const days = getDaysInMonth(month);
  const day = Math.min(days - 1, Math.max(0, Math.floor(((x - monthIndex * colW) / colW) * days)));
  return addDays(month, day);
};

const yearData = (year: number) => ({
  year,
  quarters: Array.from({ length: 4 }, (_, quarter) => ({
    months: Array.from({ length: 3 }, (_, month) => ({ days: getDaysInMonth(new Date(year, quarter * 3 + month, 1)) }))
  }))
});

/** Last year, this year, next year — widened to cover `span` when given. */
export const createInitialTimelineData = (today: Date, span?: { start: Date; end: Date }): TimelineData => {
  let from = today.getFullYear() - 1;
  let to = today.getFullYear() + 1;
  if (span) {
    from = Math.min(from, span.start.getFullYear());
    to = Math.max(to, span.end.getFullYear());
  }
  return Array.from({ length: to - from + 1 }, (_, i) => yearData(from + i));
};

const yearWidth = (year: TimelineData[number], g: GanttContextProps) => {
  const colW = columnWidthPx(g);
  if (g.range === "daily") return year.quarters.reduce((sum, q) => sum + q.months.reduce((m, month) => m + month.days, 0), 0) * colW;
  return 12 * colW;
};

/* ----------------------------------------------------------------------------
 * Header.
 * ------------------------------------------------------------------------- */
export type GanttContentHeaderProps = {
  renderHeaderItem: (index: number) => ReactNode;
  title: string;
  columns: number;
};

export const GanttContentHeader: FC<GanttContentHeaderProps> = ({ title, columns, renderHeaderItem }) => {
  const id = useId();
  return (
    <div className="gantt-content-header">
      <div>
        <div className="gantt-content-header-title">
          <p>{title}</p>
        </div>
      </div>
      <div className="gantt-content-header-cells" style={{ gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <div key={`${id}-${index}`} className="gantt-content-header-cell">
            {renderHeaderItem(index)}
          </div>
        ))}
      </div>
    </div>
  );
};

const DailyHeader: FC = () => {
  const gantt = useGantt();
  return (
    <>
      {gantt.timelineData.map((year) =>
        year.quarters
          .flatMap((quarter) => quarter.months)
          .map((month, index) => {
            const first = new Date(year.year, index, 1);
            return (
              <div className="gantt-header-block" key={`${year.year}-${index}`}>
                <GanttContentHeader
                  title={formatDate(first, "MMMM yyyy")}
                  columns={month.days}
                  renderHeaderItem={(item) => {
                    const day = addDays(first, item);
                    return (
                      <div className="gantt-day-cell">
                        <p>{formatDate(day, "d")}</p>
                        <p className="gantt-day-cell-weekday">{formatDate(day, "EEEEE")}</p>
                      </div>
                    );
                  }}
                />
                <GanttColumns columns={month.days} isColumnSecondary={(item) => [0, 6].includes(addDays(first, item).getDay())} />
              </div>
            );
          })
      )}
    </>
  );
};

const MonthlyHeader: FC = () => {
  const gantt = useGantt();
  return (
    <>
      {gantt.timelineData.map((year) => (
        <div className="gantt-header-block" key={year.year}>
          <GanttContentHeader
            title={`${year.year}`}
            columns={12}
            renderHeaderItem={(item) => <p>{formatDate(new Date(year.year, item, 1), "MMM")}</p>}
          />
          <GanttColumns columns={12} />
        </div>
      ))}
    </>
  );
};

const QuarterlyHeader: FC = () => {
  const gantt = useGantt();
  return (
    <>
      {gantt.timelineData.map((year) =>
        year.quarters.map((quarter, quarterIndex) => (
          <div className="gantt-header-block" key={`${year.year}-${quarterIndex}`}>
            <GanttContentHeader
              title={`Q${quarterIndex + 1} ${year.year}`}
              columns={quarter.months.length}
              renderHeaderItem={(item) => <p>{formatDate(new Date(year.year, quarterIndex * 3 + item, 1), "MMM")}</p>}
            />
            <GanttColumns columns={quarter.months.length} />
          </div>
        ))
      )}
    </>
  );
};

const headers: Record<Range, FC> = { daily: DailyHeader, monthly: MonthlyHeader, quarterly: QuarterlyHeader };

export type GanttHeaderProps = { className?: string };

export const GanttHeader: FC<GanttHeaderProps> = ({ className }) => {
  const gantt = useGantt();
  const Header = headers[gantt.range];
  return (
    <div className={`gantt-header${className ? ` ${className}` : ""}`}>
      <Header />
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Sidebar.
 * ------------------------------------------------------------------------- */
export type GanttSidebarItemProps = {
  feature: GanttFeature;
  onSelectItem?: (id: string) => void;
  selected?: boolean;
  className?: string;
  /** Replaces the default "duration" trailing text. */
  trailing?: ReactNode;
  /** Small text under/after the name (a crew, a phase). */
  meta?: ReactNode;
};

export const GanttSidebarItem: FC<GanttSidebarItemProps> = ({ feature, onSelectItem, selected, className, trailing, meta }) => {
  const handleClick = () => onSelectItem?.(feature.id);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectItem?.(feature.id);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`gantt-sidebar-item${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
      title={feature.name}
    >
      <span className="gantt-status-dot" style={{ backgroundColor: feature.status.color }} aria-hidden="true" />
      <span className="gantt-sidebar-item-body">
        <span className="gantt-sidebar-item-name">{feature.name}</span>
        {meta && <span className="gantt-sidebar-item-meta">{meta}</span>}
      </span>
      <span className="gantt-sidebar-item-trailing">{trailing ?? formatDuration(feature.startAt, feature.endAt)}</span>
    </div>
  );
};

export const GanttSidebarHeader: FC<{ title?: string; trailing?: string }> = ({ title = "Items", trailing = "Duration" }) => (
  <div className="gantt-sidebar-header">
    <p className="gantt-sidebar-header-title">{title}</p>
    <p>{trailing}</p>
  </div>
);

export type GanttSidebarGroupProps = {
  children: ReactNode;
  name: string;
  className?: string;
  trailing?: ReactNode;
  /** A control that sits after the name (an "Add" button). */
  action?: ReactNode;
  /** Secondary line under the name. */
  meta?: ReactNode;
};

export const GanttSidebarGroup: FC<GanttSidebarGroupProps> = ({ children, name, className, trailing, action, meta }) => (
  <div className={`gantt-sidebar-group${className ? ` ${className}` : ""}`}>
    <div className="gantt-sidebar-group-name" title={name}>
      <span className="gantt-sidebar-group-title">
        <span>{name}</span>
        {meta && <span className="gantt-sidebar-group-meta">{meta}</span>}
      </span>
      {trailing && <span className="gantt-sidebar-group-trailing">{trailing}</span>}
      {action}
    </div>
    <div className="gantt-sidebar-items">{children}</div>
  </div>
);

/** A row-height placeholder that keeps an empty group aligned with its timeline rows. */
export const GanttSidebarEmptyRow: FC<{ children?: ReactNode }> = ({ children }) => (
  <div className="gantt-sidebar-item is-empty" aria-hidden={children ? undefined : true}>
    <span className="gantt-sidebar-item-body">
      <span className="gantt-sidebar-item-meta">{children}</span>
    </span>
  </div>
);

export type GanttSidebarProps = { children: ReactNode; className?: string; title?: string; trailing?: string };

export const GanttSidebar: FC<GanttSidebarProps> = ({ children, className, title, trailing }) => (
  <div data-roadmap-ui="gantt-sidebar" className={`gantt-sidebar${className ? ` ${className}` : ""}`}>
    <GanttSidebarHeader title={title} trailing={trailing} />
    <div className="gantt-sidebar-groups">{children}</div>
  </div>
);

/* ----------------------------------------------------------------------------
 * Columns and the "add here" helper.
 * ------------------------------------------------------------------------- */
export type GanttAddFeatureHelperProps = { top: number; date: Date; className?: string };

export const GanttAddFeatureHelper: FC<GanttAddFeatureHelperProps> = ({ top, date, className }) => {
  const gantt = useGantt();
  return (
    <div
      className={`gantt-add-helper${className ? ` ${className}` : ""}`}
      style={{ marginTop: -gantt.rowHeight / 2, transform: `translateY(${top}px)` }}
    >
      <button type="button" onClick={() => gantt.onAddItem?.(date)} title={`Add on ${formatDate(date, "MMM d, yyyy")}`}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export type GanttColumnProps = { index: number; isColumnSecondary?: (item: number) => boolean };

export const GanttColumn: FC<GanttColumnProps> = ({ index, isColumnSecondary }) => {
  const gantt = useGantt();
  const [dragging] = useGanttDragging();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ top: number; date: Date } | null>(null);

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!gantt.onAddItem || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const timelineRect = gantt.timelineRef.current?.getBoundingClientRect();
    const x = event.clientX - (timelineRect?.left ?? rect.left);
    setHover({ top: event.clientY - rect.top, date: getDateByMousePosition(gantt, x) });
  };

  return (
    <div
      ref={ref}
      className={`gantt-column${isColumnSecondary?.(index) ? " is-secondary" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {!dragging && hover && gantt.onAddItem ? <GanttAddFeatureHelper top={hover.top} date={hover.date} /> : null}
    </div>
  );
};

export type GanttColumnsProps = { columns: number; isColumnSecondary?: (item: number) => boolean };

export const GanttColumns: FC<GanttColumnsProps> = ({ columns, isColumnSecondary }) => {
  const id = useId();
  return (
    <div className="gantt-columns" style={{ gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))` }}>
      {Array.from({ length: columns }).map((_, index) => (
        <GanttColumn key={`${id}-${index}`} index={index} isColumnSecondary={isColumnSecondary} />
      ))}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Context menu — the shell's `.hs-menu` look, at the pointer.
 * ------------------------------------------------------------------------- */
export type GanttMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export type GanttContextMenuProps = { items: GanttMenuItem[]; children: ReactNode; className?: string };

export const GanttContextMenu: FC<GanttContextMenuProps> = ({ items, children, className }) => {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  // keep the menu on screen
  useLayoutEffect(() => {
    if (!at || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(at.x, window.innerWidth - rect.width - 8);
    const y = Math.min(at.y, window.innerHeight - rect.height - 8);
    if (x !== at.x || y !== at.y) setAt({ x, y });
  }, [at]);

  const open = (event: ReactMouseEvent) => {
    if (items.length === 0) return;
    event.preventDefault();
    setAt({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className={`gantt-ctx${className ? ` ${className}` : ""}`} onContextMenu={open}>
      {children}
      {at &&
        createPortal(
          <div ref={menuRef} className="gantt-menu hs-menu" role="menu" style={{ left: at.x, top: at.y }}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`hs-menu-item${item.danger ? " is-danger" : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  setAt(null);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Bars.
 * ------------------------------------------------------------------------- */
type DragZone = "move" | "left" | "right";

export type GanttFeatureItemProps = GanttFeature & {
  onMove?: (id: string, startDate: Date, endDate: Date | null, pointer: GanttPointer) => void;
  /** Fires on every drag step with the provisional dates; use it to highlight a drop target. */
  onDragMove?: (id: string, startDate: Date, endDate: Date, pointer: GanttPointer) => void;
  onSelect?: (id: string) => void;
  selected?: boolean;
  /** Edge handles; off for bars whose length is not the user's to change. */
  resizable?: boolean;
  barClassName?: string;
  children?: ReactNode;
  className?: string;
  /** A faint bar behind the real one — the baseline this job was planned against. */
  ghost?: { startAt: Date; endAt: Date; title?: string };
};

export const GanttFeatureItem: FC<GanttFeatureItemProps> = ({
  onMove,
  onDragMove,
  onSelect,
  selected,
  resizable = true,
  barClassName,
  children,
  className,
  ghost,
  ...feature
}) => {
  const gantt = useGantt();
  const [draft, setDraftState] = useState<{ start: Date; end: Date } | null>(null);
  const draftRef = useRef<{ start: Date; end: Date } | null>(null);
  const setDraft = (next: { start: Date; end: Date } | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [zone, setZone] = useState<DragZone | null>(null);
  const [landing, setLanding] = useState(false);
  const press = useRef<{ zone: DragZone; x0: number; y0: number; start: Date; end: Date; moved: boolean } | null>(null);
  const featureRef = useRef<HTMLDivElement>(null);
  const landTimer = useRef<number | null>(null);

  const startAt = draft?.start ?? feature.startAt;
  const endAt = draft?.end ?? feature.endAt;
  const width = getWidth(startAt, endAt, gantt);
  const offset = getOffset(startAt, gantt);

  useEffect(
    () => () => {
      if (landTimer.current) window.clearTimeout(landTimer.current);
    },
    []
  );

  const timelineX = (clientX: number) => clientX - (gantt.timelineRef.current?.getBoundingClientRect().left ?? 0);

  const onPointerDown = (dragZone: DragZone) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (dragZone !== "move") event.stopPropagation();
    if (!onMove && dragZone !== "move") return;
    press.current = { zone: dragZone, x0: event.clientX, y0: event.clientY, start: feature.startAt, end: feature.endAt, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved) {
      if (Math.hypot(event.clientX - p.x0, event.clientY - p.y0) < 4 || !onMove) return;
      p.moved = true;
      setZone(p.zone);
      gantt.setDragging(true);
    }
    const delta =
      gantt.range === "daily"
        ? Math.round((event.clientX - p.x0) / columnWidthPx(gantt))
        : differenceInDays(getDateByMousePosition(gantt, timelineX(event.clientX)), getDateByMousePosition(gantt, timelineX(p.x0)));
    let next: { start: Date; end: Date };
    if (p.zone === "move") {
      next = { start: addDays(p.start, delta), end: addDays(p.end, delta) };
    } else if (p.zone === "left") {
      const start = addDays(p.start, delta);
      next = { start: start < p.end ? start : addDays(p.end, -1), end: p.end };
    } else {
      const end = addDays(p.end, delta);
      next = { start: p.start, end: end > p.start ? end : addDays(p.start, 1) };
    }
    setDraft(next);
    if (featureRef.current)
      onDragMove?.(feature.id, next.start, next.end, { clientX: event.clientX, clientY: event.clientY, target: featureRef.current });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (p.moved) {
      gantt.setDragging(false);
      setZone(null);
      const result = draftRef.current;
      setDraft(null);
      if (result && featureRef.current) {
        onMove?.(feature.id, result.start, result.end, { clientX: event.clientX, clientY: event.clientY, target: featureRef.current });
        setLanding(true);
        if (landTimer.current) window.clearTimeout(landTimer.current);
        landTimer.current = window.setTimeout(() => setLanding(false), 1100);
      }
    } else if (p.zone === "move") {
      onSelect?.(feature.id);
    }
  };

  const onPointerCancel = () => {
    press.current = null;
    gantt.setDragging(false);
    setZone(null);
    setDraft(null);
  };

  const palette = {
    "--gantt-bar-fill": feature.status.fill ?? feature.status.color,
    "--gantt-bar-edge": feature.status.edge ?? feature.status.color,
    "--gantt-bar-ink": feature.status.ink ?? "#14203a",
    "--gantt-bar-dot": feature.status.color
  } as CSSProperties;
  const progress = Math.max(0, Math.min(100, feature.progress ?? 0));
  const tip = `${formatDate(startAt, "MMM d")} – ${formatDate(addDays(endAt, -1), "MMM d, yyyy")}`;

  return (
    <div className={`gantt-feature-row${className ? ` ${className}` : ""}`}>
      {ghost && (
        <div
          className="gantt-ghost"
          style={{ width: Math.round(getWidth(ghost.startAt, ghost.endAt, gantt)), left: Math.round(getOffset(ghost.startAt, gantt)) }}
          title={ghost.title}
          aria-hidden="true"
        />
      )}
      <div
        ref={featureRef}
        className={`gantt-feature${zone ? ` is-dragging is-${zone}` : ""}${landing ? " is-landing" : ""}${selected ? " is-selected" : ""}`}
        style={{ width: Math.round(width), left: Math.round(offset), ...palette }}
        data-feature-id={feature.id}
      >
        <div
          className={`gantt-bar${barClassName ? ` ${barClassName}` : ""}`}
          role="button"
          tabIndex={0}
          title={`${feature.name} · ${tip}`}
          onPointerDown={onPointerDown("move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect?.(feature.id);
            }
          }}
        >
          {progress > 0 && <span className="gantt-bar-progress" style={{ width: `${progress}%` }} aria-hidden="true" />}
          <span className="gantt-bar-label">{children ?? feature.name}</span>
        </div>
        {onMove && resizable && (
          <>
            <div
              className="gantt-handle is-left"
              onPointerDown={onPointerDown("left")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              aria-hidden="true"
            >
              <span />
            </div>
            <div
              className="gantt-handle is-right"
              onPointerDown={onPointerDown("right")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              aria-hidden="true"
            >
              <span />
            </div>
          </>
        )}
        {zone && <div className="gantt-drag-tip">{tip}</div>}
      </div>
    </div>
  );
};

export type GanttFeatureListGroupProps = { children: ReactNode; className?: string };

export const GanttFeatureListGroup: FC<GanttFeatureListGroupProps> = ({ children, className }) => (
  <div className={`gantt-feature-group${className ? ` ${className}` : ""}`}>{children}</div>
);

export type GanttFeatureListProps = { className?: string; children: ReactNode };

export const GanttFeatureList: FC<GanttFeatureListProps> = ({ className, children }) => (
  <div className={`gantt-feature-list${className ? ` ${className}` : ""}`}>{children}</div>
);

/* ----------------------------------------------------------------------------
 * Markers, today, and the create-marker trigger.
 * ------------------------------------------------------------------------- */
export const GanttMarker: FC<GanttMarkerProps & { onRemove?: (id: string) => void; className?: string }> = ({
  label,
  date,
  id,
  onRemove,
  className
}) => {
  const gantt = useGantt();
  const offset = getOffset(date, gantt);
  const pill = (
    <div className="gantt-marker-pill" title={formatDate(date, "MMM d, yyyy")}>
      {label}
      <span className="gantt-marker-date">{formatDate(date, "MMM d, yyyy")}</span>
    </div>
  );
  return (
    <div className={`gantt-marker${className ? ` ${className}` : ""}`} style={{ transform: `translateX(${Math.round(offset)}px)` }}>
      {onRemove ? (
        <GanttContextMenu items={[{ label: "Remove marker", icon: <Trash2 size={16} />, danger: true, onSelect: () => onRemove(id) }]}>
          {pill}
        </GanttContextMenu>
      ) : (
        pill
      )}
      <div className="gantt-marker-line" />
    </div>
  );
};

export type GanttTodayProps = { className?: string; label?: string };

export const GanttToday: FC<GanttTodayProps> = ({ className, label = "Today" }) => {
  const date = startOfDay(new Date());
  return <GanttMarker id="gantt-today" label={label} date={date} className={`is-today${className ? ` ${className}` : ""}`} />;
};

export type GanttCreateMarkerTriggerProps = { onCreateMarker: (date: Date) => void; className?: string };

export const GanttCreateMarkerTrigger: FC<GanttCreateMarkerTriggerProps> = ({ onCreateMarker, className }) => {
  const gantt = useGantt();
  const [dragging] = useGanttDragging();
  const [x, setX] = useState<number | null>(null);

  useEffect(() => {
    const scroller = gantt.ref.current;
    if (!scroller) return;
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = gantt.timelineRef.current?.getBoundingClientRect();
        if (!rect || event.clientX < rect.left) {
          setX(null);
          return;
        }
        setX(event.clientX - rect.left);
      });
    };
    const onLeave = () => setX(null);
    scroller.addEventListener("mousemove", onMove);
    scroller.addEventListener("mouseleave", onLeave);
    return () => {
      scroller.removeEventListener("mousemove", onMove);
      scroller.removeEventListener("mouseleave", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [gantt.ref, gantt.timelineRef]);

  if (x === null || dragging) return null;
  const date = getDateByMousePosition(gantt, x);
  const snapped = getOffset(date, gantt);
  return (
    <div className={`gantt-create-marker${className ? ` ${className}` : ""}`} style={{ transform: `translateX(${Math.round(snapped)}px)` }}>
      <button type="button" onClick={() => onCreateMarker(date)} title={`Add a marker on ${formatDate(date, "MMM d, yyyy")}`}>
        <Plus size={12} aria-hidden="true" />
      </button>
      <div className="gantt-create-marker-date">{formatDate(date, "MMM d, yyyy")}</div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Provider + timeline.
 * ------------------------------------------------------------------------- */
export type GanttProviderProps = {
  range?: Range;
  zoom?: number;
  onAddItem?: (date: Date) => void;
  children: ReactNode;
  className?: string;
  /** 0 when no GanttSidebar is rendered. */
  sidebarWidth?: number;
  rowHeight?: number;
  headerHeight?: number;
  /** Widens the initial three-year timeline so every bar is reachable. */
  span?: { start: Date; end: Date };
  /** The day parked a third of the way into the viewport on mount and after a range or zoom change. */
  initialDate?: Date;
  /** Bump `nonce` to scroll `date` into view. */
  scrollRequest?: { date: Date; nonce: number };
  /** Size the columns so exactly `days` of them fill the viewport, and park `start` on the left edge (a week board). */
  fit?: { start: Date; days: number };
  /** Grow with the rows instead of filling a fixed-height frame. */
  autoHeight?: boolean;
};

export const GanttProvider: FC<GanttProviderProps> = ({
  zoom = 100,
  range = "monthly",
  onAddItem,
  children,
  className,
  sidebarWidth = 300,
  rowHeight = 36,
  headerHeight = 56,
  span,
  initialDate,
  scrollRequest,
  fit,
  autoHeight
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineData, setTimelineData] = useState<TimelineData>(() => createInitialTimelineData(new Date(), span));
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const anchor = useRef<Date>(fit?.start ?? initialDate ?? startOfDay(new Date()));
  const pendingShift = useRef(0);
  const anchorFraction = fit ? 0 : 0.3;
  const [fitWidth, setFitWidth] = useState(0);

  // how tall the chart is: the row window renders what fits in it, and follows a resize
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // a fitted timeline sizes its columns to the viewport (and re-sizes with it)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !fit) return;
    const measure = () => setFitWidth(Math.max(0, el.clientWidth - sidebarWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, sidebarWidth]);

  const fitDays = fit?.days ?? 0;
  const columnWidth =
    fit && fitWidth > 0 ? (fitWidth / fitDays) * (100 / zoom) : range === "monthly" ? 150 : range === "quarterly" ? 100 : 50;

  const value = useMemo<GanttContextProps>(
    () => ({
      zoom,
      range,
      headerHeight,
      columnWidth,
      sidebarWidth,
      rowHeight,
      onAddItem,
      timelineData,
      placeholderLength: 2,
      ref: scrollRef,
      timelineRef,
      dragging,
      setDragging,
      scrollX,
      scrollY,
      viewportHeight
    }),
    [zoom, range, headerHeight, columnWidth, sidebarWidth, rowHeight, onAddItem, timelineData, dragging, scrollX, scrollY, viewportHeight]
  );

  // a span that grows (new data) widens the timeline; it never shrinks under the user
  useEffect(() => {
    if (!span) return;
    setTimelineData((current) => {
      const first = current[0]?.year ?? span.start.getFullYear();
      const last = current[current.length - 1]?.year ?? span.end.getFullYear();
      const from = Math.min(first, span.start.getFullYear());
      const to = Math.max(last, span.end.getFullYear());
      if (from === first && to === last) return current;
      return Array.from({ length: to - from + 1 }, (_, i) => yearData(from + i));
    });
  }, [span]);

  const scrollToDate = useCallback(
    (date: Date, g: GanttContextProps) => {
      const el = scrollRef.current;
      if (!el) return;
      const viewport = Math.max(0, el.clientWidth - sidebarWidth);
      el.scrollLeft = Math.max(0, getOffset(date, g) - viewport * anchorFraction);
      setScrollX(el.scrollLeft);
    },
    [sidebarWidth, anchorFraction]
  );

  // a fitted week: the requested start is the anchor, always
  const fitStartKey = fit ? toIsoDate(fit.start) : null;
  useLayoutEffect(() => {
    if (!fit) return;
    anchor.current = fit.start;
    scrollToDate(fit.start, value);
    // only when the fitted window or its geometry changes; `value` is the fresh geometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitStartKey, fitWidth, zoom]);

  // mount, range and zoom: keep the anchor day where the eye was
  useLayoutEffect(() => {
    scrollToDate(anchor.current, value);
    // deliberately only on range/zoom; `value` is the fresh geometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, zoom, scrollToDate]);

  // an explicit request from outside (a "Today" button)
  useEffect(() => {
    if (!scrollRequest) return;
    anchor.current = scrollRequest.date;
    scrollToDate(scrollRequest.date, value);
    // only when the nonce changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest?.nonce]);

  // after a year is prepended, shift the scroll so the view does not jump
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pendingShift.current) return;
    el.scrollLeft += pendingShift.current;
    pendingShift.current = 0;
    setScrollX(el.scrollLeft);
  }, [timelineData]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setScrollX(scrollLeft);
        setScrollY(el.scrollTop);
        // a hidden document's ResizeObserver reports 0; a scroll is a good moment to ask the element again
        setViewportHeight(el.clientHeight);
        const viewport = Math.max(0, clientWidth - sidebarWidth);
        // +1px: the browser rounds scrollLeft to half pixels, which would otherwise floor the anchor to the previous day
        anchor.current = getDateByMousePosition(value, scrollLeft + viewport * anchorFraction + 1);
        if (scrollLeft === 0) {
          const firstYear = timelineData[0]?.year;
          if (firstYear === undefined) return;
          const year = yearData(firstYear - 1);
          pendingShift.current = yearWidth(year, value);
          setTimelineData([year, ...timelineData]);
        } else if (scrollLeft + clientWidth >= scrollWidth - 1) {
          const lastYear = timelineData[timelineData.length - 1]?.year;
          if (lastYear === undefined) return;
          setTimelineData([...timelineData, yearData(lastYear + 1)]);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [timelineData, value, sidebarWidth, anchorFraction]);

  const cssVariables = {
    "--gantt-zoom": `${zoom}`,
    "--gantt-column-width": `${(zoom / 100) * columnWidth}px`,
    "--gantt-header-height": `${headerHeight}px`,
    "--gantt-row-height": `${rowHeight}px`,
    "--gantt-sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;

  return (
    <GanttContext.Provider value={value}>
      <div
        className={`gantt is-${range}${dragging ? " is-dragging" : ""}${fit ? " is-fitted" : ""}${autoHeight ? " is-auto-height" : ""}${className ? ` ${className}` : ""}`}
        style={{ ...cssVariables, gridTemplateColumns: "var(--gantt-sidebar-width) 1fr" }}
        ref={scrollRef}
      >
        {children}
      </div>
    </GanttContext.Provider>
  );
};

export type GanttTimelineProps = { children: ReactNode; className?: string };

export const GanttTimeline: FC<GanttTimelineProps> = ({ children, className }) => {
  const gantt = useGantt();
  return (
    <div className={`gantt-timeline${className ? ` ${className}` : ""}`} ref={gantt.timelineRef}>
      {children}
    </div>
  );
};
