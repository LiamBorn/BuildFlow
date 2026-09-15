#!/usr/bin/env node
/**
 * What the schedule stylesheets actually decide.
 *
 * jsdom has no cascade and Vitest hands a test an empty string for a .css import, so a rule that
 * quietly outranks another cannot be caught by the unit suites — which is how the Matrix came to be
 * unscrollable on a phone for two days while three sweeps called the page fine. This reads the two
 * sheets in their load order, resolves each question the way a browser would (media query first,
 * then specificity, then source order) and fails the build when the answer is not the intended one.
 *
 * Run: npm run check:css
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The order main.tsx loads them in; later wins ties. */
const SHEETS = ["client/src/schedule.css", "client/src/schedule-phone.css"];

/** a,b,c as one number: ids, then classes/attributes/pseudo-classes, then element names. */
function specificity(selector) {
  const cleaned = selector.replace(/::[a-z-]+/g, " ").replace(/\s*[>+~]\s*/g, " ");
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes = (cleaned.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g) ?? []).length;
  const elements = cleaned.split(/\s+/).filter((part) => /^[a-z]/i.test(part)).length;
  return ids * 10_000 + classes * 100 + elements;
}

/** Whether a media condition holds at `width`. Conditions that are not about width are left out. */
function appliesAt(condition, width) {
  if (!condition) return true;
  if (/prefers-|print|hover|pointer/.test(condition)) return false;
  for (const [, max] of condition.matchAll(/max-width:\s*(\d+)px/g)) if (width > Number(max)) return false;
  for (const [, min] of condition.matchAll(/min-width:\s*(\d+)px/g)) if (width < Number(min)) return false;
  return true;
}

/**
 * The parts of one compound: its classes, and the states it asks the element to be in.
 * `.sched-matrix-cell:hover` wants the class and the hover state, both of which an element in a
 * chain can carry — which is the only way to ask what a tooltip does when a cell is hovered.
 */
const wants = (compound) =>
  compound
    .split(/(?=[.:])/)
    .filter((part) => part.length > 1)
    .map((part) => (part.startsWith(".") ? part.slice(1) : part));

/**
 * Does `selector` match the last element of `chain`? Handles descendant combinators of compound
 * class-and-state selectors, which is every selector these questions touch; anything else is
 * skipped and counted.
 *
 * Counted is the point. A selector this cannot model has to be *seen* not to be modelled: before,
 * a `:hover` compound slipped past the skip test and then quietly failed to match anything,
 * which is how the tooltip question came to be asked of a rule that never applied.
 */
let skipped = 0;
function matches(selector, chain) {
  const unmodelled =
    /[>+~[]|::/.test(selector) ||
    /(^|\s)[a-z]/i.test(selector.replace(/[.:][\w-]+/g, "")) ||
    // a state this matcher has no way to express on an element
    (selector.match(/:[\w-]+(\([^)]*\))?/g) ?? []).some((state) => !MODELLED_STATES.has(state));
  if (unmodelled) {
    skipped += 1;
    return false;
  }
  const parts = selector.trim().split(/\s+/);
  let index = chain.length - 1;
  // the rightmost compound must match the element itself, states included
  if (!wants(parts[parts.length - 1]).every((part) => chain[index].includes(part))) return false;
  index -= 1;
  // every ancestor compound must match some ancestor, in order
  for (let part = parts.length - 2; part >= 0; part -= 1) {
    const needed = wants(parts[part]);
    while (index >= 0 && !needed.every((item) => chain[index].includes(item))) index -= 1;
    if (index < 0) return false;
    index -= 1;
  }
  return true;
}

/** States an element in a chain can be put into, so a rule that asks for one can be answered. */
const MODELLED_STATES = new Set([":hover", ":focus", ":focus-visible", ":first-of-type", ":first-child"]);

