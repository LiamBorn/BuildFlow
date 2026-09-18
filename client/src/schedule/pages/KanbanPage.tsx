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
import { useCallback, useMemo, type ReactNode } from "react";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import type { BootstrapPayload, Status } from "@buildflow/shared";
import { updateJob } from "../../api";
import { KANBAN_LANES, ScheduleCarryLayer, ScheduleKanbanView, plural } from "../parts";
import { scheduleAccessibility } from "../dragKeyboard";
import { KANBAN_ORDER_KEY, insertInLane, moveInLane, orderLaneJobs, type KanbanOrder } from "../kanbanOrder";
import { useBoardOrder } from "../useBoardOrder";
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

  /* THE PLANNER'S OWN ORDER for each lane, and the preview while a card is between lanes. Both
     live in ../useBoardOrder, which the Week, Month and List boards share — the Kanban had them
     first and they moved there when the same arrangement was asked for on the other pages. */
  const {
    order,
    persist: persistOrder,
    hoverStore,
    readHover,
    trackHover,
    clearHover
  } = useBoardOrder({
    settingKey: KANBAN_ORDER_KEY,
    raw: data.userSettings?.[KANBAN_ORDER_KEY] ?? null
  });
  /** A lane's cards in the order it is showing them, which is what a drop rearranges. */
  const laneIds = useCallback(
    (laneKey: string, current: KanbanOrder) => {
      const lane = KANBAN_LANES.find((candidate) => candidate.key === laneKey);
      if (!lane) return [];
      return orderLaneJobs(
        jobs.filter((job) => lane.match.includes(job.status)),
        current[laneKey]
      ).map((job) => job.id);
    },
    [jobs]
  );

  /** The lane under the pointer: a card names its own, the lane's own space names itself. */
  const laneUnder = (dropped: { status?: Status; lane?: string } | undefined) =>
    dropped?.lane ?? KANBAN_LANES.find((lane) => lane.status === dropped?.status)?.key;

  /* WHERE IT WOULD LAND, while it is still in the air — held over ANOTHER lane, the card is drawn
     in that lane at the place it would take (parts/kanban.tsx), those cards move aside and its own
     lane closes up. The rule is the shared one; all this page does is say what a lane is called. */
  const onDragOver = (event: DragOverEvent) => {
    const dragged = event.active.data.current as { jobId?: string; lane?: string } | undefined;
    const dropped = event.over?.data.current as { jobId?: string; status?: Status; lane?: string } | undefined;
    trackHover({ itemId: dragged?.jobId, section: laneUnder(dropped), overId: dropped?.jobId ?? null, ownSection: dragged?.lane });
  };

  // the live announcements name the job and the lane
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) => data.jobs.find((candidate) => candidate.id === item?.jobId)?.name ?? "Job",
        over: (lane) => `the ${KANBAN_LANES.find((candidate) => candidate.status === lane?.status)?.label ?? "status"} lane`
      }),
    [data.jobs]
  );
  /**
   * A drop on the board is one of two things. Inside its own lane it is an ORDER: the card takes
   * the place of the one it was dropped on and nothing is written to the server — the arrangement
   * is the planner's, kept in their setting. Into another lane it is a STATUS, as it always was,
   * and the card also keeps the place it was dropped in.
   */
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const held = readHover();
    clearHover();
    const dragged = event.active.data.current as { jobId?: string; status?: Status; lane?: string } | undefined;
    const dropped = event.over?.data.current as { jobId?: string; status?: Status; lane?: string } | undefined;
    const jobId = dragged?.jobId;
    const sourceStatus = dragged?.status;
    if (!jobId || !event.over || busy) return;
    const targetLane = laneUnder(dropped);
    if (!targetLane) return;
    /* While a preview is up the card is drawn in the lane it is held over, so `over` can be its own
       slot there and its own lane prop has moved with it: the preview is then the only thing that
       still knows where the card came from and where it was going. What you saw is where it goes. */
    const previewing = held?.itemId === jobId && held.section === targetLane ? held : null;
    const sourceLane = held?.itemId === jobId ? held.from : dragged?.lane;
    /* `over` CAN be the card itself — released without having moved, or on the slot it left. That
       is not "no target", it is "this one", and the rules answer it by leaving the lane alone;
       nulling it here used to mean the lane's own space, which sent the card to the END. */
    const overJobId = previewing ? previewing.overId : (dropped?.jobId ?? null);

    if (targetLane === sourceLane) {
      const next = moveInLane(laneIds(targetLane, order), jobId, overJobId);
      if (next.join() === laneIds(targetLane, order).join()) return; // dropped back where it was
      await persistOrder({ ...order, [targetLane]: next });
      return;
    }

    const targetStatus = kanbanMove(sourceStatus, KANBAN_LANES.find((lane) => lane.key === targetLane)?.status);
    if (!targetStatus) return; // the lane it already sits in
    const job = data.jobs.find((candidate) => candidate.id === jobId);
    const name = job?.name ?? "Job";
    // where it lands in the new lane is the planner's too, saved before the status goes over
    await persistOrder({ ...order, [targetLane]: insertInLane(laneIds(targetLane, order), jobId, overJobId) });
    await runChange({
      id: jobId,
      name,
      // the version this card was drawn from, so a lane drop cannot overwrite somebody else's move
      write: () => updateJob(jobId, { status: targetStatus }, job?.version),
      done: `${name} moved to ${kanbanLaneOf(targetStatus)?.label ?? targetStatus}`,
      // for a few seconds the move can be taken back: the status it had before. No version on the
      // way back — this move has already moved it on by one.
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
      sub="Every job by status. Drag a card into another lane to move it along, or between two cards to place it there; open one for the details."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <div className="filter-strip kanban-actions">
          <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
        </div>
      }
      filters={{ statuses: false, note: "The Kanban is the status view: every status stays on the board." }}
      boardLabel="Jobs by status"
      drag={{ accessibility, onDragEnd, onDragOver, onDragCancel: clearHover }}
    >
      {/* the card under the hand (parts/carry.tsx) */}
      <ScheduleCarryLayer />
      <ScheduleKanbanView
        order={order}
        hoverStore={hoverStore}
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
