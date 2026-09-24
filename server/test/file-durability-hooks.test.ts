/**
 * The two places the data layer tells the PostgreSQL copy (fileDurability.ts) that a data file
 * changed: every save of a store queues the file's new image, and dropping a workspace queues its
 * removal. file-durability.test.ts tests the copy itself; this proves the stores call it, which is
 * the half that silently stops working if a save path forgets.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletedFile, savedFile } from "../src/fileDurability.js";
import { BuildFlowStore } from "../src/database.js";
import { StoreManager } from "../src/stores.js";

vi.mock("../src/fileDurability.js", () => ({ savedFile: vi.fn(), deletedFile: vi.fn() }));

const dirs: string[] = [];
const directory = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-durability-hooks-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  vi.mocked(savedFile).mockClear();
  vi.mocked(deletedFile).mockClear();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the data layer's hooks into the PostgreSQL copy", () => {
  it("queues a store's file after every save, not before the file is on disk", async () => {
    const file = path.join(directory(), "buildflow.sqlite");
    const store = await BuildFlowStore.create(file, true, { seedDemo: false });
    expect(savedFile).toHaveBeenCalledWith(file);

    vi.mocked(savedFile).mockClear();
    vi.mocked(savedFile).mockImplementation((saved) => {
      // the copy reads the file when it drains, so the save must already be published
      expect(fs.existsSync(saved)).toBe(true);
    });
    store.addWaitlistSubscriber("someone@example.com");
    expect(savedFile).toHaveBeenCalledTimes(1);
    expect(savedFile).toHaveBeenCalledWith(file);
    vi.mocked(savedFile).mockReset();
  });

  it("queues a dropped workspace's file for removal", async () => {
    const dir = directory();
    const manager = new StoreManager(await BuildFlowStore.create(path.join(dir, "buildflow.sqlite"), true, { seedDemo: false }));
    await manager.getOrgStore("org-hooks");
    const orgFile = path.join(dir, "org-org-hooks.sqlite");
    expect(savedFile).toHaveBeenCalledWith(orgFile);

    await manager.dropOrgStore("org-hooks");
    expect(fs.existsSync(orgFile)).toBe(false);
    expect(deletedFile).toHaveBeenCalledWith(orgFile);
  });
});
