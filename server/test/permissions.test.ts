import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { permissionLevels, type PermissionLevel } from "@buildflow/shared";
import { createApp } from "../src/app.js";
import {
  assertRoutePolicyCovers,
  can,
  capabilitiesFor,
  decide,
  installRoutePolicy,
  outranks,
  policyKeyFor,
  ROUTE_POLICY,
  type Capability
} from "../src/permissions.js";

/**
 * These tests are about the MECHANISM, not about who may do what today.
 *
 * The policy table currently sits at the behaviour the server already had, so there is
 * no refusal to assert against a live route yet. What is worth locking down now is the
 * part that has to keep working while the table changes underneath it: that the grants
 * are a real ladder, that `decide` answers correctly for a capability the caller lacks,
 * and above all that a route with no policy cannot be registered.
 */

async function bootedApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-perm-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

describe("the permission ladder", () => {
  it("gives each level strictly more than the one below it, with one deliberate exception", () => {
    const [owner, admin, member] = (["owner", "admin", "member"] as const).map(
      (level) => new Set(capabilitiesFor(level))
    );

    // Every Member capability is an Admin capability.
    for (const capability of member) expect(admin.has(capability)).toBe(true);

    // Every Admin capability is an Owner capability EXCEPT leaving the workspace, which an
    // Owner must not be able to do while they still own it -- there would be no owner left.
    for (const capability of admin) {
      if (capability === "org.leave") continue;
      expect(owner.has(capability)).toBe(true);
    }
    expect(owner.has("org.leave")).toBe(false);

    expect(admin.size).toBeGreaterThan(member.size);
    expect(owner.size).toBeGreaterThan(admin.size);
  });

  it("keeps billing, permission changes and ownership to the Owner alone", () => {
    const ownerOnly: Capability[] = ["billing.plan", "billing.pay", "team.permission", "integrations.connect", "org.danger", "org.transfer"];
    for (const capability of ownerOnly) {
      expect(can("owner", capability)).toBe(true);
      expect(can("admin", capability)).toBe(false);
      expect(can("member", capability)).toBe(false);
    }
  });

  it("lets a Member read and report but never write the schedule", () => {
    expect(can("member", "schedule.read")).toBe(true);
    expect(can("member", "field.report")).toBe(true);
    expect(can("member", "jobs.write")).toBe(false);
    expect(can("member", "assignments.write")).toBe(false);
    expect(can("member", "team.remove")).toBe(false);
  });

  it("lets a level act only on levels below it, never on its equal", () => {
    expect(outranks("owner", "admin")).toBe(true);
    expect(outranks("admin", "member")).toBe(true);
    expect(outranks("admin", "owner")).toBe(false);
    expect(outranks("admin", "admin")).toBe(false);
    expect(outranks("owner", "owner")).toBe(false);
  });
});

describe("the decision", () => {
  it("lets anyone through a public route, signed in or not", () => {
    expect(decide("public", null)).toBeNull();
    expect(decide("public", "member")).toBeNull();
  });

  it("asks a signed-out caller to sign in rather than telling them they are forbidden", () => {
    const denial = decide("signed-in", null);
    expect(denial?.status).toBe(401);
    expect(denial?.body.code).toBe("signed_out");
  });

  it("names the capability a caller was missing, so the client can explain the refusal", () => {
    const denial = decide("billing.plan", "admin");
    expect(denial?.status).toBe(403);
    expect(denial?.body.code).toBe("forbidden");
    expect(denial?.body.need).toBe("billing.plan");
  });

  it("refuses a route it has never heard of", () => {
    // The registration-time check should make this unreachable. If it is ever reached,
    // an unknown route has to be a closed route -- the alternative is a silent hole.
    const denial = decide(undefined, "owner");
    expect(denial?.status).toBe(403);
    expect(denial?.body.code).toBe("no_policy");
  });

  it("admits every level to a signed-in route", () => {
    for (const level of permissionLevels) expect(decide("signed-in", level satisfies PermissionLevel)).toBeNull();
  });
});

