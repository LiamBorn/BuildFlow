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

describe("both sides of a clash", () => {
  type Booking = { id: string; jobId: string; crewId: string; date: string; conflicts: string[] };
  type Boot = { assignments: Booking[]; jobs: Array<{ id: string }> };
  const DOUBLE = "Double-booked crew";
  const boot = async (agent: ReturnType<typeof request.agent>) => (await agent.get("/api/bootstrap").expect(200)).body as Boot;
  const noteOn = async (agent: ReturnType<typeof request.agent>, id: string) =>
    (await boot(agent)).assignments.find((row) => row.id === id)?.conflicts ?? [];

  it("notes the booking that was already there, and clears it again when the other one goes", async () => {
    const agent = await testApp();
    const first = (await boot(agent)).assignments[0];
    const day = first.date.slice(0, 10);
    const data = await boot(agent);
    const other = data.jobs.find(
      (job) =>
        job.id !== first.jobId &&
        !data.assignments.some((row) => row.jobId === job.id && row.crewId === first.crewId && row.date.slice(0, 10) === day)
    )!;
    expect(await noteOn(agent, first.id)).not.toContain(DOUBLE);

    const forced = (
      await agent.post("/api/schedule/assign").send({ jobId: other.id, crewId: first.crewId, date: day, force: true }).expect(201)
    ).body as Booking;
    expect(forced.conflicts).toContain(DOUBLE);
    expect(await noteOn(agent, first.id)).toContain(DOUBLE); // the one that never moved says so too

    await agent.delete(`/api/schedule/${forced.id}`).expect(204);
    expect(await noteOn(agent, first.id)).not.toContain(DOUBLE);
  });

  it("carries the note onto the day a booking moves to, and leaves its old day clean", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const first = data.assignments[0];
    const day = first.date.slice(0, 10);
    const mover = data.assignments.find((row) => row.crewId !== first.crewId || row.date.slice(0, 10) !== day)!;
    const from = { crewId: mover.crewId, date: mover.date.slice(0, 10) };

    await agent.patch(`/api/schedule/${mover.id}`).send({ crewId: first.crewId, date: day, force: true }).expect(200);
    expect(await noteOn(agent, mover.id)).toContain(DOUBLE);
    expect(await noteOn(agent, first.id)).toContain(DOUBLE);

    await agent
      .patch(`/api/schedule/${mover.id}`)
      .send({ ...from, force: true })
      .expect(200);
    expect(await noteOn(agent, mover.id)).not.toContain(DOUBLE);
    expect(await noteOn(agent, first.id)).not.toContain(DOUBLE); // the day it left is clean again
  });

  it("re-notes the neighbour a re-book never touched", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const first = data.assignments[0];
    const day = first.date.slice(0, 10);
    const mover = data.assignments.find((row) => row.crewId !== first.crewId || row.date.slice(0, 10) !== day)!;

    await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "move", id: mover.id, crewId: first.crewId, date: day }], force: true })
      .expect(200);
    expect(await noteOn(agent, mover.id)).toContain(DOUBLE);
    expect(await noteOn(agent, first.id)).toContain(DOUBLE);

    await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "unbook", id: mover.id }] })
      .expect(200);
    expect(await noteOn(agent, first.id)).not.toContain(DOUBLE); // unbooking clears the day too
  });
});

