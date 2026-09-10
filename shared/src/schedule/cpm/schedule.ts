/* ============================================================================
   The CPM engine (spec §6.2 – §6.5). Pure TypeScript; no framework imports.

   runSchedule(input) resolves every duration (production mode first), orders
   the network with Kahn's algorithm, runs the forward and backward passes in
   working-day ordinals per activity calendar, and reports float, criticality
   and every problem it saw. It never throws for bad schedule data: cycles are
   RETURNED (spec §6.2), unschedulable activities are flagged and skipped, and
   dangling logic is reported. It throws only for a broken project record.

   Arithmetic model. Each activity lives in its own calendar's working-day
   ordinals: S = early-start ordinal, F = early-finish ordinal = S + d − 1
   (hard rule 4). A zero-duration milestone therefore has F = S − 1: it sits on
   the boundary between two working days, so an FS successor can start on the
   milestone's own day and an FF-driven milestone lands the working day after
   its predecessor finishes. Dates cross between calendars as calendar-day
   numbers and are snapped into the receiving calendar; relationship lag is
   counted in the SUCCESSOR's working days.

     forward (spec §6.3)                        backward (spec §6.4)
     FS  S_s ≥ next_s(finish_p + 1) + lag       F_p ≤ prev_p(day_s(LS_s − lag) − 1)
     SS  S_s ≥ next_s(start_p) + lag            S_p ≤ prev_p(day_s(LS_s − lag))
     FF  F_s ≥ next_s(finish_p) + lag           F_p ≤ prev_p(day_s(LF_s − lag))
     SF  F_s ≥ next_s(start_p) + lag            S_p ≤ prev_p(day_s(LF_s − lag))

   which collapse to the §6.3 table when both activities share a calendar.
   FF and SF constrain the finish, so the early start is back-calculated:
   S_s = required F_s − d_s + 1.

   Constraints: SNET / FNET / MSO / MFO act in the forward pass (MSO and MFO
   pin the date regardless of logic; a predecessor that cannot make the pin
   shows negative float), SNLT / FNLT / MSO / MFO in the backward pass. A
   constraint on a non-working day is snapped (early-side constraints forward,
   late-side back) and reported. totalFloat = LF − F and is never clamped
   (hard rule 7); freeFloat is floored at 0 and capped by total float.

   Progress: an activity with an actualFinish is complete and drives its
   successors from its actual dates; one with an actualStart is in progress
   and its remaining duration (duration × (1 − %complete), rounded up) resumes
   at the data date; nothing else starts before the data date.
   ========================================================================== */
import type { Activity, Calendar, ConstraintType, Crew, ID, Project, Relationship, RelationshipType } from "../types";
import { buildWorkingDayIndex, compileCalendarRules, dayNumberToIso, isoToDayNumber, type ISODate, type WorkingDayIndex } from "./calendar";

export interface ScheduleInput {
  project: Pick<Project, "id" | "dataDate" | "defaultCalendarId">;
  activities: readonly Activity[];
  relationships: readonly Relationship[];
  calendars: readonly Calendar[];
  crews?: readonly Crew[];
  /** Imposed project finish (ISO date). Seeds the backward pass instead of the latest early finish. */
  projectFinish?: ISODate;
}

export type ScheduleWarningCode =
  | "duplicate-activity"
  | "missing-calendar"
  | "dead-calendar"
  | "no-duration"
  | "dangling-relationship"
  | "self-relationship"
  | "bad-relationship"
  | "cycle"
  | "unscheduled-predecessor"
  | "bad-constraint"
  | "constraint-snapped"
  | "bad-actual"
  | "relationship-violated"
  | "bad-project-finish"
  | "horizon";

export interface ScheduleWarning {
  code: ScheduleWarningCode;
  message: string;
  activityId?: ID;
  relationshipId?: ID;
}

export type DurationSource = "fixed" | "production" | "unresolved";
export type ActivityStatus = "not-started" | "in-progress" | "complete";
export type StartReason = "data-date" | "predecessor" | "constraint" | "actual";

export interface ActivityResult {
  id: ID;
  /** false when the activity is in a logic loop, has no duration, or has no usable calendar */
  scheduled: boolean;
  status: ActivityStatus;
  duration: number; // resolved working days (0 = milestone)
  durationSource: DurationSource;
  remainingDuration: number;
  earlyStart?: ISODate;
  earlyFinish?: ISODate;
  lateStart?: ISODate;
  lateFinish?: ISODate;
  totalFloat: number; // negative means a constraint cannot be met — display it, never clamp it
  freeFloat: number;
  isCritical: boolean;
  startReason?: StartReason;
  drivingPredecessorId?: ID;
  problems: string[];
}

