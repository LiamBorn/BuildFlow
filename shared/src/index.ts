/**
 * A login's PERMISSION LEVEL in its workspace — the ONLY role a person has.
 * Stored on the control table `accounts`; what the person may do.
 *
 * There used to be a second, parallel role: a `UserRole` job title on the crew
 * roster ("Project Manager" | "Superintendent" | "Crew Lead"), in a different
 * database, in a column also called `role`. Asked to remove it (2026-09-19):
 * the construction titles are gone and these three are the whole taxonomy.
 * Migration 25 drops both columns. What a person DOES for a living is still
 * recorded — `User.title` is free text, and the Time card prices labour by
 * trade — but neither is a role, and neither decides anything.
 *
 * Ordered deliberately, weakest last, so a rank comparison reads the way it sounds.
 */
export type PermissionLevel = "owner" | "admin" | "member";

export const permissionLevels = ["owner", "admin", "member"] as const satisfies readonly PermissionLevel[];

/** Higher outranks lower. Used for "an Admin may not act on an Owner" style rules. */
export const permissionRank: Record<PermissionLevel, number> = { owner: 3, admin: 2, member: 1 };

export const isPermissionLevel = (value: unknown): value is PermissionLevel =>
  typeof value === "string" && (permissionLevels as readonly string[]).includes(value);

/** The label a person sees. The stored value stays lowercase. */
export const permissionLevelLabels: Record<PermissionLevel, string> = {
  owner: "Workspace Owner",
  admin: "Admin",
  member: "Member"
};

export const businessTypeOptions = [
  "Asphalt",
  "Concrete",
  "Roofing",
  "General Contractor",
  "Excavation",
  "Utilities",
  "Framing",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Masonry",
  "Drywall",
  "Landscaping",
  "Painting"
] as const;

export type BusinessTypeId = (typeof businessTypeOptions)[number];

/**
 * The paid add-ons offered at onboarding — everything else (crew scheduling,
 * projects, materials readiness, field updates & delayIQs, production reports)
 * ships in the base product and is therefore not a choice here.
 *
 * Adding or removing an entry changes the `OnboardingProductId` union, which
 * three maps are keyed by: `programRegistry` and the tutorial's `productSteps`
 * (both in client/src/App.tsx) and this list. TypeScript enforces all three.
 */
export const onboardingProductOptions = [
  // "map-field-ops" (Map & Field Ops) was here until 2026-09-22; the page is in the backlog
  // (docs/backlog.md). "equipment-tracking" (Equipment Tracking) was here until 2026-09-23,
  // when the Equipment page became part of every plan. A selection stored under either id
  // is filtered out on both sides.
  {
    id: "time-cards",
    label: "Time Cards",
    description: "Log crew hours against jobs, then approve them for payroll and job costing."
  },
  {
    // id kept as `schedule-ai` so selections already stored under it survive;
    // the product is presented as the whole AI capability, not just the
    // scheduling half.
    id: "schedule-ai",
    label: "AI",
    description: "Spot conflicts, answer questions, and turn blockers into recovery suggestions."
  }
] as const;

export type OnboardingProductId = (typeof onboardingProductOptions)[number]["id"];

/** The plans a workspace can be on. Enterprise is priced by sales, never by checkout. */
export const planOptions = ["free", "pro", "business", "enterprise"] as const;
export type PlanId = (typeof planOptions)[number];

/** A teammate invited by email who has not accepted yet. Lives on the org, not the workspace. */
export type TeamInvite = {
  id: string;
  email: string;
  /** The level the account will be created at. Acceptance is the one moment a workspace decides what a new login may do. */
  permission: PermissionLevel;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  /** Null while the owner's own email is unconfirmed — the invite goes out the moment it is. */
  sentAt: string | null;
};

/** Who may be invited at which level. An Owner is never invited; ownership is transferred. */
export const invitablePermissionLevels = ["admin", "member"] as const satisfies readonly PermissionLevel[];

/** What the invited person sees before accepting. */
export type InvitePreview = {
  email: string;
  permission: PermissionLevel;
  orgName: string;
  inviterName: string;
  expiresAt: string;
};

/**
 * Where the org stands with money. Derived on the server from the trial the
 * org started at onboarding and any Stripe subscription on the owner's email.
 */
export type BillingStatus = "free" | "trial" | "active" | "trial_expired" | "enterprise";

