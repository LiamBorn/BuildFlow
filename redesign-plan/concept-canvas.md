# Concept: CALM CANVAS

**One-line thesis.** BuildFlow does not read dense because it shows too much; it reads dense because
almost every one of its 1,945 information items is wrapped in a bordered, shadowed, white widget. On
the ten index pages a single number sits inside four nested frames. Delete the frames that carry no
meaning, re-frame every page as a *document* on the ground the app already paints (`#f5f6fa`, byte
for byte the Welcome Page's `--wx-bg`), and the Welcome Page's calm arrives without moving one figure,
shrinking one column, or dropping one row.

This concept therefore changes almost nothing about navigation and almost everything about the page
body. That is a deliberate trade: the 56px rail and 56px top bar are already the most restrained thing
in the app, they are what 346 tests navigate through, and re-drawing them buys atmosphere while
risking the suite. The frames buy the atmosphere for free.

---

## 1. The diagnosis, counted

Take the Matrix page — one of the densest surfaces in the product. Between the page ground and a
booking count, today, the reader crosses these resting boundaries:

| # | Container | Border | Shadow | Radius | Does its edge *mean* anything? |
|---|---|---|---|---|---|
| 1 | `.content-scroll` padding box | – | – | – | – |
| 2 | four `.hs-kpi` cards | 1px | – | 12px | no — a figure is not an object |
| 3 | `.sched-views` saved-views bar | 1px | – | – | no |
| 4 | the filter strip | 1px | – | – | no |
| 5 | `.schedule-board` section | 1px | yes | 10px | **yes** — it clips a scrolling grid |
| 6 | `.sched-matrix` grid | 1px | – | – | **yes** — cells *are* crew-days |
| 7 | per-cell rules | 1px | – | – | **yes** |
| 8 | board footer | 1px | – | – | no |
| 9 | `.schedule-alerts` panel | 1px | yes | – | no |
| 10 | `.kpi-card`s again, in the alerts strip | 1px | – | – | no |

Six of the ten boundaries carry no information. On the index pages it is worse: `.hs-kpi` (5 of them)
→ `.hs-index-card` (1px `#e6e8f0`, 14px radius, `0 1px 2px rgba(20,32,58,0.04)`) → `.hs-table-wrap`
(1px, 10px radius) → `.hs-table` (separate borders, its own thead fill `#fafbfd`) → 46px rows with
their own top borders. Four nested rectangles to reach one project name.

The Welcome Page has 1,883 rules and, on a full scroll, roughly **eleven** resting boundaries: the nav,
the hero badge, four cards in one band, three stages, the footer. It shows less per screen, yes — but
the reason it *feels* like less is that it draws twelve edges where the app draws two hundred.

So: **frames are the variable to spend. Type size and row height are not.**

---

## 2. What carries over literally

These need no rescaling. They are already correct at 13px and they are the whole visual identity.

| Thing | Value | Note on the app today |
|---|---|---|
| Ground | `#f5f6fa` | already `--hs-paper: #f5f6fa` on `.hs-shell` — **identical**. The app just paints white on top of it. |
| Accent | `#2f6bff`, one accent, carries eyebrows, kickers, stat labels, icon tints, links, selection | already `--hs-blue` / `--wx-blue` in 11 app scopes. Welcome and auth move to it. |
| Card fill | `--wx-card #ffffff` | unchanged |
| Hairline | `--wx-line rgba(28,28,26,0.13)`, soft `rgba(28,28,26,0.07)` | app uses `#e6e8f0` / `#eef0f4` — repoint to the token values; the delta is invisible but the token count drops. |
| Ink / muted / faint | `#1c1c1a` / `#575550` / `#8a877e` | already unanimous across 15–16 scopes |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` | already `--hs-ease`, `--hsx-ease`, `--bf-ease` — three names, one value. Consolidate on `--bf-ease`. |
| Second curve | `cubic-bezier(0.4, 0, 0.2, 1)`, height and grid transitions only | unchanged |
| Interaction band | 0.18s – 0.30s | unchanged |
| Focus ring | `0 0 0 3px rgba(47,107,255,0.14)` | **already in the codebase** as `.hs-search:focus-within`. Apply it everywhere. Note `--bf-focus-ring` in `design-tokens.css` currently holds `rgba(26,115,232,0.12)` — the Welcome blue — and must be repointed to `rgba(47,107,255,0.12)` now the accent decision is made. |
| Hover grammar | four moves, never a fifth | see §5 — one of the four is retired in-app, deliberately |
| Scroll reveals | one-shot, `.in`, then unobserve | `useHudMotion` already unobserves. Only its two constants differ (`threshold: 0.12`, `rootMargin: '0px 0px -5% 0px'`) from the documented contract (`0.16`, `-6%`). A two-number edit brings the app onto the contract. |
| Reduced motion | extend the 10 existing blocks | `design-tokens.css` already zeroes `--bf-lift/--bf-slide/--bf-reveal-shift` under `reduce`. New app tokens go in **that same block**. |
| Ink-pill grammar | outline pill inverts to `--wx-ink` fill with `#fdfcf9` text | new in-app; replaces four different "active" treatments |

The gradient trio (`--wx-g-blue #4285f4` → `--wx-g-purple #9b72cb` → `--wx-g-coral #d96570`) is
reserved on the Welcome Page for exactly three things. **In the app it is licensed for exactly one:
the AI.** `.hs-ai-button` keeps its blue→purple fill. That forces three existing gradients flat, and
I am calling them out because they are visible changes:

1. `.hs-progress` default track `linear-gradient(#4285f4, #9b72cb)` → flat `--wx-blue`. Tone variants
   (amber/red/green) already flat; they stay.
2. `.primary-button` `linear-gradient(180deg, #2e69ff, #2f6bff)` → flat `#2f6bff`. (It also carries an
   `--shadow-accent` orange glow, `rgba(251,133,0,…)`, left over from the orange era — that goes.)
3. Settings panel header `.sx-dot` gradient dot + gradient icon square → flat `--wx-blue`.

---

## 3. What gets rescaled, with the numbers

### 3.1 Type: two registers, one seam, and the ratio that connects them

The Welcome Page's smallest display rung (`clamp(26px, 3vw, 38px)`) is larger than the app's largest
(22px, the `.hs-index-title` h1). A ratio has to exist, and it has to stop existing somewhere.

**The ratio is ρ = 0.44, and it governs only the display rungs.** Below ~19px the two ends already
agree — the Welcome Page's body is 13–16px, the app's is 11–13.5px — so the app's small type is
already the Welcome Page's small type and does not move at all.

**Register A — document type (new; the four display rungs are Welcome × 0.44)**

| Token | Value | Weight | Tracking | Leading | Derivation | Use |
|---|---|---|---|---|---|---|
| `--bf-app-title` | `clamp(30px, 3.2vw, 42px)` | 600 | `-0.022em` | 1.06 | hero 96 × 0.44 = 42.2 | the one `h1` per page |
| `--bf-app-figure` | `clamp(26px, 2.1vw, 32px)` | 650 | `-0.02em` | 1.0 | stat figure 72 × 0.44 = 31.7 | KPI values, `tabular-nums` |
| `--bf-app-h2` | `24px` | 600 | `-0.015em` | 1.15 | section h2 54 × 0.44 = 23.8 | section titles |
| `--bf-app-h3` | `19px` | 600 | `-0.01em` | 1.20 | **breaks ρ** (38 × 0.44 = 16.7) | sub-section / panel titles |
| `--bf-app-lede` | `clamp(14.5px, 1.05vw, 16.5px)` | 500 | 0 | 1.55 | lede `clamp(16,1.35vw,19)` × ~0.88 | page and section ledes |
| `--bf-app-prose` | `14px` | 500 | 0 | 1.55 | Welcome body floor | Settings row copy, help text |

`--bf-app-h3` is the one place I break the ratio on purpose: 17px sits within half a pixel of the
lede's 16.5px maximum and stops reading as a level. 19px is the smallest size that still reads as a
heading beside a 16.5px lede.

**Register B — data type (unchanged; these are today's measured values)**

| Token | Value | Weight | Tracking | Use |
|---|---|---|---|---|
| `--bf-app-data` | `13px` | 500 | 0 | table cells, board cells, drawer fields, flyout rows |
| `--bf-app-meta` | `12.5px` | 500 | 0 | secondary meta, footers, notes, counts |
| `--bf-app-label` | `11.5px` | 700 | `0.085em`, uppercase | eyebrows, table heads, badges |
| `--bf-app-micro` | `11px` | 600 | 0 | day letters, dots, pill counts |

Measured frequency across `hs-home.css`, `hs-index.css`, `app-shell-hubspot.css` and `schedule.css`
today: 12.5px (46 rules), 13px (41), 11px (31), 12px (30), 13.5px (25), 11.5px (25). Register B keeps
four of those six and folds 13.5 → 13 and 12 → 12.5. **Net effect on data density: zero. A table row is
13px before and 13px after.**

**The seam: there is nothing between 14px and 19px, on purpose.** Any new rule that reaches for 15,
16, 17 or 18px is a bug — it means a heading is trying to be body or body is trying to be a heading.
(The lede's `clamp` maximum of 16.5px is the single licensed exception, and only on the two lede rungs.)

### 3.2 Rhythm: ρ_r = 0.42, applied to all three clamp terms

| Thing | Welcome | App | Derivation |
|---|---|---|---|
| Between sections | `clamp(76px, 12vh, 130px)` → 108px @1440 | `--bf-app-rhythm: clamp(32px, 5vh, 54px)` → 45px @900h | each term × 0.42 |
| Within a section | – | `--bf-rhythm-dense: clamp(20px, 3vh, 34px)` | **already exists** in `design-tokens.css` |
| Section head → content | `54px` | `22px` (`--bf-space-5`) | 54 × 0.42 = 22.7 |
| Page header → first section | `54px` | `--bf-app-rhythm` | |
| Page padding | – | `clamp(26px, 3.4vh, 44px) clamp(20px, 4vw, 40px) clamp(48px, 8vh, 96px)` | replaces `22px 28px 34px` |

At 1440×900 that resolves to **30px top / 40px sides / 72px bottom**. The tail is where the app can
afford Welcome-scale air, because nothing competes for space below the last row: 72px is two-thirds of
the Welcome Page's 108px and costs nothing.

Concrete check on the fear "a dashboard cannot adopt 108px rhythm": at 45px between sections and a
30px top pad, a 1440×900 viewport minus the 56px bar shows the page header (~120px including its lede)
plus 45px plus roughly 570px of content — about **12 table rows or 4 board panels above the fold**,
against 14 rows today. One row of cost, for six deleted frames per page.

### 3.3 Measure

| Token | Value | Applies to |
|---|---|---|
| `--bf-app-measure` | `1140px` | every document page: index pages, Reports, Bookmarks, Field, DelayIQs, Map, TimeCard, all six Schedule views |
| `--bf-app-measure-dash` | `880px` | the Dashboard only — **locked**, see §6.5 |
| `--bf-app-measure-settings` | `760px` | the Settings panel column (right of its 248px rail) |
| `--bf-app-gutter` | `clamp(20px, 4vw, 40px)` | the page's side padding |
| `--bf-app-lede-measure` | `62ch` | page and section ledes |
| `--bf-app-prose-measure` | `72ch` | Settings row descriptions, help text |
| `--bf-app-bleed` | `calc(100vw - var(--hs-rail-w) - 2 * var(--bf-app-gutter))` | the one element per page allowed out of the measure |

1140px is the Welcome Page's own `.wx-main` measure, carried over unchanged. Copy measures stay in
`ch` for the same reason the Welcome Page does it: they hold across the clamp.

**The bleed rule** (this is how dense boards survive a centred measure):

```css
.bf-doc-bleed {
  width: var(--bf-app-bleed);
  max-width: none;
  margin-inline: min(0px, calc((100% - var(--bf-app-bleed)) / 2));
}
```

One element per page may take it. It is always the board: the Matrix grid, the Gantt timeline, the
Week board, the Month calendar, the Kanban lanes, the Map card grid, a wide index table. Everything
else on the page — header, lede, filters, legend, footer, alerts — stays on the 1140 measure, so the
page still reads as a document with one oversized figure in it.

### 3.4 Radius: four values, not nine

The app currently uses 14, 12, 11, 10, 8, 6px plus 999. The Welcome ladder is 999/26/20/18/12/8.
In-app the ladder is **exactly four**:

| Value | Token | Use |
|---|---|---|
| `999px` | `--bf-radius-pill` | every pill: buttons, chips, tabs, badges, search, filters |
| `18px` | `--bf-radius-panel` | the two licensed card classes (§4) |
| `12px` | `--bf-radius-control` | popovers, menus, flyout, drawer, dialogs, inputs, selects |
| `8px` | `--bf-radius-chip` | square affordances: checkboxes, avatars-as-squares, icon buttons, thumbs |

Retired in-app: 26, 20, 14, 11, 10, 6. Grep-checkable.

### 3.5 Shadow: three steps, not seven

A 60px-blur hover shadow under a 120px-tall panel in a 16px-gap grid bleeds into its neighbours and
reads as a smudge, not a lift. So the ladder is rescaled, not copied.

| Token | Value | Use |
|---|---|---|
| `--bf-shadow-card` | `0 10px 30px rgba(28,28,26,0.05)` | licensed cards at rest — **unchanged from Welcome** |
| `--bf-app-shadow-hover` | `0 14px 34px rgba(28,28,26,0.09)` | licensed card hover (Welcome's is `0 26px 60px /0.12`) |
| `--bf-shadow-float` | `0 24px 70px rgba(28,28,26,0.14)` | popovers, menus, dialogs, drawer, job drawer — **unchanged** |

Everything else has no shadow. Today's `.panel` (`0 16px 34px rgba(31,56,88,0.06)`), `.hs-index-card`
(`0 1px 2px`), `.hs-btn-primary` (`0 6px 16px rgba(47,107,255,0.28)`) and the rail's blue glow all go
to zero.

---

## 4. The card licence — the rule that makes this checkable

A white bordered rectangle is licensed **only** if one of these two holds. Everything else becomes a
transparent section on the ground.

**Licence 1 — it is a discrete object with an interactive boundary.** You can click, drag, resize,
reorder or dismiss the boundary itself, and removing it would make two adjacent objects ambiguous.
→ Dashboard panels (drag + resize + hide), the Gantt promo banner (dismissible), project and crew
cards (hover-delete lives on the boundary), dialogs, the job drawer, popovers, menus, the flyout,
the drawer, `InlineEmptyState` (a frame is the *only* way to draw absence).

**Licence 2 — it is a viewport onto a bigger space.** Its edge is a clipping edge: content scrolls
inside it and the border tells you where the world stops.
→ The Matrix grid, the Gantt timeline, the Week board, the Month calendar, the Kanban lane column,
the Map card grid, a `min-width: 720px` table inside a narrower page.

This is the Welcome Page's own *product-window* move, rescaled. On the Welcome Page a mock never sits
on the ground: it floats in a `#faf8ee` stage at 26px radius with `0 34px 64px /0.13` and a pointer
tilt. In-app the stage becomes: `--wx-card` fill (no cream anywhere in the app), `1px solid
var(--wx-line)`, radius **18px**, `--bf-shadow-card`, `overflow` as today. **No `perspective`, no tilt**
— see §5.

**Everything failing both licences is dissolved.** The audit:

| Frame, today | Sites | Verdict |
|---|---|---|
| `.hs-index-card` — 1px, 14px radius, `0 1px 2px` | 10 pages | dissolved. It frames *the page*, and its border does nothing. |
| `.hs-kpi` cards | 10 pages × ~5 | dissolved → figure row (§6.1) |
| `.kpi-card` / `.kpi-grid` (legacy, 4-up) | Dashboard, Schedule ×6, Reports | dissolved → figure row, **class names kept** (see §8) |
| `.panel` — 1px + `0 16px 34px` | 9 sites | dissolved → `.bf-doc-section`. All 9 keep their `h2` text and their header action button verbatim. |
| `.settings-section` cards | 17 views | dissolved → sections with row hairlines |
| `.hs-table-wrap` border + 10px radius | 10 pages | border and radius removed, `overflow-x: auto` kept, plus a scroll-edge mask (§7.5) |
| `.hs-table thead` fill `#fafbfd` | 10 pages | → `--wx-bg` (it *is* the ground) + `border-bottom: 1px solid var(--wx-line)` |
| `.sched-views` bar, filter strip, board footer, alerts panel | 7 schedule pages | dissolved → transparent rows / sections |
| Dashboard panels | 12 | **kept**, licence 1 |
| Dialogs, drawers, menus, flyout | ~20 | **kept**, licence 1 |
| `InlineEmptyState` dashed box | 10 sites | **kept**, licence 1. Re-toned: dashed `1px var(--wx-line)`, 18px radius, transparent fill (drops `#f6f7fe`). |

Projected resting-boundary count on a typical index page: **8 → 2** (the table's internal head rule,
and the table's clipping edge when it scrolls).

**Also removed, and I am flagging it because it is a deletion:** the three `.dx-aurora` blur blobs and
the `.dx-cursor` follower present on every `.sched-rx` schedule page and on `.settings-rx`. They carry
zero information items, they are the app's only violation of "one ground, end to end," and blurred
colour fields behind a data grid are a documented paint hotspot in this repo. `useHudMotion` stays
(it owns the reveal half and the `.dx-ready` class); its `pointermove`/`--mx`/`--my` effect becomes
dead weight on pages with no cursor field and can be gated off.

---

## 5. Hover grammar: three of the four moves, and one retirement

| Move | Welcome | In-app | Applies to |
|---|---|---|---|
| **1. Lift** | `translateY(-6px)` + `0 26px 60px /0.12` | `--bf-app-lift: -3px` + `--bf-app-shadow-hover` | licensed cards only. On a 120px panel in a 16px-gap grid, −6px visually crosses the gutter and reads as a jump; −3px is the same gesture at dense scale. Dashboard panels lift on `[data-dragging]`, **not** on hover — a lift under the pointer fights a drag. |
| **2. Invert** | outline pill → ink fill | same | every pill: `.hs-btn`, `.hs-chip`, `.hs-view` tabs, status chips, TimeCard tabs, quick-filter pills. Hover on an unselected pill = `--wx-ink` at 6% + `1px solid var(--wx-line)`. **Selected** = full `--wx-blue` fill, `#fdfcf9` text — the one accent carries selection, replacing today's four different active treatments (`blue-soft` fill on `.hs-chip`, 2px blue underline on `.hs-view`, blue fill on the rail, `.active` background on Settings rail). |
| **3. Slide** | arrow `translateX(3px)`, gap 8→11px | `translateX(2px)`, 0.18s | directional rows only: flyout items (already 2px), Settings rail items, notification rows, bookmark menu rows, `.bf-bookmarks-add`, panel header "View details" actions. **Table-cell `.hs-link` does not slide** — a record name is not a direction; it keeps underline-on-hover. |
| **4. Tilt** | pointer-driven `--rx`/`--ry` on product mocks | **retired** | There is no in-app surface where a 3D tilt on live schedule data is defensible. The app uses three moves. This is a decision, not an omission. |

---

## 6. The dense surfaces, head on

### 6.1 The ten index pages (Projects, Contacts, Companies, Deals, Crews, Equipment, Materials, Field Updates, DelayIQs, Bookmarks)

This is the biggest win and the template for everything else. Nothing is removed. The order is
unchanged. Every column, every badge tone, every saved view, every count, every sort control, every
export stays.

```
  ┌ page padding: 30 / 40 / 72 ────────────────────────────────── ground #f5f6fa
  │
  │  PROJECTS · OPERATIONS                     ← eyebrow, 11.5/700/0.085em, --wx-blue
  │  Projects                          [NEW]   ← --bf-app-title (42px), + .hs-page-tag
  │  Every job on the books, with the crew…    ← --bf-app-lede, 62ch, --wx-mut
  │                          [Import] [+ New]  ← .bf-doc-actions, right-aligned pills
  │
  │  ── 45px ──
  │
  │   24          6         3          92%        4          ← --bf-app-figure, tabular-nums
  │   ACTIVE   AT RISK   OVERDUE   ON TIME   MILESTONES      ← --bf-app-label
  │   +2 vs wk   −1        flat      +3pt      this month    ← --bf-app-meta, --wx-faint
  │            │         │         │         │               ← 1px --wx-line-soft, vertical only
  │
  │  ── 34px ──
  │
  │  (All projects 24)  Active 12   At risk 6   Completed 6  ← pills; selected = blue fill
  │
  │  ── 22px ──
  │
  │  ( Search projects )  [Filter · 2]  [Sort by Start]   24 of 31
  │  Status ▾   Project manager ▾   Schedule health ▾   Type ▾   Clear filters
  │
  │  ── 22px ──
  │
  │  ▢  NAME              STATUS      HEALTH    PM      START    PROGRESS
  │  ─────────────────────────────────────────────────────────── 1px --wx-line
  │  ▢  ⬤ Riverside Off…  ● Active    ● On Tr…  MR      Jun 15   ▬▬▬▬▭ 78%
  │  ─────────────────────────────────────────────────────────── 1px --wx-line-soft
  │
  │  24 of 31 projects · Export CSV · ‹ 1 2 3 ›                ← 12.5px, --wx-mut
  └
```

Held exactly: 46px row height, `min-width: 720px`, the 44px checkbox cell, 30px avatars, `.hs-badge`
pills with their 6px dot and five tones, `.hs-progress` 6px track, `.hs-delta` ±Nd pills, the
sortable `<th>` buttons with their rotated chevron, the 330px sticky rail on Projects and DelayIQs
(now transparent, `top: clamp(26px,3.4vh,44px)`).

Changed: the page card is gone; the five KPI frames are gone; the 34×34 tinted icon squares become
20px inline glyphs keeping their semantic tone colour; the thead fill becomes the ground; the table
wrap keeps its scroll but loses its border and gains an edge mask.

### 6.2 Matrix (crew × day load grid) — the "you can't do this to a heat map" case

You can, because nothing about the heat map changes. Held exactly:

- Column widths `minmax(140px, 1.1fr)` for Crew, 110px under 900px, 124px sticky on phones; Load 84 / 64 / 72px.
- The four discrete load levels: `load-0` transparent, `load-1` 8%, `load-2` 17%, `load-3` 28% of `--sc-concrete`.
- The conflict overlay: 15% `--sc-milestone` fill plus a 2px ring.
- Every cell's `role=tooltip` and its `aria-describedby` → `matrix-tip-<crewId>-<date>` (deliberately not `title`), revealed on hover **and** `:focus-visible`.
- The `.is-live` flash, the utilisation pill's three bands (available <62% green, limited 62–87% amber, busy ≥88% violet), its `aria-label` and `title`.
- The holiday tag and the `.is-off` 0.72 opacity on non-working days.
- The header row's uppercase `MON…SUN` at 11.5/700/0.085em (Register B rung, already correct) over an 11.5px date.
- Crew label 13px/600 over specialty 11.5px `--wx-faint`.
- Cell click → the shared `JobDrawer` for the first booking. No drag (MatrixPage passes no `drag` prop).
- `.sched-matrix`, `.sched-matrix-total b`, `.sched-matrix-util`, `[data-crew-id][data-date]`, `.is-holiday`, `data-tutorial-id="matrix-grid"` and `"matrix-page-title"` — all pinned by tests, all kept.

What changes is the six unlicensed frames around it, and the grid takes `.bf-doc-bleed` so it uses the
full width instead of being letterboxed inside a 1140 card. **Ten resting boundaries become two.**

### 6.3 Gantt

Constrained by `schedule/boundary.test.ts`: `App.tsx` must contain no `sched-` substring and no
`className` containing `gantt-`, and every schedule page except the Gantt must render
`<SchedulePageFrame`. So the document frame is composed **inside `schedule/page.tsx`**, not in
`App.tsx`, and none of its class names contain `gantt-` or `sched-` (`bf-doc-*` is safe on both counts).

`SchedulePageFrame` (`schedule/page.tsx:546`) is already a document header — `.schedule-title-row.dx-hero`
holding `.dx-eyebrow` (dot + eyebrow), `.dx-title` (h1 + `releaseTag`) and `.dx-sub`. It gets the
Register A scale and the new rhythm; the markup barely moves. That single edit re-frames **all seven**
schedule pages at once.

The Gantt specifically:
- The timeline is a licence-2 viewport: one card, `1px solid var(--wx-line)`, 18px radius, `--bf-shadow-card`, `overflow` untouched.
- `.gantt-frame`, `.gantt-sidebar`, `.gantt-sidebar-item`, `.gantt-row-spacer`, `.gantt-marker.is-holiday`, `.gantt-status`, `.gantt-cap-note`, `[data-feature-id]` — all pinned by tests, all kept, including the 300-bar cap note.
- The task-name sidebar keeps a `1px var(--wx-line)` right edge (it is a clipping edge: the timeline scrolls past it).
- Week fit mode, the CPM readout and Re-baseline become a transparent section under the chart, `--bf-app-h3` title, 13px body.
- Bar fills, dependency arrows and the holiday markers keep their existing colours. The one change: bar gradients, if any survive, go flat per §2.

### 6.4 TimeCard — **seven** tabs, not six

The brief says six; the inventory records seven: Time Entry, Labor Cost, Crew & Assignment, Approvals,
Integrations, Reporting, Compliance. Planning for six would silently orphan one, so: seven.

- Page header: eyebrow / `--bf-app-title` "TimeCard" / lede / actions.
- The summary stat grid becomes the figure row.
- The tab bar becomes a **sticky section switcher**: a transparent row of 999px pills, 13px/600, `role=tablist` / `role=tab` / `aria-selected` and all seven labels unchanged. Selected = `--wx-blue` fill. Height 44px, `position: sticky; top: 0` inside `.content-scroll`, `background: var(--wx-bg)` **opaque — no `backdrop-filter`** (see §7.6). Seven pills at ~92px plus gaps ≈ 700px, comfortable inside 1140; below 760px it scrolls horizontally with the edge mask.
- Inside each tab, every panel becomes a `.bf-doc-section`: `--bf-app-h2` title, optional 14px lede, content on the ground, `--bf-app-rhythm` between them. Every table, chart, rate table, OT flag, 4-step approval chain, audit trail, module card, payroll export and the offline banner is unchanged. The Log-time form keeps every input; its labels move to 12.5px/600 over 13px fields.
- The Schedule-vs-actual bar chart, the classification pie and the three reporting charts keep their data and get the flat palette: one accent for the primary series, `--wx-green/--wx-red/--wx-amber` for semantics. (`--wx-amber #0032b0` is untouched and renders blue exactly as today, per the fixed constraint.)

### 6.5 Settings — 17 categories

Two panes stay: 17 categories cannot become a single scroll without becoming a different product.

**Left rail.** Loses its card. Transparent, 248px, `position: sticky; top: clamp(26px,3.4vh,44px)`.
Group headings ("Account", "Workspace", "Features", "Admin") at Register B `--bf-app-label`
(11.5/700/0.085em) in `--wx-faint`. All 14 items plus the bottom "BuildFlow AI" spotlight button at
13.5px/600, with the **slide** hover (2px). Active = a 2px `--wx-blue` left bar plus `--wx-ink` at
weight 650 — no pill, no fill. **The class name stays `active`** and `aria-current="page"` stays,
because `App.test.tsx:647` asserts `getByRole("button", {name: "Preferences"})` has class `active`.
The account card at the top keeps its avatar, its `<img>` variant, and — flagged as a pre-existing bug
the redesign must not paper over — its two **hardcoded** strings `"Liam Santos"` / `"Project Manager"`
(`App.tsx:22864-5`), which should read `data.activeUser`. That is a logic fix, out of scope here, but
it will be visually obvious once the rail is quiet.

**Right panel.** `--bf-app-measure-settings: 760px` (≈72ch for the row descriptions). Header keeps its
eyebrow pill ("Account settings" / "Workspace settings" / "Feature settings" / "Admin settings"), its
icon (now a flat `--wx-blue` glyph, no gradient square), its `h1#settings-title` at `--bf-app-title`,
and its description at `--bf-app-lede`. Sections lose their cards; each keeps its `h2` with its
generated `id` and the section's `aria-labelledby`. Rows become a hairline list: `min-height: 52px`,
`1px solid var(--wx-line-soft)` between them, label 13.5px/600, description `--bf-app-prose` 14px at
72ch, control right-aligned. This is the one page where a **`data-rule` hairline under section heads**
is licensed, because Billing and People run past three screens and the reader needs to re-anchor.

**Motion, and the documented trap.** Today `.settings-panel-inner` is keyed by `activeSettingsView`, so
its `sx-rise` stagger replays on every category switch — that is existing behaviour and it stays. It
must **not** be converted to `data-reveal`: `useHudMotion`'s reveal effect has deps `[rootRef]` only,
so after a key change it never re-queries, and the CSS resting state is `opacity: 0`. The panel would
go permanently blank. So Settings keeps the CSS-keyframe approach (`sx-rise`), retimed to
`--bf-dur-enter` on `--bf-ease` with the existing 0.02/0.10/0.18/0.26/0.34/0.42s delays.

**Restoring the top bar on Settings.** Today `page === "settings"` renders neither TopBar nor Sidebar,
which is why search, the bell, the star menu, the AI launcher and the account menu all vanish and the
only way out is one X button. Calm Canvas renders both, so Settings is a page in the app rather than a
mode. **This is the single highest-risk item in the concept** (§8.3) and I would ship it in Phase 3
behind a clean fallback: leave Settings chromeless in Phases 1–2 and it still gets everything above.

### 6.6 Dashboard — the one page where every frame is licensed

`dashGrid.ts` hardcodes `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16`, users have layouts
persisted against those numbers in `dash:layout`, and `hs-home.css:2046` independently declares
`grid-auto-rows: 40px`. Columns are `repeat(6, 1fr)` — fractional — so widening the measure would be
safe for `x`/`w` but would make every persisted panel *wider at the same height*, silently
re-proportioning every saved layout.

**So the Dashboard's measure stays 880px** — and the document frame above it stays 880px too, so the
header, the lede and the board share one left edge. `DASH_ROW_UNIT`, `DASH_GAP`, `grid-auto-rows: 40px`
and `repeat(6, 1fr)` are untouched. A widening to 1140 is a separate, opt-in change with its own
migration; `dashGrid.test.ts` and `hs-home.css` would have to move together.

What does change: the greeting header becomes the document header (topline, greeting, sub and hint
verbatim, at Register A); the Schedule Status band and the Gantt promo become sections (the promo keeps
its card — dismissible boundary, licence 1 — and keeps its `.hs-home-promo` class, which
`App.test.tsx:1278` counts); the 12 panels keep their cards, re-toned from `1px rgba(28,28,26,0.07)` /
12px / `0 1px 2px` to `1px var(--wx-line-soft)` / **18px** / `--bf-shadow-card`; `.dash-block h2`
stays an `h2` with that class (asserted at `App.test.tsx:1255` and `:1407`); `.dash-block-body.is-scrollable`
and its `ResizeObserver`-driven `role=region` / `aria-label` / `tabindex=0` are untouched (`:1376`).
`DashboardSkeleton` gets the same panel recipe so the skeleton still matches the board.

---

## 7. Navigation: minimal, kept, and finally reachable

The rail and top bar keep their geometry — **56px and 56px, exactly** — because `hs-breeze.css`
positions the AI panel against those numbers, 30 breakpoints subtract against them, and the test
harness navigates through them. What changes is their colour and their reachability.

### 7.1 The chrome goes light

A navy `#14203a` bar and a navy rail against a `#f5f6fa` document is a hard seam and the single
loudest thing in the app. Calm Canvas closes it:

| Surface | Today | Calm Canvas |
|---|---|---|
| Top bar | `--hs-navy #14203a`, 56px | `rgba(245,246,250,0.82)` + `backdrop-filter: blur(14px)` + `border-bottom: 1px solid var(--wx-line-soft)`, 56px — the Welcome nav's own recipe |
| Icon rail | navy, 56px | `background: transparent` over the ground + `border-right: 1px solid var(--wx-line-soft)`, 56px |
| Rail icons | `--hs-muted-on-navy #b9c6d8` | `--wx-mut` → `--wx-ink` on hover |
| Rail active | blue fill + blue glow | blue fill (`--wx-blue`) + `--bf-shadow-raised`, no glow |
| Flyout | `--hs-navy-2 #1b2a47`, 12px, 228px min | `--wx-card`, `1px solid var(--wx-line)`, 12px, 228px, `--bf-shadow-float` |
| Flyout locked tooltip | navy bubble, 244px | `--wx-ink` fill, `#fdfcf9` text, 244px — the ink-pill grammar |
| Menus (create / bookmarks / notifications / account) | white on navy bar | `--wx-card`, 12px, `--bf-shadow-float`; `hs-pop` retimed to `--bf-dur-press` 0.18s on `--bf-ease` |

The navy tokens (`--hs-navy*`, `--hs-text-on-navy`, `--hs-muted-on-navy`, `--hs-dim-on-navy`) stay
**declared** — `hs-breeze.css` re-declares `--bfz-navy: #14203a`, `assistant-global.css` declares its
own `--wx-*` set, and the `styles.css` tutorial block uses `#2f6bff` literals. Four files carry
hard-coded shell colour and must be touched together: `app-shell-hubspot.css`, `hs-breeze.css`,
`assistant-global.css`, `styles.css` (tutorial block). Missing one leaves a navy assistant panel
floating on a light shell.

While in there: `hs-breeze.css` hard-codes `top: 56px; left: 56px`. Change to
`top: var(--hs-topbar-h, 56px); left: var(--hs-rail-w, 56px)`. Same rendered pixel, and it stops
being a landmine.

### 7.2 Every nav category's home — unchanged

| Rail hub | Pages | Home in Calm Canvas |
|---|---|---|
| Home | `dashboard` | unchanged. Document header + 12-panel board at 880. |
| Bookmarks | `bookmarks` | unchanged. Its own hub, `.hs-index` document; both cards dissolve to sections ("Bookmarks" starred groups + "Schedule views" tiles + "All pages" catalogue). |
| Schedule | `schedule`, `month`, `week`, `list`, `kanban`, `matrix`, `gantt` (7) | unchanged. All seven re-framed at once via `SchedulePageFrame`. Landing keeps "The whole plan, at a glance." (the harness matches it). |
| Operations | `projects`, `crews` | unchanged, index-page template |
| Sales | `contacts`, `companies`, `deals` | unchanged, index-page template, Beta pills kept |
| Resources | `equipment`, `materials` | unchanged, index-page template |
| Field | `field`, `map`, `delayIQs` | unchanged. Map's four `.panel`s become sections; the expandable `LocationMap` card grid is a licence-2 bleed element. |
| Reporting | `reports` | unchanged. `reportsMode` top bar and `.reports-topbar` kept. The last `PageTitle` call site (`App.tsx:38889`) migrates to `DocHeader`, retiring that primitive. |
| TimeCard | `timecard` | unchanged, 7 tabs (§6.4) |
| Settings (bottom slot) | `settings` | unchanged position, unchanged `aria-label`/`title` "Settings" |

All 22 `navItems` labels, all 9 hub labels, all `aria-label`/`title` strings, the release-dot/pill
mechanics (`pageReleaseTag()`, `New` blue / `Beta` violet `#a78bfa`), the `.recommended` add-on dot,
the add-on lock arrow, the `.hs-flyout-tip` copy from `addOnTipCopy()`, the hover-reveal bookmark star
and the `SavedViewsFlyout` block (whose CSS lives in `schedule.css:1945-1965`, not
`app-shell-hubspot.css` — restyle both or the saved-views rows are left behind) are preserved verbatim.

### 7.3 The three shell defects this concept fixes

**(a) No click/tap path to a flyout.** Today it opens on `mouseenter` and `focus` only, so a touch
user reaching Schedule gets its first page and can never see Month/Week/List/Kanban/Matrix/Gantt from
the rail. Click must stay "navigate to the hub's first unlocked page" — `openSchedule()` and
`settings.test.tsx:113` both depend on it. So the touch path is added *beside* it: an
`onPointerDown` handler on `.hs-rail-slot` that, when `event.pointerType === "touch"`, opens the
flyout and suppresses the click. Gated behind `@media (hover: none)` for the visuals. `fireEvent.click`
in jsdom emits no pointer events, so this is invisible to the suite.

**(b) No mobile drawer anywhere.** New ported component (§9.3). Below 900px the rail is
`display: none` and a hamburger appears in the top bar (`aria-label: "Open navigation menu"` — a
string no test matches). The drawer lists all 9 hubs expanded with all 22 pages, plus the four
controls the 560px breakpoint currently destroys.
**Mount gate, and this is load-bearing for the suite:** the drawer is mounted only when
`typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches` **and**
it is open. jsdom answers `matches: false`, so it never enters the DOM under test and cannot create
duplicate accessible names for the 22 page labels that `openAppPage()` matches by `menuitem` name.

**(c) At ≤560px the star, create, help and settings buttons are `display: none`, so a phone user
cannot start the tutorial** — and the tutorial's own final step spotlights that help button.
Fix: **the help button stays visible at every breakpoint** (it is 32px and it owns
`data-tutorial-id="tutorial-restart-button"`, the tutorial's last anchor). The star, create `+` and
settings gear move into the drawer footer instead. At ≤560px the bar carries: brand mark, search
(icon-only, same `aria-label` "Search BuildFlow"), AI sparkle, help, bell, account. The drawer footer
carries a second "Help & tutorial" row that calls the same handler and **does not** carry the
`data-tutorial-id` — one anchor, one spotlight.

### 7.4 Every global control, itemised

| Control | Calm Canvas |
|---|---|
| Brand + wordmark | kept; wordmark still hidden below 1040px; `aria-label` "BuildFlow home" → `dashboard` |
| Search box | kept exactly as a read-only decoy inside its `<label>` with both `onClick` and `onFocus` opening the palette, and its `⌘K` `<kbd>` chip. `findByLabelText("Search BuildFlow")` is how the harness knows it is in the app — it must not change. Restyled to a 999px pill, `1px var(--wx-line)`, transparent fill, `:focus-within` → `--wx-card` + `--bf-app-focus-ring`. |
| AI sparkle | kept, keeps the blue→purple gradient (the app's only gradient), keeps `hs-top-twinkle` |
| Bookmark star menu | kept whole: every page row with its icon, label and right-aligned `<em>` hub name; every view row with its `Link2` icon and detail; the hover-reveal `×` on each; both footer actions ("Bookmark this view · …" / "Bookmark \<page\>"); the empty-state copy verbatim. Two golds unify to `#e8a33d` (the top bar uses `#f0b354` today — flagged as a change). Rows get the slide hover. |
| Create `+` menu | kept, including the `hs-top-spin` 180°/45° rotation |
| Notification bell | kept: the swing keyframe, the `.bubble` count, the 7-item cap, `buildNotificationItems`. **One piece of new copy proposed, flagged for rejection:** an empty state, because a fresh workspace opens an empty panel today. Everything else the inventory warns about (read/unread, per-item actions, "view all") is a feature, not a re-skin, and is out of scope. |
| Verify-email badge | kept; `App.test.tsx:1263` asserts at most one notice above the board |
| Account menu | kept: `role=menu`, `aria-label "Account menu"`, the "Settings" `menuitem`, no "Demo role" (`App.test.tsx:612`) |
| Settings gear (top bar) | kept, `aria-label "Settings"`. Both gears (rail + bar) must survive: `settings.test.tsx:113` asserts ≥2 buttons named exactly "Settings". |
| Command palette (⌘K) | kept. `command-palette.css` has no transitions; it may gain a 0.18s `--bf-ease` entrance, but the palette focuses its input in a `requestAnimationFrame`, so the entrance must not delay mounting. Restyled to `--wx-card` / 12px / `--bf-shadow-float`. |
| Ask-AI FAB | kept, `z-index: 60`, hidden while the assistant is open, suppressed on Settings today (and still suppressed if 7.5's top-bar restoration ships, unless changed deliberately) |
| BreezeAssistant | kept **mounted-but-hidden** via `aria-hidden` + `display: none` on `.bf-breeze:not(.is-open)`. This is not cosmetic: `schedule/viewKeys.ts dialogIsOpen()` filters on hidden / `aria-hidden` / `checkVisibility`, so mounting it conditionally, or hiding it with `opacity`, breaks the 1–6 schedule view keys. |
| Tutorial anchors | every `data-tutorial-id` preserved verbatim: `nav-<page>` on rail buttons and flyout rows, `tutorial-restart-button`, `dashboard-setup-banner`, `matrix-page-title`, `matrix-grid`, and the schedule frame's `titleTutorialId` / `boardTutorialId`. `DocHeader` takes a `titleTutorialId` prop and `DocBleed` a `tutorialId` prop so the frame forwards them rather than swallowing them. |
| "What's new" modal + add-on prompt | kept. They share `.hs-upd-*` (the add-on dialog is `.hs-upd-dialog.hs-addon-dialog`), so the shared base must be split before either is restyled or one restyle hits both. |
| Routing | untouched: `popstate`, `pushState`/`replaceState`, the four `?from=`/`?oauth=` entry routes, `document.title`, the scroll-to-top on page change with its jsdom guard, the demo-session fallback, `retryTransient`'s 400/900/1600ms backoff. Presentation only. |

### 7.5 Losing borders without losing the scroll cue

Removing the table and board borders removes the only signal that content continues past the right
edge. That cost is real and it needs a component, not a shrug: `scroll-edge.tsx` (§9.5) adds a 24px
`linear-gradient` mask on whichever edge is actually scrollable, driven by a `ResizeObserver` plus a
`scroll` listener — the same pattern `.dash-block-body.is-scrollable` already uses on the Dashboard,
including its `role=region` / `aria-label` / `tabindex=0` only-when-scrollable behaviour, so
keyboard reachability is preserved. It wraps tables and boards; it does **not** replace the Dashboard's
own implementation (`App.test.tsx:1376` asserts that class).

### 7.6 One rule that is easy to get wrong

The tutorial spotlight measures with `getBoundingClientRect`, writes CSS custom properties, and draws
its scrim as a **9999px `box-shadow`** rather than an overlay. So any new `transform`, `filter`,
`backdrop-filter`, `contain` or `will-change` on an *ancestor* of a spotlit element will mis-place the
light or cover the scrim. Consequence, stated as a rule: **`backdrop-filter` is licensed in-app on the
top bar only** (it is not an ancestor of page content). Every sticky sub-nav uses an opaque
`background: var(--wx-bg)` instead. The ground is flat, so a blur buys nothing there anyway.

---

## 8. Motion

- **Reveals are one-shot, and the engine already does that.** Change `useHudMotion`'s two constants to the documented contract: `threshold: 0.16`, `rootMargin: "0px 0px -6% 0px"`. Keep the unobserve, keep the reduced-motion branch that adds `.in` to everything at once, keep the `IntersectionObserver === undefined` fallback (jsdom).
- **Rescaled for density:** `--bf-app-reveal-shift: 12px` (Welcome: 30px), `--bf-app-dur-reveal: 0.55s` (1s), `--bf-app-reveal-stagger: 50ms` (90ms). Reason with the numbers: a 30px rise on a 46px table row moves the row 65% of its own height, and at 1s the page is still settling when the eye arrives. 12px over 0.55s finishes inside the time it takes to move a pointer from the rail to the content.
- **Reveals attach to sections, never to rows or cells.** A `data-reveal` on a 40-row table ripples. Budget: **at most 6 revealed elements per page** — the header, and up to five sections.
- **The trap, restated as a build rule.** Any element carrying `data-reveal` or `data-reveal-stagger` **must have a static `className`**. The CSS resting state is `opacity: 0`, `.in` is added imperatively, and a re-render with a computed class string wipes it — the element is then invisible forever, with no error. `SchedulePageFrame` already does this correctly (`data-reveal={motion || undefined}` on elements whose class strings are literals); the new frame must too. Worth a test: assert every `[data-reveal]` in a rendered page has `classList.contains("in")` after the observer flush.
- **Kept verbatim:** `hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping`, `hs-top-spin`, `hs-top-gear`, `hs-top-bell`, `hs-top-badge`, `hs-top-twinkle`, `hs-flyout-in`, `hs-tag-in`, `hs-pop`, `sx-rise`, the `Loader2 .spin`, and the `quantum-cloud-loader` while BuildFlow AI thinks. All retimed onto `--bf-ease` where they use another curve.
- **Reduced motion: extend, do not reinvent.** The new app tokens (`--bf-app-lift`, `--bf-app-reveal-shift`, `--bf-app-reveal-stagger`) are added to the **existing** `@media (prefers-reduced-motion: reduce)` block in `design-tokens.css`, which already zeroes their Welcome counterparts. One new block, in `doc-frame.css`, kills the sub-nav pill indicator transition and the scroll-edge mask fade. Total: 10 existing blocks → 11.

---

## 9. Components to build, in this repo's recipe

The recipe, read off `components/ui/stagger-cards.tsx`: a header comment naming the source and the
token mapping; no Tailwind, no `cn`, no `@/` alias; inline `style` objects for structure and one
scoped `<style>` block (or one scoped stylesheet) for state and pseudo-selectors; every token read as
`var(--wx-x, #literal)` with a real fallback; generic over the item type with the caller supplying
`renderCard`; imperative handles via `forwardRef` + `useImperativeHandle`; `matchMedia` with an
`addEventListener("change")` for the breakpoint.

**9.1 `client/src/components/ui/document-page.tsx`** — the frame. Not a 21st port; the concept itself.
Exports `DocPage`, `DocHeader`, `DocSection`, `DocBleed`, `DocFigureRow`.
```
DocHeader({ eyebrow, title, releaseTag, lede, actions, titleTutorialId, measure })
DocSection({ title, lede, actions, rule?, children })   // transparent; `rule` opts into a head hairline
DocBleed({ tutorialId, ariaLabel, children })            // the one out-of-measure element
```
Structure only in inline styles; state in one scoped sheet `client/src/doc-frame.css`, scoped to
`.bf-doc` with its token block at the top of the file (the pattern `crew-scheduling-apple.css` uses).

**9.2 `segmented-pills.tsx`** — ported from 21st.dev's animated-tabs / segmented control. A
`role=tablist` of 999px pills with an indicator slid by `getBoundingClientRect` over 0.28s on
`--bf-ease`. Props `items`, `value`, `onChange`, `ariaLabel`, `renderLabel`, `counts`. Consumers:
TimeCard's 7 tabs, the index pages' saved-view tabs (with their `.hs-view-count` pills), the schedule
view switcher. Must preserve `role=tab`, `aria-selected` and every existing label and count string.

**9.3 `nav-drawer.tsx`** — ported from 21st.dev's sheet/sidebar-drawer. Left sheet, scrim, focus trap,
`Escape` to close, `inert` on the shell behind, `--bf-shadow-float`, 12px radius on the inner edge,
`translateX(-100%) → 0` over `--bf-dur-panel` 0.3s on `--bf-ease`. Conditionally mounted per §7.3(b).

**9.4 `figure-row.tsx`** — the KPI strip without frames. `items: { icon, label, value, unit, note, tone, onOpen? }`,
vertical `1px var(--wx-line-soft)` separators, `font-variant-numeric: tabular-nums`, `--bf-app-figure`.
**No count-up animation** — a figure that animates on every data refresh is noise, and the Welcome
Page's `WxCounter` earns its animation by firing once on a marketing scroll. Clickable figures
(Dashboard feed tiles) get a background wash on hover plus the figure turning `--wx-blue`; no resting
border. It emits `className="… bf-figures"` / `"kpi-card bf-figure"` so the existing class names
survive (§10).

**9.5 `scroll-edge.tsx`** — §7.5. `ResizeObserver` + `scroll`, sets `data-scroll="left|right|both|none"`,
mask via `mask-image: linear-gradient(...)`. Keyboard-reachable when scrollable, mirroring
`.dash-block-body.is-scrollable`.

Five files plus one stylesheet. Nine ported components exist today; this makes fourteen.

---

## 10. Stylesheets

**Do not reorder `main.tsx`.** The order is hand-tuned and ends with `app-shell-hubspot.css` and the
comment "loads last so it wins."

- **Add** `client/src/doc-frame.css` as the new final import, after `app-shell-hubspot.css`. Everything
  it declares is scoped to `.bf-doc`, `.bf-figures`, `.bf-pills`, `.bf-drawer` — class prefixes that
  appear nowhere in the 57 sheets today, so it cannot collide. Projected ~900 lines.
- **Delete** `sidebar-redesign.css` (307 lines, `.sidebar-rx`, 43 rules, appears nowhere in `App.tsx`).
  Also retire the `Sidebar`'s inert `collapsed` / `onToggleCollapsed` props and the inert
  `sidebar-collapsed` shell class, so nobody "fixes" a sidebar that does not exist.
- **Delete `--wx-serif`** from the 10 app scopes and rewrite the 27 rules reading it to
  `var(--bf-font-sans)`. Every one is already overridden, so this is a zero-pixel change — verify with
  the computed-style harness that proved the earlier stylesheet merge lossless.
- **Do not touch `--wx-amber: #0032b0`** in any of the 7 scopes. It renders blue today (the "Planned"
  badge computes to `rgb(0,50,176)`) and it renders blue after.
- **Do not delete the dissolved frame rules in Phase 1.** Let `doc-frame.css` win, ship, verify, then
  sweep `.hs-index-card`, `.hs-kpi`, `.panel` and `.settings-section` in Phase 5 under the
  computed-style harness. Projected sweep: −2,000 to −3,500 lines of the 60,798.
- Net sheet count 57 → 57. Net lines roughly −2,400 by Phase 5.

**Class-name additivity is a hard rule.** Tests assert on class names, so the frame *adds* classes and
never replaces a pinned one. Verified pins that must survive verbatim, from reading the suite:

`.schedule-kpis .kpi-card` · `.sched-views` · `.sched-list-day` · `.sched-kanban` · `.sched-cal` ·
`.sched-cal-cell` · `.sched-matrix` · `.sched-matrix-total b` · `.sched-matrix-util` ·
`.sched-kan-lane` · `.sched-kan-card` · `.sched-kan-more` · `.sched-view-key` ·
`.sched-firstrun-steps li.is-done` · `.schedule-job` · `.schedule-cell` · `.crew-row` ·
`.crew-row.is-lazy` · `.unassigned-list` · `.gantt-frame` · `.gantt-sidebar` · `.gantt-sidebar-item` ·
`.gantt-row-spacer` · `.gantt-marker.is-holiday` · `.gantt-status` · `.gantt-cap-note` ·
`[data-feature-id]` · `[data-crew-id][data-date]` · `.is-holiday` · `.is-active` · `.dash-block h2` ·
`.dash-block-body.is-scrollable` · `.dash-board .cc-link` / `.cc-rec-btn` / `.cc-btn` ·
`.cc-spark` / `.cc-spark-line` / `.cc-trend.flat` · `.business-context-banner` ·
`.business-context-verify` · `.hs-home-promo` · `.active` on the Settings rail button · every
`[data-tutorial-id]`.

So, for example, the Matrix KPI strip ships as
`<div className="schedule-kpis bf-figures">` → `<div className="kpi-card bf-figure">`, and
`doc-frame.css` zeroes the inherited `.kpi-card` border, radius and shadow from the `.bf-figure` side.

---

## 11. Test risk, honestly

**346 tests, 37 files. The concept's structural bet is that the funnel and the rail do not move — and
that bet is what keeps this number small.**

### 11.1 Zero risk (the expensive path)

The harness reaches the dashboard by clicking `"Login from welcome navigation"` → heading
`"Welcome back."` → `"Create an account"` → heading `"Create your workspace."` → the 14 trade cards by
accessible name, and `openAppPage()` clicks a rail hub by `^<Hub>( \(.*\))?$` then a flyout
`menuitem` by label. `openSchedule()` clicks the hub and expects
`"The whole plan, at a glance."`. **Calm Canvas changes none of those strings and none of that
structure.** The rail, the 9 hubs, the flyout, the `menuitem` names, the release-tag suffix regex and
the auth headings all survive. Nearly every one of the 346 tests runs through that path, and nearly
every one is therefore untouched.

Also untouched, because they never render DOM: the 24 pure-logic suites (`cpm`, `conflicts`,
`rebook`, `filters`, `savedViews`, `dashGrid`, `export`, `lanes`, `statuses`, `workCalendar`,
`linkBookmarks`, `viewKeys`, `announcements`, …) — roughly **150 tests**.

### 11.2 Low risk, mechanical if it breaks

| File | Tests | Exposure | Mitigation |
|---|---:|---|---|
| `schedule/boundary.test.ts` | 8 | `App.tsx` must contain no `sched-` and no `className` matching `gantt-`; every non-Gantt page must render `<SchedulePageFrame` | frame lives in `schedule/page.tsx`; prefix is `bf-doc-*`, which matches neither pattern. **Naming rule: nothing in the new frame may contain `sched-` or `gantt-`.** |
| `schedule/pages.test.tsx` | 41 | 22 class/attribute assertions, all listed in §10 | additive class names; the frame wraps, never renames |
| `schedule/scale.test.tsx` | 6 | 7 page roots (`.sched-views`, `.schedule-cell`, `.sched-list-day`, `.sched-kanban`, `.sched-cal`, `.sched-matrix`, `.gantt-frame`) plus lane windowing and the 300-bar cap | roots kept. Note: it `console.log`s `document.querySelectorAll("*").length` per page — the frame adds ~6 wrapper nodes per page, so the logged number rises. It is logged, not asserted, so nothing fails; but do not let it drift. |
| `App.test.tsx` | 62 | 14 class/DOM assertions (§10), plus "shows the Dashboard's shape while the workspace loads" | `DashboardSkeleton` must adopt the same panel recipe as the board |
| `tests/index-pages.test.tsx` | 12 | the index template is the biggest visual change | it asserts on roles and accessible names; every label, count, view name and column header is preserved verbatim |
| `tests/tutorial.test.tsx` | 5 | the bell must precede the account control **in DOM order** (`:286`), and every step's anchor must resolve | the top bar's action-cluster order is set by CSS `order` (create 1 · help 2 · settings 3 · notifications 4 · divider 5 · account 6), not DOM order — so re-order visually in CSS, never in the JSX |
| `tests/map.test.tsx` | 7 | the locked flyout item must open the dialog named `"Get Map & Field Ops"` and not the Map page | add-on gate untouched; note `lockedAddOnForPage` exists in **three** parallel copies (`App.tsx:2271`, `20544`, `20401`) that must stay in step |
| `components/CommandPalette.test.tsx` | 4 | the palette resets its query and focuses its input in a `requestAnimationFrame` | any entrance animation must not delay mounting |

### 11.3 The one genuinely risky item: restoring the top bar on Settings (§6.5)

While `page === "settings"` neither TopBar nor Sidebar renders today. Rendering them adds a **third**
button named "Settings" and a second account control **while on the Settings page**, so any
unscoped `getByRole("button", { name: "Settings" })` taken from inside Settings becomes ambiguous.
Exposed, by name:

- `tests/settings.test.tsx:83` "opens Settings from the top-bar account menu and closes back to the page it came from"
- `tests/settings.test.tsx:113` "keeps the account menu and the Settings controls on every rail hub"
- `App.test.tsx:623` "opens Settings from the reports username button"
- `App.test.tsx:634` "opens the Settings page from the account menu and closes back to the app"
- `tests/schedule.test.tsx:44` "opens Settings from the Week page account menu"
- plus any tutorial step whose anchor is now duplicated

Roughly **6 tests**. Every fix is the same mechanical change — wrap the query in
`within(screen.getByRole("banner"))` or `within(settingsPanel)` — not a rewrite. **Recommendation:
ship it in Phase 3 as its own commit with those six tests updated in the same commit, or drop it.
Everything else in §6.5 lands without it.**

### 11.4 Honest total

- **~150 tests** cannot break (pure logic).
- **~180 tests** navigate the untouched funnel and assert on roles and accessible names that are preserved verbatim; expected breakage **0**, residual risk from the `.in`-class reveal timing change and node-order shifts.
- **~10 tests** assert on class names inside restyled surfaces; kept green by the additivity rule in §10, but they are the ones to run first.
- **6 tests** break by design if §11.3 ships, with a known one-line fix each.

Estimated failing tests on a correct Phase 1–2 implementation: **0**. On Phase 3: **6, deliberately.**

---

## 12. Phasing

1. **Tokens and the frame.** `design-tokens.css` gains the `--bf-app-*` block (repointing `--bf-focus-ring` to the accent) and the new app tokens join its existing reduced-motion block. Add `document-page.tsx` + `doc-frame.css`. Zero pixels move.
2. **The index template.** Migrate one page (Projects, the fullest instance) end to end, then the other nine. `figure-row.tsx` + `scroll-edge.tsx` land here. This is where the concept either reads calm or does not — judge it before going further.
3. **Chrome light + reachability.** Top bar, rail, flyout, all four menus, the palette, `hs-breeze.css`'s hard-coded offsets, `nav-drawer.tsx`, the touch flyout path, the ≤560px help button. The four hard-coded-colour files move together.
4. **The seven Schedule pages** via `SchedulePageFrame`, then the Gantt's stage, then Map, TimeCard (`segmented-pills.tsx`) and Settings.
5. **The Dashboard** (frame only; board untouched), then the sweep: delete the dissolved frame rules, delete `sidebar-redesign.css`, delete `--wx-serif`, all under the computed-style harness against the 1,945-item acceptance checklist.
6. **Optional, separate:** the Settings top bar (§11.3), and the Dashboard measure widening (§6.5).

---

## 13. Where this concept is weak

1. **It is the least ambitious of the four on navigation.** The rail is a 56px column of unlabelled icons whose sub-pages open on hover; Calm Canvas fixes the touch and phone paths but does not question whether nine unlabelled icons is the right way to reach 22 pages. If the real complaint is "I cannot find anything," this concept does not answer it.
2. **Removing frames removes grouping for free, and grouping is sometimes information.** On a page with four adjacent transparent sections at 45px apart, the reader must infer boundaries from rhythm alone. That works on a marketing page read once, top to bottom; it is less certain on a page scanned fifty times a day. The `data-rule` hairline is the escape hatch, and if it ends up on most sections the concept has quietly become "cards with thinner borders."
3. **A 42px page title on an operational screen may read as wasteful to the people who use it eight hours a day.** ρ = 0.44 is a defensible number, not a validated one. The clamp floor of 30px is the hedge; the honest test is whether a project manager wants a 42px word "Projects" above their table at all.
4. **The scroll-edge mask is a weaker affordance than a border.** A 24px gradient tells you content continues; a border plus a visible scrollbar told you where the world ended. On the widest tables (`min-width: 720px` in a 1140 measure, or the 300-bar Gantt) this is a real, if small, regression.
5. **The light top bar deletes the app's only strong colour anchor.** Navy chrome makes "I am inside the workspace" instant. A light bar on a light ground is calmer and less legible as a state; the `1px var(--wx-line-soft)` bottom edge and the `blur(14px)` are doing a lot of work for one hairline.
6. **Four files carry hard-coded shell colour** (`app-shell-hubspot.css`, `hs-breeze.css`, `assistant-global.css`, `styles.css`'s tutorial block). Phase 3 is one careless commit away from a navy AI panel on a light shell, and no test would catch it.
7. **The Dashboard barely changes**, because all twelve of its frames are licensed. If the brief's real target was the Dashboard, this concept delivers a new header and a radius change there and spends its energy on the ten index pages instead.
8. **Restoring Settings' top bar is right and it costs six tests.** I have argued for it; a reviewer who wants zero test churn should cut it, and Settings then keeps its one-way-door feel.
