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
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { TimeCardPage } from "../TimeCard";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SAYS_SAMPLE = /built-in sample week/i;

/* Rendered directly rather than reached through the rail: Time Cards is a paid add-on and the
   harness's workspace has not bought it, so the rail's flyout offers the add-on instead of opening
   the page. The subject here is the page's own markup, which does not need the navigation. */
describe("the Time Cards page", () => {
  it("says the figures are a sample before showing any of them", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(SAYS_SAMPLE);
    expect(note, "the reader has to be told it is not their data, not merely that it is a demo").toHaveTextContent(
      /not from this workspace/i
    );
    /* And what IS real, so the notice does not read as "nothing here is trustworthy". The Reports
       page's labor hours come from the workspace's own jobs since ba36826. */
    expect(note).toHaveTextContent(/Reports/);
  });

  it("puts the notice above the figures, not below them", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    const note = screen.getByRole("note");
    const summary = screen.getByLabelText("TimeCard summary");
    // Node.DOCUMENT_POSITION_FOLLOWING: the summary comes after the note in document order.
    expect(note.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
