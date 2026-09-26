/* =========================================================================
   BuildFlow for Mac's voice: the words (notch plan, feature 3; build step 6).

   Everything here is said out loud. The Mac reads the answer sentence by sentence as it streams, so
   an answer is plain sentences: no lists, no markdown, no "·" or "→", times as a person says them
   ("7 AM", "2:30 PM") and days as a person says them ("today", "tomorrow", "Thursday").

   Two things live here, both pure, so they can be read and tested without a model:
   - voiceContext: what Claude is told about the person's day on top of the workspace snapshot the
     website's assistant already sends (buildAiContext). That snapshot has no meetings, no tasks and
     no notifications, and no ids, which a proposed change has to name.
   - demoAnswer: what the Mac says when Claude is not connected (no key, a key that fails, or no
     credit). It answers the four things the person's own inbox covers -- what's next, meetings,
     notifications, what's waiting on them -- and says plainly that the AI isn't connected for
     anything else. Never an invented answer: every sentence is read off the inbox.

   Times. A job's "07:00" is site time with no zone (upcomingJobs.ts); a meeting is an instant, read
   in the zone the Mac sends. The two are compared as the reader's day and clock, which is right while
   the reader is in the site's zone -- the same assumption the notch's countdowns make.
   ========================================================================= */
import { addIsoDays, parseClock, type BootstrapPayload, type Job } from "@buildflow/shared";
import type { DesktopInbox, DesktopMeeting, DesktopNotification } from "./desktopInbox.js";

/* ── how things are said ─────────────────────────────────────────────────── */

const SMALL_NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "three", or "14": small counts read better as words. */
export const countWords = (count: number): string => (count >= 0 && count < SMALL_NUMBERS.length ? SMALL_NUMBERS[count] : String(count));

const plural = (count: number, one: string, many = `${one}s`) => `${countWords(count)} ${count === 1 ? one : many}`;

