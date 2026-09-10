/* =========================================================================
   Schedule import — map a ParsedSchedule onto BuildFlow's model.

   The two models do not line up 1:1, and the honest handling of each gap is
   the whole job here:

     P6 / MSP                     BuildFlow
     ─────────────────────────    ────────────────────────────────────────
     PROJECT / <Project>       →  Project
     top-level WBS band        →  Phase        (BuildFlow phases are flat, so a
       / summary task               deep WBS collapses to its outermost band)
     activity / leaf task      →  Job
     summary + LOE rows        →  dropped      (roll-ups, not work)
     relationships (FS/SS/..)  →  Job.notes    (no dependency field on Job — see
                                                 RELATIONSHIP NOTE below)
     resources                 →  Job.requiredEquipment
     calendars, codes, costs   →  dropped

   RELATIONSHIP NOTE: Job has no predecessor field, and adding a real dependency
   model would mean a schema migration plus a scheduling engine that consumes it
   — far past an import. Rather than silently drop the logic, each job's ties are
   written into its notes in the scheduler's own vocabulary ("A1020 FS+8h"), so
   the information survives the import and the preview says exactly that.
   ========================================================================= */

import type { CreateJobInput, CreateProjectInput, Status } from "@buildflow/shared";
import type { ImportedActivity, ParsedSchedule, ScheduleFormat } from "./types.js";

/** Jobs can't carry a projectId until their project row exists. */
export type PlannedJob = Omit<CreateJobInput, "projectId">;

export type PlannedPhase = {
  name: string;
  status: "On Track" | "At Risk" | "DelayIQed" | "Not Started";
  percentComplete: number;
  startDate: string;
  endDate: string;
  color: string;
  sequence: number;
};

export type PlannedProject = {
  externalId: string;
  input: CreateProjectInput;
  phases: PlannedPhase[];
  jobs: PlannedJob[];
};

export type ImportPlan = {
  format: ScheduleFormat;
  source: string;
  projects: PlannedProject[];
  stats: {
    activitiesRead: number;
    jobs: number;
    phases: number;
    milestones: number;
    summariesSkipped: number;
    undatedSkipped: number;
    relationships: number;
  };
  warnings: string[];
};

export type ImportPlanOptions = {
  /** Owner for every created project — must be a PM/superintendent. */
  managerId: string;
  defaultLocation?: string;
};

const PHASE_COLORS = ["#2f6bff", "#0f766e", "#6d28d9", "#c2410c", "#188038", "#b91c1c", "#0369a1", "#7c2d12"];

/** P6/MSP carry no materials concept; Job requires one. */
const DEFAULT_MATERIALS_STATUS = "Ordered" as const;
const DEFAULT_START_TIME = "07:00";
const DEFAULT_END_TIME = "15:30";

function jobStatus(percentComplete: number | undefined): Status {
  if (percentComplete !== undefined && percentComplete >= 100) return "Complete";
  if (percentComplete !== undefined && percentComplete > 0) return "In Progress";
  return "Planned";
}

function phaseStatus(percentComplete: number): PlannedPhase["status"] {
  if (percentComplete >= 100) return "On Track";
  if (percentComplete > 0) return "On Track";
  return "Not Started";
}

function slugName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
}

/** Render an activity's ties the way a scheduler reads them: "A1020 FS+8h". */
function describeRelations(activity: ImportedActivity, codeById: Map<string, string>): string {
  if (activity.predecessors.length === 0) return "";
  const parts = activity.predecessors.map((relation) => {
    const code = codeById.get(relation.predecessorId) ?? relation.predecessorId;
    if (!relation.lagHours) return `${code} ${relation.type}`;
    const sign = relation.lagHours > 0 ? "+" : "−";
    return `${code} ${relation.type}${sign}${Math.abs(relation.lagHours)}h`;
  });
  return `Predecessors: ${parts.join(", ")}`;
}

