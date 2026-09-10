import { describe, expect, it } from "vitest";
import type { Activity, Calendar, Crew, Relationship, RelationshipType } from "../../types";
import { countWorkingDays } from "../calendar";
import { ceilWorkingDays, resolveDuration, runSchedule, type ScheduleInput, type ScheduleResult } from "../schedule";

/* Hand-verified calendar facts (2026 unless noted):
     Mon Sep 7 · Tue 8 · Wed 9 · Thu 10 · Fri 11 · Sat 12 · Sun 13 · Mon 14 · Tue 15
     Wed 16 · Thu 17 · Fri 18 · Mon 21 · Tue 22 · Fri Sep 4 · Tue Sep 1
     Tue Nov 10 · Fri Nov 13 · Thu Apr 1 2027 · Fri Apr 2 2027 · Fri Apr 9 2027 · Mon Apr 12 2027 */

const FIVE_DAY: Calendar = {
  id: "cal-5",
  projectId: "p1",
  name: "5-Day",
  workdays: [false, true, true, true, true, true, false],
  hoursPerDay: 8,
  holidays: [],
  exceptions: [],
  blackoutRanges: []
};
const SEVEN_DAY: Calendar = { ...FIVE_DAY, id: "cal-7", name: "7-Day", workdays: [true, true, true, true, true, true, true] };
const PAVING: Calendar = {
  ...FIVE_DAY,
  id: "cal-paving",
  name: "Paving",
  blackoutRanges: [{ start: "2026-11-15", end: "2027-04-01", reason: "Winter paving ban" }]
};
const PROJECT = { id: "p1", dataDate: "2026-09-07", defaultCalendarId: FIVE_DAY.id };

let seq = 0;
function fixed(id: string, duration: number, extra: Partial<Activity> = {}): Activity {
  seq += 1;
  return {
    id,
    projectId: "p1",
    code: id,
    name: id,
    wbsId: null,
    durationMode: "fixed",
    fixedDuration: duration,
    calendarId: FIVE_DAY.id,
    crewId: null,
    percentComplete: 0,
    sortOrder: seq,
    ...extra
  };
}
function production(
  id: string,
  quantity: number,
  unit: string,
  productionRate: number | undefined,
  extra: Partial<Activity> = {}
): Activity {
  return { ...fixed(id, 0), durationMode: "production", fixedDuration: undefined, quantity, unit, productionRate, ...extra };
}
function link(predecessorId: string, successorId: string, type: RelationshipType = "FS", lag = 0): Relationship {
  return { id: `${predecessorId}>${successorId}:${type}${lag}`, projectId: "p1", predecessorId, successorId, type, lag };
}
function schedule(activities: Activity[], relationships: Relationship[] = [], extra: Partial<ScheduleInput> = {}): ScheduleResult {
  return runSchedule({ project: PROJECT, calendars: [FIVE_DAY, SEVEN_DAY, PAVING], activities, relationships, ...extra });
}
/** [ES, EF, LS, LF, totalFloat, isCritical] */
function row(r: ScheduleResult, id: string): [string?, string?, string?, string?, number?, boolean?] {
  const a = r.activities[id];
  return [a.earlyStart, a.earlyFinish, a.lateStart, a.lateFinish, a.totalFloat, a.isCritical];
}

