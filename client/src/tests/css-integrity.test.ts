/**
 * References in CSS that resolve to nothing.
 *
 * Two of the client's stylesheets shipped a declaration that did nothing at all, and neither
 * was found by a person reading the file, a linter, the build, or the 815 tests:
 *
 *   - `hs-home.css` animated the dashboard's drag drop slot with `hs-dropslot-in`, a keyframe
 *     defined in no commit in the repository's history (fixed in 7fc6279);
 *   - the same file gave the lifted card `background-color: var(--hsh-paper)`, the one name of
 *     the ten `--hsh-*` tokens it uses that was never declared (fixed in 8daf181).
 *
 * Both are silent by design of the language. An unknown `animation-name` is not an error -- it
 * is a name that happens to match no `@keyframes`, so nothing plays. An unresolvable `var()`
 * with no fallback makes its declaration invalid at computed-value time, so the property takes
 * its inherited or initial value; `background-color` became `transparent`. lightningcss parses
 * both happily, because both are valid CSS. And as motion-language.test.ts explains, jsdom
 * applies no CSS whatsoever under vitest, so no rendering test can see either one.
 *
 * That leaves reading the source as the only way to catch this class, which is what this file
 * does. It is deliberately about REFERENCES, not about dead code: a rule nothing renders is a
 * different (and merely wasteful) problem, while a live rule whose reference resolves to
 * nothing is a feature that silently does not work.
 */
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every stylesheet, read as bytes -- vitest resolves a CSS *import* to an empty string. */
const sheets = readdirSync(SRC)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ file: f, root: postcss.parse(readFileSync(join(SRC, f), "utf8"), { from: f }) }));

/** Every .ts/.tsx under src, for the custom properties that are set from code rather than CSS. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "dist") return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return codeFiles(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
const code = codeFiles(SRC).map((p) => readFileSync(p, "utf8"));

const where = (file: string, node: postcss.Node) => `${file}:${node.source?.start?.line ?? "?"}`;

describe("every animation names a keyframe that exists", () => {
  /**
   * The words in an `animation` shorthand that are not the name. Per the grammar the name is
   * the only <custom-ident> in the shorthand, so after dropping these and anything that
   * parses as a number, whatever identifiers remain are names.
   */
  const NOT_A_NAME = new Set([
    "none", "infinite", "alternate", "reverse", "alternate-reverse", "forwards", "backwards",
    "both", "normal", "running", "paused", "linear", "ease", "ease-in", "ease-out",
    "ease-in-out", "step-start", "step-end", "initial", "inherit", "unset", "revert",
    "revert-layer", "auto"
  ]);

  const defined = new Set<string>();
  for (const { root } of sheets) root.walkAtRules(/^(-\w+-)?keyframes$/, (at) => defined.add(at.params.trim()));

  /**
   * Drop function calls, repeatedly, because they nest: `var(--hsx-ease, cubic-bezier(…))` needs
   * two passes, and a single pass leaves a dangling `var(` behind. Doing this in one pass is how
   * the first version of this file came to skip 151 of the client's ~200 animation declarations.
   */
  const stripCalls = (value: string) => {
    let prev = "";
    let out = value;
    while (prev !== out) {
      prev = out;
      out = out.replace(/[\w-]+\([^()]*\)/g, " ");
    }
    return out;
  };

  /** Names referenced by an `animation` / `animation-name` declaration, with where they are. */
  const referenced: { name: string; at: string }[] = [];
  let skippedRuntimeNames = 0;
  for (const { file, root } of sheets) {
    root.walkDecls(/^(-\w+-)?animation(-name)?$/, (decl) => {
      // cubic-bezier(0.22, 1, 0.36, 1) and steps(4, end) carry commas and bare words that would
      // otherwise read as names.
      const flat = stripCalls(decl.value);
      const names = flat
        .split(/[\s,]+/)
        .filter((w) => /^[a-zA-Z_-][\w-]*$/.test(w) && !NOT_A_NAME.has(w.toLowerCase()));
      if (names.length === 0) {
        // Nothing static left. Either the name itself came from a custom property -- which a
        // static read cannot judge -- or this is an `animation: none`. Only the former is
        // worth counting. A var() ANYWHERE in the value is NOT grounds to skip: it is almost
        // always the easing, and the name beside it is perfectly checkable.
        if (/var\(/.test(decl.value)) skippedRuntimeNames++;
        return;
      }
      for (const name of names) referenced.push({ name, at: where(file, decl) });
    });
  }

  it("finds animations to check at all", () => {
    // A smoke alarm, not the guard: a reader that has broken returns ~0, and the assertion
    // below is what actually catches work being skipped. So these sit far enough under the
    // real numbers (277 references, 163 names) to survive a dead-CSS sweep -- one earlier pass
    // removed nine keyframes at once, and a floor that fails on legitimate cleanup gets raised
    // by whoever it blocks, which is how a guard turns into a formality.
    expect(referenced.length).toBeGreaterThan(150);
    expect(defined.size).toBeGreaterThan(120);
  });

  it("is not quietly skipping declarations it could check", () => {
    // Every animation in this project names its keyframe literally; a name built from a token
    // would be new, and worth a deliberate decision rather than a silent exemption.
    expect(skippedRuntimeNames, "declarations whose animation NAME comes from a var()").toBe(0);
  });

  it("defines every keyframe that a rule animates with", () => {
    const missing = referenced.filter((r) => !defined.has(r.name));
    // The message carries the site, because the whole difficulty of this bug is finding it.
    expect(missing.map((m) => `${m.name} (${m.at})`), "animated but defined nowhere").toEqual([]);
  });
});

