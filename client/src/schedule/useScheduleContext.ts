/**
 * One schedule context for the whole hub: the week and month being looked at
 * and the filters — project, crew type, crew, region, the status set — kept
 * per user in localStorage so every Schedule page opens where the last one
 * left off and a reload keeps it. The same context is what a schedule deep
 * link carries: `#schedule` is the landing, `#schedule/<page>` a page, and the
 * query holds the context (`?w=2026-07-13&crewType=Concrete&project=p-1`).
 */
import { useCallback, useEffect, useState } from "react";
import { JOB_STATUSES, type Status } from "@buildflow/shared";

/** Every job / booking status, in the order the status filter lists them. */
export const SCHEDULE_STATUSES: Status[] = [...JOB_STATUSES]; // the one shared list, in workflow order

export type ScheduleContext = {
  /** Monday of the week shown (YYYY-MM-DD). */
  weekStart: string | null;
  /** First day of the month shown (YYYY-MM-DD). */
  monthAnchor: string | null;
  /** A crew specialty, or null for all crew types. */
  crewType: string | null;
  /** One crew, or null for all crews. */
  crewId: string | null;
  /** One project, or null for all projects. */
  projectId: string | null;
  /** A job location (the region), or null for everywhere. */
  region: string | null;
  /** The statuses kept visible, or null for all of them. */
  statuses: Status[] | null;
};

export const EMPTY_SCHEDULE_CONTEXT: ScheduleContext = {
  weekStart: null,
  monthAnchor: null,
  crewType: null,
  crewId: null,
  projectId: null,
  region: null,
  statuses: null
};
const CONTEXT_KEYS = Object.keys(EMPTY_SCHEDULE_CONTEXT) as Array<keyof ScheduleContext>;

const storageKey = (userId: string) => `bf:schedule:context:${userId}`;
/** Fired on window after every write, so every mounted schedule page follows a change made elsewhere (a pasted link, another page). */
export const SCHEDULE_CONTEXT_EVENT = "bf:schedule-context";
export const sameScheduleContext = (a: ScheduleContext, b: ScheduleContext) =>
  CONTEXT_KEYS.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));

const isStatus = (value: string): value is Status => (SCHEDULE_STATUSES as string[]).includes(value);

/**
 * The real statuses in a list, each once.
 *
 * The de-duplicating matters more than it looks: a filter of every status means no filter, and
 * that is decided by counting the list. Ten copies of "Ready" is not every status, but it counted
 * as ten, so the link quietly showed the whole board and dropped its own chip.
 */
const uniqueStatuses = (values: unknown): Status[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<Status>();
  for (const value of values) if (typeof value === "string" && isStatus(value)) seen.add(value);
  return [...seen];
};

/* ── deep links ─────────────────────────────────────────────────────────── */

export const SCHEDULE_PAGES = ["schedule", "month", "week", "list", "kanban", "matrix", "gantt"] as const;
export type SchedulePage = (typeof SCHEDULE_PAGES)[number];
export const isSchedulePage = (page: string): page is SchedulePage => (SCHEDULE_PAGES as readonly string[]).includes(page);

/** Which parts of the context each page carries in its link: its date, then the filters every page shares. */
const FILTER_KEYS: Array<keyof ScheduleContext> = ["projectId", "crewType", "crewId", "region", "statuses"];
const LINK_KEYS: Record<SchedulePage, Array<keyof ScheduleContext>> = {
  schedule: ["weekStart", ...FILTER_KEYS],
  month: ["monthAnchor", ...FILTER_KEYS],
  week: ["weekStart", ...FILTER_KEYS],
  list: ["weekStart", ...FILTER_KEYS],
  kanban: FILTER_KEYS,
  matrix: ["weekStart", ...FILTER_KEYS],
  gantt: FILTER_KEYS
};
const PARAM_NAMES: Record<keyof ScheduleContext, string> = {
  weekStart: "w",
  monthAnchor: "m",
  crewType: "crewType",
  crewId: "crew",
  projectId: "project",
  region: "region",
  statuses: "status"
};

/** The link for a page, carrying the parts of the context that page uses. */
export function scheduleHash(page: SchedulePage, context: ScheduleContext): string {
  const params = new URLSearchParams();
  for (const key of LINK_KEYS[page]) {
    const value = context[key];
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(PARAM_NAMES[key], value.join(","));
    } else if (value) params.set(PARAM_NAMES[key], value);
  }
  const query = params.toString();
  return `#schedule${page === "schedule" ? "" : `/${page}`}${query ? `?${query}` : ""}`;
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** A schedule link back into a page and the context it asks for; null for any other hash. */
export function parseScheduleHash(hash: string): { page: SchedulePage; patch: Partial<ScheduleContext> } | null {
  if (!hash.startsWith("#schedule")) return null;
  const [path, query = ""] = hash.slice(1).split("?");
  const [root, sub, extra] = path.split("/");
  if (root !== "schedule" || extra !== undefined) return null;
  let page: SchedulePage | null = !sub ? "schedule" : isSchedulePage(sub) && sub !== "schedule" ? sub : null;
  if (!page) return null;
  const params = new URLSearchParams(query);
  // the board's old `?view=Week` links open the page that view became
  const view = params.get("view")?.toLowerCase();
  if (page === "schedule" && view && isSchedulePage(view) && view !== "schedule") page = view;
  const patch: Partial<ScheduleContext> = {};
  const week = params.get("w");
  if (week && isDay(week)) patch.weekStart = week;
  const month = params.get("m");
  if (month && isDay(month)) patch.monthAnchor = month;
  const crewType = params.get("crewType");
  if (crewType) patch.crewType = crewType;
  const crew = params.get("crew");
  if (crew) patch.crewId = crew;
  const project = params.get("project");
  if (project) patch.projectId = project;
  const region = params.get("region");
  if (region) patch.region = region;
  const statuses = uniqueStatuses((params.get("status") ?? "").split(","));
  if (statuses.length > 0) patch.statuses = statuses;
  return { page, patch };
}

