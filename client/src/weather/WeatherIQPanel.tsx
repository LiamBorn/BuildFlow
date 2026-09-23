/**
 * The Dashboard's WeatherIQ section (2026-09-23): the coming week at every job site, the job days its
 * weather reaches, and the decisions on them.
 *
 * Asked for first as "a pulled-in forecast widget for job sites — useful, low-cost, don't
 * over-engineer the AI part of it for launch", then to reach every job: what time the weather comes,
 * where, and whether it lands in a job's hours; a suggestion to the person in charge to call the day
 * off; once it is called off, a suggestion to reschedule the job (and whatever of the project moves
 * with it); and a way for the Workspace Owner and Admins to say where a project's forecast is read.
 * It took the place of Weather Impact and keeps that panel's id ("weather"), so every saved board,
 * hidden list and notification that names it still lands here.
 *
 * Top to bottom: a job site (the one with the soonest open decision, or pick another), the weather
 * there now — its temperature and sky, asked for so a person can read the weather at a glance —
 * its week as day tiles (sky, high and low) tinted by the weather that could reach a crew that
 * day, and the job days, each of which opens the program's editing drawer (WeatherConflictDrawer)
 * with the decision in it. The tiles and rows arrive on the Dashboard's own row cascade (skin §20 /
 * §74) and the temperatures count up like every figure on the board, so nothing here animates by
 * itself.
 *
 * WHEN THE FORECAST CANNOT BE HAD the section says so, and shows the job days from its last read (which
 * bootstrap carries) or, failing those, the saved weather alerts — never an empty week that would look
 * like no weather at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Sun,
  ThermometerSnowflake,
  ThermometerSun,
  Wind
} from "lucide-react";
import type {
  BootstrapPayload,
  SiteWeatherForecast,
  WeatherCause,
  WeatherForecastDay,
  WeatherForecastPayload,
  WeatherReading,
  WeatherWindow
} from "@buildflow/shared";
import { weatherForecast } from "../api";
import { AnimatedFigure } from "../components/ui/animated-figure";
import { WeatherConflictDrawer } from "./WeatherConflictDrawer";
import { WeatherLocationDrawer } from "./WeatherLocationDrawer";
import {
  alertRows,
  badgeFor,
  capital,
  clockWords,
  conditionOf,
  conflictRows,
  dayName,
  daySpoken,
  daytimeWindows,
  focusSite,
  nameList,
  readConflicts,
  readForecast,
  readingWhen,
  siteName,
  timeRange,
  type ConditionKind,
  type WeatherRow
} from "./weatherIQ";

/** The server re-reads a site at most every half hour, so asking more often would buy nothing. */
const REFRESH_MS = 30 * 60_000;
/** Rows the section lists before it says how many more there are. */
const ROWS = 4;

const CONDITION_ICON: Record<ConditionKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning
};
const CAUSE_ICON: Record<WeatherCause, LucideIcon> = {
  lightning: CloudLightning,
  rain: CloudRain,
  snow: CloudSnow,
  wind: Wind,
  heat: ThermometerSun,
  cold: ThermometerSnowflake,
  fog: CloudFog
};

const clock = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

type Load = { state: "loading" } | { state: "ready"; forecast: WeatherForecastPayload } | { state: "unavailable" };

function DayTile({ day, today, windows }: { day: WeatherForecastDay; today: string; windows: WeatherWindow[] }) {
  const condition = conditionOf(day.code);
  const Icon = CONDITION_ICON[condition.kind];
  // the worst weather that could reach a crew that day tints the tile, and its line says when it starts
  const worst = windows[0];
  const Cause = worst ? CAUSE_ICON[worst.cause] : Droplets;
  const said =
    `${capital(daySpoken(day.date, today))}: ${condition.label.toLowerCase()}, high ${day.highF}°F, low ${day.lowF}°F, ` +
    `${day.rainChance}% chance of rain, gusts to ${day.gustMph} mph.` +
    (windows.length
      ? ` ${windows.map((window) => `${window.severity === "hold" ? "Hold" : "Watch"}: ${window.reason}, ${timeRange(window.start, window.end)}`).join("; ")}.`
      : "");
  return (
    <li className={`wiq-day is-${worst ? worst.severity : "clear"}`} title={said}>
      <span className="wiq-sr">{said}</span>
      <span className="wiq-day-name" aria-hidden="true">
        {dayName(day.date, today)}
      </span>
      <Icon className="wiq-day-icon" aria-hidden="true" />
      <span className="wiq-day-sky" aria-hidden="true">
        {condition.short}
      </span>
      <strong className="wiq-day-high" aria-hidden="true">
        <AnimatedFigure text={`${day.highF}°`} />
      </strong>
      <span className="wiq-day-low" aria-hidden="true">
        {day.lowF}°
      </span>
      <span className="wiq-day-metric" aria-hidden="true">
        <Cause />
        {worst ? clockWords(worst.start) : `${day.rainChance}%`}
      </span>
    </li>
  );
}

