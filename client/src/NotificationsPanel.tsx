/**
 * The notifications drawer, on the monday.com layout the user pointed at.
 *
 * Its anatomy, top to bottom: the title with a settings button, a "more" menu and a close;
 * three tabs; a search field with an unread-only toggle beside it; the list; and an empty
 * state with its own copy and a way out. BuildFlow's own surfaces, tokens and type — the
 * layout is monday's, the design language is this product's.
 *
 * THREE THINGS IT DOES THAT THE OLD PANEL DID NOT.
 *
 * It shows ALL of them. `buildNotificationItems` used to end `.slice(0, 7)`, so the bell had
 * been quietly dropping everything past the seventh newest. The cap is gone and this scrolls.
 *
 * Read state is real. monday's unread toggle needs something behind it, so read ids are kept
 * per user in localStorage — clicking a row marks it read, and the "more" menu marks the lot.
 * The bell's badge counts UNREAD, which is what a badge is for.
 *
 * The third tab means something. monday's is "Assigned to me"; BuildFlow has no per-person
 * assignment on a notification, so inventing that tab would leave it permanently empty.
 * "Projects I manage" is the true analogue and it is derivable from `project.managerId`.
 *
 * AND A ROW GOES SOMEWHERE. A notification that only says a thing happened makes the reader
 * hunt for the thing; clicking one now opens the page that owns the record and lights the
 * record itself. Where the work lives is decided in `buildNotificationItems`, which is the
 * only place that knows what each kind of notification is about — see `NotificationTarget`.
 * A row whose notification has no target stays a plain row rather than a dead control.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronRight, MoreHorizontal, Search, Settings, X } from "lucide-react";
import type { BootstrapPayload } from "@buildflow/shared";
import type { NotificationItem, NotificationTarget } from "./App";

export type NotificationTab = "all" | "attention" | "mine";

const TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "mine", label: "Projects I manage" }
];

/** Red and amber are the two tones that mean someone has to do something. */
const needsAttention = (item: NotificationItem) => item.tone === "red" || item.tone === "amber";

const readKey = (userId: string) => `bf:notifications:read:${userId}`;
const seenKey = (userId: string) => `bf:notifications:seen:${userId}`;

function storedIds(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    // private mode, or a corrupt value: everything simply reads as new
    return new Set();
  }
}

/**
 * Two things a notification can be, kept apart because they answer different questions.
 *
 * SEEN is what the bell's badge counts: has this person been shown it yet? Opening the drawer
 * shows them everything in it, so opening marks the lot seen and the badge clears — which is
 * what a badge that says "15" has to mean, or it says 15 forever. READ is per row: has this
 * one been opened? It is the dot on the row and the "Unread only" switch, and it only changes
 * when the row is clicked or "Mark all as read" is used. Marking read implies seen; seeing does
 * not imply read. Both are kept per person.
 */
export function useReadNotifications(userId: string) {
  const [read, setRead] = useState<Set<string>>(() => storedIds(readKey(userId)));
  const [seen, setSeen] = useState<Set<string>>(() => storedIds(seenKey(userId)));
  useEffect(() => {
    setRead(storedIds(readKey(userId)));
    setSeen(storedIds(seenKey(userId)));
  }, [userId]);
  const persist = (key: string, next: Set<string>) => {
    try {
      window.localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      /* the in-memory copy still stands for this session */
    }
  };
  const addSeen = (ids: string[]) => {
    if (ids.every((id) => seen.has(id))) return;
    const next = new Set([...seen, ...ids]);
    setSeen(next);
    persist(seenKey(userId), next);
  };
  const addRead = (ids: string[]) => {
    if (ids.every((id) => read.has(id))) return;
    const next = new Set([...read, ...ids]);
    setRead(next);
    persist(readKey(userId), next);
    addSeen(ids);
  };
  return {
    isRead: (id: string) => read.has(id),
    isSeen: (id: string) => seen.has(id),
    markRead: (id: string) => addRead([id]),
    markAllRead: (all: string[]) => addRead(all),
    /** The drawer has been opened on these: the badge stops counting them. */
    markSeen: (all: string[]) => addSeen(all)
  };
}

/**
 * What the row promises, for the screen reader. The visible row already reads as a link from
 * its chevron and its hover; someone who cannot see either needs to be told where it goes,
 * and "Open Inventory" is a more useful thing to hear than "button".
 */
const PAGE_LABELS: Record<string, string> = {
  inventory: "Inventory",
  field: "Field updates",
  delayIQs: "DelayIQs"
};
const PANEL_LABELS: Record<string, string> = {
  weather: "WeatherIQ on the Dashboard",
  inspections: "Upcoming Inspections on the Dashboard"
};
function targetLabel(target?: NotificationTarget): string {
  if (!target) return "BuildFlow";
  if (target.kind === "record") return PAGE_LABELS[target.page] ?? "the record";
  if (target.kind === "panel") return PANEL_LABELS[target.panelId] ?? "the Dashboard";
  return "the Month calendar";
}

