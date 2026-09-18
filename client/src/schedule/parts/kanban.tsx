/**
 * The Kanban: five status lanes, and the cards in them as a list a planner arranges.
 *
 * Each lane is a dnd-kit SortableContext, so dragging a card between two others opens a gap where
 * it will land and the cards below it slide down — a card is placed, not just dropped in a lane
 * (asked for 2026-09-17). Which order a lane shows, and what a drop does to it, is decided by
 * ../kanbanOrder; the arrangement is kept as the person's own setting.
 */
import type { Job, Project } from "@buildflow/shared";
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { orderLaneJobs, placeInLane } from "../kanbanOrder";
import { useHoverFor, type HoverStore } from "../useBoardOrder";
import { KANBAN_LANES } from "../lanes";
import { formatScheduleDate } from "../week";
import { ScheduleBadge, tradeColorVar, tradeForText } from "./shared";
import { liveChangeLabel, useLiveChange } from "../live";

export function ScheduleKanbanView({
  jobs,
  projects,
  focusedJobId,
  onOpenProject,
  onOpenJob,
  pendingId,
  order,
  hoverStore
}: {
  jobs: Job[];
  projects: Project[];
  focusedJobId: string | null;
  onOpenProject: (projectId: string) => void;
  /** When given, a card opens this instead of its project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job) => void;
  /** The job whose move is still being saved. */
  pendingId?: string | null;
  /** The planner's own order, lane key → job ids; the rest of a lane keeps the board's order. */
  order?: Record<string, string[]>;
  /** The preview, subscribed to HERE so a card crossing lanes re-renders the board and not the
      page above it — the page's own re-render is what made a crossing lag (../useBoardOrder). */
  hoverStore?: HoverStore;
}) {
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "";
  if (jobs.length === 0) {
    return (
      <div className="schedule-empty-state">
        <strong>No jobs match these filters.</strong>
        <span>Reset the filters, or add a new activity to start the board.</span>
      </div>
    );
  }
  return (
    <div className="sched-kanban" data-tutorial-id="kanban-lanes">
      {KANBAN_LANES.map((lane) => (
        <ScheduleKanbanLane
          key={lane.key}
          lane={lane}
          jobs={jobs.filter((job) => lane.match.includes(job.status))}
          allJobs={jobs}
          order={order?.[lane.key]}
          hoverStore={hoverStore}
          projectName={projectName}
          focusedJobId={focusedJobId}
          onOpenProject={onOpenProject}
          onOpenJob={onOpenJob}
          pendingId={pendingId}
        />
      ))}
    </div>
  );
}

/** Cards a lane renders before asking; a workspace with thousands of jobs keeps the board light. */
export const LANE_WINDOW = 24;

export function ScheduleKanbanLane({
  lane,
  jobs,
  allJobs,
  order,
  hoverStore,
  projectName,
  focusedJobId,
  onOpenProject,
  onOpenJob,
  pendingId
}: {
  lane: (typeof KANBAN_LANES)[number];
  /** The jobs whose own lane this is. What it SHOWS may differ while a card is carried over it. */
  jobs: Job[];
  /** Every job on the board, so the one being carried in can be drawn whole. */
  allJobs?: Job[];
  /** The planner's own order for THIS lane. */
  order?: string[];
  hoverStore?: HoverStore;
  projectName: (id: string) => string;
  focusedJobId: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pendingId?: string | null;
}) {
  // the lane's own space, below its cards: a drop here is "the end of this lane"
  const { setNodeRef, isOver } = useDroppable({ id: `kanban-${lane.key}`, data: { status: lane.status, lane: lane.key } });
  const [limit, setLimit] = useState(LANE_WINDOW);
  /* THE LANE ARRANGES ITSELF: the planner's order, plus the card being carried over it, drawn where
     it would land. It subscribes only to a preview that concerns THIS lane, so a card crossing the
     board re-renders the two lanes it is between and no others (../useBoardOrder). */
  const hover = useHoverFor(hoverStore, lane.key);
  const carried = hover ? allJobs?.find((job) => job.id === hover.itemId) : undefined;
  const mine = jobs.filter((job) => !carried || job.id !== carried.id);
  const ordered = orderLaneJobs(mine, order);
  const all = carried && hover?.section === lane.key ? placeInLane(ordered, carried, hover.overId) : ordered;
  const shown = all.length > limit ? all.slice(0, limit) : all;
  const hidden = all.length - shown.length;
  return (
    <section ref={setNodeRef} className={`sched-kan-lane tone-${lane.tone}${isOver ? " drop-over" : ""}`}>
      <header className="sched-kan-head">
        <span className="sched-kan-dot" />
        <h3>{lane.label}</h3>
        <b>{all.length}</b>
      </header>
      <div className="sched-kan-cards">
        {/* the cards this lane is showing, as a list: the gap that opens while a card is carried
            over them is dnd-kit's own sortable preview, and the drop keeps what it showed */}
        <SortableContext items={shown.map((job) => job.id)} strategy={verticalListSortingStrategy}>
          {shown.map((job) => (
            <ScheduleKanbanCard
              key={job.id}
              job={job}
              lane={lane.key}
              subtitle={projectName(job.projectId) || job.location}
              isFocused={focusedJobId === job.id}
              onOpenProject={onOpenProject}
              onOpenJob={onOpenJob}
              pending={pendingId === job.id}
            />
          ))}
        </SortableContext>
        {all.length === 0 && <p className="sched-kan-empty">Drop a job here</p>}
        {hidden > 0 && (
          <button type="button" className="sched-kan-more" onClick={() => setLimit((current) => current + LANE_WINDOW)}>
            Show {Math.min(hidden, LANE_WINDOW)} more of {hidden}
          </button>
        )}
      </div>
    </section>
  );
}

export function ScheduleKanbanCard({
  job,
  lane,
  subtitle,
  isFocused,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  /** The lane this card is in, so a drop knows the list it came from. */
  lane: string;
  subtitle: string;
  isFocused: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pending?: boolean;
}) {
  const tone = tradeForText(`${job.phase} ${job.name}`);
  /* The card is a sortable item, and its id is the JOB's id: that is what the lane's order is
     written in, and what a drop reads off `over`. The drag data carries the rest. */
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { jobId: job.id, status: job.status, lane }
  });
  /* `dragging` is the slot the card leaves behind (the one in the air is the carry layer's), and
     the transform is how the OTHER cards move aside to open the gap it will land in. */
  const style: CSSProperties = {
    "--sc-tone": tradeColorVar(tone),
    transform: CSS.Transform.toString(transform),
    transition
  } as CSSProperties;
  const live = useLiveChange(job.id);
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`sched-kan-card${isDragging ? " dragging" : ""}${isFocused ? " focused" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      aria-busy={pending || undefined}
      style={style}
      onClick={() => (onOpenJob ? onOpenJob(job) : onOpenProject(job.projectId))}
      title={`${job.name} · ${job.phase}`}
      {...listeners}
      {...attributes}
    >
      {live && <span className="sched-live-by">{liveChangeLabel(live)}</span>}
      <span className="sched-kan-card-top">
        <span className="sched-kan-card-dot" />
        <strong>{job.name}</strong>
      </span>
      <em>{subtitle}</em>
      <footer>
        <span className="sched-kan-phase">{job.phase}</span>
        <ScheduleBadge status={job.status} />
      </footer>
      <div className="sched-kan-meta">
        <span>
          <CalendarDays size={12} /> {formatScheduleDate(job.startDate)}
        </span>
        <span>
          <Users size={12} /> {job.requiredLabor}
        </span>
      </div>
    </button>
  );
}
