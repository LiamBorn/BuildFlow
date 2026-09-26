/**
 * The Dashboard's greeting, now the shared one the Mac's notch uses (2026-09-26): the time of day,
 * "Working late" from 10 PM, and "Welcome back" after three hours or more away.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { __forgetLastActive } from "../lastActive";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const greeting = () => document.querySelector<HTMLElement>(".hs-home-greeting")?.textContent ?? null;
const PINNED = new Date("2026-06-16T12:00:00");

describe("the Dashboard greeting", () => {
  installAppHarness();
  beforeEach(() => __forgetLastActive());
  afterEach(() => vi.setSystemTime(PINNED));

  it("says good afternoon at noon, and remembers that you were here", async () => {
    render(<App />);
    await enterDashboard();
    expect(greeting()).toBe("Good afternoon, Matt");
    expect(Number(window.localStorage.getItem("bf:last-active:u-matt"))).toBe(PINNED.getTime());
  });

  it("says Working late at 1 AM, where it used to say good morning", async () => {
    vi.setSystemTime(new Date(2026, 5, 16, 1, 0));
    render(<App />);
    await enterDashboard();
    expect(greeting()).toBe("Working late, Matt");
  });

  it("says Welcome back after three hours away, for the whole visit", async () => {
    window.localStorage.setItem("bf:last-active:u-matt", String(PINNED.getTime() - 3 * 60 * 60 * 1000));
    render(<App />);
    await enterDashboard();
    expect(greeting()).toBe("Welcome back, Matt");
    // the visit wrote its own time, but the greeting was decided when it started
    expect(Number(window.localStorage.getItem("bf:last-active:u-matt"))).toBe(PINNED.getTime());
    expect(screen.getByRole("heading", { name: "Welcome back, Matt" })).toBeInTheDocument();
  });

  it("does not say Welcome back after a short break", async () => {
    window.localStorage.setItem("bf:last-active:u-matt", String(PINNED.getTime() - 2 * 60 * 60 * 1000));
    render(<App />);
    await enterDashboard();
    expect(greeting()).toBe("Good afternoon, Matt");
  });
});
