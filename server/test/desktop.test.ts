/**
 * BuildFlow for Mac, step 2: connecting a Mac.
 *
 * The rule under test is "only in the downloaded app": /api/desktop answers to a device key and to
 * nothing else, the only way to get a key is the PKCE hand-off that starts in the app, a key can be
 * taken back and stops working at once, the demo can never hold one, and neither a key nor a code is
 * ever written to the request log.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { CONNECT_CODE_TTL_MS, MAX_DEVICES_PER_ACCOUNT } from "../src/desktop.js";
import type { StoreManager } from "../src/stores.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Agent = ReturnType<typeof request.agent>;

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function freshApp(): Promise<App> {
  return createApp({ dataFile: path.join(tempDir("buildflow-desktop-"), "test.sqlite"), reset: true });
}

const managerOf = (app: App) => app.locals.storeManager as StoreManager;

const OWNER = { email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true };

/** A real, non-demo workspace with its owner signed in. */
async function workspace(app: App) {
  const owner = request.agent(app);
  await owner.post("/api/auth/signup").send(OWNER).expect(201);
  await owner
    .post("/api/business-profile")
    .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
    .expect(200);
  const me = (await owner.get("/api/auth/me").expect(200)).body as { account: { id: string }; org: { id: string } };
  return { owner, accountId: me.account.id, orgId: me.org.id };
}

/** A teammate in the same workspace, signed in through a real invite. */
async function teammate(app: App, owner: Agent, orgId: string, email = "sam@asphaltco.com") {
  await owner
    .post("/api/team/invites")
    .send({ invites: [{ email, permission: "member" }] })
    .expect(201);
  const main = managerOf(app).main;
  const row = main
    .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
    .find((r) => r.email === email)!;
  const fresh = main.refreshInvite(row.id, orgId, 60_000)!;
  const agent = request.agent(app);
  const joined = await agent
    .post("/api/auth/invite/accept")
    .send({ token: fresh.token, name: "Sam Rivera", password: "Paver-Screed-2026", acceptTerms: true })
    .expect(201);
  return { agent, accountId: joined.body.account.id as string };
}

/** What the Mac makes before it opens the Connect page. */
function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

const connectUrl = (p: { challenge: string; state: string }, overrides: Record<string, string> = {}) =>
  `/desktop/connect?${new URLSearchParams({
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    state: p.state,
    redirect_uri: "buildflow://connect",
    device_name: "Dana's MacBook Air",
    ...overrides
  })}`;

const approvalIn = (html: string) => /name="approval" value="([^"]+)"/.exec(html)?.[1];

/** The person presses "Connect this Mac" (or Cancel). Answers the redirect's query. */
async function approve(agent: Agent, p: ReturnType<typeof pkce>, decision: "allow" | "deny" = "allow") {
  const page = await agent.get(connectUrl(p)).expect(200);
  const approval = approvalIn(page.text);
  expect(approval, "the page offers the Connect button").toBeTruthy();
  const posted = await agent
    .post("/desktop/connect")
    .set("Sec-Fetch-Site", "same-origin")
    .type("form")
    .send({ approval, decision })
    .expect(303);
  const location = String(posted.headers.location);
  expect(location.startsWith("buildflow://connect?")).toBe(true);
  return new URL(location).searchParams;
}

const exchange = (app: App, code: string, verifier: string, extra: Record<string, string> = {}) =>
  request(app)
    .post("/api/desktop/token")
    .send({ code, code_verifier: verifier, ...extra });

/** Connect a Mac for whoever `agent` is signed in as. Answers the key and the device. */
async function connectMac(app: App, agent: Agent) {
  const p = pkce();
  const back = await approve(agent, p);
  expect(back.get("state")).toBe(p.state);
  const token = await exchange(app, back.get("code")!, p.verifier, { app_version: "1.0.0", platform: "macOS 13.3" }).expect(201);
  return { key: token.body.key as string, device: token.body.device as { id: string; name: string } };
}

