import { describe, expect, it } from "vitest";
import type { Calendar } from "../../types";
import {
  addWorkingDays,
  buildWorkingDayIndex,
  countWorkingDays,
  dateAtOrdinal,
  dayOfWeek,
  indexCovers,
  isWorkingDay,
  isoToDayNumber,
  nextWorkingDay,
  nextWorkingOrdinal,
  ordinalOf,
  previousWorkingDay,
  prevWorkingOrdinal,
  toIsoDate,
  validateCalendar,
  workingDayIndexFor
} from "../calendar";

/* Hand-verified facts used throughout (checked against a wall calendar):
     Mon 2026-09-07  Thu 2026-09-10  Fri 2026-09-11  Sat 2026-09-12
     Sun 2026-09-13  Mon 2026-09-14  Wed 2026-09-16  Thu 2026-09-17
     Tue 2026-11-10  Fri 2026-11-13  Sun 2026-11-15
     Thu 2027-04-01  Fri 2027-04-02  Fri 2027-04-09
     Mon 2034-05-08 = 2026-09-07 + 2,000 working days (exactly 400 weeks) */

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "cal-5day",
    projectId: "p1",
    name: "5-Day",
    workdays: [false, true, true, true, true, true, false],
    hoursPerDay: 8,
    holidays: [],
    exceptions: [],
    blackoutRanges: [],
    ...overrides
  };
}

describe("day numbers", () => {
  it("round-trips ISO dates and knows the weekday", () => {
    expect(isoToDayNumber("2026-09-07")).toBe(20703);
    expect(dayOfWeek(isoToDayNumber("2026-09-07"))).toBe(1); // Monday
    expect(dayOfWeek(isoToDayNumber("2026-09-13"))).toBe(0); // Sunday
    expect(dayOfWeek(isoToDayNumber("1969-12-31"))).toBe(3); // Wednesday, before the epoch
    expect(toIsoDate("2026-09-07T13:45:00.000Z")).toBe("2026-09-07");
    expect(toIsoDate(new Date(Date.UTC(2026, 8, 7)))).toBe("2026-09-07");
  });

  it("rejects things that are not dates", () => {
    expect(() => isoToDayNumber("09/07/2026")).toThrow(TypeError);
    expect(() => isoToDayNumber("2026-02-30")).toThrow(TypeError);
    expect(() => addWorkingDays(calendar(), "2026-09-07", 1.5)).toThrow(TypeError);
  });
});

describe("the working-day index", () => {
  it("is a sorted array of working dates plus an ordinal map", () => {
    const index = buildWorkingDayIndex(calendar(), "2026-09-07", "2026-09-20");
    expect(index.dates).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18"
    ]);
    expect(index.ordinal.size).toBe(10);
    expect(index.ordinal.get("2026-09-14")).toBe(5);
    expect(index.ordinal.has("2026-09-12")).toBe(false);
    expect(dateAtOrdinal(index, 9)).toBe("2026-09-18");
    expect(() => dateAtOrdinal(index, 10)).toThrow(RangeError);
    expect(indexCovers(index, "2026-09-20")).toBe(true);
    expect(indexCovers(index, "2026-09-21")).toBe(false);
  });

  it("resolves non-working dates to their neighbouring ordinals", () => {
    const index = buildWorkingDayIndex(calendar(), "2026-09-05", "2026-09-20"); // span starts on a Saturday
    expect(ordinalOf(index, "2026-09-07")).toBe(0);
    expect(ordinalOf(index, "2026-09-12")).toBeUndefined();
    expect(prevWorkingOrdinal(index, "2026-09-05")).toBe(-1); // nothing works before Monday in this span
    expect(nextWorkingOrdinal(index, "2026-09-05")).toBe(0);
    expect(prevWorkingOrdinal(index, "2026-09-12")).toBe(4); // Fri Sep 11
    expect(nextWorkingOrdinal(index, "2026-09-12")).toBe(5); // Mon Sep 14
    expect(nextWorkingOrdinal(index, "2026-09-11")).toBe(4);
    expect(nextWorkingOrdinal(index, "2026-09-19")).toBe(10); // past the last working day = dates.length
  });

  it("refuses dates outside an explicit index instead of guessing", () => {
    const index = buildWorkingDayIndex(calendar(), "2026-09-07", "2026-09-11");
    expect(() => addWorkingDays(index, "2026-09-11", 1)).toThrow(RangeError);
    expect(() => countWorkingDays(index, "2026-09-07", "2026-09-14")).toThrow(RangeError);
    expect(isWorkingDay(index, "2026-09-14")).toBe(true); // rules still answer outside the span
  });

  it("caches per calendar object and grows to cover what is asked", () => {
    const cal = calendar();
    const first = workingDayIndexFor(cal, "2026-09-07");
    expect(workingDayIndexFor(cal, "2026-09-07")).toBe(first);
    const grown = workingDayIndexFor(cal, "2040-01-01");
    expect(grown).not.toBe(first);
    expect(indexCovers(grown, "2026-09-07")).toBe(true);
    expect(indexCovers(grown, "2040-01-01")).toBe(true);
    expect(workingDayIndexFor(cal, "2030-06-01")).toBe(grown);
    // a changed calendar is a new object → a new index
    expect(workingDayIndexFor({ ...cal }, "2026-09-07")).not.toBe(grown);
  });
});

