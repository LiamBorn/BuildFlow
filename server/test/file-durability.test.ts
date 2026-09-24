import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDurability, dataStartupError, fileDurabilityEnabled, persistRestoredFile } from "../src/fileDurability.js";
import { listRestorePoints } from "../src/restore.js";
import { BuildFlowStore } from "../src/database.js";
import { ScheduleLiveHub } from "../src/schedule/live.js";
import { createShutdown } from "../src/shutdown.js";

class MemoryPg extends EventEmitter {
  epoch = 0;
  files = new Map<string, Buffer>();
  backups = new Map<string, Buffer>();
  backupImported = false;
  writes = 0;
  failNext = false;
  dropDuringSave = false;
  dropDuringLoad = false;
  brokenReleases = 0;
  locked = false;
  holder?: EventEmitter;
  dropOwner() {
    const owner = this.holder;
    this.holder = undefined;
    this.locked = false;
    owner?.emit("error", new Error("connection reset"));
    owner?.emit("end");
  }
  async connect() {
    let epoch = this.epoch;
    let files = new Map(this.files);
    let backups = new Map(this.backups);
    let backupImported = this.backupImported;
    const client = Object.assign(new EventEmitter(), {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_try_advisory_lock")) {
          const acquired = !this.locked;
          if (acquired) this.locked = true;
          if (acquired) this.holder = client;
          return { rows: [{ acquired }] };
        } else if (sql.includes("pg_advisory_unlock")) {
          this.locked = false;
          this.holder = undefined;
        } else if (sql.includes("pg_notify")) {
          queueMicrotask(() => this.holder?.emit("notification"));
        } else if (sql === "BEGIN") {
          epoch = this.epoch;
          files = new Map(this.files);
          backups = new Map(this.backups);
          backupImported = this.backupImported;
        } else if (sql.includes("buildflow_file_epoch") && sql.includes("INSERT")) {
          epoch++;
          return { rows: [{ epoch: String(epoch) }] };
        } else if (sql.includes("SELECT epoch")) {
          return { rows: [{ epoch: String(this.epoch) }] };
        } else if (sql.includes("SELECT filename")) {
          if (this.dropDuringLoad) {
            this.dropDuringLoad = false;
            client.emit("error", new Error("connection reset during load"));
            throw new Error("connection reset during load");
          }
          const selected = sql.includes("buildflow_backups") ? backups : files;
          return { rows: [...selected].map(([filename, contents]) => ({ filename, contents })) };
        } else if (sql.includes("SELECT id FROM buildflow_backup_import")) {
          return { rows: backupImported ? [{ id: 1 }] : [] };
        } else if (sql.includes("INSERT INTO buildflow_backup_import")) {
          backupImported = true;
        } else if (sql.includes("INSERT INTO buildflow_backups")) {
          if (this.failNext) {
            this.failNext = false;
            throw new Error("network unavailable");
          }
          backups.set(params[0] as string, params[1] as Buffer);
          this.writes++;
        } else if (sql.includes("DELETE FROM buildflow_backups")) {
          backups.delete(params[0] as string);
          this.writes++;
        } else if (sql.includes("INSERT INTO buildflow_files")) {
          if (this.dropDuringSave) {
            this.dropDuringSave = false;
            client.emit("error", new Error("connection reset during save"));
            throw new Error("connection reset during save");
          }
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
          this.backups = backups;
          this.backupImported = backupImported;
        }
        return { rows: [] };
      },
      release: (broken?: boolean) => {
        if (broken) this.brokenReleases++;
        if (broken && this.holder === client) {
          this.locked = false;
          this.holder = undefined;
        }
      }
    });
    return client;
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
    const snapshot = "buildflow-2026-09-24T10-00-00-000Z.sqlite";
    fs.writeFileSync(path.join(dir, "backups", snapshot), "first backup");
    const original = mirror(dir, pg);
    await original.start();
    expect(pg.files.size).toBe(2);
    expect(pg.backups.get(snapshot)?.toString()).toBe("first backup");
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "stale main");
    fs.writeFileSync(path.join(dir, "org-old.sqlite"), "stale org");
    await original.close();
    await mirror(dir, pg).start();
    expect(fs.readFileSync(path.join(dir, "buildflow.sqlite"), "utf8")).toBe("first main");
    expect(fs.existsSync(path.join(dir, "org-old.sqlite"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "backups", snapshot), "utf8")).toBe("first backup");
    expect(pg.backupImported).toBe(true);
  });

  it("prefers saved images and backups to stale local files; never reimports deleted snapshots", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const snapshot = "buildflow-2026-09-24T10-00-00-000Z.sqlite";
    pg.files.set("buildflow.sqlite", Buffer.from("pg main"));
    pg.backups.set(snapshot, Buffer.from("pg backup"));
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "stale main");
    fs.mkdirSync(path.join(dir, "backups"));
    fs.writeFileSync(path.join(dir, "backups", snapshot), "stale backup");
    const stale = "buildflow-2026-09-23T10-00-00-000Z.sqlite";
    fs.writeFileSync(path.join(dir, "backups", stale), "deleted backup");
    const first = mirror(dir, pg);
    await first.start();
    expect(fs.readFileSync(path.join(dir, "buildflow.sqlite"), "utf8")).toBe("pg main");
    expect(fs.readFileSync(path.join(dir, "backups", snapshot), "utf8")).toBe("pg backup");
    expect(fs.existsSync(path.join(dir, "backups", stale))).toBe(false);
    await first.close();
    pg.backups.clear();
    fs.writeFileSync(path.join(dir, "backups", stale), "stale again");
    const second = mirror(dir, pg);
    await second.start();
    expect(listRestorePoints(dir)).toEqual([]);
    await second.close();
  });

  it("hydrates and restores retained backups from a clean data directory", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    const snapshot = "buildflow-2026-09-24T10-00-00-000Z.sqlite";
    fs.writeFileSync(file, "main");
    const first = mirror(dir, pg);
    await first.start();
    const backup = path.join(dir, "backups", snapshot);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, "point in time");
    first.save(backup);
    await first.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const second = mirror(dir, pg);
    await second.start();
    expect(fs.readFileSync(file, "utf8")).toBe("main");
    expect(listRestorePoints(dir).map((point) => point.file)).toEqual([snapshot]);
    await second.close();
    fs.writeFileSync(file, fs.readFileSync(backup));
    await persistRestoredFile(file, pg as never);
    const third = mirror(dir, pg);
    await third.start();
    expect(fs.readFileSync(file, "utf8")).toBe("point in time");
    await third.close();
  });

  it("retries backup writes and fences old backup writers after handoff", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "main");
    const backup = path.join(dir, "backups", "buildflow-2026-09-24T10-00-00-000Z.sqlite");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    const old = mirror(dir, pg);
    await old.start();
    fs.writeFileSync(backup, "snapshot");
    old.save(backup);
    pg.failNext = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await old.flush();
    expect(old.hasPending).toBe(true);
    await old.close();
    expect(pg.backups.get(path.basename(backup))?.toString()).toBe("snapshot");
    const next = mirror(dir, pg);
    await next.start();
    fs.unlinkSync(backup);
    next.delete(backup);
    await next.flush();
    expect(pg.backups.size).toBe(0);
    await next.close();
    old.save(backup);
    await old.flush();
    expect(pg.backups.size).toBe(0);
  });

  it("mirrors retention deletions for cold workspace snapshots", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const main = path.join(dir, "buildflow.sqlite");
    const cold = path.join(dir, "org-cold.sqlite");
    await BuildFlowStore.create(main, true);
    await BuildFlowStore.create(cold, true, { seedDemo: false });
    const store = mirror(dir, pg);
    await store.start();
    const snapshots = ["org-cold-2026-09-21T10-00-00-000Z.sqlite", "org-cold-2026-09-22T10-00-00-000Z.sqlite"];
    fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
    for (const name of snapshots) {
      const backup = path.join(dir, "backups", name);
      fs.copyFileSync(cold, backup);
      store.save(backup);
    }
    await store.flush();
    // Retain one snapshot; the same deletion path used by backupFile removes
    // the old point from PostgreSQL rather than resurrecting it next boot.
    const newest = BuildFlowStore.backupFile(cold, 1);
    for (const name of snapshots) store.delete(path.join(dir, "backups", name));
    store.save(newest);
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const restarted = mirror(dir, pg);
    await restarted.start();
    expect(listRestorePoints(dir).map((point) => point.file)).toEqual([path.basename(newest)]);
    await restarted.close();
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

  it("handles an in-use connection error during a save and succeeds on retry", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "before");
    const store = mirror(dir, pg);
    await store.start();
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fs.writeFileSync(file, "after");
    pg.dropDuringSave = true;
    store.save(file);
    await vi.advanceTimersByTimeAsync(400);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("before");
    expect(pg.brokenReleases).toBe(1);
    expect(errors).toHaveBeenCalledWith("[data] PostgreSQL connection lost:", expect.any(Error));
    await vi.advanceTimersByTimeAsync(1000);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("after");
    await store.close();
  });

  it("handles in-use connection errors during startup load and restore", async () => {
    const dir = directory();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "before");
    const pg = new MemoryPg();
    const store = mirror(dir, pg);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    pg.dropDuringLoad = true;
    await expect(store.start()).rejects.toThrow("connection reset during load");
    expect(pg.brokenReleases).toBe(1);
    await store.close();

    pg.dropDuringSave = true;
    await expect(persistRestoredFile(file, pg as never)).rejects.toThrow("connection reset during save");
    expect(pg.brokenReleases).toBe(2);
    expect(errors).toHaveBeenCalledWith("[data] PostgreSQL restore connection lost:", expect.any(Error));
  });

  it("attaches listeners once when a waiting lock client is checked out repeatedly", async () => {
    const dir = directory();
    fs.writeFileSync(path.join(dir, "buildflow.sqlite"), "before");
    const pg = new MemoryPg();
    const release = vi.fn();
    const waiting = Object.assign(new EventEmitter(), {
      query: async (sql: string) => (sql.includes("pg_try_advisory_lock") ? { rows: [{ acquired: false }] } : { rows: [] }),
      release
    });
    let attempts = 0;
    const connector = {
      connect: async () => (++attempts <= 3 ? waiting : pg.connect()),
      end: async () => undefined
    };
    const store = new FileDurability(dir, connector as never);
    await store.start();
    expect(release).toHaveBeenCalledTimes(3);
    expect(waiting.listenerCount("error")).toBe(1);
    expect(waiting.listenerCount("end")).toBe(1);
    expect(waiting.listenerCount("notification")).toBe(1);
    await store.close();
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
    const handoff = vi.fn();
    old.onHandoff = handoff;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await old.flush();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("[data] old process fenced out:"));
    await vi.waitFor(() => expect(handoff).toHaveBeenCalledOnce());
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("newer");
  });

  it("refuses startup on an unreachable database without changing files", async () => {
    const dir = directory();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "keep this");
    const disconnected = {
      connect: async () => {
        throw new Error("database offline");
      },
      end: async () => undefined
    };
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
    const safety = path.join(dir, "backups", "buildflow-2026-09-24T10-00-00-000Z.sqlite");
    fs.mkdirSync(path.dirname(safety), { recursive: true });
    fs.writeFileSync(safety, "last write");
    await persistRestoredFile(file, pg as never, safety);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("restored backup");
    expect(pg.backups.get(path.basename(safety))?.toString()).toBe("last write");
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
    const backup = path.join(dir, "backups", "buildflow-2026-09-24T10-00-00-000Z.sqlite");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, "old pending snapshot");
    old.save(backup);
    let closed: Promise<void> | undefined;
    old.onHandoff = () => {
      closed ??= old.close();
    };
    const newer = mirror(dir, pg);
    await newer.start();
    await closed;
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("old pending update");
    expect(pg.backups.get(path.basename(backup))?.toString()).toBe("old pending snapshot");
    expect(fs.readFileSync(file, "utf8")).toBe("old pending update");
    await newer.close();
  });

  it("finishes shutdown with a real SSE connection open and saves the pending change", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "before");
    const store = mirror(dir, pg);
    await store.start();
    const hub = new ScheduleLiveHub();
    const app = express();
    app.get("/events", (_req, res) => hub.subscribe("org", res));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const req = http.get(`http://127.0.0.1:${port}/events`);
    const stream = await new Promise<http.IncomingMessage>((resolve) => req.once("response", resolve));
    stream.resume();
    fs.writeFileSync(file, "last change");
    store.save(file);
    const exited = new Promise<number>((resolve) => createShutdown(server, hub, store, resolve, 1000)("SIGTERM"));
    expect(await exited).toBe(0);
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("last change");
    await vi.waitFor(() => expect(stream.complete).toBe(true));
    req.destroy();
  });

  it("logs pool errors, reacquires a dropped lock connection and keeps saving", async () => {
    const dir = directory();
    const pg = new MemoryPg();
    const file = path.join(dir, "buildflow.sqlite");
    fs.writeFileSync(file, "before");
    const store = mirror(dir, pg);
    await store.start();
    const oldOwner = pg.holder;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    pg.emit("error", new Error("idle pool connection reset"));
    pg.dropOwner();
    await vi.waitFor(() => expect(pg.holder).toBeDefined());
    expect(pg.holder).not.toBe(oldOwner);
    const recoveredOwner = pg.holder;
    pg.dropOwner();
    await vi.waitFor(() => expect(pg.holder).toBeDefined());
    expect(pg.holder).not.toBe(recoveredOwner);
    fs.writeFileSync(file, "after reconnect");
    store.save(file);
    await store.flush();
    expect(pg.files.get("buildflow.sqlite")?.toString()).toBe("after reconnect");
    expect(errors).toHaveBeenCalled();
    await store.close();
  });

  it("tries a final save and exits by the deadline if a request never finishes", async () => {
    const app = express();
    app.get("/stuck", (_req, res) => {
      res.write("waiting");
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const req = http.get(`http://127.0.0.1:${port}/stuck`);
    const stream = await new Promise<http.IncomingMessage>((resolve) => req.once("response", resolve));
    stream.resume();
    const flush = vi.fn(async () => undefined);
    const closed = vi.fn(async () => undefined);
    const exitCode = new Promise<number>((resolve) =>
      createShutdown(server, new ScheduleLiveHub(), { flush, close: closed }, resolve, 50)("SIGTERM")
    );
    expect(await exitCode).toBe(1);
    expect(flush).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    req.destroy();
    server.closeAllConnections();
  });

  it("explains how to install the schema when a table is missing", () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    expect(dataStartupError(missing).message).toContain("Apply server/sql/file-images.sql");
    expect(dataStartupError(new Error("network offline")).message).toContain("refusing to start");
  });

  it("disables database persistence in tests even if DATABASE_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "postgres://unused");
    vi.stubEnv("NODE_ENV", "test");
    expect(fileDurabilityEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
