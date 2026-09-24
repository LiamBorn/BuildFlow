/**
 * The three pages an emailed link lands on (2026-09-22): choosing a new password, confirming an
 * address, accepting an invite. All three moved onto the signup and sign-in design.
 *
 * Each one spends a TOKEN from the hash on arrival, so what is recorded here is mostly what the
 * page does with an answer it did not choose — a link that arrived without its token, a token
 * the server refuses, a password the policy refuses and the fresh token that comes back with
 * that refusal — plus the one place the card stops being decoration and names a real workspace.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ApiError } from "../api";
import { AcceptInvitePage } from "./AcceptInvitePage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, verifyEmail: vi.fn(async () => ({ ok: true })), fetchInvitePreview: vi.fn() };
});

/** These pages read their token out of the hash, the way the emailed link delivers it. */
const linkWith = (hash: string) => window.history.replaceState(null, "", hash);
const INVITE = {
  email: "sam.ortiz@reyespaving.com",
  permission: "member" as const,
  orgName: "Reyes Paving",
  inviterName: "Jordan Reyes",
  expiresAt: "2026-09-29T12:00:00.000Z"
};

beforeEach(() => linkWith("#reset-password?token=tok-123"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("choosing a new password from the emailed link", () => {
  it("is on the family's page, over the Dashboard it signs into", () => {
    const { container } = render(<ResetPasswordPage onBack={vi.fn()} onReset={vi.fn(async () => undefined)} />);
    expect(screen.getByRole("heading", { name: "Choose a new password." })).toBeInTheDocument();
    expect(container.querySelector(".onb-solo")).not.toBeNull();
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/dashboard.jpg");
    // the token is opaque here, so the card claims nothing about whose workspace this is
    expect(container.querySelector(".onb-mock-user-text b")?.textContent).toBe("Your workspace");
  });

  it("refuses a weak password itself, and shows how strong the one typed is", () => {
    const onReset = vi.fn(async () => undefined);
    const { container } = render(<ResetPasswordPage onBack={vi.fn()} onReset={onReset} />);
    // the meter is only drawn once there is something to measure
    expect(container.querySelector(".onb-strength")).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    expect(container.querySelector(".onb-strength")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save password and sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
    expect(onReset, "the server is not asked what the shared policy already answered").not.toHaveBeenCalled();
  });

  it("sends the token from the link, and takes the fresh one a refusal hands back", async () => {
    const onReset = vi
      .fn<(token: string, password: string) => Promise<void>>()
      .mockRejectedValueOnce(
        Object.assign(new ApiError("That password is too common. Pick something harder to guess.", 400, "password", "weak_password"), {
          token: "tok-fresh"
        })
      )
      .mockResolvedValueOnce(undefined);
    render(<ResetPasswordPage onBack={vi.fn()} onReset={onReset} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Reyes-Paving-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password and sign in" }));
    await waitFor(() => expect(onReset).toHaveBeenCalledWith("tok-123", "Reyes-Paving-2026"));
    expect(await screen.findByRole("alert")).toHaveTextContent("too common");

    /* The refused attempt SPENT the link's token; the server returns a new one with the refusal.
       Without taking it, the second try would fail on a stale token and complain about the link
       instead of the password. */
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Harborview-Deck-Pour" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password and sign in" }));
    await waitFor(() => expect(onReset).toHaveBeenLastCalledWith("tok-fresh", "Harborview-Deck-Pour"));
  });

  it("says so plainly when the link arrived without its token", () => {
    linkWith("#reset-password");
    const onBack = vi.fn();
    render(<ResetPasswordPage onBack={onBack} onReset={vi.fn(async () => undefined)} />);
    expect(screen.getByRole("heading", { name: "That link is incomplete." })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("confirming an address from the emailed link", () => {
  it("spends the token on arrival and turns into the answer", async () => {
    linkWith("#verify-email?token=verify-1");
    const onContinue = vi.fn(async () => true);
    render(<VerifyEmailPage onContinue={onContinue} onLogin={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Confirming your email…" })).toBeInTheDocument();
    await waitFor(() => expect(api.verifyEmail).toHaveBeenCalledWith("verify-1"));
    expect(await screen.findByRole("heading", { name: "Email confirmed." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it("offers the way in by hand when confirming happened on another device", async () => {
    linkWith("#verify-email?token=verify-1");
    // no session in THIS browser — the ordinary case, since the link is opened wherever mail is read
    const onLogin = vi.fn();
    render(<VerifyEmailPage onContinue={vi.fn(async () => false)} onLogin={onLogin} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue to BuildFlow" }));
    await waitFor(() => expect(onLogin).toHaveBeenCalled());
  });

  it("carries the server's reason for a token it would not take", async () => {
    linkWith("#verify-email?token=stale");
    vi.mocked(api.verifyEmail).mockRejectedValueOnce(new ApiError("This confirmation link has expired.", 400));
    render(<VerifyEmailPage onContinue={vi.fn(async () => false)} onLogin={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "That link didn't work." })).toBeInTheDocument();
    expect(screen.getByText("This confirmation link has expired.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not call the server at all for a link with no token", () => {
    linkWith("#verify-email");
    render(<VerifyEmailPage onContinue={vi.fn(async () => false)} onLogin={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "That link didn't work." })).toBeInTheDocument();
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });
});

describe("accepting an invite", () => {
  const ready = () => vi.mocked(api.fetchInvitePreview).mockResolvedValue(INVITE);

  it("names the workspace being joined, in the heading and on the card", async () => {
    linkWith("#accept-invite?token=inv-1");
    ready();
    const { container } = render(<AcceptInvitePage onAccept={vi.fn(async () => undefined)} onLogin={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Checking your invite…" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Join Reyes Paving." })).toBeInTheDocument();
    expect(screen.getByText(/Jordan Reyes invited you as a Member/)).toBeInTheDocument();
    /* The one page whose card is about a place that already exists, so it shows that place:
       the workspace's name over its Projects page. */
    expect(container.querySelector(".onb-mock-name")?.textContent).toBe("Reyes Paving");
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/projects.jpg");
    expect(screen.getByRole("button", { name: "Join Reyes Paving" })).toBeInTheDocument();
  });

  it("shows the invited address and will not let it be changed", async () => {
    linkWith("#accept-invite?token=inv-1");
    ready();
    render(<AcceptInvitePage onAccept={vi.fn(async () => undefined)} onLogin={vi.fn()} />);
    const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
    expect(email).toHaveValue(INVITE.email);
    // the invite was issued to this address; the token cannot grant another
    expect(email).toHaveAttribute("readonly");
  });

  it("needs a name, a password the policy accepts, and the terms", async () => {
    linkWith("#accept-invite?token=inv-1");
    ready();
    const onAccept = vi.fn(async () => undefined);
    render(<AcceptInvitePage onAccept={onAccept} onLogin={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Join Reyes Paving" }));
    expect(screen.getAllByRole("alert").map((n) => n.textContent)).toEqual([
      "Enter your name.",
      "Password must be at least 8 characters.",
      "Please agree to the Terms & Conditions and Privacy Policy."
    ]);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sam Ortiz" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Harborview-Deck-Pour" } });
    fireEvent.click(screen.getByLabelText("I agree to the"));
    fireEvent.click(screen.getByRole("button", { name: "Join Reyes Paving" }));
    await waitFor(() =>
      expect(onAccept).toHaveBeenCalledWith({
        token: "inv-1",
        name: "Sam Ortiz",
        password: "Harborview-Deck-Pour",
        acceptTerms: true,
        remember: true
      })
    );
  });

  it("turns into the server's reason when the invite is spent or gone", async () => {
    linkWith("#accept-invite?token=used");
    vi.mocked(api.fetchInvitePreview).mockRejectedValueOnce(new ApiError("This invite has already been accepted.", 410));
    const onLogin = vi.fn();
    const { container } = render(<AcceptInvitePage onAccept={vi.fn(async () => undefined)} onLogin={onLogin} />);
    expect(await screen.findByRole("heading", { name: "This invite didn't work." })).toBeInTheDocument();
    /* and the card stops naming a workspace: there may be none, so a "Your business" placeholder
       would be claiming something about a place that does not exist */
    expect(container.querySelector(".onb-mock-head")).toBeNull();
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/dashboard.jpg");
    expect(screen.getByText("This invite has already been accepted.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
    expect(onLogin).toHaveBeenCalled();
  });

  it("does not ask the server about a link with no token", () => {
    linkWith("#accept-invite");
    render(<AcceptInvitePage onAccept={vi.fn(async () => undefined)} onLogin={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "This invite didn't work." })).toBeInTheDocument();
    expect(screen.getByText("This invite link is missing its token.")).toBeInTheDocument();
    expect(api.fetchInvitePreview).not.toHaveBeenCalled();
  });
});
