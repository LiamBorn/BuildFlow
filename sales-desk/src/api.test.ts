/**
 * The desk falls back to sample data when the backend is not there, which is the right call
 * for a console someone opens to look around — but only because it also reports that it did.
 * The admin portal once had the same fallback WITHOUT the flag and spent weeks showing
 * constants as the platform's real contents.
 *
 * So the thing under test is the honesty flag: `live` must be false on every path that did
 * not come from the server, because SalesApp renders it as the difference between
 * "Linked to BuildFlow" and "Sample data".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLead, fetchBootstrap, fetchMessages, updateTask } from "./api";

const ok = (body: unknown) => ({ ok: true, status: 200, statusText: "OK", json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, statusText: "Server Error", json: async () => ({}) }) as Response;

beforeEach(() => vi.restoreAllMocks());

describe("reading the desk's data", () => {
  it("reports live when the backend answered", async () => {
    const payload = { leads: [], tasks: [], conversations: [], deals: [], companies: [], activities: [] };
    vi.stubGlobal("fetch", vi.fn(async () => ok(payload)));

    const result = await fetchBootstrap();
    expect(result.live).toBe(true);
    expect(result.data).toEqual(payload);
  });

  /** The whole point: sample data is fine, sample data pretending to be real is not. */
  it("says live is FALSE when it fell back to the sample", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));

    const offline = await fetchBootstrap();
    expect(offline.live, "the badge reads 'Sample data' off this").toBe(false);
    expect(offline.data, "there is still something to look at").toBeTruthy();
  });

  it("says live is FALSE when the backend answered badly, not just when it was absent", async () => {
    // A 500 is the case most likely to be mistaken for real data: something DID answer.
    vi.stubGlobal("fetch", vi.fn(async () => fail(500)));
    expect((await fetchBootstrap()).live).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => fail(401)));
    expect((await fetchBootstrap()).live).toBe(false);
  });

  it("falls back to an empty thread rather than throwing at the reader", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(503)));
    await expect(fetchMessages("conv-that-is-not-there")).resolves.toEqual([]);
  });
});

describe("writing to the desk", () => {
  /**
   * Reads fall back; WRITES must not. A create that quietly resolves would tell the person
   * their lead was saved when nothing reached the server.
   */
  it("throws when a create fails, rather than pretending it worked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(500)));
    await expect(createLead({ name: "Dana", email: "dana@asphaltco.com", company: "Asphalt Co" })).rejects.toThrow(/500/);
  });

  it("throws when an update fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(404)));
    await expect(updateTask("task-1", { done: true })).rejects.toThrow(/404/);
  });

  it("sends a create as JSON to the right route", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ok({ id: "lead-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await createLead({ name: "Dana", email: "dana@asphaltco.com", company: "Asphalt Co" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sales/leads");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: "Dana", company: "Asphalt Co" });
  });
});
