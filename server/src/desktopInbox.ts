/* =========================================================================
   The Mac's inbox: one compact read (notch plan, feature 2 and step 3).

   The notch shows four tabs — Notifications, Jobs, Meetings, Tasks — and a
   greeting. Everything it shows comes from this one answer, so the Mac never
   downloads /api/bootstrap (every row in the workspace, and inline photos).

   PURE, AND NO ROUTE YET. This builds the answer from what the caller already
   has: the store's bootstrap for the account, the account, the workspace's
   name, the person's read state (a per-person setting), and the meetings the
   calendar cache holds. It reads nothing and writes nothing, because every
   write rewrites the whole database file and the Mac asks every minute. The
   route, GET /api/desktop/inbox, is step 5's, on top of the device-key auth
   being built on another branch; see the notes at the end of this file.

   THE SAME LIST AS THE BELL. Notifications, the greeting, the meeting clock,
   the jobs and the tasks are all @buildflow/shared's — the website's bell,
   Dashboard greeting and Meetings panel read the very same functions — so the
   notch's unseen count and the bell's badge are one number.

   AN ETAG. `etag` is a hash of the answer's content, so the Mac can send
   If-None-Match and be told 304 when nothing changed. It leaves out what
   changes on every build without anything having happened: `generatedAt`, and
   the time on equipment rows, which are stamped "now" each build.
   ========================================================================= */
import crypto from "node:crypto";
import {
  NOTIFICATION_STATE_SETTING,
  allDaySpan,
  buildNotificationItems,
  decodeNotificationState,
  greetingFor,
  isNotificationRead,
  isNotificationSeen,
  localIsoDate,
  meetingState,
  needsYou,
  upNext,
  upcomingJobs,
  type BootstrapPayload,
  type GreetingKind,
  type MeetingState,
  type NeedsYouCapability,
  type NeedsYouTask,
  type NotificationDestination,
  type NotificationKind,
  type NotificationRecordRef,
  type NotificationTone,
  type PendingTimeEntry,
  type PermissionLevel,
  type UpcomingJob
} from "@buildflow/shared";
import type { CalendarEvent, CalendarProvider } from "./calendar.js";

export type DesktopNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  /** The line under the title (the bell's "detail"). */
  sub: string;
  tone: NotificationTone;
  /** ISO instant, or YYYY-MM-DD for the sources that only carry a day. */
  at: string;
  seen: boolean;
  read: boolean;
  /** False for equipment: it is stamped "now" every build, so it must never raise an alert. */
  alertable: boolean;
  projectId: string | null;
  /** The record, { kind, id }: what step 5 forms an "open in BuildFlow" link from. */
  target: NotificationRecordRef;
  /** Where the website opens it today. */
  opens: NotificationDestination;
};

export type DesktopMeeting = {
  id: string;
  provider: CalendarProvider;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  joinUrl: string;
  conference: string;
  location: string;
  myResponse: CalendarEvent["myResponse"];
  /** Against the clock when this was built: "soon" is the last fifteen minutes. The Mac counts down itself. */
  state: MeetingState;
};

export type DesktopInbox = {
  version: 1;
  generatedAt: string;
  /** The reader's date, YYYY-MM-DD, in their time zone when it was given. */
  today: string;
  me: {
    userId: string;
    name: string;
    firstName: string;
    workspace: string;
    role: PermissionLevel;
    greeting: { kind: GreetingKind; text: string };
  };
  counts: {
    /** Every notification, before the list below is cut to the newest. */
    notifications: number;
    /** Not yet shown to this person: the bell's badge. */
    unseen: number;
    unread: number;
    tasks: number;
    jobsToday: number;
    meetingsToday: number;
  };
  notifications: DesktopNotification[];
  jobs: UpcomingJob[];
  meetings: DesktopMeeting[];
  /** Which calendars are connected, and which could not be read this time. */
  calendar: { connected: CalendarProvider[]; failed: CalendarProvider[] };
  tasks: NeedsYouTask[];
};

export type DesktopInboxInput = {
  /** The store's bootstrap for this account: `store.bootstrap(account.id)`. */
  data: BootstrapPayload;
  account: { id: string; name: string; role: PermissionLevel };
  workspace: { name: string };
  /** The person's meetings (from calendarEventCache), and which providers answered. */
  meetings?: { events: CalendarEvent[]; connected?: CalendarProvider[]; failed?: CalendarProvider[] };
  /** The stored read state; by default the one bootstrap carries in `userSettings`. */
  readState?: string;
  /** Submitted time, once the TimeCard feature is merged (shared PendingTimeEntry). */
  timeEntries?: PendingTimeEntry[];
  now?: number;
  /** The Mac's IANA zone, for "today" and the greeting; the server's own clock otherwise. */
  timeZone?: string;
  /** When this person was last active, for "Welcome back". */
  lastActiveAt?: string | number | null;
  /** The server's permission check for this person (permissions.ts `can`); their level decides otherwise. */
  can?: (capability: NeedsYouCapability) => boolean;
  limits?: { notifications?: number; jobs?: number; meetings?: number };
};