describe("what the schedule refuses", () => {
  type Boot = {
    assignments: Array<{ id: string; jobId: string; crewId: string; date: string }>;
    jobs: Array<{ id: string; startDate: string; endDate: string }>;
    crews: Array<{ id: string }>;
  };
  const boot = async (agent: ReturnType<typeof request.agent>) => (await agent.get("/api/bootstrap").expect(200)).body as Boot;

  it("refuses a date that is not a date, on a job and on a booking", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const job = data.jobs[0];
    await agent.patch(`/api/jobs/${job.id}`).send({ startDate: "banana" }).expect(400);
    await agent
      .post("/api/jobs")
      .send(jobInput(data.assignments[0] ? "p-1" : "p-1", { startDate: "2026-13-45" }))
      .expect(400);
    await agent
      .post("/api/schedule/assign")
      .send({ jobId: job.id, crewId: data.crews[0].id, date: "2026-06-15T00:00:00.000Z" })
      .expect(400);
    // the job is exactly as it was
    expect((await boot(agent)).jobs.find((row) => row.id === job.id)?.startDate).toBe(job.startDate);
  });

  it("refuses a finish before its start, however the dates arrive", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const job = data.jobs[0];
    await agent.patch(`/api/jobs/${job.id}`).send({ startDate: "2026-08-10", endDate: "2026-08-01" }).expect(400);
    // one date moving on its own still has to leave the span the right way round
    await agent.patch(`/api/jobs/${job.id}`).send({ endDate: "2020-01-01" }).expect(400);
    await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "job", id: job.id, startDate: "2026-08-10", endDate: "2026-08-01" }] })
      .expect(400);
    const after = (await boot(agent)).jobs.find((row) => row.id === job.id);
    expect([after?.startDate, after?.endDate]).toEqual([job.startDate, job.endDate]);
  });

  it("refuses to point a booking at a crew that does not exist", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const booking = data.assignments[0];
    await agent.patch(`/api/schedule/${booking.id}`).send({ crewId: "ghost-crew", force: true }).expect(404);
    await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "move", id: booking.id, crewId: "ghost-crew" }], force: true })
      .expect(404);
    expect((await boot(agent)).assignments.find((row) => row.id === booking.id)?.crewId).toBe(booking.crewId);
  });

  it("answers 404 for a delete that deleted nothing", async () => {
    const agent = await testApp();
    const before = (await boot(agent)).assignments.length;
    await agent.delete("/api/schedule/as-never-existed").expect(404);
    // and still 204 for one that is really there
    const booking = (await boot(agent)).assignments[0];
    await agent.delete(`/api/schedule/${booking.id}`).expect(204);
    expect((await boot(agent)).assignments).toHaveLength(before - 1);
  });
});

describe("two planners on one card", () => {
  type Row = { id: string; version: number; name: string; startDate: string; endDate: string; notes: string };
  type Workspace = {
    jobs: Row[];
    assignments: Array<{ id: string; jobId: string; crewId: string; date: string; version: number }>;
    crews: Array<{ id: string; name: string }>;
  };
  const read = async (agent: ReturnType<typeof request.agent>) => (await agent.get("/api/bootstrap").expect(200)).body as Workspace;
  const jobsOf = async (agent: ReturnType<typeof request.agent>) => (await read(agent)).jobs;

  it("refuses a save made against a copy somebody else has already replaced", async () => {
    const agent = await testApp();
    const job = (await jobsOf(agent))[0];
    expect(job.version, "every row carries the version it is on").toBeGreaterThan(0);

    // A and B both open the job, so both hold the same version
    const asRead = job.version;

    // A saves first and wins
    const first = await agent.patch(`/api/jobs/${job.id}`).send({ notes: "A got here first", version: asRead }).expect(200);
    expect(first.body.version).toBe(asRead + 1);

    // B saves against the copy they read, and is told rather than overwriting A
    const second = await agent.patch(`/api/jobs/${job.id}`).send({ notes: "B overwrites A", version: asRead }).expect(409);
    expect(second.body.code).toBe("stale");
    expect(second.body.error).toContain("was changed by someone else");
    expect(second.body.current.version).toBe(asRead + 1);

    // and nothing of B's landed
    const after = (await jobsOf(agent)).find((row) => row.id === job.id)!;
    expect(after.notes).toBe("A got here first");
    expect(after.version).toBe(asRead + 1);

    // B reloads and saves against what is really there
    const retry = await agent.patch(`/api/jobs/${job.id}`).send({ notes: "B, after looking", version: after.version }).expect(200);
    expect(retry.body.notes).toBe("B, after looking");
  });

  it("refuses a whole re-book when one of its steps is stale, and writes none of it", async () => {
    const agent = await testApp();
    const data = await read(agent);
    const booking = data.assignments[0];
    const job = (await jobsOf(agent)).find((row) => row.id === booking.jobId)!;
    const otherCrew = data.crews.find((crew) => crew.id !== booking.crewId)!;

    // somebody moves the booking first
    await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "move", id: booking.id, crewId: otherCrew.id, date: booking.date.slice(0, 10) }], force: true })
      .expect(200);

    // the second planner's drag, carrying the version they read before that happened
    const stale = await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          { op: "job", id: job.id, startDate: job.startDate, endDate: job.endDate, notes: "moved by the loser" },
          { op: "move", id: booking.id, crewId: booking.crewId, date: booking.date.slice(0, 10), version: booking.version }
        ],
        force: true
      })
      .expect(409);
    expect(stale.body.code).toBe("stale");

    // the batch is all-or-nothing: the job step did not land either
    const after = await read(agent);
    expect(after.assignments.find((row) => row.id === booking.id)?.crewId).toBe(otherCrew.id);
    expect((await jobsOf(agent)).find((row) => row.id === job.id)?.notes).not.toBe("moved by the loser");
  });

  it("lets a write that sends no version through, so the import and the seed still work", async () => {
    const agent = await testApp();
    const job = (await jobsOf(agent))[0];
    await agent.patch(`/api/jobs/${job.id}`).send({ notes: "no version sent" }).expect(200);
    const after = (await jobsOf(agent)).find((row) => row.id === job.id)!;
    expect(after.notes).toBe("no version sent");
    expect(after.version).toBe(job.version + 1); // still counted, so the next reader knows
  });
});

