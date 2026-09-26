/** The Mac's Tasks tab: what is waiting on you, derived from what BuildFlow already keeps. */
import { describe, expect, it } from "vitest";
import { inboxData, TODAY } from "./__tests__/inboxFixture";
import { needsYou, type PendingTimeEntry } from "./needsYou";

describe("what is waiting on you", () => {
  it("gives the owner their own projects' decisions, and the ones nobody else there can make, soonest first", () => {
    const tasks = needsYou(inboxData(), { today: TODAY });
    expect(tasks.map((task) => task.id)).toEqual([
      "readiness-r-late",
      "variance-v-maple",
      // Oak Ridge is Carlos's, but a Member cannot resolve a variance: it comes to whoever can
      "variance-v-oak",
      "weather-call-wx-j-footings-2026-09-26",
      "unbooked-j-curbs",
      "readiness-r-permit"
    ]);
  });

  it("gives a schedule change its two answers, through the endpoints the Dashboard uses", () => {
    const change = needsYou(inboxData(), { today: TODAY }).find((task) => task.id === "variance-v-maple")!;
    expect(change).toMatchObject({
      kind: "schedule-change",
      title: "Schedule change: Footings pour",
      detail: "Maple St. Plaza · Field report · 2 working days later, critical path",
      projectId: "p-maple",
      due: "2026-09-26",
      tone: "red",
      target: { kind: "variance", id: "v-maple" }
    });
    expect(change.actions).toEqual([
      {
        id: "accept",
        label: "Accept",
        capability: "variance.resolve",
        request: { method: "POST", path: "/api/schedule/variances/v-maple/accept", body: { userId: "u-liam" } }
      },
      {
        id: "reject",
        label: "Reject",
        capability: "variance.resolve",
        request: { method: "POST", path: "/api/schedule/variances/v-maple/reject", body: { userId: "u-liam" } }
      }
    ]);
  });

  it("asks the person in charge to call the rain day, by the time the weather reaches the job", () => {
    const call = needsYou(inboxData(), { today: TODAY }).find((task) => task.kind === "weather-call")!;
    expect(call).toMatchObject({
      title: "Call the rain day",
      detail: "Footings pour · Maple St. Plaza · Rain: 0.30 in of rain, Saturday 2–3:30 PM",
      due: "2026-09-26T14:00",
      tone: "red",
      target: { kind: "weatherConflict", id: "wx-j-footings-2026-09-26" }
    });
    expect(call.actions.map((action) => [action.id, action.label, action.request.path])).toEqual([
      ["cancel", "Call it off", "/api/weather/conflicts/wx-j-footings-2026-09-26/cancel"],
      ["keep", "Keep it on", "/api/weather/conflicts/wx-j-footings-2026-09-26/keep"]
    ]);
    // a day already gone is not a decision any more
    expect(needsYou(inboxData(), { today: TODAY }).some((task) => task.id.includes("wx-old"))).toBe(false);
  });

  it("lists readiness items due this week or overdue, with nothing to press — they are ticked off on the website", () => {
    const tasks = needsYou(inboxData(), { today: TODAY }).filter((task) => task.kind === "readiness");
    expect(tasks.map((task) => [task.title, task.due, task.tone, task.actions.length])).toEqual([
      ["Survey stakes", "2026-09-20", "red", 0],
      ["Permit posted on site", "2026-10-02", "slate", 0]
    ]);
    expect(tasks[0].detail).toBe("Maple St. Plaza · Readiness · overdue");
  });

  it("flags a job in the coming week with no crew on any of its days, and says what booking one needs", () => {
    const unbooked = needsYou(inboxData(), { today: TODAY }).find((task) => task.kind === "unbooked-job")!;
    expect(unbooked).toMatchObject({ title: "No crew on Curbs", due: "2026-09-30", tone: "amber", target: { kind: "job", id: "j-curbs" } });
    expect(unbooked.actions).toEqual([
      {
        id: "book",
        label: "Book a crew",
        capability: "assignments.write",
        request: { method: "POST", path: "/api/schedule/assign", body: { jobId: "j-curbs", date: "2026-09-30" }, needs: ["crewId"] }
      }
    ]);
  });

  it("gives a Member what is theirs to do and nothing they cannot act on", () => {
    const carlos = needsYou(inboxData(), { today: TODAY, userId: "u-carlos", permission: "member" });
    expect(carlos.map((task) => task.id)).toEqual(["readiness-r-oak"]);
  });

  it("gives an Admin their own project's weather, and the decisions the Member manager cannot make", () => {
    const ana = needsYou(inboxData(), { today: TODAY, userId: "u-ana", permission: "admin" });
    expect(ana.map((task) => task.id)).toEqual(["variance-v-oak", "weather-call-wx-j-grading-2026-09-28"]);
    expect(ana[1]).toMatchObject({ title: "Call the wind day", tone: "amber" });
  });

  it("goes by the server's own permission check when it is given one", () => {
    const tasks = needsYou(inboxData(), { today: TODAY, can: () => false });
    expect(tasks.map((task) => task.kind)).toEqual(["readiness", "readiness"]);
  });

  it("groups submitted time into one card per person per week, for whoever approves time", () => {
    const entries: PendingTimeEntry[] = [
      { id: "e1", userId: "u-carlos", date: "2026-09-21", status: "Submitted" },
      { id: "e2", userId: "u-carlos", date: "2026-09-22", status: "Submitted" },
      { id: "e3", userId: "u-ana", date: "2026-09-23", status: "Submitted" },
      { id: "e4", userId: "u-ana", date: "2026-09-23", status: "Approved" },
      { id: "e5", userId: "u-carlos", date: "2026-09-14", status: "Submitted" }
    ];
    const cards = needsYou(inboxData(), { today: TODAY, timeEntries: entries }).filter((task) => task.kind === "time-cards");
    expect(cards.map((task) => [task.title, task.detail, task.due, task.tone])).toEqual([
      // last week's, not approved yet: due now
      ["Approve 1 time card", "Week of Sep 14 · Time cards · 1 entry", "2026-09-26", "amber"],
      ["Approve 2 time cards", "Week of Sep 21 · Time cards · 3 entries", "2026-09-27", "slate"]
    ]);
    expect(cards[1].actions[0].request).toEqual({ method: "POST", path: "/api/time-entries/approve", body: { ids: ["e1", "e2", "e3"] } });
    // a Member does not approve time, so has none of it
    expect(
      needsYou(inboxData(), { today: TODAY, userId: "u-carlos", permission: "member", timeEntries: entries }).some(
        (task) => task.kind === "time-cards"
      )
    ).toBe(false);
  });

  it("sends a project with no manager to whoever can act", () => {
    const data = inboxData();
    data.projects = data.projects.map((project) => (project.id === "p-maple" ? { ...project, managerId: "" } : project));
    const ana = needsYou(data, { today: TODAY, userId: "u-ana", permission: "admin" }).map((task) => task.id);
    expect(ana).toContain("variance-v-maple");
    expect(ana).toContain("unbooked-j-curbs");
    expect(ana).toContain("readiness-r-permit");
  });

  it("is gone the moment the thing is done", () => {
    const data = inboxData();
    data.variances = data.variances.map((variance) => ({ ...variance, status: "accepted" as const }));
    data.weatherConflicts = data.weatherConflicts!.map((conflict) => ({ ...conflict, status: "kept" as const }));
    data.readiness = data.readiness.map((item) => ({ ...item, complete: true }));
    data.assignments.push({ id: "a9", jobId: "j-curbs", crewId: "c2", date: "2026-09-30", status: "Planned", conflicts: [] });
    expect(needsYou(data, { today: TODAY })).toEqual([]);
  });
});
