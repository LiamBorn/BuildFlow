import type express from "express";
import { permissionRank, type PermissionLevel } from "@buildflow/shared";

/**
 * Workspace permissions: one policy table, one middleware, and an assertion at boot that
 * makes an ungated route impossible to ship.
 *
 * WHY A TABLE RATHER THAN CHECKS IN HANDLERS. There are 129 routes. A design that needs
 * 129 correct edits will be wrong in at least one of them, and the wrong one will be a
 * deletion. A table is also readable as a policy: you can see the whole permission
 * surface of the product in one screen, which you cannot do with conditionals scattered
 * across 3,000 lines.
 *
 * WHY THE ASSERTION MATTERS MORE THAN THE TABLE. The table is only true the day it is
 * written. `assertRoutePolicyCovers` compares it against the routes Express has actually
 * registered and throws on any route it does not name, so the server will not start if
 * someone adds a route without deciding its policy. That is the part that is still true
 * next month.
 *
 * WHERE THE CHECK HAPPENS. At the session gate in app.ts, which already resolves the
 * account before the tenant database is opened. The permission is therefore known at
 * exactly the moment the request becomes attributable, and nowhere else needs to know.
 */

/* ── capabilities ─────────────────────────────────────────────────────────────
   Named after what a person does, not after a route, so one capability can cover
   several routes and a route can be re-pathed without touching the policy. */
export type Capability =
  // schedule and field
  | "schedule.read"
  | "field.report"
  | "jobs.write"
  | "jobs.delete"
  | "assignments.write"
  | "dependencies.write"
  | "variance.resolve"
  | "schedule.baseline"
  | "scheduletool.write"
  | "calendar.write"
  | "delayiq.log"
  // projects, resources, data
  | "projects.write"
  | "projects.delete"
  | "resources.write"
  | "resources.delete"
  | "materials.delete"
  | "sampledata.write"
  | "import.preview"
  | "import.commit"
  | "export.data"
  // reporting and time
  | "reports.read"
  | "timecard.read"
  | "timecard.approve"
  | "feeds.read"
  | "notify.send"
  // team
  | "team.read"
  | "team.invite"
  | "team.invite.revoke"
  | "team.title"
  | "team.permission"
  | "team.remove"
  // workspace and commercial
  | "org.settings"
  | "billing.plan"
  | "billing.pay"
  | "integrations.connect"
  | "org.danger"
  | "org.transfer"
  | "org.leave";

/* ── what each level may do ───────────────────────────────────────────────────
   Straight from the approved matrix. Member is spelled out rather than derived,
   because "everything except" is how a permission model quietly grows a hole. */
const MEMBER: readonly Capability[] = [
  "schedule.read",
  "field.report",
  "export.data",
  "reports.read",
  "timecard.read",
  "team.read",
  "org.leave"
];

const ADMIN: readonly Capability[] = [
  ...MEMBER,
  "jobs.write",
  "jobs.delete",
  "assignments.write",
  "dependencies.write",
  "variance.resolve",
  "schedule.baseline",
  "scheduletool.write",
  "calendar.write",
  "delayiq.log",
  "projects.write",
  "projects.delete",
  "resources.write",
  "resources.delete",
  "materials.delete",
  "sampledata.write",
  "import.preview",
  "import.commit",
  "timecard.approve",
  "feeds.read",
  "notify.send",
  "team.invite",
  "team.invite.revoke",
  "team.title",
  "team.remove",
  "org.settings"
];

/** The Owner is the only level defined as "all of them", and the only one that should be. */
const OWNER: readonly Capability[] = [
  ...ADMIN.filter((c) => c !== "org.leave"),
  "team.permission",
  "billing.plan",
  "billing.pay",
  "integrations.connect",
  "org.danger",
  "org.transfer"
];

export const GRANTS: Record<PermissionLevel, ReadonlySet<Capability>> = {
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  member: new Set(MEMBER)
};

export const capabilitiesFor = (level: PermissionLevel): Capability[] => [...GRANTS[level]].sort();

export const can = (level: PermissionLevel, capability: Capability): boolean => GRANTS[level].has(capability);

/** An Admin may act on a Member but not on an Owner. Equal ranks may not act on each other. */
export const outranks = (actor: PermissionLevel, subject: PermissionLevel): boolean =>
  permissionRank[actor] > permissionRank[subject];

