/**
 * The shell says the demo is read-only before anything is clicked.
 *
 * The server refuses a shared demo's writes (server/src/permissions.ts, 6cd72cf). Without this the
 * program still offered every control and only said no on the attempt — which is the shape of an app
 * that looks broken rather than one that is being clear.
 *
 * The flag is the SERVER'S, carried on the bootstrap payload, and these cases pin that: whether the
 * demo is locked depends on where the server runs, so a client that decided for itself would be
 * right on a laptop and wrong on a public address, or the reverse. The rule has one home.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";

const SAYS_SHARED = /everyone who opens buildflow without signing in/i;

/* The shell carries five role="status" regions, so the bar is addressed by its accessible name
   rather than by role alone — findByRole throws on more than one match, which is how the first
   version of this file failed while the bar was rendering perfectly well. */
const bar = () => screen.findByRole("status", { name: "Shared demo" });

describe("the shared-demo bar", () => {
  installAppHarness();

  it("is not shown to someone with a workspace of their own", async () => {
    render(<App />);
    await enterDashboard();
    await screen.findByLabelText("Search BuildFlow");
    expect(screen.queryByText(SAYS_SHARED), "a real workspace is not a shared demo").not.toBeInTheDocument();
  });

  it("appears when the server says the session is read-only", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, readOnly: true };
    render(<App />);
    await enterDashboard();

    const region = await bar();
    expect(region).toHaveTextContent(SAYS_SHARED);
    expect(region, "it has to say WHY, not just that it is read-only").toHaveTextContent(/would be everyone/i);
  });

  it("offers a way out, and ends the shared session on the way", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, readOnly: true };
    render(<App />);
    await enterDashboard();
    await bar();

    /* Logging out matters as much as the navigation: the visitor must not carry the shared demo's
       cookie into the workspace they are about to make. The harness answers every call, so the
       question is only whether this one was made. */
    const seen: string[] = [];
    const answer = window.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(`${init?.method ?? "GET"} ${String(input)}`);
        return answer(input as RequestInfo, init);
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /create a free workspace/i }));

    await waitFor(() => expect(seen).toContain("POST /api/auth/logout"));
    expect(window.location.hash).toBe("#create-account");
    vi.unstubAllGlobals();
  });

  it("stays out of the way of a page, rather than scrolling with it", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, readOnly: true };
    render(<App />);
    await enterDashboard();

    const region = await bar();
    const scroller = document.querySelector(".content-scroll");
    expect(scroller).not.toBeNull();
    // a sibling before the scroller, not a child of it
    expect(region.parentElement).toBe(scroller?.parentElement);
    expect(region.compareDocumentPosition(scroller!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
