/**
 * ForecastIQ — what the weather is about to do to the schedule (2026-09-22).
 *
 * TWO SOURCES, ONE SHAPE. The forecast itself comes from Open-Meteo, read for every site's own
 * coordinates (one request for all of them, no key, no account). When that cannot be reached —
 * offline, blocked, or under test — the page falls back to the weather alerts the workspace
 * already keeps, and SAYS so. Both are turned into the same thing: six-hour blocks over the
 * next two days with the rain, gusts and temperature in each.
 *
 * THE READ is the part that is this program's. Each block is scored against thresholds a
 * jobsite plans around (a quarter inch of rain is a pour lost, a 35 mph gust grounds a lift),
 * then every open job at that site during that block is at risk. The headline is jobs, not
 * blocks, because "21 windows at risk" means nothing to a superintendent and "3 jobs at
 * weather risk by Thursday" does. The trade's own weather rule is carried along as the
 * explanation, because the thresholds are general and the rule is theirs.
 */
import type { Job, Project, WeatherAlert } from "@buildflow/shared";

export type ForecastBlock = {
  /** The block's start. */
  at: Date;
  rainInches: number;
  rainChance: number;
  gustMph: number;
  /** The warmest hour in the block. */
  highF: number;
  /** The coldest. */
  lowF: number;
};

export type SiteForecast = { projectId: string; blocks: ForecastBlock[] };
export type ForecastSource = "forecast" | "alerts" | "none";

export type WeatherRisk = "clear" | "watch" | "hold";
export type WeatherCause = "rain" | "wind" | "heat" | "cold";

export type ForecastCell = { projectId: string; at: Date; risk: WeatherRisk; cause: WeatherCause | null };
export type JobAtRisk = { job: Job; project: Project; at: Date; risk: WeatherRisk; cause: WeatherCause };

export type ForecastRead = {
  /** Open jobs touched by a watch or a hold in the horizon — the headline. */
  jobsAtRisk: JobAtRisk[];
  /** One row per site, one cell per block. */
  rows: Array<{ project: Project; cells: ForecastCell[] }>;
  /** The blocks' starts, for the column heads. */
  columns: Date[];
  counts: Record<WeatherCause, number>;
  horizonHours: number;
};

export const HORIZON_HOURS = 48;
export const BLOCK_HOURS = 6;

/* The thresholds, stated once. A "watch" is weather that costs production; a "hold" is weather
   nobody should be working in. */
const RAIN = { watchInches: 0.1, holdInches: 0.25, watchChance: 60, holdChance: 85 };
const WIND = { watchMph: 25, holdMph: 35 };
const HEAT = { watchF: 95, holdF: 102 };
const COLD = { watchF: 34, holdF: 20 };

/** Where each site's block boundaries fall: from the top of the current hour, every six hours. */
export function blockStarts(now: Date): Date[] {
  const first = new Date(now);
  first.setMinutes(0, 0, 0);
  return Array.from({ length: HORIZON_HOURS / BLOCK_HOURS }, (_, index) => new Date(first.getTime() + index * BLOCK_HOURS * 3600000));
}

