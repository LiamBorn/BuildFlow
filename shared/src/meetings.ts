/**
 * Where a meeting stands against the clock, and which meetings are next. Moved here from
 * client/src/meetings/calendarModel.ts (2026-09-26, notch step 3) so the Dashboard's Meetings panel
 * and the Mac's notch count down to the same meetings; the client re-exports them under the same
 * names. Behaviour is unchanged (client/src/tests/parity holds the answers the client copy gave).
 *
 * DAYS ARE THE READER'S LOCAL DAYS. A meeting at 9 AM sits at 9 AM for whoever reads it. The one
 * exception is an ALL-DAY entry: a date, not an instant (Google sends "2026-09-16"; Graph sends UTC
 * midnight), so its date is read straight off the string and never moved by a time zone. On the
 * server, whose clock is not the reader's, pass `today` — the reader's own date — for all-day entries.
 */

/** What these helpers read of a meeting. The client's CalendarMeeting and the server's CalendarEvent both have it. */
export type MeetingTimes = { startsAt: string; endsAt: string; allDay: boolean };

/** Where a meeting stands against the clock. "soon" is the last 15 minutes before it starts. */
export type MeetingState = "past" | "now" | "soon" | "later";

/** How long before a meeting it counts as "soon", and the notch starts counting down. */
export const MEETING_SOON_MS = 15 * 60_000;

const pad = (value: number) => String(value).padStart(2, "0");
/** A local calendar day, "YYYY-MM-DD". */
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Local midnight of a day key. */
const fromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (key: string, days: number) => {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};

/** The days an all-day entry covers, from its own dates (the end is exclusive, as both providers send it). */
export function allDaySpan(event: Pick<MeetingTimes, "startsAt" | "endsAt">): { first: string; last: string } {
  const first = event.startsAt.slice(0, 10);
  const end = event.endsAt.slice(0, 10);
  return { first, last: end > first ? addDays(end, -1) : first };
}

/**
 * Where a meeting stands against the clock. `today` is the reader's date for all-day entries; it
 * defaults to the local date of `now`, which is right wherever the reader's clock is the machine's.
 */
export function meetingState(event: MeetingTimes, now: number, today: string = dayKey(new Date(now))): MeetingState {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (event.allDay) {
    const span = allDaySpan(event);
    if (span.last < today) return "past";
    return span.first <= today ? "now" : "later";
  }
  if (now >= end) return "past";
  if (now >= start) return "now";
  return start - now <= MEETING_SOON_MS ? "soon" : "later";
}

/** The meetings still to come in the next seven days, soonest first; one you declined is not coming. */
export function upNext<T extends MeetingTimes & { myResponse?: string }>(events: T[], now: number, limit = 4, today?: string): T[] {
  const horizon = now + 7 * 24 * 60 * 60_000;
  return events
    .filter((event) => event.myResponse !== "declined" && meetingState(event, now, today) !== "past")
    .filter((event) => new Date(event.allDay ? fromKey(allDaySpan(event).first) : event.startsAt).getTime() < horizon)
    .sort((a, b) => Number(a.allDay) - Number(b.allDay) || a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit);
}
