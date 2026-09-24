/**
 * PostgreSQL stores whole SQLite file images, not BuildFlow tables. The schema is
 * created in development and promoted by Publish, never by server startup.
 */
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { defaultDataFile } from "./database.js";

const fileName = (name: string) => name.endsWith(".sqlite") && !name.includes("/") && !name.includes("\\");
const diskFiles = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(fileName).sort() : []);
export function fileDurabilityEnabled(): boolean {
  return !!process.env.DATABASE_URL && process.env.NODE_ENV !== "test" && !process.env.VITEST;
}

export class SupersededWriterError extends Error {
  constructor() {
    super("A newer BuildFlow process owns the saved data; this process cannot write to PostgreSQL.");
  }
}

type Connection = Pick<PoolClient, "query" | "release"> & Partial<Pick<PoolClient, "on" | "off">>;
type Connector = {
  connect(): Promise<Connection>;
  end(): Promise<void>;
  on?: (event: "error", handler: (error: Error) => void) => unknown;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/* A lost lock is retried every second for as long as it takes, but printing every failure would bury
   every other line of a deployment log during a long outage, the log the cause is looked for in. So
   the first few failures are printed as they happen, then one line a minute with the running count. */
const RECONNECT_FAILURES_PRINTED = 3;
const RECONNECT_REPORT_EVERY_MS = 60_000;
function isMissingSchema(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === "42P01") return true;
    current = current.cause;
  }
  return false;
}
export function dataStartupError(error: unknown): Error {
  return isMissingSchema(error)
    ? new Error(
        "PostgreSQL is missing BuildFlow's saved-file tables. Apply server/sql/file-images.sql to the development database, then publish the schema to production before starting.",
        { cause: error }
      )
    : new Error("Cannot load BuildFlow files from PostgreSQL; refusing to start with disk-only data.", { cause: error });
}
async function newPool(): Promise<Connector> {
  const { Pool } = await import("pg");
  return new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
}

export class FileDurability {
  private epoch = "";
  private readonly pending = new Map<string, "save" | "delete">();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private superseded = false;
  private owner?: Connection;
  private started = false;
  private closing = false;
  private recovering?: Promise<void>;
  private readonly released = new WeakSet<Connection>();
  private readonly watched = new WeakSet<Connection>();
  private readonly broken = new WeakSet<Connection>();
  onHandoff?: () => void;

  get hasPending(): boolean {
    return this.pending.size > 0 || !!this.running;
  }

  constructor(
    private readonly dir: string,
    private readonly pool: Connector
  ) {
    this.pool.on?.("error", (error) => console.error("[data] PostgreSQL pool connection lost:", error));
  }

  private release(candidate: Connection, broken = false): void {
    if (this.released.has(candidate)) return;
    this.released.add(candidate);
    candidate.release(broken || this.broken.has(candidate));
  }

  private async connect(): Promise<Connection> {
    const candidate = await this.pool.connect();
    this.released.delete(candidate); // a pooled client can be checked out again
    this.broken.delete(candidate);
    if (!this.watched.has(candidate)) {
      this.watched.add(candidate);
      candidate.on?.("error", (error: Error) => {
        this.broken.add(candidate);
        if (this.owner === candidate) this.lostOwner(candidate, error);
        else console.error("[data] PostgreSQL connection lost:", error);
      });
      candidate.on?.("end", () => {
        this.broken.add(candidate);
        this.lostOwner(candidate);
      });
      candidate.on?.("notification", () => {
        if (this.owner === candidate) this.onHandoff?.();
      });
    }
    return candidate;
  }

  private lostOwner(candidate: Connection, error?: Error): void {
    if (this.owner !== candidate) return;
    console.error("[data] PostgreSQL lock connection lost; reconnecting:", error ?? "connection ended");
    this.owner = undefined;
    this.release(candidate, true);
    this.beginRecovery();
  }

  private beginRecovery(): void {
    if (!this.started || this.closing || this.superseded || this.owner || this.recovering) return;
    this.recovering = this.recoverLock()
      .catch((failure: unknown) => {
        console.error("[data] PostgreSQL lock recovery failed:", failure);
      })
      .finally(() => {
        this.recovering = undefined;
        if (!this.owner) this.beginRecovery();
      });
  }

  private supersede(): void {
    if (this.superseded) return;
    this.superseded = true;
    this.pending.clear();
    console.error("[data] old process fenced out: a newer BuildFlow process owns the saved files.");
    queueMicrotask(() => this.onHandoff?.());
  }

