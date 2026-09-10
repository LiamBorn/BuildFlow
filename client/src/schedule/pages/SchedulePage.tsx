/**
 * The Schedule landing and the panels only it draws: the view cards, the unbooked
 * queue, crew availability, upcoming milestones and the field-variance review.
 * It stands in the shared page frame (schedule/page.tsx) like the six views it opens.
 */
import type { SchedulePage as SchedulePageId } from "../useScheduleContext";
import type { BootstrapPayload, Crew, FieldUpdate, Job, Project, ScheduleAssignment, ScheduleVariance, User } from "@buildflow/shared";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  GanttChartSquare,
  List,
  Plus,
  ShieldAlert,
  SquareKanban,
  Table2,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import { acceptVariance, rejectVariance } from "../../api";
import { ScheduleAlertsPanel } from "../alerts";
import { ScheduleCpmSummary } from "../cpm";
import {
  ScheduleBadge,
  ScheduleDialogPanel,
  ScheduleNotice,
  crewAvailability,
  crewScheduleOrder,
  crewWeekUtilization,
  deriveScheduleMilestones,
  firstOfScheduleMonth,
  formatScheduleDate,
  formatScheduleMonth,
  plural,
  tradeColorVar
} from "../parts";
import type { ScheduleDialog, ScheduleMilestone } from "../parts";
import { ScheduleStatusBand } from "../ScheduleStatusBand";
import type { ScheduleContext } from "../useScheduleContext";
import { startOfScheduleWeek } from "../week";
import type { ScheduleTarget } from "../links";
import { viewKeyFor } from "../viewKeys";
import { WeeklyDigestPanel } from "../WeeklyDigest";
import { FirstRunPanel } from "../FirstRun";
import { ScheduleExportMenu } from "../ExportMenu";
import { ScheduleImportDialog } from "../ScheduleImportDialog";
import { SchedulePageFrame, useSchedulePage } from "../page";