export type User = {
  id: string;
  name: string;
  /**
   * What this person may do in the workspace. Null for a roster row with no login
   * behind it — a seeded example, or someone whose access was removed.
   *
   * DERIVED, never stored here: the level lives on the control table `accounts`,
   * and the server resolves it as it serialises the roster. A copy on this row
   * could disagree with the one the server actually authorizes on, which is the
   * kind of disagreement nobody notices until it matters.
   */
  permission?: PermissionLevel | null;
  title: string;
  avatar: string;
  /** The login account this person is, when they have one. The registered owner always does. */
  accountId?: string | null;
  /** Seeded teammate from the starter workspace — shown as an example, safe to remove. */
  isSample?: boolean;
  /**
   * When this person's access was revoked. The row stays on the roster after a removal so that
   * every field report, variance and project they are named on still resolves to a real person —
   * only the login goes. Null for everyone who is still here.
   */
  removedAt?: string | null;
};

/** The one status list every job, booking, filter, lane, badge and drawer shares — in workflow order. */
export const JOB_STATUSES = [
  "Not Started",
  "Ready",
  "Ready to Start",
  "Planned",
  "Confirmed",
  "In Progress",
  "On Site",
  "DelayIQed",
  "At Risk",
  "Complete"
] as const;
export type Status = (typeof JOB_STATUSES)[number];

export type Project = {
  id: string;
  name: string;
  slug: string;
  location: string;
  address: string;
  type: string;
  contractType: string;
  managerId: string;
  targetCompletion: string;
  percentComplete: number;
  scheduleHealth: "On Track" | "Monitor" | "At Risk" | "Complete";
  status: Status;
  /**
   * Contract value in whole dollars. Optional on purpose — a project can be
   * scheduled long before anyone puts a number on it, and reporting treats a
   * missing value as "not priced" rather than as zero.
   */
  value?: number;
  image: string;
  latitude: number;
  longitude: number;
};

/**
 * A job's clock, "7:00 AM" or "15:30", as "HH:mm"; null when it is not a time. One reading for
 * both sides (2026-09-23): the server finds the weather in a job's hours with it and the schedule's
 * job panel shows the same hours with it, so the two can never disagree about which day is clear.
 */
