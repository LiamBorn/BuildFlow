/**
 * The shared demo may be read and not changed.
 *
 * `POST /api/auth/demo` hands every signed-out visitor a session for ONE account —
 * demo@buildflow.com, role owner — in ONE workspace, and stores.ts maps that workspace to the main
 * store. So on a developer's laptop the demo is one person poking at seed data, and on a public
 * address it is every visitor at once, each an owner, each able to edit or delete what the others
 * are looking at. docs/replit.md had already written that down as something to know before real
 * customers use it.
 *
 * Both halves matter here and a test for either alone would be misleading. Refusing writes is the
 * point; but a gate that also blocked the reads would turn the demo into a wall of 403s, and the
 * cheapest way to "pass" a write-refusal test is to break everything.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { demoLockOn, readOnlyRefusal } from "../src/permissions.js";

/*
 * The lock is a property of a public deployment, not of the code: on a developer's machine and in
 * this suite the demo is the sandbox almost every other case signs in as, so locking it everywhere
 * would lock the workbench rather than the shop window. DEMO_READ_ONLY forces it on here, which is
 * how these cases get a locked demo without having to pretend to be deployed.
 */
beforeEach(() => {
  process.env.DEMO_READ_ONLY = "on";
});
afterEach(() => {
  delete process.env.DEMO_READ_ONLY;
});

async function bootedApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-demo-ro-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

/** A demo session, as the landing page's "preview the live demo" gets one. */
async function demoAgent(app: Awaited<ReturnType<typeof createApp>>) {
  const agent = request.agent(app);
  const login = await agent.post("/api/auth/demo").send({});
  expect(login.status, "the demo session itself must still be issued").toBe(200);
  expect(login.body.account.email, "and it must be the shared demo account").toBe("demo@buildflow.com");
  return agent;
}

describe("the rule itself", () => {
  it("never refuses a public route, which a stranger could call with no session at all", () => {
    expect(readOnlyRefusal("public", "POST", "POST /api/waitlist")).toBeNull();
  });

  it("lets every safe method through", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(readOnlyRefusal("schedule.read", method, `${method} /api/bootstrap`)).toBeNull();
    }
  });

  it("refuses a change that no capability name would have given away", () => {
    // These three mutate without a name ending in .write, which is why the rule reads the METHOD.
    for (const capability of ["field.report", "variance.resolve", "delayiq.log"] as const) {
      const refusal = readOnlyRefusal(capability, "POST", "POST /api/whatever");
      expect(refusal?.status).toBe(403);
      expect(refusal?.body.code).toBe("demo-read-only");
    }
  });

  it("refuses a signed-in route too, not only ones with a capability", () => {
    // PUT /api/me/settings/:key is "signed-in", and the demo ACCOUNT is shared, so one visitor's
    // setting would be every visitor's.
    expect(readOnlyRefusal("signed-in", "PUT", "PUT /api/me/settings/:key")?.status).toBe(403);
  });

  it("keeps feedback, which says something about BuildFlow rather than changing the workspace", () => {
    expect(readOnlyRefusal("signed-in", "POST", "POST /api/feedback")).toBeNull();
  });
});

