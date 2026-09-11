import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { hashPassword, hashToken, newAuthToken, newSessionToken, newId, SESSION_TTL_MS } from "./auth.js";
import { createBusinessProfile } from "./businessProfiles.js";
import { isPermissionLevel, type PermissionLevel } from "@buildflow/shared";
import type {
  CrewClash,
  RebookMove,
  RebookResult,
  BootstrapPayload,
  UserRole,
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
  UpdateProjectInput,
  User,
  VarianceProposal,
  WeatherAlert
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
  role: UserRole;
  invitedBy: string;
  tokenHash: string;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};
type AccountRow = Account & { passwordHash: string };
export type SessionContext = { account: Account; org: Org };

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
function userRow(row: Omit<User, "isSample" | "accountId"> & { isSample?: number | boolean | null; accountId?: string | null }): User {
  return { ...row, accountId: row.accountId ?? null, isSample: Boolean(row.isSample) };
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

// ── Sales & Customer-Service Desk row shapes (see migrate()) ────────────────
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
export type Department = "sales" | "support";
export type SalesTaskRow = {
  id: string;
  leadId: string | null;
  title: string;
  dueAt: string;
  done: number;
  department: Department;
  createdAt: string;
  /** Who the task is for (a rep's own to-do), its priority and free notes — added in schema v7. */
  assignee: string;
  priority: string;
  notes: string;
};
/** Seed rows omit the v7 task columns (assignee / priority / notes) — the table defaults fill them in. */
export type SalesTaskSeed = Omit<SalesTaskRow, "assignee" | "priority" | "notes"> &
  Partial<Pick<SalesTaskRow, "assignee" | "priority" | "notes">>;
export type SalesCompanyRow = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  phone: string;
  city: string;
  state: string;
  owner: string;
  notes: string;
  createdAt: string;
  lastActivityAt: string | null;
};
export type SalesDealStage =
  | "Appointment scheduled"
  | "Qualified to buy"
  | "Presentation scheduled"
  | "Decision maker bought-in"
  | "Contract sent"
  | "Closed won"
  | "Closed lost";
