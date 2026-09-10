import { describe, expect, it } from "vitest";
import type { Job, JobDependency } from "@buildflow/shared";
import { buildProposal, detectVariance, forecastIQFinish, plannedPercentAt, scheduleCalendar } from "../src/variance.js";

/* The calendar is a six-day week (Sundays off). Dates here are chosen against a
   known week so the working-day maths is checkable by hand:
     Mon 2026-06-15, Tue 16, Wed 17, Thu 18, Fri 19, Sat 20, [Sun 21 off], Mon 22 */
const EPOCH = "2026-06-15";
const calendar = scheduleCalendar(EPOCH);

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "j-1",
    projectId: "p-1",
    name: "Level 3 Slab",
    phase: "Concrete",
    location: "Austin",
    startDate: "2026-06-15",
    endDate: "2026-06-19", // Mon–Fri = 5 working days
    startTime: "7:00 AM",
    endTime: "3:30 PM",
    requiredLabor: 8,
    requiredEquipment: "Pump",
    materialsStatus: "Delivered",
    status: "On Site",
    priority: "High",
    notes: "",
    percentComplete: 0,
    ...overrides
  };
}

describe("plannedPercentAt", () => {
  it("is 0 before the job starts and 100 at/after its finish", () => {
    expect(plannedPercentAt(job(), "2026-06-15", calendar)).toBe(0);
    expect(plannedPercentAt(job(), "2026-06-19", calendar)).toBe(100);
    expect(plannedPercentAt(job(), "2026-06-30", calendar)).toBe(100);
  });

  it("tracks the fraction of working days elapsed", () => {
    // Wed is day 3 of a 5-working-day job → 3/5.
    expect(plannedPercentAt(job(), "2026-06-17", calendar)).toBe(60);
  });

  it("skips Sundays rather than counting them as lost work", () => {
    // Mon 15 → Mon 22 is 7 working days, not 8 calendar days: Sunday isn't work.
    const week = job({ startDate: "2026-06-15", endDate: "2026-06-23" });
    // Sat 20 is working day 6 of 8 (15,16,17,18,19,20,22,23) → 75%.
    expect(plannedPercentAt(week, "2026-06-20", calendar)).toBe(75);
  });
});

describe("forecastIQFinish", () => {
  it("holds the planned finish when nothing has been reported", () => {
    expect(forecastIQFinish(job(), 0, "2026-06-17", calendar)).toBe("2026-06-19");
  });

  it("projects the observed rate forward when the crew is behind", () => {
    // 40% over 3 working days (Mon–Wed) = 13.3%/day; the 60% left needs 5 more
    // working days: Thu 18, Fri 19, Sat 20, [Sun off], Mon 22, Tue 23.
    expect(forecastIQFinish(job(), 40, "2026-06-17", calendar)).toBe("2026-06-23");
  });

  it("pulls the finish in when the crew is ahead", () => {
    // 90% over 3 days = 30%/day; 10% left → 1 more day → Thu 18, inside plan.
    expect(forecastIQFinish(job(), 90, "2026-06-17", calendar)).toBe("2026-06-18");
  });

  it("finishes a job the day the field reports it done", () => {
    expect(forecastIQFinish(job(), 100, "2026-06-17", calendar)).toBe("2026-06-17");
  });
});

describe("detectVariance", () => {
  it("stays quiet when progress matches the plan", () => {
    // 60% on Wed of a 5-day job is exactly on plan — no decision for a PM.
    expect(detectVariance([job()], [], "j-1", 60, "On Site", "2026-06-17")).toBeNull();
  });

  it("flags a slip when reported progress trails the plan", () => {
    const result = detectVariance([job()], [], "j-1", 40, "On Site", "2026-06-17");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("slip");
    expect(result!.plannedPercent).toBe(60);
    expect(result!.varianceDays).toBeGreaterThan(0);
    expect(result!.proposal.proposedEnd).toBe("2026-06-23");
  });

  it("runs on the workspace's own calendar: a holiday and a five-day week push the plan and the forecast out", () => {
    // Mon–Fri only, and Thu 18 June is a holiday: the job's window has four working days,
    // so by Wednesday three of them have passed (75%), and the 40% pace forecasts
    // Thu 25 June — the axis skips the holiday, the weekend and Sunday alike.
    const setting = { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: "2026-06-18", name: "Company holiday" }] };
    const result = detectVariance([job()], [], "j-1", 40, "On Site", "2026-06-17", setting);
    expect(result).not.toBeNull();
    expect(result!.plannedPercent).toBe(75);
    expect(result!.varianceDays).toBe(4);
    expect(result!.proposal.proposedEnd).toBe("2026-06-25");
  });

  it("flags a blocked job even when the numbers agree with the plan", () => {
    // The percent says on-plan, but the field says work has stopped — the
    // status carries information the number cannot.
    const result = detectVariance([job()], [], "j-1", 60, "DelayIQed", "2026-06-17");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("blocked");
  });

  it("reports work finishing early as ahead, not a slip", () => {
    const result = detectVariance([job()], [], "j-1", 100, "Complete", "2026-06-16");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("complete");
    expect(result!.varianceDays).toBeLessThan(0);
  });

  it("returns null for a job that isn't in the network", () => {
    expect(detectVariance([job()], [], "j-nope", 40, "On Site", "2026-06-17")).toBeNull();
  });
});

