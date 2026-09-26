/**
 * Time Cards says it is a preview, in both places it shows numbers.
 *
 * buildTimecardModel's parameter is named `_data` and is never read: the workers, entries,
 * timecards, approval chains, audit trail and lien records are all fixed sample values, identical
 * for an empty workspace and a real one. Nothing on the page or in the Dashboard's TimeCard cards
 * came from the workspace, and until 2026-09-24 nothing said so.
 *
 * It matters more than the usual placeholder because Time Cards is a paid add-on: someone can be
 * paying for a page of hours and burdened costs that are not theirs. So these cases pin the notice
 * in place. A test that only checked the figures would pass just as happily with the notice gone.
 *
 * Since 2026-09-25 the page opens on one section that is NOT a sample — Team's time, the week the
 * Members put in themselves — and there the notice says the opposite, while still saying the other
 * sections are the sample week. The rule is the same either way: the notice tells the truth about
 * the figures under it, and it comes before them.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { TimeCardPage } from "../TimeCard";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SAYS_SAMPLE = /built-in sample week/i;

/* Rendered directly rather than reached through the rail: Time Cards is a paid add-on and the
   harness's workspace has not bought it, so the rail's flyout offers the add-on instead of opening
   the page. The subject here is the page's own markup, which does not need the navigation. */
const section = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });

describe("the Time Cards page", () => {
  beforeEach(() => {
    // the team's own week, which the page opens on, is empty here
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entries: [], people: [] }), { status: 200 }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says the figures are a sample before showing any of them", () => {
    render(<TimeCardPage data={bootstrapFixture} />);
    fireEvent.click(section("Time Entry"));

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(SAYS_SAMPLE);
    expect(note, "the reader has to be told it is not their data, not merely that it is a demo").toHaveTextContent(
      /not from this workspace/i
    );
    /* And what IS real, so the notice does not read as "nothing here is trustworthy". The Reports
       page's labor hours come from the workspace's own jobs since ba36826. */
    expect(note).toHaveTextContent(/Reports/);
    // ...and where the Members' own time is
    expect(note).toHaveTextContent(/Team's time/);
  });

  it("says Team's time is the workspace's own, and that the other sections are still the sample", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/none of it is sample/);
    expect(note).toHaveTextContent(SAYS_SAMPLE);
  });

  it("puts the notice above the figures, not below them, in every section", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    for (const [name, figures] of [
      ["Team's time", "Your team's week"],
      ["Time Entry", "TimeCard summary"]
    ]) {
      fireEvent.click(section(name));
      const note = screen.getByRole("note");
      const summary = screen.getByLabelText(figures);
      // Node.DOCUMENT_POSITION_FOLLOWING: the summary comes after the note in document order.
      expect(note.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING, name).toBeTruthy();
    }
  });
});

describe("the Dashboard's TimeCard cards", () => {
  installAppHarness();

  it("carry the same warning, since they read the same sample week", async () => {
    render(<App />);
    await enterDashboard();

    /* The cards arrive through a Suspense boundary — TimeCard.tsx is loaded on demand so the
       marketing pages stop shipping it — so this has to be awaited rather than queried. */
    const overview = await screen.findByLabelText("TimeCard overview", {}, { timeout: 8000 });
    expect(overview).toHaveTextContent(/Preview/);
  });
});
