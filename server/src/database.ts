import fs from "node:fs";
import { savedFile } from "./fileDurability.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { hashPassword, hashToken, newAuthToken, newSessionToken, newId, SESSION_TTL_MS } from "./auth.js";
import { createBusinessProfile } from "./businessProfiles.js";
import { isPermissionLevel, type PermissionLevel } from "@buildflow/shared";
import { metrics } from "./metrics.js";
import type {
  CrewClash,
  RebookMove,
  RebookResult,
  BootstrapPayload,
  BusinessTypeId,
  CreateEquipmentInput,
  CreateCrewInput,
  CreateJobInput,
  CreateMaterialInput,
  CreateProjectInput,
  Crew,
  CrewLaborMixItem,
  DelayIQ,
  Equipment,
  FieldUpdate,
  Inspection,
  Job,
  JobDependency,
  Material,
  Phase,
  Project,
  ReadinessItem,
  ResourcesPayload,
  ScheduleAssignment,
  ScheduleVariance,
  Status,
  UpdateCrewInput,
  UpdateEquipmentInput,
  UpdateMaterialInput,
  UpdatePhaseInput,
  UpdateProjectInput,
  User,
  VarianceProposal,
  WeatherAlert,
  WeatherConflict,
  WeatherLocation
} from "@buildflow/shared";
import { businessTypeOptions, onboardingProductOptions, planOptions, type OnboardingProductId, type PlanId } from "@buildflow/shared";
import { defaultCrewRate, normalizeWorkCalendar, type WorkCalendarSetting } from "@buildflow/shared";
import { calculateCpm, type CreateJobDependencyInput } from "@buildflow/shared";

/** Days a paid plan runs before checkout has to happen. */
const TRIAL_DAYS = 14;

type Primitive = string | number | null;

// ── Auth model (see auth.ts + stores.ts) ────────────────────────────────────
export type Org = { id: string; name: string; plan: string; createdAt: string };
export type Account = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  /** The workspace permission level. See PermissionLevel in @buildflow/shared. */
  role: PermissionLevel;
  createdAt: string;
  /** When the person ticked the terms box at signup, and which terms they saw. Null for accounts that predate the box. */
  acceptedTermsAt?: string | null;
  acceptedTermsVersion?: string | null;
  /** Set when the person followed the link we emailed them. Null until then. */
  emailVerifiedAt?: string | null;
  /** "google" / "microsoft" when the account was created through sign-in with a provider. */
  authProvider?: string | null;
  providerSubject?: string | null;
};

export type AuthTokenKind = "verify" | "reset";

export type InviteRow = {
  id: string;
  orgId: string;
  email: string;
  /** The permission level the accepted account is created at. See migration 21. */
  permission: PermissionLevel;
  invitedBy: string;
  tokenHash: string;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};
type AccountRow = Account & { passwordHash: string };
export type SessionContext = { account: Account; org: Org };
/** A membership row joined to its org: the shape workspacesForAccount and workspaceMembership return. */
const WORKSPACE_MEMBER_SELECT = `SELECT m.accountId, m.orgId, m.role, m.kind, m.createdAt,
       o.name AS orgName, o.plan AS orgPlan, o.createdAt AS orgCreatedAt
     FROM workspace_members m JOIN orgs o ON o.id = m.orgId`;
/** "home" is the org a login was created in; "extra" is one it created beside it (migration 24). */
export type WorkspaceKind = "home" | "extra";
/** One row of workspace_members, joined to its org. */
export type WorkspaceMemberRow = {
  accountId: string;
  orgId: string;
  role: string;
  kind: WorkspaceKind;
  createdAt: string;
  orgName: string;
  orgPlan: string;
  orgCreatedAt: string;
};

/** One project's worth of an imported schedule — see `importSchedule`. Ids and
 *  projectIds are assigned by the store, so callers supply neither. */
export type ImportedScheduleProject = {
  input: CreateProjectInput;
  phases: Omit<Phase, "id" | "projectId">[];
  jobs: Omit<CreateJobInput, "projectId">[];
};

export const DEMO_ORG_ID = "org-demo";
export const DEMO_ACCOUNT_EMAIL = "demo@buildflow.com";
export const DEMO_ACCOUNT_PASSWORD = "buildflow-demo";

/** Strip the password hash so an account is safe to return to the client. */
/** SQLite stores the sample flag as 0/1; the API speaks booleans. */
function userRow(
  row: Omit<User, "isSample" | "accountId" | "removedAt"> & {
    isSample?: number | boolean | null;
    accountId?: string | null;
    removedAt?: string | null;
  }
): User {
  return { ...row, accountId: row.accountId ?? null, isSample: Boolean(row.isSample), removedAt: row.removedAt ?? null };
}

/** "Jordan Reyes" → "JR"; single names take their first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function toAccount(row: AccountRow): Account {
  const { passwordHash: _passwordHash, ...account } = row;
  return account;
}

type AssignmentRow = Omit<ScheduleAssignment, "conflicts"> & { conflicts: string };
type CrewRow = Omit<Crew, "laborMix">;
type CrewRoleCountRow = CrewLaborMixItem & { id: string; crewId: string };
type FieldUpdateRow = Omit<FieldUpdate, "photos" | "percentComplete"> & {
  photos: string;
  percentComplete: number | null;
};

/** A week's reading of one project's schedule position (`projectId: ""` = portfolio). */
/** A weekly plan snapshot as stored: shaped by server/src/schedule/digest.ts. */
export type PlanSnapshotLike = { weekOf: string; capturedAt: string } & Record<string, unknown>;

/** What "Load sample data" added, so "Remove sample data" can take exactly that out. */
export type SampleDataRecord = {
  businessType: BusinessTypeId;
  projectIds: string[];
  crewIds: string[];
  equipmentIds: string[];
  loadedAt: string;
};

export type ScheduleSnapshotRow = {
  id: string;
  weekOf: string;
  projectId: string;
  daysAhead: number;
  percentComplete: number;
  forecastFinish: string;
  plannedFinish: string;
  capturedAt: string;
  /* The Dashboard's Performance tiles, read the way the Dashboard reads them, so
     next week's delta compares like with like. Only the portfolio row carries
     them; weeks captured before they existed hold null. */
  onTrackProjects: number | null;
  projects: number | null;
  crewUtilization: number | null;
};

/** The measures a snapshot may carry beyond its position — optional on write, null when never read. */
type ScheduleSnapshotMeasures = Pick<ScheduleSnapshotRow, "onTrackProjects" | "projects" | "crewUtilization">;
const SNAPSHOT_MEASURES: Array<keyof ScheduleSnapshotMeasures> = ["onTrackProjects", "projects", "crewUtilization"];

type VarianceRow = Omit<ScheduleVariance, "proposal" | "kind" | "severity" | "status" | "resolvedAt" | "resolvedBy" | "resolutionNote"> & {
  proposal: string;
  kind: string;
  severity: string;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

// ── Contact-sales lead row (the table is created in migrate()) ─────────────────
export type SalesLeadStatus = "New" | "Contacted" | "Qualified" | "Proposal" | "Won" | "Lost";
export type SalesLeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  teamSize: string;
  interest: string;
  status: SalesLeadStatus;
  value: number;
  owner: string;
  source: string;
  notes: string;
  createdAt: string;
  lastActivityAt: string | null;
};

const jobColumns = [
  "id",
  "projectId",
  "name",
  "phase",
  "location",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "requiredLabor",
  "requiredEquipment",
  "materialsStatus",
  "status",
  "priority",
  "notes",
  // CPM: the constraint + baseline the schedule is calculated against
  "constraintType",
  "constraintDate",
  "baselineStart",
  "baselineEnd",
  // As-built: what the field reported, vs the planned dates above
  "percentComplete",
  "actualStart",
  "actualFinish",
  // Bumped by every write. A client sends back the one it last saw, so a save
  // made against a stale copy can be refused instead of quietly overwriting.
  "version"
].join(", ");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * The job columns a patch may write. Named once because two things need it: the write itself,
 * and the question "is there anything here to write at all", which decides whether a request
 * is worth a transaction and the file rewrite that follows one.
 */
const JOB_COLUMNS = [
  "status",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "materialsStatus",
  "notes",
  "priority",
  // As-built progress, written by the field reporting loop
  "percentComplete",
  "actualStart",
  "actualFinish"
] as const;

/**
 * The main database's path. Exported so tooling (the restore CLI) resolves the same data directory
 * this server uses, rather than working it out a second time.
 *
 * `BUILDFLOW_DATA_FILE` moves it, and everything follows from here: the per-workspace databases sit
 * beside it (stores.ts derives its directory from the main store's path), the backups go in
 * `backups/` next to it (restore.ts and the ops routes), and the restore CLI reads this same value.
 * One variable, because two would be a way for the server and the CLI to disagree about where the
 * data is.
 *
 * It exists because the location was otherwise changeable only by editing this line. On a platform
 * configured through environment variables — Replit's Secrets — that is the difference between being
 * able to point the data somewhere durable and not.
 *
 * A relative value resolves against the working directory, which is what a deployment's start
 * command means by a relative path. The default resolves from this module instead, so it stays
 * `server/data/buildflow.sqlite` whether the process was started from the repo root or from server/.
 */
export const defaultDataFile = (() => {
  const configured = process.env.BUILDFLOW_DATA_FILE?.trim();
  return configured ? path.resolve(configured) : path.resolve(__dirname, "../data/buildflow.sqlite");
})();

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function toAssignment(row: AssignmentRow): ScheduleAssignment {
  return { ...row, conflicts: parseJsonArray(row.conflicts) };
}

function toFieldUpdate(row: FieldUpdateRow): FieldUpdate {
  const { percentComplete, ...rest } = row;
  const update: FieldUpdate = { ...rest, photos: parseJsonArray(row.photos) };
  // SQLite hands back NULL for "no percent reported"; the domain says absent.
  if (percentComplete != null) update.percentComplete = percentComplete;
  return update;
}

function toVariance(row: VarianceRow): ScheduleVariance {
  const variance: ScheduleVariance = {
    ...row,
    kind: row.kind as ScheduleVariance["kind"],
    severity: row.severity as ScheduleVariance["severity"],
    status: row.status as ScheduleVariance["status"],
    proposal: JSON.parse(row.proposal) as VarianceProposal,
    resolvedAt: row.resolvedAt ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
    resolutionNote: row.resolutionNote ?? undefined
  };
  return variance;
}

/* WeatherIQ's conflicts keep their window as startsAt/endsAt: END is an SQL keyword. */
type WeatherConflictRow = Omit<WeatherConflict, "start" | "end" | "decidedAt" | "decidedBy" | "varianceId" | "delayIQId"> & {
  startsAt: string;
  endsAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  varianceId: string | null;
  delayIQId: string | null;
};

function toWeatherConflict(row: WeatherConflictRow): WeatherConflict {
  const { startsAt, endsAt, decidedAt, decidedBy, varianceId, delayIQId, ...rest } = row;
  const conflict: WeatherConflict = { ...rest, start: startsAt, end: endsAt };
  if (decidedAt) conflict.decidedAt = decidedAt;
  if (decidedBy) conflict.decidedBy = decidedBy;
  if (varianceId) conflict.varianceId = varianceId;
  if (delayIQId) conflict.delayIQId = delayIQId;
  return conflict;
}

/** The server's own calendar day, YYYY-MM-DD — what "from today on" means for the conflicts bootstrap sends. */
function localToday(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function slugify(value: string, fallback = "crew") {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function projectImageForType(type: string) {
  const value = type.toLowerCase();
  if (value.includes("multi") || value.includes("apartment") || value.includes("residential")) return "apartments";
  if (value.includes("health") || value.includes("medical") || value.includes("clinic")) return "medical-center";
  if (value.includes("industrial") || value.includes("warehouse") || value.includes("logistics")) return "warehouse";
  if (value.includes("parking") || value.includes("garage")) return "parking-garage";
  return "office-building";
}

// Monday of the demo seed's primary week. The seed is shifted so this lands on
// the current week, keeping the demo evergreen (always "this week / this month").
const SEED_ANCHOR_MONDAY = Date.UTC(2026, 5, 15); // 2026-06-15

// Per-table fields whose values are dates that must ride along when the seed is
// shifted onto the current calendar. Only applied while seeding (never to user data).
const SEED_DATE_FIELDS: Record<string, string[]> = {
  projects: ["targetCompletion"],
  phases: ["startDate", "endDate"],
  jobs: ["startDate", "endDate", "constraintDate", "baselineStart", "baselineEnd", "actualStart", "actualFinish"],
  schedule_variances: ["detectedAt", "resolvedAt"],
  materials: ["deliveryDate"],
  assignments: ["date"],
  field_updates: ["createdAt"],
  delayIQs: ["reportedAt"],
  readiness: ["dueDate"],
  inspections: ["scheduledAt"],
  weather_alerts: ["startsAt"]
};

function shiftSeedDate(value: unknown, days: number): unknown {
  if (days === 0 || typeof value !== "string") return value;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value; // leave non-dates (e.g. "Pending") alone
  const shifted = new Date(`${datePart}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10) + value.slice(10);
}

/* ── Schema migrations ──────────────────────────────────────────────────────
   Forward, versioned migrations applied on top of the baseline CREATE TABLE
   block in migrate(). Tracked per-database via SQLite's PRAGMA user_version, so
   every store — the main/demo DB AND each per-tenant org-<id>.sqlite — converges
   to LATEST_SCHEMA_VERSION on open.

   Adding one: append { version: <next int>, name, up }. Put NEW COLUMNS in a
   migration (ALTER TABLE … ADD COLUMN), NOT in the baseline, so fresh and
   existing databases stay in lockstep. Keep each `up` idempotent (IF NOT EXISTS)
   — a crash mid-run re-applies from the last committed version. Never edit or
   renumber a shipped migration. */
type Migration = { version: number; name: string; up: (db: Database) => void };

const SCHEMA_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "performance indexes",
    up: (db) =>
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_jobs_projectId ON jobs(projectId);
        CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments(date);
        CREATE INDEX IF NOT EXISTS idx_assignments_jobId ON assignments(jobId);
        CREATE INDEX IF NOT EXISTS idx_assignments_crewId ON assignments(crewId);
        CREATE INDEX IF NOT EXISTS idx_field_updates_projectId ON field_updates(projectId);
        CREATE INDEX IF NOT EXISTS idx_delayIQs_projectId ON delayIQs(projectId);
        CREATE INDEX IF NOT EXISTS idx_materials_projectId ON materials(projectId);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt);
        CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
        CREATE INDEX IF NOT EXISTS idx_accounts_orgId ON accounts(orgId);
      `)
  },
  {
    version: 2,
    name: "cpm: dependency network, date constraints, baseline",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS job_dependencies (
          id TEXT PRIMARY KEY,
          predecessorId TEXT NOT NULL,
          successorId TEXT NOT NULL,
          type TEXT NOT NULL,
          lagDays INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_job_deps_pred ON job_dependencies(predecessorId);
        CREATE INDEX IF NOT EXISTS idx_job_deps_succ ON job_dependencies(successorId);
      `);
      // SQLite has no "ADD COLUMN IF NOT EXISTS", so read the table first — this
      // keeps the migration idempotent if it re-runs after a crash.
      const existing = new Set<string>();
      const info = db.exec("PRAGMA table_info(jobs)");
      if (info[0]) for (const row of info[0].values) existing.add(String(row[1]));
      for (const column of ["constraintType", "constraintDate", "baselineStart", "baselineEnd"]) {
        if (!existing.has(column)) db.exec(`ALTER TABLE jobs ADD COLUMN ${column} TEXT`);
      }
    }
  },
  {
    version: 3,
    name: "field progress → schedule variance loop",
    up: (db) => {
      const addColumns = (table: string, columns: Record<string, string>) => {
        const existing = new Set<string>();
        const info = db.exec(`PRAGMA table_info(${table})`);
        if (info[0]) for (const row of info[0].values) existing.add(String(row[1]));
        for (const [column, decl] of Object.entries(columns)) {
          if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
        }
      };

      // Progress is a field-owned fact on the job; dates stay planner-owned.
      addColumns("jobs", {
        percentComplete: "INTEGER NOT NULL DEFAULT 0",
        actualStart: "TEXT",
        actualFinish: "TEXT"
      });
      // Nullable: a note-only update reports no percent and stays a log entry.
      addColumns("field_updates", { percentComplete: "INTEGER" });

      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_variances (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          jobId TEXT NOT NULL,
          fieldUpdateId TEXT NOT NULL,
          kind TEXT NOT NULL,
          severity TEXT NOT NULL,
          status TEXT NOT NULL,
          reportedPercent INTEGER NOT NULL,
          plannedPercent INTEGER NOT NULL,
          varianceDays INTEGER NOT NULL,
          detectedAt TEXT NOT NULL,
          proposal TEXT NOT NULL,
          resolvedAt TEXT,
          resolvedBy TEXT,
          resolutionNote TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_variances_status ON schedule_variances(status);
        CREATE INDEX IF NOT EXISTS idx_variances_jobId ON schedule_variances(jobId);
        CREATE INDEX IF NOT EXISTS idx_variances_projectId ON schedule_variances(projectId);
      `);
    }
  },
  {
    version: 4,
    name: "rename delays → delayIQs (DelayIQ rebrand)",
    // The whole "delay" vocabulary was rebranded to "DelayIQ". The baseline block
    // above now creates `delayIQs`, so an existing DB reaches here with an EMPTY
    // `delayIQs` (just created) alongside the old populated `delays` — move the
    // rows across, then rewrite the persisted "Delayed" status + delay categories.
    // Idempotent: guarded on the old table's existence; INSERT OR IGNORE + the
    // narrow WHEREs make a re-run after a crash a no-op.
    up: (db) => {
      const names = new Set<string>();
      const master = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (master[0]) for (const row of master[0].values) names.add(String(row[0]));

      // 1. Carry the old table's data into the new one, then drop the old.
      if (names.has("delays")) {
        db.exec("INSERT OR IGNORE INTO delayIQs SELECT * FROM delays");
        db.exec("DROP TABLE delays");
      }
      db.exec("CREATE INDEX IF NOT EXISTS idx_delayIQs_projectId ON delayIQs(projectId)");

      // 2. Persisted "Delayed" job/phase status → "DelayIQed", in every table that
      //    has a `status` column (harmless where the value never occurs).
      for (const table of names) {
        if (table === "delays") continue; // dropped above
        const info = db.exec(`PRAGMA table_info(${table})`);
        const hasStatus = Boolean(info[0]) && info[0].values.some((c) => String(c[1]) === "status");
        if (hasStatus) db.exec(`UPDATE ${table} SET status = 'DelayIQed' WHERE status = 'Delayed'`);
      }

      // 3. Stored delay category values ("Inspection delay" → "Inspection delayIQ"),
      //    case-preserving so "Delay"→"DelayIQ" and "delay"→"delayIQ".
      db.exec("UPDATE delayIQs SET category = REPLACE(category, 'Delay', 'DelayIQ') WHERE category LIKE '%Delay%'");
      db.exec("UPDATE delayIQs SET category = REPLACE(category, 'delay', 'delayIQ') WHERE category LIKE '%delay%'");
    }
  },
  {
    version: 5,
    name: "weekly schedule snapshots",
    up: (db) => {
      // One row per project per week (plus a portfolio row with projectId '') so
      // the dashboard can say "improved by N days from last week" from a real
      // prior reading instead of a fabricated delta. Written once per week the
      // first time the status is asked for — see captureWeeklySnapshots().
      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_snapshots (
          id TEXT PRIMARY KEY,
          weekOf TEXT NOT NULL,
          projectId TEXT NOT NULL,
          daysAhead INTEGER NOT NULL,
          percentComplete INTEGER NOT NULL,
          forecastFinish TEXT NOT NULL,
          plannedFinish TEXT NOT NULL,
          capturedAt TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_week_project
          ON schedule_snapshots(weekOf, projectId);
        CREATE INDEX IF NOT EXISTS idx_snapshots_weekOf ON schedule_snapshots(weekOf);
      `);
    }
  },
  {
    version: 6,
    name: "project contract value",
    up: (db) => {
      // Nullable on purpose: existing projects were scheduled without a price,
      // and reporting must treat "not priced" differently from "worth nothing".
      const info = db.exec("PRAGMA table_info(projects)");
      const hasValue = Boolean(info[0]) && info[0].values.some((col) => String(col[1]) === "value");
      if (!hasValue) db.exec("ALTER TABLE projects ADD COLUMN value INTEGER");
    }
  },
  {
    version: 7,
    name: "sales tasks assignee/priority/notes + sales meetings",
    up: (db) => {
      // Existing DBs predate these columns; fresh DBs get them from the base
      // schema, so guard each ALTER on the column being absent.
      const info = db.exec("PRAGMA table_info(sales_tasks)");
      const cols = new Set(info[0] ? info[0].values.map((col) => String(col[1])) : []);
      if (cols.size > 0) {
        if (!cols.has("assignee")) db.exec("ALTER TABLE sales_tasks ADD COLUMN assignee TEXT NOT NULL DEFAULT ''");
        if (!cols.has("priority")) db.exec("ALTER TABLE sales_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
        if (!cols.has("notes")) db.exec("ALTER TABLE sales_tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_meetings (
          id TEXT PRIMARY KEY,
          leadId TEXT NOT NULL,
          title TEXT NOT NULL,
          startsAt TEXT NOT NULL,
          endsAt TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT '',
          agenda TEXT NOT NULL DEFAULT '',
          organizer TEXT NOT NULL DEFAULT '',
          notifiedVia TEXT NOT NULL DEFAULT 'none',
          createdAt TEXT NOT NULL
        );
      `);
    }
  },
  {
    version: 8,
    name: "sales companies + deals",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_companies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          domain TEXT NOT NULL DEFAULT '',
          industry TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          owner TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          lastActivityAt TEXT
        );
        CREATE TABLE IF NOT EXISTS sales_deals (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          stage TEXT NOT NULL DEFAULT 'Appointment scheduled',
          amount INTEGER NOT NULL DEFAULT 0,
          closeDate TEXT NOT NULL DEFAULT '',
          companyId TEXT,
          leadId TEXT,
          owner TEXT NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'Medium',
          notes TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          lastActivityAt TEXT
        );
      `);
    }
  },
  {
    version: 9,
    name: "schedule tool: calendars, activities, relationships, wbs, baselines",
    up: (db) => {
      // The Schedule Creation Tool's own records (spec §3). Activities are the
      // schedule's source of truth; the calculated columns are a cache that
      // every schedule run overwrites. Projects/crews are the existing BuildFlow
      // records, extended with the §3 fields they lacked.
      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_calendars (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          name TEXT NOT NULL,
          workdays TEXT NOT NULL,
          hoursPerDay REAL NOT NULL DEFAULT 8,
          holidays TEXT NOT NULL DEFAULT '[]',
          exceptions TEXT NOT NULL DEFAULT '[]',
          blackoutRanges TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_sched_calendars_project ON schedule_calendars(projectId);
        CREATE TABLE IF NOT EXISTS schedule_activities (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          wbsId TEXT,
          durationMode TEXT NOT NULL DEFAULT 'fixed',
          fixedDuration REAL,
          quantity REAL,
          unit TEXT,
          productionRate REAL,
          crewCount INTEGER,
          calendarId TEXT NOT NULL,
          crewId TEXT,
          constraintType TEXT,
          constraintDate TEXT,
          percentComplete REAL NOT NULL DEFAULT 0,
          actualStart TEXT,
          actualFinish TEXT,
          stationStart TEXT,
          stationEnd TEXT,
          earlyStart TEXT,
          earlyFinish TEXT,
          lateStart TEXT,
          lateFinish TEXT,
          totalFloat INTEGER,
          freeFloat INTEGER,
          isCritical INTEGER,
          notes TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          sourceJobId TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_activities_project_code ON schedule_activities(projectId, code);
        CREATE INDEX IF NOT EXISTS idx_sched_activities_project ON schedule_activities(projectId);
        CREATE INDEX IF NOT EXISTS idx_sched_activities_source_job ON schedule_activities(sourceJobId);
        CREATE TABLE IF NOT EXISTS schedule_relationships (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          predecessorId TEXT NOT NULL,
          successorId TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'FS',
          lag INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sched_rel_project ON schedule_relationships(projectId);
        CREATE INDEX IF NOT EXISTS idx_sched_rel_pred ON schedule_relationships(predecessorId);
        CREATE INDEX IF NOT EXISTS idx_sched_rel_succ ON schedule_relationships(successorId);
        CREATE TABLE IF NOT EXISTS schedule_wbs (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          parentId TEXT,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          sortOrder INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sched_wbs_project ON schedule_wbs(projectId);
        CREATE TABLE IF NOT EXISTS schedule_baselines (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          name TEXT NOT NULL,
          capturedAt TEXT NOT NULL,
          snapshot TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sched_baselines_project ON schedule_baselines(projectId);
      `);
      const addColumns = (table: string, columns: Array<[string, string]>) => {
        const existing = new Set<string>();
        const info = db.exec(`PRAGMA table_info(${table})`);
        if (info[0]) for (const row of info[0].values) existing.add(String(row[1]));
        for (const [column, type] of columns) {
          if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
      };
      addColumns("projects", [
        ["number", "TEXT"],
        ["dataDate", "TEXT"],
        ["defaultCalendarId", "TEXT"],
        ["createdAt", "TEXT"],
        ["updatedAt", "TEXT"]
      ]);
      addColumns("crews", [
        ["color", "TEXT"],
        ["defaultProductionRate", "REAL"],
        ["defaultUnit", "TEXT"]
      ]);
    }
  },
  {
    version: 10,
    name: "workspace settings (business type)",
    up: (db) => {
      // Org-level key/value settings. The first key is the trade the owner
      // picked at onboarding — it used to live only in the browser's
      // localStorage, so signing in from another device forgot it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
  },
  {
    version: 11,
    name: "accounts: terms acceptance",
    up: (db) => {
      // Signup now asks for explicit agreement; record when and to which
      // version. Nullable so accounts created before the box keep working.
      const info = db.exec("PRAGMA table_info(accounts)");
      const cols = info[0] ? info[0].values.map((col) => String(col[1])) : [];
      if (!cols.includes("acceptedTermsAt")) db.exec("ALTER TABLE accounts ADD COLUMN acceptedTermsAt TEXT");
      if (!cols.includes("acceptedTermsVersion")) db.exec("ALTER TABLE accounts ADD COLUMN acceptedTermsVersion TEXT");
    }
  },
  {
    version: 12,
    name: "users linked to accounts, sample flag, onboarding-completed setting",
    up: (db) => {
      // The registered owner becomes a real person in their workspace (linked by
      // accountId); seeded teammates are flagged as samples. Workspaces that
      // already have people in them finished onboarding before this flag
      // existed, so backfill it — otherwise every existing sign-in would be
      // sent back to the trade picker.
      const info = db.exec("PRAGMA table_info(users)");
      const cols = info[0] ? info[0].values.map((col) => String(col[1])) : [];
      if (!cols.includes("accountId")) db.exec("ALTER TABLE users ADD COLUMN accountId TEXT");
      if (!cols.includes("isSample")) db.exec("ALTER TABLE users ADD COLUMN isSample INTEGER NOT NULL DEFAULT 0");
      db.exec("CREATE INDEX IF NOT EXISTS idx_users_account ON users(accountId)");
      // People seeded by a starter workspace before the flag existed are samples
      // too; nobody typed them in. Anyone linked to a login account is real.
      db.exec("UPDATE users SET isSample = 1 WHERE accountId IS NULL AND id IN ('u-matt', 'u-jessica', 'u-carlos')");
      const users = db.exec("SELECT COUNT(*) FROM users");
      const count = Number(users[0]?.values?.[0]?.[0] ?? 0);
      if (count > 0) {
        db.exec(
          `INSERT INTO workspace_settings (key, value) VALUES ('onboardingCompletedAt', '${new Date().toISOString()}')
           ON CONFLICT(key) DO NOTHING`
        );
      }
    }
  },
  {
    version: 16,
    name: "accounts: sign-in provider",
    up: (db) => {
      const info = db.exec("PRAGMA table_info(accounts)");
      const cols = info[0] ? info[0].values.map((col) => String(col[1])) : [];
      if (!cols.includes("authProvider")) db.exec("ALTER TABLE accounts ADD COLUMN authProvider TEXT");
      if (!cols.includes("providerSubject")) db.exec("ALTER TABLE accounts ADD COLUMN providerSubject TEXT");
    }
  },
  {
    version: 15,
    name: "per-user settings (tutorial progress)",
    up: (db) => {
      // Things a person decides for themselves — which tutorials they skipped
      // or finished — used to live in localStorage and replayed on every new
      // device. Keyed by workspace user, so they follow the login.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          userId TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (userId, key)
        );
      `);
    }
  },
  {
    version: 14,
    name: "team invites",
    up: (db) => {
      // Invites are org records (main store), like accounts: the invited person
      // has no workspace user until they accept. Token stored hashed, like the
      // other emailed links.
      db.exec(`
        CREATE TABLE IF NOT EXISTS invites (
          id TEXT PRIMARY KEY,
          orgId TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          invitedBy TEXT NOT NULL,
          tokenHash TEXT NOT NULL UNIQUE,
          expiresAt TEXT NOT NULL,
          sentAt TEXT,
          acceptedAt TEXT,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_invites_org ON invites(orgId, acceptedAt);
      `);
    }
  },
  {
    version: 13,
    name: "email verification + one-time auth tokens",
    up: (db) => {
      // One table for every emailed link (verify address, reset password).
      // Only the hash of a token is stored; the raw token lives in the email.
      const info = db.exec("PRAGMA table_info(accounts)");
      const cols = info[0] ? info[0].values.map((col) => String(col[1])) : [];
      if (!cols.includes("emailVerifiedAt")) db.exec("ALTER TABLE accounts ADD COLUMN emailVerifiedAt TEXT");
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_tokens (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          kind TEXT NOT NULL,
          tokenHash TEXT NOT NULL UNIQUE,
          expiresAt TEXT NOT NULL,
          usedAt TEXT,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_account ON auth_tokens(accountId, kind);
      `);
    }
  }
];

