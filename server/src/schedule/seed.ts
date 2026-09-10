/* ============================================================================
   Seed: "Route 9 Resurfacing" — a realistic 40-activity paving job (Phase 4).

   Mill, binder, top course, drainage, striping. A mix of fixed and production
   durations, three crews (two of them supplying default production rates),
   two calendars (a 5-day default and a 6-day paving calendar with the winter
   paving ban), a WBS, 47 relationships across all four types, a milestone at
   each end, and a contract-completion constraint.

   Evergreen: the anchor (NTP) defaults to the next Monday inside the paving
   season so the demo always opens on a schedule that fits between the thaw and
   the ban. Pass an explicit anchor for deterministic tests.
   ========================================================================== */
import { type Schedule } from "@buildflow/shared";
import { newId } from "../auth.js";
import type { BuildFlowStore } from "../database.js";
import { localTodayIso, ScheduleRepository } from "./repository.js";

type Activity = Schedule.Activity;
type Relationship = Schedule.Relationship;
type WBS = Schedule.WBS;
type Calendar = Schedule.Calendar;

export const PAVING_PROJECT_NUMBER = "26-118";

type CrewKey = "paving" | "grade" | "drain";

interface SeedActivity {
  code: string;
  name: string;
  wbs: string;
  mode: "fixed" | "production";
  days?: number;
  quantity?: number;
  unit?: string;
  rate?: number;
  crewCount?: number;
  crew?: CrewKey;
  paving?: boolean; // use the 6-day paving calendar
  station?: [string, string];
  notes?: string;
}

type SeedRelationship = [pred: string, succ: string, type?: Schedule.RelationshipType, lag?: number];

const WBS_NODES: Array<{ key: string; code: string; name: string; parent?: string }> = [
  { key: "mob", code: "1", name: "Mobilization & Traffic Control" },
  { key: "drain", code: "2", name: "Drainage" },
  { key: "mill", code: "3", name: "Milling & Base Repair" },
  { key: "pave", code: "4", name: "Paving" },
  { key: "binder", code: "4.1", name: "Binder course", parent: "pave" },
  { key: "top", code: "4.2", name: "Top course", parent: "pave" },
  { key: "close", code: "5", name: "Striping & Closeout" }
];

