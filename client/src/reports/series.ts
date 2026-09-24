/**
 * The three series the Reports page charts, computed from the workspace's own records.
 *
 * All three were hardcoded until 2026-09-23: five months of planned-against-actual hours, six
 * months of backlog, and four crew names at 94/88/81/76 percent. They sat directly beneath a
 * comment in ReportsPage promising every figure came from the workspace's own records, and they
 * did not move for an empty workspace, a seeded one or a real one. A reader had no way to tell
 * which of the numbers on that page meant anything.
 *
 * This lives outside App.tsx so it can be tested against a payload directly. The charts themselves
 * cannot be reached from the UI in pre-launch mode, so a pure function with its own tests is the
 * only honest way to show that the arithmetic is right.
 */
import { jobHours, type BootstrapPayload, type Job, type WorkCalendar } from "@buildflow/shared";
import { scheduleCalendar } from "@buildflow/shared";

/**
 * What the Reports page's period select asks for.
 *
 * Each choice means one window looking back and one looking forward, because two of the three
 * series point in opposite directions: planned-against-actual is history, backlog is what is still
 * owed. "Year to date" is inherently backward, so forward it means the rest of this calendar year.
 * Crew efficiency is a snapshot of current utilization and belongs to no period at all, which is
 * why its heading says so rather than appearing to answer the select.
 */
export type ReportPeriod = "last-quarter" | "last-6-months" | "year-to-date";

/** What the select calls each choice. The options are built from this, so the control and anything
    that names a period in an export cannot drift apart. */
export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  "last-6-months": "Last 6 Months",
  "last-quarter": "Last Quarter",
  "year-to-date": "Year to Date"
};

const WINDOWS: Record<ReportPeriod, { back: number | "ytd"; ahead: number | "year-end"; past: string; future: string }> = {
  "last-quarter": { back: 3, ahead: 3, past: "last 3 months", future: "next 3 months" },
  "last-6-months": { back: 6, ahead: 6, past: "last 6 months", future: "next 6 months" },
  "year-to-date": { back: "ytd", ahead: "year-end", past: "year to date", future: "rest of this year" }
};

export type PlannedActualPoint = { month: string; planned: number; actual: number };
export type BacklogPoint = { month: string; backlog: number };
export type CrewPoint = { name: string; value: number };
export type ReportSeries = {
  plannedActual: PlannedActualPoint[];
  backlog: BacklogPoint[];
  crews: CrewPoint[];
  /** What each chart is actually showing, for its own heading to state. */
  window: { past: string; future: string };
};

/**
 * Hours one working day of a job consumes: its own working window times the crew it needs.
 *
 * jobHours() is the same helper the weather conflicts use to decide which hours a forecast lands
 * in, so a job's working day means one thing across the product. requiredLabor is the headcount
 * the job asks for; a job naming none counts as one person rather than as zero hours.
 */
export function jobDayHours(job: Job) {
  const { start, end } = jobHours(job);
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  return ((minutes(end) - minutes(start)) / 60) * Math.max(1, job.requiredLabor || 1);
}

/** Hours across the working days in [from, to] inclusive, on the workspace's own calendar. */
export function hoursBetween(job: Job, from: string, to: string, calendar: WorkCalendar) {
  if (to < from) return 0;
  let total = 0;
  for (let index = calendar.toIndex(from); calendar.fromIndex(index) <= to; index += 1) {
    total += jobDayHours(job);
  }
  return total;
}

/** The same walk, adding each working day's hours to its own calendar month. */
function spreadByMonth(into: Map<string, number>, job: Job, from: string, to: string, calendar: WorkCalendar) {
  if (to < from) return;
  for (let index = calendar.toIndex(from); ; index += 1) {
    const date = calendar.fromIndex(index);
    if (date > to) break;
    const month = date.slice(0, 7);
    into.set(month, (into.get(month) ?? 0) + jobDayHours(job));
  }
}

/** "2026-05" -> "May". */
export function monthLabel(key: string) {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** Hours worked to date: every job the field has reported starting, up to its finish or to today. */
export function laborHoursWorked(jobs: Job[], today: string, calendar: WorkCalendar) {
  return jobs.reduce(
    (sum, job) => (job.actualStart ? sum + hoursBetween(job, job.actualStart, job.actualFinish ?? today, calendar) : sum),
    0
  );
}

export function buildReportSeries(data: BootstrapPayload, today: string, period: ReportPeriod = "last-6-months"): ReportSeries {
  const window = WINDOWS[period];
  /* Only the two labels reach the caller. `back` and `ahead` are this function's business, and
     returning the whole row leaked them into the shape the UI reads — the declared type said
     { past, future } while the object carried four fields. */
  const labels = { past: window.past, future: window.future };
  const crews = [...data.crews]
    .map((crew) => ({ name: crew.name, value: Math.round(crew.utilization) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  if (data.jobs.length === 0) return { plannedActual: [], backlog: [], crews, window: labels };

  const calendar = scheduleCalendar(data.jobs.reduce((min, job) => (job.startDate < min ? job.startDate : min), today));
  const planned = new Map<string, number>();
  const actual = new Map<string, number>();
  const ahead = new Map<string, number>();
  const thisMonth = today.slice(0, 7);

  for (const job of data.jobs) {
    spreadByMonth(planned, job, job.startDate, job.endDate, calendar);
    /* What the field reported, not what the plan hoped: from the first day work was seen to the
       day it finished, or to today while it runs. A job nobody has reported starting contributes
       no actual hours rather than being assumed to have started on its planned date. */
    if (job.actualStart) spreadByMonth(actual, job, job.actualStart, job.actualFinish ?? today, calendar);
    if (!job.actualFinish) {
      /* Work still owed. Days from today forward land in the month they are planned for; a job
         already past its planned finish has no days left to land in, so its unbuilt share falls
         into the current month, where it actually has to be done. */
      if (job.endDate >= today) {
        spreadByMonth(ahead, job, job.startDate > today ? job.startDate : today, job.endDate, calendar);
      } else {
        const owed = hoursBetween(job, job.startDate, job.endDate, calendar) * ((100 - job.percentComplete) / 100);
        if (owed > 0) ahead.set(thisMonth, (ahead.get(thisMonth) ?? 0) + owed);
      }
    }
  }

  /* Planned against actual only for months that have already happened: a future month has no
     actual hours yet, and drawing it beside its plan would read as a shortfall. */
  const januaryThisYear = `${today.slice(0, 4)}-01`;
  const decemberThisYear = `${today.slice(0, 4)}-12`;
  const past = [...new Set([...planned.keys(), ...actual.keys()])]
    .filter((month) => month <= thisMonth)
    .filter((month) => window.back !== "ytd" || month >= januaryThisYear)
    .sort();
  const plannedActual = (window.back === "ytd" ? past : past.slice(-window.back)).map((month) => ({
    month: monthLabel(month),
    planned: Math.round(planned.get(month) ?? 0),
    actual: Math.round(actual.get(month) ?? 0)
  }));
  const future = [...ahead.keys()].sort().filter((month) => window.ahead !== "year-end" || month <= decemberThisYear);
  const backlog = (window.ahead === "year-end" ? future : future.slice(0, window.ahead)).map((month) => ({
    month: monthLabel(month),
    backlog: Math.round(ahead.get(month) ?? 0)
  }));
  return { plannedActual, backlog, crews, window: labels };
}