SCHEMA_MIGRATIONS.push(
  {
    version: 15,
    name: "crew hourly rates",
    up: (db) => {
      // What a crew costs per worker-hour, so the schedule's labour cost is arithmetic, not a constant.
      const info = db.exec("PRAGMA table_info(crews)");
      const cols = info[0] ? info[0].values.map((col) => String(col[1])) : [];
      if (!cols.includes("rate")) db.exec("ALTER TABLE crews ADD COLUMN rate REAL");
    }
  },
  {
    version: 16,
    name: "a booking wears its job's status",
    up: (db) => {
      // One status model: the job owns it; every booking of that job shows the same badge.
      db.exec("UPDATE assignments SET status = COALESCE((SELECT status FROM jobs WHERE jobs.id = assignments.jobId), status)");
    }
  },
  {
    version: 17,
    name: "weekly plan snapshots for the digest",
    up: (db) => {
      // The whole plan as it stood on a Monday — jobs, bookings, milestones — so the
      // weekly digest can say what moved. One row per week, the first reading kept.
      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_plan_snapshots (
          weekOf TEXT PRIMARY KEY,
          capturedAt TEXT NOT NULL,
          plan TEXT NOT NULL
        );
      `);
    }
  },
  {
    version: 18,
    name: "per-user settings and sign-in columns on every store; weekly snapshot measures",
    up: (db) => {
      const columnsOf = (table: string) => {
        const info = db.exec(`PRAGMA table_info(${table})`);
        return info[0] ? info[0].values.map((col) => String(col[1])) : [];
      };
      // "per-user settings" and "accounts: sign-in provider" were numbered 15 and
      // 16 after some stores had already reached 17, so those stores never ran
      // them — the demo store's bootstrap failed on the missing user_settings
      // table. Both are re-applied here, guarded, for any store that skipped them.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          userId TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (userId, key)
        );
      `);
      const accounts = columnsOf("accounts");
      if (accounts.length > 0 && !accounts.includes("authProvider")) db.exec("ALTER TABLE accounts ADD COLUMN authProvider TEXT");
      if (accounts.length > 0 && !accounts.includes("providerSubject")) db.exec("ALTER TABLE accounts ADD COLUMN providerSubject TEXT");
      // The Dashboard's Performance tiles trend on the weekly reading: how many
      // projects were on track by schedule health, out of how many, and the
      // crews' average utilization. Nullable — earlier weeks were never read.
      const snapshots = columnsOf("schedule_snapshots");
      if (snapshots.length > 0) {
        if (!snapshots.includes("onTrackProjects")) db.exec("ALTER TABLE schedule_snapshots ADD COLUMN onTrackProjects INTEGER");
        if (!snapshots.includes("projects")) db.exec("ALTER TABLE schedule_snapshots ADD COLUMN projects INTEGER");
        if (!snapshots.includes("crewUtilization")) db.exec("ALTER TABLE schedule_snapshots ADD COLUMN crewUtilization INTEGER");
      }
    }
  }
);

SCHEMA_MIGRATIONS.push({
  version: 19,
  name: "a row version on jobs and bookings",
  up: (db) => {
    // Two planners on one card used to be last-write-wins, and the one who lost was told
    // it saved. A counter the client sends back turns that into a question the server can
    // answer: this is not the row you were looking at.
    const columnsOf = (table: string) => {
      const info = db.exec(`PRAGMA table_info(${table})`);
      return info[0] ? info[0].values.map((col) => String(col[1])) : [];
    };
    for (const table of ["jobs", "assignments"]) {
      const columns = columnsOf(table);
      if (columns.length > 0 && !columns.includes("version")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
      }
    }
  }
});

SCHEMA_MIGRATIONS.push({
  version: 20,
  name: "workspace permission levels on accounts",
  up: (db) => {
    // `accounts.role` has been the permission axis since the first commit that wrote it:
    // signup writes "owner" and invite acceptance writes "member". This migration adds
    // nothing structural. It normalises the column so the narrowed PermissionLevel type
    // is true of the data as well as of the code, and it is the release that introduces
    // "admin" as a legal third value.
    //
    // WHY NO CHECK CONSTRAINT. SQLite cannot add one to an existing table; it needs the
    // table rebuilt and every row copied. `accounts` holds live logins and password
    // hashes, so a rebuild is a far larger risk than the constraint removes. The value is
    // guarded instead at the only place it is ever written — createAccount and
    // setAccountRole both reject anything outside the union — and asserted by a test.
    //
    // THE VERSION NUMBER MATTERS MORE THAN IT LOOKS. The runner sorts by version and
    // skips anything at or below the stored user_version, silently, with no error
    // (:1170). SCHEMA_MIGRATIONS already contains two 15s and two 16s, so one of each
    // pair has never run on a database that had already passed that number. Never
    // renumber this below 20, and never reuse a number.
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'");
    if (!tables[0]) return;
    // Anything that is not one of the three becomes a member: the least privilege that
    // still lets the person sign in and work. An unreadable value must never fail open.
    db.exec(`UPDATE accounts SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member')`);
    // Historic casing, in case any path ever wrote "Owner" or "Member".
    db.exec(`UPDATE accounts SET role = lower(role) WHERE role <> lower(role)`);
  }
});

SCHEMA_MIGRATIONS.push({
  version: 21,
  name: "invites carry a permission level",
  up: (db) => {
    // An invite already carried a job title. It could not carry a permission level, so
    // acceptance hardcoded "member" and there was no way to invite an Admin at all --
    // which is what made the Admin tier unreachable rather than merely unenforced.
    //
    // A plain ADD COLUMN with a default, so every invite already in flight becomes exactly
    // what it would have become anyway: a Member. Nobody's pending invite changes meaning.
    //
    // Numbered 21, one past 20. The runner sorts by version and skips anything at or below
    // the stored user_version SILENTLY (:1170), and SCHEMA_MIGRATIONS already carries two
    // 15s and two 16s from before that was understood. Never renumber, never reuse.
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='invites'");
    if (!tables[0]) return;
    const columns = db.exec("PRAGMA table_info(invites)")[0];
    const names = new Set((columns?.values ?? []).map((row) => String(row[1])));
    if (names.has("permission")) return;
    db.exec(`ALTER TABLE invites ADD COLUMN permission TEXT NOT NULL DEFAULT 'member'`);
    // Belt and braces: a default only applies to rows inserted without the column.
    db.exec(`UPDATE invites SET permission = 'member' WHERE permission NOT IN ('admin', 'member')`);
  }
});

SCHEMA_MIGRATIONS.push({
  version: 22,
  name: "a roster row outlives the login that owned it",
  up: (db) => {
    // Removing a teammate must not delete what they did.
    //
    // A tenant `users` row is the person on the crew roster, and four other tables point at it:
    // field_updates.userId and projects.managerId are both NOT NULL, and a field update is the
    // evidence behind every priced variance. Deleting the row to remove someone's access would
    // therefore delete a construction record and leave two NOT NULL columns pointing at nothing --
    // and the client resolves an unknown userId with `?? data.activeUser`, so a dangling id makes
    // the *viewer* appear to be the person who filed the report.
    //
    // So access and history are separated. Removing a teammate deletes their LOGIN (the control
    // db's accounts row, its sessions and its auth tokens) and unlinks the roster row by nulling
    // users.accountId, stamping removedAt. Every name, report and variance still resolves; the
    // person simply cannot sign in and is no longer someone you can book.
    //
    // Nullable, additive, no backfill: every existing row is someone who has not been removed.
    // Numbered 22 -- the runner sorts by version and SILENTLY skips anything at or below the
    // stored user_version (:1170), and SCHEMA_MIGRATIONS already carries two 15s and two 16s from
    // before that was understood. Never renumber, never reuse.
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (!tables[0]) return;
    const columns = db.exec("PRAGMA table_info(users)")[0];
    const names = new Set((columns?.values ?? []).map((row) => String(row[1])));
    if (!names.has("removedAt")) db.exec("ALTER TABLE users ADD COLUMN removedAt TEXT");
  }
});

SCHEMA_MIGRATIONS.push({
  version: 23,
  name: "a person's calendar connection, and its refresh token",
  up: (db) => {
    // The Dashboard's Meetings panel reads Google Calendar and Outlook, which means holding a
    // refresh token per person per provider.
    //
    // IT LIVES IN THE CONTROL DB, keyed by accountId, for two reasons. A calendar belongs to a
    // PERSON and not to a workspace, so a tenant db is the wrong home; and the tenant payload is
    // what `/api/bootstrap` ships to the browser, so a secret stored there would be one fetch
    // away from the client. Nothing in this table is ever serialised into a bootstrap response --
    // the only thing the client is told is which providers are connected and for which mailbox.
    //
    // One row per (accountId, provider): connecting the same provider twice replaces the row
    // rather than accumulating tokens, which is what the PRIMARY KEY is for.
    //
    // Numbered 23 -- the runner sorts by version and SILENTLY skips anything at or below the
    // stored user_version (:1170). Never renumber, never reuse.
    db.exec(`CREATE TABLE IF NOT EXISTS calendar_connections (
      accountId TEXT NOT NULL,
      provider TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      refreshToken TEXT NOT NULL,
      accessToken TEXT NOT NULL DEFAULT '',
      expiresAt INTEGER NOT NULL DEFAULT 0,
      connectedAt TEXT NOT NULL,
      PRIMARY KEY (accountId, provider)
    )`);
  }
});

SCHEMA_MIGRATIONS.push({
  version: 24,
  name: "one login, several workspaces",
  up: (db) => {
    // Asked for on 2026-09-15: a person can run more than one BuildFlow program from one
    // login -- their original workspace plus up to three more, each a separate org with its
    // own data file, trade, team and 7-day trial. `accounts.orgId` had been the whole answer
    // to "which workspace is this login in", so this table is the many-to-many that answers
    // it from now on, and `sessions.orgId` becomes the ACTIVE workspace (switching rewrites
    // it). `accounts.orgId` stays as the home workspace: login lands there, and every path
    // that reads it keeps working.
    //
    // Backfilled from `accounts` so nobody who signed up before this loses their workspace:
    // each existing login becomes the "home" member of its own org. Guarded, because the
    // control tables only exist in the main database and this runner visits every file.
    //
    // Numbered 24 -- the runner sorts by version and silently skips anything at or below the
    // stored user_version (:1170). Never renumber, never reuse.
    db.exec(`CREATE TABLE IF NOT EXISTS workspace_members (
      accountId TEXT NOT NULL,
      orgId TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'extra',
      createdAt TEXT NOT NULL,
      PRIMARY KEY (accountId, orgId)
    )`);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'");
    if (!tables[0]) return;
    db.exec(`INSERT OR IGNORE INTO workspace_members (accountId, orgId, role, kind, createdAt)
             SELECT id, orgId, role, 'home', createdAt FROM accounts`);
  }
});

