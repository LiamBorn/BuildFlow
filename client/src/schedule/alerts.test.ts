import { describe, expect, it } from "vitest";
import type { BootstrapPayload, Job, ScheduleAssignment } from "@buildflow/shared";
import { deriveScheduleAlerts } from "./alerts";

const data = {
  projects: [{ id: "p-1", name: "Pinecrest" }],
  crews: [{ id: "c-1", name: "Trenching Crew 2" }],
  delayIQs: [{ id: "d-1", title: "Permit slipped", status: "Open", projectId: "p-1", impactDays: 3 }],
  weatherAlerts: [],
  jobs: [],
  assignments: []
} as unknown as BootstrapPayload;
const job = (id: string, extra: Partial<Job> = {}): Job =>
  ({ id, name: id, phase: "Trenching", startDate: "2026-09-09", materialsStatus: "Delivered", ...extra }) as Job;
const booking = (id: string, date: string, conflicts: string[] = []): ScheduleAssignment =>
  ({ id, jobId: "j-1", crewId: "c-1", date, conflicts }) as unknown as ScheduleAssignment;

describe("schedule alerts", () => {
  it("raises the same alerts for what is in view, each with a place to go", () => {
    const alerts = deriveScheduleAlerts(
      data,
      [job("j-1"), job("j-2", { materialsStatus: "Missing" })],
      [booking("a-1", "2026-09-09", ["a-2"])]
    );
    expect(alerts.map((alert) => alert.title)).toEqual(["Double-booked crew", "Permit slipped", "Missing materials"]);
    expect(alerts[0].detail).toBe("Trenching Crew 2 conflicts on Sep 9.");
    expect(alerts[0].link).toEqual({ page: "week", weekStart: "2026-09-07" });
    expect(alerts[1].link).toEqual({ page: "delayIQs" });
    expect(alerts[2].link).toEqual({ page: "materials" });
  });

  it("is quiet when the view has nothing wrong", () => {
    expect(deriveScheduleAlerts({ ...data, delayIQs: [] } as BootstrapPayload, [job("j-1")], [booking("a-1", "2026-09-09")])).toEqual([]);
  });
});
