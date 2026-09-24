import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDurability, fileDurabilityEnabled, persistRestoredFile } from "../src/fileDurability.js";

class MemoryPg {
  epoch = 0;
  files = new Map<string, Buffer>();
  writes = 0;
  failNext = false;
  locked = false;
  notification?: () => void;
  async connect() {
    let epoch = this.epoch;
    let files = new Map(this.files);
    return {
      on: (_event: string, listener: () => void) => { this.notification = listener; },
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_try_advisory_lock")) {
          const acquired = !this.locked;
          if (acquired) this.locked = true;
          return { rows: [{ acquired }] };
        } else if (sql.includes("pg_advisory_unlock")) {
          this.locked = false;
        } else if (sql.includes("pg_notify")) {
          queueMicrotask(() => this.notification?.());
        } else if (sql === "BEGIN") {
          epoch = this.epoch;
          files = new Map(this.files);
        } else if (sql.includes("buildflow_file_epoch") && sql.includes("INSERT")) {
          epoch++;
          return { rows: [{ epoch: String(epoch) }] };
        } else if (sql.includes("SELECT epoch")) {
          return { rows: [{ epoch: String(this.epoch) }] };
        } else if (sql.includes("SELECT filename")) {
          return { rows: [...files].map(([filename, contents]) => ({ filename, contents })) };
        } else if (sql.includes("INSERT INTO buildflow_files")) {
          if (this.failNext) {
            this.failNext = false;
            throw new Error("network unavailable");
          }
          files.set(params[0] as string, params[1] as Buffer);
          this.writes++;
        } else if (sql.includes("DELETE FROM buildflow_files")) {
          files.delete(params[0] as string);
          this.writes++;
        } else if (sql === "COMMIT") {
          this.epoch = epoch;
          this.files = files;
        }
        return { rows: [] };
      },
      release: () => undefined
    };
  }
  async end() {}
}

const dirs: string[] = [];
function directory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-pg-files-"));
  dirs.push(dir);
  return dir;
}
function mirror(dir: string, pg: MemoryPg) {
  return new FileDurability(dir, pg as never);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("PostgreSQL-backed SQLite images", () => {
  it("imports existing disk files only on the first start, then hydrates and removes stale workspace files", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "first main");
    fs.writeFileSync(path.join(dir, "org-one.sqlite"), "first org");
    fs.mkdirSync(path.join(dir, "backups"));
    fs.writeFileSync(path.join(dir, "backups", "snapshot.sqlite"), "backup stays local");
    const original = mirror(dir, pg);
    await original.start();
    expect(pg.files.size).toBe(2);
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "stale main");
    fs.writeFileSync(path.join(dir, "org-old.sqlite"), "stale org");
    await original.close();
    await mirror(dir, pg).start();
    expect(fs.readFileSync(path.join(dir, "buildflow.sqlite"), "utf8")).toBe("first main");
    expect(fs.existsSync(path.join(dir, "org-old.sqlite"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "backups", "snapshot.sqlite"))).toBe(true);
  });

  it("coalesces a burst, retries failures without throwing, and deletes saved workspaces", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "original");
    const store = mirror(dir, pg);
    await store.start();
    vi.useFakeTimers();
    fs.writeFileSync(file, "one");
    store.save(file);
    fs.writeFileSync(file, "two");
    store.save(file);
    pg.failNext = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("original");
    expect(errors).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("two");
    expect(pg.writes).toBe(2); // first import, then one successful coalesced update
    const org = path.join(dir, "org-one.sqlite");
    fs.writeFileSync(org, "org");
    store.save(org);
    await store.flush();
    fs.unlinkSync(org);
    store.delete(org);
    await store.flush();
    expect(pg.files.has("org-one.sqlite")).toBe(false);
  });

  it("fences an older owner and never lets it overwrite the newer owner's image", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "initial");
    const old = mirror(dir, pg);
    await old.start();
    await old.close();
    const newer = mirror(dir, pg);
    await newer.start();
    fs.writeFileSync(file, "newer");
    newer.save(file);
    await newer.flush();
    fs.writeFileSync(file, "old request");
    old.save(file);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await old.flush();
    expect(errors).toHaveBeenCalledWith("[data] old process fenced out:", expect.any(String));
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("newer");
  });

  it("refuses startup on an unreachable database without changing files", async () => {
    const dir = directory();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "keep this");
    const disconnected = { connect: async () => { throw new Error("database offline"); }, end: async () => undefined };
    await expect(mirror(dir, disconnected as never).start()).rejects.toThrow("database offline");
    expect(fs.readFileSync(file, "utf8")).toBe("keep this");
  });

  it("flushes pending changes on close and replaces the saved image during a restore", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "original");
    const store = mirror(dir, pg);
    await store.start();
    fs.writeFileSync(file, "last write");
    store.save(file);
    await store.close();
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("last write");

    fs.writeFileSync(file, "restored backup");
    await persistRestoredFile(file, pg as never);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("restored backup");
    fs.writeFileSync(file, "stale disk");
    await mirror(dir, pg).start();
    expect(fs.readFileSync(file, "utf8")).toBe("restored backup");
  });

  it("hands off the lock only after the old process flushes pending writes", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "before");
    const old = mirror(dir, pg);
    await old.start();
    fs.writeFileSync(file, "old pending update");
    old.save(file);
    let closed: Promise<void> | undefined;
    old.onHandoff = () => { closed ??= old.close(); };
    const newer = mirror(dir, pg);
    await newer.start();
    await closed;
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("old pending update");
    expect(fs.readFileSync(file, "utf8")).toBe("old pending update");
    await newer.close();
  });

  it("disables database persistence in tests even if DATABASE_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "postgres://unused");
    vi.stubEnv("NODE_ENV", "test");
    expect(fileDurabilityEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});