/* ============================================================================
   progress.ts — planned-vs-actual progress maths
   ----------------------------------------------------------------------------
   Shared deliberately, not duplicated. The crew's phone shows "planned today:
   75%" while the server decides whether their number is a variance against that
   same figure — if the two ever computed it differently, the form would be
   telling the field one thing and the drawer telling the PM another, and the
   disagreement the whole loop exists to surface would be an artifact of our own
   arithmetic.

   Everything runs on the CPM working-day axis, so "behind" is measured in days
   a crew could actually have worked.
   ========================================================================== */

import { createWorkCalendar, type WorkCalendar } from "./cpm.js";
import type { WorkCalendarSetting } from "./index.js";

/** Just the planned window — deliberately structural, so any job-ish shape fits. */
export type PlannedWindow = { startDate: string; endDate: string };

/** The default working calendar, for a workspace without one of its own: a six-day construction week, Sundays off. */
export function scheduleCalendar(epoch: string): WorkCalendar {
  return createWorkCalendar(epoch, { weekendDays: [0] });
}

/** The workspace's own calendar — its working days and holidays from Settings › Work calendar — on a working-day axis from `epoch`. */
export function scheduleCalendarFor(epoch: string, setting: WorkCalendarSetting): WorkCalendar {
  const weekendDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => !setting.workingDays.includes(day));
  return createWorkCalendar(epoch, { weekendDays, holidays: setting.holidays.map((holiday) => holiday.date) });
}

/**
 * Where the plan says the job should be, as a percent, on `asOf`.
 *
 * Straight-line against the job's own planned duration: 0 before the start, 100
 * at/after the finish, and the fraction of working days elapsed in between.
 * Deliberately not S-curved — a linear plan percent is what a crew can actually
 * argue with, and an S-curve would quietly make "behind" mean something
 * different in week 1 than in week 3 without anyone in the field being told.
 */
export function plannedPercentAt(job: PlannedWindow, asOf: string, calendar: WorkCalendar): number {
  const start = calendar.toIndex(job.startDate);
  const end = calendar.toIndex(job.endDate);
  const now = calendar.toIndex(asOf);
  if (now <= start) return 0;
  if (now >= end) return 100;
  // +1 on each side: the axis is inclusive, so a job spanning one working day
  // has duration 1 and is 100% planned at its end, not 0%.
  const elapsed = now - start + 1;
  const total = end - start + 1;
  return Math.round(Math.min(100, Math.max(0, (elapsed / total) * 100)));
}

/**
 * The finish date the reported rate implies, in working days.
 *
 * Productivity so far is `reportedPercent` over the working days elapsed; the
 * remainder is projected at that same rate — the standard earned-value forecastIQ.
 * Intentionally pessimistic-honest: a crew at 40% on day 3 of a 4-day job
 * forecastIQs day 7, because nothing in the report says the rate is about to
 * change.
 *
 * Returns the planned end untouched when there's nothing to forecastIQ from (0%
 * reported, or the job hasn't started) — a crew reporting no progress on a job
 * that hasn't started yet is not late.
 */
export function forecastIQFinish(job: PlannedWindow, reportedPercent: number, asOf: string, calendar: WorkCalendar): string {
  const start = calendar.toIndex(job.startDate);
  const now = calendar.toIndex(asOf);

  if (reportedPercent >= 100) {
    // Done is done: the job finishes when the field says it finished, which may
    // be earlier *or* later than planned.
    return calendar.fromIndex(Math.max(start, now));
  }
  if (reportedPercent <= 0 || now < start) return job.endDate;

  const elapsed = Math.max(1, now - start + 1);
  const rate = reportedPercent / elapsed; // percent per working day
  const remainingDays = Math.ceil((100 - reportedPercent) / rate);
  return calendar.fromIndex(now + remainingDays);
}

/* ============================================================================
   Schedule status — the "N days ahead" headline
   ----------------------------------------------------------------------------
   One project's position against its own plan, expressed the way a super would
   say it out loud: a forecast finish date, and how many working days that lands
   ahead of (or behind) the planned finish.

   Built from forecastIQFinish above, so the headline and the per-job forecasts
   can never disagree. Nothing here invents a number: a project whose jobs have
   no reported progress forecasts to its planned finish and reads 0 days.
   ========================================================================== */

