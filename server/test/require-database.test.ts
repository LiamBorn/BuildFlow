/**
 * The published app runs only with its database.
 *
 * On 2026-09-24 the published app had no production database for most of a day. It had no
 * DATABASE_URL, so the PostgreSQL copy (fileDurability.ts) quietly stayed off, the app served
 * normally from local files, and every publish erased the accounts made since the one before. The
 * only sign was a log line. `BUILDFLOW_REQUIRE_DATABASE`, which `.replit` sets on the publish
 * command alone, turns that into a refusal to start that names the fix.
 */
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseRequired, startFileDurability } from "../src/fileDurability.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a process that requires its database", () => {
  it("refuses to start without DATABASE_URL, and says what to turn on", async () => {
    vi.stubEnv("BUILDFLOW_REQUIRE_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", "");
    await expect(startFileDurability()).rejects.toThrow(/refuses to start.*Create production database/);
  });

  it("counts a blank DATABASE_URL as missing", async () => {
    vi.stubEnv("BUILDFLOW_REQUIRE_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", "   ");
    await expect(startFileDurability()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("does not stand in the way when DATABASE_URL is there", async () => {
    // Under the test runner the PostgreSQL copy itself stays off, so this proves only that the
    // requirement is satisfied by the variable, without a connection being attempted.
    vi.stubEnv("BUILDFLOW_REQUIRE_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", "postgres://unused");
    await expect(startFileDurability()).resolves.toBeUndefined();
  });
});

describe("everywhere else", () => {
  it("still runs on files without a database, as a laptop, the workspace and the tests do", async () => {
    vi.stubEnv("BUILDFLOW_REQUIRE_DATABASE", "");
    vi.stubEnv("DATABASE_URL", "");
    await expect(startFileDurability()).resolves.toBeUndefined();
  });

  it("reads the setting as an explicit yes", () => {
    for (const on of ["1", "on", "true", "yes", " ON "]) expect(databaseRequired({ BUILDFLOW_REQUIRE_DATABASE: on })).toBe(true);
    for (const off of [undefined, "", "0", "off", "false", "no"]) {
      expect(databaseRequired({ BUILDFLOW_REQUIRE_DATABASE: off })).toBe(false);
    }
  });
});

/*
 * Replit rewrites .replit by itself (it dropped this file's comments and added a port on 2026-09-24),
 * and its Agent has edited the run setup more than once, so the setting's place is checked too: on
 * the publish command, which starts the published app, and not on the workspace's Run commands,
 * whose app should keep working if its development database goes away.
 */
describe(".replit", () => {
  const replit = fs.readFileSync(new URL("../../.replit", import.meta.url), "utf8");
  const code = replit
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const deployment = code.slice(code.indexOf("[deployment]"), code.indexOf("\n[", code.indexOf("[deployment]")));

  it("sets it on the published app's start command", () => {
    expect(deployment).toMatch(/^run = .*BUILDFLOW_REQUIRE_DATABASE=1/m);
  });

  it("sets it nowhere else", () => {
    expect(code.match(/BUILDFLOW_REQUIRE_DATABASE/g)).toHaveLength(1);
  });
});
