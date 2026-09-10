/* ============================================================================
   Schedule repository (spec §3 storage notes, Phase 4).

   The Schedule Creation Tool's records live in the per-org SQLite store next
   to the rest of BuildFlow's operational data:

     schedule_calendars · schedule_activities · schedule_relationships ·
     schedule_wbs · schedule_baselines

   Projects and crews are the EXISTING BuildFlow rows, extended with the §3
   fields (projects: number/dataDate/defaultCalendarId/createdAt/updatedAt,
   crews: color/defaultProductionRate/defaultUnit) and projected into the §3
   shapes here. Crews are company assets, so every org crew is offered to every
   project and carries the loaded project's id.

   Activities are the schedule's source of truth. The calculated columns
   (earlyStart … isCritical) are a cache: saveActivity never touches them and
   applyScheduleResults overwrites them after every run (hard rule 6).

   Legacy bridge: a project that has BuildFlow jobs but no activities gets its
   activities bootstrapped from those jobs on first load (sourceJobId links the
   two), so an existing project opens with its plan instead of an empty grid.
   ========================================================================== */
import { scheduleEngine, type Schedule, type ScheduleApi, type Job, type JobDependency } from "@buildflow/shared";
import { newId } from "../auth.js";

type Primitive = string | number | null;
type Activity = Schedule.Activity;
type Calendar = Schedule.Calendar;
type Crew = Schedule.Crew;
type Relationship = Schedule.Relationship;
type WBS = Schedule.WBS;
type Baseline = Schedule.Baseline;
type Project = Schedule.Project;

/** The slice of BuildFlowStore the repository needs (the ALS proxy satisfies it). */
export interface StoreLike {
  all<T>(sql: string, params?: Primitive[]): T[];
  get<T>(sql: string, params?: Primitive[]): T | undefined;
  run(sql: string, params?: Primitive[]): void;
  flush(): void;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

/* --------------------------------------------------------------------------
   Rows ⇄ records
   -------------------------------------------------------------------------- */

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  number: string | null;
  dataDate: string | null;
  defaultCalendarId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CrewRow {
  id: string;
  name: string;
  specialty: string;
  size: number;
  color: string | null;
  defaultProductionRate: number | null;
  defaultUnit: string | null;
}

interface CalendarRow {
  id: string;
  projectId: string;
  name: string;
  workdays: string;
  hoursPerDay: number;
  holidays: string;
  exceptions: string;
  blackoutRanges: string;
}

interface ActivityRow {
  id: string;
  projectId: string;
  code: string;
  name: string;
  wbsId: string | null;
  durationMode: string;
  fixedDuration: number | null;
  quantity: number | null;
  unit: string | null;
  productionRate: number | null;
  crewCount: number | null;
  calendarId: string;
  crewId: string | null;
  constraintType: string | null;
  constraintDate: string | null;
  percentComplete: number | null;
  actualStart: string | null;
  actualFinish: string | null;
  stationStart: string | null;
  stationEnd: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  freeFloat: number | null;
  isCritical: number | null;
  notes: string | null;
  sortOrder: number | null;
  sourceJobId: string | null;
}

interface RelationshipRow {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lag: number;
}

interface WbsRow {
  id: string;
  projectId: string;
  parentId: string | null;
  code: string;
  name: string;
  sortOrder: number;
}

interface BaselineRow {
  id: string;
  projectId: string;
  name: string;
  capturedAt: string;
  snapshot: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONSTRAINT_TYPES = new Set(["SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"]);
const RELATIONSHIP_TYPES = new Set(["FS", "SS", "FF", "SF"]);
/** Crew colours when a crew has none yet. Amber is not in here: it belongs to the critical path alone. */
const CREW_PALETTE = ["#2F6B4F", "#5B3A8A", "#1F6F8B", "#7A4E2D", "#4A5A6A", "#8A3B5C", "#3D6B2E", "#16375E", "#5E7A3A", "#8C5A2B"];

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Today's LOCAL calendar date. Schedule dates are calendar days in the trailer, not UTC instants. */
export function localTodayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function todayIso(): string {
  return localTodayIso();
}

function toCalendar(row: CalendarRow): Calendar {
  const workdays = parseJson<unknown[]>(row.workdays, []);
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    workdays: Array.from({ length: 7 }, (_, i) => workdays[i] === true),
    hoursPerDay: row.hoursPerDay ?? 8,
    holidays: parseJson<string[]>(row.holidays, []),
    exceptions: parseJson<string[]>(row.exceptions, []),
    blackoutRanges: parseJson<Calendar["blackoutRanges"]>(row.blackoutRanges, [])
  };
}

function toActivity(row: ActivityRow): Activity {
  const activity: Activity = {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    wbsId: row.wbsId ?? null,
    durationMode: row.durationMode === "production" ? "production" : "fixed",
    calendarId: row.calendarId,
    crewId: row.crewId ?? null,
    percentComplete: row.percentComplete ?? 0,
    sortOrder: row.sortOrder ?? 0
  };
  if (row.fixedDuration != null) activity.fixedDuration = row.fixedDuration;
  if (row.quantity != null) activity.quantity = row.quantity;
  if (row.unit != null) activity.unit = row.unit;
  if (row.productionRate != null) activity.productionRate = row.productionRate;
  if (row.crewCount != null) activity.crewCount = row.crewCount;
  if (row.constraintType && row.constraintDate && CONSTRAINT_TYPES.has(row.constraintType)) {
    activity.constraint = { type: row.constraintType as Schedule.ConstraintType, date: row.constraintDate };
  }
  if (row.actualStart != null) activity.actualStart = row.actualStart;
  if (row.actualFinish != null) activity.actualFinish = row.actualFinish;
  if (row.stationStart != null) activity.stationStart = row.stationStart;
  if (row.stationEnd != null) activity.stationEnd = row.stationEnd;
  if (row.earlyStart != null) activity.earlyStart = row.earlyStart;
  if (row.earlyFinish != null) activity.earlyFinish = row.earlyFinish;
  if (row.lateStart != null) activity.lateStart = row.lateStart;
  if (row.lateFinish != null) activity.lateFinish = row.lateFinish;
  if (row.totalFloat != null) activity.totalFloat = row.totalFloat;
  if (row.freeFloat != null) activity.freeFloat = row.freeFloat;
  if (row.isCritical != null) activity.isCritical = row.isCritical === 1;
  if (row.notes != null) activity.notes = row.notes;
  return activity;
}

function toRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    projectId: row.projectId,
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: (RELATIONSHIP_TYPES.has(row.type) ? row.type : "FS") as Schedule.RelationshipType,
    lag: row.lag ?? 0
  };
}

