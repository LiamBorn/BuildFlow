/**
 * The pages, from the same process as the API: one address for the landing page, signing in and
 * the program (2026-09-23, for running BuildFlow on Replit — docs/replit.md).
 *
 * In development the pages come from Vite's dev server, which hands /api to this one. A deployment
 * has one process and one public port, so there — NODE_ENV=production, after `npm run build` has
 * written client/dist — index.ts calls this after createApp:
 * - /assets/* are Vite's content-hashed files, cached for a year. A name that is not there is a
 *   plain 404, never the page: a script tag handed HTML fails in a way nobody can read.
 * - the rest of client/dist (the logo, the videos, robots.txt) is cached for an hour.
 * - every other GET that is not the API and does not name a file gets index.html, never cached,
 *   so a release is picked up on the next load. The program routes in the browser, so a deep link
 *   has to get the page too.
 * `app.locals.servesPages` tells createApp's `GET /` to let the landing page through instead of
 * redirecting to BUILDFLOW_CLIENT_URL, which in this shape is this same address.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

export const DEFAULT_CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const isApi = (url: string) => url === "/api" || url.startsWith("/api/");

const notFound = (res: express.Response) => res.status(404).type("text/plain").send("Not found");

/**
 * The Content-Security-Policy for BuildFlow's own page.
 *
 * Set on the HTML and nowhere else, because a policy governs a DOCUMENT: on a JSON response it is
 * noise, and in development Vite serves the page and the API is a different origin, so a policy from
 * here would not reach the document anyway. This function only runs when we are the one serving it.
 *
 * Every source below was read off the build rather than guessed:
 *   - `script-src 'self'` is safe because the built index.html has NO inline script. Vite emits one
 *     module tag pointing at /assets, so nothing needs 'unsafe-inline' or a nonce.
 *   - `style-src` DOES need 'unsafe-inline': the product sets style attributes from React all over
 *     (`style={{ height: 260 }}`), and CSP treats a style attribute under style-src-attr, which
 *     falls back to style-src. Inline styles cannot exfiltrate anything the way inline script can,
 *     which is why this is the usual place to draw the line.
 *   - fonts.googleapis.com serves the stylesheet index.html links, fonts.gstatic.com the font files.
 *   - `blob:` for images and media because attachments are previewed through
 *     URL.createObjectURL, and `data:` for the inlined icons in the CSS.
 *   - The three analytics hosts are listed although analytics ships off (VITE_ANALYTICS_PROVIDER
 *     defaults to none), so that turning it on does not silently break instead of working.
 *
 * CONTENT_SECURITY_POLICY=off turns it off from the environment. A policy that can only be relaxed
 * by editing source and redeploying is a policy someone disables by deleting the whole line in a
 * hurry; this is the same reasoning as BUILDFLOW_DATA_FILE.
 */
const ANALYTICS = ["https://plausible.io", "https://www.googletagmanager.com", "https://us.i.posthog.com"];
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Two hosts the marketing pages hotlink photographs from: Unsplash on the templates, customers
  // and help pages, and cdn.21st.dev in the nav's hover links. Found by loading the built site under
  // this policy and reading the violations — the first draft had 'self' data: blob: and blocked every
  // photograph on the public site, which is the kind of thing a policy written from the imports alone
  // gets wrong.
  "img-src 'self' data: blob: https://images.unsplash.com https://cdn.21st.dev",
  "media-src 'self' blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src 'self' ${ANALYTICS.join(" ")}`,
  `connect-src 'self' https://www.google-analytics.com ${ANALYTICS.join(" ")}`
].join("; ");

/** The headers BuildFlow's own page carries, over and above the API's. */
export function pageHeaders(res: express.Response) {
  if ((process.env.CONTENT_SECURITY_POLICY ?? "on").trim().toLowerCase() === "off") return;
  res.setHeader("Content-Security-Policy", CSP);
  /* Nothing in BuildFlow asks for a camera, a microphone or a location, so nothing embedded in it
     should be able to either. */
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

/** Serves the built client in `dir`. False, with nothing added, when there is no build there. */
export function serveClient(app: express.Application, dir = DEFAULT_CLIENT_DIST): boolean {
  const page = path.join(dir, "index.html");
  if (!fs.existsSync(page)) return false;
  app.locals.servesPages = true;

  app.use("/assets", express.static(path.join(dir, "assets"), { index: false, immutable: true, maxAge: "365d" }));
  app.use("/assets", (_req, res) => notFound(res));
  app.use(
    express.static(dir, {
      index: false,
      maxAge: "1h",
      // index.html itself, asked for by name, is the page: never cached either
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          pageHeaders(res);
        }
      }
    })
  );
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || isApi(req.path)) return next();
    // a file that is not there (/logo.png) is missing, not a page of the program
    if (path.extname(req.path) && path.extname(req.path) !== ".html") return notFound(res);
    res.setHeader("Cache-Control", "no-cache");
    pageHeaders(res);
    res.sendFile(page, (error) => {
      if (error && !res.headersSent) res.status(500).type("text/plain").send("Something went wrong. Please try again.");
    });
  });
  return true;
}
