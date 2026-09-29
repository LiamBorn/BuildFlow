/**
 * The release of BuildFlow this code IS, and how two releases compare (2026-09-27).
 *
 * Asked for: an update notification that shows "if there is an update available", and — the
 * rule that shapes everything here — "the only way this update will pop up on the screen is if
 * the developer published a new update to the program".
 *
 * So an update is not "a new build": the site is rebuilt on every publish, and most publishes are
 * fixes nobody should be interrupted for. An update is THIS NUMBER going up. The server answers
 * `GET /api/release` with the release it was built from; every open copy of the website has the
 * release IT was built from compiled in; when the server's is newer, that copy is out of date and
 * says so. A publish that does not raise the number shows nobody anything.
 *
 * TO PUBLISH AN UPDATE
 *   1. Add the release to the top of "What's new" (UPDATE_ENTRIES in client/src/App.tsx) — that is
 *      what people see once they have updated.
 *   2. Raise `version` here to the same number, and give it that entry's title and a line or three.
 *      (tests/update-notice.test.tsx fails if the two numbers disagree.)
 *   3. Commit, push, and publish. Everyone who has BuildFlow open is offered the update within
 *      five minutes, or as soon as they come back to the tab.
 */

export type AppRelease = {
  /** Dotted numbers, compared part by part: "3.10" is newer than "3.9". */
  version: string;
  /** The day it was published, YYYY-MM-DD. */
  publishedAt: string;
  /** One line: what this release is. */
  title: string;
  /** What changed, a line each; the notification shows the first three. */
  highlights: string[];
};

export const CURRENT_RELEASE: AppRelease = {
  version: "3.9",
  publishedAt: "2026-09-08",
  title: "Month and Kanban: the Schedule's views, each on its own page",
  highlights: [
    "Month: every job on its start day, with milestones and holidays; drag a chip to reschedule.",
    "Kanban: every job in one of five status lanes; drag a card to change its status."
  ]
};

/** Negative when `a` is older than `b`, positive when newer, 0 when the same. */
export const compareVersions = (a: string, b: string): number => {
  const parts = (value: string) => value.trim().replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/**
 * Whether what the server says is a release this copy should be offered. Strictly NEWER: a
 * server rolled back to an older release must not tell people to "update" to it, and anything
 * that is not a release (an error page, a half-started server) is never one.
 */
export const isNewerRelease = (candidate: unknown, current: AppRelease = CURRENT_RELEASE): candidate is AppRelease => {
  if (!candidate || typeof candidate !== "object") return false;
  const release = candidate as Partial<AppRelease>;
  if (typeof release.version !== "string" || !/^v?\d+(\.\d+)*$/.test(release.version.trim())) return false;
  if (typeof release.title !== "string" || !Array.isArray(release.highlights)) return false;
  return compareVersions(release.version, current.version) > 0;
};
