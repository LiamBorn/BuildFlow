/**
 * The one page frame every schedule view stands in. `useSchedulePage` derives what the
 * four pages used to derive for themselves — the workspace (bench-aware), the shared
 * context, the live feed and the view keys, the filtered scope, the shared week, the
 * calendar, the KPIs, the alerts, the lookup maps, the notice, the conflict question, the
 * save and the drawer, plus the drag sensors and the one way a drop runs with its Undo —
 * and `SchedulePageFrame` renders the chrome around a page's board: the aurora, the hero,
 * the control row, the filters, the saved views, the KPI grid, the board section with its
 * notice, the alerts panel, the dialogs and the drawer. A page keeps its board and its
 * drop rules.
 */
import { DndContext, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { dragModifiers } from "../dragZoom";
import { AlertTriangle, Bookmark, CalendarDays, Gauge, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  holidayMap,
  type BootstrapPayload,
  type CreateJobInput,
  type DependencyType,
  type Job,
  type JobDependency,
  type ScheduleAssignment
} from "@buildflow/shared";
import { assignJob, createDependency, createJob, deleteDependency, setScheduleBaseline } from "../api";
import { parseIsoDate, toIsoDate } from "../components/ui/gantt";
import {
  BoardCustomizeHint,
  BoardLayoutControls,
  DashBoard,
  HiddenPanelChips,
  usePersistentLayout,
  type DashPanel
} from "../board/panelBoard";
import { DASH_COLS, compact, type GridItem, type GridLimits } from "../dashGrid";
import { SectionPicker, type SectionOption } from "../SectionPicker";
import { useHudMotion } from "../useHudMotion";
import { ScheduleAlertsPanel, deriveScheduleAlerts, type ScheduleAlert } from "./alerts";
import { useBenchData } from "./bench";
import { withConflictAsk } from "./conflicts";
import { GanttLinkDialog } from "./GanttLinkDialog";
import { buildScheduleCpm } from "./cpm";
import { applyScheduleFilters, resolveScheduleFilters } from "./filters";
import {
  ScheduleNotice,
  scheduleCollision,
  useConflictAsk,
  useJobSave,
  useScheduleNotice,
  useScheduleSensors,
  useSettleWrite
} from "./hooks";
import { computeScheduleKpis, workCalendarOf } from "./kpis";
import type { ScheduleTarget } from "./links";
import { useScheduleLive } from "./live";
import { firstOfScheduleMonth } from "./month";
import { JobDrawer } from "./parts/JobDrawer";
import { JobWeather } from "../weather/ScheduleWeather";
import { ScheduleKpiGrid, crewScheduleOrder } from "./parts/shared";
import { ScheduleJobPickerDialog } from "./parts/week";
import { getUnassignedJobs } from "./scheduleUtils";
import { SavedViewsBar } from "./SavedViewsBar";
import { ScheduleFilters } from "./ScheduleFilters";
import { useScheduleContext, type SchedulePage as SchedulePageId } from "./useScheduleContext";
import { useScheduleViewKeys } from "./viewKeys";
import { TextReveal } from "../motion";
import { WEEK_DAYS, dayOf, formatScheduleDate, formatScheduleWeekRange, initialWeekStart, mondayOf, scheduleWeekDays } from "./week";

export type SchedulePageInput = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  /** Opens another schedule view (keys 1–6) or the page an alert points at. */
  onOpenPage?: (page: ScheduleTarget) => void;
  page: SchedulePageId;
  /** How the shared filters apply here — the Kanban is the status view and keeps every status on its board. */
  filterOptions?: Parameters<typeof applyScheduleFilters>[2];
  /** The page's own patches on jobs, shown until the server answers (a Gantt bar moves at once). */
  overrides?: Record<string, Partial<Job>>;
  /** Build the CPM readout — the landing and the Gantt show it; the boards do not pay for it. */
  cpm?: boolean;
};

/** A change to the schedule and its way back, run the way every board runs one. */
export type ScheduleChange<T> = {
  /** The card the board shows as pending while the change is saved. */
  id: string;
  /** What the notices call it. */
  name: string;
  /** "move" or "book" — the verb of the failure notice. */
  verb?: string;
  /** The write; retried with `force` after the planner answers "book anyway". */
  write: (force: boolean) => Promise<T>;
  /** The notice when it lands. */
  done: string;
  /** The notice when the planner chose not to double-book. */
  stays?: string;
  /**
   * Reverses the change; without it the notice offers no Undo. Takes `force` for the same reason
   * the write does: the way back can clash with something that arrived while the notice was up,
   * and that clash is one the planner has not seen.
   */
  undo?: ((result: T, force: boolean) => Promise<unknown>) | null;
  /** The notice after the Undo. */
  undone?: string;
  /** The card the board shows as pending while the Undo runs (the moved booking, by default the same card). */
  undoId?: (result: T) => string;
};

