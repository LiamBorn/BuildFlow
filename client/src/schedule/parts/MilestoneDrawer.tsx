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
 *
 * THE JOB PANEL'S LAYOUT, PART FOR PART (2026-09-23). Asked for with a screenshot of each: "make
 * the Month page right sidebar panel look the exact same as Kanban right sidebar panel". Its parts
 * sit where the job panel's sit: four facts in the same 2 × 2 (Progress and Duration in the same
 * corners), the WeatherIQ card under them, Start and Finish side by side under the same labels, and
 * the same three buttons. Nothing shows focus when it opens, as nothing does in the job panel: a
 * date field focused on arrival rings itself and selects its month (the screenshot's "Phase
 * finishes"), so the dialog puts focus on its close button instead. What a phase does not have
 * (crews, materials, links, a priority, notes) is left out rather than invented. That was the choice
 * put to the user, and the one they took.
 *
 * The line saying the jobs keep their own dates used to stand under the fields at all times. It now
 * appears once a date is changed, the moment it becomes true of something.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { Phase, Project } from "@buildflow/shared";
import { parseIsoDate } from "../../components/ui/gantt";
import { ScheduleDrawer } from "./ScheduleDrawer";
import type { ScheduleMilestone } from "./month";

/** What the drawer saves: a phase's span, or the project's completion — whichever the marker is. */
export type MilestoneEdit = { startDate?: string; endDate: string };

export function MilestoneDrawer({
  milestone,
  phase,
  project,
  onClose,
  onOpenSchedule,
  onSave,
  weather
}: {
  milestone: ScheduleMilestone;
  /** The phase the marker stands for, when it is a phase marker. */
  phase?: Phase;
  /** The project it belongs to — the owner for a completion marker, the parent for a phase. */
  project?: Project;
  onClose: () => void;
  /** "Open in Schedule": the Schedule overview, as the job panel's button opens it. */
  onOpenSchedule?: () => void;
  /** Saves it; what comes back says whether it saved and, when it did not, why. */
  onSave: (edit: MilestoneEdit) => Promise<{ saved: boolean; problem?: string } | void>;
  /** The weather on the days the marker covers, under its facts: WeatherIQ's card. */
  weather?: ReactNode;
}) {
  const isPhase = milestone.kind === "phase";
  const savedStart = phase?.startDate ?? "";
  const [startDate, setStartDate] = useState(savedStart);
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

  // counted the way the job panel counts its own: calendar days, both ends included, as the form has them
  const days =
    startDate && endDate
      ? Math.max(1, Math.round((parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) / 86_400_000) + 1)
      : null;
  const moved = endDate !== milestone.date || (isPhase && startDate !== savedStart);

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
        {/* NOT "the jobs in this phase" (or their crews and materials, as the job panel shows): there
            is no such relation to count. A job's `phase` is free text ("Tear-Off Zone A", "Mainline
            Milling") and a Phase row is a CPM record with its own name ("Tear-Off", "Milling") —
            measured on the real payloads, 0 of 6 and then 0 of 7 jobs matched a phase exactly, and
            matching on a prefix is wrong in both directions. A count nobody can derive is not a
            fact, so the facts here are the marker's own, in the job panel's four places. */}
        <div>
          <dt>Project</dt>
          <dd title={milestone.project}>{milestone.project}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{(isPhase ? phase?.percentComplete : project?.percentComplete) ?? 0}% complete</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{(isPhase ? phase?.status : project?.status) ?? "—"}</dd>
        </div>
        {isPhase ? (
          <div>
            <dt>Duration</dt>
            <dd>{days === null ? "—" : `${days} day${days === 1 ? "" : "s"}`}</dd>
          </div>
        ) : (
          <div>
            <dt>Health</dt>
            <dd>{project?.scheduleHealth ?? "—"}</dd>
          </div>
        )}
      </dl>
      {weather}
      <form className="gantt-drawer-form" onSubmit={submit}>
        {isPhase ? (
          <div className="gantt-drawer-row">
            <label>
              <span>Start</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span>Finish</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        ) : (
          <label>
            <span>Target completion</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        )}
        {moved && (
          <p className="gantt-drawer-note">
            {isPhase
              ? "The jobs inside this phase keep their own dates — move them on the calendar to reschedule the work."
              : "This is the date the project is handed over. The jobs and phases under it keep their own dates."}
          </p>
        )}
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
          {onOpenSchedule && (
            <button className="hs-btn hs-btn-link" type="button" onClick={onOpenSchedule}>
              <ExternalLink size={15} /> Open in Schedule
            </button>
          )}
        </div>
      </form>
    </ScheduleDrawer>
  );
}
