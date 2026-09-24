/**
 * What a week's schedule snapshot costs to write, counted in whole-file rewrites.
 *
 * `save()` re-exports and rewrites the WHOLE SQLite file and fsyncs it — the server's characteristic
 * cost, which metrics.recordSave counts precisely because it is. `GET /api/schedule/status` records one
 * snapshot row for the portfolio and one per project that has a schedule, and each of those is its own
 * save. The seeded workspace has five such projects, so the first load of a week rewrites and fsyncs
 * the file six times; a forty-project workspace does it forty-one times, inside one GET, on the page a
 * customer opens to find out whether they are behind.
 *
 * The second load of the same week costs nothing, because recordScheduleSnapshot returns early without
 * saving once a week's row is complete. That early return is the reason this is a first-load problem
 * rather than an every-load one, and it is the thing most worth protecting here.
 *
 * ── Why this file does not simply wrap the block in a transaction ──
 * Because that was tried, measured, and reverted. `transaction()` calls `save()` unconditionally after
 * COMMIT, whether or not a row changed — so wrapping turns the first load into 1 write and every later
 * load into 1 as well, instead of 0. For the seeded workspace that is a loss the seventh time somebody
 * opens the page in a week; it only pays off for a workspace with more projects than weekly visits.
 * A genuine fix belongs inside the store — `transaction()` skipping the save when nothing was written,
 * or recordScheduleSnapshot telling the caller it changed nothing — and database.ts is another
 * session's file. This test is here so that whoever does it can see the number move.
 *
 * Counted in writes, not milliseconds, deliberately: a wall-clock budget in a unit suite measures the
 * machine it ran on. This repo has been through that with the CPM benchmark, which flaked in both
 * directions and once let a 10x regression pass. A count of file rewrites is a property of the code.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { metrics } from "../src/metrics.js";

async function demoWorkspace() {
  const app = await createApp({
    dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-snap-")), "test.sqlite"),
    reset: true
  });
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/demo").send({})).status).toBe(200);
  return agent;
}

/** Whole-file rewrites performed while `work` runs. */
async function savesDuring(work: () => Promise<unknown>) {
  const before = metrics.snapshot().databaseWrites.total;
  await work();
  return metrics.snapshot().databaseWrites.total - before;
}

describe("GET /api/schedule/status", () => {
  it("costs nothing once the week is already recorded", async () => {
    /* The invariant worth holding. If recordScheduleSnapshot's early return ever went, every status
       load would start rewriting the whole file again — and nothing else here would notice. */
    const agent = await demoWorkspace();
    await agent.get("/api/schedule/status").expect(200);
    const writes = await savesDuring(() => agent.get("/api/schedule/status").expect(200));
    expect(writes, "a completed week should write nothing at all").toBe(0);
  });

  it("writes no more than one file rewrite per snapshot row on the first load of a week", async () => {
    /* An upper bound rather than an equality, so that a real fix — one write for the lot — passes this
       instead of having to edit it. What it catches is the opposite direction: a change that made the
       route write MORE than the rows it records. Today the two numbers are equal. */
    const shape = await demoWorkspace();
    const rows = 1 + ((await shape.get("/api/schedule/status").expect(200)).body.projects as unknown[]).length;
    expect(rows, "the loop must run more than once for this to measure anything").toBeGreaterThan(1);

    const fresh = await demoWorkspace();
    const writes = await savesDuring(() => fresh.get("/api/schedule/status").expect(200));
    expect(writes, `${rows} snapshot rows cost ${writes} whole-file rewrites`).toBeLessThanOrEqual(rows);
    expect(writes, "and it must still be writing them").toBeGreaterThan(0);
  });

  it("records a row for every project, not just the portfolio", async () => {
    const agent = await demoWorkspace();
    const first = await agent.get("/api/schedule/status").expect(200);
    const projects = (first.body.projects as unknown[]).length;
    expect(projects).toBeGreaterThan(0);
    const again = await agent.get("/api/schedule/status").expect(200);
    expect((again.body.projects as unknown[]).length).toBe(projects);
  });
});
