import { describe, expect, it, vi } from "vitest";
import type { ScheduleAssignment } from "@buildflow/shared";
import { toIsoDate } from "../components/ui/gantt";
import {
  WEEK_DAYS,
  buildScheduleWeekDays,
  dayOf,
  formatScheduleDate,
  formatScheduleWeekRange,
  initialWeekStart,
  mondayOf,
  plural,
  scheduleWeekDays,
  startOfScheduleWeek
} from "./week";

const at = (iso: string) => new Date(`${iso}T12:00:00`);
const booking = (id: string, date: string): ScheduleAssignment =>
  ({ id, jobId: "j-1", crewId: "c-1", date, status: "Planned", conflicts: [] }) as unknown as ScheduleAssignment;

describe("mondayOf", () => {
  it("is the Monday on or before the date, at midnight", () => {
    expect(toIsoDate(mondayOf(at("2026-09-09")))).toBe("2026-09-07"); // a Wednesday
    expect(toIsoDate(mondayOf(at("2026-09-07")))).toBe("2026-09-07"); // Monday stays
    expect(toIsoDate(mondayOf(at("2026-09-13")))).toBe("2026-09-07"); // Sunday closes the week before
    expect(mondayOf(at("2026-09-09")).getHours()).toBe(0);
  });
});

describe("scheduleWeekDays", () => {
  it("lists the seven days from the Monday with short names and labels", () => {
    const days = scheduleWeekDays(mondayOf(at("2026-09-09")));
    expect(days).toHaveLength(WEEK_DAYS);
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13"
    ]);
    expect(days.map((day) => day.day)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(days[0].label).toBe(formatScheduleDate("2026-09-07"));
  });
});

describe("initialWeekStart", () => {
  // the test clock is Tuesday 16 June 2026 (src/test/setup.ts pins Date)
  it("opens this week when it holds a booking, or when nothing is booked at all", () => {
    vi.setSystemTime(new Date("2026-06-16T12:00:00"));
    expect(toIsoDate(initialWeekStart([]))).toBe("2026-06-15");
    expect(toIsoDate(initialWeekStart([booking("a", "2026-05-05"), booking("b", "2026-06-18")]))).toBe("2026-06-15");
  });
  it("otherwise opens the week of the booking nearest today, the upcoming one on a tie", () => {
    vi.setSystemTime(new Date("2026-06-16T12:00:00"));
    expect(toIsoDate(initialWeekStart([booking("a", "2026-05-05"), booking("b", "2026-07-30")]))).toBe("2026-05-04");
    expect(toIsoDate(initialWeekStart([booking("a", "2026-06-09"), booking("b", "2026-06-23")]))).toBe("2026-06-22");
  });
});

describe("day helpers", () => {
  it("reads a booking's calendar day whatever the field carries", () => {
    expect(dayOf(booking("a", "2026-09-07"))).toBe("2026-09-07");
    expect(dayOf(booking("a", "2026-09-07T00:00:00.000Z"))).toBe("2026-09-07");
  });
  it("formats dates and plurals for the board", () => {
    expect(formatScheduleDate("2026-09-07")).toBe("Sep 7");
    expect(plural(1, "job")).toBe("1 job");
    expect(plural(2, "job")).toBe("2 jobs");
    expect(plural(0, "crew")).toBe("0 crews");
  });
});

describe("ISO week helpers for the landing", () => {
  it("anchor a week on its Monday and label the run", () => {
    expect(startOfScheduleWeek("2026-09-09")).toBe("2026-09-07");
    expect(startOfScheduleWeek("2026-09-13")).toBe("2026-09-07");
    const days = buildScheduleWeekDays("2026-09-07");
    expect(days.map((day) => day.date)).toEqual(scheduleWeekDays(mondayOf(at("2026-09-09"))).map((day) => day.date));
    expect(formatScheduleWeekRange(days)).toBe("Sep 7 - Sep 13, 2026");
  });
});
