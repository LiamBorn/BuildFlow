/* =========================================================================
   BuildFlow for Mac — connecting a Mac, and the routes it talks to.

   THE RULE. The notch app exists only as a download, and the server holds it to that: every route
   under /api/desktop accepts ONE credential, a device key sent as `Authorization: Bearer bfd_…`.
   A browser's session cookie is not read there at all, so a signed-in browser gets 401. The only
   way to get a key is the hand-off below, which starts in the app.

   THE HAND-OFF (PKCE, RFC 7636, the same protection the Google sign-in uses):
     1. The Mac makes a verifier, and opens
        GET /desktop/connect?code_challenge=S256(verifier)&code_challenge_method=S256
            &state=…&redirect_uri=buildflow://connect&device_name=…
        in an ASWebAuthenticationSession, which shares Safari's cookies.
     2. That page is rendered HERE, not by the web app: the web app answers a 401 by quietly signing
        in as the shared demo, and a Mac must never land on the demo by accident. Signed out, it
        links to the website's sign-in, which comes back here. Signed in as the demo, it refuses.
        Otherwise it asks "Connect this Mac?" and posts the answer back with a signed, session-bound
        token, so no other site can press the button for you.
     3. Approving mints a single-use code that lives five minutes, bound to the challenge, the
        workspace and the name you approved, and redirects to buildflow://connect?code=…&state=….
     4. The Mac posts {code, code_verifier} to /api/desktop/token and gets its key, once.

   WHAT IS STORED. The SHA-256 of the key and of the code — never either value, like auth_tokens.
   Neither reaches a log line either: the request log never writes headers, bodies or query values
   (requestLog.ts), and nothing here logs them.
   ========================================================================= */
import express from "express";
import { z } from "zod";
import { permissionLevelLabels, type DesktopDevice } from "@buildflow/shared";
import { DEMO_ACCOUNT_EMAIL, DEMO_ORG_ID, type Account, type BuildFlowStore, type DesktopDeviceRow, type Org } from "./database.js";
import { bearerDeviceKey, hashToken, parseCookies, pkceVerifierMatches, secretsMatch, SESSION_COOKIE } from "./auth.js";
import { readState, signState } from "./oauth.js";
import type { RateLimiter } from "./rateLimit.js";
import { registerDesktopAskRoutes, type DesktopAskHooks } from "./desktopAsk.js";

/** The only place a connect code may be sent. The Mac registers this scheme; nothing else is accepted. */
export const DESKTOP_REDIRECT_URI = "buildflow://connect";
export const DESKTOP_API_PREFIX = "/api/desktop";
/** Under the prefix but reachable without a key, because it is how a key is obtained. */
export const DESKTOP_TOKEN_PATH = "/api/desktop/token";
/** A connect code is spent within seconds by the app; five minutes covers a slow network and no more. */
export const CONNECT_CODE_TTL_MS = 5 * 60 * 1000;
/** "Last seen" is written at most this often: every write rewrites the whole control database. */
export const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;
/** A bound on connected Macs per login, so a reinstall loop cannot grow the table without end. */
export const MAX_DEVICES_PER_ACCOUNT = 10;

const QUARTER = 15 * 60 * 1000;

/** Whether a path is under /api/desktop, compared in one case like the session gate's list. */
export function isDesktopApiPath(path: string): boolean {
  const p = path.toLowerCase();
  return p === DESKTOP_API_PREFIX || p.startsWith(`${DESKTOP_API_PREFIX}/`);
}

export function isDemoIdentity(account: Pick<Account, "email">, org: Pick<Org, "id">): boolean {
  return account.email === DEMO_ACCOUNT_EMAIL || org.id === DEMO_ORG_ID;
}

/** A login reaches a workspace it was created in, or one it is a member of (migration 24). */
export function belongsTo(mainStore: BuildFlowStore, account: Account, orgId: string): boolean {
  return account.orgId === orgId || Boolean(mainStore.workspaceMembership(account.id, orgId));
}

/* ── the shapes the API speaks ────────────────────────────────────────────── */

export function toDesktopDevice(row: DesktopDeviceRow, workspaceName: string): DesktopDevice {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    appVersion: row.appVersion,
    workspace: { id: row.orgId, name: workspaceName },
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt
  };
}

/* ── what the Mac sends ───────────────────────────────────────────────────── */

