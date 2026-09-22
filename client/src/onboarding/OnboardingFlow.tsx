/**
 * <OnboardingFlow> — creating an account and setting up its workspace as five short
 * steps (2026-09-22), on the reference recording's design: one question a screen on the
 * left, a preview of the workspace being built on the right, a black pill to go on.
 *
 *   1  your name, work email, password        ┐ before the account exists
 *   2  the business's name                     ┘ (Next here is the signup)
 *   3  what type of construction business      ┐
 *   4  monthly revenue and total employees     │ the workspace's setup
 *   5  the plan those answers point at         ┘
 *
 * WHERE THE STEPS LIVE. The hash is the source of truth for which GROUP of steps this is
 * on — `#create-account` for 1–2, `#business-type` for 3, `#additional-products` for 4–5 —
 * the same three hashes the old three pages had, so every deep link, the session guard, the
 * browser's Back button and the "resume where you left off" rule all keep working unchanged.
 * Moving between groups goes THROUGH the parent (the signup's `enterAfterAuth` pushes
 * `#business-type`; `onTradeChosen` pushes `#additional-products`) and comes back in as the
 * `entry` prop, which the effect below turns into a step. Within a group the step is local.
 *
 * THE TRANSITION, measured off the recording at 40ms (frames 36.52–37.36):
 *   - the preview and the progress move FIRST — the next card is already on the right while
 *     the outgoing form is still fading;
 *   - the outgoing form fades as one piece, ~160ms;
 *   - the column is empty for ~120ms;
 *   - then the incoming elements come into focus top to bottom — heading, lede, field, hint,
 *     button, link — about 100ms apart, each blur-and-fade over ~160ms, and NONE of them
 *     travel: the heading is on the same pixel at its first frame and its last.
 * The numbers here are the shared ladder's rungs nearest those measurements: DUR.exit (180),
 * STAGGER.row (140) for the gap, DUR.fast (220) per element, STAGGER.card (90) between them.
 *
 * The plan (step 5) is the reference's pricing page: the whole screen turns to the gradient
 * at once, and the card comes into focus a beat later, as one unit.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { businessTypeOptions, passwordProblem, tradeProfiles, type BusinessTypeId, type PlanId } from "@buildflow/shared";
import { ApiError, fetchOauthStatus, fetchSession, oauthStartUrl, type OAuthProvider, type SignupInput } from "../api";
import { EVENTS, track } from "../analytics";
import { SegmentPill } from "../motion/SegmentPill";
import { Beats } from "./Beats";
import { usePaneSwap } from "./usePaneSwap";
import { OnboardingPreview, TRADE_ICONS, toneColor, type PreviewStep } from "./OnboardingPreview";
import { PlanStep, type OnboardingPlan } from "./PlanStep";
import { recommendPlan, revenueLabel, REVENUE_OPTIONS, teamLabel, TEAM_OPTIONS, type RevenueBand, type TeamBand } from "./recommendPlan";

export type OnboardingEntry = "create-account" | "business-type" | "additional-products";
export type StepId = 1 | 2 | 3 | 4 | 5;
export const STEP_COUNT = 5;

const FIRST_STEP: Record<OnboardingEntry, StepId> = { "create-account": 1, "business-type": 3, "additional-products": 4 };
export const groupOf = (step: StepId): OnboardingEntry => (step <= 2 ? "create-account" : step === 3 ? "business-type" : "additional-products");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Consumer mailboxes. A signup from one still works — plenty of small contractors run on
   one — it just gets a nudge, because invites and invoices follow the address. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);
const isPersonalEmail = (email: string) => PERSONAL_EMAIL_DOMAINS.has(email.trim().toLowerCase().split("@")[1] ?? "");

type Field = "firstName" | "lastName" | "email" | "password" | "terms" | "business" | "form";
type Errors = Partial<Record<Field, string>>;
/** The server names a field the old way; this is where each one is asked now. */
const SERVER_FIELD: Record<string, Field | undefined> = {
  name: "firstName",
  email: "email",
  password: "password",
  company: "business",
  orgName: "business",
  terms: "terms"
};
const TERMS_MESSAGE = "Please agree to the Terms & Conditions and Privacy Policy.";

