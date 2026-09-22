/**
 * The drawer a MARKER opens — "Tear-Off Complete", "Certificate of Occupancy" — on the job
 * drawer's design, because on the calendar the two look alike and a planner reading the month has
 * no reason to think one of them is a different kind of thing.
 *
 * A marker is not a job: it is a DATE that something else owns, so this edits that something.
 * A phase marker edits the phase's start and finish (`PATCH /api/phases/:id`); the Certificate of
 * Occupancy edits the project's target completion (`PATCH /api/projects/:id`). The work inside a
 * phase keeps its own dates either way — saying when a phase is due and rescheduling the jobs
 * under it are two different gestures, which is the same rule dragging a marker already follows.
 *
 * Reported 2026-09-20 with a screen recording: "make it so that a user is able to open all jobs …
 * as of right now users are only able to open up a select amount of jobs to edit them." In the
 * month on the clip, 14 of the 20 chips were markers and opened nothing at all — they were plain
 * `<div>`s, on the reasoning that "a date is all it is". A date is still something you edit.
 */
import { useEffect, useState, type FormEvent } from "react";
import type { Phase, Project } from "@buildflow/shared";
import { ScheduleDrawer } from "./ScheduleDrawer";
import type { ScheduleMilestone } from "./month";

/** What the drawer saves: a phase's span, or the project's completion — whichever the marker is. */
export type MilestoneEdit = { startDate?: string; endDate: string };

export function MilestoneDrawer({
  milestone,
  phase,
  project,
  onClose,
  onSave
}: {
  milestone: ScheduleMilestone;
  /** The phase the marker stands for, when it is a phase marker. */
  phase?: Phase;
  /** The project it belongs to — the owner for a completion marker, the parent for a phase. */
  project?: Project;
  onClose: () => void;
  /** Saves it; what comes back says whether it saved and, when it did not, why. */
  onSave: (edit: MilestoneEdit) => Promise<{ saved: boolean; problem?: string } | void>;
}) {
  const isPhase = milestone.kind === "phase";
  const [startDate, setStartDate] = useState(phase?.startDate ?? "");
  const [endDate, setEndDate] = useState(milestone.date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStartDate(phase?.startDate ?? "");
    setEndDate(milestone.date);
    setError(null);
  }, [milestone, phase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!endDate) {
      setError(isPhase ? "The finish is required." : "The completion date is required.");
      return;
    }
    /* The same rule the server holds and the drag already says out loud, checked here so the
       answer arrives without a round trip. */
    if (isPhase && startDate && endDate < startDate) {
      setError("The finish cannot be before the start.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSave(isPhase ? { startDate, endDate } : { endDate });
      if (result && !result.saved && result.problem) setError(result.problem);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScheduleDrawer
      title={milestone.title}
      sub={
        <>
          {milestone.project}
          {isPhase ? " · Phase finish" : " · Project completion"}
        </>
      }
      closeLabel="Close milestone details"
      onClose={onClose}
    >
      <dl className="gantt-drawer-facts">
        <div>
          <dt>Marks</dt>
          <dd>{isPhase ? "When the phase is due" : "When the project is due"}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd title={milestone.project}>{milestone.project}</dd>
        </div>
        {/* NOT "the jobs in this phase": there is no such relation to count. A job's `phase` is
            free text ("Tear-Off Zone A", "Safety Setup") and a Phase row is a CPM record with its
            own name ("Tear-Off") — measured on the real payload, 0 of 6 jobs matched a phase
            exactly, and matching on a prefix is wrong in both directions ("Flashing and Punch"
            belongs to two of them, "Deck Repair" to none). A count nobody can derive is not a
            fact, so the phase's own status goes here instead. */}
        {isPhase && (
          <div>
            <dt>Progress</dt>
            <dd>{phase?.percentComplete ?? 0}% complete</dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd>{(isPhase ? phase?.status : project?.status) ?? "—"}</dd>
        </div>
      </dl>
      <form className="gantt-drawer-form" onSubmit={submit}>
        {isPhase ? (
          <div className="gantt-drawer-row">
            <label>
              <span>Phase starts</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span>Phase finishes</span>
              <input autoFocus type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        ) : (
          <label>
            <span>Target completion</span>
            <input autoFocus type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        )}
        <p className="gantt-drawer-note">
          {isPhase
            ? "The jobs inside this phase keep their own dates — move them on the calendar to reschedule the work."
            : "This is the date the project is handed over. The jobs and phases under it keep their own dates."}
        </p>
        {error && (
          <p className="gantt-drawer-error" role="alert">
            {error}
          </p>
        )}
        <div className="gantt-drawer-actions">
          <button className="hs-btn hs-btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button className="hs-btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </ScheduleDrawer>
  );
}
