/**
 * Rate limits that hold across more than one API instance.
 *
 * In-process counters are correct for one server and wrong for two: each instance keeps its
 * own count, so N instances behind a load balancer means N times the allowance, and "five
 * wrong passwords locks the email" becomes "five per instance". These tests drive two
 * separate backends against one shared store, which is the thing that was broken.
 */
import { describe, expect, it, vi } from "vitest";
import { createLoginGuard, createMemoryBackend, createRateLimiter, createRedisBackend, type RedisLike } from "../src/rateLimit.js";
import { parseRedisUrl } from "../src/redis.js";

/**
 * A Redis that lives in this test file: enough of ZADD/ZCARD/PTTL/EVAL semantics to run the
 * real Lua scripts' logic. It is NOT a Redis emulator — it exists so two backends can share
 * one store without a server, which is the property under test.
 */
function fakeRedis() {
  const sets = new Map<string, { score: number; member: string }[]>();
  const expiries = new Map<string, number>();
  const strings = new Map<string, string>();
  let calls = 0;

  const alive = (key: string) => {
    const until = expiries.get(key);
    if (until !== undefined && until <= Date.now()) {
      sets.delete(key);
      strings.delete(key);
      expiries.delete(key);
      return false;
    }
    return true;
  };

  const command: RedisLike["command"] = async (...args) => {
    calls += 1;
    const verb = String(args[0]).toUpperCase();

    if (verb === "PTTL") {
      const key = String(args[1]);
      if (!alive(key) || !strings.has(key)) return -2;
      const until = expiries.get(key);
      return until ? until - Date.now() : -1;
    }
    if (verb === "DEL") {
      for (const key of args.slice(1).map(String)) {
        sets.delete(key);
        strings.delete(key);
        expiries.delete(key);
      }
      return 1;
    }
    if (verb === "EVAL") {
      const keyCount = Number(args[2]);
      const keys = args.slice(3, 3 + keyCount).map(String);
      const argv = args.slice(3 + keyCount).map(String);

      // The sliding-window script: one key, four args.
      if (keyCount === 1) {
        const [key] = keys;
        const [now, window, max, member] = [Number(argv[0]), Number(argv[1]), Number(argv[2]), argv[3]];
        alive(key);
        const entries = (sets.get(key) ?? []).filter((e) => e.score > now - window);
        if (entries.length >= max) {
          sets.set(key, entries);
          const retry = Math.max(1, Math.ceil((entries[0].score + window - now) / 1000));
          return [0, retry];
        }
        entries.push({ score: now, member });
        sets.set(key, entries);
        expiries.set(key, Date.now() + window);
        return [1, 0];
      }

      // The failed-sign-in script: failures key, lock key.
      const [failKey, lockKey] = keys;
      const [now, window, threshold, lockMs, member] = [Number(argv[0]), Number(argv[1]), Number(argv[2]), Number(argv[3]), argv[4]];
      alive(failKey);
      const entries = (sets.get(failKey) ?? []).filter((e) => e.score > now - window);
      entries.push({ score: now, member });
      sets.set(failKey, entries);
      expiries.set(failKey, Date.now() + window);
      if (entries.length >= threshold) {
        strings.set(lockKey, "1");
        expiries.set(lockKey, Date.now() + lockMs);
        sets.delete(failKey);
      }
      return 1;
    }
    throw new Error(`the fake does not implement ${verb}`);
  };

  return {
    command,
    get calls() {
      return calls;
    }
  };
}

/** Two backends over one store — the two API instances this is all about. */
function twoInstances() {
  const shared = fakeRedis();
  return {
    shared,
    a: createRedisBackend(shared, createMemoryBackend()),
    b: createRedisBackend(shared, createMemoryBackend())
  };
}

