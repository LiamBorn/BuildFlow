# Screen-by-screen mapping — cluster **field-reporting**

Against the chosen shell concept **"preserve" / Daylight Rail**
(`scratchpad/plan/concept-preserve.md`), with the judges' required grafts from canvas, hybrid and
editorial folded in. Design language source: `DESIGN_TOKENS.md`.

Inventory sources, read in full including both `completenessCheck` blocks:

- `scratchpad/inventory/field-delayiq-reports.json` — 14 screens, 284 information/action/column/
  chart/input items, plus 9 missing screens, 15 missing information items, 11 missing actions,
  5 missing states, 5 corrections.
- `scratchpad/inventory/map-timecard.json` — 19 screens, 280 items, plus 5 missing screens,
  10 missing information items, 5 missing actions, 3 missing states, 5 corrections.

**33 primary screens + 14 seam/mirror screens = 47 mapping entries. 637 items accounted for.**

---

## 0. Three corrections to the brief before anything else

1. **TimeCard has SEVEN tabs, not six.** Time Entry · Labor Cost · Crew & Assignment · Approvals ·
   Integrations · Reporting · Compliance (`TimeCard.tsx:192`, nav `aria-label="TimeCard sections"`).
   The cluster warning says six. Every tab-bar number below is computed on seven.
2. **The locked chrome is five surfaces, not one dialog.** The add-on gate for `map` →
   `map-field-ops` and `timecard` → `time-cards` shows up as: the rail flyout row
   (`.hs-flyout-item.locked` + `CircleArrowUp` + `span.hs-flyout-tip[role=tooltip]`), the Bookmarks
   page tile (`.bm-tile-lock`), the Dashboard TimeCard widget header ("Get TimeCard"), the ⌘K
   palette command, and the `AddOnPrompt` dialog itself — plus the place the gate *ends*, the
   Settings → Billing → Add-ons focused card. All six are mapped (§5.34–§5.39). The gate is
   enforced in **two** places (`openAppPage` App.tsx:2445 and the `setPage` wrapper App.tsx:2278);
   `setPageRaw` is the only ungated setter and must stay that way.
3. **`Reports` is not add-on gated.** `ADD_ON_PAGE_LOCKS` (App.tsx:822) locks only `map` and
   `timecard`; `field`, `delayIQs` and `reports` have no locked state, confirmed by the record's own
   correction. So there are exactly two locked pages in this cluster.

---

## 1. The density translation, for this cluster, with the numbers

### 1a. Carries over LITERALLY — same value, no rescale

Ground `#f5f6fa`, one ground end to end · ink `#1c1c1a` / muted `#575550` / faint `#8a877e` ·
hairlines `rgba(28,28,26,0.13)` and `rgba(28,28,26,0.07)` · card fill `#ffffff` · accent `#2f6bff`,
one · the radius ladder `999 / 26 / 20 / 18 / 12 / 8` **at its own values, not rescaled** · the
seven-step shadow ladder verbatim · `cubic-bezier(0.22,1,0.36,1)` on everything except height/grid
(`cubic-bezier(0.4,0,0.2,1)`) · interaction 0.18/0.25/0.28/0.3s · one-shot reveals that unobserve ·
copy measures in `ch` · Inter, one family · **the four hover moves and no fifth**.

**The eyebrow is the one role that does NOT re-scale.** `11.5px / 650 / 0.045em / uppercase /
#8a877e`, at ×1, everywhere. In this cluster it lands on 23 separate roles, and this single rule
buys more family resemblance than any other line in the file because column heads are the most
repeated text in the product:

| Today | Becomes the ×1 eyebrow |
|---|---|
| `.hs-index .hs-table thead th` — 12.5px/650/0.01em on a `#fafbfd` fill | 11.5px/650/0.045em uppercase `#8a877e`, **fill goes transparent to the ground**, bottom border `rgba(28,28,26,0.13)` |
| `.hs-kpi-label` 11.5px/600 `--hsx-mut` | eyebrow (it is already the right size — it gains tracking, uppercase and the faint ink) |
| `.reports-kpi-card span` 13px/**900**/uppercase `#71839f` | eyebrow (drops from weight 900) |
| `.diq-kicker` 12px/700/0.05em uppercase `#6f7785` | eyebrow (already this role, 0.5px and one weight step off) |
| `.tc-stat` labels, `.tc-card` sub-titles, `.tc-th`, `.tc-class-legend` names | eyebrow |
| `.reports-legend` "Planned"/"Actual", `.tc-legend` swatch labels, `.pr-legend` | eyebrow |
| `.hs-view` counts' container label, the four `.bf-seg` group labels | eyebrow |
| `.pdx-field` dialog eyebrow ("Field update"), `.sv-drawer` metric labels ("Reported", "Planned", "ForecastIQ finish") | eyebrow |
| `.map-filter` captions (Territory / Crew / Equipment Type / Priority / Status), `.lm-meta`'s status half | eyebrow |

### 1b. Gets RE-SCALED for density — with the ratios, stated against the source's own range

| Role | Welcome Page | This cluster | Factor |
|---|---|---|---|
| Page `h1`, operational | hero `clamp(46px,6.8vw,96px)` | `--bf-app-title` `clamp(22px,1.9vw,26px)`/600/`-0.02em`/1.14 | ÷3.7 |
| Page `h1`, **one Brief surface** (Reports only) | — | `--bf-app-brief` `clamp(32px,3.6vw,46px)`/600/`-0.02em`/1.06 | ÷2.1 |
| Section / card head | section h2 `clamp(32px,4.4vw,54px)` | `--bf-app-section` `16px`/600/`-0.01em` | ÷3.4 |
| Dashboard panel `h2` | — | `--bf-app-panel` **`14.5px` FROZEN** (see §4d) | — |
| Figure, operational | stat `clamp(46px,5.4vw,72px)` | `--bf-app-figure` `clamp(20px,1.6vw,26px)`/700/`-0.02em`/`tabular-nums` | ÷2.8 |
| Figure, Brief surface | proof `clamp(42px,4.8vw,60px)` | `--bf-app-figure-brief` `clamp(26px,2.4vw,34px)` | ÷1.8 |
| Lede / subtitle | `clamp(16px,1.35vw,19px)` | `--bf-app-lede` `14px`, `max-width: 62ch` | ÷1.36 |
| Primary cell | body 15–16px | `--bf-app-row-strong` `13.5px`/600 | ÷1.2 |
| Table cell / list row | body 15px | `--bf-app-row` `13px`/500/1.45 | ÷1.2 |
| Secondary / timestamp | — | `--bf-app-meta` `12px` `#575550` | — |
| Eyebrow / column head | 11.5–13px | `11.5px`/650/`0.045em` | **×1** |
| Badge / pill text | — | `--bf-app-micro` `11px` | — |
| Section rhythm | `clamp(76px,12vh,130px)` → 108px @1440 | between top-level sections `--bf-rhythm-dense` `clamp(20px,3vh,34px)` → 27px | ÷4.0 |
| **Bottom tail** | 108px | **72px** (`--bf-space-9`), every page in the cluster | ÷1.5 |
| Card head margin | `0 auto 54px` | `0 0 12px` | ÷4.5 |
| Card hover lift | `translateY(-6px)` | `-4px` (`--bf-lift-dense`), and only where the licence permits | ÷1.5 |

**The ladder is one ladder, and the span is checkable.** Row 13px → operational title 26px is
**2.00×**; row 13px → Brief title 46px is **3.54×**. The Welcome Page's own internal range is
12px → 96px = **8.0×**. So the product's range is *less than half the marketing page's, on one
continuous ladder* — which is the sentence that proves one system at two volumes rather than two
systems. 26px and 46px are both rungs of that ladder, not a second scale.

**The 72px bottom tail is where Welcome-scale air is free**, because nothing competes for space
below the last row of a page. It is the only place in this cluster that gets a marketing-scale
number, and it costs nothing.

### 1c. The measure is carried over, and six boards escape it by name

`--bf-measure-page: 1140px` **is** kept in-app, applied as
`.bf-shell .page-stack > * { max-width: var(--bf-measure-page); margin-inline: auto; }` (pure CSS,
no new DOM, so no query depth changes). Six boards in this cluster genuinely need the width and
escape with `.bf-doc-bleed { max-width: none; }`:

1. `.hs-table-wrap` on Field Updates (10 columns, `min-width: 720px`)
2. `.hs-table-wrap` on DelayIQs (8 columns)
3. `.map-panel.site-grid` (`repeat(auto-fill, minmax(248px,1fr))`, internally scrolled)
4. `.reports-chart-grid` (2 × 260px-tall charts)
5. `.tc-table-scroll` (six TimeCard tables, incl. the 7-column certified-payroll table)
6. `.tc-report-grid` / `.tc-cost-grid` / `.tc-compliance-grid`

Everything else — the composer, the DelayIQ rail column, the variance drawer, the add-on dialog,
the Reports title block and figure row, every empty state, every error — sits inside 1140px, and
every run of prose inside it is capped at `--bf-app-prose: 62ch`.

### 1d. What this cluster does NOT carry over, declared

- **No product-window stage.** No `#faf8ee` stage, no `perspective: 1200px`, no animated mesh. The
  one exception is already in the repo and stays: `components/ui/expand-map.tsx`'s LocationMap card
  is the cluster's only tilting mock, and it keeps its pointer tilt (hover move #4).
- **No gradient trio anywhere in-app in this cluster.** The trio's one licensed in-app use is the
  top-bar AI sparkle, which belongs to the shell, not here. Three gradients die for it *inside this
  cluster*, and they are named in §4f.
- **No 108px rhythm.** 27px between sections plus the 72px tail. Preserve's honest shortfall #3
  stands: this cluster will read *tighter* than the marketing page, not merely smaller.

---

## 2. Shared components and shared classes

Repo recipe, verified against `components/ui/display-cards.tsx`: one file in
`client/src/components/ui/`, plain markup, **inline `style` objects** for anything inlineable, **one
inline `<style>` block** for `::before` / `:hover` / `@media`, shadcn tokens mapped onto `--wx-*`
with literal fallbacks (`var(--wx-blue, #2f6bff)`), the `prefers-reduced-motion` rule *inside* that
same block, and a header comment naming the source and the token mapping. No Tailwind, no `cn`, no
`@/` alias, **no `:where()`** (documented jsdom breaker).

### 2a. Reused, already in the repo — no new file

| Component | Where this cluster uses it |
|---|---|
| `expand-map.tsx` (LocationMap) | Map "Job sites" grid. Re-tokenized only (§5.15). |
| `quantum-cloud-loader.tsx` (CloudLoader) | Field composer dropzone, already wired. Kept. |
| `text-shimmer.tsx` (58 lines) | "Scanning the schedule…", "Checking where the plan stands…", "Finding Route…", "Adding…", "Adding Field Update", "Saving…". One component for every text-only pending state in the cluster. **Zero new files.** |
| `rail-tooltip.tsx` (ported by the shell phase) | Map gear (`aria-label="Map layer: <layer>"`), Traffic and Layers buttons, TimeCard header `Export`, the four `.hs-row-action` pencils, the Reports period select. Bubble stays `aria-hidden` with no role so it can never collide with `[role='tooltip']` queries. |
| `spotlight-surface.tsx` (ported by the shell phase) | The 8 frames that survive the licence, at `--bf-spotlight-a: 0.06`. Never on an element whose `className` is computed. |

### 2b. One new ported component

**`components/ui/scroll-affordance.tsx`** — port of the 21st.dev "Scroll Shadow" pattern.

```tsx
export function ScrollAffordance({
  axis = "x", className = "", children, ...rest
}: { axis?: "x" | "y"; className?: string; children: ReactNode }): ReactNode
```

Wraps a scroller, keeps the child's own `className` untouched (additivity), and paints two
`::before`/`::after` edge fades from `var(--wx-bg)` to transparent whose opacity is driven by
`scrollLeft`/`scrollWidth` on a rAF-throttled `scroll` listener. Reduced motion: fades are static
(present or absent), never animated.

Needed because this cluster has **four scroll containers with no affordance at all**, all recorded:
`.tc-tabs` (7 tabs, `overflow-x:auto`, `white-space:nowrap`), `.tc-table-scroll` (six tables),
`.hs-table-wrap` (720px-min tables), `.map-panel.site-grid` (`overflow:auto`, no `tabindex`, so a
keyboard user can only move it by tabbing card to card). The site grid additionally gets
`role="region"` + `aria-label="Job sites"` (it already has that label) + `tabindex="0"` **only when
it actually overflows**, measured by `ResizeObserver` — the exact pattern the Dashboard already
solved with `DashBlockBody`.

### 2c. Shared classes, all additive, all in the one new stylesheet

Everything lands in `client/src/app-shell-daylight.css` under the `.bf-shell` scope (one word to
revert). No file is reordered in `main.tsx`; one import is appended after
`app-shell-hubspot.css`.

| Class | Recipe | Replaces (by adding to, never renaming) |
|---|---|---|
| `.bf-eyebrow` | `11.5px/650/0.045em/uppercase/#8a877e` | the 23 roles in §1a |
| `.bf-figure` / `.bf-figures` | figure cell on the ground: no border, no shadow, no radius; eyebrow label, `--bf-app-figure` value with `tabular-nums`, `--bf-app-meta` caption; cells separated by a `1px rgba(28,28,26,0.07)` vertical hairline that becomes a horizontal one below 640px | `.hs-kpi` ×8, `.reports-kpi-card` ×6, `.tc-stat` ×4, `.tc-dash-card` ×6, `.ss-strip-fact` ×3, `.tc-cost-tile` ×4 |
| `.bf-card` | `#fff`, `1px solid rgba(28,28,26,0.07)`, radius **18px**, `--bf-shadow-card`, `padding: 20px 22px 18px`, head margin `0 0 12px`; `overflow: hidden` when it wraps a table so rows clip to the corner | the 8 licensed frames only |
| `.bf-stage` | radius **26px**, `--bf-shadow-stage` | `.hs-upd-dialog.hs-addon-dialog`, `.pdx-dialog.pdx-field` |
| `.bf-table` | `th`/`td` **height 46px frozen**, `thead th` **42px frozen**, `thead th` = `.bf-eyebrow` on transparent, `td` `--bf-app-row`, primary cell `--bf-app-row-strong`, `tbody tr:hover` `rgba(28,28,26,0.035)` over `0.18s var(--bf-ease)`, `tr.is-selected` `rgba(47,107,255,0.06)`, sticky `thead` on **opaque `#fff`** (never `backdrop-filter`) | `.hs-table`, `.tc-table`, `.reports`-side tables, `.diq-table` |
| `.bf-seg` | pill segmented control, radius 999px, 11.5px eyebrow items, **inverts** to ink on `[aria-pressed=true]` / `.active` | `.hs-views`, `.tc-tabs`, `.tc-seg` ×3, `.hs-home-seg`, `.map-live-toggle`, the goal chips, the approval filter, the breakdown pivot |
| `.bf-pill` / `.bf-pill-primary` | outline pill that inverts / solid `#2f6bff` pill, both `999px`, `13px/600`, `padding 8px 16px` | `.hs-btn`, `.hs-btn-primary`, `.tc-btn`, `.primary-button`, `.outline-button`, `.cc-btn`, `.sv-accept`/`.sv-reject`, `.diq-notify` |
| `.bf-meter` | one bar recipe: 6px track `rgba(28,28,26,0.07)`, radius 999px, **flat fill** in the semantic tone, width transitions `0.55s var(--bf-ease-size)` | `.hs-progress`, `HoursBar`, `.tc-budget-bar`, `.reports-efficiency-fill`, `.fud-impact-fill` (marketing keeps its own) |
| `.bf-tone-<t>` | 10%-alpha fill + the tone as text + no border, for badges/pills | `.badge`, `.hs-badge`, `.cc-sev-*`, `.sv-sev-pill`, `.tc-pill`, `.diq-sev` |
| `.bf-prose` | `max-width: var(--bf-app-prose)` = `62ch` | every empty state, error, hint, footnote, tooltip body |
| `.bf-doc-bleed` | `max-width: none` | the six boards in §1c |
| `.bf-locked` | the locked-chrome language (§5.34) | `.hs-flyout-item.locked`, `.bm-tile-lock`, `.tc-dash-open.locked`, the palette row |

**Class-name additivity is a review gate.** The new stylesheet and any new wrapper **adds** a class
and never replaces a pinned one:

```jsx
<div className="hs-kpis bf-figures">      <div className="hs-kpi bf-figure">
<div className="reports-kpi-grid bf-figures">   <article className="reports-kpi-card bf-figure">
<table className="hs-table bf-table">     <nav className="tc-tabs bf-seg">
```

and the `bf-` side zeroes the inherited border/radius/shadow. Pin list for this cluster, shipped as
a comment block at the top of the new stylesheet:

`.hs-index-card` · `.hs-index-title` · `.hs-table` · `.hs-row-action` · `.hs-views` / `.hs-view` /
`.hs-view-count` · `.hs-empty` · `.hs-progress` / `.hs-progress-track` · `.hs-thumbs` ·
`.hs-count-pill` · `.hs-pagination` / `.hs-page-btn` · `.cc-panel` · `.cc-approval` /
`.cc-appr-top` / `.cc-appr-main` / `.cc-appr-side` / `.cc-appr-actions` / `.cc-appr-error` ·
`.cc-sev-*` · `.cc-rec` / `.cc-rec-ico` / `.cc-rec-btn` · `.hs-home-seg` · `.hs-home-empty` ·
`.hs-split-tag` · `.sv-drawer` / `.sv-sev-pill` / `.sv-photo` / `.sv-late` / `.sv-early` /
`.sv-impact-critical` / `.sv-ripple` · `.fp-raised` / `.fp-drift` · `.diq-panel` / `.diq-count` /
`.diq-expand` / `.diq-notify` / `.diq-critical` / `.diq-crit-tag` / `.diq-clear` / `.diq-loading` /
`.diq-error` · `.reports-kpi-card` / `.reports-kpi-basis` / `.reports-efficiency-row` ·
`.ss-strip` / `.ss-strip-figure` / `.ss-delta` / `.ss-failed` / `.ss-empty` ·
`.map-panel.site-grid` / `.map-site-empty` / `.map-site-legend` · `.lm-card` / `.lm-surface` /
`.lm-card.is-selected` · `.trucker-route-result` / `.trucker-suggestions` ·
`.map-today-jobs-panel` / `.map-field-updates-panel` / `.map-weather-card` ·
`.tc-page` / `.tc-tabs` / `.tc-chain` / `.tc-chain-step` / `.tc-ot` / `.tc-under` / `.tc-empty` /
`.tc-row-new` / `.tc-dash-card` / `.tc-dash-open.locked` · `.pdx` / `.pdx-dialog` / `.pdx-field` /
`.pdx-add-role` / `.pdx-note` · **and every `[data-tutorial-id]`**:
`field-page-title`, `delayIQs-page-title`, `reports-page-title`, `schedule-status-band`,
`map-page-title`, `timecard-page-title`, `nav-field`, `nav-map`, `nav-delayIQs`, `nav-reports`,
`nav-timecard`.

---

## 3. The counted boundary audit for this cluster

**The two-clause card licence, as written, grep-checkable:** a white bordered rectangle is licensed
only if **(1)** its boundary is itself interactive — draggable, resizable, dismissible, expandable —
or **(2)** it is a viewport clipping a scrolling world. Nothing else earns a frame; everything else
becomes a titled section on the flat `#f5f6fa` ground, separated by an eyebrow head, a
`rgba(28,28,26,0.07)` hairline and 27px of rhythm.

| Page | Resting boundaries today | After | Licensed frames, and under which clause |
|---|---|---|---|
| Field Updates | **7** (4 KPI tiles, index card, composer card, dropzone) | **2** | index card *(2 — clips the 720px-min table and its sticky thead)*; dropzone *(1 — `role=button`, drop target, `.dragging` state)*. Conditional: each attachment tile *(1 — has an X remove)* |
| DelayIQs | **9** (4 KPI tiles, index card, 4 rail panels) | **2** | index card *(2)*; early-warning panel *(2 — clips the revealed downstream chain table, which gains `ScrollAffordance`)* |
| Reports | **10** (6 KPI cards, 2 chart cards, efficiency card, status strip) | **0** | none earns one. Reports becomes the cluster's flattest surface — and its Brief register (§1b) is what carries it instead. This is the largest single change in the cluster and the safest place to make it: the record confirms *"NO test asserts any of the six KPI labels, either chart, the basis lines or the Crew Efficiency rows."* |
| Map & Field Ops | **7** (site-grid panel, weather, route, travel, today's-jobs, field-updates, footer) | **1 + N** | site-grid panel *(2 — `overflow:auto` over an `auto-fill minmax(248px,1fr)` grid)*; **each LocationMap card** *(1 — `role=button`, `aria-expanded`, animates 140↔280px)* |
| TimeCard (busiest tab, Labor Cost) | **9** (4 stats, 5 cards) | **2** | the breakdown-table card and the rates card *(2 — both wrap `.tc-table-scroll`)*. Across all seven tabs: 6 of 24 cards keep a frame; the other 18 become sections |
| **Cluster total** | **42** | **7 + N cards** | six of the ten retired boundary species are meaningless: the KPI tile, the read-only rail panel, the chart card, the composition card, the integration card, the audit-trail card |

Frames that lose their boundary keep their class and their `overflow`/`min-width` behaviour; only
`border`, `border-radius`, `box-shadow` and `background` are zeroed from the `bf-` side. Nothing
moves in the DOM.

**Three consequences, stated:**

- `.delayIQ-rx .panel:hover` lift (delayIQs-redesign.css:603), `.field-rx .field-entry-card:hover`
  lift (:321), `.field-rx .crew-directory-card` lift, `redesign.css:304-343`'s `-2px` lift on
  `.reports-card` / `.reports-chart-card` / `.reports-efficiency-card` / `.reports-kpi-card` /
  `.field-entry-card` / `.field-update-directory-card`, and `.tc-dash-card`'s `-2px`
  (timecard.css:1413) and `.tc-btn`'s `-1px` (timecard.css:57) all **go away on non-navigating
  surfaces**. Lift is for cards that navigate. This is a declared visible change.
- `redesign.css:305-340` uses `border-radius: var(--r-md) !important` on
  `.map-today-jobs-panel`, `.map-field-updates-panel` and `.map-weather-card`. Those three frames
  are retired, so that rule is **edited in place** to drop both the `!important` radius and the
  hover-lift — otherwise no new radius token can ever take effect on them. This is the one edit
  outside the new stylesheet that the boundary audit forces.
- The `.hs-kpi-ico` 34×34 chip and its **six tones stay** (`tone-blue|green|violet|amber|red|orange`,
  chip radius 8px → 12px). The chip is the figure's visual anchor once the tile's frame is gone, and
  its tone carries information (the DelayIQed chip flips red above zero). See §4f on why status tone
  is exempt from the accent budget.

---

## 4. Cluster-wide rules

### 4a. Reveals — the arithmetic, and where they are forbidden

A 30px shift on a 46px row moves it 65% of its own height, and at 1s the page is still settling
when the eye arrives. So in-app:

```
--bf-app-reveal-shift:   12px
--bf-app-reveal-dur:     0.55s
--bf-app-reveal-stagger: 50ms
```

attached to **sections, never rows or cells**, budget **six per page**. `useHudMotion.ts` is
corrected to the documented contract: `threshold: 0.12 → 0.16`, `rootMargin: '0px 0px -5% 0px' →
'0px 0px -6% 0px'` (one line, ten page roots, no test).

| Page | Reveals | Which |
|---|---|---|
| Field Updates | 3 | figure row · index card · composer section |
| DelayIQs | 6 (at budget) | figure row · index card · early-warning · Log DelayIQ · Categories · Impact ForecastIQ |
| Reports | 6 (at budget) | title block · status strip *(already emits `data-reveal`)* · figure row · chart 1 · chart 2 · efficiency |
| Map & Field Ops | **0** | declared: every panel below the command bar is conditionally mounted or immediately manipulated |
| TimeCard page | **0** | declared, and it is a **bug guard**, see below |
| Dashboard mirrors | unchanged | the five `[data-reveal]` sections keep the Dashboard's own system |

**The tab-key trap — the same class of bug canvas found in Settings, and it is live here.**
`useHudMotion`'s reveal effect has deps `[rootRef]` only and never re-queries after a keyed
remount, while the CSS rest state is `opacity: 0`. So:

- **TimeCard tab bodies must NEVER become `data-reveal`.** They are keyed by the single `useState`
  tab value with no URL persistence; a reveal attribute on a tab body would leave every tab after
  the first permanently blank, with no error.
- Same prohibition on the Map's `More Filters` strip, the weather drawer, the inline job editor, the
  trucker suggestion listbox, the Approvals card list (re-filtered by the segmented control) and the
  `.fp-raised` banner (`role="status"` — it must appear *instantly*, never fade).
- **Reports is the mirror-image trap.** `ScheduleStatusBand` already emits `data-reveal` and today
  no observer runs on this page; it renders visible only because the `opacity:0` rule is scoped
  `.field-rx.dx-ready [data-reveal]` / `.delayIQ-rx.dx-ready [data-reveal]` and Reports has no `.rx`
  class. Giving Reports reveals therefore means **both** halves in one commit: call `useHudMotion`
  *and* scope the rest state as `.reports-rx.dx-ready [data-reveal]`. If the hook is ever removed
  the class never lands and nothing goes invisible. Adding the CSS without the hook blanks the band.
- `.reports-rx` is a **scope class only** — no `.dx-bg`, no `.dx-aurora`, no `.dx-cursor` markup is
  added to Reports.

`data-reveal` goes on **static classNames only**. `.lm-card`, `.dash-block`, the approval cards and
`.tc-row-new` all take dynamic classes and are permanently excluded (documented repo trap: a dynamic
className wipes the imperatively-added `.in`).

### 4b. The four hover moves, assigned

| Move | Where in this cluster |
|---|---|
| **1. Lift** `translateY(-4px)` + `--bf-shadow-card-hover` | only cards that navigate: the Bookmarks tiles for Map/TimeCard. **Nothing else in this cluster lifts.** |
| **2. Invert** outline → ink fill | every `.bf-seg` (saved-view tabs ×9, the 7 TimeCard tabs, breakdown pivot ×4, approval filter ×4, optimization goal ×3, approval view ×2, traffic toggle, live-tracking toggle), every `.bf-pill` (`Keep the plan`, `Not now`, `Cancel`, `See resolved`, `Export`, `Sync now`, `Request correction`, `Statement of compliance`, `Add Field Update` in the map panel) |
| **3. Slide** `translateX(3px)` | every directional link and its glyph: `View all` ×7, `View all approvals on the schedule page`, `View all early warnings`, `View all project alerts`, `View all field updates`, `Open field updates`, `Advanced filters` / `Clear filters`, `Review <title>`, `See what it pushes (n)` chevron, `Accept → schedule`, pagination `Prev`/`Next` chevrons, the `.hs-index-title` chevron, `Purchase in Billing`, `Add to plan`, the row pencil |
| **4. Tilt** pointer-driven `--rx`/`--ry` | **LocationMap only** — the cluster's one product-mock surface. Everywhere else the re-scaled substitute is `spotlight-surface` at `--bf-spotlight-a: 0.06`, on the 7 licensed frames. Menu rows keep the 2–3px `translateX` nudge. |

### 4c. Hover-reveal and focus-only controls are rescued, not restyled

- **`.hs-row-action` pencil** (hs-index.css:781-801) is `opacity: 0` until `tr:hover` or its own
  `:focus-visible`, with `@media (hover:none)` forcing it visible. That existing rule stays **and**
  gains `@media (max-width: 1023px) { opacity: 0.55 }`, so a tablet-width pointer user sees the
  control exists. Its default `:hover` tone is **red** and only `.edit` turns blue — but every
  pencil in this cluster *is* `.edit`, so the red variant renders nowhere here; it is left alone.
- **`.hs-flyout-tip`** (the add-on tooltip, `role="tooltip"`, `aria-describedby`) fires on
  **`:focus-within` as well as `:hover`**. Today the locked Map row's explanation is unreachable by
  keyboard and on touch, so the `AddOnPrompt` arrives with no preceding explanation.
- **LocationMap's "Click to expand" hint** animates in only when `isHovered && !isExpanded`. It
  gains `:focus-visible` as a second trigger. The missing "Click to collapse" copy is a **proposed
  addition** (§6), not a silent one.
- **The composer's silent submit gate** (disabled unless a project is set and the note is ≥3 chars,
  and while `isReadingFiles`) gets a `--bf-app-meta` hint in the button's own row, not a new error
  channel — see §5.2.

### 4d. Frozen literals — the density allowlist's declared exceptions

`density.test.ts` (grafted from hybrid, implemented with the `?raw` glob
`import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw' })` that `schedule/boundary.test.ts`
already uses) reads the new stylesheet raw, parses its blocks, and **fails the build** if a
`font-size` literal appears that is not a `--bf-app-*` token, or if any new selector renames rather
than prefixes an existing one. Colour, radius, shadow, easing, hover and reveals are mechanically
unable to be scoped per-page at all: the allowlist is *"these are the only tokens any app scope may
re-declare."*

These literals are the declared exceptions, each with the coupling that freezes it:

| Literal | Why it cannot move |
|---|---|
| `.hs-table th/td` **46px**, `thead th` **42px** | sets rows-per-screen and the sticky-header offset |
| `.hs-table` `min-width: 720px` + `.hs-table-wrap` overflow | without it a `nowrap` 10-column table blows the card to ~1900px |
| `.dash-block h2` **14.5px** | `hs-home.css:1233`'s `top: -3px` on the drag handle is calibrated to the 17px head row that 14.5px/650 produces. Change the size and every drag handle on the board drifts. |
| LocationMap **140px / 280px** framer heights | the card body is absolutely positioned inside them; a type or padding change clips |
| `--lm-fill` alpha on the 6 buildings | they carry fill alpha in a custom property *precisely because* framer animates `opacity` on mount. Moving them back to `opacity` makes them flash or vanish. |
| `minmax(248px, 1fr)` site-card grid | the card's internal layout is designed to that width |
| recharts heights **260 / 220 / 180 / 40** and domains **[0,6500] / [0,8200] / [1200,1800] / [0,1.1]** | fixed pixel heights and fixed Y domains; the domains clip if seeded data changes |
| `.hs-kpi-ico` **34×34**, `.hs-thumbs` thumbs **28×28** | icon optical sizes |
| `DASH_COLS 6 / DASH_ROW_UNIT 40 / DASH_GAP 16` + `grid-auto-rows: 40px` | users hold layouts in `dash:layout` |

### 4e. Backdrop-filter is licensed on the top bar only

The tutorial spotlight draws its scrim as a **9999px `box-shadow`**, and any new containing block
above a spotlit element mis-places the light. This cluster has five spotlit anchors
(`field-page-title`, `delayIQs-page-title`, `reports-page-title`, `map-page-title`,
`timecard-page-title`) plus `schedule-status-band`. So:

- **No `backdrop-filter` anywhere in this cluster.** The sticky `.hs-index-rail` (`top: 74px`), the
  sticky `.hs-table thead`, the `.tc-tabs` bar and the map command bar all use **opaque
  `var(--wx-bg)` or `#fff`**. The ground is flat, so a blur would buy nothing there anyway.
- No new `transform`, `filter`, `contain` or `will-change` on any ancestor of a `[data-tutorial-id]`
  element. That rules out putting `spotlight-surface` (which uses no transform, only a `::before`
  gradient — safe) on the *page root* of the map, whose `data-tutorial-id="map-page-title"` sits on
  the whole `page-stack`.
- `.field-rx` / `.delayIQ-rx` keep `isolation: isolate` and `overflow: clip`, which is exactly why
  the edit dialog is portalled to `document.body`. **Anything new that needs a fixed overlay on
  these two pages must be portalled too.**

### 4f. Gradients forced flat, and the accent budget as a count

Three gradients die in this cluster so the trio can stay spent on exactly its sanctioned uses:

