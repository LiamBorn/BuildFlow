/**
 * Confirming an address, from the link in the confirmation email (2026-09-22) —
 * `#verify-email`, on the same page as the rest of the way in.
 *
 * Three screens, not three paragraphs: the token is spent on arrival, and what comes back
 * replaces the screen rather than editing it. `usePaneSwap` carries "Confirming…" out on the
 * same fade the signup's steps use, so the answer arrives the way a next step does.
 *
 * The card shows the Dashboard, which is where "Continue" goes.
 */
import { useEffect, useState } from "react";
import { verifyEmail } from "../api";
import { AuthShell, tokenFromHash } from "./AuthShell";
import { Beats } from "./Beats";
import { OnboardingPreview } from "./OnboardingPreview";
import { usePaneSwap } from "./usePaneSwap";

type State = "checking" | "verified" | "failed";

export function VerifyEmailPage({ onContinue, onLogin }: { onContinue: () => Promise<boolean>; onLogin: () => void }) {
  const { current: state, leaving, go } = usePaneSwap<State>(tokenFromHash() ? "checking" : "failed");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = tokenFromHash();
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) go("verified");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "This confirmation link is invalid or has expired.");
        go("failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once: the token is spent on arrival
  }, []);

  /* Confirmed, and a session already exists: straight into the workspace. Without one — the link
     was opened on a different device, which is the ordinary case — the way on is signing in. */
  const proceed = async () => {
    setBusy(true);
    const entered = await onContinue().catch(() => false);
    if (!entered) {
      setBusy(false);
      onLogin();
    }
  };

  return (
    <AuthShell
      id="verify-email"
      onBack={onLogin}
      backLabel="Back to sign in"
      paneKey={state}
      leaving={leaving}
      preview={<OnboardingPreview step={1} firstName="" lastName="" businessName="" trade={null} revenueLabel={null} teamLabel={null} signingInAs="" />}
    >
      <Beats>
        <h1 className="onb-h1" id="onb-title">
          {state === "checking" ? "Confirming your email…" : state === "verified" ? "Email confirmed." : "That link didn't work."}
        </h1>
        <p className="onb-sub">
          {state === "checking"
            ? "One moment."
            : state === "verified"
              ? "Inviting your team and managing billing are unlocked for this workspace."
              : message || "Open the newest confirmation email, or ask for another one from your workspace."}
        </p>
        {state !== "checking" && (
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={proceed} disabled={busy}>
              {busy ? "Opening…" : state === "verified" ? "Continue to BuildFlow" : "Sign in"}
            </button>
          </div>
        )}
      </Beats>
    </AuthShell>
  );
}
