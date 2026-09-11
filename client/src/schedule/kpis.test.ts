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
    // the week these tests count; a job that does not run over it is not that week's problem
    startDate: "2026-09-07",
    endDate: "2026-09-13",
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

  it("lets a crew read over 100% when it is booked past the working week", () => {
    // every day of a seven-day stretch, against a six-day working week
    const everyDay = week.map((date, index) => booking(`b-${index}`, "j", "c-1", date));
    expect(crewWeekUtilization(crew("c-1"), everyDay, 6)).toBe(117);
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
      month: "2026-09",
      phases: [],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
    });
    // j-1: 8.5h × 4 = 34 per booking, twice at $90; j-2: 6h × 2 = 12 at $88, the default for
    // a Concrete crew carrying no rate of its own — which is what the crew form's placeholder offers
    expect(kpis.hours).toBe(80);
    expect(kpis.laborCost).toBe("$7,176");
    expect(kpis.unpricedCrews).toBe(1);
    expect(kpis.definitions.activities).toContain(
      "One crew carries no rate of its own and is priced at the specialty default ($88 an hour)."
    );
    expect(kpis.activities).toBe(3);
    expect(kpis.activeCrews).toBe(2);
    // 3 booked crew-days of 2 crews × 6 working days
    expect(kpis.utilization).toBe(25);
    // j-1 has a conflicted booking, j-2 is At Risk over the week: two jobs in trouble, counted once each
    expect(kpis.atRisk).toBe(2);
    expect(kpis.definitions.atRisk).toMatch(/conflict note/);
  });

  it("counts a job in trouble once, however many ways it shows", () => {
    const jobs = [job("j-1", { status: "At Risk" })];
    const weekAssignments = [
      booking("a-1", "j-1", "c-1", "2026-09-07", ["Double-booked crew"]),
      booking("a-2", "j-1", "c-1", "2026-09-08", ["Missing materials"])
    ];
    const kpis = computeScheduleKpis({
      crews: [crew("c-1")],
      jobs,
      weekAssignments,
      weekDays: week,
      month: "2026-09",
      phases: [],
      projects: []
    });
    expect(kpis.atRisk).toBe(1);
  });

  it("leaves the week's figures at zero when nothing runs over it", () => {
    const kpis = computeScheduleKpis({
      crews: [crew("c-1")],
      jobs: [job("j-1", { status: "At Risk" })],
      weekAssignments: [],
      weekDays: ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09", "2027-01-10"],
      month: "2027-01",
      phases: [{ id: "ph-1", projectId: "p-1", name: "Foundations", startDate: "2026-09-01", endDate: "2026-09-30" }],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] }
    } as unknown as Parameters<typeof computeScheduleKpis>[0]);
    // the job is At Risk but runs in September, and the phase ends in a month this page is not showing
    expect(kpis.atRisk).toBe(0);
    expect(kpis.activities).toBe(0);
    expect(kpis.activeCrews).toBe(0);
    expect(kpis.milestones).toBe(0);
    expect(kpis.monthShort).toBe("Jan");
  });

  it("says an over-booked week is over-booked instead of calling it full", () => {
    const crews = [crew("c-1", 90), crew("c-2", 90)];
    // two crews booked on all seven days of a six-working-day week: 14 crew-days over 12
    const weekAssignments = week.flatMap((date) => [booking(`a-${date}`, "j-1", "c-1", date), booking(`b-${date}`, "j-1", "c-2", date)]);
    const kpis = computeScheduleKpis({
      crews,
      jobs: [job("j-1")],
      weekAssignments,
      weekDays: week,
      month: "2026-09",
      phases: [],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
    });
    expect(kpis.bookedCrewDays).toBe(14);
    expect(kpis.workingDays).toBe(6);
    expect(kpis.utilization).toBe(117); // was capped at 100, which read the same as a full week
    expect(kpis.definitions.crews).toContain("14 of 12 — over-booked");
  });

  it("treats a rate of zero as no rate at all, and says which crews that was", () => {
    const priced = (rate: number | undefined) => {
      const crews = [{ id: "c-1", name: "c-1", specialty: "Concrete", rate }] as unknown as Crew[];
      return computeScheduleKpis({
        crews,
        jobs: [job("j-1")],
        weekAssignments: [booking("a-1", "j-1", "c-1", "2026-09-07")],
        weekDays: week,
        month: "2026-09",
        phases: [],
        projects: [],
        calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
      });
    };
    // 8.5h × 4 = 34 labour-hours, at the Concrete default of $88
    expect(priced(0).laborCost).toBe("$2,992"); // was "$0", with nothing saying why
    expect(priced(undefined).laborCost).toBe("$2,992");
    expect(priced(0).unpricedCrews).toBe(1);
    expect(priced(50).laborCost).toBe("$1,700");
    expect(priced(50).unpricedCrews).toBe(0);
    expect(priced(50).definitions.activities).not.toContain("no rate of its own");
  });

  it("rounds the money once, at the end", () => {
    // a 7:00–3:20 shift is 8.333… hours; rounding it to 8.33 before the labour and the rate
    // went near it lost a few cents on every booking
    const long = job("j-long", { startTime: "7:00 AM", endTime: "3:20 PM", requiredLabor: 4 });
    const days = week.slice(0, 5);
    const kpis = computeScheduleKpis({
      crews: [crew("c-1", 70)],
      jobs: [long],
      weekAssignments: days.map((date, index) => booking(`a-${index}`, "j-long", "c-1", date)),
      weekDays: week,
      month: "2026-09",
      phases: [],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
    });
    expect(kpis.hours).toBe(166.7); // 5 × 8⅓ × 4
    expect(kpis.laborCost).toBe("$11,667"); // exactly $11,666.67; it used to read $11,662
  });

  it("has no utilisation to report when there are no crews in view", () => {
    const kpis = computeScheduleKpis({
      crews: [],
      jobs: [job("j-1")],
      weekAssignments: [booking("a-1", "j-1", "c-1", "2026-09-07")],
      weekDays: week,
      month: "2026-09",
      phases: [],
      projects: [],
      calendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
    });
    // the work is real, so saying "0% booked" beside it was the one answer that could not be right
    expect(kpis.utilization).toBeNull();
    expect(kpis.hours).toBe(34);
    expect(kpis.laborCost).not.toBe("$0");
    expect(kpis.definitions.crews).toContain("No crews in view");
  });

  it("counts the milestones of the month the page shows, whatever today is", () => {
    const input = {
      crews: [crew("c-1")],
      jobs: [job("j-1")],
      weekAssignments: [],
      weekDays: week,
      phases: [
        { id: "ph-1", projectId: "p-1", name: "Foundations", startDate: "2026-08-01", endDate: "2026-09-30" },
        { id: "ph-2", projectId: "p-1", name: "Framing", startDate: "2026-10-01", endDate: "2026-10-30" }
      ],
      projects: [{ id: "p-1", name: "Riverside", targetCompletion: "2026-10-15" }]
    } as unknown as Parameters<typeof computeScheduleKpis>[0];
    expect(computeScheduleKpis({ ...input, month: "2026-09" }).milestones).toBe(1);
    expect(computeScheduleKpis({ ...input, month: "2026-10" }).milestones).toBe(2); // the phase and the project target
    expect(computeScheduleKpis({ ...input, month: "2026-10" }).monthShort).toBe("Oct");
  });
});
