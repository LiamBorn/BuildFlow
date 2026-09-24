/**
 * The public routes that can make BuildFlow do work for a stranger have a ceiling.
 *
 * Three of them take an email address out of the request body and send mail to it:
 * POST /api/waitlist, /api/updates/subscribe and /api/contact-sales. Until now none had a rate
 * limit, which on a laptop is nothing and on a public address is an open relay — a script can make
 * BuildFlow email anyone, as fast as it can ask, which is how a sending domain ends up on a
 * blocklist. It also fills the tables while doing it. Signing up already had a ceiling of ten an
 * hour, so the pattern existed and these were simply missed.
 *
 * POST /api/auth/demo is here for a different reason: it mints a session row per call. Its limit is
 * deliberately loose, because the client falls back to it whenever a bootstrap comes back 401 and a
 * visitor can legitimately reach it several times.
 *
 * The case that matters most is the last one. A limit that also stops the first honest request is
 * not a fix, so every route is checked to still answer the request a real person would make.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-limits-")), "test.sqlite"), reset: true });

/**
 * Call `path` until it is refused, or give up after `ceiling` tries.
 *
 * The bodies passed in have to be ones the route would ACCEPT. A limiter is middleware and runs
 * before the handler parses anything, so it answers 429 to junk just as readily — which means a
 * route whose handler was completely broken would still satisfy these cases if they posted junk.
 * The first draft of this file did post junk, and only noticed because contact-sales rejected the
 * same body in the honest-request case below.
 */
async function untilRefused(app: Awaited<ReturnType<typeof createApp>>, route: string, body: () => object, ceiling = 40) {
  for (let i = 0; i < ceiling; i += 1) {
    const res = await request(app).post(route).send(body());
    if (res.status === 429) return { at: i + 1, res };
  }
  return { at: -1, res: undefined };
}

describe("the public routes that send mail", () => {
  it("lets the first, honest request through — a limit that blocks everyone is not a fix", async () => {
    const app = await freshApp();
    expect((await request(app).post("/api/waitlist").send({ email: "first@example.com" })).status).toBe(201);
    expect((await request(app).post("/api/updates/subscribe").send({ email: "second@example.com" })).status).toBeLessThan(400);
    const sales = await request(app).post("/api/contact-sales").send({
      name: "Dana Reyes",
      email: "dana@example.com",
      company: "Reyes Construction",
      teamSize: "25-50",
      interest: "Scheduling",
      message: "We run twelve crews and want to see the schedule board."
    });
    expect(sales.status).toBeLessThan(400);
  });

  it("stops a script emailing arbitrary addresses through the waitlist", async () => {
    const app = await freshApp();
    const { at, res } = await untilRefused(app, "/api/waitlist", () => ({ email: `v${Math.random()}@example.com` }));
    expect(at, "an unlimited route never refuses").toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(11); // ten an hour, then the refusal
    expect(res!.headers["retry-after"], "a refusal should say when to come back").toBeDefined();
  });

  it("stops the same through the updates list", async () => {
    const app = await freshApp();
    const { at } = await untilRefused(app, "/api/updates/subscribe", () => ({ email: `u${Math.random()}@example.com` }));
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(11);
  });

  it("holds contact sales tighter, because it emails an inbox somebody has to read", async () => {
    const app = await freshApp();
    const { at } = await untilRefused(app, "/api/contact-sales", () => ({
      name: "Dana Reyes",
      email: `d${Math.random()}@example.com`,
      company: "Reyes Construction",
      teamSize: "25-50",
      interest: "Scheduling",
      message: "We run twelve crews and want to see the schedule board."
    }));
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(6);
  });
});

describe("the demo session route", () => {
  it("has a ceiling, so a script cannot mint sessions by the thousand", async () => {
    const app = await freshApp();
    const { at } = await untilRefused(app, "/api/auth/demo", () => ({}), 60);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(31);
  });

  it("is loose enough for the client's own 401 fallback, which a visitor can reach more than once", async () => {
    const app = await freshApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).post("/api/auth/demo").send({})).status, `call ${i + 1} should still work`).toBe(200);
    }
  });
});