function toWbs(row: WbsRow): WBS {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId ?? null,
    code: row.code,
    name: row.name,
    sortOrder: row.sortOrder ?? 0
  };
}

function toBaseline(row: BaselineRow): Baseline {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    capturedAt: row.capturedAt,
    snapshot: parseJson<Baseline["snapshot"]>(row.snapshot, {})
  };
}

function requireIso(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new RepositoryError(`${label} must be an ISO date (YYYY-MM-DD)`);
  return value;
}

function optionalIso(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireIso(value, label);
}

function optionalNumber(value: unknown, label: string, opts: { min?: number; integer?: boolean } = {}): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RepositoryError(`${label} must be a number`);
  if (opts.integer && !Number.isInteger(value)) throw new RepositoryError(`${label} must be a whole number`);
  if (opts.min !== undefined && value < opts.min) throw new RepositoryError(`${label} must be at least ${opts.min}`);
  return value;
}

/* --------------------------------------------------------------------------
   The repository
   -------------------------------------------------------------------------- */

export class ScheduleRepository {
  constructor(private readonly store: StoreLike) {}

  /** Run `fn` inside one SQLite transaction and write the file once. */
  private transaction<T>(fn: () => T): T {
    this.store.run("BEGIN");
    try {
      const result = fn();
      this.store.run("COMMIT");
      this.store.flush();
      return result;
    } catch (error) {
      try {
        this.store.run("ROLLBACK");
      } catch {
        /* nothing to roll back */
      }
      throw error;
    }
  }

  /* ---- project ------------------------------------------------------------ */

  private projectRow(idOrSlug: string): ProjectRow | undefined {
    return this.store.get<ProjectRow>(
      "SELECT id, name, slug, number, dataDate, defaultCalendarId, createdAt, updatedAt FROM projects WHERE id = ? OR slug = ?",
      [idOrSlug, idOrSlug]
    );
  }

  /** Make sure the project has what the schedule needs: a default calendar, a data date, timestamps. */
  private ensureProjectSetup(row: ProjectRow): ProjectRow {
    const updates: Array<[string, Primitive]> = [];
    const now = new Date().toISOString();
    let defaultCalendarId = row.defaultCalendarId;
    const hasDefault = defaultCalendarId
      ? Boolean(
          this.store.get<{ id: string }>("SELECT id FROM schedule_calendars WHERE id = ? AND projectId = ?", [defaultCalendarId, row.id])
        )
      : false;
    if (!hasDefault) {
      const existing = this.store.get<{ id: string }>("SELECT id FROM schedule_calendars WHERE projectId = ? ORDER BY name LIMIT 1", [
        row.id
      ]);
      if (existing) defaultCalendarId = existing.id;
      else {
        defaultCalendarId = newId("cal");
        this.writeCalendar({
          id: defaultCalendarId,
          projectId: row.id,
          name: "5-Day",
          workdays: [false, true, true, true, true, true, false],
          hoursPerDay: 8,
          holidays: [],
          exceptions: [],
          blackoutRanges: []
        });
      }
      updates.push(["defaultCalendarId", defaultCalendarId]);
    }
    if (!row.dataDate || !ISO_DATE.test(row.dataDate)) updates.push(["dataDate", todayIso()]);
    if (!row.createdAt) updates.push(["createdAt", now]);
    if (!row.updatedAt) updates.push(["updatedAt", now]);
    if (updates.length > 0) {
      this.store.run(`UPDATE projects SET ${updates.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`, [
        ...updates.map(([, value]) => value),
        row.id
      ]);
      this.store.flush();
      return this.projectRow(row.id) as ProjectRow;
    }
    return row;
  }

