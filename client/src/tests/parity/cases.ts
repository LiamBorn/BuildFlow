/**
 * The inputs the website's own notification list, Dashboard greeting and meeting helpers were run
 * on before they moved into @buildflow/shared (2026-09-26, notch step 3). The outputs they gave are
 * kept beside this file as JSON — captured from the App.tsx and calendarModel.ts code as it stood at
 * 28150ca — and parity.test.ts runs the shared versions on the same inputs and compares.
 *
 * Everything that touches a clock is built in LOCAL time (as calendarModel.test.ts does), so the
 * captured answers hold in whatever time zone the suite runs in.
 */
import type { BootstrapPayload, WeatherConflict } from "@buildflow/shared";
import type { CalendarMeeting } from "../../api";
import { bootstrapFixture } from "../../test/fixture";

/* ── the notification list ───────────────────────────────────────────────────────────────── */

const conflict = (fields: Partial<WeatherConflict> & Pick<WeatherConflict, "id" | "status">): WeatherConflict => ({
  jobId: "j-riverside-concrete",
  projectId: "p-riverside",
  date: "2026-06-17",
  cause: "lightning",
  severity: "hold",
  start: "2026-06-17T13:00",
  end: "2026-06-17T15:00",
  reason: "thunderstorms",
  assigneeId: "u-matt",
  detectedAt: "2026-06-16T08:00:00.000Z",
  updatedAt: "2026-06-16T08:30:00.000Z",
  ...fields
});

/**
 * Every source, every tone and every fallback the builder has: an unknown author, an unknown
 * project, an unknown job and crew, a fleet machine, an alert for all projects, each conflict
 * status (two of which are left out), a conflict whose job is gone, one with no update time, and
 * two items stamped the same instant so the sort's stability is part of what is compared.
 */
export const richNotificationFixture: BootstrapPayload = {
  ...bootstrapFixture,
  projects: [
    ...bootstrapFixture.projects,
    { ...bootstrapFixture.projects[0], id: "p-harbor", name: "Harbor Point", slug: "harbor-point", managerId: "u-carlos" }
  ],
  jobs: [
    ...bootstrapFixture.jobs,
    { ...bootstrapFixture.jobs[0], id: "j-harbor-grading", projectId: "p-harbor", name: "Harbor Point", phase: "Site grading" }
  ],
  fieldUpdates: [
    ...bootstrapFixture.fieldUpdates,
    {
      id: "fu-2",
      projectId: "p-harbor",
      jobId: "j-harbor-grading",
      userId: "u-matt",
      message: "Stopped: the excavator is down.",
      status: "DelayIQed",
      createdAt: "2026-06-15T14:05:00.000Z",
      photos: []
    },
    {
      id: "fu-3",
      projectId: "p-gone",
      userId: "u-nobody",
      message: "Crew waiting on the pump.",
      status: "At Risk",
      createdAt: "2026-06-16T09:18:00.000Z",
      photos: []
    }
  ],
  weatherConflicts: [
    conflict({ id: "wx-hold", status: "open" }),
    conflict({
      id: "wx-watch",
      status: "open",
      jobId: "j-harbor-grading",
      projectId: "p-harbor",
      date: "2026-06-18",
      cause: "rain",
      severity: "watch",
      start: "2026-06-18T10:30",
      end: "2026-06-18T13:00",
      reason: "0.20 in of rain",
      assigneeId: "u-carlos",
      updatedAt: ""
    }),
    conflict({
      id: "wx-called",
      status: "cancelled",
      cause: "wind",
      reason: "gusts to 38 mph",
      start: "2026-06-17T07:00",
      end: "2026-06-17T09:30"
    }),
    conflict({ id: "wx-kept", status: "kept" }),
    conflict({ id: "wx-cleared", status: "cleared" }),
    conflict({ id: "wx-orphan", status: "open", jobId: "j-deleted" })
  ],
  weatherAlerts: [
    ...bootstrapFixture.weatherAlerts,
    {
      id: "wa-2",
      projectId: "p-harbor",
      title: "Storm warning",
      details: "Lightning likely.",
      severity: "High",
      startsAt: "2026-06-17T18:00:00.000Z"
    },
    { id: "wa-3", title: "Cold snap", details: "Lows near freezing.", severity: "Low", startsAt: "2026-06-19T06:00:00.000Z" }
  ],
  delayIQs: [
    ...bootstrapFixture.delayIQs,
    {
      id: "delayIQ-rebar",
      projectId: "p-harbor",
      category: "Materials",
      title: "Rebar delivery slipping",
      impactDays: 2,
      severity: "High",
      status: "Open",
      reportedAt: "2026-06-16T11:48:00.000Z",
      description: "Supplier short."
    },
    {
      id: "delayIQ-permit",
      projectId: "p-riverside",
      category: "Permits",
      title: "Permit posted late",
      impactDays: 0,
      severity: "Low",
      status: "Resolved",
      reportedAt: "2026-06-10",
      description: "Posted."
    }
  ],
  assignments: [
    ...bootstrapFixture.assignments,
    {
      id: "as-clash",
      jobId: "j-harbor-grading",
      crewId: "crew-concrete",
      date: "2026-06-18",
      status: "Planned",
      conflicts: ["double-booked"]
    },
    { id: "as-ghost", jobId: "j-deleted", crewId: "crew-deleted", date: "2026-06-16", status: "Ready", conflicts: [] }
  ],
  inspections: [
    ...bootstrapFixture.inspections,
    { id: "insp-2", projectId: "p-harbor", title: "Footing inspection", scheduledAt: "2026-06-12T15:00:00.000Z", status: "Complete" },
    { id: "insp-3", projectId: "p-harbor", title: "Rebar inspection", scheduledAt: "2026-06-16T09:18:00.000Z", status: "Ready" }
  ],
  materials: [
    ...bootstrapFixture.materials,
    { id: "mat-rebar", projectId: "p-harbor", name: "Rebar #5", status: "Missing", deliveryDate: "2026-06-17", quantity: "4 t" },
    { id: "mat-forms", projectId: "p-riverside", name: "Form ply", status: "Ordered", deliveryDate: "2026-06-19", quantity: "60 sheets" },
    {
      id: "mat-anchor",
      projectId: "p-harbor",
      name: "Anchor bolts",
      status: "Waiting on Delivery",
      deliveryDate: "2026-06-20",
      quantity: "200"
    }
  ],
  equipment: [
    ...bootstrapFixture.equipment,
    { id: "eq-dozer", name: "Dozer D6", type: "Dozer", status: "Maintenance", assignedTo: "p-harbor" },
    { id: "eq-loader", name: "Loader 950", type: "Loader", status: "Available" },
    { id: "eq-roller", name: "Roller", type: "Roller", status: "In Use", assignedTo: "p-gone" }
  ]
};

