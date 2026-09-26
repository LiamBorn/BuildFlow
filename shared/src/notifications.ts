/**
 * The notification list: what the website's bell shows and what the Mac's notch lists (notch plan,
 * step 3). It was `buildNotificationItems` in client/src/App.tsx, built in the browser only; it moved
 * here unchanged in what it says so the server can build the SAME list for the Mac, and the two can
 * never disagree about what is new. client/src/tests/parity holds the answers the App.tsx copy gave
 * on the test fixtures before it was deleted, and the shared copy is held to them.
 *
 * Plain data in, plain data out: no icons (the bell picks one per `kind`) and no clock of its own —
 * the caller says what `now` is, because the equipment rows are stamped with it.
 *
 * What each item gained over the old one:
 * - `kind`: which of the eight sources it came from.
 * - `target`: the record it is about, as { kind, id }, which is what a link is formed from.
 * - `opens`: where the website opens it today (a record on an index page, a Dashboard panel, or the
 *   schedule at a week and crew). The bell's click-through is exactly this.
 * - `alertable`: whether it may ever raise an alert on the Mac. False for equipment, whose rows carry
 *   no time of their own and are stamped "now" every time the list is built — as a timestamp that is
 *   meaningless, and as "news" it would alert on every build.
 */
import type {
  Crew,
  DelayIQ,
  Equipment,
  FieldUpdate,
  Inspection,
  Job,
  Material,
  Project,
  ScheduleAssignment,
  User,
  WeatherAlert,
  WeatherConflict
} from "./index";
import { WEATHER_CAUSE_LABEL, weatherTimeRange, weekdayName } from "./weatherWords";

/** The eight places a notification comes from. */
export type NotificationKind =
  "fieldUpdate" | "weatherConflict" | "weatherAlert" | "delayIQ" | "assignment" | "inspection" | "material" | "equipment";

/** Red and amber mean someone has to do something; the rest are news. */
export type NotificationTone = "blue" | "green" | "amber" | "red" | "violet" | "slate";

/** The record a notification is about: `kind` names the table, `id` the row. */
export type NotificationRecordRef = { kind: NotificationKind; id: string };

/**
 * Where the website opens the record today. Three shapes, because BuildFlow keeps these eight kinds
 * of thing in three sorts of place: a record on one of the index pages; a Dashboard panel for weather
 * and inspections, which have no page of their own; and the schedule, addressed by week and crew.
 */
export type NotificationDestination =
  | { kind: "record"; page: "field" | "delayIQs" | "inventory"; recordId: string }
  | { kind: "panel"; panelId: "weather" | "inspections" }
  | { kind: "schedule"; date: string; crewId: string };

export type InboxNotification = {
  /** Stable: the same record gives the same id on every build, on either side. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** ISO instant, or a YYYY-MM-DD date for the sources that only carry a day. */
  timestamp: string;
  tone: NotificationTone;
  /** The project it is about, where there is one: what "Projects I manage" filters on. */
  projectId?: string;
  target: NotificationRecordRef;
  opens: NotificationDestination;
  /** May it ever raise an alert on the Mac? False for equipment (see above). */
  alertable: boolean;
};

/** What the list is built from: the parts of the bootstrap payload it reads. */
export type NotificationSources = {
  users: User[];
  activeUser: User;
  projects: Project[];
  jobs: Job[];
  crews: Crew[];
  equipment: Equipment[];
  materials: Material[];
  assignments: ScheduleAssignment[];
  fieldUpdates: FieldUpdate[];
  delayIQs: DelayIQ[];
  inspections: Inspection[];
  weatherAlerts: WeatherAlert[];
  weatherConflicts?: WeatherConflict[];
};

function projectName(data: Pick<NotificationSources, "projects">, projectId: string) {
  return data.projects.find((project) => project.id === projectId)?.name ?? "Unassigned";
}

/**
 * Every notification, newest first. ALL of them: this used to end `.slice(0, 7)`, so the bell showed
 * the seven most recent and silently dropped the rest; the panel scrolls and filters instead.
 */