/* A provider round trip that failed comes back as "?oauth=error&reason=…". */
const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again or use your email.",
  no_account: "There's no BuildFlow account for that email yet. Create one below, or sign in with a different address.",
  email_unverified: "That provider hasn't confirmed the email on the account. Use an address they have verified, or sign up with your email.",
  terms_required: TERMS_MESSAGE,
  not_configured: "That sign-in option isn't set up yet. Use your email for now.",
  state_missing: "That sign-in took too long or the browser lost track of it. Please try again.",
  state_mismatch: "That sign-in took too long or the browser lost track of it. Please try again.",
  exchange_failed: "The provider didn't complete sign-in. Please try again or use your email."
};

export type OnboardingFlowProps = {
  /** Which group of steps the hash says this is on. */
  entry: OnboardingEntry;
  plans: OnboardingPlan[];
  /** The workspace's name, for a flow resumed after the account exists (else read from the session). */
  orgName?: string;
  onSignup: (input: SignupInput) => Promise<void>;
  onTradeChosen: (trade: BusinessTypeId) => void;
  onBackToTrade: () => void;
  onFinish: (plan: PlanId, seats: number) => Promise<void> | void;
  onLogIn: () => void;
  /** Back to the landing page, from the first step. */
  onBack: () => void;
  onContactSales: () => void;
};

