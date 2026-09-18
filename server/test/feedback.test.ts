/**
 * "Give feedback", from the Dashboard tab.
 *
 * The two things the user asked for are the two things asserted: every message goes to the
 * one inbox, and the mail says WHICH COMPANY wrote it — read off the session, so a body that
 * claims to be someone else changes nothing. The mailer is mocked at the module boundary; what
 * is captured is exactly what sendMail would have been handed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
vi.mock("../src/email.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/email.js")>();
  return {
    ...actual,
    sendMail: vi.fn(async (msg: { to: string; subject: string; text: string; html: string }) => {
      sent.push(msg);
      return { ok: true, mode: "log" as const };
    })
  };
});

import { createApp } from "../src/app.js";

const signedIn = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-feedback-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
    .expect(201);
  // signup itself mails a "Confirm your email" through the same mocked sendMail; this test is about
  // what the feedback route sends, so the outbox starts empty from here
  sent.length = 0;
  return { app, agent };
};

describe("POST /api/feedback", () => {
  beforeEach(() => {
    sent.length = 0;
    delete process.env.FEEDBACK_EMAIL;
  });
  afterEach(() => {
    delete process.env.FEEDBACK_EMAIL;
  });

  it("sends the feedback to the product owner's inbox, naming the company and the person", async () => {
    const { agent } = await signedIn();
    const response = await agent
      .post("/api/feedback")
      .send({ category: "idea", message: "A weather overlay on the Week board would save us a tab.", page: "dashboard" })
      .expect(201);
    expect(response.body).toEqual({ ok: true, mode: "log" });

    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("ljsantos020803@gmail.com");
    // the company is in the subject, so the inbox reads who wrote before it is opened
    expect(mail.subject).toBe("BuildFlow feedback from Asphalt Co · Idea");
    expect(mail.text).toContain("Company:  Asphalt Co (Free plan");
    expect(mail.text).toContain("Dana Brooks <dana@asphaltco.com>");
    expect(mail.text).toContain("A weather overlay on the Week board would save us a tab.");
    expect(mail.html).toContain("Asphalt Co");
    expect(mail.html).toContain("dana@asphaltco.com");
  });

  it("identifies the company from the session, whatever the body claims", async () => {
    const { agent } = await signedIn();
    await agent
      .post("/api/feedback")
      .send({ category: "bug", message: "Hi", company: { name: "Someone Else Inc" }, person: { email: "x@y.z" } })
      .expect(201);
    expect(sent[0].subject).toContain("Asphalt Co");
    expect(sent[0].text).not.toContain("Someone Else Inc");
    expect(sent[0].text).not.toContain("x@y.z");
  });

  it("honours FEEDBACK_EMAIL when the operator sets one", async () => {
    process.env.FEEDBACK_EMAIL = "product@example.test";
    const { agent } = await signedIn();
    await agent.post("/api/feedback").send({ message: "Routed elsewhere." }).expect(201);
    expect(sent[0].to).toBe("product@example.test");
  });

  it("wants a few words, and wants a signed-in person", async () => {
    const { app, agent } = await signedIn();
    const empty = await agent.post("/api/feedback").send({ message: "   " }).expect(400);
    expect(empty.body.error).toMatch(/few words/i);
    await request(app).post("/api/feedback").send({ message: "Anonymous" }).expect(401);
    expect(sent).toHaveLength(0);
  });
});