export const notificationFixtures: Record<string, BootstrapPayload> = {
  default: bootstrapFixture,
  rich: richNotificationFixture
};

/* ── the Dashboard greeting ──────────────────────────────────────────────────────────────── */

/** One instant in every hour of a day, local time — what the greeting read the hour from. */
export const greetingHours = Array.from({ length: 24 }, (_, hour) => hour);
export const greetingInstant = (hour: number) => new Date(2026, 5, 16, hour, 30);

/* ── the Meetings panel ──────────────────────────────────────────────────────────────────── */

const local = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute);
const at = (month: number, day: number, hour = 0, minute = 0) => local(month, day, hour, minute).toISOString();

function meeting(fields: Partial<CalendarMeeting> & Pick<CalendarMeeting, "id" | "startsAt" | "endsAt">): CalendarMeeting {
  return {
    provider: "google",
    title: fields.id,
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
  };
}

/** A week of meetings around Monday, September 14, 2026: timed, all-day, multi-day, declined, and past the week. */
export const meetingEvents: CalendarMeeting[] = [
  meeting({ id: "standup", startsAt: at(9, 14, 9, 30), endsAt: at(9, 14, 9, 45) }),
  meeting({ id: "walkthrough", startsAt: at(9, 14, 13), endsAt: at(9, 14, 14), provider: "microsoft" }),
  meeting({ id: "early", startsAt: at(9, 14, 7), endsAt: at(9, 14, 8) }),
  meeting({ id: "declined", startsAt: at(9, 14, 10), endsAt: at(9, 14, 11), myResponse: "declined" }),
  meeting({ id: "organizer", startsAt: at(9, 15, 8), endsAt: at(9, 15, 9), myResponse: "organizer" }),
  meeting({ id: "tentative", startsAt: at(9, 16, 16), endsAt: at(9, 16, 17), myResponse: "tentative" }),
  meeting({ id: "overnight", startsAt: at(9, 14, 23), endsAt: at(9, 15, 1) }),
  meeting({ id: "holiday", startsAt: "2026-09-14", endsAt: "2026-09-15", allDay: true }),
  meeting({ id: "offsite", startsAt: "2026-09-16", endsAt: "2026-09-19", allDay: true }),
  meeting({ id: "graph-all-day", startsAt: "2026-09-13T00:00:00.0000000Z", endsAt: "2026-09-14T00:00:00.0000000Z", allDay: true }),
  meeting({ id: "next-week", startsAt: at(9, 21, 8, 59), endsAt: at(9, 21, 10) }),
  meeting({ id: "far", startsAt: at(9, 24, 9), endsAt: at(9, 24, 10) }),
  meeting({ id: "same-start", startsAt: at(9, 14, 13), endsAt: at(9, 14, 13, 30) })
];

/** The clocks each helper was read at: before, inside the 15-minute window, during, after, next day. */
export const meetingNows: Record<string, number> = {
  "sep14-06:00": local(9, 14, 6).getTime(),
  "sep14-09:00": local(9, 14, 9).getTime(),
  "sep14-09:15": local(9, 14, 9, 15).getTime(),
  "sep14-09:16": local(9, 14, 9, 16).getTime(),
  "sep14-09:30": local(9, 14, 9, 30).getTime(),
  "sep14-09:45": local(9, 14, 9, 45).getTime(),
  "sep14-12:50": local(9, 14, 12, 50).getTime(),
  "sep14-23:59": local(9, 14, 23, 59).getTime(),
  "sep15-00:30": local(9, 15, 0, 30).getTime(),
  "sep17-12:00": local(9, 17, 12).getTime(),
  "sep19-00:00": local(9, 19).getTime()
};

/** The limits upNext was asked for: the panel's default and two others. */
export const upNextLimits = [4, 1, 20];
