/**
 * The Meetings calendar's arithmetic (2026-09-23): the days a view shows, the range a read has to
 * cover, where each meeting sits on the grid, and what the panel says about time. Pure, so it is
 * tested on its own (calendarModel.test.ts).
 *
 * DAYS ARE THE READER'S LOCAL DAYS. A meeting at 9 AM sits at 9 AM for the person reading, which is
 * what their own calendar app shows. The one exception is an ALL-DAY entry: it is a date, not an
 * instant (Google sends "2026-09-16"; Graph sends UTC midnight because it was asked for UTC), so
 * its date is read straight off the string and never moved by a time zone.
 */
import type { CalendarMeeting, CalendarProviderId, CalendarResponse } from "../api";
import { allDaySpan, meetingState } from "@buildflow/shared";

/* Where a meeting stands against the clock, and which are next, moved to @buildflow/shared
   (2026-09-26, notch step 3) so the Mac's notch counts down to the same meetings as this panel.
   Re-exported here under the same names; behaviour is unchanged (tests/parity holds it). */
export { allDaySpan, meetingState, upNext, type MeetingState } from "@buildflow/shared";

export type CalendarView = "day" | "week" | "month";

export const PROVIDER_IDS: CalendarProviderId[] = ["google", "microsoft"];
/** What each is called on a button ("Connect Outlook"), and as a calendar in a list. */
export const PROVIDER_LABEL: Record<CalendarProviderId, string> = { google: "Google", microsoft: "Outlook" };
export const CALENDAR_NAME: Record<CalendarProviderId, string> = { google: "Google Calendar", microsoft: "Outlook Calendar" };

/** How the person whose calendar it is answered, in their words. */
export const MY_RESPONSE_LABEL: Record<CalendarMeeting["myResponse"], string> = {
  organizer: "You organized it",
  accepted: "Going",
  tentative: "Maybe",
  pending: "Not answered yet",
  declined: "Declined"
};
/** How a guest answered. */
export const GUEST_RESPONSE_LABEL: Record<CalendarResponse, string> = {
  accepted: "Going",
  tentative: "Maybe",
  pending: "Awaiting",
  declined: "Declined"
};

const pad = (value: number) => String(value).padStart(2, "0");

/** A local calendar day, "YYYY-MM-DD". */
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local midnight of a day key. */
export const fromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (key: string, days: number) => {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};

export const addMonths = (key: string, months: number) => {
  const date = fromKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  // the 31st of a month with 30 days is its last day, not the 1st of the next
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return dayKey(date);
};

/** The Monday of the week holding this day: the program's weeks start on Monday. */
export const mondayOf = (key: string) => {
  const date = fromKey(key);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(date);
};

/** A month on six rows of seven days, from the Monday on or before the 1st. */
export function monthGrid(anchor: string): string[] {
  const start = mondayOf(`${anchor.slice(0, 8)}01`);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** The days a view shows. */
export function viewDays(view: CalendarView, anchor: string): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return Array.from({ length: 7 }, (_, index) => addDays(mondayOf(anchor), index));
  return monthGrid(anchor);
}

/** One step back or forward in a view: a day, a week, a month. */
export function stepAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  return addMonths(anchor, direction);
}

/**
 * The instants one read has to cover for this anchor: the month grid around it. That holds the
 * day and the week views wherever the anchor sits in the month, and the mini month beside them,
 * so switching views or weeks inside a month asks the provider nothing new. 42 days, inside the
 * server's 62.
 */
export function fetchRange(anchor: string): { from: Date; to: Date } {
  const days = monthGrid(anchor);
  return { from: fromKey(days[0]), to: fromKey(addDays(days[days.length - 1], 1)) };
}

/** The meetings on one day: all-day entries that cover it, and timed ones that touch it. */
export function meetingsOn(events: CalendarMeeting[], key: string): { allDay: CalendarMeeting[]; timed: CalendarMeeting[] } {
  const start = fromKey(key).getTime();
  const end = fromKey(addDays(key, 1)).getTime();
  const allDay: CalendarMeeting[] = [];
  const timed: CalendarMeeting[] = [];
  for (const event of events) {
    if (event.allDay) {
      const span = allDaySpan(event);
      if (span.first <= key && key <= span.last) allDay.push(event);
      continue;
    }
    const from = new Date(event.startsAt).getTime();
    const to = new Date(event.endsAt).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    // a zero-length entry still belongs to the day it starts in
    if (from < end && (to > start || (to === from && from >= start))) timed.push(event);
  }
  const byStart = (a: CalendarMeeting, b: CalendarMeeting) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title);
  return { allDay: allDay.sort(byStart), timed: timed.sort(byStart) };
}

