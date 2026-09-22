/**
 * The weekly digest: what moved between two Monday snapshots of the plan, the
 * email built from it, and the scheduler that sends it once per org per week.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { BuildFlowStore } from "../src/database.js";
import type { StoreManager } from "../src/stores.js";
import {
  DIGEST_SENT_KEY,
  diffPlanSnapshots,
  digestNotice,
  mondayOf,
  runWeeklyDigests,
  shiftDays,
  takePlanSnapshot,
  todayIso,
  type PlanSnapshot
} from "../src/schedule/digest.js";

const snapshot = (weekOf: string, extra: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  weekOf,
  capturedAt: `${weekOf}T07:00:00.000Z`,
  jobs: [
    {
      id: "j-1",
      name: "Mass Excavation",
      projectId: "p-1",
      project: "Pinecrest Medical",
      startDate: "2026-09-07",
      endDate: "2026-09-09",
      status: "Planned"
    },
    {
      id: "j-2",
      name: "Slab Pour",
      projectId: "p-1",
      project: "Pinecrest Medical",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      status: "Planned"
    }
  ],
  bookings: [
    { id: "a-1", jobId: "j-1", crewId: "c-1", crewName: "Trenching Crew 1", date: "2026-09-07" },
    { id: "a-2", jobId: "j-2", crewId: "c-2", crewName: "Concrete Crew 2", date: "2026-09-10" }
  ],
  milestones: [{ id: "phase-ph-1", title: "Foundations complete", project: "Pinecrest Medical", date: "2026-09-20" }],
  ...extra
});

describe("diffPlanSnapshots", () => {
  it("names the jobs that moved, the crew conflicts that appeared and the milestones that slipped", () => {
    const before = snapshot("2026-09-07");
    const after = snapshot("2026-09-14", {
      jobs: [
        {
          id: "j-1",
          name: "Mass Excavation",
          projectId: "p-1",
          project: "Pinecrest Medical",
          startDate: "2026-09-09",
          endDate: "2026-09-11",
          status: "Planned"
        },
        {
          id: "j-2",
          name: "Slab Pour",
          projectId: "p-1",
          project: "Pinecrest Medical",
          startDate: "2026-09-10",
          endDate: "2026-09-11",
          status: "Planned"
        },
        {
          id: "j-3",
          name: "Backfill",
          projectId: "p-1",
          project: "Pinecrest Medical",
          startDate: "2026-09-15",
          endDate: "2026-09-16",
          status: "Planned"
        }
      ],
      bookings: [
        { id: "a-1", jobId: "j-1", crewId: "c-1", crewName: "Trenching Crew 1", date: "2026-09-09" },
        { id: "a-2", jobId: "j-2", crewId: "c-2", crewName: "Concrete Crew 2", date: "2026-09-10" },
        { id: "a-3", jobId: "j-3", crewId: "c-2", crewName: "Concrete Crew 2", date: "2026-09-10" }
      ],
      milestones: [{ id: "phase-ph-1", title: "Foundations complete", project: "Pinecrest Medical", date: "2026-09-23" }]
    });
    const digest = diffPlanSnapshots(before, after);
    expect(digest.previousWeekOf).toBe("2026-09-07");
    expect(digest.movedJobs).toEqual([
      {
        id: "j-1",
        name: "Mass Excavation",
        project: "Pinecrest Medical",
        from: { startDate: "2026-09-07", endDate: "2026-09-09" },
        to: { startDate: "2026-09-09", endDate: "2026-09-11" },
        days: 2
      }
    ]);
    expect(digest.newJobs.map((job) => job.name)).toEqual(["Backfill"]);
    expect(digest.newConflicts).toEqual([
      { crewId: "c-2", crewName: "Concrete Crew 2", date: "2026-09-10", jobs: ["Slab Pour", "Backfill"] }
    ]);
    expect(digest.slippedMilestones).toEqual([
      { id: "phase-ph-1", title: "Foundations complete", project: "Pinecrest Medical", from: "2026-09-20", to: "2026-09-23", days: 3 }
    ]);
    expect(digest.totals).toEqual({ jobs: 3, bookings: 3, conflicts: 1 });
    const notice = digestNotice(digest, "Pinecrest Builders");
    expect(notice.subject).toBe("What changed this week — Pinecrest Builders, week of Sep 14");
    expect(notice.heading).toBe("1 job moved, 1 new conflict, 1 milestone slipped");
    expect(notice.lines).toContain("  • Mass Excavation (Pinecrest Medical) — 2 days later, now Sep 9 to Sep 11");
    expect(notice.lines).toContain("  • Concrete Crew 2 on Sep 10 — Slab Pour and Backfill");
    expect(notice.lines).toContain("  • Foundations complete (Pinecrest Medical) — Sep 20 → Sep 23 (+3 days)");
    expect(digestNotice(digest, "Pinecrest Builders", "https://app.example.com").lines).toContain(
      "Open the week: https://app.example.com/#schedule?w=2026-09-14"
    );
  });

  it("has nothing to compare on the first week, and says so", () => {
    const digest = diffPlanSnapshots(null, snapshot("2026-09-07"));
    expect(digest.previousWeekOf).toBeNull();
    expect(digest.movedJobs).toEqual([]);
    expect(digest.newConflicts).toEqual([]);
    expect(digest.totals).toEqual({ jobs: 2, bookings: 2, conflicts: 0 });
    expect(digestNotice(digest, "Acme").lines[0]).toMatch(/^First snapshot, taken Sep 7/);
    expect(digestNotice(diffPlanSnapshots(snapshot("2026-09-07"), snapshot("2026-09-14")), "Acme").heading).toBe(
      "No schedule changes this week at Acme"
    );
  });

  it("files weeks under their Monday", () => {
    expect(mondayOf("2026-09-09")).toBe("2026-09-07");
    expect(mondayOf("2026-09-13")).toBe("2026-09-07");
    expect(shiftDays("2026-09-07", -7)).toBe("2026-08-31");
  });
});

describe("digest API", () => {
  it("compares this Monday's snapshot with last week's, and emails the planners on request", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-digest-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const manager = app.locals.storeManager as StoreManager;
    const store: BuildFlowStore = manager.main;

    // last Monday's plan had the first job a week earlier than it is now
    const thisMonday = mondayOf(todayIso());
    const lastMonday = shiftDays(thisMonday, -7);
    const plan = takePlanSnapshot(store, lastMonday);
    const moved = plan.jobs[0];
    plan.jobs[0] = { ...moved, startDate: shiftDays(moved.startDate, -7), endDate: shiftDays(moved.endDate, -7) };
    store.recordPlanSnapshot(plan);

    const digest = (await agent.get("/api/schedule/digest").expect(200)).body as {
      weekOf: string;
      previousWeekOf: string;
      movedJobs: Array<{ id: string; days: number; to: { startDate: string } }>;
    };
    expect(digest.weekOf).toBe(thisMonday);
    expect(digest.previousWeekOf).toBe(lastMonday);
    expect(digest.movedJobs).toEqual([
      expect.objectContaining({ id: moved.id, days: 7, to: expect.objectContaining({ startDate: moved.startDate }) })
    ]);
    // the snapshot is kept as first taken: a later change this week does not rewrite Monday
    expect(store.planSnapshot(thisMonday)?.weekOf).toBe(thisMonday);

    const sent = (await agent.post("/api/schedule/digest/send").expect(200)).body as { ok: boolean; weekOf: string; recipients: number };
    expect(sent).toMatchObject({ ok: true, weekOf: thisMonday });
    expect(sent.recipients).toBeGreaterThan(0);
    expect(store.workspaceSetting(DIGEST_SENT_KEY)).toBe(thisMonday);
  });

  it("sends each org's digest once on Monday morning, and not on other days", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-digest-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    await request(app)
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    const manager = app.locals.storeManager as StoreManager;
    const monday = new Date("2026-09-14T08:30:00");
    const tuesday = new Date("2026-09-15T08:30:00");
    expect(await runWeeklyDigests(manager, tuesday, {})).toEqual([]);
    const sent = await runWeeklyDigests(manager, monday, {});
    expect(sent.length).toBeGreaterThan(0);
    expect(await runWeeklyDigests(manager, monday, {})).toEqual([]);
    expect(await runWeeklyDigests(manager, monday, { WEEKLY_DIGEST: "off" })).toEqual([]);
  });
});
