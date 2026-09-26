/**
 * The Mac's inbox (2026-09-26, notch step 3): `buildDesktopInbox` builds the plan's
 * `{ me, notifications, jobs, meetings, tasks }` from what the store already has, reads only, and
 * carries a content hash for an ETag. The route is step 5's; this is the answer it will send.
 *
 * "Today" is Saturday, September 26, 2026; the reader is Liam, the Owner, in Chicago.
 */
import { describe, expect, it } from "vitest";
import {
  NEEDS_YOU_LEVELS,
  NOTIFICATION_STATE_SETTING,
  buildNotificationItems,
  emptyNotificationState,
  encodeNotificationState,
  markNotifications,
  permissionLevels,
  unseenNotificationCount,
  type BootstrapPayload,
  type Job,
  type NeedsYouCapability
} from "@buildflow/shared";
import type { CalendarEvent } from "../src/calendar.js";
import { buildDesktopInbox, dayIn, desktopInboxEtag } from "../src/desktopInbox.js";
import { can } from "../src/permissions.js";

/** 9:00 AM in Chicago on Saturday the 26th. */
const NOW = Date.parse("2026-09-26T14:00:00.000Z");
const TZ = "America/Chicago";

const job = (fields: Partial<Job> & Pick<Job, "id" | "projectId" | "phase" | "startDate" | "endDate">): Job => ({
  name: fields.phase,
  location: "",
  startTime: "7:00 AM",
  endTime: "3:30 PM",
  requiredLabor: 4,
  requiredEquipment: "",
  materialsStatus: "Delivered",
  status: "Confirmed",
  priority: "Normal",
  notes: "",
  percentComplete: 0,
  ...fields
});

const project = (id: string, name: string, managerId: string) => ({
  id,
  name,
  slug: id,
  location: "",
  address: "",
  type: "",
  contractType: "",
  managerId,
  targetCompletion: "2026-12-01",
  percentComplete: 10,
  scheduleHealth: "On Track" as const,
  status: "In Progress" as const,
  image: "",
  latitude: 0,
  longitude: 0
});

function workspace(): BootstrapPayload {
  return {
    users: [
      { id: "u-liam", name: "liam santos", permission: "owner", title: "Owner", avatar: "LS" },
      { id: "u-carlos", name: "Carlos Ramirez", permission: "member", title: "Super", avatar: "CR" }
    ],
    activeUser: { id: "u-liam", name: "liam santos", permission: "owner", title: "Owner", avatar: "LS" },
    projects: [project("p-maple", "Maple St. Plaza", "u-liam"), project("p-oak", "Oak Ridge", "u-carlos")],
    phases: [],
    jobs: [
      job({ id: "j31", projectId: "p-maple", phase: "Footings pour", startDate: "2026-09-26", endDate: "2026-09-26" }),
      job({
        id: "j40",
        projectId: "p-oak",
        phase: "Framing, level 2",
        startDate: "2026-09-21",
        endDate: "2026-10-09",
        startTime: "7:30 AM",
        status: "In Progress"
      })
    ],
    crews: [
      {
        id: "c2",
        name: "Crew 2",
        specialty: "Concrete",
        lead: "",
        size: 6,
        capacity: 40,
        utilization: 50,
        icon: "",
        status: "Scheduled",
        laborMix: []
      },
      {
        id: "c4",
        name: "Crew 4",
        specialty: "Framing",
        lead: "",
        size: 6,
        capacity: 40,
        utilization: 50,
        icon: "",
        status: "Scheduled",
        laborMix: []
      }
    ],
    equipment: [{ id: "eq-1", name: "Concrete Pump #2", type: "Pump", status: "In Use", assignedTo: "p-maple" }],
    materials: [],
    assignments: [
      { id: "a1", jobId: "j31", crewId: "c2", date: "2026-09-26", status: "Confirmed", conflicts: [] },
      { id: "a2", jobId: "j40", crewId: "c4", date: "2026-09-26", status: "In Progress", conflicts: [] }
    ],
    dependencies: [],
    fieldUpdates: [
      {
        id: "fu-9",
        projectId: "p-oak",
        jobId: "j40",
        userId: "u-carlos",
        message: "Crew 4 reported framing at 60%.",
        status: "In Progress",
        createdAt: "2026-09-26T13:20:00.000Z",
        photos: []
      }
    ],
    variances: [],
    delayIQs: [
      {
        id: "d12",
        projectId: "p-maple",
        category: "Materials",
        title: "Rebar delivery slipping",
        impactDays: 2,
        severity: "High",
        status: "Open",
        reportedAt: "2026-09-26T13:48:00.000Z",
        description: ""
      }
    ],
    readiness: [{ id: "r1", projectId: "p-maple", label: "Permit posted on site", complete: false, dueDate: "2026-10-02" }],
    inspections: [],
    weatherAlerts: [],
    weatherConflicts: [
      {
        id: "wx-j31-2026-09-26",
        jobId: "j31",
        projectId: "p-maple",
        date: "2026-09-26",
        cause: "rain",
        severity: "hold",
        start: "2026-09-26T14:00",
        end: "2026-09-26T15:30",
        reason: "0.30 in of rain",
        assigneeId: "u-liam",
        status: "open",
        detectedAt: "2026-09-26T12:00:00.000Z",
        updatedAt: "2026-09-26T12:00:00.000Z"
      }
    ],
    userSettings: {}
  };
}

