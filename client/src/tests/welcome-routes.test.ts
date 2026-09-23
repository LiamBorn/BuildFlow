/**
 * The marketing router and the code that navigates, kept in agreement.
 *
 * These are two lists of the same hashes, written in different places by different people.
 * Navigation keeps its copy in `showWelcomeSubpage("view", "#hash")` calls, in the solution and
 * business-size page configs, in `productPlanHashes`/`productPlanViews`, and in
 * `automationConfigs` (whose `id` becomes the hash). The router keeps its copy in
 * `welcomeRoutes`. Nothing connected them, and on 2026-09-16 one side was emptied while the
 * other was left alone.
 *
 * What that cost: `showWelcomeSubpage` navigates with `history.pushState`, which does not fire
 * `hashchange`, so the pages kept rendering when clicked while their URLs stopped resolving.
 * 42 of the 54 views were reachable but not linkable -- share, bookmark or reload any of them
 * and you landed on the hero with the original URL still in the address bar. Nothing failed.
 * No test, no type and no console message reported it, because both halves were individually
 * valid; only the relationship between them was broken. Restored 2026-09-23.
 *
 * So this reads both halves out of App.tsx and compares them. It is a source read, which is
 * crude, but the alternative -- deriving `welcomeRoutes` from the navigation tables at runtime --
 * would put the router below them in the file and make it depend on five separate consts for a
 * lookup that should be legible on its own.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "App.tsx"), "utf8");

/** The router's table, as written. */
function routerTable(): Record<string, string> {
  const start = source.indexOf("const welcomeRoutes: Record<string, WelcomeView> = {");
  const end = source.indexOf("\n};", start);
  const body = source.slice(start, end);
  const table: Record<string, string> = {};
  for (const m of body.matchAll(/"(#[^"]+)":\s*"(\w+)"/g)) table[m[1]] = m[2];
  return table;
}

/**
 * Every (hash, view) pair the app uses to NAVIGATE, from all four places they are written.
 * A pair missing from here is not a false pass: it means navigation grew a fifth home, and
 * the count assertion below is what notices.
 */
function navigationPairs(): { hash: string; view: string; from: string }[] {
  const pairs: { hash: string; view: string; from: string }[] = [];
  for (const m of source.matchAll(/showWelcomeSubpage\("(\w+)",\s*"(#[^"]+)"/g)) {
    pairs.push({ hash: m[2], view: m[1], from: "showWelcomeSubpage" });
  }
  for (const m of source.matchAll(/view:\s*"(\w+)",\s*\n?\s*hash:\s*"(#[^"]+)"/g)) {
    pairs.push({ hash: m[2], view: m[1], from: "page config" });
  }
  // the plan pages keep hash and view in two tables, joined on the plan id
  const hashes = Object.fromEntries([...source.matchAll(/(\w+):\s*"(#[a-z-]+-plan)"/g)].map((m) => [m[1], m[2]]));
  const views = Object.fromEntries([...source.matchAll(/(\w+):\s*"(\w+Plan)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, hash] of Object.entries(hashes)) {
    if (views[id]) pairs.push({ hash, view: views[id], from: "productPlanHashes" });
  }
  // automationConfigs: the key is the view, and its `id` becomes the hash
  const start = source.indexOf("const automationConfigs");
  let depth = 0;
  let i = start;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) break;
  }
  const block = source.slice(start, i + 1);
  for (const m of block.matchAll(/^ {2}(\w+):\s*\{/gm)) {
    const id = /id:\s*"([^"]+)"/.exec(block.slice(m.index, m.index + 600));
    if (id) pairs.push({ hash: `#${id[1]}`, view: m[1], from: "automationConfigs" });
  }
  return pairs;
}

const table = routerTable();
const pairs = navigationPairs();

describe("every page the app navigates to is also reachable by its URL", () => {
  it("reads both halves", () => {
    // If either extraction silently stops matching, everything below passes on nothing.
    expect(Object.keys(table).length, "welcomeRoutes entries").toBeGreaterThan(40);
    expect(pairs.length, "navigation pairs found in App.tsx").toBeGreaterThan(30);
  });

  it("routes every hash that navigation uses", () => {
    const unrouted = pairs.filter((p) => !table[p.hash]);
    expect(
      [...new Set(unrouted.map((p) => `${p.hash} -> ${p.view} (from ${p.from})`))],
      "navigable but not linkable: reachable by clicking, and the hero on reload"
    ).toEqual([]);
  });

  it("sends each hash to the same view navigation sends it to", () => {
    const disagree = pairs
      .filter((p) => table[p.hash] && table[p.hash] !== p.view)
      .map((p) => `${p.hash}: router says "${table[p.hash]}", ${p.from} says "${p.view}"`);
    expect([...new Set(disagree)], "the two halves disagree").toEqual([]);
  });

  /**
   * The three emailed links carry a token after a "?" inside the hash, so the router matches
   * them by prefix and they are deliberately absent from the table. If one is ever added to it,
   * the exact match would shadow the prefix branch and every emailed link would break.
   */
  it("leaves the token-carrying routes to the prefix branch", () => {
    for (const hash of ["#reset-password", "#verify-email", "#accept-invite"]) {
      expect(table[hash], `${hash} must stay out of the table`).toBeUndefined();
      expect(source, `${hash} must be matched by prefix`).toContain(`hash.startsWith("${hash}")`);
    }
  });
});
