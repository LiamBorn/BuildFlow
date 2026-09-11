/* Landing-page category menus (Product / Plans / Resources / Company / AI).
   Since 2026-09-08 each desktop menu is a compact list of interactive hover
   links: an `<a role="menuitem" href="#…">` whose accessible name is the item
   heading followed by its one-line blurb ("Free" + "Try BuildFlow with one
   crew"). Items are therefore matched on the *start* of their name. Replaces
   the menu tests quarantined in App.test.tsx on 2026-09-09. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { installAppHarness } from "../test/appHarness";

/** True when a menuitem's accessible name starts with `heading`. The row's letters
    each sit in their own span for the fan-out animation, so jsdom computes the
    name letter-spaced ("F r e e Try BuildFlow with one crew"); compare with all
    whitespace removed. Menus are exclusive, so a prefix is unambiguous. */
const namedAfter = (heading: string) => (name: string) => name.replace(/\s+/g, "").startsWith(heading.replace(/\s+/g, ""));

/** A menu row, matched on its heading (its accessible name continues with the blurb). */
const menuItem = (menu: HTMLElement, heading: string) => within(menu).getByRole("menuitem", { name: namedAfter(heading) });

const openMenu = async (label: "Product" | "Plans" | "Resources" | "Company" | "AI") => {
  fireEvent.click(await screen.findByRole("button", { name: label }));
  return screen.getByRole("menu", { name: `${label} menu` });
};

describe("landing category menus", () => {
  installAppHarness();

  it("opens one category menu at a time from the nav triggers", async () => {
    render(<App />);

    const product = await openMenu("Product");
    expect(screen.getByRole("button", { name: "Product" })).toHaveAttribute("aria-expanded", "true");
    expect(menuItem(product, "Crew Scheduling")).toHaveAttribute("href", "#crew-scheduling");
    expect(menuItem(product, "Map & Field Ops")).toHaveAttribute("href", "#map-field-ops");
    expect(menuItem(product, "Production Reports")).toHaveAttribute("href", "#production-reports");

    // The plans live in their own menu, which replaces the Product one.
    const plans = await openMenu("Plans");
    expect(screen.queryByRole("menu", { name: "Product menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Product" })).toHaveAttribute("aria-expanded", "false");
    expect(within(plans).getAllByRole("menuitem")).toHaveLength(4);
    expect(menuItem(plans, "Free")).toHaveAttribute("href", "#free-plan");
    expect(menuItem(plans, "Pro")).toHaveAttribute("href", "#pro-plan");
    expect(menuItem(plans, "Business")).toHaveAttribute("href", "#business-plan");
    expect(menuItem(plans, "Enterprise")).toHaveAttribute("href", "#enterprise-plan");

    const company = await openMenu("Company");
    expect(menuItem(company, "About BuildFlow")).toHaveAttribute("href", "#about");
    expect(menuItem(company, "Contact Sales")).toHaveAttribute("href", "#contact-sales");

    const resources = await openMenu("Resources");
    expect(within(resources).queryByRole("menuitem", { name: /Schedule Templates/ })).not.toBeInTheDocument();
    expect(menuItem(resources, "Updates")).toBeInTheDocument();
    expect(menuItem(resources, "Customer Reviews")).toBeInTheDocument();
    expect(menuItem(resources, "Help Center")).toBeInTheDocument();
  });

  it("lists the assistant and the automations in the AI menu", async () => {
    render(<App />);

    const ai = await openMenu("AI");

    const assistant = menuItem(ai, "BuildFlow AI");
    expect(assistant).toHaveAttribute("href", "#buildflow-ai");
    expect(within(assistant).getByText("AI tools for work")).toBeInTheDocument();
    // The per-product assistants are not separate menu rows.
    expect(within(ai).queryByRole("menuitem", { name: namedAfter("Schedule AI") })).not.toBeInTheDocument();
    expect(within(ai).queryByRole("menuitem", { name: namedAfter("Readiness AI") })).not.toBeInTheDocument();
    expect(within(ai).queryByRole("menuitem", { name: namedAfter("Field AI") })).not.toBeInTheDocument();
    expect(menuItem(ai, "Weather Integration")).toBeInTheDocument();
    expect(menuItem(ai, "Schedule Suggestions")).toBeInTheDocument();
    expect(menuItem(ai, "Route Optimization")).toBeInTheDocument();
  });

  it("opens a category menu on hover and closes it with Escape", async () => {
    render(<App />);

    const trigger = await screen.findByRole("button", { name: "Resources" });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("menu", { name: "Resources menu" })).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Resources menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the Free plan page from the plans menu", async () => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("Plans"), "Free"));

    expect(await screen.findByRole("heading", { name: "Try BuildFlow for free." })).toBeInTheDocument();
    expect(
      screen.getByText("Experience BuildFlow without a subscription — a 14-day demo of crews, jobs, materials, and exports.")
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#free-plan");
  });

  it.each([
    ["Pro", "#pro-plan", "Run BuildFlow Pro."],
    ["Business", "#business-plan", "Scale with BuildFlow Business."],
    ["Enterprise", "#enterprise-plan", "Customize BuildFlow Enterprise."]
  ])("opens the %s plan page from the plans menu", async (planName, hash, heading) => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("Plans"), planName));

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(window.location.hash).toBe(hash);
  });

  it("opens the Schedule AI page from the BuildFlow AI menu item", async () => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("AI"), "BuildFlow AI"));

    // Schedule AI is the Crew Scheduling page shape with Schedule AI's copy.
    expect(await screen.findByRole("heading", { name: "See all features" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A first draft of the week, in seconds." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The forecast is part of the plan." })).toBeInTheDocument();
    expect(window.location.hash).toBe("#buildflow-ai");
  });

  it("opens the updates page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("Resources"), "Updates"));

    expect(await screen.findByRole("heading", { name: "What is new in production scheduling." })).toBeInTheDocument();
    // The Ascent timeline shows one release at a time, oldest first.
    expect(screen.getByRole("heading", { level: 2, name: "BuildFlow launches for early construction teams" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#updates");
  });

  it("opens the customer reviews page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("Resources"), "Customer Reviews"));

    expect(await screen.findByRole("heading", { name: "Production plans that stay ready." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams that build on BuildFlow." })).toBeInTheDocument();
    expect(window.location.hash).toBe("#customer-reviews");
  });

  it("opens the help center page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(menuItem(await openMenu("Resources"), "Help Center"));

    expect(await screen.findByRole("heading", { name: "Hi, how can we help you?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Popular topics" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#help-center");
  });
});
