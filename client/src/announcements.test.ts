import { describe, expect, it } from "vitest";
import { announcementIsLive } from "./announcements";

describe("announcementIsLive", () => {
  it("shows an announcement through its last day and not after", () => {
    expect(announcementIsLive("2026-09-09", "2026-10-06")).toBe(true);
    expect(announcementIsLive("2026-10-06", "2026-10-06")).toBe(true);
    expect(announcementIsLive("2026-10-07", "2026-10-06")).toBe(false);
  });
  it("never shows on a malformed date", () => {
    expect(announcementIsLive("not a date", "2026-10-06")).toBe(false);
  });
});
