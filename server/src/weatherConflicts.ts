/**
 * WeatherIQ's read of the jobs (2026-09-23): which job days the coming week's weather reaches, and,
 * when one is called off, where the job could go instead.
 *
 * Asked for as: "the WeatherIQ can detect what time weather can happen, where it will be, and if it
 * will interfere with a job", then a suggestion to the person in charge to cancel, then — once a day
 * is cancelled — a suggestion to reschedule the job and the project if needed.
 *
 * WHEN AND WHERE come from the forecast's windows (weather.ts): runs of hours at a site that cross a
 * threshold, on the site's own wall clock. WHETHER IT INTERFERES is a plain overlap: a window that
 * lands inside the job's own working hours ("7:00 AM" to "3:30 PM") on a day the job is scheduled
 * and the workspace works. Rain at 9 PM does not reach a day crew; a storm at 1 PM does.
 *
 * Pure functions: the routes in app.ts read the store, and the store keeps what a person decides.
 */
import { DEFAULT_JOB_HOURS, jobHours } from "@buildflow/shared";
import type { Job, Project, SiteWeatherForecast, VarianceProposal, WeatherConflict, WeatherWindow, WorkCalendar } from "@buildflow/shared";

/* A job's clock and its working day are read in shared (parseClock, jobHours) since 2026-09-23, so
   the schedule's job panel shows the hours this file finds weather in. The names stay exported
   here for the route and the tests that import them from this module. */
export { jobHours, parseClock } from "@buildflow/shared";
export const DEFAULT_HOURS = DEFAULT_JOB_HOURS;

export type ConflictDraft = Pick<
  WeatherConflict,
  "id" | "jobId" | "projectId" | "date" | "cause" | "severity" | "start" | "end" | "reason" | "assigneeId"
>;

/** One per job per day, so a re-read of the forecast updates a conflict rather than adding another. */
export const conflictId = (jobId: string, date: string) => `wx-${jobId}-${date}`;

const worstFirst = (a: Pick<WeatherWindow, "severity" | "start">, b: Pick<WeatherWindow, "severity" | "start">) =>
  Number(b.severity === "hold") - Number(a.severity === "hold") || a.start.localeCompare(b.start);

/** The windows that land inside [from, to), worst first. */
export function windowsDuring(windows: WeatherWindow[], from: string, to: string): WeatherWindow[] {
  return windows.filter((window) => window.start < to && window.end > from).sort(worstFirst);
}

/**
 * Every open job's working day that weather reaches during the job's own hours — once per job per
 * day, at the worst window that day (a hold before a watch, then the earliest), trimmed to the part
 * inside the job's hours. Only days the forecast covers, from today, that the workspace works. The
 * conflict is addressed to the person in charge of the job: its project's manager.
 */
export function detectConflicts(input: {
  sites: SiteWeatherForecast[];
  jobs: Job[];
  projects: Project[];
  isWorkingDay: (date: string) => boolean;
  today: string;
}): ConflictDraft[] {
  const managers = new Map(input.projects.map((project) => [project.id, project.managerId ?? ""]));
  const drafts: ConflictDraft[] = [];
  for (const site of input.sites) {
    const dates = site.days.map((day) => day.date).filter((date) => date >= input.today && input.isWorkingDay(date));
    for (const job of input.jobs) {
      if (job.projectId !== site.projectId || job.status === "Complete") continue;
      const hours = jobHours(job);
      for (const date of dates) {
        if (date < job.startDate || date > job.endDate) continue;
        const from = `${date}T${hours.start}`;
        const to = `${date}T${hours.end}`;
        const [worst] = windowsDuring(site.windows, from, to);
        if (!worst) continue;
        drafts.push({
          id: conflictId(job.id, date),
          jobId: job.id,
          projectId: job.projectId,
          date,
          cause: worst.cause,
          severity: worst.severity,
          start: worst.start > from ? worst.start : from,
          end: worst.end < to ? worst.end : to,
          reason: worst.reason,
          assigneeId: managers.get(job.projectId) ?? ""
        });
      }
    }
  }
  return drafts.sort((a, b) => a.date.localeCompare(b.date) || worstFirst(a, b) || a.jobId.localeCompare(b.jobId));
}

/**
 * Whether the day a reschedule turns on — the new start when the job's first day was lost, else its
 * new finish — was checked against the site's forecast. "unavailable": there was no forecast to
 * check it against (`forecastDays` null); "beyond": it falls past the last day the forecast covers.
 * In both, the working calendar alone chose it, and the reschedule has to say so.
 */
export function weatherCheckFor(input: {
  job: Job;
  lostDate: string;
  dates: { start: string; end: string };
  forecastDays: string[] | null;
}): NonNullable<VarianceProposal["weatherCheck"]> {
  const { job, lostDate, dates, forecastDays } = input;
  if (!forecastDays) return "unavailable";
  const movedTo = lostDate <= job.startDate ? dates.start : dates.end;
  const last = forecastDays[forecastDays.length - 1];
  return !last || movedTo > last ? "beyond" : "forecast";
}

/** The calendar day after this one. */
export function nextCalendarDay(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Where a job goes when one of its days is called off. It has lost that day, so it needs one more
 * working day. A job whose FIRST day is lost starts again on the next day it can work and keeps its
 * length; a job that loses a later day keeps its start and finishes on the next day it can work
 * after its current finish. "A day it can work" is a working day on the workspace's calendar with
 * no hold-level weather in the job's hours, as far as the forecast reaches — past it, any working
 * day, because an unknown day is not a bad one.
 */
export function rescheduleDates(input: { job: Job; lostDate: string; calendar: WorkCalendar; windows: WeatherWindow[] }): {
  start: string;
  end: string;
} {
  const { job, lostDate, calendar, windows } = input;
  const hours = jobHours(job);
  const workable = (date: string) =>
    calendar.isWorkingDay(date) &&
    !windowsDuring(windows, `${date}T${hours.start}`, `${date}T${hours.end}`).some((window) => window.severity === "hold");
  const nextWorkable = (after: string) => {
    let date = after;
    // a month of calendar days is further than any forecast reaches; past it the calendar decides
    for (let step = 0; step < 31; step += 1) {
      date = nextCalendarDay(date);
      if (workable(date)) return date;
    }
    return calendar.nextWorkingDay(nextCalendarDay(after));
  };
  if (lostDate <= job.startDate) {
    const length = calendar.duration(job.startDate, job.endDate);
    const start = nextWorkable(lostDate);
    return { start, end: calendar.fromIndex(calendar.toIndex(start) + length - 1) };
  }
  return { start: job.startDate, end: nextWorkable(job.endDate) };
}