describe("spec §6.5", () => {
  it("1. linear chain: 3-2-4-1 FS from Mon Sep 7, all critical with zero float", () => {
    const r = schedule([fixed("A", 3), fixed("B", 2), fixed("C", 4), fixed("D", 1)], [link("A", "B"), link("B", "C"), link("C", "D")]);
    expect(row(r, "A")).toEqual(["2026-09-07", "2026-09-09", "2026-09-07", "2026-09-09", 0, true]);
    expect(row(r, "B")).toEqual(["2026-09-10", "2026-09-11", "2026-09-10", "2026-09-11", 0, true]);
    expect(row(r, "C")).toEqual(["2026-09-14", "2026-09-17", "2026-09-14", "2026-09-17", 0, true]);
    expect(row(r, "D")).toEqual(["2026-09-18", "2026-09-18", "2026-09-18", "2026-09-18", 0, true]);
    expect(r.criticalPath).toEqual(["A", "B", "C", "D"]);
    expect(r.order).toEqual(["A", "B", "C", "D"]);
    expect(r.projectStart).toBe("2026-09-07");
    expect(r.projectFinish).toBe("2026-09-18");
    expect(r.cycles).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.activities.B.drivingPredecessorId).toBe("A");
    expect(r.activities.A.startReason).toBe("data-date");
    for (const id of ["A", "B", "C", "D"]) expect(r.activities[id].freeFloat).toBe(0);
  });

  it("2. parallel paths: the 6-day branch carries exactly 4 days of float, the 10-day branch is critical", () => {
    const r = schedule(
      [fixed("S", 1), fixed("A1", 4), fixed("A2", 6), fixed("B1", 3), fixed("B2", 3), fixed("F", 1)],
      [link("S", "A1"), link("A1", "A2"), link("A2", "F"), link("S", "B1"), link("B1", "B2"), link("B2", "F")]
    );
    expect(row(r, "S")).toEqual(["2026-09-07", "2026-09-07", "2026-09-07", "2026-09-07", 0, true]);
    expect(row(r, "A1")).toEqual(["2026-09-08", "2026-09-11", "2026-09-08", "2026-09-11", 0, true]);
    expect(row(r, "A2")).toEqual(["2026-09-14", "2026-09-21", "2026-09-14", "2026-09-21", 0, true]);
    expect(row(r, "F")).toEqual(["2026-09-22", "2026-09-22", "2026-09-22", "2026-09-22", 0, true]);
    expect(row(r, "B1")).toEqual(["2026-09-08", "2026-09-10", "2026-09-14", "2026-09-16", 4, false]);
    expect(row(r, "B2")).toEqual(["2026-09-11", "2026-09-15", "2026-09-17", "2026-09-21", 4, false]);
    expect(r.activities.B1.freeFloat).toBe(0); // B2 follows immediately
    expect(r.activities.B2.freeFloat).toBe(4); // all of it is between B2 and F
    expect(r.criticalPath).toEqual(["S", "A1", "A2", "F"]);
    expect(r.activities.F.drivingPredecessorId).toBe("A2");
  });

  it("3. weekend spanning: a 5-day activity starting Thursday finishes the following Wednesday", () => {
    const r = schedule([fixed("A", 5)], [], { project: { ...PROJECT, dataDate: "2026-09-10" } });
    expect(row(r, "A")).toEqual(["2026-09-10", "2026-09-16", "2026-09-10", "2026-09-16", 0, true]);
    expect(countWorkingDays(FIVE_DAY, "2026-09-10", "2026-09-16") + 1).toBe(5); // Sat 12 and Sun 13 consumed nothing
    const viaConstraint = schedule([fixed("A", 5, { constraint: { type: "SNET", date: "2026-09-10" } })]);
    expect(row(viaConstraint, "A").slice(0, 2)).toEqual(["2026-09-10", "2026-09-16"]);
    expect(viaConstraint.activities.A.startReason).toBe("constraint");
  });

  it("4. blackout range: paving crossing Nov 15 – Apr 1 pushes its remaining days to April, it does not compress", () => {
    const r = schedule(
      [fixed("PAVE", 10, { calendarId: PAVING.id }), fixed("STRIPE", 2), fixed("CURB", 3, { calendarId: PAVING.id })],
      [link("PAVE", "STRIPE")],
      { project: { ...PROJECT, dataDate: "2026-11-10" } }
    );
    // Nov 10–13 (4 days), the ban, then Apr 2, 5, 6, 7, 8, 9.
    expect(row(r, "PAVE").slice(0, 2)).toEqual(["2026-11-10", "2027-04-09"]);
    expect(r.activities.PAVE.duration).toBe(10);
    expect(countWorkingDays(PAVING, "2026-11-10", "2027-04-09") + 1).toBe(10);
    expect(row(r, "STRIPE").slice(0, 2)).toEqual(["2027-04-12", "2027-04-13"]); // Apr 9 is a Friday
    expect(row(r, "CURB").slice(0, 2)).toEqual(["2026-11-10", "2026-11-12"]); // finishes before the ban, untouched
    expect(r.criticalPath).toEqual(["PAVE", "STRIPE"]);
  });

  it("5. negative lag: FS lag −2 starts two working days before its predecessor finishes", () => {
    const r = schedule([fixed("A", 5), fixed("B", 3)], [link("A", "B", "FS", -2)]);
    expect(row(r, "A")).toEqual(["2026-09-07", "2026-09-11", "2026-09-07", "2026-09-11", 0, true]);
    expect(row(r, "B")).toEqual(["2026-09-10", "2026-09-14", "2026-09-10", "2026-09-14", 0, true]); // Thu, Fri, Mon
    expect(r.projectFinish).toBe("2026-09-14");
  });

  it("6. SS + FF pair: the successor is overlapped and driven by whichever constraint binds", () => {
    // FF binds: B must finish a day after A, so it starts Thu and overlaps the tail of A.
    const ff = schedule([fixed("A", 5), fixed("B", 3)], [link("A", "B", "SS", 1), link("A", "B", "FF", 1)]);
    expect(row(ff, "B")).toEqual(["2026-09-10", "2026-09-14", "2026-09-10", "2026-09-14", 0, true]);
    expect(row(ff, "A")).toEqual(["2026-09-07", "2026-09-11", "2026-09-07", "2026-09-11", 0, true]);
    expect(ff.activities.A.freeFloat).toBe(0);
    // SS binds: a 6-day B may start the day after A starts; the FF (finish ≥ Sep 11) is already satisfied.
    const ss = schedule([fixed("A", 5), fixed("B", 6)], [link("A", "B", "SS", 1), link("A", "B", "FF", 0)]);
    expect(row(ss, "B")).toEqual(["2026-09-08", "2026-09-15", "2026-09-08", "2026-09-15", 0, true]);
    expect(row(ss, "A")).toEqual(["2026-09-07", "2026-09-11", "2026-09-07", "2026-09-11", 0, true]);
    expect(ss.projectFinish).toBe("2026-09-15");
  });

  it("7. production duration: 12,400 TON @ 1,800/day → 7; two crews → 4; 12,401 → still 7", () => {
    const one = schedule([production("P", 12400, "TON", 1800)]);
    expect(one.activities.P.duration).toBe(7);
    expect(one.activities.P.durationSource).toBe("production");
    expect(row(one, "P").slice(0, 2)).toEqual(["2026-09-07", "2026-09-15"]);
    const two = schedule([production("P", 12400, "TON", 1800, { crewCount: 2 })]);
    expect(two.activities.P.duration).toBe(4);
    expect(row(two, "P").slice(0, 2)).toEqual(["2026-09-07", "2026-09-10"]);
    const boundary = schedule([production("P", 12401, "TON", 1800)]);
    expect(boundary.activities.P.duration).toBe(7);
    expect(resolveDuration(production("P", 12600, "TON", 1800)).duration).toBe(7); // exact multiple stays 7
    expect(resolveDuration(production("P", 12601, "TON", 1800)).duration).toBe(8);
    expect(ceilWorkingDays(4.35 / 1.45)).toBe(3); // floating-point dust must not add a day
  });

  it("8. constraint conflict: FNLT earlier than the early finish gives negative float of the right size", () => {
    const r = schedule([fixed("A", 5, { constraint: { type: "FNLT", date: "2026-09-09" } })]);
    expect(row(r, "A")).toEqual(["2026-09-07", "2026-09-11", "2026-09-03", "2026-09-09", -2, true]);
    expect(r.activities.A.totalFloat).toBe(countWorkingDays(FIVE_DAY, "2026-09-11", "2026-09-09"));
    expect(r.activities.A.freeFloat).toBe(0);
    // The shortfall propagates upstream through the backward pass.
    const chain = schedule([fixed("P", 3), fixed("A", 5, { constraint: { type: "FNLT", date: "2026-09-15" } })], [link("P", "A")]);
    expect(row(chain, "A")).toEqual(["2026-09-10", "2026-09-16", "2026-09-09", "2026-09-15", -1, true]);
    expect(row(chain, "P")).toEqual(["2026-09-07", "2026-09-09", "2026-09-04", "2026-09-08", -1, true]);
  });

  it("9. cycle detection: a three-activity loop is returned, not thrown, and the rest still schedules", () => {
    let r: ScheduleResult | undefined;
    expect(() => {
      r = schedule([fixed("A", 2), fixed("B", 2), fixed("C", 2), fixed("D", 1)], [link("A", "B"), link("B", "C"), link("C", "A")]);
    }).not.toThrow();
    const result = r as ScheduleResult;
    expect(result.cycles).toEqual([["A", "B", "C", "A"]]);
    for (const id of ["A", "B", "C"]) {
      expect(result.activities[id].scheduled).toBe(false);
      expect(result.activities[id].problems[0]).toBe("in a logic loop: A → B → C → A");
    }
    expect(result.order).toEqual(["D"]);
    expect(row(result, "D").slice(0, 2)).toEqual(["2026-09-07", "2026-09-07"]);
    expect(result.warnings.map((w) => w.code)).toContain("cycle");
    // A self-loop is the smallest cycle; work downstream of a loop is scheduled without it.
    const selfLoop = schedule([fixed("E", 1), fixed("G", 1)], [link("E", "E"), link("E", "G")]);
    expect(selfLoop.cycles).toEqual([["E", "E"]]);
    expect(selfLoop.activities.G.scheduled).toBe(true);
    expect(selfLoop.activities.G.problems).toEqual(["predecessor E is unscheduled; its logic is ignored"]);
  });

  it("10. scale: 2,000 activities and 3,500 relationships recalculate in under 100ms", () => {
    let seed = 20260907;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const activities: Activity[] = [];
    for (let i = 0; i < 2000; i += 1) activities.push(fixed(`A${i}`, 1 + Math.floor(random() * 10)));
    const relationships: Relationship[] = [];
    for (let i = 1; i < 2000; i += 1) relationships.push(link(`A${i - 1 - Math.floor(random() * Math.min(i, 20))}`, `A${i}`));
    const types: RelationshipType[] = ["FS", "FS", "SS", "FF", "SF"];
    while (relationships.length < 3500) {
      const s = 1 + Math.floor(random() * 1999);
      const p = Math.floor(random() * s);
      relationships.push({
        ...link(`A${p}`, `A${s}`, types[Math.floor(random() * types.length)], Math.floor(random() * 3) - 1),
        id: `r${relationships.length}`
      });
    }
    const input: ScheduleInput = { project: PROJECT, calendars: [FIVE_DAY], activities, relationships };
    runSchedule(input); // warm up the JIT and the calendar index, as a live app would be
    const started = performance.now();
    const r = runSchedule(input);
    const elapsed = performance.now() - started;
    expect(elapsed, `recalculation took ${elapsed.toFixed(1)}ms`).toBeLessThan(100);
    expect(r.stats.scheduled).toBe(2000);
    expect(r.stats.relationships).toBe(3500);
    expect(r.cycles).toEqual([]);
    for (const a of Object.values(r.activities)) {
      expect(a.totalFloat).toBeGreaterThanOrEqual(0); // no constraints, so the early schedule is feasible
      expect(a.freeFloat).toBeLessThanOrEqual(a.totalFloat);
    }
    expect(r.criticalPath.length).toBeGreaterThan(0);
  });
});

