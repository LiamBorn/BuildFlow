/**
 * Gantt Chart — the Schedule hub's timeline view. Every job is a bar on a shared
 * calendar, grouped by project and coloured with the same status palette the
 * badges and the Schedule board use. Dragging a bar (or an edge) rewrites the
 * job's planned dates through the existing PATCH /api/jobs route; clicking one
 * opens a drawer for status, priority, dates and notes.
 *
 * Built on the ported roadmap-ui Gantt in components/ui/gantt.tsx and styled by
 * hs-gantt.css with the index pages' tokens.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Crosshair, ExternalLink, Link2, Minus, PencilLine, Plus, Unlink, ChevronDown } from "lucide-react";
import type { BootstrapPayload, Job, Status } from "@buildflow/shared";
import { GanttLinkDialog } from "../GanttLinkDialog";
import { ScheduleFilters } from "../ScheduleFilters";
import { JobDrawer, ScheduleKpiGrid, ScheduleNotice, mondayOf } from "../parts";
import { ScheduleAlertsPanel } from "../alerts";
import { STATUSES, STATUS_PALETTE } from "../statusPalette";
import { ScheduleCpmSummary } from "../cpm";
import { ScheduleExportMenu } from "../ExportMenu";
import { GanttDependencyLinks, type GanttLinkRow } from "../GanttDependencyLinks";
import {
  GanttContextMenu,
  GanttFeatureItem,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttHeader,
  GanttMarker,
  GanttProvider,
  GanttRowSpacer,
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarItem,
  GanttTimeline,
  GanttToday,
  addDays,
  formatDate,
  parseIsoDate,
  startOfDay,
  toIsoDate,
  useGanttRowWindow,
  type GanttFeature,
  type Range
} from "../../components/ui/gantt";
import type { ScheduleTarget } from "../links";
import { SavedViewsBar } from "../SavedViewsBar";
import { useSchedulePage } from "../page";
import { useNarrowViewport } from "../hooks";

/** The chart's own ranges plus "week": a fitted seven-day window on the shared schedule week. */
type PageRange = Range | "week";
const RANGES: Array<{ id: PageRange; label: string }> = [
  { id: "week", label: "Week" },
  { id: "daily", label: "Day" },
  { id: "monthly", label: "Month" },
  { id: "quarterly", label: "Quarter" }
];
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
export const AT_RISK = new Set<Status>(["DelayIQed", "At Risk"]);

function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writePreference(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the preference just does not stick */
  }
}

type Row = {
  feature: GanttFeature;
  job: Job;
  crews: string;
  /** On the critical path: zero float. */
  critical: boolean;
  /** Total float in working days, when the network knows it. */
  float: number | null;
  /** The baseline span, when it differs from the plan. */
  ghost?: { startAt: Date; endAt: Date; title: string };
};
type Group = { id: string; name: string; rows: Row[] };

/** Where each project's rows sit in the chart's single column of rows: a group is its own header row, then its jobs. */
type RowLayout = { starts: number[]; total: number };
function rowLayout(groups: Group[]): RowLayout {
  let total = 0;
  const starts = groups.map((group) => {
    const start = total + 1; // the group's header row comes first
    total = start + group.rows.length;
    return start;
  });
  return { starts, total };
}

/** The part of one group's rows a window keeps, and how many it skips either side. */
function windowedRows(rows: Row[], start: number, view: { first: number; last: number }) {
  const from = Math.min(rows.length, Math.max(0, view.first - start));
  const to = Math.min(rows.length, Math.max(from, view.last - start + 1));
  return { before: from, rows: rows.slice(from, to), after: rows.length - to };
}

/**
 * Draws only the rows near the viewport — the sidebar's and the timeline's, from the same
 * window, so the two sides stay level. A row the window skips becomes the height it would
 * have taken, which keeps the scrollbar and every row below it where they belong.
 */