/** "07:00" → "7 AM", "15:30" → "3:30 PM". A clock that can't be read is said as it is. */
export function spokenClock(clock: string): string {
  const parsed = parseClock(clock);
  if (!parsed) return clock;
  const [hours, minutes] = parsed.split(":").map(Number);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${minutes ? `${twelve}:${String(minutes).padStart(2, "0")}` : twelve} ${hours < 12 ? "AM" : "PM"}`;
}

const utcNoon = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

/** "today", "tomorrow", "Thursday" within the coming week, and "Thursday, October 8" past it. */
export function spokenDay(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addIsoDays(today, 1)) return "tomorrow";
  if (date === addIsoDays(today, -1)) return "yesterday";
  const weekday = utcNoon(date).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  if (date > today && date < addIsoDays(today, 7)) return weekday;
  return utcNoon(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "Sep 28": a day in the context Claude reads, short. */
const shortDay = (date: string) =>
  utcNoon(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The reader's calendar day and 24-hour clock for an instant, in their zone. An unknown zone falls back
 * to the server's own, as the inbox does.
 */
export function zonedParts(at: number, timeZone?: string): { date: string; clock: string } {
  const read = (zone?: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(at));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = read(timeZone);
  } catch {
    parts = read(undefined);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((one) => one.type === type)?.value ?? "00";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, clock: `${part("hour")}:${part("minute")}` };
}

/** The instant a day starts in a zone (the server's own without one), e.g. for a day-aligned calendar read. */
export function zonedMidnight(date: string, timeZone?: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (!timeZone) return new Date(year, month - 1, day);
  const wall = Date.UTC(year, month - 1, day);
  // how far the zone's clock is from UTC at an instant, to the minute
  const offsetAt = (at: number) => {
    const parts = zonedParts(at, timeZone);
    const [y, m, d] = parts.date.split("-").map(Number);
    const [h, min] = parts.clock.split(":").map(Number);
    return Date.UTC(y, m - 1, d, h, min) - at;
  };
  let at = wall - offsetAt(wall);
  at = wall - offsetAt(at); // a second look, for a day a clock change starts
  return new Date(at);
}

/** Text that reads well aloud: the screen's separators become pauses, and nothing is left to spell out. */
export function speakable(text: string): string {
  return text
    .replace(/\s*[·•|]\s*/g, ", ")
    .replace(/\s*(→|->)\s*/g, " to ")
    .replace(/\s*[–—]\s*/g, " to ")
    .replace(/&/g, " and ")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?:;])/g, "$1")
    .trim();
}

/** One sentence, ending in a stop. */
const sentence = (text: string) => {
  const said = speakable(text);
  if (!said) return "";
  const capital = said.charAt(0).toUpperCase() + said.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/** "A, B and C", with "and N more" past `max`. */
function listed(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(", ")}, and ${countWords(rest)} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/* ── the person's day, in order ──────────────────────────────────────────── */

type DayClock = { date: string; clock: string };
const beforeOrAt = (a: DayClock, b: DayClock) => a.date < b.date || (a.date === b.date && a.clock <= b.clock);

/** When a meeting starts, on the reader's calendar. An all-day entry's day is its own date. */
function meetingStart(meeting: DesktopMeeting, timeZone?: string): DayClock {
  if (meeting.allDay) return { date: meeting.startsAt.slice(0, 10), clock: "00:00" };
  return zonedParts(new Date(meeting.startsAt).getTime(), timeZone);
}

const meetingTitle = (meeting: DesktopMeeting) => meeting.title.trim() || "a meeting";

/** "Standup at 9:30 AM", "Site visit, all day". */
function meetingAt(meeting: DesktopMeeting, today: string, timeZone?: string, withDay = false): string {
  const start = meetingStart(meeting, timeZone);
  const day = withDay ? ` ${spokenDay(start.date, today)}` : "";
  if (meeting.allDay) return `${meetingTitle(meeting)},${day ? `${day},` : ""} all day`;
  return `${meetingTitle(meeting)}${day} at ${spokenClock(start.clock)}`;
}

/** "Footings pour at Maple St. Plaza". */
const jobLabel = (job: DesktopInbox["jobs"][number]) =>
  job.project && job.project !== "Unassigned" ? `${job.name} at ${job.project}` : job.name;

/* ── what was asked ──────────────────────────────────────────────────────── */

export type VoiceIntent = "next" | "meetings" | "notifications" | "waiting" | "change" | "other";

const CHANGE = /\b(move|moving|push|pull|shift|reschedule|change|set|put|swap|assign|book|unbook|cancel|delay|bump)\b/;
/** "Start Oak Ridge framing at 6", "have it finish at 4": an instruction, where "when does it start" is a question. */
const CHANGE_TIME = /^(please |can you |could you |let's )?(start|begin|finish|end)\b|\b(have|let|make) .+ (start|begin|finish|end)\b/;
const NOTIFICATIONS = /\b(notifications?|alerts?|what did i miss|anything new)\b/;
const MEETINGS = /\b(meetings?|calendar|appointments?|stand-?ups?)\b/;
const WAITING = /\b(waiting (on|for) me|waiting|tasks?|to-?dos?|on my plate|needs? me|needs? my|to approve|approvals?)\b/;
const NEXT = /\b(what'?s next|what is next|next|up next|coming up|my day|today|tomorrow)\b/;

/** Which of the questions demo mode can answer this is, read off the words. A change always goes first. */
export function voiceIntent(question: string): VoiceIntent {
  const text = question.toLowerCase().replace(/[’`]/g, "'");
  if (CHANGE.test(text) || CHANGE_TIME.test(text)) return "change";
  if (NOTIFICATIONS.test(text)) return "notifications";
  if (MEETINGS.test(text)) return "meetings";
  if (WAITING.test(text)) return "waiting";
  if (NEXT.test(text)) return "next";
  return "other";
}

/* ── demo mode ───────────────────────────────────────────────────────────── */

export const NOT_CONNECTED_CHANGE =
  "BuildFlow AI isn't connected yet, so I can't change the schedule by voice. You can make that change on the BuildFlow website.";
export const NOT_CONNECTED_OTHER =
  "BuildFlow AI isn't connected yet, so I can't answer that one. I can tell you what's next, your meetings, your notifications, or what's waiting on you.";

export type DemoAnswer = { intent: VoiceIntent; sentences: string[] };

/** What the Mac says without Claude: read off the person's own inbox, or that the AI isn't connected. */
export function demoAnswer(question: string, inbox: DesktopInbox, options: { now: number; timeZone?: string }): DemoAnswer {
  const intent = voiceIntent(question);
  const said = (sentences: string[]) => ({ intent, sentences: sentences.map(sentence).filter(Boolean) });
  switch (intent) {
    case "next":
      return said(whatsNext(inbox, options));
    case "meetings":
      return said(meetingsToday(inbox, options));
    case "notifications":
      return said(unreadNotifications(inbox));
    case "waiting":
      return said(waitingOnYou(inbox));
    case "change":
      return said([NOT_CONNECTED_CHANGE]);
    default:
      return said([NOT_CONNECTED_OTHER]);
  }
}