export function parseClock(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(text);
  const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(text);
  let hours: number;
  let minutes: number;
  if (twelve) {
    hours = Number(twelve[1]) % 12;
    if (twelve[3].toLowerCase() === "p") hours += 12;
    minutes = Number(twelve[2] ?? 0);
  } else if (twentyFour) {
    hours = Number(twentyFour[1]);
    minutes = Number(twentyFour[2]);
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** The program's working day when a job's own times cannot be read: 7:00 AM to 3:30 PM. */
export const DEFAULT_JOB_HOURS = { start: "07:00", end: "15:30" } as const;

/** The hours a job works, as "HH:mm". */
export function jobHours(job: { startTime?: string; endTime?: string }): { start: string; end: string } {
  const start = parseClock(job.startTime);
  const end = parseClock(job.endTime);
  return start && end && end > start ? { start, end } : { ...DEFAULT_JOB_HOURS };
}

export type UpdateProjectInput = Pick<
  Project,
  | "name"
  | "location"
  | "address"
  | "type"
  | "contractType"
  | "managerId"
  | "targetCompletion"
  | "percentComplete"
  | "status"
  | "scheduleHealth"
  | "value"
>;

export type CreateProjectInput = UpdateProjectInput;

export type Phase = {
  id: string;
  projectId: string;
  name: string;
  status: "On Track" | "At Risk" | "DelayIQed" | "Not Started";
  percentComplete: number;
  startDate: string;
  endDate: string;
  color: string;
  sequence: number;
};

/**
 * A phase's own dates. Either may move on its own — the Month calendar's "<phase> Complete"
 * marker is draggable, and what it writes is the finish.
 */
export type UpdatePhaseInput = Partial<Pick<Phase, "startDate" | "endDate">>;

/* The CPM engine owns the precedence/constraint vocabulary — it is deliberately
   domain-agnostic, so the schedule network types live there and the domain
   re-exports them rather than declaring a second, drifting copy. */
export {
  calculateCpm,
  compareToBaseline,
  createWorkCalendar,
  toDayIndex,
  fromDayIndex,
  inclusiveDuration,
  localIsoDate,
  type DependencyType,
  type ConstraintType,
  type CpmTask,
  type CpmLink,
  type CpmTaskResult,
  type CpmResult,
  type WorkCalendar,
  type WorkCalendarOptions,
  type BaselineVariance
} from "./cpm";

/* One profile per trade — what BuildFlow becomes for an asphalt vs. a concrete
   vs. a roofing business. Shared so the picker, the seed, the runtime copy and
   the AI all describe the same trade the same way. */
export { tradeProfiles, tradeProfileFor, type TradeProfile, type TradeIcon, type TradeTone } from "./tradeProfiles";

/* Password rules shared by the signup form (live meter) and the signup route. */
export { PASSWORD_MIN_LENGTH, passwordProblem, passwordStrength, type PasswordStrength } from "./passwordPolicy";

/* Planned-vs-actual maths, shared so the field's phone and the server's
   variance check agree on what "behind" means. */
export {
  scheduleCalendar,
  scheduleCalendarFor,
  plannedPercentAt,
  forecastIQFinish,
  projectScheduleStatus,
  portfolioScheduleStatus,
  type PlannedWindow,
  type ProjectScheduleStatus
} from "./progress";

import type { DependencyType, ConstraintType } from "./cpm";

/** A dependency link in the schedule network. `lagDays` may be negative (lead). */
export type JobDependency = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
};

export type CreateJobDependencyInput = Omit<JobDependency, "id">;

export type Job = {
  id: string;
  projectId: string;
  name: string;
  phase: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  requiredLabor: number;
  requiredEquipment: string;
  materialsStatus: "Delivered" | "Ordered" | "Missing" | "Waiting on Delivery";
  status: Status;
  priority: "High" | "Medium" | "Normal";
  notes: string;
  /** CPM date constraint. Absent/ASAP means the network alone drives the dates. */
  constraintType?: ConstraintType;
  constraintDate?: string;
  /** Saved baseline the current plan is measured against. */
  baselineStart?: string;
  baselineEnd?: string;
  /**
   * Work actually done, 0–100, as last reported from the field. This is a
   * *fact* the crew owns: it writes through on every progress report. The
   * job's dates are the *plan* and stay under the PM's control — when progress
   * implies the dates should move, that surfaces as a pending ScheduleVariance
   * rather than an overwrite.
   */
  percentComplete: number;
  /** First date the field reported work underway. Set on the first report > 0%. */
  actualStart?: string;
  /** Date the field reported 100%. */
  actualFinish?: string;
  /**
   * Bumped by every write. Send it back with a save and the server refuses one made against a
   * copy somebody else has already replaced, rather than overwriting them without a word.
   */
  version?: number;
};

/* Progress fields are owned by the field reporting loop, not the planner, so
   they are not part of creating a job. */
export type CreateJobInput = Omit<Job, "id" | "percentComplete" | "actualStart" | "actualFinish"> & {
  percentComplete?: number;
};

export type CrewRoleCategory = "Labor" | "Operator";

export type CrewLaborMixItem = {
  category: CrewRoleCategory;
  role: string;
  count: number;
};

export type CreateCrewInput = {
  name: string;
  specialty: string;
  foreman: string;
  laborMix: CrewLaborMixItem[];
  /** Hourly rate per worker; omitted = the specialty's default. */
  rate?: number;
};

/** The hourly rate a crew costs per worker when nobody has set one — by specialty, so the demo's costs are believable. */
export const DEFAULT_CREW_RATE = 95;
const SPECIALTY_RATES: Array<[RegExp, number]> = [
  [/electric|mep|mechanical|plumb/i, 96],
  [/concrete|masonry|foundation/i, 88],
  [/utilit|drain|pipe/i, 84],
  [/pav|asphalt|surfac/i, 82],
  [/earth|excav|grade|trench|backfill|haul/i, 78],
  [/fram|carpent|roof/i, 76],
  [/finish|paint|drywall|landscap/i, 70]
];
export function defaultCrewRate(specialty: string): number {
  const match = SPECIALTY_RATES.find(([pattern]) => pattern.test(specialty));
  return match ? match[1] : DEFAULT_CREW_RATE;
}

export type UpdateCrewInput = CreateCrewInput;

export type Crew = {
  id: string;
  name: string;
  specialty: string;
  lead: string;
  size: number;
  capacity: number;
  utilization: number;
  icon: string;
  status: "Available" | "Scheduled" | "Overbooked";
  /** Blended hourly rate per worker, in dollars. Unset crews read as defaultCrewRate(specialty). */
  rate?: number;
  laborMix: CrewLaborMixItem[];
};

export type Equipment = {
  id: string;
  name: string;
  type: string;
  status: "Available" | "In Use" | "Maintenance";
  assignedTo?: string;
};

export type CreateEquipmentInput = Omit<Equipment, "id">;

export type UpdateEquipmentInput = CreateEquipmentInput;

export type Material = {
  id: string;
  projectId: string;
  name: string;
  status: "Ready" | "Ordered" | "Waiting on Delivery" | "Missing";
  deliveryDate: string;
  quantity: string;
};

export type CreateMaterialInput = Omit<Material, "id">;

/** A material line is edited whole — the Inventory's status change sends the other fields back as they were. */
export type UpdateMaterialInput = CreateMaterialInput;

export type ScheduleAssignment = {
  id: string;
  jobId: string;
  crewId: string;
  date: string;
  /** Always the job's status: a booking wears its job's status and never carries one of its own. */
  status: Status;
  conflicts: string[];
  /** Bumped by every write, and sent back with a move so a stale one is refused rather than applied. */
  version?: number;
};

export type FieldUpdate = {
  id: string;
  projectId: string;
  jobId?: string;
  userId: string;
  message: string;
  status: Status;
  createdAt: string;
  photos: string[];
  /**
   * Work complete on `jobId` at the moment of reporting, 0–100. Optional — a
   * note-only update (no number) stays a plain log entry and never touches the
   * schedule. Requires `jobId`: progress is meaningless without a job to hang
   * it on.
   */
  percentComplete?: number;
};

/* ── Field progress → master schedule loop ────────────────────────────────────
   A field report is evidence, never an edit. When reported progress implies the
   plan is wrong, the server records a ScheduleVariance holding the *proposed*
   change plus its downstream ripple, and leaves the master schedule untouched
   until a PM accepts. Rejecting keeps the plan and preserves the disagreement
   as history — which is the point: the variance is the signal, and silently
   overwriting the plan would destroy it. */

/** How a field report and the plan disagree. */
export type VarianceKind =
  /** Reported progress trails the plan — the job forecastIQs late. */
  | "slip"
  /** Reported progress leads the plan — the job forecastIQs early. */
  | "ahead"
  /** Reported 100% before the planned finish. */
  | "complete"
  /** Field flagged the work stopped (DelayIQed/At Risk) regardless of percent. */
  | "blocked"
  /** WeatherIQ: a job day was called off for weather, and this is where the job would go instead. */
  | "weather";

export type VarianceStatus = "pending" | "accepted" | "rejected" | "superseded";

/** One downstream job the proposed change would move. */
export type VarianceRippleItem = {
  jobId: string;
  jobName: string;
  currentStart: string;
  currentEnd: string;
  proposedStart: string;
  proposedEnd: string;
  /** Working days the job shifts. Positive = later. */
  shiftDays: number;
  critical: boolean;
};

/** The schedule change a field report implies, held for review. */
export type VarianceProposal = {
  currentStart: string;
  currentEnd: string;
  proposedStart: string;
  proposedEnd: string;
  /** Successors the change would push. Excludes the reporting job itself. */
  ripple: VarianceRippleItem[];
  /** Working days the project finish moves. 0 = absorbed by float. */
  projectSlipDays: number;
  /** True when the reporting job sits on the critical path. */
  criticalPath: boolean;
  /** Total float the reporting job had under the current plan, in working days. */
  totalFloatDays: number;
  /**
   * A weather reschedule only (kind "weather"): whether the day it moves the job to was checked
   * against the site's forecast. "unavailable": the forecast could not be read when the day was
   * called off; "beyond": the day is past the last one the forecast covered. In both, the working
   * calendar alone chose it, and whoever decides the reschedule is told so.
   */
  weatherCheck?: "forecast" | "unavailable" | "beyond";
};

export type ScheduleVariance = {
  id: string;
  projectId: string;
  jobId: string;
  /** The field report that raised this. */
  fieldUpdateId: string;
  kind: VarianceKind;
  severity: "Low" | "Medium" | "High";
  status: VarianceStatus;
  reportedPercent: number;
  /** Where the plan says the job should have been on `detectedAt`. */
  plannedPercent: number;
  /** Working days of drift the report implies. Positive = late. */
  varianceDays: number;
  detectedAt: string;
  proposal: VarianceProposal;
  resolvedAt?: string;
  /** User id of the PM who accepted or rejected. */
  resolvedBy?: string;
  resolutionNote?: string;
};

export type DelayIQ = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  impactDays: number;
  severity: "Low" | "Medium" | "High";
  status: "Open" | "Monitoring" | "Resolved";
  reportedAt: string;
  description: string;
};