describe("limits that hold across instances", () => {
  it("counts one actor's requests once, whichever instance serves them", async () => {
    const { a, b } = twoInstances();
    const window = 60_000;

    // Three allowed, alternating between the instances.
    expect((await a.hit("signup", "1.2.3.4", 3, window)).ok).toBe(true);
    expect((await b.hit("signup", "1.2.3.4", 3, window)).ok).toBe(true);
    expect((await a.hit("signup", "1.2.3.4", 3, window)).ok).toBe(true);

    // The fourth is over the cap on BOTH — which is the whole point. Per-process counters
    // would have given this actor three more on instance b.
    const blockedOnB = await b.hit("signup", "1.2.3.4", 3, window);
    expect(blockedOnB.ok).toBe(false);
    expect(blockedOnB.retryAfterSec).toBeGreaterThan(0);
    expect((await a.hit("signup", "1.2.3.4", 3, window)).ok).toBe(false);
  });

  it("keeps separate actors and separate buckets apart", async () => {
    const { a } = twoInstances();
    await a.hit("signup", "1.1.1.1", 1, 60_000);
    expect((await a.hit("signup", "1.1.1.1", 1, 60_000)).ok, "same actor, same bucket").toBe(false);
    expect((await a.hit("signup", "2.2.2.2", 1, 60_000)).ok, "another actor").toBe(true);
    expect((await a.hit("login", "1.1.1.1", 1, 60_000)).ok, "same actor, another bucket").toBe(true);
  });

  it("locks an email everywhere once it has been guessed at enough times anywhere", async () => {
    const { a, b } = twoInstances();
    const guardA = createLoginGuard(a, 3);
    const guardB = createLoginGuard(b, 3);

    await guardA.noteFailure("dana@asphaltco.com");
    await guardB.noteFailure("dana@asphaltco.com");
    expect(await guardA.lockedFor("dana@asphaltco.com"), "under the threshold").toBe(0);

    await guardA.noteFailure("dana@asphaltco.com"); // the third, across two instances
    expect(await guardB.lockedFor("dana@asphaltco.com"), "the lock is visible on the other one").toBeGreaterThan(0);

    await guardB.clear("dana@asphaltco.com");
    expect(await guardA.lockedFor("dana@asphaltco.com"), "and a real sign-in clears it everywhere").toBe(0);
  });

  it("matches the email the way the in-process store did, whatever case it arrives in", async () => {
    const { a } = twoInstances();
    const guard = createLoginGuard(a, 2);
    await guard.noteFailure("Dana@AsphaltCo.com ");
    await guard.noteFailure("dana@asphaltco.com");
    expect(await guard.lockedFor("DANA@ASPHALTCO.COM")).toBeGreaterThan(0);
  });
});

describe("when Redis is not there", () => {
  const broken: RedisLike = {
    command: async () => {
      throw new Error("ECONNREFUSED");
    }
  };

  /**
   * Refusing traffic because a counter is unavailable would turn a Redis blip into an
   * outage. Falling back gives up the cross-instance guarantee and keeps the server up —
   * which is the behaviour this server had for its whole life until now.
   */
  it("counts in this process instead, and says so once rather than once per request", async () => {
    const complaints: string[] = [];
    const backend = createRedisBackend(broken, createMemoryBackend(), (e) => complaints.push(e.message));

    expect((await backend.hit("signup", "1.2.3.4", 2, 60_000)).ok).toBe(true);
    expect((await backend.hit("signup", "1.2.3.4", 2, 60_000)).ok).toBe(true);
    // The in-process store took over and is still enforcing the same cap.
    expect((await backend.hit("signup", "1.2.3.4", 2, 60_000)).ok).toBe(false);
    expect(complaints.length, "every call fell back").toBe(3);
  });

  it("falls back for the login lock too, rather than letting guesses through", async () => {
    const backend = createRedisBackend(broken, createMemoryBackend());
    const guard = createLoginGuard(backend, 2);
    await guard.noteFailure("dana@asphaltco.com");
    await guard.noteFailure("dana@asphaltco.com");
    expect(await guard.lockedFor("dana@asphaltco.com")).toBeGreaterThan(0);
  });

  it("falls back when Redis answers something the script would never return", async () => {
    const nonsense: RedisLike = { command: async () => "OK" };
    const backend = createRedisBackend(nonsense, createMemoryBackend());
    await backend.hit("signup", "1.2.3.4", 1, 60_000);
    expect((await backend.hit("signup", "1.2.3.4", 1, 60_000)).ok, "the fallback is counting").toBe(false);
  });
});