describe("data date and progress", () => {
  it("nothing starts before the data date, and a weekend data date rolls to Monday", () => {
    const r = schedule([fixed("A", 2)], [], { project: { ...PROJECT, dataDate: "2026-09-12" } });
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(r.dataDate).toBe("2026-09-12");
  });

  it("a complete activity keeps its actual dates and drives successors from its actual finish", () => {
    const r = schedule(
      [fixed("A", 3, { actualStart: "2026-09-01", actualFinish: "2026-09-09", percentComplete: 100 }), fixed("B", 2)],
      [link("A", "B")]
    );
    expect(r.activities.A.status).toBe("complete");
    expect(row(r, "A")).toEqual(["2026-09-01", "2026-09-09", "2026-09-01", "2026-09-09", 0, false]);
    expect(row(r, "B").slice(0, 2)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(r.activities.B.drivingPredecessorId).toBe("A");
    expect(r.criticalPath).toEqual(["B"]);
  });

  it("an in-progress activity resumes its remaining duration at the data date", () => {
    const r = schedule([fixed("A", 10, { actualStart: "2026-09-01", percentComplete: 50 }), fixed("B", 1)], [link("A", "B")]);
    expect(r.activities.A.status).toBe("in-progress");
    expect(r.activities.A.remainingDuration).toBe(5);
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-01", "2026-09-11"]);
    expect(row(r, "B").slice(0, 2)).toEqual(["2026-09-14", "2026-09-14"]);
    expect(r.activities.A.isCritical).toBe(true);
  });

  it("a milestone has no duration: it finishes on its start day and FS successors start that same day", () => {
    const r = schedule([fixed("M", 0), fixed("B", 2)], [link("M", "B")]);
    expect(row(r, "M")).toEqual(["2026-09-07", "2026-09-07", "2026-09-07", "2026-09-07", 0, true]);
    expect(row(r, "B")).toEqual(["2026-09-07", "2026-09-08", "2026-09-07", "2026-09-08", 0, true]);
  });
});

describe("constraints", () => {
  it("SNET pushes the start and is reported as the reason; a weekend date is snapped forward", () => {
    const r = schedule([fixed("A", 2, { constraint: { type: "SNET", date: "2026-09-14" } })]);
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(r.activities.A.startReason).toBe("constraint");
    const snapped = schedule([fixed("A", 2, { constraint: { type: "SNET", date: "2026-09-12" } })]);
    expect(row(snapped, "A").slice(0, 2)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(snapped.warnings.map((w) => w.code)).toEqual(["constraint-snapped"]);
  });

  it("SNLT that logic cannot meet shows negative float on the activity and its predecessor", () => {
    const r = schedule([fixed("P", 5), fixed("A", 2, { constraint: { type: "SNLT", date: "2026-09-10" } })], [link("P", "A")]);
    expect(row(r, "A")).toEqual(["2026-09-14", "2026-09-15", "2026-09-10", "2026-09-11", -2, true]);
    expect(row(r, "P")).toEqual(["2026-09-07", "2026-09-11", "2026-09-03", "2026-09-09", -2, true]);
  });

  it("FNET holds the finish out, which back-calculates the start", () => {
    const r = schedule([fixed("A", 2, { constraint: { type: "FNET", date: "2026-09-16" } })]);
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-15", "2026-09-16"]);
  });

  it("MSO pins the start regardless of logic and the predecessor that cannot make it goes negative", () => {
    const r = schedule([fixed("P", 5), fixed("A", 2, { constraint: { type: "MSO", date: "2026-09-09" } })], [link("P", "A")]);
    expect(row(r, "A")).toEqual(["2026-09-09", "2026-09-10", "2026-09-09", "2026-09-10", 0, true]);
    expect(row(r, "P")).toEqual(["2026-09-07", "2026-09-11", "2026-09-02", "2026-09-08", -3, true]);
    expect(r.activities.A.problems).toContain("must start on 2026-09-09 but its logic needs 2026-09-14 (after P)");
    expect(r.activities.A.problems).toContain("FS from P is violated by 3 working days");
  });

  it("MFO pins the finish", () => {
    const r = schedule([fixed("A", 3, { constraint: { type: "MFO", date: "2026-09-16" } })]);
    expect(row(r, "A")).toEqual(["2026-09-14", "2026-09-16", "2026-09-14", "2026-09-16", 0, true]);
  });

  it("an imposed project finish seeds the backward pass in either direction", () => {
    const roomy = schedule([fixed("A", 3)], [], { projectFinish: "2026-09-16" });
    expect(row(roomy, "A")).toEqual(["2026-09-07", "2026-09-09", "2026-09-14", "2026-09-16", 5, false]);
    const tight = schedule([fixed("A", 3)], [], { projectFinish: "2026-09-08" });
    expect(row(tight, "A")).toEqual(["2026-09-07", "2026-09-09", "2026-09-04", "2026-09-08", -1, true]);
  });
});

describe("calendars and crews", () => {
  it("logic crosses calendars by date; lag counts in the successor's working days", () => {
    const r = schedule(
      [fixed("A", 6, { calendarId: SEVEN_DAY.id }), fixed("B", 1), fixed("C", 1)],
      [link("A", "B"), link("A", "C", "FS", 1)]
    );
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-07", "2026-09-12"]); // Mon–Sat on the 7-day calendar
    expect(row(r, "B").slice(0, 2)).toEqual(["2026-09-14", "2026-09-14"]); // next 5-day working day
    expect(row(r, "C").slice(0, 2)).toEqual(["2026-09-15", "2026-09-15"]); // one 5-day working day of lag
  });

  it("a crew's default rate applies when the units match, and is refused when they do not", () => {
    const crews: Crew[] = [
      {
        id: "crew-a",
        projectId: "p1",
        name: "Paving Crew A",
        trade: "Paving",
        size: 8,
        color: "#16375E",
        defaultProductionRate: 1800,
        defaultUnit: "TON"
      }
    ];
    const ok = schedule([production("P", 12400, "ton", undefined, { crewId: "crew-a" })], [], { crews });
    expect(ok.activities.P.duration).toBe(7);
    expect(resolveDuration(production("P", 12400, "TON", undefined, { crewId: "crew-a" }), crews[0]).rateSource).toBe("crew");
    const bad = schedule([production("P", 5000, "SY", undefined, { crewId: "crew-a" }), fixed("B", 1)], [link("P", "B")], { crews });
    expect(bad.activities.P.scheduled).toBe(false);
    expect(bad.activities.P.problems[0]).toBe("crew Paving Crew A produces TON/day but the activity is measured in SY");
    expect(bad.activities.B.scheduled).toBe(true);
    expect(bad.activities.B.problems).toEqual(["predecessor P is unscheduled; its logic is ignored"]);
    expect(bad.warnings.map((w) => w.code)).toEqual(["no-duration", "unscheduled-predecessor"]);
  });

  it("reports dangling logic and unknown calendars without giving up on the rest", () => {
    const r = schedule([fixed("A", 1, { calendarId: "nope" }), fixed("B", 1)], [link("A", "ZZZ"), link("A", "B")]);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["dangling-relationship", "missing-calendar"]);
    expect(row(r, "A").slice(0, 2)).toEqual(["2026-09-07", "2026-09-07"]); // project default calendar
    expect(row(r, "B").slice(0, 2)).toEqual(["2026-09-08", "2026-09-08"]);
    const none = runSchedule({
      project: { ...PROJECT, defaultCalendarId: "gone" },
      calendars: [],
      activities: [fixed("A", 1)],
      relationships: []
    });
    expect(none.activities.A.scheduled).toBe(false);
    expect(none.activities.A.problems).toEqual(["no calendar"]);
    expect(() =>
      runSchedule({ ...PROJECT, project: { ...PROJECT, dataDate: "soon" }, calendars: [], activities: [], relationships: [] })
    ).toThrow(TypeError);
  });
});

describe("spec §7 targets", () => {
  it("recalculates 1,000 activities and 1,700 relationships in under 50ms", () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const activities: Activity[] = [];
    for (let i = 0; i < 1000; i += 1) activities.push(fixed(`B${i}`, 1 + Math.floor(random() * 10)));
    const relationships: Relationship[] = [];
    for (let i = 1; i < 1000; i += 1) relationships.push(link(`B${i - 1 - Math.floor(random() * Math.min(i, 15))}`, `B${i}`));
    const types: RelationshipType[] = ["FS", "FS", "SS", "FF"];
    while (relationships.length < 1700) {
      const s = 1 + Math.floor(random() * 999);
      const p = Math.floor(random() * s);
      relationships.push({
        ...link(`B${p}`, `B${s}`, types[Math.floor(random() * types.length)], Math.floor(random() * 3) - 1),
        id: `q${relationships.length}`
      });
    }
    const input: ScheduleInput = { project: PROJECT, calendars: [FIVE_DAY], activities, relationships };
    runSchedule(input); // warm
    const started = performance.now();
    const r = runSchedule(input);
    const elapsed = performance.now() - started;
    expect(elapsed, `recalculation took ${elapsed.toFixed(1)}ms`).toBeLessThan(50);
    expect(r.stats.scheduled).toBe(1000);
    expect(r.cycles).toEqual([]);
  });
});
