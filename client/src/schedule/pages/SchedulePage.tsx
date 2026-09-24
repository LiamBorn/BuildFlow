/**
 * The Schedule landing and the panels only it draws: the view cards, the unbooked
 * queue, crew availability, upcoming milestones and the field-variance review.
 * It stands in the shared page frame (schedule/page.tsx) like the three views it opens.
 */
import type { SchedulePage as SchedulePageId } from "../useScheduleContext";
import type { BootstrapPayload, Crew, FieldUpdate, Job, Project, ScheduleVariance, User } from "@buildflow/shared";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  GanttChartSquare,
  LayoutGrid,
  ListChecks,
  Plus,
  ShieldAlert,
  Sparkles,
  SquareKanban,
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
import type { ScheduleTarget } from "../links";
import { viewKeyFor } from "../viewKeys";
import { WeeklyDigestPanel } from "../WeeklyDigest";
import { FirstRunPanel, firstRunNeeded } from "../FirstRun";
import { ScheduleExportMenu } from "../ExportMenu";
import { ScheduleImportDialog } from "../ScheduleImportDialog";
import { SchedulePageFrame, useSchedulePage, type ScheduleSection } from "../page";
import { CallOffTag, jobCallOffs, useCallOffs } from "../callOffs";

export function CrewAvailabilityPanel({
  crews,
  utilizationById,
  onManage,
  headless = false
}: {
  crews: Crew[];
  /** This week's booked-days percent per crew; a crew missing here shows its stored figure. */
  utilizationById?: Map<string, number>;
  onManage: () => void;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
}) {
  const rows = [...crews].sort((left, right) => crewScheduleOrder(left) - crewScheduleOrder(right)).slice(0, 5);
  return (
    <section className={`sched-rail-panel${headless ? " is-headless" : ""}`}>
      {!headless && (
        <div className="sched-rail-head">
          <h2>Crew Availability</h2>
          <button type="button" className="sched-rail-link" onClick={onManage}>
            View all
          </button>
        </div>
      )}
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

export function UpcomingMilestonesPanel({
  milestones,
  onViewAll,
  headless = false
}: {
  milestones: ScheduleMilestone[];
  onViewAll: () => void;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
}) {
  const rows = milestones.slice(0, 4);
  return (
    <section className={`sched-rail-panel${headless ? " is-headless" : ""}`}>
      {!headless && (
        <div className="sched-rail-head">
          <h2>Upcoming Milestones</h2>
          <button type="button" className="sched-rail-link" onClick={onViewAll}>
            View all
          </button>
        </div>
      )}
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
  monthAnchor,
  onOpen,
  headless = false
}: {
  jobs: Job[];
  monthAnchor: string;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
  onOpen: (page: SchedulePageId) => void;
}) {
  const monthKey = monthAnchor.slice(0, 7);
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
    }
  ];
  return (
    <section
      className={`sched-home-section${headless ? " is-headless" : ""}`}
      aria-label="Schedule views"
      data-tutorial-id="schedule-views"
    >
      {!headless && (
        <header>
          <h2>Open a view</h2>
          <span>The week and filters follow you · keys 1–6 open a view</span>
        </header>
      )}
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
export function ScheduleQueuePanel({
  jobs,
  onBook,
  headless = false
}: {
  jobs: Job[];
  onBook: (job: Job) => void;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
}) {
  // a job whose crew went with a day WeatherIQ called off is not waiting on a booking; it says so (../callOffs)
  const callOffs = useCallOffs();
  return (
    <section className={`sched-home-section${headless ? " is-headless" : ""}`} aria-label="Unassigned jobs">
      {!headless && (
        <header>
          <h2>Unassigned Jobs</h2>
          <span>{jobs.length === 0 ? "Every job in view has a crew booked" : "Book them on the Week board"}</span>
        </header>
      )}
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
              <CallOffTag callOffs={jobCallOffs(callOffs, job.id)} today={callOffs.today} />
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
 * own page (Month, Gantt Chart, Kanban); this page points at them, and the filters and
 * the week it shows follow you there through the schedule context.
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
          ? "Open a view to change the plan: drag chips on the Month calendar, bars on the Gantt Chart, cards on the Kanban."
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

  /* The page's sections, as panels on the board (2026-09-15): the same order the page read in —
     get started (while there is setting up to do), the views, what changed, the variances, the
     unbooked queue — then the rail's three. The frame adds the KPIs, the filters and the saved
     views ahead of them. Every one starts full width, one under the next. */
  const showFirstRun = firstRunNeeded(data) || Boolean(data.sampleData);
  /* `label` is what it SAYS and `names` is what it IS. Three panels on this page carry a "View
     all" — alerts, crew availability, milestones — and read out by their visible text alone they
     are three buttons called "View all" with nothing to tell them apart; the panel title that
     distinguishes them is not part of the button's accessible name. The spoken name says which,
     and keeps the visible words inside it (WCAG 2.5.3), so "View all" still selects it by voice. */
  const viewAllButton = (label: string, onClick: () => void, names?: string) => (
    <button type="button" className="sched-rail-link" aria-label={names ?? label} onClick={onClick}>
      {label}
    </button>
  );
  const sections: ScheduleSection[] = [
    ...(showFirstRun
      ? [
          {
            id: "firstRun",
            title: data.sampleData ? "Exploring with sample data" : "Set up your schedule",
            icon: Sparkles,
            group: "Planning",
            blurb: "Four steps from an empty workspace to a booked week, or the starter workspace for your trade while you look around.",
            body: (
              <FirstRunPanel
                headless
                data={data}
                reload={reload}
                onNotice={say}
                onAddJob={newActivity}
                onImport={() => setImportOpen(true)}
                onOpenPage={onOpenPage}
              />
            ),
            h: 6
          }
        ]
      : []),
    {
      id: "views",
      title: "Open a view",
      icon: LayoutGrid,
      group: "Planning",
      blurb: "The three schedule views — Month, Gantt Chart, Kanban — one click each, on the week and filters you have here.",
      action: <span className="sched-section-note">The week and filters follow you · keys 1–3 open a view</span>,
      body: <ScheduleViewCards headless jobs={jobs} monthAnchor={monthAnchor} onOpen={(target) => openView(target)} />,
      h: 5
    },
    {
      id: "digest",
      title: "What changed this week",
      icon: TrendingUp,
      group: "Performance",
      blurb: "What moved since last Monday's snapshot, and the digest email on request.",
      body: <WeeklyDigestPanel headless onNotice={say} />,
      h: 4
    },
    {
      id: "variances",
      title: "Field variances",
      icon: ShieldAlert,
      group: "Attention",
      blurb: "Field reports that disagree with the plan, waiting on an accept or a reject.",
      body: (
        <div className="sv-drawer is-headless" aria-label="Field variance review">
          <p className="sched-section-note">
            The field reported progress that disagrees with the plan. Nothing has changed yet — accepting applies the forecastIQ and its
            knock-ons to the master schedule.
          </p>
          {pendingVariances.length > 0 ? (
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
          ) : (
            <p className="helper-text">No field variances waiting on you.</p>
          )}
        </div>
      ),
      h: 4
    },
    {
      id: "queue",
      title: "Unassigned Jobs",
      icon: ListChecks,
      group: "Planning",
      blurb: "Jobs in view with no crew booked yet, each one click from its day on the Month calendar.",
      action: (
        <span className="sched-section-note">
          {unassigned.length === 0 ? "Every job in view has a crew booked" : "Book them from the Month calendar"}
        </span>
      ),
      body: (
        <ScheduleQueuePanel
          headless
          jobs={unassigned}
          // the job's month: its chip is on its start day there, and the day's "+" books it on a crew
          onBook={(job) => openView("month", { monthAnchor: firstOfScheduleMonth(job.startDate) })}
        />
      ),
      h: 5
    },
    {
      id: "alerts",
      title: "Schedule Alerts",
      icon: AlertTriangle,
      group: "Attention",
      blurb: "Conflicts, unbooked work and slips in what the filters show.",
      action: viewAllButton("View all", viewAllAlerts, "View all alerts"),
      body: <ScheduleAlertsPanel headless alerts={alerts} onOpen={openAlert} />,
      h: 5
    },
    {
      id: "crews",
      title: "Crew Availability",
      icon: Users,
      group: "Performance",
      blurb: "Each crew's booked days this week, and who has room.",
      // the crews themselves: the Crews page is where a crew is read whole and managed
      action: viewAllButton("View all", () => openView("crews"), "View all crew availability"),
      body: <CrewAvailabilityPanel headless crews={crews} utilizationById={utilizationById} onManage={() => openView("crews")} />,
      h: 5
    },
    {
      id: "milestones",
      title: "Upcoming Milestones",
      icon: CalendarDays,
      group: "Attention",
      blurb: "The next project milestones, by date.",
      action: viewAllButton(
        "View all",
        () => openView("month", milestones[0] ? { monthAnchor: firstOfScheduleMonth(milestones[0].date) } : {}),
        "View all upcoming milestones"
      ),
      body: (
        <UpcomingMilestonesPanel
          headless
          milestones={milestones}
          onViewAll={() => openView("month", milestones[0] ? { monthAnchor: firstOfScheduleMonth(milestones[0].date) } : {})}
        />
      ),
      h: 4
    }
  ];

  return (
    <SchedulePageFrame
      page={page}
      motion
      sections={sections}
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
      onBooked={(booking) => openView("month", { monthAnchor: firstOfScheduleMonth(booking.date) })}
      dialogs={
        <>
          {importOpen && (
            <ScheduleImportDialog onClose={() => setImportOpen(false)} onImported={reload} defaultLocation={data.projects[0]?.location} />
          )}
          {scheduleDialog && <ScheduleDialogPanel dialog={scheduleDialog} onClose={() => setScheduleDialog(null)} />}
        </>
      }
    >
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
