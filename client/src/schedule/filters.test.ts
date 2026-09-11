import { describe, expect, it } from "vitest";
import type { Crew, Job, Project, ScheduleAssignment } from "@buildflow/shared";
import { EMPTY_SCHEDULE_CONTEXT, SCHEDULE_STATUSES, parseScheduleHash } from "./useScheduleContext";
import { applyScheduleFilters, bookingsWithoutCrew, scheduleFilterChips, scheduleRegions } from "./filters";

const job = (id: string, extra: Partial<Job> = {}): Job =>
  ({
    id,
    projectId: "p-1",
    name: id,
    location: "East Austin",
    status: "Planned",
    startDate: "2026-09-07",
    endDate: "2026-09-08",
    ...extra
  }) as Job;
const crew = (id: string, specialty: string): Crew => ({ id, name: id, specialty }) as Crew;
const booking = (id: string, jobId: string, crewId: string, status: ScheduleAssignment["status"] = "Planned"): ScheduleAssignment =>
  ({ id, jobId, crewId, date: "2026-09-07", status, conflicts: [] }) as unknown as ScheduleAssignment;

const data = {
  projects: [
    { id: "p-1", name: "Pinecrest" },
    { id: "p-2", name: "Riverside" }
  ] as Project[],
  crews: [crew("c-1", "Trenching"), crew("c-2", "Backfill")],
  jobs: [job("j-1"), job("j-2", { projectId: "p-2", location: "Riverside", status: "In Progress" }), job("j-3", { status: "Complete" })],
  assignments: [booking("a-1", "j-1", "c-1"), booking("a-2", "j-2", "c-2", "In Progress"), booking("a-3", "j-1", "c-2", "Confirmed")]
};

describe("schedule filters", () => {
  it("shows everything when nothing is set", () => {
    const scope = applyScheduleFilters(data, EMPTY_SCHEDULE_CONTEXT);
    expect(scope.jobs.map((item) => item.id)).toEqual(["j-1", "j-2", "j-3"]);
    expect(scope.assignments).toHaveLength(3);
    expect(scope.crews).toHaveLength(2);
    expect(scheduleFilterChips(EMPTY_SCHEDULE_CONTEXT, data)).toEqual([]);
  });

  it("narrows jobs by project, region and the status set, and bookings with them", () => {
    expect(applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, projectId: "p-2" }).jobs.map((item) => item.id)).toEqual(["j-2"]);
    expect(applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, region: "Riverside" }).jobs.map((item) => item.id)).toEqual(["j-2"]);
    const scope = applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, statuses: ["Planned", "Confirmed"] });
    expect(scope.jobs.map((item) => item.id)).toEqual(["j-1"]);
    expect(scope.assignments.map((item) => item.id)).toEqual(["a-1", "a-3"]);
  });

  it("narrows crews by type or crew, and the jobs to work booked on them", () => {
    const byType = applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, crewType: "Backfill" });
    expect(byType.crews.map((item) => item.id)).toEqual(["c-2"]);
    expect(byType.jobs.map((item) => item.id)).toEqual(["j-1", "j-2"]);
    expect(byType.assignments.map((item) => item.id)).toEqual(["a-2", "a-3"]);
    const byCrew = applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, crewId: "c-1" });
    expect(byCrew.jobs.map((item) => item.id)).toEqual(["j-1"]);
    expect(byCrew.assignments.map((item) => item.id)).toEqual(["a-1"]);
  });

  it("keeps every status for the Kanban, and ignores what the workspace does not have", () => {
    const kanban = applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, statuses: ["Planned"] }, { statuses: false });
    expect(kanban.jobs).toHaveLength(3);
    const stale = applyScheduleFilters(data, {
      ...EMPTY_SCHEDULE_CONTEXT,
      projectId: "gone",
      crewType: "Concrete",
      region: "Mars",
      crewId: "nobody"
    });
    expect(stale.jobs).toHaveLength(3);
    expect(stale.crews).toHaveLength(2);
    expect(scheduleFilterChips({ ...EMPTY_SCHEDULE_CONTEXT, projectId: "gone" }, data)).toEqual([]);
  });

  it("describes the active filters as chips that clear themselves", () => {
    const chips = scheduleFilterChips(
      { ...EMPTY_SCHEDULE_CONTEXT, projectId: "p-1", crewType: "Trenching", statuses: ["Planned", "Confirmed", "Ready"] },
      data
    );
    expect(chips.map((chip) => chip.label)).toEqual(["Pinecrest", "Trenching", "3 of 10 statuses"]);
    expect(chips[0].clear).toEqual({ projectId: null });
    expect(scheduleRegions(data.jobs)).toEqual(["East Austin", "Riverside"]);
  });

  it("keeps a status filter that a link repeats", () => {
    // A filter naming every status means no filter, and that is decided by counting the list —
    // so ten copies of one status counted as ten and quietly showed the whole board.
    const repeated = Array(SCHEDULE_STATUSES.length).fill("Planned").join(",");
    const parsed = parseScheduleHash(`#schedule/week?status=${repeated}`);
    expect(parsed?.patch.statuses).toEqual(["Planned"]);

    const context = { ...EMPTY_SCHEDULE_CONTEXT, statuses: parsed?.patch.statuses ?? null };
    expect(applyScheduleFilters(data, context).jobs.map((item) => item.id)).toEqual(["j-1"]);
    expect(scheduleFilterChips(context, data).map((chip) => chip.label)).toEqual(["Planned"]);

    // naming all ten really does mean all ten
    const everyStatus = parseScheduleHash(`#schedule/week?status=${SCHEDULE_STATUSES.join(",")}`);
    expect(everyStatus?.patch.statuses).toHaveLength(SCHEDULE_STATUSES.length);
    expect(
      applyScheduleFilters(data, { ...EMPTY_SCHEDULE_CONTEXT, statuses: everyStatus?.patch.statuses ?? null }).filters.statuses
    ).toBeNull();
  });

  it("finds the bookings whose crew the workspace no longer has", () => {
    const stray = booking("a-4", "j-1", "c-gone");
    const withStray = { ...data, assignments: [...data.assignments, stray] };
    expect(bookingsWithoutCrew(withStray).map((item) => item.id)).toEqual(["a-4"]);
    // it is still dropped from the board, which is why something has to say it is there
    expect(applyScheduleFilters(withStray, EMPTY_SCHEDULE_CONTEXT).assignments.map((item) => item.id)).not.toContain("a-4");
    // a crew filter hides bookings on purpose; those are not strays
    expect(bookingsWithoutCrew(data)).toEqual([]);
  });
});