export type ReadinessItem = {
  id: string;
  projectId: string;
  label: string;
  complete: boolean;
  dueDate: string;
};

export type Inspection = {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string;
  status: "Upcoming" | "Ready" | "Complete";
};

export type WeatherAlert = {
  id: string;
  projectId?: string;
  title: string;
  details: string;
  severity: "Low" | "Medium" | "High";
  startsAt: string;
};

/* ── WeatherIQ (2026-09-23): the week's forecast at every active job site ──────────────────
   Read on the server from Open-Meteo (server/src/weather.ts) and scored on the client by plain
   thresholds (client/src/weather/weatherIQ.ts). The weather alerts above are what a workspace
   keeps by hand; these are the live forecast. */

/** One day of a site's forecast, in the units a US jobsite plans in. */
export type WeatherForecastDay = {
  /** The site's own calendar day, YYYY-MM-DD. */
  date: string;
  /** The WMO weather code: 0 clear, 1–3 cloud, 45–48 fog, 51–67 drizzle and rain, 71–86 snow, 95–99 storms. */
  code: number;
  highF: number;
  lowF: number;
  /** The day's highest hourly chance of rain, 0–100. */
  rainChance: number;
  /** Rain expected over the day, inches. */
  rainInches: number;
  /** The strongest gust, mph. */
  gustMph: number;
};

