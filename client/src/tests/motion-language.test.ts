/**
 * The redesign's motion language, as a test.
 *
 * Why this file exists at all: jsdom applies NO CSS. `document.styleSheets.length` is 0
 * under vitest and a `.css` import resolves to nothing, so not one of the 384 tests can
 * see a cascade mistake. On top of that, test/setup.ts stubs `matchMedia` to
 * `matches: false` for every query, so every `prefers-reduced-motion` branch in the
 * product runs only its non-reduced half and is otherwise untested. Those two facts
 * together mean the entire reduced-motion contract is invisible to the suite.
 *
 * So these assertions read the SOURCE and resolve the cascade the way a browser would:
 * priority first (`!important`), then specificity, then source order in main.tsx's
 * import list. Every one of them was written because a real defect got through a review
 * that had only looked at the file in isolation:
 *
 *   - a rule of mine out-specified the reduced-motion block that was nulling it, so
 *     motion came back on for exactly the readers who asked it not to (twice);
 *   - a rest-state rule tied its own `.in` arrival rule and, loading later, won -- which
 *     would have left every revealed section on eight pages sitting 12px low forever;
 *   - a rule compared specificity while ignoring `!important` and passed a declaration
 *     that was already being beaten;
 *   - a selector matched zero elements, so a change reported as done had never rendered.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Declaration, type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SHEET = "app-shell-daylight.css";
const TOKENS = "design-tokens.css";

/**
 * Read from disk rather than through `import.meta.glob(..., '?raw')`. Vitest resolves a
 * CSS import to an EMPTY STRING -- the same fact that makes `document.styleSheets.length`
 * 0 in this suite -- so a raw glob over `*.css` silently yields "" for every stylesheet
 * and every assertion below would pass on nothing. Reading the bytes is the only way a
 * test in this project can see CSS at all.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map<string, string>();
const read = (rel: string) => {
  if (!cache.has(rel)) cache.set(rel, readFileSync(join(SRC, rel), "utf8"));
  return cache.get(rel)!;
};

/** The order main.tsx loads stylesheets in. Later wins a specificity tie. */
const loadOrder = [...read("main.tsx").matchAll(/import\s+"\.\/([\w./-]+\.css)"/g)].map((m) => m[1]);
const sheetIndex = loadOrder.indexOf(SHEET);

const parse = (rel: string) => postcss.parse(read(rel));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const isReduce = (node: { parent?: unknown } | undefined): boolean => {
  let p = node?.parent as { type?: string; params?: string; parent?: unknown } | undefined;
  while (p) {
    if (p.type === "atrule" && /prefers-reduced-motion/.test(p.params ?? "")) return true;
    p = p.parent as typeof p;
  }
  return false;
};
const inKeyframes = (node: { parent?: unknown } | undefined): boolean => {
  let p = node?.parent as { type?: string; name?: string; parent?: unknown } | undefined;
  while (p) {
    if (p.type === "atrule" && p.name === "keyframes") return true;
    p = p.parent as typeof p;
  }
  return false;
};

/** (classes+attrs+pseudo-classes, elements+pseudo-elements). No ids exist in these sheets. */
function specificity(selector: string): [number, number] {
  let b = 0;
  let c = 0;
  let s = selector;
  s = s.replace(/::[\w-]+/g, () => { c++; return " "; });
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return " "; });
  s = s.replace(/:(?:not|is)\(([^)]*)\)/g, (_m, inner: string) => {
    const [ib, ic] = specificity(inner);
    b += ib;
    c += ic;
    return " ";
  });
  s = s.replace(/:where\([^)]*\)/g, () => " ");
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return " "; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return " "; });
  s = s.replace(/[>+~]/g, " ");
  s.split(/\s+/).filter((x) => x && x !== "*").forEach(() => c++);
  return [b, c];
}
const atLeast = (a: [number, number], x: [number, number]) => a[0] > x[0] || (a[0] === x[0] && a[1] >= x[1]);

const MOTION = /^(animation|transition|transform|translate|rotate|scale)(-|$)/;
const nullsMotion = (d: Declaration) => {
  const v = d.value.trim().toLowerCase().replace(/\s*!important$/, "");
  return MOTION.test(d.prop) && (v === "none" || v === "0s");
};

