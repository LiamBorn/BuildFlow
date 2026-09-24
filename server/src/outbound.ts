/* =========================================================================
   One deadline for every call BuildFlow makes to somebody else's server.

   Node's `fetch` has no default timeout. A request to a third party that never
   answers therefore never settles: the promise stays pending, the socket stays
   open, and whoever is waiting on it — a person signing in with Google, the
   Meetings panel loading a calendar — watches a spinner instead of being told
   to try again. It does not block the event loop, so this is not an outage;
   it is a request that quietly never finishes, which is harder to notice.

   weather.ts had the right idea first (`signal: AbortSignal.timeout(8_000)`)
   and everything else was missing it. Rather than copy that line into four
   more files, the rule lives here once: one number, and one error message that
   names the service so a log line says which third party was slow.
   ========================================================================= */

/** Long enough for a slow-but-working upstream, short enough that a person is still there. */
export const OUTBOUND_TIMEOUT_MS = 8_000;

/**
 * `fetch` with a deadline, and a readable failure.
 *
 * `what` names the service in the error — "Google's token endpoint", not "fetch failed" — because
 * these all end up in the same log and the useful question is which one was slow. A timeout arrives
 * from AbortSignal as a DOMException whose name is "TimeoutError"; anything else (DNS, refused
 * connection, TLS) is a different kind of unreachable and says so.
 *
 * `timeoutMs` is a parameter so a test can use a short one. Nothing in the app passes it.
 */
export async function fetchWithDeadline(
  input: string | URL,
  init: RequestInit,
  what: string,
  timeoutMs: number = OUTBOUND_TIMEOUT_MS
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `${what} did not answer within ${Math.round(timeoutMs / 1000)}s`
        : `${what} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}
