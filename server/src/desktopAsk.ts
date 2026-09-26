/* =========================================================================
   BuildFlow for Mac's voice (notch plan, feature 3; build step 6): the server half.

   The Mac turns speech into text on the laptop and posts it here. This answers as a stream of
   Server-Sent Events the Mac reads aloud as it arrives, and a change to the schedule comes back as a
   PROPOSAL that changes nothing until the person presses Accept.

     POST /api/desktop/ask                   { text, history?, tz? }  →  text/event-stream
       event: text      {"delta":"…"}                      the answer, as it streams
       event: proposal  { id, kind, summary, jobId, … }    a change waiting for Accept
       event: done      {"mode":"live"|"demo"}             the last event of an answer
       event: error     {"code","message"}                 the last event of a failed one
     POST /api/desktop/proposals/:id/accept  →  200 { ok, job } | 404 proposal_gone | 409 conflict | 403 forbidden
     POST /api/desktop/proposals/:id/reject  →  200 { ok }      | 404 proposal_gone

   Every answer is HTTP 200 with the outcome in the stream, errors included, so the Mac reads one shape.
   Before the stream there is only the device gate's 401 and the body parser's 400/413, as JSON.

   THE MODEL. The same model and connection as the website's assistant (ai.ts: claude-opus-5, which
   ANTHROPIC_MODEL overrides; the operator's own key, or Replit AI Integrations), streamed, at effort
   "low": a spoken answer is one to three sentences and the first words have to come back fast. With
   the refusal fallback on (ai.ts refusalFallback), and a refusal that still comes back is said plainly.

   THE LIMIT. It shares the website assistant's 40 questions an hour (ai.ts AI_QUESTION_LIMIT): one
   allowance per person, whichever door the question came in by.

   DEMO MODE, when there is no key, the key fails or the account has no credit: the answer is read off
   the person's own inbox (desktopVoice.ts) and `done.mode` says "demo".

   PROPOSALS. Claude can only CALL propose_schedule_change, a strict tool. Nothing is written then. The
   server checks the job, the value, the person's permission and the crews' days; builds the exact write
   the website would make for that change (jobWrites.ts); and keeps it, with the versions it was built
   against, for ten minutes, bound to this Mac, this login and this workspace, good for one Accept or
   Reject. They are kept IN MEMORY: a restart forgets them (Accept then answers proposal_gone, and the
   person asks again), and a second API instance would not know another's. BuildFlow runs one.
   ========================================================================= */
import crypto from "node:crypto";
import type express from "express";
import { z } from "zod";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { addIsoDays, parseClock, type CrewClash, type Job, type RebookMove, type ScheduleLiveEvent } from "@buildflow/shared";
import { AI_MODEL, aiClient, aiFailure, buildAiContext, refusalFallback, tradeContext } from "./ai.js";
import type { CalendarEvent, CalendarProvider } from "./calendar.js";
import type { Account, BuildFlowStore } from "./database.js";
import { buildDesktopInbox, dayIn } from "./desktopInbox.js";
import { demoAnswer, speakable, spokenClock, voiceContext, zonedMidnight } from "./desktopVoice.js";
import { editJob, rebookJobs, type JobPatch, type JobWrite } from "./jobWrites.js";
import { can, decide, type Capability } from "./permissions.js";
import { humanSeconds, type HitResult } from "./rateLimit.js";

/* ── what app.ts lends this module ─────────────────────────────────────────── */

export type MeetingsRead = { events: CalendarEvent[]; connected: CalendarProvider[]; failed: CalendarProvider[] };

export type DesktopAskHooks = {
  /** One question against the website assistant's hourly allowance for this caller. */
  countQuestion: (req: express.Request) => Promise<HitResult>;
  /** The person's meetings from every calendar they connected, through the five-minute cache. A provider slower than `waitMs` is reported failed. */
  meetingsFor: (accountId: string, from: Date, to: Date, options: { waitMs?: number }) => Promise<MeetingsRead>;
  /** Tells the workspace's open website tabs what changed, as every schedule write does. */
  announce: (req: express.Request, event: Pick<ScheduleLiveEvent, "kind" | "op" | "ids">) => void;
};

