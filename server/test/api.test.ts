import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function testApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-test-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  // The operational routes are auth-gated, so sign in as the seeded demo account
  // and return a cookie-persisting agent. The demo org maps to the seeded main
  // store, so tests see the same seed data they did before the auth gate existed.
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("BuildFlow API", () => {
  it("redirects the API root to the BuildFlow client", async () => {
    const agent = await testApp();

    await agent.get("/").expect(302).expect("Location", "http://localhost:5175/");
  });

  it("returns seeded bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent.get("/api/bootstrap").expect(200);

    expect(response.body.projects).toHaveLength(5);
    expect(response.body.crews).toHaveLength(6);
    expect(response.body.activeUser.role).toBe("Project Manager");
  });

  it("asks for a session whatever case the path is written in", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-case-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });

    // Express matches routes case-insensitively unless told otherwise, and the gate compares
    // against lowercase literals — so `/API/bootstrap` was one route to the router and a
    // different string to the gate. It answered 200 with the whole workspace and no cookie.
    for (const path of ["/api/bootstrap", "/API/bootstrap", "/Api/Bootstrap", "/api/BOOTSTRAP"]) {
      await request(app).get(path).expect(401);
    }
    // and the writes behind the same door
    for (const path of ["/api/schedule/assign", "/API/schedule/assign", "/Api/Schedule/Assign"]) {
      await request(app).post(path).send({}).expect(401);
    }
    // the one gated prefix with capitals of its own still works both ways round
    await request(app).get("/api/delayIQs").expect(401);
    await request(app).get("/api/delayiqs").expect(401);

    // and a signed-in caller still reaches the route it was registered as
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    await agent.get("/api/bootstrap").expect(200);
    await agent.get("/api/delayIQs").expect(200);
  });

  it("rejects unknown business profiles", async () => {
    const agent = await testApp();

    await agent.post("/api/business-profile").send({ businessType: "Solar" }).expect(400);
  });

  it("validates signup per field: company and terms are required, common passwords are refused, duplicates say so", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-signup-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    const good = {
      email: "dana@asphaltco.com",
      password: "Roller-Tack-2026",
      name: "Dana Brooks",
      orgName: "Asphalt Co",
      acceptTerms: true
    };

    const noCompany = await agent
      .post("/api/auth/signup")
      .send({ ...good, orgName: "" })
      .expect(400);
    expect(noCompany.body.field).toBe("company");

    const noTerms = await agent
      .post("/api/auth/signup")
      .send({ ...good, acceptTerms: false })
      .expect(400);
    expect(noTerms.body.field).toBe("terms");

    const common = await agent
      .post("/api/auth/signup")
      .send({ ...good, password: "password123" })
      .expect(400);
    expect(common.body).toMatchObject({ field: "password", code: "weak_password" });

    const ownEmail = await agent
      .post("/api/auth/signup")
      .send({ ...good, password: "dana@asphaltco" })
      .expect(400);
    expect(ownEmail.body.field).toBe("password");

    const created = await agent.post("/api/auth/signup").send(good).expect(201);
    expect(created.body.account.acceptedTermsAt).toBeTruthy();
    expect(created.body.org.name).toBe("Asphalt Co");

    const dup = await agent
      .post("/api/auth/signup")
      .send({ ...good, email: "DANA@asphaltco.com" })
      .expect(409);
    expect(dup.body).toMatchObject({ field: "email", code: "email_taken" });
  });

  it("records the plan, add-ons and seats on the org and runs paid plans as a dated trial", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-setup-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);

    // Paid plan, two add-ons, eight seats → all on the org, plus a 14-day trial.
    const setup = await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "business", selectedProducts: ["map-field-ops", "time-cards"], seats: 8 })
      .expect(200);
    expect(setup.body).toMatchObject({
      selectedPlan: "business",
      selectedProducts: ["map-field-ops", "time-cards"],
      seats: 8,
      billingStatus: "trial"
    });
    const trialEnd = new Date(setup.body.trialEndsAt).getTime();
    expect(trialEnd - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(trialEnd - Date.now()).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);

    // It comes back on a plain bootstrap (another device would see the same).
    const again = await agent.get("/api/bootstrap").expect(200);
    expect(again.body).toMatchObject({ selectedPlan: "business", seats: 8, billingStatus: "trial" });
    expect(again.body.trialEndsAt).toBe(setup.body.trialEndsAt);

    // The org record carries the plan label too.
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.org.plan).toBe("Business");

    // Dropping to Free ends the trial; no add-ons is a valid choice.
    const free = await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
      .expect(200);
    expect(free.body).toMatchObject({ selectedPlan: "free", selectedProducts: [], seats: 3, billingStatus: "free", trialEndsAt: null });

    // An unknown add-on id is refused rather than stored.
    await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedProducts: ["not-a-product"] })
      .expect(400);
  });

  it("confirms an email from the emailed link and resets a password from another", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-auth-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    const good = {
      email: "dana@asphaltco.com",
      password: "Roller-Tack-2026",
      name: "Dana Brooks",
      orgName: "Asphalt Co",
      acceptTerms: true
    };
    const created = await agent.post("/api/auth/signup").send(good).expect(201);
    expect(created.body.account.emailVerifiedAt).toBeNull();

    // ── verification: the link's token confirms the address exactly once
    const sent = await agent.post("/api/auth/verify/request").expect(200);
    expect(sent.body.debugToken).toBeTruthy();
    await request(app).post("/api/auth/verify").send({ token: "not-a-real-token" }).expect(400);
    const verified = await request(app).post("/api/auth/verify").send({ token: sent.body.debugToken }).expect(200);
    expect(verified.body.account.emailVerifiedAt).toBeTruthy();
    await request(app).post("/api/auth/verify").send({ token: sent.body.debugToken }).expect(400); // used
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.account.emailVerifiedAt).toBeTruthy();
    const boot = await agent.get("/api/bootstrap").expect(200);
    expect(boot.body.account).toMatchObject({ email: "dana@asphaltco.com" });
    expect(boot.body.account.emailVerifiedAt).toBeTruthy();

    // ── forgot password: unknown emails get the same 200 as known ones
    const unknown = await request(app).post("/api/auth/reset/request").send({ email: "nobody@asphaltco.com" }).expect(200);
    expect(unknown.body.debugToken).toBeUndefined();
    const reset = await request(app).post("/api/auth/reset/request").send({ email: "DANA@asphaltco.com" }).expect(200);
    expect(reset.body.debugToken).toBeTruthy();

    // a weak new password is refused but hands back a fresh token
    const weak = await request(app).post("/api/auth/reset").send({ token: reset.body.debugToken, password: "password123" }).expect(400);
    expect(weak.body).toMatchObject({ field: "password", code: "weak_password" });
    expect(weak.body.token).toBeTruthy();
    await request(app).post("/api/auth/reset").send({ token: reset.body.debugToken, password: "Screed-Hand-2026" }).expect(400); // consumed

    const fresh = request.agent(app);
    const done = await fresh.post("/api/auth/reset").send({ token: weak.body.token, password: "Screed-Hand-2026" }).expect(200);
    expect(done.body.account.email).toBe("dana@asphaltco.com");
    await fresh.get("/api/auth/me").expect(200); // signed in by the reset
    await agent.get("/api/auth/me").expect(401); // every older session is out

    await request(app).post("/api/auth/login").send({ email: good.email, password: good.password }).expect(401);
    await request(app).post("/api/auth/login").send({ email: good.email, password: "Screed-Hand-2026" }).expect(200);
  });

  it("locks an email after five wrong passwords and throttles signups per address", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-limits-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const good = {
      email: "dana@asphaltco.com",
      password: "Roller-Tack-2026",
      name: "Dana Brooks",
      orgName: "Asphalt Co",
      acceptTerms: true
    };
    await request(app).post("/api/auth/signup").send(good).expect(201);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: good.email, password: "wrong-pass-" + i })
        .expect(401);
    }
    const locked = await request(app).post("/api/auth/login").send({ email: good.email, password: good.password }).expect(429);
    expect(locked.headers["retry-after"]).toBeTruthy();
    expect(locked.body.error).toMatch(/Too many sign-in attempts/);

    // signup is capped per IP: the limiter answers before validation does
    for (let i = 0; i < 9; i += 1) {
      await request(app)
        .post("/api/auth/signup")
        .send({ ...good, email: `crew${i}@asphaltco.com`, orgName: `Crew ${i}` })
        .expect(201);
    }
    const capped = await request(app)
      .post("/api/auth/signup")
      .send({ ...good, email: "crew99@asphaltco.com" })
      .expect(429);
    expect(capped.body.retryAfterSec).toBeGreaterThan(0);
  });

  it("invites teammates: held until the owner confirms their email, then accepted into the workspace", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-team-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const owner = request.agent(app);
    await owner
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    await owner
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
      .expect(200);

    // Unverified owner: invites are stored but held.
    const held = await owner
      .post("/api/team/invites")
      .send({
        invites: [
          { email: "sam@asphaltco.com", role: "Superintendent" },
          { email: "dana@asphaltco.com", role: "Crew Lead" }
        ]
      })
      .expect(201);
    expect(held.body.results).toEqual([
      { email: "sam@asphaltco.com", status: "held", reason: "Goes out when you confirm your email." },
      { email: "dana@asphaltco.com", status: "skipped", reason: "Already has a BuildFlow account." }
    ]);
    const team = await owner.get("/api/team").expect(200);
    expect(team.body.emailVerified).toBe(false);
    expect(team.body.invites).toHaveLength(1);
    expect(team.body.invites[0].sentAt).toBeNull();
    await owner.post(`/api/team/invites/${team.body.invites[0].id}/resend`).expect(403);

    // Confirming the owner's email releases the held invite (a fresh token is minted).
    const sent = await owner.post("/api/auth/verify/request").expect(200);
    await request(app).post("/api/auth/verify").send({ token: sent.body.debugToken }).expect(200);
    const after = await owner.get("/api/team").expect(200);
    expect(after.body.emailVerified).toBe(true);
    expect(after.body.invites[0].sentAt).toBeTruthy();

    // Resend hands back a link token in test mode… via refresh; use the store to read it back
    const resent = await owner.post(`/api/team/invites/${after.body.invites[0].id}/resend`).expect(200);
    expect(resent.body.ok).toBe(true);

    // Peek + accept from the invited person's side. Grab the token through the store (no email in tests).
    const mainStore = (app.locals.storeManager as { main: { all: <T>(sql: string) => T[]; inviteByToken: (t: string) => unknown } }).main;
    const rows = mainStore.all<{ id: string; tokenHash: string }>("SELECT id, tokenHash FROM invites");
    expect(rows).toHaveLength(1);
    await request(app).get("/api/auth/invite/not-a-token").expect(404);
    // The raw token is not recoverable from its hash; accept by creating a known one through refresh-with-token path:
    const { refreshInvite } = mainStore as unknown as {
      refreshInvite: (id: string, orgId: string, ttl: number) => { token: string } | undefined;
    };
    const orgId = (await owner.get("/api/auth/me").expect(200)).body.org.id as string;
    const fresh = refreshInvite.call(mainStore, rows[0].id, orgId, 60_000)!;
    const preview = await request(app)
      .get(`/api/auth/invite/${encodeURIComponent(fresh.token)}`)
      .expect(200);
    expect(preview.body).toMatchObject({
      email: "sam@asphaltco.com",
      role: "Superintendent",
      orgName: "Asphalt Co",
      inviterName: "Dana Brooks"
    });

    const sam = request.agent(app);
    await sam
      .post("/api/auth/invite/accept")
      .send({ token: fresh.token, name: "Sam Ortiz", password: "password123", acceptTerms: true })
      .expect(400);
    const joined = await sam
      .post("/api/auth/invite/accept")
      .send({ token: fresh.token, name: "Sam Ortiz", password: "Paver-Screed-2026", acceptTerms: true })
      .expect(201);
    expect(joined.body.account).toMatchObject({ email: "sam@asphaltco.com", orgId, role: "member" });
    expect(joined.body.account.emailVerifiedAt).toBeTruthy();
    await request(app)
      .get(`/api/auth/invite/${encodeURIComponent(fresh.token)}`)
      .expect(404); // accepted

    // Sam is a real person in Dana's workspace with the invited role, and lands past onboarding.
    const samBoot = await sam.get("/api/bootstrap").expect(200);
    expect(samBoot.body.activeUser).toMatchObject({ name: "Sam Ortiz", role: "Superintendent", isSample: false });
    expect(samBoot.body.onboardingCompletedAt).toBeTruthy();
    expect(samBoot.body.users.some((user: { name: string }) => user.name === "Dana Brooks")).toBe(true);
    const ownerTeam = await owner.get("/api/team").expect(200);
    expect(ownerTeam.body.invites).toHaveLength(0);

    // The owner sets roles; the teammate cannot, and nonsense roles are refused.
    expect(ownerTeam.body.canManage).toBe(true);
    const samRow = ownerTeam.body.users.find((user: { name: string }) => user.name === "Sam Ortiz");
    const promoted = await owner.patch(`/api/team/users/${samRow.id}`).send({ role: "Project Manager" }).expect(200);
    expect(promoted.body.user).toMatchObject({ id: samRow.id, role: "Project Manager", title: "Project Manager" });
    await owner.patch(`/api/team/users/${samRow.id}`).send({ role: "Boss" }).expect(400);
    await owner.patch("/api/team/users/nobody").send({ role: "Crew Lead" }).expect(404);
    expect((await sam.get("/api/team").expect(200)).body.canManage).toBe(false);
    await sam.patch(`/api/team/users/${samRow.id}`).send({ role: "Crew Lead" }).expect(403);
    expect((await sam.get("/api/bootstrap").expect(200)).body.activeUser.role).toBe("Project Manager");

    // Sample teammates can be removed; real people cannot (from here).
    const sample = ownerTeam.body.users.find((user: { isSample: boolean }) => user.isSample);
    await owner.delete(`/api/team/users/${sample.id}`).expect(204);
    const samUser = ownerTeam.body.users.find((user: { name: string }) => user.name === "Sam Ortiz");
    await owner.delete(`/api/team/users/${samUser.id}`).expect(400);

    // Revoke: a new held invite disappears.
    const more = await owner
      .post("/api/team/invites")
      .send({ invites: [{ email: "lee@asphaltco.com", role: "Crew Lead" }] })
      .expect(201);
    await owner.delete(`/api/team/invites/${more.body.invites[0].id}`).expect(204);
    expect((await owner.get("/api/team").expect(200)).body.invites).toHaveLength(0);
  });

  it("renames the company and changes the account email with re-verification", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-edits-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    const sent = await agent.post("/api/auth/verify/request").expect(200);
    await request(app).post("/api/auth/verify").send({ token: sent.body.debugToken }).expect(200);

    const renamed = await agent.patch("/api/org").send({ name: "Asphalt Co of Texas" }).expect(200);
    expect(renamed.body.org.name).toBe("Asphalt Co of Texas");
    await agent.patch("/api/org").send({ name: "A" }).expect(400);

    const name = await agent.patch("/api/auth/account").send({ name: "Dana B. Brooks" }).expect(200);
    expect(name.body.account.name).toBe("Dana B. Brooks");
    expect(name.body.verificationSent).toBe(false);
    const boot = await agent.get("/api/bootstrap").expect(200);
    expect(boot.body.activeUser.name).toBe("Dana B. Brooks");

    const email = await agent.patch("/api/auth/account").send({ email: "dana@asphaltco.net" }).expect(200);
    expect(email.body.account.email).toBe("dana@asphaltco.net");
    expect(email.body.account.emailVerifiedAt).toBeNull();
    expect(email.body.verificationSent).toBe(true);
    await request(app).post("/api/auth/login").send({ email: "dana@asphaltco.net", password: "Roller-Tack-2026" }).expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.demo).toBe(false);
  });

  it("issues a persistent cookie by default and a browser-session cookie when not remembered", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-cookie-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const good = {
      email: "dana@asphaltco.com",
      password: "Roller-Tack-2026",
      name: "Dana Brooks",
      orgName: "Asphalt Co",
      acceptTerms: true
    };

    // signup honours remember=false: no Max-Age → the browser drops it on close
    const shortLived = await request(app)
      .post("/api/auth/signup")
      .send({ ...good, remember: false })
      .expect(201);
    const signupCookie = String(shortLived.headers["set-cookie"]?.[0] ?? "");
    expect(signupCookie).toMatch(/^bf_session=/);
    expect(signupCookie).toMatch(/HttpOnly/i);
    expect(signupCookie).toMatch(/SameSite=Lax/i);
    expect(signupCookie).not.toMatch(/Max-Age/i);

    // login defaults to the 30-day cookie
    const persistent = await request(app).post("/api/auth/login").send({ email: good.email, password: good.password }).expect(200);
    const loginCookie = String(persistent.headers["set-cookie"]?.[0] ?? "");
    expect(loginCookie).toMatch(/Max-Age=2592000/);

    // and the body never leaks the hash or the token
    expect(JSON.stringify(persistent.body)).not.toMatch(/passwordHash|bf_session/);
    expect(persistent.body.demo).toBe(false);
  });

  it("keeps tutorial progress on the person, not the browser", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-tutorial-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    expect((await agent.get("/api/bootstrap").expect(200)).body.userSettings).toEqual({});

    await agent.put("/api/me/settings/tutorial:asphalt--free--core").send({ value: "skipped" }).expect(200);
    await agent.put("/api/me/settings/bad key!").send({ value: "x" }).expect(400);
    await agent.put("/api/me/settings/tutorial:asphalt--free--core").send({ value: 42 }).expect(400);

    // A second device is just a second session on the same login: same answer.
    const other = request.agent(app);
    await other.post("/api/auth/login").send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026" }).expect(200);
    const boot = await other.get("/api/bootstrap").expect(200);
    expect(boot.body.userSettings).toEqual({ "tutorial:asphalt--free--core": "skipped" });

    // Settings are per person: a teammate does not inherit them.
    await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 2 })
      .expect(200);
    const sent = await agent.post("/api/auth/verify/request").expect(200);
    await request(app).post("/api/auth/verify").send({ token: sent.body.debugToken }).expect(200);
    await agent
      .post("/api/team/invites")
      .send({ invites: [{ email: "sam@asphaltco.com", role: "Crew Lead" }] })
      .expect(201);
    const mainStore = (
      app.locals.storeManager as {
        main: { all: <T>(sql: string) => T[]; refreshInvite: (id: string, orgId: string, ttl: number) => { token: string } | undefined };
      }
    ).main;
    const [row] = mainStore.all<{ id: string }>("SELECT id FROM invites");
    const orgId = (await agent.get("/api/auth/me").expect(200)).body.org.id as string;
    const { token } = mainStore.refreshInvite(row.id, orgId, 60_000)!;
    const sam = request.agent(app);
    await sam
      .post("/api/auth/invite/accept")
      .send({ token, name: "Sam Ortiz", password: "Paver-Screed-2026", acceptTerms: true })
      .expect(201);
    expect((await sam.get("/api/bootstrap").expect(200)).body.userSettings).toEqual({});
  });

  it("reports an ended trial and lets the owner drop to Free or head to checkout from Settings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-trial-end-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    await agent
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "pro", selectedProducts: [], seats: 4 })
      .expect(200);
    expect((await agent.get("/api/bootstrap").expect(200)).body.billingStatus).toBe("trial");

    // Time passes: the trial clock is a workspace setting, so wind it back.
    const orgId = (await agent.get("/api/auth/me").expect(200)).body.org.id as string;
    const manager = app.locals.storeManager as {
      getOrgStore: (id: string) => Promise<{ setWorkspaceSetting: (k: string, v: string) => void }>;
    };
    (await manager.getOrgStore(orgId)).setWorkspaceSetting("trialEndsAt", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const ended = await agent.get("/api/bootstrap").expect(200);
    expect(ended.body.billingStatus).toBe("trial_expired");

    // Settings → "Add a payment method": checkout knows to come back to Settings (Stripe is not configured here, so it says so).
    const checkout = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "pro", period: "monthly", seats: 4, returnTo: "settings", origin: "http://localhost:5432" })
      .expect(200);
    expect(checkout.body.configured).toBe(false);
    await request(app).post("/api/billing/checkout").send({ plan: "pro", period: "monthly", returnTo: "elsewhere" }).expect(400);

    // Settings → "Switch to Free": the trial ends with the plan.
    const free = await agent.post("/api/business-profile").send({ businessType: "Asphalt", selectedPlan: "free", seats: 4 }).expect(200);
    expect(free.body).toMatchObject({ selectedPlan: "free", billingStatus: "free", trialEndsAt: null });
  });

  it("seeds a populated starter workspace when a new account picks its trade", async () => {
    // A brand-new account, not the shared demo — its own empty, isolated workspace.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-seed-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);

    // Fresh signup starts blank — this is what used to be all a real account ever had.
    const empty = await agent.get("/api/bootstrap").expect(200);
    expect(empty.body.projects).toEqual([]);
    expect(empty.body.jobs).toEqual([]);
    // …but the owner is already a person in it, and onboarding is not done yet.
    expect(empty.body.onboardingCompletedAt).toBeNull();
    expect(empty.body.users).toHaveLength(1);
    expect(empty.body.activeUser).toMatchObject({
      name: "Dana Brooks",
      title: "Owner",
      role: "Project Manager",
      avatar: "DB",
      isSample: false
    });
    expect(empty.body.activeUser.accountId).toBeTruthy();

    // Picking a trade during onboarding seeds a realistic starter workspace for it.
    const seeded = await agent.post("/api/business-profile").send({ businessType: "Asphalt" }).expect(200);
    expect(seeded.body.projects.length).toBeGreaterThan(0);
    expect(seeded.body.jobs.length).toBeGreaterThan(0);
    expect(seeded.body.crews.length).toBeGreaterThan(0);
    // Picking the trade completes onboarding; the owner stays the active user and
    // the seeded teammates are marked as samples.
    expect(seeded.body.onboardingCompletedAt).toBeTruthy();
    expect(seeded.body.activeUser.name).toBe("Dana Brooks");
    const samples = seeded.body.users.filter((user: { isSample: boolean }) => user.isSample);
    expect(samples.length).toBeGreaterThan(0);
    expect(seeded.body.users.some((user: { accountId?: string | null }) => Boolean(user.accountId))).toBe(true);

    // It persists across a reload — the whole point of the fix.
    const reload = await agent.get("/api/bootstrap").expect(200);
    expect(reload.body.projects.length).toBe(seeded.body.projects.length);

    // And re-running onboarding must NEVER wipe real work: a second apply is a no-op
    // that preserves what's there rather than clearing it.
    const before = reload.body.projects.length;
    const again = await agent.post("/api/business-profile").send({ businessType: "Concrete" }).expect(200);
    expect(again.body.projects.length).toBe(before);
  });

  it("keeps project, job, crew, and material endpoints usable after a blank workspace is applied", async () => {
    const agent = await testApp();
    await agent.post("/api/business-profile").send({ businessType: "Asphalt" }).expect(200);

    const project = await agent
      .post("/api/projects")
      .send({
        name: "Airport Asphalt Repair",
        location: "Austin, TX",
        address: "3600 Presidential Blvd, Austin, TX 78719",
        type: "Asphalt",
        contractType: "Unit Price",
        managerId: "u-matt",
        targetCompletion: "2026-09-18",
        percentComplete: 0,
        status: "Not Started",
        scheduleHealth: "On Track"
      })
      .expect(201);

    const job = await agent
      .post("/api/jobs")
      .send({
        projectId: project.body.id,
        name: "Airport Asphalt Repair",
        phase: "Night Paving",
        location: "Austin, TX",
        startDate: "2026-06-21",
        endDate: "2026-06-21",
        startTime: "8:00 PM",
        endTime: "3:00 AM",
        requiredLabor: 6,
        requiredEquipment: "Asphalt Paver",
        materialsStatus: "Ordered",
        status: "Planned",
        priority: "High",
        notes: "Created after profile replacement."
      })
      .expect(201);

    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Night Paving Crew",
        specialty: "Asphalt Paving",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Rakers", count: 3 },
          { category: "Operator", role: "Paver Operator", count: 1 }
        ]
      })
      .expect(201);

    await agent
      .post("/api/equipment")
      .send({
        name: "Paver 1",
        type: "Asphalt Paver",
        status: "Available",
        assignedTo: project.body.id
      })
      .expect(201);

    await agent
      .post("/api/materials")
      .send({
        projectId: project.body.id,
        name: "Night Shift HMA",
        status: "Ordered",
        deliveryDate: "2026-06-21",
        quantity: "80 tons"
      })
      .expect(201);

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: job.body.id,
        crewId: crew.body.id,
        date: "2026-06-21",
        status: "Planned"
      })
      .expect(201);

    expect(assignment.body.jobId).toBe(job.body.id);

    await agent
      .post("/api/field-updates")
      .send({
        projectId: project.body.id,
        jobId: job.body.id,
        userId: "u-matt",
        message: "Night paving setup entered from scratch.",
        status: "On Site"
      })
      .expect(201);

    await agent
      .post("/api/delayIQs")
      .send({
        projectId: project.body.id,
        category: "Traffic control",
        title: "Lane closure moved",
        impactDays: 1,
        severity: "Medium",
        status: "Open",
        description: "Permit window moved after workspace setup."
      })
      .expect(201);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.materials).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Night Shift HMA" })]));
    expect(bootstrap.body.equipment).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Paver 1" })]));
    expect(bootstrap.body.fieldUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: "Night paving setup entered from scratch." })])
    );
    expect(bootstrap.body.delayIQs).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Lane closure moved" })]));
  });

  it("updates projects and persists them in bootstrap data", async () => {
    const agent = await testApp();
    const update = {
      name: "Riverside Office Tower",
      location: "Downtown Austin, TX",
      address: "123 Riverfront Blvd, Austin, TX 78701",
      type: "Commercial",
      contractType: "GMP",
      managerId: "u-jessica",
      targetCompletion: "2026-09-18",
      percentComplete: 72,
      status: "In Progress",
      scheduleHealth: "Monitor"
    };

    const response = await agent.patch("/api/projects/p-riverside").send(update).expect(200);

    expect(response.body).toMatchObject(update);
    expect(response.body.slug).toBe("riverside-office");
    expect(response.body.image).toBe("office-building");

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "p-riverside", name: "Riverside Office Tower" })])
    );
  });

  it("creates projects and persists them in bootstrap data", async () => {
    const agent = await testApp();
    const input = {
      name: "South Austin Retail Center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      status: "Not Started",
      scheduleHealth: "On Track"
    };

    const response = await agent.post("/api/projects").send(input).expect(201);

    expect(response.body).toMatchObject(input);
    expect(response.body.id).toMatch(/^p-south-austin-retail-center-/);
    expect(response.body.slug).toBe("south-austin-retail-center");
    expect(response.body.image).toBe("office-building");
    expect(response.body.latitude).toBe(30.2672);
    expect(response.body.longitude).toBe(-97.7431);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: response.body.id, name: "South Austin Retail Center" })])
    );
  });

  it("rejects invalid project creation", async () => {
    const agent = await testApp();
    const validProject = {
      name: "South Austin Retail Center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      status: "Not Started",
      scheduleHealth: "On Track"
    };

    for (const invalidProject of [
      { ...validProject, name: "" },
      { ...validProject, location: "" },
      { ...validProject, percentComplete: 101 },
      { ...validProject, percentComplete: 10.5 },
      { ...validProject, status: "Blocked" },
      { ...validProject, scheduleHealth: "Behind" },
      { ...validProject, managerId: "u-carlos" },
      { ...validProject, managerId: "missing-user" }
    ]) {
      await agent.post("/api/projects").send(invalidProject).expect(400);
    }
  });

  it("returns 404 for unknown project updates", async () => {
    const agent = await testApp();

    await agent
      .patch("/api/projects/missing-project")
      .send({
        name: "Missing Project",
        location: "Austin, TX",
        address: "1 Example Way",
        type: "Commercial",
        contractType: "GMP",
        managerId: "u-matt",
        targetCompletion: "2026-09-18",
        percentComplete: 72,
        status: "In Progress",
        scheduleHealth: "Monitor"
      })
      .expect(404);
  });

  it("rejects invalid project updates", async () => {
    const agent = await testApp();
    const validProject = {
      name: "Riverside Office Tower",
      location: "Downtown Austin, TX",
      address: "123 Riverfront Blvd, Austin, TX 78701",
      type: "Commercial",
      contractType: "GMP",
      managerId: "u-matt",
      targetCompletion: "2026-09-18",
      percentComplete: 72,
      status: "In Progress",
      scheduleHealth: "Monitor"
    };

    for (const invalidProject of [
      { ...validProject, name: "" },
      { ...validProject, percentComplete: 101 },
      { ...validProject, percentComplete: 72.5 },
      { ...validProject, status: "Blocked" },
      { ...validProject, managerId: "u-carlos" },
      { ...validProject, managerId: "missing-user" }
    ]) {
      await agent.patch("/api/projects/p-riverside").send(invalidProject).expect(400);
    }
  });

  it("asks before double-booking a crew, and books anyway with the notes when told to", async () => {
    const agent = await testApp();
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const booked = bootstrap.body.assignments.find(
      (a: { crewId: string; jobId: string; date: string }) => a.crewId === "crew-concrete" && a.jobId === "j-riverside-concrete"
    );
    expect(booked).toBeDefined();

    // Same crew, different job, same day → 409 with the clash, nothing written
    const clash = await agent
      .post("/api/schedule/assign")
      .send({ jobId: "j-pinecrest-foundation", crewId: "crew-concrete", date: booked.date })
      .expect(409);
    expect(clash.body.code).toBe("conflict");
    expect(clash.body.error).toMatch(/Concrete Crew 1 is on .* that day/);
    expect(clash.body.clashes[0]).toMatchObject({
      crewId: "crew-concrete",
      jobId: "j-riverside-concrete",
      movingJobId: "j-pinecrest-foundation"
    });
    expect((await agent.get("/api/bootstrap")).body.assignments).toHaveLength(bootstrap.body.assignments.length);

    // The planner chooses to: booked, with both notes (Pinecrest's materials aren't ready either)
    const response = await agent
      .post("/api/schedule/assign")
      .send({ jobId: "j-pinecrest-foundation", crewId: "crew-concrete", date: booked.date, force: true })
      .expect(201);
    expect(response.body.conflicts).toContain("Double-booked crew");
    expect(response.body.conflicts).toContain("Missing materials");

    // Moving a booking onto a taken crew-day asks the same way
    await agent.patch(`/api/schedule/${response.body.id}`).send({ date: booked.date }).expect(409);
    await agent.patch(`/api/schedule/${response.body.id}`).send({ date: booked.date, force: true }).expect(200);
  });

  it("re-books a set of moves in one transaction: all of it, or none of it", async () => {
    const agent = await testApp();
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const booked = bootstrap.body.assignments.find(
      (a: { crewId: string; jobId: string; date: string }) => a.crewId === "crew-concrete" && a.jobId === "j-riverside-concrete"
    );
    const count = bootstrap.body.assignments.length;
    const shift = (iso: string, days: number) => {
      const date = new Date(`${iso}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const freeDay = shift(booked.date, 30);

    // an unknown id anywhere in the batch → nothing changes
    await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          { op: "move", id: booked.id, date: freeDay },
          { op: "unbook", id: "as-nope" }
        ]
      })
      .expect(404);
    const untouched = await agent.get("/api/bootstrap").expect(200);
    expect(untouched.body.assignments.find((a: { id: string }) => a.id === booked.id).date).toBe(booked.date);

    // a clash anywhere in the batch → 409 with who is already there, nothing changes
    const clash = await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "book", jobId: "j-pinecrest-foundation", crewId: "crew-concrete", date: booked.date }] })
      .expect(409);
    expect(clash.body.code).toBe("conflict");
    expect(clash.body.clashes[0]).toMatchObject({
      crewName: "Concrete Crew 1",
      jobId: "j-riverside-concrete",
      movingJobId: "j-pinecrest-foundation"
    });
    expect((await agent.get("/api/bootstrap")).body.assignments).toHaveLength(count);

    // move the crew off that day, book the other job onto it and set the job's dates — one request, one transaction
    const ok = await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          { op: "move", id: booked.id, date: freeDay },
          { op: "book", jobId: "j-pinecrest-foundation", crewId: "crew-concrete", date: booked.date },
          { op: "job", id: "j-pinecrest-foundation", startDate: booked.date, endDate: booked.date }
        ]
      })
      .expect(200);
    expect(ok.body.assignments).toHaveLength(2);
    expect(ok.body.assignments.find((a: { id: string }) => a.id === booked.id).date).toBe(freeDay);
    const pinecrest = ok.body.assignments.find((a: { jobId: string }) => a.jobId === "j-pinecrest-foundation");
    expect(pinecrest.conflicts).not.toContain("Double-booked crew");
    expect(ok.body.jobs[0]).toMatchObject({ id: "j-pinecrest-foundation", startDate: booked.date, endDate: booked.date });
    expect(ok.body.clashes).toEqual([]);
    expect((await agent.get("/api/bootstrap")).body.assignments).toHaveLength(count + 1);

    // forced, a clash books anyway and carries the note; unbook drops it again
    const forced = await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "book", jobId: "j-pinecrest-foundation", crewId: "crew-concrete", date: freeDay }], force: true })
      .expect(200);
    expect(forced.body.assignments[0].conflicts).toContain("Double-booked crew");
    expect(forced.body.clashes).toHaveLength(1);
    const dropped = await agent
      .post("/api/schedule/rebook")
      .send({ moves: [{ op: "unbook", id: forced.body.assignments[0].id }] })
      .expect(200);
    expect(dropped.body.removed).toEqual([forced.body.assignments[0].id]);
  });

  it("gives a booking its job's status, and keeps it when the job changes", async () => {
    const agent = await testApp();
    const job = await agent
      .post("/api/jobs")
      .send({
        projectId: "p-riverside",
        name: "Status Follows Job",
        phase: "Concrete - Status",
        location: "Downtown, Austin",
        startDate: "2026-06-23",
        endDate: "2026-06-23",
        startTime: "7:00 AM",
        endTime: "3:30 PM",
        requiredLabor: 4,
        requiredEquipment: "Line Pump",
        materialsStatus: "Ordered",
        status: "Planned",
        priority: "Normal",
        notes: ""
      })
      .expect(201);
    const booked = await agent
      .post("/api/schedule/assign")
      .send({ jobId: job.body.id, crewId: "crew-concrete", date: "2026-06-23" })
      .expect(201);
    expect(booked.body.status).toBe("Planned");

    await agent.patch(`/api/jobs/${job.body.id}`).send({ status: "In Progress" }).expect(200);
    const after = await agent.get("/api/bootstrap").expect(200);
    const bookings = after.body.assignments.filter((a: { jobId: string }) => a.jobId === job.body.id);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("In Progress");
  });

  it("gives crews an hourly rate: the one set, or the specialty's default", async () => {
    const agent = await testApp();
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    for (const crew of bootstrap.body.crews) expect(typeof crew.rate).toBe("number");
    const priced = await agent
      .post("/api/crews")
      .send({
        name: "Priced Crew",
        specialty: "Concrete",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }],
        rate: 101
      })
      .expect(201);
    expect(priced.body.rate).toBe(101);
    const defaulted = await agent
      .post("/api/crews")
      .send({
        name: "Default Crew",
        specialty: "Concrete",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }]
      })
      .expect(201);
    expect(defaulted.body.rate).toBe(88);
    const updated = await agent
      .patch(`/api/crews/${defaulted.body.id}`)
      .send({
        name: "Default Crew",
        specialty: "Concrete",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }],
        rate: 90
      })
      .expect(200);
    expect(updated.body.rate).toBe(90);

    // Zero is not a price. It used to be stored and then read as one, putting a whole week of
    // booked work on the board at $0; an empty field is how you ask for the default.
    const free = await agent
      .post("/api/crews")
      .send({
        name: "Free Crew",
        specialty: "Concrete",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }],
        rate: 0
      })
      .expect(400);
    expect(JSON.stringify(free.body)).toContain("more than $0");
    await agent
      .patch(`/api/crews/${defaulted.body.id}`)
      .send({
        name: "Default Crew",
        specialty: "Concrete",
        foreman: "Dana Brooks",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }],
        rate: 0
      })
      .expect(400);
    const after = await agent.get("/api/bootstrap").expect(200);
    expect(after.body.crews.find((crew: { id: string }) => crew.id === defaulted.body.id).rate).toBe(90);
    expect(after.body.crews.some((crew: { name: string }) => crew.name === "Free Crew")).toBe(false);
  });

  it("keeps the working week and holidays as org data", async () => {
    const agent = await testApp();
    const before = await agent.get("/api/bootstrap").expect(200);
    expect(before.body.workCalendar.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(before.body.workCalendar.holidays.length).toBeGreaterThan(0);
    const saved = await agent
      .put("/api/schedule/work-calendar")
      .send({
        workingDays: [1, 2, 3, 4, 5],
        holidays: [
          { date: "2027-07-05", name: "Independence Day (observed)" },
          { date: "2027-01-01", name: "New Year's Day" }
        ]
      })
      .expect(200);
    expect(saved.body.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(saved.body.holidays.map((h: { date: string }) => h.date)).toEqual(["2027-01-01", "2027-07-05"]);
    const after = await agent.get("/api/bootstrap").expect(200);
    expect(after.body.workCalendar).toEqual(saved.body);
    await agent.put("/api/schedule/work-calendar").send({ workingDays: [], holidays: [] }).expect(400);
  });

  it("serves a crew's bookings as a calendar feed a phone can subscribe to", async () => {
    const agent = await testApp();
    const feeds = await agent.get("/api/schedule/feeds").expect(200);
    const concrete = feeds.body.crews.find((c: { id: string }) => c.id === "crew-concrete");
    expect(concrete.url).toMatch(/\/api\/feeds\/.+\/crew-concrete\.ics\?key=/);
    const path = concrete.url.replace(/^https?:\/\/[^/]+/, "");
    // no cookie: the key in the link is the pass
    const ics = await request(agent.app).get(path).expect(200);
    expect(ics.headers["content-type"]).toMatch(/text\/calendar/);
    expect(ics.text).toContain("BEGIN:VCALENDAR");
    expect(ics.text).toContain("X-WR-CALNAME:BuildFlow · Concrete Crew 1");
    expect(ics.text).toMatch(/BEGIN:VEVENT[\s\S]*SUMMARY:[\s\S]*END:VEVENT/);
    await request(agent.app)
      .get(path.replace(/key=.*$/, "key=wrong"))
      .expect(403);
  });

  it("creates jobs and makes them available for schedule assignment", async () => {
    const agent = await testApp();
    const job = await agent
      .post("/api/jobs")
      .send({
        projectId: "p-riverside",
        name: "Custom Concrete Pour",
        phase: "Concrete - Custom Pour",
        location: "Downtown, Austin",
        startDate: "2026-06-16",
        endDate: "2026-06-16",
        startTime: "6:30 AM",
        endTime: "1:30 PM",
        requiredLabor: 7,
        requiredEquipment: "Line Pump",
        materialsStatus: "Ordered",
        status: "Confirmed",
        priority: "High",
        notes: "Created from schedule prompt."
      })
      .expect(201);

    expect(job.body.id).toMatch(/^job-custom-concrete-pour-/);
    expect(job.body.name).toBe("Custom Concrete Pour");

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: job.body.id,
        crewId: "crew-concrete",
        date: "2026-06-16",
        status: "Confirmed"
      })
      .expect(201);

    expect(assignment.body.jobId).toBe(job.body.id);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.jobs.some((item: { id: string }) => item.id === job.body.id)).toBe(true);
  });

  it("creates crews with computed size and returns them in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 2 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    expect(response.body.id).toMatch(/^crew-site-prep-crew-5-/);
    expect(response.body.lead).toBe("Dana Brooks");
    expect(response.body.size).toBe(4);
    expect(response.body.status).toBe("Available");
    expect(response.body.laborMix).toHaveLength(2);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Site Prep Crew 5", size: 4 })]));
  });

  it("rejects invalid crew creation input", async () => {
    const agent = await testApp();
    const validCrew = {
      name: "Site Prep Crew 5",
      specialty: "Site Prep",
      foreman: "Dana Brooks",
      laborMix: [{ category: "Labor", role: "Laborers", count: 2 }]
    };

    for (const invalidCrew of [
      { ...validCrew, foreman: "" },
      { ...validCrew, laborMix: [] },
      { ...validCrew, laborMix: [{ category: "Labor", role: "", count: 2 }] },
      { ...validCrew, laborMix: [{ category: "Operator", role: "Dozer Operator", count: 0 }] }
    ]) {
      await agent.post("/api/crews").send(invalidCrew).expect(400);
    }
  });

  it("creates equipment and returns it in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/equipment")
      .send({
        name: "Forklift #9",
        type: "Forklift",
        status: "In Use",
        assignedTo: "p-riverside"
      })
      .expect(201);

    expect(response.body.id).toMatch(/^eq-forklift-9-/);
    expect(response.body).toMatchObject({
      name: "Forklift #9",
      type: "Forklift",
      status: "In Use",
      assignedTo: "p-riverside"
    });

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.equipment).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Forklift #9", type: "Forklift" })]));
  });

  it("rejects invalid equipment creation input", async () => {
    const agent = await testApp();
    const validEquipment = {
      name: "Forklift #9",
      type: "Forklift",
      status: "Available"
    };

    for (const invalidEquipment of [
      { ...validEquipment, name: "" },
      { ...validEquipment, type: "" },
      { ...validEquipment, status: "Missing" }
    ]) {
      await agent.post("/api/equipment").send(invalidEquipment).expect(400);
    }
  });

  it("updates and deletes equipment", async () => {
    const agent = await testApp();
    const created = await agent
      .post("/api/equipment")
      .send({
        name: "Forklift #9",
        type: "Forklift",
        status: "Available"
      })
      .expect(201);

    const updated = await agent
      .patch(`/api/equipment/${created.body.id}`)
      .send({
        name: "Forklift #10",
        type: "Forklift",
        status: "Maintenance",
        assignedTo: "p-riverside"
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      name: "Forklift #10",
      type: "Forklift",
      status: "Maintenance",
      assignedTo: "p-riverside"
    });

    await agent.delete(`/api/equipment/${created.body.id}`).expect(204);
    await agent.patch(`/api/equipment/${created.body.id}`).send(updated.body).expect(404);
    await agent.delete(`/api/equipment/${created.body.id}`).expect(404);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.equipment).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
  });

  it("creates materials and returns them in bootstrap data", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/materials")
      .send({
        projectId: "p-riverside",
        name: "Structural Steel Beams",
        status: "Ordered",
        deliveryDate: "2026-06-28",
        quantity: "24 bundles"
      })
      .expect(201);

    expect(response.body.id).toMatch(/^mat-structural-steel-beams-/);
    expect(response.body).toMatchObject({
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    });

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.materials).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Structural Steel Beams", quantity: "24 bundles" })])
    );
  });

  it("rejects invalid material creation input", async () => {
    const agent = await testApp();
    const validMaterial = {
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    };

    for (const invalidMaterial of [
      { ...validMaterial, projectId: "" },
      { ...validMaterial, name: "" },
      { ...validMaterial, status: "Delivered" },
      { ...validMaterial, deliveryDate: "06/28/2026" },
      { ...validMaterial, quantity: "" }
    ]) {
      await agent.post("/api/materials").send(invalidMaterial).expect(400);
    }

    await agent
      .post("/api/materials")
      .send({ ...validMaterial, projectId: "missing-project" })
      .expect(404);
  });

  it("uses newly created crews for schedule assignments", async () => {
    const agent = await testApp();
    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 4 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: crew.body.id,
        date: "2026-06-20"
      })
      .expect(201);

    expect(assignment.body.crewId).toBe(crew.body.id);
  });

  it("deletes crews and removes their schedule assignments", async () => {
    const agent = await testApp();
    const crew = await agent
      .post("/api/crews")
      .send({
        name: "Site Prep Crew 5",
        specialty: "Site Prep",
        foreman: "Dana Brooks",
        laborMix: [
          { category: "Labor", role: "Laborers", count: 4 },
          { category: "Operator", role: "Dozer Operator", count: 1 }
        ]
      })
      .expect(201);

    await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: crew.body.id,
        date: "2026-06-20"
      })
      .expect(201);

    await agent.delete(`/api/crews/${crew.body.id}`).expect(204);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews.some((item: { id: string }) => item.id === crew.body.id)).toBe(false);
    expect(bootstrap.body.assignments.some((item: { crewId: string }) => item.crewId === crew.body.id)).toBe(false);
  });

  it("returns not found for unknown crew deletes", async () => {
    const agent = await testApp();
    await agent.delete("/api/crews/crew-missing").expect(404);
  });

  it("updates crew profiles with computed size and keeps assignments usable", async () => {
    const agent = await testApp();
    const response = await agent
      .patch("/api/crews/crew-concrete")
      .send({
        name: "Concrete Crew Alpha",
        specialty: "Concrete Placement",
        foreman: "Morgan Lee",
        laborMix: [
          { category: "Labor", role: "Finishers", count: 3 },
          { category: "Operator", role: "Pump Operator", count: 1 }
        ]
      })
      .expect(200);

    expect(response.body.name).toBe("Concrete Crew Alpha");
    expect(response.body.lead).toBe("Morgan Lee");
    expect(response.body.size).toBe(5);
    expect(response.body.status).toBe("Scheduled");
    expect(response.body.utilization).toBe(80);
    expect(response.body.laborMix).toHaveLength(2);

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.crews).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "crew-concrete", name: "Concrete Crew Alpha", size: 5 })])
    );

    const assignment = await agent
      .post("/api/schedule/assign")
      .send({
        jobId: "j-logistics-site",
        crewId: "crew-concrete",
        date: "2026-06-20"
      })
      .expect(201);

    expect(assignment.body.crewId).toBe("crew-concrete");
  });

  it("rejects invalid crew update input", async () => {
    const agent = await testApp();
    const validCrew = {
      name: "Concrete Crew Alpha",
      specialty: "Concrete Placement",
      foreman: "Morgan Lee",
      laborMix: [{ category: "Labor", role: "Finishers", count: 3 }]
    };

    for (const invalidCrew of [
      { ...validCrew, foreman: "" },
      { ...validCrew, laborMix: [] },
      { ...validCrew, laborMix: [{ category: "Labor", role: "", count: 2 }] },
      { ...validCrew, laborMix: [{ category: "Operator", role: "Pump Operator", count: 0 }] }
    ]) {
      await agent.patch("/api/crews/crew-concrete").send(invalidCrew).expect(400);
    }
  });

  it("returns not found for unknown crew updates", async () => {
    const agent = await testApp();
    await agent
      .patch("/api/crews/crew-missing")
      .send({
        name: "Missing Crew",
        specialty: "General",
        foreman: "Morgan Lee",
        laborMix: [{ category: "Labor", role: "Laborers", count: 2 }]
      })
      .expect(404);
  });

  it("creates field updates", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        jobId: "j-riverside-concrete",
        userId: "u-carlos",
        status: "On Site",
        message: "Crew checked in and pour has started."
      })
      .expect(201);

    expect(response.body.update.id).toMatch(/^fu-/);
    expect(response.body.update.message).toContain("pour");
    // A note with no percent is just a log entry — it has no opinion about the plan.
    expect(response.body.variance).toBeNull();
  });

  it("rejects reported progress that isn't tied to a job", async () => {
    const agent = await testApp();
    await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        userId: "u-carlos",
        status: "On Site",
        message: "Roughly half done across the site.",
        percentComplete: 50
      })
      .expect(400);
  });

  it("writes reported progress onto the job without touching the planned dates", async () => {
    const agent = await testApp();
    const before = await agent.get("/api/bootstrap").expect(200);
    const planned = before.body.jobs.find((job: { id: string }) => job.id === "j-riverside-concrete");

    await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-riverside",
        jobId: "j-riverside-concrete",
        userId: "u-carlos",
        status: "On Site",
        message: "Rebar mat is tied, starting the pour.",
        percentComplete: 45
      })
      .expect(201);

    const after = await agent.get("/api/bootstrap").expect(200);
    const job = after.body.jobs.find((item: { id: string }) => item.id === "j-riverside-concrete");

    // The crew's number is a fact — it lands.
    expect(job.percentComplete).toBe(45);
    expect(job.actualStart).toBeTruthy();
    // The plan is the PM's — it does not move on a field report.
    expect(job.startDate).toBe(planned.startDate);
    expect(job.endDate).toBe(planned.endDate);
  });

  it("accepting a variance moves the plan; rejecting it leaves the plan alone", async () => {
    const agent = await testApp();
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const target = bootstrap.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");

    // Report far enough behind that the forecastIQ has to move the finish.
    const reported = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-harborview",
        jobId: "j-harborview-framing",
        userId: "u-carlos",
        status: "On Site",
        message: "Podium connectors are re-work, we are well behind.",
        percentComplete: 5
      })
      .expect(201);

    const variance = reported.body.variance;
    expect(variance).not.toBeNull();
    expect(variance.status).toBe("pending");
    expect(variance.kind).toBe("slip");

    // Still pending → the master schedule is untouched.
    const during = await agent.get("/api/bootstrap").expect(200);
    const held = during.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(held.endDate).toBe(target.endDate);

    const rejected = await agent
      .post(`/api/schedule/variances/${variance.id}/reject`)
      .send({ userId: "u-matt", note: "Pulling a second crew in to hold the date." })
      .expect(200);
    expect(rejected.body.status).toBe("rejected");

    const afterReject = await agent.get("/api/bootstrap").expect(200);
    const stillPlanned = afterReject.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(stillPlanned.endDate).toBe(target.endDate);
    // Rejecting the schedule conclusion doesn't dispute what the crew saw.
    expect(stillPlanned.percentComplete).toBe(5);

    // A resolved variance can't be resolved twice.
    await agent.post(`/api/schedule/variances/${variance.id}/reject`).send({ userId: "u-matt" }).expect(404);

    // Now report again and accept it — this time the plan should move.
    const second = await agent
      .post("/api/field-updates")
      .send({
        projectId: "p-harborview",
        jobId: "j-harborview-framing",
        userId: "u-carlos",
        status: "On Site",
        message: "Second crew did not materialise, still behind.",
        percentComplete: 5
      })
      .expect(201);

    const accepted = await agent.post(`/api/schedule/variances/${second.body.variance.id}/accept`).send({ userId: "u-matt" }).expect(200);
    expect(accepted.body.variance.status).toBe("accepted");

    const afterAccept = await agent.get("/api/bootstrap").expect(200);
    const moved = afterAccept.body.jobs.find((job: { id: string }) => job.id === "j-harborview-framing");
    expect(moved.endDate > target.endDate).toBe(true);
    // The baseline is what the slip stays measurable against — accepting must not eat it.
    expect(moved.baselineEnd).toBe(target.baselineEnd);
  });

  it("supersedes an older pending variance when the field reports again", async () => {
    const agent = await testApp();
    const post = (percentComplete: number) =>
      agent
        .post("/api/field-updates")
        .send({
          projectId: "p-harborview",
          jobId: "j-harborview-framing",
          userId: "u-carlos",
          status: "On Site",
          message: `Progress check at ${percentComplete}%.`,
          percentComplete
        })
        .expect(201);

    const first = await post(5);
    const second = await post(10);
    expect(first.body.variance).not.toBeNull();
    expect(second.body.variance).not.toBeNull();

    const pending = await agent.get("/api/schedule/variances?status=pending").expect(200);
    const forJob = pending.body.filter((item: { jobId: string }) => item.jobId === "j-harborview-framing");

    // The PM answers "where is this job now", not every guess on the way there.
    expect(forJob).toHaveLength(1);
    expect(forJob[0].id).toBe(second.body.variance.id);

    const all = await agent.get("/api/schedule/variances").expect(200);
    const superseded = all.body.find((item: { id: string }) => item.id === first.body.variance.id);
    expect(superseded.status).toBe("superseded");
  });

  it("creates delayIQs", async () => {
    const agent = await testApp();
    const response = await agent
      .post("/api/delayIQs")
      .send({
        projectId: "p-riverside",
        category: "Equipment issue",
        title: "Concrete pump repair",
        impactDays: 1,
        severity: "Low",
        status: "Open",
        description: "Backup pump is scheduled for tomorrow."
      })
      .expect(201);

    expect(response.body.title).toBe("Concrete pump repair");
  });
});
