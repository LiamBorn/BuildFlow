# Screen-by-screen redesign mapping — cluster: **schedule**

Seven routes (`#schedule`, `/month`, `/week`, `/list`, `/gantt`, `/kanban`, `/matrix`), 38 distinct
screens, the densest surfaces in the product. Written against the settled shell concept
**"Daylight Rail" (preserve)** and `DESIGN_TOKENS.md`.

Presentation only. No business logic, no data model, no API call, no state management, no auth, no
save/load behaviour changes. Every page, route, label, data field, column, chart, input, button
action and string that exists today still exists afterwards; where I want something gone it is in
§13 **Proposed removals, needs approval** and nowhere else.

---

## 0. Two verified corrections that change the plan before it starts

**0.1 `boundary.test.ts` does not say what the brief and three of the four concepts say it says.**
I read the file on disk: `client/src/schedule/boundary.test.ts`, 81 lines, **6** `it()` blocks — not
eight. It contains **no** grep for the substring `sched-`, **no** grep for
`className=…gantt-`, and **no** assertion that a page contains `<ScheduleExportMenu`. Its own header
comment says the opposite of the folklore:

> *"a page module is imported and its component called, so renaming an export or a class prefix
> changes nothing here."*

What it actually enforces, and therefore the real constraint on this cluster:

| # | Assertion (line) | Consequence for this mapping |
|---|---|---|
| 1 | one `<XPage` per schedule page, rendered exactly once from `App.tsx`, and `App.tsx` contains `page === "<id>" && ` (24) | routing untouched; nothing moves |
| 2 | `App.tsx` declares no top-level `/(Schedule\|Sched\|Week\|Month\|Kanban\|Matrix\|Gantt\|Job\|Booking)[A-Za-z]*(Page\|Board\|View\|Cell\|Card\|Drawer\|Row\|Lane\|Chip)/` and does **not** import `./schedule/parts/` (35) | no new schedule component may be declared in `App.tsx`. A `bf-` **class name** in `App.tsx` is not policed |
| 3 | no `schedule/**` file imports a built-in holiday list; every page calls `useSchedulePage(` (43) | the work calendar stays the only source of holidays/working days |
| 4 | every page matches `const page = useSchedulePage(` and matches **none** of the 17 hook-only calls; all but `gantt` render `<SchedulePageFrame` (53) | the Gantt's frame exemption is law; no page may derive its own week/filters/KPIs |
| 5 | no `/sched/i` **`.ts`/`.tsx`** at `src/` root (66) — the glob is `/src/**/*.{ts,tsx}`, so **CSS at `src/` root is not policed** | `src/schedule-daylight.css` is legal, exactly as `schedule.css` and `schedule-phone.css` already are |
| 6 | no page imports a sibling page; only `App.tsx` imports `schedule/pages/` (71) | unchanged |

So: **the `/gantt-/` className fear is not a live constraint, and the "one export menu" rule is no
longer machine-enforced.** I still honour both by hand (nothing is renamed, every page keeps its
export menu) — but the plan must not be *shaped* by a guard that no longer exists, and §12 records
the real guard list. Preserve's risk #6 ("Never name anything `bf-sched-*`") is kept anyway as
cheap insurance.

**0.2 Preserve's "nothing in the app exceeds 26px" is false in this cluster, and its
`--bf-app-title` must not be applied here.**

| Element | File:line | Today |
|---|---|---|
| `.sched-rx .dx-title` (every schedule `h1`) | `schedule.css:826` | `clamp(27px, 3vw, 38px)` / 750 / `-0.02em` / 1.05 |
| `.sched-rx .schedule-kpis .kpi-card strong` | `schedule.css:1063` | `34px` / 750 / `-0.02em` / tabular |
| `.sched-rx .dx-sub` | `schedule.css:846` | `clamp(15px, 1.2vw, 17px)` / 1.6 / 54ch |
| `.sched-rx .dx-hero` | `schedule.css:792` | `max-width: 44ch` |

The schedule cluster already tops out at **38px**, which is *exactly* the floor of
`--bf-type-display` (`clamp(38px, 5vw, 78px)`) — the Welcome Page's smallest display size. Applying
preserve's `--bf-app-title: clamp(22px,1.9vw,26px)` here would shrink the display register by 1.46×
and **delete the only value at which the app ladder and the marketing ladder touch.** It also
already sets prose measures in `ch`, which §3a of the concept lists as a literal carry-over.

Ruling: `--bf-app-title` is scoped to the HubSpot index pages that genuinely sit at 22px. This
cluster keeps its two rungs and puts them on the ladder (weights and tracking only). The shell
cluster owner must not point `--bf-app-title` at `.dx-title`.

---

## 1. The translation for this cluster, with the numbers

### 1a. Carries over **literally** (same value, no rescale)

