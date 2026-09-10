/**
 * Matrix — the Schedule hub's crew × day load grid as its own sub-page beside
 * Week, List, Kanban and Gantt Chart: the Schedule page's Matrix view. One row
 * per crew, a cell per day shaded by how many jobs are booked (conflicts
 * flagged), and a Load column with the week's total and the crew's utilisation.
 * A cell opens the job drawer for its first booking; Export writes the week's
 * bookings to CSV.
 *
 * Stands in the shared page frame (schedule/page.tsx): everything the seven
 * pages share comes from the one page hook; this file is the board.
 */
import type { ReactNode } from "react";
import type { BootstrapPayload } from "@buildflow/shared";
import { ScheduleMatrixView } from "../parts";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, ThisWeekButton, WeekStepper, useSchedulePage } from "../page";

export type MatrixPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** Opens the page an alert points at (the Week board, DelayIQs, Materials, the Map). */
  onOpenPage?: (page: ScheduleTarget) => void;
  /** The "New" pill the navigation shows for a fresh release. */
  releaseTag?: ReactNode;
};

export function MatrixPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: MatrixPageProps) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "matrix" });
  const { data, jobs, crews, weekDays, weekAssignments, weekStartIso, weekEndIso, weekRange, calendar, openBooking, say } = page;

  return (
    <SchedulePageFrame
      page={page}
      pageClass="matrix-page"
      eyebrow={<>Crew Scheduling · {weekRange}</>}
      title="Matrix"
      titleTutorialId="matrix-page-title"
      sub="How booked each crew is across the week, and where the conflicts are. Open a cell for its booking."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <>
          <div className="filter-strip">
            <WeekStepper page={page} />
          </div>
          <div className="filter-strip matrix-actions">
            <ThisWeekButton page={page} />
            <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
          </div>
        </>
      }
      boardLabel="Crew load for the week"
    >
      <ScheduleMatrixView
        crews={crews}
        assignments={weekAssignments}
        jobs={jobs}
        weekDays={weekDays}
        onOpenProject={() => undefined}
        calendar={calendar}
        onOpenJob={(_job, assignment) => openBooking(assignment)}
      />
      <footer className="schedule-board-footer">
        <div className="schedule-legend" aria-label="Schedule statuses">
          <span>
            <i className="confirmed" /> Confirmed
          </span>
          <span>
            <i className="ready" /> Ready
          </span>
          <span>
            <i className="delayIQed" /> DelayIQed
          </span>
          <span>
            <i className="in-progress" /> In Progress
          </span>
          <span>
            <i className="planned" /> Planned
          </span>
        </div>
        <ScheduleExportMenu
          scope={{ jobs, assignments: weekAssignments, crews, projects: data.projects, window: { start: weekStartIso, end: weekEndIso } }}
          weekDays={weekDays.map((day) => day.date)}
          sheetTitle={`Week of ${weekRange}`}
          filename={`buildflow-matrix-${weekStartIso}`}
          disabled={weekAssignments.length === 0}
          onNotice={say}
        />
      </footer>
    </SchedulePageFrame>
  );
}
