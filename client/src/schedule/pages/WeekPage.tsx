/**
 * Week — the Schedule hub's crew-by-day board as its own sub-page beside List
 * and Gantt Chart: the Schedule page's Week view. One row per crew, seven day
 * columns, a card per booked job. Drag a card to another cell to re-book it
 * (one request the server checks for clashes), "Add job" opens the same
 * scheduling form, and a card opens the job drawer the other sub-pages use.
 *
 * Stands in the shared page frame (schedule/page.tsx): everything the seven
 * pages share comes from the one page hook; this file is the board, its queue
 * and rail, and its drop rule.
 */
import { useMemo, useRef, useState, type ReactNode, useEffect } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Crew, ScheduleAssignment, BootstrapPayload } from "@buildflow/shared";
import { rebookSchedule } from "../../api";
import { cellKey, indexAssignmentsByCell } from "../scheduleUtils";
import {
  CrewLabel,
  DraggableJob,
  ScheduleCell,
  crewWeekUtilization,
  workingDays,
  formatScheduleDate,
  plural,
  ScheduleNotice
} from "../parts";
import { ScheduleAlertsPanel } from "../alerts";
import { scheduleAccessibility, spokenDay } from "../dragKeyboard";
import { isWorkingDay } from "@buildflow/shared";
import { ScheduleExportMenu } from "../ExportMenu";
import { weekRebook, type WeekDragSource, type WeekDropTarget } from "../rebook";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, ThisWeekButton, WeekStepper, useSchedulePage } from "../page";

export type WeekPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** Opens the page an alert points at (the Week board, DelayIQs, Materials, the Map). */
  onOpenPage?: (page: ScheduleTarget) => void;
  /** The "New" pill the navigation shows for a fresh release. */
  releaseTag?: ReactNode;
};

const NO_BOOKINGS: ScheduleAssignment[] = [];
/** Crew rows always rendered; rows past these fill in as they scroll near, so a 40-crew board is not 40 rows of cards at once. */
const EAGER_ROWS = 12;
/** Queue chips shown before asking for more. */
const QUEUE_WINDOW = 30;