export type DesktopAskDeps = DesktopAskHooks & {
  /** The caller's workspace store, bound by the device gate. */
  store: BuildFlowStore;
};

/* ── the numbers ───────────────────────────────────────────────────────────── */

/** How long a proposal waits for Accept or Reject. */
export const PROPOSAL_TTL_MS = 10 * 60 * 1000;
/** How many earlier turns an answer sees, so "and Thursday?" makes sense. */
export const MAX_HISTORY_TURNS = 6;
/** How long the calendar may take before the answer goes ahead without it. The Mac's inbox read keeps it warm. */
export const CALENDAR_WAIT_MS = 1000;
/** Requests one question may make: the answer, and up to two more if a proposal was refused and Claude should say why or correct it. */
const MAX_ROUNDS = 3;
/** Proposals one question may make. */
const MAX_PROPOSALS_PER_ASK = 3;
/** Proposals one Mac may hold at once; the oldest goes first. A bound, not a feature. */
const MAX_PROPOSALS_PER_DEVICE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ── the request ───────────────────────────────────────────────────────────── */

const askSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  /* More than six turns is accepted and cut to the last six: the Mac keeping a longer memory is not an error. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(50)
    .optional(),
  tz: z.string().max(64).optional()
});

/** An IANA zone the server's Intl knows, or nothing: an unknown zone reads as the server's own clock. */
function knownZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

/* ── the stream ────────────────────────────────────────────────────────────── */

export type AskErrorCode = "rate_limited" | "ai_unavailable" | "refused" | "bad_request";

type EventStream = {
  send: (event: "text" | "proposal", data: unknown) => void;
  done: (mode: "live" | "demo") => void;
  fail: (code: AskErrorCode, message: string, extra?: Record<string, unknown>) => void;
};

