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
import { readdirSync, readFileSync } from "node:fs";
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
  s = s.replace(/::[\w-]+/g, () => {
    c++;
    return " ";
  });
  s = s.replace(/\[[^\]]*\]/g, () => {
    b++;
    return " ";
  });
  s = s.replace(/:(?:not|is)\(([^)]*)\)/g, (_m, inner: string) => {
    const [ib, ic] = specificity(inner);
    b += ib;
    c += ic;
    return " ";
  });
  s = s.replace(/:where\([^)]*\)/g, () => " ");
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => {
    b++;
    return " ";
  });
  s = s.replace(/\.[\w-]+/g, () => {
    b++;
    return " ";
  });
  s = s.replace(/[>+~]/g, " ");
  s.split(/\s+/)
    .filter((x) => x && x !== "*")
    .forEach(() => c++);
  return [b, c];
}
const atLeast = (a: [number, number], x: [number, number]) => a[0] > x[0] || (a[0] === x[0] && a[1] >= x[1]);

const MOTION = /^(animation|transition|transform|translate|rotate|scale)(-|$)/;
const nullsMotion = (d: Declaration) => {
  const v = d.value
    .trim()
    .toLowerCase()
    .replace(/\s*!important$/, "");
  return MOTION.test(d.prop) && (v === "none" || v === "0s");
};

/** the --bf-* tokens design-tokens.css zeroes under reduce: an amplitude built from
 *  these moves nothing when the reader asks for less motion, so it needs no pairing */
const zeroedTokens = (() => {
  const set = new Set<string>();
  parse(TOKENS).walkAtRules("media", (m) => {
    if (!/prefers-reduced-motion/.test(m.params)) return;
    m.walkDecls((d) => {
      if (d.prop.startsWith("--bf-")) set.add(d.prop);
    });
  });
  return set;
})();

