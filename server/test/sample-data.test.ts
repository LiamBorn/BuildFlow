/** Sample data for a trial: the trade's starter workspace loads into an empty org and comes out again, whole. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const bootstrap = async (agent: ReturnType<typeof request.agent>) =>
  (await agent.get("/api/bootstrap").expect(200)).body as {
    projects: unknown[];
    crews: unknown[];
    jobs: unknown[];
    assignments: unknown[];
    equipment: unknown[];
    sampleData: boolean;
  };

describe("sample data", () => {
  it("loads the trade's starter workspace into an empty org, once, and removes exactly that again", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-sample-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    const empty = await bootstrap(agent);
    expect(empty.projects).toHaveLength(0);
    expect(empty.sampleData).toBe(false);

    // a crew of their own first: it must survive the sample data coming and going
    await agent
      .post("/api/crews")
      .send({
        name: "Paving Crew 1",
        specialty: "Asphalt",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 4 }]
      })
      .expect(201);

    const loaded = (await agent.post("/api/schedule/sample-data").send({ businessType: "Asphalt" }).expect(201)).body as {
      ok: boolean;
      alreadyLoaded: boolean;
      projectIds: string[];
      crewIds: string[];
    };
    expect(loaded.alreadyLoaded).toBe(false);
    expect(loaded.projectIds.length).toBeGreaterThan(0);
    const full = await bootstrap(agent);
    expect(full.sampleData).toBe(true);
    expect(full.projects.length).toBe(loaded.projectIds.length);
    expect(full.jobs.length).toBeGreaterThan(0);
    expect(full.assignments.length).toBeGreaterThan(0);
    expect(full.crews.length).toBe(loaded.crewIds.length + 1);

    // asking twice does not load twice
    expect((await agent.post("/api/schedule/sample-data").send({}).expect(200)).body.alreadyLoaded).toBe(true);
    expect((await bootstrap(agent)).projects.length).toBe(loaded.projectIds.length);

    const removed = (await agent.delete("/api/schedule/sample-data").expect(200)).body as { ok: boolean; removed: number };
    expect(removed.removed).toBe(loaded.projectIds.length);
    const after = await bootstrap(agent);
    expect(after.sampleData).toBe(false);
    expect(after.projects).toHaveLength(0);
    expect(after.jobs).toHaveLength(0);
    expect(after.assignments).toHaveLength(0);
    expect(after.equipment).toHaveLength(0);
    expect(after.crews).toHaveLength(1); // theirs stayed
  });

  it("refuses a workspace that already has projects", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-sample-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const response = await agent.post("/api/schedule/sample-data").send({}).expect(409);
    expect(response.body.error).toMatch(/already has projects/);
  });
});

describe("sample data after onboarding", () => {
  it("loads into an org whose starter workspace was cleared but whose people remain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-sample-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    // onboarding seeds the trade's starter workspace; the owner then clears it
    await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 1 })
      .expect(200);
    const seeded = await bootstrap(agent);
    expect(seeded.projects.length).toBeGreaterThan(0);
    for (const project of seeded.projects as Array<{ id: string }>) await agent.delete(`/api/projects/${project.id}`).expect(204);
    for (const crew of seeded.crews as Array<{ id: string }>) await agent.delete(`/api/crews/${crew.id}`).expect(204);
    for (const item of seeded.equipment as Array<{ id: string }>) await agent.delete(`/api/equipment/${item.id}`).expect(204);
    expect((await bootstrap(agent)).projects).toHaveLength(0);

    const loaded = (await agent.post("/api/schedule/sample-data").send({}).expect(201)).body as { projectIds: string[] };
    expect(loaded.projectIds.length).toBeGreaterThan(0);
    const full = await bootstrap(agent);
    expect(full.sampleData).toBe(true);
    expect(full.jobs.length).toBeGreaterThan(0);
    await agent.delete("/api/schedule/sample-data").expect(200);
    expect((await bootstrap(agent)).projects).toHaveLength(0);
  });
});
