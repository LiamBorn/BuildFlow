/**
 * The rail's arrows: Hide takes the icon rail away and leaves a Show tab at the screen's
 * edge; Show brings it back; the choice is kept on the device so a reload honours it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

describe("hiding the rail", () => {
  installAppHarness();
  afterEach(() => {
    localStorage.removeItem("app:rail-hidden");
  });

  it("hides the rail from its arrow, brings it back from the edge tab, and remembers the choice", async () => {
    render(<App />);
    await enterDashboard();
    expect(screen.getByRole("navigation", { name: "Hubs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the sidebar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide the sidebar" }));
    expect(screen.getByRole("complementary", { name: "Primary navigation" })).toHaveClass("is-hidden");
    expect(localStorage.getItem("app:rail-hidden")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Show the sidebar" }));
    expect(screen.getByRole("complementary", { name: "Primary navigation" })).not.toHaveClass("is-hidden");
    expect(screen.queryByRole("button", { name: "Show the sidebar" })).toBeNull();
    expect(localStorage.getItem("app:rail-hidden")).toBeNull();
  });
});
