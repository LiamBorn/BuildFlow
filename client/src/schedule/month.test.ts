import { describe, expect, it } from "vitest";
import { buildScheduleMonthCells, firstOfScheduleMonth, formatScheduleMonth, shiftScheduleMonth } from "./month";

describe("buildScheduleMonthCells", () => {
  const cells = buildScheduleMonthCells("2026-09-15");
  /* It drew a flat six weeks until 2026-09-17, so September printed 1-10 October after the 30th:
     dates from a month the page was not showing, on days a planner could drop work on. The grid
     covers the weeks the month occupies and no more, and the places padding the first and last of
     them are not days — the page draws nothing in them. */
  it("covers the weeks the month occupies and stops on its last day", () => {
    expect(cells).toHaveLength(35); // five weeks: Tuesday 1 September through Wednesday 30
    expect(cells[2]).toMatchObject({ date: "2026-09-01", dayNum: 1, inMonth: true, weekIndex: 0 });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(cells.at(-1)).toMatchObject({ weekIndex: 4 });
    // the only cells that are not September's own are the places padding its first and last week
    expect(cells.filter((cell) => !cell.inMonth).map((cell) => cell.date)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03"
    ]);
    // no cell anywhere in the grid is a day the month does not have
    expect(cells.filter((cell) => cell.inMonth).map((cell) => cell.dayNum)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("takes four weeks or six when that is what the month needs", () => {
    // February 2026 starts on a Sunday and has 28 days: four whole weeks, nothing padding either end
    const february = buildScheduleMonthCells("2026-02-10");
    expect(february).toHaveLength(28);
    expect(february.every((cell) => cell.inMonth)).toBe(true);
    // May 2026 starts on a Friday and has 31: it genuinely needs a sixth week
    const may = buildScheduleMonthCells("2026-05-10");
    expect(may).toHaveLength(42);
    expect(may.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it("marks the days the workspace does not work", () => {
    expect(cells.filter((cell) => cell.weekend).map((cell) => cell.date)).toEqual([
      "2026-08-30",
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
      "2026-09-27"
    ]);
    // Saturdays as well, across the five weeks the month covers
    expect(buildScheduleMonthCells("2026-09-01", [1, 2, 3, 4, 5]).filter((cell) => cell.weekend)).toHaveLength(10);
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
