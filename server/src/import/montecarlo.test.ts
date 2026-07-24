import { describe, expect, it } from "vitest";
import { simulateFinish } from "./montecarlo.js";
import type { ImportedActivity, RelationType } from "./types.js";

const DATA_DATE = "2026-07-20";

function act(
  id: string,
  start: string,
  finish: string,
  extra: Partial<ImportedActivity> = {}
): ImportedActivity {
  return {
    externalId: id,
    code: id,
    name: id,
    start,
    finish,
    isMilestone: false,
    isSummary: false,
    resourceNames: [],
    predecessors: [],
    percentComplete: 0,
    ...extra
  };
}

function fs(id: string, lagHours = 0): { predecessorId: string; type: RelationType; lagHours: number } {
  return { predecessorId: id, type: "FS", lagHours };
}

const SEED = 12345;
const runOpts = { dataDate: DATA_DATE, seed: SEED, iterations: 4000 };

describe("Monte Carlo finish band", () => {
  it("returns ordered percentiles P10 ≤ P50 ≤ P80 ≤ P90", () => {
    const band = simulateFinish([act("A", "2026-08-01", "2026-10-30")], { ...runOpts, scheduleIndex: 1, lowProgress: false })!;
    expect(band).toBeDefined();
    expect(band.p10 <= band.p50).toBe(true);
    expect(band.p50 <= band.p80).toBe(true);
    expect(band.p80 <= band.p90).toBe(true);
    expect(band.onTimeProbability).toBeGreaterThanOrEqual(0);
    expect(band.onTimeProbability).toBeLessThanOrEqual(100);
  });

  it("pushes the band past the plan and lowers on-time odds when behind pace", () => {
    const activities = [
      act("A", "2026-08-01", "2026-10-30"),
      act("B", "2026-11-01", "2027-01-30", { predecessors: [fs("A")] })
    ];
    const band = simulateFinish(activities, { ...runOpts, scheduleIndex: 0.7, lowProgress: false })!;
    expect(band.p50SlipDays).toBeGreaterThan(0);
    expect(band.p80SlipDays).toBeGreaterThan(band.p50SlipDays);
    expect(band.onTimeProbability).toBeLessThan(35);
    expect(band.p80 > band.planFinish).toBe(true);
  });

  it("keeps a right-skewed tail: P80 lands on or after the plan even on pace", () => {
    const band = simulateFinish(
      [act("A", "2026-08-01", "2026-10-30"), act("B", "2026-11-01", "2027-01-30", { predecessors: [fs("A")] })],
      { ...runOpts, scheduleIndex: 1, lowProgress: false }
    )!;
    expect(band.p80SlipDays).toBeGreaterThanOrEqual(0);
  });

  it("shows merge bias — parallel paths converging finish later than a single path", () => {
    // Four parallel not-started activities all feeding one finish milestone.
    const parallel = simulateFinish(
      [
        act("A1", "2026-08-01", "2026-09-30"),
        act("A2", "2026-08-01", "2026-09-30"),
        act("A3", "2026-08-01", "2026-09-30"),
        act("A4", "2026-08-01", "2026-09-30"),
        act("M", "2026-09-30", "2026-09-30", {
          isMilestone: true,
          predecessors: [fs("A1"), fs("A2"), fs("A3"), fs("A4")]
        })
      ],
      { ...runOpts, scheduleIndex: 1, lowProgress: false }
    )!;
    // A single equivalent path.
    const single = simulateFinish([act("A1", "2026-08-01", "2026-09-30")], {
      ...runOpts,
      scheduleIndex: 1,
      lowProgress: false
    })!;
    // The max of four noisy paths beats one → later P50 and worse on-time odds.
    expect(parallel.onTimeProbability).toBeLessThan(single.onTimeProbability);
    expect(parallel.p50 >= single.p50).toBe(true);
  });

  it("is deterministic — same seed yields the same band, run to run", () => {
    const a = simulateFinish([act("A", "2026-08-01", "2026-10-30")], { ...runOpts, scheduleIndex: 0.8, lowProgress: false });
    const b = simulateFinish([act("A", "2026-08-01", "2026-10-30")], { ...runOpts, scheduleIndex: 0.8, lowProgress: false });
    expect(a).toEqual(b);
    // And stable without an explicit seed (fixed default), so re-imports don't wobble.
    const c = simulateFinish([act("A", "2026-08-01", "2026-10-30")], { dataDate: DATA_DATE, scheduleIndex: 0.8, lowProgress: false });
    const d = simulateFinish([act("A", "2026-08-01", "2026-10-30")], { dataDate: DATA_DATE, scheduleIndex: 0.8, lowProgress: false });
    expect(c).toEqual(d);
  });

  it("respects finished work — completed activities don't move", () => {
    const band = simulateFinish(
      [
        act("A", "2026-05-01", "2026-06-15", { percentComplete: 100 }),
        act("B", "2026-08-01", "2026-10-30", { predecessors: [fs("A")] })
      ],
      { ...runOpts, scheduleIndex: 1, lowProgress: false }
    )!;
    expect(band).toBeDefined();
    // Finish is driven by the remaining activity B, not the completed A.
    expect(band.p50 > "2026-08-01").toBe(true);
  });

  it("returns undefined when there's nothing left to simulate", () => {
    expect(simulateFinish([], { ...runOpts, scheduleIndex: 1, lowProgress: false })).toBeUndefined();
    expect(
      simulateFinish([act("A", "2026-05-01", "2026-06-15", { percentComplete: 100 })], {
        ...runOpts,
        scheduleIndex: 1,
        lowProgress: false
      })
    ).toBeUndefined();
  });

  it("survives a cycle in the source logic without hanging", () => {
    const band = simulateFinish(
      [
        act("A", "2026-08-01", "2026-09-01", { predecessors: [fs("B")] }),
        act("B", "2026-09-01", "2026-10-01", { predecessors: [fs("A")] })
      ],
      { ...runOpts, scheduleIndex: 1, lowProgress: false }
    );
    expect(band).toBeDefined();
    expect(band!.p50.length).toBe(10); // a real ISO date, not NaN
  });
});