/** What makes an hour of weather stop or slow outdoor work. */
export type WeatherCause = "lightning" | "rain" | "snow" | "wind" | "heat" | "cold" | "fog";
/** Watch: weather that costs production. Hold: weather nobody should be working in. */
export type WeatherSeverity = "watch" | "hold";

/**
 * A run of hours at one site when the weather crosses a WeatherIQ threshold (server/src/weather.ts
 * holds them). Times are the site's own wall clock, "YYYY-MM-DDTHH:mm", and `end` is exclusive —
 * the same clock a job's "7:00 AM" is written in, so the two compare directly.
 */
export type WeatherWindow = {
  cause: WeatherCause;
  severity: WeatherSeverity;
  start: string;
  end: string;
  /** What crossed the line, in words: "thunderstorms", "0.40 in of rain", "gusts to 38 mph". */
  reason: string;
};

/**
 * The weather at a site as its forecast was read: the temperature and the sky. The provider takes
 * it every quarter hour, and the server re-reads a site at most every half hour, so `at` says how
 * old it is.
 */
export type WeatherReading = {
  /**
   * When the provider took the reading (ISO). An instant, not the site's wall clock: it is read
   * beside the section's "updated" time, which is the reader's own clock.
   */
  at: string;
  tempF: number;
  /** The WMO weather code, read the same way as a day's. */
  code: number;
};

export type SiteWeatherForecast = {
  projectId: string;
  /** The place the forecast is for, as the site was found ("Austin, Texas"). */
  place: string;
  /**
   * How the site was placed: the project's own stored point, its address (looked up, because new
   * projects are stored at a placeholder point), or a location an Owner or Admin set for WeatherIQ.
   */
  locatedBy: "project" | "address" | "custom";
  /** The site's IANA time zone, which is what its days are counted in. */
  timezone: string;
  /** When this site's forecast was read from the provider (ISO). */
  fetchedAt: string;
  /** The weather there when it was read; null when the provider sent no reading with the forecast. */
  current: WeatherReading | null;
  days: WeatherForecastDay[];
  /** The hours in the coming week that cross a threshold, per cause, soonest first. */
  windows: WeatherWindow[];
};

/** Open: waiting on the person in charge. Cancelled: that day was called off. Kept: they chose to work it. Cleared: the forecast no longer shows it. */
export type WeatherConflictStatus = "open" | "cancelled" | "kept" | "cleared";

/**
 * One job's working day that forecast weather reaches during the job's own hours (WeatherIQ,
 * 2026-09-23). Found by the server each time it reads the forecast, kept so a decision on it
 * sticks, and addressed to the person in charge — the project's manager.
 */
export type WeatherConflict = {
  /** `wx-<jobId>-<date>`: one per job per day, so a re-read updates it rather than adding another. */
  id: string;
  jobId: string;
  projectId: string;
  /** The working day, site-local YYYY-MM-DD. */
  date: string;
  /** The worst weather that overlaps the job's hours that day. */
  cause: WeatherCause;
  severity: WeatherSeverity;
  /** When it overlaps the job's hours, site-local "YYYY-MM-DDTHH:mm"; `end` exclusive. */
  start: string;
  end: string;
  reason: string;
  /** The person in charge: the project manager's user id, or "" when the project has none. */
  assigneeId: string;
  status: WeatherConflictStatus;
  detectedAt: string;
  updatedAt: string;
  decidedAt?: string;
  /** User id of whoever called the day off or kept it. */
  decidedBy?: string;
  /** The reschedule a call-off raised: a ScheduleVariance of kind "weather", accepted or rejected like any other. */
  varianceId?: string;
  /** The delay a call-off logged. */
  delayIQId?: string;
};