Ground `#f5f6fa` (already `.sched-rx`'s `--wx-bg`); ink `#1c1c1a`; muted `#575550`; hairlines
`rgba(28,28,26,0.13)` / `0.07`; card `#ffffff`; accent `#2f6bff`; radius ladder
`999/26/20/18/12/8` + `50%`; the seven shadow steps; `cubic-bezier(0.22,1,0.36,1)`;
interaction `.18/.25/.28/.3s`; entrance `.7–1.0s`; the four hover moves; one-shot reveals
(`threshold 0.16`, `rootMargin '0px 0px -6% 0px'`, `.in`, unobserve); prose measures in `ch`; Inter
only. Eight of these eleven are already true inside `.sched-rx` (`schedule.css:664-681`) — this
cluster starts closer to the language than any other.

**One declared divergence from the token doc, kept deliberately:** `--wx-faint` in `.sched-rx` is
`#6b6862`, not the doc's `#8a877e`, with the reason committed at `schedule.css:669`
(*"5.5:1 on white — the lighter #8a877e was 3.6:1 and failed AA for text"*). Every eyebrow, meta
line and helper in this mapping reads `var(--wx-faint)`, i.e. **#6b6862**. Do not "restore" the
doc's value; it fails AA at 11.5px.

### 1b. The dense ladder — appended to `client/src/design-tokens.css`

```css
:root {
  /* ---- the schedule cluster's rungs. One continuous ladder with the Welcome Page:
         its top rung IS --bf-type-display's floor (38px). Nothing here is invented;
         each value is either today's value or the nearest ladder step. -------- */
  --bf-app-display:        clamp(27px, 3vw, 38px);   /* page h1 — TODAY'S value, kept */
  --bf-app-display-track:  -0.02em;
  --bf-app-display-lead:   1.05;
  --bf-app-figure:         clamp(28px, 2.4vw, 34px); /* KPI value — today's 34px as the ceiling */
  --bf-app-figure-track:   -0.02em;
  --bf-app-lede:           clamp(15px, 1.2vw, 17px); /* .dx-sub — today's value, kept */
  --bf-app-section:        15px;   /* panel h2, view-card title, rail head */
  --bf-app-stat:           14px;   /* CPM stat, matrix Load total, status-band facts */
  --bf-app-row-strong:     13.5px; /* the primary cell of a row */
  --bf-app-row:            13px;   /* body row, legend, sidebar row */
  --bf-app-meta:           12px;   /* second line, timestamp, helper */
  --bf-app-eyebrow:        11.5px; /* THE label role — see 1d */
  --bf-app-eyebrow-track:  0.045em;
  --bf-app-micro:          11px;   /* badge, count pill, lane count */
  --bf-app-lead-row:       1.45;
  --bf-app-prose:          62ch;   /* every run of prose in-app */

  --bf-lift-dense:         -4px;
  --bf-shadow-card-hover-dense: 0 12px 30px rgba(28, 28, 26, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  :root { --bf-lift-dense: 0px; }
}
```

`--bf-shadow-card-hover-dense` is **the only new step in the shadow ladder**, and it is named so a
reviewer can veto it in one line. Justification: the ladder's hover alpha is `0.12`; its blur
(`60px`) is calibrated for a 300px-wide marketing card. On a 96px job card a 60px blur reads as fog.
This step keeps the ladder's alpha and borrows the rest-card blur (`30px`). Every other shadow in
the cluster resolves to one of the seven documented steps.

Also, two corrections to `design-tokens.css` as it stands (consequences of decision #2, the accent
is `#2f6bff`): `--bf-focus-ring` → `0 0 0 4px rgba(47,107,255,0.12)`, and the `#1a73e8` literal in
its comment block. In this cluster the same stale Google-blue alpha appears once as a live value:
`schedule.css:812` `.sched-rx .dx-dot { box-shadow: 0 0 0 4px rgba(26,115,232,0.12) }` → re-base to
`var(--bf-focus-ring)`.

### 1c. The ratio, stated against the source's own internal range

| | Bottom rung | Top rung | Range |
|---|---|---|---|
| Welcome Page | 12px meta | 96px hero | **8.00×** |
| Schedule cluster | 13px row (`--bf-app-row`) | 38px `h1` (`--bf-app-display` max) | **2.92×** |

**The product's range is 36% of the marketing page's, on one continuous ladder whose top rung is
the marketing page's bottom display rung.** Both halves of that sentence are checkable:
`--bf-app-display`'s max (38px) === `--bf-type-display`'s min (38px), and no value in the cluster
falls between 17px and 27px (the two ladders' rungs interleave without a gap). Rhythm compresses
harder — 108px between Welcome sections becomes `--bf-rhythm-dense` 20–34px between blocks, ÷4.0 —
and §14 owns that as the dimension that does not survive.

### 1d. The eyebrow rule (the PRESERVE graft, grafted verbatim)

**11.5px / 650 / `0.045em` / uppercase / `var(--wx-faint)` / transparent fill.** One role, one
declaration, no rescale, `x1` from the Welcome Page. It replaces **eleven** separate label
treatments in this cluster, all measured:

| Where | File:line | Today | After |
|---|---|---|---|
| List column strip (`Time/Job/Crew/Status`) | `schedule.css:1263` | `#fff` fill, faint, no tracking | the rule |
| List day head `Monday · Jun 15` | `schedule.css:2807` | `--wx-bg-2` fill, 11.5/700/0.04em upper, mut | the rule (keeps `.is-today` / `.is-holiday` tints) |
| Matrix column head `MON` + corner `Crew` + `Load` | `schedule.css:3263`, `:3286` | `--wx-bg-2` fill, 11.5/700/0.04em upper, mut | the rule |
| KPI label | `schedule.css:1055` | 12.5/600, sentence case, mut | the rule |
| CPM stat label | `schedule.css:2947` | 10.5/700/0.05em upper, faint | the rule |
| Week header day `MON` / `2 Crews` | `schedule.css:1086-1100` | 700, mut/ink | the rule |
| Kanban lane `h3` | `schedule.css:3084` | 12.5/700/0.02em, ink | the rule + `--kan-tone` dot unchanged |
| Gantt sidebar header `Jobs` / `Duration` | gantt block | 12px/600 mut | the rule |
| Rail panel head `<span>` (`View all` siblings' meta) | `schedule.css:1644` | 12.5/600 faint | the rule |
| Trade legend / status legend labels | `schedule.css:2540`, `:1196` | 12.5/550, 13px | the rule |
| Import-dialog stat labels (`activities read`, …) | `.sim-stats` | mixed | the rule |

Column heads are the most-repeated text in this cluster (7 pages × 8–15 heads). This one rule buys
more family resemblance than anything else in the file, and it is a **pure win on fidelity with a
0.5px net size change**.

### 1e. The card licence, and the counted boundary audit (the CANVAS graft, amended)

A white bordered rectangle is licensed only if:

1. **its boundary is itself interactive** — draggable, resizable, dismissible, or it navigates; or
2. **it is a viewport clipping a scrolling world**; or
3. *(cluster amendment, declared)* **it is a titled block that must be told apart from a sibling
   block carrying different data on the same ground — and then only the outermost frame.**

Clause 3 exists because the landing stacks five titled blocks and three rail panels on one ground;
CANVAS's own audit kept 2 of 10 rather than 0. The enforceable corollary is **no frame inside a
frame**, with exactly one permitted nesting: an interactive card (clause 1) inside a clipping
viewport (clause 2) — a job card in a board.

| Surface | Resting boundaries today | After | Killed |
|---|---|---|---|
| Landing (no first-run, 2 variances, 4 queue rows) | **24** | **12** | 4 KPI frames, the CPM band frame, the `.ss-strip` frame, 4 `.sched-queue-row` frames, 2 `.sv-card` frames, the double-framed variance section |
| Week board | **6** | **2** | 4 KPI frames (board + rail panel remain, both licensed) |
| Matrix | **10** | **2** | 4 KPI frames, `.sched-matrix-head` fill, `.sched-matrix-total` per-row fill, the board-footer band's fill, the legend's fill (grid frame + alerts panel remain) |
| Kanban | **11** | **7** | 4 KPI frames (5 lane frames stay: a lane is a drop target = clause 1; the board frame = clause 2; alerts panel = clause 3) |
| List | **7** | **2** | 4 KPI frames, the header strip fill, the day-head fills (board frame + alerts panel remain) |
| Gantt | **8** | **3** | 4 KPI frames, the `.gantt-seg` frame around the segmented control becomes a pill group, the legend fill (page card + chart frame + drawer remain) |

Six of the ten Matrix boundaries were meaningless: a head fill inside a framed grid, a per-row fill
inside the same grid, a footer band inside it, a legend fill, and the four KPI frames that
surrounded non-interactive figures.

**The KPI strip is the worked example of the additivity rule.** `parts/shared.tsx` `KpiCard`
renders `<div className="kpi-card">` inside `<div className="kpi-grid schedule-kpis">`. It becomes
`<div className="kpi-grid schedule-kpis bf-figures">` → `<div className="kpi-card bf-figure">`
(and `kpi-card-button bf-figure` on the pages that pass `onClick` — none in this cluster today,
but the variant must not break). The new sheet zeroes the inherited border, radius and shadow from
the `bf-` side; **`.schedule-kpis .kpi-card` still matches**, which is what
`pages.test.tsx:348` queries. Frameless figures on the flat ground with an uppercase label above
and a helper below is not an invention — it is `DESIGN_TOKENS.md`'s own stat-figure recipe
(figure + 30ch helper, no card).

### 1f. The gradients, named

The trio is `#4285f4 → #9b72cb @54% → #d96570`. `DESIGN_TOKENS.md` spends it on exactly three
things, the first of which is *"the hero's `em`"*.

| Site | File:line | Ruling |
|---|---|---|
| `.sched-rx .dx-title em` — the landing `h1`'s *"at a glance."* | `schedule.css:837` | **KEPT.** This is Welcome role #1 (the hero `em`) rendered in-app, not a fifth use. **Declared deviation from concept §3a**, which licenses one in-app use (the AI sparkle). If a reviewer wants preserve's letter: `color: var(--wx-ink); -webkit-text-fill-color: initial;` — one rule, and the `<em>` stays in the DOM either way |
| `.ss-project-track i` — the per-project percent bar | `schedule.css:517` | **FLAT.** → `background: var(--wx-blue)`. The trio on a 6px data bar is the doctrine's exact failure case |
| `.sim-band-range` — the import dialog's P10–P90 confidence ramp | `schedule.css:4057` | **RE-BASED**, not flattened: `#7fb2ff → #2f6bff 55% → #c2410c` becomes `rgba(47,107,255,0.28) → var(--wx-blue) 55% → var(--wx-red)`. The ramp is data (low risk → high risk); the `#c2410c` orange is off-palette. Encoding preserved, hue budget respected |
| `.dx-aurora-1/2/3` + `.dx-cursor` | `schedule.css:716-743` | **UNCHANGED.** These *are* the Welcome Page's aurora field. Blur stays 50px, no fourth blob, no `will-change` — the recorded paint regression |
| `.crew-row.is-lazy .schedule-cell` hatch | `schedule.css:2060` | **KEPT.** The only signal of the progressive-load state |
| `.gantt-ghost` baseline stripes | `schedule.css:5344` | **KEPT as data, re-inked:** `rgba(20,32,58,…)` → `rgba(28,28,26,…)` |

Also killed for "one accent": nothing in this cluster carries the pre-blue-era orange
`--shadow-accent: 0 10px 24px rgba(251,133,0,0.26)` — I grepped it; it lives in `redesign.css:17`
and `styles.css:7595/7608/7659`, i.e. the base sheets, and it is the **shell cluster's** kill. Named
here so it is not lost: 7 sites, 2 files.

### 1g. The reveal arithmetic (the CANVAS graft)

Only the landing passes `motion` — the six views render the same markup with no reveal and no
cursor glow, and that stays true (a scroll reveal on a board is wrong). Today's landing reveals are
already within budget: **5** blocks (hero, control row, `.schedule-layout`, footer, `.ss-strip`) at
`translateY(26px)` / `0.85s` / `80ms` stagger.

| | Today | After | Why |
|---|---|---|---|
| shift | 26px | **12px** | a 26px shift on a 46px row moves it 57% of its own height |
| duration | 0.85s | **0.55s** | at ~1s the page is still settling when the eye arrives |
| stagger | 80ms | **50ms** | 5 blocks × 80ms = 400ms of queue |
| attached to | 5 sections | **the same 5 sections** — never a row, never a cell | budget 6/page, 5 used |
| `useHudMotion.ts:50` | `threshold: 0.12, rootMargin: '0px 0px -5% 0px'` | **`0.16` / `-6%`** | puts the app on the documented contract; one line, ten page roots, no test |

`[data-reveal]` targets keep **static** classNames. `.schedule-layout`, `.dx-hero`, the control row,
`.schedule-page-footer` and `.ss-strip` all already do; nothing in this mapping adds a dynamic class
to any of them. (The repo's documented trap: a dynamic className wipes the imperatively-added `.in`
and leaves the block at `opacity: 0` forever.)

### 1h. Keyframes: names frozen, values changed

Every keyframe in this cluster keeps its **name**, because the five `prefers-reduced-motion` blocks
null them by name and a rename silently un-nulls them: `dx-pulse`, `dx-fade-up`, `schedCellIn`,
`sched-pending`, `sched-live-flash`, `sv-drawer-in`, `hsg-rise`, `hsg-lift`, `hsg-land`, `hsg-fade`,
`hsg-slide-in`, `hs-pop`. Zero new keyframe names in this cluster.

The reduce blocks to extend (never a new pattern): `schedule.css:1436` (dx-dot, reveal durations,
KPI/job/unassigned transitions, aurora transform), `:1479` (`is-pending`), `:1813` (`is-live`),
`:2181` (matrix tip), `:3406` (kanban card), `:5188` (gantt frame/status/drawer/dragging/landing/
drag-tip/menu/add-helper), and `field-variance.css:296` (`sv-drawer-in`).

**One confirmed gap to close:** `@keyframes schedCellIn` (the Month's per-week entrance,
`animation-delay: calc(var(--d) * 55ms)`) has **no** reduced-motion guard anywhere. Add
`.sched-rx .sched-cal-cell { animation: none }` to the existing `schedule.css:1436` block. That is
the eighth line of an existing block, not an eleventh pattern.

### 1i. The three inks → two, and the Gantt's cheap flip (the HYBRID graft)

`.gantt-page` and the ported chart run on `--hsx-*`, whose `--hsx-ink` is **`#14203a`** — the third
ink the concept names. In this cluster that costs 17 verified sites: 13 navy shadow literals
(`schedule.css:1736, 4688, 4698, 4725, 4726, 4757, 4808, 4913, 4984, 4999, 5342, 5344, 5351`) and 4
navy ink literals (`:1748, :4395, :4951, :5274`). `var(--hsx-*)` is read **128 times** in
`schedule.css`.

So the Gantt is re-skinned by **re-valuing eight tokens in two places**, not by rewriting 128 rules:

```css
/* .gantt-page (the page's own scope) and .gantt, .gantt-menu (schedule.css:5271, the portalled
   menu needs its own copy) — same eight values in both blocks */
--hsx-ink:       #1c1c1a;                    /* was #14203a — the third ink dies here */
--hsx-text:      #1c1c1a;                    /* unchanged; ink and text now agree */
--hsx-mut:       #575550;                    /* unchanged */
--hsx-faint:     #6b6862;                    /* was #8a877e — matches .sched-rx's AA fix */
--hsx-line:      rgba(28, 28, 26, 0.13);     /* was #e6e8f0 */
--hsx-line-soft: rgba(28, 28, 26, 0.07);     /* was #eef0f4 */
--hsx-hover:     rgba(28, 28, 26, 0.035);    /* was #f6f8fc */
--hsx-amber:     #b45309;                    /* unchanged — see the --wx-amber note below */
```

Cheapest possible route to "one ground, no banding" on the Gantt, revertable in one commit. The 13
navy shadows are then a find-and-replace of `rgba(20,32,58,` → `rgba(28,28,26,` **with the alpha
re-pinned to a ladder step** (they are 0.06/0.12/0.14/0.2/0.22/0.24/0.42 today; the ladder has
0.05/0.08/0.12/0.13/0.14/0.2/0.28).

**`--wx-amber` stays `#0032b0` exactly as it renders today** (decision #3). In this cluster it is
live on the `Planned` badge and the `ready-to-start` badges. Against paper chrome a blue "Planned"
badge sitting beside the `#2f6bff` accent becomes *more* visible, not less. Rendered faithfully,
flagged in §14, not touched. Note the split the token doc records: `.sched-rx` declares
`--wx-amber: #0032b0` (`schedule.css:678`) while the Gantt's `--hsx-amber` is a real amber
`#b45309`, so the same semantic is blue on six pages and amber on the seventh. Also faithful, also
flagged.

### 1j. The four hover moves in this cluster — and the fifth that has to go

| Move | Where it applies |
|---|---|
| **1 Lift** (`--bf-lift-dense` -4px + `--bf-shadow-card-hover-dense`, `0.28s var(--bf-ease)`) | the 6 view cards, `.schedule-job`, `.unassigned-card`, `.sched-kan-card`, `.bm-tile` |
| **2 Invert** (outline → ink fill) | `.export-button` (**already correct today**, `schedule.css:1240`), `.outline-button`, `.sched-book`, `.sched-rail-foot-btn`, `.sched-cpm-baseline`, `.sched-kan-more`, the dialogs' Cancel |
| **3 Slide** (`translateX(var(--bf-slide))` = 3px) | `.sched-rail-link` "View all", `.sched-alert2` rows, `.sched-list-view button`'s trailing chevron, `.hs-flyout-view` rows, `.sched-act` chips (**already 2px today** → 3px) |
| **4 Tilt** | **retired in this cluster.** See below |

**Retired:** `DxTilt`'s 7° pointer-driven `rotateX/rotateY` on the four KPI cards
(`schedule.css:1050`). Tilt is the token doc's move for *product mocks*; a 13px stat card tilting
under the pointer smears its own numerals, and once the KPI frame is gone (§1e) there is no surface
left to tilt. Executed as **one CSS rule, no JSX change**:
`.sched-rx .schedule-kpis .kpi-card { transform: none }` — `DxTilt` stays mounted, keeps publishing
`--rx/--ry`, and `.dx-tilt` stays in the DOM, so no selector and no test moves. This cluster
therefore spends **three** of the four moves and invents no fifth. I am explicitly **not** porting
`spotlight-surface.tsx` here: on a board there is no non-interactive surface whose hover means
anything, and an ambient pointer glow over a drag-and-drop grid competes with the drop-target ring.

**And the actual fifth move that exists today and must go:** `.sched-rx .schedule-list-view
button:hover` sets `background: var(--wx-bg-2)` **plus `box-shadow: inset 0 0 0 2px var(--wx-blue)`**
(`schedule.css:1270`) — an inset blue ring, which is *byte-identical* to `.focused`
(`schedule.css:1183`, the "this job's drawer is open" signal). Hover and open-record are
indistinguishable on the List today. After: hover is the wash `rgba(28,28,26,0.035)` + the trailing
chevron sliding 3px; **the inset blue ring is reserved for `.focused` / `.is-selected` alone.** Same
correction on `.sched-matrix-cell:hover` (`schedule.css:3374`, inset 2px `--sc-concrete`) → wash +
a 1px hairline brighten, ring reserved for `:focus-visible`. Declared visible change, and it makes
a real state legible again.

### 1k. Class-name additivity + the pin list (the CANVAS graft, promoted to a review gate)

**The frame adds classes and never replaces a pinned one.** Every selector below is queried by
class or by attribute in a test, or is load-bearing for the tutorial. The new stylesheet ships this
list as its header comment block:

```
/* PINNED — these class names and attributes are a test API. Add classes beside them; never rename,
   never replace, never remove one from an element. Verified against pages.test.tsx, scale.test.tsx,
   tests/schedule.test.tsx, boundary.test.ts, GanttDependencyLinks.test.tsx (2026-09-10):
     .schedule-kpis .kpi-card        .sched-matrix-util          .sched-matrix-total b
     .sched-view-key                 .sched-views                .sched-avail-name
     .sched-firstrun-steps li.is-done .sched-list-day            .sched-list-quiet
     .sched-kanban  .sched-kan-lane  .sched-kan-card  .sched-kan-more   header b (lane total)
     .sched-matrix  .sched-cal-cell  .schedule-cell   .crew-row  .crew-row.is-lazy
     .schedule-job  .unassigned-card .gantt-status    .gantt-cap-note
     .gantt-frame   .gantt-sidebar   .gantt-sidebar-item  .gantt-row-spacer  .gantt-ctx
     .gantt-marker  .gantt-marker.is-holiday  .gantt-links > path  .gantt-feature[data-feature-id]
     .sched-cpm     .schedule-list-view  .schedule-board  .is-pending  .is-live  .focused
     data-crew-id   data-date   data-assignment-id   data-job-id   data-feature-id
     every [data-tutorial-id]: schedule-status-band, schedule-filters, schedule-filters-button,
       schedule-saved-views, schedule-first-run, schedule-views, schedule-digest, schedule-alerts,
       schedule-board, schedule-add-job-button, schedule-job-dialog, schedule-job-submit,
       week-page-title, month-page-title, month-calendar, list-page-title, list-days,
       kanban-page-title, kanban-lanes, matrix-page-title, matrix-grid, gantt-page-title,
       gantt-timeline
   Renames are ALSO forbidden for .gantt-status and .gantt-drawer-* because all seven pages share
   them (they are not Gantt-only), and for .gantt-page, which schedule-phone.css:293 reads through
   a :has() rule that lives outside the gantt block. */
```

### 1l. Files, load order, and the phone contract

```ts
// client/src/main.tsx — ONE new line. Nothing is reordered.
import "./app-shell-hubspot.css";  // HubSpot-style app shell — loads last so it wins
import "./app-shell-daylight.css"; // the shell re-skin (concept: preserve)
import "./schedule-daylight.css";  // this cluster — after the shell so .sched-rx wins the .hs-btn ties
```

One new file, `client/src/schedule-daylight.css`, ~520 lines, every selector prefixed `.sched-rx`,
`.gantt-page` or `.sched-*`; no `:where()` (a documented jsdom breaker); no `!important`; and every
comment checked for a stray `*/` (a documented silent rule-eater in these sheets). `schedule.css`
itself is edited in only **four** places, all of them token or single-value edits: the `.sched-rx`
token block (`:664`), the `.gantt, .gantt-menu` token block (`:5271`), the `dx-dot` focus alpha
(`:812`), and the eight reduce blocks. Everything else is additive and revertable by deleting one
import line.

**Hard rule — the phone tap contract.** `schedule-phone.css` loads *before* the new sheet and
enforces 40px minimums at ≤640px on a named list. The new sheet must never set `height`,
`min-height` or vertical `padding` on any of them:
`.sched-rx .week-stepper button`, `.sched-filters .filter-strip > .select-box select`,
`.sched-views-bar button`, `.sched-views-form input`, `.sched-chips .sched-chip`,
`.sched-filters-clear`, `.sched-rx .schedule-add-job-button.compact`, `.sched-rx .sched-book`,
`.sched-rx .sched-rail-foot-btn`, `.sched-rx .sched-cpm-baseline`,
`.gantt-page.hs-index .sched-cpm-baseline`, `.sched-rx .sched-today-btn`,
`.sched-rx .sched-kan-more`, `.sched-export-menu button`, `.gantt-drawer-actions button`,
`.gantt-page .gantt-drawer-links .hs-btn`, `.schedule-job-create-actions button`,
`.sched-rx .sched-rail-link`, `.sched-rx .schedule-page-footer button`,
`.sched-rx .sched-monthnav .sched-icon-btn`, `.sched-rx .sched-cal-cell .sched-act-more`
(`schedule-phone.css:235-305`). Radius, colour, weight, tracking and shadow on those selectors are
free; box metrics are not.

### 1m. Shared parts — reuse, don't build

No new React component is required in this cluster, and that is deliberate: every surface already
exists as a shared component inside `schedule/`, `boundary.test.ts` #4 forbids a page from
re-deriving any of it, and the 21st.dev porting recipe (one file in `components/ui/`, inline styles
plus one scoped `<style>` block, shadcn tokens mapped onto `--wx-*` with literal fallbacks, the
reduce block inside that same block, a header comment naming the source — the shape of
`stagger-cards.tsx`) buys nothing where the markup must not move.

**Reused as-is (React):** `SchedulePageFrame`, `useSchedulePage`, `ScheduleKpiGrid` + `KpiCard` +
`DxTilt`, `ScheduleFilters` + `ScheduleSelect`, `SavedViewsBar` + `SavedViewsFlyout`,
`ScheduleExportMenu` + `CalendarFeedsDialog`, `ScheduleAlertsPanel`, `ScheduleNotice`,
`ScheduleDialogPanel`, `ScheduleBadge`, `ScheduleJobPickerDialog`, `JobDrawer`, `GanttLinkDialog`,
`ConflictDialog`, `ScheduleCpmSummary`, `ScheduleStatusBand`, `WeeklyDigestPanel`, `FirstRunPanel`,
`ScheduleImportDialog`, `GanttDependencyLinks`, `components/ui/gantt.tsx`,
`components/ui/quantum-cloud-loader.tsx`, `components/ui/text-shimmer.tsx`.

**The shared vocabulary the new sheet defines** — nine classes, one definition each, named per
screen below:

| Class | What it is |
|---|---|
| `.bf-eyebrow` | the §1d rule. The one label role |
| `.bf-figures` / `.bf-figure` | frameless stat row: label (eyebrow) / value (`--bf-app-figure`, tabular) / helper (`--bf-app-meta`) |
| `.bf-panel` | the one licensed paper frame: `#fff`, `1px solid var(--wx-line-soft)`, radius 18px, `--bf-shadow-card`, padding 20px 20px 18px, head margin `0 0 12px` |
| `.bf-well` | a clipping viewport (clause 2): radius 18px, `overflow: hidden`, no second inner fill |
| `.bf-rows` / `.bf-row` | frameless rows inside a panel: `border-bottom: 1px solid var(--wx-line-soft)`, `:last-child` none, hover wash `rgba(28,28,26,0.035)` + move 3 on the trailing control |
| `.bf-card-nav` | an interactive card that navigates: frame + move 1 |
| `.bf-pill` / `.bf-pill-primary` / `.bf-pill-ink` | the three button variants; `.bf-pill` inverts (move 2) |
| `.bf-tail` | 72px of free air at the foot of a page (nothing competes below the last row) |
| `.bf-doc-bleed` | lets a dense board escape a prose measure instead of abandoning the measure |

---

## 2. Screen index — every record entry has a home

44 record entries, 38 distinct screens (six are the same shared surface catalogued in two or three
records). Every one is mapped below; the duplicates are mapped **once** and cross-referenced.

| Record | # | Screen | Mapped in |
|---|---|---|---|
| landing | 0 | Schedule landing page | §4.1 |
| landing | 1 | Shared page frame (`SchedulePageFrame`) | §3.1 |
| landing | 2 | Schedule Status band (compact `.ss-strip`) | §3.2 |
| landing | 3 | CPM readout + Re-baseline | §3.3 |
| landing | 4 | Shared filter row + status panel | §3.4 |
| landing | 5 | Saved views bar + `SavedViewsFlyout` | §3.5 |
| landing | 6 | Export menu + Calendar feeds dialog | §3.6 |
| landing | 7 | Schedule Alerts panel + dialog | §3.7 |
| landing | 8 | Field variance review queue | §4.2 |
| landing | 9 | View cards — "Open a view" | §4.3 |
| landing | 10 | Unassigned Jobs queue panel (landing) | §4.4 |
| landing | 11 | Crew Availability rail panel | §4.5 |
| landing | 12 | Upcoming Milestones rail panel | §4.6 |
| landing | 13 | Weekly digest panel | §4.7 |
| landing | 14 | First-run setup panel + sample-data variant | §4.8 |
| landing | 15 | Week stepper / This week / Back to Schedule | §3.8 |
| landing | 16 | Drop notice + Undo | §3.9 |
| landing | 17 | "Book anyway?" conflict dialog | §3.10 |
| landing | 18 | "Add job to schedule" picker | §3.11 |
| landing | 19 | Job drawer | §3.12 |
| landing | 20 | Link jobs dialog | §3.13 |
| landing | 21 | Schedule import dialog | §4.9 |
| landing | 22 | Shared KPI grid | §3.14 |
| landing | 23 | Schedule page footer + policy dialogs | §4.10 |
| landing | 24 | Bookmarked schedule views (menu + tiles) | §4.11 |
| week-month | 0 | Week page — crew × day board | §5.1 |
| week-month | 1 | Week page — side rail queue | §5.2 |
| week-month | 2 | Month page — calendar | §5.3 |
| week-month | 3 | Add-job picker | §3.11 |
| week-month | 4 | Conflict dialog | §3.10 |
| week-month | 5 | Month day summary dialog | §5.4 |
| week-month | 6 | Job drawer | §3.12 |
| week-month | 7 | Export menu + feeds | §3.6 |
| week-month | 8 | Shared frame chrome | §3.1 |
| list-kanban-matrix | 0 | List page | §6.1 |
| list-kanban-matrix | 1 | Kanban page | §6.2 |
| list-kanban-matrix | 2 | Matrix page | §6.3 |
| gantt | 0 | Gantt Chart page (shell) | §7.1 |
| gantt | 1 | Timeline chart body | §7.2 |
| gantt | 2 | Bar context menu | §7.3 |
| gantt | 3 | Job drawer | §3.12 |
| gantt | 4 | Link dialog | §3.13 |
| gantt | 5 | Export menu + feeds | §3.6 |
| gantt | 6 | Conflict dialog | §3.10 |
| + from completeness checks | — | Printed crew week sheet | §8.1 |
| + from completeness checks | — | The CSV export document | §8.2 |
| + from completeness checks | — | Guided-tour overlay on these pages | §8.3 |

---

## 3. The shared frame and the eleven shared parts

Mapped once; every page entry in §4–§7 inherits them.

### 3.1 Shared schedule page frame (`SchedulePageFrame`)

- **Today:** one frame for all seven routes — aurora background, hero (eyebrow/title/sub/release
  pill), an optional band slot, the control row, the filter row, the saved-views bar, the KPI grid,
  the board section with its notice, the alerts strip, and every dialog/drawer mount point. Root
  class list is always `schedule-page <pageClass> page-stack sched-rx gantt-page`.
- **Becomes:** the same DOM, in daylight. `.sched-rx` keeps its own ground (`--wx-bg #f5f6fa`, the
  same value as the shell's paper), so the page and the chrome finally agree end to end and the
  banding the concept diagnoses disappears without a single geometry change. The hero measure stays
  `44ch` (`--bf-measure-body`) and the sub `54ch`; the title takes `--bf-app-display` **at today's
  clamp** with weight 750 → **600** and tracking `-0.02em`, leading 1.05. The eyebrow pill keeps its
  999px geometry, drops to `--bf-app-eyebrow` with uppercase + `0.045em`, and its dot's focus glow
  re-bases to `--bf-focus-ring`. `.schedule-control-row` gap 12px → `--bf-space-3`; the block gap in
  the page stack becomes `--bf-rhythm-dense` (20–34px, today a flat 22px). The board section becomes
  `.bf-well` (clause 2). `.bf-tail` adds 72px under the last row — free air, since nothing competes
  below it, and `.sched-rx`'s existing `padding-bottom: clamp(56px,9vh,100px)` already covers it at
  ≥800px tall.
- **Every information item placed:** root class list — unchanged, all five classes kept (including
  `gantt-page`, which must stay: `schedule-phone.css:293`'s `:has(.gantt-page.hs-index)` rule and
  the whole `.gantt-drawer-*` block hang off it). `.dx-bg` + three `.dx-aurora` spans → unchanged,
  `aria-hidden`, blur 50px. `.dx-cursor` → unchanged, landing only. Hero `.dx-eyebrow`/`.dx-dot`/
  `h1.dx-title` (+ `titleTutorialId`)/`p.dx-sub` → the type above; the `data-tutorial-id` attribute
  is untouched. Optional band slot → `.ss-strip` (§3.2). `.schedule-control-row` → a flex row of
  pills. `ScheduleFilters` → §3.4, `SavedViewsBar` → §3.5, `ScheduleKpiGrid` → §3.14, always in this
  order. `board=true` wrapper `<section class="schedule-board" aria-label boardLabel
  data-tutorial-id>` → `.bf-well`, `aria-label` and the anchor kept. `alerts=true` strip → §3.7.
- **Every action placed:** every one is React and untouched — the optional `DndContext` (Mouse 4px /
  Touch 250ms+8 / Keyboard `scheduleKeyboardCoordinates`; `pointerWithin` then `rectIntersection`;
  `onDragStart` sets `suppressClick`, `onDragCancel` releases after 150ms), `runChange()`,
  `patchJob`/`useJobSave` (one `rebookSchedule` for an equal-length date move, one `updateJob`
  otherwise, Undo on both), `linkJobs`/`unlinkJobs`, `openJob`/`openBooking`/`closeDrawer`,
  `openPicker`/`newActivity`/`createBooking`, `saveBaseline()`, `openAlert()`. The **only** CSS the
  drag stack cares about is `touch-action`, which `schedule-phone.css:11-17` owns and the new sheet
  must not touch (re-declaring it changes whether a swipe scrolls or lifts a card).
- **States:** empty/loading/error are per-page; the frame's own are `busy` (disables the picker
  submit and Re-baseline) and `pendingId` (`.is-pending` on one card). Failure copy shapes are both
  preserved verbatim — `runChange`'s `Could not <verb> <name>: <message|request failed>` and
  `useJobSave`'s **different** `Could not save <job>: <message|request failed>`.
- **Motion:** aurora + `.dx-cursor` + `[data-reveal]` gated on `motion` (landing only, §1g);
  `sched-pending` on `.is-pending`. Hover moves: none of its own. Skeleton: none — the frame renders
  from an already-fetched payload; `App.tsx` owns the bootstrap gate.
- **Tests touched:** `pages.test.tsx:348` (KPI grid + alerts shared) — passes unchanged
  (`.schedule-kpis .kpi-card` survives additively). `:684/:704/:715/:734` (conflicts, transactional
  writes) — unchanged, no JS touched. `boundary.test.ts` #4 — unchanged; nothing is moved out of the
  hook. `scale.test.tsx:76` ("renders the `<name>` page", all seven at 2,000 jobs) — must be re-run
  as a **perf** check, not a correctness one: the new sheet adds no DOM, and removes six fills per
  Matrix row, so node counts fall or hold.

### 3.2 Schedule Status band — compact strip (`.ss-strip`)

- **Today:** a one-line portfolio headline in the landing's band slot: `+Nd ahead/behind plan`, a
  week-over-week delta chip, and three facts. Root carries `is-ahead`/`is-behind`, `data-reveal`,
  `data-tutorial-id="schedule-status-band"`, `aria-label="Schedule status"`. **Deliberately not
  page-scoped** — Dashboard and Projects mount the same component — and its failed state lives in
  `hs-home.css:2016/2027`, not `schedule.css`.
- **Becomes:** a `.bf-figures` row on the ground — frame killed (clause 1/2/3 all fail: it is not
  interactive, clips nothing, and is the only band in its slot). The big figure takes
  `--bf-app-figure` (28–34px) / 700 / `-0.02em` / `tabular-nums`; `ahead of plan` / `behind plan`
  becomes the eyebrow beside it; the three facts become three `.bf-figure`s at `--bf-app-stat` 14px
  with eyebrow labels. The delta chip stays a 999px pill, `--bf-app-micro` 11px, tone from
  `is-ahead`/`is-behind`. **Scoped `.sched-rx .ss-strip` only** — the unscoped `.ss-band`/`.ss-strip`
  re-skin belongs to the dashboard cluster, and this mapping must not silently restyle two other
  pages. §12 records the seam.
- **Every information item placed:** big figure `+Nd`/`−Nd` → the figure; `ahead of plan` /
  `behind plan` → eyebrow beside it; delta chip `TrendingUp/Down` + `+Nd vs last week` → the pill;
  `Complete <n>%` → `.bf-figure` 1; `Behind <n> of <n>` → `.bf-figure` 2; `Sparkles` +
  `Forecast finish <date>` → `.bf-figure` 3 (the icon keeps its 12px slot); `is-ahead`/`is-behind`
  root class → kept as the palette hook; `data-reveal` → kept, now 12px/0.55s; the tour anchor and
  `aria-label` → untouched. The **full `.ss-band` form** (eyebrow `Schedule Status`, `Forecast from
  reported pace · <asOf>`, the magnitude, the `Improved/Slipped by N day(s)` line and its muted
  first-week variant, the `<dl>` of Portfolio complete / Projects behind / Reporting jobs /
  Portfolio value, and the per-project `<ul>` with name + `--ss-progress` track + percent + `±Nd` +
  `CalendarDays` + forecast finish) is **not used on the landing but lives in the same component**:
  it is mapped by the dashboard cluster, and the only change this cluster makes to it is §1f's flat
  `.ss-project-track i`.
- **Every action placed:** the compact strip has exactly one control, the failed state's `Retry` →
  becomes `.bf-pill` (invert on hover), `attempt` counter untouched. The full band's per-project row
  buttons → `.bf-row` + move 3, owned by the dashboard cluster.
- **States:** *empty* — `No dated projects yet — the status band fills in as work is planned.`
  (`.ss-strip.ss-empty`, `schedule.css:1844`) → the same sentence at `--bf-app-meta`, capped
  `--bf-app-prose`, on the ground with no frame. *Loading* — `Checking where the plan stands…`
  wrapped in the existing `components/ui/text-shimmer.tsx`; **the placeholder must keep rendering**
  because it is the only reason `data-tutorial-id="schedule-status-band"` exists at rest
  (`pages.test.tsx:431`). *Error* — `AlertTriangle` + `Schedule status couldn't load.` + `Retry`,
  `role="status"`; **this state's rules are in `hs-home.css:2016/2027`, so the re-skin touches two
  sheets or the failure keeps the navy look.** No add-on lock. *Not announced:* the normal compact
  strip has no `role="status"` (only the failed and empty forms do) — recorded, unchanged.
- **Motion:** `data-reveal` rise (12px/0.55s). No hover move (nothing is interactive). Skeleton: the
  shimmered loading line above.
- **Tests touched:** `pages.test.tsx:431` (tour anchor) — passes unchanged, provided the loading
  placeholder still renders. `tour.ts`'s `schedule-status` body is copy, untouched.

### 3.3 CPM readout + Re-baseline (`ScheduleCpmSummary`)

- **Today:** a bordered strip (`radius 14px`, `0 6px 18px rgba(28,28,26,0.05)`, `schedule.css:2921`)
  in the landing's control row and above the Gantt's chart: an icon tile plus up to four stats and
  the Re-baseline button.
- **Becomes:** a `.bf-figures` row — frame killed (same three clauses fail). Stat labels → the
  eyebrow (from today's 10.5/700/0.05em, `schedule.css:2947`); values → `--bf-app-stat` 14px / 700 /
  tabular; the `<small>of <total tasks></small>` → `--bf-app-meta`; the `GanttChartSquare` tile 30px
  radius 9px → **12px** (ladder) keeping its `--sc-concrete` 13% fill; `is-late`/`is-early`/`is-on`
  tone classes unchanged; `Re-baseline` → `.bf-pill` (invert). On the Gantt it sits between the
  notice and the chart exactly as now.
- **Every information item placed:** icon tile → kept; `Project finish` → figure 1 (`—` when null);
  `Critical path <count>` + `of <total tasks>` → figure 2 + its small; `vs baseline`
  (`—` / `On plan` / `+Nd` / `-Nd`) → figure 3 with its tone class; `Negative float <count>` →
  figure 4, rendered only when > 0, always `is-late`. The measurement rule (working days against
  `max(job.baselineEnd)`; built from **unfiltered** `data.jobs`) is logic — untouched.
- **Every action placed:** `Re-baseline` → `setScheduleBaseline()` + reload, label `Saving…` while
  `page.busy`, disabled meanwhile; success notice `Baseline saved — slip is now measured against
  today's plan.` All unchanged. Note preserved as-is: `saveBaseline` is exposed by the hook on all
  seven pages but surfaced only here and on the Gantt — no new control is wired.
- **States:** *not rendered at all* when `buildScheduleCpm` returns null (no jobs with **both**
  dates). *Loading* — `Saving…`. *Error* — `.sched-cpm.sched-cpm-error` `role="alert"` +
  `AlertTriangle` + `Circular dependency — the network can't be scheduled.` + the cycle chain joined
  ` → `: becomes a full-width red-hairline band (`1px solid var(--wx-red)` at 24% + a 6% fill,
  radius 18px — this one **keeps a frame**, because an alert that replaces four figures must read as
  a different object). Its 13px/700 title stays; the `<em>` chain → `--bf-app-meta`, capped
  `--bf-app-prose`, `overflow-wrap: anywhere`. **The cycle state also removes the Re-baseline
  button** (the component returns before it) — faithfully preserved, and flagged in §14. Also
  failure notice `Could not save the baseline: …`.
- **Motion:** none of its own; on the landing it rides the control row's `data-reveal`. Hover: move
  2 on the button only.
- **Tests touched:** `cpm.test.ts:11/15/28/35/41` — all five are pure-logic, unaffected. **Live
  double-match to fix while here:** the landing's root carries `gantt-page`, so
  `.gantt-page .sched-cpm*` (`schedule.css:5332-5410`) **and** `.sched-rx .sched-cpm*`
  (`:2899-2999`) both match; whichever is later in the file wins. The new sheet writes each CPM rule
  **once**, at `.sched-rx .sched-cpm` **and** `.gantt-page .sched-cpm`, with identical values, so the
  order stops mattering.

### 3.4 Shared schedule filter row + status filter panel

- **Today:** four native selects in `.select-box.schedule-select`, a `Statuses` disclosure button
  with a `kept/10` counter, a chip per active filter, `Clear filters`, and an inline panel of ten
  status toggles. `data-tutorial-id="schedule-filters"` / `"schedule-filters-button"`.
- **Becomes:** one unframed control row on the ground (it has no frame today either — correct
  already). Selects: 999px pill, `1px solid var(--wx-line)`, `#fff`, `--bf-app-row` 13px/500,
  chevron `var(--wx-faint)`, `:focus-within { border-color: var(--wx-blue); box-shadow:
  var(--bf-focus-ring) }`; **`min-height` untouched** (phone contract). `Statuses` → `.bf-pill` with
  `SlidersHorizontal`; its `<em>kept/10</em>` → `--bf-app-micro` 11px tabular; `.active` state →
  `rgba(47,107,255,0.08)` fill + `#2f6bff` ink + weight 650. Chips: today `#e8f0fe` fill with a
  `rgba(47,107,255,0.35)` border and `#1a3f9e` ink (`schedule.css:1546`) → `rgba(47,107,255,0.10)`
  fill, no border, `#2f6bff` ink, 999px, `--bf-app-micro`; the `X` gets `scale(0.94)` on press.
  `Clear filters` → a directional text link with move 3. The panel keeps `dx-fade-up`, gains
  radius 18px, `--bf-shadow-card`, `1px solid var(--wx-line-soft)`.
- **Every information item placed:** the four `.select-box.schedule-select` controls with their
  `aria-label`s (`Project`, `Crew Type`, `Crew`, `Region`) and default options (`All projects`,
  `All Crew Types`, `All crews`, `All regions`) → the pills, labels and option text unchanged;
  `Statuses` button + `<em>kept/10</em>` + `aria-expanded`/`aria-controls="schedule-status-filters"`
  + the tutorial anchor → the pill; `Clear filters` (rendered only when a chip is active) → the
  link; the chip row `.sched-chips aria-label="Active filters"` with project / crew type / crew /
  region / status chips, the status label rule (`≤2` joined ` · `, else `N of 10 statuses`) and each
  chip's `title="Clear <label>"` → the chips; the optional `.sched-filters-note` (Kanban only) →
  `--bf-app-meta`, capped `--bf-app-prose`; the panel's `<h2>Statuses</h2>`, its helper `Choose which
  job and booking statuses stay visible — on every schedule page.`, the `All statuses` button and the
  `role="group" aria-label="Visible statuses"` chip grid over all ten statuses → panel head =
  eyebrow + helper at `--bf-app-meta` capped `--bf-app-prose`, `All statuses` = `.bf-pill` (disabled
  when no status filter is set), the ten toggles keep `ScheduleBadge` and `aria-pressed`. The ten
  statuses (`Not Started, Ready, Ready to Start, Planned, Confirmed, In Progress, On Site,
  DelayIQed, At Risk, Complete`) and the `Ready to Start → Ready` relabel are unchanged — including
  the resulting **two chips both reading "Ready"**, which is preserved as-is and raised in §13.
- **Every action placed:** each select's option list and its `{patch}` write (crew type also clears
  the crew) — unchanged; `Statuses` toggles the panel; each status toggle adds/removes, with the
  **last-remaining-status guard** (a silent no-op) preserved exactly; `All statuses` → `{statuses:
  null}`; a chip click writes its own clear patch; `Clear filters` → `CLEAR_SCHEDULE_FILTERS`. The
  stale-filter self-repair effect is untouched. Two recorded keyboard gaps are preserved, not
  papered over: the panel gets no focus move when it opens, and the last-status click gives no
  feedback (§13).
- **States:** no chip row and no `Clear filters` when nothing is filtered; no loading; no error; no
  add-on lock.
- **Motion:** `dx-fade-up 0.4s` on the panel — kept by name, re-timed to `var(--bf-ease)`. Hover:
  move 2 on `Statuses`/`All statuses`, move 3 on `Clear filters`, wash on a chip. No reveal (it is a
  control row, not a section).
- **Tests touched:** `filters.test.ts:32/40/48/58/73` — pure logic, unaffected.
  `statuses.test.ts:13/24` — unaffected. `tests/schedule.test.tsx:93` clicks `/^Statuses/`, finds
  region `Job statuses`, toggles `DelayIQed`'s `aria-pressed`, then `Clear filters` — all four names
  and both roles are preserved, **passes unchanged**. `pages.test.tsx:571` needs the `Active filters`
  chips to read `Pinecrest Medical` and `Framing` on all seven pages — unchanged.

### 3.5 Saved views bar (`.sched-views-bar`) + `SavedViewsFlyout`

- **Today:** a `Pin` + `Views` label, one chip per saved view (a button inside a span, with an `X`
  sibling), the matching chip lit `.is-active`, and `+ Save view` opening an inline name form. The
  flyout form renders inside the rail's Schedule menu and **is styled in `schedule.css:1844-1945`,
  not in the shell sheet.**
- **Becomes:** `Views` → the eyebrow with the `Pin` at 12px. Chips → 999px pills, `--bf-app-row`
  13px/500, `1px solid var(--wx-line)`, invert on hover (move 2); `.is-active` →
  `rgba(47,107,255,0.10)` + `#2f6bff` + 650, **and the `.is-active` class stays on the chip's
  parent** (`pages.test.tsx:448` asserts `chip.parentElement`), so the span wrapper is not
  flattened. `+ Save view` → `.bf-pill`. The name form: input 999px, `--bf-app-row`, focus ring
  `--bf-focus-ring`. The flyout rows → `.bf-row` + move 3, head → eyebrow, `<em>` description →
  `--bf-app-meta` with its 160px ellipsis clamp kept.
- **Every information item placed:** `Pin` + `Views` → eyebrow; per-view name button with
  `title="<describeSavedView> · opens <page>"` → the chip (title kept verbatim, including its
  raw-lowercase page id, §13); `X` with `aria-label="Remove saved view <name>"` → the trailing
  control; `.is-active` → the parent span; `describeSavedView`'s ` · `-joined vocabulary and its
  `All work` fallback → unchanged; `aria-label="Saved views"` +
  `data-tutorial-id="schedule-saved-views"` → unchanged; flyout head `Saved views`, each
  `.hs-flyout-item.hs-flyout-view role="menuitem"` with its `Pin`, name and `<em>` → as above;
  renders nothing when the list is empty → unchanged. The limits (12 kept, last-twelve wins, name
  trimmed to 40, same-name replace) are logic — untouched.
- **Every action placed:** chip click → `onChange({...CLEAR_SCHEDULE_FILTERS, ...view.filters})` and
  `onOpenPage(view.page)` when it belongs elsewhere; `X` → `remove(id)` + persist + reload;
  `+ Save view` with both `title` variants and its disabled state; the form's autofocused input
  (`aria-label="View name"`, placeholder `Name this view`, `maxLength 40`), `Save` (disabled on
  empty) and `Cancel`; flyout item → `openSavedView`. All unchanged.
- **States:** *empty* — `Pin a filter set and your morning view is one click.` at `--bf-app-meta`,
  capped `--bf-app-prose`, shown only while not naming. *Loading* — none. *Error* — silent by design
  (the `setUserSetting` catch keeps the pin locally); unchanged. No add-on lock.
- **Motion:** hover/focus transitions only, re-timed to `--bf-dur-hover var(--bf-ease)`. No reveal.
- **Tests touched:** `pages.test.tsx:448` (setting key, persisted shape, `.is-active` on the parent,
  `Remove saved view Pinecrest crews`), `:473` (disabled with no filters), `:478` (open from the
  flyout) — all pass unchanged. `savedViews.test.ts:29/38/51/62` — logic, unaffected. **The trap the
  landing record flags:** the flyout's rules live in `schedule.css`, so if the shell cluster
  re-skins `.hs-flyout` and this cluster does not re-skin `.hs-flyout-views`, the Schedule hub's
  flyout gets a navy-era block inside a white card. Owned here, in the new sheet, as
  `.sched-rx-flyout` — **no**: owned here as `.hs-flyout .hs-flyout-views` (unprefixed, because the
  flyout is portalled outside `.sched-rx`), which is the one selector in the new sheet without a
  cluster prefix, and it is called out in §12.

### 3.6 Export menu (`.sched-export`) + Calendar feeds dialog

- **Today:** the same four-item `role="menu"` on all seven pages, opened from a `Download` +
  `Export` + chevron trigger whose class the caller supplies (`outline-button` on the landing/List,
  `export-button` in the Week/Month/Kanban/Matrix/Gantt board footers or head). Plus the feeds
  dialog.
- **Becomes:** the trigger becomes one pill in two skins — `.bf-pill` where the caller passes
  `outline-button` and `.bf-pill` again where it passes `export-button`, i.e. **the two triggers
  stop looking different** (today one is an outline button and the other a pill that inverts). Both
  `buttonClassName` strings stay in the JSX; the new sheet gives them one look. The menu panel:
  radius 18px, `#fff`, `1px solid var(--wx-line-soft)`, `--bf-shadow-float`, padding 10px, `hs-pop`
  kept by name at `0.22s var(--bf-ease)`. Rows → `.bf-row` at `--bf-app-row-strong` with the `<em>`
  hint at `--bf-app-meta` and move 3 on hover. The feeds dialog → `.bf-panel` at radius 20px on the
  `.schedule-dialog` shell, its `<code>` URLs in `ui-monospace` at `--bf-app-meta` on a
  `rgba(28,28,26,0.05)` chip (radius 8px), per-row `Copy link` → `.bf-pill`.
- **Every information item placed:** trigger (`Download` icon, `Export`, `ChevronDown`,
  `aria-haspopup="menu"`, `aria-expanded`) → the pill; the four items with their exact labels and
  `<em>` hints — `Download CSV` / *The same columns on every page*, `Copy link to this view` /
  *This page, this week, these filters*, `Print week sheets` / *One page per crew — save as PDF*
  (rendered **only** when the page passes `weekDays`, disabled with no crews), `Calendar feeds…` /
  *Subscribe a phone to a crew* → four `.bf-row`s; `role="menu" aria-label="Export"` → unchanged;
  the dialog's `h2 Calendar feeds`, its blurb, one row per crew (name + `<code>` URL + `Copy link`),
  and the footer helper `iPhone: Settings › Calendar › Accounts › Add Subscribed Calendar. Google
  Calendar: Other calendars › From URL. Anyone with a link can read that crew's bookings.` → all
  kept verbatim, helper capped `--bf-app-prose`; `aria-labelledby="sched-feeds-title"` and the close
  `aria-label="Close calendar feeds"` → unchanged. The **15 CSV columns** are §8.2; the **printed
  sheet** is §8.1. Per-page filenames/scopes/`includeUnbooked` are logic — untouched.
- **Every action placed:** `Download CSV` → `scheduleExportRows` + `toCsv` + `downloadCsv`, notice
  `Exported N rows to <file>.csv` (singular form preserved); `Copy link to this view` → clipboard +
  its two notices; `Print week sheets` → `printHtml(weekSheetHtml(...))` + notice; `Calendar feeds…`
  → closes the menu, opens the dialog; per-crew `Copy link` + its two notices; menu closes on
  outside mousedown and Escape; dialog closes on backdrop click and its `X`. All unchanged —
  including the recorded gaps preserved as-is: **no arrow-key navigation, no focus trap, no focus
  return** in the menu, and **no Escape** on the feeds dialog (§13).
- **States:** *empty* — `Add a crew first.`; *loading* — `Loading…` (`.helper-text`, wrapped in
  `text-shimmer`); *error* — `<p class="form-error">` with the server message or `Could not load the
  feed links`, at `--bf-app-meta` in `var(--wx-red)`. No add-on lock.
- **Motion:** `hs-pop` (name kept). Hover: move 3 on rows, move 2 on the trigger and `Copy link`.
- **Tests touched:** `pages.test.tsx:802` (same menu on all seven), `:813` (same columns/rows),
  `:640` (clipboard + the exact hash), `export.test.ts:32/55/62`, `tests/schedule.test.tsx:93`
  (role=menu named `Export` contains `/Download CSV/`) — all pass unchanged.
  `boundary.test.ts` no longer asserts the export menu's presence (§0.1); it is preserved by hand on
  all seven pages and §12 adds it back as a grep guard.

### 3.7 Schedule Alerts panel (rail form + under-board strip) + "Scheduling Alerts" dialog

- **Today:** four derived alerts for whatever the filters show. The landing puts the panel first in
  its side rail (`alerts={false}` on the frame); the other six append it full width under the board.
- **Becomes:** rail form → `.bf-panel`; under-board form → `.bf-panel` at full width with the rows
  in a `repeat(auto-fit, minmax(300px, 1fr))` grid (today `.sched-alerts-under .cc-list` at
  `schedule.css:2855` already does this). Head `h2` → `--bf-app-section` 15px/600; `View all` →
  a directional link with move 3. Rows → `.bf-row`: icon tile 28px radius 12px in the tone's 12%
  fill, `<strong>` at `--bf-app-row-strong`/650, detail at `--bf-app-meta` `var(--wx-faint)`, the
  age right-aligned at `--bf-app-micro` tabular. Tone classes `danger`/`warning`/`info` keep their
  palette.
- **Every information item placed:** head `h2 Schedule Alerts` + optional `View all` → as above;
  alert 1 `AlertTriangle` / `Double-booked crew` / `<Crew> conflicts on <Mon D>.` / `10m ago`;
  alert 2 `AlertTriangle` / the DelayIQ's own title / `<Project> · <impactDays> day impact` /
  `22m ago`; alert 3 `CloudSun` / `Weather delayIQ expected` / `<Project|All sites> · <weather
  title>` / `45m ago`; alert 4 `Truck` / `Missing materials` / `<job name> · <phase> not confirmed` /
  `2h ago` → four `.bf-row`s, every string and icon unchanged; footer `View all alerts` → `.bf-pill`
  full width (`.sched-rail-foot-btn`, box metrics untouched per the phone contract);
  `aria-label="Schedule alerts"` + `data-tutorial-id="schedule-alerts"` + `.sched-alerts-under` →
  unchanged; the dialog form (title `Scheduling Alerts`, description `Current alerts for what the
  filters show.`, one `<li>` per alert as `<title>: <detail>`) → `ScheduleDialogPanel`, mapped in
  §4.10's shell. `info` tone is defined but never produced — kept, unused.
- **Every action placed:** row click → `openAlert` (sets the shared week when the alert names one,
  then opens the owning page unless already there); `View all` / `View all alerts` → the dialog;
  dialog `X` → `Close Scheduling Alerts`. Unchanged. The panel's `onViewAll` is passed **only** by
  the landing, so both controls stay dormant on the other six — preserved exactly (no new control).
- **States:** *empty* — `No schedule alerts for what is in view.`; dialog-empty — `No scheduling
  alerts right now.` + `Add projects, jobs, crews and bookings to surface schedule alerts.`, both at
  `--bf-app-meta` capped `--bf-app-prose`. **This is where a real invisible defect gets fixed:** that
  sentence carries class `.cc-empty-line`, which has **no rule reachable from `.sched-rx`** (it
  exists only as `.dash-rx .cc-empty-line` and `.proj-rx .cc-empty-line`), so today it renders as a
  default `<p>`; likewise the rail's `.cc-list` is a bare block div with no grid or gap. The new
  sheet declares `.sched-rx .cc-empty-line` and `.sched-rx .cc-list`. **Declared visible change** —
  a pixel-diff will flag it, and it is an improvement, not a regression. No loading, no error state,
  no add-on lock.
- **Motion:** hover wash + move 3 on rows (today a background/translate transition). No reveal —
  on the landing it sits inside the rail, which is inside `.schedule-layout`'s reveal block.
- **Tests touched:** `alerts.test.ts:19/32` — logic, unaffected. `tests/schedule.test.tsx:128`
  (opens the alerts dialog from the landing) and `pages.test.tsx:348` (shared with the other six) —
  pass unchanged.

### 3.8 Week stepper / This week / Back to Schedule

- **Today:** `.week-stepper` (`aria-label="Selected week <range>"`) with a previous button
  (`ChevronDown` rotated by `.previous-week`), a `<strong>` range, and a next button; plus
  `This week` (`Crosshair`, `.outline-button`, title `Back to the current week`) and `Schedule`
  (`CalendarDays`, `.outline-button`, title `Back to the Schedule overview`). Used on Week, List,
  Matrix and (Week range only) the Gantt; the landing carries none of them.
- **Becomes:** the stepper becomes one 999px pill group — `1px solid var(--wx-line)`, `#fff`, the
  range at `--bf-app-row-strong`/600 with `tabular-nums` and a `min-width` so stepping does not
  reflow the row; the two icon buttons keep their 40×40 phone size and their rotation rules
  untouched (`ChevronDown` + `.previous-week`/`.next-week` rotate ±90°; swapping in
  `ChevronLeft/Right` would need `schedule.css:5431-5436` deleted — **not done**). `This week` and
  `Schedule` → `.bf-pill` (invert), `Crosshair`/`CalendarDays` at 15px.
- **Every information item placed:** `aria-label="Selected week <range>"` → unchanged (asserted on
  four pages); `<strong>` range → the pill's centre; `Previous week` / `Next week` `aria-label`s →
  unchanged; `This week` label, icon, title and disabled state → the pill; `Schedule` label, icon
  and title → the pill.
- **Every action placed:** ±7 days on the shared `weekStart` (and the recorded coupling that a week
  step also rewrites `monthAnchor`) → untouched; `This week` → `mondayOf(new Date())`, disabled when
  already there; `Schedule` → `onOpenSchedule()`. Also preserved: `syncScheduleHash` uses
  `replaceState`, so Back does not undo a week step.
- **States:** `This week` disabled on the current week. No empty/loading/error/lock.
- **Motion:** hover/focus background swap → wash + `--bf-focus-ring` on `:focus-visible`; move 2 on
  the two pills. No reveal.
- **Tests touched:** `tests/schedule.test.tsx:93` (`Selected week Jun 15 - Jun 21, 2026`,
  `This week` disabled→enabled, `Next week`, and the title `Back to the Schedule overview` landing
  on `The whole plan, at a glance.`) and `pages.test.tsx:571` (the `aria-label` on
  Week/List/Matrix/Gantt) — both pass unchanged.

### 3.9 Drop notice + Undo (`ScheduleNotice` / `useScheduleNotice`)

- **Today:** `<p class="gantt-status" role="status" aria-live="polite">` with the message, `.is-error`
  for a failure, and an `Undo` pill when the change carries a way back. 4s dwell, 8s for an error or
  an Undo. **`.gantt-status` is the shared notice class on all seven pages**, and
  `pages.test.tsx`'s `notice()` helper is `document.querySelector('.gantt-status')`.
- **Becomes:** the message at `--bf-app-row` 13px/600 `var(--wx-mut)` (`.is-error` →
  `var(--wx-red)`), on the ground with no frame — it is a line, not a box, and
  `.gantt-status-live:empty { height: 0 }` keeps its slot collapsed. `Undo` → `.bf-pill` at
  `--bf-app-micro`. The four per-page placement rules
  (`.week-page/.kanban-page/.matrix-page/.month-page .schedule-board .gantt-status { margin: 12px
  18px 0 }`) are **completed with the missing `.list-page` rule** — today the List's notice falls
  back to the generic margin, which is the second symptom of the absent `.list-page` block (§13).
- **Every information item placed:** the message (all sixteen shapes the records enumerate:
  `Baseline saved — …`, `<job> scheduled for <crew> on <Mon D>`, `<job> created but not booked —
  find it in the Week board's queue.`, `<name> stays where it was.`, `<job> stays on <Mon D>.`,
  `<job> as it was`, `<job> saved`, `<job> moved to <crew> on <date>`, `<job> booked with <crew> on
  <date>`, `<job> back with <crew> on <date>`, `<job> unbooked again`, `<job> is already booked with
  <crew> on <date>.`, `<job> moved to <date>`, `<job> back on <date>`, `<job> moved to <lane>`,
  `<job> back to <status>`, `<pred> → <succ> linked (FS, 2d lag)`, `<a> and <b> unlinked`, the two
  re-link/re-unlink undo forms, `Digest emailed to N planners.`, `<crew> is ready to book.`,
  `Sample data loaded — …`, `Sample data removed. …`, `Exported N rows to <file>.csv`, `Link copied
  — …`, `Printing N crew sheets — …`, `Copied the calendar link for <crew>`) → the same one line;
  no copy changes; `role="status" aria-live="polite"` → unchanged; `.is-error` → the red variant.
- **Every action placed:** `Undo` → the inverse write with `force: true`, label `Undoing…` while
  running, disabled meanwhile, failure `Could not move back <name>: …` (and `useJobSave`'s different
  `Could not save <job>: …`). Unchanged. **The auto-dismiss is preserved exactly** (4s/8s): it is
  not turned into a persistent bar or a toast stack, because the Undo disappears with it and that is
  behaviour.
- **States:** renders `null` with no notice; `Undoing…`; `.is-error` at 8s.
- **Motion:** `hsg-rise 0.36s` on `.gantt-page .gantt-status` — kept by name, re-timed to
  `var(--bf-ease)`, shift 10px → 8px. The card it refers to pulses with `sched-pending`.
- **Tests touched:** `pages.test.tsx:184/263/715/734` — all read `.gantt-status`, which survives;
  pass unchanged.

### 3.10 "Book anyway?" conflict dialog (`ConflictDialog` / `useConflictAsk`)

- **Today:** `role="alertdialog"`, `.schedule-dialog.sched-ask`, `aria-labelledby="sched-ask-title"`.
  Raised by any write the server answers 409.
- **Becomes:** the `.schedule-dialog` shell at radius 20px, `#fff`, `1px solid var(--wx-line-soft)`,
  `--bf-shadow-stage`, backdrop `rgba(28,28,26,0.42)` (today `rgba(20,32,58,0.42)` — the navy flip),
  width `min(440px, 100vw - 32px)`. `h2` at `--bf-app-section` 15px/650 — deliberately **not**
  display type: it is a question, not a page. Body at `--bf-app-row`/1.45 capped `--bf-app-prose`.
  `Book anyway` → `.bf-pill-primary` (`#2f6bff`, `#fff`, `0 4px 12px rgba(47,107,255,0.2)`);
  `Cancel` → `.bf-pill` (invert).
- **Every information item placed:** `h2 Book anyway?`; `clashSentence` verbatim — `<Crew> is on
  <Job> that day` + ` (and N more)` + the no-detail fallback `That crew is already booked that day`
  — followed by ` — book <moving job> on <Mon D> anyway?`; **the multi-clash `<ul>`** (rendered when
  `clashes.length > 1`, one `<li>` per clash reading `<crew> · <Mon D> · already on <job>`) → a
  `.bf-rows` list at `--bf-app-meta`, hairline-separated. That list is the item the gantt record
  flags as most likely to be silently dropped; it is placed here explicitly. `X` with
  `aria-label="Keep the schedule as it is"` → a 30px icon button, radius 12px, press `scale(0.94)`.
- **Every action placed:** `Cancel` / `X` / backdrop click / Escape → answer `false` (and the
  caller's notice, `<name> stays where it was.` or `<job> stays on <date>.`); `Book anyway`
  (`autoFocus`) → answer `true`, the write retried with `force: true`. Unchanged.
- **States:** none of its own; it resolves immediately and the pending pulse stays on the card
  underneath. A non-409 error is rethrown and becomes the page's error notice.
- **Motion:** the shared dialog shell; no dedicated keyframe today and none added.
- **Tests touched:** `pages.test.tsx:655/684/704` and `conflicts.test.ts` — pass unchanged (role,
  accessible name, both buttons and the `force:false → force:true` sequence are all preserved).

### 3.11 "Add job to schedule" picker (`ScheduleJobPickerDialog`)

- **Today:** the one job form — 14 inputs, a `Custom job` section, and a submit that creates the job
  then books it. `data-tutorial-id="schedule-job-dialog"`, submit
  `data-tutorial-id="schedule-job-submit"`.
- **Becomes:** the same `.schedule-dialog` shell at radius 20px (§3.10 values), header `h2` at
  `--bf-app-section` with the `<crew> · <date>` line at `--bf-app-meta`, section `h3 Custom job` →
  the eyebrow. Fields: label = eyebrow above the control; inputs/selects/textarea at
  `--bf-app-row-strong` 13.5px/500, radius 12px, `1px solid var(--wx-line)`, `:focus`
  `border-color: var(--wx-blue)` + `--bf-focus-ring`; the form grid stays two-up and collapses to
  one column at ≤720px as now. `Create & Schedule Job` → `.bf-pill-primary`, `Cancel` → `.bf-pill`,
  both keeping their 40px phone minimum (`.schedule-job-create-actions button`).
- **Every information item placed:** `role="dialog" aria-modal aria-label="Add job to schedule"` +
  the tutorial anchor → unchanged; `h2 Add job to schedule`; the `<selected crew> · <date>` sub;
  `X` `aria-label="Close Add job to schedule"`; `h3 Custom job`; and all **14 inputs** with their
  labels, placeholders and defaults: `Job Name` (*Job name*), `Project` (every project), `Crew`
  (every crew in the workspace — **not** the filtered set, preserved as-is), `Phase` (*Phase or
  scope*), `Location` (prefilled from the project), `Start Date`, `End Date` (both defaulting to the
  day the picker opened), `Start Time` (*7:00 AM*), `End Time` (*3:00 PM*), `Labor`
  (`min 1`, default `clamp(crew.size,1,6)`), `Equipment` (*General tools*), `Materials`
  (Delivered / Ordered / Missing / Waiting on Delivery), `Status` (the ten, default Planned),
  `Priority` (Normal / Medium / High), `Notes` (`rows 3`, *Notes*). Nothing is reordered, relabelled
  or merged.
- **Every action placed:** submit → `createJob` then `assignJob` through `withConflictAsk`, with both
  notices; `Cancel` and `X` close; changing `Project` re-fills `Location`; changing `Crew` re-labels
  the header. Preserved gaps: **no backdrop click** and **no Escape** on this dialog (and, because
  `JobDrawer`'s window handler stands down whenever a `.schedule-dialog-backdrop` exists, Escape
  does nothing at all while it is open) — §13.
- **States:** *loading* — submit reads `Scheduling...` and disables. *Error* —
  `<p class="form-error" role="alert">` with `Choose a project before scheduling the job.` /
  `Add the job name, phase, location, and equipment.` / `Labor must be a whole number above 0.` at
  `--bf-app-meta` in `var(--wx-red)` with a 6% red fill and radius 12px. *Empty* — with no projects
  the Project select is empty and submitting shows the first message. Can raise §3.10 on top of
  itself. No add-on lock.
- **Motion:** the shared shell. No new keyframe.
- **Tests touched:** `tests/schedule.test.tsx:199` (opens from an empty cell and a busy one; asserts
  the header line, the `Custom job` heading, four field values, Close and Cancel) and `:227` (the
  full POST payload) — pass unchanged. `App.tsx` tutorial steps `open-job-form` /
  `submit-job` depend on `schedule-add-job-button` and `schedule-job-dialog` — both anchors kept.

### 3.12 Job drawer (`JobDrawer`) — shared by all seven pages

- **Today:** a right-hand slide-in: facts, the dependency list, and a status/priority/dates/notes
  form saved through the one job-save path. Styled by the `.gantt-drawer-*` block
  (`schedule.css:4962+`), which is scoped `.gantt-page` — and every schedule root carries
  `gantt-page`, which is why the drawer looks the same everywhere.
- **Becomes:** panel `width: min(440px, 100%)` unchanged, radius 20px on the left edge, `#fff`,
  `--bf-shadow-float` re-inked from `-24px 0 60px rgba(20,32,58,0.22)`; backdrop
  `rgba(28,28,26,0.42)` + its 2px blur kept. Title `h2` at `--bf-app-section` 15px/650 (it is the
  dialog's accessible name — not restyled into display type, so the announced string is untouched);
  sub at `--bf-app-meta`. Facts `<dl>` → a `.bf-figures` row of four: eyebrow label over an
  `--bf-app-row-strong` value. `Links` `h3` → the eyebrow; link rows → `.bf-rows`. Form fields as
  §3.11. Actions row: `Save changes` → `.bf-pill-primary`, `Cancel` → `.bf-pill`, `Open in Schedule`
  → a directional link with move 3, `margin-left: auto` kept.
- **Every information item placed:** `.gantt-drawer-layer` + backdrop → unchanged; `aside
  role="dialog" aria-modal aria-labelledby="gantt-drawer-title"` → unchanged; title = job name; sub
  = `<project><, phase><, location>` with each part dropped when empty and `Unfiled` as the project
  fallback; the four facts — `Crews` (comma-joined names or `Unassigned`, **with its `title`
  attribute carrying the full list**, its only affordance when truncated), `Progress` `<n>%
  complete`, `Materials`, `Duration` `N day(s)` recomputed live from the form's dates; the links
  section `<section class="gantt-drawer-links" aria-label="Dependencies">` with its visible
  `h3 Links` and each row reading `Follows|Leads to <other job>` + `(<type><, Nd lag>)`; the five
  form controls (`Status` over the ten `STATUSES`, `Priority` over `High/Medium/Normal`, `Start`
  required, `Finish` required with `min=start`, `Notes` placeholder `Anything the crew should
  know`); the close button's `aria-label="Close job details"`. All present, none reworded.
- **Every action placed:** `Link to another job…` → §3.13; per-link `Unlink` (visible text `Unlink`,
  `aria-label="Unlink <other>"` — the record's correction, preserved) → `deleteDependency` + Undo;
  `Save changes` → `onSave({status, priority, startDate, endDate, notes})` → `patchJob` (one re-book
  for an equal-length date move, else one `updateJob`), closing on success, notice `<job> saved` (and
  the no-change case: same notice, drawer closes, **no request**); `Cancel`; `Open in Schedule`
  (which on the landing simply closes, since no `onOpenSchedule` is passed); backdrop click;
  **Escape — only when no `.schedule-dialog-backdrop` / `[role=alertdialog]` is layered above**; the
  `Status` select autofocused with `preventScroll`. All unchanged. **Hard rule for the re-skin:** the
  Escape guard is a DOM probe for those two selectors, so the new sheet must not change dialog
  markup, class names or move any dialog into a portal with different classes — Escape and the 1–6
  shortcuts both depend on it.
- **States:** *empty* — links `No links yet. A link makes the other job wait for this one.`
  (`--bf-app-meta`, capped `--bf-app-prose`); `Crews` reads `Unassigned`. *Loading* — `Saving…`.
  *Error* — `<p class="gantt-drawer-error" role="alert">` `Both dates are required.` / `The finish
  cannot be before the start.`; write failures land in the page notice. No add-on lock.
- **Motion:** `hsg-fade 0.2s` (backdrop) and `hsg-slide-in 0.32s` (panel) — both kept **by name**,
  re-timed to `var(--bf-ease)`, translate 40px → 24px; both already nulled in the
  `schedule.css:5188` reduce block. At ≤720px `.gantt-drawer-row` and `.gantt-drawer-facts` collapse
  to one column — unchanged.
- **Tests touched:** `tests/schedule.test.tsx:147/167`, `pages.test.tsx:855/886` and the
  `Conflicts ask before saving` trio — all pass unchanged. The drawer's accessible name is the job
  name (`aria-labelledby`), which several tests select on; the `h2` is restyled, never rewritten.

### 3.13 Link jobs dialog (`GanttLinkDialog`)

- **Today:** a `<form role="dialog">` (so Enter submits): `h2 Link <from job> to another job`, a
  blurb, three inputs, and the actions.
- **Becomes:** the §3.10 dialog shell; `h2` at `--bf-app-section`; blurb at `--bf-app-row`/1.45
  capped `--bf-app-prose`; the three controls as §3.11; `Link jobs` → `.bf-pill-primary`, `Cancel` →
  `.bf-pill`.
- **Every information item placed:** `role="dialog" aria-modal aria-labelledby="sched-link-title"` +
  `.schedule-dialog.sched-link` → unchanged; the `h2`; the blurb `The other job waits for this one.
  The arrow shows on the chart, and the critical path follows it.`; the candidate option text
  `<name> · <startDate>` (raw ISO) and the exclusion rule (not itself, not what it already leads
  to); the three link-type labels plus the fourth — `Finish → start (the usual)` FS, `Start → start`
  SS, `Finish → finish` FF, `Start → finish` SF; `Lag (working days)` `min -365 max 365` default 0.
  Also recorded and unchanged: on the **Gantt** the candidate list is the *filtered* `visibleJobs` in
  scope order, while every other page passes `linkableJobs` (all dated jobs, earliest first).
- **Every action placed:** `Link jobs` → `createDependency` + the Undo notice; `Cancel`; `X`
  (`aria-label="Close"`); backdrop click; Escape (**form-scoped** `onKeyDown`, which is what makes
  "Escape closes the link dialog only — the drawer under it stays" true); Enter submits. Unchanged.
- **States:** *empty* — `<p class="form-error">Every job on the chart already follows this one.</p>`
  with the select disabled; submit disabled while no successor is chosen; a refused (loop-making)
  link surfaces as the page notice `Could not link the jobs: …`.
- **Motion:** the shared shell.
- **Tests touched:** `pages.test.tsx:355`, `:855`, `ganttLinks.test.ts` — pass unchanged.

### 3.14 Shared KPI grid (`ScheduleKpiGrid`)

- **Today:** four cards on every schedule page — `min-height 132px`, `padding 22px`, radius 20px,
  `1px solid var(--wx-line-soft)`, `0 18px 44px rgba(28,28,26,0.07)` (an **off-ladder** shadow), a
  52px icon tile at radius 14px, a 12.5px/600 sentence-case label, a 34px/750 value and a 12.5px/500
  delta — each wrapped in `DxTilt` and carrying a native `title`.
- **Becomes:** the cluster's flagship change — **a frameless figure row.** Border, radius and shadow
  zeroed; `min-height` and `padding` dropped to `0 0 0 0` with the row's rhythm carried by
  `gap: 18px` (today's value) and `--bf-rhythm-dense` above and below. Markup:
  `<div className="kpi-grid schedule-kpis bf-figures">` → `<div className="kpi-card bf-figure">`
  (additive; `.schedule-kpis .kpi-card` still matches). Label → the eyebrow. Value →
  `--bf-app-figure` (28–34px) / **700** (from 750) / `-0.02em` / `tabular-nums`. Delta →
  `--bf-app-meta` `var(--wx-faint)`. Icon tile 52px → **40px**, radius 14px → **12px**, six tone
  fills kept exactly (`orange/blue/yellow/red/green/violet`), `translateZ(30px)` dropped with the
  tilt. Hover: **none** — a non-interactive figure gets no move (§1j). The `.kpi-card-button`
  variant (`aria-expanded`, `aria-controls`, `.active`) keeps a frame and the lift, since its
  boundary *is* interactive — no schedule page passes `onClick` today, and it must not break if one
  ever does.
- **Every information item placed:** card 1 `Active Crews` (`Users`, tone blue), value, delta
  `of N crews · N% of crew-days`, and its full tooltip; card 2 `Scheduled Activities`
  (`CalendarDays`, green), value, delta `<hours> hrs · $<laborCost>`, tooltip; card 3
  `At-Risk Items` (`AlertTriangle`, red), value, delta `conflicts & blockers`, tooltip =
  `AT_RISK_DEFINITION`; card 4 `Milestones This Month` (`CheckCircle2`, violet), value, delta
  `due in <Mon>`, tooltip. **All four `title` attributes stay exactly as they are** — they are the
  only place `AT_RISK_DEFINITION` and the three `kpis.definitions` strings live, and replacing them
  with a custom tooltip would re-home the product's only explanation of what "At-Risk Items" counts.
  The 8-hour shift default, the work-calendar working days and `DEFAULT_CREW_RATE` are logic —
  untouched.
- **Every action placed:** none on any schedule page (no `onClick` passed). The only interaction
  today is the tilt, which is retired (§1j).
- **States:** all four read `0` in an empty workspace; no loading, error or lock.
- **Motion:** tilt retired via one CSS rule with `DxTilt` left mounted. `.gantt-page .hs-kpi`'s
  `hsg-rise` stagger matches nothing (the grid renders `.kpi-card`, not `.hs-kpi`) — **verified
  dead**; the new sheet does not revive it and does not delete the keyframe (other rules use
  `hsg-rise`). Under `prefers-reduced-motion` the existing `schedule.css:1436` block already cuts
  KPI transitions to 0.2s — unchanged.
- **Tests touched:** `pages.test.tsx:348` (`.schedule-kpis .kpi-card` count > 0) — **passes
  unchanged because the class names are added to, not replaced**; this is the additivity rule's
  whole point. `kpis.test.ts:22/34/41/51` and `boundary.test.ts` #3 — logic, unaffected.

---

## 4. The Schedule landing (`#schedule`)

### 4.1 Schedule landing page — the whole plan, at a glance

- **Today:** the hub's landing: eyebrow, gradient-`em` H1, sub, the status strip, a control row
  (CPM readout left, Export + New Activity right), the shared filter row / saved views / 4 KPI
  cards, then a two-column body — `.sched-home-main` (first-run, view cards, digest, variances,
  queue) beside `aside.schedule-side-rail` (alerts, availability, milestones) — and a small footer.
  It is the only schedule page that passes `motion`, `board={false}` and `alerts={false}`.
- **Becomes:** the same eleven blocks in the same order on one flat `#f5f6fa` ground, with the
  boundary count halved (24 → 12, §1e). Hero: eyebrow pill → `--bf-app-eyebrow` uppercase, `h1` →
  `--bf-app-display` (27–38px) / 600 / `-0.02em` / 1.05 at `44ch`, sub → `--bf-app-lede` at `54ch`.
  Control row: the CPM figures on the left as a `.bf-figures` row, `Export` + `New Activity` as pills
  on the right. The KPI strip becomes the frameless figure row. Body: `.schedule-layout` keeps its
  `minmax(0,1fr) / minmax(300px,.32fr)` grid and all four of its breakpoints (`≤1500px` →
  `minmax(280px,0.3fr)`, stack at `≤1180px` and again at `≤680px`); the block gap goes from a flat
  22px to `--bf-rhythm-dense` (20–34px). `.sched-home-main`'s blocks become `.bf-panel`s
  (clause 3) whose **inner rows lose their frames** (`.bf-rows`), and the rail's three panels stay
  `.bf-panel`. The footer sits inside `.bf-tail`.
- **Every information item placed:** eyebrow `pulsing dot + Schedule · <weekRange>` → the hero pill
  (the `.dx-dot` keeps `dx-pulse`, its glow re-based to `--bf-focus-ring`); H1 `The whole plan, at a
  glance.` with `at a glance.` as the trio-gradient `<em>` → **kept, gradient included** (§1f), and
  the string is untouched because `appHarness.openSchedule()` awaits it (§9); sub `Status, alerts,
  field variances and the unbooked queue in one place. Open a view to change the plan.` → the lede;
  the status band → §3.2; the CPM readout → §3.3; `Export` + `New Activity` → §3.6 + the pill below;
  the filter row / saved views / KPI grid → §3.4 / §3.5 / §3.14; the two-column body → the grid
  above, with each block mapped in §4.2–§4.8 and §3.7/§4.5/§4.6; the footer `© 2026 BuildFlow HUD,
  Inc. All rights reserved.` + three link buttons → §4.10; **"no week stepper on the landing"** → the
  week still appears only in the eyebrow, and `WeekStepper`/`ThisWeekButton` stay exported for the
  other pages (§3.8). The eleven-block **filter honesty** map is preserved and not papered over: the
  view-card figures, KPI grid, alerts, queue and crew availability honour the filters; the status
  band, CPM readout, digest, variance queue, Upcoming Milestones and the first-run counts **ignore**
  them. No "filtered by" affordance is added to the page header, because it would be false for six
  of eleven blocks.
- **Every action placed:** keys 1–6 (with the full suppression rule — typing targets,
  alt/ctrl/meta, `event.repeat`, any visible `[role=dialog]`) → untouched, and **the sheet must not
  introduce a custom combobox or a rich-text notes field without one of the recognised
  roles**, or typing `1` navigates away; `New Activity` (`Plus`, `.sched-new-activity`) →
  `.bf-pill-primary`, opening the picker on the first crew in view (falling back to `data.crews[0]`)
  with the error notice `Add a crew before scheduling work.` when the workspace has none; the export
  menu with its landing scope, window, filename `buildflow-schedule-<weekStartIso>` and sheetTitle
  `Week of <weekRange>` → §3.6; `Re-baseline` → §3.3; each of the six view cards → §4.3; queue
  `Book` → §4.4; the picker's post-create `openView('week', …)` → §3.11; alerts `View all` /
  `View all alerts` → §3.7; availability `View all` / `Manage Crews` → §4.5; milestones `View all` /
  `View all milestones` → §4.6; variance `Accept` / `Keep the plan` → §4.2; the three footer links →
  §4.10; first-run `Import a schedule` → §4.9; the live feed's 250ms-coalesced reload → untouched
  (and the record's correction is honoured: **nothing on the landing consumes `liveChangeFor`**, so
  no `.is-live` flash, no `.sched-live-by` badge is added here); `?bench=<n>` (DEV-only, with
  `window.buildflowBench(n)`) → untouched. **Browser Back/Forward** between the landing and the six
  views is a real supported path (`pushState` on page change, `replaceState` when only context
  moves) — presentation-only, untouched.
- **States:** *whole-page empty* → `FirstRunPanel` takes over (§4.8). *Per-block empties* → the
  alerts line, `No crews created yet.`, `No upcoming milestones.`, the queue's two lines, and the
  variance section's silent omission — each mapped in its own entry. *Loading* → the band's
  `Checking where the plan stands…`, the digest's `Comparing snapshots…`, `Saving…`, `Sending…`,
  `Creating…`/`Loading…`/`Removing…`, and the import dialog's two loader lines. *Errors* → the ten
  `ScheduleNotice` failure strings, the band's failure strip, the digest's `The digest could not
  load`, and the CPM cycle alert. No add-on lock on this page (the schedule hub is not gated; the
  Map add-on lock lives on a different hub).
- **Motion:** five `data-reveal` blocks at 12px / 0.55s / 50ms (§1g); three auroras + `.dx-cursor`
  unchanged; `dx-pulse`; `dx-fade-up`; `sv-drawer-in`. Hover moves: 1 on the view cards, 2 on every
  pill, 3 on the rail links and alert rows. **Skeleton:** none — and none is added; `App.tsx` gates
  on the bootstrap payload, and the only in-page loading surfaces are the two shimmered lines above.
  `hs-upd-spotlight` (a 3px blue outline + `hs-upd-pulse` ×3 for 4.2s, from "What's new → Show me
  where it is") can land on any of this page's seven anchors — the new sheet must not add
  `transform`, `filter`, `contain` or `will-change` to an ancestor of a `[data-tutorial-id]` element,
  which is also what keeps the tutorial spotlight's `getBoundingClientRect` honest.
- **Tests touched:** `pages.test.tsx:401` (H1 contains `The whole plan`, the six card `<strong>`s in
  order, the queue holds `Downtown Retail Buildout`, `Concrete Crew 1` under `.sched-avail-name`,
  card[1] opens `week`) — passes unchanged; `:431` (every tour anchor present) — passes, provided the
  band placeholder still renders; `:441` (`.sched-view-key` === 1…6) — passes; `:571` (the week text
  and the filter chips) — passes; `tests/schedule.test.tsx:63/128/93` — pass; `boundary.test.ts`
  20/30/57/70/81 → **now 24/35/53/66/71** (§0.1) — pass; `scale.test.tsx:65` pins `.sched-views` as
  the landing's root selector — **kept**. `appHarness.tsx:136` awaits the H1 string — **untouched**,
  which is why the H1's copy and its `<em>` both stay.

### 4.2 Field variance review queue (`.sv-drawer`) — the landing only

- **Today:** the only path from a field progress report to the master schedule, and the densest block
  on the page: a section head, then one uncapped `.sv-card` per pending variance with evidence,
  three metrics, up to four impact lines, a ripple `<details>` and two actions. **No client test
  renders it** — a redesign here is unpinned, and it is the block most likely to lose half its
  content.
- **Becomes:** one `.bf-panel` (the section) containing `.bf-rows` — **each variance loses its own
  frame** and becomes a hairline-separated row-block, which removes the double boundary and lets the
  page show three variances in the height that shows two today. Head: `ShieldAlert` + `h2` at
  `--bf-app-section`, body at `--bf-app-row`/1.45 capped `--bf-app-prose`. Per variance: `h3` (the
  phase) at `--bf-app-row-strong`/650, the project at `--bf-app-meta`, the severity pill 999px at
  `--bf-app-micro` with its `sv-sev-high|medium|low` tone kept. Evidence: the photo at radius 12px
  `max-width: 100%`, the blockquote at `--bf-app-row`/1.45 capped `--bf-app-prose` with a 2px
  `var(--wx-line)` left rule, the `<cite>` at `--bf-app-meta`. The three metrics → a `.bf-figures`
  row (eyebrow label over an `--bf-app-stat` value), `sv-late`/`sv-early` tones kept, the
  `<em>plan <currentEnd></em>` at `--bf-app-meta`. Impact lines → `.bf-rows` at `--bf-app-meta` with
  16px icons. Actions right-aligned: `Accept → schedule` → `.bf-pill-primary`,
  `Keep the plan` → `.bf-pill`.
- **Every information item placed:** head `ShieldAlert` + `h2 Field variances` + the body sentence
  `The field reported progress that disagrees with the plan. Nothing has changed yet — accepting
  applies the forecastIQ and its knock-ons to the master schedule.` → the panel head; per card `h3`
  = `job.phase` (falling back to `job.name`, then `Unknown job`), `p` = project name or `—`, the
  severity pill showing `variance.severity` (`Low`/`Medium`/`High`), and the root's
  `sv-sev-*` class → the row-block head; the evidence photo, the field note (or `No note attached.`)
  and the `<cite>` `<reporter|Field> · <Mon D>` → the evidence block; `Reported <n>%`,
  `Planned <n>%`, `ForecastIQ finish <date>` with its `sv-late`/`sv-early` class and the
  `plan <currentEnd>` em → the three figures; the impact list — `On the critical path` (`Zap`,
  `sv-impact-critical`) or `N day(s) of float` (`Clock`), always `ForecastIQs N day(s) late|early`
  (`TrendingUp`), and `Project finish moves N day(s)` (critical) or `Project finish holds — float
  absorbs it` (`ArrowRight`) → the impact rows; the ripple `<details>` with summary
  `Pushes N downstream job(s)` and per item `<job> <currentStart> → <proposedStart>` + `<em>+Nd</em>`
  → a `.bf-rows` list inside the disclosure. **The disclosure marker must be re-declared:** the
  native marker is removed (`list-style: none` + `summary::-webkit-details-marker { display: none }`)
  and replaced by `summary::after { content: "▾" }` rotating 180° when `[open]`
  (`field-variance.css:513-531`) — that glyph is the only open/closed affordance, so the new sheet
  keeps the rule and just re-inks it. **The list stays uncapped** (every pending variance renders a
  full block) — that is today's behaviour and capping it would drop information.
- **Every action placed:** `Keep the plan` (`.sv-reject`) → `rejectVariance(id, activeUser.id)` +
  reload, disabled while that card resolves; `Accept → schedule` (`.sv-accept`, `Check`) →
  `acceptVariance(...)` + reload, same guard; the `<details>` summary expands the ripple (and
  remains uncontrolled, so a reload — including the live feed's — collapses it: unchanged).
- **States:** *empty* — the section is **not rendered at all**; no empty copy exists and none is
  invented. *Loading* — both buttons disable while `resolvingVarianceId` matches. *Error* —
  `Could not accept the variance: …` / `Could not reject the variance: …` in the page notice; an
  unresolved variance is the safe failure. No add-on lock.
- **Motion:** `sv-drawer-in 0.22s` — kept by name, re-timed to `var(--bf-ease)`; already nulled at
  `field-variance.css:296`. Hover: move 2 on the two pills only — **the row-blocks do not lift**
  (their boundary is not interactive; the buttons inside are). No `data-reveal` on the individual
  cards (it rides `.schedule-layout`'s block).
- **Tests touched:** **none — UNPINNED.** Mitigation, since the concept's acceptance criteria lean on
  it: this block gets a line-by-line manual walkthrough against the 13 information items above, and
  §12 adds it to the three-surface manual list. Two fields the payload carries and the card
  deliberately does **not** show (`variance.kind`, `ripple[].critical`, and the reporting job's own
  `proposedStart`/`currentStart`) stay unshown — they were never rendered, so "preserve everything"
  does not mean inventing them. `.sched-rx .sv-pill` (`field-variance.css:218-278`) and
  `.sv-drawer-head > button` are **orphaned CSS with no component** — §13.

### 4.3 View cards — "Open a view" (`ScheduleViewCards`)

- **Today:** six cards in a 3-up grid (2-up ≤1100px, 1-up ≤560px), each with a 40px icon tile, a
  title, a blurb, a live figure and a `<kbd>` key badge. Radius 16px, `1px solid var(--wx-line-soft)`,
  hover `translateY(-2px)` + `0 14px 30px rgba(28,28,26,0.1)` + a blue border.
- **Becomes:** the cluster's clearest **clause-1** cards, so they keep their frames and get move 1
  properly: radius 16px → **18px** (ladder), rest shadow `--bf-shadow-card`, hover
  `translateY(var(--bf-lift-dense))` (-4px) + `--bf-shadow-card-hover-dense` +
  `border-color: rgba(47,107,255,0.4)` over `0.28s var(--bf-ease)` (today 0.2s linear), and
  `:focus-visible` also gets `--bf-focus-ring`. Grid gap 14px → 16px; **all three breakpoints
  unchanged**. Title 15px/700 → `--bf-app-section` 15px/600; blurb 12.5px/500 → `--bf-app-meta`;
  figure 13px/600 → `--bf-app-row`/650 `var(--wx-mut)` with `tabular-nums`. Icon tile 40px, radius
  12px, `#e8f0fe` → kept exactly. The `<kbd>` → 999px, `--bf-app-micro` 11px/650, `tabular-nums`,
  `rgba(28,28,26,0.05)` fill.
- **Every information item placed:** section head `h2 Open a view` + `The week and filters follow
  you · keys 1–6 open a view` (eyebrow) + `aria-label="Schedule views"` +
  `data-tutorial-id="schedule-views"` → the block head; card 1 `Month` (`CalendarDays`) /
  *Every job on its start day, with milestones and holidays.* / `N jobs start in <Month YYYY>`;
  card 2 `Week` (`Users`) / *Crews by row, days by column. Drag to re-book, or book straight from the
  queue.* / `N bookings · N crews`; card 3 `List` (`List`) / *This week's bookings in time order, day
  by day.* / `N bookings this week`; card 4 `Gantt Chart` (`GanttChartSquare`) / *Every job as a bar
  on the timeline, grouped by project.* / `N jobs across N projects`; card 5 `Kanban`
  (`SquareKanban`) / *Jobs by status. Drag a card to move it along.* / `N in progress`; card 6
  `Matrix` (`Table2`) / *How booked each crew is this week, and where the conflicts are.* /
  `N% of crew-days booked` — **all six titles, blurbs, icons and figures unchanged, in this DOM
  order**; each card's `<kbd class="sched-view-key">` with its key and `aria-hidden` → kept in DOM
  order 1…6.
- **Every action placed:** card click → `openView(page)` (`updateContext` then `onOpenPage`). The
  same six destinations stay reachable by keys 1–6 and from ⌘K (`scheduleCommands`: `Schedule` plus
  `<Label> view` with the key as its hint) — untouched.
- **States:** none — the cards always render and their figures read 0. No loading, error or lock.
- **Motion:** move 1 (lift) on hover **and** `:focus-visible`. No per-card reveal. No skeleton.
- **Tests touched:** `pages.test.tsx:401` (the six `<strong>`s in order; card[1] → `week`) and `:441`
  (`.sched-view-key` contents) — pass unchanged. `tests/schedule.test.tsx:128` pins the Week card's
  **whole accessible name** `/^Week .*1 booking · 1 crew$/`, which fixes the internal text order
  (icon, kbd, title, blurb, figure) — **so no element inside a card may be reordered, and the `<kbd>`
  must stay `aria-hidden`.** `commands.test.ts:5`, `viewKeys.test.ts:15` — logic, unaffected.

### 4.4 Unassigned Jobs queue panel (landing)

- **Today:** a `.sched-home-section` holding up to 6 `.sched-queue-row`s, each itself a bordered
  `#f7f8fb` rectangle at radius 12px — the double-boundary case.
- **Becomes:** one `.bf-panel` with `.bf-rows` inside: the row's border, fill and radius are dropped
  for a `border-bottom: 1px solid var(--wx-line-soft)` (last child none) and a hover wash. The row
  keeps its `minmax(0,1fr) auto auto` grid and its ≤560px two-column collapse. `<strong>` 13.5px/700
  → `--bf-app-row-strong`/650; the `<span>` 12px/500 → `--bf-app-meta`; `Book` → `.bf-pill`
  (invert), box metrics untouched (phone contract).
- **Every information item placed:** head `h2 Unassigned Jobs` + the span reading either
  `Book them on the Week board` or `Every job in view has a crew booked` + `aria-label="Unassigned
  jobs"` → the panel head (span as eyebrow); per row the job name, then
  `<phase> · <date>` where the date is one `formatScheduleDate` when start === end and
  `<start> – <end>` otherwise; the `ScheduleBadge` for the job status (still hidden under 560px);
  the overflow line `<N> more on the Week board.` (`.helper-text`) → `--bf-app-meta` capped
  `--bf-app-prose`. The cap of 6 and the "booked anywhere, not booked-visibly" rule
  (`getUnassignedJobs(jobs, data.assignments)` uses **all** assignments) are logic — untouched.
- **Every action placed:** `Book` → `openView('week', { weekStart: startOfScheduleWeek(job.startDate) })`.
- **States:** *empty* — the head span flips **and** the body reads `Create a project and job to see
  work waiting for a crew.` (`.helper-text`); both kept. No loading/error/lock.
- **Motion:** hover wash on the row + move 2 on `Book`. No reveal of its own.
- **Tests touched:** `tests/schedule.test.tsx:63` (pins `Book them on the Week board`, that a booked
  job is absent, and that `Book` lands on `Selected week Jun 15 - Jun 21, 2026`) and
  `pages.test.tsx:401` (the queue holds `Downtown Retail Buildout`) — pass unchanged.

### 4.5 Crew Availability rail panel

- **Today:** a `.sched-rail-panel` (radius 18px, `0 14px 34px rgba(28,28,26,0.06)`) with up to 5
  frameless rows and a footer button.
- **Becomes:** `.bf-panel` — radius already 18px, shadow re-based to `--bf-shadow-card`
  (`0 10px 30px /.05`), padding 18px → 20px 20px 18px. Head `h2` 15px/700 → `--bf-app-section`/600;
  `View all` → a directional link at `--bf-app-row`/600 `var(--wx-blue)` with move 3 (today an
  opacity fade — the only place in the cluster where hover is an opacity change). Rows → `.bf-rows`
  (they are already frameless; they gain the hairline and the wash). `.sched-avail-name` →
  `--bf-app-row-strong`/650. The availability badge → 999px, `--bf-app-micro`, keeping its
  `busy`/`limited`/`available` classes **and their trade-palette fills**
  (`available` = `--cc-green-soft` on `--sc-finishes`, `limited` = `#fdf0dc` on `--sc-framing`,
  `busy` = `#efe8f8` on `--sc-mep`) — re-toning them would silently re-tone the Kanban card dots and
  the Matrix Load pills, which read the same three tokens. `.sched-avail-ratio` → `--bf-app-meta`
  `tabular-nums`. `Manage Crews` → `.bf-pill` full width (metrics untouched).
- **Every information item placed:** head `h2 Crew Availability` + `View all`; up to 5 rows sorted by
  `crewScheduleOrder` (the number in the name, `MAX_SAFE_INTEGER` when there is none — no name
  tiebreak, so unnumbered crews keep payload order: unchanged) with the crew name
  (`.sched-avail-name`, **pinned selector**), the availability badge (`Busy` ≥88%, `Limited` ≥62%,
  else `Available`) and the `<size>/<capacity>` ratio; footer `Manage Crews`. The utilisation maths
  (`crewWeekUtilization` over the workspace's working days, falling back to the crew's stored value)
  is logic — untouched.
- **Every action placed:** `View all` → `openView('matrix')`; `Manage Crews` → `openView('matrix')`.
- **States:** *empty* — `No crews created yet.` (`.cc-empty-line`, which finally gets a
  `.sched-rx` rule — §3.7's declared change). No loading/error/lock.
- **Motion:** hover only: wash on the row, move 3 on `View all`, move 2 on `Manage Crews`.
- **Tests touched:** `pages.test.tsx:401` asserts `Concrete Crew 1` **via the selector
  `.sched-avail-name`** — the class is pinned and kept. `kpis.test.ts:41` — logic.

### 4.6 Upcoming Milestones rail panel

- **Today:** the same `.sched-rail-panel` with up to 4 rows: a tinted icon tile, a title, the project
  and a right-aligned date.
- **Becomes:** `.bf-panel` + `.bf-rows` exactly as §4.5. Icon tile → 28px, radius 12px, keeping its
  `--sc-tone` fill from `tradeColorVar(milestone.tone)` (always `milestone`). `<strong>` →
  `--bf-app-row-strong`/650; the project → `--bf-app-meta`; the date → `--bf-app-meta`
  `tabular-nums`, right-aligned. Footer `View all milestones` → `.bf-pill` full width.
- **Every information item placed:** head `h2 Upcoming Milestones` + `View all`; up to 4 rows with
  the `CalendarDays` tile, the title, the project name and `formatScheduleDate`; the footer button.
  The derivation (`<Phase name> Complete` for every phase with an `endDate`, plus `Certificate of
  Occupancy` for every project with a `targetCompletion`, sorted by date) is logic — untouched, and
  so is the fact that this is **the one rail panel the filters do not narrow**.
- **Every action placed:** `View all` / `View all milestones` →
  `openView('month', { monthAnchor: firstOfScheduleMonth(milestones[0].date) })`, falling back to a
  plain `openView('month')`.
- **States:** *empty* — `No upcoming milestones.` (`.cc-empty-line`, as above). No
  loading/error/lock.
- **Motion:** as §4.5.
- **Tests touched:** **none — UNPINNED.** Added to the §12 manual list; nothing catches its removal,
  so the walkthrough checks all four rows and both footer/head actions.

### 4.7 Weekly digest panel — "What changed this week"

- **Today:** a `.sched-home-section` with a head whose span reports one of four states, a tone-coded
  change list, a totals line and a footer with the send button.
- **Becomes:** `.bf-panel` + `.bf-rows`. Head `h2` → `--bf-app-section`; the state span → the
  eyebrow. Change rows: a 6px tone dot (`tone-blue/red/amber/green`, values unchanged) + the sentence
  at `--bf-app-row` + the `<em>` project at `--bf-app-meta`, hairline-separated. Totals line →
  `--bf-app-row-strong`/650. Footer: the standing sentence at `--bf-app-meta` capped
  `--bf-app-prose`, `Email the team now` (`Mail`) → `.bf-pill`.
- **Every information item placed:** head `h2 What changed this week` + the span's four variants
  (`Since the snapshot of <Mon D>` / `First snapshot — next Monday compares against it` /
  `The digest could not load` / `Comparing snapshots…`) + `aria-label="What changed this week"` +
  `data-tutorial-id="schedule-digest"` → the panel head; the four change shapes —
  `<job> moved N day(s) later|earlier · <start> to <end>` (blue), `<crew> double-booked on <Mon D>`
  (red), `<milestone> slipped N days · now <Mon D>` (amber), `<job> is new · starts <Mon D>` (green),
  each with its `<em>` project → the rows; totals `The plan now: N jobs, N bookings, N crew
  conflicts.`; footer `Monday mornings this goes to every planner by email.` + the button.
- **Every action placed:** `Email the team now` → `sendScheduleDigest()`, notice
  `Digest emailed to N planners.`, disabled until the digest loads and while sending.
- **States:** *empty* — `<Nothing moved. >The plan now: N jobs, N bookings, N crew conflicts.` with
  the prefix only when a previous snapshot exists. *Loading* — `Comparing snapshots…` in the head
  (wrapped in `text-shimmer`) and `Sending…` on the button. *Error* — the head reads `The digest
  could not load` and **the panel renders head + footer only, with the send button permanently
  disabled** — faithfully preserved, and raised in §13 because it costs the user the manual send.
  Also `Could not send the digest: …` in the notice. No lock.
- **Motion:** none of its own; rides `.schedule-layout`'s reveal. Hover: move 2 on the button.
  **Fetch behaviour untouched:** the digest fetches exactly once per mount (`useEffect` deps `[]`)
  and is never refreshed by the live feed, a filter change or an accepted variance — the same is true
  of the status band (deps `[attempt]`). This is the single most likely thing a re-skin
  accidentally "fixes"; it is left exactly as it is.
- **Tests touched:** `pages.test.tsx:489` pins `Since the snapshot of Jun 8`, a `<strong>` reading
  `Riverside Office Building`, `/moved 2 days later/`, `/double-booked on Jun 16/`,
  `/slipped 2 days/`, `/3 jobs, 2 bookings, 1 crew conflict/` and the notice
  `Digest emailed to 2 planners.` — passes unchanged (copy and the `<strong>` are preserved).

### 4.8 First-run setup panel + its sample-data variant

- **Today:** the landing's empty state: an `<ol>` of four steps with inline forms, plus a footer that
  loads sample data; and a separate `.is-sample` variant once sample data is present.
- **Becomes:** `.bf-panel`. Head `h2` → `--bf-app-section`, its sub → `--bf-app-row` capped
  `--bf-app-prose`. The step list keeps its **`<ol> > li.is-done` shape exactly** (three
  `.sched-firstrun-steps li.is-done` is asserted): the numbered mark becomes a 26px `50%` disc —
  `rgba(28,28,26,0.05)` fill with the number at `--bf-app-micro`/650, flipping to a
  `rgba(47,107,255,0.10)` fill with a `#2f6bff` `Check` when done — and `li.is-done`'s colour change
  is kept **plus** a hairline between steps. Step copy at `--bf-app-row`/1.45. The inline forms use
  §3.11's field styling; `Create crew` / `Create project` → `.bf-pill-primary`; `Add a job`,
  `Import a schedule`, `Open the Week board`, `Load sample data`, `Remove sample data` → `.bf-pill`
  (`.sched-book`'s metrics untouched).
- **Every information item placed:** head `h2 Set up your schedule` + `Four steps from an empty
  workspace to a booked week — all from here.` + `aria-label="Set up your schedule"` +
  `data-tutorial-id="schedule-first-run"`; step 1 `Create a crew` with its two done variants
  (`<crew name> — ready to book.` / `<N> crews — ready to book.`) or the crew form; step 2
  `Create a project` with `<project name>.` / `<N> projects.` or the project form; step 3
  `Add a job` with `<job name>.` / `<N> jobs.` or `Add one on the first crew this week, or import a
  schedule from Primavera P6 or Microsoft Project.`, always showing both action buttons; step 4
  `Book it on the Week board` with `Booked — the week is on the board.` or `A job added here is
  booked on its crew the same day; a queued job can be dragged onto any crew's day on the Week
  board.`; footer `Just exploring? Load the starter workspace for your trade and remove it whenever
  you like.` + `Load sample data`; and the sample variant's `.sched-firstrun.is-sample`
  `aria-label="Sample data"`, `Sparkles` + `h2 Exploring with sample data`, `Every view is showing
  the starter workspace for your trade. Remove it when you are ready for your own work.` +
  `Remove sample data`. All 9 form inputs keep their exact `aria-label`s, placeholders, defaults and
  option lists: `Crew name` (*Crew name (Concrete Crew 1)*, required), `Crew lead`, `Trade` (the ten
  trades), `Create crew`; `Project name` (required), `Location`, `Target completion` (today + 90),
  `Create project`.
- **Every action placed:** both form submits with their **exact `createCrew` / `createProject`
  payloads** (untouched — `pages.test.tsx:517` pins them) and their notices; `Add a job` (with both
  `title` variants and its disabled state); `Import a schedule` → §4.9; `Open the Week board` (only
  when jobs exist but no bookings); `Load sample data` (disabled while busy or once the workspace has
  projects, `title="Sample data loads into an empty workspace"`); `Remove sample data`.
- **States:** this panel **is** the landing's empty state, and it renders nothing once all four
  exist and no sample data is loaded. *Loading* — `Creating…` on either submit, `Loading…` /
  `Removing…` on the sample buttons. *Errors* — the four `Could not …` notices. No lock. **Preserved
  a11y gap:** step state reaches assistive tech by copy alone (`.sched-firstrun-mark` is
  `aria-hidden`, `li.is-done` only changes colour, there is no `aria-current`) — §13.
- **Motion:** none of its own; rides the layout reveal. Hover: move 2 on every pill.
- **Tests touched:** `pages.test.tsx:517` (payloads + the notice), `:544` (**exactly 3 ×
  `.sched-firstrun-steps li.is-done`**, `Add a job` enabled, `Open the Week board` present,
  `Load sample data` disabled), `:553`, `:564` — all pass unchanged **because the `<ol> > li.is-done`
  structure and every accessible name are preserved**. This is the entry where a "visual rework of
  the step list" would break four tests; it does not.

### 4.9 Schedule import dialog (`ScheduleImportDialog`)

- **Today:** a five-stage dialog (choose → reading → preview → committing → done) on the
  **`.project-dialog` shell** — a *different* shell from the `.schedule-dialog` every other landing
  dialog uses — with a drop zone, three format cards, a five-figure stat row, per-project previews, a
  warnings list, and on `done` a full health report with three charts.
- **Becomes:** the `.project-dialog.sim-dialog` shell re-skinned to the same values as
  `.schedule-dialog` (radius 20px, `#fff`, `1px solid var(--wx-line-soft)`, `--bf-shadow-stage`,
  backdrop `rgba(28,28,26,0.42)`) so the two shells stop disagreeing — **and this is the one place
  the cluster touches `styles.css:10470-10525`'s shell, done additively under
  `.sched-rx .project-dialog`… which cannot work, because the dialog is rendered from the landing
  and therefore *is* inside `.sched-rx`: verified, the mount point is `SchedulePage.tsx:518`, inside
  the page root. So `.sched-rx .sim-dialog` is sufficient and the base shell is left alone.**
  Drop zone → `1px dashed var(--wx-line)`, radius 18px, `.dragging` → `rgba(47,107,255,0.06)` fill +
  `var(--wx-blue)` border. The three format cards → `.bf-panel`s at radius 12px (they are small and
  static). Stat rows → `.bf-figures`. Per-project blocks → `.bf-rows`. The sample table → the
  §6.1 table grammar (eyebrow `thead`, hairline rows). Warnings + findings → `.bf-rows` with a tone
  dot.
- **Every information item placed:** shell (`role="dialog" aria-modal
  aria-labelledby="schedule-import-title"`, `h2 Import a schedule`, `Bring an existing Primavera P6
  or Microsoft Project schedule into BuildFlow.`, `X` `aria-label="Close schedule import"`);
  **choose** — the drop zone with `FileUp`, `Drop your schedule file here`, `Primavera P6 export
  (.xer) or Microsoft Project XML (.xml)`, `Choose file`; the three `.sim-formats` cards
  (`Primavera P6` / *File → Export → Primavera PM (XER)*; `Microsoft Project` / *File → Save As →
  XML Format (\*.xml)*; `Why not .mpp?` / *It's an undocumented binary format — save it as XML
  first.*); **preview** — `.sim-source` (`CheckCircle2` + source + filename), the `HealthTeaser`
  (score ring + grade + headline), the five `.sim-stats` figures (`activities read`, `jobs to
  create`, `phases`, `milestones`, `relationships`), per project the name + `N jobs · N phases ·
  finishes <date>`, the phase chips with `title="<start> → <end>"`, the sample table
  (`Activity | Phase | Start | Finish`) and `+ N more activities`, then `.sim-warnings` `Before you
  import` + its list; **done** — `Imported <N> job(s) and <N> phase(s) into <projects>` plus the
  `ScoreRing` (SVG 0–100 with its literal `/ 100`), the grade pill (`Healthy` / `Monitor` /
  `At Risk` / `Critical` with tones `good/warn/risk/bad`), `h3 Schedule health check`, the headline,
  the `ForecastIQPanel` (`CalendarClock` + `ForecastIQ completion` + one of `Not started yet` /
  `On track` / `Slipping` / `At risk` / `Complete`, then `Planned finish` → `Projected finish` →
  `Variance` with `on plan` / `N days late` / `N days early`, and the two-marker meter with its
  `N% complete` / `N% of time elapsed` legend), the `ConfidenceBand` (`<N>% chance of hitting your
  <date> plan date`, the P10–P90 track with P50/P80 ticks and the plan marker, `role="img"` with
  `aria-label="Likely finish between <p10> and <p90>; P50 <p50>, P80 <p80>"`, the legend `Your plan`
  / `P50 · coin-flip` / `P80 · confident`, and the method line — plus the fallback where a missing
  `confidence` replaces the whole band with a bare `.sim-forecastIQ-method` paragraph), the five
  `.sim-health-stats` figures (`activities`, `complete`, `in progress`, `not started`, `links`) and
  the `FindingsList` (per finding a dot, title, severity `high|medium|low` printed verbatim, detail,
  sample activity codes and `+N more`). Accepted extensions `.xer,.xml,.mpp` and the 24 MB client cap
  → unchanged. **Three charts, all preserved:** the `ScoreRing` (its `stroke-dasharray/offset` maths
  untouched; the ring's track re-inked to `rgba(28,28,26,0.07)` and its stroke to the grade tone),
  the ForecastIQ two-marker meter, and the P10–P90 band (§1f re-bases its ramp).
- **Every action placed:** drag-and-drop or `Choose file` → `previewScheduleImport`;
  `Import & see full health check` (label `Importing…` while committing, disabled when
  `totalJobs === 0`) → `commitScheduleImport` + `onImported()`; `Choose a different file`;
  `Cancel` / `View my projects` (the same button relabelled at `done`); the file input resets its
  value so the same file can be re-picked. **Preserved gap:** the `.project-dialog-backdrop` has no
  `onClick` and there is no Escape handler — the `X` and `Cancel` are the only ways out (§13).
- **States:** *loading* — `reading`: the ported `quantum-cloud-loader` + `Reading your schedule…`;
  `committing`: the loader + `Importing your schedule…` + `N jobs into N projects`
  (`role="status" aria-live="polite"`). **The loader is `aria-hidden`, so the text beside it is the
  only accessible signal — it stays.** *Empty* — `FindingsList` clean state: `CheckCircle2` +
  `No structural issues found — logic, durations, and resourcing all look clean.` *Errors* —
  `<div class="sim-error" role="alert">` with message + optional hint; the `.mpp` pre-flight refusal
  (`MS Project .mpp files can't be read directly — it's a binary format.` + its hint) and the
  oversize refusal (`That file is X MB, which is over the 24.0 MB limit.` + its hint); a failed
  preview returns to `choose`, a failed commit to `preview`. No lock.
- **Motion:** the `.sim-*` block plus the quantum loader — unchanged (the loader's own CSS lives in
  `quantum-cloud-loader.css`, which the landing depends on and the record's cssFiles list omits;
  named here so it is not missed).
- **Tests touched:** `ScheduleImportDialog.test.tsx:87/114/123` — all three pass unchanged (copy,
  roles and the two-step flow are preserved).

### 4.10 Schedule page footer + policy dialogs (`ScheduleDialogPanel`)

- **Today:** a small in-app footer (`data-reveal`) with a copyright line and three text buttons, each
  opening a `ScheduleDialogPanel`.
- **Becomes:** the footer sits in `.bf-tail`: a top hairline `1px solid var(--wx-line-soft)`, the
  copyright at `--bf-app-meta` `var(--wx-faint)`, the three buttons as directional links at
  `--bf-app-row`/600 with move 3, keeping their 40px phone targets
  (`.sched-rx .schedule-page-footer button`). `ScheduleDialogPanel` itself — used by **four**
  surfaces (the alerts dialog, the three policy dialogs, and the Month day summary) — becomes the
  §3.10 shell: radius 20px, `h2` at `--bf-app-section`, description at `--bf-app-row`/1.45 capped
  `--bf-app-prose`, its list as `.bf-rows` at `--bf-app-row`.
- **Every information item placed:** `© 2026 BuildFlow HUD, Inc. All rights reserved.`;
  `<nav aria-label="Schedule footer links">` with `Privacy Policy`, `Terms of Service`,
  `Help Center`; the block's `data-reveal`. And every word of the dialog copy: `Help Center` gets
  `Open a view to change the plan: drag cards on the Week board, chips on the Month calendar, rows on
  the List.` + the item `The filters and the week you pick here follow you to every schedule view.`;
  the other two get `<title> details are available for the BuildFlow Schedule workspace.` +
  `This demo keeps the policy content in-app without navigating away from Schedule.`
- **Every action placed:** each button opens its dialog; the dialog's `X` closes it. **Preserved
  gap:** `ScheduleDialogPanel`'s backdrop is `role="presentation"` with no `onClick` and there is no
  Escape handler, so the `X` is the only way out (§13).
- **States:** none.
- **Motion:** `data-reveal` rise at 12px/0.55s (it is one of the five budgeted blocks). Hover: move 3.
- **Tests touched:** **none — UNPINNED.** Added to the §12 manual list.

### 4.11 Bookmarked schedule views (`ScheduleLinkMenu` / `ScheduleLinkTiles`)

- **Today:** rendered in the **top-bar star menu** and on the **Bookmarks page**, not in the landing
  body — but they bookmark schedule deep links, and their CSS lives in the shell sheets
  (`app-shell-hubspot.css` for `.hs-bookmark-row`/`.hs-bookmark-remove`/`.hs-menu-item`) and
  `bookmarks-page.css` (`.bm-groups`/`.bm-group`/`.bm-tiles`/`.bm-tile`/`.bm-tile-star`) — **not in
  `schedule.css` at all.**
- **Becomes:** the surfaces belong to the shell and bookmarks clusters; **this cluster owns only the
  label and detail copy**, which is unchanged. For the record, so nothing falls between clusters:
  menu rows → `.bf-row` + move 3 (`Link2` icon 16px, label at `--bf-app-row-strong`, the
  `<em class="hs-bookmark-hub">` detail at `--bf-app-meta`, its `title` kept); tiles → `.bf-card-nav`
  (move 1) with the icon, the label, the `<small>` detail and the lit star — **and per the shell
  concept's declared change the star goes gold `#f0b354` → `#2f6bff`**, which is the shell cluster's
  call, applied here for consistency, not re-litigated.
- **Every information item placed:** menu rows (`Link2`, label, `<em>` detail, `title=detail`);
  tiles (`.bm-groups > .bm-group aria-label="Schedule views"`, `h2` with `Link2` + `Schedule views`,
  then `.bm-tile.is-starred` cards with icon / label / `<small>` / star); both render nothing when
  nothing is starred; and the label/detail grammar itself — `<Page label> · week of <Mon D>` for
  schedule/week/list/matrix, `<Month YYYY>` for month, the bare page label for kanban/gantt,
  `week of today` / `this month` when the context carries no date, and the detail =
  `describeSavedView(...)` (`Pinecrest Medical · Concrete · Concrete Crew 1 · 3 statuses`, or
  `All work`).
- **Every action placed:** row/tile click → `onOpen(link)` (sets `window.location.hash`); the `×` /
  star → `onRemove(link)` with `aria-label="Remove <label> from bookmarks"` and
  `title="Remove bookmark"`.
- **States:** both return `null` when empty (the star menu's own empty copy belongs to the shell).
- **Motion:** `hs-flyout` / `bm-tile` hover styling — shell-owned; moves 3 and 1 respectively.
- **Tests touched:** `linkBookmarks.test.ts:19/40/56/66` — pure logic, unaffected. Cross-cluster
  dependency recorded in §12.

---

## 5. Week board and Month calendar

### 5.1 Week page — crew × day board (`#schedule/week`)

- **Today:** one row per crew, seven day columns, a card per booking, with a queue rail beside it.
  Grid template `clamp(112px,11%,150px) repeat(7, minmax(0,1fr))` (`schedule.css:27`), overridden
  from `styles.css:9448` and re-declared for phones at `schedule-phone.css:30` as
  `124px repeat(7, 116px)` with a sticky crew column. Cards are white/tinted rectangles at radius
  14px; cells are transparent with hairline separators; the board is the white card behind them. The
  page passes `board={false}` and `alerts={false}` and lays out its own `.schedule-layout` + rail +
  notice.
- **Becomes:** `.bf-well` — the board is the cluster's textbook clause-2 surface: radius 18px,
  `overflow: hidden` (kept), `1px solid var(--wx-line-soft)`, `--bf-shadow-card` (from the
  off-ladder `0 18px 44px /.07`), and it clips the header, the rows and the footer to its corners.
  **All three grid templates keep their current values** — the header and the rows must stay on the
  same template or the header stops lining up, and the phone rule's sticky column depends on the
  literal `124px`; the new sheet declares no grid template at all. Header row (42px, unchanged):
  day names + dates → the eyebrow (`MON` at `--bf-app-eyebrow` uppercase `0.045em`
  `var(--wx-faint)`, the `<em>` date at `--bf-app-micro`), fill `#fff` → **transparent** with the
  bottom border to `var(--wx-line)`. Crew label: name → `--bf-app-row-strong`/650, size →
  `--bf-app-meta`, the utilisation `<em>` → `--bf-app-micro`/700 tabular `var(--wx-blue)`. Job cards:
  radius 14px → **12px**, rest `--bf-shadow-raised`, hover
  `translateY(var(--bf-lift-dense))` + `--bf-shadow-card-hover-dense` over `0.28s var(--bf-ease)`
  (from `-2px` / `0 12px 28px` / 0.2s); the five status tints kept **verbatim**. Empty-cell
  `Add job` placeholder: dashed `1px var(--wx-line)`, radius 12px (already), label at
  `--bf-app-micro`, hover/focus → `var(--wx-blue)` border + `rgba(47,107,255,0.06)` fill **plus
  `--bf-focus-ring` on `:focus-visible`**, because today `outline: 0` leaves a colour change as the
  only focus indicator (`schedule.css:71-77`). Footer legend → the eyebrow. The rail → §5.2.
- **Every information item placed (28 items):** eyebrow `Crew Scheduling · <week range>` → the hero
  pill; `h1 Week` + the `New` release pill → `--bf-app-display` + `.hs-page-tag` (which
  **finally gets a rule** — see the §13 note, since `hs-index.css:978` scopes it to
  `.hs-index .hs-index-title` and the six view pages render it inside `.dx-title`, so it is bare
  inline text today on month/week/list/kanban/matrix; the fix is one rule and it belongs to the shell
  cluster, mirrored here); sub-line → the lede; the stepper's `Selected week …` label + `<strong>`
  range → §3.8; board region `aria-label="Crew schedule for the week"` → unchanged; the pluralised
  crew count `2 Crews` / `1 Crew` → the header's first cell as an eyebrow (**including the `0 Crews`
  filtered-out case**); the seven day heads (uppercase name + `<em>` date) → the eyebrow;
  `.sched-holiday-tag` holiday names → `--bf-app-micro` on the `--sc-holiday` tint, kept; `.is-holiday`
  fill and `.is-off`'s 72% opacity → kept **exactly as they render**, which per the record's
  correction means the header dims on a non-working day and **`.schedule-cell.is-off` has no rule at
  all** — not "fixed" here (§13); the crew label's name / `Users` + size / `<n>%` with
  `title="Booked days this week over working days"` → as above; the job card's name, phase, shift
  times `<start> - <end>`, `Users` + `requiredLabor`, the status badge, and the red conflicts line
  → the card, with the conflicts `<p>` at `--bf-app-micro` `var(--wx-red)`; the status tint set → the
  five rules kept, **including the fact that `.delayIQed` never fires** (§13); the live badge
  `<Moved|Unbooked|Updated> by <person>` (`.sched-live-by`) → a 999px pill at `--bf-app-micro` on
  `rgba(47,107,255,0.10)`; cell state classes `.has-jobs/.empty/.over/.is-holiday/.is-off` and the
  `data-crew-id` / `data-date` attributes → all kept (pinned); the `Add job` placeholder and its
  compact variant → as above; the board footer legend (`aria-label="Schedule statuses"`, five dots:
  Confirmed green / Ready deep blue `#003dd9` / DelayIQed red / In Progress blue / Planned faint) →
  the eyebrow + 9px dots, all five values kept — **and the legend keeps promising a red the
  DelayIQed card never shows** (§13); the notice → §3.9; the KPI grid → §3.14; the filter row →
  §3.4; the saved views bar → §3.5; the alerts panel → §3.7; and the lazy row
  (`.crew-row.is-lazy` with its 135° hatch, `min-height: 84px`, and its one placeholder cell spanning
  `grid-column: 2 / -1`) → **kept exactly**, hatch re-inked to `rgba(28,28,26,0.03)`.
- **Every action placed:** drag a card to another crew-day → `weekRebook 'move'` (notice + Undo);
  drag a queue chip onto a cell → `'book'` (notice + Undo `'unbook'`, undone `<job> unbooked
  again`); a chip dropped on a crew-day it already has → the `'already'` notice with no write; a drop
  on its own cell or off the board → no request; keyboard drag (Space/Enter lift, arrows move one
  crew or day, Space/Enter drop, Escape cancel) with its live announcements; touch drag (250ms press,
  8px tolerance) and mouse drag (4px) → **all untouched, and `touch-action` is left to
  `schedule-phone.css`**; card click → the drawer (`suppressClick` 150ms); `Add job` in a cell →
  the picker for that crew+day; `New Activity` → the picker on the first crew in view;
  `Previous week` / `Next week` / `This week` / `Schedule` → §3.8; the export menu with filename
  `buildflow-week-<Monday>` and sheetTitle `Week of <range>` → §3.6; queue `Show N more of M` →
  §5.2; every filter, saved-view and alert action → §3.4/§3.5/§3.7; keys 1–6; the empty state's
  `Set up your schedule` → the landing; the notice's `Undo`. **Preserved and named:** because every
  card is a `<button>` that is its own dnd-kit activator, Space/Enter lifts it for a keyboard drag
  and the click never fires — **there is no keyboard path to the drawer from the board** (§13), and
  the drawer stays reachable by keyboard from the Gantt's sidebar rows.
- **States:** *no crews at all* — `No crews created yet.` + `Add crews before scheduling jobs.` +
  `Set up your schedule` → a centred `.bf-panel`-less block on the ground inside the well, strong at
  `--bf-app-section`, body at `--bf-app-row` capped `--bf-app-prose`, the button `.bf-pill-primary`.
  *Filtered out* — `No crews match these filters.` + `Clear a filter or choose another crew type.`
  (no button) → same treatment. *Cell empty* — the dashed `Add job` placeholder is the empty state.
  *Queue empties* → §5.2. *Alerts / saved views empties* → §3.7/§3.5. *Loading* — per-card
  `.is-pending` (opacity .5, `pointer-events: none`, `aria-busy`, `sched-pending` pulse),
  `Undoing…`, `Scheduling...`, feeds `Loading…`, and the lazy rows as their own progressive state.
  **No board skeleton, and none is added.** *Errors* — the seven strings the record lists, unchanged.
  No add-on lock on this hub.
- **Motion:** three auroras, `dx-pulse`, `dx-fade-up`; **no `data-reveal` and no `.dx-cursor`
  (`motion=false`) — kept false.** `sched-pending`, `sched-live-flash` (both keep their names and
  their reduce guards). Cell drop-hover `.over` → inset 2px `var(--wx-blue)` + `#e8f0fe`, kept, now
  at `150ms var(--bf-ease-size)`. Hover moves: 1 on cards and chips, 2 on `New Activity`/`Export`/
  the steppers, 3 on the alert rows. `+ New Activity`'s `translateY(-1px)` + `:active scale(0.98)` →
  the standard `--bf-press-scale` 0.94 press. KPI tilt retired (§1j).
- **Tests touched:** the eleven `pages.test.tsx` Week/shared cases, `scale.test.tsx`'s
  `renders the Week page` (root selector `.schedule-cell`) and its **40 `.crew-row` / 28
  `.crew-row.is-lazy` / 28 placeholder `.schedule-cell` / ≤30 chips** assertions, the six
  `tests/schedule.test.tsx` Week cases, `boundary.test.ts`'s five relevant its, `rebook.test.ts`'s
  five `weekRebook` cases, `week.test.ts`, `dragKeyboard.test.ts` — **all pass unchanged.** The
  reason is stated as a rule: the new sheet declares no grid template, no `touch-action`, no row/cell
  height and no box metric on a phone-contract selector, and renames nothing. The one place a
  reviewer must look: `tests/schedule.test.tsx:199` pins the button names
  `Add job to Concrete Crew 1 on Jun 16` / `on Jun 15`, and `:93` pins `region 'Crew schedule for
  the week'` — both are accessible names, untouched.

### 5.2 Week page — side rail: Unassigned Jobs / Planned Work queue

- **Today:** a `.schedule-side-panel` frame holding a count badge and up to 30 `.unassigned-card`
  chips, each a drag source, plus a `Show N more of M` button.
- **Becomes:** `.bf-panel` (clause 3). The **chips keep their frames** (clause 1 — they are drag
  sources): radius 12px, rest `--bf-shadow-raised`, hover
  `translateY(var(--bf-lift-dense))` + `--bf-shadow-card-hover-dense` (from `-2px` / a 30px shadow),
  status tints kept. Head `h2` → `--bf-app-section`; the count badge → a 999px `#2f6bff`-on-10%
  pill at `--bf-app-micro` tabular; helper text → `--bf-app-meta` capped `--bf-app-prose`;
  `Show N more of M` (`.sched-kan-more`) → `.bf-pill` dashed, metrics untouched (phone contract).
- **Every information item placed:** the heading, which flips to `Planned Work` when nothing is
  unbooked; the count badge; and per chip the `GripVertical` grip, the job name, the phase `<em>`,
  the date range `<b>` (a single `Jun 15` when start = end, else `Jun 15 - Jun 17`), the
  `ScheduleBadge`, the tint classes (`.ready`/`.ready-to-start` blue, `.delayIQed`/`.at-risk` red,
  else white) and the accessible name `<job> — drag onto the board to book it`; the helper line in
  all three variants; the `Show more` button's copy `Show <min(30,remaining)> more of <remaining>`
  (**both numbers describe what is still hidden** — the record's correction, preserved verbatim).
- **Every action placed:** drag a chip onto a crew-day cell → book it; `Show N more of M` → +30;
  **a chip click does nothing on this page** (no `onOpenProject` is passed) — preserved, and the
  cursor stays `grab` so the affordance stays honest.
- **States:** the three helper variants are the empty states — `Every job in view has a crew
  booked.`, `Every job has a booking — planned work that can take more crew-days. Drag one onto a day
  to book it.`, and `Drag a job onto a crew's day to book it.` No loading or error of its own
  (failures surface in the board notice). No lock.
- **Motion:** move 1 on the chip; `.dragging` + dnd-kit translate; `Show more`'s hover switches
  border/colour to blue → move 2. No reveal.
- **Tests touched:** `tests/schedule.test.tsx` (`shows the unassigned drag queue beside the Week
  board` — pins the heading, the chip's accessible name, the helper sentence and the board region),
  `scale.test.tsx` (queue capped at 30), `pages.test.tsx` Week #1 — all pass unchanged.

### 5.3 Month page — calendar (`#schedule/month`)

- **Today:** a six-week Sunday-first grid of exactly 42 cells, each holding at most one milestone and
  three items total, with hover-revealed `+` add buttons, a month bar, and a trade legend in the
  footer. Uses the frame's board wrapper and the full-width alerts strip.
- **Becomes:** `.bf-well` (radius 18px, `overflow: hidden`, `--bf-shadow-card`). The grid keeps
  `repeat(7, minmax(0,1fr))` × 6 and **all four cell min-heights** (116 → 96 ≤1180px → 78 ≤900px →
  64 ≤640px), because `jobRoom` is derived in `parts/month.tsx` from those heights and a taller cell
  would need a JS change. Day-of-week head → the eyebrow, its fill transparent. Day-number pill →
  `--bf-app-micro`/650 tabular in a 22px `50%` disc; `.is-today` keeps its blue fill and glow, now
  `rgba(47,107,255,0.28)`. Chips (`.sched-act`): radius 8px (chip rung), name at `--bf-app-micro`/650,
  the `<em>` subtitle at `--bf-app-micro`/500 `var(--wx-faint)`, the trade dot 7px `50%`, hover
  `translateX(var(--bf-slide))` (move 3, from 2px) + the tone-mixed fill, `0.18s var(--bf-ease)`.
  Milestone row: the square dot stays square (radius 2px) — it is the legend's only distinguishing
  mark. `+N more` (`.sched-act-more`) → `.bf-pill` at `--bf-app-micro`, its ≤640px full-width 40px
  form untouched. Month bar: `‹ <Month Year> ›` title at `--bf-app-section`/600 with its
  `min-width: 168px` and tabular figures kept, the two 36px icon buttons → radius 12px,
  `Today` → `.bf-pill`. Trade legend → the eyebrow + 9px dots.
- **Every information item placed:** eyebrow `Crew Scheduling · <Month Year>`; `h1 Month` + the
  release pill; the sub-line; the month bar's title and `Today`; the seven day-of-week heads
  (uppercased, letter-spaced); 42 cells each with its day-of-month pill; the six cell classes
  (`.out-month`, `.is-weekend` from `calendar.workingDays`, `.is-today`, `.is-holiday`, `.drop-over`,
  `.is-addable`); the `.sched-holiday-tag` name under the day number; the milestone row (square dot +
  `<strong>` title + `<em>` project, red `--sc-milestone`, `.sched-act.is-milestone`, **max 1 per
  cell**, and its `title` attribute — which sits on the chip, not the cell: the record's correction,
  preserved); the milestone derivation copy (`<Phase> Complete`, `Certificate of Occupancy`); the job
  chip (round trade dot + name + subtitle = project name falling back to `job.location`) and its
  `title="<job name> · <phase>"`; the six trade tones (`concrete #2f6bff`, `framing #c2410c`,
  `mep #6d28d9`, `finishes #188038`, `sitework #0e7490`, `inspections #b0338c`) → **unchanged**; the
  live badge replacing the `<em>` subtitle; `+N more`; the hover `+` add button
  (`aria-label="Add a job on <date>"`, `title="Add a job on this day"`); the board footer's trade
  legend (`aria-label="Trade colors"`: Concrete, Framing, MEP, Finishes, Site Work, Inspections,
  Milestone as a square, Holiday) and the Export button; the notice; and the shared chrome above and
  below. The `--d = weekIndex` stagger variable stays on the cell. **Preserved as-is:** at ≤900px the
  chip's `<em>` subtitle is hidden (`schedule.css:2814`), which also hides the live `Moved by <name>`
  label on every tablet, and at ≤640px chips collapse to bare dots.
- **Every action placed:** drag a chip to another day → `monthRebook` (the two-op `job` + `move`
  payload, notice + the exact inverse on Undo, undone `<job> back on <date>`); a drop on the job's own
  start day → no request; keyboard drag with its announcements; chip click → the drawer;
  **click the empty area of an in-month day → the picker** — and this is the mapping's single most
  dangerous cell: it depends on `event.target === event.currentTarget`, so **the new sheet must not
  wrap the cell's contents in a new inner div, must not add a padding element, and must not make the
  cell a `<button>`**; the hover `+` → the same picker; `+N more` → §5.4; `Previous month` /
  `Next month` / `Today` (disabled at 55% opacity when already on this month) → the month bar;
  `Schedule` → the landing; the export menu (filename `buildflow-month-<YYYY-MM>`, the month window,
  `includeUnbooked: true`, sheetTitle `Crew week sheets`, the whole trigger disabled while busy or
  with no jobs) → §3.6; the shared filter/saved-view/alert actions and keys 1–6; `Undo`. **Preserved
  oddity, unchanged:** the Month has no week control at all, yet `Print week sheets` prints the
  *shared* week (§13).
- **States:** *day summary for a bare day* → §5.4. *A day with no chips* shows only its number plus
  the hover `+` — no per-cell copy, and none is invented. *No page-level empty state* — with no jobs
  the grid still draws 42 cells and Export is disabled: unchanged. *`Add a crew before scheduling
  work.`* when click-to-add finds no crew. *Loading* — the moved chip gets `.is-pending` (keyed on
  the **job** id here, not an assignment id), Export disabled while busy, `Undoing…`, feeds
  `Loading…`. *Errors* — the four strings listed, unchanged. No lock.
- **Motion:** `schedCellIn 0.5s` with `animation-delay: calc(var(--d) * 55ms)` → **kept by name and
  value** (it is pure CSS on purpose, so it survives the view switch an IntersectionObserver would
  miss), **and it finally gets a `prefers-reduced-motion` guard** (§1h). Chip drag, `.drop-over`
  ring, the `+` button's `opacity 0 → 1` + `scale(0.9)` reveal with its ≤900px always-visible and
  ≤640px hidden rules → unchanged; per the shell concept's touch-rescue graft the `+` also fires on
  `:focus-within` as well as `:hover`, which it partly does already via `:focus-visible`
  (`schedule.css:2429`) — extended to `:focus-within` so a keyboard user inside the cell keeps it.
  `sched-pending`, `sched-live-flash`. Hover moves: 3 on the chips, 2 on the month-nav pills. No
  reveal (`motion=false`).
- **Tests touched:** `pages.test.tsx` Month #1 (**exactly 42 `.sched-cal-cell`**, `June 2026`, the
  two chip `title`s) and #2 (the two-step payload, the notice, the exact inverse), `Continuity`,
  `Same export everywhere`, `Guided tour` (`month-calendar`), `scale.test.tsx` (root `.sched-cal`),
  `month.test.ts`, `rebook.test.ts`'s four `monthRebook` cases, `boundary.test.ts` — **all pass
  unchanged**, on the condition above about the cell's DOM.

### 5.4 Month day summary dialog ("+N more")

- **Today:** a `ScheduleDialogPanel` titled with the date, a count description and a flat list.
- **Becomes:** the §4.10 dialog shell: `h2` = the formatted date at `--bf-app-section`, description at
  `--bf-app-row` capped `--bf-app-prose`, the list as `.bf-rows` at `--bf-app-row` with the
  milestone's `◆` kept as a literal glyph.
- **Every information item placed:** title `<Jun 22>`; description `<N> scheduled item(s) on this
  day.` (with the singular `item` at 1); list items `◆ Milestone — <title> (<project>)` for each
  milestone then `<job name> — <phase> · <location>` for each job. Nothing in the list is clickable
  — preserved.
- **Every action placed:** the `X` (`aria-label="Close <date>"`). **No backdrop click, no Escape** —
  preserved (§13).
- **States:** *empty* — the description reads `Nothing scheduled on this day yet.` with no list.
- **Motion:** the shared shell.
- **Tests touched:** no dedicated test; exercised indirectly by the Month grid test. Added to the
  §12 manual list.

---

## 6. List, Kanban, Matrix

### 6.1 List page (`#schedule/list`)

- **Today:** seven day sections (quiet days included) inside a board card, each row a 4-column grid
  button (Time / Job / Crew / Status) and a drag source; a column header strip above; day heads on a
  `--wx-bg-2` fill.
- **Becomes:** the cluster's **table**, and therefore the surface the eyebrow graft was written for.
  `.bf-well` for the board. The column strip becomes the `thead`: fill `#fff` → **transparent**,
  labels → the eyebrow, bottom border → `var(--wx-line)`. Day heads: fill `--wx-bg-2` →
  **transparent**, type → the eyebrow (from 11.5/700/0.04em), and a `2px` top hairline separating
  sections; `.is-today`'s `--sc-concrete` tint and `.is-holiday`'s `--sc-holiday` tint and
  `.is-empty`'s faint colour → **all three kept** as the only day-state signals. Rows: **frameless**
  already; the `border-bottom` re-inked to `var(--wx-line-soft)`, hover → the wash
  `rgba(28,28,26,0.035)` + the trailing control sliding 3px, and **the inset blue ring is removed
  from hover and reserved for `.focused`** (§1j — today they are identical). Row heights are
  untouched. Cell type: `Time` `<strong>` → `--bf-app-row-strong` tabular; job name → same; the
  phase / location `<em>`s → `--bf-app-meta`; the badge → `--bf-app-micro`. Footer legend → the
  eyebrow. **And the missing `.list-page` block is written**: today `.list-page` and `.list-actions`
  have no CSS anywhere while `.kanban-page .kanban-actions` and `.matrix-page .matrix-actions` do, so
  the List's action strip is aligned differently from its siblings and its notice falls back to the
  generic margin — the new sheet adds `.list-page .list-actions { margin-left: auto }` and
  `.list-page .schedule-board .gantt-status { margin: 12px 18px 0 }`. **Declared visible change**,
  and it removes an existing inconsistency rather than adding one.
- **Every information item placed:** eyebrow `Crew Scheduling · <weekRange>`; `h1 List` +
  `data-tutorial-id="list-page-title"` + the release pill; the sub-line; the stepper readout; the
  four filter-select values and the `Statuses` counter; the active-filter chips; the saved-views bar;
  the four KPI cards with their deltas and tooltips (§3.14); board `aria-label="Bookings this week"` +
  `data-tutorial-id="list-days"`; the column strip `Time / Job / Crew / Status` and the four grid
  tracks (`minmax(110px,0.8fr)`, `minmax(180px,1.4fr)`, `minmax(160px,1fr)`, `auto`) → **kept
  exactly**, because `schedule-phone.css` maps `button > span:nth-child(1|2|3)` positionally to the
  phone grid-areas and adding or reordering a span silently scrambles it; the seven day heads
  `<Weekday long> · <Mon d>` with their three state classes; the holiday name appended as
  ` · <holiday>`; per row the start–end times, the job name + phase, the crew name + job location,
  and the status badge (`Ready to Start` → `Ready`); the live badge; the notice; the five-dot status
  legend (`aria-label="Schedule statuses"`); the alerts strip; and the unused `note` slot. **At
  ≤640px the column strip is `display: none` and each row becomes a two-column stacked card
  (`'time status' / 'job job' / 'crew crew'`) — preserved, and the eyebrow rule therefore only shows
  above 640px, which is correct.**
- **Every information item that is a chart:** none — the four KPI figures are the only quantitative
  visuals, and they are unchanged.
- **Every action placed:** the stepper, `This week`, `Schedule` → §3.8; the export menu **in the
  control row** with `buttonClassName="outline-button"`, filename `buildflow-list-<weekStartIso>`,
  the week window, `includeUnbooked: false` → §3.6 (**and the List's Export is passed no `disabled`
  prop, so it stays clickable with zero rows and writes a header-only CSV — preserved, raised in
  §13**); every filter and saved-view action → §3.4/§3.5; row drag onto another day section →
  `listRebook` `[{op:"move", id, date}]` with the conflict ask and the Undo (undone
  `<crew> on <job> back on <Mon d>`); a row dropped on its own day → no request; row click → the
  drawer, `aria-label="Open <job> for <crew>"`; every day section is a droppable including the empty
  ones; keyboard drag with its announcements; keys 1–6; alert click; `Undo`. **The row sort key is a
  display string** (`${day}-${job.startTime}` compared with `localeCompare`, so `10:00 AM` sorts
  before `7:00 AM`) — that is today's behaviour, the sub-line's "in time order" already overstates
  it, and **fixing it would change visible ordering**, so it is raised in §13 and not touched.
- **States:** *whole page* — `.schedule-list-empty` with `Nothing booked this week.` plus either
  `Book crews on the Schedule page and their days show up here.` or `No bookings match this week and
  these filters — step to another week or clear a filter.` → a centred block on the well's ground,
  strong at `--bf-app-section`, body at `--bf-app-row` capped `--bf-app-prose`. *Per day* —
  `Nothing booked — drop a booking here` (`.sched-list-quiet`, **pinned**) at `--bf-app-meta`
  `var(--wx-faint)` on a dashed `1px var(--wx-line-soft)` inset. *Saved views / alerts / feeds /
  drawer-links* → their own entries. *Loading* — no skeleton; `.is-pending` on the saving row;
  `Undoing…`; feeds `Loading…`. **`.is-busy` is applied to `.schedule-list-view` and has no CSS
  anywhere** — a dead hook; left dead (§13). *Errors* — the six strings listed, unchanged.
- **Motion:** three auroras, `dx-pulse`, `dx-fade-up`; no reveal, no cursor glow (`motion=false`).
  `sched-pending`, `sched-live-flash`. `.drop-over` → the inset 2px `--sc-concrete` ring + the day
  head's tint, kept. Hover: the wash + move 3. Cursors `grab`/`grabbing` kept.
- **Tests touched:** `pages.test.tsx` List #1 (**h1 `/List/`, exactly 7 `.sched-list-day`, the two
  row button names, 5 × `Nothing booked — drop a booking here`**) and #2 (the exact `rebookSchedule`
  payload and notice), `Continuity`, `Correct anywhere` (the holiday text), `Same export
  everywhere`, `Guided tour` (`list-days`, `list-page-title`), `rebook.test.ts`'s `listRebook`,
  `scale.test.tsx`'s `renders the List page`, `boundary.test.ts`, `tests/schedule.test.tsx`'s
  landing→List case, `dragKeyboard.test.ts`, `kpis.test.ts` — **all pass unchanged.** The binding
  constraints are all honoured: seven sections stay seven, the quiet copy stays, rows stay
  `<button>`s with their accessible names, and no span is added or reordered.

### 6.2 Kanban page (`#schedule/kanban`)

- **Today:** five lanes in a 5-column grid, each a `color-mix(--wx-bg-2 55%, --wx-card)` rectangle at
  radius 14px with a tone dot, an `h3`, a count pill and up to 24 cards. Cards are white rectangles
  at radius 12px.
- **Becomes:** the lane keeps its frame — **a lane is a drop target, so clause 1 licenses it** — and
  that is exactly the distinction the licence exists to draw: the lane is interactive, the KPI card
  is not. Lane: radius 14px → **18px**, fill `color-mix(--wx-bg-2 55%, --wx-card)` →
  `rgba(28,28,26,0.025)` (a wash on the ground rather than a second paper), `1px solid
  var(--wx-line-soft)`, no shadow (it is a well, not a card), `min-height: 220px` kept,
  `.drop-over` unchanged. Lane head: `h3` → the eyebrow, the count `<b>` → 999px at `--bf-app-micro`
  tabular in `--kan-tone` at 15%, the 8px dot kept. Cards keep their frames (clause 1 — draggable):
  radius 12px, rest `--bf-shadow-raised` (from `0 4px 12px /.05`), hover
  `translateY(var(--bf-lift-dense))` + `--bf-shadow-card-hover-dense` over `0.28s var(--bf-ease)`
  (from `-2px`/`0 14px 28px`/0.18s), `.dragging` `0 18px 34px rgba(28,28,26,0.2)` → the ladder's
  `--bf-shadow-pill` step, `.focused`'s inset ring kept. Card type: name 12.5/650 →
  `--bf-app-row-strong`/650; subtitle 11.5 → `--bf-app-micro`; the phase 11/600 → `--bf-app-micro`;
  the meta row's two items 11/500 → `--bf-app-micro` with its top hairline kept. `Show N more of M`
  → `.bf-pill` dashed.
- **Every information item placed:** eyebrow `Crew Scheduling · <n> jobs by status`; `h1 Kanban` +
  `data-tutorial-id="kanban-page-title"` + the release pill; the sub-line; **the filters note
  `The Kanban is the status view: every status stays on the board.`** (the only hint that a status
  filter set elsewhere is applied nowhere here) → `--bf-app-meta` capped `--bf-app-prose`; the four
  KPI cards — **still describing the shared week on a week-less board**, preserved as-is and raised
  in §13; board `aria-label="Jobs by status"` + `data-tutorial-id="kanban-lanes"`; the five lane
  headers with their exact labels `Planned / Ready / In Progress / Blocked / Complete`, their tone
  dots and their count pills; the five lane tones (slate/blue/violet/red/green → `--kan-tone`); per
  card the trade-coloured dot, the ellipsised name, the subtitle (project or location), the footer's
  phase + status badge, and the meta row's `CalendarDays` + the job's **planned start date** and
  `Users` + the bare `requiredLabor`; the card's `title="<job> · <phase>"`; the live badge; the
  overflow copy `Show <min(hidden,24)> more of <hidden>`; the notice; the five-dot legend and the
  Export button in the footer; the alerts strip; the saved views bar and the filter chips (**with the
  status chip suppressed**, `options.statuses === false`). **Preserved and named:** the lane label is
  not the status written (`Blocked` writes `DelayIQed`, so the card's badge never reads `Blocked`),
  the forward notice quotes the lane label while the undo notice quotes the raw status, and there is
  no legend anywhere on this page for the card's trade dot (the trade legend lives only on the
  Month).
- **Every action placed:** `Schedule` (the only control-row action — no stepper, no `This week`);
  card drag onto a lane → `kanbanMove()` + `updateJob(jobId,{status})`, with a drop into its own
  lane or off the board writing nothing; the notice's `Undo` → `updateJob(jobId,{status: previous})`;
  card click → the drawer; `Show N more of M` → +24 (and it only ever grows, resetting to 24 on
  remount or when the lane's contents change — preserved); the export menu **in the board footer**
  with filename `buildflow-kanban`, `includeUnbooked: true`, the shared week's days for
  `Print week sheets`, disabled while busy or with no jobs; the four filter selects, the chips and
  `Clear filters` (**the `Statuses` button and status chip are deliberately absent**); saved views;
  keyboard drag with announcements naming `the <lane> lane`; keys 1–6; alert click; the drawer's own
  actions.
- **States:** *no jobs in scope* — `.schedule-empty-state` with `No jobs match these filters.` +
  `Reset the filters, or add a new activity to start the board.` replacing the whole board → the
  centred block treatment. *An empty lane* — `Drop a job here` (`.sched-kan-empty`) at
  `--bf-app-meta` on a dashed inset, radius 10px → **12px**. *Saved views / alerts / drawer* → their
  entries. *Loading* — `.is-pending` on the saving card, Export disabled, `Undoing…`, feeds
  `Loading…`. *Errors* — as listed. No lock. **Preserved:** `.sched-kan-lane` has no internal scroll
  (`min-height: 220px`, the page grows), which is why `LANE_WINDOW` exists.
- **Motion:** lane `0.18s` background/shadow; `.drop-over`; card transitions on the signature curve
  already (`0.18s cubic-bezier(.22,1,.36,1)`) → `--bf-dur-move` `0.28s`; `sched-pending`;
  `sched-live-flash`; `dx-pulse`; the auroras. The existing reduce block cuts
  `.sched-kan-card` transitions to 0.01s — kept. Hover: move 1 on cards, 2 on the pills. No reveal.
  Responsive: the ≤1100px sideways scroller (`grid-auto-flow: column`, `minmax(184px,1fr)`) and the
  ≤900px `minmax(232px,1fr)` with overscroll containment → **unchanged**.
- **Tests touched:** `pages.test.tsx` Kanban #1 (**h1, the five `h3` labels in order, three jobs in
  the right lanes, `Drop a job here` in the empty Complete lane, and the DOM contract
  `.sched-kanban > section > header h3 + strong`**) and #2 (the `updateJob` calls and both notices),
  `scale.test.tsx` (**`.sched-kan-lane`, `header b` as the total, exactly 24 `.sched-kan-card`,
  `.sched-kan-more` reading `Show 24 more of N`**), `lanes.test.ts`, `statuses.test.ts`,
  `Continuity`, `Same export everywhere`, `Guided tour`, `boundary.test.ts` — **all pass
  unchanged**: the lane stays a `<section>` with a `<header><h3>` and a `<b>`, the card stays a
  `<strong>`-bearing button, and nothing is virtualised.

### 6.3 Matrix page (`#schedule/matrix`)

- **Today:** the cluster's one real chart — crew rows × day columns, four discrete heat levels
  (`load-0..3`, capped at 3) with a conflict overlay, plus a Load column with the week total and a
  three-band utilisation pill. Read-only: a cell opens the drawer for its first booking. The grid is
  framed at radius 16px with `overflow: visible` (doubled selector) so the tooltips are not clipped.
- **Becomes:** `.bf-well` with the **`overflow: visible` doubled rule kept exactly as it is** —
  re-adding `overflow: hidden` for rounded corners silently kills every tooltip, and the head's
  separate `border-radius: 16px 16px 0 0` re-round is the reason it works; both are re-declared at
  radius 18px in the same doubled form, with a comment saying why. Head: fill `--wx-bg-2` →
  **transparent**, `MON` + the `<em>` date + the corner `Crew` + `Load` → the eyebrow (from
  11.5/700/0.04em mut — a 3-property change). Rows: the top hairline re-inked; crew name
  13/650 → `--bf-app-row-strong`, the specialty `<em>` → `--bf-app-meta`. Cells: `min-height: 52px`
  **kept** (it sets how many crews fit a screen); the four heat fills and the conflict overlay
  **kept verbatim** (they are the encoding); the count `<b>` 22px radius 7px → **8px** (chip rung) at
  `--bf-app-micro` tabular; hover → the wash + a hairline brighten, **the inset `--sc-concrete` ring
  reserved for `:focus-visible`** (§1j), which also keeps the tooltip's reveal-on-focus honest. Load
  column: the per-row `color-mix(--wx-bg-2 40%)` fill → **transparent** with the left hairline kept;
  `<b>` 14px/750 → `--bf-app-stat` 14px/**700** tabular; the utilisation pill → 999px at
  `--bf-app-micro`, **its three trade-palette tones untouched** (they are shared with the Kanban dots
  and the crew-availability badges). Tooltip (`.sched-matrix-tip`) → radius 12px, `#1c1c1a` on
  `#fdfcf9` (the ink-pill step, `--bf-shadow-pill`), `--bf-app-micro`, capped `--bf-app-prose`.
- **Every information item placed:** eyebrow `Crew Scheduling · <weekRange>`; `h1 Matrix` +
  `data-tutorial-id="matrix-page-title"` + the release pill; the sub-line; the stepper readout; the
  four KPI cards; board `aria-label="Crew load for the week"` + `data-tutorial-id="matrix-grid"` +
  the `--matrix-cols` variable; the header row (corner `Crew`, seven day columns as `<b>` uppercase
  short weekday + `<em>` date label, final `Load`); the holiday name tag + recolour on a holiday
  column **and** the `.is-holiday` 9% tint on **every cell in that column**; `.is-off`'s 72% opacity
  on a non-working column; per row the crew name over the specialty; per cell the booking count as a
  `<b>` pill (nothing at zero), the `load-0..3` heat class and `.is-conflict`; **the cell's
  accessible name AND its visible `[role="tooltip"]` child** reading `<crew> · <day label>: <job
  names, comma separated>[ (conflict)]` or `<crew> · <day label>: open`, with `aria-describedby`
  pointing at `matrix-tip-<crewId>-<date>` and **no `title` attribute** — all four facts preserved
  exactly, because the test asserts the absence of the `title` as well as the presence of the
  tooltip; `.is-live`; the Load column's total and the utilisation pill with
  `aria-label="<n>% of working days booked this week"` and `title="Booked days this week over working
  days"`; the board footer's five-dot legend and the Export button; the alerts strip; the saved views
  bar, the filter selects and the `Statuses` button (the Matrix applies the full filter set); and the
  three grid tracks (`minmax(140px,1.1fr)`, `repeat(7, minmax(0,1fr))`, `84px`) with their ≤900px
  (110px / 64px, `<em>` hidden) and phone (124px sticky / 72px) variants → **unchanged**.
- **Every information item that is a chart:** the crew × day heat map with its four levels and the
  conflict overlay → kept; the per-row utilisation badge as a three-band gauge → kept; the four KPI
  figures → §3.14. **Nothing on the page explains the four heat levels or the three bands** — that is
  today's state; §13 proposes the one addition and does not make it here.
- **Every action placed:** the stepper, `This week`, `Schedule` → §3.8; cell click → the drawer for
  the **first** booking in that cell (a cell with none, or whose job is missing, does nothing) →
  unchanged; the export menu in the board footer (filename `buildflow-matrix-<weekStartIso>`, the
  week window, no unbooked rows, disabled when the week has no bookings) → §3.6; filters, saved
  views, keys 1–6, alert click, the drawer's actions; the cell tooltip revealed on hover **and**
  `:focus-visible`, so tabbing the grid narrates each cell → **kept, and the ring change above is
  what keeps the focus state distinguishable from hover.** **No drag anywhere on this page**
  (`MatrixPage` passes no `drag`, so the frame renders no `DndContext`), and the cursor stays
  `pointer` while Week/List/Kanban are `grab` — that affordance difference is preserved deliberately,
  because the Matrix looks like the Week board and is not draggable.
- **States:** *no crews in scope* — `.schedule-empty-state` with `No crews match these filters.` +
  `Add a crew, or reset the filters to see the allocation matrix.` replacing the grid. *An empty
  crew-day* — a bare cell whose accessible name ends `: open`; no per-cell copy. *Saved views /
  alerts / feeds / drawer* → their entries. *Loading* — no skeleton, **no per-cell pending state**
  (nothing is written from the grid), `Undoing…` and `busy` only via the drawer path, feeds
  `Loading…`. *Errors* — the drawer's save failure, the declined double-book, feeds and clipboard.
  No lock.
- **Motion:** cell `0.16s` background/shadow; the tooltip's fade (its reduce guard at
  `schedule.css:2181` removes the transition and **keeps** the tooltip — correct, kept);
  `sched-live-flash`; `dx-pulse`; the auroras. **No entry animation on rows or cells** (unlike the
  Month) — kept. Hover: the wash only; no lift (the grid is not a card and a cell is not a card).
  No reveal.
- **Tests touched:** `pages.test.tsx` Matrix #1 — the strictest DOM contract in the cluster: a button
  named `Concrete Crew 1 · Jun 15: Riverside Office Building` whose `[role='tooltip']` child has that
  same text, whose `aria-describedby` matches the tooltip id, and which has **no `title`**; plus a
  second cell button, a `: open` cell, `.sched-matrix-total b === "1"`, and `.sched-matrix-util`
  containing `%` with `aria-label` matching `/^\d+% of working days booked this week$/`. **Passes
  unchanged** — both pinned classes survive, no `title` is added, and the tooltip stays a child of
  the button (which means its text stays part of the cell's spoken name; a richer tooltip would
  lengthen every cell's accessible name, so the tooltip copy is not touched). Also `Correct
  anywhere`, `Continuity`, `Same export everywhere`, `Guided tour`, `kpis.test.ts`,
  `scheduleUtils.test.ts`, `scale.test.tsx`, `boundary.test.ts` — all unchanged.

---

## 7. Gantt Chart page

### 7.1 Gantt Chart page (whole page shell)

- **Today:** the one schedule page that does **not** render `SchedulePageFrame` (and
  `boundary.test.ts` #4 encodes that exemption). It keeps the index-page chrome —
  `.page-stack.gantt-page.hs-index > .hs-index-main > .hs-index-card.gantt-card` — and re-assembles
  the shared pieces itself, on the `--hsx-*` palette whose ink is `#14203a`. It therefore has **no**
  eyebrow, no sub-line, no aurora field and no cursor glow: five pieces of chrome its six siblings
  have.
- **Becomes:** the same DOM, re-valued. **The whole page re-skins through §1i's eight `--hsx-*`
  values in two blocks** — `.gantt-page` and `.gantt, .gantt-menu` (the portalled menu needs its own
  copy or it loses every colour) — which is what makes this the cheapest surface in the cluster
  despite being the most complex. On top of that: `.hs-index-card.gantt-card` → `.bf-panel` (radius
  18px, `--bf-shadow-card`, padding `16px 18px 14px` → `20px 20px 18px`); `h1.hs-index-title` →
  `--bf-app-display` (27–38px) / 600 / `-0.02em`, which brings the Gantt's title onto the same rung
  as its six siblings (today it inherits `hs-index.css`'s 22px/650 `#14203a`) — **the single most
  visible change on this page, and the one that makes the seven pages read as one product**; the
  release pill beside it keeps its `.hs-page-tag new|beta` classes and its tone; `.hs-index-actions`
  buttons (`Today`, `Export`, `Schedule`) → `.bf-pill`; `.gantt-toolbar` keeps its wrapping flex and
  its `.sched-filters { flex: 1 1 100% }` rule; `.gantt-seg` → a 999px pill group (radius 10px →
  999px, the `border-left` between buttons kept as the divider, `.active` →
  `rgba(47,107,255,0.10)` + `#2f6bff` + 650); the zoom cluster's `Minus`/`Plus` → 30px icon buttons
  at radius 12px with `--bf-focus-ring`, and `.gantt-zoom-value`'s `tabular-nums` + `min-width: 46px`
  **kept** (it is what stops the toolbar shifting); `.gantt-legend` → the eyebrow with 9px dots,
  `margin-left: auto` kept; the notice → §3.9; the CPM band → §3.3; the cap note → below; the chart
  frame → §7.2; `.gantt-note` → `--bf-app-meta` capped `--bf-app-prose`; the alerts strip → §3.7;
  and the KPI wrapper `.sched-rx.gantt-shared` → §3.14 (which is why one rule set covers all seven
  pages). `.bf-tail` under the alerts strip.
- **Every information item placed:** `h1 Gantt Chart` (`id="gantt-index-title"`,
  `data-tutorial-id="gantt-page-title"`) and the release pill (**including its legitimate "no pill"
  state** once the v3.8 entry ages past `NEW_TAG_DAYS`); the four KPI cards with their icons, tones,
  values, deltas and tooltips; the range labels `Week / Day / Month / Quarter`; the Week-range window
  label `<MMM d> – <MMM d, yyyy>` in a `<strong>` with its `aria-label`; the zoom readout `<n>%`
  with `aria-live="polite"` and its six steps; the status legend (`aria-label="Status legend"`, one
  swatch + name per status **actually present** among the visible jobs, in `STATUSES` order, coloured
  from `STATUS_PALETTE`); the notice in all of its shapes; the CPM band's four stats; **the row cap
  note** `Showing the 300 jobs nearest today of <N> — filter by project, crew or week to see the
  rest.` (`.gantt-status.gantt-cap-note`, `role="status"`) → `--bf-app-meta` `var(--wx-faint)`,
  class **pinned**; the footer help paragraph, verbatim: *"Drag a bar to move a job, drag either edge
  to change its dates, right-click a bar for actions — including linking it to the job that follows
  it. Arrows are dependencies — red on the critical path; a faint striped bar behind a job is its
  baseline. Flags mark each project's target completion and the workspace's holidays."*; the alerts
  strip's four alerts with their icons, titles, details and ages; the filter row's four select values
  and the `Statuses` counter; the saved-views bar. **Also recorded, unchanged:** `LINK_KEYS.gantt` is
  filters-only, so `Copy link to this view` does **not** reproduce the week here even though the
  menu hint says "this week" — preserved, raised in §13; and `range`/`zoom` live only in
  localStorage (`gantt:range` defaulting to `monthly` on desktop and `week` on a narrow viewport,
  `gantt:zoom` defaulting to 100) and never travel in a link.
- **Every action placed:** `Today` (`Crosshair`, `title="Scroll to today"`, and **re-pressable**
  because it carries a nonce); the export menu (`buttonClassName="hs-btn"`, filename
  `buildflow-gantt`, sheetTitle `Crew week sheets`, `includeUnbooked: true`) → §3.6; `Schedule`
  (`CalendarDays`, `title="Back to the Schedule overview"`); the four range buttons (`aria-pressed`,
  `.active`, persisted); the Week-range stepper + `This week` (hidden when already there) → §3.8;
  `Zoom out` / `Zoom in` (both disabled in Week range, where zoom deliberately cancels out of the
  fitted-column maths, and at the ends); every filter and saved-view action; bar body drag → move the
  job; left-edge drag → the start only (clamped); right-edge drag → the finish only (clamped); bar
  click → the drawer; Enter/Space on a focused bar → the drawer; right-click a bar → §7.3;
  sidebar-row click or Enter/Space → the same drawer (`.is-selected` while open) — **the only
  keyboard path to the drawer anywhere in the cluster, which is why the sidebar row must stay a
  focusable `role="button"`**; hover a bar → the two edge handles appear; horizontal scroll → pan,
  with the infinite prepend/append and its `pendingShift` compensation (disabled in fitted Week
  mode); vertical scroll → row windowing; keys 1–6; Escape → close the drawer (only when no link
  dialog or alertdialog is above); alert click; `Re-baseline`; hover a marker pill → its date. All
  untouched.
- **States:** *chart empty* — `.gantt-empty` replaces the whole provider with `Nothing to chart
  yet.` + either `Add jobs from the Schedule page and they show up here as bars.` or `No jobs match
  these filters.` → the centred block treatment at `--bf-app-row`/1.5 capped `--bf-app-prose`.
  *Legend* omitted when no visible job has a status. *CPM band* omitted when no job has both dates.
  *Saved views / alerts / drawer-links / feeds / link-dialog* empties → their entries.
  `GanttSidebarEmptyRow` exists and is never rendered by this page — kept dormant. *Loading* — no
  page skeleton; `Saving…` on Re-baseline and on the drawer; `Undoing…`; feeds `Loading…`; the
  pre-measurement window of exactly `DEFAULT_VISIBLE_ROWS` (24) rows with `.gantt-row-spacer` blocks
  of the exact height; and the optimistic `overrides` repaint of a dragged bar. *Errors* — the six
  `.gantt-status.is-error` strings, the CPM cycle band (§3.3), the refused move, the drawer's two
  validation lines, the feeds failure, and a refused link. No add-on lock.
- **Motion:** `hsg-rise` on `.gantt-frame` (0.5s), on `.gantt-page .hs-kpi` (**dead — the grid
  renders `.kpi-card`**) and on `.gantt-status` (0.36s) — names kept, re-timed to `var(--bf-ease)`,
  shift 10px → 8px; `hsg-lift` (the pick-up spring) and `hsg-land` (the 0.75s landing pulse with its
  expanding blue ring) → **kept exactly**, since they are the Deals board's tween and the only
  feedback that a drop landed; `hsg-fade`/`hsg-slide-in` (§3.12); `hs-pop` on `.gantt-drag-tip` and
  `.gantt-menu`; the `.gantt-handle span` opacity reveal; the marker-pill date reveal; `grabbing`
  cursor while dragging; the live drag tooltip `<MMM d> – <MMM d, yyyy>`. Hover moves: 1 is
  **explicitly not** applied to bars (a bar is positioned by absolute pixel maths and a
  `translateY` would break the arrow overlay's `getBoundingClientRect` measurement) — instead the
  bar keeps its own border-swap-plus-`0 6px 16px` lift, re-inked; 2 on every pill; 3 on the sidebar
  rows. **No `data-reveal` on this page and none added.** Skeleton: the 24-row pre-measurement
  window is the skeleton, and `.gantt-row-spacer` has **no CSS rule anywhere** (inline height,
  `aria-hidden`) — so a stylesheet cannot restyle it and none tries.
- **Tests touched:** `pages.test.tsx` Gantt #1 (h1 `/Gantt Chart/` + a name per job), the shared
  KPI/alerts case, the bar-menu link/unlink case, the holiday-flag case
  (`getByText('Juneteenth (observed)').closest('.gantt-marker')` has `is-holiday`), the drawer
  keyboard case, the `notice()` helper, `Same export everywhere`, `Continuity`, `Guided tour`
  (`gantt-timeline`); `scale.test.tsx`'s three Gantt cases (root `.gantt-frame`, ≤300
  `[data-feature-id]`, the cap-note regex, ≤24 bars with matching `.gantt-sidebar-item` count and
  every `.gantt-row-spacer` height matching `/^\d+px$/`); `GanttDependencyLinks.test.tsx`;
  `ganttLinks.test.ts`; `viewKeys.test.ts`; `useScheduleContext.test.ts`; `boundary.test.ts` — **all
  pass unchanged.** Two hard rules make that true: the `.gantt-frame` height clamp
  `clamp(420px, calc(100vh - 336px), 900px)` **stays, and the 336px must be re-measured after the
  card padding and the h1 both change** (the h1 goes from 22px to up to 38px, so the chrome above the
  chart grows by ~16px at 1440px: the clamp becomes `calc(100vh - 352px)` and the number is verified
  in the browser, not guessed); and no rule may change `.gantt-feature`'s wrapper structure,
  `.gantt-feature-list`'s class, or the `top: var(--gantt-header-height)` offset the arrow `<svg>`
  is positioned from.

### 7.2 Timeline chart body (the ported roadmap-ui Gantt)

- **Today:** `components/ui/gantt.tsx` (1,158 lines) — a dependency-free port composed 1:1 with the
  original, publishing five CSS custom properties and driving everything from absolute pixel maths.
  It is also the schedule area's **date library** (`toIsoDate`, `parseIsoDate`, `startOfDay`,
  `addDays`, `formatDate` are imported by `week.ts`, `alerts.tsx`, `JobDrawer.tsx`, `page.tsx`).
- **Becomes:** **not restructured at all.** This is the one surface where the 21st.dev porting recipe
  has already been applied, and re-porting it would put every test in `GanttDependencyLinks.test.tsx`
  and `scale.test.tsx` at risk for a colour change. The re-skin reaches it entirely through (a) the
  eight `--hsx-*` values on `.gantt, .gantt-menu` (§1i) and (b) the existing `--gantt-*` custom
  properties. Concretely: `.gantt` ground `--hsx-paper` `#f5f6fa` (unchanged value, now the same
  ground as the page); `.gantt-sidebar` `#fff` with its `position: sticky; left: 0; z-index: 30`
  untouched; the sidebar header → the eyebrow; sidebar rows → `--bf-app-row`/500 with the meta line
  at `--bf-app-micro`, hover `--hsx-hover` (now `rgba(28,28,26,0.035)`), `:focus-visible` inset ring
  kept, `.is-selected` `--hsx-blue-soft`; the timeline header blocks → the eyebrow, weekend
  `.is-secondary` shading re-inked to `rgba(28,28,26,0.025)`; `.gantt-column` hairlines →
  `var(--wx-line-soft)`'s value; bars keep `--gantt-bar-fill/-edge/-ink/-dot` from `STATUS_PALETTE`
  **unchanged** (it is shared with the badges and the board cards, so re-toning here re-tones three
  other views), radius to 8px (chip rung, from the current value), the progress overlay's 0.35
  opacity kept, `.is-critical`'s red border + inset ring + 4px left cap kept; `.gantt-ghost`
  re-inked (§1f); the arrow layer's grey `rgba(87,85,80,0.55)` → `rgba(28,28,26,0.45)` and the
  critical red unchanged; markers → 999px pills at `--bf-app-micro`.
- **Every information item placed:** the twelve-part composition (`GanttProvider`, `GanttSidebar` +
  its header/group/item/empty-row, `GanttTimeline`, `GanttHeader`, `GanttFeatureList` +
  group + item, `GanttMarker`, `GanttToday`, `GanttContextMenu`, `GanttColumns`/`Column`,
  `GanttAddFeatureHelper`, `GanttCreateMarkerTrigger`, `GanttRowSpacer`) → untouched; the geometry
  props (`sidebarWidth` **104** on a narrow viewport / 300 desktop — the record's corrected number —
  and `rowHeight` 46/36, `headerHeight` 56); the column widths (150/100/50 × zoom, and the fitted
  Week formula); the five published custom properties; the root class set
  (`is-daily|is-monthly|is-quarterly`, `is-dragging`, `is-fitted`, `is-auto-height`); the timeline
  data model; the bar `title="<job> · <MMM d> – <MMM d, yyyy>"`; the sidebar's `Jobs` / `Duration`
  header and, per row, the status dot, the ellipsised name with its `title`, the meta line (crew
  names + `critical` or `<n>d float`) and the trailing duration; the three header forms (Day/Week:
  `MMMM yyyy` + day number + single-letter weekday with Sat/Sun shading; Month: `<year>` + 12 month
  cells; Quarter: `Q<n> <year>` + 3 month cells); every chart series listed in §7.1; the marker set
  (per-project `<Project> target`, per-holiday `.is-holiday` with the holiday name, and the `Today`
  line). **The three dormant capabilities stay dormant and styled** —
  `GanttAddFeatureHelper` (`title="Add on <MMM d, yyyy>"`, needs `onAddItem`),
  `GanttCreateMarkerTrigger`, `GanttMarker`'s `onRemove` context menu with `Remove marker`
  (`Trash2`, danger) — plus `onDragMove`, `resizable={false}`, `children`, `GanttSidebarGroup`'s
  `action`/`meta`, `GanttSidebarItem`'s `trailing`, `GanttHeader`'s `className`,
  `GanttContentHeader` and `elementUnderPointer`, and the unused marker tones
  `tone-amber/red/green`. None is deleted (easy to lose by mistake) and none is switched on.
- **Every action placed:** the single pointer-capture drag with three zones and a 4px threshold; the
  per-range snapping; `pointercancel` reverting the draft; Enter/Space to select; right-click →
  §7.3; the infinite scroll with `pendingShift`; scroll anchoring at `anchorFraction` 0.3 (0 in
  fitted mode, where a week step parks the Monday on the left edge); `scrollRequest {date, nonce}`.
  All untouched. **Rule:** `user-select: none` on the whole `.gantt` stays — "fixing" it to allow
  copying job names would break the drag threshold.
- **States:** `GanttSidebarEmptyRow` (dormant); the pre-measurement 24-row window; the
  `ResizeObserver` feature-detect (jsdom has none) → all untouched.
- **Motion:** `hsg-lift`, `hsg-land`, `hs-pop` on the drag tip, the handle-opacity transition, and
  the `grabbing` cursor — names and values kept, already nulled in the `schedule.css:5188` reduce
  block. Hover: the bar's own border-swap (not move 1 — see §7.1), move 3 on sidebar rows.
- **Tests touched:** `GanttDependencyLinks.test.tsx` (one `.gantt-links > path`, its `<title>`,
  `is-critical`, and the `d` regex), `scale.test.tsx`'s import of `DEFAULT_VISIBLE_ROWS` and its row
  window assertions, plus every consumer of the exported date helpers — **all pass unchanged, because
  no JS in this file is touched.**

### 7.3 Bar context menu

- **Today:** a portal to `document.body`, `.gantt-menu.hs-menu`, `role="menu"`, up to eight items.
- **Becomes:** radius 10px → **18px** (floating-panel rung), `#fff`, `1px solid var(--wx-line-soft)`,
  `--bf-shadow-float`, `hs-pop 0.22s var(--bf-ease)`; items → `.bf-row` at `--bf-app-row-strong` with
  16px `var(--wx-faint)` icons and move 3 on hover; `.is-danger` keeps `var(--wx-red)`.
  **It must keep its own `--hsx-*` block** (§1i) because it is portalled outside `.gantt-page`.
- **Every information item placed:** `Open details` (`PencilLine`); `Mark complete` (`CheckCircle2`,
  disabled when already Complete); `Link to another job…` (`Link2`); up to **4** `Unlink <other job
  name> (<FS|SS|FF|SF>)` items (`Unlink`, danger) — built from `page.dependencies`, i.e. **every link
  in the plan, so a bar can offer an unlink for a dependency whose arrow is not drawn** (preserved);
  `Open in Schedule` (`ExternalLink`).
- **Every action placed:** `Open details` → the drawer; `Mark complete` → `patchJob(job,
  {status:'Complete'}, '<Job> marked complete')`; `Link to another job…` → §3.13; each `Unlink` →
  `deleteDependency` + the Undo notice; `Open in Schedule` → `onOpenSchedule()`; Escape, outside
  `pointerdown` (capture), any scroll (capture) and a window resize all close it; the layout-effect
  clamp keeps it on screen. Unchanged. **Preserved scope:** only a bar intercepts `contextmenu` —
  right-clicking the grid, the sidebar, a marker or the header falls through to the browser menu.
- **States:** never opens with zero items (the four fixed ones always exist).
- **Motion:** `hs-pop` (name kept), nulled in the existing reduce block.
- **Tests touched:** `pages.test.tsx`'s link/unlink case (`fireEvent.contextMenu` on `.gantt-ctx`,
  then `getByRole('menuitem', {name: /Link to another job/})` and `/Unlink … \(FS\)/`) — passes
  unchanged; `.gantt-ctx` is pinned.

---

## 8. Three surfaces the records' completeness checks added

### 8.1 The printed crew week sheet (`export.ts` `weekSheetHtml`)

- **Today:** a standalone print document with its **own embedded stylesheet** — `@page margin 14mm`,
  Inter/system-ui 13px, `#14203a` ink, `#c5221f` conflicts, `#a5adbf` for the free dash — printed
  through a hidden `srcdoc` iframe that is removed after 60s, so the browser's own print dialog is
  the save-as-PDF step. **Not one rule of it is in `schedule.css`, and it shares nothing with the
  app's tokens.**
- **Becomes:** the same document, on the same six tokens as the screen, because a foreman's printout
  carrying the pre-blue navy ink while the app carries `#1c1c1a` is the most literal possible failure
  of "one product". Six values change inside the embedded `<style>`: ink `#14203a` → `#1c1c1a`;
  the `th` day label → the eyebrow (11.5px/650/`0.045em`/uppercase, `#6b6862`) with its `118px`
  `nowrap` width kept; `1px` rules → `rgba(28,28,26,0.13)`; the job block's name to 13px/650 and its
  two meta lines to 12px `#575550`; conflicts stay `#c5221f`; the free dash `#a5adbf` → `#6b6862`.
  `@page margin 14mm` and every `page-break-after: always` stay. **No web font is loaded** — the
  stack stays `Inter, system-ui` so an offline print does not stall.
- **Every information item placed:** one `<section class="sheet">` per crew with
  `page-break-after: always` (last one `auto`); `h1` = crew name; the sub line
  `<crew.specialty> · foreman <crew.lead> · <Mon, Jun 22 – Mon, Jun 28>` (`dayLabel` =
  `Mon, Jun 22`); a `<table>` with one `<tr>` per day, `<th>` = `dayLabel`, `<td>` holding one
  `.job` block per booking — `<strong>` job name, `<project> · <phase>`,
  `<startTime> – <endTime> · <location>`, and conflicts as a red `<em>`; `<div class="free">—</div>`
  for a day with nothing booked; the footer `<sheetTitle> · printed <M/D/YYYY>`. Per-page
  `sheetTitle`s kept as they are: `Week of <weekRange>` from the landing, Week, List and Matrix;
  `Crew week sheets` from the Month, Kanban and Gantt.
- **Every action placed:** reached only from Export → `Print week sheets` (§3.6). No control inside
  the document.
- **States:** a crew with an empty week still gets a sheet, all seven rows reading `—`. No loading or
  error surface (the browser's print dialog owns both).
- **Motion:** none, by definition. `@media print` needs no reduced-motion guard.
- **Tests touched:** `export.test.ts`'s `quotes CSV cells and prints a sheet per crew` — asserts
  structure, not styling; passes unchanged. Added to the §12 manual list (print to PDF at Letter and
  A4).

### 8.2 The CSV export document (`export.ts` `EXPORT_COLUMNS`)

- **Today:** a fixed 15-column contract shared by every page: **Date | Day | Crew | Job | Project |
  Phase | Status | Start | End | Labour | Hours | Location | Equipment | Materials | Conflicts**.
  Every cell double-quoted with `""` escaping; `Day` is `weekdayShort`; `Hours` is
  `bookingLaborHours(job)` for a booked row; `Conflicts` is `assignment.conflicts.join('; ')`; rows
  are one per booking in the window, sorted by day then crew name. `includeUnbooked` (Kanban, Month
  and Gantt) appends a row per unbooked job with empty Date/Day/Crew/Conflicts and
  `Hours = jobShiftHours`.
- **Becomes:** **byte-identical.** A CSV has no design language, the header line is pinned by
  `pages.test.tsx:828`, and any change here is a data change. It is inventoried so that "the export
  is part of the redesign" can be answered with "no, and here is why".
- **Every information item placed:** all 15 columns, in that order, unchanged; the per-page
  filenames (`buildflow-schedule-<weekStartIso>`, `-week-<Monday>`, `-month-<YYYY-MM>`,
  `-list-<weekStartIso>`, `-matrix-<weekStartIso>`, `-kanban`, `-gantt`) unchanged; the per-page
  windows and `includeUnbooked` flags unchanged.
- **Every action placed:** Export → `Download CSV`, and its singular/plural notice.
- **States:** the List writes a header-only CSV with zero rows (its Export is never disabled) —
  preserved, §13.
- **Motion:** none.
- **Tests touched:** `export.test.ts:32/55/62` and `pages.test.tsx:813/828` — untouched.

### 8.3 The guided-tour overlay as it appears on these pages

- **Today:** `App.tsx` renders `section.buildflow-tutorial-overlay` (`aria-label="BuildFlow
  tutorial"`) with a spotlight cut-out positioned from `--tutorial-spotlight-top/left/width/height`
  plus `aside.buildflow-tutorial-panel` (`role="dialog" aria-modal="false"`). **Eight stops land on
  this cluster** and their geometry, not just their anchors, is load-bearing.
- **Becomes:** the overlay itself belongs to the shell cluster; **this cluster owes it three
  guarantees**, all of them constraints on the new stylesheet rather than changes to the overlay:
  1. **All 23 `[data-tutorial-id]` anchors stay on the same elements** (§1k lists them).
  2. **No new `transform`, `filter`, `backdrop-filter`, `contain` or `will-change` on an ancestor of
     any anchor**, because the scrim is drawn as a 9999px `box-shadow` and a new containing block
     mis-places the light. This is why §1j retires `DxTilt`'s `rotate` by setting
     `transform: none` rather than by wrapping anything, and why the aurora field (which is a
     positioned sibling, not an ancestor) is safe.
  3. **No anchor is shrunk or wrapped** — the spotlight frames `.sched-views` and the `.ss-strip` by
     `getBoundingClientRect`, so removing the `.ss-strip`'s frame (§3.2) changes what the light
     traces. That is a deliberate, accepted change (the strip's content box is unchanged; only its
     border and shadow go), and it is on the §12 browser-check list.
- **Every information item placed:** `Step N of M` + a rounded percentage; the
  `.buildflow-tutorial-meter` progress bar; the step `h2` and `<p>`; the optional
  `.buildflow-tutorial-requirement` (`role="status"`) that keeps `Next` disabled; the
  `.buildflow-tutorial-lessons` chip strip with its active/done classes; and the actions
  `Skip Tutorial` / `Back` (disabled on the first step) / `Next` or `Finish`. Plus the eight stops'
  copy, unchanged: `schedule-landing` (*The whole plan, at a glance* — "Schedule is the landing:
  status, alerts, field variances, the unbooked queue, and a card for each view. Press 1 to 6
  anywhere in Schedule to jump between the views; ⌘K finds any page."), `schedule-status`,
  `schedule-filters` (on page `week`), `month-view` (`month-calendar`), the List / Kanban / Matrix
  stops, `gantt-timeline`, plus `App.tsx`'s three `week` steps (`schedule-overview` →
  `schedule-board`, `open-job-form` → `schedule-add-job-button` with the requirement `Open the Add job
  to schedule form to continue.`, `submit-job` → `schedule-job-dialog` with `Create and schedule a
  job to continue.`) and the add-on-gated `product-schedule-ai` step on `schedule-alerts`.
- **Every action placed:** the four panel controls — shell-owned, untouched. **Preserved defect:**
  `useScheduleViewKeys` bails while any visible `[role="dialog"]` exists, and the tutorial panel is
  one — so while the tour says "Press 1 to 6 anywhere in Schedule", pressing 1–6 does nothing.
  Recorded, unchanged, raised in §13.
- **States:** the gated steps' `requirement` line and the disabled `Next`.
- **Motion:** `hs-upd-pulse` (the What's-new spotlight, 1.1s ×3 over 4.2s) already has its reduce
  escape at `hs-update-modal.css:198` — untouched.
- **Tests touched:** `pages.test.tsx:431` and the six per-page `Guided tour` cases assert every stop's
  anchor exists on its page — **pass unchanged**, and §12 adds the corrected anchor count (23 in this
  cluster, of which only 8 are present on the landing at rest: `schedule-status-band`,
  `schedule-filters`, `schedule-filters-button`, `schedule-saved-views`, `schedule-first-run`,
  `schedule-views`, `schedule-digest`, `schedule-alerts` — `schedule-board` cannot be on the landing,
  which passes `board={false}`, and the two job-dialog anchors exist only while the picker is open).

---

## 9. Tests touched — every file, with a verdict

**Expected changes to existing test files: zero. One new test file is added (§12).** The whole
cluster is delivered as one stylesheet plus five additive `className` strings inside `schedule/`,
and nothing is renamed, reordered, wrapped or unmounted.

| Test file | Cases that touch this cluster | Verdict |
|---|---|---|
| `schedule/pages.test.tsx` | Schedule landing (:401, :431, :441, :448, :473, :478, :489, :517, :544, :553, :564, :571), Week (5), Month (2), List (2), Kanban (2), Matrix (1), Gantt (5), Conflicts (3), Transactional writes (1), Links from the drawer (2), Same export everywhere (2), Copy link (1), Correct anywhere (1), Continuity (1), Guided tour (2) | **passes unchanged** — every assertion is on a class name, an accessible name, a role, a count or a payload; §1k pins all of them |
| `schedule/scale.test.tsx` | all seven `renders the <name> page` cases + the Week lazy-row case + the Kanban lane-window case + the three Gantt cases | **passes unchanged**; also the cluster's perf gate — node counts must not rise (they fall: six fills leave every Matrix row, four frames leave every KPI strip) |
| `schedule/boundary.test.ts` | all 6 (see §0.1 for what they really assert) | **passes unchanged**; the new `.css` at `src/` root is outside its `{ts,tsx}` glob |
| `schedule/cpm.test.ts` | 5 | unchanged (pure logic) |
| `schedule/filters.test.ts` | 5 | unchanged |
| `schedule/statuses.test.ts` | 2 | unchanged |
| `schedule/savedViews.test.ts` | 4 | unchanged |
| `schedule/export.test.ts` | 3 | unchanged |
| `schedule/rebook.test.ts` | `weekRebook` ×5, `monthRebook` ×4, `listRebook` ×1 | unchanged |
| `schedule/week.test.ts`, `month.test.ts` | date/grid maths | unchanged |
| `schedule/kpis.test.ts` | 4 | unchanged |
| `schedule/alerts.test.ts` | 2 | unchanged |
| `schedule/conflicts.test.ts` | `clashesOf` / `clashSentence` / `withConflictAsk` | unchanged |
| `schedule/dragKeyboard.test.ts` | 2 | unchanged |
| `schedule/lanes.test.ts` | 4 | unchanged |
| `schedule/viewKeys.test.ts` | 4 | unchanged |
| `schedule/useScheduleContext.test.ts` | hash + legacy `?view=` | unchanged |
| `schedule/live.test.ts` | 3 | unchanged — `.is-live` and `.sched-live-by` both survive |
| `schedule/commands.test.ts` | 1 | unchanged |
| `schedule/linkBookmarks.test.ts` | 4 | unchanged |
| `schedule/scheduleUtils.test.ts` | `cellKey` / `indexAssignmentsByCell` | unchanged |
| `schedule/ganttLinks.test.ts` | 2 (exact path strings) | unchanged — no bar geometry moves |
| `schedule/GanttDependencyLinks.test.tsx` | 1 | unchanged — the `.gantt-feature[data-feature-id]` / `.gantt-feature-list` structure and the header offset are frozen |
| `schedule/ScheduleImportDialog.test.tsx` | 3 | unchanged |
| `tests/schedule.test.tsx` | :63, :93, :128, :147, :167, :199, :227 + the Settings-from-Week case + `openScheduleView()` (which needs the rail menuitem named `^List\|Kanban\|Matrix( New\| Beta)?$` and the `h1` to start with that word) | **passes unchanged** — the seven `h1` strings and the rail item names are untouched |
| `test/appHarness.tsx` | `openSchedule()` awaits `findByRole('heading', { name: 'The whole plan, at a glance.' })` | **not a test but the reason the landing H1 string and its `<em>` are frozen.** Changing that heading breaks every test in every area that opens Schedule |
| `tests/settings.test.tsx` | :104 / :108 assert the same heading is absent inside Settings and present after `Close settings` | unchanged, for the same reason |
| **new:** `schedule/density.test.ts` | see §12 | **added** |

The two surfaces with **no** test coverage at all in this cluster — the field-variance review queue
(§4.2, the densest block on the landing) and the Upcoming Milestones panel (§4.6), plus the footer
policy dialogs (§4.10) and the Month day summary (§5.4) — are covered by the manual walkthrough in
§12 instead, item by item against their lists above.

---

## 10. Build order

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append the `--bf-app-*` block and `--bf-shadow-card-hover-dense` / `--bf-lift-dense` to `design-tokens.css`; re-base `--bf-focus-ring` to the `#2f6bff` alpha | 1 | none — additive tokens, pixel-inert until read |
| **B** | Create `client/src/schedule-daylight.css` with the §1k pin-list header and the nine `.bf-*` primitives; add its one import line to `main.tsx` after `app-shell-daylight.css` | 2 | none — deleting the import reverts the cluster |
| **C** | Tokens and inks: delete `--wx-serif` from the `.sched-rx` block (`schedule.css:679`) — **verified inert in this cluster: `grep -c 'var(--wx-serif)' schedule.css` returns 0, so the declaration is dead weight with no read to rewrite**; the eight `--hsx-*` values on `.gantt-page` **and** on `.gantt, .gantt-menu`; the 13 navy shadow literals → ink at ladder alphas; the 4 navy ink literals; the `dx-dot` focus alpha | 1 edited | low — verified counts, all in one file |
| **D** | The eyebrow rule across its eleven sites; the frameless figure rows (KPI strip, status strip, CPM band, drawer facts, variance metrics, import stats); the `bf-figures`/`bf-figure` classNames in `parts/shared.tsx` | 1 new + 1 | low — the one JSX edit is two additive class strings |
| **E** | Frames and hover: `.bf-panel` / `.bf-well` / `.bf-rows` / `.bf-card-nav`, the three pill variants, the four→three hover moves, the `transform: none` that retires the tilt, the hover-ring→focus-ring correction on the List and the Matrix | 1 new | low, CSS only |
| **F** | The six pages' specifics: the Week header and cards, the Month chips and month bar, the List thead/day-heads and the missing `.list-page` block, the Kanban lanes and cards, the Matrix head/Load/tooltip (with the doubled `overflow: visible` re-declared), the Gantt toolbar/legend/card/`h1` | 1 new | **medium** — one browser pass per page at 1440 / 1024 / 768 / 375 |
| **G** | Motion: reveal 12px/0.55s/50ms; `useHudMotion` `0.16` / `-6%`; the `schedCellIn` reduce guard; the `:focus-within` extension on the Month `+`; every duration re-timed onto the four interaction tokens | 1 new + `useHudMotion.ts` | low — `useHudMotion` is two numbers, ten page roots, no test |
| **H** | The print sheet's six embedded values; the two gradient rulings (`.ss-project-track i` flat, `.sim-band-range` re-based) | `export.ts` + 1 new | low — `export.test.ts` asserts structure, not colour |
| **I** | **Re-measure `.gantt-frame`'s `calc(100vh - 336px)`** against the new card padding and `h1` size, in the browser, and write the verified number | 1 | **must not be guessed** |
| **J** | Add `schedule/density.test.ts` (§12); run the ordered suite | 1 new test | low |

Phases A–B are inert. C–H are each revertable independently. I is the one number that has to be
measured rather than reasoned. Nothing in the sequence requires the shell cluster to have landed
first, except the two cross-cluster seams in §12.

---

## 11. Acceptance

1. The full suite passes with **zero** edits to existing test files, and `density.test.ts` passes.
2. A computed-style diff over the 38 screens shows: every colour, radius, shadow and easing changed
   on the surfaces §3–§8 name; and **no font-size, row height, grid template, cell min-height or
   `touch-action` changed** on the frozen list — the Week grid templates (×3), the Week header 42px,
   the Month cell min-heights (×4), the Matrix cell 52px and its three tracks, the List's four
   tracks, `--gantt-row-height` 36/46, `sidebarWidth` 300/104, `DASH_*` (untouched by definition),
   and every selector in the §1l phone-contract list.
3. A manual walk of the four untested surfaces against their item lists: the variance queue's 13
   items and 3 actions, the milestones panel's 6 items and 2 actions, the four policy dialogs, and
   the Month day summary.
4. A browser pass of the tour on the landing, Week, Month, List, Kanban, Matrix and Gantt at 1440px,
   1024px, 768px and 375px, checking that the spotlight still frames `.sched-views` and the
   `.ss-strip` correctly after the strip loses its frame.
5. `Print week sheets` printed to PDF at Letter and A4: one page per crew, page breaks intact, ink
   `#1c1c1a`, conflicts still red.
6. The 2,000-job bench re-run on all seven pages: `[scale] <page>: <ms>, <nodes> nodes` node counts
   **at or below** today's, and no new paint hotspot (the aurora blur stays 50px, no fourth blob, no
   `will-change` added anywhere).
7. `prefers-reduced-motion: reduce` walked on all seven pages: every keyframe nulled by name still
   nulled, plus `schedCellIn` now nulled.
8. The `--wx-amber` blue badges and the `--hsx-amber` real amber both render exactly as they do
   today, verified side by side (decision #3).

---

## 12. Guards, seams and the things a second session would break

### 12.1 `schedule/density.test.ts` — the drift guard (the HYBRID graft)

Reads the new stylesheet **raw** with the pattern `boundary.test.ts` already uses, and fails the
build rather than the review:

```ts
const sheets = import.meta.glob("/src/schedule-daylight.css", { query: "?raw", import: "default", eager: true });
const css = Object.values(sheets)[0] as string;
```

1. **Closed type-scale allowlist.** Every `font-size` in the file must be `var(--bf-app-*)` or one
   of the four literals the cluster's frozen surfaces need (`11px`, `12px`, `13px`, `13.5px`) — any
   other literal fails. This is what stops a fifth type scale being reintroduced quietly.
2. **Closed token allowlist for colour / radius / shadow / easing.** Every `color`,
   `background`, `border-color`, `border-radius`, `box-shadow` and `transition-timing-function`
   value must be a `var(--wx-*)`, `var(--hsx-*)`, `var(--sc-*)`, `var(--bf-*)`, `currentColor`,
   `transparent`, `inherit`, `none`, or a `color-mix()`/`rgba()` over one of those. No new hex.
3. **Scope guard.** Every selector must contain `.sched-rx`, `.gantt-page`, `.gantt`, `.sched-`,
   `.schedule-`, `.kpi-`, `.crew-`, `.list-page`, `.week-page`, `.month-page`, `.kanban-page`,
   `.matrix-page`, `.sv-`, `.ss-strip`, `.sim-`, `.bf-`, `.bm-`, or `.hs-flyout` — the last being
   the one deliberate exception (§3.5, the portalled saved-views block), which the test names
   explicitly so it cannot grow into a general licence.
4. **Additivity guard.** The file may not contain `:where(`, `!important`, or `*/` inside a comment
   body, and it may not contain any of the pinned selector strings in a form that *replaces* them —
   asserted as: for each pinned selector, if it appears, it appears with at least one ancestor or
   sibling class, never alone at declaration level.
5. **Name guard.** No `bf-sched-`, no new `@keyframes` name (the keyframe list is closed to the
   twelve existing names).
6. **Anchor guard** (grep over `schedule/**/*.tsx`): all 23 `data-tutorial-id` strings from §1k are
   still present, and no new `transform`/`filter`/`backdrop-filter`/`contain`/`will-change` appears
   in the new sheet on a selector that is an ancestor of an anchor.
7. **Export-menu guard**, restoring by hand what `boundary.test.ts` no longer asserts (§0.1): every
   `schedule/pages/*.tsx` contains `<ScheduleExportMenu`.

### 12.2 The two cross-cluster seams

1. **`.ss-band` / `.ss-strip` is shared with Dashboard and Projects and is deliberately unscoped,
   and its failed state lives in `hs-home.css:2016/2027`.** This cluster restyles it **only** under
   `.sched-rx .ss-strip`, and the dashboard cluster owns the unscoped form and the `hs-home.css`
   half. If both clusters restyle it, the later import wins and one of the two pages regresses. This
   must be assigned to one owner before phase D.
2. **`.hs-page-tag`** is styled only by `hs-index.css:978 .hs-index .hs-index-title .hs-page-tag`,
   and the six view pages render it inside `.dx-title`, which that selector does not match — so
   month/week/list/kanban/matrix render the bare word "New" as unstyled inline text today. **The fix
   is one unscoped rule and it belongs to the shell cluster** (`preserve` §6a already claims it);
   this mapping assumes it lands and does not duplicate it. If the shell cluster drops it, add
   `.sched-rx .hs-page-tag` here.
   Also cross-cluster: `.hs-flyout .hs-flyout-views` (§3.5), the star-menu and Bookmarks tiles
   (§4.11), the `rgba(251,133,0)` orange in `redesign.css`/`styles.css` (§1f), and the tutorial
   overlay itself (§8.3).

### 12.3 Written into the source: the header comments this cluster owes

Three comments, pasted above the code they protect, because each is a trap that is currently
undocumented in the source:

```
/* parts/month.tsx — MonthDayCell
   INVARIANT — DO NOT WRAP (click-to-add depends on it): the cell's click handler tests
   `event.target === event.currentTarget`. Wrapping the cell's contents in a new inner div, adding a
   padding element, or making the cell a <button> kills click-to-add silently, with no error and no
   failing test. */

/* parts/shared.tsx — KpiCard
   The className is `kpi-card` (+ `bf-figure`) and `kpi-card-button` for the interactive variant.
   pages.test.tsx queries `.schedule-kpis .kpi-card`. ADD classes; never replace one. */

/* schedule.css — .sched-rx .sched-matrix.sched-matrix { overflow: visible }
   The doubled class is deliberate: it out-specifies the card's own `overflow: hidden` further down
   this file so the cell tooltips are not clipped, and the head's corners are re-rounded separately.
   Re-adding `overflow: hidden` for rounded corners kills EVERY Matrix tooltip and fails
   pages.test.tsx's Matrix case. */
```

And one more, in the new stylesheet, for the settings-style trap that does **not** apply here but
would if someone converted a keyed panel: **no `[data-reveal]` may be added to any element whose
`className` is computed**, and no keyed subtree in this cluster may be converted from a CSS keyframe
to `data-reveal` — `useHudMotion`'s reveal effect has deps `[rootRef]` only and never re-queries, so
the rest state `opacity: 0` would strand it. `schedCellIn` is the cluster's keyed-entrance case and
it stays a pure CSS keyframe for exactly that reason.

---

## 13. Proposed removals and changes, needs approval

Nothing here is done in the mapping above. Each is a defect or a deliberate oddity I found while
mapping, with the cost of leaving it and the cost of fixing it.

**Presentation changes I *am* making, listed so they are not mistaken for regressions** (each is
argued in place): the four KPI frames and the KPI tilt (§1e/§1j); the CPM band's and status strip's
frames (§1e); the inner frames on queue rows and variance cards (§1e); hover's inset blue ring on
the List and the Matrix becoming a wash, with the ring reserved for the open record (§1j); the
Gantt's `h1` rising from 22px to the cluster's 27–38px rung (§7.1); the Gantt's ink `#14203a` →
`#1c1c1a` (§1i); `.cc-empty-line` and `.cc-list` gaining rules they never had (§3.7); the
`.list-page` block being written (§6.1); the Export trigger looking the same in both slots (§3.6);
the print sheet's ink (§8.1); `.ss-project-track`'s gradient going flat and `.sim-band-range`'s
orange being re-based (§1f); `--wx-serif` deleted from `.sched-rx`, which is inert here
(zero reads in `schedule.css` — decision #4).

| # | Item | Why it is here | Recommendation |
|---|---|---|---|
| 1 | **The `.badge` casing bug.** `statusTone()` lowercases (`DelayIQed` → `delayiqed`) while every stylesheet writes `.delayIQed` in camelCase (`schedule.css:1161, 1313, 1364`; `styles.css:9582, 9874, 12483`; plus 3 other scopes). CSS class selectors are case-sensitive, so **the DelayIQed badge, job card and queue chip never get their red tone**, and `.not-started` / `.in-progress` have no `.badge` rule at all. The board legend hard-codes `<i className="delayIQed"/>`, so it promises a red the cards never show | Fixing the casing is a **visible behaviour change disguised as a rename** — DelayIQed cards would suddenly turn red — and no test catches either state (`statuses.test.ts` only asserts the JS tone strings are unique) | **Fix it, in a separate commit, with the diff shown.** Three statuses currently render identically grey in the filter panel and the queue. But it is a product call, not a re-skin |
| 2 | **Two chips both reading "Ready."** `ScheduleBadge` relabels `Ready to Start` → `Ready`, so the status panel renders two differently-coloured chips with the same label, and `getByRole('button', {name: 'Ready'})` is ambiguous | Preserved as-is above | Relabel the second to `Ready to start` (sentence case) so the two are distinguishable. Copy change → needs sign-off |
| 3 | **The Matrix has no key for its own encoding.** Nothing explains the four heat levels or the three utilisation bands, and `crewAvailability()`'s computed labels (`Available`/`Limited`/`Busy`) are never rendered — the bands are colour-only. Meanwhile the Matrix duplicates the five-status legend, which explains statuses the grid does not encode | The load legend already exists in CSS (`.sched-load-legend`, `schedule.css:1198-1216`) and is **unused on this page** | Swap the Matrix's status legend for the existing load legend, and add the three band names as text in the utilisation pill's `title`. New copy → needs sign-off |
| 4 | **The Kanban's KPI row reports the shared week on a week-less board**, and its `Print week sheets` prints that week too | Preserved | Either add the week to the Kanban's link keys (a data change) or add one sentence of copy under the KPI row. Needs sign-off |
| 5 | **`.is-busy`** is applied to `.schedule-list-view` while a write is in flight and has **no CSS rule anywhere** — a dead hook that looks like a busy state in the JSX | Left dead | Either give it `pointer-events: none; opacity: .7` (one rule) or delete the className. Trivial either way |
| 6 | **`.schedule-cell.is-off` has no rule**, so a non-working day's Week cells look identical to a working day's — only the header dims. Same family: `.sched-rx .sv-pill` and `.sv-drawer-head > button` are fully-specified CSS with **no component that renders them** | Preserved | Give `.schedule-cell.is-off` the same 0.72 opacity as the header (2 lines, consistent), and **delete** the 61 orphaned `.sv-pill` lines. Both need a nod |
| 7 | **The List's Export is never disabled**, unlike the Kanban's and the Matrix's, so it writes a header-only CSV from an empty week | Preserved | Pass the same `disabled` prop. One line, behaviour change |
| 8 | **List rows are not in time order.** The sort key is the string `${day}-${job.startTime}` compared with `localeCompare`, so `10:00 AM` sorts before `7:00 AM` — while the page's own sub-line says "in time order". `kpis.ts` already exports an unused `parseClockTime` | Preserved | Fix the sort. It changes visible ordering, so it needs sign-off — but the sub-line is currently false |
| 9 | **The tour tells the user to press 1–6 while suppressing 1–6.** `useScheduleViewKeys` bails whenever a visible `[role="dialog"]` exists, and the tutorial panel is one | Preserved | Exempt `.buildflow-tutorial-panel` from `dialogIsOpen()`, or soften the copy. Needs sign-off |
| 10 | **Dismissal gaps.** `ScheduleDialogPanel` (the alerts dialog, the three policy dialogs, the Month day summary) closes **only** by its `X` — its backdrop is `role="presentation"` with no handler and there is no Escape. The add-job picker and the import dialog are the same. The calendar-feeds dialog has no Escape. And because `JobDrawer`'s Escape handler stands down whenever a `.schedule-dialog-backdrop` exists, Escape does nothing at all while any of them is open | Preserved exactly — this is behaviour, not presentation | Add backdrop-click + Escape to `ScheduleDialogPanel` and the feeds dialog (the conflict dialog and the link dialog already show the pattern). Small, but it is a behaviour change |
| 11 | **The export menu is a `role="menu"` with no keyboard contract** — no arrow keys, no focus trap, no focus return to the trigger; and the status filter panel gets no focus move when it opens | Preserved | Add roving `tabindex` + focus return. Real a11y win, real behaviour change |
| 12 | **The KPI definitions are mouse-only.** All four are native `title`s on non-interactive `<div>`s, unreachable by keyboard, and they are the only home for `AT_RISK_DEFINITION` | Preserved (§3.14) | Move them to the Matrix cell's proven pattern (a `[role="tooltip"]` child + `aria-describedby`, revealed on `:hover` and `:focus-visible`) with `tabIndex={0}` on the card. Adds 4 focus stops per page × 7 pages |
| 13 | **No keyboard path to the job drawer from any board.** Every card is a `<button>` that is its own dnd-kit activator, so Space/Enter lifts it for a keyboard drag and the click never fires. Only the Gantt's sidebar rows reach the drawer by keyboard | Preserved | Add a dedicated "open details" affordance (or bind Enter to open and keep Space for lift). Behaviour change, and the biggest a11y gap in the cluster |
| 14 | **First-run step state reaches assistive tech by copy alone** — `.sched-firstrun-mark` is `aria-hidden`, `li.is-done` only changes colour, no `aria-current` | Preserved | Add `aria-current` / a visually-hidden "done". Cheap, but it is markup |
| 15 | **A failed weekly digest costs the manual send.** The panel renders head + footer only and `Email the team now` stays permanently disabled (`disabled={!digest \|\| sending}`) | Preserved | Let the button retry. Behaviour change |
| 16 | **The status band and the digest each fetch once per mount and are never refreshed** — not by the live feed, not by a filter change, not by an accepted variance. So after another tab books a job the KPIs, alerts, queue and view-card figures all update while the band's "+2d ahead of plan" and the digest's change list keep showing pre-change numbers | Preserved deliberately — the records call this the thing a redesign is most likely to accidentally "fix" | Leave it, or add a refresh on the live feed's reload. Either way, decide it on purpose |
| 17 | **`Copy link to this view` on the Gantt does not carry the week** (`LINK_KEYS.gantt` is filters-only) while the menu hint says "this page, this week, these filters" and the notice says "on this week" | Preserved | Either add `weekStart` to the Gantt's link keys or change that page's hint copy. Needs sign-off |
| 18 | **The saved-view chip's `title` ends with a raw lowercase page id** — `… · opens list`, `opens kanban` | Preserved | Map the id to its label (`opens List`). One-line copy fix |
| 19 | **The Week card's `aria-label` says `Open <job> project` although the click opens the job drawer** | Preserved | Fixing it changes three test files. Worth doing, in its own commit |
| 20 | **Two landing figures can disagree.** The view card's `N% of crew-days booked` uses a hardcoded 5-day week while the KPI delta's `N% of crew-days` uses the workspace's real working-day count | Preserved — changing it changes visible numbers | Unify on `kpis.workingDays`. Needs sign-off |
| 21 | **Cell heat caps at 3**, so a crew with 3 bookings and one with 9 look identical | Preserved | A `load-4+` step, or a `9` count pill that reads as an outlier. Design call |
| 22 | **Stale "styled by hs-gantt.css" comments** in `GanttPage.tsx`, `components/ui/gantt.tsx` and `parts/JobDrawer.tsx` point at a file that no longer exists (the content is `schedule.css:4232+`) | — | Fix the three comments in phase C. No approval needed, listed for completeness |

---

## 14. Where this falls short of the Welcome Page (the honest part)

1. **Rhythm still does not survive.** 20–34px between blocks is not 108px between sections. The
   `.bf-tail`'s 72px at the foot of a page is the one place Welcome-scale air is free, and it is
   taken. Everywhere else the cluster is *tighter*, not merely smaller, and no arithmetic fixes that
   on a board that has to show 12 crew rows above the fold.
2. **The product-window stage has no equivalent, and this cluster does not invent one.** The
   marketing page's signature is a mock floating in a `#faf8ee` stage over an animated mesh, tilting
   under the pointer. In-app the nearest thing is the aurora field, which is already here and is
   ambient rather than a stage. The fourth hover move is retired rather than substituted (§1j) —
   which is more honest than the concept's spotlight, and it does mean **three of four moves, not
   four**.
3. **The display register is occupied, but only at its floor.** 38px is the Welcome Page's smallest
   display size. The two ladders touch at exactly one value and nowhere above it, so someone who
   scrolls the marketing hero at 96px and then opens the Week board still feels a 2.5× drop.
4. **The gradient trio appears once, on one word, on one page.** Keeping the landing H1's `em` (§1f)
   is a real carry-over of Welcome role #1, and it is also the *only* place the product's most
   distinctive colour move survives in this cluster.
5. **`--wx-amber` renders as a dark blue on six pages and a real amber on the seventh.** Decision #3
   keeps it, and the light chrome makes the inconsistency louder, not quieter: a blue "Planned" badge
   sitting beside the `#2f6bff` accent on a white card is more visible than it was against navy.
6. **The measure is not adopted, because there is nothing to adopt it on.** `.sched-rx` has no
   `max-width` and the boards need every pixel; `44ch`/`54ch`/`62ch` on prose is the whole of the
   measure story here, and `.bf-doc-bleed` exists for the case where a future wrapper adds one.
7. **The light chrome deletes the app's only strong "I am inside the workspace" anchor.** After the
   flip, the seam between the shell and this page is one `rgba(28,28,26,0.07)` hairline plus a
   `blur(14px)` on the top bar. In this cluster that seam matters more than anywhere else, because
   `.sched-rx` bleeds to the shell's edges (`margin: -22px -28px -34px`). **This needs verifying on
   an uncalibrated monitor, not asserting** — it is on the §11 browser-check list, and if the
   hairline fails, the cheapest fix is `--wx-line` (0.13) instead of `--wx-line-soft` (0.07) on that
   one edge, which is still inside the palette.
8. **Six of the twenty-two items in §13 are defects the re-skin makes *more* visible** (the grey
   DelayIQed badge, the legend that promises a red it never shows, the two "Ready" chips, the
   colour-only Matrix bands, the undimmed non-working Week cells, the orphaned `.sv-pill`). A
   re-skin that removes visual noise removes the camouflage too.

---

## 15. Open questions

1. **Who owns `.ss-band` / `.ss-strip`?** It is shared with Dashboard and Projects, deliberately
   unscoped, and its failed state lives in `hs-home.css`. This mapping restyles only
   `.sched-rx .ss-strip` and assumes the dashboard cluster owns the rest. Confirm before phase D.
2. **Does `.hs-page-tag` get its unscoped rule from the shell cluster?** Without it, the `New` pill
   stays unstyled inline text on five of the seven pages.
3. **The landing H1's gradient `em`: keep (my recommendation, §1f) or flatten to ink?** It is the
   one place the trio survives in-app; it is also a declared deviation from the concept's
   one-licensed-use rule.
4. **`.gantt-frame`'s `calc(100vh - 336px)`** must be re-measured once the card padding and the `h1`
   change. Whose sign-off is needed on the new number, and is the 900px ceiling still right?
5. **The casing bug (§13.1)** — fix now in a separate commit, or file it? It changes what three
   statuses look like on five surfaces.
6. **The four `title`-only KPI definitions (§13.12)** — keep them mouse-only (zero risk, zero
   change), or move to the Matrix's `role="tooltip"` pattern and accept 28 new focus stops?
7. **The seven dismissal and keyboard gaps (§13.10/11/13)** — are these in scope for "presentation
   only", or do they get their own accessibility pass? They are the only items in §13 that I would
   argue a user notices daily.
8. **Preserve's `--bf-app-title`** must not be applied to `.dx-title` (§0.2). Confirm the shell
   cluster scopes it to `.hs-index-title` on the pages that actually sit at 22px, so the two clusters
   do not both claim the schedule `h1`.
