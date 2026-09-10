import { describe, expect, it } from "vitest";
import { buildScheduleMonthCells, firstOfScheduleMonth, formatScheduleMonth, shiftScheduleMonth } from "./month";

describe("buildScheduleMonthCells", () => {
  const cells = buildScheduleMonthCells("2026-09-15");
  it("draws six Sunday-first weeks around the month", () => {
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe("2026-08-30"); // the Sunday before Tuesday 1 September
    expect(cells[2]).toMatchObject({ date: "2026-09-01", dayNum: 1, inMonth: true, weekIndex: 0 });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(cells[41]).toMatchObject({ date: "2026-10-10", inMonth: false, weekIndex: 5 });
  });
  it("marks the days the workspace does not work", () => {
    expect(cells.filter((cell) => cell.weekend).map((cell) => cell.date)).toEqual([
      "2026-08-30",
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
      "2026-09-27",
      "2026-10-04"
    ]);
    expect(buildScheduleMonthCells("2026-09-01", [1, 2, 3, 4, 5]).filter((cell) => cell.weekend)).toHaveLength(12);
    expect(buildScheduleMonthCells("2026-09-01", [0, 1, 2, 3, 4, 5, 6]).filter((cell) => cell.weekend)).toHaveLength(0);
  });
});

describe("month anchors", () => {
  it("snaps to the first of the month and steps across year ends", () => {
    expect(firstOfScheduleMonth("2026-09-15")).toBe("2026-09-01");
    expect(shiftScheduleMonth("2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftScheduleMonth("2026-01-15", -1)).toBe("2025-12-01");
    expect(shiftScheduleMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(formatScheduleMonth("2026-09-01")).toBe("September 2026");
  });
});
