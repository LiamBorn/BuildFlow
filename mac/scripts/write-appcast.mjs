#!/usr/bin/env node
/**
 * Writes the Sparkle feed (appcast.xml) and the website's latest.json for a new release, into the
 * folder the server serves (server/downloads/mac/), and prunes old disk images there.
 *
 *   node mac/scripts/write-appcast.mjs --dir <folder> --version 0.2.0 --build 2 \
 *     --file BuildFlow-0.2.0.dmg --length <bytes> --signature <edSignature> \
 *     --notes <notes.md> --base-url https://build-flow.replit.app/downloads/mac [--keep 2] [--hardware arm64]
 *
 * release.sh runs this after sign_update. The feed lists one <item> per disk image still in the
 * folder, newest build first, and keeps the newest `--keep` of them (two by default, so someone
 * halfway through downloading the previous one when a release lands still gets it). Items for the
 * images it keeps are carried over from the existing feed exactly as they were written, signature
 * and all; nothing here can sign, so nothing here can re-sign.
 *
 * latest.json is what the website's "BuildFlow for Mac" page reads for its Download button.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MIN_SYSTEM = "13.0";
const SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle";
const DMG_NAME = /^BuildFlow-(\d+\.\d+\.\d+)\.dmg$/;

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  for (const need of ["dir", "version", "build", "file", "length", "signature", "notes", "base-url"]) {
    if (!out[need]) throw new Error(`missing --${need}`);
  }
  return out;
}

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A CDATA section ends at the first "]]>", so one inside the notes is split across two sections.
const cdata = (s) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

function itemXml({ version, build, url, length, signature, notes, pubDate, hardware }) {
  return [
    "    <item>",
    `      <title>Version ${escapeXml(version)}</title>`,
    `      <pubDate>${pubDate}</pubDate>`,
    `      <sparkle:version>${escapeXml(build)}</sparkle:version>`,
    `      <sparkle:shortVersionString>${escapeXml(version)}</sparkle:shortVersionString>`,
    `      <sparkle:minimumSystemVersion>${MIN_SYSTEM}</sparkle:minimumSystemVersion>`,
    ...(hardware ? [`      <sparkle:hardwareRequirements>${escapeXml(hardware)}</sparkle:hardwareRequirements>`] : []),
    `      <description sparkle:format="markdown">${cdata(notes.trim())}</description>`,
    `      <enclosure url="${escapeXml(url)}" length="${escapeXml(String(length))}" type="application/x-apple-diskimage" sparkle:edSignature="${escapeXml(signature)}"/>`,
    "    </item>"
  ].join("\n");
}

/** The items of a feed this script wrote before, with the two facts needed to keep or drop each. */
function existingItems(feed) {
  const items = [];
  for (const match of feed.matchAll(/ {4}<item>[\s\S]*?<\/item>/g)) {
    const xml = match[0];
    const build = /<sparkle:version>([^<]+)<\/sparkle:version>/.exec(xml)?.[1];
    const url = /<enclosure url="([^"]+)"/.exec(xml)?.[1];
    if (!build || !url) continue;
    items.push({ xml, build: Number(build), file: decodeURIComponent(url.replace(/&amp;/g, "&").split("/").pop() ?? "") });
  }
  return items;
}

function feedXml(items, baseUrl) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<rss version="2.0" xmlns:sparkle="${SPARKLE_NS}" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    "  <channel>",
    "    <title>BuildFlow for Mac</title>",
    `    <link>${escapeXml(new URL("/#mac", baseUrl).href)}</link>`,
    "    <description>Updates to BuildFlow for Mac, newest first.</description>",
    "    <language>en</language>",
    ...items.map((item) => item.xml),
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");
}

/** Replaces a file in one step, so the server never hands out half of one. */
function writeAtomically(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const a = args(process.argv.slice(2));
const dir = path.resolve(a.dir);
const build = Number(a.build);
const keep = Math.max(1, Number(a.keep ?? 2));
if (!/^\d+\.\d+\.\d+$/.test(a.version) || !Number.isInteger(build) || build < 1) throw new Error("bad --version or --build");
if (!DMG_NAME.test(a.file) || !fs.existsSync(path.join(dir, a.file))) throw new Error(`${a.file} is not in ${dir}`);

const baseUrl = a["base-url"].replace(/\/+$/, "");
const feedPath = path.join(dir, "appcast.xml");
const previous = fs.existsSync(feedPath) ? existingItems(fs.readFileSync(feedPath, "utf8")) : [];
const newest = previous.reduce((max, item) => Math.max(max, item.build), 0);
if (build <= newest) throw new Error(`build ${build} is not newer than build ${newest} already in the feed; Sparkle would never offer it`);

const pubDate = new Date().toUTCString().replace("GMT", "+0000");
const url = `${baseUrl}/${encodeURIComponent(a.file)}`;
const item = {
  xml: itemXml({
    version: a.version,
    build: String(build),
    url,
    length: a.length,
    signature: a.signature,
    notes: fs.readFileSync(a.notes, "utf8"),
    pubDate,
    hardware: a.hardware
  }),
  build,
  file: a.file
};

// Newest first; only images still on disk; at most `keep`.
const kept = [item, ...previous.filter((p) => p.file !== a.file && fs.existsSync(path.join(dir, p.file)))]
  .sort((x, y) => y.build - x.build)
  .slice(0, keep);
const keptFiles = new Set(kept.map((k) => k.file));

writeAtomically(feedPath, feedXml(kept, baseUrl));

const dmg = fs.readFileSync(path.join(dir, a.file));
const latest = {
  name: "BuildFlow for Mac",
  version: a.version,
  build,
  file: a.file,
  url,
  length: dmg.length,
  sha256: crypto.createHash("sha256").update(dmg).digest("hex"),
  minimumSystemVersion: MIN_SYSTEM,
  hardware: a.hardware ?? "universal",
  publishedAt: new Date().toISOString()
};
writeAtomically(path.join(dir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);

const removed = [];
for (const name of fs.readdirSync(dir)) {
  if (DMG_NAME.test(name) && !keptFiles.has(name)) {
    fs.rmSync(path.join(dir, name));
    removed.push(name);
  }
}
console.log(`appcast.xml: ${kept.map((k) => `build ${k.build} (${k.file})`).join(", ")}`);
console.log(`latest.json: ${a.version} (${build}), ${dmg.length} bytes, sha256 ${latest.sha256}`);
if (removed.length) console.log(`removed older disk images: ${removed.join(", ")}`);
