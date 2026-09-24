/**
 * The Schedule Status band: the portfolio's forecast against the plan, from
 * GET /api/schedule/status — on the Dashboard, the Projects page and the Schedule landing.
 */
import { AnimatedFigure } from "../components/ui/animated-figure";
import type { Project } from "@buildflow/shared";
import { AlertTriangle, CalendarDays, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchScheduleStatus } from "../api";
import type { ScheduleStatusResponse } from "../api";
import { formatDate } from "../formatDate";

/**
 * Schedule Status — the portfolio headline, in the Buildots shape: one big
 * "N days ahead/behind", the week-over-week move beside it, the AI-forecast
 * completion date, and a per-project list with percent bars.
 *
 * Everything is derived server-side from the pace crews are reporting
 * (/api/schedule/status). The week-over-week line only renders once a prior
 * week's snapshot exists — a first-week install shows the headline without a
 * fabricated trend.
 */
/** "$12.4M" — contract totals belong on one line of a band, not in full digits. */
export function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 10_000_000 ? 0 : 1
  }).format(value);
}

export function ScheduleStatusBand({
  onOpenProjects,
  compact = false,
  projects = []
}: {
  onOpenProjects?: () => void;
  /** Strip form for the Schedule page: the same numbers, one line, no project list. */
  compact?: boolean;
  /** Bootstrap projects — the status endpoint knows pace, not price. Values are summed here. */
  projects?: Project[];
}) {
  // Portfolio value: total contract value of the priced projects, plus what is
  // still to earn (each project's unfinished share). Unpriced projects are
  // called out rather than counted as $0.
  const priced = projects.filter((project) => typeof project.value === "number" && project.value > 0);
  const portfolioValue = priced.reduce((sum, project) => sum + (project.value as number), 0);
  const remainingValue = priced.reduce(
    (sum, project) => sum + (project.value as number) * (Math.max(0, 100 - project.percentComplete) / 100),
    0
  );
  const unpriced = projects.length - priced.length;
  const [status, setStatus] = useState<ScheduleStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;
    fetchScheduleStatus()
      .then((payload) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A failed fetch is said out loud, with a way back. A payload without a
  // portfolio (a stub, an older server) is treated the same as no status at all.
  if (failed) {
    return (
      <div
        key="failed"
        className={`ss-strip ss-failed${compact ? " is-compact" : ""}`}
        role="status"
        aria-label="Schedule status"
        data-tutorial-id="schedule-status-band"
      >
        <AlertTriangle size={15} aria-hidden="true" />
        <span>Schedule status couldn't load.</span>
        <button type="button" className="ss-retry" onClick={() => setAttempt((current) => current + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (!status?.portfolio || !Array.isArray(status.projects) || status.projects.length === 0) {
    // the Schedule landing keeps the band's place (and the tour's anchor) while it loads or has nothing to compare yet
    if (!compact) return null;
    return (
      <div
        key="empty"
        className="ss-strip ss-empty is-compact"
        role="status"
        aria-label="Schedule status"
        data-tutorial-id="schedule-status-band"
      >
        <span>{status ? "No dated projects yet — the status band fills in as work is planned." : "Checking where the plan stands…"}</span>
      </div>
    );
  }

  const { portfolio } = status;
  const ahead = portfolio.daysAhead >= 0;
  const magnitude = Math.abs(portfolio.daysAhead);
  const delta = portfolio.daysAheadDelta;
  // "improved" means the gap moved toward on-time, whichever side of plan we're on
  const improved = delta != null && delta > 0;

  if (compact) {
    // The Schedule page already carries the week stepper, filters and the board;
    // the same three numbers go in as one line rather than a second hero.
    const latestForecast = status.projects.reduce(
      (latest, project) => (project.forecastFinish > latest ? project.forecastFinish : latest),
      status.projects[0].forecastFinish
    );
    return (
      <div
        /* The key is load-bearing. The reveal-on-scroll hook adds `.in` imperatively and only
           watches nodes that are ADDED; without a key React reuses the placeholder's <div> for
           this one (same type, same position), just rewriting its class and adding data-reveal,
           so nothing ever observed it and the loaded strip stayed at opacity 0. A key per
           state (and per trend, since a class change would drop `.in` too) makes each a fresh
           node the hook sees. */
        key={`ready-${ahead ? "ahead" : "behind"}`}
        className={`ss-strip ${ahead ? "is-ahead" : "is-behind"}`}
        data-reveal
        aria-label="Schedule status"
        data-tutorial-id="schedule-status-band"
      >
        <span className="ss-strip-figure">
          <strong>
            {ahead ? "+" : "−"}
            <AnimatedFigure text={magnitude} />d
          </strong>
          {ahead ? "ahead of plan" : "behind plan"}
        </span>
        {delta != null && delta !== 0 && (
          <span className={`ss-delta ${improved ? "up" : "down"}`}>
            {improved ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {improved ? "+" : "−"}
            {Math.abs(delta)}d vs last week
          </span>
        )}
        <span className="ss-strip-fact">
          <em>Complete</em>
          {portfolio.percentComplete}%
        </span>
        <span className="ss-strip-fact">
          <em>Behind</em>
          {portfolio.behindProjects} of {portfolio.projects}
        </span>
        <span className="ss-strip-fact ss-strip-finish">
          <Sparkles size={13} />
          <em>Forecast finish</em>
          {formatDate(latestForecast)}
        </span>
      </div>
    );
  }

  return (
    <section
      key={`band-${ahead ? "ahead" : "behind"}`}
      className={`ss-band ${ahead ? "is-ahead" : "is-behind"}`}
      data-reveal
      aria-label="Schedule status"
      data-tutorial-id="schedule-status-band"
    >
      <div className="ss-head">
        <span className="ss-eyebrow">
          <span className="dx-dot" />
          Schedule Status
        </span>
        <span className="ss-asof">Forecast from reported pace · {formatDate(status.asOf)}</span>
      </div>

      <div className="ss-headline">
        <div className="ss-figure">
          <strong>
            <AnimatedFigure text={magnitude} />
          </strong>
          <span>
            {magnitude === 1 ? "day" : "days"} {ahead ? "ahead" : "behind"}
          </span>
        </div>
        {delta != null && delta !== 0 && (
          <span className={`ss-delta ${improved ? "up" : "down"}`}>
            {improved ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {improved ? "Improved" : "Slipped"} by {Math.abs(delta)} {Math.abs(delta) === 1 ? "day" : "days"} from last week
          </span>
        )}
        {delta == null && <span className="ss-delta is-muted">Tracking from this week — the first comparison lands next week</span>}
      </div>

      <dl className="ss-facts">
        <div>
          <dt>Portfolio complete</dt>
          <dd>
            {portfolio.percentComplete}%
            {portfolio.percentDelta != null && portfolio.percentDelta !== 0 && (
              <em>
                {portfolio.percentDelta > 0 ? "+" : ""}
                {portfolio.percentDelta} pts
              </em>
            )}
          </dd>
        </div>
        <div>
          <dt>Projects behind</dt>
          <dd>
            {portfolio.behindProjects}
            <em>of {portfolio.projects}</em>
          </dd>
        </div>
        <div>
          <dt>Reporting jobs</dt>
          <dd>
            {portfolio.reportingJobs}
            <em>of {portfolio.totalJobs}</em>
          </dd>
        </div>
        {projects.length > 0 && (
          <div>
            <dt>Portfolio value</dt>
            <dd>
              {priced.length > 0 ? compactMoney(portfolioValue) : "—"}
              {priced.length > 0 && unpriced === 0 && <em>{compactMoney(remainingValue)} to go</em>}
              {unpriced > 0 && (
                <em>
                  {unpriced} of {projects.length} not priced
                </em>
              )}
            </dd>
          </div>
        )}
      </dl>

      <ul className="ss-projects">
        {status.projects.map((project) => (
          <li key={project.projectId}>
            <button type="button" className="ss-project" onClick={onOpenProjects}>
              <span className="ss-project-name">{project.name}</span>
              <span className="ss-project-track" aria-hidden="true">
                <i style={{ "--ss-progress": `${project.percentComplete}%` } as CSSProperties} />
              </span>
              <span className="ss-project-pct">{project.percentComplete}%</span>
              <span className={`ss-project-days ${project.daysAhead >= 0 ? "ahead" : "behind"}`}>
                {project.daysAhead >= 0 ? "+" : "−"}
                {Math.abs(project.daysAhead)}d
              </span>
              <span className="ss-project-finish">
                <CalendarDays size={14} />
                {formatDate(project.forecastFinish)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
