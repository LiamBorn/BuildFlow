/**
 * BuildFlow for Mac's downloads (macDownloads.ts): the Sparkle feed, latest.json and the disk images,
 * served publicly from server/downloads/mac/. Sparkle and browsers use HEAD and Range on the images,
 * so both are checked with exact byte counts, and so is every way of asking for a file that is not
 * one of those three kinds.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MAC_DOWNLOADS_DIR, registerMacDownloads } from "../src/macDownloads.js";
import { ROUTE_POLICY } from "../src/permissions.js";
import { serveClient } from "../src/serveClient.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const DMG = "BuildFlow-0.2.0.dmg";
const DMG_BYTES = crypto.randomBytes(200_000);
const APPCAST = '<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel><title>BuildFlow for Mac</title></channel></rss>\n';
const LATEST = JSON.stringify({ version: "0.2.0", build: 2, file: DMG });

/** A served folder as release.sh leaves it, next to a file that must never be reachable from it. */
function releaseFolder() {
  const root = tempDir("buildflow-downloads-");
  const dir = path.join(root, "mac");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "appcast.xml"), APPCAST);
  fs.writeFileSync(path.join(dir, "latest.json"), LATEST);
  fs.writeFileSync(path.join(dir, DMG), DMG_BYTES);
  fs.writeFileSync(path.join(root, "secret.txt"), "not for you");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a download");
  return { root, dir };
}

function downloadsApp() {
  const folder = releaseFolder();
  const app = express();
  registerMacDownloads(app, folder.dir);
  return { app, ...folder };
}

