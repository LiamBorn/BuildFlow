/* =========================================================================
   DelayIQ — proactive delay early-warning + downstream impact chain.

   The field-progress loop (variance.ts) is *reactive*: a crew reports, and if
   the report disagrees with the plan a PM gets a priced accept/reject proposal.
   This is the *proactive* half — nobody has to report anything. It scans the
   whole live schedule against today and answers the question a good super asks
   every morning: "what's trending behind, and what does it push?"

   "Drywall trending 3 days behind — here's what it pushes": for every job whose
   own pace (or a missed start) forecasts it finishing late, run the CPM ripple
   and list the downstream trades it drags with it. Read-only — it never touches
   the plan. Accepting a slip is still the PM's call through the variance drawer.

   Reuses variance.ts wholesale (forecast, CPM ripple, severity) so a warning
   here and a variance there can never disagree about the maths.
   ========================================================================= */

import type { Job, JobDependency, WorkCalendarSetting } from "@buildflow/shared";
import {
  buildProposal,
  forecastIQFinish,
  plannedPercentAt,
  scheduleCalendar,
  scheduleCalendarFor,
  VARIANCE_DAY_THRESHOLD
} from "./variance.js";

/**
 * Severity by *consequence*, matching the variance drawer's philosophy but keyed
 * on the one signal that matters for an early warning: does the slip reach the
 * finish date? If the ripple moves the project finish, the handover is at risk —
 * High, full stop. A slip a downstream buffer still absorbs is a Medium (a buffer
 * being spent, not an excuse); anything under the drift threshold with float to
 * spare is Low. (We grade on projectSlip rather than the reporting job's own
 * critical flag, because the SNET pins in the CPM network give past-dated jobs a
 * float artifact that would mis-grade a real finish-moving slip.)
 */
function delaySeverity(varianceDays: number, projectSlipDays: number): "High" | "Medium" | "Low" {
  if (projectSlipDays > 0) return "High";
  if (varianceDays >= 3) return "Medium";
  return "Low";
}

export type DelayRiskKind = "behind_pace" | "overdue_start";

export type DownstreamPush = {
  jobId: string;
  jobName: string;
  /** The trade/phase this pushed job belongs to. */
  trade: string;
  currentEnd: string;
  pushedEnd: string;
  shiftDays: number;
  critical: boolean;
};

export type DelayRisk = {
  jobId: string;
  jobName: string;
  trade: string;
  projectId: string;
  kind: DelayRiskKind;
  /** The job's own planned finish vs where its pace now points. */
  currentEnd: string;
  forecastEnd: string;
  /** Working days the job's own finish is trending late. */
  varianceDays: number;
  percentComplete: number;
  plannedPercent: number;
  severity: "High" | "Medium" | "Low";
  onCriticalPath: boolean;
  /** Working days the project finish moves if this plays out unchecked. */
  projectSlipDays: number;
  /** The chain of downstream jobs this pushes, worst first. */
  downstream: DownstreamPush[];
  /** Distinct downstream trades affected — "what it pushes", named. */
  affectedTrades: string[];
};

/**
 * Scan the live schedule for jobs trending late and price each one's downstream
 * ripple. Two honest triggers, both the job's *own* delay (inherited delays show
 * up in the chain of whatever caused them, never double-counted):
 *   1. behind_pace   — in progress, and its reported rate forecasts a late finish
 *   2. overdue_start — 0% with its planned start already past AND every
 *                      predecessor complete, so nothing upstream is the excuse
 */
