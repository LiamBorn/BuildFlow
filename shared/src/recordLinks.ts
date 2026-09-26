/**
 * Links that open a record, or a Dashboard panel, on a COLD load (notch plan, step 5).
 *
 * BuildFlow keeps its pages in memory: only the schedule pages had URLs (`#schedule/…`), so the bell
 * could open a DelayIQ by clicking but nothing outside the tab could. The Mac's notch opens things in
 * the browser, so every notification, job, meeting and task needs an address a fresh page load can
 * act on.
 *
 * ONE SCHEME, `#open/…`, and it is a spelling of WHERE the website opens a thing, not of what it is:
 *
 *   #open/<page>/<recordId>       a record on an index page     #open/delayIQs/d12, #open/field/fu-3,
 *                                                              #open/inventory/m-2
 *   #open/dashboard/<panelId>     a Dashboard panel             #open/dashboard/weather
 *   #open/schedule/<date>/<crew>  a booking: the Month at that  #open/schedule/2026-09-28/c-2
 *                                 week, filtered to that crew
 *   #open/job/<jobId>[?d=<date>]  a job: the Month at its day,  #open/job/j31?d=2026-09-26
 *                                 its drawer open
 *   #open/timecard/<monday>       the team's time, that week    #open/timecard/2026-09-21
 *
 * THE BELL AND THE LINK AGREE BY CONSTRUCTION. A notification's link is `linkHash(item.opens)`, and
 * `opens` is exactly what the bell hands to its click-through; the page parses the link back into the
 * same object and hands it to the same function. The round trip is tested for every kind.
 *
 * Ids are written with encodeURIComponent, so any id survives the trip; anything that does not parse
 * back into a destination is not a link (null), and the page simply opens as it would have.
 */
import type { NotificationDestination } from "./notifications";
import type { NeedsYouTask } from "./needsYou";

/** The Dashboard panels a link can light: the two the bell uses, and the three the Mac's tasks and meetings need. */
export const LINK_PANEL_IDS = ["weather", "inspections", "meetings", "approvals", "readiness"] as const;
export type LinkPanelId = (typeof LINK_PANEL_IDS)[number];

const RECORD_PAGES = ["field", "delayIQs", "inventory"] as const;
type RecordPage = (typeof RECORD_PAGES)[number];

/** Where a link opens: everything a notification can open, plus a job and a week of time cards. */
export type LinkDestination =
  | NotificationDestination
  | { kind: "panel"; panelId: LinkPanelId }
  | { kind: "job"; jobId: string; date?: string }
  | { kind: "timecard"; week: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value);
const isRecordPage = (value: string): value is RecordPage => (RECORD_PAGES as readonly string[]).includes(value);
const isPanelId = (value: string): value is LinkPanelId => (LINK_PANEL_IDS as readonly string[]).includes(value);
const part = (value: string) => encodeURIComponent(value);
/** A path segment back to its value; a malformed escape is not a link. */
const unpart = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
};

/** The hash that opens a destination, "#open/…". */
export function linkHash(destination: LinkDestination): string {
  switch (destination.kind) {
    case "record":
      return `#open/${destination.page}/${part(destination.recordId)}`;
    case "panel":
      return `#open/dashboard/${destination.panelId}`;
    case "schedule":
      return `#open/schedule/${destination.date}/${part(destination.crewId)}`;
    case "job":
      return `#open/job/${part(destination.jobId)}${isDay(destination.date) ? `?d=${destination.date}` : ""}`;
    case "timecard":
      return `#open/timecard/${destination.week}`;
  }
}

/** A hash back into where it opens; null for anything that is not an `#open/…` link this page can follow. */
export function parseLinkHash(hash: string): LinkDestination | null {
  if (typeof hash !== "string" || !hash.startsWith("#open/")) return null;
  const [path, query = ""] = hash.slice("#open/".length).split("?");
  const segments = path.split("/");
  const [where] = segments;
  if (isRecordPage(where) && segments.length === 2) {
    const recordId = unpart(segments[1]);
    return recordId ? { kind: "record", page: where, recordId } : null;
  }
  if (where === "dashboard" && segments.length === 2) {
    return isPanelId(segments[1]) ? { kind: "panel", panelId: segments[1] } : null;
  }
  if (where === "schedule" && segments.length === 3) {
    const crewId = unpart(segments[2]);
    return isDay(segments[1]) && crewId ? { kind: "schedule", date: segments[1], crewId } : null;
  }
  if (where === "job" && segments.length === 2) {
    const jobId = unpart(segments[1]);
    if (!jobId) return null;
    const date = new URLSearchParams(query).get("d");
    return isDay(date) ? { kind: "job", jobId, date } : { kind: "job", jobId };
  }
  if (where === "timecard" && segments.length === 2) {
    return isDay(segments[1]) ? { kind: "timecard", week: segments[1] } : null;
  }
  return null;
}

/** The absolute address of a destination on the website at `origin` ("https://build-flow.replit.app"). */
export function linkUrl(origin: string, destination: LinkDestination): string {
  return `${origin.replace(/\/+$/, "")}/${linkHash(destination)}`;
}

/** A job opens on the Month at the day the Mac's row is about, with its drawer open. */
export function jobLinkDestination(job: { id: string; date?: string }): LinkDestination {
  return isDay(job.date) ? { kind: "job", jobId: job.id, date: job.date } : { kind: "job", jobId: job.id };
}

/** Every meeting opens the Dashboard's Meetings panel: the meeting itself lives in the person's calendar. */
export const MEETINGS_LINK: LinkDestination = { kind: "panel", panelId: "meetings" };

/**
 * Where the website deals with a task (shared needsYou): a schedule change in Pending Approvals, a
 * rain-day call in WeatherIQ, a readiness item in Readiness, a job with no crew in its own drawer,
 * and submitted time on the team's week.
 */
export function taskLinkDestination(task: Pick<NeedsYouTask, "kind" | "target" | "due">): LinkDestination {
  switch (task.kind) {
    case "schedule-change":
      return { kind: "panel", panelId: "approvals" };
    case "weather-call":
      return { kind: "panel", panelId: "weather" };
    case "readiness":
      return { kind: "panel", panelId: "readiness" };
    case "unbooked-job":
      return jobLinkDestination({ id: task.target.id, date: task.due?.slice(0, 10) });
    case "time-cards":
      return { kind: "timecard", week: task.target.id };
  }
}
