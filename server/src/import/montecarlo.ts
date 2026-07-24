/* =========================================================================
   Probabilistic finish dates — Monte Carlo over the remaining CPM network.

   The deterministic plan finish is a single number that assumes every remaining
   activity runs exactly as planned. It almost never does, and where paths merge
   the late one always wins — so the real finish skews later than the plan claims.
   This is the honest statistical version of that: run the remaining schedule
   thousands of times, each run drawing every remaining activity's duration from a
   distribution centred on the *observed* pace, threading them through the real
   precedence logic (FS/SS/FF/SF + lag), and read the finish-date percentiles off
   the result.

   No ML, no black box: it's a forward-pass CPM inside a sampling loop, seeded so
   the same file always yields the same band. Assumptions (calendar days, a right-
   skewed triangular duration spread, a shared correlation factor, no resource
   levelling or work calendars) are stated in `method` and surfaced in the UI.
   ========================================================================= */

import type { ImportedActivity, RelationType } from "./types.js";

export type FinishConfidence = {
  iterations: number;
  /** The schedule's own planned finish — what it claims. */
  planFinish: string;
  /** Percentile finish dates from the simulation. */
  p10: string;
  p50: string;
  p80: string;
  p90: string;
  /** Chance (0–100) of finishing on or before the planned finish. */
  onTimeProbability: number;
  /** Days the P50 / P80 land past the plan (+ late). */
  p50SlipDays: number;
  p80SlipDays: number;
  method: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function absDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}
function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic PRNG (mulberry32) so a given schedule always yields the same
 *  band — users must not see the numbers wobble when they re-import. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw from a triangular distribution — the standard three-point shape for
 *  schedule-risk durations. Right-skewed inputs model "overruns have a fatter
 *  tail than underruns". */