/**
 * The weather at the site as the forecast was read — its temperature and sky, the way a weather
 * app leads — with when it was taken and where, since the provider reads it every quarter hour and
 * the server re-reads a site at most every half hour.
 */
function SiteReading({ reading, today, place }: { reading: WeatherReading; today: string; place: string }) {
  const condition = conditionOf(reading.code);
  const Icon = CONDITION_ICON[condition.kind];
  const when = readingWhen(reading.at, today);
  return (
    <div className="wiq-now">
      <span className="wiq-sr">
        {`Now${place ? ` at ${place}` : ""}: ${reading.tempF}°F, ${condition.label.toLowerCase()}${when ? `, as of ${when}` : ""}.`}
      </span>
      <Icon className="wiq-now-icon" aria-hidden="true" />
      <strong className="wiq-now-temp" aria-hidden="true">
        <AnimatedFigure text={`${reading.tempF}°`} />
      </strong>
      <span className="wiq-now-read" aria-hidden="true">
        <span className="wiq-now-sky">{condition.label}</span>
        <span className="wiq-now-when">{[when && `As of ${when}`, place].filter(Boolean).join(" · ")}</span>
      </span>
    </div>
  );
}

function RowBody({ row, site }: { row: WeatherRow; site: string }) {
  const Icon = CAUSE_ICON[row.cause];
  const badge = badgeFor(row);
  // The Dashboard's own row and pill (skin §11a/§11d). The second line is cut to one line at half
  // width, so it leads with when and why; the site, which the picker already names, goes last.
  return (
    <>
      <Icon size={22} aria-hidden="true" />
      <span>
        <strong>{row.job.phase}</strong>
        <em>{[row.when, capital(row.reason), site].join(" · ")}</em>
      </span>
      <span className={`badge${badge.tone ? ` ${badge.tone}` : ""}`}>{badge.text}</span>
    </>
  );
}