export type SalesDealRow = {
  id: string;
  name: string;
  stage: SalesDealStage;
  amount: number;
  closeDate: string;
  companyId: string | null;
  leadId: string | null;
  owner: string;
  priority: string;
  notes: string;
  createdAt: string;
  lastActivityAt: string | null;
};
export type SalesMeetingRow = {
  id: string;
  leadId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  agenda: string;
  organizer: string;
  /** How the client was notified: "email", "email+sms", "sms" or "none". */
  notifiedVia: string;
  createdAt: string;
};
export type SalesActivityRow = {
  id: string;
  leadId: string;
  type: "note" | "call" | "email" | "meeting" | "stage" | "text";
  summary: string;
  createdAt: string;
};
export type SupportConversationRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "Low" | "Normal" | "High" | "Urgent";
  department: Department;
  createdAt: string;
  lastMessageAt: string;
};
export type SupportMessageRow = {
  id: string;
  conversationId: string;
  author: "customer" | "agent";
  body: string;
  createdAt: string;
};
export type SupportAgentRole = "Owner" | "Admin" | "Agent";
export type SupportAgentRow = {
  id: string;
  name: string;
  email: string;
  role: SupportAgentRole;
  status: "Active" | "Invited";
  createdAt: string;
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

const defaultDataFile = path.resolve(__dirname, "../data/buildflow.sqlite");

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

export const LATEST_SCHEMA_VERSION = SCHEMA_MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

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
      store.seedSalesDesk();
      store.ensureSalesDeskDepartments();
      store.seedSalesCompaniesAndDeals();
      store.seedDemoAccount();
    }
    store.save();
    return store;
  }

  /** While a transaction runs, save() waits for its commit: sql.js's export() closes the database, which would end the transaction. */
  private inTransaction = false;

  private save() {
    if (this.inTransaction) return;
    fs.writeFileSync(this.dataFile, Buffer.from(this.db.export()));
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

  /** Absolute path of this store's SQLite file (used to co-locate per-org files). */
  get dataFilePath(): string {
    return this.dataFile;
  }

  /** Write a timestamped snapshot of this store's file into <dataDir>/backups/,
   *  pruning to the newest `retain`. Returns the backup file path. */
  backup(retain = 20): string {
    this.save(); // snapshot the latest in-memory state to disk first
    const dir = path.join(path.dirname(this.dataFile), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(this.dataFile, path.extname(this.dataFile));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(dir, `${base}-${stamp}.sqlite`);
    fs.copyFileSync(this.dataFile, dest);
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

      /* ── Sales & Customer-Service Desk ───────────────────────────────────────
         Backs the standalone "BuildFlow Sales & Support Desk" console (its own
         Vite app at sales-desk/, proxied to this backend). Additive tables, kept
         out of clearWorkspace() so this cross-cutting staff data survives an
         onboarding reset. Seeded once by seedSalesDesk() (guards on sales_leads). */
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
      {
        id: "u-matt",
        name: "Matt Johnson",
        role: "Project Manager",
        title: "Project Manager",
        avatar: "MJ"
      },
      {
        id: "u-jessica",
        name: "Jessica Lee",
        role: "Superintendent",
        title: "Superintendent",
        avatar: "JL"
      },
      {
        id: "u-carlos",
        name: "Carlos Ramirez",
        role: "Crew Lead",
        title: "Crew Lead - Crew 2",
        avatar: "CR"
      }
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
    // Seeded/sample people go; anyone linked to a login account stays.
    this.run("DELETE FROM users WHERE accountId IS NULL");
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
    this.save();
    return toAccount(row);
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
  createInvite(input: { orgId: string; email: string; role: UserRole; invitedBy: string; ttlMs: number; sent: boolean }): {
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
      role: input.role,
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

  /** Change what a teammate is in the workspace. The title follows the role unless they are the owner. */
  updateUserRole(userId: string, role: UserRole): User | undefined {
    const row = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!row) return undefined;
    const title = row.title === "Owner" ? "Owner" : role;
    this.run("UPDATE users SET role = ?, title = ? WHERE id = ?", [role, title, userId]);
    this.save();
    return userRow({ ...row, role, title });
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

  /** Keep the workspace person in step with a renamed login. */
  renameAccountUser(accountId: string, name: string) {
    this.run("UPDATE users SET name = ?, avatar = ? WHERE accountId = ?", [name.trim(), initials(name), accountId]);
    this.save();
  }

  /** A workspace person for an invited teammate, with the role the inviter chose. */
  createTeammateUser(account: { id: string; name: string; email: string }, role: UserRole): User {
    const existing = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE accountId = ?", [account.id]);
    if (existing) return userRow(existing);
    const name = account.name.trim() || account.email.split("@")[0];
    const user = { id: newId("u"), name, role, title: role, avatar: initials(name), accountId: account.id, isSample: 0 };
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
      if (!paid) this.run("DELETE FROM workspace_settings WHERE key = 'trialEndsAt'");
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
   * The workspace person behind a login account, created on first sight. The
   * registered owner is a Project Manager in their own workspace so every field
   * update, assignment and approval is attributed to them, not to a seeded name.
   */
  ensureAccountUser(account: { id: string; name: string; email: string }): User {
    const existing = this.get<User & { isSample: number | boolean }>("SELECT * FROM users WHERE accountId = ?", [account.id]);
    if (existing) return userRow(existing);
    const name = account.name.trim() || account.email.split("@")[0];
    const user = {
      id: newId("u"),
      name,
      role: "Project Manager" as const,
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
      weatherAlerts: this.weatherAlerts()
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

  canManageProject(managerId: string) {
    return Boolean(this.get<User>("SELECT * FROM users WHERE id = ? AND role IN (?, ?)", [managerId, "Project Manager", "Superintendent"]));
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
      this.run("DELETE FROM materials WHERE projectId = ?", [id]);
      this.run("DELETE FROM phases WHERE projectId = ?", [id]);
      this.run("DELETE FROM jobs WHERE projectId = ?", [id]);
      this.run("DELETE FROM projects WHERE id = ?", [id]);
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

  /* ── Sales & Customer-Service Desk ───────────────────────────────────────────
     Read/write helpers for the standalone Sales & Support Desk console. Seeded
     once (idempotent — guards on sales_leads) so both fresh and existing DBs get
     demo leads, tasks, activities, and support threads. ──────────────────────── */
  private newId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  seedSalesDesk() {
    const seeded = this.get<{ n: number }>("SELECT COUNT(*) AS n FROM sales_leads")?.n ?? 0;
    if (seeded > 0) return;

    const now = Date.now();
    const DAY = 86_400_000;
    const ago = (d: number) => new Date(now - d * DAY).toISOString();
    const ahead = (d: number) => new Date(now + d * DAY).toISOString();
    const agoH = (h: number) => new Date(now - h * 3_600_000).toISOString();

    // Construction-industry prospects (BuildFlow sells scheduling to GCs & trades).
    const leads: Array<Omit<SalesLeadRow, "createdAt" | "lastActivityAt"> & { createdAt: string; lastActivityAt: string | null }> = [
      {
        id: "lead-diego",
        name: "Diego Alvarez",
        email: "diego@summitridge.build",
        phone: "+1 415 555 0142",
        company: "Summit Ridge Builders",
        teamSize: "25–50",
        interest: "Crew Scheduling",
        status: "New",
        value: 12000,
        owner: "Sales Rep",
        source: "Website",
        notes: "Inbound from pricing page. Runs 4 concurrent sites.",
        createdAt: ago(1),
        lastActivityAt: null
      },
      {
        id: "lead-yuki",
        name: "Yuki Tanaka",
        email: "yuki@paccoastconcrete.com",
        phone: "+1 503 555 0100",
        company: "Pacific Coast Concrete",
        teamSize: "50–100",
        interest: "Schedule AI",
        status: "New",
        value: 35000,
        owner: "Sales Rep",
        source: "Referral",
        notes: "Referred by Northwind. Wants AI conflict detection.",
        createdAt: ago(2),
        lastActivityAt: null
      },
      {
        id: "lead-marcus",
        name: "Marcus Holloway",
        email: "marcus@bluepeaksite.com",
        phone: "+1 312 555 0177",
        company: "Bluepeak Site Services",
        teamSize: "10–25",
        interest: "Equipment Tracking",
        status: "Contacted",
        value: 22500,
        owner: "Sales Rep",
        source: "Outbound",
        notes: "Demo booked. Comparing against spreadsheets.",
        createdAt: ago(9),
        lastActivityAt: ago(3)
      },
      {
        id: "lead-rachel",
        name: "Rachel Mendes",
        email: "rachel@foundrysteel.com",
        phone: "+1 617 555 0155",
        company: "Foundry Steelworks",
        teamSize: "100–250",
        interest: "Materials Readiness",
        status: "Contacted",
        value: 64000,
        owner: "Priya Nair",
        source: "Trade show",
        notes: "Met at ConExpo. Multi-region rollout.",
        createdAt: ago(12),
        lastActivityAt: ago(5)
      },
      {
        id: "lead-sarah",
        name: "Sarah Chen",
        email: "sarah.chen@northwindmech.com",
        phone: "+1 415 555 0142",
        company: "Northwind Mechanical",
        teamSize: "50–100",
        interest: "Production Reports",
        status: "Qualified",
        value: 48000,
        owner: "Sales Rep",
        source: "Outbound",
        notes: "Budget approved for Q3. Needs ROI deck.",
        createdAt: ago(15),
        lastActivityAt: ago(2)
      },
      {
        id: "lead-priya",
        name: "Priya Raman",
        email: "priya.raman@helixinfra.com",
        phone: "+1 646 555 0193",
        company: "Helix Infrastructure",
        teamSize: "250+",
        interest: "Enterprise",
        status: "Proposal",
        value: 96000,
        owner: "Priya Nair",
        source: "Website",
        notes: "Proposal sent. Legal reviewing MSA.",
        createdAt: ago(24),
        lastActivityAt: ago(1)
      },
      {
        id: "lead-anna",
        name: "Anna Kowalski",
        email: "anna@tidewatercp.com",
        phone: "+1 206 555 0128",
        company: "Tidewater Capital Projects",
        teamSize: "250+",
        interest: "Enterprise",
        status: "Won",
        value: 150000,
        owner: "Sales Rep",
        source: "Referral",
        notes: "Closed — 3-year contract. Onboarding scheduled.",
        createdAt: ago(40),
        lastActivityAt: ago(6)
      },
      {
        id: "lead-tom",
        name: "Tom Becker",
        email: "tom@cedarvalleygc.com",
        phone: "+1 720 555 0119",
        company: "Cedar Valley GC",
        teamSize: "10–25",
        interest: "Crew Scheduling",
        status: "Lost",
        value: 18000,
        owner: "Priya Nair",
        source: "Website",
        notes: "Chose a competitor on price. Revisit in 6 months.",
        createdAt: ago(34),
        lastActivityAt: ago(20)
      }
    ];
    leads.forEach((lead) => this.insert("sales_leads", lead));

    const tasks: SalesTaskSeed[] = [
      // Sales department follow-ups
      {
        id: "stask-1",
        leadId: "lead-yuki",
        title: "Send personalised intro to Yuki",
        dueAt: ahead(1),
        done: 0,
        department: "sales",
        createdAt: ago(2)
      },
      {
        id: "stask-2",
        leadId: "lead-diego",
        title: "Initial discovery call with Diego",
        dueAt: ahead(2),
        done: 0,
        department: "sales",
        createdAt: ago(1)
      },
      {
        id: "stask-3",
        leadId: "lead-sarah",
        title: "Send tailored ROI deck",
        dueAt: ahead(3),
        done: 0,
        department: "sales",
        createdAt: ago(2)
      },
      {
        id: "stask-4",
        leadId: "lead-marcus",
        title: "Confirm demo time with Marcus",
        dueAt: ahead(0),
        done: 0,
        department: "sales",
        createdAt: ago(3)
      },
      {
        id: "stask-5",
        leadId: "lead-priya",
        title: "Follow up on legal review",
        dueAt: ahead(4),
        done: 0,
        department: "sales",
        createdAt: ago(1)
      },
      {
        id: "stask-6",
        leadId: "lead-rachel",
        title: "Schedule pricing review",
        dueAt: ahead(5),
        done: 0,
        department: "sales",
        createdAt: ago(2)
      },
      {
        id: "stask-7",
        leadId: "lead-anna",
        title: "Kick off onboarding with Tidewater",
        dueAt: ago(1),
        done: 1,
        department: "sales",
        createdAt: ago(6)
      },
      // Customer Support department tasks
      {
        id: "stask-s1",
        leadId: null,
        title: "Reply to Sarah — mobile sync outage",
        dueAt: ahead(0),
        done: 0,
        department: "support",
        createdAt: agoH(1)
      },
      {
        id: "stask-s2",
        leadId: null,
        title: "Send Leah the PDF export steps",
        dueAt: ahead(1),
        done: 0,
        department: "support",
        createdAt: ago(1)
      },
      {
        id: "stask-s3",
        leadId: null,
        title: "Write help-doc: importing an existing schedule",
        dueAt: ahead(2),
        done: 0,
        department: "support",
        createdAt: agoH(6)
      },
      {
        id: "stask-s4",
        leadId: null,
        title: "Close out resolved Gantt feature-request thread",
        dueAt: ago(1),
        done: 1,
        department: "support",
        createdAt: ago(4)
      }
    ];
    tasks.forEach((task) => this.insert("sales_tasks", task));

    const activities: SalesActivityRow[] = [
      {
        id: "sact-1",
        leadId: "lead-priya",
        type: "note",
        summary: "Note: Stakeholder map — 3 decision makers identified",
        createdAt: agoH(2)
      },
      { id: "sact-2", leadId: "lead-priya", type: "meeting", summary: "Meeting: Proposal review with procurement", createdAt: ago(1) },
      { id: "sact-3", leadId: "lead-sarah", type: "call", summary: "Call: Discovery — mapped current scheduling pains", createdAt: ago(2) },
      {
        id: "sact-4",
        leadId: "lead-marcus",
        type: "email",
        summary: "Email: Sent demo recording + follow-up questions",
        createdAt: ago(3)
      },
      { id: "sact-5", leadId: "lead-rachel", type: "stage", summary: "Stage change: New → Contacted", createdAt: ago(5) },
      { id: "sact-6", leadId: "lead-anna", type: "note", summary: "Note: Contract signed 🎉 handoff to onboarding", createdAt: ago(6) }
    ];
    activities.forEach((activity) => this.insert("sales_activities", activity));

    // Two inboxes, routed by department:
    //  • department: "support" → General Support (people who need help)
    //  • department: "sales"   → Sales inquiries (pricing / plans / demos)
    const conversations: Array<SupportConversationRow & { messages: Array<{ author: "customer" | "agent"; body: string; at: string }> }> = [
      // ── General Support (Customer Support department) ──────────────────────
      {
        id: "conv-sarah",
        name: "Sarah Chen",
        email: "sarah.chen@northwindmech.com",
        company: "Northwind Mechanical",
        subject: "Crew schedule won't sync to the mobile app",
        status: "open",
        priority: "High",
        department: "support",
        createdAt: agoH(5),
        lastMessageAt: agoH(1),
        messages: [
          {
            author: "customer",
            body: "Hi — my foremen aren't seeing today's assignments on their phones even though the web schedule looks right. Started this morning.",
            at: agoH(5)
          },
          {
            author: "agent",
            body: "Thanks Sarah — sorry about that. Can you confirm whether they pulled to refresh, and which crew is affected? I'll check the sync logs on our side now.",
            at: agoH(4)
          },
          { author: "customer", body: "It's the Concrete crew. They pulled to refresh, still nothing.", at: agoH(1) }
        ]
      },
      {
        id: "conv-leah",
        name: "Leah Moreno",
        email: "leah@foundrysteel.com",
        company: "Foundry Steelworks",
        subject: "Export weekly production report to PDF",
        status: "open",
        priority: "Normal",
        department: "support",
        createdAt: ago(1),
        lastMessageAt: ago(1),
        messages: [
          {
            author: "customer",
            body: "Is there a way to export the weekly Production Report as a PDF to send to our owner? I can only see the on-screen view.",
            at: ago(1)
          }
        ]
      },
      {
        id: "conv-priya",
        name: "Priya Raman",
        email: "priya.raman@helixinfra.com",
        company: "Helix Infrastructure",
        subject: "Onboarding: importing our existing schedule",
        status: "open",
        priority: "High",
        department: "support",
        createdAt: agoH(30),
        lastMessageAt: agoH(7),
        messages: [
          {
            author: "customer",
            body: "We're moving off another scheduler. Can you import our current jobs and crews so we don't rebuild from scratch?",
            at: agoH(30)
          },
          {
            author: "agent",
            body: "Absolutely — you can upload a photo or export and our AI import will create the projects, jobs and assignments for you. Want me to walk your team through it Thursday?",
            at: agoH(7)
          }
        ]
      },
      {
        id: "conv-james",
        name: "James Park",
        email: "james@paccoastconcrete.com",
        company: "Pacific Coast Concrete",
        subject: "Feature request: Gantt dependencies",
        status: "closed",
        priority: "Low",
        department: "support",
        createdAt: ago(6),
        lastMessageAt: ago(4),
        messages: [
          { author: "customer", body: "Would love to link jobs so a delayIQ on one pushes the dependent ones automatically.", at: ago(6) },
          {
            author: "agent",
            body: "Love it — I've logged this with product and tagged your account so you'll hear when it ships. Thanks for the idea!",
            at: ago(4)
          }
        ]
      },
      // ── Sales inquiries (Sales department) ────────────────────────────────
      {
        id: "conv-diego",
        name: "Diego Alvarez",
        email: "diego@summitridge.build",
        company: "Summit Ridge Builders",
        subject: "Question about per-seat pricing",
        status: "pending",
        priority: "Normal",
        department: "sales",
        createdAt: ago(2),
        lastMessageAt: agoH(20),
        messages: [
          { author: "customer", body: "If we add field crews who only clock in/out, do they count as full seats?", at: ago(2) },
          {
            author: "agent",
            body: "Great question — field-only users are free; you're billed for schedulers and PMs. I'll email the breakdown. Anything else before your demo?",
            at: agoH(20)
          }
        ]
      },
      {
        id: "conv-omar",
        name: "Omar Haddad",
        email: "omar@granitepeakgc.com",
        company: "Granite Peak GC",
        subject: "Pricing for a 40-crew rollout",
        status: "open",
        priority: "High",
        department: "sales",
        createdAt: agoH(6),
        lastMessageAt: agoH(6),
        messages: [
          {
            author: "customer",
            body: "We run about 40 crews across 3 regions and want to move everyone onto BuildFlow this quarter. Can you put together pricing and an onboarding plan?",
            at: agoH(6)
          }
        ]
      },
      {
        id: "conv-nina",
        name: "Nina Alvarez",
        email: "nina@harborlinebuild.com",
        company: "Harborline Build",
        subject: "Interested in the Enterprise plan — can we get a demo?",
        status: "open",
        priority: "Normal",
        department: "sales",
        createdAt: ago(1),
        lastMessageAt: agoH(20),
        messages: [
          {
            author: "customer",
            body: "Saw BuildFlow at a trade show. We'd like a demo of the Enterprise plan for our leadership team — are you free next week?",
            at: ago(1)
          },
          {
            author: "agent",
            body: "Thanks Nina! I'd love to set that up. Does Tuesday or Thursday afternoon work better for your team?",
            at: agoH(20)
          }
        ]
      }
    ];
    conversations.forEach(({ messages, ...conv }) => {
      this.insert("support_conversations", conv);
      messages.forEach((m, index) =>
        this.insert("support_messages", {
          id: `${conv.id}-m${index + 1}`,
          conversationId: conv.id,
          author: m.author,
          body: m.body,
          createdAt: m.at
        })
      );
    });
  }

  // Idempotent upgrade for installs seeded before departments existed: adds the
  // `department` columns, routes the pricing thread to Sales, and makes sure both
  // inboxes (Sales inquiries + Support tasks) are populated. Safe to run every boot.
  ensureSalesDeskDepartments() {
    const hasColumn = (table: string, column: string) =>
      this.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);
    if (!hasColumn("support_conversations", "department")) {
      this.run("ALTER TABLE support_conversations ADD COLUMN department TEXT NOT NULL DEFAULT 'support'");
    }
    if (!hasColumn("sales_tasks", "department")) {
      this.run("ALTER TABLE sales_tasks ADD COLUMN department TEXT NOT NULL DEFAULT 'sales'");
    }
    // The per-seat pricing thread is a Sales inquiry, not general support.
    this.run("UPDATE support_conversations SET department = 'sales' WHERE id = 'conv-diego'");

    const now = Date.now();
    const DAY = 86_400_000;
    const ago = (d: number) => new Date(now - d * DAY).toISOString();
    const ahead = (d: number) => new Date(now + d * DAY).toISOString();
    const agoH = (h: number) => new Date(now - h * 3_600_000).toISOString();

    const ensureConversation = (
      conv: SupportConversationRow,
      messages: Array<{ author: "customer" | "agent"; body: string; at: string }>
    ) => {
      if (this.get("SELECT id FROM support_conversations WHERE id = ?", [conv.id])) return;
      this.insert("support_conversations", conv);
      messages.forEach((m, i) =>
        this.insert("support_messages", {
          id: `${conv.id}-m${i + 1}`,
          conversationId: conv.id,
          author: m.author,
          body: m.body,
          createdAt: m.at
        })
      );
    };
    ensureConversation(
      {
        id: "conv-omar",
        name: "Omar Haddad",
        email: "omar@granitepeakgc.com",
        company: "Granite Peak GC",
        subject: "Pricing for a 40-crew rollout",
        status: "open",
        priority: "High",
        department: "sales",
        createdAt: agoH(6),
        lastMessageAt: agoH(6)
      },
      [
        {
          author: "customer",
          body: "We run about 40 crews across 3 regions and want to move everyone onto BuildFlow this quarter. Can you put together pricing and an onboarding plan?",
          at: agoH(6)
        }
      ]
    );
    ensureConversation(
      {
        id: "conv-nina",
        name: "Nina Alvarez",
        email: "nina@harborlinebuild.com",
        company: "Harborline Build",
        subject: "Interested in the Enterprise plan — can we get a demo?",
        status: "open",
        priority: "Normal",
        department: "sales",
        createdAt: ago(1),
        lastMessageAt: agoH(20)
      },
      [
        {
          author: "customer",
          body: "Saw BuildFlow at a trade show. We'd like a demo of the Enterprise plan for our leadership team — are you free next week?",
          at: ago(1)
        },
        {
          author: "agent",
          body: "Thanks Nina! I'd love to set that up. Does Tuesday or Thursday afternoon work better for your team?",
          at: agoH(20)
        }
      ]
    );

    const ensureTask = (task: SalesTaskSeed) => {
      if (this.get("SELECT id FROM sales_tasks WHERE id = ?", [task.id])) return;
      this.insert("sales_tasks", task);
    };
    ensureTask({
      id: "stask-s1",
      leadId: null,
      title: "Reply to Sarah — mobile sync outage",
      dueAt: ahead(0),
      done: 0,
      department: "support",
      createdAt: agoH(1)
    });
    ensureTask({
      id: "stask-s2",
      leadId: null,
      title: "Send Leah the PDF export steps",
      dueAt: ahead(1),
      done: 0,
      department: "support",
      createdAt: ago(1)
    });
    ensureTask({
      id: "stask-s3",
      leadId: null,
      title: "Write help-doc: importing an existing schedule",
      dueAt: ahead(2),
      done: 0,
      department: "support",
      createdAt: agoH(6)
    });
    ensureTask({
      id: "stask-s4",
      leadId: null,
      title: "Close out resolved Gantt feature-request thread",
      dueAt: ago(1),
      done: 1,
      department: "support",
      createdAt: ago(4)
    });

    // Seed the Customer Support team roster once (the owner can add more in Settings).
    if ((this.get<{ n: number }>("SELECT COUNT(*) AS n FROM support_agents")?.n ?? 0) === 0) {
      const agents: SupportAgentRow[] = [
        { id: "agent-owner", name: "Jordan Lee", email: "support@buildflow.io", role: "Owner", status: "Active", createdAt: ago(120) },
        { id: "agent-priya", name: "Priya Nair", email: "priya.nair@buildflow.io", role: "Admin", status: "Active", createdAt: ago(80) },
        { id: "agent-sam", name: "Sam Rivera", email: "sam.rivera@buildflow.io", role: "Agent", status: "Active", createdAt: ago(40) },
        { id: "agent-alex", name: "Alex Kim", email: "alex.kim@buildflow.io", role: "Agent", status: "Invited", createdAt: ago(3) }
      ];
      agents.forEach((agent) => this.insert("support_agents", agent));
    }

    this.save();
  }

  salesLeads(): SalesLeadRow[] {
    return this.all<SalesLeadRow>("SELECT * FROM sales_leads ORDER BY COALESCE(lastActivityAt, createdAt) DESC");
  }

  salesTasks(department?: Department): SalesTaskRow[] {
    if (department) {
      return this.all<SalesTaskRow>("SELECT * FROM sales_tasks WHERE department = ? ORDER BY done ASC, dueAt ASC", [department]);
    }
    return this.all<SalesTaskRow>("SELECT * FROM sales_tasks ORDER BY done ASC, dueAt ASC");
  }

  salesActivities(): SalesActivityRow[] {
    return this.all<SalesActivityRow>("SELECT * FROM sales_activities ORDER BY createdAt DESC");
  }

  salesBootstrap() {
    return {
      leads: this.salesLeads(),
      tasks: this.salesTasks(),
      activities: this.salesActivities(),
      meetings: this.salesMeetings(),
      companies: this.salesCompanies(),
      deals: this.salesDeals(),
      conversations: this.supportConversations()
    };
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

  updateSalesLead(id: string, patch: Partial<Omit<SalesLeadRow, "id" | "createdAt">>): SalesLeadRow | undefined {
    const existing = this.get<SalesLeadRow>("SELECT * FROM sales_leads WHERE id = ?", [id]);
    if (!existing) return undefined;
    const next: SalesLeadRow = { ...existing, ...patch, lastActivityAt: new Date().toISOString() };
    this.run(
      "UPDATE sales_leads SET name=?, email=?, phone=?, company=?, teamSize=?, interest=?, status=?, value=?, owner=?, source=?, notes=?, lastActivityAt=? WHERE id=?",
      [
        next.name,
        next.email,
        next.phone,
        next.company,
        next.teamSize,
        next.interest,
        next.status,
        next.value,
        next.owner,
        next.source,
        next.notes,
        next.lastActivityAt,
        id
      ]
    );
    this.save();
    return next;
  }

  deleteSalesLead(id: string): boolean {
    if (!this.get("SELECT id FROM sales_leads WHERE id = ?", [id])) return false;
    this.run("DELETE FROM sales_leads WHERE id = ?", [id]);
    this.run("DELETE FROM sales_tasks WHERE leadId = ?", [id]);
    this.run("DELETE FROM sales_activities WHERE leadId = ?", [id]);
    this.run("UPDATE sales_deals SET leadId = NULL WHERE leadId = ?", [id]);
    this.save();
    return true;
  }

  createSalesTask(input: {
    title: string;
    dueAt: string;
    leadId?: string | null;
    department?: Department;
    assignee?: string;
    priority?: string;
    notes?: string;
  }): SalesTaskRow {
    const task: SalesTaskRow = {
      id: this.newId("stask"),
      leadId: input.leadId ?? null,
      title: input.title,
      dueAt: input.dueAt,
      done: 0,
      department: input.department ?? "sales",
      createdAt: new Date().toISOString(),
      assignee: input.assignee ?? "",
      priority: input.priority ?? "Normal",
      notes: input.notes ?? ""
    };
    this.insert("sales_tasks", task);
    this.save();
    return task;
  }

  updateSalesTask(id: string, patch: { done?: boolean; title?: string; dueAt?: string }): SalesTaskRow | undefined {
    const existing = this.get<SalesTaskRow>("SELECT * FROM sales_tasks WHERE id = ?", [id]);
    if (!existing) return undefined;
    const next: SalesTaskRow = {
      ...existing,
      title: patch.title ?? existing.title,
      dueAt: patch.dueAt ?? existing.dueAt,
      done: patch.done === undefined ? existing.done : patch.done ? 1 : 0
    };
    this.run("UPDATE sales_tasks SET title=?, dueAt=?, done=? WHERE id=?", [next.title, next.dueAt, next.done, id]);
    this.save();
    return next;
  }

  deleteSalesTask(id: string): boolean {
    if (!this.get("SELECT id FROM sales_tasks WHERE id = ?", [id])) return false;
    this.run("DELETE FROM sales_tasks WHERE id = ?", [id]);
    this.save();
    return true;
  }

  createSalesActivity(input: { leadId: string; type: SalesActivityRow["type"]; summary: string }): SalesActivityRow {
    const activity: SalesActivityRow = {
      id: this.newId("sact"),
      leadId: input.leadId,
      type: input.type,
      summary: input.summary,
      createdAt: new Date().toISOString()
    };
    this.insert("sales_activities", activity);
    this.run("UPDATE sales_leads SET lastActivityAt = ? WHERE id = ?", [activity.createdAt, input.leadId]);
    this.save();
    return activity;
  }

  salesMeetings(): SalesMeetingRow[] {
    return this.all<SalesMeetingRow>("SELECT * FROM sales_meetings ORDER BY startsAt ASC");
  }

  salesLead(id: string): SalesLeadRow | undefined {
    return this.get<SalesLeadRow>("SELECT * FROM sales_leads WHERE id = ?", [id]);
  }

  createSalesMeeting(input: {
    leadId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location?: string;
    agenda?: string;
    organizer?: string;
    notifiedVia?: string;
  }): SalesMeetingRow {
    const meeting: SalesMeetingRow = {
      id: this.newId("smeet"),
      leadId: input.leadId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location ?? "",
      agenda: input.agenda ?? "",
      organizer: input.organizer ?? "",
      notifiedVia: input.notifiedVia ?? "none",
      createdAt: new Date().toISOString()
    };
    this.insert("sales_meetings", meeting);
    this.save();
    return meeting;
  }

  setSalesMeetingNotified(id: string, notifiedVia: string) {
    this.run("UPDATE sales_meetings SET notifiedVia = ? WHERE id = ?", [notifiedVia, id]);
    this.save();
  }

  /* ── Companies ──────────────────────────────────────────────────────────── */
  salesCompanies(): SalesCompanyRow[] {
    return this.all<SalesCompanyRow>("SELECT * FROM sales_companies ORDER BY name COLLATE NOCASE ASC");
  }

  salesCompany(id: string): SalesCompanyRow | undefined {
    return this.get<SalesCompanyRow>("SELECT * FROM sales_companies WHERE id = ?", [id]);
  }

  createSalesCompany(input: {
    name: string;
    domain?: string;
    industry?: string;
    phone?: string;
    city?: string;
    state?: string;
    owner?: string;
    notes?: string;
    createdAt?: string;
    lastActivityAt?: string | null;
  }): SalesCompanyRow {
    const company: SalesCompanyRow = {
      id: this.newId("co"),
      name: input.name,
      domain: input.domain ?? "",
      industry: input.industry ?? "",
      phone: input.phone ?? "",
      city: input.city ?? "",
      state: input.state ?? "",
      owner: input.owner ?? "",
      notes: input.notes ?? "",
      createdAt: input.createdAt ?? new Date().toISOString(),
      lastActivityAt: input.lastActivityAt ?? null
    };
    this.insert("sales_companies", company);
    this.save();
    return company;
  }

  updateSalesCompany(id: string, patch: Partial<Omit<SalesCompanyRow, "id" | "createdAt">>): SalesCompanyRow | undefined {
    const existing = this.salesCompany(id);
    if (!existing) return undefined;
    const next: SalesCompanyRow = { ...existing, ...patch, lastActivityAt: new Date().toISOString() };
    this.run(
      "UPDATE sales_companies SET name=?, domain=?, industry=?, phone=?, city=?, state=?, owner=?, notes=?, lastActivityAt=? WHERE id=?",
      [next.name, next.domain, next.industry, next.phone, next.city, next.state, next.owner, next.notes, next.lastActivityAt, id]
    );
    // contacts and deals link to a company by name / id — keep the name in step
    if (patch.name && patch.name !== existing.name)
      this.run("UPDATE sales_leads SET company = ? WHERE company = ?", [patch.name, existing.name]);
    this.save();
    return next;
  }

  deleteSalesCompany(id: string): boolean {
    if (!this.salesCompany(id)) return false;
    this.run("DELETE FROM sales_companies WHERE id = ?", [id]);
    this.run("UPDATE sales_deals SET companyId = NULL WHERE companyId = ?", [id]);
    this.save();
    return true;
  }

  /* ── Deals ──────────────────────────────────────────────────────────────── */
  salesDeals(): SalesDealRow[] {
    return this.all<SalesDealRow>("SELECT * FROM sales_deals ORDER BY createdAt DESC");
  }

  salesDeal(id: string): SalesDealRow | undefined {
    return this.get<SalesDealRow>("SELECT * FROM sales_deals WHERE id = ?", [id]);
  }

  createSalesDeal(input: {
    name: string;
    stage?: SalesDealStage;
    amount?: number;
    closeDate?: string;
    companyId?: string | null;
    leadId?: string | null;
    owner?: string;
    priority?: string;
    notes?: string;
    createdAt?: string;
    lastActivityAt?: string | null;
  }): SalesDealRow {
    const deal: SalesDealRow = {
      id: this.newId("deal"),
      name: input.name,
      stage: input.stage ?? "Appointment scheduled",
      amount: input.amount ?? 0,
      closeDate: input.closeDate ?? "",
      companyId: input.companyId ?? null,
      leadId: input.leadId ?? null,
      owner: input.owner ?? "",
      priority: input.priority ?? "Medium",
      notes: input.notes ?? "",
      createdAt: input.createdAt ?? new Date().toISOString(),
      lastActivityAt: input.lastActivityAt ?? null
    };
    this.insert("sales_deals", deal);
    this.save();
    return deal;
  }

  updateSalesDeal(id: string, patch: Partial<Omit<SalesDealRow, "id" | "createdAt">>): SalesDealRow | undefined {
    const existing = this.salesDeal(id);
    if (!existing) return undefined;
    const next: SalesDealRow = { ...existing, ...patch, lastActivityAt: new Date().toISOString() };
    this.run(
      "UPDATE sales_deals SET name=?, stage=?, amount=?, closeDate=?, companyId=?, leadId=?, owner=?, priority=?, notes=?, lastActivityAt=? WHERE id=?",
      [
        next.name,
        next.stage,
        next.amount,
        next.closeDate,
        next.companyId,
        next.leadId,
        next.owner,
        next.priority,
        next.notes,
        next.lastActivityAt,
        id
      ]
    );
    this.save();
    return next;
  }

  deleteSalesDeal(id: string): boolean {
    if (!this.salesDeal(id)) return false;
    this.run("DELETE FROM sales_deals WHERE id = ?", [id]);
    this.save();
    return true;
  }

  /** Derive companies and deals from the contacts so the three Sales pages agree.
   *  Runs once per DB (guards on empty tables); safe on fresh and existing DBs. */
  seedSalesCompaniesAndDeals() {
    const leads = this.salesLeads();
    if (leads.length === 0) return;
    const DAY = 86_400_000;
    const industryFor = (company: string, interest: string) => {
      const hay = `${company} ${interest}`.toLowerCase();
      if (/concrete/.test(hay)) return "Concrete";
      if (/paving|asphalt/.test(hay)) return "Asphalt & paving";
      if (/steel|structural/.test(hay)) return "Steel & structural";
      if (/electric/.test(hay)) return "Electrical";
      if (/mechanical|plumb|hvac/.test(hay)) return "Plumbing & mechanical";
      if (/site|excavat|earth/.test(hay)) return "Excavation & sitework";
      if (/infrastructure|utilit/.test(hay)) return "Utilities";
      if (/capital|projects|develop/.test(hay)) return "Developer / owner";
      if (/roof/.test(hay)) return "Roofing";
      if (/build|construct|gc\b|contractor/.test(hay)) return "General contractor";
      return "Other";
    };
    const companiesEmpty = (this.get<{ n: number }>("SELECT COUNT(*) AS n FROM sales_companies")?.n ?? 0) === 0;
    if (companiesEmpty) {
      const byName = new Map<string, SalesLeadRow[]>();
      for (const lead of leads) {
        if (!lead.company) continue;
        byName.set(lead.company, [...(byName.get(lead.company) ?? []), lead]);
      }
      for (const [name, group] of byName) {
        const first = [...group].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
        const domain = (first.email.split("@")[1] ?? "").toLowerCase();
        const lastActivity =
          group
            .map((lead) => lead.lastActivityAt)
            .filter((value): value is string => Boolean(value))
            .sort()
            .pop() ?? null;
        this.createSalesCompany({
          name,
          domain: /gmail|yahoo|outlook|hotmail|icloud/.test(domain) ? "" : domain,
          industry: industryFor(name, first.interest),
          phone: first.phone,
          owner: first.owner,
          createdAt: first.createdAt,
          lastActivityAt: lastActivity
        });
      }
    }
    const dealsEmpty = (this.get<{ n: number }>("SELECT COUNT(*) AS n FROM sales_deals")?.n ?? 0) === 0;
    if (dealsEmpty) {
      const companies = this.salesCompanies();
      const stageFor = (status: SalesLeadStatus): SalesDealStage =>
        status === "New"
          ? "Appointment scheduled"
          : status === "Contacted"
            ? "Qualified to buy"
            : status === "Qualified"
              ? "Presentation scheduled"
              : status === "Proposal"
                ? "Contract sent"
                : status === "Won"
                  ? "Closed won"
                  : "Closed lost";
      for (const lead of leads) {
        if (!lead.value || lead.value <= 0) continue;
        const company = companies.find((row) => row.name === lead.company);
        const closed = lead.status === "Won" || lead.status === "Lost";
        const closeDate = new Date(
          new Date(closed ? (lead.lastActivityAt ?? lead.createdAt) : lead.createdAt).getTime() + (closed ? 0 : 45 * DAY)
        )
          .toISOString()
          .slice(0, 10);
        this.createSalesDeal({
          name: `${lead.interest || "BuildFlow"} — ${lead.company || lead.name}`,
          stage: stageFor(lead.status),
          amount: lead.value,
          closeDate,
          companyId: company?.id ?? null,
          leadId: lead.id,
          owner: lead.owner,
          priority: lead.value >= 20_000 ? "High" : lead.value >= 10_000 ? "Medium" : "Low",
          createdAt: lead.createdAt,
          lastActivityAt: lead.lastActivityAt
        });
      }
    }
  }

  supportConversations(department?: Department): SupportConversationRow[] {
    if (department) {
      return this.all<SupportConversationRow>("SELECT * FROM support_conversations WHERE department = ? ORDER BY lastMessageAt DESC", [
        department
      ]);
    }
    return this.all<SupportConversationRow>("SELECT * FROM support_conversations ORDER BY lastMessageAt DESC");
  }

  supportMessages(conversationId: string): SupportMessageRow[] {
    return this.all<SupportMessageRow>("SELECT * FROM support_messages WHERE conversationId = ? ORDER BY createdAt ASC", [conversationId]);
  }

  createSupportConversation(input: {
    name: string;
    email: string;
    company?: string;
    subject: string;
    body: string;
    priority?: SupportConversationRow["priority"];
    department?: Department;
  }): { conversation: SupportConversationRow; message: SupportMessageRow } {
    const nowIso = new Date().toISOString();
    const conversation: SupportConversationRow = {
      id: this.newId("conv"),
      name: input.name,
      email: input.email,
      company: input.company ?? "",
      subject: input.subject,
      status: "open",
      priority: input.priority ?? "Normal",
      department: input.department ?? "support",
      createdAt: nowIso,
      lastMessageAt: nowIso
    };
    this.insert("support_conversations", conversation);
    const message: SupportMessageRow = {
      id: this.newId("msg"),
      conversationId: conversation.id,
      author: "customer",
      body: input.body,
      createdAt: nowIso
    };
    this.insert("support_messages", message);
    this.save();
    return { conversation, message };
  }

  addSupportMessage(conversationId: string, input: { author: "customer" | "agent"; body: string }): SupportMessageRow | undefined {
    if (!this.get("SELECT id FROM support_conversations WHERE id = ?", [conversationId])) return undefined;
    const message: SupportMessageRow = {
      id: this.newId("msg"),
      conversationId,
      author: input.author,
      body: input.body,
      createdAt: new Date().toISOString()
    };
    this.insert("support_messages", message);
    // An agent reply moves the thread to "pending" (awaiting customer); a customer
    // message re-opens it. Either way, bump the activity timestamp.
    const nextStatus = input.author === "agent" ? "pending" : "open";
    this.run("UPDATE support_conversations SET lastMessageAt = ?, status = ? WHERE id = ?", [
      message.createdAt,
      nextStatus,
      conversationId
    ]);
    this.save();
    return message;
  }

  updateSupportConversation(
    id: string,
    patch: { status?: SupportConversationRow["status"]; priority?: SupportConversationRow["priority"] }
  ): SupportConversationRow | undefined {
    const existing = this.get<SupportConversationRow>("SELECT * FROM support_conversations WHERE id = ?", [id]);
    if (!existing) return undefined;
    const next: SupportConversationRow = {
      ...existing,
      status: patch.status ?? existing.status,
      priority: patch.priority ?? existing.priority
    };
    this.run("UPDATE support_conversations SET status=?, priority=? WHERE id=?", [next.status, next.priority, id]);
    this.save();
    return next;
  }

  // ── Customer Support team roster (owner/admin manages this in Settings) ────
  supportAgents(): SupportAgentRow[] {
    // Owner first, then Admins, then Agents; alphabetical within a role.
    return this.all<SupportAgentRow>(
      "SELECT * FROM support_agents ORDER BY CASE role WHEN 'Owner' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END, name"
    );
  }

  createSupportAgent(input: { name: string; email: string; role?: SupportAgentRole }): SupportAgentRow | { error: string } {
    const email = input.email.trim().toLowerCase();
    if (this.get("SELECT id FROM support_agents WHERE lower(email) = ?", [email])) {
      return { error: "That email is already on the team." };
    }
    const agent: SupportAgentRow = {
      id: this.newId("agent"),
      name: input.name,
      email: input.email,
      // New teammates can be Admin or Agent — the Owner is fixed.
      role: input.role === "Admin" ? "Admin" : "Agent",
      status: "Invited",
      createdAt: new Date().toISOString()
    };
    this.insert("support_agents", agent);
    this.save();
    return agent;
  }

  deleteSupportAgent(id: string): { ok: true } | { error: string } {
    const agent = this.get<SupportAgentRow>("SELECT * FROM support_agents WHERE id = ?", [id]);
    if (!agent) return { error: "Teammate not found." };
    if (agent.role === "Owner") return { error: "The workspace owner can't be removed." };
    this.run("DELETE FROM support_agents WHERE id = ?", [id]);
    this.save();
    return { ok: true };
  }

  /* ── waitlist (removable feature) ─────────────────────────────────────────
     Pre-launch email signups. To remove: delete this block, the `waitlist`
     table in migrate(), server/src/email.ts, and the waitlist routes in app.ts.
     ──────────────────────────────────────────────────────────────────────── */
  waitlistCount(): number {
    return this.get<{ n: number }>("SELECT COUNT(*) AS n FROM waitlist")?.n ?? 0;
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
    const rows = projectId
      ? this.all<ReadinessItem & { complete: number }>("SELECT * FROM readiness WHERE projectId = ? ORDER BY id", [projectId])
      : this.all<ReadinessItem & { complete: number }>("SELECT * FROM readiness ORDER BY id");
    return rows.map((row) => ({ ...row, complete: Boolean(row.complete) }));
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
}
