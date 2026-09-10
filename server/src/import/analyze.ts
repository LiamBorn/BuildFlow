/* =========================================================================
   Schedule health check + forecastIQ.

   The day-one value moment: the instant an imported P6 / MS Project schedule is
   read, tell the user something true and useful about it — where it's over-
   committed, what's slipping, and when it's really going to finish — without a
   sales call or a services engagement.

   Everything here is computed from the schedule's own data (dates, progress,
   relationships, resource assignments). Nothing is invented. The one projection
   (the forecastIQ finish) uses Earned Schedule's SPI(t) method and is labelled as
   an estimate, because it is one — the rest are counts of real conditions.

   Runs on the rich ParsedSchedule, before mapping flattens away relationships
   and resources, so the checks a scheduler actually cares about are possible.
   ========================================================================= */

import type { ImportedActivity, ParsedSchedule } from "./types.js";
import { simulateFinish, type FinishConfidence } from "./montecarlo.js";

export type Severity = "high" | "medium" | "low";

export type HealthFinding = {
  id: string;
  severity: Severity;
  title: string;
  /** Plain-language: what it is and why it matters to a builder. */
  detail: string;
  count: number;
  /** A few activity codes, so the finding is verifiable, not a black box. */
  sample: string[];
};

export type ScheduleForecastIQ = {
  dataDate: string;
  plannedFinish?: string;
  projectedFinish?: string;
  /** + = later than planned, − = earlier, 0 = on plan. */
  slipDays: number;
  percentComplete: number;
  percentTimeElapsed: number;
  /** Earned Schedule SPI(t): <1 behind, 1 on plan, >1 ahead. */
  scheduleIndex: number;
  status: "not_started" | "on_track" | "slipping" | "at_risk" | "complete";
  /** Honest description of how the projection was derived. */
  method: string;
  /** Probabilistic finish band (P50/P80) from a Monte Carlo run over the
   *  remaining CPM logic. Absent when there's nothing to simulate. */
  confidence?: FinishConfidence;
};

