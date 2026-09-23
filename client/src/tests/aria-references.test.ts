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
 *
 * The last block covers the third form of the same thing: `href="#..."`, which must name either a
 * route the app answers or an element on the page. Two did neither -- the landing's "Learn more"
 * and a Settings footnote that was a link with a preventDefault on it -- and both are fixed, so
 * that block has no exception list. Do not add one: delete the dead anchor instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every .ts/.tsx under src, excluding tests.
 *
 * `readdirSync(path, { recursive: true })` is the only readdirSync the project's `node:fs` shim
 * declares (tests/node-fs-shim.d.ts explains why the shim stays minimal), so a `withFileTypes`
 * walk does not typecheck here even though it runs fine under vitest.
 */
/**
 * Blank out comments, keeping the line count so reported positions stay true.
 *
 * Not housekeeping: a fix worth making is usually worth a comment saying what it replaced, and
 * those comments quote the broken code. Three separate scans in one day flagged their own
 * explanation as the defect -- `href="#learn"` and `href="#usage-limits"` both live on now only
 * inside the comments that record removing them.
 */
const withoutComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));

const files = readdirSync(SRC, { recursive: true })
  .filter(
    (rel) =>
      /\.tsx?$/.test(rel) &&
      !/\.test\.tsx?$/.test(rel) &&
      !rel.split(/[\\/]/).some((part) => part === "tests" || part === "node_modules" || part === "dist")
  )
  .map((rel) => ({ path: rel, text: withoutComments(readFileSync(join(SRC, rel), "utf8")) }));

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

describe("every #anchor names a route or something on the page", () => {
  /** What the router answers, read from App.tsx's table plus its three prefix-matched routes. */
  const app = files.find((f) => f.path === "App.tsx")!.text;
  const table = app.slice(app.indexOf("const welcomeRoutes: Record<string, WelcomeView> = {"));
  const routes = new Set([
    ...[...table.slice(0, table.indexOf("\n};")).matchAll(/"(#[^"]+)"/g)].map((m) => m[1]),
    "#reset-password",
    "#verify-email",
    "#accept-invite"
  ]);

  const anchors: { href: string; at: string }[] = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/href="(#[^"]*)"/g)) {
      anchors.push({ href: m[1], at: `${path}:${text.slice(0, m.index).split("\n").length}` });
    }
  }

  it("finds anchors to check", () => {
    expect(anchors.length).toBeGreaterThan(150);
    expect(routes.size).toBeGreaterThan(40);
  });

  it("resolves every one", () => {
    const nowhere = anchors.filter((a) => !routes.has(a.href) && !declared.has(a.href.slice(1)));
    expect(
      nowhere.map((a) => `href="${a.href}" (${a.at})`),
      "a link that goes nowhere: it takes focus, reads as a link, and does nothing"
    ).toEqual([]);
  });
});

/**
 * The end of a JSX opening tag. Cannot be `<tag[^>]*>`: `onClick={() => …}` holds a `>` that
 * stops the match inside the attributes.
 */
const closeOfTagAt = (src: string, start: number) => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
};