function openEventStream(res: express.Response): EventStream {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const write = (event: string, data: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  return {
    send: write,
    done: (mode) => {
      write("done", { mode });
      res.end();
    },
    fail: (code, message, extra) => {
      write("error", { code, message, ...extra });
      res.end();
    }
  };
}

/** A demo answer, a sentence to an event, the way the Mac speaks it. */
function speak(stream: EventStream, sentences: string[]) {
  sentences.forEach((one, index) => stream.send("text", { delta: index === 0 ? one : ` ${one}` }));
}

/* ── proposals ─────────────────────────────────────────────────────────────── */

export type ProposalField = "start" | "end" | "date" | "crew";

/** What the Mac is sent: the card's words, and the change as values. */
export type ProposalEvent = {
  id: string;
  kind: "schedule_change";
  summary: string;
  jobId: string;
  jobName: string;
  project: string;
  change: {
    field: ProposalField;
    /** As the card shows them: "7 AM", "Monday, September 28", "Framing Crew A". */
    from: string;
    to: string;
    /** As the data holds them: "07:00", "2026-09-28", a crew id. */
    fromValue: string;
    toValue: string;
  };
  expiresAt: string;
};

/** The write an Accept makes: the website's own, built and version-stamped when the proposal was made. */
type ProposalWrite =
  | { kind: "patch"; patch: JobPatch }
  | {
      kind: "rebook";
      moves: RebookMove[];
      /** The bookings the job had. If that set has changed by Accept, so has the job. */
      bookingIds: string[];
    };

type Proposal = {
  event: ProposalEvent;
  deviceId: string;
  accountId: string;
  orgId: string;
  expiresAt: number;
  jobId: string;
  write: ProposalWrite;
  /** The capability the website's endpoint for this write needs. */
  capability: Capability;
};

type Holder = { deviceId: string; accountId: string; orgId: string };

/** Proposals waiting for an answer, in this process. See the header for why memory is enough. */
export class ProposalBook {
  private readonly proposals = new Map<string, Proposal>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  add(proposal: Proposal): void {
    this.sweep();
    const mine = [...this.proposals.values()].filter((one) => one.deviceId === proposal.deviceId);
    for (const old of mine.slice(0, Math.max(0, mine.length - MAX_PROPOSALS_PER_DEVICE + 1))) this.proposals.delete(old.event.id);
    this.proposals.set(proposal.event.id, proposal);
  }

  /** The proposal, if it is this holder's and still good. Someone else's and an expired one are the same answer: none. */
  find(id: string, holder: Holder): Proposal | undefined {
    this.sweep();
    const proposal = this.proposals.get(id);
    if (!proposal) return undefined;
    if (proposal.deviceId !== holder.deviceId || proposal.accountId !== holder.accountId || proposal.orgId !== holder.orgId)
      return undefined;
    return proposal;
  }

  /** Spent: it cannot be accepted or rejected again. */
  spend(id: string): void {
    this.proposals.delete(id);
  }

  private sweep() {
    const now = this.clock();
    for (const [id, proposal] of this.proposals) if (proposal.expiresAt <= now) this.proposals.delete(id);
  }
}

const GONE = { error: "That change is no longer waiting. Ask again.", code: "proposal_gone" as const };

/* ── what Claude may call ──────────────────────────────────────────────────── */

export const PROPOSE_TOOL: BetaTool = {
  name: "propose_schedule_change",
  description:
    "Propose one change to one job for the person to Accept or Reject. Nothing changes until they press Accept. " +
    "field: start is the job's daily start time; end is its daily end time; date is the day the job starts, and the whole job " +
    "and all its bookings move by the same number of days; crew is the crew the job's bookings are on. " +
    "value: for start and end, 24-hour HH:MM such as 06:00; for date, YYYY-MM-DD; for crew, the crew's id from CREWS.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      job_id: { type: "string", description: "The job's id, exactly as JOBS lists it." },
      field: { type: "string", enum: ["start", "end", "date", "crew"] },
      value: { type: "string", description: "HH:MM for start and end, YYYY-MM-DD for date, a crew id for crew." }
    },
    required: ["job_id", "field", "value"],
    additionalProperties: false
  }
};

const toolInput = z.object({
  job_id: z.string().min(1).max(200),
  field: z.enum(["start", "end", "date", "crew"]),
  value: z.string().min(1).max(200)
});

const VOICE_SYSTEM = `You are BuildFlow's voice assistant, answering out loud on the person's Mac. They spoke their question, and the Mac reads your answer aloud as it arrives, sentence by sentence. BuildFlow schedules construction work: projects, jobs, crews and their bookings, plus the person's meetings, notifications and the things waiting on them.

How to answer:
- Talk like a colleague on the phone: one to three short sentences, the answer first. Don't repeat the question.
- Plain spoken sentences only: no markdown, no lists, no headings, no emoji, no symbols. Say times like "7 AM" or "2:30 PM" and days like "today", "tomorrow", "Thursday" or "October 6". Never read out an id.
- Use only the workspace snapshot and the person's day in the latest message. If the answer isn't there, say so in a sentence. Never invent a job, crew, meeting or number.

Changing the schedule:
- You can't change anything yourself. You can propose one change to a job: its start time, its end time, the day it starts (the whole job and its bookings move together), or the crew it's booked on. Call propose_schedule_change with ids from the snapshot. BuildFlow then shows the person a card with Accept and Reject, and nothing changes until they press Accept.
- Say one short sentence first, naming the change and that it's waiting for their Accept.
- If you can't tell which job or crew they mean, ask instead of guessing. If the tool refuses a change, say why in a sentence.
- Anything else, like adding or deleting a job, is done on the BuildFlow website; say so.`;

/* ── checking a proposed change ────────────────────────────────────────────── */

type Planned = { ok: true; proposal: Omit<Proposal, "deviceId" | "accountId" | "orgId"> } | { ok: false; reason: string };

const REAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) => REAL_DATE.test(value) && addIsoDays(value, 0) === value;
const daysBetween = (from: string, to: string) => {
  const at = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
};
/** A clock written the way the job already writes its times: "6:00 AM" beside "7:00 AM", "06:00" beside "07:00". */
const clockLike = (existing: string, clock: string) => {
  if (/^\d{1,2}:\d{2}$/.test(existing.trim())) return clock;
  const [hours, minutes] = clock.split(":").map(Number);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};
const spokenDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/**
 * Checks a change Claude proposed and builds the website's write for it, or says why not in words
 * Claude can pass on. Reads only: nothing is written until Accept.
 */
export function planChange(
  store: BuildFlowStore,
  input: unknown,
  who: { account: Pick<Account, "role" | "name">; today: string; now: number }
): Planned {
  const parsed = toolInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "The change was incomplete. Give job_id, field and value." };
  const { job_id: jobId, field, value } = parsed.data;
  const job = store.job(jobId);
  if (!job) return { ok: false, reason: `No job has the id "${jobId}". Use an id from JOBS, or ask which job they mean.` };
  const project = store.project(job.projectId)?.project.name ?? "Unassigned";
  // What the job is, as the Mac's Jobs tab names it (upcomingJobs.ts): its phase, or its name without one.
  const what = job.phase || job.name;
  const label = project !== "Unassigned" && project !== what ? `${what} at ${project}` : what;
  const bookings = store.assignments().filter((booking) => booking.jobId === job.id);
  const crewName = (id: string) => store.crews().find((crew) => crew.id === id)?.name ?? "a crew";
  const clashes = (moves: Array<{ id: string; crewId: string; date: string }>): CrewClash[] =>
    moves.flatMap((move) => store.crewClashes(move.crewId, move.date, job.id, move.id));
  const clashReason = (found: CrewClash[]) =>
    `That would double-book ${found[0].crewName}: it's on ${found[0].jobName} on ${spokenDate(found[0].date.slice(0, 10))}. Nothing was proposed; tell them, and that they can double-book on the website if they mean to.`;

  let write: ProposalWrite;
  let capability: Capability;
  let from: string;
  let to: string;
  let fromValue: string;
  let toValue: string;
  let summary: string;

  if (field === "start" || field === "end") {
    const clock = parseClock(value);
    if (!clock) return { ok: false, reason: `"${value}" isn't a time. Give it as 24-hour HH:MM, like 06:00.` };
    const current = parseClock(field === "start" ? job.startTime : job.endTime) ?? (field === "start" ? job.startTime : job.endTime);
    if (clock === current)
      return {
        ok: false,
        reason: `${label} already ${field === "start" ? "starts" : "ends"} at ${spokenClock(clock)}. Nothing to propose.`
      };
    const other = parseClock(field === "start" ? job.endTime : job.startTime);
    if (other && (field === "start" ? clock >= other : clock <= other)) {
      return {
        ok: false,
        reason:
          field === "start"
            ? `${label} ends at ${spokenClock(other)}, so it can't start at ${spokenClock(clock)}. Nothing was proposed.`
            : `${label} starts at ${spokenClock(other)}, so it can't end at ${spokenClock(clock)}. Nothing was proposed.`
      };
    }
    // written in the job's own style, since the website shows the field as it is stored
    const stored = clockLike(field === "start" ? job.startTime : job.endTime, clock);
    write = {
      kind: "patch",
      patch: field === "start" ? { startTime: stored, version: job.version } : { endTime: stored, version: job.version }
    };
    capability = "jobs.write";
    from = spokenClock(current);
    to = spokenClock(clock);
    fromValue = current;
    toValue = clock;
    summary = field === "start" ? `Start ${label} at ${to} instead of ${from}.` : `Have ${label} finish at ${to} instead of ${from}.`;
  } else if (field === "date") {
    if (!isRealDate(value)) return { ok: false, reason: `"${value}" isn't a date. Give it as YYYY-MM-DD.` };
    if (value === job.startDate) return { ok: false, reason: `${label} already starts on ${spokenDate(value)}. Nothing to propose.` };
    if (Math.abs(daysBetween(who.today, value)) > 730)
      return { ok: false, reason: `${spokenDate(value)} is more than two years away. Check the date with them.` };
    const delta = daysBetween(job.startDate, value);
    const endDate = addIsoDays(job.endDate, delta);
    const moved = bookings.map((booking) => ({
      id: booking.id,
      crewId: booking.crewId,
      date: addIsoDays(booking.date.slice(0, 10), delta),
      version: booking.version
    }));
    const found = clashes(moved);
    if (found.length) return { ok: false, reason: clashReason(found) };
    // The website's rule (client/src/schedule/rebook.ts, jobMove): a job with bookings moves with all of
    // them in one re-book; one without any is a plain edit of its dates.
    if (bookings.length) {
      write = {
        kind: "rebook",
        moves: [
          { op: "job", id: job.id, startDate: value, endDate, version: job.version },
          ...moved.map((move): RebookMove => ({ op: "move", id: move.id, date: move.date, version: move.version }))
        ],
        bookingIds: bookings.map((booking) => booking.id).sort()
      };
      capability = "assignments.write";
    } else {
      write = { kind: "patch", patch: { startDate: value, endDate, version: job.version } };
      capability = "jobs.write";
    }
    from = spokenDate(job.startDate);
    to = spokenDate(value);
    fromValue = job.startDate;
    toValue = value;
    summary = `Move ${label} to start on ${to} instead of ${from}${
      bookings.length ? `, with ${bookings.length === 1 ? "its booking" : `all ${bookings.length} of its bookings`}` : ""
    }.`;
  } else {
    const crew = store.crews().find((one) => one.id === value);
    if (!crew) return { ok: false, reason: `No crew has the id "${value}". Use an id from CREWS, or ask which crew they mean.` };
    if (bookings.length === 0) {
      return {
        ok: false,
        reason: `${label} isn't booked on a crew yet, so there's no crew to change. Booking it is done on the BuildFlow website.`
      };
    }
    const crewIds = [...new Set(bookings.map((booking) => booking.crewId))];
    if (crewIds.length > 1) {
      return {
        ok: false,
        reason: `${label} is booked on more than one crew, so changing its crew by voice isn't safe. That's done on the BuildFlow website.`
      };
    }
    if (crewIds[0] === crew.id) return { ok: false, reason: `${label} is already on ${crew.name}. Nothing to propose.` };
    const moved = bookings.map((booking) => ({
      id: booking.id,
      crewId: crew.id,
      date: booking.date.slice(0, 10),
      version: booking.version
    }));
    const found = clashes(moved);
    if (found.length) return { ok: false, reason: clashReason(found) };
    write = {
      kind: "rebook",
      moves: moved.map((move): RebookMove => ({ op: "move", id: move.id, crewId: move.crewId, version: move.version })),
      bookingIds: bookings.map((booking) => booking.id).sort()
    };
    capability = "assignments.write";
    from = crewName(crewIds[0]);
    to = crew.name;
    fromValue = crewIds[0];
    toValue = crew.id;
    summary = `Put ${crew.name} on ${label} instead of ${from}.`;
  }

  if (!can(who.account.role, capability)) {
    return {
      ok: false,
      reason: `Their role can't make this change: only an Owner or Admin can change the schedule. Nothing was proposed; tell them an Owner or Admin can.`
    };
  }

  const expiresAt = who.now + PROPOSAL_TTL_MS;
  return {
    ok: true,
    proposal: {
      jobId: job.id,
      write,
      capability,
      expiresAt,
      event: {
        id: `bfp_${crypto.randomBytes(18).toString("base64url")}`,
        kind: "schedule_change",
        summary: speakable(summary),
        jobId: job.id,
        jobName: what,
        project,
        change: { field, from, to, fromValue, toValue },
        expiresAt: new Date(expiresAt).toISOString()
      }
    }
  };
}

