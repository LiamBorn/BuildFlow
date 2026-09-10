/* =========================================================================
   In-memory rate limiting for the auth routes.

   Sliding windows keyed by whatever the route considers the actor (IP, email,
   IP+email). State lives in the process and is created per app instance, so
   tests never bleed into each other and a restart clears it. Enough to make
   password guessing and mass signup expensive; swap for a shared store when
   there is more than one API process.
   ========================================================================= */
import type { Request, Response, NextFunction } from "express";

type Hit = number[];

export type RateLimiter = {
  /** Record one hit and say whether the actor is still under `max` in the window. */
  hit(bucket: string, key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number };
  /** Express middleware: 429 with Retry-After when an IP exceeds `max` per window. */
  byIp(bucket: string, max: number, windowMs: number): (req: Request, res: Response, next: NextFunction) => void;
};

export function createRateLimiter(): RateLimiter {
  const hits = new Map<string, Hit>();
  const hit: RateLimiter["hit"] = (bucket, key, max, windowMs) => {
    const now = Date.now();
    const id = `${bucket}:${key}`;
    const recent = (hits.get(id) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(id, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
    }
    recent.push(now);
    hits.set(id, recent);
    // opportunistic cleanup so a long-running process doesn't hoard dead keys
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((at) => now - at >= windowMs)) hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  };
  return {
    hit,
    byIp: (bucket, max, windowMs) => (req, res, next) => {
      const result = hit(bucket, clientIp(req), max, windowMs);
      if (result.ok) return next();
      res.setHeader("Retry-After", String(result.retryAfterSec));
      res
        .status(429)
        .json({ error: `Too many attempts. Try again in ${humanSeconds(result.retryAfterSec)}.`, retryAfterSec: result.retryAfterSec });
    }
  };
}

/**
 * Failed-login tracking per email. After `threshold` failures inside the
 * window the email is locked for `lockMs`; a successful sign-in clears it.
 * The lock is what makes online guessing pointless — a limiter on the IP
 * alone is beaten by a botnet.
 */
export function createLoginGuard(threshold = 5, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000) {
  const failures = new Map<string, number[]>();
  const locks = new Map<string, number>();
  const norm = (email: string) => email.trim().toLowerCase();
  return {
    /** Seconds the email stays locked, or 0 when sign-in may proceed. */
    lockedFor(email: string): number {
      const until = locks.get(norm(email));
      if (!until) return 0;
      if (until <= Date.now()) {
        locks.delete(norm(email));
        return 0;
      }
      return Math.ceil((until - Date.now()) / 1000);
    },
    noteFailure(email: string) {
      const key = norm(email);
      const now = Date.now();
      const recent = (failures.get(key) ?? []).filter((at) => now - at < windowMs);
      recent.push(now);
      failures.set(key, recent);
      if (recent.length >= threshold) {
        locks.set(key, now + lockMs);
        failures.delete(key);
      }
    },
    clear(email: string) {
      failures.delete(norm(email));
      locks.delete(norm(email));
    }
  };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first ?? req.ip ?? req.socket.remoteAddress ?? "unknown").trim();
}

export function humanSeconds(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
