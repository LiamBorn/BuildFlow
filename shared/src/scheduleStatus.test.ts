/**
 * The "N days ahead" headline.
 *
 * projectScheduleStatus and portfolioScheduleStatus are what GET /api/schedule/status
 * answers with, and what the Dashboard's status band reads out. Two server tests call that
 * route, but only to check it returns 200 — nothing anywhere asserted the arithmetic behind
 * the number a superintendent acts on. This does.
 *
 * The values below were read off the functions rather than worked out by hand.
 */
import { describe, expect, it } from "vitest";
import { portfolioScheduleStatus, projectScheduleStatus, scheduleCalendar, type ProjectScheduleStatus } from "./progress";

const calendar = scheduleCalendar("2026-06-01");
const job = (id: string, startDate: string, endDate: string, percentComplete?: number) => ({
  id,
  startDate,
  endDate,
  percentComplete
});

describe("one project's position", () => {
  it("has nothing to say about a project with no jobs", () => {
    expect(projectScheduleStatus("p1", [], "2026-06-03", calendar)).toBeNull();
  });

  /**
   * The sign is the thing to get right, and it is the opposite of the arithmetic: daysAhead
   * is planned MINUS forecast, so a forecast landing LATER than plan is negative. Behind is
   * negative, ahead is positive, which is how it reads on the band.
   */
  it("reads behind as negative and ahead as positive", () => {
    // Half done on day 3 of a five-day job: the observed rate lands it a day late.
    const behind = projectScheduleStatus("p1", [job("a", "2026-06-01", "2026-06-05", 50)], "2026-06-03", calendar)!;
    expect(behind.plannedFinish).toBe("2026-06-05");
    expect(behind.forecastFinish).toBe("2026-06-06");
    expect(behind.daysAhead, "one day late is minus one").toBe(-1);

    // The field says it is finished, three days before the plan said it would be.
    const ahead = projectScheduleStatus("p2", [job("a", "2026-06-01", "2026-06-05", 100)], "2026-06-02", calendar)!;
    expect(ahead.daysAhead, "time won back is positive").toBeGreaterThan(0);
    expect(ahead.forecastFinish).toBe("2026-06-02");
  });

  it("takes the LATEST finish across the jobs, because a project ends when its last job does", () => {
    const status = projectScheduleStatus(
      "p1",
      [job("short", "2026-06-01", "2026-06-02", 100), job("long", "2026-06-01", "2026-06-10", 100)],
      "2026-06-01",
      calendar
    )!;
    expect(status.plannedFinish, "not the first job's finish").toBe("2026-06-10");
    expect(status.totalJobs).toBe(2);
  });

  /**
   * "Nobody has reported" and "someone reported nothing" are different facts, and
   * reportingJobs is the only thing that tells them apart — it is the evidence behind the
   * forecast, so a headline built on one report can be read as such.
   */
  it("counts a reported zero as a report, and an absent percent as silence", () => {
    const silent = projectScheduleStatus("p1", [job("a", "2026-06-01", "2026-06-05")], "2026-06-03", calendar)!;
    const zero = projectScheduleStatus("p2", [job("a", "2026-06-01", "2026-06-05", 0)], "2026-06-03", calendar)!;

    expect(silent.reportingJobs).toBe(0);
    expect(zero.reportingJobs).toBe(1);
    // Neither invents a slip: no reported progress is not evidence of lateness.
    expect(silent.daysAhead).toBe(0);
    expect(zero.daysAhead).toBe(0);
    expect(silent.forecastFinish).toBe(silent.plannedFinish);
  });

  it("prefers the project record's own percent, clamped, over anything derived", () => {
    const jobs = [job("a", "2026-06-01", "2026-06-05", 10)];
    expect(projectScheduleStatus("p1", jobs, "2026-06-03", calendar, 72)!.percentComplete).toBe(72);
    expect(projectScheduleStatus("p1", jobs, "2026-06-03", calendar, 140)!.percentComplete, "clamped high").toBe(100);
    expect(projectScheduleStatus("p1", jobs, "2026-06-03", calendar, -20)!.percentComplete, "clamped low").toBe(0);
    expect(projectScheduleStatus("p1", jobs, "2026-06-03", calendar, 72.4)!.percentComplete, "rounded").toBe(72);
    // Not a number at all: fall through to the jobs rather than render NaN.
    expect(projectScheduleStatus("p1", jobs, "2026-06-03", calendar, Number.NaN)!.percentComplete).toBe(10);
  });

  /**
   * The weighting exists so a two-day punch item cannot drag the headline as hard as a
   * six-week pour. Unweighted, these two would average to 50.
   */
  it("weights job progress by planned duration when the record has no percent", () => {
    const status = projectScheduleStatus(
      "p1",
      [job("punch", "2026-06-01", "2026-06-02", 100), job("pour", "2026-06-01", "2026-06-30", 0)],
      "2026-06-01",
      calendar
    )!;
    expect(status.percentComplete, "the short finished item should not read as half the project").toBeLessThan(20);
  });
});

describe("the portfolio headline", () => {
  const at = (daysAhead: number, percentComplete = 0, totalJobs = 1, reportingJobs = 0): ProjectScheduleStatus => ({
    projectId: `p-${daysAhead}-${percentComplete}`,
    plannedFinish: "2026-06-05",
    forecastFinish: "2026-06-05",
    daysAhead,
    percentComplete,
    reportingJobs,
    totalJobs
  });

  it("is all zeros with nothing to summarise, rather than NaN", () => {
    expect(portfolioScheduleStatus([])).toEqual({
      daysAhead: 0,
      percentComplete: 0,
      projects: 0,
      behindProjects: 0,
      reportingJobs: 0,
      totalJobs: 0
    });
  });

  it("averages the days rather than summing them", () => {
    // Summed this would be +6, which would read as a portfolio six days ahead on the
    // strength of one project.
    expect(portfolioScheduleStatus([at(8), at(-2)]).daysAhead).toBe(3);
    expect(portfolioScheduleStatus([at(4), at(4), at(4)]).daysAhead).toBe(4);
  });

  it("gives every project one vote on percent, however many jobs it has", () => {
    // Deliberately NOT weighted by job count: a PM reads a portfolio project by project.
    const lopsided = portfolioScheduleStatus([at(0, 100, 20), at(0, 0, 1)]);
    expect(lopsided.percentComplete, "50, not 95").toBe(50);
    expect(lopsided.totalJobs, "the job totals still add up").toBe(21);
  });

  it("counts only projects that are actually behind", () => {
    const mixed = portfolioScheduleStatus([at(0), at(-1), at(2), at(-6)]);
    expect(mixed.behindProjects, "exactly on plan is not behind").toBe(2);
    expect(mixed.projects).toBe(4);
  });

  /**
   * A curiosity worth pinning rather than discovering later: averaging +1 and -2 gives -0.5,
   * and Math.round(-0.5) is NEGATIVE ZERO in JavaScript. It prints as "0" and compares as 0,
   * so nothing downstream misbehaves — but `expect(x).toBe(0)` fails on it, which is how it
   * would otherwise be found. It also means a portfolio marginally behind reads as level.
   */
  it("can produce negative zero when the average lands on a half day", () => {
    const marginal = portfolioScheduleStatus([at(1), at(-2)]).daysAhead;
    expect(Object.is(marginal, -0), "it really is -0, not 0").toBe(true);
    expect(marginal < 0, "so it does not count as behind").toBe(false);
    expect(`${marginal}`, "and it reads as level on the band").toBe("0");
  });
});