export function useSchedulePage({
  data: liveData,
  reload,
  onOpenPage,
  page,
  filterOptions,
  overrides,
  cpm: wantCpm = false
}: SchedulePageInput) {
  // development: `?bench=<n>` on the deep link renders the page against a generated n-job workspace (P3.5)
  const bench = useBenchData(liveData);
  // the page's own patches (a Gantt bar moves at once) sit on the server's jobs until fresh data settles them
  const data = useMemo(
    () =>
      overrides && Object.keys(overrides).length > 0
        ? { ...bench, jobs: bench.jobs.map((job) => (overrides[job.id] ? { ...job, ...overrides[job.id] } : job)) }
        : bench,
    [bench, overrides]
  );
  // the week, month, crew type, crew, project, region and status set follow you across the Schedule pages (and survive a reload)
  const [context, updateContext] = useScheduleContext(data.activeUser.id);
  // keys 1–6 switch views
  useScheduleViewKeys(onOpenPage, page);

  // the shared week: the context's, or the week with the nearest booking
  const weekStart = useMemo(
    () => (context.weekStart ? parseIsoDate(context.weekStart) : initialWeekStart(data.assignments)),
    [context.weekStart, data.assignments]
  );
  const setWeekStart = useCallback(
    (next: Date | ((current: Date) => Date)) =>
      updateContext({ weekStart: toIsoDate(typeof next === "function" ? next(weekStart) : next) }),
    [updateContext, weekStart]
  );
  const weekDays = useMemo(() => scheduleWeekDays(weekStart), [weekStart]);
  const weekIso = useMemo(() => weekDays.map((day) => day.date), [weekDays]);
  const weekStartIso = weekDays[0].date;
  const weekEndIso = weekDays[WEEK_DAYS - 1].date;
  const isThisWeek = weekStartIso === toIsoDate(mondayOf(new Date()));
  // the same words for the same week on every schedule page — from the one function that
  // knows them, rather than a second copy of the sentence that had to be fixed twice
  const weekRange = formatScheduleWeekRange(weekDays);
  // today, and the shared month: the context's, or the one we are in
  const today = toIsoDate(new Date());
  const monthAnchor = context.monthAnchor ?? firstOfScheduleMonth(today);
  const setMonthAnchor = useCallback(
    (next: string | ((current: string) => string)) => updateContext({ monthAnchor: typeof next === "function" ? next(monthAnchor) : next }),
    [updateContext, monthAnchor]
  );

  // the shared filters — project, crew type, crew, region, the status set — mean the same on every schedule page
  const scope = useMemo(() => applyScheduleFilters(data, context, filterOptions), [data, context, filterOptions]);
  // the filters as they resolve against this workspace (a project that no longer exists is no filter)
  const filters = useMemo(() => resolveScheduleFilters(context, data), [context, data]);
  const jobs = scope.jobs;
  const crews = useMemo(() => [...scope.crews].sort((a, b) => crewScheduleOrder(a) - crewScheduleOrder(b)), [scope.crews]);
  const weekAssignments = useMemo(
    () =>
      scope.assignments.filter((assignment) => {
        const day = dayOf(assignment);
        return day >= weekStartIso && day <= weekEndIso;
      }),
    [scope.assignments, weekStartIso, weekEndIso]
  );
  // jobs with no crew booked yet: the landing's unbooked queue
  const unassigned = useMemo(() => getUnassignedJobs(jobs, data.assignments), [jobs, data.assignments]);
  // holidays and working days come from Settings › Work calendar
  const calendar = useMemo(() => workCalendarOf(data), [data]);
  const holidays = useMemo(() => holidayMap(calendar), [calendar]);
  // the whole plan as a CPM network on a working-day axis — float and the critical path mean nothing on a filtered subset
  const cpm = useMemo(
    () =>
      wantCpm
        ? buildScheduleCpm(
            data.jobs.filter((job) => job.startDate && job.endDate),
            data.dependencies ?? [],
            calendar
          )
        : null,
    [wantCpm, data.jobs, data.dependencies, calendar]
  );
  // the same KPI maths as every schedule page, for this week and these filters
  const kpis = useMemo(
    () =>
      computeScheduleKpis({
        crews,
        jobs,
        weekAssignments,
        weekDays: weekIso,
        month: monthAnchor.slice(0, 7),
        phases: data.phases,
        projects: data.projects,
        calendar
      }),
    [crews, jobs, weekAssignments, weekIso, monthAnchor, data.phases, data.projects, calendar]
  );
  // the same alerts every schedule page raises, for what the filters show
  const alerts = useMemo(() => deriveScheduleAlerts(data, jobs, scope.assignments), [data, jobs, scope.assignments]);
  // an alert opens the place it is dealt with — a booking alert changes the shared week on the way (the month follows it)
  const openAlert = useCallback(
    (alert: ScheduleAlert) => {
      if (alert.link.weekStart) updateContext({ weekStart: alert.link.weekStart });
      if (alert.link.page === page) return;
      onOpenPage?.(alert.link.page);
    },
    [updateContext, onOpenPage, page]
  );

  const crewsById = useMemo(() => new Map(data.crews.map((crew) => [crew.id, crew])), [data.crews]);
  const jobsById = useMemo(() => new Map(data.jobs.map((job) => [job.id, job])), [data.jobs]);
  const projectsById = useMemo(() => new Map(data.projects.map((project) => [project.id, project])), [data.projects]);
  // the crews booked on each job, as the drawer and the chart name them
  const crewNamesByJob = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const assignment of data.assignments) {
      const name = crewsById.get(assignment.crewId)?.name;
      if (!name) continue;
      const list = names.get(assignment.jobId) ?? [];
      if (!list.includes(name)) list.push(name);
      names.set(assignment.jobId, list);
    }
    return new Map([...names].map(([jobId, list]) => [jobId, list.join(", ")]));
  }, [data.assignments, crewsById]);
  const crewNamesForJob = useCallback((jobId: string) => crewNamesByJob.get(jobId) ?? "", [crewNamesByJob]);

  const { notice, news, say, report } = useScheduleNotice();
  // the refresh every write ends with: it reports itself, so a board that could not reload says
  // that it may be behind instead of the write claiming it failed
  const settle = useSettleWrite(reload, say);
  // Other tabs' changes arrive here: reload, flash the cards they touched, and say so once —
  // through `report`, which announces beside this tab's own notice instead of replacing it, so a
  // change elsewhere cannot take away an Undo the person is still deciding about.
  useScheduleLive(reload, report);
  // the server asks before it double-books a crew; this is how the page answers
  const { ask, dialog: conflictDialog } = useConflictAsk();
  // the one way a schedule page saves a job: a move carries its bookings along and asks before a double-booking
  const patchJob = useJobSave({ assignments: data.assignments, reload, say, ask });

  // the drawer: a job, opened from a booking's card or from the job itself
  const [selected, setSelected] = useState<{ jobId: string; assignmentId: string | null } | null>(null);
  const selectedJob = selected ? (data.jobs.find((job) => job.id === selected.jobId) ?? null) : null;
  const selectedAssignmentId = selected?.assignmentId ?? null;
  const openJob = useCallback((jobId: string) => setSelected({ jobId, assignmentId: null }), []);
  const openBooking = useCallback(
    (assignment: ScheduleAssignment) => setSelected({ jobId: assignment.jobId, assignmentId: assignment.id }),
    []
  );
  const closeDrawer = useCallback(() => setSelected(null), []);

  // drags: the sensors every board uses, a guard for the click that ends a drag, and the card being saved
  const sensors = useScheduleSensors();
  const suppressClick = useRef(false);
  const releaseClick = useCallback(() => {
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 150);
  }, []);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  /**
   * Runs a change the way every board does: the card goes pending, the write asks before a
   * double-booking, the notice lands with its Undo, and a failure says what could not happen.
   * Resolves with the write's result, or null when nothing was written.
   */
  const runChange = useCallback(
    async <T,>({ id, name, verb = "move", write, done, stays, undo, undone, undoId }: ScheduleChange<T>): Promise<T | null> => {
      const failed = (what: string, error: unknown) =>
        say(`Could not ${what} ${name}: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
      setBusy(true);
      setPendingId(id);
      try {
        const result = await withConflictAsk(write, ask);
        if (result === null) {
          say(stays ?? `${name} stays where it was.`);
          return null;
        }
        // The write has landed. From here a failure is a stale board, not a failed change,
        // so the refresh reports itself rather than borrowing the write's "could not" wording.
        await settle({
          done,
          // the way back is the state before, so Undo needs no asking
          undo: undo
            ? async () => {
                setBusy(true);
                setPendingId(undoId?.(result) ?? id);
                let back;
                try {
                  back = await withConflictAsk((force) => undo(result, force), ask);
                } catch (error) {
                  failed("move back", error);
                  return;
                } finally {
                  setBusy(false);
                  setPendingId(null);
                }
                // the planner was asked about a clash on the way back, and said no
                if (back === null) {
                  say(`${name} stays where it is.`);
                  return;
                }
                await settle({ done: undone ?? `${name} as it was` });
              }
            : undefined
        });
        return result;
      } catch (error) {
        failed(verb, error);
        return null;
      } finally {
        setBusy(false);
        setPendingId(null);
      }
    },
    [ask, settle, say]
  );
  // "Add job" in a cell, or "New Activity": the one job form, on a crew and a day
  const [picker, setPicker] = useState<{ crewId: string; date: string } | null>(null);
  const pickerCrew = picker ? (crewsById.get(picker.crewId) ?? null) : null;
  const openPicker = useCallback((crewId: string, date: string) => setPicker({ crewId, date }), []);
  const closePicker = useCallback(() => setPicker(null), []);
  // "New Activity": the form on the first crew in view and the first day of the week
  const newActivity = useCallback(() => {
    const first = scope.crews[0] ?? data.crews[0];
    if (!first) {
      say("Add a crew before scheduling work.", { error: true });
      return;
    }
    setPicker({ crewId: first.id, date: weekStartIso });
  }, [scope.crews, data.crews, weekStartIso, say]);
  /** Creates the job and books it on the crew and the day the picker is open for; the server asks before it double-books the crew. */
  const createBooking = useCallback(
    async (input: CreateJobInput, crewId: string): Promise<{ job: Job; booked: boolean; date: string } | null> => {
      if (!picker) return null;
      const { date } = picker;
      setBusy(true);
      try {
        const job = await createJob(input);
        // a "no" leaves the new job unbooked, in the landing's queue
        const booked = (await withConflictAsk((force) => assignJob({ jobId: job.id, crewId, date }, { force }), ask)) !== null;
        setPicker(null);
        /* EVERY PAGE MOVES TO THE NEW JOB. The week and the month are one shared context so that a
           page "opens where the last one left off" — which is right for browsing and wrong the
           moment you SCHEDULE something: the Month shows one month (and the boards that showed one
           week did the same while they were here), and a job made on a day outside it is simply not
           on the board when you switch. Reported 2026-09-20 as "if a user schedules a job within the Month, that
           same job can be seen within the week page, list, kanban, matrix, and gantt chart — as of
           right now it doesn't do it"; measured before the change, a job created on the 24th was
           invisible on List and Matrix (parked a week later) and on the Week BOARD, where it only
           showed in the side queue because its status happened to be Planned.

           The job's own start day is what the pages follow, not `date` (the day the picker was
           opened on): the form's Start Date is editable, and the job is the thing that has to be
           on screen. Kanban and Gantt have no window and already showed it.

           THE WEEK ALONE is the patch: useScheduleContext coupleWeekAndMonth moves the month to
           follow a week given on its own, and treats a patch that sets BOTH as given — so naming
           the month here would opt out of the very rule that keeps them together. */
        const landsOn = job.startDate || date;
        updateContext({ weekStart: toIsoDate(mondayOf(parseIsoDate(landsOn))) });
        await settle({
          done: booked
            ? `${job.name} scheduled for ${crewsById.get(crewId)?.name ?? "crew"} on ${formatScheduleDate(date)}`
            : `${job.name} created but not booked — find it in the Schedule landing's unbooked queue.`
        });
        return { job, booked, date };
      } catch (error) {
        say(`Could not schedule the job: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [picker, ask, settle, say, crewsById, updateContext]
  );
  // dependencies: the links a job has, and the one way a link is drawn or taken away — from the drawer on
  // every page, from the bar's menu on the Gantt; each notice carries its Undo
  const dependencies = useMemo(() => data.dependencies ?? [], [data.dependencies]);
  const linksOf = useCallback(
    (jobId: string) => dependencies.filter((link) => link.predecessorId === jobId || link.successorId === jobId),
    [dependencies]
  );
  // the jobs a link can lead to: every dated job, earliest first
  const linkableJobs = useMemo(
    () =>
      data.jobs
        .filter((job) => job.startDate && job.endDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name)),
    [data.jobs]
  );
  // "Link to another job…": the job a new dependency starts from
  const [linkFrom, setLinkFrom] = useState<Job | null>(null);
  const linkJobs = useCallback(
    async (predecessor: Job, successor: Job, type: DependencyType, lagDays: number) => {
      try {
        const link = await createDependency({ predecessorId: predecessor.id, successorId: successor.id, type, lagDays });
        await settle({
          done: `${predecessor.name} → ${successor.name} linked (${type}${lagDays ? `, ${lagDays}d lag` : ""})`,
          undo: async () => {
            await deleteDependency(link.id);
            await settle({ done: `${predecessor.name} and ${successor.name} unlinked again` });
          }
        });
      } catch (error) {
        say(`Could not link the jobs: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
      }
    },
    [settle, say]
  );
  const unlinkJobs = useCallback(
    async (link: JobDependency) => {
      const name = (id: string) => jobsById.get(id)?.name ?? id;
      const label = `${name(link.predecessorId)} and ${name(link.successorId)}`;
      try {
        await deleteDependency(link.id);
        await settle({
          done: `${label} unlinked`,
          undo: async () => {
            await createDependency({
              predecessorId: link.predecessorId,
              successorId: link.successorId,
              type: link.type,
              lagDays: link.lagDays
            });
            await settle({ done: `${label} linked again` });
          }
        });
      } catch (error) {
        say(`Could not unlink ${label}: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
      }
    },
    [settle, say, jobsById]
  );
  // "Set baseline": snapshot the current plan as what slip is measured against (the CPM readout's button)
  const saveBaseline = useCallback(async () => {
    setBusy(true);
    try {
      await setScheduleBaseline();
      await settle({ done: "Baseline saved — slip is now measured against today's plan." });
    } catch (error) {
      say(`Could not save the baseline: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
    } finally {
      setBusy(false);
    }
  }, [settle, say]);

  return {
    page,
    data,
    reload,
    onOpenPage,
    context,
    updateContext,
    weekStart,
    setWeekStart,
    weekDays,
    weekIso,
    weekStartIso,
    weekEndIso,
    isThisWeek,
    weekRange,
    today,
    monthAnchor,
    setMonthAnchor,
    scope,
    filters,
    jobs,
    crews,
    weekAssignments,
    unassigned,
    calendar,
    holidays,
    kpis,
    cpm,
    alerts,
    openAlert,
    crewsById,
    jobsById,
    projectsById,
    crewNamesByJob,
    crewNamesForJob,
    notice,
    news,
    say,
    ask,
    conflictDialog,
    patchJob,
    selectedJob,
    selectedAssignmentId,
    openJob,
    openBooking,
    closeDrawer,
    sensors,
    suppressClick,
    releaseClick,
    busy,
    setBusy,
    pendingId,
    setPendingId,
    runChange,
    picker,
    pickerCrew,
    openPicker,
    closePicker,
    newActivity,
    createBooking,
    dependencies,
    linksOf,
    linkableJobs,
    linkFrom,
    setLinkFrom,
    linkJobs,
    unlinkJobs,
    saveBaseline
  };
}

