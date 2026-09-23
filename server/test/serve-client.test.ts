/**
 * One process, one address: in production the API server serves the built pages too
 * (serveClient.ts), so the landing page, signing in and the program live where the API does.
 * Written 2026-09-23 for running BuildFlow on Replit (docs/replit.md).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { serveClient } from "../src/serveClient.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A client build as Vite writes it: the page, a hashed script under assets/, and a public file. */
function clientBuild(): string {
  const dir = tempDir("buildflow-dist-");
  fs.writeFileSync(path.join(dir, "index.html"), '<!doctype html><html><body><div id="root"></div></body></html>');
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "index-3f9a1c.js"), "console.log('BuildFlow');");
  fs.writeFileSync(path.join(dir, "buildflow-logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return dir;
}

const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-pages-"), "test.sqlite"), reset: true });

describe("the built pages, from the API's own address", () => {
  it("answers the landing page at / instead of redirecting to a separate client", async () => {
    const app = await freshApp();
    expect(serveClient(app, clientBuild())).toBe(true);
    const res = await request(app).get("/").expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain('<div id="root">');
    // never cached, so a release is picked up on the next load
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("answers the page for a deep link, since the program routes in the browser", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const res = await request(app).get("/plans-overview").expect(200);
    expect(res.text).toContain('<div id="root">');
  });

  it("caches the hashed files for a year, and answers a missing one with a 404, not the page", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const script = await request(app).get("/assets/index-3f9a1c.js").expect(200);
    expect(script.headers["content-type"]).toMatch(/javascript/);
    expect(script.headers["cache-control"]).toMatch(/max-age=31536000/);
    expect(script.headers["cache-control"]).toMatch(/immutable/);
    const missing = await request(app).get("/assets/index-old.js").expect(404);
    expect(missing.text).not.toContain('<div id="root">');
    await request(app).get("/logo-that-is-not-there.png").expect(404);
  });

  it("serves the public files beside the page", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const res = await request(app).get("/buildflow-logo.png").expect(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
  });

  it("leaves the API answering as the API, never with the page", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toEqual({ ok: true });
    const unknown = await request(app).get("/api/not-a-route");
    expect(unknown.status).toBe(404);
    expect(unknown.text).not.toContain('<div id="root">');
    // the baseline headers still reach the pages
    const page = await request(app).get("/");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("changes nothing without a build: / still sends a visitor to the client's own address", async () => {
    const app = await freshApp();
    expect(serveClient(app, tempDir("buildflow-no-dist-"))).toBe(false);
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBeTruthy();
  });
});