export type ProjectScheduleStatus = {
  projectId: string;
  /** Latest planned finish across the project's jobs. */
  plannedFinish: string;
  /** Latest forecast finish, driven by the pace each crew is actually reporting. */
  forecastFinish: string;
  /** Working days the forecast lands ahead of plan. Negative = behind. */
  daysAhead: number;
  /**
   * The project's own percent complete — the figure the PM keeps on the project
   * record. Falls back to job-reported progress (weighted by planned duration)
   * only when the record carries no percent at all.
   */
  percentComplete: number;
  /** How many of the project's jobs carry a reported percent — the evidence behind the forecast. */
  reportingJobs: number;
  totalJobs: number;
};

/**
 * Roll a project's jobs up into a single schedule position.
 *
 * The finish is the LATEST across jobs (a project is done when its last job is).
 * Percent is the project record's own figure when it has one; otherwise it is
 * derived from the jobs, weighted by planned duration so a two-day punch item
 * can't drag the headline as hard as a six-week pour.
 */
export function projectScheduleStatus(
  projectId: string,
  jobs: Array<PlannedWindow & { id: string; percentComplete?: number }>,
  asOf: string,
  calendar: WorkCalendar,
  /** The project record's percentComplete, when the caller has it. */
  projectPercent?: number
): ProjectScheduleStatus | null {
  if (jobs.length === 0) return null;

  let plannedFinishIdx = -Infinity;
  let forecastFinishIdx = -Infinity;
  let weighted = 0;
  let weight = 0;
  let reportingJobs = 0;

  for (const job of jobs) {
    const reported = job.percentComplete ?? 0;
    if (job.percentComplete != null) reportingJobs += 1;

    plannedFinishIdx = Math.max(plannedFinishIdx, calendar.toIndex(job.endDate));
    forecastFinishIdx = Math.max(forecastFinishIdx, calendar.toIndex(forecastIQFinish(job, reported, asOf, calendar)));

    const duration = Math.max(1, calendar.toIndex(job.endDate) - calendar.toIndex(job.startDate) + 1);
    weighted += reported * duration;
    weight += duration;
  }

  return {
    projectId,
    plannedFinish: calendar.fromIndex(plannedFinishIdx),
    forecastFinish: calendar.fromIndex(forecastFinishIdx),
    // ahead is positive: the forecast landing EARLIER than plan is time won back
    daysAhead: plannedFinishIdx - forecastFinishIdx,
    percentComplete:
      projectPercent != null && Number.isFinite(projectPercent)
        ? Math.round(Math.min(100, Math.max(0, projectPercent)))
        : weight === 0
          ? 0
          : Math.round(weighted / weight),
    reportingJobs,
    totalJobs: jobs.length
  };
}

/**
 * Portfolio headline across several projects.
 *
 * `daysAhead` is the average, rounded — one number a leader can read at a glance
 * — while the per-project rows carry the detail. Percent is the plain average
 * of the project percentages: each project counts once, the way a PM reads a
 * portfolio, rather than being skewed toward whichever project has more jobs.
 */
export function portfolioScheduleStatus(statuses: ProjectScheduleStatus[]) {
  if (statuses.length === 0) {
    return { daysAhead: 0, percentComplete: 0, projects: 0, behindProjects: 0, reportingJobs: 0, totalJobs: 0 };
  }
  const totalJobs = statuses.reduce((sum, s) => sum + s.totalJobs, 0);
  return {
    daysAhead: Math.round(statuses.reduce((sum, s) => sum + s.daysAhead, 0) / statuses.length),
    percentComplete: Math.round(statuses.reduce((sum, s) => sum + s.percentComplete, 0) / statuses.length),
    projects: statuses.length,
    behindProjects: statuses.filter((s) => s.daysAhead < 0).length,
    reportingJobs: statuses.reduce((sum, s) => sum + s.reportingJobs, 0),
    totalJobs
  };
}
