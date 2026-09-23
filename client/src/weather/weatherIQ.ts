/**
 * WeatherIQ — the rules behind the Dashboard's forecast section (2026-09-23).
 *
 * Asked for as "a pulled-in forecast widget for job sites — useful, low-cost, don't over-engineer
 * the AI part of it for launch". So the "IQ" is this file: four plain thresholds a jobsite already
 * plans around, laid over the week's scheduled jobs. No model is asked anything.
 *
 * The forecast itself comes from the server (server/src/weather.ts, Open-Meteo, cached there).
 * When it cannot be reached, the section falls back to the weather alerts the workspace keeps by
 * hand and SAYS so — an unreachable forecast must never read as a week without weather.
 *
 * Pure functions, so the rules are tested without rendering anything (weatherIQ.test.ts).
 */
import type { Job, Project, SiteWeatherForecast, WeatherAlert, WeatherForecastDay, WeatherForecastPayload } from "@buildflow/shared";

/** Clear: work as planned. Watch: weather that costs production. Hold: weather nobody should be working in. */
export type WeatherRisk = "clear" | "watch" | "hold";
export type WeatherCause = "rain" | "wind" | "heat" | "cold";

/**
 * The thresholds, stated once. A quarter inch of rain is a pour lost; a 35 mph gust grounds a lift
 * or a crane pick; freezing needs blankets or a delay. Heat starts at 100 °F rather than the 95 °F
 * a hot-weather concreting plan starts at, because a Texas September sits at 95–99 every day and a
 * section that flags every day tells nobody anything.
 */
export const THRESHOLDS = {
  rain: { watchChance: 60, holdChance: 85, watchInches: 0.1, holdInches: 0.25 },
  wind: { watchMph: 25, holdMph: 35 },
  heat: { watchF: 100, holdF: 105 },
  cold: { watchF: 32, holdF: 20 }
} as const;

export type DayScore = { risk: WeatherRisk; cause: WeatherCause | null; reason: string };

/** The worst thing a day's weather does to outdoor work, and in words why. */
export function scoreDay(day: WeatherForecastDay): DayScore {
  const scores: Array<{ risk: Exclude<WeatherRisk, "clear">; cause: WeatherCause; reason: string }> = [];
  const { rain, wind, heat, cold } = THRESHOLDS;
  const inches = day.rainInches >= 0.05 ? `, ${day.rainInches.toFixed(day.rainInches < 1 ? 2 : 1)} in` : "";
  const wet = `${day.rainChance}% chance of rain${inches}`;
  if (day.rainInches >= rain.holdInches || day.rainChance >= rain.holdChance) scores.push({ risk: "hold", cause: "rain", reason: wet });
  else if (day.rainInches >= rain.watchInches || day.rainChance >= rain.watchChance)
    scores.push({ risk: "watch", cause: "rain", reason: wet });
  if (day.gustMph >= wind.holdMph) scores.push({ risk: "hold", cause: "wind", reason: `gusts to ${day.gustMph} mph` });
  else if (day.gustMph >= wind.watchMph) scores.push({ risk: "watch", cause: "wind", reason: `gusts to ${day.gustMph} mph` });
  if (day.lowF <= cold.holdF) scores.push({ risk: "hold", cause: "cold", reason: `a low of ${day.lowF}°F` });
  else if (day.lowF <= cold.watchF) scores.push({ risk: "watch", cause: "cold", reason: `a low of ${day.lowF}°F` });
  if (day.highF >= heat.holdF) scores.push({ risk: "hold", cause: "heat", reason: `a high of ${day.highF}°F` });
  else if (day.highF >= heat.watchF) scores.push({ risk: "watch", cause: "heat", reason: `a high of ${day.highF}°F` });
  const worst = scores.find((score) => score.risk === "hold") ?? scores[0];
  return worst ?? { risk: "clear", cause: null, reason: "" };
}

