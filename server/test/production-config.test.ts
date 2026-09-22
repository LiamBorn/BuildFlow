/**
 * The branches that only run when NODE_ENV=production.
 *
 * Code that activates only in production and is never exercised anywhere else is where bugs
 * live the longest: nothing fails until it is in front of real users, and by then the cost of
 * being wrong is a session cookie sent over plain HTTP. Three of the four such branches in
 * this server had no test at all, which is what this file is for.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { cookiesAreSecure } from "../src/auth.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-prod-"), "test.sqlite"), reset: true });

const originalEnv = process.env.NODE_ENV;
const originalCors = process.env.CORS_ORIGIN;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalCors === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCors;
});

/** Every Set-Cookie on a response, as one searchable string. */
const cookiesOn = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).join("\n");

describe("the rule for marking cookies HTTPS-only", () => {
  it("is on in production and off in development", () => {
    process.env.NODE_ENV = "production";
    expect(cookiesAreSecure()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(cookiesAreSecure()).toBe(false);
  });

  /**
   * The bug this replaced: one of the three cookies asked `req.secure` instead, which is
   * false behind a TLS-terminating proxy — the ordinary production shape — so it dropped
   * Secure in exactly the deployment that needed it.
   */
  it("still marks a cookie secure on a genuinely HTTPS request outside production", () => {
    process.env.NODE_ENV = "development";
    expect(cookiesAreSecure({ secure: true })).toBe(true);
    expect(cookiesAreSecure({ secure: false })).toBe(false);
  });
});

describe("the session cookie", () => {
  it("is marked Secure in production", async () => {
    process.env.NODE_ENV = "production";
    const app = await freshApp();
    const res = await request(app).post("/api/auth/demo").expect(200);
    const cookies = cookiesOn(res);
    expect(cookies).toMatch(/bf_session=/);
    expect(cookies).toMatch(/Secure/);
    // The flags that do not depend on the environment should be there too.
    expect(cookies).toMatch(/HttpOnly/);
    expect(cookies).toMatch(/SameSite=Lax/i);
  });

  it("is not marked Secure in development, or a dev browser would drop it over http", async () => {
    process.env.NODE_ENV = "development";
    const app = await freshApp();
    const res = await request(app).post("/api/auth/demo").expect(200);
    expect(cookiesOn(res)).not.toMatch(/Secure/);
  });
});

describe("the calendar OAuth state cookie", () => {
  /**
   * This is the cookie the shared rule was introduced for: it used to ask `req.secure`,
   * which is false behind a TLS-terminating proxy, so in a normal production deployment it
   * went out without Secure — carrying an OAuth state and a PKCE verifier.
   */
  it("is marked Secure in production, like every other cookie here", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.OAUTH_GOOGLE_AUTHORIZE_URL = "https://accounts.example.com/authorize";
    try {
      /* Signed in with production OFF on purpose. supertest speaks plain HTTP, and a
         correctly-Secure session cookie is one a client will not send back over http — so
         signing in under production mode gives a 401 on the very next call. (That is worth
         knowing on its own: it is the session cookie's Secure flag proving itself.) The
         session is established first, then production is turned on for the call under test. */
      process.env.NODE_ENV = "development";
      const app = await freshApp();
      const agent = request.agent(app);
      await agent.post("/api/auth/demo").expect(200);

      process.env.NODE_ENV = "production";
      const res = await agent.get("/api/calendar/google/start");
      const cookies = cookiesOn(res);
      expect(cookies, "the start route should have set its state cookie").toMatch(/bf_cal/);
      expect(cookies).toMatch(/Secure/);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.OAUTH_GOOGLE_AUTHORIZE_URL;
    }
  });
});

describe("CORS", () => {
  /**
   * These responses carry credentials, so an origin the browser will let read them is an
   * origin that can read a signed-in workspace. Localhost is waved through off production
   * because that is where the client is served from in development.
   */
  it("allows a localhost origin in development", async () => {
    process.env.NODE_ENV = "development";
    const app = await freshApp();
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5175").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5175");
  });

  it("refuses that same localhost origin in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGIN;
    const app = await freshApp();
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5175").expect(200);
    expect(res.headers["access-control-allow-origin"], "no allow-origin means the browser will not hand the body over").toBeUndefined();
  });

  it("allows exactly what CORS_ORIGIN names in production, and nothing else", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://app.example.com";
    const app = await freshApp();

    const allowed = await request(app).get("/api/health").set("Origin", "https://app.example.com").expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");

    const other = await request(app).get("/api/health").set("Origin", "https://not-us.example.com").expect(200);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("still answers a caller with no origin at all, which is how curl and a server call arrive", async () => {
    process.env.NODE_ENV = "production";
    const app = await freshApp();
    await request(app).get("/api/health").expect(200);
  });
});
