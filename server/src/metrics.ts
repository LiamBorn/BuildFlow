/* =========================================================================
   Runtime metrics — counters kept in this process, read back over /api/ops/stats.

   The request log says what happened; this says how much and how fast, which is
   the question you have at 9am when something is "slow". Hand-rolled, like the
   rest of the server: no client library, and the Prometheus text format is a
   dozen lines to write by hand.

   THE THING TO BE CAREFUL ABOUT IS LABEL CARDINALITY. A metric keyed by the raw
   request path is an unbounded map fed by strangers: anyone can ask for
   /api/nope-1, /api/nope-2, … and every one becomes a permanent entry. That is a
   memory leak with a public trigger. So routes are labelled by the PATTERN Express
   matched (`/api/projects/:id`, never `/api/projects/p-riverside`), which is
   bounded by the route table, and anything that matched no route at all — a 404, a
   body the parser rejected — is folded into one bucket. The hard cap below is a
   belt to that brace: it cannot be reached by the routes this server has, and if
   some future route is ever labelled by something caller-chosen it stops being a
   leak and starts being an obviously wrong number.

   What is deliberately NOT here: anything identifying. No org, no account, no
   path parameters. A metrics endpoint is the kind of thing that gets pointed at a
   dashboard and forgotten about, so it holds counts and nothing else.
   ========================================================================= */

import { ROUTE_POLICY } from "./permissions.js";

/** Beyond this many distinct request labels, stop adding new ones. See the note above. */
const MAX_LABELS = 300;
const OVERFLOW = "(overflow)";
const UNMATCHED = "(unmatched)";

/**
 * The parameterless paths this server actually serves, taken from the route policy — the one
 * table that already has to list every route. Used to label a request that never reached a
 * route layer (see recordRequest). Fixed at import: nothing a caller sends can add to it.
 */
const STATIC_ROUTES = new Set(
  Object.keys(ROUTE_POLICY)
    .map((key) => key.slice(key.indexOf(" ") + 1))
    .filter((path) => !path.includes(":"))
);

/** Upper bounds in ms. A request slower than the last one lands in +Inf. */
const DURATION_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

type DurationBucket = { upToMs: number; count: number };

type RouteStats = {
  method: string;
  route: string;
  count: number;
  totalMs: number;
  maxMs: number;
  /** Counts by status class, so a route's error rate is one subtraction away. */
  byClass: Record<"2xx" | "3xx" | "4xx" | "5xx" | "other", number>;
};

const statusClass = (status: number): keyof RouteStats["byClass"] => {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  return "other";
};

class Metrics {
  private startedAt = Date.now();
  private routes = new Map<string, RouteStats>();
  private buckets = new Array(DURATION_BUCKETS.length + 1).fill(0) as number[];
  private requestCount = 0;
  private requestMs = 0;
  private saves = { count: 0, bytes: 0, totalMs: 0, maxMs: 0 };

