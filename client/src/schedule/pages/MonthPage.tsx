/**
 * Month — the Schedule hub's calendar as its own sub-page beside Week, List,
 * Kanban, Matrix and Gantt Chart: the Schedule page's Month view. Every job sits
 * on its start day as a trade-coloured card, with milestone diamonds and
 * holidays. Drag a card to another day to move the job (its dates and its crew
 * bookings shift together), click an empty day to add a job there or start one
 * from the header, open a busy day for its full list, and click a card for the
 * job drawer the other sub-pages use. Export writes the month's jobs to CSV.
 *
 * Stands in the shared page frame (schedule/page.tsx): everything the seven
 * pages share comes from the one page hook; this file is the calendar and its
 * drop rule.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import type { BootstrapPayload, Job, Phase, Project } from "@buildflow/shared";
import { projectInput, rebookSchedule, updatePhase, updateProject } from "../../api";
import {
  MilestoneDrawer,
  ScheduleCarryLayer,
  ScheduleMonthView,
  ScheduleTradeLegend,
  buildScheduleMonthCells,
  deriveScheduleMilestones,
  firstOfScheduleMonth,
  formatScheduleDate,
  formatScheduleMonth,
  formatScheduleWeekRange,
  shiftScheduleDate,
  shiftScheduleMonth,
  type MilestoneEdit,
  type ScheduleMilestone
} from "../parts";
import { scheduleAccessibility, spokenDay } from "../dragKeyboard";
import { monthRebook } from "../rebook";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, useSchedulePage } from "../page";
import { insertInGroup, moveInGroup, orderGroupItems } from "../boardOrder";
import { useBoardOrder } from "../useBoardOrder";

/** The planner's own order for each day, kept per person (../boardOrder). */
const MONTH_ORDER_KEY = "schedule:month-order";

export type MonthPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** Opens the page an alert points at (the Week board, DelayIQs, Materials, the Map). */
  onOpenPage?: (page: ScheduleTarget) => void;
  /** The "New" pill the navigation shows for a fresh release. */
  releaseTag?: ReactNode;
};

