/**
 * The month grid the Month page draws: Sunday-first weeks over ONE month, with the days this
 * workspace does not work marked.
 */
import { shiftScheduleDate } from "./scheduleUtils";

export function firstOfScheduleMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function shiftScheduleMonth(monthAnchor: string, delta: number) {
  const base = new Date(`${firstOfScheduleMonth(monthAnchor)}T00:00:00`);
  base.setMonth(base.getMonth() + delta);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
}

export function formatScheduleMonth(monthAnchor: string) {
  return new Date(`${firstOfScheduleMonth(monthAnchor)}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

export type ScheduleMonthCell = {
  date: string;
  dayNum: number;
  inMonth: boolean;
  weekend: boolean;
  weekIndex: number;
};

/**
 * The weeks one month occupies, Sunday first — and only those. It used to be a flat 42 cells, six
 * weeks whatever the month, so September printed 1-10 October after the 30th (2026-09-17): dates
 * from a month the page was not showing, which a planner could drop work on. The grid now ends on
 * the month's last day, and the places either side of it are cells that are not days — the page
 * draws nothing in them, and the columns still line up under their weekday.
 */
export function buildScheduleMonthCells(monthAnchor: string, workingWeekdays: number[] = [1, 2, 3, 4, 5, 6]): ScheduleMonthCell[] {
  const first = firstOfScheduleMonth(monthAnchor);
  const month = first.slice(0, 7);
  const firstDow = new Date(`${first}T00:00:00`).getDay();
  const gridStart = shiftScheduleDate(first, -firstDow);
  // day 0 of the NEXT month is the last of this one, so this is however many days it has
  const daysInMonth = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate();
  // four weeks for a February that starts on a Sunday, six for a May that starts on a Friday
  const weeks = Math.ceil((firstDow + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = shiftScheduleDate(gridStart, index);
    const dateObj = new Date(`${date}T00:00:00`);
    const dow = dateObj.getDay();
    return {
      date,
      dayNum: dateObj.getDate(),
      /** False only for the places padding the first and last week: those are drawn as nothing. */
      inMonth: date.slice(0, 7) === month,
      // "weekend" is a day this workspace does not work
      weekend: !workingWeekdays.includes(dow),
      weekIndex: Math.floor(index / 7)
    };
  });
}