/** S256 of 32 random bytes, base64url without padding: exactly 43 characters. */
const CHALLENGE_SHAPE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 §4.1: 43–128 unreserved characters. */
const VERIFIER_SHAPE = /^[A-Za-z0-9._~-]{43,128}$/;
/** The Mac's CSRF nonce, echoed back untouched. Unreserved characters only, so it needs no escaping anywhere. */
const STATE_SHAPE = /^[A-Za-z0-9._~-]{8,256}$/;

/* A device name and a version string are shown on a page and in a list, so a newline or an escape in
   one is stripped; matching the control range IS the point. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Something a person can read in a list: control characters out, whitespace folded, 80 characters. */
export function cleanDeviceName(raw: unknown, fallback = "Mac"): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return cleaned || fallback;
}

/** A version or OS string the app reports. Short, printable, or nothing. */
function cleanLabel(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(CONTROL_CHARACTERS, "").trim().slice(0, max);
  return cleaned || null;
}

export type ConnectRequest = { challenge: string; state: string; deviceName: string };

/** The Connect page's query, checked. Each refusal names what was wrong, for the page to say. */
export function readConnectRequest(query: Record<string, unknown>): { ok: true; request: ConnectRequest } | { ok: false; reason: string } {
  const one = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  if (one("redirect_uri") !== DESKTOP_REDIRECT_URI) return { ok: false, reason: "It did not come from BuildFlow for Mac." };
  if (one("code_challenge_method") !== "S256") return { ok: false, reason: "It asked for a sign-in method BuildFlow does not use." };
  if (!CHALLENGE_SHAPE.test(one("code_challenge"))) return { ok: false, reason: "Part of it is missing or damaged." };
  if (!STATE_SHAPE.test(one("state"))) return { ok: false, reason: "Part of it is missing or damaged." };
  return {
    ok: true,
    request: { challenge: one("code_challenge"), state: one("state"), deviceName: cleanDeviceName(query.device_name) }
  };
}

/** What the "Connect this Mac" button posts back: signed, and only good for the session that saw the page. */
type ConnectApproval = ConnectRequest & {
  kind: "desktop-connect";
  /** SHA-256 of the session token the page was shown to. */
  sid: string;
  accountId: string;
  orgId: string;
  issuedAt: number;
};

const tokenSchema = z.object({
  code: z.string().min(1).max(200),
  code_verifier: z.string().regex(VERIFIER_SHAPE),
  device_name: z.string().max(200).optional(),
  app_version: z.string().max(200).optional(),
  platform: z.string().max(200).optional()
});

/* ── the device gate's decision ───────────────────────────────────────────── */

export type DeviceAuth =
  | { ok: true; device: DesktopDeviceRow; account: Account; org: Org }
  | { ok: false; body: { error: string; code: "device_key_required" | "device_key_invalid" | "device_revoked" } };

/**
 * Who a request under /api/desktop is, from its Authorization header and nothing else. The answer
 * is always 401 when it is not a live key, with a code the Mac can act on: `device_revoked` means
 * this Mac was disconnected (forget the key, offer Connect); the others mean the same thing less
 * specifically. A key whose login has gone, whose workspace has gone or that belongs to the demo is
 * no key at all.
 */
export function authenticateDevice(mainStore: BuildFlowStore, authorization: string | undefined): DeviceAuth {
  const key = bearerDeviceKey(authorization);
  if (!key) {
    return {
      ok: false,
      body: { error: "This needs BuildFlow for Mac. Connect this Mac to BuildFlow to continue.", code: "device_key_required" }
    };
  }
  const invalid = {
    ok: false as const,
    body: { error: "This Mac is not connected to BuildFlow. Connect it again.", code: "device_key_invalid" as const }
  };
  const device = mainStore.desktopDeviceByKey(key);
  if (!device) return invalid;
  if (device.revokedAt) {
    return { ok: false, body: { error: "This Mac was disconnected from BuildFlow. Connect it again.", code: "device_revoked" } };
  }
  const account = mainStore.getAccountById(device.accountId);
  const org = mainStore.getOrg(device.orgId);
  if (!account || !org || isDemoIdentity(account, org) || !belongsTo(mainStore, account, org.id)) return invalid;
  return { ok: true, device, account, org };
}

