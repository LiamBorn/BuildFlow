/**
 * BuildFlow for Mac, step 6: the words the Mac speaks.
 *
 * Demo mode answers four questions from the person's own inbox, with nothing invented, and in sentences
 * that sound right read aloud: "9:30 AM", "tomorrow", "two meetings", no "·". These cases pin the
 * wording on a fixed day, in a fixed zone, from a fixed inbox, so a change to how something is said is
 * a change somebody meant.
 */
import { describe, expect, it } from "vitest";
import type { NeedsYouTask, UpcomingJob } from "@buildflow/shared";
import { conversation } from "../src/desktopAsk.js";
import type { DesktopInbox, DesktopMeeting, DesktopNotification } from "../src/desktopInbox.js";
import {
  NOT_CONNECTED_CHANGE,
  NOT_CONNECTED_OTHER,
  demoAnswer,
  speakable,
  spokenClock,
  spokenDay,
  voiceContext,
  voiceIntent,
  zonedMidnight,
  zonedParts
} from "../src/desktopVoice.js";

const ZONE = "America/New_York";
/** Monday, September 28, 2026, 9:00 AM in New York (EDT, UTC-4). */
const NOW = Date.parse("2026-09-28T13:00:00Z");
const TODAY = "2026-09-28";

const meeting = (over: Partial<DesktopMeeting>): DesktopMeeting => ({
  id: "m",
  provider: "google",
  title: "Meeting",
  startsAt: "2026-09-28T13:30:00Z",
  endsAt: "2026-09-28T13:45:00Z",
  allDay: false,
  joinUrl: "https://meet.google.com/abc-defg-hij",
  conference: "Google Meet",
  location: "",
  myResponse: "accepted",
  state: "later",
  ...over
});

const job = (over: Partial<UpcomingJob>): UpcomingJob => ({
  id: "job-1",
  name: "Framing",
  projectId: "p-1",
  project: "Oak Ridge",
  date: TODAY,
  start: "07:00",
  end: "15:30",
  crews: [],
  crewIds: [],
  status: "Planned",
  weather: null,
  mine: true,
  days: [TODAY],
  ...over
});

const notification = (over: Partial<DesktopNotification>): DesktopNotification => ({
  id: "n",
  kind: "material",
  title: "Material status updated",
  sub: "Rebar is delivered for Maple St. Plaza.",
  tone: "green",
  at: "2026-09-28T12:00:00Z",
  seen: false,
  read: false,
  alertable: true,
  projectId: "p-2",
  target: { kind: "material", id: "mat-1" },
  opens: { kind: "record", page: "inventory", recordId: "mat-1" },
  ...over
});

const task = (over: Partial<NeedsYouTask>): NeedsYouTask => ({
  id: "t",
  kind: "weather-call",
  title: "Call the rain day",
  detail: "Footings pour · Maple St. Plaza · Rain: 80% chance, Monday 1–3 PM",
  projectId: "p-2",
  project: "Maple St. Plaza",
  due: "2026-09-28T13:00",
  tone: "amber",
  target: { kind: "weatherConflict", id: "wc-1" },
  actions: [],
  ...over
});

function inbox(over: Partial<DesktopInbox> = {}): DesktopInbox {
  return {
    version: 1,
    generatedAt: new Date(NOW).toISOString(),
    today: TODAY,
    me: {
      userId: "u-1",
      name: "Dana Brooks",
      firstName: "Dana",
      workspace: "Asphalt Co",
      role: "owner",
      greeting: { kind: "morning", text: "Good morning, Dana" }
    },
    counts: { notifications: 0, unseen: 0, unread: 0, tasks: 0, jobsToday: 0, meetingsToday: 0 },
    notifications: [],
    jobs: [],
    meetings: [],
    calendar: { connected: ["google"], failed: [] },
    tasks: [],
    ...over
  };
}

const say = (question: string, from: DesktopInbox) => demoAnswer(question, from, { now: NOW, timeZone: ZONE }).sentences.join(" ");

