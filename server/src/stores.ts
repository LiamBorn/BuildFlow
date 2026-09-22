/* =========================================================================
   StoreManager — multi-tenant DATA isolation via database-per-tenant.

   Each org's operational data (projects/jobs/crews/…) lives in its OWN SQLite
   file: data/org-<id>.sqlite. This gives real isolation with zero per-query
   changes — a tenant physically cannot read another tenant's file.

   - The DEMO org maps to the shared MAIN store (data/buildflow.sqlite), which
     is already seeded AND holds the global tables (auth accounts/sessions,
     waitlist, sales-desk, subscriptions).
   - A brand-new org gets an EMPTY store (seedDemo:false → schema only).
   - Stores are created lazily and cached for the process lifetime.

   Fast-follow: consolidate to a single DB with org_id columns if/when the
   tenant count makes one-file-per-tenant impractical.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import { BuildFlowStore, DEMO_ORG_ID } from "./database.js";

export class StoreManager {
  private readonly cache = new Map<string, BuildFlowStore>();
  private readonly dataDir: string;

  constructor(private readonly mainStore: BuildFlowStore) {
    // Demo org shares the seeded main store; co-locate per-org files beside it.
    this.cache.set(DEMO_ORG_ID, mainStore);
    this.dataDir = path.dirname(mainStore.dataFilePath);
  }

  /** The main store — holds the global auth/waitlist/sales/billing tables. */
  get main(): BuildFlowStore {
    return this.mainStore;
  }

  /** Get (or lazily create) the operational store for an org. */
  async getOrgStore(orgId: string): Promise<BuildFlowStore> {
    const cached = this.cache.get(orgId);
    if (cached) return cached;
    const file = path.join(this.dataDir, `org-${orgId}.sqlite`);
    const store = await BuildFlowStore.create(file, false, { seedDemo: false });
    this.cache.set(orgId, store);
    return store;
  }

  /** Forget a tenant's store and its file. The demo org, which is the main store, is never dropped. */
  async dropOrgStore(orgId: string): Promise<void> {
    if (orgId === DEMO_ORG_ID) return;
    this.cache.delete(orgId);
    await fs.promises.rm(path.join(this.dataDir, `org-${orgId}.sqlite`), { force: true });
  }

  /**
   * Object counts summed across every registered workspace — what the operator console
   * shows. Aggregates only: the per-workspace numbers are added up and discarded, so no
   * workspace's name or contents leaves this method.
   *
   * A workspace whose store has never been opened is counted as zero WITHOUT opening it:
   * BuildFlowStore.create() ends in save(), so touching a cold org here would write an
   * empty database as the side effect of a read, and load every tenant DB into memory to
   * answer one number. An org with no file has no objects, so zero is also the true count;
   * `cold` reports how many were answered that way rather than hiding the shortcut.
   */
  async objectCounts(): Promise<{
    workspaces: number;
    cold: number;
    totals: { projects: number; jobs: number; crews: number; equipment: number; materials: number };
  }> {
    const totals = { projects: 0, jobs: 0, crews: 0, equipment: 0, materials: 0 };
    const orgs = this.mainStore.listOrgs();
    let cold = 0;
    for (const org of orgs) {
      const store = this.openedOrExistingStore(org.id) ? await this.getOrgStore(org.id) : undefined;
      if (!store) {
        cold += 1;
        continue;
      }
      const counts = store.objectCounts();
      totals.projects += counts.projects;
      totals.jobs += counts.jobs;
      totals.crews += counts.crews;
      totals.equipment += counts.equipment;
      totals.materials += counts.materials;
    }
    return { workspaces: orgs.length, cold, totals };
  }

  /** Whether this org's store can be read without creating it: already cached (the demo
   *  org is, mapped to the main store) or its file is already on disk. */
  private openedOrExistingStore(orgId: string): boolean {
    return this.cache.has(orgId) || fs.existsSync(path.join(this.dataDir, `org-${orgId}.sqlite`));
  }

  /** Snapshot every open store (main + each accessed tenant) into data/backups/,
   *  each pruned to the newest `retain`. Returns the backup file paths written.
   *  Cold tenant files that haven't been opened this process are static on disk
   *  and covered by a filesystem-level backup of the data directory. */
  backupAll(retain?: number): string[] {
    const written: string[] = [];
    for (const store of new Set(this.cache.values())) {
      written.push(store.backup(retain));
    }
    return written;
  }

  /**
   * Sweep expired sessions and auth tokens out of every open store.
   *
   * Those tables are global and so live in the main store; the tenant files carry the same
   * schema but leave them empty, where the sweep counts zero and writes nothing. Running
   * it across the open set rather than the main store alone costs nothing and means the
   * rule does not have to be re-checked if a table ever moves.
   *
   * Cold tenant files are left alone deliberately: opening one to delete nothing would
   * load a whole database into memory and write it back out, which is the opposite of what
   * this is for.
   */
  pruneExpiredAuthAll(): { sessions: number; tokens: number } {
    const total = { sessions: 0, tokens: 0 };
    for (const store of new Set(this.cache.values())) {
      const pruned = store.pruneExpiredAuth();
      total.sessions += pruned.sessions;
      total.tokens += pruned.tokens;
    }
    return total;
  }
}
