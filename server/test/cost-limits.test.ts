/**
 * The routes whose cost lands on somebody outside this process, and the one the demo lock had
 * quietly taken away.
 *
 * Both reach Anthropic when a key is configured, and import-schedule sends up to six images of up to
 * 20MB as vision input — the most expensive request BuildFlow can make. Neither had a ceiling, and
 * "requires a session" is not one: a signed-out page load takes a demo session and the demo is an
 * owner, so anyone is one POST away from both. Every other limit in this server protects a table or an
 * inbox; these protect a bill.
 *
 * The first case is a bug I introduced. 6cd72cf refuses a shared demo's writes by reading the METHOD,
 * because three capabilities mutate without saying so in their name. `POST /api/ai/ask` is the same
 * coin's other face — a read that needs a body, whose capability is literally `schedule.read` — so the
 * lock took the assistant away from every demo visitor on the published app, which is the one feature
 * the pricing page leads with. Importing a schedule stays refused, and should: its capability is
 * `import.commit` and the result becomes projects and jobs everyone else can see.
 *
 * `POST /api/feedback` is here for the third version of the same problem: it reaches an inbox a person
 * reads, with up to three attachments of up to 10MB each, and it is a read-only-demo exception on
 * purpose — the one thing a locked demo can still send outward. Unlimited, that is a way to fill
 * somebody's mailbox and spend the SMTP quota, from a session anyone can have for the asking.
 *
 * The keying case is the one worth keeping. Per-account for a real customer and per-address for the
 * demo is not fussiness: the demo ACCOUNT is shared, so counting it per account lets the first visitor
 * spend everybody's allowance, and counting a real customer per address makes one office share one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // answers {mode:"demo"} and spends nothing
});
afterEach(() => {
  process.env = { ...saved };
});

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-ai-")), "test.sqlite"), reset: true });

/** A signed-out visitor, as the landing page's demo gives them. */
async function demoAgent(app: Awaited<ReturnType<typeof createApp>>) {
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/demo").send({})).status).toBe(200);
  return agent;
}

const ask = (agent: ReturnType<typeof request.agent>) => agent.post("/api/ai/ask").send({ question: "When does the Route 9 job finish?" });

