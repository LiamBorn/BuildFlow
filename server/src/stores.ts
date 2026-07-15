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
}