export function scoreBlock(block: ForecastBlock): { risk: WeatherRisk; cause: WeatherCause | null } {
  const scores: Array<{ risk: WeatherRisk; cause: WeatherCause }> = [];
  if (block.rainInches >= RAIN.holdInches || block.rainChance >= RAIN.holdChance) scores.push({ risk: "hold", cause: "rain" });
  else if (block.rainInches >= RAIN.watchInches || block.rainChance >= RAIN.watchChance) scores.push({ risk: "watch", cause: "rain" });
  if (block.gustMph >= WIND.holdMph) scores.push({ risk: "hold", cause: "wind" });
  else if (block.gustMph >= WIND.watchMph) scores.push({ risk: "watch", cause: "wind" });
  if (block.highF >= HEAT.holdF) scores.push({ risk: "hold", cause: "heat" });
  else if (block.highF >= HEAT.watchF) scores.push({ risk: "watch", cause: "heat" });
  if (block.lowF <= COLD.holdF) scores.push({ risk: "hold", cause: "cold" });
  else if (block.lowF <= COLD.watchF) scores.push({ risk: "watch", cause: "cold" });
  const worst = scores.find((score) => score.risk === "hold") ?? scores[0];
  return worst ?? { risk: "clear", cause: null };
}

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Score every site's blocks and lay the open jobs over them. */
export function readForecast(sites: Project[], forecasts: SiteForecast[], jobs: Job[], now: Date): ForecastRead {
  const columns = blockStarts(now);
  const byProject = new Map(forecasts.map((forecast) => [forecast.projectId, forecast]));
  const rows = sites.map((project) => {
    const forecast = byProject.get(project.id);
    const cells: ForecastCell[] = columns.map((at) => {
      const block = forecast?.blocks.find((candidate) => candidate.at.getTime() === at.getTime());
      const score = block ? scoreBlock(block) : { risk: "clear" as WeatherRisk, cause: null };
      return { projectId: project.id, at, ...score };
    });
    return { project, cells };
  });

  const today = localDay(now);
  const open = jobs.filter((job) => job.status !== "Complete" && job.endDate >= today);
  const worst = new Map<string, JobAtRisk>();
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.risk === "clear" || !cell.cause) continue;
      const day = localDay(cell.at);
      for (const job of open) {
        if (job.projectId !== row.project.id || job.startDate > day || day > job.endDate) continue;
        const known = worst.get(job.id);
        if (!known || (known.risk === "watch" && cell.risk === "hold")) {
          worst.set(job.id, { job, project: row.project, at: cell.at, risk: cell.risk, cause: cell.cause });
        }
      }
    }
  }
  const jobsAtRisk = [...worst.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  const counts: Record<WeatherCause, number> = { rain: 0, wind: 0, heat: 0, cold: 0 };
  for (const item of jobsAtRisk) counts[item.cause] += 1;
  return { jobsAtRisk, rows, columns, counts, horizonHours: HORIZON_HOURS };
}

/* ---- source 1: Open-Meteo, for the sites' own coordinates ------------------------------ */

type OpenMeteoHourly = {
  time: string[];
  temperature_2m?: Array<number | null>;
  precipitation?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
};
type OpenMeteoResponse = { hourly?: OpenMeteoHourly };

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