describe("a demo session against the real app", () => {
  it("can still read the workspace it was given", async () => {
    const app = await bootedApp();
    const agent = await demoAgent(app);

    const bootstrap = await agent.get("/api/bootstrap");
    expect(bootstrap.status).toBe(200);
    expect(Array.isArray(bootstrap.body.jobs), "the demo has to actually show something").toBe(true);
    expect(bootstrap.body.jobs.length).toBeGreaterThan(0);
  });

  it("is refused when it tries to change a job, with a reason a person can act on", async () => {
    const app = await bootedApp();
    const agent = await demoAgent(app);
    const { body } = await agent.get("/api/bootstrap");
    const job = body.jobs[0];

    const patch = await agent.patch(`/api/jobs/${job.id}`).send({ name: "Renamed by a stranger" });
    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe("demo-read-only");
    expect(patch.body.error).toMatch(/shared and read-only/i);
    expect(patch.body.error, "it should say what to do instead").toMatch(/free workspace/i);

    // and the job is untouched, which is the thing the next visitor cares about
    const after = await agent.get("/api/bootstrap");
    expect(after.body.jobs.find((j: { id: string }) => j.id === job.id).name).toBe(job.name);
  });

  it("cannot delete a project either, which is the cheap way to ruin it for everyone", async () => {
    const app = await bootedApp();
    const agent = await demoAgent(app);
    const { body } = await agent.get("/api/bootstrap");
    const project = body.projects[0];

    expect((await agent.delete(`/api/projects/${project.id}`)).status).toBe(403);
    const after = await agent.get("/api/bootstrap");
    expect(after.body.projects.some((p: { id: string }) => p.id === project.id)).toBe(true);
  });

  it("cannot write a shared per-account setting, which would follow every other visitor around", async () => {
    const app = await bootedApp();
    const agent = await demoAgent(app);
    expect((await agent.put("/api/me/settings/tutorial:seen").send({ value: "yes" })).status).toBe(403);
  });

  it("can still join the waitlist, because anyone with no session at all can", async () => {
    const app = await bootedApp();
    const agent = await demoAgent(app);
    const joined = await agent.post("/api/waitlist").send({ email: "visitor@example.com" });
    expect(joined.status).toBe(201);
  });

  it("leaves a real signed-in account free to write, so the gate is the demo's and not everyone's", async () => {
    const app = await bootedApp();
    const agent = request.agent(app);
    const signup = await agent.post("/api/auth/signup").send({
      name: "Real Owner",
      email: "owner@example.com",
      password: "Str0ng!Passphrase42",
      orgName: "Real Co.",
      acceptTerms: true
    });
    expect(signup.status, "a real registration must still work").toBeLessThan(400);

    const bootstrap = await agent.get("/api/bootstrap");
    expect(bootstrap.status).toBe(200);
    // A fresh workspace has no jobs to patch, so the point is simply that this is NOT refused as a
    // demo: whatever the answer is, it is not the demo refusal.
    const created = await agent.post("/api/projects").send({
      name: "First project",
      location: "Site A",
      type: "Commercial",
      contractType: "Lump Sum",
      status: "In Progress",
      targetCompletion: "2026-12-01"
    });
    expect(created.body?.code).not.toBe("demo-read-only");
  });
});

describe("where the lock applies", () => {
  /* Asked of the function rather than over HTTP, because NODE_ENV=production also makes the session
     cookie Secure — supertest talks plain HTTP, so the request would arrive with no session and 401
     instead of 403, and the case would be measuring the cookie rather than the lock. */
  it("is on in production, which is the address the problem is about", () => {
    expect(demoLockOn({ NODE_ENV: "production" })).toBe(true);
  });

  it("is off on a developer's machine, where the demo is the sandbox they work in", () => {
    expect(demoLockOn({ NODE_ENV: "development" })).toBe(false);
    expect(demoLockOn({})).toBe(false);
  });

  it("lets DEMO_READ_ONLY force it either way, including off in production", () => {
    expect(demoLockOn({ NODE_ENV: "development", DEMO_READ_ONLY: "on" })).toBe(true);
    expect(demoLockOn({ NODE_ENV: "production", DEMO_READ_ONLY: "off" })).toBe(false);
    expect(demoLockOn({ NODE_ENV: "production", DEMO_READ_ONLY: " OFF " })).toBe(false);
  });

  it("does not lock the suite itself, which signs in as the demo nearly everywhere", async () => {
    delete process.env.DEMO_READ_ONLY;
    const app = await bootedApp();
    const agent = await demoAgent(app);
    const { body } = await agent.get("/api/bootstrap");
    const patch = await agent.patch(`/api/jobs/${body.jobs[0].id}`).send({ name: "Renamed locally" });
    expect(patch.body?.code, "75 server cases write as the demo account").not.toBe("demo-read-only");
  });
});
