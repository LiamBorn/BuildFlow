/**
 * The Dashboard's entrance — the reference's cascade on the click that opens the page.
 * The sheet staggers every panel by `--bfe-i`, its place in the reading order, which the
 * board writes as an inline variable; and clicking Home in the rail while the Dashboard is
 * already showing remounts it, so the entrance plays again.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";

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
      expect(after.top > before.top || (after.top === before.top && after.left >= before.left), `rank ${after.rank} after ${before.rank}`).toBe(true);
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

  it("plays again on the Contacts page when Sales is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: /^Sales/ }));
    await screen.findByRole("heading", { name: /^Contacts/ });
    const before = document.querySelector(".contacts-page");
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Sales/ }));

    const after = document.querySelector(".contacts-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Companies page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const sales = screen.getByRole("button", { name: /^Sales/ });
    fireEvent.mouseEnter(sales.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Companies/ }));
    await screen.findByRole("heading", { name: /^Companies/ });
    const before = document.querySelector(".companies-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(sales.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Companies/ }));

    const after = document.querySelector(".companies-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Deals page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const sales = screen.getByRole("button", { name: /^Sales/ });
    fireEvent.mouseEnter(sales.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Deals/ }));
    await screen.findByRole("heading", { name: /^Deals/ });
    const before = document.querySelector(".deals-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(sales.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Deals/ }));

    const after = document.querySelector(".deals-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on the Equipment page when its flyout entry is clicked while it is already showing", async () => {
    // Equipment is an add-on page: without the product the rail opens the "Get Equipment Tracking" prompt
    state.bootstrapPayload = { ...bootstrapFixture, selectedProducts: ["equipment-tracking"] };
    render(<App />);
    await enterDashboard();
    const resources = screen.getByRole("button", { name: /^Resources/ });
    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Equipment/ }));
    await screen.findByRole("heading", { name: /^Equipment/ });
    const before = document.querySelector(".equipment-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Equipment/ }));

    const after = document.querySelector(".equipment-page");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("plays again on Map & Field Ops when its flyout entry is clicked while it is already showing", async () => {
    // an add-on page too: without the product the rail opens the "Get Map & Field Ops" prompt
    state.bootstrapPayload = { ...bootstrapFixture, selectedProducts: ["map-field-ops"] };
    render(<App />);
    await enterDashboard();
    const field = screen.getByRole("button", { name: /^Field( \(.*\))?$/ });
    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Map & Field Ops/ }));
    await screen.findByRole("heading", { name: /^Job sites/ });
    const before = document.querySelector(".map-ops-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(field.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Map & Field Ops/ }));

    const after = document.querySelector(".map-ops-page");
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

  it("plays again on the Materials page when its flyout entry is clicked while it is already showing", async () => {
    render(<App />);
    await enterDashboard();
    const resources = screen.getByRole("button", { name: /^Resources/ });
    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Materials/ }));
    await screen.findByRole("heading", { name: /^Materials/ });
    const before = document.querySelector(".materials-page");
    expect(before).not.toBeNull();

    fireEvent.mouseEnter(resources.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Materials/ }));

    const after = document.querySelector(".materials-page");
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
