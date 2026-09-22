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
import { useMemo, type ReactNode } from "react";
import { useDroppable, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BootstrapPayload, Crew, Job, ScheduleAssignment } from "@buildflow/shared";
import { rebookSchedule } from "../../api";
import { ScheduleBadge, ScheduleCarryLayer, WEEK_DAYS, dayOf, formatScheduleDate } from "../parts";
import { addDays, toIsoDate } from "../../components/ui/gantt";
import { liveChangeLabel, useLiveChange } from "../live";
import { scheduleAccessibility, spokenDay } from "../dragKeyboard";
import { listRebook } from "../rebook";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, ThisWeekButton, WeekStepper, useSchedulePage } from "../page";
import { insertInGroup, moveInGroup, orderGroupItems, placeInGroup } from "../boardOrder";
import { useBoardOrder, useHoverFor, type HoverStore } from "../useBoardOrder";
import type { CSSProperties } from "react";

type Row = { assignment: ScheduleAssignment; job: Job; crew: Crew; day: string };

/** The planner's own order for each day, kept per person (../boardOrder). */
const LIST_ORDER_KEY = "schedule:list-order";
const rowId = (row: Row) => row.assignment.id;

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
  /* A DAY IS A LIST THE PLANNER ARRANGES, not just a drop target (the Kanban's arrangement, asked
     for on the other Schedule boards 2026-09-18). Time order is still what a day starts in; once a
     row is carried between two others, that placement is the person's own and is kept. */
  const {
    order,
    persist: persistOrder,
    hoverStore,
    readHover,
    trackHover,
    clearHover
  } = useBoardOrder({
    settingKey: LIST_ORDER_KEY,
    raw: data.userSettings?.[LIST_ORDER_KEY] ?? null
  });

  // every day of the week is a section — and a drop target — even with nothing booked on it
  const days = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
    return Array.from({ length: WEEK_DAYS }, (_, index) => {
      const day = toIsoDate(addDays(weekStart, index));
      return [day, byDay.get(day) ?? []] as const;
    });
  }, [rows, weekStart]);

  /** A day's rows in the order it is showing them, which is what a drop rearranges. */
  const dayIds = (day: string) =>
    orderGroupItems(
      rows.filter((row) => row.day === day),
      order[day],
      rowId
    ).map(rowId);

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
  /* A row held over another day is drawn there while it is in the air; inside its own day dnd-kit's
     sortable opens the gap itself, so the preview stays null there. */
  const onDragOver = (event: DragOverEvent) => {
    const dragged = event.active.data.current as { assignmentId?: string; date?: string } | undefined;
    const dropped = event.over?.data.current as { assignmentId?: string; date?: string } | undefined;
    trackHover({ itemId: dragged?.assignmentId, section: dropped?.date, overId: dropped?.assignmentId ?? null, ownSection: dragged?.date });
  };

  /**
   * A drop is one of two things. Inside its own day it is an ORDER — the row takes the place of the
   * one it was dropped on and nothing is asked of the server, because the arrangement is the
   * planner's. Onto another day it re-books, as it always did (one request, which the server checks
   * before it double-books the crew), and the row also keeps the place it was dropped in.
   */
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const held = readHover();
    clearHover();
    const dragged = event.active.data.current as { assignmentId?: string; date?: string } | undefined;
    const dropped = event.over?.data.current as { assignmentId?: string; date?: string } | undefined;
    const assignmentId = dragged?.assignmentId;
    const row = rows.find((candidate) => candidate.assignment.id === assignmentId);
    if (!row || !assignmentId || busy) return;
    const date = dropped?.date;
    if (!date) return;
    /* While a preview is up the row is drawn in the day it is held over, so `over` can be its own
       slot there and its own date prop has moved with it: the preview is then the only thing that
       knows where it came from and where it was going. What you saw is where it goes. */
    const previewing = held?.itemId === assignmentId && held.section === date ? held : null;
    const sourceDay = held?.itemId === assignmentId ? held.from : row.day;
    /* `over` CAN be the row itself — released without having moved, or on the slot it left.
       That is not "no target", it is "this one", which the rules answer by leaving the day
       alone; nulling it here meant the day's own space, which sent it to the END. */
    const overId = previewing ? previewing.overId : (dropped?.assignmentId ?? null);

    if (date === sourceDay) {
      const next = moveInGroup(dayIds(sourceDay), assignmentId, overId);
      if (next.join() === dayIds(sourceDay).join()) return; // dropped back where it was
      await persistOrder({ ...order, [sourceDay]: next });
      return;
    }

    const plan = listRebook(row.assignment.id, row.day, date);
    if (!plan) return;
    // where it lands in the new day is the planner's too, saved before the booking moves
    await persistOrder({ ...order, [date]: insertInGroup(dayIds(date), assignmentId, overId) });
    const label = `${row.crew.name} on ${row.job.name}`;
    await runChange({
      id: row.assignment.id,
      name: row.job.name,
      write: (force) => rebookSchedule(plan.moves, { force }),
      stays: `${row.job.name} stays on ${formatScheduleDate(row.day)}.`,
      done: `${label} moved to ${formatScheduleDate(date)}`,
      // not forced: the day this row is going back to may have been taken in the meantime
      undo: (_result, force) => rebookSchedule(plan.inverse, { force }),
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
      drag={{ accessibility, onDragEnd, onDragOver, onDragCancel: clearHover }}
    >
      {/* the row under the hand. Its rules hang off `.schedule-list-view`, so the layer wears it
          too — a clone of the row would otherwise land in the air with none of its columns. */}
      <ScheduleCarryLayer host="schedule-list-view" />
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
              allRows={rows}
              order={order}
              hoverStore={hoverStore}
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
  allRows,
  order,
  hoverStore,
  holiday,
  selectedId,
  pendingId,
  onOpen
}: {
  day: string;
  label: string;
  /** The holiday this day is, from Settings › Work calendar. */
  holiday?: string;
  /** The rows whose own day this is. What it SHOWS may differ while a row is carried over it. */
  rows: Row[];
  /** Every row in the week, so the one being carried in can be drawn whole. */
  allRows: Row[];
  order?: Record<string, string[]>;
  hoverStore?: HoverStore;
  selectedId: string | null;
  pendingId: string | null;
  onOpen: (assignmentId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list-${day}`, data: { date: day } });
  /* The day arranges ITSELF: the planner's order, plus the row being carried over it, drawn where
     it would land. Subscribed here rather than read on the page, so a row crossing days re-renders
     the day sections and not the page above them — the page's own re-render is what made a
     crossing lag (../useBoardOrder). */
  const hover = useHoverFor(hoverStore, day);
  const carried = hover && hover.itemId !== undefined ? allRows.find((row) => rowId(row) === hover.itemId) : undefined;
  const mine = rows.filter((row) => !carried || rowId(row) !== rowId(carried));
  const ordered = orderGroupItems(mine, order?.[day], rowId);
  const shown = carried && hover?.section === day ? placeInGroup(ordered, carried, hover.overId, rowId) : ordered;
  const isToday = day === toIsoDate(new Date());
  return (
    <div
      ref={setNodeRef}
      className={`sched-list-day${isOver ? " drop-over" : ""}${shown.length === 0 ? " is-empty" : ""}${isToday ? " is-today" : ""}${holiday ? " is-holiday" : ""}`}
    >
      <div className="sched-list-dayhead">
        {label}
        {holiday && <span className="sched-holiday-tag"> · {holiday}</span>}
      </div>
      {shown.length === 0 && <p className="sched-list-quiet">Nothing booked — drop a booking here</p>}
      {/* the gap that opens while a row is carried over these is dnd-kit's own sortable preview,
          and the drop keeps what it showed (../boardOrder) */}
      <SortableContext items={shown.map((row) => row.assignment.id)} strategy={verticalListSortingStrategy}>
        {shown.map((row) => (
          <ListRow
            key={row.assignment.id}
            row={row}
            day={day}
            selected={row.assignment.id === selectedId}
            pending={row.assignment.id === pendingId}
            onOpen={onOpen}
          />
        ))}
      </SortableContext>
    </div>
  );
}

// A draggable row — drag it onto another day section to re-book; a plain click opens the job drawer.
function ListRow({
  row,
  day,
  selected,
  pending,
  onOpen
}: {
  row: Row;
  /** The day section this row is drawn in — its own, or the one it is being carried over. */
  day: string;
  selected: boolean;
  pending: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  /* The row is a sortable item and its id is the BOOKING's id: that is what the day's order is
     written in, and what a drop reads off `over`. Its data names the day it sits in, so a drop on a
     ROW resolves to that row's day the way a drop on the day section does. */
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.assignment.id,
    data: { assignmentId: row.assignment.id, date: day }
  });
  // `dragging` is the slot the row leaves behind; the row in the air is the carry layer's, and the
  // transform is how the OTHER rows move aside to open the gap it will land in
  const live = useLiveChange(row.assignment.id, row.job.id);
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`${selected ? "focused" : ""}${isDragging ? " dragging" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition } as CSSProperties}
      aria-busy={pending || undefined}
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