function whatsNext(inbox: DesktopInbox, { now, timeZone }: { now: number; timeZone?: string }): string[] {
  const here = zonedParts(now, timeZone);
  const today = inbox.today;
  const sentences: string[] = [];

  const current = inbox.meetings.find((meeting) => meeting.state === "now" && !meeting.allDay);
  if (current) {
    sentences.push(
      `You're in ${meetingTitle(current)} until ${spokenClock(zonedParts(new Date(current.endsAt).getTime(), timeZone).clock)}`
    );
  }
  const meeting = inbox.meetings.find((one) => one !== current && one.state !== "past" && one.state !== "now");
  const job = [...inbox.jobs]
    .filter((row) => row.date > here.date || (row.date === here.date && (row.start ?? "00:00") >= here.clock))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""))[0];

  const meetingLine = meeting && `Your next meeting is ${meetingAt(meeting, today, timeZone, true)}`;
  const jobLine =
    job &&
    `Next on the schedule is ${jobLabel(job)}, ${spokenDay(job.date, today)}${job.start ? ` at ${spokenClock(job.start)}` : ""}${
      job.crews.length ? `, with ${listed(job.crews, 2)}` : ", with no crew booked yet"
    }`;
  if (meeting && job) {
    const meetingFirst = beforeOrAt(meetingStart(meeting, timeZone), { date: job.date, clock: job.start ?? "00:00" });
    sentences.push(...(meetingFirst ? [meetingLine!, jobLine!] : [jobLine!, meetingLine!]));
  } else if (meetingLine) {
    sentences.push(meetingLine, "Nothing else is on the schedule for the coming week");
  } else if (jobLine) {
    sentences.push(jobLine);
  }
  if (sentences.length === 0) sentences.push("Nothing else is on your schedule or your calendar for the coming week");
  return sentences;
}

function meetingsToday(inbox: DesktopInbox, { timeZone }: { now: number; timeZone?: string }): string[] {
  const today = inbox.today;
  const { connected, failed } = inbox.calendar;
  if (connected.length === 0) {
    return [
      "Your calendar isn't connected, so I can't see your meetings",
      "You can connect Google or Outlook from the Meetings panel on the BuildFlow website"
    ];
  }
  const unreachable = failed.length ? ["I couldn't reach your calendar just now, so this may not be everything"] : [];
  const coming = inbox.meetings.filter((meeting) => meeting.state !== "past");
  const todays = coming.filter((meeting) => meetingStart(meeting, timeZone).date === today || (meeting.allDay && meeting.state === "now"));
  if (todays.length === 0) {
    const next = coming[0];
    return [
      ...unreachable,
      "You have no more meetings today",
      next ? `Your next one is ${meetingAt(next, today, timeZone, true)}` : "Nothing is on your calendar for the coming week"
    ];
  }
  const sentences = [
    ...unreachable,
    `You have ${plural(todays.length, "meeting")} left today: ${listed(todays.map((one) => meetingAt(one, today, timeZone)))}`
  ];
  const current = todays.find((meeting) => meeting.state === "now" && !meeting.allDay);
  if (current) sentences.push(`${meetingTitle(current)} is on now`);
  return sentences;
}

function notificationWords(item: DesktopNotification): string {
  const title = sentence(item.title);
  const sub = sentence(item.sub);
  return sub ? `${title} ${sub}` : title;
}

function unreadNotifications(inbox: DesktopInbox): string[] {
  const unread = inbox.notifications.filter((item) => !item.read);
  const total = Math.max(inbox.counts.unread, unread.length);
  if (total === 0) return ["You're all caught up", "There are no unread notifications"];
  // Equipment rows are stamped "now" on every build, so they always sort newest; real news goes first.
  const ordered = [...unread.filter((item) => item.alertable), ...unread.filter((item) => !item.alertable)];
  const read = ordered.slice(0, 3);
  const lead =
    total === 1
      ? "You have one unread notification"
      : `You have ${plural(total, "unread notification")}${total > read.length ? `. Here are the newest ${countWords(read.length)}` : ""}`;
  return [lead, ...read.map(notificationWords)];
}

function waitingOnYou(inbox: DesktopInbox): string[] {
  const tasks = inbox.tasks;
  if (tasks.length === 0) return ["Nothing is waiting on you right now"];
  const said = tasks
    .slice(0, 3)
    .map((task) => (task.project && task.project !== "Unassigned" ? `${task.title}, for ${task.project}` : task.title));
  const lead = tasks.length === 1 ? "One thing is waiting on you" : `${countWords(tasks.length)} things are waiting on you`;
  const rest = tasks.length - said.length;
  return [lead, ...said, ...(rest > 0 ? [`And ${plural(rest, "more thing")} in the Tasks tab`] : [])];
}

/* ── what Claude is told ─────────────────────────────────────────────────── */

export type VoiceContextInput = {
  data: BootstrapPayload;
  inbox: DesktopInbox;
  now: number;
  timeZone?: string;
  /** Whether this person may change the schedule; Claude is told, so it does not propose what they can't accept. */
  canChangeSchedule: boolean;
  role: string;
};

