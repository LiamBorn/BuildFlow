/**
 * The week the Schedule pages share: Monday-based weeks, the seven day headers,
 * and which week to open on. Pure functions — the Week, List, Matrix and Month
 * pages import them through schedule/parts.
 */
import type { ScheduleAssignment } from "@buildflow/shared";
import { addDays, parseIsoDate, startOfDay, toIsoDate } from "../components/ui/gantt";

export function formatScheduleDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

export const WEEK_DAYS = 7;

/** The Monday on or before a date — the Schedule board's week convention. */
export const mondayOf = (date: Date) => {
  const day = date.getDay();
  return addDays(startOfDay(date), day === 0 ? -6 : 1 - day);
};

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** An assignment's calendar day as YYYY-MM-DD, whatever else the field carries. */
export const dayOf = (assignment: ScheduleAssignment) => assignment.date.slice(0, 10);

/**
 * The week to open on: this week when it holds bookings (or nothing is booked
 * at all), otherwise the week of the booking nearest today — the same idea as
 * the Gantt Chart anchoring on the nearest work when today is quiet.
 */
export const initialWeekStart = (assignments: ScheduleAssignment[]) => {
  const thisMonday = mondayOf(new Date());
  if (assignments.length === 0) return thisMonday;
  const startIso = toIsoDate(thisMonday);
  const endIso = toIsoDate(addDays(thisMonday, WEEK_DAYS - 1));
  if (assignments.some((assignment) => dayOf(assignment) >= startIso && dayOf(assignment) <= endIso)) return thisMonday;
  const today = startOfDay(new Date()).getTime();
  let nearest: { time: number; distance: number } | null = null;
  for (const assignment of assignments) {
    const time = parseIsoDate(dayOf(assignment)).getTime();
    const distance = Math.abs(time - today);
    // the upcoming booking wins a tie with a past one
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && time > nearest.time)) nearest = { time, distance };
  }
  return nearest ? mondayOf(new Date(nearest.time)) : thisMonday;
};

/** The Schedule page's seven day headers for a week starting on `weekStart`. */
export const scheduleWeekDays = (weekStart: Date) =>
  Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = toIsoDate(addDays(weekStart, index));
    return {
      date,
      day: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      label: formatScheduleDate(date)
    };
  });

/** The Monday on or before an ISO day, as an ISO day — the landing's week anchor. */
export function startOfScheduleWeek(date: string) {
  return toIsoDate(mondayOf(parseIsoDate(date)));
}

/** The seven day headers from an ISO Monday. */
export function buildScheduleWeekDays(startDate: string) {
  return scheduleWeekDays(parseIsoDate(startDate));
}

/** "Sep 7 - Sep 13, 2026" for a run of days. */
/**
 * "Sep 7 - Sep 13, 2026", and "Dec 28, 2026 - Jan 3, 2027" for a week that crosses New Year.
 *
 * The year used to come from the first day alone, which stamped the wrong one on the days the
 * week ends with: the week of Monday 28 December 2026 read "Dec 28 - Jan 3, 2026".
 */
export function formatScheduleWeekRange(days: Array<{ date: string }>) {
  const first = days[0];
  const last = days[days.length - 1];
  const firstYear = first.date.slice(0, 4);
  const lastYear = last.date.slice(0, 4);
  if (firstYear === lastYear) return `${formatScheduleDate(first.date)} - ${formatScheduleDate(last.date)}, ${firstYear}`;
  return `${formatScheduleDate(first.date)}, ${firstYear} - ${formatScheduleDate(last.date)}, ${lastYear}`;
}
