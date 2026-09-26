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
/**
 * The vocabulary, as a VALUE with the type derived from it rather than a hand-written union.
 *
 * It was a union first, and that made one thing impossible: there was no way to ask at runtime
 * "does every capability have a holder". GRANTS is a hand-written ladder, so a capability added to
 * the union and to none of the three lists is silently denied to everyone, including the Owner --
 * and nothing notices, because the boot assertion compares routes to the table and never
 * capabilities to the grants. Deriving the type from the list makes the two impossible to disagree
 * and lets a test walk them.
 */
export const capabilities = [
  // schedule and field
  "schedule.read",
  "field.report",
  "jobs.write",
  "jobs.delete",
  "assignments.write",
  "dependencies.write",
  "variance.resolve",
  "schedule.baseline",
  "scheduletool.write",
  "calendar.write",
  "delayiq.log",
  // projects, resources, data
  "projects.write",
  "projects.delete",
  "resources.write",
  "resources.delete",
  "materials.delete",
  "sampledata.write",
  "import.preview",
  "import.commit",
  "export.data",
  // reporting and time
  "reports.read",
  "timecard.read",
  /* Putting in your OWN time (2026-09-25): every level holds it, because everyone who works can
     log what they worked. Whose time it is comes from the session, so the capability never
     reaches anybody else's entries. */
  "timecard.log",
  "timecard.approve",
  "feeds.read",
  "notify.send",
  // team
  "team.read",
  "team.invite",
  "team.invite.revoke",
  "team.permission",
  "team.remove",
  // workspace and commercial
  "org.settings",
  "billing.plan",
  "billing.pay",
  /* Declared and granted, with no route on purpose. Connecting an integration has no backend to
     connect to, and nothing in the product deletes a workspace. They are named here so the Owner's
     reserved set is complete and so the day either is built, the permission is already decided --
     which is also why the boot assertion checks routes against the table and not capabilities
     against routes: a capability ahead of its route is a plan, not a hole. */
  "integrations.connect",
  "org.danger",
  "org.transfer",
  "org.leave"
] as const;

export type Capability = (typeof capabilities)[number];

/** Every capability the product declares, for checks that have to walk them all. */
export const allCapabilities = (): Capability[] => [...capabilities];

/* ── what each level may do ───────────────────────────────────────────────────
   Straight from the approved matrix. Member is spelled out rather than derived,
   because "everything except" is how a permission model quietly grows a hole. */
