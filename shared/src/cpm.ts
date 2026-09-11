/* ============================================================================
   cpm.ts — Critical Path Method engine
   ----------------------------------------------------------------------------
   The logic layer under the Gantt: a real forward/backward pass over a
   dependency network, so the bars are a *schedule* rather than a picture.

   Supports the four precedence relations (FS/SS/FF/SF) with positive lag or
   negative lead, the usual date constraints, total/free float, and critical-path
   extraction. Cycles are detected and reported rather than hanging.

   Deliberately domain-agnostic — it knows nothing about jobs, crews or dates.
   Callers map their domain onto CpmTask/CpmLink using a day-index axis (see
   toDayIndex/fromDayIndex), which keeps the maths in integers and makes a
   working-day calendar a drop-in change later (map indices through a calendar).

   Time convention: durations are in days and finish is a *time point*, i.e.
   EF = ES + duration. A task starting day 0 with duration 2 occupies days 0–1
   and finishes at point 2. Milestones are duration 0 (ES === EF).
   ========================================================================== */

/** Precedence relation between two tasks. */
export type DependencyType = "FS" | "SS" | "FF" | "SF";

/**
 * ASAP — no constraint (default).
 * SNET — Start No Earlier Than: floors the early start.
 * FNLT — Finish No Later Than: caps the late finish (can drive negative float).
 * MSO  — Must Start On: pins the start hard (can drive negative float).
 */
export type ConstraintType = "ASAP" | "SNET" | "FNLT" | "MSO";

export type CpmTask = {
  id: string;
  /** Duration in days. 0 = milestone. */
  duration: number;
  constraintType?: ConstraintType;
  /** Day index the constraint applies to, on the same axis as the results. */
  constraintDate?: number;
  /**
   * A finish-no-later-than date the backward pass caps late finish at, on the same
   * axis. Separate from `constraintType` so a task can be pinned where it is planned
   * *and* carry a deadline: `FNLT` is a backward-pass constraint, so expressing it as
   * the task's only constraint leaves the forward pass with no floor and drops the
   * task back to the start of the plan. A missed deadline shows as negative float,
   * which is the whole point of asking for one.
   */
  deadline?: number;
};

export type CpmLink = {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Lag in days. Negative = lead (overlap). */
  lag: number;
};

export type CpmTaskResult = {
  id: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  /** Slip available without pushing the project finish. Negative = behind. */
  totalFloat: number;
  /** Slip available without disturbing any successor's early start. */
  freeFloat: number;
  critical: boolean;
};

export type CpmResult = {
  tasks: Record<string, CpmTaskResult>;
  projectStart: number;
  projectFinish: number;
  /** Critical tasks in schedule order. */
  criticalPath: string[];
  /** Task ids forming a dependency cycle, or null when the network is valid. */
  cycle: string[] | null;
};

const DAY_MS = 86_400_000;

