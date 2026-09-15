/**
 * The top bar's Upgrade button.
 *
 * Asked for from the monday.com reference: a button in the chrome that shows the plan the
 * workspace is on and the plans better than it. So what is asserted is exactly those two
 * things, plus the case that makes the button honest — on the top plan there is nothing to
 * sell, and a button labelled "Upgrade" that leads nowhere is worse than no button.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

const openUpgrade = () => {
  fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
  return screen.getByRole("menu", { name: "Plans" });
};

describe("the Upgrade button", () => {
  installAppHarness();

  it("shows the plan the workspace is on, and only the better ones", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, selectedPlan: "pro", seats: 12 };
    render(<App />);
    await enterDashboard();

    const menu = openUpgrade();
    // requirement 1: the current plan, read off the org rather than this browser
    expect(within(menu).getByText("Your plan")).toBeInTheDocument();
    expect(within(menu).getByText("Pro")).toBeInTheDocument();
    expect(within(menu).getByText(/12 seats/)).toBeInTheDocument();

    // requirement 2: the plans above it, and nothing at or below it
    const rows = within(menu).getAllByRole("menuitem");
    const labels = rows.map((row) => row.textContent ?? "");
    expect(labels.some((label) => label.includes("Business"))).toBe(true);
    expect(labels.some((label) => label.includes("Enterprise"))).toBe(true);
    expect(labels.some((label) => label.includes("Free"))).toBe(false);
    // "Pro" appears once, as the current plan, and never as something to upgrade to
    expect(rows.filter((row) => /^Pro/.test(row.textContent ?? ""))).toHaveLength(0);
  });

  it("offers everything above Free on a free workspace", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, selectedPlan: "free" };
    render(<App />);
    await enterDashboard();

    const menu = openUpgrade();
    expect(within(menu).getByText("Free")).toBeInTheDocument();
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((row) => row.textContent ?? "");
    for (const name of ["Pro", "Business", "Enterprise"]) expect(labels.some((label) => label.includes(name))).toBe(true);
  });

  /** The whole reason the button is conditional: there is no upgrade from the top plan. */
  it("is absent on the top plan, rather than leading nowhere", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, selectedPlan: "enterprise" };
    render(<App />);
    await enterDashboard();

    expect(screen.queryByRole("button", { name: "Upgrade" })).not.toBeInTheDocument();
  });

  it("opens Billing, which is where a plan is actually changed", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, selectedPlan: "free" };
    render(<App />);
    await enterDashboard();

    const menu = openUpgrade();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Business/ }));

    expect(await screen.findByRole("heading", { name: "Billing" })).toBeInTheDocument();
    // and the menu is gone, not left hanging over the page it navigated to
    expect(screen.queryByRole("menu", { name: "Plans" })).not.toBeInTheDocument();
  });
});
