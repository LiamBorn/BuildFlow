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

/**
 * Every path under src, relative to it.
 *
 * `readdirSync(path, { recursive: true })` is the ONLY readdirSync the project's `node:fs` shim
 * declares, and the shim is deliberately minimal -- see tests/node-fs-shim.d.ts for why adding
 * Node's globals to a 39,000-line DOM program is not free. Walking with `withFileTypes` typechecks
 * nowhere here, and reading only the top level also missed onboarding/onboarding.css.
 */
const paths = readdirSync(SRC, { recursive: true }).filter(
  (rel) => !rel.includes("node_modules") && !rel.includes("dist")
);
const inTests = (rel: string) => rel.split(/[\\/]/).includes("tests");

/** Read as bytes -- vitest resolves a CSS *import* to an empty string. */
const sheets = paths
  .filter((rel) => rel.endsWith(".css"))
  .map((rel) => ({ file: rel, root: postcss.parse(readFileSync(join(SRC, rel), "utf8"), { from: rel }) }));

/**
 * Every .ts/.tsx under src, for the custom properties that are set from code rather than CSS.
 *
 * `tests` is excluded, and not as housekeeping: this file names `url(#pr-area-grad)` in a comment
 * to explain the bug it guards, and while it read its own directory it reported that comment as a
 * live dangling reference. A test that documents a defect will always look like it contains one.
 */
const codePaths = paths.filter((rel) => /\.tsx?$/.test(rel) && !inTests(rel));
const code = codePaths.map((rel) => readFileSync(join(SRC, rel), "utf8"));

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
  for (const { root } of sheets) {
    // Braces matter: postcss expects `false | void` from a walker, and `Set.add` returns the Set.
    root.walkAtRules(/^(-\w+-)?keyframes$/, (at) => {
      defined.add(at.params.trim());
    });
  }

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
    root.walkAtRules("property", (at) => {
      declared.add(at.params.trim());
    });
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
   * There is no exception list. There was one -- three tokens read by rules whose selectors
   * appeared in no .ts/.tsx -- and those 48 dead rules were removed across seven sheets rather
   * than exempted, so the invariant holds with nothing carved out of it. If a token has to be
   * listed here again, prefer deleting the rule that reads it: an exemption in a test is a
   * place for exactly this kind of thing to settle and stay.
   */

  it("finds var() references to check at all", () => {
    expect(bare.length).toBeGreaterThan(100);
    expect(declared.size).toBeGreaterThan(100);
  });

  it("declares every token that a rule reads without a fallback", () => {
    const missing = bare.filter((b) => !declared.has(b.name));
    expect(missing.map((m) => `${m.name} (${m.at})`), "read with no fallback, declared nowhere").toEqual([]);
  });

});

describe("every url(#id) points at a paint server that exists", () => {
  /**
   * The third form of the same bug, and the one that crosses languages: `fill: url(#pr-area-grad)`
   * sat in production-reports-redesign.css while the gradient it names was defined in no file at
   * all. An SVG paint reference that resolves to nothing paints nothing -- no error, no warning.
   * These references live in both the sheets and the JSX (`fill="url(#x)"`), and the `<linearGradient
   * id="x">` that answers them is almost always in a .tsx, so neither language can check it alone.
   */
  const REF = /url\(#([A-Za-z0-9_-]+)\)/g;
  const references: { id: string; at: string }[] = [];
  for (const { file, root } of sheets) {
    root.walkDecls((decl) => {
      for (const m of decl.value.matchAll(REF)) references.push({ id: m[1], at: where(file, decl) });
    });
  }
  for (const [i, src] of code.entries()) {
    for (const m of src.matchAll(REF)) {
      references.push({ id: m[1], at: `${codePaths[i]}:${src.slice(0, m.index).split("\n").length}` });
    }
  }
  const ids = new Set<string>();
  for (const src of code) for (const m of src.matchAll(/\bid="([^"{}]+)"/g)) ids.add(m[1]);

  it("has references to check", () => {
    // Only a handful exist. If this ever fails because the last SVG paint server was removed,
    // delete this block rather than lowering the floor -- a check over nothing is not a check.
    expect(references.length).toBeGreaterThan(0);
  });

  it("resolves every one to a declared id", () => {
    const dangling = references.filter((r) => !ids.has(r.id));
    expect(dangling.map((d) => `url(#${d.id}) (${d.at})`), "paints with a gradient defined nowhere").toEqual([]);
  });
});
