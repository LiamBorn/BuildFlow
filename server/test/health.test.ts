/**
 * The health check a load balancer reads. It used to answer {ok:true} unconditionally, so an
 * instance whose database had stopped answering still reported itself healthy and kept its
 * place in the pool — the only thing it proved was that the process could still serve a route.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { BuildFlowStore } from "../src/database.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

describe("the health check", () => {
  it("reports ok while the database answers", async () => {
    const dir = tempDir("buildflow-health-");
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  /**
   * The check used to answer {ok:true} without asking anything, so an instance whose
   * database had stopped answering still reported itself healthy and kept its place in the
   * load balancer. 503 is the code a balancer acts on.
   */
  it("reports 503 when the database stops answering", async () => {
    const dir = tempDir("buildflow-health-down-");
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const manager = app.locals.storeManager as { main: BuildFlowStore };
    const ping = vi.spyOn(manager.main, "ping").mockImplementation(() => {
      throw new Error("database file is gone");
    });
    try {
      const res = await request(app).get("/api/health").expect(503);
      expect(res.body.ok).toBe(false);
    } finally {
      ping.mockRestore();
    }
  });
});
