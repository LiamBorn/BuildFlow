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