describe("/downloads/mac/: what is served, and how", () => {
  it("serves the appcast as XML that caches must revalidate", async () => {
    const { app } = downloadsApp();
    const res = await request(app).get("/downloads/mac/appcast.xml").expect(200);
    expect(res.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.text).toBe(APPCAST);
    expect(res.headers.etag).toBeTruthy();
    // revalidating with the ETag costs a 304 and no body
    await request(app).get("/downloads/mac/appcast.xml").set("If-None-Match", res.headers.etag).expect(304);
  });

  it("serves latest.json as JSON that caches must revalidate", async () => {
    const { app } = downloadsApp();
    const res = await request(app).get("/downloads/mac/latest.json").expect(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.body).toEqual(JSON.parse(LATEST));
  });

  it("serves a disk image whole, as a disk image, cached for a year and never revalidated", async () => {
    const { app } = downloadsApp();
    const res = await request(app)
      .get(`/downloads/mac/${DMG}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toBe("application/x-apple-diskimage");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["content-length"]).toBe(String(DMG_BYTES.length));
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(Buffer.compare(res.body as Buffer, DMG_BYTES)).toBe(0);
  });

  it("answers HEAD with the same headers, the real length, and no body", async () => {
    const { app } = downloadsApp();
    const res = await request(app).head(`/downloads/mac/${DMG}`).expect(200);
    expect(res.headers["content-type"]).toBe("application/x-apple-diskimage");
    expect(res.headers["content-length"]).toBe(String(DMG_BYTES.length));
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.text ?? "").toBe("");
    await request(app).head("/downloads/mac/appcast.xml").expect(200).expect("content-type", "application/xml; charset=utf-8");
  });

  it("answers a Range with exactly those bytes, so a download can resume", async () => {
    const { app } = downloadsApp();
    const binary = (response: NodeJS.ReadableStream, done: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => done(null, Buffer.concat(chunks)));
    };
    const first = await request(app).get(`/downloads/mac/${DMG}`).set("Range", "bytes=0-99").buffer(true).parse(binary).expect(206);
    expect(first.headers["content-range"]).toBe(`bytes 0-99/${DMG_BYTES.length}`);
    expect(first.headers["content-length"]).toBe("100");
    expect(Buffer.compare(first.body as Buffer, DMG_BYTES.subarray(0, 100))).toBe(0);

    const rest = await request(app).get(`/downloads/mac/${DMG}`).set("Range", "bytes=150000-").buffer(true).parse(binary).expect(206);
    expect(rest.headers["content-range"]).toBe(`bytes 150000-${DMG_BYTES.length - 1}/${DMG_BYTES.length}`);
    expect(Buffer.compare(rest.body as Buffer, DMG_BYTES.subarray(150000))).toBe(0);

    const past = await request(app)
      .get(`/downloads/mac/${DMG}`)
      .set("Range", `bytes=${DMG_BYTES.length + 10}-`)
      .expect(416);
    expect(past.headers["content-range"]).toBe(`bytes */${DMG_BYTES.length}`);
  });
});

describe("/downloads/mac/: everything else is a 404", () => {
  it("answers a release that is not there, and any other name, with a plain 404", async () => {
    const { app } = downloadsApp();
    for (const name of [
      "BuildFlow-9.9.9.dmg",
      "notes.txt",
      "BuildFlow-0.2.dmg",
      "buildflow-0.2.0.dmg",
      "appcast.xml.bak",
      ".env",
      "latest.JSON"
    ]) {
      const res = await request(app).get(`/downloads/mac/${name}`);
      expect(res.status, name).toBe(404);
      expect(res.text, name).toBe("Not found");
    }
    // the folder is not a listing; its address leads to the download page instead
    await request(app).get("/downloads/mac/").expect(302).expect("location", "/#mac");
    await request(app).get("/downloads/mac").expect(302).expect("location", "/#mac");
  });

  it("refuses every spelling of a path outside the folder", async () => {
    const { app } = downloadsApp();
    const attempts = [
      "/downloads/mac/..%2Fsecret.txt",
      "/downloads/mac/..%2f..%2fpackage.json",
      "/downloads/mac/%2e%2e%2fsecret.txt",
      "/downloads/mac/..%5Csecret.txt",
      "/downloads/mac/%2Fetc%2Fpasswd",
      "/downloads/mac/../secret.txt",
      "/downloads/mac/appcast.xml%00.dmg",
      "/downloads/mac/BuildFlow-0.2.0.dmg%2F..%2F..%2Fsecret.txt"
    ];
    for (const url of attempts) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).not.toContain("not for you");
    }
  });

  it("does not follow a symlink, even one with a release's name", async () => {
    const { app, dir, root } = downloadsApp();
    fs.symlinkSync(path.join(root, "secret.txt"), path.join(dir, "BuildFlow-0.3.0.dmg"));
    fs.mkdirSync(path.join(dir, "BuildFlow-0.4.0.dmg"));
    const link = await request(app).get("/downloads/mac/BuildFlow-0.3.0.dmg").expect(404);
    expect(link.text).not.toContain("not for you");
    await request(app).get("/downloads/mac/BuildFlow-0.4.0.dmg").expect(404);
  });
});

describe("/downloads/mac/ in the real server", () => {
  const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-mac-downloads-"), "test.sqlite"), reset: true });

  it("is public: the committed appcast answers without a session, with the API's baseline headers", async () => {
    expect(ROUTE_POLICY["GET /downloads/mac/:file"]).toBe("public");
    expect(ROUTE_POLICY["GET /downloads/mac"]).toBe("public");
    const app = await freshApp();
    const res = await request(app).get("/downloads/mac/appcast.xml").expect(200);
    expect(res.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.text).toBe(fs.readFileSync(path.join(MAC_DOWNLOADS_DIR, "appcast.xml"), "utf8"));
    expect(res.text).toContain('xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"');
    // a stale or foreign cookie changes nothing: this is not behind the session gate
    await request(app).get("/downloads/mac/appcast.xml").set("Cookie", "bf_session=not-a-session").expect(200);
  });

  it("answers a missing release with a 404, never with the website's page", async () => {
    const app = await freshApp();
    const dist = tempDir("buildflow-dist-");
    fs.writeFileSync(path.join(dist, "index.html"), '<!doctype html><div id="root"></div>');
    serveClient(app, dist);
    for (const url of ["/downloads/mac/BuildFlow-99.0.0.dmg", "/downloads/mac/..%2F..%2Fpackage.json", "/downloads/mac/nothing"]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).not.toContain('<div id="root">');
    }
  });
});
