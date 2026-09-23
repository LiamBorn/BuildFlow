/**
 * A waitlist signup that did not reach the server must not say it did.
 *
 * This is the landing page's email pill — the one conversion the product has before launch. It
 * used to confirm unconditionally:
 *
 *     } catch {
 *       // Backend unreachable — still confirm; the waitlist page does the same.
 *     }
 *     setState("joined");
 *
 * and inside the `try` only a 400 counted as a failure, so a 500, a 502 or a proxy timeout fell
 * through to "You're on the list" as well. Someone signing up during an outage was told they had
 * joined, was never added, and never heard about the launch. Nobody could see it had happened:
 * not them, and not us — there is no record anywhere of a signup that failed this way.
 *
 * The error state carried no message either. It set `aria-invalid` and turned the input text red,
 * which says "your address is wrong" to someone whose address was fine.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FrostLanding from "../components/FrostLanding";

const JOINED = /you.{0,3}re on the list/i;

function mount() {
  return render(<FrostLanding logo={<span>BuildFlow</span>} onLogin={vi.fn()} onJoinWaitlist={vi.fn()} />);
}

async function submit(address: string) {
  fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: /^Join the Waitlist$/ }));
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("when the signup reaches the list", () => {
  it("confirms, and posts the address", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify({ count: 3 }), { status: 200 }));
    mount();
    await submit("foreman@example.com");

    expect(await screen.findByRole("status")).toHaveTextContent(JOINED);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/waitlist");
    expect(JSON.parse(String(init.body))).toEqual({ email: "foreman@example.com" });
  });
});

describe("when it does not", () => {
  /** The exact shape that shipped: the request throws, and the pill confirmed anyway. */
  it("says so when the backend cannot be reached, instead of confirming", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network"));
    mount();
    await submit("foreman@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the waitlist/i);
    expect(screen.queryByText(JOINED), "an unsaved signup must not read as joined").not.toBeInTheDocument();
  });

  /** The half of it that was easier to miss: only a 400 used to count as a failure. */
  it("treats a 500 as a failure, not a signup", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("boom", { status: 500 }));
    mount();
    await submit("foreman@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't add you just now/i);
    expect(screen.queryByText(JOINED)).not.toBeInTheDocument();
  });

  it("still distinguishes a rejected address from a failure to save one", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("nope", { status: 400 }));
    mount();
    await submit("foreman@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(/rejected/i);
  });

  it("catches a malformed address before asking the server at all", async () => {
    mount();
    const field = await screen.findByLabelText("Email address");
    fireEvent.change(field, { target: { value: "not-an-address" } });
    // Submitted on the form rather than by clicking: the input is type="email", so
    // constraint validation blocks the click and the handler's own guard -- the one
    // that matters when validation is bypassed or unsupported -- never runs.
    fireEvent.submit(field.closest("form") as HTMLFormElement);

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like an email/i);
    expect(globalThis.fetch, "no request for an address that cannot be one").not.toHaveBeenCalled();
  });

  it("clears the message when they start correcting it", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network"));
    mount();
    await submit("foreman@example.com");
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "foreman@example.co" } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