const ACTIVITIES: SeedActivity[] = [
  { code: "A1000", name: "Notice to proceed", wbs: "mob", mode: "fixed", days: 0, notes: "Contract NTP" },
  { code: "A1010", name: "Mobilize & set up staging yard", wbs: "mob", mode: "fixed", days: 3, crew: "grade" },
  { code: "A1020", name: "Install traffic control & detour signage", wbs: "mob", mode: "fixed", days: 2 },
  { code: "A1030", name: "Survey & stake mainline", wbs: "mob", mode: "fixed", days: 4, station: ["0+00", "127+00"] },
  { code: "A1040", name: "Erosion control & inlet protection", wbs: "mob", mode: "fixed", days: 3, crew: "drain" },
  {
    code: "A1100",
    name: 'Excavate & lay 24" RCP trunk line',
    wbs: "drain",
    mode: "production",
    quantity: 1200,
    unit: "LF",
    crew: "drain",
    station: ["12+00", "24+00"],
    notes: "Rate from Drainage Crew default"
  },
  {
    code: "A1110",
    name: "Set drainage structures (DMH/CB)",
    wbs: "drain",
    mode: "production",
    quantity: 14,
    unit: "EA",
    rate: 2,
    crew: "drain"
  },
  {
    code: "A1120",
    name: "Backfill & compact trench",
    wbs: "drain",
    mode: "production",
    quantity: 1200,
    unit: "LF",
    rate: 300,
    crew: "drain"
  },
  { code: "A1130", name: "Adjust existing frames & grates to grade", wbs: "drain", mode: "fixed", days: 3, crew: "drain" },
  { code: "A1140", name: "Reset curb at inlets", wbs: "drain", mode: "fixed", days: 2 },
  { code: "A1150", name: "Drainage video inspection & acceptance", wbs: "drain", mode: "fixed", days: 2 },
  {
    code: "A1200",
    name: 'Mill 2" mainline NB',
    wbs: "mill",
    mode: "production",
    quantity: 33900,
    unit: "SY",
    crew: "grade",
    station: ["0+00", "127+00"],
    notes: "Rate from Grade Crew 2 default"
  },
  {
    code: "A1210",
    name: 'Mill 2" mainline SB',
    wbs: "mill",
    mode: "production",
    quantity: 33900,
    unit: "SY",
    crew: "grade",
    station: ["127+00", "0+00"]
  },
  {
    code: "A1220",
    name: "Mill intersections & driveway aprons",
    wbs: "mill",
    mode: "production",
    quantity: 6200,
    unit: "SY",
    rate: 3100,
    crew: "grade"
  },
  { code: "A1230", name: "Sweep & haul millings", wbs: "mill", mode: "fixed", days: 2 },
  {
    code: "A1240",
    name: "Full-depth reclamation repairs",
    wbs: "mill",
    mode: "production",
    quantity: 2400,
    unit: "SY",
    rate: 800,
    crew: "grade"
  },
  { code: "A1250", name: "Crack seal & base repairs", wbs: "mill", mode: "fixed", days: 3 },
  {
    code: "A1300",
    name: "Tack coat NB (binder)",
    wbs: "binder",
    mode: "production",
    quantity: 33900,
    unit: "SY",
    rate: 17000,
    crew: "paving"
  },
  {
    code: "A1310",
    name: "Binder course NB",
    wbs: "binder",
    mode: "production",
    quantity: 12400,
    unit: "TON",
    crew: "paving",
    paving: true,
    station: ["0+00", "127+00"],
    notes: "12,400 TON at the crew's 1,800 TON/day"
  },
  {
    code: "A1320",
    name: "Tack coat SB (binder)",
    wbs: "binder",
    mode: "production",
    quantity: 33900,
    unit: "SY",
    rate: 17000,
    crew: "paving"
  },
  {
    code: "A1330",
    name: "Binder course SB",
    wbs: "binder",
    mode: "production",
    quantity: 12400,
    unit: "TON",
    crew: "paving",
    paving: true,
    station: ["127+00", "0+00"]
  },
  {
    code: "A1340",
    name: "Binder at intersections & aprons",
    wbs: "binder",
    mode: "production",
    quantity: 2200,
    unit: "TON",
    rate: 1100,
    crew: "paving",
    paving: true
  },
  { code: "A1350", name: "Density testing & cores (binder)", wbs: "binder", mode: "fixed", days: 2 },
  { code: "A1400", name: "Adjust castings to finish grade", wbs: "top", mode: "fixed", days: 3, crew: "drain" },
  { code: "A1410", name: "Tack coat NB (top)", wbs: "top", mode: "production", quantity: 33900, unit: "SY", rate: 17000, crew: "paving" },
  {
    code: "A1420",
    name: "Top course NB",
    wbs: "top",
    mode: "production",
    quantity: 9800,
    unit: "TON",
    rate: 1800,
    crew: "paving",
    paving: true,
    station: ["0+00", "127+00"]
  },
  { code: "A1430", name: "Tack coat SB (top)", wbs: "top", mode: "production", quantity: 33900, unit: "SY", rate: 17000, crew: "paving" },
  {
    code: "A1440",
    name: "Top course SB",
    wbs: "top",
    mode: "production",
    quantity: 9800,
    unit: "TON",
    crew: "paving",
    paving: true,
    station: ["127+00", "0+00"]
  },
  {
    code: "A1450",
    name: "Top course at intersections",
    wbs: "top",
    mode: "production",
    quantity: 1700,
    unit: "TON",
    rate: 1100,
    crew: "paving",
    paving: true
  },
  {
    code: "A1460",
    name: "Shoulder & driveway apron paving",
    wbs: "top",
    mode: "production",
    quantity: 1500,
    unit: "TON",
    rate: 900,
    crew: "paving",
    paving: true
  },
  { code: "A1470", name: "Density testing & cores (top)", wbs: "top", mode: "fixed", days: 2 },
  { code: "A1480", name: "Rideability profile (IRI)", wbs: "top", mode: "fixed", days: 1 },
  {
    code: "A1500",
    name: "Temporary striping (paint)",
    wbs: "close",
    mode: "production",
    quantity: 25400,
    unit: "LF",
    rate: 12000,
    notes: "Striping sub"
  },
  { code: "A1510", name: "Install loop detectors & pavement sensors", wbs: "close", mode: "fixed", days: 3 },
  {
    code: "A1520",
    name: "Permanent epoxy striping",
    wbs: "close",
    mode: "production",
    quantity: 25400,
    unit: "LF",
    rate: 9000,
    notes: "Striping sub; 10 working days cure after temp paint"
  },
  { code: "A1530", name: "Raised pavement markers", wbs: "close", mode: "fixed", days: 2 },
  {
    code: "A1540",
    name: "Topsoil, seed & restoration",
    wbs: "close",
    mode: "production",
    quantity: 8500,
    unit: "SY",
    rate: 3000,
    crew: "grade"
  },
  { code: "A1550", name: "Remove traffic control", wbs: "close", mode: "fixed", days: 1 },
  { code: "A1560", name: "Punch list & final cleanup", wbs: "close", mode: "fixed", days: 3 },
  {
    code: "A1570",
    name: "Substantial completion",
    wbs: "close",
    mode: "fixed",
    days: 0,
    notes: "Contract completion: FNLT 140 calendar days after NTP"
  }
];

