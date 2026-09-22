/**
 * Every page opens the same way — docs/motion-spec.md §4, and its Phase 6
 * acceptance criterion: "no page contains a hard-coded duration or easing value".
 *
 * Fifteen pages each used to have a cascade of its own (80+70, 120+90, 440+90,
 * 520+60, 620, 40, 160+90, 120+180, 420+70, 560+50, 760, 800+50, 960+60,
 * 1000+50) and thirteen menus and dialogs had another thirteen. They all read
 * the beats in skin §74a now. These cases fail if a page starts keeping its own
 * time again, and if the pieces the beats depend on go missing.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Declaration, type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEAT, DUR, EASE, OPENING, STAGGER, cssEase, ms } from "../motion/tokens";
import { PILL_GROUPS } from "../motion/SegmentPill";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
/* The pill is painted in TWO sheets since 2026-09-22: the skin for every group inside the shell,
   and onboarding.css for the signup flow's trade tiles, which render OUTSIDE it — every §78
   selector begins `.app-shell.hs-shell.bf-shell`, so the skin cannot reach them. The invariant
   the case below protects is unchanged (nothing marked and unpainted, nothing painted for a group
   that is never marked); it just has two places to look now. */
const pillSheets = [sheet, postcss.parse(readFileSync(join(SRC, "onboarding/onboarding.css"), "utf8"))];
const pillDecls = (selector: string) => {
  const found: Record<string, string> = {};
  for (const one of pillSheets) {
    one.walkRules((rule: Rule) => {
      if (!selectorsOf(rule.selector).some((sel) => sel === selector || sel.endsWith(" " + selector))) return;
      rule.each((node) => {
        if (node.type !== "decl") return;
        if (inReduceBlock(node as Declaration)) return;
        found[node.prop] = norm((node as Declaration).value);
      });
    });
  }
  return found;
};
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

type Nested = { type: string; params?: string; parent?: Nested };

const inReduceBlock = (node: Declaration) => {
  let at = node.parent as Nested | undefined;
  while (at) {
    if (at.type === "atrule" && /reduced-motion/.test(at.params ?? "")) return true;
    at = at.parent;
  }
  return false;
};

/**
 * Every LIVE rule whose selector contains `fragment`, as `prop -> value`.
 * Reduce blocks are skipped: they null everything here by design, so including
 * them would hand back `animation: none` for every selector and quietly make
 * each assertion below unfalsifiable.
 */
const declsFor = (fragment: string) => {
  const found: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (!norm(rule.selector).includes(fragment)) return;
    rule.each((node) => {
      if (node.type !== "decl") return;
      if (inReduceBlock(node as Declaration)) return;
      found[node.prop] = norm((node as Declaration).value);
    });
  });
  return found;
};

const S = ".app-shell.hs-shell.bf-shell";

/**
 * One rule, by its EXACT selector (the shell prefix is added for you).
 *
 * `declsFor` matches any selector CONTAINING its fragment, which is right for
 * asking "what does the sheet say about this thing anywhere" and wrong for
 * asking "what does this one rule say": a fragment like `.settings-rail` also
 * sweeps up `.settings-rail[data-bfm-pill] > *` and `…::before`, and the merge
 * hands back the last one's values under the first one's name.
 */
/**
 * Split a selector list on its TOP-LEVEL commas only.
 *
 * `String.split(",")` tears `:is(.proj-rx, .crew-rx, …)` into pieces that match
 * nothing, so a lookup for a rule using `:is()` silently found no rule — and an
 * assertion comparing two of those is `undefined === undefined`, which passes
 * however the sheet behaves. A mutation that changed the thing under test and
 * left the run green is what showed it.
 */
const selectorsOf = (list: string) => {
  const out: string[] = [];
  let depth = 0;
  let at = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      out.push(norm(list.slice(at, i)));
      at = i + 1;
    }
  }
  out.push(norm(list.slice(at)));
  return out;
};