export function MonthPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: MonthPageProps) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "month" });
  const {
    data,
    scope,
    today,
    monthAnchor,
    setMonthAnchor,
    jobs,
    weekIso,
    calendar,
    holidays,
    openJob,
    suppressClick,
    releaseClick,
    busy,
    pendingId,
    runChange,
    openPicker,
    say
  } = page;
  /* Days the planner has opened up. A busy day used to answer "+2 more" with a dialog that LISTED
     what it was holding, which is the one thing a planner cannot then pick up; it opens where it
     stands instead, and every job on it is a chip like any other. */
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set());
  /** A dropped marker's new day, held until its save comes back — the jobs' `moving`, for markers. */
  const [movingMarker, setMovingMarker] = useState<{ id: string; date: string } | null>(null);
  /* The marker whose drawer is open, kept as an ID rather than the object: markers are derived
     fresh from the payload on every load, so holding one would show the dates as they were
     before the save that just landed. This is `selected` in schedule/page.tsx, for markers. */
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null);
  const toggleDay = useCallback((date: string) => {
    setOpenDays((current) => {
      const next = new Set(current);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  }, []);
  /** The job in the air, from the drag layer. */
  /** A dropped job's new day, held until the save comes back: what the carried card flies into. */
  const [moving, setMoving] = useState<{ id: string; date: string } | null>(null);

  const cells = useMemo(() => buildScheduleMonthCells(monthAnchor, calendar.workingDays), [monthAnchor, calendar.workingDays]);
  const monthLabel = formatScheduleMonth(monthAnchor);
  const monthKey = monthAnchor.slice(0, 7);
  const isThisMonth = monthKey === today.slice(0, 7);
  /* A DAY IS A LIST THE PLANNER ARRANGES, not just a drop target (the Kanban's arrangement, asked
     for on the other Schedule boards 2026-09-18). The arrangement is the person's own setting. */
  const {
    order,
    persist: persistOrder,
    hoverStore,
    readHover,
    trackHover,
    clearHover
  } = useBoardOrder({
    settingKey: MONTH_ORDER_KEY,
    raw: data.userSettings?.[MONTH_ORDER_KEY] ?? null
  });

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    // A job that has just been dropped counts as being on its new day already: the card flies
    // into the chip there instead of back to where it came from, and the chip pulses (is-pending)
    // until the save lands. A refusal or a failure puts it back, and the notice says so.
    for (const job of jobs) {
      const date = moving?.id === job.id ? moving.date : job.startDate;
      map.set(date, [...(map.get(date) ?? []), job]);
    }
    return map;
  }, [jobs, moving]);
  const milestones = useMemo(() => deriveScheduleMilestones(data), [data]);
  const milestonesByDate = useMemo(() => {
    const map = new Map<string, ScheduleMilestone[]>();
    // a marker just dropped stands on its new day while the save runs, like a job's chip does
    for (const milestone of milestones) {
      const date = movingMarker?.id === milestone.id ? movingMarker.date : milestone.date;
      map.set(date, [...(map.get(date) ?? []), { ...milestone, date }]);
    }
    return map;
  }, [milestones, movingMarker]);
  /* Re-read from the derived list every render, so what the drawer shows is what the last save
     wrote. The phase and the project behind it are looked up the same way. */
  const openMarker = openMarkerId ? (milestones.find((candidate) => candidate.id === openMarkerId) ?? null) : null;
  const openPhase = openMarker?.kind === "phase" ? data.phases.find((phase) => phase.id === openMarker.refId) : undefined;
  const openMarkerProject = openMarker
    ? data.projects.find((project) => project.id === (openPhase ? openPhase.projectId : openMarker.refId))
    : undefined;
  const monthJobs = useMemo(() => jobs.filter((job) => job.startDate.slice(0, 7) === monthKey), [jobs, monthKey]);
  // the span the calendar covers, in the same shape the Week board prints its own
  const monthRange = formatScheduleWeekRange([
    { date: `${monthKey}-01` },
    { date: shiftScheduleDate(shiftScheduleMonth(monthAnchor, 1), -1) }
  ]);
  // "Sep 13", split into the stamp's two lines so it reads in the one formatter's locale
  const [todayMonthLabel, todayDayLabel] = formatScheduleDate(today).split(" ");
  // "New job": the same form a day's "+" opens, on the first crew in view — today when
  // the calendar is on this month, and the 1st otherwise, so the job lands in view.
  const newJob = () => {
    const first = scope.crews[0] ?? data.crews[0];
    if (!first) say("Add a crew before scheduling work.", { error: true });
    else openPicker(first.id, isThisMonth ? today : `${monthKey}-01`);
  };

  /** A day's chips in the order it is showing them, which is what a drop rearranges. */
  const dayIds = (date: string) => orderGroupItems(jobsByDate.get(date) ?? [], order[date], (job) => job.id).map((job) => job.id);

  // the live announcements name the job and the day
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) => {
          // a marker names itself; a job names itself and the day its work starts
          const marker = milestones.find((candidate) => candidate.id === item?.milestoneId);
          if (marker) return `${marker.title} on ${spokenDay(String(item?.date))}`;
          return `${data.jobs.find((candidate) => candidate.id === item?.jobId)?.name ?? "Job"} starting ${spokenDay(String(item?.date))}`;
        },
        over: (day) => spokenDay(String(day?.date))
      }),
    [data.jobs, milestones]
  );
  /* A chip held over another day is drawn there while it is in the air; inside its own day dnd-kit's
     sortable opens the gap itself, so the preview stays null there. A MARKER is not arranged — it
     is a date, read and not ordered — so it never previews. */
  const onDragOver = (event: DragOverEvent) => {
    const dragged = event.active.data.current as { jobId?: string; date?: string; milestoneId?: string } | undefined;
    const dropped = event.over?.data.current as { jobId?: string; date?: string } | undefined;
    if (dragged?.milestoneId) return;
    trackHover({ itemId: dragged?.jobId, section: dropped?.date, overId: dropped?.jobId ?? null, ownSection: dragged?.date });
  };

  /**
   * A drop is one of two things. Inside its own day it is an ORDER — the chip takes the place of
   * the one it was dropped on and nothing is asked of the server, because the arrangement is the
   * planner's. Onto another day it moves the job and every booking it has by the same number of
   * days (one request, one transaction, which the server checks before it double-books a crew),
   * and the chip also keeps the place it was dropped in.
   */
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const held = readHover();
    clearHover();
    const dropped = event.over?.data.current as { jobId?: string; date?: string } | undefined;
    const date = dropped?.date;
    if (!date || busy) return;
    const markerId = event.active.data.current?.milestoneId as string | undefined;
    if (markerId) {
      await moveMarker(markerId, date);
      return;
    }
    const jobId = event.active.data.current?.jobId as string | undefined;
    const job = jobId ? data.jobs.find((candidate) => candidate.id === jobId) : undefined;
    if (!job || !jobId) return;
    /* While a preview is up the chip is drawn in the day it is held over, so `over` can be its own
       slot there and its own date prop has moved with it: the preview is then the only thing that
       knows where it came from and where it was going. What you saw is where it goes. */
    const previewing = held?.itemId === jobId && held.section === date ? held : null;
    const sourceDay = held?.itemId === jobId ? held.from : job.startDate;
    /* `over` CAN be the chip itself — released without having moved, or on the slot it left.
       That is not "no target", it is "this one", which the rules answer by leaving the day
       alone; nulling it here meant the day's own space, which sent it to the END. */
    const overId = previewing ? previewing.overId : (dropped?.jobId ?? null);

    // inside its own day: the arrangement, and nothing else
    if (date === sourceDay) {
      const next = moveInGroup(dayIds(sourceDay), jobId, overId);
      if (next.join() === dayIds(sourceDay).join()) return; // dropped back where it was
      await persistOrder({ ...order, [sourceDay]: next });
      return;
    }
    // where it lands in the new day is the planner's too, saved before the job moves
    await persistOrder({ ...order, [date]: insertInGroup(dayIds(date), jobId, overId) });
    // the job and every booking it has, shifted together — and everything as it was, so Undo can put it back exactly
    const plan = monthRebook(job, data.assignments, date);
    if (!plan) return;
    setMoving({ id: job.id, date });
    try {
      await runChange({
        id: job.id,
        name: job.name,
        write: (force) => rebookSchedule(plan.moves, { force }),
        stays: `${job.name} stays on ${formatScheduleDate(job.startDate)}.`,
        done: `${job.name} moved to ${formatScheduleDate(date)}`,
        // not forced: the day this chip is going back to may have been taken in the meantime
        undo: (_result, force) => rebookSchedule(plan.inverse, { force }),
        undone: `${job.name} back on ${formatScheduleDate(job.startDate)}`
      });
    } finally {
      // by now the board has been read back, so the day below is the server's own
      setMoving(null);
    }
  };

  /**
   * THE ONE WRITE A MARKER HAS, whether it was dragged onto a day or typed into the drawer: a
   * phase marker is the phase's own dates, the Certificate of Occupancy is the project's target
   * completion. A drag passes only `endDate`, so the phase's start is left exactly as it is.
   */
  const writeMarker = (marker: ScheduleMilestone, edit: MilestoneEdit): Promise<Phase | Project> => {
    if (marker.kind === "phase") return updatePhase(marker.refId, edit);
    const project = data.projects.find((candidate) => candidate.id === marker.refId);
    if (!project) return Promise.reject(new Error("that project is no longer here"));
    return updateProject(marker.refId, projectInput(project, { targetCompletion: edit.endDate }));
  };

  /**
   * The drawer's Save. It answers IN THE PANEL rather than on the board's notice, which is behind
   * it — the job drawer's rule, for the same reason. No Undo, also like the job drawer: a date
   * typed into a field that is showing you the old one is not the accident a drag is.
   */
  const saveMarker = async (marker: ScheduleMilestone, edit: MilestoneEdit) => {
    try {
      await writeMarker(marker, edit);
      await reload();
      say(`${marker.title} saved`);
      return { saved: true };
    } catch (error) {
      return { saved: false, problem: error instanceof Error ? error.message : "The save could not be sent." };
    }
  };

  /* A marker dropped on another day moves the date it STANDS FOR: a phase's finish, or the
     project's target completion. The work inside the phase keeps its own dates — dragging a
     milestone says when the phase is due, and rescheduling the jobs is the jobs' own gesture. */
  const moveMarker = async (markerId: string, date: string) => {
    const marker = milestones.find((candidate) => candidate.id === markerId);
    if (!marker || marker.date === date) return;
    if (marker.earliest && date < marker.earliest) {
      say(`${marker.title} cannot land before its phase starts on ${formatScheduleDate(marker.earliest)}.`, { error: true });
      return;
    }
    if (marker.kind === "project" && !data.projects.some((candidate) => candidate.id === marker.refId)) return;
    const write = (when: string) => writeMarker(marker, { endDate: when });
    setMovingMarker({ id: marker.id, date });
    try {
      await runChange({
        id: marker.id,
        name: marker.title,
        write: () => write(date),
        stays: `${marker.title} stays on ${formatScheduleDate(marker.date)}.`,
        done: `${marker.title} moved to ${formatScheduleDate(date)}`,
        undo: () => write(marker.date),
        undone: `${marker.title} back on ${formatScheduleDate(marker.date)}`
      });
    } finally {
      setMovingMarker(null);
    }
  };

  return (
    <SchedulePageFrame
      page={page}
      pageClass="month-page"
      eyebrow={<>Crew Scheduling · {monthLabel}</>}
      title="Month"
      titleTutorialId="month-page-title"
      sub="Every job on its start day, with milestones and holidays. Drag any chip to another day — a job takes its crews with it, a milestone moves the date it marks — open a busy day to reach everything on it, or click a day to add a job."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <div className="filter-strip month-actions">
          <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
        </div>
      }
      boardLabel={`Calendar for ${monthLabel}`}
      drag={{ accessibility, onDragEnd, onDragOver, onDragCancel: clearHover }}
    >
      {/* The calendar's header: today as a stamp, the month with the span it covers, then the
          stepper and the one primary action. The stepper is a SEGMENTED group — its three
          buttons share one edge — so Today sits inside .sched-monthnav and the corners are
          declared on the group rather than on the buttons. */}
      <div className="sched-monthbar">
        <div className="sched-monthbar-lead">
          <span className="sched-datestamp">
            <span className="sched-datestamp-month">{todayMonthLabel}</span>
            <span className="sched-datestamp-day">{todayDayLabel}</span>
          </span>
          <span className="sched-monthbar-heading">
            <span className="sched-month-title">{monthLabel}</span>
            <span className="sched-month-range">{monthRange}</span>
          </span>
        </div>
        <div className="sched-monthbar-actions">
          <div className="sched-monthnav">
            <button
              type="button"
              className="sched-icon-btn"
              aria-label="Previous month"
              onClick={() => setMonthAnchor((current) => shiftScheduleMonth(current, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="sched-today-btn"
              onClick={() => setMonthAnchor(firstOfScheduleMonth(today))}
              disabled={isThisMonth}
            >
              Today
            </button>
            <button
              type="button"
              className="sched-icon-btn"
              aria-label="Next month"
              onClick={() => setMonthAnchor((current) => shiftScheduleMonth(current, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="sched-monthbar-rule" aria-hidden="true" />
          <button type="button" className="sched-new-activity" onClick={newJob}>
            <PlusCircle size={16} /> New job
          </button>
        </div>
      </div>
      <ScheduleMonthView
        order={order}
        hoverStore={hoverStore}
        cells={cells}
        jobsByDate={jobsByDate}
        milestonesByDate={milestonesByDate}
        projects={data.projects}
        today={today}
        onOpenProject={() => undefined}
        onToggleDay={toggleDay}
        openDays={openDays}
        onAddJob={(date) => {
          // A grab that ended on the day itself is not an ask for a new job: the click that follows
          // a drag would otherwise open this form over the move that just landed.
          if (suppressClick.current) return;
          // the crew is chosen inside the form; it opens on the first one
          const first = data.crews[0];
          if (first) openPicker(first.id, date);
          else say("Add a crew before scheduling work.", { error: true });
        }}
        pendingId={pendingId}
        holidays={holidays}
        onOpenJob={(job) => {
          if (!suppressClick.current) openJob(job.id);
        }}
        onOpenMilestone={(milestone) => {
          // a grab that ended on the chip is not a click on it — the same guard the job chips use
          if (!suppressClick.current) setOpenMarkerId(milestone.id);
        }}
      />
      <ScheduleCarryLayer />
      {openMarker && (
        <MilestoneDrawer
          milestone={openMarker}
          phase={openPhase}
          project={openMarkerProject}
          onClose={() => setOpenMarkerId(null)}
          onSave={(edit) => saveMarker(openMarker, edit)}
        />
      )}
      <footer className="schedule-board-footer">
        <ScheduleTradeLegend />
        <ScheduleExportMenu
          scope={{
            jobs: monthJobs,
            assignments: scope.assignments,
            crews: scope.crews,
            projects: data.projects,
            window: { start: `${monthKey}-01`, end: `${monthKey}-31` },
            includeUnbooked: true
          }}
          weekDays={weekIso}
          sheetTitle="Crew week sheets"
          filename={`buildflow-month-${monthKey}`}
          disabled={busy || monthJobs.length === 0}
          onNotice={say}
        />
      </footer>
    </SchedulePageFrame>
  );
}
