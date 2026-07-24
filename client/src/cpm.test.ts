import { describe, expect, it } from "vitest";
import {
  calculateCpm,
  compareToBaseline,
  createWorkCalendar,
  fromDayIndex,
  inclusiveDuration,
  toDayIndex,
  type CpmLink,
  type CpmTask
} from "@buildflow/shared";

const task = (id: string, duration: number, extra: Partial<CpmTask> = {}): CpmTask => ({ id, duration, ...extra });
const link = (predecessorId: string, successorId: string, type: CpmLink["type"] = "FS", lag = 0): CpmLink => ({
  predecessorId,
  successorId,
  type,
  lag
});

describe("cpm — forward/backward pass", () => {
  it("schedules a simple finish-to-start chain and makes all of it critical", () => {
    const result = calculateCpm(
      [task("a", 2), task("b", 3), task("c", 1)],
      [link("a", "b"), link("b", "c")]
    );

    expect(result.cycle).toBeNull();
    expect(result.projectStart).toBe(0);
    expect(result.projectFinish).toBe(6);
    expect(result.tasks.a).toMatchObject({ earlyStart: 0, earlyFinish: 2, lateStart: 0, lateFinish: 2, totalFloat: 0 });
    expect(result.tasks.b).toMatchObject({ earlyStart: 2, earlyFinish: 5, totalFloat: 0 });
    expect(result.tasks.c).toMatchObject({ earlyStart: 5, earlyFinish: 6, totalFloat: 0 });
    // a single chain: every task is on the critical path, in order
    expect(result.criticalPath).toEqual(["a", "b", "c"]);
  });

  it("gives the shorter parallel branch float and keeps it off the critical path", () => {
    // a → b(3) → d   and   a → c(1) → d ; the b branch is 2 days longer
    const result = calculateCpm(
      [task("a", 2), task("b", 3), task("c", 1), task("d", 1)],
      [link("a", "b"), link("a", "c"), link("b", "d"), link("c", "d")]
    );

    expect(result.projectFinish).toBe(6);
    expect(result.tasks.b.totalFloat).toBe(0);
    expect(result.tasks.c.totalFloat).toBe(2);
    expect(result.tasks.c.critical).toBe(false);
    expect(result.criticalPath).toEqual(["a", "b", "d"]);
  });

  it("free float only counts slack that does not disturb a successor", () => {
    // c can slip 2 days before d moves, so its free float equals its total float here
    const result = calculateCpm(
      [task("a", 2), task("b", 3), task("c", 1), task("d", 1)],
      [link("a", "b"), link("a", "c"), link("b", "d"), link("c", "d")]
    );
    expect(result.tasks.c.freeFloat).toBe(2);
    // b drives d directly — no free float
    expect(result.tasks.b.freeFloat).toBe(0);
  });
});

describe("cpm — relation types and lag", () => {
  it("FS with positive lag pushes the successor out by the lag", () => {
    const result = calculateCpm([task("a", 2), task("b", 3)], [link("a", "b", "FS", 2)]);
    expect(result.tasks.b.earlyStart).toBe(4); // a finishes at 2, +2 lag
    expect(result.projectFinish).toBe(7);
  });

  it("FS with negative lag (lead) overlaps the successor", () => {
    const result = calculateCpm([task("a", 4), task("b", 3)], [link("a", "b", "FS", -2)]);
    expect(result.tasks.b.earlyStart).toBe(2); // starts 2 days before a finishes
  });

  it("SS ties starts together with lag", () => {
    const result = calculateCpm([task("a", 4), task("b", 2)], [link("a", "b", "SS", 1)]);
    expect(result.tasks.b.earlyStart).toBe(1);
    expect(result.tasks.b.earlyFinish).toBe(3);
  });

  it("FF ties finishes together with lag", () => {
    const result = calculateCpm([task("a", 4), task("b", 2)], [link("a", "b", "FF", 0)]);
    // b must finish when a finishes (4) → it starts at 2
    expect(result.tasks.b.earlyFinish).toBe(4);
    expect(result.tasks.b.earlyStart).toBe(2);
  });

  it("SF drives the successor's finish from the predecessor's start", () => {
    const result = calculateCpm([task("a", 4), task("b", 2)], [link("a", "b", "SF", 3)]);
    // b must finish at a.ES + 3 = 3 → starts at 1
    expect(result.tasks.b.earlyFinish).toBe(3);
    expect(result.tasks.b.earlyStart).toBe(1);
  });

  it("takes the binding relation when a task has several predecessors", () => {
    const result = calculateCpm(
      [task("a", 2), task("b", 6), task("c", 1)],
      [link("a", "c", "FS", 0), link("b", "c", "FS", 0)]
    );
    expect(result.tasks.c.earlyStart).toBe(6); // b is the driver, not a
  });
});

