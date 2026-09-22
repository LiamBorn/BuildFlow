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
  allCapabilities,
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
    const [owner, admin, member] = (["owner", "admin", "member"] as const).map((level) => new Set(capabilitiesFor(level)));

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

  it("grants every capability it declares to somebody", () => {
    /* GRANTS is a hand-written ladder, so a capability added to the union but to none of the three
       lists is silently denied to everyone -- including the Owner. Nothing in the type system
       notices, and neither does the boot assertion, which compares routes to the table and never
       capabilities to the grants. This is that missing check. A capability may legitimately have no
       ROUTE yet (org.danger and integrations.connect are declared ahead of the features), but it
       must never have no HOLDER, because that is not a plan, it is a typo. */
    const granted = new Set([...capabilitiesFor("owner"), ...capabilitiesFor("admin"), ...capabilitiesFor("member")]);
    const declared = allCapabilities();
    expect(declared.filter((capability) => !granted.has(capability))).toEqual([]);
    // And nothing is granted that is not declared.
    expect([...granted].filter((capability) => !declared.includes(capability))).toEqual([]);
  });

  it("keeps billing, permission changes and ownership to the Owner alone", () => {
    const ownerOnly: Capability[] = [
      "billing.plan",
      "billing.pay",
      "team.permission",
      "integrations.connect",
      "org.danger",
      "org.transfer"
    ];
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
    expect(() => app.get("/api/a-route-nobody-thought-about", (_req, res) => res.end())).toThrow(/no entry in ROUTE_POLICY/);
  });

  it("still lets a route through once it has an entry", async () => {
    const app = express();
    installRoutePolicy(app);
    const key = Object.keys(ROUTE_POLICY).find((k) => k.startsWith("GET ") && ROUTE_POLICY[k] === "public");
    const publicPath = key!.slice("GET ".length);
    app.get(publicPath, (_req, res) => {
      res.json({ ok: true });
    });
    await request(app)
      .get(publicPath.replace(/:[^/]+/g, "x"))
      .expect(200);
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
    await owner
      .post("/api/team/invites")
      .send({ invites: [{ email, permission: "member" }] })
      .expect(201);
    const row = main
      .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
      .find((r) => r.email === email)!;
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
    // work, any signed-in person in the workspace could change the plan and the seat count.
    //
    // The two levels are refused at DIFFERENT points, and that is the interesting part. A
    // Member never reaches the handler: the whole route is org.settings now, so the policy
    // stops them. An Admin is admitted to the route -- naming the trade is their job -- and
    // is then refused the commercial fields by the check inside it.
    const admins = await admin
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "business", seats: 40 })
      .expect(403);
    expect(admins.body).toMatchObject({ code: "forbidden", need: "billing.plan" });
    expect(admins.body.error).toContain("owner");

    const members = await member
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "business", seats: 40 })
      .expect(403);
    expect(members.body).toMatchObject({ code: "forbidden", need: "org.settings" });

    // Seats alone, with no plan, is the same commercial change and is refused the same way.
    expect((await admin.post("/api/business-profile").send({ businessType: "Asphalt", seats: 40 }).expect(403)).body.need).toBe(
      "billing.plan"
    );

    // The Owner still can, and the change takes effect.
    const applied = await owner
      .post("/api/business-profile")
      .send({ businessType: "Asphalt", selectedPlan: "business", seats: 12 })
      .expect(200);
    expect(applied.body).toMatchObject({ selectedPlan: "business", seats: 12 });
  });

  it("lets an Admin name the trade and refuses a Member, which is the row that just changed", async () => {
    // This assertion is the previous step's, flipped. It read 200 when only the Owner rows
    // were on, because org.settings had not been turned on yet; the comment said it was
    // expected to become a 403 here, and it did.
    const { join } = await workspace();
    const member = await join("member");
    const admin = await join("admin");
    await admin.post("/api/business-profile").send({ businessType: "Asphalt", selectedProducts: [] }).expect(200);
    expect((await member.post("/api/business-profile").send({ businessType: "Asphalt", selectedProducts: [] }).expect(403)).body.need).toBe(
      "org.settings"
    );
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

describe("the Admin rows, once they are on", () => {
  it("lets a Member read the whole plan of record and change none of it", async () => {
    const { join } = await workspace();
    const member = await join("member");

    // The read floor. A Member sees the schedule, because a crew that cannot see the
    // schedule cannot work to it.
    await member.get("/api/bootstrap").expect(200);
    await member.get("/api/schedule").expect(200);
    await member.get("/api/jobs").expect(200);
    await member.get("/api/projects").expect(200);
    await member.get("/api/schedule/status").expect(200);
    await member.get("/api/schedule/variances").expect(200);
    await member.get("/api/team").expect(200);

    // And the writes that move dates, money or people. Each names the capability it wanted,
    // which is what lets the client explain a refusal rather than just failing.
    //
    // Bodies are deliberately empty. The guard runs before the handler's schema, so a 403
    // here proves the refusal happened on the permission and not on a validation error --
    // if any of these ever returns 400, the gate stopped running.
    const refusals = [
      ["post", "/api/jobs", "jobs.write"],
      ["post", "/api/schedule/assign", "assignments.write"],
      ["post", "/api/schedule/dependencies", "dependencies.write"],
      ["post", "/api/schedule/baseline", "schedule.baseline"],
      ["put", "/api/schedule/work-calendar", "calendar.write"],
      ["post", "/api/projects", "projects.write"],
      ["post", "/api/crews", "resources.write"],
      ["post", "/api/import/schedule/commit", "import.commit"],
      ["post", "/api/schedule/digest/send", "notify.send"],
      ["post", "/api/team/invites", "team.invite"],
      ["patch", "/api/org", "org.settings"],
      ["post", "/api/schedule/sample-data", "sampledata.write"],
      ["get", "/api/schedule/feeds", "feeds.read"],
      ["post", "/api/delayIQs", "delayiq.log"],
      ["delete", "/api/projects/anything", "projects.delete"],
      ["delete", "/api/crews/anything", "resources.delete"]
    ] as const;
    for (const [verb, path, need] of refusals) {
      const response = await member[verb](path).send({});
      expect({ path, status: response.status, need: response.body.need }).toEqual({ path, status: 403, need });
    }

    // Filing field progress is the one write a Member must keep: it is the crew's own job,
    // and gating it would break the loop the whole product is built on.
    await member.get("/api/field-updates").expect(200);
    const filed = await member.post("/api/field-updates").send({});
    expect(filed.status).not.toBe(403);
  });

  it("lets an Admin run the work but not own the workspace", async () => {
    const { join } = await workspace();
    const admin = await join("admin");

    // Runs the work: a real write that lands.
    // A project needs somebody named as its manager. That used to mean a Project Manager or a
    // Superintendent -- a rule of the schedule, not of permissions -- and those job titles went
    // on 2026-09-19, so anyone on the roster will do.
    const roster = (await admin.get("/api/bootstrap").expect(200)).body.users as Array<{ id: string }>;
    const managerId = roster[0]!.id;
    const project = await admin
      .post("/api/projects")
      .send({
        name: "Route 12 Overlay",
        location: "Bristol",
        address: "Route 12, Bristol",
        type: "Resurfacing",
        contractType: "Unit price",
        managerId,
        targetCompletion: "2026-11-30",
        percentComplete: 0,
        status: "Not Started",
        scheduleHealth: "On Track"
      })
      .expect(201);
    expect(project.body).toMatchObject({ name: "Route 12 Overlay" });
    await admin.patch("/api/org").send({ name: "Asphalt Company" }).expect(200);
    await admin.get("/api/schedule/feeds").expect(200);

    // Does not own it: the three Owner reserves.
    expect((await admin.post("/api/billing/portal").send({ email: "dana@asphaltco.com" }).expect(403)).body.need).toBe("billing.pay");
    expect((await admin.post("/api/business-profile").send({ businessType: "Asphalt", selectedPlan: "pro" }).expect(403)).body.need).toBe(
      "billing.plan"
    );
  });

  it("lets the Owner alone change what a teammate may do", async () => {
    // This route used to set a job title out of a fixed list of three, and its row said Admin.
    // The titles were removed on 2026-09-19, so it now sets the LEVEL -- and the row moved to
    // "team.permission", which the capability list had already reserved for the Owner. An
    // Admin who can mint another Admin is an Owner by a longer route.
    const { owner, join } = await workspace();
    const admin = await join("admin");
    const member = await join("member");

    const ownerTeam = await owner.get("/api/team").expect(200);
    expect(ownerTeam.body.canManage).toBe(true);
    const someone = ownerTeam.body.users.find((user: { name: string }) => user.name === "member person");
    expect(someone.permission, "the level rides on the person, resolved as the roster is built").toBe("member");

    const raised = await owner.patch(`/api/team/users/${someone.id}`).send({ permission: "admin" }).expect(200);
    expect(raised.body.user).toMatchObject({ id: someone.id, permission: "admin" });
    // and it is the level the SERVER now authorizes on, not just a label on a row
    expect((await member.get("/api/team").expect(200)).body.canManage).toBe(false);
    await owner.patch(`/api/team/users/${someone.id}`).send({ permission: "member" }).expect(200);

    // An Admin cannot, and is told which capability it needed.
    const theirs = await admin.get("/api/team").expect(200);
    expect(theirs.body.canManage).toBe(false);
    const refused = await admin.patch(`/api/team/users/${someone.id}`).send({ permission: "admin" }).expect(403);
    expect(refused.body.need).toBe("team.permission");
    // Nor can a Member.
    expect((await member.patch(`/api/team/users/${someone.id}`).send({ permission: "admin" }).expect(403)).body.need).toBe(
      "team.permission"
    );
  });

  it("will not hand out ownership, or let anyone change their own level", async () => {
    const { owner, join } = await workspace();
    await join("member");
    const roster = await owner.get("/api/team").expect(200);
    const someone = roster.body.users.find((user: { name: string }) => user.name === "member person");
    // Ownership moves by transfer, which takes it OFF somebody; it is not on the menu here.
    await owner.patch(`/api/team/users/${someone.id}`).send({ permission: "owner" }).expect(400);

    // And nobody sets their own: an Owner demoting themselves leaves the workspace unowned.
    // The MESSAGE is asserted, not just the 403 — the rank rule below would refuse this one
    // too, so a test that only counted the status could not tell which guard did it, and
    // deleting either would leave the run green.
    const mine = roster.body.users.find((user: { permission: string }) => user.permission === "owner");
    const self = await owner.patch(`/api/team/users/${mine.id}`).send({ permission: "member" }).expect(403);
    expect(self.body.error).toMatch(/your own access/i);
  });

  it("refuses a level it does not outrank, which an Owner-on-Owner change is", async () => {
    // The rank rule is not decoration even on an Owner-only route. `req.account.role` is the
    // ACCOUNT's level, and an account can hold "owner" from its own workspace while sitting in
    // someone else's -- so a subject this Owner does not outrank is reachable. Built directly
    // here because there is no route that makes a second Owner.
    const { app, owner, join } = await workspace();
    await join("member");
    const main = (app.locals.storeManager as { main: MainStore }).main;
    const roster = await owner.get("/api/team").expect(200);
    const someone = roster.body.users.find((user: { name: string }) => user.name === "member person");
    expect(main.setAccountRole(someone.accountId, "owner")?.role).toBe("owner");

    const refused = await owner.patch(`/api/team/users/${someone.id}`).send({ permission: "member" }).expect(403);
    expect(refused.body.error).toMatch(/Workspace Owner/);
  });
});

describe("the invite's permission field", () => {
  it("creates the account at the level the invite carried, not at Member always", async () => {
    // Acceptance hardcoded "member", which is why the Admin tier was unreachable rather
    // than merely unenforced: there was no way to get an Admin into a workspace at all.
    const { app, owner, orgId } = await workspace();
    await owner
      .post("/api/team/invites")
      .send({ invites: [{ email: "kit@asphaltco.com", permission: "admin" }] })
      .expect(201);
    const open = await owner.get("/api/team").expect(200);
    expect(open.body.invites[0]).toMatchObject({ email: "kit@asphaltco.com", permission: "admin" });

    const main = (app.locals.storeManager as { main: MainStore }).main;
    const [row] = main.all<{ id: string }>("SELECT id FROM invites WHERE acceptedAt IS NULL");
    const fresh = main.refreshInvite(row.id, orgId, 60_000)!;

    // The invited person sees the level before they commit to it.
    const preview = await request(app)
      .get(`/api/auth/invite/${encodeURIComponent(fresh.token)}`)
      .expect(200);
    expect(preview.body).toMatchObject({ email: "kit@asphaltco.com", permission: "admin" });

    const kit = request.agent(app);
    const joined = await kit
      .post("/api/auth/invite/accept")
      .send({ token: fresh.token, name: "Kit Alvarez", password: "Paver-Screed-2026", acceptTerms: true })
      .expect(201);
    expect(joined.body.account.role).toBe("admin");
    // And the level is real, not just recorded: Kit can do an Admin's job immediately.
    await kit.patch("/api/org").send({ name: "Asphalt Co." }).expect(200);
  });

  it("defaults to Member when no level is asked for, so an old caller means what it always did", async () => {
    const { owner } = await workspace();
    await owner
      .post("/api/team/invites")
      .send({ invites: [{ email: "plain@asphaltco.com" }] })
      .expect(201);
    expect((await owner.get("/api/team").expect(200)).body.invites[0].permission).toBe("member");
  });

  it("lets only the Owner invite an Admin, and sends the rest of the batch anyway", async () => {
    // An Admin who can mint Admins is an Owner with extra steps. Refused per row rather
    // than per request: nineteen good lines should not fail because of the twentieth.
    const { join } = await workspace();
    const admin = await join("admin");
    const batch = await admin
      .post("/api/team/invites")
      .send({
        invites: [
          { email: "ok@asphaltco.com", permission: "member" },
          { email: "nope@asphaltco.com", permission: "admin" }
        ]
      })
      .expect(201);
    // The Admin's own address was proved by following their invite link, so theirs go out
    // at once -- which is also why the good row reads "sent" rather than "held".
    expect(batch.body.results).toEqual([
      { email: "ok@asphaltco.com", status: "sent" },
      { email: "nope@asphaltco.com", status: "skipped", reason: "Only the workspace owner can invite an admin." }
    ]);
    expect(batch.body.invites.map((i: { email: string }) => i.email)).toEqual(["ok@asphaltco.com"]);
  });

  it("has no way to invite an Owner at all", async () => {
    // Not a permission check -- "owner" is not in the enum. Ownership is transferred, and
    // a workspace with two Owners has no answer to who gets billed.
    const { owner } = await workspace();
    const refused = await owner
      .post("/api/team/invites")
      .send({ invites: [{ email: "usurper@asphaltco.com", permission: "owner" }] })
      .expect(400);
    expect(refused.body.error).toBeTruthy();
  });
});

describe("the routes the permissions were waiting for", () => {
  it("deletes a job and takes its bookings, links and variances with it", async () => {
    const { owner } = await workspace();
    const boot = await owner.get("/api/bootstrap").expect(200);
    const project = boot.body.projects[0];
    // anyone on the roster: the job titles this used to pick from went on 2026-09-19
    const manager = (boot.body.users as Array<{ id: string }>)[0]!;
    const crew = boot.body.crews[0];

    const job = await owner
      .post("/api/jobs")
      .send({
        projectId: project.id,
        name: "Mill and fill, station 12+00",
        phase: "Milling",
        location: "Station 12+00",
        startDate: "2026-07-06",
        endDate: "2026-07-07",
        startTime: "07:00",
        endTime: "15:30",
        requiredLabor: 6,
        requiredEquipment: "Milling machine, skid steer",
        materialsStatus: "Delivered",
        status: "Not Started",
        priority: "Normal",
        notes: ""
      })
      .expect(201);
    const jobId = job.body.id as string;
    await owner.post("/api/schedule/assign").send({ jobId, crewId: crew.id, date: "2026-07-06" }).expect(201);

    const booked = await owner.get("/api/bootstrap").expect(200);
    expect(booked.body.assignments.some((a: { jobId: string }) => a.jobId === jobId)).toBe(true);

    await owner.delete(`/api/jobs/${jobId}`).expect(204);

    // The job is gone AND so is every row that pointed at it. An orphan booking is not merely
    // untidy: assignments.jobId is NOT NULL and bootstrap ships assignments unfiltered, so one
    // left behind would reach every client as a booking for a job that does not exist.
    const after = await owner.get("/api/bootstrap").expect(200);
    expect(after.body.jobs.some((j: { id: string }) => j.id === jobId)).toBe(false);
    expect(after.body.assignments.some((a: { jobId: string }) => a.jobId === jobId)).toBe(false);
    expect(after.body.variances.some((v: { jobId: string }) => v.jobId === jobId)).toBe(false);

    await owner.delete(`/api/jobs/${jobId}`).expect(404);
    expect(manager.id).toBeTruthy();
  });

  it("refuses a job delete to a Member and allows it to an Admin", async () => {
    const { join } = await workspace();
    const member = await join("member");
    const admin = await join("admin");
    expect((await member.delete("/api/jobs/anything").expect(403)).body.need).toBe("jobs.delete");
    // An Admin is admitted to the route and then meets the handler's own 404.
    await admin.delete("/api/jobs/anything").expect(404);
  });

  it("deletes a material line, which is a leaf with nothing to cascade", async () => {
    const { owner } = await workspace();
    const project = (await owner.get("/api/bootstrap").expect(200)).body.projects[0];
    const created = await owner
      .post("/api/materials")
      .send({
        projectId: project.id,
        name: "Tack coat",
        supplier: "Regional Asphalt",
        deliveryDate: "2026-07-02",
        status: "Ordered",
        quantity: "400 gal"
      })
      .expect(201);
    const id = created.body.id as string;
    await owner.delete(`/api/materials/${id}`).expect(204);
    expect((await owner.get("/api/bootstrap").expect(200)).body.materials.some((m: { id: string }) => m.id === id)).toBe(false);
    await owner.delete(`/api/materials/${id}`).expect(404);
  });

  it("removes a teammate's access without removing what they did", async () => {
    const { owner, join } = await workspace();
    await join("member", "crew@asphaltco.com");
    const roster = await owner.get("/api/team").expect(200);
    const person = roster.body.users.find((user: { name: string }) => user.name === "member person");
    expect(person.accountId).toBeTruthy();
    // GET /api/team reports each login's level ON the person, which is what makes a transfer
    // target pickable and a refusal explainable on the client. It used to be a separate map
    // keyed by account id; a row that outlives its login answers null, on the row itself.
    expect(person.permission).toBe("member");

    const removed = await owner.delete(`/api/team/users/${person.id}`).expect(200);
    expect(removed.body.removed).toMatchObject({ id: person.id, name: "member person" });

    const after = await owner.get("/api/team").expect(200);
    const stillThere = after.body.users.find((user: { name: string }) => user.name === "member person");
    expect(stillThere.accountId).toBeNull();
    expect(stillThere.removedAt).toBeTruthy();
    expect(stillThere.permission, "no login left, so no level").toBeNull();
  });

  it("lets a level remove only below itself, which is also what keeps a workspace owned", async () => {
    const { owner, join } = await workspace();
    const adminA = await join("admin", "admin-a@asphaltco.com");
    await join("admin", "admin-b@asphaltco.com");
    await join("member", "crew@asphaltco.com");

    // Two people here are both displayed as "admin person", so rows are addressed by account id.
    const mine = (await adminA.get("/api/auth/me").expect(200)).body.account.id as string;
    const roster = await owner.get("/api/team").expect(200);
    const rows = roster.body.users as Array<{ id: string; accountId: string | null; permission: string | null }>;
    const levelOf = (row: { permission: string | null }) => row.permission;
    const ownerRow = rows.find((row) => levelOf(row) === "owner")!;
    const otherAdmin = rows.find((row) => levelOf(row) === "admin" && row.accountId !== mine)!;
    const memberRow = rows.find((row) => levelOf(row) === "member")!;

    // An Admin may not remove another Admin. Equal ranks cannot act on each other, and that single
    // rule is the whole difference between an Admin and an Owner.
    const peer = await adminA.delete(`/api/team/users/${otherAdmin.id}`);
    expect({ status: peer.status, code: peer.body.code }).toEqual({ status: 403, code: "outranked" });
    // …nor the Owner.
    expect((await adminA.delete(`/api/team/users/${ownerRow.id}`).expect(403)).body.code).toBe("outranked");
    // …but may remove a Member.
    await adminA.delete(`/api/team/users/${memberRow.id}`).expect(200);

    /* And nobody at all removes an Owner -- not an Admin (outranked), and not the Owner themselves
       (that is leaving, which an Owner is also refused). So "the workspace always has an owner" is
       not a separate check that could be forgotten; it falls out of the rank rule. */
    const self = await owner.delete(`/api/team/users/${ownerRow.id}`);
    expect({ status: self.status, code: self.body.code }).toEqual({ status: 409, code: "self_remove" });
  });

  it("transfers ownership, demotes the outgoing Owner, and says billing did not follow", async () => {
    const { owner, join } = await workspace();
    const admin = await join("admin");
    const roster = await owner.get("/api/team").expect(200);
    const adminRow = roster.body.users.find((user: { name: string }) => user.name === "admin person");

    // Owner only.
    expect((await admin.post("/api/org/transfer").send({ accountId: adminRow.accountId }).expect(403)).body.need).toBe("org.transfer");

    const done = await owner.post("/api/org/transfer").send({ accountId: adminRow.accountId }).expect(200);
    expect(done.body.owner).toMatchObject({ id: adminRow.accountId, role: "owner" });
    expect(done.body.former.role).toBe("admin");
    // Stated in the response rather than left to be discovered: the Stripe subscription is matched
    // by email and has no workspace column, so it does not move with ownership.
    expect(done.body.billingFollowsOwner).toBe(false);

    /* The new levels are real on the very next request, because a session re-reads its account
       every time rather than caching what it was issued with. So the Owner-only routes swap sides
       with no re-login: the new Owner reaches billing, and the former one is refused it. */
    expect((await admin.post("/api/billing/portal").send({ email: "dana@asphaltco.com" }).expect(200)).body.configured).toBe(false);
    expect((await owner.post("/api/business-profile").send({ businessType: "Asphalt", selectedPlan: "pro" }).expect(403)).body.need).toBe(
      "billing.plan"
    );

    // And the roster's display copy of "Owner" moved with it.
    const after = await admin.get("/api/team").expect(200);
    const nowOwner = after.body.users.find((user: { name: string }) => user.name === "admin person");
    expect(nowOwner.title).toBe("Owner");
    expect(nowOwner.permission).toBe("owner");
  });

  it("refuses a transfer to someone outside the workspace, or to yourself", async () => {
    const { owner } = await workspace();
    await owner.post("/api/org/transfer").send({ accountId: "acct-nobody" }).expect(404);
    await owner.post("/api/org/transfer").send({}).expect(400);
    const me = (await owner.get("/api/auth/me").expect(200)).body.account.id as string;
    expect((await owner.post("/api/org/transfer").send({ accountId: me }).expect(409)).body.code).toBe("already_owner");
  });

  it("lets a Member leave and refuses the Owner, who must transfer first", async () => {
    const { app, owner, join } = await workspace();
    const member = await join("member");

    // The Owner is refused by the policy table itself: org.leave is the one capability a lower
    // level holds and the Owner does not.
    expect((await owner.post("/api/org/leave").send({}).expect(403)).body.need).toBe("org.leave");

    await member.post("/api/org/leave").send({}).expect(200);
    // The login is gone, so the same agent is signed out…
    await member.get("/api/bootstrap").expect(401);
    // …and cannot sign back in.
    await request(app).post("/api/auth/login").send({ email: "member@asphaltco.com", password: "Paver-Screed-2026" }).expect(401);
    // …while the workspace keeps the record of them.
    const after = await owner.get("/api/team").expect(200);
    expect(after.body.users.find((user: { name: string }) => user.name === "member person").removedAt).toBeTruthy();
  });
});

describe("the two ways the record could still have been lost", () => {
  it("keeps a removed teammate on the roster when the workspace is reseeded", async () => {
    /* clearWorkspace() ended with `DELETE FROM users WHERE accountId IS NULL`, which cannot tell a
       removed teammate from a seeded sample -- both have no login. So reseeding a workspace deleted
       exactly the rows migration 22 exists to preserve, taking the named author of every field
       report and variance with them. It is reachable: applyBusinessProfile clears and reseeds
       whenever the workspace has no projects, and the client's "Launch Dashboard" path can run
       more than once. */
    const { owner, join } = await workspace();
    await join("member", "crew@asphaltco.com");
    const roster = await owner.get("/api/team").expect(200);
    const person = roster.body.users.find((user: { name: string }) => user.name === "member person");
    await owner.delete(`/api/team/users/${person.id}`).expect(200);

    // Empty the workspace, which is what arms the reseed.
    for (const project of (await owner.get("/api/bootstrap").expect(200)).body.projects) {
      await owner.delete(`/api/projects/${project.id}`).expect(204);
    }
    await owner.post("/api/business-profile").send({ businessType: "Asphalt", selectedProducts: [] }).expect(200);

    const after = await owner.get("/api/team").expect(200);
    const survivor = after.body.users.find((user: { name: string }) => user.name === "member person");
    expect(survivor).toBeTruthy();
    expect(survivor.removedAt).toBeTruthy();
    // The seeded sample people DID go, which is what that statement is for.
    expect(after.body.users.some((user: { isSample: boolean; accountId: string | null }) => user.isSample && !user.accountId)).toBe(true);
  });

  it("discards a pending variance whose ripple named the deleted job", async () => {
    /* Deleting the variances ON a job is the easy half. The subtle half is a pending variance
       raised against ANOTHER job whose CPM ripple pushes this one: acceptVariance skips a leg whose
       job is missing, moves the rest, and still stamps itself accepted -- a plan half-applied and
       recorded as agreed. The ripple cannot just have the leg removed, because its shifts and
       projectSlipDays were derived together, so the pending variance is discarded instead. */
    const { app, owner, orgId } = await workspace();
    const boot = await owner.get("/api/bootstrap").expect(200);
    const [doomed, other] = boot.body.jobs as Array<{ id: string; projectId: string; name: string }>;
    expect(doomed && other).toBeTruthy();

    const manager = app.locals.storeManager as { getOrgStore: (id: string) => Promise<OrgStore> };
    const orgStore = await manager.getOrgStore(orgId);
    const proposal = {
      currentStart: "2026-07-06",
      currentEnd: "2026-07-08",
      proposedStart: "2026-07-09",
      proposedEnd: "2026-07-11",
      // The leg that names the job about to be deleted.
      ripple: [
        {
          jobId: doomed.id,
          jobName: doomed.name,
          currentStart: "2026-07-09",
          currentEnd: "2026-07-10",
          proposedStart: "2026-07-13",
          proposedEnd: "2026-07-14",
          shiftDays: 2,
          critical: true
        }
      ],
      projectSlipDays: 2,
      criticalPath: true,
      totalFloatDays: 0
    };
    orgStore.run(
      "INSERT INTO schedule_variances (id, projectId, jobId, fieldUpdateId, kind, severity, status, reportedPercent, plannedPercent, varianceDays, detectedAt, proposal) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "var-ripple",
        other.projectId,
        other.id,
        "fu-test",
        "behind",
        "High",
        "pending",
        20,
        60,
        2,
        new Date("2026-06-16").toISOString(),
        JSON.stringify(proposal)
      ]
    );
    // A resolved one naming the same job, which is history and must be left alone.
    orgStore.run(
      "INSERT INTO schedule_variances (id, projectId, jobId, fieldUpdateId, kind, severity, status, reportedPercent, plannedPercent, varianceDays, detectedAt, proposal, resolvedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "var-history",
        other.projectId,
        other.id,
        "fu-test",
        "behind",
        "Low",
        "accepted",
        20,
        60,
        2,
        new Date("2026-06-16").toISOString(),
        JSON.stringify(proposal),
        new Date("2026-06-16").toISOString()
      ]
    );

    await owner.delete(`/api/jobs/${doomed.id}`).expect(204);

    const ids = orgStore.all<{ id: string }>("SELECT id FROM schedule_variances").map((row) => row.id);
    expect(ids).not.toContain("var-ripple");
    expect(ids).toContain("var-history");
  });
});

