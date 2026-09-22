/**
 * What the portal is allowed to show.
 *
 * This file's subject used to have a hardcoded fallback: the anonymous fetch always got a
 * 401 from the session-gated /api/bootstrap, and the catch answered with an object shaped
 * like a fresh seed. The console rendered constants as the platform's contents, plausibly
 * enough that nobody noticed, and by the time anyone did the seed had drifted so the numbers
 * were wrong as well as fake.
 *
 * So the invariant worth a test is not "it parses JSON" — it is that **a number only ever
 * reaches the screen when the backend actually sent it**. Every failure path below is checked
 * for that, because a number on this page reads as a customer's data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlatformMetrics, opsToken, type MetricsState } from "./api";

const METRICS = {
  generatedAt: "2026-09-22T12:00:00.000Z",
  workspaces: 21,
  coldWorkspaces: 19,
  objects: 84,
  byKind: { projects: 5, jobs: 40, crews: 6, equipment: 18, materials: 15 }
};

/** A Response good enough for this module: it reads status, ok and json(). */
const answer = (status: number, body?: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => sessionStorage.clear());

/** Nothing outside the "live" branch may carry a metric, whatever went wrong. */
const carriesNoNumbers = (state: MetricsState) => {
  expect(state.status).not.toBe("live");
  expect(state).not.toHaveProperty("metrics");
};

describe("reading the platform metrics", () => {
  it("reports what the backend sent, unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(200, METRICS)));
    const state = await fetchPlatformMetrics();
    expect(state).toEqual({ status: "live", metrics: METRICS });
  });

  it("sends the operator's token as a header once there is one", async () => {
    // Typed parameters, or the mock's calls are typed `[]` and cannot be indexed.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer(200, METRICS));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlatformMetrics();
    expect(fetchMock.mock.calls[0][1]?.headers, "no token yet, so no header").toBeUndefined();

    opsToken.set("the-operator-token");
    await fetchPlatformMetrics();
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ "x-ops-token": "the-operator-token" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/ops/metrics");
  });
});

describe("when it cannot read them", () => {
  it("asks for a token on a 403, and says which of the two problems it is", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(403)));

    const anonymous = await fetchPlatformMetrics();
    expect(anonymous).toMatchObject({ status: "unavailable", needsToken: true });
    expect(anonymous, "nobody has typed a token, so the ask is for one").toMatchObject({
      reason: expect.stringContaining("OPS_ADMIN_TOKEN")
    });
    carriesNoNumbers(anonymous);

    opsToken.set("wrong-token");
    const rejected = await fetchPlatformMetrics();
    expect(rejected, "a token WAS sent, so the message must not ask for one again").toMatchObject({
      status: "unavailable",
      needsToken: true,
      reason: expect.stringContaining("rejected")
    });
    carriesNoNumbers(rejected);
  });

  it("does not ask for a token when the backend simply broke", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(500)));
    const state = await fetchPlatformMetrics();
    expect(state).toMatchObject({ status: "unavailable", needsToken: false, reason: expect.stringContaining("500") });
    carriesNoNumbers(state);
  });

  it("says so when the backend is not there at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const state = await fetchPlatformMetrics();
    expect(state).toMatchObject({ status: "unavailable", needsToken: false });
    carriesNoNumbers(state);
  });

  /** The regression this whole file exists for. */
  it("invents nothing on any failure path", async () => {
    for (const responder of [
      async () => answer(401),
      async () => answer(403),
      async () => answer(500),
      async () => answer(503),
      async () => Promise.reject(new Error("offline")),
      async () => answer(200, undefined) // a 200 whose body is not what we expect
    ]) {
      vi.stubGlobal("fetch", vi.fn(responder));
      carriesNoNumbers(await fetchPlatformMetrics());
    }
  });
});

describe("the operator's token", () => {
  it("is kept for the tab and trimmed on the way in", () => {
    opsToken.set("  padded-token  ");
    expect(opsToken.get()).toBe("padded-token");
    expect(sessionStorage.getItem("bf-admin-ops-token")).toBe("padded-token");
  });

  it("is forgotten when cleared, including when cleared with whitespace", () => {
    opsToken.set("something");
    opsToken.set("   ");
    expect(opsToken.get()).toBe("");
    expect(sessionStorage.getItem("bf-admin-ops-token")).toBeNull();
  });

  it("is empty rather than a crash when storage is unavailable", () => {
    // Private browsing, or a browser with site data blocked: sessionStorage throws on access.
    const blocked = () => {
      throw new Error("storage is blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);

    expect(() => opsToken.set("token")).not.toThrow();
    expect(opsToken.get()).toBe("");
  });
});
