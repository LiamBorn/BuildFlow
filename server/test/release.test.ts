import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { CURRENT_RELEASE } from "@buildflow/shared";
import { createApp } from "../src/app.js";

async function freshApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-release-test-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

/**
 * The website's update notification asks this route which release the server is and offers an
 * update when it is newer than the release the page was built from (2026-09-27). So: nobody has to
 * be signed in to ask, the answer is exactly the shared release, and it is never cached — a copy
 * that read an old answer from a cache would never find out it is out of date.
 */
describe("GET /api/release", () => {
  it("answers anyone with the release this server was built from, never from a cache", async () => {
    const app = await freshApp();
    const res = await request(app).get("/api/release").expect(200);
    expect(res.body).toEqual(CURRENT_RELEASE);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