const declsOf = (selector: string) => {
  const want = norm(`${S} ${selector}`);
  expect(selectorsOf(want).length, `declsOf takes ONE selector, not a list: ${selector}`).toBe(1);
  const found: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (!selectorsOf(rule.selector).includes(want)) return;
    rule.each((node) => {
      if (node.type !== "decl") return;
      if (inReduceBlock(node as Declaration)) return;
      found[node.prop] = norm((node as Declaration).value);
    });
  });
  return found;
};

/** The page roots §4's three beats have to reach. */
const PAGE_ROOTS = [
  ".proj-rx",
  ".crew-rx",
  ".contacts-page",
  ".deals-page",
  ".equip-rx",
  ".delayIQ-rx",
  ".mat-rx",
  ".field-rx",
  ".reports-page",
  ".tc-page",
  ".bookmarks-page",
  ".map-ops-page",
  ".settings-rx",
  ".sched-rx",
  ".gantt-page"
];

describe("every page opens on the shared beats", () => {
  it("keeps no literal timing anywhere in the sheet's motion", () => {
    // Phase 6's acceptance criterion, as a test rather than a grep. A zero is the
    // ABSENCE of a timing, not a choice of one, and a reduce block is allowed to
    // spell its own floor out — everything else has to come from a token.
    const offenders: string[] = [];
    sheet.walkDecls((d) => {
      if (!/^(animation|transition)(-delay)?$/.test(d.prop)) return;
      if (inReduceBlock(d)) return;
      const withoutVars = d.value.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "");
      const literals = (withoutVars.match(/\b\d*\.?\d+m?s\b/g) ?? []).filter((v) => parseFloat(v) !== 0);
      if (literals.length) {
        offenders.push(`${d.source?.start?.line}: ${literals.join("/")} in ${d.prop} — ${norm((d.parent as Rule).selector).slice(-70)}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it("declares --bfm-shift for every page root, so no calc() is left invalid", () => {
    // The trap: every beat below subtracts --bfm-shift, and a calc() naming a
    // property that was never declared is INVALID — the delay is dropped and the
    // whole page lands in one frame, silently. A page root added without a shift
    // fails here rather than in front of someone.
    // BOTH states, per root. Checking only that "some rule mentions it" passes
    // when a root is dropped from one list and left in the other — which is the
    // half-wired case that actually happens.
    const plain = new Set<string>();
    const open = new Set<string>();
    sheet.walkRules((rule: Rule) => {
      const hasShift = (rule.nodes ?? []).some((n) => n.type === "decl" && (n as Declaration).prop === "--bfm-shift");
      if (!hasShift) return;
      const selector = norm(rule.selector);
      const into = selector.includes(".bfm-open") ? open : plain;
      for (const root of PAGE_ROOTS) if (selector.includes(root)) into.add(root);
    });
    expect(
      [...PAGE_ROOTS].filter((r) => !plain.has(r)),
      "no shift for these page roots"
    ).toEqual([]);
    expect(
      [...PAGE_ROOTS].filter((r) => !open.has(r)),
      "no first-open shift for these page roots"
    ).toEqual([]);
  });

  it("gives the shift both of its states, or the first open would be shifted twice", () => {
    let plain = 0;
    let open = 0;
    sheet.walkRules((rule: Rule) => {
      const shift = (rule.nodes ?? []).find((n) => n.type === "decl" && (n as Declaration).prop === "--bfm-shift") as
        Declaration | undefined;
      if (!shift) return;
      if (norm(rule.selector).includes(".bfm-open")) {
        open += 1;
        expect(shift.value.trim(), "nothing has been spent yet on the first open").toBe("0ms");
      } else {
        plain += 1;
        expect(shift.value.trim(), "later: the title's beat is already spent").toBe("var(--bfm-beat-title)");
      }
    });
    expect(plain, "a plain rule for the Dashboard and one for the rest").toBeGreaterThanOrEqual(2);
    expect(open, "and a bfm-open rule for each").toBe(plain);
  });

  it("puts the figures before the cards and the cards before their contents, on every page", () => {
    // the order §4 asks for, read off the sheet rather than assumed
    expect(BEAT.title).toBeLessThan(BEAT.kpi);
    expect(BEAT.kpi).toBeLessThanOrEqual(BEAT.kpiCols);
    expect(BEAT.kpiCols).toBeLessThan(BEAT.board);
    expect(BEAT.board).toBeLessThan(BEAT.boardContent);

    const kpi = declsFor(".hs-kpis > .hs-kpi")["animation-delay"];
    const card = declsFor(".hs-index-main > .hs-index-card")["animation-delay"];
    const table = declsFor(".hs-table tbody > tr")["animation-delay"];
    expect(kpi).toContain("var(--bfm-beat-kpi-cols)");
    expect(card).toContain("var(--bfm-beat-board)");
    expect(table).toContain("var(--bfm-beat-board-content)");
    // and each one clamps, so a shift can never start an animation half-played
    for (const [name, value] of Object.entries({ kpi, card, table })) {
      expect(value, `${name} clamps at zero`).toMatch(/^max\(0ms,/);
    }
  });

  it("fades a timecard's rows as a block, with no per-row stagger (§4)", () => {
    const rows = declsFor(".tc-table tbody");
    expect(rows["animation-delay"]).toContain("var(--bfm-beat-board-content)");
    expect(rows["animation-delay"], "a table of hours is not a cascade").not.toContain("--bfe-r");
  });

  it("keeps the Gantt's arrows and markers behind its bars, and all of it inside the budget", () => {
    const bar = declsFor(".gantt-feature-row .gantt-feature");
    expect(bar["animation-delay"]).toContain("var(--bfm-stagger-bar)");
    const links = declsFor(".gantt-page .gantt-links")["animation-delay"];
    const marker = declsFor(".gantt-page .gantt-marker")["animation-delay"];
    // both wait for the LAST bar to finish drawing, not merely to start
    for (const tail of [links, marker]) expect(tail).toContain("var(--bfm-dur-chart)");

    // and the whole thing still lands inside §3's budget on a FIRST open, when
    // nothing is subtracted — every extra band costs the settle twice, once in
    // the stagger and again in the wait for the draw
    const bands = 5;
    const lastBarLands = ms(BEAT.board) + bands * ms(STAGGER.bar) + ms(DUR.chart);
    const markerDone = lastBarLands + ms(STAGGER.card) + ms(DUR.base);
    expect(markerDone).toBeLessThanOrEqual(ms(OPENING) + 10);
  });

  it("does not animate a Gantt bar the pointer is holding", () => {
    // an animation's transform outranks the inline one a drag rewrites each frame
    expect(declsFor(".gantt-feature.is-dragging").animation).toBe("none");
  });

  it("lets the selected pill travel, and only once it has somewhere to travel from", () => {
    // skin §78. The pill is the group's ::before, moved by two custom properties
    // motion/SegmentPill.tsx writes on the group.
    const pill = declsFor(".hs-home-seg[data-bfm-pill]::before");
    expect(pill.transform).toBe("translate(var(--bfm-pill-x), var(--bfm-pill-y))");
    expect(pill.width).toBe("var(--bfm-pill-w)");
    expect(pill.background, "the pill IS the selected option's background").toBe("var(--bfm-pill-fill)");
    expect(declsFor(".hs-home-seg")["--bfm-pill-fill"], "which defaults to the ink every group but one uses").toBe("var(--bf-ink)");
    // the rail is a column of discs, and says so for itself
    expect(declsFor(".hs-rail-list")["--bfm-pill-fill"]).toBe("var(--bf-rail-fill)");
    expect(declsFor(".hs-rail-list")["--bfm-pill-radius"]).toBe("50%");
    expect(pill["pointer-events"], "it must never eat a click meant for an option").toBe("none");

    // BOTH edges animate: a pill that only slid would be the wrong width for a
    // wider option all the way across, which is the half of this the reference does.
    //
    // The two halves of this effect are in different files — the layer decides
    // WHICH groups get a pill, the sheet decides what one looks like — and either
    // half alone does nothing at all: a group the sheet has never heard of is
    // marked and never painted, and a selector the layer has never heard of is
    // painted for a group that is never marked. So the two lists are compared
    // against each other rather than each against a copy of itself.
    const groups = PILL_GROUPS.split(",").map((g) => g.trim());
    expect(groups.length, "every group in the layer is checked").toBeGreaterThan(9);

    const painted = new Set<string>();
    for (const one of pillSheets) {
      one.walkRules((rule: Rule) => {
        for (const sel of selectorsOf(rule.selector)) {
          if (!sel.endsWith("[data-bfm-pill]::before")) continue;
          painted.add(sel.slice(0, -"[data-bfm-pill]::before".length));
        }
      });
    }
    // every group the layer marks is painted (some are page-scoped in the sheet)
    for (const g of groups) {
      expect(
        [...painted].some((one) => one.endsWith(g)),
        `${g} is marked by the layer but painted by no rule`
      ).toBe(true);
      const box = pillDecls(g + "[data-bfm-pill]::before");
      // whatever it is made of, it is placed and sized by the four properties the layer writes
      expect(box.width, g).toBe("var(--bfm-pill-w)");
      expect(box.transform, g).toBe("translate(var(--bfm-pill-x), var(--bfm-pill-y))");
      expect(box["pointer-events"], g).toBe("none");
      // and it is either filled from the group's own token or drawn as a ring around the option
      expect(box.background === "var(--bfm-pill-fill)" || Boolean(box.border), `${g} is neither a fill nor a ring`).toBe(true);
      expect(pillDecls(g + '[data-bfm-pill="live"]::before').transition, g).toContain("transform var(--bfm-dur-pill)");
    }
    // and nothing is painted for a group the layer would never mark
    for (const one of painted) {
      expect(
        groups.some((g) => one.endsWith(g)),
        `${one} is painted but the layer never marks it`
      ).toBe(true);
    }

    const live = declsFor('.hs-home-seg[data-bfm-pill="live"]::before').transition;
    expect(live).toContain("transform var(--bfm-dur-pill) var(--bfm-ease-pill)");
    expect(live).toContain("width var(--bfm-dur-pill) var(--bfm-ease-pill)");

    // and the FIRST placement has nowhere to come from, so `placed` carries no
    // transition at all — otherwise the pill flies in from the group's left edge
    expect(declsFor(".hs-home-seg[data-bfm-pill]::before").transition).toBeUndefined();

    // the values were measured off the reference clip, not chosen
    expect(ms(DUR.pill)).toBe(470);
    expect(cssEase(EASE.pill)).toBe("cubic-bezier(0.3, 1, 0.6, 0.85)");
  });

  it("gives Settings' category rail the pill without taking away its stickiness", () => {
    // skin §81/§78. The rail is the one group the layer is NOT allowed to make
    // `position: relative`: it is sticky, which is what holds it beside a panel
    // taller than the window, and the layer only needs it POSITIONED.
    const rail = declsOf(".settings-rx .settings-rail");
    expect(rail["--bfm-pill-fill"]).toBe("var(--bf-ink)");
    expect(rail["--bfm-pill-radius"]).toBe("999px");
    expect(rail.position, "sticky is the page sheet's, and must not be overridden here").toBeUndefined();
    // and the group it is NOT in is the one that would have done exactly that
    const positioned = declsOf(".hs-rail-list");
    expect(positioned.position, "the other ten groups do take it").toBe("relative");

    // the pill IS the selected category's background, so the category gives it up
    expect(declsOf(".settings-rx .settings-rail[data-bfm-pill] .settings-nav-item.active").background).toBe("transparent");
    expect(declsOf(".settings-rx .settings-rail[data-bfm-pill] .settings-ai-button.active").background).toBe("transparent");
  });

  it("opens Settings on the shared beats, and never on its own numbers", () => {
    // skin §81. The rail rises as ONE block: the pill is its ::before, placed by
    // measured offsets, and an offset does not see a transform — so anything
    // translating BETWEEN the rail and a nav item would leave the pill behind.
    const rail = declsOf(".settings-rx .settings-rail");
    expect(rail.animation).toContain("bfe-lift var(--bfm-dur-slow)");
    expect(rail["animation-delay"]).toContain("var(--bfm-beat-rail)");
    for (const one of [".settings-account-card", ".settings-nav-group", ".settings-ai-button"]) {
      const inside = declsOf(`.settings-rx ${one}`);
      expect(inside.animation, `${one} may fade, never translate`).toContain("bfe-fade");
      expect(inside["animation-delay"], one).toContain("var(--bfm-beat-rail)");
    }
    // the pill's own arrival is opacity too: its transform is its POSITION
    expect(declsOf(".settings-rx .settings-rail[data-bfm-pill]::before").animation).toContain("bfe-fade");

    // the panel reads the beats, like every other page
    expect(declsOf(".settings-rx .settings-panel-inner > .settings-page-header")["animation-delay"]).toContain("var(--bfm-beat-title)");
    expect(declsOf(".settings-rx .sx-plan-card")["animation-delay"]).toContain("var(--bfm-beat-board-content)");
    // billing's hand-built switch travels on the same curve as every selection
    expect(declsFor(".settings-rx .sx-seg-ind").transition).toBe("transform var(--bfm-dur-pill) var(--bfm-ease-pill)");
  });

  it("gives everything Settings moves an answer under reduced motion", () => {
    // spec §9.4 — it ships with the motion, never bolted on. Collected from the
    // reduce blocks themselves, so a rule added to §81 and forgotten there fails.
    const quieted = new Set<string>();
    sheet.walkRules((rule: Rule) => {
      const at = rule.parent as { type: string; params?: string } | undefined;
      if (!at || at.type !== "atrule" || !/reduced-motion/.test(at.params ?? "")) return;
      for (const one of selectorsOf(rule.selector)) quieted.add(one);
    });
    for (const moving of [
      ".settings-rx .settings-rail",
      ".settings-rx .settings-account-card",
      ".settings-rx .settings-nav-group",
      ".settings-rx .settings-ai-button",
      ".settings-rx .settings-panel-inner > *",
      ".settings-rx .sx-plan-card",
      ".settings-rx .settings-rail[data-bfm-pill]::before",
      '.settings-rx .settings-panel-inner[data-bfm-goo="true"]',
      ".settings-rx .sx-seg-ind"
    ]) {
      expect(quieted.has(norm(`${S} ${moving}`)), `${moving} moves with nothing said about less motion`).toBe(true);
    }
  });

  it("drops Settings' rows down the page the way an index table's do", () => {
    // Asked for with a clip of the Companies page opening: "the animation should
    // look like a list dropping all the information". These are the numbers that
    // page uses, read off the rules that drive it — so this fails if either side
    // drifts, not just Settings.
    const table = declsOf(":is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table tbody > tr");
    expect(table.animation, "the index table's own cascade, read from the sheet").toBeTruthy();
    for (const list of [
      ".settings-rx .settings-section > .settings-row",
      ".settings-rx .settings-member-list > .settings-member-row",
      ".settings-rx .sx-addon-grid > *",
      ".settings-rx .wc-list > *"
    ]) {
      const rows = declsOf(list);
      expect(rows.animation, `${list}: the same lift the table's rows use`).toBe(table.animation);
      expect(rows["--bfe-y"], list).toBe(table["--bfe-y"]);
      expect(rows["--bfe-blur"], `${list}: inherited from the block, never repeated`).toBeUndefined();
      // the same beat and the same per-row stagger as the table...
      const delay = norm(rows["animation-delay"] ?? "");
      expect(delay, list).toContain("var(--bfm-beat-board-content)");
      expect(delay, list).toContain("var(--bfe-r, 0) * var(--bfm-stagger-icon)");
      expect(delay, list).toContain("var(--bfm-shift)");
      // ...plus the one thing the table has no use for: Settings stacks several
      // blocks down one panel, so a row also waits for the block holding it, and
      // the drop carries on down the page instead of restarting in each block
      expect(delay, `${list}: waits for its own block too`).toContain("var(--bfe-b, 0) * var(--bfm-stagger-card)");
    }

    // and the block above them is the index CARD's treatment, blur included —
    // the rows inherit that blur rather than declaring one of their own
    const block = declsOf(".settings-rx .settings-panel-inner > *:not(.settings-page-header)");
    expect(block["--bfe-blur"]).toBe("var(--bfm-blur)");
    expect(block["--bfe-y"]).toBe("var(--bfm-rise-l)");
    expect(block["animation-delay"]).toContain("var(--bfm-beat-board)");
    // its rank has a name of its own, because a row sets `--bfe-r` for itself and
    // would otherwise shadow the block's at the moment the row needs to read it
    expect(block["--bfe-b"]).toBe("0");
    expect(declsOf(".settings-rx .settings-panel-inner > *:nth-child(3)")["--bfe-b"]).toBe("1");

    // the ranks run to the same cap the table's do, and a section's rows start
    // at its SECOND child because the first is the section's own heading
    expect(declsOf(".settings-rx .settings-section > .settings-row:nth-child(3)")["--bfe-r"], "child 3 is the second row").toBe("1");
    expect(declsOf(".settings-rx .settings-section > .settings-row:nth-child(n + 11)")["--bfe-r"]).toBe("8");
    expect(declsOf(".settings-rx .settings-member-list > .settings-member-row:nth-child(2)")["--bfe-r"], "no heading inside this one").toBe(
      "1"
    );
  });

  it("brings Settings' panel out of the category that was picked", () => {
    // skin §81c, on §64's numbers: motion/PanelGoo.tsx measures the item pressed
    // and writes the first four; the radius is the same for every category.
    const goo = declsOf('.settings-rx .settings-panel-inner[data-bfm-goo="true"]');
    expect(goo.animation).toContain("bfe-goo var(--bf-dur-panel) var(--bf-ease-size)");
    // the measurement is top-left to top-left, so the scale must be about that corner
    expect(goo["transform-origin"]).toBe("top left");
    expect(goo["--bf-goo-r"], "the category it comes out of is a pill").toBe("999px");
    // and the contents are NOT suppressed while it morphs: the morph is over
    // (--bf-dur-panel) well before the first block's beat, so the panel arrives
    // and then fills rather than doing both at once
    expect(declsOf('.settings-rx .settings-panel-inner[data-bfm-goo="true"] > *').animation).toBeUndefined();
  });

  it("puts every menu and dialog on one pair, and never on a page's beats", () => {
    const overlay = "calc(var(--bfm-overlay) + var(--bfe-r, 0) * var(--bfm-stagger-icon))";
    const seen: string[] = [];
    for (const fragment of [
      ".bfnt-list > .bfnt-row",
      ".hs-bookmarks-menu > .hs-bookmark-row",
      ".user-settings-menu > *",
      ".cmdk-list > .cmdk-item",
      ".hs-upgrade-menu > *",
      ".pref-menu > *",
      ".bfsp .bfsp-grid > *"
    ]) {
      const delay = declsFor(fragment)["animation-delay"];
      expect(delay, fragment).toBe(overlay);
      seen.push(fragment);
    }
    expect(seen).toHaveLength(7);
  });
});