export type PlacedMeeting = {
  event: CalendarMeeting;
  /** Minutes from this day's midnight, clipped to the day. */
  top: number;
  bottom: number;
  /** Its column among the meetings it overlaps, and how many columns they need. */
  lane: number;
  lanes: number;
};

/** Minutes from a day's local midnight to an instant, clipped to the day. */
const minutesInto = (key: string, iso: string) => {
  const minutes = (new Date(iso).getTime() - fromKey(key).getTime()) / 60_000;
  return Math.min(Math.max(minutes, 0), 24 * 60);
};

/**
 * One day's timed meetings, laid side by side where they overlap — the way a calendar app does it:
 * a run of meetings that overlap one another is one cluster, each takes the first column free when
 * it starts, and every meeting in the cluster is as wide as the cluster has columns.
 */
export function layoutDay(timed: CalendarMeeting[], key: string): PlacedMeeting[] {
  const placed = timed
    .map((event) => ({ event, top: minutesInto(key, event.startsAt), bottom: minutesInto(key, event.endsAt), lane: 0, lanes: 1 }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let cluster: typeof placed = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of placed) {
    // a meeting shorter than a quarter of an hour still takes a quarter of an hour of room
    const bottom = Math.max(item.bottom, item.top + 15);
    if (cluster.length > 0 && item.top >= clusterEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bottom);
    } else {
      laneEnds[lane] = bottom;
    }
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, bottom);
  }
  close();
  return placed;
}

/** "In 5 min.", "Now", "In 2 h 10 min.", "9:00 AM" — what the pill says about one meeting. */
export function countdownLabel(startsAt: string, endsAt: string, now: number): string {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  if (now >= end) return "Ended";
  if (now >= start) return "Now";
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `In ${minutes} min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 8) return rest ? `In ${hours} h ${rest} min.` : `In ${hours} h`;
  // beyond that a countdown stops being useful and the clock time is what you want
  return clock(startsAt);
}

/** "Today", "Tomorrow", or the weekday — the day a person means. */
export function dayLabel(startsAt: string, now: number): string {
  const key = startsAt.length === 10 ? startsAt : dayKey(new Date(startsAt));
  const today = dayKey(new Date(now));
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return fromKey(key).toLocaleDateString("en-US", { weekday: "long" });
}

/** "9:00 AM". Newer ICU puts a narrow no-break space before the AM; it is a plain space here, so it splits and matches. */
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/[\u202f\u00a0]/g, " ");

/** "9am", "9:30pm": a time where there is room for little else (the month grid's chips). */
export function shortClock(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}${minutes ? `:${pad(minutes)}` : ""}${hours < 12 ? "am" : "pm"}`;
}

/** "9:00 – 10:30 AM", "11:30 AM – 1:00 PM". */
export function timeRange(startsAt: string, endsAt: string): string {
  const from = clock(startsAt);
  const to = clock(endsAt);
  const [fromTime, fromHalf] = from.split(" ");
  const [, toHalf] = to.split(" ");
  return fromHalf === toHalf ? `${fromTime} – ${to}` : `${from} – ${to}`;
}

/**
 * What a list says about when a meeting is: "Ongoing · until 12:00 PM" while it runs, the countdown
 * inside eight hours, then "Tomorrow · 9:00 AM" or "Fri · 9:00 AM"; "All day" (and its day) for an
 * all-day entry.
 */
export function whenLabel(event: CalendarMeeting, now: number): string {
  if (event.allDay) {
    const day = dayLabel(allDaySpan(event).first, now);
    return day === "Today" ? "All day" : `${day} · All day`;
  }
  const state = meetingState(event, now);
  if (state === "now") return `Ongoing · until ${clock(event.endsAt)}`;
  const start = new Date(event.startsAt).getTime();
  if (start - now < 8 * 60 * 60_000 && dayKey(new Date(start)) === dayKey(new Date(now))) {
    return countdownLabel(event.startsAt, event.endsAt, now);
  }
  const day = dayLabel(event.startsAt, now);
  const short = day === "Today" || day === "Tomorrow" ? day : new Date(start).toLocaleDateString("en-US", { weekday: "short" });
  return `${short} · ${clock(event.startsAt)}`;
}

/** "Sep 21 – 27, 2026", "Sep 28 – Oct 4, 2026", "Wednesday, Sep 23, 2026", "September 2026". */
export function rangeLabel(view: CalendarView, anchor: string): string {
  const date = fromKey(anchor);
  if (view === "day") return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  if (view === "month") return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const days = viewDays("week", anchor);
  const first = fromKey(days[0]);
  const last = fromKey(days[6]);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (first.getFullYear() !== last.getFullYear()) {
    return `${month(first)} ${first.getDate()}, ${first.getFullYear()} – ${month(last)} ${last.getDate()}, ${last.getFullYear()}`;
  }
  return first.getMonth() === last.getMonth()
    ? `${month(first)} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}, ${last.getFullYear()}`;
}

