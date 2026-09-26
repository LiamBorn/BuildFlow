/**
 * The greeting the Dashboard and the Mac share. Instants are built in LOCAL time, so the hours read
 * the same in whatever zone the suite runs in.
 */
import { describe, expect, it } from "vitest";
import { firstNameOf, greetingFor, hourOf, partOfDay, WELCOME_BACK_AFTER_MS } from "./greeting";

const at = (hour: number, minute = 0) => new Date(2026, 8, 26, hour, minute);

describe("the greeting", () => {
  it("says good morning, afternoon and evening where the website always did", () => {
    expect(greetingFor({ name: "Liam Santos", now: at(8, 12) }).text).toBe("Good morning, Liam");
    expect(greetingFor({ name: "Liam Santos", now: at(12) }).text).toBe("Good afternoon, Liam");
    expect(greetingFor({ name: "Liam Santos", now: at(16, 59) }).text).toBe("Good afternoon, Liam");
    expect(greetingFor({ name: "Liam Santos", now: at(17) }).text).toBe("Good evening, Liam");
    expect(greetingFor({ name: "Liam Santos", now: at(21, 59) }).text).toBe("Good evening, Liam");
  });

  it("says Working late from 10 PM to 4:59 AM — at 1 AM it used to say good morning", () => {
    expect(greetingFor({ name: "Liam Santos", now: at(1) })).toEqual({
      kind: "late",
      words: "Working late",
      firstName: "Liam",
      text: "Working late, Liam"
    });
    expect(greetingFor({ name: "Liam", now: at(22) }).kind).toBe("late");
    expect(greetingFor({ name: "Liam", now: at(0) }).kind).toBe("late");
    expect(greetingFor({ name: "Liam", now: at(4, 59) }).kind).toBe("late");
    expect(greetingFor({ name: "Liam", now: at(5) }).kind).toBe("morning");
  });

  it("says Welcome back after three hours away, and only then", () => {
    const now = at(14);
    const away = (ms: number) => greetingFor({ name: "Liam", now, lastActiveAt: now.getTime() - ms });
    expect(away(3 * 60 * 60 * 1000).text).toBe("Welcome back, Liam");
    expect(away(WELCOME_BACK_AFTER_MS + 1).kind).toBe("welcome-back");
    expect(away(WELCOME_BACK_AFTER_MS - 1).text).toBe("Good afternoon, Liam");
    // an ISO string is read too, as the server keeps times
    expect(greetingFor({ name: "Liam", now, lastActiveAt: new Date(now.getTime() - 4 * 3600_000).toISOString() }).kind).toBe(
      "welcome-back"
    );
    // nothing known, unreadable, or in the future: the time of day
    expect(greetingFor({ name: "Liam", now, lastActiveAt: null }).kind).toBe("afternoon");
    expect(greetingFor({ name: "Liam", now, lastActiveAt: "not a time" }).kind).toBe("afternoon");
    expect(greetingFor({ name: "Liam", now, lastActiveAt: now.getTime() + 5 * 3600_000 }).kind).toBe("afternoon");
  });

  it("welcomes you back even late at night, because coming back is the news", () => {
    expect(greetingFor({ name: "Liam", now: at(1), lastActiveAt: at(1).getTime() - 5 * 3600_000 }).kind).toBe("welcome-back");
  });

  it('uses the first name, capitalised, or "There" as the Dashboard always has', () => {
    expect(firstNameOf("liam santos")).toBe("Liam");
    expect(firstNameOf("  Matt  Johnson ")).toBe("Matt");
    expect(firstNameOf("")).toBe("There");
    expect(firstNameOf(undefined)).toBe("There");
    expect(greetingFor({ name: null, now: at(9) }).text).toBe("Good morning, There");
  });

  it("reads the hour on the reader's clock when the server says whose it is", () => {
    // 2026-09-26 06:30 UTC is 1:30 AM in Chicago and 8:30 AM in Paris
    const instant = Date.UTC(2026, 8, 26, 6, 30);
    expect(hourOf(instant, "America/Chicago")).toBe(1);
    expect(hourOf(instant, "Europe/Paris")).toBe(8);
    expect(greetingFor({ name: "Liam", now: instant, timeZone: "America/Chicago" }).kind).toBe("late");
    expect(greetingFor({ name: "Liam", now: instant, timeZone: "Europe/Paris" }).kind).toBe("morning");
    // an unknown zone falls back to the machine's clock rather than throwing
    expect(hourOf(at(9), "Not/AZone")).toBe(9);
  });

  it("puts every hour of the day in exactly one part", () => {
    const parts = Array.from({ length: 24 }, (_, hour) => partOfDay(hour));
    expect(parts.filter((part) => part === "morning")).toHaveLength(7);
    expect(parts.filter((part) => part === "afternoon")).toHaveLength(5);
    expect(parts.filter((part) => part === "evening")).toHaveLength(5);
    expect(parts.filter((part) => part === "late")).toHaveLength(7);
  });
});
