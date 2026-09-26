/**
 * Signing in on the way to connecting a Mac (BuildFlow for Mac, step 2).
 *
 * The Connect page is rendered by the server, not by this app (server/src/desktop.ts). When nobody is
 * signed in it links here as `/?next=/desktop/connect?…#create-account`, and once a REAL sign-in has
 * happened the app sends the person straight back to it to press "Connect this Mac".
 *
 * The destination is kept in sessionStorage for the rest of this tab's visit, because a sign-in can
 * leave the page and come back without its query: Google and Microsoft return to `/?oauth=login`.
 * The demo fallback never resumes it — only enterAfterAuth does, which runs after a real sign-in —
 * and the server refuses to connect the demo in any case.
 *
 * Only a path to the Connect page on this same origin is ever followed, so `next` cannot be turned
 * into a redirect to anywhere else.
 */
const STORAGE_KEY = "buildflow.desktopConnectNext";
const CONNECT_PATH = "/desktop/connect?";

/** A path back to the Connect page on this origin, or null. Nothing else is ever followed. */
export function safeDesktopConnectPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith(CONNECT_PATH) || raw.length > 2000) return null;
  // no backslashes or whitespace: nothing a browser could read as a different place
  if (/[\\\s]/.test(raw)) return null;
  return raw;
}

const readStored = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Keep a `?next=` that points at the Connect page for the rest of this visit, and take it out of the address. */
export function rememberDesktopConnect(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const next = safeDesktopConnectPath(params.get("next"));
  if (!next) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage refused (a private window): the address still carries it until the sign-in
    return;
  }
  params.delete("next");
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

/** Where a sign-in on this visit should go back to, if it began on the Connect page. */
export function pendingDesktopConnect(): string | null {
  if (typeof window === "undefined") return null;
  return safeDesktopConnectPath(new URLSearchParams(window.location.search).get("next")) ?? safeDesktopConnectPath(readStored());
}

export function forgetDesktopConnect(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}

/** How the app leaves for the Connect page: a real page load, since the server renders it. Tests replace `go`. */
export const desktopConnectNavigation = {
  go: (url: string) => window.location.assign(url)
};

/** After a real sign-in: back to the Connect page if this visit started there. True when it navigated. */
export function resumeDesktopConnect(): boolean {
  const next = pendingDesktopConnect();
  if (!next) return false;
  forgetDesktopConnect();
  desktopConnectNavigation.go(next);
  return true;
}