export function buildNotificationItems(data: NotificationSources, now: number | Date = Date.now()): InboxNotification[] {
  const items: InboxNotification[] = [];

  data.fieldUpdates.forEach((update) => {
    const user = data.users.find((item) => item.id === update.userId) ?? data.activeUser;
    items.push({
      id: `field-${update.id}`,
      kind: "fieldUpdate",
      title: "Field update posted",
      detail: `${user.name} updated ${projectName(data, update.projectId)}: ${update.message}`,
      timestamp: update.createdAt,
      tone: update.status === "DelayIQed" || update.status === "At Risk" ? "red" : "green",
      projectId: update.projectId,
      target: { kind: "fieldUpdate", id: update.id },
      opens: { kind: "record", page: "field", recordId: update.id },
      alertable: true
    });
  });

  /* WeatherIQ's job days: each open one is a suggestion for the person in charge — the project's
     manager, which is what "projects I manage" reads — and a called-off one says a reschedule is
     waiting. Both land on the WeatherIQ section, where the decision is made. */
  (data.weatherConflicts ?? []).forEach((conflict) => {
    if (conflict.status !== "open" && conflict.status !== "cancelled") return;
    const job = data.jobs.find((item) => item.id === conflict.jobId);
    if (!job) return;
    const when = `${weekdayName(conflict.date)} ${weatherTimeRange(conflict.start, conflict.end)}`;
    items.push({
      id: `weather-conflict-${conflict.id}`,
      kind: "weatherConflict",
      title: conflict.status === "open" ? `Weather may stop ${job.phase}` : `${job.phase} was called off for weather`,
      detail:
        conflict.status === "open"
          ? `${WEATHER_CAUSE_LABEL[conflict.cause]}: ${conflict.reason}, ${when}, at ${projectName(data, conflict.projectId)}, inside the job's hours. Call it off or keep it on.`
          : `${WEATHER_CAUSE_LABEL[conflict.cause]} ${when} at ${projectName(data, conflict.projectId)}. A reschedule is suggested.`,
      timestamp: conflict.updatedAt || conflict.detectedAt,
      tone: conflict.status === "cancelled" ? "violet" : conflict.severity === "hold" ? "red" : "amber",
      projectId: conflict.projectId,
      target: { kind: "weatherConflict", id: conflict.id },
      opens: { kind: "panel", panelId: "weather" },
      alertable: true
    });
  });

  data.weatherAlerts.forEach((alert) => {
    items.push({
      id: `weather-${alert.id}`,
      kind: "weatherAlert",
      title: "Weather alert added",
      detail: `${alert.title} for ${alert.projectId ? projectName(data, alert.projectId) : "all projects"} - ${alert.details}`,
      timestamp: alert.startsAt,
      tone: alert.severity === "High" ? "red" : alert.severity === "Medium" ? "amber" : "blue",
      projectId: alert.projectId ?? undefined,
      target: { kind: "weatherAlert", id: alert.id },
      // weather has no page of its own: it is read in the Dashboard's WeatherIQ section
      opens: { kind: "panel", panelId: "weather" },
      alertable: true
    });
  });

  data.delayIQs.forEach((delayIQ) => {
    items.push({
      id: `delayIQ-${delayIQ.id}`,
      kind: "delayIQ",
      title: "DelayIQ being tracked",
      detail: `${delayIQ.title} is ${delayIQ.status.toLowerCase()} on ${projectName(data, delayIQ.projectId)} with ${delayIQ.impactDays} day impact.`,
      timestamp: delayIQ.reportedAt,
      tone: delayIQ.severity === "High" ? "red" : delayIQ.severity === "Medium" ? "amber" : "slate",
      projectId: delayIQ.projectId,
      target: { kind: "delayIQ", id: delayIQ.id },
      opens: { kind: "record", page: "delayIQs", recordId: delayIQ.id },
      alertable: true
    });
  });

  data.assignments.forEach((assignment) => {
    const job = data.jobs.find((item) => item.id === assignment.jobId);
    const crew = data.crews.find((item) => item.id === assignment.crewId);
    items.push({
      id: `assignment-${assignment.id}`,
      kind: "assignment",
      title: "Schedule assignment updated",
      detail: `${crew?.name ?? "Crew"} is assigned to ${job?.name ?? "scheduled work"} with ${assignment.status.toLowerCase()} status.`,
      timestamp: assignment.date,
      tone: assignment.conflicts.length ? "red" : "blue",
      projectId: job?.projectId,
      target: { kind: "assignment", id: assignment.id },
      // the schedule, at the week this booking sits in and filtered to the crew it belongs to
      opens: { kind: "schedule", date: assignment.date, crewId: assignment.crewId },
      alertable: true
    });
  });

  data.inspections.forEach((inspection) => {
    items.push({
      id: `inspection-${inspection.id}`,
      kind: "inspection",
      title: "Inspection scheduled",
      detail: `${inspection.title} is ${inspection.status.toLowerCase()} for ${projectName(data, inspection.projectId)}.`,
      timestamp: inspection.scheduledAt,
      tone: inspection.status === "Complete" ? "green" : "violet",
      projectId: inspection.projectId,
      target: { kind: "inspection", id: inspection.id },
      // likewise no page: inspections are read in the Dashboard's Upcoming Inspections panel
      opens: { kind: "panel", panelId: "inspections" },
      alertable: true
    });
  });

  data.materials.forEach((material) => {
    items.push({
      id: `material-${material.id}`,
      kind: "material",
      title: "Material status updated",
      detail: `${material.name} is ${material.status.toLowerCase()} for ${projectName(data, material.projectId)}.`,
      timestamp: material.deliveryDate,
      tone: material.status === "Missing" ? "red" : material.status === "Ready" ? "green" : "amber",
      projectId: material.projectId,
      target: { kind: "material", id: material.id },
      opens: { kind: "record", page: "inventory", recordId: material.id },
      alertable: true
    });
  });

  const stampedNow = new Date(now).toISOString();
  data.equipment.forEach((equipment) => {
    const assignedProject = equipment.assignedTo ? projectName(data, equipment.assignedTo) : "the fleet";
    items.push({
      id: `equipment-${equipment.id}`,
      kind: "equipment",
      title: "Equipment status updated",
      detail: `${equipment.name} is ${equipment.status.toLowerCase()} for ${assignedProject}.`,
      // an equipment row has no time of its own, so it reads as "just now" — and must never alert
      timestamp: stampedNow,
      tone: equipment.status === "Maintenance" ? "red" : equipment.status === "In Use" ? "amber" : "green",
      projectId: equipment.assignedTo ?? undefined,
      target: { kind: "equipment", id: equipment.id },
      opens: { kind: "record", page: "inventory", recordId: equipment.id },
      alertable: false
    });
  });

  return items.sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime());
}

/** Red and amber are the two tones that mean someone has to do something (the bell's second tab). */
export const notificationNeedsAttention = (item: Pick<InboxNotification, "tone">) => item.tone === "red" || item.tone === "amber";

/** The projects a person manages: what the bell's "Projects I manage" tab, and the Mac's "mine", mean. */
export function projectsManagedBy(projects: Pick<Project, "id" | "managerId">[], userId: string): Set<string> {
  return new Set(projects.filter((project) => project.managerId === userId).map((project) => project.id));
}
