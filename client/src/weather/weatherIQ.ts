/**
 * WeatherIQ — the rules behind the Dashboard's forecast section (2026-09-23).
 *
 * Asked for as "a pulled-in forecast widget for job sites — useful, low-cost, don't over-engineer
 * the AI part of it for launch", then to reach every job: WHEN the weather comes, WHERE, and whether
 * it lands in a job's working hours; a suggestion to the person in charge to call the day off; and,
 * once it is called off, a suggestion to reschedule. The server does the reading (server/src/weather.ts
 * turns the forecast's hours into windows; weatherConflicts.ts lays the jobs over them and keeps what
 * the person in charge decides). This file turns what the server sends into what the section says.
 *
 * When the forecast cannot be had, the section reads the conflicts it already has, and failing
 * those the weather alerts the workspace keeps by hand — and SAYS so. An unreachable forecast must
 * never read as a week without weather.
 *
 * Pure functions, so the rules are tested without rendering anything (weatherIQ.test.ts).
 */
import type {
  Job,
  Project,
  ScheduleVariance,
  SiteWeatherForecast,
  VarianceProposal,
  WeatherAlert,
  WeatherCause,
  WeatherConflict,
  WeatherForecastDay,
  WeatherForecastPayload,
  WeatherReading,
  WeatherSeverity,
  WeatherWindow
} from "@buildflow/shared";
import { WEATHER_CAUSE_LABEL, weatherClockWords, weatherTimeRange } from "@buildflow/shared";

/** What a WMO weather code looks like, for the icon and the words beside it. */
export type ConditionKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type Condition = { kind: ConditionKind; label: string; short: string };

/**
 * The sky a WMO code names: the icon's kind, the name a sentence uses, and the word a day tile has
 * room for. The short word only differs where the name is one word too long for a tile to wrap
 * ("Thunderstorms").
 */
export function conditionOf(code: number): Condition {
  const named = (kind: ConditionKind, label: string, short = label): Condition => ({ kind, label, short });
  if (code === 0) return named("clear", "Clear");
  if (code === 1) return named("partly", "Mostly clear");
  if (code === 2) return named("partly", "Partly cloudy");
  if (code === 3) return named("cloudy", "Overcast");
  if (code === 45 || code === 48) return named("fog", "Fog");
  if (code >= 51 && code <= 57) return named("drizzle", code >= 56 ? "Freezing drizzle" : "Drizzle");
  if (code >= 61 && code <= 67) return named("rain", code >= 66 ? "Freezing rain" : code === 65 ? "Heavy rain" : "Rain");
  if (code >= 71 && code <= 77) return named("snow", "Snow");
  if (code >= 80 && code <= 82) return named("rain", "Showers");
  if (code === 85 || code === 86) return named("snow", "Snow showers");
  if (code >= 95) return code === 95 ? named("storm", "Thunderstorms", "Storms") : named("storm", "Storms with hail", "Hail");
  return named("cloudy", "Cloudy");
}

/* How each cause is named, and when a stretch of weather runs, the way a person says it: moved to
   @buildflow/shared (2026-09-26) because the notification list is built on the server too, for the
   Mac, and has to word weather the same way. Re-exported under the names this file always had. */
export { WEATHER_CAUSE_LABEL as CAUSE_LABEL, weatherClockWords as clockWords, weatherTimeRange as timeRange };

const weekday = (date: string, style: "short" | "long") => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: style });

/** "Today", then "Thu", "Fri" — a day tile's name. */
export function dayName(date: string, today: string): string {
  return date === today ? "Today" : weekday(date, "short");
}