export type ScheduleHealth = {
  score: number; // 0..100
  grade: "Healthy" | "Monitor" | "At Risk" | "Critical";
  headline: string;
  dataDate: string;
  stats: {
    activities: number;
    complete: number;
    inProgress: number;
    notStarted: number;
    milestones: number;
    relationships: number;
  };
  findings: HealthFinding[];
  forecastIQ: ScheduleForecastIQ;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** DCMA's high-duration threshold: 44 working days ≈ 352 working hours. */
const LONG_DURATION_HOURS = 44 * 8;
const LONG_DURATION_DAYS = 60;

function toMs(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Working weight for progress averaging: real hours if known, else the calendar
 *  span, else a floor so every activity still counts. */
function activityWeight(activity: ImportedActivity): number {
  if (activity.durationHours && activity.durationHours > 0) return activity.durationHours;
  const start = toMs(activity.start);
  const finish = toMs(activity.finish);
  if (start !== undefined && finish !== undefined && finish >= start) {
    return Math.max(8, ((finish - start) / DAY_MS) * 8);
  }
  return 8;
}

function spanDays(activity: ImportedActivity): number | undefined {
  const start = toMs(activity.start);
  const finish = toMs(activity.finish);
  if (start === undefined || finish === undefined) return undefined;
  return Math.round((finish - start) / DAY_MS);
}

export function analyzeSchedule(schedule: ParsedSchedule, opts: { now?: number } = {}): ScheduleHealth {
  const now = opts.now ?? Date.now();
  const work = schedule.activities.filter((activity) => !activity.isSummary);
  const dated = work.filter((activity) => activity.start && activity.finish);

  const dataDateIso = schedule.projects.find((project) => project.dataDate)?.dataDate ?? toIso(now);
  const dataDateMs = toMs(dataDateIso) ?? now;

  const pctOf = (activity: ImportedActivity) => clamp(activity.percentComplete ?? 0, 0, 100);

  const complete = work.filter((activity) => pctOf(activity) >= 100).length;
  const inProgress = work.filter((activity) => pctOf(activity) > 0 && pctOf(activity) < 100).length;
  const notStarted = work.length - complete - inProgress;
  const milestones = work.filter((activity) => activity.isMilestone).length;
  const relationships = work.reduce((total, activity) => total + activity.predecessors.length, 0);

  const findings: HealthFinding[] = [];
  const sampleCodes = (activities: ImportedActivity[]) => activities.slice(0, 6).map((a) => a.code);

  // ── Resource over-allocation (double-booking) ──────────────────────────────
  // The signature check: the same crew/resource booked on two activities whose
  // dates overlap. A sweep line per resource keeps it O(n log n).
  const byResource = new Map<string, ImportedActivity[]>();
  for (const activity of dated) {
    for (const resource of activity.resourceNames) {
      const list = byResource.get(resource) ?? [];
      list.push(activity);
      byResource.set(resource, list);
    }
  }
  const conflictedCodes = new Set<string>();
  const conflictResources = new Set<string>();
  let conflictPairs = 0;
  for (const [resource, list] of byResource) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => toMs(a.start)! - toMs(b.start)!);
    for (let i = 0; i < sorted.length; i += 1) {
      const aFinish = toMs(sorted[i].finish)!;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const bStart = toMs(sorted[j].start)!;
        if (bStart > aFinish) break; // sorted by start: nothing later can overlap
        conflictPairs += 1;
        conflictedCodes.add(sorted[i].code);
        conflictedCodes.add(sorted[j].code);
        conflictResources.add(resource);
      }
    }
  }
  if (conflictPairs > 0) {
    const resourceList = [...conflictResources].slice(0, 3).join(", ");
    findings.push({
      id: "resource-conflicts",
      severity: "high",
      title: `${conflictPairs} resource conflict${conflictPairs === 1 ? "" : "s"}`,
      detail: `${conflictedCodes.size} activities double-book the same resource on overlapping dates (${resourceList}${conflictResources.size > 3 ? ", …" : ""}). Double-booked crews are the top cause of avoidable slippage — BuildFlow flags these the moment a schedule loads.`,
      count: conflictPairs,
      sample: [...conflictedCodes].slice(0, 6)
    });
  }

  // ── Behind schedule (missed tasks) ─────────────────────────────────────────
  const behind = dated.filter((activity) => {
    const finish = toMs(activity.finish)!;
    return finish < dataDateMs && pctOf(activity) < 100;
  });
  if (behind.length > 0) {
    findings.push({
      id: "behind-schedule",
      severity: "high",
      title: `${behind.length} activit${behind.length === 1 ? "y" : "ies"} behind schedule`,
      detail: `Planned to finish on or before the data date (${dataDateIso}) but not yet complete. These are already eating float and pushing everything downstream of them.`,
      count: behind.length,
      sample: sampleCodes(behind)
    });
  }

  // ── Not started but overdue to start ───────────────────────────────────────
  const lateStart = dated.filter((activity) => {
    const start = toMs(activity.start)!;
    const finish = toMs(activity.finish)!;
    return start < dataDateMs && finish >= dataDateMs && pctOf(activity) === 0;
  });
  if (lateStart.length > 0) {
    findings.push({
      id: "late-start",
      severity: "medium",
      title: `${lateStart.length} activit${lateStart.length === 1 ? "y" : "ies"} overdue to start`,
      detail: `Should have started by ${dataDateIso} but show no progress. Every day they wait is a day added to the finish.`,
      count: lateStart.length,
      sample: sampleCodes(lateStart)
    });
  }

  // ── Missing logic (open ends / dangling) ───────────────────────────────────
  // DCMA logic check: work with neither predecessor nor successor floats free of
  // the network, so its dates are unreliable. Milestones legitimately bookend, so
  // they're excluded to avoid noise.
  const hasSuccessor = new Set<string>();
  for (const activity of work) {
    for (const relation of activity.predecessors) hasSuccessor.add(relation.predecessorId);
  }
  const dangling = work.filter(
    (activity) => !activity.isMilestone && activity.predecessors.length === 0 && !hasSuccessor.has(activity.externalId)
  );
  // Only worth flagging when the schedule uses logic at all; a bar-chart with no
  // links everywhere isn't "12 dangling activities", it's a different problem.
  if (relationships > 0 && dangling.length > 0) {
    findings.push({
      id: "open-ends",
      severity: "medium",
      title: `${dangling.length} activit${dangling.length === 1 ? "y" : "ies"} with no logic links`,
      detail: `No predecessor and no successor, so they aren't tied into the schedule network. Their dates won't move when the work around them does — a common source of surprise delayIQs.`,
      count: dangling.length,
      sample: sampleCodes(dangling)
    });
  }

  // ── Leads (negative lag) ───────────────────────────────────────────────────
  const leads = work.filter((activity) => activity.predecessors.some((relation) => relation.lagHours < 0));
  if (leads.length > 0) {
    findings.push({
      id: "leads",
      severity: "low",
      title: `${leads.length} lead${leads.length === 1 ? "" : "s"} (negative lag)`,
      detail: `Relationships that let work start before its predecessor finishes. Leads hide risk by compressing the plan on paper — schedule reviewers (and DCMA) flag them.`,
      count: leads.length,
      sample: sampleCodes(leads)
    });
  }

  // ── High-duration activities ───────────────────────────────────────────────
  const long = dated.filter((activity) => {
    if (activity.isMilestone) return false;
    if (activity.durationHours && activity.durationHours > 0) return activity.durationHours > LONG_DURATION_HOURS;
    const days = spanDays(activity);
    return days !== undefined && days > LONG_DURATION_DAYS;
  });
  if (long.length > 0) {
    findings.push({
      id: "long-duration",
      severity: "low",
      title: `${long.length} long-duration activit${long.length === 1 ? "y" : "ies"}`,
      detail: `Longer than ~44 working days. Long bars hide progress and make slippage invisible until it's large — breaking them down makes the schedule trackable.`,
      count: long.length,
      sample: sampleCodes(long)
    });
  }

  // ── ForecastIQ (Earned Schedule SPI(t)) ──────────────────────────────────────
  const forecastIQ = buildForecastIQ(dated, dataDateMs, dataDateIso);

  // ── Score & grade ──────────────────────────────────────────────────────────
  // Start healthy, deduct for real conditions, weight the forecastIQ slip heaviest
  // because a late finish is the thing that actually costs money.
  let score = 100;
  score -= Math.min(28, conflictPairs * 3);
  score -= Math.min(26, behind.length * 2.5);
  score -= Math.min(12, lateStart.length * 1.5);
  score -= Math.min(12, dangling.length * 1);
  score -= Math.min(8, leads.length * 1);
  score -= Math.min(8, long.length * 0.5);
  if (forecastIQ.plannedFinish && forecastIQ.projectedFinish) {
    const totalDays = Math.max(1, (toMs(forecastIQ.plannedFinish)! - dataDateMs) / DAY_MS + 1);
    const slipRatio = clamp(forecastIQ.slipDays / totalDays, 0, 1);
    score -= slipRatio * 34;
  }
  score = Math.round(clamp(score, 0, 100));

  const grade: ScheduleHealth["grade"] = score >= 85 ? "Healthy" : score >= 70 ? "Monitor" : score >= 50 ? "At Risk" : "Critical";

  return {
    score,
    grade,
    headline: buildHeadline(grade, forecastIQ, findings),
    dataDate: dataDateIso,
    stats: { activities: work.length, complete, inProgress, notStarted, milestones, relationships },
    findings: findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    forecastIQ
  };
}

