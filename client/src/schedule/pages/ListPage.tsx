/**
 * List — the Schedule hub's day-by-day list of bookings: the Schedule page's
 * List view as its own sub-page beside Week and Gantt Chart. Every crew-day
 * booking in the shown week sits under its day in time order — time, job,
 * crew, status. Drag a row onto another day to re-book it (one request the
 * server checks for clashes); click a row for the job drawer the other
 * sub-pages use.
 *
 * Stands in the shared page frame (schedule/page.tsx): everything the seven
 * pages share comes from the one page hook; this file is the board and its
 * drop rule.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BootstrapPayload, Crew, Job, ScheduleAssignment } from "@buildflow/shared";
import { rebookSchedule } from "../../api";
import { ScheduleBadge, WEEK_DAYS, dayOf, formatScheduleDate } from "../parts";
import { addDays, toIsoDate } from "../../components/ui/gantt";
import { liveChangeLabel, useLiveChange } from "../live";
import { scheduleAccessibility, spokenDay } from "../dragKeyboard";
import { listRebook } from "../rebook";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, ThisWeekButton, WeekStepper, useSchedulePage } from "../page";

type Row = { assignment: ScheduleAssignment; job: Job; crew: Crew; day: string };

export type ListPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** Opens the page an alert points at (the Week board, DelayIQs, Materials, the Map). */
  onOpenPage?: (page: ScheduleTarget) => void;
  /** The "New" pill the navigation shows for a fresh release. */
  releaseTag?: ReactNode;
};

export function ListPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: ListPageProps) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "list" });
  const {
    data,
    scope,
    crews,
    weekStart,
    weekStartIso,
    weekEndIso,
    weekIso,
    weekRange,
    holidays,
    jobsById,
    crewsById,
    selectedAssignmentId,
    openBooking,
    suppressClick,
    releaseClick,
    busy,
    pendingId,
    runChange,
    say
  } = page;

  const rows = useMemo<Row[]>(
    () =>
      scope.assignments
        .map((assignment) => {
          const job = jobsById.get(assignment.jobId);
          const crew = crewsById.get(assignment.crewId);
          return job && crew ? { assignment, job, crew, day: dayOf(assignment) } : null;
        })
        .filter((row): row is Row => row !== null)
        .filter((row) => row.day >= weekStartIso && row.day <= weekEndIso)
        .sort((left, right) => `${left.day}-${left.job.startTime}`.localeCompare(`${right.day}-${right.job.startTime}`)),
    [scope.assignments, jobsById, crewsById, weekStartIso, weekEndIso]
  );
  // every day of the week is a section — and a drop target — even with nothing booked on it
  const days = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
    return Array.from({ length: WEEK_DAYS }, (_, index) => {
      const day = toIsoDate(addDays(weekStart, index));
      return [day, byDay.get(day) ?? []] as const;
    });
  }, [rows, weekStart]);

  // the live announcements name the job, the crew and the day
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) => {
          const row = rows.find((candidate) => candidate.assignment.id === item?.assignmentId);
          return row ? `${row.job.name} for ${row.crew.name} on ${spokenDay(row.day)}` : "Booking";
        },
        over: (day) => spokenDay(String(day?.date))
      }),
    [rows]
  );
  // A row dropped on another day re-books it — one request, and the server asks before it double-books the crew.
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const assignmentId = event.active.data.current?.assignmentId as string | undefined;
    const date = event.over?.data.current?.date as string | undefined;
    const row = rows.find((candidate) => candidate.assignment.id === assignmentId);
    const plan = row && date && !busy ? listRebook(row.assignment.id, row.day, date) : null;
    if (!row || !date || !plan) return;
    const label = `${row.crew.name} on ${row.job.name}`;
    await runChange({
      id: row.assignment.id,
      name: row.job.name,
      write: (force) => rebookSchedule(plan.moves, { force }),
      stays: `${row.job.name} stays on ${formatScheduleDate(row.day)}.`,
      done: `${label} moved to ${formatScheduleDate(date)}`,
      undo: () => rebookSchedule(plan.inverse, { force: true }),
      undone: `${label} back on ${formatScheduleDate(row.day)}`
    });
  };

  return (
    <SchedulePageFrame
      page={page}
      pageClass="list-page"
      eyebrow={<>Crew Scheduling · {weekRange}</>}
      title="List"
      titleTutorialId="list-page-title"
      sub="Every crew booking this week, in time order. Drag a row onto another day to re-book it."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <>
          <div className="filter-strip">
            <WeekStepper page={page} />
          </div>
          <div className="filter-strip list-actions">
            <ScheduleExportMenu
              scope={{
                jobs: scope.jobs,
                assignments: rows.map((row) => row.assignment),
                crews,
                projects: data.projects,
                window: { start: weekStartIso, end: weekEndIso }
              }}
              weekDays={weekIso}
              sheetTitle={`Week of ${weekRange}`}
              filename={`buildflow-list-${weekStartIso}`}
              buttonClassName="outline-button"
              onNotice={say}
            />
            <ThisWeekButton page={page} />
            <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
          </div>
        </>
      }
      boardLabel="Bookings this week"
      boardTutorialId="list-days"
      drag={{ accessibility, onDragEnd }}
    >
      {rows.length === 0 ? (
        <div className="schedule-list-empty">
          <strong>Nothing booked this week.</strong>
          <span>
            {data.assignments.length === 0
              ? "Book crews on the Schedule page and their days show up here."
              : "No bookings match this week and these filters — step to another week or clear a filter."}
          </span>
        </div>
      ) : (
        <div className={`schedule-list-view${busy ? " is-busy" : ""}`}>
          <header>
            <span>Time</span>
            <span>Job</span>
            <span>Crew</span>
            <span>Status</span>
          </header>
          {days.map(([day, list]) => (
            <ListDay
              key={day}
              day={day}
              label={`${new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })} · ${formatScheduleDate(day)}`}
              rows={list}
              holiday={holidays[day]}
              selectedId={selectedAssignmentId}
              pendingId={pendingId}
              onOpen={(id) => {
                if (suppressClick.current) return;
                const row = rows.find((candidate) => candidate.assignment.id === id);
                if (row) openBooking(row.assignment);
              }}
            />
          ))}
        </div>
      )}
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
      </footer>
    </SchedulePageFrame>
  );
}

