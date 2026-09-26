/**
 * The greeting over the Dashboard, and the one the Mac's notch writes when you open the lid (notch
 * plan, feature 1). One wording for both, so they cannot drift apart.
 *
 * The Dashboard used to say "Good morning" from midnight to noon, so at 1 AM it wished you a good
 * morning. Two cases were added (2026-09-26, the plan's recommendation):
 *
 *   5:00–11:59   Good morning
 *   12:00–16:59  Good afternoon
 *   17:00–21:59  Good evening
 *   22:00–4:59   Working late          (new)
 *   back after 3 h or more away:  Welcome back   (new; instead of repeating the same greeting)
 *
 * "Welcome back" wins over the time of day, the late hours included: coming back is the news.
 */

export type GreetingKind = "morning" | "afternoon" | "evening" | "late" | "welcome-back";

export const GREETING_WORDS: Record<GreetingKind, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  late: "Working late",
  "welcome-back": "Welcome back"
};

/** Away at least this long, and the greeting is "Welcome back". */
export const WELCOME_BACK_AFTER_MS = 3 * 60 * 60 * 1000;

export type Greeting = {
  kind: GreetingKind;
  /** "Good morning" */
  words: string;
  /** "Liam" */
  firstName: string;
  /** "Good morning, Liam" */
  text: string;
};

/** The first word of a name, capitalised; "There" when there is no name at all (as the Dashboard has always said). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** The part of the day an hour (0–23) falls in. */
export function partOfDay(hour: number): Exclude<GreetingKind, "welcome-back"> {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

/**
 * The hour on the reader's clock. Without a zone that is the clock of whatever runs this — the
 * browser, which is the reader's; the server passes the Mac's zone, since its own is not the reader's.
 */
export function hourOf(now: number | Date, timeZone?: string): number {
  const at = new Date(now);
  if (!timeZone) return at.getHours();
  try {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone })
      .formatToParts(at)
      .find((part) => part.type === "hour")?.value;
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed % 24 : at.getHours();
  } catch {
    // an unknown zone: the machine's own clock is a better answer than no greeting
    return at.getHours();
  }
}

const instant = (value: number | Date | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
};

export function greetingFor(input: {
  name: string | null | undefined;
  now?: number | Date;
  /** When this person was last active, if known. Three hours or more before `now` is "Welcome back". */
  lastActiveAt?: number | Date | string | null;
  timeZone?: string;
}): Greeting {
  const now = input.now ?? Date.now();
  const nowAt = new Date(now).getTime();
  const last = instant(input.lastActiveAt);
  const kind: GreetingKind =
    last !== null && nowAt - last >= WELCOME_BACK_AFTER_MS ? "welcome-back" : partOfDay(hourOf(now, input.timeZone));
  const firstName = firstNameOf(input.name);
  const words = GREETING_WORDS[kind];
  return { kind, words, firstName, text: `${words}, ${firstName}` };
}