/* ── the policy ───────────────────────────────────────────────────────────────
   "public"    no session needed
   "signed-in" any member of the workspace
   a Capability the caller's level must hold

   THIS TABLE SHIPS AT TODAY'S BEHAVIOUR ON PURPOSE. Every entry below is what the route
   already does: "public" where it sat outside the session gate, "signed-in" where it sat
   inside it. Not one request that succeeds today starts failing because of this file.

   That includes the single role check the codebase already had -- owner-only job-title
   changes, an inline conditional in app.ts. It stays exactly where it is, and its route
   is marked "signed-in" here so the middleware adds nothing on top of it. Moving that
   decision into the table is a later step, because doing it now would widen the route to
   Admins in the same commit that introduces the mechanism.

   So this is reviewable as a mechanism with no behaviour to argue about. Turning on the
   Owner-only rows and then the Admin rows is a diff of this table rather than a diff of
   the server.

   The keys are "METHOD <the path as Express registered it>". The boot assertion compares
   them against the live router, so a typo here is a startup failure rather than a hole. */
export const ROUTE_POLICY: Record<string, Capability | "public" | "signed-in"> = {
  "DELETE /api/crews/:id": "signed-in",
  "DELETE /api/equipment/:id": "signed-in",
  "DELETE /api/projects/:id": "signed-in",
  "DELETE /api/sales/companies/:id": "public",
  "DELETE /api/sales/deals/:id": "public",
  "DELETE /api/sales/leads/:id": "public",
  "DELETE /api/sales/tasks/:id": "public",
  "DELETE /api/schedule-tool/projects/:projectId/activities/:id": "signed-in",
  "DELETE /api/schedule-tool/projects/:projectId/baselines/:id": "signed-in",
  "DELETE /api/schedule-tool/projects/:projectId/calendars/:id": "signed-in",
  "DELETE /api/schedule-tool/projects/:projectId/relationships/:id": "signed-in",
  "DELETE /api/schedule-tool/projects/:projectId/wbs/:id": "signed-in",
  "DELETE /api/schedule/:id": "signed-in",
  "DELETE /api/schedule/dependencies/:id": "signed-in",
  "DELETE /api/schedule/sample-data": "signed-in",
  "DELETE /api/support/agents/:id": "public",
  "DELETE /api/team/invites/:id": "signed-in",
  "DELETE /api/team/users/:id": "signed-in",
  "GET /": "public",
  "GET /api/auth/invite/:token": "public",
  "GET /api/auth/me": "public",
  "GET /api/auth/oauth/:provider/callback": "public",
  "GET /api/auth/oauth/:provider/start": "public",
  "GET /api/auth/oauth/status": "public",
  "GET /api/billing/status": "signed-in",
  "GET /api/bootstrap": "signed-in",
  "GET /api/delayIQs": "signed-in",
  "GET /api/delayiq/early-warning": "signed-in",
  "GET /api/feeds/:orgId/:crewId.ics": "public",
  "GET /api/field-updates": "signed-in",
  "GET /api/health": "public",
  "GET /api/jobs": "signed-in",
  "GET /api/ops/backups": "public",
  "GET /api/projects": "signed-in",
  "GET /api/projects/:id": "signed-in",
  "GET /api/resources": "signed-in",
  "GET /api/sales/bootstrap": "public",
  "GET /api/schedule": "signed-in",
  "GET /api/schedule-tool/projects/:projectId": "signed-in",
  "GET /api/schedule/dependencies": "signed-in",
  "GET /api/schedule/digest": "signed-in",
  "GET /api/schedule/events": "signed-in",
  "GET /api/schedule/feeds": "signed-in",
  "GET /api/schedule/status": "signed-in",
  "GET /api/schedule/variances": "signed-in",
  "GET /api/schedule/work-calendar": "signed-in",
  "GET /api/support/agents": "public",
  "GET /api/support/conversations": "public",
  "GET /api/support/conversations/:id/messages": "public",
  "GET /api/team": "signed-in",
  "GET /api/waitlist": "public",
  "PATCH /api/auth/account": "public",
  "PATCH /api/crews/:id": "signed-in",
  "PATCH /api/equipment/:id": "signed-in",
  "PATCH /api/field-updates/:id": "signed-in",
  "PATCH /api/jobs/:id": "signed-in",
  "PATCH /api/org": "signed-in",
  "PATCH /api/projects/:id": "signed-in",
  "PATCH /api/sales/companies/:id": "public",
  "PATCH /api/sales/deals/:id": "public",
  "PATCH /api/sales/leads/:id": "public",
  "PATCH /api/sales/tasks/:id": "public",
  "PATCH /api/schedule-tool/crews/:id": "signed-in",
  "PATCH /api/schedule-tool/projects/:projectId": "signed-in",
  "PATCH /api/schedule/:id": "signed-in",
  "PATCH /api/support/conversations/:id": "public",
  "PATCH /api/team/users/:id": "signed-in",
  "POST /api/ai/ask": "signed-in",
  "POST /api/ai/import-schedule": "signed-in",
  "POST /api/auth/demo": "public",
  "POST /api/auth/invite/accept": "public",
  "POST /api/auth/login": "public",
  "POST /api/auth/logout": "public",
  "POST /api/auth/reset": "public",
  "POST /api/auth/reset/request": "public",
  "POST /api/auth/signup": "public",
  "POST /api/auth/verify": "public",
  "POST /api/auth/verify/request": "public",
  "POST /api/billing/checkout": "signed-in",
  "POST /api/billing/portal": "signed-in",
  "POST /api/billing/webhook": "public",
  "POST /api/business-profile": "signed-in",
  "POST /api/contact-sales": "public",
  "POST /api/crews": "signed-in",
  "POST /api/delayIQs": "signed-in",
  "POST /api/delayiq/early-warning/notify": "signed-in",
  "POST /api/equipment": "signed-in",
  "POST /api/field-updates": "signed-in",
  "POST /api/import/schedule/commit": "signed-in",
  "POST /api/import/schedule/preview": "signed-in",
  "POST /api/jobs": "signed-in",
  "POST /api/materials": "signed-in",
  "POST /api/ops/backup": "public",
  "POST /api/projects": "signed-in",
  "POST /api/sales/activities": "public",
  "POST /api/sales/companies": "public",
  "POST /api/sales/deals": "public",
  "POST /api/sales/leads": "public",
  "POST /api/sales/leads/:id/calls": "public",
  "POST /api/sales/leads/:id/email": "public",
  "POST /api/sales/leads/:id/meetings": "public",
  "POST /api/sales/leads/:id/text": "public",
  "POST /api/sales/tasks": "public",
  "POST /api/schedule-tool/projects/:projectId/baselines": "signed-in",
  "POST /api/schedule-tool/projects/:projectId/bootstrap": "signed-in",
  "POST /api/schedule-tool/projects/:projectId/results": "signed-in",
  "POST /api/schedule-tool/projects/:projectId/run": "signed-in",
  "POST /api/schedule/assign": "signed-in",
  "POST /api/schedule/baseline": "signed-in",
  "POST /api/schedule/dependencies": "signed-in",
  "POST /api/schedule/digest/send": "signed-in",
  "POST /api/schedule/rebook": "signed-in",
  "POST /api/schedule/sample-data": "signed-in",
  "POST /api/schedule/variances/:id/accept": "signed-in",
  "POST /api/schedule/variances/:id/reject": "signed-in",
  "POST /api/support/agents": "public",
  "POST /api/support/conversations": "public",
  "POST /api/support/conversations/:id/messages": "public",
  "POST /api/team/invites": "signed-in",
  "POST /api/team/invites/:id/resend": "signed-in",
  "POST /api/waitlist": "public",
  "POST /api/waitlist/announce": "public",
  "PUT /api/me/settings/:key": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/activities/:id": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/baselines/:id": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/calendars/:id": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/relationships/:id": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/wbs/:id": "signed-in",
  "PUT /api/schedule/work-calendar": "signed-in",
};

