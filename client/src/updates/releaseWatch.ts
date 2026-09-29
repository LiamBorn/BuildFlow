/**
 * What the update notification needs to know, apart from how it looks (2026-09-27).
 *
 * An update is on offer when the server's release (GET /api/release) is NEWER than the release
 * this copy of the website was built from (CURRENT_RELEASE, compiled in). shared/src/release.ts
 * explains why that, and not a new build, is what counts as "the developer published an update".
 *
 * What the person chose is kept per release, on this device, so a choice made in one tab holds
 * in the others and survives a reload: skip it, or update at a time they picked. A later release
 * asks again — the choice was about THAT one.
 */
import { CURRENT_RELEASE, compareVersions, isNewerRelease, type AppRelease } from "@buildflow/shared";
import { apiUrl } from "../api";

/** How often an open copy asks. A publish reaches everyone within this. */
export const CHECK_EVERY_MS = 5 * 60_000;
/** Coming back to the tab asks again, unless it asked this recently. */
export const RECHECK_ON_RETURN_MS = 60_000;
/** A scheduled update gives this long to finish what you are doing before it reloads. */
export const COUNTDOWN_SECONDS = 60;

export type UpdateDecision = { choice: "skipped" } | { choice: "scheduled"; at: number };

const KEY_PREFIX = "bf:update:";
export const decisionKey = (version: string) => `${KEY_PREFIX}${version}`;

/** Storage can be missing or refuse (a private window, blocked site data): no choice, then. */
export const readDecision = (version: string): UpdateDecision | null => {
  try {
    const raw = window.localStorage.getItem(decisionKey(version));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { choice?: unknown; at?: unknown };
    if (parsed.choice === "skipped") return { choice: "skipped" };
    if (parsed.choice === "scheduled" && typeof parsed.at === "number" && Number.isFinite(parsed.at)) {
      return { choice: "scheduled", at: parsed.at };
    }
  } catch {
    // unreadable is the same as never chosen
  }
  return null;
};

export const writeDecision = (version: string, decision: UpdateDecision | null) => {
  try {
    if (decision) window.localStorage.setItem(decisionKey(version), JSON.stringify(decision));
    else window.localStorage.removeItem(decisionKey(version));
  } catch {
    // the choice holds for this tab only
  }
};

/**
 * Choices about releases this copy already runs are spent: they are cleared when it starts, so
 * the device does not collect one key per release forever.
 */
export const forgetSpentDecisions = (current: AppRelease = CURRENT_RELEASE) => {
  try {
    const spent: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(KEY_PREFIX) && compareVersions(key.slice(KEY_PREFIX.length), current.version) <= 0) spent.push(key);
    }
    spent.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // nothing to tidy
  }
};

/**
 * The server's release when it is one this copy should be offered, else null — including when
 * the server cannot be reached, answers with an error, or is mid-publish (the first seconds of a
 * publish answer 500s): none of those is an update, and none should be shown as a problem.
 */
export async function fetchNewerRelease(current: AppRelease = CURRENT_RELEASE): Promise<AppRelease | null> {
  try {
    const response = await fetch(apiUrl("/api/release"), { cache: "no-store", credentials: "omit" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isNewerRelease(body, current) ? body : null;
  } catch {
    return null;
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 8:00 PM — how the program writes a time. */
export const clockLabel = (at: number) => {
  const date = new Date(at);
  const hours = date.getHours();
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

const dayStart = (at: number) => {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** "8:00 PM", "tomorrow at 6:00 AM", or "Tuesday at 6:00 AM" further out. */
export const whenLabel = (at: number, now: number = Date.now()) => {
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000);
  if (days <= 0) return clockLabel(at);
  if (days === 1) return `tomorrow at ${clockLabel(at)}`;
  return `${new Date(at).toLocaleDateString("en-US", { weekday: "long" })} at ${clockLabel(at)}`;
};

/** "September 27, 2026" from a YYYY-MM-DD, built from its parts (never through UTC). */
export const publishedLabel = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}, ${match[1]}`;
};

export type ScheduleOption = { id: string; label: string; at: number };

/**
 * The times on offer, from now: an hour away, the end of the working day, the evening, and the
 * start of tomorrow's — a crew's day starts early, so "before work" is 6:00. A time less than
 * half an hour off is left out: at that point "in an hour" is the better offer.
 */
export const scheduleOptions = (now: number = Date.now()): ScheduleOption[] => {
  const today = new Date(now);
  const at = (dayOffset: number, hours: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hours, 0).getTime();
  const soonest = now + 30 * 60_000;
  const options: ScheduleOption[] = [{ id: "hour", label: "In an hour", at: now + 60 * 60_000 }];
  if (at(0, 17) >= soonest) options.push({ id: "end-of-day", label: "At the end of the day", at: at(0, 17) });
  if (at(0, 20) >= soonest) options.push({ id: "tonight", label: "Tonight", at: at(0, 20) });
  options.push({ id: "tomorrow", label: "Before work tomorrow", at: at(1, 6) });
  return options;
};