describe("an icon-only button says what it does", () => {
  /**
   * A button whose only content is an icon has no accessible name unless one is given. A screen
   * reader announces "button" and nothing else, and it is invisible to everyone who can see the
   * icon — which is why it survives review. Nothing else here catches it: the eslint config
   * carries only react-hooks and typescript-eslint, with no jsx-a11y.
   *
   * Two things this had to get right, both found by testing the scanner rather than trusting it.
   * The opening tag cannot be matched with `<button[^>]*>`, because `onClick={() => …}` contains
   * a `>` and the match stops inside the attributes — 269 of these 533 buttons are that shape, so
   * a regex version reported zero while reading barely half of them. And "self-closing child"
   * does not mean "icon": `<SlideLabel text="Log in" />` and `<ScheduleBadge status={s} />` both
   * render text, so only children imported from lucide-react count.
   */

  const lucideNames = (src: string) => {
    const names = new Set<string>();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(" as ").pop()?.trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  const nameless: string[] = [];
  let scanned = 0;
  for (const { path, text } of files) {
    const icons = lucideNames(text);
    for (const m of text.matchAll(/<button\b/g)) {
      const gt = closeOfTagAt(text, m.index);
      if (gt === -1 || text[gt - 1] === "/") continue;
      const end = text.indexOf("</button>", gt);
      if (end === -1) continue;
      scanned += 1;
      const attrs = text.slice(m.index + "<button".length, gt);
      const body = text.slice(gt + 1, end);
      if (/\baria-label\b|\baria-labelledby\b|\btitle=/.test(attrs)) continue;
      if (body.replace(/<[^>]*>/g, "").replace(/\{[^{}]*\}/g, "").trim()) continue;
      const kids = [...body.matchAll(/<(\w+)[^>]*\/>/g)].map((k) => k[1]);
      if (!kids.length || body.replace(/<\w+[^>]*\/>/g, "").trim()) continue;
      if (kids.every((k) => icons.has(k))) {
        nameless.push(`<${kids.join(", ")} /> (${path}:${text.slice(0, m.index).split("\n").length})`);
      }
    }
  }

  it("finds buttons to check", () => {
    // A regex that truncates at the first `>` still finds hundreds, so a healthy count is not
    // evidence the scan is sound. The floor only catches a reader that has stopped entirely.
    expect(scanned).toBeGreaterThan(400);
  });

  it("gives every icon-only button an accessible name", () => {
    expect(nameless, "a screen reader announces these as \"button\" and nothing more").toEqual([]);
  });
});

describe("every form control has an accessible name", () => {
  /**
   * A control with no name is announced as "edit text, blank" — the screen reader reads the box
   * and not what goes in it. Like the icon-only button, it is invisible to anyone who can see the
   * layout, because the visual label is sitting right there unassociated.
   *
   * Four ways a control is named, and a scan that knows only the first one is useless: the first
   * version of this reported 83 of 185 controls unnamed, and 81 of those 83 were false. It could
   * not see `<Field label="Colors" htmlFor={colorsId}>` pairing a variable id, and it could not
   * see `<label>Site <input /></label>` wrapping one. It also stripped comments before counting
   * lines, so every position it printed was wrong — App.tsx:12030 named an `<a>`.
   */
  const CONTROL = /<(input|select|textarea)[\s>]/g;
  const EXEMPT_TYPE = /type=\{?["']?(hidden|submit|button|reset|image)/;

  /**
   * A `display: none` control is not in the accessibility tree and cannot be focused, so there is
   * nothing to name — the standard hidden `<input type="file">` behind a "Choose file" button.
   * Read from the stylesheets rather than allowlisted, so that un-hiding one brings it back into
   * this test. A class hidden in one rule and shown in another would be exempted wrongly; that
   * direction only ever loses a catch, and no file input in this codebase is styled that way.
   */
  const hiddenClasses = new Set<string>();
  for (const rel of readdirSync(SRC, { recursive: true })) {
    if (!/\.css$/.test(rel)) continue;
    const css = readFileSync(join(SRC, rel), "utf8");
    for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      if (/display\s*:\s*none/.test(m[2])) hiddenClasses.add(m[1]);
    }
  }

  /** Everything a `<label>` points at: `htmlFor="x"`, `htmlFor={x}`, and a component that forwards it. */
  const labelled = new Set<string>();
  for (const { text } of files) {
    for (const m of text.matchAll(/htmlFor=(?:\{([^}]+)\}|"([^"]+)")/g)) {
      labelled.add((m[1] ?? m[2]).trim());
    }
  }

  const nameless: string[] = [];
  let scanned = 0;
  for (const { path, text } of files) {
    /* `<label>…</label>` spans, for a control named by being wrapped in one. */
    const wraps: [number, number][] = [];
    for (const m of text.matchAll(/<label[\s>]/g)) {
      const end = text.indexOf("</label>", m.index);
      if (end !== -1) wraps.push([m.index, end]);
    }
    for (const m of text.matchAll(CONTROL)) {
      const gt = closeOfTagAt(text, m.index);
      if (gt === -1) continue;
      scanned += 1;
      const tag = text.slice(m.index, gt + 1);
      if (EXEMPT_TYPE.test(tag)) continue;
      if (/\baria-label\b|\baria-labelledby\b|\btitle=/.test(tag)) continue;
      if (wraps.some(([a, b]) => a < m.index && m.index < b)) continue;
      const id = /\bid=(?:\{([^}]+)\}|"([^"]+)")/.exec(tag);
      if (id && labelled.has((id[1] ?? id[2]).trim())) continue;
      const cls = /className="([^"]*)"/.exec(tag);
      if (cls && cls[1].split(/\s+/).some((c) => hiddenClasses.has(c))) continue;
      nameless.push(`<${m[1]}> (${path}:${text.slice(0, m.index).split("\n").length})`);
    }
  }

  it("finds controls to check", () => {
    expect(scanned).toBeGreaterThan(150);
  });

  it("names every one", () => {
    expect(nameless, 'a screen reader reads these as "edit text, blank"').toEqual([]);
  });
});