/* ── the middleware ──────────────────────────────────────────────────────────── */

/** How a request's policy is looked up: the method and the route pattern Express matched. */
export const policyKeyFor = (method: string, routePath: string) => `${method.toUpperCase()} ${routePath}`;

export type PermissionDenial = { status: 401 | 403; body: { error: string; code: string; need?: Capability } };

/**
 * The decision, kept separate from Express so it can be tested as a function.
 * `level` is null for a request with no session.
 */
export function decide(
  policy: Capability | "public" | "signed-in" | undefined,
  level: PermissionLevel | null
): PermissionDenial | null {
  // An unknown route is a closed route. `installRoutePolicy` should make this unreachable,
  // but if it is ever reached the answer is no.
  if (policy === undefined) return { status: 403, body: { error: "This action is not available.", code: "no_policy" } };
  if (policy === "public") return null;
  if (!level) return { status: 401, body: { error: "Please sign in to continue.", code: "signed_out" } };
  if (policy === "signed-in") return null;
  if (can(level, policy)) return null;
  return {
    status: 403,
    body: {
      error: "Your workspace role does not allow this. Ask an owner or admin.",
      code: "forbidden",
      need: policy
    }
  };
}

/**
 * The keys `installRoutePolicy` attached a guard to, kept on the app rather than in a
 * module-level Set: createApp runs once per test file, and a shared Set would let one
 * app's install wipe another's record of what it had covered.
 */
