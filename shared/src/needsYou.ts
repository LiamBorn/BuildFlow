/**
 * What is waiting on you (notch plan, feature 2, the Tasks tab). There is no task model, and the plan
 * chose not to add one: every task here is DERIVED from data BuildFlow already keeps, so there is
 * nothing new to store, nothing to keep in step, and a task goes away the moment the thing it is about
 * is done — on the website, on the Mac, or by anybody else.
 *
 * Five kinds:
 *   schedule-change  a pending variance: a field report (or a weather call-off) proposes new dates
 *   weather-call     a WeatherIQ conflict still open: call the day off, or keep it on
 *   readiness        a readiness item not done, due within the week or overdue
 *   unbooked-job     a job scheduled in the coming week with no crew booked on any of its days
 *   time-cards       submitted time to approve, one task per week
 *
 * WHOSE IT IS. The person in charge of a project is its manager, the same rule the bell's "Projects I
 * manage" tab and WeatherIQ's assignee use. When the manager cannot act on a kind of task — a Member
 * cannot resolve a variance, call a day off or book a crew — or the project has no manager, the task
 * goes to everyone who can: the Owner and the Admins. Time is not per project, so it goes to everyone
 * who approves time.
 *
 * EACH TASK SAYS HOW TO DO IT: its actions, each with the website endpoint that performs it and the
 * body the website sends, so the Mac can act "through the endpoints the website already uses". A task
 * the website has no endpoint for (a readiness item is ticked off on the website) has no actions and
 * is opened in BuildFlow instead, from its `target`.
 */
import type { PermissionLevel, Project, ReadinessItem, ScheduleAssignment, ScheduleVariance, User, WeatherConflict, Job } from "./index";
import type { NotificationTone } from "./notifications";
import { addIsoDays, isWorkday, type UpcomingJobsSources } from "./upcomingJobs";
import { WEATHER_CAUSE_LABEL, weatherTimeRange, weekdayName } from "./weatherWords";

/** The three things a task can need permission for — the server's capability names. */
export type NeedsYouCapability = "variance.resolve" | "assignments.write" | "timecard.approve";

/**
 * Which levels hold each capability, as server/src/permissions.ts grants them (a server test holds
 * the two to each other). Used only for OTHER people — whether a project's manager can act; for the
 * reader, the server passes its own `can`.
 */
export const NEEDS_YOU_LEVELS: Record<NeedsYouCapability, readonly PermissionLevel[]> = {
  "variance.resolve": ["owner", "admin"],
  "assignments.write": ["owner", "admin"],
  "timecard.approve": ["owner", "admin"]
};

/**
 * Time a person put in, as the TimeCard feature keeps it (shared TimeEntry: uncommitted on this branch,
 * so it is accepted structurally and wired later). Only "Submitted" entries are waiting on anyone.
 */
export type PendingTimeEntry = { id: string; userId: string; accountId?: string; date: string; status: string };

export type NeedsYouKind = "schedule-change" | "weather-call" | "readiness" | "unbooked-job" | "time-cards";

export type NeedsYouAction = {
  id: "accept" | "reject" | "cancel" | "keep" | "approve" | "book";
  label: string;
  /** The capability the server checks on the endpoint. */
  capability: NeedsYouCapability;
  /** The website's own endpoint for it, and the body the website sends. */
  request: {
    method: "POST";
    path: string;
    body: Record<string, unknown>;
    /** Fields the body still needs from the person before it can be sent: booking a crew needs the crew. */
    needs?: string[];
  };
};

export type NeedsYouTask = {
  /** Stable: the same thing waiting gives the same id on every build. */
  id: string;
  kind: NeedsYouKind;
  title: string;
  detail: string;
  projectId: string | null;
  project: string;
  /** When it wants deciding: "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" in site time; null when it has no date. */
  due: string | null;
  tone: NotificationTone;
  /** The record it is about, as a notification's target is: what "open in BuildFlow" is formed from. */
  target: { kind: "variance" | "weatherConflict" | "readiness" | "job" | "timeCards"; id: string };
  actions: NeedsYouAction[];
};

export type NeedsYouSources = UpcomingJobsSources & {
  users: Pick<User, "id" | "name" | "permission" | "removedAt">[];
  activeUser: Pick<User, "id" | "permission">;
  projects: Pick<Project, "id" | "name" | "managerId">[];
  jobs: Job[];
  assignments: Pick<ScheduleAssignment, "jobId" | "crewId" | "date">[];
  variances: ScheduleVariance[];
  readiness: ReadinessItem[];
  weatherConflicts?: WeatherConflict[];
};

