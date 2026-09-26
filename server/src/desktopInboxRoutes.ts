/* =========================================================================
   BuildFlow for Mac, step 5: the live inbox the notch reads.

     GET  /api/desktop/inbox?tz=<IANA zone>        the whole inbox, with an ETag and 304
     POST /api/desktop/inbox/state                 mark notifications seen or read
     POST /api/desktop/tasks/:taskId/:actionId     answer a task (Accept, Call it off, Approve…)
     GET  /api/desktop/events                      nudges: "something you see may have changed"

   All four sit behind the device gate (desktop.ts): a device key, never a cookie, with the key's own
   workspace bound as `store`. The contract the Mac codes against is the wave-2 contract's "Inbox".

   READ-ONLY WHERE IT CAN BE. Every write rewrites a whole database file, and the Mac reads every
   minute. The inbox read writes nothing to the workspace; the read state is written only when it
   actually changes; the calendar is read through the five-minute cache.

   THE WEBSITE'S OWN OPERATIONS. A task's answer runs the same function the website's endpoint runs
   (app.ts hands them over as `tasks`), after re-deriving the task for this person from the same
   shared `needsYou` the inbox listed it from. Nothing here re-implements a write.

   NUDGES COST NOTHING WHEN NOBODY LISTENS, AND LITTLE WHEN SOMEBODY DOES. They hang off the stores'
   own saves (BuildFlowStore.onSaved), so no write can change an inbox without its Macs hearing about
   it, a burst of writes is one nudge, and the streams keep the schedule feed's rules for a reader who
   has gone (sseHub.ts).
   ========================================================================= */
import type express from "express";
import { z } from "zod";
import {
  NOTIFICATION_STATE_SETTING,
  addIsoDays,
  buildNotificationItems,
  emptyNotificationState,
  encodeNotificationState,
  markNotifications,
  mergeNotificationStateValues,
  type BootstrapPayload,
  type NeedsYouAction,
  type NeedsYouCapability,
  type NotificationStamp,
  type PendingTimeEntry
} from "@buildflow/shared";
import type { BuildFlowStore } from "./database.js";
import type { PersonsMeetings } from "./calendar.js";
import { buildDesktopInbox, dayIn, desktopTasks, type DesktopInbox } from "./desktopInbox.js";
import type { DesktopNudges } from "./desktopNudges.js";
import { can } from "./permissions.js";

/* ── what the routes are handed ───────────────────────────────────────────── */

/** What one of the website's task endpoints answered (app.ts runs the same function for both). */
export type TaskOutcome = { status: number; body: unknown; after?: () => void };

/** The website's own task operations, which the mirror runs rather than repeats. */
export type DesktopTaskOperations = {
  resolveVariance: (req: express.Request, varianceId: string, verb: "accept" | "reject", body: unknown) => TaskOutcome;
  callOffWeatherDay: (req: express.Request, conflictId: string) => Promise<TaskOutcome>;
  keepWeatherDay: (req: express.Request, conflictId: string) => TaskOutcome;
  bookCrew: (req: express.Request, body: unknown) => TaskOutcome;
  approveTime: (req: express.Request, body: unknown) => TaskOutcome;
};

export type DesktopInboxDeps = {
  mainStore: BuildFlowStore;
  /** The caller's workspace store, bound by the device gate. */
  store: BuildFlowStore;
  /** The workspace as the website's bootstrap has it for this person: roster levels resolved. */
  workspaceData: (req: express.Request) => BootstrapPayload;
  /** A person's meetings between two instants, through the calendar cache (calendar.ts meetingsFor). */
  meetings: (accountId: string, from: Date, to: Date) => Promise<PersonsMeetings>;
  /** The website's origin, for links: the one emailed links are built from. */
  webOrigin: (req: express.Request) => string;
  tasks: DesktopTaskOperations;
  nudges: DesktopNudges;
};

/* ── the reader's clock ───────────────────────────────────────────────────── */