export type SchedulePageState = ReturnType<typeof useSchedulePage>;

/** "Schedule": back to the overview. */
export function BackToScheduleButton({ onOpenSchedule }: { onOpenSchedule: () => void }) {
  return (
    <button type="button" className="outline-button" onClick={onOpenSchedule} title="Back to the Schedule overview">
      <CalendarDays size={16} /> Schedule
    </button>
  );
}

/* ---- the panel board on a schedule page (2026-09-15) -----------------------
   "Set up the customize feature for the Schedule page, the same way as the Dashboard": a page
   hands the frame its sections and the frame lays them — with its own blocks: the KPIs, the
   filters, the saved views, the alerts — on the Dashboard's board (board/panelBoard.tsx): move
   by the grip, size from the corner, remove to the "+" drawer, Reset layout. Every section is
   full width, one under the next, until someone customizes; the board follows the person (the
   `schedule:layout:<page>` account setting, mirrored on the device). The status band stays
   above the board, as it does on the Dashboard. */
export type ScheduleSection = {
  id: string;
  title: string;
  icon?: LucideIcon;
  /** Where the "+" drawer files it, and the line it shows there. */
  group: string;
  blurb: string;
  /** The panel's own control, at the right of its title row (View all, a note). */
  action?: ReactNode;
  body: ReactNode;
  /** Its height in grid rows to start with; the board fits it to the content until someone resizes it. */
  h?: number;
};

