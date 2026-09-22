import { describe, expect, it } from "vitest";
import type { BootstrapPayload, Job, ScheduleAssignment } from "@buildflow/shared";
import { deriveScheduleAlerts, relativeTime } from "./alerts";

const data = {
  projects: [
    { id: "p-1", name: "Pinecrest" },
    { id: "p-2", name: "Harborview" }
  ],
  crews: [{ id: "c-1", name: "Trenching Crew 2" }],
  delayIQs: [
    { id: "d-1", title: "Permit slipped", status: "Open", projectId: "p-1", impactDays: 3, reportedAt: "2026-09-09T08:00:00.000Z" }
  ],
  weatherAlerts: [],
  jobs: [],
  assignments: []
} as unknown as BootstrapPayload;
const now = new Date("2026-09-09T12:00:00.000Z");
const job = (id: string, extra: Partial<Job> = {}): Job =>
  ({ id, name: id, projectId: "p-1", phase: "Trenching", startDate: "2026-09-09", materialsStatus: "Delivered", ...extra }) as Job;
const booking = (id: string, date: string, conflicts: string[] = []): ScheduleAssignment =>
  ({ id, jobId: "j-1", crewId: "c-1", date, conflicts }) as unknown as ScheduleAssignment;

describe("schedule alerts", () => {
  it("raises the same alerts for what is in view, each with a place to go", () => {
    const alerts = deriveScheduleAlerts(
      data,
      [job("j-1"), job("j-2", { materialsStatus: "Missing" })],
      [booking("a-1", "2026-09-09", ["a-2"])],
      now
    );
    expect(alerts.map((alert) => alert.title)).toEqual(["Double-booked crew", "Permit slipped", "Missing materials"]);
    expect(alerts[0].detail).toBe("Trenching Crew 2 conflicts on Sep 9.");
    expect(alerts[0].link).toEqual({ page: "month", weekStart: "2026-09-07" });
    expect(alerts[1].link).toEqual({ page: "delayIQs" });
    expect(alerts[2].link).toEqual({ page: "materials" });
  });

  it("is quiet when the view has nothing wrong", () => {
    expect(deriveScheduleAlerts({ ...data, delayIQs: [] } as BootstrapPayload, [job("j-1")], [booking("a-1", "2026-09-09")])).toEqual([]);
  });

  it("leaves out the problems of a project the page is not showing", () => {
    const withWeather = {
      ...data,
      weatherAlerts: [
        { id: "w-1", projectId: "p-2", title: "High winds", startsAt: "2026-09-10T06:00:00.000Z" },
        { id: "w-2", title: "Heat advisory", startsAt: "2026-09-09T18:00:00.000Z" }
      ]
    } as unknown as BootstrapPayload;
    // the page is filtered to Harborview, which has neither the DelayIQ nor a job of Pinecrest's
    const harborview = deriveScheduleAlerts(withWeather, [job("j-3", { projectId: "p-2" })], [], now);
    expect(harborview.map((alert) => alert.title)).toEqual(["Weather delayIQ expected"]);
    expect(harborview[0].detail).toBe("Harborview · High winds");

    // filtered to Pinecrest: its own DelayIQ, and the warning that is about every site
    const pinecrest = deriveScheduleAlerts(withWeather, [job("j-1")], [], now);
    expect(pinecrest.map((alert) => alert.title)).toEqual(["Permit slipped", "Weather delayIQ expected"]);
    expect(pinecrest[1].detail).toBe("All sites · Heat advisory");

    // a filter that matches nothing leaves only the warning that belongs to no project
    expect(deriveScheduleAlerts(withWeather, [], [], now).map((alert) => alert.detail)).toEqual(["All sites · Heat advisory"]);
  });

  it("counts each age from the alert's own timestamp, and says nothing when there is none", () => {
    const withWeather = {
      ...data,
      weatherAlerts: [{ id: "w-1", projectId: "p-1", title: "High winds", startsAt: "2026-09-10T06:00:00.000Z" }]
    } as unknown as BootstrapPayload;
    const alerts = deriveScheduleAlerts(
      withWeather,
      [job("j-1"), job("j-2", { materialsStatus: "Missing" })],
      [booking("a-1", "2026-09-09", ["a-2"])],
      now
    );
    const when = Object.fromEntries(alerts.map((alert) => [alert.title, alert.when]));
    expect(when["Permit slipped"]).toBe("4h ago"); // reported 08:00, now 12:00
    expect(when["Weather delayIQ expected"]).toBe("in 18h"); // arrives 06:00 tomorrow
    // a booking and a job record no moment for these, and an invented age is worse than none
    expect(when["Double-booked crew"]).toBeNull();
    expect(when["Missing materials"]).toBeNull();

    // an hour later the same payload reads differently — which is the whole point of an age
    const later = deriveScheduleAlerts(withWeather, [job("j-1")], [], new Date("2026-09-09T13:00:00.000Z"));
    expect(later[0].when).toBe("5h ago");
  });

  it("says when a booking has no crew, whatever the filters are", () => {
    // Deleting a crew takes its bookings with it, so this is what an import or an older partial
    // write leaves behind. Every board drops the row silently, which is the problem.
    const withStray = {
      ...data,
      crews: [{ id: "c-1", name: "Trenching Crew 2" }],
      jobs: [job("j-1")],
      assignments: [booking("a-9", "2026-09-09")]
    } as unknown as BootstrapPayload;
    withStray.assignments[0] = { ...withStray.assignments[0], crewId: "c-gone" } as (typeof withStray.assignments)[number];

    const alerts = deriveScheduleAlerts(withStray, [job("j-1")], [], now);
    expect(alerts[0].title).toBe("A booking has no crew");
    expect(alerts[0].detail).toBe("j-1 on Sep 9 is booked to a crew this workspace no longer has — no board can show it.");
    expect(alerts[0].tone).toBe("danger");
    expect(alerts[0].link).toEqual({ page: "month", weekStart: "2026-09-07" });

    // and it is still raised when the page is filtered somewhere else entirely
    const filteredAway = deriveScheduleAlerts(withStray, [], [], now);
    expect(filteredAway.map((alert) => alert.title)).toContain("A booking has no crew");

    // several read as several
    const two = {
      ...withStray,
      assignments: [...withStray.assignments, { ...withStray.assignments[0], id: "a-10" }]
    } as unknown as BootstrapPayload;
    const many = deriveScheduleAlerts(two, [job("j-1")], [], now);
    expect(many[0].title).toBe("2 bookings have no crew");
    expect(many[0].detail).toContain("and 1 more like it");

    // a workspace whose bookings all have crews says nothing about it
    expect(deriveScheduleAlerts(data, [job("j-1")], [], now).map((alert) => alert.title)).not.toContain("A booking has no crew");
  });

  it("counts down rather than up, and refuses to guess", () => {
    const at = (iso: string, from: string) => relativeTime(iso, new Date(from));
    expect(at("2026-09-09T11:59:10.000Z", "2026-09-09T12:00:00.000Z")).toBe("1m ago"); // never "0m"
    expect(at("2026-09-09T11:00:30.000Z", "2026-09-09T12:00:00.000Z")).toBe("59m ago");
    expect(at("2026-09-09T10:29:00.000Z", "2026-09-09T12:00:00.000Z")).toBe("1h ago"); // 1h31m, not 2h
    expect(at("2026-09-06T13:00:00.000Z", "2026-09-09T12:00:00.000Z")).toBe("2d ago"); // 2d23h, not 3d
    expect(at("2026-09-11T12:00:00.000Z", "2026-09-09T12:00:00.000Z")).toBe("in 2d");
    expect(relativeTime(null, new Date("2026-09-09T12:00:00.000Z"))).toBeNull();
    expect(at("not a date", "2026-09-09T12:00:00.000Z")).toBeNull();
  });
});
