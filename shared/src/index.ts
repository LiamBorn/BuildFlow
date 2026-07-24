export type UserRole = "Project Manager" | "Superintendent" | "Crew Lead";

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

export const onboardingProductOptions = [
  {
    id: "map-field-ops",
    label: "Map & Field Ops",
    description: "Track vehicles, equipment, and design traffic routes."
  },
  {
    id: "field-updates-delayIQs",
    label: "Field Updates & DelayIQs",
    description: "Capture crew updates, delayIQ causes, photos, and recovery notes."
  },
  {
    id: "production-reports",
    label: "Production Reports",
    description: "Review backlog, schedule health, utilization, and weekly progress."
  },
  {
    id: "materials-readiness",
    label: "Materials Readiness",
    description: "Track delivery status and flag missing materials before dispatch."
  },
  {
    id: "equipment-tracking",
    label: "Equipment Tracking",
    description: "See equipment assignment, usage, and maintenance status."
  },
  {
    id: "crew-scheduling",
    label: "Crew Scheduling",
    description: "Plan crews by capacity, trade, day, and ready work."
  },
  {
    id: "schedule-ai",
    label: "Schedule AI",
    description: "Spot conflicts and turn blockers into recovery suggestions."
  }
] as const;

export type OnboardingProductId = (typeof onboardingProductOptions)[number]["id"];

export type User = {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  avatar: string;
};

export type Status =
  | "Not Started"
  | "Ready"
  | "Ready to Start"
  | "Planned"
  | "Confirmed"
  | "In Progress"
  | "On Site"
  | "DelayIQed"
  | "Complete"
  | "At Risk";

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
  image: string;
  latitude: number;
  longitude: number;
};

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

/* Planned-vs-actual maths, shared so the field's phone and the server's
   variance check agree on what "behind" means. */
export { scheduleCalendar, plannedPercentAt, forecastIQFinish, type PlannedWindow } from "./progress";

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
};

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

export type ScheduleAssignment = {
  id: string;
  jobId: string;
  crewId: string;
  date: string;
  status: Status;
  conflicts: string[];
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
  | "blocked";

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
};
