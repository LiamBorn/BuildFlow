/**
 * The Kanban: five status lanes and the draggable job cards in them.
 */
import type { Job, Project } from "@buildflow/shared";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Users } from "lucide-react";
import type { CSSProperties } from "react";
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
  pendingId
}: {
  jobs: Job[];
  projects: Project[];
  focusedJobId: string | null;
  onOpenProject: (projectId: string) => void;
  /** When given, a card opens this instead of its project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job) => void;
  /** The job whose move is still being saved. */
  pendingId?: string | null;
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
  projectName,
  focusedJobId,
  onOpenProject,
  onOpenJob,
  pendingId
}: {
  lane: (typeof KANBAN_LANES)[number];
  jobs: Job[];
  projectName: (id: string) => string;
  focusedJobId: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pendingId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kanban-${lane.key}`, data: { status: lane.status } });
  const [limit, setLimit] = useState(LANE_WINDOW);
  const shown = jobs.length > limit ? jobs.slice(0, limit) : jobs;
  const hidden = jobs.length - shown.length;
  return (
    <section ref={setNodeRef} className={`sched-kan-lane tone-${lane.tone}${isOver ? " drop-over" : ""}`}>
      <header className="sched-kan-head">
        <span className="sched-kan-dot" />
        <h3>{lane.label}</h3>
        <b>{jobs.length}</b>
      </header>
      <div className="sched-kan-cards">
        {shown.map((job) => (
          <ScheduleKanbanCard
            key={job.id}
            job={job}
            subtitle={projectName(job.projectId) || job.location}
            isFocused={focusedJobId === job.id}
            onOpenProject={onOpenProject}
            onOpenJob={onOpenJob}
            pending={pendingId === job.id}
          />
        ))}
        {jobs.length === 0 && <p className="sched-kan-empty">Drop a job here</p>}
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
  subtitle,
  isFocused,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  subtitle: string;
  isFocused: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pending?: boolean;
}) {
  const tone = tradeForText(`${job.phase} ${job.name}`);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `kanban-job-${job.id}`,
    data: { jobId: job.id, status: job.status }
  });
  const style: CSSProperties = {
    "--sc-tone": tradeColorVar(tone),
    transform: CSS.Translate.toString(transform),
    ...(isDragging ? { opacity: 0.55, zIndex: 30 } : {})
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
