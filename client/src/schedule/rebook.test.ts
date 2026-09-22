import { describe, expect, it } from "vitest";
import type { ScheduleAssignment } from "@buildflow/shared";
import { daysBetween, jobMove, monthRebook } from "./rebook";

const booking = (id: string, jobId: string, crewId: string, date: string): ScheduleAssignment =>
  ({ id, jobId, crewId, date, status: "Planned", conflicts: [] }) as unknown as ScheduleAssignment;
const assignments = [
  booking("a-1", "j-1", "c-1", "2026-09-07"),
  booking("a-2", "j-1", "c-2", "2026-09-08T00:00:00.000Z"),
  booking("a-3", "j-2", "c-1", "2026-09-09")
];

describe("monthRebook", () => {
  const job = { id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09" };
  it("shifts the job and every one of its bookings by the same number of days", () => {
    const plan = monthRebook(job, assignments, "2026-09-14");
    expect(plan?.delta).toBe(7);
    expect(plan?.moves).toEqual([
      { op: "job", id: "j-1", startDate: "2026-09-14", endDate: "2026-09-16" },
      { op: "move", id: "a-1", date: "2026-09-14" },
      { op: "move", id: "a-2", date: "2026-09-15" }
    ]);
    expect(plan?.inverse).toEqual([
      { op: "job", id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09" },
      { op: "move", id: "a-1", date: "2026-09-07" },
      { op: "move", id: "a-2", date: "2026-09-08" }
    ]);
  });
  it("moves backwards too, and leaves other jobs' bookings alone", () => {
    const plan = monthRebook(job, assignments, "2026-09-01");
    expect(plan?.delta).toBe(-6);
    expect(plan?.moves.map((move) => ("id" in move ? move.id : ""))).toEqual(["j-1", "a-1", "a-2"]);
  });
  it("is a no-op on the job's own start day", () => {
    expect(monthRebook(job, assignments, "2026-09-07")).toBeNull();
  });
  it("counts calendar days across a daylight-saving change", () => {
    expect(daysBetween("2026-03-06", "2026-03-13")).toBe(7);
    expect(daysBetween("2026-11-06", "2026-10-30")).toBe(-7);
    expect(monthRebook({ id: "j-1", startDate: "2026-03-06", endDate: "2026-03-08" }, [], "2026-03-13")?.moves).toEqual([
      { op: "job", id: "j-1", startDate: "2026-03-13", endDate: "2026-03-15" }
    ]);
  });
});

describe("jobMove", () => {
  const job = { id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09", status: "Planned" as const, notes: "old note" };

  it("carries the job's bookings when both dates move by the same number of days, with the other changes on the job step", () => {
    const move = jobMove(job, assignments, { startDate: "2026-09-14", endDate: "2026-09-16", status: "Confirmed", notes: "" });
    expect(move?.delta).toBe(7);
    expect(move?.moves).toEqual([
      { op: "job", id: "j-1", startDate: "2026-09-14", endDate: "2026-09-16", status: "Confirmed", notes: "" },
      { op: "move", id: "a-1", date: "2026-09-14" },
      { op: "move", id: "a-2", date: "2026-09-15" }
    ]);
    expect(move?.inverse).toEqual([
      { op: "job", id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09", status: "Planned", notes: "old note" },
      { op: "move", id: "a-1", date: "2026-09-07" },
      { op: "move", id: "a-2", date: "2026-09-08" }
    ]);
  });

  it("leaves a field that was empty out of the way back", () => {
    const move = jobMove({ id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09" }, assignments, {
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      notes: "new"
    });
    expect(move?.moves[0]).toEqual({ op: "job", id: "j-1", startDate: "2026-09-14", endDate: "2026-09-16", notes: "new" });
    expect(move?.inverse[0]).toEqual({ op: "job", id: "j-1", startDate: "2026-09-07", endDate: "2026-09-09" });
  });

  it("is a plain edit when the window changes length, only one date moves, or the dates stay", () => {
    expect(jobMove(job, assignments, { startDate: "2026-09-07", endDate: "2026-09-12" })).toBeNull();
    expect(jobMove(job, assignments, { startDate: "2026-09-08" })).toBeNull();
    expect(jobMove(job, assignments, { status: "On Site" })).toBeNull();
  });

  it("is a plain edit for a job with nothing booked", () => {
    expect(jobMove({ ...job, id: "j-9" }, assignments, { startDate: "2026-09-14", endDate: "2026-09-16" })).toBeNull();
  });
});