const RELATIONSHIPS: SeedRelationship[] = [
  ["A1000", "A1010"],
  ["A1010", "A1020"],
  ["A1020", "A1030"],
  ["A1020", "A1040"],
  ["A1030", "A1100"],
  ["A1040", "A1100"],
  ["A1100", "A1110", "SS", 2],
  ["A1100", "A1120", "SS", 3],
  ["A1110", "A1120", "FF", 1],
  ["A1120", "A1130"],
  ["A1130", "A1140"],
  ["A1120", "A1150"],
  ["A1140", "A1200"],
  ["A1150", "A1200"],
  ["A1200", "A1210"],
  ["A1210", "A1220"],
  ["A1200", "A1230", "SS", 1],
  ["A1220", "A1230", "FF", 0],
  ["A1230", "A1240"],
  ["A1240", "A1250"],
  ["A1250", "A1300"],
  ["A1300", "A1310", "SS", 0],
  ["A1310", "A1320"],
  ["A1320", "A1330", "SS", 0],
  ["A1330", "A1340"],
  ["A1340", "A1350"],
  ["A1350", "A1400"],
  ["A1400", "A1410"],
  ["A1410", "A1420", "SS", 0],
  ["A1420", "A1430"],
  ["A1430", "A1440", "SS", 0],
  ["A1440", "A1450"],
  ["A1450", "A1460"],
  ["A1460", "A1470"],
  ["A1470", "A1480"],
  ["A1440", "A1500"],
  ["A1450", "A1500"],
  ["A1500", "A1510"],
  ["A1480", "A1520"],
  ["A1500", "A1520", "FS", 10],
  ["A1520", "A1530"],
  ["A1460", "A1540"],
  ["A1530", "A1550"],
  ["A1540", "A1550"],
  ["A1550", "A1560"],
  ["A1560", "A1570"],
  ["A1470", "A1570"]
];

const CREWS: Record<
  CrewKey,
  {
    name: string;
    specialty: string;
    foreman: string;
    color: string;
    rate: number;
    unit: string;
    laborMix: Array<{ category: "Labor" | "Operator"; role: string; count: number }>;
  }
