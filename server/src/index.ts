import "./loadEnv.js"; // must be first: populates process.env before app/email load
import { createApp } from "./app.js";
import { reportMailStatus } from "./email.js";
import { reportBillingStatus } from "./billing.js";
import { reportAiStatus } from "./ai.js";
import { reportNotifyStatus } from "./notify.js";
import type { StoreManager } from "./stores.js";
import { LATEST_SCHEMA_VERSION } from "./database.js";
import { startWeeklyDigestScheduler } from "./schedule/digest.js";

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
const app = await createApp();

const server = app.listen(port, () => {
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
    console.log(
      `🗄️  Data: schema v${LATEST_SCHEMA_VERSION}; boot backup → data/backups/ (${files.length} file${files.length === 1 ? "" : "s"}).`
    );
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

/**
 * Shut down on a deploy's signal instead of being killed mid-request.
 *
 * Nothing handled SIGTERM, so a restart dropped every connection that was open and cut the
 * process off wherever it happened to be — including inside a store's save, which is a
 * whole-file rewrite. (That write is now atomic, so an interrupted one can no longer leave a
 * torn database; this is the other half — finishing the work already in flight rather than
 * relying on the write being safe to interrupt.)
 *
 * Idle keep-alive sockets are closed at once, because they hold `server.close()` open while
 * doing nothing; requests actually being served are allowed to finish. The timer is the
 * backstop for a request that never ends, and is unref'd so it cannot itself keep the
 * process alive.
 */
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return; // a second Ctrl-C should not race the first
    shuttingDown = true;
    console.log(`\n[server] ${signal} — finishing in-flight requests, then closing.`);
    server.closeIdleConnections();
    server.close(() => {
      console.log("[server] closed cleanly.");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[server] still busy after 10s — exiting anyway.");
      process.exit(1);
    }, 10_000).unref();
  });
}