export type NeedsYouOptions = {
  /** The reader's date, YYYY-MM-DD. */
  today: string;
  /** Whose list; the signed-in person by default. */
  userId?: string;
  /** Their level; the signed-in person's by default. */
  permission?: PermissionLevel;
  /** What the reader may do. The server passes its own permission check; without it, the level decides. */
  can?: (capability: NeedsYouCapability) => boolean;
  /** Submitted time, when the TimeCard feature is there to supply it. */
  timeEntries?: PendingTimeEntry[];
  /** How far ahead a readiness item or an unbooked job counts, today included. Seven days. */
  horizonDays?: number;
};

const KIND_ORDER: NeedsYouKind[] = ["weather-call", "schedule-change", "unbooked-job", "time-cards", "readiness"];

/** "storm day", "rain day": what a called-off day is called in a sentence. */
const DAY_NOUN: Record<WeatherConflict["cause"], string> = {
  lightning: "storm",
  rain: "rain",
  snow: "snow",
  wind: "wind",
  heat: "heat",
  cold: "freeze",
  fog: "fog"
};

const levelCan = (level: PermissionLevel | null | undefined, capability: NeedsYouCapability) =>
  Boolean(level && NEEDS_YOU_LEVELS[capability].includes(level));

/** "Mon, Sep 21". */
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The Monday of the week holding a date. */
const mondayOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addIsoDays(date, -((weekday + 6) % 7));
};

