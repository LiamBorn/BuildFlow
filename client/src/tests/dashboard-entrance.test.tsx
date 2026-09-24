/**
 * The Dashboard's entrance — the reference's cascade on the click that opens the page.
 * The sheet staggers every panel by `--bfe-i`, its place in the reading order, which the
 * board writes as an inline variable; and clicking Home in the rail while the Dashboard is
 * already showing remounts it, so the entrance plays again.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";
import { BOARD_RANK_CAP, __resetOpeningGate } from "../motion";

describe("the Dashboard's entrance", () => {
  installAppHarness();

  it("ranks every panel in reading order for the sheet's cascade", async () => {
    render(<App />);
    await enterDashboard();

    const panels = [...document.querySelectorAll<HTMLElement>(".dash-block")];
    expect(panels.length).toBe(13);
    const ranked = panels.map((panel) => ({
      rank: Number(panel.style.getPropertyValue("--bfe-i")),
      top: parseFloat(panel.style.top),
      left: parseFloat(panel.style.left)
    }));
    // every panel carries a rank, and the ranks are exactly 0..12
    expect(ranked.map((entry) => entry.rank).sort((a, b) => a - b)).toEqual([...Array(13).keys()]);
    // and the ranks follow the reading order: down the page, then across
    const inOrder = [...ranked].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < inOrder.length; i += 1) {
      const before = inOrder[i - 1];
      const after = inOrder[i];
      expect(
        after.top > before.top || (after.top === before.top && after.left >= before.left),
        `rank ${after.rank} after ${before.rank}`
      ).toBe(true);
    }
  });

  it("plays again when Home is clicked while the Dashboard is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const before = document.querySelector(".dash-block");
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    const after = document.querySelector(".dash-block");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before); // a fresh mount: the animations run from their first frame
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
  });

  it("plays again on the Schedule page when Schedule is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Schedule (New)" }));
    await screen.findByRole("heading", { name: /The whole plan/ });
    const before = document.querySelector(".sched-board-host");
    expect(before).not.toBeNull();
    // the board's sections are ranked for the cascade there too
    expect(document.querySelector<HTMLElement>(".sched-board-host .dash-block")?.style.getPropertyValue("--bfe-i")).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Schedule (New)" }));

    const after = document.querySelector(".sched-board-host");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(await screen.findByRole("heading", { name: /The whole plan/ })).toBeInTheDocument();
  });

  it("plays again on the Projects page when Operations is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    await screen.findByRole("heading", { name: "Projects" });
    const before = document.querySelector(".projects-page");
    expect(before).not.toBeNull();
    // the KPI strip's figures are the counting kind
    expect(document.querySelector(".projects-page .hs-kpi-value")?.textContent?.trim()).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Operations" }));

    const after = document.querySelector(".projects-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
  });

  it("plays again on the Crews page when Crews is clicked in the flyout while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const openCrews = async () => {
      const operations = screen.getByRole("button", { name: "Operations" });
      fireEvent.mouseEnter(operations.parentElement as HTMLElement);
      fireEvent.click(await screen.findByRole("menuitem", { name: /^Crews/ }));
      await screen.findByRole("heading", { name: "Crews" });
    };
    await openCrews();
    const before = document.querySelector(".crews-page");
    expect(before).not.toBeNull();
    expect(document.querySelector(".crews-page .hs-kpi-value")?.textContent?.trim()).not.toBe("");

    await openCrews();

    const after = document.querySelector(".crews-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Inventory page when the Resources rail button is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: /^Resources( \(.*\))?$/ }));
    await screen.findByRole("heading", { name: /^Inventory/ });
    const before = document.querySelector(".inventory-page");
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Resources( \(.*\))?$/ }));

    const after = document.querySelector(".inventory-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the DelayIQs page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const field = screen.getByRole("button", { name: /^Field( \(.*\))?$/ });
    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^DelayIQs/ }));
    await screen.findByRole("heading", { name: /^DelayIQs/ });
    const before = document.querySelector(".delayIQ-rx");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^DelayIQs/ }));

    const after = document.querySelector(".delayIQ-rx");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Reports page when the Reporting rail button is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: /^Reporting( \(.*\))?$/ }));
    await screen.findByRole("heading", { name: /^Reports$/ });
    const before = document.querySelector(".reports-page");
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Reporting( \(.*\))?$/ }));

    const after = document.querySelector(".reports-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the TimeCard page when its rail button is clicked while it is already showing", async () => {
    // an add-on page: without the product the rail opens the "Get Time Cards" prompt
    state.bootstrapPayload = { ...bootstrapFixture, selectedProducts: ["time-cards"] };
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: /^TimeCard( \(.*\))?$/ }));
    await screen.findByRole("heading", { name: /^TimeCard$/ });
    const before = document.querySelector(".tc-page");
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^TimeCard( \(.*\))?$/ }));

    const after = document.querySelector(".tc-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Inventory page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const resources = screen.getByRole("button", { name: /^Resources/ });
    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Inventory/ }));
    await screen.findByRole("heading", { name: /^Inventory/ });
    const before = document.querySelector(".inventory-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Inventory/ }));

    const after = document.querySelector(".inventory-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Field Updates page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const field = screen.getByRole("button", { name: /^Field( \(.*\))?$/ });
    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Field Updates/ }));
    await screen.findByRole("heading", { name: /^Field Updates/ });
    const before = document.querySelector(".field-updates-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Field Updates/ }));

    const after = document.querySelector(".field-updates-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Settings page when it is opened from the account menu while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const openSettings = () => {
      fireEvent.click(screen.getByRole("button", { name: / account$/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: /^Settings$/ }));
    };
    openSettings();
    await screen.findByRole("heading", { name: /^Preferences$/ });
    const before = document.querySelector(".settings-rx");
    expect(before).not.toBeNull();

    openSettings();

    const after = document.querySelector(".settings-rx");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Bookmarks page when its rail button is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    // the top bar's quick-access star is also named Bookmarks: take the rail's hub button
    const rail = () => within(screen.getByRole("navigation", { name: "Hubs" }));
    fireEvent.click(rail().getByRole("button", { name: /^Bookmarks( \(.*\))?$/ }));
    await screen.findByRole("heading", { name: /^Bookmarks$/ });
    const before = document.querySelector(".bookmarks-page");
    expect(before).not.toBeNull();

    fireEvent.click(rail().getByRole("button", { name: /^Bookmarks( \(.*\))?$/ }));

    const after = document.querySelector(".bookmarks-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});

/**
 * The opening, re-cut to docs/motion-spec.md (2026-09-19). The numbers are in
 * motion/tokens.ts and skin §74; what is wired in React is here — the board's place
 * in the cascade, the title's per-character reveal, and the once-a-session gate.
 */
