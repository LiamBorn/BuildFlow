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
export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** A short unique id for orgs/accounts (prefix + random). */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(9).toString("base64url")}`;
}

export const SESSION_COOKIE = "bf_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Options for the session cookie (used with Express res.cookie/clearCookie). */
export function sessionCookieOptions(maxAgeMs: number = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs,
    secure: process.env.NODE_ENV === "production"
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
