/**
 * BuildFlow for Mac's downloads: https://build-flow.replit.app/downloads/mac/<file>, served from
 * server/downloads/mac/ in the repo (step 7 of the Mac plan, 2026-09-26).
 *
 * mac/scripts/release.sh writes that folder; a release reaches the public by commit, push, and a Pull
 * + Republish in Replit. Three kinds of file live there, and nothing else is ever served from it:
 *   - appcast.xml, the Sparkle feed every installed copy checks once a day. `no-cache`: a cache may
 *     keep it but must ask again each time, so a release is seen on the next check, not a day later.
 *   - latest.json, what the website's "BuildFlow for Mac" page (#mac) reads for its Download button.
 *     Same rule, for the same reason.
 *   - BuildFlow-<x.y.z>.dmg, the releases. A version's image is never replaced (release.sh refuses),
 *     so these are cached for a year and marked immutable.
 * Sparkle and browsers both size a download with HEAD and resume one with Range, so both work, with
 * a correct Content-Length (express's sendFile, via `send`). An appcast or image that is not there
 * yet is a plain 404, which Sparkle treats as "try again later". The folder's own address redirects
 * to the website's download page.
 *
 * Public on purpose: nothing here belongs to a workspace, and an app that has not connected yet is
 * exactly who needs it. It is not under /api, so neither the session gate nor the device gate sees it
 * (not in OPS_PREFIXES), and ROUTE_POLICY has it as "public".
 *
 * WHICH names are served is decided by pattern before the disk is touched, which is what keeps this
 * route from being a way to read the rest of the server: a separator, "..", a leading dot, a
 * percent-encoded slash (Express decodes params) or any other name simply matches nothing. The file
 * must then be a regular file directly in the folder; a symlink is refused rather than followed.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";

export const MAC_DOWNLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../downloads/mac");

const REVALIDATE = "no-cache";
const IMMUTABLE = "public, max-age=31536000, immutable";

/** Every name the folder may serve, with its type and how long it may be cached. */
const SERVED: Array<{ name: RegExp; type: string; cache: string }> = [
  { name: /^appcast\.xml$/, type: "application/xml; charset=utf-8", cache: REVALIDATE },
  { name: /^latest\.json$/, type: "application/json; charset=utf-8", cache: REVALIDATE },
  { name: /^BuildFlow-\d{1,4}\.\d{1,4}\.\d{1,4}\.dmg$/, type: "application/x-apple-diskimage", cache: IMMUTABLE }
];

const notFound = (res: express.Response) => res.status(404).type("text/plain").send("Not found");

/** Registers GET (and so HEAD) /downloads/mac/:file. `dir` is for tests. */
export function registerMacDownloads(app: express.Application, dir = MAC_DOWNLOADS_DIR): void {
  const folder = path.resolve(dir);
  // The folder itself is not a listing: a person who types it in wants the download page.
  app.get("/downloads/mac", (_req, res) => res.redirect(302, "/#mac"));
  app.get("/downloads/mac/:file", async (req, res) => {
    const name = String(req.params.file);
    const kind = SERVED.find((entry) => entry.name.test(name));
    if (!kind) return notFound(res);
    const file = path.join(folder, name);
    if (path.dirname(file) !== folder) return notFound(res);
    let size: number;
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile()) return notFound(res);
      size = stat.size;
    } catch {
      return notFound(res);
    }
    res.sendFile(
      name,
      {
        /* Relative to `root`, not an absolute path: `send` refuses a path with a dot-folder anywhere
           in it (its dotfiles rule), and a checkout can sit under one (.claude/worktrees/...). */
        root: folder,
        // our own Cache-Control and Content-Type, rather than send's max-age=0 and extension guess
        cacheControl: false,
        headers: { "Content-Type": kind.type, "Cache-Control": kind.cache },
        acceptRanges: true,
        etag: true,
        lastModified: true
      },
      (error) => {
        // After the headers the client has gone (a cancelled download); there is nothing to answer.
        if (!error || res.headersSent) return;
        const status = (error as { status?: number }).status;
        if (status === 404) return notFound(res);
        // a Range past the end: say how long the file is, as RFC 9110 asks, so the client can retry
        if (status === 416) res.setHeader("Content-Range", `bytes */${size}`);
        res.status(status && status >= 400 && status < 600 ? status : 500).end();
      }
    );
  });
}
