/**
 * The jobs coming up: today and the next six days (notch plan, feature 2, the Jobs tab). The
 * Dashboard's Today's plan covers today only, and there was no "next jobs" helper at all.
 *
 * ONE ROW PER JOB, at the next day it is worked: the first day in the window a crew is booked on it,
 * or — when none is — its first working day in the window. A three-week job is one row, not
 * fifteen, and a job that runs today reads "today". Complete jobs are not coming up.
 *
 * "Mine" is the bell's "Projects I manage" rule — the project's manager is this person — and mine
 * come first. The weather flag is WeatherIQ's conflict for that job on that day, if there is one.
 *
 * Times are the job's own clock, "HH:mm", with no time zone: a job says "07:00" in site time.
 */
import type {
  Crew,
  Job,
  Project,
  ScheduleAssignment,
  Status,
  User,
  WeatherCause,
  WeatherConflict,
  WeatherSeverity,
  WorkCalendarSetting
} from "./index";
import { parseClock } from "./index";

export type UpcomingJobsSources = {
  activeUser: Pick<User, "id">;
  projects: Pick<Project, "id" | "name" | "managerId">[];
  jobs: Job[];
  crews: Pick<Crew, "id" | "name">[];
  assignments: Pick<ScheduleAssignment, "jobId" | "crewId" | "date">[];
  weatherConflicts?: WeatherConflict[];
  /** Which weekdays crews work and the holidays; without it every day counts. */
  workCalendar?: WorkCalendarSetting;
};

/** WeatherIQ's word on the job's day: a hold or a watch still to decide or kept, or the day called off. */
export type UpcomingJobWeather = {
  severity: WeatherSeverity;
  cause: WeatherCause;
  status: "open" | "kept" | "cancelled";
  reason: string;
  /** Site-local "YYYY-MM-DDTHH:mm", end exclusive: when it reaches the job's hours. */
  start: string;
  end: string;
  /** The conflict, so a Call off / Keep can be sent for it. */
  conflictId: string;
};

export type UpcomingJob = {
  /** The job's id. */
  id: string;
  /** What the job is ("Footings pour"): its phase, or its name when it has none. */
  name: string;
  projectId: string;
  /** The project's name ("Maple St. Plaza"). */
  project: string;
  /** The day this row is about: YYYY-MM-DD. */
  date: string;
  /** "07:00" in site time; null when the job's time cannot be read. */
  start: string | null;
  end: string | null;
  /** The crews booked on the job that day, by name, and by id. */
  crews: string[];
  crewIds: string[];
  status: Status;
  weather: UpcomingJobWeather | null;
  /** Is this a project this person manages? */
  mine: boolean;
  /** Every day in the window the job is scheduled on. */
  days: string[];
};

/** A calendar date moved by whole days, computed on UTC so no clock change can skip or repeat one. */
export function addIsoDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Whether crews work a day, by the workspace's calendar; every day is a working day without one. */
export function isWorkday(date: string, calendar?: WorkCalendarSetting): boolean {
  if (!calendar) return true;
  if (calendar.holidays.some((holiday) => holiday.date === date)) return false;
  return calendar.workingDays.includes(weekdayOf(date));
}

export function upcomingJobs(
  data: UpcomingJobsSources,
  options: {
    /** The reader's date, YYYY-MM-DD. */
    today: string;
    /** How many days the window covers, today included. Seven: today and the next six. */
    days?: number;
    /** Whose "mine"; the signed-in person by default. */
    userId?: string;
    limit?: number;
  }
): UpcomingJob[] {
  const span = Math.max(1, options.days ?? 7);
  const window = Array.from({ length: span }, (_, index) => addIsoDays(options.today, index));
  const first = window[0];
  const last = window[window.length - 1];
  const me = options.userId ?? data.activeUser.id;
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const crews = new Map(data.crews.map((crew) => [crew.id, crew]));
  const bookings = new Map<string, Pick<ScheduleAssignment, "crewId" | "date">[]>();
  for (const assignment of data.assignments) {
    if (assignment.date < first || assignment.date > last) continue;
    bookings.set(assignment.jobId, [...(bookings.get(assignment.jobId) ?? []), assignment]);
  }
  const weather = new Map<string, WeatherConflict>();
  for (const conflict of data.weatherConflicts ?? []) {
    if (conflict.status === "cleared") continue;
    weather.set(`${conflict.jobId}|${conflict.date}`, conflict);
  }

  const rows: UpcomingJob[] = [];
  for (const job of data.jobs) {
    if (job.status === "Complete" || job.endDate < first || job.startDate > last) continue;
    const days = window.filter((date) => date >= job.startDate && date <= job.endDate);
    if (days.length === 0) continue;
    const booked = bookings.get(job.id) ?? [];
    const date =
      days.find((day) => booked.some((booking) => booking.date === day)) ??
      days.find((day) => isWorkday(day, data.workCalendar)) ??
      days[0];
    const onDay = booked.filter((booking) => booking.date === date);
    const crewIds = [...new Set(onDay.map((booking) => booking.crewId))];
    const conflict = weather.get(`${job.id}|${date}`);
    const project = projects.get(job.projectId);
    rows.push({
      id: job.id,
      name: job.phase || job.name,
      projectId: job.projectId,
      project: project?.name ?? "Unassigned",
      date,
      start: parseClock(job.startTime),
      end: parseClock(job.endTime),
      crews: crewIds.map((id) => crews.get(id)?.name ?? "Crew"),
      crewIds,
      status: job.status,
      weather: conflict
        ? {
            severity: conflict.severity,
            cause: conflict.cause,
            status: conflict.status as UpcomingJobWeather["status"],
            reason: conflict.reason,
            start: conflict.start,
            end: conflict.end,
            conflictId: conflict.id
          }
        : null,
      mine: project?.managerId === me,
      days
    });
  }

  rows.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      a.date.localeCompare(b.date) ||
      (a.start ?? "99:99").localeCompare(b.start ?? "99:99") ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
  return options.limit === undefined ? rows : rows.slice(0, Math.max(0, options.limit));
}