type OrgStore = {
  run: (sql: string, params: unknown[]) => void;
  all: <T>(sql: string) => T[];
};

describe("a gated route reaches the caller's own workspace, not the shared store", () => {
  /*
   * Reported 2026-09-20 with a screen recording of the Month calendar: dragging a phase's
   * "<name> Complete" marker onto another day answered "Could not move …: Phase not found".
   *
   * `store` (app.ts) is a Proxy that resolves to `orgStoreALS.getStore() ?? mainStore`, and
   * the ALS is only bound for paths under OPS_PREFIXES. `/api/phases` was not one of them,
   * so PATCH /api/phases/:id read the SHARED main store and could not find a phase that
   * lives in the caller's own file. The same hole had already been found and fixed for
   * /api/ai, and the comment in that list describes it exactly.
   *
   * The 404 is the kinder half. Seeded phase ids are deterministic per TRADE PROFILE rather
   * than per workspace (`phase-<trade>-<n>-<name>` in businessProfiles.ts), so where an id
   * DOES exist in the main store the same request writes to the wrong database.
   */
  it("moves a phase's finish in the workspace that asked, which is what the Month marker does", async () => {
    const { owner } = await workspace();
    const boot = await owner.get("/api/bootstrap").expect(200);
    const phases = boot.body.phases as Array<{ id: string; endDate: string; startDate: string }>;
    const phase = phases.find((one) => one.endDate);
    expect(phase, "a seeded workspace has phases to drag").toBeTruthy();

    const moved = await owner
      .patch(`/api/phases/${encodeURIComponent(phase!.id)}`)
      .send({ endDate: "2026-12-24" })
      .expect(200);
    expect(moved.body).toMatchObject({ id: phase!.id, endDate: "2026-12-24" });

    // and it landed in the caller's own workspace, not somewhere else
    const again = await owner.get("/api/bootstrap").expect(200);
    expect(again.body.phases.find((one: { id: string }) => one.id === phase!.id).endDate).toBe("2026-12-24");
  });

  it("binds the tenant store for every route that reads or writes one", () => {
    /*
     * The invariant behind that bug, as a test. Any handler that touches `store` is
     * reaching for the CALLER's workspace; if its path is not under a gated prefix, the
     * Proxy hands it the shared one instead and the mistake is silent — a 404 on a good
     * request, or a write into the wrong file.
     *
     * Read out of the source because there is nowhere else it is written down: the gate is
     * a list of prefixes in app.ts and the handlers are three thousand lines below it.
     */
    const source = fs.readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
    const prefixes = (/const OPS_PREFIXES = \[(.*?)\n {2}\];/s.exec(source)?.[1].match(/"([^"]+)"/g) ?? []).map((one) =>
      one.replace(/"/g, "").toLowerCase()
    );
    expect(prefixes.length, "the gate was found").toBeGreaterThan(10);
    const gated = (path: string) => {
      const p = path.toLowerCase();
      return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
    };

    const lines = source.split("\n");
    const ungated: string[] = [];
    lines.forEach((line, index) => {
      const route = /app\.(get|post|patch|put|delete)\("(\/api\/[^"]*)"/.exec(line);
      if (!route) return;
      // the handler's own body, to its closing brace
      let depth = 0;
      const body: string[] = [];
      for (let i = index; i < Math.min(index + 120, lines.length); i += 1) {
        body.push(lines[i]);
        depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
        if (i > index && depth <= 0) break;
      }
      // `store.` and not `mainStore.` — the control database is a different thing
      if (!/(?<!main)\bstore\.\w/.test(body.join("\n"))) return;
      if (gated(route[2])) return;
      /* PUBLIC routes are allowed to fall through to the main store, and thirty-odd of
         them do it on purpose: the waitlist, the updates list, contact-sales, and the
         whole Sales and Support Desk hold data that belongs to the business rather than
         to any workspace. What cannot be right is a route that REQUIRES a session — that
         request is being made on behalf of a workspace, and reaching past it to the
         shared store is the bug this test exists for. */
      const policy = ROUTE_POLICY[`${route[1].toUpperCase()} ${route[2]}` as keyof typeof ROUTE_POLICY];
      if (!policy || policy === "public") return;
      ungated.push(`${route[1].toUpperCase()} ${route[2]} (${String(policy)})`);
    });

    expect(ungated, "these reach for a workspace the request was never bound to").toEqual([]);
  });
});