const cap = <T>(items: T[], max: number) => items.slice(0, max);

/**
 * The person's day, for Claude, after the workspace snapshot. Ids are included because a proposed change
 * has to name its job and crew exactly. Nothing about the account is: no email, no meeting link, no guest.
 */
export function voiceContext({ data, inbox, now, timeZone, canChangeSchedule, role }: VoiceContextInput): string {
  const here = zonedParts(now, timeZone);
  const lines: string[] = [];
  const zone = timeZone ? ` (${timeZone})` : "";
  lines.push(`THE PERSON: ${inbox.me.firstName}, ${role} in ${inbox.me.workspace}.`);
  lines.push(
    canChangeSchedule
      ? "They can change the schedule, so a change they ask for can be proposed."
      : "Their role can't change the schedule, so don't propose changes; say that an Owner or Admin can make it."
  );
  const longDay = utcNoon(here.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
  lines.push(`NOW: ${longDay} (${here.date}), ${spokenClock(here.clock)}${zone}.`);

  const crewsById = new Map((data.crews ?? []).map((crew) => [crew.id, crew]));
  const projectsById = new Map((data.projects ?? []).map((project) => [project.id, project]));
  const bookingsByJob = new Map<string, string[]>();
  for (const booking of data.assignments ?? []) {
    const crews = bookingsByJob.get(booking.jobId) ?? [];
    if (!crews.includes(booking.crewId)) crews.push(booking.crewId);
    bookingsByJob.set(booking.jobId, crews);
  }
  const open = (data.jobs ?? [])
    .filter((job: Job) => job.status !== "Complete" && job.endDate >= inbox.today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
  lines.push(`\nJOBS not complete and not over (${open.length}), soonest first. Name a job by its id in propose_schedule_change:`);
  for (const job of cap(open, 40)) {
    const crews = (bookingsByJob.get(job.id) ?? []).map((id) => `${crewsById.get(id)?.name ?? "Crew"} (${id})`);
    // what the job is, as the Mac's Jobs tab names it (its phase), and its own name when that says more
    const project = projectsById.get(job.projectId)?.name ?? "Unassigned";
    const what = job.phase || job.name;
    const named = job.name !== what && job.name !== project ? ` (${job.name})` : "";
    lines.push(
      `- id ${job.id}: ${what}${named}, project ${project}; ${job.startDate} to ${job.endDate}; ${
        parseClock(job.startTime) ?? job.startTime
      } to ${parseClock(job.endTime) ?? job.endTime}; ${crews.length ? `booked on ${crews.join(" and ")}` : "no crew booked"}; ${job.status}`
    );
  }

  const crews = data.crews ?? [];
  lines.push(`\nCREWS (${crews.length}). Name a crew by its id in propose_schedule_change:`);
  for (const crew of cap(crews, 30)) lines.push(`- id ${crew.id}: ${crew.name}, ${crew.specialty}`);

  if (inbox.calendar.connected.length === 0) {
    lines.push("\nMEETINGS: their calendar isn't connected, so their meetings can't be seen.");
  } else {
    lines.push(`\nMEETINGS in the coming week (${inbox.meetings.length}), in their time:`);
    for (const meeting of inbox.meetings) {
      const start = meetingStart(meeting, timeZone);
      const when = meeting.allDay
        ? `${shortDay(start.date)}, all day`
        : `${shortDay(start.date)}, ${spokenClock(start.clock)} to ${spokenClock(zonedParts(new Date(meeting.endsAt).getTime(), timeZone).clock)}`;
      lines.push(
        `- ${when}: ${meeting.title || "Untitled"}${meeting.state === "now" ? " (on now)" : meeting.state === "soon" ? " (starting soon)" : ""}`
      );
    }
    if (inbox.calendar.failed.length) lines.push(`(${inbox.calendar.failed.join(" and ")} couldn't be read just now.)`);
  }

  const unread = inbox.notifications.filter((item) => !item.read);
  lines.push(`\nNOTIFICATIONS: ${inbox.counts.unread} unread of ${inbox.counts.notifications}. The newest:`);
  for (const item of cap(inbox.notifications, 8)) lines.push(`- ${item.read ? "" : "unread: "}${item.title}. ${item.sub}`);
  if (unread.length === 0 && inbox.notifications.length === 0) lines.push("- none");

  lines.push(`\nWAITING ON THEM (${inbox.tasks.length}):`);
  for (const task of cap(inbox.tasks, 8)) {
    lines.push(`- ${task.title}${task.project ? `, ${task.project}` : ""}${task.due ? `, due ${task.due}` : ""}: ${task.detail}`);
  }
  if (inbox.tasks.length === 0) lines.push("- nothing");
  return lines.join("\n");
}