/** "3m ago" / "in 4d" — the same shape the rest of the app uses. */
function relativeStamp(iso: string, now = Date.now()): string {
  const at = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();
  if (Number.isNaN(at)) return "";
  const diff = at - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  if (mins < 1) return "just now";
  const hours = Math.round(mins / 60);
  const label = mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${Math.round(mins / 1440)}d`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}

export type NotificationsPanelProps = {
  id: string;
  items: NotificationItem[];
  data: BootstrapPayload;
  onClose: () => void;
  /** The gear in the header. Settings is where notification delivery is configured. */
  onOpenSettings?: () => void;
  /** Clicking a row: go to where the work is. Absent in a context that cannot navigate. */
  onOpen?: (target: NotificationTarget) => void;
  read: ReturnType<typeof useReadNotifications>;
};

export function NotificationsPanel({ id, items, data, onClose, onOpenSettings, onOpen, read }: NotificationsPanelProps) {
  const [tab, setTab] = useState<NotificationTab>("all");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const away = (event: globalThis.MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [moreOpen]);

  /** The projects this person manages, which is what the third tab filters on. */
  const myProjects = useMemo(
    () => new Set(data.projects.filter((project) => project.managerId === data.activeUser.id).map((project) => project.id)),
    [data.projects, data.activeUser.id]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (tab === "attention" && !needsAttention(item)) return false;
      if (tab === "mine" && !(item.projectId && myProjects.has(item.projectId))) return false;
      if (unreadOnly && read.isRead(item.id)) return false;
      if (!needle) return true;
      return `${item.title} ${item.detail}`.toLowerCase().includes(needle);
    });
  }, [items, tab, query, unreadOnly, myProjects, read]);

  const unreadCount = items.filter((item) => !read.isRead(item.id)).length;
  const countFor = (id: NotificationTab) =>
    id === "all"
      ? items.length
      : id === "attention"
        ? items.filter(needsAttention).length
        : items.filter((item) => item.projectId && myProjects.has(item.projectId)).length;

  return (
    /* role and name are unchanged: tutorial.test.tsx finds this panel by them */
    <section className="bfnt" id={id} aria-label="Recent BuildFlow activity">
      <header className="bfnt-head">
        <h2>Notifications</h2>
        <div className="bfnt-head-actions">
          {onOpenSettings && (
            <button type="button" className="bfnt-icon" aria-label="Notification settings" onClick={onOpenSettings}>
              <Settings size={17} />
            </button>
          )}
          <div className="bfnt-more" ref={moreRef}>
            <button
              type="button"
              className="bfnt-icon"
              aria-label="More notification actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreHorizontal size={18} />
            </button>
            {moreOpen && (
              <div className="bfnt-more-menu" role="menu" aria-label="Notification actions">
                <button
                  type="button"
                  role="menuitem"
                  disabled={unreadCount === 0}
                  onClick={() => {
                    read.markAllRead(items.map((item) => item.id));
                    setMoreOpen(false);
                  }}
                >
                  <Check size={15} /> Mark all as read
                </button>
              </div>
            )}
          </div>
          <span className="bfnt-head-divider" aria-hidden="true" />
          <button type="button" className="bfnt-icon" aria-label="Close notifications" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="bfnt-tabs" role="tablist" aria-label="Notification filters">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`bfnt-tab${tab === entry.id ? " is-active" : ""}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            <span className="bfnt-tab-count">{countFor(entry.id)}</span>
          </button>
        ))}
      </div>

      <div className="bfnt-filter">
        <span className="bfnt-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notifications by project, crew and more…"
            aria-label="Search notifications"
          />
        </span>
        <label className="bfnt-toggle">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          <span className="bfnt-toggle-track" aria-hidden="true" />
          Unread only
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="bfnt-empty">
          <span className="bfnt-empty-mark" aria-hidden="true">
            <Bell size={26} />
          </span>
          <strong>No notifications to show</strong>
          <p>
            {items.length === 0
              ? "Delays, weather, material and equipment changes will appear here as your crews start reporting."
              : "Nothing matches this filter. Try another tab, or clear the search."}
          </p>
          {items.length > 0 && (
            <button
              type="button"
              className="bfnt-empty-action"
              onClick={() => {
                setTab("all");
                setQuery("");
                setUnreadOnly(false);
              }}
            >
              Show everything
            </button>
          )}
        </div>
      ) : (
        <div className="bfnt-list">
          {shown.map((item) => {
            const Icon = item.icon;
            const isRead = read.isRead(item.id);
            /* Only a row that has somewhere to go acts like a link. The drawer closes on the
               way out, because the page underneath is the answer and the drawer covers it. */
            const goes = Boolean(item.target && onOpen);
            const open = () => {
              read.markRead(item.id);
              if (!item.target || !onOpen) return;
              onClose();
              onOpen(item.target);
            };
            return (
              <button
                key={item.id}
                type="button"
                className={`bfnt-row ${item.tone}${isRead ? " is-read" : ""}${goes ? " is-link" : ""}`}
                onClick={open}
                aria-label={goes ? `${item.title}. ${item.detail} Open ${targetLabel(item.target)}.` : undefined}
              >
                <span className="bfnt-row-mark" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <span className="bfnt-row-body">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </span>
                <span className="bfnt-row-meta">
                  <time dateTime={item.timestamp}>{relativeStamp(item.timestamp)}</time>
                  {!isRead && <i className="bfnt-row-dot" aria-label="Unread" />}
                </span>
                {goes && (
                  <span className="bfnt-row-go" aria-hidden="true">
                    <ChevronRight size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
