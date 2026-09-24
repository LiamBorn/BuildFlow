/**
 * BUILDFLOW_DATA_FILE moves the data, and everything follows it.
 *
 * The path used to be a line in database.ts and nothing else, so the only way to put BuildFlow's
 * data somewhere else was to edit the source. On a platform configured through environment
 * variables — Replit's Secrets, where docs/replit.md says a published app does not keep the files it
 * writes — that is the difference between being able to point the data somewhere durable and not.
 *
 * What makes this worth a test rather than trusting the one-liner: four separate things derive the
 * location, and they derive it in three different ways. stores.ts takes the DIRECTORY of the main
 * store's path for the per-workspace databases; restore.ts takes the directory of `defaultDataFile`
 * for the backups; restore-cli.ts takes its BASENAME to recognise the main database among the
 * backups; and the ops routes take the directory of the live store. If any one of them stopped
 * agreeing, the server and the restore CLI would disagree about where the data is — which is a
 * failure you would discover during a restore, at the worst moment to discover it.
 *
 * `defaultDataFile` is read once when database.ts is first imported, so each case here needs a fresh
 * module registry. vi.resetModules + a dynamic import is what gives it one; setting the variable and
 * importing normally would read whatever the first import in the run already decided.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.BUILDFLOW_DATA_FILE;

/** database.ts, re-evaluated against the environment as it stands now. */
async function freshDatabaseModule() {
  vi.resetModules();
  return await import("../src/database.js");
}

beforeEach(() => {
  delete process.env.BUILDFLOW_DATA_FILE;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BUILDFLOW_DATA_FILE;
  else process.env.BUILDFLOW_DATA_FILE = ORIGINAL;
  vi.resetModules();
});

describe("where the data lives", () => {
  it("defaults to server/data, resolved from the module and not from the working directory", async () => {
    const { defaultDataFile } = await freshDatabaseModule();
    expect(path.isAbsolute(defaultDataFile)).toBe(true);
    expect(defaultDataFile.endsWith(path.join("server", "data", "buildflow.sqlite"))).toBe(true);
  });

  it("takes an absolute BUILDFLOW_DATA_FILE as given", async () => {
    const wanted = path.join(os.tmpdir(), "bf-data-location", "main.sqlite");
    process.env.BUILDFLOW_DATA_FILE = wanted;
    const { defaultDataFile } = await freshDatabaseModule();
    expect(defaultDataFile).toBe(wanted);
  });

  it("resolves a relative one against the working directory, which is what a start command means", async () => {
    process.env.BUILDFLOW_DATA_FILE = "var/bf/main.sqlite";
    const { defaultDataFile } = await freshDatabaseModule();
    expect(defaultDataFile).toBe(path.resolve(process.cwd(), "var/bf/main.sqlite"));
  });

  it("ignores an empty or whitespace value rather than resolving it to the working directory", async () => {
    // path.resolve("") is process.cwd(), so an unset-but-present variable would otherwise put the
    // database in whatever directory the process happened to start in.
    process.env.BUILDFLOW_DATA_FILE = "   ";
    const { defaultDataFile } = await freshDatabaseModule();
    expect(defaultDataFile.endsWith(path.join("server", "data", "buildflow.sqlite"))).toBe(true);
  });

  it("carries the per-workspace databases and the backups with it, not just the main file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-data-loc-"));
    const wanted = path.join(dir, "nested", "main.sqlite");
    process.env.BUILDFLOW_DATA_FILE = wanted;

    vi.resetModules();
    const { BuildFlowStore } = await import("../src/database.js");
    const { StoreManager } = await import("../src/stores.js");
    const { backupsDir } = await import("../src/restore.js");

    const main = await BuildFlowStore.create(undefined, true);
    expect(main.dataFilePath).toBe(wanted);
    // created on demand, so the nested directory has to have been made for it
    expect(fs.existsSync(path.dirname(wanted))).toBe(true);

    const manager = new StoreManager(main);
    const files = manager.backupAll(5);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(path.dirname(file)).toBe(path.join(path.dirname(wanted), "backups"));
    // and the restore side agrees, which is the pairing that matters
    expect(backupsDir()).toBe(path.join(path.dirname(wanted), "backups"));

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
