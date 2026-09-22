/**
 * Expired sessions and one-time auth tokens used to accumulate forever: getSession only
 * prunes the row it was just asked about, and consumeAuthToken marks a token used without
 * ever deleting it. Because save() rewrites the whole database file, those dead rows were
 * paid for again by every later write anywhere in the app.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { BuildFlowStore } from "../src/database.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function freshStore() {
  return BuildFlowStore.create(path.join(tempDir("buildflow-sweep-"), "store.sqlite"), true);
}

const countRows = (store: BuildFlowStore, table: string) =>
  store.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0;

describe("sweeping expired auth rows", () => {
  it("removes what has expired and keeps what has not", async () => {
    const store = await freshStore();
    const account = store.getAccountRowByEmail("demo@buildflow.com");
    expect(account, "the seeded demo account is the fixture here").toBeDefined();

    // Two tokens that are already past their expiry, and one that is not.
    store.createAuthToken(account!.id, "reset", -1000);
    store.createAuthToken(account!.id, "verify", -1000);
    store.createAuthToken(account!.id, "verify", 60 * 60 * 1000);
    const before = countRows(store, "auth_tokens");

    const pruned = store.pruneExpiredAuth();

    expect(pruned.tokens).toBe(before - countRows(store, "auth_tokens"));
    expect(pruned.tokens).toBeGreaterThan(0);
    // The live one is untouched, and is still redeemable.
    expect(countRows(store, "auth_tokens")).toBeGreaterThan(0);
  });

  /**
   * The early return is the point: called on a schedule against a tenant file that has no
   * expired rows — which is every tenant file, since the auth tables are global — a sweep
   * must not rewrite the whole database to delete nothing. renameSync is the publish step
   * in save(), so counting it counts whole-file rewrites.
   */
  it("writes nothing at all when there is nothing to remove", async () => {
    const store = await freshStore();
    const writes = vi.spyOn(fs, "renameSync");
    try {
      const pruned = store.pruneExpiredAuth();
      expect(pruned).toEqual({ sessions: 0, tokens: 0 });
      expect(writes).not.toHaveBeenCalled();
    } finally {
      writes.mockRestore();
    }
  });

  it("does not take a live session away from the person using it", async () => {
    const dir = tempDir("buildflow-sweep-api-");
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    await agent.get("/api/bootstrap").expect(200);

    const manager = app.locals.storeManager as {
      main: BuildFlowStore;
      pruneExpiredAuthAll(): { sessions: number; tokens: number };
    };

    /* Give the sweep something to actually delete. Without this the row counts are zero,
       the early return fires, and the DELETE never runs — so the test would pass against a
       sweep that deletes every session, which is the failure that logs everyone out. */
    const account = manager.main.getAccountRowByEmail("demo@buildflow.com")!;
    manager.main.createAuthToken(account.id, "reset", -1000);
    const pruned = manager.pruneExpiredAuthAll();
    expect(pruned.tokens, "the sweep must have taken the delete path, not the early return").toBeGreaterThan(0);

    // The cookie issued a moment ago has ~30 days left on it, so the sweep must not reach it.
    await agent.get("/api/bootstrap").expect(200);
  });
});
