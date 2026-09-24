/**
 * A proxy in front that nobody trusted is noticed, once.
 *
 * TRUST_PROXY unset is the safe default and this does not change it: `req.ip` is then the socket
 * address, which a client cannot choose, so nobody can mint a fresh rate-limit bucket per request by
 * sending their own X-Forwarded-For. The problem is the other direction — behind a load balancer every
 * request arrives FROM the proxy, so all visitors share one bucket, and the limiters stop being
 * per-visitor without anything saying so:
 *
 *   · the ops lockout refuses after ten wrong tokens from one address. Shared, a scanner locks the
 *     operator out of /api/ops as well, at the moment they most need it.
 *   · the public ceilings become global — one caller's ten waitlist signups spend everyone's.
 *   · req.secure is false, so HSTS is never sent no matter how the connection really arrived.
 *
 * .replit passes TRUST_PROXY=1, so this is about the deployment that is not Replit's. It keys on a
 * forwarded header being present rather than on NODE_ENV, because a server genuinely exposed with
 * nothing in front should hear nothing at all — that case has a test of its own below, since a
 * warning that cries wolf is how the ones that matter get ignored.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, proxyHeaderWarning } from "../src/app.js";

const saved = { ...process.env };

beforeEach(() => {
  delete process.env.TRUST_PROXY;
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-proxy-")), "test.sqlite"), reset: true });

describe("the rule", () => {
  it("says nothing when the deployment has declared its proxy", () => {
    expect(proxyHeaderWarning(true, { "x-forwarded-for": "203.0.113.9" })).toBeNull();
  });

  it("says nothing with no forwarded header — a server with nothing in front is correct as it is", () => {
    expect(proxyHeaderWarning(false, {})).toBeNull();
    expect(proxyHeaderWarning(false, { host: "localhost:4300", "user-agent": "curl" })).toBeNull();
  });

  it("speaks up when a forwarded header arrives and no proxy was declared", () => {
    expect(proxyHeaderWarning(false, { "x-forwarded-for": "203.0.113.9" })).toBeTruthy();
    expect(proxyHeaderWarning(false, { "x-forwarded-proto": "https" }), "either header is enough").toBeTruthy();
  });

  it("names the variable and what is actually broken, not just that something is", () => {
    const message = proxyHeaderWarning(false, { "x-forwarded-proto": "https" })!;
    expect(message).toContain("TRUST_PROXY");
    expect(message, "the shared bucket is the consequence people need to hear").toMatch(/bucket|rate-limit/i);
    expect(message).toMatch(/HSTS/);
  });
});

describe("the server", () => {
  it("warns on a forwarded request, and only once however many arrive", async () => {
    const app = await freshApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 4; i += 1) {
      await request(app).get("/api/health").set("X-Forwarded-For", `203.0.113.${i}`);
    }
    const about = warn.mock.calls.map((c) => String(c[0])).filter((line) => line.includes("TRUST_PROXY"));
    expect(about.length, "four forwarded requests, one line — a line each would bury the log").toBe(1);
  });

  it("stays silent for the whole life of a deployment that has declared its proxy", async () => {
    process.env.TRUST_PROXY = "1";
    const app = await freshApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await request(app).get("/api/health").set("X-Forwarded-For", "203.0.113.9");
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("TRUST_PROXY"))).toHaveLength(0);
  });

  it("stays silent for ordinary local requests", async () => {
    const app = await freshApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await request(app).get("/api/health");
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("TRUST_PROXY"))).toHaveLength(0);
  });
});
