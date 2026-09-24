/**
 * The Reports page's charts, as arithmetic.
 *
 * Until 2026-09-23 the three series were hardcoded arrays — five months of planned-against-actual
 * hours, six months of backlog, and four crew names at 94/88/81/76 — sitting under a comment that
 * promised every figure came from the workspace's own records. They were identical for an empty
 * workspace and a real one, so nothing on the page could be checked by looking at it.
 *
 * These tests exist because the charts cannot be reached from the UI while the product is in
 * pre-launch: the landing page has no route into the signed-in app. A pure function with its own
 * numbers is the only way to show the figures are real, and the only way anyone can argue with
 * them later.
 */
import { describe, expect, it } from "vitest";
import type { BootstrapPayload, Crew, Job } from "@buildflow/shared";
import { scheduleCalendar } from "@buildflow/shared";
import { buildReportSeries, jobDayHours, hoursBetween, laborHoursWorked } from "../reports/series";
import type { ReportPeriod } from "../reports/series";

/** A job that works 07:00–15:30 (8.5h) with the crew size given. */
const job = (over: Partial<Job>): Job =>
  ({
    id: "j1",
    projectId: "p1",
    name: "Pour",
    phase: "Concrete",
    location: "",
    startDate: "2026-09-01",
    endDate: "2026-09-01",
    startTime: "07:00",
    endTime: "15:30",
    requiredLabor: 1,
    requiredEquipment: "",
    materialsStatus: "Delivered",
    status: "Scheduled",
    priority: "Normal",
    notes: "",
    percentComplete: 0,
    ...over
  }) as Job;

const payload = (jobs: Job[], crews: Partial<Crew>[] = []): BootstrapPayload =>
  ({ jobs, crews: crews.map((c, i) => ({ id: `c${i}`, name: `Crew ${i}`, utilization: 0, ...c })) }) as BootstrapPayload;

describe("a job's working day", () => {
  it("is its own hours times the crew it needs", () => {
    // 07:00–15:30 is 8.5 hours; four people on it is 34 crew-hours for one day.
    expect(jobDayHours(job({ requiredLabor: 4 }))).toBe(34);
  });

  it("counts a job that names no crew as one person, not as nothing", () => {
    expect(jobDayHours(job({ requiredLabor: 0 }))).toBe(8.5);
  });

  it("uses the job's own window rather than a fixed eight-hour day", () => {
    expect(jobDayHours(job({ startTime: "06:00", endTime: "18:00", requiredLabor: 2 }))).toBe(24);
  });
});

describe("hours between two dates", () => {
  const calendar = scheduleCalendar("2026-09-01");

  it("skips non-working days", () => {
    // 2026-09-07 is a Monday; the calendar's only weekend day is Sunday. Mon–Sat is six days.
    expect(hoursBetween(job({}), "2026-09-07", "2026-09-13", calendar)).toBe(6 * 8.5);
  });

  it("is zero when the end is before the start, rather than counting backwards", () => {
    expect(hoursBetween(job({}), "2026-09-10", "2026-09-01", calendar)).toBe(0);
  });
});

describe("labor hours worked", () => {
  const calendar = scheduleCalendar("2026-09-01");

  it("counts only what the field reported starting", () => {
    const jobs = [
      job({ id: "a", actualStart: "2026-09-07", actualFinish: "2026-09-08" }), // 2 days
      job({ id: "b" }) // never reported started
    ];
    expect(laborHoursWorked(jobs, "2026-09-30", calendar)).toBe(2 * 8.5);
  });

  it("runs an unfinished job up to today and no further", () => {
    const jobs = [job({ id: "a", actualStart: "2026-09-07", endDate: "2026-12-31" })];
    // Mon 7th to Wed 9th inclusive is three working days, regardless of the planned finish.
    expect(laborHoursWorked(jobs, "2026-09-09", calendar)).toBe(3 * 8.5);
  });

  it("is zero for a workspace where nothing has started", () => {
    expect(laborHoursWorked([job({})], "2026-09-30", calendar)).toBe(0);
  });
});