export function OnboardingFlow({
  entry,
  plans,
  orgName,
  onSignup,
  onTradeChosen,
  onBackToTrade,
  onFinish,
  onLogIn,
  onBack,
  onContactSales
}: OnboardingFlowProps) {
  /* `shown` leads `step` by one transition: the preview and the progress move while the
     outgoing form is still fading, which is what the recording does (usePaneSwap). */
  const { current: step, shown, leaving, target, go } = usePaneSwap<StepId>(FIRST_STEP[entry]);

  /* The hash moved (a signup finished, a trade was chosen, the browser went Back): follow it
     to that group's first step, unless this is already on — or on its way to — that group. */
  useEffect(() => {
    if (groupOf(target) !== entry) go(FIRST_STEP[entry]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is stable enough: it reads refs
  }, [entry]);

  useEffect(() => {
    if (entry === "create-account") track(EVENTS.signupStarted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [remember, setRemember] = useState(true);
  const [emailTaken, setEmailTaken] = useState(false);
  const [oauth, setOauth] = useState<Record<OAuthProvider, boolean>>({ google: false, microsoft: false });
  // step 2
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  // step 3
  const [trade, setTrade] = useState<BusinessTypeId | "">("");
  // step 4
  const [revenue, setRevenue] = useState<RevenueBand | null>(null);
  const [team, setTeam] = useState<TeamBand | null>(null);
  // step 5
  const [finishing, setFinishing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

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
  }, []);

  const clear = (field: Field) => {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  /* Resumed after the account exists (a reload on #business-type, a second workspace): nothing
     was typed here, so the business's name comes from the session — it is not on the workspace
     payload, and the session's org IS the active workspace. The person's name is not needed:
     the steps that greet them are the ones before the account exists. */
  const [sessionOrg, setSessionOrg] = useState("");
  useEffect(() => {
    if (entry === "create-account") return;
    let cancelled = false;
    fetchSession()
      .then((current) => {
        if (!cancelled && current?.org?.name) setSessionOrg(current.org.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once: the flow is mounted at one entry
  }, []);
  const first = firstName.trim();
  const business = businessName.trim() || orgName?.trim() || sessionOrg;
  const tradeProfile = trade ? tradeProfiles[trade] : null;
  const recommendation = recommendPlan(revenue, team);
  const plan = plans.find((candidate) => candidate.id === recommendation.plan) ?? plans[0];

  const validateAccount = (): Errors => {
    const next: Errors = {};
    if (!firstName.trim()) next.firstName = "Enter your first name.";
    if (!lastName.trim()) next.lastName = "Enter your last name.";
    const mail = email.trim();
    if (!mail) next.email = "Enter your work email.";
    else if (!EMAIL_PATTERN.test(mail)) next.email = "Enter a valid email address.";
    const problem = passwordProblem(password, mail);
    if (problem) next.password = problem;
    if (!acceptTerms) next.terms = TERMS_MESSAGE;
    return next;
  };
  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = validateAccount();
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) return;
    go(2);
  };
  const startOauth = (provider: OAuthProvider) => {
    if (!acceptTerms) {
      setErrors({ terms: TERMS_MESSAGE });
      return;
    }
    window.location.assign(oauthStartUrl(provider, { mode: "signup", acceptTerms, remember }));
  };

  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const name = businessName.trim();
    if (!name) {
      setErrors({ business: "Enter your business name." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSignup({
        email: email.trim(),
        password,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        orgName: name,
        acceptTerms: true,
        remember
      });
      // On success the parent moves the hash to #business-type; the entry effect takes it from there.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      const field = err instanceof ApiError && err.field ? SERVER_FIELD[err.field] : undefined;
      if (field === "business") {
        setErrors({ business: message });
      } else if (field) {
        // the fault is on the first step: go back to it with the field marked
        setErrors({ [field]: message });
        setEmailTaken(err instanceof ApiError && err.code === "email_taken");
        go(1);
      } else {
        setErrors({ form: message });
      }
    } finally {
      setBusy(false);
    }
  };

  const submitTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trade) onTradeChosen(trade);
  };

  const submitSize = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go(5);
  };
  const skipSize = () => {
    setRevenue(null);
    setTeam(null);
    go(5);
  };

  const choosePlan = async (chosen: PlanId) => {
    if (finishing) return;
    setFinishing(true);
    try {
      await onFinish(chosen, recommendation.seats);
    } finally {
      setFinishing(false);
    }
  };

  const inputClass = (field: Field) => `onb-input${errors[field] ? " is-invalid" : ""}`;
  const paneClass = `onb-pane${leaving ? " is-leaving" : ""}`;

  if (step === 5) {
    return (
      <main className="onb onb-is-plan" id="onboarding" aria-labelledby="onb-title" data-step={step}>
        <div className={paneClass} key="plan">
          <PlanStep
            recommendation={recommendation}
            plan={plan}
            busy={finishing}
            onChoose={(chosen) => void choosePlan(chosen)}
            onContactSales={onContactSales}
            onBack={() => go(4)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="onb" id="onboarding" aria-labelledby="onb-title" data-step={step}>
      {/* the trade tiles' selection ring travels on the app's own engine; the shell's copy of this
          layer is not mounted on the welcome page, so the flow carries one */}
      <SegmentPill />
      <div className="onb-col">
        <button type="button" className="onb-brand" onClick={onBack} aria-label="Back to BuildFlow">
          <img src="/buildflow-logo.png" alt="" />
          <span>BuildFlow</span>
        </button>
        <div className="onb-inner">
          <div className="onb-progress" aria-live="polite">
            <span>
              Step {shown} of {STEP_COUNT}
            </span>
            <div className="onb-progress-bar" aria-hidden="true">
              <i style={{ "--onb-fill": `${(shown / STEP_COUNT) * 100}%` } as CSSProperties} />
            </div>
          </div>

          <div className={paneClass} key={step}>
            {step === 1 && (
              <form className="onb-form" onSubmit={submitAccount} noValidate>
                <Beats>
                  <h1 className="onb-h1" id="onb-title">
                    Let&apos;s start with you.
                  </h1>
                  <p className="onb-sub">Your name is how your crew sees you across the workspace. Your email is how you sign in.</p>
                  <div className="onb-row2">
                    <div className="onb-field">
                      <label htmlFor="onb-first">First name</label>
                      <input
                        id="onb-first"
                        className={inputClass("firstName")}
                        value={firstName}
                        onChange={(event) => {
                          setFirstName(event.target.value);
                          clear("firstName");
                        }}
                        autoComplete="given-name"
                        placeholder="Jordan"
                        aria-invalid={errors.firstName ? true : undefined}
                        autoFocus
                      />
                    </div>
                    <div className="onb-field">
                      <label htmlFor="onb-last">Last name</label>
                      <input
                        id="onb-last"
                        className={inputClass("lastName")}
                        value={lastName}
                        onChange={(event) => {
                          setLastName(event.target.value);
                          clear("lastName");
                        }}
                        autoComplete="family-name"
                        placeholder="Reyes"
                        aria-invalid={errors.lastName ? true : undefined}
                      />
                    </div>
                    {(errors.firstName || errors.lastName) && (
                      <p className="onb-error onb-row2-note" role="alert">
                        {errors.firstName ?? errors.lastName}
                      </p>
                    )}
                  </div>
                  <div className="onb-field">
                    <label htmlFor="onb-email">Work email</label>
                    <input
                      id="onb-email"
                      className={inputClass("email")}
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailTaken(false);
                        clear("email");
                      }}
                      autoComplete="email"
                      placeholder="name@company.com"
                      aria-invalid={errors.email ? true : undefined}
                    />
                    {errors.email ? (
                      <p className="onb-error" role="alert">
                        {errors.email}
                        {emailTaken && (
                          <button type="button" className="onb-inline-link" onClick={onLogIn}>
                            Log in instead
                          </button>
                        )}
                      </p>
                    ) : isPersonalEmail(email) ? (
                      <p className="onb-hint">That looks like a personal address. It works — a work email just keeps invites and invoices with the company.</p>
                    ) : null}
                  </div>
                  <div className="onb-field">
                    <label htmlFor="onb-password">Password</label>
                    <div className="onb-pw">
                      <input
                        id="onb-password"
                        className={inputClass("password")}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          clear("password");
                        }}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        aria-invalid={errors.password ? true : undefined}
                      />
                      <button
                        type="button"
                        className="onb-pw-eye"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                    {errors.password ? (
                      <p className="onb-error" role="alert">
                        {errors.password}
                      </p>
                    ) : (
                      <p className="onb-hint">At least 8 characters. Avoid common words and your email.</p>
                    )}
                  </div>
                  <div className={`onb-check${errors.terms ? " is-invalid" : ""}`}>
                    <input
                      id="onb-terms"
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(event) => {
                        setAcceptTerms(event.target.checked);
                        clear("terms");
                      }}
                      aria-invalid={errors.terms ? true : undefined}
                    />
                    {/* the links sit outside the <label> so opening the Terms doesn't also tick the box */}
                    <span>
                      <label htmlFor="onb-terms">I agree to the</label> <a href="#terms">Terms &amp; Conditions</a> and <a href="#privacy">Privacy Policy</a>.
                      {errors.terms && (
                        <span className="onb-error" role="alert">
                          {errors.terms}
                        </span>
                      )}
                    </span>
                  </div>
                  <label className="onb-check">
                    <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                    <span>Keep me signed in for 30 days</span>
                  </label>
                  <div className="onb-form-note">
                    {errors.form && (
                      <p className="onb-error" role="alert">
                        {errors.form}
                      </p>
                    )}
                  </div>
                  <div className="onb-actions">
                    <button
                      type="submit"
                      className="onb-btn onb-btn-primary"
                      disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !password}
                    >
                      Next
                    </button>
                    {(oauth.google || oauth.microsoft) && (
                      <div className="onb-oauth">
                        <span>or continue with</span>
                        <div>
                          {oauth.google && (
                            <button type="button" onClick={() => startOauth("google")}>
                              Google
                            </button>
                          )}
                          {oauth.microsoft && (
                            <button type="button" onClick={() => startOauth("microsoft")}>
                              Microsoft
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="onb-alt">
                      Existing user?{" "}
                      <button type="button" className="onb-link" onClick={onLogIn}>
                        Log in
                      </button>
                    </p>
                  </div>
                </Beats>
              </form>
            )}

            {step === 2 && (
              <form className="onb-form" onSubmit={submitBusiness} noValidate>
                <Beats>
                  <h1 className="onb-h1" id="onb-title">
                    Nice to meet you, {first || "there"}!
                  </h1>
                  <p className="onb-sub">What&apos;s your business called? It becomes your workspace, and it&apos;s on every schedule you share.</p>
                  <div className="onb-field">
                    <label htmlFor="onb-business">Business name</label>
                    <input
                      id="onb-business"
                      className={inputClass("business")}
                      value={businessName}
                      onChange={(event) => {
                        setBusinessName(event.target.value);
                        clear("business");
                      }}
                      autoComplete="organization"
                      placeholder="Reyes Paving"
                      aria-invalid={errors.business ? true : undefined}
                      autoFocus
                    />
                    {errors.business ? (
                      <p className="onb-error" role="alert">
                        {errors.business}
                      </p>
                    ) : (
                      <p className="onb-hint">You can use your own name if you don&apos;t have a business name yet — plenty of contractors do.</p>
                    )}
                  </div>
                  <div className="onb-form-note">
                    {errors.form && (
                      <p className="onb-error" role="alert">
                        {errors.form}
                      </p>
                    )}
                  </div>
                  <div className="onb-actions">
                    <button type="submit" className="onb-btn onb-btn-primary" disabled={!businessName.trim() || busy}>
                      {busy ? "Creating your workspace…" : "Next"}
                    </button>
                    <button type="button" className="onb-link" onClick={() => go(1)} disabled={busy}>
                      Back
                    </button>
                  </div>
                </Beats>
              </form>
            )}

            {step === 3 && (
              <form className="onb-form" onSubmit={submitTrade}>
                <Beats>
                  <h1 className="onb-h1" id="onb-title">
                    What type of construction business do you own?
                  </h1>
                  <p className="onb-sub">BuildFlow builds the workspace around your trade: its crews, its phases, its readiness checks and the ways it loses days.</p>
                  <div className="onb-tiles" role="radiogroup" aria-label="Business type">
                    {businessTypeOptions.map((id) => {
                      const profile = tradeProfiles[id];
                      const Icon = TRADE_ICONS[profile.icon];
                      const on = trade === id;
                      const labelId = `onb-tile-${id.toLowerCase().replace(/\s+/g, "-")}`;
                      /* `is-active` is the mark motion/SegmentPill.tsx reads: the chosen tile's ring is the
                         group's own ::before, and it TRAVELS to the next choice (onboarding.css) */
                      return (
                        <label key={id} className={`onb-tile${on ? " is-on is-active" : ""}`} style={{ "--tone": toneColor(profile.tone) } as CSSProperties}>
                          <input type="radio" name="business-type" value={id} checked={on} onChange={() => setTrade(id)} aria-labelledby={labelId} />
                          <Icon aria-hidden="true" />
                          <span id={labelId}>{profile.label}</span>
                          {on && (
                            <span className="onb-tile-check" aria-hidden="true">
                              <Check />
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="onb-actions">
                    <button type="submit" className="onb-btn onb-btn-primary" disabled={!trade}>
                      Next
                    </button>
                  </div>
                </Beats>
              </form>
            )}

            {step === 4 && (
              <form className="onb-form" onSubmit={submitSize}>
                <Beats>
                  <h1 className="onb-h1" id="onb-title">
                    How big is {business || "the business"} today?
                  </h1>
                  <p className="onb-sub">Two rough answers, and we&apos;ll put the right plan in front of you. Nothing here is a commitment.</p>
                  <div className="onb-group" role="radiogroup" aria-label="Monthly revenue">
                    <span>Monthly revenue</span>
                    <div className="onb-chips">
                      {REVENUE_OPTIONS.map((option) => {
                        const on = revenue === option.id;
                        return (
                          <label key={option.id} className={`onb-chip${on ? " is-on" : ""}`}>
                            <input type="radio" name="revenue" value={option.id} checked={on} onChange={() => setRevenue(option.id)} aria-labelledby={`onb-rev-${option.id}`} />
                            {on && <Check aria-hidden="true" />}
                            <span id={`onb-rev-${option.id}`}>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="onb-group" role="radiogroup" aria-label="Total employees">
                    <span>Total employees</span>
                    <div className="onb-chips">
                      {TEAM_OPTIONS.map((option) => {
                        const on = team === option.id;
                        return (
                          <label key={option.id} className={`onb-chip${on ? " is-on" : ""}`}>
                            <input type="radio" name="team" value={option.id} checked={on} onChange={() => setTeam(option.id)} aria-labelledby={`onb-team-${option.id}`} />
                            {on && <Check aria-hidden="true" />}
                            <span id={`onb-team-${option.id}`}>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="onb-actions">
                    <button type="submit" className="onb-btn onb-btn-primary" disabled={!revenue || !team}>
                      Next
                    </button>
                    <button type="button" className="onb-btn onb-btn-ghost" onClick={skipSize}>
                      Skip
                    </button>
                    <button type="button" className="onb-link" onClick={onBackToTrade}>
                      Back
                    </button>
                  </div>
                </Beats>
              </form>
            )}
          </div>
        </div>
      </div>

      <aside className="onb-aside">
        <OnboardingPreview
          step={Math.min(shown, 4) as PreviewStep}
          firstName={first}
          lastName={lastName.trim()}
          businessName={business}
          trade={tradeProfile}
          revenueLabel={revenueLabel(revenue)}
          teamLabel={teamLabel(team)}
        />
      </aside>
    </main>
  );
}
