/**
 * WeatherIQ's forecast: the next seven days at every active job site (2026-09-23).
 *
 * Asked for as "a pulled-in forecast widget for job sites — useful, low-cost, don't over-engineer
 * the AI part of it for launch", then (the same day) to reach every job: WHEN the weather comes,
 * WHERE, and whether it lands in a job's working hours. So this reads the provider's days AND its
 * hours, turns the hours into windows — runs of hours that cross a threshold a jobsite plans around
 * (HOURLY, below) — and weatherConflicts.ts lays the jobs over them. Plain thresholds throughout; no
 * model is asked anything. The same request brings the reading at each site as it is read (its
 * temperature and sky), which the section leads with.
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
 * WHERE A SITE IS, in this order. A location an Owner or Admin set for WeatherIQ (weather_locations)
 * wins. Then the project's stored point — but createProject and the schedule import store every
 * project they make at one placeholder point, downtown Austin (database.ts), so a stored point is only
 * trusted when it is not that placeholder. Otherwise the site is found from its address with
 * Open-Meteo's own geocoder: the ZIP code first, then "City, ST". A site that cannot be found is
 * reported as unplaced rather than forecast in Austin, because weather for the wrong city reads
 * exactly like weather for the right one.
 */
import type {
  Job,
  Project,
  SiteWeatherForecast,
  WeatherCause,
  WeatherForecastDay,
  WeatherForecastPayload,
  WeatherLocation,
  WeatherReading,
  WeatherSeverity,
  WeatherWindow
} from "@buildflow/shared";

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
type Located = Point & { locatedBy: SiteWeatherForecast["locatedBy"] };

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

async function locate(project: Project, now: number, custom?: WeatherLocation): Promise<Located | null> {
  if (custom) return { latitude: custom.latitude, longitude: custom.longitude, place: custom.place, locatedBy: "custom" };
  if (hasRealPoint(project)) {
    return {
      latitude: project.latitude,
      longitude: project.longitude,
      place: project.location || project.address || project.name,
      locatedBy: "project"
    };
  }
  for (const query of siteQueries(project)) {
    const point = await geocode(query, now);
    if (point) return { ...point, locatedBy: "address" };
  }
  return null;
}

/**
 * A person's own words for where a site is — "78701", "Round Rock, TX", a whole street address —
 * as a place, for the location an Owner or Admin sets (PUT /api/weather/locations/:projectId).
 * Asked the way a project's address is: the ZIP first, then "City, ST", then the words as written.
 */
export async function placeForQuery(query: string, now = Date.now()): Promise<Point | null> {
  const text = query.trim();
  if (text.length < 2) return null;
  const candidates = /^\d{5}(?:-\d{4})?$/.test(text) ? [text.slice(0, 5)] : siteQueries({ address: text, location: text });
  for (const candidate of candidates) {
    const point = await geocode(candidate, now);
    if (point) return point;
  }
  return null;
}

/* ---- the hours: when the weather crosses a line a jobsite plans around ------------------------ */

/**
 * Per hour, what stops or slows outdoor work. A hold is weather nobody should be working in; a
 * watch costs production. Lightning is any thunderstorm hour (WMO 95–99): a jobsite shelters when
 * thunder is heard, so a storm forecast during working hours is a hold, never a watch. Freezing
 * rain is a hold too. Heat starts at 100 °F, not the 95 °F a hot-weather concrete plan starts at,
 * because an Austin September sits in the upper 90s all month and a warning every day says nothing.
 */
export const HOURLY = {
  rain: { watchChance: 50, watchInches: 0.02, holdInches: 0.1, holdChance: 80 },
  snow: { holdInches: 0.2 },
  wind: { watchMph: 25, holdMph: 35 },
  heat: { watchF: 100, holdF: 105 },
  cold: { watchF: 32, holdF: 20 },
  fog: { watchFeet: 1000 }
} as const;

export type WeatherHour = {
  /** Site-local "YYYY-MM-DDTHH:mm", as Open-Meteo stamps it with timezone=auto. */
  time: string;
  code: number;
  tempF: number | null;
  rainChance: number;
  rainInches: number;
  snowInches: number;
  gustMph: number;
  visibilityFt: number | null;
};

const THUNDER = new Set([95, 96, 99]);
const FREEZING = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const FOG_CODES = new Set([45, 48]);
const CAUSES: WeatherCause[] = ["lightning", "rain", "snow", "wind", "heat", "cold", "fog"];