/** the --bf-* tokens design-tokens.css zeroes under reduce: an amplitude built from
 *  these moves nothing when the reader asks for less motion, so it needs no pairing */
const zeroedTokens = (() => {
  const set = new Set<string>();
  parse(TOKENS).walkAtRules("media", (m) => {
    if (!/prefers-reduced-motion/.test(m.params)) return;
    m.walkDecls((d) => { if (d.prop.startsWith("--bf-")) set.add(d.prop); });
  });
  return set;
})();

const movesNothing = (d: Declaration) => {
  if (!/^(transform|translate|rotate|scale)/.test(d.prop)) return false;
  const value = norm(d.value);
  if (value === "none") return true;
  const vars = [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  const literals = (value.replace(/var\([^)]*\)/g, "").match(/-?\d*\.?\d+(px|deg|rem|em|%)/g) ?? [])
    .filter((l) => parseFloat(l) !== 0);
  return vars.length > 0 && vars.every((v) => zeroedTokens.has(v)) && literals.length === 0;
};

const sheet = parse(SHEET);

/** every rule in the sheet outside its own reduce blocks and outside @keyframes */
const liveRules: Rule[] = [];
sheet.walkRules((r) => {
  if (inKeyframes(r) || isReduce(r)) return;
  liveRules.push(r);
});

/** what the sheet's own reduce blocks cover */
const selfPaired = (() => {
  const map = new Map<string, Set<string>>();
  sheet.walkRules((r) => {
    if (!isReduce(r)) return;
    const props = r.nodes.filter((n): n is Declaration => n.type === "decl").map((n) => n.prop);
    r.selectors.forEach((s) => {
      const key = norm(s);
      if (!map.has(key)) map.set(key, new Set());
      props.forEach((p) => map.get(key)!.add(p));
    });
  });
  return map;
})();

