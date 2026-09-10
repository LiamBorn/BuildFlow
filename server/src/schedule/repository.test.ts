import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scheduleEngine, type Schedule } from "@buildflow/shared";
import { BuildFlowStore } from "../database.js";
import { ScheduleRepository, RepositoryError } from "./repository.js";
import { PAVING_SEED, pavingSeasonAnchor, seasonHolidays, seedPavingSchedule } from "./seed.js";

let file = "";
let store: BuildFlowStore;
let repo: ScheduleRepository;
let pavingProjectId = "";

beforeAll(async () => {
  file = path.join(os.tmpdir(), `buildflow-schedule-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  store = await BuildFlowStore.create(file, true, { seedDemo: false });
  repo = new ScheduleRepository(store);
});

afterAll(() => {
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
});

function run(data: NonNullable<ReturnType<ScheduleRepository["loadProject"]>>) {
  return scheduleEngine.runSchedule({
    project: data.project,
    activities: data.activities,
    relationships: data.relationships,
    calendars: data.calendars,
    crews: data.crews
  });
}

describe("seed: Route 9 Resurfacing", () => {
  it("creates the 40-activity paving job with three crews, two calendars and a WBS", () => {
    const seeded = seedPavingSchedule(store, { anchor: "2026-04-06", dataDate: "2026-04-06" });
    expect(seeded).toBeDefined();
    pavingProjectId = seeded!.projectId;
    const data = repo.loadProject(pavingProjectId)!;
    expect(data.project.number).toBe("26-118");
    expect(data.project.dataDate).toBe("2026-04-06");
    expect(data.activities).toHaveLength(40);
    expect(data.relationships).toHaveLength(PAVING_SEED.relationships.length);
    expect(data.crews).toHaveLength(3);
    expect(data.calendars.map((c) => c.name).sort()).toEqual(["5-Day", "6-Day Paving"]);
    expect(data.wbs).toHaveLength(7);
    expect(data.calendars.find((c) => c.id === data.project.defaultCalendarId)?.name).toBe("5-Day");
    const production = data.activities.filter((a) => a.durationMode === "production").length;
    expect(production).toBeGreaterThanOrEqual(18);
    expect(40 - production).toBeGreaterThanOrEqual(15);
    expect(data.activities.filter((a) => a.stationStart).length).toBeGreaterThanOrEqual(6);
    expect(new Set(data.relationships.map((r) => r.type))).toEqual(new Set(["FS", "SS", "FF"]));
    expect(data.crews.find((c) => c.name === "Paving Crew A")).toMatchObject({
      trade: "Paving",
      defaultProductionRate: 1800,
      defaultUnit: "TON",
      color: "#2F6B4F"
    });
    // seeding again is a no-op
    expect(seedPavingSchedule(store, { anchor: "2026-04-06" })).toBeUndefined();
    expect(repo.loadProject(pavingProjectId)!.activities).toHaveLength(40);
  });

  it("schedules cleanly through runSchedule", () => {
    const data = repo.loadProject(pavingProjectId)!;
    const result = run(data);
    const byCode = (code: string) => result.activities[data.activities.find((a) => a.code === code)!.id];
    expect(result.cycles).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.stats.scheduled).toBe(40);
    expect(result.projectStart).toBe("2026-04-06");
    expect(byCode("A1000").earlyStart).toBe("2026-04-06");
    expect(byCode("A1310")).toMatchObject({ duration: 7, durationSource: "production" }); // 12,400 TON @ crew default 1,800
    expect(byCode("A1100")).toMatchObject({ duration: 8, durationSource: "production" }); // 1,200 LF @ crew default 150
    expect(byCode("A1200").duration).toBe(4); // 33,900 SY @ 8,500
    expect(byCode("A1570").totalFloat).toBeGreaterThanOrEqual(0); // contract completion is met
    expect(result.projectFinish! < "2026-11-15").toBe(true); // done before the paving ban
    expect(result.criticalPath.length).toBeGreaterThan(10);
    expect(result.criticalPath.at(-1)).toBe(data.activities.find((a) => a.code === "A1570")!.id);
    // Cross-calendar float, hand-checked: the binder work runs on the 6-day paving calendar, so
    // the whole front of the job can slip one day and the paving crew absorbs it on a Saturday —
    // A1340 would finish Sat Jun 20 and A1350 still starts Mon Jun 22. Everything before the
    // binder density test therefore carries exactly one day of float; the critical path starts there.
    expect(byCode("A1000").totalFloat).toBe(1);
    expect(byCode("A1340").totalFloat).toBe(1);
    expect(byCode("A1340").earlyFinish).toBe("2026-06-19");
    expect(byCode("A1350")).toMatchObject({ earlyStart: "2026-06-22", totalFloat: 0, isCritical: true });
    expect(byCode("A1510").totalFloat).toBe(17); // loop detectors are far off the path
    for (const a of Object.values(result.activities)) expect(a.freeFloat).toBeLessThanOrEqual(Math.max(0, a.totalFloat));
  });

  it("caches the run's dates on the activities and serves them back", () => {
    const out = repo.runAndStore(pavingProjectId)!;
    const again = repo.loadProject(pavingProjectId)!;
    for (const a of again.activities) {
      const r = out.result.activities[a.id];
      expect(a.earlyStart).toBe(r.earlyStart);
      expect(a.lateFinish).toBe(r.lateFinish);
      expect(a.totalFloat).toBe(r.totalFloat);
      expect(a.isCritical).toBe(r.isCritical);
    }
    expect(again.activities.some((a) => a.isCritical)).toBe(true);
  });

  it("gives every crew a distinct colour when it has none", () => {
    store.createCrew({ name: "Crew Z1", specialty: "Paving", foreman: "A", laborMix: [] });
    store.createCrew({ name: "Crew Z2", specialty: "Paving", foreman: "B", laborMix: [] });
    const crews = repo.crews(pavingProjectId);
    const colours = crews.map((c) => c.color);
    expect(new Set(colours).size).toBe(colours.length);
    expect(colours.every((c) => /^#[0-9A-F]{6}$/i.test(c) && c.toUpperCase() !== "#E08A1E")).toBe(true); // never amber
  });

  it("picks an anchor inside the paving season and knows the holidays", () => {
    expect(pavingSeasonAnchor(new Date("2026-04-08T12:00:00Z"))).toBe("2026-04-13");
    expect(pavingSeasonAnchor(new Date("2026-04-06T12:00:00Z"))).toBe("2026-04-06");
    expect(pavingSeasonAnchor(new Date("2026-09-05T12:00:00Z"))).toBe("2027-04-12");
    expect(pavingSeasonAnchor(new Date("2027-01-15T12:00:00Z"))).toBe("2027-04-12");
    expect(seasonHolidays(2026)).toEqual(["2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25", "2027-01-01"]);
  });
});

describe("activities, relationships, calendars", () => {
  it("upserts source fields without touching cached dates, enforces unique codes, cascades deletes", () => {
    const data = repo.loadProject(pavingProjectId)!;
    const tack = data.activities.find((a) => a.code === "A1300")!;
    expect(tack.earlyStart).toBeDefined();
    const saved = repo.saveActivity({ ...tack, quantity: 40000, notes: "widened shoulders" });
    expect(saved.quantity).toBe(40000);
    expect(saved.earlyStart).toBe(tack.earlyStart); // cache untouched by a source edit
    expect(() => repo.saveActivity({ ...tack, id: "act-dupe", code: "A1310" })).toThrow(RepositoryError);
    expect(() => repo.saveActivity({ ...tack, id: "act-dupe", code: "A9999", calendarId: "nope" })).toThrow(/calendarId/);
    const extra: Schedule.Activity = {
      ...tack,
      id: "act-extra",
      code: "A9000",
      name: "Extra",
      earlyStart: undefined,
      earlyFinish: undefined
    };
    repo.saveActivity(extra);
    repo.saveRelationship({
      id: "rel-extra",
      projectId: pavingProjectId,
      predecessorId: tack.id,
      successorId: "act-extra",
      type: "FS",
      lag: 1
    });
    expect(repo.loadProject(pavingProjectId)!.relationships.some((r) => r.id === "rel-extra")).toBe(true);
    expect(() =>
      repo.saveRelationship({
        id: "rel-self",
        projectId: pavingProjectId,
        predecessorId: tack.id,
        successorId: tack.id,
        type: "FS",
        lag: 0
      })
    ).toThrow(/itself/);
    repo.deleteActivity("act-extra");
    const after = repo.loadProject(pavingProjectId)!;
    expect(after.activities).toHaveLength(40);
    expect(after.relationships.some((r) => r.id === "rel-extra")).toBe(false);
    expect(() => repo.deleteActivity("act-extra")).toThrow(RepositoryError);
  });

  it("protects calendars that are in use and captures baselines", () => {
    const data = repo.loadProject(pavingProjectId)!;
    expect(() => repo.deleteCalendar(data.project.defaultCalendarId)).toThrow(/default/);
    const paving = data.calendars.find((c) => c.name === "6-Day Paving")!;
    expect(() => repo.deleteCalendar(paving.id)).toThrow(/reassign/);
    const winter = repo.saveCalendar({
      ...paving,
      id: "cal-winter",
      name: "Winter",
      workdays: [false, true, true, true, true, false, false]
    });
    expect(winter.name).toBe("Winter");
    repo.deleteCalendar("cal-winter");
    expect(repo.loadProject(pavingProjectId)!.calendars).toHaveLength(2);
    const baseline = repo.captureBaseline(pavingProjectId, "Bid schedule");
    expect(Object.keys(baseline.snapshot)).toHaveLength(40);
    expect(repo.loadProject(pavingProjectId)!.baselines[0].name).toBe("Bid schedule");
  });
});

describe("legacy jobs → activities", () => {
  it("bootstraps a project's jobs into activities exactly once", () => {
    const project = store.createProject({
      name: "Legacy Lot Paving",
      location: "Peabody, MA",
      address: "1 Main St",
      type: "Paving",
      contractType: "Lump Sum",
      managerId: "u-test",
      targetCompletion: "2026-06-30",
      percentComplete: 0,
      scheduleHealth: "On Track",
      status: "Planned"
    });
    const crew = store.createCrew({ name: "Crew 9", specialty: "Paving", foreman: "F. Test", laborMix: [] });
    const jobBase = {
      projectId: project.id,
      location: "Lot",
      startTime: "07:00",
      endTime: "15:30",
      requiredLabor: 4,
      requiredEquipment: "Mill",
      materialsStatus: "Delivered" as const,
      priority: "Normal" as const,
      notes: ""
    };
    const mill = store.createJob({
      ...jobBase,
      name: "Mill lot",
      phase: "Milling",
      startDate: "2026-05-04",
      endDate: "2026-05-06",
      status: "Planned"
    });
    const pave = store.createJob({
      ...jobBase,
      name: "Pave lot",
      phase: "Paving",
      startDate: "2026-05-07",
      endDate: "2026-05-08",
      status: "In Progress"
    });
    store.run("INSERT INTO job_dependencies (id, predecessorId, successorId, type, lagDays) VALUES (?, ?, ?, ?, ?)", [
      "dep-legacy",
      mill.id,
      pave.id,
      "FS",
      0
    ]);
    store.assignJob({ jobId: pave.id, crewId: crew.id, date: "2026-05-07" });

    const data = repo.loadProject(project.id)!;
    expect(data.bootstrappedFromJobs).toBe(2);
    expect(data.project.defaultCalendarId).not.toBe("");
    const millAct = data.activities.find((a) => a.name === "Mill lot")!;
    const paveAct = data.activities.find((a) => a.name === "Pave lot")!;
    expect(millAct).toMatchObject({
      code: "A1000",
      durationMode: "fixed",
      fixedDuration: 3,
      constraint: { type: "SNET", date: "2026-05-04" },
      crewId: null
    });
    expect(paveAct).toMatchObject({ code: "A1010", fixedDuration: 2, crewId: crew.id, actualStart: "2026-05-07" });
    expect(paveAct.constraint).toBeUndefined();
    expect(data.relationships).toEqual([
      { id: "rel-dep-legacy", projectId: project.id, predecessorId: millAct.id, successorId: paveAct.id, type: "FS", lag: 0 }
    ]);
    expect(data.wbs.map((w) => w.name)).toEqual(["Milling", "Paving"]);
    expect(millAct.wbsId).toBe(data.wbs[0].id);

    const again = repo.loadProject(project.id)!;
    expect(again.bootstrappedFromJobs).toBeUndefined();
    expect(again.activities).toHaveLength(2);
    expect(repo.bootstrapFromJobs(project.id)).toBe(0);

    // The data date defaulted to today, which is after these planned dates; set it back to the plan's start.
    repo.updateProject(project.id, { dataDate: "2026-05-04" });
    const result = run(repo.loadProject(project.id)!);
    expect(result.stats.scheduled).toBe(2);
    expect(result.activities[millAct.id].earlyStart).toBe("2026-05-04");
    expect(result.activities[paveAct.id].earlyStart).toBe("2026-05-07");
  });
});
