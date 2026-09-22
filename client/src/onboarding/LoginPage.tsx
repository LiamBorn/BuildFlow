/**
 * <LoginPage> — signing back in, on the same design as signing up (2026-09-22).
 *
 * It lives beside the five-step flow and wears its clothes: the question column on the left
 * with the brand at its head, the black pill, the elements coming into focus top to bottom,
 * and on the right the same framed card showing the actual program. Before this it was the
 * last screen on the old two-column account split — an aurora panel and a typewriter quote — so arriving
 * from the landing page to sign in and arriving to sign UP looked like two different products.
 *
 * WHAT THE CARD SHOWS. The Dashboard, because that is where signing in lands, and its account
 * row carries the ADDRESS as it is typed — the one thing actually known about the person
 * before they are through the door. The name is not: guessing it from the local part of an
 * email would be a small lie in a place that has to be trusted.
 *
 * NO PROGRESS BAR: signing in is not a step of five. The heading is held at the same height
 * the flow's is anyway (`.onb-login` in onboarding.css), so moving between the two screens
 * does not shift the page under the reader.
 *
 * FORGOT-PASSWORD IS A MODE, not a page — it is one field and one button, and the way back is
 * a link, so a route of its own would only put an entry in the history for it. It swaps on the
 * same fade the flow's steps use (`usePaneSwap`). The emailed link's own landing page
 * (`#reset-password`) is still the old design; so are `#verify-email` and `#accept-invite`.
 */
import { useEffect, useState, type FormEvent } from "react";
import { fetchOauthStatus, oauthStartUrl, requestPasswordReset, type OAuthProvider } from "../api";
import { AuthShell } from "./AuthShell";
import { Beats } from "./Beats";
import { OnboardingPreview } from "./OnboardingPreview";
import { PasswordField } from "./PasswordField";
import { usePaneSwap } from "./usePaneSwap";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* A provider round trip that failed comes back as "?oauth=error&reason=…". */
const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again or use your email.",
  no_account: "There's no BuildFlow account for that email yet. Create one below, or sign in with a different address.",
  email_unverified: "That provider hasn't confirmed the email on the account. Use an address they have verified, or sign up with your email.",
  not_configured: "That sign-in option isn't set up yet. Use your email for now.",
  state_missing: "That sign-in took too long or the browser lost track of it. Please try again.",
  state_mismatch: "That sign-in took too long or the browser lost track of it. Please try again.",
  exchange_failed: "The provider didn't complete sign-in. Please try again or use your email."
};

type Mode = "login" | "forgot";