describe("the middleware over a shared backend", () => {
  it("answers 429 with Retry-After once the shared count is over", async () => {
    const { a } = twoInstances();
    const limiter = createRateLimiter(a);
    const middleware = limiter.byIp("signup", 1, 60_000);
    const req = { ip: "9.9.9.9", socket: {} } as never;

    const pass = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    middleware(req, pass as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    const blocked = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next2 = vi.fn();
    middleware(req, blocked as never, next2);
    await vi.waitFor(() => expect(blocked.json).toHaveBeenCalled());
    expect(next2).not.toHaveBeenCalled();
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });
});

describe("REDIS_URL", () => {
  it("reads host, port, credentials, database and TLS off the url", () => {
    expect(parseRedisUrl("redis://127.0.0.1:6379")).toMatchObject({ host: "127.0.0.1", port: 6379, tls: false });
    expect(parseRedisUrl("redis://cache:6380/3")).toMatchObject({ host: "cache", port: 6380, db: 3 });
    expect(parseRedisUrl("rediss://user:p%40ss@cache.example:6380")).toMatchObject({
      host: "cache.example",
      username: "user",
      password: "p@ss",
      tls: true
    });
    expect(() => parseRedisUrl("http://cache:6379")).toThrow(/redis:\/\//);
  });
});

/**
 * Against a REAL Redis, which is the only thing that runs the Lua scripts in rateLimit.ts —
 * everything above exercises the wrapper around them. Skipped unless REDIS_URL is set, so it
 * costs nothing here and runs wherever a Redis exists:
 *
 *   REDIS_URL=redis://127.0.0.1:6379 npm test -- rate-limit-shared
 */
const REAL_REDIS = process.env.REDIS_URL?.trim();
describe.skipIf(!REAL_REDIS)("against a real Redis", () => {
  it("enforces one window across two clients, and expires it", async () => {
    const { RedisClient } = await import("../src/redis.js");
    const one = RedisClient.fromUrl(REAL_REDIS!);
    const two = RedisClient.fromUrl(REAL_REDIS!);
    try {
      // A key nobody else is using, so a shared Redis is safe to run this against.
      const actor = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const a = createRedisBackend(one, createMemoryBackend());
      const b = createRedisBackend(two, createMemoryBackend());

      expect((await a.hit("spec", actor, 2, 1000)).ok).toBe(true);
      expect((await b.hit("spec", actor, 2, 1000)).ok, "the second client sees the first's count").toBe(true);
      const blocked = await a.hit("spec", actor, 2, 1000);
      expect(blocked.ok).toBe(false);
      expect(blocked.retryAfterSec).toBeGreaterThan(0);

      // The window is a sliding one, so it lets traffic through again once it has passed.
      await new Promise((r) => setTimeout(r, 1100));
      expect((await b.hit("spec", actor, 2, 1000)).ok).toBe(true);
    } finally {
      one.close();
      two.close();
    }
  });

  it("locks and unlocks an email across two clients", async () => {
    const { RedisClient } = await import("../src/redis.js");
    const one = RedisClient.fromUrl(REAL_REDIS!);
    const two = RedisClient.fromUrl(REAL_REDIS!);
    try {
      const email = `test-${Date.now()}@example.com`;
      const guardA = createLoginGuard(createRedisBackend(one, createMemoryBackend()), 2, 60_000, 60_000);
      const guardB = createLoginGuard(createRedisBackend(two, createMemoryBackend()), 2, 60_000, 60_000);

      await guardA.noteFailure(email);
      expect(await guardB.lockedFor(email)).toBe(0);
      await guardB.noteFailure(email);
      expect(await guardA.lockedFor(email), "the second failure, on the other client, locks it").toBeGreaterThan(0);
      await guardA.clear(email);
      expect(await guardB.lockedFor(email)).toBe(0);
    } finally {
      one.close();
      two.close();
    }
  });
});
