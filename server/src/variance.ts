/* ============================================================================
   variance.ts — field progress → master schedule variance engine
   ----------------------------------------------------------------------------
   The half of the loop that decides whether a field report disagrees with the
   plan, and what it would cost to believe it.

   The rule this file exists to enforce: a field report is *evidence*, not an
   edit. Reported percent is a fact the crew owns and writes through. Dates are
   the plan and belong to the PM. So when progress implies the dates are wrong,
   nothing is overwritten — we compute the change, price its downstream ripple
   through CPM, and hand the PM a proposal to accept or reject.

   Three steps, in order:
     1. plannedPercentAt  — where the plan says the job should be today
     2. forecastIQFinish    — where the reported rate says it will actually land
     3. buildProposal     — what moves downstream if we believe the field

   Everything runs on the working-day axis from the CPM calendar, so "2 days
   behind" means two days a crew could actually have worked, not two days that
   happened to include a Sunday.
   ========================================================================== */

import {
  calculateCpm,
  forecastIQFinish,
  plannedPercentAt,
  scheduleCalendar,
  scheduleCalendarFor,
  type CpmLink,
  type CpmTask,
  type Job,
  type WorkCalendarSetting,
  type JobDependency,
  type ScheduleVariance,
  type Status,
  type VarianceKind,
  type VarianceProposal,
  type VarianceRippleItem,
  type WorkCalendar
} from "@buildflow/shared";

// Re-exported so the engine stays the one import a caller needs, and so the
// tests exercise the same functions the client renders from.
export { forecastIQFinish, plannedPercentAt, scheduleCalendar, scheduleCalendarFor };

/**
 * Drift below this many working days is noise, not a variance — a crew
 * eyeballing "about 60%" should not spawn a review item. Only drift that would
 * actually move a date gets flagged.
 */
export const VARIANCE_DAY_THRESHOLD = 1;

/** Statuses the field can report that mean "stopped", not merely "behind". */
const BLOCKED_STATUSES: Status[] = ["DelayIQed", "At Risk"];

/** How the disagreement reads, given the numbers and what the field said. */
function classify(reportedPercent: number, varianceDays: number, status: Status): VarianceKind {
  if (BLOCKED_STATUSES.includes(status)) return "blocked";
  if (reportedPercent >= 100) return "complete";
  return varianceDays > 0 ? "slip" : "ahead";
}

/**
 * Severity is about *consequence*, not size. Two days lost on a job with two
 * weeks of float is a Low; one day lost on the critical path moves the
 * handover date and is a High. This is the judgement a PM would otherwise make
 * by hand for every report, and it is the reason the drawer can be triaged
 * top-down.
 */
export function gradeSeverity(varianceDays: number, projectSlipDays: number, criticalPath: boolean): ScheduleVariance["severity"] {
  if (projectSlipDays > 0 && criticalPath) return "High";
  if (projectSlipDays > 0 || varianceDays >= 3) return "Medium";
  return "Low";
}

/** Map the domain onto the CPM engine's task/link shape, on a working-day axis. */
function toNetwork(
  jobs: Job[],
  dependencies: JobDependency[],
  calendar: WorkCalendar,
  overrides: Map<string, { start: number; end: number }> = new Map()
): { tasks: CpmTask[]; links: CpmLink[] } {
  const tasks: CpmTask[] = jobs.map((job) => {
    const override = overrides.get(job.id);
    const start = override ? override.start : calendar.toIndex(job.startDate);
    const end = override ? override.end : calendar.toIndex(job.endDate);
    return {
      id: job.id,
      duration: Math.max(1, end - start + 1),
      // Pin every job to where it actually sits today. Without this the CPM
      // pass would slide the whole network left to its earliest possible dates
      // and report that as the "current" plan, so every job would look like it
      // had moved and the ripple diff would be meaningless.
      constraintType: "SNET",
      constraintDate: start
    };
  });
  const links: CpmLink[] = dependencies.map((dep) => ({
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    type: dep.type,
    lag: dep.lagDays
  }));
  return { tasks, links };
}

/**
 * Price a proposed change: run the network as it stands, run it again with the
 * reporting job's forecastIQ dates, and diff.
 *
 * The diff is what makes the drawer worth reading — not "this job is late" but
 * "this job is late, it pushes these four crews, and the project finish moves
 * three days".
 */
export function buildProposal(
  jobs: Job[],
  dependencies: JobDependency[],
  jobId: string,
  forecastIQEnd: string,
  calendar: WorkCalendar
): VarianceProposal | null {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return null;
  // a field report never moves the start: the job began where it began, and only its finish is in question
  const startIndex = calendar.toIndex(job.startDate);
  const proposedEnd = calendar.fromIndex(Math.max(startIndex, calendar.toIndex(forecastIQEnd)));
  return buildMoveProposal(jobs, dependencies, jobId, job.startDate, proposedEnd, calendar);
}