const asMac = (app: App, key: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${key}`),
  post: (url: string) => request(app).post(url).set("Authorization", `Bearer ${key}`)
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connecting a Mac", () => {
  it("hands the Mac a key through the Connect page and the token exchange, and the key opens /api/desktop", async () => {
    const app = await freshApp();
    const { owner, accountId, orgId } = await workspace(app);
    const p = pkce();

    const page = await owner.get(connectUrl(p)).expect(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.headers["content-security-policy"]).toContain("form-action 'self' buildflow:");
    expect(page.text).toContain("Connect this Mac?");
    expect(page.text).toContain("Dana&#39;s MacBook Air");
    expect(page.text).toContain("Asphalt Co");
    expect(page.text).toContain("dana@asphaltco.com");

    const back = await approve(owner, p);
    expect(back.get("state")).toBe(p.state);
    const code = back.get("code")!;
    expect(code.length).toBeGreaterThan(30);

    const token = await exchange(app, code, p.verifier, { app_version: "1.0.0", platform: "macOS 13.3" }).expect(201);
    expect(token.headers["cache-control"]).toBe("no-store");
    const key: string = token.body.key;
    expect(key).toMatch(/^bfd_[A-Za-z0-9_-]{43}$/);
    expect(token.body.device).toMatchObject({
      name: "Dana's MacBook Air",
      platform: "macOS 13.3",
      appVersion: "1.0.0",
      workspace: { id: orgId, name: "Asphalt Co" },
      revokedAt: null
    });

    const me = await asMac(app, key).get("/api/desktop/me").expect(200);
    expect(me.body).toMatchObject({ firstName: "Dana", name: "Dana Brooks", workspace: "Asphalt Co", role: "owner" });
    expect(me.body.device.id).toBe(token.body.device.id);

    // Only hashes are kept: neither the key nor the code is anywhere in the control database.
    const main = managerOf(app).main;
    const devices = main.all<{ keyHash: string; accountId: string }>("SELECT keyHash, accountId FROM desktop_devices");
    expect(devices).toEqual([{ keyHash: crypto.createHash("sha256").update(key).digest("hex"), accountId }]);
    const everything = JSON.stringify([
      main.all("SELECT * FROM desktop_devices"),
      main.all("SELECT * FROM desktop_connect_codes"),
      main.all("SELECT * FROM auth_tokens")
    ]);
    expect(everything).not.toContain(key);
    expect(everything).not.toContain(code);
    expect(everything).not.toContain(p.verifier);
  });

  it("refuses a wrong verifier, and the attempt spends the code", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const p = pkce();
    const code = (await approve(owner, p)).get("code")!;

    const wrong = await exchange(app, code, pkce().verifier).expect(400);
    expect(wrong.body.code).toBe("invalid_grant");
    expect(wrong.body.key).toBeUndefined();
    // the right verifier is too late now
    expect((await exchange(app, code, p.verifier).expect(400)).body.code).toBe("invalid_grant");
    expect(managerOf(app).main.all("SELECT id FROM desktop_devices")).toEqual([]);
  });

  it("refuses a code the second time it is used", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const p = pkce();
    const code = (await approve(owner, p)).get("code")!;

    await exchange(app, code, p.verifier).expect(201);
    const again = await exchange(app, code, p.verifier).expect(400);
    expect(again.body).toMatchObject({ code: "invalid_grant" });
    expect(again.body.key).toBeUndefined();
    expect(managerOf(app).main.all("SELECT id FROM desktop_devices")).toHaveLength(1);
  });

  it("refuses a code once its five minutes are up", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const p = pkce();
    const code = (await approve(owner, p)).get("code")!;
    expect(CONNECT_CODE_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + CONNECT_CODE_TTL_MS + 1000);
    const late = await exchange(app, code, p.verifier).expect(400);
    expect(late.body.code).toBe("invalid_grant");
  });

  it("rejects a malformed exchange before it looks anything up", async () => {
    const app = await freshApp();
    expect((await request(app).post("/api/desktop/token").send({}).expect(400)).body.code).toBe("invalid_request");
    expect((await exchange(app, "whatever", "short").expect(400)).body.code).toBe("invalid_request");
    expect((await exchange(app, "not-a-real-code", pkce().verifier).expect(400)).body.code).toBe("invalid_grant");
  });

  it("sends Cancel back to the Mac as access_denied, with no code", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const p = pkce();
    const back = await approve(owner, p, "deny");
    expect(back.get("error")).toBe("access_denied");
    expect(back.get("state")).toBe(p.state);
    expect(back.get("code")).toBeNull();
    expect(managerOf(app).main.all("SELECT id FROM desktop_connect_codes")).toEqual([]);
  });
});

describe("the Connect page", () => {
  it("asks a signed-out visitor to sign in on the website, and to come back to this exact page", async () => {
    const app = await freshApp();
    const p = pkce();
    const url = connectUrl(p);
    const page = await request(app).get(url).expect(200);
    expect(page.text).toContain("Sign in to connect this Mac");
    expect(approvalIn(page.text), "no Connect button without a session").toBeUndefined();
    const href = /class="button primary" href="([^"]+)"/.exec(page.text)?.[1].replace(/&amp;/g, "&");
    expect(href).toBeTruthy();
    const link = new URL(href!, "http://example.test");
    expect(link.hash).toBe("#create-account");
    expect(link.searchParams.get("next")).toBe(url);
  });

  it("only sends a code to buildflow://connect, and only for S256", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const p = pkce();
    for (const bad of [
      { redirect_uri: "https://evil.example/steal" },
      { redirect_uri: "buildflow://connect/elsewhere" },
      { code_challenge_method: "plain" },
      { code_challenge: "too-short" },
      { state: "" }
    ]) {
      const page = await owner.get(connectUrl(p, bad)).expect(400);
      expect(page.text).toContain("This link can&#39;t connect a Mac");
      expect(approvalIn(page.text)).toBeUndefined();
    }
  });

  it("refuses a post that did not come from the page this session was shown", async () => {
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const { agent: sam } = await teammate(app, owner, orgId);
    const p = pkce();
    const approval = approvalIn((await owner.get(connectUrl(p)).expect(200)).text)!;

    // another site's form: the browser says so
    await owner.post("/desktop/connect").set("Sec-Fetch-Site", "cross-site").type("form").send({ approval, decision: "allow" }).expect(403);
    // no approval at all, or a forged one
    await owner.post("/desktop/connect").type("form").send({ decision: "allow" }).expect(403);
    await owner
      .post("/desktop/connect")
      .type("form")
      .send({ approval: `${approval}x`, decision: "allow" })
      .expect(403);
    // Dana's approval in Sam's session
    await sam.post("/desktop/connect").type("form").send({ approval, decision: "allow" }).expect(403);
    // Dana's approval with no session
    await request(app).post("/desktop/connect").type("form").send({ approval, decision: "allow" }).expect(403);
    expect(managerOf(app).main.all("SELECT id FROM desktop_connect_codes")).toEqual([]);

    // and the real thing still works
    await owner
      .post("/desktop/connect")
      .set("Sec-Fetch-Site", "same-origin")
      .type("form")
      .send({ approval, decision: "allow" })
      .expect(303);
  });

  it("will not connect the demo, on the page, on the post, or at the exchange", async () => {
    const app = await freshApp();
    const demo = request.agent(app);
    await demo.post("/api/auth/demo").expect(200);
    const p = pkce();

    const page = await demo.get(connectUrl(p)).expect(403);
    expect(page.text).toContain("The demo can&#39;t connect a Mac");
    expect(approvalIn(page.text)).toBeUndefined();

    // Even with a validly signed approval, which only a real session could have been shown.
    const { owner } = await workspace(app);
    const approval = approvalIn((await owner.get(connectUrl(p)).expect(200)).text)!;
    await demo.post("/desktop/connect").set("Sec-Fetch-Site", "same-origin").type("form").send({ approval, decision: "allow" }).expect(403);

    // And a code minted for the demo by hand still buys nothing.
    const main = managerOf(app).main;
    const demoAccount = main.getAccountRowByEmail("demo@buildflow.com")!;
    const code = main.createDesktopConnectCode({
      accountId: demoAccount.id,
      orgId: demoAccount.orgId,
      challenge: p.challenge,
      deviceName: "Mac",
      ttlMs: 60_000
    });
    const refused = await exchange(app, code, p.verifier).expect(403);
    expect(refused.body.code).toBe("demo_account");
    expect(main.all("SELECT id FROM desktop_devices")).toEqual([]);
  });

  it("stops at the device limit and says where to make room", async () => {
    const app = await freshApp();
    const { owner, accountId, orgId } = await workspace(app);
    const main = managerOf(app).main;
    for (let i = 0; i < MAX_DEVICES_PER_ACCOUNT; i += 1) main.createDesktopDevice({ accountId, orgId, name: `Mac ${i}` });
    const page = await owner.get(connectUrl(pkce())).expect(409);
    expect(page.text).toContain("Settings › Devices");
    expect(approvalIn(page.text)).toBeUndefined();
  });
});

describe("the device gate", () => {
  it("gives a browser session a 401 on /api/desktop, cookie or not", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const cookieOnly = await owner.get("/api/desktop/me").expect(401);
    expect(cookieOnly.body.code).toBe("device_key_required");
    expect(cookieOnly.headers["www-authenticate"]).toMatch(/^Bearer/);
    // any casing of the path meets the same gate
    await owner.get("/API/desktop/me").expect((res) => expect([401, 404]).toContain(res.status));
    await owner.get("/api/Desktop/me").expect(401);
    // a cookie plus something that is not a key
    await owner.get("/api/desktop/me").set("Authorization", "Bearer not-a-device-key").expect(401);
    // a well-shaped key nobody issued
    const forged = `bfd_${crypto.randomBytes(32).toString("base64url")}`;
    expect((await owner.get("/api/desktop/me").set("Authorization", `Bearer ${forged}`).expect(401)).body.code).toBe("device_key_invalid");
  });

  it("does not let a device key stand in for a session anywhere else", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const { key } = await connectMac(app, owner);
    await asMac(app, key).get("/api/bootstrap").expect(401);
    await asMac(app, key).get("/api/me/devices").expect(401);
  });

  it("stops a revoked key at once, whether Settings or the Mac itself took it back", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);

    const first = await connectMac(app, owner);
    await asMac(app, first.key).get("/api/desktop/me").expect(200);
    const revoked = await owner.delete(`/api/me/devices/${first.device.id}`).expect(200);
    expect(revoked.body.device.revokedAt).toBeTruthy();
    const after = await asMac(app, first.key).get("/api/desktop/me").expect(401);
    expect(after.body.code).toBe("device_revoked");

    const second = await connectMac(app, owner);
    await asMac(app, second.key).post("/api/desktop/disconnect").expect(200);
    expect((await asMac(app, second.key).get("/api/desktop/me").expect(401)).body.code).toBe("device_revoked");
    expect((await owner.get("/api/me/devices").expect(200)).body.devices).toEqual([]);
  });

  it("reads the device's own workspace, not the shared store", async () => {
    const app = await freshApp();
    const { owner, accountId, orgId } = await workspace(app);
    const manager = managerOf(app);
    /* Make the workspace's own record of the person differ from the login, so the answer can only
       have come from the tenant file. The main store has no roster row for this login at all. */
    const tenant = await manager.getOrgStore(orgId);
    tenant.run("UPDATE users SET name = ? WHERE accountId = ?", ["Danielle Brooks", accountId]);
    expect(manager.main.users().some((user) => user.accountId === accountId)).toBe(false);

    const { key } = await connectMac(app, owner);
    const me = await asMac(app, key).get("/api/desktop/me").expect(200);
    expect(me.body.firstName).toBe("Danielle");
    expect(me.body.workspace).toBe("Asphalt Co");
  });

  it("writes last-seen at most once an hour", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const { key, device } = await connectMac(app, owner);
    const main = managerOf(app).main;
    const lastSeen = () => main.desktopDevice(device.id)!.lastSeenAt;
    const connectedAt = lastSeen();

    const writes = vi.spyOn(fs, "renameSync");
    try {
      await asMac(app, key).get("/api/desktop/me").expect(200);
      expect(lastSeen()).toBe(connectedAt);
      expect(writes, "a read inside the hour writes nothing").not.toHaveBeenCalled();

      main.run("UPDATE desktop_devices SET lastSeenAt = ? WHERE id = ?", [
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        device.id
      ]);
      await asMac(app, key).get("/api/desktop/me").set("X-BuildFlow-App-Version", "1.0.1").expect(200);
      expect(Date.now() - new Date(lastSeen()!).getTime()).toBeLessThan(60_000);
      expect(main.desktopDevice(device.id)!.appVersion).toBe("1.0.1");

      writes.mockClear();
      await asMac(app, key).get("/api/desktop/me").expect(200);
      expect(writes).not.toHaveBeenCalled();
    } finally {
      writes.mockRestore();
    }
  });
});

describe("Settings › Devices", () => {
  it("lists only your own Macs and lets you revoke only your own", async () => {
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const { agent: sam } = await teammate(app, owner, orgId);
    const mine = await connectMac(app, owner);
    const his = await connectMac(app, sam);

    const listed = await owner.get("/api/me/devices").expect(200);
    expect(listed.body.devices.map((d: { id: string }) => d.id)).toEqual([mine.device.id]);
    expect(listed.body.devices[0]).toMatchObject({ name: "Dana's MacBook Air", workspace: { id: orgId, name: "Asphalt Co" } });
    expect(JSON.stringify(listed.body)).not.toMatch(/keyHash|bfd_/);

    // the Owner cannot revoke a teammate's Mac from here -- same answer as a Mac that does not exist
    expect((await owner.delete(`/api/me/devices/${his.device.id}`).expect(404)).body.code).toBe("device_not_found");
    await owner.delete("/api/me/devices/dev-nope").expect(404);
    await asMac(app, his.key).get("/api/desktop/me").expect(200);
  });

  it("cuts off a teammate's Macs when the teammate is removed", async () => {
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const { agent: sam, accountId: samAccount } = await teammate(app, owner, orgId);
    const his = await connectMac(app, sam);
    await asMac(app, his.key).get("/api/desktop/me").expect(200);

    const team = await owner.get("/api/team").expect(200);
    const row = (team.body.users as Array<{ id: string; accountId: string | null }>).find((user) => user.accountId === samAccount)!;
    await owner.delete(`/api/team/users/${row.id}`).expect(200);
    await asMac(app, his.key).get("/api/desktop/me").expect(401);
    expect(managerOf(app).main.all("SELECT id FROM desktop_devices")).toEqual([]);
  });

  it("disconnects every Mac when the password is reset", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const { key } = await connectMac(app, owner);
    const asked = await request(app).post("/api/auth/reset/request").send({ email: OWNER.email }).expect(200);
    await request(app).post("/api/auth/reset").send({ token: asked.body.debugToken, password: "Screed-Roller-2027" }).expect(200);
    expect((await asMac(app, key).get("/api/desktop/me").expect(401)).body.code).toBe("device_revoked");
  });
});

describe("what the request log may contain", () => {
  const originalMode = process.env.REQUEST_LOG;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.REQUEST_LOG;
    else process.env.REQUEST_LOG = originalMode;
  });

  for (const mode of ["text", "json"] as const) {
    it(`never writes a device key, a connect code or a verifier (${mode})`, async () => {
      process.env.REQUEST_LOG = mode;
      const app = await freshApp();
      const { owner } = await workspace(app);
      const lines: string[] = [];
      const out = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
      const err = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
      const secrets: string[] = [];
      try {
        const p = pkce();
        const back = await approve(owner, p);
        const code = back.get("code")!;
        // a failed exchange first, then the real one, then the key in use and revoked
        await exchange(app, code.slice(0, -2) + "zz", p.verifier).expect(400);
        const token = await exchange(app, code, p.verifier).expect(201);
        const key: string = token.body.key;
        await asMac(app, key).get("/api/desktop/me").expect(200);
        await asMac(app, key).post("/api/desktop/disconnect").expect(200);
        await asMac(app, key).get("/api/desktop/me").expect(401);
        secrets.push(key, key.slice(4), code, p.verifier, p.challenge, p.state);
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      const logged = lines.join("\n");
      expect(logged, "the flow was actually logged").toContain("/api/desktop/token");
      expect(logged).toContain("/desktop/connect");
      for (const secret of secrets) expect(logged).not.toContain(secret);
      // the parameter NAMES survive, which is enough to tell the requests apart
      expect(logged).toMatch(/code_challenge/);
    });
  }
});