const rules = [];
let order = 0;
for (const file of SHEETS) {
  const css = fs.readFileSync(path.join(root, file), "utf8");
  postcss.parse(css).walkRules((rule) => {
    const media = rule.parent?.type === "atrule" ? String(rule.parent.params ?? "") : null;
    for (const node of rule.nodes ?? []) {
      if (node.type !== "decl") continue;
      for (const selector of rule.selectors) {
        order += 1;
        rules.push({
          file,
          selector,
          media,
          prop: node.prop,
          value: node.value.trim(),
          // postcss keeps `!important` off the value; weighing it as a normal declaration is how
          // a rule that wins in the browser can lose here
          important: Boolean(node.important),
          order,
          specificity: specificity(selector)
        });
      }
    }
  });
}

/** Longhands a shorthand also sets, so `overflow: visible` is weighed against `overflow-x: auto`. */
const SHORTHANDS = { "overflow-x": "overflow", "overflow-y": "overflow" };

/** The side of a shorthand that lands on `prop`: `overflow: hidden auto` gives y hidden, x auto. */
function sideOf(prop, value) {
  const parts = value.split(/\s+/);
  if (parts.length < 2) return parts[0];
  return prop.endsWith("-x") ? parts[1] : parts[0];
}

/** The declaration a browser would use for `prop` on the element at the end of `chain`, at `width`. */
function winner(chain, prop, width) {
  const shorthand = SHORTHANDS[prop];
  const live = rules
    .filter((rule) => (rule.prop === prop || rule.prop === shorthand) && appliesAt(rule.media, width) && matches(rule.selector, chain))
    .map((rule) => (rule.prop === prop ? rule : { ...rule, value: sideOf(prop, rule.value), from: rule.prop }));
  if (live.length === 0) return null;
  // an important declaration beats every normal one, whatever its specificity
  return live.reduce((best, rule) => {
    if (rule.important !== best.important) return rule.important ? rule : best;
    return rule.specificity > best.specificity || (rule.specificity === best.specificity && rule.order > best.order) ? rule : best;
  });
}

/**
 * Every schedule page carries `gantt-page` — the shared frame puts it there — so a rule written for the
 * Gantt Chart has to say `.gantt-page.hs-index` or it reaches the six board pages too. These are the
 * classes the frame renders on all of them, where the wider reach is the point.
 */
const SHARED_ON_EVERY_PAGE = ["gantt-drawer", "gantt-status", "hs-btn", "sched-undo"];

/** Is this rule about that furniture — either styling it or something inside it? */
function isSharedFurniture(selector) {
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  return classes.some((name) => SHARED_ON_EVERY_PAGE.some((shared) => name === shared || name.startsWith(`${shared}-`)));
}

/**
 * The page root, as the frame really renders it: one element carrying all four classes. Modelling
 * them as separate ancestors made every `.gantt-page …` rule invisible to these questions while
 * applying perfectly well in a browser — the inverse of the assumption the stray check is built on.
 */
const ROOT = ["schedule-page", "page-stack", "sched-rx", "gantt-page"];
const MATRIX = [ROOT, ["schedule-board"], ["sched-matrix"]];
const CREW = [...MATRIX, ["sched-matrix-row"], ["sched-matrix-crew"]];
/** The tooltip with its cell at rest, and the same cell hovered — which is what shows it. */
const TIP = [...MATRIX, ["sched-matrix-row"], ["sched-matrix-cell"], ["sched-matrix-tip"]];
const TIP_HOVERED = [...MATRIX, ["sched-matrix-row"], ["sched-matrix-cell", ":hover"], ["sched-matrix-tip"]];
const WEEK = [ROOT, ["schedule-board"], ["schedule-week-scroll"]];
/* The month grid's three day washes. All three are ONE class on the same element, so
   source order is the whole of the decision between them — which is the only way to
   ask whether a day outside the month still reads as outside it when it is also a
   non-working day. */
