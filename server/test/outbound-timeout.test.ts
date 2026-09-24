/**
 * A third party that never answers does not hold a BuildFlow request open forever.
 *
 * Node's `fetch` has no default timeout. Every call this server makes to somebody else — Google's
 * token endpoint during sign-in, either calendar provider, Twilio, the weather service — was therefore
 * a promise that could stay pending indefinitely if the far end accepted the connection and then said
 * nothing. It does not block the event loop, so it is not an outage; it is a request that quietly never
 * finishes, which is the harder kind to notice. Somebody signing in watches a spinner that will never
 * resolve into either a workspace or an error.
 *
 * weather.ts already did this correctly and inline. The point of outbound.ts is that the other five
 * call sites did not, and that the next one added will inherit it rather than have to remember.
 *
 * The server below is the whole test: it accepts the socket and never replies. That is the case a
 * status-code check cannot reach and a mocked fetch cannot honestly simulate — an upstream that is
 * neither up nor down.
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OUTBOUND_TIMEOUT_MS, fetchWithDeadline } from "../src/outbound.js";

/** Accepts the request and never answers it. */
let silent: http.Server;
let silentUrl = "";
/** Answers immediately, so "it always fails" cannot pass for "it times out". */
let prompt: http.Server;
let promptUrl = "";

const listen = (server: http.Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
    });
  });

beforeAll(async () => {
  silent = http.createServer(() => {
    /* deliberately no response, ever */
  });
  prompt = http.createServer((_req, res) => res.end(JSON.stringify({ ok: true })));
  silentUrl = await listen(silent);
  promptUrl = await listen(prompt);
});

afterAll(() => {
  silent.closeAllConnections?.();
  prompt.closeAllConnections?.();
  silent.close();
  prompt.close();
});

/** The Error a call was refused with. Typed, because `.catch(e => e as Error)` on a Promise<Response>
 *  widens to `Error | Response`, and then nothing can read `.message` off it. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  let thrown: unknown;
  let resolved = false;
  try {
    await promise;
    resolved = true;
  } catch (error) {
    thrown = error;
  }
  expect(resolved, "the call should have been refused, not answered").toBe(false);
  return thrown as Error;
}

describe("fetchWithDeadline", () => {
  it("gives up on an upstream that accepts the connection and says nothing", async () => {
    await expect(fetchWithDeadline(silentUrl, {}, "The test service", 250)).rejects.toThrow();
  });

  it("says which service was slow, because they all log to the same place", async () => {
    const failure = await rejection(fetchWithDeadline(silentUrl, {}, "Google Calendar", 250));
    expect(failure.message).toContain("Google Calendar");
    expect(failure.message, "and that it was a timeout rather than a refusal").toMatch(/did not answer/i);
  });

  it("keeps the original failure as the cause, so a log can still show the DOMException", async () => {
    const failure = await rejection(fetchWithDeadline(silentUrl, {}, "The test service", 250));
    expect((failure.cause as Error | undefined)?.name).toBe("TimeoutError");
  });

  it("distinguishes unreachable from slow — a refused connection is not a timeout", async () => {
    // port 1 on loopback refuses immediately; nothing is listening and nothing ever will be
    const failure = await rejection(fetchWithDeadline("http://127.0.0.1:1/", {}, "The test service", 250));
    expect(failure.message).toMatch(/could not be reached/i);
    expect(failure.message).not.toMatch(/did not answer/i);
  });

  it("passes a working request straight through — a deadline that refuses everything is not a deadline", async () => {
    const res = await fetchWithDeadline(promptUrl, {}, "The test service", 250);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses a deadline a person is still waiting through, not one they have given up on", async () => {
    expect(OUTBOUND_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000);
    expect(OUTBOUND_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});
