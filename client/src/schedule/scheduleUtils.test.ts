import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapFixture } from "../test/fixture";
import { assignmentsForCell, getUnassignedJobs, shiftScheduleDate, toLocalIsoDate } from "./scheduleUtils";

describe("schedule utilities", () => {
  it("finds jobs that are ready for drag assignment", () => {
    const unassigned = getUnassignedJobs(bootstrapFixture.jobs, bootstrapFixture.assignments);

    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].id).toBe("j-unassigned");
  });

  it("finds assignments for a crew-day cell", () => {
    const cellAssignments = assignmentsForCell(bootstrapFixture.assignments, "crew-concrete", "2026-06-15");

    expect(cellAssignments).toHaveLength(1);
    expect(cellAssignments[0].jobId).toBe("j-riverside-concrete");
  });
});

describe("calendar-day maths", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("formats a Date's local day, not its UTC day", () => {
    vi.stubEnv("TZ", "Australia/Sydney");
    const localMidnight = new Date(2026, 8, 9, 0, 0, 0);
    expect(toLocalIsoDate(localMidnight)).toBe("2026-09-09");
    // the bug this guards against: east of Greenwich, the UTC day is still yesterday
    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("shifts whole days east of Greenwich", () => {
    vi.stubEnv("TZ", "Australia/Sydney");
    expect(shiftScheduleDate("2026-09-08", 1)).toBe("2026-09-09");
    expect(shiftScheduleDate("2026-09-08", -1)).toBe("2026-09-07");
    expect(shiftScheduleDate("2026-09-08", 7)).toBe("2026-09-15");
  });

  it("shifts whole days across a daylight-saving change", () => {
    vi.stubEnv("TZ", "America/Chicago"); // clocks change 2026-03-08 and 2026-11-01
    expect(shiftScheduleDate("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftScheduleDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftScheduleDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftScheduleDate("2026-11-01", 1)).toBe("2026-11-02");
  });
});
