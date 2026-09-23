/**
 * The called-off days the Schedule pages mark (callOffs.tsx): which conflicts count, and the words.
 */
import { describe, expect, it } from "vitest";
import type { BootstrapPayload, Job, ScheduleVariance, WeatherConflict } from "@buildflow/shared";
import { allCalledOff, callOffCaption, callOffSentence, callOffTag, deriveCallOffs, jobCallOffs } from "./callOffs";

const job = (id: string, startDate: string, endDate: string): Job => ({ id, name: id, startDate, endDate }) as Job;
const conflict = (jobId: string, date: string, status: WeatherConflict["status"], varianceId?: string): WeatherConflict => ({
  id: `wx-${jobId}-${date}`,
  jobId,
  projectId: "p-1",
  date,
  cause: "rain",
  severity: "hold",
  start: `${date}T09:00`,
  end: `${date}T12:00`,
  reason: "Heavy rain",
  assigneeId: "",
  status,
  detectedAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
  ...(varianceId ? { varianceId } : {})
});

const data = (weatherConflicts: WeatherConflict[], variances: Partial<ScheduleVariance>[] = []) =>
  ({
    jobs: [job("j-1", "2026-09-24", "2026-09-26"), job("j-2", "2026-09-25", "2026-09-25")],
    variances,
    weatherConflicts
  }) as unknown as Pick<BootstrapPayload, "jobs" | "variances" | "weatherConflicts">;

describe("called-off days", () => {
  it("counts a day called off while the job still covers it, and nothing else", () => {
    const callOffs = deriveCallOffs(
      data([
        conflict("j-1", "2026-09-25", "cancelled"),
        // still open, or kept on: not called off
        conflict("j-1", "2026-09-24", "open"),
        conflict("j-2", "2026-09-25", "kept"),
        // the job has moved off this day (an accepted reschedule), or is gone
        conflict("j-1", "2026-09-23", "cancelled"),
        conflict("j-gone", "2026-09-25", "cancelled")
      ]),
      "2026-09-23"
    );
    expect(jobCallOffs(callOffs, "j-1").map((callOff) => callOff.date)).toEqual(["2026-09-25"]);
    expect(jobCallOffs(callOffs, "j-2")).toEqual([]);
    expect(callOffs.byJobDay.get("j-1|2026-09-25")).toMatchObject({ cause: "rain", reschedulePending: false });
    expect(callOffs.byJobDay.has("j-1|2026-09-24")).toBe(false);
    expect(callOffs.today).toBe("2026-09-23");
  });

  it("says when the reschedule it raised is still waiting on a decision", () => {
    const callOffs = deriveCallOffs(
      data([conflict("j-2", "2026-09-25", "cancelled", "v-1")], [{ id: "v-1", status: "pending" }]),
      "2026-09-23"
    );
    expect(callOffs.byJobDay.get("j-2|2026-09-25")?.reschedulePending).toBe(true);
  });

  it("reads nothing from a payload with no conflicts, or a malformed one", () => {
    expect(deriveCallOffs(data([]), "2026-09-23").byJob.size).toBe(0);
    const junk = { jobs: [], variances: [], weatherConflicts: [null, { id: 5 }] } as unknown as Pick<
      BootstrapPayload,
      "jobs" | "variances" | "weatherConflicts"
    >;
    expect(deriveCallOffs(junk, "2026-09-23").byJob.size).toBe(0);
  });

  it("calls a job wholly called off only when every day of it is", () => {
    const callOffs = deriveCallOffs(
      data([conflict("j-2", "2026-09-25", "cancelled"), conflict("j-1", "2026-09-25", "cancelled")]),
      "2026-09-23"
    );
    // a one-day job whose day is off is not happening as planned at all…
    expect(allCalledOff(job("j-2", "2026-09-25", "2026-09-25"), jobCallOffs(callOffs, "j-2"))).toBe(true);
    // …one day of three is: the job is still on
    expect(allCalledOff(job("j-1", "2026-09-24", "2026-09-26"), jobCallOffs(callOffs, "j-1"))).toBe(false);
    expect(allCalledOff(job("j-1", "2026-09-24", "2026-09-26"), [])).toBe(false);
  });

  it("puts it in words", () => {
    const callOffs = deriveCallOffs(
      data([conflict("j-1", "2026-09-25", "cancelled"), conflict("j-1", "2026-09-26", "cancelled")]),
      "2026-09-23"
    );
    const [first] = jobCallOffs(callOffs, "j-1");
    expect(callOffCaption([first], "2026-09-23")).toBe("Called off Fri · rain");
    expect(callOffCaption([first], "2026-09-25")).toBe("Called off today · rain");
    expect(callOffCaption(jobCallOffs(callOffs, "j-1"), "2026-09-23")).toBe("Called off 2 days");
    expect(callOffSentence(first)).toBe("Called off Fri, Sep 25 for rain.");
    expect(callOffTag([first], "2026-09-23")).toBe("Called off Fri");
    expect(callOffTag([first], "2026-09-25")).toBe("Called off today");
    expect(callOffTag(jobCallOffs(callOffs, "j-1"), "2026-09-23")).toBe("Called off 2 days");
    expect(callOffSentence({ ...first, reschedulePending: true })).toBe(
      "Called off Fri, Sep 25 for rain; the reschedule is waiting on a decision."
    );
  });
});
