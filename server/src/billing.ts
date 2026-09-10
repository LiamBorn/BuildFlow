/* =========================================================================
   Stripe billing — Checkout, Customer Portal, and subscription webhooks.

   Turns the pricing plans into real, chargeable subscriptions. Like email.ts,
   it runs in a SAFE FALLBACK until you add credentials: with no STRIPE_SECRET_KEY
   the API stays up and every billing endpoint responds "not configured" (the
   pricing UI shows a friendly notice) instead of erroring — so the whole flow is
   wired and testable before you connect Stripe. No card data ever touches this
   server; Stripe Checkout hosts the payment page.

   GO LIVE — all in your own Stripe dashboard, nothing secret is committed:
     1. Create your product + recurring Prices, one per plan × billing period
        (Pro monthly/yearly, Business monthly/yearly). Make them per-seat
        (billing_scheme = per_unit) — the customer's seat count is sent as the
        line-item quantity. Yearly prices should reflect the 20% discount shown
        on the pricing page.
     2. Put the secret key + price IDs in server/.env:
          STRIPE_SECRET_KEY=sk_test_...              (sk_live_... in production)
          STRIPE_PRICE_PRO_MONTHLY=price_...
          STRIPE_PRICE_PRO_YEARLY=price_...
          STRIPE_PRICE_BUSINESS_MONTHLY=price_...
          STRIPE_PRICE_BUSINESS_YEARLY=price_...
     3. So subscription status persists, add a webhook in Stripe pointing at
          <your-api>/api/billing/webhook   and copy its signing secret:
          STRIPE_WEBHOOK_SECRET=whsec_...
        Locally: `stripe listen --forward-to localhost:4300/api/billing/webhook`.
   ========================================================================= */
import Stripe from "stripe";

export type BillingPlanId = "pro" | "business";
export type BillingPeriod = "monthly" | "yearly";

let cached: Stripe | null | undefined;

/** Lazily construct the Stripe client from the secret key (once). Returns null
 *  when STRIPE_SECRET_KEY is unset — the "not configured" fallback. */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  cached = key ? new Stripe(key) : null;
  return cached;
}

export function isBillingConfigured(): boolean {
  return getStripe() !== null;
}

/** Which mode the secret key implies — surfaced in the boot banner + status. */
export function billingMode(): "live" | "test" | "disabled" {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return "disabled";
  return key.startsWith("sk_live_") ? "live" : "test";
}

const PRICE_ENV: Record<BillingPlanId, Record<BillingPeriod, string>> = {
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
  business: { monthly: "STRIPE_PRICE_BUSINESS_MONTHLY", yearly: "STRIPE_PRICE_BUSINESS_YEARLY" }
};

export function priceIdFor(plan: BillingPlanId, period: BillingPeriod): string | undefined {
  return process.env[PRICE_ENV[plan][period]]?.trim() || undefined;
}

/** Reverse lookup: which plan/period a Stripe price id maps to — used to label a
 *  subscription that comes back over the webhook. */
export function planForPriceId(priceId: string | null | undefined): { plan: BillingPlanId; period: BillingPeriod } | undefined {
  if (!priceId) return undefined;
  for (const plan of Object.keys(PRICE_ENV) as BillingPlanId[]) {
    for (const period of Object.keys(PRICE_ENV[plan]) as BillingPeriod[]) {
      if (priceIdFor(plan, period) === priceId) return { plan, period };
    }
  }
  return undefined;
}

/** Which plans currently have a usable price for both billing periods. */
export function configuredPlans(): Record<BillingPlanId, boolean> {
  return {
    pro: Boolean(priceIdFor("pro", "monthly") || priceIdFor("pro", "yearly")),
    business: Boolean(priceIdFor("business", "monthly") || priceIdFor("business", "yearly"))
  };
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; reason: "not_configured" | "price_not_configured"; message: string };

export async function createCheckoutSession(args: {
  plan: BillingPlanId;
  period: BillingPeriod;
  seats: number;
  successUrl: string;
  cancelUrl: string;
  email?: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Billing isn't connected yet. Add STRIPE_SECRET_KEY in server/.env to accept payments."
    };
  }
  const price = priceIdFor(args.plan, args.period);
  if (!price) {
    return {
      ok: false,
      reason: "price_not_configured",
      message: `No Stripe price is set for the ${args.plan} (${args.period}) plan. Set ${PRICE_ENV[args.plan][args.period]} in server/.env.`
    };
  }
  const seats = Math.max(1, Math.min(1000, Math.round(args.seats || 1)));
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: seats, adjustable_quantity: { enabled: true, minimum: 1, maximum: 1000 } }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    customer_email: args.email || undefined,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: { metadata: { planId: args.plan, period: args.period, seats: String(seats) } },
    metadata: { planId: args.plan, period: args.period, seats: String(seats) }
  });
  if (!session.url) return { ok: false, reason: "not_configured", message: "Stripe did not return a checkout URL." };
  return { ok: true, url: session.url };
}

export type PortalResult = { ok: true; url: string } | { ok: false; reason: "not_configured" | "no_customer"; message: string };

export async function createPortalSession(args: { customerId: string; returnUrl: string }): Promise<PortalResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured", message: "Billing isn't connected yet." };
  const session = await stripe.billingPortal.sessions.create({ customer: args.customerId, return_url: args.returnUrl });
  return { ok: true, url: session.url };
}

export function isWebhookConfigured(): boolean {
  return isBillingConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

/** Verify + parse a Stripe webhook. Throws if the signature/secret is bad — the
 *  route turns that into a 400 so Stripe retries. */
export function constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/** Boot banner — one line at startup so the operator knows if billing is live. */
export function reportBillingStatus(): void {
  const mode = billingMode();
  if (mode === "disabled") {
    console.warn(
      '💳 Billing: NOT CONFIGURED — STRIPE_SECRET_KEY is unset. Pricing plans display and the checkout endpoints respond "not configured" (no charges possible). Add STRIPE_SECRET_KEY + price IDs in server/.env to accept subscriptions.'
    );
    return;
  }
  const missing = (Object.keys(PRICE_ENV) as BillingPlanId[])
    .flatMap((plan) => (Object.keys(PRICE_ENV[plan]) as BillingPeriod[]).map((period) => ({ plan, period })))
    .filter(({ plan, period }) => !priceIdFor(plan, period))
    .map(({ plan, period }) => PRICE_ENV[plan][period]);
  const webhook = isWebhookConfigured() ? "webhook signing ready" : "⚠️ STRIPE_WEBHOOK_SECRET unset (subscription status won't persist)";
  if (missing.length) {
    console.warn(
      `💳 Billing: ${mode.toUpperCase()} MODE — Stripe key detected, but missing price IDs: ${missing.join(", ")}. Those plans can't check out until set. ${webhook}.`
    );
  } else {
    console.log(`💳 Billing: ${mode.toUpperCase()} MODE — Stripe connected, all plan prices set, ${webhook}.`);
  }
}