/* ── the person's day ──────────────────────────────────────────────────────── */

/** The day a meeting read covers: the reader's midnight and the next eight days, the range the Mac's inbox reads too. */
export function meetingWindow(now: number, timeZone?: string): { from: Date; to: Date } {
  const from = zonedMidnight(dayIn(now, timeZone), timeZone);
  return { from, to: new Date(from.getTime() + 8 * DAY_MS) };
}

async function personsDay(req: express.Request, deps: DesktopAskDeps, now: number, timeZone?: string) {
  const account = req.account!;
  const data = deps.store.bootstrap(account.id);
  const today = dayIn(now, timeZone);
  const window = meetingWindow(now, timeZone);
  const meetings = await deps
    .meetingsFor(account.id, window.from, window.to, { waitMs: CALENDAR_WAIT_MS })
    .catch((): MeetingsRead => ({ events: [], connected: [], failed: [] }));
  // Submitted time is only anyone's task if they approve time; nobody else's list reads it.
  const timeEntries = can(account.role, "timecard.approve")
    ? deps.store.timeEntriesBetween(addIsoDays(today, -56), today).filter((entry) => entry.status === "Submitted")
    : undefined;
  const { inbox } = buildDesktopInbox({
    data,
    account,
    workspace: { name: req.org!.name },
    meetings,
    timeZone,
    timeEntries,
    can: (capability) => can(account.role, capability),
    now
  });
  return { data, inbox, today };
}

