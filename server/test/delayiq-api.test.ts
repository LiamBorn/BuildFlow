import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-delayiq-test-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return { agent, app };
}

/**
 * A freshly-reset seed is on pace as of "today", so we make a job behind on
 * purpose with a field report (a low percent on a job already underway). This
 * also exercises the loop the feature sits on: report → the schedule now shows
 * the trend. Returns the job we pushed behind.
 */
async function forceBehindJob(agent: request.Agent) {
  const boot = (await agent.get("/api/bootstrap").expect(200)).body;
  const today = new Date().toISOString().slice(0, 10);
  const target = boot.jobs.find((j: { startDate: string; percentComplete: number }) => j.startDate <= today && j.percentComplete < 100);
  expect(target, "seed should have an in-flight job to push behind").toBeDefined();
  await agent
    .post("/api/field-updates")
    .send({
      projectId: target.projectId,
      jobId: target.id,
      userId: boot.activeUser.id,
      message: "Barely started, running behind on site.",
      status: "In Progress",
      percentComplete: 1
    })
    .expect(201);
  return target;
}

describe("DelayIQ early-warning API", () => {
  it("requires a session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-delayiq-anon-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    await request(app).get("/api/delayiq/early-warning").expect(401);
  });

  it("returns a read-only, well-formed, ranked set of risks", async () => {
    const { agent } = await testApp();
    const target = await forceBehindJob(agent);
    const before = await agent.get("/api/bootstrap").expect(200);

    const response = await agent.get("/api/delayiq/early-warning").expect(200);
    expect(response.body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(response.body.risks)).toBe(true);

    const risk = response.body.risks.find((r: { jobId: string }) => r.jobId === target.id);
    expect(risk).toBeDefined();
    expect(risk).toMatchObject({
      jobName: expect.any(String),
      trade: expect.any(String),
      kind: "behind_pace",
      severity: expect.stringMatching(/High|Medium|Low/)
    });
    expect(risk.varianceDays).toBeGreaterThan(0);
    expect(Array.isArray(risk.downstream)).toBe(true);
    expect(Array.isArray(risk.affectedTrades)).toBe(true);

    // Ranked worst-first.
    const rank = { High: 3, Medium: 2, Low: 1 } as const;
    for (let i = 1; i < response.body.risks.length; i += 1) {
      expect(rank[response.body.risks[i - 1].severity as "High"]).toBeGreaterThanOrEqual(
        rank[response.body.risks[i].severity as "High"]
      );
    }

    // Scanning is strictly read-only.
    const after = await agent.get("/api/bootstrap").expect(200);
    expect(after.body.jobs).toHaveLength(before.body.jobs.length);
    expect(after.body.projects).toHaveLength(before.body.projects.length);
  });

  it("notifies the affected trades for a real risk", async () => {
    const { agent } = await testApp();
    const target = await forceBehindJob(agent);
    const response = await agent.post("/api/delayiq/early-warning/notify").send({ jobId: target.id }).expect(202);
    expect(Array.isArray(response.body.notified)).toBe(true);
    expect(response.body.severity).toMatch(/High|Medium|Low/);
  });

  it("rejects a notify for a job that isn't trending behind", async () => {
    const { agent } = await testApp();
    await agent.post("/api/delayiq/early-warning/notify").send({ jobId: "does-not-exist" }).expect(404);
  });

  it("requires a jobId to notify", async () => {
    const { agent } = await testApp();
    await agent.post("/api/delayiq/early-warning/notify").send({}).expect(400);
  });
});
