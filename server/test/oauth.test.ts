import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";

/* A tiny stand-in identity provider: hands out a code, then trades it for an
   id_token whose claims we control. Signature is irrelevant — the real flow
   trusts the token endpoint over TLS, and so does this one over localhost. */
function fakeIdp(clientId: string, issuer: string) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const issued = new Map<string, { nonce: string; email: string; name: string; verified: boolean }>();
  let nextIdentity = { email: "dana@asphaltco.com", name: "Dana Brooks", verified: true };
  app.get("/authorize", (req, res) => {
    const code = `code-${issued.size + 1}`;
    issued.set(code, { nonce: String(req.query.nonce), ...nextIdentity });
    res.redirect(`${req.query.redirect_uri}?code=${code}&state=${req.query.state}`);
  });
  app.post("/token", (req, res) => {
    const grant = issued.get(String(req.body.code));
    if (!grant || req.body.client_id !== clientId || !req.body.code_verifier) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    issued.delete(String(req.body.code));
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        aud: clientId,
        sub: `sub-${grant.email}`,
        email: grant.email,
        email_verified: grant.verified,
        name: grant.name,
        nonce: grant.nonce,
        exp: Math.floor(Date.now() / 1000) + 300
      })
    ).toString("base64url");
    res.json({ id_token: `eyJhbGciOiJub25lIn0.${payload}.sig`, token_type: "Bearer" });
  });
  return {
    app,
    setIdentity: (identity: typeof nextIdentity) => {
      nextIdentity = identity;
    }
  };
}

describe("Sign in with Google (OpenID Connect)", () => {
  let idp: Server;
  let idpBase = "";
  const CLIENT_ID = "test-google-client";
  const ISSUER = "https://accounts.google.com";
  let setIdentity: (identity: { email: string; name: string; verified: boolean }) => void;

  beforeAll(async () => {
    const fake = fakeIdp(CLIENT_ID, ISSUER);
    setIdentity = fake.setIdentity;
    await new Promise<void>((resolve) => {
      idp = fake.app.listen(0, () => resolve());
    });
    const port = (idp.address() as { port: number }).port;
    idpBase = `http://127.0.0.1:${port}`;
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.OAUTH_GOOGLE_AUTHORIZE_URL = `${idpBase}/authorize`;
    process.env.OAUTH_GOOGLE_TOKEN_URL = `${idpBase}/token`;
    process.env.BUILDFLOW_API_URL = "http://api.test";
  });
  afterAll(() => {
    idp.close();
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "OAUTH_GOOGLE_AUTHORIZE_URL",
      "OAUTH_GOOGLE_TOKEN_URL",
      "BUILDFLOW_API_URL"
    ])
      delete process.env[key];
  });

  async function appWithStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-oauth-"));
    return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  }

  /** Walk the redirect dance: start → fake provider → callback, keeping the state cookie. */
  async function signInWith(app: express.Express, agent: ReturnType<typeof request.agent>, query: string) {
    const start = await agent.get(`/api/auth/oauth/google/start?${query}`).expect(302);
    const providerUrl = new URL(start.headers.location);
    expect(providerUrl.origin).toBe(idpBase);
    expect(providerUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(providerUrl.searchParams.get("redirect_uri")).toBe("http://api.test/api/auth/oauth/google/callback");
    const provider = await fetch(providerUrl, { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    return agent.get(`${back.pathname}${back.search}`).expect(302);
  }

  it("reports which providers are configured", async () => {
    const app = await appWithStore();
    const status = await request(app).get("/api/auth/oauth/status").expect(200);
    expect(status.body.providers).toEqual({ google: true, microsoft: false });
    const off = await request(app).get("/api/auth/oauth/microsoft/start?mode=login&returnTo=http://localhost:5432").expect(302);
    expect(off.headers.location).toContain("oauth=error&reason=not_configured");
  });

  it("signs a new person up with a verified provider email, then signs them back in", async () => {
    const app = await appWithStore();
    const agent = request.agent(app);

    // signup needs the terms box, like the form
    const noTerms = await agent.get("/api/auth/oauth/google/start?mode=signup&returnTo=http://localhost:5432").expect(302);
    expect(noTerms.headers.location).toContain("reason=terms_required");

    const done = await signInWith(app, agent, "mode=signup&terms=1&returnTo=http://localhost:5432");
    expect(done.headers.location).toBe("http://localhost:5432/?oauth=signup#business-type");
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.account).toMatchObject({ email: "dana@asphaltco.com", name: "Dana Brooks", authProvider: "google", role: "owner" });
    expect(me.body.account.emailVerifiedAt).toBeTruthy();
    expect(me.body.account.acceptedTermsAt).toBeTruthy();
    expect(me.body.org.name).toBe("Asphaltco");
    const boot = await agent.get("/api/bootstrap").expect(200);
    expect(boot.body.activeUser).toMatchObject({ name: "Dana Brooks", title: "Owner" });
    expect(boot.body.onboardingCompletedAt).toBeNull();

    // second visit = login, from a fresh browser
    const again = request.agent(app);
    const back = await signInWith(app, again, "mode=login&returnTo=http://localhost:5432");
    expect(back.headers.location).toBe("http://localhost:5432/?oauth=login");
    expect((await again.get("/api/auth/me").expect(200)).body.account.email).toBe("dana@asphaltco.com");

    // the password box still works: a reset sets a real password for a provider account
    await request(app).post("/api/auth/login").send({ email: "dana@asphaltco.com", password: "anything-here" }).expect(401);
  });

  it("refuses to create an account from a login attempt, a bad state, or an unverified address", async () => {
    const app = await appWithStore();
    setIdentity({ email: "nobody@asphaltco.com", name: "No Body", verified: true });
    const login = await signInWith(app, request.agent(app), "mode=login&returnTo=http://localhost:5432");
    expect(login.headers.location).toContain("reason=no_account");
    await request(app).get("/api/auth/me").expect(401);

    const stale = await request(app).get("/api/auth/oauth/google/callback?code=x&state=y").expect(302);
    expect(stale.headers.location).toContain("reason=state_missing");

    setIdentity({ email: "shady@asphaltco.com", name: "Shady", verified: false });
    const unverified = await signInWith(app, request.agent(app), "mode=signup&terms=1&returnTo=http://localhost:5432");
    expect(unverified.headers.location).toContain("reason=email_unverified");

    // returnTo is never an arbitrary site
    const phish = await request(app).get("/api/auth/oauth/google/start?mode=login&returnTo=https://evil.example").expect(302);
    const cookie = String(phish.headers["set-cookie"]?.[0] ?? "");
    expect(cookie).toMatch(/^bf_oauth=/);
    expect(cookie).not.toContain("evil");
    setIdentity({ email: "dana@asphaltco.com", name: "Dana Brooks", verified: true });
  });
});