> = {
  paving: {
    name: "Paving Crew A",
    specialty: "Paving",
    foreman: "Ray Ortiz",
    color: "#2F6B4F",
    rate: 1800,
    unit: "TON",
    laborMix: [
      { category: "Operator", role: "Paver operator", count: 1 },
      { category: "Operator", role: "Roller operator", count: 2 },
      { category: "Labor", role: "Screed / raker", count: 4 }
    ]
  },
  grade: {
    name: "Grade Crew 2",
    specialty: "Grading",
    foreman: "Denise Park",
    color: "#5B3A8A",
    rate: 8500,
    unit: "SY",
    laborMix: [
      { category: "Operator", role: "Mill operator", count: 1 },
      { category: "Operator", role: "Dozer operator", count: 1 },
      { category: "Labor", role: "Laborer", count: 3 }
    ]
  },
  drain: {
    name: "Drainage Crew",
    specialty: "Utilities",
    foreman: "Luis Ferreira",
    color: "#1F6F8B",
    rate: 150,
    unit: "LF",
    laborMix: [
      { category: "Operator", role: "Excavator operator", count: 1 },
      { category: "Labor", role: "Pipe layer", count: 2 },
      { category: "Labor", role: "Laborer", count: 2 }
    ]
  }
};

export const PAVING_SEED = { activities: ACTIVITIES, relationships: RELATIONSHIPS, wbs: WBS_NODES, crews: CREWS };

/* ---- dates ----------------------------------------------------------------- */

const DAY = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (y: number, m0: number, d: number): Date => new Date(Date.UTC(y, m0, d));
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);

function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = utc(year, month0, 1);
  return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
}

function lastWeekday(year: number, month0: number, weekday: number): Date {
  const last = addDays(utc(year, month0 + 1, 1), -1);
  return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
}

function observed(year: number, month0: number, day: number): Date {
  const d = utc(year, month0, day);
  if (d.getUTCDay() === 6) return addDays(d, -1);
  if (d.getUTCDay() === 0) return addDays(d, 1);
  return d;
}

/** US holidays a heavy-civil contractor takes, for the season starting in `year`. */
export function seasonHolidays(year: number): string[] {
  return [
    lastWeekday(year, 4, 1), // Memorial Day
    observed(year, 6, 4), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(year, 11, 25), // Christmas
    observed(year + 1, 0, 1) // New Year's Day
  ].map(iso);
}

/** Next Monday inside the paving season (Mar–Jul); otherwise the first Monday on or after Apr 6 of the coming season. */
export function pavingSeasonAnchor(today = new Date()): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const base = month >= 2 && month <= 6 ? utc(year, month, today.getUTCDate()) : utc(month < 2 ? year : year + 1, 3, 6);
  return iso(addDays(base, (8 - base.getUTCDay()) % 7));
}

/* ---- the seed ------------------------------------------------------------- */

export interface PavingSeedOptions {
  /** NTP date (ISO). Defaults to the next paving-season Monday. */
  anchor?: string;
  /** Project data date (ISO). Defaults to today. */
  dataDate?: string;
}

/**
 * Create the Route 9 Resurfacing project in `store`. Returns the ids created,
 * or undefined when the project already exists (guarded on its job number).
 */
