/**
 * The Dashboard's "+": Add a section.
 *
 * What the user asked for is the round trip — a section taken off the board can be brought
 * back from here — and that the picker lists every section honestly: the ones on the board say
 * so and offer nothing, because the board holds one of each.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

/** The "What's new" modal greets a login over the whole page; its focus trap swallows Escape,
    and its backdrop would keep a real person from reaching "+" until it is closed. */
const dismissWhatsNew = () => {
  const close = screen.queryByRole("button", { name: "Close what's new" });
  if (close) fireEvent.click(close);
};
const board = () => document.querySelector<HTMLElement>(".dash-board")!;

const openPicker = () => {
  fireEvent.click(screen.getByRole("button", { name: "Add a section" }));
  return screen.getByRole("dialog", { name: "Add a section" });
};
const cards = (picker: HTMLElement) => within(picker).getAllByRole("article");

describe("Add a section", () => {
  installAppHarness();
  beforeEach(() => {
    localStorage.removeItem(`bf:dash:layout:${bootstrapFixture.activeUser.id}`);
  });

  it("opens beside Customize and lists every section, all on the board to begin with", async () => {
    render(<App />);
    await enterDashboard();
    dismissWhatsNew();
    const picker = openPicker();

    expect(within(picker).getByText(/Every section is on the board/)).toBeInTheDocument();
    const all = cards(picker);
    expect(all.length).toBe(13);
    for (const card of all) expect(within(card).getByText("On the board")).toBeInTheDocument();
    expect(within(picker).queryAllByRole("button", { name: /^Add / })).toHaveLength(0);
    // a card explains itself: a group, a name, and what it shows
    const weather = all.find((card) => card.getAttribute("aria-label") === "Weather Impact")!;
    expect(within(weather).getByText("Readiness")).toBeInTheDocument();
    expect(within(weather).getByText(/Forecast alerts/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Add a section" })).toBeNull();
  });

  it("brings back a section that was hidden from Customize", async () => {
    render(<App />);
    await enterDashboard();
    dismissWhatsNew();

    // take Weather Impact off the board the way Customize does
    fireEvent.click(screen.getByRole("button", { name: /^Customize$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Weather Impact" }));
    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    expect(within(board()).queryByRole("heading", { name: "Weather Impact" })).toBeNull();

    const picker = openPicker();
    expect(within(picker).getByText(/1 section is off the board/)).toBeInTheDocument();
    // the one that can come back is listed first, and is the only one with a "+"
    expect(cards(picker)[0].getAttribute("aria-label")).toBe("Weather Impact");
    expect(within(picker).getAllByRole("button", { name: /^Add / })).toHaveLength(1);

    fireEvent.click(within(picker).getByRole("button", { name: "Add Weather Impact" }));

    // back on the board (the card's own title is a heading too, so the board is asked, not the
    // page), the card now says so, and the drawer stays open for more
    expect(within(board()).getByRole("heading", { name: "Weather Impact" })).toBeInTheDocument();
    expect(within(picker).getByText(/Every section is on the board/)).toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: "Add Weather Impact" })).toBeNull();
    const stored = JSON.parse(localStorage.getItem(`bf:dash:layout:${bootstrapFixture.activeUser.id}`) ?? "{}");
    expect(stored.hidden).toEqual([]);
  });
});