  private async recoverLock(): Promise<void> {
    const startedAt = Date.now();
    let failures = 0;
    let reportedAt = 0;
    while (!this.closing && !this.superseded) {
      let candidate: Connection | undefined;
      let locked = false;
      try {
        candidate = await this.connect();
        const lock = await candidate.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(702345, 1) AS acquired");
        locked = !!lock.rows[0]?.acquired;
        const epoch = await candidate.query<{ epoch: string }>("SELECT epoch FROM buildflow_file_epoch WHERE id = 1");
        if (String(epoch.rows[0]?.epoch) !== this.epoch) {
          this.supersede();
          return;
        }
        if (locked && !this.closing) {
          this.owner = candidate;
          await candidate.query("LISTEN buildflow_handoff");
          if (this.owner !== candidate) continue;
          console.log(`[data] PostgreSQL lock reacquired${failures ? ` after ${failures} failed attempt(s)` : ""}.`);
          return;
        }
      } catch (error) {
        if (this.owner === candidate) this.owner = undefined;
        failures += 1;
        const now = Date.now();
        if (failures <= RECONNECT_FAILURES_PRINTED) {
          reportedAt = now;
          console.error("[data] PostgreSQL lock reconnect failed; retrying:", error);
        } else if (now - reportedAt >= RECONNECT_REPORT_EVERY_MS) {
          reportedAt = now;
          const seconds = Math.round((now - startedAt) / 1000);
          console.error(
            `[data] PostgreSQL lock reconnect still failing: ${failures} attempts in ${seconds}s, retrying every second. Latest error:`,
            error
          );
        }
      } finally {
        if (candidate && this.owner !== candidate) this.release(candidate, locked);
      }
      if (!this.closing && !this.superseded) await wait(1000);
    }
  }

  async start(): Promise<void> {
    // A dedicated connection holds this session lock until all outstanding writes
    // have drained. The next instance asks the owner to stop, then waits before
    // reading its images. This avoids losing the old instance's queued saves.
    const deadline = Date.now() + 30_000;
    while (true) {
      const candidate = await this.connect();
      try {
        const result = await candidate.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(702345, 1) AS acquired");
        if (result.rows[0]?.acquired) {
          this.owner = candidate;
          await candidate.query("LISTEN buildflow_handoff");
          break;
        }
        await candidate.query("SELECT pg_notify('buildflow_handoff', 'start')");
      } finally {
        if (this.owner !== candidate) this.release(candidate);
      }
      if (Date.now() > deadline) throw new Error("Timed out waiting for the previous BuildFlow process to flush its saved files.");
      await wait(250);
    }
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      const claim = await client.query<{ epoch: string }>(
        `INSERT INTO buildflow_file_epoch (id, epoch) VALUES (1, 1)
         ON CONFLICT (id) DO UPDATE SET epoch = buildflow_file_epoch.epoch + 1
         RETURNING epoch`
      );
      this.epoch = String(claim.rows[0].epoch);
      const result = await client.query<{ filename: string; contents: Buffer }>(
        "SELECT filename, contents FROM buildflow_files ORDER BY filename"
      );
      // Only the very first owner may import local files. An empty store after
      // previous use is not a reason to resurrect a stale disk snapshot.
      if (!result.rows.length && this.epoch === "1") {
        for (const name of diskFiles(this.dir)) {
          await client.query("INSERT INTO buildflow_files (filename, contents) VALUES ($1, $2)", [
            name,
            fs.readFileSync(path.join(this.dir, name))
          ]);
        }
      } else {
        if (!result.rows.length)
          throw new Error("PostgreSQL has no saved files after a prior start; refusing to import or erase local data.");
        hydrate(this.dir, result.rows, diskFiles(this.dir), fileName);
      }
      await client.query("COMMIT");
      if (!this.owner) throw new Error("PostgreSQL lock connection was lost during startup.");
      this.started = true;
      const imported = this.epoch === "1" && !result.rows.length;
      const count = imported ? diskFiles(this.dir).length : result.rows.length;
      console.log(
        `[data] ${imported ? "Imported" : "Loaded"} ${count} SQLite file image(s) ${imported ? "into" : "from"} PostgreSQL before opening stores.`
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      this.release(client);
    }
  }

  save(file: string): void {
    this.queue(file, "save");
  }

  delete(file: string): void {
    this.queue(file, "delete");
  }

