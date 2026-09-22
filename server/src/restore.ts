/* =========================================================================
   Restoring a backup.

   Backups were being written — at boot, on a timer, and on demand — and could be
   listed, but nothing could bring one back. A backup you cannot restore is not a
   backup, and the moment you need one is the worst moment to be working out the
   filename convention by hand over a broken database.

   This is the logic; restore-cli.ts is the command around it. It is a CLI rather
   than an HTTP route on purpose: restoring overwrites live data, so it should not
   be reachable by anything holding a leaked ops token, and the server is often
   down anyway when it is needed.

   Three things it refuses to do:
     - restore while the API is running. The server holds the database in MEMORY,
       so a file swapped underneath it is overwritten by its very next save. This
       is the same trap seed-cli.ts warns about, made into a check.
     - restore a file that is not a readable database. Writing a corrupt backup
       over a working file would turn a recoverable morning into a lost one.
     - restore without first snapshotting what is there now, so that restoring the
       wrong point in time is itself undoable.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { defaultDataFile } from "./database.js";

/** `<base>-<ISO stamp with : and . turned into ->.sqlite`, as backup() writes them. */
const BACKUP_NAME = /^(?<base>.+)-(?<stamp>\d{4}-\d{2}-\d{2}T[\d-]+Z)\.sqlite$/;

export type RestorePoint = {
  file: string;
  /** The database this is a snapshot of, e.g. "buildflow" or "org-org-ab12". */
  base: string;
  takenAt: Date;
  bytes: number;
};

export function dataDir(): string {
  return path.dirname(defaultDataFile);
}

export function backupsDir(): string {
  return path.join(dataDir(), "backups");
}

/** Every restore point on disk, newest first. `dir` is the data directory to read. */
export function listRestorePoints(dataDirectory: string = dataDir()): RestorePoint[] {
  const dir = path.join(dataDirectory, "backups");
  if (!fs.existsSync(dir)) return [];
  const points: RestorePoint[] = [];
  for (const file of fs.readdirSync(dir)) {
    const match = BACKUP_NAME.exec(file);
    if (!match?.groups) continue;
    // The stamp is an ISO string with : and . replaced; put them back to read it.
    const iso = match.groups.stamp.replace(/^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "$1$2:$3:$4.$5Z");
    const takenAt = new Date(iso);
    points.push({
      file,
      base: match.groups.base,
      takenAt: Number.isNaN(takenAt.getTime()) ? new Date(0) : takenAt,
      bytes: fs.statSync(path.join(dir, file)).size
    });
  }
  return points.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
}

/**
 * Open the file and ask it something, WITHOUT migrating or saving it — going through
 * BuildFlowStore.create() would bring the backup up to the current schema and write it
 * back, which is a change to the very thing being inspected.
 */
export async function readableDatabase(file: string): Promise<{ ok: true; tables: number } | { ok: false; why: string }> {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : "unreadable" };
  }
  if (bytes.length === 0) return { ok: false, why: "the file is empty" };
  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database(bytes);
    try {
      const result = db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'");
      const tables = Number(result[0]?.values?.[0]?.[0] ?? 0);
      if (tables === 0) return { ok: false, why: "it holds no tables" };
      return { ok: true, tables };
    } finally {
      db.close();
    }
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : "not a database" };
  }
}

/** Where a restore point's contents belong: `<base>.sqlite` in the data directory. */
export function targetFor(point: Pick<RestorePoint, "base">, dataDirectory: string = dataDir()): string {
  return path.join(dataDirectory, `${point.base}.sqlite`);
}

/** Copy `from` over `to` the way save() publishes: temp file, fsync, atomic rename. */
export function publishAtomically(from: string, to: string) {
  const tmp = `${to}.tmp-restore-${process.pid}`;
  try {
    const bytes = fs.readFileSync(from);
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, to);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* nothing to clean up */
    }
    throw error;
  }
}

/**
 * Snapshot whatever is at `file` now, as a normal restore point, before replacing it.
 *
 * The snapshot goes in a backups/ folder BESIDE the file, which is what
 * BuildFlowStore.backup() does. An earlier version used the configured data directory
 * regardless of where the file was, which is the same thing for the only path that
 * matters in production and quietly wrong for every other one — a test restoring a file
 * in a temp directory wrote its snapshot into the real data/backups/ instead.
 */
export function snapshotCurrent(file: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dir, `${base}-${stamp}.sqlite`);
  fs.copyFileSync(file, dest);
  return dest;
}

/**
 * Whether an API is answering on `port`. A running server holds the database in memory and
 * would overwrite a restored file on its next save, so this is the difference between a
 * restore that sticks and one that silently does nothing.
 */
export async function apiIsRunning(port: number, timeoutMs = 700): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    // Any answer at all means something is listening; a 503 health check is still a server.
    return response.status > 0;
  } catch {
    return false; // refused, timed out, nothing there
  }
}

export type RestoreOutcome = {
  restored: string;
  onto: string;
  previousSnapshot?: string;
  tables: number;
};

/**
 * Validate, snapshot what is there, then publish the backup over it.
 *
 * `dataDirectory` defaults to the server's own, and exists so this can be driven end to end
 * against a throwaway directory. The one function here that overwrites live data should not
 * be the one function that cannot be tested without risking it.
 */
export async function restore(point: RestorePoint, dataDirectory: string = dataDir()): Promise<RestoreOutcome> {
  const source = path.join(dataDirectory, "backups", point.file);
  const check = await readableDatabase(source);
  if (!check.ok) throw new Error(`${point.file} is not a database that can be restored — ${check.why}`);

  const onto = targetFor(point, dataDirectory);
  const previousSnapshot = snapshotCurrent(onto);
  publishAtomically(source, onto);
  return { restored: point.file, onto, previousSnapshot, tables: check.tables };
}