SCHEMA_MIGRATIONS.push({
  version: 25,
  name: "one role taxonomy: the job titles go",
  up: (db) => {
    // Asked for on 2026-09-19: "remove the Project Manager, Superintendent, Foreman and any
    // other construction roles. New roles would be Workspace Owner, Admin, Member."
    //
    // There were two parallel role systems. `accounts.role` is the permission level, which is
    // what the server has always authorized on. `users.role` (here, on every tenant file) and
    // `invites.role` held a JOB TITLE out of a fixed list of three, which decided nothing and
    // was the only "role" anybody could actually see. The titles are gone, so the columns go
    // with them rather than sitting NOT NULL and meaningless.
    //
    // A person's trade is still recorded where it belongs: `users.title` is free text, and the
    // Time card prices labour by classification. Neither is a role.
    //
    // Guarded per table because this runner visits the control database and every tenant file,
    // and neither has all of these. DROP COLUMN needs SQLite 3.35+; this ships 3.49.
    for (const [table, column] of [
      ["users", "role"],
      ["invites", "role"]
    ]) {
      const present = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
      if (!present[0]) continue;
      const columns = db.exec(`PRAGMA table_info(${table})`);
      const has = columns[0]?.values.some((row) => row[1] === column);
      if (has) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
  }
});

SCHEMA_MIGRATIONS.push({
  version: 26,
  name: "WeatherIQ: job days the weather reaches, and a project's own forecast location",
  up: (db) => {
    // 2026-09-23. `weather_conflicts` is one row per job per day that forecast weather reaches in
    // the job's hours — found each time the forecast is read, and kept so that the person in
    // charge's decision (call it off, or keep it on) sticks when the forecast is read again.
    // `weather_locations` is where an Owner or Admin said a project's forecast should be read,
    // when its address is not the place (or is the placeholder every new project is stored at).
    db.exec(`
      CREATE TABLE IF NOT EXISTS weather_conflicts (
        id TEXT PRIMARY KEY,
        jobId TEXT NOT NULL,
        projectId TEXT NOT NULL,
        date TEXT NOT NULL,
        cause TEXT NOT NULL,
        severity TEXT NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        reason TEXT NOT NULL,
        assigneeId TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        detectedAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        decidedAt TEXT,
        decidedBy TEXT,
        varianceId TEXT,
        delayIQId TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_weather_conflicts_date ON weather_conflicts(date);
      CREATE TABLE IF NOT EXISTS weather_locations (
        projectId TEXT PRIMARY KEY,
        searchText TEXT NOT NULL,
        place TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        updatedAt TEXT NOT NULL,
        updatedBy TEXT NOT NULL
      );
    `);
  }
});

export const LATEST_SCHEMA_VERSION = SCHEMA_MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/**
 * One person's connection to one calendar provider. `refreshToken` is a secret: it never
 * leaves the server, and `calendarConnectionsForAccount` is the only reader.
 */
export interface CalendarConnectionRow {
  accountId: string;
  provider: string;
  email: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  connectedAt: string;
}

export interface SubscriptionRow {
  id: string;
  customerId: string | null;
  email: string | null;
  planId: string | null;
  priceId: string | null;
  period: string | null;
  status: string | null;
  seats: number | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  raw: string | null;
}

/** A re-book that would double-book a crew: nothing was written; the clashes say who is already there. */
/** Why a dependency link was refused: a job pointing at itself, a link that already exists, or one that would close a loop. */
/**
 * The row moved under the writer: what they are replacing is not what they read.
 * Carries the row as it stands now, so the board can say what happened rather than
 * only that something did.
 */
export class StaleWriteError extends Error {
  code = "stale" as const;
  current: Record<string, unknown>;
  constructor(message: string, current: Record<string, unknown>) {
    super(message);
    this.name = "StaleWriteError";
    this.current = current;
  }
}

export class DependencyError extends Error {
  code: "self" | "duplicate" | "cycle";
  constructor(message: string, code: "self" | "duplicate" | "cycle") {
    super(message);
    this.name = "DependencyError";
    this.code = code;
  }
}

export class RebookConflictError extends Error {
  clashes: CrewClash[];
  constructor(clashes: CrewClash[]) {
    super(clashMessage(clashes));
    this.name = "RebookConflictError";
    this.clashes = clashes;
  }
}

/** "Concrete Crew 1 is on Riverside that day" — the first clash, and how many more there are. */
export function clashMessage(clashes: CrewClash[]): string {
  const [first] = clashes;
  if (!first) return "A crew is already booked that day";
  const more = clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : "";
  return `${first.crewName} is on ${first.jobName} that day${more}`;
}

export class BuildFlowStore {
  private seeding = false;

  private constructor(
    private readonly SQL: SqlJsStatic,
    private readonly db: Database,
    private readonly dataFile: string
  ) {}

  static async create(dataFile = defaultDataFile, reset = false, opts: { seedDemo?: boolean } = {}) {
    // seedDemo=true (default) → the main/demo store: full demo data + demo account.
    // seedDemo=false → a fresh tenant's store: schema only, empty workspace.
    const seedDemo = opts.seedDemo ?? true;
    const SQL = await initSqlJs();
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    if (reset && fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
    }

    const fileBuffer = fs.existsSync(dataFile) ? fs.readFileSync(dataFile) : undefined;
    const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
    const store = new BuildFlowStore(SQL, db, dataFile);
    store.migrate();
    if (seedDemo) {
      store.seed();
      if (store.hasStarterWorkspace()) {
        store.ensureReferenceCrewData();
      }
      store.ensureCrewRoleCounts();
      store.seedDemoAccount();
    }
    store.save();
    return store;
  }

  /** While a transaction runs, save() waits for its commit: sql.js's export() closes the database, which would end the transaction. */
  private inTransaction = false;

  private save() {
    if (this.inTransaction) return;
    const data = Buffer.from(this.db.export());
    /**
     * Published atomically, because sql.js has no incremental write: every save re-exports
     * and rewrites the WHOLE file, and there are ~80 call sites, so this runs constantly.
     *
     * Written straight to this.dataFile, that is a truncate followed by a write — which
     * leaves a window, on every single save, where losing the process (a deploy's SIGTERM,
     * an OOM, an uncaught throw) leaves a half-written SQLite file behind. For a tenant
     * store that file is the only copy of their data, and the boot backup would then copy
     * the damage forward.
     *
     * Writing a sibling temp file and renaming over the target closes the window: rename
     * within one directory is atomic, so anything reading the path — the next boot, a
     * backup, another process — sees either the whole old file or the whole new one, never
     * a torn one. The fsync is what makes that promise survive more than a crashed process:
     * it costs a flush per save, which is the right trade against the only copy of a
     * customer's schedule. The temp name carries the pid so two processes pointed at one
     * data directory cannot publish each other's half-written file.
     */
    const tmp = `${this.dataFile}.tmp-${process.pid}`;
    const startedAt = process.hrtime.bigint();
    try {
      const fd = fs.openSync(tmp, "w");
      try {
        fs.writeSync(fd, data);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.dataFile);
      savedFile(this.dataFile);
      // Counted because this is the server's characteristic cost: a whole-file rewrite plus
      // an fsync, per write, everywhere. See metrics.ts.
      metrics.recordSave(data.length, Number(process.hrtime.bigint() - startedAt) / 1e6);
    } catch (error) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* nothing to clean up */
      }
      throw error;
    }
  }

  /**
   * Runs `work` as one SQLite transaction: every write in it lands, or none does, and
   * the file is written once, after the commit. A call from inside a transaction joins it.
   */
  transaction<T>(work: () => T): T {
    if (this.inTransaction) return work();
    this.db.exec("BEGIN");
    this.inTransaction = true;
    let result: T | undefined;
    let committed = false;
    try {
      result = work();
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          /* nothing left to roll back */
        }
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
    this.save();
    return result as T;
  }

  /** A read that proves the database is actually answering — what the health check needs
   *  past "the process is up". Deliberately touches no table, so it stays valid whatever
   *  the schema does next. */
  ping(): boolean {
    return this.get<{ n: number }>("SELECT 1 AS n")?.n === 1;
  }

  /** Absolute path of this store's SQLite file (used to co-locate per-org files). */
  get dataFilePath(): string {
    return this.dataFile;
  }

  /** Write a timestamped snapshot of this store's file into <dataDir>/backups/,
   *  pruning to the newest `retain`. Returns the backup file path. */
  backup(retain = 20): string {
    this.save(); // snapshot the latest in-memory state to disk first
    return BuildFlowStore.backupFile(this.dataFile, retain);
  }

  /**
   * Snapshot a database file that no store has open.
   *
   * For a store that is not loaded, the file on disk IS its current state, so copying it is
   * a complete backup — and the only correct way to take one. Opening it to call backup()
   * would read a whole database into memory, migrate it to the current schema and write it
   * back, which is a modification made as the side effect of taking a backup.
   *
   * Same naming and the same retention as an open store's snapshot, so the restore CLI
   * cannot tell the two apart and neither does anything else.
   */
  static backupFile(file: string, retain = 20): string {
    const dir = path.join(path.dirname(file), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(file, path.extname(file));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(dir, `${base}-${stamp}.sqlite`);
    fs.copyFileSync(file, dest);
    // ISO timestamps sort chronologically — drop all but the newest `retain`.
    const mine = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".sqlite"))
      .sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - Math.max(1, retain)))) {
      try {
        fs.unlinkSync(path.join(dir, old));
      } catch {
        /* best-effort prune */
      }
    }
    return dest;
  }

  /** The newest existing snapshot of `file`, or undefined if it has never been backed up. */
  static newestBackupOf(file: string): string | undefined {
    const dir = path.join(path.dirname(file), "backups");
    if (!fs.existsSync(dir)) return undefined;
    const base = path.basename(file, path.extname(file));
    const mine = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".sqlite"))
      .sort();
    const newest = mine[mine.length - 1];
    return newest ? path.join(dir, newest) : undefined;
  }

  private getUserVersion(): number {
    const res = this.db.exec("PRAGMA user_version");
    const raw = res[0]?.values?.[0]?.[0];
    return typeof raw === "number" ? raw : Number(raw ?? 0);
  }

  /** Apply any SCHEMA_MIGRATIONS newer than this DB's recorded user_version. */
  private runMigrations() {
    let version = this.getUserVersion();
    // Apply in version order regardless of array order: a newer migration
    // listed earlier would otherwise bump user_version past the ones after it
    // and silently skip them on fresh databases.
    const ordered = [...SCHEMA_MIGRATIONS].sort((a, b) => a.version - b.version);
    for (const migration of ordered) {
      if (migration.version <= version) continue;
      migration.up(this.db);
      this.db.exec(`PRAGMA user_version = ${Math.floor(migration.version)}`);
      version = migration.version;
      console.log(`🗄️  DB migrate → v${migration.version} (${migration.name}) [${path.basename(this.dataFile)}]`);
    }
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        title TEXT NOT NULL,
        avatar TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        location TEXT NOT NULL,
        address TEXT NOT NULL,
        type TEXT NOT NULL,
        contractType TEXT NOT NULL,
        managerId TEXT NOT NULL,
        targetCompletion TEXT NOT NULL,
        percentComplete INTEGER NOT NULL,
        scheduleHealth TEXT NOT NULL,
        status TEXT NOT NULL,
        image TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS phases (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        percentComplete INTEGER NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        color TEXT NOT NULL,
        sequence INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        phase TEXT NOT NULL,
        location TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        requiredLabor INTEGER NOT NULL,
        requiredEquipment TEXT NOT NULL,
        materialsStatus TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        notes TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crews (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        lead TEXT NOT NULL,
        size INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        utilization INTEGER NOT NULL,
        icon TEXT NOT NULL,
        status TEXT NOT NULL,
        rate REAL
      );

      CREATE TABLE IF NOT EXISTS crew_role_counts (
        id TEXT PRIMARY KEY,
        crewId TEXT NOT NULL,
        category TEXT NOT NULL,
        role TEXT NOT NULL,
        count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS equipment (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        assignedTo TEXT
      );

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        deliveryDate TEXT NOT NULL,
        quantity TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        jobId TEXT NOT NULL,
        crewId TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        conflicts TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS field_updates (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        jobId TEXT,
        userId TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        photos TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS delayIQs (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        impactDays INTEGER NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        reportedAt TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS readiness (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        label TEXT NOT NULL,
        complete INTEGER NOT NULL,
        dueDate TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        title TEXT NOT NULL,
        scheduledAt TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weather_alerts (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        title TEXT NOT NULL,
        details TEXT NOT NULL,
        severity TEXT NOT NULL,
        startsAt TEXT NOT NULL
      );

      /* waitlist (removable feature): pre-launch email signups */
      CREATE TABLE IF NOT EXISTS waitlist (
        email TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL,
        notifiedAt TEXT
      );

      /* changelog subscribers: "Subscribe" on the Updates page. Kept separate
         from the waitlist table above - one is "tell me when you launch", the
         other is "email me each release", and they send different mail.
         (No backticks in here: this whole block is a template literal.) */
      CREATE TABLE IF NOT EXISTS update_subscribers (
        email TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL
      );

      /* ── Sales & Customer-Service Desk ───────────────────────────────────────
         Backed the standalone Sales & Support Desk console, which left the repo on
         2026-09-23. The tables stay so existing rows are kept, and sales_leads still
         takes every contact-sales lead. Additive tables, kept out of clearWorkspace()
         so this cross-cutting staff data survives an onboarding reset. */
      CREATE TABLE IF NOT EXISTS sales_leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL,
        teamSize TEXT NOT NULL DEFAULT '',
        interest TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        owner TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        lastActivityAt TEXT
      );

      CREATE TABLE IF NOT EXISTS sales_tasks (
        id TEXT PRIMARY KEY,
        leadId TEXT,
        title TEXT NOT NULL,
        dueAt TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        department TEXT NOT NULL DEFAULT 'sales',
        createdAt TEXT NOT NULL,
        assignee TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'Normal',
        notes TEXT NOT NULL DEFAULT ''
      );

      /* Meetings a rep schedules with a contact from the Contacts page; the
         client is notified by email (with an .ics) and, when Twilio is set, SMS. */
      CREATE TABLE IF NOT EXISTS sales_meetings (
        id TEXT PRIMARY KEY,
        leadId TEXT NOT NULL,
        title TEXT NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        agenda TEXT NOT NULL DEFAULT '',
        organizer TEXT NOT NULL DEFAULT '',
        notifiedVia TEXT NOT NULL DEFAULT 'none',
        createdAt TEXT NOT NULL
      );

      /* Companies + Deals (the Sales hub's other two pages). Companies link to
         contacts by name (sales_leads.company); deals link to a company and a
         contact by id. Seeded from the leads by seedSalesCompaniesAndDeals(). */
      CREATE TABLE IF NOT EXISTS sales_companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT '',
        industry TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        lastActivityAt TEXT
      );

      CREATE TABLE IF NOT EXISTS sales_deals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'Appointment scheduled',
        amount INTEGER NOT NULL DEFAULT 0,
        closeDate TEXT NOT NULL DEFAULT '',
        companyId TEXT,
        leadId TEXT,
        owner TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'Medium',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        lastActivityAt TEXT
      );

      CREATE TABLE IF NOT EXISTS sales_activities (
        id TEXT PRIMARY KEY,
        leadId TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS support_conversations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT 'support',
        createdAt TEXT NOT NULL,
        lastMessageAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      /* Customer Support team roster — the owner/admin adds teammates here. */
      CREATE TABLE IF NOT EXISTS support_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      /* billing: Stripe subscriptions, keyed by Stripe subscription id. Written
         by the /api/billing/webhook handler; stays empty until Stripe is
         connected. Attach these to real orgs/users here once the app has auth. */
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        customerId TEXT,
        email TEXT,
        planId TEXT,
        priceId TEXT,
        period TEXT,
        status TEXT,
        seats INTEGER,
        currentPeriodEnd TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        raw TEXT
      );

      -- Authentication (global, main store only): orgs = tenants, accounts =
      -- login identities (distinct from the demo "users" team-member table),
      -- sessions = opaque login tokens. See auth.ts + stores.ts.
      CREATE TABLE IF NOT EXISTS orgs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        orgId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );
    `);

    // Apply forward-versioned migrations on top of the baseline schema above.
    this.runMigrations();
  }

  private seed() {
    const count = this.get<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count ?? 0;
    if (count > 0) return;

    const users: User[] = [
      { id: "u-matt", name: "Matt Johnson", title: "Teammate", avatar: "MJ" },
      { id: "u-jessica", name: "Jessica Lee", title: "Teammate", avatar: "JL" },
      { id: "u-carlos", name: "Carlos Ramirez", title: "Teammate", avatar: "CR" }
    ];

    const projects: Project[] = [
      {
        id: "p-riverside",
        name: "Riverside Office Building",
        slug: "riverside-office",
        location: "Downtown, Austin, TX",
        address: "123 Riverfront Blvd, Austin, TX 78701",
        type: "Commercial",
        contractType: "Fixed Price",
        managerId: "u-matt",
        targetCompletion: "2026-09-04",
        percentComplete: 62,
        value: 8600000,
        scheduleHealth: "On Track",
        status: "In Progress",
        image: "office-building",
        latitude: 30.2672,
        longitude: -97.7431
      },
      {
        id: "p-harborview",
        name: "Harborview Apartments",
        slug: "harborview-apartments",
        location: "Harbor District, Austin, TX",
        address: "2100 E 5th St, Austin, TX 78702",
        type: "Multifamily",
        contractType: "GMP",
        managerId: "u-jessica",
        targetCompletion: "2026-10-15",
        percentComplete: 48,
        value: 4200000,
        scheduleHealth: "On Track",
        status: "In Progress",
        image: "apartments",
        latitude: 30.2633,
        longitude: -97.7167
      },
      {
        id: "p-pinecrest",
        name: "Pinecrest Medical Center",
        slug: "pinecrest-medical",
        location: "North Austin, TX",
        address: "4800 Seton Center Pkwy, Austin, TX 78759",
        type: "Healthcare",
        contractType: "Cost Plus",
        managerId: "u-matt",
        targetCompletion: "2026-11-20",
        percentComplete: 35,
        value: 12400000,
        scheduleHealth: "At Risk",
        status: "DelayIQed",
        image: "medical-center",
        latitude: 30.4011,
        longitude: -97.7479
      },
      {
        id: "p-logistics",
        name: "Logistics Warehouse",
        slug: "logistics-warehouse",
        location: "Kyle, TX",
        address: "6201 McKinney Falls Pkwy, Austin, TX 78744",
        type: "Industrial",
        contractType: "Fixed Price",
        managerId: "u-jessica",
        targetCompletion: "2026-08-21",
        percentComplete: 0,
        value: 6800000,
        scheduleHealth: "Monitor",
        status: "Ready to Start",
        image: "warehouse",
        latitude: 30.1837,
        longitude: -97.7211
      },
      {
        id: "p-techridge",
        name: "Tech Ridge Parking Garage",
        slug: "tech-ridge-garage",
        location: "Tech Ridge, Austin, TX",
        address: "9100 Research Blvd, Austin, TX 78758",
        type: "Commercial",
        contractType: "Design Build",
        managerId: "u-matt",
        targetCompletion: "2026-07-30",
        percentComplete: 100,
        value: 3100000,
        scheduleHealth: "Complete",
        status: "Complete",
        image: "parking-garage",
        latitude: 30.3749,
        longitude: -97.7137
      }
    ];

    const phases: Phase[] = [
      ["preconstruction", "Preconstruction", "On Track", 100, "2026-05-11", "2026-06-01", "#16a34a"],
      ["permits", "Permits", "On Track", 100, "2026-05-25", "2026-06-08", "#16a34a"],
      ["site-prep", "Site Prep", "On Track", 100, "2026-06-02", "2026-06-22", "#16a34a"],
      ["foundation", "Foundation", "At Risk", 78, "2026-06-17", "2026-07-14", "#1976d2"],
      ["framing", "Framing", "On Track", 45, "2026-07-07", "2026-08-04", "#1976d2"],
      ["rough-in", "MEP Rough-In", "On Track", 30, "2026-07-29", "2026-08-24", "#7c3aed"],
      ["inspections", "Inspections", "At Risk", 0, "2026-08-22", "2026-09-04", "#f59e0b"],
      ["finishes", "Finishes", "Not Started", 0, "2026-09-01", "2026-09-22", "#fb8500"],
      ["punch", "Punch List", "DelayIQed", 0, "2026-09-18", "2026-09-28", "#ef4444"],
      ["closeout", "Closeout", "DelayIQed", 0, "2026-09-24", "2026-10-05", "#ef4444"]
    ].map(([key, name, status, percentComplete, startDate, endDate, color], index) => ({
      id: `phase-riverside-${key}`,
      projectId: "p-riverside",
      name: String(name),
      status: status as Phase["status"],
      percentComplete: Number(percentComplete),
      startDate: String(startDate),
      endDate: String(endDate),
      color: String(color),
      sequence: index + 1
    }));

    const jobs: Job[] = [
      {
        id: "j-riverside-concrete",
        projectId: "p-riverside",
        name: "Riverside Office Building",
        phase: "Concrete - Level 3 Slab",
        location: "Downtown, Austin",
        startDate: "2026-06-15",
        endDate: "2026-06-17",
        startTime: "7:00 AM",
        endTime: "3:30 PM",
        requiredLabor: 8,
        requiredEquipment: "Concrete Pump",
        materialsStatus: "Delivered",
        status: "Confirmed",
        priority: "High",
        notes: "Slab pour and foundation tie-ins.",
        percentComplete: 0
      },
      {
        id: "j-harborview-framing",
        projectId: "p-harborview",
        name: "Harborview Apartments",
        phase: "Framing - Levels 2-4",
        location: "East Austin",
        startDate: "2026-06-16",
        endDate: "2026-06-20",
        startTime: "7:00 AM",
        endTime: "3:00 PM",
        requiredLabor: 6,
        requiredEquipment: "Boom Lift",
        materialsStatus: "Delivered",
        status: "On Site",
        priority: "High",
        notes: "Exterior wall framing and podium connectors.",
        percentComplete: 55,
        actualStart: "2026-06-16"
      },
      {
        id: "j-pinecrest-foundation",
        projectId: "p-pinecrest",
        name: "Pinecrest Medical Center",
        phase: "Concrete - Foundation",
        location: "North Austin",
        startDate: "2026-06-17",
        endDate: "2026-06-18",
        startTime: "7:00 AM",
        endTime: "3:30 PM",
        requiredLabor: 10,
        requiredEquipment: "Excavator",
        materialsStatus: "Missing",
        status: "DelayIQed",
        priority: "High",
        notes: "Rebar delivery is behind schedule.",
        percentComplete: 20,
        actualStart: "2026-06-17"
      },
      {
        id: "j-logistics-site",
        projectId: "p-logistics",
        name: "Logistics Warehouse",
        phase: "Site Utilities",
        location: "South Austin",
        startDate: "2026-06-18",
        endDate: "2026-06-19",
        startTime: "9:00 AM",
        endTime: "3:00 PM",
        requiredLabor: 5,
        requiredEquipment: "Utility Truck",
        materialsStatus: "Ordered",
        status: "Ready to Start",
        priority: "Medium",
        notes: "Stage utility crew after locates are confirmed.",
        percentComplete: 0
      },
      {
        id: "j-techridge-paving",
        projectId: "p-techridge",
        name: "Tech Ridge Parking Garage",
        phase: "Paving - Top Deck",
        location: "Tech Ridge",
        startDate: "2026-06-19",
        endDate: "2026-06-19",
        startTime: "7:00 AM",
        endTime: "3:00 PM",
        requiredLabor: 6,
        requiredEquipment: "Paver",
        materialsStatus: "Delivered",
        status: "Ready",
        priority: "Normal",
        notes: "Final striping prep after paving cure window.",
        percentComplete: 0
      },
      {
        id: "j-steelyard-conduit",
        projectId: "p-riverside",
        name: "Steel Yard Expansion",
        phase: "Underground Conduit",
        location: "East Austin",
        startDate: "2026-06-19",
        endDate: "2026-06-20",
        startTime: "7:00 AM",
        endTime: "3:00 PM",
        requiredLabor: 5,
        requiredEquipment: "Utility Truck",
        materialsStatus: "Waiting on Delivery",
        status: "DelayIQed",
        priority: "Medium",
        notes: "Conduit reels are pending.",
        percentComplete: 15,
        actualStart: "2026-06-19"
      },
      {
        id: "j-downtown-retail",
        projectId: "p-riverside",
        name: "Downtown Retail Buildout",
        phase: "Interior Finishes",
        location: "Downtown, Austin",
        startDate: "2026-06-16",
        endDate: "2026-06-17",
        startTime: "8:00 AM",
        endTime: "2:00 PM",
        requiredLabor: 4,
        requiredEquipment: "Scissor Lift",
        materialsStatus: "Delivered",
        status: "Planned",
        priority: "Normal",
        notes: "Tenant improvement finish package.",
        percentComplete: 0
      },
      {
        id: "j-riverwalk-framing",
        projectId: "p-harborview",
        name: "Riverwalk Apartments",
        phase: "Framing - Level 5",
        location: "Riverside",
        startDate: "2026-06-22",
        endDate: "2026-06-23",
        startTime: "7:00 AM",
        endTime: "3:00 PM",
        requiredLabor: 6,
        requiredEquipment: "Boom Lift",
        materialsStatus: "Delivered",
        status: "Planned",
        priority: "Normal",
        notes: "Follow-on framing package.",
        percentComplete: 0
      },
      {
        id: "j-pinecrest-mep",
        projectId: "p-pinecrest",
        name: "Pinecrest Medical Center",
        phase: "MEP Rough-In",
        location: "North Austin",
        startDate: "2026-06-20",
        endDate: "2026-06-21",
        startTime: "7:30 AM",
        endTime: "3:30 PM",
        requiredLabor: 7,
        requiredEquipment: "Scissor Lift",
        materialsStatus: "Delivered",
        status: "Planned",
        priority: "High",
        notes: "Coordinate rough-in before inspection window.",
        percentComplete: 0
      }
    ];

    const crews: CrewRow[] = [
      {
        id: "crew-concrete",
        name: "Concrete Crew 1",
        specialty: "Concrete",
        lead: "Mike Johnson",
        size: 8,
        capacity: 40,
        utilization: 80,
        icon: "cement-truck",
        status: "Scheduled"
      },
      {
        id: "crew-framing",
        name: "Framing Crew 2",
        specialty: "Framing",
        lead: "Carlos Ramirez",
        size: 6,
        capacity: 40,
        utilization: 75,
        icon: "frame",
        status: "Scheduled"
      },
      {
        id: "crew-utility",
        name: "Utility Crew 3",
        specialty: "Utilities",
        lead: "Jessica Lee",
        size: 5,
        capacity: 32,
        utilization: 60,
        icon: "pipe",
        status: "Available"
      },
      {
        id: "crew-paving",
        name: "Paving Crew 4",
        specialty: "Paving",
        lead: "Sam Patel",
        size: 4,
        capacity: 32,
        utilization: 50,
        icon: "road",
        status: "Available"
      },
      {
        id: "crew-mep",
        name: "MEP Crew 5",
        specialty: "Mechanical / Electrical",
        lead: "Priya Patel",
        size: 7,
        capacity: 40,
        utilization: 88,
        icon: "wrench",
        status: "Scheduled"
      },
      {
        id: "crew-finish",
        name: "Finish Crew 6",
        specialty: "Finishes",
        lead: "Anthony Russo",
        size: 5,
        capacity: 32,
        utilization: 42,
        icon: "paint",
        status: "Available"
      }
    ];

    const equipment: Equipment[] = [
      { id: "eq-crane", name: "Tower Crane #2", type: "Crane", status: "In Use", assignedTo: "p-harborview" },
      { id: "eq-lift", name: "Boom Lift #4", type: "Lift", status: "In Use", assignedTo: "p-harborview" },
      { id: "eq-pump", name: "Concrete Pump #2", type: "Pump", status: "In Use", assignedTo: "p-riverside" },
      { id: "eq-excavator", name: "Excavator 320", type: "Excavator", status: "Maintenance", assignedTo: "p-pinecrest" },
      { id: "eq-scissor-lift", name: "Scissor Lift #6", type: "Lift", status: "In Use", assignedTo: "p-pinecrest" },
      { id: "eq-truck", name: "Utility Truck #8", type: "Truck", status: "Available" }
    ];

    const materials: Material[] = [
      {
        id: "mat-rebar",
        projectId: "p-pinecrest",
        name: "Rebar Package",
        status: "Waiting on Delivery",
        deliveryDate: "2026-06-24",
        quantity: "14 tons"
      },
      {
        id: "mat-concrete",
        projectId: "p-riverside",
        name: "Ready Mix Concrete",
        status: "Ready",
        deliveryDate: "2026-06-16",
        quantity: "120 yd3"
      },
      {
        id: "mat-steel",
        projectId: "p-harborview",
        name: "Wall Framing Steel",
        status: "Ready",
        deliveryDate: "2026-06-14",
        quantity: "34 bundles"
      },
      {
        id: "mat-conduit",
        projectId: "p-riverside",
        name: "Electrical Conduit",
        status: "Missing",
        deliveryDate: "2026-06-21",
        quantity: "900 ft"
      },
      {
        id: "mat-asphalt",
        projectId: "p-techridge",
        name: "Asphalt Surface Mix",
        status: "Ordered",
        deliveryDate: "2026-06-19",
        quantity: "64 tons"
      }
    ];

    const assignments: ScheduleAssignment[] = [
      { id: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15", status: "Confirmed", conflicts: [] },
      { id: "as-2", jobId: "j-harborview-framing", crewId: "crew-framing", date: "2026-06-16", status: "Confirmed", conflicts: [] },
      { id: "as-3", jobId: "j-harborview-framing", crewId: "crew-framing", date: "2026-06-17", status: "Confirmed", conflicts: [] },
      {
        id: "as-4",
        jobId: "j-pinecrest-foundation",
        crewId: "crew-concrete",
        date: "2026-06-19",
        status: "DelayIQed",
        conflicts: ["Missing materials"]
      },
      { id: "as-5", jobId: "j-logistics-site", crewId: "crew-utility", date: "2026-06-18", status: "Ready", conflicts: [] },
      { id: "as-6", jobId: "j-techridge-paving", crewId: "crew-paving", date: "2026-06-19", status: "Ready", conflicts: [] },
      {
        id: "as-7",
        jobId: "j-steelyard-conduit",
        crewId: "crew-utility",
        date: "2026-06-19",
        status: "DelayIQed",
        conflicts: ["Missing materials"]
      },
      { id: "as-8", jobId: "j-pinecrest-mep", crewId: "crew-mep", date: "2026-06-20", status: "Planned", conflicts: [] }
    ];

    const fieldUpdates: FieldUpdate[] = [
      {
        id: "fu-1",
        projectId: "p-harborview",
        jobId: "j-harborview-framing",
        userId: "u-carlos",
        message: "Steel framing installation progressing on Level 4. All material on site.",
        status: "On Site",
        createdAt: "2026-06-16T09:18:00.000Z",
        photos: ["steel-frame", "jobsite", "crane"]
      },
      {
        id: "fu-2",
        projectId: "p-pinecrest",
        jobId: "j-pinecrest-foundation",
        userId: "u-jessica",
        message: "Waiting on MEP rough-in inspection. Inspector running behind.",
        status: "DelayIQed",
        createdAt: "2026-06-16T08:45:00.000Z",
        photos: []
      },
      {
        id: "fu-3",
        projectId: "p-logistics",
        jobId: "j-logistics-site",
        userId: "u-matt",
        message: "Crew on site and staging materials. Ready to begin at 9:00 AM.",
        status: "Ready to Start",
        createdAt: "2026-06-16T08:02:00.000Z",
        photos: []
      }
    ];

    const delayIQs: DelayIQ[] = [
      {
        id: "delayIQ-rain",
        projectId: "p-riverside",
        category: "Weather",
        title: "Heavy Rain DelayIQ",
        impactDays: 4,
        severity: "Medium",
        status: "Monitoring",
        reportedAt: "2026-06-12",
        description: "Site prep and foundation activities slowed by rain."
      },
      {
        id: "delayIQ-rebar",
        projectId: "p-pinecrest",
        category: "Material shortage",
        title: "Rebar Material Shortage",
        impactDays: 6,
        severity: "High",
        status: "Open",
        reportedAt: "2026-06-14",
        description: "Foundation and MEP rough-in cannot proceed until rebar arrives."
      },
      {
        id: "delayIQ-inspection",
        projectId: "p-pinecrest",
        category: "Inspection delayIQ",
        title: "MEP Inspection DelayIQ",
        impactDays: 2,
        severity: "Medium",
        status: "Open",
        reportedAt: "2026-06-16",
        description: "Inspector availability pushed rough-in signoff."
      }
    ];

    const readiness: ReadinessItem[] = [
      { id: "ready-1", projectId: "p-riverside", label: "Contract Signed", complete: true, dueDate: "2026-03-12" },
      { id: "ready-2", projectId: "p-riverside", label: "Permit Approved", complete: true, dueDate: "2026-05-02" },
      { id: "ready-3", projectId: "p-riverside", label: "Materials Ordered", complete: true, dueDate: "2026-05-06" },
      { id: "ready-4", projectId: "p-riverside", label: "Materials Delivered", complete: false, dueDate: "Pending" },
      { id: "ready-5", projectId: "p-riverside", label: "Site Access Confirmed", complete: true, dueDate: "2026-05-08" },
      { id: "ready-6", projectId: "p-riverside", label: "Utility Locates Complete", complete: false, dueDate: "Pending" },
      { id: "ready-7", projectId: "p-riverside", label: "Subcontractors Confirmed", complete: true, dueDate: "2026-05-09" }
    ];

    const inspections: Inspection[] = [
      {
        id: "insp-1",
        projectId: "p-riverside",
        title: "Foundation Inspection",
        scheduledAt: "2026-06-23T10:00:00.000Z",
        status: "Upcoming"
      },
      { id: "insp-2", projectId: "p-harborview", title: "Framing Inspection", scheduledAt: "2026-06-20T10:00:00.000Z", status: "Upcoming" },
      {
        id: "insp-3",
        projectId: "p-pinecrest",
        title: "MEP Rough-In Inspection",
        scheduledAt: "2026-07-18T10:00:00.000Z",
        status: "Upcoming"
      },
      { id: "insp-4", projectId: "p-riverside", title: "Substantial Completion", scheduledAt: "2026-09-04T15:00:00.000Z", status: "Ready" }
    ];

    const weatherAlerts: WeatherAlert[] = [
      {
        id: "wa-1",
        projectId: "p-riverside",
        title: "Heavy rain expected",
        details: "1.25-2.00 in of rain with wind gusts up to 30 mph.",
        severity: "Medium",
        startsAt: "2026-06-18T12:00:00.000Z"
      }
    ];

    /* ── CPM network ──────────────────────────────────────────────────────
       Real precedence logic over the seeded plan, chosen so the forward pass
       reproduces the planned dates exactly (each link below is driving). The
       three network roots carry a Start-No-Earlier-Than so CPM anchors them to
       their planned start instead of collapsing everything to day zero. */
    const CPM_ROOT_STARTS: Record<string, string> = {
      "j-riverside-concrete": "2026-06-15",
      "j-harborview-framing": "2026-06-16",
      "j-pinecrest-foundation": "2026-06-17"
    };

    const dependencies: JobDependency[] = [
      // slab finishes, site utilities follow
      { id: "dep-slab-utilities", predecessorId: "j-riverside-concrete", successorId: "j-logistics-site", type: "FS", lagDays: 0 },
      // interior fit-out trails the slab by a day
      { id: "dep-slab-interiors", predecessorId: "j-riverside-concrete", successorId: "j-downtown-retail", type: "SS", lagDays: 1 },
      // conduit waits a day after the slab for access
      { id: "dep-slab-conduit", predecessorId: "j-riverside-concrete", successorId: "j-steelyard-conduit", type: "FS", lagDays: 1 },
      // paving starts a day into the utilities work
      { id: "dep-utilities-paving", predecessorId: "j-logistics-site", successorId: "j-techridge-paving", type: "SS", lagDays: 1 },
      // concrete cure day before MEP rough-in
      { id: "dep-foundation-mep", predecessorId: "j-pinecrest-foundation", successorId: "j-pinecrest-mep", type: "FS", lagDays: 1 },
      // the framing crew rolls straight from Harborview onto Riverwalk. Lag 0 on a
      // working-day calendar already means "the next working day" — Harborview
      // finishes Saturday, so Riverwalk picks up Monday without a lag day.
      { id: "dep-framing-crew", predecessorId: "j-harborview-framing", successorId: "j-riverwalk-framing", type: "FS", lagDays: 0 }
    ];

    this.seeding = true;
    users.forEach((item) => this.insert("users", item));
    projects.forEach((item) => this.insert("projects", item));
    phases.forEach((item) => this.insert("phases", item));
    jobs.forEach((item) =>
      this.insert("jobs", {
        ...item,
        constraintType: CPM_ROOT_STARTS[item.id] ? "SNET" : null,
        constraintDate: CPM_ROOT_STARTS[item.id] ?? null,
        // baseline the plan as seeded, so variance starts at zero and any
        // re-plan (a drag, a delayIQ) is measured against the original intent
        baselineStart: item.startDate,
        baselineEnd: item.endDate
      })
    );
    dependencies.forEach((item) => this.insert("job_dependencies", item));
    crews.forEach((item) => this.insert("crews", item));
    equipment.forEach((item) => this.insert("equipment", item));
    materials.forEach((item) => this.insert("materials", item));
    assignments.forEach((item) => this.insert("assignments", { ...item, conflicts: JSON.stringify(item.conflicts) }));
    fieldUpdates.forEach((item) =>
      this.insert("field_updates", {
        ...item,
        photos: JSON.stringify(item.photos),
        percentComplete: item.percentComplete ?? null
      })
    );
    delayIQs.forEach((item) => this.insert("delayIQs", item));
    readiness.forEach((item) => this.insert("readiness", { ...item, complete: item.complete ? 1 : 0 }));
    inspections.forEach((item) => this.insert("inspections", item));
    weatherAlerts.forEach((item) => this.insert("weather_alerts", item));
    this.seeding = false;
  }

  private ensureReferenceCrewData() {
    this.seeding = true;
    const referenceCrews: CrewRow[] = [
      {
        id: "crew-mep",
        name: "MEP Crew 5",
        specialty: "Mechanical / Electrical",
        lead: "Priya Patel",
        size: 7,
        capacity: 40,
        utilization: 88,
        icon: "wrench",
        status: "Scheduled"
      },
      {
        id: "crew-finish",
        name: "Finish Crew 6",
        specialty: "Finishes",
        lead: "Anthony Russo",
        size: 5,
        capacity: 32,
        utilization: 42,
        icon: "paint",
        status: "Available"
      }
    ];
    referenceCrews.forEach((crew) => {
      if (!this.get<CrewRow>("SELECT * FROM crews WHERE id = ?", [crew.id])) {
        this.insert("crews", crew);
      }
    });

    const referenceEquipment: Equipment[] = [
      { id: "eq-scissor-lift", name: "Scissor Lift #6", type: "Lift", status: "In Use", assignedTo: "p-pinecrest" }
    ];
    referenceEquipment.forEach((equipment) => {
      if (!this.get<Equipment>("SELECT * FROM equipment WHERE id = ?", [equipment.id])) {
        this.insert("equipment", equipment);
      }
    });

    const referenceJobs: Job[] = [
      {
        id: "j-pinecrest-mep",
        projectId: "p-pinecrest",
        name: "Pinecrest Medical Center",
        phase: "MEP Rough-In",
        location: "North Austin",
        startDate: "2026-06-20",
        endDate: "2026-06-21",
        startTime: "7:30 AM",
        endTime: "3:30 PM",
        requiredLabor: 7,
        requiredEquipment: "Scissor Lift",
        materialsStatus: "Delivered",
        status: "Planned",
        priority: "High",
        notes: "Coordinate rough-in before inspection window.",
        percentComplete: 0
      }
    ];
    referenceJobs.forEach((job) => {
      if (!this.get<Job>("SELECT * FROM jobs WHERE id = ?", [job.id])) {
        this.insert("jobs", job);
      }
    });

    const referenceAssignments: ScheduleAssignment[] = [
      { id: "as-8", jobId: "j-pinecrest-mep", crewId: "crew-mep", date: "2026-06-20", status: "Planned", conflicts: [] }
    ];
    referenceAssignments.forEach((assignment) => {
      if (!this.get<AssignmentRow>("SELECT * FROM assignments WHERE id = ?", [assignment.id])) {
        this.insert("assignments", { ...assignment, conflicts: JSON.stringify(assignment.conflicts) });
      }
    });
    this.seeding = false;
  }

  private hasStarterWorkspace() {
    return Boolean(this.get<Project>("SELECT * FROM projects WHERE id = ?", ["p-riverside"]));
  }

  private clearWorkspace() {
    [
      "weather_conflicts",
      "weather_locations",
      "weather_alerts",
      "inspections",
      "readiness",
      "delayIQs",
      "schedule_variances",
      "field_updates",
      "assignments",
      "job_dependencies",
      "materials",
      "equipment",
      "crew_role_counts",
      "crews",
      "jobs",
      "phases",
      "projects"
    ].forEach((table) => this.run(`DELETE FROM ${table}`));
    /* Seeded/sample people go; anyone linked to a login account stays -- and so does anyone whose
       login was REMOVED. `accountId IS NULL` alone could not tell those two apart, so reseeding a
       workspace silently deleted the roster rows that migration 22 exists to preserve, taking the
       named author of every field report and variance with them. Reachable from
       POST /api/business-profile whenever the workspace has no projects. */
    this.run("DELETE FROM users WHERE accountId IS NULL AND removedAt IS NULL");
  }

  private insertBootstrapPayload(payload: BootstrapPayload) {
    payload.users.forEach(({ isSample, accountId, ...item }) =>
      this.insert("users", { ...item, accountId: accountId ?? null, isSample: isSample === false ? 0 : 1 })
    );
    payload.projects.forEach((item) => this.insert("projects", item));
    payload.phases.forEach((item) => this.insert("phases", item));
    payload.jobs.forEach((item) => this.insert("jobs", item));
    payload.crews.forEach((item) => {
      const { laborMix, ...crewRow } = item;
      this.insert("crews", crewRow);
      this.insertCrewRoleCounts(item.id, laborMix);
    });
    payload.equipment.forEach((item) => this.insert("equipment", { ...item, assignedTo: item.assignedTo ?? null }));
    payload.materials.forEach((item) => this.insert("materials", item));
    payload.assignments.forEach((item) => this.insert("assignments", { ...item, conflicts: JSON.stringify(item.conflicts) }));
    // The dependency network has to ride along or the restored workspace has no
    // CPM edges — every job looks independent and the variance ripple goes quiet.
    payload.dependencies?.forEach((item) => this.insert("job_dependencies", item));
    payload.fieldUpdates.forEach((item) =>
      this.insert("field_updates", {
        ...item,
        jobId: item.jobId ?? null,
        photos: JSON.stringify(item.photos),
        percentComplete: item.percentComplete ?? null
      })
    );
    payload.variances?.forEach((item) =>
      this.insert("schedule_variances", {
        ...item,
        proposal: JSON.stringify(item.proposal),
        resolvedAt: item.resolvedAt ?? null,
        resolvedBy: item.resolvedBy ?? null,
        resolutionNote: item.resolutionNote ?? null
      })
    );
    payload.delayIQs.forEach((item) => this.insert("delayIQs", item));
    payload.readiness.forEach((item) => this.insert("readiness", { ...item, complete: item.complete ? 1 : 0 }));
    payload.inspections.forEach((item) => this.insert("inspections", item));
    payload.weatherAlerts.forEach((item) => this.insert("weather_alerts", item));
  }

  private ensureCrewRoleCounts() {
    const defaultMixes: Record<string, CrewLaborMixItem[]> = {
      "crew-concrete": [
        { category: "Labor", role: "Finishers", count: 4 },
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Pump Operator", count: 1 }
      ],
      "crew-framing": [
        { category: "Labor", role: "Framers", count: 3 },
        { category: "Labor", role: "Laborer", count: 1 },
        { category: "Operator", role: "Lift Operator", count: 1 }
      ],
      "crew-utility": [
        { category: "Labor", role: "Utility Laborers", count: 2 },
        { category: "Labor", role: "Pipe Layer", count: 1 },
        { category: "Operator", role: "Excavator Operator", count: 1 }
      ],
      "crew-paving": [
        { category: "Labor", role: "Paving Laborers", count: 2 },
        { category: "Operator", role: "Roller Operator", count: 1 }
      ],
      "crew-mep": [
        { category: "Labor", role: "Electricians", count: 3 },
        { category: "Labor", role: "Pipefitters", count: 2 },
        { category: "Operator", role: "Lift Operator", count: 1 }
      ],
      "crew-finish": [
        { category: "Labor", role: "Finish Carpenters", count: 2 },
        { category: "Labor", role: "Painters", count: 2 }
      ]
    };

    this.all<CrewRow>("SELECT * FROM crews").forEach((crew) => {
      const existingCount =
        this.get<{ count: number }>("SELECT COUNT(*) AS count FROM crew_role_counts WHERE crewId = ?", [crew.id])?.count ?? 0;
      if (existingCount > 0) return;

      const fallbackCount = Math.max(crew.size - 1, 1);
      const mix = defaultMixes[crew.id] ?? [{ category: "Labor", role: "General Labor", count: fallbackCount }];
      this.insertCrewRoleCounts(crew.id, mix);
    });
  }

  // Whole-week offset moving the seed's primary week (Mon 2026-06-15) onto the
  // current week, so the demo always opens on the current day & month with data.
  private seedShiftDays(): number {
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = new Date(todayUtc).getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const currentMonday = todayUtc + mondayOffset * 86_400_000;
    return Math.round((currentMonday - SEED_ANCHOR_MONDAY) / 86_400_000);
  }

  private insert(table: string, values: Record<string, unknown>) {
    if (this.seeding) {
      const dateFields = SEED_DATE_FIELDS[table];
      if (dateFields) {
        const days = this.seedShiftDays();
        if (days !== 0) {
          const shifted: Record<string, unknown> = { ...values };
          // Only shift fields the row actually carries. Assigning unconditionally
          // would materialise the key on rows that omit it (an optional date like
          // actualStart), and the binder would then try to bind `undefined`.
          for (const field of dateFields) {
            if (field in shifted) shifted[field] = shiftSeedDate(shifted[field], days);
          }
          values = shifted;
        }
      }
    }
    const keys = Object.keys(values);
    const placeholders = keys.map(() => "?").join(", ");
    this.run(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
      keys.map((key) => values[key] as Primitive)
    );
  }

  private insertCrewRoleCounts(crewId: string, laborMix: CrewLaborMixItem[]) {
    laborMix.forEach((item, index) => {
      this.insert("crew_role_counts", {
        id: `${crewId}-role-${Date.now()}-${index}`,
        crewId,
        category: item.category,
        role: item.role,
        count: item.count
      });
    });
  }

  private uniqueProjectSlug(name: string) {
    const baseSlug = slugify(name, "project");
    let slug = baseSlug;
    let suffix = 2;
    while (this.get<Project>("SELECT * FROM projects WHERE slug = ?", [slug])) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  all<T>(sql: string, params: Primitive[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  get<T>(sql: string, params: Primitive[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params: Primitive[] = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    stmt.run();
    stmt.free();
  }

  /** Persist the in-memory database to disk. Batch writers (the schedule repository) call this once per transaction. */
  flush() {
    this.save();
  }

  /* ── authentication: orgs, accounts, sessions ─────────────────────────────
     Global to the MAIN store (auth is not per-tenant). Passwords are scrypt-
     hashed via auth.ts; sessions are opaque tokens. Per-tenant DATA isolation
     is handled separately in stores.ts (database-per-org). */
  createOrg(name: string, plan = "Free"): Org {
    const org: Org = { id: newId("org"), name: name.trim() || "My Company", plan, createdAt: new Date().toISOString() };
    this.insert("orgs", org);
    this.save();
    return org;
  }

  getOrg(id: string): Org | undefined {
    return this.get<Org>("SELECT * FROM orgs WHERE id = ?", [id]);
  }

  /** Every registered workspace. The `orgs` table is the registry; a tenant's DATA lives in
   *  its own file (stores.ts), so this answers "which workspaces exist", not "which have data". */
  listOrgs(): Org[] {
    return this.all<Org>("SELECT * FROM orgs ORDER BY createdAt");
  }

  /** The plan label on the org record ("Free" / "Pro" / "Business" / "Enterprise"). */
  updateOrgPlan(id: string, plan: string) {
    this.run("UPDATE orgs SET plan = ? WHERE id = ?", [plan, id]);
    this.save();
  }

  emailExists(email: string): boolean {
    return Boolean(this.get<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [email.trim().toLowerCase()]));
  }

  createAccount(input: {
    orgId: string;
    email: string;
    password: string;
    name: string;
    role?: string;
    acceptedTermsAt?: string;
    acceptedTermsVersion?: string;
    authProvider?: string;
    providerSubject?: string;
    emailVerifiedAt?: string;
  }): Account {
    const row: AccountRow = {
      id: newId("acct"),
      orgId: input.orgId,
      email: input.email.trim().toLowerCase(),
      passwordHash: hashPassword(input.password),
      name: input.name.trim() || input.email.split("@")[0],
      // The permission level is guarded HERE because migration 20 deliberately adds no
      // CHECK constraint (rebuilding a table of live logins is the larger risk). This is
      // the only place an account's role is first written, so this is where the union has
      // to be true of the data. An unrecognised value fails CLOSED, to member.
      role: isPermissionLevel(input.role) ? input.role : input.role === undefined ? "owner" : "member",
      createdAt: new Date().toISOString(),
      acceptedTermsAt: input.acceptedTermsAt ?? null,
      acceptedTermsVersion: input.acceptedTermsVersion ?? null,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      authProvider: input.authProvider ?? null,
      providerSubject: input.providerSubject ?? null
    };
    this.insert("accounts", row);
    // and the home member of its own workspace (migration 24)
    this.insert("workspace_members", { accountId: row.id, orgId: row.orgId, role: row.role, kind: "home", createdAt: row.createdAt });
    this.save();
    return toAccount(row);
  }

  /**
   * Change an account's permission level. The second and last place the column is written,
   * and the other half of the reason migration 20 needs no CHECK constraint: an unknown
   * value is refused outright here rather than stored and interpreted later.
   *
   * Refusing is deliberate: `createAccount` fails closed to "member" because it must still
   * produce a usable login, but a *change* that cannot be understood has no safe default --
   * quietly demoting someone because a caller sent a typo is its own kind of wrong.
   * Returns the updated account, or undefined if the id or the level is not valid.
   */
  setAccountRole(accountId: string, role: string): Account | undefined {
    if (!isPermissionLevel(role)) return undefined;
    if (!this.getAccountById(accountId)) return undefined;
    this.run("UPDATE accounts SET role = ? WHERE id = ?", [role, accountId]);
    this.save();
    return this.getAccountById(accountId);
  }

  /**
   * Set what someone may do in ONE workspace — the write behind PATCH /api/team/users/:id.
   *
   * The level is kept in two places and this is why they cannot drift: `accounts.role` is
   * what every request authorizes on (the session carries the account, see the gate in
   * app.ts), and `workspace_members.role` is what the workspace switcher lists. Writing one
   * without the other leaves a person who is an Admin to the server and a Member to the
   * screen, or the reverse. Both, in one transaction, or neither.
   *
   * Refuses an account that is not in this workspace, so a valid id from somewhere else
   * cannot be raised from here.
   */
  setAccountPermission(accountId: string, orgId: string, role: PermissionLevel): Account | undefined {
    if (!isPermissionLevel(role)) return undefined;
    if (!this.accountsForOrg(orgId).some((one) => one.id === accountId)) return undefined;
    this.transaction(() => {
      this.run("UPDATE accounts SET role = ? WHERE id = ?", [role, accountId]);
      this.run("UPDATE workspace_members SET role = ? WHERE accountId = ? AND orgId = ?", [role, accountId, orgId]);
    });
    this.save();
    return this.getAccountById(accountId);
  }

  /**
   * Every login in one workspace. `accounts` had only ever been queried by email and by id, so
   * before this there was no way to ask "who is in this workspace" or "is this the last owner" --
   * which are the two questions ownership transfer and teammate removal are made of.
   */
  /* ── calendar connections (control db, per account) ───────────────────── */

  /** Every provider this person has connected. Includes the refresh token, so server-side only. */
  calendarConnectionsForAccount(accountId: string): CalendarConnectionRow[] {
    return this.all<CalendarConnectionRow>("SELECT * FROM calendar_connections WHERE accountId = ? ORDER BY provider", [accountId]);
  }

  calendarConnection(accountId: string, provider: string): CalendarConnectionRow | undefined {
    return this.get<CalendarConnectionRow>("SELECT * FROM calendar_connections WHERE accountId = ? AND provider = ?", [
      accountId,
      provider
    ]);
  }

  /** Connecting again replaces the row, so a re-consent cannot leave a stale token behind. */
  saveCalendarConnection(row: Omit<CalendarConnectionRow, "connectedAt"> & { connectedAt?: string }): CalendarConnectionRow {
    const connectedAt = row.connectedAt ?? new Date().toISOString();
    this.run(
      `INSERT INTO calendar_connections (accountId, provider, email, refreshToken, accessToken, expiresAt, connectedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(accountId, provider) DO UPDATE SET
         email = excluded.email,
         refreshToken = excluded.refreshToken,
         accessToken = excluded.accessToken,
         expiresAt = excluded.expiresAt,
         connectedAt = excluded.connectedAt`,
      [row.accountId, row.provider, row.email, row.refreshToken, row.accessToken, row.expiresAt, connectedAt]
    );
    this.save();
    return this.calendarConnection(row.accountId, row.provider)!;
  }

  /** After a refresh: the new access token, and the refresh token if the provider rotated it. */
  updateCalendarTokens(accountId: string, provider: string, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) {
    this.run("UPDATE calendar_connections SET accessToken = ?, refreshToken = ?, expiresAt = ? WHERE accountId = ? AND provider = ?", [
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      accountId,
      provider
    ]);
    this.save();
  }

  deleteCalendarConnection(accountId: string, provider: string) {
    this.run("DELETE FROM calendar_connections WHERE accountId = ? AND provider = ?", [accountId, provider]);
    this.save();
  }

  accountsForOrg(orgId: string): Account[] {
    // The logins registered in the workspace, plus anyone reaching it through
    // workspace_members -- the owner of a workspace created beside their first (migration 24).
    return this.all<AccountRow>(
      `SELECT a.* FROM accounts a WHERE a.orgId = ?
       UNION
       SELECT a.* FROM accounts a JOIN workspace_members m ON m.accountId = a.id WHERE m.orgId = ?
       ORDER BY createdAt`,
      [orgId, orgId]
    ).map(toAccount);
  }

  /* ── workspaces: one login, several orgs (migration 24) ─────────────────── */

  /** Every workspace one login can open, oldest first, so the home workspace leads. */
  workspacesForAccount(accountId: string): WorkspaceMemberRow[] {
    return this.all<WorkspaceMemberRow>(`${WORKSPACE_MEMBER_SELECT} WHERE m.accountId = ? ORDER BY m.createdAt`, [accountId]);
  }

  workspaceMembership(accountId: string, orgId: string): WorkspaceMemberRow | undefined {
    return this.get<WorkspaceMemberRow>(`${WORKSPACE_MEMBER_SELECT} WHERE m.accountId = ? AND m.orgId = ?`, [accountId, orgId]);
  }

  addWorkspaceMember(accountId: string, orgId: string, role: string, kind: WorkspaceKind = "extra") {
    this.run("INSERT OR REPLACE INTO workspace_members (accountId, orgId, role, kind, createdAt) VALUES (?, ?, ?, ?, ?)", [
      accountId,
      orgId,
      role,
      kind,
      new Date().toISOString()
    ]);
    this.save();
  }

  /** A login always belongs to its home workspace (`accounts.orgId`), even one whose file predates migration 24's backfill. */
  ensureHomeMembership(account: Account) {
    if (this.workspaceMembership(account.id, account.orgId)) return;
    this.run("INSERT OR IGNORE INTO workspace_members (accountId, orgId, role, kind, createdAt) VALUES (?, ?, ?, 'home', ?)", [
      account.id,
      account.orgId,
      account.role,
      account.createdAt
    ]);
    this.save();
  }

  /** How many workspaces beyond the home one this login has created; the limit counts these. */
  extraWorkspaceCount(accountId: string): number {
    return (
      this.get<{ n: number }>("SELECT COUNT(*) AS n FROM workspace_members WHERE accountId = ? AND kind = 'extra'", [accountId])?.n ?? 0
    );
  }

  /**
   * Forget a workspace created beside a login's first: its memberships, the sessions and invites
   * pointing at it, any login registered INSIDE it (a teammate who accepted an invite there --
   * their only workspace is going), and the org row. The tenant file is the StoreManager's to
   * drop. Used for the shared demo's throwaway workspaces; never for a home workspace.
   */
  removeWorkspace(orgId: string) {
    if (orgId === DEMO_ORG_ID) return;
    this.run("DELETE FROM workspace_members WHERE orgId = ?", [orgId]);
    this.run("DELETE FROM sessions WHERE orgId = ?", [orgId]);
    this.run("DELETE FROM invites WHERE orgId = ?", [orgId]);
    this.run("DELETE FROM accounts WHERE orgId = ?", [orgId]);
    this.run("DELETE FROM orgs WHERE id = ?", [orgId]);
    this.save();
  }

  /** Point a live session at another of the person's workspaces. The cookie is unchanged: the row is the state. */
  switchSession(token: string, orgId: string) {
    if (!token) return;
    this.run("UPDATE sessions SET orgId = ? WHERE token = ?", [orgId, token]);
    this.save();
  }

  /**
   * Deletes a login and everything that could still be used to act as it.
   *
   * Order matters and runs from the most dangerous leftover to the least. Sessions first: a session
   * row whose account has gone is never pruned anywhere -- getSession returns undefined but leaves
   * the row -- so it has to go while the account is still there to find. Then auth tokens, because
   * consumeAuthToken never re-checks that the account exists, which would let an outstanding
   * password-reset link be redeemed against a deleted login and report success. The account row
   * last, so a failure part-way leaves a usable login rather than an unreachable orphan.
   *
   * The email is UNIQUE, so deleting the row is also what makes the address invitable again.
   */
  purgeAccount(accountId: string): boolean {
    if (!this.getAccountById(accountId)) return false;
    this.transaction(() => {
      this.run("DELETE FROM sessions WHERE accountId = ?", [accountId]);
      this.run("DELETE FROM auth_tokens WHERE accountId = ?", [accountId]);
      this.run("DELETE FROM accounts WHERE id = ?", [accountId]);
    });
    return true;
  }

  /** Full row incl. passwordHash — for login verification only, never returned to a client. */
  getAccountRowByEmail(email: string): AccountRow | undefined {
    return this.get<AccountRow>("SELECT * FROM accounts WHERE email = ?", [email.trim().toLowerCase()]);
  }

  getAccountById(id: string): Account | undefined {
    const row = this.get<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id]);
    return row ? toAccount(row) : undefined;
  }

  /* ── one-time emailed links (verify / reset) ─────────────────────────────── */

  /**
   * Mint a token for an emailed link. Any earlier unused token of the same
   * kind is retired, so only the newest email works. Returns the RAW token —
   * put it in the link; it is never stored.
   */
  createAuthToken(accountId: string, kind: AuthTokenKind, ttlMs: number): string {
    const raw = newAuthToken();
    const now = new Date();
    this.run("UPDATE auth_tokens SET usedAt = ? WHERE accountId = ? AND kind = ? AND usedAt IS NULL", [now.toISOString(), accountId, kind]);
    this.insert("auth_tokens", {
      id: newId("tok"),
      accountId,
      kind,
      tokenHash: hashToken(raw),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      usedAt: null,
      createdAt: now.toISOString()
    });
    this.save();
    return raw;
  }

  /** Redeem a raw token once. Unknown, used or expired tokens all answer undefined. */
  consumeAuthToken(raw: string, kind: AuthTokenKind): Account | undefined {
    if (!raw) return undefined;
    const row = this.get<{ id: string; accountId: string; expiresAt: string; usedAt: string | null }>(
      "SELECT id, accountId, expiresAt, usedAt FROM auth_tokens WHERE tokenHash = ? AND kind = ?",
      [hashToken(raw), kind]
    );
    if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) return undefined;
    this.run("UPDATE auth_tokens SET usedAt = ? WHERE id = ?", [new Date().toISOString(), row.id]);
    this.save();
    return this.getAccountById(row.accountId);
  }

  /** Name and/or email edits. A new email drops verification — the caller re-sends the link. */
  updateAccount(accountId: string, patch: { name?: string; email?: string }): Account | undefined {
    if (patch.name !== undefined) this.run("UPDATE accounts SET name = ? WHERE id = ?", [patch.name.trim(), accountId]);
    if (patch.email !== undefined) {
      this.run("UPDATE accounts SET email = ?, emailVerifiedAt = NULL WHERE id = ?", [patch.email.trim().toLowerCase(), accountId]);
    }
    this.save();
    return this.getAccountById(accountId);
  }

  updateOrgName(orgId: string, name: string): Org | undefined {
    this.run("UPDATE orgs SET name = ? WHERE id = ?", [name.trim(), orgId]);
    this.save();
    return this.getOrg(orgId);
  }

  /* ── team invites (org records) ─────────────────────────────────────────── */

  /** Mint an invite; an open invite to the same address on this org is replaced. Returns the raw token for the link. */
  createInvite(input: { orgId: string; email: string; permission: PermissionLevel; invitedBy: string; ttlMs: number; sent: boolean }): {
    invite: InviteRow;
    token: string;
  } {
    const email = input.email.trim().toLowerCase();
    this.run("DELETE FROM invites WHERE orgId = ? AND email = ? AND acceptedAt IS NULL", [input.orgId, email]);
    const token = newAuthToken();
    const now = new Date();
    const invite: InviteRow = {
      id: newId("inv"),
      orgId: input.orgId,
      email,
      // Never an owner: ownership is transferred, not handed out with an email. Anything
      // unrecognised fails closed to the least privilege, as it does on accounts.
      permission: input.permission === "admin" ? "admin" : "member",
      invitedBy: input.invitedBy,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
      sentAt: input.sent ? now.toISOString() : null,
      acceptedAt: null,
      createdAt: now.toISOString()
    };
    this.insert("invites", invite);
    this.save();
    return { invite, token };
  }

  /** Open (unaccepted, unexpired) invites for an org. */
  openInvites(orgId: string): InviteRow[] {
    return this.all<InviteRow>("SELECT * FROM invites WHERE orgId = ? AND acceptedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC", [
      orgId,
      new Date().toISOString()
    ]);
  }

  /** Invites created while the inviter's email was unconfirmed; sending them is the caller's job. */
  unsentInvites(orgId: string): InviteRow[] {
    return this.all<InviteRow>("SELECT * FROM invites WHERE orgId = ? AND acceptedAt IS NULL AND sentAt IS NULL AND expiresAt > ?", [
      orgId,
      new Date().toISOString()
    ]);
  }

  getInvite(id: string, orgId: string): InviteRow | undefined {
    return this.get<InviteRow>("SELECT * FROM invites WHERE id = ? AND orgId = ?", [id, orgId]);
  }

  /** Re-issue an invite's token (new link, fresh expiry). */
  refreshInvite(id: string, orgId: string, ttlMs: number): { invite: InviteRow; token: string } | undefined {
    const existing = this.getInvite(id, orgId);
    if (!existing || existing.acceptedAt) return undefined;
    const token = newAuthToken();
    const now = new Date();
    this.run("UPDATE invites SET tokenHash = ?, expiresAt = ?, sentAt = ? WHERE id = ?", [
      hashToken(token),
      new Date(now.getTime() + ttlMs).toISOString(),
      now.toISOString(),
      id
    ]);
    this.save();
    return { invite: this.getInvite(id, orgId)!, token };
  }

  revokeInvite(id: string, orgId: string): boolean {
    const existing = this.getInvite(id, orgId);
    if (!existing || existing.acceptedAt) return false;
    this.run("DELETE FROM invites WHERE id = ?", [id]);
    this.save();
    return true;
  }

  /** The invite behind a raw link token, if still open. Does not consume it. */
  inviteByToken(token: string): InviteRow | undefined {
    if (!token) return undefined;
    const row = this.get<InviteRow>("SELECT * FROM invites WHERE tokenHash = ?", [hashToken(token)]);
    if (!row || row.acceptedAt || new Date(row.expiresAt).getTime() < Date.now()) return undefined;
    return row;
  }

  markInviteAccepted(id: string) {
    this.run("UPDATE invites SET acceptedAt = ? WHERE id = ?", [new Date().toISOString(), id]);
    this.save();
  }

  /** The roster row behind a person, by roster id. */
  getUser(userId: string): User | undefined {
    const row = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE id = ?", [userId]);
    return row ? userRow(row) : undefined;
  }

  /** Remove a seeded sample teammate (never a person linked to a login). */
  removeSampleUser(userId: string): boolean {
    const row = this.get<{ id: string; accountId: string | null; isSample: number }>(
      "SELECT id, accountId, isSample FROM users WHERE id = ?",
      [userId]
    );
    if (!row || row.accountId || !row.isSample) return false;
    this.run("DELETE FROM users WHERE id = ?", [userId]);
    this.save();
    return true;
  }

  /** The roster row behind a teammate, including the login it is linked to. */
  teammateRow(
    userId: string
  ): { id: string; name: string; accountId: string | null; isSample: boolean; removedAt: string | null } | undefined {
    const row = this.get<{ id: string; name: string; accountId: string | null; isSample: number; removedAt: string | null }>(
      "SELECT id, name, accountId, isSample, removedAt FROM users WHERE id = ?",
      [userId]
    );
    return row ? { ...row, isSample: Boolean(row.isSample) } : undefined;
  }

  /**
   * Takes a person off the roster WITHOUT deleting what they did. See migration 22: the row stays,
   * its link to a login is cut, and removedAt records when. Every field update, variance and project
   * that names them still resolves to a real person.
   *
   * Returns the projects they were still managing. projects.managerId is NOT NULL, so those keep
   * pointing here and keep rendering correctly -- but somebody has to be given the work, and the
   * caller is the only one who can say who, so this reports rather than guesses.
   */
  revokeTeammateAccess(userId: string): { name: string; managing: Array<{ id: string; name: string }> } | undefined {
    const row = this.teammateRow(userId);
    if (!row) return undefined;
    const managing = this.all<{ id: string; name: string }>("SELECT id, name FROM projects WHERE managerId = ? ORDER BY name", [userId]);
    this.transaction(() => {
      this.run("UPDATE users SET accountId = NULL, removedAt = ? WHERE id = ?", [new Date().toISOString(), userId]);
      // Their saved board and tutorial progress belonged to the login, not to the record of them.
      this.run("DELETE FROM user_settings WHERE userId = ?", [userId]);
    });
    return { name: row.name, managing };
  }

  /**
   * The tenant db's display copy of who owns the workspace. `users.title` is set to "Owner" by
   * ensureAccountUser and is deliberately sticky, so a transfer has to move it by hand or the
   * roster keeps showing the previous owner as the owner.
   */
  moveOwnerTitle(fromAccountId: string, toAccountId: string) {
    this.transaction(() => {
      // The outgoing owner keeps a title, just not that one: there is no job title to fall
      // back to any more, and a roster row with an empty title reads as a missing person.
      this.run("UPDATE users SET title = 'Teammate' WHERE accountId = ? AND title = 'Owner'", [fromAccountId]);
      this.run("UPDATE users SET title = 'Owner' WHERE accountId = ?", [toAccountId]);
    });
  }

  /** Keep the workspace person in step with a renamed login. */
  renameAccountUser(accountId: string, name: string) {
    this.run("UPDATE users SET name = ?, avatar = ? WHERE accountId = ?", [name.trim(), initials(name), accountId]);
    this.save();
  }

  /**
   * A workspace person for an invited teammate, with the role the inviter chose.
   *
   * Dedupes on accountId, which a removed teammate no longer has -- so re-inviting someone who was
   * removed gives them a second roster row rather than reviving the first. That is deliberate: the
   * old row is the record of their previous tenure and every field report and variance they filed
   * still points at it. Reviving it would re-attach that history to a new login.
   */
  createTeammateUser(account: { id: string; name: string; email: string }, title: string): User {
    const existing = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE accountId = ?", [account.id]);
    if (existing) return userRow(existing);
    const name = account.name.trim() || account.email.split("@")[0];
    const user = { id: newId("u"), name, title, avatar: initials(name), accountId: account.id, isSample: 0 };
    this.insert("users", user);
    this.save();
    return userRow(user);
  }

  markEmailVerified(accountId: string): Account | undefined {
    this.run("UPDATE accounts SET emailVerifiedAt = COALESCE(emailVerifiedAt, ?) WHERE id = ?", [new Date().toISOString(), accountId]);
    this.save();
    return this.getAccountById(accountId);
  }

  /** New password + every other session signed out (a reset is how you evict whoever had the old one). */
  setAccountPassword(accountId: string, password: string) {
    this.run("UPDATE accounts SET passwordHash = ? WHERE id = ?", [hashPassword(password), accountId]);
    this.run("DELETE FROM sessions WHERE accountId = ?", [accountId]);
    this.save();
  }

  createSession(accountId: string, orgId: string): { token: string; expiresAt: string } {
    const token = newSessionToken();
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    this.insert("sessions", { token, accountId, orgId, createdAt: new Date(now).toISOString(), expiresAt });
    this.save();
    return { token, expiresAt };
  }

  /** Resolve a session token → {account, org}, rejecting (and pruning) expired ones. */
  getSession(token: string): SessionContext | undefined {
    if (!token) return undefined;
    const row = this.get<{ accountId: string; orgId: string; expiresAt: string }>(
      "SELECT accountId, orgId, expiresAt FROM sessions WHERE token = ?",
      [token]
    );
    if (!row) return undefined;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      this.deleteSession(token);
      return undefined;
    }
    const account = this.getAccountById(row.accountId);
    const org = this.getOrg(row.orgId);
    if (!account || !org) return undefined;
    return { account, org };
  }

  deleteSession(token: string) {
    if (!token) return;
    this.run("DELETE FROM sessions WHERE token = ?", [token]);
    this.save();
  }

  /**
   * Delete the auth rows that have expired. Nothing swept these before.
   *
   * `getSession` prunes an expired row, but only the one it was just asked about — a
   * session nobody presents again (a device that never comes back, a cleared cookie) sat
   * there for good. `consumeAuthToken` marks a token used and never deletes it, so every
   * password reset, email confirmation and invite left a row behind permanently. Both
   * tables only grew.
   *
   * That costs more here than it would on a normal database: `save()` re-exports and
   * rewrites the WHOLE file, so dead rows are not merely wasted space — they are paid for
   * again by every write anywhere in the app, for as long as they sit there.
   *
   * Tokens go on expiry whether or not they were used: `consumeAuthToken` already answers
   * a used token and an unknown one identically, so keeping the row buys nothing. A token
   * that is used but not yet expired stays until it expires, which keeps this to one rule.
   *
   * Counting first is the point of the early return — with no expired rows there is
   * nothing to write, and calling this on a schedule must not itself rewrite every
   * tenant's database file for no reason.
   */
  pruneExpiredAuth(): { sessions: number; tokens: number } {
    const now = new Date().toISOString();
    const countExpired = (table: "sessions" | "auth_tokens") =>
      this.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE expiresAt < ?`, [now])?.n ?? 0;
    const sessions = countExpired("sessions");
    const tokens = countExpired("auth_tokens");
    if (sessions === 0 && tokens === 0) return { sessions: 0, tokens: 0 };
    this.transaction(() => {
      this.run("DELETE FROM sessions WHERE expiresAt < ?", [now]);
      this.run("DELETE FROM auth_tokens WHERE expiresAt < ?", [now]);
    });
    return { sessions, tokens };
  }

  /** Idempotently seed the demo org + demo account so the credential-free
      "Preview the live demo" logs into this seeded workspace. */
  seedDemoAccount() {
    if (!this.getOrg(DEMO_ORG_ID)) {
      this.insert("orgs", { id: DEMO_ORG_ID, name: "BuildFlow Demo Co.", plan: "Business", createdAt: new Date().toISOString() });
    }
    if (!this.emailExists(DEMO_ACCOUNT_EMAIL)) {
      this.insert("accounts", {
        id: newId("acct"),
        orgId: DEMO_ORG_ID,
        email: DEMO_ACCOUNT_EMAIL,
        passwordHash: hashPassword(DEMO_ACCOUNT_PASSWORD),
        name: "Demo User",
        role: "owner",
        createdAt: new Date().toISOString()
      });
    }
    this.save();
  }

  /* ── billing: Stripe subscriptions (written by the webhook handler) ───────── */
  upsertSubscription(row: {
    id: string;
    customerId?: string | null;
    email?: string | null;
    planId?: string | null;
    priceId?: string | null;
    period?: string | null;
    status?: string | null;
    seats?: number | null;
    currentPeriodEnd?: string | null;
    raw?: unknown;
  }): SubscriptionRow {
    const now = new Date().toISOString();
    const existing = this.get<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = ?", [row.id]);
    const merged: SubscriptionRow = {
      id: row.id,
      customerId: row.customerId ?? existing?.customerId ?? null,
      email: row.email ?? existing?.email ?? null,
      planId: row.planId ?? existing?.planId ?? null,
      priceId: row.priceId ?? existing?.priceId ?? null,
      period: row.period ?? existing?.period ?? null,
      status: row.status ?? existing?.status ?? null,
      seats: row.seats ?? existing?.seats ?? null,
      currentPeriodEnd: row.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      raw: row.raw === undefined ? (existing?.raw ?? null) : JSON.stringify(row.raw)
    };
    this.run(
      `INSERT OR REPLACE INTO subscriptions
         (id, customerId, email, planId, priceId, period, status, seats, currentPeriodEnd, createdAt, updatedAt, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.id,
        merged.customerId,
        merged.email,
        merged.planId,
        merged.priceId,
        merged.period,
        merged.status,
        merged.seats,
        merged.currentPeriodEnd,
        merged.createdAt,
        merged.updatedAt,
        merged.raw
      ]
    );
    this.save();
    return merged;
  }

  listSubscriptions(): SubscriptionRow[] {
    return this.all<SubscriptionRow>("SELECT * FROM subscriptions ORDER BY updatedAt DESC");
  }

  getSubscriptionByEmail(email: string): SubscriptionRow | undefined {
    return this.get<SubscriptionRow>("SELECT * FROM subscriptions WHERE email = ? ORDER BY updatedAt DESC", [email]);
  }

  getSubscriptionByCustomer(customerId: string): SubscriptionRow | undefined {
    return this.get<SubscriptionRow>("SELECT * FROM subscriptions WHERE customerId = ? ORDER BY updatedAt DESC", [customerId]);
  }

  /** Org-level key/value settings (trade, onboarding state). */
  workspaceSetting(key: string): string | null {
    return this.get<{ value: string }>("SELECT value FROM workspace_settings WHERE key = ?", [key])?.value ?? null;
  }

  setWorkspaceSetting(key: string, value: string) {
    this.run("INSERT INTO workspace_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      key,
      value
    ]);
  }

  /** The working week and holidays (Settings › Work calendar); the computed default until someone edits it. */
  workCalendar(): WorkCalendarSetting {
    const raw = this.workspaceSetting("workCalendar");
    if (!raw) return normalizeWorkCalendar(null);
    try {
      return normalizeWorkCalendar(JSON.parse(raw) as Partial<WorkCalendarSetting>);
    } catch {
      return normalizeWorkCalendar(null);
    }
  }

  setWorkCalendar(input: Partial<WorkCalendarSetting>): WorkCalendarSetting {
    const calendar = normalizeWorkCalendar(input);
    this.setWorkspaceSetting("workCalendar", JSON.stringify(calendar));
    this.save();
    return calendar;
  }

  /** The secret in a crew's calendar-feed link; made once per workspace, on first use. */
  calendarFeedKey(): string {
    const existing = this.workspaceSetting("calendarFeedKey");
    if (existing) return existing;
    const key = newSessionToken().slice(0, 32);
    this.setWorkspaceSetting("calendarFeedKey", key);
    this.save();
    return key;
  }

  /** The trade this workspace was set up for, or "" before onboarding picked one. */
  businessType(): BusinessTypeId | "" {
    const value = this.workspaceSetting("businessType") ?? "";
    return (businessTypeOptions as readonly string[]).includes(value) ? (value as BusinessTypeId) : "";
  }

  setBusinessType(businessType: BusinessTypeId) {
    this.setWorkspaceSetting("businessType", businessType);
  }

  /** Every setting a person has saved, as a flat map. */
  userSettings(userId: string): Record<string, string> {
    const rows = this.all<{ key: string; value: string }>("SELECT key, value FROM user_settings WHERE userId = ?", [userId]);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  setUserSetting(userId: string, key: string, value: string) {
    this.run(
      "INSERT INTO user_settings (userId, key, value, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt",
      [userId, key, value, new Date().toISOString()]
    );
    this.save();
  }

  /** ISO time the owner finished onboarding, or null while they have not. */
  onboardingCompletedAt(): string | null {
    return this.workspaceSetting("onboardingCompletedAt");
  }

  /** Plan, add-ons, seats and trial recorded on the org. */
  workspaceSetup(): {
    selectedPlan: PlanId | null;
    selectedProducts: OnboardingProductId[];
    seats: number | null;
    trialEndsAt: string | null;
  } {
    const plan = this.workspaceSetting("selectedPlan");
    const productIds = onboardingProductOptions.map((option) => option.id) as string[];
    let products: OnboardingProductId[] = [];
    try {
      const parsed = JSON.parse(this.workspaceSetting("selectedProducts") ?? "[]");
      if (Array.isArray(parsed)) products = parsed.filter((id): id is OnboardingProductId => productIds.includes(String(id)));
    } catch {
      products = [];
    }
    const seatsRaw = Number(this.workspaceSetting("seats"));
    return {
      selectedPlan: (planOptions as readonly string[]).includes(plan ?? "") ? (plan as PlanId) : null,
      selectedProducts: products,
      seats: Number.isFinite(seatsRaw) && seatsRaw > 0 ? seatsRaw : null,
      trialEndsAt: this.workspaceSetting("trialEndsAt")
    };
  }

  /* A workspace created beside the person's first one (POST /api/workspaces) runs on a dated
     free trial whatever plan it picks at onboarding: `trialEndsAt` is set the moment it is
     created and `workspaceTrial` marks it, so the Free pick in recordWorkspaceSetup does not
     erase the clock and billingStatusFor reads it as a trial rather than as "free". */
  isWorkspaceTrial(): boolean {
    return this.workspaceSetting("workspaceTrial") === "1";
  }

  startWorkspaceTrial(days: number) {
    this.setWorkspaceSetting("workspaceTrial", "1");
    this.setWorkspaceSetting("trialEndsAt", new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
    this.save();
  }

  /**
   * Record what the owner chose. A paid plan that has not been through
   * checkout runs as a trial from the moment it is chosen; picking Free again
   * ends it. Enterprise is priced by sales, so it gets no trial clock.
   */
  recordWorkspaceSetup(setup: { selectedPlan?: PlanId; selectedProducts?: OnboardingProductId[]; seats?: number }) {
    if (setup.selectedPlan) {
      this.setWorkspaceSetting("selectedPlan", setup.selectedPlan);
      const paid = setup.selectedPlan === "pro" || setup.selectedPlan === "business";
      if (paid && !this.workspaceSetting("trialEndsAt")) {
        this.setWorkspaceSetting("trialEndsAt", new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString());
      }
      if (!paid && !this.isWorkspaceTrial()) this.run("DELETE FROM workspace_settings WHERE key = 'trialEndsAt'");
    }
    if (setup.selectedProducts) this.setWorkspaceSetting("selectedProducts", JSON.stringify(setup.selectedProducts));
    if (setup.seats) this.setWorkspaceSetting("seats", String(Math.round(setup.seats)));
    this.save();
  }

  /** Every person in the workspace, with the SQLite 0/1 sample flag as a boolean. */
  users(): User[] {
    return this.all<User & { isSample: number | boolean }>("SELECT * FROM users ORDER BY name").map(userRow);
  }

  /**
   * The workspace person behind a login account, created on first sight, so every
   * field update, assignment and approval is attributed to them rather than to a
   * seeded name. `title` is free text and says what they do; what they MAY do is
   * their account's permission level, which does not live on this row.
   */
  ensureAccountUser(account: { id: string; name: string; email: string }): User {
    const existing = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE accountId = ?", [account.id]);
    if (existing) return userRow(existing);
    const name = account.name.trim() || account.email.split("@")[0];
    const user = {
      id: newId("u"),
      name,
      title: "Owner",
      avatar: initials(name),
      accountId: account.id,
      isSample: 0
    };
    this.insert("users", user);
    this.save();
    return userRow(user);
  }

  bootstrap(accountId?: string): BootstrapPayload {
    const users = this.users();
    // The signed-in account's own person first; the demo's Matt for the shared
    // demo store; otherwise whoever is listed first. A brand-new, un-onboarded
    // workspace can legitimately have nobody yet.
    const activeUser =
      (accountId ? users.find((user) => user.accountId === accountId) : undefined) ??
      users.find((user) => user.id === "u-matt") ??
      users[0];
    return {
      businessType: this.businessType(),
      onboardingCompletedAt: this.onboardingCompletedAt(),
      workspaceTrial: this.isWorkspaceTrial(),
      sampleData: this.sampleData() !== null,
      ...this.workspaceSetup(),
      userSettings: activeUser ? this.userSettings(activeUser.id) : {},
      workCalendar: this.workCalendar(),
      users,
      activeUser: activeUser!,
      projects: this.projects(),
      jobs: this.jobs(),
      crews: this.crews(),
      equipment: this.equipment(),
      materials: this.materials(),
      assignments: this.assignments(),
      dependencies: this.dependencies(),
      fieldUpdates: this.fieldUpdates(),
      variances: this.variances(),
      delayIQs: this.delayIQs(),
      readiness: this.readiness(),
      phases: this.phases(),
      inspections: this.inspections(),
      weatherAlerts: this.weatherAlerts(),
      weatherConflicts: this.weatherConflicts({ from: localToday() })
    };
  }

  /**
   * How many objects of each kind this workspace holds — the SAME five collections
   * bootstrap() returns, counted in SQL instead of materialised.
   *
   * This exists so the operator console can show real numbers without reading a
   * workspace's contents: bootstrap() carries contract values, crew hourly rates and
   * every job, and none of that is needed to say "84 objects". The five accessors are
   * unfiltered `SELECT * FROM <table>`, so each COUNT(*) equals that array's length.
   */
  objectCounts(): { projects: number; jobs: number; crews: number; equipment: number; materials: number } {
    const count = (table: string) => this.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0;
    return {
      projects: count("projects"),
      jobs: count("jobs"),
      crews: count("crews"),
      equipment: count("equipment"),
      materials: count("materials")
    };
  }

  /** The CPM precedence network (job → job links with type + lag). */
  dependencies(): JobDependency[] {
    return this.all<JobDependency>("SELECT * FROM job_dependencies");
  }

  /** A link the planner drew on the Gantt — refused when a job would depend on itself, repeat a link, or close a loop. */
  createDependency(input: CreateJobDependencyInput): JobDependency {
    if (input.predecessorId === input.successorId) throw new DependencyError("A job cannot depend on itself.", "self");
    const jobs = this.jobs();
    const names = new Map(jobs.map((job) => [job.id, job.name]));
    if (!names.has(input.predecessorId) || !names.has(input.successorId)) throw new Error("Job not found");
    const existing = this.dependencies();
    if (existing.some((link) => link.predecessorId === input.predecessorId && link.successorId === input.successorId)) {
      throw new DependencyError(`${names.get(input.predecessorId)} already leads to ${names.get(input.successorId)}.`, "duplicate");
    }
    const link: JobDependency = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: input.type,
      lagDays: input.lagDays
    };
    // the network must stay a DAG: a loop makes float and the critical path meaningless
    const { cycle } = calculateCpm(
      jobs.map((job) => ({ id: job.id, duration: 1 })),
      [...existing, link].map((item) => ({
        predecessorId: item.predecessorId,
        successorId: item.successorId,
        type: item.type,
        lag: item.lagDays
      }))
    );
    if (cycle) {
      throw new DependencyError(`That link would close a loop: ${cycle.map((id) => names.get(id) ?? id).join(" → ")}.`, "cycle");
    }
    this.insert("job_dependencies", link);
    this.save();
    return link;
  }

  deleteDependency(id: string): JobDependency | null {
    const link = this.get<JobDependency>("SELECT * FROM job_dependencies WHERE id = ?", [id]);
    if (!link) return null;
    this.run("DELETE FROM job_dependencies WHERE id = ?", [id]);
    this.save();
    return link;
  }

  /** Snapshot the current plan as the baseline every job is measured against. */
  setBaseline() {
    this.run("UPDATE jobs SET baselineStart = startDate, baselineEnd = endDate");
    this.save();
    return this.bootstrap();
  }

  /* ── Sample data for a trial: the trade's starter workspace, loadable into an empty workspace and removable again ── */

  sampleData(): SampleDataRecord | null {
    const raw = this.workspaceSetting("sampleData");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SampleDataRecord;
    } catch {
      return null;
    }
  }

  /** Seeds the trade's starter workspace and remembers what it added. Refuses a workspace that already has projects. */
  loadSampleData(businessType: BusinessTypeId): SampleDataRecord & { alreadyLoaded: boolean } {
    const existing = this.sampleData();
    if (existing) return { ...existing, alreadyLoaded: true };
    const hasWork = (this.get<{ n: number }>("SELECT COUNT(*) AS n FROM projects")?.n ?? 0) > 0;
    if (hasWork) throw new Error("This workspace already has projects; sample data is for an empty workspace.");
    // Only what the workspace does not already have: an org whose onboarding seed was
    // cleared keeps its people (and maybe a crew or two), and their ids must not collide.
    const fresh = createBusinessProfile(businessType);
    const missing = <T extends { id: string }>(table: string, items: T[]) =>
      items.filter((item) => !this.get<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [item.id]));
    const payload: BootstrapPayload = {
      ...fresh,
      users: missing("users", fresh.users),
      projects: missing("projects", fresh.projects),
      phases: missing("phases", fresh.phases),
      jobs: missing("jobs", fresh.jobs),
      crews: missing("crews", fresh.crews),
      equipment: missing("equipment", fresh.equipment),
      materials: missing("materials", fresh.materials),
      assignments: missing("assignments", fresh.assignments),
      dependencies: missing("job_dependencies", fresh.dependencies ?? []),
      fieldUpdates: missing("field_updates", fresh.fieldUpdates),
      delayIQs: missing("delayIQs", fresh.delayIQs),
      variances: missing("schedule_variances", fresh.variances ?? []),
      readiness: missing("readiness", fresh.readiness),
      inspections: missing("inspections", fresh.inspections),
      weatherAlerts: missing("weather_alerts", fresh.weatherAlerts)
    };
    // the rows and the record of them land together, or not at all
    const record = this.transaction((): SampleDataRecord => {
      this.seeding = true;
      try {
        this.insertBootstrapPayload(payload);
      } finally {
        this.seeding = false;
      }
      const loaded: SampleDataRecord = {
        businessType,
        projectIds: payload.projects.map((project) => project.id),
        crewIds: payload.crews.map((crew) => crew.id),
        equipmentIds: payload.equipment.map((item) => item.id),
        loadedAt: new Date().toISOString()
      };
      this.setWorkspaceSetting("sampleData", JSON.stringify(loaded));
      return loaded;
    });
    return { ...record, alreadyLoaded: false };
  }

  /** Takes the sample projects (and everything under them), crews and equipment out again. */
  removeSampleData(): SampleDataRecord | null {
    const record = this.sampleData();
    if (!record) return null;
    this.transaction(() => {
      for (const id of record.projectIds) this.deleteProject(id);
      for (const id of record.crewIds) this.deleteCrew(id);
      for (const id of record.equipmentIds) this.deleteEquipment(id);
      this.run("DELETE FROM workspace_settings WHERE key = 'sampleData'");
    });
    return record;
  }

  applyBusinessProfile(
    businessType: BusinessTypeId,
    account?: { id: string; name: string; email: string },
    setup?: { selectedPlan?: PlanId; selectedProducts?: OnboardingProductId[]; seats?: number }
  ) {
    if (account) this.ensureAccountUser(account);
    if (setup) this.recordWorkspaceSetup(setup);
    // Onboarding runs this when an owner picks their trade. Seed a realistic
    // starter workspace for that trade (projects, jobs, crews, a week of
    // schedule) so a brand-new account is immediately usable instead of blank.
    //
    // CRUCIAL: only ever seed an EMPTY workspace. The client fires this from the
    // "Launch Dashboard" onboarding path, which can run on more than the first
    // visit — so if any real work already exists we must leave everything
    // untouched and simply return it. Seeding used to be a clearWorkspace(),
    // which is why real accounts kept coming back empty.
    // The trade itself is recorded every time, populated workspace or not:
    // a business that changes its answer keeps its work but the whole app
    // (seed aside) re-bases on the new trade.
    this.setBusinessType(businessType);
    const hasWork = (this.get<{ n: number }>("SELECT COUNT(*) AS n FROM projects")?.n ?? 0) > 0;
    if (!hasWork) {
      // clearing and seeding land together: an interrupted seed never leaves a half-empty workspace
      this.transaction(() => {
        this.clearWorkspace();
        // Seed in seeding-mode so the profile's anchor-week dates shift onto the
        // current calendar (evergreen), exactly like the demo seed.
        this.seeding = true;
        try {
          this.insertBootstrapPayload(createBusinessProfile(businessType));
        } finally {
          this.seeding = false;
        }
      });
    }
    // Finishing the trade step is what completes onboarding; sign-ins branch on this.
    if (!this.onboardingCompletedAt()) {
      this.setWorkspaceSetting("onboardingCompletedAt", new Date().toISOString());
      this.save();
    }
    return this.bootstrap(account?.id);
  }

  projects(): Project[] {
    return this.all<Project>("SELECT * FROM projects ORDER BY name");
  }

  project(idOrSlug: string) {
    const project = this.get<Project>("SELECT * FROM projects WHERE id = ? OR slug = ?", [idOrSlug, idOrSlug]);
    if (!project) return undefined;

    return {
      project,
      phases: this.phases(project.id),
      jobs: this.jobs(project.id),
      readiness: this.readiness(project.id),
      delayIQs: this.delayIQs(project.id),
      inspections: this.inspections(project.id)
    };
  }

  /**
   * Whether this id names somebody who can be a project's manager — which now means
   * somebody on the roster, full stop. It used to read `role IN ('Project Manager',
   * 'Superintendent')`; that column went with the job titles (migration 25), and nothing
   * replaced the filter: answering for a project is an assignment, and the three levels
   * that remain are about access, so gating on one would refuse the field staff who run
   * the work. Still a real check — an id that is not a person is still refused.
   */
  canManageProject(managerId: string) {
    return Boolean(this.get<User>("SELECT id FROM users WHERE id = ?", [managerId]));
  }

  createProject(input: CreateProjectInput) {
    const project: Project = {
      id: `p-${slugify(input.name, "project")}-${Date.now()}`,
      name: input.name.trim(),
      slug: this.uniqueProjectSlug(input.name),
      location: input.location.trim(),
      address: input.address.trim(),
      type: input.type.trim(),
      contractType: input.contractType.trim(),
      managerId: input.managerId,
      targetCompletion: input.targetCompletion,
      percentComplete: input.percentComplete,
      scheduleHealth: input.scheduleHealth,
      status: input.status,
      value: input.value,
      image: projectImageForType(input.type),
      latitude: 30.2672,
      longitude: -97.7431
    };

    this.insert("projects", { ...project, value: project.value ?? null });
    this.save();
    return project;
  }

  updateProject(id: string, input: UpdateProjectInput) {
    const current = this.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
    if (!current) return undefined;

    this.run(
      `
        UPDATE projects
        SET name = ?,
            location = ?,
            address = ?,
            type = ?,
            contractType = ?,
            managerId = ?,
            targetCompletion = ?,
            percentComplete = ?,
            status = ?,
            scheduleHealth = ?,
            value = ?
        WHERE id = ?
      `,
      [
        input.name.trim(),
        input.location.trim(),
        input.address.trim(),
        input.type.trim(),
        input.contractType.trim(),
        input.managerId,
        input.targetCompletion,
        input.percentComplete,
        input.status,
        input.scheduleHealth,
        input.value ?? null,
        id
      ]
    );
    this.save();
    return this.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  }

  /* Deleting a project takes its whole subtree with it. Ten tables point at a
     project — either directly via projectId, or transitively through its jobs
     (assignments and job_dependencies key off jobId) — so they are cleared here
     rather than left as orphan rows the bootstrap payload would still ship.
     Mirrors deleteCrew()'s pattern. */
  deleteProject(id: string) {
    const current = this.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
    if (!current) return false;

    this.transaction(() => {
      const jobIds = this.all<{ id: string }>("SELECT id FROM jobs WHERE projectId = ?", [id]).map((row) => row.id);
      if (jobIds.length > 0) {
        const placeholders = jobIds.map(() => "?").join(", ");
        // The days these bookings sat on are shared with crews that stay. A clash belongs to the
        // day, so emptying one side of it leaves the other saying "Double-booked crew" for ever
        // unless the day is re-noted once the rows are gone.
        const emptied = this.all<{ crewId: string; date: string }>(
          `SELECT crewId, date FROM assignments WHERE jobId IN (${placeholders})`,
          jobIds
        );
        this.run(`DELETE FROM assignments WHERE jobId IN (${placeholders})`, jobIds);
        this.renoteDaysOf(emptied);
        this.run(`DELETE FROM job_dependencies WHERE predecessorId IN (${placeholders})`, jobIds);
        this.run(`DELETE FROM job_dependencies WHERE successorId IN (${placeholders})`, jobIds);
      }

      this.run("DELETE FROM schedule_variances WHERE projectId = ?", [id]);
      this.run("DELETE FROM field_updates WHERE projectId = ?", [id]);
      this.run("DELETE FROM delayIQs WHERE projectId = ?", [id]);
      this.run("DELETE FROM readiness WHERE projectId = ?", [id]);
      this.run("DELETE FROM inspections WHERE projectId = ?", [id]);
      this.run("DELETE FROM weather_alerts WHERE projectId = ?", [id]);
      this.run("DELETE FROM weather_conflicts WHERE projectId = ?", [id]);
      this.run("DELETE FROM weather_locations WHERE projectId = ?", [id]);
      this.run("DELETE FROM materials WHERE projectId = ?", [id]);
      this.run("DELETE FROM phases WHERE projectId = ?", [id]);
      this.run("DELETE FROM jobs WHERE projectId = ?", [id]);
      this.run("DELETE FROM projects WHERE id = ?", [id]);
    });
    return true;
  }

  /* Deleting a job takes its own subtree with it, for the same reason deleteProject does: five
     tables point at a job id and none of them is protected by a foreign key, so a row left behind
     is a row the bootstrap payload still ships to every client.

     A left-behind variance is the worst of them, and not merely untidy. acceptVariance's applyDates
     does `const job = this.job(jobId); if (!job) return;`, so a PM can accept a variance for a job
     that no longer exists: the ripple silently applies nothing and the variance is still stamped
     accepted. */
  deleteJob(id: string) {
    const current = this.get<{ id: string }>("SELECT id FROM jobs WHERE id = ?", [id]);
    if (!current) return false;

    this.transaction(() => {
      // The days these bookings sat on are shared with crews that stay. A clash belongs to the day,
      // so emptying one side of it leaves the other saying "Double-booked crew" for ever unless the
      // day is re-noted once the rows are gone.
      const emptied = this.all<{ crewId: string; date: string }>("SELECT crewId, date FROM assignments WHERE jobId = ?", [id]);
      this.run("DELETE FROM assignments WHERE jobId = ?", [id]);
      this.renoteDaysOf(emptied);
      this.run("DELETE FROM job_dependencies WHERE predecessorId = ?", [id]);
      this.run("DELETE FROM job_dependencies WHERE successorId = ?", [id]);
      this.run("DELETE FROM schedule_variances WHERE jobId = ?", [id]);
      this.run("DELETE FROM weather_conflicts WHERE jobId = ?", [id]);
      /* The variances ON this job are gone. The ones that NAME it are the subtler half: a pending
         variance raised against job B carries a CPM-computed ripple of the successors it would push,
         and one of those can be this job. acceptVariance's applyDates returns silently when a job is
         missing, so accepting such a variance would skip that leg, move the rest, and still stamp
         itself accepted -- a plan half-applied and recorded as agreed.
         The leg cannot simply be dropped: the remaining shifts and projectSlipDays were derived
         together, so a ripple with a hole in it is not a smaller true answer, it is a wrong one. The
         pending variance is therefore discarded; the field report that raised it is untouched and
         can raise a fresh one against the plan as it now stands. Resolved variances are history and
         are left alone. */
      const stale = this.all<{ id: string; proposal: string }>("SELECT id, proposal FROM schedule_variances WHERE status = 'pending'")
        .filter((row) => {
          try {
            return (JSON.parse(row.proposal) as VarianceProposal).ripple?.some((item) => item.jobId === id) ?? false;
          } catch {
            return false;
          }
        })
        .map((row) => row.id);
      for (const varianceId of stale) this.run("DELETE FROM schedule_variances WHERE id = ?", [varianceId]);
      // field_updates.jobId is nullable, but percentComplete is only meaningful against a job --
      // POST /api/field-updates refuses one without the other -- so the two move together. The
      // report itself is kept: it is what a crew actually observed on a date, and that stays true
      // after the job is gone.
      this.run("UPDATE field_updates SET jobId = NULL, percentComplete = NULL WHERE jobId = ?", [id]);
      // The Schedule Creation Tool's activity is its own row and outlives the job it was built from.
      this.run("UPDATE schedule_activities SET sourceJobId = NULL WHERE sourceJobId = ?", [id]);
      this.run("DELETE FROM jobs WHERE id = ?", [id]);
    });
    return true;
  }

  jobs(projectId?: string): Job[] {
    if (projectId) return this.all<Job>(`SELECT ${jobColumns} FROM jobs WHERE projectId = ? ORDER BY startDate`, [projectId]);
    return this.all<Job>(`SELECT ${jobColumns} FROM jobs ORDER BY startDate, startTime`);
  }

  createJob(input: CreateJobInput) {
    const job: Job = {
      id: `job-${slugify(input.name)}-${Date.now()}`,
      projectId: input.projectId,
      name: input.name.trim(),
      phase: input.phase.trim(),
      location: input.location.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      requiredLabor: input.requiredLabor,
      requiredEquipment: input.requiredEquipment.trim(),
      materialsStatus: input.materialsStatus,
      status: input.status,
      priority: input.priority,
      notes: input.notes.trim(),
      // A new job starts un-reported; only the field moves this off zero.
      percentComplete: input.percentComplete ?? 0
    };
    this.insert("jobs", job);
    this.save();
    return job;
  }

  /**
   * Bulk-create an imported schedule (P6 / MS Project) in one shot.
   *
   * Deliberately NOT a loop over createProject/createJob, for two reasons that
   * only bite at import scale:
   *  - those stamp ids with `Date.now()`, which collides as soon as two
   *    activities share a name inside one millisecond — routine in a real
   *    schedule ("Pour slab" on twenty levels). Here a monotonic counter is
   *    mixed in, so ids stay unique no matter the name.
   *  - each of them calls save(), and save() re-exports and rewrites the WHOLE
   *    SQLite file. A 2,000-activity import would be 2,000 full-file writes.
   *    This inserts everything and saves exactly once.
   */
  importSchedule(entries: ImportedScheduleProject[]): { projects: Project[]; jobs: number; phases: number } {
    const stamp = Date.now();
    let seq = 0;
    const projects: Project[] = [];
    let jobs = 0;
    let phases = 0;

    this.transaction(() => {
      for (const entry of entries) {
        const project: Project = {
          id: `p-${slugify(entry.input.name, "project")}-${stamp}-${seq++}`,
          name: entry.input.name.trim(),
          slug: this.uniqueProjectSlug(entry.input.name),
          location: entry.input.location.trim(),
          address: entry.input.address.trim(),
          type: entry.input.type.trim(),
          contractType: entry.input.contractType.trim(),
          managerId: entry.input.managerId,
          targetCompletion: entry.input.targetCompletion,
          percentComplete: entry.input.percentComplete,
          scheduleHealth: entry.input.scheduleHealth,
          status: entry.input.status,
          image: projectImageForType(entry.input.type),
          latitude: 30.2672,
          longitude: -97.7431
        };
        this.insert("projects", project);
        projects.push(project);

        for (const phase of entry.phases) {
          this.insert("phases", { id: `ph-${stamp}-${seq++}`, projectId: project.id, ...phase });
          phases += 1;
        }
        for (const job of entry.jobs) {
          this.insert("jobs", { id: `job-${slugify(job.name)}-${stamp}-${seq++}`, projectId: project.id, ...job });
          jobs += 1;
        }
      }
    });
    return { projects, jobs, phases };
  }

  job(id: string): Job | undefined {
    return this.get<Job>(`SELECT ${jobColumns} FROM jobs WHERE id = ?`, [id]);
  }

  updateJob(id: string, updates: Partial<Job>, expectedVersion?: number) {
    // Nothing writable means nothing to write — and nothing to save. Committing anyway costs a
    // full `db.export()` and a rewrite of the whole SQLite file for a request that changed nothing.
    if (!JOB_COLUMNS.some((column) => column in updates)) return this.job(id);
    this.transaction(() => {
      if (!this.writeJob(id, updates, expectedVersion)) return;
      // the materials a booking reports are the job's, so its bookings have to be told
      if (updates.materialsStatus !== undefined) this.renoteJob(id);
    });
    return this.job(id);
  }

  /** The job's editable columns after `updates` — written, not yet saved; true when anything changed. */
  private writeJob(id: string, updates: Partial<Job>, expectedVersion?: number): boolean {
    const entries = Object.entries(updates).filter(([key]) => (JOB_COLUMNS as readonly string[]).includes(key));
    if (entries.length === 0) return false;
    this.checkJobVersion(id, expectedVersion);
    // `version = version + 1` in the same statement: the row cannot be written without saying so
    const setClause = `${entries.map(([key]) => `${key} = ?`).join(", ")}, version = version + 1`;
    this.run(`UPDATE jobs SET ${setClause} WHERE id = ?`, [
      // `undefined` clears a column (e.g. reopened work drops actualFinish);
      // sql.js only binds primitives, so it has to travel as an explicit NULL.
      ...entries.map(([, value]) => (value === undefined ? null : (value as Primitive))),
      id
    ]);
    // one status model: every booking of the job shows the job's status
    if (updates.status !== undefined) this.run("UPDATE assignments SET status = ? WHERE jobId = ?", [updates.status, id]);
    return true;
  }

  crews(): Crew[] {
    const laborMixByCrew = this.all<CrewRoleCountRow>("SELECT * FROM crew_role_counts ORDER BY category, role").reduce<
      Record<string, CrewLaborMixItem[]>
    >((acc, row) => {
      acc[row.crewId] = acc[row.crewId] ?? [];
      acc[row.crewId].push({ category: row.category, role: row.role, count: row.count });
      return acc;
    }, {});

    return this.all<CrewRow>("SELECT * FROM crews ORDER BY name").map((crew) => ({
      ...crew,
      // an unset rate reads as the specialty's default, so cost is always arithmetic
      rate: crew.rate ?? defaultCrewRate(crew.specialty),
      laborMix: laborMixByCrew[crew.id] ?? []
    }));
  }

  createCrew(input: CreateCrewInput) {
    const laborMix = input.laborMix.map((item) => ({
      category: item.category,
      role: item.role.trim(),
      count: item.count
    }));
    const size = 1 + laborMix.reduce((total, item) => total + item.count, 0);
    const crew: Crew = {
      id: `crew-${slugify(input.name)}-${Date.now()}`,
      name: input.name.trim(),
      specialty: input.specialty.trim(),
      lead: input.foreman.trim(),
      size,
      capacity: 40,
      utilization: 0,
      icon: "users",
      status: "Available",
      rate: input.rate ?? defaultCrewRate(input.specialty),
      laborMix
    };
    const { laborMix: _laborMix, ...crewRow } = crew;
    this.insert("crews", crewRow);
    this.insertCrewRoleCounts(crew.id, laborMix);
    this.save();
    return crew;
  }

  updateCrew(id: string, input: UpdateCrewInput) {
    const current = this.get<CrewRow>("SELECT * FROM crews WHERE id = ?", [id]);
    if (!current) return undefined;

    const laborMix = input.laborMix.map((item) => ({
      category: item.category,
      role: item.role.trim(),
      count: item.count
    }));
    const size = 1 + laborMix.reduce((total, item) => total + item.count, 0);
    // Three writes and a re-note: the crew row, its role counts, and every day it is booked on.
    // Outside a transaction a failure part-way through leaves the role counts deleted and the
    // days half re-noted — the one state nothing else in this pass can end in.
    this.transaction(() => {
      this.run("UPDATE crews SET name = ?, specialty = ?, lead = ?, size = ?, rate = ? WHERE id = ?", [
        input.name.trim(),
        input.specialty.trim(),
        input.foreman.trim(),
        size,
        input.rate ?? current.rate ?? defaultCrewRate(input.specialty),
        id
      ]);
      this.run("DELETE FROM crew_role_counts WHERE crewId = ?", [id]);
      this.insertCrewRoleCounts(id, laborMix);
      // a crew that grew or shrank changes whether its bookings are short of labour
      if (size !== current.size)
        this.renoteDaysOf(this.all<{ crewId: string; date: string }>("SELECT crewId, date FROM assignments WHERE crewId = ?", [id]));
    });
    return this.crews().find((crew) => crew.id === id);
  }

  deleteCrew(id: string) {
    const current = this.get<CrewRow>("SELECT * FROM crews WHERE id = ?", [id]);
    if (!current) return false;

    this.transaction(() => {
      this.run("DELETE FROM assignments WHERE crewId = ?", [id]);
      this.run("DELETE FROM crew_role_counts WHERE crewId = ?", [id]);
      this.run("DELETE FROM crews WHERE id = ?", [id]);
    });
    return true;
  }

  equipment(): Equipment[] {
    return this.all<Equipment>("SELECT * FROM equipment ORDER BY type, name");
  }

  createEquipment(input: CreateEquipmentInput) {
    const equipment: Equipment = {
      id: `eq-${slugify(input.name)}-${Date.now()}`,
      name: input.name.trim(),
      type: input.type.trim(),
      status: input.status,
      assignedTo: input.assignedTo || undefined
    };
    this.insert("equipment", { ...equipment, assignedTo: equipment.assignedTo ?? null });
    this.save();
    return equipment;
  }

  updateEquipment(id: string, input: UpdateEquipmentInput) {
    const current = this.get<Equipment>("SELECT * FROM equipment WHERE id = ?", [id]);
    if (!current) return undefined;

    const equipment: Equipment = {
      id,
      name: input.name.trim(),
      type: input.type.trim(),
      status: input.status,
      assignedTo: input.assignedTo || undefined
    };
    // the row and every crew-day its status changes the meaning of, together or not at all
    this.transaction(() => {
      this.run("UPDATE equipment SET name = ?, type = ?, status = ?, assignedTo = ? WHERE id = ?", [
        equipment.name,
        equipment.type,
        equipment.status,
        equipment.assignedTo ?? null,
        id
      ]);
      // a unit in or out of maintenance changes what the bookings of the jobs that need it should say
      if (equipment.status !== current.status || equipment.name !== current.name || equipment.type !== current.type) {
        this.renoteDaysNeeding([current.name, current.type, equipment.name, equipment.type]);
      }
    });
    return equipment;
  }

  deleteEquipment(id: string) {
    const current = this.get<Equipment>("SELECT * FROM equipment WHERE id = ?", [id]);
    if (!current) return false;

    this.transaction(() => {
      this.run("DELETE FROM equipment WHERE id = ?", [id]);
      // A machine that is gone is not a machine in maintenance. The bookings of the jobs that
      // asked for it were told it was unavailable, and would have gone on saying so.
      this.renoteDaysNeeding([current.name, current.type]);
    });
    return true;
  }

  createMaterial(input: CreateMaterialInput) {
    const material: Material = {
      id: `mat-${slugify(input.name)}-${Date.now()}`,
      projectId: input.projectId,
      name: input.name.trim(),
      status: input.status,
      deliveryDate: input.deliveryDate,
      quantity: input.quantity.trim()
    };
    this.insert("materials", material);
    this.save();
    return material;
  }

  /* The Inventory's edit (2026-09-23): a material line is a leaf, like its delete below — no table
     carries a materialId and no booking note reads this table — so the row is the whole write.
     save() explicitly, for the same reason deleteMaterial gives. */
  updateMaterial(id: string, input: UpdateMaterialInput) {
    const current = this.get<{ id: string }>("SELECT id FROM materials WHERE id = ?", [id]);
    if (!current) return undefined;
    const material: Material = {
      id,
      projectId: input.projectId,
      name: input.name.trim(),
      status: input.status,
      deliveryDate: input.deliveryDate,
      quantity: input.quantity.trim()
    };
    this.run("UPDATE materials SET projectId = ?, name = ?, status = ?, deliveryDate = ?, quantity = ? WHERE id = ?", [
      material.projectId,
      material.name,
      material.status,
      material.deliveryDate,
      material.quantity,
      id
    ]);
    this.save();
    return material;
  }

  /* A material line is a leaf: no table carries a materialId, and the "Missing materials" booking
     note is derived from jobs.materialsStatus rather than from this table, so nothing needs
     re-noting and no conflict can go stale. save() explicitly, because run() only touches the
     in-memory database -- a bare run() would appear to work until the process restarted. */
  deleteMaterial(id: string) {
    const current = this.get<{ id: string }>("SELECT id FROM materials WHERE id = ?", [id]);
    if (!current) return false;
    this.run("DELETE FROM materials WHERE id = ?", [id]);
    this.save();
    return true;
  }

  materials(): Material[] {
    return this.all<Material>("SELECT * FROM materials ORDER BY deliveryDate");
  }

  resources(): ResourcesPayload {
    return {
      crews: this.crews(),
      equipment: this.equipment(),
      materials: this.materials()
    };
  }

  assignments(): ScheduleAssignment[] {
    // read-time too: whatever wrote the row, a booking shows its job's status
    return this.all<AssignmentRow & { jobStatus: Status | null }>(
      "SELECT a.*, j.status AS jobStatus FROM assignments a LEFT JOIN jobs j ON j.id = a.jobId ORDER BY a.date"
    ).map(({ jobStatus, ...row }) => toAssignment({ ...row, status: jobStatus ?? row.status }));
  }

  assignJob(input: { jobId: string; crewId: string; date: string; status?: Status }) {
    const job = this.get<Job>("SELECT * FROM jobs WHERE id = ?", [input.jobId]);
    const crew = this.get<Crew>("SELECT * FROM crews WHERE id = ?", [input.crewId]);
    if (!job || !crew) {
      throw new Error("Job or crew not found");
    }

    // A job is on a crew's day once. Booking it there again is that booking, not a second row.
    const already = this.bookingFor(input.jobId, input.crewId, input.date);
    if (already) return already;

    const conflicts = this.detectConflicts(input.jobId, input.crewId, input.date);
    const assignment: ScheduleAssignment = {
      id: `as-${Date.now()}`,
      jobId: input.jobId,
      crewId: input.crewId,
      date: input.date,
      // a booking wears its job's status; a clash is a note on it, not a status of its own
      status: job.status,
      conflicts
    };

    // the row and the notes its arrival changes go in together, or neither does
    this.transaction(() => {
      this.insert("assignments", { ...assignment, conflicts: JSON.stringify(conflicts) });
      // the bookings already on that crew's day are part of the same clash
      this.renoteCrewDay(input.crewId, input.date);
    });
    return this.assignment(assignment.id) ?? assignment;
  }

  updateAssignment(id: string, updates: Partial<ScheduleAssignment>) {
    // the move and the notes on both days it touches go in together, or neither does
    return this.transaction(() => this.writeAssignment(id, updates));
  }

  /** The row after `updates`, with its conflict notes recomputed — written, not yet saved to disk. */
  private writeAssignment(id: string, updates: Partial<ScheduleAssignment>, expectedVersion?: number) {
    const current = this.get<AssignmentRow>("SELECT * FROM assignments WHERE id = ?", [id]);
    if (!current) return undefined;
    this.checkBookingVersion(id, current, expectedVersion);
    const jobId = updates.jobId ?? current.jobId;
    // a booking points at a crew and a job; without these checks a typo writes a row that points at neither
    const crewId = updates.crewId ?? current.crewId;
    if (updates.crewId && !this.get("SELECT id FROM crews WHERE id = ?", [crewId])) throw new Error(`Crew ${crewId} not found`);
    if (updates.jobId && !this.get("SELECT id FROM jobs WHERE id = ?", [jobId])) throw new Error(`Job ${jobId} not found`);
    const next = {
      jobId,
      crewId: updates.crewId ?? current.crewId,
      date: updates.date ?? current.date,
      // a booking wears its job's status
      status: this.get<{ status: Status }>("SELECT status FROM jobs WHERE id = ?", [jobId])?.status ?? current.status
    };
    const conflicts = this.detectConflicts(next.jobId, next.crewId, next.date, id);
    this.run("UPDATE assignments SET jobId = ?, crewId = ?, date = ?, status = ?, conflicts = ?, version = version + 1 WHERE id = ?", [
      next.jobId,
      next.crewId,
      next.date,
      next.status,
      JSON.stringify(conflicts),
      id
    ]);
    // both days change: the one it joined, and the one it left behind
    this.renoteCrewDay(next.crewId, next.date);
    if (current.crewId !== next.crewId || current.date !== next.date) this.renoteCrewDay(current.crewId, current.date);
    return this.assignment(id);
  }

  /** True when a booking was there to remove; false when the id names nothing. */
  deleteAssignment(id: string) {
    const row = this.get<{ crewId: string; date: string }>("SELECT crewId, date FROM assignments WHERE id = ?", [id]);
    if (!row) return false;
    this.transaction(() => {
      this.run("DELETE FROM assignments WHERE id = ?", [id]);
      // what it shared the day with may not be double-booked any more
      this.renoteCrewDay(row.crewId, row.date);
    });
    return true;
  }

  assignment(id: string): ScheduleAssignment | undefined {
    const row = this.get<AssignmentRow & { jobStatus: Status | null }>(
      "SELECT a.*, j.status AS jobStatus FROM assignments a LEFT JOIN jobs j ON j.id = a.jobId WHERE a.id = ?",
      [id]
    );
    if (!row) return undefined;
    const { jobStatus, ...rest } = row;
    return toAssignment({ ...rest, status: jobStatus ?? rest.status });
  }

  /**
   * Refuses a write made against a copy of the row that somebody else has since replaced.
   *
   * The version travels with the row the client read and comes back with the write. When it does
   * not match, nothing is written and the caller is told what the row says now — which is the
   * difference between "your change did not land" and the silence that used to follow it. A write
   * that sends no version is not checked: the imports, the seed and the older callers do not read
   * a row before replacing it, and refusing those would be a different change.
   */
  private checkJobVersion(id: string, expected?: number) {
    if (expected == null) return;
    const row = this.get<{ version: number; name: string; startDate: string }>("SELECT version, name, startDate FROM jobs WHERE id = ?", [
      id
    ]);
    if (!row || row.version === expected) return;
    throw new StaleWriteError(`${row.name} was changed by someone else while you had it open, so nothing was saved.`, {
      id,
      version: row.version,
      startDate: row.startDate
    });
  }

  private checkBookingVersion(id: string, current: AssignmentRow & { version?: number }, expected?: number) {
    if (expected == null || current.version === undefined || current.version === expected) return;
    const job = this.get<{ name: string }>("SELECT name FROM jobs WHERE id = ?", [current.jobId]);
    const crew = this.get<{ name: string }>("SELECT name FROM crews WHERE id = ?", [current.crewId]);
    throw new StaleWriteError(
      `${job?.name ?? "That job"} is now with ${crew?.name ?? "another crew"} on ${current.date.slice(0, 10)} — somebody moved it while you had it open, so nothing was saved.`,
      { id, version: current.version, crewId: current.crewId, date: current.date }
    );
  }

  /**
   * Re-notes every booking on a crew's day. A clash belongs to the day, not to whichever row
   * arrived last: a booking that joins or leaves changes what the others should say, so both
   * sides of a double-booking carry it, and removing one clears the note on the rest.
   */
  private renoteCrewDay(crewId: string, date: string) {
    const rows = this.all<{ id: string; jobId: string }>("SELECT id, jobId FROM assignments WHERE crewId = ? AND date = ?", [crewId, date]);
    for (const row of rows) {
      this.run("UPDATE assignments SET conflicts = ? WHERE id = ?", [
        JSON.stringify(this.detectConflicts(row.jobId, crewId, date, row.id)),
        row.id
      ]);
    }
  }

  /** Re-notes every crew-day whose job asks for one of these machines, by name or by type. */
  private renoteDaysNeeding(names: Array<string | undefined>) {
    for (const name of new Set(names.filter((value): value is string => Boolean(value)))) {
      this.renoteDaysOf(
        this.all<{ crewId: string; date: string }>(
          "SELECT a.crewId AS crewId, a.date AS date FROM assignments a JOIN jobs j ON j.id = a.jobId WHERE ? LIKE '%' || j.requiredEquipment || '%' AND j.requiredEquipment <> ''",
          [name]
        )
      );
    }
  }

  /** Re-notes each crew-day these bookings sit on, once per day. */
  private renoteDaysOf(rows: Array<{ crewId: string; date: string }>) {
    const days = new Map<string, { crewId: string; date: string }>();
    for (const row of rows) days.set(`${row.crewId}\u0000${row.date}`, row);
    for (const day of days.values()) this.renoteCrewDay(day.crewId, day.date);
  }

  /**
   * Re-notes the bookings of a job. A note is derived from the job's materials, its crew's size and
   * its equipment's status, so a change to any of those makes what the bookings say untrue until this runs.
   */
  private renoteJob(jobId: string) {
    this.renoteDaysOf(this.all<{ crewId: string; date: string }>("SELECT crewId, date FROM assignments WHERE jobId = ?", [jobId]));
  }

  /** The booking this job already has on that crew's day, if any — one job on a crew-day is one booking. */
  bookingFor(jobId: string, crewId: string, date: string): ScheduleAssignment | undefined {
    const row = this.get<AssignmentRow>(
      "SELECT * FROM assignments WHERE jobId = ? AND crewId = ? AND substr(date, 1, 10) = substr(?, 1, 10)",
      [jobId, crewId, date]
    );
    return row ? this.assignment(row.id) : undefined;
  }

  /** The bookings already on `crewId` × `date` for another job — what the client asks about before double-booking. */
  crewClashes(crewId: string, date: string, movingJobId: string, ignoreAssignmentId?: string): CrewClash[] {
    const rows = this.all<AssignmentRow>(
      `SELECT * FROM assignments WHERE crewId = ? AND date = ?${ignoreAssignmentId ? " AND id != ?" : ""}`,
      ignoreAssignmentId ? [crewId, date, ignoreAssignmentId] : [crewId, date]
    );
    return this.describeClashes(
      rows.map((row) => ({ crewId, date, jobId: row.jobId })),
      movingJobId
    );
  }

  private describeClashes(rows: Array<{ crewId: string; date: string; jobId: string }>, movingJobId: string): CrewClash[] {
    const moving = this.get<{ name: string }>("SELECT name FROM jobs WHERE id = ?", [movingJobId]);
    return rows
      .filter((row) => row.jobId !== movingJobId)
      .map((row) => ({
        crewId: row.crewId,
        crewName: this.get<{ name: string }>("SELECT name FROM crews WHERE id = ?", [row.crewId])?.name ?? row.crewId,
        date: row.date,
        jobId: row.jobId,
        jobName: this.get<{ name: string }>("SELECT name FROM jobs WHERE id = ?", [row.jobId])?.name ?? row.jobId,
        movingJobId,
        movingJobName: moving?.name ?? movingJobId
      }));
  }

  /**
   * A set of schedule moves as one transaction: every step applies, or none of
   * them does. The state after the batch is worked out first, so a crew that would
   * end up double-booked stops the whole batch with the clashes — unless `force`
   * says the planner has chosen to double-book, in which case the notes are kept
   * on the bookings as they always were.
   */
  rebook(moves: RebookMove[], options: { force?: boolean } = {}): RebookResult {
    type Draft = { id: string; jobId: string; crewId: string; date: string; status: Status };
    const rows = new Map<string, Draft>(
      this.all<AssignmentRow>("SELECT * FROM assignments").map((row) => [
        row.id,
        { id: row.id, jobId: row.jobId, crewId: row.crewId, date: row.date, status: row.status }
      ])
    );
    // where each booking started, so the day it leaves is re-noted too
    const origin = new Map([...rows.values()].map((row) => [row.id, { crewId: row.crewId, date: row.date }]));
    const touched = new Set<string>();
    const removed: string[] = [];
    const jobIds: string[] = [];
    const planned: Array<{ move: RebookMove; id: string }> = [];
    let sequence = 0;
    for (const move of moves) {
      if (move.op === "move") {
        const row = rows.get(move.id);
        if (!row) throw new Error(`Booking ${move.id} not found`);
        if (move.crewId && !this.get("SELECT id FROM crews WHERE id = ?", [move.crewId])) throw new Error(`Crew ${move.crewId} not found`);
        rows.set(move.id, { ...row, crewId: move.crewId ?? row.crewId, date: move.date ?? row.date });
        touched.add(move.id);
        planned.push({ move, id: move.id });
      } else if (move.op === "book") {
        const bookedJob = this.get<{ status: Status }>("SELECT status FROM jobs WHERE id = ?", [move.jobId]);
        if (!bookedJob) throw new Error(`Job ${move.jobId} not found`);
        if (!this.get("SELECT id FROM crews WHERE id = ?", [move.crewId])) throw new Error(`Crew ${move.crewId} not found`);
        // the same job already on that crew's day is that booking; the step keeps it instead of adding a second row
        const day = move.date.slice(0, 10);
        const already = [...rows.values()].find(
          (row) => row.jobId === move.jobId && row.crewId === move.crewId && row.date.slice(0, 10) === day
        );
        if (already) {
          touched.add(already.id);
          continue;
        }
        const id = `as-${Date.now()}-${sequence++}`;
        rows.set(id, { id, jobId: move.jobId, crewId: move.crewId, date: move.date, status: bookedJob.status });
        touched.add(id);
        planned.push({ move, id });
      } else if (move.op === "unbook") {
        if (!rows.delete(move.id)) throw new Error(`Booking ${move.id} not found`);
        touched.delete(move.id);
        removed.push(move.id);
        planned.push({ move, id: move.id });
      } else {
        if (!this.get("SELECT id FROM jobs WHERE id = ?", [move.id])) throw new Error(`Job ${move.id} not found`);
        jobIds.push(move.id);
        planned.push({ move, id: move.id });
      }
    }

    const clashes: CrewClash[] = [];
    for (const id of touched) {
      const row = rows.get(id);
      if (!row) continue;
      for (const other of rows.values()) {
        if (other.id !== id && other.crewId === row.crewId && other.date === row.date && other.jobId !== row.jobId) {
          clashes.push(...this.describeClashes([{ crewId: other.crewId, date: other.date, jobId: other.jobId }], row.jobId));
        }
      }
    }
    if (clashes.length > 0 && !options.force) throw new RebookConflictError(clashes);

    this.transaction(() => {
      for (const { move, id } of planned) {
        const row = rows.get(id);
        if (move.op === "move" && row) {
          this.writeAssignment(id, { crewId: row.crewId, date: row.date, status: row.status }, move.version);
        } else if (move.op === "book" && row) {
          const conflicts = this.detectConflicts(row.jobId, row.crewId, row.date, id);
          this.insert("assignments", { ...row, conflicts: JSON.stringify(conflicts) });
        } else if (move.op === "unbook") {
          this.run("DELETE FROM assignments WHERE id = ?", [id]);
        } else if (move.op === "job") {
          // the dates, and whatever else the same save changed (a status, a note): one step, one transaction
          const fields = Object.fromEntries(
            Object.entries(move).filter(([key]) => key !== "op" && key !== "id" && key !== "version")
          ) as Partial<Job>;
          this.writeJob(id, fields, move.version);
          // The same change through PATCH /api/jobs/:id re-notes the job's bookings, and a move
          // may carry a materials change with it. Re-noting only the days this batch touched
          // would leave the job's other bookings saying what is no longer true.
          if (fields.materialsStatus !== undefined) this.renoteJob(id);
        }
      }
      // Every crew-day the batch touched is re-noted once, after the whole batch: the days bookings
      // arrived on, the days they left, and the neighbours that never moved but now share a day.
      const days = new Map<string, { crewId: string; date: string }>();
      const note = (day: { crewId: string; date: string } | undefined) => {
        if (day) days.set(`${day.crewId}\u0000${day.date}`, day);
      };
      for (const id of touched) {
        note(origin.get(id));
        note(rows.get(id));
      }
      for (const id of removed) note(origin.get(id));
      for (const day of days.values()) this.renoteCrewDay(day.crewId, day.date);
    });

    return {
      assignments: [...touched].map((id) => this.assignment(id)).filter((item): item is ScheduleAssignment => Boolean(item)),
      removed,
      jobs: jobIds.map((id) => this.job(id)).filter((item): item is Job => Boolean(item)),
      clashes
    };
  }

  private detectConflicts(jobId: string, crewId: string, date: string, ignoreAssignmentId?: string) {
    const conflicts: string[] = [];
    // Another job on this crew's day is a double-booking; this job's own other rows are not —
    // the clash rule says so, and this note has to agree with the rule that allowed the booking.
    const existing = this.all<ScheduleAssignment>(
      `SELECT * FROM assignments WHERE crewId = ? AND date = ? AND jobId != ?${ignoreAssignmentId ? " AND id != ?" : ""}`,
      ignoreAssignmentId ? [crewId, date, jobId, ignoreAssignmentId] : [crewId, date, jobId]
    );
    if (existing.length > 0) conflicts.push("Double-booked crew");

    const job = this.get<Job>("SELECT * FROM jobs WHERE id = ?", [jobId]);
    const crew = this.get<Crew>("SELECT * FROM crews WHERE id = ?", [crewId]);
    if (job && crew && job.requiredLabor > crew.size) conflicts.push("Crew lacks required labor");
    if (job?.materialsStatus === "Missing" || job?.materialsStatus === "Waiting on Delivery") conflicts.push("Missing materials");

    const matchingEquipment = this.get<Equipment>("SELECT * FROM equipment WHERE name LIKE ? OR type LIKE ?", [
      `%${job?.requiredEquipment ?? ""}%`,
      `%${job?.requiredEquipment ?? ""}%`
    ]);
    if (job?.requiredEquipment && matchingEquipment?.status === "Maintenance") conflicts.push("Required equipment unavailable");

    return Array.from(new Set(conflicts));
  }

  fieldUpdates(): FieldUpdate[] {
    return this.all<FieldUpdateRow>("SELECT * FROM field_updates ORDER BY createdAt DESC").map(toFieldUpdate);
  }

  createFieldUpdate(input: {
    projectId: string;
    jobId?: string;
    userId: string;
    message: string;
    status: Status;
    photos?: string[];
    percentComplete?: number;
  }) {
    const update: FieldUpdate = {
      id: `fu-${Date.now()}`,
      projectId: input.projectId,
      jobId: input.jobId,
      userId: input.userId,
      message: input.message,
      status: input.status,
      createdAt: new Date().toISOString(),
      photos: input.photos ?? [],
      percentComplete: input.percentComplete
    };
    this.insert("field_updates", {
      ...update,
      jobId: update.jobId ?? null,
      photos: JSON.stringify(update.photos),
      percentComplete: update.percentComplete ?? null
    });
    this.save();
    return update;
  }

  /**
   * Correct an existing report. `userId` and `createdAt` are deliberately NOT
   * editable: who filed it and when are the record, and rewriting them would
   * detach the entry from the history the schedule was priced against. Everything
   * the crew can get wrong in the moment — project, job, status, note, photos and
   * the reported percent — is fair game.
   */
  updateFieldUpdate(
    id: string,
    input: {
      projectId: string;
      jobId?: string;
      message: string;
      status: Status;
      photos?: string[];
      percentComplete?: number;
    }
  ): FieldUpdate | undefined {
    const current = this.get<FieldUpdateRow>("SELECT * FROM field_updates WHERE id = ?", [id]);
    if (!current) return undefined;

    const update: FieldUpdate = {
      id,
      projectId: input.projectId,
      jobId: input.jobId,
      userId: current.userId,
      message: input.message,
      status: input.status,
      createdAt: current.createdAt,
      photos: input.photos ?? [],
      percentComplete: input.percentComplete
    };
    this.run("UPDATE field_updates SET projectId = ?, jobId = ?, message = ?, status = ?, photos = ?, percentComplete = ? WHERE id = ?", [
      update.projectId,
      update.jobId ?? null,
      update.message,
      update.status,
      JSON.stringify(update.photos),
      update.percentComplete ?? null,
      id
    ]);
    this.save();
    return update;
  }

  /* ── Field progress → schedule variance loop ───────────────────────────────
     applyFieldProgress writes the crew's number through to the job (a fact they
     own). recordVariance parks the *schedule* consequence for review.
     acceptVariance is the only path that moves planned dates from a field
     report, and it only runs when a PM says so. */

  /**
   * Write reported progress onto the job. Percent always lands; dates never move
   * here. Stamps actualStart on the first report of real work and actualFinish
   * at 100% so the job carries its own as-built record.
   */
  applyFieldProgress(jobId: string, percentComplete: number, asOf: string): Job | undefined {
    const job = this.job(jobId);
    if (!job) return undefined;
    const date = asOf.slice(0, 10);
    const updates: Partial<Job> = { percentComplete };
    if (percentComplete > 0 && !job.actualStart) updates.actualStart = date;
    if (percentComplete >= 100 && !job.actualFinish) updates.actualFinish = date;
    // Reopened work (100% → less) drops the finish stamp; it isn't finished.
    if (percentComplete < 100 && job.actualFinish) updates.actualFinish = undefined;
    return this.updateJob(jobId, updates);
  }

  variances(status?: ScheduleVariance["status"]): ScheduleVariance[] {
    if (status)
      return this.all<VarianceRow>("SELECT * FROM schedule_variances WHERE status = ? ORDER BY detectedAt DESC", [status]).map(toVariance);
    return this.all<VarianceRow>("SELECT * FROM schedule_variances ORDER BY detectedAt DESC").map(toVariance);
  }

  variance(id: string): ScheduleVariance | undefined {
    return this.all<VarianceRow>("SELECT * FROM schedule_variances WHERE id = ?", [id]).map(toVariance)[0];
  }

  recordVariance(input: Omit<ScheduleVariance, "id" | "status" | "detectedAt"> & { detectedAt?: string }): ScheduleVariance {
    // One open question per job. A newer report supersedes the last one rather
    // than stacking — the PM should answer "where is this job now", not work
    // through every guess the crew made on the way there.
    const open = this.all<VarianceRow>("SELECT * FROM schedule_variances WHERE jobId = ? AND status = 'pending'", [input.jobId]);
    for (const row of open) {
      this.db.run("UPDATE schedule_variances SET status = 'superseded', resolvedAt = ? WHERE id = ?", [new Date().toISOString(), row.id]);
    }

    const variance: ScheduleVariance = {
      ...input,
      id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      detectedAt: input.detectedAt ?? new Date().toISOString()
    };
    this.insert("schedule_variances", {
      ...variance,
      proposal: JSON.stringify(variance.proposal),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null
    });
    this.save();
    return variance;
  }

  /**
   * Believe the field: move the reporting job's dates onto the forecastIQ, then
   * push the successors the CPM ripple named. The baseline is deliberately left
   * alone — that is what the slip stays measurable against.
   */
  acceptVariance(id: string, userId: string, note?: string): { variance: ScheduleVariance; movedJobIds: string[] } | undefined {
    const variance = this.variance(id);
    if (!variance || variance.status !== "pending") return undefined;

    const movedJobIds: string[] = [];
    const applyDates = (jobId: string, startDate: string, endDate: string) => {
      const job = this.job(jobId);
      if (!job || (job.startDate === startDate && job.endDate === endDate)) return;
      this.updateJob(jobId, { startDate, endDate });
      movedJobIds.push(jobId);
    };

    const resolvedAt = new Date().toISOString();
    // the job, its ripple and the decision land together, or not at all
    this.transaction(() => {
      applyDates(variance.jobId, variance.proposal.proposedStart, variance.proposal.proposedEnd);
      for (const item of variance.proposal.ripple) applyDates(item.jobId, item.proposedStart, item.proposedEnd);
      this.db.run("UPDATE schedule_variances SET status = 'accepted', resolvedAt = ?, resolvedBy = ?, resolutionNote = ? WHERE id = ?", [
        resolvedAt,
        userId,
        note ?? null,
        id
      ]);
    });
    return {
      variance: { ...variance, status: "accepted", resolvedAt, resolvedBy: userId, resolutionNote: note },
      movedJobIds
    };
  }

  /**
   * Keep the plan. The report stays on the record and the job keeps the
   * reported percent — the PM is overriding the *schedule* conclusion, not
   * disputing what the crew saw.
   */
  rejectVariance(id: string, userId: string, note?: string): ScheduleVariance | undefined {
    const variance = this.variance(id);
    if (!variance || variance.status !== "pending") return undefined;
    const resolvedAt = new Date().toISOString();
    this.db.run("UPDATE schedule_variances SET status = 'rejected', resolvedAt = ?, resolvedBy = ?, resolutionNote = ? WHERE id = ?", [
      resolvedAt,
      userId,
      note ?? null,
      id
    ]);
    this.save();
    return { ...variance, status: "rejected", resolvedAt, resolvedBy: userId, resolutionNote: note };
  }

  delayIQs(projectId?: string): DelayIQ[] {
    if (projectId) return this.all<DelayIQ>("SELECT * FROM delayIQs WHERE projectId = ? ORDER BY reportedAt DESC", [projectId]);
    return this.all<DelayIQ>("SELECT * FROM delayIQs ORDER BY reportedAt DESC");
  }

  /* ── Weekly schedule snapshots ─────────────────────────────────────────────
     A reading of where each project stood, taken once a week. Their only job is
     to make "improved by N days from last week" a real comparison rather than a
     decorative delta — without a stored prior week there is nothing honest to
     compare against. */

  scheduleSnapshots(weekOf: string): ScheduleSnapshotRow[] {
    return this.all<ScheduleSnapshotRow>("SELECT * FROM schedule_snapshots WHERE weekOf = ?", [weekOf]);
  }

  /** The portfolio's weekly readings, oldest first — the Dashboard draws its trend lines from these. */
  scheduleSnapshotHistory(weeks = 12): ScheduleSnapshotRow[] {
    return this.all<ScheduleSnapshotRow>("SELECT * FROM schedule_snapshots WHERE projectId = '' ORDER BY weekOf DESC LIMIT ?", [
      weeks
    ]).reverse();
  }

  /**
   * Idempotent per (weekOf, projectId): the first reading of a week is the one
   * kept. The one exception is a measure the row has never held — added after
   * the row was written — which takes the first reading offered for it.
   */
  recordScheduleSnapshot(
    input: Omit<ScheduleSnapshotRow, "id" | "capturedAt" | keyof ScheduleSnapshotMeasures> & Partial<ScheduleSnapshotMeasures>
  ) {
    const existing = this.get<ScheduleSnapshotRow>("SELECT * FROM schedule_snapshots WHERE weekOf = ? AND projectId = ?", [
      input.weekOf,
      input.projectId
    ]);
    if (existing) {
      const missing = SNAPSHOT_MEASURES.filter((key) => existing[key] == null && typeof input[key] === "number");
      if (missing.length === 0) return existing;
      this.run(`UPDATE schedule_snapshots SET ${missing.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`, [
        ...missing.map((key) => input[key] as number),
        existing.id
      ]);
      this.save();
      return { ...existing, ...Object.fromEntries(missing.map((key) => [key, input[key]])) } as ScheduleSnapshotRow;
    }

    const row: ScheduleSnapshotRow = {
      ...input,
      onTrackProjects: input.onTrackProjects ?? null,
      projects: input.projects ?? null,
      crewUtilization: input.crewUtilization ?? null,
      id: `snap-${input.weekOf}-${input.projectId || "portfolio"}`,
      capturedAt: new Date().toISOString()
    };
    this.insert("schedule_snapshots", row);
    this.save();
    return row;
  }

  /* ── Weekly plan snapshots (the digest's memory) ── */

  planSnapshot(weekOf: string): PlanSnapshotLike | null {
    const row = this.get<{ plan: string }>("SELECT plan FROM schedule_plan_snapshots WHERE weekOf = ?", [weekOf]);
    if (!row) return null;
    try {
      return JSON.parse(row.plan) as PlanSnapshotLike;
    } catch {
      return null;
    }
  }

  /** The newest snapshot filed before `weekOf`, or null. */
  previousPlanSnapshot(weekOf: string): PlanSnapshotLike | null {
    const row = this.get<{ plan: string }>("SELECT plan FROM schedule_plan_snapshots WHERE weekOf < ? ORDER BY weekOf DESC LIMIT 1", [
      weekOf
    ]);
    if (!row) return null;
    try {
      return JSON.parse(row.plan) as PlanSnapshotLike;
    } catch {
      return null;
    }
  }

  /** Idempotent per week: the first reading of a week is the one kept. */
  recordPlanSnapshot<T extends PlanSnapshotLike>(snapshot: T): T {
    const existing = this.planSnapshot(snapshot.weekOf);
    if (existing) return existing as T;
    this.run("INSERT INTO schedule_plan_snapshots (weekOf, capturedAt, plan) VALUES (?, ?, ?)", [
      snapshot.weekOf,
      snapshot.capturedAt,
      JSON.stringify(snapshot)
    ]);
    this.save();
    return snapshot;
  }

  createDelayIQ(input: Omit<DelayIQ, "id" | "reportedAt">) {
    const delayIQ: DelayIQ = {
      id: `delayIQ-${Date.now()}`,
      reportedAt: new Date().toISOString().slice(0, 10),
      ...input
    };
    this.insert("delayIQs", delayIQ);
    this.save();
    return delayIQ;
  }

  /* ── Contact-sales leads ──────────────────────────────────────────────────────
     The "Talk to sales" form (POST /api/contact-sales) keeps each lead in sales_leads,
     so a lead is on record even while email runs in log mode. The Sales & Support Desk
     console that read and worked these rows (and its other tables) left the repo on
     2026-09-23; the tables stay so existing data is kept. ─────────────────────────── */
  private newId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  createSalesLead(input: {
    name: string;
    email: string;
    company: string;
    phone?: string;
    teamSize?: string;
    interest?: string;
    status?: SalesLeadStatus;
    value?: number;
    owner?: string;
    source?: string;
    notes?: string;
  }): SalesLeadRow {
    const nowIso = new Date().toISOString();
    const lead: SalesLeadRow = {
      id: this.newId("lead"),
      name: input.name,
      email: input.email,
      phone: input.phone ?? "",
      company: input.company,
      teamSize: input.teamSize ?? "",
      interest: input.interest ?? "",
      status: input.status ?? "New",
      value: input.value ?? 0,
      owner: input.owner ?? "",
      source: input.source ?? "",
      notes: input.notes ?? "",
      createdAt: nowIso,
      lastActivityAt: null
    };
    this.insert("sales_leads", lead);
    this.save();
    return lead;
  }

  /* ── waitlist (removable feature) ─────────────────────────────────────────
     Pre-launch email signups. To remove: delete this block, the `waitlist`
     table in migrate(), server/src/email.ts, and the waitlist routes in app.ts.
     ──────────────────────────────────────────────────────────────────────── */
  waitlistCount(): number {
    return this.get<{ n: number }>("SELECT COUNT(*) AS n FROM waitlist")?.n ?? 0;
  }

  /* ── Updates page "Subscribe" ────────────────────────────────────────────
     Emails that asked for each release as it ships. Separate list from the
     waitlist above; see the table comment in migrate(). ──────────────────── */
  updateSubscriberCount(): number {
    return this.get<{ n: number }>("SELECT COUNT(*) AS n FROM update_subscribers")?.n ?? 0;
  }

  addUpdateSubscriber(email: string): { email: string; count: number; alreadySubscribed: boolean } {
    const normalized = email.trim().toLowerCase();
    const existing = this.get<{ email: string }>("SELECT email FROM update_subscribers WHERE email = ?", [normalized]);
    if (!existing) {
      this.insert("update_subscribers", { email: normalized, createdAt: new Date().toISOString() });
    }
    return { email: normalized, count: this.updateSubscriberCount(), alreadySubscribed: Boolean(existing) };
  }

  addWaitlistSubscriber(email: string): { email: string; count: number; alreadyJoined: boolean } {
    const normalized = email.trim().toLowerCase();
    const existing = this.get<{ email: string }>("SELECT email FROM waitlist WHERE email = ?", [normalized]);
    if (!existing) {
      this.insert("waitlist", { email: normalized, createdAt: new Date().toISOString(), notifiedAt: null });
      this.save();
    }
    return { email: normalized, count: this.waitlistCount(), alreadyJoined: Boolean(existing) };
  }

  pendingWaitlistSubscribers(): string[] {
    return this.all<{ email: string }>("SELECT email FROM waitlist WHERE notifiedAt IS NULL ORDER BY createdAt").map((row) => row.email);
  }

  markWaitlistNotified(emails: string[]) {
    if (emails.length === 0) return;
    const at = new Date().toISOString();
    for (const email of emails) this.run("UPDATE waitlist SET notifiedAt = ? WHERE email = ?", [at, email]);
    this.save();
  }
  /* ─────────────────────────── end waitlist ──────────────────────────────── */

  readiness(projectId?: string): ReadinessItem[] {
    type ReadinessRow = Omit<ReadinessItem, "complete"> & { complete: number };
    const rows = projectId
      ? this.all<ReadinessRow>("SELECT * FROM readiness WHERE projectId = ? ORDER BY id", [projectId])
      : this.all<ReadinessRow>("SELECT * FROM readiness ORDER BY id");
    return rows.map((row) => ({ ...row, complete: Boolean(row.complete) }));
  }

  phase(id: string): Phase | undefined {
    return this.get<Phase>("SELECT * FROM phases WHERE id = ?", [id]);
  }

  /**
   * A phase's dates, one or both. The Month calendar draws a marker on every phase's finish and
   * lets a planner drag it, so the finish is writable on its own; the caller has already checked
   * that the span still runs forwards.
   */
  updatePhase(id: string, input: UpdatePhaseInput): Phase | undefined {
    const current = this.phase(id);
    if (!current) return undefined;
    const startDate = input.startDate ?? current.startDate;
    const endDate = input.endDate ?? current.endDate;
    if (startDate === current.startDate && endDate === current.endDate) return current;
    this.run("UPDATE phases SET startDate = ?, endDate = ? WHERE id = ?", [startDate, endDate, id]);
    this.save();
    return this.phase(id);
  }

  phases(projectId?: string): Phase[] {
    if (projectId) return this.all<Phase>("SELECT * FROM phases WHERE projectId = ? ORDER BY sequence", [projectId]);
    return this.all<Phase>("SELECT * FROM phases ORDER BY projectId, sequence");
  }

  inspections(projectId?: string): Inspection[] {
    if (projectId) return this.all<Inspection>("SELECT * FROM inspections WHERE projectId = ? ORDER BY scheduledAt", [projectId]);
    return this.all<Inspection>("SELECT * FROM inspections ORDER BY scheduledAt");
  }

  weatherAlerts(): WeatherAlert[] {
    return this.all<WeatherAlert>("SELECT * FROM weather_alerts ORDER BY startsAt");
  }

  /* ── WeatherIQ (2026-09-23) ────────────────────────────────────────────────
     The job days this week's weather reaches (found by weatherConflicts.ts each time the
     forecast is read) and what the person in charge decided about them, plus the location an
     Owner or Admin set for a project's forecast. */

  /** Conflicts from `from` on, soonest first. A cleared one — the forecast no longer shows it — is left out unless asked for. */
  weatherConflicts(options: { from?: string; includeCleared?: boolean } = {}): WeatherConflict[] {
    const where: string[] = [];
    const params: string[] = [];
    if (options.from) {
      where.push("date >= ?");
      params.push(options.from);
    }
    if (!options.includeCleared) where.push("status != 'cleared'");
    const sql = `SELECT * FROM weather_conflicts${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY date, startsAt`;
    return this.all<WeatherConflictRow>(sql, params).map(toWeatherConflict);
  }

  weatherConflict(id: string): WeatherConflict | undefined {
    const row = this.get<WeatherConflictRow>("SELECT * FROM weather_conflicts WHERE id = ?", [id]);
    return row ? toWeatherConflict(row) : undefined;
  }

  /**
   * Bring the stored conflicts in line with a fresh read of the forecast. A new one is added as
   * open; an open (or cleared) one takes the new window, cause and person in charge; a decided one
   * — called off or kept — is left exactly as the person left it. An open one the forecast no longer
   * shows, on a day this read covered for a site it read, is cleared.
   */
  reconcileWeatherConflicts(
    drafts: Array<
      Pick<WeatherConflict, "id" | "jobId" | "projectId" | "date" | "cause" | "severity" | "start" | "end" | "reason" | "assigneeId">
    >,
    covered: { projectIds: string[]; from: string; to: string },
    now = new Date().toISOString()
  ) {
    this.transaction(() => {
      const seen = new Set<string>();
      for (const draft of drafts) {
        seen.add(draft.id);
        const current = this.get<WeatherConflictRow>("SELECT * FROM weather_conflicts WHERE id = ?", [draft.id]);
        if (!current) {
          this.insert("weather_conflicts", {
            id: draft.id,
            jobId: draft.jobId,
            projectId: draft.projectId,
            date: draft.date,
            cause: draft.cause,
            severity: draft.severity,
            startsAt: draft.start,
            endsAt: draft.end,
            reason: draft.reason,
            assigneeId: draft.assigneeId,
            status: "open",
            detectedAt: now,
            updatedAt: now,
            decidedAt: null,
            decidedBy: null,
            varianceId: null,
            delayIQId: null
          });
          continue;
        }
        if (current.status !== "open" && current.status !== "cleared") continue;
        const changed =
          current.status === "cleared" ||
          current.cause !== draft.cause ||
          current.severity !== draft.severity ||
          current.startsAt !== draft.start ||
          current.endsAt !== draft.end ||
          current.reason !== draft.reason ||
          current.assigneeId !== draft.assigneeId;
        if (!changed) continue;
        this.run(
          "UPDATE weather_conflicts SET status = 'open', cause = ?, severity = ?, startsAt = ?, endsAt = ?, reason = ?, assigneeId = ?, updatedAt = ? WHERE id = ?",
          [draft.cause, draft.severity, draft.start, draft.end, draft.reason, draft.assigneeId, now, draft.id]
        );
      }
      if (covered.projectIds.length === 0) return;
      const placeholders = covered.projectIds.map(() => "?").join(",");
      const open = this.all<{ id: string }>(
        `SELECT id FROM weather_conflicts WHERE status = 'open' AND date >= ? AND date <= ? AND projectId IN (${placeholders})`,
        [covered.from, covered.to, ...covered.projectIds]
      );
      for (const row of open) {
        if (seen.has(row.id)) continue;
        this.run("UPDATE weather_conflicts SET status = 'cleared', updatedAt = ? WHERE id = ?", [now, row.id]);
      }
    });
  }

  /** The person in charge kept the day on: the conflict stays on the record, and stops asking. */
  keepWeatherConflict(id: string, userId: string, now = new Date().toISOString()): WeatherConflict | undefined {
    const current = this.weatherConflict(id);
    if (!current || current.status !== "open") return undefined;
    this.run("UPDATE weather_conflicts SET status = 'kept', decidedAt = ?, decidedBy = ?, updatedAt = ? WHERE id = ?", [
      now,
      userId,
      now,
      id
    ]);
    this.save();
    return this.weatherConflict(id);
  }

  /**
   * Call a job's day off for weather — every write together, or none of them: the crews booked on
   * that job that day are released, the delay is logged (the DelayIQ record every other lost day
   * goes on), the reschedule is raised as a pending variance of kind "weather" for the PM to accept
   * or reject like any other, and the conflict records who called it off.
   */
  cancelWeatherConflict(
    id: string,
    input: {
      userId: string;
      delayIQ: Omit<DelayIQ, "id" | "reportedAt">;
      variance: (Omit<ScheduleVariance, "id" | "status" | "detectedAt"> & { detectedAt?: string }) | null;
      now?: string;
    }
  ): { conflict: WeatherConflict; delayIQ: DelayIQ; variance: ScheduleVariance | null; releasedAssignmentIds: string[] } | undefined {
    const current = this.weatherConflict(id);
    if (!current || (current.status !== "open" && current.status !== "kept")) return undefined;
    const now = input.now ?? new Date().toISOString();
    return this.transaction(() => {
      const bookings = this.all<{ id: string }>("SELECT id FROM assignments WHERE jobId = ? AND date = ?", [current.jobId, current.date]);
      for (const booking of bookings) this.deleteAssignment(booking.id);
      const delayIQ = this.createDelayIQ(input.delayIQ);
      const variance = input.variance ? this.recordVariance(input.variance) : null;
      this.run(
        "UPDATE weather_conflicts SET status = 'cancelled', decidedAt = ?, decidedBy = ?, updatedAt = ?, varianceId = ?, delayIQId = ? WHERE id = ?",
        [now, input.userId, now, variance?.id ?? null, delayIQ.id, id]
      );
      return {
        conflict: this.weatherConflict(id)!,
        delayIQ,
        variance,
        releasedAssignmentIds: bookings.map((booking) => booking.id)
      };
    });
  }

  weatherLocations(): WeatherLocation[] {
    return this.all<Omit<WeatherLocation, "query"> & { searchText: string }>("SELECT * FROM weather_locations").map(
      ({ searchText, ...rest }) => ({ ...rest, query: searchText })
    );
  }

  setWeatherLocation(location: WeatherLocation): WeatherLocation {
    this.run(
      `INSERT INTO weather_locations (projectId, searchText, place, latitude, longitude, updatedAt, updatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(projectId) DO UPDATE SET searchText = excluded.searchText, place = excluded.place, latitude = excluded.latitude,
         longitude = excluded.longitude, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`,
      [location.projectId, location.query, location.place, location.latitude, location.longitude, location.updatedAt, location.updatedBy]
    );
    this.save();
    return location;
  }

  /** True when there was a location to clear. The project's own address takes over again. */
  clearWeatherLocation(projectId: string): boolean {
    const row = this.get<{ projectId: string }>("SELECT projectId FROM weather_locations WHERE projectId = ?", [projectId]);
    if (!row) return false;
    this.run("DELETE FROM weather_locations WHERE projectId = ?", [projectId]);
    this.save();
    return true;
  }
}
