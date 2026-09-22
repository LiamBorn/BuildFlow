/**
 * Restoring a backup. Backups were written and listed but nothing could bring one back,
 * and the moment you need one is the worst moment to be working out the naming convention
 * by hand. The assertions that matter are the refusals: a corrupt file must never be
 * published over a working one, and whatever was there has to be kept first.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildFlowStore } from "../src/database.js";
import { publishAtomically, readableDatabase, restore, snapshotCurrent, type RestorePoint } from "../src/restore.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

describe("reading a file before trusting it", () => {
  it("accepts a real database and says how much is in it", async () => {
    const file = path.join(tempDir("buildflow-restore-ok-"), "store.sqlite");
    await BuildFlowStore.create(file, true);
    const check = await readableDatabase(file);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.tables).toBeGreaterThan(5);
  });

  it("refuses an empty file, a truncated one, and something that is not a database", async () => {
    const dir = tempDir("buildflow-restore-bad-");
    const real = path.join(dir, "real.sqlite");
    await BuildFlowStore.create(real, true);

    const empty = path.join(dir, "empty.sqlite");
    fs.writeFileSync(empty, "");
    // A torn write is the case this whole check exists for: a real header, then nothing.
    const torn = path.join(dir, "torn.sqlite");
    fs.writeFileSync(torn, fs.readFileSync(real).subarray(0, 100));
    const notADb = path.join(dir, "notes.sqlite");
    fs.writeFileSync(notADb, "these are not the bytes you are looking for");

    for (const file of [empty, torn, notADb]) {
      const check = await readableDatabase(file);
      expect(check.ok, `${path.basename(file)} must not be treated as restorable`).toBe(false);
    }
  });

  /** Opening through BuildFlowStore would migrate and save it — a change to the evidence. */
  it("does not modify the file it is inspecting", async () => {
    const file = path.join(tempDir("buildflow-restore-ro-"), "store.sqlite");
    await BuildFlowStore.create(file, true);
    const before = fs.readFileSync(file);
    await readableDatabase(file);
    expect(fs.readFileSync(file).equals(before)).toBe(true);
  });
});

describe("publishing the restored file", () => {
  it("lands atomically and leaves no temp file behind", async () => {
    const dir = tempDir("buildflow-restore-pub-");
    const from = path.join(dir, "from.sqlite");
    const to = path.join(dir, "to.sqlite");
    await BuildFlowStore.create(from, true);
    fs.writeFileSync(to, "older contents");

    publishAtomically(from, to);

    expect(fs.readFileSync(to).equals(fs.readFileSync(from))).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
    // What landed is a database the next boot can open.
    expect((await readableDatabase(to)).ok).toBe(true);
  });

  it("keeps what was there as a restore point of its own, beside the file", async () => {
    const dir = tempDir("buildflow-restore-keep-");
    const file = path.join(dir, "store.sqlite");
    await BuildFlowStore.create(file, true);
    const before = fs.readFileSync(file);

    const kept = snapshotCurrent(file);

    expect(kept, "a restore has to be undoable, so what it replaces is kept first").toBeDefined();
    /* Beside the file, not in the configured data directory. The first version of this used
       backupsDir() whatever it was handed, so restoring a file in a temp directory wrote its
       snapshot into the real data/backups/ — which is how this assertion came to exist. */
    expect(path.dirname(kept!)).toBe(path.join(dir, "backups"));
    expect(fs.readFileSync(kept!).equals(before)).toBe(true);
    expect((await readableDatabase(kept!)).ok, "and what is kept must itself be restorable").toBe(true);
  });

  it("has nothing to keep when the file does not exist yet", () => {
    const missing = path.join(tempDir("buildflow-restore-none-"), "absent.sqlite");
    expect(snapshotCurrent(missing)).toBeUndefined();
  });
});

describe("restoring, end to end", () => {
  /** A throwaway data directory holding one database and one snapshot of it. */
  async function scenario() {
    const dir = tempDir("buildflow-restore-e2e-");
    const live = path.join(dir, "buildflow.sqlite");
    const store = await BuildFlowStore.create(live, true);

    // Snapshot the good state, then change the database so the two differ.
    const backups = path.join(dir, "backups");
    fs.mkdirSync(backups, { recursive: true });
    const point: RestorePoint = {
      file: "buildflow-2026-09-22T10-00-00-000Z.sqlite",
      base: "buildflow",
      takenAt: new Date(),
      bytes: 0
    };
    fs.copyFileSync(live, path.join(backups, point.file));
    const goodBytes = fs.readFileSync(live);

    store.createCrew({ name: "Added after the snapshot", specialty: "Concrete", foreman: "Ana Lopez", laborMix: [] });
    expect(fs.readFileSync(live).equals(goodBytes), "the live file must have moved on").toBe(false);
    return { dir, live, point, goodBytes };
  }

  it("puts the snapshot back, and keeps what it replaced", async () => {
    const { dir, live, point, goodBytes } = await scenario();

    const outcome = await restore(point, dir);

    expect(fs.readFileSync(live).equals(goodBytes), "the live file is the snapshot again").toBe(true);
    expect(outcome.tables).toBeGreaterThan(5);
    // The newer state is not lost — it is kept as a restore point of its own, so picking
    // the wrong point in time is itself undoable.
    expect(outcome.previousSnapshot).toBeDefined();
    const kept = await BuildFlowStore.create(outcome.previousSnapshot!, false, { seedDemo: false });
    expect(kept.crews().map((c) => c.name)).toContain("Added after the snapshot");
  });

  it("refuses a restore point that is not a readable database, leaving the live file alone", async () => {
    const { dir, live, point } = await scenario();
    const before = fs.readFileSync(live);

    // Corrupt the snapshot: a real header and nothing after it, the torn-write case.
    fs.writeFileSync(path.join(dir, "backups", point.file), before.subarray(0, 100));

    await expect(restore(point, dir)).rejects.toThrow(/not a database that can be restored/);
    expect(fs.readFileSync(live).equals(before), "a refused restore must change nothing").toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });
});
