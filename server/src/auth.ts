/* =========================================================================
   Authentication primitives — hand-rolled on Node's built-in `crypto`, so
   there are NO dependencies to install and the whole thing works offline,
   consistent with the rest of the server (sql.js, no cloud).

   - Passwords: scrypt (salted, memory-hard) → `scrypt$<saltHex>$<hashHex>`,
     verified in constant time. Plaintext is never stored.
   - Sessions: opaque 256-bit random tokens (unguessable, no signing secret to
     manage) kept in the `sessions` table and sent as an httpOnly cookie.

   The session store lives in database.ts; this file is pure, testable crypto.
   ========================================================================= */
import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;
// N=16384 (2^14) keeps memory ~16MB (128*N*r), comfortably under scrypt's 32MB
// default maxmem while staying memory-hard. r=8, p=1 are the standard params.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** Hash a plaintext password for storage. Returns `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time verify of a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** A fresh opaque session token (URL-safe, unguessable). */
/** A one-time token for email links (verify / reset). URL-safe, 256 bits. */
export function newAuthToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Constant-time compare for a secret that arrives as a string — a feed key, an ops token.
 * `===` on a secret returns as soon as two bytes differ, so how long it took is a clue to
 * how much of the guess was right. Length is not hidden (and does not need to be); the
 * comparison of equal-length secrets is what has to be flat.
 */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Tokens are stored hashed, so a copy of the database cannot be used to reset passwords. */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * A BuildFlow for Mac device key: `bfd_` and 256 random bits. The prefix is there so a key is
 * recognisable wherever it turns up -- a secret scanner, a pasted log, a support ticket -- and so the
 * device gate can refuse anything that is not even shaped like one before touching the database.
 */
export const DEVICE_KEY_PREFIX = "bfd_";
const DEVICE_KEY_SHAPE = /^bfd_[A-Za-z0-9_-]{43}$/;

export function newDeviceKey(): string {
  return `${DEVICE_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export function isDeviceKeyShape(value: string): boolean {
  return DEVICE_KEY_SHAPE.test(value);
}

/**
 * The device key in an `Authorization: Bearer bfd_…` header, or null. The one place a device key is
 * read from: never a cookie, a query string or a body, so it cannot ride along on a link or a form.
 */
export function bearerDeviceKey(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  return isDeviceKeyShape(match[1]) ? match[1] : null;
}

/** PKCE S256 (RFC 7636 §4.6): does this verifier hash to the challenge the code was bound to? Constant-time. */
export function pkceVerifierMatches(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return secretsMatch(computed, challenge);
}

/** A short unique id for orgs/accounts (prefix + random). */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(9).toString("base64url")}`;
}

export const SESSION_COOKIE = "bf_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Whether the cookies this server sets must be HTTPS-only.
 *
 * One rule, in one place, because there were two. The session cookie and the OAuth state
 * cookie asked NODE_ENV; the calendar state cookie asked `req.secure` — which is FALSE
 * behind a TLS-terminating proxy, the ordinary production shape, unless trust proxy is
 * configured AND the proxy sends X-Forwarded-Proto. So the one cookie that used a
 * different rule was the one that quietly dropped Secure in exactly the deployment where
 * it mattered, and it carried an OAuth state and PKCE verifier.
 *
 * `req.secure` is still honoured when it is true, so a dev server actually serving HTTPS
 * gets the flag as well.
 */
export function cookiesAreSecure(req?: { secure?: boolean }): boolean {
  return process.env.NODE_ENV === "production" || req?.secure === true;
}

/** Options for the session cookie (used with Express res.cookie/clearCookie).
 *  Pass `null` for a browser-session cookie — one the browser drops when it
 *  closes. That's "Keep me signed in" unchecked; the default stays SESSION_TTL_MS. */
export function sessionCookieOptions(maxAgeMs: number | null = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    // maxAge must be OMITTED for a session cookie — passing null/0 would expire
    // it immediately instead of tying it to the browser session.
    ...(maxAgeMs === null ? {} : { maxAge: maxAgeMs }),
    secure: cookiesAreSecure()
  };
}

/** Parse a raw `Cookie:` header into a name→value map (no cookie-parser dep). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