const CAL = [ROOT, ["schedule-board"], ["sched-cal"], ["sched-cal-grid"]];
const CAL_OUT = [...CAL, ["sched-cal-cell", "out-month"]];
const CAL_OUT_WEEKEND = [...CAL, ["sched-cal-cell", "out-month", "is-weekend"]];
const CAL_WEEKEND = [...CAL, ["sched-cal-cell", "is-weekend"]];
const CAL_HOLIDAY = [...CAL, ["sched-cal-cell", "is-holiday", "out-month"]];
const CAL_HOVER = [...CAL, ["sched-cal-cell", "is-holiday", "is-addable", ":hover"]];
/* The Gantt bar, whose label now sits OUTSIDE it. The chart root is its own set of classes
   (the frame is not `.hs-index-main`), so this chain is built from what the page renders. */
const GANTT_BAR = [
  ["page-stack", "gantt-page", "hs-index"],
  ["gantt-card"],
  ["gantt-frame"],
  ["gantt-timeline"],
  ["gantt-feature-list"],
  ["gantt-feature-group"],
  ["gantt-feature-row"],
  ["gantt-feature"],
  ["gantt-bar"]
];
// the critical-path band, which both the landing and the chart draw
const LANDING_CPM = [ROOT, ["schedule-control-row"], ["filter-strip"], ["sched-cpm"]];
const CHART_CPM = [["page-stack", "gantt-page", "hs-index"], ["hs-index-main"], ["hs-index-card", "gantt-card"], ["sched-cpm"]];