const guardedKeysFor = (app: express.Application): Set<string> => {
  const existing = app.locals.routePolicyGuarded as Set<string> | undefined;
  if (existing) return existing;
  const fresh = new Set<string>();
  app.locals.routePolicyGuarded = fresh;
  return fresh;
};

const ROUTE_VERBS = ["get", "post", "put", "patch", "delete"] as const;
type RouteVerb = (typeof ROUTE_VERBS)[number];

/**
 * Puts the permission check in front of every route, without editing 129 call sites.
 *
 * HOW. Called at the top of createApp, before a single route is registered, it replaces
 * app.get/post/put/patch/delete with versions that prepend the guard to the handler list.
 * Registration is the one moment when the method and the path pattern are both in hand as
 * literals, so the policy key needs no path matching at all -- no second implementation of
 * Express's matcher to drift out of step with Express's.
 *
 * It also means a route whose key is not in ROUTE_POLICY throws AS IT IS REGISTERED, with
 * the method and path in the message, rather than at the end of boot.
 *
 * WHY NOT ONE app.use. A pre-routing middleware sees only req.path, so it would have to
 * re-derive which pattern matched -- and get "/api/projects/summary" vs
 * "/api/projects/:id" right by itself. This way Express does that work, as it already does.
 *
 * Only app.use and the verbs above register routes in this server, and there is no
 * app.all / app.options / app.head. If one is added, `assertRoutePolicyCovers` catches it:
 * the route appears in the router and has no guard and no entry.
 */
export function installRoutePolicy(app: express.Application): void {
  for (const verb of ROUTE_VERBS) {
    const original = app[verb].bind(app) as (...args: unknown[]) => unknown;
    // `app.get("setting")` is Express's settings reader, not a route. It is not used in
    // this server, but passing a single argument straight through costs nothing and makes
    // the wrapper safe for anyone who does.
    const wrapped = (...args: unknown[]) => {
      if (args.length < 2 || typeof args[0] !== "string") return original(...args);
      const path = args[0];
      const key = policyKeyFor(verb, path);
      if (!(key in ROUTE_POLICY)) {
        throw new Error(
          `[permissions] ${key} has no entry in ROUTE_POLICY (server/src/permissions.ts). ` +
            `Decide who may call it -- a Capability, "signed-in", or "public" -- and add it there.`
        );
      }
      return original(path, guard(app, key), ...args.slice(1));
    };
    (app as unknown as Record<RouteVerb, unknown>)[verb] = wrapped;
  }
  guardedKeysFor(app).clear();
}

function guard(app: express.Application, key: string): express.RequestHandler {
  guardedKeysFor(app).add(key);
  return (req, res, next) => {
    const denial = decide(ROUTE_POLICY[key], req.account?.role ?? null);
    if (!denial) return next();
    res.status(denial.status).json(denial.body);
  };
}

/**
 * Refuses to let the server start with a hole in it. Three ways to fail:
 *   - Express has a route the policy does not name.
 *   - The policy names a route Express does not have (so the entry is a lie, or a typo
 *     that leaves the real route uncovered).
 *   - A route exists, has an entry, and yet never got a guard -- which is what registering
 *     it some way other than the five wrapped verbs looks like.
 */
export function assertRoutePolicyCovers(app: express.Application): void {
  const registered = new Set<string>();
  const walk = (stack: unknown[]): void => {
    type Layer = { route?: { path: string; methods?: Record<string, boolean> }; handle?: { stack?: unknown[] } };
    for (const layer of stack as Layer[]) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods ?? {})) {
          if (method === "_all") continue;
          registered.add(policyKeyFor(method, layer.route.path));
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  const router = (app as unknown as { router?: { stack: unknown[] } }).router;
  if (!router) throw new Error("[permissions] cannot read the Express router to verify the policy");
  walk(router.stack);

  const missing = [...registered].filter((key) => !(key in ROUTE_POLICY)).sort();
  const stale = Object.keys(ROUTE_POLICY).filter((key) => !registered.has(key)).sort();
  const guarded = guardedKeysFor(app);
  const unguarded = [...registered].filter((key) => key in ROUTE_POLICY && !guarded.has(key)).sort();
  if (missing.length || stale.length || unguarded.length) {
    const section = (heading: string, keys: string[]) => (keys.length ? ["", heading, ...keys.map((k) => `  ${k}`)] : []);
    throw new Error(
      [
        "[permissions] the route policy and the router disagree.",
        ...section("Routes with NO policy (add them to ROUTE_POLICY in server/src/permissions.ts):", missing),
        ...section("Policy entries for routes that no longer exist (remove them):", stale),
        ...section("Routes that never got a guard (registered before installRoutePolicy, or by an unwrapped verb):", unguarded)
      ].join("\n")
    );
  }
}
