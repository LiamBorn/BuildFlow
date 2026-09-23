/**
 * WeatherIQ in the schedule's side panels (2026-09-23). Asked for as "add the WeatherIQ to the
 * sidebar, and make it so that a user is able to cancel a job depending on if the WeatherIQ AI
 * gives the suggestion".
 *
 * JobWeather sits in the job panel every schedule page opens (Month, Kanban, Gantt). It shows the
 * job's days as the forecast has them, tinted by the weather in the job's OWN hours, and each day
 * WeatherIQ flagged, with the decisions the Dashboard's WeatherIQ drawer offers
 * (useWeatherDecision): call the day off or keep it on, then decide the suggested reschedule.
 * Calling a day off is only there when WeatherIQ has suggested it. There is no weather cancel
 * without a flagged day behind it, which is the "depending on" in the ask.
 *
 * PhaseWeather sits in a marker's panel (a phase finish, a project's completion). It shows the
 * forecast for the days the marker covers, tinted by the daytime weather. A marker is a date, not
 * work, so there is nothing to call off there, and the card says where to go to do it.
 *
 * Both are on the panel's own parts: the Links card's frame and head, and its small pills. They
 * say out loud when the forecast cannot be had rather than showing days without weather.
 */
import { useCallback, type ReactNode } from "react";
import { CalendarCheck, CalendarX2 } from "lucide-react";
import {
  jobHours,
  type BootstrapPayload,
  type Job,
  type WeatherConflict,
  type WeatherForecastDay,
  type WeatherWindow
} from "@buildflow/shared";
import { CONDITION_ICON } from "./icons";
import { useForecast, type ForecastLoad } from "./useForecast";
import { useWeatherDecision } from "./useWeatherDecision";
import {
  CAUSE_LABEL,
  capital,
  clockWords,
  conditionOf,
  dateWords,
  dayName,
  daySpoken,
  daytimeWindows,
  readConflicts,
  spanWords,
  timeRange,
  windowsDuring
} from "./weatherIQ";
import "./weather-iq.css";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const worstFirst = (a: WeatherWindow, b: WeatherWindow) =>
  Number(b.severity === "hold") - Number(a.severity === "hold") || a.start.localeCompare(b.start);

/** One day of the forecast, the Dashboard's tile at the panel's size. */
function DayChip({ day, today, windows }: { day: WeatherForecastDay; today: string; windows: WeatherWindow[] }) {
  const condition = conditionOf(day.code);
  const Icon = CONDITION_ICON[condition.kind];
  const worst = windows[0];
  const said =
    `${capital(daySpoken(day.date, today))}: ${condition.label.toLowerCase()}, high ${day.highF}°F, low ${day.lowF}°F` +
    (worst ? `. ${worst.severity === "hold" ? "Hold" : "Watch"}: ${worst.reason}, ${timeRange(worst.start, worst.end)}` : "") +
    ".";
  return (
    <div role="listitem" className={`gantt-drawer-weather-day is-${worst ? worst.severity : "clear"}`} title={said}>
      <span className="wiq-sr">{said}</span>
      <span className="gantt-drawer-weather-name" aria-hidden="true">
        {dayName(day.date, today)}
      </span>
      <Icon className="gantt-drawer-weather-icon" aria-hidden="true" />
      <strong aria-hidden="true">{day.highF}°</strong>
      <span className="gantt-drawer-weather-low" aria-hidden="true">
        {day.lowF}°
      </span>
      <span className="gantt-drawer-weather-sky" aria-hidden="true">
        {condition.short}
      </span>
    </div>
  );
}

/** The card's frame: the Links card's, with WeatherIQ's name and the place the forecast is for. */
function WeatherCard({ place, children }: { place?: string; children: ReactNode }) {
  return (
    <section className="gantt-drawer-links gantt-drawer-weather" aria-label="WeatherIQ">
      <div className="gantt-drawer-links-head">
        <h3>WeatherIQ</h3>
        {place && <span className="gantt-drawer-weather-place">{place}</span>}
      </div>
      {children}
    </section>
  );
}

/** What the card says when it has no days to show: why, in one line. */
function quietLine(
  load: ForecastLoad,
  input: {
    unplaced: boolean;
    found: boolean;
    to: string;
    today: string;
    lastDay?: string;
    /** "this job's days" — what could not be checked. */
    what: string;
    /** "This job's days have passed." */
    passed: string;
    /** "this job starts Thu, Oct 1" — what the forecast does not reach yet. */
    starts: string;
  }
): string {
  if (load.state === "loading") return "Reading the forecast…";
  if (load.state === "unavailable") return `The forecast service could not be reached, so ${input.what} could not be checked.`;
  if (input.unplaced) return "No forecast for this site: its address could not be placed. Set where it is from WeatherIQ on the Dashboard.";
  if (!input.found) return "No forecast for this site.";
  if (input.to < input.today) return input.passed;
  return `The forecast reaches ${input.lastDay ? dateWords(input.lastDay) : "a week ahead"}; ${input.starts}.`;
}

