/* =========================================================================
   Google and Microsoft sign-in — OpenID Connect, authorization code + PKCE.

   The browser is sent to the provider from /api/auth/oauth/:provider/start and
   comes back to /api/auth/oauth/:provider/callback with a code. The code is
   exchanged server-to-server for an id_token, which names a verified email.
   That email either matches an existing account (sign in) or becomes a new
   org + owner account (sign up), same rows the password form creates.

   State (PKCE verifier, CSRF state, what the person was doing) rides in a
   short-lived signed cookie, so nothing is kept in memory across the redirect.

   Configure with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and
   MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (+ MICROSOFT_TENANT, default
   "common"). Register the callback URL <API origin>/api/auth/oauth/<provider>/callback
   with each provider. Unconfigured providers simply do not show a button.
   ========================================================================= */
import crypto from "node:crypto";

export type OAuthProvider = "google" | "microsoft";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "microsoft"];

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Accepts the id_token issuer. Microsoft's is tenant-specific, so it is a predicate. */
  issuerOk: (iss: string) => boolean;
  scope: string;
  /** Extra query params the provider wants on the authorize call. */
  extraAuthorizeParams?: Record<string, string>;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function providerConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = env("GOOGLE_CLIENT_ID");
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: env("OAUTH_GOOGLE_AUTHORIZE_URL") ?? "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: env("OAUTH_GOOGLE_TOKEN_URL") ?? "https://oauth2.googleapis.com/token",
      issuerOk: (iss) => {
        const expected = env("OAUTH_GOOGLE_ISSUER");
        return expected ? iss === expected : iss === "https://accounts.google.com" || iss === "accounts.google.com";
      },
      scope: "openid email profile",
      extraAuthorizeParams: { access_type: "online", prompt: "select_account" }
    };
  }
  const clientId = env("MICROSOFT_CLIENT_ID");
  const clientSecret = env("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const tenant = env("MICROSOFT_TENANT") ?? "common";
  return {
    clientId,
    clientSecret,
    authorizeUrl: env("OAUTH_MICROSOFT_AUTHORIZE_URL") ?? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: env("OAUTH_MICROSOFT_TOKEN_URL") ?? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    issuerOk: (iss) => {
      const expected = env("OAUTH_MICROSOFT_ISSUER");
      if (expected) return iss === expected;
      // https://login.microsoftonline.com/<tenant id>/v2.0
      return (
        /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i.test(iss) ||
        /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/i.test(iss)
      );
    },
    scope: "openid email profile",
    extraAuthorizeParams: { prompt: "select_account", response_mode: "query" }
  };
}

export function configuredProviders(): Record<OAuthProvider, boolean> {
  return { google: providerConfig("google") !== null, microsoft: providerConfig("microsoft") !== null };
}

/* ── PKCE ─────────────────────────────────────────────────────────────────── */
export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/* ── the signed state cookie ──────────────────────────────────────────────── */
export const OAUTH_COOKIE = "bf_oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthState = {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  nonce: string;
  /** What the person was doing when they clicked the button. */
  mode: "signup" | "login";
  acceptTerms: boolean;
  remember: boolean;
  /** The web app origin to send them back to. */
  returnTo: string;
  issuedAt: number;
};

// A per-process secret is fine: the cookie only has to survive one redirect
// round trip. Set BUILDFLOW_SECRET to keep flows alive across restarts.
const secret = env("BUILDFLOW_SECRET") ?? crypto.randomBytes(32).toString("hex");

/**
 * Generic over the payload since 2026-09-14, so the calendar connect flow can ride the same
 * signer rather than deriving a second secret from the same environment variable. Sign-in's
 * own call sites are unchanged: `OAuthState` is still the default.
 */
export function signState<T extends { issuedAt: number }>(state: T): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState<T extends { issuedAt: number } = OAuthState>(raw: string | undefined): T | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (Date.now() - parsed.issuedAt > OAUTH_STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ── authorize URL ────────────────────────────────────────────────────────── */
export function authorizeUrl(
  provider: OAuthProvider,
  config: ProviderConfig,
  args: { redirectUri: string; state: string; challenge: string; nonce: string }
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", args.state);
  url.searchParams.set("nonce", args.nonce);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [key, value] of Object.entries(config.extraAuthorizeParams ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/* ── code → identity ─────────────────────────────────────────────────────── */
export type OAuthIdentity = { subject: string; email: string; emailVerified: boolean; name: string };

/**
 * Exchange the code at the token endpoint and read the id_token. The token
 * comes straight from the provider over TLS in a server-to-server call, which
 * is the one situation OIDC lets a client skip signature verification; the
 * claims that matter (issuer, audience, expiry, nonce) are still checked.
 */
export async function exchangeCode(
  config: ProviderConfig,
  args: { code: string; redirectUri: string; verifier: string; nonce: string }
): Promise<OAuthIdentity> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: args.verifier
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body
  });
  if (!response.ok) throw new Error(`token endpoint answered ${response.status}`);
  const json = (await response.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("token endpoint returned no id_token");
  const claims = decodeJwtPayload(json.id_token);
  if (typeof claims.iss !== "string" || !config.issuerOk(claims.iss)) throw new Error("id_token issuer mismatch");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(config.clientId)) throw new Error("id_token audience mismatch");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new Error("id_token expired");
  if (claims.nonce !== args.nonce) throw new Error("id_token nonce mismatch");
  const email = String(claims.email ?? claims.preferred_username ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) throw new Error("provider returned no email");
  const subject = String(claims.sub ?? "");
  if (!subject) throw new Error("provider returned no subject");
  const name = String(claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(" ") ?? "").trim();
  return {
    subject,
    email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true" || typeof claims.email_verified === "undefined",
    name
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

/** Only ever send people back to the app itself. */
export function safeReturnTo(candidate: string | undefined, allowed: string[]): string {
  const fallback = allowed[0];
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return fallback;
    if (/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return url.origin;
    return allowed.some((a) => a.replace(/\/+$/, "") === url.origin) ? url.origin : fallback;
  } catch {
    return fallback;
  }
}
