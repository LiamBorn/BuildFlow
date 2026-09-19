/**
 * The product on the Client Desk language (2026-09-15) — app-shell-client-desk.css. jsdom applies
 * no CSS, so these read the sheet and the wiring: the tokens every page paints from, the accent
 * that carries ink, the rail and the top row as the reference draws them, the sheet loading last,
 * and the faces the head links.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Rule } from "postcss";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
/**
 * A selector list's members — split on the commas between them, not on the ones inside `:is()`.
 *
 * Each member comes back with its whitespace collapsed to single spaces. A formatter is free to
 * wrap a long selector over several indented lines, and postcss hands back exactly what is in the
 * file: without this, reformatting the sheet makes every reader below silently find nothing and a
 * guard that was checking real declarations starts passing on `undefined`. Collapsing is safe —
 * in a selector a run of whitespace means what one space means.
 */
const splitSelectors = (list: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts.map((part) => part.replace(/\s+/g, " ").trim());
};

const declsOf = (selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (rule.parent?.type === "atrule") return;
    if (splitSelectors(rule.selector).includes(selector))
      rule.walkDecls((decl) => {
        out[decl.prop] = decl.value;
      });
  });
  return out;
};

describe("the Client Desk skin", () => {
  it("re-points the shell's tokens to the reference's palette, ladders and curve", () => {
    const shell = declsOf(".bf-shell");
    expect(shell["--bf-ground"]).toBe("var(--cd-panel)");
    expect(shell["--cd-panel"]).toBe("#f4f4f4");
    expect(shell["--bf-ink"]).toBe("#1c1c1c");
    expect(shell["--bf-line-solid"]).toBe("#e4e4e4");
    expect(shell["--bf-radius-card"]).toBe("20px");
    expect(shell["--bf-radius-stage"]).toBe("28px");
    expect(shell["--bf-shadow-card"]).toBe("var(--cd-sh-1)");
    expect(shell["--cd-sh-1"]).toBe("0 1px 2px rgba(23, 21, 15, 0.05)");
    // 2026-09-19: the settling curve and the durations are motion/tokens.ts now
    // (docs/motion-spec.md §9.1). The --bf- names stay because six hundred
    // declarations in this sheet read them, and they resolve to the same values.
    expect(shell["--bf-ease"]).toBe("var(--bfm-ease-bar)");
    expect(declsOf(".bf-shell")["--bfm-ease-bar"]).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(shell["--bf-page-display-weight"]).toBe("600");
    // surfaces are set on the shell only, so dark mode and the themes still repaint them
    expect(sheet.toString()).not.toMatch(/\.(dash|sched|crew|proj)-rx[^{]*\{[^}]*--bf-(surface|ground):/);
  });

  /* One kind of figure, one kind of tile. The Schedule's four KPIs sit on the page the way the
     index pages' do (Materials' "Total Materials / Ready Now / Ordered / Needs Attention"), and
     they used to be the inverse of them: a grey tile with the glyph disc lifted off it, against a
     white tile with the disc recessed into it. Asked for on 2026-09-17 with the two side by side. */
  it("gives the Schedule's own KPI tiles the card the index pages' wear", () => {
    const indexTile = declsOf(".app-shell.hs-shell.bf-shell .hs-index .hs-kpi");
    const scheduleTile = declsOf(".app-shell.hs-shell.bf-shell .sched-rx > .kpi-grid.schedule-kpis .kpi-card");
    expect(indexTile.background).toBe("var(--bf-surface)");
    expect(scheduleTile.background).toBe(indexTile.background);
    expect(scheduleTile["box-shadow"]).toBe(indexTile["box-shadow"]);
    expect(scheduleTile["border-radius"]).toBe(indexTile["border-radius"]);
    /* The disc's colour is section 59's business — the tone's wash, for all four KPI families —
       so this takes away the shadow and nothing else. A background here would out-specify the
       tone and turn every disc on the Schedule neutral. */
    const scheduleDisc = declsOf(".app-shell.hs-shell.bf-shell .sched-rx > .kpi-grid.schedule-kpis .kpi-icon");
    expect(scheduleDisc["box-shadow"]).toBe("none");
    expect(scheduleDisc.background).toBeUndefined();
    /* And only where they stand on the page: on the Schedule landing the same four are the body of
       a board section, and a white tile on a white card has no edge. */
    expect(scheduleTile.background).not.toBe(declsOf(".app-shell.hs-shell.bf-shell .kpi-card").background);
  });

  /* The card a Schedule board carries is a clone of the one picked up, on one layer shared by all
     five boards (schedule/parts/carry.tsx). The skin dresses the CLONE rather than any board's own
     card, so a Week tile, a queued strip, a Kanban card, a List row and a Month chip all lift the
     same way — and `> *` is the whole trick, which check-css's matcher cannot model. */
  it("lifts whatever card a Schedule board is carrying, and dashes the slot it left", () => {
    const S = ".app-shell.hs-shell.bf-shell .sched-rx";
    const cards = [".sched-act", ".schedule-job", ".unassigned-card", ".sched-kan-card"];
    for (const card of [...cards, ".schedule-list-view button"]) {
      const slot = declsOf(`${S} ${card}.dragging`);
      expect(slot.outline, card).toBe("2px dashed var(--bf-line-solid)");
      expect(slot.background, card).toBe("var(--bf-hover)");
      expect(slot["box-shadow"], card).toBe("none");
    }
    // the clone keeps its own colour — only the lift is set for it
    for (const card of cards) {
      const carried = declsOf(`${S} .sched-carry > ${card}`);
      expect(carried["box-shadow"], card).toContain("var(--bf-shadow-float)");
      expect(carried.background, card).toBeUndefined();
    }
    // except a List row, which has no colour of its own to keep
    const carriedRow = declsOf(`${S} .sched-carry.schedule-list-view > button`);
    expect(carriedRow["box-shadow"]).toContain("var(--bf-shadow-float)");
    expect(carriedRow.background).toBe("var(--bf-surface)");
    /* And all of it sits AFTER every board's own card rules: a status wash is six classes, so
       source order is what settles the tie. The Week card is the one that proves it. */
    const sheetText = sheet.toString();
    expect(sheetText.indexOf(`${S} .sched-carry > .schedule-job`)).toBeGreaterThan(sheetText.indexOf(`${S} .schedule-job.confirmed`));
  });

  it("routes the accent through the Colors hint tokens, and keeps the focus ring visible", () => {
    const theme = declsOf(".bf-shell:not([data-bf-theme])");
    expect(theme["--bf-accent-fill"]).toBe("var(--bf-color-accent-fill)");
    expect(theme["--bf-on-accent"]).toBe("var(--bf-color-on-accent)");
    // the identity is also text on white in the index pages: the dark rung, never the lime
    expect(theme["--bf-accent"]).toBe("var(--bf-color-accent)");
    expect(theme["--bf-accent-dark"]).toBe("var(--bf-color-accent)");
    expect(theme["--bf-rail-fill"]).toBe("#1c1c1c");
    expect(theme["--bf-focus-ink"]).toBe("#1c1c1c");
  });

  it("draws the rail as a narrow floating pill and the top row as white pill controls", () => {
    const rail = declsOf(".hs-shell.bf-shell .sidebar.hs-rail");
    expect(rail.width).toBe("52px");
    expect(rail["border-radius"]).toBe("999px");
    expect(rail.background).toBe("var(--bf-surface)");
    const active = declsOf(".hs-shell.bf-shell .hs-rail-btn.active");
    expect(active.background).toBe("var(--bf-rail-fill)");
    const bar = declsOf(".hs-shell.bf-shell .topbar.hs-topbar");
    expect(bar.background).toBe("var(--bf-ground)"); // sticky: the page scrolls under it
    const icon = declsOf(".hs-shell.bf-shell .topbar.hs-topbar .topbar-actions .icon-button");
    expect(icon.width).toBe("40px");
    expect(icon["border-radius"]).toBe("50%");
    const upgrade = declsOf(".hs-shell.bf-shell .topbar.hs-topbar .hs-upgrade-btn");
    expect(upgrade["border-radius"]).toBe("999px");
    expect(upgrade.background).toBe("var(--bf-ink)");
    /* The top row's brand is the WORD ALONE — the logo mark was taken out on request
       (2026-09-16). The button keeps its 4px left padding, which is what sits the word on
       the same line as the rail's icons below it (both measured at 23.4px). */
    const brand = readFileSync(join(SRC, "App.tsx"), "utf8").split('className="hs-topbar-brand"')[1].split("</button>")[0];
    expect(brand).toContain("<span>BuildFlow</span>");
    expect(brand).not.toContain("BuildFlowLogoMark");
    /* Being the whole identity up there, the word was then asked to be bigger: 22px, set
       through the token design-tokens.css keeps for this one line of text. */
    expect(declsOf(".app-shell.hs-shell.bf-shell")["--bf-app-brand"]).toBe("22px");
    /* And it has to SHOW at the widths the older sheet hid it at (it dropped the word
       below 1040px, where the square mark used to carry the brand — with the mark gone
       that left the top left empty). Measured: the row fits it down to 470px, so the
       reveal stops at 461px rather than pushing the row's controls off the bar. */
    const revealed = sheet.toString().split("@media (min-width: 461px) and (max-width: 1040px)").slice(1).join("\n");
    expect(revealed).toMatch(/\.hs-topbar-brand > span \{[^}]*display: inline;/);
    // the reference's 34px/40px frame was taken out on request: the shell fills the window
    const frame = declsOf(".app-shell.hs-shell.bf-shell");
    expect(frame.margin).toBe("0");
    expect(frame["min-height"]).toBe("100vh");
    expect(frame["border-radius"]).toBe("0");
  });

  it("draws every widget as the reference's card, every button on its grammar, every icon at one weight", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // widgets: white, no border, the card radius, the softest shadow; a 15px display title
    const panel = declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block`);
    expect(panel.border).toBe("0");
    expect(panel["border-radius"]).toBe("var(--bf-radius-card)");
    expect(panel["box-shadow"]).toBe("var(--bf-shadow-card)");
    expect(panel.padding).toBe("18px 20px");
    const head = declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block > .hs-widget-head h2`);
    expect(head["font-size"]).toBe("15px");
    expect(head["font-family"]).toBe("var(--bf-font-display)");
    const indexCard = declsOf(`${S} .hs-index .hs-index-card`);
    expect(indexCard.border).toBe("0");
    expect(indexCard["box-shadow"]).toBe("var(--bf-shadow-card)");
    // a tile inside a card sits on the second surface with no shadow; its figure is the big number
    const tile = declsOf(`${S} .kpi-card`);
    expect(tile.background).toBe("var(--bf-hover)");
    expect(tile["box-shadow"]).toBe("none");
    expect(declsOf(`${S} .kpi-card strong`)["font-size"]).toBe("28px");
    // buttons: the white pill, the ink primary, the 30px tiny pill, the ink active tab
    const pill = declsOf(`${S} .hs-btn`);
    expect(pill.height).toBe("40px");
    expect(pill["border-radius"]).toBe("999px");
    expect(pill.background).toBe("var(--bf-surface)");
    const primary = declsOf(`${S} .hs-btn.hs-btn-primary`);
    expect(primary.background).toBe("var(--bf-ink)");
    expect(primary["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .hs-index .hs-page-btn`).height).toBe("30px");
    expect(declsOf(`${S} .hs-index .hs-view.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .hs-index .hs-views`)["border-radius"]).toBe("999px");
    // icons: one stroke weight, sized to the control
    expect(declsOf(`${S} svg.lucide`)["stroke-width"]).toBe("1.8");
    expect(declsOf(`${S} .hs-rail-btn svg`).width).toBe("17px");
    expect(declsOf(`${S} .kpi-icon svg`).width).toBe("18px");
  });

  it("lays every widget's contents out the reference's way, in its colours", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the semantic set on the default theme's scopes
    const tones = declsOf(".bf-shell:not([data-bf-theme]) .dash-rx");
    expect(tones["--cc-green"]).toBe("var(--bf-color-ok)");
    expect(tones["--cc-green-soft"]).toBe("var(--bf-color-ok-wash)");
    expect(tones["--cc-amber"]).toBe("var(--bf-color-warn)");
    expect(tones["--cc-red"]).toBe("var(--bf-color-bad)");
    expect(tones["--cc-violet"]).toBe("var(--bf-color-info)");
    // a figure: label, big number, its glyph as the 30px tool
    expect(declsOf(`${S} .dash-rx .cc-stat-value`)["font-size"]).toBe("32px");
    expect(declsOf(`${S} .dash-rx .cc-stat-label`)["font-size"]).toBe("11.5px");
    expect(declsOf(`${S} .dash-rx .cc-stat-ico`).width).toBe("30px");
    expect(declsOf(`${S} .dash-rx .cc-stat-top`)["flex-direction"]).toBe("row-reverse");
    expect(declsOf(`${S} .af-frac`).color).toBe("var(--bf-ink-faint)");
    // a row: a chip on the second surface; a status: the small pill
    const row = declsOf(`${S} .dash-rx .cc-alert`);
    expect(row.background).toBe("var(--bf-hover)");
    expect(row["border-radius"]).toBe("var(--bf-radius-control)");
    const pill = declsOf(`${S} .dash-rx .badge`);
    expect(pill.padding).toBe("3px 8px");
    expect(pill["font-size"]).toBe("11px");
    // the bar: ink on the line colour, the lime marker at its end
    expect(declsOf(`${S} .dash-rx .ss-project-track i`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .dash-rx .ss-project-track i::after`).background).toBe("var(--bf-accent-fill)");
    // the meetings preview is the soft-green tile
    expect(declsOf(`${S} .dash-rx .bfmt-preview`).background).toBe("var(--bf-color-tile)");
  });

  it("gives the Schedule page's sections the same interiors and colours", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the KPI tile: label over a 32px figure, the glyph as a 30px tool, tones on the semantic set
    expect(declsOf(`${S} .sched-rx .schedule-kpis .kpi-card`)["flex-direction"]).toBe("row-reverse");
    expect(declsOf(`${S} .sched-rx .schedule-kpis .kpi-card strong`)["font-size"]).toBe("32px");
    expect(declsOf(`${S} .sched-rx .schedule-kpis .kpi-icon`).width).toBe("30px");
    /* The KPI disc's colour moved OUT of the page rules and into one place (section 59,
       colour pass phase five): the same control used to be a white disc here, a tinted one
       on two of the Dashboard's and a neutral one on the index pages. */
    expect(declsOf(`${S} .sched-rx .kpi-icon.red`).color, "a page no longer paints its own KPI disc").toBeUndefined();
    // rows are chips; the digest's tone is a dot, not a border
    expect(declsOf(`${S} .sched-rx .sched-queue-row`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .sched-rx .sched-digest-list li::before`).background).toBe("var(--cc-blue)");
    // the title is one colour; the strip's figure is the display face; a filter that is on is the lime chip
    expect(declsOf(`${S} .sched-rx .dx-title em`).color).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .sched-rx .ss-strip-figure strong`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .sched-rx .sched-chip`).background).toBe("var(--bf-accent-fill)");
    // the variance card's severity reads the semantic pairs
    expect(declsOf(`${S} .sched-rx .sv-sev-pill.sv-sev-high`).color).toBe("var(--cc-red)");
  });

  it("gives the Bookmarks page's tiles the same interiors: surface-2 tiles, a 30px disc, an ink star when on", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const tile = declsOf(`${S} .bm-tile`);
    expect(tile.background).toBe("var(--bf-hover)");
    expect(tile.border).toBe("0");
    expect(tile["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(declsOf(`${S} .bm-tile-icon`).width).toBe("30px");
    const on = declsOf(`${S} .bm-tile-star.is-on`);
    expect(on.background).toBe("var(--bf-ink)");
    expect(on.color).toBe("var(--bf-accent-fill)");
    expect(declsOf(`${S} .bookmarks-page .bm-group h2`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .bm-empty`).border).toBe("0");
    expect(declsOf(".bf-shell:not([data-bf-theme]) .hs-index")["--hsx-violet"]).toBe("var(--bf-color-info)");
  });

  it("draws the Month page's calendar as tiles on a gap, today in the lime, chips white with their trade dot", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const cell = declsOf(`${S} .sched-rx .sched-cal-cell`);
    expect(cell.background).toBe("var(--bf-hover)");
    expect(cell["border-radius"]).toBe("var(--bf-radius-control)");
    expect(declsOf(`${S} .sched-rx .sched-cal-grid`).gap).toBe("6px");
    expect(declsOf(`${S} .sched-rx .sched-cal-cell.is-today`).background).toContain("var(--bf-accent-fill)");
    expect(declsOf(`${S} .sched-rx .sched-cal-cell.is-today .sched-cal-daynum`).background).toBe("var(--bf-ink)");
    // the hover is still an image over the wash, never a colour
    const hover = declsOf(`${S} .sched-rx .sched-cal-cell.is-addable:hover`);
    expect(hover["background-image"]).toMatch(/^linear-gradient\(/);
    expect(hover.background).toBeUndefined();
    /* Dark mode (2026-09-17). A non-working day's wash comes from the mode's own tokens: it named
       --cd-surface-3, which nothing declares, so the light fallback painted #e2e2e2 days into dark
       mode. And the 45% white lift that is subtle on a light tile flashed on a dark one, so dark mode
       (chosen, or System on a dark OS) lifts toward the light ink instead. */
    expect(declsOf(`${S} .sched-rx .sched-cal-cell.is-weekend`).background).toBe("color-mix(in srgb, var(--bf-ink) 7%, var(--bf-hover))");
    const darkLift = "linear-gradient(rgba(var(--bf-line-rgb), 0.08), rgba(var(--bf-line-rgb), 0.08))";
    expect(declsOf(`${S}[data-bf-mode="dark"] .sched-rx .sched-cal-cell.is-addable:hover`)["background-image"]).toBe(darkLift);
    let systemLift: string | undefined;
    sheet.walkAtRules("media", (media) => {
      if (!media.params.includes("prefers-color-scheme: dark")) return;
      media.walkRules((rule: Rule) => {
        if (splitSelectors(rule.selector).includes(`${S}[data-bf-mode="system"] .sched-rx .sched-cal-cell.is-addable:hover`)) {
          rule.walkDecls("background-image", (decl) => {
            systemLift = decl.value;
          });
        }
      });
    });
    expect(systemLift).toBe(darkLift);
    // chips and the nav
    const chip = declsOf(`${S} .sched-rx .sched-act`);
    expect(chip.background).toBe("var(--bf-surface)");
    expect(chip.border).toBe("0");
    expect(declsOf(`${S} .sched-rx .sched-monthnav`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .sched-rx .sched-cal-dow span`)["letter-spacing"]).toBe("0.14em");
  });

  it("draws the Week board's heads as eyebrows, its job cards as semantic washes, its queue as tiles", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .sched-rx .schedule-header > span`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .sched-rx .schedule-header strong`)["font-family"]).toBe("var(--bf-font-display)");
    const job = declsOf(`${S} .sched-rx .schedule-job`);
    expect(job.border).toBe("0");
    expect(job.background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .sched-rx .schedule-job.in-progress`).background).toBe("var(--cc-blue-soft)");
    expect(declsOf(`${S} .sched-rx .schedule-job.delayIQed`).background).toBe("var(--cc-red-soft)");
    expect(declsOf(`${S} .sched-rx .schedule-add-job-button`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .sched-rx .unassigned-card`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .sched-rx .schedule-legend .in-progress`).background).toBe("var(--bf-accent)");
    // a badge agrees with the card it sits on and the legend's dot
    expect(declsOf(`${S} .sched-rx .badge.ready`).background).toBe("var(--cc-violet-soft)");
    expect(declsOf(`${S} .sched-rx .badge.planned`).background).toBe("var(--bf-hover)");
    // the sticky crew column's own background and padding (schedule-phone.css) are left alone
    const crew = declsOf(`${S} .sched-rx .crew-label`);
    expect(crew.background).toBeUndefined();
    expect(crew.padding).toBeUndefined();
  });

  it("draws the List page's rows on hairlines with eyebrow column heads and a lime today", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .sched-rx .schedule-list-view header`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .sched-rx .sched-list-dayhead`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .sched-rx .sched-list-day.is-today .sched-list-dayhead`).background).toContain("var(--bf-accent-fill)");
    const row = declsOf(`${S} .sched-rx .schedule-list-view button`);
    expect(row["border-bottom"]).toBe("1px solid var(--bf-line-solid)");
    expect(row["grid-template-columns"]).toBeUndefined(); // the phone sheet owns the row's grid
    expect(declsOf(`${S} .sched-rx .schedule-list-view button:hover`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .sched-rx .sched-list-day.drop-over`)["box-shadow"]).toBe("inset 0 0 0 2px var(--bf-ink)");
  });

  it("draws the Kanban lanes as surface-2 tiles on the semantic tones, with white cards", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const lane = declsOf(`${S} .sched-rx .sched-kan-lane`);
    expect(lane.background).toBe("var(--bf-hover)");
    expect(lane.border).toBe("0");
    expect(declsOf(`${S} .sched-rx .sched-kan-lane.tone-green`)["--kan-tone"]).toBe("var(--cc-green)");
    expect(declsOf(`${S} .sched-rx .sched-kan-lane.tone-violet`)["--kan-tone"]).toBe("var(--bf-accent)");
    /* The lane being carried into is marked by its FILL and nothing else. The ink ring it used to
       wear was asked away 2026-09-17 ("remove the black outline around each of the sections when a
       user is moving a job into the section"); schedule.css is checked too, or that older sheet
       would paint its own ring underneath this one. The List day's ring is untouched. */
    /* The mark itself must stay LIGHT. It used to be 38% of `--bf-accent-fill`, which the no-blue
       pass had re-pointed to #1c1c1c — near-black — so the target lane rendered rgb(160,160,160)
       beside its neighbours' #f1f1f1 and was reported twice as a black outline. Every drop target
       on the three boards now takes a low tint of the ink; anything above a fifth is a slab. */
    for (const target of [
      `${S} .sched-rx .sched-kan-lane.drop-over`,
      `${S} .sched-rx .sched-cal-cell.drop-over`,
      `${S} .sched-rx .sched-list-day.drop-over .sched-list-dayhead`
    ]) {
      const fill = declsOf(target).background;
      expect(fill, target).toContain("var(--bf-hover)");
      expect(fill, target).not.toContain("var(--bf-accent-fill)");
      const pct = Number(/(\d+)%/.exec(fill)?.[1]);
      expect(pct, `${target} mixes ${pct}% of the ink`).toBeLessThanOrEqual(20);
    }
    expect(declsOf(`${S} .sched-rx .sched-kan-lane.drop-over`)["box-shadow"]).toBeUndefined();
    const older = postcss.parse(readFileSync(join(SRC, "schedule.css"), "utf8"));
    older.walkRules((rule: Rule) => {
      if (!splitSelectors(rule.selector).includes(".sched-rx .sched-kan-lane.drop-over")) return;
      rule.walkDecls("box-shadow", (decl) => expect.fail(`schedule.css still rings the lane: ${decl.value}`));
    });
    const card = declsOf(`${S} .sched-rx .sched-kan-card`);
    expect(card.background).toBe("var(--bf-surface)");
    expect(card["box-shadow"]).toBe("var(--bf-shadow-card)");
    expect(declsOf(`${S} .sched-rx .sched-kan-empty`).border).toBe("0");
  });

  it("shades the Matrix's load on the reference's lime ramp and leaves its tooltip and overflow alone", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .sched-rx .sched-matrix-cell.load-1`).background).toBe("var(--bf-color-accent-wash)");
    expect(declsOf(`${S} .sched-rx .sched-matrix-cell.load-3`).background).toBe("var(--bf-color-accent-wash-3)");
    expect(declsOf(`${S} .sched-rx .sched-matrix-cell.is-conflict`).background).toBe("var(--cc-red-soft)");
    expect(declsOf(`${S} .sched-rx .sched-matrix-cell:hover`)["box-shadow"]).toBe("inset 0 0 0 2px var(--bf-ink)");
    expect(declsOf(`${S} .sched-rx .sched-matrix-util.limited`).color).toBe("var(--cc-amber)");
    expect(declsOf(`${S} .sched-rx .sched-matrix-corner`)["letter-spacing"]).toBe("0.14em");
    // the guard's contracts: the grid stays overflow: visible, the tooltip keeps its own show/hide
    expect(declsOf(`${S} .sched-rx .sched-matrix`).overflow).toBeUndefined();
    const tip = declsOf(`${S} .sched-rx .sched-matrix-tip`);
    expect(tip.visibility).toBeUndefined();
    expect(tip.opacity).toBeUndefined();
    expect(tip.display).toBeUndefined();
    // the phone sheet's sticky crew column keeps its background
    expect(declsOf(`${S} .sched-rx .sched-matrix-crew`)).toEqual({});
  });

  it("gives the Gantt chart the pill nav, eyebrow heads, a lime today and pill bars, and leaves the bar's fill and overflow to the guard", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    /* The chart's scope is `.gantt-page.gantt-chart` since 2026-09-17: the page used to
       borrow `.hs-index` to get a scope, which also gave it the index pages' layout — the
       reason it never matched its six siblings. It stands in the shared schedule frame now. */
    expect(declsOf(`${S} .gantt-page.gantt-chart .gantt-seg`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .gantt-page.gantt-chart .gantt-seg button.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .gantt-page.gantt-chart .gantt-sidebar-header`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .gantt-page.gantt-chart .gantt-marker.is-today .gantt-marker-pill`).background).toBe("var(--bf-accent-fill)");
    expect(declsOf(`${S} .gantt-page.gantt-chart .gantt-group-summary`).background).toBe("var(--bf-ink)");
    const bar = declsOf(`${S} .gantt-page.gantt-chart .gantt-bar`);
    expect(bar["border-radius"]).toBe("999px");
    expect(bar.background).toBeUndefined(); // stays var(--gantt-bar-dot), which check-css asks of schedule.css
    expect(bar.overflow).toBeUndefined(); // stays visible, so the label can sit outside the bar
    expect(declsOf(`${S} .gantt-page .gantt-drawer-facts dt`)["letter-spacing"]).toBe("0.14em");
    // the Gantt page's root has no .sched-rx, so the filter row and saved views are restated for it
    expect(declsOf(`${S} .gantt-page.gantt-chart .sched-chip`).background).toBe("var(--bf-accent-fill)");
    expect(declsOf(`${S} .gantt-page.gantt-chart .sched-view-chip.is-active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .gantt-page.gantt-chart .schedule-select`)["border-radius"]).toBe("999px");
  });

  it("plays the reference's entrance when the Dashboard opens: panels by row, rows after them", () => {
    // 2026-09-19: re-cut to docs/motion-spec.md (skin §74). The panel board is ONE
    // board now — the Dashboard's and the Schedule's — so neither carries a rank or
    // a base of its own; both read the beats, staggered by the panel's place in the grid.
    const S = ".app-shell.hs-shell.bf-shell";
    const panel = declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block`);
    expect(panel.animation).toContain("bfe-lift");
    expect(panel.animation).toContain("backwards"); // so a drag's inline transform and the hover lift stay free afterwards
    expect(panel["animation-delay"]).toContain("var(--bfm-beat-board)");
    expect(panel["animation-delay"]).toContain("var(--bfe-row, 0) * var(--bfm-row)");
    expect(panel["animation-delay"]).toContain("var(--bfe-col, 0) * var(--bfm-stagger-card)");
    const row = declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block .cc-list > *`);
    expect(row.animation).toContain("bfe-lift");
    expect(row["animation-delay"]).toContain("var(--bfm-beat-board-content)");
    // the old flat rank and per-page base are gone, and nothing reads them
    expect(sheet.toString()).not.toContain("var(--bfe-i");
    expect(sheet.toString()).not.toContain("var(--bfe-base");
    // 2026-09-19: the Schedule reads the shared beats now (skin §76), not two numbers of its own
    expect(declsOf(`${S} .sched-rx.dx-ready .ss-strip[data-reveal]`)["transition-delay"]).toBe(
      "max(0ms, calc(var(--bfm-beat-kpi) - var(--bfm-shift)))"
    );
    expect(declsOf(`${S} .sched-rx.dx-ready .schedule-control-row[data-reveal]`)["transition-delay"]).toBe(
      "max(0ms, calc(var(--bfm-beat-controls) - var(--bfm-shift)))"
    );
    expect(declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block .sched-queue > *`).animation).toContain("bfe-lift");
    expect(declsOf(`${S} .dash-rx.hs-home .dash-board .dash-block .cc-spark-line`).animation).toContain("bfe-draw");
  });

  it("plays the same entrance on the Projects and Crews pages: KPI tiles, then the card, then its rows", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const tile = declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-kpis > .hs-kpi`);
    // 2026-09-19: the figures beat, not a pair of numbers this page owned (skin §75)
    expect(tile.animation).toContain("bfe-lift");
    expect(tile["animation-delay"]).toBe(
      "max(0ms, calc(var(--bfm-beat-kpi-cols) + var(--bfe-r, 0) * var(--bfm-stagger-card) - var(--bfm-shift)))"
    );
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-index-main > .hs-index-card`)[
        "animation-delay"
      ]
    ).toBe("max(0ms, calc(var(--bfm-beat-board) + var(--bfe-r, 0) * var(--bfm-stagger-card) - var(--bfm-shift)))");
    const row = declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table tbody > tr`);
    expect(row.animation).toContain("bfe-lift");
    expect(row["animation-delay"]).toContain("var(--bfm-beat-board-content)");
    expect(row.animation).toContain("backwards");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table tbody > tr:nth-child(3)`)[
        "--bfe-r"
      ]
    ).toBe("2");
  });

  it("lays the Projects and Crews pages' tiles and tables out the reference's way, in their colours", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-kpi`)["flex-direction"]
    ).toBe("row-reverse");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-kpi-value`)["font-size"]
    ).toBe("32px");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-kpi-delta.is-down`).color
    ).toBe("var(--cc-red)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table thead th`)[
        "letter-spacing"
      ]
    ).toBe("0.14em");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table tbody td`)[
        "border-bottom"
      ]
    ).toBe("1px solid var(--bf-line-solid)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-avatar`).background
    ).toContain("var(--bf-color-face");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-progress-track.tone-red i`)
        .background
    ).toBe("var(--cc-red)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-qf.is-set`).background
    ).toBe("var(--bf-accent-fill)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-chip.active`).background
    ).toBe("var(--bf-ink)");
    expect(declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-link`).color).toBe(
      "var(--bf-ink)"
    );
    // the panels beside the table: cards with chip rows, the health figure in the display face
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-panel`)["border-radius"]
    ).toBe("var(--bf-radius-card)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .proj-mile-row`).background
    ).toBe("var(--bf-hover)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .proj-health-center strong`)[
        "font-size"
      ]
    ).toBe("32px");
  });

  it("gives the contact record panel the card language: gradient face, disc actions, chip rows, semantic tags", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    /* The panel is a portal to document.body, so its rules hang off the body, not the shell — and
       they are NOT fenced to one mode: the light palette below is, the rules that read it are not,
       which is how dark mode reaches the panel at all (2026-09-17). */
    const P = `body:has(${S}) .hs-record-layer`;
    const LIGHT = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"])) .hs-record-layer`;
    expect(declsOf(LIGHT)["--bf-surface"]).toBe("#ffffff");
    expect(declsOf(LIGHT)["--cc-green"]).toBe("var(--bf-color-ok)");
    expect(declsOf(`${P} .hs-record`)["box-shadow"]).toBe("var(--bf-shadow-float)");
    /* ON THE SAME DRAWER STANDARD as every dialog (asked 2026-09-18, "do the same for the contacts
       record panel too"). It was already the right-side frame, so what this pins is the two places
       it went its own way: the entrance is the shared one, not its bespoke 0.32s curve — which also
       means the reduce block reaches it — and the row that leaves and acts on the record STAYS,
       because a record runs to 1,500px and that row used to scroll away with the first flick. */
    expect(declsOf(`${P} .hs-record`).animation).toContain("bfe-drawer-in");
    const topRow = declsOf(`${P} .hs-record .hs-record-top`);
    expect(topRow.position).toBe("sticky");
    expect(topRow.background, "it has to paint, or the record shows through it").toBe("var(--bf-surface)");
    // it reaches up over the panel's top padding, which would otherwise be a strip the record scrolls through
    expect(topRow["margin-top"]).toBe("calc(-1 * var(--bf-record-pad, 20px))");
    expect(topRow["box-shadow"], "and covers that strip again if the padding ever changes").toBe("0 -24px 0 var(--bf-surface)");
    expect(declsOf(`${P} .hs-record .hs-record-avatar`).background).toContain("var(--bf-color-face");
    expect(declsOf(`${P} .hs-record .hs-record-id h2`)["font-family"]).toBe("var(--bf-font-display)");
    const action = declsOf(`${P} .hs-record .hs-record-action > span`);
    expect(action.width).toBe("40px");
    expect(action.background).toBe("var(--bf-surface)");
    expect(declsOf(`${P} .hs-record .hs-record-action.active > span`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${P} .hs-record .hs-timeline-body`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${P} .hs-record .hs-badge.tone-red`).color).toBe("var(--cc-red)");
    expect(declsOf(`${P} .hs-record .hs-task-pill.p-high`).background).toBe("var(--cc-red-soft)");
    expect(declsOf(`${P} .hs-record .hs-link`).border).toBe("0");
    // the company record's contact and deal lists sit inside a second-surface card: white tiles, not chips
    expect(declsOf(`${P} .hs-record .hs-record-card .hs-record-list li`).background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .contacts-page .hs-link-plain`).color).toBe("var(--bf-ink)");
    expect(
      declsOf(`${S} :is(.proj-rx, .crew-rx, .contacts-page, .equip-rx, .delayIQ-rx, .mat-rx, .field-rx) .hs-table thead th button`)[
        "text-transform"
      ]
    ).toBe("inherit");
  });

  it("puts the Deals board on the tray: white stage columns, second-surface cards, an ink stage track", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const P = `body:has(${S}) .hs-record-layer`;
    expect(declsOf(`${S} .deals-page .hs-board`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .deals-page .hs-board-col`).background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .deals-page .hs-board-col-head strong`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .deals-page .hs-deal-card`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .deals-page .hs-deal-card:hover`).background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .deals-page .hs-deal-card-title`).color).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .deals-page .hs-deal-card-owner`).background).toContain("var(--bf-color-face");
    expect(declsOf(`${S} .deals-page .hs-board-dot.tone-green`).background).toBe("var(--cc-green)");
    expect(declsOf(`${P} .hs-record .hs-stage-step.done > span`).background).toBe("var(--bf-ink)");
    // the portal cannot see the theme block's --bf-accent-fill, so the current step carries the lime itself
    expect(declsOf(`${P} .hs-record .hs-stage-step.current > span`).background).toBe("var(--bf-color-accent-fill)");
    // the landing pulse stays daylight's: this sheet never touches .is-landing
    expect(declsOf(`${S} .deals-page .hs-deal-card.is-landing`)).toEqual({});
  });

  it("gives the Equipment and Materials dialogs the card language: stage radius, display title, second-surface fields, ink Save", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-dialog`)["border-radius"]).toBe("var(--bf-radius-stage)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-dialog-header h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-dialog .icon-button`).width).toBe("40px");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-form input`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-form input:focus`)["box-shadow"]).toBe("0 0 0 2px var(--bf-ink)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-size-preview`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-dialog .primary-button`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .crew-dialog .primary-button.danger-button`).background).toBe("var(--cc-red)");
    expect(declsOf(`${S} :is(.equip-rx, .mat-rx) .equipment-footnote`).color).toBe("var(--bf-ink-faint)");
  });

  it("gives Map & Field Ops the card language: panels, chip rows, a pill-track goal switch, semantic pills, an entrance", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const panel = declsOf(`${S} .map-ops-page .panel`);
    expect(panel["border-radius"]).toBe("var(--bf-radius-card)");
    expect(panel.background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .map-ops-page .panel-header h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .map-ops-page .panel-header button`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .map-ops-page .lm-card`)["--lm-accent"]).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .map-ops-page .route-goal-control button.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .map-ops-page .map-field-job-main`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .map-ops-page .badge.delayiqed`).color).toBe("var(--cc-red)");
    expect(declsOf(`${S} .map-ops-page .primary-button`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .map-ops-page .map-command-bar`).animation).toContain("bfe-fade");
    expect(declsOf(`${S} .map-ops-page .map-ops-left > .site-grid`)["animation-delay"]).toContain("var(--bfe-r, 0)");
  });

  it("gives the DelayIQs rail the card language: panels, second-surface risk cards, semantic severity, bars in the bad tone", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .delayIQ-rx .panel`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .delayIQ-rx .panel-header h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .delayIQ-rx .diq-panel`).background).toBe("var(--bf-surface)");
    const risk = declsOf(`${S} .delayIQ-rx .diq-risk`);
    expect(risk.background).toBe("var(--bf-hover)");
    expect(risk.border).toBe("0");
    expect(declsOf(`${S} .delayIQ-rx .diq-tone-bad .diq-sev`).color).toBe("var(--cc-red)");
    expect(declsOf(`${S} .delayIQ-rx .diq-notify`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .delayIQ-rx .form-stack input`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .delayIQ-rx .primary-button`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .delayIQ-rx .resource-row`).background).toBe("var(--bf-hover)");
    /* The impact chart's bars are NOT painted here any more (colour pass phase two): days
       of delay are drawn in the bad tone, which the chart itself asks for, and the ink
       rule that used to sit here silently beat it — an SVG fill on the element is a
       presentation attribute, so any rule wins over it. */
    expect(declsOf(`${S} .delayIQ-rx .recharts-bar-rectangle path`).fill).toBeUndefined();
    expect(readFileSync(join(SRC, "App.tsx"), "utf8")).toContain('<Bar dataKey="days" fill="var(--bf-color-bad)"');
    expect(declsOf(`${S} .delayIQ-rx .hs-index-rail > *`)["animation-delay"]).toContain("var(--bfe-r, 0)");
  });

  it("gives Reports the card language: pinned card radius, display figures, a neutral basis line, two-series charts", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // redesign.css pins every report card's radius with an !important; this sheet pins it back the same way
    expect(declsOf(`${S} .reports-page .reports-kpi-card`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(sheet.toString()).toMatch(/\.reports-page \.reports-card \{[^}]*border-radius: var\(--bf-radius-card\) !important/);
    expect(declsOf(`${S} .reports-page .reports-kpi-card strong`)["font-family"]).toBe("var(--bf-font-display)");
    // the basis line stays a neutral note — that line once held a fake trend and must never read green
    expect(declsOf(`${S} .reports-page .reports-kpi-card em.reports-kpi-basis`).color).toBe("var(--bf-ink-faint)");
    expect(declsOf(`${S} .reports-page .reports-card h2`)["text-transform"]).toBe("none");
    /* The geometry reads the SERIES tokens (colour pass phase two): the first layer is the
       program's ink, every layer after it the teal, and the line's dots match their curve.
       These rules are how the skin reaches a chart at all, so they are also what had to
       change for the coloured token to show up on screen. */
    expect(declsOf(`${S} .reports-page .recharts-bar .recharts-bar-rectangle path`).fill).toBe("var(--bf-color-series-1)");
    expect(declsOf(`${S} .reports-page .recharts-bar ~ .recharts-bar .recharts-bar-rectangle path`).fill).toBe("var(--bf-color-series-2)");
    expect(declsOf(`${S} .reports-page .recharts-line-curve`).stroke).toBe("var(--bf-color-series-2)");
    expect(declsOf(`${S} .reports-page .recharts-active-dot circle`).fill).toBe("var(--bf-color-series-2)");
    expect(declsOf(`${S} .reports-page .reports-efficiency-row`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .reports-page .reports-actions button`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .reports-page .reports-kpi-grid > .reports-kpi-card`)["animation-delay"]).toContain("var(--bfe-r, 0)");
  });

  it("gives TimeCard the card language: KPI tiles, a pill-track tab bar, cards, semantic pills, an entrance", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const stat = declsOf(`${S} .tc-page .tc-stat`);
    expect(stat["flex-direction"]).toBe("row-reverse");
    expect(stat["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .tc-page .tc-stat strong`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .tc-page .tc-tabs`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .tc-page .tc-tab.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .tc-page .tc-card`).background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .tc-page .tc-card-head h3 svg`).color).toBe("var(--bf-ink-faint)");
    expect(declsOf(`${S} .tc-page .tc-pill.red`).color).toBe("var(--cc-red)");
    expect(declsOf(`${S} .tc-page .tc-table th`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .tc-page .tc-avatar`).background).toContain("var(--bf-color-face");
    expect(declsOf(`${S} .tc-page .tc-field input`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .tc-page .tc-seg button.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .tc-page .tc-composition-total strong`).color).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .tc-page .tc-stat-grid > .tc-stat`)["animation-delay"]).toContain("var(--bfe-r, 0)");
  });

  it("gives the Field Updates entry the card language: display head, second-surface fields, an ink slider, an ink submit", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .field-rx .crew-directory-card.field-entry-card`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .field-rx .crew-card-header h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .field-rx .field-entry-body select`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .field-rx .fp-progress`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .field-rx .fp-progress[data-reporting="on"]`).background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .field-rx .fp-progress-readout strong`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .field-rx .fp-progress-slider::-webkit-slider-thumb`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .field-rx .fp-drift.behind`).color).toBe("var(--cc-red)");
    expect(declsOf(`${S} .field-rx .field-dropzone`).border).toBe("1px dashed var(--bf-line-solid)");
    expect(declsOf(`${S} .field-rx .field-dropzone.dragging`).background).toBe("var(--bf-color-accent-wash)");
    expect(declsOf(`${S} .field-rx .field-entry-body .primary-button`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .field-rx > .field-entry-card`)["animation-delay"]).toContain("var(--bfm-beat-board)");
  });

  it("gives Settings the card language: a rail card with ink nav pills, display heads, ink switches, a pill-track plan switch", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .settings-rx .settings-rail`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .settings-rx .settings-nav-item`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .settings-rx .settings-nav-item.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .settings-rx .settings-account-card .reports-avatar`).background).toContain("var(--bf-color-face");
    expect(declsOf(`${S} .settings-rx .settings-page-header h1`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .settings-rx .settings-section`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .settings-rx .settings-row select`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .settings-rx .settings-toggle.active`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .settings-rx .settings-primary-action`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .settings-rx .sx-plans-title`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .settings-rx .sx-seg-ind`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .settings-rx .sx-plan-price strong`)["font-size"]).toBe("32px");
    expect(declsOf(`${S} .settings-rx .sx-addon-card`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .settings-rx .wc-day.is-on`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .settings-rx .settings-panel-inner > *`)["animation-delay"]).toContain("var(--bfe-r, 0)");
  });

  it("gives Bookmarks the entrance: the two cards rise, the groups and tiles follow, fills backwards", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const card = declsOf(`${S} .bookmarks-page .hs-index-main > .hs-index-card`);
    expect(card.animation).toContain("bfe-lift");
    expect(card.animation).toContain("backwards");
    expect(card["animation-delay"]).toContain("var(--bfe-r, 0)");
    expect(declsOf(`${S} .bookmarks-page .hs-index-main > .hs-index-card:nth-child(2)`)["--bfe-r"]).toBe("1");
    expect(declsOf(`${S} .bookmarks-page .bm-tiles > .bm-tile`).animation).toContain("bfe-lift");
    expect(declsOf(`${S} .bookmarks-page .bm-tiles > .bm-tile:nth-child(n + 7)`)["--bfe-r"]).toBe("6");
  });

  it("gives the workspace switcher the card language: a pill trigger, a floating menu, chip rows, an ink ring on the active one", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-trigger`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-tile`).background).toContain("var(--bf-color-face");
    const menu = declsOf(`${S} .dash-rx.hs-home .bfws-menu`);
    expect(menu["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(menu.animation).toContain("bfe-goo"); // out of its own button (section 64)
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-search`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-item`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-item.is-active`)["box-shadow"]).toContain("var(--bf-ink)");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-standing.is-ended`).color).toBe("var(--cc-red)");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-add`).border).toBe("0");
    expect(declsOf(`${S} .dash-rx.hs-home .bfws-list > .bfws-item`).animation).toContain("bfe-row");
  });

  it("gives BuildFlow AI the card language: skin tokens, a floating card, ink marks, tiles, an ink composer ring, an ink send", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    /* The panel is a portal to document.body, so its rules hang off the body, like the contact
       record's — and they are NOT fenced to one mode: the light palette below is, the rules that
       read it are not, which is how dark mode reaches the panel at all (2026-09-17). */
    const P = `body:has(${S})`;
    const LIGHT = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))`;
    // the light palette is the fenced half; the names that READ it are not
    expect(declsOf(`${LIGHT} .bf-breeze`)["--bf-surface"]).toBe("#ffffff");
    const root = declsOf(`${P} .bf-breeze`);
    expect(root["--bfz-blue"]).toBe("var(--bf-ink)");
    expect(root["--bfz-paper"]).toBe("var(--bf-hover)");
    const main = declsOf(`${P} .bf-breeze-main`);
    expect(main["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(main.animation).toContain("bfe-pop");
    expect(declsOf(`${P} .bf-breeze-hero-mark`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${P} .bf-breeze-hero h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${P} .bf-breeze-suggested`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${P} .bf-breeze-quick button`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${P} .bf-breeze-composer:focus-within`)["box-shadow"]).toContain("var(--bf-ink)");
    expect(declsOf(`${P} .bf-breeze-send`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${P} .bf-breeze-msg.user .bf-breeze-msg-body`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${P} .bf-breeze-nav button.active`).background).toBe("var(--bf-ink)");
  });

  /* The assistant's confirmation prompt (section 62). The reference marks the changed words
     inside the sentence; here those marks are the program's own measured tones, so the card
     never introduces a colour of its own. */
  it("dresses the assistant's confirmation prompt in the program's tones, with an ink Accept", () => {
    const P = "body:has(.app-shell.hs-shell.bf-shell) .bf-breeze";
    const card = declsOf(`${P} .bfai-prop`);
    expect(card.background).toBe("var(--bf-surface)");
    expect(card["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(card["box-shadow"]).toBe("var(--bf-shadow-card)");
    // the proposal half is the one carrying the accent, so the two blocks read as now vs next
    expect(declsOf(`${P} .bfai-prop-block.is-suggested`).background).toBe("var(--bf-color-accent-wash)");
    // what would go, and what would come: phase one's two tones, nothing new
    expect(declsOf(`${P} .bfai-prop-text del`).background).toBe("var(--bf-color-bad-wash)");
    expect(declsOf(`${P} .bfai-prop-text del`).color).toBe("var(--bf-color-bad)");
    expect(declsOf(`${P} .bfai-prop-text ins`).background).toBe("var(--bf-color-ok-wash)");
    expect(declsOf(`${P} .bfai-prop-text ins`).color).toBe("var(--bf-color-ok)");
    // Accept is the program's primary press; Reject is quiet and sits away from it
    expect(declsOf(`${P} .bfai-prop-actions .bfai-prop-accept`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${P} .bfai-prop-actions .bfai-prop-reject`)["margin-left"]).toBe("auto");
    expect(declsOf(`${P} .bfai-prop-actions .bfai-prop-reject`).background).toBe("transparent");

    /* Dark mode is dressed by hs-breeze.css, which the skin only re-points in light — so the
       card needs its shape there too, or it would arrive unstyled. */
    const base = readFileSync(join(SRC, "hs-breeze.css"), "utf8");
    for (const one of [".bfai-prop {", ".bfai-prop-text del {", ".bfai-prop-text ins {", ".bfai-prop-actions .bfai-prop-accept {"]) {
      expect(base).toContain(one);
    }
  });

  it("gives the notifications drawer the card language: a floating card, disc buttons, a pill search, disc marks, an ink toggle", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const drawer = declsOf(`${S} .bfnt`);
    expect(drawer["border-radius"]).toBe("var(--bf-radius-card)");
    expect(drawer.animation).toContain("bfe-pop");
    expect(declsOf(`${S} .bfnt-head h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .bfnt-icon`)["border-radius"]).toBe("50%");
    expect(declsOf(`${S} .bfnt-search`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .bfnt-toggle input:checked + .bfnt-toggle-track`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .bfnt-row-mark`)["border-radius"]).toBe("50%");
    expect(declsOf(`${S} .bfnt-row.red .bfnt-row-mark`).color).toBe("var(--cc-red)");
    // the top bar sits outside every page scope that declares the tone pairs, so the drawer carries them
    expect(declsOf(`${S} .bfnt`)["--cc-red"]).toBe("var(--bf-color-bad)");
    expect(declsOf(`${S} .bfnt-row-dot`).background).toBe("var(--bf-accent-fill)");
    expect(declsOf(`${S} .bfnt-list > .bfnt-row`).animation).toContain("bfe-row");
  });

  it("gives the bookmarks menu the card language: a floating card, an eyebrow head, pill rows, a chip action, a stagger", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const menu = declsOf(`${S} .hs-bookmarks-menu`);
    expect(menu["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(menu.animation).toContain("bfe-goo"); // out of its own button (section 64)
    expect(declsOf(`${S} .hs-menu .hs-menu-head`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .hs-bookmark-row .hs-menu-item.is-current`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .hs-bookmark-hub`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .hs-bookmark-remove`)["border-radius"]).toBe("50%");
    expect(declsOf(`${S} .hs-bookmarks-add`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .hs-bookmarks-menu > .hs-bookmark-row`).animation).toContain("bfe-row");
  });

  it("gives the account menu the card language: a floating card, a gradient-face identity, menu rows, a stagger", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const menu = declsOf(`${S} .user-settings-menu`);
    expect(menu["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(menu.animation).toContain("bfe-goo"); // out of its own button (section 64)
    expect(declsOf(`${S} .user-settings-identity .reports-avatar`).background).toContain("var(--bf-color-face");
    expect(declsOf(`${S} .user-settings-identity strong`)["font-family"]).toBe("var(--bf-font-display)");
    // section 9 made these rows 40px pills; inside the menu they are rows again
    const row = declsOf(`${S} .user-settings-menu .user-settings-button`);
    expect(row.background).toBe("transparent");
    expect(row["box-shadow"]).toBe("none");
    expect(declsOf(`${S} .user-settings-menu > *`).animation).toContain("bfe-row");
  });

  /**
   * ONE RIGHT PANEL (section 70, asked for 2026-09-18: "there is like 3 or 4 different right
   * sidebar panel designs that pop up — pick one and make the others match").
   *
   * Four panels open from the right edge and each had arrived there separately: the editing
   * dialogs 480px wide, the Contacts record 600, the job drawer 440, the add-job form 480; only
   * some had a rule under the header; the close buttons came in two sizes; the padding rhythm was
   * different in all four. The EDITING DRAWER is canonical, and this reads that the other three
   * take its measurements FROM ONE PLACE — four sections each holding their own copy is exactly
   * how they drifted apart the first time.
   */
  it("gives every panel that opens from the right the editing drawer's design: one width, one header, one body", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the one number, and the four panels reading it
    expect(declsOf("body.bf-shell")["--bf-panel-w"]).toBe("min(480px, 100%)");
    const frame = declsOf(`body:has(${S}) .pdx .pdx-dialog:not(.pdx-confirm)`);
    expect(frame.width).toBe("var(--bf-panel-w)");
    expect(frame["border-radius"]).toBe("var(--bf-radius-stage) 0 0 var(--bf-radius-stage)");
    expect(frame["box-shadow"]).toBe("var(--bf-shadow-float)");
    // every one of the four is in that group — a panel left out is a fifth design
    const group = new Set(
      sheet.nodes.flatMap((node) =>
        node.type === "rule" && node.selector.includes("--bf-panel-w") === false ? splitSelectors(node.selector) : []
      )
    );
    for (const panel of [
      `body:has(${S}) .pdx .pdx-dialog:not(.pdx-confirm)`,
      `body:has(${S}) .hs-record-layer .hs-record`,
      `body:has(${S}) .gantt-page .gantt-drawer`,
      `body:has(${S}) .schedule-dialog.schedule-job-picker`
    ]) {
      expect(group.has(panel), panel).toBe(true);
      expect(declsOf(panel).width, panel).toBe("var(--bf-panel-w)");
    }
    /* A CONFIRM IS NOT ONE OF THESE. It is a centred card (section 65b), so the width group must
       carry `:not(.pdx-confirm)` — without it the question box is dragged to the edge too. */
    expect(
      declsOf(`body:has(${S}) .pdx .pdx-dialog.pdx-confirm`).width,
      "a confirm keeps its own size, narrower than a working panel"
    ).toBe("min(460px, 100%)");
    /* THE HEADER. The job drawer was the one with no rule under its title — the divider is what
       makes a header read as a header once the body scrolls under it. */
    const drawerTop = declsOf(`body:has(${S}) .gantt-page .gantt-drawer .gantt-drawer-top`);
    expect(drawerTop.padding, "the editing drawer's header padding").toBe("18px 22px 14px");
    expect(drawerTop["border-bottom"]).toBe("1px solid var(--bf-line-solid)");
    expect(drawerTop.margin, "the padding does the spacing now").toBe("0");
    /* ONE SIZE OF CLOSE BUTTON: the 30px disc the editing drawer uses. The picker's was a 40px
       icon button and the record's is the shell's, so both are brought to it. */
    for (const close of [
      `body:has(${S}) .schedule-dialog.schedule-job-picker > header .icon-button`,
      `body:has(${S}) .hs-record-layer .hs-record .hs-record-top .hs-btn-icon`
    ]) {
      const disc = declsOf(close);
      expect(disc.width, close).toBe("30px");
      expect(disc.height, close).toBe("30px");
      expect(disc["border-radius"], close).toBe("50%");
    }
    /* THE BODY. The job drawer padded the PANEL, which is why its content did not line up with the
       others' and why its header could not sit on an edge-to-edge rule. */
    expect(declsOf(`body:has(${S}) .gantt-page .gantt-drawer`).padding).toBe("0");
    const drawerBody = declsOf(`body:has(${S}) .gantt-page .gantt-drawer .gantt-drawer-body`);
    expect(drawerBody.padding, "0 at the foot — the sticky action bar carries it").toBe("16px 22px 0");
    expect(
      declsOf(`body:has(${S}) .schedule-dialog.schedule-job-picker .schedule-job-picker-content`).padding,
      "the same, so all three bars reach the panel's bottom edge"
    ).toBe("16px 22px 0");
    /* THE ACTIONS AT THE FOOT (section 70e). Measured before the fix, the job panel's Save sat
       282px above the panel's own bottom, where the editing drawer's is flush: the same panel
       showed its buttons in the middle on one page and at the edge on another. They are sticky on
       the scroller now, exactly as `.pdx-actions` is — NOT by stretching the form to fill, which
       was tried and pulled every label an inch off its control. */
    const foot = declsOf(`body:has(${S}) .gantt-page .gantt-drawer .gantt-drawer-actions`);
    expect(foot.position).toBe("sticky");
    expect(foot.bottom).toBe("0");
    expect(foot.background, "on the panel's own surface, so content cannot show through").toBe("var(--bf-surface)");
    expect(foot["box-shadow"], "a rule above it").toBe("0 -1px 0 var(--bf-line-solid)");
    expect(
      foot.margin,
      "auto at the top takes the slack so the bar reaches the bottom edge; the sides pull it out to the scroller's edges so the rule spans the panel, not the text column"
    ).toBe("auto -22px 0");
    /* and the form it sits in is a flex COLUMN, which is what makes that `auto` resolve. Its two
       side-by-side fields are grids one level down, so this is the same stack it always was —
       `flex: 1` on a grid stretched the ROWS instead and pulled every label off its control. */
    const drawerForm = declsOf(`body:has(${S}) .gantt-page .gantt-drawer .gantt-drawer-form`);
    expect(drawerForm.display).toBe("flex");
    expect(drawerForm["flex-direction"]).toBe("column");
    expect(drawerForm.flex).toBe("1");
    expect(drawerBody.display, "and the scroller above it").toBe("flex");
    /* THE FLOATING ASK-AI PILL STEPS ASIDE (section 70f). It is a body-level fixed button at
       z-index 80; the job panel is stuck below that (70d), so once the action bar moved to the
       bottom edge the pill covered "Open in Schedule" — measured with elementFromPoint, the click
       landed on the pill. The other three are portals above 80 and have always covered it. */
    const fab = sheet.nodes.filter((node): node is Rule => node.type === "rule" && node.selector.includes(".hc-assistant-fab"));
    expect(fab.length, "one rule, and it names every panel").toBe(1);
    for (const panel of [".pdx", ".hs-record-layer", ".gantt-drawer-layer", ".schedule-dialog-backdrop"]) {
      expect(fab[0].selector, panel).toContain(panel);
    }
    expect(declsOf(fab[0].selector).display).toBe("none");
    /* ONE SCRIM (section 70g, asked for 2026-09-18: "make it so people focus on that one frame —
       right now users can see the left sidebar panel and the top header"). Four different veils,
       measured: the editing drawer 32% ink over blur(6px), the record 28%, the job panel a NAVY
       42% over blur(2px) — 2px leaves the rail perfectly legible — and the add-job form 18% navy
       with no blur at all, so the page behind it stayed fully readable. The two navy values were
       also a no-blue miss; nobody had looked at a scrim. */
    expect(declsOf("body.bf-shell")["--bf-scrim"], "a fixed ink shade: ink INVERTS in dark mode, and a scrim is a shadow in both").toBe(
      "rgba(28, 28, 28, 0.32)"
    );
    expect(declsOf("body.bf-shell")["--bf-scrim-blur"]).toBe("6px");
    for (const veil of [
      `body:has(${S}) .pdx`,
      `body:has(${S}) .hs-record-layer .hs-record-backdrop`,
      `body:has(${S}) .gantt-drawer-layer .gantt-drawer-backdrop`,
      `body:has(${S}) .schedule-dialog-backdrop`
    ]) {
      const v = declsOf(veil);
      expect(v.background, veil).toBe("var(--bf-scrim)");
      expect(v["backdrop-filter"], veil).toBe("blur(var(--bf-scrim-blur))");
      expect(v["-webkit-backdrop-filter"], veil).toBe("blur(var(--bf-scrim-blur))");
    }
    /* and NOTHING mode-fenced may own the scrim — that block is (0,7,1) and would beat the group
       above in light mode only, which is how the dialog's own header spent weeks wearing the wrong
       padding (see the case above). A blur is not a colour. */
    const fenced = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))`;
    expect(declsOf(`${fenced} .pdx`).background, "the fence must not own the scrim").toBeUndefined();
  });

  /**
   * DARK MODE ON THE RIGHT PANELS (asked for 2026-09-18: "check dark mode too"). Section 70g's
   * blur is what made these visible; every one was measured with the shell in dark, and every one
   * was already broken before today.
   */
  it("gives the right panels a dark mode: their own palette, a scrim that dims, and nothing light left behind the blur", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const fence = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))`;
    /* (1) THE ROOT ELEMENT WAS LIGHT: styles.css paints `:root` a lavender literal and dark mode
       never re-pointed it. The shell covers it, so it showed only where a `backdrop-filter`
       sampled it. Transparent, the canvas takes the body's background, which is already the
       ground in both modes — no palette repeated here. */
    expect(declsOf(`html:has(${S})`).background, "so the canvas takes the body's ground").toBe("transparent");
    /* (2) 32% ink does nothing on a near-black page — the panel had no visible edge at all, its
       float shadow being near-black at 7% opacity. */
    for (const attr of ['[data-bf-mode="dark"]', '[data-bf-theme="dark"]']) {
      expect(declsOf(`body:has(${S}${attr})`)["--bf-scrim"], attr).toBe("rgba(0, 0, 0, 0.66)");
    }
    /* (3) The Contacts page's own ground was a page-scope literal; section 46 re-points every
       sheet's TONE names but not their surfaces, so the blur rang each dark card with white. */
    expect(declsOf(`body:has(${S}) .contacts-page`)["--hsc-paper"]).toBe("var(--bf-ground)");
    /* (4) A PORTAL CANNOT SEE `.bf-shell[data-bf-mode="dark"]`, so each needs the dark palette
       restated on it. Only the record layer and the AI dock had it; the editing dialogs and the
       add-job form painted the whole LIGHT palette in dark mode. Dark and system only — in light
       all three already inherit the right values from the body. */
    /* EVERY BODY PORTAL NEEDS THE DARK PALETTE, and the list comes from the SOURCE — every
       `createPortal(…, document.body)` root in the app — not from the portals this sheet happens
       to name. That distinction is the whole point: the first version of this guard enumerated
       `body.bf-shell > .x` rules instead, and it missed the two that were then reported by hand,
       the add-on prompt (`.hs-upd-backdrop`) and the Dashboard's section picker (`.bfsp`), because
       neither is scoped that way here. A portal without the palette paints the entire LIGHT set in
       dark mode — measured: a `#ffffff` card with rgb(20, 32, 58) navy ink and a blue art tile. */
    const tsxFiles = (readdirSync(SRC, { recursive: true }) as string[]).filter(
      (name) => name.endsWith(".tsx") && !name.includes(".test.")
    );
    const portalRoots = new Set<string>();
    for (const file of tsxFiles.map((name) => join(SRC, name))) {
      for (const hit of readFileSync(file, "utf8").matchAll(/createPortal\(\s*<\w+\s+className="([^"{}]+)"/g)) {
        portalRoots.add(hit[1].trim());
      }
    }
    expect(portalRoots.size, "no createPortal roots found — the pattern must have changed").toBeGreaterThan(5);
    /* The palette is declared for these; a root counts as covered when ANY of its classes is one
       (the project and crew dialogs are `.pdx` as well, and the assistant keeps its own copy). */
    const darkened = [
      ".hs-record-layer",
      ".pdx",
      ".schedule-dialog-backdrop",
      ".bfsel",
      ".bfdate",
      ".hs-upd-backdrop",
      ".bfsp",
      ".bf-breeze"
    ];
    for (const one of darkened) {
      if (one === ".bf-breeze") continue;
      expect(
        declsOf(`body:has(${S}[data-bf-mode="dark"]) ${one}`)["--bf-surface"],
        one + " has no dark palette, so it will paint every LIGHT value"
      ).toBe("#1b1b19");
    }
    const uncovered = [...portalRoots].filter((root) => {
      // the marketing page renders OUTSIDE the shell and is light-only by design
      if (root.split(/\s+/).includes("welcome-rx")) return false;
      return !root.split(/\s+/).some((cls) => darkened.includes("." + cls));
    });
    expect(uncovered, "a body portal with no dark palette").toEqual([]);
    for (const panel of [".hs-record-layer", ".pdx", ".schedule-dialog-backdrop", ".bfsel", ".bfdate"]) {
      for (const attr of ['[data-bf-mode="dark"]', '[data-bf-theme="dark"]']) {
        expect(declsOf(`body:has(${S}${attr}) ${panel}`)["--bf-surface"], panel + attr).toBe("#1b1b19");
      }
    }
    /* (5) AND SECTION 38's DIALOG RESKIN IS NO LONGER FENCED TO LIGHT. All 60 of its `.pdx`
       selectors carried the light-only prefix, so dark mode fell back to
       project-dialog-redesign.css: a 70%-white eyebrow pill, the base sheet's lavender gradient on
       the title, UPPERCASE labels, no close disc — inside a dark panel. None of it was
       mode-specific. Seven of the sixty were missed on the first pass because prettier had WRAPPED
       their selectors, which left a ring rule unfenced while the rule that quiets it stayed
       fenced; hence the whitespace-tolerant check here. */
    expect(
      sheet
        .toString()
        .split(fence)
        .slice(1)
        .some((tail) => /^\s*\.pdx\b/.test(tail)),
      "no .pdx rule may go back behind the light-mode fence"
    ).toBe(false);
    // the one value in them that WAS a light literal is a token mix now, so the ring shows on either ground
    expect(declsOf(`body:has(${S}) .pdx .labor-mix-row input:focus`)["box-shadow"]).toBe(
      "0 0 0 3px color-mix(in srgb, var(--bf-ink) 16%, transparent)"
    );
    /* (6) The frame group owns the surface and the ink: `.schedule-dialog` paints a hard `#fff` in
       styles.css, so the add-job form stayed white while its own token already said #1b1b19. */
    const frame = declsOf(`body:has(${S}) .pdx .pdx-dialog:not(.pdx-confirm)`);
    expect(frame.background).toBe("var(--bf-surface)");
    expect(frame.color).toBe("var(--bf-ink)");
    /* (7) The add-job form's FIELDS had never been reskinned: `color: #1f2d45` on `border: 1px
       solid #dbe4ee` — navy on pale blue, invisible against a dark panel. They take the editing
       drawer's own field declarations now, which is also what makes the two forms look alike. */
    const field = declsOf(`body:has(${S}) .schedule-job-picker .schedule-job-create-form :is(input, select, textarea)`);
    expect(field.background).toBe("var(--bf-hover)");
    expect(field.color).toBe("var(--bf-ink)");
    expect(field.border).toBe("0");
    const labelSpan = declsOf(`body:has(${S}) .schedule-job-picker .schedule-job-create-form .form-field span`);
    expect(labelSpan.color, "the slate-blue #607089 is gone").toBe("var(--bf-ink-muted)");
    expect(labelSpan["font-size"], "and they are the drawer's labels, not 12px uppercase").toBe("11.5px");
    expect(labelSpan["text-transform"]).toBe("none");
    expect(
      declsOf(`body:has(${S}) .schedule-dialog.schedule-job-picker .schedule-job-create-actions`).position,
      "the add-job form's buttons too"
    ).toBe("sticky");
    /* AND THE PANEL HAS TO BE ABOVE THE TOP BAR (section 70d). This one is rendered inside the
       page, and `.sched-rx` sets `isolation: isolate`, so the layer's own z-index resolves inside
       the page's stacking context — which sits below the top bar's 40. Measured before the fix:
       `elementFromPoint` at the middle of this panel's header returned the TOP BAR, so its title
       was hidden and its close button could not be clicked. The page is lifted only while the
       panel is mounted; `:has()` is that condition. */
    const lifted = declsOf(`body:has(${S}) .sched-rx:has(.gantt-drawer-layer)`);
    expect(lifted["z-index"], "clear of the top bar's 40, under the body portals").toBe("60");
    /* THE ONE THING THAT STAYS DIFFERENT, recorded so nobody takes it for a miss: the record panel
       has no body element to make a scroller of — its sections are siblings in App.tsx — so it
       scrolls as a WHOLE with its top row stuck to the edge (section 66). Same behaviour to look
       at, different mechanism, and the rhythm is still the drawer's. */
    const record = declsOf(`body:has(${S}) .hs-record-layer .hs-record`);
    expect(record.padding).toBe("var(--bf-record-pad) 22px 22px");
    /* and its sticky top row's negative pull reads the SAME number (section 66 reaches the panel's
       edge with `calc(-1 * var(--bf-record-pad, 20px))`). The token was never declared, so it took
       the 20px fallback while the panel padded 18 — measured, the row hung 2px over the rounded
       corner. Declaring it is what keeps the two in step. */
    expect(record["--bf-record-pad"], "declared, not left on the 20px fallback").toBe("18px");
    expect(declsOf(`body:has(${S}) .hs-record-layer .hs-record .hs-record-top`).position, "the record's header holds by sticking").toBe(
      "sticky"
    );
  });

  it("gives the Create menu and the shared dialog the card language, scoped from the body because the dialog is a portal", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const P = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))`;
    expect(declsOf(`${S} .hs-create .hs-menu-item`)["border-radius"]).toBe("var(--bf-radius-control)");
    expect(declsOf(`${S} .hs-create .hs-menu-tag.new`).background).toBe("var(--bf-color-accent-wash)");
    // the earlier sections' .pdx rules under the shell prefix could never match; none may remain
    expect(sheet.toString()).not.toMatch(/\.app-shell\.hs-shell\.bf-shell \.pdx /);
    /* The dialog's SHAPE moved to section 65 on 2026-09-18, when every one of these became a
       right-side drawer: the stage radius is now on its left corners only, and it is not fenced to
       a mode, because an edge and a radius are geometry and dark mode needs the same ones. */
    const shape = declsOf(`body:has(${S}) .pdx .pdx-dialog`);
    expect(shape["border-radius"]).toBe("var(--bf-radius-stage) 0 0 var(--bf-radius-stage)");
    expect(shape.width, "the shared panel width, section 70").toBe("var(--bf-panel-w)");
    expect(shape["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(declsOf(`${P} .pdx .pdx-dialog`)["border-radius"], "the mode-fenced block must not own the shape").toBeUndefined();
    /* A CONFIRM IS THE EXCEPTION (asked for 2026-09-18, right after the drawer landed): it is one
       question with two answers, not a form to work in, so it stays a card in the middle. The
       LAYER has to centre again too — it is shared, so it only does so when holding a confirm. */
    const confirm = declsOf(`body:has(${S}) .pdx .pdx-dialog.pdx-confirm`);
    expect(confirm["border-radius"], "all four corners, not the drawer's left pair").toBe("var(--bf-radius-stage)");
    expect(confirm.margin, "centred, not docked").toBe("0");
    // the editing drawer runs the full height of the page, not from under the top bar (asked 2026-09-18)
    expect(shape.margin, "full height: no top-bar offset").toBe("0");
    expect(confirm.animation).toContain("bfe-pop");
    expect(declsOf(`body:has(${S}) .pdx:has(.pdx-confirm)`)["place-items"]).toBe("center");
    // and it hugs its question rather than stretching to the cap the drawer's body fills
    for (const part of [".pdx-body", ".pdx-form"]) {
      expect(declsOf(`body:has(${S}) .pdx .pdx-confirm ${part}`).flex, part).toBe("0 1 auto");
    }
    /* These two moved out from behind the mode fence with the rest of section 38 on 2026-09-18 —
       see the dark-mode case below. The glow and the gradient `em` are the base sheet's, and dark
       mode needs them killed just as much as light mode does. */
    expect(declsOf(`body:has(${S}) .pdx .pdx-glow`).display).toBe("none");
    expect(declsOf(`body:has(${S}) .pdx .pdx-title em`)["-webkit-text-fill-color"]).toBe("var(--bf-ink)");
    /* THE TITLE'S FACE AND SCALE ARE NOT MODE-FENCED (moved 2026-09-18, section 70). They sat in
       the light-only block, which is (0,7,1) — `:has()` takes its argument's specificity — so the
       `28px` there was quietly beating section 65's own `20px` and the editing drawer had never
       worn the header it declares. Dark mode, meanwhile, got no display face at all and fell back
       to the base sheet's serif. Only the colour belongs behind the fence. */
    const title = declsOf(`body:has(${S}) .pdx .pdx-title`);
    expect(title["font-family"]).toBe("var(--bf-font-display)");
    expect(title["font-size"], "the drawer's title, not the wide card's 28px").toBe("20px");
    expect(declsOf(`${P} .pdx .pdx-title`)["font-size"], "nothing behind the fence may re-scale it").toBeUndefined();
    expect(declsOf(`${P} .pdx .pdx-head`).padding, "nor re-pad the header").toBeUndefined();
    expect(declsOf(`body:has(${S}) .pdx .pdx-head`).padding).toBe("18px 22px 14px");
    expect(declsOf(`body:has(${S}) .pdx .pdx-head`)["border-bottom"], "the rule under the title, in both modes").toBe(
      "1px solid var(--bf-line-solid)"
    );
    /* From here down, read from the UNFENCED prefix: section 38 is no longer fenced to light
       mode (see the dark-mode case below), so the fence owns none of these any more. The
       `toBeUndefined` reads above are the other half of that — they assert it stays that way. */
    expect(declsOf(`body:has(${S}) .pdx .pdx-title em`).background).toBe("none");
    expect(declsOf(`body:has(${S}) .pdx .pdx-form input`).background).toBe("var(--bf-hover)");
    expect(declsOf(`body:has(${S}) .pdx .pdx-actions .pdx-save:not(.pdx-danger)`).background).toBe("var(--bf-ink)");
    expect(declsOf(`body:has(${S}) .pdx .pdx-actions .pdx-cancel`)["border-radius"]).toBe("999px");
    /* THE FIELDS LIST IN behind the panel (section 67, asked for 2026-09-18 with a recording of
       another app's panel whose rows arrive after its frame has landed). Unfenced, because motion
       is not colour, and on the PANEL duration — on the old enter duration the last field landed
       near a second after a frame that now arrives in 0.24s. The record panel and the job drawer
       list the same way; none of them did before. */
    /* Longhands, not the `animation` shorthand: the base sheet reaches these labels with a
       shorthand of its own, and a shorthand carrying a var() serialises empty in the CSSOM, which
       is how the first attempt silently did nothing — every label computed `animation-name: none`
       while the rule sat in the sheet looking right. */
    const listing = declsOf(`body:has(${S}) .pdx .pdx-form > label`);
    expect(listing["animation-name"]).toBe("bfe-row");
    expect(listing["animation-duration"]).toBe("var(--bf-dur-panel)");
    expect(listing["animation-delay"]).toBe("calc(var(--bfm-overlay) + var(--bfe-r, 0) * var(--bfm-stagger-icon))");
    expect(listing.animation, "no shorthand here, on purpose").toBeUndefined();
    /* AND NOTHING MAY KILL IT ON THE LABELS. A mode-fenced `> label { animation: none }` sat here
       to suppress the base sheet's own `pdx-field-in` — but `> label` out-specifies the `> *` that
       was meant to provide the stagger, so it suppressed that too and the form's eleven labels
       never animated at all; only the one non-label child did, which is what made it look like a
       stagger was running. Both that rule and the base entrance it was fighting are gone. */
    expect(declsOf(`${P} .pdx .pdx-form > label`).animation, "nothing may null the labels").toBeUndefined();
    /* AND THE WAY OUT (section 68). React unmounts these panels, so components/ui/panelExit.tsx
       puts an inert COPY back for the length of the exit; this is what the copy wears. The
       selectors carry the `:has()` prefix ONLY to out-specify the arrival — sections 65 and 66 give
       the same elements `bfe-drawer-in` at (0,5,1), and a plain `body > .bf-panel-exit …` at
       (0,2,1) loses, which measured as the copy replaying its entrance on the way out. */
    const exitPanel = declsOf(`body:has(${S}) .bf-panel-exit.pdx .pdx-dialog`);
    expect(exitPanel.animation).toContain("bfe-drawer-out");
    expect(exitPanel.animation, "it leaves at the speed it arrived — one gesture, reversed").toContain("var(--bf-dur-panel)");
    expect(shape.animation, "and the arrival is that same duration").toContain("var(--bf-dur-panel)");
    // a confirm never went to the edge, so it does not leave by it
    expect(declsOf(`body:has(${S}) .bf-panel-exit.pdx .pdx-dialog.pdx-confirm`).animation).toContain("bfe-pop-out");
    expect(declsOf(`body:has(${S}) .bf-panel-exit.hs-record-layer .hs-record`).animation).toContain("bfe-drawer-out");
    expect(declsOf("body > .bf-panel-exit")["pointer-events"], "the copy is a picture, not a panel").toBe("none");
    /* The copy must carry what the person typed — `cloneNode` copies attributes, and a controlled
       input's text is a PROPERTY — or the panel blanks its own fields on the way out. */
    const exitLayer = readFileSync(join(SRC, "components", "ui", "panelExit.tsx"), "utf8");
    expect(exitLayer).toContain("copy.value = original.value");
    expect(exitLayer, "and it is inert while it leaves").toContain('copy.setAttribute("inert", "")');
    expect(exitLayer, "asked to keep still: no copy, no exit").toContain('matchMedia?.("(prefers-reduced-motion: reduce)")');
    expect(readFileSync(join(SRC, "App.tsx"), "utf8"), "mounted once, beside the other layers").toContain("<PanelExitLayer />");
    /* THE ADD-JOB FORM IS A RIGHT PANEL TOO (section 69, asked 2026-09-18). It was the last
       centred card in the product and is not on the `.pdx` system, so it had stayed in the middle.
       It is now a portal on the body — `.sched-rx` sets `isolation: isolate`, which trapped its
       z-index under the top bar and hid its own header — which is why its rules are scoped from
       the body and why it had to join the zoom and scope-gate lists above. */
    const picker = declsOf(`body:has(${S}) .schedule-dialog.schedule-job-picker`);
    expect(picker.width, "the same width as the editing drawer").toBe("var(--bf-panel-w)");
    expect(picker.margin, "full height, like the editing drawers").toBe("0");
    expect(picker["border-radius"]).toBe("var(--bf-radius-stage) 0 0 var(--bf-radius-stage)");
    expect(picker.animation).toContain("bfe-drawer-in");
    expect(declsOf(`body:has(${S}) .schedule-dialog-backdrop:has(.schedule-job-picker)`)["place-items"]).toBe("stretch end");
    // its header holds and its body scrolls, the drawer's shape
    expect(declsOf(`body:has(${S}) .schedule-dialog.schedule-job-picker > header`).flex).toBe("none");
    const pickerBody = declsOf(`body:has(${S}) .schedule-dialog.schedule-job-picker .schedule-job-picker-content`);
    expect(pickerBody["overflow-y"]).toBe("auto");
    expect(pickerBody["min-height"]).toBe("0");
    // and it takes the shell's zoom, or its own dropdowns land in the wrong place
    expect(declsOf("body.bf-shell > .schedule-dialog-backdrop").zoom).toBe("var(--bf-ui-scale)");
    expect(readFileSync(join(SRC, "schedule", "parts", "week.tsx"), "utf8"), "portalled out of the page's stacking context").toContain(
      "return createPortal("
    );
    const baseLabel: Record<string, string> = {};
    postcss.parse(readFileSync(join(SRC, "project-dialog-redesign.css"), "utf8")).walkRules((rule: Rule) => {
      if (rule.parent?.type === "atrule") return;
      if (!rule.selectors.includes(".pdx .pdx-form > label")) return;
      rule.walkDecls((decl) => {
        baseLabel[decl.prop] = decl.value;
      });
    });
    expect(baseLabel.animation, "the base entrance went with it").toBeUndefined();
    expect(declsOf(`${P} .pdx .pdx-form > *`).animation, "not fenced to one mode").toBeUndefined();
    for (const one of [`body:has(${S}) .hs-record-layer .hs-record .hs-record-section`, `${S} .gantt-page .gantt-drawer-body > *`]) {
      expect(declsOf(one).animation, one).toContain("bfe-row");
    }
  });

  it("gives the search palette the card language: a lavender scrim, a stage card, a display input with the magnifier, eyebrow groups, pill rows with a lime mark, chip keys, a stagger", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .cmdk-backdrop`).background).toBe("rgba(28, 28, 28, 0.32)");
    expect(declsOf(`${S} .cmdk`)["border-radius"]).toBe("var(--bf-radius-card)");
    expect(declsOf(`${S} .cmdk`)["box-shadow"]).toBe("var(--bf-shadow-stage)");
    expect(declsOf(`${S} .cmdk`).animation).toContain("bfe-pop");
    expect(declsOf(`${S} .cmdk-input`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .cmdk-input`).background).toMatch(/^url\("data:image\/svg\+xml/);
    expect(declsOf(`${S} .cmdk-group`)["letter-spacing"]).toBe("0.14em");
    expect(declsOf(`${S} .cmdk-item`)["border-radius"]).toBe("var(--bf-radius-control)");
    expect(declsOf(`${S} .cmdk-item[aria-selected="true"]`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .cmdk-item[aria-selected="true"]::before`).background).toBe("var(--bf-color-accent-fill)");
    expect(declsOf(`${S} .cmdk-foot kbd`).border).toBe("0");
    expect(declsOf(`${S} .cmdk-foot kbd`)["font-family"]).toBe("var(--bf-font-mono)");
    expect(declsOf(`${S} .cmdk-list > .cmdk-item`).animation).toContain("bfe-row");
  });

  it("gives the Upgrade menu the card language: a floating card, a tile for the current plan, gradient faces counted from the end, the lime tag, display prices, a chip Compare, a stagger", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const T = ".hs-shell.bf-shell .topbar.hs-topbar";
    expect(declsOf(`${S} .hs-upgrade-menu`)["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(declsOf(`${S} .hs-upgrade-menu`)["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(declsOf(`${S} .hs-upgrade-menu`).animation).toContain("bfe-goo");
    expect(declsOf(`${S} .hs-upgrade-current`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .hs-upgrade-current strong`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .hs-upgrade-eyebrow`)["letter-spacing"]).toBe("0.14em");
    // the ladder always ends at Enterprise, so the faces are counted from the last row
    expect(declsOf(`${S} .hs-upgrade-row:nth-last-child(2) .hs-upgrade-mark`).background).toBe("var(--bf-color-face-1)");
    expect(declsOf(`${S} .hs-upgrade-row:nth-last-child(3) .hs-upgrade-mark`).background).toBe("var(--bf-color-face-3)");
    expect(declsOf(`${S} .hs-upgrade-row:nth-last-child(4) .hs-upgrade-mark`).background).toBe("var(--bf-color-face-2)");
    expect(declsOf(`${S} .hs-upgrade-mark`)["border-radius"]).toBe("50%");
    expect(declsOf(`${S} .hs-upgrade-body strong em`).background).toBe("var(--bf-color-accent-wash)");
    expect(declsOf(`${S} .hs-upgrade-price`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .hs-upgrade-price i`).color).toBe("var(--bf-ink-faint)");
    expect(declsOf(`${S} .hs-upgrade-all`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .hs-upgrade-all`).background).toBe("var(--bf-hover)");
    // the ended-trial state had been lost under section 2's ink pill
    expect(declsOf(`${T} .hs-upgrade-btn.is-urgent`).background).toBe("var(--bf-color-bad)");
    expect(declsOf(`${S} .hs-upgrade-menu > *`).animation).toContain("bfe-row");
  });

  it("gives the Preferences panel the card language: a floating card, a display heading, 11.5 labels, second-surface selects with an ink ring, a chip Restore, an ink Open full settings, a stagger", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .pref-menu`)["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(declsOf(`${S} .pref-menu`)["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(declsOf(`${S} .pref-menu`).border).toBe("0");
    expect(declsOf(`${S} .pref-menu`).animation).toContain("bfe-goo");
    expect(declsOf(`${S} .pref-head h2`)["font-family"]).toBe("var(--bf-font-display)");
    expect(declsOf(`${S} .pref-label`)["font-size"]).toBe("11.5px");
    expect(declsOf(`${S} .pref-label`).color).toBe("var(--bf-ink-muted)");
    expect(declsOf(`${S} .pref-select`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .pref-select`).border).toBe("0");
    expect(declsOf(`${S} .pref-select:focus-within`)["box-shadow"]).toBe("0 0 0 2px var(--bf-ink)");
    expect(declsOf(`${S} .pref-select select`).color).toBe("var(--bf-ink)");
    // the swatch keeps the theme's own colour: the skin never paints its background
    expect(declsOf(`${S} .pref-select-dot`).background).toBeUndefined();
    expect(declsOf(`${S} .pref-restore`)["border-radius"]).toBe("999px");
    expect(declsOf(`${S} .pref-restore`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .pref-full`).background).toBe("var(--bf-ink)");
    expect(declsOf(`${S} .pref-full`).color).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .pref-menu > *`).animation).toContain("bfe-row");
  });

  it("scales the whole program with the window, a tenth up for reading: a registered number on the body, the shell's zoom while the Dashboard is the page, the tutorial at the reciprocal", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // registered as a number so it is computed on the body (which is not zoomed) and inherits as a value
    expect(sheet.toString()).toMatch(/@property --bf-ui-scale \{\s*syntax: "<number>";\s*inherits: true;\s*initial-value: 1;\s*\}/);
    expect(declsOf("body.bf-shell")["--bf-ui-scale"]).toBe("clamp(0.9, tan(atan2(100vw, 1440px)) * 1.1, 1.2)");
    // the portals outside the shell take the same number
    expect(declsOf("body.bf-shell > .pdx").zoom).toBe("var(--bf-ui-scale)");
    expect(declsOf(`${S}`).zoom).toBe("var(--bf-ui-scale)");
    expect(declsOf(`${S} .buildflow-tutorial-overlay`).zoom).toBe("calc(1 / var(--bf-ui-scale))");
    // the shell itself never declares the number: read on a zoomed element it would feed back into itself
    expect(declsOf(".bf-shell")["--bf-ui-scale"]).toBeUndefined();
    expect(declsOf(S)["--bf-ui-scale"]).toBeUndefined();
    // the search pill is a grid whose input track could never shrink under 180px; on the Dashboard it can reach zero
    expect(declsOf(`${S} .topbar.hs-topbar .search-box`)["grid-template-columns"]).toBe("22px minmax(0, 1fr) auto");
    // narrower than 700px the search and Confirm-email pills fold to discs; from 860px the KPI tiles go two across
    const narrow = sheet.toString().split("@media (max-width: 700px)")[1] ?? "";
    expect(narrow).toMatch(/\.topbar\.hs-topbar \.search-box \{[^}]*width: 40px;/);
    expect(narrow).toMatch(/\.search-box input \{[^}]*width: 0;/);
    expect(narrow).toMatch(/\.topbar-verify \{[^}]*font-size: 0;/);
    // the Schedule board host's bleed is capped so the root never clips its head, and its stacked title row loses the row basis
    expect(declsOf(`${S} .sched-rx.has-board .sched-board-host`)["margin-left"]).toBe("max(-28px, calc(14px - clamp(20px, 4vw, 56px)))");
    const schedHead = sheet.toString().split("42c. the Schedule page's head")[1] ?? "";
    expect(schedHead).toMatch(
      /\(max-width: 720px\)[^@]*\.sched-board-host \{[^}]*margin-left: max\(-28px, calc\(14px - clamp\(14px, 4vw, 24px\)\)\);/
    );
    expect(schedHead).toMatch(/\.sched-board-topline \.schedule-title-row \{[^}]*flex: 0 0 auto;/);
    // under 560px the index pages' head and toolbar wrap instead of running past the column
    const indexNarrow = sheet.toString().split("@media (max-width: 560px)")[1] ?? "";
    expect(indexNarrow).toMatch(/\.hs-index \.hs-index-head \{[^}]*flex-wrap: wrap;/);
    expect(indexNarrow).toMatch(/\.hs-index \.hs-toolbar \{[^}]*flex-wrap: wrap;/);
    expect(indexNarrow).toMatch(/\.reports-page \.reports-kpi-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    const tiles = sheet.toString().split("@media (max-width: 860px)")[1] ?? "";
    expect(tiles).toMatch(/\.dash-board \.kpi-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("gives the rail flyout the reference's frame: a big-radius panel clear of the rail, tall rows on pills, the entries as they were", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const panel = declsOf(`${S} .hs-flyout`);
    /* THE SHAPE is section 43's: a 30px panel sized to its entries, its top on the hub that
       opened it. It was briefly reshaped to the recording's full-height sheet on 2026-09-17
       and then asked back ("make it like how it was before, but keep the same spacing"), so
       nothing here pins a height and the panel carries no overflow of its own. */
    expect(panel["border-radius"]).toBe("30px");
    expect(panel["min-width"]).toBe("340px");
    expect(panel.top, "the panel's top still follows the hub that opened it").toBeUndefined();
    expect(panel.bottom).toBeUndefined();
    expect(panel["overflow-y"], "a panel sized to its entries never needs to scroll").toBeUndefined();
    expect(sheet.toString()).not.toContain("@media (max-height: 560px)");
    expect(declsOf(`${S} .hs-flyout-label`)["white-space"]).toBe("nowrap");
    /* NOT JOINED to the rail (asked for the same day: "the sidebar shouldn't be connected
       with the page list"). Section 43a had the panel's left edge at the rail's CENTRE,
       under the rail's face, so the two read as one surface; the reference leaves a gap with
       the page showing through — a 69px rail, an 11px gap, a 360px sheet, measured off the
       recording. 10px because that is the width of the invisible bridge the flyout carries
       on its left, which is what carries the hover across; a wider gap than the bridge would
       drop it. Verified with a real pointer: hub, gap, sheet, all still open. */
    expect(panel.left).toBe("calc(100% + 10px)");
    expect(panel["z-index"]).toBe("0");
    // 24px, the reference's inset — the old 40px only existed to clear the rail it sat under
    expect(panel.padding).toBe("16px 14px 24px 24px");
    /* And what the ask said to leave alone: the surface, the float shadow, and the entrance.
       Section 61 re-declares neither the background nor the animation, so the panel still
       slides out on `hs-flyout-in` from the same origin. */
    expect(panel.background).toBe("var(--bf-surface)");
    expect(panel["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(panel.animation, "the entrance is not touched by the reshape").toBeUndefined();
    expect(panel["transform-origin"]).toBe("left top");

    expect(declsOf(`${S} .sidebar.hs-rail`).background).toBe("transparent");
    const face = declsOf(`${S} .sidebar.hs-rail::before`);
    expect(face.display).toBe("block");
    expect(face["z-index"]).toBe("1");
    expect(face.background).toBe("var(--bf-surface)");
    expect(declsOf(`${S} .sidebar.hs-rail > :not(.hs-flyout)`)["z-index"]).toBe("2");
    expect(declsOf(`${S} .hs-flyout-head`)["letter-spacing"]).toBe("0.14em");
    const item = declsOf(`${S} .hs-flyout-item`);
    expect(item["border-radius"]).toBe("999px");
    expect(item["min-height"]).toBe("52px");
    expect(declsOf(`${S} .hs-flyout-row + .hs-flyout-row`)["margin-top"]).toBe("6px");
    expect(item["font-size"]).toBe("15px");
    expect(declsOf(`${S} .hs-flyout-item svg`).width).toBe("22px");
    expect(declsOf(`${S} .hs-flyout-item:hover`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${S} .hs-flyout-star`)["border-radius"]).toBe("50%");
    // the active row keeps daylight's accent wash: the skin never paints it
    expect(declsOf(`${S} .hs-flyout-item.active`).background).toBeUndefined();
  });

  it("spaces the top row's cluster evenly: one 10px gap, no item margins", () => {
    const T = ".app-shell.hs-shell.bf-shell .topbar.hs-topbar";
    expect(declsOf(`${T} .topbar-actions`).gap).toBe("10px");
    // the account face is the one control that is not a 40px disc: a smaller portrait in a 40px pill
    // (section 3 writes the top row without the `.app-shell` lead, so these read that prefix)
    const R = ".hs-shell.bf-shell .topbar.hs-topbar";
    expect(declsOf(`${R} .reports-avatar`).width).toBe("30px");
    expect(declsOf(`${R} .reports-avatar`)["font-size"]).toBe("11.5px");
    expect(declsOf(`${R} .reports-user-button`).height).toBe("40px");
    expect(declsOf(`${T} .topbar-actions > *`).margin).toBe("0");
    expect(declsOf(`${T} .topbar-verify`).margin).toBe("0");
  });

  /* The arrow at the rail's foot and the tab at the edge. Two other arrangements were tried on
     2026-09-17 — one tab at the screen's edge doing both jobs, then a nub on the rail's top-right
     edge — and taken back out; this is the one the user kept. */
  it("hides the rail behind its arrow and leaves a tab at the edge to bring it back", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .sidebar.hs-rail.is-hidden`).display).toBe("none");
    expect(declsOf(`${S}.sidebar-collapsed .hs-body`)["grid-template-columns"]).toBe("minmax(0, 1fr)");
    // the arrow sits under Settings, in the rail's own foot: its own spacing and nothing else
    expect(declsOf(`${S} .hs-rail-hide`)["margin-top"]).toBe("4px");
    expect(declsOf(`${S} .hs-rail-hide`).position).toBeUndefined();
    const tab = declsOf(`${S} .hs-rail-show`);
    expect(tab.position).toBe("fixed");
    expect(tab.left).toBe("0");
    expect(tab["border-radius"]).toBe("0 999px 999px 0");
    expect(tab.background).toBe("var(--bf-surface)");
  });

  it("leaves no blue anywhere: the information tone is plum, every blue token reads the accent or the ink", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the reference's blue pair, the blue face, Google's gradient and the blue focus ring are gone from the
    // sheet itself; the Blue Colors set (§47a) is the one place a blue is declared, so it is set aside here
    const outsideBlueSet = sheet.toString().replace(/\/\* BEGIN blue set \*\/[\s\S]*?\/\* END blue set \*\//, "");
    expect(outsideBlueSet).not.toMatch(/#2a56c6|#e8effd|#8fa6c9|#3f5a84|#4285f4|#2f6bff|#1a73e8|#1f57e0|#2563eb|#1d4ed8|47,\s*107,\s*255/i);
    const tokens = declsOf(S);
    expect(tokens["--bf-info-ink"]).toBe("var(--bf-color-info)");
    expect(tokens["--bf-info-wash"]).toBe("var(--bf-color-info-wash)");
    expect(tokens["--cc-violet"]).toBe("var(--bf-info-ink)");
    expect(tokens["--hs-blue"]).toBe("var(--bf-accent)");
    expect(tokens["--hsc-blue"]).toBe("var(--bf-accent)");
    expect(tokens["--tc-amber"]).toBe("var(--bf-color-warn)");
    expect(tokens["--sc-concrete"]).toBe("var(--bf-color-trade-concrete)");
    expect(declsOf(`${S} .hs-ai-button`).background).toBe("var(--bf-color-accent-gradient)");
    expect(declsOf(`${S} .hs-rail-tag`).background).toBe("var(--bf-accent)");
    expect(declsOf(`${S} .hs-rail-tag`)["box-shadow"], "the tag draws no ring").toBe("none");
    expect(declsOf(`${S} .cmdk-item.is-active`).background).toBe("var(--bf-hover)");
    // form controls, text selection and the browser's own focus ring leave the platform's blue
    expect(declsOf("body.bf-shell")["accent-color"]).toBe("#1c1c1c");
    expect(declsOf("body.bf-shell ::selection")["background-color"]).toBe("var(--bf-color-selection)");
    expect(declsOf("body.bf-shell :focus-visible")["outline-color"]).toBe("#1c1c1c");
    // the schedule's status palette reads the same plum for "ready"
    const palette = readFileSync(join(SRC, "schedule", "statusPalette.ts"), "utf8");
    expect(palette).toContain(
      'const INFO = { fill: "var(--bf-color-info-wash)", edge: "var(--bf-color-info-edge)", ink: "var(--bf-color-info)" }'
    );
    expect(palette).not.toMatch(/#2a56c6|#e8effd/);
    // the older sheets' landing rings, flashes and pulses are redrawn here: a later @keyframes
    // of the same name replaces the whole animation
    const text = sheet.toString();
    // hs-tag-ping is absent on purpose: it animated a ring around the rail's dot, and the
    // ring was removed on request, so the animation has no subject (§47b-2)
    // hs-rail-ring went the way of hs-tag-ping: it pulsed a light-gray ring out of a rail
    // icon on hover, which was removed on request, so its keyframes have no subject either
    for (const name of ["hs-deal-land", "dash-land", "sched-live-flash", "hsg-land", "sx-addon-pulse", "hs-upd-pulse"]) {
      expect(text).toContain(`@keyframes ${name} {`);
    }
    // the setup animation plays outside the shell, so its sheet's own fallbacks carry the accent
    const setup = readFileSync(join(SRC, "setup-stage.css"), "utf8");
    expect(setup).not.toMatch(/#2f6bff|47,\s*107,\s*255|#2563eb|#1f57e0/);
    const tutorial = readFileSync(join(SRC, "tutorial-stage.css"), "utf8");
    expect(tutorial).not.toMatch(/#2f6bff|47,\s*107,\s*255|#2563eb|#1f57e0/);
  });

  it("draws every colour hint from one Colors set: white, gray and black, apart from the four tones that carry meaning", () => {
    // Default is the base every set starts from, so it is declared for the shell as such
    const C = "body:has(.app-shell.hs-shell.bf-shell)";
    const light = declsOf(C);
    expect(light["--bf-color-accent"]).toBe("#1c1c1c");
    expect(light["--bf-color-accent-fill"]).toBe("#1c1c1c");
    expect(light["--bf-color-on-accent"]).toBe("#ffffff");

    /* ONLY WHAT CARRIES MEANING CARRIES HUE (colour pass, 2026-09-17). Phase one: the four
       tones — ten schedule statuses, project health, material readiness and every severity
       pill read them, and as grays they told a reader nothing with the labels covered.
       Phase two: the two chart series, which were both gray, so planned and actual were
       told apart only by position. Those two families may be coloured; every other hint in
       the set stays white, gray or black, which is what keeps the coloured ones reading as
       information rather than decoration. Phase three adds the six TRADES, which are muted
       on purpose so a trade chip cannot read as a status (design-language.test.ts measures
       that cap); the milestone marker and the holiday tone are not trades and stay neutral,
       so they are deliberately NOT on this list. Phase four adds the four identity discs:
       an avatar or a project mark is a big disc with white initials in it, which is a
       different kind of mark again, so its rule is legibility rather than saturation
       (design-language.test.ts measures the initials on every one). */
    const CARRIES_MEANING =
      /^--bf-color-((ok|warn|bad|info)(-wash|-edge|-rgb)?|series-[12]|trade-(concrete|framing|mep|finishes|sitework|inspections)|face-[1-5])$/;
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const [name, value] of Object.entries(light)) {
      if (!name.startsWith("--bf-color-") || CARRIES_MEANING.test(name)) continue;
      for (const hex of value.match(/#[0-9a-f]{6}/gi) ?? []) {
        const [r, g, b] = channels(hex);
        expect(r === g && g === b, `${name}: ${hex}`).toBe(true);
      }
    }
    // four different hues, each far enough from gray to read as a colour at a glance
    const tones = ["--bf-color-ok", "--bf-color-warn", "--bf-color-bad", "--bf-color-info"].map((token) => light[token]);
    expect(new Set(tones).size, "the four are four different colours").toBe(4);
    for (const value of tones) {
      const [r, g, b] = channels(value);
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${value} is a colour, not a gray`).toBeGreaterThan(40);
    }
    /* And they are the values the measurement chose, kept here so a later edit has to
       re-measure rather than eyeball: each clears 3:1 on the white card, its own text
       clears 4.5:1 on its wash, and the weakest pair is 1.19 apart in contrast. */
    expect(light["--bf-color-ok"]).toBe("#1a7f43");
    expect(light["--bf-color-warn"]).toBe("#8a5709");
    expect(light["--bf-color-bad"]).toBe("#9e1f18");
    expect(light["--bf-color-info"]).toBe("#5c357a");
    /* The series pair: the first stays the program's ink, the second takes the teal that
       sits 36 degrees off the nearest tone (design-language.test.ts measures that gap and
       holds every chart to using these two rather than a status tone). */
    expect(light["--bf-color-series-1"]).toBe("#1c1c1c");
    expect(light["--bf-color-series-2"]).toBe("#0f7a7a");
    /* The trades: six identities, one of them left neutral because it is also the board's
       fallback tone, and the two calendar marks that are not trades at all. */
    expect(light["--bf-color-trade-framing"]).toBe("#8f6642");
    expect(light["--bf-color-trade-concrete"]).toBe("#6e6e6e");
    expect(light["--bf-color-trade-milestone"]).toBe("#1c1c1c");
    expect(light["--bf-color-trade-holiday"]).toBe("#b0b0b0");
    // four identity discs, four different gradients
    const faces = [1, 2, 3, 4, 5].map((n) => light[`--bf-color-face-${n}`]);
    expect(new Set(faces).size, "the five discs are five different gradients").toBe(5);
    /* And no identity borrows the brand: the warehouse mark used to take the accent
       gradient for want of a fifth face, so it followed the Colors set rather than
       standing for the project. */
    const marks = readFileSync(join(SRC, "App.tsx"), "utf8").match(/const projectAvatarThemes[^}]+}/)![0];
    expect(marks).not.toContain("accent-gradient");
    expect(marks).toContain("var(--bf-color-face-5)");
    expect(light["--bf-color-face-2"]).toBe("linear-gradient(150deg, #7e5490, #442b52)");
    const [sr, sg, sb] = channels(light["--bf-color-series-2"]);
    expect(Math.max(sr, sg, sb) - Math.min(sr, sg, sb), "the second series is a colour").toBeGreaterThan(40);
    // the same set on a dark ground goes light
    expect(declsOf('body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"])')["--bf-color-accent"]).toBe("#f4f4f4");
    // Blue overrides exactly the hints that are black in Default, and leaves the grays alone
    const B = 'body:has(.app-shell.hs-shell.bf-shell[data-bf-colors="blue"])';
    const blue = declsOf(B);
    expect(blue["--bf-color-accent"]).toBe("#2563eb");
    expect(blue["--bf-color-accent-fill"]).toBe("#2563eb");
    expect(blue["--bf-color-on-accent"]).toBe("#ffffff");
    /* The one marker the brand still reaches: a milestone diamond is the schedule's
       "important date" and was the accent in Default, so it follows the set. A TRADE is
       not a brand — Blue used to re-point framing too, which existed only because framing
       happened to be the black one in Default (colour pass phase three). */
    expect(blue["--bf-color-trade-milestone"]).toBe("#2563eb");
    expect(blue["--bf-color-trade-framing"], "a trade keeps its own identity in every set").toBeUndefined();
    expect(blue["--bf-color-selection"]).toBe("rgba(37, 99, 235, 0.18)");
    /* A STATUS colour is semantic, not brand: no set overrides one, so At Risk is the same
       red whichever Colors set is on. Blue used to re-point `bad` to a navy, which existed
       only because `bad` was ink-black in Default and needed to clear the blue accent. */
    for (const untouched of [
      "--bf-color-info",
      "--bf-color-ok",
      "--bf-color-warn",
      "--bf-color-bad",
      "--bf-color-face-2",
      "--bf-color-series-2"
    ])
      expect(blue[untouched], `${untouched} is the set's to inherit, not to override`).toBeUndefined();
    expect(declsOf('body:has(.app-shell.hs-shell.bf-shell[data-bf-colors="blue"][data-bf-mode="dark"])')["--bf-color-accent"]).toBe(
      "#7ea2ff"
    );
    // the accent tokens read the set in every mode, and the sheet carries no colour of its own
    expect(declsOf(".bf-shell:not([data-bf-theme])")["--bf-accent"]).toBe("var(--bf-color-accent)");
    expect(declsOf('.app-shell.hs-shell.bf-shell[data-bf-mode="dark"]')["--bf-accent"]).toBe("var(--bf-color-accent)");
    const text = sheet.toString();
    expect(text).not.toMatch(/#(6f860b|d7f24a|f7fde2|7a3d8a|f4e9f7|1c7a42|e7f6ec|9a6708|fdf0da|b4322d|fdeaea|d8430c|ffe1d1)\b/i);
    // the neutrals lost their lavender cast: white, gray, black
    expect(declsOf(".bf-shell")["--bf-ink"]).toBe("#1c1c1c");
    expect(declsOf(".bf-shell")["--bf-line-solid"]).toBe("#e4e4e4");
    // the preferences model carries the set, not a theme, and offers one set
    const prefs = readFileSync(join(SRC, "preferences.ts"), "utf8");
    expect(prefs).toContain('"data-bf-colors": preferences.colors');
    expect(prefs).not.toContain("data-bf-theme");
    expect(prefs).toContain('{ id: "default", label: "Default", swatch: ["#ffffff", "#9b9b9b", "#1c1c1c"] }');
    expect(prefs).toContain('{ id: "blue", label: "Blue", swatch: ["#ffffff", "#9b9b9b", "#2563eb"] }');
    // the daylight sheet's five themes are gone
    const daylight = readFileSync(join(SRC, "app-shell-daylight.css"), "utf8");
    expect(daylight).not.toMatch(/data-bf-theme="(red|purple|green)"/);
  });

  it("gives the Dashboard's header its own display size, so the greeting and its lede fill the band", () => {
    const H = ".app-shell.hs-shell.bf-shell .dash-rx.hs-home .hs-home-head";
    const greeting = declsOf(`${H} .hs-home-greeting`);
    expect(greeting["font-size"]).toBe("clamp(40px, 4.8vw, 68px)");
    expect(greeting["line-height"]).toBe("1.02");
    expect(greeting["font-weight"]).toBe("var(--bf-page-display-weight)");
    const lede = declsOf(`${H} .hs-home-sub`);
    expect(lede["font-size"]).toBe("clamp(17px, 1.65vw, 22px)");
    // a full measure, not a narrow column beside empty space
    expect(lede["max-width"]).toBe("min(70ch, 780px)");
    expect(declsOf(`${H}`).gap).toBe("10px");
    expect(declsOf(`${H} .hs-home-date`).height).toBe("34px");
    // the greeting is a clear step above the other pages' title size (section 49)
    expect(declsOf(".bf-shell")["--bf-page-display"]).toBe("clamp(34px, 3.4vw, 48px)");
    // and it steps down with the phone column rather than outrunning it
    const narrow = sheet.toString().split("@media (max-width: 700px)").slice(1).join("\n");
    expect(narrow).toMatch(/\.hs-home-greeting \{[^}]*font-size: clamp\(30px, 7\.4vw, 40px\);/);
  });

  it("grows every other page header with it: one token, and the three pages that wrote a literal size join it", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the index pages and every .dx-title read this one token
    expect(declsOf(".bf-shell")["--bf-page-display"]).toBe("clamp(34px, 3.4vw, 48px)");
    // Reports, TimeCard and Settings wrote a literal 28px; each reads the token now
    for (const one of [`${S} .reports-page .page-title h1`, `${S} .tc-page .page-title h1`, `${S} .settings-rx .settings-page-header h1`]) {
      const title = declsOf(one);
      expect(title["font-size"], one).toBe("var(--bf-page-display)");
      expect(title["line-height"], one).toBe("var(--bf-page-display-lead)");
    }
    // the line under a title grew with it, on a full measure
    const sub = declsOf(`${S} .sched-rx .dx-sub`);
    expect(sub["font-size"]).toBe("clamp(14px, 1.15vw, 16px)");
    expect(sub["max-width"]).toBe("min(68ch, 760px)");
    // the title's furniture keeps proportion
    expect(declsOf(`${S} .hs-index .hs-index-title button`).width).toBe("32px");
    // the phone column steps the token back down
    const narrow = sheet.toString().split("@media (max-width: 700px)").slice(1).join("\n");
    expect(narrow).toMatch(/--bf-page-display: clamp\(26px, 6\.2vw, 34px\);/);
  });

  it("keeps the rail on one side at full length, correcting the viewport units for the shell's zoom", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // 100vh is measured before the shell's zoom; every other length here is written after it
    expect(declsOf(".hs-shell.bf-shell")["--bf-rail-span"]).toBe("calc(100vh / var(--bf-ui-scale, 1))");
    const rail = declsOf(".hs-shell.bf-shell .sidebar.hs-rail");
    expect(rail.height).toBe("var(--bf-rail-length)");
    expect(declsOf(".hs-shell.bf-shell")["--bf-rail-length"]).toBe("calc(var(--bf-rail-span) - var(--hs-topbar-h) - 28px)");
    // an explicit full length, so no 100vh cap can cut it short or run it past the bottom
    expect(rail["max-height"]).toBe("none");
    expect(rail.margin).toBe("14px 18px");
    expect(rail.top).toBe("calc(var(--hs-topbar-h) + 14px)");
    // the page buttons take the slack on a short window; the bottom group stays reachable
    const list = declsOf(`${S} .hs-rail-list`);
    expect(list["overflow-y"]).toBe("auto");
    expect(list["min-height"]).toBe("0");
    // every Sidebar Style variant gets the same correction
    expect(declsOf(`${S}[data-bf-sidebar="inset"] .sidebar.hs-rail`).height).toBe("var(--bf-rail-length)");
    expect(declsOf(`${S}[data-bf-sidebar="floating"] .sidebar.hs-rail`).height).toBe("var(--bf-rail-length)");
    expect(declsOf(`${S}[data-bf-collapse="offcanvas"] .sidebar.hs-rail`).height).toBe("var(--bf-rail-span)");
    // and it stays beside the page at narrow widths, where styles.css would make it static
    const narrow = sheet.toString().split("@media (max-width: 980px)").slice(1).join("\n");
    expect(narrow).toMatch(/\.sidebar\.hs-rail \{[^}]*position: sticky;/);
    expect(narrow).toMatch(/\.sidebar\.hs-rail \{[^}]*height: var\(--bf-rail-length\);/);
    expect(narrow).toMatch(/\.hs-body \{[^}]*grid-template-columns: 88px minmax\(0, 1fr\);/);
  });

  it("has no glow following the cursor: the element is off program-wide and nothing feeds it a position", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    expect(declsOf(`${S} .dx-cursor`).display).toBe("none");
    // and the pointer loop no longer publishes the position that placed it
    const hook = readFileSync(join(SRC, "useHudMotion.ts"), "utf8");
    expect(hook).not.toContain('"--mx"');
    expect(hook).not.toContain('"--my"');
    // the aurora parallax is a different effect and keeps its two, with its reduced-motion guard
    expect(hook).toContain('"--px"');
    expect(hook).toContain('"--py"');
    expect(hook.match(/prefersReducedMotion\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("draws no ring around a dot: not the rail's notification tag, not a page's hero dot", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    for (const dot of [
      `${S} .hs-rail-tag`,
      `${S} .hs-rail-tag.beta`,
      `${S} .hs-rail-btn.active .hs-rail-tag`,
      ".hs-shell.bf-shell .hs-rail-btn.recommended::after",
      `${S} .sched-rx .dx-dot`,
      `${S} :is(.dash-rx, .proj-rx, .crew-rx, .equip-rx, .mat-rx, .delayIQ-rx, .field-rx, .settings-rx) .dx-dot`
    ]) {
      expect(declsOf(dot)["box-shadow"], dot).toBe("none");
    }
    /* And the hero dot holds still: `dx-pulse` faded it from the ink to 0.35 and back every
       2.6 seconds, beside the date pill and the Schedule Status eyebrow, which are the same
       element. It marks a label; it is not a live indicator. */
    for (const dot of [
      `${S} .sched-rx .dx-dot`,
      `${S} :is(.dash-rx, .proj-rx, .crew-rx, .equip-rx, .mat-rx, .delayIQ-rx, .field-rx, .settings-rx) .dx-dot`
    ]) {
      expect(declsOf(dot).animation, dot).toBe("none");
    }
    // the tag's ping animated that ring, so it is switched off and its keyframes are gone
    expect(declsOf(`${S} .hs-rail-tag`).animation).toBe("none");
    expect(sheet.toString()).not.toContain("@keyframes hs-tag-ping");
  });

  it("leaves the Map page's active marker without a ring, and its own blues behind", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    // the last ring in the program: the dot lifts instead, and the label takes the ink edge
    expect(declsOf(`${S} .map-ops-page .map-marker.active .map-marker-dot`)["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(declsOf(`${S} .map-ops-page .map-marker.active .map-marker-label`).outline).toBe("2px solid var(--bf-ink)");
    /* This page is a locked add-on here, so section 46's live audit never opened it and its
       sheet kept a full set of blues. They are re-pointed in section 52; these are the ones
       the probe found rendering a hue. */
    expect(declsOf(`${S} .map-ops-page .route-lines .route-orange`).stroke).toBe("var(--bf-color-warn)");
    expect(declsOf(`${S} .map-ops-page .map-pin-kind`).color).toBe("var(--bf-color-accent)");
    expect(declsOf(`${S} .map-ops-page .map-route-vehicle.blue`).background).toBe("var(--bf-color-accent)");
    expect(declsOf(`${S} .map-ops-page .map-legend i.traffic`).background).toBe("var(--bf-color-bad)");
    expect(declsOf(`${S} .map-ops-page .crew-pin.three`).background).toBe("var(--bf-color-accent)");
  });

  it("dresses the dropdown list as the program's own menu, not the system panel", () => {
    /* A select's popup is drawn by the OS and no rule here could reach it, so
       components/ui/selectMenu.tsx draws the list and this is what it wears — the same
       card, rows, text and entrance as the other anchored menus. */
    const L = "body.bf-shell > .bfsel";
    const layer = declsOf(L);
    expect(layer.position).toBe("fixed");
    // a portal to the body, so it takes the shell's zoom like the other three (section 42)
    expect(layer.zoom).toBe("var(--bf-ui-scale)");
    const menu = declsOf(`${L} .bfsel-menu`);
    expect(menu.background).toBe("var(--bf-surface)");
    expect(menu["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(menu["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(menu.padding).toBe("8px");
    // the same entrance as the create and account menus, on the same tokens
    expect(menu.animation).toBeUndefined(); // the entrance waits for the placement: section 64
    const row = declsOf(`${L} .bfsel-item`);
    expect(row["min-height"]).toBe("34px");
    expect(row["border-radius"]).toBe("var(--bf-radius-control)");
    expect(row["font-size"]).toBe("12.5px");
    expect(row["font-weight"]).toBe("500");
    expect(row.color).toBe("var(--bf-ink)");
    expect(row["font-family"]).toBe("inherit");
    expect(
      declsOf(`${L} .bfsel-item:hover,${L} .bfsel-item:focus-visible`).background ?? declsOf(`${L} .bfsel-item:hover`).background
    ).toBe("var(--bf-hover)");
    // and the layer is mounted once, inside the shell
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).toContain("<SelectMenuLayer />");
  });

  it("dresses the calendar as the program's own menu, not the browser's picker", () => {
    /* The popup behind `<input type="date">` is the BROWSER's, so no rule here could
       reach it either: all eleven date fields opened a gray panel with a system-blue
       selection — the last of the blue the no-blue pass could not touch.
       components/ui/dateMenu.tsx draws the calendar and this is what it wears, on the
       same card, text and entrance as the dropdown list above. */
    const C = "body.bf-shell > .bfdate";
    const layer = declsOf(C);
    expect(layer.position).toBe("fixed");
    // a portal to the body, so it takes the shell's zoom like the other portals (section 42)
    expect(layer.zoom).toBe("var(--bf-ui-scale)");
    const panel = declsOf(`${C} .bfdate-panel`);
    expect(panel.background).toBe("var(--bf-surface)");
    expect(panel["border-radius"]).toBe("var(--bf-radius-panel)");
    expect(panel["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(panel.animation).toBeUndefined(); // the entrance waits for the placement: section 64
    const day = declsOf(`${C} .bfdate-day`);
    expect(day["border-radius"]).toBe("var(--bf-radius-control)");
    expect(day["font-size"]).toBe("12.5px");
    expect(day.color).toBe("var(--bf-ink)");
    expect(day["font-family"]).toBe("inherit");
    expect(day["font-variant-numeric"]).toBe("tabular-nums");
    expect(declsOf(`${C} .bfdate-day:hover`).background).toBe("var(--bf-hover)");
    expect(declsOf(`${C} .bfdate-day:focus-visible`).background).toBe("var(--bf-hover)");
    /* The chosen day wears the program's ink pill — where the browser's picker put its
       system blue — and TODAY is an inset hairline, never the halo this program had
       removed everywhere else (sections 47b-2 and 55). */
    const chosen = declsOf(`${C} .bfdate-day.is-chosen`);
    expect(chosen.background).toBe("var(--bf-ink)");
    expect(chosen.color).toBe("var(--bf-surface)");
    expect(declsOf(`${C} .bfdate-day.is-today`)["box-shadow"]).toBe("inset 0 0 0 1px var(--bf-line-solid)");
    expect(declsOf(`${C} .bfdate-day.is-outside`).color).toBe("var(--bf-ink-faint)");
    /* The browser's own glyph stays where people click and is made INERT, on the same
       scope the layer enhances — that is what stops the system picker opening. */
    const inert = sheet.toString().split('input[type="date"]::-webkit-calendar-picker-indicator').slice(1).join("\n");
    expect(inert).toMatch(/\{[^}]*pointer-events: none;/);
    /* The gate grew on 2026-09-18: the Schedule's add-job form became a portal on the body too
       (week.tsx), so its own date fields need the browser's glyph made inert like everyone else's,
       and selectMenu/dateMenu must recognise it — otherwise the OS picker comes back on exactly
       the two date fields in that panel. The three copies of this list have to move together. */
    const gate = 'body.bf-shell :is(.app-shell.hs-shell, .pdx, .hs-record-layer, .bf-breeze, .schedule-dialog-backdrop) input[type="date"]';
    /* Whitespace-collapsed: a selector this long gets wrapped across lines by the formatter, and a
       raw `toContain` on the sheet then finds nothing — the same trap as splitSelectors above. */
    expect(sheet.toString().replace(/\s+/g, " ")).toContain(gate);
    // and the layer is mounted once, inside the shell, beside the dropdown's
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).toContain("<DateMenuLayer />");
    const enhanced = readFileSync(join(SRC, "components", "ui", "dateMenu.tsx"), "utf8");
    expect(enhanced).toContain('.closest(".app-shell.hs-shell, .pdx, .hs-record-layer, .bf-breeze, .schedule-dialog-backdrop")');
    // and the dropdown layer's copy of the same list, which must not drift from it
    expect(readFileSync(join(SRC, "components", "ui", "selectMenu.tsx"), "utf8")).toContain(
      '.closest(".app-shell.hs-shell, .pdx, .hs-record-layer, .bf-breeze, .schedule-dialog-backdrop")'
    );
  });

  /* THE GOOEY OPEN (section 64, asked for 2026-09-17 with a screen recording): every dropdown
     comes OUT of the button that opened it instead of growing in place. The reference fuses the
     two into one soft surface while it moves; here that is the panel's own blur overlapping the
     button, started on the button's box so no frame can show a seam. These read the contract
     because jsdom runs no animation and nothing else in the suite can see one. */
  it("opens every dropdown out of its own button, gooey, and takes it away for reduced motion", () => {
    const frames = (name: string) => {
      const out: Record<string, Record<string, string>> = {};
      sheet.walkAtRules("keyframes", (at) => {
        if (at.params !== name) return;
        at.walkRules((step) => {
          const decls: Record<string, string> = {};
          step.walkDecls((decl) => {
            decls[decl.prop] = decl.value;
          });
          out[step.selector] = decls;
        });
      });
      return out;
    };
    const goo = frames("bfe-goo");
    expect(Object.keys(goo), "the gooey keyframes exist").toContain("0%");

    /* The first frame IS the button: a box moved onto it, at a fraction of the panel's own size,
       wearing the control radius and blurred. All five numbers are custom properties, so one
       keyframes block serves a menu that measured its control and one that did not. */
    const first = goo["0%"];
    expect(first.transform).toBe(
      "translate(var(--bf-goo-dx, 0px), var(--bf-goo-y, -8px)) scale(var(--bf-goo-x, 0.94), var(--bf-goo-h, 0.2))"
    );
    expect(first["border-radius"]).toBe("var(--bf-goo-r, var(--bf-radius-control))");
    expect(first.filter).toBe("blur(var(--bf-goo-blur, 7px))");
    expect(first.opacity).toBe("0");
    // and the last frame is the panel itself, sharp: nothing of the morph may be left behind
    expect(goo["100%"]).toEqual({ opacity: "1", transform: "none", "border-radius": "var(--bf-radius-panel)", filter: "blur(0)" });
    // it is visible while it still overlaps the button — that overlap is what reads as one surface
    expect(Number(goo["30%"].opacity)).toBe(1);

    /* All eight anchored lists, on the panel duration (0.24s: the reference's ~170ms plus a
       settle) — not the 0.52s enter duration the old pop used, which read as a separate panel
       arriving. Each grows from the corner it hangs off. */
    const S = ".app-shell.hs-shell.bf-shell";
    const RIGHT = [
      `${S} .dash-rx.hs-home .bfws-menu`,
      `${S} .hs-bookmarks-menu`,
      `${S} .user-settings-menu`,
      `${S} .hs-create .hs-menu`,
      `${S} .hs-upgrade-menu`,
      `${S} .pref-menu`
    ];
    const LEFT = [
      'body.bf-shell > .bfsel .bfsel-menu[data-bfsel-ready="true"]',
      'body.bf-shell > .bfdate .bfdate-panel[data-bfdate-ready="true"]'
    ];
    for (const one of [...RIGHT, ...LEFT]) {
      expect(declsOf(one).animation, one).toBe("bfe-goo var(--bf-dur-panel) var(--bf-ease-size) backwards");
    }
    for (const one of RIGHT) expect(declsOf(one)["transform-origin"], one).toBe("top right");
    for (const one of ["body.bf-shell > .bfsel .bfsel-menu", "body.bf-shell > .bfdate .bfdate-panel"]) {
      expect(declsOf(one)["transform-origin"], one).toBe("top left");
    }
    /* Both layers are measured before they are shown, so the entrance hangs off the mark the
       placement sets — an animation starts on mount, and a frame of this is a third of the way. */
    const ready = readFileSync(join(SRC, "components", "ui", "dateMenu.tsx"), "utf8");
    expect(ready).toContain("data-bfdate-ready");
    // a list that had to open upward grows from its bottom edge instead
    expect(declsOf('body.bf-shell > .bfsel .bfsel-menu[data-bfsel-above="true"]')["transform-origin"]).toBe("bottom left");
    // nothing that opens off a button is still on the old entrance
    for (const one of [...RIGHT, ...LEFT]) expect(declsOf(one).animation, one).not.toContain("bfe-pop");

    /* RULE R: a rule that moves pairs with its own reduced-motion rule. The duration token is
       already nulled to 1ms there, which would run a 7px blur and a squash in one frame — so the
       pair takes the animation away instead, and every one of the eight is in it. */
    let reduced: string[] = [];
    sheet.walkAtRules("media", (at) => {
      if (!/prefers-reduced-motion/.test(at.params)) return;
      at.walkRules((rule) => {
        const off = rule.nodes?.some((node) => node.type === "decl" && node.prop === "animation" && node.value === "none");
        if (off) reduced = [...reduced, ...splitSelectors(rule.selector)];
      });
    });
    for (const one of [...RIGHT, ...LEFT]) expect(reduced, `${one} in the reduce block`).toContain(one);

    /* The four numbers that need the two real boxes are measured, not guessed: the dropdown layer
       writes them from the control it opened on, including when it opens upward. */
    const layer = readFileSync(join(SRC, "components", "ui", "selectMenu.tsx"), "utf8");
    for (const prop of ["--bf-goo-dx", "--bf-goo-y", "--bf-goo-x", "--bf-goo-h"]) expect(layer, prop).toContain(prop);
    expect(layer).toContain("data-bfsel-above");
    expect(layer, "measured against the edge it grows from").toContain(
      "above ? anchor.below - (box.top + box.height) : anchor.above - box.top"
    );
  });

  it("lets a hovered rail icon darken on its own, with no fill and no ring behind it", () => {
    const R = ".hs-shell.bf-shell";
    const hover = declsOf(`${R} .hs-rail-btn:hover`);
    expect(hover.background).toBe("transparent");
    expect(hover.color).toBe("var(--bf-ink)");
    // the ring pulsed out of the pseudo-element; its keyframes are gone with it
    for (const one of [`${R} .hs-rail-btn::before`, `${R} .hs-rail-btn:hover::before`, `${R} .hs-rail-btn:focus-visible::before`]) {
      expect(declsOf(one).animation, one).toBe("none");
      expect(declsOf(one)["box-shadow"], one).toBe("none");
    }
    expect(sheet.toString()).not.toContain("@keyframes hs-rail-ring");
    // a state is not a hover: the open hub keeps its fill and the active page its ink pill
    expect(declsOf(`${R} .hs-rail-slot.open .hs-rail-btn`).background).toBe("var(--bf-hover)");
    expect(
      declsOf(`${R} .hs-rail-btn.active,${R} .hs-rail-btn.active:hover`).background ?? declsOf(`${R} .hs-rail-btn.active`).background
    ).toBe("var(--bf-rail-fill)");
  });

  it("stacks the Dashboard header's lines tight, with its controls in a column of their own", () => {
    /* The Reset / + / Customize stack sits inside the lede's row and is 79px tall against a
       23px lede, so the row was sized by the controls and left a 66px hole above the plan
       line. `display: contents` promotes that row's two children into the header's own grid:
       the text lines share one column, the controls take the next. Read out of the media
       block because that is where the arrangement lives — below it the row is a flex row
       again, where wrapping is right. */
    const wide = sheet.toString().split("@media (min-width: 701px)").slice(1).join("\n");
    expect(wide).toMatch(/\.hs-home-head \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(wide).toMatch(/> \.hs-home-subline \{[^}]*display: contents;/);
    expect(wide).toMatch(/\.hs-home-topline-actions \{[^}]*grid-column: 2;/);
    expect(wide).toMatch(/\.hs-home-topline-actions \{[^}]*grid-row: 2 \/ span 3;/);
    // the controls keep the right edge they already had, and stop pushing the text down
    expect(wide).toMatch(/\.hs-home-topline-actions \{[^}]*justify-self: end;/);
    expect(wide).toMatch(/\.hs-home-topline-actions \{[^}]*margin: 0;/);
    // and centred in that span, which sits them below the greeting's cap line
    expect(wide).toMatch(/\.hs-home-topline-actions \{[^}]*align-self: center;/);
    // one row gap between every line, which is the header's own gap
    expect(declsOf(".app-shell.hs-shell.bf-shell .dash-rx.hs-home .hs-home-head").gap).toBe("10px");
  });

  it("keeps every word of an assistant bubble inside the panel, however long the name", () => {
    /* A bubble is capped at 88% of the thread (80% for a question), but the text was set
       never to break a word on a flex child whose min-width is auto, so one long unbroken
       run forced the bubble past its cap and the panel cut what stuck out. Measured with a
       probe against the real sheet: an answer ran 86px past the thread and a question 121px;
       after these two declarations they sit 14px and 0px inside it, with ordinary prose
       still breaking at spaces. */
    const P = "body:has(.app-shell.hs-shell.bf-shell)";
    const body = declsOf(`${P} .bf-breeze-msg-body`);
    expect(body["min-width"]).toBe("0");
    expect(body["overflow-wrap"]).toBe("anywhere");
    const text = declsOf(`${P} .bf-breeze-msg-body p,${P} .bf-breeze-msg-body ul,${P} .bf-breeze-msg-body li`);
    expect(text["overflow-wrap"] ?? declsOf(`${P} .bf-breeze-msg-body li`)["overflow-wrap"]).toBe("anywhere");
  });

  it("seats the Schedule page's layout controls beside its title, not level with its date", () => {
    /* Reset layout / + / Customize share a flex row with the Schedule's title block and both
       sat at flex-start, which put the controls level with the date pill above the title.
       Aligning the stack to the row's end starts it 10px below the title's cap line, which is
       the Dashboard's own offset from its greeting (section 48b) — centring against this row
       would not match it, because the row also holds the date pill. Above the page's own
       column breakpoint only. */
    const wide = sheet.toString().split("@media (min-width: 721px)").slice(1).join("\n");
    expect(wide).toMatch(/\.sched-board-topline \.hs-home-topline-actions \{[^}]*align-self: flex-end;/);
    expect(wide).toMatch(/\.sched-board-topline \.hs-home-topline-actions \{[^}]*margin-top: 0;/);
  });

  it("opens a dropdown without ringing it, and still rings it for the keyboard", () => {
    /* Asked for: the Schedule's Filters "remove the light gray outline, and anywhere else it
       has it when selecting something — have it just show the drop down". The outline is a
       focus ring, and a ring earns its place for a keyboard user, so section 55 makes it
       keyboard-only rather than removing it: each ringing dropdown gets a rule that restores
       its own resting look while it holds pointer focus.

       Two paths have to be covered. The click itself is `:not(:focus-visible)`. The other is
       the focus the list HANDS BACK when it closes: `select.focus()` is programmatic, and
       Chrome treats programmatic focus on a control that takes keyboard input as focus-visible,
       so the ring came back the moment a choice was made — measured live before the fix at
       `rgba(28, 28, 28, 0.14) 0 0 0 3px`, and at the card shadow after it. selectMenu.tsx
       marks that one focus, and both conditions share a rule here, so a control cannot be
       covered on one path and not the other. */
    const S = ".app-shell.hs-shell.bf-shell";
    const POINTER = [":focus-within:not(:has(:focus-visible))", ":focus:not(:focus-visible)"];
    const HANDBACK = [":focus-within:has(select[data-bfsel-quiet])", ":focus[data-bfsel-quiet]"];
    /** A selector reduced to the control it names, so the two conditions can be compared. */
    const controlOf = (selector: string): string => {
      let out = selector;
      for (const condition of [...POINTER, ...HANDBACK, ":focus-within", ":focus-visible", ":focus"]) out = out.replace(condition, "");
      return out.replace(/\s+/g, " ").trim();
    };

    /* Every rule that restores a resting look covers the same controls on both paths. */
    const covered = new Set<string>();
    let restores = 0;
    sheet.walkRules((rule: Rule) => {
      if (rule.parent?.type === "atrule") return;
      const selectors = splitSelectors(rule.selector);
      const pointer = selectors.filter((one) => POINTER.some((c) => one.includes(c)));
      const handback = selectors.filter((one) => HANDBACK.some((c) => one.includes(c)));
      if (pointer.length === 0 && handback.length === 0) return;
      restores += 1;
      expect(handback.map(controlOf).sort(), rule.selector.slice(0, 80)).toEqual(pointer.map(controlOf).sort());
      expect(pointer.length).toBeGreaterThan(0);
      for (const one of pointer) covered.add(controlOf(one));
    });
    expect(restores).toBeGreaterThanOrEqual(4);

    /* And every ringing dropdown in the sheet is one of them. This is the derivation that
       found what the first pass missed, kept as the guard: a new dropdown that rings on
       `:focus` fails here until it is listed above. Only this sheet is read, because it loads
       last and these rules outrank the older sheets' rings for the same control. */
    const ring = /0\s+0\s+0\s+[\d.]+px/;
    const unguarded: string[] = [];
    sheet.walkRules((rule: Rule) => {
      if (rule.parent?.type === "atrule") return;
      let rings = false;
      rule.walkDecls("box-shadow", (decl) => {
        if (ring.test(decl.value)) rings = true;
      });
      if (!rings) return;
      for (const one of splitSelectors(rule.selector)) {
        if (!one.includes(":focus") || one.includes("focus-visible") || one.includes("bfsel-quiet")) continue;
        if (!/select/.test(one)) continue;
        if (!covered.has(controlOf(one))) unguarded.push(one);
      }
    });
    expect(unguarded).toEqual([]);

    /* The controls the ask named, by way of showing what the section covers. */
    for (const one of [
      `${S} .sched-rx .schedule-select`,
      `${S} .settings-rx .settings-row select`,
      `${S} .settings-rx .settings-role-select`,
      `${S} .schedule-job-create-form select`,
      `${S} .pref-select`
    ])
      expect([...covered], one).toContain(one);

    /* Text fields are left alone on purpose: there a click's ring marks where typing goes. */
    expect([...covered].some((one) => /input|textarea|search/.test(one))).toBe(false);

    /* The list marks only a POINTER-opened handback, so a keyboard user's ring survives —
       measured live: Shift+Tab onto a filter matches `:focus-visible` and paints the ring. */
    const layer = readFileSync(join(SRC, "components", "ui", "selectMenu.tsx"), "utf8");
    expect(layer).toContain('openedWith: "pointer" | "keyboard"');
    expect(layer).toMatch(/if \(current\.openedWith === "pointer"\) focusQuietly\(current\.select\);/);
    expect(layer).toContain('select.dataset.bfselQuiet = "true"');
  });

  /* --cd-* is this sheet's own namespace, so a read with nothing behind it is a typo or a token that
     was never written — and its fallback, picked for light mode, is what dark mode then shows. That
     is how the Month page's weekend days turned light gray in dark mode. */
  it("declares every --cd- token it reads", () => {
    const read = new Set<string>();
    const declared = new Set<string>();
    sheet.walkDecls((decl) => {
      if (decl.prop.startsWith("--cd-")) declared.add(decl.prop);
      for (const match of decl.value.matchAll(/var\(\s*(--cd-[\w-]+)/g)) read.add(match[1]!);
    });
    expect([...read].filter((name) => !declared.has(name))).toEqual([]);
  });

  it("loads last, and the head links the three faces", () => {
    const main = readFileSync(join(SRC, "main.tsx"), "utf8");
    const cssImports = main.split("\n").filter((line) => /^import "\.\/.*\.css"/.test(line));
    expect(cssImports.at(-1)).toContain("app-shell-client-desk.css");
    const head = readFileSync(join(SRC, "..", "index.html"), "utf8");
    // Inter's weight list is the landing page's business and has grown since; the three faces are what the skin needs
    expect(head).toMatch(
      /fonts\.googleapis\.com\/css2\?family=Inter:wght@[\d;]+&family=Inter\+Tight:wght@500;600;700&family=JetBrains\+Mono/
    );
  });

  /**
   * EVERY PAGE IN DARK MODE (asked for 2026-09-18: "now check the other pages in darkmode too").
   * Each page was walked with the shell in dark, measuring every element's own background and the
   * contrast of each run of text against the nearest painted surface behind it. Three pages came
   * back with a light literal in an older sheet that this skin styles the INSIDE of but never the
   * container — so the page stayed light while the ink flipped.
   */
  it("paints the three pages whose own ground was a light literal from the shell's tokens", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    /* The list view was a 642x571 white slab with the day's rows on it in light ink — measured
       contrast 1.11, i.e. nothing readable at all. `--bf-surface` is #ffffff, so light mode is
       unchanged to the byte. */
    expect(declsOf(`body:has(${S}) .sched-rx .schedule-list-view`).background).toBe("var(--bf-surface)");
    /* Reports and Settings were whole PAGES: `#f5f8fb` over 698x1373 with the h1 at contrast 1.04,
       and `#f4f7fb` over 1193x1049. They share one rule because they are the same defect. */
    for (const panel of [".reports-shell .main-panel", ".main-panel.settings-main-panel"]) {
      expect(declsOf(`body:has(${S}) ${panel}`).background, panel).toBe("var(--bf-ground)");
    }
    /* AND NO OTHER `.main-panel` MAY CARRY A LITERAL GROUND. This is the derivation that found
       Settings after Reports was fixed, kept as the guard: the two sheets that paint these pages
       are read for any `.main-panel` rule whose background is a colour literal rather than a
       token, and every one of them has to be answered above. */
    const literals: string[] = [];
    for (const name of ["styles.css", "app-shell-daylight.css"]) {
      postcss.parse(readFileSync(join(SRC, name), "utf8")).walkRules((rule: Rule) => {
        if (!/\.main-panel/.test(rule.selector)) return;
        rule.walkDecls(/^background/, (decl) => {
          if (!/#[0-9a-fA-F]{3,8}|\brgba?\(/.test(decl.value)) return;
          const answered = splitSelectors(rule.selector).some(
            (one) => Object.keys(declsOf(`body:has(${S}) ${one.replace(/^\s*/, "")}`)).length > 0
          );
          if (!answered) literals.push(rule.selector.slice(0, 60) + " => " + decl.value);
        });
      });
    }
    expect(literals, "a page ground painted as a literal needs a token answer above").toEqual([]);
  });

  /**
   * THE ADD-ON PROMPT (asked for 2026-09-18 with a screenshot of "Get Time Cards" standing white,
   * navy-inked and blue-buttoned over a dark page). hs-update-modal.css draws this dialog entirely
   * in literals, and the skin's answer to that was itself fenced to light mode — with the note
   * "it takes the ink, the plum and the accent as LITERALS, since the shell's tokens do not reach
   * it", which was true before `.hs-upd-backdrop` carried a palette of its own. Both halves are
   * fixed: the portal has the dark set, so the literals could become tokens and the fence go.
   */
  it("draws the add-on prompt from tokens, in either mode", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const fence = `body:has(${S}:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))`;
    /* NOTHING about this dialog may be fenced to light again — that is what left it on the base
       sheet in dark mode. Checked whitespace-tolerantly, because prettier wraps long selectors and
       that is exactly how seven fenced rules survived the first pass on section 38. */
    const fencedLeft = sheet
      .toString()
      .split(fence)
      .slice(1)
      .filter((tail) => /^\s*\.hs-(upd|addon)/.test(tail));
    expect(fencedLeft, "an add-on dialog rule fenced to light mode").toEqual([]);
    /* The card itself: its surface had never been restated at all, so `#fff` came through from the
       base sheet even once everything on it had been re-inked. */
    const dialog = declsOf(`body:has(${S}) .hs-upd-dialog`);
    expect(dialog.background, "or the card stays white in dark mode").toBe("var(--bf-surface)");
    expect(dialog.color).toBe("var(--bf-ink)");
    expect(dialog["border-color"]).toBe("var(--bf-line-solid)");
    expect(dialog["box-shadow"]).toBe("var(--bf-shadow-float)");
    // the note box and its icon tile — both were light literals (#f5f6fa on a pale blue edge)
    expect(declsOf(`body:has(${S}) .hs-addon-where`).background).toBe("var(--bf-hover)");
    expect(declsOf(`body:has(${S}) .hs-addon-where`)["border-color"]).toBe("var(--bf-line-solid)");
    expect(declsOf(`body:has(${S}) .hs-addon-where-ico`).background).toBe("var(--bf-surface)");
    // the art tile and the eyebrow carry the information tone, which is PLUM in this product
    for (const part of [".hs-addon-art", ".hs-upd-eyebrow"]) {
      expect(declsOf(`body:has(${S}) ${part}`).background, part).toBe("var(--bf-color-info-wash)");
      expect(declsOf(`body:has(${S}) ${part}`).color, part).toBe("var(--bf-color-info)");
    }
    // the badge disc, and the arrow inside it — without the second one the badge is a solid blob
    const badge = declsOf(`body:has(${S}) .hs-addon-art-badge`);
    expect(badge.background).toBe("var(--bf-ink)");
    expect(badge.color, "the arrow, or the disc reads solid in dark mode").toBe("var(--bf-surface)");
    // the primary pill inverts itself; the secondary takes the panel's ink
    const primary = declsOf(`body:has(${S}) .hs-upd-btn-primary`);
    expect(primary.background).toBe("var(--bf-ink)");
    expect(primary.color).toBe("var(--bf-surface)");
    expect(declsOf(`body:has(${S}) .hs-upd-btn-secondary`).color).toBe("var(--bf-ink)");
    /* and its backdrop is the one scrim, shared with the section picker's — which drew its own
       light value in both modes and dimmed nothing on a dark page */
    for (const veil of [".hs-upd-backdrop", ".bfsp .bfsp-scrim"]) {
      const v = declsOf(`body:has(${S}) ${veil}`);
      expect(v.background, veil).toBe("var(--bf-scrim)");
      expect(v["backdrop-filter"], veil).toBe("blur(var(--bf-scrim-blur))");
    }
  });

  /**
   * THE SECTION PICKER IS ONE OF THE RIGHT PANELS (section 73, asked for 2026-09-18: "change the
   * 'Add a section' page to match the same layout/design as job editing — the animation exactly
   * the same, the layout the same, and anything else you find"). It had been built as its own
   * thing: 600px wide, inset 12px from every edge, 14px on four corners, its own `bfsp-drawer-in`,
   * an 18px Inter title, a 32px square close — and no exit animation at all.
   */
  it("gives the section picker the editing drawer's frame, header, body and both animations", () => {
    const S = ".app-shell.hs-shell.bf-shell";
    const drawer = declsOf(`body:has(${S}) .bfsp .bfsp-drawer`);
    // the frame: the shared width token, docked to the edge, the stage radius on the left pair
    expect(drawer.width, "the same one number as the other panels").toBe("var(--bf-panel-w)");
    expect([drawer.top, drawer.right, drawer.bottom].join(" "), "docked, not inset 12px").toBe("0 0 0");
    expect(drawer["border-radius"]).toBe("var(--bf-radius-stage) 0 0 var(--bf-radius-stage)");
    expect(drawer["box-shadow"]).toBe("var(--bf-shadow-float)");
    expect(drawer.background).toBe("var(--bf-surface)");
    // the arrival is the drawer's, not its own keyframe, and at the panel duration
    expect(drawer.animation).toContain("bfe-drawer-in");
    expect(drawer.animation).toContain("var(--bf-dur-panel)");
    expect(drawer.animation, "bfsp-drawer-in was its own arrival").not.toContain("bfsp-drawer-in");
    /* AND IT LEAVES THE SAME WAY. It had no exit: React unmounted it and it vanished on the frame
       it was closed. Both halves are needed — the CSS below, and the layer in panelExit.tsx that
       puts the copy back for the length of it. */
    expect(declsOf(`body:has(${S}) .bf-panel-exit.bfsp .bfsp-drawer`).animation, "the picker has no way out").toContain("bfe-drawer-out");
    expect(
      readFileSync(join(SRC, "components", "ui", "panelExit.tsx"), "utf8"),
      "the exit layer has to watch for it too, or there is no copy to animate"
    ).toMatch(/const PANELS = "[^"]*\.bfsp/);
    // the header: the drawer's padding, rule, display title and 30px disc
    const head = declsOf(`body:has(${S}) .bfsp .bfsp-head`);
    expect(head.padding).toBe("18px 22px 14px");
    expect(head["border-bottom"]).toBe("1px solid var(--bf-line-solid)");
    const title = declsOf(`body:has(${S}) .bfsp .bfsp-head h2`);
    expect(title["font-family"]).toBe("var(--bf-font-display)");
    expect(title["font-size"], "20px, not the 18px it was set in").toBe("20px");
    expect(declsOf(`body:has(${S}) .bfsp .bfsp-head .bfsp-sub`)["font-size"]).toBe("11.5px");
    const close = declsOf(`body:has(${S}) .bfsp .bfsp-close`);
    expect([close.width, close.height].join(" ")).toBe("30px 30px");
    expect(close["border-radius"]).toBe("50%");
    expect(close.background).toBe("var(--bf-hover)");
    /* the body: the scroller on the drawer's rhythm, and ONE column — at 480px two columns leave
       211px for a card that carries an eyebrow, a title, three lines and a status */
    const grid = declsOf(`body:has(${S}) .bfsp .bfsp-grid`);
    expect(grid.flex).toBe("1");
    expect(grid["min-height"]).toBe("0");
    expect(grid["overflow-y"]).toBe("auto");
    expect(grid.padding, "22px at the foot: this panel has no action bar to carry it").toBe("16px 22px 22px");
    expect(grid["grid-template-columns"], "two columns, kept at the ask").toBe("repeat(2, minmax(0, 1fr))");
    /* AND THE CARD HAS TO BE ALLOWED TO GROW. `.bfsp-card` carries `min-height: 176px` in
       section-picker.css, tuned for the 600px drawer where every description fitted on two lines.
       At 212px most need three: the content wanted 199px inside a box pinned to 176, and with the
       card's overflow visible the "On the board" foot hung 24px BELOW its own border — measured on
       four of them before this line. The grid's rows are `auto`, so the two cards in a row still
       match each other (215/215, 234/234, measured after) and only the row grows. */
    expect(
      declsOf(`body:has(${S}) .bfsp .bfsp-card`)["min-height"],
      "pinned to 176px, the card's own foot falls out of it at this width"
    ).toBe("auto");
    /* and the cards LIST IN like every other panel's rows (section 67), on the same timing —
       longhands, because a shorthand carrying a var() cannot be read back from the CSSOM */
    const row = declsOf(`body:has(${S}) .bfsp .bfsp-grid > *`);
    expect(row["animation-name"]).toBe("bfe-row");
    expect(row["animation-duration"]).toBe("var(--bf-dur-panel)");
    expect(row["animation-delay"]).toBe("calc(var(--bfm-overlay) + var(--bfe-r, 0) * var(--bfm-stagger-icon))");
    expect(row.animation, "no shorthand here, on purpose").toBeUndefined();
    for (const [nth, r] of [
      [2, "1"],
      [5, "4"],
      [7, "6"]
    ] as const) {
      expect(declsOf(`body:has(${S}) .bfsp .bfsp-grid > :nth-child(${nth})`)["--bfe-r"], "row " + nth).toBe(r);
    }
  });
});