/** One day WeatherIQ flagged in this job's hours, and what can be done about it. */
function DayCall({
  conflict,
  data,
  today,
  canAct,
  onChanged
}: {
  conflict: WeatherConflict;
  data: BootstrapPayload;
  today: string;
  canAct: boolean;
  onChanged: () => Promise<void>;
}) {
  const decision = useWeatherDecision(conflict, data, onChanged);
  const { busy, state, proposal } = decision;
  const hold = conflict.severity === "hold";
  const day = dayName(conflict.date, today);
  const spoken = daySpoken(conflict.date, today);
  const decided = conflict.decidedAt ? dateWords(conflict.decidedAt.slice(0, 10)) : "";
  const byWhom = `${decided ? `on ${decided} ` : ""}by ${decision.who}`;

  return (
    <div className={`gantt-drawer-weather-call is-${state}`}>
      <p className="gantt-drawer-weather-what">
        <strong>
          {CAUSE_LABEL[conflict.cause]} · {day} {timeRange(conflict.start, conflict.end)}
        </strong>
        <span className={`gantt-drawer-weather-pill is-${conflict.severity}`}>{hold ? "Hold" : "Watch"}</span>
      </p>

      {state === "open" && (
        <>
          <p className="gantt-drawer-weather-line">
            {capital(conflict.reason)} forecast inside the job&rsquo;s hours.{" "}
            {hold
              ? `WeatherIQ suggests calling ${spoken} off, and then suggests new dates.`
              : `It may slow the work: keep an eye on it, or call ${spoken} off and WeatherIQ suggests new dates.`}
          </p>
          {canAct ? (
            <div className="gantt-drawer-weather-actions">
              <button className="hs-btn" type="button" disabled={Boolean(busy)} onClick={decision.keepOn}>
                {busy === "keep" ? "Saving…" : "Keep it on"}
              </button>
              <button className="hs-btn is-danger" type="button" disabled={Boolean(busy)} onClick={decision.callOff}>
                <CalendarX2 size={14} aria-hidden="true" /> {busy === "cancel" ? "Calling it off…" : `Call off ${day === "Today" ? "today" : day}`}
              </button>
            </div>
          ) : (
            <p className="gantt-drawer-weather-line">{decision.nobody}</p>
          )}
        </>
      )}

      {state === "reschedule" && proposal && (
        <>
          <p className="gantt-drawer-weather-line">
            Called off {byWhom}. WeatherIQ suggests moving the job to <b>{spanWords(proposal.proposedStart, proposal.proposedEnd)}</b>
            {proposal.ripple.length > 0 ? `, with ${plural(proposal.ripple.length, "later job")} following` : ""};{" "}
            {proposal.projectSlipDays > 0
              ? `the project's finish moves ${plural(proposal.projectSlipDays, "working day")}.`
              : "the project's finish does not move."}
          </p>
          {decision.unchecked && <p className="gantt-drawer-weather-line is-warn">{decision.unchecked}</p>}
          {canAct ? (
            <div className="gantt-drawer-weather-actions">
              <button className="hs-btn" type="button" disabled={Boolean(busy)} onClick={decision.notNow}>
                {busy === "reject" ? "Saving…" : "Not now"}
              </button>
              <button className="hs-btn is-go" type="button" disabled={Boolean(busy)} onClick={decision.reschedule}>
                <CalendarCheck size={14} aria-hidden="true" /> {busy === "accept" ? "Rescheduling…" : "Reschedule"}
              </button>
            </div>
          ) : (
            <p className="gantt-drawer-weather-line">{decision.nobody}</p>
          )}
        </>
      )}

      {state === "rescheduled" && proposal && (
        <p className="gantt-drawer-weather-line">Rescheduled to {spanWords(proposal.proposedStart, proposal.proposedEnd)}.</p>
      )}

      {(state === "called-off" || (state === "reschedule" && !proposal)) && (
        <p className="gantt-drawer-weather-line">
          Called off {byWhom}.{" "}
          {decision.variance?.status === "rejected" ? "The job kept its dates." : "Reschedule it from the Schedule when you are ready."}
        </p>
      )}

      {state === "kept" && <p className="gantt-drawer-weather-line">Kept on {byWhom}. WeatherIQ will not ask about this day again.</p>}

      {decision.error && (
        <p className="gantt-drawer-weather-line is-bad" role="alert">
          {decision.error}
        </p>
      )}
    </div>
  );
}