export interface ScheduleResult {
  projectId: ID;
  dataDate: ISODate;
  activities: Record<ID, ActivityResult>;
  /** Topological order of every activity that is not in a logic loop. */
  order: ID[];
  /** Critical activities in topological order. */
  criticalPath: ID[];
  /** Each loop as a closed path of activity ids, e.g. [A, B, C, A]. Empty when the network is a DAG. */
  cycles: ID[][];
  warnings: ScheduleWarning[];
  projectStart?: ISODate;
  projectFinish?: ISODate;
  stats: { activities: number; relationships: number; scheduled: number; elapsedMs: number };
}

/* --------------------------------------------------------------------------
   Duration resolution (spec §2): duration_days = ceil(quantity / (rate × crews))
   -------------------------------------------------------------------------- */

export interface ResolvedDuration {
  duration: number;
  source: DurationSource;
  rate?: number;
  rateSource?: "activity" | "crew";
  /** why the activity cannot be scheduled */
  problem?: string;
  /** something worth showing, but the duration still resolved */
  note?: string;
}

const MAX_DURATION_DAYS = 36_500;

/** ceil() that forgives floating-point dust: 12,400 / 1,800 → 7, but 4.35 / 1.45 → 3, not 4. */
export function ceilWorkingDays(x: number): number {
  const nearest = Math.round(x);
  if (Math.abs(x - nearest) <= 1e-9 * Math.max(1, Math.abs(x))) return nearest;
  return Math.ceil(x);
}

function unitKey(unit: string | undefined | null): string {
  return (unit ?? "").trim().toUpperCase();
}

export function resolveDuration(activity: Activity, crew?: Crew | null): ResolvedDuration {
  const fail = (problem: string): ResolvedDuration => ({ duration: 0, source: "unresolved", problem });
  if (activity.durationMode === "production") {
    const quantity = activity.quantity;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) return fail("production mode needs a quantity");
    const crews = activity.crewCount ?? 1;
    if (!Number.isInteger(crews) || crews < 1) return fail("crew count must be a whole number, 1 or more");
    let rate = activity.productionRate;
    let rateSource: "activity" | "crew" = "activity";
    if (rate === undefined || rate === null) {
      if (!crew || crew.defaultProductionRate === undefined || crew.defaultProductionRate === null) {
        return fail("production mode needs a production rate (on the activity or its crew)");
      }
      if (unitKey(crew.defaultUnit) !== unitKey(activity.unit)) {
        return fail(`crew ${crew.name} produces ${crew.defaultUnit ?? "?"}/day but the activity is measured in ${activity.unit ?? "?"}`);
      }
      rate = crew.defaultProductionRate;
      rateSource = "crew";
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return fail("production rate must be greater than zero");
    const duration = quantity === 0 ? 0 : ceilWorkingDays(quantity / (rate * crews));
    if (duration > MAX_DURATION_DAYS) return fail(`a duration of ${duration} working days cannot be scheduled`);
    return { duration, source: "production", rate, rateSource, note: quantity === 0 ? "quantity is zero" : undefined };
  }
  const fixed = activity.fixedDuration;
  if (typeof fixed !== "number" || !Number.isFinite(fixed) || fixed < 0) return fail("fixed mode needs a duration in working days");
  const whole = Math.ceil(fixed);
  if (whole > MAX_DURATION_DAYS) return fail(`a duration of ${whole} working days cannot be scheduled`);
  return { duration: whole, source: "fixed", note: whole !== fixed ? `${fixed} rounded up to ${whole} working days` : undefined };
}

/* --------------------------------------------------------------------------
   Per-calendar context: a working-day index that grows as the schedule reaches
   past it. Ordinals stay stable because only the end of the span moves.
   -------------------------------------------------------------------------- */

const HORIZON_PAD_DAYS = 400;
const MAX_HORIZON_DAYS = 200 * 366;
const NO_DAY = -1_000_000_000;

class CalendarCtx {
  index: WorkingDayIndex;
  readonly dead: boolean;
  horizonHit = false;

  constructor(
    readonly calendar: Calendar,
    startDay: number,
    endDay: number
  ) {
    const rules = compileCalendarRules(calendar);
    this.dead = rules.workdaysPerWeek === 0 && rules.exceptions.size === 0;
    this.index = buildWorkingDayIndex(calendar, dayNumberToIso(startDay), dayNumberToIso(endDay));
  }

  private extendTo(day: number): void {
    const first = this.index.firstDay;
    const span = this.index.lastDay - first + 1;
    const end = Math.max(day, this.index.lastDay + span);
    if (end - first > MAX_HORIZON_DAYS) {
      throw new RangeError(`Calendar ${this.calendar.id} (${this.calendar.name}) would need more than a 200-year horizon`);
    }
    this.index = buildWorkingDayIndex(this.calendar, this.index.spanStart, dayNumberToIso(end));
  }