const failures = [];
/** `check(what, got, want)` where want is a regex or a string. */
function check(what, got, want) {
  const value = got?.value ?? "(nothing sets it)";
  const ok = want instanceof RegExp ? want.test(value) : value === want;
  const from = got
    ? `${got.file} · ${got.selector}${got.media ? ` @media ${got.media}` : ""}${got.from ? ` (via ${got.from})` : ""}`
    : "no rule";
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}: ${value}   ← ${from}`);
  if (!ok) failures.push(`${what}: expected ${want}, got ${value} (from ${from})`);
}

console.log("The schedule stylesheets, resolved the way a browser would:\n");
// A phone has to be able to reach all seven days: the grid scrolls, the crew column stays put.
check("Matrix grid at 375px scrolls sideways", winner(MATRIX, "overflow-x", 375), /^(auto|scroll)$/);
check("Matrix crew column at 375px is pinned", winner(CREW, "position", 375), "sticky");
// A desktop keeps the tooltip that made the grid stop clipping in the first place.
check("Matrix grid at 1280px lets its tooltip out", winner(MATRIX, "overflow-x", 1280), "visible");
// Asked of the properties that actually hide it. It used to be asked about `display`, which no
// rule sets at this width, so the question answered "the initial value" — and would have gone on
// answering that with every tooltip rule in the sheet deleted.
check("Matrix tooltip at 1280px waits out of the way", winner(TIP, "visibility", 1280), "hidden");
check("Matrix tooltip at 1280px appears when its cell is hovered", winner(TIP_HOVERED, "visibility", 1280), "visible");
check("…and is opaque when it does", winner(TIP_HOVERED, "opacity", 1280), "1");
check("Matrix tooltip at 375px is hidden outright", winner(TIP, "display", 375), "none");
// The Week board's scroller is the pattern the Matrix follows.
check("Week board at 375px scrolls sideways", winner(WEEK, "overflow-x", 375), /^(auto|scroll)$/);
check("Week board at 1280px scrolls sideways", winner(WEEK, "overflow-x", 1280), /^(auto|scroll)$/);
// The landing and the chart draw the same band; each keeps its own shape.
check("the landing's critical-path band keeps its own corners", winner(LANDING_CPM, "border-radius", 1280), "14px");
check("the chart's critical-path band keeps its own corners", winner(CHART_CPM, "border-radius", 1280), "12px");

// No rule written for the chart may reach the six board pages by accident.
const strays = rules
  .filter((rule) => rule.selector.includes(".gantt-page") && !rule.selector.includes(".gantt-page.hs-index"))
  .filter((rule) => !isSharedFurniture(rule.selector));
const strayNames = [...new Set(strays.map((rule) => rule.selector))];
console.log(
  `${strayNames.length === 0 ? "ok  " : "FAIL"}  rules reaching all seven pages that are not shared furniture: ${strayNames.length}`
);
if (strayNames.length > 0) {
  failures.push(
    `${strayNames.length} .gantt-page rules are not scoped to .hs-index and are not shared: ${strayNames.slice(0, 6).join(", ")}`
  );
}

/**
 * …and what it is allowed to reach with. The `--hsx-*` tokens are defined on `.hs-index` and on the
 * chart component itself, so on the six board pages they do not exist. A shared rule naming one bare
 * therefore loses the whole declaration there — silently, because an unresolvable `var()` is only
 * invalid at computed-value time, and it outranks the `.sched-rx` rule that would have been right.
 * Every such reference has to carry a fallback: `var(--hsx-line, var(--wx-line))`.
 */
const BARE_CHART_TOKEN = /var\(\s*(--hsx-[\w-]+)\s*\)/;
const unresolvable = rules.filter(
  (rule) => !rule.selector.includes(".hs-index") && isSharedFurniture(rule.selector) && BARE_CHART_TOKEN.test(rule.value)
);
const unresolvableNames = [
  ...new Set(unresolvable.map((rule) => `${rule.selector} { ${rule.prop}: ${rule.value.match(BARE_CHART_TOKEN)[1]} }`))
];
console.log(
  `${unresolvableNames.length === 0 ? "ok  " : "FAIL"}  shared rules leaning on a token the board pages do not have: ${unresolvableNames.length}`
);
if (unresolvableNames.length > 0) {
  failures.push(
    `${unresolvableNames.length} shared rules use a bare --hsx-* token, which the six board pages cannot resolve: ${unresolvableNames.slice(0, 6).join(", ")}`
  );
}

/**
 * …and that a schedule control still shows where the keyboard is.
 *
 * Three rules grouped `:hover` with `:focus-visible` and set `outline: 0`, so the two states
 * were identical and tabbing along a board showed nothing — 65 controls on the Week page alone,
 * including the "+" in every cell. Taking the ring away is only honest when something else draws
 * one, so a `box-shadow` in the same rule counts as a replacement and passes.
 */
const FOCUS_SHEETS = [...SHEETS, "client/src/styles.css"];
const SCHEDULE_SELECTOR = /\.(sched-|schedule-|week-stepper|gantt-|month-|kanban-|matrix-|list-)/;
const ringless = [];
for (const file of FOCUS_SHEETS) {
  const css = fs.readFileSync(path.join(root, file), "utf8");
  postcss.parse(css).walkRules((rule) => {
    const drawsItsOwn = (rule.nodes ?? []).some((node) => node.type === "decl" && node.prop === "box-shadow" && node.value !== "none");
    if (drawsItsOwn) return;
    const removes = (rule.nodes ?? []).some(
      (node) => node.type === "decl" && node.prop.startsWith("outline") && /^(0|none|0px)$/.test(node.value.trim())
    );
    if (!removes) return;
    for (const selector of rule.selectors) {
      if (!selector.includes(":focus")) continue;
      if (!SCHEDULE_SELECTOR.test(selector)) continue;
      ringless.push(`${file} · ${selector}`);
    }
  });
}
console.log(
  `${ringless.length === 0 ? "ok  " : "FAIL"}  schedule controls whose focus ring is taken away and not replaced: ${ringless.length}`
);
if (ringless.length > 0) {
  failures.push(`${ringless.length} schedule rules remove the focus ring without drawing one: ${ringless.slice(0, 6).join(", ")}`);
}

console.log(
  `\n${rules.length} declarations read from ${SHEETS.length} sheets; ${skipped} selectors too complex for this matcher were skipped.`
);
if (failures.length > 0) {
  console.error(`\n${failures.length} stylesheet answer${failures.length === 1 ? "" : "s"} are not what the schedule intends:`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}
console.log("Every answer is the intended one.");