/** Where WeatherIQ reads a project's forecast when an Owner or Admin has set it, instead of the project's address. */
export type WeatherLocation = {
  projectId: string;
  /** What they typed: an address, a ZIP code or a town. */
  query: string;
  /** What it was found as: "Round Rock, Texas". */
  place: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  /** User id of whoever set it. */
  updatedBy: string;
};

export type WeatherForecastPayload = {
  /** The provider, named so the panel can credit it: Open-Meteo's data is CC BY 4.0. */
  source: "open-meteo";
  sites: SiteWeatherForecast[];
  /** Active projects whose site could not be found from their address — never forecast somewhere they are not. */
  unplaced: string[];
  /** The job days this week's weather reaches, as the server now has them (cleared ones left out). */
  conflicts: WeatherConflict[];
};

export type ResourcesPayload = {
  crews: Crew[];
  equipment: Equipment[];
  materials: Material[];
};

export type BootstrapPayload = {
  users: User[];
  activeUser: User;
  projects: Project[];
  jobs: Job[];
  crews: Crew[];
  equipment: Equipment[];
  materials: Material[];
  assignments: ScheduleAssignment[];
  dependencies: JobDependency[];
  fieldUpdates: FieldUpdate[];
  variances: ScheduleVariance[];
  delayIQs: DelayIQ[];
  readiness: ReadinessItem[];
  phases: Phase[];
  inspections: Inspection[];
  weatherAlerts: WeatherAlert[];
  /**
   * This session may read the workspace and change nothing — the shared demo on a public address.
   *
   * A property of the SESSION rather than of the workspace, carried here because the shell already
   * holds this payload and would otherwise need a second fetch to find out. The server decides
   * (server/src/permissions.ts): whether the demo is locked depends on where the server runs, so the
   * client cannot work it out and must not keep its own copy of the rule.
   */
  readOnly?: boolean;
  /** WeatherIQ's job days at risk, from today on (cleared ones left out). Optional: a workspace that never read a forecast has none. */
  weatherConflicts?: WeatherConflict[];
  /**
   * The trade this workspace is built around, recorded on the org when the
   * owner picks it at onboarding. Optional because older tenant DBs (and test
   * fixtures) predate it; the client falls back to what the browser last
   * stored, then to the generic experience.
   */
  businessType?: BusinessTypeId | "";
  /**
   * Set when the owner finished onboarding (picked a trade). The client sends
   * a signed-in account to onboarding while this is missing, instead of
   * guessing from how many users the workspace has.
   */
  onboardingCompletedAt?: string | null;
  /** Plan, add-ons and seats chosen at onboarding, recorded on the org (not the browser). */
  selectedPlan?: PlanId | null;
  selectedProducts?: OnboardingProductId[];
  seats?: number | null;
  /** A paid plan without a completed checkout runs as a dated trial; this is when it ends. */
  trialEndsAt?: string | null;
  /** True for a workspace created beside the person's first one (2026-09-15): a dated free trial whatever its plan. */
  workspaceTrial?: boolean;
  billingStatus?: BillingStatus;
  /** The signed-in login behind this bootstrap, for the "verify your email" notice. */
  account?: { email: string; emailVerifiedAt: string | null } | null;
  /** The workspace's working week and holidays (Settings › Work calendar). Older tenants read the computed default. */
  workCalendar?: WorkCalendarSetting;
  /** Per-person preferences kept on the server (tutorial progress today), keyed by setting name. */
  userSettings?: Record<string, string>;
  /** True while the trade's starter workspace is loaded as sample data (P3.6); it can be removed again. */
  sampleData?: boolean;
};

/**
 * One of a person's workspaces, as the Dashboard's switcher lists them (GET /api/workspaces).
 * `title` is the trade the workspace is set up for -- "Roofing", "Asphalt" -- which is what the
 * switcher calls it; `name` is the company behind it. `kind` tells the original ("home") from
 * the ones created beside it ("extra"): those are what the limit counts and the 7-day trial
 * applies to.
 */
export type WorkspaceSummary = {
  id: string;
  name: string;
  title: string;
  businessType: BusinessTypeId | "";
  kind: "home" | "extra";
  role: PermissionLevel;
  active: boolean;
  onboardingCompletedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
};
export type WorkspacesPayload = {
  workspaces: WorkspaceSummary[];
  activeId: string;
  /** How many workspaces a login may create beside its first, and how many of those it still can. */
  limit: number;
  remaining: number;
};

