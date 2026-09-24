/**
 * The one request in this API that emails thousands of strangers.
 *
 * `POST /api/waitlist/announce` writes to every waitlist subscriber who has not been written to yet.
 * One accepted call is a mass mailing from BuildFlow's own domain to real people who signed up months
 * earlier — there is no bigger single button here, and `WAITLIST_ADMIN_TOKEN` is the whole of what
 * stands in front of it.
 *
 * It was compared with `!==`, while `secretsMatch` — the constant-time compare this codebase already
 * uses for the ops token — sat two hundred lines away in the same file. And nothing capped the
 * guessing, so it could be ground at line speed. Neither of those is exotic; both are the kind of thing
 * that gets written once and never looked at again because the route is used twice a year.
 *
 * The 401-and-nothing-sent pairing is the point. A status code says what the route answered, not what
 * it did on the way, and this is a route whose side effect is the damage — so the mailer is captured
 * and asked. The last case is the other half: a guard that refuses the real operator has broken the
 * launch announcement instead of protecting it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sent } = vi.hoisted(() => ({ sent: [] as { to?: string }[] }));

vi.mock("../src/email.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/email.js")>();
  return {
    ...actual,
    sendMail: vi.fn(async (message: { to?: string }) => {
      sent.push(message);
      return { ok: true as const, mode: "log" as const };
    })
  };
});

const { createApp } = await import("../src/app.js");

const TOKEN = "wl_a_long_random_launch_token";
const saved = { ...process.env };

beforeEach(() => {
  sent.length = 0;
  process.env.WAITLIST_ADMIN_TOKEN = TOKEN;
});
afterEach(() => {
  process.env = { ...saved };
});

/** An app with somebody on the waitlist, so a successful broadcast has someone to reach. */
async function appWithSubscriber() {
  const app = await createApp({
    dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-announce-")), "test.sqlite"),
    reset: true
  });
  expect((await request(app).post("/api/waitlist").send({ email: "waiting@example.com" })).status).toBe(201);
  sent.length = 0; // the join confirmation is not what these cases are about
  return app;
}

const announce = (app: Awaited<ReturnType<typeof createApp>>, token?: string) => {
  const req = request(app).post("/api/waitlist/announce");
  return (token === undefined ? req : req.set("x-waitlist-token", token)).send({});
};

describe("a caller without the token", () => {
  it("is refused, and nobody is emailed", async () => {
    const app = await appWithSubscriber();
    expect((await announce(app)).status).toBe(401);
    expect(sent, "a 401 that still sent the broadcast would be the whole bug").toHaveLength(0);
  });

  it("gets nowhere with a prefix of the real token", async () => {
    /* What a char-by-char compare leaks. secretsMatch checks length first and then compares in
       constant time, so a prefix is worth exactly as much as nonsense. */
    const app = await appWithSubscriber();
    expect((await announce(app, TOKEN.slice(0, TOKEN.length - 1))).status).toBe(401);
    expect((await announce(app, TOKEN + "x")).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("cannot grind at it, because the route has a ceiling now", async () => {
    const app = await appWithSubscriber();
    let at = -1;
    for (let i = 0; i < 20 && at < 0; i += 1) if ((await announce(app, `guess-${i}`)).status === 429) at = i + 1;
    expect(at, "an unlimited route never refuses").toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(6);
    expect(sent).toHaveLength(0);
  });
});

describe("the operator who has it", () => {
  it("can still send the launch announcement — refusing everyone is not a guard", async () => {
    const app = await appWithSubscriber();
    const res = await announce(app, TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.notified).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(["waiting@example.com"]);
  });

  it("does not write to the same person twice", async () => {
    // Already true, and worth holding: the second call is how a nervous operator checks it worked.
    const app = await appWithSubscriber();
    await announce(app, TOKEN);
    sent.length = 0;
    const again = await announce(app, TOKEN);
    expect(again.body.notified).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("a deployment that never set the token", () => {
  it("says the broadcast is switched off rather than pretending the caller got it wrong", async () => {
    delete process.env.WAITLIST_ADMIN_TOKEN;
    const app = await appWithSubscriber();
    const res = await announce(app, "anything");
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/WAITLIST_ADMIN_TOKEN/);
    expect(sent).toHaveLength(0);
  });
});