describe("buildProposal — downstream ripple", () => {
  const slab = job({ id: "j-slab", name: "Level 3 Slab", startDate: "2026-06-15", endDate: "2026-06-19" });
  const mep = job({ id: "j-mep", name: "MEP Rough-In", startDate: "2026-06-20", endDate: "2026-06-23" });
  const inspect = job({ id: "j-inspect", name: "Inspection", startDate: "2026-06-24", endDate: "2026-06-25" });
  const chain: JobDependency[] = [
    { id: "d-1", predecessorId: "j-slab", successorId: "j-mep", type: "FS", lagDays: 0 },
    { id: "d-2", predecessorId: "j-mep", successorId: "j-inspect", type: "FS", lagDays: 0 }
  ];

  it("pushes every successor down a finish-to-start chain", () => {
    const proposal = buildProposal([slab, mep, inspect], chain, "j-slab", "2026-06-23", calendar);
    expect(proposal).not.toBeNull();
    expect(proposal!.ripple.map((item) => item.jobId).sort()).toEqual(["j-inspect", "j-mep"]);
    expect(proposal!.ripple.every((item) => item.shiftDays > 0)).toBe(true);
    expect(proposal!.projectSlipDays).toBeGreaterThan(0);
  });

  it("leaves successors alone when float absorbs the slip", () => {
    // A week of slack between the slab and the MEP start: a two-day overrun is
    // real, but nothing downstream needs to move and the PM shouldn't be told
    // four crews are affected when they aren't.
    const slackMep = job({ id: "j-mep", name: "MEP Rough-In", startDate: "2026-06-29", endDate: "2026-07-02" });
    const proposal = buildProposal([slab, slackMep], [chain[0]], "j-slab", "2026-06-23", calendar);
    expect(proposal).not.toBeNull();
    expect(proposal!.ripple).toEqual([]);
    expect(proposal!.projectSlipDays).toBe(0);
  });

  it("never reports the reporting job as part of its own ripple", () => {
    const proposal = buildProposal([slab, mep, inspect], chain, "j-slab", "2026-06-23", calendar);
    expect(proposal!.ripple.some((item) => item.jobId === "j-slab")).toBe(false);
  });

  it("declines to price a network with a dependency cycle", () => {
    const cyclic: JobDependency[] = [...chain, { id: "d-3", predecessorId: "j-inspect", successorId: "j-slab", type: "FS", lagDays: 0 }];
    expect(buildProposal([slab, mep, inspect], cyclic, "j-slab", "2026-06-23", calendar)).toBeNull();
  });

  it("grades by consequence, not by the size of the drift alone", () => {
    const slackMep = job({ id: "j-mep", name: "MEP Rough-In", startDate: "2026-07-20", endDate: "2026-07-23" });

    // Moves the handover date → the PM has to act.
    const critical = detectVariance([slab, mep, inspect], chain, "j-slab", 40, "On Site", "2026-06-17");
    expect(critical!.severity).toBe("High");

    // Same 3-day drift, but float absorbs it. Still Medium rather than Low:
    // float is a buffer being spent, and letting the network hide a crew
    // falling three days behind is exactly the silence this feature exists to
    // break.
    const absorbed = detectVariance([slab, slackMep], [chain[0]], "j-slab", 40, "On Site", "2026-06-17");
    expect(absorbed!.proposal.projectSlipDays).toBe(0);
    expect(absorbed!.severity).toBe("Medium");

    // A single day behind, absorbed by float, is genuinely just noise-adjacent.
    const minor = detectVariance([slab, slackMep], [chain[0]], "j-slab", 50, "On Site", "2026-06-17");
    expect(minor!.severity).toBe("Low");
  });
});
