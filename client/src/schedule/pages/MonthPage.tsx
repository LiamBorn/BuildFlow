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
import { useMemo, useState, type ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import type { BootstrapPayload, Job } from "@buildflow/shared";
import { rebookSchedule } from "../../api";
import {
  ScheduleDialogPanel,
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
  type ScheduleDialog,
  type ScheduleMilestone
} from "../parts";
import { scheduleAccessibility, spokenDay } from "../dragKeyboard";
import { monthRebook } from "../rebook";
import { ScheduleExportMenu } from "../ExportMenu";
import type { ScheduleTarget } from "../links";
import { BackToScheduleButton, SchedulePageFrame, useSchedulePage } from "../page";

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
  const [dayDialog, setDayDialog] = useState<ScheduleDialog | null>(null);

  const cells = useMemo(() => buildScheduleMonthCells(monthAnchor, calendar.workingDays), [monthAnchor, calendar.workingDays]);
  const monthLabel = formatScheduleMonth(monthAnchor);
  const monthKey = monthAnchor.slice(0, 7);
  const isThisMonth = monthKey === today.slice(0, 7);
  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) map.set(job.startDate, [...(map.get(job.startDate) ?? []), job]);
    return map;
  }, [jobs]);
  const milestonesByDate = useMemo(() => {
    const map = new Map<string, ScheduleMilestone[]>();
    for (const milestone of deriveScheduleMilestones(data)) map.set(milestone.date, [...(map.get(milestone.date) ?? []), milestone]);
    return map;
  }, [data]);
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

  // the live announcements name the job and the day
  const accessibility = useMemo(
    () =>
      scheduleAccessibility({
        active: (item) =>
          `${data.jobs.find((candidate) => candidate.id === item?.jobId)?.name ?? "Job"} starting ${spokenDay(String(item?.date))}`,
        over: (day) => spokenDay(String(day?.date))
      }),
    [data.jobs]
  );
  // A chip dropped on another day moves the job and every booking it has by the same number of days —
  // one request, one transaction, and the server asks before it double-books a crew.
  const onDragEnd = async (event: DragEndEvent) => {
    releaseClick();
    const jobId = event.active.data.current?.jobId as string | undefined;
    const date = event.over?.data.current?.date as string | undefined;
    const job = jobId ? data.jobs.find((candidate) => candidate.id === jobId) : undefined;
    if (!job || !date || busy) return;
    // the job and every booking it has, shifted together — and everything as it was, so Undo can put it back exactly
    const plan = monthRebook(job, data.assignments, date);
    if (!plan) return;
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
  };

  // "+N more" on a busy day: the same day summary the Schedule page shows.
  const openDay = (date: string) => {
    const dayJobs = jobsByDate.get(date) ?? [];
    const dayMilestones = milestonesByDate.get(date) ?? [];
    const count = dayJobs.length + dayMilestones.length;
    setDayDialog({
      title: formatScheduleDate(date),
      description: count > 0 ? `${count} scheduled ${count === 1 ? "item" : "items"} on this day.` : "Nothing scheduled on this day yet.",
      items: [
        ...dayMilestones.map((milestone) => `◆ Milestone — ${milestone.title} (${milestone.project})`),
        ...dayJobs.map((job) => `${job.name} — ${job.phase} · ${job.location}`)
      ]
    });
  };

  return (
    <SchedulePageFrame
      page={page}
      pageClass="month-page"
      eyebrow={<>Crew Scheduling · {monthLabel}</>}
      title="Month"
      titleTutorialId="month-page-title"
      sub="Every job on its start day, with milestones and holidays. Drag a chip to another day to move the job, or click a day to add one."
      releaseTag={releaseTag}
      onOpenSchedule={onOpenSchedule}
      controls={
        <div className="filter-strip month-actions">
          <BackToScheduleButton onOpenSchedule={onOpenSchedule} />
        </div>
      }
      boardLabel={`Calendar for ${monthLabel}`}
      drag={{ accessibility, onDragEnd }}
      dialogs={<>{dayDialog && <ScheduleDialogPanel dialog={dayDialog} onClose={() => setDayDialog(null)} />}</>}
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
        cells={cells}
        jobsByDate={jobsByDate}
        milestonesByDate={milestonesByDate}
        projects={data.projects}
        today={today}
        onOpenProject={() => undefined}
        onOpenDay={openDay}
        onAddJob={(date) => {
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
      />
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
