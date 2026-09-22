/**
 * The desk's formatting rules. These read as trivia until one is wrong on a deal sheet: a
 * money figure is the number a person quotes back down the phone, and "2h ago" against a
 * customer message decides whether anyone chases it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGES, dueLabel, initials, money, moneyFull, priorityTone, statusTone, timeAgo } from "./util";
import type { LeadStatus, Priority } from "./api";

afterEach(() => vi.useRealTimers());

describe("money", () => {
  it("writes hundreds in full and thousands as k", () => {
    expect(money(0)).toBe("$0");
    expect(money(950)).toBe("$950");
    expect(money(999)).toBe("$999");
    expect(money(1000)).toBe("$1k");
  });

  /** The subtle half of the rule: a round thousand gets no decimal, anything else gets one. */
  it("shows a decimal only when the thousands are not round", () => {
    expect(money(12000)).toBe("$12k");
    expect(money(12500)).toBe("$12.5k");
    expect(money(12050), "rounded to one place, not dropped").toBe("$12.1k");
    expect(money(1250000)).toBe("$1,250k");
  });

  it("keeps the full figure available for where the exact number matters", () => {
    expect(moneyFull(12500)).toBe("$12,500");
    expect(moneyFull(0)).toBe("$0");
  });
});

describe("timeAgo", () => {
  it("says Never rather than computing from nothing", () => {
    expect(timeAgo(null)).toBe("Never");
  });

  it("counts up through the units", () => {
    // A fixed now, so these do not rot as the real clock moves.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    const ago = (ms: number) => timeAgo(new Date(Date.now() - ms).toISOString());

    expect(ago(20_000)).toBe("Just now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(59 * 60_000)).toBe("59m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(2 * 86_400_000)).toBe("2d ago");
  });

  it("falls back to a date once it is more than a week old", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    const old = timeAgo(new Date("2026-08-01T12:00:00.000Z").toISOString());
    expect(old).not.toMatch(/ago|Just now|Never/);
    expect(old).toMatch(/Aug/);
  });
});

describe("dueLabel", () => {
  it("marks a past due date overdue and a future one not", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    expect(dueLabel("2026-09-21T09:00:00.000Z").overdue).toBe(true);
    expect(dueLabel("2026-09-23T09:00:00.000Z").overdue).toBe(false);
    expect(dueLabel("2026-09-23T09:00:00.000Z").text).toBeTruthy();
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Dana Whitfield")).toBe("DW");
    expect(initials("dana whitfield")).toBe("DW");
    expect(initials("Dana")).toBe("D");
    expect(initials("Mary Jane Watson"), "capped at two").toBe("MJ");
  });

  it("copes with the input a real roster produces", () => {
    expect(initials("  Dana   Whitfield  "), "extra whitespace").toBe("DW");
    expect(initials(""), "an empty name still needs an avatar").toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("the tone tables", () => {
  /** A status with no tone renders an unstyled chip, which is how one slips through. */
  it("gives every lead status a tone", () => {
    const every: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
    for (const status of every) expect(statusTone[status], `${status} has no tone`).toBeTruthy();
    expect(Object.keys(statusTone).sort()).toEqual([...every].sort());
  });

  it("gives every priority a tone", () => {
    const every: Priority[] = ["Low", "Normal", "High", "Urgent"];
    for (const p of every) expect(priorityTone[p], `${p} has no tone`).toBeTruthy();
    expect(Object.keys(priorityTone).sort()).toEqual([...every].sort());
  });

  it("keeps the terminal statuses off the pipeline board", () => {
    expect(STAGES).toEqual(["New", "Contacted", "Qualified", "Proposal"]);
    expect(STAGES, "Won and Lost are outcomes, not columns to drag into").not.toContain("Won");
    expect(STAGES).not.toContain("Lost");
  });
});