export function LoginPage({
  onBack,
  onLoginSubmit,
  onSwitchToSignup
}: {
  /** Back to the landing page, from the brand mark. */
  onBack: () => void;
  onLoginSubmit: (input: { email: string; password: string; remember?: boolean }) => Promise<void>;
  onSwitchToSignup: () => void;
}) {
  const { current: mode, leaving, go } = usePaneSwap<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /* On by default, which is what the 30-day cookie has always done. Unchecking asks the server
     for a browser-session cookie instead, so closing the browser signs this account out — the
     answer for a shared site computer. */
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [oauth, setOauth] = useState<Record<OAuthProvider, boolean>>({ google: false, microsoft: false });

  // Provider buttons exist only when the server has credentials for them.
  useEffect(() => {
    let cancelled = false;
    fetchOauthStatus()
      .then((status) => {
        if (!cancelled && status?.providers) setOauth(status.providers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") !== "error") return;
    const reason = params.get("reason") ?? "";
    setErrors({ form: OAUTH_MESSAGES[reason] ?? "Sign-in with that provider didn't complete. Please try again or use your email." });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    // no account for that address: creating one is the next step, so go where that happens
    if (reason === "no_account") onSwitchToSignup();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const clear = (field: "email" | "password") => {
    if (errors[field] || errors.form) setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const mail = email.trim();

    if (mode === "forgot") {
      if (!mail || !EMAIL_PATTERN.test(mail)) {
        setErrors({ email: mail ? "Enter a valid email address." : "Enter the email you signed up with." });
        return;
      }
      setErrors({});
      setBusy(true);
      try {
        await requestPasswordReset(mail);
        setResetSent(true);
      } catch (err) {
        setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
      } finally {
        setBusy(false);
      }
      return;
    }

    const next: typeof errors = {};
    if (!mail) next.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(mail)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.email || next.password) return;

    setBusy(true);
    try {
      await onLoginSubmit({ email: mail, password, remember });
      // On success the parent opens the workspace and this unmounts.
    } catch (err) {
      /* A failed sign-in is deliberately NOT pinned to a field: the server does not say which
         half was wrong, and guessing would tell a stranger which addresses have accounts. */
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
      setBusy(false);
    }
  };

  const startWithProvider = (provider: OAuthProvider) => {
    if (typeof window === "undefined") return;
    /* Deliberately not tracked here: `login` is recorded when a session actually exists
       (App.tsx's handleLoginSubmit), and firing it as a round trip STARTS would count every
       abandoned one as a sign-in. */
    window.location.assign(oauthStartUrl(provider, { mode: "login", remember }));
  };

  const anyProvider = oauth.google || oauth.microsoft;
  const backToLogin = () => {
    setResetSent(false);
    setErrors({});
    go("login");
  };

  return (
    <AuthShell
      id="create-account"
      onBack={onBack}
      paneKey={mode}
      leaving={leaving}
      preview={
        /* The Dashboard, because that is where signing in lands. `signingInAs` is the address as
           it is typed — the only thing known about this person before they are through. */
        <OnboardingPreview step={1} firstName="" lastName="" businessName="" trade={null} revenueLabel={null} teamLabel={null} signingInAs={email.trim()} />
      }
    >
      <form className="onb-form" onSubmit={submit} noValidate>
        <Beats>
          <h1 className="onb-h1" id="onb-title">
            {mode === "forgot" ? "Reset your password." : "Welcome back."}
          </h1>
          <p className="onb-sub">
            {mode === "forgot"
              ? "Enter the email you signed up with and we'll send a link to choose a new password."
              : "Sign in to your production workspace."}
          </p>
          <div className="onb-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={`onb-input${errors.email ? " is-invalid" : ""}`}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResetSent(false);
                clear("email");
              }}
              autoComplete="email"
              placeholder="name@company.com"
              aria-invalid={errors.email ? true : undefined}
              autoFocus
            />
            {errors.email && (
              <p className="onb-error" role="alert">
                {errors.email}
              </p>
            )}
          </div>
          {mode === "login" && (
            <PasswordField
              id="login-password"
              label="Password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                clear("password");
              }}
              placeholder="Your password"
              autoComplete="current-password"
              error={errors.password}
              action={
                <button
                  type="button"
                  className="onb-link onb-link-quiet"
                  onClick={() => {
                    setErrors({});
                    go("forgot");
                  }}
                >
                  Forgot password?
                </button>
              }
            />
          )}
          {mode === "login" && (
            <label className="onb-check">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Keep me signed in for 30 days</span>
            </label>
          )}
          <div className="onb-form-note">
            {/* Always the same answer, whether or not that address has an account: a
                different one would tell a stranger who is a customer. */}
            {mode === "forgot" && resetSent && (
              <p className="onb-note" role="status">
                If there&apos;s a BuildFlow account for <b>{email.trim()}</b>, a reset link is on its way. It works for one hour.
              </p>
            )}
            {errors.form && (
              <p className="onb-error" role="alert">
                {errors.form}
              </p>
            )}
          </div>
          <div className="onb-actions">
            {!(mode === "forgot" && resetSent) && (
              <button type="submit" className="onb-btn onb-btn-primary" disabled={busy}>
                {busy ? (mode === "forgot" ? "Sending…" : "Signing in…") : mode === "forgot" ? "Send reset link" : "Sign in"}
              </button>
            )}
            {mode === "login" && anyProvider && (
              <div className="onb-oauth">
                <span>or continue with</span>
                <div>
                  {oauth.google && (
                    <button type="button" onClick={() => startWithProvider("google")}>
                      Google
                    </button>
                  )}
                  {oauth.microsoft && (
                    <button type="button" onClick={() => startWithProvider("microsoft")}>
                      Microsoft
                    </button>
                  )}
                </div>
              </div>
            )}
            {mode === "forgot" ? (
              <button type="button" className="onb-link" onClick={backToLogin}>
                Back to sign in
              </button>
            ) : (
              <p className="onb-alt">
                New to BuildFlow?{" "}
                <button type="button" className="onb-link" onClick={onSwitchToSignup}>
                  Create an account
                </button>
              </p>
            )}
          </div>
          <p className="onb-legal">
            By continuing, you agree to the <a href="#terms">Terms &amp; Conditions</a> and <a href="#privacy">Privacy Policy</a>.
          </p>
        </Beats>
      </form>
    </AuthShell>
  );
}