  private queue(file: string, action: "save" | "delete"): void {
    if (this.superseded) return;
    if (path.dirname(path.resolve(file)) !== path.resolve(this.dir) || !fileName(path.basename(file))) {
      throw new Error(`Not a BuildFlow data file: ${file}`);
    }
    this.pending.set(path.basename(file), action);
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 400);
  }

  /** Serializes all saves; each file's latest queued state wins during a burst. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) return this.running.then(() => this.flush());
    if (!this.pending.size || this.superseded) return;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }

  private async drain(): Promise<void> {
    while (this.pending.size && !this.superseded) {
      const [name, action] = this.pending.entries().next().value!;
      this.pending.delete(name);
      try {
        const file = path.join(this.dir, name);
        const effectiveAction = action === "save" && !fs.existsSync(file) ? "delete" : action;
        const bytes = effectiveAction === "save" ? fs.readFileSync(file) : undefined;
        const client = await this.connect();
        try {
          await client.query("BEGIN");
          const owner = await client.query<{ epoch: string }>("SELECT epoch FROM buildflow_file_epoch WHERE id = 1 FOR UPDATE");
          if (String(owner.rows[0]?.epoch) !== this.epoch) throw new SupersededWriterError();
          if (effectiveAction === "delete") {
            await client.query("DELETE FROM buildflow_files WHERE filename = $1", [name]);
          } else {
            await client.query(
              `INSERT INTO buildflow_files (filename, contents) VALUES ($1, $2)
               ON CONFLICT (filename) DO UPDATE SET contents = EXCLUDED.contents`,
              [name, bytes]
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          this.release(client);
        }
      } catch (error) {
        if (error instanceof SupersededWriterError) {
          this.supersede();
          return;
        }
        if (!this.pending.has(name)) this.pending.set(name, action);
        console.error(`[data] PostgreSQL save failed for ${name}; retrying:`, error);
        if (!this.timer)
          this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.flush();
          }, 1000);
        return;
      }
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    while (this.pending.size || this.running) {
      await this.flush();
      if (this.pending.size && !this.superseded) await wait(1000);
    }
    if (this.owner) {
      const owner = this.owner;
      this.owner = undefined;
      try {
        await owner.query("SELECT pg_advisory_unlock(702345, 1)");
      } finally {
        this.release(owner);
      }
    }
    await this.pool.end();
  }
}

let active: FileDurability | undefined;

export async function startFileDurability(): Promise<FileDurability | undefined> {
  if (!fileDurabilityEnabled()) return undefined;
  const pool = await newPool();
  const mirror = new FileDurability(path.dirname(defaultDataFile), pool);
  try {
    await mirror.start();
  } catch (error) {
    await mirror.close();
    throw dataStartupError(error);
  }
  active = mirror;
  return mirror;
}

export function savedFile(file: string): void {
  active?.save(file);
}

export function deletedFile(file: string): void {
  active?.delete(file);
}

/** The CLI runs while the API is stopped. Fence prior owners and store the
 * restored bytes before allowing the next startup to hydrate from PostgreSQL. */
export async function persistRestoredFile(file: string, connector?: Connector): Promise<void> {
  if (!connector && !fileDurabilityEnabled()) return;
  const pool = connector ?? (await newPool());
  pool.on?.("error", (error) => console.error("[data] PostgreSQL restore pool connection lost:", error));
  let client: Connection;
  try {
    client = await pool.connect();
  } catch (error) {
    await pool.end();
    throw error;
  }
  let broken = false;
  const onError = (error: Error) => {
    broken = true;
    console.error("[data] PostgreSQL restore connection lost:", error);
  };
  const onEnd = () => {
    broken = true;
  };
  client.on?.("error", onError);
  client.on?.("end", onEnd);
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO buildflow_file_epoch (id, epoch) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET epoch = buildflow_file_epoch.epoch + 1`
    );
    await client.query(
      `INSERT INTO buildflow_files (filename, contents) VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET contents = EXCLUDED.contents`,
      [path.basename(file), fs.readFileSync(file)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.off?.("error", onError);
    client.off?.("end", onEnd);
    client.release(broken);
    await pool.end();
  }
}

function hydrate(
  dir: string,
  rows: Array<{ filename: string; contents: Buffer }>,
  namesOnDisk: string[],
  valid: (name: string) => boolean
) {
  fs.mkdirSync(dir, { recursive: true });
  const names = new Set(rows.map((row) => row.filename));
  for (const row of rows) {
    if (!valid(row.filename)) throw new Error(`Invalid saved filename: ${row.filename}`);
    const target = path.join(dir, row.filename);
    const tmp = `${target}.hydrate-${process.pid}`;
    try {
      fs.writeFileSync(tmp, row.contents);
      fs.renameSync(tmp, target);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  for (const name of namesOnDisk) if (!names.has(name)) fs.unlinkSync(path.join(dir, name));
}
