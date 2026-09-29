import { describe, expect, it } from "vitest";
import { CURRENT_RELEASE, compareVersions, isNewerRelease } from "./release";

describe("releases", () => {
  it("compares dotted numbers part by part, not as text", () => {
    expect(compareVersions("3.10", "3.9")).toBeGreaterThan(0);
    expect(compareVersions("4.0", "3.9")).toBeGreaterThan(0);
    expect(compareVersions("3.9", "3.9.0")).toBe(0);
    expect(compareVersions("v3.9.1", "3.9")).toBeGreaterThan(0);
    expect(compareVersions("3.8", "3.9")).toBeLessThan(0);
  });

  it("offers only a real release that is strictly newer", () => {
    const next = { ...CURRENT_RELEASE, version: "4.0" };
    expect(isNewerRelease(next)).toBe(true);
    // the same release, or a server rolled back to an older one, is not an update
    expect(isNewerRelease(CURRENT_RELEASE)).toBe(false);
    expect(isNewerRelease({ ...CURRENT_RELEASE, version: "3.1" })).toBe(false);
    // and nothing that is not a release is ever one
    expect(isNewerRelease(null)).toBe(false);
    expect(isNewerRelease("<!doctype html>")).toBe(false);
    expect(isNewerRelease({ ok: false, error: "Database unavailable." })).toBe(false);
    expect(isNewerRelease({ ...next, version: "latest" })).toBe(false);
    expect(isNewerRelease({ ...next, highlights: undefined })).toBe(false);
  });
});
