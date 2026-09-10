/* ============================================================================
   Calendar arithmetic (spec §6.1).

   All duration math happens in WORKING days. A calendar decides which dates
   are working days; this module turns that into integer arithmetic by
   precomputing a working-day index (a sorted array of working dates plus a
   Map from ISO date to ordinal) so the CPM passes never touch Date objects.

   Which dates work (precedence, most specific first):
     1. exceptions  — ISO dates FORCED working (Saturday makeup). Win over everything.
     2. holidays    — ISO dates that never work.
     3. blackoutRanges — inclusive [start, end] shutdowns (winter paving ban).
     4. workdays[dayOfWeek] — the weekly pattern, index 0 = Sunday.

   Conventions (hard rules 3 and 4):
     • An activity with duration d starting on working day n finishes at the END
       of working day n + d − 1, so  EF = addWorkingDays(cal, ES, d − 1).
     • addWorkingDays(x, k) is the k-th working day after x (k > 0) or before x
       (k < 0). From a non-working x this still counts whole working days, so
       Saturday + 1 = Monday and Saturday − 1 = Friday. k = 0 snaps FORWARD to
       the next working day (a start on Saturday is a start on Monday).
     • countWorkingDays(a, b) is the signed working-day DISTANCE: the number of
       working days after a up to and including b. Zero when a and b are the same
       day, negative when b precedes a, additive (a→b + b→c = a→c) and
       antisymmetric. The inclusive length of a bar is therefore
       countWorkingDays(ES, EF) + 1, and float is countWorkingDays(ES, LS).

   Dates: ISO "YYYY-MM-DD" strings are canonical (that is what the data model
   stores). A Date object is read by its UTC calendar components and results are
   returned the same shape as the input (ISO in → ISO out, Date in → UTC-midnight
   Date out). Calendars are treated as immutable values — replace a calendar to
   change it — so the per-calendar index cache keyed on object identity rebuilds
   only when a calendar actually changes.
   ========================================================================== */
import type { Calendar, ID } from "../types";

export type ISODate = string;
export type DateLike = Date | ISODate;

export const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Cap for the auto-growing index: a calendar with no working days in 200 years is a data error. */
const MAX_SPAN_DAYS = 200 * 366;
const GROW_PAD_DAYS = 400;

/* --------------------------------------------------------------------------
   Day numbers: integer days since 1970-01-01 (UTC). Timezone-proof.
   -------------------------------------------------------------------------- */

/** Parse "YYYY-MM-DD" (or the date part of an ISO datetime) into a day number. */
export function isoToDayNumber(iso: ISODate): number {
  const text = iso.length > 10 && iso.charAt(10) === "T" ? iso.slice(0, 10) : iso;
  const m = ISO_DATE.exec(text);
  if (!m) throw new TypeError(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new TypeError(`"${iso}" is not a real calendar date`);
  }
  return ms / MS_PER_DAY;
}