function triangular(rng: () => number, min: number, mode: number, max: number): number {
  if (max <= min) return min;
  const u = rng();
  const c = (mode - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

type SimNode = {
  id: string;
  isComplete: boolean;
  fixedFinishDay: number; // completed activities: their (actual) finish, fixed
  startFloorDay: number; // earliest the remaining work can (re)start
  remainingDays: number; // remaining calendar-day duration at the data date
  preds: { id: string; type: RelationType; lagDays: number }[];
};

/**
 * @returns undefined when there's nothing to simulate (no dated activities, or
 *   all work already complete) — the caller keeps its deterministic forecast.
 */
export function simulateFinish(
  activities: ImportedActivity[],
  opts: { dataDate: string; scheduleIndex: number; lowProgress: boolean; seed?: number; iterations?: number }
): FinishConfidence | undefined {
  const dated = activities.filter((a) => !a.isSummary && a.start && a.finish);
  if (dated.length === 0) return undefined;

  const dataDay = absDay(opts.dataDate);
  const knownIds = new Set(dated.map((a) => a.externalId));

  const nodes: SimNode[] = dated.map((activity) => {
    const startDay = absDay(activity.start!);
    const finishDay = absDay(activity.finish!);
    const plannedSpan = Math.max(0, finishDay - startDay);
    const pct = clamp(activity.percentComplete ?? 0, 0, 100) / 100;
    const isComplete = pct >= 1;
    const remainingFrac = isComplete ? 0 : activity.percentComplete && activity.percentComplete > 0 ? 1 - pct : 1;
    const inProgress = !isComplete && (activity.percentComplete ?? 0) > 0;
    return {
      id: activity.externalId,
      isComplete,
      fixedFinishDay: finishDay,
      // in-progress work extends from the data date; not-started work can't begin
      // before either its planned start or the data date
      startFloorDay: inProgress ? dataDay : Math.max(startDay, dataDay),
      remainingDays: plannedSpan * remainingFrac,
      preds: activity.predecessors
        .filter((rel) => knownIds.has(rel.predecessorId))
        .map((rel) => ({ id: rel.predecessorId, type: rel.type, lagDays: rel.lagHours / 24 }))
    };
  });

  if (nodes.every((n) => n.isComplete || n.remainingDays <= 0)) return undefined;

  const order = topoOrder(nodes);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Pace → central duration multiplier for remaining work. When there's too
  // little progress to read a pace, stay neutral (1.0) but widen the spread.
  const paceFactor = opts.lowProgress ? 1 : clamp(1 / (opts.scheduleIndex || 1), 0.7, 3);
  const indSpread = opts.lowProgress ? { lo: 0.6, hi: 1.9 } : { lo: 0.8, hi: 1.35 };

  const iterations = opts.iterations ?? (nodes.length > 1500 ? 1200 : 2500);
  const rng = makeRng(opts.seed ?? 0x9e3779b9 ^ nodes.length);

  const planFinishDay = Math.max(...nodes.map((n) => n.fixedFinishDay));
  const finishes: number[] = new Array(iterations);
  const start: Record<string, number> = {};
  const finish: Record<string, number> = {};

  for (let iter = 0; iter < iterations; iter += 1) {
    // One correlated common factor per run: if this build is having a bad month,
    // most activities feel it. Without this, independent draws cancel out on long
    // chains and the band collapses — understating risk.
    const common = triangular(rng, 0.95, 1.0, 1.12);
    let projectFinish = -Infinity;

    for (const id of order) {
      const node = nodeById.get(id)!;
      if (node.isComplete) {
        start[id] = node.fixedFinishDay - 0;
        finish[id] = node.fixedFinishDay;
        if (finish[id] > projectFinish) projectFinish = finish[id];
        continue;
      }
      const dur = node.remainingDays * paceFactor * common * triangular(rng, indSpread.lo, 1.0, indSpread.hi);
      let es = node.startFloorDay;
      for (const pred of node.preds) {
        const pEF = finish[pred.id] ?? node.startFloorDay;
        const pES = start[pred.id] ?? node.startFloorDay;
        if (pred.type === "FS") es = Math.max(es, pEF + pred.lagDays);
        else if (pred.type === "SS") es = Math.max(es, pES + pred.lagDays);
        else if (pred.type === "FF") es = Math.max(es, pEF + pred.lagDays - dur);
        else es = Math.max(es, pES + pred.lagDays - dur); // SF
      }
      const ef = es + dur;
      start[id] = es;
      finish[id] = ef;
      if (ef > projectFinish) projectFinish = ef;
    }
    finishes[iter] = projectFinish;
  }

  finishes.sort((a, b) => a - b);
  const pct = (p: number) => finishes[clamp(Math.floor((p / 100) * iterations), 0, iterations - 1)];
  const p50Day = Math.round(pct(50));
  const p80Day = Math.round(pct(80));
  const onTime = finishes.filter((d) => d <= planFinishDay + 0.5).length;

  return {
    iterations,
    planFinish: dayToIso(planFinishDay),
    p10: dayToIso(Math.round(pct(10))),
    p50: dayToIso(p50Day),
    p80: dayToIso(p80Day),
    p90: dayToIso(Math.round(pct(90))),
    onTimeProbability: Math.round((onTime / iterations) * 100),
    p50SlipDays: p50Day - planFinishDay,
    p80SlipDays: p80Day - planFinishDay,
    method: `${iterations.toLocaleString()} Monte Carlo runs over the remaining CPM logic, durations drawn around your current pace. Calendar-day model; assumes no resource levelling. An estimate, not a promise.`
  };
}

/** DFS topological order over the predecessor DAG. Back-edges (cycles from bad
 *  source data) are skipped rather than allowed to hang the simulation. */
function topoOrder(nodes: SimNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 0 | 1 | 2>(); // 0 visiting, 2 done
  const out: string[] = [];
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === 2 || s === 0) return; // done, or a back-edge into an in-progress node
    state.set(id, 0);
    const node = byId.get(id);
    if (node) for (const pred of node.preds) visit(pred.id);
    state.set(id, 2);
    out.push(id);
  };
  for (const node of nodes) visit(node.id);
  return out;
}