1. **`.hs-progress` track** — the Field Updates row progress meter. Flat `rgba(28,28,26,0.07)`
   track, flat tone fill (`.bf-meter`).
2. **`.primary-button`** — used by the field composer, `Add DelayIQ`, `Add ForecastIQ`,
   `Create Traffic Route`, `Optimize Routes`. Flat `#2f6bff`.
3. **`.tc-btn.primary` / `.tc-week-chip`'s `var(--navy)` fill** — flat ink `#1c1c1a` on the chip,
   flat accent on the primary. (The Settings `.sx-dot` is the shell phase's third.)

And the leftover from the pre-blue era, found while doing it: **`--shadow-accent`'s
`rgba(251,133,0,…)` orange**, plus its live descendant in this cluster — TimeCard's chart series
`#fb8500` (used in 4 charts: Integrations bars, Reporting line, Reporting area, the dashboard
sparkline) and `#0a233a` navy. Those two re-base to **ink `#1c1c1a` = planned/baseline** and
**accent `#2f6bff` = actual**, matching what Reports already does. This is an edit in
`TimeCard.tsx`, not CSS — the record's own risk flags it.

**Accent budget, expressed as a count and actually enforced:** *at most one blue element per region
that is not carrying a status semantic.*

- **Exempt, because they are information:** the six `.hs-kpi-ico` tones, the ten job-status badge
  tones, the three severity tones, the `.fp-drift` behind/ahead/on chip, the traffic
  Light/Moderate/Heavy tone, the `.sv-late`/`.sv-early` pair, `.tc-ot`/`.tc-under`, the four
  classification tones, the three lien-waiver tones, and the five `mapSiteAccent()` legend colours.
  These are governed by the tone map, not the budget, and they all keep their meaning.
- **Enforced against:** the `.hs-page-tag` "New" pill and any release tag on these five pages; the
  `.hs-flyout-star` gold `#f0b354`/`#e8a33d` → `#2f6bff` (the shell phase's declared change, and it
  reaches this cluster because Field Updates, Map, DelayIQs, Reports and TimeCard can each be
  bookmarked from their hub flyout); the violet `#a78bfa` "Beta" → `#6d28d9`.
- **The two blues that are bugs, not decisions** (§6.3): `--tc-amber: #0b4ae8` and the
  `.badge.delayIQed` case mismatch.
- **`--wx-amber: #0032b0` stays exactly as it renders today** (decision #3). In this cluster it
  drives the Field Updates "Ready to Start" badge and amber progress track, the DelayIQ Medium
  severity badge, and the variance card's Medium severity pill. Against a paper chrome those dark
  blues sit next to `#2f6bff` and become *more* visible, not less — preserve's shortfall #7. The
  mitigation that respects the decision without touching the token: every badge and pill in this
  cluster moves to `.bf-tone-*` (a 10%-alpha fill with the tone as **text**), so a `#0032b0`
  "Ready to Start" and a `#2f6bff` solid primary button can never share a fill weight and can never
  be mistaken for each other.

### 4g. The light-chrome hairline needs verifying, not asserting

Every proposal treats the light-chrome flip as pure gain. The quiet part: a light bar on a light
ground deletes the app's only strong *"I am inside the workspace"* colour anchor, leaving one
`rgba(28,28,26,0.07)` hairline plus a `blur(14px)` to carry the whole state distinction. This
cluster inherits that risk and adds one of its own: **the Reports page has its own shell
(`reports-shell`, `grid-template-columns: 260px / 72px`, `#f5f8fb`, `--hs-paper`) and its own
top-bar mode with duplicated element ids** (`reports-notifications-panel`,
`reports-account-menu`). Under one flat ground those two shells become visually identical, and the
only remaining signal that Reports is a different shell is a duplicate DOM id. **Action:** verify
the hairline on an uncalibrated monitor before merge, and file the `reports-shell` collapse as a
shell-level question (§8), not a page-level edit.

### 4h. Reduced motion — extend, do not reinvent

Ten `@media (prefers-reduced-motion: reduce)` blocks exist. This cluster:

- **Extends** `field-updates-redesign.css:901-917`, `delayIQs-redesign.css:681-695`,
  `field-variance.css:294`, `expand-map.css:316`, `production-reports-redesign.css:315`,
  `field-updates-delayIQs-redesign.css:303-316` in place.
- **Adds the two blocks that do not exist**: `delayiq.css` has **no** reduced-motion block at all
  (348 lines) and neither does `timecard.css` (1515 lines). So the `.spin` keyframe
  (styles.css:13647-13655) keeps rotating for users who asked for no motion — in the early-warning
  "Scanning the schedule…" loader **and** the per-card notify spinner. Both get nulled, and
  `tcRowIn` (timecard.css:644, the only CSS keyframe in the whole Map/TimeCard area) is nulled to
  an instant tone change.
- **Adds the gate nobody has**: LocationMap's framer-motion springs are **not** reduced-motion
  gated — the tilt, the 140↔280 height spring, the road draw-on, the 6-building stagger, the pin
  drop, the count fade, the coords slide, the accent rule and the live-chip scale all run. Fix is a
  `usePrefersReducedMotion()` read inside `expand-map.tsx` that sets every `transition` to
  `{ duration: 0 }` and skips the road/building/pin entrance entirely (the card renders in its final
  state). `expand-map.css:316` continues to handle the CSS half.
- Amplitude tokens (`--bf-lift-dense`, `--bf-slide`, `--bf-press-scale`, `--bf-spotlight-a`,
  `--bf-app-reveal-shift`) already zero in `design-tokens.css`'s reduce block, so anything reading
  them degrades for free. **No eleventh pattern.**
- Every keyframe **keeps its name** (`hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping`,
  `hs-top-*`, `hs-pop`, `hs-flyout-in`, `dx-pulse`, `sv-drawer-in`, `tcRowIn`, `spin`,
  `hs-upd-pulse`, `fud-shimmer`) because the existing reduce blocks null them **by name** and a
  rename silently un-nulls them. Values change; names do not.

---

# 5. The screens

## 5.1 Field Updates — KPI strip + index card

- **Today:** `page-stack field-updates-page field-rx hs-index` (App.tsx:37487). Four bordered KPI
  tiles over one 14px-radius white index card holding every field report as a checkbox table row,
  with saved-view tabs, search, three quick filters, five sortable columns, selection, paging and a
  CSV export. Rows are click-to-correct.
- **Becomes:** the page keeps its `.field-rx` bleed (`-22px -28px -34px`), its three 50px-blur
  auroras and `.dx-cursor`, and gains `padding-bottom: 72px`. Three sections at 27px rhythm on the
  flat ground:
  1. **Header** — `h1.hs-index-title` moves out of the card to the top of the page at
     `--bf-app-title` `clamp(22px,1.9vw,26px)`/600/`-0.02em`/1.14 in `#1c1c1a` (was 22px/650 in
     `--hsx-ink #14203a`, the third ink), keeping `data-tutorial-id="field-page-title"` and its
     inline 26px chevron button (radius 6px → 12px). `.hs-page-tag` gains the one unscoped rule
     that fixes it everywhere.
  2. **Figure row** — `<div className="hs-kpis bf-figures">`, four `.hs-kpi.bf-figure` cells, no
     frames, separated by `1px rgba(28,28,26,0.07)` verticals; stacks to one column below 640px.
  3. **Index card** — the one licensed frame (clause 2): `.bf-card`, radius 14px → **18px**, border
     `#e6e8f0` → `rgba(28,28,26,0.07)`, shadow `0 1px 2px rgba(20,32,58,.04)` →
     `--bf-shadow-card`, padding `18px 22px 16px` → `20px 22px 18px`, plus `overflow: hidden` so
     the first and last rows clip to the corner. It carries `.bf-doc-bleed`, keeps
     `aria-labelledby="field-index-title"`, and its `.hs-table-wrap` is wrapped in
     `<ScrollAffordance axis="x">`.
  - Shared components: `.bf-figures`/`.bf-figure`, `.bf-card`, `.bf-table`, `.bf-seg`, `.bf-pill`,
    `.bf-pill-primary`, `.bf-tone-*`, `.bf-meter`, `.bf-eyebrow`, `ScrollAffordance`,
    `spotlight-surface` on the card, `rail-tooltip` on the row pencil.
- **Every information item placed (21 of 21):**
  - **(1–4)** The four KPI tiles — *Total Updates* (blue `ClipboardList`), *On Site* (green
    `MapPin`), *DelayIQed* (`AlertTriangle`, **tone still flips red above zero and green at zero**),
    *With Photos* (violet `ImagePlus`) — become four `.bf-figure` cells: 34×34 `.hs-kpi-ico` chip
    (radius 12px, tone fill kept), label as the **×1 eyebrow**, count at `--bf-app-figure`
    `clamp(20px,1.6vw,26px)`/700/`tabular-nums`.
  - **(5)** H1 + trailing `ChevronDown` (`aria-label="Show all field updates"`, `title="All
    updates"` — both kept) → the page header above the card.
  - **(6)** The five saved-view tabs with their `.hs-view-count` counts → `.hs-views.bf-seg`: pill
    strip, item text at the eyebrow, count in a `--bf-app-micro` 999px chip at
    `rgba(28,28,26,0.05)`, **active tab inverts to ink** (`#1c1c1a` fill / `#fdfcf9` text). All five
    names, all five icons and all five counts unchanged.
  - **(7)** Toolbar right readout `<filtered> of <total>` → `--bf-app-meta` `#575550`, right-aligned
    in the toolbar row.
  - **(8)** Sort chip label `Sort by <key>` (all five keys: posted · status · progress · project ·
    reporter) → `.hs-chip.bf-pill`, eyebrow text, chevron 13px that keeps its 180° rotate on a
    descending posted sort.
  - **(9)** Filter chip `Filter` / `Filter · <n>` → the same pill; the `· n` count in the accent.
  - **(10)** Reporter avatar, 2-letter initials, tone-coloured by status (DelayIQed red / Ready to
    Start amber / Complete green / else blue) → 28px `50%` avatar, `--bf-app-micro`/700, tone fill
    at 10% alpha with the tone as text.
  - **(11)** Reporter name link + job title beneath → primary cell: `.hs-name` at
    `--bf-app-row-strong` `13.5px`/600 `#1c1c1a`, `.hs-row-sub` at `--bf-app-meta` `12px` `#575550`.
  - **(12)** The update note (`.hs-cell-wrap`) → `--bf-app-row` `13px`/500/1.45, wrapping, capped at
    `48ch` inside its cell so the row height stays predictable.
  - **(13)** Status badge, four values, tone-coloured → `.bf-tone-*`: 999px pill, `--bf-app-micro`
    `11px`/700, 10%-alpha fill, tone as text. **Ready to Start renders `#0032b0` per decision #3**;
    the alpha-fill form is what stops it reading as a primary action (§4f).
  - **(14)** Progress meter — track + bold percent from `fieldUpdateProgress()` → `.hs-progress`
    keeps its class and becomes `.bf-meter`: 6px flat track, **flat** tone fill (its gradient dies,
    §4f), percent at `--bf-app-row-strong`/`tabular-nums`. Track tone (DelayIQed red / Ready to
    Start amber / else green) unchanged. **The full fallback table survives as data**
    (percentComplete when present, else Complete 100 · On Site/In Progress 55 · DelayIQed/At Risk
    35 · Ready to Start/Ready/Confirmed 15 · else 8) and the inferred-vs-reported distinction is
    §6.2.
  - **(15, 16)** Project name or `Unassigned`; job name or `No job linked` → `.hs-cell-muted` at
    `--bf-app-row` `#575550`.
  - **(17)** Photo cell — up to 3 thumbs plus the literal `No photos attached` / `<n> photo` /
    `<n> photos` → `.hs-thumbs` stays **28×28, `aria-hidden="true"`, and not clickable**; the count
    text is the cell's only accessible content and stays at `--bf-app-meta`. Thumb radius 6px →
    8px, `1px rgba(28,28,26,0.07)` hairline added so a light photo has an edge.
  - **(18)** Posted time via `formatTime` → `--bf-app-meta` `tabular-nums`. **This is hour+minute
    only** (`9:15 AM`, no date, however old the report), while the sort uses the full ISO — so the
    column head stays the eyebrow word `Posted` and gains **nothing** implying a date.
  - **(19)** Footer count pill `<n> update/updates` + ` · <n> selected` → `.hs-count-pill` at
    `--bf-app-meta` on `rgba(28,28,26,0.05)`, radius 999px.
  - **(20)** Per-page current value → the three option labels stay the literal strings
    `10 per page` / `25 per page` / `50 per page`.
  - **(21)** Page number buttons with `aria-current="page"` → `.hs-page-btn` 30px square, radius
    12px, current page = flat `#2f6bff` fill.
  - **All 10 table columns** keep their order and their sortability: checkbox · Reported by* ·
    Update · Status* · Progress* · Project* · Job · Photos · Posted* · row actions (the unlabelled
    `th` keeps `aria-label="Row actions"`). `thead th` = the ×1 eyebrow on a **transparent** fill
    (was 12.5px/650 on `#fafbfd`), sticky on opaque `#fff`, `42px` frozen.
- **Every action placed (19 of 19):** `Add Field Update` primary (`title="Add Field Update"` kept) →
  `.bf-pill-primary`, still `jumpToFieldUpdateForm()` scrolling `#field-update-entry` and focusing
  `#field-update-message` · H1 chevron → resets view to `all`, slide move · the five saved-view tabs
  (`role=tablist`/`role=tab`/`aria-selected` all kept; **no `aria-controls` is added — see §8 Q4**)
  · the search input (`aria-label="Search field updates"`, same placeholder) → 36px 999px pill,
  `#fff`, `1px rgba(28,28,26,0.13)`, `:focus-within` gets `--bf-focus-ring` re-based to
  `rgba(47,107,255,0.12)` · Filter chip → `clearFieldFilters()`, both `title` strings kept · Sort
  chip → `toggleFieldSort('posted')` · the three quick-filter selects (project / status / reporter,
  all three `aria-label`s verbatim) → native `<select>` kept, chrome restyled to the pill register ·
  `Advanced filters` / `Clear filters` link → `.hs-qf-link`, accent text, icon slides 3px · the
  header select-all checkbox and the per-row checkbox (both `aria-label`s verbatim), `accent-color:
  #2f6bff` kept, `tr.is-selected` → `rgba(47,107,255,0.06)` · the five sortable column-head buttons
  (`th.sorted` keeps the accent arrow) · the reporter-name link (`aria-label="Edit field update from
  <name>"`) · the row `Pencil` (`aria-label="Correct field update from <name>"`, `title="Correct this
  report"`) — **hover-reveal, rescued per §4c**, and it gains a `rail-tooltip` bubble · pagination
  `Prev` / numbers / `Next` with their disabled states, chevrons slide 3px · the per-page select ·
  the footer `Export` (`Download` icon) → `exportFieldUpdatesCsv()`, and its **9-column CSV is
  unchanged**: `Reported by · Role · Status · Progress · Update · Project · Job · Photos · Posted`
  (it exports a **Role** column the table never shows, Progress as `<n>%` including the inferred
  fallback, Photos as a **count**, Posted as **raw ISO**) · a `FieldPhotoThumb` of kind `file`
  remains its own `<a target="_blank">` `Open attachment` link.
  Plus the recorded seam actions: the hub-flyout bookmark star (`Bookmark Field Updates` /
  `Remove Field Updates from bookmarks`, `title="Bookmark for quick access"` / `"Remove bookmark"`),
  and the ⌘K palette command `Field Updates` in group `Pages`.
- **States:** *Empty (none)* — `.hs-empty` keeps its 28px `ClipboardList`, `No field updates added
  yet` / `Create a project before posting jobsite updates.`; the dashed border goes, replaced by 40px
  of air, the eyebrow-free `strong` at `--bf-app-section`, the `span` at `--bf-app-lede` `#575550`
  capped at 62ch. *Empty (no match)* — same shell, `No field updates match that search` / `Try a
  crew lead, project, job, status, or update note.` *Loading* — none local; the shell's
  `DashboardSkeleton` covers it upstream, and none is invented. *Error* — none on the card; row
  correction errors surface in the dialog. *Add-on lock* — **none: `field` is not gated.**
- **Motion:** hover moves **3** (slide: the chevron, the `.hs-qf-link` icon, the pagination chevrons,
  the row pencil) and **2** (invert: the view tabs, the two chips, `Export`). **No lift** — the
  index card is static. `spotlight-surface` at 0.06 on the card. Reveals: 3 (header, figure row,
  card) at 12px / 0.55s / 50ms. `dx-pulse` on the `.dx-dot` keeps its name, retimed onto
  `--bf-ease`. Skeleton: none new. **`.is-selected` still means two things** (checked, *or* its edit
  dialog is open) — that ambiguity is preserved and flagged in §8 Q2.
- **Tests touched:**
  - `tests/index-pages.test.tsx:510` *"lists field updates in the index table with reporter rows,
    tabs and filters"* — **passes unchanged.** It asserts the `Add Field Update` button enabled, the
    `Field update views` tablist with `All updates` `aria-selected`, a row containing
    `Steel framing installation progressing.` / `On Site` / `Riverside Office Building` /
    `No photos attached`, the `Correct field update from Carlos Ramirez` row action, tab filtering,
    search, the reporter filter and the two composer selects. Every one of those strings, roles and
    class names survives; jsdom applies no CSS so the hover-reveal pencil is found regardless.
  - `App.test.tsx:561` *"creates a field update from the Field Updates form"* — **passes
    unchanged**; see §5.2 for the `getAllByRole(...).at(-1)` hazard.
  - New: `density.test.ts` will fail this file if any `font-size` here is not a `--bf-app-*` token
    except the 46/42px row heights.

## 5.2 Field Updates — "Add Field Update" composer (`#field-update-entry`)

- **Today:** `section.crew-directory-card.field-entry-card#field-update-entry` (App.tsx:37851) — a
  bordered card with a header pill, a project/job/status row, a percent-complete toggle + slider with
  a plan-comparison line, a note textarea, a drag-and-drop attachment zone (8 files, 15MB, 1600px,
  JPEG q0.72) and a submit that can raise a schedule variance.
- **Becomes:** the frame goes (licence: the boundary is neither interactive nor a scroll viewport).
  It becomes a **titled section on the ground**: an eyebrow rule, `h2` at `--bf-app-section`
  `16px`/600, the sub at `--bf-app-lede` capped at 62ch, and a `1px rgba(28,28,26,0.07)` hairline
  above it, 27px below the index card. Its internal grid is unchanged. The one frame that **is**
  licensed is the **dropzone** (`role="button"`, drop target, `.dragging`): radius 12px, `1px
  dashed rgba(28,28,26,0.13)` at rest → `1px solid #2f6bff` + `rgba(47,107,255,0.04)` fill while
  `.dragging`, `--bf-focus-ring` on `:focus-visible`. Each attachment tile keeps a frame too (it has
  an X). Shared: `.bf-eyebrow`, `.bf-pill-primary`, `.bf-meter`, `.bf-tone-*`, `.bf-prose`,
  `CloudLoader`, `text-shimmer`.
- **Every information item placed (12 of 12):**
  - **(1)** Card header — 26px `ClipboardList`, `h2` `Add Field Update`, sub `Post a jobsite status,
    note, and field signal.`, and the `.crew-status-pill.ready` reading `Open` → icon + `h2` at
    `--bf-app-section`, sub at `--bf-app-lede`, the `Open` pill as `.bf-tone-green` 999px
    `--bf-app-micro`.
  - **(2)** The no-job hint `Link a job above to report progress against it.` → `--bf-app-meta`
    `#575550`, `.bf-prose`, sitting where the disabled control would be.
  - **(3)** Percent readout `<strong>{n}%</strong>` + the word `complete` → `--bf-app-figure`
    `clamp(20px,1.6vw,26px)`/700/`tabular-nums` for the number, eyebrow for `complete`.
  - **(4)** Slider scale ticks `0` / `50` / `100` (`aria-hidden`) → `--bf-app-micro` `#8a877e`,
    kept `aria-hidden`.
  - **(5)** Plan comparison line `#fp-progress-plan`: `Planned today: <strong>{plannedToday}%</strong>`
    → `--bf-app-meta`, figure inline at `--bf-app-row-strong`/`tabular-nums`. It stays the slider's
    `aria-describedby` target.
  - **(6)** The `.fp-drift` verdict chip — `<n>% behind plan` (drift ≤ −5) / `<n>% ahead of plan`
    (≥ 5) / `on plan` → `.bf-tone-red` / `.bf-tone-green` / `.bf-tone-neutral`, 999px,
    `--bf-app-micro`. All three classes (`.behind`/`.ahead`/`.on`) kept.
  - **(7)** Attachment counter `<attached>/8` inside the `Photos & files` title → the title is an
    eyebrow, the counter a `tabular-nums` `--bf-app-meta` suffix. `MAX_FIELD_ATTACHMENTS = 8` stays
    baked into copy.
  - **(8)** The dropzone label's **three** states — `Add jobsite photos or files` /
    `Processing files…` / `Uploading <n> photo|photos|file|files…` (the noun is `photo` only when
    every attachment is an image) → all three verbatim, at `--bf-app-row-strong`; the two pending
    ones wrapped in `text-shimmer`.
  - **(9)** Dropzone hint `Drag & drop or browse — images are optimized automatically.` →
    `--bf-app-meta`, `.bf-prose`.
  - **(10)** Per-attachment tile — image preview **or** `FileText` icon, the file name (`title` =
    full name), and `formatFileSize` as `n B` / `n KB` / `n.n MB` → 64px tile, radius 12px, name
    ellipsized at `--bf-app-meta`, size at `--bf-app-micro` `#8a877e`. **`FieldPhotoThumb` renders
    three different things from one string field** (data:/http/blob image · non-image file as a
    clickable link · a seeded `imageThemes` colour swatch) and all three keep a tile.
  - **(11)** Submit label flipping to `Adding Field Update` → `text-shimmer` on the label,
    button disabled.
  - **(12)** The `.fp-raised` variance banner (`role="status"`): `ShieldAlert`, strong
    `Progress logged — and it flagged a schedule variance.`, then `You reported {reportedPercent}%
    against a plan of {plannedPercent}%.` + either ` That forecastIQs the project {projectSlipDays}
    day|days late.` or ` The schedule has float to absorb it.` + ` The dates haven't changed — a
    project manager reviews it first.` → **kept word for word.** Radius 13px → 12px, border
    `rgba(28,28,26,0.13)`, a `3px #2f6bff` left rule instead of a tinted fill, body at
    `--bf-app-row`/1.5 capped at 62ch, `ShieldAlert` in the accent. It **appears instantly, never
    fades** (`role="status"`), it is **never** a `data-reveal` target, and it persists until
    dismissed — including after its row has been sorted away, on a single `lastVariance` slot that a
    second submit overwrites. Preserved as-is; flagged in §8 Q3.
- **Every action placed (12 of 12):** project select (`aria-label="Field update project"`, still
  re-picks the first job) · job select (`No job linked` + that project's jobs only) · status select
  (the same four values) · the `Report percent complete` checkbox with its `Gauge` icon, still
  disabled unless a job is linked, wrapper still carrying `data-reporting="on"|"off"` · the percent
  range slider (`aria-label="Percent complete"`, `aria-describedby="fp-progress-plan"`, min 0 max
  100 step 5) — 6px `.bf-meter` track, 16px `50%` `#2f6bff` thumb with `--bf-focus-ring` ·
  the note textarea (`#field-update-message`, label `Update`, placeholder `Crew progress,
  materials, safety notes...`) — radius 12px, `13px`/1.5, `:focus-within` ring · the dropzone as a
  `role="button" tabIndex=0` div with **Enter and Space** · drag-over/-leave/-drop · the hidden
  `multiple` file input (`aria-label="Add photos or files to this field update"`, value cleared each
  change) · the per-attachment X (`aria-label="Remove <name>"`) — this is the boundary that licenses
  the tile · the submit (`POST /api/field-updates` with the exact same body construction, then
  `reload()`) · the banner's X (`aria-label="Dismiss"`).
- **States:** *Empty* — the project select's single `Create a project first` option (value `""`)
  when there are no projects; the job select's permanent `No job linked`; the percent hint standing
  in for the disabled control. *Loading* — `CloudLoader` (`className="field-dropzone-cloud"`)
  replaces the `ImagePlus` glyph while `isReadingFiles` or while submitting with attachments, and
  the submit reads `Adding Field Update`; both kept. *Error* — all five strings verbatim in
  `p.form-error.field-attachment-error[role=alert]` / `p.form-error[role=alert]`:
  `You can attach up to 8 files per update.` · `…— extra files were skipped.` ·
  `"<name>" is larger than 15.0 MB and was skipped.` ·
  `One or more files could not be read. Please try again.` · the server message or
  `Field update could not be added.` Error register: `12px`/600 in `#c5221f`, a 3px red left rule,
  capped at 62ch, no icon (the `role=alert` carries it). *Add-on lock* — none.
- **Motion:** invert on the submit's ghost siblings; slide on nothing here; **no lift** (the frame is
  gone, and `.field-rx .field-entry-body .primary-button`'s hover lift at :517-527 and
  `.field-entry-card:hover`'s shadow lift at :321 are both removed). One reveal for the whole
  section. Skeleton: none — the section is synchronous.
- **Tests touched:**
  - `App.test.tsx:561` — **passes unchanged**, but this is the cluster's single most fragile test:
    the string `Add Field Update` is used by **both** the index-card button and this submit, and the
    test picks the submit with `getAllByRole(...).at(-1)`. **The composer must stay after the index
    card in DOM order and neither label may change.** Written into the component header comment.
  - `tests/index-pages.test.tsx:540-542` — asserts `Field update project` and `Field update job` are
    still present; **passes unchanged.**

## 5.3 Field Updates — "Correct this report" edit dialog

- **Today:** `createPortal` to `document.body`,
  `div.crew-dialog-backdrop.pdx > section.crew-dialog.pdx-dialog.pdx-field` (App.tsx:38037), with
  two `.pdx-aurora` blobs behind it. Portalled **because `.field-rx` sets `isolation: isolate`**,
  which would trap a fixed backdrop.
- **Becomes:** `.bf-stage` — one of the two biggest objects in this cluster: radius **26px**,
  `--bf-shadow-stage` `0 34px 64px rgba(28,28,26,0.13)`, `#fff`, border
  `rgba(28,28,26,0.07)`, backdrop `rgba(28,28,26,0.34)` with **no blur** (§4e). Body copy capped at
  62ch. The two `.pdx-aurora` blobs stay (they are the Welcome Page's own device, already at 50px
  blur). **The portal stays, and any new overlay on this page must be portalled too.**
  `.pdx-dialog` and `.pdx-field` share a base with the Crew dialogs, so the `bf-` rules are written
  against `.pdx-field` specifically, never the shared base.
- **Every information item placed (5 of 5):** the `.pdx-dot` + the word `Field update` → the ×1
  eyebrow with a 7px accent dot · the title `#field-edit-title` `Correct <em>this report</em>` →
  `--bf-app-title` `clamp(22px,1.9vw,26px)`/600, the `em` staying **`font-style: italic`, the one
  display accent, not a second family** · the sub `#field-edit-description` `Filed by <reporter, or
  "the field"> on <formatTime(createdAt)>. The author and timestamp stay as filed.` →
  `--bf-app-lede` `#575550`, 62ch (note: `formatTime` is **time-only** here too) · the percent label
  `Percent complete` appending `: {n}%` only while the slider shows · the `.pdx-note` attachment
  line `<n> attached photo/file stays` / `<n> attached photos/files stay` + `with this update.` →
  `--bf-app-meta` `#575550` with a 12px `Paperclip`-free eyebrow head.
- **Every action placed (10 of 10):** project select (re-picks the first job of that project) · job
  select (`No job linked` + that project's jobs) · status select (the same four values) ·
  the `.pdx-add-role` button reading `Report progress` / `Link a job first` with its `Gauge`, still
  disabled without a job → `.bf-pill` (inverts) · the percent slider (0–100 step 5) once progress is
  on · the note textarea (`rows=4`, same placeholder) · `Cancel` → `.bf-pill` · the X
  (`aria-label="Close edit field update"`) → 30px, radius 12px, press `scale(0.94)` ·
  `Save changes` → `.bf-pill-primary`, `PATCH /api/field-updates/<id>` with the **original**
  `userId` and the original photos, label flipping to `Saving...` under `text-shimmer` ·
  `useModalDialog(editDialogRef, closeEditUpdate, open)` supplying the focus trap, Escape and
  focus restore — untouched. The row behind keeps `.is-selected`.
  **Two recorded gaps are preserved, not silently fixed:** `.pdx-add-role` only ever calls
  `setEditReportProgress(true)` — there is no way to turn progress reporting back off — and clearing
  the Job select silently drops a stored `percentComplete` on save. Both are listed in §6.4.
- **States:** *Empty* — job select `No job linked`; the progress button reads `Link a job first` and
  is disabled. *Loading* — `Saving...` + disabled. *Error* —
  `p.project-form-wide.form-error[role=alert]`: `Add a note of at least 3 characters.` for a short
  note, else the server message or `Field update could not be saved.` (Note the asymmetry the record
  flags: the dialog states this rule, the composer enforces it silently.) *Add-on lock* — none.
- **Motion:** the `.pdx` backdrop fade and dialog rise are retimed to `0.18s` / `0.22s
  var(--bf-ease)` with `translateY(-8px) scale(0.985) → none`; **no** reveal (it is a modal);
  invert on `Cancel` and `Report progress`; press-scale on the X. Skeleton: none.
- **Tests touched:** `tests/index-pages.test.tsx:544` *"corrects a field update from its row link and
  shows the reloaded row"* — **passes unchanged.** It queries `role="dialog"` named
  `/^Correct this report/` (so `aria-labelledby` → `#field-edit-title` must keep resolving to that
  string with the `em` inside), asserts `Update` is prefilled, changes `Status`, clicks
  `Save changes`, asserts the dialog closes and the PATCH body.

## 5.4 Field variance review drawer — "Field variances" (the PM half of the loop)

- **Today:** `section.sv-drawer` (`aria-label="Field variance review"`, SchedulePage.tsx:537-568),
  rendered on the Schedule landing page only when `pendingVariances.length > 0`, holding one
  `VarianceReviewCard` (SchedulePage.tsx:136-248) per pending variance. Radius 16px, animated in by
  `@keyframes sv-drawer-in 0.22s`.
- **Becomes:** the drawer keeps its frame as a **declared exception** to the licence — it is a
  conditionally-appearing surface carrying an irreversible decision, and removing its boundary would
  make a proposal read as part of the plan. Radius 16px → **18px**, border
  `rgba(28,28,26,0.07)`, `--bf-shadow-card`, `#fff`. Inside it, each `.sv-card` **loses** its own
  frame and becomes a row separated by hairlines, with its `.sv-sev-<severity>` tone carried by a
  **3px left rule** instead of a tinted box — so the drawer reads as one list of proposals, not
  nested cards. Shared: `.bf-card`, `.bf-tone-*`, `.bf-pill`, `.bf-pill-primary`, `.bf-eyebrow`.
- **Every information item placed (13 of 13):** the head — 18px `ShieldAlert` + `h2` `Field
  variances` at `--bf-app-section`, and the copy `The field reported progress that disagrees with
  the plan. Nothing has changed yet — accepting applies the forecastIQ and its knock-ons to the
  master schedule.` at `--bf-app-row`/1.5 capped at **62ch** (today it runs the drawer's full width)
  · the card head — the job's **phase** (→ job name → `Unknown job`) as `h3` at
  `--bf-app-row-strong` `13.5px`/600, the project name (or an em dash) beneath at `--bf-app-meta` ·
  the `.sv-sev-pill` High/Medium/Low → `.bf-tone-*` 999px `--bf-app-micro` (**Medium renders
  `#0032b0` per decision #3**) · the evidence block — the first attached photo as `img.sv-photo`
  (radius 8px → 12px, `1px rgba(28,28,26,0.07)`; **this is the largest a jobsite photo is ever
  shown anywhere in the app**) and the `<blockquote>` of the note or `No note attached.` at
  `--bf-app-row`/1.5 with a `2px rgba(28,28,26,0.13)` left rule, its `<cite>` reading
  `<reporter, or "Field"> · <formatVarianceDate(detectedAt)>` at `--bf-app-meta` · the three metrics
  — `Reported` `<n>%`, `Planned` `<n>%`, `ForecastIQ finish` `<proposedEnd>` — labels as the ×1
  eyebrow, values at `--bf-app-figure`/`tabular-nums`, the finish keeping `.sv-late` (red when
  `varianceDays > 0`) / `.sv-early` (green) and its `<em>plan <currentEnd></em>` beneath at
  `--bf-app-meta` · the four impact list items, each keeping its glyph and its exact copy:
  `On the critical path` (`Zap`, `.sv-impact-critical`), `<n> day|days of float` (`Clock`),
  `ForecastIQs <n> day|days late|early` (`TrendingUp`), and `Project finish moves <n> day|days`
  (`ArrowRight`, `.sv-impact-critical`) **or** `Project finish holds — float absorbs it` — all at
  `--bf-app-row`, icons 14px in the item's tone · the collapsed ripple summary `Pushes <n>
  downstream job|jobs` → the `<summary>` at `--bf-app-row-strong` with a chevron that slides 3px ·
  each ripple row — job name, `<currentStart> → <proposedStart>`, `<em>+<shiftDays>d</em>` → a
  three-column `--bf-app-row` line with `tabular-nums` dates.
- **Every action placed (3 of 3):** the `<details class="sv-ripple">` summary expanding the ripple
  list (height on `--bf-ease-size`, not the signature curve) · `Keep the plan` (`.sv-reject`) →
  `.bf-pill`, inverts on hover, `POST /api/schedule/variances/<id>/reject` ·
  `Accept → schedule` (`.sv-accept`, `Check` icon) → `.bf-pill-primary`, its arrow slides 3px,
  `POST …/accept` returning `movedJobIds`. Both disabled while busy.
- **States:** *Empty* — the whole section is omitted when nothing is pending; **no empty copy is
  invented.** *Loading* — the `busy` prop disables both buttons; the primary's label is *not*
  changed (that would be new copy) but it gains a 14px `Loader2 .spin`, matching the pattern the
  Dashboard mirror already uses. *Error* — handled by the Schedule page's `ScheduleNotice` channel
  with the literal `Could not accept the variance: <message>` / `Could not reject the variance:
  <message>` (SchedulePage.tsx:463), unchanged. *Add-on lock* — none. **Only one variance decision
  can be in flight app-wide** (`resolveVariance` early-returns while `resolvingVarianceId` is set)
  and only the acting card disables — so a click on a second card does nothing visible. Preserved;
  §8 Q5.
- **Motion:** `@keyframes sv-drawer-in` **keeps its name**, value retimed to `0.3s var(--bf-ease)`
  with a 6px rise; its `prefers-reduced-motion` null at field-variance.css:296 keeps working because
  the name did not change. Invert on `Keep the plan`, slide on `Accept →` and the ripple chevron.
  **Not** a `data-reveal` target (it appears in response to an action, not a scroll).
- **Tests touched:** none direct. The accept/reject contract is pinned through the Dashboard panel by
  `App.test.tsx:1032` and `:1336` — see §5.5. `schedule/boundary.test.ts` (8) is relevant: this file
  lives in `schedule/`, so **no `sched-`-prefixed or `gantt-`-prefixed class may move into
  `App.tsx`**, and nothing here does. **Do not name anything `bf-sched-*`.**

## 5.5 Dashboard "Pending Approvals" panel (the variance decision, second surface)

- **Today:** `section.cc-panel` (App.tsx:26438), one of the eleven promoted `.dash-block` panels,
  rows from `data.variances` (not invented copy), with `resolveApproval` at App.tsx:25653.
- **Becomes:** `.dash-block` surface only — radius 12px → **18px**, border
  `rgba(28,28,26,0.07)`, `--bf-shadow-card`. **`DASH_COLS 6`, `DASH_ROW_UNIT 40`, `DASH_GAP 16`,
  `grid-auto-rows: 40px`, the four `0.26s cubic-bezier(0.22,1,0.36,1)` transitions, the drag
  handle, the resize grip and `dash:layout` persistence are all frozen.** Panel `h2` stays at
  **`--bf-app-panel` 14.5px** (§4d) with tracking to `-0.01em` and colour to `#1c1c1a`. The panel
  **does not lift** — it is draggable and a lift fights the grip; it gets `spotlight-surface`
  instead.
- **Every information item placed (7 of 7):** head 16px `ClipboardCheck` + `h2` `Pending Approvals`
  · row title = the job's phase → job name → `Unknown job`, at `--bf-app-row-strong` · row meta
  `<project> · <severity> severity` + ` · critical path`, at `--bf-app-meta` · the row side figure
  `On plan` / `+<n> working day|days` / `−<n> working day|days` at `--bf-app-figure`'s lower bound
  (20px) with `tabular-nums`, tone red/green · the row `<time>` from `relativeTime(detectedAt` for
  pending, `resolvedAt ?? detectedAt` for resolved`)` at `--bf-app-meta` `#8a877e` · resolved rows'
  `.cc-sev-<status>` chip carrying the raw word `accepted` / `rejected` / `superseded` →
  `.bf-tone-*` `--bf-app-micro`, **raw word kept** · the resolved list still capped at the 12 most
  recent.
- **Every action placed (5 of 5):** the `div.hs-home-seg[role=group][aria-label="Approval view"]`
  Open/Resolved control with `aria-pressed` → `.bf-seg`, inverts · `View all`
  (`aria-label="View all approvals on the schedule page"`) → `setPage('schedule')`, slides 3px ·
  `Reject` (`aria-label="Reject the <title> variance"`) → `.bf-pill` · `Approve`
  (`aria-label="Approve the <title> variance"`) → `.bf-pill-primary`, label becoming `Saving…`
  under `text-shimmer` · the empty-state button flipping `See resolved` / `Back to open` with its
  `ArrowRight` → `.bf-pill`, arrow slides.
- **States:** *Empty* — `.hs-home-empty` with `No approvals waiting on you` (open) /
  `Nothing has been resolved yet` (resolved), each with the flip button; strings verbatim, copy at
  `--bf-app-row` `#575550` capped at 62ch. *Loading* — per row, both buttons disable and Approve
  reads `Saving…`. *Error* — `p.cc-appr-error[role=alert]` `Could not accept it: <message>. Nothing
  changed.` / `Could not reject it: …` at the error register; **an unresolved variance is the safe
  failure and stays so.** *Add-on lock* — none.
- **Motion:** the section keeps `data-reveal` (Dashboard's own system, not the cluster's). Invert on
  the segmented control and `Reject`; slide on `View all` and the empty-state arrow. No lift.
  Skeleton: `DashboardSkeleton`'s `.dash-skel-block` (radius 12 → 18px, border
  `rgba(28,28,26,0.07)`, `.dash-skel-line` gaining a 1.6s `--bf-ease-size` shimmer nulled under
  reduced motion); `grid-auto-rows: 40px` stays 40px there because it mirrors `DASH_ROW_UNIT`.
- **Tests touched:**
  - `App.test.tsx:987` *"shows real field variances as Pending Approvals and none of the invented
    dashboard copy"* — **passes unchanged.** Asserts `Concrete - Level 3 Slab`,
    `+3 working days`, `/Riverside Office Building · High severity · critical path/`, the
    `Approve the Concrete - Level 3 Slab variance` button, and a **blocklist** that must not appear:
    `Change Order #CO-129`, `Timecard Exception`, `Re-sequence drywall`, `Add 1 carpentry crew`,
    `Lookahead Risk Scan`, `Active AI Workflows`, `Cost Performance`, `vs last 7 days`,
    `Production Trend (Backlog)`. **Nothing in this cluster may reintroduce any of those nine
    strings on the Dashboard** — which is why the backlog chart stays on Reports (§5.11).
  - `App.test.tsx:1032` and `:1336` — **pass unchanged**; every accept/reject `aria-label` is
    templated from the job's phase name and is asserted verbatim.

## 5.6 DelayIQs — KPI strip + index card

- **Today:** `page-stack delayIQ-rx hs-index` (App.tsx:38367), index card at 38423. Four bordered
  KPI tiles, then a two-column `hs-index-grid` + `hs-index-rail` (sticky `top: 74px`): the delay log
  as a table on the left, four read-only panels on the right. `.delayIQ-rx` is a near-identical
  clone of `.field-rx` (same tokens, same `-22px -28px -34px` bleed, same auroras, ~200 duplicated
  lines).
- **Becomes:** identical treatment to §5.1 — page header out of the card at `--bf-app-title`
  (keeping `data-tutorial-id="delayIQs-page-title"`), a frameless `.bf-figures` row of four, and the
  index card as the one licensed frame (radius 18px, `--bf-shadow-card`, `overflow: hidden`,
  `.bf-doc-bleed`, `aria-labelledby="delayiqs-index-title"`, `ScrollAffordance` on its
  `.hs-table-wrap`). The rail column keeps `position: sticky; top: 74px` on an **opaque
  `var(--wx-bg)`** background — no `backdrop-filter` (§4e).
  **One deliberate divergence from Field Updates, and it is the point:** DelayIQ rows are **not
  clickable** — there is no edit dialog, no delete, and no way to change a delayIQ's severity,
  status, impactDays or category after creation. So DelayIQ rows get **no `tbody tr:hover` wash, no
  trailing chevron, and `.hs-name` renders as plain `#1c1c1a` ink rather than `.hs-link` accent**.
  A re-skin that gives them Field Updates' affordances would promise editing that does not exist.
  The two pages share the `.hs-index` system and diverge here by one modifier class,
  `.bf-table-static`.
- **Every information item placed (18 of 18):** the four KPI tiles — *Total DelayIQs* (blue
  `ShieldAlert`), *Open* (`AlertTriangle`, **tone still red above zero, green at zero**),
  *High Impact* (violet `TrendingUp`), *Days Lost* = Σ`impactDays` (amber `CalendarDays`) → four
  `.bf-figure` cells, eyebrow label, `--bf-app-figure` value, 34×34 tone chip · the H1 `DelayIQs`
  with its `ChevronDown` (`aria-label="Show all delayIQs"`, `title="All delayIQs"`) → the page
  header · the four saved-view tabs with counts — `All delayIQs` (`ShieldAlert`), `Open`
  (`AlertTriangle`), `Monitoring` (`Gauge`), `Resolved` (`CheckCircle2`) → `.bf-seg` · the
  `<filtered> of <total>` readout → `--bf-app-meta` · the sort chip `Sort by <key>` with **all five
  keys** (reported · impact · severity · title · status) · the filter chip `Filter` / `Filter · <n>`
  · the severity-toned avatar holding a 15px `AlertTriangle` (High red / Medium amber / Low green) →
  28px `50%`, 10%-alpha tone · the title `.hs-name` at `--bf-app-row-strong` with the description
  beneath as `.hs-row-sub` at `--bf-app-meta`, **`title` attribute keeping the full description** ·
  the project name via `projectName()` · the trade-profile category (`Weather`, `Material
  shortage`, …) at `--bf-app-row` `#575550` — **no fixed icon and no fixed colour is assigned to a
  category**, because the list is trade-dependent across ~15 profiles · the severity badge and the
  status badge (Open red / Monitoring amber / Resolved green) → `.bf-tone-*` (**Medium and
  Monitoring render `#0032b0` per decision #3**) · the `<impactDays> days` right-aligned
  `.hs-cell-num` → `--bf-app-row-strong`/`tabular-nums`, right-aligned, the word `days` at
  `--bf-app-meta` · `formatDate(reportedAt)` → `--bf-app-meta tabular-nums`; **`formatDate` passes
  the literal string `Pending` through unchanged**, so this cell can legitimately read `Pending`
  rather than a date and must not be styled as if it were always numeric · the footer count pill
  `<n> delayIQ|delayIQs` + ` · <n> selected`.
  **All 8 columns** keep order and sortability: checkbox · DelayIQ* · Project · Category ·
  Severity* · Status* · Impact* · Reported*. `thead th` = the ×1 eyebrow on transparent, 42px.
- **Every action placed (15 of 15):** `Log DelayIQ` primary → `focusDelayIQForm()` scrolling
  `#delayiq-title-input` to centre and focusing it, **still rendered only when `canCreate`**
  (`activeUser.role !== 'Crew Lead'` **and** ≥1 project) · the H1 chevron resetting the view ·
  the four view tabs · the search input (`aria-label="Search delayIQs"`, same placeholder; still
  matching title, description, category, severity, status and project name) · the filter chip →
  `clearDelayFilters()` · the sort chip → `toggleDelaySort('impact')` · the three quick-filter
  selects (project / severity / category, all `aria-label`s verbatim; the category options remain
  *the distinct categories present in the data*) · `Advanced filters` / `Clear filters` ·
  the select-all (`Select all delayIQs on this page`) and per-row (`Select <title>`) checkboxes ·
  the five sortable column-head buttons with their per-key default directions · pagination and the
  per-page select (`aria-label="DelayIQs per page"`, literal `10 per page` / `25 per page` /
  `50 per page`) · `Export` → `exportDelayIQsCsv()`, **8-column CSV unchanged**: `Title ·
  Description · Project · Category · Severity · Status · Impact days · Reported` (it exports the
  **full** description the table truncates, and the **raw** `reportedAt`).
  Plus the seam actions: the hub-flyout bookmark star (`Bookmark DelayIQs` / `Remove DelayIQs from
  bookmarks`) and the ⌘K command `DelayIQs`.
  **The sort chip's label/behaviour mismatch is preserved verbatim** — the chip prints
  `delaySortKey`, always calls `toggleDelaySort('impact')`, styles `.active` off
  `delaySortKey !== 'reported'` and rotates its chevron only when `delaySortKey === 'impact'`, so
  after sorting by Severity it reads *"Sort by severity"*, looks active and points down. Re-skinned
  as-is; the fix is §6.4.
- **States:** *Empty (none)* — `.hs-empty`, 28px `AlertTriangle`, `No delayIQs logged yet` /
  `DelayIQ records will appear after projects are created and reported.` *Empty (no match)* —
  `No delayIQs match that search` / `Try a title, project, category, severity, or status.`
  *Loading* — none local. *Error* — **none exists**: `submitDelayIQ` has no try/catch and no error
  surface, so a failed POST is silent. The re-skin **must not** borrow the composer's visual
  confidence from next door without the states behind it — see §5.8 and §6.4. *Modals* — **none**;
  no row opens anything. *Add-on lock* — none.
- **Motion:** invert on the tabs, the two chips and `Export`; slide on the chevron, the
  `.hs-qf-link` and the pagination chevrons. **No row hover, no lift.** `spotlight-surface` on the
  index card only. Reveals: this page is at the 6-per-page budget (§4a). `dx-pulse` keeps its name.
  Skeleton: none.
- **Tests touched:** **none.** The record is explicit: *"No dedicated DelayIQs index test… This is
  the least test-protected screen in the area."* So this screen is protected only by the manual
  walkthrough of the item lists above, plus the new `density.test.ts` guard. Two standing guards
  reach it indirectly: `tests/shell-nav.test.tsx` (new) asserts the `nav-delayIQs` anchor and
  click-only reachability, and `App.test.tsx:281` includes `Reports` in the asserted nav set.

## 5.7 DelayIQ Early Warning panel — "What's trending behind"

- **Today:** `section.diq-panel.span-2[data-reveal][aria-label="DelayIQ early warning"]`
  (DelayEarlyWarning.tsx:130), first panel in the rail. Radius 16px, `1px solid var(--line,
  #e6e8ec)`, `#ffffff`, `0 20px 50px -30px rgba(11,14,20,0.35)`. Read-only: it never changes the
  plan. `delayiq.css` (348 lines) has **no** reduced-motion block and hardcodes `#ffffff` plus
  `var(--line, #e6e8ec)` fallbacks.
- **Becomes:** the second licensed frame on this page (clause 2 — it clips the revealed downstream
  chain table, which gains `ScrollAffordance axis="x"`). `.bf-card`: radius 16 → **18px**, border →
  `rgba(28,28,26,0.07)`, shadow → `--bf-shadow-card` `0 10px 30px rgba(28,28,26,0.05)`,
  padding `20px 22px` kept. Every hardcoded `#0b0e14` / `#6f7785` in `delayiq.css` re-bases onto
  `#1c1c1a` / `#575550` / `#8a877e`.
- **Every information item placed (13 of 13):** the kicker `.diq-kicker-dot` + `DelayIQ · Early
  warning` → the ×1 eyebrow (it was 12px/700/0.05em — half a pixel and one weight step away), dot
  7px with its `0 0 0 4px` halo re-based from `rgba(194,65,12,0.12)` to the accent at 0.12 · `h2`
  `What's trending behind` → 19px/750 becomes `--bf-app-section` `16px`/600/`-0.01em` · the
  `.diq-count` chip `All clear` / `<n> at risk` + ` · <n> high` → `--bf-app-micro` 999px chip;
  **suppressed entirely while loading or errored**, which is preserved · the lead paragraph
  `An early read from the live schedule — the plan hasn't changed. Warn the trades now, or resolve
  the slip in the variance drawer.` → `--bf-app-row`/1.5, `.bf-prose` 62ch · the per-risk severity
  pill (14px `TriangleAlert` + `High`/`Medium`/`Low`, `aria-label="<severity> severity"`) →
  `.bf-tone-*`; the card tone classes `diq-tone-bad|warn|low` become a **3px left rule**, not a
  frame · the per-risk title (job name `strong` + trade beneath) → `--bf-app-row-strong` +
  `--bf-app-meta` · the slip chip `Finish +<n>d` / `Float absorbing` (`.diq-slip-soft`) →
  `--bf-app-micro tabular-nums` · the trigger line `Overdue to start — <n> working day|days late`
  (kind `overdue_start`) or `Trending <n> working day|days behind` (`behind_pace`) → `--bf-app-row`
  · the `behind_pace`-only `<em>` appendix ` · <percentComplete>% done vs <plannedPercent>%
  planned` → `--bf-app-meta`, italic kept · the date pair `formatDate(currentEnd)` `ArrowRight`
  `formatDate(forecastEnd)` (month+day, UTC) → `--bf-app-row tabular-nums`, arrow 14px `#8a877e` ·
  the affected-trades line `Pushes` + one `.diq-trade` chip per trade → eyebrow word + 999px
  `--bf-app-micro` chips at `rgba(28,28,26,0.05)` · `Nothing downstream yet — it slips only itself
  for now.` (`.diq-pushes-none`) → `--bf-app-meta` `#8a877e` · the revealed chain table — columns
  **`Downstream activity` · `Trade` · `Pushed to` · `Slip`**, each row showing the job name, its
  trade, `currentEnd → <b>pushedEnd</b>` and `+<shiftDays>d`, with `.diq-critical` rows keeping
  their `critical` tag (`.diq-crit-tag`) → `.bf-table` (46px rows, 42px thead, thead = the ×1
  eyebrow), the `critical` tag as `.bf-tone-red` `--bf-app-micro`.
  **`DelayRisk.onCriticalPath` is delivered to this panel and never displayed** — the panel marks
  only critical *downstream* rows. That asymmetry with the Dashboard mirror (which uses it to pick
  the row icon) is preserved and flagged in §8 Q6.
- **Every action placed (3 of 3):** the `.diq-expand` button
  `See what it pushes (<n>)` / `Hide what it pushes (<n>)` with a `ChevronDown` that rotates via
  `.open`, rendered only when `downstream.length > 0` → `.bf-pill`, chevron slides then rotates,
  height on `--bf-ease-size` · `Notify affected trades` (`.diq-notify`, `BellRing`) →
  `.bf-pill-primary`; `POST /api/delayiq/early-warning/notify { jobId }`; while sending it shows the
  spinning `Loader2` and disables; on success it is **replaced by a non-interactive
  `span.diq-notified` `Affected trades notified` (`CheckCircle2` 15px) permanently** —
  `notifyState` never returns to idle, the state is per-card local and is lost on navigation. All of
  that is preserved as-is; §8 Q7 · the mount-time `fetchDelayEarlyWarning()` with its `alive`
  guard, **and no retry control**.
- **States:** *Empty* — `.diq-clear` with a 22px `CheckCircle2`, `Nothing trending behind.` and
  `Every in-progress activity is keeping pace with its plan as of <formatDate(asOf)>` (falling back
  to the word `today`) → `strong` at `--bf-app-section`, body at `--bf-app-row` 62ch, the glyph in
  `--wx-green`. Plus the per-risk `Nothing downstream yet…`. *Loading* — `.diq-loading`: the 20px
  `Loader2.spin` plus `Scanning the schedule…`, now wrapped in `text-shimmer`, and **the `.spin`
  keyframe finally gets a reduced-motion null** (§4h). *Error* — `.diq-error`: 18px
  `AlertTriangle` + the thrown message defaulting to `Unable to load early warnings.`, at the error
  register, 62ch, **and still no retry button** (the Dashboard mirror has one; the asymmetry is
  preserved and flagged, §6.4). Notify failure → the label becomes `Retry notify`, idle styling,
  still clickable. *Add-on lock* — none.
- **Motion:** the section keeps its `data-reveal` (it is one of the page's six) — its `className` is
  static, so it is a legal reveal target. Invert on both buttons; slide on the expander chevron. No
  lift, no tilt. `spotlight-surface` on the frame. Skeleton = the `text-shimmer` loading line, which
  is the panel's real skeleton and needs no new shape.
- **Tests touched:** `App.test.tsx:987` asserts the **Dashboard mirror** of this payload
  (`Drywall — Riverside Office Building`, `/3 working days behind pace · pushes Paint/`), which pins
  the payload shape; `App.test.tsx:1000` and `:1041` stub `/api/delayiq/early-warning` so the fetch
  path is exercised. All three **pass unchanged** — no copy, class or role here changes.

## 5.8 DelayIQs rail — "Log DelayIQ" / "Crew View" panel

- **Today:** `<Panel title={activeUser.role === 'Crew Lead' ? 'Crew View' : 'Log DelayIQ'}>`
  (App.tsx:38700) — a `div.form-stack`, **not a `<form>`**: pressing Enter in the title input does
  nothing, and `Add DelayIQ` silently no-ops on a blank title or missing project.
- **Becomes:** frame retired (licence). A titled section in the rail: eyebrow rule, `h2` at
  `--bf-app-section`, `1px rgba(28,28,26,0.07)` hairline above, 27px rhythm. `.panel` and
  `.panel-header` keep their classes (they are shared primitives reaching many pages — the `bf-`
  rules zero border/radius/shadow only, never padding, so nothing else re-flows).
- **Every information item placed (4 of 4):** the role-dependent panel title — `Log DelayIQ` for
  every role except Crew Lead, `Crew View` for Crew Lead → `--bf-app-section` · the labels `Project`
  and `DelayIQ title` → the ×1 eyebrow · the title input's placeholder `Example: Inspection moved to
  Friday` → `#8a877e` at `--bf-app-row` · the **written-but-unshown** defaults
  (`category = tradeProfile.delayIQCategories[0]` falling back to `Site condition`, `impactDays 2`,
  `severity Medium`, `status Open`, `description "Logged from the delayIQ management hub."`) stay
  invisible; **surfacing them would be new copy** and is filed as §6.1.
- **Every action placed (3 of 3):** the project select (still re-pinned to the first project by the
  `useEffect` whenever the selected id disappears from `data.projects`) · the title input
  `#delayiq-title-input` (still the focus target of the index card's `Log DelayIQ` button) → radius
  12px, `--bf-app-row`, `--bf-focus-ring` · `Add DelayIQ` (17px `Plus`) → `.bf-pill-primary`, flat
  fill; still `POST /api/delayIQs` then `reload()`.
- **States:** *Empty* — `.empty-state` with `AlertTriangle`: `Create a project first` /
  `DelayIQs need a project before they can be logged.` (non-crew-lead, zero projects); and with
  `ShieldAlert`: `Report delayIQs through field updates` / `Crew leads can flag status from the
  Field Updates page.` (Crew Lead). Both verbatim; the dashed `#cbd8e7` border and `#f6f7fe` fill of
  `.empty-state` / `.inline-empty-state` go flat to the ground with 40px of air, `strong` at
  `--bf-app-section`, `p` at `--bf-app-row` 62ch. *Loading* — none; the button has no pending
  state. *Error* — none; `submitDelayIQ` is un-caught, a failed POST is an unhandled rejection with
  no user feedback. **The re-skin gives this section a deliberately quieter primary than the field
  composer's** — same `.bf-pill-primary` geometry, but no shadow step — so its visual confidence
  does not exceed the states behind it. *Add-on lock* — none.
- **Motion:** invert on nothing here (it has one primary); no lift (`.delayIQ-rx .panel:hover` lift
  at :603 and `.primary-button` hover at :637 are removed). One reveal (it is one of the page's
  six). Skeleton: none.
- **Tests touched:** **none.** Manual walkthrough only.

## 5.9 DelayIQs rail — "DelayIQ Categories" panel

- **Today:** `<Panel title="DelayIQ Categories">` (App.tsx:38740) with one `ResourceRow` per
  category. Static rows — not filters, not links.
- **Becomes:** frame retired; a titled list section. Each `ResourceRow` becomes a 46px row on the
  `.bf-table` row register separated by `rgba(28,28,26,0.07)` hairlines: 16px `AlertTriangle` in
  `#8a877e`, the category name at `--bf-app-row-strong`, `Tracked impact category` at
  `--bf-app-meta`, the `Monitor` badge as `.bf-tone-neutral` `--bf-app-micro`. **`.resource-row` is
  a shared primitive** — the `bf-` rules touch only its type and hairline, never its grid.
  **Because the rows do nothing, they get no hover wash, no chevron and no pointer cursor** — the
  same honesty rule as the DelayIQ table rows.
- **Every information item placed (3 of 3):** the per-category row (icon + name + the fixed detail
  line `Tracked impact category` + the `Monitor` badge) · the source, `tradeProfile.delayIQCategories`
  from `shared/src/tradeProfiles.ts`, per business type · the hardcoded six-item fallback
  `Weather` · `Material shortage` · `Labor shortage` · `Equipment issue` · `Inspection delayIQ` ·
  `Site condition` when no trade profile is stored. **No category gets a fixed icon or a fixed
  colour** — the list differs across ~15 trade profiles, so a per-category palette would break for
  most of them.
- **Every action placed (1 of 1):** none — the rows are static, and the re-skin says so visually.
- **States:** *Empty* — none possible; the fallback list means it is never empty. *Loading / Error*
  — none. *Add-on lock* — none.
- **Motion:** none. One reveal (one of the page's six). No hover move applies. Skeleton: none.
- **Tests touched:** **none.**

## 5.10 DelayIQs rail — "Impact ForecastIQ" bar chart panel

- **Today:** `<Panel title="Impact ForecastIQ">` (App.tsx:38759) — a Recharts `<BarChart>` in a
  `<ResponsiveContainer width="100%" height={220}>`, one bar per delayIQ, **reading
  `data.delayIQs` directly so the index card's view tabs, search and quick filters do not affect
  it**, with every X label truncated to 12 characters.
- **Becomes:** frame retired; a titled chart section. The chart keeps its **220px height frozen**
  and every axis setting. Palette re-based: `<Bar fill>` `#d96570` → **`#2f6bff`** (the coral is a
  member of the gradient trio and the trio is not spent in-app here), radius `[6,6,0,0]` → `[8,8,0,0]`
  onto the ladder; `<CartesianGrid stroke="rgba(28,28,26,0.07)">` already correct and kept;
  `.recharts-text` ticks → `--bf-app-micro` `#8a877e`; `.recharts-default-tooltip` →
  `#fff`, radius 12px, `1px rgba(28,28,26,0.07)`, `--bf-shadow-raised`, `--bf-app-meta`.
  **Placement is corrected, because adjacency implies a linkage that does not exist:** the section
  moves to the **bottom** of the rail, below Categories, and its head gains no filter chrome — the
  visual separation is the only available honest signal that it ignores the table's filters.
- **Every information item placed (4 of 4):** one bar per delayIQ in `data.delayIQs` (unfiltered) ·
  the X label = the title truncated to its first 12 characters (kept — shortening further or
  wrapping would change the chart's footprint) · the Y value = `impactDays` · the default Recharts
  tooltip content `days : <n>` (kept verbatim — it is the only readout of an exact value here).
- **Every action placed (1 of 1):** hover a bar for that tooltip.
- **States:** *Empty* — `<InlineEmptyState icon={LineChart} title="No delayIQ forecastIQ yet"
  detail="ForecastIQ starts once delayIQs are logged." />` when `data.delayIQs` is empty; strings
  verbatim, `.inline-empty-state`'s dashed border and `#f6f7fe` fill go flat, `strong` at
  `--bf-app-section`, `em` at `--bf-app-row` 62ch, `min-height: 96px` kept so the section does not
  jump. *Loading / Error* — none. *Add-on lock* — none.
- **Motion:** Recharts' own default bar grow-in **stays enabled** but is nulled under reduced motion
  by the new `delayiq.css`-adjacent reduce block (`isAnimationActive={false}` when
  `matchMedia('(prefers-reduced-motion: reduce)').matches`) — the one place in this cluster a chart
  animation is gated in TSX rather than CSS, because Recharts animates in JS. One reveal (one of
  six). No hover move but the tooltip. Skeleton: none.
- **Tests touched:** **none.** `test/setup.ts` stubs `IntersectionObserver` with a no-op, so nothing
  here depends on an observer firing.

## 5.11 Reports page — the cluster's one Brief surface

- **Today:** `page-stack reports-page` (App.tsx:38886); the shell gains `reports-shell` and the top
  bar switches to `reportsMode` with its own duplicated ids (`reports-notifications-panel`,
  `reports-account-menu`, `className="topbar reports-topbar"`). Six 8px-radius KPI cards with 36px
  figures, the compact `ScheduleStatusBand`, two Recharts cards and a hand-rolled crew-efficiency
  list. **No `.rx` wrapper, no aurora, no `useHudMotion`, no reveal** — the only page of the three
  still on `styles.css`/`redesign.css`.
- **Becomes:** the flattest surface in the cluster and the **only one in the display register**.
  All ten resting boundaries go (§3). Structure, top to bottom, 27px rhythm, 72px tail:
  1. **Title block** — `PageTitle` `h1` `Reports` at **`--bf-app-brief` `clamp(32px,3.6vw,46px)`
     /600/`-0.02em`/1.06**, keeping `data-tutorial-id="reports-page-title"`; subtitle
     `Production analytics, utilization, and backlog ForecastIQ.` at `--bf-app-lede` `#575550`
     capped at 62ch; the two actions right-aligned on the same line.
  2. **Status strip** — `ScheduleStatusBand` compact, keeping `data-tutorial-id="schedule-status-band"`.
  3. **Figure row** — `section.reports-kpi-grid.bf-figures` (`aria-label="Report summary"`), six
     frameless cells in `repeat(3, minmax(170px,1fr))` → `repeat(auto-fit, minmax(190px,1fr))`,
     separated by hairlines.
  4. **Charts** — `section.reports-chart-grid.bf-doc-bleed` (`aria-label="Report charts"`), two
     frameless chart sections each headed by an eyebrow + a 16px `h2`.
  5. **Crew efficiency** — `section.reports-efficiency-card` (`aria-label="Crew efficiency"`),
     frameless, four `.bf-meter` rows.
  **Why the Brief register, declared:** this is an analytics brief you read, not a board you
  manipulate; it is the one page in the cluster with no table, no selection and no row action; and
  it is the least test-pinned page in the whole area. 46px is the top rung of the same ladder
  (13 → 46 = 3.54×), not a second scale. **The risk is real and named:** a user crossing
  DelayIQs → Reports sees the page title grow from 26px to 46px. That seam is drawn on a register
  boundary a user can name (brief vs board), it applies to exactly **one** page in this cluster, and
  every other element on the page stays on the dense ladder. A reviewer who wants it dialled back
  changes one token read and nothing else.
- **Every information item placed (12 of 12):**
  - **(1)** `PageTitle` h1 + subtitle + `data-tutorial-id` → the title block above.
  - **(2)** The compact `ScheduleStatusBand` — the `+Nd`/`−Nd` figure with `ahead of plan` /
    `behind plan`, the `±Nd vs last week` delta chip with its `TrendingUp`/`TrendingDown` (only when
    a prior week's snapshot exists), `Complete <n>%`, `Behind <n> of <n>`, and `Forecast finish
    <date>` with its `Sparkles` → `.ss-strip` goes frameless: figure at `--bf-app-figure-brief`
    `clamp(26px,2.4vw,34px)`/`tabular-nums`, the `ahead/behind` word as the ×1 eyebrow, the delta
    chip `.bf-tone-*` 999px `--bf-app-micro`, the three `.ss-strip-fact` items as `.bf-figure`
    cells. `is-ahead` / `is-behind` keep their classes and their green/red tone as a **left rule**.
  - **(3–8)** The six KPI cards, all six labels, all six values, all six basis modes:
    *On-Time Completion Rate* (`<n> of <n> finished jobs` / `No finished jobs yet`) ·
    *Avg. Schedule Variance* (`<behind|ahead|on plan> across <n> running jobs` / `No running jobs`) ·
    *Crew Utilization* (`Average across <n> crews` / `No crews yet`) ·
    *Equipment Utilization* (`<n> of <n> assets in use` / `No equipment yet`) ·
    *Total Labor Hours* (`Logged this week` / `No hours logged`) ·
    *Active Backlog* with **both** modes — priced (`Unbuilt value across <n> projects` /
    `Unbuilt value · <n> of <n> projects priced`) and duration (`Remaining work on <n> open jobs ·
    add contract values for dollars` / `No open jobs`).
    Each renders as a `.bf-figure`: label as the ×1 eyebrow (was **13px/weight 900** uppercase
    `#71839f`), value at `--bf-app-figure-brief` (36px → `clamp(26px,2.4vw,34px)`, ÷1.38, on-ladder)
    with `tabular-nums` (already forced by `redesign.css`), and the basis line as
    `<em class="reports-kpi-basis">` at `--bf-app-meta` **`12px`/500 in neutral `#575550`**.
    **The basis line is a deliberate anti-pattern fix and must not be re-derived:**
    `styles.css:16788` overrides the base `.reports-kpi-card em` — which is **green, weight 900** —
    precisely because that slot used to hold a fake `+3% vs Q1` trend. The new stylesheet declares
    the neutral form **explicitly on `.bf-figure .reports-kpi-basis`** rather than relying on that
    override surviving, so a future edit to `styles.css` cannot turn every provenance note back into
    what looks like a positive delta.
    **The em dash `—` is load-bearing** and is specified: it sits in the figure slot, at figure
    size, in `#8a877e`, with `tabular-nums` and **no unit suffix, no sparkline pairing and no
    always-numeric assumption**. It is how an empty workspace refuses to state a confident 0%.
  - **(9)** Chart card 1 head `h2` `Planned vs Actual Hours` + the custom legend `Planned` /
    `Actual` → eyebrow + 16px `h2`; the legend keeps **`aria-hidden="true"`** (so the series names
    exist only visually — an existing a11y gap that a re-skin inherits, filed as §8 Q8) and its two
    swatches become 8px `50%` dots in ink and accent.
  - **(10)** Chart card 2 head `h2` `Backlog ForecastIQ (Hours)`.
  - **(11)** Crew Efficiency head `h2` `Crew Efficiency` and its four rows — `Concrete Crew 1` 94%
    (name looked up in `data.crews`, falling back to the literal), `Framing Crew 2` 88%,
    `Utility Crew 3` 81%, `Paving Crew 4` 76% → eyebrow + 16px `h2`; each row = crew name at
    `--bf-app-row-strong`, a `.bf-meter` bar driven by `--crew-efficiency`, percent `em` at
    `--bf-app-row-strong`/`tabular-nums`.
  - **(12)** Every one of the three section `aria-label`s — `Report summary`, `Report charts`,
    `Crew efficiency` — is preserved; they are the only accessible names those blocks have.
  - **The three charts** keep every axis, domain, series and geometry: *Planned vs Actual* —
    `height 260`, `barGap 8`, `margin {10,18,4,-8}`, `barSize 22`, ticks `[0,1500,3000,4500,6000]`,
    domain `[0,6500]`, `CartesianGrid stroke="#dde6ef" strokeDasharray="4 6" vertical={false}`,
    default `<Tooltip>` with `cursor fill rgba(9,32,56,0.04)`; **fills re-based `#0a233a` → ink
    `#1c1c1a` (planned) and `#2f6bff` kept (actual)**, radius `[5,5,0,0]` → `[8,8,0,0]`, grid stroke
    → `rgba(28,28,26,0.07)`, ticks `#94a4b8 12px` → `#8a877e` at `--bf-app-micro`.
    *Backlog ForecastIQ* — `height 260`, one `<Line type="monotone">`, `strokeWidth 3`, dot `r5`,
    `activeDot r6` with a 3px white ring, ticks `[0,2000,4000,6000,8000]`, domain `[0,8200]`,
    custom `ReportsBacklogTooltip`, `cursor {stroke:'#ccd5df', strokeWidth:2}`; stroke `#2f7df6` →
    **`#2f6bff`** (one accent, not two blues), cursor stroke → `rgba(28,28,26,0.13)`.
    *Crew Efficiency* — not a chart library: four CSS bars on `--crew-efficiency`, now `.bf-meter`.
  - **The hardcoded/computed split is made visible, and this is the cluster's most important
    honesty decision.** The six KPI figures are genuinely derived from
    `data.jobs`/`crews`/`equipment`/`projects`/`timecards` and carry basis provenance. **Both charts
    and all four efficiency rows are hardcoded demo arrays** (`plannedActualHours` Jan–May,
    `backlogForecastIQ` Jun–Nov, `crewEfficiency` 94/88/81/76). Unifying the card and chart styling
    would make invented numbers read exactly as authoritative as real ones. So: **every chart
    section and the efficiency section gets a `--bf-app-meta` `#8a877e` caption under its `h2`
    stating the sample period the existing data already implies** — and because that is new copy it
    is filed as §6.1 with proposed strings, **not shipped silently**. Until it is approved the two
    chart sections keep an eyebrow reading `Illustrative` — also §6.1. Nothing is removed either
    way.
- **Every action placed (5 of 5):** the `Report period` `<select>` (`aria-label="Report period"`,
  `defaultValue="last-6-months"`, options `Last 6 Months` / `Last Quarter` / `Year to Date`) —
  **a dead control: no `onChange`, nothing reads the value** · the `Export` button with its 18px
  `Download` — **a dead control: no `onClick` at all** · `ScheduleStatusBand`'s `Retry` when
  `/api/schedule/status` fails · chart hover for a tooltip · **no sort, filter, drill-down or row
  click exists anywhere on this page** and none is added.
  **Both dead controls are kept and both are visually demoted**, because a re-skin that makes them
  look more prominent makes them more trustworthy: they move to the **`.bf-pill` outline register**
  (never `.bf-pill-primary`), and each gains a `rail-tooltip` bubble. The wiring decision is §6.4 —
  and it matters more than it looks, because the `#production-reports` marketing page **sells
  exactly this pair** (a `.pr-period` chip reading `Last 6 Months` and a `.pr-export-btn` `Export`,
  under the heading *"Export the weekly review in a click"*). The two working CSV exporters next
  door (§5.1, §5.6) are the obvious model.
- **States:** *Empty* — the six per-KPI em dashes with their basis lines (all six strings above);
  `ScheduleStatusBand` compact showing `No dated projects yet — the status band fills in as work is
  planned.`; **and the standing hole: the two charts and the efficiency list have no empty state at
  all — they always paint their hardcoded arrays.** Not invented here; §6.1. *Loading* —
  `ScheduleStatusBand`'s `.ss-strip.ss-empty.is-compact` `Checking where the plan stands…`, now
  wrapped in `text-shimmer`; nothing else (`reportMetrics` is a synchronous `useMemo`). *Error* —
  `div.ss-strip.ss-failed[role=status][aria-label="Schedule status"]`, 15px `AlertTriangle`,
  `Schedule status couldn't load.` and the `Retry` that bumps an attempt counter; error register,
  62ch; **no error surface exists for the KPI computation (it cannot fail) or for the charts**, and
  none is added. *Add-on lock* — **none: Reports is not gated.**
- **Motion:** **this page gains the reveal engine, both halves in one commit** — `useHudMotion()` is
  called *and* the rest state is scoped `.reports-rx.dx-ready [data-reveal]`, so the existing
  `data-reveal` on `ScheduleStatusBand` finally receives `.in` and can never be left invisible
  (§4a). Six reveals, at budget. Invert on the two dead controls and `Retry`; **no lift anywhere**
  (`redesign.css:304-343`'s `-2px` on `.reports-card` and family is removed, §3); no tilt; no
  spotlight (there are no frames to light). Recharts' own entry animations stay, gated in TSX under
  reduced motion. `.reports-rx` adds **no** aurora, cursor or `.dx-bg` markup. Skeleton: none beyond
  the status strip's shimmer.
- **Tests touched:**
  - `App.test.tsx:623` *"opens Settings from the reports username button"* — **passes unchanged**;
    it asserts the `reportsMode` top-bar account button, which is shell, not page.
  - `App.test.tsx:281` — `Reports` in the asserted navigation set; **unchanged.**
  - `App.test.tsx:1024` — the Dashboard blocklist forbids `/Production Trend \(Backlog\)/`, which is
    **why the backlog chart lives here and not on Home**. Nothing in this mapping moves it.
  - **Everything else on this page is unpinned.** No test asserts any of the six KPI labels, either
    chart, the basis lines or the Crew Efficiency rows. That is what makes the flat/Brief treatment
    affordable and it is also why the manual walkthrough of the 12 information items above is
    mandatory, not optional.

## 5.12 Reports backlog tooltip (`ReportsBacklogTooltip`)

- **Today:** a hand-rolled Recharts tooltip (App.tsx:39008) so the backlog series reads as a
  projection rather than a raw key/value pair. Styled at `styles.css:13501-13522`.
- **Becomes:** the floating-panel register at popover scale: `#fff`, radius **12px**, `1px solid
  rgba(28,28,26,0.07)`, `--bf-shadow-raised` `0 4px 12px rgba(28,28,26,0.08)`, padding `8px 10px`.
- **Every information item placed (2 of 2):** the `<strong>` holding the Recharts `label` (the
  month, `Jun`…`Nov`) → the ×1 eyebrow · the `<span>` reading exactly `Projected Backlog : <value>`
  → `--bf-app-row-strong`/`tabular-nums`. **The string, including its spaced colon, is unchanged** —
  it is the one place the series is named as a projection.
- **Every action placed (1 of 1):** it follows the cursor; the chart's 2px `#ccd5df` vertical cursor
  line re-bases to `rgba(28,28,26,0.13)` and the active dot keeps `r=6` with its 3px white ring.
- **States:** *Empty* — returns `null` when `active` is false or `payload` is empty; nothing
  renders. *Loading / Error / Lock* — none.
- **Motion:** Recharts' own position tween, unchanged. No reveal (it is a popover). No hover move.
- **Tests touched:** **none.**

## 5.13 Marketing product page — "Field Updates & DelayIQs" (`#field-updates-delayIQs`)

- **Today:** `WelcomeFieldUpdatesDelayIQsPage` (App.tsx:11385), `<main className="cs-page"
  id="field-updates-delayIQs">` on the shared `.cs-page` product-page system with a blue/rose field
  identity (`field-updates-delayIQs-redesign.css`, **316 lines, not 441**). Every figure on it is
  illustrative mock data.
- **Becomes:** **this page is already in the target language** — it is a `.welcome-rx` surface on
  `.cs-page`, at Welcome scale. The only changes it takes are the two global decisions plus one
  consolidation:
  1. **The accent migration**: `--wx-blue` on `.welcome-rx` moves `#1a73e8` → `#2f6bff` (decision
     #2), and `rgba(26,115,232,…)` focus rings follow. The rose/coral field identity is part of the
     sanctioned trio and stays.
  2. **`--wx-serif` deletion does not touch this file** — `welcome-redesign.css:34` keeps its
     declaration because its value already *is* the Inter stack. Only the ten **app** scopes lose it
     (decision #4).
  3. **The three-copies problem is consolidated**: this page re-implements the pointer-tween and the
     `IntersectionObserver` reveal **inline** (App.tsx:11397-11417, threshold ~0.14, rootMargin
     `'0px 0px -6% 0px'`) instead of using `useHudMotion`. Its threshold becomes **0.16** to match
     the documented contract, aligning all three copies on one number. The effects themselves stay
     inline (moving them is out of scope for a presentation-only brief).
  No frame changes: the card licence is an **in-app** doctrine. This page's product-window stages
  are the thing the app is being matched *to*.
- **Every information item placed (13 of 13):** the hero eyebrow `Field Updates & DelayIQs` with its
  `.wx-dot` · the `WxRotatingHeadline` H1 — prefix `The whole field, ` cycling all six
  `fieldUpdatesPhrases` (`on the record.` · `documented.` · `logged.` · `captured.` ·
  `on the timeline.` · `in the log.`) · the hero sub · the hero mock `Live field feed` with its four
  `.fud-stat` tiles (**14** Updates, **6** On Site green, **2** DelayIQed rose, **9** Photos) · the
  `FudUpdate` feed cards (avatar initials, who line, time, message, shimmering photo thumbs with a
  `+<n>` chip, status badge) including the full `TR / Framing Crew 2 · Pinecrest / 9:15 AM /
  Inspection pushed to Friday — holding rough-in until it clears. / DELAYIQED` card · the explore
  band (eyebrow `The field reporting suite`, H2 `Everything the field should tell the office.`) ·
  the lead feature mock `DelayIQ impact · this month` with its three `.fud-impact-row` bars
  (`Weather delayIQ` / Rain 80% · 2 pours exposed / +3 days / `--w:100%` / `.high`;
  `Inspection hold` / Pinecrest moved to Friday / +2 days / 66%; `Material shortage` / Rebar for
  warehouse slab / +1 day / 33% / `.low`), its total block `6 days` /
  `total schedule impact flagged this month`, and the meta H3
  `Turn slips into recovery, not surprises.` · the `Check in from the field in seconds` feature with
  its three-card feed mock (MJ Concrete Crew 1 ON SITE, LS Utility Crew 3 IN PROGRESS,
  TR Framing Crew 2 AT RISK) · `Attach the photo that tells the story` with the `Photo evidence`
  `.fud-grid` of shimmering swatches · `Log every delayIQ with a cause` with its `.cs-tabs` strip
  (`Weather` on / `Material` / `Labor` / `Equipment` / `Inspection` / `Site`) and `.cs-list` of
  three rows (`Weather delayIQ` HIGH, `Inspection hold` MED, `Rebar shortage` MED) ·
  `Recover the day with a clear plan` with its three steps (`Move slab pour → Friday` / After
  locates return / STEP 1; `Pull framing forward` / Uses Crew 2 capacity / STEP 2;
  `Flag milestone risk` / Notify PM · 1 day at stake / REVIEW) · the why band (eyebrow
  `Why it matters`, H2 `What happens on site should reach the office by lunch.`, three
  `.cs-icon-card`s: `One source of truth for the day`, `Proof, not hearsay`,
  `Catch the slip before it spreads`) · the footer link columns `Product` / `Resources` / `Company`
  plus the wordmark footer. **The `DelayIQ impact` bars remain a pure-CSS chart** (`.fud-impact-track`
  + `.fud-impact-fill` on `--w`), no chart library.
  Note the honest tension the record surfaces: `Proof, not hearsay` points at photo evidence the
  in-app UI **cannot enlarge** — `.hs-thumbs` are 28×28, `aria-hidden`, not clickable, and there is
  no lightbox anywhere in the app. Filed as §8 Q9.
- **Every action placed (4 of 4):** the hero `Get BuildFlow` `WxMagnetic` button (`ArrowRight`,
  `ariaLabel="Get BuildFlow"`) → `onGetStarted` · the hero `See it live` (`PlayCircle`,
  `ariaLabel="See Field Updates & DelayIQs live"`) → `onOpenField`, which lands on §5.1 · back
  navigation via `onBack` · the footer anchors. **The legal row's `Back to home` is an
  `<a role="button" tabIndex={0}>` with an `onClick` and no `onKeyDown`** (App.tsx:11897) — focusable
  but not activatable by Enter or Space. Preserved; the one-line fix is §6.4.
- **States:** empty / loading / error — **none**; every panel is a static mock. Add-on lock — none.
- **Motion:** all eight recorded behaviours kept — the inline pointer tween driving `--mx/--my/--px/--py`
  for three `.wx-aurora` blobs and `.wx-cursor`; the inline reveal (threshold → 0.16);
  `@keyframes fud-shimmer` (**at :175, applied at :167**) 3.4s infinite with 0.4s/0.8s delays on the
  2nd and 3rd thumbs, **name unchanged** so its reduce null at **:303-316** keeps working; `WxTilt`
  on the hero stage (max 6, restRx 3, restRy −9) — hover move **4**, at Welcome amplitude, because
  this *is* the Welcome surface; `WxRotatingHeadline`; `WxMagnetic`; the per-feature `--i` stagger.
  Hover moves here are the full Welcome grammar: **lift** on `.cs-icon-card`, **invert** on
  `.cs-tabs`, **slide** on the footer links, **tilt** on the hero stage.
- **Tests touched:** `tests/landing-menus.test.tsx` covers the Product mega-menu item
  `Field Updates & DelayIQs` → `#field-updates-delayIQs`. **Passes unchanged** — the route, the menu
  label and the id are untouched.

## 5.14 Marketing product page — "Production Reports" (`#production-reports`)

- **Today:** `WelcomeProductionReportsPage` (App.tsx:13023), `<main className="cs-page"
  id="production-reports">`, with a **purple** identity on `.welcome-rx #production-reports`
  (`--pr-purple #7c3aed`, `--pr-purple-2 #9b72cb`, `--pr-lav #c9bce8`, `--pr-green #2f9760`).
  `production-reports-redesign.css` is **334 lines**, reduce block at **:315**.
- **Becomes:** as §5.13 — already in the target language. It takes the accent migration
  (`#1a73e8` → `#2f6bff`), keeps every `--pr-*` identity token (the purple is a page identity on a
  marketing surface, not an in-app accent, and `#9b72cb` is a trio member), and its inline reveal
  threshold aligns to **0.16**.
- **Every information item placed (12 of 12):** the four purple identity tokens · the
  `WxRotatingHeadline` H1 — prefix `The whole job, ` cycling all six `productionReportsPhrases`
  (`by the numbers.` · `in the data.` · `measured.` · `quantified.` · `in one report.` ·
  `fully tracked.`) · the hero mock `Production report` showing `heroKpis` = KPI 1, 3 and 6 · the six
  `.pr-kpi-grid.six` tiles with their invented trend deltas (`On-Time Completion` 87% `+3% vs Q1`;
  `Schedule Variance` 2.4 days `−0.6 days`; `Crew Utilization` 82% `+5%`; `Equipment Utilization`
  72% `+2%`; `Total Labor Hours` 24,180 `MTD` flat; `Active Backlog` $4.2M `6-month` flat) — **the
  same six labels the real Reports page computes, here with fabricated deltas**, which is exactly why
  the in-app basis line must never regress to a delta (§5.11) · the explore band H2
  `Every number that runs the week.` · the lead feature mock `Backlog forecastIQ · hours` rendering
  `<PrLine data={backlog} maxY={8000} />` with Jun 5200 · Jul 6100 · Aug 5800 · Sep 4900 · Oct 4200
  · Nov 3600, meta H3 `See where the work is headed.` · `Every KPI on one dashboard` repeating the
  six tiles under a `Production KPIs` mock bar · `Utilization, crew by crew` with the
  `Crew efficiency` mock (`Concrete Crew 1` 94, `Framing Crew 2` 88, `Utility Crew 3` 81,
  `Paving Crew 4` 76) · `Spot the schedule slipping early` with its `Schedule health` `.cs-list`
  (`On-time completion` 87% · up 3% vs Q1 HEALTHY; `Schedule variance` 2.4 days · improving WATCH;
  `3 jobs slipping` Behind plan this week AT RISK) · `Export the weekly review in a click` with the
  `Weekly review` mock listing `summaryRows` (`On-time completion` 87%, `Crew utilization` 82%,
  `Backlog trend` ↓ 31%, `Labor hours · MTD` 24,180) **plus the `.pr-period` chip reading
  `Last 6 Months` and the `.pr-export-btn` `Export`** — the two controls the app ships dead ·
  the why band H2 `You can't improve the number you never see.` with its three `.cs-icon-card`s
  (`Decisions from data, not gut feel`, `See utilization slipping early`,
  `Walk into the weekly review ready`) · `PrBars`'s planned-vs-actual mock (Jan 4200/3850, Feb
  4450/4250, Mar 4800/4700, Apr 5250/4900, May 5650/5100) with its `Planned` / `Actual` `.pr-legend`.
  **All three hand-rolled charts keep their construction**: `PrBars` (CSS grouped bars on `--h`,
  month axis, legend), `PrLine` (inline SVG, `viewBox 0 0 320 140`, padL/padR 6, padT 12, padB 20,
  `linearGradient #pr-area-grad` `#7c3aed` at 0.28 → 0, three `.pr-grid-line` horizontals at
  25/50/75%, the `.pr-area` fill, the `.pr-line-path` with `pathLength={1}`, `.pr-dot` circles
  `r=3.4`, the `.pr-line-x` month row), `PrEff` (CSS horizontal bars).
- **Every action placed (4 of 4):** hero magnetic `Get BuildFlow` → `onGetStarted` · hero magnetic
  `See it live` → `onOpenReports`, landing on §5.11 · back navigation via `onBack` · the footer
  anchors — with the same `Back to home` keyboard gap (App.tsx:13472), §6.4.
- **States:** empty / loading / error — none; static mocks. Add-on lock — none.
- **Motion:** all seven kept, names unchanged so the reduce block at :316-322 keeps working: the
  inline pointer tween; the inline reveal (→ 0.16); **the bars grow on reveal**
  (`.welcome-rx [data-reveal].in .pr-bar` transitions `height` to `var(--h)`, :117); **the backlog
  line draws itself** (`.pr-line-path` starts `stroke-dasharray:1 / stroke-dashoffset:1` and
  transitions `stroke-dashoffset` to 0 over **1.7s** `cubic-bezier(.4,0,.2,1)`, :187-198 — the one
  legitimate use of the size curve at entrance scale); the crew-efficiency fills animating width on
  reveal (:251); `WxTilt` (max 6, restRx 3, restRy −9); `WxRotatingHeadline`; `WxMagnetic`. The
  reduce block already snaps `.pr-bar` / `.pr-eff-fill` and sets `.pr-line-path
  stroke-dashoffset: 0`.
- **Tests touched:** `App.test.tsx:376` — the solutions-nav assertion
  `['#solutions-reports', 'Reports', 'Schedule variance']` pins the reports entry in the mega-menu.
  **Passes unchanged.**

## 5.15 Map & Field Ops — command bar (filters + live tracking + refresh + layer)

- **Today:** the first visible thing on the page (App.tsx:29354, JSX from 29354; `MapFilterSelect` at
  29943), because **`.map-ops-page .page-title` and `.map-page-tabs` are `display:none`
  (styles.css:14924) and the JSX renders neither — this is the only app page with no H1 and no
  visible title.** Four labelled native selects, a Live Tracking toggle, More Filters, Refresh and a
  gear. `styles.css` holds **three overlapping generations** of `.map-*` rules (~L3693-4600,
  ~L9142-11330, ~L14919-16800), later blocks winning by source order, much of the earlier CSS
  targeting markup that no longer exists.
- **Becomes:** a **sticky command bar on an opaque `var(--wx-bg)`** (never `backdrop-filter` — the
  page root *is* the tutorial anchor, §4e), `top: var(--hs-topbar-h)`, a single
  `1px rgba(28,28,26,0.07)` bottom hairline, no shadow. It sits below a **proposed** page header
  (§6.1 — the page's missing H1). Each filter becomes: caption as the ×1 eyebrow above a 36px
  `999px` pill holding the native `<select>` and its `ChevronDown`, `--bf-app-row` text,
  `--bf-focus-ring` on `:focus-within`. The three trailing controls become `.bf-pill` /
  `.bf-pill-primary` / a 30px `.bf-icon` with `rail-tooltip`. Below 1180px the bar wraps to two rows
  exactly as it does today.
- **Every information item placed (8 of 8):** the four labelled filter selects — **Territory**
  (`All Territories` + unique `project.location` values), **Crew** (`All Crews` + every `crew.name`),
  **Equipment Type** (`All Vehicles` + unique `equipment.type` values), **Priority** (`All Jobs` /
  `High` / `Medium` / `Normal`, hardcoded) — each keeping its caption span, its native `<select>` and
  its `ChevronDown` affordance · the `Live Tracking` toggle label with its checkbox and its CSS knob
  `<b>` → `.bf-seg` as a two-state pill that **inverts** to ink when on (the knob keeps its 160ms
  `translateX(16px)`, retimed to `--bf-dur-press` on `--bf-ease`) · the map layer state cycling
  `Production → Traffic → Satellite`, **exposed only through the gear's `aria-label="Map layer:
  <layer>"` and the More-Filters strip's Layers button text** — the `aria-label` is kept verbatim and
  the `rail-tooltip` bubble now shows the same string visually, which is the cheapest fix for the
  fact that the current layer is invisible · the recorded fact that the page has **no visible
  H1/subtitle** — addressed as a proposed addition, not silently.
- **Every action placed (5 of 5):** changing any of the four selects → `updateFilter()`, which
  re-filters jobs **and collapses "show all jobs" back to the first 5** · `More Filters`
  (`SlidersHorizontal`, `aria-expanded`) → toggles §5.16, and its icon slides 3px ·
  the `Live Tracking` checkbox → `setLiveTracking`, driving the `Live` chip on every LocationMap
  card · `Refresh` (`RefreshCcw`) → `refreshMap()`, which force-enables live tracking and stamps
  `lastSynced` with the local `h:mm` · the gear (`Settings`, `aria-label="Map layer: <layer>"`) →
  `cycleMapLayer()`, press `scale(0.94)`.
- **States:** empty / loading / error — none. *Add-on lock* — **the whole page never mounts while
  locked**; the locked chrome lives in §5.33–§5.36.
- **Motion:** invert on the two toggles and `More Filters`; slide on the `More Filters` icon;
  press-scale on the gear and `Refresh`. **No reveal on this page at all** (§4a) — you land here and
  immediately manipulate it. `.map-live-toggle b::after`'s `transition: transform 160ms ease` becomes
  `var(--bf-dur-press) var(--bf-ease)`. Skeleton: none.
- **Tests touched:** `tests/map.test.tsx` *"recounts site jobs through the filters…"* uses
  `getByLabelText("Priority filter")` and `getByRole("button", { name: "More Filters" })` —
  **passes unchanged.** **The four `aria-label`s are built as `` `${label} filter` `` in
  `MapFilterSelect` and the selects must stay native `<select>` elements**: swapping one for a
  custom listbox breaks these tests *and* the suggestion test, which deliberately scopes
  `getAllByRole("option")` to the trucker listbox precisely because these filter selects also emit
  options.

## 5.16 Map & Field Ops — "More Filters" editor strip

- **Today:** `{showMoreFilters && (… role="region" aria-label="Map filters and weather" )}`
  (App.tsx:29400) — a bare conditional mount with no enter/exit transition (it jumps in).
- **Becomes:** the same register as the command bar, one hairline below it, as a second sticky row.
  It animates open on **height + opacity over `0.3s var(--bf-ease-size)`** — the size curve, not the
  signature curve, because an overshoot on a height reads as a glitch. `role="region"` and
  `aria-label="Map filters and weather"` unchanged. **Never a `data-reveal` target** (conditionally
  mounted — §4a).
- **Every information item placed (4 of 4):** the Status filter select — `All Statuses` **+ every
  one of the ten `JOB_STATUSES` values**: `Not Started` · `Ready` · `Ready to Start` · `Planned` ·
  `Confirmed` · `In Progress` · `On Site` · `DelayIQed` · `At Risk` · `Complete` (11 options; the
  same shared list the schedule uses, and the same list that fills the inline editor's Status
  select, every `<Badge>` on the page and the site legend — so `.bf-tone-*` must define **all ten**
  tones, see §6.3) · the Traffic toggle reading `Traffic On` / `Traffic Off` with `aria-pressed` →
  `.bf-seg`, inverts · the Layers button showing the current `mapLayer` name with its `Layers` icon
  → `.bf-pill`, and this is the **one place the layer is stated in visible text** · the
  `Last sync: <lastSynced>` readout, whose initial value is the literal string **`Ready`** and then a
  localized `h:mm` after any Refresh / Optimize / route / forecast action → the ×1 eyebrow for the
  words, `--bf-app-meta tabular-nums` for the value.
- **Every action placed (3 of 3):** the Status select → `setStatusFilter` (it participates in the
  shared job filter and **can empty the site grid**) · `Traffic On/Off` (`Truck` icon) →
  `setTrafficEnabled`, **also force-enabled as a side effect of creating a truck route** ·
  the Layers button → `cycleMapLayer()`.
- **States:** *Loading* — `Last sync: Ready` is the pre-sync state, not a spinner; kept as a literal.
  Empty / error / lock — none.
- **Motion:** invert on both toggles; the strip's own height transition on `--bf-ease-size`. No
  reveal, no lift. Skeleton: none.
- **Tests touched:** `tests/map.test.tsx` `findByLabelText("Status filter")` → `Complete` empties the
  grid. **Passes unchanged** — and **Status must stay behind `More Filters`**: moving it into the
  primary bar changes the query path the test walks.

## 5.17 Map & Field Ops — "Job sites" panel (expandable LocationMap cards)

- **Today:** `section.map-panel.site-grid[aria-label="Job sites"]` (App.tsx:29428) with
  `overflow: auto` and **no `tabindex`**, holding a `repeat(auto-fill, minmax(248px,1fr))` grid of
  `LocationMap` cards (`components/ui/expand-map.tsx:53`). Replaced the embedded OSM map on
  2026-09-06. Card radius 14px on `.lm-surface`.
- **Becomes:** **the one licensed panel frame on this page** (clause 2 — it clips a scrolling world):
  `.bf-card`, radius 18px, border `rgba(28,28,26,0.07)`, `--bf-shadow-card`, `.bf-doc-bleed`,
  `overflow: auto` kept, wrapped in `<ScrollAffordance axis="y">`, and given `role="region"` +
  `tabindex="0"` **only when it actually overflows** (measured by `ResizeObserver`, the pattern
  `DashBlockBody` already uses) so a keyboard user is not forced to tab card by card.
  **Each `LocationMap` card is also licensed** (clause 1 — `role="button"`, `aria-expanded`,
  animates 140↔280px): `.lm-surface` radius 14px → **18px**, border → `rgba(28,28,26,0.07)`, rest
  shadow → `--bf-shadow-card`, `.is-selected` ring → `0 0 0 3px rgba(47,107,255,0.18)` +
  `border-color: #2f6bff`, `:focus-visible` → `--bf-focus-ring`. `--lm-accent` default `#2f6bff` is
  already correct. **The 140px / 280px framer heights, the `minmax(248px,1fr)` grid and the six
  buildings' `--lm-fill` alpha technique are frozen** (§4d).
- **Every information item placed (8 of 8):** the panel `h2` `Job sites` → `--bf-app-section`
  `16px`/600 · the sub-line `<n> site|sites · <m> job|jobs in view` (both halves pluralized;
  `m` = Σ per-site filtered counts) → `--bf-app-meta`; **the middot separator and the words
  `in view` are asserted by a whitespace-tolerant regex and must survive** · the status legend
  (`aria-label="Site statuses"`, up to 5 distinct statuses present, each a coloured dot + the status
  text) → dots 8px `50%`, text as the ×1 eyebrow; the five `mapSiteAccent()` colours are **kept
  exactly** (DelayIQed/At Risk `#c62828` · In Progress `#1f52e0` · Confirmed/On Site/Complete/Ready
  `#138a42` · Planned/Ready to Start `#0032af` · else `#8a92a6`) because they are the legend's
  information — **and note the live inconsistency they expose**: the same `DelayIQed` status shows a
  **red legend dot and a blue badge**, because `.badge.delayIQed` is declared in camelCase and can
  never match the lowercased class (§6.3) · the collapsed card face — the job count as a big
  `tabular-nums` figure plus the word `job`/`jobs`, the `LIVE` chip with its green dot (only when
  Live Tracking is on), the single-line ellipsized site name with its `title` tooltip, the meta line
  `<project.location> · <status>`, and the accent underline rule → count at `--bf-app-figure`, name
  at `--bf-app-row-strong`, meta at `--bf-app-meta` with the status half as the eyebrow, the `LIVE`
  chip as `.bf-tone-green` `--bf-app-micro` 999px · the expanded card's coordinates line, formatted
  by `formatGeoCoordinates()` as e.g. `30.2672° N, 97.7431° W`, or the literal
  `Coordinates not set` for non-finite lat/lng → `--bf-app-meta tabular-nums`; **4 decimals, the
  degree sign and the N/S + E/W suffixes are asserted and frozen, and the line must stay hidden
  while collapsed** · the card's accessible name `<site name>, <n> job|jobs` (`role="button"`,
  `aria-expanded`) → **frozen verbatim, including the singular/plural** · the hover hint
  `Click to expand` (`aria-hidden`) → `--bf-app-micro` `#8a877e`, and it gains `:focus-visible` as a
  second trigger (§4c).
- **Every action placed (4 of 4):** click / Enter / Space on a card → toggles its street view **and**
  calls `onSelect` → `setSelectedProjectId(site.id)`, which makes that project the **origin of the
  truck route and the first stop label in the optimizer** · pointer move → the 3D tilt (hover move
  **4**) · pointer enter/leave → the `LIVE` chip scales to 1.05, the title slides 4px, the accent
  rule grows 30% → 100%, the hint fades in · keyboard: `tabIndex=0` with a visible `:focus-visible`
  accent ring, now `--bf-focus-ring`.
- **States:** *Empty (no projects)* — bold `No job sites yet.` + `Create a project and its jobs to
  see them here.` (`.map-site-empty`) — the dashed border goes flat, `strong` at
  `--bf-app-section`, body at `--bf-app-row` 62ch. *Empty (no match)* — bold
  `No sites match these filters.` + `Reset the filters above to bring the other sites back.`
  **In both cases the sub-line still reads `0 sites · 0 jobs in view`** — preserved, because it is
  asserted. *Loading* — none; the panel renders straight off the bootstrapped payload. *Error* —
  none local; a bootstrap failure hits the shell error screen. *Add-on lock* — the page does not
  mount.
- **Motion:** hover move **4 (tilt)** — this is the cluster's only tilt, and it stays at its
  measured amplitude: `useMotionValue` → `useTransform([-50,50] → [8,-8]/[-8,8]deg)` →
  `useSpring({stiffness:300, damping:30})` on `rotateX`/`rotateY`, `perspective: 1000`,
  `transformStyle: preserve-3d`. Every other framer behaviour is kept exactly: the 140↔280 height
  spring `{stiffness:400, damping:35}`; the street layer's `AnimatePresence` opacity 0→1 `.4/.1`;
  the road draw-on (2 mains y35/65 sw4 `pathLength` 0→1 `.8` delay `.2 + i*.1`; 2 verticals x30/70
  sw3 `.6` delay `.4 + i*.1`; 3 thin horizontals y20/50/80 and 4 thin verticals x15/45/55/85 `.5`
  delay `.6`/`.7 + i*.1`); the six buildings (opacity 0/scale .8 → 1, `.4`, delays
  `.5/.55/.6/.65/.7/.75`); the pin drop (`scale 0 & y −20 → 1 & 0`, spring `{400, 20, delay .3}`,
  SVG teardrop in `var(--lm-accent)` with a white centre dot and a `color-mix` drop-shadow); the
  20px grid pattern fading `0.05 → 0` over `.3`; the job count fading out on expand (`.3`); the
  coordinates line's `AnimatePresence` opacity/y/height (`.25`); the title x-slide spring
  `{400, 25}`; the accent rule `scaleX .3↔1 originX 0 .4 ease-out`; the `LIVE` chip `1 → 1.05`
  (`.2`); the hint (opacity + y 4→0, `.2`). **`.lm-surface`'s `border-color`/`box-shadow` `0.16s
  ease` retimes to `--bf-dur-hover var(--bf-ease)`, and the framer springs finally get a
  reduced-motion gate** (§4h) — today `expand-map.css:316` kills only the CSS transitions.
  **`.lm-card` is never a `data-reveal` target** (its className is computed:
  `is-selected` / `aria-expanded`). No reveal on this page. Skeleton: none.
- **Tests touched:** three, all **passing unchanged**, and this is the highest-risk screen in the
  Map half:
  - *"shows one expandable job-site card per project with its job count, status and coordinates"* —
    `/1 site · 2 jobs in\s*view/`, `In Progress` within `aria-label="Site statuses"`, `role=button`
    named `Riverside Office Building, 2 jobs`, `aria-expanded` false→true→false,
    `Downtown, Austin, TX · In Progress`, `Live`, and `30.2672° N, 97.7431° W` **hidden when
    collapsed**.
  - *"recounts site jobs through the filters and empties the grid when nothing matches"* —
    `Riverside Office Building, 1 job`, `/1 site · 1 job in\s*view/`,
    `No sites match these filters.`, `/0 sites · 0 jobs in\s*view/`.
  - **`openMap()` awaits `findByRole("heading", { name: "Job sites" })` as the page-ready signal for
    EVERY map test.** Deleting or renaming that `h2` breaks the entire file. Written into the
    component header comment.

## 5.18 Map & Field Ops — "Weather at Job Sites" panel + full ForecastIQ drawer

- **Today:** `<Panel title="Weather at Job Sites">` (App.tsx:29474) with helpers at 28882-28980. A
  header card of current conditions plus an inline drawer holding up to five saved local
  "forecastIQs", all numbers deterministic from a character-code seed. `.map-weather-card` gets its
  radius from `redesign.css`'s `!important` rule.
- **Becomes:** frame retired (licence) — a titled section, eyebrow + 16px `h2`, hairline above,
  27px rhythm. **`redesign.css:305-340`'s `border-radius: var(--r-md) !important` on
  `.map-weather-card` is edited in place** (§3) or nothing here can change. The drawer keeps its
  inline expansion (no portal, no dialog) and animates on height over `--bf-ease-size`; it is
  **never** a `data-reveal` target. Saved-forecast cards keep no frame either; each becomes a
  hairline-separated row whose `.active` state is a **3px accent left rule**.
- **Every information item placed (11 of 11):** the 58px `CloudSun` glyph → kept at 58px in
  `#8a877e` (it is the section's only illustration) · the temperature (`78 F`) and the hardcoded
  condition `Partly Cloudy` → `--bf-app-figure`/`tabular-nums` + eyebrow · the details column —
  location (default `Austin, TX`), `Precip: 10%`, `Wind: SSE 8 mph`, `Humidity: 48%` → a
  four-item `--bf-app-row` definition list with eyebrow keys · the 4-day strip of buttons with their
  hardcoded labels `THU 82 / 64`, `FRI 85 / 66`, `SAT 87 / 68`, `SUN 83 / 64`, each with a 23px
  `CloudSun` → four `.bf-pill`s, day as the eyebrow, temps `tabular-nums` · the panel action text
  flipping `View full forecastIQ` ↔ `Hide full forecastIQ` with `aria-pressed` → `.bf-pill`,
  inverts · the drawer (`role="region"`, `aria-label="Full local forecastIQ"`) with its
  `Add local forecastIQ` labelled input (placeholder `City, town, or ZIP code`) · the live preview
  `<small>` reading `ZIP resolves to <City, ST>` for a ZIP, else the title-cased typed name →
  `--bf-app-meta` `#8a877e` · each saved forecastIQ card — header with the location name and either
  `ZIP <code>` or the condition; a 34px `CloudSun` + `<temp> F`; `Precip <x>% • Wind <dir> <n> mph`;
  a definition list with `Humidity` and `Condition`; and the 4-day row `Today` / `Tomorrow` /
  `Day 3` / `Day 4` each `<high> / <low> F` → name at `--bf-app-row-strong`, the rest at
  `--bf-app-row`/`--bf-app-meta`, all keys as eyebrows, all numbers `tabular-nums` · the `.active`
  class on the card matching the applied `weather.location` · the seeding rules
  (`createLocalForecastIQ`: condition from `[Partly Cloudy, Sunny, Light Rain, Breezy, Cloudy]`,
  temp `64 + seed%29`, precip 8-50%, wind dir from `[NNE,ESE,SSE,SW,WNW]` 5-16 mph, humidity 38-71%)
  and the ZIP lookup chain (a 50+ entry local table incl. every Austin `787xx`, then any `787xx`
  prefix → `Austin, TX`, then a live fetch to `https://api.zippopotam.us/us/<zip>`) — both stay
  behind the UI unchanged. **A per-day `condition` is computed for every saved day and never
  rendered** (§6.1).
  **The `forecastIQ` name is user-visible everywhere here** — `View full forecastIQ`,
  `Add local forecastIQ`, `Add ForecastIQ`, `Delete forecastIQ for …`, `.map-local-forecastIQ-list`
  — as a residue of the case-preserving rename. **Not one character of it is touched.**
- **Every action placed (6 of 6):** the panel action toggling the drawer · clicking any of the four
  day chips → **force-opens** the drawer (`setShowFullForecastIQ(true)`) · typing in
  `Add local forecastIQ` → the live preview · submitting `Add ForecastIQ` (`Plus`; label becomes
  `Adding...` under `text-shimmer`, button disabled while resolving) → resolves the ZIP/city, builds
  the seeded forecast, prepends it (dedup by id, **capped at 5**), clears the input, applies it to
  the header card and stamps `lastSynced` · `Use ForecastIQ` on a saved card →
  `applyLocalForecastIQ()` writing temp/location/precip/wind/humidity into the header and stamping
  `lastSynced` → `.bf-pill` · `Delete` (`Trash2`,
  `aria-label="Delete forecastIQ for <location|location ZIP nnnnn>"`) → removes the card, and if it
  was the applied one the next remaining card is auto-applied → 30px icon button, **the only place
  in this cluster where `.bf-icon:hover` uses the red tone**, press `scale(0.94)`.
- **States:** *Empty* — `.map-forecastIQ-empty-state`: a 20px `CloudSun` + `No saved forecastIQs
  yet.` (rarely seen — one `Austin, TX` card is seeded on mount). *Loading* — `Adding...` +
  disabled. *Error* — `p.form-error[role=alert]` `Enter a ZIP code, town, or city.` under 3 chars;
  `p.form-error[role=alert]` `That ZIP could not be matched to a city, so it was saved by ZIP.` when
  zippopotam fails or misses (**the card is still saved as `ZIP <code>`**); a thrown fetch is
  swallowed and degrades to the ZIP-only label. All three at the error register, 62ch. *Add-on
  lock* — page does not mount.
- **Motion:** invert on the panel action, the four day chips and `Use ForecastIQ`; press-scale on
  `Delete`. The drawer's height on `--bf-ease-size`. **No reveal.** No lift (the frame is gone).
  Skeleton: none — the `Adding...` shimmer is the only pending signal.
- **Tests touched:** **none.** *"No test asserts on the weather panel — it is unprotected surface
  area."* One constraint survives from the suite anyway: **tests stub `global fetch` by URL
  substring**, so `api.zippopotam.us` must stay the host that is called.

## 5.19 Map & Field Ops — "Route Optimization" panel

- **Today:** `<Panel title="Route Optimization">` (App.tsx:29585) holding **two coexisting route
  features**: a real trucker destination → fastest driving route via OSRM with Nominatim
  autocomplete, and a synthetic multi-stop optimization plan over the visible job sites. Both persist
  to `localStorage` and deliberately never clobber each other.
- **Becomes:** frame retired; a titled section split by one hairline into its two halves, so the
  coexistence the code guarantees is finally legible as two things rather than one panel. The
  **suggestion listbox keeps a frame** (clause 1 — it is a popover of interactive rows):
  `#fff`, radius **18px**, `1px rgba(28,28,26,0.07)`, `--bf-shadow-float`
  `0 24px 70px rgba(28,28,26,0.14)`, padding 8px. The **truck-route result card keeps a frame** too
  (clause 1 — it carries its own dismiss `Clear`): `.bf-card` radius 18px, with its
  `.light`/`.moderate`/`.heavy` traffic tone as a **3px left rule**, not a fill.
- **Every information item placed (13 of 13):** the panel action reading `Optimize all routes` →
  `Optimized` once a plan is saved, **omitted entirely when `hasRouteData` is false** →
  `.bf-pill` / inverted-on-`Optimized` · the trucker form's labelled field `Trucker destination`
  with placeholder `Enter delivery address` → the ×1 eyebrow label over a 36px pill · the
  autocomplete dropdown (`role="listbox"`, `id="trucker-destination-suggestions"`, up to 6
  `role="option"` rows, each a `MapPin` + a bold street line and an italic context line, deduped by
  `label|context`) → rows at 40px, street at `--bf-app-row-strong`, context at `--bf-app-meta`
  italic, `[aria-selected="true"]` → `rgba(47,107,255,0.08)` + `#2f6bff` + `translateX(3px)` ·
  the submit text `Create Traffic Route` → `Finding Route...` (`Route` icon) under `text-shimmer` ·
  the result card — header `Fastest truck route` with its `Truck` icon; a status `<Badge>` mapped
  **Heavy → `At Risk`, Moderate → `In Progress`, Light → `Ready`**; a `From` / `To` / `Drive Time` /
  `Distance` definition list; and the footer line
  `<Light|Moderate|Heavy> traffic • live road route|estimated route` → head at
  `--bf-app-section`, keys as eyebrows, values `tabular-nums`, footer at `--bf-app-meta` · the
  origin label = the **selected** job site's shortened name via `shortMapLabel`
  (`Office Building`→`Office Bldg`, `Apartments`→`Apts`), falling back to `Austin Dispatch Yard` /
  `Austin, TX` / lat 30.2672 lng −97.7431 — **frozen: the test asserts the shortened form
  `Riverside Office Bldg`** · the coexistence note, shown only when a plan is also saved:
  `Your optimized plan is saved underneath — clear this route to return to it.` — **frozen verbatim
  including its em dash**, at `--bf-app-meta` 62ch · the optimizer stat block
  (`.route-optimizer-grid.reference-route-optimizer`): `Estimated total drive time` + the figure +
  `↓ <n>% <drive time|fuel burn|time & fuel> vs current routes` → label as the eyebrow, figure at
  `--bf-app-figure`/`tabular-nums`, the savings line at `--bf-app-meta` · the optimizer definition
  list `First Stop` / `Last Stop` / `Total Distance`, where distance reads the literal **`Pending`**
  with no geometry · the goal control (`role="group"`, `aria-label="Optimization goal"`, three
  `aria-pressed` buttons `Fastest Time` / `Least Fuel` / `Balanced`) → `.bf-seg`, inverts; the three
  profiles (33mph/18%/`drive time`, 25mph/15%/`fuel burn`, 29mph/13%/`time & fuel`) genuinely change
  the figure and are untouched · the formatting rules (haversine × 1.28 road factor;
  `formatRouteDistance` 2dp under 10mi else 1dp; `formatRouteDuration` `<n> min` under an hour else
  `<h>h <mm>m`) · the traffic classification (<18 Heavy, <30 Moderate, else Light) · the plan
  geometry (up to 4 saved routes, one per ordered project pair, coloured
  `route-blue`/`route-green`/`route-orange`/`route-purple`; a single project draws one offset arc) —
  **computed and persisted but never drawn**, because the SVG `.route-lines` renderer is dead CSS.
  That is preserved as-is and flagged in §6.4; the four route colour classes are **not** re-based,
  because nothing paints them.
- **Every action placed (11 of 11):** typing ≥3 chars → a 280ms-debounced Nominatim search
  (`format jsonv2`, `addressdetails`, `countrycodes=us`, `limit 6`), skipped while the field holds an
  already-picked suggestion · focusing with existing suggestions reopens the listbox; blur closes it
  after a 150ms grace · `ArrowDown`/`ArrowUp` wrap through the list (`activeSuggestionIndex`,
  `aria-selected`) · `Enter` selects the active suggestion, `Escape` closes the list · pointer-enter
  makes a row active and `mousedown` is `preventDefault`ed so the click lands before blur ·
  clicking a suggestion fills the field with `<label>, <context>`, clears the list and the error, and
  stores the picked point so submitting does **not** re-geocode · submit → geocode (skipped for a
  picked suggestion) then OSRM `/route/v1/driving` with `overview=full`, `geometries=geojson`,
  `alternatives=true`, lowest-duration alternative, polyline compacted to 48 points, saving a
  `trucker-route-<ts>` `SavedMapRoute` (label `Truck route to <dest>`, `vehiclePoint` at 35% along the
  polyline, `stopPoint` at the destination), force-enabling Traffic and stamping `lastSynced`; on any
  failure it falls back to `estimatedDrivingRoute` (haversine × 1.28 at 26mph) tagged
  `source: "estimated"` · `Clear` (X) drops **only** the trucker route, clears the
  result/error/input/picked suggestion and stamps `lastSynced` — **the plan survives** ·
  a goal chip → `setOptimizationGoal`, live-recomputing drive time, savings and the savings label ·
  `Optimize Routes` (`Sparkles`) and the panel action → `optimizeRoutes()`, rebuilding plan routes
  from the visible projects + filtered jobs, **keeping any trucker route**, setting `optimized=true`
  and stamping `lastSynced` · the persistence `useEffect` writing to
  `buildflow:map-field-ops:saved-routes:v1` on every change, with `readSavedMapRoutes()` rehydrating
  and normalizing on mount (dropping routes with <2 points or an unknown class).
  **The coexistence discriminator is the id prefix** (`trucker-route-` vs `saved-`, excluding
  `saved-reference-`). **Any id-scheme change silently makes the two features clobber each other**;
  the mapping touches none of it.
- **States:** *Empty (no route data)* — `<InlineEmptyState>` with the `Route` icon,
  `No route data yet` + `Add jobs and project locations before optimizing routes.`, **and the panel
  action disappears**; frameless, `strong` at `--bf-app-section`, `em` at `--bf-app-row` 62ch,
  `min-height: 96px` kept. *Empty (no geometry)* — `Total Distance` renders the literal `Pending`
  and drive time `0m`. *Loading* — the submit's `Finding Route...`; and
  `li.trucker-suggestions-empty` `Searching addresses…` while `truckSuggestLoading` with no results
  yet, under `text-shimmer`. *Error* — `p.form-error[role=alert]`
  `Enter a full destination address.` under 5 chars; `p.form-error[role=alert]`
  `That destination could not be found. Try a full street address, city, and state.` when geocoding
  throws; **an OSRM failure is silent and degrades to an "estimated route" whose footer line says
  so**; a `localStorage` write failure is swallowed by design. *Add-on lock* — page does not mount.
  **A recorded reload gap is preserved:** rehydration restores geometry nothing draws, while
  `truckRouteResult` starts `null` and `optimized` starts `false` — so after a refresh the result
  card and the coexistence note are gone and the action reads `Optimize all routes` again (§6.4).
- **Motion:** invert on the goal chips, the panel action, `Optimize Routes` and `Create Traffic
  Route`'s ghost sibling; slide 3px on the active suggestion row and on `Clear`'s X (press-scale);
  **no lift, no reveal.** `.trucker-suggestions li button:hover/.active` colour change retimes to
  `--bf-dur-hover var(--bf-ease)`. Skeleton: the two `text-shimmer` labels.
- **Tests touched:** four, all **passing unchanged**, and every frozen string is listed above:
  - *"keeps the optimized plan and a truck route from clobbering each other"* —
    `Estimated total drive time` numeric, `/drive time vs current routes/`, `Least Fuel` →
    `/fuel burn vs current routes/` **and a different drive time**, `Optimize Routes` →
    `Optimized`, `Fastest truck route`, the exact coexistence sentence, `Clear` removing only the
    truck route. **The drive-time `<strong>` is read positionally
    (`driveTimeLabel.parentElement.querySelector("strong")`) — the label and the figure must stay
    siblings inside one parent.** The `.bf-figure` treatment keeps them so; written into the header
    comment.
  - *"suggests trucker destination addresses as the user types"* — `combobox` named
    `Trucker destination address`, `1 Old Ferry Road` / `Bristol, Rhode Island` /
    `1 Old Farm Road`, `aria-expanded` true, `getByRole("listbox")` with **exactly 2** `role=option`
    children, picking one fills the input and collapses the list. **The input must stay
    `role="combobox"` with `aria-autocomplete="list"`, `aria-controls`, `aria-expanded` and
    `autoComplete="off"`.**
  - *"routes to a picked suggestion without re-geocoding it"* — the result card contains
    `1 Old Ferry Road` and the shortened origin `Riverside Office Bldg`; **zero extra Nominatim
    calls, >0 OSRM calls** — so `router.project-osrm.org` and `nominatim` must stay the hosts.
  - Also asserts `No route data yet` is **absent** when the fixture has jobs.

## 5.20 Map & Field Ops — "Travel Time Overview" panel

- **Today:** `<Panel title="Travel Time Overview">` (App.tsx:29749) — up to the first 4 crews, each
  row a shortcut that filters the whole page to that crew. **Minutes are hardcoded positional
  values `[18, 24, 32, 16]` with a `22` fallback, and the Badge is hardcoded by index** (`Medium`
  for the third row, `Ready` for the others).
- **Becomes:** frame retired; a titled list section. Rows sit on the `.bf-table` row register (46px,
  hairline-separated) and — because they **do** act — they keep a hover wash
  `rgba(28,28,26,0.035)`, a pointer cursor and a trailing chevron that slides 3px.
- **Every information item placed (5 of 5):** the first four crews (`data.crews.slice(0, 4)`) ·
  per row a `Truck` icon (16px `#8a877e`), the crew name at `--bf-app-row-strong`, the bold minutes
  figure at `--bf-app-row-strong`/`tabular-nums`, and a status `<Badge>` as `.bf-tone-*` · the
  hardcoded minute values and their `22` fallback · the index-hardcoded badge · the panel action
  label `View details`.
  **All three of its columns** — Crew name · Travel minutes · Status badge — keep their order.
  Because the minutes and badges are fabricated, the section's `h2` gains the same `Illustrative`
  eyebrow treatment proposed for the Reports charts (§6.1) rather than being visually equated with
  the computed figures elsewhere on the page.
- **Every action placed (2 of 2):** clicking a crew row → `updateFilter("crew", crew.name)`, which
  filters the **entire page** (site cards, today's jobs, optimizer) · the panel action
  `View details` → `refreshMap()` — **a misleading label: it only re-stamps the sync time.** Kept,
  demoted to the `.bf-pill` outline register, and filed as §6.4.
- **States:** *Empty* — `<InlineEmptyState>` with the `Truck` icon, `No fuel data yet` +
  `Vehicle and equipment activity will appear after records are added.` — **the title says fuel, the
  panel says travel time; an existing copy mismatch, preserved verbatim** and filed as §6.4.
  Loading / error / lock — none.
- **Motion:** slide on the row chevron and the panel action; hover wash on the rows; **no lift, no
  reveal.** Skeleton: none.
- **Tests touched:** **none.**

## 5.21 Map & Field Ops — "Today's Field Jobs" panel + inline job editor

- **Today:** `<Panel title="Today's Field Jobs" className="map-today-jobs-panel">` (App.tsx:29774) —
  the filtered job list as expandable rows; clicking a row selects its project on the map **and**
  opens an inline 4-field editor that **writes to local draft state only and is lost on unmount**.
  Its radius comes from `redesign.css`'s `!important` rule.
- **Becomes:** frame retired (and that `!important` rule edited, §3). A titled list section on the
  `.bf-table` row register: 54px rows at ≤1420px per the existing responsive regrid, hairlines,
  hover wash + chevron (the rows **do** act). The **inline editor region keeps a frame** (clause 1 —
  it is a disclosure the row itself controls): radius 12px, `1px rgba(28,28,26,0.07)`,
  `rgba(28,28,26,0.02)` fill, opening on height over `--bf-ease-size`. `role="region"` and
  `aria-label="Edit <job name>"` unchanged. **Never a `data-reveal` target.**
- **Every information item placed (7 of 7):** the panel action `View all (<filteredJobs.length>)`
  with `aria-pressed` reflecting `showAllJobs`, collapsed to the first 5 → `.bf-pill`, count
  `tabular-nums` · the project colour swatch `.project-thumb` from `imageThemes[project.image]`
  (office-building / apartments / medical-center / warehouse / parking-garage gradients) → 32px,
  radius 8px, **the five gradients are kept: they are per-project identity, not decoration** · the
  copy block — project name (or `Unassigned Project`) at `--bf-app-row-strong`, the project address
  (falling back to the job's location) at `--bf-app-meta`, the job phase in a `<small>` at
  `--bf-app-micro` `#8a877e` · the time block — the job start time in bold
  (`--bf-app-row-strong`/`tabular-nums`) + a status `<Badge>` as `.bf-tone-*` · the crew block —
  crew name (or the `Crew <n>` fallback) plus an avatar stack of up to 3 emoji avatars and a `+<n>`
  overflow chip when `crew.size > 3` → 24px `50%` avatars overlapping −6px, chip
  `--bf-app-micro`. **Corrected per the record: the faces come from `data.users` sliced to
  `Math.min(3, Math.max(1, (crew.size ?? 3) − 1))`, not from the crew's members — so the same 1–3
  avatars repeat on every row and the `+n` chip is `crew.size − 3`.** The re-skin does not paper over
  that; the stack is styled as a decorative `aria-hidden` group so it never implies a named roster.
  · the crew resolution rule (the first assignment for that job, else a round-robin over
  `data.crews`) · the `.active` class on the open row → a 3px accent left rule.
  **All three columns** — Project (thumb + name + address + phase) · Start time + status · Crew +
  avatar stack — keep their order and the ≤1420px `54px/1fr/68px` regrid with the crew block
  wrapping to its own line.
- **Every action placed (3 of 3):** clicking the row's main button (`aria-expanded`) → sets the
  map's `selectedProjectId` **and** toggles the inline editor (only one open at a time) · the panel
  action `View all (n)` · the inline editor's four fields — Job name (text), Start time (text),
  Location (text), Status (select over the ten `mapStatusOptions`) → `updateJobDraft()`.
  **The editor never persists.** Because `jobDrafts` feed the filters, the site cards' status and the
  site accents, the editor is styled as a **draft**: its frame carries the eyebrow
  `Unsaved draft` — new copy, so it is filed as §6.1 — and until that is approved it keeps today's
  chrome exactly, with no Save-like affordance added and no primary-button styling on anything
  inside it.
- **States:** *Empty* — `<InlineEmptyState>` `MapPin`, `No active jobs on map` +
  `Jobs will appear here after you create and schedule them.` Loading — none. *Error* — none; the
  editor cannot fail because it never saves. Lock — page does not mount.
- **Motion:** slide on the row chevron and the panel action; hover wash; the editor's height on
  `--bf-ease-size`; **no lift** (`redesign.css`'s 200ms transform transition on
  `.map-today-jobs-panel` is removed with the frame), **no reveal.** Skeleton: none.
- **Tests touched:** **none directly**, but the panel renders in every map test, so it must not
  throw and `Job sites` must still be the first heading `openMap()` finds.

## 5.22 Map & Field Ops — "Field Updates" panel + note composer (the third field-update surface)

- **Today:** `<Panel title="Field Updates" className="map-field-updates-panel">` (App.tsx:29857) —
  a read-only feed with a photo strip on the newest update, plus a composer stub. Radius from the
  `!important` rule.
- **Becomes:** frame retired (rule edited, §3); a titled list section on the `.bf-table` row
  register, rows **without** a hover wash or chevron (they do nothing — the same honesty rule as
  §5.6). The composer is a labelled block that opens on height over `--bf-ease-size`.
- **Every information item placed (6 of 6):** the panel action `View all` with `aria-pressed
  showAllFieldUpdates`, collapsed to the first 3 of `data.fieldUpdates` → `.bf-pill` · per update
  the reporter's emoji avatar (28px `50%`), the name at `--bf-app-row-strong`, an italic
  `<title>` or `<title> - <job name>` line at `--bf-app-meta`, a status `<Badge>` as `.bf-tone-*`,
  and a `<time>` element with the `h:mm` posted time (`formatTime` → `Intl.DateTimeFormat`
  hour/minute) at `--bf-app-meta tabular-nums` — **the hyphen separators in that meta line are
  asserted verbatim** · the update message body at `--bf-app-row`/1.45, capped at 62ch · the photo
  strip **on the first update only** — up to 4 `FieldPhotoThumb` tiles (an `<img alt="Field update
  attachment">` for image URLs, a `FileText` link for file attachments, else a gradient swatch keyed
  to the project image) plus a `+<n>` overflow when there are more than 3 → 40px tiles, radius 8px,
  `1px rgba(28,28,26,0.07)`; **the off-by-one is preserved** (it slices 4 but counts from 3) and
  filed as §6.4 · the reporter falling back to `data.activeUser` when the `userId` does not
  resolve · the composer textarea **prefilled with the fake string** `Crew on site and staging
  materials. Ready to begin at 9:00 AM.`
- **Every action placed (4 of 4):** the panel action `View all` toggling 3 vs all ·
  `Add Field Update` (`Plus`) opening the composer — **the SAME button then reads
  `Save Field Update` and clicking it only closes the composer; the draft is never submitted
  anywhere** → both labels frozen (both are asserted), and the button stays in the **`.bf-pill`
  outline register in both states**, never `.bf-pill-primary`, so a stub never looks like a save ·
  editing the composer textarea (label span `Update note`, `rows=3`) · a file-attachment thumb
  opening in a new tab (`target="_blank" rel="noreferrer"`, `title`/`aria-label="Open attachment"`).
- **States:** *Empty* — `<InlineEmptyState>` `MessageCircle`, `No field updates added yet` +
  `Updates from crews and supervisors will appear here.` *Loading* — the photo `<img>` keeps
  `loading="lazy"`. Error — none. Lock — page does not mount.
- **Motion:** invert on the two `.bf-pill`s; the composer's height on `--bf-ease-size`; **no lift,
  no reveal, no row hover.** Skeleton: none.
- **Tests touched:** `tests/map.test.tsx` *"lists field updates beside the sites and opens the update
  composer"* — **passes unchanged.** It scopes to the `Field Updates` heading, then asserts the
  per-article reporter name, the exact meta lines `Crew Lead - Crew 2 - Riverside Office Building`
  and `Project Manager - Downtown Retail Buildout`, status `On Site`, that `Update note` is absent
  until `Add Field Update` is clicked, and that the button then reads `Save Field Update`.

## 5.23 Map & Field Ops — page footer

- **Today:** `footer.map-ops-footer` (App.tsx:29929) — a marketing-style legal footer inside the
  application shell, unique to this page. Stacks to a column under 760px.
- **Becomes:** a hairline-topped footer band at the very bottom of the page, **inside the 72px
  tail**: the copyright at `--bf-app-meta` `#8a877e`, the three links as `.bf-pill`-less inline
  text links at `--bf-app-meta` that **slide 3px** on hover (move #3).
- **Every information item placed (2 of 2):** `© 2026 BuildFlow HUD, Inc. All rights reserved.` ·
  the `nav[aria-label="Map footer links"]`.
- **Every action placed (1 of 1):** the three `<button>` elements with **no `onClick`** —
  `Privacy Policy`, `Terms of Service`, `Help Center`. **Kept, and this is the one place in the
  cluster where a re-skin actively reduces a promise:** they are styled as `--bf-app-meta` muted
  text with no underline and no accent, so they read as a legal line rather than as live links —
  while remaining focusable `<button>`s at their existing accessible names. Wiring them to the real
  `#privacy` / `#terms` / `#help-center` welcome pages that already exist is §6.4.
- **States / Motion:** none / slide only. No reveal. Skeleton: none.
- **Tests touched:** **none.**

## 5.24 TimeCard — page header + summary stat grid + **seven**-tab bar

- **Today:** `TimeCard.tsx:192` (`TimeCardPage`), `.tc-page` with its own token block
  (`--tc-radius: 16px`, `--tc-card-shadow`, nine tone pairs). H1, subtitle, a navy week chip, a dead
  `Export`, four KPI stats and the **seven**-tab switch. `data-tutorial-id="timecard-page-title"` at
  TimeCard.tsx:211; `section aria-label="TimeCard summary"` at :218.
  **The whole page runs on the seeded `timecardModel`** — `buildTimecardModel(_data)` ignores its
  `BootstrapPayload` argument entirely, so the stat figures do **not** come from the tenant's data.
- **Becomes:** the standard operational header + a frameless figure row + a sticky tab bar:
  1. `h1` `TimeCard` at `--bf-app-title` `clamp(22px,1.9vw,26px)`, keeping
     `data-tutorial-id="timecard-page-title"`.
  2. Subtitle at `--bf-app-lede` `#575550`, 62ch.
  3. The week chip re-based off `var(--navy)` onto **ink `#1c1c1a` / `#fdfcf9`**, 999px, 8px 13px,
     `--bf-app-micro` — the cluster's one ink pill (matching the Welcome Page's `.wx-btn-ink`).
  4. `section.bf-figures[aria-label="TimeCard summary"]` — four frameless `.bf-figure` cells.
  5. `nav.tc-tabs.bf-seg[aria-label="TimeCard sections"]` — sticky under the command register on an
     **opaque `var(--wx-bg)`**, `overflow-x: auto` kept and **wrapped in `<ScrollAffordance
     axis="x">`** (today the 7-tab bar scrolls horizontally with no fade and no arrow).
  `--tc-radius: 16px` → **18px** on the six frames that survive; `--tc-card-shadow`
  (`0 1px 2px … , 0 18px 40px -30px rgba(9,32,56,0.45)`) → `--bf-shadow-card`.
- **Every information item placed (10 of 10):** `h1` `TimeCard` · the subtitle
  `Daily labor hours, cost, approvals, and certified-payroll compliance · <weekLabel>` where
  `weekLabel` = `<Mon label> – <Sun label>, 2026` from `tcWeekLabel` · the week chip with its
  `CalendarClock`, repeating the week label · **stat 1** (`Clock`, blue)
  `Hours logged this week` = `formatHours(totals.totalHours)` e.g. `1490.5 hrs`, hint
  `<reg> hrs reg · <ot> hrs OT` · **stat 2** (`DollarSign`, green) `Burdened labor cost`, compact
  currency, hint `<base compact> base + 31% burden` · **stat 3** (`Timer`, amber)
  `Overtime pending approval`, hint `across <n> timecards` · **stat 4** (`ClipboardCheck`, violet)
  `Timecards awaiting approval`, hint `<budgetPct>% of weekly budgeted hours used` (weekly budget =
  Σ`project.budgetHours / 26`) → each a `.bf-figure`: eyebrow label, `--bf-app-figure` value with
  `tabular-nums`, `--bf-app-meta` hint, 34×34 tone chip. **Stat 3's chip is `--tc-amber`, which is
  `#0b4ae8` — a blue** (§6.3) · the seven tabs with their icons: `Time Entry` (`Clock`),
  `Labor Cost` (`DollarSign`), `Crew & Assignment` (`Users`), `Approvals` (`ClipboardCheck`),
  `Integrations` (`Link2`), `Reporting` (`TrendingUp`), `Compliance` (`ShieldCheck`), each with
  `aria-pressed` → `.bf-seg` items at the ×1 eyebrow, active **inverts** to ink (was navy/white) ·
  the `data-tutorial-id` anchor · the seeded-model provenance (5 crews, 30 workers, 4 curated
  projects **Riverside Medical Center RMC-118 / Harborview Terminal HVT-204 / Pinecrest Ridge
  Utilities PRU-051 / Tech Ridge Logistics Hub TRL-330**) — recorded here so every tab below can
  name its row labels.
- **Every action placed (2 of 2):** clicking any of the seven tabs → switches the body (a single
  `useState`, **no URL/hash persistence, so a reload lands back on Time Entry**) · the header
  `Export` (`Download`, `.tc-btn.ghost`) — **a dead button with no `onClick`**. Kept, held in the
  `.bf-pill` outline register, given a `rail-tooltip`; wiring is §6.4.
- **States:** *Empty* — none; the seeded model always has content. *Loading* — none local; the shell
  shows `.loading-screen` `Loading BuildFlow HUD` with its spinning `Loader2`. *Error* — none local;
  the shell shows `.loading-screen.error-screen` with the message, `Try again` and
  `Back to log in`. *Add-on lock* — **the page never mounts**; §5.33–§5.36.
- **Motion:** invert on the tab bar and `Export`; `.tc-btn`'s `-1px` hover lift and its `0.12s`
  timings go (§3, §4a) — `.tc-btn` transitions become `--bf-dur-hover var(--bf-ease)`; `.tc-tab`'s
  `0.14s` likewise. **No reveal on this page** (§4a) — and **the tab bodies must never become
  `data-reveal` targets**, because they are keyed by the tab state and `useHudMotion`'s reveal effect
  never re-queries after a keyed remount, which would leave every tab after the first permanently
  blank with no error. Written into the file header. Skeleton: none.
- **Tests touched:** **NONE — the entire TimeCard page has zero test coverage** in `App.test.tsx`,
  `tests/*.test.tsx` or `schedule/*.test.tsx`. The tab switch, the approval chain, the OT clear, the
  audit prepend and the export flip have no regression protection at all. Two consequences: the
  manual walkthrough of §5.24–§5.32's item lists is the only verification, and **§6.5 proposes the
  two smallest possible new tests** (tab switch, approval chain advance) before this file is touched.

## 5.25 TimeCard — Tab 1 "Time Entry"

- **Today:** `TimeCard.tsx:300` (`TimeEntryTab`) — a `Log time` card, an offline banner, and a
  `Recent entries` card showing the 12 newest entries. All state is component-local; nothing POSTs.
- **Becomes:** two sections and a banner. `Log time` loses its frame (titled section, eyebrow + 16px
  `h2` + hairline). `Recent entries` **keeps** its frame (clause 2 — it wraps a `.tc-table-scroll`),
  `.bf-card` radius 18px, `ScrollAffordance axis="x"`. The offline banner is a full-width strip with
  a 3px left rule in its state tone, no frame. The entry grid collapses to one column at ≤640px, as
  today.
- **Every information item placed (13 of 13):** the `Log time` card head with its `Plus` icon and
  the subtitle `Crew leads log by job, phase, and task` → eyebrow + 16px `h2` + `--bf-app-meta` ·
  the live cost estimate `Est. $<regular*baseRate + overtime*baseRate*1.5>` with
  `<$rate>/hr · <role>` underneath → `--bf-app-figure`/`tabular-nums` + `--bf-app-meta` · the verify
  row state text `Photo attached` / `Photo off` and `GPS verified` / `GPS off` → `--bf-app-micro`,
  the on state in `--wx-green` · the success line `Entry added and submitted for approval.`
  (`CheckCircle2`), auto-clearing after **2400ms** → `role="status"`, appears instantly, green,
  62ch · the quick-add chip row labelled `Jobsite quick add`
  (`aria-label="Mobile quick entry"`) with `Clock 8 hrs`, `Add 30 min break`, `Start OT`,
  `Copy yesterday` → the label as the ×1 eyebrow, the four chips as `.bf-pill`s · the offline
  banner's two forms — `<n> entries stored offline` + `Captured on the jobsite — will sync when
  connected.` (`WifiOff`, `.pending`) **or** `All entries synced` +
  `Local device is up to date with BuildFlow.` (`CheckCircle2`, `.synced`) → `strong` at
  `--bf-app-row-strong`, body at `--bf-app-meta` 62ch, tone as a left rule · the `Recent entries`
  head with subtitle `<n> logged this week`, 12 newest sorted date-desc · the worker cell (initials
  avatar + name + role) → 28px avatar, `--bf-app-row-strong` + `--bf-app-meta` · the project cell
  (project name + phase) — **the six phase values are `Foundations`, `Structure`,
  `Underground Utilities`, `Paving`, `Electrical Rough-In` and `Material Staging`** · the day cell
  (the `weekDays` label for the entry date) · the OT cell rendering an **em dash `—` when zero**,
  else a highlighted `.tc-ot` number → the em dash at `#8a877e`, `tabular-nums`, and **it is
  load-bearing exactly as on Reports: the value slot is not always numeric** · the verify cell's two
  icon chips (`Camera title="Photo"`, `MapPin title="Location"`), lit when true → 20px chips, both
  `title`s kept, lit = accent · the status pill (`Approved` green / `Submitted` blue / `Draft` slate
  / `Flagged` red, **or the literal `Offline` in slate when not synced**) → `.bf-tone-*` · the five
  templates `Concrete pour day` (8+1), `Steel & framing` (8+0), `Underground utilities` (8+2),
  `Paving shift` (8+2), `Electrical rough-in` (8+0) · the stamping rule (new entries always
  `date = tcWorkDays[3].date` Thursday, `source "Manual"`, `synced true`, `status "Submitted"`).
  **All 7 columns** keep order: Worker · Project · Phase · Day · Reg · OT · Verify · Status —
  rendered as the record lists them (Worker, Project · Phase, Day, Reg, OT, Verify, Status), `thead`
  = the ×1 eyebrow, 46px rows.
  **`TcEntry.note` is computed and never displayed** (`Hours exceed scheduled crew window` on
  Flagged entries, `Split shift — staging support` on alt-project entries) — §6.1.
- **Every action placed (10 of 10):** selecting a `Timecard template` → `applyTemplate()` jumping
  the Worker to that crew's lead and filling Project, Task, Regular and Overtime · selecting a
  Worker (grouped by crew via `<optgroup>`, options `<name> · <role>`) → auto-sets Project and Task
  · selecting a Project · typing a Task/phase · setting Regular (number 0–16 step 0.5) and Overtime
  (0–12 step 0.5), live-recomputing the estimate · toggling `Photo` and `GPS` (`.tc-verify.on`) →
  `.bf-seg`, invert · submitting `Add entry` → prepends a `TcEntry`, flashes the success line and
  highlights the new row for **2.2s** · `Sync now` (`RefreshCw`, only when unsynced entries exist)
  → marks every unsynced entry synced + Submitted → `.bf-pill` · **the four `Jobsite quick add`
  chips have NO `onClick`** — kept, and held in the outline register with a `rail-tooltip`; §6.4 ·
  all state component-local, resetting on tab or page change.
- **States:** *Empty* — none modelled; the seeded week always has entries. *Loading* — none (no
  async). *Error* — **none: no validation at all**; a blank task silently falls back to the crew
  task then `Field work`. The re-skin adds no error channel (that would be new copy) but the submit
  is held at outline weight until the form is valid, matching §5.8's discipline.
  *Add-on lock* — page does not mount.
- **Motion:** invert on the two verify toggles, the four quick-add chips, `Sync now` and the
  template select's chrome. `@keyframes tcRowIn` (timecard.css:644 — **the only CSS keyframe in the
  whole Map/TimeCard area**) keeps its name and its 2.2s duration, its fade re-based from
  `--tc-green-soft` to `rgba(47,107,255,0.08)`, and **it finally gets a reduced-motion null** (the
  row appears already-settled). `.tc-row-new` is a dynamic class, so that row is **never** a
  `data-reveal` target. No reveal, no lift. Skeleton: none.
- **Tests touched:** **none.**

## 5.26 TimeCard — Tab 2 "Labor Cost"

- **Today:** `TimeCard.tsx:565` (`LaborCostTab`) — five cards: a re-pivotable breakdown table with a
  `tfoot` total, cost composition, project profitability impact, hourly rates by role, and overtime
  flags.
- **Becomes:** **two frames survive** (clause 2 — the breakdown table and the rates table each wrap
  a `.tc-table-scroll`, both getting `ScrollAffordance axis="x"`); the other three become titled
  sections. `.tc-cost-grid` collapses to one column at ≤1080px as today.
- **Every information item placed (10 of 10):** the `Labor cost breakdown` head with subtitle
  `Regular, overtime, and burdened cost` and the 4-way segmented control
  (`role="tablist"`, `aria-label="Breakdown dimension"`) **Project / Crew / Phase / Worker, which
  also renames the first column** → `.bf-seg`, inverts · the `tfoot` **Total** row summing Reg, OT,
  Hours, Base and Burdened → `--bf-app-row-strong`/`tabular-nums` with a `1px
  rgba(28,28,26,0.13)` top border · the Share column as a proportional green bar of burdened cost
  vs the max row → `.bf-meter` · the row sublabels — project `<code> · <location>`, crew
  `<trade> · <project>`, worker `<role> · <crew>`, **phase rows have none** → `--bf-app-meta` ·
  the `Cost composition` card (`Layers`) with **its visible subtitle `Where the labor dollar
  goes`** (recorded as UI copy, not an annotation), its `Regular time` / `Overtime` rows with the
  `1.5×` amber pill (**a multiplication sign U+00D7, not an `x`**) and `Burden` with the `31%`
  violet pill, its `Fully burdened` total row, and the footnote `Burden adds benefits, payroll
  taxes, and workers' comp on top of base wages so project cost reflects true labor spend.` →
  rows at `--bf-app-row`, pills `.bf-tone-*` `--bf-app-micro`, footnote `--bf-app-meta` 62ch ·
  the `Project profitability impact` card (`Gauge`) with subtitle
  `Actual burdened labor vs weekly budget`; per project a label + sublabel, a progress bar turning
  `.over` past 100%, a meta line `<actual> / <budget> hrs` plus `<pct>% used` or `+<n>% over`, and
  the burdened cost → `.bf-meter` with the `.over` tone; budget rows stack at ≤640px as today ·
  the `Hourly rates by role` card (`Wrench`) with subtitle `Base and prevailing-wage scales`, roles
  sorted by base rate desc, and the class pill from `ROLE_RATES` (`Labor` / `Operator` /
  `Supervisor`) · the `Overtime flags` card (`AlertTriangle`) with subtitle
  `Entries above the 8-hour daily threshold`, up to 6 flagged entries each showing a red dot,
  `<worker> · <n> OT`, `<project> · <day label>` and a red `Review` **pill that is text, not a
  button** — preserved as text, styled `.bf-tone-red` `--bf-app-micro` with **no pointer cursor and
  no hover**, so it cannot read as an action · the 14 seeded roles from `Superintendent $68/$71`
  down to `Apprentice $24/$27` · the weekly budget rule `project.budgetHours / 26`.
  **Both column sets** keep their order: breakdown `<Dimension> | Reg | OT | Hours | Base |
  Burdened | Share`; rates `Role | Class | Crew (headcount) | Base | Prevailing`.
- **Every action placed (2 of 2):** clicking Project / Crew / Phase / Worker → re-pivots the table
  and renames its first column header · **no row click, sort, export or drill-down anywhere in this
  tab**, and none is added.
- **States:** *Empty* — `No overtime discrepancies flagged this week.` (`p.tc-empty`) when nothing is
  Flagged; and breakdown rows pre-filtered to `totalHours > 0`, so an all-zero dimension renders an
  **empty `tbody` with only the Total row** — which the re-skin keeps and makes legible by leaving
  the 42px `thead` and the bordered `tfoot` visible. Loading / error / lock — none.
- **Motion:** invert on the segmented control; table row hover wash; **no lift, no reveal.**
  Skeleton: none.
- **Tests touched:** **none.**

## 5.27 TimeCard — Tab 3 "Crew & Assignment"

- **Today:** `TimeCard.tsx:788` (`CrewTab`) — attendance verification, crew rosters & skills, crew
  productivity. **Entirely read-only: no filters, sorts, row clicks or exports.**
- **Becomes:** three titled sections; **one frame survives** (the productivity table's
  `.tc-table-scroll`). Because the whole tab does nothing, **nothing in it gets a hover wash, a
  pointer cursor or a chevron.**
- **Every information item placed (5 of 5):** the `Attendance verification` card with subtitle
  `Scheduled crew vs. who actually logged time`; per crew the crew name, a `<pct>% present` pill
  (green ≥100, amber ≥80, else red), `<actual> / <scheduled> on site`, an optional `<n> sub|subs`
  chip with its `Repeat` icon, and a `HoursBar` of actual vs scheduled → name at
  `--bf-app-row-strong`, pill `.bf-tone-*`, counts `tabular-nums`, bar `.bf-meter` · the
  `Crew rosters & skills` card with subtitle `Who performed which tasks`; per crew a header with the
  crew name, `<project> · <task>` and the crew's total `formatHours`, then a worker list with
  initials avatar, name, role, up to 2 skill tags and rounded per-worker hours → header at
  `--bf-app-row-strong`, skill tags 999px `--bf-app-micro` at `rgba(28,28,26,0.05)` · the
  `Crew productivity` card with subtitle `Production output per labor hour`, a ratio bar and a
  percent-of-target figure turning `.up`/`.down` at 100% → `.bf-meter` against `target × 1.3` · the
  five curated outputs `cc1 214 CY placed` (target 4.4), `fc2 38 tons set` (0.9),
  `uc3 640 LF pipe` (14), `pc4 1180 SY paved` (26), `ec5 92 devices` (2.6) · the five crews
  `Concrete Crew 1`, `Framing Crew 2`, `Utility Crew 3`, `Paving Crew 4`, `Electrical Crew 5`.
  **The productivity table's columns** keep their order: `Crew | Hours | Output (value + unit) |
  Per hour | vs target (bar + %)`. **`TcAttendance.note` (`Substitute logged`) is computed and never
  displayed** — §6.1.
- **Every action placed (1 of 1):** none. The section is styled to say so.
- **States:** none modelled; none added. Lock — page does not mount.
- **Motion:** hover states only, retimed to `--bf-dur-hover var(--bf-ease)`. No lift, no reveal, no
  hover move (there is nothing to act on). Skeleton: none.
- **Tests touched:** **none.**

## 5.28 TimeCard — Tab 4 "Approvals"

- **Today:** `TimeCard.tsx:906` (`ApprovalsTab`) — **the only genuinely stateful workflow in
  TimeCard.** A queue of up to 8 cards walking Crew Lead → Superintendent → Project Manager →
  Accounting, plus an audit trail. All mutations are local state.
- **Becomes:** two titled sections. **The approval card frame goes** (the boundary is not itself
  interactive), and its `.flagged` state moves from a distinct frame to a **3px `#c5221f` left rule
  plus a `rgba(197,34,31,0.03)` ground** — so the queue reads as one list of decisions. `.tc-chain`
  keeps everything, **including `.tc-chain-step::after`'s 6×2px connector segment on every step but
  the last** (timecard.css:1014-1027) — that connector is the only thing that makes four tone
  pills read as a chain, and at ≤640px the chain becomes a 2×2 grid as today, where the connector
  must be suppressed on the second column. `.tc-approvals-grid` collapses at ≤1080px.
- **Every information item placed (8 of 8):** the `Approval queue` head with subtitle
  `Crew Lead → Superintendent → Project Manager → Accounting` and the 4-way filter
  (`role="tablist"`, `aria-label="Approval filter"`) `Pending` / `Overtime` / `Flagged` / `All`,
  defaulting to Pending, showing at most 8 cards → `.bf-seg`, inverts · per card the worker initials
  avatar, name, and `<crew> · <total formatHours>` → `--bf-app-row-strong` + `--bf-app-meta` ·
  the badge cluster — an amber `OT approval` pill when overtime is pending, a red `Discrepancy` pill
  when flagged, and a slate `At <stage>` pill where stage is the first Pending/Rejected level or
  `Fully approved` → `.bf-tone-*` `--bf-app-micro` (**`OT approval` renders blue today, §6.3**) ·
  the ordered 4-step chain (`ol.tc-chain`), each step tone-coloured by state (Approved green,
  Pending amber, Awaiting slate, Rejected red) with a `Check` glyph on Approved, an `X` on
  Rejected, the level name, and either `<approver> · <time>` or the bare state word → level name as
  the ×1 eyebrow, meta at `--bf-app-micro` · the flag reason line with its `AlertTriangle`, e.g. the
  injected `Correction requested by approver` · the `.flagged` card treatment · the `Audit trail`
  card with subtitle `Every change and approval, timestamped`; per event a tone dot
  (blue/green/amber/red/violet), the action, the detail, and `<actor> · <at>` → dot 8px `50%`,
  action at `--bf-app-row-strong`, detail at `--bf-app-row`, actor at `--bf-app-meta` · **all six
  seeded audit events verbatim**: `Approved timecard` Framing Crew 2 (green),
  `Requested correction` T. Grant OT mismatch (amber), `Submitted timecards` Utility Crew 3 ·
  5 workers (blue), `Flagged discrepancy` Paving Crew 4 · actual vs scheduled +2.5 hrs (red),
  `Logged replacement` R. Vance in for J. Diaz (violet), `Imported hours` Daily progress report →
  3 entries (blue) · the four approver names `Crew lead` / `M. Alvarez` / `liam santos` / `Payroll`.
- **Every action placed (6 of 6):** the four filters (Pending = any Pending/Rejected step; Overtime
  = `overtimePending`; Flagged; All) · `Approve` (`Check`, `.tc-btn.small.primary`, disabled with no
  Pending step) → marks the current step Approved by `liam santos` at `Just now`, promotes the next
  Awaiting step to Pending, clears `flagged` + `flagReason`, and prepends a green
  `Approved timecard` event whose detail is `<worker> · <crew name>` · `Request correction` (`Send`,
  `.tc-btn.small.ghost`, same disabled rule) → marks the step Rejected, sets `flagged` +
  `flagReason "Correction requested by approver"`, and prepends an amber `Requested correction`
  event whose detail is **`<worker name> · sent back for clarification`** · `Approve OT` (`Timer`,
  `.tc-btn.small.amber`, only on cards with `overtimePending`) → clears `overtimePending` and
  prepends a violet event whose detail is **`<worker> · <n> hrs OT cleared for payroll`** (all
  three details are worker-prefixed) · approving a card can remove it from the Pending view
  immediately as the filter re-evaluates · every mutation is local; nothing persists.
  **The button order is load-bearing and is frozen:** `Approve OT` (amber, conditional) →
  `Request correction` (ghost) → `Approve` (primary, **rightmost**). Written into the file header,
  because listing them in the reverse order would read as a different default action after a
  restyle. Register: `Approve` = `.bf-pill-primary`; `Request correction` = `.bf-pill`;
  `Approve OT` = `.bf-pill` with its tone as the border and text.
- **States:** *Empty* — `Nothing in this queue — every timecard here is cleared. 🎉` (`p.tc-empty`,
  **the literal emoji is kept**) at `--bf-app-row` 62ch. *Loading* — none. *Error* — none; buttons
  **disable rather than error** when the chain has no Pending step, which the re-skin keeps at 0.45
  opacity plus `cursor: not-allowed` (never below the 4.5:1 contrast floor for the label). *Add-on
  lock* — page does not mount.
- **Motion:** invert on the filter and the two ghost buttons; `.tc-btn`'s hover lift removed;
  **the chain advance still flips instantly with no transition** — deliberately kept, because
  animating a state that represents an approval invites doubt about whether it landed. No reveal
  (the card list is re-filtered, so its container is effectively keyed). Skeleton: none.
- **Tests touched:** **none** — and this is the one screen in the cluster where that is a real
  problem, because it is the only stateful workflow here. §6.5.

## 5.29 TimeCard — Tab 5 "Integrations"

- **Today:** `TimeCard.tsx:1104` (`IntegrationsTab`) — six descriptive module cards plus one real
  Recharts bar chart. **Nothing is clickable except the tooltip; there are no links out to the
  modules these cards describe.**
- **Becomes:** two titled sections. The six integration cards **lose their frames** (they are
  descriptive, not interactive) and become a `repeat(auto-fit, minmax(260px,1fr))` grid of
  hairline-separated blocks. The chart section keeps its 260px height and gains no frame.
- **Every information item placed (9 of 9):** the `Connected BuildFlow modules` head with subtitle
  `TimeCard pulls and pushes across the platform` · **all six cards, each with its tone icon,
  title, status pill, descriptive paragraph and two `CheckCircle2` bullet rows** — and the five
  paragraphs the inventory dropped are restored to the mapping so none is lost in a re-layout:
  1. **Schedule sync** (`CalendarClock`, blue) — status `Live`; copy
     `Planned <n> hrs vs actual <n> hrs logged this week.`; rows `Variance <±n> hrs vs plan`,
     `Assignments linked to timecards automatically`
  2. **Field Updates sync** (`HardHat`, green) — status `<n> imported`; copy
     `Daily progress reports push crew hours straight into TimeCard.`; rows
     `<data.fieldUpdates.length> field updates connected`, `Photo notes attached to matching entries`
  3. **Equipment usage** (`Wrench`, amber) — status `<n> hrs`; copy
     `Operator hours captured alongside equipment run time.`; rows
     `Operator + machine hours reconciled`, `Idle vs. productive time flagged`
  4. **DelayIQ correlation** (`AlertTriangle`, red) — status `<data.delayIQs.length || 3> linked`;
     copy `Overtime and extra hours tied back to logged delayIQ reasons.`; rows
     `Weather delayIQ → 46 recovery OT hrs`, `Rework tagged to responsible phase`
  5. **Material coordination** (`Boxes`, violet) — status `Staging`; copy
     `Material handling and staging hours tracked as their own task.`; rows
     `18 hrs logged to material staging`, `Cross-project handling split-shifted`
  6. **Map & Field Ops** (`Truck`, slate) — status `GPS`; copy
     `Location-verified entries confirm crews were on the right site.`; rows
     `82% of entries GPS-verified`, `Route time excluded from billable hours`
  → title at `--bf-app-row-strong`, status pill `.bf-tone-*` `--bf-app-micro`, copy at
  `--bf-app-row`/1.5 capped at 62ch, bullets at `--bf-app-meta` with 14px `CheckCircle2` in
  `#8a877e`, tone chip 34×34 radius 12px. **Cards 2 and 4 are the only two reading real data
  (`data.fieldUpdates.length`, `data.delayIQs.length`); the other four are hardcoded** — so the
  section head takes the same `Illustrative` eyebrow treatment as the Reports charts (§6.1) rather
  than presenting all six alike.
  · the `Schedule vs. actual` head with subtitle `Planned crew hours against logged hours` · the
  manual legend below the chart with its navy `Planned` and orange `Actual` swatches → the ×1
  eyebrow, dots re-based to **ink `#1c1c1a`** and **accent `#2f6bff`** · the planned-hours rule
  `crew.scheduledHeadcount × 40` with ` Crew` stripped from the axis names.
  **The chart's geometry is frozen** (`height 260`, `barGap 6`, `margin {10,16,4,-12}`,
  `barSize 20`, `CartesianGrid #dde6ef "4 6" vertical={false}`, no axis/tick lines,
  `tick {fill:#94a4b8, fontSize:12}`, `Tooltip cursor {fill: rgba(9,32,56,0.04)}`); only the
  palette moves: `planned #0a233a` → `#1c1c1a`, `actual #fb8500` → `#2f6bff`, grid →
  `rgba(28,28,26,0.07)`, ticks → `#8a877e`, radius `[5,5,0,0]` → `[8,8,0,0]`.
- **Every action placed (1 of 1):** Recharts tooltip hover only. **No links out are added** — that
  would be a feature change; the six cards keep no pointer cursor and no hover wash so they do not
  promise one.
- **States:** *Empty* — none; the DelayIQ status falls back to the literal `3` when `data.delayIQs`
  is empty. Loading / error — none. Lock — page does not mount.
  **Recorded and preserved:** `IntegrationsTab` computes from `model.entries`, the **frozen seed**,
  so `Add entry` on Tab 1 never moves the Schedule-sync variance or this chart — while the header
  KPI does move. That live/seed split is not hidden by the re-skin; it is the reason the
  `Illustrative` eyebrow is proposed here.
- **Motion:** Recharts' default bar grow-in, gated in TSX under reduced motion; card hover styling
  removed (nothing acts). No lift, no reveal. Skeleton: none.
- **Tests touched:** **none.**

## 5.30 TimeCard — Tab 6 "Reporting"

- **Today:** `TimeCard.tsx:1266` (`ReportingTab`) — a labour-variance table, four unit-cost tiles,
  three Recharts trends and the payroll-export card.
- **Becomes:** six titled sections, **one frame surviving** (the variance table's
  `.tc-table-scroll`). `.tc-report-grid` carries `.bf-doc-bleed` and collapses at ≤1080px.
- **Every information item placed (6 of 6):** `Labor variance` (`Scale`) with subtitle
  `Actual vs budgeted hours by project`, variance = `round(actual hours) − weekly budget` rendered
  with a leading `+` and a `.tc-ot` (over) or `.tc-under` (under) colour → `tabular-nums`, tones
  kept as text colour, classes kept · `Cost analysis` (`DollarSign`) with subtitle
  `Unit economics` and its four tiles `Cost / labor hour`, `Cost / SY paved` (burdened cost over the
  **hardcoded 1180 SY** paving example), `OT % of hours`, `Avg loaded rate` → four `.bf-figure`
  cells · `Labor cost trend` (`TrendingUp`) subtitle `Planned vs actual ($K / week)`, five weeks
  **May 18 → Jun 15**, planned 118/124/129/133/141 vs actual 112/121/134/138/149 ·
  `Labor forecastIQ` (`Sparkles`) subtitle `Projected hours from current burn rate`,
  **Jun 15 actual 1490** then forecast-only 1560 / 1610 / 1520 / 1440 (`actual: null`) ·
  `Productivity trend` (`Gauge`) subtitle `Output per labor hour`, 0.82 / 0.85 / 0.84 / 0.89 / 0.93
  · `Payroll export` (`Download`) subtitle `Approved hours ready for payroll` with
  `Approved timecards` = fully-approved count / total, `Gross labor` = base cost, and the four
  format chips `ADP` / `Paychex` / `QuickBooks` / `CSV`.
  **The variance table's columns** keep their order: `Project (name + code · location) | Budget |
  Actual | Variance | Burdened cost`. **All three charts keep their geometry**, palette re-based:
  the LineChart (`height 220`, `planned` → ink `#1c1c1a` sw2 dot r3, `actual` → accent `#2f6bff`
  sw3 dot r4, grid `4 6` `vertical=false`, `XAxis "week"`,
  `Tooltip cursor {stroke:#ccd5df, strokeWidth:2}` → `rgba(28,28,26,0.13)`); the AreaChart
  (`height 220`, **`linearGradient id="tcForecastIQ"` kept by name**, `#1568c9` 0.35→0 re-based to
  `#2f6bff` 0.35→0, `Area "forecastIQ"` stroke `#2f6bff` sw3, `Line "actual"` `#20b15a` sw3 dot r4
  kept green because it is the *actual* series against a forecast, **`YAxis domain [1200,1800]`
  frozen**); the BarChart (`height 220`, `barSize 26`, per-point `<Cell>` conditional fill
  `#20b15a` at ≥0.9 else `#7cc39a` — **kept, it is a threshold semantic**,
  **`YAxis domain [0,1.1]` frozen**, `Tooltip cursor {fill: rgba(9,32,56,0.04)}`).
- **Every action placed (3 of 3):** `Export approved hours` (`Send`, `.tc-btn.primary.block`) → sets
  `exported=true` and the button becomes a ghost `Export queued` with a `CheckCircle2`; **nothing
  is generated or downloaded and the state cannot be reset without leaving the tab** → both labels
  frozen, `.bf-pill-primary` → `.bf-pill` on the flip, and it is filed in §6.4 alongside the other
  dead exports · **the four format chips are non-interactive `<span>`s, not selectable options** →
  styled `.bf-tone-neutral` `--bf-app-micro` with no pointer cursor, so they read as a list of
  supported formats rather than a choice · Recharts tooltip hover on all three charts.
- **States:** *Empty* — none. *Loading* — `Export queued` is the only feedback; there is no real
  async or progress, so **no spinner and no `text-shimmer` is added** (that would imply work is
  happening). *Error* — none. Lock — page does not mount.
  **Preserved:** the payroll-export card counts `model.timecards`, the frozen seed, so `Approve` on
  Tab 4 never moves `Approved timecards <n>/<n>` here. Same `Illustrative` treatment as §5.29.
- **Motion:** invert on the export flip; Recharts entry animations gated under reduced motion; no
  lift, no reveal. Skeleton: none.
- **Tests touched:** **none.**

## 5.31 TimeCard — Tab 7 "Compliance"

- **Today:** `TimeCard.tsx:1401` (`ComplianceTab`) — certified payroll, a classification donut,
  prevailing-wage scales and a lien-waiver table. **No filters, sorts or row clicks anywhere.**
- **Becomes:** four titled sections, **two frames surviving** (the certified-payroll table and the
  lien table, both `.tc-table-scroll`, both `ScrollAffordance axis="x"`).
  `.tc-compliance-grid` collapses at ≤1080px.
- **Every information item placed (7 of 7):** `Certified payroll` (`FileCheck2`) with subtitle
  `Prevailing-wage projects · WH-347 ready`, showing only workers whose crew's project has
  `prevailingWage` true (**RMC-118 Riverside Medical Center, HVT-204 Harborview Terminal**), capped
  at 8 rows · the classification pill per row (`Apprentice` amber, `Subcontractor` violet,
  `Employee` blue) → `.bf-tone-*` (**Apprentice renders blue today, §6.3**) · the compliance pill,
  green `Compliant` when `baseRate >= prevailingRate * 0.98` else red `Below scale` · **the Project
  cell showing the project CODE, not the name** — preserved, and the column head stays the eyebrow
  word `Project` · `Worker classification` (`Users`) with subtitle
  `Employee vs. sub vs. apprentice`, a donut plus a hand-rolled `ul.tc-class-legend` of swatch +
  class name + headcount → legend names as the ×1 eyebrow, counts `tabular-nums`; **the three
  colours `Employee #1568c9`, `Subcontractor #6d45d8`, `Apprentice #fb8500` re-base to
  `#2f6bff` / `#6d28d9` / `--wx-g-amber #f9ab00`** — the orange is the pre-blue-era leftover (§4f)
  and `#f9ab00` is an existing token, so no new colour enters the system · `Prevailing wage scales`
  (`Scale`) with subtitle `Enforced minimums by classification` and its six fixed roles `Foreman` /
  `Electrician` / `Concrete Finisher` / `Equipment Operator` / `Laborer` / `Apprentice`, each with
  the prevailing rate in bold and `base $<n>/hr` beneath → `--bf-app-row-strong`/`tabular-nums` +
  `--bf-app-meta` · `Lien law compliance` (`ShieldCheck`) with subtitle
  `Subcontractor payment verification` and **all three seeded records verbatim**:
  `Lone Star Rebar LLC / RMC / Verified / Jun 14, 2026 / $48,250`;
  `Coastal Steel Erectors / HVT / Pending / Jun 07, 2026 / $61,900`;
  `Apex Traffic Control / TRL / Conditional / Jun 14, 2026 / $12,400`; pill tones Verified green,
  Conditional amber, Pending slate → `.bf-tone-*` (**Conditional renders blue today, §6.3**).
  **Both column sets** keep their order: certified payroll `Worker (avatar + name + role) |
  Classification | Project (code) | Hours | Paid rate | Prevailing | Status`; lien law
  `Subcontractor | Project | Paid through | Amount | Lien waiver`. The **pie geometry is frozen**:
  `height 180`, `innerRadius 46`, `outerRadius 72`, `paddingAngle 3`, one `<Cell>` per class,
  default `<Tooltip>`.
- **Every action placed (4 of 4):** `Generate WH-347` (`Download`, `.tc-btn.primary`) — **dead, no
  `onClick`** · `Statement of compliance` (`FileCheck2`, `.tc-btn.ghost`) — **dead, no `onClick`** ·
  Recharts pie tooltip hover · **no filters, sorts or row clicks**, none added.
  **Both dead buttons are kept and both drop to the `.bf-pill` outline register** — `Generate
  WH-347` loses its primary fill, which is the single most misleading affordance in the cluster
  (a certified-payroll form that does not generate). Each gains a `rail-tooltip`. §6.4.
- **States:** *Empty* — **no prevailing-wage projects would render an empty certified-payroll
  `tbody` with both action buttons still present, and that case has no copy today.** Not invented;
  §6.1 proposes one. The re-skin keeps the 42px `thead` visible so the table reads as empty rather
  than broken. Loading / error — none. Lock — page does not mount.
- **Motion:** invert on the two buttons; Recharts default pie animation gated under reduced motion;
  `.tc-btn` hover lift removed. No reveal. Skeleton: none.
- **Tests touched:** **none.**

## 5.32 TimeCard dashboard widgets (rendered on the Dashboard)

- **Today:** `TimeCard.tsx:1601` (`TimeCardDashboardCards`), mounted at App.tsx:26846 inside a
  `<section data-reveal>` with `aria-label="TimeCard overview"`. A 6-tile summary that doubles as
  the entry point **or the upsell** for the add-on. Re-skinned for the board by
  `hs-home.css:1032-1180`.
- **Becomes:** the tiles become `.bf-figure` cells inside the Dashboard's own panel surface — no
  frames of their own (they were `.tc-dash-card` with a `-2px` hover lift, both removed, §3), 34×34
  tone chips kept, values at `--bf-app-figure`, hints at `--bf-app-meta`. The section keeps
  `data-reveal` and `aria-label="TimeCard overview"`. Panel `h2` stays at **14.5px** (§4d).
- **Every information item placed (7 of 7):** the header `TimeCard` with its `Clock`, **and when
  locked an inline `Add-on` chip with a `CircleArrowUp` and
  `title="TimeCard is an add-on — choose it to see where to get it"`** → the chip becomes
  `.bf-locked` (§5.34): accent `CircleArrowUp` at 0.55 opacity, eyebrow text, **no grey-out** ·
  **tile 1** (`Users`, blue) `Active crews today` = distinct crews with a Thursday entry; hint
  `<n> hrs logged today` · **tile 2** (`Clock`, green) `Hours this week` = rounded total; hint
  `<pct>% of <n> budgeted` · **tile 3** (`Timer`, amber) `OT pending approval`; hint
  `<n> timecards` · **tile 4** (`Gauge`, violet) `Crew utilization` = total hours /
  (total scheduled headcount × 48) as a %; hint `scheduled capacity` · **tile 5** (`TrendingUp`,
  green, `.wide`) `Labor cost trending` = compact currency of the latest week's actual × 1000, plus
  a week-over-week delta `<±n>K` coloured `.up` green / `.down` red, **plus a sparkline** ·
  **tile 6** (`ClipboardCheck`, red, `.pending`) `Crews with pending approvals`; hint listing the
  first 2 crew names, or `All approved` when none.
  The **sparkline is frozen**: Recharts `LineChart`, `height 40`, `margin {6,4,0,4}`,
  `dot={false}`, no axes/grid/tooltip; **stroke `#fb8500` → `#2f6bff`** (§4f).
  `.wide` and `.pending` are released at ≤1080px and the dash grid goes 4→2→1 as today.
- **Every action placed (2 of 2):** the header button — `Open TimeCard` (`ArrowRight`) when
  unlocked → `setPage("timecard")`, slide 3px; **`Get TimeCard` (`CircleArrowUp`, `.locked`) when
  locked → raises the add-on prompt** → `.bf-pill` with the accent arrow, never disabled, never
  greyed · **every one of the six tiles is itself a button firing the same `onOpen`** → each keeps
  its hover wash `rgba(28,28,26,0.035)` and a 3px slide on its chip, because unlike every other
  figure in this cluster these figures **do** navigate.
- **States:** *Empty* — `All approved` in tile 6. *Loading* — the section participates in the
  Dashboard's `data-reveal` (starts `opacity: 0`, gains `.in`). *Error* — none. *Add-on lock* —
  **the widget is the one place the locked state is always visible on a page the user can reach**,
  so it is the most important instance of the `.bf-locked` language (§5.34).
- **Motion:** slide on the header button and the six tiles; **invert** on the header button;
  hover wash on the tiles; **no lift** (`.tc-dash-card`'s `-2px` and `0.12s` go). Keeps its single
  Dashboard reveal — legal, because the wrapping `<section>`'s className is static. Skeleton:
  `DashboardSkeleton`. `hs-home.css:1032-1180` is where the board's overrides live and is where the
  `bf-` rules must be one class more specific.
- **Tests touched:** **none assert on the tiles.** `App.test.tsx:1017` asserts
  `/Timecard Exception/` is **NOT** present anywhere on the Dashboard — so no string resembling
  that may be introduced here. **Passes unchanged.**

## 5.33 Add-on gate — the `AddOnPrompt` dialog ("Get Map & Field Ops" / "Get Time Cards")

- **Today:** `App.tsx:3166`, gated at 822 / 854 / 2271 / 2445 / 3000. `createPortal` into
  `document.body`, `.hs-upd-backdrop > .hs-upd-dialog.hs-addon-dialog`, `role="dialog"`,
  `aria-modal`, `aria-labelledby="#hs-addon-title"`, `aria-describedby="#hs-addon-desc"`,
  inheriting the shared "what's new" modal entry animation. **It intercepts navigation to both
  pages; while locked the page never mounts.**
- **Becomes:** `.bf-stage` — radius **26px**, `--bf-shadow-stage`, `#fff`, border
  `rgba(28,28,26,0.07)`, backdrop `rgba(28,28,26,0.34)` with **no blur** (§4e), body copy at 62ch.
  **The shared base is split before either is touched:** `.hs-upd-dialog` keeps the What's-new
  styling and `.hs-addon-dialog` gets its own override block, so restyling one cannot restyle the
  other.
- **Every information item placed (7 of 7):** the tone-coloured program icon tile
  (`hs-addon-art tone-<program.tone>`) with its `CircleArrowUp` upgrade badge → 56px, radius 18px,
  tone fill at 10% alpha, badge 18px in the accent · the eyebrow
  `Add-on · $12 per user / month` (map) / `Add-on · $8 per user / month` (time-cards) → the ×1
  eyebrow, price `tabular-nums` · the title `Get Map & Field Ops` / `Get Time Cards` →
  `--bf-app-title`; **frozen, it is the dialog's accessible name** · the description =
  `programRegistry` description **+ the catalog pitch**, whose two strings are frozen:
  `Live vehicle and equipment locations, traffic routing, and field operations on one map.` and
  `Crew hours logged against jobs and approved for payroll and job costing.` → `--bf-app-row`/1.5,
  62ch · the `Where to get it` block with its `CreditCard` icon:
  `Settings → Billing → Add-ons: add <program> to your <current plan> plan for <price> <unit>. It
  comes included with the Business and Enterprise plans.` → a hairline-topped block, heading as the
  ×1 eyebrow, body at `--bf-app-row` 62ch · the current plan name interpolated when a plan is
  selected, else the generic `your plan` · the price/unit/`includedIn` from `ADD_ON_CATALOG`
  (**map $12 · equipment $9 · time-cards $8 · schedule-ai $15**).
- **Every action placed (5 of 5):** `Purchase in Billing` (`ShoppingCart`) → closes the prompt and
  opens Settings → Billing focused on that add-on (`openSettingsBilling`) → `.bf-pill-primary`,
  icon slides 3px · `Not now` → closes → `.bf-pill`, inverts · the X
  (**`aria-label="Close"` — frozen, the test queries that exact label**) → 30px, radius 12px, press
  `scale(0.94)` · Escape / focus behaviour via `useModalDialog(dialogRef, onClose, true)` —
  untouched · **it is also raised from the rail flyouts (App.tsx:20406, 20600, 20636) and from the
  locked Dashboard TimeCard widget's `Get TimeCard`**.
- **States:** empty / loading / error — none. **This screen *is* the lock state's terminus**; the
  always-visible half of the lock is §5.34–§5.36 and its resolution is §5.37.
- **Motion:** the inherited `.hs-upd-backdrop` / `.hs-upd-dialog` entry retimed to `0.18s` fade +
  `0.22s var(--bf-ease)` rise; invert on `Not now`, slide on `Purchase in Billing`, press-scale on
  the X. **No reveal** (modal). Skeleton: none.
- **Tests touched:** `tests/map.test.tsx` *"prompts for the Map & Field Ops add-on when the
  workspace has not unlocked it"* — **passes unchanged.** It asserts the dialog's accessible name
  `Get Map & Field Ops`, the pitch `/Live vehicle and equipment locations, traffic routing/`, that
  the heading `Job sites` is **NOT** rendered, and that clicking `Close` dismisses it. Unlock in
  tests is `localStorage["buildflow.selectedProducts"] = ["map-field-ops"]`.
  **The page must stay unmounted while locked** — the `Job sites` absence assertion is what enforces
  that, so no part of this mapping may render map chrome behind the dialog.

---

# The seam surfaces (from both `completenessCheck` blocks)

## 5.34 Locked chrome — the nav-rail flyout row for Map and TimeCard

- **Today:** App.tsx:865-872 (`addOnTipCopy`), 20636-20668. `.hs-flyout-item.locked` + a
  `CircleArrowUp` upgrade arrow + a hover/focus tooltip
  (`span.hs-flyout-tip[role=tooltip][id="hs-addon-tip-<page>"]`, wired by `aria-describedby`).
  **Today the row's star is doubly unreachable on touch** — inside a surface that cannot open,
  revealed by an event that cannot fire.
- **Becomes:** the `.bf-locked` language, defined once and used by all four locked surfaces:
  1. **The label keeps full ink** (`#1c1c1a`) — a locked page is not a disabled control, it always
     leads somewhere.
  2. A trailing 14px `CircleArrowUp` in **`#2f6bff` at 0.55 opacity**, rising to 1 on hover/focus.
     **This is the row's one blue element**, so on a locked row the bookmark star renders
     `#575550` outline until pressed (the accent budget, enforced as a count — §4f).
  3. No lock glyph, no strikethrough, no grey-out.
  4. `.hs-flyout-tip` becomes the **ink pill** — `#1c1c1a` / `#fdfcf9`, radius 12px,
     `--bf-shadow-pill` `0 8px 22px rgba(28,28,26,0.2)`, width 244px kept, `::before` arrow kept,
     body capped at 62ch — **and it fires on `:focus-within` as well as `:hover`** (§4c), which is
     the fix for the fact that the explanation currently never precedes the prompt.
- **Every information item placed:** the tooltip's title `Map & Field Ops add-on` /
  `TimeCard add-on` → the ×1 eyebrow · its body
  `This program is part of the <label> add-on — $12|$8 per user / month, or included with the
  Business and Enterprise plans. Choose it to see where to get it.` → `--bf-app-meta` on the ink
  pill, 62ch · the `CircleArrowUp` · the row's `data-tutorial-id="nav-map"` / `"nav-timecard"`
  anchors (and `nav-field`, `nav-delayIQs`, `nav-reports` on the unlocked siblings).
- **Every action placed:** clicking a locked row → raises §5.33 instead of navigating · the per-row
  star toggle (`aria-label="Bookmark Map & Field Ops"` / `"Remove Map & Field Ops from bookmarks"`,
  `title="Bookmark for quick access"` / `"Remove bookmark"`) — **pinned to `opacity: 0.55` below
  1024px** instead of opacity-0-until-hover (§4c) · the flyout's own Escape and focus-out closers
  (added by the shell phase).
- **States:** locked (above) · unlocked (the row is an ordinary flyout item) · bookmarked (star
  filled in the accent with `fill: currentColor`).
- **Motion:** slide 3px on the row (the menu-row nudge); the arrow's opacity on
  `--bf-dur-hover var(--bf-ease)`; the tooltip's reveal `0.14s → 0.18s var(--bf-ease)`. No reveal.
- **Tests touched:** `tests/map.test.tsx:103` (`Get Map & Field Ops`) — **passes unchanged**; all
  three copies of `lockedAddOnForPage` are untouched. New `tests/shell-nav.test.tsx` asserts a
  locked row **prompts instead of navigating**, and that the `nav-<page>` anchors are present.

## 5.35 Locked chrome — the Bookmarks page tile

- **Today:** App.tsx:20420-20430 — a starred locked page shows a `CircleArrowUp` `.bm-tile-lock`
  and its tile opens the prompt instead of the page.
- **Becomes:** `.bm-tile` is one of the **two surfaces in this cluster that lift on hover** (it
  navigates): `translateY(-4px)` + `--bf-shadow-card-hover` over `0.28s var(--bf-ease)`, radius
  18px, `--bf-shadow-card` at rest. Locked tiles take `.bf-locked`: full-ink label, the accent
  `CircleArrowUp` at 0.55, **and they still lift** — because they still act.
- **Every information item placed:** the page label · the hub name beneath at `--bf-app-meta` · the
  `.bm-tile-lock` arrow.
- **Every action placed:** clicking a locked tile → §5.33; clicking an unlocked tile → the page;
  the tile's own remove-bookmark control.
- **States:** locked / unlocked / empty (the Bookmarks page's own empty state, owned by the shell
  phase).
- **Motion:** **lift** (move #1) + slide on the arrow. No reveal.
- **Tests touched:** **none — the Bookmarks page has zero test coverage.** Manual walkthrough only;
  called out in preserve §10 as one of its three uncovered surfaces.

## 5.36 Locked chrome — the ⌘K palette command

- **Today:** App.tsx:2599 (keydown), 2607-2612 (`paletteCommands`), 2807. **Every `navItem` is a
  palette command in group `Pages`**, so `Map & Field Ops`, `TimeCard`, `Field Updates`, `DelayIQs`
  and `Reports` are all reachable by keyboard from anywhere — and the command runs `openAppPage`, so
  it hits the same gate. **This is the cluster's only keyboard shortcut** beyond the dropzone's
  Enter/Space and the dialogs' Escape, and no `aria-keyshortcuts` exists anywhere in the area.
- **Becomes:** the palette itself is the shell phase's surface (radius 20px, `--bf-shadow-stage`,
  `[aria-selected="true"]` row at `rgba(47,107,255,0.08)` + `#2f6bff` + `translateX(3px)`). This
  cluster adds only the locked-row treatment: a trailing 14px `CircleArrowUp` in the accent at 0.55,
  matching §5.34, and **nothing else** — no price, no badge, no new copy.
- **Every information item placed:** the five `Pages` commands for this cluster; the group label
  `Pages` as the ×1 eyebrow; the locked arrow on two of them.
- **Every action placed:** ⌘K / Ctrl+K to open; arrow keys and Enter to run; a locked command
  raising §5.33. **`.cmdk-list` is capped at `min(52vh, 420px)` and nothing scrolls the highlighted
  row into view**, so arrowing past the fold moves `aria-activedescendant` off screen — the 3-line
  `scrollIntoView({ block: "nearest" })` fix belongs to the shell phase and is noted here because
  five of this cluster's commands sit in that list.
- **States:** locked / unlocked.
- **Motion:** slide on the selected row. The palette's entry stays a **CSS animation on an
  already-mounted node** — mounting must stay synchronous because the palette resets its query and
  focuses its input in a `requestAnimationFrame` and anything delaying mount races that focus.
- **Tests touched:** `components/CommandPalette.test.tsx` (4) — **passes unchanged.**

## 5.37 Where the gate ends — Settings → Billing → Add-ons focused card

- **Today:** App.tsx:21537-21590 — `.sx-addon-grid` / `.sx-addon-card.focused` with a `focusRef`
  scroll-in. **`Add to plan` is the only in-app control that unlocks either page.**
- **Becomes:** the cards are **licensed frames** (clause 1 — each carries its own action):
  `.bf-card` radius 18px, `--bf-shadow-card`, and `.focused` gets a `0 0 0 3px
  rgba(47,107,255,0.18)` ring rather than a heavier shadow. **Settings keeps its `sx-rise` keyframe
  stagger and must never be converted to `data-reveal`** — `.settings-panel-inner` is keyed by
  `activeSettingsView` and `useHudMotion`'s reveal effect never re-queries after a key change, so
  the panel would go permanently blank with no error. Same rule, same reason, as §4a's TimeCard
  prohibition.
- **Every information item placed:** the program icon tone · the label · the `programRegistry`
  description · the price + unit · and one of `Add to plan` (a button) / `Added` /
  `Included with your plan`.
- **Every action placed:** `Add to plan` → `.bf-pill-primary`; it raises the notice
  `<program> is now part of your workspace — find it in the left rail.` (frozen).
- **States:** available / `Added` / `Included with your plan`.
- **Motion:** invert on the button; the existing `sx-rise` stagger, keyed and untouched.
- **Tests touched:** `tests/settings.test.tsx` (9) — this cluster changes nothing here beyond
  surface values, but the file **must be run first** because the shell phase renders the TopBar on
  Settings (preserve §10 risk #1), and this card is reached from §5.33.

## 5.38 Tutorial coach-mark over both gated pages

- **Today:** App.tsx:1746-1775 (`productSteps` for `time-cards` and `map-field-ops`), overlay at
  21255-21330. When the workspace owns the add-on the tutorial navigates to the page
  (`onNavigate=openAppPage`) and draws a spotlight rect (target rect + 8px,
  `scrollIntoView({block:'center'})`) with a positioned step panel inside
  `region[aria-label="BuildFlow tutorial"]`. **On the map the anchor is
  `data-tutorial-id="map-page-title"` on the ENTIRE page root, so the "spotlight" covers the whole
  page.**
- **Becomes:** panel radius 20px, `--bf-shadow-float`, body at `--bf-app-row`/1.5 capped at 62ch;
  `max-height: calc(100vh - 128px)`, `overflow: auto`, `pointer-events: none` on the overlay with
  `auto` only on the panel, and the **9999px `box-shadow` scrim** are all frozen — that is what
  keeps the spotlit control clickable, which is what makes the gated steps satisfiable. **No
  `backdrop-filter`, no new transform/filter/contain/will-change on any ancestor** (§4e).
  The map's whole-page anchor is a real defect; **re-anchoring it to a proper `h1` is the deliberate
  fix and is filed together with the missing H1 as §6.1**, because moving a `data-tutorial-id` is a
  DOM contract change with no test behind it.
- **Every information item placed:** the two step titles `Map & Field Ops lesson` and
  `Time Cards lesson` · the map body `Review route context, live crew tracking, map filters, and
  active jobs from the Map & Field Ops workspace.` · the TimeCard body `TimeCard is where crews log
  hours against jobs, and where you review and approve them for payroll and job costing.` · the
  `role="status"` gate line.
- **Every action placed:** `Next` / `Back` / `Skip Tutorial` → `.bf-pill` / `.bf-pill` /
  `.bf-pill-primary`. **`openMap()` clicks `Skip Tutorial` to get past this**, so that label is
  load-bearing for the whole map test file.
- **States:** gated (the `role="status"` line) / satisfiable / skipped.
- **Motion:** the panel's position tween on `--bf-ease`; **the spotlight rect must not animate**
  (a moving scrim over a 9999px shadow flickers). No reveal.
- **Tests touched:** `App.test.tsx:242` asserts `getByText('Map & Field Ops lesson')` — **passes
  unchanged.** `tests/tutorial.test.tsx` (5) — **passes unchanged**, and the wrap-up step's browser
  check (preserve §10 risk #13) covers the `backdrop-filter` hazard on the top bar.

## 5.39 Transient state — the What's-new spotlight on the map page root

- **Today:** App.tsx:3055-3068 (`spotlightUpdateTarget`) driven by `UPDATE_ENTRIES` v3.5 at
  17205-17212 (`page: 'map'`, `spotlight: 'map-page-title'`, title
  `Map-aware dispatch from anywhere in the plan`). `Show me where it is` navigates to the map,
  smooth-scrolls the page root into view and adds `.hs-upd-spotlight` for **4200ms**, retried up to
  14× / 150ms until the node exists.
- **Becomes:** `.hs-upd-spotlight` (hs-update-modal.css:151-156) keeps its shape — a **3px `#2f6bff`
  outline at 6px offset, radius 12px** → radius onto the ladder at **18px** to match the frames it
  will most often surround — and `@keyframes hs-upd-pulse` keeps its **name**, 1.1s, ×3, and its
  existing reduced-motion suppression.
- **Every information item placed:** the update entry's title (rendered in the What's-new dialog,
  which is shell) and the fact that the target is the **whole page**.
- **Every action placed:** `Show me where it is` → navigate + scroll + pulse.
- **States:** the 4200ms transient; the 14×/150ms retry while the node is absent.
- **Motion:** `hs-upd-pulse`, name unchanged. Not a reveal.
- **Tests touched:** **none** — `data-tutorial-id` failures are silent, which is why the anchor list
  in §2c is a review gate.

## 5.40 Transient state — the What's-new spotlight on the Field Updates H1

- **Today:** the same mechanism, driven by the `UPDATE_ENTRIES` entry at App.tsx:17237-17240
  (`page: 'field'`, `spotlight: 'field-page-title'`). Taking `see it` on the 2026-05-26 modal
  navigates to `field`, scrolls `h1[data-tutorial-id="field-page-title"]` into view
  (`block: 'center'`) and pulses it for 4200ms.
- **Becomes:** identical treatment to §5.39. **The important consequence for this cluster:
  `field-page-title` moves with the `h1` out of the index card and up to the page header (§5.1) —
  the attribute travels with the element, the selector never changes, and the pulse now surrounds a
  26px title on the flat ground rather than a title inside a card, which reads better, not worse.**
  `delayIQs-page-title` exists and is currently unused by any update entry; it is kept anyway.
- **Every information item placed / action placed / states / motion:** as §5.39.
- **Tests touched:** **none.**

## 5.41 Dashboard "Recent activity" field-update feed (`hs-split`)

- **Today:** `section[data-reveal][aria-label="Recent activity"]` (App.tsx:26804-26843), rows from
  `ccRecentActivity` (26059-26070). **A fifth surface that renders field updates as records.**
- **Becomes:** a Dashboard panel body on the board: panel `h2` at **14.5px**, rows on the
  `.bf-table` row register (hairlines, 46px), avatars 28px `50%`.
- **Every information item placed:** the 4 newest updates as avatar initials (`user.avatar`, falling
  back to the first 2 letters of the name uppercased) · `<author name> · <message>` (with the
  `title` attribute carrying the same text) at `--bf-app-row` · the `.hs-split-tag` carrying the
  **raw status word** → `.bf-tone-*` `--bf-app-micro`, raw word kept · the copy `h3`
  `Never miss a field report` at `--bf-app-section` and the body `Every note, photo and percent your
  crews post from site lands here, newest first, so nothing waits for a phone call.` at
  `--bf-app-row` capped at 62ch.
- **Every action placed:** `View all` (`aria-label="View all field updates"`) → `setPage('field')`,
  slide 3px · `Open field updates` (`.hs-home-empty-btn`, `ClipboardList` 15px) →
  `setPage('field')` → `.bf-pill`, inverts, icon slides.
- **States:** *Empty* — `No field reports yet today.` at `--bf-app-row` 62ch with the button.
  Loading — `DashboardSkeleton`. Error / lock — none.
- **Motion:** keeps its `data-reveal`; slide on both actions; no lift; hover wash on rows (they do
  not act — **corrected: they do not, so the wash is dropped** and the rows are plain).
- **Tests touched:** **none** (`grep`: 0 hits for `Recent activity`, `Never miss a field report`,
  `View all field updates`). Manual walkthrough.

## 5.42 Dashboard "AI Recommendations" panel — the early-warning mirror

- **Today:** `railBodies.recommendations` (App.tsx:26574-26625), rows from `ccRecommendations`
  (26105-26120). The **same payload as §5.7 rendered with different vocabulary** as compressed
  `.cc-rec` rows — and **this copy has a retry that §5.7 does not.**
- **Becomes:** a Dashboard panel, `h2` at 14.5px, `.cc-rec` rows on the `.bf-table` row register.
  `.cc-rec-ico` becomes a 28px radius-12px tone chip. No frame, no lift, `spotlight-surface` via the
  panel.
- **Every information item placed:** the head `Sparkles` 16px + `h2` `AI Recommendations` · the
  loading line `Checking the schedule…` → `text-shimmer` · the failure block
  `Couldn't check for early warnings.` · the ready-empty `No jobs are trending behind. Nothing to
  recommend today.` · per row the icon (`AlertTriangle` when `risk.onCriticalPath`, else
  `TrendingUp` — **the only surface that uses `onCriticalPath`, which §5.7 receives and never
  shows**) · a `.cc-sev-high|medium|low` chip carrying the severity word → `.bf-tone-*` · the title
  `<jobName> — <projectName>` (collapsed to just `jobName` when equal) at `--bf-app-row-strong` ·
  the meta `<n> working day(s) behind pace|late to start · pushes <job>, <job> +<n>` (downstream
  capped at 2 + `+N`) or just the behind text, at `--bf-app-meta`.
- **Every action placed:** `View all` (`aria-label="View all early warnings"`) →
  `setPage('delayIQs')`, slide · per-row `Review` (`aria-label="Review <title>"`) →
  `setPage('delayIQs')` → `.bf-pill`, inverts · `Try again` (`RefreshCcw` 15px) → bumps
  `earlyWarningTick` → `.bf-pill`.
- **States:** loading / failed-with-retry / ready-empty / rows — all four above.
- **Motion:** `data-reveal` via the Dashboard; invert and slide as listed; no lift.
- **Tests touched:** `App.test.tsx:1334` asserts `getByRole('button', {name: /^Review Drywall/})` —
  **so the `Review <title>` label is pinned** and passes unchanged. `App.test.tsx:987` pins
  `Drywall — Riverside Office Building` and `/3 working days behind pace · pushes Paint/`.

## 5.43 Dashboard "Project Alerts" panel (the open-DelayIQ row)

- **Today:** `railBodies.alerts` (App.tsx:26538-26571), `ccAlerts` (26072-26102).
- **Becomes:** a Dashboard panel, `h2` at 14.5px, rows on the `.bf-table` row register.
- **Every information item placed:** the tone-red `AlertTriangle` icon chip · `strong` =
  `delayIQ.title` at `--bf-app-row-strong` · `span` = `<project name> · <n> day impact` at
  `--bf-app-meta` · a `<time dateTime>` of `relativeTime(reportedAt)` at `--bf-app-meta` `#8a877e`.
- **Every action placed:** `View all` (`aria-label="View all project alerts"`) →
  `setPage('delayIQs')`, slide 3px.
- **States:** *Empty* — `No active alerts right now.` Loading — `DashboardSkeleton`. Error / lock —
  none.
- **Motion:** `data-reveal` via the Dashboard; slide on `View all`; no lift, no row hover.
- **Tests touched:** `App.test.tsx:1307` (`alerts.getByText('Heavy Rain DelayIQ')`) and `:1308`
  (the `<time datetime>` assertion) — **both pass unchanged**; the `<time>` element and its
  `dateTime` attribute must survive the restyle, and they do.

## 5.44 Dashboard "DelayIQed Projects" KPI + its live-feed panel

- **Today:** `dashboardFeeds.delayIQs` (App.tsx:25880-25895) + the KPI card (26014-26027) +
  `DashboardFeedPanel` (26856).
- **Becomes:** the KPI becomes a `.bf-figure` on the Dashboard's own figure treatment; the feed
  panel keeps its `role="region"`, `id="dashboard-kpi-feed"` and
  `aria-label="<title> live feed"`, and is a **licensed frame** (clause 1 — it has a close button).
- **Every information item placed:** the KPI's delta line summarizing the delayIQed project names
  plus a week-over-week comparison → `--bf-app-meta` · the panel head `DelayIQed Projects` and
  `<n> projects delayIQed. <comparison>.` · one row per project whose detail is
  `<location> · <active delayIQ title> · <n> day impact`, **falling back to `project.scheduleHealth`
  when no unresolved delayIQ exists** · a status badge per row → `.bf-tone-*`.
- **Every action placed:** opening the feed from the KPI · the close button
  (`aria-label="Close <title> live feed"`) → 30px, radius 12px, press-scale.
- **States:** open / closed; the scheduleHealth fallback row.
- **Motion:** the panel's open on height over `--bf-ease-size`; press-scale on close; no reveal (it
  is action-triggered).
- **Tests touched:** **none directly**; it reads `data.delayIQs`, so §5.6's tone decisions
  (§6.3) change what this says.

## 5.45 Marketing SOLUTION page — "Field Updates & DelayIQs" (`#solutions-field-updates-delayIQs`)

- **Today:** config App.tsx:1955-2040 (`solutionPages.field`, view `solutionField`), rendered by the
  shared `WelcomeSolutionPage` (15957-16130), hash resolved at 613. **A second, different marketing
  page for this area — and it renders LIVE workspace data.**
- **Becomes:** already in the target language (a `.welcome-rx` surface). It takes only the accent
  migration `#1a73e8 → #2f6bff` (decision #2) and the reveal-threshold alignment to 0.16. **No
  frame, type or rhythm change** — this is a Welcome surface.
- **Every information item placed:** `metricLines` = `['<data.fieldUpdates.length ?? 14> field
  updates', '<data.delayIQs.length ?? 3> active delayIQ flags', '2 manager reviews pending']` —
  **live counts, so §5.1/§5.6 data changes are visible here** · breadcrumb
  `BuildFlow > Solutions` · `h1` `Field Updates & DelayIQs` · `heroCopy` · the board
  `Live field feed` / `Jobsite signals` with its 4 rows (Progress / DelayIQ / Note / Risk, tones
  blue / amber / green / violet) · the phone `Field log` with 3 items · the logo row
  `Trusted by crews reporting field reality every day` · `showcaseTitle` `A clean field log for
  progress, photos, delayIQ causes, and recovery steps.` · `documentTitle` `Field Log` · the three
  feature columns (Updates / DelayIQs / Recovery, 3 items each) · `finalCopy`.
- **Every action placed:** the primary CTA `Open field updates` → `onOpenPage('field')` · `Get
  BuildFlow` → `onGetStarted`.
- **States / Motion:** static mocks; the shared `WelcomeSolutionPage` motion, unchanged.
- **Tests touched:** `App.test.tsx:269-272` and `:374` assert this copy **verbatim** — **pass
  unchanged**, because nothing here is reworded.

## 5.46 Marketing SOLUTION page — "Reports" (`#solutions-reports`)

- **Today:** config App.tsx:2122-2205 (`solutionPages.reports`, view `solutionReports`), same
  renderer, hash at 615. Also renders live data.
- **Becomes:** as §5.45 — accent migration and threshold alignment only.
- **Every information item placed:** `metricLines` = `['<data.projects.length ?? 5> active
  projects', '92% schedule health', '<data.delayIQs.length ?? 4> bottlenecks flagged']` · `h1`
  `Reports` · `heroCopy` `Turn schedule movement, field updates, delayIQs, labor demand, and
  equipment conflicts into reports your team can act on.` · `browserTitle` `Production Reports` ·
  `showcaseTitle` `A clean reporting workspace for schedule variance, bottlenecks, backlog, and
  crew demand.` · `documentTitle` `Report Pack` · `finalTitle` `Get production reports that explain
  the week.`
- **Every action placed:** `primaryCta` `Open reports` → `onOpenPage('reports')` · `Get BuildFlow`.
- **States / Motion:** as §5.45.
- **Tests touched:** `App.test.tsx:281-283` and `:376` — **pass unchanged.**

## 5.47 Adjacent surfaces that render the same records

Lower priority, outside the five pages, but they render this cluster's records and are therefore in
scope for consistency. **All three are restyled by the shared classes and none is reworded.**

- **BuildFlow AI's local answer bank** (App.tsx:24444-24454) — answers `field / site report / from
  the field / crew report / latest update / what's happening` with `Latest field updates:` plus the
  last 6 as `<project> · <user>: <message> (<status>)`, the follow-up chip `What's at risk?`, and
  `No field updates yet.` when empty. **Becomes:** the AI panel's message register (`--bf-app-row`,
  62ch), the status in parentheses left as plain text (**not** converted to a `.bf-tone-*` badge —
  it is inside a sentence), the follow-up chip a `.bf-pill` that inverts. The panel must stay
  always-mounted and hidden via `display: none` on `.bf-breeze:not(.is-open)`, because
  `schedule/viewKeys.ts`'s `dialogIsOpen()` depends on it.
- **The two welcome demo scenes** `demo-field-scene` and `demo-report-scene` (App.tsx:20271-20300,
  20323-20340) — static marketing mocks using this area's vocabulary (`Badge status
  'DelayIQ Reported'`, `DelayIQed`, `At Risk`, `Monitor`, `demo-report-bars`). **Becomes:** left on
  the Welcome side of the line, taking only the accent migration; the `demo-report-bars` get
  `.bf-meter` geometry so they match the in-app meter they depict.
- **The Projects page rail links into this area** — `Project Alerts` → `View all` → `delayIQs`
  (App.tsx:28092) and `Portfolio Health` → `Details` → `reports` (App.tsx:28149). **Becomes:**
  both are directional links, so both take **slide** (move #3) and the `.bf-pill` register, matching
  every other `View all` in the cluster.
- **Two more entry points recorded and preserved:** the Dashboard quick action `Create Report`
  (`FileText`) → `setPage('reports')` (App.tsx:26126), alongside the already-inventoried
  `Update Progress` → `field`; and the Dashboard app-switcher tiles at App.tsx:25977 → `field` and
  25979 `Cost Analyzer` (`DollarSign`, `Monitor budgets and cost trends.`) → `reports`.
  Both tile sets **lift** (they navigate) — the second of the two lifting surfaces in this cluster.
- **Tests touched:** none for the answer bank or the demo scenes.

---

# 6. Things this mapping will NOT do silently

## 6.1 Proposed ADDITIONS (new copy or new DOM) — needs approval

Nothing here is shipped without sign-off. Each is listed with the reason and the proposed string.

| # | Where | Proposal | Reason |
|---|---|---|---|
| A1 | Map & Field Ops page header | Add the page's **missing `h1`**, proposed copy `Map & Field Ops` (a string that already exists as the nav label, the `document.title` and the add-on title), plus the existing subtitle slot left empty. Delete `.map-ops-page .page-title { display: none }` (styles.css:14924). | It is the **only app page in the product with no H1 and no visible title**. Every other page in this cluster has one and carries a tutorial anchor on it. |
| A2 | Map tutorial anchor | Move `data-tutorial-id="map-page-title"` from the **page root** to the new `h1`. | Today the "spotlight" covers the entire page, which is not a spotlight. This is the deliberate fix; it is a DOM-contract change with **no test behind it**, so it needs a decision, not a guess. |
| A3 | Reports chart sections, Map "Travel Time Overview", TimeCard Integrations + Reporting | An `Illustrative` eyebrow above each section whose numbers are hardcoded demo arrays. | Unifying the card and chart styling makes **invented numbers read exactly as authoritative as real ones** — the record's own risk. Alternative, if `Illustrative` is too blunt: a `--bf-app-meta` caption naming the sample period the data already implies. |
| A4 | Reports charts + Crew Efficiency | An empty state, which **does not exist today** — they always paint their arrays. Only needed if A3's alternative is chosen and the arrays are ever wired to real data. | Recorded gap. |
| A5 | Map inline job editor | An `Unsaved draft` eyebrow on the editor region. | The editor **never persists** and its drafts feed the filters and the site accents. Until this is approved the editor keeps today's chrome exactly and gains no Save-like affordance. |
| A6 | LocationMap hint | A second copy state `Click to collapse` when `isExpanded`. | Today an expanded card offers **no collapse affordance** — the hint only renders when `isHovered && !isExpanded`. |
| A7 | TimeCard Compliance | Copy for the empty certified-payroll `tbody` when a workspace has no prevailing-wage projects. Proposed: `No prevailing-wage projects yet.` / `Certified payroll fills in once a project is marked prevailing wage.` | The case is reachable and has no copy. |
| A8 | Field composer | A `--bf-app-meta` hint next to the disabled submit stating the same rule the edit dialog already states (`Add a note of at least 3 characters.`). | The composer enforces the rule **silently** while the dialog for the same rule shows a message. Reuses an existing string; no new wording. |
| A9 | Notification bell / DelayIQ panel | An empty state for the bell (shell phase) and a `Try again` for the DelayIQs early-warning panel, matching the Dashboard mirror. | Both are new copy. Flagged, not sneaked in. |
| A10 | Seeded copy that exists and is never rendered | `TcEntry.note` (`Hours exceed scheduled crew window`, `Split shift — staging support`), `TcAttendance.note` (`Substitute logged`), and the per-day `condition` on every saved forecastIQ. | All computed, none displayed. Listed so the redesign knows this explanatory copy is **available**; surfacing it is a content change. |
| A11 | DelayIQ rail | Surfacing the write-but-unshown defaults (`impactDays 2`, `severity Medium`, `status Open`, `category = delayIQCategories[0]`, `description "Logged from the delayIQ management hub."`). | Would explain what `Add DelayIQ` actually creates. New copy. |

## 6.2 Proposed new SIGNAL — inferred vs reported progress — needs approval

`fieldUpdateProgress()` falls back to a status-derived percent when nothing was reported
(Complete 100 · On Site/In Progress 55 · DelayIQed/At Risk 35 · Ready to Start/Ready/Confirmed 15 ·
else 8), and the source comment is explicit that the fallback is *"a reading of the status, not a
measurement."* A re-skin that makes the meter more prominent presents an inference as data — and the
same number flows into the CSV and the sort.

**Proposal:** one modifier class, `.bf-meter.bf-inferred`, whose fill is a 4px/4px 45° repeating
stripe of the same tone at 55% alpha instead of a solid, plus the percent rendered in `#575550`
rather than `#1c1c1a`. No new copy, no new column, no layout change — a texture difference only,
which degrades to a plain bar if the distinction is rejected. **This is new visual signal, so it
needs approval.** It reaches the Field Updates progress cell and nothing else.

## 6.3 Two rendering BUGS the re-skin will otherwise freeze — needs a decision

**B1. `--tc-amber` is a blue.** `timecard.css:8` declares `--tc-amber: #0b4ae8` with
`--tc-amber-soft: #dce5fd`, so **every "amber" pill in TimeCard renders blue**: `OT approval`
(§5.28), `Overtime 1.5×` (§5.26), `Apprentice` (§5.31), `Conditional` lien waiver (§5.31), and the
`Overtime pending approval` stat chip (§5.24). Under navy chrome this was camouflaged; under a light
chrome with one blue accent it is actively misleading — on the Approvals tab it puts up to five
blues on one screen and breaks the accent budget by four.

- **Note carefully:** this is **not** covered by decision #3, which fixes `--wx-amber: #0032b0` in
  its seven `--wx-*` scopes. `--tc-amber` is a different token in a different namespace.
- **Recommended:** re-base `--tc-amber` to the existing `--wx-g-amber #f9ab00` with
  `--tc-amber-soft` to `rgba(249,171,0,0.12)`. No new colour enters the system.
- **Cost, stated:** it **changes the meaning of existing badges** — four pill types that users have
  been reading as blue become amber.
- **Conservative alternative:** leave it, and accept five blues on the Approvals tab plus a broken
  accent budget on the one page in the cluster with zero test coverage.

**B2. Two of the ten job-status badge tones do not render at all.** `Badge` sets
`` className={`badge ${statusTone(status)}`} `` and `statusTone()` lowercases and hyphenates
(`scheduleUtils.ts:48`), but `styles.css:12483` declares **`.badge.delayIQed` in camelCase** — a
residue of the case-preserving rename — which can never match the class `delayiqed`; and there is
**no `.badge.not-started` rule at all**. So `DelayIQed` and `Not Started` badges both fall through to
the default blue (`#e8f1ff` / `#1f52e0`). Meanwhile `mapSiteAccent()` keys off the exact string, so
**the same `DelayIQed` status shows a red legend dot and a blue badge on the same screen** (§5.17).

- **Recommended:** `.bf-tone-*` defines **all ten** `JOB_STATUSES` tones by their lowercased,
  hyphenated class names, so `delayiqed` → red and `not-started` → neutral, matching
  `mapSiteAccent()`. The camelCase rule is left in place (it matches nothing and removing it is a
  separate cleanup).
- **Cost, stated:** two badge types visibly change colour, in every place `Badge` renders — Map's
  today's-jobs rows, the map field-updates feed, the DelayIQ live feed, Travel Time Overview, the
  route result card and the Projects surfaces. That is wider than this cluster.
- **Conservative alternative:** define the eight tones that render today and leave the two broken
  ones blue, keeping the red-dot/blue-badge contradiction.

## 6.4 Dead controls and recorded defects — kept, demoted, and awaiting a decision

Nothing in this list is removed. Each is preserved, visually demoted to the outline register so a
re-skin does not make it *more* trustworthy, and listed for a wiring decision.

| # | Control / defect | Where | Proposed resolution |
|---|---|---|---|
| C1 | `Report period` select — no `onChange` | Reports §5.11 | Wire to the KPI window, or remove. **The `#production-reports` marketing page sells exactly this control** (`.pr-period` chip `Last 6 Months`). |
| C2 | `Export` — no `onClick` | Reports §5.11 | Wire to the CSV pattern the two working exporters next door already use (`buildflow-field-updates.csv`, `buildflow-delayiqs.csv`). Same marketing promise (`.pr-export-btn`, *"Export the weekly review in a click"*). |
| C3 | `Export` — no `onClick` | TimeCard header §5.24 | Same. |
| C4 | 4 × `Jobsite quick add` chips — no `onClick` | TimeCard §5.25 | Wire or remove; they are the tab's most inviting controls. |
| C5 | `Generate WH-347` — no `onClick`, **and styled as the primary** | TimeCard §5.31 | Demoted to outline by this mapping. Wire or remove — a certified-payroll form that does not generate is the cluster's most misleading affordance. |
| C6 | `Statement of compliance` — no `onClick` | TimeCard §5.31 | Same. |
| C7 | `Export approved hours` → `Export queued` — nothing generated, unresettable | TimeCard §5.30 | Wire, or make the flip resettable. |
| C8 | 4 payroll format chips are non-interactive `<span>`s | TimeCard §5.30 | Make them real options, or keep as a supported-formats list (this mapping styles them as the latter). |
| C9 | `Privacy Policy` / `Terms of Service` / `Help Center` — no `onClick` | Map footer §5.23 | Wire to the existing `#privacy` / `#terms` / `#help-center` welcome pages. |
| C10 | `View details` → `refreshMap()` only | Map §5.20 | Re-label, or wire to a real detail view. The label misdescribes the action. |
| C11 | `No fuel data yet` in a **travel-time** panel | Map §5.20 | Copy mismatch; one-word fix. |
| C12 | Map inline job editor never saves | Map §5.21 | Decide: real save path, or the `Unsaved draft` label (A5). |
| C13 | `Save Field Update` only closes the composer | Map §5.22 | Decide: wire to `POST /api/field-updates` like §5.2, or re-label. |
| C14 | Photo strip slices 4 thumbs but counts `+n` from 3 | Map §5.22 | Off-by-one; one-line fix. |
| C15 | Saved routes rehydrate geometry nothing draws; the result card and coexistence note vanish on reload | Map §5.19 | Either restore `truckRouteResult`/`optimized` from storage, or stop persisting what cannot be shown. |
| C16 | `.route-lines` SVG renderer is dead; 4 route colour classes paint nothing | Map §5.19 | Left untouched by this mapping (nothing paints them). Part of the dead-CSS sweep below. |
| C17 | DelayIQ sort chip label ≠ behaviour; `.active` keyed off `!== 'reported'`; chevron only rotates on `'impact'` | DelayIQs §5.6 | Make the chip toggle `delaySortKey` like the Field Updates one, or re-label it `Sort by impact`. |
| C18 | DelayIQ early-warning has no retry; the Dashboard mirror does | §5.7 vs §5.42 | Add the retry (new copy, A9) or accept the asymmetry. |
| C19 | `submitDelayIQ` has no try/catch, no pending state, no error surface | DelayIQs §5.8 | Add all three (the composer next door has them) — a logic change, so out of scope for this brief. |
| C20 | `Log DelayIQ` is a `div.form-stack`, so Enter does nothing and a blank title silently no-ops | DelayIQs §5.8 | Make it a `<form>` with a disabled submit. |
| C21 | Edit dialog can never turn progress reporting **off**; clearing the Job select silently deletes a stored percent | Field §5.3 | Needs a product decision — silent data loss. |
| C22 | Only one variance decision can be in flight app-wide; a second card's Accept does nothing visible | §5.4, §5.5 | Disable all cards while one is resolving, or queue. |
| C23 | Notify success replaces the button permanently; per-card local, lost on navigation | §5.7 | Persist the notification, or allow re-notify. |
| C24 | Saved-view tablists have `role="tab"` but **no `aria-controls` and no `tabpanel`** | §5.1, §5.6 | An existing a11y gap this mapping inherits deliberately (adding `aria-controls` changes the accessible tree the tests walk). §8 Q4. |
| C25 | Reports chart legend is `aria-hidden="true"`, so `Planned`/`Actual` exist only visually; and that chart uses the **default** tooltip while the backlog chart has a hand-rolled one | §5.11 | Add a visually-hidden series list, or `<title>`s on the bars. |
| C26 | `Back to home` is an `<a role="button" tabIndex={0}>` with `onClick` and no `onKeyDown` | §5.13, §5.14 | One-line `onKeyDown` fix; focusable but not activatable today. |
| C27 | `.hs-thumbs` are 28×28, `aria-hidden`, not clickable, and **there is no lightbox anywhere in the app** | §5.1 | The marketing page promises *"Proof, not hearsay"* about evidence the UI cannot enlarge. §8 Q9. |

## 6.5 Proposed new tests — recommended, small, additive

| Test | Why |
|---|---|
| `density.test.ts` (grafted from hybrid) | Reads the new stylesheet raw via the `?raw` glob `boundary.test.ts` already uses; **fails the build** on any `font-size` literal outside the `--bf-app-*` allowlist (except §4d's declared exceptions) and on any selector that renames rather than prefixes an existing one. The only mechanism here that makes design drift a build failure rather than a review comment. |
| `tests/shell-nav.test.tsx` (grafted from editorial) | Two guards that reach this cluster: (a) a hub sub-page is reachable **by click alone**, no `mouseOver` — which is how `Map & Field Ops`, `DelayIQs`, `Field Updates` and `Reports` are reached today only by hover; (b) with `matchMedia` stubbed to ≤560px, `Create new` / `Bookmarks` / `Settings` / `Help` are all still reachable. Plus: every `data-tutorial-id="nav-<page>"` anchor present for the correct **21** `navItems` (App.tsx:643 — **not 22**; `settings` is not one of them), and **a locked row prompting instead of navigating**. |
| `tests/timecard.test.tsx` — **two cases only** | The TimeCard page has **zero** coverage and holds the cluster's only stateful workflow. Minimum viable: (1) clicking each of the **seven** tabs renders that tab's first card head; (2) clicking `Approve` on the first Pending card advances the chain and prepends an `Approved timecard` audit event. Written **before** `TimeCard.tsx` is touched. |
| `tests/delayiqs.test.tsx` — one case | The DelayIQs index is the least test-protected screen in the area. Minimum viable: the four view tabs filter the table and the four KPI figures render. |
| `useShellBreakpoint()` (grafted from editorial) | Every media-gated component in this cluster needs the same shape: `matchMedia` read, **defaulting to `false` when `matchMedia` is absent**, with the reason commented — because `test/setup.ts:57` answers `matches: false` for every query and a component that assumes otherwise silently changes behaviour under test. |

## 6.6 Proposed REMOVALS — needs approval

Nothing user-visible is removed. Two code-level removals are proposed:

1. **The dead map CSS**, none of which has matching JSX anywhere in `App.tsx`:
   `.map-primary-grid`, `.map-panel.live-map`, `.map-scale-layer`, `.map-city-label`,
   `.route-lines` + `.route-blue`/`.route-green`/`.route-orange`/`.route-purple`/`.route-traffic`,
   `.map-marker*` (dot/label/status variants), `.map-legend`, `.map-reference-stop*`,
   `.map-pin-kind`, `.map-pin-tag`, `.crew-pin.one|.two|.three`, `.map-route-card`,
   `.live-tracking-panel`, `.map-route-empty`, `.map-weather-editor`, `.map-page-tabs`, plus the
   two unreachable states: `const [mapExpanded] = useState(false)` (App.tsx:28995 — no setter is
   destructured, so `.map-ops-layout.expanded` and its 1180px rule can **never** apply) and
   `const [, setShowRoutes]` (28992 — written by 4 handlers, read by nothing).
   **Reason:** `styles.css` holds three overlapping generations of `.map-*` rules
   (~L3693-4600, ~L9142-11330, ~L14919-16800) and much of the earlier CSS targets markup that no
   longer exists. A re-skin that leaves it in place makes the next person restyle rules that render
   nothing. **Risk:** this is a large deletion in a file the parallel session may be editing, and
   this repo has a recorded failure mode for concurrent `App.tsx`/CSS churn (a black screen with an
   empty `#root` and no console errors). **Do it last, in its own commit, so a regression is
   attributable.**
2. **`--wx-serif` from the five app scopes this cluster owns** —
   `field-updates-redesign.css`, `delayIQs-redesign.css`, plus the `var(--wx-serif)` reads in
   `styles.css`'s reports blocks and `redesign.css` — rewritten to `var(--bf-font-sans)`
   (decision #4). `welcome-redesign.css:34` keeps its declaration; the marketing scopes are not in
   scope.

---

# 7. Tests touched — consolidated

**Expected edits to existing tests: zero.** Every screen entry above states why. The full list of
tests this cluster's work can reach:

| Test | Screens | Verdict |
|---|---|---|
| `tests/index-pages.test.tsx:510` — lists field updates in the index table | §5.1 | passes unchanged |
| `tests/index-pages.test.tsx:540-542` — composer selects still present | §5.2 | passes unchanged |
| `tests/index-pages.test.tsx:544` — corrects a field update from its row link | §5.3 | passes unchanged |
| `App.test.tsx:561` — creates a field update from the form | §5.1, §5.2 | passes unchanged — **but `getAllByRole(...).at(-1)` requires the composer to stay after the index card and both `Add Field Update` labels to stay identical** |
| `App.test.tsx:987` — real variances as Pending Approvals + the 9-string blocklist | §5.5, §5.7, §5.42 | passes unchanged — **no blocklisted string may reappear on the Dashboard** |
| `App.test.tsx:1032` / `:1336` — approve / reject a variance | §5.4, §5.5 | passes unchanged |
| `App.test.tsx:1307` / `:1308` — Project Alerts row + its `<time datetime>` | §5.43 | passes unchanged |
| `App.test.tsx:1334` — `Review Drywall` button | §5.42 | passes unchanged |
| `App.test.tsx:1017` — `/Timecard Exception/` absent from the Dashboard | §5.32 | passes unchanged |
| `App.test.tsx:1024` — `/Production Trend \(Backlog\)/` absent from the Dashboard | §5.11 | passes unchanged |
| `App.test.tsx:1000` / `:1041` — `/api/delayiq/early-warning` stubbed | §5.7 | passes unchanged |
| `App.test.tsx:623` — Settings from the reports username button | §5.11 | passes unchanged |
| `App.test.tsx:281` / `:281-283` — `Reports` in the nav set; solution copy | §5.11, §5.46 | passes unchanged |
| `App.test.tsx:269-272` / `:374` — solution field copy | §5.45 | passes unchanged |
| `App.test.tsx:376` — solutions-nav reports entry | §5.14, §5.46 | passes unchanged |
| `App.test.tsx:242` — `Map & Field Ops lesson` | §5.38 | passes unchanged |
| `App.test.tsx:160-213` — onboarding product label `Map & Field Ops` / id `map-field-ops` | §5.33 | passes unchanged |
| `tests/map.test.tsx` — add-on prompt (`Get Map & Field Ops`, pitch, `Job sites` absent, `Close`) | §5.33, §5.34 | passes unchanged |
| `tests/map.test.tsx` — one expandable card per project (name/count/status/coords/`aria-expanded`) | §5.17 | passes unchanged — **coords must stay hidden while collapsed** |
| `tests/map.test.tsx` — recounts site jobs through the filters | §5.15, §5.16, §5.17 | passes unchanged — **filters stay native `<select>`s; Status stays behind More Filters** |
| `tests/map.test.tsx` — plan + truck route coexistence | §5.19 | passes unchanged — **the drive-time label and figure must stay siblings in one parent** |
| `tests/map.test.tsx` — suggests trucker destinations | §5.19 | passes unchanged — **combobox/listbox/option ARIA and the exact option count** |
| `tests/map.test.tsx` — routes to a picked suggestion | §5.19 | passes unchanged — **shortened origin `Riverside Office Bldg`; Nominatim/OSRM hosts unchanged** |
| `tests/map.test.tsx` — field updates beside the sites + composer | §5.22 | passes unchanged — **hyphenated meta lines, `Add Field Update` → `Save Field Update`, `Update note`** |
| `tests/map.test.tsx` `openMap()` | all map screens | passes unchanged — **`findByRole("heading", {name: "Job sites"})` is the page-ready signal for the whole file, and `Skip Tutorial` must stay clickable** |
| `tests/tutorial.test.tsx` (5) | §5.38, §5.39, §5.40 | passes unchanged; the wrap-up step needs the manual browser check |
| `tests/settings.test.tsx` (9) | §5.37 | passes unchanged by this cluster; **run first** because the shell phase renders the TopBar on Settings |
| `components/CommandPalette.test.tsx` (4) | §5.36 | passes unchanged |
| `schedule/boundary.test.ts` (8) | §5.4 | passes unchanged — **no `sched-`/`gantt-` class may move into `App.tsx`; never name anything `bf-sched-*`** |
| `tests/landing-menus.test.tsx` | §5.13 | passes unchanged |
| `dashGrid.test.ts` (19) | §5.5, §5.32, §5.41–§5.44 | passes unchanged — `DASH_COLS`/`DASH_ROW_UNIT`/`DASH_GAP` frozen |
| **NEW** `density.test.ts` | all | must be added with the stylesheet |
| **NEW** `tests/shell-nav.test.tsx` | §5.34, §5.36 | recommended |
| **NEW** `tests/timecard.test.tsx` (2 cases) | §5.24–§5.32 | recommended **before** touching `TimeCard.tsx` |
| **NEW** `tests/delayiqs.test.tsx` (1 case) | §5.6 | recommended |

**Run order:** `tests/settings.test.tsx` → `schedule/boundary.test.ts` →
`components/CommandPalette.test.tsx` → `tests/tutorial.test.tsx` → `tests/map.test.tsx` →
`tests/index-pages.test.tsx` → the full 346.

**Screens with no test coverage at all, protected only by the item lists above:** DelayIQs index,
all four DelayIQ rail panels, the whole Reports page below the shell, every Map panel except Job
sites / Route Optimization / Field Updates, the map footer, **all nine TimeCard screens**, the
Bookmarks locked tile, and the Dashboard Recent-activity feed. That is 20 of the 47 entries here.

---

# 8. Open questions for the user

1. **§6.3 B1 — `--tc-amber: #0b4ae8` is a blue.** Re-base it to `--wx-g-amber #f9ab00` and change
   the meaning of four existing pill types, or leave it and accept five blues on the Approvals tab?
   (Decision #3 does **not** cover this token.)
2. **§6.3 B2 — two of ten job-status badge tones never render.** Define all ten (so `DelayIQed`
   turns red, matching its own legend dot) and accept a visible colour change on surfaces beyond
   this cluster, or define only the eight that render today?
3. **§5.11 — the Brief register.** Is one page in this cluster allowed the display rung
   (`clamp(32px,3.6vw,46px)` on the Reports `h1`, with figures at `clamp(26px,2.4vw,34px)`), or does
   everything stay under 26px per preserve's ceiling? If yes, Reports is the only candidate: no
   table, no selection, and effectively no test coverage.
4. **§6.4 C24 — the saved-view tablists** have `role="tab"` with no `aria-controls` and no
   `tabpanel`. Fix it (changing the accessible tree that `tests/index-pages.test.tsx` walks), or
   inherit the gap?
5. **§6.4 C22 — the single in-flight variance decision.** Disable every card while one resolves, or
   leave a second Accept doing nothing visible?
6. **§5.7 / §5.42 — `onCriticalPath`.** The DelayIQs panel receives it and never shows it; the
   Dashboard mirror uses it to pick a row icon. Should the DelayIQs panel show it too (new signal,
   no new data)?
7. **§6.4 C23 — the permanent notify state.** `Affected trades notified` never returns to idle and
   is lost on navigation. Persist, or allow re-notify?
8. **§6.4 C25 — the `aria-hidden` chart legend on Reports.** `Planned`/`Actual` exist only visually.
   Add a visually-hidden series list?
9. **§6.4 C27 — jobsite photo evidence.** The marketing page promises *"Proof, not hearsay"*, but
   in-app the largest a photo is ever shown is the variance card's `.sv-photo`; row thumbs are
   28×28, `aria-hidden` and not clickable, and there is **no lightbox anywhere in the app**. A
   viewer is a feature, not a re-skin — do you want it scoped separately?
10. **§4g — the `reports-shell` special case.** Under one flat ground, `reports-shell`
    (`grid-template-columns: 260px / 72px`, `#f5f8fb`, `--hs-paper`) and the normal shell become
    visually identical, and the only remaining difference is a **duplicated set of element ids**
    (`reports-notifications-panel`, `reports-account-menu`). Collapsing that special case is a
    shell-level change, not a page-level one. Schedule it?
11. **§6.1 A1/A2 — the Map page's missing `h1`** and re-anchoring `map-page-title` to it. Approve
    the new heading and the anchor move?
12. **§6.6 — the dead map CSS sweep** (18 selector groups plus two unreachable state variables).
    Approve, and confirm no parallel session is editing `styles.css`?
13. **The light-chrome hairline (§4g).** Needs verifying on an **uncalibrated** monitor before
    merge, not asserting. Who signs that off?

---

# 9. Item accounting

| Source | Screens | info + actions + columns + charts + inputs | Completeness-check items |
|---|---|---|---|
| `field-delayiq-reports.json` | 14 | **284** | 9 missing screens · 15 missing information · 11 missing actions · 5 missing states · 5 corrections = **45** |
| `map-timecard.json` | 19 | **280** | 5 missing screens · 10 missing information · 5 missing actions · 3 missing states · 5 corrections = **28** |
| **Total** | **33 primary + 14 seam = 47 entries** | **564** | **73** |

**637 items accounted for. 0 dropped.** Everything I believe should change is in §6.1–§6.6 as a
proposal awaiting approval, and everything I believe is a bug is in §6.3 with both options priced.
