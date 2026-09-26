/* =========================================================================
   Changing a job: the one code path behind every door that does it.

   The website saves a job in one of two requests (client/src/schedule/hooks.tsx, useJobSave): a
   plain edit is PATCH /api/jobs/:id, and a move that keeps the job's length and has bookings is one
   POST /api/schedule/rebook carrying the job and every booking it has. BuildFlow for Mac's Accept
   (desktopAsk.ts) makes the same two writes. Both doors call these functions, so the checks cannot
   drift apart: the span rule, the row-version check that turns a save made against a stale copy
   into a 409, and the crew clash check that refuses a double-booking the caller did not choose.

   They answer a result rather than an Express response. The website's routes send it as they always
   have, word for word; the Mac's route says it in the Mac's contract. Who may call them is the
   caller's business -- the route policy for the website's routes (permissions.ts), and the same
   capabilities checked in desktopAsk.ts for the Mac -- because the permission check is about the
   request, not the write.
   ========================================================================= */
import type { CrewClash, Job, RebookMove, RebookResult } from "@buildflow/shared";
import { RebookConflictError, StaleWriteError, clashMessage, type BuildFlowStore } from "./database.js";

/** A job's span cannot run backwards; the message says which way round it should be. */
export const spanIsForwards = <T extends { startDate?: string; endDate?: string }>(value: T) =>
  !value.startDate || !value.endDate || value.endDate >= value.startDate;
export const SPAN_MESSAGE = { message: "The finish cannot be before the start", path: ["endDate"] };

/** Why a write was refused, as the website's routes answer it. */
export type JobWriteRefusal =
  | { status: 400; body: { error: string; field: "endDate" } }
  | { status: 404; body: { error: string } }
  /** Somebody else replaced the row between the caller's read and this write. Nothing was written. */
  | { status: 409; body: { error: string; code: "stale"; current: Record<string, unknown> } }
  /** A crew would be double-booked. Nothing was written; the clashes say who is already there. */
  | { status: 409; body: { error: string; code: "conflict"; clashes: CrewClash[] } };

export type JobWrite<T> = { ok: true; value: T } | ({ ok: false } & JobWriteRefusal);

/** The edits a PATCH carries once its body has been read: dates, the drawer's fields, and the version it was made against. */
export type JobPatch = Partial<
  Pick<Job, "startDate" | "endDate" | "status" | "startTime" | "endTime" | "materialsStatus" | "notes" | "priority">
> & {
  version?: number;
};

/** PATCH /api/jobs/:id, after its body has passed the schema. */
export function editJob(store: BuildFlowStore, id: string, patch: JobPatch): JobWrite<Job> {
  const current = store.job(id);
  if (!current) return { ok: false, status: 404, body: { error: "Job not found" } };
  // one date may move on its own; what counts is the span the job ends up with
  const span = { startDate: patch.startDate ?? current.startDate, endDate: patch.endDate ?? current.endDate };
  if (!spanIsForwards(span)) return { ok: false, status: 400, body: { error: SPAN_MESSAGE.message, field: "endDate" } };
  const { version, ...edits } = patch;
  let job: Job | undefined;
  try {
    job = store.updateJob(id, edits, version);
  } catch (error) {
    // Somebody else replaced the row between the read and this write: say so and change nothing.
    if (error instanceof StaleWriteError)
      return { ok: false, status: 409, body: { error: error.message, code: error.code, current: error.current } };
    throw error;
  }
  if (!job) return { ok: false, status: 404, body: { error: "Job not found" } };
  return { ok: true, value: job };
}

/** POST /api/schedule/rebook, after its body has passed the schema: every step applies, or none does. */
export function rebookJobs(store: BuildFlowStore, moves: RebookMove[], options: { force?: boolean } = {}): JobWrite<RebookResult> {
  try {
    return { ok: true, value: store.rebook(moves, options) };
  } catch (error) {
    if (error instanceof RebookConflictError) {
      return { ok: false, status: 409, body: { error: clashMessage(error.clashes), code: "conflict", clashes: error.clashes } };
    }
    // A step written against a row somebody else has replaced: the whole batch is refused.
    if (error instanceof StaleWriteError)
      return { ok: false, status: 409, body: { error: error.message, code: error.code, current: error.current } };
    // a booking, crew or job a step names but the workspace does not have
    return { ok: false, status: 404, body: { error: error instanceof Error ? error.message : "Re-book failed" } };
  }
}
