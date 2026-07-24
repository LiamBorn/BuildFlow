// TimeCard module — deterministic, self-contained labor/time model.
//
// Mirrors how Reports/Dashboard mix live `data` with curated illustrative
// content so the program renders a complete story even when the working
// database is empty. All values are seeded (no Math.random) so numbers stay
// stable and reproducible, matching BuildFlow's "transparent model" approach.

import type { BootstrapPayload } from "@buildflow/shared";
import { weekDays } from "./scheduleUtils";

export type TcClassification = "Employee" | "Subcontractor" | "Apprentice";
export type TcCategory = "Labor" | "Operator" | "Supervisor";
export type TcEntrySource = "Manual" | "Field Sync" | "Schedule" | "Equipment";
export type TcEntryStatus = "Draft" | "Submitted" | "Approved" | "Flagged";
export type TcApprovalLevel = "Crew Lead" | "Superintendent" | "Project Manager" | "Accounting";
export type TcApprovalState = "Approved" | "Pending" | "Awaiting" | "Rejected";

export type TcProject = {
  id: string;
  code: string;
  name: string;
  location: string;
  budgetHours: number;
  prevailingWage: boolean;
};

export type TcCrew = {
  id: string;
  name: string;
  trade: string;
  projectId: string;
  leadWorkerId: string;
  scheduledHeadcount: number;
};

export type TcWorker = {
  id: string;
  name: string;
  initials: string;
  crewId: string;
  role: string;
  category: TcCategory;
  classification: TcClassification;
  baseRate: number;
  prevailingRate: number;
  skills: string[];
};

export type TcEntry = {
  id: string;
  workerId: string;
  crewId: string;
  projectId: string;
  date: string;
  phase: string;
  task: string;
  regularHours: number;
  overtimeHours: number;
  source: TcEntrySource;
  photo: boolean;
  location: boolean;
  synced: boolean;
  status: TcEntryStatus;
  note?: string;
};

export type TcApprovalStep = {
  level: TcApprovalLevel;
  state: TcApprovalState;
  by?: string;
  at?: string;
};

export type TcTimecard = {
  id: string;
  workerId: string;
  crewId: string;
  projectId: string;
  weekLabel: string;
  regularHours: number;
  overtimeHours: number;
  chain: TcApprovalStep[];
  flagged: boolean;
  flagReason?: string;
  overtimePending: boolean;
};

export type TcAuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "red" | "violet";
};

export type TcLienRecord = {
  id: string;
  projectId: string;
  subcontractor: string;
  status: "Verified" | "Pending" | "Conditional";
  throughDate: string;
  amount: number;
};

// ---------------------------------------------------------------------------
// Seeded helpers
// ---------------------------------------------------------------------------

