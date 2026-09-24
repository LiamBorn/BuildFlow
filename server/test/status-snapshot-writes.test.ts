/**
 * What a week's schedule snapshot costs to write, counted in whole-file rewrites.
 *
 * `save()` re-exports and rewrites the WHOLE SQLite file and fsyncs it — the server's characteristic
 * cost, which metrics.recordSave counts precisely because it is. `GET /api/schedule/status` records one
 * snapshot row for the portfolio and one per project that has a schedule, and each of those used to be
 * its own save. The seeded workspace has five such projects, so the first load of a week rewrote and
 * fsynced the file six times; a forty-project workspace did it forty-one times, inside one GET, on the
 * page a customer opens to find out whether they are behind.
 *
 * The second load of the same week costs nothing, because recordScheduleSnapshot changes no row once a
 * week's row is complete. That is the reason this was a first-load problem rather than an every-load
 * one, and it is the thing most worth protecting here.
 *
 * ── Why wrapping the block in a transaction was not enough on its own ──
 * It was tried, measured, and reverted: `transaction()` used to call `save()` after every COMMIT,
 * whether or not a row changed, so wrapping turned the first load into 1 write and every later load
 * into 1 as well, instead of 0. For the seeded workspace that was a loss the seventh time somebody
 * opened the page in a week. The fix went into the store: `transaction()` now skips the save when no
 * row has changed since the file was last written, and the route records the week's rows in one
 * transaction.
 * The first load is one rewrite however many projects there are, and a later load is still none.
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
    /* The invariant worth holding. If recordScheduleSnapshot started rewriting a completed week's row,
       or transaction() went back to saving after every commit, every status load would rewrite the
       whole file again — and nothing else here would notice. */
    const agent = await demoWorkspace();
    await agent.get("/api/schedule/status").expect(200);
    const writes = await savesDuring(() => agent.get("/api/schedule/status").expect(200));
    expect(writes, "a completed week should write nothing at all").toBe(0);
  });

  it("writes the file once on the first load of a week, however many rows it records", async () => {
    /* Once, not once per row. The rows are counted first because in a workspace with a single row the
       two would be the same number, and this would pass whether or not the rows share a transaction. */
    const shape = await demoWorkspace();
    const rows = 1 + ((await shape.get("/api/schedule/status").expect(200)).body.projects as unknown[]).length;
    expect(rows, "the loop must run more than once for this to measure anything").toBeGreaterThan(1);

    const fresh = await demoWorkspace();
    const writes = await savesDuring(() => fresh.get("/api/schedule/status").expect(200));
    expect(writes, `${rows} snapshot rows cost ${writes} whole-file rewrites`).toBe(1);
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
