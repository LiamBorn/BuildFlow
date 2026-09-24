import "./loadEnv.js"; // must be first: populates process.env before app/email load
import { createApp } from "./app.js";
import { reportMailStatus } from "./email.js";
import { reportBillingStatus } from "./billing.js";
import { reportAiStatus } from "./ai.js";
import { reportNotifyStatus } from "./notify.js";
import type { StoreManager } from "./stores.js";
import { LATEST_SCHEMA_VERSION } from "./database.js";
import { startFileDurability, flushSavedFiles } from "./fileDurability.js";
import { liveHubFor } from "./schedule/live.js";
import { createShutdown } from "./shutdown.js";
import { startWeeklyDigestScheduler } from "./schedule/digest.js";
import { serveClient } from "./serveClient.js";

/**
 * Nothing was watching the process itself.
 *
 * Node's default for an unhandled rejection is to terminate, so one stray promise in a
 * background job — a digest send, a periodic backup — took the whole API down with no
 * note of what did it. Logging and staying up is the right trade for a server whose
 * request paths already answer their own failures: an unhandled rejection here is a bug
 * to find in the log, not a reason to drop every connected client. An uncaught exception
 * is different in kind, and the process is left to exit after it is recorded.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[server] uncaught exception — exiting:", error);
  process.exit(1);
});

const port = Number(process.env.PORT ?? 4300);
const fileDurability = await startFileDurability();
const app = await createApp();

const manager = app.locals.storeManager as StoreManager;
const liveHub = liveHubFor(app);
// Persist any migration or fresh demo file before the new process accepts requests.
await fileDurability?.flush();
if (fileDurability?.hasPending) throw new Error("Could not save initial SQLite files to PostgreSQL; refusing to serve requests.");
const retain = process.env.BACKUP_RETAIN ? Number(process.env.BACKUP_RETAIN) : undefined;
const bootFiles = manager.backupAll(retain);
await flushSavedFiles();
// One process, one address: in production the built pages are served from here too (serveClient.ts).
const production = process.env.NODE_ENV === "production";
const servesPages = production && serveClient(app);

const server = app.listen(port, () => {
  console.log(`BuildFlow API listening on http://localhost:${port}`);
  if (servesPages) console.log("🖥️  Pages: the landing page, sign-in and the program are served here too (client/dist).");
  else if (production) console.log("🖥️  Pages: no client build in client/dist — run `npm run build` to serve them from here.");
  void reportMailStatus(); // logs LIVE (verified) vs LOG MODE + anything missing
  reportBillingStatus(); // logs Stripe billing mode (or NOT CONFIGURED)
  reportAiStatus(); // logs BuildFlow AI LIVE (Claude) vs DEMO MODE
  console.log(`🗄️  Data storage: ${fileDurability ? "PostgreSQL-backed SQLite files" : "local SQLite files only"}.`);
  reportNotifyStatus(); // logs notification channels (email/SMS/push) + recipients
  // Says out loud whether the auth limits hold across instances or only within this one.
  console.log(
    app.locals.rateLimitBackend === "redis"
      ? "🚦 Rate limits: shared via REDIS_URL (they hold across every API instance)."
      : "🚦 Rate limits: in this process only — set REDIS_URL to share them across instances."
  );

  // Data layer: versioned schema + backups. A boot snapshot gives a restore point
  // each start; BACKUP_INTERVAL_MIN>0 adds periodic snapshots. Retained per
  // BACKUP_RETAIN (default 20) in data/backups/; on-demand via POST /api/ops/backup.
  console.log(
    `🗄️  Data: schema v${LATEST_SCHEMA_VERSION}; boot backup → data/backups/ (${bootFiles.length} file${bootFiles.length === 1 ? "" : "s"}).`
  );
  const intervalMin = Number(process.env.BACKUP_INTERVAL_MIN ?? 0);
  if (intervalMin > 0) {
    setInterval(() => {
      void (async () => {
        try {
          const files = manager.backupAll(retain);
          await flushSavedFiles();
          console.log(`🗄️  Backup: periodic snapshot → ${files.length} file(s).`);
        } catch (error) {
          console.error("🗄️  Backup: periodic snapshot failed:", error instanceof Error ? error.message : error);
        }
      })();
    }, intervalMin * 60_000).unref(); // .unref so backups never keep the process alive
    console.log(`🗄️  Backup: periodic snapshots every ${intervalMin} min (BACKUP_INTERVAL_MIN).`);
  } else {
    console.log("🗄️  Backup: periodic OFF (set BACKUP_INTERVAL_MIN>0); on-demand: POST /api/ops/backup.");
  }

  /* Sweep expired sessions and one-time auth tokens. Nothing removed these before, and
     because save() rewrites the whole database file, rows nobody can use any more are paid
     for by every later write rather than merely taking up space. Once at boot, then daily;
     unref'd so it never holds the process open, and silent when it finds nothing. */
  const sweep = (label: string) => {
    try {
      const { sessions, tokens } = manager.pruneExpiredAuthAll();
      if (sessions || tokens) console.log(`🧹 Auth ${label}: removed ${sessions} expired session(s), ${tokens} token(s).`);
    } catch (error) {
      console.error(`🧹 Auth ${label} failed:`, error instanceof Error ? error.message : error);
    }
  };
  sweep("sweep");
  setInterval(() => sweep("sweep"), 24 * 60 * 60_000).unref();

  // Monday's "what changed this week" email, once per org (WEEKLY_DIGEST=off, DIGEST_WEEKDAY, DIGEST_HOUR).
  if ((process.env.WEEKLY_DIGEST ?? "on").toLowerCase() !== "off") {
    startWeeklyDigestScheduler(manager);
    console.log(
      `📬 Weekly digest: on (weekday ${process.env.DIGEST_WEEKDAY ?? 1}, from ${process.env.DIGEST_HOUR ?? 7}:00); preview at GET /api/schedule/digest.`
    );
  } else {
    console.log("📬 Weekly digest: OFF (WEEKLY_DIGEST=off).");
  }
});

const shutdown = createShutdown(server, liveHub, fileDurability);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => shutdown(signal));
}
if (fileDurability) fileDurability.onHandoff = () => shutdown("handoff");
