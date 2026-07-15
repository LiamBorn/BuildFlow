import "./loadEnv.js"; // must be first: populates process.env before app/email load
import { createApp } from "./app.js";
import { reportMailStatus } from "./email.js";
import { reportBillingStatus } from "./billing.js";
import { reportAiStatus } from "./ai.js";
import { reportNotifyStatus } from "./notify.js";
import type { StoreManager } from "./stores.js";
import { LATEST_SCHEMA_VERSION } from "./database.js";

const port = Number(process.env.PORT ?? 4300);
const app = await createApp();

app.listen(port, () => {
  console.log(`BuildFlow API listening on http://localhost:${port}`);
  void reportMailStatus(); // logs LIVE (verified) vs LOG MODE + anything missing
  reportBillingStatus(); // logs Stripe billing mode (or NOT CONFIGURED)
  reportAiStatus(); // logs BuildFlow AI LIVE (Claude) vs DEMO MODE
  reportNotifyStatus(); // logs notification channels (email/SMS/push) + recipients

  // Data layer: versioned schema + backups. A boot snapshot gives a restore point
  // each start; BACKUP_INTERVAL_MIN>0 adds periodic snapshots. Retained per
  // BACKUP_RETAIN (default 20) in data/backups/; on-demand via POST /api/ops/backup.
  const manager = app.locals.storeManager as StoreManager;
  const retain = process.env.BACKUP_RETAIN ? Number(process.env.BACKUP_RETAIN) : undefined;
  try {
    const files = manager.backupAll(retain);
    console.log(`🗄️  Data: schema v${LATEST_SCHEMA_VERSION}; boot backup → data/backups/ (${files.length} file${files.length === 1 ? "" : "s"}).`);
  } catch (error) {
    console.error("🗄️  Data: boot backup failed:", error instanceof Error ? error.message : error);
  }
  const intervalMin = Number(process.env.BACKUP_INTERVAL_MIN ?? 0);
  if (intervalMin > 0) {
    setInterval(() => {
      try {
        const files = manager.backupAll(retain);
        console.log(`🗄️  Backup: periodic snapshot → ${files.length} file(s).`);
      } catch (error) {
        console.error("🗄️  Backup: periodic snapshot failed:", error instanceof Error ? error.message : error);
      }
    }, intervalMin * 60_000).unref(); // .unref so backups never keep the process alive
    console.log(`🗄️  Backup: periodic snapshots every ${intervalMin} min (BACKUP_INTERVAL_MIN).`);
  } else {
    console.log("🗄️  Backup: periodic OFF (set BACKUP_INTERVAL_MIN>0); on-demand: POST /api/ops/backup.");
  }
});
