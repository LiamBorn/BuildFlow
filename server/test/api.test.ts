import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-test-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  // The operational routes are auth-gated, so sign in as the seeded demo account
  // and return a cookie-persisting agent. The demo org maps to the seeded main
  // store, so tests see the same seed data they did before the auth gate existed.
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("BuildFlow API", () => {
  it("redirects the API root to the BuildFlow client", async () => {
    const agent = await testApp();

    await agent.get("/").expect(302).expect("Location", "http://localhost:5175/");
  });

  it("returns seeded bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent.get("/api/bootstrap").expect(200);

    expect(response.body.projects).toHaveLength(5);
    expect(response.body.crews).toHaveLength(6);
    expect(response.body.activeUser.role).toBe("Project Manager");
  });

  it("rejects unknown business profiles", async () => {
    const agent = await testApp();

    await agent.post("/api/business-profile").send({ businessType: "Solar" }).expect(400);
  });

  it("seeds a populated starter workspace when a new account picks its trade", async () => {
    // A brand-new account, not the shared demo — its own empty, isolated workspace.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-seed-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "buildflow123", name: "Dana Brooks", orgName: "Asphalt Co" })
      .expect(201);

    // Fresh signup starts blank — this is what used to be all a real account ever had.
    const empty = await agent.get("/api/bootstrap").expect(200);
    expect(empty.body.projects).toEqual([]);
    expect(empty.body.jobs).toEqual([]);

    // Picking a trade during onboarding seeds a realistic starter workspace for it.
    const seeded = await agent.post("/api/business-profile").send({ businessType: "Asphalt" }).expect(200);
    expect(seeded.body.projects.length).toBeGreaterThan(0);
    expect(seeded.body.jobs.length).toBeGreaterThan(0);
    expect(seeded.body.crews.length).toBeGreaterThan(0);

    // It persists across a reload — the whole point of the fix.
    const reload = await agent.get("/api/bootstrap").expect(200);
    expect(reload.body.projects.length).toBe(seeded.body.projects.length);

    // And re-running onboarding must NEVER wipe real work: a second apply is a no-op
    // that preserves what's there rather than clearing it.
    const before = reload.body.projects.length;
    const again = await agent.post("/api/business-profile").send({ businessType: "Concrete" }).expect(200);
    expect(again.body.projects.length).toBe(before);
  });

  it("keeps project, job, crew, and material endpoints usable after a blank workspace is applied", async () => {
    const agent = await testApp();
    await agent.post("/api/business-profile").send({ businessType: "Asphalt" }).expect(200);

    const project = await agent
      .post("/api/projects")
      .send({
        name: "Airport Asphalt Repair",
        location: "Austin, TX",
        address: "3600 Presidential Blvd, Austin, TX 78719",
        type: "Asphalt",
        contractType: "Unit Price",
        managerId: "u-matt",
        targetCompletion: "2026-09-18",
        percentComplete: 0,
        status: "Not Started",
        scheduleHealth: "On Track"
      })
      .expect(201);

    const job = await agent
      .post("/api/jobs")
      .send({
        projectId: project.body.id,
        name: "Airport Asphalt Repair",
        phase: "Night Paving",
        location: "Austin, TX",
        startDate: "2026-06-21",
        endDate: "2026-06-21",
        startTime: "8:00 PM",
        endTime: "3:00 AM",
        requiredLabor: 6,
        requiredEquipment: "Asphalt Paver",
        materialsStatus: "Ordered",
        status: "Planned",
        priority: "High",
        notes: "Created after profile replacement."
      })
      .expect(201);

    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Night Paving Crew",
        specialty: "Asphalt Paving",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Rakers", count: 3 },
          { category: "Operator", role: "Paver Operator", count: 1 }
        ]
      })
      .expect(201);

    await agent
      .post("/api/equipment")
      .send({
        name: "Paver 1",
        type: "Asphalt Paver",
        status: "Available",
        assignedTo: project.body.id
      })
      .expect(201);

    await agent
      .post("/api/materials")
      .send({
        projectId: project.body.id,
        name: "Night Shift HMA",
        status: "Ordered",
        deliveryDate: "2026-06-21",
        quantity: "80 tons"
      })
      .expect(201);

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: job.body.id,
        crewId: crew.body.id,
        date: "2026-06-21",
        status: "Planned"
      })
      .expect(201);

    expect(assignment.body.jobId).toBe(job.body.id);

    await agent
      .post("/api/field-updates")
      .send({
        projectId: project.body.id,
        jobId: job.body.id,
        userId: "u-matt",
        message: "Night paving setup entered from scratch.",
        status: "On Site"
      })
      .expect(201);

    await agent
      .post("/api/delayIQs")
      .send({
        projectId: project.body.id,
        category: "Traffic control",
        title: "Lane closure moved",
        impactDays: 1,
        severity: "Medium",
        status: "Open",
        description: "Permit window moved after workspace setup."
      })
      .expect(201);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.materials).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Night Shift HMA" })]));
    expect(bootstrap.body.equipment).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Paver 1" })]));
    expect(bootstrap.body.fieldUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ message: "Night paving setup entered from scratch." })]));
    expect(bootstrap.body.delayIQs).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Lane closure moved" })]));
  });

  it("updates projects and persists them in bootstrap data", async () => {
    const agent = await testApp();
    const update = {
      name: "Riverside Office Tower",
      location: "Downtown Austin, TX",
      address: "123 Riverfront Blvd, Austin, TX 78701",
      type: "Commercial",
      contractType: "GMP",
      managerId: "u-jessica",
      targetCompletion: "2026-09-18",
      percentComplete: 72,
      status: "In Progress",
      scheduleHealth: "Monitor"
    };

    const response = await agent.patch("/api/projects/p-riverside").send(update).expect(200);

    expect(response.body).toMatchObject(update);
    expect(response.body.slug).toBe("riverside-office");
    expect(response.body.image).toBe("office-building");

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "p-riverside", name: "Riverside Office Tower" })])
    );
  });

  it("creates projects and persists them in bootstrap data", async () => {
    const agent = await testApp();
    const input = {
      name: "South Austin Retail Center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      status: "Not Started",
      scheduleHealth: "On Track"
    };

    const response = await agent.post("/api/projects").send(input).expect(201);

    expect(response.body).toMatchObject(input);
    expect(response.body.id).toMatch(/^p-south-austin-retail-center-/);
    expect(response.body.slug).toBe("south-austin-retail-center");
    expect(response.body.image).toBe("office-building");
    expect(response.body.latitude).toBe(30.2672);
    expect(response.body.longitude).toBe(-97.7431);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: response.body.id, name: "South Austin Retail Center" })])
    );
  });

  it("rejects invalid project creation", async () => {
    const agent = await testApp();
    const validProject = {
      name: "South Austin Retail Center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      status: "Not Started",
      scheduleHealth: "On Track"
    };

    for (const invalidProject of [
      { ...validProject, name: "" },
      { ...validProject, location: "" },
      { ...validProject, percentComplete: 101 },
      { ...validProject, percentComplete: 10.5 },
      { ...validProject, status: "Blocked" },
      { ...validProject, scheduleHealth: "Behind" },
      { ...validProject, managerId: "u-carlos" },
      { ...validProject, managerId: "missing-user" }
    ]) {
      await agent.post("/api/projects").send(invalidProject).expect(400);
    }
  });

  it("returns 404 for unknown project updates", async () => {
    const agent = await testApp();

    await agent
      .patch("/api/projects/missing-project")
      .send({
        name: "Missing Project",
        location: "Austin, TX",
        address: "1 Example Way",
        type: "Commercial",
        contractType: "GMP",
        managerId: "u-matt",
        targetCompletion: "2026-09-18",
        percentComplete: 72,
        status: "In Progress",
        scheduleHealth: "Monitor"
      })
      .expect(404);
  });

  it("rejects invalid project updates", async () => {
    const agent = await testApp();
    const validProject = {
      name: "Riverside Office Tower",
      location: "Downtown Austin, TX",
      address: "123 Riverfront Blvd, Austin, TX 78701",
      type: "Commercial",
      contractType: "GMP",
      managerId: "u-matt",
      targetCompletion: "2026-09-18",
      percentComplete: 72,
      status: "In Progress",
      scheduleHealth: "Monitor"
    };

    for (const invalidProject of [
      { ...validProject, name: "" },
      { ...validProject, percentComplete: 101 },
      { ...validProject, percentComplete: 72.5 },
      { ...validProject, status: "Blocked" },
      { ...validProject, managerId: "u-carlos" },
      { ...validProject, managerId: "missing-user" }
    ]) {
      await agent.patch("/api/projects/p-riverside").send(invalidProject).expect(400);
    }
  });

  it("flags schedule assignment conflicts without blocking the assignment", async () => {
    const agent = await testApp();
    // The seed shifts every date by run-date, so read the date crew-concrete is
    // actually booked (its Riverside assignment) instead of hardcoding 2026-06-15.
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const booked = bootstrap.body.assignments.find(
      (a: { crewId: string; jobId: string; date: string }) => a.crewId === "crew-concrete" && a.jobId === "j-riverside-concrete"
    );
    expect(booked).toBeDefined();

    // Same crew, different job, same day → double-booked; Pinecrest's materials
    // aren't ready → both conflicts fire, regardless of when the suite runs.
    const response = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-pinecrest-foundation",
        crewId: "crew-concrete",
        date: booked.date
      })
      .expect(201);

    expect(response.body.conflicts).toContain("Double-booked crew");
    expect(response.body.conflicts).toContain("Missing materials");
  });

  it("creates jobs and makes them available for schedule assignment", async () => {
    const agent = await testApp();
    const job = await agent
      .post("/api/jobs")
      .send({
        projectId: "p-riverside",
        name: "Custom Concrete Pour",
        phase: "Concrete - Custom Pour",
        location: "Downtown, Austin",
        startDate: "2026-06-16",
        endDate: "2026-06-16",
        startTime: "6:30 AM",
        endTime: "1:30 PM",
        requiredLabor: 7,
        requiredEquipment: "Line Pump",
        materialsStatus: "Ordered",
        status: "Confirmed",
        priority: "High",
        notes: "Created from schedule prompt."
      })
      .expect(201);

    expect(job.body.id).toMatch(/^job-custom-concrete-pour-/);
    expect(job.body.name).toBe("Custom Concrete Pour");

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: job.body.id,
        crewId: "crew-concrete",
        date: "2026-06-16",
        status: "Confirmed"
      })
      .expect(201);

    expect(assignment.body.jobId).toBe(job.body.id);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.jobs.some((item: { id: string }) => item.id === job.body.id)).toBe(true);
  });

  it("creates crews with computed size and returns them in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 2 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    expect(response.body.id).toMatch(/^crew-site-prep-crew-5-/);
    expect(response.body.lead).toBe("Dana Brooks");
    expect(response.body.size).toBe(4);
    expect(response.body.status).toBe("Available");
    expect(response.body.laborMix).toHaveLength(2);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Site Prep Crew 5", size: 4 })]));
  });

  it("rejects invalid crew creation input", async () => {
    const agent = await testApp();
    const validCrew = {
      name: "Site Prep Crew 5",
      specialty: "Site Prep",
      foreman: "Dana Brooks",
      laborMix: [{ category: "Labor", role: "Laborers", count: 2 }]
    };

    for (const invalidCrew of [
      { ...validCrew, foreman: "" },
      { ...validCrew, laborMix: [] },
      { ...validCrew, laborMix: [{ category: "Labor", role: "", count: 2 }] },
      { ...validCrew, laborMix: [{ category: "Operator", role: "Dozer Operator", count: 0 }] }
    ]) {
      await agent.post("/api/crews").send(invalidCrew).expect(400);
    }
  });

  it("creates equipment and returns it in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/equipment")
      .send({
        name: "Forklift #9",
        type: "Forklift",
        status: "In Use",
        assignedTo: "p-riverside"
      })
      .expect(201);

    expect(response.body.id).toMatch(/^eq-forklift-9-/);
    expect(response.body).toMatchObject({
      name: "Forklift #9",
      type: "Forklift",
      status: "In Use",
      assignedTo: "p-riverside"
    });

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.equipment).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Forklift #9", type: "Forklift" })])
    );
  });

  it("rejects invalid equipment creation input", async () => {
    const agent = await testApp();
    const validEquipment = {
      name: "Forklift #9",
      type: "Forklift",
      status: "Available"
    };

    for (const invalidEquipment of [
      { ...validEquipment, name: "" },
      { ...validEquipment, type: "" },
      { ...validEquipment, status: "Missing" }
    ]) {
      await agent.post("/api/equipment").send(invalidEquipment).expect(400);
    }
  });

  it("updates and deletes equipment", async () => {
    const agent = await testApp();
    const created = await agent
      .post("/api/equipment")
      .send({
        name: "Forklift #9",
        type: "Forklift",
        status: "Available"
      })
      .expect(201);

    const updated = await agent
      .patch(`/api/equipment/${created.body.id}`)
      .send({
        name: "Forklift #10",
        type: "Forklift",
        status: "Maintenance",
        assignedTo: "p-riverside"
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      name: "Forklift #10",
      type: "Forklift",
      status: "Maintenance",
      assignedTo: "p-riverside"
    });

    await agent.delete(`/api/equipment/${created.body.id}`).expect(204);
    await agent.patch(`/api/equipment/${created.body.id}`).send(updated.body).expect(404);
    await agent.delete(`/api/equipment/${created.body.id}`).expect(404);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.equipment).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id })])
    );
  });

  it("creates materials and returns them in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/materials")
      .send({
        projectId: "p-riverside",
        name: "Structural Steel Beams",
        status: "Ordered",
        deliveryDate: "2026-06-28",
        quantity: "24 bundles"
      })
      .expect(201);

    expect(response.body.id).toMatch(/^mat-structural-steel-beams-/);
    expect(response.body).toMatchObject({
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    });

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.materials).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Structural Steel Beams", quantity: "24 bundles" })])
    );
  });

  it("rejects invalid material creation input", async () => {
    const agent = await testApp();
    const validMaterial = {
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    };

    for (const invalidMaterial of [
      { ...validMaterial, projectId: "" },
      { ...validMaterial, name: "" },
      { ...validMaterial, status: "Delivered" },
      { ...validMaterial, deliveryDate: "06/28/2026" },
      { ...validMaterial, quantity: "" }
    ]) {
      await agent.post("/api/materials").send(invalidMaterial).expect(400);
    }

    await agent.post("/api/materials").send({ ...validMaterial, projectId: "missing-project" }).expect(404);
  });

  it("uses newly created crews for schedule assignments", async () => {
    const agent = await testApp();
    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 4 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: crew.body.id,
        date: "2026-06-20"
      })
      .expect(201);

    expect(assignment.body.crewId).toBe(crew.body.id);
  });

  it("deletes crews and removes their schedule assignments", async () => {
    const agent = await testApp();
    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 4 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: crew.body.id,
        date: "2026-06-20"
      })
      .expect(201);

    await agent.delete(`/api/crews/${crew.body.id}`).expect(204);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews.some((item: { id: string }) => item.id === crew.body.id)).toBe(false);
    expect(bootstrap.body.assignments.some((item: { crewId: string }) => item.crewId === crew.body.id)).toBe(false);
  });

  it("returns not found for unknown crew deletes", async () => {
    const agent = await testApp();
    await agent.delete("/api/crews/crew-missing").expect(404);
  });

  it("updates crew profiles with computed size and keeps assignments usable", async () => {
    const agent = await testApp();
    const response = await agent
      .patch("/api/crews/crew-concrete")
      .send({
        name: "Concrete Crew Alpha",
        specialty: "Concrete Placement",
        foreman: "Morgan Lee",
        laborMix: [
          { category: "Labor", role: "Finishers", count: 3 },
          { category: "Operator", role: "Pump Operator", count: 1 }
        ]
      })
      .expect(200);

    expect(response.body.name).toBe("Concrete Crew Alpha");
    expect(response.body.lead).toBe("Morgan Lee");
    expect(response.body.size).toBe(5);
    expect(response.body.status).toBe("Scheduled");
    expect(response.body.utilization).toBe(80);
    expect(response.body.laborMix).toHaveLength(2);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "crew-concrete", name: "Concrete Crew Alpha", size: 5 })])
    );

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: "crew-concrete",
        date: "2026-06-20"
      })
      .expect(201);

    expect(assignment.body.crewId).toBe("crew-concrete");
  });

  it("rejects invalid crew update input", async () => {
    const agent = await testApp();
    const validCrew = {
      name: "Concrete Crew Alpha",
      specialty: "Concrete Placement",
      foreman: "Morgan Lee",
      laborMix: [{ category: "Labor", role: "Finishers", count: 3 }]
    };

    for (const invalidCrew of [
      { ...validCrew, foreman: "" },
      { ...validCrew, laborMix: [] },
      { ...validCrew, laborMix: [{ category: "Labor", role: "", count: 2 }] },
      { ...validCrew, laborMix: [{ category: "Operator", role: "Pump Operator", count: 0 }] }
    ]) {
      await agent.patch("/api/crews/crew-concrete").send(invalidCrew).expect(400);
    }
  });

  it("returns not found for unknown crew updates", async () => {
    const agent = await testApp();
    await agent
      .patch("/api/crews/crew-missing")
      .send({
        name: "Missing Crew",
        specialty: "General",
        foreman: "Morgan Lee",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }]
      })
      .expect(404);
  });

  it("creates field updates", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        jobId: "j-riverside-concrete",
        userId: "u-carlos",
        status: "On Site",
        message: "Crew checked in and pour has started."
      })
      .expect(201);

    expect(response.body.update.id).toMatch(/^fu-/);
    expect(response.body.update.message).toContain("pour");
    // A note with no percent is just a log entry — it has no opinion about the plan.
    expect(response.body.variance).toBeNull();
  });

  it("rejects reported progress that isn't tied to a job", async () => {
    const agent = await testApp();
    await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        userId: "u-carlos",
        status: "On Site",
        message: "Roughly half done across the site.",
        percentComplete: 50
      })
      .expect(400);
  });

  it("writes reported progress onto the job without touching the planned dates", async () => {
    const agent = await testApp();
    const before = await agent.get("/api/bootstrap").expect(200);
    const planned = before.body.jobs.find((job: { id: string }) => job.id === "j-riverside-concrete");

    await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        jobId: "j-riverside-concrete",
        userId: "u-carlos",
        status: "On Site",
        message: "Rebar mat is tied, starting the pour.",
        percentComplete: 45
      })
      .expect(201);

    const after = await agent.get("/api/bootstrap").expect(200);
    const job = after.body.jobs.find((item: { id: string }) => item.id === "j-riverside-concrete");

    // The crew's number is a fact — it lands.
    expect(job.percentComplete).toBe(45);
    expect(job.actualStart).toBeTruthy();
    // The plan is the PM's — it does not move on a field report.
    expect(job.startDate).toBe(planned.startDate);
    expect(job.endDate).toBe(planned.endDate);
  });

  it("accepting a variance moves the plan; rejecting it leaves the plan alone", async () => {
    const agent = await testApp();
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const target = bootstrap.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");

    // Report far enough behind that the forecastIQ has to move the finish.
    const reported = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-harborview",
        jobId: "j-harborview-framing",
        userId: "u-carlos",
        status: "On Site",
        message: "Podium connectors are re-work, we are well behind.",
        percentComplete: 5
      })
      .expect(201);

    const variance = reported.body.variance;
    expect(variance).not.toBeNull();
    expect(variance.status).toBe("pending");
    expect(variance.kind).toBe("slip");

    // Still pending → the master schedule is untouched.
    const during = await agent.get("/api/bootstrap").expect(200);
    const held = during.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(held.endDate).toBe(target.endDate);

    const rejected = await agent
      .post(`/api/schedule/variances/${variance.id}/reject`)
      .send({ userId: "u-matt", note: "Pulling a second crew in to hold the date." })
      .expect(200);
    expect(rejected.body.status).toBe("rejected");

    const afterReject = await agent.get("/api/bootstrap").expect(200);
    const stillPlanned = afterReject.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(stillPlanned.endDate).toBe(target.endDate);
    // Rejecting the schedule conclusion doesn't dispute what the crew saw.
    expect(stillPlanned.percentComplete).toBe(5);

    // A resolved variance can't be resolved twice.
    await agent.post(`/api/schedule/variances/${variance.id}/reject`).send({ userId: "u-matt" }).expect(404);

    // Now report again and accept it — this time the plan should move.
    const second = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-harborview",
        jobId: "j-harborview-framing",
        userId: "u-carlos",
        status: "On Site",
        message: "Second crew did not materialise, still behind.",
        percentComplete: 5
      })
      .expect(201);

    const accepted = await agent
      .post(`/api/schedule/variances/${second.body.variance.id}/accept`)
      .send({ userId: "u-matt" })
      .expect(200);
    expect(accepted.body.variance.status).toBe("accepted");

    const afterAccept = await agent.get("/api/bootstrap").expect(200);
    const moved = afterAccept.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(moved.endDate > target.endDate).toBe(true);
    // The baseline is what the slip stays measurable against — accepting must not eat it.
    expect(moved.baselineEnd).toBe(target.baselineEnd);
  });

  it("supersedes an older pending variance when the field reports again", async () => {
    const agent = await testApp();
    const post = (percentComplete: number) =>
      agent
        .post("/api/field-updates")
        .send({
          projectId: "p-harborview",
          jobId: "j-harborview-framing",
          userId: "u-carlos",
          status: "On Site",
          message: `Progress check at ${percentComplete}%.`,
          percentComplete
        })
        .expect(201);

    const first = await post(5);
    const second = await post(10);
    expect(first.body.variance).not.toBeNull();
    expect(second.body.variance).not.toBeNull();

    const pending = await agent.get("/api/schedule/variances?status=pending").expect(200);
    const forJob = pending.body.filter((item: { jobId: string }) => item.jobId === "j-harborview-framing");

    // The PM answers "where is this job now", not every guess on the way there.
    expect(forJob).toHaveLength(1);
    expect(forJob[0].id).toBe(second.body.variance.id);

    const all = await agent.get("/api/schedule/variances").expect(200);
    const superseded = all.body.find((item: { id: string }) => item.id === first.body.variance.id);
    expect(superseded.status).toBe("superseded");
  });

  it("creates delayIQs", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/delayIQs")
      .send({
        projectId: "p-riverside",
        category: "Equipment issue",
        title: "Concrete pump repair",
        impactDays: 1,
        severity: "Low",
        status: "Open",
        description: "Backup pump is scheduled for tomorrow."
      })
      .expect(201);

    expect(response.body.title).toBe("Concrete pump repair");
  });
});
