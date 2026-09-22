/* =========================================================================
   Rate limiting for the auth routes.

   Sliding windows keyed by whatever the route considers the actor (IP, email,
   IP+email), plus a per-email lock that makes online password guessing pointless.

   WHERE THE STATE LIVES. It used to live in the process, which is correct for one
   API and wrong for two: each instance would keep its own count, so N instances
   behind a load balancer meant N times the allowance, and "five wrong passwords
   locks the email" became "five per instance". With REDIS_URL set the counters
   move to Redis and the limits hold across every instance; without it the
   in-process store is used exactly as before, which is the right default for a
   single server and for the tests.

   FALLING BACK IS DELIBERATE. If Redis is unreachable, slow, or answers something
   unexpected, the in-process store answers instead. That is a real decision: the
   alternative is refusing traffic because a counter is unavailable, which turns a
   Redis blip into an outage. The consequence — during a Redis outage the limits go
   back to being per-instance — is the behaviour this server had for its whole life
   until now, so it is a degradation to a known-liveable state rather than a new
   failure mode.
   ========================================================================= */
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { RedisClient, type RedisValue } from "./redis.js";

export type HitResult = { ok: boolean; retryAfterSec: number };

/** Where the counters live. Both implementations below answer exactly the same way. */
export type LimitBackend = {
  /** Record one hit; say whether the actor is still under `max` within the window. */
  hit(bucket: string, key: string, max: number, windowMs: number): Promise<HitResult>;
  /** Seconds this email stays locked out, or 0. */
  lockedFor(email: string, lockMs: number): Promise<number>;
  /** Note a failed sign-in; lock the email once `threshold` is reached in the window. */
  noteFailure(email: string, threshold: number, windowMs: number, lockMs: number): Promise<void>;
  /** A successful sign-in wipes the slate. */
  clear(email: string): Promise<void>;
  readonly kind: "memory" | "redis";
};

const normaliseEmail = (email: string) => email.trim().toLowerCase();

/* ────────────────────────── in-process ────────────────────────── */

export function createMemoryBackend(): LimitBackend {
  const hits = new Map<string, number[]>();
  const failures = new Map<string, number[]>();
  const locks = new Map<string, number>();

  return {
    kind: "memory",
    async hit(bucket, key, max, windowMs) {
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
    },
    async lockedFor(email) {
      const key = normaliseEmail(email);
      const until = locks.get(key);
      if (!until) return 0;
      if (until <= Date.now()) {
        locks.delete(key);
        return 0;
      }
      return Math.ceil((until - Date.now()) / 1000);
    },
    async noteFailure(email, threshold, windowMs, lockMs) {
      const key = normaliseEmail(email);
      const now = Date.now();
      const recent = (failures.get(key) ?? []).filter((at) => now - at < windowMs);
      recent.push(now);
      failures.set(key, recent);
      if (recent.length >= threshold) {
        locks.set(key, now + lockMs);
        failures.delete(key);
      }
    },
    async clear(email) {
      const key = normaliseEmail(email);
      failures.delete(key);
      locks.delete(key);
    }
  };
}

/* ─────────────────────────────── Redis ─────────────────────────────── */

/**
 * One sliding window, atomically. Doing this as separate commands would race: two
 * instances could both read a count under the limit and both write, letting the
 * limit through twice. A script is one round trip and Redis runs it alone.
 */
const HIT_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= max then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = 1
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
    if retry < 1 then retry = 1 end
  end
  return {0, retry}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {1, 0}`;

/** Note a failure and, at the threshold, set the lock — again in one atomic step. */
const FAILURE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])
local lockMs = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('PEXPIRE', KEYS[1], window)
if redis.call('ZCARD', KEYS[1]) >= threshold then
  redis.call('SET', KEYS[2], '1', 'PX', lockMs)
  redis.call('DEL', KEYS[1])
end
return 1`;

