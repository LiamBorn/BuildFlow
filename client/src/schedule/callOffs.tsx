/**
 * Called-off job days on the Schedule pages (2026-09-23, asked for as "when a job is cancelled within
 * any of the pages within the Schedule category make it a little more noticeable").
 *
 * A job is cancelled a day at a time, through WeatherIQ: the person in charge calls off a day the
 * weather lands in (the Dashboard's WeatherIQ drawer, or the WeatherIQ card in a job's panel). The
 * server releases that day's crews and raises a reschedule, and keeps the conflict as "cancelled".
 * Until now only the job panel's weather card said so — on the Month calendar, the Kanban, the Gantt
 * and the landing a called-off day looked like any working day, and a one-day job that lost its crew
 * to the call-off sat in "Unassigned Jobs" asking to be booked. This reads the call-offs off the
 * page's data once; every page marks them the same way, in the program's bad tone, in words.
 *
 * A CALL-OFF COUNTS WHILE THE JOB STILL COVERS ITS DAY. An accepted reschedule moves the job off the
 * day, and the mark goes with it, so "rescheduled" needs no case of its own.
 */
import { createContext, useContext } from "react";
import { CalendarX2 } from "lucide-react";
import type { BootstrapPayload, Job, WeatherCause } from "@buildflow/shared";
import { CAUSE_LABEL, dateWords, dayName, readConflicts, rowState } from "../weather/weatherIQ";

export type CallOff = {
  jobId: string;
  /** The working day that was called off, site-local YYYY-MM-DD. */
  date: string;
  cause: WeatherCause;
  /** The reschedule it raised is still waiting on an accept or a reject. */
  reschedulePending: boolean;
};

export type CallOffs = {
  /** A job's called-off days, soonest first. */
  byJob: ReadonlyMap<string, CallOff[]>;
  /** `${jobId}|${date}` → the call-off on that day. */
  byJobDay: ReadonlyMap<string, CallOff>;
  /** The page's today, for "Called off today" and "Called off Thu". */
  today: string;
};

const NONE: CallOff[] = [];
export const NO_CALL_OFFS: CallOffs = { byJob: new Map(), byJobDay: new Map(), today: "" };

export function deriveCallOffs(data: Pick<BootstrapPayload, "jobs" | "variances" | "weatherConflicts">, today: string): CallOffs {
  const jobs = new Map(data.jobs.map((job) => [job.id, job]));
  const byJob = new Map<string, CallOff[]>();
  const byJobDay = new Map<string, CallOff>();
  for (const conflict of readConflicts(data.weatherConflicts)) {
    if (conflict.status !== "cancelled") continue;
    const job = jobs.get(conflict.jobId);
    // gone, or moved off the day by an accepted reschedule
    if (!job || conflict.date < job.startDate || conflict.date > job.endDate) continue;
    const callOff: CallOff = {
      jobId: job.id,
      date: conflict.date,
      cause: conflict.cause,
      reschedulePending: rowState(conflict, data.variances ?? []) === "reschedule"
    };
    byJobDay.set(`${job.id}|${conflict.date}`, callOff);
    byJob.set(
      job.id,
      [...(byJob.get(job.id) ?? []), callOff].sort((a, b) => a.date.localeCompare(b.date))
    );
  }
  return { byJob, byJobDay, today };
}

/** Provided once by the schedule frame (page.tsx), for every page inside it. */
export const CallOffContext = createContext<CallOffs>(NO_CALL_OFFS);
export const useCallOffs = () => useContext(CallOffContext);
export const jobCallOffs = (callOffs: CallOffs, jobId: string) => callOffs.byJob.get(jobId) ?? NONE;

/* ---- the words ---------------------------------------------------------------------------- */

const causeWord = (cause: WeatherCause) => CAUSE_LABEL[cause].toLowerCase();

const dayWord = (callOff: CallOff, today: string) => (callOff.date === today ? "today" : dayName(callOff.date, today));

/** "Called off Tue · rain", "Called off today · rain", "Called off 2 days": what a chip says under its name. */
export function callOffCaption(callOffs: CallOff[], today: string): string {
  if (callOffs.length !== 1) return `Called off ${callOffs.length} days`;
  const [only] = callOffs;
  return `Called off ${dayWord(only, today)} · ${causeWord(only.cause)}`;
}

/**
 * Every day of the job is called off — a one-day job, most often — so it is not happening as planned
 * at all, and may be drawn struck through. One day of five is not that: the job is still on.
 */
export function allCalledOff(job: Pick<Job, "startDate" | "endDate">, callOffs: CallOff[]): boolean {
  const days = Math.round((Date.parse(`${job.endDate}T12:00:00`) - Date.parse(`${job.startDate}T12:00:00`)) / 86_400_000) + 1;
  return callOffs.length > 0 && callOffs.length >= days;
}

/** "Called off today", "Called off Thu", "Called off 2 days": a tag for a job that has them. */
export function callOffTag(callOffs: CallOff[], today: string): string {
  if (callOffs.length !== 1) return `Called off ${callOffs.length} days`;
  return `Called off ${dayWord(callOffs[0], today)}`;
}

/** The whole of it, for a title or a screen reader: "Called off Thu, Sep 25 for rain; the reschedule is waiting on a decision." */
export function callOffSentence(callOff: CallOff): string {
  return `Called off ${dateWords(callOff.date)} for ${causeWord(callOff.cause)}${
    callOff.reschedulePending ? "; the reschedule is waiting on a decision" : ""
  }.`;
}

/** The tag itself: the bad tone's pill, with its calendar-and-cross. Nothing when there are none. */
export function CallOffTag({ callOffs, today }: { callOffs: CallOff[]; today: string }) {
  if (callOffs.length === 0) return null;
  return (
    <span className="sched-calledoff" title={callOffs.map(callOffSentence).join(" ")}>
      <CalendarX2 size={12} aria-hidden="true" />
      {callOffTag(callOffs, today)}
    </span>
  );
}