const meeting = (id: string, startsAt: string, minutes: number, fields: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  provider: "google",
  title: id,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(),
  allDay: false,
  location: "",
  joinUrl: "",
  attendees: [],
  organizer: "",
  guests: [],
  myResponse: "accepted",
  description: "",
  webUrl: "",
  conference: "",
  ...fields
});

const MEETINGS: CalendarEvent[] = [
  meeting("Standup", "2026-09-26T14:10:00.000Z", 15, { joinUrl: "https://meet.google.com/abc-defg-hij", conference: "Google Meet" }),
  meeting("Owner walkthrough", "2026-09-26T18:00:00.000Z", 60, { location: "Maple St. Plaza", provider: "microsoft" }),
  meeting("Declined", "2026-09-26T19:00:00.000Z", 30, { myResponse: "declined" }),
  meeting("Earlier", "2026-09-26T12:00:00.000Z", 30),
  meeting("Monday review", "2026-09-28T15:00:00.000Z", 30)
];

const build = (overrides: Partial<Parameters<typeof buildDesktopInbox>[0]> = {}) =>
  buildDesktopInbox({
    data: workspace(),
    account: { id: "acct-liam", name: "Liam Santos", role: "owner" },
    workspace: { name: "Keating Paving" },
    meetings: { events: MEETINGS, connected: ["google", "microsoft"], failed: [] },
    now: NOW,
    timeZone: TZ,
    can: (capability) => can("owner", capability),
    ...overrides
  });

