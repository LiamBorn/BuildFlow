import { describe, expect, it } from "vitest";
import { analyzeSchedule } from "./analyze.js";
import type { ImportedActivity, ParsedSchedule } from "./types.js";

const DATA_DATE = "2026-07-20";
const NOW = Date.parse(`${DATA_DATE}T00:00:00Z`);

function activity(overrides: Partial<ImportedActivity> & { externalId: string; code: string }): ImportedActivity {
  return {
    name: overrides.code,
    isMilestone: false,
    isSummary: false,
    resourceNames: [],
    predecessors: [],
    percentComplete: 0,
    ...overrides
  };
}

function schedule(activities: ImportedActivity[], project: Partial<ParsedSchedule["projects"][0]> = {}): ParsedSchedule {
  return {
    format: "xer",
    source: "Primavera P6 (XER 19.12)",
    projects: [{ externalId: "1", name: "Test Tower", ...project }],
    wbs: [],
    activities,
    warnings: []
  };
}

describe("schedule health — forecastIQ", () => {
  it("projects a slip when progress lags elapsed time (SPI < 1)", () => {
    // 1-year schedule, ~30% of time elapsed at the data date, but only ~10% done.
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-04-01", finish: "2026-12-31", durationHours: 800, percentComplete: 12 }),
        activity({ externalId: "2", code: "A2", start: "2026-05-01", finish: "2027-03-31", durationHours: 800, percentComplete: 8 })
      ]),
      { now: NOW }
    );
    expect(health.forecastIQ.status).toBe("at_risk");
    expect(health.forecastIQ.scheduleIndex).toBeLessThan(1);
    expect(health.forecastIQ.slipDays).toBeGreaterThan(20);
    expect(health.forecastIQ.projectedFinish! > health.forecastIQ.plannedFinish!).toBe(true);
    expect(health.forecastIQ.method).toMatch(/Earned Schedule/);
  });

  it("reports on-track when progress keeps pace with time", () => {
    const health = analyzeSchedule(
      schedule([
        // ~55% of a Jan–Dec schedule elapsed by Jul 20; ~55% complete.
        activity({ externalId: "1", code: "A1", start: "2026-01-01", finish: "2026-12-31", durationHours: 1000, percentComplete: 55 })
      ]),
      { now: NOW }
    );
    expect(health.forecastIQ.status).toBe("on_track");
    expect(Math.abs(health.forecastIQ.slipDays)).toBeLessThanOrEqual(20);
  });

  it("treats a not-yet-started schedule as on plan, not failing", () => {
    const health = analyzeSchedule(
      schedule([activity({ externalId: "1", code: "A1", start: "2026-09-01", finish: "2026-12-01", percentComplete: 0 })]),
      { now: NOW }
    );
    expect(health.forecastIQ.status).toBe("not_started");
    expect(health.forecastIQ.slipDays).toBe(0);
    expect(health.grade).toBe("Healthy");
  });

  it("recognises a fully complete schedule", () => {
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-01-01", finish: "2026-03-01", percentComplete: 100 }),
        activity({ externalId: "2", code: "A2", start: "2026-03-01", finish: "2026-05-01", percentComplete: 100 })
      ]),
      { now: NOW }
    );
    expect(health.forecastIQ.status).toBe("complete");
    expect(health.forecastIQ.percentComplete).toBe(100);
  });

  it("uses the file's data date over 'now' when present", () => {
    const health = analyzeSchedule(
      schedule([activity({ externalId: "1", code: "A1", start: "2026-01-01", finish: "2026-12-31", percentComplete: 50 })], {
        dataDate: "2026-06-01"
      }),
      { now: NOW }
    );
    expect(health.dataDate).toBe("2026-06-01");
    expect(health.forecastIQ.dataDate).toBe("2026-06-01");
  });
});