describe("app-shell-daylight.css keeps the redesign's motion contract", () => {
  it("writes every timing through a token, never a literal", () => {
    // Assertion 1 and 2 of the plan's density guard, merged: one curve and one set of
    // durations, so a fifth easing or an off-ladder 0.16s cannot re-enter quietly.
    // Two exemptions, both deliberate. A ZERO delay is the absence of a timing, not a
    // choice of one. And inside a reduce block the only literal allowed is 0.3s, the
    // clamp this repo already uses in ten existing blocks -- that number is the one
    // thing a reader of a reduce block needs to see spelled out, and hiding it behind a
    // token would make the floor harder to check, not easier.
    const allowed = (value: string, inReduceBlock: boolean) =>
      parseFloat(value) === 0 || (inReduceBlock && /^0\.3s$/.test(value));
    const offenders: string[] = [];
    sheet.walkDecls((d) => {
      if (inKeyframes(d)) return;
      if (!/^(animation|transition)(-|$)/.test(d.prop)) return;
      const value = d.value.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "");
      if (/cubic-bezier\(/.test(value)) offenders.push(`${d.source?.start?.line}: literal curve in ${d.prop}`);
      const durations = (value.match(/\b\d*\.?\d+m?s\b/g) ?? []).filter((v) => !allowed(v, isReduce(d)));
      if (durations.length) offenders.push(`${d.source?.start?.line}: literal ${durations.join("/")} in ${d.prop}`);
    });
    expect(offenders).toEqual([]);
  });

  it("uses no :where() and no !important in live CSS", () => {
    // :where() is a documented jsdom breaker in this repo -- a :where(#id) block once
    // made every test read visibility:hidden on <html>. !important outside a reduce
    // block means a selector is wrong, not that the cascade needs forcing.
    const live: string[] = [];
    sheet.walkRules((r) => {
      if (r.selector.includes(":where(")) live.push(`${r.source?.start?.line}: :where() in ${norm(r.selector)}`);
    });
    sheet.walkDecls((d) => {
      if (d.important && !isReduce(d)) live.push(`${d.source?.start?.line}: !important on ${d.prop}`);
    });
    expect(live).toEqual([]);
  });

  it("declares only the bf- keyframes it is allowed to own", () => {
    // A keyframe name is document-global, so re-declaring a shipped name here would win
    // for everyone AND keep winning after someone deleted the word bf-shell from
    // shellClassName -- which would break the one-word kill switch this file is built
    // on. New motion therefore gets a new bf- name and a scoped rule pointing at it.
    const declared: string[] = [];
    sheet.walkAtRules("keyframes", (k) => {
      declared.push(k.params.trim());
    });
    expect(declared.every((n) => n.startsWith("bf-"))).toBe(true);
    expect([...declared].sort()).toEqual([
      "bf-fade",
      "bf-land-card",
      "bf-land-ring",
      "bf-live-flash",
      "bf-pop",
      "bf-shell-in",
      "bf-skel-sheen"
    ]);
  });

  it("pairs every rule that moves with its own reduced-motion rule (RULE R)", () => {
    // The hazard is PREFIXING, not renaming. app-shell-hubspot.css's four reduce blocks
    // null by SELECTOR at 2-3 classes; the recipe here produces 3-4, so an animation
    // rule written without a pairing out-specifies the block that was nulling it.
    // A transition that lists `transform` only matters if some STATE of that element
    // sets a moving transform, so the check is element-aware rather than per-declaration.
    const transformsByElement = new Map<string, boolean[]>();
    const elementKey = (s: string) =>
      norm(s)
        .replace(/::?[a-z-]+(\([^)]*\))?/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\.(?:is|has)-[a-z-]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    for (const rule of liveRules) {
      rule.nodes
        .filter((n): n is Declaration => n.type === "decl" && /^(transform|translate|rotate|scale)(-|$)/.test(n.prop))
        .forEach((d) => {
          rule.selectors.forEach((s) => {
            const key = elementKey(s);
            if (!transformsByElement.has(key)) transformsByElement.set(key, []);
            transformsByElement.get(key)!.push(movesNothing(d));
          });
        });
    }

    const unpaired: string[] = [];
    for (const rule of liveRules) {
      for (const d of rule.nodes.filter((n): n is Declaration => n.type === "decl")) {
        let mustPair = false;
        if (/^animation(-|$)/.test(d.prop)) {
          mustPair = !/^none\b/.test(norm(d.value));
        } else if (/^(transform|translate|rotate|scale)(-|$)/.test(d.prop)) {
          mustPair = !movesNothing(d);
        } else if (/^transition(-|$)/.test(d.prop) && /\b(transform|translate|rotate|scale)\b/.test(d.value)) {
          const states = rule.selectors.flatMap((s) => transformsByElement.get(elementKey(s)) ?? []);
          mustPair = states.some((free) => !free);
        }
        if (!mustPair) continue;
        for (const sel of rule.selectors.map(norm)) {
          const paired = selfPaired.get(sel);
          const covered = paired && (paired.has(d.prop) || (/^animation/.test(d.prop) && paired.has("animation")));
          if (!covered) unpaired.push(`${d.source?.start?.line}: ${sel} { ${d.prop} } has no reduce pairing`);
        }
      }
    }
    expect(unpaired).toEqual([]);
  });

  it("never re-enables motion an earlier sheet's reduce block had nulled (BUG 10)", () => {
    // The check the plan calls its highest-value assertion, and the one that found two
    // live defects in this file: .hs-rail-btn and .hs-flyout-star.
    const inherited: Array<{ file: string; sel: string; props: Set<string> }> = [];
    for (const rel of loadOrder.slice(0, sheetIndex)) {
      let root;
      try {
        root = parse(rel);
      } catch {
        continue;
      }
      root.walkAtRules("media", (m) => {
        if (!/prefers-reduced-motion/.test(m.params)) return;
        m.walkRules((r) => {
          const props = new Set(
            r.nodes.filter((n): n is Declaration => n.type === "decl" && nullsMotion(n)).map((n) => n.prop)
          );
          if (props.size) r.selectors.forEach((s) => inherited.push({ file: rel, sel: norm(s), props }));
        });
      });
    }
    expect(inherited.length).toBeGreaterThan(100); // the scan found something to compare against

    const chain = (s: string) => s.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
    const covers = (mine: string[], theirs: string[]) => {
      let i = 0;
      for (const part of mine) if (i < theirs.length && part.includes(theirs[i])) i++;
      return i === theirs.length;
    };

    const reEnabled: string[] = [];
    for (const rule of liveRules) {
      const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl" && MOTION.test(n.prop));
      if (!decls.length) continue;
      for (const sel of rule.selectors.map(norm)) {
        for (const inh of inherited) {
          if (!covers(chain(sel), chain(inh.sel))) continue;
          // a declaration of mine that is itself a null says the same thing, so it
          // re-enables nothing even though it wins
          const clash = decls.filter((d) => inh.props.has(d.prop) && !movesNothing(d) && !nullsMotion(d));
          if (!clash.length) continue;
          const paired = selfPaired.get(sel);
          const covered = paired && clash.every((d) => paired.has(d.prop));
          if (!covered) {
            reEnabled.push(`${rule.source?.start?.line}: ${sel} defeats ${inh.file}'s reduce null on ${[...inh.props].join()}`);
          }
        }
      }
    }
    expect(reEnabled).toEqual([]);
  });

  it("gives every reveal rest-state override a matching arrival override", () => {
    // The defect this was written for: prefixing `.dash-rx.dx-ready [data-reveal]` with
    // .bf-shell lifts it from (0,3,0) to (0,4,0), which TIES the arrival rule
    // `.dash-rx.dx-ready [data-reveal].in` -- and a tie goes to whichever loads later,
    // which is this file. The rest state then wins in the revealed state, and every
    // section on eight pages settles 12px low with a transition that never resolves.
    // Neither file looks wrong on its own, and jsdom cannot see it.
    const rest: Array<{ sel: string; spec: [number, number] }> = [];
    const arrived = new Map<string, [number, number]>();
    for (const rule of liveRules) {
      const setsTransform = rule.nodes.some(
        (n): n is Declaration => n.type === "decl" && /^transform$/.test(n.prop)
      );
      if (!setsTransform) continue;
      for (const sel of rule.selectors.map(norm)) {
        if (!/\[data-reveal(-stagger)?\]/.test(sel)) continue;
        if (/\.in\b/.test(sel)) arrived.set(sel, specificity(sel));
        else rest.push({ sel, spec: specificity(sel) });
      }
    }
    expect(rest.length).toBeGreaterThan(0);
    const missing = rest.filter(({ sel, spec }) => {
      // the arrival twin is the same selector with .in on the attribute
      const twin = sel.replace(/\[data-reveal(-stagger)?\]/, (m) => `${m}.in`);
      const twinSpec = arrived.get(twin);
      return !twinSpec || !atLeast(twinSpec, spec);
    });
    expect(missing.map((m) => m.sel)).toEqual([]);
  });
});

