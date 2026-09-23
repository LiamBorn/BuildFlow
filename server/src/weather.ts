/**
 * WeatherIQ's forecast: the next seven days at every active job site (2026-09-23).
 *
 * Asked for as "a pulled-in forecast widget for job sites — useful, low-cost, don't over-engineer
 * the AI part of it for launch". So this is one provider read on the server and cached there, and
 * the "IQ" is plain thresholds on the client (client/src/weather/weatherIQ.ts), not a model.
 *
 * WHY THE SERVER READS IT, NOT THE BROWSER. Two reasons, both about cost. A forecast is re-read at
 * most once per site every half hour however many people open the Dashboard, which keeps a busy
 * workspace far inside the provider's limits. And a commercial key, when there is one, never
 * reaches a browser.
 *
 * THE LICENCE. Open-Meteo's free API is for non-commercial use (under 10,000 calls a day). A
 * commercial deployment needs one of its API plans: set OPEN_METEO_API_KEY and both requests go to
 * the `customer-` hosts with the key, parameters and answers otherwise identical. The data is
 * CC BY 4.0, which is why the panel credits it. WEATHER_FORECAST_URL / WEATHER_GEOCODE_URL point
 * the two requests somewhere else entirely (a stand-in, a proxy).
 *
 * WHERE A SITE IS. createProject and the schedule import store every project they make at one
 * placeholder point, downtown Austin (database.ts). A stored point is only trusted when it is not
 * that placeholder. Otherwise the site is found from its address with Open-Meteo's own geocoder:
 * the ZIP code first, then "City, ST". A site that cannot be found is reported as unplaced rather
 * than forecast in Austin, because weather for the wrong city reads exactly like weather for the
 * right one.
 */
