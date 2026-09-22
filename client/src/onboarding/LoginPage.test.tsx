/**
 * Signing in, on the five-step flow's design (2026-09-22).
 *
 * What is recorded here is this program's decision rather than the browser's: that the page
 * wears the flow's clothes without its progress, that the card carries the address as it is
 * typed, what the form refuses to send, and the two places where saying LESS is the point —
 * a failed sign-in that does not say which half was wrong, and a reset that answers the same
 * whether or not the address has an account.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { LoginPage } from "./LoginPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchOauthStatus: vi.fn(async () => ({ providers: { google: false, microsoft: false } })),
    requestPasswordReset: vi.fn(async () => ({ ok: true as const }))
  };
});

const props = (over: Partial<Parameters<typeof LoginPage>[0]> = {}) => ({
  onBack: vi.fn(),
  onLoginSubmit: vi.fn(async () => undefined),
  onSwitchToSignup: vi.fn(),
  ...over
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const signIn = () => fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

beforeEach(() => {
  vi.mocked(api.fetchOauthStatus).mockResolvedValue({ providers: { google: false, microsoft: false } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("signing in", () => {
  it("is the flow's page without its progress, showing the Dashboard it lands on", () => {
    const { container } = render(<LoginPage {...props()} />);
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(container.querySelector(".onb-login")).not.toBeNull();
    // not a step of five: no counter, no bar
    expect(container.querySelector(".onb-progress")).toBeNull();
    expect(screen.queryByText(/Step \d of 5/)).not.toBeInTheDocument();
    // the same framed card as the flow, on the same page it signs into
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/dashboard.jpg");
    expect(container.querySelector(".onb-frame")?.getAttribute("data-variant")).toBe("rose");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("writes the address into the card as it is typed, and claims no more than that", () => {
    const { container } = render(<LoginPage {...props()} />);
    const account = () => container.querySelector(".onb-mock-user-text b")?.textContent;
    expect(account()).toBe("Your workspace");
    type("Email", "ops@reyespaving.com");
    expect(account()).toBe("ops@reyespaving.com");
    expect(container.querySelector(".onb-mock-avatar")?.textContent).toBe("O");
    /* "Signing in", not "Owner": the name and the role are not known until the session is,
       and a card that invented them would be guessing about the person reading it. */
    expect(container.querySelector(".onb-mock-user-text i")?.textContent).toBe("Signing in");
  });

  it("asks for both halves before it asks the server", () => {
    const p = props();
    render(<LoginPage {...p} />);
    signIn();
    expect(screen.getAllByRole("alert").map((n) => n.textContent)).toEqual(["Enter your email address.", "Enter your password."]);
    expect(p.onLoginSubmit).not.toHaveBeenCalled();

    type("Email", "not-an-address");
    type("Password", "hunter2hunter2");
    signIn();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(p.onLoginSubmit).not.toHaveBeenCalled();
  });

  it("sends the credentials with the 30-day choice, which is on unless it is turned off", async () => {
    const onLoginSubmit = vi.fn(async () => undefined);
    render(<LoginPage {...props({ onLoginSubmit })} />);
    type("Email", "  ops@reyespaving.com  ");
    type("Password", "Reyes-Paving-2026");
    signIn();
    await waitFor(() => expect(onLoginSubmit).toHaveBeenCalledTimes(1));
    expect(onLoginSubmit).toHaveBeenCalledWith({ email: "ops@reyespaving.com", password: "Reyes-Paving-2026", remember: true });
    /* The button stays "Signing in…" after a successful submit, on purpose: the parent is
       already opening the workspace and this page is on its way out. Only a FAILURE puts it
       back (the case above), so the unchecked box needs a page of its own here. */
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();

    cleanup();
    render(<LoginPage {...props({ onLoginSubmit })} />);
    type("Email", "ops@reyespaving.com");
    type("Password", "Reyes-Paving-2026");
    // unticked: a browser-session cookie instead, so closing the browser signs this account out
    fireEvent.click(screen.getByLabelText("Keep me signed in for 30 days"));
    signIn();
    await waitFor(() => expect(onLoginSubmit).toHaveBeenCalledTimes(2));
    expect(onLoginSubmit).toHaveBeenLastCalledWith({ email: "ops@reyespaving.com", password: "Reyes-Paving-2026", remember: false });
  });

  it("does not say which half of a refused sign-in was wrong", async () => {
    const onLoginSubmit = vi.fn(async () => {
      throw new api.ApiError("That email or password is wrong.", 401);
    });
    const { container } = render(<LoginPage {...props({ onLoginSubmit })} />);
    type("Email", "ops@reyespaving.com");
    type("Password", "wrong-password-here");
    signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("That email or password is wrong.");
    /* One message, under the form. Pinning it to a field would answer a question the server
       deliberately does not: whether that address has an account at all. */
    expect(container.querySelectorAll(".onb-input.is-invalid")).toHaveLength(0);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // and the form is usable again
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("asks for a reset on one field, and answers the same either way", async () => {
    render(<LoginPage {...props()} />);
    type("Email", "ops@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(await screen.findByRole("heading", { name: "Reset your password." })).toBeInTheDocument();
    // the address survives the swap, and the password is not asked for here
    expect(screen.getByLabelText("Email")).toHaveValue("ops@reyespaving.com");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith("ops@reyespaving.com"));
    /* "If there's a BuildFlow account for …" — the same sentence for an address that has one
       and an address that does not, because the difference is not this page's to tell. */
    expect(await screen.findByRole("status")).toHaveTextContent("If there's a BuildFlow account for ops@reyespaving.com");
    expect(screen.queryByRole("button", { name: "Send reset link" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
  });

  it("hands creating an account to the five-step flow", () => {
    const p = props();
    render(<LoginPage {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(p.onSwitchToSignup).toHaveBeenCalled();
    // and the brand mark is the way back to the landing page
    fireEvent.click(screen.getByRole("button", { name: "Back to BuildFlow" }));
    expect(p.onBack).toHaveBeenCalled();
  });

  it("offers a provider only when the server has credentials for it", async () => {
    vi.mocked(api.fetchOauthStatus).mockResolvedValue({ providers: { google: true, microsoft: false } });
    render(<LoginPage {...props()} />);
    expect(await screen.findByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Microsoft" })).not.toBeInTheDocument();
  });

  it("shows no provider buttons at all when none are configured", async () => {
    render(<LoginPage {...props()} />);
    await waitFor(() => expect(api.fetchOauthStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.queryByText("or continue with")).not.toBeInTheDocument();
  });
});
