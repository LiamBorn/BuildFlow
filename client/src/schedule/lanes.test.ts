import { describe, expect, it } from "vitest";
import { SCHEDULE_STATUSES } from "./useScheduleContext";
import { KANBAN_LANES, kanbanLaneOf, kanbanMove } from "./lanes";

describe("KANBAN_LANES", () => {
  it("gives every schedule status exactly one lane", () => {
    for (const status of SCHEDULE_STATUSES) {
      const lanes = KANBAN_LANES.filter((lane) => lane.match.includes(status)).map((lane) => lane.key);
      expect(lanes, status).toEqual([kanbanLaneOf(status)?.key]);
    }
  });
  it("names five lanes, each dropping to its own status", () => {
    expect(KANBAN_LANES.map((lane) => lane.key)).toEqual(["planned", "ready", "progress", "blocked", "done"]);
    for (const lane of KANBAN_LANES) expect(lane.match).toContain(lane.status);
  });
});

describe("kanbanMove", () => {
  it("moves a job to the lane's status", () => {
    expect(kanbanMove("Planned", "Complete")).toBe("Complete");
    expect(kanbanMove("Confirmed", "In Progress")).toBe("In Progress");
    expect(kanbanMove(undefined, "DelayIQed")).toBe("DelayIQed");
  });
  it("does nothing for a drop back into the job's own lane, or off the board", () => {
    expect(kanbanMove("Not Started", "Planned")).toBeNull();
    expect(kanbanMove("On Site", "In Progress")).toBeNull();
    expect(kanbanMove("Ready", "Confirmed")).toBeNull(); // Confirmed is a status, not a lane
    expect(kanbanMove("Ready", undefined)).toBeNull();
  });
});