/* ── one question to Claude ────────────────────────────────────────────────── */

/** The earlier turns and this question, as the Messages API takes them: starting with the person, alternating. */
export function conversation(history: Array<{ role: "user" | "assistant"; text: string }>, latest: string): BetaMessageParam[] {
  const turns = history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.trim() }))
    .filter((turn) => turn.text);
  while (turns[0]?.role === "assistant") turns.shift();
  turns.push({ role: "user", text: latest });
  const merged: typeof turns = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n\n${turn.text}`;
    else merged.push({ ...turn });
  }
  return merged.map((turn) => ({ role: turn.role, content: turn.text }));
}

/**
 * What of a turn to act on and send back. After a refusal fallback the content carries a `fallback`
 * block where the model changed; tool calls and thinking from before the last one belong to the model
 * that declined, so they are neither run nor echoed (the fallback's own guidance).
 */
function afterFallback(content: BetaContentBlock[]): {
  echo: BetaContentBlockParam[];
  calls: Array<Extract<BetaContentBlock, { type: "tool_use" }>>;
} {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback");
  const internal = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);
  const echo = content.filter((block, index) => index > boundary || !internal.has(block.type)) as BetaContentBlockParam[];
  const calls = content.filter(
    (block, index): block is Extract<BetaContentBlock, { type: "tool_use" }> => index > boundary && block.type === "tool_use"
  );
  return { echo, calls };
}

type LiveOutcome = "done" | "demo" | "failed" | "aborted";

async function answerLive(
  ai: NonNullable<Awaited<ReturnType<typeof aiClient>>>,
  turn: { system: string; messages: BetaMessageParam[] },
  stream: EventStream,
  signal: AbortSignal,
  propose: (input: unknown) => { ok: true; event: ProposalEvent } | { ok: false; reason: string }
): Promise<LiveOutcome> {
  const fallback = refusalFallback(ai.via);
  let messages = turn.messages;
  let spoke = false;
  let proposed: ProposalEvent[] = [];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let message: BetaMessage;
    try {
      const request = ai.client.beta.messages.stream(
        {
          model: AI_MODEL,
          max_tokens: 8192,
          // Explicit for the same reason as ai.ts: an ANTHROPIC_MODEL naming Opus 4.8 runs without thinking otherwise.
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system: [{ type: "text", text: turn.system, cache_control: { type: "ephemeral" } }],
          tools: [PROPOSE_TOOL],
          messages,
          ...(fallback
            ? {
                betas: fallback.betas,
                // SDK 0.111 types `fallbacks` as the array form only; the "default" form postdates its typings and is sent as written.
                fallbacks: fallback.fallbacks as unknown as Array<{ model: string }>
              }
            : {})
        },
        { signal, timeout: 30_000, maxRetries: 1 }
      );
      for await (const event of request) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          spoke = true;
          stream.send("text", { delta: event.delta.text });
        }
      }
      message = await request.finalMessage();
    } catch (error) {
      const failure = aiFailure(error, ai.sdk);
      if (failure === "aborted" || signal.aborted) return "aborted";
      console.error("[voice] Claude request failed:", error instanceof Error ? error.message : error);
      // A key that fails or an account with no credit is demo mode, if nothing has been said yet.
      if (failure === "not-connected" && !spoke && proposed.length === 0) return "demo";
      stream.fail("ai_unavailable", "BuildFlow AI couldn't answer just now. Try again in a moment.");
      return "failed";
    }

    if (message.stop_reason === "refusal") {
      stream.fail("refused", "BuildFlow AI can't help with that one.");
      return "failed";
    }
    const { echo, calls } = afterFallback(message.content);
    // A turn cut off at max_tokens may carry a tool call with its input cut off too: never run it.
    if (message.stop_reason !== "tool_use" || calls.length === 0) break;

    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      if (call.name !== PROPOSE_TOOL.name) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "There is no such tool." });
        continue;
      }
      if (proposed.length >= MAX_PROPOSALS_PER_ASK) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: "That's enough changes for one question. Ask them to confirm these first."
        });
        continue;
      }
      const made = propose(call.input);
      if (made.ok) {
        proposed = [...proposed, made.event];
        stream.send("proposal", made.event);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Shown to them as a card: "${made.event.summary}" Nothing changes until they press Accept.`
        });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: made.reason });
      }
    }
    // Every change was proposed: the card speaks for itself, and another request would only make them wait.
    if (results.every((result) => !result.is_error)) break;
    messages = [...messages, { role: "assistant", content: echo }, { role: "user", content: results }];
  }
  if (!spoke) {
    const words = proposed.length
      ? `${proposed.map((event) => event.summary).join(" ")} Press Accept to make ${proposed.length === 1 ? "the change" : "the changes"}.`
      : "I don't have an answer for that one.";
    stream.send("text", { delta: words });
  }
  stream.done("live");
  return "done";
}