/** What one hour does to outdoor work, cause by cause. */
export function scoreHour(hour: WeatherHour): Partial<Record<WeatherCause, WeatherSeverity>> {
  const { rain, snow, wind, heat, cold, fog } = HOURLY;
  const out: Partial<Record<WeatherCause, WeatherSeverity>> = {};
  if (THUNDER.has(hour.code)) out.lightning = "hold";
  if (
    FREEZING.has(hour.code) ||
    hour.rainInches >= rain.holdInches ||
    (hour.rainChance >= rain.holdChance && hour.rainInches >= rain.watchInches)
  ) {
    out.rain = "hold";
  } else if (hour.rainChance >= rain.watchChance || hour.rainInches >= rain.watchInches) {
    out.rain = "watch";
  }
  if (hour.snowInches >= snow.holdInches) out.snow = "hold";
  else if (hour.snowInches > 0 || SNOW_CODES.has(hour.code)) out.snow = "watch";
  if (hour.gustMph >= wind.holdMph) out.wind = "hold";
  else if (hour.gustMph >= wind.watchMph) out.wind = "watch";
  if (hour.tempF !== null) {
    if (hour.tempF >= heat.holdF) out.heat = "hold";
    else if (hour.tempF >= heat.watchF) out.heat = "watch";
    if (hour.tempF <= cold.holdF) out.cold = "hold";
    else if (hour.tempF <= cold.watchF) out.cold = "watch";
  }
  if (FOG_CODES.has(hour.code) || (hour.visibilityFt !== null && hour.visibilityFt <= fog.watchFeet)) out.fog = "watch";
  return out;
}

/** The wall-clock hour after this one ("…T23:00" → the next day's "T00:00"), with no time zone involved. */
export function nextHour(time: string): string {
  const [date, clock = "00:00"] = time.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = clock.split(":").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hours + 1, minutes));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}`;
}

/** Why a run of hours crossed the line, in the words a superintendent would use. */
function reasonFor(cause: WeatherCause, hours: WeatherHour[]): string {
  const most = (values: number[]) => Math.max(...values);
  switch (cause) {
    case "lightning":
      return "thunderstorms";
    case "rain": {
      if (hours.some((hour) => FREEZING.has(hour.code))) return "freezing rain";
      const inches = hours.reduce((sum, hour) => sum + hour.rainInches, 0);
      return inches >= 0.02 ? `${inches.toFixed(2)} in of rain` : `${most(hours.map((hour) => hour.rainChance))}% chance of rain`;
    }
    case "snow": {
      const inches = hours.reduce((sum, hour) => sum + hour.snowInches, 0);
      return inches >= 0.1 ? `${inches.toFixed(1)} in of snow` : "snow";
    }
    case "wind":
      return `gusts to ${Math.round(most(hours.map((hour) => hour.gustMph)))} mph`;
    case "heat":
      return `up to ${Math.round(most(hours.map((hour) => hour.tempF ?? -Infinity)))}°F`;
    case "cold":
      return `down to ${Math.round(Math.min(...hours.map((hour) => hour.tempF ?? Infinity)))}°F`;
    case "fog":
      return "dense fog";
  }
}

/**
 * The hours as windows: for each cause, every unbroken run of hours it is active in, at the worst
 * severity any hour of the run reached. Soonest first; a hold before a watch at the same hour.
 */
export function windowsFromHours(hours: WeatherHour[]): WeatherWindow[] {
  const scored = hours.map((hour) => ({ hour, score: scoreHour(hour) }));
  const windows: WeatherWindow[] = [];
  for (const cause of CAUSES) {
    let run: typeof scored = [];
    const close = () => {
      if (run.length === 0) return;
      const severity = run.some((entry) => entry.score[cause] === "hold") ? "hold" : "watch";
      windows.push({
        cause,
        severity,
        start: run[0].hour.time,
        end: nextHour(run[run.length - 1].hour.time),
        reason: reasonFor(
          cause,
          run.map((entry) => entry.hour)
        )
      });
      run = [];
    };
    scored.forEach((entry, index) => {
      // an hour missing from the series breaks a run: it is two stretches of weather, not one
      const contiguous = run.length === 0 || nextHour(run[run.length - 1].hour.time) === entry.hour.time;
      if (entry.score[cause] && contiguous) run.push(entry);
      else {
        close();
        if (entry.score[cause]) run.push(entry);
      }
      if (index === scored.length - 1) close();
    });
  }
  return windows.sort(
    (a, b) =>
      a.start.localeCompare(b.start) || Number(b.severity === "hold") - Number(a.severity === "hold") || a.cause.localeCompare(b.cause)
  );
}

/* ---- the forecast ------------------------------------------------------------------------ */

type Forecast = { at: number; timezone: string; current: WeatherReading | null; days: WeatherForecastDay[]; windows: WeatherWindow[] };
type Series = Record<string, unknown>;

const forecasts = new Map<string, Forecast>();
const reading = new Map<string, Promise<void>>();

/** Two decimals of a degree is about a kilometre: the same forecast cell, so one read serves neighbours. */
const cellOf = (point: Pick<Point, "latitude" | "longitude">) => `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;

