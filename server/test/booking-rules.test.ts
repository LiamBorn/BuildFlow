/**
 * Booking rules beyond the clash: the notes a booking earns (a crew short of labour,
 * equipment in maintenance) and nothing on a clean one — and the one case that is not
 * a clash, the same job twice on a crew's day.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-rules-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

const jobInput = (projectId: string, overrides: Record<string, unknown> = {}) => ({
  projectId,
  name: "Rules job",
  phase: "Testing",
  location: "Austin, TX",
  startDate: "2026-06-22",
  endDate: "2026-06-22",
  startTime: "7:00 AM",
  endTime: "3:30 PM",
  requiredLabor: 2,
  requiredEquipment: "Nothing special",
  materialsStatus: "Delivered",
  status: "Planned",
  priority: "Normal",
  notes: "",
  ...overrides
});

describe("booking rules", () => {
  it("notes a crew short of labour and equipment in maintenance on the booking, and nothing on a clean one", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as { projects: Array<{ id: string }> };
    const projectId = boot.projects[0].id;
    const crew = (
      await agent
        .post("/api/crews")
        .send({
          name: "Rules Crew",
          specialty: "Concrete",
          foreman: "Ana Lopez",
          laborMix: [{ category: "Labor", role: "Finisher", count: 2 }]
        })
        .expect(201)
    ).body as { id: string; size: number };
    expect(crew.size).toBe(3); // the foreman and two finishers
    await agent.post("/api/equipment").send({ name: "Tx Crane 9000", type: "Tx Crane", status: "Maintenance" }).expect(201);
    const clean = (await agent.post("/api/jobs").send(jobInput(projectId)).expect(201)).body as { id: string };
    const heavy = (
      await agent
        .post("/api/jobs")
        .send(
          jobInput(projectId, {
            name: "Big pour",
            requiredLabor: 10,
            requiredEquipment: "Tx Crane 9000",
            startDate: "2026-06-23",
            endDate: "2026-06-23"
          })
        )
        .expect(201)
    ).body as { id: string };

    const ok = await agent.post("/api/schedule/assign").send({ jobId: clean.id, crewId: crew.id, date: "2026-06-22" }).expect(201);
    expect(ok.body.conflicts).toEqual([]);
    const noted = await agent.post("/api/schedule/assign").send({ jobId: heavy.id, crewId: crew.id, date: "2026-06-23" }).expect(201);
    expect(noted.body.conflicts).toEqual(expect.arrayContaining(["Crew lacks required labor", "Required equipment unavailable"]));
    expect(noted.body.conflicts).not.toContain("Double-booked crew");
  });

  it("does not call the same job twice on a crew's day a clash — another job is one", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as {
      assignments: Array<{ id: string; jobId: string; crewId: string; date: string }>;
      jobs: Array<{ id: string }>;
    };
    const booking = boot.assignments[0];
    const day = booking.date.slice(0, 10);
    // not a clash, and not a second row either: 200 with the booking that already exists
    const same = await agent.post("/api/schedule/assign").send({ jobId: booking.jobId, crewId: booking.crewId, date: day }).expect(200);
    expect(same.body.id).toBe(booking.id);
    const other = boot.jobs.find((job) => job.id !== booking.jobId)!;
    const clash = await agent.post("/api/schedule/assign").send({ jobId: other.id, crewId: booking.crewId, date: day }).expect(409);
    expect(clash.body.code).toBe("conflict");
  });
});

describe("one job, one crew-day, one booking", () => {
  it("answers the booking a job already has on that crew's day instead of writing a second row", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as {
      assignments: Array<{ id: string; jobId: string; crewId: string; date: string }>;
    };
    const booking = boot.assignments[0];
    const day = booking.date.slice(0, 10);
    const again = await agent.post("/api/schedule/assign").send({ jobId: booking.jobId, crewId: booking.crewId, date: day }).expect(200);
    expect(again.body.id).toBe(booking.id);
    const after = (await agent.get("/api/bootstrap").expect(200)).body as {
      assignments: Array<{ id: string; jobId: string; crewId: string; date: string; conflicts: string[] }>;
    };
    const onThatDay = after.assignments.filter(
      (row) => row.jobId === booking.jobId && row.crewId === booking.crewId && row.date.slice(0, 10) === day
    );
    expect(onThatDay).toHaveLength(1);
    expect(onThatDay[0].conflicts).not.toContain("Double-booked crew");
    expect(after.assignments).toHaveLength(boot.assignments.length);
  });

  it("keeps a re-book from making a second row of the booking it already has", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as {
      assignments: Array<{ id: string; jobId: string; crewId: string; date: string }>;
    };
    const booking = boot.assignments[0];
    const day = booking.date.slice(0, 10);
    const result = (
      await agent
        .post("/api/schedule/rebook")
        .send({ moves: [{ op: "book", jobId: booking.jobId, crewId: booking.crewId, date: day }] })
        .expect(200)
    ).body as { assignments: Array<{ id: string }> };
    expect(result.assignments.map((row) => row.id)).toEqual([booking.id]);
    const after = (await agent.get("/api/bootstrap").expect(200)).body as { assignments: Array<{ id: string }> };
    expect(after.assignments).toHaveLength(boot.assignments.length);
  });

  it("still notes a real double-booking of the crew", async () => {
    const agent = await testApp();
    const boot = (await agent.get("/api/bootstrap").expect(200)).body as {
      assignments: Array<{ jobId: string; crewId: string; date: string }>;
      jobs: Array<{ id: string }>;
    };
    const booking = boot.assignments[0];
    const day = booking.date.slice(0, 10);
    const other = boot.jobs.find((job) => job.id !== booking.jobId)!;
    const forced = await agent
      .post("/api/schedule/assign")
      .send({ jobId: other.id, crewId: booking.crewId, date: day, force: true })
      .expect(201);
    expect(forced.body.conflicts).toContain("Double-booked crew");
  });
});
