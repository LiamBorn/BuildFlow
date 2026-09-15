import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-updates-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

describe("Updates page subscribe", () => {
  it("subscribes an email, normalises it, and counts it once", async () => {
    const app = await testApp();

    const first = await request(app).post("/api/updates/subscribe").send({ email: "Liam.Test@Example.com" }).expect(201);
    expect(first.body.ok).toBe(true);
    expect(first.body.alreadySubscribed).toBe(false);
    expect(first.body.count).toBe(1);

    // Same address in a different case is the same subscriber.
    const again = await request(app).post("/api/updates/subscribe").send({ email: "liam.test@example.com" }).expect(201);
    expect(again.body.alreadySubscribed).toBe(true);
    expect(again.body.count).toBe(1);

    const count = await request(app).get("/api/updates/subscribe").expect(200);
    expect(count.body.count).toBe(1);
  });

  it("rejects an address that is not an email", async () => {
    const app = await testApp();

    const response = await request(app).post("/api/updates/subscribe").send({ email: "nope" }).expect(400);
    expect(response.body.error).toMatch(/valid email/i);

    const count = await request(app).get("/api/updates/subscribe").expect(200);
    expect(count.body.count).toBe(0);
  });

  it("keeps the changelog list separate from the waitlist", async () => {
    const app = await testApp();

    await request(app).post("/api/updates/subscribe").send({ email: "reader@example.com" }).expect(201);

    const waitlist = await request(app).get("/api/waitlist").expect(200);
    expect(waitlist.body.count).toBe(0);
  });
});