/* Schedule Creation Tool — the §3 contract and (soon) the CPM engine, kept in
   their own namespace so `Project` / `Crew` don't collide with the existing
   BuildFlow domain types above. Usage: `import type { Schedule } from "@buildflow/shared"`. */
export type * as Schedule from "./schedule/types";
export type * as ScheduleApi from "./schedule/api";
export * as scheduleEngine from "./schedule/cpm";

/* ── batch re-booking: POST /api/schedule/rebook ─────────────────────────────
   One request for everything a drop touches; all of it applies or none of it. */

/** One step of a re-book: a booking moved, made or dropped, or a job's dates. */
export type RebookMove =
  /** `version` is the row as the client last read it; the server refuses the step if it has moved on. */
  | { op: "move"; id: string; crewId?: string; date?: string; version?: number }
  | { op: "book"; jobId: string; crewId: string; date: string }
  | { op: "unbook"; id: string }
  | ({ op: "job"; id: string; startDate: string; endDate: string; version?: number } & JobEdits);

/** What a save may change on a job besides its dates — the drawer's other fields — so a move and its edits are one request. */
export type JobEdits = Partial<Pick<Job, "status" | "priority" | "notes" | "startTime" | "endTime" | "materialsStatus">>;

/** A crew already booked on the day a step wants. The server answers 409 with these unless the caller forces the booking. */
export type CrewClash = {
  crewId: string;
  crewName: string;
  date: string;
  /** The booking already on that crew-day. */
  jobId: string;
  jobName: string;
  /** The job that wants the same crew-day. */
  movingJobId: string;
  movingJobName: string;
};

export type RebookResult = {
  /** Every booking the batch made or moved, as it is now. */
  assignments: ScheduleAssignment[];
  /** The ids the batch dropped. */
  removed: string[];
  /** Every job whose dates the batch changed, as it is now. */
  jobs: Job[];
  /** The double-bookings the caller chose to make (empty unless forced). */
  clashes: CrewClash[];
};

/* ── the work calendar: which weekdays crews work and which dates they do not ──
   Org data (workspace_settings "workCalendar"), read by the CPM engine, the
   month calendar and the KPI maths. Nothing about a year is in code: the
   defaults are computed for whatever year it is. */