/** Every section full width, one under the next — the default, and what Reset layout returns to. */
const fullWidthLayout = (sections: ScheduleSection[]): GridItem[] => {
  let y = 0;
  return sections.map((section) => {
    const h = section.h ?? 5;
    const item: GridItem = { id: section.id, x: 0, y, w: DASH_COLS, h };
    y += h;
    return item;
  });
};
/** The KPI tiles and the filter strip stop reading below half width. */
const scheduleSectionLimits = (id: string): GridLimits => ({ minW: id === "kpis" || id === "filters" ? 3 : 2, minH: 2, maxW: DASH_COLS });

function useScheduleBoard(userId: string, pageId: SchedulePageId, sections: ScheduleSection[]) {
  // a section list that changes (the first-run panel comes and goes) changes the defaults
  const signature = sections.map((section) => `${section.id}:${section.h ?? 5}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => fullWidthLayout(sections), [signature]);
  const board = usePersistentLayout(`bf:schedule:layout:${pageId}:${userId}`, defaults, defaults, {
    limits: scheduleSectionLimits,
    settingKey: `schedule:layout:${pageId}`
  });
  const [customizing, setCustomizing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addedFocus, setAddedFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [editing, setEditing] = useState(false);
  // below tablet width the board is a column and the controls step aside, as on the Dashboard
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setStacked(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  // a saved board can name a section the page is not showing right now (first run, once the
  // week is booked); the board shows what exists, packed up
  const present = new Set(sections.map((section) => section.id));
  const shown = useMemo(
    () => compact(board.layout.filter((item) => present.has(item.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.layout, signature]
  );
  return { board, shown, customizing, setCustomizing, pickerOpen, setPickerOpen, addedFocus, setAddedFocus, editing, setEditing, stacked };
}

export type SchedulePageFrameProps = {
  page: SchedulePageState;
  /** The page's own sections, as panels on the board (see ScheduleSection); without them the page lays itself out. */
  sections?: ScheduleSection[];
  /** The page's own root class, e.g. "month-page". */
  pageClass?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  titleTutorialId?: string;
  sub: ReactNode;
  releaseTag?: ReactNode;
  /** A band between the hero and the control row (the landing's status band). */
  band?: ReactNode;
  /** The landing's motion: the cursor glow and reveal-on-scroll for the hero, the control row and its [data-reveal] blocks. */
  motion?: boolean;
  /** The control row's contents: the week stepper and the page's actions. */
  controls: ReactNode;
  /** How the shared filters show here (the Kanban keeps every status, and says so). */
  filters?: Pick<ComponentProps<typeof ScheduleFilters>, "statuses" | "note">;
  /** The board section the frame wraps around the children — false when the page lays out its own board and rail. */
  board?: boolean;
  boardLabel?: string;
  boardTutorialId?: string;
  /** The alerts panel under the board; false when the board carries its own rail. */
  alerts?: boolean;
  onOpenSchedule?: () => void;
  /** The page's drop rule and its announcements; with them the board stands in a DndContext. */
  drag?: {
    accessibility: ComponentProps<typeof DndContext>["accessibility"];
    onDragEnd: (event: DragEndEvent) => void | Promise<void>;
    /** For a board that shows where the card would land while it is still in the air (the Kanban). */
    onDragOver?: (event: DragOverEvent) => void;
    /** Escape, or a drag that never landed: take that preview back down. */
    onDragCancel?: () => void;
  };
  /** After the picker creates and books a job (the landing goes to the Month calendar on that month). */
  onBooked?: (booking: { job: Job; booked: boolean; date: string }) => void;
  /** The page's own dialogs (a day summary, an import). */
  dialogs?: ReactNode;
  children: ReactNode;
};

export function SchedulePageFrame({
  page,
  pageClass,
  eyebrow,
  title,
  titleTutorialId,
  sub,
  releaseTag,
  band,
  motion = false,
  controls,
  filters,
  board = true,
  boardLabel,
  boardTutorialId,
  alerts: showAlerts = true,
  onOpenSchedule,
  drag,
  onBooked,
  dialogs,
  sections,
  children
}: SchedulePageFrameProps) {
  const {
    data,
    reload,
    onOpenPage,
    context,
    updateContext,
    today,
    kpis,
    notice,
    news,
    alerts,
    openAlert,
    conflictDialog,
    selectedJob,
    closeDrawer,
    patchJob,
    projectsById,
    crewNamesForJob,
    jobsById,
    dependencies,
    linksOf,
    linkableJobs,
    linkFrom,
    setLinkFrom,
    linkJobs,
    unlinkJobs,
    busy,
    picker,
    pickerCrew,
    closePicker,
    createBooking,
    sensors,
    suppressClick,
    releaseClick
  } = page;
  // the landing's motion only; without the ref the hook does nothing
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);

  /* The board: the frame's own blocks first — they read the same on every page — then the
     page's sections, then the alerts where the page leaves them to the frame. */
  const boardSections: ScheduleSection[] = sections
    ? [
        {
          id: "kpis",
          title: "Schedule KPIs",
          icon: Gauge,
          group: "Performance",
          blurb: "Working days, bookings, crew utilisation and what is still unbooked this week.",
          body: <ScheduleKpiGrid kpis={kpis} />,
          h: 4
        },
        {
          id: "filters",
          title: "Filters",
          icon: SlidersHorizontal,
          group: "Tools",
          blurb: "Narrow every schedule view by project, crew type, crew and status.",
          body: <ScheduleFilters data={data} context={context} onChange={updateContext} {...filters} />,
          h: 3
        },
        {
          id: "savedViews",
          title: "Saved views",
          icon: Bookmark,
          group: "Tools",
          blurb: "Name the filters on screen and apply them again with one click.",
          body: (
            <SavedViewsBar
              data={data}
              context={context}
              page={page.page}
              onChange={updateContext}
              onOpenPage={onOpenPage}
              reload={reload}
            />
          ),
          h: 3
        },
        ...sections,
        ...(showAlerts
          ? [
              {
                id: "alerts",
                title: "Schedule Alerts",
                icon: AlertTriangle,
                group: "Attention",
                blurb: "Conflicts, unbooked work and slips in what the filters show.",
                body: <ScheduleAlertsPanel headless alerts={alerts} onOpen={openAlert} />,
                h: 5
              }
            ]
          : [])
      ]
    : [];
  const boardHost = useScheduleBoard(data.activeUser.id, page.page, boardSections);
  const panels: Record<string, DashPanel> = Object.fromEntries(
    boardSections.map((section) => [
      section.id,
      { id: section.id, title: section.title, icon: section.icon, action: section.action, body: section.body }
    ])
  );
  const panelTitles: Record<string, string> = Object.fromEntries(boardSections.map((section) => [section.id, section.title]));

  const titleRow = (
    <div className="schedule-title-row dx-hero" data-reveal={motion || undefined}>
      <span className="dx-eyebrow">
        <span className="dx-dot" />
        {eyebrow}
      </span>
      <h1 className="dx-title" data-tutorial-id={titleTutorialId}>
        {/* the title sharpens character by character — docs/motion-spec.md §2.4.
            Every page here passes a plain string; a node goes through untouched
            rather than being flattened into characters. */}
        {typeof title === "string" ? <TextReveal text={title} /> : title}
        {releaseTag}
      </h1>
      <p className="dx-sub">{sub}</p>
    </div>
  );
  const controlRow = (
    <div className="schedule-control-row" data-reveal={motion || undefined}>
      {controls}
    </div>
  );

  const body = (
    <div
      className={["schedule-page", pageClass, "page-stack", "sched-rx", "gantt-page", sections ? "has-board" : ""]
        .filter(Boolean)
        .join(" ")}
      ref={motion ? rootRef : undefined}
    >
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      {motion && <div className="dx-cursor" aria-hidden="true" />}
      {sections ? (
        /* The board's scope classes are the Dashboard's — that is where its sheets look — and
           schedule-board.css takes back what they mean for a page root. */
        <div
          className={`dash-rx hs-home sched-board-host${boardHost.customizing ? " is-customizing" : ""}${boardHost.editing ? " is-rearranging" : ""}`}
        >
          <div className="sched-board-topline">
            {titleRow}
            {!boardHost.stacked && (
              <BoardLayoutControls
                customizing={boardHost.customizing}
                pickerOpen={boardHost.pickerOpen}
                onToggleCustomize={() => boardHost.setCustomizing((current) => !current)}
                onReset={() => {
                  boardHost.board.reset();
                  boardHost.setCustomizing(false);
                }}
                onAdd={() => boardHost.setPickerOpen(true)}
              />
            )}
          </div>
          {boardHost.customizing && <BoardCustomizeHint />}
          {boardHost.customizing && boardHost.board.hidden.length > 0 && (
            <HiddenPanelChips hidden={boardHost.board.hidden} titles={panelTitles} onShow={boardHost.board.show} />
          )}
          {band}
          {controlRow}
          <ScheduleNotice notice={notice} news={news} />
          <DashBoard
            layout={boardHost.shown}
            panels={panels}
            limits={scheduleSectionLimits}
            onChange={boardHost.board.update}
            onFit={boardHost.board.fit}
            fitToContent={!boardHost.board.stored || boardHost.board.fitting}
            onEditingChange={boardHost.setEditing}
            panelFocus={boardHost.addedFocus}
            editable={boardHost.customizing}
            onHide={boardHost.customizing ? boardHost.board.hide : undefined}
          />
          <SectionPicker
            open={boardHost.pickerOpen}
            onClose={() => boardHost.setPickerOpen(false)}
            options={boardSections.map((section): SectionOption => ({
              id: section.id,
              title: section.title,
              group: section.group,
              blurb: section.blurb,
              icon: section.icon,
              onBoard: !boardHost.board.hidden.includes(section.id)
            }))}
            onAdd={(id) => {
              boardHost.board.show(id);
              boardHost.setAddedFocus({ id, nonce: Date.now() + Math.random() });
            }}
          />
          {children}
        </div>
      ) : (
        <>
          {titleRow}

          {band}
          {controlRow}

          <ScheduleFilters data={data} context={context} onChange={updateContext} {...filters} />
          <SavedViewsBar data={data} context={context} page={page.page} onChange={updateContext} onOpenPage={onOpenPage} reload={reload} />

          <ScheduleKpiGrid kpis={kpis} />

          {board ? (
            <section className="schedule-board" aria-label={boardLabel} data-tutorial-id={boardTutorialId}>
              <ScheduleNotice notice={notice} news={news} />
              {children}
            </section>
          ) : (
            children
          )}
          {showAlerts && <ScheduleAlertsPanel alerts={alerts} onOpen={openAlert} under />}
        </>
      )}
      {linkFrom && (
        <GanttLinkDialog
          from={linkFrom}
          jobs={linkableJobs}
          existing={dependencies}
          onClose={() => setLinkFrom(null)}
          onLink={async (successor, type, lagDays) => {
            setLinkFrom(null);
            await linkJobs(linkFrom, successor, type, lagDays);
          }}
        />
      )}
      {picker && pickerCrew && (
        <ScheduleJobPickerDialog
          crew={pickerCrew}
          crews={data.crews}
          date={picker.date}
          projects={data.projects}
          busy={busy}
          onClose={closePicker}
          onCreateJob={async (input, crewId) => {
            const booking = await createBooking(input, crewId);
            if (booking) onBooked?.(booking);
          }}
        />
      )}
      {dialogs}
      {conflictDialog}

      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          projectName={projectsById.get(selectedJob.projectId)?.name ?? "Unfiled"}
          crews={crewNamesForJob(selectedJob.id)}
          links={linksOf(selectedJob.id)}
          jobsById={jobsById}
          onLink={() => setLinkFrom(selectedJob)}
          onUnlink={(link) => void unlinkJobs(link)}
          // WeatherIQ on the job's days, with the call-off it suggests (weather/ScheduleWeather.tsx)
          weather={<JobWeather job={selectedJob} data={data} today={today} reload={reload} />}
          onClose={closeDrawer}
          onOpenSchedule={onOpenSchedule ?? closeDrawer}
          onSave={async (patch) => {
            // the drawer stays open on a failure and says so in place; it closes when the change is in
            const result = await patchJob(selectedJob, patch, `${selectedJob.name} saved`);
            if (result.saved) closeDrawer();
            return result;
          }}
        />
      )}
    </div>
  );
  if (!drag) return body;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={scheduleCollision}
      modifiers={dragModifiers}
      accessibility={drag.accessibility}
      onDragStart={() => {
        suppressClick.current = true;
      }}
      onDragOver={drag.onDragOver}
      onDragCancel={() => {
        releaseClick();
        drag.onDragCancel?.();
      }}
      onDragEnd={(event) => void drag.onDragEnd(event)}
    >
      {body}
    </DndContext>
  );
}
