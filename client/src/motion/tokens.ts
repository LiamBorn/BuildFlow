/**
 * The motion tokens — docs/motion-spec.md §1.
 *
 * Every duration, easing, stagger and distance in the program's motion comes from
 * here. Nothing else writes a raw number: `tests/motion-language.test.ts` already
 * fails the sheet for a literal timing, and `tests/motion-tokens.test.ts` fails
 * this file for drifting from the sheet.
 *
 * WHY THE NUMBERS LIVE IN TWO PLACES AT ONCE. The Dashboard's panels are placed
 * and dragged by an inline `style.transform` (board/panelBoard.tsx) — a framer
 * `motion.div` entrance would fight it, which is the defect already recorded
 * against the deal board's DragOverlay. So panels keep a CSS-keyframe entrance,
 * and these tokens are published to CSS as the `--bfm-*` block in
 * app-shell-client-desk.css §74. `cssVariables()` below is what that block must
 * say; the test compares them character for character, so the sheet cannot drift.
 */

/** Seconds. Framer takes seconds; `ms()` converts for CSS and for `setTimeout`. */
export const DUR = {
  instant: 0.12, // hover colour, icon tint
  fast: 0.22, // buttons, chips, tooltips
  base: 0.4, // standard element entrance
  slow: 0.6, // card / panel entrance
  chart: 0.9, // path draw, bar growth
  count: 1.4, // number count-up
  /**
   * How long the selected pill takes to travel between the options in a group.
   *
   * MEASURED off the reference clip (2026-09-19), tracking the pill's own pixels
   * frame by frame through one Monthly -> Yearly move: it leaves at 3.317s and
   * settles at 3.868s, 47% of the way across at 83ms and 92% at 334ms. Both
   * edges interpolate together, so it changes WIDTH to fit its target rather
   * than sliding at a fixed size, and it never overshoots.
   */
  pill: 0.47
} as const;

/** Cubic-bezier control points. */
export const EASE = {
  /** the primary entrance curve — decelerating, no overshoot */
  out: [0.22, 1, 0.36, 1],
  /** for elements that should feel physical (cards, chips) */
  soft: [0.33, 1, 0.68, 1],
  /** symmetric, for exits and cross-fades */
  inOut: [0.65, 0, 0.35, 1],
  /** bars / values landing */
  bar: [0.16, 1, 0.3, 1],
  /**
   * The pill's travel. Fitted to those measurements rather than chosen: the
   * reference is a spring, which is faster off the line and slower through the
   * middle than any of the curves above. EASE.out is the closest of them and is
   * still about twice as far out, arriving visibly early through the middle of
   * the move.
   */
  pill: [0.3, 1, 0.6, 0.85]
} as const;

/** Seconds between one sibling and the next. */
export const STAGGER = {
  icon: 0.04, // nav icons, rail icons
  char: 0.035, // title character reveal
  card: 0.09, // sibling cards in a row
  row: 0.14, // row-to-row
  bar: 0.055, // bars within one chart
  cell: 0.012 // hex / heatmap cells
} as const;

/** Pixels, except `scale`. */
export const MOTION = {
  rise: 16, // px translateY for entering elements
  riseL: 24, // px for large cards
  blur: 10, // px start blur for the frame + cards
  blurT: 6, // px start blur for text reveal
  scale: 0.97, // start scale for cards
  /** §2.1 asks the shell for its own, gentler scale — 0.985, not the cards' 0.97 */
  frameScale: 0.985
} as const;

/**
 * §3's opening choreography, in seconds from the shell's mount — the reference's
 * order with its gaps tightened, which is the one licence §3 grants: "Keep the
 * order, tighten the gaps." The reference settles at ~3.25s and reads as a
 * showpiece; a tool opened forty times a day settles at ~2.4s.
 *
 * `ROW` is §3's compression note made literal: row-to-row on the board runs at
 * 0.09s, not STAGGER.row's 0.14s, so thirteen panels still land inside the budget.
 */
export const BEAT = {
  frame: 0, // the shell itself
  brand: 0.13, // the word BuildFlow
  navPill: 0.18, // the page you are on, in the rail
  navIcons: 0.22, // the rest of the rail
  topbarRight: 0.3, // search, AI, plan, bookmarks, bell, account
  rail: 0.36, // Settings and the hide arrow, at the rail's foot
  title: 0.44, // the greeting — TextReveal
  controls: 0.56, // the lede and the board controls
  kpi: 0.64, // the Schedule Status band
  kpiCols: 0.7, // its columns, and their count-ups
  board: 0.74, // the panel board's first row
  boardContent: 0.82 // rows, sparklines and charts inside a panel
} as const;