describe("addWorkingDays", () => {
  it("weekend spanning: a 5-day activity starting Thursday finishes the following Wednesday", () => {
    // duration d starting on working day n finishes at the end of day n + d − 1
    expect(addWorkingDays(calendar(), "2026-09-10", 5 - 1)).toBe("2026-09-16");
    expect(countWorkingDays(calendar(), "2026-09-10", "2026-09-16") + 1).toBe(5);
    expect(isWorkingDay(calendar(), "2026-09-12")).toBe(false);
    expect(isWorkingDay(calendar(), "2026-09-13")).toBe(false);
  });

  it("a holiday inside the duration pushes the finish out a day", () => {
    const cal = calendar({ holidays: ["2026-09-14"] });
    expect(isWorkingDay(cal, "2026-09-14")).toBe(false);
    expect(addWorkingDays(cal, "2026-09-10", 4)).toBe("2026-09-17");
    expect(countWorkingDays(cal, "2026-09-10", "2026-09-17")).toBe(4);
  });

  it("a Saturday exception is a working day and pulls the finish in", () => {
    const cal = calendar({ exceptions: ["2026-09-12"] });
    expect(isWorkingDay(cal, "2026-09-12")).toBe(true);
    expect(isWorkingDay(cal, "2026-09-13")).toBe(false);
    expect(addWorkingDays(cal, "2026-09-10", 4)).toBe("2026-09-15");
    const index = buildWorkingDayIndex(cal, "2026-09-07", "2026-09-13");
    expect(index.dates).toContain("2026-09-12");
  });

  it("a blackout range pushes the remaining work forward rather than compressing it", () => {
    const cal = calendar({
      id: "cal-paving",
      name: "Paving",
      blackoutRanges: [{ start: "2026-11-15", end: "2027-04-01", reason: "Winter paving ban" }]
    });
    // 10 working days from Tue Nov 10: Nov 10–13 (4 days), then the ban, then Apr 2, 5, 6, 7, 8, 9.
    expect(addWorkingDays(cal, "2026-11-10", 10 - 1)).toBe("2027-04-09");
    expect(countWorkingDays(cal, "2026-11-10", "2027-04-09") + 1).toBe(10);
    expect(countWorkingDays(cal, "2026-11-13", "2027-04-02")).toBe(1); // nothing counts inside the ban
    expect(isWorkingDay(cal, "2026-12-01")).toBe(false);
    expect(isWorkingDay(cal, "2027-04-01")).toBe(false); // inclusive end
    expect(isWorkingDay(cal, "2027-04-02")).toBe(true);
    expect(nextWorkingDay(cal, "2027-01-15")).toBe("2027-04-02");
    expect(previousWorkingDay(cal, "2027-01-15")).toBe("2026-11-13");
    // A reversed range is normalised, not ignored.
    const reversed = calendar({ blackoutRanges: [{ start: "2027-04-01", end: "2026-11-15", reason: "typed backwards" }] });
    expect(isWorkingDay(reversed, "2026-12-01")).toBe(false);
  });

  it("negative day counts walk backwards through working days", () => {
    expect(addWorkingDays(calendar(), "2026-09-14", -1)).toBe("2026-09-11");
    expect(addWorkingDays(calendar(), "2026-09-14", -5)).toBe("2026-09-07");
    expect(addWorkingDays(calendar({ holidays: ["2026-09-11"] }), "2026-09-14", -1)).toBe("2026-09-10");
    expect(countWorkingDays(calendar(), "2026-09-14", "2026-09-07")).toBe(-5);
    expect(countWorkingDays(calendar(), "2026-09-11", "2026-09-07")).toBe(-4);
    expect(countWorkingDays(calendar(), "2026-09-14", "2026-09-12")).toBe(-1);
  });

  it("a zero-day span is zero, and adding zero days snaps forward to a working day", () => {
    expect(countWorkingDays(calendar(), "2026-09-10", "2026-09-10")).toBe(0);
    expect(countWorkingDays(calendar(), "2026-09-12", "2026-09-12")).toBe(0);
    expect(Object.is(countWorkingDays(calendar(), "2026-09-12", "2026-09-12"), 0)).toBe(true); // never −0
    expect(countWorkingDays(calendar(), "2026-09-11", "2026-09-13")).toBe(0); // Fri → Sun: no working day elapses
    expect(addWorkingDays(calendar(), "2026-09-10", 0)).toBe("2026-09-10");
    expect(addWorkingDays(calendar(), "2026-09-12", 0)).toBe("2026-09-14");
    expect(nextWorkingDay(calendar(), "2026-09-12")).toBe("2026-09-14");
    expect(previousWorkingDay(calendar(), "2026-09-12")).toBe("2026-09-11");
    expect(previousWorkingDay(calendar(), "2026-09-11")).toBe("2026-09-11");
  });

  it("counts whole working days from a non-working anchor", () => {
    expect(addWorkingDays(calendar(), "2026-09-12", 1)).toBe("2026-09-14"); // Saturday + 1 = Monday
    expect(addWorkingDays(calendar(), "2026-09-12", -1)).toBe("2026-09-11"); // Saturday − 1 = Friday
    expect(countWorkingDays(calendar(), "2026-09-12", "2026-09-14")).toBe(1);
    expect(countWorkingDays(calendar(), "2026-09-13", "2026-09-14")).toBe(1);
    expect(countWorkingDays(calendar(), "2026-09-11", "2026-09-12")).toBe(0);
  });

  it("is consistent: distance is additive and antisymmetric, and add inverts count", () => {
    const cal = calendar({
      holidays: ["2026-09-14", "2026-11-26"],
      exceptions: ["2026-09-12"],
      blackoutRanges: [{ start: "2026-10-05", end: "2026-10-09", reason: "shutdown" }]
    });
    const dates = ["2026-09-05", "2026-09-07", "2026-09-12", "2026-09-14", "2026-10-07", "2026-10-12", "2026-11-26", "2026-12-24"];
    for (const a of dates) {
      for (const b of dates) {
        expect(countWorkingDays(cal, a, b) + countWorkingDays(cal, b, a)).toBe(0); // antisymmetric
        for (const c of dates) {
          expect(countWorkingDays(cal, a, b) + countWorkingDays(cal, b, c)).toBe(countWorkingDays(cal, a, c));
        }
        if (isWorkingDay(cal, a) && isWorkingDay(cal, b)) {
          expect(addWorkingDays(cal, a, countWorkingDays(cal, a, b))).toBe(b);
        }
      }
    }
  });

  it("accepts a 6-day paving calendar", () => {
    const cal = calendar({ id: "cal-6day", name: "6-Day Paving", workdays: [false, true, true, true, true, true, true] });
    expect(addWorkingDays(cal, "2026-09-10", 4)).toBe("2026-09-15"); // Thu, Fri, Sat, Mon, Tue
    expect(buildWorkingDayIndex(cal, "2026-09-07", "2026-09-13").dates).toHaveLength(6);
  });

  it("grows the cached index automatically for long horizons", () => {
    expect(addWorkingDays(calendar(), "2026-09-07", 2000)).toBe("2034-05-08");
    expect(addWorkingDays(calendar(), "2034-05-08", -2000)).toBe("2026-09-07");
    expect(countWorkingDays(calendar(), "2026-09-07", "2034-05-08")).toBe(2000);
  });

  it("reports a calendar with no working days instead of looping forever", () => {
    const dead = calendar({ id: "cal-dead", workdays: [false, false, false, false, false, false, false] });
    expect(isWorkingDay(dead, "2026-09-07")).toBe(false);
    expect(countWorkingDays(dead, "2026-09-07", "2026-12-07")).toBe(0);
    expect(() => addWorkingDays(dead, "2026-09-07", 1)).toThrow(RangeError);
    expect(validateCalendar(dead)).toContain("calendar has no working days");
  });
});