describe("notes that stay true", () => {
  type Boot = {
    assignments: Array<{ id: string; jobId: string; crewId: string; date: string; conflicts: string[] }>;
    jobs: Array<{
      id: string;
      name: string;
      projectId: string;
      startDate: string;
      endDate: string;
      requiredEquipment: string;
      requiredLabor: number;
      materialsStatus: string;
    }>;
    crews: Array<{ id: string; name: string; specialty: string; lead: string; size: number }>;
    equipment: Array<{ id: string; name: string; type: string; status: string }>;
  };
  const boot = async (agent: ReturnType<typeof request.agent>) => (await agent.get("/api/bootstrap").expect(200)).body as Boot;
  const notesOn = async (agent: ReturnType<typeof request.agent>, id: string) =>
    (await boot(agent)).assignments.find((row) => row.id === id)?.conflicts ?? [];

  it("re-notes a job's bookings the same way whether the change arrives by patch or by re-book", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    // a job with more than one booking, so a move can touch one and leave the others behind
    const counts = new Map<string, number>();
    for (const row of data.assignments) counts.set(row.jobId, (counts.get(row.jobId) ?? 0) + 1);
    const jobId = [...counts].find(([, count]) => count > 1)?.[0];
    expect(jobId, "the seed should book one job on more than one day").toBeDefined();
    const bookings = data.assignments.filter((row) => row.jobId === jobId);

    // through the re-book route: the move carries the materials change with it
    const moving = bookings[0];
    const job = data.jobs.find((row) => row.id === jobId)!;
    await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          { op: "job", id: jobId, startDate: job.startDate, endDate: job.endDate, materialsStatus: "Missing" },
          { op: "move", id: moving.id, crewId: moving.crewId, date: moving.date }
        ],
        force: true
      })
      .expect(200);

    // every booking the job has, not just the day the batch touched
    for (const row of bookings) expect(await notesOn(agent, row.id)).toContain("Missing materials");

    // and back again through the job route: the two agree
    await agent.patch(`/api/jobs/${jobId}`).send({ materialsStatus: "Delivered" }).expect(200);
    for (const row of bookings) expect(await notesOn(agent, row.id)).not.toContain("Missing materials");
  });

  it("clears the note a machine left behind when the machine is deleted", async () => {
    const agent = await testApp();
    const projectId = (await boot(agent)).jobs[0].projectId;
    const machine = (await agent.post("/api/equipment").send({ name: "Px Lift 4", type: "Px Lift", status: "Maintenance" }).expect(201))
      .body as { id: string };
    const crew = (
      await agent
        .post("/api/crews")
        .send({
          name: "Lift Crew",
          specialty: "Concrete",
          foreman: "Ana Lopez",
          laborMix: [{ category: "Labor", role: "Laborers", count: 4 }]
        })
        .expect(201)
    ).body as { id: string };
    const job = (
      await agent
        .post("/api/jobs")
        .send({
          projectId,
          name: "Needs the lift",
          phase: "Testing",
          location: "Austin, TX",
          startDate: "2026-06-24",
          endDate: "2026-06-24",
          startTime: "7:00 AM",
          endTime: "3:30 PM",
          requiredLabor: 2,
          requiredEquipment: "Px Lift 4",
          materialsStatus: "Delivered",
          status: "Planned",
          priority: "Normal",
          notes: ""
        })
        .expect(201)
    ).body as { id: string };
    const booking = (await agent.post("/api/schedule/assign").send({ jobId: job.id, crewId: crew.id, date: "2026-06-24" }).expect(201))
      .body as { id: string };
    expect(await notesOn(agent, booking.id)).toContain("Required equipment unavailable");

    // a machine that is gone is not a machine in maintenance
    await agent.delete(`/api/equipment/${machine.id}`).expect(204);
    expect(await notesOn(agent, booking.id)).not.toContain("Required equipment unavailable");
  });

  it("clears the notes a deleted project's bookings left on the crews that stay", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const first = data.assignments[0];
    const day = first.date.slice(0, 10);
    const firstJob = data.jobs.find((job) => job.id === first.jobId)!;
    // a job from another project, forced onto the same crew-day: both bookings say so
    const other = data.jobs.find((job) => job.projectId !== firstJob.projectId)!;
    const forced = (
      await agent.post("/api/schedule/assign").send({ jobId: other.id, crewId: first.crewId, date: day, force: true }).expect(201)
    ).body as { id: string };
    expect(await notesOn(agent, first.id)).toContain("Double-booked crew");
    expect(await notesOn(agent, forced.id)).toContain("Double-booked crew");

    // deleting the other project takes its booking away — and with it the reason for the note
    await agent.delete(`/api/projects/${other.projectId}`).expect(204);
    const after = await boot(agent);
    expect(after.assignments.find((row) => row.id === forced.id)).toBeUndefined();
    expect(await notesOn(agent, first.id)).not.toContain("Double-booked crew");
  });

  it("tells a job's bookings when its materials change, and again when they arrive", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const booking = data.assignments.find((row) => {
      const job = data.jobs.find((item) => item.id === row.jobId);
      return job?.materialsStatus === "Delivered" && row.conflicts.length === 0;
    })!;
    expect(await notesOn(agent, booking.id)).not.toContain("Missing materials");

    await agent.patch(`/api/jobs/${booking.jobId}`).send({ materialsStatus: "Missing" }).expect(200);
    expect(await notesOn(agent, booking.id)).toContain("Missing materials");

    await agent.patch(`/api/jobs/${booking.jobId}`).send({ materialsStatus: "Delivered" }).expect(200);
    expect(await notesOn(agent, booking.id)).not.toContain("Missing materials");
  });

  it("tells a crew's bookings when the crew shrinks below the labour its work needs", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const booking = data.assignments[0];
    const crew = data.crews.find((item) => item.id === booking.crewId)!;
    const job = data.jobs.find((item) => item.id === booking.jobId)!;
    expect(await notesOn(agent, booking.id)).not.toContain("Crew lacks required labor");

    // one person: fewer than the job asks for
    await agent
      .patch(`/api/crews/${crew.id}`)
      .send({
        name: crew.name,
        specialty: crew.specialty,
        foreman: crew.lead,
        laborMix: [{ category: "Labor", role: "Laborer", count: 1 }]
      })
      .expect(200);
    expect(job.requiredLabor).toBeGreaterThan(1);
    expect(await notesOn(agent, booking.id)).toContain("Crew lacks required labor");
  });

  it("tells the bookings of the jobs that need a machine when it goes into maintenance", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const booking = data.assignments.find((row) => {
      const job = data.jobs.find((item) => item.id === row.jobId);
      return Boolean(job?.requiredEquipment) && data.equipment.some((unit) => unit.name.includes(job!.requiredEquipment));
    });
    if (!booking) return; // the seed has no booking whose job names a machine by name
    const job = data.jobs.find((item) => item.id === booking.jobId)!;
    const unit = data.equipment.find((item) => item.name.includes(job.requiredEquipment))!;
    expect(await notesOn(agent, booking.id)).not.toContain("Required equipment unavailable");

    await agent.patch(`/api/equipment/${unit.id}`).send({ name: unit.name, type: unit.type, status: "Maintenance" }).expect(200);
    expect(await notesOn(agent, booking.id)).toContain("Required equipment unavailable");
  });

  it("leaves neither the row nor the day's notes half-written when a booking write fails", async () => {
    const agent = await testApp();
    const data = await boot(agent);
    const first = data.assignments[0];
    const day = first.date.slice(0, 10);
    const other = data.jobs.find(
      (job) => job.id !== first.jobId && !data.assignments.some((row) => row.jobId === job.id && row.crewId === first.crewId)
    )!;
    // a second job forced onto the day: both bookings say so
    const forced = (
      await agent.post("/api/schedule/assign").send({ jobId: other.id, crewId: first.crewId, date: day, force: true }).expect(201)
    ).body as { id: string };
    expect(await notesOn(agent, first.id)).toContain("Double-booked crew");

    // a move that cannot happen changes nothing: not the row, not the notes on either day
    await agent.patch(`/api/schedule/${forced.id}`).send({ crewId: "ghost-crew", force: true }).expect(404);
    const after = await boot(agent);
    expect(after.assignments.find((row) => row.id === forced.id)?.crewId).toBe(first.crewId);
    expect(after.assignments.find((row) => row.id === first.id)?.conflicts).toContain("Double-booked crew");
    expect(after.assignments).toHaveLength(data.assignments.length + 1);
  });
});
