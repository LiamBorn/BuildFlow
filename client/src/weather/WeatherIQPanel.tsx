/**
 * The Dashboard's WeatherIQ section (2026-09-23): the coming week at every job site, and the
 * scheduled work that weather reaches.
 *
 * Asked for as "a pulled-in forecast widget for job sites — useful, low-cost, don't over-engineer
 * the AI part of it for launch". It took the place of Weather Impact, which read only the alerts a
 * workspace typed in by hand, and it keeps that panel's id ("weather") so every saved board, hidden
 * list and notification that names it still lands here.
 *
 * Three parts, top to bottom: a job site (the one with the soonest trouble, or pick another), its
 * week as day tiles, and the read — which open jobs fall on a day of rain, wind, heat or a freeze
 * (weatherIQ.ts holds the thresholds). The tiles and the rows arrive on the Dashboard's own row
 * cascade (skin §20 / §74) and the figures count up like every figure on the board, so nothing here
 * animates by itself.
 *
 * WHEN THE FORECAST CANNOT BE HAD the section says so and reads the saved weather alerts instead —
 * never an empty week that would look like no weather at all.
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
import type { BootstrapPayload, WeatherForecastDay, WeatherForecastPayload } from "@buildflow/shared";
import { weatherForecast } from "../api";
import { AnimatedFigure } from "../components/ui/animated-figure";
import {
  alertRisks,
  conditionOf,
  dayName,
  daySpoken,
  focusSite,
  jobsAtRisk,
  nameList,
  readForecast,
  scoreDay,
  siteName,
  type ConditionKind,
  type JobAtRisk,
  type WeatherCause
} from "./weatherIQ";

/** The server re-reads a site at most every half hour, so asking more often would buy nothing. */
const REFRESH_MS = 30 * 60_000;
/** Rows the read shows before it says how many more there are. */
const ROWS = 3;

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
const CAUSE_ICON: Record<WeatherCause, LucideIcon> = { rain: CloudRain, wind: Wind, heat: ThermometerSun, cold: ThermometerSnowflake };

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const clock = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

type Load = { state: "loading" } | { state: "ready"; forecast: WeatherForecastPayload } | { state: "unavailable" };

function DayTile({ day, today }: { day: WeatherForecastDay; today: string }) {
  const score = scoreDay(day);
  const condition = conditionOf(day.code);
  const Icon = CONDITION_ICON[condition.kind];
  // the line under the temperatures says why a tile is tinted: the gusts on a windy day, else the rain
  const windy = score.cause === "wind";
  const said = [
    `${capital(daySpoken(day.date, today))}: ${condition.label.toLowerCase()}`,
    `high ${day.highF}°F, low ${day.lowF}°F`,
    `${day.rainChance}% chance of rain`,
    `gusts to ${day.gustMph} mph`
  ].join(", ");
  const verdict = score.risk === "clear" ? "" : ` ${score.risk === "hold" ? "Hold" : "Watch"}: ${score.reason}.`;
  return (
    <li className={`wiq-day is-${score.risk}`} title={`${said}.${verdict}`}>
      <span className="wiq-sr">{`${said}.${verdict}`}</span>
      <span className="wiq-day-name" aria-hidden="true">
        {dayName(day.date, today)}
      </span>
      <Icon className="wiq-day-icon" aria-hidden="true" />
      <strong className="wiq-day-high" aria-hidden="true">
        <AnimatedFigure text={`${day.highF}°`} />
      </strong>
      <span className="wiq-day-low" aria-hidden="true">
        {day.lowF}°
      </span>
      <span className="wiq-day-metric" aria-hidden="true">
        {windy ? <Wind /> : <Droplets />}
        {windy ? `${day.gustMph} mph` : `${day.rainChance}%`}
      </span>
    </li>
  );
}

function RiskRow({ risk, site, today }: { risk: JobAtRisk; site: string; today: string }) {
  const Icon = CAUSE_ICON[risk.cause];
  // The Dashboard's own row and pill (skin §11a/§11d): a hold reads in the High pair, a watch in the
  // Medium one. The row's second line is cut to one line at half width, so it leads with what a
  // person needs — when and why — and the site, which the picker already names, goes last.
  return (
    <div className={`resource-row wiq-risk is-${risk.risk}`} title={`${risk.job.phase} · ${site}`}>
      <Icon size={22} aria-hidden="true" />
      <span>
        <strong>{risk.job.phase}</strong>
        <em>{[capital(daySpoken(risk.date, today)), risk.reason, site].join(" · ")}</em>
      </span>
      <span className={`badge ${risk.risk === "hold" ? "high" : "medium"}`}>{risk.risk === "hold" ? "Hold" : "Watch"}</span>
    </div>
  );
}

export function WeatherIQPanel({ data, today }: { data: BootstrapPayload; today: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
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

  const forecast = load.state === "ready" ? load.forecast : null;
  const risks = useMemo(() => {
    if (forecast) return jobsAtRisk(forecast, data.jobs, today);
    return load.state === "unavailable" ? alertRisks(data.weatherAlerts, data.jobs, today) : [];
  }, [forecast, load.state, data.jobs, data.weatherAlerts, today]);

  const siteId =
    forecast && chosen && forecast.sites.some((site) => site.projectId === chosen)
      ? chosen
      : forecast
        ? focusSite(forecast, risks, data.jobs, today)
        : null;
  const site = forecast?.sites.find((candidate) => candidate.projectId === siteId) ?? null;
  const unplaced = forecast ? forecast.unplaced.map((id) => siteName(data.projects, id)) : [];

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
          The forecast service could not be reached, so this reads your saved weather alerts instead.
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
            <span className="wiq-where">{site.place}</span>
          </div>
          <ol className="wiq-days" aria-label={`The week at ${siteName(data.projects, site.projectId)}`}>
            {site.days.map((day) => (
              <DayTile key={day.date} day={day} today={today} />
            ))}
          </ol>
        </>
      )}

      {(forecast?.sites.length ?? 0) > 0 || load.state === "unavailable" ? (
        risks.length > 0 ? (
          <div className="wiq-read">
            <p className="wiq-headline">
              <strong>
                <AnimatedFigure text={String(risks.length)} />
              </strong>{" "}
              {risks.length === 1 ? "job" : "jobs"} at weather risk this week
            </p>
            <div className="wiq-risks">
              {risks.slice(0, ROWS).map((risk) => (
                <RiskRow key={risk.job.id} risk={risk} site={siteName(data.projects, risk.projectId)} today={today} />
              ))}
            </div>
            {risks.length > ROWS && <p className="wiq-note">And {risks.length - ROWS} more this week.</p>}
          </div>
        ) : (
          <div className="inline-empty-state">
            <CloudSun size={28} aria-hidden="true" />
            <span>
              <strong>{forecast ? "Clear to work this week" : "No weather alerts on scheduled work"}</strong>
              <em>
                {forecast
                  ? "No scheduled job falls on a day of heavy rain, high wind, extreme heat or a freeze."
                  : "Only your saved alerts were checked this time."}
              </em>
            </span>
          </div>
        )
      ) : null}

      {unplaced.length > 0 && (
        <p className="wiq-note">
          No forecast for {nameList(unplaced)}: add a ZIP code to {unplaced.length === 1 ? "its" : "their"} address so it can be found.
        </p>
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
    </div>
  );
}
