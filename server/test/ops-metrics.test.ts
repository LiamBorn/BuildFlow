import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { StoreManager } from "../src/stores.js";

/**
 * GET /api/ops/metrics — the operator console's real object counts.
 *
 * This route exists because of a specific defect: the standalone admin portal fetched
 * /api/bootstrap anonymously, which is session-gated, so the call always 401'd and the
 * portal answered from a hardcoded fallback that matched a fresh seed. It rendered
 * constants as a workspace's contents, convincingly enough that nobody noticed.
 *
 * So these tests hold three things in place: that /api/bootstrap stays gated (the
 * tempting "fix" was to open it, and it returns contract values and crew rates), that
 * this route is guarded by the ops token, and that it answers in counts only.
 */

const boot = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-ops-metrics-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  return { app, dir };
};

/* Booting an app seeds a whole demo workspace, and this suite's password tests already sit
   close to the 5s timeout under parallel load. So the read-only cases share one app, and
   only the case that writes to the store gets its own. */
let shared: Awaited<ReturnType<typeof boot>>;
beforeAll(async () => {
  shared = await boot();
});

afterEach(() => {
  delete process.env.OPS_ADMIN_TOKEN;
});

describe("the workspace gate the portal used to fall foul of", () => {
  it("still refuses /api/bootstrap without a session", async () => {
    const { app } = shared;
    // The whole point of the new route: this must NOT become reachable to make a
    // dashboard work. /api/bootstrap ships an entire workspace, rates and all.
    await request(app).get("/api/bootstrap").expect(401);
  });
});

describe("GET /api/ops/metrics", () => {
  it("answers a localhost caller when OPS_ADMIN_TOKEN is unset, with counts that match the store", async () => {
    const { app } = shared;
    const manager = app.locals.storeManager as StoreManager;
    const seeded = manager.main.objectCounts();

    const res = await request(app).get("/api/ops/metrics").expect(200);

    expect(res.body.byKind).toEqual(seeded);
    expect(res.body.objects).toBe(
      seeded.projects + seeded.jobs + seeded.crews + seeded.equipment + seeded.materials
    );
    expect(res.body.workspaces).toBe(manager.main.listOrgs().length);
    /* Counted, not constant. Worth knowing: on a FRESH seed this total is 31, exactly what
       the portal's fallback claimed -- which is why the fallback passed for real data. The
       dev workspace it was shown beside had since drifted to 35. */
    expect(res.body.objects).toBeGreaterThan(0);
  });

  it("requires the ops token when one is configured", async () => {
    const { app } = shared;
    process.env.OPS_ADMIN_TOKEN = "s3cret-ops";

    await request(app).get("/api/ops/metrics").expect(403);
    await request(app).get("/api/ops/metrics").set("x-ops-token", "wrong").expect(403);
    await request(app).get("/api/ops/metrics").set("x-ops-token", "s3cret-ops").expect(200);
  });

  it("returns counts only — no workspace content of any kind", async () => {
    const { app } = shared;
    const res = await request(app).get("/api/ops/metrics").expect(200);

    /* The reason this route can be handed to a console that /api/bootstrap cannot: the
       payload is integers. If a future change adds a field here, this fails and the
       author has to decide deliberately whether an operator tool should carry it. */
    expect(Object.keys(res.body).sort()).toEqual(
      ["byKind", "coldWorkspaces", "generatedAt", "objects", "workspaces"].sort()
    );
    expect(Object.keys(res.body.byKind).sort()).toEqual(
      ["crews", "equipment", "jobs", "materials", "projects"].sort()
    );
    for (const value of Object.values(res.body.byKind)) expect(Number.isInteger(value)).toBe(true);
    /* Every value is a number except the timestamp, so no name, rate or contract value can
       be riding along in one of them. */
    for (const [key, value] of Object.entries(res.body)) {
      if (key === "generatedAt") expect(typeof value).toBe("string");
      else if (key === "byKind") expect(typeof value).toBe("object");
      else expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("counts a workspace whose store was never opened as zero, without creating its file", async () => {
    const { app, dir } = await boot();
    const manager = app.locals.storeManager as StoreManager;
    const cold = manager.main.createOrg("Cold Co");
    const before = await request(app).get("/api/ops/metrics").expect(200);

    expect(before.body.workspaces).toBe(2);
    expect(before.body.coldWorkspaces).toBe(1);
    /* Reading must not write. BuildFlowStore.create() ends in save(), so opening this
       org to count it would materialise an empty database as the side effect of a GET. */
    expect(fs.existsSync(path.join(dir, `org-${cold.id}.sqlite`))).toBe(false);
  });
});