/**
 * The longest a title's character stagger may run in total — §2.4's effect, bounded.
 *
 * The reference's title is the word "Overview": eight characters at STAGGER.char is
 * 280ms and it leads the page cleanly. This program's title is a greeting with a
 * person's NAME in it, so its length is whoever is logged in — "Good afternoon,
 * Alexander" is 24 characters, 805ms of stagger, and the title would still be
 * writing itself while the board landed. Past this budget the per-character step
 * shrinks to fit, so the effect reads the same and the title always leads.
 */
export const CHAR_BUDGET = 0.3;

/**
 * How far an area fill and its dot markers trail the line they belong to — §2.7,
 * "+0.35s behind the advancing line", so the fill arrives under a line already drawn.
 */
export const TRAIL = 0.35;

/**
 * Where a menu, a dialog or a drawer starts its own little cascade — §4's
 * "these are NOT page entrances; keep them snappy". A page opens over about two
 * seconds because it is the whole screen arriving; a menu the pointer just asked
 * for has to be there, so it starts almost at once and steps by STAGGER.icon.
 *
 * Thirteen overlays each had their own pair (60+30, 70+38, 80+40, 80+50,
 * 100+40, 120+70). They are all this pair now, within 20ms of where they were.
 */
export const OVERLAY = 0.07;

/** Row-to-row on the board — §3's compressed `STAGGER.row`. */
export const ROW = 0.09;

/**
 * How long the whole opening runs. §3: "Reference is ~3.6s. Ship at ~2.4s."
 * The chrome's one-per-session class comes off after this, so nothing is left
 * carrying `will-change` once the page has settled (§6).
 */
export const OPENING = 2.4;

/**
 * How far the board's stagger is allowed to run before the rest land together.
 * §4's long-list rule ("the first 12 rows only, then render instantly") applied
 * to a board: past the fold nobody is watching a panel arrive, and waiting for
 * rank 13 would put the settle a second past budget. Three bands is also what the
 * reference itself deals — its dashboard is a strip and two rows.
 */
export const BOARD_RANK_CAP = 2;

/** A reader who asked for less motion gets this, and only this (§1). */
export const REDUCED = { fade: 0.15 } as const;

/** Seconds → the `ms` a stylesheet and `setTimeout` want. */
export const ms = (seconds: number) => Math.round(seconds * 1000);

/** `[0.22, 1, 0.36, 1]` → `cubic-bezier(0.22, 1, 0.36, 1)`. */
export const cssEase = (ease: readonly number[]) => `cubic-bezier(${ease.join(", ")})`;

/**
 * The `--bfm-*` block the sheet must declare, as `name: value` pairs.
 * app-shell-client-desk.css §74 is this, written out; the test compares them.
 */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, seconds] of Object.entries(DUR)) vars[`--bfm-dur-${name}`] = `${ms(seconds)}ms`;
  for (const [name, ease] of Object.entries(EASE)) vars[`--bfm-ease-${name.toLowerCase()}`] = cssEase(ease);
  for (const [name, seconds] of Object.entries(STAGGER)) vars[`--bfm-stagger-${name}`] = `${ms(seconds)}ms`;
  vars["--bfm-rise"] = `${MOTION.rise}px`;
  vars["--bfm-rise-l"] = `${MOTION.riseL}px`;
  vars["--bfm-blur"] = `${MOTION.blur}px`;
  vars["--bfm-blur-t"] = `${MOTION.blurT}px`;
  vars["--bfm-scale"] = String(MOTION.scale);
  vars["--bfm-frame-scale"] = String(MOTION.frameScale);
  for (const [name, seconds] of Object.entries(BEAT)) {
    vars[`--bfm-beat-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = `${ms(seconds)}ms`;
  }
  vars["--bfm-row"] = `${ms(ROW)}ms`;
  vars["--bfm-overlay"] = `${ms(OVERLAY)}ms`;
  vars["--bfm-trail"] = `${ms(TRAIL)}ms`;
  vars["--bfm-opening"] = `${ms(OPENING)}ms`;
  vars["--bfm-rank-cap"] = String(BOARD_RANK_CAP);
  vars["--bfm-reduced"] = `${ms(REDUCED.fade)}ms`;
  return vars;
}