describe("precedence", () => {
  it("a forced working day beats a holiday and a blackout", () => {
    const cal = calendar({
      holidays: ["2026-09-14"],
      exceptions: ["2026-09-14", "2026-12-05"],
      blackoutRanges: [{ start: "2026-11-15", end: "2027-04-01", reason: "Winter paving ban" }]
    });
    expect(isWorkingDay(cal, "2026-09-14")).toBe(true);
    expect(isWorkingDay(cal, "2026-12-05")).toBe(true); // a Saturday inside the ban, forced
    expect(isWorkingDay(cal, "2026-12-04")).toBe(false);
    expect(addWorkingDays(cal, "2026-11-13", 1)).toBe("2026-12-05");
    expect(validateCalendar(cal)).toEqual(["2026-09-14 is both a holiday and a forced working day (it works)"]);
  });

  it("a holiday beats the weekly pattern", () => {
    const cal = calendar({ holidays: ["2026-11-26"] });
    expect(isWorkingDay(cal, "2026-11-26")).toBe(false);
    expect(addWorkingDays(cal, "2026-11-25", 1)).toBe("2026-11-27");
  });

  it("skips malformed entries rather than failing the whole calendar", () => {
    const cal = calendar({
      holidays: ["not a date", "2026-09-14"],
      exceptions: ["2026-13-40"],
      blackoutRanges: [{ start: "", end: "2026-10-01", reason: "" }]
    });
    expect(isWorkingDay(cal, "2026-09-14")).toBe(false);
    expect(isWorkingDay(cal, "2026-09-15")).toBe(true);
    expect(validateCalendar(cal)).toHaveLength(3);
  });
});

describe("Date objects", () => {
  it("are read by their UTC date and returned as UTC-midnight Dates", () => {
    const thursday = new Date(Date.UTC(2026, 8, 10, 15, 30)); // afternoon, still Sep 10
    const finish = addWorkingDays(calendar(), thursday, 4);
    expect(finish).toBeInstanceOf(Date);
    expect(finish.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(countWorkingDays(calendar(), thursday, finish)).toBe(4);
    expect(isWorkingDay(calendar(), new Date(Date.UTC(2026, 8, 12)))).toBe(false);
    expect(nextWorkingDay(calendar(), new Date(Date.UTC(2026, 8, 12))).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(() => addWorkingDays(calendar(), new Date(Number.NaN), 1)).toThrow(TypeError);
  });
});