import type { Job, Project, SiteWeatherForecast, WeatherForecastDay, WeatherForecastPayload } from "@buildflow/shared";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const apiKey = () => env("OPEN_METEO_API_KEY");
export const forecastUrl = () =>
  env("WEATHER_FORECAST_URL") ?? (apiKey() ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast");
export const geocodeUrl = () =>
  env("WEATHER_GEOCODE_URL") ??
  (apiKey() ? "https://customer-geocoding-api.open-meteo.com/v1/search" : "https://geocoding-api.open-meteo.com/v1/search");

/** A week: what a superintendent plans against. */
export const FORECAST_DAYS = 7;
/** More sites than a Dashboard panel can show a person; the busiest come first (activeSites). */
export const MAX_SITES = 25;
/** A site's forecast is re-read at most this often… */
const FRESH_MS = 30 * 60_000;
/** …and served this old, saying so through its `fetchedAt`, while the provider cannot be reached. */
const STALE_MS = 6 * 60 * 60_000;
/** A site found from its address is remembered for a week; one that could not be found is asked again within the hour. */
const PLACED_MS = 7 * 24 * 60 * 60_000;
const UNPLACED_MS = 60 * 60_000;
const TIMEOUT_MS = 8_000;

/** Where createProject and the schedule import put every project they make (database.ts). */
export const PLACEHOLDER_POINT = { latitude: 30.2672, longitude: -97.7431 } as const;

export class WeatherUnavailableError extends Error {}

type Point = { latitude: number; longitude: number; place: string };

/** A stored point that is a real place: finite, on the globe, not 0,0, and not the placeholder. */
export function hasRealPoint(project: Pick<Project, "latitude" | "longitude">): boolean {
  const { latitude, longitude } = project;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  const placeholder = Math.abs(latitude - PLACEHOLDER_POINT.latitude) < 1e-4 && Math.abs(longitude - PLACEHOLDER_POINT.longitude) < 1e-4;
  return !placeholder;
}

/** "TX 78701" or "TX": the state part of a US address. */
const STATE_PART = /^([A-Z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/;

/**
 * What to ask the geocoder for this site, most precise first: the ZIP ("78701"), then "City, ST"
 * from the address, then from the location, then the location as written. The ZIP is read only
 * where it follows a state code, so a house number like "12345 Research Blvd" is never taken for
 * one; and the geocoder searches place names, so a street address is never sent whole.
 */
export function siteQueries(project: Pick<Project, "address" | "location">): string[] {
  const zips: string[] = [];
  const cities: string[] = [];
  for (const text of [project.address, project.location]) {
    const parts = (text ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    for (let index = parts.length - 1; index >= 1; index -= 1) {
      const state = STATE_PART.exec(parts[index]);
      if (!state) continue;
      if (state[2]) zips.push(state[2]);
      cities.push(`${parts[index - 1]}, ${state[1]}`);
      break;
    }
  }
  const raw = project.location?.trim() ?? "";
  return [...new Set([...zips, ...cities, ...(raw.length >= 2 ? [raw] : [])])];
}

/* ---- the geocoder ------------------------------------------------------------------------ */

type GeocodeResult = { name?: unknown; admin1?: unknown; latitude?: unknown; longitude?: unknown; feature_code?: unknown };

const placed = new Map<string, { at: number; point: Point | null }>();
const placing = new Map<string, Promise<Point | null>>();

/** Every way a request can fail is the same thing to the panel: the forecast cannot be had right now. */
async function getJson(url: URL): Promise<unknown> {
  const key = apiKey();
  if (key) url.searchParams.set("apikey", key);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new WeatherUnavailableError("The weather service could not be reached");
  }
  if (!response.ok) throw new WeatherUnavailableError(`The weather service answered ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new WeatherUnavailableError("The weather service answered with something that is not JSON");
  }
}

/**
 * One query to a point, or null when nothing in the answer is a town. A ZIP names its town, so its
 * first answer is taken; a name is fuzzy-matched ("North Austin" also finds a civic association
 * and a ball field), so only a populated place (a PPL* feature code) is taken for one.
 */
async function lookUp(query: string): Promise<Point | null> {
  const url = new URL(geocodeUrl());
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const isZip = /^\d{5}$/.test(query);
  const isUs = isZip || /,\s*[A-Z]{2}$/.test(query);
  if (isUs) url.searchParams.set("countryCode", "US");
  const answer = (await getJson(url)) as { results?: unknown };
  const results = Array.isArray(answer?.results) ? (answer.results as GeocodeResult[]) : [];
  const town = results.find(
    (result) =>
      typeof result.latitude === "number" &&
      typeof result.longitude === "number" &&
      (isZip || (typeof result.feature_code === "string" && result.feature_code.startsWith("PPL")))
  );
  if (!town) return null;
  const name = typeof town.name === "string" ? town.name : query;
  const region = typeof town.admin1 === "string" && town.admin1 !== name ? town.admin1 : "";
  return { latitude: town.latitude as number, longitude: town.longitude as number, place: region ? `${name}, ${region}` : name };
}

async function geocode(query: string, now: number): Promise<Point | null> {
  const known = placed.get(query);
  if (known && now - known.at < (known.point ? PLACED_MS : UNPLACED_MS)) return known.point;
  const pending = placing.get(query);
  if (pending) return pending;
  /* An unreachable geocoder is not an answer about the address, so it is neither remembered nor
     turned into "unplaced" — that would tell a person their address is wrong when the service was
     down. It rejects, and the whole answer is unavailable. */
  const asking = lookUp(query)
    .then((point) => {
      placed.set(query, { at: now, point });
      return point;
    })
    .finally(() => placing.delete(query));
  placing.set(query, asking);
  return asking;
}

async function locate(project: Project, now: number): Promise<Point | null> {
  if (hasRealPoint(project)) {
    return { latitude: project.latitude, longitude: project.longitude, place: project.location || project.address || project.name };
  }
  for (const query of siteQueries(project)) {
    const point = await geocode(query, now);
    if (point) return point;
  }
  return null;
}

/* ---- the forecast ------------------------------------------------------------------------ */

type Forecast = { at: number; timezone: string; days: WeatherForecastDay[] };
type Daily = Record<string, unknown>;

const forecasts = new Map<string, Forecast>();
const reading = new Map<string, Promise<void>>();

/** Two decimals of a degree is about a kilometre: the same forecast cell, so one read serves neighbours. */
const cellOf = (point: Pick<Point, "latitude" | "longitude">) => `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;

const numberAt = (series: unknown, index: number): number | null => {
  const value = Array.isArray(series) ? series[index] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** One answer's `daily` block to days. A day without both temperatures is not a day of forecast. */
export function readDays(daily: Daily | undefined): WeatherForecastDay[] {
  const time = Array.isArray(daily?.time) ? (daily.time as unknown[]) : [];
  return time.flatMap((date, index): WeatherForecastDay[] => {
    const high = numberAt(daily?.temperature_2m_max, index);
    const low = numberAt(daily?.temperature_2m_min, index);
    if (typeof date !== "string" || high === null || low === null) return [];
    return [
      {
        date,
        code: Math.round(numberAt(daily?.weather_code, index) ?? 0),
        highF: Math.round(high),
        lowF: Math.round(low),
        rainChance: Math.min(100, Math.max(0, Math.round(numberAt(daily?.precipitation_probability_max, index) ?? 0))),
        rainInches: Math.round((numberAt(daily?.precipitation_sum, index) ?? 0) * 100) / 100,
        gustMph: Math.round(numberAt(daily?.wind_gusts_10m_max, index) ?? 0)
      }
    ];
  });
}

/** One request for every cell; Open-Meteo answers a list of places with a list. */
async function readCells(cells: string[], now: number): Promise<void> {
  const url = new URL(forecastUrl());
  url.searchParams.set("latitude", cells.map((cell) => cell.split(",")[0]).join(","));
  url.searchParams.set("longitude", cells.map((cell) => cell.split(",")[1]).join(","));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max"
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  const payload = await getJson(url);
  const answers = (Array.isArray(payload) ? payload : [payload]) as Array<{ timezone?: unknown; daily?: Daily }>;
  /* A 200 that is not a forecast — a proxy's page, a stub, a changed API — must not read as clear
     skies at every site (the lesson of the Map page's forecast, 2026-09-22). Without days for
     every place asked about, there is no forecast. */
  const days = answers.map((answer) => readDays(answer?.daily));
  if (answers.length !== cells.length || days.some((list) => list.length === 0)) {
    throw new WeatherUnavailableError("The weather service answered without a forecast");
  }
  cells.forEach((cell, index) => {
    const timezone = answers[index]?.timezone;
    forecasts.set(cell, { at: now, timezone: typeof timezone === "string" ? timezone : "UTC", days: days[index] });
  });
}

/**
 * The sites worth forecasting: every project that is not complete, those with work in the coming
 * week first — past MAX_SITES a panel is not the place to read them anyway.
 */
export function activeSites(projects: Project[], jobs: Job[], today: string): Project[] {
  const weekEnd = new Date(`${today}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + FORECAST_DAYS - 1);
  const end = weekEnd.toISOString().slice(0, 10);
  const busy = new Set(
    jobs.filter((job) => job.status !== "Complete" && job.startDate <= end && job.endDate >= today).map((job) => job.projectId)
  );
  return projects
    .filter((project) => project.status !== "Complete")
    .sort((a, b) => Number(busy.has(b.id)) - Number(busy.has(a.id)) || a.name.localeCompare(b.name))
    .slice(0, MAX_SITES);
}

/**
 * The forecast for a workspace's sites. Fresh cells are served from memory; the rest are read in
 * one request. When that request fails, cells up to six hours old are still served (their
 * `fetchedAt` says how old); if even that leaves a site without a forecast, the whole answer is
 * WeatherUnavailableError, which the route turns into a 502 the panel says out loud — never an
 * empty week that reads as no weather.
 */
export async function forecastForSites(projects: Project[], now = Date.now()): Promise<WeatherForecastPayload> {
  const points = await Promise.all(projects.map((project) => locate(project, now)));
  const found = projects.flatMap((project, index) => {
    const point = points[index];
    return point ? [{ project, point, cell: cellOf(point) }] : [];
  });
  const unplaced = projects.filter((_, index) => !points[index]).map((project) => project.id);

  const due = [...new Set(found.map((site) => site.cell))].filter((cell) => {
    const known = forecasts.get(cell);
    return !known || now - known.at >= FRESH_MS;
  });
  if (due.length > 0) {
    const batch = due.join("|");
    let pending = reading.get(batch);
    if (!pending) {
      pending = readCells(due, now).finally(() => reading.delete(batch));
      reading.set(batch, pending);
    }
    try {
      await pending;
    } catch {
      const missing = found.some((site) => {
        const known = forecasts.get(site.cell);
        return !known || now - known.at >= STALE_MS;
      });
      if (missing) throw new WeatherUnavailableError("The weather service could not be reached");
    }
  }

  const sites: SiteWeatherForecast[] = found.map(({ project, point, cell }) => {
    const forecast = forecasts.get(cell)!;
    return {
      projectId: project.id,
      place: point.place,
      timezone: forecast.timezone,
      fetchedAt: new Date(forecast.at).toISOString(),
      days: forecast.days
    };
  });
  return { source: "open-meteo", sites, unplaced };
}

/** Tests only: forget every point and forecast this process has read. */
export function __resetWeatherCaches() {
  placed.clear();
  placing.clear();
  forecasts.clear();
  reading.clear();
}