export function CrewAvailabilityPanel({
  crews,
  utilizationById,
  onManage
}: {
  crews: Crew[];
  /** This week's booked-days percent per crew; a crew missing here shows its stored figure. */
  utilizationById?: Map<string, number>;
  onManage: () => void;
}) {
  const rows = [...crews].sort((left, right) => crewScheduleOrder(left) - crewScheduleOrder(right)).slice(0, 5);
  return (
    <section className="sched-rail-panel">
      <div className="sched-rail-head">
        <h2>Crew Availability</h2>
        <button type="button" className="sched-rail-link" onClick={onManage}>
          View all
        </button>
      </div>
      {rows.length > 0 ? (
        <div className="sched-avail-list">
          {rows.map((crew) => {
            const availability = crewAvailability(crew, utilizationById?.get(crew.id));
            return (
              <div className="sched-avail-row" key={crew.id}>
                <span className="sched-avail-name">{crew.name}</span>
                <span className={`sched-avail-badge ${availability.cls}`}>{availability.label}</span>
                <span className="sched-avail-ratio">{availability.ratio}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="cc-empty-line">No crews created yet.</p>
      )}
      <button type="button" className="sched-rail-foot-btn" onClick={onManage}>
        Manage Crews
      </button>
    </section>
  );
}

export function UpcomingMilestonesPanel({ milestones, onViewAll }: { milestones: ScheduleMilestone[]; onViewAll: () => void }) {
  const rows = milestones.slice(0, 4);
  return (
    <section className="sched-rail-panel">
      <div className="sched-rail-head">
        <h2>Upcoming Milestones</h2>
        <button type="button" className="sched-rail-link" onClick={onViewAll}>
          View all
        </button>
      </div>
      {rows.length > 0 ? (
        <div className="sched-miles-list">
          {rows.map((milestone) => (
            <div className="sched-mile-row" key={milestone.id}>
              <span className="sched-mile-ico" style={{ "--sc-tone": tradeColorVar(milestone.tone) } as CSSProperties}>
                <CalendarDays size={16} />
              </span>
              <div className="sched-mile-body">
                <strong>{milestone.title}</strong>
                <span>{milestone.project}</span>
              </div>
              <span className="sched-mile-date">{formatScheduleDate(milestone.date)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="cc-empty-line">No upcoming milestones.</p>
      )}
      <button type="button" className="sched-rail-foot-btn" onClick={onViewAll}>
        View all milestones
      </button>
    </section>
  );
}

export function formatVarianceDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function VarianceReviewCard({
  variance,
  job,
  project,
  update,
  reporter,
  busy,
  onAccept,
  onReject
}: {
  variance: ScheduleVariance;
  job?: Job;
  project?: Project;
  update?: FieldUpdate;
  reporter?: User;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { proposal } = variance;
  const drift = Math.abs(variance.varianceDays);
  const late = variance.varianceDays > 0;

  return (
    <article className={`sv-card sv-sev-${variance.severity.toLowerCase()}`}>
      <header className="sv-card-head">
        <div>
          <h3>{job?.phase ?? job?.name ?? "Unknown job"}</h3>
          <p>{project?.name ?? "—"}</p>
        </div>
        <span className={`sv-sev-pill sv-sev-${variance.severity.toLowerCase()}`}>{variance.severity}</span>
      </header>

      {/* What the field actually said. */}
      <div className="sv-evidence">
        {update?.photos[0] && <img src={update.photos[0]} alt="" className="sv-photo" />}
        <blockquote>
          <p>{update?.message ?? "No note attached."}</p>
          <cite>
            {reporter?.name ?? "Field"} · {formatVarianceDate(variance.detectedAt)}
          </cite>
        </blockquote>
      </div>

      {/* The numbers behind the flag. */}
      <div className="sv-numbers">
        <div className="sv-metric">
          <span>Reported</span>
          <strong>{variance.reportedPercent}%</strong>
        </div>
        <div className="sv-metric">
          <span>Planned</span>
          <strong>{variance.plannedPercent}%</strong>
        </div>
        <div className="sv-metric">
          <span>ForecastIQ finish</span>
          <strong className={late ? "sv-late" : "sv-early"}>{formatVarianceDate(proposal.proposedEnd)}</strong>
          <em>plan {formatVarianceDate(proposal.currentEnd)}</em>
        </div>
      </div>

      {/* The consequence — the reason this is a decision and not a notification. */}
      <ul className="sv-impact">
        {proposal.criticalPath && (
          <li className="sv-impact-critical">
            <Zap size={14} /> On the critical path
          </li>
        )}
        {!proposal.criticalPath && proposal.totalFloatDays > 0 && (
          <li>
            <Clock size={14} /> {proposal.totalFloatDays} day{proposal.totalFloatDays === 1 ? "" : "s"} of float
          </li>
        )}
        <li>
          <TrendingUp size={14} /> ForecastIQs {drift} day{drift === 1 ? "" : "s"} {late ? "late" : "early"}
        </li>
        <li className={proposal.projectSlipDays > 0 ? "sv-impact-critical" : ""}>
          <ArrowRight size={14} />
          {proposal.projectSlipDays > 0
            ? `Project finish moves ${proposal.projectSlipDays} day${proposal.projectSlipDays === 1 ? "" : "s"}`
            : "Project finish holds — float absorbs it"}
        </li>
      </ul>

      {proposal.ripple.length > 0 && (
        <details className="sv-ripple">
          <summary>
            Pushes {proposal.ripple.length} downstream job{proposal.ripple.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {proposal.ripple.map((item) => (
              <li key={item.jobId}>
                <span className="sv-ripple-name">{item.jobName}</span>
                <span className="sv-ripple-move">
                  {formatVarianceDate(item.currentStart)} → {formatVarianceDate(item.proposedStart)}
                  <em>+{item.shiftDays}d</em>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="sv-actions">
        <button type="button" className="sv-reject" disabled={busy} onClick={onReject}>
          Keep the plan
        </button>
        <button type="button" className="sv-accept" disabled={busy} onClick={onAccept}>
          <Check size={15} /> Accept → schedule
        </button>
      </footer>
    </article>
  );
}

/** A card per schedule view, each with a live figure for what the filters show; opening one lands on its page. */
export function ScheduleViewCards({
  jobs,
  crews,
  weekAssignments,
  monthAnchor,
  onOpen
}: {
  jobs: Job[];
  crews: Crew[];
  weekAssignments: ScheduleAssignment[];
  monthAnchor: string;
  onOpen: (page: SchedulePageId) => void;
}) {
  const monthKey = monthAnchor.slice(0, 7);
  const crewDaysBooked = crews.length ? Math.round((100 * weekAssignments.length) / (crews.length * 5)) : 0;
  const inProgress = jobs.filter((job) => job.status === "In Progress" || job.status === "On Site").length;
  const views: Array<{ page: SchedulePageId; icon: LucideIcon; title: string; text: string; figure: string }> = [
    {
      page: "month",
      icon: CalendarDays,
      title: "Month",
      text: "Every job on its start day, with milestones and holidays.",
      figure: `${plural(jobs.filter((job) => job.startDate.slice(0, 7) === monthKey).length, "job")} start in ${formatScheduleMonth(monthAnchor)}`
    },
    {
      page: "week",
      icon: Users,
      title: "Week",
      text: "Crews by row, days by column. Drag to re-book, or book straight from the queue.",
      figure: `${plural(weekAssignments.length, "booking")} · ${plural(crews.length, "crew")}`
    },
    {
      page: "list",
      icon: List,
      title: "List",
      text: "This week's bookings in time order, day by day.",
      figure: `${plural(weekAssignments.length, "booking")} this week`
    },
    {
      page: "gantt",
      icon: GanttChartSquare,
      title: "Gantt Chart",
      text: "Every job as a bar on the timeline, grouped by project.",
      figure: `${plural(jobs.length, "job")} across ${plural(new Set(jobs.map((job) => job.projectId)).size, "project")}`
    },
    {
      page: "kanban",
      icon: SquareKanban,
      title: "Kanban",
      text: "Jobs by status. Drag a card to move it along.",
      figure: `${inProgress} in progress`
    },
    {
      page: "matrix",
      icon: Table2,
      title: "Matrix",
      text: "How booked each crew is this week, and where the conflicts are.",
      figure: `${crewDaysBooked}% of crew-days booked`
    }
  ];
  return (
    <section className="sched-home-section" aria-label="Schedule views" data-tutorial-id="schedule-views">
      <header>
        <h2>Open a view</h2>
        <span>The week and filters follow you · keys 1–6 open a view</span>
      </header>
      <div className="sched-views">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <button type="button" className="sched-view-card" key={view.page} onClick={() => onOpen(view.page)}>
              <span className="sched-view-ico">
                <Icon />
              </span>
              <kbd className="sched-view-key" aria-hidden="true">
                {viewKeyFor(view.page)}
              </kbd>
              <strong>{view.title}</strong>
              <span>{view.text}</span>
              <b>{view.figure}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Jobs with no crew booked yet; each opens the Week board on the job's week, where the queue can be dragged onto a cell. */
export function ScheduleQueuePanel({ jobs, onBook }: { jobs: Job[]; onBook: (job: Job) => void }) {
  return (
    <section className="sched-home-section" aria-label="Unassigned jobs">
      <header>
        <h2>Unassigned Jobs</h2>
        <span>{jobs.length === 0 ? "Every job in view has a crew booked" : "Book them on the Week board"}</span>
      </header>
      {jobs.length > 0 ? (
        <div className="sched-queue">
          {jobs.slice(0, 6).map((job) => (
            <div className="sched-queue-row" key={job.id}>
              <span>
                <strong>{job.name}</strong>
                {job.phase} ·{" "}
                {job.startDate === job.endDate
                  ? formatScheduleDate(job.startDate)
                  : `${formatScheduleDate(job.startDate)} – ${formatScheduleDate(job.endDate)}`}
              </span>
              <ScheduleBadge status={job.status} />
              <button type="button" className="sched-book" onClick={() => onBook(job)}>
                Book
              </button>
            </div>
          ))}
          {jobs.length > 6 && <p className="helper-text">{jobs.length - 6} more on the Week board.</p>}
        </div>
      ) : (
        <p className="helper-text">Create a project and job to see work waiting for a crew.</p>
      )}
    </section>
  );
}

/**
 * The Schedule landing: the whole plan at a glance — status and the critical path,
 * this week's numbers, alerts, field variances, the unbooked queue, crew availability
 * and milestones — and a card per view that opens its page. Every view lives on its
 * own page (Month, Week, List, Gantt Chart, Kanban, Matrix); this page points at them,
 * and the filters and the week it shows follow you there through the schedule context.
 */
export function SchedulePage({
  data: liveData,
  reload,
  onOpenPage
}: {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onOpenPage: (page: ScheduleTarget) => void;
}) {
  const page = useSchedulePage({ data: liveData, reload, onOpenPage, page: "schedule", cpm: true });
  const {
    data,
    updateContext,
    jobs,
    crews,
    weekIso,
    weekStartIso,
    weekEndIso,
    weekRange,
    weekAssignments,
    unassigned,
    today,
    monthAnchor,
    newActivity,
    kpis,
    cpm,
    alerts,
    openAlert,
    notice,
    say,
    busy,
    saveBaseline
  } = page;
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialog | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [resolvingVarianceId, setResolvingVarianceId] = useState<string | null>(null);

  const utilizationById = new Map(crews.map((crew) => [crew.id, crewWeekUtilization(crew, weekAssignments, kpis.workingDays)]));
  const pendingVariances = data.variances.filter((variance) => variance.status === "pending");
  const milestones = deriveScheduleMilestones(data).filter((milestone) => milestone.date >= today);

  // every way off this page goes through the shared context, so the target opens on the same week and filters
  const openView = (target: ScheduleTarget, patch: Partial<ScheduleContext> = {}) => {
    if (Object.keys(patch).length > 0) updateContext(patch);
    onOpenPage(target);
  };
  const viewAllAlerts = () =>
    setScheduleDialog({
      title: "Scheduling Alerts",
      description: alerts.length > 0 ? "Current alerts for what the filters show." : "No scheduling alerts right now.",
      items:
        alerts.length > 0
          ? alerts.map((alert) => `${alert.title}: ${alert.detail}`)
          : ["Add projects, jobs, crews and bookings to surface schedule alerts."]
    });
  const openFooterInfo = (title: string) =>
    setScheduleDialog({
      title,
      description:
        title === "Help Center"
          ? "Open a view to change the plan: drag cards on the Week board, chips on the Month calendar, rows on the List."
          : `${title} details are available for the BuildFlow Schedule workspace.`,
      items:
        title === "Help Center"
          ? ["The filters and the week you pick here follow you to every schedule view."]
          : ["This demo keeps the policy content in-app without navigating away from Schedule."]
    });

  /**
   * The only path by which a field report reaches the master schedule. Accept
   * moves the dates the proposal named; reject leaves the plan untouched and
   * keeps the report on the record either way.
   */
  async function resolveVariance(id: string, decision: "accept" | "reject") {
    if (resolvingVarianceId) return;
    setResolvingVarianceId(id);
    try {
      if (decision === "accept") await acceptVariance(id, data.activeUser.id);
      else await rejectVariance(id, data.activeUser.id);
      await reload();
    } catch (error) {
      // an unresolved variance is the safe failure: the schedule did not change and the decision still waits
      say(`Could not ${decision} the variance: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
    } finally {
      setResolvingVarianceId(null);
    }
  }

  return (
    <SchedulePageFrame
      page={page}
      motion
      eyebrow={<>Schedule · {weekRange}</>}
      title={
        <>
          The whole plan, <em>at a glance.</em>
        </>
      }
      sub="Status, alerts, field variances and the unbooked queue in one place. Open a view to change the plan."
      band={<ScheduleStatusBand compact projects={data.projects} />}
      controls={
        <>
          <div className="filter-strip">
            {cpm && <ScheduleCpmSummary cpm={cpm} busy={busy} onSetBaseline={() => void saveBaseline()} />}
          </div>
          <div className="filter-strip schedule-view-controls">
            {/* the same export as every view: this week's bookings, the crew sheets, the feeds */}
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
              filename={`buildflow-schedule-${weekStartIso}`}
              buttonClassName="outline-button"
              onNotice={say}
            />
            <button type="button" className="sched-new-activity" onClick={newActivity}>
              <Plus size={16} /> New Activity
            </button>
          </div>
        </>
      }
      board={false}
      alerts={false}
      onBooked={(booking) => openView("week", { weekStart: startOfScheduleWeek(booking.date) })}
      dialogs={
        <>
          {importOpen && (
            <ScheduleImportDialog onClose={() => setImportOpen(false)} onImported={reload} defaultLocation={data.projects[0]?.location} />
          )}
          {scheduleDialog && <ScheduleDialogPanel dialog={scheduleDialog} onClose={() => setScheduleDialog(null)} />}
        </>
      }
    >
      <ScheduleNotice notice={notice} />
      <div className="schedule-layout" data-reveal>
        <div className="sched-home-main">
          <FirstRunPanel
            data={data}
            reload={reload}
            onNotice={say}
            onAddJob={newActivity}
            onImport={() => setImportOpen(true)}
            onOpenPage={onOpenPage}
          />
          <ScheduleViewCards
            jobs={jobs}
            crews={crews}
            weekAssignments={weekAssignments}
            monthAnchor={monthAnchor}
            onOpen={(target) => openView(target)}
          />
          <WeeklyDigestPanel onNotice={say} />
          {pendingVariances.length > 0 && (
            <section className="sv-drawer" aria-label="Field variance review">
              <header className="sv-drawer-head">
                <div>
                  <h2>
                    <ShieldAlert size={18} /> Field variances
                  </h2>
                  <p>
                    The field reported progress that disagrees with the plan. Nothing has changed yet — accepting applies the forecastIQ and
                    its knock-ons to the master schedule.
                  </p>
                </div>
              </header>
              <div className="sv-drawer-list">
                {pendingVariances.map((variance) => (
                  <VarianceReviewCard
                    key={variance.id}
                    variance={variance}
                    job={data.jobs.find((job) => job.id === variance.jobId)}
                    project={data.projects.find((project) => project.id === variance.projectId)}
                    update={data.fieldUpdates.find((item) => item.id === variance.fieldUpdateId)}
                    reporter={data.users.find(
                      (user) => user.id === data.fieldUpdates.find((item) => item.id === variance.fieldUpdateId)?.userId
                    )}
                    busy={resolvingVarianceId === variance.id}
                    onAccept={() => void resolveVariance(variance.id, "accept")}
                    onReject={() => void resolveVariance(variance.id, "reject")}
                  />
                ))}
              </div>
            </section>
          )}
          <ScheduleQueuePanel jobs={unassigned} onBook={(job) => openView("week", { weekStart: startOfScheduleWeek(job.startDate) })} />
        </div>
        <aside className="side-stack schedule-side-rail">
          <ScheduleAlertsPanel alerts={alerts} onOpen={openAlert} onViewAll={viewAllAlerts} />
          <CrewAvailabilityPanel crews={crews} utilizationById={utilizationById} onManage={() => openView("matrix")} />
          <UpcomingMilestonesPanel
            milestones={milestones}
            onViewAll={() => openView("month", milestones[0] ? { monthAnchor: firstOfScheduleMonth(milestones[0].date) } : {})}
          />
        </aside>
      </div>

      <footer className="schedule-page-footer" data-reveal>
        <span>© 2026 BuildFlow HUD, Inc. All rights reserved.</span>
        <nav aria-label="Schedule footer links">
          <button type="button" onClick={() => openFooterInfo("Privacy Policy")}>
            Privacy Policy
          </button>
          <button type="button" onClick={() => openFooterInfo("Terms of Service")}>
            Terms of Service
          </button>
          <button type="button" onClick={() => openFooterInfo("Help Center")}>
            Help Center
          </button>
        </nav>
      </footer>
    </SchedulePageFrame>
  );
}