/** The reader's offset from UTC as a calendar app labels it: "GMT-4", "GMT+5:30". */
export function offsetLabel(date = new Date()): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `GMT${sign}${hours}${rest ? `:${pad(rest)}` : ""}`;
}

/** "9 AM", "12 PM". */
export const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;

/** "30 min", "1 h", "1 h 30 min" — how long a meeting runs. */
export function durationLabel(startsAt: string, endsAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "Wednesday, September 23" — a day, the way a person says it. */
export const longDayLabel = (key: string) => fromKey(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/**
 * The other meetings running at the same time as this one: a double booking. One you declined is
 * not a clash, and neither is an all-day entry, which is a date rather than a block of time.
 */
export function overlapsWith(event: CalendarMeeting, events: CalendarMeeting[]): CalendarMeeting[] {
  if (event.allDay) return [];
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  return events.filter(
    (other) =>
      other.id !== event.id &&
      !other.allDay &&
      other.myResponse !== "declined" &&
      new Date(other.startsAt).getTime() < end &&
      new Date(other.endsAt).getTime() > start
  );
}

/** Total meeting time in a set, "9 h 30 m", counting only what you have not declined. */
export function busyLabel(events: CalendarMeeting[]): string {
  const minutes = events
    .filter((event) => !event.allDay && event.myResponse !== "declined")
    .reduce((sum, event) => sum + Math.max(0, (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000), 0);
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} m`;
  return rest ? `${hours} h ${rest} m` : `${hours} h`;
}

/** Where a new event is written: the provider's own editor, opened in a tab (the connection is read-only). */
export function newEventUrl(provider: CalendarProviderId, email: string): string {
  if (provider === "google") return "https://calendar.google.com/calendar/r/eventedit";
  // a personal Microsoft account writes on outlook.live.com, a work or school one on outlook.office.com
  const personal = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i.test(email);
  return personal ? "https://outlook.live.com/calendar/0/deeplink/compose" : "https://outlook.office.com/calendar/0/deeplink/compose";
}

/** Two letters for a face: "Carlos Ramirez" → "CR", "dana@asphaltco.com" → "DA". */
export function initials(name: string): string {
  const words = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

const RESPONSES = ["accepted", "declined", "tentative", "pending"] as const;
const isText = (value: unknown): value is string => typeof value === "string";

/**
 * A feed this calendar can render, whatever came back. ONE PANEL MUST NOT TAKE THE DASHBOARD DOWN:
 * a reply of another shape — every test's blanket fetch mock, a proxy's error page — is no meetings,
 * and a meeting from an older server (no guests, no notes) reads with those empty.
 */
export function readMeetings(value: unknown): CalendarMeeting[] {
  const events = (value as { events?: unknown } | undefined)?.events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((raw): CalendarMeeting[] => {
    const event = raw as Partial<CalendarMeeting> | null;
    if (!event || !isText(event.id) || !isText(event.startsAt) || !isText(event.endsAt)) return [];
    const provider = event.provider === "microsoft" ? "microsoft" : "google";
    const guests = Array.isArray(event.guests)
      ? event.guests.flatMap((guest) =>
          guest && isText(guest.name)
            ? [
                {
                  name: guest.name,
                  email: isText(guest.email) ? guest.email : "",
                  response: RESPONSES.includes(guest.response as (typeof RESPONSES)[number]) ? guest.response : "pending",
                  organizer: guest.organizer === true
                }
              ]
            : []
        )
      : [];
    const mine = event.myResponse;
    return [
      {
        id: event.id,
        provider,
        title: isText(event.title) && event.title.trim() ? event.title : "Untitled meeting",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay === true,
        location: isText(event.location) ? event.location : "",
        joinUrl: isText(event.joinUrl) ? event.joinUrl : "",
        attendees: Array.isArray(event.attendees) ? event.attendees.filter(isText) : [],
        organizer: isText(event.organizer) ? event.organizer : "",
        guests,
        myResponse:
          mine === "organizer" || RESPONSES.includes(mine as (typeof RESPONSES)[number])
            ? (mine as CalendarMeeting["myResponse"])
            : // an answer this program does not know (a server older or newer than it) reads as the
              // usual one, rather than claiming you organized it or have not answered
              "accepted",
        description: isText(event.description) ? event.description : "",
        webUrl: isText(event.webUrl) ? event.webUrl : "",
        conference: isText(event.conference) ? event.conference : ""
      }
    ];
  });
}