/** One request for every site; the answer is an array when there is more than one. */
export async function fetchSiteForecasts(sites: Project[], now: Date, signal?: AbortSignal): Promise<SiteForecast[]> {
  if (sites.length === 0) return [];
  const params = new URLSearchParams({
    latitude: sites.map((site) => site.latitude.toFixed(4)).join(","),
    longitude: sites.map((site) => site.longitude.toFixed(4)).join(","),
    hourly: "temperature_2m,precipitation,precipitation_probability,wind_gusts_10m",
    forecast_days: "3",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto"
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`Forecast service answered ${response.status}`);
  const payload = (await response.json()) as OpenMeteoResponse | OpenMeteoResponse[];
  const answers = Array.isArray(payload) ? payload : [payload];
  /* A 200 that is not a forecast — a proxy's page, a stub, a changed API — must not be read as
     clear skies at every site. Without hours for each site there is no forecast, and the caller
     falls back to the alerts and says so. */
  if (answers.length < sites.length || answers.some((answer) => !Array.isArray(answer?.hourly?.time))) {
    throw new Error("Forecast service answered without hourly data");
  }
  return sites.map((site, index) => ({ projectId: site.id, blocks: blocksFromHourly(answers[index]?.hourly, now) }));
}

/** Hours → six-hour blocks: rain adds up, chance and gusts take their worst, temperature its range. */
export function blocksFromHourly(hourly: OpenMeteoHourly | undefined, now: Date): ForecastBlock[] {
  if (!hourly) return [];
  const starts = blockStarts(now);
  return starts.map((at) => {
    const end = at.getTime() + BLOCK_HOURS * 3600000;
    let rainInches = 0;
    let rainChance = 0;
    let gustMph = 0;
    let highF = Number.NEGATIVE_INFINITY;
    let lowF = Number.POSITIVE_INFINITY;
    let hours = 0;
    hourly.time.forEach((stamp, index) => {
      // Open-Meteo stamps hours in the site's zone without an offset; read them as local time
      const time = new Date(stamp).getTime();
      if (!Number.isFinite(time) || time < at.getTime() || time >= end) return;
      hours += 1;
      rainInches += hourly.precipitation?.[index] ?? 0;
      rainChance = Math.max(rainChance, hourly.precipitation_probability?.[index] ?? 0);
      gustMph = Math.max(gustMph, hourly.wind_gusts_10m?.[index] ?? 0);
      const temp = hourly.temperature_2m?.[index];
      if (typeof temp === "number") {
        highF = Math.max(highF, temp);
        lowF = Math.min(lowF, temp);
      }
    });
    if (hours === 0) return { at, rainInches: 0, rainChance: 0, gustMph: 0, highF: 70, lowF: 70 };
    return {
      at,
      rainInches: Math.round(rainInches * 100) / 100,
      rainChance,
      gustMph,
      highF: Number.isFinite(highF) ? highF : 70,
      lowF: Number.isFinite(lowF) ? lowF : 70
    };
  });
}

/* ---- source 2: the workspace's own weather alerts -------------------------------------- */

/** The title names the weather; the details only say more about it ("Heavy rain expected —
    with gusts to 30 mph" is a rain alert). So the title is read first, the details only when
    the title says nothing. */
const causeIn = (text: string): WeatherCause | null => {
  if (/rain|storm|shower|thunder|precip/.test(text)) return "rain";
  if (/wind|gust/.test(text)) return "wind";
  if (/cold|freez|snow|ice|frost/.test(text)) return "cold";
  if (/heat|hot|°|degrees/.test(text)) return "heat";
  return null;
};
const causeOf = (alert: WeatherAlert): WeatherCause => causeIn(alert.title.toLowerCase()) ?? causeIn(alert.details.toLowerCase()) ?? "rain";

/**
 * An alert becomes a day of weather at its site (every site when it names none), heavy enough
 * to score as its severity says: High is a hold, the rest a watch.
 */
export function forecastsFromAlerts(sites: Project[], alerts: WeatherAlert[], now: Date): SiteForecast[] {
  const starts = blockStarts(now);
  const horizonEnd = starts[starts.length - 1].getTime() + BLOCK_HOURS * 3600000;
  return sites.map((site) => ({
    projectId: site.id,
    blocks: starts.map((at) => {
      const block: ForecastBlock = { at, rainInches: 0, rainChance: 0, gustMph: 0, highF: 70, lowF: 70 };
      for (const alert of alerts) {
        if (alert.projectId && alert.projectId !== site.id) continue;
        const from = new Date(alert.startsAt).getTime();
        if (!Number.isFinite(from) || from >= horizonEnd) continue;
        const until = from + 24 * 3600000;
        const end = at.getTime() + BLOCK_HOURS * 3600000;
        if (end <= from || at.getTime() >= until) continue;
        const hold = alert.severity === "High";
        switch (causeOf(alert)) {
          case "wind":
            block.gustMph = Math.max(block.gustMph, hold ? WIND.holdMph : WIND.watchMph);
            break;
          case "heat":
            block.highF = Math.max(block.highF, hold ? HEAT.holdF : HEAT.watchF);
            break;
          case "cold":
            block.lowF = Math.min(block.lowF, hold ? COLD.holdF : COLD.watchF);
            break;
          default:
            block.rainInches = Math.max(block.rainInches, hold ? RAIN.holdInches : RAIN.watchInches);
            block.rainChance = Math.max(block.rainChance, hold ? RAIN.holdChance : RAIN.watchChance);
        }
      }
      return block;
    })
  }));
}

export const CAUSE_LABEL: Record<WeatherCause, string> = { rain: "rain", wind: "wind", heat: "heat", cold: "cold" };

/** "Thu 6 AM" for a column head; the day only when it changes. */
export function columnLabel(at: Date, previous: Date | null): string {
  const hour = at.getHours();
  const clock = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
  if (previous && previous.getDate() === at.getDate()) return clock;
  return `${at.toLocaleDateString("en-US", { weekday: "short" })} ${clock}`;
}