/* ── the Connect page ─────────────────────────────────────────────────────── */

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The policy for these pages: nothing loads but their own inline styles, nothing frames them, and a
 * form may post only here -- and follow the redirect to buildflow://, which `form-action` also governs.
 */
const CONNECT_PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' buildflow:"
].join("; ");

type PageTone = "ask" | "stop" | "done";

function connectPage(options: { title: string; lead: string; tone: PageTone; body?: string }): string {
  const mark = options.tone === "stop" ? "!" : "&#8599;";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(options.title)} · BuildFlow</title>
<style>
  :root { color-scheme: light dark; --ground: #f4f4f2; --card: #ffffff; --ink: #1c1c1a; --muted: #62625e; --line: #e4e4df; --soft: #f6f6f3; --stop: #9e1f18; }
  @media (prefers-color-scheme: dark) { :root { --ground: #121211; --card: #1b1b19; --ink: #f4f3f0; --muted: #a8a7a2; --line: #2e2e2b; --soft: #232320; --stop: #eb8178; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--ground); color: var(--ink); font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(420px, 100%); display: grid; gap: 14px; padding: 28px; border-radius: 20px; background: var(--card); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.02em; }
  .mark { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; font-weight: 700; color: var(--card); background: ${options.tone === "stop" ? "var(--stop)" : "var(--ink)"}; }
  h1 { margin: 4px 0 0; font-size: 20px; line-height: 1.3; letter-spacing: -0.02em; text-wrap: balance; }
  p { margin: 0; color: var(--muted); }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--soft); }
  dt { color: var(--muted); }
  dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  dd span { display: block; font-weight: 400; color: var(--muted); }
  form { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 0; }
  button, .button { appearance: none; border: 1px solid var(--ink); cursor: pointer; padding: 10px 16px; border-radius: 999px; font: inherit; font-weight: 600; text-decoration: none; }
  .primary { background: var(--ink); color: var(--card); }
  .secondary { background: transparent; color: var(--ink); border-color: var(--line); }
  .button { justify-self: start; }
  .note { font-size: 13px; }
</style>
</head>
<body>
<main>
  <span class="brand"><span class="mark" aria-hidden="true">${mark}</span>BuildFlow for Mac</span>
  <h1>${escapeHtml(options.title)}</h1>
  <p>${escapeHtml(options.lead)}</p>
  ${options.body ?? ""}
</main>
</body>
</html>`;
}

function sendPage(res: express.Response, status: number, html: string) {
  res.setHeader("Content-Security-Policy", CONNECT_PAGE_CSP);
  // A page carrying a session-bound approval token is never kept by a cache.
  res.setHeader("Cache-Control", "no-store");
  res.status(status).type("html").send(html);
}

const TRY_AGAIN = "Open BuildFlow on your Mac and choose Connect again.";

/* ── the routes ───────────────────────────────────────────────────────────── */

export type DesktopRouteDeps = {
  mainStore: BuildFlowStore;
  /** The caller's workspace store: `store` in app.ts, bound for /api/desktop by the device gate. */
  store: BuildFlowStore;
  limiter: RateLimiter;
  /** The website's origin, for the sign-in link when this process does not serve the pages itself. */
  webOrigin: () => string;
  /** Step 6, voice (desktopAsk.ts): the question limit, the calendar read and the schedule announcer it shares with the website. */
  voice: DesktopAskHooks;
};

export function registerDesktopRoutes(app: express.Application, { mainStore, store, limiter, webOrigin, voice }: DesktopRouteDeps) {
  const workspaceName = (orgId: string) => mainStore.getOrg(orgId)?.name ?? "";

  /** The website's sign-in, set to come back to this exact Connect page once it has a real session. */
  const signInHref = (req: express.Request) => {
    const base = req.app.locals.servesPages ? "" : webOrigin().replace(/\/+$/, "");
    return `${base}/?next=${encodeURIComponent(req.originalUrl)}#create-account`;
  };
  const signInBody = (req: express.Request, label: string) =>
    `<a class="button primary" href="${escapeHtml(signInHref(req))}">${escapeHtml(label)}</a>
  <p class="note">After you sign in, you come straight back here to finish connecting.</p>`;
  const atDeviceLimit = (accountId: string) => mainStore.desktopDevicesForAccount(accountId).length >= MAX_DEVICES_PER_ACCOUNT;
  const limitPage = () =>
    connectPage({
      tone: "stop",
      title: `You already have ${MAX_DEVICES_PER_ACCOUNT} Macs connected`,
      lead: "Disconnect one you no longer use in BuildFlow under Settings › Devices, then connect this one."
    });

  /* 1. The page the Mac opens. */
  app.get("/desktop/connect", limiter.byIp("desktop-connect", 60, QUARTER), (req, res) => {
    const asked = readConnectRequest(req.query as Record<string, unknown>);
    if (!asked.ok) {
      sendPage(res, 400, connectPage({ tone: "stop", title: "This link can't connect a Mac", lead: `${asked.reason} ${TRY_AGAIN}` }));
      return;
    }
    const sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const account = req.account;
    const org = req.org;
    if (!sessionToken || !account || !org) {
      sendPage(
        res,
        200,
        connectPage({
          tone: "ask",
          title: "Sign in to connect this Mac",
          lead: `Sign in to your BuildFlow account to connect ${asked.request.deviceName}.`,
          body: signInBody(req, "Sign in to BuildFlow")
        })
      );
      return;
    }
    if (isDemoIdentity(account, org)) {
      sendPage(
        res,
        403,
        connectPage({
          tone: "stop",
          title: "The demo can't connect a Mac",
          lead: "The demo workspace is shared by every visitor, so it can't be connected to a Mac. Sign in with your own account.",
          body: signInBody(req, "Sign in with your account")
        })
      );
      return;
    }
    if (atDeviceLimit(account.id)) {
      sendPage(res, 409, limitPage());
      return;
    }
    const approval = signState<ConnectApproval>({
      kind: "desktop-connect",
      sid: hashToken(sessionToken),
      accountId: account.id,
      orgId: org.id,
      ...asked.request,
      issuedAt: Date.now()
    });
    sendPage(
      res,
      200,
      connectPage({
        tone: "ask",
        title: "Connect this Mac?",
        lead: `BuildFlow in your notch will see your notifications, jobs, meetings and tasks in ${org.name}, as you.`,
        body: `<dl>
    <dt>Mac</dt><dd>${escapeHtml(asked.request.deviceName)}</dd>
    <dt>Workspace</dt><dd>${escapeHtml(org.name)}</dd>
    <dt>You</dt><dd>${escapeHtml(account.name)}<span>${escapeHtml(account.email)} · ${escapeHtml(permissionLevelLabels[account.role])}</span></dd>
  </dl>
  <form method="post" action="/desktop/connect">
    <input type="hidden" name="approval" value="${escapeHtml(approval)}">
    <button class="primary" type="submit" name="decision" value="allow">Connect this Mac</button>
    <button class="secondary" type="submit" name="decision" value="deny">Cancel</button>
  </form>
  <p class="note">To connect a different workspace, switch to it in BuildFlow first. You can disconnect this Mac any time in Settings › Devices.</p>`
      })
    );
  });

  /* 2. The answer. A form post, so it has its own parser: the app's is JSON only. */
  app.post(
    "/desktop/connect",
    limiter.byIp("desktop-connect-approve", 20, QUARTER),
    express.urlencoded({ extended: false, limit: "8kb" }),
    (req, res) => {
      const expired = () =>
        sendPage(res, 403, connectPage({ tone: "stop", title: "This page has expired", lead: `Nothing was connected. ${TRY_AGAIN}` }));
      /* The signed approval below is what stops another site pressing this button for you; this is the
         cheap check in front of it. A browser says where a form post came from, and only this page
         posts here. Absent (an older browser), the approval still has to verify. */
      const site = req.headers["sec-fetch-site"];
      if (typeof site === "string" && site !== "same-origin") return expired();
      const approval = readState<ConnectApproval>(typeof req.body?.approval === "string" ? req.body.approval : undefined);
      const sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const account = req.account;
      const org = req.org;
      if (
        !approval ||
        approval.kind !== "desktop-connect" ||
        !sessionToken ||
        !account ||
        !org ||
        !secretsMatch(approval.sid, hashToken(sessionToken)) ||
        approval.accountId !== account.id ||
        approval.orgId !== org.id
      ) {
        return expired();
      }
      if (isDemoIdentity(account, org)) {
        sendPage(res, 403, connectPage({ tone: "stop", title: "The demo can't connect a Mac", lead: "Sign in with your own account." }));
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      if (req.body?.decision !== "allow") {
        res.redirect(303, `${DESKTOP_REDIRECT_URI}?${new URLSearchParams({ error: "access_denied", state: approval.state })}`);
        return;
      }
      if (atDeviceLimit(account.id)) {
        sendPage(res, 409, limitPage());
        return;
      }
      const code = mainStore.createDesktopConnectCode({
        accountId: account.id,
        orgId: org.id,
        challenge: approval.challenge,
        deviceName: approval.deviceName,
        ttlMs: CONNECT_CODE_TTL_MS
      });
      res.redirect(303, `${DESKTOP_REDIRECT_URI}?${new URLSearchParams({ code, state: approval.state })}`);
    }
  );

  /* 3. The code for a key. Reachable without a key (the gate lets this one path through) and without
     a cookie (the gate never reads one under /api/desktop): the code and the verifier are the proof. */
  app.post(DESKTOP_TOKEN_PATH, limiter.byIp("desktop-token", 20, QUARTER), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Send code and code_verifier from the Connect page.", code: "invalid_request" });
      return;
    }
    const refused = () =>
      res.status(400).json({ error: "This connection has expired or was already used. Connect this Mac again.", code: "invalid_grant" });
    // Spent by this attempt whatever happens next, so a wrong verifier burns the code too.
    const grant = mainStore.consumeDesktopConnectCode(parsed.data.code);
    if (!grant || !pkceVerifierMatches(parsed.data.code_verifier, grant.challenge)) return refused();
    const account = mainStore.getAccountById(grant.accountId);
    const org = mainStore.getOrg(grant.orgId);
    if (!account || !org || !belongsTo(mainStore, account, org.id)) return refused();
    if (isDemoIdentity(account, org)) {
      res.status(403).json({ error: "The demo workspace can't connect a Mac.", code: "demo_account" });
      return;
    }
    if (atDeviceLimit(account.id)) {
      res.status(409).json({
        error: `This account already has ${MAX_DEVICES_PER_ACCOUNT} Macs connected. Disconnect one in Settings › Devices.`,
        code: "device_limit"
      });
      return;
    }
    const { key, device } = mainStore.createDesktopDevice({
      accountId: account.id,
      orgId: org.id,
      // the name the person approved on the page wins; the body's is the fallback
      name: grant.deviceName || cleanDeviceName(parsed.data.device_name),
      platform: cleanLabel(parsed.data.platform, 80),
      appVersion: cleanLabel(parsed.data.app_version, 40)
    });
    res.status(201).json({ key, device: toDesktopDevice(device, org.name) });
  });

  /* 4. What a device key can do today. Both run behind the device gate, with the caller's workspace bound. */
  app.get("/api/desktop/me", (req, res) => {
    const account = req.account!;
    const org = req.org!;
    // The workspace's own record of the person, which is the name the Dashboard greets them by.
    const me = store.users().find((user) => user.accountId === account.id && !user.removedAt);
    const name = me?.name ?? account.name;
    res.json({
      firstName: name.trim().split(/\s+/)[0] || name,
      name,
      workspace: org.name,
      role: account.role,
      device: toDesktopDevice(req.device!, org.name)
    });
  });

  app.post("/api/desktop/disconnect", (req, res) => {
    mainStore.revokeDesktopDevice(req.device!.id);
    res.json({ ok: true });
  });

  /* Step 6, voice: asking out loud, and Accept or Reject on a proposed change. */
  registerDesktopAskRoutes(app, { store, ...voice });

  /* 5. The website's half: your own connected Macs, and taking one back. Session cookie, as ever. */
  app.get("/api/me/devices", (req, res) => {
    const devices = mainStore.desktopDevicesForAccount(req.account!.id).map((row) => toDesktopDevice(row, workspaceName(row.orgId)));
    res.json({ devices });
  });

  app.delete("/api/me/devices/:id", (req, res) => {
    const device = mainStore.desktopDevice(String(req.params.id));
    // Somebody else's Mac and no Mac at all get the same answer.
    if (!device || device.accountId !== req.account!.id) {
      res.status(404).json({ error: "That Mac isn't connected to your account.", code: "device_not_found" });
      return;
    }
    const revoked = mainStore.revokeDesktopDevice(device.id)!;
    res.json({ device: toDesktopDevice(revoked, workspaceName(revoked.orgId)) });
  });
}
