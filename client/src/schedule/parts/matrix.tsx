/**
 * The Matrix: the crew × day load grid with conflicts and the Load column.
 */
import { holidayMap, isWorkingDay, type Crew, type Job, type ScheduleAssignment, type WorkCalendarSetting } from "@buildflow/shared";
import type { CSSProperties } from "react";
import { cellKey, indexAssignmentsByCell } from "../scheduleUtils";
import { crewWeekUtilization, workingDays } from "../kpis";
import { crewAvailability, isText } from "./shared";
import { liveChangeFor, useLiveChanges } from "../live";

export function ScheduleMatrixView({
  crews,
  assignments,
  jobs,
  weekDays: displayedWeekDays,
  onOpenProject,
  onOpenJob,
  calendar
}: {
  crews: Crew[];
  assignments: ScheduleAssignment[];
  jobs: Job[];
  weekDays: Array<{ date: string; day: string; label: string }>;
  onOpenProject: (projectId: string) => void;
  /** When given, a cell opens this for its first booking instead of the job's project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job, assignment: ScheduleAssignment) => void;
  /** The workspace's working week and holidays, for the utilisation column. */
  calendar: WorkCalendarSetting;
}) {
  // cards another tab just changed, for the flash on their cells
  const live = useLiveChanges();
  // one pass over the bookings, then constant-time cells and job names
  const byCell = indexAssignmentsByCell(assignments);
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  if (crews.length === 0) {
    return (
      <div className="schedule-empty-state">
        <strong>No crews match these filters.</strong>
        <span>Add a crew, or reset the filters to see the allocation matrix.</span>
      </div>
    );
  }
  const workingDayCount = workingDays(
    displayedWeekDays.map((day) => day.date),
    calendar
  ).length;
  const holidays = holidayMap(calendar);
  return (
    <div className="sched-matrix" data-tutorial-id="matrix-grid" style={{ "--matrix-cols": displayedWeekDays.length } as CSSProperties}>
      <div className="sched-matrix-head">
        <span className="sched-matrix-corner">Crew</span>
        {displayedWeekDays.map((day) => {
          const holiday = holidays[day.date];
          const off = !isWorkingDay(day.date, calendar);
          return (
            <span key={day.date} className={`sched-matrix-col${holiday ? " is-holiday" : ""}${off ? " is-off" : ""}`}>
              <b>{day.day}</b>
              <em>{day.label}</em>
              {holiday && <span className="sched-holiday-tag">{holiday}</span>}
            </span>
          );
        })}
        <span className="sched-matrix-col is-total">Load</span>
      </div>
      {crews.map((crew) => {
        const cells = displayedWeekDays.map((day) => byCell.get(cellKey(crew.id, day.date)) ?? []);
        const total = cells.reduce((sum, cell) => sum + cell.length, 0);
        const utilization = crewWeekUtilization(crew, assignments, workingDayCount);
        const availability = crewAvailability(crew, utilization);
        return (
          <div className="sched-matrix-row" key={crew.id}>
            <div className="sched-matrix-crew">
              <strong>{crew.name}</strong>
              <em>{crew.specialty}</em>
            </div>
            {cells.map((cell, index) => {
              const level = Math.min(cell.length, 3);
              const conflicted = cell.some((assignment) => assignment.conflicts.length > 0);
              const names = cell.map((assignment) => jobsById.get(assignment.jobId)?.name).filter(isText);
              const day = displayedWeekDays[index];
              const changed = liveChangeFor(live, ...cell.flatMap((assignment) => [assignment.id, assignment.jobId]));
              // the cell's detail is its accessible name and a tooltip that shows on hover and on keyboard focus, not a title attribute
              const detail = cell.length
                ? `${crew.name} · ${day.label}: ${names.join(", ")}${conflicted ? " (conflict)" : ""}`
                : `${crew.name} · ${day.label}: open`;
              const tipId = `matrix-tip-${crew.id}-${day.date}`;
              return (
                <button
                  type="button"
                  key={day.date}
                  className={`sched-matrix-cell load-${level}${conflicted ? " is-conflict" : ""}${changed ? " is-live" : ""}${holidays[day.date] ? " is-holiday" : ""}`}
                  aria-label={detail}
                  aria-describedby={tipId}
                  onClick={() => {
                    const first = cell[0];
                    const job = first ? jobsById.get(first.jobId) : undefined;
                    if (!job) return;
                    if (onOpenJob && first) onOpenJob(job, first);
                    else onOpenProject(job.projectId);
                  }}
                >
                  {cell.length > 0 && <b>{cell.length}</b>}
                  <span className="sched-matrix-tip" role="tooltip" id={tipId}>
                    {detail}
                  </span>
                </button>
              );
            })}
            <div className="sched-matrix-total">
              <b>{total}</b>
              <span
                className={`sched-matrix-util ${availability.cls}`}
                aria-label={`${utilization}% of working days booked this week`}
                title="Booked days this week over working days"
              >
                {utilization}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
