/**
 * Record links on a cold load (notch plan, step 5): `#open/…`, the one scheme @buildflow/shared's
 * recordLinks writes and reads. The Mac's notch opens a notification, a job, a meeting or a task in
 * the browser with one of these, and a fresh page load has to land on the thing itself.
 *
 * It works the way a schedule link does (schedule/useScheduleContext.ts): the link in the address
 * when the page first loads is remembered; a load that finds a session follows it once the workspace
 * is in; a load that finds nobody keeps it, and signing in follows it. Where each kind lands is App's
 * `openDestination` — the bell's own click-through — so a link and the bell cannot disagree.
 *
 * Followed once, and taken out of the address as it is followed: App never writes an `#open/…` link
 * into the address itself, so one there is always one somebody followed, never this tab's leftover,
 * and a reload afterwards stays where the person went rather than jumping back.
 */
import { parseLinkHash, type LinkDestination } from "@buildflow/shared";

let pending: LinkDestination | null = typeof window !== "undefined" ? parseLinkHash(window.location.hash) : null;

/** An `#open/…` link in the address right now becomes the pending one. Answers it, or null. */
export function noteOpenLink(): LinkDestination | null {
  const link = typeof window !== "undefined" ? parseLinkHash(window.location.hash) : null;
  if (link) pending = link;
  return link;
}

/** The pending link, once, and out of the address: whoever calls this follows it. */
export function consumeOpenLink(): LinkDestination | null {
  const link = pending;
  pending = null;
  if (typeof window !== "undefined" && parseLinkHash(window.location.hash)) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  return link;
}
