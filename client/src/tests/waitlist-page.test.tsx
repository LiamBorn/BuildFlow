/**
 * The waitlist PAGE's half of the same rule: confirm only what the server accepted.
 *
 * waitlist-honesty.test.tsx covers the landing pill. This is the #waitlist page, which failed
 * the same way but more elaborately. It wrote the address into localStorage BEFORE posting and
 * called that a graceful fallback, so an unreachable backend produced the full confirmation —
 * "You're on the list", the signer's address, and a position number — while nothing had reached
 * anyone. That copy lives in the signer's own browser. It is not a list you can email.
 *
 * It also only treated a 400 as a failure, so a 500 confirmed too, and it fired the
 * `waitlistSignup` analytics event on the way out — the primary pre-launch conversion metric,
 * counting signups that never happened.
 *
 * Deferred from 6b8676e: a test here has to render App, and App.tsx was carrying another
 * session's half-finished work at the time, so the suite could not tell my failures from theirs.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { installAppHarness, respondToBuildflowApi } from "../test/appHarness";

const CONFIRMED = /you.{0,3}re on the list/i;
const STORAGE_KEY = "buildflow.waitlist";

/** Answer every call the app makes as usual, except the waitlist POST. */
function waitlistAnswers(answer: (input: RequestInfo | URL) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/waitlist")) return answer(input);
      return respondToBuildflowApi(input);
    })
  );
}

async function openPageAndSubmit(address = "foreman@example.com") {
  window.history.pushState(null, "", "/#waitlist");
  render(<App />);
  const field = await screen.findByLabelText("Email address");
  fireEvent.change(field, { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));
}

describe("the waitlist page", () => {
  installAppHarness();

  describe("when the server takes the signup", () => {
    it("confirms, and places them using the count the server reported", async () => {
      waitlistAnswers(() => new Response(JSON.stringify({ count: 5 }), { status: 200 }));
      await openPageAndSubmit();

      expect(await screen.findByText(CONFIRMED)).toBeInTheDocument();
      // WAITLIST_BASE_COUNT (2137) plus the server's 5. The base is a hardcoded number the
      // product owner has chosen to keep for now; this pins the arithmetic, not the number.
      expect(screen.getByText(/2,142/)).toBeInTheDocument();
    });

    it("keeps a local copy so the count survives a reload", async () => {
      waitlistAnswers(() => new Response(JSON.stringify({ count: 5 }), { status: 200 }));
      await openPageAndSubmit("saved@example.com");

      await screen.findByText(CONFIRMED);
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toContain("saved@example.com");
    });
  });

  describe("when it does not", () => {
    it("says so instead of confirming, when the backend cannot be reached", async () => {
      waitlistAnswers(() => Promise.reject(new Error("network")));
      await openPageAndSubmit();

      expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the waitlist/i);
      expect(screen.queryByText(CONFIRMED), "an unsaved signup must not read as joined").not.toBeInTheDocument();
    });

    it("treats a 500 as a failure, not a signup", async () => {
      waitlistAnswers(() => new Response("boom", { status: 500 }));
      await openPageAndSubmit();

      expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't add you to the list/i);
      expect(screen.queryByText(CONFIRMED)).not.toBeInTheDocument();
    });

    /**
     * The specific shape of the old bug. The local write happened first and was treated as
     * success, which is why the page could show a position for a signup no one had received.
     */
    it("writes nothing locally, so a failed signup is not counted as one", async () => {
      waitlistAnswers(() => Promise.reject(new Error("network")));
      await openPageAndSubmit("lost@example.com");

      await screen.findByRole("alert");
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      expect(stored, "a signup the server never took must leave no trace claiming it did").not.toContain("lost@example.com");
    });

    it("still rejects a bad address as a bad address", async () => {
      waitlistAnswers(() => new Response("nope", { status: 400 }));
      await openPageAndSubmit();

      expect(await screen.findByRole("alert")).toHaveTextContent(/valid email address/i);
    });

    it("lets them try again — the message clears as they type", async () => {
      waitlistAnswers(() => Promise.reject(new Error("network")));
      await openPageAndSubmit();
      await screen.findByRole("alert");

      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "second@example.com" } });
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });
  });
});