  private toProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      number: row.number ?? "",
      dataDate: row.dataDate ?? todayIso(),
      defaultCalendarId: row.defaultCalendarId ?? "",
      createdAt: row.createdAt ?? "",
      updatedAt: row.updatedAt ?? ""
    };
  }

  /** The project's §3 projection, or undefined when it does not exist. */
  project(projectId: string): Project | undefined {
    const row = this.projectRow(projectId);
    return row ? this.toProject(this.ensureProjectSetup(row)) : undefined;
  }

  updateProject(projectId: string, patch: ScheduleApi.ScheduleProjectPatch): Project {
    const row = this.projectRow(projectId);
    if (!row) throw new RepositoryError("Project not found", 404);
    const updates: Array<[string, Primitive]> = [];
    if (patch.number !== undefined) updates.push(["number", String(patch.number).trim()]);
    if (patch.dataDate !== undefined) updates.push(["dataDate", requireIso(patch.dataDate, "dataDate")]);
    if (patch.defaultCalendarId !== undefined) {
      const calendar = this.store.get<{ id: string }>("SELECT id FROM schedule_calendars WHERE id = ? AND projectId = ?", [
        patch.defaultCalendarId,
        row.id
      ]);
      if (!calendar) throw new RepositoryError("defaultCalendarId must be one of the project's calendars");
      updates.push(["defaultCalendarId", patch.defaultCalendarId]);
    }
    updates.push(["updatedAt", new Date().toISOString()]);
    this.store.run(`UPDATE projects SET ${updates.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`, [
      ...updates.map(([, value]) => value),
      row.id
    ]);
    this.store.flush();
    return this.toProject(this.ensureProjectSetup(this.projectRow(row.id) as ProjectRow));
  }

  private touchProject(projectId: string): void {
    this.store.run("UPDATE projects SET updatedAt = ? WHERE id = ?", [new Date().toISOString(), projectId]);
  }

  /* ---- load --------------------------------------------------------------- */

  loadProject(projectId: string): ScheduleApi.ScheduleProjectData | undefined {
    const raw = this.projectRow(projectId);
    if (!raw) return undefined;
    const row = this.ensureProjectSetup(raw);
    let bootstrappedFromJobs = 0;
    const activityCount =
      this.store.get<{ n: number }>("SELECT COUNT(*) AS n FROM schedule_activities WHERE projectId = ?", [row.id])?.n ?? 0;
    if (activityCount === 0) bootstrappedFromJobs = this.bootstrapFromJobs(row.id);
    const data: ScheduleApi.ScheduleProjectData = {
      project: this.toProject(row),
      calendars: this.calendars(row.id),
      crews: this.crews(row.id),
      activities: this.activities(row.id),
      relationships: this.relationships(row.id),
      wbs: this.wbs(row.id),
      baselines: this.baselines(row.id)
    };
    if (bootstrappedFromJobs > 0) data.bootstrappedFromJobs = bootstrappedFromJobs;
    return data;
  }

  calendars(projectId: string): Calendar[] {
    return this.store.all<CalendarRow>("SELECT * FROM schedule_calendars WHERE projectId = ? ORDER BY name", [projectId]).map(toCalendar);
  }

  activities(projectId: string): Activity[] {
    return this.store
      .all<ActivityRow>("SELECT * FROM schedule_activities WHERE projectId = ? ORDER BY sortOrder, code", [projectId])
      .map(toActivity);
  }

  activity(id: string): Activity | undefined {
    const row = this.store.get<ActivityRow>("SELECT * FROM schedule_activities WHERE id = ?", [id]);
    return row ? toActivity(row) : undefined;
  }

  relationships(projectId: string): Relationship[] {
    return this.store
      .all<RelationshipRow>("SELECT * FROM schedule_relationships WHERE projectId = ? ORDER BY id", [projectId])
      .map(toRelationship);
  }

  wbs(projectId: string): WBS[] {
    return this.store.all<WbsRow>("SELECT * FROM schedule_wbs WHERE projectId = ? ORDER BY sortOrder, code", [projectId]).map(toWbs);
  }

  baselines(projectId: string): Baseline[] {
    return this.store
      .all<BaselineRow>("SELECT * FROM schedule_baselines WHERE projectId = ? ORDER BY capturedAt", [projectId])
      .map(toBaseline);
  }

  /** Every org crew, projected into the §3 shape for this project. Colours are assigned once and kept. */
  crews(projectId: string): Crew[] {
    const rows = this.store.all<CrewRow>(
      "SELECT id, name, specialty, size, color, defaultProductionRate, defaultUnit FROM crews ORDER BY name"
    );
    let assigned = false;
    // Crews are colour-identified in the field, so an auto-assigned colour must not repeat one already in use.
    const used = new Set(rows.map((row) => row.color?.toUpperCase()).filter((c): c is string => Boolean(c)));
    const crews = rows.map((row, index) => {
      let color = row.color;
      if (!color) {
        color = CREW_PALETTE.find((candidate) => !used.has(candidate.toUpperCase())) ?? CREW_PALETTE[index % CREW_PALETTE.length];
        used.add(color.toUpperCase());
        this.store.run("UPDATE crews SET color = ? WHERE id = ?", [color, row.id]);
        assigned = true;
      }
      const crew: Crew = { id: row.id, projectId, name: row.name, trade: row.specialty, size: row.size, color };
      if (row.defaultProductionRate != null) crew.defaultProductionRate = row.defaultProductionRate;
      if (row.defaultUnit != null) crew.defaultUnit = row.defaultUnit;
      return crew;
    });
    if (assigned) this.store.flush();
    return crews;
  }

  updateCrew(crewId: string, patch: ScheduleApi.ScheduleCrewPatch): void {
    const crew = this.store.get<{ id: string }>("SELECT id FROM crews WHERE id = ?", [crewId]);
    if (!crew) throw new RepositoryError("Crew not found", 404);
    const updates: Array<[string, Primitive]> = [];
    if (patch.color !== undefined) {
      if (typeof patch.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(patch.color))
        throw new RepositoryError("color must be a hex colour like #2F6B4F");
      updates.push(["color", patch.color.toUpperCase()]);
    }
    if (patch.defaultProductionRate !== undefined)
      updates.push(["defaultProductionRate", optionalNumber(patch.defaultProductionRate, "defaultProductionRate", { min: 0 })]);
    if (patch.defaultUnit !== undefined)
      updates.push(["defaultUnit", patch.defaultUnit === null ? null : String(patch.defaultUnit).trim().toUpperCase() || null]);
    if (updates.length === 0) return;
    this.store.run(`UPDATE crews SET ${updates.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`, [
      ...updates.map(([, value]) => value),
      crewId
    ]);
    this.store.flush();
  }

  /* ---- calendars ---------------------------------------------------------- */

  private writeCalendar(calendar: Calendar): void {
    if (!Array.isArray(calendar.workdays) || calendar.workdays.length !== 7)
      throw new RepositoryError("workdays must list 7 booleans, Sunday first");
    const problems = scheduleEngine
      .validateCalendar(calendar)
      .filter((p) => p !== "calendar has no working days" && !p.includes("both a holiday"));
    if (problems.length > 0) throw new RepositoryError(problems[0]);
    this.store.run(
      `INSERT INTO schedule_calendars (id, projectId, name, workdays, hoursPerDay, holidays, exceptions, blackoutRanges)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, name = excluded.name, workdays = excluded.workdays,
         hoursPerDay = excluded.hoursPerDay, holidays = excluded.holidays, exceptions = excluded.exceptions, blackoutRanges = excluded.blackoutRanges`,
      [
        calendar.id,
        calendar.projectId,
        String(calendar.name ?? "").trim() || "Calendar",
        JSON.stringify(calendar.workdays.map((d) => d === true)),
        typeof calendar.hoursPerDay === "number" && calendar.hoursPerDay > 0 ? calendar.hoursPerDay : 8,
        JSON.stringify(calendar.holidays ?? []),
        JSON.stringify(calendar.exceptions ?? []),
        JSON.stringify(calendar.blackoutRanges ?? [])
      ]
    );
  }

  saveCalendar(calendar: Calendar): Calendar {
    this.assertProject(calendar.projectId);
    this.transaction(() => {
      this.writeCalendar(calendar);
      this.touchProject(calendar.projectId);
    });
    return toCalendar(this.store.get<CalendarRow>("SELECT * FROM schedule_calendars WHERE id = ?", [calendar.id]) as CalendarRow);
  }

  deleteCalendar(id: string): void {
    const row = this.store.get<CalendarRow>("SELECT * FROM schedule_calendars WHERE id = ?", [id]);
    if (!row) throw new RepositoryError("Calendar not found", 404);
    const project = this.projectRow(row.projectId);
    if (project?.defaultCalendarId === id)
      throw new RepositoryError("This is the project's default calendar; pick another default first", 409);
    const used = this.store.get<{ n: number }>("SELECT COUNT(*) AS n FROM schedule_activities WHERE calendarId = ?", [id])?.n ?? 0;
    if (used > 0) throw new RepositoryError(`${used} activit${used === 1 ? "y uses" : "ies use"} this calendar; reassign them first`, 409);
    this.transaction(() => {
      this.store.run("DELETE FROM schedule_calendars WHERE id = ?", [id]);
      this.touchProject(row.projectId);
    });
  }

  /* ---- activities --------------------------------------------------------- */

  private assertProject(projectId: string): ProjectRow {
    const row = this.projectRow(projectId);
    if (!row) throw new RepositoryError("Project not found", 404);
    return row;
  }

  private writeActivity(activity: Activity, sourceJobId: string | null = null): void {
    const code = String(activity.code ?? "").trim();
    if (!code) throw new RepositoryError("Activity code is required");
    const calendar = this.store.get<{ id: string }>("SELECT id FROM schedule_calendars WHERE id = ? AND projectId = ?", [
      activity.calendarId,
      activity.projectId
    ]);
    if (!calendar) throw new RepositoryError("calendarId must be one of the project's calendars");
    if (activity.wbsId) {
      const wbs = this.store.get<{ id: string }>("SELECT id FROM schedule_wbs WHERE id = ? AND projectId = ?", [
        activity.wbsId,
        activity.projectId
      ]);
      if (!wbs) throw new RepositoryError("wbsId must be one of the project's WBS nodes");
    }
    if (activity.crewId) {
      const crew = this.store.get<{ id: string }>("SELECT id FROM crews WHERE id = ?", [activity.crewId]);
      if (!crew) throw new RepositoryError("crewId must be an existing crew");
    }
    const constraint = activity.constraint ?? undefined;
    if (constraint && !CONSTRAINT_TYPES.has(constraint.type))
      throw new RepositoryError(`Unknown constraint type ${String(constraint.type)}`);
    const clash = this.store.get<{ id: string }>("SELECT id FROM schedule_activities WHERE projectId = ? AND code = ? AND id <> ?", [
      activity.projectId,
      code,
      activity.id
    ]);
    if (clash) throw new RepositoryError(`Activity code ${code} is already used in this project`, 409);
    const percent = optionalNumber(activity.percentComplete, "percentComplete", { min: 0 }) ?? 0;
    this.store.run(
      `INSERT INTO schedule_activities (id, projectId, code, name, wbsId, durationMode, fixedDuration, quantity, unit, productionRate, crewCount,
         calendarId, crewId, constraintType, constraintDate, percentComplete, actualStart, actualFinish, stationStart, stationEnd, notes, sortOrder, sourceJobId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, code = excluded.code, name = excluded.name, wbsId = excluded.wbsId,
         durationMode = excluded.durationMode, fixedDuration = excluded.fixedDuration, quantity = excluded.quantity, unit = excluded.unit,
         productionRate = excluded.productionRate, crewCount = excluded.crewCount, calendarId = excluded.calendarId, crewId = excluded.crewId,
         constraintType = excluded.constraintType, constraintDate = excluded.constraintDate, percentComplete = excluded.percentComplete,
         actualStart = excluded.actualStart, actualFinish = excluded.actualFinish, stationStart = excluded.stationStart, stationEnd = excluded.stationEnd,
         notes = excluded.notes, sortOrder = excluded.sortOrder, sourceJobId = COALESCE(excluded.sourceJobId, schedule_activities.sourceJobId)`,
      [
        activity.id,
        activity.projectId,
        code,
        String(activity.name ?? "").trim(),
        activity.wbsId ?? null,
        activity.durationMode === "production" ? "production" : "fixed",
        optionalNumber(activity.fixedDuration, "fixedDuration", { min: 0 }),
        optionalNumber(activity.quantity, "quantity", { min: 0 }),
        activity.unit ? String(activity.unit).trim().toUpperCase() : null,
        optionalNumber(activity.productionRate, "productionRate", { min: 0 }),
        optionalNumber(activity.crewCount, "crewCount", { min: 1, integer: true }),
        activity.calendarId,
        activity.crewId ?? null,
        constraint ? constraint.type : null,
        constraint ? requireIso(constraint.date, "constraint date") : null,
        Math.min(100, percent),
        optionalIso(activity.actualStart, "actualStart"),
        optionalIso(activity.actualFinish, "actualFinish"),
        activity.stationStart ? String(activity.stationStart).trim() : null,
        activity.stationEnd ? String(activity.stationEnd).trim() : null,
        activity.notes ?? null,
        typeof activity.sortOrder === "number" && Number.isFinite(activity.sortOrder) ? activity.sortOrder : 0,
        sourceJobId
      ]
    );
  }

  /** Upsert one activity's SOURCE fields. Cached calculated columns are left alone. */
  saveActivity(activity: Activity): Activity {
    this.assertProject(activity.projectId);
    this.transaction(() => {
      this.writeActivity(activity);
      this.touchProject(activity.projectId);
    });
    return this.activity(activity.id) as Activity;
  }

  deleteActivity(id: string): void {
    const row = this.store.get<ActivityRow>("SELECT * FROM schedule_activities WHERE id = ?", [id]);
    if (!row) throw new RepositoryError("Activity not found", 404);
    this.transaction(() => {
      this.store.run("DELETE FROM schedule_relationships WHERE predecessorId = ? OR successorId = ?", [id, id]);
      this.store.run("DELETE FROM schedule_activities WHERE id = ?", [id]);
      this.touchProject(row.projectId);
    });
  }

  /* ---- relationships ------------------------------------------------------ */

  private writeRelationship(relationship: Relationship): void {
    if (!RELATIONSHIP_TYPES.has(relationship.type)) throw new RepositoryError(`Unknown relationship type ${String(relationship.type)}`);
    if (relationship.predecessorId === relationship.successorId) throw new RepositoryError("An activity cannot depend on itself");
    const ends = this.store.all<{ id: string }>("SELECT id FROM schedule_activities WHERE projectId = ? AND id IN (?, ?)", [
      relationship.projectId,
      relationship.predecessorId,
      relationship.successorId
    ]);
    if (ends.length !== 2) throw new RepositoryError("Both ends of a relationship must be activities in this project");
    const lag = optionalNumber(relationship.lag, "lag", { integer: true }) ?? 0;
    this.store.run(
      `INSERT INTO schedule_relationships (id, projectId, predecessorId, successorId, type, lag) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, predecessorId = excluded.predecessorId, successorId = excluded.successorId,
         type = excluded.type, lag = excluded.lag`,
      [relationship.id, relationship.projectId, relationship.predecessorId, relationship.successorId, relationship.type, lag]
    );
  }

  saveRelationship(relationship: Relationship): Relationship {
    this.assertProject(relationship.projectId);
    this.transaction(() => {
      this.writeRelationship(relationship);
      this.touchProject(relationship.projectId);
    });
    return toRelationship(
      this.store.get<RelationshipRow>("SELECT * FROM schedule_relationships WHERE id = ?", [relationship.id]) as RelationshipRow
    );
  }

  deleteRelationship(id: string): void {
    const row = this.store.get<RelationshipRow>("SELECT * FROM schedule_relationships WHERE id = ?", [id]);
    if (!row) throw new RepositoryError("Relationship not found", 404);
    this.transaction(() => {
      this.store.run("DELETE FROM schedule_relationships WHERE id = ?", [id]);
      this.touchProject(row.projectId);
    });
  }

  /* ---- WBS + baselines ---------------------------------------------------- */

  private writeWbs(node: WBS): void {
    if (node.parentId === node.id) throw new RepositoryError("A WBS node cannot be its own parent");
    if (node.parentId) {
      const parent = this.store.get<{ id: string }>("SELECT id FROM schedule_wbs WHERE id = ? AND projectId = ?", [
        node.parentId,
        node.projectId
      ]);
      if (!parent) throw new RepositoryError("parentId must be a WBS node in this project");
    }
    this.store.run(
      `INSERT INTO schedule_wbs (id, projectId, parentId, code, name, sortOrder) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, parentId = excluded.parentId, code = excluded.code, name = excluded.name, sortOrder = excluded.sortOrder`,
      [
        node.id,
        node.projectId,
        node.parentId ?? null,
        String(node.code ?? "").trim(),
        String(node.name ?? "").trim(),
        typeof node.sortOrder === "number" ? node.sortOrder : 0
      ]
    );
  }

  saveWbs(node: WBS): WBS {
    this.assertProject(node.projectId);
    this.transaction(() => {
      this.writeWbs(node);
      this.touchProject(node.projectId);
    });
    return toWbs(this.store.get<WbsRow>("SELECT * FROM schedule_wbs WHERE id = ?", [node.id]) as WbsRow);
  }

  /** Delete a WBS node: its children move up to its parent and its activities become unfiled. */
  deleteWbs(id: string): void {
    const row = this.store.get<WbsRow>("SELECT * FROM schedule_wbs WHERE id = ?", [id]);
    if (!row) throw new RepositoryError("WBS node not found", 404);
    this.transaction(() => {
      this.store.run("UPDATE schedule_wbs SET parentId = ? WHERE parentId = ?", [row.parentId ?? null, id]);
      this.store.run("UPDATE schedule_activities SET wbsId = NULL WHERE wbsId = ?", [id]);
      this.store.run("DELETE FROM schedule_wbs WHERE id = ?", [id]);
      this.touchProject(row.projectId);
    });
  }

  private writeBaseline(baseline: Baseline): void {
    this.store.run(
      `INSERT INTO schedule_baselines (id, projectId, name, capturedAt, snapshot) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, name = excluded.name, capturedAt = excluded.capturedAt, snapshot = excluded.snapshot`,
      [
        baseline.id,
        baseline.projectId,
        String(baseline.name ?? "").trim() || "Baseline",
        baseline.capturedAt || new Date().toISOString(),
        JSON.stringify(baseline.snapshot ?? {})
      ]
    );
  }

  saveBaseline(baseline: Baseline): Baseline {
    this.assertProject(baseline.projectId);
    this.transaction(() => this.writeBaseline(baseline));
    return toBaseline(this.store.get<BaselineRow>("SELECT * FROM schedule_baselines WHERE id = ?", [baseline.id]) as BaselineRow);
  }

  /** Snapshot the current early dates as a named baseline. */
  captureBaseline(projectId: string, name: string): Baseline {
    this.assertProject(projectId);
    const snapshot: Baseline["snapshot"] = {};
    for (const a of this.activities(projectId)) {
      if (a.earlyStart && a.earlyFinish) snapshot[a.id] = { earlyStart: a.earlyStart, earlyFinish: a.earlyFinish };
    }
    const baseline: Baseline = {
      id: newId("bl"),
      projectId,
      name: name.trim() || `Baseline ${todayIso()}`,
      capturedAt: new Date().toISOString(),
      snapshot
    };
    return this.saveBaseline(baseline);
  }

  deleteBaseline(id: string): void {
    const row = this.store.get<{ id: string }>("SELECT id FROM schedule_baselines WHERE id = ?", [id]);
    if (!row) throw new RepositoryError("Baseline not found", 404);
    this.transaction(() => this.store.run("DELETE FROM schedule_baselines WHERE id = ?", [id]));
  }

  /* ---- bulk --------------------------------------------------------------- */

  /** Upsert a whole bundle in one transaction (seeds, imports). Order: calendars, WBS, activities, relationships, baselines. */
  importBundle(projectId: string, bundle: ScheduleApi.ScheduleBundle): { activities: number; relationships: number } {
    this.assertProject(projectId);
    return this.transaction(() => {
      for (const c of bundle.calendars ?? []) this.writeCalendar({ ...c, projectId });
      for (const w of bundle.wbs ?? []) this.writeWbs({ ...w, projectId });
      for (const a of bundle.activities ?? []) this.writeActivity({ ...a, projectId });
      for (const r of bundle.relationships ?? []) this.writeRelationship({ ...r, projectId });
      for (const b of bundle.baselines ?? []) this.writeBaseline({ ...b, projectId });
      this.touchProject(projectId);
      return { activities: bundle.activities?.length ?? 0, relationships: bundle.relationships?.length ?? 0 };
    });
  }

  /** Overwrite the cached calculated columns from a schedule run: one transaction, one file write. */
  applyScheduleResults(projectId: string, patches: readonly ScheduleApi.ActivityDatesPatch[]): number {
    this.assertProject(projectId);
    return this.transaction(() => {
      let updated = 0;
      for (const p of patches) {
        this.store.run(
          `UPDATE schedule_activities SET earlyStart = ?, earlyFinish = ?, lateStart = ?, lateFinish = ?, totalFloat = ?, freeFloat = ?, isCritical = ?
           WHERE id = ? AND projectId = ?`,
          [
            optionalIso(p.earlyStart, "earlyStart"),
            optionalIso(p.earlyFinish, "earlyFinish"),
            optionalIso(p.lateStart, "lateStart"),
            optionalIso(p.lateFinish, "lateFinish"),
            optionalNumber(p.totalFloat, "totalFloat", { integer: true }),
            optionalNumber(p.freeFloat, "freeFloat", { integer: true }),
            p.isCritical === null || p.isCritical === undefined ? null : p.isCritical ? 1 : 0,
            p.id,
            projectId
          ]
        );
        updated += 1;
      }
      return updated;
    });
  }

  /** Load, run the engine, cache the results. The server-side recalculation path. */
  runAndStore(projectId: string): { data: ScheduleApi.ScheduleProjectData; result: scheduleEngine.ScheduleResult } | undefined {
    const data = this.loadProject(projectId);
    if (!data) return undefined;
    const result = scheduleEngine.runSchedule({
      project: data.project,
      activities: data.activities,
      relationships: data.relationships,
      calendars: data.calendars,
      crews: data.crews
    });
    this.applyScheduleResults(projectId, resultPatches(result));
    for (const a of data.activities) {
      const r = result.activities[a.id];
      if (!r) continue;
      a.earlyStart = r.earlyStart;
      a.earlyFinish = r.earlyFinish;
      a.lateStart = r.lateStart;
      a.lateFinish = r.lateFinish;
      a.totalFloat = r.scheduled ? r.totalFloat : undefined;
      a.freeFloat = r.scheduled ? r.freeFloat : undefined;
      a.isCritical = r.scheduled ? r.isCritical : undefined;
    }
    return { data, result };
  }

  /* ---- legacy bridge: jobs → activities ----------------------------------- */

  /**
   * Create activities for the project's BuildFlow jobs that have none yet.
   * Durations come from the job's planned dates on the default calendar,
   * dependencies become relationships, the first crew assignment becomes the
   * crew, and network heads keep their planned start as an SNET so the plan's
   * anchors survive the move to CPM. Idempotent: jobs already linked are skipped.
   */
  bootstrapFromJobs(projectId: string): number {
    const row = this.projectRow(projectId);
    if (!row) throw new RepositoryError("Project not found", 404);
    const project = this.ensureProjectSetup(row);
    const jobs = this.store.all<Job>("SELECT * FROM jobs WHERE projectId = ? ORDER BY startDate, startTime, name", [projectId]);
    if (jobs.length === 0) return 0;
    const linked = new Map<string, string>();
    for (const a of this.store.all<{ id: string; sourceJobId: string | null }>(
      "SELECT id, sourceJobId FROM schedule_activities WHERE projectId = ?",
      [projectId]
    )) {
      if (a.sourceJobId) linked.set(a.sourceJobId, a.id);
    }
    const fresh = jobs.filter((job) => !linked.has(job.id));
    if (fresh.length === 0) return 0;
    const calendar = this.calendars(projectId).find((c) => c.id === project.defaultCalendarId) ?? this.calendars(projectId)[0];
    const jobIds = new Set(jobs.map((j) => j.id));
    const dependencies = this.store
      .all<JobDependency>("SELECT * FROM job_dependencies")
      .filter((d) => jobIds.has(d.predecessorId) && jobIds.has(d.successorId));
    const hasPredecessor = new Set(dependencies.map((d) => d.successorId));
    const crewByJob = new Map<string, string>();
    for (const a of this.store.all<{ jobId: string; crewId: string }>("SELECT jobId, crewId FROM assignments ORDER BY date")) {
      if (jobIds.has(a.jobId) && !crewByJob.has(a.jobId)) crewByJob.set(a.jobId, a.crewId);
    }
    const knownCrews = new Set(this.store.all<{ id: string }>("SELECT id FROM crews").map((c) => c.id));
    const existingWbs = this.wbs(projectId);
    const wbsByName = new Map(existingWbs.map((w) => [w.name.toLowerCase(), w.id]));
    const newWbs: WBS[] = [];
    let wbsOrder = existingWbs.length;
    const wbsFor = (phase: string): string | null => {
      const name = phase.trim();
      if (!name) return null;
      const known = wbsByName.get(name.toLowerCase());
      if (known) return known;
      wbsOrder += 1;
      const node: WBS = { id: newId("wbs"), projectId, parentId: null, code: String(wbsOrder), name, sortOrder: wbsOrder };
      newWbs.push(node);
      wbsByName.set(name.toLowerCase(), node.id);
      return node.id;
    };
    let nextCode = 1000;
    for (const a of this.store.all<{ code: string }>("SELECT code FROM schedule_activities WHERE projectId = ?", [projectId])) {
      const m = /^A(\d+)$/.exec(a.code);
      if (m) nextCode = Math.max(nextCode, Number(m[1]) + 10);
    }
    const sortBase =
      this.store.get<{ n: number }>("SELECT COUNT(*) AS n FROM schedule_activities WHERE projectId = ?", [projectId])?.n ?? 0;

    const activities: Activity[] = [];
    const sources: string[] = [];
    fresh.forEach((job, index) => {
      const start = ISO_DATE.test(job.startDate) ? job.startDate : null;
      const end = ISO_DATE.test(job.endDate) ? job.endDate : null;
      let duration = 1;
      if (start && end && calendar) duration = Math.max(1, scheduleEngine.countWorkingDays(calendar, start, end) + 1);
      const activity: Activity = {
        id: newId("act"),
        projectId,
        code: `A${nextCode}`,
        name: job.name,
        wbsId: wbsFor(job.phase),
        durationMode: "fixed",
        fixedDuration: duration,
        calendarId: calendar?.id ?? project.defaultCalendarId ?? "",
        crewId: knownCrews.has(crewByJob.get(job.id) ?? "") ? (crewByJob.get(job.id) as string) : null,
        percentComplete: Math.min(100, Math.max(0, job.percentComplete ?? 0)),
        sortOrder: sortBase + index,
        notes: [job.location ? `Location: ${job.location}` : "", job.notes ?? ""].filter(Boolean).join("\n")
      };
      nextCode += 10;
      const constraintType = job.constraintType && CONSTRAINT_TYPES.has(job.constraintType) ? job.constraintType : null;
      if (constraintType && job.constraintDate && ISO_DATE.test(job.constraintDate)) {
        activity.constraint = { type: constraintType as Schedule.ConstraintType, date: job.constraintDate };
      } else if (!hasPredecessor.has(job.id) && start) {
        activity.constraint = { type: "SNET", date: start };
      }
      const status = String(job.status ?? "");
      if (status === "Complete") {
        activity.actualStart = job.actualStart && ISO_DATE.test(job.actualStart) ? job.actualStart : (start ?? undefined);
        activity.actualFinish = job.actualFinish && ISO_DATE.test(job.actualFinish) ? job.actualFinish : (end ?? undefined);
        activity.percentComplete = 100;
      } else {
        if (job.actualStart && ISO_DATE.test(job.actualStart)) activity.actualStart = job.actualStart;
        else if ((status === "In Progress" || status === "On Site") && start) activity.actualStart = start;
        if (job.actualFinish && ISO_DATE.test(job.actualFinish)) activity.actualFinish = job.actualFinish;
      }
      activities.push(activity);
      sources.push(job.id);
      linked.set(job.id, activity.id);
    });
    const relationships: Relationship[] = [];
    for (const d of dependencies) {
      const predecessorId = linked.get(d.predecessorId);
      const successorId = linked.get(d.successorId);
      if (!predecessorId || !successorId) continue;
      const exists = this.store.get<{ id: string }>("SELECT id FROM schedule_relationships WHERE id = ?", [`rel-${d.id}`]);
      if (exists) continue;
      relationships.push({
        id: `rel-${d.id}`,
        projectId,
        predecessorId,
        successorId,
        type: (RELATIONSHIP_TYPES.has(d.type) ? d.type : "FS") as Schedule.RelationshipType,
        lag: Number.isInteger(d.lagDays) ? d.lagDays : 0
      });
    }
    this.transaction(() => {
      for (const w of newWbs) this.writeWbs(w);
      activities.forEach((a, i) => this.writeActivity(a, sources[i]));
      for (const r of relationships) this.writeRelationship(r);
      this.touchProject(projectId);
    });
    return activities.length;
  }
}

/** Turn an engine result into the cached-column patches the repository stores. */
export function resultPatches(result: scheduleEngine.ScheduleResult): ScheduleApi.ActivityDatesPatch[] {
  return Object.values(result.activities).map((a) => ({
    id: a.id,
    earlyStart: a.scheduled ? (a.earlyStart ?? null) : null,
    earlyFinish: a.scheduled ? (a.earlyFinish ?? null) : null,
    lateStart: a.scheduled ? (a.lateStart ?? null) : null,
    lateFinish: a.scheduled ? (a.lateFinish ?? null) : null,
    totalFloat: a.scheduled ? a.totalFloat : null,
    freeFloat: a.scheduled ? a.freeFloat : null,
    isCritical: a.scheduled ? a.isCritical : null
  }));
}
