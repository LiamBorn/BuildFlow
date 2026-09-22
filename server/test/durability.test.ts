/**
 * How the database file gets published.
 *
 * sql.js has no incremental write: every save re-exports the whole image and rewrites the
 * file, on ~80 call sites. Done straight to the data file that is a truncate followed by a
 * write, so losing the process mid-save left a torn SQLite file — and for a tenant store
 * that file is the only copy. save() now writes a sibling temp file and renames it over the
 * target, which is atomic within a directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BuildFlowStore } from "../src/database.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const crew = (name: string) => ({ name, specialty: "Concrete", foreman: "Ana Lopez", laborMix: [] });
const strays = (dir: string) => fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));

describe("the database file is published atomically", () => {
  it("cleans up after itself and leaves a file the next boot can open", async () => {
    const dir = tempDir("buildflow-durability-");
    const file = path.join(dir, "store.sqlite");
    const store = await BuildFlowStore.create(file, true);
    store.createCrew(crew("Crew one"));
    store.createCrew(crew("Crew two"));

    expect(strays(dir), "a temp file left behind would be published by a later rename").toEqual([]);

    // The real proof that the bytes on disk are whole: open them again as a database.
    const reopened = await BuildFlowStore.create(file, false);
    expect(reopened.crews().map((c) => c.name)).toEqual(expect.arrayContaining(["Crew one", "Crew two"]));
  });

  it("keeps the previous database intact when the publish fails part-way", async () => {
    const dir = tempDir("buildflow-durability-fail-");
    const file = path.join(dir, "store.sqlite");
    const store = await BuildFlowStore.create(file, true);
    store.createCrew(crew("Committed before the failure"));
    const before = fs.readFileSync(file);

    // Fail at the moment of publication — the step that used to be a bare truncate-and-write.
    const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("disk went away");
    });
    try {
      expect(() => store.createCrew(crew("Never lands"))).toThrow("disk went away");
    } finally {
      rename.mockRestore();
    }

    // The old database is still exactly the old database, byte for byte...
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    // ...and the half-written attempt did not survive as a file anyone could trip over.
    expect(strays(dir)).toEqual([]);

    const reopened = await BuildFlowStore.create(file, false);
    const names = reopened.crews().map((c) => c.name);
    expect(names).toContain("Committed before the failure");
    expect(names).not.toContain("Never lands");
  });
});
