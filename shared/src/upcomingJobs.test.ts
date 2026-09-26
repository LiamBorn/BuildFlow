/** The Mac's Jobs tab: today and the next six days, projects you manage first. */
import { describe, expect, it } from "vitest";
import { inboxData, TODAY } from "./__tests__/inboxFixture";
import { addIsoDays, isWorkday, upcomingJobs } from "./upcomingJobs";

describe("upcoming jobs", () => {
  it("lists each job once, at the next day it is worked, projects I manage first", () => {
    const rows = upcomingJobs(inboxData(), { today: TODAY });
    expect(rows.map((row) => [row.name, row.date, row.mine])).toEqual([
      ["Footings pour", "2026-09-26", true],
      ["Curbs", "2026-09-30", true],
      ["Framing, level 2", "2026-09-26", false],
      ["Site grading", "2026-09-28", false]
    ]);
  });

  it("says when, who and how it stands: the job's clock, the crews booked that day, its status", () => {
    const [footings, curbs, framing] = upcomingJobs(inboxData(), { today: TODAY });
    expect(footings).toMatchObject({
      id: "j-footings",
      project: "Maple St. Plaza",
      projectId: "p-maple",
      start: "07:00",
      end: "15:30",
      crews: ["Crew 2"],
      crewIds: ["c2"],
      status: "Confirmed",
      days: ["2026-09-26"]
    });
    // two crews on one job, a running job read as today, and every day it has in the window
    expect(framing).toMatchObject({ start: "07:30", crews: ["Crew 4", "Crew 2"], status: "In Progress" });
    expect(framing.days).toHaveLength(7);
    // a time that cannot be read is null, never a made-up 7:00
    expect(curbs).toMatchObject({ start: null, end: null, crews: [] });
  });

  it("flags the day WeatherIQ has weather in the job's hours", () => {
    const rows = upcomingJobs(inboxData(), { today: TODAY });
    expect(rows.find((row) => row.id === "j-footings")?.weather).toEqual({
      severity: "hold",
      cause: "rain",
      status: "open",
      reason: "0.30 in of rain",
      start: "2026-09-26T14:00",
      end: "2026-09-26T15:30",
      conflictId: "wx-j-footings-2026-09-26"
    });
    expect(rows.find((row) => row.id === "j-grading")?.weather).toMatchObject({ severity: "watch", cause: "wind" });
    expect(rows.find((row) => row.id === "j-framing")?.weather).toBeNull();
  });

  it("puts a job on the day its crew comes, not on a Sunday nobody works", () => {
    const grading = upcomingJobs(inboxData(), { today: TODAY }).find((row) => row.id === "j-grading");
    // it starts Sunday the 27th, and its crew is booked Monday the 28th
    expect(grading).toMatchObject({ date: "2026-09-28", crews: ["Crew 2"] });

    const data = inboxData();
    data.assignments = data.assignments.filter((booking) => booking.jobId !== "j-grading");
    // unbooked: its first WORKING day, not the Sunday it nominally starts on
    expect(upcomingJobs(data, { today: TODAY }).find((row) => row.id === "j-grading")).toMatchObject({ date: "2026-09-28", crews: [] });
  });

  it("leaves out what is complete and what is past the week", () => {
    const ids = upcomingJobs(inboxData(), { today: TODAY }).map((row) => row.id);
    expect(ids).not.toContain("j-done");
    expect(ids).not.toContain("j-later");
    expect(upcomingJobs(inboxData(), { today: TODAY, days: 14 }).map((row) => row.id)).toContain("j-later");
  });

  it("reads 'mine' for whoever asks, and can be cut short", () => {
    const forCarlos = upcomingJobs(inboxData(), { today: TODAY, userId: "u-carlos" });
    expect(forCarlos[0]).toMatchObject({ id: "j-framing", mine: true });
    expect(upcomingJobs(inboxData(), { today: TODAY, limit: 2 })).toHaveLength(2);
  });

  it("counts days on the calendar, whatever the clocks do", () => {
    expect(addIsoDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addIsoDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isWorkday("2026-09-27", { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] })).toBe(false);
    expect(isWorkday("2026-12-25", { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: "2026-12-25", name: "Christmas Day" }] })).toBe(
      false
    );
    expect(isWorkday("2026-09-27")).toBe(true);
  });
});