/** An IANA zone this server can read ("America/New_York"), or undefined for anything else. */
export function readZone(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/** How far a zone is ahead of UTC at an instant, in milliseconds. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(at));
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(field("year"), field("month") - 1, field("day"), field("hour"), field("minute"), field("second"));
  return asIfUtc - Math.floor(at / 1000) * 1000;
}

/**
 * The instant a day begins for the reader: midnight in their zone (the server's own without one).
 * The calendar range starts here so that it is the same range all day, which is what lets the
 * five-minute cache answer the Mac's reads instead of Google.
 */
export function midnightIn(day: string, timeZone?: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  if (!timeZone) return new Date(year, month - 1, date);
  const guess = Date.UTC(year, month - 1, date);
  // twice: the second pass lands right when a clock change falls between the guess and the answer
  const first = guess - zoneOffset(guess, timeZone);
  return new Date(guess - zoneOffset(first, timeZone));
}

/** How many days of meetings the inbox asks for: the Meetings tab's week, and the day it ends on. */
const MEETING_DAYS = 8;
/** How far back submitted time still waits for approval: the team's view reads the same 92 days. */
const TIME_CARD_DAYS = 92;

/* ── the read state, one merge for the bell and the Mac ───────────────────── */

/**
 * Merge incoming seen/read marks into what a person has, the way PUT /api/me/settings always has
 * for the bell: a union against the server's own list, so neither side can undo the other. Writes
 * only when the stored value actually changes -- the Mac marks what it shows, and marking something
 * already marked must not rewrite the database file (nor nudge every Mac in the workspace).
 */
export function mergeNotificationStateSetting(
  store: Pick<BuildFlowStore, "userSettings" | "setUserSetting">,
  userId: string,
  incoming: string,
  items: NotificationStamp[]
): { value: string; changed: boolean } {
  const stored = store.userSettings(userId)[NOTIFICATION_STATE_SETTING];
  const value = mergeNotificationStateValues(stored, incoming, items);
  if (value === stored) return { value, changed: false };
  store.setUserSetting(userId, NOTIFICATION_STATE_SETTING, value);
  return { value, changed: true };
}

const stateSchema = z.object({
  seen: z.array(z.string().min(1).max(300)).max(5000).optional(),
  read: z.array(z.string().min(1).max(300)).max(5000).optional(),
  allRead: z.boolean().optional()
});

/* ── a task's answer: what came in against what the task says now ─────────── */

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Two JSON values the same; a list of ids in any order is the same list. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sorted = (list: unknown[]) => list.map((item) => JSON.stringify(item)).sort();
    const left = sorted(a);
    const right = sorted(b);
    return left.every((item, index) => item === right[index]);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The caller's own row on the workspace's roster. The bootstrap falls back to somebody else's row
 * when a login has none (it was built for the shared demo), and a write must never be made as
 * someone else: marking their notifications, or resolving a variance in their name.
 */
const personIn = (data: BootstrapPayload, req: express.Request) =>
  data.activeUser && data.activeUser.accountId === req.account!.id ? data.activeUser : null;
const noPerson = (res: express.Response) =>
  res.status(404).json({ code: "no_user", error: "This login has no place on the workspace's team yet." });

/* ── the routes ───────────────────────────────────────────────────────────── */

export function registerDesktopInboxRoutes(app: express.Application, deps: DesktopInboxDeps) {
  const { store, nudges } = deps;
  /** The zone each Mac last read its inbox in, so a POST's ETag matches the GET's without asking again. */
  const zones = new Map<string, string>();
  const zoneFor = (req: express.Request, asked: unknown): string | undefined => {
    const zone = readZone(asked);
    const device = req.device!.id;
    if (zone) {
      zones.delete(device);
      zones.set(device, zone);
      // a bound, oldest first: a Mac that never comes back is not remembered forever
      if (zones.size > 10_000) zones.delete(zones.keys().next().value as string);
      return zone;
    }
    return zones.get(device);
  };

  /** Submitted time still waiting for approval, for someone who approves time. */
  const submittedTime = (today: string): PendingTimeEntry[] =>
    store
      .timeEntriesBetween(addIsoDays(today, -(TIME_CARD_DAYS - 1)), addIsoDays(today, 1))
      .filter((entry) => entry.status === "Submitted");

  /** The inbox as this person sees it now. Reads the workspace and the calendar cache; writes nothing. */
  const readInbox = async (req: express.Request, zone: string | undefined): Promise<{ inbox: DesktopInbox; etag: string }> => {
    const account = req.account!;
    const now = Date.now();
    const today = dayIn(now, zone);
    const permitted = (capability: NeedsYouCapability) => can(account.role, capability);
    const from = midnightIn(today, zone);
    const to = new Date(from.getTime() + MEETING_DAYS * 24 * 60 * 60 * 1000);
    return buildDesktopInbox({
      data: deps.workspaceData(req),
      account,
      workspace: { name: req.org!.name },
      meetings: await deps.meetings(account.id, from, to),
      timeEntries: permitted("timecard.approve") ? submittedTime(today) : undefined,
      now,
      timeZone: zone,
      can: permitted,
      webOrigin: deps.webOrigin(req)
    });
  };

  const noStore = (res: express.Response) => res.setHeader("Cache-Control", "private, no-cache");

  /* 1. The inbox: one read, answered 304 while nothing the Mac shows has changed. */
  app.get("/api/desktop/inbox", async (req, res) => {
    const { inbox, etag } = await readInbox(req, zoneFor(req, req.query.tz));
    noStore(res);
    res.setHeader("ETag", etag);
    const asked = req.headers["if-none-match"];
    // a proxy may have weakened the tag on the way out (W/"…"); it is the same inbox
    if (typeof asked === "string" && asked.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)) {
      res.status(304).end();
      return;
    }
    res.json(inbox);
  });

  /* 2. Seen and read, from the Mac: the bell's own merge, so the badge and the notch stay one number. */
  app.post("/api/desktop/inbox/state", async (req, res) => {
    noStore(res);
    const parsed = stateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ code: "invalid_request", error: "Send seen and read as lists of notification ids.", needs: [] });
      return;
    }
    const data = deps.workspaceData(req);
    const me = personIn(data, req);
    if (!me) return noPerson(res);
    const items = buildNotificationItems(data);
    const { seen = [], read = [], allRead = false } = parsed.data;
    const marks = markNotifications(
      markNotifications(emptyNotificationState(), seen, "seen"),
      allRead ? items.map((item) => item.id) : read,
      "read"
    );
    mergeNotificationStateSetting(store, me.id, encodeNotificationState(marks), items);
    const { etag } = await readInbox(req, zoneFor(req, req.query.tz));
    res.json({ etag });
  });

  /* 3. A task's answer. Re-derived for this person, checked as the website checks it, and done by the
     website's own operation. */
  app.post("/api/desktop/tasks/:taskId/:actionId", async (req, res) => {
    noStore(res);
    const taskId = String(req.params.taskId);
    const actionId = String(req.params.actionId);
    const account = req.account!;
    const zone = zoneFor(req, req.query.tz);
    const today = dayIn(Date.now(), zone);
    const data = deps.workspaceData(req);
    const me = personIn(data, req);
    if (!me) return noPerson(res);
    const options = { today, userId: me.id, permission: account.role, timeEntries: submittedTime(today) };
    const gone = () => res.status(404).json({ code: "task_gone", error: "That is no longer waiting on you." });
    const find = (tasks: ReturnType<typeof desktopTasks>) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      const action = task?.actions.find((candidate) => candidate.id === actionId);
      return task && action ? { task, action } : null;
    };

    /* First as if this person could do anything, to learn what the answer needs: someone who cannot
       is told that (403), rather than that nothing is there. */
    const asIfAllowed = find(desktopTasks(data, { ...options, can: () => true }));
    if (!asIfAllowed) return gone();
    if (!can(account.role, asIfAllowed.action.capability)) {
      res.status(403).json({
        code: "forbidden",
        error: "Your workspace role does not allow this. Ask an owner or admin.",
        need: asIfAllowed.action.capability
      });
      return;
    }
    // then exactly as the inbox listed it for them: a task that is somebody else's to do is not theirs to answer
    const mine = find(desktopTasks(data, { ...options, can: (capability) => can(account.role, capability) }));
    if (!mine) return gone();
    const { task } = mine;
    const action: NeedsYouAction = mine.action;

    const sent: Record<string, unknown> = plainObject(req.body) ? req.body : {};
    const needs = action.request.needs ?? [];
    const missing = [
      ...Object.keys(action.request.body).filter((key) => !(key in sent)),
      ...needs.filter((key) => typeof sent[key] !== "string" || !(sent[key] as string).trim())
    ];
    if (missing.length > 0) {
      res.status(400).json({ code: "invalid_request", error: `Send ${missing.join(", ")} with this answer.`, needs: missing });
      return;
    }
    if (needs.includes("crewId") && !data.crews.some((crew) => crew.id === sent.crewId)) {
      res.status(400).json({ code: "invalid_request", error: "That crew is not in this workspace.", needs: ["crewId"] });
      return;
    }
    // what the task says now, against what the Mac was shown: a difference is a record that moved
    if (Object.entries(action.request.body).some(([key, value]) => !sameValue(value, sent[key]))) {
      res.status(409).json({ code: "conflict", message: "This changed since your inbox was read. Look again before you answer." });
      return;
    }
    // the task's own body, and from the Mac only what the task said it needs: nothing else rides along
    const body = { ...action.request.body, ...Object.fromEntries(needs.map((key) => [key, sent[key]])) };
    // the website's own operation for this answer, on the record the task is about
    const record = task.target.id;
    let outcome: TaskOutcome;
    if (action.id === "accept" || action.id === "reject") outcome = deps.tasks.resolveVariance(req, record, action.id, body);
    else if (action.id === "cancel") outcome = await deps.tasks.callOffWeatherDay(req, record);
    else if (action.id === "keep") outcome = deps.tasks.keepWeatherDay(req, record);
    else if (action.id === "book") outcome = deps.tasks.bookCrew(req, body);
    else outcome = deps.tasks.approveTime(req, body);

    const said = plainObject(outcome.body) && typeof outcome.body.error === "string" ? outcome.body.error : undefined;
    if (outcome.status >= 200 && outcome.status < 300) {
      const { etag } = await readInbox(req, zone);
      res.json({ ok: true, etag });
      outcome.after?.();
      return;
    }
    if (outcome.status === 404) return gone();
    if (outcome.status === 409) {
      res.status(409).json({ code: "conflict", message: said ?? "This changed since your inbox was read." });
      return;
    }
    if (outcome.status === 403) {
      res.status(403).json({ code: "forbidden", error: said ?? "Your workspace role does not allow this." });
      return;
    }
    res.status(outcome.status).json({
      code: outcome.status === 400 ? "invalid_request" : "error",
      error: said ?? "That answer could not be taken.",
      needs: []
    });
  });

  /* 4. The nudges: this device's workspace, until the device is revoked. */
  app.get("/api/desktop/events", (req, res) => {
    nudges.open(req.org!.id, res, req.device!);
  });
}