export function WeatherIQPanel({ data, today, reload }: { data: BootstrapPayload; today: string; reload?: () => Promise<void> }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    let forecast: WeatherForecastPayload | null = null;
    try {
      forecast = readForecast(await weatherForecast());
    } catch {
      forecast = null;
    }
    if (!alive.current) return;
    // a refresh that fails keeps the week already on screen, whose "updated" time says how old it is
    setLoad((current) => (forecast ? { state: "ready", forecast } : current.state === "ready" ? current : { state: "unavailable" }));
  }, []);

  useEffect(() => {
    void read();
    const refresh = window.setInterval(() => void read(), REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [read]);

  /** After a decision: the Dashboard's data (bookings, delays, the reschedule) and the forecast's job days. */
  const changed = useCallback(async () => {
    await Promise.all([reload?.(), read()]);
  }, [reload, read]);

  const forecast = load.state === "ready" ? load.forecast : null;
  const level = data.activeUser?.permission;
  const canAct = level === "owner" || level === "admin";
  // the last read, which bootstrap carries: what the section shows while the forecast cannot be had
  const stored = useMemo(() => readConflicts(data.weatherConflicts), [data.weatherConflicts]);
  const conflicts = forecast ? forecast.conflicts : stored;
  const conflictRowsNow = useMemo(
    () => (load.state === "loading" ? [] : conflictRows(conflicts, data.jobs, data.variances, today)),
    [load.state, conflicts, data.jobs, data.variances, today]
  );
  const readingAlerts = load.state === "unavailable" && conflictRowsNow.length === 0;
  const rows = useMemo(
    () => (readingAlerts ? alertRows(data.weatherAlerts, data.jobs, today) : conflictRowsNow),
    [readingAlerts, conflictRowsNow, data.weatherAlerts, data.jobs, today]
  );

  const siteId =
    forecast && chosen && forecast.sites.some((site) => site.projectId === chosen)
      ? chosen
      : forecast
        ? focusSite(forecast, rows, data.jobs, today)
        : null;
  const site = forecast?.sites.find((candidate) => candidate.projectId === siteId) ?? null;
  const siteOf = (projectId: string): SiteWeatherForecast | null =>
    forecast?.sites.find((candidate) => candidate.projectId === projectId) ?? null;
  const unplaced = forecast ? forecast.unplaced : [];
  const openConflict = openId ? (conflicts.find((conflict) => conflict.id === openId) ?? null) : null;
  const locatingProject = locating ? (data.projects.find((project) => project.id === locating) ?? null) : null;
  const waiting = rows.filter((row) => row.state === "open").length;

  if (load.state === "loading") {
    return (
      <div className="wiq" aria-busy="true">
        <p className="wiq-note" role="status">
          Reading the forecast for your job sites…
        </p>
      </div>
    );
  }

  return (
    <div className="wiq">
      {load.state === "unavailable" && (
        <p className="wiq-note is-warn" role="status">
          {readingAlerts
            ? "The forecast service could not be reached, so this reads your saved weather alerts instead."
            : "The forecast service could not be reached, so these are the job days from its last read."}
        </p>
      )}

      {forecast && forecast.sites.length === 0 && unplaced.length === 0 && (
        <div className="inline-empty-state">
          <MapPin size={28} aria-hidden="true" />
          <span>
            <strong>No active job sites</strong>
            <em>A project in progress gets its forecast here.</em>
          </span>
        </div>
      )}

      {forecast && site && (
        <>
          <div className="wiq-top">
            {forecast.sites.length > 1 ? (
              <label className="wiq-site">
                <select aria-label="Job site" value={site.projectId} onChange={(event) => setChosen(event.target.value)}>
                  {forecast.sites.map((option) => (
                    <option key={option.projectId} value={option.projectId}>
                      {siteName(data.projects, option.projectId)}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            ) : (
              <span className="wiq-site is-single">{siteName(data.projects, site.projectId)}</span>
            )}
            <span className="wiq-place">
              {/* with a reading, the place goes under it, where there is room to read it */}
              {!site.current && <span className="wiq-where">{site.place}</span>}
              {canAct && (
                <button
                  type="button"
                  className="bfmt-link wiq-change"
                  aria-label={`Change the forecast location for ${siteName(data.projects, site.projectId)}`}
                  onClick={() => setLocating(site.projectId)}
                >
                  <MapPin size={13} aria-hidden="true" /> Change location
                </button>
              )}
            </span>
          </div>
          {site.current && <SiteReading reading={site.current} today={today} place={site.place} />}
          <ol className="wiq-days" aria-label={`The week at ${siteName(data.projects, site.projectId)}`}>
            {site.days.map((day) => (
              <DayTile key={day.date} day={day} today={today} windows={daytimeWindows(site, day.date)} />
            ))}
          </ol>
        </>
      )}

      {(forecast?.sites.length ?? 0) > 0 || load.state === "unavailable" ? (
        rows.length > 0 ? (
          <div className="wiq-read">
            <p className="wiq-headline">
              {waiting > 0 ? (
                <>
                  <strong>
                    <AnimatedFigure text={String(waiting)} />
                  </strong>{" "}
                  {readingAlerts ? (waiting === 1 ? "job" : "jobs") : waiting === 1 ? "job day" : "job days"} at weather risk this week
                </>
              ) : (
                "Nothing waiting on a decision this week"
              )}
            </p>
            <div className="wiq-risks">
              {rows.slice(0, ROWS).map((row) =>
                row.conflict ? (
                  <button
                    key={row.key}
                    type="button"
                    className={`resource-row wiq-risk is-${row.state}`}
                    onClick={() => setOpenId(row.conflict!.id)}
                  >
                    <RowBody row={row} site={siteName(data.projects, row.projectId)} />
                  </button>
                ) : (
                  <div key={row.key} className={`resource-row wiq-risk is-${row.state}`}>
                    <RowBody row={row} site={siteName(data.projects, row.projectId)} />
                  </div>
                )
              )}
            </div>
            {rows.length > ROWS && <p className="wiq-note">And {rows.length - ROWS} more this week.</p>}
          </div>
        ) : (
          <div className="inline-empty-state">
            <CloudSun size={28} aria-hidden="true" />
            <span>
              <strong>{readingAlerts ? "No weather alerts on scheduled work" : "Clear to work this week"}</strong>
              <em>
                {readingAlerts
                  ? "Only your saved alerts were checked this time."
                  : "No scheduled job's working hours meet lightning, rain, wind, snow, heat, a freeze or fog."}
              </em>
            </span>
          </div>
        )
      ) : null}

      {unplaced.length > 0 && (
        <div className="wiq-unplaced">
          <p className="wiq-note">
            No forecast for {nameList(unplaced.map((id) => siteName(data.projects, id)))}:{" "}
            {canAct ? "set where the site is, or add a ZIP code to its address." : "add a ZIP code to its address so it can be found."}
          </p>
          {canAct &&
            unplaced.slice(0, 3).map((id) => (
              <button key={id} type="button" className="bfmt-link wiq-change" onClick={() => setLocating(id)}>
                <MapPin size={13} aria-hidden="true" /> Set {siteName(data.projects, id)}
              </button>
            ))}
        </div>
      )}

      {site && (
        <p className="wiq-foot">
          Forecast by{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          {clock(site.fetchedAt) && ` · updated ${clock(site.fetchedAt)}`}
        </p>
      )}

      {openConflict && (
        <WeatherConflictDrawer
          conflict={openConflict}
          data={data}
          site={siteOf(openConflict.projectId)}
          today={today}
          canAct={canAct}
          onClose={() => setOpenId(null)}
          onChanged={changed}
        />
      )}
      {locatingProject && (
        <WeatherLocationDrawer
          project={locatingProject}
          site={siteOf(locatingProject.id)}
          onClose={() => setLocating(null)}
          onSaved={read}
        />
      )}
    </div>
  );
}
