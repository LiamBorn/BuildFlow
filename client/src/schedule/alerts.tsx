/**
 * Schedule Alerts, the same on every schedule page: a double-booked crew, the open
 * DelayIQ, the weather warning and missing materials for whatever the page's
 * filters show. Each alert links to the place it is dealt with.
 */
import { AlertTriangle, CloudSun, Truck } from "lucide-react";
import type { BootstrapPayload, Job, ScheduleAssignment } from "@buildflow/shared";
import { parseIsoDate, toIsoDate } from "../components/ui/gantt";
import { formatScheduleDate, mondayOf } from "./week";

/** Where an alert takes you: the Week board on that week, or the page that owns the problem. */
export type ScheduleAlertPage = "week" | "delayIQs" | "materials" | "map";
export type ScheduleAlertLink = { page: ScheduleAlertPage; weekStart?: string };

export type ScheduleAlert = {
  id: string;
  tone: "danger" | "warning" | "info";
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  ago: string;
  jobId: string | null;
  date: string | null;
  link: ScheduleAlertLink;
};

const projectName = (data: BootstrapPayload, projectId: string | null | undefined) =>
  data.projects.find((project) => project.id === projectId)?.name ?? "Project";
const weekOf = (date: string) => toIsoDate(mondayOf(parseIsoDate(date)));

/** The alerts the schedule raises for what is in view. */
export function deriveScheduleAlerts(data: BootstrapPayload, jobs: Job[], assignments: ScheduleAssignment[]): ScheduleAlert[] {
  const conflict = assignments.find((assignment) => assignment.conflicts.length > 0);
  const openDelayIQ = data.delayIQs.find((delayIQ) => delayIQ.status !== "Resolved");
  const weather = data.weatherAlerts[0];
  const missingMaterials = jobs.find((job) => job.materialsStatus === "Missing");
  const alerts: ScheduleAlert[] = [];
  if (conflict) {
    alerts.push({
      id: `conflict-${conflict.id}`,
      tone: "danger",
      icon: AlertTriangle,
      title: "Double-booked crew",
      detail: `${data.crews.find((crew) => crew.id === conflict.crewId)?.name ?? "Crew"} conflicts on ${formatScheduleDate(conflict.date)}.`,
      ago: "10m ago",
      jobId: conflict.jobId,
      date: conflict.date,
      link: { page: "week", weekStart: weekOf(conflict.date) }
    });
  }
  if (openDelayIQ) {
    alerts.push({
      id: `delayiq-${openDelayIQ.id}`,
      tone: "danger",
      icon: AlertTriangle,
      title: openDelayIQ.title,
      detail: `${projectName(data, openDelayIQ.projectId)} · ${openDelayIQ.impactDays} day impact`,
      ago: "22m ago",
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
      ago: "45m ago",
      jobId: null,
      date: null,
      link: { page: "map" }
    });
  }
  if (missingMaterials) {
    alerts.push({
      id: `materials-${missingMaterials.id}`,
      tone: "warning",
      icon: Truck,
      title: "Missing materials",
      detail: `${missingMaterials.name} · ${missingMaterials.phase} not confirmed`,
      ago: "2h ago",
      jobId: missingMaterials.id,
      date: missingMaterials.startDate,
      link: { page: "materials" }
    });
  }
  return alerts;
}

/** The alerts panel: in a page's side rail, or `under` the board as a full-width strip. */
export function ScheduleAlertsPanel({
  alerts,
  onOpen,
  onViewAll,
  under = false
}: {
  alerts: ScheduleAlert[];
  onOpen: (alert: ScheduleAlert) => void;
  onViewAll?: () => void;
  under?: boolean;
}) {
  return (
    <section
      className={`sched-rail-panel${under ? " sched-alerts-under" : ""}`}
      data-tutorial-id="schedule-alerts"
      aria-label="Schedule alerts"
    >
      <div className="sched-rail-head">
        <h2>Schedule Alerts</h2>
        {onViewAll && (
          <button type="button" className="sched-rail-link" onClick={onViewAll}>
            View all
          </button>
        )}
      </div>
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
                <span className="sched-alert2-time">{alert.ago}</span>
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
