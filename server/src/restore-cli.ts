/* Bring a backup back. Run from server/:
     npm run restore                      list every restore point, newest first
     npm run restore -- --latest          restore the newest snapshot of the MAIN database
     npm run restore -- --latest <base>   …of one workspace, e.g. org-org-ab12
     npm run restore -- <backup file>     restore exactly that snapshot
     npm run restore -- <…> --force       skip the "is the API running" check

   STOP THE API FIRST. It keeps the database in memory and would overwrite a restored file
   on its very next save; the check below is there so that cannot happen quietly. */
import "./loadEnv.js";
import path from "node:path";
import { apiIsRunning, backupsDir, listRestorePoints, restore, targetFor, type RestorePoint } from "./restore.js";
import { defaultDataFile } from "./database.js";
import { persistRestoredFile, startFileDurability } from "./fileDurability.js";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const args = argv.filter((a) => a !== "--force");
const mainBase = path.basename(defaultDataFile, path.extname(defaultDataFile));

// Refuse a live restore before taking the ownership lock (which would ask the
// running server to hand off). Listing while live reads its current local files.
const runningPort = await (async () => {
  for (const port of process.env.PORT ? [Number(process.env.PORT)] : [4300, 5000]) if (await apiIsRunning(port)) return port;
  return undefined;
})();
if (args.length && !force && runningPort) {
  console.error(`The API is answering on port ${runningPort}. Stop it before restoring.`);
  process.exit(1);
}
if (!runningPort) {
  const mirror = await startFileDurability();
  await mirror?.close();
}
const points = listRestorePoints();
const ago = (d: Date) => {
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
};
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

function list() {
  if (points.length === 0) {
    console.log(`No restore points in ${backupsDir()}.`);
    console.log("One is taken at boot; POST /api/ops/backup takes another, BACKUP_INTERVAL_MIN adds a timer.");
    return;
  }
  console.log(`Restore points in ${backupsDir()} (newest first):\n`);
  const byBase = new Map<string, RestorePoint[]>();
  for (const p of points) byBase.set(p.base, [...(byBase.get(p.base) ?? []), p]);
  for (const [base, group] of byBase) {
    console.log(`  ${base}${base === mainBase ? "  (main database)" : ""}`);
    for (const p of group) console.log(`     ${p.file}   ${ago(p.takenAt)}   ${mb(p.bytes)}`);
    console.log("");
  }
  console.log("Restore the newest:  npm run restore -- --latest");
  console.log("Restore a specific:  npm run restore -- <file above>");
}

function pick(): RestorePoint {
  if (args[0] === "--latest") {
    const base = args[1] ?? mainBase;
    const newest = points.find((p) => p.base === base);
    if (!newest) {
      console.error(`No restore point for "${base}". Run without arguments to see what there is.`);
      process.exit(1);
    }
    return newest;
  }
  const named = points.find((p) => p.file === args[0] || p.file === path.basename(args[0]));
  if (!named) {
    console.error(`"${args[0]}" is not a restore point in ${backupsDir()}. Run without arguments to see what there is.`);
    process.exit(1);
  }
  return named;
}

if (args.length === 0) {
  list();
  process.exit(0);
}

const point = pick();

const onto = targetFor(point);
console.log(`Restoring ${point.file}`);
console.log(`        → ${onto}`);
const outcome = await restore(point);
await persistRestoredFile(outcome.onto);
if (outcome.previousSnapshot) {
  console.log(`\nWhat was there is kept: ${path.basename(outcome.previousSnapshot)}`);
  console.log("If this was the wrong point in time, restore that one the same way.");
} else {
  console.log("\nThere was no file there before, so nothing needed keeping.");
}
console.log(`\nDone — ${outcome.tables} tables. Start the API again.`);