export function detectDelayRisks(
  jobs: Job[],
  dependencies: JobDependency[],
  asOf: string,
  /** The workspace's working days and holidays; without them, the default six-day week. */
  workCalendar?: WorkCalendarSetting
): DelayRisk[] {
  if (jobs.length === 0) return [];

  const asOfDate = asOf.slice(0, 10);
  const epoch = jobs.reduce((min, job) => (job.startDate < min ? job.startDate : min), jobs[0].startDate);
  const calendar = workCalendar ? scheduleCalendarFor(epoch, workCalendar) : scheduleCalendar(epoch);
  const nowIndex = calendar.toIndex(asOfDate);

  const tradeByJob = new Map(jobs.map((job) => [job.id, job.phase]));
  const completeIds = new Set(jobs.filter((job) => job.percentComplete >= 100).map((job) => job.id));
  // A successor with any not-yet-complete predecessor is (at least partly)
  // waiting on someone else — its late start isn't its own story to tell.
  const hasIncompletePredecessor = new Set<string>();
  for (const dep of dependencies) {
    if (!completeIds.has(dep.predecessorId)) hasIncompletePredecessor.add(dep.successorId);
  }

  const risks: DelayRisk[] = [];

  for (const job of jobs) {
    if (job.percentComplete >= 100) continue;

    const startIndex = calendar.toIndex(job.startDate);
    const endIndex = calendar.toIndex(job.endDate);

    let kind: DelayRiskKind | null = null;
    let forecastEnd: string | null = null;

    if (job.percentComplete > 0) {
      // In progress: does the reported rate land it late?
      const projected = forecastIQFinish(job, job.percentComplete, asOfDate, calendar);
      if (calendar.toIndex(projected) - endIndex >= VARIANCE_DAY_THRESHOLD) {
        kind = "behind_pace";
        forecastEnd = projected;
      }
    } else if (nowIndex > startIndex && !hasIncompletePredecessor.has(job.id)) {
      // Should have started, hasn't, and nothing upstream is blocking it.
      const overdue = nowIndex - startIndex;
      if (overdue >= VARIANCE_DAY_THRESHOLD) {
        kind = "overdue_start";
        forecastEnd = calendar.fromIndex(endIndex + overdue);
      }
    }

    if (!kind || !forecastEnd) continue;

    const proposal = buildProposal(jobs, dependencies, job.id, forecastEnd, calendar);
    if (!proposal) continue; // broken network — don't guess

    const downstream: DownstreamPush[] = proposal.ripple
      .filter((item) => item.shiftDays > 0)
      .map((item) => ({
        jobId: item.jobId,
        jobName: item.jobName,
        trade: tradeByJob.get(item.jobId) ?? "",
        currentEnd: item.currentEnd,
        pushedEnd: item.proposedEnd,
        shiftDays: item.shiftDays,
        critical: item.critical
      }));

    // "What it pushes" in trade terms — the affected downstream trades, in first-
    // impacted order, excluding this job's own trade.
    const affectedTrades: string[] = [];
    for (const push of downstream) {
      if (push.trade && push.trade !== job.phase && !affectedTrades.includes(push.trade)) {
        affectedTrades.push(push.trade);
      }
    }

    risks.push({
      jobId: job.id,
      jobName: job.name,
      trade: job.phase,
      projectId: job.projectId,
      kind,
      currentEnd: job.endDate,
      forecastEnd,
      varianceDays: calendar.toIndex(forecastEnd) - endIndex,
      percentComplete: job.percentComplete,
      plannedPercent: plannedPercentAt(job, asOfDate, calendar),
      severity: delaySeverity(calendar.toIndex(forecastEnd) - endIndex, proposal.projectSlipDays),
      // A slip that moves the project finish is, by definition, on the driving
      // (critical) path — trust that over the before-network's `critical` flag,
      // which the SNET pins can mis-report for past-dated jobs.
      onCriticalPath: proposal.projectSlipDays > 0 || proposal.criticalPath,
      projectSlipDays: proposal.projectSlipDays,
      downstream,
      affectedTrades
    });
  }

  const rank = { High: 3, Medium: 2, Low: 1 };
  risks.sort(
    (a, b) =>
      rank[b.severity] - rank[a.severity] ||
      b.projectSlipDays - a.projectSlipDays ||
      b.varianceDays - a.varianceDays ||
      a.jobName.localeCompare(b.jobName)
  );
  return risks;
}
