/**
 * Dependencies drawn on the Gantt: a link is created and listed, a repeat, a self-link
 * and a loop are refused with a reason, and a link can be removed again.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

type Link = { id: string; predecessorId: string; successorId: string; type: string; lagDays: number };

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-deps-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("dependencies from the Gantt", () => {
  it("links two jobs, lists the link, refuses a repeat, a self-link and a loop, and unlinks", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as { projects: Array<{ id: string }> };
    // two fresh jobs: no links of their own, so the first link cannot close a loop
    const newJob = async (name: string, startDate: string) =>
      (
        await agent
          .post("/api/jobs")
          .send({
            projectId: boot.projects[0].id,
            name,
            phase: "Testing",
            location: "Austin, TX",
            startDate,
            endDate: startDate,
            startTime: "7:00 AM",
            endTime: "3:30 PM",
            requiredLabor: 2,
            requiredEquipment: "Nothing special",
            materialsStatus: "Delivered",
            status: "Planned",
            priority: "Normal",
            notes: ""
          })
          .expect(201)
      ).body as { id: string };
    const a = await newJob("Link test A", "2026-06-22");
    const b = await newJob("Link test B", "2026-06-23");

    const created = await agent.post("/api/schedule/dependencies").send({ predecessorId: a.id, successorId: b.id }).expect(201);
    expect(created.body).toMatchObject({ predecessorId: a.id, successorId: b.id, type: "FS", lagDays: 0 });
    const listed = (await agent.get("/api/schedule/dependencies").expect(200)).body as Link[];
    expect(listed.find((link) => link.id === created.body.id)).toBeTruthy();

    const repeat = await agent.post("/api/schedule/dependencies").send({ predecessorId: a.id, successorId: b.id, type: "SS" }).expect(409);
    expect(repeat.body.code).toBe("duplicate");
    const self = await agent.post("/api/schedule/dependencies").send({ predecessorId: a.id, successorId: a.id }).expect(409);
    expect(self.body.code).toBe("self");
    const loop = await agent.post("/api/schedule/dependencies").send({ predecessorId: b.id, successorId: a.id }).expect(409);
    expect(loop.body.code).toBe("cycle");
    expect(loop.body.error).toMatch(/close a loop/);
    await agent.post("/api/schedule/dependencies").send({ predecessorId: a.id, successorId: "j-nope" }).expect(404);
    await agent.post("/api/schedule/dependencies").send({ predecessorId: a.id, successorId: b.id, type: "XX" }).expect(400);

    await agent.delete(`/api/schedule/dependencies/${created.body.id}`).expect(204);
    const after = (await agent.get("/api/schedule/dependencies").expect(200)).body as Link[];
    expect(after.find((link) => link.id === created.body.id)).toBeUndefined();
    await agent.delete(`/api/schedule/dependencies/${created.body.id}`).expect(404);
  });
});
