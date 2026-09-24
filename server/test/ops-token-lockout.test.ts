/**
 * Guessing the ops token gets you locked out; holding it never does.
 *
 * `/api/ops/backup`, `/backups`, `/stats` and `/metrics` answer on the public address, and
 * OPS_ADMIN_TOKEN is the only thing in front of them. Behind them: the platform's object counts, its
 * runtime stats, and a backup trigger that writes files. The comparison is constant-time, so a guess
 * learns nothing from how long it took — but nothing stopped a caller guessing as fast as it could
 * ask, which is the part that makes a short token worth trying.
 *
 * A per-request ceiling is the obvious tool and the wrong one, which is why these four were left
 * without a limit when the public routes got theirs: the callers are monitors, a monitor polls, and a
 * limit low enough to slow a guesser throttles the thing you want working when something else is
 * already wrong. A lockout on FAILURE has no such tension, and the two cases below that prove it are
 * the reason to prefer it — a correct token is never counted, and a success clears what came before.
 *
 * The last case is about reusing the login lockout for this. It is the same primitive keyed on the
 * caller instead of an account, and the keys are kept apart by an `ops:` prefix. If that ever stopped
 * being true, locking out a scanner would start locking people out of signing in.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const TOKEN = "the-real-ops-token-and-it-is-long";
const saved = { ...process.env };

beforeEach(() => {
  process.env.OPS_ADMIN_TOKEN = TOKEN;
});
afterEach(() => {
  process.env = { ...saved };
});

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-ops-")), "test.sqlite"), reset: true });

/** One call to a read-only ops route with whatever token (or none). */
const call = (app: Awaited<ReturnType<typeof createApp>>, token?: string) => {
  const req = request(app).get("/api/ops/stats");
  return token === undefined ? req : req.set("x-ops-token", token);
};

describe("a caller guessing the token", () => {
  it("is still simply refused at first — the lockout must not change the ordinary answer", async () => {
    const app = await freshApp();
    const res = await call(app, "not-it");
    expect(res.status).toBe(403);
    expect(res.body.error, "and it should still say how to configure it").toMatch(/OPS_ADMIN_TOKEN/);
  });

  it("is locked out after enough wrong ones, and told when to come back", async () => {
    const app = await freshApp();
    let refused: Awaited<ReturnType<typeof call>> | undefined;
    for (let i = 0; i < 20 && !refused; i += 1) {
      const res = await call(app, `guess-${i}`);
      if (res.status === 429) refused = res;
    }
    expect(refused, "twenty wrong tokens should not all be answered").toBeDefined();
    expect(refused!.headers["retry-after"]).toBeDefined();
    expect(Number(refused!.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("is locked out of the other three routes too, not just the one it guessed at", async () => {
    const app = await freshApp();
    for (let i = 0; i < 12; i += 1) await call(app, `guess-${i}`);
    for (const route of ["/api/ops/backups", "/api/ops/metrics"]) {
      expect((await request(app).get(route).set("x-ops-token", "another-guess")).status, route).toBe(429);
    }
    expect((await request(app).post("/api/ops/backup").set("x-ops-token", "another-guess")).status).toBe(429);
  });
});

describe("a caller that has the token", () => {
  it("is never limited, however often it asks — a monitor polls", async () => {
    /* The case this design exists for. Thirty successful calls is more than the failure threshold,
       so anything counting REQUESTS rather than failures would have refused one of these. */
    const app = await freshApp();
    for (let i = 0; i < 30; i += 1) {
      expect((await call(app, TOKEN)).status, `call ${i + 1}`).toBe(200);
    }
  });

  it("clears what came before, so fixing a bad token and retrying does not accumulate", async () => {
    const app = await freshApp();
    for (let i = 0; i < 9; i += 1) expect((await call(app, "wrong")).status).toBe(403);
    expect((await call(app, TOKEN)).status, "the ninth failure must not have locked it").toBe(200);
    // the count is back to zero, so another run of nine is still answered rather than refused
    for (let i = 0; i < 9; i += 1) expect((await call(app, "wrong")).status, `retry ${i + 1}`).toBe(403);
  });
});

describe("when no token is configured", () => {
  it("keeps answering the 403 that tells you to set one, rather than a 429 that does not", async () => {
    // In production an unset OPS_ADMIN_TOKEN closes these routes outright, so there is no secret to
    // protect and nothing worth counting. The useful message has to survive.
    delete process.env.OPS_ADMIN_TOKEN;
    process.env.NODE_ENV = "production";
    const app = await freshApp();
    for (let i = 0; i < 15; i += 1) {
      const res = await call(app);
      expect(res.status, `call ${i + 1}`).toBe(403);
      expect(res.body.error).toMatch(/OPS_ADMIN_TOKEN/);
    }
  });
});

describe("the lockout it borrows", () => {
  it("does not lock anybody out of signing in", async () => {
    const app = await freshApp();
    for (let i = 0; i < 12; i += 1) await call(app, `guess-${i}`);
    expect((await call(app, "still-guessing")).status, "the ops lockout should be in force").toBe(429);

    const agent = request.agent(app);
    const signup = await agent.post("/api/auth/signup").send({
      name: "Real Owner",
      email: "owner@example.com",
      password: "Str0ng!Passphrase42",
      orgName: "Real Co.",
      acceptTerms: true
    });
    expect(signup.status, "a locked-out scanner must not close the front door").toBeLessThan(400);
  });
});
