/**
 * The Labeled sidebar — a Sidebar Style a person can pick in Preferences (2026-09-27).
 *
 * Asked for with a screenshot of Linear's sidebar: "Make it so that a user is able to change the
 * left sidebar to look like the image reference." So it is a CHOICE beside the icon rail under
 * Preferences › Sidebar Style (preferences.ts, `data-bf-sidebar="labeled"`), not a replacement: the
 * rail stays the default, and everything around the sidebar — the top bar, the pages — is untouched.
 *
 * WHAT THE REFERENCE IS MADE OF, and what stands in each place here:
 *   - the workspace with a chevron, a search and a round compose button at the head — the
 *     workspace switcher, the ⌘K search, and a Create menu that says where each thing is made;
 *   - three rows for the person — Inbox (the bell's list), My time (TimeCard) and the agent
 *     (BuildFlow AI);
 *   - "Workspace ▾" with two rows and a "More" that folds the rest away;
 *   - "Your teams ▾ +" with a team that folds its own pages under it — here the workspace itself,
 *     holding its home (the Dashboard) and the Schedule's pages, the "+" adding a workspace;
 *   - "Try ▾" with three ways to get going, and a "What's new" card at the foot.
 * Nothing the rail did is lost: every page it reaches is a row, an add-on page keeps its ↑ and its
 * prompt, a page's New tag rides on its row, each row keeps its `nav-<page>` tutorial id, and
 * Settings and the hide arrow stand at the foot.
 *
 * ITS OWN COLUMN, AND ITS OWN WIDTH (asked for next, with a screenshot of Notion's sidebar: "Make
 * the left sidebar move bigger and smaller width wise … also separate the sidebar to make it look
 * like its own section"). The column stands on its own surface with a divider down its edge, from
 * under the top bar — which keeps the BuildFlow name, as over the rail — to the window's foot (skin
 * §86), and the divider is a handle, as Notion's is: drag it to
 * resize — the width is kept on this device — click it to close the sidebar, or press ⌘\ (Ctrl+\)
 * to close or open it from anywhere. As a separator it also takes the arrow keys, Home and End.
 *
 * THE BRAND AND THE PERSON (2026-09-28, the EduLearn trial of skin §88: "use it to redesign the top
 * bar, and sidebar"). That reference sets its logo and name at the column's head and the signed-in
 * person at its foot; `brand` and `profile` put BuildFlow's and yours there. Both are optional, and
 * without `profile` the foot keeps its labelled Settings row.
 *
 * It knows nothing about BuildFlow's pages: App passes the sections, labels, icons and callbacks.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleArrowUp,
  Ellipsis,
  Plus,
  Search,
  Settings,
  SquarePen,
  type LucideIcon
} from "lucide-react";

/** A row: a page to open, or an action (the Inbox, the assistant, a setting). */
export type SideEntry =
  | { kind: "page"; page: string; label: string; icon: LucideIcon }
  | { kind: "action"; id: string; label: string; ariaLabel?: string; icon: LucideIcon; onSelect: () => void; opens?: "dialog" | "menu" };

/** A group under a small head that folds: its rows, what "More" folds away, a "+" at its head, and a folding team. */
export type SideGroup = {
  id: string;
  label: string;
  entries?: SideEntry[];
  more?: SideEntry[];
  add?: { label: string; onSelect: () => void } | null;
  team?: { id: string; label: string; initial: string; entries: SideEntry[] } | null;
};

/** One entry in the Create menu: what is made, and the page it is made on. */
export type SideCreateItem = { id: string; label: string; where: string; icon: LucideIcon; page: string };

/** The one event the Inbox row sends: the top bar opens its notifications on it. */
export const OPEN_NOTIFICATIONS_EVENT = "bf:open-notifications";

const FOLDS_KEY = "bf:side:folds";

