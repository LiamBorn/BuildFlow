/**
 * Schedule Alerts, the same on every schedule page: a double-booked crew, the open
 * DelayIQ, the weather warning and missing materials for whatever the page's
 * filters show. Each alert links to the place it is dealt with.
 */
import { AlertTriangle, CloudSun, Truck } from "lucide-react";
import type { BootstrapPayload, Job, ScheduleAssignment } from "@buildflow/shared";
import { parseIsoDate, toIsoDate } from "../components/ui/gantt";
import { bookingsWithoutCrew } from "./filters";
import { formatScheduleDate, mondayOf } from "./week";

/** Where an alert takes you: the Week board on that week, or the page that owns the problem. */
/* "inventory" since 2026-09-23: the Materials page became part of the one Inventory list. */
export type ScheduleAlertPage = "month" | "delayIQs" | "inventory";
export type ScheduleAlertLink = { page: ScheduleAlertPage; weekStart?: string };

export type ScheduleAlert = {
  id: string;
  tone: "danger" | "warning" | "info";
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  /** How old the alert is, or how far off the weather is — null when its source carries no time. */
  when: string | null;
  jobId: string | null;
  date: string | null;
  link: ScheduleAlertLink;
};

const projectName = (data: BootstrapPayload, projectId: string | null | undefined) =>
  data.projects.find((project) => project.id === projectId)?.name ?? "Project";
const weekOf = (date: string) => toIsoDate(mondayOf(parseIsoDate(date)));

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

/**
 * How long ago something happened, or how far off it still is.
 *
 * Every row here used to carry a literal — "10m ago", "22m ago", "45m ago", "2h ago" — so the
 * panel whose job is to say how fresh a warning is read the same on every load, in every
 * workspace, for ever. Each row now counts from its own timestamp, and a source that carries
 * no time says nothing rather than something invented.
 *
 * Counts down, never up: "1h ago" means at least an hour, not nearly two.
 */
export function relativeTime(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  // A date with no clock is that day where the workspace is, not in UTC.
  const at = Date.parse(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(at)) return null;
  const seconds = Math.round((now.getTime() - at) / 1000);
  const size = Math.abs(seconds);
  const span =
    size < 90 * MINUTE
      ? `${Math.max(1, Math.floor(size / MINUTE))}m`
      : size < 36 * HOUR
        ? `${Math.floor(size / HOUR)}h`
        : `${Math.floor(size / DAY)}d`;
  return seconds >= 0 ? `${span} ago` : `in ${span}`;
}

/**
 * The alerts the schedule raises for what is in view.
 *
 * The conflict and the materials warning already come from the page's own bookings and jobs.
 * The DelayIQ and the weather warning used to be read straight off the payload, so a board
 * filtered to one project kept listing other projects' problems beside a chip saying it was
 * showing one project. They are held to the same scope now: in view when a job of their project
 * is. A weather warning with no project is about every site, so it stays whatever the filters say.
 */
