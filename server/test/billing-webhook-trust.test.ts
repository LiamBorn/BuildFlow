/**
 * Only Stripe can grant a subscription.
 *
 * Entitlement in BuildFlow comes from exactly one place: `POST /api/billing/webhook` →
 * handleBillingEvent → upsertSubscription. Nothing about the post-payment redirect grants anything,
 * which is the reason 3609b4d could call the open redirect on the checkout routes low-stakes. That
 * argument is only as good as this route's refusal to believe an unsigned body — and nothing tested
 * it. A refactor that made verification conditional (the usual shape: verify only when a secret
 * happens to be configured) would hand out paid plans to anyone who can POST, and every existing test
 * would still pass.
 *
 * So: forge the event, and check no subscription appears. `POST /api/billing/portal` answers 404
 * when there is no subscription for an address and something else when there is, which is the
 * cheapest way to ask the store what it believes.
 *
 * The last case is the necessary other half. Four cases that all assert 400 would pass just as
 * happily against a route that refuses Stripe too — which would not be security, it would be billing
 * being broken. One correctly signed event has to get through.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const SECRET = "whsec_test_secret_for_signing";
const saved = { ...process.env };

beforeEach(() => {
  // A fake key is enough: constructEvent is local HMAC and never calls Stripe.
  process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...saved };
});

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-webhook-")), "test.sqlite"), reset: true });

/** A paid-up subscription for `email`, as Stripe would report one. */
const forgedEvent = (email: string) =>
  JSON.stringify({
    id: "evt_forged",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_forged",
        customer: "cus_forged",
        customer_email: email,
        subscription: "sub_forged",
        metadata: { planId: "business", period: "yearly", seats: "50" }
      }
    }
  });

/** The header Stripe sends: t=<unix>,v1=<hmac sha256 of "t.payload">. */
function stripeSignature(payload: string, secret = SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const post = (app: Awaited<ReturnType<typeof createApp>>, payload: string, signature?: string) => {
  const req = request(app).post("/api/billing/webhook").set("Content-Type", "application/json");
  return (signature ? req.set("Stripe-Signature", signature) : req).send(payload);
};

/* Asked of the store rather than over HTTP. The first draft used POST /api/billing/portal, reasoning
   that it answers 404 when there is no subscription for an address — but that route requires a session
   and answers 401 to all of this, so the helper returned "yes, there is one" every time and four cases
   passed while asserting nothing. createApp puts the manager on app.locals; this asks it. */
type WithStores = { locals: { storeManager: { main: { getSubscriptionByEmail(email: string): unknown } } } };
const hasSubscription = (app: Awaited<ReturnType<typeof createApp>>, email: string) =>
  Boolean((app as unknown as WithStores).locals.storeManager.main.getSubscriptionByEmail(email));

describe("a forged webhook", () => {
  it("is refused with no signature at all", async () => {
    const app = await freshApp();
    const res = await post(app, forgedEvent("nobody@example.com"));
    expect(res.status).toBe(400);
    expect(hasSubscription(app, "nobody@example.com"), "and nothing was written").toBe(false);
  });

  it("is refused with a signature that is simply wrong", async () => {
    const app = await freshApp();
    const res = await post(app, forgedEvent("nobody@example.com"), "t=1,v1=deadbeef");
    expect(res.status).toBe(400);
    expect(hasSubscription(app, "nobody@example.com")).toBe(false);
  });

  it("is refused when signed with a secret that is not ours", async () => {
    // The shape of a real attempt: the body is perfect and the HMAC is well-formed, just not ours.
    const app = await freshApp();
    const payload = forgedEvent("nobody@example.com");
    const res = await post(app, payload, stripeSignature(payload, "whsec_the_attackers_own_secret"));
    expect(res.status).toBe(400);
    expect(hasSubscription(app, "nobody@example.com")).toBe(false);
  });

  it("is refused even when the deployment has configured NO webhook secret", async () => {
    /* The case that matters most, because it is the one a refactor produces by accident: with no
       secret there is nothing to verify against, so the only safe answer is no. Verifying "when
       configured" would mean an unconfigured deployment hands out paid plans to anyone who can POST. */
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const app = await freshApp();
    const payload = forgedEvent("nobody@example.com");
    const res = await post(app, payload, stripeSignature(payload));
    expect(res.status).toBe(400);
    expect(hasSubscription(app, "nobody@example.com")).toBe(false);
  });
});

describe("a real webhook", () => {
  it("is accepted and does grant the subscription — refusing everything is not security", async () => {
    const app = await freshApp();
    const payload = forgedEvent("payer@example.com");
    const res = await post(app, payload, stripeSignature(payload));
    expect(res.status, "a correctly signed event must get through").toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(hasSubscription(app, "payer@example.com"), "and the subscription is recorded").toBe(true);
  });
});
