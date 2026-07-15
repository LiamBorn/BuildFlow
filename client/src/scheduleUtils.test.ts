import { describe, expect, it } from "vitest";
import { bootstrapFixture } from "./test/fixture";
import { assignmentsForCell, getUnassignedJobs } from "./scheduleUtils";

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