/**
 * The same diff for a job that MOVES — its start as well as its finish. WeatherIQ's reschedule
 * (2026-09-23) needs it: a job whose first day is called off for weather starts later, not just
 * finishes later. `buildProposal` is this with the start held where it is.
 */
export function buildMoveProposal(
  jobs: Job[],
  dependencies: JobDependency[],
  jobId: string,
  proposedStart: string,
  proposedEnd: string,
  calendar: WorkCalendar
): VarianceProposal | null {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return null;

  const beforeNetwork = toNetwork(jobs, dependencies, calendar);
  const before = calculateCpm(beforeNetwork.tasks, beforeNetwork.links);
  if (before.cycle) return null; // a broken network can't be priced; don't guess

  const startIndex = calendar.toIndex(proposedStart);
  const proposedEndIndex = Math.max(startIndex, calendar.toIndex(proposedEnd));

  const overrides = new Map([[jobId, { start: startIndex, end: proposedEndIndex }]]);
  const afterNetwork = toNetwork(jobs, dependencies, calendar, overrides);
  const after = calculateCpm(afterNetwork.tasks, afterNetwork.links);
  if (after.cycle) return null;

  // Successors only move if the network says so. A job with slack absorbs the
  // hit and nothing downstream changes — which is exactly the case a PM wants
  // to accept without thinking, and the reason we don't just push every
  // successor by the variance.
  const ripple: VarianceRippleItem[] = [];
  for (const candidate of jobs) {
    if (candidate.id === jobId) continue;
    const wasResult = before.tasks[candidate.id];
    const nowResult = after.tasks[candidate.id];
    if (!wasResult || !nowResult) continue;
    const shiftDays = nowResult.earlyStart - wasResult.earlyStart;
    if (shiftDays === 0) continue;
    ripple.push({
      jobId: candidate.id,
      jobName: candidate.name,
      currentStart: calendar.fromIndex(wasResult.earlyStart),
      currentEnd: calendar.fromIndex(Math.max(wasResult.earlyStart, wasResult.earlyFinish - 1)),
      proposedStart: calendar.fromIndex(nowResult.earlyStart),
      proposedEnd: calendar.fromIndex(Math.max(nowResult.earlyStart, nowResult.earlyFinish - 1)),
      shiftDays,
      critical: nowResult.critical
    });
  }
  ripple.sort((left, right) => right.shiftDays - left.shiftDays || left.jobName.localeCompare(right.jobName));

  return {
    currentStart: job.startDate,
    currentEnd: job.endDate,
    proposedStart,
    proposedEnd: calendar.fromIndex(proposedEndIndex),
    ripple,
    projectSlipDays: Math.max(0, after.projectFinish - before.projectFinish),
    criticalPath: before.tasks[jobId]?.critical ?? false,
    totalFloatDays: before.tasks[jobId]?.totalFloat ?? 0
  };
}

export type VarianceDetection = {
  kind: VarianceKind;
  severity: ScheduleVariance["severity"];
  plannedPercent: number;
  varianceDays: number;
  proposal: VarianceProposal;
};

/**
 * Decide whether a field report disagrees with the plan enough to be worth a
 * PM's attention, and if so, what it would take to believe it.
 *
 * Returns null when the report is consistent with the plan — the overwhelming
 * majority of reports. Those still write their percent through to the job;
 * they just don't generate a review item. The drawer only earns its place if
 * everything in it is genuinely a decision.
 */
export function detectVariance(
  jobs: Job[],
  dependencies: JobDependency[],
  jobId: string,
  reportedPercent: number,
  status: Status,
  asOf: string,
  /** The workspace's working days and holidays; without them, the default six-day week. */
  workCalendar?: WorkCalendarSetting
): VarianceDetection | null {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return null;

  // Anchor the axis at the earliest date in play so no index goes negative.
  const epoch = jobs.reduce((min, item) => (item.startDate < min ? item.startDate : min), job.startDate);
  const calendar = workCalendar ? scheduleCalendarFor(epoch, workCalendar) : scheduleCalendar(epoch);
  const asOfDate = asOf.slice(0, 10);

  const plannedPercent = plannedPercentAt(job, asOfDate, calendar);
  const forecastIQEnd = forecastIQFinish(job, reportedPercent, asOfDate, calendar);
  const varianceDays = calendar.toIndex(forecastIQEnd) - calendar.toIndex(job.endDate);

  const blocked = BLOCKED_STATUSES.includes(status);
  // A blocked job is a decision even when the numbers agree with the plan: the
  // field is saying the work has stopped, which the percent alone can't express.
  if (!blocked && Math.abs(varianceDays) < VARIANCE_DAY_THRESHOLD) return null;

  const proposal = buildProposal(jobs, dependencies, jobId, forecastIQEnd, calendar);
  if (!proposal) return null;

  return {
    kind: classify(reportedPercent, varianceDays, status),
    severity: gradeSeverity(varianceDays, proposal.projectSlipDays, proposal.criticalPath),
    plannedPercent,
    varianceDays,
    proposal
  };
}
