/**
 * The headers a public deployment needs, and the two that are easy to get wrong.
 *
 * BuildFlow now serves its own pages from the API's address (serveClient.ts), so it is a whole
 * website on one origin rather than a JSON API behind someone else's. That brings a
 * Content-Security-Policy into scope — it governs a DOCUMENT, and until 4569f73 no document came
 * from here — and HSTS, because the address is https.
 *
 * Both have a failure mode worse than being absent. A policy sent on the wrong responses is noise
 * nobody reads; HSTS sent over plain http pins a developer's browser to https for localhost, which
 * they then have to go and undo in browser settings. So the cases below check WHERE each one is sent
 * as carefully as what it says.
 *
 * The img-src case is the one to keep. The first draft of the policy was written from the imports and
 * said `img-src 'self' data: blob:`, which looked complete and blocked every photograph on the public
 * marketing pages — about twenty of them, hotlinked from Unsplash and cdn.21st.dev. It was found by
 * loading the built site under the policy and reading the violations, not by reading the code.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { serveClient } from "../src/serveClient.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function clientBuild(): string {
  const dir = tempDir("buildflow-sec-dist-");
  fs.writeFileSync(path.join(dir, "index.html"), '<!doctype html><html><body><div id="root"></div></body></html>');
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "index-abc123.js"), "console.log('BuildFlow');");
  return dir;
}

const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-sec-"), "test.sqlite"), reset: true });

afterEach(() => {
  delete process.env.CONTENT_SECURITY_POLICY;
});

describe("the page's Content-Security-Policy", () => {
  it("is sent with the page", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const res = await request(app).get("/").expect(200);
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("is NOT sent with the API, where a document policy means nothing", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("allows the hosts the marketing pages actually load photographs from", async () => {
    /* This is the case that would have caught the first draft. Both hosts serve <img> on public
       pages — Unsplash on templates, customers and help; cdn.21st.dev in the nav's hover links — and
       a policy without them renders the public site with every photograph missing. */
    const app = await freshApp();
    serveClient(app, clientBuild());
    const csp = (await request(app).get("/")).headers["content-security-policy"];
    const imgSrc = csp.split(";").find((part: string) => part.trim().startsWith("img-src"));
    expect(imgSrc).toContain("https://images.unsplash.com");
    expect(imgSrc).toContain("https://cdn.21st.dev");
    expect(imgSrc, "attachments are previewed through URL.createObjectURL").toContain("blob:");
  });

  it("allows the font host index.html links, and inline styles, which React sets everywhere", async () => {
    const app = await freshApp();
    serveClient(app, clientBuild());
    const csp = (await request(app).get("/")).headers["content-security-policy"];
    const part = (name: string) => csp.split(";").find((p: string) => p.trim().startsWith(name)) ?? "";
    expect(part("style-src")).toContain("https://fonts.googleapis.com");
    expect(part("font-src")).toContain("https://fonts.gstatic.com");
    // style attributes fall under style-src-attr, which falls back to style-src
    expect(part("style-src"), "the product sets style attributes from React").toContain("'unsafe-inline'");
  });

  it("does not allow inline SCRIPT, which the built page never needs", async () => {
    // Vite emits one module tag pointing at /assets and no inline script, so there is nothing to
    // excuse here. If that ever changes this case is the one that should be argued with.
    const app = await freshApp();
    serveClient(app, clientBuild());
    const csp = (await request(app).get("/")).headers["content-security-policy"];
    const scriptSrc = csp.split(";").find((p: string) => p.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("can be turned off from the environment, without a redeploy of different source", async () => {
    process.env.CONTENT_SECURITY_POLICY = "off";
    const app = await freshApp();
    serveClient(app, clientBuild());
    const res = await request(app).get("/").expect(200);
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });
});

describe("HSTS", () => {
  it("is not sent over plain http, which would pin a developer's browser to https for localhost", async () => {
    const app = await freshApp();
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("is sent when the proxy says the connection was https", async () => {
    const app = await freshApp();
    app.set("trust proxy", 1); // TRUST_PROXY=1, which .replit passes
    const res = await request(app).get("/api/health").set("X-Forwarded-Proto", "https").expect(200);
    expect(res.headers["strict-transport-security"]).toBe("max-age=15552000; includeSubDomains");
  });

  it("does not ask to be preloaded, which is a submission nobody here can make for a domain", async () => {
    const app = await freshApp();
    app.set("trust proxy", 1);
    const res = await request(app).get("/api/health").set("X-Forwarded-Proto", "https");
    expect(res.headers["strict-transport-security"]).not.toContain("preload");
  });
});
