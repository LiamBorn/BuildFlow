import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function freshApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-hardening-test-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

const originalNodeEnv = process.env.NODE_ENV;
const originalOpsToken = process.env.OPS_ADMIN_TOKEN;
const originalTrustProxy = process.env.TRUST_PROXY;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalOpsToken === undefined) delete process.env.OPS_ADMIN_TOKEN;
  else process.env.OPS_ADMIN_TOKEN = originalOpsToken;
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrustProxy;
});

describe("a client cannot choose its own rate-limit bucket", () => {
  /**
   * The limiters key on the client address, and that address used to be read straight
   * out of X-Forwarded-For — a header anyone can set. Rotating it gave a fresh bucket
   * per request, which walked through the cap on "email me a reset link" and turned it
   * into a mail cannon aimed at any address. With no TRUST_PROXY configured the header
   * must be ignored entirely, so a rotating attacker is capped exactly like a fixed one.
   */
  it("ignores X-Forwarded-For when no proxy has been declared", async () => {
    const app = await freshApp();
    const send = (spoofedIp: string) =>
      request(app).post("/api/auth/reset/request").set("X-Forwarded-For", spoofedIp).send({ email: "nobody@example.com" });

    // The cap is 5 per window; each of these claims to be a different client.
    for (let i = 0; i < 5; i += 1) {
      const res = await send(`203.0.113.${i}`);
      expect(res.status, `request ${i + 1} should still be under the cap`).not.toBe(429);
    }
    const blocked = await send("203.0.113.99");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("honours X-Forwarded-For once TRUST_PROXY says a proxy is in front", async () => {
    process.env.TRUST_PROXY = "1";
    const app = await freshApp();
    // Same rotation, but now the deployment has declared a proxy that rewrites the
    // header, so each address is a genuinely different client and gets its own bucket.
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app)
        .post("/api/auth/reset/request")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "nobody@example.com" });
      expect(res.status, `distinct client ${i + 1} should not be rate limited`).not.toBe(429);
    }
  });
});


describe("baseline response headers", () => {
  it("tells browsers not to sniff, frame, or leak the referer", async () => {
    const app = await freshApp();
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});

