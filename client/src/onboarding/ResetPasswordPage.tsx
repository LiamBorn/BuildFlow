/**
 * Choosing a new password, from the link in the reset email (2026-09-22) — `#reset-password`,
 * on the same page as signing in and signing up.
 *
 * The card shows the Dashboard, because saving the password signs you straight in; the account
 * row stays generic, since the token is opaque here and the address it belongs to is the
 * server's to know, not this page's to guess.
 */
import { useState, type FormEvent } from "react";
import { passwordProblem, passwordStrength } from "@buildflow/shared";
import { ApiError } from "../api";
import { AuthShell, tokenFromHash } from "./AuthShell";
import { Beats } from "./Beats";
import { OnboardingPreview } from "./OnboardingPreview";
import { PasswordField } from "./PasswordField";

export function ResetPasswordPage({
  onBack,
  onReset
}: {
  onBack: () => void;
  onReset: (token: string, password: string) => Promise<void>;
}) {
  const [token, setToken] = useState(tokenFromHash);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const missingToken = !token;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onReset(token, password);
      // On success the parent opens the workspace and this unmounts.
    } catch (err) {
      /* A password the policy refuses hands back a FRESH token, because the one in the link was
         spent on the attempt. Without taking it, a second try fails on a stale token and the
         message would be about the link rather than the password. */
      if (err instanceof ApiError && err.code === "weak_password") {
        const fresh = (err as ApiError & { token?: string }).token;
        if (fresh) setToken(fresh);
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      id="reset-password"
      onBack={onBack}
      backLabel="Back to sign in"
      paneKey={missingToken ? "no-token" : "form"}
      preview={
        <OnboardingPreview
          step={1}
          firstName=""
          lastName=""
          businessName=""
          trade={null}
          revenueLabel={null}
          teamLabel={null}
          signingInAs=""
        />
      }
    >
      {missingToken ? (
        <Beats>
          <h1 className="onb-h1" id="onb-title">
            That link is incomplete.
          </h1>
          <p className="onb-sub">
            It arrived without its token, so there is nothing here to unlock. Open the link straight from the email, or ask for a new one.
          </p>
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={onBack}>
              Request a new link
            </button>
          </div>
        </Beats>
      ) : (
        <form className="onb-form" onSubmit={submit} noValidate>
          <Beats>
            <h1 className="onb-h1" id="onb-title">
              Choose a new password.
            </h1>
            <p className="onb-sub">You&apos;ll be signed in as soon as it&apos;s saved, and every other device is signed out.</p>
            <PasswordField
              id="reset-password-input"
              label="New password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (error) setError("");
              }}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
              error={error}
              hint="At least 8 characters. Avoid common words and your email."
              strength={passwordStrength(password)}
            />
            <div className="onb-actions">
              <button type="submit" className="onb-btn onb-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save password and sign in"}
              </button>
              <button type="button" className="onb-link" onClick={onBack} disabled={busy}>
                Back to sign in
              </button>
            </div>
          </Beats>
        </form>
      )}
    </AuthShell>
  );
}