/** Keeps a schedule link's query in step with what is stored — no new history entry. */
export function syncScheduleHash(userId: string) {
  if (typeof window === "undefined") return;
  const link = parseScheduleHash(window.location.hash);
  if (!link) return;
  const next = scheduleHash(link.page, readScheduleContext(userId));
  if (next !== window.location.hash) window.history.replaceState(window.history.state, "", next);
}

/* A link opened before signing in is remembered from the first load; the way into the
   app consumes the page, and the first read of the context applies its query. */
let pendingLink = typeof window !== "undefined" ? parseScheduleHash(window.location.hash) : null;
let pendingPatch: Partial<ScheduleContext> | null = null;

/** A schedule link in the hash right now becomes the pending deep link — a fresh load with a session enters through it. */
export function noteScheduleDeepLink(): { page: SchedulePage } | null {
  const link = typeof window !== "undefined" ? parseScheduleHash(window.location.hash) : null;
  if (link) pendingLink = link;
  return link ? { page: link.page } : null;
}

export function consumeScheduleDeepLink(): { page: SchedulePage } | null {
  if (!pendingLink) return null;
  const { page, patch } = pendingLink;
  pendingLink = null;
  pendingPatch = Object.keys(patch).length > 0 ? patch : null;
  return { page };
}

/* ── storage ─────────────────────────────────────────────────────────────── */

/** Only the known keys, with a status list that holds real statuses (or nothing at all). */
function normalise(raw: Partial<ScheduleContext>): ScheduleContext {
  const next: ScheduleContext = { ...EMPTY_SCHEDULE_CONTEXT };
  for (const key of CONTEXT_KEYS) {
    const value = raw[key];
    if (key === "statuses") {
      const statuses = uniqueStatuses(value);
      next.statuses = statuses.length > 0 ? statuses : null;
    } else if (typeof value === "string" && value) next[key] = value;
  }
  return next;
}

/* ── the week and the month keep each other company ──
   The time you were looking at follows you: stepping weeks moves the month along
   with them, and paging to a month the week is not in brings the week to it. A
   patch that sets both is taken as given. */
const firstOfMonthOf = (day: string) => `${day.slice(0, 7)}-01`;
const mondayOnOrBefore = (day: string) => {
  const date = new Date(`${day}T00:00:00`);
  const weekday = date.getDay();
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export function coupleWeekAndMonth(next: ScheduleContext, patch: Partial<ScheduleContext>): ScheduleContext {
  const weekGiven = typeof patch.weekStart === "string";
  const monthGiven = typeof patch.monthAnchor === "string";
  if (weekGiven && !monthGiven && next.weekStart) return { ...next, monthAnchor: firstOfMonthOf(next.weekStart) };
  if (monthGiven && !weekGiven && next.monthAnchor) {
    const inMonth = next.weekStart?.slice(0, 7) === next.monthAnchor.slice(0, 7);
    return inMonth ? next : { ...next, weekStart: mondayOnOrBefore(next.monthAnchor) };
  }
  return next;
}

export function readScheduleContext(userId: string): ScheduleContext {
  let stored = EMPTY_SCHEDULE_CONTEXT;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw) stored = normalise(JSON.parse(raw) as Partial<ScheduleContext>);
  } catch {
    stored = EMPTY_SCHEDULE_CONTEXT;
  }
  if (pendingPatch) {
    const patch = pendingPatch;
    pendingPatch = null;
    return writeScheduleContext(userId, patch);
  }
  return stored;
}

/** Merges `patch` into what is stored, updates a schedule link if one is showing, and returns the result. */
export function writeScheduleContext(userId: string, patch: Partial<ScheduleContext>): ScheduleContext {
  const next = coupleWeekAndMonth(normalise({ ...readScheduleContext(userId), ...patch }), patch);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* private mode: the context just does not stick */
  }
  syncScheduleHash(userId);
  window.dispatchEvent(new CustomEvent(SCHEDULE_CONTEXT_EVENT, { detail: { userId } }));
  return next;
}

/** The context as state: read once on mount, and every update is persisted as it happens. */
export function useScheduleContext(userId: string): [ScheduleContext, (patch: Partial<ScheduleContext>) => void] {
  const [context, setContext] = useState<ScheduleContext>(() => readScheduleContext(userId));
  // a change made elsewhere (a pasted link, another page) reaches this page too
  useEffect(() => {
    const follow = () =>
      setContext((current) => (sameScheduleContext(current, readScheduleContext(userId)) ? current : readScheduleContext(userId)));
    window.addEventListener(SCHEDULE_CONTEXT_EVENT, follow);
    return () => window.removeEventListener(SCHEDULE_CONTEXT_EVENT, follow);
  }, [userId]);
  const update = useCallback(
    (patch: Partial<ScheduleContext>) => {
      setContext(writeScheduleContext(userId, patch));
    },
    [userId]
  );
  return [context, update];
}
