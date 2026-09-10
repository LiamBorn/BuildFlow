/**
 * Kanban — the Schedule hub's jobs-by-status board as its own sub-page beside
 * Week, List and Gantt Chart: the Schedule page's Kanban view. Five lanes —
 * Planned, Ready, In Progress, Blocked, Complete — with a card per job. Drag a
 * card into another lane to move the job's status; a card opens the job drawer
 * the other sub-pages use; Export writes the board to CSV.
 *
 * Stands in the shared page frame (schedule/page.tsx): everything the seven
 * pages share comes from the one page hook; this file is the board and its
 * drop rule.
 */
import { useMemo, type ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { BootstrapPayload, Status } from "@buildflow/shared";
import { updateJob } from "../../api";
import { KANBAN_LANES, ScheduleKanbanView, plural } from "../parts";
import { scheduleAccessibility } from "../dragKeyboard";
import { kanbanLaneOf, kanbanMove } from "../lanes";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, useSchedulePage } from "../page";

export type KanbanPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** Opens the page an alert points at (the Week board, DelayIQs, Materials, the Map). */
  onOpenPage?: (page: ScheduleTarget) => void;
  /** The "New" pill the navigation shows for a fresh release. */
  releaseTag?: ReactNode;
};

/** The Kanban is the status view: the shared status filter does not apply, every status stays on the board. */
const KANBAN_FILTERS = { statuses: false } as const;

export function KanbanPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: KanbanPageProps) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "kanban", filterOptions: KANBAN_FILTERS });
  const { data, scope, jobs, weekIso, selectedJob, openJob, suppressClick, releaseClick, busy, pendingId, runChange, say } = page;

  // the live announcements name the job and the lane
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) => data.jobs.find((candidate) => candidate.id === item?.jobId)?.name ?? "Job",
        over: (lane) => `the ${KANBAN_LANES.find((candidate) => candidate.status === lane?.status)?.label ?? "status"} lane`
      }),
    [data.jobs]
  );
  // A card dropped into another lane takes that lane's status.
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const jobId = event.active.data.current?.jobId as string | undefined;
    const sourceStatus = event.active.data.current?.status as Status | undefined;
    const targetStatus = kanbanMove(sourceStatus, event.over?.data.current?.status as Status | undefined);
    if (!jobId || !targetStatus || busy) return; // no lane under the card, or its own lane
    const name = data.jobs.find((candidate) => candidate.id === jobId)?.name ?? "Job";
    await runChange({
      id: jobId,
      name,
      write: () => updateJob(jobId, { status: targetStatus }),
      done: `${name} moved to ${kanbanLaneOf(targetStatus)?.label ?? targetStatus}`,
      // for a few seconds the move can be taken back: the status it had before
      undo: sourceStatus ? () => updateJob(jobId, { status: sourceStatus }) : null,
      undone: `${name} back to ${sourceStatus}`
    });
  };

  return (
    <SchedulePageFrame
      page={page}
      pageClass="kanban-page"
      eyebrow={<>Crew Scheduling · {plural(jobs.length, "job")} by status</>}
      title="Kanban"
      titleTutorialId="kanban-page-title"
      sub="Every job by status. Drag a card into another lane to move it along, or open one for the details."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <div className="filter-strip kanban-actions">
          <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
        </div>
      }
      filters={{ statuses: false, note: "The Kanban is the status view: every status stays on the board." }}
      boardLabel="Jobs by status"
      drag={{ accessibility, onDragEnd }}
    >
      <ScheduleKanbanView
        jobs={jobs}
        projects={data.projects}
        focusedJobId={selectedJob?.id ?? null}
        pendingId={pendingId}
        onOpenProject={() => undefined}
        onOpenJob={(job) => {
          if (!suppressClick.current) openJob(job.id);
        }}
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
          scope={{ jobs, assignments: scope.assignments, crews: scope.crews, projects: data.projects, includeUnbooked: true }}
          weekDays={weekIso}
          sheetTitle="Crew week sheets"
          filename="buildflow-kanban"
          disabled={busy || jobs.length === 0}
          onNotice={say}
        />
      </footer>
    </SchedulePageFrame>
  );
}