export function seedPavingSchedule(
  store: BuildFlowStore,
  options: PavingSeedOptions = {}
): { projectId: string; crewIds: Record<CrewKey, string> } | undefined {
  if (store.get<{ id: string }>("SELECT id FROM projects WHERE number = ?", [PAVING_PROJECT_NUMBER])) return undefined;
  const repo = new ScheduleRepository(store);
  const anchor = options.anchor ?? pavingSeasonAnchor();
  const anchorDate = new Date(`${anchor}T00:00:00Z`);
  const dataDate = options.dataDate ?? localTodayIso();
  const completion = iso(addDays(anchorDate, 140));
  const year = anchorDate.getUTCFullYear();

  const project = store.createProject({
    name: "Route 9 Resurfacing",
    location: "Danvers, MA",
    address: "Route 9 (Newbury St), Danvers, MA 01923",
    type: "Paving",
    contractType: "Unit Price",
    managerId: store.get<{ id: string }>("SELECT id FROM users ORDER BY name LIMIT 1")?.id ?? "u-super",
    targetCompletion: completion,
    percentComplete: 0,
    scheduleHealth: "On Track",
    status: "Planned",
    value: 4_150_000
  });

  const crewIds = {} as Record<CrewKey, string>;
  for (const key of Object.keys(CREWS) as CrewKey[]) {
    const spec = CREWS[key];
    const existing = store.get<{ id: string }>("SELECT id FROM crews WHERE name = ?", [spec.name]);
    const id =
      existing?.id ?? store.createCrew({ name: spec.name, specialty: spec.specialty, foreman: spec.foreman, laborMix: spec.laborMix }).id;
    repo.updateCrew(id, { color: spec.color, defaultProductionRate: spec.rate, defaultUnit: spec.unit });
    crewIds[key] = id;
  }

  const holidays = seasonHolidays(year);
  const fiveDay: Calendar = {
    id: newId("cal"),
    projectId: project.id,
    name: "5-Day",
    workdays: [false, true, true, true, true, true, false],
    hoursPerDay: 8,
    holidays,
    exceptions: [],
    blackoutRanges: []
  };
  const paving: Calendar = {
    id: newId("cal"),
    projectId: project.id,
    name: "6-Day Paving",
    workdays: [false, true, true, true, true, true, true],
    hoursPerDay: 10,
    holidays,
    exceptions: [],
    blackoutRanges: [{ start: `${year}-11-15`, end: `${year + 1}-04-01`, reason: "Winter paving ban (DOT spec 401)" }]
  };

  const wbsIds = new Map<string, string>();
  const wbs: WBS[] = WBS_NODES.map((node, index) => {
    const id = newId("wbs");
    wbsIds.set(node.key, id);
    return {
      id,
      projectId: project.id,
      parentId: node.parent ? (wbsIds.get(node.parent) ?? null) : null,
      code: node.code,
      name: node.name,
      sortOrder: index + 1
    };
  });

  const activityIds = new Map<string, string>();
  const activities: Activity[] = ACTIVITIES.map((spec, index) => {
    const id = newId("act");
    activityIds.set(spec.code, id);
    const activity: Activity = {
      id,
      projectId: project.id,
      code: spec.code,
      name: spec.name,
      wbsId: wbsIds.get(spec.wbs) ?? null,
      durationMode: spec.mode,
      calendarId: spec.paving ? paving.id : fiveDay.id,
      crewId: spec.crew ? crewIds[spec.crew] : null,
      percentComplete: 0,
      sortOrder: (index + 1) * 10
    };
    if (spec.mode === "fixed") activity.fixedDuration = spec.days ?? 1;
    else {
      activity.quantity = spec.quantity;
      activity.unit = spec.unit;
      if (spec.rate !== undefined) activity.productionRate = spec.rate;
      activity.crewCount = spec.crewCount ?? 1;
    }
    if (spec.station) [activity.stationStart, activity.stationEnd] = spec.station;
    if (spec.notes) activity.notes = spec.notes;
    if (spec.code === "A1000") activity.constraint = { type: "SNET", date: anchor };
    if (spec.code === "A1570") activity.constraint = { type: "FNLT", date: completion };
    return activity;
  });

  const relationships: Relationship[] = RELATIONSHIPS.map(([pred, succ, type = "FS", lag = 0]) => ({
    id: newId("rel"),
    projectId: project.id,
    predecessorId: activityIds.get(pred) as string,
    successorId: activityIds.get(succ) as string,
    type,
    lag
  }));

  repo.importBundle(project.id, { calendars: [fiveDay, paving], wbs, activities, relationships });
  repo.updateProject(project.id, { number: PAVING_PROJECT_NUMBER, dataDate, defaultCalendarId: fiveDay.id });
  return { projectId: project.id, crewIds };
}