/** Whole days from `epoch` to `iso` (both YYYY-MM-DD). Negative if before. */
export function toDayIndex(iso: string, epoch: string): number {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${epoch.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** Inverse of toDayIndex. */
export function fromDayIndex(index: number, epoch: string): string {
  return new Date(Date.parse(`${epoch.slice(0, 10)}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A moment's calendar day where the clock is, as YYYY-MM-DD.
 *
 * `toISOString().slice(0, 10)` reads the *UTC* day, which is a different day from the one the
 * crew is standing in for part of every day: west of UTC it runs ahead, east of it behind. On a
 * schedule that is not a rounding detail — "today" decides whether a job is overdue, which week a
 * digest covers, and where the plan line sits — so a workspace at UTC−11 had jobs called late on
 * their own start date for the last eleven hours of every day.
 */
export function localIsoDate(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** Inclusive calendar duration in days between two dates (1 day minimum). */
export function inclusiveDuration(startIso: string, endIso: string): number {
  return Math.max(1, toDayIndex(endIso, startIso) + 1);
}

/* ── Working calendar ─────────────────────────────────────────────────────
   Crews don't work Sundays or holidays, so scheduling on raw calendar days
   silently inflates every duration, lag and float (a "1 day cure" across a
   weekend is really 3 calendar days). The fix is to run the *whole* engine on a
   working-day axis: index 0 is the first working day, 1 the next, and so on —
   non-working days simply don't exist on the axis.

   Because calculateCpm is already integer-index based, none of its maths
   changes; only this mapping does. Durations and lags are therefore expressed
   in working days, which is what a schedule actually means by "2 days". */

export type WorkCalendarOptions = {
  /** Non-working weekdays, 0=Sun … 6=Sat. Default [0] — a six-day construction week. */
  weekendDays?: number[];
  /** Additional non-working dates (public holidays), as YYYY-MM-DD. */
  holidays?: Iterable<string>;
};

export type WorkCalendar = {
  isWorkingDay(iso: string): boolean;
  /** Working-day index for a date. Non-working dates snap forward to the next working day. */
  toIndex(iso: string): number;
  /** The date at a working-day index. */
  fromIndex(index: number): string;
  /** Inclusive count of working days in [start, end]; at least 1. */
  duration(startIso: string, endIso: string): number;
  /** First working day on or after `iso`. */
  nextWorkingDay(iso: string): string;
};

/**
 * A hard stop on how far the axis will ever reach: a century of calendar days.
 * Nothing here needs it in practice — it exists so a runaway index (a forecast
 * off a near-zero reported rate, say) asks for memory once and stops.
 */
const MAX_CALENDAR_DAYS = 40_000;

/** How much axis to materialise at a time — a year and a bit, so the ordinary case grows once. */
const GROWTH_CHUNK = 400;

/**
 * Build a working-day axis starting at (or just after) `epoch`.
 *
 * The axis is materialised lazily and has no fixed end. That matters: a fixed
 * window clamps every date past it to the same index, and because the epoch is
 * the *earliest* job in the workspace, one old job used to drag the window's end
 * back in front of the work — a project finishing in 2026 reported a finish date
 * in 2023, with every float and slip figure derived from the same collapsed axis.
 * Dates before the epoch still clamp to index 0, which is what "the plan starts
 * here" means.
 */
export function createWorkCalendar(epoch: string, options: WorkCalendarOptions = {}): WorkCalendar {
  const weekend = new Set(options.weekendDays ?? [0]);
  const holidays = new Set(options.holidays ?? []);
  const start = epoch.slice(0, 10);

  const isWorking = (iso: string) => {
    if (holidays.has(iso)) return false;
    return !weekend.has(new Date(`${iso}T00:00:00Z`).getUTCDay());
  };

  /** Every calendar day from the epoch, in order, as far as anything has asked. */
  const all: string[] = [];
  /** Just the working ones — index N on the axis is `workingDates[N]`. */
  const workingDates: string[] = [];
  const indexOfWorking = new Map<string, number>();
  /** Per calendar-day offset: the axis index of the last working day at or before it, −1 if none yet. */
  const previousWorking: number[] = [];

  /** Materialise the axis out to `days` calendar days from the epoch. */
  const grow = (days: number) => {
    const target = Math.min(Math.max(days, all.length + GROWTH_CHUNK), MAX_CALENDAR_DAYS);
    for (let offset = all.length; offset < target; offset += 1) {
      const iso = fromDayIndex(offset, start);
      all.push(iso);
      if (isWorking(iso)) {
        indexOfWorking.set(iso, workingDates.length);
        workingDates.push(iso);
      }
      previousWorking.push(workingDates.length - 1);
    }
  };
  grow(GROWTH_CHUNK);

  /** The axis index of the first working day at or after `offset` calendar days from the epoch. */
  const nextWorkingFrom = (offset: number): number => {
    for (let cursor = Math.max(offset, 0); ; cursor += 1) {
      if (cursor >= all.length) {
        if (all.length >= MAX_CALENDAR_DAYS) break;
        grow(cursor + 1);
      }
      const index = indexOfWorking.get(all[cursor]);
      if (index !== undefined) return index;
    }
    // Only reachable past the century cap, or on a calendar with no working day at all.
    return Math.max(workingDates.length - 1, 0);
  };

  return {
    isWorkingDay: isWorking,
    toIndex(iso) {
      const date = iso.slice(0, 10);
      if (date < start) return 0;
      return nextWorkingFrom(toDayIndex(date, start));
    },
    fromIndex(index) {
      if (index <= 0) return workingDates[0] ?? start;
      while (workingDates.length <= index && all.length < MAX_CALENDAR_DAYS) {
        const before = workingDates.length;
        grow(all.length + Math.max(GROWTH_CHUNK, index - workingDates.length + 1));
        if (workingDates.length === before && all.length >= MAX_CALENDAR_DAYS) break;
      }
      return workingDates[Math.min(index, workingDates.length - 1)] ?? start;
    },
    duration(startIso, endIso) {
      const from = this.toIndex(startIso);
      const end = endIso.slice(0, 10);
      if (end < start) return 1;
      const offset = toDayIndex(end, start);
      if (offset >= all.length) grow(offset + 1);
      const to = offset < previousWorking.length ? previousWorking[offset] : workingDates.length - 1;
      // An end before the start, or before the first working day, is not a span: one day.
      return to < 0 || to < from ? 1 : to - from + 1;
    },
    nextWorkingDay(iso) {
      return this.fromIndex(this.toIndex(iso));
    }
  };
}

/** First cycle reachable in the network, for reporting an invalid plan. */
function findCycle(taskIds: string[], successors: Map<string, CpmLink[]>): string[] {
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 in-stack, 2 done
  const stack: string[] = [];

  const walk = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const link of successors.get(id) ?? []) {
      const next = link.successorId;
      const seen = state.get(next) ?? 0;
      if (seen === 1) return stack.slice(stack.indexOf(next)).concat(next);
      if (seen === 0) {
        const found = walk(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of taskIds) {
    if ((state.get(id) ?? 0) === 0) {
      const found = walk(id);
      if (found) return found;
    }
  }
  return [];
}

/**
 * Schedule a network: forward pass → project finish → backward pass → float.
 * Returns `cycle` (and empty results) when the network is not a DAG.
 */
export function calculateCpm(tasks: CpmTask[], links: CpmLink[]): CpmResult {
  const empty: CpmResult = { tasks: {}, projectStart: 0, projectFinish: 0, criticalPath: [], cycle: null };
  if (tasks.length === 0) return empty;

  const byId = new Map(tasks.map((task) => [task.id, task]));
  // Ignore links that point at tasks we don't have, or at themselves.
  const edges = links.filter(
    (link) => byId.has(link.predecessorId) && byId.has(link.successorId) && link.predecessorId !== link.successorId
  );

  const predecessors = new Map<string, CpmLink[]>();
  const successors = new Map<string, CpmLink[]>();
  for (const task of tasks) {
    predecessors.set(task.id, []);
    successors.set(task.id, []);
  }
  for (const link of edges) {
    predecessors.get(link.successorId)!.push(link);
    successors.get(link.predecessorId)!.push(link);
  }

  // Topological order (Kahn). Anything left over sits on a cycle.
  const indegree = new Map(tasks.map((task) => [task.id, predecessors.get(task.id)!.length]));
  const queue = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const link of successors.get(id)!) {
      const left = indegree.get(link.successorId)! - 1;
      indegree.set(link.successorId, left);
      if (left === 0) queue.push(link.successorId);
    }
  }
  if (order.length !== tasks.length) {
    return {
      ...empty,
      cycle: findCycle(
        tasks.map((task) => task.id),
        successors
      )
    };
  }

  // ---- forward pass: earliest dates the network allows ----------------------
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of order) {
    const task = byId.get(id)!;
    let start = 0;
    for (const link of predecessors.get(id)!) {
      const predStart = earlyStart.get(link.predecessorId)!;
      const predFinish = earlyFinish.get(link.predecessorId)!;
      let required: number;
      switch (link.type) {
        case "FS":
          required = predFinish + link.lag;
          break;
        case "SS":
          required = predStart + link.lag;
          break;
        case "FF":
          required = predFinish + link.lag - task.duration;
          break;
        case "SF":
          required = predStart + link.lag - task.duration;
          break;
      }
      start = Math.max(start, required);
    }
    if (task.constraintDate != null) {
      if (task.constraintType === "SNET") start = Math.max(start, task.constraintDate);
      if (task.constraintType === "MSO") start = task.constraintDate;
    }
    earlyStart.set(id, start);
    earlyFinish.set(id, start + task.duration);
  }

  const projectStart = Math.min(...order.map((id) => earlyStart.get(id)!));
  const projectFinish = Math.max(...order.map((id) => earlyFinish.get(id)!));

  // ---- backward pass: latest dates that still hit the project finish --------
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const task = byId.get(id)!;
    const outgoing = successors.get(id)!;
    let finish = outgoing.length === 0 ? projectFinish : Number.POSITIVE_INFINITY;
    for (const link of outgoing) {
      const succStart = lateStart.get(link.successorId)!;
      const succFinish = lateFinish.get(link.successorId)!;
      let allowed: number;
      switch (link.type) {
        case "FS":
          allowed = succStart - link.lag;
          break;
        case "SS":
          allowed = succStart - link.lag + task.duration;
          break;
        case "FF":
          allowed = succFinish - link.lag;
          break;
        case "SF":
          allowed = succFinish - link.lag + task.duration;
          break;
      }
      finish = Math.min(finish, allowed);
    }
    if (task.constraintDate != null) {
      if (task.constraintType === "FNLT") finish = Math.min(finish, task.constraintDate);
      if (task.constraintType === "MSO") finish = task.constraintDate + task.duration;
    }
    if (task.deadline != null) finish = Math.min(finish, task.deadline);
    lateFinish.set(id, finish);
    lateStart.set(id, finish - task.duration);
  }

  // ---- float + critical path ----------------------------------------------
  const results: Record<string, CpmTaskResult> = {};
  for (const id of order) {
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const total = ls - es;

    // Free float: the smallest slack across this task's own outgoing relations.
    let free = projectFinish - ef;
    const outgoing = successors.get(id)!;
    if (outgoing.length > 0) {
      free = Number.POSITIVE_INFINITY;
      for (const link of outgoing) {
        const succStart = earlyStart.get(link.successorId)!;
        const succFinish = earlyFinish.get(link.successorId)!;
        let slack: number;
        switch (link.type) {
          case "FS":
            slack = succStart - (ef + link.lag);
            break;
          case "SS":
            slack = succStart - (es + link.lag);
            break;
          case "FF":
            slack = succFinish - (ef + link.lag);
            break;
          case "SF":
            slack = succFinish - (es + link.lag);
            break;
        }
        free = Math.min(free, slack);
      }
    }

    results[id] = {
      id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat: total,
      freeFloat: free,
      critical: total <= 0
    };
  }

  const criticalPath = order
    .filter((id) => results[id].critical)
    .sort((left, right) => results[left].earlyStart - results[right].earlyStart || results[left].earlyFinish - results[right].earlyFinish);

  return { tasks: results, projectStart, projectFinish, criticalPath, cycle: null };
}

/* ── Baseline comparison ─────────────────────────────────────────────────── */

export type BaselineVariance = {
  /** Days the current start slipped vs the baseline (negative = earlier). */
  startVariance: number;
  /** Days the current finish slipped vs the baseline. */
  finishVariance: number;
  /** True when the current plan finishes later than the baseline. */
  slipped: boolean;
};

/** Compare a current start/finish against a saved baseline, in days. */
export function compareToBaseline(
  current: { startDate: string; endDate: string },
  baseline: { baselineStart?: string | null; baselineEnd?: string | null }
): BaselineVariance | null {
  if (!baseline.baselineStart || !baseline.baselineEnd) return null;
  const startVariance = toDayIndex(current.startDate, baseline.baselineStart);
  const finishVariance = toDayIndex(current.endDate, baseline.baselineEnd);
  return { startVariance, finishVariance, slipped: finishVariance > 0 };
}
