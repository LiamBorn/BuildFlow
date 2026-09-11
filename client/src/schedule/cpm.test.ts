import { describe, expect, it } from "vitest";
import type { Job, JobDependency } from "@buildflow/shared";
import { buildScheduleCpm } from "./cpm";

const job = (id: string, startDate: string, endDate: string, extra: Partial<Job> = {}): Job =>
  ({ id, name: id, startDate, endDate, projectId: "p-1", status: "Planned", ...extra }) as Job;
const link = (predecessorId: string, successorId: string): JobDependency =>
  ({ id: `${predecessorId}-${successorId}`, predecessorId, successorId, type: "FS", lagDays: 0 }) as JobDependency;

describe("the schedule as a CPM network", () => {
  it("is nothing without jobs", () => {
    expect(buildScheduleCpm([], [])).toBeNull();
  });

  it("finds the critical path and the finish on a working-day axis", () => {
    const cpm = buildScheduleCpm(
      [job("a", "2026-09-07", "2026-09-08"), job("b", "2026-09-09", "2026-09-10"), job("c", "2026-09-07", "2026-09-07")],
      [link("a", "b")]
    );
    expect(cpm).not.toBeNull();
    expect(cpm?.result.cycle).toBeNull();
    expect(cpm?.result.criticalPath).toEqual(["a", "b"]);
    expect(cpm?.result.tasks.c.critical).toBe(false);
    expect(cpm?.finishDate).toBe("2026-09-10");
    expect(cpm?.slipDays).toBeNull();
  });

  it("keeps an unlinked job where it is planned, so the finish is the plan's finish", () => {
    const cpm = buildScheduleCpm([job("a", "2026-09-07", "2026-09-08"), job("d", "2026-09-10", "2026-09-11")], []);
    expect(cpm?.finishDate).toBe("2026-09-11");
    expect(cpm?.result.criticalPath).toEqual(["d"]);
    expect(cpm?.result.tasks.a.totalFloat).toBe(3); // Sep 9 and Sep 10 are working days: a can start as late as Sep 10
  });

  it("measures slip against the baseline in working days", () => {
    const cpm = buildScheduleCpm([job("a", "2026-09-07", "2026-09-11", { baselineStart: "2026-09-07", baselineEnd: "2026-09-09" })], []);
    expect(cpm?.baselineFinish).toBe("2026-09-09");
    expect(cpm?.slipDays).toBe(2);
  });

  it("does not let an old job in the workspace drag the finish back", () => {
    // The axis is anchored at the earliest job in the workspace. While it stopped 1,200 days
    // past that anchor, one 2020 job put every 2026 date past the end, where they all clamped
    // to the same index — and the card read a finish date three years before the work.
    // A fixed working week, because the default calendar carries the *current* year's
    // holidays — Juneteenth would quietly change this month's arithmetic next January.
    const sixDayWeek = { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };
    const alone = buildScheduleCpm([job("real", "2026-06-01", "2026-06-30")], [], sixDayWeek);
    const withAnOldJob = buildScheduleCpm(
      [job("old", "2020-01-02", "2020-01-06"), job("real", "2026-06-01", "2026-06-30")],
      [],
      sixDayWeek
    );
    expect(alone?.finishDate).toBe("2026-06-30");
    expect(withAnOldJob?.finishDate).toBe("2026-06-30");
    // June 2026 is 30 days less four Sundays. Under the old axis this collapsed to one day.
    const span = (cpm: typeof alone) => (cpm ? cpm.result.tasks.real.earlyFinish - cpm.result.tasks.real.earlyStart : null);
    expect(span(alone)).toBe(26);
    expect(span(withAnOldJob)).toBe(26);
  });

  it("keeps a job with a finish-no-later-than date where it is planned", () => {
    // FNLT is a backward-pass constraint. Handing it to the solver as the job's only
    // constraint left the forward pass with no floor, so the job slid to the start of the
    // plan and reported itself as the entire critical path.
    const cpm = buildScheduleCpm(
      [
        job("anchor", "2026-01-05", "2026-01-06"),
        job("dec", "2026-12-01", "2026-12-05", { constraintType: "FNLT", constraintDate: "2026-12-05" })
      ],
      []
    );
    expect(cpm?.finishDate).toBe("2026-12-05");
    expect(cpm?.calendar.fromIndex(cpm.result.tasks.dec.earlyStart)).toBe("2026-12-01");
  });

  it("reports negative float when the deadline cannot be met", () => {
    const cpm = buildScheduleCpm([job("a", "2026-07-13", "2026-07-24", { constraintType: "FNLT", constraintDate: "2026-07-17" })], []);
    expect(cpm?.finishDate).toBe("2026-07-24"); // the plan, not the deadline
    expect(cpm?.result.tasks.a.totalFloat).toBe(-7);
    expect(cpm?.result.tasks.a.critical).toBe(true);
  });

  it("still lets a must-start-on date move a job, and takes the later of a start-no-earlier-than", () => {
    const mustStart = buildScheduleCpm([job("c", "2026-07-13", "2026-07-15", { constraintType: "MSO", constraintDate: "2026-08-03" })], []);
    expect(mustStart?.calendar.fromIndex(mustStart.result.tasks.c.earlyStart)).toBe("2026-08-03");

    const later = buildScheduleCpm([job("d", "2026-07-13", "2026-07-15", { constraintType: "SNET", constraintDate: "2026-08-03" })], []);
    expect(later?.calendar.fromIndex(later.result.tasks.d.earlyStart)).toBe("2026-08-03");

    const earlier = buildScheduleCpm([job("e", "2026-07-13", "2026-07-15", { constraintType: "SNET", constraintDate: "2026-06-01" })], []);
    expect(earlier?.calendar.fromIndex(earlier.result.tasks.e.earlyStart)).toBe("2026-07-13");
  });

  it("reports a cycle instead of scheduling one", () => {
    const cpm = buildScheduleCpm(
      [job("a", "2026-09-07", "2026-09-08"), job("b", "2026-09-09", "2026-09-10")],
      [link("a", "b"), link("b", "a")]
    );
    expect(cpm?.result.cycle).toEqual(expect.arrayContaining(["a", "b"]));
  });
});