const MEMBER: readonly Capability[] = [
  "schedule.read",
  "field.report",
  "export.data",
  "reports.read",
  "timecard.read",
  "timecard.log",
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
export const outranks = (actor: PermissionLevel, subject: PermissionLevel): boolean => permissionRank[actor] > permissionRank[subject];

/* ── the policy ───────────────────────────────────────────────────────────────
   Four kinds of entry:
     "public"                      no session needed
     "signed-in"                   any member of the workspace
     a Capability                  the caller's level must hold it
     { anonymous, signedIn }       open to a caller with no session, but a caller who
                                   HAS one must hold the capability

   The fourth exists for exactly one situation, and only one route is in it: buying a
   plan. A visitor on the public pricing page has no workspace yet, so requiring a
   session there would mean you must sign up before you can pay -- but a caller who is
   already inside a workspace is buying FOR that workspace, and then only its Owner may.
   One route, two callers, two right answers. Spelling it in the table keeps that visible
   instead of burying it in a handler.

   THIS TABLE FIRST SHIPPED AT TODAY'S BEHAVIOUR ON PURPOSE -- every entry was what the
   route already did, so the mechanism could be reviewed with no behaviour to argue about.
   That is history now: the rows were turned on in two later passes, the Owner-only ones and
   then the Admin ones, and each of those was a diff of this table rather than a diff of the
   server, which was the whole point of landing it empty-handed first.

   The one inline role check the codebase used to have, owner-only job-title changes, is now
   the "team.permission" row below and the conditional is gone from its handler.

   Two checks are still deliberately NOT here, because a route-level capability cannot express
   either. The commercial fields of POST /api/business-profile: one route carrying two
   permissions, since naming the trade is a workspace setting and the plan is the commercial
   relationship. And the rank rule on DELETE /api/team/users/:id, where the answer depends on
   the subject as well as the caller. Both are can()/outranks() calls that say so where they
   are.

   The keys are "METHOD <the path as Express registered it>". The boot assertion compares
   them against the live router, so a typo here is a startup failure rather than a hole. */
/** Open to a signed-out caller; a signed-in one needs the capability. See the note above. */
export type AnonymousOrCapability = { anonymous: "allow"; signedIn: Capability };

export type Policy = Capability | "public" | "signed-in" | AnonymousOrCapability;

export const ROUTE_POLICY: Record<string, Policy> = {
  /* Calendar connections (Google Calendar / Outlook), behind `integrations.connect`.
     Reading what is on your own calendar is "signed-in": the events come from the tokens on
     YOUR account and nobody else's, so there is nothing a permission level would protect.
     Making or breaking the connection is the privileged half, and that is the capability the
     workspace-permissions work declared and deliberately left unrouted until now. */
  "DELETE /api/calendar/:provider": "integrations.connect",
  "GET /api/calendar/:provider/callback": "integrations.connect",
  "GET /api/calendar/:provider/start": "integrations.connect",
  "GET /api/calendar/events": "signed-in",
  "GET /api/calendar/status": "signed-in",
  /* "Give feedback": every signed-in person may write to the product team. The session, not
     the body, says which workspace and which person it came from. */
  "POST /api/feedback": "signed-in",
  /* A person's own time: listing it is reading time cards, putting it in or taking a mistake back
     out is logging it. The handlers only ever touch the caller's own entries, so a Member's
     capability cannot reach a teammate's. */
  "GET /api/time-entries": "timecard.read",
  "POST /api/time-entries": "timecard.log",
  "DELETE /api/time-entries/:id": "timecard.log",
  /* Everybody's time, a week at a time: the people who approve time are the people who see all of
     it, so it rides the approval capability rather than a new one. A Member does not hold it. */
  "GET /api/time-entries/team": "timecard.approve",
  /* Approving a person's time, and taking an approval back. */
  "POST /api/time-entries/approve": "timecard.approve",
  "POST /api/time-entries/reopen": "timecard.approve",
  "DELETE /api/crews/:id": "resources.delete",
  "DELETE /api/equipment/:id": "resources.delete",
  "DELETE /api/jobs/:id": "jobs.delete",
  "DELETE /api/materials/:id": "materials.delete",
  "DELETE /api/projects/:id": "projects.delete",
  "DELETE /api/schedule-tool/projects/:projectId/activities/:id": "scheduletool.write",
  "DELETE /api/schedule-tool/projects/:projectId/baselines/:id": "scheduletool.write",
  "DELETE /api/schedule-tool/projects/:projectId/calendars/:id": "scheduletool.write",
  "DELETE /api/schedule-tool/projects/:projectId/relationships/:id": "scheduletool.write",
  "DELETE /api/schedule-tool/projects/:projectId/wbs/:id": "scheduletool.write",
  "DELETE /api/schedule/:id": "assignments.write",
  "DELETE /api/schedule/dependencies/:id": "dependencies.write",
  "DELETE /api/schedule/sample-data": "sampledata.write",
  "DELETE /api/team/invites/:id": "team.invite.revoke",
  "DELETE /api/team/users/:id": "team.remove",
  "GET /": "public",
  "GET /api/auth/invite/:token": "public",
  "GET /api/auth/me": "public",
  "GET /api/auth/oauth/:provider/callback": "public",
  "GET /api/auth/oauth/:provider/start": "public",
  "GET /api/auth/oauth/status": "public",
  /* The plan catalogue and whether Stripe is wired. No workspace data of any kind, and the
     public pricing page is its natural caller. */
  "GET /api/billing/status": "public",
  "GET /api/bootstrap": "schedule.read",
  "GET /api/delayIQs": "schedule.read",
  "GET /api/delayiq/early-warning": "schedule.read",
  "GET /api/feeds/:orgId/:crewId.ics": "public",
  "GET /api/field-updates": "schedule.read",
  "GET /api/health": "public",
  "GET /api/jobs": "schedule.read",
  /* The three ops rows are "public" because this table answers a different question than they
     do. It decides what a MEMBER of a workspace may do, by the role on their session; an ops
     route has no session and no workspace — it is the platform operator, guarded by
     OPS_ADMIN_TOKEN in opsAuthorized() (app.ts), or by being on localhost in dev. "public"
     here means "no workspace capability applies", not "unguarded". */
  /* "public" here means the permission LADDER does not gate these, not that anyone may call them.
     They are gated inside their handlers by the OPS_ADMIN_TOKEN header, because an operator holding
     a deployment secret is not a workspace role — there is no org to be an Owner of when you are
     taking a backup of all of them. Said out loud because this table is the first place anyone looks
     to answer "what can an anonymous caller reach?", and on that reading these four look open.
     Unset token means closed in production, so they fail shut. See app.ts's /api/ops routes. */
  "GET /api/ops/backups": "public",
  "GET /api/ops/metrics": "public",
  "GET /api/ops/stats": "public",
  "GET /api/projects": "schedule.read",
  "GET /api/projects/:id": "schedule.read",
  "GET /api/resources": "schedule.read",
  "GET /api/schedule": "schedule.read",
  "GET /api/schedule-tool/projects/:projectId": "schedule.read",
  "GET /api/schedule/dependencies": "schedule.read",
  "GET /api/schedule/digest": "schedule.read",
  "GET /api/schedule/events": "schedule.read",
  "GET /api/schedule/feeds": "feeds.read",
  "GET /api/schedule/status": "schedule.read",
  "GET /api/weather/forecast": "schedule.read",
  /* WeatherIQ's decisions (2026-09-23). Calling a job's day off releases its crew bookings and
     raises a reschedule, so it is a schedule write; keeping it on is the same person's other answer.
     The reschedule itself is accepted or rejected on the variance routes (variance.resolve). */
  "POST /api/weather/conflicts/:id/cancel": "assignments.write",
  "POST /api/weather/conflicts/:id/keep": "assignments.write",
  /* Where a project's forecast is read: the Workspace Owner and Admins, who hold projects.write. */
  "PUT /api/weather/locations/:projectId": "projects.write",
  "DELETE /api/weather/locations/:projectId": "projects.write",
  "GET /api/schedule/variances": "schedule.read",
  "GET /api/schedule/work-calendar": "schedule.read",
  "GET /api/team": "team.read",
  "GET /api/waitlist": "public",
  "GET /api/updates/subscribe": "public", // changelog subscriber count
  /* A person's own workspaces (2026-09-15): per-login, like the settings row below -- every
     level lists, creates and switches its own; the routes themselves refuse the demo and the
     limit, and a switch only to a workspace the login is a member of. */
  "GET /api/workspaces": "signed-in",
  "PATCH /api/auth/account": "public",
  "PATCH /api/crews/:id": "resources.write",
  "PATCH /api/equipment/:id": "resources.write",
  "PATCH /api/field-updates/:id": "field.report",
  "PATCH /api/jobs/:id": "jobs.write",
  "PATCH /api/materials/:id": "resources.write",
  "PATCH /api/org": "org.settings",
  /* A phase belongs to a project's plan, so moving its finish line is a project write — the same
     level that may move a job, which is the gesture it shares on the Month calendar. */
  "PATCH /api/phases/:id": "projects.write",
  "PATCH /api/projects/:id": "projects.write",
  "PATCH /api/schedule-tool/crews/:id": "scheduletool.write",
  "PATCH /api/schedule-tool/projects/:projectId": "scheduletool.write",
  "PATCH /api/schedule/:id": "assignments.write",
  "PATCH /api/team/users/:id": "team.permission",
  "POST /api/ai/ask": "schedule.read",
  "POST /api/ai/import-schedule": "import.commit",
  "POST /api/auth/demo": "public",
  "POST /api/auth/invite/accept": "public",
  "POST /api/auth/login": "public",
  "POST /api/auth/logout": "public",
  "POST /api/auth/reset": "public",
  "POST /api/auth/reset/request": "public",
  "POST /api/auth/signup": "public",
  "POST /api/auth/verify": "public",
  "POST /api/auth/verify/request": "public",
  /* Buying a plan: see the note on AnonymousOrCapability above. */
  "POST /api/billing/checkout": { anonymous: "allow", signedIn: "billing.pay" },
  /* Stripe's customer portal -- payment methods, invoices, cancellation. Owner only, and a
     session is required: the route resolves a customer from an email in the request body,
     so while it was public, anyone who knew a customer's email could open their billing. */
  "POST /api/billing/portal": "billing.pay",
  "POST /api/billing/webhook": "public",
  "POST /api/business-profile": "org.settings",
  "POST /api/contact-sales": "public",
  "POST /api/crews": "resources.write",
  "POST /api/delayIQs": "delayiq.log",
  "POST /api/delayiq/early-warning/notify": "notify.send",
  "POST /api/equipment": "resources.write",
  "POST /api/field-updates": "field.report",
  "POST /api/import/schedule/commit": "import.commit",
  "POST /api/import/schedule/preview": "import.preview",
  "POST /api/jobs": "jobs.write",
  "POST /api/materials": "resources.write",
  "POST /api/ops/backup": "public",
  /* Leaving is granted to an Admin and a Member and NOT to an Owner -- the one row in GRANTS
     where a lower level holds something the Owner does not. A workspace nobody owns cannot be
     billed, transferred or closed, so an Owner transfers first. */
  "POST /api/org/leave": "org.leave",
  "POST /api/org/transfer": "org.transfer",
  "POST /api/projects": "projects.write",
  "POST /api/schedule-tool/projects/:projectId/baselines": "scheduletool.write",
  "POST /api/schedule-tool/projects/:projectId/bootstrap": "scheduletool.write",
  "POST /api/schedule-tool/projects/:projectId/results": "scheduletool.write",
  "POST /api/schedule-tool/projects/:projectId/run": "scheduletool.write",
  "POST /api/schedule/assign": "assignments.write",
  "POST /api/schedule/baseline": "schedule.baseline",
  "POST /api/schedule/dependencies": "dependencies.write",
  "POST /api/schedule/digest/send": "notify.send",
  "POST /api/schedule/rebook": "assignments.write",
  "POST /api/schedule/sample-data": "sampledata.write",
  "POST /api/schedule/variances/:id/accept": "variance.resolve",
  "POST /api/schedule/variances/:id/reject": "variance.resolve",
  "POST /api/team/invites": "team.invite",
  "POST /api/team/invites/:id/resend": "team.invite",
  "POST /api/updates/subscribe": "public", // changelog signup from the Updates page
  "POST /api/waitlist": "public",
  "POST /api/waitlist/announce": "public",
  "POST /api/workspaces": "signed-in",
  "POST /api/workspaces/:id/switch": "signed-in",
  /* The caller's OWN settings -- tutorial progress, their saved Dashboard board. Not a
     workspace permission at all: it is per-person state, keyed to the person making the
     request, so every level has it and no capability describes it. The one row in the table
     that is deliberately "signed-in" rather than a capability. */
  "PUT /api/me/settings/:key": "signed-in",
  /* BuildFlow for Mac (2026-09-26). The Connect page and its form are "public" to this ladder because
     they answer a signed-out visitor with a page rather than a JSON 401 -- a sign-in link -- and the
     handlers themselves require a real session, refuse the demo, and check a signed, session-bound
     approval on the post (desktop.ts). The token exchange is how a key is obtained, so it cannot need
     one; the code and PKCE verifier it carries are the proof. */
  "GET /desktop/connect": "public",
  "POST /desktop/connect": "public",
  "POST /api/desktop/token": "public",
  /* Under the device gate: a device key IS a signed-in caller, acting as the login that connected it
     at that login's level. Who you are is all these two read, like the settings row above. */
  "GET /api/desktop/me": "signed-in",
  "POST /api/desktop/disconnect": "signed-in",
  /* Settings › Devices: your OWN connected Macs, per person like /api/me/settings. Revoking is limited
     to your own devices in the handler; an Owner or Admin cuts off a teammate's Macs by removing the
     teammate, which deletes the login and every key it holds. See desktop.ts. */
  "GET /api/me/devices": "signed-in",
  "DELETE /api/me/devices/:id": "signed-in",
  "PUT /api/schedule-tool/projects/:projectId/activities/:id": "scheduletool.write",
  "PUT /api/schedule-tool/projects/:projectId/baselines/:id": "scheduletool.write",
  "PUT /api/schedule-tool/projects/:projectId/calendars/:id": "scheduletool.write",
  "PUT /api/schedule-tool/projects/:projectId/relationships/:id": "scheduletool.write",
  "PUT /api/schedule-tool/projects/:projectId/wbs/:id": "scheduletool.write",
  "PUT /api/schedule/work-calendar": "calendar.write"
};

/* ── the middleware ──────────────────────────────────────────────────────────── */

/** How a request's policy is looked up: the method and the route pattern Express matched. */
export const policyKeyFor = (method: string, routePath: string) => `${method.toUpperCase()} ${routePath}`;

export type PermissionDenial = { status: 401 | 403; body: { error: string; code: string; need?: Capability } };

/**
 * The decision, kept separate from Express so it can be tested as a function.
 * `level` is null for a request with no session.
 */
export function decide(policy: Policy | undefined, level: PermissionLevel | null): PermissionDenial | null {
  // An unknown route is a closed route. `installRoutePolicy` should make this unreachable,
  // but if it is ever reached the answer is no.
  if (policy === undefined) return { status: 403, body: { error: "This action is not available.", code: "no_policy" } };
  if (policy === "public") return null;
  // A caller with no session either needs one, or is the anonymous caller this route exists to serve.
  if (!level) {
    if (typeof policy === "object") return null;
    return { status: 401, body: { error: "Please sign in to continue.", code: "signed_out" } };
  }
  if (policy === "signed-in") return null;
  const need = typeof policy === "object" ? policy.signedIn : policy;
  if (can(level, need)) return null;
  return {
    status: 403,
    body: { error: "Your workspace role does not allow this. Ask an owner or admin.", code: "forbidden", need }
  };
}

/**
 * Requests a shared read-only session may make even though they are not reads.
 *
 * Feedback is about BuildFlow, not about the workspace, so a visitor telling us something is not a
 * visitor changing what the next one sees. Signing in and out are `"public"` and never reach this.
 *
 * `POST /api/ai/ask` is here because the method is a lie about what it does: asking BuildFlow AI a
 * question is a read that happens to need a body. Its capability says so — `schedule.read` — and the
 * handler only calls `store.bootstrap` and the model. `readOnlyRefusal` reads the METHOD on purpose,
 * because three capability names hide a mutation; this is the same coin's other face, and it cost the
 * demo its most visible feature. A visitor who cannot ask the assistant anything is being shown a
 * worse product than the one on the pricing page.
 *
 * `POST /api/ai/import-schedule` is deliberately NOT here. Its capability is `import.commit` and it
 * means it: the answer becomes projects and jobs in the workspace everyone else is looking at.
 */
const READ_ONLY_EXCEPTIONS = new Set(["POST /api/feedback", "POST /api/ai/ask"]);

/**
 * Whether the shared demo is locked, from the environment.
 *
 * On by default only where the address is public. On a developer's machine, and in the test suite,
 * the demo is the sandbox nearly everything signs in as — locking it there would lock the workbench
 * rather than the shop window. `DEMO_READ_ONLY` forces it either way, which is also how the cases
 * covering the lock get one without pretending to be deployed.
 */
export function demoLockOn(env: { DEMO_READ_ONLY?: string; NODE_ENV?: string } = process.env): boolean {
  const configured = env.DEMO_READ_ONLY?.trim().toLowerCase();
  if (configured) return configured !== "off";
  return env.NODE_ENV === "production";
}

/**
 * The refusal a shared read-only session gets, or null.
 *
 * The demo workspace is ONE workspace and ONE account — `stores.ts` maps the demo org to the main
 * store — and every signed-out visitor is issued a session for it as an owner. On a developer's
 * laptop that is one person. On a public address it is every visitor at once, each able to edit or
 * delete what the others are looking at, which is what this stops.
 *
 * Decided by METHOD rather than by capability, because capability would leak: `field.report`,
 * `variance.resolve` and `delayiq.log` all change data without a name that says so, and a rule
 * matching `.write` would wave them through. A method rule refuses everything unsafe by default, so
 * a capability or route added later is refused until someone decides otherwise.
 *
 * A `"public"` route is never refused on these grounds. Those are open to a caller with no session
 * at all, so a demo session using one — joining the waitlist, asking for a reset link — is no
 * different from a stranger doing it, and blocking them would make the demo worse without making
 * anything safer.
 */
export function readOnlyRefusal(policy: Policy | undefined, method: string, key: string): PermissionDenial | null {
  if (policy === "public") return null;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (READ_ONLY_EXCEPTIONS.has(key)) return null;
  return {
    status: 403,
    body: {
      error: "The demo workspace is shared and read-only. Create a free workspace to make changes of your own.",
      code: "demo-read-only"
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
      // `app.get("setting")` is Express's settings reader, not a route. One argument means that.
      if (args.length < 2) return original(...args);
      if (typeof args[0] !== "string") {
        // A RegExp or array path would fall straight through this wrapper and be registered with no
        // guard at all. assertRoutePolicyCovers would catch it at boot, but only via how the key
        // happens to stringify, so refuse it here where the reason is legible.
        throw new Error(
          "[permissions] routes must be registered with a string path so they have a policy key. " +
            `Received ${typeof args[0]} for ${verb.toUpperCase()}.`
        );
      }
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
  /* Deliberately NOT clearing the guarded set here. It is stored per app and a fresh app has none,
     so clearing achieves nothing on the first call -- and on a second call, after routes exist, it
     would erase the record of every guard already attached and turn all of them into a false
     "never got a guard" at boot. */
}

function guard(app: express.Application, key: string): express.RequestHandler {
  guardedKeysFor(app).add(key);
  return (req, res, next) => {
    const policy = ROUTE_POLICY[key];
    const denial =
      decide(policy, req.account?.role ?? null) ??
      // after the ladder, not instead of it: a demo session is an owner, so the ladder lets it
      // through everything and this is the only thing standing between it and the next visitor's work
      (req.readOnlyDemo ? readOnlyRefusal(policy, req.method, key) : null);
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
  const stale = Object.keys(ROUTE_POLICY)
    .filter((key) => !registered.has(key))
    .sort();
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
