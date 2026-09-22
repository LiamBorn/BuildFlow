/**
 * Which workspaces a backup actually covers.
 *
 * backupAll() used to walk the open-store cache alone, and at boot that cache holds only the
 * main store — so a tenant was snapshotted only if somebody happened to sign into it during
 * that process's life and a backup ran afterwards. In practice that left almost every
 * workspace database with no backup the app had ever taken.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildFlowStore } from "../src/database.js";
import { StoreManager } from "../src/stores.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A data directory with a main store and `coldCount` tenant files nobody has opened. */
async function workspaces(coldCount: number) {
  const dir = tempDir("buildflow-backup-cover-");
  const main = await BuildFlowStore.create(path.join(dir, "buildflow.sqlite"), true);
  const manager = new StoreManager(main);
  const cold: string[] = [];
  for (let i = 0; i < coldCount; i += 1) {
    const file = path.join(dir, `org-org-cold${i}.sqlite`);
    // Create it as a real database, then let it go: nothing holds it open afterwards.
    await BuildFlowStore.create(file, true, { seedDemo: false });
    cold.push(file);
  }
  const snapshotsOf = (file: string) => {
    const backups = path.join(dir, "backups");
    if (!fs.existsSync(backups)) return [];
    const base = path.basename(file, path.extname(file));
    return fs.readdirSync(backups).filter((f) => f.startsWith(`${base}-`));
  };
  return { dir, manager, cold, snapshotsOf };
}

describe("backupAll covers every workspace, not just the ones in memory", () => {
  it("snapshots tenant databases nobody has opened", async () => {
    const { manager, cold, snapshotsOf } = await workspaces(3);

    // Exactly the boot situation: only the main store is cached.
    for (const file of cold) expect(snapshotsOf(file), `${path.basename(file)} starts with none`).toEqual([]);

    manager.backupAll();

    for (const file of cold) {
      expect(snapshotsOf(file), `${path.basename(file)} must now have one`).toHaveLength(1);
    }
  });

  it("makes a cold workspace's snapshot restorable, byte for byte", async () => {
    const { dir, manager, cold } = await workspaces(1);
    const before = fs.readFileSync(cold[0]);

    manager.backupAll();

    const base = path.basename(cold[0], ".sqlite");
    const snapshot = fs.readdirSync(path.join(dir, "backups")).find((f) => f.startsWith(`${base}-`))!;
    expect(fs.readFileSync(path.join(dir, "backups", snapshot)).equals(before)).toBe(true);
  });

  /**
   * A cold file has not changed since its last snapshot almost by definition. Without this,
   * every boot would file another copy of the same bytes and push genuinely older states out
   * of the retention window — the backups would all be of the same moment.
   */
  it("does not file a second identical copy of a workspace that has not changed", async () => {
    const { manager, cold, snapshotsOf } = await workspaces(2);

    manager.backupAll();
    const afterFirst = cold.map(snapshotsOf);
    manager.backupAll();

    cold.forEach((file, i) => {
      expect(snapshotsOf(file), `${path.basename(file)} should still have one`).toEqual(afterFirst[i]);
    });
  });

  it("does snapshot a cold workspace again once its bytes differ", async () => {
    const { manager, cold, snapshotsOf } = await workspaces(1);
    manager.backupAll();
    expect(snapshotsOf(cold[0])).toHaveLength(1);

    // Something changed the file out of process — another instance, or a restore.
    const reopened = await BuildFlowStore.create(cold[0], false, { seedDemo: false });
    reopened.createCrew({ name: "Changed while cold", specialty: "Concrete", foreman: "Ana Lopez", laborMix: [] });

    manager.backupAll();
    expect(snapshotsOf(cold[0]), "a changed workspace is worth another restore point").toHaveLength(2);
  });

  /** Opening it would load a whole database into memory and migrate it, to take a copy. */
  it("copies a cold file rather than opening it, leaving it untouched", async () => {
    const { manager, cold } = await workspaces(1);
    const before = fs.readFileSync(cold[0]);

    manager.backupAll();

    expect(fs.readFileSync(cold[0]).equals(before), "taking a backup must not modify the original").toBe(true);
  });
});
