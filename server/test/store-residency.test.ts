/**
 * How many workspaces stay in memory, and the one that must never be evicted.
 *
 * sql.js keeps a whole database in the WASM heap, so a cached tenant store is not a handle — it is the
 * file. Measured before this existed: 40 EMPTY workspaces cost +45MB RSS (~1.13MB each, 540KB each on
 * disk), and clearing the map that held them plus three forced garbage collections moved RSS from
 * 189MB to 190MB. Dropping the reference gives nothing back; only `db.close()` does. The cache had no
 * cap and its only removal was deleting a workspace, so a thousand workspaces served since boot was a
 * gigabyte that never came down, on a VM with fixed RAM. A ceiling measured in customers, not load.
 *
 * The case that matters most is the pinned one. app.ts binds a store to a request for its whole life
 * and handlers write after awaits, so an evictor that ignored that would either throw on the next
 * write or — if it dropped the reference without closing — leave two live stores writing whole-file
 * images of one file, last save wins, the other workspace's rows gone with nothing logged. A cap that
 * loses data to respect itself is worse than no cap, which is why the cap is a target and this test
 * asserts the cache is ALLOWED to go over it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildFlowStore } from "../src/database.js";
import { StoreManager } from "../src/stores.js";

const CAP = 4;

/** A manager with a cap of four, passed in rather than set through the environment. */
async function freshManager() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-residency-"));
  const main = await BuildFlowStore.create(path.join(dir, "main.sqlite"), true);
  return { manager: new StoreManager(main, { maxResidentStores: CAP }), dir };
}

describe("the resident set", () => {
  it("stops growing once it is over the cap", async () => {
    const { manager } = await freshManager();
    for (let n = 1; n <= 12; n += 1) await manager.getOrgStore(`org-${n}`);
    const { resident, cap } = manager.residency();
    expect(cap).toBe(CAP);
    expect(resident, "twelve workspaces touched, four resident").toBeLessThanOrEqual(CAP);
  });

  it("keeps the ones most recently used and closes the coldest", async () => {
    const { manager } = await freshManager();
    for (const id of ["a", "b", "c", "d"]) await manager.getOrgStore(`org-${id}`);
    await manager.getOrgStore("org-a"); // a is now the newest, b the coldest
    await manager.getOrgStore("org-e"); // pushes one out

    // a store still resident answers; the evicted one is re-created rather than reused
    const a = await manager.getOrgStore("org-a");
    expect(a.ping(), "the recently used store is still open").toBe(true);
    expect(manager.residency().resident).toBeLessThanOrEqual(CAP);
  });

  it("never closes a store a request is holding, even over the cap", async () => {
    /* The data-loss case. Every tenant is pinned, so eviction has nothing it may take and the cache is
       supposed to exceed its cap rather than close one out from under a request. */
    const { manager } = await freshManager();
    for (let n = 1; n <= 10; n += 1) {
      await manager.getOrgStore(`org-${n}`);
      manager.pin(`org-${n}`);
    }
    const { resident, pinned } = manager.residency();
    expect(pinned).toBe(10);
    expect(resident, "the cap yields to a request in flight").toBe(10);

    // every one of them is still usable
    for (let n = 1; n <= 10; n += 1) expect((await manager.getOrgStore(`org-${n}`)).ping()).toBe(true);
  });

  it("lets go once the request does", async () => {
    const { manager } = await freshManager();
    for (let n = 1; n <= 10; n += 1) {
      await manager.getOrgStore(`org-${n}`);
      manager.pin(`org-${n}`);
    }
    for (let n = 1; n <= 10; n += 1) manager.unpin(`org-${n}`);
    expect(manager.residency().pinned).toBe(0);

    await manager.getOrgStore("org-later"); // the next open is free to evict
    expect(manager.residency().resident).toBeLessThanOrEqual(CAP);
  });

  it("counts a nested pin, so the first release does not unpin the second holder", async () => {
    const { manager } = await freshManager();
    await manager.getOrgStore("org-shared");
    manager.pin("org-shared");
    manager.pin("org-shared");
    manager.unpin("org-shared");
    expect(manager.residency().pinned, "two requests, one released").toBe(1);
    manager.unpin("org-shared");
    expect(manager.residency().pinned).toBe(0);
  });

  it("never evicts the main store, which holds the accounts", async () => {
    const { manager } = await freshManager();
    for (let n = 1; n <= 20; n += 1) await manager.getOrgStore(`org-${n}`);
    expect(manager.main.ping(), "the main store must answer after any amount of churn").toBe(true);
    expect(manager.main.getAccountRowByEmail("demo@buildflow.com"), "and still hold the accounts").toBeDefined();
  });
});

describe("what an evicted workspace keeps", () => {
  it("still has its rows when it is opened again", async () => {
    /* Closing flushes first, because the public run() does not save. Without that, an evicted
       workspace would come back missing exactly the rows written through the schedule repository. */
    const { manager } = await freshManager();
    const store = await manager.getOrgStore("org-keeper");
    store.addWaitlistSubscriber("kept@example.com");

    // push it out with cold traffic
    for (let n = 1; n <= 10; n += 1) await manager.getOrgStore(`org-cold-${n}`);

    const reopened = await manager.getOrgStore("org-keeper");
    expect(reopened.waitlistCount(), "an evicted store must not lose what it was told").toBeGreaterThan(0);
  });
});