  /** Calendar day of a working-day ordinal. */
  dayAt(ordinal: number): number {
    if (ordinal < 0) {
      this.horizonHit = true;
      return this.index.firstDay - 1;
    }
    while (ordinal >= this.index.dates.length) this.extendTo(this.index.lastDay + 1);
    return this.index.dayAtOrdinal[ordinal];
  }

  /** Ordinal of the last working day on or before `day`. */
  prevOrd(day: number): number {
    if (day < this.index.firstDay) {
      this.horizonHit = true;
      return -1;
    }
    if (day > this.index.lastDay) this.extendTo(day);
    return this.index.prevOrdinalAtOffset[day - this.index.firstDay];
  }

  /** Ordinal of the first working day on or after `day`. */
  nextOrd(day: number): number {
    if (day < this.index.firstDay) {
      this.horizonHit = true;
      return 0;
    }
    if (day > this.index.lastDay) this.extendTo(day);
    const prev = this.index.prevOrdinalAtOffset[day - this.index.firstDay];
    return prev >= 0 && this.index.dayAtOrdinal[prev] === day ? prev : prev + 1;
  }
}

/* --------------------------------------------------------------------------
   Graph helpers: Kahn's algorithm, Tarjan's SCC (iterative), loop naming.
   -------------------------------------------------------------------------- */

function topologicalOrder(
  n: number,
  predsOf: number[][],
  succsOf: number[][],
  include: Uint8Array
): { order: number[]; leftovers: number[] } {
  const indegree = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!include[i]) continue;
    for (const p of predsOf[i]) if (include[p]) indegree[i] += 1;
  }
  const queue: number[] = [];
  for (let i = 0; i < n; i += 1) if (include[i] && indegree[i] === 0) queue.push(i);
  const order: number[] = [];
  const seen = new Uint8Array(n);
  let head = 0;
  while (head < queue.length) {
    const v = queue[head];
    head += 1;
    order.push(v);
    seen[v] = 1;
    for (const s of succsOf[v]) {
      if (!include[s]) continue;
      indegree[s] -= 1;
      if (indegree[s] === 0) queue.push(s);
    }
  }
  const leftovers: number[] = [];
  for (let i = 0; i < n; i += 1) if (include[i] && !seen[i]) leftovers.push(i);
  return { order, leftovers };
}

function stronglyConnectedComponents(nodes: number[], succsOf: number[][], inSet: Uint8Array, n: number): number[][] {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;
  for (const root of nodes) {
    if (index[root] !== -1) continue;
    const frames: Array<[number, number]> = [[root, 0]];
    index[root] = counter;
    low[root] = counter;
    counter += 1;
    stack.push(root);
    onStack[root] = 1;
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const v = frame[0];
      const edges = succsOf[v];
      if (frame[1] < edges.length) {
        const w = edges[frame[1]];
        frame[1] += 1;
        if (!inSet[w]) continue;
        if (index[w] === -1) {
          index[w] = counter;
          low[w] = counter;
          counter += 1;
          stack.push(w);
          onStack[w] = 1;
          frames.push([w, 0]);
        } else if (onStack[w]) {
          low[v] = Math.min(low[v], index[w]);
        }
      } else {
        frames.pop();
        if (frames.length > 0) {
          const u = frames[frames.length - 1][0];
          low[u] = Math.min(low[u], low[v]);
        }
        if (low[v] === index[v]) {
          const component: number[] = [];
          let w: number;
          do {
            w = stack.pop() as number;
            onStack[w] = 0;
            component.push(w);
          } while (w !== v);
          components.push(component);
        }
      }
    }
  }
  return components;
}

/** Shortest loop through `start` inside a strongly connected component, as a closed path. */
function loopThrough(start: number, member: Uint8Array, succsOf: number[][]): number[] {
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const v = queue[head];
    head += 1;
    for (const s of succsOf[v]) {
      if (s === start) {
        const path = [v];
        let cursor = v;
        while (parent.get(cursor) !== -1) {
          cursor = parent.get(cursor) as number;
          path.push(cursor);
        }
        path.reverse();
        path.push(start);
        return path;
      }
      if (member[s] && !parent.has(s)) {
        parent.set(s, v);
        queue.push(s);
      }
    }
  }
  return [start, start];
}

/* --------------------------------------------------------------------------
   runSchedule
   -------------------------------------------------------------------------- */

const RELATIONSHIP_TYPES = new Set<string>(["FS", "SS", "FF", "SF"]);
const CONSTRAINT_TYPES = new Set<string>(["SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"]);