function seededInt(seed: number, min: number, max: number) {
  // Deterministic hash → value in [min, max].
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  const frac = x - Math.floor(x);
  return min + Math.round(frac * (max - min));
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export const OVERTIME_MULTIPLIER = 1.5;
export const OVERTIME_THRESHOLD = 8; // daily hours before OT
export const BURDEN_RATE = 0.31; // benefits + taxes + workers' comp

const ROLE_RATES: Record<string, { base: number; prevailing: number; category: TcCategory }> = {
  Superintendent: { base: 68, prevailing: 71, category: "Supervisor" },
  Foreman: { base: 52, prevailing: 57, category: "Supervisor" },
  "Crew Lead": { base: 49, prevailing: 54, category: "Supervisor" },
  Electrician: { base: 54, prevailing: 61, category: "Labor" },
  Pipefitter: { base: 50, prevailing: 56, category: "Labor" },
  "Heavy Equipment Operator": { base: 47, prevailing: 52, category: "Operator" },
  "Equipment Operator": { base: 44, prevailing: 49, category: "Operator" },
  Ironworker: { base: 45, prevailing: 50, category: "Labor" },
  "Concrete Finisher": { base: 41, prevailing: 46, category: "Labor" },
  Mason: { base: 43, prevailing: 48, category: "Labor" },
  Carpenter: { base: 39, prevailing: 44, category: "Labor" },
  "Skilled Laborer": { base: 33, prevailing: 37, category: "Labor" },
  Laborer: { base: 29, prevailing: 33, category: "Labor" },
  Apprentice: { base: 24, prevailing: 27, category: "Labor" }
};

export function rateForRole(role: string) {
  return ROLE_RATES[role] ?? { base: 34, prevailing: 38, category: "Labor" as TcCategory };
}

// ---------------------------------------------------------------------------
// Curated base data
// ---------------------------------------------------------------------------

export const tcProjects: TcProject[] = [
  { id: "rmc", code: "RMC-118", name: "Riverside Medical Center", location: "Austin, TX", budgetHours: 12800, prevailingWage: true },
  { id: "hvt", code: "HVT-204", name: "Harborview Terminal", location: "Corpus Christi, TX", budgetHours: 9400, prevailingWage: true },
  { id: "pru", code: "PRU-051", name: "Pinecrest Ridge Utilities", location: "Round Rock, TX", budgetHours: 6600, prevailingWage: false },
  { id: "trl", code: "TRL-330", name: "Tech Ridge Logistics Hub", location: "Pflugerville, TX", budgetHours: 8200, prevailingWage: false }
];

type WorkerSeed = { name: string; role: string; classification?: TcClassification; skills: string[] };
type CrewSeed = { id: string; name: string; trade: string; projectId: string; phase: string; task: string; workers: WorkerSeed[] };

const crewSeeds: CrewSeed[] = [
  {
    id: "cc1",
    name: "Concrete Crew 1",
    trade: "Concrete",
    projectId: "rmc",
    phase: "Foundations",
    task: "Level 2 deck pour & finish",
    workers: [
      { name: "Marcus Bell", role: "Foreman", skills: ["Layout", "Pours", "QC sign-off"] },
      { name: "Tyler Grant", role: "Concrete Finisher", skills: ["Finishing", "Screeding"] },
      { name: "Rosa Delgado", role: "Concrete Finisher", skills: ["Finishing", "Curing"] },
      { name: "Kevin Ash", role: "Equipment Operator", skills: ["Pump truck", "Vibration"] },
      { name: "Luis Ferro", role: "Skilled Laborer", skills: ["Formwork", "Rebar"] },
      { name: "Devin Pope", role: "Apprentice", classification: "Apprentice", skills: ["Formwork"] }
    ]
  },
  {
    id: "fc2",
    name: "Framing Crew 2",
    trade: "Framing",
    projectId: "hvt",
    phase: "Structure",
    task: "Concourse steel & framing",
    workers: [
      { name: "Diego Ramos", role: "Foreman", skills: ["Layout", "Rigging", "QC sign-off"] },
      { name: "Owen Pratt", role: "Ironworker", skills: ["Bolt-up", "Welding"] },
      { name: "Hana Kim", role: "Carpenter", skills: ["Blocking", "Sheathing"] },
      { name: "Marco Ruiz", role: "Carpenter", skills: ["Framing", "Layout"] },
      { name: "Beau Tran", role: "Skilled Laborer", classification: "Subcontractor", skills: ["Material handling"] },
      { name: "Cole Barnes", role: "Apprentice", classification: "Apprentice", skills: ["Cleanup", "Blocking"] }
    ]
  },
  {
    id: "uc3",
    name: "Utility Crew 3",
    trade: "Underground Utilities",
    projectId: "pru",
    phase: "Underground Utilities",
    task: "Storm line & manhole set",
    workers: [
      { name: "Sara Whitfield", role: "Crew Lead", skills: ["Grade", "Trench safety"] },
      { name: "Nate Fox", role: "Heavy Equipment Operator", skills: ["Excavator", "Trenching"] },
      { name: "Jamal Reed", role: "Pipefitter", skills: ["Pipe laying", "Fusion"] },
      { name: "Ivan Petrov", role: "Skilled Laborer", skills: ["Bedding", "Compaction"] },
      { name: "Gabe Munoz", role: "Laborer", skills: ["Spotting", "Cleanup"] }
    ]
  },
  {
    id: "pc4",
    name: "Paving Crew 4",
    trade: "Paving",
    projectId: "trl",
    phase: "Paving",
    task: "Truck court base & binder lift",
    workers: [
      { name: "Andre Coleman", role: "Foreman", skills: ["Grade", "Density QC"] },
      { name: "Paul Stern", role: "Heavy Equipment Operator", skills: ["Paver", "Roller"] },
      { name: "Rick Vance", role: "Equipment Operator", skills: ["Roller", "Skid steer"] },
      { name: "Mona Silva", role: "Skilled Laborer", skills: ["Raking", "Joints"] },
      { name: "Tom Hale", role: "Laborer", classification: "Subcontractor", skills: ["Traffic control"] }
    ]
  },
  {
    id: "ec5",
    name: "Electrical Crew 5",
    trade: "Electrical",
    projectId: "rmc",
    phase: "Electrical Rough-In",
    task: "Level 3 rough-in & panel feeds",
    workers: [
      { name: "Priya Nair", role: "Crew Lead", skills: ["Coordination", "Terminations"] },
      { name: "Evan Brooks", role: "Electrician", skills: ["Conduit", "Wire pull"] },
      { name: "Sam Ortega", role: "Electrician", skills: ["Panels", "Testing"] },
      { name: "Lena Ford", role: "Apprentice", classification: "Apprentice", skills: ["Conduit", "Layout"] }
    ]
  }
];

export function buildWorkers(): TcWorker[] {
  const workers: TcWorker[] = [];
  crewSeeds.forEach((crew) => {
    crew.workers.forEach((seed, index) => {
      const rate = rateForRole(seed.role);
      workers.push({
        id: `${crew.id}-w${index}`,
        name: seed.name,
        initials: initialsOf(seed.name),
        crewId: crew.id,
        role: seed.role,
        category: rate.category,
        classification: seed.classification ?? "Employee",
        baseRate: rate.base,
        prevailingRate: rate.prevailing,
        skills: seed.skills
      });
    });
  });
  return workers;
}

export function buildCrews(workers: TcWorker[]): TcCrew[] {
  return crewSeeds.map((crew) => {
    const lead = workers.find((worker) => worker.crewId === crew.id);
    return {
      id: crew.id,
      name: crew.name,
      trade: crew.trade,
      projectId: crew.projectId,
      leadWorkerId: lead?.id ?? "",
      scheduledHeadcount: crew.workers.length
    };
  });
}

export function crewMeta(crewId: string) {
  return crewSeeds.find((crew) => crew.id === crewId);
}

// Workdays for the tracked week (Mon–Sat; Sunday off).
export const tcWorkDays = weekDays.slice(0, 6);
export const tcWeekLabel = `${weekDays[0].label} – ${weekDays[6].label}, 2026`;

// ---------------------------------------------------------------------------
// Time entries (seeded for the tracked week)
// ---------------------------------------------------------------------------

export function buildEntries(workers: TcWorker[]): TcEntry[] {
  const entries: TcEntry[] = [];
  workers.forEach((worker, wIndex) => {
    const crew = crewMeta(worker.crewId);
    if (!crew) return;
    tcWorkDays.forEach((day, dIndex) => {
      const seed = hashString(worker.id) + dIndex * 17;
      const isSaturday = day.day === "SAT";
      // Saturday: only part of the crew works.
      if (isSaturday && seededInt(seed, 0, 10) < 6) return;

      const base = isSaturday ? 6 : 8;
      const drift = seededInt(seed, -1, 2);
      const worked = Math.max(4, base + drift);
      const overtimeHours = isSaturday ? worked : Math.max(0, worked - OVERTIME_THRESHOLD);
      const regularHours = isSaturday ? 0 : Math.min(worked, OVERTIME_THRESHOLD);

      const sourceRoll = seededInt(seed, 0, 10);
      const source: TcEntrySource =
        worker.category === "Operator" && sourceRoll > 7
          ? "Equipment"
          : sourceRoll > 8
            ? "Field Sync"
            : sourceRoll > 6
              ? "Schedule"
              : "Manual";
      const synced = seededInt(seed + 3, 0, 10) > 1; // a couple still queued offline
      const photo = seededInt(seed + 5, 0, 10) > 4;
      const location = seededInt(seed + 7, 0, 10) > 2;

      let status: TcEntryStatus = "Submitted";
      if (!synced) status = "Draft";
      else if (overtimeHours > 0 && seededInt(seed + 9, 0, 10) > 6) status = "Flagged";
      else if (seededInt(seed + 11, 0, 10) > 6) status = "Approved";

      entries.push({
        id: `${worker.id}-${day.date}`,
        workerId: worker.id,
        crewId: worker.crewId,
        projectId: crew.projectId,
        date: day.date,
        phase: crew.phase,
        task: crew.task,
        regularHours,
        overtimeHours,
        source,
        photo,
        location,
        synced,
        status,
        note: status === "Flagged" ? "Hours exceed scheduled crew window" : undefined
      });

      // Occasional multi-job split: a worker helps another project the same day.
      if (!isSaturday && seededInt(seed + 13, 0, 12) > 10) {
        const altProject = tcProjects[(wIndex + dIndex) % tcProjects.length];
        if (altProject.id !== crew.projectId) {
          entries.push({
            id: `${worker.id}-${day.date}-alt`,
            workerId: worker.id,
            crewId: worker.crewId,
            projectId: altProject.id,
            date: day.date,
            phase: "Material Staging",
            task: "Cross-project material handling",
            regularHours: 2,
            overtimeHours: 0,
            source: "Manual",
            photo: false,
            location: true,
            synced: true,
            status: "Submitted",
            note: "Split shift — staging support"
          });
        }
      }
    });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

export function entryHours(entry: TcEntry) {
  return entry.regularHours + entry.overtimeHours;
}

export function entryCost(worker: TcWorker, entry: TcEntry) {
  const regular = entry.regularHours * worker.baseRate;
  const overtime = entry.overtimeHours * worker.baseRate * OVERTIME_MULTIPLIER;
  return regular + overtime;
}

export function entryBurdenedCost(worker: TcWorker, entry: TcEntry) {
  return entryCost(worker, entry) * (1 + BURDEN_RATE);
}

export type TcTotals = {
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  baseCost: number;
  burdenedCost: number;
};

export function emptyTotals(): TcTotals {
  return { regularHours: 0, overtimeHours: 0, totalHours: 0, baseCost: 0, burdenedCost: 0 };
}

export function accumulate(totals: TcTotals, worker: TcWorker, entry: TcEntry): TcTotals {
  return {
    regularHours: totals.regularHours + entry.regularHours,
    overtimeHours: totals.overtimeHours + entry.overtimeHours,
    totalHours: totals.totalHours + entryHours(entry),
    baseCost: totals.baseCost + entryCost(worker, entry),
    burdenedCost: totals.burdenedCost + entryBurdenedCost(worker, entry)
  };
}

export function totalsFor(entries: TcEntry[], workerById: Map<string, TcWorker>): TcTotals {
  return entries.reduce((totals, entry) => {
    const worker = workerById.get(entry.workerId);
    if (!worker) return totals;
    return accumulate(totals, worker, entry);
  }, emptyTotals());
}

export type TcBreakdownRow = {
  key: string;
  label: string;
  sublabel?: string;
  totals: TcTotals;
  budgetHours?: number;
};

export function breakdownByProject(entries: TcEntry[], workerById: Map<string, TcWorker>): TcBreakdownRow[] {
  return tcProjects
    .map((project) => {
      const rows = entries.filter((entry) => entry.projectId === project.id);
      // Budget shown as a weekly slice of the project's total budgeted hours.
      const weeklyBudget = Math.round(project.budgetHours / 26);
      return {
        key: project.id,
        label: project.name,
        sublabel: `${project.code} · ${project.location}`,
        totals: totalsFor(rows, workerById),
        budgetHours: weeklyBudget
      };
    })
    .filter((row) => row.totals.totalHours > 0)
    .sort((a, b) => b.totals.burdenedCost - a.totals.burdenedCost);
}

export function breakdownByCrew(
  entries: TcEntry[],
  crews: TcCrew[],
  workerById: Map<string, TcWorker>
): TcBreakdownRow[] {
  return crews
    .map((crew) => {
      const rows = entries.filter((entry) => entry.crewId === crew.id);
      const project = tcProjects.find((item) => item.id === crew.projectId);
      return {
        key: crew.id,
        label: crew.name,
        sublabel: `${crew.trade} · ${project?.name ?? ""}`,
        totals: totalsFor(rows, workerById)
      };
    })
    .filter((row) => row.totals.totalHours > 0)
    .sort((a, b) => b.totals.burdenedCost - a.totals.burdenedCost);
}

export function breakdownByPhase(entries: TcEntry[], workerById: Map<string, TcWorker>): TcBreakdownRow[] {
  const map = new Map<string, TcEntry[]>();
  entries.forEach((entry) => {
    const list = map.get(entry.phase) ?? [];
    list.push(entry);
    map.set(entry.phase, list);
  });
  return Array.from(map.entries())
    .map(([phase, rows]) => ({ key: phase, label: phase, totals: totalsFor(rows, workerById) }))
    .sort((a, b) => b.totals.totalHours - a.totals.totalHours);
}

export function breakdownByWorker(
  entries: TcEntry[],
  workers: TcWorker[],
  workerById: Map<string, TcWorker>
): TcBreakdownRow[] {
  return workers
    .map((worker) => {
      const rows = entries.filter((entry) => entry.workerId === worker.id);
      return {
        key: worker.id,
        label: worker.name,
        sublabel: `${worker.role} · ${crewMeta(worker.crewId)?.name ?? ""}`,
        totals: totalsFor(rows, workerById)
      };
    })
    .filter((row) => row.totals.totalHours > 0)
    .sort((a, b) => b.totals.totalHours - a.totals.totalHours);
}

// ---------------------------------------------------------------------------
// Approvals, audit, compliance
// ---------------------------------------------------------------------------

const approverNames: Record<TcApprovalLevel, string> = {
  "Crew Lead": "Crew lead",
  Superintendent: "M. Alvarez",
  "Project Manager": "liam santos",
  Accounting: "Payroll"
};

export function buildTimecards(workers: TcWorker[], entries: TcEntry[], workerById: Map<string, TcWorker>): TcTimecard[] {
  return workers
    .filter((worker) => entries.some((entry) => entry.workerId === worker.id))
    .map((worker) => {
      const rows = entries.filter((entry) => entry.workerId === worker.id);
      const totals = totalsFor(rows, workerById);
      const seed = hashString(worker.id);
      const stage = seededInt(seed, 0, 3); // how far the chain has progressed
      const flagged = rows.some((entry) => entry.status === "Flagged");
      const overtimePending = totals.overtimeHours > 6 && stage < 3;

      const levels: TcApprovalLevel[] = ["Crew Lead", "Superintendent", "Project Manager", "Accounting"];
      const chain: TcApprovalStep[] = levels.map((level, index) => {
        let state: TcApprovalState;
        if (index < stage && !(flagged && index >= 1)) state = "Approved";
        else if (index === stage || (flagged && index === 1)) state = flagged && index === 1 ? "Rejected" : "Pending";
        else state = "Awaiting";
        return {
          level,
          state,
          by: state === "Approved" || state === "Rejected" ? approverNames[level] : undefined,
          at: state === "Approved" ? `${weekDays[Math.min(index + 1, 5)].label}, 4:32 PM` : undefined
        };
      });

      const card: TcTimecard = {
        id: `tc-${worker.id}`,
        workerId: worker.id,
        crewId: worker.crewId,
        projectId: crewMeta(worker.crewId)?.projectId ?? "",
        weekLabel: tcWeekLabel,
        regularHours: totals.regularHours,
        overtimeHours: totals.overtimeHours,
        chain,
        flagged,
        flagReason: flagged ? "Actual hours exceed scheduled crew window by 2.5 hrs" : undefined,
        overtimePending
      };
      return card;
    });
}

export function buildAuditTrail(): TcAuditEvent[] {
  return [
    { id: "a1", at: "Jun 19 · 5:04 PM", actor: "liam santos", action: "Approved timecard", detail: "Framing Crew 2 · week of Jun 15", tone: "green" },
    { id: "a2", at: "Jun 19 · 4:41 PM", actor: "M. Alvarez", action: "Requested correction", detail: "Concrete Crew 1 · T. Grant OT mismatch", tone: "amber" },
    { id: "a3", at: "Jun 19 · 2:18 PM", actor: "S. Whitfield", action: "Submitted timecards", detail: "Utility Crew 3 · 5 workers", tone: "blue" },
    { id: "a4", at: "Jun 18 · 6:02 PM", actor: "System", action: "Flagged discrepancy", detail: "Paving Crew 4 · actual vs scheduled +2.5 hrs", tone: "red" },
    { id: "a5", at: "Jun 18 · 5:36 PM", actor: "A. Coleman", action: "Logged replacement", detail: "R. Vance in for J. Diaz (called out)", tone: "violet" },
    { id: "a6", at: "Jun 18 · 7:12 AM", actor: "Field Sync", action: "Imported hours", detail: "Daily progress report → 3 entries", tone: "blue" }
  ];
}

export function buildLienRecords(): TcLienRecord[] {
  return [
    { id: "l1", projectId: "rmc", subcontractor: "Lone Star Rebar LLC", status: "Verified", throughDate: "Jun 14, 2026", amount: 48250 },
    { id: "l2", projectId: "hvt", subcontractor: "Coastal Steel Erectors", status: "Pending", throughDate: "Jun 07, 2026", amount: 61900 },
    { id: "l3", projectId: "trl", subcontractor: "Apex Traffic Control", status: "Conditional", throughDate: "Jun 14, 2026", amount: 12400 }
  ];
}

// Productivity: hours worked vs a seeded production output per crew.
export type TcProductivity = {
  crewId: string;
  crewName: string;
  hours: number;
  output: number;
  unit: string;
  perHour: number;
  target: number;
};

const crewOutputs: Record<string, { output: number; unit: string; target: number }> = {
  cc1: { output: 214, unit: "CY placed", target: 4.4 },
  fc2: { output: 38, unit: "tons set", target: 0.9 },
  uc3: { output: 640, unit: "LF pipe", target: 14 },
  pc4: { output: 1180, unit: "SY paved", target: 26 },
  ec5: { output: 92, unit: "devices", target: 2.6 }
};

export function buildProductivity(entries: TcEntry[], crews: TcCrew[], workerById: Map<string, TcWorker>): TcProductivity[] {
  return crews.map((crew) => {
    const hours = totalsFor(
      entries.filter((entry) => entry.crewId === crew.id),
      workerById
    ).totalHours;
    const out = crewOutputs[crew.id] ?? { output: 0, unit: "units", target: 1 };
    const perHour = hours > 0 ? out.output / hours : 0;
    return {
      crewId: crew.id,
      crewName: crew.name,
      hours,
      output: out.output,
      unit: out.unit,
      perHour,
      target: out.target
    };
  });
}

// Attendance: scheduled vs actual headcount per crew for the tracked week.
export type TcAttendance = {
  crewId: string;
  crewName: string;
  scheduled: number;
  actual: number;
  replacements: number;
  note?: string;
};

export function buildAttendance(crews: TcCrew[], entries: TcEntry[]): TcAttendance[] {
  return crews.map((crew) => {
    const workerIds = new Set(entries.filter((entry) => entry.crewId === crew.id).map((entry) => entry.workerId));
    const seed = hashString(crew.id);
    const replacements = seededInt(seed, 0, 2);
    const actual = Math.max(1, workerIds.size - seededInt(seed + 2, 0, 1));
    return {
      crewId: crew.id,
      crewName: crew.name,
      scheduled: crew.scheduledHeadcount,
      actual,
      replacements,
      note: replacements > 0 ? "Substitute logged" : undefined
    };
  });
}

// Weekly labor-cost trend (illustrative, consistent with Reports styling).
export const laborCostTrend = [
  { week: "May 18", planned: 118, actual: 112 },
  { week: "May 25", planned: 124, actual: 121 },
  { week: "Jun 1", planned: 129, actual: 134 },
  { week: "Jun 8", planned: 133, actual: 138 },
  { week: "Jun 15", planned: 141, actual: 149 }
];

// ForecastIQ of labor hours based on burn rate.
export const laborForecastIQ = [
  { week: "Jun 15", actual: 1490, forecastIQ: 1490 },
  { week: "Jun 22", actual: null as number | null, forecastIQ: 1560 },
  { week: "Jun 29", actual: null as number | null, forecastIQ: 1610 },
  { week: "Jul 6", actual: null as number | null, forecastIQ: 1520 },
  { week: "Jul 13", actual: null as number | null, forecastIQ: 1440 }
];

// Productivity trend (output per labor hour) over recent weeks.
export const productivityTrend = [
  { week: "May 18", value: 0.82 },
  { week: "May 25", value: 0.85 },
  { week: "Jun 1", value: 0.84 },
  { week: "Jun 8", value: 0.89 },
  { week: "Jun 15", value: 0.93 }
];

// ---------------------------------------------------------------------------
// Assembled model
// ---------------------------------------------------------------------------

export type TimecardModel = {
  projects: TcProject[];
  crews: TcCrew[];
  workers: TcWorker[];
  workerById: Map<string, TcWorker>;
  entries: TcEntry[];
  timecards: TcTimecard[];
  audit: TcAuditEvent[];
  liens: TcLienRecord[];
  productivity: TcProductivity[];
  attendance: TcAttendance[];
  weekLabel: string;
};

export function buildTimecardModel(_data?: BootstrapPayload): TimecardModel {
  const workers = buildWorkers();
  const crews = buildCrews(workers);
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const entries = buildEntries(workers);
  const timecards = buildTimecards(workers, entries, workerById);
  return {
    projects: tcProjects,
    crews,
    workers,
    workerById,
    entries,
    timecards,
    audit: buildAuditTrail(),
    liens: buildLienRecords(),
    productivity: buildProductivity(entries, crews, workerById),
    attendance: buildAttendance(crews, entries),
    weekLabel: tcWeekLabel
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatHours(value: number) {
  return `${Math.round(value * 10) / 10} hrs`;
}

export function formatCurrency(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0
  }).format(value);
}

export function formatRate(value: number) {
  return `$${value.toFixed(2)}/hr`;
}
