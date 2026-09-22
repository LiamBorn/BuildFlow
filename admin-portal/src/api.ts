// The portal is a separate site but stays LINKED to BuildFlow: it reads real
// platform counts from the BuildFlow backend (Vite proxies /api → :4300).
//
// It reads GET /api/ops/metrics, not /api/bootstrap. Two reasons, and the first
// one was a bug: /api/bootstrap is behind the server's session gate, so the
// anonymous fetch this file used to make always got a 401, and the catch below
// used to answer with a hardcoded object that matched a fresh seed. The console
// rendered constants as the workspace's contents — plausible enough that nobody
// noticed, and already wrong (the seed has since drifted).
//
// The second reason is that a credential would not have fixed it. /api/bootstrap
// returns the CALLER'S OWN workspace, and an operator has no workspace, so there
// is nothing for a platform console to ask it. /api/ops/metrics answers the
// question this console actually asks — how much is on the platform — in
// integers, guarded by the OPS_ADMIN_TOKEN the operator already holds.
//
// There is no fallback any more. When the call fails we say so; we never invent a
// number, because a number on this page reads as a customer's data.

export type PlatformMetrics = {
  generatedAt: string;
  /** Registered workspaces (the `orgs` registry), not just those with data. */
  workspaces: number;
  /** Workspaces counted as zero because their store has never been opened. */
  coldWorkspaces: number;
  /** projects + jobs + crews + equipment + materials, across all workspaces. */
  objects: number;
  byKind: { projects: number; jobs: number; crews: number; equipment: number; materials: number };
};

/** Three states, never two: "we could not read it" is not the same as "it is zero". */
export type MetricsState =
  | { status: "loading" }
  | { status: "live"; metrics: PlatformMetrics }
  | { status: "unavailable"; reason: string; needsToken: boolean };

const TOKEN_KEY = "bf-admin-ops-token";

/** The operator's OPS_ADMIN_TOKEN, for this tab only.
 *  Deliberately NOT a build-time constant: baking the platform admin token into the
 *  bundle would serve it to anyone who loads the portal. The operator pastes the token
 *  they hold, and it lives in sessionStorage so closing the tab discards it. */
export const opsToken = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set: (value: string) => {
    try {
      if (value.trim()) sessionStorage.setItem(TOKEN_KEY, value.trim());
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode / storage blocked — the token just won't persist across reloads */
    }
  }
};

export async function fetchPlatformMetrics(): Promise<MetricsState> {
  const token = opsToken.get();
  try {
    const res = await fetch("/api/ops/metrics", {
      headers: token ? { "x-ops-token": token } : undefined
    });
    if (res.status === 403) {
      return {
        status: "unavailable",
        reason: token
          ? "That ops token was rejected by the BuildFlow backend."
          : "This BuildFlow backend requires an ops token (OPS_ADMIN_TOKEN).",
        needsToken: true
      };
    }
    if (!res.ok) {
      return { status: "unavailable", reason: `BuildFlow backend answered ${res.status}.`, needsToken: false };
    }
    /* A 200 is not on its own a reason to believe there are numbers here. An empty body, a
       null, or anything that is not the shape this console reads would otherwise put it in
       the "live" state carrying nothing, and the page would render undefined as a count —
       which is the same lie as the hardcoded fallback, arrived at differently. */
    const body = (await res.json()) as PlatformMetrics | null;
    if (!body || typeof body !== "object" || typeof body.objects !== "number") {
      return { status: "unavailable", reason: "The BuildFlow backend answered with something this console cannot read.", needsToken: false };
    }
    return { status: "live", metrics: body };
  } catch {
    return { status: "unavailable", reason: "Could not reach the BuildFlow backend.", needsToken: false };
  }
}

// Where the main BuildFlow HUD is served in this dev environment.
export const BUILDFLOW_URL = "http://localhost:5301";