describe("the Mac's inbox", () => {
  it("has the plan's shape: me, notifications, jobs, meetings and tasks", () => {
    const { inbox, etag } = build();
    expect(Object.keys(inbox)).toEqual([
      "version",
      "generatedAt",
      "today",
      "me",
      "counts",
      "notifications",
      "jobs",
      "meetings",
      "calendar",
      "tasks"
    ]);
    expect(etag).toMatch(/^"bfi-[A-Za-z0-9_-]{32}"$/);
    expect(inbox.today).toBe("2026-09-26");
    expect(inbox.me).toEqual({
      userId: "u-liam",
      name: "liam santos",
      firstName: "Liam",
      workspace: "Keating Paving",
      role: "owner",
      greeting: { kind: "morning", text: "Good morning, Liam" }
    });
  });

  it("lists the bell's notifications, with read and seen, and equipment that can never alert", () => {
    const { inbox } = build();
    expect(inbox.notifications.map((item) => item.id)).toEqual([
      "equipment-eq-1",
      "delayIQ-d12",
      "field-fu-9",
      "weather-conflict-wx-j31-2026-09-26",
      "assignment-a1",
      "assignment-a2"
    ]);
    expect(inbox.notifications[1]).toEqual({
      id: "delayIQ-d12",
      kind: "delayIQ",
      title: "DelayIQ being tracked",
      sub: "Rebar delivery slipping is open on Maple St. Plaza with 2 day impact.",
      tone: "red",
      at: "2026-09-26T13:48:00.000Z",
      seen: false,
      read: false,
      alertable: true,
      projectId: "p-maple",
      target: { kind: "delayIQ", id: "d12" },
      opens: { kind: "record", page: "delayIQs", recordId: "d12" }
    });
    expect(inbox.notifications.filter((item) => !item.alertable).map((item) => item.kind)).toEqual(["equipment"]);
  });

  it("counts unseen exactly as the bell's badge does", () => {
    const data = workspace();
    const items = buildNotificationItems(data, NOW);
    const state = markNotifications(
      markNotifications(emptyNotificationState(), ["delayIQ-d12", "field-fu-9"], "seen"),
      ["field-fu-9"],
      "read"
    );
    data.userSettings = { [NOTIFICATION_STATE_SETTING]: encodeNotificationState(state, items) };
    const { inbox } = build({ data });
    expect(inbox.counts.unseen).toBe(unseenNotificationCount(state, items));
    expect(inbox.counts).toMatchObject({ notifications: 6, unseen: 4, unread: 5 });
    expect(inbox.notifications.find((item) => item.id === "field-fu-9")).toMatchObject({ seen: true, read: true });
    expect(inbox.notifications.find((item) => item.id === "delayIQ-d12")).toMatchObject({ seen: true, read: false });
  });

  it("lists the jobs coming up, mine first, with the crew and the rain flag", () => {
    const { inbox } = build();
    expect(
      inbox.jobs.map((row) => [row.name, row.project, row.crews, row.date, row.start, row.status, row.weather?.severity ?? null, row.mine])
    ).toEqual([
      ["Footings pour", "Maple St. Plaza", ["Crew 2"], "2026-09-26", "07:00", "Confirmed", "hold", true],
      ["Framing, level 2", "Oak Ridge", ["Crew 4"], "2026-09-26", "07:30", "In Progress", null, false]
    ]);
    expect(inbox.counts.jobsToday).toBe(2);
  });

  it("lists the meetings still to come, declined ones left out, counting down from fifteen minutes", () => {
    const { inbox } = build();
    expect(inbox.meetings.map((item) => [item.title, item.state])).toEqual([
      ["Standup", "soon"],
      ["Owner walkthrough", "later"],
      ["Monday review", "later"]
    ]);
    expect(inbox.meetings[0]).toMatchObject({
      joinUrl: "https://meet.google.com/abc-defg-hij",
      conference: "Google Meet",
      provider: "google"
    });
    expect(inbox.counts.meetingsToday).toBe(2);
    expect(inbox.calendar).toEqual({ connected: ["google", "microsoft"], failed: [] });
  });

  it("lists what is waiting on you, with the endpoint for each answer", () => {
    const { inbox } = build();
    expect(inbox.tasks.map((task) => [task.kind, task.title, task.due, task.actions.map((action) => action.id)])).toEqual([
      ["weather-call", "Call the rain day", "2026-09-26T14:00", ["cancel", "keep"]],
      ["readiness", "Permit posted on site", "2026-10-02", []]
    ]);
    expect(inbox.tasks[0].actions[0].request).toEqual({
      method: "POST",
      path: "/api/weather/conflicts/wx-j31-2026-09-26/cancel",
      body: {}
    });
    expect(inbox.counts.tasks).toBe(2);
    // Carlos, a Member: his project's rain call is not his to make, and nothing else is waiting on him
    const carlos = { ...workspace(), activeUser: workspace().users[1] };
    const member = build({
      data: carlos,
      account: { id: "acct-carlos", name: "Carlos Ramirez", role: "member" },
      can: (capability) => can("member", capability)
    });
    expect(member.inbox.tasks).toEqual([]);
    expect(member.inbox.jobs.map((row) => [row.name, row.mine])).toEqual([
      ["Framing, level 2", true],
      ["Footings pour", false]
    ]);
  });

  it("reads the day and the greeting on the Mac's clock, not the server's", () => {
    // 3 AM UTC on the 27th is still the 26th in Los Angeles, and 8 PM there
    const late = Date.parse("2026-09-27T03:00:00.000Z");
    expect(dayIn(late, "America/Los_Angeles")).toBe("2026-09-26");
    expect(build({ now: late, timeZone: "America/Los_Angeles" }).inbox.today).toBe("2026-09-26");
    // 1:30 AM in Chicago: Working late
    expect(build({ now: Date.parse("2026-09-26T06:30:00.000Z") }).inbox.me.greeting).toEqual({ kind: "late", text: "Working late, Liam" });
    // back after three hours: Welcome back
    expect(build({ lastActiveAt: new Date(NOW - 3 * 3600_000).toISOString() }).inbox.me.greeting.text).toBe("Welcome back, Liam");
  });

  it("keeps the same ETag while nothing has changed, even as the clock moves", () => {
    const first = build();
    // a minute later: generatedAt and the equipment row's "now" both moved, nothing else did
    const later = build({ now: NOW + 60_000 });
    expect(later.inbox.generatedAt).not.toBe(first.inbox.generatedAt);
    expect(later.inbox.notifications[0].at).not.toBe(first.inbox.notifications[0].at);
    expect(later.etag).toBe(first.etag);
    expect(desktopInboxEtag(first.inbox)).toBe(first.etag);
  });

  it("changes the ETag when something the Mac shows changes", () => {
    const base = build().etag;
    const data = workspace();
    data.delayIQs[0] = { ...data.delayIQs[0], severity: "Medium" };
    expect(build({ data }).etag).not.toBe(base);
    const read = workspace();
    read.userSettings = {
      [NOTIFICATION_STATE_SETTING]: encodeNotificationState(markNotifications(emptyNotificationState(), ["delayIQ-d12"], "read"))
    };
    expect(build({ data: read }).etag).not.toBe(base);
    // a meeting moving into its last fifteen minutes is a change the notch must hear about
    expect(build({ now: NOW - 10 * 60_000 }).etag).not.toBe(base);
  });

  it("cuts the list to the newest, but counts all of them", () => {
    const { inbox } = build({ limits: { notifications: 2 } });
    expect(inbox.notifications).toHaveLength(2);
    expect(inbox.counts.notifications).toBe(6);
  });

  it("only reads: the data it was given is untouched", () => {
    const data = workspace();
    const before = JSON.stringify(data);
    build({ data });
    expect(JSON.stringify(data)).toBe(before);
  });

  it("decides who can act the way the server's permissions do", () => {
    for (const level of permissionLevels) {
      for (const capability of Object.keys(NEEDS_YOU_LEVELS) as NeedsYouCapability[]) {
        expect(NEEDS_YOU_LEVELS[capability].includes(level), `${level} ${capability}`).toBe(can(level, capability));
      }
    }
  });
});
