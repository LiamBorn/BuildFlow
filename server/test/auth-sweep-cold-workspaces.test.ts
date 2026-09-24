/**
 * The auth sweep reaches a workspace nobody has opened.
 *
 * `pruneExpiredAuthAll` walked the cache alone, and at boot the cache holds only the main store. So a
 * workspace's expired sessions and used-up tokens were swept only if somebody happened to sign into it
 * during that process's life AND the daily tick came round afterwards. A workspace nobody visited was
 * never swept at all — which is exactly the set of rows the sweep exists to remove.
 *
 * `backupAll` had the same bug and was fixed; its own comment records finding 19 of 20 workspace
 * databases with no backup the app had ever taken. This is its neighbour twenty lines down, which was
 * not fixed at the same time. That is worth saying because it is the ordinary way this happens: the
 * bug was understood, written down, and the function beside it kept it.
 *
 * It matters beyond tidiness. save() rewrites the WHOLE file, so a row nobody can use any more is paid
 * for again by every later write in that workspace, for as long as it exists.
 *
 * The last case is about HOW the cold ones are reached. Opening a file directly, behind the cache,
 * means a request can open the same org through the cache a moment later — and two live stores writing
 * whole-file images of one file is last-save-wins, where one of them loses its rows silently. The sweep
 * goes through getOrgStore so there is only ever one store per file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildFlowStore } from "../src/database.js";
import { StoreManager } from "../src/stores.js";

async function managerWithColdWorkspaces(count: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-coldsweep-"));
  const main = await BuildFlowStore.create(path.join(dir, "main.sqlite"), true);
  const warm = new StoreManager(main, { maxResidentStores: 2 });

  const account = main.getAccountRowByEmail("demo@buildflow.com")!;
  for (let n = 1; n <= count; n += 1) {
    const store = await warm.getOrgStore(`cold-${n}`);
    store.createAuthToken(account.id, "reset", -1000); // already expired
  }

  /* A brand-new manager over the same directory: its cache holds only the main store, which is exactly
     the state a freshly booted server is in, and the state the old sweep could not see past. */
  const fresh = new StoreManager(main, { maxResidentStores: 2 });
  return { manager: fresh, count, account };
}

describe("the daily auth sweep", () => {
  it("removes expired tokens from workspaces nobody has opened this process", async () => {
    const { manager, count } = await managerWithColdWorkspaces(5);
    const pruned = await manager.pruneExpiredAuthAll();
    expect(pruned.tokens, `each of the ${count} cold workspaces had one expired token`).toBeGreaterThanOrEqual(count);
  });

  it("actually deletes them, rather than only counting them", async () => {
    /* The first assertion is what stops this passing vacuously: without it, a sweep that never
       reaches a cold workspace finds nothing twice and "nothing left" is trivially true. */
    const { manager } = await managerWithColdWorkspaces(3);
    const first = await manager.pruneExpiredAuthAll();
    expect(first.tokens, "the first sweep has to have found them").toBeGreaterThanOrEqual(3);
    const second = await manager.pruneExpiredAuthAll();
    expect(second.tokens, "and the second should find nothing left").toBe(0);
  });

  it("leaves a token that has not expired alone", async () => {
    /* The failure this guards is the one that logs everybody out: a sweep that deletes the table
       rather than the expired rows passes every count above and is a catastrophe.

       Asserted on the ROWS rather than through consumeAuthToken, which was the first version and was
       wrong: accounts are global and live in the main store, so consuming a tenant store's token there
       returns undefined for a perfectly valid row and the test fails for a reason that has nothing to
       do with sweeping. */
    const { manager, account } = await managerWithColdWorkspaces(1);
    const store = await manager.getOrgStore("cold-1");
    store.createAuthToken(account.id, "verify", 24 * 60 * 60 * 1000); // and one that has not expired
    const count = () => store.get<{ n: number }>("SELECT COUNT(*) AS n FROM auth_tokens")?.n ?? 0;
    expect(count(), "one expired from the fixture, one live").toBe(2);

    await manager.pruneExpiredAuthAll();
    expect(count(), "the expired one goes and the live one stays").toBe(1);
    const survivor = store.get<{ expiresAt: string }>("SELECT expiresAt FROM auth_tokens");
    expect(new Date(survivor!.expiresAt).getTime(), "and it is the one with time left").toBeGreaterThan(Date.now());
  });

  it("keeps the resident set inside its cap while walking every workspace", async () => {
    /* The sweep opens cold stores through the cache, so eviction bounds it. Opening them directly
       would be unbounded AND would risk two live stores on one file. */
    const { manager } = await managerWithColdWorkspaces(8);
    await manager.pruneExpiredAuthAll();
    const { resident, cap } = manager.residency();
    expect(cap).toBe(2);
    expect(resident, "eight workspaces swept, two resident").toBeLessThanOrEqual(cap);
  });

  it("carries on when one workspace cannot be read", async () => {
    const { manager } = await managerWithColdWorkspaces(3);
    const dir = path.dirname(manager.main.dataFilePath);
    fs.writeFileSync(path.join(dir, "org-broken.sqlite"), "this is not a database");

    const pruned = await manager.pruneExpiredAuthAll();
    expect(pruned.tokens, "the readable workspaces are still swept").toBeGreaterThanOrEqual(3);
  });
});
