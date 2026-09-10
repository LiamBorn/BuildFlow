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

  it("reports a cycle instead of scheduling one", () => {
    const cpm = buildScheduleCpm(
      [job("a", "2026-09-07", "2026-09-08"), job("b", "2026-09-09", "2026-09-10")],
      [link("a", "b"), link("b", "a")]
    );
    expect(cpm?.result.cycle).toEqual(expect.arrayContaining(["a", "b"]));
  });
});
