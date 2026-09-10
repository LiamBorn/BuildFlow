import { describe, expect, it } from "vitest";
import type { Crew, Job, Project, ScheduleAssignment } from "@buildflow/shared";
import { EXPORT_COLUMNS, scheduleExportRows, toCsv, weekSheetHtml } from "./export";

const job = (id: string, extra: Partial<Job> = {}): Job =>
  ({
    id,
    name: id,
    projectId: "p-1",
    phase: "Concrete",
    status: "Planned",
    startTime: "7:00 AM",
    endTime: "3:00 PM",
    requiredLabor: 2,
    location: "East Austin",
    requiredEquipment: "Pump",
    materialsStatus: "Delivered",
    startDate: "2026-09-08",
    endDate: "2026-09-08",
    ...extra
  }) as Job;
const scope = {
  jobs: [job("Pour slab"), job("Strip forms", { startDate: "2026-09-20", endDate: "2026-09-20" })],
  crews: [{ id: "c-1", name: "Concrete Crew 1", specialty: "Concrete", lead: "Dana" }] as Crew[],
  projects: [{ id: "p-1", name: "Riverside" }] as Project[],
  assignments: [
    { id: "a-1", jobId: "Pour slab", crewId: "c-1", date: "2026-09-08", status: "Planned", conflicts: ["Double-booked crew"] }
  ] as ScheduleAssignment[]
};

describe("the schedule export", () => {
  it("writes the same columns for every page, one row per booking", () => {
    const rows = scheduleExportRows(scope);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      "2026-09-08",
      "Tue",
      "Concrete Crew 1",
      "Pour slab",
      "Riverside",
      "Concrete",
      "Planned",
      "7:00 AM",
      "3:00 PM",
      "2",
      "16",
      "East Austin",
      "Pump",
      "Delivered",
      "Double-booked crew"
    ]);
    expect(rows[0]).toHaveLength(EXPORT_COLUMNS.length);
  });

  it("adds unbooked jobs when a page asks, and keeps to the window when one is given", () => {
    const withUnbooked = scheduleExportRows({ ...scope, includeUnbooked: true });
    expect(withUnbooked.map((row) => row[3])).toEqual(["Pour slab", "Strip forms"]);
    expect(withUnbooked[1].slice(0, 3)).toEqual(["", "", ""]);
    expect(scheduleExportRows({ ...scope, window: { start: "2026-09-14", end: "2026-09-20" } })).toEqual([]);
  });

  it("quotes CSV cells and prints a sheet per crew", () => {
    const csv = toCsv([["a", 'say "hi"', "1,2"]], ["x", "y", "z"]);
    expect(csv).toBe('"x","y","z"\n"a","say ""hi""","1,2"');
    const html = weekSheetHtml({ title: "Week", weekDays: ["2026-09-07", "2026-09-08"], ...scope });
    expect(html).toContain('<section class="sheet">');
    expect(html).toContain("Concrete Crew 1");
    expect(html).toContain("Pour slab");
    expect(html).toContain("Double-booked crew");
  });
});