export function needsYou(data: NeedsYouSources, options: NeedsYouOptions): NeedsYouTask[] {
  const me = options.userId ?? data.activeUser.id;
  const myLevel = options.permission ?? data.activeUser.permission ?? "member";
  const can = options.can ?? ((capability: NeedsYouCapability) => levelCan(myLevel, capability));
  const today = options.today;
  const horizon = addIsoDays(today, Math.max(1, options.horizonDays ?? 7) - 1);
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const jobs = new Map(data.jobs.map((job) => [job.id, job]));
  const people = new Map(data.users.map((user) => [user.id, user]));
  const projectName = (id: string) => projects.get(id)?.name ?? "Unassigned";
  const jobLabel = (id: string) => {
    const job = jobs.get(id);
    return job ? job.phase || job.name : "a job";
  };

  /** Whether a task on this project, needing this capability, is this person's to do. */
  const isMine = (projectId: string | null, capability: NeedsYouCapability | null, assigneeId?: string) => {
    const managerId = assigneeId || (projectId ? projects.get(projectId)?.managerId : undefined);
    const manager = managerId ? people.get(managerId) : undefined;
    // a manager on the roster, still here, with a login (or one we cannot tell about) who is allowed to act
    const managerActs =
      manager &&
      !manager.removedAt &&
      manager.permission !== null &&
      (capability === null || manager.permission === undefined || levelCan(manager.permission, capability));
    if (managerActs) return manager.id === me && (capability === null || can(capability));
    return capability === null ? myLevel !== "member" : can(capability);
  };

  const tasks: NeedsYouTask[] = [];

  /* Schedule changes: a pending variance proposes new dates, and nothing moves until someone decides. */
  for (const variance of data.variances) {
    if (variance.status !== "pending" || !isMine(variance.projectId, "variance.resolve")) continue;
    const drift = Math.abs(variance.varianceDays);
    const shift =
      variance.varianceDays === 0
        ? "on plan"
        : `${drift} working day${drift === 1 ? "" : "s"} ${variance.varianceDays > 0 ? "later" : "earlier"}`;
    const starts = [variance.proposal.currentStart, variance.proposal.proposedStart].filter(Boolean).sort()[0] ?? today;
    tasks.push({
      id: `variance-${variance.id}`,
      kind: "schedule-change",
      title: variance.kind === "weather" ? `Reschedule ${jobLabel(variance.jobId)}` : `Schedule change: ${jobLabel(variance.jobId)}`,
      detail: [
        projectName(variance.projectId),
        variance.kind === "weather" ? "WeatherIQ" : "Field report",
        `${shift}${variance.proposal.criticalPath ? ", critical path" : ""}`
      ].join(" · "),
      projectId: variance.projectId,
      project: projectName(variance.projectId),
      due: starts < today ? today : starts,
      tone: variance.severity === "High" ? "red" : variance.severity === "Medium" ? "amber" : "slate",
      target: { kind: "variance", id: variance.id },
      actions: (["accept", "reject"] as const).map((verb) => ({
        id: verb,
        label: verb === "accept" ? "Accept" : "Reject",
        capability: "variance.resolve",
        request: { method: "POST", path: `/api/schedule/variances/${encodeURIComponent(variance.id)}/${verb}`, body: { userId: me } }
      }))
    });
  }

  /* Rain-day calls: WeatherIQ found weather in a job's hours and the person in charge has not decided. */
  for (const conflict of data.weatherConflicts ?? []) {
    if (conflict.status !== "open" || conflict.date < today || !jobs.has(conflict.jobId)) continue;
    if (!isMine(conflict.projectId, "assignments.write", conflict.assigneeId)) continue;
    const path = `/api/weather/conflicts/${encodeURIComponent(conflict.id)}`;
    tasks.push({
      id: `weather-call-${conflict.id}`,
      kind: "weather-call",
      title: `Call the ${DAY_NOUN[conflict.cause]} day`,
      detail: `${jobLabel(conflict.jobId)} · ${projectName(conflict.projectId)} · ${WEATHER_CAUSE_LABEL[conflict.cause]}: ${conflict.reason}, ${weekdayName(conflict.date)} ${weatherTimeRange(conflict.start, conflict.end)}`,
      projectId: conflict.projectId,
      project: projectName(conflict.projectId),
      due: conflict.start,
      tone: conflict.severity === "hold" ? "red" : "amber",
      target: { kind: "weatherConflict", id: conflict.id },
      actions: [
        {
          id: "cancel",
          label: "Call it off",
          capability: "assignments.write",
          request: { method: "POST", path: `${path}/cancel`, body: {} }
        },
        { id: "keep", label: "Keep it on", capability: "assignments.write", request: { method: "POST", path: `${path}/keep`, body: {} } }
      ]
    });
  }

  /* Readiness items due this week, or overdue. The website has no endpoint that ticks one off. */
  for (const item of data.readiness) {
    if (item.complete || !item.dueDate || item.dueDate > horizon || !isMine(item.projectId, null)) continue;
    const overdue = item.dueDate < today;
    tasks.push({
      id: `readiness-${item.id}`,
      kind: "readiness",
      title: item.label,
      detail: `${projectName(item.projectId)} · Readiness${overdue ? " · overdue" : ""}`,
      projectId: item.projectId,
      project: projectName(item.projectId),
      due: item.dueDate,
      tone: overdue ? "red" : item.dueDate <= addIsoDays(today, 1) ? "amber" : "slate",
      target: { kind: "readiness", id: item.id },
      actions: []
    });
  }

  /* Jobs scheduled in the coming week with no crew booked on any of their days in it. */
  const bookedJobs = new Set(
    data.assignments.filter((booking) => booking.date >= today && booking.date <= horizon).map((booking) => booking.jobId)
  );
  for (const job of data.jobs) {
    if (job.status === "Complete" || job.endDate < today || job.startDate > horizon || bookedJobs.has(job.id)) continue;
    if (!isMine(job.projectId, "assignments.write")) continue;
    let first = job.startDate < today ? today : job.startDate;
    const last = job.endDate < horizon ? job.endDate : horizon;
    // the first day a crew would actually work it
    for (let day = first; day <= last; day = addIsoDays(day, 1)) {
      if (isWorkday(day, data.workCalendar)) {
        first = day;
        break;
      }
    }
    tasks.push({
      id: `unbooked-${job.id}`,
      kind: "unbooked-job",
      title: `No crew on ${jobLabel(job.id)}`,
      detail: `${projectName(job.projectId)} · ${first === today ? "starts today" : `from ${shortDate(first)}`} · ${job.status}`,
      projectId: job.projectId,
      project: projectName(job.projectId),
      due: first,
      tone: first <= today ? "red" : "amber",
      target: { kind: "job", id: job.id },
      actions: [
        {
          id: "book",
          label: "Book a crew",
          capability: "assignments.write",
          request: { method: "POST", path: "/api/schedule/assign", body: { jobId: job.id, date: first }, needs: ["crewId"] }
        }
      ]
    });
  }

  /* Time cards: submitted time, one task per week, for everyone who approves time. */
  if (options.timeEntries?.length && can("timecard.approve")) {
    const weeks = new Map<string, PendingTimeEntry[]>();
    for (const entry of options.timeEntries) {
      if (entry.status !== "Submitted" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
      const week = mondayOf(entry.date);
      weeks.set(week, [...(weeks.get(week) ?? []), entry]);
    }
    for (const [week, entries] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
      const cards = new Set(entries.map((entry) => entry.userId || entry.accountId || entry.id)).size;
      const weekEnd = addIsoDays(week, 6);
      tasks.push({
        id: `time-cards-${week}`,
        kind: "time-cards",
        title: `Approve ${cards} time card${cards === 1 ? "" : "s"}`,
        detail: `Week of ${shortDate(week).replace(/^\w+, /, "")} · Time cards · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`,
        projectId: null,
        project: "",
        due: weekEnd < today ? today : weekEnd,
        tone: weekEnd < today ? "amber" : "slate",
        target: { kind: "timeCards", id: week },
        actions: [
          {
            id: "approve",
            label: "Approve",
            capability: "timecard.approve",
            request: { method: "POST", path: "/api/time-entries/approve", body: { ids: entries.map((entry) => entry.id) } }
          }
        ]
      });
    }
  }

  return tasks.sort(
    (a, b) =>
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
  );
}
