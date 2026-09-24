/**
 * Joining a workspace someone invited you to (2026-09-22) — `#accept-invite`, on the same page
 * as the rest of the way in.
 *
 * THIS IS THE ONE THAT MOST WANTS THE CARD. Everywhere else the card shows what you are about to
 * build; here it shows what already exists — the workspace's own name over its Projects page,
 * from the invite preview the server returns. That is real data about a real place, which is
 * what makes "Join Reyes Paving" mean something rather than read as a form.
 *
 * The address is shown and NOT editable: the invite was issued to it, so changing it here would
 * be asking for something the token cannot grant. It is confirmed by the invite itself, which is
 * why this is the one account created without a confirmation email.
 */
import { useEffect, useState, type FormEvent } from "react";
import { passwordProblem, passwordStrength, permissionLevelLabels, type InvitePreview } from "@buildflow/shared";
import { ApiError, fetchInvitePreview } from "../api";
import { AuthShell, tokenFromHash } from "./AuthShell";
import { Beats } from "./Beats";
import { OnboardingPreview } from "./OnboardingPreview";
import { PasswordField } from "./PasswordField";
import { usePaneSwap } from "./usePaneSwap";

type Stage = "checking" | "ready" | "failed";

export function AcceptInvitePage({
  onAccept,
  onLogin
}: {
  onAccept: (input: { token: string; name: string; password: string; acceptTerms: true; remember?: boolean }) => Promise<void>;
  onLogin: () => void;
}) {
  const [token] = useState(tokenFromHash);
  const { current: stage, leaving, go } = usePaneSwap<Stage>(token ? "checking" : "failed");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState(token ? "" : "This invite link is missing its token.");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "password" | "terms" | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchInvitePreview(token)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        go("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : "This invite is invalid or has expired.");
        go("failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once: the token does not change
  }, [token]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter your name.";
    const weak = passwordProblem(password, preview?.email ?? "");
    if (weak) next.password = weak;
    if (!acceptTerms) next.terms = "Please agree to the Terms & Conditions and Privacy Policy.";
    setErrors(next);
    if (next.name || next.password || next.terms) return;
    setBusy(true);
    try {
      await onAccept({ token, name: name.trim(), password, acceptTerms: true, remember: true });
      // On success the parent opens the workspace and this unmounts.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (err instanceof ApiError && err.field === "password") setErrors({ password: message });
      else setErrors({ form: message });
      setBusy(false);
    }
  };

  const org = preview?.orgName ?? "";
  return (
    <AuthShell
      id="accept-invite"
      onBack={onLogin}
      backLabel="Back to sign in"
      paneKey={stage}
      leaving={leaving}
      preview={
        /* Once the invite resolves: the workspace being joined, NAMED, over its Projects page —
           the same header the signup's business step wears, filled in from the invite rather than
           from typing. Until then (and if the invite turns out to be dead) there is no workspace
           to name, so the card falls back to the generic first screen rather than showing a
           "Your business" placeholder for a place that may not exist. */
        <OnboardingPreview
          step={preview ? 2 : 1}
          firstName=""
          lastName=""
          businessName={org}
          trade={null}
          revenueLabel={null}
          teamLabel={null}
          signingInAs={preview ? undefined : ""}
        />
      }
    >
      {stage === "checking" ? (
        <Beats>
          <h1 className="onb-h1" id="onb-title">
            Checking your invite…
          </h1>
          <p className="onb-sub">One moment.</p>
        </Beats>
      ) : stage === "failed" ? (
        <Beats>
          <h1 className="onb-h1" id="onb-title">
            This invite didn&apos;t work.
          </h1>
          <p className="onb-sub">{previewError}</p>
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={onLogin}>
              Sign in instead
            </button>
          </div>
        </Beats>
      ) : (
        <form className="onb-form" onSubmit={submit} noValidate>
          <Beats>
            <h1 className="onb-h1" id="onb-title">
              Join {org}.
            </h1>
            <p className="onb-sub">
              {preview?.inviterName} invited you as {preview && preview.permission === "admin" ? "an" : "a"}{" "}
              {preview ? permissionLevelLabels[preview.permission] : ""}. Set a password and you&apos;re in.
            </p>
            <div className="onb-field">
              <label htmlFor="invite-name">Your name</label>
              <input
                id="invite-name"
                className={`onb-input${errors.name ? " is-invalid" : ""}`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined, form: undefined }));
                }}
                autoComplete="name"
                placeholder="Sam Ortiz"
                aria-invalid={errors.name ? true : undefined}
                autoFocus
              />
              {errors.name && (
                <p className="onb-error" role="alert">
                  {errors.name}
                </p>
              )}
            </div>
            <div className="onb-field">
              <label htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                className="onb-input is-readonly"
                type="email"
                value={preview?.email ?? ""}
                readOnly
                aria-readonly="true"
              />
              <p className="onb-hint">This is the address the invite was sent to, so it&apos;s already confirmed.</p>
            </div>
            <PasswordField
              id="invite-password"
              label="Password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setErrors((current) => ({ ...current, password: undefined, form: undefined }));
              }}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              error={errors.password}
              hint="At least 8 characters. Avoid common words and your email."
              strength={passwordStrength(password, preview?.email ?? "")}
            />
            <div className={`onb-check${errors.terms ? " is-invalid" : ""}`}>
              <input
                id="invite-terms"
                type="checkbox"
                checked={acceptTerms}
                onChange={(event) => {
                  setAcceptTerms(event.target.checked);
                  setErrors((current) => ({ ...current, terms: undefined }));
                }}
                aria-invalid={errors.terms ? true : undefined}
              />
              {/* the links sit outside the <label> so opening the Terms doesn't also tick the box */}
              <span>
                <label htmlFor="invite-terms">I agree to the</label> <a href="#terms">Terms &amp; Conditions</a> and{" "}
                <a href="#privacy">Privacy Policy</a>.
                {errors.terms && (
                  <span className="onb-error" role="alert">
                    {errors.terms}
                  </span>
                )}
              </span>
            </div>
            <div className="onb-form-note">
              {errors.form && (
                <p className="onb-error" role="alert">
                  {errors.form}
                </p>
              )}
            </div>
            <div className="onb-actions">
              <button type="submit" className="onb-btn onb-btn-primary" disabled={busy}>
                {busy ? "Joining…" : `Join ${org}`}
              </button>
              <button type="button" className="onb-link" onClick={onLogin} disabled={busy}>
                Sign in instead
              </button>
            </div>
          </Beats>
        </form>
      )}
    </AuthShell>
  );
}