describe("the shared demo and the assistant", () => {
  beforeEach(() => {
    process.env.DEMO_READ_ONLY = "on";
  });

  it("can ask a question, because asking reads and changes nothing", async () => {
    const app = await freshApp();
    const agent = await demoAgent(app);
    const res = await ask(agent);
    expect(res.body?.code, "the demo lock must not take the assistant away").not.toBe("demo-read-only");
    expect(res.status).toBe(200);
  });

  it("still cannot import a schedule, which becomes projects everyone else sees", async () => {
    const app = await freshApp();
    const agent = await demoAgent(app);
    const res = await agent.post("/api/ai/import-schedule").send({ images: ["data:image/png;base64,iVBORw0KGgo="] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("demo-read-only");
  });
});

describe("the ceiling", () => {
  it("lets an ordinary question straight through — a limit that stops the first is not a limit", async () => {
    const app = await freshApp();
    expect((await ask(await demoAgent(app))).status).toBe(200);
  });

  it("refuses eventually, and says when to come back", async () => {
    const app = await freshApp();
    const agent = await demoAgent(app);
    let refused: Awaited<ReturnType<typeof ask>> | undefined;
    for (let i = 0; i < 60 && !refused; i += 1) {
      const res = await ask(agent);
      if (res.status === 429) refused = res;
    }
    expect(refused, "sixty questions should not all be answered").toBeDefined();
    expect(Number(refused!.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("holds the vision route much tighter, because that is the expensive one", async () => {
    delete process.env.DEMO_READ_ONLY; // the lock would refuse it before the limiter is reached
    const app = await freshApp();
    const agent = await demoAgent(app);
    const attempt = () => agent.post("/api/ai/import-schedule").send({ images: ["data:image/png;base64,iVBORw0KGgo="] });
    let at = -1;
    for (let i = 0; i < 20 && at < 0; i += 1) if ((await attempt()).status === 429) at = i + 1;
    expect(at, "an unlimited route never refuses").toBeGreaterThan(0);
    expect(at, "six an hour, then the refusal").toBeLessThanOrEqual(7);
  });
});

describe("who the allowance belongs to", () => {
  it("gives a real account its own, rather than the one the demo just spent", async () => {
    const app = await freshApp();

    // spend the address's allowance as a signed-out visitor
    const visitor = await demoAgent(app);
    let spent = false;
    for (let i = 0; i < 60 && !spent; i += 1) if ((await ask(visitor)).status === 429) spent = true;
    expect(spent, "the visitor's allowance should run out").toBe(true);

    // a real customer, from the same address, is a different actor
    const owner = request.agent(app);
    const signup = await owner.post("/api/auth/signup").send({
      name: "Real Owner",
      email: "owner@example.com",
      password: "Str0ng!Passphrase42",
      orgName: "Real Co.",
      acceptTerms: true
    });
    expect(signup.status).toBeLessThan(400);
    expect((await ask(owner)).status, "a customer must not inherit a stranger's exhausted bucket").toBe(200);
  });
});

describe("feedback, the one a locked demo can still send", () => {
  const send = (agent: ReturnType<typeof request.agent>) =>
    agent.post("/api/feedback").send({ category: "idea", message: "The Month page could use a week view.", page: "#schedule/month" });

  it("takes the feedback a real person came to give", async () => {
    process.env.DEMO_READ_ONLY = "on";
    const app = await freshApp();
    const res = await send(await demoAgent(app));
    expect(res.body?.code, "the lock exempts feedback on purpose").not.toBe("demo-read-only");
    expect(res.status).toBe(201);
  });

  it("stops being a way to fill somebody's inbox", async () => {
    const app = await freshApp();
    const agent = await demoAgent(app);
    let at = -1;
    for (let i = 0; i < 20 && at < 0; i += 1) if ((await send(agent)).status === 429) at = i + 1;
    expect(at, "an unlimited route never refuses").toBeGreaterThan(0);
    expect(at, "ten an hour, then the refusal").toBeLessThanOrEqual(11);
  });
});

describe("the Stripe pair, whose cost is not money", () => {
  /* Creating a checkout session charges nobody. It spends BuildFlow's Stripe API budget, which Stripe
     meters per ACCOUNT — so a flood here is a real customer's checkout failing a moment later. Checkout
     is anonymous: "allow" on purpose, because people buy from the pricing page before they sign up, so
     this is one of the few routes with genuinely no session in front of it. */
  const checkout = (app: Awaited<ReturnType<typeof createApp>>) =>
    request(app).post("/api/billing/checkout").send({ plan: "pro", period: "monthly" });

  it("lets a buyer through, and they may change their mind a few times", async () => {
    const app = await freshApp();
    for (let i = 0; i < 3; i += 1) expect((await checkout(app)).status, `attempt ${i + 1}`).toBeLessThan(400);
  });

  it("stops a flood of session creations", async () => {
    const app = await freshApp();
    let at = -1;
    for (let i = 0; i < 40 && at < 0; i += 1) if ((await checkout(app)).status === 429) at = i + 1;
    expect(at, "an unlimited route never refuses").toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(21);
  });

  it("NEVER limits the webhook, because a 429 to Stripe is a payment that never arrives", async () => {
    /* The case that protects a decision rather than a behaviour. Stripe is the caller and it retries;
       capping it would drop events on the floor, and entitlement comes from nowhere else. A later sweep
       that rate-limits every POST would break paying customers silently, and this is what would object.
       Without a signature these answer 400 — the point is that none of them answers 429. */
    const app = await freshApp();
    const statuses: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const res = await request(app).post("/api/billing/webhook").set("Content-Type", "application/json").send("{}");
      statuses.push(res.status);
    }
    expect(
      statuses.filter((s) => s === 429),
      "Stripe must never be told to come back later"
    ).toHaveLength(0);
  });
});