function WindowedGroups({
  groups,
  layout,
  group: renderGroup,
  row: renderRow
}: {
  groups: Group[];
  layout: RowLayout;
  /** Wraps one project's rows: the sidebar's group box, or the timeline's group. */
  group: (group: Group, children: ReactNode) => ReactNode;
  row: (row: Row) => ReactNode;
}) {
  const view = useGanttRowWindow(layout.total);
  return (
    <>
      {groups.map((item, index) => {
        const { before, rows, after } = windowedRows(item.rows, layout.starts[index], view);
        return (
          <Fragment key={item.id}>
            {renderGroup(
              item,
              <>
                <GanttRowSpacer rows={before} />
                {rows.map(renderRow)}
                <GanttRowSpacer rows={after} />
              </>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export type GanttPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenSchedule: () => void;
  /** The "New" pill the navigation shows for a fresh release. */
  /** Opens another schedule view (keys 1–6). */
  onOpenPage?: (page: ScheduleTarget) => void;
  releaseTag?: ReactNode;
};

/** Bars the chart draws at once; past this, past work drops first and the page says how to narrow. */
export const GANTT_ROW_CAP = 300;

export function GanttPage({ data: liveData, reload, onOpenSchedule, onOpenPage, releaseTag }: GanttPageProps) {
  const [range, setRange] = useState<PageRange>(() => readPreference<PageRange>("gantt:range", "monthly"));
  const [zoom, setZoom] = useState<number>(() => readPreference<number>("gantt:zoom", 100));
  // a moved bar shows at once; fresh server data — or a refused save — settles it
  const [overrides, setOverrides] = useState<Record<string, Partial<Job>>>({});
  // everything the seven schedule pages share, with the page's own moves on the jobs and the CPM readout built
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "gantt", overrides, cpm: true });
  const {
    data,
    context,
    updateContext,
    filters,
    scope,
    weekStart,
    setWeekStart,
    weekIso,
    isThisWeek,
    holidays,
    kpis,
    cpm,
    alerts,
    openAlert,
    jobsById,
    projectsById,
    crewNamesForJob,
    notice,
    say,
    conflictDialog,
    patchJob: saveJob,
    selectedJob,
    openJob,
    closeDrawer,
    dependencies,
    linksOf,
    linkFrom,
    setLinkFrom,
    linkJobs,
    unlinkJobs,
    busy,
    saveBaseline
  } = page;
  // on a phone the rows are tap-sized (46 px rows, 40 px bars) and the sidebar leaves the timeline room (P4.4)
  const phone = useNarrowViewport();
  const [scrollRequest, setScrollRequest] = useState<{ date: Date; nonce: number } | undefined>(undefined);

  useEffect(() => writePreference("gantt:range", range), [range]);
  useEffect(() => writePreference("gantt:zoom", zoom), [zoom]);
  // fresh server data is the truth again
  useEffect(() => setOverrides({}), [liveData.jobs]);
  // the plan with the page's own moves on it, and the part of it the shared filters show
  const jobs = data.jobs;
  const visibleJobs = useMemo(() => scope.jobs.filter((job) => job.startDate && job.endDate), [scope.jobs]);

  const criticalIds = useMemo(
    () =>
      new Set(
        cpm && !cpm.result.cycle
          ? Object.values(cpm.result.tasks)
              .filter((task) => task.critical)
              .map((task) => task.id)
          : []
      ),
    [cpm]
  );

  // at scale, the nearest GANTT_ROW_CAP jobs from today on (past work drops first); the rest are one filter away
  const todayIso = toIsoDate(startOfDay(new Date()));
  const chartJobs = useMemo(() => {
    if (visibleJobs.length <= GANTT_ROW_CAP) return visibleJobs;
    const upcoming = visibleJobs.filter((job) => job.endDate >= todayIso).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = visibleJobs.filter((job) => job.endDate < todayIso).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...upcoming, ...past].slice(0, GANTT_ROW_CAP);
  }, [visibleJobs, todayIso]);
  const hiddenRows = visibleJobs.length - chartJobs.length;

  const groups = useMemo<Group[]>(() => {
    const byProject = new Map<string, Row[]>();
    for (const job of chartJobs) {
      const start = parseIsoDate(job.startDate);
      const end = addDays(parseIsoDate(job.endDate < job.startDate ? job.startDate : job.endDate), 1); // exclusive end
      const task = cpm && !cpm.result.cycle ? cpm.result.tasks[job.id] : undefined;
      const baselineShifted =
        job.baselineStart && job.baselineEnd && (job.baselineStart !== job.startDate || job.baselineEnd !== job.endDate);
      const row: Row = {
        job,
        crews: crewNamesForJob(job.id),
        critical: Boolean(task?.critical),
        float: task ? task.totalFloat : null,
        ghost:
          baselineShifted && job.baselineStart && job.baselineEnd
            ? {
                startAt: parseIsoDate(job.baselineStart),
                endAt: addDays(parseIsoDate(job.baselineEnd), 1),
                title: `Baseline: ${formatDate(parseIsoDate(job.baselineStart), "MMM d")} – ${formatDate(parseIsoDate(job.baselineEnd), "MMM d, yyyy")}`
              }
            : undefined,
        feature: {
          id: job.id,
          name: job.name,
          startAt: start,
          endAt: end,
          status: STATUS_PALETTE[job.status] ?? STATUS_PALETTE["Not Started"],
          progress: job.percentComplete
        }
      };
      const rows = byProject.get(job.projectId) ?? [];
      rows.push(row);
      byProject.set(job.projectId, rows);
    }
    return [...byProject.entries()]
      .map(([projectId, rows]) => ({
        id: projectId,
        name: projectsById.get(projectId)?.name ?? "Unfiled",
        rows: rows.sort((a, b) => a.job.startDate.localeCompare(b.job.startDate) || a.job.name.localeCompare(b.job.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chartJobs, crewNamesForJob, projectsById, cpm]);
  // the flat row layout both the sidebar and the timeline window against
  const layout = useMemo(() => rowLayout(groups), [groups]);
  // only the links between bars on the chart; a 2,000-job plan has as many links, most of them off it
  const chartLinks = useMemo(() => {
    const links = data.dependencies ?? [];
    if (visibleJobs.length <= GANTT_ROW_CAP) return links;
    const onChart = new Set(chartJobs.map((job) => job.id));
    return links.filter((link) => onChart.has(link.predecessorId) && onChart.has(link.successorId));
  }, [data.dependencies, visibleJobs.length, chartJobs]);
  const linkRows = useMemo<GanttLinkRow[]>(
    () =>
      groups.flatMap((group) =>
        group.rows.map((row) => ({ id: row.job.id, name: row.job.name, startAt: row.feature.startAt, endAt: row.feature.endAt }))
      ),
    [groups]
  );

  const span = useMemo(() => {
    const dated = jobs.filter((job) => job.startDate && job.endDate);
    if (dated.length === 0) return undefined;
    const starts = dated.map((job) => job.startDate).sort();
    const ends = dated.map((job) => job.endDate).sort();
    return { start: addDays(parseIsoDate(starts[0]), -31), end: addDays(parseIsoDate(ends[ends.length - 1]), 31) };
  }, [jobs]);

  const chartIsEmpty = groups.length === 0;
  const initialDate = useMemo(() => {
    const today = startOfDay(new Date());
    const todayIso = toIsoDate(today);
    if (visibleJobs.some((job) => job.endDate >= todayIso && job.startDate <= toIsoDate(addDays(today, 60)))) return today;
    const earliest = visibleJobs.map((job) => job.startDate).sort()[0];
    return earliest ? parseIsoDate(earliest) : today;
    // the anchor is only read when the chart mounts; re-computing it on every filter change would fight the user's scrolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartIsEmpty]);

  const markers = useMemo(
    () =>
      data.projects
        .filter((project) => project.targetCompletion && (!filters.projectId || project.id === filters.projectId))
        .filter((project) => visibleJobs.some((job) => job.projectId === project.id))
        .map((project) => ({ id: `target-${project.id}`, date: parseIsoDate(project.targetCompletion), label: `${project.name} target` })),
    [data.projects, filters.projectId, visibleJobs]
  );

  // the workspace's holidays (Settings › Work calendar) as flags on the timeline, like the project targets
  const holidayMarkers = useMemo(
    () =>
      Object.entries(holidays).map(([date, name]) => ({
        id: `holiday-${date}`,
        date: parseIsoDate(date),
        label: name,
        className: "is-holiday"
      })),
    [holidays]
  );
  const jobName = (id: string) => jobsById.get(id)?.name ?? id;
  const legend = useMemo(() => STATUSES.filter((status) => visibleJobs.some((job) => job.status === status)), [visibleJobs]);

  const patchJob = useCallback(
    async (job: Job, patch: Partial<Job>, done: string) => {
      // the bar moves at once; fresh server data — or a refused save — settles it
      setOverrides((current) => ({ ...current, [job.id]: { ...current[job.id], ...patch } }));
      const ok = await saveJob(job, patch, done);
      if (!ok)
        setOverrides((current) => {
          const next = { ...current };
          delete next[job.id];
          return next;
        });
      return ok;
    },
    [saveJob]
  );

  const handleMove = useCallback(
    (id: string, startAt: Date, endAt: Date | null) => {
      const job = jobsById.get(id);
      if (!job || !endAt) return;
      const startDate = toIsoDate(startAt);
      const endDate = toIsoDate(addDays(endAt, -1));
      if (job.startDate === startDate && job.endDate === endDate) return;
      const label = `${job.name}: ${formatDate(startAt, "MMM d")} – ${formatDate(addDays(endAt, -1), "MMM d, yyyy")}`;
      void patchJob(job, { startDate, endDate }, label);
    },
    [jobsById, patchJob]
  );

  // "Week": the chart fits exactly the shared schedule week, so the stepper here is the one every schedule page has
  const chartRange: Range = range === "week" ? "daily" : range;
  const fit = range === "week" ? { start: weekStart, days: 7 } : undefined;
  const stepWeek = (days: number) => setWeekStart((start) => addDays(start, days));

  const zoomBy = (direction: 1 | -1) => {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (index === -1 ? 2 : index) + direction))];
    setZoom(next);
  };

  return (
    <div className="page-stack gantt-page hs-index">
      {/* the same KPIs as every schedule page, for the shared week; .sched-rx scopes their styles on this index-style page */}
      <div className="sched-rx gantt-shared">
        <ScheduleKpiGrid kpis={kpis} />
      </div>

      <div className="hs-index-main">
        <section className="hs-index-card gantt-card" aria-labelledby="gantt-index-title">
          <div className="hs-index-head">
            <h1 className="hs-index-title" id="gantt-index-title" data-tutorial-id="gantt-page-title">
              Gantt Chart
              {releaseTag}
            </h1>
            <div className="hs-index-actions">
              <button
                className="hs-btn"
                type="button"
                onClick={() => setScrollRequest({ date: startOfDay(new Date()), nonce: Date.now() })}
                title="Scroll to today"
              >
                <Crosshair size={15} /> Today
              </button>
              <ScheduleExportMenu
                scope={{
                  jobs: visibleJobs,
                  assignments: data.assignments,
                  crews: data.crews,
                  projects: data.projects,
                  includeUnbooked: true
                }}
                weekDays={weekIso}
                sheetTitle="Crew week sheets"
                filename="buildflow-gantt"
                buttonClassName="hs-btn"
                onNotice={say}
              />
              <button className="hs-btn" type="button" onClick={onOpenSchedule} title="Back to the Schedule overview">
                <CalendarDays size={16} /> Schedule
              </button>
            </div>
          </div>

          <div className="gantt-toolbar">
            <div className="gantt-seg" role="group" aria-label="Timeline range">
              {RANGES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={range === option.id ? "active" : undefined}
                  aria-pressed={range === option.id}
                  onClick={() => setRange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {range === "week" && (
              <div
                className="week-stepper gantt-week"
                aria-label={`Selected week ${formatDate(weekStart, "MMM d")} – ${formatDate(addDays(weekStart, 6), "MMM d, yyyy")}`}
              >
                <button className="hs-btn hs-btn-icon" type="button" aria-label="Previous week" onClick={() => stepWeek(-7)}>
                  <ChevronDown className="previous-week" size={16} />
                </button>
                <strong>
                  {formatDate(weekStart, "MMM d")} – {formatDate(addDays(weekStart, 6), "MMM d, yyyy")}
                </strong>
                <button className="hs-btn hs-btn-icon" type="button" aria-label="Next week" onClick={() => stepWeek(7)}>
                  <ChevronDown className="next-week" size={16} />
                </button>
                <button
                  className="hs-btn"
                  type="button"
                  onClick={() => setWeekStart(mondayOf(new Date()))}
                  hidden={isThisWeek}
                  title="Back to the current week"
                >
                  This week
                </button>
              </div>
            )}
            <div className="gantt-zoom" role="group" aria-label="Zoom">
              <button
                className="hs-btn hs-btn-icon"
                type="button"
                aria-label="Zoom out"
                disabled={range === "week" || zoom <= ZOOM_STEPS[0]}
                onClick={() => zoomBy(-1)}
              >
                <Minus size={15} />
              </button>
              <span className="gantt-zoom-value" aria-live="polite">
                {zoom}%
              </span>
              <button
                className="hs-btn hs-btn-icon"
                type="button"
                aria-label="Zoom in"
                disabled={range === "week" || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                onClick={() => zoomBy(1)}
              >
                <Plus size={15} />
              </button>
            </div>
            <ScheduleFilters data={data} context={context} onChange={updateContext} />
            <SavedViewsBar data={data} context={context} page="gantt" onChange={updateContext} onOpenPage={onOpenPage} reload={reload} />
            {legend.length > 0 && (
              <div className="gantt-legend" aria-label="Status legend">
                {legend.map((status) => (
                  <span key={status}>
                    <i style={{ background: STATUS_PALETTE[status].color }} aria-hidden="true" />
                    {status}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ScheduleNotice notice={notice} />

          {cpm && <ScheduleCpmSummary cpm={cpm} busy={busy} onSetBaseline={() => void saveBaseline()} />}
          {hiddenRows > 0 && (
            <p className="gantt-status gantt-cap-note" role="status">
              Showing the {GANTT_ROW_CAP} jobs nearest today of {visibleJobs.length} — filter by project, crew or week to see the rest.
            </p>
          )}
          <div className="gantt-frame" data-tutorial-id="gantt-timeline">
            {groups.length === 0 ? (
              <div className="gantt-empty">
                <div>
                  <strong>Nothing to chart yet.</strong>
                  {data.jobs.length === 0
                    ? "Add jobs from the Schedule page and they show up here as bars."
                    : "No jobs match these filters."}
                </div>
              </div>
            ) : (
              <GanttProvider
                range={chartRange}
                zoom={zoom}
                span={span}
                initialDate={initialDate}
                scrollRequest={scrollRequest}
                sidebarWidth={phone ? 160 : 300}
                rowHeight={phone ? 46 : 36}
                fit={fit}
              >
                <GanttSidebar title="Jobs" trailing="Duration">
                  <WindowedGroups
                    groups={groups}
                    layout={layout}
                    group={(group, children) => (
                      <GanttSidebarGroup name={group.name} trailing={String(group.rows.length)}>
                        {children}
                      </GanttSidebarGroup>
                    )}
                    row={(row) => (
                      <GanttSidebarItem
                        key={row.job.id}
                        feature={row.feature}
                        selected={row.job.id === selectedJob?.id}
                        onSelectItem={openJob}
                        meta={
                          [row.crews, row.critical ? "critical" : row.float != null ? `${row.float}d float` : ""]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                      />
                    )}
                  />
                </GanttSidebar>
                <GanttTimeline>
                  <GanttHeader />
                  <GanttFeatureList>
                    <WindowedGroups
                      groups={groups}
                      layout={layout}
                      group={(_group, children) => <GanttFeatureListGroup>{children}</GanttFeatureListGroup>}
                      row={(row) => (
                        <GanttContextMenu
                          key={row.job.id}
                          items={[
                            { label: "Open details", icon: <PencilLine size={16} />, onSelect: () => openJob(row.job.id) },
                            {
                              label: "Mark complete",
                              icon: <CheckCircle2 size={16} />,
                              disabled: row.job.status === "Complete",
                              onSelect: () => void patchJob(row.job, { status: "Complete" }, `${row.job.name} marked complete`)
                            },
                            { label: "Link to another job…", icon: <Link2 size={16} />, onSelect: () => setLinkFrom(row.job) },
                            ...dependencies
                              .filter((link) => link.predecessorId === row.job.id || link.successorId === row.job.id)
                              .slice(0, 4)
                              .map((link) => ({
                                label: `Unlink ${jobName(link.predecessorId === row.job.id ? link.successorId : link.predecessorId)} (${link.type})`,
                                icon: <Unlink size={16} />,
                                danger: true,
                                onSelect: () => void unlinkJobs(link)
                              })),
                            { label: "Open in Schedule", icon: <ExternalLink size={16} />, onSelect: onOpenSchedule }
                          ]}
                        >
                          <GanttFeatureItem
                            {...row.feature}
                            onMove={handleMove}
                            onSelect={openJob}
                            selected={row.job.id === selectedJob?.id}
                            barClassName={row.critical ? "is-critical" : undefined}
                            ghost={row.ghost}
                          />
                        </GanttContextMenu>
                      )}
                    />
                  </GanttFeatureList>
                  <GanttDependencyLinks links={chartLinks} rows={linkRows} critical={criticalIds} />
                  {markers.map((marker) => (
                    <GanttMarker key={marker.id} {...marker} />
                  ))}
                  {holidayMarkers.map((marker) => (
                    <GanttMarker key={marker.id} {...marker} />
                  ))}
                  <GanttToday />
                </GanttTimeline>
              </GanttProvider>
            )}
          </div>
          <p className="gantt-note">
            Drag a bar to move a job, drag either edge to change its dates, right-click a bar for actions — including linking it to the job
            that follows it. Arrows are dependencies — red on the critical path; a faint striped bar behind a job is its baseline. Flags
            mark each project's target completion and the workspace's holidays.
          </p>
        </section>
        <div className="sched-rx gantt-shared">
          <ScheduleAlertsPanel alerts={alerts} onOpen={openAlert} under />
        </div>
      </div>

      {conflictDialog}
      {linkFrom && (
        <GanttLinkDialog
          from={linkFrom}
          jobs={visibleJobs}
          existing={dependencies}
          onClose={() => setLinkFrom(null)}
          onLink={async (successor, type, lagDays) => {
            setLinkFrom(null);
            await linkJobs(linkFrom, successor, type, lagDays);
          }}
        />
      )}
      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          projectName={projectsById.get(selectedJob.projectId)?.name ?? "Unfiled"}
          crews={crewNamesForJob(selectedJob.id)}
          links={linksOf(selectedJob.id)}
          jobsById={jobsById}
          onLink={() => setLinkFrom(selectedJob)}
          onUnlink={(link) => void unlinkJobs(link)}
          onClose={closeDrawer}
          onOpenSchedule={onOpenSchedule}
          onSave={async (patch) => {
            const ok = await patchJob(selectedJob, patch, `${selectedJob.name} saved`);
            if (ok) closeDrawer();
          }}
        />
      )}
    </div>
  );
}