export function buildImportPlan(schedule: ParsedSchedule, options: ImportPlanOptions): ImportPlan {
  const warnings = [...schedule.warnings];
  const codeById = new Map(schedule.activities.map((activity) => [activity.externalId, activity.code]));
  const wbsById = new Map(schedule.wbs.map((node) => [node.externalId, node]));

  /** Walk up to the outermost WBS band — that is what becomes the phase. */
  const topBandName = (wbsId: string | undefined): string | undefined => {
    let node = wbsId ? wbsById.get(wbsId) : undefined;
    if (!node) return undefined;
    const seen = new Set<string>();
    while (node.parentId && !seen.has(node.externalId)) {
      seen.add(node.externalId); // cyclic parents would otherwise hang the import
      const parent = wbsById.get(node.parentId);
      if (!parent) break;
      node = parent;
    }
    return node.name;
  };

  // A single XER can hold several projects; MSPDI always holds one. Activities
  // carry their own projectId in XER, so group by it and fall back to the only
  // project when the file doesn't say.
  const soleProjectId = schedule.projects.length === 1 ? schedule.projects[0].externalId : undefined;
  const byProject = new Map<string, ImportedActivity[]>();
  for (const activity of schedule.activities) {
    const key = activity.projectId ?? soleProjectId ?? "unassigned";
    const list = byProject.get(key) ?? [];
    list.push(activity);
    byProject.set(key, list);
  }

  const stats: ImportPlan["stats"] = {
    activitiesRead: schedule.activities.length,
    jobs: 0,
    phases: 0,
    milestones: 0,
    summariesSkipped: 0,
    undatedSkipped: 0,
    relationships: schedule.activities.reduce((total, activity) => total + activity.predecessors.length, 0)
  };

  const projects: PlannedProject[] = [];

  for (const project of schedule.projects) {
    const activities = byProject.get(project.externalId) ?? (schedule.projects.length === 1 ? schedule.activities : []);
    const jobs: PlannedJob[] = [];
    const phaseOrder: string[] = [];
    const phaseDates = new Map<string, { start: string; end: string; pct: number[] }>();

    for (const activity of activities) {
      if (activity.isSummary) {
        stats.summariesSkipped += 1;
        continue;
      }
      // Job requires both dates and BuildFlow schedules on them; an undated
      // activity would land on the board as garbage, so skip and report.
      if (!activity.start || !activity.finish) {
        stats.undatedSkipped += 1;
        continue;
      }
      if (activity.isMilestone) stats.milestones += 1;

      const phase = topBandName(activity.wbsId) ?? "Imported";
      if (!phaseOrder.includes(phase)) phaseOrder.push(phase);

      const bounds = phaseDates.get(phase);
      if (!bounds) {
        phaseDates.set(phase, { start: activity.start, end: activity.finish, pct: [activity.percentComplete ?? 0] });
      } else {
        if (activity.start < bounds.start) bounds.start = activity.start;
        if (activity.finish > bounds.end) bounds.end = activity.finish;
        bounds.pct.push(activity.percentComplete ?? 0);
      }

      const relations = describeRelations(activity, codeById);
      const noteParts = [`Imported from ${schedule.source}`, `Activity ${activity.code}`];
      if (activity.isMilestone) noteParts.push("Milestone");
      if (relations) noteParts.push(relations);

      jobs.push({
        name: slugName(activity.name),
        phase,
        location: options.defaultLocation ?? "",
        startDate: activity.start,
        endDate: activity.finish,
        startTime: DEFAULT_START_TIME,
        endTime: DEFAULT_END_TIME,
        requiredLabor: 0,
        requiredEquipment: activity.resourceNames.join(", "),
        materialsStatus: DEFAULT_MATERIALS_STATUS,
        status: jobStatus(activity.percentComplete),
        priority: "Normal",
        notes: noteParts.join(" · ")
      });
    }

    if (jobs.length === 0) continue;

    const phases: PlannedPhase[] = phaseOrder.map((name, index) => {
      const bounds = phaseDates.get(name)!;
      const percentComplete = Math.round(bounds.pct.reduce((sum, value) => sum + value, 0) / bounds.pct.length);
      return {
        name,
        status: phaseStatus(percentComplete),
        percentComplete,
        startDate: bounds.start,
        endDate: bounds.end,
        color: PHASE_COLORS[index % PHASE_COLORS.length],
        sequence: index + 1
      };
    });

    const finishes = jobs.map((job) => job.endDate).sort();
    const overallPercent = Math.round(phases.reduce((sum, phase) => sum + phase.percentComplete, 0) / Math.max(1, phases.length));

    projects.push({
      externalId: project.externalId,
      input: {
        name: slugName(project.name),
        location: options.defaultLocation ?? "",
        address: "",
        type: "Imported",
        contractType: "",
        managerId: options.managerId,
        targetCompletion: project.finish ?? finishes[finishes.length - 1] ?? "",
        percentComplete: overallPercent,
        status: overallPercent >= 100 ? "Complete" : overallPercent > 0 ? "In Progress" : "Planned",
        scheduleHealth: "On Track"
      },
      phases,
      jobs
    });

    stats.jobs += jobs.length;
    stats.phases += phases.length;
  }

  if (projects.length === 0) {
    warnings.push("No importable activities were found — every row was a summary/roll-up or had no dates.");
  }
  if (stats.summariesSkipped > 0) {
    warnings.push(
      `${stats.summariesSkipped} summary/level-of-effort row(s) were skipped — they roll up other activities rather than being work themselves.`
    );
  }
  if (stats.undatedSkipped > 0) {
    warnings.push(`${stats.undatedSkipped} activity(ies) had no start/finish dates and were skipped.`);
  }
  if (stats.relationships > 0) {
    warnings.push(
      `${stats.relationships} relationship(s) were read. BuildFlow doesn't model activity logic yet, so each job records its predecessors in its notes rather than as links — dates come across exactly as scheduled.`
    );
  }
  warnings.push(
    "Crew assignments, materials status, and work hours aren't part of a P6/Project export — jobs land unassigned with default 07:00–15:30 hours and 'Ordered' materials."
  );

  return { format: schedule.format, source: schedule.source, projects, stats, warnings };
}
