/**
 * `htmlFor` and `aria-*` attributes that point at an id nothing defines.
 *
 * The same failure shape as css-integrity.test.ts, one layer up. `htmlFor="onb-frist"` is not a
 * type error, not a lint error, and not a rendering error -- React writes the attribute out
 * faithfully and the browser resolves it to nothing. The label simply stops being a label:
 * clicking it no longer focuses the field, and a screen reader announces the input unnamed.
 * `aria-labelledby` on a dialog fails the same way, which is worse, because the dialog then has
 * no accessible name at all and nothing anywhere reports it.
 *
 * jsdom would not catch it either. It resolves these attributes only if a test renders BOTH
 * elements and asserts on the accessible name, and the suite's a11y assertions are per-component,
 * so a reference across two components is checked by nothing.
 *
 * WHAT THIS CANNOT DO: ids are matched across the whole codebase, so a reference that resolves to
 * an id in a component that never renders beside it still passes. That weakens it to catching the
 * blatant case -- a typo, or an id that has been renamed or deleted on one side only. That is the
 * common case and worth a guard; a stronger check would need the render tree, not the source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "tests") return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const files = sources(SRC).map((p) => ({ path: p.slice(SRC.length + 1), text: readFileSync(p, "utf8") }));

const ID_LITERAL = /\bid="([^"{}]+)"/g;
/** `id={`row-${x}`}` -- the static head is all a source read can know about the ids it makes. */
const ID_TEMPLATE = /\bid=\{`([^`$]*)\$\{/g;
const REFERENCE = /\b(htmlFor|aria-labelledby|aria-describedby|aria-controls|aria-owns)="([^"{}]+)"/g;

const declared = new Set<string>();
const templatePrefixes: string[] = [];
/** One entry per id named; `aria-labelledby="a b"` names two. */
const references: { id: string; attr: string; at: string }[] = [];

for (const { path, text } of files) {
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  for (const m of text.matchAll(ID_LITERAL)) declared.add(m[1]);
  for (const m of text.matchAll(ID_TEMPLATE)) if (m[1]) templatePrefixes.push(m[1]);
  for (const m of text.matchAll(REFERENCE)) {
    for (const id of m[2].trim().split(/\s+/)) {
      references.push({ id, attr: m[1], at: `${path}:${lineOf(m.index)}` });
    }
  }
}

/** An id built at runtime can only be judged by its static head, so accept any reference under one. */
const couldBeBuilt = (id: string) => templatePrefixes.some((p) => id.startsWith(p));

describe("labels and aria attributes point at ids that exist", () => {
  it("finds references to check at all", () => {
    // Guards against a reader that has quietly stopped matching -- see css-integrity.test.ts,
    // where a floor set too low hid the fact that most of the work was being skipped.
    expect(references.length).toBeGreaterThan(100);
    expect(declared.size).toBeGreaterThan(150);
  });

  it("resolves every literal reference to a declared id", () => {
    const dangling = references.filter((r) => !declared.has(r.id) && !couldBeBuilt(r.id));
    expect(
      dangling.map((d) => `${d.attr}="${d.id}" (${d.at})`),
      "points at an id declared nowhere in src"
    ).toEqual([]);
  });

  /**
   * The same id appearing in several files is FINE here and deliberately not failed: the
   * onboarding flow gives every page's `<h1>` the id `onb-title` so the enclosing
   * `<main aria-labelledby="onb-title">` names whichever page is mounted, and the branches are
   * mutually exclusive -- `OnboardingFlow` returns early for the plan step, and its other steps
   * are `{step === n && …}`. This asserts the convention stays a convention: an id reused across
   * files must be reused for the same PURPOSE, which here means always on a heading.
   */
  it("keeps the shared onboarding title id on a heading", () => {
    const wrong: string[] = [];
    for (const { path, text } of files) {
      for (const m of text.matchAll(/<(\w+)[^>]*\bid="onb-title"/g)) {
        if (!/^h[1-6]$/.test(m[1])) wrong.push(`<${m[1]}> at ${path}`);
      }
    }
    expect(wrong, "onb-title names the page heading; it must sit on one").toEqual([]);
  });
});