function severityRank(severity: Severity): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function buildForecastIQ(dated: ImportedActivity[], dataDateMs: number, dataDateIso: string): ScheduleForecastIQ {
  const base: ScheduleForecastIQ = {
    dataDate: dataDateIso,
    slipDays: 0,
    percentComplete: 0,
    percentTimeElapsed: 0,
    scheduleIndex: 1,
    status: "not_started",
    method: "No dated activities to forecastIQ from."
  };
  if (dated.length === 0) return base;

  const starts = dated.map((a) => toMs(a.start)!);
  const finishes = dated.map((a) => toMs(a.finish)!);
  const scheduleStart = Math.min(...starts);
  const plannedFinishMs = Math.max(...finishes);
  const plannedFinish = toIso(plannedFinishMs);
  const totalMs = Math.max(DAY_MS, plannedFinishMs - scheduleStart);

  // Duration-weighted physical % complete.
  let weightTotal = 0;
  let earnedTotal = 0;
  for (const activity of dated) {
    const weight = activityWeight(activity);
    weightTotal += weight;
    earnedTotal += weight * (clamp(activity.percentComplete ?? 0, 0, 100) / 100);
  }
  const percentComplete = weightTotal > 0 ? (earnedTotal / weightTotal) * 100 : 0;

  if (percentComplete >= 99.5) {
    return {
      ...base,
      plannedFinish,
      projectedFinish: plannedFinish,
      percentComplete: 100,
      percentTimeElapsed: 100,
      status: "complete",
      method: "All activities are complete."
    };
  }

  const elapsedMs = dataDateMs - scheduleStart;
  const percentTimeElapsedRaw = (elapsedMs / totalMs) * 100;

  // Data date before the schedule even starts: nothing to judge yet on pace, but
  // the plan's own logic still carries variance + merge risk — so a band here
  // answers "even before day one, how likely is this plan?" (pace-neutral).
  if (percentTimeElapsedRaw <= 0) {
    return {
      ...base,
      plannedFinish,
      projectedFinish: plannedFinish,
      percentComplete: Math.round(percentComplete),
      percentTimeElapsed: 0,
      status: "not_started",
      method: "The schedule has not started as of the data date, so it's still on plan.",
      confidence: simulateFinish(dated, { dataDate: dataDateIso, scheduleIndex: 1, lowProgress: true })
    };
  }

  // Barely-started but well into the timeline: SPI(t) projection is unreliable
  // here (dividing by a near-zero progress fraction explodes), and claiming a
  // precise finish date would be false precision. Say it's badly behind, honestly,
  // without inventing a specific date.
  if (percentComplete < 5 && percentTimeElapsedRaw > 20) {
    return {
      ...base,
      plannedFinish,
      projectedFinish: undefined,
      percentComplete: Math.round(percentComplete),
      percentTimeElapsed: Math.round(clamp(percentTimeElapsedRaw, 0, 100)),
      scheduleIndex: Number((percentComplete / percentTimeElapsedRaw).toFixed(2)),
      status: "at_risk",
      slipDays: 0,
      method: `Only ${Math.round(percentComplete)}% complete against ${Math.round(percentTimeElapsedRaw)}% of the timeline — too little progress to project a reliable finish. The schedule is well behind pace.`,
      // Pace can't be read reliably, so the band runs pace-neutral with a wider
      // spread rather than pretending to a precise date.
      confidence: simulateFinish(dated, { dataDate: dataDateIso, scheduleIndex: 1, lowProgress: true })
    };
  }

  // SPI(t): how much of the plan should be done by now vs how much is.
  const scheduleIndex = percentComplete / percentTimeElapsedRaw;
  // Earned Schedule finish estimate: total planned duration stretched by 1/SPI.
  const projectedTotalMs = scheduleIndex > 0 ? totalMs / scheduleIndex : totalMs * 4;
  const projectedFinishMs = scheduleStart + projectedTotalMs;
  const slipDays = Math.round((projectedFinishMs - plannedFinishMs) / DAY_MS);

  const status: ScheduleForecastIQ["status"] = slipDays <= 3 ? "on_track" : slipDays <= 20 ? "slipping" : "at_risk";

  return {
    dataDate: dataDateIso,
    plannedFinish,
    projectedFinish: toIso(projectedFinishMs),
    slipDays,
    percentComplete: Math.round(percentComplete),
    percentTimeElapsed: Math.round(clamp(percentTimeElapsedRaw, 0, 100)),
    scheduleIndex: Number(scheduleIndex.toFixed(2)),
    status,
    method: "Projected from progress to the data date using the Earned Schedule method (SPI-t). An estimate, not a re-run of your logic.",
    confidence: simulateFinish(dated, { dataDate: dataDateIso, scheduleIndex, lowProgress: false })
  };
}

function buildHeadline(grade: ScheduleHealth["grade"], forecastIQ: ScheduleForecastIQ, findings: HealthFinding[]): string {
  if (forecastIQ.status === "complete") return "This schedule is complete — every activity reads 100%.";
  if (forecastIQ.slipDays > 3 && forecastIQ.projectedFinish) {
    const topIssue = findings[0];
    const tail = topIssue ? ` The biggest driver: ${topIssue.title.toLowerCase()}.` : "";
    return `Trending ${forecastIQ.slipDays} days late — projected to finish ${forecastIQ.projectedFinish} against a ${forecastIQ.plannedFinish} plan.${tail}`;
  }
  if (grade === "Healthy") return "This schedule is in good shape — on plan with few structural issues.";
  if (findings.length > 0) {
    return `On plan for now, but ${findings.length} thing${findings.length === 1 ? "" : "s"} worth a look before it bites.`;
  }
  return "On plan with a clean structure.";
}