/** "today", "tomorrow", "Thursday" — how a sentence names the day. */
export function daySpoken(date: string, today: string): string {
  if (date === today) return "today";
  const next = new Date(`${today}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return date === tomorrow ? "tomorrow" : weekday(date, "long");
}

/** "Thu, Sep 25" — a date in a sentence about the schedule. */
export function dateWords(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "Thu, Sep 25 – Fri, Sep 26", or one date when a job is one day long. */
export function spanWords(start: string, end: string): string {
  return start === end ? dateWords(start) : `${dateWords(start)} – ${dateWords(end)}`;
}

/**
 * When a site's reading was taken, on the reader's own clock — the clock the section's "updated"
 * time is on, which is what it is read beside: "10:45 AM" today, "Tue 11:45 PM" another day.
 */
export function readingWhen(at: string, today: string): string {
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
  const clock = moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return date === today ? clock : `${dayName(date, today)} ${clock}`;
}

/* ---- the days: what a tile says ----------------------------------------------------------- */

const worstFirst = (a: Pick<WeatherWindow, "severity" | "start">, b: Pick<WeatherWindow, "severity" | "start">) =>
  Number(b.severity === "hold") - Number(a.severity === "hold") || a.start.localeCompare(b.start);

/** The windows that land inside [from, to), worst first — the server's own rule (weatherConflicts.ts). */
export function windowsDuring(windows: WeatherWindow[], from: string, to: string): WeatherWindow[] {
  return windows.filter((window) => window.start < to && window.end > from).sort(worstFirst);
}

/**
 * A day's weather that could reach a crew: the windows between 6 AM and 7 PM, worst first. A tile is
 * tinted by the worst of them, so a tile and the jobs listed under it never disagree about a day.
 */
export function daytimeWindows(site: SiteWeatherForecast, date: string): WeatherWindow[] {
  return windowsDuring(site.windows, `${date}T06:00`, `${date}T19:00`);
}

/* ---- what came back ----------------------------------------------------------------------- */

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string";
const CAUSES: readonly WeatherCause[] = ["lightning", "rain", "snow", "wind", "heat", "cold", "fog"];
const isCause = (value: unknown): value is WeatherCause => CAUSES.includes(value as WeatherCause);
const isSeverity = (value: unknown): value is WeatherSeverity => value === "watch" || value === "hold";

function readReading(value: unknown): WeatherReading | null {
  const reading = value as Partial<WeatherReading> | null;
  if (!reading || !isText(reading.at) || !isNumber(reading.tempF) || !isNumber(reading.code)) return null;
  return { at: reading.at, tempF: reading.tempF, code: reading.code };
}

function readDay(value: unknown): WeatherForecastDay | null {
  const day = value as Partial<WeatherForecastDay> | null;
  if (!day || !isText(day.date) || !isNumber(day.highF) || !isNumber(day.lowF)) return null;
  return {
    date: day.date,
    code: isNumber(day.code) ? day.code : 3,
    highF: day.highF,
    lowF: day.lowF,
    rainChance: isNumber(day.rainChance) ? day.rainChance : 0,
    rainInches: isNumber(day.rainInches) ? day.rainInches : 0,
    gustMph: isNumber(day.gustMph) ? day.gustMph : 0
  };
}

function readWindow(value: unknown): WeatherWindow | null {
  const window = value as Partial<WeatherWindow> | null;
  if (!window || !isCause(window.cause) || !isSeverity(window.severity) || !isText(window.start) || !isText(window.end)) return null;
  return {
    cause: window.cause,
    severity: window.severity,
    start: window.start,
    end: window.end,
    reason: isText(window.reason) ? window.reason : ""
  };
}

const STATUSES: readonly WeatherConflict["status"][] = ["open", "cancelled", "kept", "cleared"];

/** A stored conflict as the section can use it, or null. Also reads bootstrap's `weatherConflicts`. */
export function readConflict(value: unknown): WeatherConflict | null {
  const row = value as Partial<WeatherConflict> | null;
  if (!row || !isText(row.id) || !isText(row.jobId) || !isText(row.projectId) || !isText(row.date)) return null;
  if (!isCause(row.cause) || !isSeverity(row.severity) || !isText(row.start) || !isText(row.end)) return null;
  if (!STATUSES.includes(row.status as WeatherConflict["status"])) return null;
  const conflict: WeatherConflict = {
    id: row.id,
    jobId: row.jobId,
    projectId: row.projectId,
    date: row.date,
    cause: row.cause,
    severity: row.severity,
    start: row.start,
    end: row.end,
    reason: isText(row.reason) ? row.reason : "",
    assigneeId: isText(row.assigneeId) ? row.assigneeId : "",
    status: row.status as WeatherConflict["status"],
    detectedAt: isText(row.detectedAt) ? row.detectedAt : "",
    updatedAt: isText(row.updatedAt) ? row.updatedAt : ""
  };
  if (isText(row.decidedAt)) conflict.decidedAt = row.decidedAt;
  if (isText(row.decidedBy)) conflict.decidedBy = row.decidedBy;
  if (isText(row.varianceId)) conflict.varianceId = row.varianceId;
  if (isText(row.delayIQId)) conflict.delayIQId = row.delayIQId;
  return conflict;
}

/** A list of conflicts, keeping the ones it can read. */
export function readConflicts(value: unknown): WeatherConflict[] {
  return Array.isArray(value) ? value.map(readConflict).filter((conflict): conflict is WeatherConflict => conflict !== null) : [];
}

/**
 * The forecast this section can render, or null.
 *
 * ONE PANEL MUST NOT TAKE THE DASHBOARD DOWN (the Meetings panel's lesson). A reply of another
 * shape — which is what every test's blanket fetch mock returns, and what a proxy's error page
 * would be — is no forecast at all, and the section says it could not be had.
 */
export function readForecast(value: unknown): WeatherForecastPayload | null {
  const payload = value as Partial<WeatherForecastPayload> | null;
  if (!payload || payload.source !== "open-meteo" || !Array.isArray(payload.sites)) return null;
  const sites = payload.sites.flatMap((raw): SiteWeatherForecast[] => {
    const site = raw as Partial<SiteWeatherForecast> | null;
    if (!site || !isText(site.projectId) || !Array.isArray(site.days)) return [];
    const days = site.days.map(readDay).filter((day): day is WeatherForecastDay => day !== null);
    if (days.length === 0) return [];
    const locatedBy = site.locatedBy === "custom" || site.locatedBy === "address" ? site.locatedBy : "project";
    return [
      {
        projectId: site.projectId,
        place: isText(site.place) ? site.place : "",
        locatedBy,
        timezone: isText(site.timezone) ? site.timezone : "",
        fetchedAt: isText(site.fetchedAt) ? site.fetchedAt : "",
        current: readReading(site.current),
        days,
        windows: Array.isArray(site.windows)
          ? site.windows.map(readWindow).filter((window): window is WeatherWindow => window !== null)
          : []
      }
    ];
  });
  const unplaced = Array.isArray(payload.unplaced) ? payload.unplaced.filter(isText) : [];
  return { source: "open-meteo", sites, unplaced, conflicts: readConflicts(payload.conflicts) };
}

/* ---- a reschedule's dates, and what checked them ------------------------------------------ */

/**
 * Why a weather reschedule's new dates were NOT checked against the forecast, in words for whoever
 * decides it — or "" when they were (or the reschedule predates the check). Calling a day off works
 * while the forecast cannot be read, and then the working calendar alone chose the dates.
 */
export function uncheckedReason(
  proposal: Pick<VarianceProposal, "weatherCheck" | "currentStart" | "proposedStart" | "proposedEnd">,
  lostDate: string
): string {
  if (proposal.weatherCheck === "unavailable") {
    return "The forecast could not be read when this day was called off, so these dates follow the working calendar only. Check the weather before you reschedule.";
  }
  if (proposal.weatherCheck === "beyond") {
    // the day the move turns on: the new start when the first day was lost, else the new finish
    const movedTo = lostDate <= proposal.currentStart ? proposal.proposedStart : proposal.proposedEnd;
    return `The forecast does not reach ${dateWords(movedTo)} yet, so that day follows the working calendar only. Check the weather nearer the day.`;
  }
  return "";
}

/** How Pending Approvals names a variance WeatherIQ raised, and whether the forecast checked its dates. */
export function approvalPrefix(variance: Pick<ScheduleVariance, "kind" | "proposal">): string {
  if (variance.kind !== "weather") return "";
  const check = variance.proposal.weatherCheck;
  return check === "unavailable" || check === "beyond" ? "Weather reschedule, forecast not checked · " : "Weather reschedule · ";
}

/* ---- the rows: what the section lists ----------------------------------------------------- */

/**
 * Where a job day stands. Open: waiting on the person in charge. Reschedule: called off, and the
 * suggested new dates are waiting on a decision. Rescheduled / called off: decided. Kept: they chose
 * to work it.
 */
export type RowState = "open" | "reschedule" | "rescheduled" | "called-off" | "kept";

export type WeatherRow = {
  key: string;
  /** The stored conflict, which a person can act on; null for a row read from a saved alert. */
  conflict: WeatherConflict | null;
  job: Job;
  projectId: string;
  date: string;
  cause: WeatherCause;
  severity: WeatherSeverity;
  /** "Thu 1–3 PM", or the day alone for a saved alert, which has no hours. */
  when: string;
  reason: string;
  state: RowState;
};

export function rowState(conflict: WeatherConflict, variances: ScheduleVariance[]): RowState {
  if (conflict.status === "kept") return "kept";
  if (conflict.status !== "cancelled") return "open";
  const variance = conflict.varianceId ? variances.find((item) => item.id === conflict.varianceId) : undefined;
  if (variance?.status === "pending") return "reschedule";
  if (variance?.status === "accepted") return "rescheduled";
  return "called-off";
}

/** The Dashboard's pill for each state: the text, and the status class the skin paints (§11a). */
export const ROW_BADGE: Record<RowState, { text: string; tone: string } | null> = {
  open: null, // an open row's pill is its severity
  reschedule: { text: "Reschedule?", tone: "medium" },
  rescheduled: { text: "Rescheduled", tone: "ready" },
  "called-off": { text: "Called off", tone: "" },
  kept: { text: "Kept on", tone: "" }
};

export function badgeFor(row: Pick<WeatherRow, "state" | "severity">): { text: string; tone: string } {
  return ROW_BADGE[row.state] ?? (row.severity === "hold" ? { text: "Hold", tone: "high" } : { text: "Watch", tone: "medium" });
}

const STATE_ORDER: Record<RowState, number> = { open: 0, reschedule: 1, "called-off": 2, rescheduled: 3, kept: 4 };

/**
 * The stored conflicts as rows, from today on, for jobs still on the schedule: what needs a decision
 * first (a hold before a watch, then the soonest), then what is waiting on a reschedule, then what
 * was decided.
 */
export function conflictRows(conflicts: WeatherConflict[], jobs: Job[], variances: ScheduleVariance[], today: string): WeatherRow[] {
  return conflicts
    .filter((conflict) => conflict.date >= today && conflict.status !== "cleared")
    .flatMap((conflict): WeatherRow[] => {
      const job = jobs.find((item) => item.id === conflict.jobId);
      if (!job) return [];
      return [
        {
          key: conflict.id,
          conflict,
          job,
          projectId: conflict.projectId,
          date: conflict.date,
          cause: conflict.cause,
          severity: conflict.severity,
          when: `${dayName(conflict.date, today)} ${weatherTimeRange(conflict.start, conflict.end)}`,
          reason: conflict.reason,
          state: rowState(conflict, variances)
        }
      ];
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        (a.state === "open" ? Number(b.severity === "hold") - Number(a.severity === "hold") : 0) ||
        a.date.localeCompare(b.date) ||
        (a.conflict?.start ?? "").localeCompare(b.conflict?.start ?? "")
    );
}

/* ---- the fallback: the alerts a workspace keeps by hand ----------------------------------- */

/**
 * The title names the weather; the details only say more about it, so the title is read first.
 * Short words match whole ("ice", not the "ice" in "office"; "hot", not "shot").
 */
export function causeIn(text: string): Exclude<WeatherCause, "lightning" | "fog"> | null {
  if (/\b(rain|storm|shower|thunder|downpour|flood|hail|lightning|precip)/.test(text)) return "rain";
  if (/\b(wind|gust|tornado)/.test(text)) return "wind";
  if (/\b(cold|freez|snow|frost|sleet)|\b(ice|icy)\b/.test(text)) return "cold";
  if (/\bheat|\bhot\b/.test(text)) return "heat";
  return null;
}

const openOn = (job: Job, date: string) => job.status !== "Complete" && job.startDate <= date && date <= job.endDate;

/**
 * The saved alerts as rows, for when the forecast cannot be had: an alert is a day of weather at its
 * site (every site when it names none). A High alert is a hold; a lower one counts only when it names
 * weather, as the Weather Impact panel this replaced decided. Once per job, at its worst day.
 */
export function alertRows(alerts: WeatherAlert[], jobs: Job[], today: string, days = 7): WeatherRow[] {
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  const last = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const worst = new Map<string, WeatherRow>();
  for (const alert of alerts) {
    const date = alert.startsAt.slice(0, 10);
    if (date < today || date > last) continue;
    const cause = causeIn(alert.title.toLowerCase()) ?? causeIn(alert.details.toLowerCase());
    if (alert.severity !== "High" && !cause) continue;
    const severity: WeatherSeverity = alert.severity === "High" ? "hold" : "watch";
    for (const job of jobs) {
      if ((alert.projectId && job.projectId !== alert.projectId) || !openOn(job, date)) continue;
      const known = worst.get(job.id);
      if (known && !(known.severity === "watch" && severity === "hold")) continue;
      worst.set(job.id, {
        key: `alert-${alert.id}-${job.id}`,
        conflict: null,
        job,
        projectId: job.projectId,
        date,
        cause: cause ?? "rain",
        severity,
        when: capital(daySpoken(date, today)),
        reason: alert.title,
        state: "open"
      });
    }
  }
  return [...worst.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.severity === "hold") - Number(a.severity === "hold") ||
      a.job.phase.localeCompare(b.job.phase)
  );
}

/* ---- which site the section opens on ------------------------------------------------------ */

/**
 * The site worth looking at first: where the soonest job day waiting on a decision is; failing
 * that, where the most work is scheduled this week; failing that, the first site.
 */
export function focusSite(forecast: WeatherForecastPayload, rows: WeatherRow[], jobs: Job[], today: string): string | null {
  const ids = new Set(forecast.sites.map((site) => site.projectId));
  const waiting = rows.find((row) => row.state === "open" && ids.has(row.projectId));
  if (waiting) return waiting.projectId;
  const lastDay = forecast.sites[0]?.days.at(-1)?.date ?? today;
  const load = new Map<string, number>();
  for (const job of jobs) {
    if (!ids.has(job.projectId) || job.status === "Complete" || job.endDate < today || job.startDate > lastDay) continue;
    load.set(job.projectId, (load.get(job.projectId) ?? 0) + 1);
  }
  const busiest = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
  return busiest?.[0] ?? forecast.sites[0]?.projectId ?? null;
}

/* ---- small words -------------------------------------------------------------------------- */

export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Harbor Tower", "Harbor Tower and Pier 9", "Harbor Tower, Pier 9 and 2 more". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export const siteName = (projects: Project[], projectId: string) =>
  projects.find((project) => project.id === projectId)?.name ?? "Job site";
