/**
 * The month grid the Month page and the Schedule landing draw: six Sunday-first
 * weeks around a month, with the days this workspace does not work marked.
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

export function buildScheduleMonthCells(monthAnchor: string, workingWeekdays: number[] = [1, 2, 3, 4, 5, 6]): ScheduleMonthCell[] {
  const first = firstOfScheduleMonth(monthAnchor);
  const month = first.slice(0, 7);
  const firstDow = new Date(`${first}T00:00:00`).getDay();
  const gridStart = shiftScheduleDate(first, -firstDow);
  return Array.from({ length: 42 }, (_, index) => {
    const date = shiftScheduleDate(gridStart, index);
    const dateObj = new Date(`${date}T00:00:00`);
    const dow = dateObj.getDay();
    return {
      date,
      dayNum: dateObj.getDate(),
      inMonth: date.slice(0, 7) === month,
      // "weekend" is a day this workspace does not work
      weekend: !workingWeekdays.includes(dow),
      weekIndex: Math.floor(index / 7)
    };
  });
}