describe("how things are said", () => {
  it("says a clock the way a person does", () => {
    expect(spokenClock("07:00")).toBe("7 AM");
    expect(spokenClock("15:30")).toBe("3:30 PM");
    expect(spokenClock("12:00")).toBe("12 PM");
    expect(spokenClock("00:15")).toBe("12:15 AM");
    expect(spokenClock("7:00 AM"), "the seed's own style reads the same").toBe("7 AM");
  });

  it("says a day relative to today", () => {
    expect(spokenDay(TODAY, TODAY)).toBe("today");
    expect(spokenDay("2026-09-29", TODAY)).toBe("tomorrow");
    expect(spokenDay("2026-10-01", TODAY)).toBe("Thursday");
    expect(spokenDay("2026-10-08", TODAY)).toBe("Thursday, October 8");
  });

  it("turns the screen's separators into pauses and leaves nothing to spell out", () => {
    expect(speakable("Footings pour · Maple St. Plaza · Rain: 1–3 PM")).toBe("Footings pour, Maple St. Plaza, Rain: 1 to 3 PM");
    expect(speakable("**Pour** → Monday & Tuesday")).toBe("Pour to Monday and Tuesday");
  });

  it("finds the reader's midnight in their zone, across a change of clocks", () => {
    expect(zonedMidnight(TODAY, ZONE).toISOString()).toBe("2026-09-28T04:00:00.000Z");
    // 2026-11-01 is the day New York goes back an hour: that midnight is still EDT
    expect(zonedMidnight("2026-11-01", ZONE).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(zonedMidnight("2026-11-02", ZONE).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(zonedParts(NOW, ZONE)).toEqual({ date: TODAY, clock: "09:00" });
  });
});

describe("which question it is", () => {
  it("reads the four questions demo mode answers, and a change before anything else", () => {
    expect(voiceIntent("What's next?")).toBe("next");
    expect(voiceIntent("what’s up next for me")).toBe("next");
    expect(voiceIntent("Any meetings today?")).toBe("meetings");
    expect(voiceIntent("Read my notifications")).toBe("notifications");
    expect(voiceIntent("What's waiting on me?")).toBe("waiting");
    expect(voiceIntent("Move Oak Ridge framing to 6")).toBe("change");
    expect(voiceIntent("Move my meeting to tomorrow")).toBe("change");
    expect(voiceIntent("Start Oak Ridge framing at 6")).toBe("change");
    expect(voiceIntent("Have the pour finish at 4")).toBe("change");
    expect(voiceIntent("When does framing start tomorrow?"), "a question, not an instruction").toBe("next");
    expect(voiceIntent("How much rebar is left?")).toBe("other");
  });
});

describe("demo mode's answers", () => {
  it("what's next: the next meeting and the next job, soonest first, skipping work already under way", () => {
    const day = inbox({
      meetings: [
        meeting({ title: "Standup" }),
        meeting({ id: "m2", title: "Site walk", startsAt: "2026-09-28T18:00:00Z", endsAt: "2026-09-28T19:00:00Z" })
      ],
      jobs: [
        job({ id: "j-now", name: "Footings pour", project: "Maple St. Plaza", start: "07:00" }),
        job({ id: "j-next", date: "2026-09-29", crews: ["Framing Crew A"] })
      ]
    });
    expect(say("What's next?", day)).toBe(
      "Your next meeting is Standup today at 9:30 AM. Next on the schedule is Framing at Oak Ridge, tomorrow at 7 AM, with Framing Crew A."
    );
  });

  it("what's next: a job before a meeting, and a job with no crew says so", () => {
    const day = inbox({
      meetings: [meeting({ title: "Design review", startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T15:00:00Z" })],
      jobs: [job({ start: "13:00" })]
    });
    expect(say("what's next", day)).toBe(
      "Next on the schedule is Framing at Oak Ridge, today at 1 PM, with no crew booked yet. Your next meeting is Design review tomorrow at 10 AM."
    );
    expect(say("what's next", inbox())).toBe("Nothing else is on your schedule or your calendar for the coming week.");
  });

  it("any meetings: today's, then the next one, and never a meeting it can't see", () => {
    const today = inbox({
      meetings: [
        meeting({ title: "Standup", state: "soon" }),
        meeting({ id: "m2", title: "Site walk", startsAt: "2026-09-28T18:00:00Z", endsAt: "2026-09-28T19:00:00Z" }),
        meeting({ id: "m3", title: "Design review", startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T15:00:00Z" })
      ]
    });
    expect(say("Any meetings?", today)).toBe("You have two meetings left today: Standup at 9:30 AM and Site walk at 2 PM.");

    const later = inbox({
      meetings: [meeting({ title: "Design review", startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T15:00:00Z" })]
    });
    expect(say("Any meetings?", later)).toBe("You have no more meetings today. Your next one is Design review tomorrow at 10 AM.");

    expect(say("Any meetings?", inbox({ calendar: { connected: [], failed: [] } }))).toBe(
      "Your calendar isn't connected, so I can't see your meetings. You can connect Google or Outlook from the Meetings panel on the BuildFlow website."
    );
    expect(say("Any meetings?", inbox({ calendar: { connected: ["microsoft"], failed: ["microsoft"] } }))).toBe(
      "I couldn't reach your calendar just now, so this may not be everything. You have no more meetings today. Nothing is on your calendar for the coming week."
    );
  });

  it("read my notifications: how many, then the newest real news, equipment last", () => {
    const day = inbox({
      counts: { notifications: 6, unseen: 5, unread: 5, tasks: 0, jobsToday: 0, meetingsToday: 0 },
      notifications: [
        notification({
          id: "eq",
          kind: "equipment",
          title: "Equipment status updated",
          sub: "Roller 2 is in service for Oak Ridge.",
          alertable: false
        }),
        notification({ id: "a" }),
        notification({ id: "b", title: "DelayIQ being tracked", sub: "Permit hold is open on Oak Ridge with 2 day impact." }),
        notification({ id: "old", title: "Field update posted", sub: "Sam updated Oak Ridge: poured", read: true }),
        notification({ id: "c", title: "Inspection scheduled", sub: "Footing inspection is scheduled for Maple St. Plaza." })
      ]
    });
    expect(say("Read my notifications", day)).toBe(
      "You have five unread notifications. Here are the newest three. " +
        "Material status updated. Rebar is delivered for Maple St. Plaza. " +
        "DelayIQ being tracked. Permit hold is open on Oak Ridge with 2 day impact. " +
        "Inspection scheduled. Footing inspection is scheduled for Maple St. Plaza."
    );
    expect(say("any notifications", inbox())).toBe("You're all caught up. There are no unread notifications.");
  });

  it("what's waiting on me: how many, the first three, and where the rest are", () => {
    const day = inbox({
      tasks: [
        task({}),
        task({ id: "t2", kind: "time-cards", title: "Approve 3 time cards", project: "" }),
        task({ id: "t3", kind: "unbooked-job", title: "No crew on Framing", project: "Oak Ridge" }),
        task({ id: "t4", kind: "readiness", title: "Order rebar", project: "Oak Ridge" })
      ]
    });
    expect(say("What's waiting on me?", day)).toBe(
      "Four things are waiting on you. Call the rain day, for Maple St. Plaza. Approve 3 time cards. No crew on Framing, for Oak Ridge. And one more thing in the Tasks tab."
    );
    expect(say("anything waiting on me", inbox())).toBe("Nothing is waiting on you right now.");
  });

  it("says the AI isn't connected for a change and for anything else", () => {
    expect(say("Start Oak Ridge framing at 6", inbox())).toBe(NOT_CONNECTED_CHANGE);
    expect(say("How much rebar is left?", inbox())).toBe(NOT_CONNECTED_OTHER);
  });
});

describe("what Claude is told about the person's day", () => {
  it("names jobs and crews by id, lists meetings in their time, and carries no email or meeting link", () => {
    const day = inbox({
      meetings: [meeting({ title: "Standup", state: "soon" })],
      notifications: [notification({})],
      counts: { notifications: 1, unseen: 1, unread: 1, tasks: 1, jobsToday: 1, meetingsToday: 1 },
      tasks: [task({})]
    });
    const data = {
      jobs: [
        {
          id: "job-9",
          projectId: "p-1",
          name: "Framing",
          phase: "Framing",
          startDate: "2026-09-29",
          endDate: "2026-09-30",
          startTime: "7:00 AM",
          endTime: "3:30 PM",
          status: "Planned"
        }
      ],
      assignments: [{ jobId: "job-9", crewId: "crew-3", date: "2026-09-29" }],
      crews: [{ id: "crew-3", name: "Framing Crew A", specialty: "Framing" }],
      projects: [{ id: "p-1", name: "Oak Ridge" }],
      users: [{ email: "dana@asphaltco.com" }]
    } as never;
    const context = voiceContext({ data, inbox: day, now: NOW, timeZone: ZONE, canChangeSchedule: true, role: "Owner" });
    expect(context).toContain(
      "- id job-9: Framing, project Oak Ridge; 2026-09-29 to 2026-09-30; 07:00 to 15:30; booked on Framing Crew A (crew-3); Planned"
    );
    expect(context).toContain("- id crew-3: Framing Crew A, Framing");
    expect(context).toContain("9:30 AM to 9:45 AM: Standup (starting soon)");
    expect(context).toContain("NOW: Monday, September 28, 2026 (2026-09-28), 9 AM (America/New_York).");
    expect(context).toContain("Call the rain day, Maple St. Plaza");
    expect(context).not.toContain("dana@asphaltco.com");
    expect(context).not.toContain("meet.google.com");
  });
});

describe("the conversation Claude reads", () => {
  it("keeps the last six turns, starts with the person, and never puts two turns of one side together", () => {
    const history = [
      { role: "assistant" as const, text: "hello" },
      { role: "user" as const, text: "a" },
      { role: "user" as const, text: "b" },
      { role: "assistant" as const, text: "  " },
      { role: "assistant" as const, text: "c" }
    ];
    expect(conversation(history, "now?")).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
      { role: "user", content: "now?" }
    ]);
    expect(conversation([{ role: "user", text: "unanswered" }], "again")).toEqual([{ role: "user", content: "unanswered\n\nagain" }]);
  });
});
