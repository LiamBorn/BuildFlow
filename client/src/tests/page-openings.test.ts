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

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
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
    // wider option all the way across, which is the half of this the reference does
    // and every group that has one is on the same mechanism, not just the Dashboard's
    for (const g of [".hs-views", ".tc-tabs", ".gantt-seg", ".bfnt-tabs", ".bf-breeze-nav", ".route-goal-control", ".hs-rail-list"]) {
      expect(declsFor(g + "[data-bfm-pill]::before").background, g).toBe("var(--bfm-pill-fill)");
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

  it("puts every menu and dialog on one pair, and never on a page's beats", () => {
    const overlay = "calc(var(--bfm-overlay) + var(--bfe-r, 0) * var(--bfm-stagger-icon))";
    const seen: string[] = [];
    for (const fragment of [
      ".bfnt-list > .bfnt-row",
      ".hs-bookmarks-menu > .hs-bookmark-row",
      ".user-settings-menu > *",
      ".hs-create .hs-menu > .hs-menu-item",
      ".cmdk-list > .cmdk-item",
      ".hs-upgrade-menu > *",
      ".pref-menu > *",
      ".bfsp .bfsp-grid > *"
    ]) {
      const delay = declsFor(fragment)["animation-delay"];
      expect(delay, fragment).toBe(overlay);
      seen.push(fragment);
    }
    expect(seen).toHaveLength(8);
  });
});