describe("the Dashboard's opening", () => {
  installAppHarness();

  it("gives every panel a row and a column, so the board deals itself out a row at a time", async () => {
    render(<App />);
    await enterDashboard();

    const panels = [...document.querySelectorAll<HTMLElement>(".dash-block")];
    expect(panels.length).toBe(13);
    const placed = panels.map((panel) => ({
      row: Number(panel.style.getPropertyValue("--bfe-row")),
      col: Number(panel.style.getPropertyValue("--bfe-col")),
      top: parseFloat(panel.style.top),
      left: parseFloat(panel.style.left)
    }));

    // every panel carries both, and neither is left blank
    expect(placed.every((p) => Number.isFinite(p.row) && Number.isFinite(p.col))).toBe(true);
    // no panel waits longer than the cap — §4's long-list rule, applied to a board
    expect(Math.max(...placed.map((p) => p.row))).toBeLessThanOrEqual(BOARD_RANK_CAP);

    // panels sharing a row band share a row number, and their columns run left to right
    const byTop = new Map<number, typeof placed>();
    for (const panel of placed) byTop.set(panel.top, [...(byTop.get(panel.top) ?? []), panel]);
    for (const [, row] of byTop) {
      expect(new Set(row.map((p) => p.row)).size, "one band, one row number").toBe(1);
      const across = [...row].sort((a, b) => a.left - b.left);
      expect(across.map((p) => p.col)).toEqual([...Array(across.length).keys()]);
    }
    // and a band lower down the page never opens before one above it
    const bands = [...byTop.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i][1][0].row).toBeGreaterThanOrEqual(bands[i - 1][1][0].row);
    }
  });

  it("writes the greeting one character at a time, and still reads as one line", async () => {
    render(<App />);
    await enterDashboard();

    const greeting = document.querySelector<HTMLElement>(".hs-home-greeting");
    expect(greeting).not.toBeNull();
    // a screen reader gets the whole line once...
    const label = greeting!.querySelector<HTMLElement>("[aria-label]");
    expect(label?.getAttribute("aria-label")).toMatch(/^Good (morning|afternoon|evening), \w+$/);
    // ...and never the letters, which are hidden from it
    const chars = [...label!.children] as HTMLElement[];
    expect(chars.length).toBe(label!.getAttribute("aria-label")!.length);
    expect(chars.every((c) => c.getAttribute("aria-hidden") === "true")).toBe(true);
    // the text itself is unchanged — the page still says what it said
    expect(greeting!.textContent).toBe(label!.getAttribute("aria-label"));
  });

  it("assembles the chrome once a session, not on every page", async () => {
    // the gate is decided once per module load, so a case that wants the session's
    // FIRST open has to say so — an earlier case in this file has already spent it
    window.sessionStorage.clear();
    __resetOpeningGate();
    render(<App />);
    await enterDashboard();

    expect(document.querySelector(".app-shell.hs-shell")).not.toBeNull();
    // Only the durable fact. `bfm-open` and openingRunning() are both cleared by a
    // real 2.4s timer, and signing in through the form takes longer than that under
    // a loaded full-suite run — asserting either here fails on machine speed rather
    // than on behaviour. motion/AppFrame.test.tsx holds both to fake timers.
    //
    // The flag needs waiting for, though, and for the same reason the others were
    // dropped. AppFrame marks the session inside an effect that returns early when
    // `.app-shell.hs-shell` is not in the DOM yet, and its deps are `[reduce]`, so
    // it does not re-run when the shell arrives — it runs again when AppFrame next
    // renders. Under a loaded full-suite run that lands after this line, which is
    // how it failed twice in a row while passing 16/16 in isolation.
    await waitFor(() => expect(window.sessionStorage.getItem("bf:shell-opened"), "the session is spent").toBe("1"));

    // leaving the Dashboard and coming back does not spend a second opening
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(window.sessionStorage.getItem("bf:shell-opened")).toBe("1");
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
  });
});
