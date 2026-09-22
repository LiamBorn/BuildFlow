/**
 * The re-book diffs behind a drop: what one request to /api/schedule/rebook should
 * carry, and the moves that put everything back for Undo. Pure functions — the
 * Month calendar's drop and the drawer's move build from these.
 */
import type { Job, JobEdits, RebookMove, ScheduleAssignment } from "@buildflow/shared";
import { shiftScheduleDate } from "./scheduleUtils";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from one day to another; both are local midnights, so a daylight-saving day still counts as one. */
export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / DAY_MS);
}

export type MonthRebook = { delta: number; moves: RebookMove[]; inverse: RebookMove[] };

/**
 * A chip dropped on another day moves the job's planned span and every booking it
 * has by the same number of days, so the whole job moves together. Null on its own start day.
 */
export function monthRebook(
  job: Pick<Job, "id" | "startDate" | "endDate"> & Pick<Partial<Job>, "version">,
  assignments: ScheduleAssignment[],
  date: string
): MonthRebook | null {
  if (job.startDate === date) return null;
  const delta = daysBetween(job.startDate, date);
  const bookings = assignments
    .filter((assignment) => assignment.jobId === job.id)
    .map((assignment) => ({ id: assignment.id, date: assignment.date.slice(0, 10), version: assignment.version }));
  return {
    delta,
    // Each step says which version of the row it is replacing, so a move made against a copy
    // somebody else has already changed is refused rather than applied over them.
    moves: [
      { op: "job", id: job.id, startDate: date, endDate: shiftScheduleDate(job.endDate, delta), version: job.version },
      ...bookings.map((booking): RebookMove => ({
        op: "move",
        id: booking.id,
        date: shiftScheduleDate(booking.date, delta),
        version: booking.version
      }))
    ],
    // The way back carries no versions on purpose: by the time Undo runs, the rows are one
    // version further on — this very move made them so.
    inverse: [
      { op: "job", id: job.id, startDate: job.startDate, endDate: job.endDate },
      ...bookings.map((booking): RebookMove => ({ op: "move", id: booking.id, date: booking.date }))
    ]
  };
}

export type JobMove = MonthRebook;

/**
 * A drawer save or a Gantt bar drag that keeps the job's length and moves both dates by
 * the same number of days is a move: the job and every booking it has shift together
 * (the Month calendar's rule) in one re-book request the server runs as one transaction
 * and checks for clashes. Whatever else the same save changes (a status, a note) rides on
 * the job step, so the save is still one request — and the way back carries the old
 * values. Null when the dates do not move that way — a longer or shorter window, a
 * status alone — or when the job has nothing booked to carry: a plain edit will do.
 */
export function jobMove(
  job: Pick<Job, "id" | "startDate" | "endDate"> & Partial<Job>,
  assignments: ScheduleAssignment[],
  patch: Partial<Job>
): JobMove | null {
  const { startDate: nextStart, endDate: nextEnd, ...rest } = patch;
  const startDate = nextStart ?? job.startDate;
  const endDate = nextEnd ?? job.endDate;
  const delta = daysBetween(job.startDate, startDate);
  if (delta === 0 || daysBetween(job.endDate, endDate) !== delta) return null;
  if (!assignments.some((assignment) => assignment.jobId === job.id)) return null;
  const plan = monthRebook(job, assignments, startDate);
  if (!plan) return null;
  const edits = rest as JobEdits;
  // the values the edited fields had; a field that was empty stays as the server has it
  const was = Object.fromEntries(
    Object.keys(edits)
      .map((key) => [key, job[key as keyof Job]])
      .filter(([, value]) => value !== undefined)
  ) as JobEdits;
  const [jobStep, ...bookingSteps] = plan.moves;
  const [jobBack, ...bookingsBack] = plan.inverse;
  return {
    delta,
    moves: [{ ...jobStep, ...edits } as RebookMove, ...bookingSteps],
    inverse: [{ ...jobBack, ...was } as RebookMove, ...bookingsBack]
  };
}