/** WeatherIQ in the job panel: the job's days, and every day it flagged with the decision on it. */
export function JobWeather({
  job,
  data,
  today,
  reload
}: {
  job: Job;
  data: BootstrapPayload;
  today: string;
  /** The page's own reload: a call-off releases that day's bookings, which the page shows. */
  reload: () => Promise<void>;
}) {
  const { load, refresh } = useForecast();
  const forecast = load.state === "ready" ? load.forecast : null;
  const site = forecast?.sites.find((item) => item.projectId === job.projectId) ?? null;
  const hours = jobHours(job);
  const days = site ? site.days.filter((day) => day.date >= job.startDate && day.date <= job.endDate) : [];
  // the days WeatherIQ flagged for this job: the forecast's own list, or the last read bootstrap carries
  const conflicts = (forecast ? forecast.conflicts : readConflicts(data.weatherConflicts))
    .filter((item) => item.jobId === job.id && item.status !== "cleared")
    .sort((a, b) => a.date.localeCompare(b.date));
  const level = data.activeUser?.permission;
  const canAct = level === "owner" || level === "admin";
  const changed = useCallback(async () => {
    await Promise.all([reload(), refresh()]);
  }, [reload, refresh]);

  const clock = `${clockWords(`T${hours.start}`)}–${clockWords(`T${hours.end}`)}`;
  const oneDay = job.startDate === job.endDate;
  const quiet =
    days.length > 0
      ? `Clear to work: no lightning, rain, wind, snow, heat, freeze or fog in the job's hours (${clock}).`
      : quietLine(load, {
          unplaced: forecast?.unplaced.includes(job.projectId) ?? false,
          found: Boolean(site),
          to: job.endDate,
          today,
          lastDay: site?.days[site.days.length - 1]?.date,
          what: oneDay ? "this job's day" : "this job's days",
          passed: oneDay ? "This job's day has passed." : "This job's days have passed.",
          starts: `this job starts ${dateWords(job.startDate)}`
        });

  return (
    <WeatherCard place={site?.place}>
      {days.length > 0 && site && (
        <div className="gantt-drawer-weather-days" role="list" aria-label={`The weather on ${job.name}'s days`}>
          {days.map((day) => (
            <DayChip
              key={day.date}
              day={day}
              today={today}
              windows={windowsDuring(site.windows, `${day.date}T${hours.start}`, `${day.date}T${hours.end}`)}
            />
          ))}
        </div>
      )}
      {conflicts.map((conflict) => (
        <DayCall key={conflict.id} conflict={conflict} data={data} today={today} canAct={canAct} onChanged={changed} />
      ))}
      {conflicts.length === 0 && <p className="gantt-drawer-weather-line">{quiet}</p>}
      {conflicts.length > 0 && load.state === "unavailable" && (
        <p className="gantt-drawer-weather-line is-warn">
          The forecast service could not be reached, so these are the days from its last read.
        </p>
      )}
    </WeatherCard>
  );
}

/** WeatherIQ in a marker's panel: the forecast for the days it covers. */
export function PhaseWeather({ projectId, from, to, today }: { projectId: string; from: string; to: string; today: string }) {
  const { load } = useForecast();
  const forecast = load.state === "ready" ? load.forecast : null;
  const site = forecast?.sites.find((item) => item.projectId === projectId) ?? null;
  const days = site ? site.days.filter((day) => day.date >= from && day.date <= to) : [];
  const worst = site ? days.flatMap((day) => daytimeWindows(site, day.date)).sort(worstFirst)[0] : undefined;
  const single = from === to;

  return (
    <WeatherCard place={site?.place}>
      {days.length > 0 && site && (
        <div className="gantt-drawer-weather-days" role="list" aria-label={single ? "The weather that day" : "The weather on these days"}>
          {days.map((day) => (
            <DayChip key={day.date} day={day} today={today} windows={daytimeWindows(site, day.date)} />
          ))}
        </div>
      )}
      <p className="gantt-drawer-weather-line">
        {days.length === 0
          ? quietLine(load, {
              unplaced: forecast?.unplaced.includes(projectId) ?? false,
              found: Boolean(site),
              to,
              today,
              lastDay: site?.days[site.days.length - 1]?.date,
              what: single ? "that day" : "these days",
              passed: single ? "That day has passed." : "These days have passed.",
              starts: single ? `the date is ${dateWords(from)}` : `this phase starts ${dateWords(from)}`
            })
          : worst
            ? `${worst.severity === "hold" ? "Hold" : "Watch"}: ${worst.reason}, ${dayName(worst.start.slice(0, 10), today)} ${timeRange(worst.start, worst.end)}. Open a job on ${single ? "that day" : "these days"} to call it off.`
            : `Nothing WeatherIQ watches for in the daytime ${single ? "that day" : "on these days"}.`}
      </p>
    </WeatherCard>
  );
}