  /**
   * One finished request.
   *
   * `route` is Express's matched pattern, and is undefined whenever the request never
   * reached a route layer — a 404, a body the parser refused, and, most commonly, anything
   * the auth gate turned away, because that gate is middleware and runs before routing. If
   * those all collapsed into one bucket the API's 401s would be a single number with no
   * clue which endpoint they were aimed at, which is exactly what you want to know.
   *
   * So when there is no matched pattern, `path` is used — but ONLY if it is one of the
   * literal, parameterless routes this server declares. That set is fixed at import time
   * from the route policy, so it cannot be grown by a caller: an unknown path, or a real
   * path with an id in it, still becomes one bucket. This is a lookup in a constant set,
   * not a second implementation of Express's matcher.
   */
  recordRequest(method: string, route: string | undefined, status: number, ms: number, path?: string) {
    this.requestCount += 1;
    this.requestMs += ms;
    let bucket = DURATION_BUCKETS.findIndex((upper) => ms <= upper);
    if (bucket === -1) bucket = DURATION_BUCKETS.length;
    this.buckets[bucket] += 1;

    const label = route ?? (path && STATIC_ROUTES.has(path) ? path : UNMATCHED);
    const key = `${method} ${label}`;
    let stats = this.routes.get(key);
    if (!stats) {
      if (this.routes.size >= MAX_LABELS) {
        stats = this.routes.get(OVERFLOW) ?? {
          method: "-",
          route: OVERFLOW,
          count: 0,
          totalMs: 0,
          maxMs: 0,
          byClass: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 }
        };
        this.routes.set(OVERFLOW, stats);
      } else {
        stats = {
          method,
          route: label,
          count: 0,
          totalMs: 0,
          maxMs: 0,
          byClass: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 }
        };
        this.routes.set(key, stats);
      }
    }
    stats.count += 1;
    stats.totalMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    stats.byClass[statusClass(status)] += 1;
  }

  /**
   * One database publish. This is the metric that matters most for this server in
   * particular: sql.js cannot write incrementally, so every save re-exports and rewrites
   * the WHOLE file and fsyncs it. "How many megabytes did we rewrite today" is the real
   * cost of a busy workspace, and the thing that grows quietly when a table fills with rows
   * nobody reads.
   */
  recordSave(bytes: number, ms: number) {
    this.saves.count += 1;
    this.saves.bytes += bytes;
    this.saves.totalMs += ms;
    this.saves.maxMs = Math.max(this.saves.maxMs, ms);
  }

  snapshot() {
    const memory = process.memoryUsage();
    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      requests: {
        total: this.requestCount,
        averageMs: this.requestCount === 0 ? 0 : round(this.requestMs / this.requestCount),
        byRoute: [...this.routes.values()]
          .sort((a, b) => b.count - a.count)
          .map((r) => ({
            method: r.method,
            route: r.route,
            count: r.count,
            averageMs: round(r.totalMs / r.count),
            maxMs: round(r.maxMs),
            ...r.byClass
          })),
        durationBuckets: [
          ...DURATION_BUCKETS.map((upper, i): DurationBucket => ({ upToMs: upper, count: this.buckets[i] })),
          { upToMs: Number.POSITIVE_INFINITY, count: this.buckets[DURATION_BUCKETS.length] }
        ]
      },
      databaseWrites: {
        total: this.saves.count,
        megabytesRewritten: round(this.saves.bytes / (1024 * 1024)),
        averageMs: this.saves.count === 0 ? 0 : round(this.saves.totalMs / this.saves.count),
        maxMs: round(this.saves.maxMs)
      },
      memory: { rssMb: round(memory.rss / (1024 * 1024)), heapUsedMb: round(memory.heapUsed / (1024 * 1024)) }
    };
  }

  /** The same numbers in Prometheus' text exposition format. */
  prometheus(): string {
    const s = this.snapshot();
    const out: string[] = [];
    const add = (name: string, help: string, type: "counter" | "gauge" | "histogram", lines: string[]) => {
      out.push(`# HELP buildflow_${name} ${help}`, `# TYPE buildflow_${name} ${type}`, ...lines);
    };

    add("uptime_seconds", "Seconds since this process started.", "gauge", [`buildflow_uptime_seconds ${s.uptimeSeconds}`]);
    add(
      "requests_total",
      "Finished HTTP requests, by matched route pattern and status class.",
      "counter",
      s.requests.byRoute.flatMap((r) =>
        (["2xx", "3xx", "4xx", "5xx", "other"] as const)
          .filter((cls) => r[cls] > 0)
          .map((cls) => `buildflow_requests_total{method="${esc(r.method)}",route="${esc(r.route)}",status="${cls}"} ${r[cls]}`)
      )
    );

    // A histogram's buckets are cumulative: each counts everything at or below its bound.
    let cumulative = 0;
    const bucketLines = s.requests.durationBuckets.map((b) => {
      cumulative += b.count;
      const le = Number.isFinite(b.upToMs) ? String(b.upToMs) : "+Inf";
      return `buildflow_request_duration_ms_bucket{le="${le}"} ${cumulative}`;
    });
    add("request_duration_ms", "Request duration in milliseconds.", "histogram", [
      ...bucketLines,
      `buildflow_request_duration_ms_sum ${round(s.requests.total * s.requests.averageMs)}`,
      `buildflow_request_duration_ms_count ${s.requests.total}`
    ]);

    add("database_writes_total", "Whole-file database publishes.", "counter", [
      `buildflow_database_writes_total ${s.databaseWrites.total}`
    ]);
    add("database_bytes_written_total", "Bytes rewritten by those publishes.", "counter", [
      `buildflow_database_bytes_written_total ${Math.round(s.databaseWrites.megabytesRewritten * 1024 * 1024)}`
    ]);
    add("memory_rss_bytes", "Resident set size.", "gauge", [`buildflow_memory_rss_bytes ${Math.round(s.memory.rssMb * 1024 * 1024)}`]);
    return `${out.join("\n")}\n`;
  }

  /** Tests share one process, so they need to start from nothing. */
  reset() {
    this.startedAt = Date.now();
    this.routes.clear();
    this.buckets = new Array(DURATION_BUCKETS.length + 1).fill(0);
    this.requestCount = 0;
    this.requestMs = 0;
    this.saves = { count: 0, bytes: 0, totalMs: 0, maxMs: 0 };
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
/** Prometheus label values escape backslash, quote and newline — nothing else. */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/** One registry for the process. */
export const metrics = new Metrics();
