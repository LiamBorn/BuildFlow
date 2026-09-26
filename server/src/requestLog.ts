/* =========================================================================
   Request logging — hand-rolled, like the rest of this server.

   There was none at all, so nothing that happened in production left a trace:
   no way to tell a slow route from a broken one, or to tie a customer saying
   "it failed at about four" to anything. This is the smallest thing that fixes
   that without adding a dependency.

   Two rules shape what a line may contain.

   1. THE QUERY STRING IS NEVER LOGGED. Secrets live in it here: the calendar
      feed's key (`/api/feeds/:orgId/:crewId.ics?key=…`, the only thing guarding
      a workspace's whole schedule on a route that is outside the session gate),
      an OAuth authorization `code`, the one-time `token` on a verify or reset
      link, and `?token=` on the ops routes. A log file is copied, shipped and
      read far more casually than a database is, and the same care that put
      `Referrer-Policy: no-referrer` on these responses applies to writing the
      URL down here. Parameter NAMES are kept, which is enough to tell which
      shape of request it was. HEADERS AND BODIES are never logged either,
      which is what keeps BuildFlow for Mac's secrets out: its device key
      travels only as `Authorization: Bearer bfd_…`, and the connect code,
      PKCE verifier and freshly issued key only in the body of
      POST /api/desktop/token or the query of the Connect page and its
      buildflow:// redirect (test/desktop.test.ts checks all of them).
   2. NOTHING UNTRUSTED GOES IN RAW. Express leaves `req.path` percent-encoded,
      but it DECODES query parameter names — a request to `?bad%0Akey=1` arrives
      as the key `"bad\nkey"`, a real newline. A newline in a log line is a
      forged log line, which is how someone hides what they did, so control
      characters are stripped from every caller-chosen string. The path is
      sanitised too: it is safe as Express hands it over today, and that is a
      property of `req.path` rather than a promise to this module. Both are
      capped, so one request cannot write a megabyte into the log.
   ========================================================================= */
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { metrics } from "./metrics.js";

/** Strip control characters and cap the length of anything the caller chose. */
function safeForLog(value: string, max = 200): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "");
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/** The names of the query parameters, never their values. */
function queryShape(req: Request): string {
  const keys = Object.keys(req.query ?? {});
  if (keys.length === 0) return "";
  return `?${keys
    .map((k) => safeForLog(k, 40))
    .sort()
    .join(",")}`;
}

export type RequestLogMode = "off" | "text" | "json";

/**
 * How loudly to log. `REQUEST_LOG` takes off | text | json; unset means text, except
 * under test where a line per request would bury the suite's own output.
 */
export function requestLogMode(env: NodeJS.ProcessEnv = process.env): RequestLogMode {
  const raw = env.REQUEST_LOG?.trim().toLowerCase();
  if (raw === "off" || raw === "text" || raw === "json") return raw;
  if (raw === "on") return "text";
  return env.NODE_ENV === "test" ? "off" : "text";
}

export function createRequestLogger(mode: RequestLogMode = requestLogMode()) {
  return function requestLogger(req: Request, res: Response, next: NextFunction) {
    const id = crypto.randomBytes(8).toString("hex");
    // Handed back so a customer's screenshot of an error can be found in the log.
    res.setHeader("X-Request-Id", id);

    const startedAt = process.hrtime.bigint();
    let done = false;
    const finish = () => {
      if (done) return; // "finish" and "close" both fire on a normal response
      done = true;
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const status = res.statusCode;

      /* Counted whatever REQUEST_LOG says. Turning the log down is a decision about noise,
         not about whether the server keeps track of itself — and the route label is
         Express's matched PATTERN, never the path the caller chose. See metrics.ts on why
         that distinction is the whole ballgame. */
      metrics.recordRequest(req.method, req.route?.path, status, ms, req.path);
      if (mode === "off") return;

      /* A load balancer polls health continuously. Logging every successful poll buries
         everything worth reading, so a healthy check is dropped — a failing one is exactly
         what someone will be looking for, and is kept. */
      if (req.path === "/api/health" && status < 400) return;

      const method = safeForLog(req.method, 10);
      const path = `${safeForLog(req.path)}${queryShape(req)}`;
      const org = req.org?.id;
      const account = req.account?.id;

      if (mode === "json") {
        console.log(
          JSON.stringify({
            t: new Date().toISOString(),
            id,
            method,
            path,
            status,
            ms: Number(ms.toFixed(1)),
            ...(org ? { org } : {}),
            ...(account ? { account } : {})
          })
        );
        return;
      }

      const who = org ? ` ${org}${account ? `/${account}` : ""}` : "";
      const line = `${method} ${path} ${status} ${ms.toFixed(1)}ms [${id}]${who}`;
      // 5xx is ours to fix and belongs on stderr with everything else that went wrong.
      if (status >= 500) console.error(`→ ${line}`);
      else console.log(`→ ${line}`);
    };

    res.on("finish", finish);
    res.on("close", finish); // a client that hung up still deserves a line
    next();
  };
}
