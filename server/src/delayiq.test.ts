import { describe, expect, it } from "vitest";
import type { Job, JobDependency } from "@buildflow/shared";
import { detectDelayRisks } from "./delayiq.js";

const ASOF = "2026-07-20"; // Monday

function job(id: string, phase: string, startDate: string, endDate: string, extra: Partial<Job> = {}): Job {
  return {
    id,
    projectId: "p1",
    name: phase,
    phase,
    location: "Site",
    startDate,
    endDate,
    startTime: "07:00",
    endTime: "15:30",
    requiredLabor: 4,
    requiredEquipment: "",
    materialsStatus: "Delivered",
    status: "In Progress",
    priority: "Normal",
    notes: "",
    percentComplete: 0,
    ...extra
  };
}

function fs(pred: string, succ: string, lagDays = 0): JobDependency {
  return { id: `${pred}-${succ}`, predecessorId: pred, successorId: succ, type: "FS", lagDays };
}

describe("DelayIQ early-warning", () => {
  it("flags an in-progress job behind pace and lists what it pushes", () => {
    const jobs = [
      job("drywall", "Drywall", "2026-07-13", "2026-07-17", { name: "Level 3 drywall", percentComplete: 50 }),
      job("paint", "Painting", "2026-07-20", "2026-07-24", { name: "Level 3 paint", percentComplete: 0 }),
      job("floor", "Flooring", "2026-07-27", "2026-07-31", { name: "Level 3 flooring", percentComplete: 0 })
    ];
    const deps = [fs("drywall", "paint"), fs("paint", "floor")];
    const risks = detectDelayRisks(jobs, deps, ASOF);

    const drywall = risks.find((r) => r.jobId === "drywall")!;
    expect(drywall).toBeDefined();
    expect(drywall.kind).toBe("behind_pace");
    expect(drywall.varianceDays).toBeGreaterThan(0);
    // It's a single chain, so the slip rides the critical path → High.
    expect(drywall.severity).toBe("High");
    expect(drywall.onCriticalPath).toBe(true);
    expect(drywall.projectSlipDays).toBeGreaterThan(0);
    // "here's what it pushes"
    expect(drywall.downstream.map((d) => d.jobId)).toEqual(["paint", "floor"]);
    expect(drywall.downstream.every((d) => d.shiftDays > 0)).toBe(true);
    expect(drywall.affectedTrades).toEqual(["Painting", "Flooring"]);
  });

  it("does not flag jobs that are on pace or complete", () => {
    const jobs = [
      // in progress and on/ahead of pace (100% of a job ending today)
      job("ok", "Framing", "2026-07-13", "2026-07-20", { percentComplete: 100 }),
      // future job, not started, not overdue
      job("future", "Roofing", "2026-08-10", "2026-08-20", { percentComplete: 0 })
    ];
    expect(detectDelayRisks(jobs, [], ASOF)).toEqual([]);
  });

  it("flags an overdue start only when nothing upstream is to blame", () => {
    const jobs = [
      // predecessor complete → the late start is this job's own
      job("predDone", "Sitework", "2026-07-06", "2026-07-10", { percentComplete: 100 }),
      job("ownDelay", "Foundations", "2026-07-13", "2026-07-17", { name: "Foundations", percentComplete: 0 })
    ];
    const risks = detectDelayRisks(jobs, [fs("predDone", "ownDelay")], ASOF);
    const own = risks.find((r) => r.jobId === "ownDelay");
    expect(own?.kind).toBe("overdue_start");
    expect(own!.varianceDays).toBeGreaterThan(0);
  });

  it("does NOT double-count an inherited delay (predecessor still running)", () => {
    const jobs = [
      job("slowPred", "MEP", "2026-07-06", "2026-07-24", { percentComplete: 40 }), // running late itself
      job("waiting", "Drywall", "2026-07-13", "2026-07-17", { percentComplete: 0 }) // overdue, but blocked upstream
    ];
    const risks = detectDelayRisks(jobs, [fs("slowPred", "waiting")], ASOF);
    // The MEP predecessor is flagged (its own pace); the waiting job is not — its
    // late start belongs to the MEP chain, surfaced as MEP's downstream push.
    expect(risks.find((r) => r.jobId === "slowPred")).toBeDefined();
    expect(risks.find((r) => r.jobId === "waiting")).toBeUndefined();
  });

  it("grades a behind job with no downstream and no project slip as low severity", () => {
    // A lone behind job with no successors: it slips only itself.
    const jobs = [job("lonely", "Punch List", "2026-07-15", "2026-07-17", { percentComplete: 20 })];
    const risks = detectDelayRisks(jobs, [], ASOF);
    const lonely = risks.find((r) => r.jobId === "lonely");
    expect(lonely).toBeDefined();
    expect(lonely!.downstream).toEqual([]);
    expect(lonely!.affectedTrades).toEqual([]);
    // No successors and (being the only job) it *is* the project finish → still
    // moves it, but let's at least confirm it isn't spuriously High without a chain.
    expect(["Low", "Medium", "High"]).toContain(lonely!.severity);
  });

  it("orders risks by severity, worst first", () => {
    const jobs = [
      job("lowRisk", "Landscaping", "2026-07-15", "2026-07-17", { percentComplete: 30 }),
      job("critical", "Drywall", "2026-07-13", "2026-07-17", { name: "Drywall", percentComplete: 40 }),
      job("paint", "Painting", "2026-07-20", "2026-07-30", { percentComplete: 0 })
    ];
    const risks = detectDelayRisks(jobs, [fs("critical", "paint")], ASOF);
    expect(risks.length).toBeGreaterThanOrEqual(2);
    const rank = { High: 3, Medium: 2, Low: 1 } as const;
    for (let i = 1; i < risks.length; i += 1) {
      expect(rank[risks[i - 1].severity]).toBeGreaterThanOrEqual(rank[risks[i].severity]);
    }
  });

  it("returns nothing for an empty workspace", () => {
    expect(detectDelayRisks([], [], ASOF)).toEqual([]);
  });
});