/* ── the routes ────────────────────────────────────────────────────────────── */

export function registerDesktopAskRoutes(app: express.Application, deps: DesktopAskDeps) {
  const { store } = deps;
  const proposals = new ProposalBook();

  app.post("/api/desktop/ask", async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      openEventStream(res).fail("bad_request", "Ask a question.");
      return;
    }
    /* Counted before anything is read or asked, like the website's: a demo answer counts too, so the
       allowance means the same thing on the day credit is added. A limiter that cannot count lets the
       question through, as costLimit does -- a person who cannot ask is the worse failure. */
    const allowed = await deps.countQuestion(req).catch((error: unknown): HitResult => {
      console.error("[voice] letting a question through after an unexpected limiter failure:", error);
      return { ok: true, retryAfterSec: 0 };
    });
    if (!allowed.ok) {
      res.setHeader("Retry-After", String(allowed.retryAfterSec));
      openEventStream(res).fail("rate_limited", `That's a lot of questions at once. Try again in ${humanSeconds(allowed.retryAfterSec)}.`, {
        retryAfterSec: allowed.retryAfterSec
      });
      return;
    }

    const stream = openEventStream(res);
    // The Mac hanging up stops the answer upstream too: nothing is paid for that nobody will hear.
    const hangUp = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) hangUp.abort();
    });

    const { text, history = [] } = parsed.data;
    const timeZone = knownZone(parsed.data.tz);
    const now = Date.now();
    try {
      const { data, inbox, today } = await personsDay(req, deps, now, timeZone);
      if (hangUp.signal.aborted) return;
      const ai = await aiClient().catch((error: unknown) => {
        console.error("[voice] the Anthropic SDK could not be loaded:", error instanceof Error ? error.message : error);
        return null;
      });
      if (ai) {
        const account = req.account!;
        const context = `${buildAiContext(data)}\n\nTHEIR DAY\n${voiceContext({
          data,
          inbox,
          now,
          timeZone,
          canChangeSchedule: can(account.role, "jobs.write") && can(account.role, "assignments.write"),
          role: account.role === "owner" ? "Owner" : account.role === "admin" ? "Admin" : "Member"
        })}`;
        const trade = tradeContext(store.businessType());
        const outcome = await answerLive(
          ai,
          {
            system: trade ? `${VOICE_SYSTEM}\n\n${trade}` : VOICE_SYSTEM,
            messages: conversation(history, `${context}\n\nWhat they asked: ${text}`)
          },
          stream,
          hangUp.signal,
          (input) => {
            const planned = planChange(store, input, { account, today, now: Date.now() });
            if (!planned.ok) return planned;
            proposals.add({ ...planned.proposal, deviceId: req.device!.id, accountId: account.id, orgId: req.org!.id });
            return { ok: true, event: planned.proposal.event };
          }
        );
        if (outcome !== "demo") return;
      }
      if (hangUp.signal.aborted) return;
      speak(stream, demoAnswer(text, inbox, { now, timeZone }).sentences);
      stream.done("demo");
    } catch (error) {
      console.error("[voice] answering failed:", error instanceof Error ? error.message : error);
      stream.fail("ai_unavailable", "BuildFlow AI couldn't answer just now. Try again in a moment.");
    }
  });

  /** The proposal this request may act on, or the answer that it can't. */
  const held = (req: express.Request, res: express.Response): Proposal | undefined => {
    const proposal = proposals.find(String(req.params.id), { deviceId: req.device!.id, accountId: req.account!.id, orgId: req.org!.id });
    if (!proposal) res.status(404).json(GONE);
    return proposal;
  };

  app.post("/api/desktop/proposals/:id/accept", (req, res) => {
    const proposal = held(req, res);
    if (!proposal) return;
    // The capability the website's own endpoint for this write needs, checked now: a role can change in ten minutes.
    const denial = decide(proposal.capability, req.account!.role);
    if (denial) {
      res.status(denial.status).json(denial.body);
      return;
    }
    // Spent before the write: an Accept pressed twice applies once, and a refused one is not tried again.
    proposals.spend(proposal.event.id);
    const conflict = (message: string, reason: string) => res.status(409).json({ error: message, message, code: "conflict", reason });

    let saved: JobWrite<unknown>;
    if (proposal.write.kind === "patch") {
      saved = editJob(store, proposal.jobId, proposal.write.patch);
    } else {
      const now = store
        .assignments()
        .filter((booking) => booking.jobId === proposal.jobId)
        .map((booking) => booking.id)
        .sort();
      if (now.join("\n") !== proposal.write.bookingIds.join("\n")) {
        conflict("Someone changed this job's bookings since. Nothing was changed; ask again.", "stale");
        return;
      }
      saved = rebookJobs(store, proposal.write.moves);
    }
    if (!saved.ok) {
      if (saved.status === 409 && saved.body.code === "conflict") conflict(`${saved.body.error}. Nothing was changed.`, "clash");
      else if (saved.status === 409) conflict("Someone changed this job since. Nothing was changed; ask again.", "stale");
      else conflict("That job isn't on the schedule the way it was. Nothing was changed; ask again.", "gone");
      return;
    }
    const job: Job | undefined = store.job(proposal.jobId);
    res.json({ ok: true, job });
    // The website's tabs hear about it exactly as they do when the website makes the same change.
    if (proposal.write.kind === "patch") deps.announce(req, { kind: "jobs", op: "job", ids: [proposal.jobId] });
    else deps.announce(req, { kind: "assignments", op: "move", ids: [...proposal.write.bookingIds, proposal.jobId] });
  });

  app.post("/api/desktop/proposals/:id/reject", (req, res) => {
    const proposal = held(req, res);
    if (!proposal) return;
    proposals.spend(proposal.event.id);
    res.json({ ok: true });
  });
}