describe("the route policy", () => {
  it("covers every route the real app registers", async () => {
    // createApp already calls this; calling it again on the booted app is the assertion
    // this whole file exists to protect, so it is worth stating outright.
    const app = await bootedApp();
    expect(() => assertRoutePolicyCovers(app)).not.toThrow();
  });

  it("has an entry for each of the app's routes and no entries left over", async () => {
    const app = await bootedApp();
    const registered = new Set<string>();
    type Layer = { route?: { path: string; methods?: Record<string, boolean> } };
    for (const layer of (app as unknown as { router: { stack: Layer[] } }).router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods ?? {})) {
        if (method !== "_all") registered.add(policyKeyFor(method, layer.route.path));
      }
    }
    expect([...registered].filter((key) => !(key in ROUTE_POLICY))).toEqual([]);
    expect(Object.keys(ROUTE_POLICY).filter((key) => !registered.has(key))).toEqual([]);
    expect(registered.size).toBe(Object.keys(ROUTE_POLICY).length);
  });

  it("refuses to register a route that nobody decided the permissions for", () => {
    // This is the test that keeps the policy true next month. Without it the table is a
    // snapshot; with it, a new route cannot reach production undecided.
    const app = express();
    installRoutePolicy(app);
    expect(() => app.get("/api/a-route-nobody-thought-about", (_req, res) => res.end())).toThrow(
      /no entry in ROUTE_POLICY/
    );
  });

  it("still lets a route through once it has an entry", async () => {
    const app = express();
    installRoutePolicy(app);
    const key = Object.keys(ROUTE_POLICY).find((k) => k.startsWith("GET ") && ROUTE_POLICY[k] === "public");
    const publicPath = key!.slice("GET ".length);
    app.get(publicPath, (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get(publicPath.replace(/:[^/]+/g, "x")).expect(200);
  });

  it("notices a route that was registered without a guard", () => {
    const app = express();
    // Registering BEFORE installRoutePolicy is exactly how a route slips past the wrapper.
    app.get("/api/health", (_req, res) => {
      res.end();
    });
    installRoutePolicy(app);
    expect(() => assertRoutePolicyCovers(app)).toThrow(/never got a guard/);
  });
});

/* ── a second and third identity ──────────────────────────────────────────────
   Every existing test in this repo signs in as an Owner, which is why none of them
   would notice a permission that silently fails open. These build a real Member
   through the real invite flow, and an Admin by setting the level the invite cannot
   carry yet, so a refusal can actually be asserted. */

type Harness = {
  app: Awaited<ReturnType<typeof createApp>>;
  owner: ReturnType<typeof request.agent>;
  orgId: string;
  /** Sign a second person into the same workspace at the given level. */
  join: (level: PermissionLevel, email?: string) => Promise<ReturnType<typeof request.agent>>;
};

async function workspace(): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-perm-"));
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
  const orgId = (await owner.get("/api/auth/me").expect(200)).body.org.id as string;

  const main = (app.locals.storeManager as { main: MainStore }).main;

  const join = async (level: PermissionLevel, email = `${level}@asphaltco.com`) => {
    await owner.post("/api/team/invites").send({ invites: [{ email, role: "Crew Lead" }] }).expect(201);
    const row = main.all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL").find(
      (r) => r.email === email
    )!;
    // The raw token is only ever in the email, and its hash is all the row keeps, so mint
    // a fresh one the same way a resend does.
    const fresh = main.refreshInvite(row.id, orgId, 60_000)!;
    const agent = request.agent(app);
    const joined = await agent
      .post("/api/auth/invite/accept")
      .send({ token: fresh.token, name: `${level} person`, password: "Paver-Screed-2026", acceptTerms: true })
      .expect(201);
    // Acceptance always writes "member" today; the invite gains a permission field in the
    // next step. Until then an Admin is made by setting the level directly.
    expect(joined.body.account.role).toBe("member");
    if (level !== "member") expect(main.setAccountRole(joined.body.account.id, level)?.role).toBe(level);
    return agent;
  };

  return { app, owner, orgId, join };
}

