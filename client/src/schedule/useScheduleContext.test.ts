import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_SCHEDULE_CONTEXT,
  parseScheduleHash,
  readScheduleContext,
  scheduleHash,
  writeScheduleContext,
  type ScheduleContext
} from "./useScheduleContext";

describe("schedule context storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("is empty until something is written", () => {
    expect(readScheduleContext("u-1")).toEqual(EMPTY_SCHEDULE_CONTEXT);
  });

  it("merges patches and keeps them per user", () => {
    writeScheduleContext("u-1", { weekStart: "2026-07-20" });
    writeScheduleContext("u-1", { projectId: "p-1" });
    // the month keeps the week company (see below)
    expect(readScheduleContext("u-1")).toEqual({
      ...EMPTY_SCHEDULE_CONTEXT,
      weekStart: "2026-07-20",
      monthAnchor: "2026-07-01",
      projectId: "p-1"
    });
    expect(readScheduleContext("u-2")).toEqual(EMPTY_SCHEDULE_CONTEXT);
  });

  it("clears a filter with null", () => {
    writeScheduleContext("u-1", { crewType: "Concrete" });
    writeScheduleContext("u-1", { crewType: null });
    expect(readScheduleContext("u-1").crewType).toBeNull();
  });

  it("shrugs off a corrupt entry", () => {
    window.localStorage.setItem("bf:schedule:context:u-1", "{not json");
    expect(readScheduleContext("u-1")).toEqual(EMPTY_SCHEDULE_CONTEXT);
  });
});

describe("schedule deep links", () => {
  it("builds a link from the parts of the context a page uses", () => {
    const context = {
      ...EMPTY_SCHEDULE_CONTEXT,
      weekStart: "2026-07-13",
      monthAnchor: "2026-07-01",
      crewType: "Concrete",
      crewId: "c-1",
      projectId: "p-1",
      region: "East Austin",
      statuses: ["Planned", "Confirmed"] as ScheduleContext["statuses"]
    };
    expect(scheduleHash("week", context)).toBe(
      "#schedule/week?w=2026-07-13&project=p-1&crewType=Concrete&crew=c-1&region=East+Austin&status=Planned%2CConfirmed"
    );
    expect(scheduleHash("month", context)).toBe(
      "#schedule/month?m=2026-07-01&project=p-1&crewType=Concrete&crew=c-1&region=East+Austin&status=Planned%2CConfirmed"
    );
    expect(scheduleHash("kanban", { ...EMPTY_SCHEDULE_CONTEXT, projectId: "p-1" })).toBe("#schedule/kanban?project=p-1");
    expect(scheduleHash("schedule", { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-07-13" })).toBe("#schedule?w=2026-07-13");
    expect(scheduleHash("gantt", EMPTY_SCHEDULE_CONTEXT)).toBe("#schedule/gantt");
  });

  it("reads a link back, ignoring what is malformed", () => {
    expect(parseScheduleHash("#schedule/week?w=2026-07-13&project=p-1&region=East+Austin&status=Planned,Confirmed,Nope")).toEqual({
      page: "week",
      patch: { weekStart: "2026-07-13", projectId: "p-1", region: "East Austin", statuses: ["Planned", "Confirmed"] }
    });
    expect(parseScheduleHash("#schedule?w=not-a-day&status=Nope")).toEqual({ page: "schedule", patch: {} });
    // the board's old view links open the page that view became
    expect(parseScheduleHash("#schedule?view=Kanban&project=p-1")).toEqual({ page: "kanban", patch: { projectId: "p-1" } });
    expect(parseScheduleHash("#schedule/nowhere")).toBeNull();
    expect(parseScheduleHash("#schedule-ai")).toBeNull();
    expect(parseScheduleHash("#updates")).toBeNull();
  });

  it("keeps only real statuses in what is stored", () => {
    window.localStorage.setItem(
      "bf:schedule:context:u-9",
      JSON.stringify({ statuses: ["Planned", "Bogus"], view: "Week", weekStart: "2026-07-13" })
    );
    expect(readScheduleContext("u-9")).toEqual({ ...EMPTY_SCHEDULE_CONTEXT, statuses: ["Planned"], weekStart: "2026-07-13" });
    expect(writeScheduleContext("u-9", { statuses: [] }).statuses).toBeNull();
  });
});

describe("the week and the month keep each other company", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves the month along with the week", () => {
    writeScheduleContext("u-1", { weekStart: "2026-06-22" });
    expect(readScheduleContext("u-1")).toMatchObject({ weekStart: "2026-06-22", monthAnchor: "2026-06-01" });
    writeScheduleContext("u-1", { weekStart: "2026-06-29" }); // Monday 29 June: still June, even though the week runs into July
    expect(readScheduleContext("u-1").monthAnchor).toBe("2026-06-01");
    writeScheduleContext("u-1", { weekStart: "2026-07-06" });
    expect(readScheduleContext("u-1").monthAnchor).toBe("2026-07-01");
  });

  it("brings the week to a month it was not in, and leaves it where it already is", () => {
    writeScheduleContext("u-1", { weekStart: "2026-06-22" });
    writeScheduleContext("u-1", { monthAnchor: "2026-10-01" });
    expect(readScheduleContext("u-1").weekStart).toBe("2026-09-28"); // the week that holds 1 October
    writeScheduleContext("u-1", { monthAnchor: "2026-09-01" }); // the week's Monday is in September already
    expect(readScheduleContext("u-1").weekStart).toBe("2026-09-28");
  });

  it("takes a patch that sets both as given, and a deep link the same way", () => {
    writeScheduleContext("u-1", { weekStart: "2026-11-02", monthAnchor: "2026-12-01" });
    expect(readScheduleContext("u-1")).toMatchObject({ weekStart: "2026-11-02", monthAnchor: "2026-12-01" });
    expect(parseScheduleHash("#schedule/month?m=2026-03-01")?.patch).toEqual({ monthAnchor: "2026-03-01" });
  });
});
