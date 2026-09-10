import { describe, expect, it } from "vitest";
import type { Crew, Job, ScheduleAssignment } from "@buildflow/shared";
import { bookingLaborHours, computeScheduleKpis, crewWeekUtilization, jobShiftHours, parseClockTime, workingDays } from "./kpis";

const job = (id: string, extra: Partial<Job> = {}): Job =>
  ({
    id,
    name: id,
    startTime: "7:00 AM",
    endTime: "3:30 PM",
    requiredLabor: 4,
    status: "Planned",
    materialsStatus: "Delivered",
    ...extra
  }) as Job;
const crew = (id: string, rate?: number): Crew => ({ id, name: id, specialty: "Concrete", rate }) as Crew;
const booking = (id: string, jobId: string, crewId: string, date: string, conflicts: string[] = []): ScheduleAssignment =>
  ({ id, jobId, crewId, date, status: "Planned", conflicts }) as ScheduleAssignment;
const week = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];

describe("schedule KPI maths", () => {
  it("reads clock times and turns a job's shift into hours", () => {
    expect(parseClockTime("7:00 AM")).toBe(420);
    expect(parseClockTime("3:30 PM")).toBe(930);
    expect(parseClockTime("12:00 AM")).toBe(0);
    expect(parseClockTime("noon")).toBeNull();
    expect(jobShiftHours(job("a"))).toBe(8.5);
    expect(jobShiftHours(job("b", { startTime: "?", endTime: "?" }))).toBe(8);
    expect(jobShiftHours(job("c", { startTime: "10:00 PM", endTime: "6:00 AM" }))).toBe(8);
    expect(bookingLaborHours(job("a"))).toBe(34);
    expect(bookingLaborHours(job("d", { requiredLabor: 0 }))).toBe(8.5);
  });

  it("counts working days by the workspace calendar: its weekdays minus its holidays", () => {
    const sixDay = { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };
    expect(workingDays(week, sixDay)).toHaveLength(6);
    expect(workingDays(week, { ...sixDay, holidays: [{ date: "2026-09-07", name: "Labor Day" }] })).toHaveLength(5);
    expect(workingDays(week, { workingDays: [1, 2, 3, 4, 5], holidays: [] })).toHaveLength(5);
  });

  it("measures a crew's week as booked days over working days", () => {
    const bookings = [
      booking("a", "j", "c-1", "2026-09-07"),
      booking("b", "j", "c-1", "2026-09-07"),
      booking("c", "j", "c-1", "2026-09-09")
    ];
    expect(crewWeekUtilization(crew("c-1"), bookings, 6)).toBe(33);
    expect(crewWeekUtilization(crew("c-2"), bookings, 6)).toBe(0);
  });

  it("adds the week up the way a hand tally would", () => {
    const jobs = [job("j-1"), job("j-2", { startTime: "8:00 AM", endTime: "2:00 PM", requiredLabor: 2, status: "At Risk" })];
    const crews = [crew("c-1", 90), crew("c-2")];
    const weekAssignments = [
      booking("a-1", "j-1", "c-1", "2026-09-07"),
      booking("a-2", "j-1", "c-1", "2026-09-08", ["Double-booked crew"]),
      booking("a-3", "j-2", "c-2", "2026-09-08")
    ];
    const kpis = computeScheduleKpis({
      crews,
      jobs,
      weekAssignments,
      weekDays: week,
      phases: [],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
    });
    // j-1: 8.5h × 4 = 34 per booking, twice at $90; j-2: 6h × 2 = 12 at the $95 default
    expect(kpis.hours).toBe(80);
    expect(kpis.laborCost).toBe("$7,260");
    expect(kpis.activities).toBe(3);
    expect(kpis.activeCrews).toBe(2);
    // 3 booked crew-days of 2 crews × 6 working days
    expect(kpis.utilization).toBe(25);
    expect(kpis.atRisk).toBe(2);
    expect(kpis.definitions.atRisk).toMatch(/conflict note/);
  });
});