describe("schedule health — findings", () => {
  it("detects a double-booked resource across overlapping activities", () => {
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-08-01", finish: "2026-08-20", resourceNames: ["Concrete Crew"] }),
        activity({ externalId: "2", code: "A2", start: "2026-08-10", finish: "2026-08-30", resourceNames: ["Concrete Crew"] }),
        // same crew, but no date overlap — must NOT be flagged
        activity({ externalId: "3", code: "A3", start: "2026-09-05", finish: "2026-09-20", resourceNames: ["Concrete Crew"] })
      ]),
      { now: NOW }
    );
    const finding = health.findings.find((f) => f.id === "resource-conflicts");
    expect(finding).toBeDefined();
    expect(finding!.count).toBe(1);
    expect(finding!.sample.sort()).toEqual(["A1", "A2"]);
    expect(finding!.severity).toBe("high");
  });

  it("flags activities behind schedule at the data date", () => {
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "LATE", start: "2026-06-01", finish: "2026-07-01", percentComplete: 40 }),
        activity({ externalId: "2", code: "DONE", start: "2026-06-01", finish: "2026-07-01", percentComplete: 100 }),
        activity({ externalId: "3", code: "FUTURE", start: "2026-08-01", finish: "2026-09-01", percentComplete: 0 })
      ]),
      { now: NOW }
    );
    const finding = health.findings.find((f) => f.id === "behind-schedule");
    expect(finding).toBeDefined();
    expect(finding!.count).toBe(1);
    expect(finding!.sample).toEqual(["LATE"]);
  });

  it("flags open-ended activities only when the schedule uses logic", () => {
    const withLogic = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-08-01", finish: "2026-08-10" }),
        activity({
          externalId: "2",
          code: "A2",
          start: "2026-08-11",
          finish: "2026-08-20",
          predecessors: [{ predecessorId: "1", type: "FS", lagHours: 0 }]
        }),
        // linked into nothing, and nothing links to it
        activity({ externalId: "3", code: "ORPHAN", start: "2026-08-25", finish: "2026-08-30" })
      ]),
      { now: NOW }
    );
    const finding = withLogic.findings.find((f) => f.id === "open-ends");
    expect(finding).toBeDefined();
    expect(finding!.sample).toEqual(["ORPHAN"]);

    // A pure bar chart (no relationships anywhere) should NOT report every row.
    const noLogic = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-08-01", finish: "2026-08-10" }),
        activity({ externalId: "2", code: "A2", start: "2026-08-11", finish: "2026-08-20" })
      ]),
      { now: NOW }
    );
    expect(noLogic.findings.find((f) => f.id === "open-ends")).toBeUndefined();
  });

  it("flags leads (negative lag)", () => {
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-08-01", finish: "2026-08-10" }),
        activity({
          externalId: "2",
          code: "A2",
          start: "2026-08-08",
          finish: "2026-08-18",
          predecessors: [{ predecessorId: "1", type: "FS", lagHours: -16 }]
        })
      ]),
      { now: NOW }
    );
    expect(health.findings.find((f) => f.id === "leads")?.sample).toEqual(["A2"]);
  });

  it("excludes summary rows from every check", () => {
    const health = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "WBS", start: "2026-01-01", finish: "2026-12-31", isSummary: true, resourceNames: ["Crew"] }),
        activity({ externalId: "2", code: "REAL", start: "2026-08-01", finish: "2026-08-10", resourceNames: ["Crew"] })
      ]),
      { now: NOW }
    );
    expect(health.stats.activities).toBe(1);
    expect(health.findings.find((f) => f.id === "resource-conflicts")).toBeUndefined();
  });

  it("orders findings by severity and scores a messy schedule below a clean one", () => {
    const messy = analyzeSchedule(
      schedule([
        activity({ externalId: "1", code: "A1", start: "2026-05-01", finish: "2026-06-01", percentComplete: 10, resourceNames: ["Crew"] }),
        activity({ externalId: "2", code: "A2", start: "2026-05-15", finish: "2026-06-15", percentComplete: 0, resourceNames: ["Crew"] })
      ]),
      { now: NOW }
    );
    const clean = analyzeSchedule(
      schedule([activity({ externalId: "1", code: "A1", start: "2026-01-01", finish: "2026-12-31", percentComplete: 55 })]),
      { now: NOW }
    );
    expect(messy.score).toBeLessThan(clean.score);
    // highest severity first
    expect(severityValue(messy.findings[0].severity)).toBeGreaterThanOrEqual(
      severityValue(messy.findings[messy.findings.length - 1].severity)
    );
  });
});

function severityValue(sev: string): number {
  return sev === "high" ? 3 : sev === "medium" ? 2 : 1;
}
