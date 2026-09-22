/**
 * Step 5: the plan the size answers point at, on the reference's pricing page — the
 * whole screen goes to the pastel gradient and one white card sits in the middle of it.
 *
 * The card names the plan, its per-seat price, and — the one thing the reference does
 * not have — WHY: `recommendation.reason` is a sentence built from the answers given
 * (recommendPlan.ts). A recommendation nobody can see the reasoning of is a verdict.
 *
 * Two buttons, as on the reference: the recommended plan, then "Continue for free". When
 * the recommendation IS Free the second button offers Pro instead, and when it is
 * Enterprise the first one goes to sales — a custom seat count is not a click.
 */
import { Check } from "lucide-react";
import type { PlanId } from "@buildflow/shared";
import type { Recommendation } from "./recommendPlan";

/** What the card needs of a plan — `productPlans` in App.tsx has these fields and more. */
export type OnboardingPlan = {
  id: PlanId;
  name: string;
  /** per seat, per month; null for Enterprise's custom pricing */
  priceMonthly: number | null;
  /** "Label: detail" strings; the card shows the labels */
  features: string[];
};

/** How many of a plan's features fit on the card — the reference shows eight. */
const FEATURES_SHOWN = 8;

export function PlanStep({
  recommendation,
  plan,
  busy,
  onChoose,
  onContactSales,
  onBack
}: {
  recommendation: Recommendation;
  plan: OnboardingPlan;
  busy: boolean;
  onChoose: (plan: PlanId) => void;
  onContactSales: () => void;
  onBack: () => void;
}) {
  const recommended = recommendation.plan;
  const price = plan.priceMonthly === null ? "Custom" : `$${plan.priceMonthly}`;
  const features = plan.features.slice(0, FEATURES_SHOWN).map((feature) => feature.split(": ")[0]);

  const primary =
    recommended === "enterprise"
      ? { label: "Talk to sales", run: onContactSales }
      : recommended === "free"
        ? { label: "Continue for free", run: () => onChoose("free") }
        : { label: `Continue with ${plan.name}`, run: () => onChoose(recommended) };
  const secondary =
    recommended === "free" ? { label: "Start with Pro instead", run: () => onChoose("pro") } : { label: "Continue for free", run: () => onChoose("free") };

  return (
    <div className="onb-plan">
      <div className="onb-plan-brand">
        <img src="/buildflow-logo.png" alt="" />
        <span>BuildFlow</span>
        <span className="onb-badge">Recommended plan</span>
      </div>
      <section className="onb-card" aria-labelledby="onb-title">
        <h1 className="onb-card-plan" id="onb-title">
          {plan.name}
        </h1>
        <p className="onb-card-price">
          <strong>{price}</strong>
          {plan.priceMonthly !== null && <span>/ user / month</span>}
        </p>
        <p className="onb-card-reason">{recommendation.reason}</p>
        <hr />
        <ul>
          {features.map((feature) => (
            <li key={feature}>
              <Check aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        <div className="onb-card-actions">
          <button type="button" className="onb-btn onb-btn-primary" disabled={busy} onClick={primary.run}>
            {busy ? "Setting up your workspace…" : primary.label}
          </button>
          <button type="button" className="onb-btn onb-btn-ghost" disabled={busy} onClick={secondary.run}>
            {secondary.label}
          </button>
        </div>
        {(recommended === "pro" || recommended === "business") && (
          <p className="onb-card-note">Starts a 14-day trial. Billing is set up later, in Settings.</p>
        )}
      </section>
      <button type="button" className="onb-link onb-plan-back" onClick={onBack} disabled={busy}>
        Back
      </button>
    </div>
  );
}