describe("every var() resolves to a token that exists", () => {
  /**
   * `var(--x, fallback)` is the documented way to read an optional token and is not a defect,
   * so only a BARE `var(--x)` is checked here.
   */
  const declared = new Set<string>();
  for (const { root } of sheets) {
    root.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) declared.add(decl.prop);
    });
    root.walkAtRules("property", (at) => declared.add(at.params.trim()));
  }
  // A custom property can also be set from code -- an inline style object or setProperty --
  // and 70 of this app's are. Without these the check would report them all as undefined.
  for (const src of code) {
    for (const m of src.matchAll(/["'`]?(--[\w-]+)["'`]?\s*:/g)) declared.add(m[1]);
    for (const m of src.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) declared.add(m[1]);
  }

  const bare: { name: string; at: string }[] = [];
  for (const { file, root } of sheets) {
    root.walkDecls((decl) => {
      for (const m of decl.value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
        if (m[2] === ")") bare.push({ name: m[1], at: where(file, decl) });
      }
    });
  }

  /**
   * Known unresolvable tokens, each in a rule whose selector appears in no .ts/.tsx -- so they
   * are dead CSS awaiting a sweep, not features that are broken. Listed rather than fixed
   * because a name that nothing renders cannot be verified against an intended appearance, and
   * guessing one is how a dead rule becomes a live wrong one.
   *
   * Deliberately no line numbers: two of these are in a sheet being rewritten, and a stale
   * number is worse than none. An entry here is not required to still exist -- sweeping the
   * rule is the point -- but it must not become DECLARED, which the second test below checks.
   */
  const KNOWN_DEAD = new Map([
    ["--project-progress", "styles.css `.project-progress-track i`; the track is rendered nowhere"],
    ["--crew-progress", "styles.css `.crew-utilization-track::before`; the track is rendered nowhere"],
    ["--dcx-dx", "welcome-redesign.css `.wx-band-cards`; the landing became FrostLanding.tsx"]
  ]);

  it("finds var() references to check at all", () => {
    expect(bare.length).toBeGreaterThan(100);
    expect(declared.size).toBeGreaterThan(100);
  });

  it("declares every token that a rule reads without a fallback", () => {
    const missing = bare.filter((b) => !declared.has(b.name) && !KNOWN_DEAD.has(b.name));
    expect(missing.map((m) => `${m.name} (${m.at})`), "read with no fallback, declared nowhere").toEqual([]);
  });

  it("keeps the dead list honest: an entry that has been declared must be removed from it", () => {
    const nowDeclared = [...KNOWN_DEAD.keys()].filter((k) => declared.has(k));
    expect(nowDeclared, "declared now, so drop it from KNOWN_DEAD").toEqual([]);
  });
});
