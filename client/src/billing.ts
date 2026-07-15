/* =========================================================================
   Client-side billing helper — starts Stripe Checkout via the backend.

   The server holds the secret key and creates the Checkout Session; the client
   just POSTs the chosen plan/period/seats and redirects the browser to the
   Stripe-hosted URL that comes back. No card data is ever handled here.

   Until Stripe is configured server-side, /api/billing/checkout responds with
   { configured: false } and we surface a friendly message instead of
   redirecting — the same "wired now, live when you add keys" pattern the rest
   of the app uses (email LOG MODE, analytics DEBUG mode).
   ========================================================================= */

export type CheckoutPlanId = "pro" | "business";
export type CheckoutPeriod = "monthly" | "yearly";

export type CheckoutOutcome =
  | { status: "redirecting" }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export async function startPlanCheckout(plan: CheckoutPlanId, period: CheckoutPeriod, seats: number): Promise<CheckoutOutcome> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        period,
        seats,
        origin: typeof window !== "undefined" ? window.location.origin : undefined
      })
    });
    const data = (await res.json().catch(() => ({}))) as {
      configured?: boolean;
      url?: string;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return { status: "error", message: data.error ?? "Could not start checkout. Please try again." };
    }
    if (data.configured && data.url) {
      window.location.assign(data.url); // hand off to Stripe's hosted Checkout
      return { status: "redirecting" };
    }
    return {
      status: "not_configured",
      message:
        data.message ??
        "Online checkout isn't connected yet. Add your Stripe keys in server/.env, or contact our team and we'll get you set up."
    };
  } catch {
    return { status: "error", message: "Couldn't reach the billing service. Please try again in a moment." };
  }
}

/* Read the ?checkout=success|cancelled marker Stripe appends when it redirects
   back after Checkout, then strip it from the URL so a refresh doesn't re-show
   the banner. Returns null when there's nothing to show. */
export function readCheckoutReturn(): { status: "success" | "cancelled"; plan?: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (checkout !== "success" && checkout !== "cancelled") return null;
  const plan = params.get("plan") ?? undefined;
  // Clean the query string but preserve the hash route (#compare-plans).
  params.delete("checkout");
  params.delete("plan");
  const query = params.toString();
  const newUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", newUrl);
  return { status: checkout, plan };
}