type MainStore = {
  all: <T>(sql: string) => T[];
  refreshInvite: (id: string, orgId: string, ttlMs: number) => { token: string } | undefined;
  setAccountRole: (id: string, role: string) => { role: string } | undefined;
};

describe("the Owner-only rows, once they are on", () => {
  it("keeps the plan and the seat count to the Owner, and says which capability was missing", async () => {
    const { owner, join } = await workspace();
    const member = await join("member");
    const admin = await join("admin");

    // This is the escalation the plan called the clearest one in the codebase: before this
    // step, any signed-in person in the workspace could change the plan and the seat count.
    for (const [level, agent] of [
      ["member", member],
      ["admin", admin]
    ] as const) {
      const refused = await agent
        .post("/api/business-profile")
        .send({ businessType: "Asphalt", selectedPlan: "business", seats: 40 })
        .expect(403);
      expect(refused.body).toMatchObject({ code: "forbidden", need: "billing.plan" });
      expect(refused.body.error).toContain("owner");
      expect(level).toBeTruthy();
    }

    // Seats alone, with no plan, is the same commercial change and is refused the same way.
    await member.post("/api/business-profile").send({ businessType: "Asphalt", seats: 40 }).expect(403);

    // The Owner still can, and the change takes effect.
    const applied = await owner
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "business", seats: 12 })
      .expect(200);
    expect(applied.body).toMatchObject({ selectedPlan: "business", seats: 12 });
  });

  it("still lets a Member name the trade, which is the row the NEXT step narrows", async () => {
    // Stated outright rather than left implicit: this step turned on the Owner rows only.
    // The Admin rows -- org settings among them -- are the next step, and this assertion
    // is expected to flip to 403 there.
    const { join } = await workspace();
    const member = await join("member");
    await member.post("/api/business-profile").send({ businessType: "Asphalt", selectedProducts: [] }).expect(200);
  });

  it("keeps Stripe's customer portal to the Owner", async () => {
    const { owner, join } = await workspace();
    const admin = await join("admin");
    const refused = await admin.post("/api/billing/portal").send({ email: "dana@asphaltco.com" }).expect(403);
    expect(refused.body).toMatchObject({ code: "forbidden", need: "billing.pay" });
    // The Owner gets through to the handler, which answers that Stripe is not wired up here.
    const allowed = await owner.post("/api/billing/portal").send({ email: "dana@asphaltco.com" }).expect(200);
    expect(allowed.body.configured).toBe(false);
  });

  it("lets a visitor with no workspace buy, and only the Owner buy for one that exists", async () => {
    const { app, owner, join } = await workspace();
    const member = await join("member");
    const body = { plan: "pro", period: "monthly", seats: 4, returnTo: "settings", origin: "http://localhost:5432" };

    // No session: the public pricing page, where there is no workspace to bill yet.
    expect((await request(app).post("/api/billing/checkout").send(body).expect(200)).body.configured).toBe(false);
    // A session that is not the Owner's: buying FOR a workspace, which is theirs to do.
    expect((await member.post("/api/billing/checkout").send(body).expect(403)).body.need).toBe("billing.pay");
    expect((await owner.post("/api/billing/checkout").send(body).expect(200)).body.configured).toBe(false);
  });

  it("refuses a permission level it does not recognise instead of guessing one", async () => {
    // The other half of why migration 20 adds no CHECK constraint: the column is guarded
    // at both places it is written.
    const { app, join } = await workspace();
    await join("member");
    const main = (app.locals.storeManager as { main: MainStore }).main;
    const [account] = main.all<{ id: string }>("SELECT id FROM accounts WHERE role = 'member'");
    expect(main.setAccountRole(account.id, "superuser")).toBeUndefined();
    expect(main.setAccountRole("acct-nobody", "admin")).toBeUndefined();
    expect(main.setAccountRole(account.id, "admin")?.role).toBe("admin");
  });
});