const numberAt = (series: unknown, index: number): number | null => {
  const value = Array.isArray(series) ? series[index] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** One answer's `daily` block to days. A day without both temperatures is not a day of forecast. */
export function readDays(daily: Series | undefined): WeatherForecastDay[] {
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

/** One answer's `hourly` block to hours. An hour without a timestamp is dropped; a missing value reads as none. */
export function readHours(hourly: Series | undefined): WeatherHour[] {
  const time = Array.isArray(hourly?.time) ? (hourly.time as unknown[]) : [];
  return time.flatMap((stamp, index): WeatherHour[] => {
    if (typeof stamp !== "string") return [];
    return [
      {
        time: stamp,
        code: Math.round(numberAt(hourly?.weather_code, index) ?? 0),
        tempF: numberAt(hourly?.temperature_2m, index),
        rainChance: Math.min(100, Math.max(0, Math.round(numberAt(hourly?.precipitation_probability, index) ?? 0))),
        rainInches: numberAt(hourly?.precipitation, index) ?? 0,
        snowInches: numberAt(hourly?.snowfall, index) ?? 0,
        gustMph: numberAt(hourly?.wind_gusts_10m, index) ?? 0,
        visibilityFt: numberAt(hourly?.visibility, index)
      }
    ];
  });
}

/**
 * One answer's `current` block: the temperature and the sky at the site as the forecast was read.
 * Without both there is no reading — a missing code must not read as a clear sky. Its time is the
 * site's wall clock (`timezone=auto`), so the answer's own UTC offset turns it into an instant.
 */
export function readCurrent(current: Series | undefined, utcOffsetSeconds: unknown): WeatherReading | null {
  const temp = current?.temperature_2m;
  const code = current?.weather_code;
  if (typeof current?.time !== "string" || typeof temp !== "number" || !Number.isFinite(temp)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  if (typeof utcOffsetSeconds !== "number" || !Number.isFinite(utcOffsetSeconds)) return null;
  const wall = Date.parse(`${current.time}Z`);
  if (!Number.isFinite(wall)) return null;
  return { at: new Date(wall - utcOffsetSeconds * 1000).toISOString(), tempF: Math.round(temp), code: Math.round(code) };
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
  // imperial units apply to the hours too: snowfall in inches, visibility in feet
  url.searchParams.set("hourly", "weather_code,temperature_2m,precipitation_probability,precipitation,snowfall,wind_gusts_10m,visibility");
  // what it is like there now, for the section's reading: same request, no extra call
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  const payload = await getJson(url);
  const answers = (Array.isArray(payload) ? payload : [payload]) as Array<{
    timezone?: unknown;
    utc_offset_seconds?: unknown;
    current?: Series;
    daily?: Series;
    hourly?: Series;
  }>;
  /* A 200 that is not a forecast — a proxy's page, a stub, a changed API — must not read as clear
     skies at every site (the lesson of the Map page's forecast, 2026-09-22). Without days for
     every place asked about, there is no forecast. */
  const days = answers.map((answer) => readDays(answer?.daily));
  if (answers.length !== cells.length || days.some((list) => list.length === 0)) {
    throw new WeatherUnavailableError("The weather service answered without a forecast");
  }
  cells.forEach((cell, index) => {
    const timezone = answers[index]?.timezone;
    forecasts.set(cell, {
      at: now,
      timezone: typeof timezone === "string" ? timezone : "UTC",
      current: readCurrent(answers[index]?.current, answers[index]?.utc_offset_seconds),
      days: days[index],
      windows: windowsFromHours(readHours(answers[index]?.hourly))
    });
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
 * empty week that reads as no weather. The job conflicts are the route's to add (weatherConflicts.ts).
 */
export async function forecastForSites(
  projects: Project[],
  now = Date.now(),
  custom: ReadonlyMap<string, WeatherLocation> = new Map()
): Promise<Omit<WeatherForecastPayload, "conflicts">> {
  const points = await Promise.all(projects.map((project) => locate(project, now, custom.get(project.id))));
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
      locatedBy: point.locatedBy,
      timezone: forecast.timezone,
      fetchedAt: new Date(forecast.at).toISOString(),
      current: forecast.current,
      days: forecast.days,
      windows: forecast.windows
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
