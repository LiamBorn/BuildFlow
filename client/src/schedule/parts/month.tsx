/**
 * The Month calendar: the six-week grid, its day cells and job chips, milestones and
 * the trade legend.
 */
import type { BootstrapPayload, Job, Project } from "@buildflow/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { ScheduleMonthCell } from "../month";
import { formatScheduleDate } from "../week";
import { TRADE_ORDER, tradeColorVar, tradeForText } from "./shared";
import type { TradeKey } from "./shared";
import { liveChangeLabel, useLiveChange } from "../live";

export type ScheduleMilestone = {
  id: string;
  title: string;
  project: string;
  date: string;
  tone: TradeKey;
};

export function deriveScheduleMilestones(data: BootstrapPayload): ScheduleMilestone[] {
  const projectName = (id: string) => data.projects.find((project) => project.id === id)?.name ?? "Project";
  const fromPhases = data.phases
    .filter((phase) => phase.endDate)
    .map((phase) => ({
      id: `ms-phase-${phase.id}`,
      title: `${phase.name} Complete`,
      project: projectName(phase.projectId),
      date: phase.endDate,
      tone: "milestone" as TradeKey
    }));
  const fromProjects = data.projects
    .filter((project) => project.targetCompletion)
    .map((project) => ({
      id: `ms-co-${project.id}`,
      title: "Certificate of Occupancy",
      project: project.name,
      date: project.targetCompletion,
      tone: "milestone" as TradeKey
    }));
  return [...fromPhases, ...fromProjects].sort((left, right) => left.date.localeCompare(right.date));
}