describe("anything focusable and clickable can be worked from the keyboard", () => {
  /**
   * The shape this exists for, which App.tsx carried 15 times until 2026-09-23:
   *
   *     <a onClick={onBack} role="button" tabIndex={0}>Back to home</a>
   *
   * tabIndex={0} makes it focusable and role="button" makes a screen reader announce "button",
   * but an `<a>` with no href has no activation behaviour: Enter and Space dispatch no click, and
   * there was no key handler. Tab to it, hear "button", press Enter, nothing happens. A mouse
   * never notices, which is how all 15 survived review on the most-visited pages in the product.
   *
   * They were fixed by giving them real hrefs and dropping role/tabIndex -- they were links all
   * along -- which is why the count here is small. The rule is the regression guard, not a cleanup
   * queue, and a denominator of 3 is too small to be evidence by itself: the proof that this reads
   * anything is the mutation, not the floor.
   *
   * Three ways to be operable, matching what the platform actually does:
   *   - a native control (<button>, <input>, <summary>, and <a> WITH an href)
   *   - an explicit key handler
   *   - nothing else. tabIndex alone grants focus, never activation.
   *
   * WHAT THIS RULE DOES NOT COVER, so its green is not read as more than it is: it only looks at
   * elements that PRESENT as controls. An `<a onClick={...}>` with no href and no tabIndex is not
   * focusable at all, so Tab never reaches it -- unreachable rather than inoperable, and invisible
   * to this rule. There are 32 of those in App.tsx as of 2026-09-23, every link in the marketing
   * footers ("Dashboard", "Schedule", "Get BuildFlow", "Log in"), inside <nav aria-label="Footer">.
   *
   * They are not fixable the way the 15 above were. `onExplore` reaches `openAppPage`, which calls
   * pushState with pathname+search only (App.tsx:2702) and then setPage -- an in-app page has no
   * URL, so an href would name a route that does not exist. They are buttons drawn as links, and
   * making them buttons needs the footer CSS to follow. Handed to the session that owns those
   * pages; extend this rule to `<a onClick>` without an href once they land.
   */
  const NATIVE = new Set(["button", "input", "select", "textarea", "summary", "label", "option"]);
  const dead: string[] = [];
  let scanned = 0;
  for (const { path, text } of files) {
    for (const m of text.matchAll(/<(\w+)(?=[\s/>])/g)) {
      const gt = closeOfTagAt(text, m.index);
      if (gt === -1) continue;
      const tag = text.slice(m.index, gt + 1);
      const name = m[1];
      // "presents itself as a control": announced as one, or reachable by Tab on purpose.
      const presents = /role=\{?["']button["']/.test(tag) || /tabIndex=\{0\}/.test(tag);
      if (!presents || !/onClick/.test(tag)) continue;
      scanned += 1;
      // An <a> is only natively operable with an href; without one it is not a link at all.
      if (NATIVE.has(name) && (name !== "a" || /\bhref=/.test(tag))) continue;
      if (/onKeyDown|onKeyUp|onKeyPress/.test(tag)) continue;
      dead.push(`<${name}> (${path}:${text.slice(0, m.index).split("\n").length})`);
    }
  }

  it("finds elements to check", () => {
    expect(scanned).toBeGreaterThan(2);
  });

  it("gives every one a way in that is not the mouse", () => {
    expect(dead, "focusable, announced as a control, and activated by nothing but a click").toEqual([]);
  });
});
