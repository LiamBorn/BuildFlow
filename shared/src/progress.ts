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

/** Just the planned window — deliberately structural, so any job-ish shape fits. */
export type PlannedWindow = { startDate: string; endDate: string };

/** The schedule's working calendar: a six-day construction week, Sundays off. */
export function scheduleCalendar(epoch: string): WorkCalendar {
  return createWorkCalendar(epoch, { weekendDays: [0] });
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
export function forecastIQFinish(
  job: PlannedWindow,
  reportedPercent: number,
  asOf: string,
  calendar: WorkCalendar
): string {
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