describe("cpm — constraints", () => {
  it("SNET floors the early start", () => {
    const result = calculateCpm([task("a", 2, { constraintType: "SNET", constraintDate: 5 })], []);
    expect(result.tasks.a.earlyStart).toBe(5);
    expect(result.projectFinish).toBe(7);
  });

  it("SNET propagates through the network", () => {
    const result = calculateCpm(
      [task("a", 2), task("b", 2, { constraintType: "SNET", constraintDate: 10 })],
      [link("a", "b")]
    );
    expect(result.tasks.b.earlyStart).toBe(10);
    expect(result.tasks.a.totalFloat).toBe(8); // a can drift until it drives b
  });

  it("FNLT produces negative float when the plan cannot make the date", () => {
    // needs 6 days but must finish by day 4 → 2 days behind
    const result = calculateCpm(
      [task("a", 3), task("b", 3, { constraintType: "FNLT", constraintDate: 4 })],
      [link("a", "b")]
    );
    expect(result.tasks.b.totalFloat).toBe(-2);
    expect(result.tasks.b.critical).toBe(true);
    expect(result.tasks.a.totalFloat).toBe(-2); // the slip pushes back up the chain
  });

  it("MSO pins the start hard", () => {
    const result = calculateCpm(
      [task("a", 2), task("b", 2, { constraintType: "MSO", constraintDate: 7 })],
      [link("a", "b")]
    );
    expect(result.tasks.b.earlyStart).toBe(7);
    expect(result.tasks.b.earlyFinish).toBe(9);
  });
});

describe("cpm — edge cases", () => {
  it("handles milestones (zero duration)", () => {
    const result = calculateCpm([task("a", 3), task("m", 0)], [link("a", "m")]);
    expect(result.tasks.m).toMatchObject({ earlyStart: 3, earlyFinish: 3, totalFloat: 0 });
  });

  it("detects a dependency cycle instead of hanging", () => {
    const result = calculateCpm(
      [task("a", 1), task("b", 1), task("c", 1)],
      [link("a", "b"), link("b", "c"), link("c", "a")]
    );
    expect(result.cycle).not.toBeNull();
    expect(result.cycle!.length).toBeGreaterThan(0);
    expect(result.criticalPath).toEqual([]);
  });

  it("ignores links that reference unknown tasks or point at themselves", () => {
    const result = calculateCpm([task("a", 2), task("b", 2)], [link("a", "b"), link("ghost", "b"), link("a", "a")]);
    expect(result.cycle).toBeNull();
    expect(result.tasks.b.earlyStart).toBe(2);
  });

  it("returns an empty result for an empty network", () => {
    expect(calculateCpm([], [])).toMatchObject({ projectFinish: 0, criticalPath: [], cycle: null });
  });

  it("schedules independent tasks in parallel from the project start", () => {
    const result = calculateCpm([task("a", 3), task("b", 5)], []);
    expect(result.tasks.a.earlyStart).toBe(0);
    expect(result.tasks.b.earlyStart).toBe(0);
    expect(result.projectFinish).toBe(5);
    expect(result.tasks.a.totalFloat).toBe(2); // a can slip 2 days without moving the finish
    expect(result.criticalPath).toEqual(["b"]);
  });
});

describe("cpm — date axis helpers", () => {
  it("round-trips dates through the day-index axis", () => {
    expect(toDayIndex("2026-07-06", "2026-07-06")).toBe(0);
    expect(toDayIndex("2026-07-13", "2026-07-06")).toBe(7);
    expect(toDayIndex("2026-07-01", "2026-07-06")).toBe(-5);
    expect(fromDayIndex(7, "2026-07-06")).toBe("2026-07-13");
    expect(fromDayIndex(0, "2026-07-06")).toBe("2026-07-06");
  });

  it("crosses month and year boundaries", () => {
    expect(toDayIndex("2027-01-01", "2026-12-31")).toBe(1);
    expect(fromDayIndex(1, "2026-12-31")).toBe("2027-01-01");
  });

  it("measures inclusive duration the way a schedule reads it", () => {
    expect(inclusiveDuration("2026-07-06", "2026-07-06")).toBe(1); // a one-day job
    expect(inclusiveDuration("2026-07-06", "2026-07-08")).toBe(3);
  });
});

