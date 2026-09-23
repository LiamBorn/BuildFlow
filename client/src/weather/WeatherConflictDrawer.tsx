/**
 * One job day the weather reaches, and the decisions on it (WeatherIQ, 2026-09-23), in the
 * program's editing drawer — `.pdx`, portalled to the body like every other one, so it slides in
 * with the same entrance and leaves with the same exit.
 *
 * The two suggestions the user asked for, in order. While the day is open: call it off, or keep it
 * on — addressed to the person in charge, the project's manager. Once it is called off: the job
 * moved to the next day it can work, priced through the schedule so the reader sees which later
 * jobs move with it and whether the project's finish does; Reschedule accepts it and Not now keeps
 * the dates. The reschedule is the variance the server raised, resolved on the variance routes like
 * any other proposed change to the plan. "The next day it can work" is only as good as the forecast
 * behind it: when there was none to read, or the day is past the last one it covers, the working
 * calendar alone chose it, and the card says so (`weatherCheck`).
 *
 * Calling a day off and deciding a reschedule are schedule writes: the Workspace Owner and Admins
 * hold them. Anyone else sees the same suggestion with a line saying who can act on it.
 */
import { createPortal } from "react-dom";
import { CalendarCheck, CalendarX2, X } from "lucide-react";
import type { BootstrapPayload, SiteWeatherForecast, WeatherConflict } from "@buildflow/shared";
import { useModalDialog } from "../schedule/hooks";
import { useWeatherDecision } from "./useWeatherDecision";
import { CAUSE_LABEL, capital, dateWords, dayName, daySpoken, spanWords, timeRange } from "./weatherIQ";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function WeatherConflictDrawer({
  conflict,
  data,
  site,
  today,
  canAct,
  onClose,
  onChanged
}: {
  conflict: WeatherConflict;
  data: BootstrapPayload;
  site: SiteWeatherForecast | null;
  today: string;
  canAct: boolean;
  onClose: () => void;
  /** Read the Dashboard's data and the forecast again, so the section and this drawer show what changed. */
  onChanged: () => Promise<void>;
}) {
  const panelRef = useModalDialog<HTMLElement>(onClose);
  // the decisions and what they have come to: the same rules the schedule's job panel offers
  const { busy, error, state, variance, proposal, unchecked, inCharge, who, nobody, callOff, keepOn, reschedule, notNow } =
    useWeatherDecision(conflict, data, onChanged);

  const job = data.jobs.find((item) => item.id === conflict.jobId);
  const project = data.projects.find((item) => item.id === conflict.projectId);
  const hold = conflict.severity === "hold";
  const day = dayName(conflict.date, today);
  const hours = timeRange(conflict.start, conflict.end);
  const decided = conflict.decidedAt ? dateWords(conflict.decidedAt.slice(0, 10)) : "";

  if (!job || !project) return null;

  const phaseOf = (jobId: string, fallback: string) => data.jobs.find((item) => item.id === jobId)?.phase ?? fallback;

  return createPortal(
    <div className="project-dialog-backdrop pdx" role="presentation">
      <section
        className="project-dialog pdx-dialog wiq-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiq-drawer-title"
        aria-describedby="wiq-drawer-description"
        ref={panelRef}
      >
        <div className="pdx-glow" aria-hidden="true">
          <span className="pdx-aurora pdx-aurora-1" />
          <span className="pdx-aurora pdx-aurora-2" />
        </div>
        <header className="project-dialog-header pdx-head">
          <div>
            <span className="pdx-eyebrow">
              <span className="pdx-dot" />
              WeatherIQ
            </span>
            <h2 id="wiq-drawer-title" className="pdx-title">
              {CAUSE_LABEL[conflict.cause]} <em>{`${day} ${hours}`}</em>
            </h2>
            <p className="pdx-sub" id="wiq-drawer-description">
              {job.phase} · {project.name}
            </p>
          </div>
          <button className="pdx-close" aria-label="Close weather conflict" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="pdx-body wiq-drawer-body">
          <dl className="wiq-facts">
            <div>
              <dt>When</dt>
              <dd>
                {capital(daySpoken(conflict.date, today))}, {dateWords(conflict.date)} · {hours}
              </dd>
            </div>
            <div>
              <dt>Weather</dt>
              <dd>
                {capital(conflict.reason)} <span className={`wiq-pill is-${conflict.severity}`}>{hold ? "Hold" : "Watch"}</span>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {project.name}
                {site?.place ? ` · ${site.place}` : ""}
              </dd>
            </div>
            <div>
              <dt>Job hours</dt>
              <dd>
                {job.startTime}–{job.endTime}
              </dd>
            </div>
            <div>
              <dt>In charge</dt>
              <dd>
                {inCharge ? (inCharge.id === data.activeUser?.id ? `You (${inCharge.name})` : inCharge.name) : "No project manager set"}
              </dd>
            </div>
          </dl>

          {state === "open" && (
            <div className="wiq-decision">
              <p className="pdx-note">
                {hold
                  ? `This lands inside the job's working hours. Calling off ${daySpoken(conflict.date, today)} keeps the crew off the site, and WeatherIQ then suggests new dates.`
                  : "This may slow the work. Keep an eye on it, or call the day off and WeatherIQ suggests new dates."}
              </p>
              {canAct ? (
                <div className="pdx-actions">
                  <button className="pdx-cancel" type="button" disabled={Boolean(busy)} onClick={keepOn}>
                    {busy === "keep" ? "Saving" : "Keep it on"}
                  </button>
                  <button className="pdx-danger" type="button" disabled={Boolean(busy)} onClick={callOff}>
                    <CalendarX2 size={17} /> {busy === "cancel" ? "Calling it off" : `Call off ${day === "Today" ? "today" : day}`}
                  </button>
                </div>
              ) : (
                <p className="pdx-note wiq-who">{nobody}</p>
              )}
            </div>
          )}

          {state === "reschedule" && proposal && (
            <div className="wiq-decision">
              <p className="pdx-note">
                Called off {decided && `on ${decided} `}by {who}. That day&rsquo;s crew bookings were released and the delay was logged.
              </p>
              <div className="wiq-proposal">
                <span className="wiq-proposal-eyebrow">Suggested reschedule</span>
                <div className="wiq-proposal-dates">
                  <span>Now</span>
                  <strong>{spanWords(proposal.currentStart, proposal.currentEnd)}</strong>
                </div>
                <div className="wiq-proposal-dates is-new">
                  <span>Move to</span>
                  <strong>{spanWords(proposal.proposedStart, proposal.proposedEnd)}</strong>
                </div>
                {unchecked && <p className="wiq-proposal-line is-warn">{unchecked}</p>}
                {proposal.ripple.length > 0 && (
                  <>
                    <p className="wiq-proposal-line">Also moves {plural(proposal.ripple.length, "later job")}:</p>
                    <ul className="wiq-ripple">
                      {proposal.ripple.slice(0, 4).map((item) => (
                        <li key={item.jobId}>
                          <span>{phaseOf(item.jobId, item.jobName)}</span>
                          <em>+{plural(item.shiftDays, "working day")}</em>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="wiq-proposal-line">
                  {proposal.projectSlipDays > 0
                    ? `The project's finish moves ${plural(proposal.projectSlipDays, "working day")}${
                        project.targetCompletion ? `. Its target completion is ${dateWords(project.targetCompletion)}` : ""
                      }.`
                    : "The project's finish does not move: the job's float absorbs it."}
                </p>
              </div>
              {canAct ? (
                <div className="pdx-actions">
                  <button className="pdx-cancel" type="button" disabled={Boolean(busy)} onClick={notNow}>
                    {busy === "reject" ? "Saving" : "Not now"}
                  </button>
                  <button className="pdx-save" type="button" disabled={Boolean(busy)} onClick={reschedule}>
                    <CalendarCheck size={17} /> {busy === "accept" ? "Rescheduling" : "Reschedule"}
                  </button>
                </div>
              ) : (
                <p className="pdx-note wiq-who">{nobody}</p>
              )}
            </div>
          )}

          {state === "rescheduled" && proposal && (
            <p className="pdx-note">
              Rescheduled to {spanWords(proposal.proposedStart, proposal.proposedEnd)}
              {proposal.ripple.length > 0 ? `, with ${plural(proposal.ripple.length, "later job")} moved to follow` : ""}.
            </p>
          )}

          {(state === "called-off" || (state === "reschedule" && !proposal)) && (
            <p className="pdx-note">
              Called off {decided && `on ${decided} `}by {who}.{" "}
              {variance?.status === "rejected" ? "The job kept its dates." : "Reschedule it from the Schedule when you are ready."}
            </p>
          )}

          {state === "kept" && (
            <p className="pdx-note">
              Kept on {decided && `on ${decided} `}by {who}. WeatherIQ will not ask about this day again.
            </p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
