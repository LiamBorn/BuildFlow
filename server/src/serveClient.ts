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
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      }
    })
  );
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || isApi(req.path)) return next();
    // a file that is not there (/logo.png) is missing, not a page of the program
    if (path.extname(req.path) && path.extname(req.path) !== ".html") return notFound(res);
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(page, (error) => {
      if (error && !res.headersSent) res.status(500).type("text/plain").send("Something went wrong. Please try again.");
    });
  });
  return true;
}