// A day section — a drop target for moving a booking onto this day.
function ListDay({
  day,
  label,
  rows,
  holiday,
  selectedId,
  pendingId,
  onOpen
}: {
  day: string;
  label: string;
  /** The holiday this day is, from Settings › Work calendar. */
  holiday?: string;
  rows: Row[];
  selectedId: string | null;
  pendingId: string | null;
  onOpen: (assignmentId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list-${day}`, data: { date: day } });
  const isToday = day === toIsoDate(new Date());
  return (
    <div
      ref={setNodeRef}
      className={`sched-list-day${isOver ? " drop-over" : ""}${rows.length === 0 ? " is-empty" : ""}${isToday ? " is-today" : ""}${holiday ? " is-holiday" : ""}`}
    >
      <div className="sched-list-dayhead">
        {label}
        {holiday && <span className="sched-holiday-tag"> · {holiday}</span>}
      </div>
      {rows.length === 0 && <p className="sched-list-quiet">Nothing booked — drop a booking here</p>}
      {rows.map((row) => (
        <ListRow
          key={row.assignment.id}
          row={row}
          selected={row.assignment.id === selectedId}
          pending={row.assignment.id === pendingId}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// A draggable row — drag it onto another day section to re-book; a plain click opens the job drawer.
function ListRow({
  row,
  selected,
  pending,
  onOpen
}: {
  row: Row;
  selected: boolean;
  pending: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `list-assignment-${row.assignment.id}`,
    data: { assignmentId: row.assignment.id }
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    ...(isDragging ? { opacity: 0.55, zIndex: 30, position: "relative" } : {})
  };
  const live = useLiveChange(row.assignment.id, row.job.id);
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`${selected ? "focused" : ""}${isDragging ? " dragging" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      aria-busy={pending || undefined}
      style={style}
      onClick={() => onOpen(row.assignment.id)}
      aria-label={`Open ${row.job.name} for ${row.crew.name}`}
      {...listeners}
      {...attributes}
    >
      {live && <span className="sched-live-by">{liveChangeLabel(live)}</span>}
      <span>
        <strong>
          {row.job.startTime} - {row.job.endTime}
        </strong>
      </span>
      <span>
        <strong>{row.job.name}</strong>
        <em>{row.job.phase}</em>
      </span>
      <span>
        <strong>{row.crew.name}</strong>
        <em>{row.job.location}</em>
      </span>
      <ScheduleBadge status={row.job.status} />
    </button>
  );
}