/* The width a person drags the column to, in the shell's own (zoomed) pixels, kept on this device. */
const WIDTH_KEY = "bf:side:width";
export const SIDE_WIDTH = { min: 200, default: 244, max: 420 } as const;
const clampWidth = (value: number) => Math.round(Math.min(SIDE_WIDTH.max, Math.max(SIDE_WIDTH.min, value)));
const readWidth = (): number => {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : SIDE_WIDTH.default;
  } catch {
    return SIDE_WIDTH.default;
  }
};
/** The column and everything placed beside it (the top bar, BuildFlow AI) read this one variable. */
const setWidthVariable = (width: number) => document.body.style.setProperty("--lbl-user-w", `${width}px`);

const readFolds = (): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FOLDS_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

/** Whether a group (or the team) is open, remembered on this device as Linear remembers it. */
function useOpen(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => readFolds()[id] ?? true);
  const toggle = () =>
    setOpen((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(FOLDS_KEY, JSON.stringify({ ...readFolds(), [id]: next }));
      } catch {
        // private mode: the fold just does not remember
      }
      return next;
    });
  return [open, toggle];
}

/** The small filled caret the reference's group heads carry. */
function Caret() {
  return (
    <svg className="lbl-caret" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1 2.5h6L4 6.5z" fill="currentColor" />
    </svg>
  );
}

/** A row's place in the column, for the opening's stagger. */
const at = (index: number) => ({ "--lbl-i": index }) as CSSProperties;
const keyOf = (entry: SideEntry) => (entry.kind === "page" ? `page:${entry.page}` : `action:${entry.id}`);

