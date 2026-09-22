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

type Captured = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string; encoding?: string }[];
};
const sent: Captured[] = [];
vi.mock("../src/email.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/email.js")>();
  return {
    ...actual,
    sendMail: vi.fn(async (msg: Captured) => {
      sent.push(msg);
      return { ok: true, mode: "log" as const };
    })
  };
});

/* a real one-pixel PNG, so the bytes that come out the far end can be checked */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const pngUrl = `data:image/png;base64,${PNG}`;

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

  it("carries an attachment through to the mail and names it in the body", async () => {
    const { agent } = await signedIn();
    await agent
      .post("/api/feedback")
      .send({
        category: "bug",
        message: "The Week board clips on my screen.",
        attachments: [{ name: "screenshot.png", type: "image/png", dataUrl: pngUrl }]
      })
      .expect(201);

    const files = sent[0].attachments ?? [];
    expect(files).toHaveLength(1);
    // handed over as base64 TEXT with the encoding declared — not as raw bytes
    expect(files[0]).toEqual({
      filename: "screenshot.png",
      content: PNG,
      contentType: "image/png",
      encoding: "base64"
    });
    // and the recipient can see there is one without scrolling to the bottom
    expect(sent[0].text).toContain("Attached: screenshot.png");
    expect(sent[0].html).toContain("screenshot.png");
  });

  it("takes neither a path in the file name nor a header in the media type", async () => {
    const { agent } = await signedIn();
    await agent
      .post("/api/feedback")
      .send({
        message: "Hi",
        attachments: [{ name: "../../etc/passwd", type: "image/png\r\nBcc: someone@else.test", dataUrl: pngUrl }]
      })
      .expect(201);

    const file = (sent[0].attachments ?? [])[0];
    expect(file.filename).toBe("-..-etc-passwd");
    expect(file.filename).not.toMatch(/[\\/]/);
    // the data URL's own type is the one that describes the bytes, so the declared one is never read
    expect(file.contentType).toBe("image/png");
  });

  it("refuses more files than it said it would take", async () => {
    const { agent } = await signedIn();
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `shot-${i}.png`, type: "image/png", dataUrl: pngUrl }));
    const response = await agent.post("/api/feedback").send({ message: "Hi", attachments: four }).expect(400);
    expect(response.body.error).toMatch(/3 files/i);
    expect(sent).toHaveLength(0);
  });

  it("refuses anything that is not a base64 data URL", async () => {
    const { agent } = await signedIn();
    const response = await agent
      .post("/api/feedback")
      .send({ message: "Hi", attachments: [{ name: "shot.png", type: "image/png", dataUrl: "https://example.test/shot.png" }] })
      .expect(400);
    expect(response.body.error).toMatch(/could not be read/i);
    expect(sent).toHaveLength(0);
  });

  it("refuses a set over the size cap", async () => {
    const { agent } = await signedIn();
    // 14M base64 characters decode to ~10.5MB — just past the 10MB line, and measured
    // from the text, so nothing this large is ever decoded
    const big = `data:image/png;base64,${"A".repeat(14_000_000)}`;
    const response = await agent
      .post("/api/feedback")
      .send({ message: "Hi", attachments: [{ name: "clip.mov", type: "video/quicktime", dataUrl: big }] })
      .expect(400);
    expect(response.body.error).toMatch(/10MB/i);
    expect(sent).toHaveLength(0);
  });

  it("wants a few words, and wants a signed-in person", async () => {
    const { app, agent } = await signedIn();
    const empty = await agent.post("/api/feedback").send({ message: "   " }).expect(400);
    expect(empty.body.error).toMatch(/few words/i);
    await request(app).post("/api/feedback").send({ message: "Anonymous" }).expect(401);
    expect(sent).toHaveLength(0);
  });
});
