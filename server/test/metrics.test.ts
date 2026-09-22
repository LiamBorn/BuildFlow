/**
 * Runtime metrics. The assertion that matters most is the cardinality one: a metric keyed by
 * the path a caller chose is an unbounded map that strangers can grow, which is a memory leak
 * with a public trigger. Routes must be labelled by the pattern Express matched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { metrics } from "../src/metrics.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-metrics-"), "test.sqlite"), reset: true });

beforeEach(() => metrics.reset());

describe("what gets counted", () => {
  it("labels a route by its pattern, never by the id in the path", async () => {
    const app = await freshApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const boot = await agent.get("/api/bootstrap").expect(200);
    const ids: string[] = boot.body.projects.slice(0, 3).map((p: { id: string }) => p.id);
    expect(ids.length, "the fixture needs a few projects with distinct ids").toBeGreaterThan(1);

    for (const id of ids) await agent.get(`/api/projects/${id}`).expect(200);

    const snapshot = metrics.snapshot();
    const labels = snapshot.requests.byRoute.map((r) => r.route);
    for (const id of ids) {
      expect(
        labels.some((l) => l.includes(id)),
        `no label may contain the id ${id}`
      ).toBe(false);
    }
    const pattern = snapshot.requests.byRoute.find((r) => r.route === "/api/projects/:id");
    expect(pattern, "the three calls collapse onto one label").toBeDefined();
    expect(pattern!.count).toBe(ids.length);
  });

  /**
   * The leak this guards: /api/nope-1, /api/nope-2 … match no route, so without folding them
   * together every 404 from a scanner would be a permanent entry in the map.
   */
  it("folds everything that matched no route into a single label", async () => {
    const app = await freshApp();
    for (let i = 0; i < 5; i += 1) await request(app).get(`/api/there-is-nothing-here-${i}`).expect(404);

    const byRoute = metrics.snapshot().requests.byRoute;
    expect(byRoute.filter((r) => r.route.includes("there-is-nothing-here"))).toEqual([]);
    const unmatched = byRoute.find((r) => r.route === "(unmatched)");
    expect(unmatched?.count).toBe(5);
    expect(unmatched?.["4xx"]).toBe(5);
  });

  /**
   * The auth gate is middleware, so it turns a request away BEFORE routing and there is no
   * matched pattern to label it with. Without the static-route lookup every 401 in the API
   * would land in one bucket, and "we are serving a lot of 401s" would come with no clue
   * which endpoint they were aimed at.
   */
  it("keeps the route on a request the auth gate turned away before routing", async () => {
    const app = await freshApp();
    await request(app).get("/api/bootstrap").expect(401);

    const byRoute = metrics.snapshot().requests.byRoute;
    expect(byRoute.find((r) => r.route === "/api/bootstrap")?.["4xx"]).toBe(1);
    expect(
      byRoute.find((r) => r.route === "(unmatched)"),
      "and it is not the catch-all"
    ).toBeUndefined();
  });

  it("separates status classes, so an error rate is readable", async () => {
    const app = await freshApp();
    await request(app).get("/api/bootstrap").expect(401);
    await request(app).get("/api/bootstrap").expect(401);

    const row = metrics.snapshot().requests.byRoute.find((r) => r.route === "/api/bootstrap");
    expect(row?.["4xx"]).toBe(2);
    expect(row?.["2xx"]).toBe(0);
  });

  it("counts requests even when the request log is switched off", async () => {
    // Logging off is a decision about noise, not about whether the server tracks itself.
    const previous = process.env.REQUEST_LOG;
    process.env.REQUEST_LOG = "off";
    try {
      const app = await freshApp();
      await request(app).get("/api/health").expect(200);
      expect(metrics.snapshot().requests.total).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.REQUEST_LOG;
      else process.env.REQUEST_LOG = previous;
    }
  });

  /** The defining cost of this server: every write rewrites the whole file and fsyncs it. */
  it("counts the whole-file database rewrites and what they cost", async () => {
    const app = await freshApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const before = metrics.snapshot().databaseWrites;

    const boot = await agent.get("/api/bootstrap").expect(200);
    await agent.patch(`/api/jobs/${boot.body.jobs[0].id}`).send({ notes: "a real change" }).expect(200);

    const after = metrics.snapshot().databaseWrites;
    expect(after.total).toBeGreaterThan(before.total);
    expect(after.megabytesRewritten).toBeGreaterThan(0);
  });
});

describe("reading them back", () => {
  it("needs the operator token, like the other ops routes", async () => {
    const previous = process.env.OPS_ADMIN_TOKEN;
    process.env.OPS_ADMIN_TOKEN = "the-real-token";
    try {
      const app = await freshApp();
      await request(app).get("/api/ops/stats").expect(403);
      await request(app).get("/api/ops/stats").set("x-ops-token", "the-real-token").expect(200);
    } finally {
      if (previous === undefined) delete process.env.OPS_ADMIN_TOKEN;
      else process.env.OPS_ADMIN_TOKEN = previous;
    }
  });

  it("answers JSON, and Prometheus text when asked", async () => {
    const app = await freshApp();
    await request(app).get("/api/bootstrap").expect(401);

    const json = await request(app).get("/api/ops/stats").expect(200);
    expect(json.body.requests.total).toBeGreaterThan(0);
    expect(json.body.memory.rssMb).toBeGreaterThan(0);

    const text = await request(app).get("/api/ops/stats?format=prometheus").expect(200);
    expect(text.headers["content-type"]).toMatch(/text\/plain/);
    expect(text.text).toMatch(/# TYPE buildflow_requests_total counter/);
    expect(text.text).toMatch(/buildflow_requests_total\{method="GET",route="\/api\/bootstrap",status="4xx"\} \d+/);
    // A histogram's buckets are cumulative and must end at +Inf.
    expect(text.text).toMatch(/buildflow_request_duration_ms_bucket\{le="\+Inf"\} \d+/);
  });

  it("leaks nothing identifying into the numbers", async () => {
    const app = await freshApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    await agent.get("/api/bootstrap").expect(200);

    const text = (await request(app).get("/api/ops/stats?format=prometheus").expect(200)).text;
    expect(text).not.toMatch(/org-demo/);
    expect(text).not.toMatch(/demo@buildflow\.com/);
  });
});
