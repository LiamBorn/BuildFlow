/* =========================================================================
   The Mac's inbox: one compact read (notch plan, feature 2 and step 3).

   The notch shows four tabs — Notifications, Jobs, Meetings, Tasks — and a
   greeting. Everything it shows comes from this one answer, so the Mac never
   downloads /api/bootstrap (every row in the workspace, and inline photos).

   PURE. This builds the answer from what the caller already has: the store's
   bootstrap for the account, the account, the workspace's name, the person's
   read state (a per-person setting), and the meetings the calendar cache holds.
   It reads nothing and writes nothing, because every write rewrites the whole
   database file and the Mac asks every minute. The route that serves it,
   GET /api/desktop/inbox, is in desktopInboxRoutes.ts (step 5).

   LINKS AND ANSWERS (step 5). Every notification, job, meeting and task carries
   `url`: the website address that opens it on a cold load (shared recordLinks,
   `#open/…`), or null when the website's address is not known. And every task's
   answers point at the Mac's own mirror, /api/desktop/tasks/<task>/<action>,
   rather than at the website's endpoints, which a device key cannot call.

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
  MEETINGS_LINK,
  NOTIFICATION_STATE_SETTING,
  allDaySpan,
  buildNotificationItems,
  decodeNotificationState,
  greetingFor,
  isNotificationRead,
  isNotificationSeen,
  jobLinkDestination,
  linkUrl,
  localIsoDate,
  meetingState,
  needsYou,
  taskLinkDestination,
  upNext,
  upcomingJobs,
  type BootstrapPayload,
  type LinkDestination,
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
  /** The website address that opens it on a cold load: the same place the bell's click-through goes. */
  url: string | null;
};

/** A job coming up, with the address that opens it on the website: the Month at its day, its drawer open. */
export type DesktopJob = UpcomingJob & { url: string | null };

/**
 * What is waiting on you, with the address of the place the website deals with it. Each of its
 * `actions` points at the Mac's mirror (POST /api/desktop/tasks/<task>/<action>), with the body and
 * `needs` the website's own endpoint takes.
 */
export type DesktopTask = NeedsYouTask & { url: string | null };

/** Where a device key sends a task's answer: the mirror that re-derives the task and runs the website's own operation. */
export const desktopTaskPath = (taskId: string, actionId: string) =>
  `/api/desktop/tasks/${encodeURIComponent(taskId)}/${encodeURIComponent(actionId)}`;

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
  /** The Dashboard's Meetings panel. */
  url: string | null;
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
  jobs: DesktopJob[];
  meetings: DesktopMeeting[];
  /** Which calendars are connected, and which could not be read this time. */
  calendar: { connected: CalendarProvider[]; failed: CalendarProvider[] };
  tasks: DesktopTask[];
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
  /** The website's origin ("https://build-flow.replit.app"), for each item's `url`; without it every `url` is null. */
  webOrigin?: string;
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

  const url = (destination: LinkDestination) => (input.webOrigin ? linkUrl(input.webOrigin, destination) : null);
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
    opens: item.opens,
    url: url(item.opens)
  }));

  const userId = data.activeUser?.id ?? "";
  const jobs: DesktopJob[] = upcomingJobs(data, { today, userId, limit: limits.jobs }).map((job) => ({
    ...job,
    url: url(jobLinkDestination(job))
  }));
  const tasks: DesktopTask[] = desktopTasks(data, {
    today,
    userId,
    permission: account.role,
    can: input.can,
    timeEntries: input.timeEntries
  }).map((task) => ({ ...task, url: url(taskLinkDestination(task)) }));

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
    state: meetingState(event, now, today),
    url: url(MEETINGS_LINK)
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

/**
 * What is waiting on this person, each answer pointed at the Mac's mirror. The one derivation both
 * the inbox and the mirror use, so the mirror re-derives exactly the task the Mac was shown.
 */
export function desktopTasks(data: BootstrapPayload, options: Parameters<typeof needsYou>[1]): Array<NeedsYouTask> {
  return needsYou(data, options).map((task) => ({
    ...task,
    actions: task.actions.map((action) => ({ ...action, request: { ...action.request, path: desktopTaskPath(task.id, action.id) } }))
  }));
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
