/* ============================================================================
   BuildFlow Schedule Creation Tool — data model (spec §3).
   These interfaces are the contract; everything else is negotiable. They are
   written exactly as specified and shared by the client, the CPM engine and
   the server. Calculated fields on Activity are cached for query speed only —
   every schedule run recomputes them, and nothing reads them as input.
   ========================================================================== */

export type ID = string; // uuid v7 for sortable ids

export interface Project {
  id: ID;
  name: string;
  number: string; // job number, e.g. "24-118"
  dataDate: string; // ISO date. The "as of" line for progress
  defaultCalendarId: ID;
  createdAt: string;
  updatedAt: string;
}

export interface Calendar {
  id: ID;
  projectId: ID;
  name: string; // "5-Day", "6-Day Paving", "Winter Shutdown"
  workdays: boolean[]; // length 7, index 0 = Sunday
  hoursPerDay: number; // default 8; used for hourly durations later
  holidays: string[]; // ISO dates, non-working
  exceptions: string[]; // ISO dates forced working (Saturday makeup)
  blackoutRanges: Array<{ start: string; end: string; reason: string }>;
  // seasonal shutdowns, e.g. winter paving ban
}

export interface Crew {
  id: ID;
  projectId: ID;
  name: string; // "Paving Crew A"
  trade: string; // "Paving", "Grading", "Utilities"
  size: number; // headcount, informational
  color: string; // hex; crews are color-identified in the field
  defaultProductionRate?: number; // in the crew's primary unit per day
  defaultUnit?: string; // "TON", "SY", "CY", "LF"
}

export type DurationMode = "fixed" | "production";
export type ConstraintType = "SNET" | "SNLT" | "FNET" | "FNLT" | "MSO" | "MFO";
export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface Activity {
  id: ID;
  projectId: ID;
  code: string; // user-facing, e.g. "A1040"
  name: string;
  wbsId: ID | null;

  // Duration: EITHER fixed OR derived from production
  durationMode: DurationMode;
  fixedDuration?: number; // working days
  quantity?: number;
  unit?: string; // "TON", "SY", "CY", "LF", "EA"
  productionRate?: number; // units per crew-day
  crewCount?: number; // multiplier, default 1

  calendarId: ID;
  crewId: ID | null;

  constraint?: {
    type: ConstraintType;
    date: string;
  };

  // Progress
  percentComplete: number; // 0–100
  actualStart?: string;
  actualFinish?: string;

  // Linear work
  stationStart?: string; // "12+00"
  stationEnd?: string;

  // CALCULATED — never persisted as source of truth, recomputed on load
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;

  notes?: string;
  sortOrder: number;
}

export interface Relationship {
  id: ID;
  projectId: ID;
  predecessorId: ID;
  successorId: ID;
  type: RelationshipType;
  lag: number; // working days, may be negative
}

export interface WBS {
  id: ID;
  projectId: ID;
  parentId: ID | null;
  code: string; // "1.2.3"
  name: string; // "Roadway — Mainline"
  sortOrder: number;
}

export interface Baseline {
  id: ID;
  projectId: ID;
  name: string;
  capturedAt: string;
  snapshot: Record<ID, { earlyStart: string; earlyFinish: string }>;
}