/** A unique sorted-set member per hit: the score is the time, so members must not collide. */
const member = () => `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

export type RedisLike = { command(...args: (string | number)[]): Promise<RedisValue> };

/**
 * Redis-backed counters, with `fallback` answering whenever Redis does not.
 *
 * Every method is wrapped: a rejection, a disconnect, or a reply that is not the shape
 * the script promises all lead to the same place. `onFallback` is called so the decision
 * is visible in the log rather than silently changing the server's behaviour.
 */
export type RedisBackendOptions = {
  /** Namespaces every key. Instances that should share a count must share this. */
  keyPrefix?: string;
  onFallback?: (error: Error) => void;
};

export function createRedisBackend(client: RedisLike, fallback: LimitBackend, options: RedisBackendOptions = {}): LimitBackend {
  const prefix = options.keyPrefix ?? "bf:";
  const onFallback = options.onFallback;
  const guard = async <T>(work: () => Promise<T>, instead: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      onFallback?.(error instanceof Error ? error : new Error(String(error)));
      return instead();
    }
  };

  return {
    kind: "redis",
    hit: (bucket, key, max, windowMs) =>
      guard(
        async () => {
          const reply = await client.command("EVAL", HIT_SCRIPT, 1, `${prefix}rl:${bucket}:${key}`, Date.now(), windowMs, max, member());
          if (!Array.isArray(reply)) throw new Error("unexpected reply");
          return { ok: Number(reply[0]) === 1, retryAfterSec: Number(reply[1] ?? 0) };
        },
        () => fallback.hit(bucket, key, max, windowMs)
      ),
    lockedFor: (email, lockMs) =>
      guard(
        async () => {
          const ttl = await client.command("PTTL", `${prefix}lg:lock:${normaliseEmail(email)}`);
          const ms = Number(ttl);
          return ms > 0 ? Math.ceil(ms / 1000) : 0;
        },
        () => fallback.lockedFor(email, lockMs)
      ),
    noteFailure: (email, threshold, windowMs, lockMs) =>
      guard(
        async () => {
          const key = normaliseEmail(email);
          await client.command(
            "EVAL",
            FAILURE_SCRIPT,
            2,
            `${prefix}lg:fail:${key}`,
            `${prefix}lg:lock:${key}`,
            Date.now(),
            windowMs,
            threshold,
            lockMs,
            member()
          );
        },
        () => fallback.noteFailure(email, threshold, windowMs, lockMs)
      ),
    clear: (email) =>
      guard(
        async () => {
          const key = normaliseEmail(email);
          await client.command("DEL", `${prefix}lg:fail:${key}`, `${prefix}lg:lock:${key}`);
        },
        () => fallback.clear(email)
      )
  };
}

/**
 * The backend this process should use: Redis when REDIS_URL is set, the in-process store
 * otherwise. Connecting is lazy, so a missing Redis costs nothing at boot — the first
 * request that needs a counter finds out, falls back, and says so once.
 */
export function createBackendFromEnv(env: NodeJS.ProcessEnv = process.env): LimitBackend {
  const url = env.REDIS_URL?.trim();
  const memory = createMemoryBackend();
  if (!url) return memory;
  let complained = false;
  const client = RedisClient.fromUrl(url);
  /* Under test every createApp() would otherwise share one namespace, and the suite's own
     sign-ups would eat the 10-per-hour signup cap between them — 49 tests failed with 429
     the first time the suite was run against a real Redis. A namespace per app keeps the
     tests independent while still exercising the Redis path through the real routes. The
     cross-instance property is proved where it belongs, by the tests that deliberately
     point two backends at one prefix. */
  const keyPrefix = env.NODE_ENV === "test" ? `bf-test:${crypto.randomBytes(6).toString("hex")}:` : "bf:";
  return createRedisBackend(client, memory, {
    keyPrefix,
    onFallback: (error) => {
      if (complained) return; // one line, not one per request
      complained = true;
      console.error(`[ratelimit] Redis unavailable (${error.message}); counting per-process until it returns.`);
    }
  });
}

/* ────────────────────────── what routes use ────────────────────────── */

export type RateLimiter = {
  hit(bucket: string, key: string, max: number, windowMs: number): Promise<HitResult>;
  /** Express middleware: 429 with Retry-After when an IP exceeds `max` per window. */
  byIp(bucket: string, max: number, windowMs: number): (req: Request, res: Response, next: NextFunction) => void;
  readonly backend: LimitBackend["kind"];
};

export function createRateLimiter(backend: LimitBackend = createMemoryBackend()): RateLimiter {
  return {
    backend: backend.kind,
    hit: (bucket, key, max, windowMs) => backend.hit(bucket, key, max, windowMs),
    byIp: (bucket, max, windowMs) => (req, res, next) => {
      backend
        .hit(bucket, clientIp(req), max, windowMs)
        .then((result) => {
          if (result.ok) return next();
          res.setHeader("Retry-After", String(result.retryAfterSec));
          res.status(429).json({
            error: `Too many attempts. Try again in ${humanSeconds(result.retryAfterSec)}.`,
            retryAfterSec: result.retryAfterSec
          });
        })
        /* The backend already falls back rather than throwing, so reaching here means
           something unforeseen. Let the request through: a limiter that cannot count is
           not a reason to refuse a sign-in. */
        .catch((error) => {
          console.error("[ratelimit] letting a request through after an unexpected failure:", error);
          next();
        });
    }
  };
}

/**
 * Failed-login tracking per email. After `threshold` failures inside the window the email
 * is locked for `lockMs`; a successful sign-in clears it. The lock is what makes online
 * guessing pointless — a limiter on the IP alone is beaten by a botnet.
 */
export function createLoginGuard(
  backend: LimitBackend = createMemoryBackend(),
  threshold = 5,
  windowMs = 15 * 60 * 1000,
  lockMs = 15 * 60 * 1000
) {
  return {
    lockedFor: (email: string) => backend.lockedFor(email, lockMs),
    noteFailure: (email: string) => backend.noteFailure(email, threshold, windowMs, lockMs),
    clear: (email: string) => backend.clear(email)
  };
}

/**
 * The actor every limiter above is keyed on.
 *
 * This reads `req.ip`, which Express derives from X-Forwarded-For ONLY when the app has
 * been told which proxies to trust (`app.set("trust proxy", ...)`, driven by TRUST_PROXY
 * in app.ts). That distinction is the whole point: this function used to read the header
 * itself, unconditionally. Any client can send X-Forwarded-For, so any client could mint
 * a fresh bucket on every request and walk straight through all of the limiters — the
 * signup cap, the login cap, and the 5-per-15-minutes caps on "email me a verification
 * link" and "email me a reset link", which is an open mail cannon pointed at any address.
 *
 * Untrusted input must not choose its own rate-limit key, so the header is honoured only
 * where the deployment has said a proxy is in front and is rewriting it.
 */
export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? "unknown").trim();
}

export function humanSeconds(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