export function LabeledSidebar({
  page,
  switcher,
  onOpenSearch,
  createItems,
  primary,
  groups,
  whatsNew,
  onNavigate,
  lockedFor,
  onRequestAddOn,
  tagFor,
  onOpenSettings,
  brand,
  profile,
  collapsed,
  onToggleCollapsed
}: {
  page: string;
  /** The workspace switcher at the head, where the reference names the workspace. */
  switcher: ReactNode;
  onOpenSearch: () => void;
  createItems: SideCreateItem[];
  primary: SideEntry[];
  groups: SideGroup[];
  /** The newest product update, as the reference's card at the foot. */
  whatsNew?: { title: string; onOpen: () => void } | null;
  onNavigate: (page: string) => void;
  /** The add-on a page belongs to when the workspace does not have it yet. */
  lockedFor: (page: string) => string | null;
  onRequestAddOn: (addOn: string) => void;
  tagFor?: (page: string) => string | null;
  onOpenSettings: () => void;
  /** The product's mark and name above the head, where the EduLearn reference sets its own (a trial, 2026-09-28). */
  brand?: { name: string; tagline: string; logo: string } | null;
  /** Who is signed in, at the foot beside Settings, as the same reference has it. */
  profile?: { initials: string; name: string; role: string } | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const createMenuId = useId();

  /* ---- the width: dragged at the divider, kept on this device ---- */
  const [width, setWidth] = useState(readWidth);
  const drag = useRef<{ startX: number; startWidth: number; zoom: number; moved: boolean; live: number } | null>(null);
  useLayoutEffect(() => {
    setWidthVariable(width);
  }, [width]);
  useEffect(
    () => () => {
      document.body.style.removeProperty("--lbl-user-w");
      document.body.classList.remove("bf-side-resizing");
    },
    []
  );
  const commitWidth = (next: number) => {
    const value = clampWidth(next);
    setWidth(value);
    setWidthVariable(value);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(value));
    } catch {
      // private mode: the width lasts as long as the page
    }
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const aside = event.currentTarget.parentElement;
    // the shell is zoomed (skin §42): a pointer moves in screen pixels, the width is in the shell's
    const zoom = aside && aside.offsetWidth > 0 ? aside.getBoundingClientRect().width / aside.offsetWidth : 1;
    drag.current = { startX: event.clientX, startWidth: width, zoom: zoom || 1, moved: false, live: width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("bf-side-resizing");
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      // not dragging: the tip follows the pointer up and down the divider (in the zoomed shell's pixels)
      const handle = event.currentTarget;
      const box = handle.getBoundingClientRect();
      const zoom = handle.offsetHeight > 0 ? box.height / handle.offsetHeight : 1;
      handle.style.setProperty("--lbl-tip-y", `${Math.round(Math.max(0, event.clientY - box.top) / (zoom || 1))}px`);
      return;
    }
    // a few pixels of wobble is still a click
    if (!current.moved && Math.abs(event.clientX - current.startX) < 3) return;
    current.moved = true;
    current.live = clampWidth(current.startWidth + (event.clientX - current.startX) / current.zoom);
    // straight onto the variable while dragging, so a resize never re-renders anything
    setWidthVariable(current.live);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("bf-side-resizing");
    if (current.moved) commitWidth(current.live);
    // a click on the divider, rather than a drag, closes the sidebar — as the reference's does
    else onToggleCollapsed();
  };
  const onHandleKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next =
      event.key === "ArrowLeft"
        ? width - step
        : event.key === "ArrowRight"
          ? width + step
          : event.key === "Home"
            ? SIDE_WIDTH.min
            : event.key === "End"
              ? SIDE_WIDTH.max
              : null;
    if (next === null) return;
    event.preventDefault();
    commitWidth(next);
  };

  /* ---- ⌘\ (Ctrl+\): close or open the sidebar from anywhere ---- */
  const toggleRef = useRef(onToggleCollapsed);
  useEffect(() => {
    toggleRef.current = onToggleCollapsed;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key === "\\") {
        event.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- the page you are on stays in view ----
     The list is longer than the column on a short window, so a row can sit below the fold —
     the current page's included, after a page is opened from somewhere else. Brought into
     view when the page changes or the column opens; left alone while it is already showing. */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    const active = scroller?.querySelector<HTMLElement>(".lbl-item.is-active");
    if (!scroller || !active) return;
    const box = scroller.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    if (row.top >= box.top && row.bottom <= box.bottom) return;
    // the shell is zoomed (skin §42): the rects are in screen pixels, scrollTop in the shell's
    const zoom = scroller.clientHeight > 0 ? box.height / scroller.clientHeight : 1;
    scroller.scrollTop += (row.top - box.top - (box.height - row.height) / 2) / (zoom || 1);
  }, [page, collapsed]);

  // the Create menu closes on a press elsewhere or on Escape, like the program's other menus
  useEffect(() => {
    if (!createOpen) return;
    const away = (event: PointerEvent) => {
      if (!createRef.current?.contains(event.target as Node)) setCreateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [createOpen]);

  if (collapsed) {
    return (
      <button
        type="button"
        className="hs-rail-show lbl-show"
        aria-label="Show the sidebar"
        title="Show the sidebar"
        onClick={onToggleCollapsed}
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  const open = (target: string) => {
    const addOn = lockedFor(target);
    if (addOn) onRequestAddOn(addOn);
    else onNavigate(target);
  };

  // every row's place top to bottom, folded or not, for the opening's stagger — worked out from the
  // sections themselves rather than counted while rendering, so a second render cannot shift it
  const order = new Map<string, number>();
  const place = (key: string) => {
    if (!order.has(key)) order.set(key, order.size);
  };
  primary.forEach((entry) => place(keyOf(entry)));
  for (const group of groups) {
    place(`head:${group.id}`);
    group.entries?.forEach((entry) => place(keyOf(entry)));
    group.more?.forEach((entry) => place(keyOf(entry)));
    if (group.more?.length) place(`more:${group.id}`);
    if (group.team) {
      place(`team:${group.team.id}`);
      group.team.entries.forEach((entry) => place(keyOf(entry)));
    }
  }
  const indexOf = (key: string) => order.get(key) ?? 0;

  const row = (entry: SideEntry) => {
    const Icon = entry.icon;
    const index = indexOf(keyOf(entry));
    if (entry.kind === "action") {
      return (
        <li key={entry.id} className="lbl-row" style={at(index)}>
          <button type="button" className="lbl-item" aria-label={entry.ariaLabel} aria-haspopup={entry.opens} onClick={entry.onSelect}>
            <Icon size={16} aria-hidden="true" />
            <span className="lbl-label">{entry.label}</span>
          </button>
        </li>
      );
    }
    const active = entry.page === page;
    const locked = lockedFor(entry.page) !== null;
    const tag = tagFor?.(entry.page) ?? null;
    return (
      <li key={entry.page} className={`lbl-row${active ? " is-active" : ""}`} style={at(index)}>
        <button
          type="button"
          className={`lbl-item${active ? " is-active" : ""}${locked ? " is-locked" : ""}`}
          aria-current={active ? "page" : undefined}
          // named as the rail's hubs are: "Gantt Chart (New)", "My time (add-on)"
          aria-label={[entry.label, tag && `(${tag})`, locked && "(add-on)"].filter(Boolean).join(" ")}
          data-tutorial-id={`nav-${entry.page}`}
          title={locked ? `${entry.label} is an add-on: see where to get it` : undefined}
          onClick={() => open(entry.page)}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="lbl-label">{entry.label}</span>
          {tag && (
            <span className={`lbl-tag ${tag.toLowerCase()}`} aria-hidden="true">
              {tag}
            </span>
          )}
          {locked && <CircleArrowUp size={15} className="lbl-lock" aria-hidden="true" />}
        </button>
      </li>
    );
  };

  return (
    <aside className="lbl-side" aria-label="Primary navigation">
      {/* the divider is the handle: drag to resize, click to close (the reference's tip says so) */}
      <div
        className="lbl-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sidebar"
        aria-valuemin={SIDE_WIDTH.min}
        aria-valuemax={SIDE_WIDTH.max}
        aria-valuenow={width}
        aria-keyshortcuts="Meta+Backslash Control+Backslash"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHandleKey}
      >
        <span className="lbl-resize-tip" aria-hidden="true">
          <span>
            <strong>Close</strong> Click or ⌘\
          </span>
          <span>
            <strong>Resize</strong> Drag
          </span>
        </span>
      </div>
      {brand && (
        <div className="lbl-brandmark">
          <img src={brand.logo} alt="" width={32} height={32} />
          <span className="lbl-brandmark-text">
            <strong>{brand.name}</strong>
            <em>{brand.tagline}</em>
          </span>
        </div>
      )}
      <div className="lbl-head">
        <div className="lbl-ws">{switcher}</div>
        {/* "Search", not "Search BuildFlow": that is the top bar's field, which stays beside it */}
        <button type="button" className="lbl-icon-btn" aria-label="Search" title="Search (⌘K)" onClick={onOpenSearch}>
          <Search size={16} aria-hidden="true" />
        </button>
        <div className="lbl-create" ref={createRef}>
          <button
            type="button"
            className="lbl-icon-btn is-round"
            aria-label="Create"
            title="Create"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            aria-controls={createOpen ? createMenuId : undefined}
            onClick={() => setCreateOpen((current) => !current)}
          >
            <SquarePen size={15} aria-hidden="true" />
          </button>
          {createOpen && (
            <div className="hs-menu lbl-create-menu" id={createMenuId} role="menu" aria-label="Create">
              <div className="hs-menu-head">Create</div>
              {createItems.map((entry) => {
                const EntryIcon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className="hs-menu-item"
                    onClick={() => {
                      setCreateOpen(false);
                      open(entry.page);
                    }}
                  >
                    <EntryIcon size={16} aria-hidden="true" />
                    <span>{entry.label}</span>
                    <em className="lbl-create-where">{entry.where}</em>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* the pages and the news scroll together, so a short window gives its height to the rows
          and the news waits below them; the foot (Settings, the person, the hide arrow) stays put */}
      <div className="lbl-scroll" ref={scrollRef}>
        <nav className="lbl-nav" aria-label="Pages">
          <ul className="lbl-list">{primary.map(row)}</ul>
          {groups.map((group) => (
            <Group key={group.id} group={group} row={row} page={page} indexOf={indexOf} />
          ))}
        </nav>
        {whatsNew && (
          <button type="button" className="lbl-news" onClick={whatsNew.onOpen} aria-haspopup="dialog">
            <span className="lbl-news-eyebrow">What&rsquo;s new</span>
            <span className="lbl-news-title">{whatsNew.title}</span>
          </button>
        )}
      </div>

      <div className="lbl-foot">
        <div className="lbl-foot-row">
          {profile ? (
            <>
              <div className="lbl-profile">
                <span className="lbl-profile-avatar" aria-hidden="true">
                  {profile.initials}
                </span>
                <span className="lbl-profile-id">
                  <strong>{profile.name}</strong>
                  <em>{profile.role}</em>
                </span>
              </div>
              <button type="button" className="lbl-icon-btn" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
                <Settings size={16} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className="lbl-item" onClick={onOpenSettings}>
              <Settings size={16} aria-hidden="true" />
              <span className="lbl-label">Settings</span>
            </button>
          )}
          <button type="button" className="lbl-icon-btn" aria-label="Hide the sidebar" title="Hide the sidebar" onClick={onToggleCollapsed}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Group({
  group,
  row,
  page,
  indexOf
}: {
  group: SideGroup;
  row: (entry: SideEntry) => ReactNode;
  page: string;
  indexOf: (key: string) => number;
}) {
  const [open, toggle] = useOpen(group.id);
  const [teamOpen, toggleTeam] = useOpen(group.team ? `team:${group.team.id}` : `team:${group.id}`);
  const [moreOpen, setMoreOpen] = useState(() => Boolean(group.more?.some((entry) => entry.kind === "page" && entry.page === page)));
  const listId = useId();
  const teamListId = useId();
  const team = group.team;
  const teamHolds = team?.entries.some((entry) => entry.kind === "page" && entry.page === page) ?? false;
  return (
    <section className={`lbl-group${open ? " is-open" : ""}`} aria-label={group.label}>
      <div className="lbl-group-head" style={at(indexOf(`head:${group.id}`))}>
        <button type="button" className="lbl-group-toggle" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={toggle}>
          <span>{group.label}</span>
          <Caret />
        </button>
        {group.add && (
          <button type="button" className="lbl-group-add" aria-label={group.add.label} title={group.add.label} onClick={group.add.onSelect}>
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <ul className="lbl-list" id={listId}>
          {group.entries?.map(row)}
          {moreOpen && group.more?.map(row)}
          {group.more && group.more.length > 0 && (
            <li className="lbl-row" style={at(indexOf(`more:${group.id}`))}>
              <button
                type="button"
                className="lbl-item lbl-more"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((current) => !current)}
              >
                <Ellipsis size={16} aria-hidden="true" />
                <span className="lbl-label">{moreOpen ? "Less" : "More"}</span>
              </button>
            </li>
          )}
          {team && (
            <li className={`lbl-team${teamOpen ? " is-open" : ""}${teamHolds ? " holds-page" : ""}`}>
              <button
                type="button"
                className="lbl-item lbl-team-row"
                style={at(indexOf(`team:${team.id}`))}
                aria-expanded={teamOpen}
                aria-controls={teamOpen ? teamListId : undefined}
                onClick={toggleTeam}
              >
                <span className="lbl-team-tile" aria-hidden="true">
                  {team.initial}
                </span>
                <span className="lbl-label">{team.label}</span>
                <ChevronDown size={14} className="lbl-team-caret" aria-hidden="true" />
              </button>
              {teamOpen && (
                <ul className="lbl-list lbl-team-list" id={teamListId}>
                  {team.entries.map(row)}
                </ul>
              )}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
