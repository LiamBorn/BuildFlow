/**
 * The Month calendar: the six-week grid, its day cells and job chips, milestones and
 * the trade legend.
 */
import type { BootstrapPayload, Job, Project } from "@buildflow/shared";
import { useEffect, useMemo, useRef } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { orderGroupItems, placeInGroup } from "../boardOrder";
import { useHoverFor, type HoverStore } from "../useBoardOrder";
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
  /** What a drop on another day writes: a phase's finish, or the project's target completion. */
  kind: "phase" | "project";
  /** The phase or the project whose date this marker stands for. */
  refId: string;
  /** The first day it may land on — a phase cannot finish before it starts. */
  earliest?: string;
};

export function deriveScheduleMilestones(data: BootstrapPayload): ScheduleMilestone[] {
  const projectName = (id: string) => data.projects.find((project) => project.id === id)?.name ?? "Project";
  const fromPhases = data.phases
    .filter((phase) => phase.endDate)
    .map((phase): ScheduleMilestone => ({
      id: `ms-phase-${phase.id}`,
      title: `${phase.name} Complete`,
      project: projectName(phase.projectId),
      date: phase.endDate,
      tone: "milestone",
      kind: "phase",
      refId: phase.id,
      earliest: phase.startDate
    }));
  const fromProjects = data.projects
    .filter((project) => project.targetCompletion)
    .map((project): ScheduleMilestone => ({
      id: `ms-co-${project.id}`,
      title: "Certificate of Occupancy",
      project: project.name,
      date: project.targetCompletion,
      tone: "milestone",
      kind: "project",
      refId: project.id
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
  onToggleDay,
  onAddJob,
  onOpenJob,
  onOpenMilestone,
  holidays,
  pendingId,
  carrying,
  openDays,
  order,
  hoverStore
}: {
  cells: ScheduleMonthCell[];
  jobsByDate: Map<string, Job[]>;
  milestonesByDate: Map<string, ScheduleMilestone[]>;
  projects: Project[];
  today: string;
  onOpenProject: (projectId: string) => void;
  /** "+N more" / "Show fewer" on a day: the planner asking to see all of it, or less of it. */
  onToggleDay: (date: string) => void;
  onAddJob: (date: string) => void;
  /** When given, a job chip opens this instead of its project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job) => void;
  /** A marker opens its own drawer — the phase's or the project's date is what it edits. */
  onOpenMilestone?: (milestone: ScheduleMilestone) => void;
  /** date → name, from the workspace's work calendar. */
  /** date → name, from Settings › Work calendar. */
  holidays: Record<string, string>;
  /** The job whose move is still being saved. */
  pendingId?: string | null;
  /** A job is in the air: the calendar keeps the closed hand and holds its "+" back. */
  carrying?: boolean;
  /** The days that have been opened up, showing everything on them rather than the first three. */
  openDays?: ReadonlySet<string>;
  /** The planner's own order, date → job ids; the rest of a day keeps the board's order. */
  order?: Record<string, string[]>;
  /** The preview, subscribed to HERE so a chip crossing days re-renders the calendar and not the
      page above it — the page's own re-render is what made a crossing lag (../useBoardOrder). */
  hoverStore?: HoverStore;
}) {
  const calendar = useRef<HTMLDivElement | null>(null);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "";
  // every chip on the calendar, so a day can draw whole the one being carried into it
  const allJobs = useMemo(() => [...jobsByDate.values()].flat(), [jobsByDate]);
  return (
    <div ref={calendar} className={`sched-cal${carrying ? " is-carrying" : ""}`} data-tutorial-id="month-calendar">
      {/* the closed hand, marked on the grid itself — see CarryFlag */}
      <CarryFlag target={calendar} />
      <div className="sched-cal-dow">
        {dayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sched-cal-grid">
        {cells.map((cell) =>
          /* The places padding the first and last week are a place in the grid and nothing else:
             the columns stay under their weekday, and the month shows only its own days. */
          cell.inMonth ? (
            <MonthDayCell
              key={cell.date}
              cell={cell}
              jobs={jobsByDate.get(cell.date) ?? []}
              allJobs={allJobs}
              order={order?.[cell.date]}
              hoverStore={hoverStore}
              milestones={milestonesByDate.get(cell.date) ?? []}
              projectName={projectName}
              today={today}
              onOpenProject={onOpenProject}
              onToggleDay={onToggleDay}
              open={openDays?.has(cell.date) ?? false}
              onAddJob={onAddJob}
              onOpenJob={onOpenJob}
              onOpenMilestone={onOpenMilestone}
              pendingId={pendingId}
              holidays={holidays}
            />
          ) : (
            <div key={cell.date} className="sched-cal-blank" aria-hidden="true" />
          )
        )}
      </div>
    </div>
  );
}

/** How many chips a day shows before it offers to open up. */
const DAY_ROOM = 3;
const jobKey = (job: Job) => job.id;

// A calendar day cell: a drop target for rescheduling jobs to this day, holding
// milestone + draggable job chips.
function MonthDayCell({
  cell,
  jobs,
  allJobs,
  order,
  hoverStore,
  milestones,
  projectName,
  today,
  onOpenProject,
  onToggleDay,
  onAddJob,
  onOpenJob,
  onOpenMilestone,
  pendingId,
  holidays,
  open
}: {
  cell: ScheduleMonthCell;
  /** The jobs whose own day this is. What it SHOWS may differ while a chip is carried over it. */
  jobs: Job[];
  /** Every chip on the calendar, so the one being carried in can be drawn whole. */
  allJobs?: Job[];
  /** The planner's own order for THIS day. */
  order?: string[];
  hoverStore?: HoverStore;
  milestones: ScheduleMilestone[];
  projectName: (id: string) => string;
  today: string;
  onOpenProject: (projectId: string) => void;
  onToggleDay: (date: string) => void;
  onAddJob: (date: string) => void;
  onOpenJob?: (job: Job) => void;
  /** A marker opens its own drawer — the phase's or the project's date is what it edits. */
  onOpenMilestone?: (milestone: ScheduleMilestone) => void;
  pendingId?: string | null;
  /** date → name, from Settings › Work calendar. */
  holidays: Record<string, string>;
  /** Everything on this day is on the page, however many that is. */
  open: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `month-${cell.date}`, data: { date: cell.date } });
  /* THE DAY ARRANGES ITSELF: the planner's order, plus the chip being carried over it, drawn where
     it would land. It subscribes only to a preview that concerns THIS day, so a chip crossing the
     calendar re-renders the two days it is between and none of the other thirty. */
  const hover = useHoverFor(hoverStore, cell.date);
  /* MEMOISED BECAUSE THIS RUNS A LOT. Every cell owns a dnd-kit droppable, and dnd-kit republishes
     its context on every pointer move — so all thirty cells re-render on every move of a drag, not
     just the two a crossing concerns. Measured: 1,020 cell renders in one drag, ~25 per move, which
     is where the Month's long tasks (50-190ms) came from; the Kanban never noticed because it has
     five lanes, not thirty. The work below only depends on things that change when the drag CROSSES
     a day, so between crossings each of those renders now reuses this. */
  const all = useMemo(() => {
    const carried = hover ? allJobs?.find((job) => job.id === hover.itemId) : undefined;
    const mine = jobs.filter((job) => !carried || job.id !== carried.id);
    const ordered = orderGroupItems(mine, order, jobKey);
    return carried && hover?.section === cell.date ? placeInGroup(ordered, carried, hover.overId, jobKey) : ordered;
  }, [jobs, allJobs, order, hover, cell.date]);
  const total = all.length + milestones.length;
  /* JOBS TAKE THE ROOM FIRST, and an opened day keeps none back. A job is the thing a planner
     picks up, and a job behind a "+2 more" could only be read about — so the markers, which are
     there to be seen and not moved, are the ones that give up a slot on a busy day. */
  const shownJobs = useMemo(() => (open ? all : all.slice(0, DAY_ROOM)), [open, all]);
  const shownMilestones = useMemo(
    () => (open ? milestones : milestones.slice(0, Math.max(0, DAY_ROOM - shownJobs.length))),
    [open, milestones, shownJobs.length]
  );
  const hidden = total - shownJobs.length - shownMilestones.length;
  const holiday = holidays[cell.date];
  const inside = useMemo(
    () => (
      <>
        <span className="sched-cal-daynum">{cell.dayNum}</span>
        {holiday && <span className="sched-holiday-tag">{holiday}</span>}
        {/* the work first, then the day's markers: the jobs are what the day is for */}
        {/* the gap that opens while a chip is carried over these is dnd-kit's own sortable preview,
              and the drop keeps what it showed (../boardOrder). The markers below are not in it: they
              are there to be read, not arranged. */}
        <SortableContext items={shownJobs.map((job) => job.id)} strategy={verticalListSortingStrategy}>
          {shownJobs.map((job) => (
            <MonthJobChip
              key={job.id}
              job={job}
              day={cell.date}
              subtitle={projectName(job.projectId) || job.location}
              onOpenProject={onOpenProject}
              onOpenJob={onOpenJob}
              pending={pendingId === job.id}
            />
          ))}
        </SortableContext>
        {shownMilestones.map((milestone) => (
          <MonthMilestoneChip
            key={milestone.id}
            milestone={milestone}
            onOpen={onOpenMilestone}
            pending={pendingId === milestone.id}
          />
        ))}
        {(hidden > 0 || open) && (
          <button
            type="button"
            className="sched-act-more"
            aria-expanded={open}
            onClick={() => onToggleDay(cell.date)}
            title={open ? "Show fewer on this day" : `Show all ${total} on ${formatScheduleDate(cell.date)}`}
          >
            {open ? "Show fewer" : `+${hidden} more`}
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
      </>
    ),
    [
      cell.dayNum,
      cell.date,
      holiday,
      shownJobs,
      shownMilestones,
      hidden,
      open,
      total,
      projectName,
      onOpenProject,
      onOpenJob,
  onOpenMilestone,
      onToggleDay,
      pendingId
    ]
  );

  return (
    <div
      ref={setNodeRef}
      data-date={cell.date}
      className={`sched-cal-cell${cell.weekend ? " is-weekend" : ""}${cell.date === today ? " is-today" : ""}${
        holiday ? " is-holiday" : ""
      }${isOver ? " drop-over" : ""}${cell.inMonth ? " is-addable" : ""}${open ? " is-open" : ""}`}
      style={{ "--d": cell.weekIndex } as CSSProperties}
      // Click the empty part of an in-month day to add a job there. `target === currentTarget`
      // keeps chip/button clicks (and drags) from triggering it.
      onClick={
        cell.inMonth
          ? (event) => {
              if (event.target === event.currentTarget) onAddJob(cell.date);
            }
          : undefined
      }
    >
      {inside}
    </div>
  );
}

/** A chip's two lines. The card the pointer carries wears the same face, so nothing changes shape when it lifts. */
function MonthChipFace({ title, caption }: { title: string; caption: string }) {
  return (
    <>
      <span className="sched-act-dot" />
      <span className="sched-act-text">
        <strong>{title}</strong>
        <em>{caption}</em>
      </span>
    </>
  );
}

// A draggable job chip on the month calendar. Drag it onto another day to
// reschedule; a plain click (no drag) opens the job's project or, on the sub-page, its drawer.
function MonthJobChip({
  job,
  day,
  subtitle,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  /** The day this chip is drawn in — its own, or the one it is being carried over. */
  day: string;
  subtitle: string;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job) => void;
  pending?: boolean;
}) {
  const tone = tradeForText(`${job.phase} ${job.name}`);
  /* A sortable item keyed on the JOB's id: that is what a day's order is written in and what a drop
     reads off `over`. `date` is the day it is DRAWN in, so a drop on a CHIP resolves to that chip's
     day the way a drop on the day itself does. */
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { jobId: job.id, date: day }
  });
  const live = useLiveChange(job.id);
  return (
    <button
      type="button"
      ref={setNodeRef}
      /* `dragging` is the SLOT the card left behind, not the card: the lifted one is the
         overlay below, so this chip keeps its place in the day, dashed and empty. */
      className={`sched-act${isDragging ? " dragging" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      aria-busy={pending || undefined}
      style={{ "--sc-tone": tradeColorVar(tone), transform: CSS.Transform.toString(transform), transition } as CSSProperties}
      onClick={() => (onOpenJob ? onOpenJob(job) : onOpenProject(job.projectId))}
      title={`${job.name} · ${job.phase}`}
      {...listeners}
      {...attributes}
    >
      <MonthChipFace title={job.name} caption={live ? liveChangeLabel(live) : subtitle} />
    </button>
  );
}

/**
 * A day's marker: a phase's finish, or a project's completion. It is dragged exactly like a job
 * chip — dropping it on another day moves the date it stands for — and, since 2026-09-20, it
 * OPENS like one too. It used to be a `<div>` with no handler, on the reasoning that "a date is
 * all it is"; reported with a clip as "users are only able to open up a select amount of jobs to
 * edit them", because on the month shown 14 of the 20 chips were markers and none of them
 * answered a click. A date is still something you edit, and nothing about the chip says that it
 * is a different kind of thing. The square dot is what tells it apart from a job.
 *
 * A BUTTON, like the job chip, so it can also be reached by keyboard — a div with a click
 * handler cannot be tabbed to or pressed with Enter.
 */
function MonthMilestoneChip({
  milestone,
  onOpen,
  pending = false
}: {
  milestone: ScheduleMilestone;
  onOpen?: (milestone: ScheduleMilestone) => void;
  pending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `month-ms-${milestone.id}`,
    data: { milestoneId: milestone.id, date: milestone.date }
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`sched-act is-milestone${isDragging ? " dragging" : ""}${pending ? " is-pending" : ""}`}
      aria-busy={pending || undefined}
      style={{ "--sc-tone": "var(--sc-milestone)" } as CSSProperties}
      onClick={() => onOpen?.(milestone)}
      title={`${milestone.title} · ${milestone.project}`}
      {...listeners}
      {...attributes}
    >
      <MonthChipFace title={milestone.title} caption={milestone.project} />
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

/**
 * WHILE A CHIP IS IN THE AIR the calendar wears `is-carrying` — the closed hand, and its "+" held
 * back. That used to be a `useState` on the page, and flipping it re-rendered the whole Month page
 * at the moment the drag began: measured 2026-09-18 as ~50-70ms of a 99-129ms stall, 20ms after the
 * first move, which is the hitch felt when picking a job up. It is one CLASS on one element, so it
 * is set on that element instead. This component renders nothing; it re-renders as dnd-kit's
 * context changes, and the effect below only runs when a drag actually starts or ends.
 */
function CarryFlag({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  const carrying = Boolean(useDndContext().active);
  useEffect(() => {
    const node = target.current;
    if (!node) return;
    node.classList.toggle("is-carrying", carrying);
    return () => node.classList.remove("is-carrying");
  }, [carrying, target]);
  return null;
}