/** A crew row that is only its label and empty cells until it is near the viewport (or on a browser without IntersectionObserver). */
function LazyCrewRow({
  eager,
  crew,
  utilization,
  children
}: {
  eager: boolean;
  crew: Crew;
  utilization: number;
  children: () => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(eager || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  if (near) return <>{children()}</>;
  return (
    <div className="crew-row is-lazy" ref={ref} data-crew-id={crew.id}>
      <CrewLabel crew={crew} utilization={utilization} />
      {/* one placeholder across the week, not seven: a row that is not near the viewport is only its height */}
      <div className="schedule-cell empty is-week" />
    </div>
  );
}

export function WeekPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: WeekPageProps) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "week" });
  const {
    data,
    jobs,
    crews,
    weekDays,
    weekIso,
    weekStartIso,
    weekEndIso,
    weekRange,
    weekAssignments,
    unassigned,
    calendar,
    holidays,
    alerts,
    openAlert,
    notice,
    news,
    crewsById,
    jobsById,
    selectedJob,
    openBooking,
    suppressClick,
    releaseClick,
    busy,
    pendingId,
    runChange,
    openPicker,
    newActivity,
    say
  } = page;

  // the queue: jobs with no crew booked yet — or, when every job has one, planned work that can take more days
  const queueJobs = useMemo(
    () =>
      unassigned.length > 0 ? unassigned : jobs.filter((job) => ["Planned", "Ready", "Ready to Start"].includes(job.status)).slice(0, 5),
    [unassigned, jobs]
  );
  const queueIsPlannedWork = unassigned.length === 0 && queueJobs.length > 0;
  const [queueLimit, setQueueLimit] = useState(QUEUE_WINDOW);
  const queueShown = queueJobs.length > queueLimit ? queueJobs.slice(0, queueLimit) : queueJobs;
  const workingDayCount = workingDays(weekIso, calendar).length;
  // the board reads each of its crews × days cells from this index instead of scanning the week's bookings per cell
  const bookingsByCell = useMemo(() => indexAssignmentsByCell(weekAssignments), [weekAssignments]);

  // the live announcements name the job, the crew and the day
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) => {
          const job = data.jobs.find((candidate) => candidate.id === item?.jobId)?.name ?? "Job";
          if (!item?.assignmentId) return `${job} from the queue`;
          return `${job} with ${crewsById.get(String(item.crewId))?.name ?? "crew"} on ${spokenDay(String(item.date))}`;
        },
        over: (cell) => `${crewsById.get(String(cell?.crewId))?.name ?? "crew"} on ${spokenDay(String(cell?.date))}`
      }),
    [data.jobs, crewsById]
  );
  // A card dropped on another cell re-books that assignment; a queued job dropped on a cell books it.
  // One request either way, and the server asks before it double-books a crew.
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const source = (event.active.data.current ?? {}) as WeekDragSource;
    const plan = busy ? null : weekRebook(source, (event.over?.data.current ?? {}) as WeekDropTarget, data.assignments);
    if (!plan) return;
    const { assignmentId, jobId, crewId, date, moves } = plan;
    const { crewId: fromCrewId, date: fromDate } = source;
    const name = data.jobs.find((candidate) => candidate.id === jobId)?.name ?? "Job";
    const crewName = (id: string | undefined) => crewsById.get(String(id))?.name ?? "crew";
    // the job is on that crew's day already: one booking, so there is nothing to write
    if (plan.kind === "already") {
      say(`${name} is already booked with ${crewName(crewId)} on ${formatScheduleDate(date)}.`);
      return;
    }
    // the way back: a moved card knows its origin, a fresh booking is unbooked once the server has named it
    const canUndo = plan.kind === "book" || plan.inverse(undefined).length > 0;
    await runChange({
      id: assignmentId ?? jobId,
      name,
      verb: assignmentId ? "move" : "book",
      write: (force) => rebookSchedule(moves, { force }),
      stays: `${name} stays where it was.`,
      done: assignmentId
        ? `${name} moved to ${crewName(crewId)} on ${formatScheduleDate(date)}`
        : `${name} booked with ${crewName(crewId)} on ${formatScheduleDate(date)}`,
      // not forced: the crew-day this card is going back to may have been taken in the meantime
      undo: canUndo ? (result, force) => rebookSchedule(plan.inverse(assignmentId ?? result.assignments[0]?.id), { force }) : null,
      undone: assignmentId
        ? `${name} back with ${crewName(fromCrewId)} on ${fromDate ? formatScheduleDate(fromDate) : "its day"}`
        : `${name} unbooked again`,
      undoId: (result) => assignmentId ?? result.assignments[0]?.id ?? jobId
    });
  };

  return (
    <SchedulePageFrame
      page={page}
      pageClass="week-page"
      eyebrow={<>Crew Scheduling · {weekRange}</>}
      title="Week"
      titleTutorialId="week-page-title"
      sub="Every crew across the week. Drag a job to another crew or day to re-book it, or add one straight into a cell."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <>
          <div className="filter-strip">
            <WeekStepper page={page} />
          </div>
          <div className="filter-strip week-actions">
            <ThisWeekButton page={page} />
            <ScheduleExportMenu
              scope={{
                jobs,
                assignments: weekAssignments,
                crews,
                projects: data.projects,
                window: { start: weekStartIso, end: weekEndIso }
              }}
              weekDays={weekIso}
              sheetTitle={`Week of ${weekRange}`}
              filename={`buildflow-week-${weekStartIso}`}
              buttonClassName="outline-button"
              onNotice={say}
            />
            <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
            <button type="button" className="sched-new-activity" onClick={newActivity}>
              <Plus size={16} /> New Activity
            </button>
          </div>
        </>
      }
      board={false}
      alerts={false}
      drag={{ accessibility, onDragEnd }}
    >
      <div className="schedule-layout">
        <section className="schedule-board" aria-label="Crew schedule for the week" data-tutorial-id="schedule-board">
          <ScheduleNotice notice={notice} news={news} />
          <div className="schedule-week-scroll">
            <div className="schedule-header">
              <span>{plural(crews.length, "Crew")}</span>
              {weekDays.map((day) => {
                const holiday = holidays[day.date];
                const off = !isWorkingDay(day.date, calendar);
                return (
                  <strong key={day.date} className={`${holiday ? "is-holiday" : ""}${off ? " is-off" : ""}`.trim() || undefined}>
                    {day.day}
                    <em>{day.label}</em>
                    {holiday && <span className="sched-holiday-tag">{holiday}</span>}
                  </strong>
                );
              })}
            </div>
            {crews.map((crew, index) => {
              const utilization = crewWeekUtilization(crew, weekAssignments, workingDayCount);
              return (
                <LazyCrewRow key={crew.id} eager={index < EAGER_ROWS} crew={crew} utilization={utilization}>
                  {() => (
                    <div className="crew-row">
                      <CrewLabel crew={crew} utilization={utilization} />
                      {weekDays.map((day) => (
                        <ScheduleCell
                          key={`${crew.id}-${day.date}`}
                          crew={crew}
                          date={day.date}
                          holiday={holidays[day.date]}
                          off={!isWorkingDay(day.date, calendar)}
                          assignments={bookingsByCell.get(cellKey(crew.id, day.date)) ?? NO_BOOKINGS}
                          jobsById={jobsById}
                          jobs={jobs}
                          focusedJobId={selectedJob?.id ?? null}
                          onOpenProject={() => undefined}
                          onOpenJob={(_job, assignment) => {
                            if (!suppressClick.current) openBooking(assignment);
                          }}
                          onOpenJobPicker={openPicker}
                          pendingId={pendingId}
                        />
                      ))}
                    </div>
                  )}
                </LazyCrewRow>
              );
            })}
          </div>
          {crews.length === 0 && (
            <div className="schedule-empty-state">
              <strong>{data.crews.length === 0 ? "No crews created yet." : "No crews match these filters."}</strong>
              <span>{data.crews.length === 0 ? "Add crews before scheduling jobs." : "Clear a filter or choose another crew type."}</span>
              {data.crews.length === 0 && (
                <button type="button" className="sched-book" onClick={onOpenSchedule}>
                  Set up your schedule
                </button>
              )}
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
        </section>
        <aside className="side-stack schedule-side-rail">
          <section className="schedule-side-panel unassigned-panel">
            <header className="schedule-panel-header">
              <h2>{queueIsPlannedWork ? "Planned Work" : "Unassigned Jobs"}</h2>
              <span>{queueJobs.length}</span>
            </header>
            <div className="unassigned-list">
              {queueShown.map((job) => (
                <DraggableJob key={job.id} job={job} />
              ))}
              {queueJobs.length > queueShown.length && (
                <button type="button" className="sched-kan-more" onClick={() => setQueueLimit((current) => current + QUEUE_WINDOW)}>
                  Show {Math.min(QUEUE_WINDOW, queueJobs.length - queueShown.length)} more of {queueJobs.length - queueShown.length}
                </button>
              )}
              <p className="helper-text">
                {queueJobs.length === 0
                  ? "Every job in view has a crew booked."
                  : queueIsPlannedWork
                    ? "Every job has a booking — planned work that can take more crew-days. Drag one onto a day to book it."
                    : "Drag a job onto a crew's day to book it."}
              </p>
            </div>
          </section>
          <ScheduleAlertsPanel alerts={alerts} onOpen={openAlert} />
        </aside>
      </div>
    </SchedulePageFrame>
  );
}