export function dayNumberToIso(day: number): ISODate {
  const dt = new Date(day * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const mo = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday, matching Calendar.workdays. 1970-01-01 was a Thursday. */
export function dayOfWeek(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function toDayNumber(date: DateLike): number {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new TypeError("Invalid Date");
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY;
  }
  return isoToDayNumber(date);
}

/** Normalise any DateLike to the canonical ISO form. */
export function toIsoDate(date: DateLike): ISODate {
  return dayNumberToIso(toDayNumber(date));
}

function sameShape<T extends DateLike>(day: number, like: T): T {
  return (like instanceof Date ? new Date(day * MS_PER_DAY) : dayNumberToIso(day)) as T;
}

/* --------------------------------------------------------------------------
   Calendar rules: the Calendar record compiled into sets and intervals.
   -------------------------------------------------------------------------- */

export interface CalendarRules {
  readonly workdays: readonly boolean[]; // always length 7
  readonly holidays: ReadonlySet<number>;
  readonly exceptions: ReadonlySet<number>;
  readonly blackouts: ReadonlyArray<readonly [number, number]>; // inclusive day numbers
  readonly workdaysPerWeek: number;
}

function safeDay(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  try {
    return isoToDayNumber(iso);
  } catch {
    return null;
  }
}

export function compileCalendarRules(calendar: Calendar): CalendarRules {
  const workdays: boolean[] = [];
  for (let i = 0; i < 7; i += 1) workdays.push(calendar.workdays?.[i] === true);
  const holidays = new Set<number>();
  for (const h of calendar.holidays ?? []) {
    const d = safeDay(h);
    if (d !== null) holidays.add(d);
  }
  const exceptions = new Set<number>();
  for (const e of calendar.exceptions ?? []) {
    const d = safeDay(e);
    if (d !== null) exceptions.add(d);
  }
  const blackouts: Array<readonly [number, number]> = [];
  for (const range of calendar.blackoutRanges ?? []) {
    const a = safeDay(range?.start);
    const b = safeDay(range?.end);
    if (a === null || b === null) continue;
    blackouts.push(a <= b ? [a, b] : [b, a]);
  }
  blackouts.sort((p, q) => p[0] - q[0]);
  return { workdays, holidays, exceptions, blackouts, workdaysPerWeek: workdays.filter(Boolean).length };
}

export function isWorkingDayNumber(rules: CalendarRules, day: number): boolean {
  if (rules.exceptions.has(day)) return true;
  if (rules.holidays.has(day)) return false;
  for (const [start, end] of rules.blackouts) {
    if (day < start) break; // sorted by start
    if (day <= end) return false;
  }
  return rules.workdays[dayOfWeek(day)];
}

/**
 * Data-quality problems a calendar editor should surface. The engine itself
 * tolerates all of these (bad entries are skipped) so one typo never blocks a
 * schedule run.
 */
export function validateCalendar(calendar: Calendar): string[] {
  const problems: string[] = [];
  if (!Array.isArray(calendar.workdays) || calendar.workdays.length !== 7) {
    problems.push("workdays must list exactly 7 booleans, Sunday first");
  }
  const rules = compileCalendarRules(calendar);
  if (rules.workdaysPerWeek === 0 && rules.exceptions.size === 0) problems.push("calendar has no working days");
  for (const h of calendar.holidays ?? []) if (safeDay(h) === null) problems.push(`holiday "${String(h)}" is not an ISO date`);
  for (const e of calendar.exceptions ?? []) if (safeDay(e) === null) problems.push(`exception "${String(e)}" is not an ISO date`);
  for (const r of calendar.blackoutRanges ?? []) {
    if (safeDay(r?.start) === null || safeDay(r?.end) === null) {
      problems.push(`blackout "${String(r?.reason ?? "")}" has an invalid date`);
    }
  }
  for (const e of rules.exceptions)
    if (rules.holidays.has(e)) problems.push(`${dayNumberToIso(e)} is both a holiday and a forced working day (it works)`);
  return problems;
}

/* --------------------------------------------------------------------------
   The working-day index.
   -------------------------------------------------------------------------- */

export interface WorkingDayIndex {
  readonly calendarId: ID;
  readonly spanStart: ISODate; // inclusive
  readonly spanEnd: ISODate; // inclusive
  /** Every working date in the span, ascending. Ordinal = position here. */
  readonly dates: readonly ISODate[];
  /** ISO date → ordinal, for working dates only. */
  readonly ordinal: ReadonlyMap<ISODate, number>;
  readonly rules: CalendarRules;
  /** @internal day number of spanStart */
  readonly firstDay: number;
  /** @internal day number of spanEnd */
  readonly lastDay: number;
  /** @internal day number per ordinal */
  readonly dayAtOrdinal: Int32Array;
  /** @internal for each day offset in the span: ordinal of the last working day ≤ it, or −1 */
  readonly prevOrdinalAtOffset: Int32Array;
}

/** Pure: precompute the working days of `calendar` across [spanStart, spanEnd]. */
export function buildWorkingDayIndex(calendar: Calendar, spanStart: DateLike, spanEnd: DateLike): WorkingDayIndex {
  const rules = compileCalendarRules(calendar);
  let firstDay = toDayNumber(spanStart);
  let lastDay = toDayNumber(spanEnd);
  if (lastDay < firstDay) [firstDay, lastDay] = [lastDay, firstDay];
  const spanDays = lastDay - firstDay + 1;
  const prevOrdinalAtOffset = new Int32Array(spanDays);
  const dayNumbers: number[] = [];
  const dates: ISODate[] = [];
  const ordinal = new Map<ISODate, number>();
  let prev = -1;
  for (let offset = 0; offset < spanDays; offset += 1) {
    const day = firstDay + offset;
    if (isWorkingDayNumber(rules, day)) {
      prev = dayNumbers.length;
      dayNumbers.push(day);
      const iso = dayNumberToIso(day);
      dates.push(iso);
      ordinal.set(iso, prev);
    }
    prevOrdinalAtOffset[offset] = prev;
  }
  return {
    calendarId: calendar.id,
    spanStart: dayNumberToIso(firstDay),
    spanEnd: dayNumberToIso(lastDay),
    dates,
    ordinal,
    rules,
    firstDay,
    lastDay,
    dayAtOrdinal: Int32Array.from(dayNumbers),
    prevOrdinalAtOffset
  };
}

export function indexCovers(index: WorkingDayIndex, date: DateLike): boolean {
  const day = toDayNumber(date);
  return day >= index.firstDay && day <= index.lastDay;
}

function assertCovered(index: WorkingDayIndex, day: number): void {
  if (day < index.firstDay || day > index.lastDay) {
    throw new RangeError(
      `${dayNumberToIso(day)} is outside the working-day index for calendar ${index.calendarId} (${index.spanStart} .. ${index.spanEnd})`
    );
  }
}

/** Ordinal of `date` when it is a working day inside the span, else undefined. */
export function ordinalOf(index: WorkingDayIndex, date: DateLike): number | undefined {
  const day = toDayNumber(date);
  if (day < index.firstDay || day > index.lastDay) return undefined;
  const ord = index.prevOrdinalAtOffset[day - index.firstDay];
  return ord >= 0 && index.dayAtOrdinal[ord] === day ? ord : undefined;
}

function prevOrdinalAtDay(index: WorkingDayIndex, day: number): number {
  assertCovered(index, day);
  return index.prevOrdinalAtOffset[day - index.firstDay];
}

function nextOrdinalAtDay(index: WorkingDayIndex, day: number): number {
  const prev = prevOrdinalAtDay(index, day);
  return prev >= 0 && index.dayAtOrdinal[prev] === day ? prev : prev + 1;
}

/** Ordinal of the last working day on or before `date` (−1 if none in the span). */
export function prevWorkingOrdinal(index: WorkingDayIndex, date: DateLike): number {
  return prevOrdinalAtDay(index, toDayNumber(date));
}

/** Ordinal of the first working day on or after `date` (dates.length if none in the span). */
export function nextWorkingOrdinal(index: WorkingDayIndex, date: DateLike): number {
  return nextOrdinalAtDay(index, toDayNumber(date));
}

export function dateAtOrdinal(index: WorkingDayIndex, ordinal: number): ISODate {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= index.dates.length) {
    throw new RangeError(
      `Working-day ordinal ${ordinal} is outside the index for calendar ${index.calendarId} (0 .. ${index.dates.length - 1})`
    );
  }
  return index.dates[ordinal];
}

/* --------------------------------------------------------------------------
   Per-calendar cache. Keyed on the calendar object: an edited calendar is a new
   object, so the index rebuilds exactly when a calendar changes. The cached
   index grows (with padding) to cover whatever span is asked of it.
   -------------------------------------------------------------------------- */

const indexCache = new WeakMap<Calendar, WorkingDayIndex>();

/** Returns the cached index for `calendar`, rebuilt if it doesn't cover [from, to]. */
export function workingDayIndexFor(calendar: Calendar, from: DateLike, to: DateLike = from): WorkingDayIndex {
  let a = toDayNumber(from);
  let b = toDayNumber(to);
  if (b < a) [a, b] = [b, a];
  const cached = indexCache.get(calendar);
  if (cached && a >= cached.firstDay && b <= cached.lastDay) return cached;
  const start = Math.min(a, cached ? cached.firstDay : a) - (cached ? 0 : GROW_PAD_DAYS);
  const end = Math.max(b, cached ? cached.lastDay : b) + GROW_PAD_DAYS;
  const fresh = buildWorkingDayIndex(calendar, dayNumberToIso(Math.min(start, a - GROW_PAD_DAYS)), dayNumberToIso(end));
  indexCache.set(calendar, fresh);
  return fresh;
}

/** Drop the cached index (only needed if a calendar object was mutated in place). */
export function invalidateWorkingDayIndex(calendar: Calendar): void {
  indexCache.delete(calendar);
}

export type CalendarSource = Calendar | WorkingDayIndex;

function isIndex(source: CalendarSource): source is WorkingDayIndex {
  return (source as WorkingDayIndex).ordinal instanceof Map && "prevOrdinalAtOffset" in source;
}

function resolve(source: CalendarSource, a: number, b: number): WorkingDayIndex {
  if (isIndex(source)) {
    assertCovered(source, a);
    assertCovered(source, b);
    return source;
  }
  return workingDayIndexFor(source, dayNumberToIso(a), dayNumberToIso(b));
}

/* --------------------------------------------------------------------------
   The primitives.
   -------------------------------------------------------------------------- */

/** Is `date` a working day on this calendar? Never throws for a Calendar source. */
export function isWorkingDay(source: CalendarSource, date: DateLike): boolean {
  const day = toDayNumber(date);
  return isWorkingDayNumber(isIndex(source) ? source.rules : compileCalendarRules(source), day);
}

/** The k-th working day after (k > 0) or before (k < 0) `date`; k = 0 snaps forward to a working day. */
export function addWorkingDays(source: CalendarSource, date: Date, days: number): Date;
export function addWorkingDays(source: CalendarSource, date: ISODate, days: number): ISODate;
export function addWorkingDays(source: CalendarSource, date: DateLike, days: number): DateLike {
  if (!Number.isInteger(days)) throw new TypeError(`Working days must be an integer, got ${days}`);
  const day = toDayNumber(date);
  let index = resolve(source, day, day);
  for (;;) {
    const anchor = days > 0 ? prevOrdinalAtDay(index, day) : nextOrdinalAtDay(index, day);
    const target = anchor + days;
    if (target >= 0 && target < index.dates.length) return sameShape(index.dayAtOrdinal[target], date);
    if (isIndex(source)) {
      throw new RangeError(
        `${dayNumberToIso(day)} ${days >= 0 ? "+" : "−"} ${Math.abs(days)} working days falls outside the index for calendar ${index.calendarId} (${index.spanStart} .. ${index.spanEnd})`
      );
    }
    // Grow the cached index far enough to hold the answer, then try again.
    const shortfall = target < 0 ? -target : target - index.dates.length + 1;
    const perWeek = Math.max(index.rules.workdaysPerWeek, 1);
    const grow = Math.ceil((shortfall * 7) / perWeek) + GROW_PAD_DAYS + (index.lastDay - index.firstDay + 1);
    const reachDay = target < 0 ? index.firstDay - grow : index.lastDay + grow;
    if (Math.abs(reachDay - day) > MAX_SPAN_DAYS) {
      throw new RangeError(
        `Calendar ${index.calendarId} has too few working days to move ${days} working days from ${dayNumberToIso(day)}`
      );
    }
    index = workingDayIndexFor(source, dayNumberToIso(Math.min(reachDay, day)), dayNumberToIso(Math.max(reachDay, day)));
  }
}

/** Signed working-day distance: working days after `start` up to and including `end`. */
export function countWorkingDays(source: CalendarSource, start: DateLike, end: DateLike): number {
  const a = toDayNumber(start);
  const b = toDayNumber(end);
  const index = resolve(source, Math.min(a, b), Math.max(a, b));
  return index.prevOrdinalAtOffset[b - index.firstDay] - index.prevOrdinalAtOffset[a - index.firstDay];
}

/** The first working day on or after `date`. */
export function nextWorkingDay(source: CalendarSource, date: Date): Date;
export function nextWorkingDay(source: CalendarSource, date: ISODate): ISODate;
export function nextWorkingDay(source: CalendarSource, date: DateLike): DateLike {
  return addWorkingDays(source, date as ISODate, 0) as DateLike;
}

/** The last working day on or before `date`. */
export function previousWorkingDay(source: CalendarSource, date: Date): Date;
export function previousWorkingDay(source: CalendarSource, date: ISODate): ISODate;
export function previousWorkingDay(source: CalendarSource, date: DateLike): DateLike {
  const day = toDayNumber(date);
  const index = resolve(source, day, day);
  const ord = prevOrdinalAtDay(index, day);
  if (ord >= 0) return sameShape(index.dayAtOrdinal[ord], date);
  // No working day in the span at or before `date`: step back one working day from the first one after it.
  return addWorkingDays(source, date as ISODate, -1) as DateLike;
}