export function ScheduleMonthView({
  cells,
  jobsByDate,
  milestonesByDate,
  projects,
  today,
  onOpenProject,
  onOpenDay,
  onAddJob,
  onOpenJob,
  holidays,
  pendingId
}: {
  cells: ScheduleMonthCell[];
  jobsByDate: Map<string, Job[]>;
  milestonesByDate: Map<string, ScheduleMilestone[]>;
  projects: Project[];
  today: string;
  onOpenProject: (projectId: string) => void;
  onOpenDay: (date: string) => void;
  onAddJob: (date: string) => void;
  /** When given, a job chip opens this instead of its project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job) => void;
  /** date → name, from the workspace's work calendar. */
  /** date → name, from Settings › Work calendar. */
  holidays: Record<string, string>;
  /** The job whose move is still being saved. */
  pendingId?: string | null;
}) {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "";
  return (
    <div className="sched-cal" data-tutorial-id="month-calendar">
      <div className="sched-cal-dow">
        {dayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sched-cal-grid">
        {cells.map((cell) => (
          <MonthDayCell
            key={cell.date}
            cell={cell}
            jobs={jobsByDate.get(cell.date) ?? []}
            milestones={milestonesByDate.get(cell.date) ?? []}
            projectName={projectName}
            today={today}
            onOpenProject={onOpenProject}
            onOpenDay={onOpenDay}
            onAddJob={onAddJob}
            onOpenJob={onOpenJob}
            pendingId={pendingId}
            holidays={holidays}
          />
        ))}
      </div>
    </div>
  );
}

// A calendar day cell: a drop target for rescheduling jobs to this day (drag-drop
// parity with the Week board), holding milestone + draggable job chips.
function MonthDayCell({
  cell,
  jobs,
  milestones,
  projectName,
  today,
  onOpenProject,
  onOpenDay,
  onAddJob,
  onOpenJob,
  pendingId,
  holidays
}: {
  cell: ScheduleMonthCell;
  jobs: Job[];
  milestones: ScheduleMilestone[];
  projectName: (id: string) => string;
  today: string;
  onOpenProject: (projectId: string) => void;
  onOpenDay: (date: string) => void;
  onAddJob: (date: string) => void;
  onOpenJob?: (job: Job) => void;
  pendingId?: string | null;
  /** date → name, from Settings › Work calendar. */
  holidays: Record<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `month-${cell.date}`, data: { date: cell.date } });
  const total = jobs.length + milestones.length;
  const shownMilestones = milestones.slice(0, 1);
  const jobRoom = Math.max(0, 3 - shownMilestones.length);
  const shownJobs = jobs.slice(0, jobRoom);
  const extra = total - shownMilestones.length - shownJobs.length;
  const holiday = holidays[cell.date];
  return (
    <div
      ref={setNodeRef}
      className={`sched-cal-cell${cell.inMonth ? "" : " out-month"}${cell.weekend ? " is-weekend" : ""}${
        cell.date === today ? " is-today" : ""
      }${holiday ? " is-holiday" : ""}${isOver ? " drop-over" : ""}${cell.inMonth ? " is-addable" : ""}`}
      style={{ "--d": cell.weekIndex } as CSSProperties}
      // Click the empty part of an in-month day to add a job there — the Week
      // board's click-to-add, brought to the calendar. `target === currentTarget`
      // keeps chip/button clicks (and drags) from triggering it.
      onClick={
        cell.inMonth
          ? (event) => {
              if (event.target === event.currentTarget) onAddJob(cell.date);
            }
          : undefined
      }
    >
      <span className="sched-cal-daynum">{cell.dayNum}</span>
      {holiday && <span className="sched-holiday-tag">{holiday}</span>}
      {shownMilestones.map((milestone) => (
        <div
          key={milestone.id}
          className="sched-act is-milestone"
          style={{ "--sc-tone": "var(--sc-milestone)" } as CSSProperties}
          title={milestone.title}
        >
          <span className="sched-act-dot" />
          <span className="sched-act-text">
            <strong>{milestone.title}</strong>
            <em>{milestone.project}</em>
          </span>
        </div>
      ))}
      {shownJobs.map((job) => (
        <MonthJobChip
          key={job.id}
          job={job}
          subtitle={projectName(job.projectId) || job.location}
          onOpenProject={onOpenProject}
          onOpenJob={onOpenJob}
          pending={pendingId === job.id}
        />
      ))}
      {extra > 0 && (
        <button type="button" className="sched-act-more" onClick={() => onOpenDay(cell.date)}>
          +{extra} more
        </button>
      )}
      {cell.inMonth && (
        <button
          type="button"
          className="sched-cal-add"
          onClick={() => onAddJob(cell.date)}
          aria-label={`Add a job on ${formatScheduleDate(cell.date)}`}
          title="Add a job on this day"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

// A draggable job chip on the month calendar. Drag it onto another day to
// reschedule; a plain click (no drag) opens the job's project or, on the sub-page, its drawer.
function MonthJobChip({
  job,
  subtitle,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  subtitle: string;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pending?: boolean;
}) {
  const tone = tradeForText(`${job.phase} ${job.name}`);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `month-job-${job.id}`,
    data: { jobId: job.id, date: job.startDate }
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
      className={`sched-act${isDragging ? " dragging" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      aria-busy={pending || undefined}
      style={style}
      onClick={() => (onOpenJob ? onOpenJob(job) : onOpenProject(job.projectId))}
      title={`${job.name} · ${job.phase}`}
      {...listeners}
      {...attributes}
    >
      <span className="sched-act-dot" />
      <span className="sched-act-text">
        <strong>{job.name}</strong>
        <em>{live ? liveChangeLabel(live) : subtitle}</em>
      </span>
    </button>
  );
}

export function ScheduleTradeLegend() {
  return (
    <div className="sched-trade-legend" aria-label="Trade colors">
      {TRADE_ORDER.map((trade) => (
        <span key={trade.key}>
          <i className={trade.key === "milestone" ? "milestone" : ""} style={{ background: `var(--sc-${trade.key})` }} />
          {trade.label}
        </span>
      ))}
    </div>
  );
}
