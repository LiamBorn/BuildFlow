import { describe, expect, it } from "vitest";
import { constructionHolidays, defaultWorkCalendar, isWorkingDay, normalizeWorkCalendar, usFederalHolidays } from "@buildflow/shared";

describe("the work calendar", () => {
  it("computes a year's holidays on their observed dates — 2027 included", () => {
    const byName = Object.fromEntries(usFederalHolidays(2027).map((holiday) => [holiday.name, holiday.date]));
    expect(byName["Independence Day"]).toBe("2027-07-05"); // July 4 2027 is a Sunday
    expect(byName["Labor Day"]).toBe("2027-09-06");
    expect(byName["Thanksgiving"]).toBe("2027-11-25");
    expect(byName["Memorial Day"]).toBe("2027-05-31");
    expect(constructionHolidays(2026).map((holiday) => holiday.date)).toEqual([
      "2026-01-01",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25"
    ]);
  });

  it("defaults to a six-day week and tidies what was stored", () => {
    expect(defaultWorkCalendar(2026).workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    const tidy = normalizeWorkCalendar({
      workingDays: [5, 1, 1, 9],
      holidays: [
        { date: "2027-01-01", name: " New Year " },
        { date: "nope", name: "x" },
        { date: "2027-01-01", name: "dup" }
      ]
    });
    expect(tidy).toEqual({ workingDays: [1, 5], holidays: [{ date: "2027-01-01", name: "New Year" }] });
    expect(normalizeWorkCalendar({ workingDays: [] }).workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isWorkingDay("2027-01-01", tidy)).toBe(false);
    expect(isWorkingDay("2027-01-04", tidy)).toBe(true); // a Monday
    expect(isWorkingDay("2027-01-05", tidy)).toBe(false); // a Tuesday, not in [1, 5]
  });
});