// 2026-07-13 is a Monday; 07-18 Sat, 07-19 Sun, 07-20 Mon.
describe("cpm — working calendar", () => {
  const calendar = createWorkCalendar("2026-07-13");

  it("treats Mon–Sat as working and Sunday as off by default (six-day construction week)", () => {
    expect(calendar.isWorkingDay("2026-07-13")).toBe(true); // Mon
    expect(calendar.isWorkingDay("2026-07-18")).toBe(true); // Sat — crews work Saturdays
    expect(calendar.isWorkingDay("2026-07-19")).toBe(false); // Sun
    expect(calendar.isWorkingDay("2026-07-20")).toBe(true); // Mon
  });

  it("builds an axis that simply skips non-working days", () => {
    expect(calendar.fromIndex(0)).toBe("2026-07-13"); // Mon
    expect(calendar.fromIndex(5)).toBe("2026-07-18"); // Sat
    expect(calendar.fromIndex(6)).toBe("2026-07-20"); // Sunday skipped entirely
    expect(calendar.toIndex("2026-07-20")).toBe(6);
  });

  it("snaps a non-working date forward to the next working day", () => {
    expect(calendar.toIndex("2026-07-19")).toBe(6); // Sun → Mon
    expect(calendar.nextWorkingDay("2026-07-19")).toBe("2026-07-20");
    expect(calendar.nextWorkingDay("2026-07-17")).toBe("2026-07-17"); // already working
  });

  it("counts duration in working days, not calendar days", () => {
    expect(calendar.duration("2026-07-13", "2026-07-15")).toBe(3); // Mon–Wed
    expect(calendar.duration("2026-07-17", "2026-07-20")).toBe(3); // Fri, Sat, Mon — Sunday doesn't count
    expect(calendar.duration("2026-07-18", "2026-07-19")).toBe(1); // Sat only
    expect(calendar.duration("2026-07-13", "2026-07-13")).toBe(1); // single day
  });

  it("honours holidays as non-working", () => {
    const withHoliday = createWorkCalendar("2026-07-13", { holidays: ["2026-07-15"] });
    expect(withHoliday.isWorkingDay("2026-07-15")).toBe(false);
    // Mon, Tue, (Wed holiday), Thu → 3 working days
    expect(withHoliday.duration("2026-07-13", "2026-07-16")).toBe(3);
    expect(withHoliday.fromIndex(2)).toBe("2026-07-16"); // Wed skipped
  });

  it("supports a five-day week when the crew doesn't work Saturdays", () => {
    const fiveDay = createWorkCalendar("2026-07-13", { weekendDays: [0, 6] });
    expect(fiveDay.isWorkingDay("2026-07-18")).toBe(false); // Sat off
    expect(fiveDay.duration("2026-07-17", "2026-07-20")).toBe(2); // Fri + Mon
    expect(fiveDay.fromIndex(5)).toBe("2026-07-20"); // after Fri comes Mon
  });

  it("schedules the network on working days — a Saturday finish rolls to Monday", () => {
    // A runs Mon–Sat (6 working days). FS+0 means "the next working day", which
    // on a calendar-day axis would wrongly land on Sunday.
    const result = calculateCpm([task("a", 6), task("b", 2)], [link("a", "b", "FS", 0)]);
    expect(calendar.fromIndex(result.tasks.a.earlyStart)).toBe("2026-07-13"); // Mon
    expect(calendar.fromIndex(result.tasks.a.earlyFinish - 1)).toBe("2026-07-18"); // Sat (last working day)
    expect(calendar.fromIndex(result.tasks.b.earlyStart)).toBe("2026-07-20"); // Mon, not Sunday
  });

  it("a one-working-day lag across a weekend lands on Tuesday, not Sunday", () => {
    const result = calculateCpm([task("a", 6), task("b", 1)], [link("a", "b", "FS", 1)]);
    // a finishes Sat; +1 working day of lag → skip Sun, skip Mon → Tue
    expect(calendar.fromIndex(result.tasks.b.earlyStart)).toBe("2026-07-21");
  });
});

describe("cpm — baseline comparison", () => {
  it("reports a slip against the baseline", () => {
    const variance = compareToBaseline(
      { startDate: "2026-07-08", endDate: "2026-07-10" },
      { baselineStart: "2026-07-06", baselineEnd: "2026-07-08" }
    );
    expect(variance).toEqual({ startVariance: 2, finishVariance: 2, slipped: true });
  });

  it("reports pulling ahead of the baseline", () => {
    const variance = compareToBaseline(
      { startDate: "2026-07-06", endDate: "2026-07-07" },
      { baselineStart: "2026-07-06", baselineEnd: "2026-07-09" }
    );
    expect(variance).toMatchObject({ finishVariance: -2, slipped: false });
  });

  it("returns null when no baseline has been set", () => {
    expect(compareToBaseline({ startDate: "2026-07-06", endDate: "2026-07-08" }, {})).toBeNull();
  });
});