function safeDay(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return isoToDayNumber(value);
  } catch {
    return null;
  }
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export function runSchedule(input: ScheduleInput): ScheduleResult {
  const t0 = now();
  const dataDay = safeDay(input.project.dataDate);
  if (dataDay === null) throw new TypeError(`project.dataDate must be an ISO date, got "${String(input.project.dataDate)}"`);
  const dataDate = dayNumberToIso(dataDay);
  const warnings: ScheduleWarning[] = [];
  const warn = (code: ScheduleWarningCode, message: string, ids: { activityId?: ID; relationshipId?: ID } = {}): void => {
    warnings.push({ code, message, ...ids });
  };

  /* ---- 1. activities ------------------------------------------------------ */
  const acts: Activity[] = [];
  const pos = new Map<ID, number>();
  for (const a of input.activities) {
    if (pos.has(a.id)) {
      warn("duplicate-activity", `activity id ${a.id} appears more than once; only the first copy is scheduled`, { activityId: a.id });
      continue;
    }
    pos.set(a.id, acts.length);
    acts.push(a);
  }
  const n = acts.length;
  const codeOf = (i: number): string => acts[i].code || acts[i].id;
  const calById = new Map<ID, Calendar>();
  for (const c of input.calendars) calById.set(c.id, c);
  const crewById = new Map<ID, Crew>();
  for (const c of input.crews ?? []) crewById.set(c.id, c);

  const problems: string[][] = Array.from({ length: n }, () => []);
  const dur = new Int32Array(n);
  const durSource: DurationSource[] = new Array<DurationSource>(n).fill("unresolved");
  const remaining = new Int32Array(n);
  const status: ActivityStatus[] = new Array<ActivityStatus>(n).fill("not-started");
  const actualStartDay = new Int32Array(n).fill(NO_DAY);
  const actualFinishDay = new Int32Array(n).fill(NO_DAY);
  const cType: (ConstraintType | null)[] = new Array<ConstraintType | null>(n).fill(null);
  const cDay = new Int32Array(n).fill(NO_DAY);
  const calOf: (Calendar | null)[] = new Array<Calendar | null>(n).fill(null);
  const schedulable = new Uint8Array(n);

  let minDay = dataDay;
  let maxDay = dataDay;
  const track = (day: number): void => {
    if (day < minDay) minDay = day;
    if (day > maxDay) maxDay = day;
  };
  let imposedFinishDay = NO_DAY;
  if (input.projectFinish !== undefined && input.projectFinish !== null) {
    const d = safeDay(input.projectFinish);
    if (d === null) warn("bad-project-finish", `project finish "${String(input.projectFinish)}" is not an ISO date; ignored`);
    else {
      imposedFinishDay = d;
      track(d);
    }
  }

  for (let i = 0; i < n; i += 1) {
    const a = acts[i];
    const crew = a.crewId ? (crewById.get(a.crewId) ?? null) : null;
    if (a.crewId && !crew) problems[i].push(`crew ${a.crewId} not found`);
    const resolved = resolveDuration(a, crew);
    dur[i] = resolved.duration;
    durSource[i] = resolved.source;
    if (resolved.problem) {
      problems[i].push(resolved.problem);
      warn("no-duration", `${codeOf(i)}: ${resolved.problem}`, { activityId: a.id });
    }
    if (resolved.note) problems[i].push(resolved.note);

    let cal = a.calendarId ? calById.get(a.calendarId) : undefined;
    if (!cal) {
      const fallback = calById.get(input.project.defaultCalendarId);
      if (a.calendarId) {
        warn("missing-calendar", `${codeOf(i)}: calendar ${a.calendarId} not found${fallback ? "; using the project default" : ""}`, {
          activityId: a.id
        });
      }
      cal = fallback;
    }
    if (!cal) problems[i].push("no calendar");
    calOf[i] = cal ?? null;

    if (a.actualStart !== undefined && a.actualStart !== null) {
      const d = safeDay(a.actualStart);
      if (d === null) {
        problems[i].push(`actual start "${String(a.actualStart)}" is not a date; ignored`);
        warn("bad-actual", `${codeOf(i)}: actual start "${String(a.actualStart)}" is not a date`, { activityId: a.id });
      } else {
        actualStartDay[i] = d;
        track(d);
      }
    }
    if (a.actualFinish !== undefined && a.actualFinish !== null) {
      const d = safeDay(a.actualFinish);
      if (d === null) {
        problems[i].push(`actual finish "${String(a.actualFinish)}" is not a date; ignored`);
        warn("bad-actual", `${codeOf(i)}: actual finish "${String(a.actualFinish)}" is not a date`, { activityId: a.id });
      } else {
        actualFinishDay[i] = d;
        track(d);
      }
    }
    const pct =
      typeof a.percentComplete === "number" && Number.isFinite(a.percentComplete) ? Math.min(100, Math.max(0, a.percentComplete)) : 0;
    if (actualFinishDay[i] !== NO_DAY) {
      status[i] = "complete";
      if (actualStartDay[i] === NO_DAY) {
        actualStartDay[i] = actualFinishDay[i];
        problems[i].push("actual finish without an actual start");
      } else if (actualStartDay[i] > actualFinishDay[i]) {
        problems[i].push("actual start is after the actual finish");
        actualStartDay[i] = actualFinishDay[i];
      }
      remaining[i] = 0;
    } else if (actualStartDay[i] !== NO_DAY) {
      status[i] = "in-progress";
      remaining[i] = Math.min(dur[i], Math.max(0, Math.ceil(dur[i] * (1 - pct / 100) - 1e-9)));
      if (pct >= 100) problems[i].push("100% complete but no actual finish");
    } else {
      remaining[i] = dur[i];
      if (pct > 0) problems[i].push(`${pct}% complete without an actual start; scheduled as not started`);
    }

    if (a.constraint) {
      const d = safeDay(a.constraint.date);
      if (d === null || !CONSTRAINT_TYPES.has(a.constraint.type)) {
        problems[i].push("constraint ignored (invalid type or date)");
        warn("bad-constraint", `${codeOf(i)}: constraint ${String(a.constraint.type)} ${String(a.constraint.date)} is invalid`, {
          activityId: a.id
        });
      } else {
        cType[i] = a.constraint.type;
        cDay[i] = d;
        track(d);
      }
    }
    schedulable[i] = resolved.source !== "unresolved" && cal ? 1 : 0;
  }

  /* ---- 2. calendars ------------------------------------------------------- */
  const horizonStart = minDay - HORIZON_PAD_DAYS;
  const horizonEnd = maxDay + HORIZON_PAD_DAYS;
  const ctxByCal = new Map<Calendar, CalendarCtx>();
  const ctxOf: (CalendarCtx | null)[] = new Array<CalendarCtx | null>(n).fill(null);
  const cOrd = new Int32Array(n); // constraint date snapped into the activity's calendar
  for (let i = 0; i < n; i += 1) {
    const cal = calOf[i];
    if (!cal) continue;
    let ctx = ctxByCal.get(cal);
    if (!ctx) {
      ctx = new CalendarCtx(cal, horizonStart, horizonEnd);
      ctxByCal.set(cal, ctx);
    }
    ctxOf[i] = ctx;
    if (ctx.dead) {
      problems[i].push(`calendar ${cal.name} has no working days`);
      warn("dead-calendar", `${codeOf(i)}: calendar ${cal.name} has no working days`, { activityId: acts[i].id });
      schedulable[i] = 0;
      continue;
    }
    const t = cType[i];
    if (t) {
      const early = t === "SNET" || t === "FNET" || t === "MSO";
      const o = early ? ctx.nextOrd(cDay[i]) : ctx.prevOrd(cDay[i]);
      cOrd[i] = o;
      const snapped = ctx.dayAt(o);
      if (snapped !== cDay[i]) {
        const note = `${t} ${dayNumberToIso(cDay[i])} is not a working day; using ${dayNumberToIso(snapped)}`;
        problems[i].push(note);
        warn("constraint-snapped", `${codeOf(i)}: ${note}`, { activityId: acts[i].id });
      }
    }
  }

  /* ---- 3. relationships --------------------------------------------------- */
  const rels = input.relationships;
  const m = rels.length;
  const rPred = new Int32Array(m).fill(-1);
  const rSucc = new Int32Array(m).fill(-1);
  const rLag = new Int32Array(m);
  const rType: RelationshipType[] = new Array<RelationshipType>(m);
  const predsOf: number[][] = Array.from({ length: n }, () => []);
  const succsOf: number[][] = Array.from({ length: n }, () => []);
  const predRels: number[][] = Array.from({ length: n }, () => []);
  const succRels: number[][] = Array.from({ length: n }, () => []);
  const inCycle = new Uint8Array(n);
  const cycles: ID[][] = [];
  for (let k = 0; k < m; k += 1) {
    const r = rels[k];
    const p = pos.get(r.predecessorId);
    const s = pos.get(r.successorId);
    if (p === undefined || s === undefined) {
      warn("dangling-relationship", `relationship ${r.id} links ${r.predecessorId} → ${r.successorId}, which does not exist`, {
        relationshipId: r.id
      });
      continue;
    }
    if (!RELATIONSHIP_TYPES.has(r.type)) {
      warn("bad-relationship", `relationship ${r.id} has unknown type ${String(r.type)}`, { relationshipId: r.id });
      continue;
    }
    let lag = typeof r.lag === "number" && Number.isFinite(r.lag) ? r.lag : 0;
    if (lag !== r.lag)
      warn("bad-relationship", `relationship ${r.id} lag ${String(r.lag)} is not a number; using 0`, { relationshipId: r.id });
    if (!Number.isInteger(lag)) {
      warn("bad-relationship", `relationship ${r.id} lag ${lag} rounded to ${Math.round(lag)} working days`, { relationshipId: r.id });
      lag = Math.round(lag);
    }
    if (p === s) {
      if (!inCycle[s]) {
        inCycle[s] = 1;
        cycles.push([acts[s].id, acts[s].id]);
        problems[s].push(`in a logic loop: ${codeOf(s)} → ${codeOf(s)}`);
      }
      warn("self-relationship", `relationship ${r.id} links ${codeOf(s)} to itself`, { relationshipId: r.id, activityId: acts[s].id });
      continue;
    }
    rPred[k] = p;
    rSucc[k] = s;
    rLag[k] = lag;
    rType[k] = r.type;
    predsOf[s].push(p);
    succsOf[p].push(s);
    predRels[s].push(k);
    succRels[p].push(k);
  }

  /* ---- 4. order + cycles -------------------------------------------------- */
  const include = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) include[i] = inCycle[i] ? 0 : 1;
  let sorted = topologicalOrder(n, predsOf, succsOf, include);
  if (sorted.leftovers.length > 0) {
    const inSet = new Uint8Array(n);
    for (const v of sorted.leftovers) inSet[v] = 1;
    const components = stronglyConnectedComponents(sorted.leftovers, succsOf, inSet, n);
    for (const component of components) {
      if (component.length < 2) continue;
      component.sort((a, b) => a - b);
      const member = new Uint8Array(n);
      for (const v of component) {
        member[v] = 1;
        inCycle[v] = 1;
        include[v] = 0;
      }
      const loop = loopThrough(component[0], member, succsOf);
      cycles.push(loop.map((v) => acts[v].id));
      const text = loop.map(codeOf).join(" → ");
      for (const v of component) problems[v].push(`in a logic loop: ${text}`);
      warn("cycle", `logic loop: ${text}`, { activityId: acts[component[0]].id });
    }
    sorted = topologicalOrder(n, predsOf, succsOf, include);
  }
  const order = sorted.order;

  /* ---- 5. forward pass ---------------------------------------------------- */
  const S = new Int32Array(n);
  const F = new Int32Array(n);
  const LS = new Int32Array(n);
  const LF = new Int32Array(n);
  const startDay = new Int32Array(n).fill(NO_DAY); // calendar day the activity starts (display + logic)
  const finishLogicDay = new Int32Array(n).fill(NO_DAY); // last day that blocks successors (day before a milestone)
  const finishDisplayDay = new Int32Array(n).fill(NO_DAY);
  const scheduled = new Uint8Array(n);
  const reason: (StartReason | undefined)[] = new Array<StartReason | undefined>(n).fill(undefined);
  const driver = new Int32Array(n).fill(-1);

  const requiredStart = (k: number, s: number, p: number): number => {
    const ctx = ctxOf[s] as CalendarCtx;
    const lag = rLag[k];
    switch (rType[k]) {
      case "FS":
        return ctx.nextOrd(finishLogicDay[p] + 1) + lag;
      case "SS":
        return ctx.nextOrd(startDay[p]) + lag;
      case "FF":
        return ctx.nextOrd(finishLogicDay[p]) + lag - dur[s] + 1;
      case "SF":
      default:
        return ctx.nextOrd(startDay[p]) + lag - dur[s] + 1;
    }
  };

  for (const i of order) {
    if (!schedulable[i]) continue;
    const ctx = ctxOf[i] as CalendarCtx;
    const d = dur[i];
    scheduled[i] = 1;
    if (status[i] === "complete") {
      startDay[i] = actualStartDay[i];
      finishLogicDay[i] = actualFinishDay[i];
      finishDisplayDay[i] = actualFinishDay[i];
      S[i] = ctx.nextOrd(actualStartDay[i]);
      F[i] = ctx.prevOrd(actualFinishDay[i]);
      reason[i] = "actual";
      continue;
    }
    const dataOrd = ctx.nextOrd(dataDay);
    if (status[i] === "in-progress") {
      const rem = remaining[i];
      const s = Math.max(dataOrd, ctx.nextOrd(actualStartDay[i]));
      S[i] = s;
      F[i] = s + rem - 1;
      startDay[i] = actualStartDay[i];
      finishLogicDay[i] = rem > 0 ? ctx.dayAt(F[i]) : ctx.dayAt(s) - 1;
      finishDisplayDay[i] = rem > 0 ? finishLogicDay[i] : dataDay;
      reason[i] = "actual";
      continue;
    }
    let s = dataOrd;
    let why: StartReason = "data-date";
    let drv = -1;
    for (const k of predRels[i]) {
      const p = rPred[k];
      if (!scheduled[p]) {
        problems[i].push(`predecessor ${codeOf(p)} is unscheduled; its logic is ignored`);
        warn("unscheduled-predecessor", `${codeOf(i)}: predecessor ${codeOf(p)} is unscheduled`, {
          activityId: acts[i].id,
          relationshipId: rels[k].id
        });
        continue;
      }
      const req = requiredStart(k, i, p);
      if (req > s) {
        s = req;
        why = "predecessor";
        drv = p;
      }
    }
    const t = cType[i];
    if (t === "SNET" || t === "FNET") {
      const o = t === "SNET" ? cOrd[i] : cOrd[i] - Math.max(d, 1) + 1;
      if (o > s) {
        s = o;
        why = "constraint";
        drv = -1;
      }
    } else if (t === "MSO" || t === "MFO") {
      const o = t === "MSO" ? cOrd[i] : cOrd[i] - Math.max(d, 1) + 1;
      if (o < s) {
        problems[i].push(
          `${t === "MSO" ? "must start on" : "must finish on"} ${dayNumberToIso(cDay[i])} but its logic needs ${dayNumberToIso(ctx.dayAt(s))} (${drv >= 0 ? `after ${codeOf(drv)}` : "data date"})`
        );
      }
      s = o;
      why = "constraint";
      drv = -1;
    }
    S[i] = s;
    F[i] = s + d - 1;
    startDay[i] = ctx.dayAt(s);
    finishLogicDay[i] = d > 0 ? ctx.dayAt(F[i]) : startDay[i] - 1;
    finishDisplayDay[i] = d > 0 ? finishLogicDay[i] : startDay[i];
    reason[i] = why;
    driver[i] = drv;
  }

  /* ---- 6. backward pass --------------------------------------------------- */
  let seedDay = imposedFinishDay;
  if (seedDay === NO_DAY) {
    for (let i = 0; i < n; i += 1) if (scheduled[i] && finishDisplayDay[i] > seedDay) seedDay = finishDisplayDay[i];
  }
  for (let idx = order.length - 1; idx >= 0; idx -= 1) {
    const i = order[idx];
    if (!scheduled[i]) continue;
    const ctx = ctxOf[i] as CalendarCtx;
    if (status[i] === "complete") {
      LS[i] = S[i];
      LF[i] = F[i];
      continue;
    }
    const dd = status[i] === "in-progress" ? remaining[i] : dur[i];
    const milestoneAdjust = dd === 0 ? 1 : 0;
    let lf = ctx.prevOrd(seedDay) - milestoneAdjust;
    for (const k of succRels[i]) {
      const s = rSucc[k];
      if (!scheduled[s] || status[s] !== "not-started") continue;
      const sctx = ctxOf[s] as CalendarCtx;
      const lag = rLag[k];
      let bound: number;
      switch (rType[k]) {
        case "FS":
          bound = ctx.prevOrd(sctx.dayAt(LS[s] - lag) - 1);
          break;
        case "SS":
          bound = ctx.prevOrd(sctx.dayAt(LS[s] - lag)) + dd - 1;
          break;
        case "FF":
          bound = ctx.prevOrd(sctx.dayAt(LF[s] - lag));
          break;
        case "SF":
        default:
          bound = ctx.prevOrd(sctx.dayAt(LF[s] - lag)) + dd - 1;
          break;
      }
      if (bound < lf) lf = bound;
    }
    const t = cType[i];
    if (t === "SNLT" && status[i] === "not-started") lf = Math.min(lf, cOrd[i] + dd - 1);
    else if (t === "FNLT") lf = Math.min(lf, cOrd[i] - milestoneAdjust);
    else if (t === "MSO" && status[i] === "not-started") lf = F[i];
    else if (t === "MFO") lf = F[i];
    LF[i] = lf;
    LS[i] = lf - dd + 1;
  }

  /* ---- 7. float, free float, violations ----------------------------------- */
  const totalFloat = new Int32Array(n);
  const freeFloat = new Int32Array(n);
  const slackOf = (k: number, p: number, s: number): number => {
    const sctx = ctxOf[s] as CalendarCtx;
    const lag = rLag[k];
    const sStart = status[s] === "not-started" ? S[s] : sctx.nextOrd(actualStartDay[s]);
    switch (rType[k]) {
      case "FS":
        return sStart - (sctx.nextOrd(finishLogicDay[p] + 1) + lag);
      case "SS":
        return sStart - (sctx.nextOrd(startDay[p]) + lag);
      case "FF":
        return F[s] - (sctx.nextOrd(finishLogicDay[p]) + lag);
      case "SF":
      default:
        return F[s] - (sctx.nextOrd(startDay[p]) + lag);
    }
  };
  for (const i of order) {
    if (!scheduled[i]) continue;
    if (status[i] === "complete") continue;
    const tf = LF[i] - F[i];
    totalFloat[i] = tf;
    let ff = Number.POSITIVE_INFINITY;
    for (const k of succRels[i]) {
      const s = rSucc[k];
      if (!scheduled[s]) continue;
      const slack = slackOf(k, i, s);
      if (slack < ff) ff = slack;
    }
    if (ff === Number.POSITIVE_INFINITY) ff = tf;
    freeFloat[i] = Math.max(0, Math.min(ff, tf));
  }
  for (let k = 0; k < m; k += 1) {
    const p = rPred[k];
    const s = rSucc[k];
    if (p < 0 || s < 0 || !scheduled[p] || !scheduled[s]) continue;
    const slack = slackOf(k, p, s);
    if (slack < 0) {
      const lagText = rLag[k] === 0 ? "" : ` lag ${rLag[k]}`;
      problems[s].push(`${rType[k]}${lagText} from ${codeOf(p)} is violated by ${-slack} working day${-slack === 1 ? "" : "s"}`);
      warn("relationship-violated", `${codeOf(s)}: ${rType[k]}${lagText} from ${codeOf(p)} is violated by ${-slack} working days`, {
        activityId: acts[s].id,
        relationshipId: rels[k].id
      });
    }
  }

  /* ---- 8. results --------------------------------------------------------- */
  const activities: Record<ID, ActivityResult> = {};
  let projectStartDay = NO_DAY;
  let projectFinishDay = NO_DAY;
  let scheduledCount = 0;
  const criticalPath: ID[] = [];
  const results: ActivityResult[] = new Array<ActivityResult>(n);
  for (let i = 0; i < n; i += 1) {
    const a = acts[i];
    const res: ActivityResult = {
      id: a.id,
      scheduled: scheduled[i] === 1,
      status: status[i],
      duration: dur[i],
      durationSource: durSource[i],
      remainingDuration: remaining[i],
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
      problems: problems[i]
    };
    if (scheduled[i]) {
      scheduledCount += 1;
      const ctx = ctxOf[i] as CalendarCtx;
      res.earlyStart = dayNumberToIso(startDay[i]);
      res.earlyFinish = dayNumberToIso(finishDisplayDay[i]);
      if (status[i] === "complete") {
        res.lateStart = res.earlyStart;
        res.lateFinish = res.earlyFinish;
      } else {
        const dd = status[i] === "in-progress" ? remaining[i] : dur[i];
        res.lateStart = status[i] === "in-progress" ? res.earlyStart : dayNumberToIso(ctx.dayAt(LS[i]));
        res.lateFinish = dayNumberToIso(ctx.dayAt(dd > 0 ? LF[i] : LS[i]));
        res.totalFloat = totalFloat[i];
        res.freeFloat = freeFloat[i];
        res.isCritical = totalFloat[i] <= 0;
      }
      res.startReason = reason[i];
      if (driver[i] >= 0) res.drivingPredecessorId = acts[driver[i]].id;
      if (projectStartDay === NO_DAY || startDay[i] < projectStartDay) projectStartDay = startDay[i];
      if (finishDisplayDay[i] > projectFinishDay) projectFinishDay = finishDisplayDay[i];
    }
    results[i] = res;
    activities[a.id] = res;
  }
  for (const i of order) if (results[i].isCritical) criticalPath.push(acts[i].id);
  for (const ctx of ctxByCal.values()) {
    if (ctx.horizonHit)
      warn(
        "horizon",
        `some dates on calendar ${ctx.calendar.name} fall before the schedule horizon (${ctx.index.spanStart}); they were clamped`
      );
  }

  return {
    projectId: input.project.id,
    dataDate,
    activities,
    order: order.map((i) => acts[i].id),
    criticalPath,
    cycles,
    warnings,
    projectStart: projectStartDay === NO_DAY ? undefined : dayNumberToIso(projectStartDay),
    projectFinish: projectFinishDay === NO_DAY ? undefined : dayNumberToIso(projectFinishDay),
    stats: { activities: n, relationships: m, scheduled: scheduledCount, elapsedMs: now() - t0 }
  };
}
