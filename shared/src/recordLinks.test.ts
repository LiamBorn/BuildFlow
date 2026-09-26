/** Links that open a record or a Dashboard panel on a cold load: one `#open/…` scheme, both ways. */
import { describe, expect, it } from "vitest";
import { inboxData, TODAY } from "./__tests__/inboxFixture";
import { buildNotificationItems } from "./notifications";
import { needsYou } from "./needsYou";
import { upcomingJobs } from "./upcomingJobs";
import {
  MEETINGS_LINK,
  jobLinkDestination,
  linkHash,
  linkUrl,
  parseLinkHash,
  taskLinkDestination,
  type LinkDestination
} from "./recordLinks";

describe("record links", () => {
  it("spells each kind of destination the way the plan's example does", () => {
    expect(linkHash({ kind: "record", page: "delayIQs", recordId: "d12" })).toBe("#open/delayIQs/d12");
    expect(linkHash({ kind: "record", page: "field", recordId: "fu-3" })).toBe("#open/field/fu-3");
    expect(linkHash({ kind: "record", page: "inventory", recordId: "m-2" })).toBe("#open/inventory/m-2");
    expect(linkHash({ kind: "panel", panelId: "weather" })).toBe("#open/dashboard/weather");
    expect(linkHash(MEETINGS_LINK)).toBe("#open/dashboard/meetings");
    expect(linkHash({ kind: "schedule", date: "2026-09-28", crewId: "c-2" })).toBe("#open/schedule/2026-09-28/c-2");
    expect(linkHash({ kind: "job", jobId: "j31", date: "2026-09-26" })).toBe("#open/job/j31?d=2026-09-26");
    expect(linkHash({ kind: "job", jobId: "j31" })).toBe("#open/job/j31");
    expect(linkHash({ kind: "timecard", week: "2026-09-21" })).toBe("#open/timecard/2026-09-21");
    expect(linkUrl("https://build-flow.replit.app/", { kind: "record", page: "delayIQs", recordId: "d12" })).toBe(
      "https://build-flow.replit.app/#open/delayIQs/d12"
    );
  });

  it("reads back every notification's destination exactly as the bell opens it", () => {
    const items = buildNotificationItems(inboxData(), Date.parse(`${TODAY}T14:00:00Z`));
    expect(new Set(items.map((item) => item.opens.kind))).toEqual(new Set(["record", "panel", "schedule"]));
    for (const item of items) expect(parseLinkHash(linkHash(item.opens)), item.id).toEqual(item.opens);
  });

  it("gives every task and job a link that reads back to where the website deals with it", () => {
    const tasks = needsYou(inboxData(), {
      today: TODAY,
      timeEntries: [{ id: "te-1", userId: "u-carlos", date: "2026-09-22", status: "Submitted" }]
    });
    expect(new Set(tasks.map((task) => task.kind))).toEqual(
      new Set(["schedule-change", "weather-call", "readiness", "unbooked-job", "time-cards"])
    );
    const where = Object.fromEntries(tasks.map((task) => [task.kind, taskLinkDestination(task)]));
    expect(where["schedule-change"]).toEqual({ kind: "panel", panelId: "approvals" });
    expect(where["weather-call"]).toEqual({ kind: "panel", panelId: "weather" });
    expect(where.readiness).toEqual({ kind: "panel", panelId: "readiness" });
    expect(where["unbooked-job"]).toMatchObject({ kind: "job", jobId: "j-curbs" });
    expect(where["time-cards"]).toEqual({ kind: "timecard", week: "2026-09-21" });
    for (const task of tasks) expect(parseLinkHash(linkHash(taskLinkDestination(task)))).toEqual(taskLinkDestination(task));

    for (const job of upcomingJobs(inboxData(), { today: TODAY })) {
      const destination = jobLinkDestination(job);
      expect(destination).toEqual({ kind: "job", jobId: job.id, date: job.date });
      expect(parseLinkHash(linkHash(destination))).toEqual(destination);
    }
  });

  it("carries any id through, escaped", () => {
    const odd: LinkDestination = { kind: "record", page: "field", recordId: "fu/1?x=2#y %" };
    expect(linkHash(odd)).toBe("#open/field/fu%2F1%3Fx%3D2%23y%20%25");
    expect(parseLinkHash(linkHash(odd))).toEqual(odd);
    const crew: LinkDestination = { kind: "schedule", date: "2026-09-28", crewId: "crew 2/a" };
    expect(parseLinkHash(linkHash(crew))).toEqual(crew);
  });

  it("is not a link unless every part of it is one this page can follow", () => {
    for (const hash of [
      "",
      "#dashboard",
      "#schedule/month?m=2026-07-01",
      "#open",
      "#open/",
      "#open/projects/p-1",
      "#open/delayIQs",
      "#open/delayIQs/",
      "#open/delayIQs/d12/extra",
      "#open/delayIQs/%E0%A4%A",
      "#open/dashboard/billing",
      "#open/schedule/tomorrow/c-2",
      "#open/schedule/2026-09-28",
      "#open/timecard/this-week",
      "#open/job/"
    ]) {
      expect(parseLinkHash(hash), hash).toBeNull();
    }
    // a job's day is optional, and a bad one is dropped rather than refusing the job
    expect(parseLinkHash("#open/job/j31?d=soon")).toEqual({ kind: "job", jobId: "j31" });
  });
});