export function deriveScheduleAlerts(
  data: BootstrapPayload,
  jobs: Job[],
  assignments: ScheduleAssignment[],
  now: Date = new Date()
): ScheduleAlert[] {
  const visibleProjects = new Set(jobs.map((job) => job.projectId));
  // Not scoped, on purpose: this is work the page cannot draw at all, whatever the filters say.
  const orphans = bookingsWithoutCrew(data);
  const conflict = assignments.find((assignment) => assignment.conflicts.length > 0);
  const openDelayIQ = data.delayIQs.find((delayIQ) => delayIQ.status !== "Resolved" && visibleProjects.has(delayIQ.projectId));
  const weather = data.weatherAlerts.find((alert) => !alert.projectId || visibleProjects.has(alert.projectId));
  const missingMaterials = jobs.find((job) => job.materialsStatus === "Missing");
  const alerts: ScheduleAlert[] = [];
  if (orphans.length > 0) {
    const first = orphans[0];
    const job = data.jobs.find((item) => item.id === first.jobId);
    const rest = orphans.length - 1;
    alerts.push({
      id: `orphan-${first.id}`,
      tone: "danger",
      icon: AlertTriangle,
      title: orphans.length === 1 ? "A booking has no crew" : `${orphans.length} bookings have no crew`,
      detail: `${job?.name ?? "A job"} on ${formatScheduleDate(first.date)} is booked to a crew this workspace no longer has${
        rest > 0 ? `, and ${rest} more like it` : ""
      } — no board can show it.`,
      when: null,
      jobId: first.jobId,
      date: first.date,
      link: { page: "month", weekStart: weekOf(first.date) }
    });
  }
  if (conflict) {
    alerts.push({
      id: `conflict-${conflict.id}`,
      tone: "danger",
      icon: AlertTriangle,
      title: "Double-booked crew",
      detail: `${data.crews.find((crew) => crew.id === conflict.crewId)?.name ?? "Crew"} conflicts on ${formatScheduleDate(conflict.date)}.`,
      // a booking carries no timestamp, and the day it clashes on is already in the line above
      when: null,
      jobId: conflict.jobId,
      date: conflict.date,
      link: { page: "month", weekStart: weekOf(conflict.date) }
    });
  }
  if (openDelayIQ) {
    alerts.push({
      id: `delayiq-${openDelayIQ.id}`,
      tone: "danger",
      icon: AlertTriangle,
      title: openDelayIQ.title,
      detail: `${projectName(data, openDelayIQ.projectId)} · ${openDelayIQ.impactDays} day impact`,
      when: relativeTime(openDelayIQ.reportedAt, now),
      jobId: null,
      date: null,
      link: { page: "delayIQs" }
    });
  }
  if (weather) {
    alerts.push({
      id: `weather-${weather.id}`,
      tone: "warning",
      icon: CloudSun,
      title: "Weather delayIQ expected",
      detail: `${weather.projectId ? projectName(data, weather.projectId) : "All sites"} · ${weather.title}`,
      // the useful fact about weather is when it arrives, which may still be ahead
      when: relativeTime(weather.startsAt, now),
      jobId: null,
      date: null,
      // the weather warning opened Map & Field Ops until 2026-09-22 (in the backlog, docs/backlog.md); the
      // DelayIQs page is where a weather delay is read now
      link: { page: "delayIQs" }
    });
  }
  if (missingMaterials) {
    alerts.push({
      id: `materials-${missingMaterials.id}`,
      tone: "warning",
      icon: Truck,
      title: "Missing materials",
      detail: `${missingMaterials.name} · ${missingMaterials.phase} not confirmed`,
      // a job records no time for the moment its materials went missing
      when: null,
      jobId: missingMaterials.id,
      date: missingMaterials.startDate,
      link: { page: "inventory" }
    });
  }
  return alerts;
}

/** The alerts panel: in a page's side rail, or `under` the board as a full-width strip. */
export function ScheduleAlertsPanel({
  alerts,
  onOpen,
  onViewAll,
  under = false,
  headless = false
}: {
  alerts: ScheduleAlert[];
  onOpen: (alert: ScheduleAlert) => void;
  onViewAll?: () => void;
  under?: boolean;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
}) {
  return (
    <section
      className={`sched-rail-panel${under ? " sched-alerts-under" : ""}${headless ? " is-headless" : ""}`}
      data-tutorial-id="schedule-alerts"
      aria-label="Schedule alerts"
    >
      {!headless && (
        <div className="sched-rail-head">
          <h2>Schedule Alerts</h2>
          {onViewAll && (
            <button type="button" className="sched-rail-link" onClick={onViewAll}>
              View all
            </button>
          )}
        </div>
      )}
      {alerts.length > 0 ? (
        <div className="cc-list">
          {alerts.map((alert) => {
            const AlertIcon = alert.icon;
            return (
              <button type="button" className={`sched-alert2 ${alert.tone}`} key={alert.id} onClick={() => onOpen(alert)}>
                <span className="sched-alert2-ico">
                  <AlertIcon />
                </span>
                <span className="sched-alert2-body">
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </span>
                {alert.when && <span className="sched-alert2-time">{alert.when}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="cc-empty-line">No schedule alerts for what is in view.</p>
      )}
      {onViewAll && (
        <button type="button" className="sched-rail-foot-btn" onClick={onViewAll}>
          View all alerts
        </button>
      )}
    </section>
  );
}
