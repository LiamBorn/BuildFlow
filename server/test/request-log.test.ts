/**
 * Request logging. The assertions that matter most are the ones about what must NOT reach a
 * log line: the calendar feed's key, an OAuth code, a one-time token — all of which travel in
 * the query string — and a newline smuggled through the path to forge a line of its own.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { requestLogMode } from "../src/requestLog.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function loggingApp() {
  // The suite runs with logging off so it is not buried; these tests ask for it explicitly.
  process.env.REQUEST_LOG = "text";
  return createApp({ dataFile: path.join(tempDir("buildflow-reqlog-"), "test.sqlite"), reset: true });
}

/** Everything written to stdout/stderr while `work` runs. */
async function captureLog(work: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const out = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
  const err = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
  try {
    await work();
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return lines.join("\n");
}

const originalMode = process.env.REQUEST_LOG;
afterEach(() => {
  if (originalMode === undefined) delete process.env.REQUEST_LOG;
  else process.env.REQUEST_LOG = originalMode;
});

describe("what a request log line may contain", () => {
  it("never writes a query string, so the calendar feed key cannot leak into a log", async () => {
    const app = await loggingApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const feeds = await agent.get("/api/schedule/feeds").expect(200);
    const url: string = feeds.body.crews[0].url;
    const feedPath = url.replace(/^https?:\/\/[^/]+/, "");
    const key = new URL(url).searchParams.get("key")!;
    expect(key.length, "the fixture must actually have a key to leak").toBeGreaterThan(8);

    const logged = await captureLog(() => request(app).get(feedPath).expect(200));

    expect(logged).toContain("/api/feeds/");
    expect(logged, "the secret itself must never be written down").not.toContain(key);
    // The parameter's NAME is kept — enough to know which shape of request this was.
    expect(logged).toMatch(/\?key\b/);
  });

  it("keeps a smuggled newline from forging a second log line", async () => {
    const app = await loggingApp();
    /* The vector is the QUERY PARAMETER NAME, not the path: Express leaves req.path
       percent-encoded, but decodes query keys, so `?x%0A…` arrives carrying a real
       newline. Unsanitised it ends the line and the rest is written as though the server
       had logged it. */
    const logged = await captureLog(() => request(app).get("/api/nope?a%0AGET%20/api/forged%20200%20ok=1"));

    const forged = logged.split("\n").filter((l) => l.trim().startsWith("GET /api/forged"));
    expect(forged, "a caller must not be able to write a log line of its own").toEqual([]);
    expect(logged).toContain("/api/nope");
  });
});

describe("what a request log line says", () => {
  it("records the method, path, status and duration, and hands back the id", async () => {
    const app = await loggingApp();
    let requestId = "";
    const logged = await captureLog(async () => {
      const res = await request(app).get("/api/bootstrap").expect(401);
      requestId = res.headers["x-request-id"];
    });

    expect(requestId, "the id goes back on the response so a report can be traced").toMatch(/^[0-9a-f]{16}$/);
    expect(logged).toContain("GET /api/bootstrap 401");
    expect(logged).toContain(requestId);
    expect(logged).toMatch(/\d+(\.\d+)?ms/);
  });

  it("names the workspace once the request has one", async () => {
    const app = await loggingApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    const logged = await captureLog(() => agent.get("/api/bootstrap").expect(200));
    expect(logged).toMatch(/org-demo/);
  });

  it("drops a healthy health check and keeps a failing one", async () => {
    const app = await loggingApp();
    const quiet = await captureLog(() => request(app).get("/api/health").expect(200));
    expect(quiet, "a load balancer polling this would bury everything else").not.toContain("/api/health");

    const manager = app.locals.storeManager as { main: { ping(): boolean } };
    const ping = vi.spyOn(manager.main, "ping").mockImplementation(() => {
      throw new Error("down");
    });
    try {
      const noisy = await captureLog(() => request(app).get("/api/health").expect(503));
      expect(noisy).toContain("/api/health");
    } finally {
      ping.mockRestore();
    }
  });

  it("logs a request the body parser refused, which never reaches a route", async () => {
    const app = await loggingApp();
    const logged = await captureLog(() => request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json"));
    expect(logged).toContain("POST /api/auth/login 400");
  });
});

describe("how loudly to log", () => {
  it("is off under test and on elsewhere unless told otherwise", () => {
    expect(requestLogMode({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("off");
    expect(requestLogMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("text");
    expect(requestLogMode({ NODE_ENV: "test", REQUEST_LOG: "json" } as NodeJS.ProcessEnv)).toBe("json");
    expect(requestLogMode({ NODE_ENV: "production", REQUEST_LOG: "off" } as NodeJS.ProcessEnv)).toBe("off");
  });

  it("writes one JSON object per request when asked", async () => {
    process.env.REQUEST_LOG = "json";
    const app = await createApp({ dataFile: path.join(tempDir("buildflow-reqlog-json-"), "t.sqlite"), reset: true });
    const logged = await captureLog(() => request(app).get("/api/bootstrap").expect(401));
    const line = logged.split("\n").find((l) => l.trim().startsWith("{"))!;
    expect(JSON.parse(line)).toMatchObject({ method: "GET", path: "/api/bootstrap", status: 401 });
  });
});