/** What a WMO weather code looks like, for the icon and the words beside it. */
export type ConditionKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export function conditionOf(code: number): { kind: ConditionKind; label: string } {
  if (code === 0) return { kind: "clear", label: "Clear" };
  if (code === 1) return { kind: "partly", label: "Mostly clear" };
  if (code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: code >= 56 ? "Freezing drizzle" : "Drizzle" };
  if (code >= 61 && code <= 67) return { kind: "rain", label: code >= 66 ? "Freezing rain" : code === 65 ? "Heavy rain" : "Rain" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { kind: "rain", label: "Showers" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Snow showers" };
  if (code >= 95) return { kind: "storm", label: code === 95 ? "Thunderstorms" : "Storms with hail" };
  return { kind: "cloudy", label: "Cloudy" };
}

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

/* ---- what came back ----------------------------------------------------------------------- */

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readDay(value: unknown): WeatherForecastDay | null {
  const day = value as Partial<WeatherForecastDay> | null;
  if (!day || typeof day.date !== "string" || !isNumber(day.highF) || !isNumber(day.lowF)) return null;
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

/**
 * The forecast this section can render, or null.
 *
 * ONE PANEL MUST NOT TAKE THE DASHBOARD DOWN (the Meetings panel's lesson). A reply of another
 * shape — which is what every test's blanket fetch mock returns, and what a proxy's error page
 * would be — is no forecast at all, and the section falls back to the saved alerts and says so.
 */
export function readForecast(value: unknown): WeatherForecastPayload | null {
  const payload = value as Partial<WeatherForecastPayload> | null;
  if (!payload || payload.source !== "open-meteo" || !Array.isArray(payload.sites)) return null;
  const sites = payload.sites.flatMap((raw): SiteWeatherForecast[] => {
    const site = raw as Partial<SiteWeatherForecast> | null;
    if (!site || typeof site.projectId !== "string" || !Array.isArray(site.days)) return [];
    const days = site.days.map(readDay).filter((day): day is WeatherForecastDay => day !== null);
    if (days.length === 0) return [];
    return [
      {
        projectId: site.projectId,
        place: typeof site.place === "string" ? site.place : "",
        timezone: typeof site.timezone === "string" ? site.timezone : "",
        fetchedAt: typeof site.fetchedAt === "string" ? site.fetchedAt : "",
        days
      }
    ];
  });
  const unplaced = Array.isArray(payload.unplaced) ? payload.unplaced.filter((id): id is string => typeof id === "string") : [];
  return { source: "open-meteo", sites, unplaced };
}

/* ---- the read: which scheduled work the week's weather reaches ---------------------------- */

export type JobAtRisk = {
  job: Job;
  projectId: string;
  date: string;
  risk: Exclude<WeatherRisk, "clear">;
  cause: WeatherCause;
  /** Why, in words: "96% chance of rain, 0.91 in", or a saved alert's title. */
  reason: string;
};

const openOn = (job: Job, date: string) => job.status !== "Complete" && job.startDate <= date && date <= job.endDate;

/** A hold outranks a watch; between equals, the sooner day. */
function keepWorst(worst: Map<string, JobAtRisk>, next: JobAtRisk) {
  const known = worst.get(next.job.id);
  if (!known || (known.risk === "watch" && next.risk === "hold")) worst.set(next.job.id, next);
}

const byDayThenRisk = (a: JobAtRisk, b: JobAtRisk) =>
  a.date.localeCompare(b.date) || Number(b.risk === "hold") - Number(a.risk === "hold") || a.job.phase.localeCompare(b.job.phase);

/**
 * Every open job scheduled at a site on a day the forecast scores watch or hold — once per job,
 * at its worst day, soonest first. Days before today are not this week's problem.
 */
export function jobsAtRisk(forecast: WeatherForecastPayload, jobs: Job[], today: string): JobAtRisk[] {
  const worst = new Map<string, JobAtRisk>();
  for (const site of forecast.sites) {
    for (const day of site.days) {
      if (day.date < today) continue;
      const score = scoreDay(day);
      if (score.risk === "clear" || !score.cause) continue;
      for (const job of jobs) {
        if (job.projectId !== site.projectId || !openOn(job, day.date)) continue;
        keepWorst(worst, { job, projectId: site.projectId, date: day.date, risk: score.risk, cause: score.cause, reason: score.reason });
      }
    }
  }
  return [...worst.values()].sort(byDayThenRisk);
}

/* ---- the fallback: the alerts a workspace keeps by hand ----------------------------------- */

/**
 * The title names the weather; the details only say more about it, so the title is read first.
 * Short words match whole ("ice", not the "ice" in "office"; "hot", not "shot").
 */
export function causeIn(text: string): WeatherCause | null {
  if (/\b(rain|storm|shower|thunder|downpour|flood|hail|lightning|precip)/.test(text)) return "rain";
  if (/\b(wind|gust|tornado)/.test(text)) return "wind";
  if (/\b(cold|freez|snow|frost|sleet)|\b(ice|icy)\b/.test(text)) return "cold";
  if (/\bheat|\bhot\b/.test(text)) return "heat";
  return null;
}

/**
 * The saved alerts, read the way the forecast is: an alert is a day of weather at its site (every
 * site when it names none). A High alert is a hold; a lower one counts only when it names weather
 * that stops work, as the Weather Impact panel this replaced decided.
 */
export function alertRisks(alerts: WeatherAlert[], jobs: Job[], today: string, days = 7): JobAtRisk[] {
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  const last = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const worst = new Map<string, JobAtRisk>();
  for (const alert of alerts) {
    const date = alert.startsAt.slice(0, 10);
    if (date < today || date > last) continue;
    const cause = causeIn(alert.title.toLowerCase()) ?? causeIn(alert.details.toLowerCase());
    if (alert.severity !== "High" && !cause) continue;
    for (const job of jobs) {
      if ((alert.projectId && job.projectId !== alert.projectId) || !openOn(job, date)) continue;
      keepWorst(worst, {
        job,
        projectId: job.projectId,
        date,
        risk: alert.severity === "High" ? "hold" : "watch",
        cause: cause ?? "rain",
        reason: alert.title
      });
    }
  }
  return [...worst.values()].sort(byDayThenRisk);
}

/* ---- which site the section opens on ------------------------------------------------------ */

/**
 * The site worth looking at first: where the soonest job at risk is; failing that, where the most
 * work is scheduled this week; failing that, the first site.
 */
export function focusSite(forecast: WeatherForecastPayload, risks: JobAtRisk[], jobs: Job[], today: string): string | null {
  const ids = new Set(forecast.sites.map((site) => site.projectId));
  const atRisk = risks.find((risk) => ids.has(risk.projectId));
  if (atRisk) return atRisk.projectId;
  const lastDay = forecast.sites[0]?.days.at(-1)?.date ?? today;
  const load = new Map<string, number>();
  for (const job of jobs) {
    if (!ids.has(job.projectId) || job.status === "Complete" || job.endDate < today || job.startDate > lastDay) continue;
    load.set(job.projectId, (load.get(job.projectId) ?? 0) + 1);
  }
  const busiest = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
  return busiest?.[0] ?? forecast.sites[0]?.projectId ?? null;
}

/** "Harbor Tower", "Harbor Tower and Pier 9", "Harbor Tower, Pier 9 and 2 more". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export const siteName = (projects: Project[], projectId: string) =>
  projects.find((project) => project.id === projectId)?.name ?? "Job site";