export type WorkHoliday = { date: string; name: string };
export type WorkCalendarSetting = {
  /** Weekdays crews work, 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  holidays: WorkHoliday[];
};

/** A six-day construction week. */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

const isoDay = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
};
/** The nth (1-based) weekday of a month, or the last one when `n` is -1. */
const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return isoDay(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return isoDay(year, month, lastDay.getUTCDate() - back);
};
/** A fixed-date holiday as it is observed: Saturday → the Friday before, Sunday → the Monday after. */
const observed = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** The US federal holidays of a year, on their observed dates. */
export function usFederalHolidays(year: number): WorkHoliday[] {
  return [
    { date: observed(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day" },
    { date: nthWeekday(year, 5, 1, -1), name: "Memorial Day" },
    { date: observed(year, 6, 19), name: "Juneteenth" },
    { date: observed(year, 7, 4), name: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: nthWeekday(year, 10, 1, 2), name: "Columbus Day" },
    { date: observed(year, 11, 11), name: "Veterans Day" },
    { date: nthWeekday(year, 11, 4, 4), name: "Thanksgiving" },
    { date: observed(year, 12, 25), name: "Christmas Day" }
  ];
}

/** The days construction crews usually take: the federal list minus the ones most sites work through. */
export function constructionHolidays(year: number): WorkHoliday[] {
  const skipped = new Set(["Martin Luther King Jr. Day", "Presidents' Day", "Columbus Day", "Veterans Day"]);
  return usFederalHolidays(year).filter((holiday) => !skipped.has(holiday.name));
}

/** What a workspace works until someone edits it: a six-day week, this year's and next year's construction holidays. */
export function defaultWorkCalendar(year = new Date().getFullYear()): WorkCalendarSetting {
  return { workingDays: [...DEFAULT_WORKING_DAYS], holidays: [...constructionHolidays(year), ...constructionHolidays(year + 1)] };
}

/** A well-formed calendar from whatever was stored: known weekdays only (at least one), dated holidays, no duplicates, sorted. */
export function normalizeWorkCalendar(input: Partial<WorkCalendarSetting> | null | undefined): WorkCalendarSetting {
  const fallback = defaultWorkCalendar();
  const workingDays = [
    ...new Set((input?.workingDays ?? fallback.workingDays).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))
  ].sort();
  const seen = new Set<string>();
  const holidays = (input?.holidays ?? fallback.holidays)
    .filter((holiday) => /^\d{4}-\d{2}-\d{2}$/.test(holiday?.date ?? "") && !seen.has(holiday.date) && seen.add(holiday.date))
    .map((holiday) => ({
      date: holiday.date,
      name:
        String(holiday.name ?? "Holiday")
          .trim()
          .slice(0, 80) || "Holiday"
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { workingDays: workingDays.length > 0 ? workingDays : [...DEFAULT_WORKING_DAYS], holidays };
}

/** date → name, the shape the calendar cells and the KPI maths read. */
export function holidayMap(calendar: WorkCalendarSetting): Record<string, string> {
  return Object.fromEntries(calendar.holidays.map((holiday) => [holiday.date, holiday.name]));
}

export function isWorkingDay(iso: string, calendar: WorkCalendarSetting): boolean {
  if (calendar.holidays.some((holiday) => holiday.date === iso)) return false;
  return calendar.workingDays.includes(new Date(`${iso}T00:00:00`).getDay());
}

/** One change to the schedule, as the live feed tells every open schedule page of the org. */
export type ScheduleLiveEvent = {
  /** What changed: bookings, jobs, or the work calendar. */
  kind: "assignments" | "jobs" | "calendar";
  /** How: a drop's move / book / unbook, a job's fields, dates an accepted variance moved, the calendar, a deletion. */
  op: "move" | "book" | "unbook" | "job" | "dates" | "calendar" | "delete";
  /** The bookings and jobs it touched. */
  ids: string[];
  /** Who did it. */
  by: { id: string; name: string };
  /** The browser tab that did it, so that tab does not flash its own move. */
  client: string | null;
  at: string;
};

/* ── the weekly digest: what changed in the plan between two Monday snapshots ── */
export type WeeklyDigestJobMove = {
  id: string;
  name: string;
  project: string;
  from: { startDate: string; endDate: string };
  to: { startDate: string; endDate: string };
  /** Days the start moved; positive is later. */
  days: number;
};
export type WeeklyDigestConflict = { crewId: string; crewName: string; date: string; jobs: string[] };
export type WeeklyDigestMilestone = { id: string; title: string; project: string; from: string; to: string; days: number };
export type WeeklyDigest = {
  /** Monday of the week the digest is for. */
  weekOf: string;
  /** Monday of the snapshot it was compared with, or null when this is the first snapshot. */
  previousWeekOf: string | null;
  capturedAt: string;
  movedJobs: WeeklyDigestJobMove[];
  newJobs: Array<{ id: string; name: string; project: string; startDate: string }>;
  newConflicts: WeeklyDigestConflict[];
  clearedConflicts: number;
  slippedMilestones: WeeklyDigestMilestone[];
  totals: { jobs: number; bookings: number; conflicts: number };
};

/* ── One inbox for the website and the Mac (notch plan, step 3, 2026-09-26) ──────────────────
   The bell's notification list, the Dashboard's greeting and the Meetings panel's clock moved here
   from the client, so the website and the Mac's notch show the same thing. */
export {
  buildNotificationItems,
  notificationNeedsAttention,
  projectsManagedBy,
  type InboxNotification,
  type NotificationDestination,
  type NotificationKind,
  type NotificationRecordRef,
  type NotificationSources,
  type NotificationTone
} from "./notifications";
export {
  GREETING_WORDS,
  WELCOME_BACK_AFTER_MS,
  firstNameOf,
  greetingFor,
  hourOf,
  partOfDay,
  type Greeting,
  type GreetingKind
} from "./greeting";
export { MEETING_SOON_MS, allDaySpan, meetingState, upNext, type MeetingState, type MeetingTimes } from "./meetings";
export { WEATHER_CAUSE_LABEL, weatherClockWords, weatherTimeRange, weekdayName } from "./weatherWords";

/* The Mac's Jobs and Tasks tabs: the coming week's jobs, yours first, and what is waiting on you. */
export { addIsoDays, isWorkday, upcomingJobs, type UpcomingJob, type UpcomingJobWeather, type UpcomingJobsSources } from "./upcomingJobs";
export {
  NEEDS_YOU_LEVELS,
  needsYou,
  type NeedsYouAction,
  type NeedsYouCapability,
  type NeedsYouKind,
  type NeedsYouOptions,
  type NeedsYouSources,
  type NeedsYouTask,
  type PendingTimeEntry
} from "./needsYou";