describe("the motion numbers that live in two places at once", () => {
  it("keeps the deal board's land ring behind its own flight", () => {
    // hs-deal-land used a hardcoded animation-delay of 0.32s against a 340ms flight, so
    // the ring began 20ms BEFORE the card arrived and on a slow frame drew beside it
    // rather than around it. The delay now reads --bf-dur-drop-lane; this asserts the
    // token and the JS constant still agree.
    const app = read("App.tsx");
    const dealDrop = app.match(/DEAL_DROP_ANIMATION\s*=\s*\{\s*duration:\s*(\d+)/);
    expect(dealDrop, "DEAL_DROP_ANIMATION is declared in App.tsx").not.toBeNull();
    const token = read(TOKENS).match(/--bf-dur-drop-lane:\s*([\d.]+)s/);
    expect(token, "--bf-dur-drop-lane is declared").not.toBeNull();
    expect(Math.round(parseFloat(token![1]) * 1000)).toBe(Number(dealDrop![1]));
    expect(read(SHEET)).toMatch(/animation-delay:\s*var\(--bf-dur-drop-lane\)/);
  });

  it("keeps the panel board's drag and drop durations on their tokens", () => {
    const app = read("App.tsx");
    const tokens = read(TOKENS);
    for (const [constant, token] of [
      ["DASH_SORT_TRANSITION", "--bf-dur-drag"],
      ["DASH_DROP_ANIMATION", "--bf-dur-drop"]
    ] as const) {
      const js = app.match(new RegExp(`${constant}\\s*=\\s*\\{\\s*duration:\\s*(\\d+)`));
      expect(js, `${constant} is declared in App.tsx`).not.toBeNull();
      const css = tokens.match(new RegExp(`${token}:\\s*([\\d.]+)s`));
      expect(css, `${token} is declared`).not.toBeNull();
      expect(Math.round(parseFloat(css![1]) * 1000)).toBe(Number(js![1]));
    }
  });

  it("keeps the board geometry the skeleton is drawn from frozen", () => {
    const grid = read("dashGrid.ts");
    expect(grid).toMatch(/DASH_COLS\s*=\s*6\b/);
    expect(grid).toMatch(/DASH_ROW_UNIT\s*=\s*40\b/);
    expect(grid).toMatch(/DASH_GAP\s*=\s*16\b/);
    // the skeleton re-declares the row unit independently, so the two must agree
    expect(read("hs-home.css")).toMatch(/grid-auto-rows:\s*40px/);
  });
});

describe("the reduced-motion branches the suite cannot execute", () => {
  it("guards both of useHudMotion's effects and watches for late arrivals", () => {
    const hook = read("useHudMotion.ts");
    // the documented reveal contract, shared with the Welcome Page
    expect(hook).toMatch(/threshold:\s*0\.16/);
    expect(hook).toContain("0px 0px -6% 0px");
    // BUG 2: the pointer loop used to publish --mx/--my with no media read at all,
    // while the reveal effect in the same hook had one. Both must have it now.
    expect(hook.match(/prefersReducedMotion\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // BUG 11: a [data-reveal] block that mounts after its own fetch missed the first
    // query and stayed at opacity 0 for the life of the page on ten roots
    expect(hook).toContain("MutationObserver");
    expect(hook).toMatch(/mutations\.observe\(root,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}\)/);
  });

  it("stops the one infinite animation that no stylesheet can reach", () => {
    // BUG 7: TextShimmer puts its animation shorthand in the INLINE style object, so no
    // @media rule can override it without !important. It is live on the assistant's
    // generating line, so the guard has to be in JavaScript.
    const shimmer = read("components/ui/text-shimmer.tsx");
    expect(shimmer).toContain("prefers-reduced-motion");
    expect(shimmer).toMatch(/reduceMotion\s*\?/);
  });

  it("gates the map's framer choreography, which framer does not gate itself", () => {
    // BUG 6: about twenty springs, pathLength draws and staggered fades, against a
    // stylesheet whose only reduce block killed one transition.
    const map = read("components/ui/expand-map.tsx");
    expect(map).toContain("useReducedMotion");
    const transitions = map.match(/transition=\{/g)?.length ?? 0;
    const gated = map.match(/transition=\{reduceMotion \? zero :/g)?.length ?? 0;
    expect(gated).toBe(transitions);
  });

  it("leaves recharts' own reduced-motion gate in place", () => {
    // recharts 3.8.1 defaults isAnimationActive to 'auto', which READS AND SUBSCRIBES to
    // prefers-reduced-motion (es6/animation/JavascriptAnimate.js:37). Passing an explicit
    // boolean replaces 'auto' and removes that gate, so the obvious
    // "useChartAnimation" helper would make reduced motion worse. The only licensed
    // explicit value is `false`, which is strictly less motion.
    for (const file of ["App.tsx", "TimeCard.tsx"]) {
      expect(read(file), `${file} must not force recharts animation on`).not.toMatch(/isAnimationActive=\{true\}/);
    }
    // and every TimeCard chart element has its duration pinned rather than inheriting a
    // library default of 1500ms for a Line, an Area or a Pie
    const timecard = read("TimeCard.tsx");
    const elements = timecard.match(/<(Bar|Line|Area|Pie)\b[^>]*>/g) ?? [];
    expect(elements.length).toBeGreaterThanOrEqual(9);
    const unpinned = elements.filter((e) => !/animationDuration=|isAnimationActive=/.test(e));
    expect(unpinned).toEqual([]);
  });
});