describe("the report series", () => {
  it("says nothing rather than something invented for an empty workspace", () => {
    const series = buildReportSeries(payload([]), "2026-09-23");
    expect(series.plannedActual).toEqual([]);
    expect(series.backlog).toEqual([]);
    expect(series.crews).toEqual([]);
  });

  it("puts each job's planned hours in the month the plan puts them", () => {
    const series = buildReportSeries(payload([job({ startDate: "2026-08-03", endDate: "2026-08-04", requiredLabor: 2 })]), "2026-09-23");
    expect(series.plannedActual).toEqual([{ month: "Aug", planned: 2 * 17, actual: 0 }]);
  });

  it("reports actual hours only where the field reported them", () => {
    const series = buildReportSeries(
      payload([job({ startDate: "2026-08-03", endDate: "2026-08-05", actualStart: "2026-08-03", actualFinish: "2026-08-04" })]),
      "2026-09-23"
    );
    // 3 days x 8.5h = 25.5, which the series rounds to whole hours before charting.
    expect(series.plannedActual).toEqual([{ month: "Aug", planned: 26, actual: 17 }]);
  });

  it("leaves future months out of planned-against-actual, where a plan would read as a shortfall", () => {
    const series = buildReportSeries(payload([job({ startDate: "2026-11-02", endDate: "2026-11-03" })]), "2026-09-23");
    expect(series.plannedActual).toEqual([]);
  });

  it("puts work still owed in the month the plan puts it", () => {
    const series = buildReportSeries(payload([job({ startDate: "2026-10-01", endDate: "2026-10-02" })]), "2026-09-23");
    expect(series.backlog).toEqual([{ month: "Oct", backlog: 2 * 8.5 }]);
  });

  it("drops an overdue job's unbuilt share into this month, since the plan has no days left for it", () => {
    // Two planned days at 8.5h = 17h, 40% still to do, all of it owed now rather than never.
    const series = buildReportSeries(payload([job({ startDate: "2026-09-01", endDate: "2026-09-02", percentComplete: 60 })]), "2026-09-23");
    expect(series.backlog).toEqual([{ month: "Sep", backlog: Math.round(17 * 0.4) }]);
  });

  it("owes nothing for a finished job", () => {
    const series = buildReportSeries(
      payload([job({ startDate: "2026-10-01", endDate: "2026-10-02", actualFinish: "2026-09-20" })]),
      "2026-09-23"
    );
    expect(series.backlog).toEqual([]);
  });

  it("ranks crews by their own utilization, worst last", () => {
    const series = buildReportSeries(
      payload(
        [],
        [
          { name: "Paving", utilization: 61 },
          { name: "Concrete", utilization: 93 }
        ]
      ),
      "2026-09-23"
    );
    expect(series.crews).toEqual([
      { name: "Concrete", value: 93 },
      { name: "Paving", value: 61 }
    ]);
  });

  it("carries no trace of the numbers it replaced", () => {
    const series = buildReportSeries(
      payload([job({ startDate: "2026-09-01", endDate: "2026-09-30" })], [{ name: "Concrete Crew 1", utilization: 50 }]),
      "2026-09-23"
    );
    const invented = [4200, 3850, 4450, 5650, 5100, 5200, 6100, 3600, 94, 88, 81, 76];
    const figures = [
      ...series.plannedActual.flatMap((p) => [p.planned, p.actual]),
      ...series.backlog.map((b) => b.backlog),
      ...series.crews.map((c) => c.value)
    ];
    expect(figures.filter((n) => invented.includes(n))).toEqual([]);
  });
});

describe("the period select", () => {
  /* One job per month across 2025 and 2026 so every window has something to include or leave out.
     Each is two planned days, and each has been reported started and finished, so both series of
     the planned-against-actual chart have a value in every month. */
  const monthly = (months: string[]) =>
    payload(
      months.map((month) =>
        job({
          id: month,
          startDate: `${month}-05`,
          endDate: `${month}-06`,
          actualStart: `${month}-05`,
          actualFinish: `${month}-06`
        })
      )
    );
  const TODAY = "2026-09-23";
  const ALL = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const monthsOf = (period: ReportPeriod) => buildReportSeries(monthly(ALL), TODAY, period).plannedActual.map((p) => p.month);

  it("shows six months by default", () => {
    expect(monthsOf("last-6-months")).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
  });

  it("narrows to three for a quarter", () => {
    expect(monthsOf("last-quarter")).toEqual(["Jul", "Aug", "Sep"]);
  });

  it("starts year to date at January, not six months back", () => {
    // The November and December before it are dropped: they are not in this year.
    expect(monthsOf("year-to-date")).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
  });

  it("gives each choice a window it can state, so a heading never has to guess", () => {
    expect(buildReportSeries(monthly(ALL), TODAY, "last-quarter").window).toEqual({
      past: "last 3 months",
      future: "next 3 months"
    });
    expect(buildReportSeries(monthly(ALL), TODAY, "year-to-date").window).toEqual({
      past: "year to date",
      future: "rest of this year"
    });
  });

  it("looks FORWARD for backlog, and stops at year end for year-to-date", () => {
    /* Unfinished work in each of the next five months. A quarter takes three; year-to-date takes
       the rest of this calendar year, so 2027 is excluded where "next 6 months" would have it. */
    const ahead = payload(
      ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"].map((month) =>
        job({ id: month, startDate: `${month}-05`, endDate: `${month}-06` })
      )
    );
    expect(buildReportSeries(ahead, TODAY, "last-quarter").backlog.map((b) => b.month)).toEqual(["Oct", "Nov", "Dec"]);
    expect(buildReportSeries(ahead, TODAY, "last-6-months").backlog.map((b) => b.month)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb"]);
    expect(buildReportSeries(ahead, TODAY, "year-to-date").backlog.map((b) => b.month)).toEqual(["Oct", "Nov", "Dec"]);
  });

  it("leaves crew utilization alone, because it is a snapshot and not a period", () => {
    const crews = [{ name: "Concrete", utilization: 80 }];
    const a = buildReportSeries(payload([], crews), TODAY, "last-quarter").crews;
    const b = buildReportSeries(payload([], crews), TODAY, "year-to-date").crews;
    expect(a).toEqual(b);
  });
});