/** A day, YYYY-MM-DD, on the reader's calendar. */
export function dayIn(now: number, timeZone?: string): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    } catch {
      /* an unknown zone: the server's own calendar */
    }
  }
  return localIsoDate(new Date(now));
}

export function buildDesktopInbox(input: DesktopInboxInput): { inbox: DesktopInbox; etag: string } {
  const now = input.now ?? Date.now();
  const { data, account } = input;
  const today = dayIn(now, input.timeZone);
  const limits = { notifications: 100, jobs: 50, meetings: 8, ...input.limits };

  const state = decodeNotificationState(input.readState ?? data.userSettings?.[NOTIFICATION_STATE_SETTING]);
  const all = buildNotificationItems(data, now);
  const notifications: DesktopNotification[] = all.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    sub: item.detail,
    tone: item.tone,
    at: item.timestamp,
    seen: isNotificationSeen(state, item),
    read: isNotificationRead(state, item),
    alertable: item.alertable,
    projectId: item.projectId ?? null,
    target: item.target,
    opens: item.opens
  }));

  const userId = data.activeUser?.id ?? "";
  const jobs = upcomingJobs(data, { today, userId, limit: limits.jobs });
  const tasks = needsYou(data, { today, userId, permission: account.role, can: input.can, timeEntries: input.timeEntries });

  const events = input.meetings?.events ?? [];
  const meetings: DesktopMeeting[] = upNext(events, now, limits.meetings, today).map((event) => ({
    id: event.id,
    provider: event.provider,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    joinUrl: event.joinUrl,
    conference: event.conference,
    location: event.location,
    myResponse: event.myResponse,
    state: meetingState(event, now, today)
  }));
  const meetsToday = (meeting: DesktopMeeting) => {
    if (meeting.allDay) {
      const span = allDaySpan(meeting);
      return span.first <= today && today <= span.last;
    }
    return dayIn(new Date(meeting.startsAt).getTime(), input.timeZone) === today;
  };

  const name = data.activeUser?.name || account.name;
  const greeting = greetingFor({ name, now, lastActiveAt: input.lastActiveAt, timeZone: input.timeZone });
  const inbox: DesktopInbox = {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    today,
    me: {
      userId,
      name,
      firstName: greeting.firstName,
      workspace: input.workspace.name,
      role: account.role,
      greeting: { kind: greeting.kind, text: greeting.text }
    },
    counts: {
      notifications: notifications.length,
      unseen: notifications.filter((item) => !item.seen).length,
      unread: notifications.filter((item) => !item.read).length,
      tasks: tasks.length,
      jobsToday: jobs.filter((job) => job.date === today).length,
      meetingsToday: meetings.filter(meetsToday).length
    },
    notifications: notifications.slice(0, Math.max(0, limits.notifications)),
    jobs,
    meetings,
    calendar: { connected: input.meetings?.connected ?? [], failed: input.meetings?.failed ?? [] },
    tasks
  };
  return { inbox, etag: desktopInboxEtag(inbox) };
}

/** JSON with every object's keys in order, so the same content always hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A strong ETag for the inbox's content: the same inbox always gives the same one. Built without
 * `generatedAt`, and without the time on rows that cannot alert (equipment, stamped "now").
 */
export function desktopInboxEtag(inbox: DesktopInbox): string {
  const { generatedAt: _generatedAt, ...content } = inbox;
  const stable = {
    ...content,
    notifications: content.notifications.map((item) => (item.alertable ? item : { ...item, at: undefined }))
  };
  return `"bfi-${crypto.createHash("sha256").update(canonical(stable)).digest("base64url").slice(0, 32)}"`;
}

/* ── what step 5 has to do to serve this ─────────────────────────────────────
   On the device-auth branch, inside the /api/desktop prefix (which must be in
   OPS_PREFIXES so `store` is the caller's workspace, and in ROUTE_POLICY):

     app.get("/api/desktop/inbox", async (req, res) => {
       const data = store.bootstrap(req.account!.id);
       const events = … for each connected provider:
         calendarEventCache.read(account, provider, dayStart, dayStart + 8 days,
                                 () => fetchCalendarEvents(provider, token, from, to))
       const { inbox, etag } = buildDesktopInbox({
         data, account: req.account!, workspace: { name: req.org!.name },
         meetings: { events, connected, failed },
         timeZone: String(req.query.tz ?? "") || undefined,
         can: (capability) => can(req.account!.role, capability),
         now: Date.now()
       });
       if (req.headers["if-none-match"] === etag) return res.status(304).end();
       res.setHeader("ETag", etag).setHeader("Cache-Control", "private, no-cache").json(inbox);
     });

   The range must be day-aligned (the reader's midnight) or the cache never
   hits. Marking read or seen from the Mac goes through the same merge as the
   website — `mergeNotificationStateValues(stored, incoming, buildNotificationItems(data))`,
   then `store.setUserSetting(me.id, NOTIFICATION_STATE_SETTING, value)` — batched on
   the Mac, because each write rewrites the database file. */