const movesNothing = (d: Declaration) => {
  if (!/^(transform|translate|rotate|scale)/.test(d.prop)) return false;
  const value = norm(d.value);
  if (value === "none") return true;
  const vars = [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  const literals = (value.replace(/var\([^)]*\)/g, "").match(/-?\d*\.?\d+(px|deg|rem|em|%)/g) ?? []).filter((l) => parseFloat(l) !== 0);
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
  it("lets the wheel out of every in-page region, so a section cannot stop the page", () => {
    /* Reported (2026-09-17): "when a user scrolls down through the pages they get stuck on
       a certain section". A scroll container with `overscroll-behavior: contain` swallows
       the wheel even when it has NOTHING to scroll, so a pointer resting on one stopped the
       page dead. Measured on the Dashboard before the fix: the page held at 500px with
       2614px still to go, because every panel body carried it. Four regions had it — the
       panel bodies (so every Dashboard and Schedule section), the rail's list, the Gantt
       chart and the sign-up preview column.

       Containment belongs to OVERLAYS, which must not let the page move behind them, and
       that behaviour is kept: with a dropdown open, a wheel over the list leaves the page
       exactly where it was. So vertical containment is allowed only on the surfaces listed
       here. `overscroll-behavior-x` is exempt: stopping a sideways swipe on a phone board
       does not touch the wheel. */
    /* `.gantt-drawer-body` joined them on 2026-09-17: the job drawer is a modal panel over the
       page (`aria-modal`, on a backdrop that closes it), and the page behind a modal must not
       move — measured after the change, five wheel ticks at the end of the drawer left the board
       behind exactly where it was. It is not an in-page region: nothing is ever scrolled THROUGH
       it to reach the rest of the page. */
    /* `.pdx-form` / `.pdx-body` joined them on 2026-09-18, when every dialog in the app became a
       right-side drawer (skin section 65). They are the scrolling body of a modal on a backdrop
       that closes it — the same case as `.gantt-drawer-body`, and the same reason: the page behind
       a modal must not move, and nothing is ever scrolled THROUGH a dialog to reach the page. */
    /* `.schedule-job-picker-content` joined on 2026-09-18, when the add-job form became a right
       panel on a backdrop that closes it (skin section 69) — the same case as the dialog bodies. */
    const OVERLAYS = [".bfsel-menu", ".bfsp-grid", ".gantt-drawer-body", ".pdx-form", ".pdx-body", ".schedule-job-picker-content"];
    const trapping: string[] = [];
    for (const sheet of loadOrder) {
      parse(sheet).walkDecls((decl: Declaration) => {
        if (!/^overscroll-behavior(-y)?$/.test(decl.prop)) return;
        if (!/contain|none/.test(decl.value)) return;
        const selector = (decl.parent as Rule).selector ?? "";
        if (OVERLAYS.some((overlay) => selector.includes(overlay))) return;
        trapping.push(`${sheet}: ${norm(selector).slice(-56)} { ${decl.prop}: ${decl.value} }`);
      });
    }
    expect(trapping, "only an overlay may keep the wheel to itself").toEqual([]);
  });

  it("writes every timing through a token, never a literal", () => {
    // Assertion 1 and 2 of the plan's density guard, merged: one curve and one set of
    // durations, so a fifth easing or an off-ladder 0.16s cannot re-enter quietly.
    // Two exemptions, both deliberate. A ZERO delay is the absence of a timing, not a
    // choice of one. And inside a reduce block the only literal allowed is 0.3s, the
    // clamp this repo already uses in ten existing blocks -- that number is the one
    // thing a reader of a reduce block needs to see spelled out, and hiding it behind a
    // token would make the floor harder to check, not easier.
    const allowed = (value: string, inReduceBlock: boolean) => parseFloat(value) === 0 || (inReduceBlock && /^0\.3s$/.test(value));
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

  it("writes every type size through a token, so a fifth scale cannot reappear", () => {
    // Step 12 found eight font-size literals here: a 16.5px wordmark, four 10.5px nav
    // badges, a 15px palette input, an 18px full-screen status line and a clamp on the
    // What's-new title. Eight is not yet a fifth scale, but it is how one starts, and
    // the type ladder is the half of this redesign that a reader feels on every screen.
    // All eight now resolve through a --bf-* token at their shipped values, except the
    // What's-new title which was consolidated onto --bf-app-title -- a declared 2px
    // change to its floor at narrow widths, taken because every other title in the
    // redesign already reads from that token.
    const literals: string[] = [];
    sheet.walkDecls((d) => {
      if (d.prop !== "font-size") return;
      if (/var\(--bf-/.test(d.value)) return;
      literals.push(
        `${d.source?.start?.line}: ${norm(d.parent && "selector" in d.parent ? (d.parent as Rule).selector : "?")} -> ${norm(d.value)}`
      );
    });
    expect(literals).toEqual([]);
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
          const props = new Set(r.nodes.filter((n): n is Declaration => n.type === "decl" && nullsMotion(n)).map((n) => n.prop));
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
      const setsTransform = rule.nodes.some((n): n is Declaration => n.type === "decl" && /^transform$/.test(n.prop));
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
    /* The loading skeleton draws the board in plain CSS, so its three numbers are a
       second copy of the engine's and the board would change shape on arrival if they
       drifted. They drifted: the gap moved from 16 to 30 on 2026-09-15 (the sections
       were asked to sit as far apart as the status band above them) and this test still
       demanded 16 for a day. So the numbers are READ from the engine now and every copy
       is checked against them, rather than being written out a third time here. */
    const grid = read("dashGrid.ts");
    const num = (name: string) => {
      const m = grid.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
      expect(m, `${name} is declared in dashGrid.ts`).not.toBeNull();
      return Number(m![1]);
    };
    const cols = num("DASH_COLS");
    const unit = num("DASH_ROW_UNIT");
    const gap = num("DASH_GAP");
    expect([cols, unit, gap]).toEqual([6, 40, 30]);
    /* Every sheet that draws the skeleton board must carry the same three. Rules inside an
       at-rule are skipped: the phone override deliberately stacks the skeleton into one
       column with auto rows, the way the stacked board itself does. */
    const copies: Array<[string, Record<string, string>]> = [];
    for (const file of ["hs-home.css", "dashboard-monday-panels.css"]) {
      postcss.parse(read(file)).walkRules((rule) => {
        if (rule.parent?.type === "atrule") return;
        if (!rule.selectors.some((one) => one.trim().endsWith(".dash-skel-board"))) return;
        const decls: Record<string, string> = {};
        rule.walkDecls((d) => {
          decls[d.prop] = d.value.trim();
        });
        copies.push([file, decls]);
      });
    }
    expect(copies.length, "the skeleton board is drawn somewhere").toBeGreaterThan(0);
    for (const [file, decls] of copies) {
      if (decls.gap) expect(decls.gap, `${file}: the skeleton's gap`).toBe(`${gap}px`);
      if (decls["grid-auto-rows"]) expect(decls["grid-auto-rows"], `${file}: the skeleton's row unit`).toBe(`${unit}px`);
      if (decls["grid-template-columns"]) {
        expect(decls["grid-template-columns"], `${file}: the skeleton's columns`).toBe(`repeat(${cols}, 1fr)`);
      }
    }
  });
});

describe("the card a DragOverlay carries", () => {
  /* `:is(a, b, c)` counts as its MOST specific argument, not the sum of them; the helper
     above adds them up, which over-counts a seven-trade `:is()` sevenfold. Reduce each
     one to its heaviest argument first and the numbers are the browser's. */
  it("takes the window scale out of every overlay in App.tsx", () => {
    /* dragZoom.ts was written and unit-tested while both of App.tsx's overlays still ran
       on dnd-kit's own numbers: a correct helper is not a corrected layer. dnd-kit
       measures in screen pixels and the overlay renders inside the shell's zoom, where
       every length is multiplied a second time, so an uncorrected ghost sat (1 - zoom) x
       its distance from the page's corner away from the hand and 1/zoom off size -- 84px
       by 22px on a Dashboard stat card at 0.9, measured 2026-09-17. Both the placement
       and the drop flight have to divide it back. */
    const app = read("App.tsx");
    const overlays = [...app.matchAll(/<DragOverlay[\s\S]*?>/g)].map((m) => norm(m[0]));
    expect(overlays.length, "App.tsx renders a DragOverlay").toBeGreaterThan(0);
    for (const tag of overlays) {
      expect(tag, "an overlay placed on dnd-kit's own screen pixels").toContain("style={unzoomOverlay(");
      const named = tag.match(/dropAnimation=\{(?:[^}]*?:\s*)?(\w+)\}/);
      expect(named, `an overlay with no named dropAnimation: ${tag.slice(0, 70)}`).not.toBeNull();
      expect(app, `${named![1]} flies dnd-kit's own distance`).toMatch(
        new RegExp(`${named![1]}\\s*=\\s*\\{[^}]*keyframes:\\s*unzoomDropFlight`)
      );
    }
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

  it("leaves recharts' own reduced-motion gate in place", () => {
    // recharts 3.8.1 defaults isAnimationActive to 'auto', which READS AND SUBSCRIBES to
    // prefers-reduced-motion (es6/animation/JavascriptAnimate.js:37). Passing an explicit
    // boolean replaces 'auto' and removes that gate, so the obvious
    // "useChartAnimation" helper would make reduced motion worse. The only licensed
    // explicit value is `false`, which is strictly less motion.
    /* Every file that imports recharts, found rather than listed. This was ["App.tsx",
       "TimeCard.tsx"] until the charts moved into charts/AppCharts.tsx to be loaded on demand,
       at which point the list silently stopped covering the file holding most of the charts. A
       derived list cannot drift out of date the same way. */
    const chartFiles = readdirSync(SRC, { recursive: true })
      .filter((rel) => /\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel))
      .filter((rel) => read(rel).includes('from "recharts"'));
    expect(chartFiles.length, "no file imports recharts — this scan has stopped reading").toBeGreaterThanOrEqual(2);
    for (const file of chartFiles) {
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

describe("Settings' buttons each answer for what they do (skin §82)", () => {
  /*
   * Asked for on 2026-09-20 with the segmented-control clip: "customize the effects
   * for the different buttons." What that clip argues is that a control's treatment is
   * chosen for the control — five segmented controls side by side, no two dressed the
   * same. Settings had the opposite: fourteen kinds of button, twelve of them rising
   * 2px with a bigger shadow, three on `transition: all`, five different durations, and
   * no `:active` rule anywhere in the sheet.
   *
   * These read the SOURCE, because jsdom applies no CSS and nothing else in the suite
   * can see a hover, a press, or a cascade.
   */
  const skin = postcss.parse(read("app-shell-client-desk.css"));

  /** Every declaration of `prop` on a rule whose selector matches, by pseudo-state. */
  const stateOf = (selector: string) => {
    if (/:active/.test(selector)) return "active";
    if (/:hover/.test(selector)) return "hover";
    if (/:focus/.test(selector)) return "focus";
    return "rest";
  };
  /** Whether a rule sits inside `@media (prefers-reduced-motion: reduce)`. */
  const inReduce = (rule: Rule) => {
    let at = rule.parent as { type: string; params?: string; parent?: unknown } | undefined;
    while (at) {
      if (at.type === "atrule" && /reduced-motion/.test(at.params ?? "")) return true;
      at = at.parent as typeof at;
    }
    return false;
  };

  const settingsRules: Array<{ selector: string; state: string; reduce: boolean; decls: Record<string, string> }> = [];
  skin.walkRules((rule: Rule) => {
    const selector = norm(rule.selector);
    if (!selector.includes(".settings-rx")) return;
    const decls: Record<string, string> = {};
    rule.walkDecls((d: Declaration) => {
      decls[d.prop] = norm(d.value);
    });
    settingsRules.push({ selector, state: stateOf(selector), reduce: inReduce(rule), decls });
  });

  /**
   * The `transform` `cls` ends up with in `state`, for someone who has NOT asked for
   * less motion. Skipping the reduce block is the point: it nulls every hover transform
   * in the page on purpose, and reading it as though it were the normal cascade reports
   * that every button does nothing — which is how this test first passed a lift as a
   * `none` and had to be corrected.
   */
  const transformFor = (target: string, state: string) => {
    /*
     * Anchored on the END of a selector, with the pseudo-classes taken out first:
     * `.settings-member-remove:hover` is the button, `.settings-member-remove:hover > svg`
     * is the glyph inside it, and a plain `includes` reads the second as the first —
     * which reported the destructive family's hover as `scale(1.12)` (the glyph growing)
     * instead of `none` (the button deliberately not rising).
     */
    const hits = settingsRules.filter(
      (r) =>
        !r.reduce &&
        r.state === state &&
        r.decls.transform &&
        r.selector.split(",").some((part) =>
          norm(part)
            .replace(/:[a-z-]+(\([^)]*\))?/g, "")
            .endsWith(target)
        )
    );
    return hits.length ? hits[hits.length - 1].decls.transform : undefined;
  };

  it("gives the six families six different gestures, not one lift for all of them", () => {
    // committing rises to meet the pointer, then takes the press
    expect(transformFor(".acct-primary", "hover")).toContain("translateY(-2px)");
    expect(transformFor(".acct-primary", "active")).toBe("translateY(0) scale(0.97)");

    // secondary sits INSIDE a row, so it must not lift out of one
    expect(transformFor(".settings-action-button", "hover")).toBe("none");
    expect(transformFor(".settings-action-button", "active")).toBe("scale(0.97)");

    // destructive never rises: that gesture is every other button saying "press me",
    // and the control that takes a teammate off the workspace should not say it
    expect(transformFor(".settings-member-remove", "hover")).toBe("none");
    expect(transformFor(".settings-member-remove", "active")).toBe("scale(0.92)");
    expect(transformFor(".wc-remove", "hover")).toBe("none");

    // dismiss turns rather than lifts — a gesture only this button makes
    expect(transformFor(".settings-close-button", "hover")).toBe("none");
    expect(transformFor(".settings-close-button > svg", "hover")).toBe("rotate(90deg)");
    expect(transformFor(".settings-close-button", "active")).toBe("scale(0.9)");

    // choosing presses INTO its track, the opposite of a lift
    expect(transformFor(".settings-nav-item", "active")).toBe("translateY(1px)");
    expect(transformFor(".sx-seg-opt", "active")).toBe("translateY(1px)");

    // and the four press depths are deliberately not all the same number
    const presses = [".acct-primary", ".settings-action-button", ".settings-member-remove", ".settings-close-button"].map((c) =>
      transformFor(c, "active")
    );
    expect(new Set(presses).size, "four families, four presses").toBe(4);
  });

  it("presses at all, which nothing in this sheet used to do", () => {
    // `--bf-dur-press` had been declared, and put in transition lists, for a state that
    // was never written: there was not one `:active` rule in the file.
    const pressed = settingsRules.filter((r) => !r.reduce && r.state === "active");
    expect(pressed.length, "Settings' buttons take the press").toBeGreaterThanOrEqual(8);
    for (const rule of pressed) {
      expect(rule.decls.transform ?? rule.decls.width, `${rule.selector} claims a press but does nothing`).toBeTruthy();
    }
  });

  it("names the properties it animates, and takes every duration from a token", () => {
    const mine = settingsRules.filter((r) => !r.reduce && r.decls.transition);
    expect(mine.length).toBeGreaterThanOrEqual(6);
    for (const rule of mine) {
      const value = rule.decls.transition;
      // `transition: all` animates whatever happens to change, layout included
      expect(value, `${rule.selector} is on transition: all`).not.toMatch(/(^|,)\s*all\b/);
      // every time in it is a var(), never a number
      const times = value.match(/(^|[\s,])\d*\.?\d+m?s\b/g) ?? [];
      expect(times, `${rule.selector} keeps its own time`).toEqual([]);
    }
  });

  it("travels the toggle's knob on the curve measured off the reference clip", () => {
    // the same pair 78's pill uses — the character of the thing in the video
    const knob = settingsRules.find((r) => !r.reduce && r.selector.endsWith(".settings-toggle > span") && r.decls.transition);
    expect(knob?.decls.transition).toContain("var(--bfm-dur-pill) var(--bfm-ease-pill)");
    const track = settingsRules.find((r) => !r.reduce && r.selector.endsWith(".settings-toggle") && r.decls.transition);
    expect(track?.decls.transition, "the track tints in step with the knob").toContain("var(--bfm-dur-pill)");
  });

  it("says what less motion means for the gestures it just added", () => {
    const quieted = new Set<string>();
    skin.walkRules((rule: Rule) => {
      const at = rule.parent as { type: string; params?: string } | undefined;
      if (!at || at.type !== "atrule" || !/reduced-motion/.test(at.params ?? "")) return;
      for (const one of norm(rule.selector).split(",")) quieted.add(norm(one));
    });
    for (const moving of [".settings-close-button > svg", ".settings-member-remove > svg", ".wc-remove > svg", ".settings-toggle > span"]) {
      expect(
        [...quieted].some((q) => q.endsWith(moving)),
        `${moving} moves with nothing said about less motion`
      ).toBe(true);
    }
  });
});
