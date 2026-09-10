# Operations cluster — screen-by-screen redesign mapping

**Cluster:** operations — Projects, Crews, Equipment, Materials (plus their dialogs, the schedule
importer, the add-on gate, the two shared primitives and the two marketing product pages the
records own).

**Records worked from, in full including both `completenessCheck` blocks:**
`inventory/projects.json` (8 screens, 86 information items, 46 actions, 13 table columns,
17 test anchors, 21 risks, 17 `missingInformation` + 7 `missingActions` + 2 `missingScreens`) and
`inventory/crews-equipment-materials.json` (12 screens, 126 information items, 78 actions,
15 risks, 20 `missingInformation` + 9 `missingActions` + 6 `missingScreens`).

**Designed inside:** the "preserve" / *Daylight Rail* shell (56px top bar, 56px rail, hover flyouts,
`.bf-shell` scope, one appended stylesheet `app-shell-daylight.css`, one kill switch), with the
judges' grafts from canvas (card licence + counted boundary audit, `.bf-doc-bleed`, the reveal
arithmetic, class-name additivity, the gradients forced flat), hybrid (the ladder stated as a ratio,
`density.test.ts`) and editorial (the accent budget as a count, the focus-reachable hover-reveal
layer, the DO-NOT-MOVE header comments).

Nothing in this cluster touches `--hs-topbar-h`, `--hs-rail-w`, `DASH_COLS/ROW_UNIT/GAP`, the rail
`offsetTop` maths, the auth funnel, or any accessible name the harness navigates by.

---

## 0. Where this cluster actually stands against the Welcome Page

The cluster-specific warning is right that these four pages "already moved onto the `cc-*`
command-center language" — but that move is narrower than it sounds, and I verified exactly how
narrow.

### 0.1 What the `cc-*` / `-rx` move already delivered

All four page scopes (`.proj-rx`, `.crew-rx`, `.equip-rx`, `.mat-rx`) declare a `--wx-*` block that
agrees with `welcome-redesign.css:11` on every unanimous token: `--wx-bg #f5f6fa`, `--wx-ink
#1c1c1a`, `--wx-mut #575550`, `--wx-faint #8a877e`, `--wx-line rgba(28,28,26,0.13)`, `--wx-line-soft
rgba(28,28,26,0.07)`, `--wx-card #ffffff`, the gradient trio, `--wx-green #188038`. The accent is
already `#2f6bff` in all four. The page frames are byte-identical across the four files:

```css
margin: -22px -28px -34px;
padding: clamp(26px, 4.5vh, 52px) clamp(20px, 4vw, 56px) clamp(56px, 9vh, 100px);
min-height: calc(100vh - 87px);
isolation: isolate;
overflow: clip;
```

At 1440×900 that resolves to **40.5px top / 56px sides / 81px bottom**. So the canvas graft's "72px
bottom tail is free air" is *already paid for on these four pages* — they are the only surfaces in
the app that breathe at Welcome scale anywhere. Preserve §8's `--bf-app-gutter-y/-x` (28/32/40) would
**reduce** that. **Declared deviation, scoped to this cluster: keep the `-rx` frame's own padding.**
It is already the language; cutting the tail from 81px to 40px would be moving away from it.

### 0.2 What still differs — seven named gaps, with the numbers

1. **The pages you see are not painted by `--wx-*` at all.** `hs-index.css` paints them from a
   parallel `--hsx-*` set that diverges on four values: `--hsx-ink #14203a` (a **third ink** the
   Welcome Page does not have — it carries every `h1` and every strong cell), `--hsx-line #e6e8f0`
   and `--hsx-line-soft #eef0f4` (**opaque greys** instead of the ink-alpha hairlines), `--hsx-hover
   #f6f8fc`, plus the literal `#fafbfd` `thead` fill. The `-rx` scopes now only contribute the
   background field and the dialog re-skins. **The palette came across; the surface species did
   not.**
2. **Radius: five rungs, four of them off the ladder.** `.hs-index-card` 14px, `.hs-panel` 12px,
   `.hs-kpi` 10px, `.hs-table-wrap` 10px, `.hs-btn`/`.hs-row-action` 8px, `.hs-page-btn`/`.hs-view`
   6px, `.hs-index-title button` 6px. The Welcome ladder is 999/26/20/18/12/8. 14px and 10px and 6px
   are not on it. The paper card is 18–20px with `0 10px 30px rgba(28,28,26,0.05)`; `.hs-index-card`
   is 14px with `0 1px 2px rgba(20,32,58,0.04)`. One is a sheet of paper, one is a Material widget.
3. **No hover grammar, and the curve is declared but unread.** `--hsx-ease:
   cubic-bezier(.22,1,.36,1)` is declared at `hs-index.css:32` and **no live rule reads it** — the
   five real transitions are `0.12s ease` (row background), `0.15s ease` (`.hs-view`), `0.16s ease`
   (`.hs-chip`, `.hs-row-action`). Rows get a wash, pills get a wash, `.hs-link` gets an underline,
   `.hs-kpi` gets nothing. **Zero of the four moves.**
4. **No reveals, on a fully wired engine.** All four `-rx` files declare the complete
   `[data-reveal]` / `[data-reveal-stagger]` system and `useHudMotion` adds `.dx-ready` and observes
   for them — and all four pages carry **zero** `data-reveal` attributes. The reveal half is inert;
   only the pointer half runs.
5. **No eyebrow role.** `.hs-kpi-label` is 11.5px/600 sentence-case `--hsx-mut`; `thead th` is
   12.5px/650/0.01em on `#fafbfd`. The Welcome eyebrow is 11.5px/650/**0.045em uppercase**/`#8a877e`.
   Same size, different role — which is why the highest-yield rule in the whole plan is free here.
6. **Rhythm is 18px.** `.page-stack { gap: 18px }` (`.crew-rx` overrides to 22px) between the figure
   strip, the index body, the Equipment footnote and the Crews legend; card padding 18/22/16, head
   margin 12px, views 14px, toolbar 10px, filters 12px, foot 14px, KPI gap 12px, rail gap 16px, grid
   gap 22px. Against a 108px section beat.
7. **Two extra near-whites and one banding violation.** `#fafbfd` (thead) and `#f6f8fc` (row hover)
   are a fourth and fifth off-white on a page whose ground is `#f5f6fa`; and the three
   42/38/50vw `blur(50px)` `.dx-aurora` blobs plus the 480px `.dx-cursor` follower are the app's only
   "alternating light/dark banding," which the source explicitly forbids.

### 0.3 Four findings from source that change the plan (all verified, none in either record)

**(a) The serif is not dead in this cluster — it renders, at up to 42px.** Decision #4 and
`DESIGN_TOKENS.md` both say `--wx-serif` is overridden everywhere so nothing renders serif; that
audit walked *pages*, not *open dialogs*. In this cluster:

| Selector | File:line | Size | Overridden later? |
|---|---|---|---|
| `.pdx .pdx-title` | `project-dialog-redesign.css:158` | `clamp(28px, 3.4vw, 42px)`/500/−0.015em | **No.** Nothing else in the 57 sheets selects `.pdx-title`. |
| `.equip-rx .crew-dialog-header h2` | `equipment-redesign.css:475` | 24px (from `styles.css:12253`)/500 | **No.** Only earlier, weaker rules exist. |
| `.mat-rx .crew-dialog-header h2` | `materials-redesign.css:442` | 24px/500 | **No.** |

`--wx-serif` in all four of these files is the Palatino stack
(`"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman",
serif`). So **nine dialog titles in this cluster render in Palatino today** — New/Edit Project,
Delete project, Add/Edit Crew, Delete crew (6 × `.pdx-title`), plus Add/Edit Equipment, Remove
Equipment, Add Material (3 × `crew-dialog-header h2`). Of the 14 `var(--wx-serif)` reads in my five
files, **3 are live and 11 are dead** card-era rules. Executing decision #4 here is therefore a
**visible** change, not the zero-pixel change preserve §3c/§13-G assumes. It is still the right
change — the Welcome Page's own `--wx-serif` holds the Inter stack — but it must be shipped as a
declared change with a screenshot, not as cleanup.

**(b) The display register already exists in this cluster, and it is 42px.** Preserve §12.2 says
"No display type anywhere. The largest thing on any app page is 26px." That is wrong by 16px:
`.pdx .pdx-title` is `clamp(28px, 3.4vw, 42px)`. Which means the hybrid graft's ratio sentence is
already true here without raising a single page title:

> row **13px** → page title **26px** = **2.00×** → dialog title **42px** = **3.23×**, against the
> Welcome Page's own 12px → 96px = **8.0×**. The product's range is **40% of the marketing page's, on
> one continuous ladder.**

**(c) The gradient trio is already spent seven times in-app, not once.** `.pdx .pdx-title em`
(`project-dialog-redesign.css:167`) is `font-style: italic` + `linear-gradient(105deg, var(--wx-g-blue),
var(--wx-g-purple) 55%, var(--wx-g-coral))` + `background-clip: text` — the Welcome hero's `em`
treatment, verbatim, on the trailing word of every `.pdx` title. Per the record's own correction #3
that is 7 dialog families across 6 pages. So preserve's "in-app the trio survives as one 36px button"
undercounts by seven. **These pages' modals are the most Welcome-faithful surface in the product**:
display type, italic gradient `em`, ink pill primary, outline-line cancel, 26px radius,
`--pdx-ease: cubic-bezier(.22,1,.36,1)`, `56ch` prose measure, and a complete reduced-motion block at
`project-dialog-redesign.css:699`. The only thing wrong with them is the Palatino family — finding (a).

**(d) "Primary" is already two different buttons, 200px apart.** `.hs-btn-primary` on the index is
blue `#2f6bff` + `0 6px 16px rgba(47,107,255,0.28)`. `.pdx .pdx-save` — and
`.equip-rx/.mat-rx .crew-dialog .primary-button` — is the **ink pill**: `var(--wx-ink)`, `#f9fafd`
text, 999px, `0 8px 22px rgba(28,28,26,0.2)`, hover `#000` + `0 14px 32px rgba(28,28,26,0.28)` +
`translateY(-1px)`. That is `.wx-btn-ink` to the pixel. `.pdx-cancel` is `.wx-btn-line` to the pixel.
So preserve §6e's "the ink pill is used in-app for exactly one thing — the AI FAB" is factually
wrong, and re-basing `.pdx-save` to blue would *delete* the closest thing the app has to the Welcome
button system, across seven dialog families in four clusters.

**Resolution, and it is a rule rather than a preference:** **blue = act on the page; ink = commit and
close a modal; red = the one destructive pill.** All three already exist and already sort that way.
Zero visible change, zero cross-cluster ripple, and the doctrine ("one accent") is honoured because
ink is not a hue.

---

## 1. The density contract for this cluster

### 1.1 Carried over literally — same value, no rescale

Ground `#f5f6fa`; ink/muted/faint `#1c1c1a` / `#575550` / `#8a877e`; hairlines
`rgba(28,28,26,0.13)` and `rgba(28,28,26,0.07)`; card fill `#ffffff`; accent `#2f6bff`, exactly one;
radius rungs `999 / 26 / 18 / 12 / 8` + `50%`; shadows `0 10px 30px /0.05` (card at rest),
`0 4px 12px /0.08` (small raised), `0 8px 22px /0.2` (ink pill), `0 24px 70px /0.14` (float),
`0 34px 64px /0.13` (stage), focus `0 0 0 4px rgba(47,107,255,0.12)`; easing
`cubic-bezier(0.22,1,0.36,1)` on everything, `cubic-bezier(0.4,0,0.2,1)` only for height/grid;
interaction 0.18 / 0.25 / 0.28 / 0.3s; Inter, one family, italic `em` the only display accent;
prose measured in `ch`; reveals one-shot (add `.in`, unobserve).

**And the one rule that carries at ×1 — graft it verbatim:** the eyebrow, **11.5px / 650 / 0.045em /
uppercase / `#8a877e`**, does not re-scale. In this cluster it lands on:

- `thead th` — **42 column heads** (Projects 13, Crews 11, Equipment 9, Materials 9), today
  12.5px/650/0.01em sentence-case on a `#fafbfd` fill.
- `.hs-kpi-label` — **17 figure labels** (Projects 5, Crews 4, Equipment 4, Materials 4), today
  11.5px/600 sentence-case `--hsx-mut`.
- The dissolved `.hs-panel` heads — 3 on the Projects rail, today 14px/700 `--hsx-ink`.
- The new page eyebrow above each `h1` — 4 instances.

That is **66 elements on four pages** from one rule. Column heads are the most-repeated text in the
product; nothing else in this plan buys as much resemblance per line.

**One correction to preserve §6d, which matters:** it sets `thead th` background to `transparent`.
`thead th` is `position: sticky; top: 0; z-index: 1` (`hs-index.css:516-527`) — a transparent sticky
head lets 46px rows scroll visibly underneath it. Use **`var(--wx-card)` (`#ffffff`)**: the same
paper as the rows, so the `#fafbfd` banding still dies, the head stays opaque, and separation is
carried by the 1px `rgba(28,28,26,0.13)` bottom rule alone.

### 1.2 Re-scaled for density, with the factor

| Role | Welcome | This cluster | Factor | Today |
|---|---|---|---|---|
| Page title `.hs-index-title` | hero `clamp(46px,6.8vw,96px)` | `--bf-app-title` `clamp(22px,1.9vw,26px)`/600/−0.02em/1.14/`#1c1c1a` | ÷3.7 | 22px/650/−0.015em/`#14203a` |
| Modal title `.pdx-title` | feature hero `clamp(38px,5vw,78px)` | **unchanged** `clamp(28px,3.4vw,42px)`/500/−0.015em, family → Inter | ÷1.86 | same, in Palatino |
| Figure `.hs-kpi-value` | stat `clamp(46px,5.4vw,72px)` | `--bf-app-figure` `clamp(20px,1.6vw,26px)`/700/−0.02em, tabular-nums | ÷2.8 | 20px/750/−0.02em |
| Section head (`.hs-empty strong`) | h2 `clamp(32px,4.4vw,54px)` | `--bf-app-section` 16px/600/−0.01em | ÷3.4 | 15px/700 |
| Lede (new page lede, `.pdx-sub`) | `clamp(16px,1.35vw,19px)` | `--bf-app-lede` 14px, measure 62ch (`.pdx-sub` keeps its 56ch) | ÷1.36 | n/a / `clamp(14,1.1vw,15.5)` |
| Primary cell `.hs-link`, `.hs-name` | body 15–16px | `--bf-app-row-strong` 13.5px/600 | ÷1.2 | 13.5px/700 |
| Cell `td` | body 15–16px | `--bf-app-row` 13px/500/1.45 | ÷1.2 | 13px/500 |
| Meta (`.hs-row-sub`, `.hs-kpi-note`, `.hs-count-pill`, `.hs-progress b`) | 13px | `--bf-app-meta` 12px | ÷1.1 | 12 / 11.5 / 12.5 / 12.5px |
| Eyebrow / th / badge / count pill text | 11.5–13px | `--bf-app-eyebrow` 11.5px/650/0.045em | **×1** | 11.5–12.5px |
| Page rhythm (`.page-stack` gap) | `clamp(76px,12vh,130px)` → 108px | `--bf-rhythm-dense` `clamp(20px,3vh,34px)` → **27px @900h** | ÷4.0 | 18px (22px Crews) |
| Section head → content | `0 auto 54px` | `.hs-index-head` margin-bottom **12px, frozen** | ÷4.5 | 12px |
| Card hover lift | `translateY(-6px)` | `--bf-lift-dense: -4px` — **spent nowhere on these four pages** (§1.6) | ÷1.5 | none |
| Reveal shift / duration / stagger | 30px / 1s / 90ms | **12px / 0.55s / 50ms** (canvas graft) | ÷2.5 ÷1.8 ÷1.8 | inert |

### 1.3 Frozen — the numbers a redesign must not move

`th`/`td` height **46px**, `thead` height **42px**, padding `0 14px`, `white-space: nowrap`,
`vertical-align: middle`; `.hs-table { min-width: 720px }`; `thead th { position: sticky; top: 0;
z-index: 1 }`; `.hs-table-wrap { overflow-x: auto }`; the whole `minmax(0,1fr)` + `min-width: 0`
chain (`hs-index.css:36-45`, `.hs-index.page-stack`, `.hs-index-grid`, `.hs-index-main`,
`.hs-index-card`) — the comment says why and it is right: remove one link and the 13-column nowrap
table blows the card to ~1900px; `.hs-index-grid { minmax(0,1fr) 330px }` on Projects;
`.hs-index-rail { position: sticky; top: 74px }`; the 1240px and 860px reflow points;
`.hs-progress { min-width: 150px }`, track height 6px; `.hs-cell-check` 34px, `.hs-cell-actions`
44px / `.two` 80px; `.hs-row-sub { max-width: 340px }` ellipsis; `.hs-empty { padding: 44px 20px }`;
`@media (hover: none) { .hs-row-action { opacity: 1 } }`; every `data-tutorial-id`; every
`aria-label`, `aria-labelledby`, `role`, `aria-selected`, `aria-current`, `aria-pressed`,
`aria-describedby` and `role="alert"` in both records; `<h1>` level and its position inside the
`<section>` (`findIndexCard()` = `heading.closest("section")`).

### 1.4 The ladder, as one continuous scale (checkable)

`11.5 → 12 → 13 → 13.5 → 14 → 16 → 20…26 → 28…42`. Eight rungs, no gaps, nothing between 16 and 20
and nothing between 26 and 28. Any new literal outside that set in this cluster is a bug, and
`density.test.ts` (the hybrid graft) reads `app-shell-daylight.css` raw via the `?raw` glob
`schedule/boundary.test.ts` already uses and fails the build on any `font-size` literal that is not
one of `var(--bf-app-*)` or a member of that set.

### 1.5 The card licence, applied and counted

**Licence 1** — the boundary is itself interactive (click / drag / resize / dismiss it).
**Licence 2** — it is a viewport clipping a scrolling world. Everything else dissolves to a
transparent section on the ground.

| Frame today | Sites in cluster | Verdict |
|---|---|---|
| `.hs-kpi` — 1px `#e6e8f0`, r10, `#fff` | 17 tiles / 4 pages | **Dissolved** → figure row. The record is explicit: "No KPI tile is clickable" (projects action 6) and "the four KPI tiles on each page are inert … no onClick, no role, no href" (cem missingActions 8). Fails both clauses. |
| `.hs-index-card` — 1px, r14, `0 1px 2px`, pad 18/22/16 | 4 | **Dissolved.** It frames *the page*; its border does nothing. Element, class and `aria-labelledby` all stay — only `border`, `border-radius`, `box-shadow` and `padding` go to `0`/`none`. |
| `.hs-views` bottom hairline | 4 | **Dissolved** with the tab→pill conversion (§2.2). |
| `.hs-table-wrap` — 1px, r10 | 4 | **Kept, licence 2**, re-toned: 1px `rgba(28,28,26,0.07)`, **r18**, `#fff`, `--bf-shadow-card`, plus the new scroll-edge mask. This is the product-window move at dense scale. |
| `thead` `#fafbfd` fill | 4 | → `var(--wx-card)`; the 1px rule carries the separation (§1.1). |
| `.hs-panel` — 1px, r12, pad 16 | 3 (Projects rail) | **Dissolved** → transparent sections, head hairline optional, `h2` → eyebrow. At ≤1240px the rail becomes 3 columns separated by 1px `--wx-line-soft` **vertical** rules (the same device as the figure row). |
| `.hs-empty` | 4 (+5 elsewhere) | **Kept, licence 1** — a frame is the only way to draw absence, and it *replaces* the table stage (it is the `:` branch of a ternary), so nothing else is drawing a boundary. Re-toned to **1px dashed `var(--wx-line)`, r18, transparent fill**. Declared visible change: it has no border today. |
| `.crew-status-legend` footer | 1 (Crews) | **Dissolved** → a transparent row of five dots on the ground. |
| `.equipment-footnote` | 1 (Equipment) | Already frameless; stays. |
| `.pdx-dialog`, `.crew-dialog`, `.project-dialog` | 9 dialogs | **Kept, licence 1.** |
| `.pdx-summary`, `.equipment-remove-summary`, `.crew-size-preview`, `.pdx-hint` | 6 | **Kept, licence 1** (a summary tile inside a dialog is a discrete object) — re-toned to r12 + `--wx-line-soft`. |

**Resting-boundary count on a Projects page: 8 → 2.** Today: `.hs-kpi` tile ×5, `.hs-index-card`,
`.hs-search` pill, `.hs-views` rule, `.hs-table-wrap`, `thead` fill, `.hs-panel` ×3,
`.hs-count-pill` fill. After: the table's clipping edge, and its internal head rule. Crews /
Equipment / Materials go **7 → 2** (no rail).

This is also *why* the `.hs-search` pill and `.hs-count-pill` survive: a search field's border is the
affordance (it is an input), and the count pill is a filled 999px pill, which is the Welcome Page's
own badge species, not a card.

### 1.6 Hover grammar — the four moves, assigned

1. **Lift** — `--bf-lift-dense: -4px`. **Spent nowhere on the four index pages.** Nothing on them
   has an interactive boundary: figure tiles are inert, the table stage is a viewport, the rail
   sections are dissolved. Preserve §6b says it outright ("static cards never lift") and the licence
   proves which ones are static. The only lifts in the cluster are the ones that already exist
   inside the dialogs: `.pdx-save:hover { translateY(-1px) }`, `.pdx-close`, `.pdx-add-role`.
2. **Invert** — the dominant move here, ~60 pills across the four pages: `.hs-btn` (Import schedule,
   Export, Add ×4), `.hs-chip` (Filter, Sort by — 8), `.hs-view` tabs (17), `.hs-page-btn`,
   `.hs-qf` selects (12), `.pdx-cancel` / `.outline-button` (9 dialogs). Unselected hover =
   `rgba(28,28,26,0.05)` + `1px solid rgba(28,28,26,0.13)`; **selected** = full `#2f6bff` fill,
   `#fff` text. That single treatment replaces three different active looks today
   (`.hs-chip.active` blue-soft fill, `.hs-view.active` 2px blue underline, `.hs-page-btn.active`
   ink border).
3. **Slide** — `translateX(3px)` over 0.18s on directional links only: `.hs-panel-link`
   ("View all" ×2, "Details"), `.hs-qf-link` ("Advanced filters" / "Clear filters" ×4, icon slides).
   **`.hs-link` does not slide** — a record name is not a direction; it keeps underline-on-hover and
   its `#2f6bff`. **The revealed row action does not slide either** — the fade *is* its motion, and a
   slide under a 30px button inside a 44px cell reads as a wobble.
4. **Tilt** — no home on the four index pages, by decision. It survives in this cluster only where
   it already lives: `WxTilt` on the two marketing product pages' hero stages (max 6, restRx 3,
   restRy −9), unchanged.

### 1.7 Reveals — the arithmetic, the budget, and a trap that is specific to this cluster

Canvas's numbers, grafted: `--bf-app-reveal-shift: 12px`, `--bf-app-dur-reveal: 0.55s`,
`--bf-app-reveal-stagger: 50ms`. Reason: a 30px rise on a 46px row moves it 65% of its own height,
and at 1s the page is still settling when the eye arrives. Plus the `useHudMotion.ts` correction
`threshold 0.12 → 0.16` and `rootMargin '0px 0px -5%' → '-6%'`, which puts these pages on the
documented contract.

**Attach to sections, never to rows or cells. Budget on these pages: 3, not 6.** Because —

> **`useHudMotion`'s reveal effect has deps `[rootRef]` only. It never re-queries after mount.** The
> CSS resting state is `opacity: 0`. So any node that mounts *later* than the effect never receives
> `.in` and is **invisible forever, with no error.**

On these four pages `.hs-table-wrap` and `.hs-empty` are the two branches of a ternary that swaps on
**every search keystroke, every view tab, every quick filter and every page change**. Putting
`data-reveal` on either one guarantees a blank table the first time a user types. So:

| Reveal target | Mounts | className |
|---|---|---|
| `.hs-kpis` (figure row) | once with the page | static ✓ |
| `.hs-index-card` (the whole index document, table and empty state inside it) | once with the page | static ✓ |
| `.hs-index-rail` (Projects) / `.equipment-footnote` / `.crew-status-legend` | once with the page | static ✓ |

Three per page, `--i` 0/1/2 → 0 / 50 / 100ms. **Forbidden**: `data-reveal` on `.hs-table-wrap`,
`.hs-empty`, any `tr`, any `.hs-view`, any `.hs-kpi`, and on anything whose `className` is computed
(`.hs-qf` gains `is-set`, `tr` gains `is-selected`, `.hs-chip` gains `active`, `.hs-view` gains
`active`) — the documented dynamic-className-wipes-`.in` trap.

### 1.8 The gradients this cluster forces flat (naming the cost, per the graft)

`.hs-progress-track i` is named in the graft and it lives here (`hs-index.css:735-750`). Four
gradients die:

| Today | Becomes | Rows affected |
|---|---|---|
| default `linear-gradient(90deg,#4285f4,#9b72cb)` | flat `#2f6bff` | Projects "Complete" health rows (`healthTone: "blue"`, which has no `tone-blue` rule and so falls through) |
| `.tone-amber` `#d97706 → #f5b14a` | flat `#b45309` (`--hsx-amber`) | Projects Monitor, Crews 70–84%, Equipment In Use, Materials Waiting |
| `.tone-red` `#d93c38 → #e8827f` | flat `#c5221f` (`--hsx-red`) | Projects At Risk, Crews ≥85%, Equipment Maintenance, Materials Missing |
| `.tone-green` `#188038 → #4cae63` | flat `#188038` | every other row on all four pages |

Two side effects worth stating: (i) the record's `missingInformation` #5 finding — "Complete rows
keep the blue→purple fill even though their health pill is blue" — **is fixed for free**, because the
new default *is* `#2f6bff`; no new selector. (ii) The record's correction #5 ("an Ordered material's
avatar renders as the untoned default") is **not a bug**: the untoned `.hs-avatar` default is
`--hsx-blue-soft`/`--hsx-blue`, which is exactly what `tone-blue` would be. Do not "fix" it.

Also gone from this cluster: `.primary-button`'s `linear-gradient(180deg,#1f52e0,#073a72)`
(`styles.css:8446`) — already overridden to the ink pill by `.equip-rx`/`.mat-rx`, so this is a
delete-the-dead-rule, not a visible change. **Kept**: `.pdx-title em`'s trio (finding 0.3c — it is
the sanctioned `em` role) and the five `projectAvatarThemes` row-avatar gradients (proposal R4).

### 1.9 The accent budget, as a count per screen

Editorial's rule, restated for a data table. Blue at rest on a Projects page today: the Add button
fill, 25 `.hs-link` names, the active tab underline + its count pill, an active chip, each `is-set`
filter tint, `tone-blue` badges, the untoned progress gradient, `.hs-page-btn.active`,
3 `.hs-panel-link`s, the `tone-blue` KPI chip. **The rule: the accent is spent on exactly three
roles — (1) the one primary action, (2) the record-name link, (3) the current selection (view pill,
page button, `is-set` filter).** Everything else that is blue today goes to ink, muted or its own
semantic tone. Enforced by counting: `.hs-panel-link` → `#2f6bff` **kept** (it is role 1 for its
section); `.hs-kpi-ico.tone-blue` chip → the icon keeps its tint because the six tones are
information (they encode the metric's kind); `.hs-page-btn.active` ink border → blue fill (role 3);
the progress default → `#2f6bff` (role: none — but it is a *measure*, and its four tones are
semantic, so it is exempt as data, not chrome).

Untouched per decision #3: `--wx-amber: #0032b0` (a blue) in `.proj-rx`, `.equip-rx`, `.mat-rx`, and
`#b45309` in `.crew-rx`. This cluster is the one place in the repo where both values sit side by
side; it renders exactly as it does today and the flip to paper chrome makes the inconsistency
*louder*, not quieter. Flagged, not fixed.

---

## 2. Shared components

Repo recipe, read off `components/ui/display-cards.tsx`: one file, a header comment naming the source
and the token mapping, plain markup, inline `style` objects for structure, **one** `const CSS`
template rendered in an inline `<style>` for pseudo-elements / hover / media queries, tokens read as
`var(--wx-x, #literal)` with real fallbacks, prefixed class names, and a
`@media (prefers-reduced-motion: reduce)` block **inside** that same CSS string. No Tailwind, no
`cn`, no `@/`, no `:where()`.

| # | New file | Export | Consumers in this cluster | Kills |
|---|---|---|---|---|
| 2.1 | `components/ui/figure-row.tsx` | `FigureRow({ items, ariaLabel })`, item `{ id, icon, label, value, unit, note, tone }` | 4 pages × 4–5 = **17 tiles** | 17 duplicated inline `.hs-kpi` blocks (record risk 2: "12 copies" + 5 on Projects). Emits `<div className="hs-kpis bf-figures">` / `<div className="hs-kpi bf-figure">` — **additive**, both class names survive. Vertical 1px `--wx-line-soft` separators, `font-variant-numeric: tabular-nums`, **no count-up** (`test/setup.ts` stubs `IntersectionObserver` to a no-op, so a count-up renders `0` forever under test). |
| 2.2 | `components/ui/segmented-pills.tsx` | `SegmentedPills({ items, value, onChange, ariaLabel, renderCount })` | the saved-view rows: **17 tabs** (Projects 4, Crews 4, Equipment 4, Materials 5) | the underline tab bar and its full-width hairline. Keeps `role="tablist"` + its `aria-label`, `role="tab"`, `aria-selected`, every label, every count, every icon and the order. Selected = `#2f6bff` fill / `#fff` text, count pill inverts to `rgba(255,255,255,0.2)`/`#fff`. Emits `className="hs-view bf-pill"` and `"hs-view-count bf-pill-count"`. |
| 2.3 | `components/ui/scroll-edge.tsx` | `ScrollEdge({ ariaLabel, children })` | the 4 `.hs-table-wrap`s | wraps the licence-2 viewport: `ResizeObserver` + `scroll` set `data-scroll="none\|left\|right\|both"`, a `mask-image: linear-gradient(...)` fade on the overflowing edge, and `tabIndex={0}` + `role="region"` + `aria-label` **only while it actually scrolls** — mirroring `.dash-block-body.is-scrollable`, the repo's own precedent. Fixes a real gap: a 13-column table scrolls horizontally today with no edge cue and no keyboard route. |
| 2.4 | `components/ui/document-page.tsx` | `DocHeader({ eyebrow, title, releaseTag, lede, actions, titleId, titleTutorialId })`, `DocSection({ title, action, children })` | 4 index headers + 3 dissolved Projects rail sections | the bespoke `.hs-index-head` / `.hs-panel-head` markup. **`DocHeader` must render the `<h1>` itself, at level 1, with its `id`, its inline caret `<button>` and its `data-tutorial-id` in the same positions** — the accessible name stays `"<Page> Show all <page>"` and every heading query anchors on `/^<Page>/`. |
| — | reuse `components/ui/quantum-cloud-loader.tsx` | `CloudLoader` | already used by the importer's `reading` + `committing` stages | unchanged. |
| — | reuse `components/ui/text-shimmer.tsx` (58 lines) | `TextShimmer` | the importer's "Reading your schedule…" / "Importing your schedule…" lines | zero new files. |

**No new stylesheet.** Everything not inside a component's own `<style>` goes into preserve's single
appended `app-shell-daylight.css`, prefixed `.bf-shell` per the specificity recipe — written
`.hs-shell.bf-shell …` or `.bf-shell .hs-index …`, never with a sibling combinator (preserve §5e's
`.bf-shell ~ .cmdk-backdrop` matches nothing, because the palette is a *child* of the shell; the same
mistake in `.bf-shell ~ .hs-index` would silently no-op this whole cluster).

**The `.pdx` opt-in — the cheapest structural win in the cluster.** `project-dialog-redesign.css:30-33`
keys the backdrop on **`.pdx` alone**, with a comment saying exactly why: "every dialog that opts
into this system brings its own legacy backdrop class." So adding one class to four backdrops
migrates them onto the Welcome-language modal shell with no markup move and no behaviour change:

| Dialog | Element today | Becomes |
|---|---|---|
| Equipment add/edit | `<div className="crew-dialog-backdrop">` | `"crew-dialog-backdrop pdx"` + `"crew-dialog pdx-dialog pdx-equip"` |
| Remove Equipment | same | same |
| Add Material | same | `… pdx-mat` |
| Import a schedule | `<div className="project-dialog-backdrop">` (in `schedule/ScheduleImportDialog.tsx`) | `"project-dialog-backdrop pdx"` + `"project-dialog pdx-dialog sim-dialog"` |

Four consequences, all improvements: scrim `rgba(6,18,35,0.52)` no-blur → `rgba(28,28,26,0.42)` +
`blur(6px) saturate(120%)`; shell r10 + `0 28px 80px rgba(6,18,35,0.32)` → r26 + `--bf-shadow-stage`;
they gain `pdx-backdrop-in` / `pdx-dialog-in` and the existing reduced-motion block that nulls them
**by name**; and **z-index 30 → 80**, which fixes the recorded bug that the `z-index: 60` Ask-AI FAB
paints over these dialogs' bottom-right footers — exactly where "Add Material", "Save Equipment" and
"Import & see full health check" live. One selector is extended so the field stagger reaches them:
`.pdx .pdx-form > label` → `.pdx .pdx-form > label, .pdx .crew-form > label` (same keyframe name
`pdx-field-in`, so the reduced-motion block still covers it).

Safe against the schedule guards: `schedule/viewKeys.ts:28` `dialogIsOpen()` queries
`[role='dialog']` + `checkVisibility()` and is class-agnostic (and `checkVisibility()` ignores
`opacity`, so a 0→1 entrance cannot break the 1–6 view keys); `schedule/boundary.test.ts` only
forbids schedule markup moving *into* `App.tsx` and `/gantt-/` classNames there — the importer edit
is inside `schedule/`.

---

## 3. Class-name additivity — the pin list for this cluster

**The frame adds classes and never replaces a pinned one.** Verified pins that must survive verbatim
here, to ship as a comment block at the top of the new stylesheet:

`.hs-index` · `.hs-index-grid` · `.hs-index-main` · `.hs-index-rail` · `.hs-index-card` (and it must
stay a `<section>` wrapping the `<h1>`) · `.hs-index-title` · `.hs-index-head` · `.hs-index-actions`
· `.hs-kpis` · `.hs-kpi` · `.hs-kpi-ico` · `.cc-stat-ico` · `.tone-{blue,green,amber,violet,orange,red}`
· `.hs-kpi-body` · `.hs-kpi-label` · `.hs-kpi-value` · `.hs-kpi-note` · `.hs-views` · `.hs-view` ·
`.hs-view-count` · `.hs-toolbar` · `.hs-search` · `.hs-chip` · `.hs-toolbar-right` ·
`.hs-quickfilters` · `.hs-qf` · `.is-set` · `.hs-qf-link` · `.hs-table-wrap` · `.hs-table` ·
`.hs-cell-check` · `.hs-cell-name` · `.hs-row-name` · `.hs-avatar` · `.hs-link` · `.hs-row-sub` ·
`.hs-cell-muted` · `.hs-cell-num` · `.hs-badge` (and its `::before` dot) · `.hs-progress` ·
`.hs-progress-track` · `.hs-delta.ahead` / `.behind` · `.hs-cell-actions` / `.two` ·
`.hs-row-action` / `.edit` · `.is-selected` · `.sorted` · `.hs-empty` · `.hs-index-foot` ·
`.hs-count-pill` · `.hs-pagination` · `.hs-page-btn` · `.hs-perpage` · `.hs-foot-right` ·
`.hs-panel` · `.hs-panel-head` · `.hs-panel-link` · `.hs-page-tag` · `.badge` + every
`statusTone()` output · `.pdx` · `.pdx-dialog` · `.pdx-crew` · `.pdx-confirm` · `.pdx-form` ·
`.pdx-title` · `.pdx-sub` · `.pdx-summary` · `.pdx-note` · `.pdx-hint` · `.pdx-optional` ·
`.pdx-save` · `.pdx-cancel` · `.pdx-danger` · `.pdx-close` · `.pdx-add-role` · `.pdx-role-remove` ·
`.crew-size-preview` · `.labor-mix-toolbar` · `.labor-mix-rows` · `.labor-mix-row` ·
`.crew-dialog-backdrop` · `.crew-dialog` · `.crew-dialog-header` · `.crew-form` ·
`.crew-dialog-actions` · `.crew-legend-footer` · `.crew-status-legend` + `.available` / `.on-job` /
`.overbooked` / `.in-progress` / `.unavailable` · `.equipment-footnote` ·
`.equipment-remove-summary` · `.equipment-assignment-preview` · `.form-error` · `.form-note` ·
`.primary-button` · `.outline-button` · `.icon-button` · `.danger-button` · `.project-thumb` ·
`.resource-row` · `.crew-directory-card` + `.crew-status-pill` (**alive only because Field Updates
reuses them** — do not delete) · `.dx-bg` · `.dx-aurora-{1,2,3}` · `.dx-cursor` · `.dx-ready` ·
every `data-tutorial-id`: `crews-page-title`, `crew-add-button`, `crew-dialog`,
`equipment-page-title`, `materials-page-title`.

Example of the rule in practice: `<div className="hs-kpis bf-figures">` →
`<div className="hs-kpi bf-figure">`, with the new scope **zeroing the inherited border, radius and
background from the `.bf-figure` side** so the old rule and the new one cannot fight.

---

# 4. Screen mappings

Twenty-six entries. Item numbers in the "placed" lists refer to the record's own array indices, so
coverage is checkable: 86 + 126 = **212 information items**, 46 + 78 = **124 actions**, plus the
37 `missingInformation` and 16 `missingActions` the two completeness blocks add.

---

## Projects page frame + portfolio figure row

- **Today:** `<div className="page-stack projects-page proj-rx hs-index">` — a paper ground with
  three blurred aurora blobs and a 480px cursor glow behind it, then a five-tile bordered KPI strip
  spanning the full frame width above the index card. Tiles are inert; their sparkline and trend data
  are computed and never rendered.
- **Becomes:** the same root element and the same four classes (`.bf-shell` adds the re-skin from the
  shell, so no scope changes here). The `-rx` frame keeps `margin: -22px -28px -34px`,
  `padding: clamp(26px,4.5vh,52px) clamp(20px,4vw,56px) clamp(56px,9vh,100px)` (40.5 / 56 / **81px**
  at 1440×900 — the cluster's Welcome-scale tail), `min-height: calc(100vh - 87px)`,
  `isolation: isolate`, `overflow: clip`. `.page-stack` gap **18px → `var(--bf-rhythm-dense)` = 27px
  @900h**. `.hs-index-grid` and (on the three railless pages) `.hs-index-main` gain
  `max-width: var(--bf-measure-page)` = **1140px** + `margin-inline: auto`, so the page is a document
  — with `.bf-doc-bleed` available for the one element per page allowed out of it (§ index document,
  below). The KPI strip becomes the **`FigureRow`** (2.1): no tile borders, no tile fill, five
  columns divided by 1px `--wx-line-soft` **vertical** rules, `gap: 14px`, figure
  `clamp(20px,1.6vw,26px)`/700/−0.02em/tabular-nums, label the ×1 eyebrow
  (11.5/650/0.045em/upper/`#8a877e`), note `--bf-app-meta` 12px `#575550`, icon chip r10 → **r12**
  with its six tones intact. Above the `h1`, `DocHeader` adds a new eyebrow line — **"PROJECTS ·
  OPERATIONS"**, derived from `navItems`/`navHubs`, no new copy invented.
- **Every information item placed:**
  - **1–2** (aurora field `.dx-aurora-1/-2/-3` at z-index −1; `.dx-cursor` 480px glow on `--mx/--my`)
    → unchanged, on the same `.dx-bg` layer, same blur 50px, same parallax. Listed for deletion under
    **R1**, not deleted here.
  - **3–7** (the five tiles: Active Projects `+2 vs last month`; On Track `+3 vs last month`; At Risk
    `-1 vs last month`; Avg Completion `+6% vs last month`; Completed `+2 this quarter`) → five
    `FigureRow` items, in order, every label, value, derivation, delta string and note string
    verbatim, including the `%` baked into Avg Completion's value.
  - **8** (34×34 tinted chip `.hs-kpi-ico.cc-stat-ico.tone-<blue|green|amber|violet|orange>`,
    uppercase 11px label, tabular value, 11.5px note) → the chip keeps its size, its class stack and
    all five tones; the label moves 11.5/600 sentence-case → 11.5/650/0.045em/uppercase; the note
    11.5 → 12px.
  - **9** (`totalProjects` reused by the count pill, the tab counts and the donut centre) → still one
    computation, still consumed by all three; `FigureRow` receives values, never computes.
  - **`missingInformation` 9** (the `-rx` frame's `min-height` + padding; the KPI strip sitting
    *outside* `.hs-index-grid` so it spans the full frame) → preserved: `FigureRow` stays a sibling of
    the grid and is therefore **the page's full-width figure**, which is the one place the 1140px
    measure is deliberately not applied.
  - **`missingInformation` 16** (the fixed `AskAiButton`, `.hc-assistant`, z-index 60, bottom/right
    `clamp(16px,3vw,32px)`, overlapping the card's bottom-right corner) → present and unchanged; it
    stops overlapping the *dialogs* because of the `.pdx` z-index fix (§2), and it still overlaps the
    Export footer, which is a shell decision outside this cluster.
  - **`missingInformation` 17** (no per-page `document.title`) → unchanged.
  - **`missingInformation` 12** (`.hs-page-tag` slot exists, Projects renders no `PageReleaseTag`, and
    Projects is in neither `BETA_PAGES` nor `ADD_ON_PAGE_LOCKS`) → `DocHeader` takes a `releaseTag`
    slot that renders nothing for Projects today, so an `UPDATE_ENTRIES` entry that ever
    `introduces: ["projects"]` lands correctly instead of nowhere.
- **Every action placed:**
  - **1–4** (rail flyout Operations → Projects; Create-new menu "Project", navigate-only, no
    `createSignal`; the Dashboard inspections button "View all inspections on the projects page";
    `ScheduleStatusBand`'s `onOpenProjects`) → all four unchanged; the flyout row's re-skin is
    shell-owned (see *Cluster entry points*).
  - **5** (window pointer-move drives `.dx-cursor` and `--px/--py` aurora parallax) → unchanged.
  - **6** ("No KPI tile is clickable — display-only") → **preserved as a non-affordance**: the figure
    row has no `onClick`, no `role`, no `href` and **no hover state**, so it neither loses an
    affordance nor invents one. (Making "Available Now" a shortcut to the Available view is proposal
    **R6**.)
  - **`missingActions` 1** (⌘K / Ctrl+K → palette → "Projects") → unchanged.
  - **`missingActions` 2** (`.hs-flyout-star` "Bookmark Projects" / "Remove Projects from bookmarks",
    `aria-pressed`) → unchanged; pinned to `opacity: 0.55` below 1024px per the editorial graft.
  - **`missingActions` 3** (five marketing entries: `onExplore("projects")` at 4907, the links at
    5322 / 6436 / 16850 / 17001, the landing module card at 5436) → unchanged.
- **States:** *empty* — info **empty 1**: values read `0`, Avg Completion `"0%"`; the figure row keeps
  its five columns and its separators, so an empty workspace still reads as a strip and not as a gap.
  *loading* — **loading 1**: no skeleton; the page renders off the resolved `BootstrapPayload`. Under
  the redesign it stays skeleton-free (the app-level `DashboardSkeleton` is shell-owned) and the
  figure row's 27px reveal is the only entrance. *error* — **error 1**: `fetchScheduleStatus()`
  rejection is swallowed; nothing shows here. Unchanged, and flagged as **Q3**. *add-on lock* — none;
  Projects is never locked.
- **Motion:** **invert** on nothing at this level; **no lift** (tiles are inert); **no slide**;
  **no tilt**. One reveal: `.hs-kpis` is target 1 of 3 (12px / 0.55s / `--i: 0`). Skeleton: none.
  Reduced motion: it inherits `--bf-reveal-shift: 0px` from the existing `design-tokens.css` block —
  no eleventh pattern.
- **Tests touched:** `tests/index-pages.test.tsx:37` asserts `getByText("Active Projects")` — the
  label string survives verbatim inside `FigureRow`, **passes unchanged**. No other anchor reaches
  this screen.

---

## Projects index document (title, actions, saved views, toolbar, quick filters, table, footer)

- **Today:** `<section className="hs-index-card" aria-labelledby="projects-index-title">` — a
  bordered 14px-radius white card holding an `h1` + caret, two header buttons, four underline tabs,
  a search/filter/sort toolbar, four quick-filter selects, a 13-column nowrap checkbox table inside a
  bordered scroll wrapper, and a three-up footer.
- **Becomes:** the **same `<section>`, same class, same `aria-labelledby`** — `findIndexCard()`
  resolves the card as `heading.closest("section")`, so the element cannot move — with its border,
  radius, shadow and padding zeroed: the document now sits directly on the `#f5f6fa` ground. Inside,
  top to bottom: `DocHeader` (eyebrow / `h1` at `--bf-app-title` `clamp(22px,1.9vw,26px)`/600/−0.02em
  `#1c1c1a` with its caret button at r12 / release-tag slot / actions right-aligned as pills) — 12px
  — `SegmentedPills` for the four saved views — 22px — the toolbar row — 22px — the quick-filter row
  — 22px — the table stage — 14px — the footer. Measure 1140px for everything except the table,
  which takes **`.bf-doc-bleed`**: at 13 columns and `min-width: 720px` its intrinsic width exceeds
  the 788px main column (1140 − 330 rail − 22 gap), so it escapes to
  `calc(100vw - var(--hs-rail-w) - 2 × gutter)` = **1272px at 1440** and reads as the page's one
  oversized figure — the product-window move, rescaled. The stage itself: 1px
  `rgba(28,28,26,0.07)`, **r18**, `#fff`, `--bf-shadow-card`, wrapped in **`ScrollEdge`**.
- **Every information item placed:**
  - **1** (`h1 "Projects"` `id="projects-index-title"` + trailing caret) → `DocHeader`; level 1, same
    id, caret still inside the `h1` so the accessible name stays `"Projects Show all projects"`.
  - **2–5** (tabs All projects/Active/At risk/Completed with `totalProjects` / `inProgressCount` /
    `atRiskCount` / `completedCount` and the `CalendarDays` / `AlertTriangle` / `CheckCircle2` icons)
    → `SegmentedPills`; four 999px pills, icons at 15px `#8a877e`, counts in `.hs-view-count` pills,
    selected pill = `#2f6bff` fill.
  - **6** (search input, placeholder and `aria-label` both "Search projects", `Search` glyph) → the
    `.hs-search` pill, licence-kept: h36, r999, `#fff`, 1px `rgba(28,28,26,0.13)`, input 13.5px/500,
    placeholder `#8a877e`, `:focus-within` → `border-color: #2f6bff` + `--bf-focus-ring`. This
    repairs `missingInformation` 6 for the search box.
  - **7** (Filter chip, `· N` from `activeFilterCount`, `.active` when N>0, title flipping
    "Clear filters"/"Use the filters below") → `.hs-chip bf-pill`, invert on hover, `#2f6bff` fill
    when `.active`, all three strings intact.
  - **8** (Sort chip interpolating the live key — eight possible strings — with the chevron rotating
    180° when `sortKey==="name" && sortDir==="desc"`) → same pill; the chevron rotation moves from
    `0.15s ease` to `0.28s var(--bf-ease)`.
  - **9** ("<filtered> of <total>") → `.hs-toolbar-right`, `--bf-app-meta` 12px `#8a877e`.
  - **10–13** (Status / Project manager / Schedule health / Type selects with their four default
    labels, their option sources and their four `aria-label`s) → `.hs-qf` pills, r8 → **r999**, each
    keeping its native `<select>` and its `aria-label`.
  - **14** (`.is-set` blue tint per filter) → kept, re-based to `rgba(47,107,255,0.06)` fill +
    `#2f6bff` text (selection = role 3 of the accent budget).
  - **15** ("Advanced filters" / "Clear filters" + `SlidersHorizontal`) → `.hs-qf-link`, `#2f6bff`,
    13px/600, **slide** 3px on the icon.
  - **16** (28px gradient avatar, `projectInitials()`, `projectAvatarThemes` × 5 + default blue) →
    unchanged by default; retirement to the five flat `.hs-avatar.tone-*` fills is proposal **R4**.
  - **17** (`MapPin` + `project.location` sub-line) → `.hs-row-sub` 12px `#8a877e`, **`max-width:
    340px` ellipsis frozen**.
  - **18** (`<Badge status>` → `span.badge.<statusTone()>`, all 10 `JOB_STATUSES`) → unchanged
    markup; the `.proj-rx .badge` tone map is re-based onto the `--hsx-*-soft` fills so it stops
    being a second, warmer palette. **`missingInformation` 1 preserved exactly as it renders**:
    `in-progress` and `not-started` have no rule and fall through to the neutral base
    (`#ebedfb` / `#575550`), and `.badge.delayIQed` can never match because `statusTone()` lowercases
    (risk 5) — both are **kept**, because fixing either changes what a user sees on the two most
    common statuses. Listed as **R5**.
  - **19** (`.hs-badge.tone-<green|amber|red|blue>` + its 6px `::before` dot; map At Risk→red,
    Monitor→amber, Complete→blue, else green) → unchanged, including the dot
    (`missingInformation` 5 of the cem record notes every badge carries it; it stays).
  - **20** (`.hs-delta.ahead/.behind`, `"+Nd"` / `"−Nd"` U+2212, only when `/api/schedule/status`
    returned a row; `daysAhead === 0` renders `+0d` in the green style per `missingInformation` 8) →
    unchanged, r999 pill, 12px/700 tabular.
  - **21** (`.hs-progress-track` meter + bold `%`) → track 6px/r999 frozen; the four **gradients go
    flat** (§1.8); `<b>` 12.5 → 12px tabular.
  - **22** (`formatDate(targetCompletion)` → "Dec 18, 2026") → `.hs-cell-muted` 13px.
  - **23** (`Sparkles` + forecast date, else em dash) → unchanged; the late insertion is addressed
    under States.
  - **24–28** (manager name with `data.activeUser` fallback; `type`; `contractType`; USD value with
    `maximumFractionDigits: 0` and `"—"` when unpriced; `address || location`) → cells 24–27 as
    `.hs-cell-muted` / `.hs-cell-num`; **`missingInformation` 15 stated in the UI as-is**: Address and
    Value are displayed but not searchable — no change, flagged **Q4**.
  - **29** (`.is-selected` when checked **or** `project.id === selectedProjectId`) → kept; tint
    `#f2f6ff` → `rgba(47,107,255,0.06)`, and it still beats the hover wash.
  - **30** (count pill `"<n> project(s)"` + `" · <m> selected"`) → `.hs-count-pill`, r999 kept, fill
    `--wx-line-soft`, 12px/700.
  - **31** (Prev / one button per page / Next, `aria-current="page"`) → `.hs-page-btn` r6 → **r999**;
    active goes from an ink border to a `#2f6bff` fill. The unbounded button flood
    (`missingStatesOrMotion` 1) is **preserved**; windowing it is proposal **R7**.
  - **32** (per-page select 10/25/50, `aria-label "Projects per page"`, default 25) → `.hs-perpage`
    reusing `.hs-qf` geometry.
  - **33** (sortable header buttons with rotating chevrons and `th.sorted`) → the ×1 eyebrow; the
    chevron is `#8a877e`, rotates on desc, and `.sorted` marks the active key with `#1c1c1a` text
    plus a `#2f6bff` chevron.
  - **`missingInformation` 2** (the CSV's own 12-header contract, which differs from the table:
    Address included, raw ISO dates, `"<n>%"`, raw Value, quote-doubling) → untouched; the export is
    logic and the brief forbids changing it.
  - **`missingInformation` 3–4** (sticky `thead` `top: 0; z-index: 1`, 42px; `min-width: 720px`;
    46px rows; `padding: 0 14px`; nowrap; `tr:last-child` border drop; wrap border + r10) → all
    frozen except the wrap's border colour and radius (→ r18) and the head's fill (→ `#fff`, §1.1).
  - **`missingInformation` 5** (four two-stop gradient fills, no `tone-blue` rule, `min-width: 150px`,
    `<b>` 12.5px/700 tabular) → §1.8.
  - **`missingInformation` 6** (the zero-specificity global focus ring in `redesign.css:66-72` is
    cancelled by `outline: 0` on `.hs-search input` and `.hs-qf select`, so **all five selects have no
    visible focus indicator**) → **repaired**: `.hs-qf:focus-within` and `.hs-search:focus-within` get
    `--bf-focus-ring` + `border-color: #2f6bff`. Presentation-only, and it is the one accessibility
    hole in this screen.
  - **`missingInformation` 7** (the `h1`'s accessible name is "Projects Show all projects") → held.
  - **`missingInformation` 10** (the wrap's horizontal scrollbar is styled by the global custom
    scrollbar in `redesign.css:50-64`, `#c6d3e5` thumb) → re-toned to `rgba(28,28,26,0.22)` on
    `rgba(28,28,26,0.07)`, one ink instead of a blue-grey. Global rule — coordinate.
  - **`missingInformation` 11** (nine inherited affordances the markup never uses: `.hs-search kbd`,
    `.hs-view-add`, `.hs-qf-mini`, `.hs-btn-icon`, `.hs-thumbs`, `.hs-avatar.tone-*`,
    `.hs-cell-actions.two` + `.hs-row-action.edit:hover`, `.hs-kpi-value small`,
    `.hs-kpi-ico.tone-red`, `.hs-page-tag`) → **all re-skinned anyway**, because Crews/Equipment/
    Materials and the Gantt page do use several of them; none is deleted.
- **Every action placed:** **1** caret → `projectView = "all"` (and it still is not a menu — risk 8,
  flagged **Q1**); **2** "Import schedule" `.hs-btn` → the importer; **3** "Add project"
  `.hs-btn.hs-btn-primary` (blue, role 1) → `openCreateProject()`; **4** tab click via
  `SegmentedPills`' `onChange`, unchanged handler; **5** search change; **6** the Filter chip that
  only ever *clears* (risk 7, flagged **Q1**); **7** sort chip → `toggleSort("name")`; **8** four
  selects; **9** the Advanced/Clear link → `clearProjectFilters()`; **10** header checkbox
  `"Select all projects on this page"`; **11** per-row `"Select <name>"`; **12** eight sortable
  headers (Forecast finish, Contract, Location remain plain `<th>` — risk 10, flagged **Q2**);
  **13** row link `.hs-link` `"Edit <name>"`; **14** the hover-reveal `Trash2` `"Delete <name>"`,
  `title="Delete project"` — **reveal kept, and made focus-reachable**: opacity 0 → 1 on
  `tr:hover`, `.hs-row-action:focus-visible` **and** `tr:focus-within`, over `--bf-dur-press` 0.18s,
  with `@media (hover: none) { opacity: 1 }` frozen and the red-tint hover kept; **15** pagination;
  **16** per-page; **17** "Export" → `exportProjectsCsv()` (`Download` icon, filtered set,
  `buildflow-projects.csv`, Blob object URL); **18** the selection dead end — **preserved as a dead
  end**, footer text and row tint only, no bulk bar invented (risk 11 / `missingActions` 6);
  `missingActions` 4 (the sort chip's `.active` whenever `sortKey !== "status"`) kept.
- **States:** *empty* — the two copies (**empty 1**) render inside the licence-1 dashed frame, 1px
  dashed `var(--wx-line)`, r18, transparent, `padding: 44px 20px` frozen, `Building2` at 28px
  `#8a877e`, `strong` 15 → 16px/600, `span` 13px `#8a877e`; **empty 2** the footer still renders
  under it ("0 projects", a single page "1"); **empty 3** the option lists collapse to their default
  labels. *loading* — **loading 1**: the forecast column's un-animated late insertion gets a 0.25s
  opacity fade on `.hs-delta` and the `Sparkles` cell only (no layout shift, since the columns exist
  either way); **loading 2** the page stays gated on the shell bootstrap. *error* — **error 1**: the
  swallowed `fetchScheduleStatus()` rejection still shows nothing (flagged **Q3**); **error 2**
  delete failures surface in the confirm dialog. *add-on lock* — none. *Add: `missingScreens` 2* —
  when the edited project vanishes from `data.projects` on reload, `projectModalMode` stays `"edit"`
  and **no dialog renders**, so the row link appears dead. Presentation cannot fix it; flagged **Q5**.
- **Motion:** **invert** on ~20 pills (2 buttons, 2 chips, 4 view pills, 4 quick filters, the page
  buttons, Export); **slide** on `.hs-qf-link` only; **no lift**; **no tilt**. Row hover
  `#f6f8fc` → `rgba(28,28,26,0.035)` over 0.18s `var(--bf-ease)`. One reveal: `.hs-index-card`,
  target 2 of 3, `--i: 1` → 50ms. **`data-reveal` must not touch `.hs-table-wrap` or `.hs-empty`**
  (§1.7). Skeleton: none — the table renders synchronously off `data`. Reduced motion: the four
  existing `.proj-rx` blocks are extended, not replaced.
- **Tests touched:** `tests/index-pages.test.tsx:37` (h1 `/^Projects/`, "Active Projects", enabled
  "Add project", `role=tablist` name "Project views" with `/^All projects/` `aria-selected`, `/^Active/`,
  `/^At risk/`, the row via `button "Edit Riverside Office Building"` containing "In Progress", "On
  Track", "62%", "Matt Johnson", `checkbox "Select Riverside Office Building"` unchecked, the search
  and filter round-trips) — **passes unchanged**: every string, role and `aria-selected` survives, and
  `SegmentedPills` keeps `role="tab"`. `:80` (Add project → new row "Not Started"/"0%" → footer
  `/^2 projects/`) **unchanged**. `:154` (row link → "72%"/"Monitor") **unchanged**. `:204`
  (`"Delete Riverside Office Building"` → confirm → "No projects added yet") **unchanged**. `:helper
  findIndexCard()` — **the reason `.hs-index-card` stays a `<section>` and the `h1` stays inside it**;
  passes only because of that. `App.test.tsx:656 / :687` (`getByRole("button", {name: /^Add project$/i})`)
  **unchanged**.

---

## Projects rail — Project Alerts

- **Today:** a bordered `.hs-panel` (1px, r12, `#fff`, pad 16) in the 330px sticky rail, `h2
  "Project Alerts"` 14px/700, up to four hand-assembled rows with 34px tinted icon chips and
  hard-coded relative times.
- **Becomes:** a `DocSection` — transparent, on the ground, no border, no radius, no shadow. The `h2`
  becomes the ×1 eyebrow (11.5/650/0.045em/upper/`#8a877e`) with the "View all" link on the same
  baseline. Rows keep the `.cc-alert` grid: 34px chip at **r12**, title `--bf-app-row-strong`
  13.5px/600 `#1c1c1a`, meta `--bf-app-meta` 12px `#575550`, time 11.5px `#8a877e` right-aligned,
  separated by 1px `--wx-line-soft` row rules instead of a card boundary. Rail gap 16px → 27px.
- **Every information item placed:** **1** heading "Project Alerts" → the eyebrow. **2** up to two
  open DelayIQ rows (`AlertTriangle`, tone red, `delayIQ.title`, `"<project> · <impactDays> day
  impact"`, `"10m ago"`). **3** the weather row (`CloudSun`, amber, "Weather delayIQ expected",
  `"<project|All sites> · <alert.title>"`, `"45m ago"`). **4** the short-material row (`Truck`, blue,
  "Material delivery delayIQed", `"<material> · <project>"`, `"2h ago"`). **5** the row anatomy
  (chip/title/meta/`.cc-alert-time`) → as above. **6** "the ago strings are HARD-CODED literals" →
  **preserved verbatim**; rewiring them to `relativeTime()` (which exists 40 lines away at
  `App.tsx:39154`) is proposal **R2**, because it changes displayed values.
- **Every action placed:** **1** "View all" `.hs-panel-link` → `setPage("delayIQs")`, `#2f6bff`,
  12.5 → 12px/600, **slide** 3px. **2** "Alert rows themselves are not clickable" → preserved as a
  non-affordance: no hover state on the row, so the section does not promise a click it cannot honour.
- **States:** *empty* `"No active alerts right now."` (`p.cc-empty-line`) → 13px `#8a877e`, inside the
  section, no dashed frame (it is one line, not an absent dataset). *loading / error* — none; derived
  synchronously from the payload. *add-on lock* — none.
- **Motion:** none of the four moves except **slide** on the link. Reveals: it is inside
  `.hs-index-rail`, reveal target 3 of 3 — the rail reveals as **one** node, not per panel, so three
  sections cost one budget slot. Skeleton: none.
- **Tests touched:** none. **The trap to state:** `App.test.tsx:1304-1374` asserts on a *different*
  "Project Alerts" — the Dashboard `dash-block`, with `time[datetime]` elements and a
  `role="region"` named "Project Alerts contents". This rail panel has neither. Do not add a
  `role="region"` or a `<time datetime>` here while restyling, or a global query in a future test
  becomes ambiguous (risk 18).

---

## Projects rail — Upcoming Milestones

- **Today:** a second bordered `.hs-panel`, `h2 "Upcoming Milestones"`, up to five derived rows with
  a `CalendarDays` chip and a right-aligned `"Dec 18"`.
- **Becomes:** a `DocSection` on the same grammar as Project Alerts — transparent, eyebrow head,
  1px `--wx-line-soft` row rules, chip r12, title 13.5px/600, project name 12px `#575550`, date 12px
  tabular `#8a877e`.
- **Every information item placed:** **1** the heading → eyebrow. **2** up to five rows from
  `deriveScheduleMilestones(data)` filtered to `>= dashboardToday` (one `"<Phase> Complete"` per
  phase with an `endDate`, one "Certificate of Occupancy" per project with a `targetCompletion`,
  sorted ascending) → unchanged; derivation untouched. **3** the row anatomy incl.
  `formatScheduleDate()` "Dec 18" → as above. **4** `dashboardToday` as a module-level local →
  unchanged. Plus **`missingInformation` 13**: `ScheduleMilestone.tone` is ignored here (the chip is
  fixed) and the project-name fallback is the literal `"Project"`, not `"Unassigned"` → **both
  preserved**; tinting the chip by `tone` is proposal **R3**.
- **Every action placed:** **1** "View all" → `setPage("schedule")`, slide. **2** rows not clickable →
  no hover state.
- **States:** *empty* `"No upcoming milestones."` → 13px `#8a877e`. *loading / error* — none.
- **Motion:** slide on the link; inside the rail's single reveal. Skeleton: none.
- **Tests touched:** none. Note the collision: an identically-titled "Upcoming Milestones" heading
  exists on the Schedule landing page (`schedule/pages/SchedulePage.tsx:102`), so a global
  `getByText` in any new test would be ambiguous (risk 18) — keep the heading a plain `h2` with no
  new `role`.

---

## Projects rail — Portfolio Health (donut + legend)

- **Today:** the third bordered `.hs-panel`: a recharts donut (`ResponsiveContainer` 100%×150,
  `innerRadius 48`, `outerRadius 68`, `paddingAngle 2`, `stroke="none"`, one `<Cell>` per slice) with
  a bold total in the hole, plus three hand-built percent bars.
- **Becomes:** a `DocSection`, transparent. The donut keeps every recharts prop and every explicit
  hex (`#188038`, `#b45309`, `#6d28d9`) — the three bucket colours are **information**, not chrome, so
  the accent budget does not touch them. The centre overlay: total at `--bf-app-figure`
  `clamp(20px,1.6vw,26px)`/700/tabular over the word "Projects" as the ×1 eyebrow. Legend rows: dot
  key, a 6px/r999 bar on a `--wx-line-soft` track (same species as `.hs-progress-track`), and the
  `<n>%` at 12px tabular. The bar's `width 0.8s cubic-bezier(0.22,1,0.36,1)` transition is already
  the signature curve — kept.
- **Every information item placed:** **1** heading → eyebrow. **2** donut centre (total over
  "Projects"). **3–5** the three legend/slice rows (On Track `#188038`, At Risk `#b45309`, Completed
  `#6d28d9`) with counts and percents. **6** the row anatomy (`.proj-health-key i` dot,
  `.proj-health-bar b` width, `.proj-health-pct`). **7** zero-value slices dropped from the donut but
  still listed at 0% in the legend → unchanged. **8** `healthPct` rounding guarded to 0 → unchanged.
- **Every action placed:** **1** "Details" `.hs-panel-link` → `setPage("reports")`, slide. **2** no
  slice interaction (no `onClick`, no `<Tooltip>`, no `<Legend>`) → **preserved**; adding a recharts
  tooltip would be a new affordance.
- **States:** *empty* `"No data"` (`.proj-health-empty`) replaces the donut when every bucket is 0,
  the centre still reads "0 / Projects" and the legend still lists all three rows at 0% → unchanged,
  re-toned to 13px `#8a877e` centred in the donut's 150px box. *loading / error* — none.
- **Motion:** recharts' own Pie mount animation → kept; the legend bar width transition → kept, and
  it is already frozen under the existing `prefers-reduced-motion` block at
  `projects-redesign.css:1186`. Slide on "Details". Inside the rail's single reveal.
- **Tests touched:** none.

---

## ProjectEditorDialog — "New Project" / "Edit Project"

- **Today:** the app's most Welcome-faithful surface, and it renders in Palatino. Portalled to
  `<body>`, `.pdx` backdrop (`rgba(28,28,26,0.42)` + `blur(6px) saturate(120%)`, z-index 80), dialog
  `min(880px,100%)` / r26, two aurora blobs in a 320px `.pdx-glow`, an eyebrow pill with a pulsing
  dot, a display title with a gradient italic `em`, an 11-field two-column form, and an ink-pill
  submit.
- **Becomes:** **almost entirely unchanged — the only edit is the font family.** `.pdx-title` keeps
  `clamp(28px, 3.4vw, 42px)`/500/−0.015em and its `em` gradient
  (`linear-gradient(105deg, --wx-g-blue, --wx-g-purple 55%, --wx-g-coral)` + `background-clip: text`),
  and moves `font-family: var(--wx-serif)` → `var(--bf-font-sans)`. This is **the cluster's display
  rung** and the third leg of the ladder (13 → 26 → 42 = 3.23×). `.pdx-sub` keeps `56ch` and
  `clamp(14px,1.1vw,15.5px)`. Labels stay 11px/700/0.05em uppercase `--wx-mut` — **and the comment at
  `project-dialog-redesign.css:231` explaining that `--wx-faint` measured 3.59:1 and failed AA must
  be carried forward**, or the next person "fixes" the label colour to `#8a877e` and breaks contrast.
  Radius r26 (stage rung), `--bf-shadow-stage`. Buttons per finding 0.3d: `.pdx-save` stays the
  **ink pill**, `.pdx-cancel` stays the **line pill** and now **inverts** to `#1c1c1a`/`#fdfcf9` on
  hover instead of washing to 4%.
- **Every information item placed:** **1** the backdrop spec incl. z-index 80 above the FAB →
  unchanged. **2** dialog `role`/`aria-modal`/`aria-labelledby`/`aria-describedby`, `min(880px,100%)`,
  `max-height: min(880px, 100vh-56px)`, r26, forced `color-scheme: light` (so native `<select>`
  popups stay light — **keep it**) → unchanged. **3** the two `.pdx-aurora` blobs → unchanged (they
  are inside a modal, not on the page ground, so **R1** does not reach them). **4** eyebrow pill
  "Project details" + pulsing `.pdx-dot` → unchanged. **5** the split title "New/Edit <em>Project</em>"
  → unchanged except the family. **6** both description strings → unchanged, at `--bf-app-lede`.
  **7** the inline `(optional)` span inside the Contract Value label — **must stay inside the
  `<label>`**, because the accessible name is "Contract Value (optional)" (risk 13). **8** the
  `#project-value-hint` helper text and its `aria-describedby` → unchanged, 12px `#575550`, capped at
  `--bf-app-prose`. **9** the `"e.g. 4,200,000"` placeholder and the `toLocaleString` display →
  unchanged. **10** manager options `"<name> - <role>"` filtered to PM/Superintendent → unchanged.
  **11–12** the 10 `JOB_STATUSES` and 4 health options in order → unchanged. **13** every create-mode
  default (`type "Commercial"`, `contractType "Fixed Price"`, `targetCompletion` today+90,
  `percentComplete 0`, `status "Not Started"`, `scheduleHealth "On Track"`, `value undefined`) →
  unchanged. **14** the four submit labels → unchanged. **15** both close `aria-label`s → unchanged.
  **16** the label spec + the AA comment → as above.
- **Every action placed:** **1** submit → POST/PATCH → `onSaved` → `reload()` → `onClose()`;
  **2** the no-op guard; **3** Cancel; **4** the `.pdx-close` X (18px); **5** Escape via
  `useModalDialog` (capture phase, `stopPropagation`); **6** the Tab/Shift+Tab trap; **7** initial
  focus on the first `.pdx-form` control rather than the close button, and focus **return** to the
  opener on close (`missingActions` 5 of the cem record); **8** the digits-only normalisation;
  **9** the re-sync `useEffect`; **10** backdrop click does **not** close → all ten unchanged. Nothing
  in this dialog is behaviour-touched.
- **States:** *empty* — no PM/Superintendent user ⇒ zero options ⇒ submit permanently disabled with
  no message (risk 15) → **preserved**, flagged **Q6**. *loading* — `isProjectSubmitting` disables
  the button and swaps the label; no spinner, fields stay editable; the disabled style is the 16%-ink
  fill. *error* — the four cases: the always-visible `% Complete` validation message
  (`role="alert"`), the server message with its two fallbacks, staying open on failure, and the
  silent disabled-submit for every other required field (risk 14) → all preserved; the error `<p>`
  keeps `pdx-field-in` at 0.4s. *add-on lock* — none.
- **Motion:** all seven animations kept **by name** — `pdx-backdrop-in` 0.32s, `pdx-dialog-in` 0.52s,
  `pdx-field-in` 0.6s with the `nth-child` ladder 0.06 / 0.10 / 0.14 / 0.18 … through 9 and a shared
  delay from 10, `pdx-pulse` 2.6s, the `.pdx-close/.pdx-save/.pdx-add-role` hover lifts on
  `--pdx-ease`, the reduced-motion block at `:699` and the 720px single-column collapse at `:673`.
  Renaming any of them would silently un-null it under `prefers-reduced-motion`. Of the four hover
  moves: **invert** (Cancel), **lift** (Save, −1px). No reveal — a modal is not a scroll surface.
- **Tests touched:** `App.test.tsx:656` (dialog name "New Project", the six prefilled values, "Create
  Project" starts disabled) **passes unchanged**; `:673` (`role="alert"` "Project could not be
  created." + dialog still mounted) **unchanged**; `:698` (dialog "Edit Project" + prefills)
  **unchanged**; `:714` ("Project could not be updated.") **unchanged**;
  `tests/index-pages.test.tsx:80` (`getByLabelText` "Project Name" / "Location" / "Address" /
  "Target Completion", button exactly "Create Project", POST body shape) **unchanged**; `:154`
  ("% Complete", "Schedule Health", "Save Changes", PATCH body) **unchanged**. Two constraints this
  imposes: those labels are queried **unscoped**, so they must stay unique on the rendered page, and
  `% Complete` must stay an `<input type="number">` for `toHaveValue(0)`.

---

## Remove-confirm dialog — "Delete project"

- **Today:** the same `.pdx` shell narrowed by `.pdx-confirm` to `min(560px,100%)`, with a summary
  tile, a plain-language blast-radius line, and the system's one red pill.
- **Becomes:** unchanged but for the title family (Palatino → Inter) and two re-tones: `.pdx-summary`
  and `.pdx-note` to r12 + 1px `--wx-line-soft` on `#fff`. `.pdx-danger` stays exactly as it is —
  `#c5221f`, hover `#a81b19` + `0 14px 32px rgba(197,34,31,0.32)` + `translateY(-1px)` over 0.2s
  `--pdx-ease`. It is documented in source as "the one red pill in the system" and that is precisely
  the accent-budget discipline this plan is arguing for.
- **Every information item placed:** **1** the shared backdrop + `.pdx-confirm` width. **2** eyebrow
  "Confirm delete" + pulsing dot. **3** title "Delete <em>project</em>" → so the accessible name stays
  the lower-case `"Delete project"` the test matches. **4** the description
  ("…jobs, phases, materials and schedule assignments. This cannot be undone."). **5** the summary
  card (uppercase `type` over bold `name`). **6** the note `"<n> jobs · <p>% complete · <location>"`
  **including the missing plural handling** ("1 jobs") → preserved verbatim. **7** the aria wiring.
  **8** the confirm label "Delete Project" / "Deleting Project" + `Trash2` 17px. All eight unchanged.
- **Every action placed:** **1** confirm (`aria-label "Confirm delete <name>"`) → DELETE, clear
  `selectedProjectId`, close, `reload()`; **2** Cancel (also clears the error); **3** the X
  (`"Close Delete Project"`); **4** Escape + trap + focus return; **5** backdrop click does not
  close; **6** initial focus lands on the **close X** because there is no `.pdx-form` here (the cem
  record's correction 4 makes the same point about the crew confirm) → all six unchanged.
- **States:** *empty* — the note reads `"0 jobs · 0% complete · <location>"`. *loading* —
  `isDeletingProject` disables the pill, label → "Deleting Project", disabled style a 35%-alpha red
  with no shadow. *error* — `p.form-error role="alert"` with the fallback "Project could not be
  deleted."; the dialog stays open. *add-on lock* — none.
- **Motion:** `pdx-backdrop-in`, `pdx-dialog-in`, `pdx-field-in` on `.pdx-body` (0.5s), `pdx-pulse`,
  and the danger hover lift — all kept by name. **Invert** on Cancel, **lift** on the danger pill.
  No reveal.
- **Tests touched:** `tests/index-pages.test.tsx:204` pins the row button "Delete Riverside Office
  Building", the dialog accessible name `"Delete project"` (lower-case p — so the `<em>` split must
  not change), the confirm button `"Confirm delete Riverside Office Building"`, the DELETE call and
  the post-delete copy "No projects added yet". **Passes unchanged.**

---

## ScheduleImportDialog — "Import a schedule" (five stages)

- **Today:** a full 597-line screen that the record collapsed into one line of an array. Reached from
  the Projects toolbar and from the Schedule page. It renders in the **pre-reskin** shell
  (`.project-dialog-backdrop` at z-index 30, `rgba(6,18,35,0.52)` no blur, `min(820px)` widened to
  `min(860px)` by `.sim-dialog`, r10, navy `0 28px 80px`), with no `useModalDialog` — **no Escape, no
  focus trap, no initial focus, no focus restore** — and its own motion vocabulary.
- **Becomes:** the `.pdx` opt-in from §2 (one added class on the backdrop and the dialog): ink scrim
  + `blur(6px)`, **z-index 80** so the Ask-AI FAB stops covering "Import & see full health check",
  r26, `--bf-shadow-stage`, `pdx-backdrop-in` + `pdx-dialog-in`, and the `.crew-form`/`.project-form`
  selector extension so `pdx-field-in` reaches its rows. `h2` → the cluster display rung
  (`clamp(28px,3.4vw,42px)`, Inter), sub → `--bf-app-lede` at 56ch. Every stage keeps its own
  structure; only surface tokens change. Radius sweep inside it: `.sim-drop` and the stat cells → r18,
  chips and pills → r999, the sample table → the same 46px/42px/`0 14px` metrics as the index tables
  so the two read as one product.
- **Every information item placed** (from `missingScreens` 1, stage by stage):
  - **choose** — `h2 "Import a schedule"`; sub "Bring an existing Primavera P6 or Microsoft Project
    schedule into BuildFlow."; the X (`aria-label "Close schedule import"`); the `.sim-drop` zone with
    its `.dragging` state, `FileUp` 26px, "Drop your schedule file here", "Primavera P6 export (.xer)
    or Microsoft Project XML (.xml)", the "Choose file" button and the `display:none`
    `<input type="file" accept=".xer,.xml,.mpp">`; the three-cell cheat-sheet (Primavera P6 / "File →
    Export → Primavera PM (XER)"; Microsoft Project / "File → Save As → XML Format (*.xml)"; "Why not
    .mpp?" / "It's an undocumented binary format — save it as XML first.") → all kept; the drop zone
    becomes 1px **dashed** `var(--wx-line)` at r18 (the licence-1 absence frame, the same species as
    `.hs-empty`), `.dragging` → `border-color: #2f6bff` + `rgba(47,107,255,0.04)` fill.
  - **reading** — `CloudLoader` (compact) + "Reading your schedule…" → kept; the string may be wrapped
    in the existing `TextShimmer` (zero new files).
  - **preview** — `.sim-source` (`CheckCircle2` + `preview.source` + filename); the `HealthTeaser`
    (SVG `ScoreRing` score/100 + a grade pill Healthy | Monitor | At Risk | Critical mapped to
    good/warn/risk/bad + `health.headline`); the five-cell stats row (activities read / jobs to create
    / phases / milestones / relationships, all `toLocaleString`'d) → **the five cells become a
    `FigureRow`**, so the importer's figures and the index's figures are literally the same component;
    then per project: name, `"<n> jobs · <p> phases[ · finishes <date>]"`, the phase-chip row with each
    chip's `title="<startDate> → <endDate>"`, the 4-column sample table (Activity / Phase / Start /
    Finish) and `"+ N more activities"`; then the "Before you import" warnings list → all kept.
  - **committing** — `CloudLoader` + "Importing your schedule…" + `"<n> jobs into <m> projects"` inside
    `role="status" aria-live="polite"` → kept, both attributes preserved.
  - **done** — `"Imported <n> jobs and <m> phases into <project names>"`; the full `HealthReport`
    (`ScoreRing` + grade + `h3 "Schedule health check"` + headline); the ForecastIQ panel
    (`CalendarClock`, "ForecastIQ completion", the `FORECASTIQ_LABEL` badge set Not started yet | On
    track | Slipping | At risk | Complete with `TrendingUp`/`TrendingDown`, Planned finish → Projected
    finish → Variance `"<n> days late/early"` / "on plan", and the two-marker meter of
    `percentComplete` vs `percentTimeElapsed` with its legend); the optional `ConfidenceBand`
    (`"<n>% chance of hitting your <date> plan date"`, the P10–P90 range track with P50/P80 ticks and
    the plan marker, `role="img"` with the four-date `aria-label`, the legend "Your plan" / "P50 —
    coin-flip" / "P80 — confident", and the method string); the five-cell stats row (activities /
    complete / in progress / not started / links); the findings list (per finding: severity dot,
    title, severity label, detail, sample activity codes, "+N more") or the clean state "No structural
    issues found — logic, durations, and resourcing all look clean." → all kept. The two meters and
    the range track adopt the flat 6px/r999 track species from §1.8, and their marker colours are
    information, so they keep their hues.
  - **error (any stage)** — `.sim-error role="alert"` + message + optional hint, including the two
    client-side refusals: `".mpp files can't be read directly"` with the Save-As-XML hint, and
    `"That file is <size>, which is over the 24.0 MB limit."` with the split-the-schedule hint → kept
    verbatim; the alert becomes the one red role in the dialog (`#c5221f` on `--hsx-red-soft`, r12).
  - **`corrections` 4** — Projects passes the importer **no** `defaultLocation` while the Schedule page
    passes `data.projects[0]?.location` → preserved; it is a prop, not presentation.
- **Every action placed** (`missingActions` 5–6): "Choose file" proxying `inputRef.click()`;
  drag-and-drop on `.sim-drop` (`onDragOver` / `onDragLeave` / `onDrop` with `preventDefault` and the
  `.dragging` class); "Choose a different file" → `reset()` to `choose`; "Import & see full health
  check" → `commit()`, disabled while busy **or** when `preview.stats.jobs === 0`; "Cancel", which
  becomes "View my projects" with primary styling at `done` (both just `onClose`); the X; the phase
  chip's `title` tooltip on hover — **and now also on `:focus-within`**, per the editorial graft, since
  a `title` on a non-focusable chip is unreachable by keyboard; and the file input's
  `event.target.value = ""` reset so the same file can be re-chosen after an error. All preserved.
- **States:** all five stages are the states, plus the error case above. The **absent** keyboard
  behaviour is load-bearing information: it has `role="dialog" aria-modal="true"` with no trap, no
  Escape and no focus restore. Adding `useModalDialog` here is a **behaviour** change, so it is
  proposal **R8**, not part of the re-skin — but the `.pdx` opt-in already fixes the z-index half.
- **Motion:** `CloudLoader` particles at `reading` and `committing` (kept); the `.sim-drop.dragging`
  state change; **gains** `pdx-backdrop-in` / `pdx-dialog-in` / `pdx-field-in` and therefore, for the
  first time, a `prefers-reduced-motion` block — the existing one at
  `project-dialog-redesign.css:699` covers it because the keyframe names are unchanged
  (`missingStatesOrMotion` 4 records that it has no reduced-motion block today; this is the fix).
  **Invert** on Cancel and the outline buttons; **lift** on the primary. No reveal.
- **Tests touched:** `schedule/ScheduleImportDialog.test.tsx:87` ("previews a dropped file … then
  imports it and reports what it made"), `:114` ("refuses a .mpp before any request, with the way
  out"), `:123` ("shows the server's reason and hint when the preview fails, and goes back to
  choosing a file") — all three **pass unchanged**: the class additions are additive, every string is
  preserved and no query is class-based. `schedule/boundary.test.ts` is unaffected because the edit is
  inside `schedule/`, not `App.tsx`.

---

## ProjectThumb (dead component)

- **Today:** a `span.project-thumb` whose background is `imageThemes[project.image]` (five
  multi-stop `linear-gradient(135deg, …)` sky/building/ground bands). Defined at `App.tsx:27013`,
  referenced nowhere.
- **Becomes:** nothing. It is not restyled, because it does not render.
- **Every information item placed:** **1** the five `imageThemes` keys (office-building, apartments,
  medical-center, warehouse, parking-garage) → the **map stays**; it is live at four other call sites
  (`.aix-rail-art` 6097, `.wx-ov-card-art` 6385, 29802, 37137). **2** "imageThemes itself is still
  live elsewhere — do not delete the map, only the component" → honoured. And per the record's
  `corrections` 5: the **class** `project-thumb` is also still applied at `App.tsx:29801` and styled
  at `styles.css:8910 / :10102 / :16759` and `dashboard-redesign.css:552` — **deleting the component
  is safe; deleting its CSS is not.**
- **Every action placed:** none exist.
- **States / Motion:** none.
- **Tests touched:** none. Deleting the component is proposal **R9** (dead-code removal, needs
  approval only because it is a source deletion in a file another session is editing).

---

## Crews page frame + crew figure row

- **Today:** `<div className="page-stack crews-page crew-rx hs-index">` with the identical `-rx`
  frame, three **static** aurora blobs (42/36/30vw, no transform), an always-mounted
  `<div className="dx-cursor">` that **`crews-redesign.css` never styles** (invisible dead markup),
  `gap: 22px`, and a four-tile bordered KPI strip. **No `.hs-index-grid` and no rail** — the index
  card sits directly in `.hs-index-main`.
- **Becomes:** same root, same classes. `gap: 22px → var(--bf-rhythm-dense)` (27px @900h);
  `.hs-index-main` gains `max-width: 1140px; margin-inline: auto`. The four tiles become a
  **`FigureRow`** with three vertical `--wx-line-soft` rules. `DocHeader` eyebrow: **"CREWS ·
  OPERATIONS"**.
- **Every information item placed:** **1** "Total Crews" = `data.crews.length`, blue `Users`;
  **2** "Available Now" = `status === "Available"`, green `CheckCircle2`; **3** "Total Workers" = Σ
  `crew.size`, violet `HardHat`; **4** "Avg Utilization" = rounded mean of `crew.utilization` + `%`,
  amber `Gauge` → four `FigureRow` items, labels and derivations verbatim, chips r12 with their tones.
  (Crews' `--wx-amber` is the *real* amber `#b45309` while the other three pages' is `#0032b0`, a
  blue — decision #3 says both stay; this page is where the split is visible.) Plus
  **`missingInformation` 16**: "Avg Utilization" reads 0% on an empty workspace → its own empty state,
  preserved. **`missingInformation` 3–4** (Crews' blobs are the only static ones; `.dx-cursor` is
  styled on `equip-rx`/`mat-rx` but not here, and `crews-redesign.css:92`'s
  `.crew-rx > *:not(.dx-bg):not(.dx-cursor)` is the mechanism) → **preserved exactly, including the
  invisibility**; do not "fix" it by adding a glow. Deletion of the node is proposal **R1**.
- **Every action placed:** the page is reached from the Operations flyout and from the Create-new
  menu's "Crew" entry, which **navigates only** — no `createSignal`, so the Add Crew dialog does not
  auto-open (crossCutting 12). Both preserved. `missingInformation` 20: the Operations rail icon
  always lands on **Projects**, never Crews — preserved.
- **States:** *empty* — figures read 0 / 0 / 0 / 0%. *loading* — none local (crossCutting: the page
  only ever renders with a resolved payload). *error* — none at this level. *add-on lock* — none, but
  the flyout row for Crews carries `class="recommended"` whenever the **Time Cards** add-on is
  selected (`programRegistry["time-cards"].relatedPages = ["crews"]`) — shell-owned, preserved.
- **Motion:** no lift, no invert, no slide, no tilt at this level. One reveal: `.hs-kpis`, `--i: 0`.
  `useHudMotion` still writes `--mx/--my/--px/--py`; on this page they feed nothing (the blobs are
  static and the cursor is unstyled) — recorded, not changed.
- **Tests touched:** `App.test.tsx:736` asserts `heading "Crews"` as an **exact** accessible name and
  the text "Total Crews" — both survive (`FigureRow` keeps the label string; `DocHeader` keeps the
  `h1`). **Passes unchanged.** `tests/index-pages.test.tsx:236` reaches the page the same way.

---

## Crews index document

- **Today:** the same `hs-index` template as Projects with 11 columns, four saved views, two quick
  filters, one hover-reveal row action, and a status-legend footer below the card.
- **Becomes:** identical treatment to the Projects index document — dissolved card, `DocHeader`,
  `SegmentedPills`, pill toolbar, `ScrollEdge` table stage at r18. The 11-column nowrap table takes
  **`.bf-doc-bleed`** if and only if it measures `scrollWidth > clientWidth` at 1440 in the
  verification pass (the "Labor mix" cell — `"3 Laborers · 1 Operators"` — is the long one); the
  decision is mechanical, not aesthetic.
- **Every information item placed:** **5** title "Crews" + chevron + `data-tutorial-id="crews-page-title"`
  → `DocHeader`, **the tutorial id stays on the same element** (two tutorial steps and the v3.3
  "What's new" spotlight anchor to it, and the spotlight rect is recomputed from its box on resize and
  capture-phase scroll, so its geometry must stay stable). **6–9** the four view tabs (All crews /
  Available / On job / Overbooked) with their live counts and `Users`/`CheckCircle2`/`CalendarDays`/
  `AlertTriangle` icons → `SegmentedPills`. **10** the Filter chip + `· N` + the flipping title.
  **11** the Sort chip echoing `name | status | utilization | size | foreman` with its rotating
  chevron. **12** `"<filtered> of <total>"`. **13** the row avatar chip (`Users` glyph) + name as a
  bold blue link + specialty sub-line → `.hs-avatar` 30px/50% kept, `.hs-link` 13.5px/600 `#2f6bff`,
  `.hs-row-sub` 12px with its 340px ellipsis. **14** the status badge — **and the three-names-for-one-state
  trap kept intact**: stored `"Scheduled"`, displayed "On Job", filter `value="Scheduled"` labelled
  "On Job", saved-view id `"on-job"` (risk 5). **15** the utilization bar + `%` with its
  <70 / 70–84 / ≥85 green/amber/red thresholds → flat fills per §1.8. **16** foreman (`crew.lead`).
  **17** `"<n> workers"`. **18** capacity (raw). **19** equipment via `equipmentForCrewJob()`.
  **20** current job via `activeAssignmentForCrew()`. **21** the labor-mix summary
  `"N Role · N Role"`. **22** the footer count pill + `" · N selected"`. **23** the per-page selector.
  **24** the `CrewStatusLegend` → its own entry below. Plus: **`missingInformation` 6** (`.hs-row-sub`
  truncation clips `crew.specialty`) preserved; **`missingInformation` 7** (`.hs-cell-num` tabular on
  Crew size and Capacity) preserved; **`missingInformation` 9** (`title="All crews"` on the chevron,
  `title="Delete crew"` on the trash) preserved; **`missingInformation` 10**
  (`aria-label="Row actions"` on the empty `<th>`) preserved; **`missingInformation` 11** (the
  `<section aria-labelledby="crews-index-title">` wrapper and the level-1 `h1` inside it) frozen;
  **`missingInformation` 13** (`.is-selected` also fires while that crew's edit dialog is open;
  `.is-set` per quick filter; the Sort chip `.active` when `crewSortKey !== "name"`) all preserved;
  **corrections 3** (`activeAssignmentForCrew` falls back to DelayIQed assignments, so "Unassigned"
  appears only with **no** assignments at all) — recorded so no new design implies a stronger join
  than exists (risk 11).
- **Every action placed:** **1** chevron → `crewView = "all"`; **2** "Add Crew"
  (`data-tutorial-id="crew-add-button"`, blue primary — **the tutorial gate validates on this button
  and on `crew-dialog`, so neither id may move**); **3** the four tabs; **4** "Search crews" across
  name/specialty/lead/job/equipment; **5** the Filter chip → `clearCrewFilters()`; **6** the Sort chip
  → `toggleCrewSort("utilization")`; **7** the status quick filter; **8** the specialty quick filter;
  **9** the Advanced/Clear link; **10** the five sortable headers (Name, Status, Utilization, Foreman,
  Crew size); **11** select-all; **12** per-row select; **13** the row link `"Edit <name>"`;
  **14** the hover-reveal trash `"Delete <name>"` — reveal kept and extended to `tr:focus-within`;
  **15** pagination; **16** per-page; **17** "Export" → `exportCrewsCsv()` with its 10-column header
  and `buildflow-crews.csv`; **18** Escape/Tab/focus behaviour inside the dialogs. All eighteen
  unchanged. Plus `missingActions` 6 (selection has **no consumer** — no bulk edit, delete, assign or
  export-selected, and the Sets are never cleared by a filter change) → preserved as a dead end;
  `missingActions` 7 (the page number is clamped for rendering but not reset, so widening a filter
  snaps back to the held page) → preserved, flagged **Q7**.
- **States:** *empty* — **1** "No crews added yet" / "Add your first crew to start scheduling work."
  and **2** "No crews match that search" / "Try a crew name, foreman, specialty, equipment, or job."
  in the dashed licence-1 frame with `Users` at 28px; **3** the specialty filter collapses to its
  placeholder. *loading* — **1** none local; **2** the submit labels double as the pending state
  ("Adding Crew" / "Saving Crew" / "Deleting Crew", disabled). *error* — **1** the crew-form
  `role="alert"` with "Crew could not be saved."; **2** "Crew could not be found." on a stale id;
  **3** "Crew could not be deleted.". All preserved verbatim.
- **Motion:** **invert** on ~16 pills; **slide** on `.hs-qf-link`; no lift; no tilt. Row hover
  0.12s → 0.18s `var(--bf-ease)`; the row action's reveal 0.16s → 0.18s. One reveal:
  `.hs-index-card`, `--i: 1`. The dead `[data-reveal]` block in `crews-redesign.css:98-155` and the
  unreachable `crew-dx-pulse` keyframe on `.dx-dot` are left in place (they null correctly under
  `prefers-reduced-motion` at `:731-746`) — cleaning them is part of proposal **R10**. Skeleton: none.
- **Tests touched:** `App.test.tsx:736` (heading exactly "Crews", "Total Crews", label "Search
  crews", the legend region, then Add Crew → dialog) **passes unchanged**;
  `tests/index-pages.test.tsx:236` (`role=tablist` name "Crew views", the row containing "Mike
  Johnson" and "8 workers", link "Edit Concrete Crew 1", dialog labels, "Save Crew") **passes
  unchanged** — `SegmentedPills` preserves the tablist and both tab names; `:299` (button "Delete
  Concrete Crew 1" → dialog `/^Delete crew/` → "Confirm delete Concrete Crew 1" → "No crews added
  yet") **unchanged**; `tests/tutorial.test.tsx:155` (the gate depends on `crew-add-button` and
  `crew-dialog` existing and on the saved crew appearing on the index) **passes unchanged provided
  `DocHeader` keeps `data-tutorial-id` on the `h1`** — this is the one place in the cluster where a
  wrapper element in the wrong position silently breaks a tutorial gate rather than a test assertion.

---

## Crew add/edit dialog (`.pdx-crew`)

- **Today:** the `.pdx` shell with a live "Size" preview tile, a trade-aware rate placeholder, and an
  arbitrary-length labor/operator mix.
- **Becomes:** unchanged but for the title family (Palatino → Inter) and three re-tones:
  `.crew-size-preview` and the `.labor-mix-row`s to r12 + `--wx-line-soft`, and `.pdx-add-role` /
  `.pdx-role-remove` onto the pill/chip rungs (r999 / r8). Title keeps
  `clamp(28px,3.4vw,42px)` and the gradient `em` on the second word.
- **Every information item placed:** **1** eyebrow "Crew setup" + pulsing dot. **2** the split title
  "Add/Edit <em>Crew</em>". **3–4** both sub-copies. **5** the live "Size" tile (label "Size", value
  `1 + Σ counts`, the foreman counted) → label becomes the ×1 eyebrow, value `--bf-app-figure`
  tabular, so the tile is visibly the same species as the page's figure row. **6** the section
  heading "Labors & Operators" → `--bf-app-section` 16px/600 (a test asserts this exact string).
  **7** the trade-aware rate placeholder `"Default <defaultCrewRate(specialty)>"` and all eight rate
  tiers (96 / 88 / 84 / 82 / 78 / 76 / 70 / `DEFAULT_CREW_RATE 95`). **8** the rate field's `title`
  ("What one worker on this crew costs per hour; the schedule's labour cost is hours × this rate") —
  **the only piece of helper text in the entire cluster** (`missingInformation` 17), so it also gains
  `:focus-within` reachability per the editorial graft. **9** the `aria-describedby` wiring to
  `crew-dialog-description`. All nine kept.
- **Every action placed:** **1** the X ("Close Add Crew" / "Close Edit Crew") + form reset; **2** "Add
  role" appending `{category:"Labor", role:"Laborers", count:1}`; **3** "Remove role <n>", disabled at
  one row; **4** Cancel; **5** submit with its four labels and its `canSubmit` gate (name, specialty,
  foreman non-empty **and** every row with a non-empty role and count > 0) → POST/PATCH → `reload()`
  → close; **6** Escape + trap + first-`.pdx-form`-field focus + focus return to the opener. All six
  unchanged.
- **Every form input placed:** the seven — Crew Name, Specialty/Type, Foreman (with their three
  `"Example: …"` placeholders), Hourly rate (number, min 0, step 1, optional), and per row Category
  (`aria-label "Category for role <n>"`), Role, Count (min 1, `Math.max(1, …)`). **`missingInformation`
  18 is a hard constraint:** the Category `<option>`s have **no `value` attribute**, so the label *is*
  the submitted payload — relabelling "Labor"/"Operator" changes the API body. Frozen.
- **States:** *empty* — **1** the mix can never be empty (remove refuses the last row, and the button
  is disabled at length 1); **2** the default new-crew mix is two rows (Labor/Laborers/1,
  Operator/Operators/1). *loading* — the submit label + disabled. *error* — the `role="alert"` `<p>`
  under the mix rows with its three messages. *add-on lock* — none. Also
  **`missingInformation` 17**: there is **no** field validation anywhere (no `required`, no
  `aria-required`, no `aria-invalid`, no per-field message) — the disabled submit is the only signal.
  Preserved; adding validation is behaviour (**R11**).
- **Motion:** all seven kept by name, including the `pdx-field-in` stagger on the labor-mix rows
  (0.4s) and the actions row (0.5s), the two `.pdx-aurora` blobs, the hover lifts, and the
  reduced-motion block at `:700-719`. **Invert** on Cancel and "Add role"; **lift** on Save. No
  reveal.
- **Tests touched:** `App.test.tsx:736` (labels "Crew Name" / "Specialty/Type" / "Foreman" + the text
  "Labors & Operators"), `:824` (the Size preview reads 5 after `Count for role 1 = 3`), `:836`
  ("Add role" creates "Count for role 3"; "Remove role 3" removes it), `:850` (POST body
  `{name, specialty, foreman, laborMix[]}`), `:907` (dialog "Edit Crew" + prefills + enabled "Save
  Crew"), `:921` (Cancel issues no PATCH), `tests/index-pages.test.tsx:236` (dialog name, labels,
  "Save Crew", PATCH shape). **All pass unchanged** — every label, `aria-label`, heading string and
  button name is preserved and no query is class-based.

---

## Delete crew confirm dialog (`.pdx-confirm`)

- **Today / Becomes:** identical treatment to the Delete-project confirm — `.pdx-confirm` width,
  title family to Inter, `.pdx-summary` / `.pdx-note` to r12, the one red pill untouched.
- **Every information item placed:** **1** eyebrow "Confirm delete" + dot; **2** title "Delete
  <em>crew</em>"; **3** "This removes the crew and its schedule assignments."; **4** the summary tile
  (specialty over bold name); **5** the note `"Foreman <lead>, <size> workers."`. All five verbatim.
- **Every action placed:** **1** the X ("Close Delete Crew"); **2** Cancel; **3** the danger confirm
  (`aria-label "Confirm delete <name>"`, "Delete Crew" → "Deleting Crew", DELETE → `reload()`, and the
  delete cascades to assignments); **4** Escape + trap — **and, per the record's correction 4, initial
  focus lands on the close X here**, because this dialog has no `.pdx-form`. Preserved.
- **States:** *loading* — "Deleting Crew" + disabled. *error* — `role="alert"` with "Crew could not be
  deleted.". No empty state; no lock.
- **Motion:** the shared `pdx-*` stack; invert on Cancel; lift on the danger pill. No reveal.
- **Tests touched:** `tests/index-pages.test.tsx:299` — dialog name `/^Delete crew/`, button "Confirm
  delete Concrete Crew 1", the DELETE, then "No crews added yet". **Passes unchanged.**

---

## CrewStatusLegend (shared footer)

- **Today:** `.crew-legend-footer` / `.crew-status-legend` below the Crews index card — a flex row at
  15px/750 `#728199` with five 13px round dots.
- **Becomes:** a dissolved footer row on the ground: labels at `--bf-app-meta` 12px `#575550`, dots
  13px → **10px** at 50%, `gap: 16px` kept, `aria-label="Crew statuses"` kept. It reads as a key, not
  a card — which is what it is.
- **Every information item placed:** **1** `aria-label "Crew statuses"`; **2** Available `#10b981`;
  **3** On Job `#0b4df5`; **4** Overbooked `#ff3045`; **5** In Progress `#3478f6`; **6** Unavailable
  `#94a3b8`. All six kept, **including the two statuses `Crew["status"]` cannot hold** (In Progress,
  Unavailable) — `App.test.tsx:745-751` asserts all five labels, so trimming the legend needs a test
  edit and is proposal **R12**. The five hexes are also the cluster's one un-tokenised colour set
  (`#0b4df5`, `#ff3045`, `#3478f6` are not `--wx-*` values); re-basing them onto
  `--wx-blue`/`--wx-red`/`--hsx-*` is **R13**, listed because it changes five rendered colours.
- **Every action placed:** **1** none — presentational. No hover state added.
- **States:** *empty* — it always renders, even with zero crews. Preserved.
- **Motion:** none today; none added, except that it is the third reveal target on the Crews page
  (`--i: 2` → 100ms), and it has a static className so that is safe.
- **Tests touched:** `App.test.tsx:745-751` — all five labels inside the "Crew statuses" region.
  **Passes unchanged** as long as the five strings and the `aria-label` survive.

---

## Equipment page frame + fleet figure row + utilization footnote

- **Today:** the same `-rx` frame, but with **pointer-parallax** auroras
  (`translate(calc(var(--px) * 16px), calc(var(--py) * 12px))` etc., `will-change: transform`) and a
  **live** 480px `.dx-cursor` radial follower — materially more motion than Crews. Four bordered KPI
  tiles, no rail, and a plain-text footnote below the card.
- **Becomes:** frame unchanged, `gap → 27px`, `.hs-index-main` capped at 1140px, the four tiles →
  **`FigureRow`**. The footnote becomes a `--bf-app-meta` 12px `#575550` line with its `<strong>` at
  13px/600 `#1c1c1a` — the same species as a figure note, sitting in the 81px tail. `DocHeader`
  eyebrow: **"EQUIPMENT · RESOURCES"**.
- **Every information item placed:** **1** "Total Equipment" (blue `Wrench`); **2** "Available Now"
  (green `CheckCircle2`); **3** "In Use" (violet `Truck`); **4** "Maintenance" (`AlertTriangle`
  **whose tone flips red when > 0 and green when 0** — a conditional tone that must survive the
  component, so `FigureRow`'s `tone` is a per-item prop, not derived); **19** the footnote
  `"Fleet utilization: <n>% currently assigned or in use."` → all placed. Plus
  **`missingInformation` 3–4**: the parallax transforms, the `will-change`, the 480px follower and the
  `transform: none !important` reduced-motion reset at `equipment-redesign.css:845` → **all
  preserved**; this page and Materials are the cluster's paint hotspots and that is exactly what
  proposal **R1** is about. **`missingInformation` 16**: the footnote reads
  `"Fleet utilization: 0% …"` on an empty fleet — its own empty state, preserved.
- **Every action placed:** reached from the Resources flyout — **and the flyout's Resources icon
  lands on Equipment only when the add-on is unlocked, otherwise on Materials**
  (`hub.pages.find(p => !lockedAddOnForPage(p))`, `missingInformation` 20) → preserved.
- **States:** *add-on lock* — **the whole page is replaced by the AddOnPrompt** when
  `equipment-tracking` is not owned (its own entry below). *empty / loading / error* — as the index.
- **Motion:** one reveal (`.hs-kpis`, `--i: 0`); the footnote is reveal target 3 (`--i: 2`). No lift,
  no invert, no slide at this level.
- **Tests touched:** `tests/index-pages.test.tsx:338` asserts the text "Total Equipment" — survives in
  `FigureRow`. **Passes unchanged.** `:21-23` (`equipmentUnlockedFixture` seeding
  `selectedProducts: ["equipment-tracking"]`) is unaffected.

---

## Equipment index document

- **Today:** the `hs-index` template with 9 columns, four saved views, three quick filters, and the
  only **two-action** row cell in the cluster (`.hs-cell-actions.two`, 80px: pencil + trash).
- **Becomes:** identical treatment — dissolved card, `DocHeader` (with
  `data-tutorial-id="equipment-page-title"` on the `h1`, the anchor for the Equipment Tracking
  tutorial lesson), `SegmentedPills`, pill toolbar, `ScrollEdge` stage at r18. The 9-column table
  fits inside the 1140px measure and does **not** take the bleed.
- **Every information item placed:** **5** the title + chevron + tutorial id; **6** the four view tabs
  (All equipment / Available / In use / Maintenance) with counts and icons; **7** the Filter chip with
  its 3-filter count; **8** the Sort chip (`name | status | type | project | usage`); **9** the
  `"<filtered> of <total>"` counter; **10** the row `Wrench` avatar + blue name link + type sub-line;
  **11** the status badge (Available green / In Use blue / Maintenance red, each with its `::before`
  dot); **12** the utilization bar + `%` from `equipmentUsageProgress()` — **the hard-coded 78 / 38 /
  12 derivation is preserved verbatim**, and this is the strongest reason the meters do **not** get
  more prominence in the redesign (crossCutting 4: "a redesign that leans harder on these meters will
  be amplifying fake precision"); **13** "Assigned to" (project name or "Unassigned"); **14** "Current
  job" via `activeJobForProject()` — and per the record's **correction 2** the fallback is *any* job on
  the project including a Complete one, so "Ready for assignment" appears only when unassigned or the
  project has no jobs; **15** the readiness phrase ("Service required" / "Committed today" / "Dispatch
  ready"); **16** the Type column repeating `equipment.type`; **17** the footer count pill + selected;
  **18** the per-page label. Plus **`missingInformation` 10** (`aria-label="Row actions"` on the
  `.hs-cell-actions.two` `<th>`), **12** (`aria-labelledby="equipment-dialog-title"` /
  `"equipment-remove-dialog-title"` with **no** `aria-describedby`, so the sub-copy is not announced →
  preserved as-is; wiring it is **R14**), **13** (`.is-selected` also while that record's edit dialog
  is open), and **19** (`.hs-index-title .hs-page-tag` is dead here because no `PageReleaseTag`
  renders) → all placed.
- **Every action placed:** **1** chevron; **2** "Add Equipment"; **3** the four tabs; **4** the search
  across name/type/status/project/job; **5** the Filter chip; **6** the Sort chip →
  `toggleEquipmentSort("status")`; **7–9** the three quick filters (status; type; **project, whose
  option list is "Assigned project" / "Unassigned" (empty value) / one per project**); **10** the
  Advanced/Clear link; **11** the five sortable headers (Name, Status, Utilization as `usage`,
  Assigned to as `project`, Type); **12** select-all + per-row select; **13** the row name link
  `"Edit <name>"`; **14** the **pencil** row action, also `"Edit <name>"` —
  **`tests/index-pages.test.tsx:352` disambiguates the duplicate accessible name with
  `getAllByRole(...)[0]`, so neither label may change and the two controls must stay in DOM order**
  (risk 8); **15** the trash `"Remove <name>"`; **16** pagination + per-page; **17** "Export" →
  `exportEquipmentCsv()`, 7-column header, `buildflow-equipment.csv`. All seventeen unchanged. Both
  row actions keep `@media (hover: none) { opacity: 1 }` and gain `tr:focus-within`
  (`missingStatesOrMotion` 2: on touch this page shows **two** always-visible row controls, Crews one,
  Materials none — preserved).
- **States:** *empty* — **1** "No equipment added yet" / "Add vehicles and equipment before tracking
  field activity."; **2** "No equipment matches that search" / "Try a machine, type, status, project,
  or current job."; **3** the project filter still lists every project while the type filter collapses;
  **4** the add-on prompt replacing the page. *loading* — the three pending labels. *error* — the two
  `role="alert"` messages.
- **Motion:** invert on ~17 pills; slide on `.hs-qf-link`; no lift; no tilt; row hover and the two
  reveals of the row actions at 0.18s. One reveal: `.hs-index-card`, `--i: 1`.
- **Tests touched:** `tests/index-pages.test.tsx:338` (text "Total Equipment", enabled "Add
  Equipment", tablist "Equipment views" with "All equipment" `aria-selected`, a row containing "In
  Use" and the project name, button "Remove Concrete Pump #2", the Maintenance tab and the search both
  landing on "No equipment matches that search", label "Search equipment") **passes unchanged**;
  `:370` and `:419` reach the dialogs (below); `App.test.tsx:243` ("Equipment Tracking lesson")
  depends on `data-tutorial-id="equipment-page-title"` — **passes unchanged provided `DocHeader` keeps
  the id on the `h1`**.

---

## Equipment add/edit dialog

- **Today:** the plain `.crew-dialog` shell (z-index 30, navy no-blur scrim, r10, navy shadow),
  re-skinned per page by `.equip-rx .crew-dialog` (r`--wx-radius` 20px, `--wx-card`, 1px
  `--wx-line-soft`, `0 40px 90px rgba(28,28,26,0.28)`), with an `h2` in **Palatino** at 24px, an ink
  pill primary, a line-pill Cancel, and **no entrance animation, no focus trap, no Escape**.
- **Becomes:** the `.pdx` opt-in (§2): `pdx` on the backdrop, `pdx-dialog pdx-equip` on the shell.
  Scrim → ink + `blur(6px)`; **z-index 30 → 80**, which stops the Ask-AI FAB covering the "Save
  Equipment" footer; shell r20 → **r26** with `--bf-shadow-stage`; it gains `pdx-backdrop-in`,
  `pdx-dialog-in` and (via the one extended selector) the `pdx-field-in` label stagger — and with them
  its first `prefers-reduced-motion` coverage, because the existing block nulls those keyframes **by
  name**. `h2` → `clamp(28px,3.4vw,42px)`, **Inter**, with the trailing word wrapped in the same `em`
  as the `.pdx` dialogs so the display rung and the gradient role are consistent across all nine
  dialogs in the cluster. Buttons: ink pill primary and inverting line-pill Cancel, both already in
  place; `#fffdf9` cream on `.outline-button` → `transparent` (one ground).
- **Every information item placed:** **1** the title "Add Equipment" / "Edit Equipment"; **2–3** both
  sub-copies; **4** the live "Assignment" preview tile
  (`.crew-size-preview.equipment-assignment-preview`) showing the selected project name or
  "Unassigned" → r12, label as the ×1 eyebrow, value `--bf-app-row-strong`.
- **Every action placed:** **1** the X ("Close Add Equipment" / "Close Edit Equipment"); **2** Cancel;
  **3** submit (`Plus` on add / `Pencil` on edit, four labels, disabled until name and type are
  non-empty, POST/PATCH → `reload()` → close). All three unchanged.
- **Every form input placed:** the four — Equipment Name (`"Example: Boom Lift #5"`), Equipment Type
  (`"Example: Lift"`), Status (**`<option>`s with no `value` attribute** — Available / In Use /
  Maintenance; the label is the payload, frozen), Assigned Project ("Unassigned" with an empty value
  plus one option per project).
- **States:** *empty* — the project select shows only "Unassigned" with no projects. *loading* —
  "Adding Equipment" / "Saving Equipment" + disabled. *error* — `role="alert"` "Equipment could not be
  saved.". *add-on lock* — unreachable while locked, since the page is.
- **Motion:** gains the three `pdx-*` entrances; keeps its `.primary-button` / `.outline-button` /
  `.icon-button` hover transitions. **Invert** on Cancel; **lift** on the primary. No reveal. The
  missing focus trap / Escape is **R8**.
- **Tests touched:** `tests/index-pages.test.tsx:370` (dialog "Add Equipment"; labels "Equipment Name"
  / "Equipment Type" / "Status" / "Assigned Project"; POST body `{name,type,status,assignedTo}`)
  **passes unchanged**; `:419` (dialog "Edit Equipment", button "Save Equipment", PATCH body)
  **unchanged**.

---

## Remove Equipment confirm dialog

- **Today:** the same plain `.crew-dialog` shell with a summary tile, a status note and a red primary.
- **Becomes:** the same `.pdx` opt-in; `.equipment-remove-summary` and the `.form-note` to r12 +
  `--wx-line-soft`; the confirm becomes the cluster's shared danger pill species
  (`.primary-button.danger-button` already resolves to `var(--wx-red)` under `.equip-rx`, so this is a
  re-tone to `#c5221f` + the `.pdx-danger` hover, not a new colour).
- **Every information item placed:** **1** the title "Remove Equipment"; **2** "This removes the
  equipment from fleet tracking and dashboards."; **3** the summary tile (type over bold name);
  **4** the note `"Assigned to <project|Unassigned> with status <status>."`. All four verbatim.
- **Every action placed:** **1** the X ("Close Remove Equipment"); **2** Cancel; **3** "Remove
  Equipment" → "Removing Equipment" → DELETE → `reload()`. Note `missingActions` 9: the confirm button
  has **no per-item accessible name** — it is just "Remove Equipment", identical to the dialog's own
  `h2`, while the row action that opens it is "Remove <name>"; `tests/index-pages.test.tsx:419`
  resolves the collision with `within(dialog)`. **Frozen as-is** — giving it an `aria-label` would be
  an improvement that breaks that query (**R15**).
- **States:** *loading* — "Removing Equipment" + disabled. *error* — `role="alert"` "Equipment could
  not be removed.".
- **Motion:** gains the `pdx-*` entrances and reduced-motion coverage; invert on Cancel; lift on the
  danger pill.
- **Tests touched:** `tests/index-pages.test.tsx:419` — dialog "Remove Equipment", button "Remove
  Equipment", the DELETE. **Passes unchanged.**

---

## "Get Equipment Tracking" — the AddOnPrompt (the screen shown *instead of* Equipment)

- **Today:** portalled to `<body>` as `.hs-upd-backdrop > .hs-upd-dialog.hs-addon-dialog` — the same
  base as the "What's new" modal. An art tile with the `Wrench` program icon at 38px and a
  `CircleArrowUp` badge in `tone-teal`, an eyebrow, an `h2`, a two-part description, and a "Where to
  get it" panel.
- **Becomes:** per preserve §5f the shared base is **split first** (`.hs-upd-dialog` +
  a `.hs-addon-dialog` override) so restyling one does not restyle the other; then r → **26px** (the
  stage rung — this and the release modal are the two biggest objects in the app),
  `--bf-shadow-stage`, body copy capped at `--bf-app-prose` 62ch, `h2` at the display rung
  `clamp(28px,3.4vw,42px)` in Inter, eyebrow at ×1, the art tile's `tone-teal` **kept** (it is the
  program's identity from `programRegistry`, not chrome), and the two buttons onto the pill species
  (blue primary "Purchase in Billing", inverting line pill "Not now").
- **Every information item placed:** the art tile + `Wrench` 38px + `CircleArrowUp` badge +
  `tone-teal`; the eyebrow `"Add-on · $9 per user / month"` from `ADD_ON_CATALOG`; `h2 "Get Equipment
  Tracking"` with `id="hs-addon-title"`; the description = `program.description` ("See equipment
  assignment, usage, and maintenance status.") + `catalog.pitch` ("Assignment, utilization, and
  maintenance status for every machine in the fleet.") with `id="hs-addon-desc"`; the "Where to get
  it" panel with its `CreditCard` icon and the full string `"Settings → Billing → Add-ons: add
  Equipment Tracking to your <plan> plan for $9 per user / month. It comes included with the Business
  and Enterprise plans."`, **including its degradation to "your plan" when `selectedPlanId` is `""``**.
  All verbatim.
- **Every action placed:** the X with `aria-label` exactly **"Close"**; "Purchase in Billing"
  (`ShoppingCart`) → `openSettingsBilling("equipment-tracking")`, which sets
  `settingsInitialView="billing"` + `settingsFocusAddOn` and navigates to Settings (and closing
  Settings returns to `settingsReturnPage`); "Not now" → close; Escape + focus trap + focus return via
  `useModalDialog(dialogRef, onClose, true)`. All unchanged.
- **States:** this **is** a state of the Equipment page. It is also reachable from the ⌘K palette,
  because palette navigation goes through `openAppPage()` and re-applies the lock.
- **Motion:** it keeps whatever `.hs-upd-*` entrance the shell gives it (shell-owned); invert on "Not
  now"; no reveal.
- **Tests touched:** `tests/map.test.tsx:103` is the equivalent assertion for the Map add-on
  ("Get Map & Field Ops") and proves the pattern — a locked row must **prompt, not navigate**. No test
  covers the Equipment prompt directly, so it is one of this cluster's **uncovered surfaces**
  (manual walkthrough required, and the reason editorial's added `tests/shell-nav.test.tsx` guard is
  worth having).

---

## Materials page frame + readiness figure row

- **Today:** the same `-rx` frame with pointer-parallax auroras and a live `.dx-cursor`, four
  bordered KPI tiles, no rail, no footnote.
- **Becomes:** frame unchanged, `gap → 27px`, measure 1140px, the four tiles → **`FigureRow`**.
  `DocHeader` eyebrow: **"MATERIALS · RESOURCES"**.
- **Every information item placed:** **1** "Total Materials" (blue `Boxes`); **2** "Ready Now" (green
  `CheckCircle2`); **3** "Ordered" (violet `Truck`); **4** "Needs Attention" = Missing **or** Waiting
  on Delivery, `AlertTriangle` toned red when > 0 else green (again a conditional tone, so a per-item
  prop). Plus `missingInformation` 3–4 (the parallax + the 480px follower) preserved.
- **Every action placed:** reached from the Resources flyout — **and it is where the Resources rail
  icon lands whenever the Equipment add-on is locked** (`missingInformation` 20). Preserved.
- **States:** *empty* — figures read 0. *loading / error* — none local. *add-on lock* — none
  (Materials is not gated).
- **Motion:** one reveal (`.hs-kpis`, `--i: 0`). No lift/invert/slide/tilt at this level.
- **Tests touched:** `tests/index-pages.test.tsx:474` asserts "Total Materials" **and** "Ready Now" —
  both survive in `FigureRow`. **Passes unchanged.**

---

## Materials index document

- **Today:** the `hs-index` template with 9 columns, **five** saved views, two quick filters, a default
  sort key of `delivery` (not `name`), and **no row actions at all** — the API is create-only.
- **Becomes:** identical treatment — dissolved card, `DocHeader` with
  `data-tutorial-id="materials-page-title"` on the `h1` (the v3.4 "What's new" spotlight anchors to
  it), `SegmentedPills` with five pills, pill toolbar, `ScrollEdge` stage at r18. No actions column is
  invented.
- **Every information item placed:** **5** the title + chevron + tutorial id; **6** the five view tabs
  (All materials / Ready / Ordered / Waiting on delivery / Missing) with counts and their `Boxes` /
  `CheckCircle2` / `Truck` / `CalendarDays` / `AlertTriangle` icons; **7** the Filter chip with its
  2-filter count; **8** the Sort chip (`name | status | delivery | project | readiness`) —
  **and its `.active` class is tested against the page default `delivery`, so at rest it reads "Sort
  by delivery" in the inactive style, unlike the other three pages** (correction 7): preserved;
  **9** the counter; **10** the `Boxes` avatar tinted by status tone + `material.name` as **plain bold
  text, not a link** + the project name as the sub-line → `.hs-name` 13.5px/600 `#1c1c1a` (the one
  index in the cluster whose record name is not an affordance — preserved, because there is no edit
  endpoint to link to); **11** the status badge (Ready green / Ordered blue / Waiting amber / Missing
  red, each with its dot); **12** the readiness bar + `%` from `materialReadinessProgress()` —
  **the hard-coded 100 / 68 / 42 / 12 preserved**, and the same "do not amplify fake precision"
  restraint applies; **13** the delivery date through `formatDate()`, **with the literal `"Pending"`
  passing through unchanged**; **14** the free-text quantity in `.hs-cell-num` (tabular); **15** the
  project name or "Unassigned"; **16** the Job cell via `jobForMaterial()` — per **correction 1** the
  fallback is the project's **first** job, so "Project stock" appears only when the project has no
  jobs at all; **17** the schedule-impact phrase ("Ready for schedule" / "Procurement tracking" /
  "Watch delivery window" / "Blocks affected work"); **18** the footer count pill + selected;
  **19** the per-page label. Plus **`missingInformation` 15**: a material with an empty `deliveryDate`
  renders `"Invalid Date"` in this cell — **preserved as-is** and flagged **Q8**, because fixing it is
  logic; **correction 5**: the Ordered avatar's "untoned default" *is* the blue tone — do not add a
  rule; **`missingInformation` 10**: this table has **no actions `<th>`**, which is the structural
  reason it is 9 columns.
- **Every action placed:** **1** chevron; **2** "Add Material"; **3** the five tabs; **4** the search
  across name/status/quantity/**raw ISO** deliveryDate/project/job; **5** the Filter chip; **6** the
  Sort chip → `toggleMaterialSort("delivery")`; **7** the status quick filter (4
  `materialStatusOptions`); **8** the project quick filter; **9** the Advanced/Clear link; **10** the
  five sortable headers (Name, Status, Readiness, Delivery date, Project); **11** select-all + per-row
  select — **and the per-row checkbox is the only addressable control on a materials row**, which is
  how `tests/index-pages.test.tsx:487` finds rows
  (`getByRole("checkbox", {name: "Select Ready Mix Concrete"})`), so it may not be removed or
  relabelled (risk 9); **12** pagination + per-page; **13** "Export" → `exportMaterialsCsv()`,
  8-column header, `buildflow-materials.csv`; **14** "NO row edit and NO row delete" → **preserved as
  an absence**: no pencil, no trash, no actions column, and `@media (hover: none)` has nothing to
  reveal here. All fourteen placed. Also risk 10: delivery dates are **sorted and searched on the raw
  ISO string** while displayed through `formatDate()` — a redesign must not format earlier in the
  pipeline or it silently changes both sort order and search hits.
- **States:** *empty* — **1** "No materials added yet" / "Create a project, then add the materials
  needed for that work."; **2** "No materials match that search" / "Try a material, project, status,
  quantity, delivery date, or job."; **3** the dialog's project select falling back to "Create a
  project first". *loading* — "Adding Material". *error* — `role="alert"` "Material could not be
  created.".
- **Motion:** invert on ~15 pills; slide on `.hs-qf-link`; no lift; no tilt; row hover 0.18s. One
  reveal: `.hs-index-card`, `--i: 1`. This is the only page in the cluster where the hover-reveal
  layer has nothing to reveal.
- **Tests touched:** `tests/index-pages.test.tsx:474` (text "Total Materials" and "Ready Now", enabled
  "Add Material", tablist "Material views" with "All materials" `aria-selected`, the row found via
  `checkbox "Select Ready Mix Concrete"` containing "Ready Mix Concrete", "Ready" and "120 yd3", the
  Ordered tab → "No materials match that search", labels "Search materials" and "Filter materials by
  status") — **passes unchanged**.

---

## Add Material dialog

- **Today:** the plain `.crew-dialog` shell re-skinned by `.mat-rx`, `h2` in **Palatino** at 24px, a
  trade-aware quantity placeholder, no entrance animation, no focus trap, no Escape.
- **Becomes:** the `.pdx` opt-in — ink + blur scrim, **z-index 80** (so the FAB stops covering the
  "Add Material" footer), r26, `--bf-shadow-stage`, the three `pdx-*` entrances and their existing
  reduced-motion coverage; `h2` → the display rung in Inter with the `em` on the trailing word; the
  ink pill primary and the inverting line-pill Cancel kept, cream → transparent.
- **Every information item placed:** **1** the title "Add Material"; **2** "Create a material record
  with project, status, delivery date, and quantity."; **3** the trade-aware placeholder
  `"Example: 420 <tradeProfile.materialUnits[0]>"` and **every one of its twelve units** (tons /
  cy / squares / units / lf / studs / ft / lbs / block / sheets / plants / gal) plus the
  `"Example: 24 bundles"` fallback when no business type is stored. All three verbatim.
- **Every action placed:** **1** the X ("Close Add Material") + form reset; **2** Cancel; **3** submit
  ("Add Material" → "Adding Material", disabled until name, projectId, deliveryDate and quantity are
  all non-empty, POST → `reload()` → close).
- **Every form input placed:** the five — Material Name (`"Example: Structural Steel Beams"`), Project
  (defaults to `data.projects[0]?.id`, shows "Create a project first" when empty), Status (the 4
  options, default "Ordered"), Delivery Date (`<input type="date">`), Quantity (free text with the
  trade placeholder).
- **States:** *empty* — the "Create a project first" option, which blocks submit because `projectId`
  stays `""`. *loading* — "Adding Material" + disabled. *error* — `role="alert"` "Material could not be
  created.". No validation of any kind exists; preserved (**R11**).
- **Motion:** gains the `pdx-*` entrances; invert on Cancel; lift on the primary; no reveal.
- **Tests touched:** `App.test.tsx:762` (dialog "Add Material" with labels "Material Name" / "Project"
  / "Status" / "Delivery Date" / "Quantity") **passes unchanged**; `:777` (POST body
  `{projectId, name, status:"Ordered", deliveryDate, quantity}`) **unchanged**.

---

## ResourceRow (shared list-row primitive)

- **Today:** `App.tsx:27017` — a `.resource-row` of icon (22px) + `<strong>` title + `<em>` detail +
  `<Badge status>`. Every call site is **outside** these four pages.
- **Becomes:** re-toned in place, not restructured, because two of its three call sites belong to
  other clusters: row rule 1px `--wx-line-soft` instead of a boundary, title
  `--bf-app-row-strong` 13.5px/600 `#1c1c1a`, detail `--bf-app-meta` 12px `#575550` (`font-style`
  kept), icon 22px `#8a877e`, badge unchanged. Coordinate with the dashboard and DelayIQ clusters —
  **this is the one component in this record whose owner is elsewhere.**
- **Every information item placed:** **1** the four props (icon 22px, `<strong>` title, `<em>` detail,
  badge); **2** call site 1 — the Dashboard "conflicts" panel: `Wrench`, `equipment.name`,
  `"<type> assigned"`, `equipment.status`, first 3 non-Available machines, plus a "View all" link to
  the Equipment page; **3** call site 2 — the Dashboard "inspections" panel: `CalendarDays`,
  `inspection.title`, project name, `inspection.status`, first 4; **4** call site 3 — the DelayIQs
  "DelayIQ Categories" panel: `AlertTriangle`, each trade-profile category, "Tracked impact category",
  badge "Monitor". All four recorded and unchanged.
- **Every action placed:** **1** none of its own; the Dashboard conflicts panel's "View all equipment"
  button navigates to the Equipment page — **and, because `setPage()` re-applies the lock, a user
  without the add-on lands on the AddOnPrompt from there too.** Preserved.
- **States:** the two `InlineEmptyState`s ("No equipment conflicts yet" / "Equipment assignments will
  appear after assets are added."; "No inspections scheduled yet" / "Inspection dates will appear
  after projects are created.") → kept, and they are the licence-1 dashed frame species: 1px dashed
  `var(--wx-line)`, r18, transparent (dropping the `#f6f7fe` fill), which is the same treatment
  `.hs-empty` gets here.
- **Motion:** none of its own; none added.
- **Tests touched:** none in this record.

---

## Cluster entry points (rail flyout rows, ⌘K, bookmark star, tutorial spotlights, release modal)

These five surfaces are shell-owned but carry **cluster-specific content**, and the record's
completeness block is right that a mapping which ignores them loses the only navigation path these
pages have — there is no URL hash for any of them.

- **Today / Becomes:** the flyout is re-skinned by the shell concept (white, r18, `--bf-shadow-float`,
  head → ×1 eyebrow, item 13.5px/500, hover wash + `translateX(3px)`, active
  `rgba(47,107,255,0.08)` + `#2f6bff`). This cluster's obligations inside it:
- **Every information item placed:** the hub heads "Operations" (Projects, Crews) and "Resources"
  (Equipment, Materials); the four rows with their `navItems` icons and labels (Projects/`Building2`,
  Crews/`Users`, Equipment/`Wrench`, Materials/`Boxes`); `class="active"` on the current page;
  `class="recommended"` + its 6px dot — **which highlights Crews when Time Cards is selected and
  Equipment when either Equipment Tracking or Map & Field Ops is selected**, and whose
  `0 0 0 2px #14203a` ring must re-base to `0 0 0 2px #f5f6fa` or it draws a navy halo on paper;
  `class="locked"` + the `CircleArrowUp` `.hs-flyout-upgrade` glyph on Equipment; the
  `.hs-flyout-tip role="tooltip"` bubble `id="hs-addon-tip-equipment"` (referenced by
  `aria-describedby`) with its exact copy `**Equipment Tracking add-on**` + "This program is part of
  the Equipment Tracking add-on — $9 per user / month, or included with the Business and Enterprise
  plans. Choose it to see where to get it."; the empty `.hs-flyout-tag` slot on all four rows; and
  `data-tutorial-id="nav-projects" | "nav-crews" | "nav-equipment" | "nav-materials"`. All kept. The
  tip becomes the **ink pill** (`#1c1c1a` / `#fdfcf9`, r12, `0 8px 22px rgba(28,28,26,0.2)`, body
  capped at 62ch), width 244px and its `::before` arrow frozen.
- **Every action placed:** clicking a row → `setPage`, **except the locked Equipment row, which calls
  `onRequestAddOn("equipment-tracking")` and opens the prompt instead of navigating**; the per-row
  `.hs-flyout-star` (`aria-pressed`, `aria-label "Bookmark <page>"` / `"Remove <page> from
  bookmarks"`, `title "Bookmark for quick access"` / `"Remove bookmark"`, `stopPropagation` so it does
  not navigate) — **pinned to `opacity: 0.55` below 1024px** per the editorial graft, because today it
  is doubly unreachable on touch (inside a surface that cannot open, revealed by an event that cannot
  fire); the flyout opening on `onMouseEnter` **and** `onFocus`, closing on the 140ms timer; ⌘K /
  Ctrl+K → the palette's "Pages" group → `openAppPage("projects"|"crews"|"equipment"|"materials")`,
  **which re-applies the add-on lock**; the top-bar star menu's rows for these pages (nav icon, label,
  right-aligned `<em class="hs-bookmark-hub">` reading "Operations" or "Resources", `is-current`, the
  per-row `×` "Remove <label> from bookmarks", the footer "Bookmark Crews" / "Remove Crews" while you
  are on the page, and the empty copy "No bookmarks yet. Hover a category in the sidebar and star a
  page to keep it here."); the locked-page tooltip firing on `:focus-within` as well as `:hover`. All
  preserved.
- **The tutorial and release content that renders over these pages** (both are information a redesign
  must not disturb): the "Create a crew" step ("Open Add Crew. Use a sample like Tutorial Crew 1,
  Training, Jordan Lee, then set the labor and operator mix.", target `crew-add-button`, requirement
  "Open the Add Crew form to continue.", validated by `targetExists("crew-dialog")`); "Save the new
  crew" ("Complete the crew form and submit it. BuildFlow will save the crew as a real demo workspace
  record.", target `crew-dialog`, requirement "Create a crew to unlock the next step."); the
  "Equipment Tracking lesson" ("Equipment shows fleet availability, current assignments, maintenance,
  and assets already committed to work.", target `equipment-page-title`, present only when the add-on
  is selected); and the v3.3 (crews) / v3.4 (materials) `UPDATE_ENTRIES` release modals with their
  spotlights on `crews-page-title` / `materials-page-title`, their titles, descriptions, Improvements
  and Fixes lists, `dateLabel`s and creator line. **The spotlight rect is recomputed on resize and on
  capture-phase scroll from the anchor's box, so every one of these five ids must keep its element,
  its position and a stable box** — which is why `DocHeader` renders the `h1` itself rather than
  wrapping it, and why no new `transform`, `filter`, `contain` or `will-change` may be added to any
  ancestor of a `data-tutorial-id` element on these pages (the `-rx` frame's existing
  `isolation: isolate` is already there and is not a containing block for `position: fixed`).
  Note the v3.4 copy promises Materials features that do not exist (delivery windows against dependent
  jobs, low-stock flags, supplier notes) — **not** something this redesign is asked to build.
- **States / Motion / Tests:** shell-owned. The tests that reach this cluster through it are
  `appHarness.openAppPage()` (rail hub matched `^<Hub>( \(.*\))?$`, then a flyout `menuitem` by
  label) — used by every index-pages test — and `tests/tutorial.test.tsx:155`. **Both pass unchanged
  only if `onMouseEnter` stays on `.hs-rail-slot` and the sub-items keep `role="menuitem"`.** Paste
  the editorial invariant comment above the rail slot verbatim.

---

## Materials Readiness marketing product page (`#materials-readiness`)

- **Today:** a Welcome-Page surface already — `.cs-page` chassis, teal identity, rotating hero
  headline, a `MatRing` SVG gauge, `mat-*` rows and bars, a 5-day delivery timeline, a why-band and
  the shared `wx-footer`. It is a `.welcome-rx` scope, not an app scope.
- **Becomes:** **no layout change.** Two token edits only, both consequences of decision #2: the
  `.welcome-rx` accent `--wx-blue #1a73e8 → #2f6bff`, and the focus ring
  `0 0 0 4px rgba(26,115,232,0.12) → rgba(47,107,255,0.12)`. The teal identity, the 108px section
  beats, the display type, `WxTilt`, `WxMagnetic` and `WxRotatingHeadline` all stay: this page is the
  **reference**, not the target.
- **Every information item placed:** all fourteen unchanged — **1** the eyebrow + teal `.wx-dot`;
  **2** the rotating H1 (prefix "Every material, " + the six `materialsPhrases`); **3** the hero sub;
  **4** the mock bar title + the `MatRing` at 68% with its "68% / Ready" label; **5** the three mini
  stats (18 Ready now / 5 Ordered / 3 Attention); **6** the three hero board rows (Structural Steel
  Beams / Rebar #5 · 12 tons / HVAC Rooftop Units with their phrases, badges and percentages);
  **7** the explore band's eyebrow, H2 and sub; **8** the "Delivery schedule · this week" timeline
  (Mon Steel Delivered, Tue empty, Wed Rebar In transit, Thu Concrete Delivered, Fri HVAC DelayIQed)
  + its H3; **9** the "Materials · by status" mock (tab strip + four rows) + H3; **10** the
  "Readiness gate" mock (three rows) + H3; **11** the vendor-notes mock (Vendor / Purchase order /
  Delivery window / Note) + H3; **12** the "Ready to schedule" mock (three rows with percentages) +
  H3; **13** the why-band (eyebrow, H2, three icon cards with `PackageCheck` / `Boxes` /
  `CalendarDays`); **14** the shared footer with its tagline, three link columns, the animated
  wordmark and the four bottom links.
- **Every action placed:** all four unchanged — **1** "Get BuildFlow" (`WxMagnetic`, `ArrowRight`) →
  `onGetStarted`; **2** "See it live" (`PlayCircle`) → `onOpenMaterials`, which jumps into the in-app
  Materials page; **3** "Back to home" → `onBack`; **4** the footer hash links.
- **States:** the only "empty" element is Tuesday's dashed `.mat-slot-empty` placeholder — kept, and
  it is the same dashed-absence species this plan uses in-app, which is a nice confirmation the
  licence is the source's own idea.
- **Motion:** all nine kept — the pointer parallax + `.wx-cursor`, the local IO reveal (threshold
  0.14, rootMargin `-6%`), the `MatRing`'s 1.3s `stroke-dashoffset`, the `.mat-fill` 1.1s widths,
  `mat-nudge` 1.8s on the in-transit `Truck`, `WxTilt` (max 6 / restRx 3 / restRy −9), `WxMagnetic`,
  `WxRotatingHeadline`, the `--i` stagger, and the reduced-motion block at
  `materials-readiness-redesign.css:342-347`. **Tilt lives here and only here** in this cluster.
  Note its IO threshold is 0.14, not the 0.16 the app is being corrected to — it is a **local**
  observer in the page component, outside `useHudMotion`; leave it (**Q9**).
- **Tests touched:** none directly; `tests/landing-menus.test.tsx` covers the Product menu that links
  here. **Passes unchanged.**

---

## Equipment Tracking marketing product page (`#equipment-tracking`)

- **Today:** the same `.cs-page` chassis with an amber identity, a stacked `eq-mix` fleet bar and
  `eq-*` rows.
- **Becomes:** the same two token edits, no layout change.
- **Every information item placed:** all fifteen unchanged — **1** the eyebrow + amber `.wx-dot`;
  **2** the rotating H1 (prefix "The whole fleet, " + the six `equipmentPhrases`); **3** the sub;
  **4** the mock bar "Fleet status" + "67% utilized" / "6 machines"; **5** the three `eq-mix` segments
  (In Use 67 / Available 17 / Maintenance 16); **6** the legend ("In use · 4" amber, "Available · 1"
  green, "Maintenance · 1" rose); **7** the three hero rows (Tower Crane #2 / Excavator 320 / Utility
  Truck #8 with their phrases, badges and percentages); **8** the explore band; **9** the five-row
  "Fleet board · today" + H3; **10** the "Equipment · by status" mock + H3; **11** the "Assignments"
  mock + H3; **12** the "Maintenance" mock + H3; **13** the "Committed to the schedule" mock + H3;
  **14** the why-band with `Wrench` / `Gauge` / `ShieldAlert`; **15** the shared footer.
- **Every action placed:** all four — **1** "Get BuildFlow" → `onGetStarted`; **2** "See it live" →
  `onOpenEquipment`, **which lands on the AddOnPrompt rather than the page for a user without the
  add-on** (a real flow, already the case, worth stating in the mapping so nobody "fixes" it);
  **3** "Back to home"; **4** the footer links.
- **States:** static marketing content; no empty, loading or error states.
- **Motion:** all six kept — the local pointer parallax + `.wx-cursor`, the local IO reveal (0.14 /
  `-6%`), the `.eq-mix-seg` and `.eq-fill` 1.1s widths, `WxTilt` / `WxMagnetic` /
  `WxRotatingHeadline`, and the `--i` stagger. `equipment-tracking-redesign.css` has no keyframes of
  its own.
- **Tests touched:** none directly. `App.test.tsx:186 / :213 / :234 / :243` exercise the Equipment
  Tracking **product** (onboarding selection + the tutorial lesson), not this page. **Unaffected.**

---

# 5. Proposed removals and changes — needs approval

Nothing below is done by this mapping. Each is listed with what it costs.

| # | Proposal | Reasoning | Cost if approved |
|---|---|---|---|
| **R1** | Delete the background field on the four pages: 12 `.dx-aurora` blobs (42/38/50vw, `blur(50px)`, `opacity .55`, `will-change: transform`, pointer-parallax on Equipment/Materials/Projects) and the 4 `.dx-cursor` followers (480×480 fixed radial, one of them invisible on Crews). | They carry **zero** information items across four screens, they are the cluster's only violation of "one ground, no banding," and blurred colour fields behind a data grid are a recorded paint hotspot in this repo. Canvas flags the same deletion. | Visible: the ground goes genuinely flat. `useHudMotion`'s `--mx/--my/--px/--py` writer becomes dead weight on these pages and can be gated off; the reveal half stays. |
| **R2** | Replace the Project Alerts panel's hard-coded `"10m ago"` / `"45m ago"` / `"2h ago"` with `relativeTime()` (`App.tsx:39154`). | The strings bear no relation to the records; the honest helper is 40 lines away in the same file; the Dashboard's equivalent panel already uses real `<time datetime>`. | Changes displayed values → not presentation-only. Would also want `<time datetime>` — which collides with the Dashboard panel's test if a future query is global (risk 18). |
| **R3** | Tint the Upcoming Milestones chip by `ScheduleMilestone.tone` (the Schedule month view already does), and change `deriveScheduleMilestones`' project-name fallback from the literal `"Project"` to `projectName()`'s `"Unassigned"`. | Two inconsistencies inside one product; the data is already on the object. | The second half changes a displayed string. |
| **R4** | Retire the five `projectAvatarThemes` multi-stop gradients on the Projects name cell to the five flat `.hs-avatar.tone-*` fills that already exist (blue/green/amber/red/violet — exactly five). | It is the last decorative gradient in the cluster, and "the trio is spent on the `em`" cannot be true while five faux-architectural gradients sit in a table. Five flat tints keep one distinguishable colour per `project.image`, and `projectInitials()` and the `imageThemes` map both stay. | Visible identity change on every project row. |
| **R5** | Fix the two `.proj-rx .badge` gaps: add rules for `in-progress` and `not-started` (today the two **most common** project statuses fall through to the neutral `#ebedfb` base), and fix `.badge.delayIQed`, which can never match because `statusTone()` lowercases and class selectors are case-sensitive. | Three statuses render as "no status". | Changes the colour of the two most common badges in the product. Needs a tone decision, not just a fix. |
| **R6** | Make the figure tiles clickable (e.g. "Available Now" → the Available saved view). | The record explicitly notes the tiles are inert while the tab beside them is not. | New affordance; would also give the figure row a hover state, which the licence currently forbids. |
| **R7** | Window the pagination (`Array.from({length: pageCount})` renders one button per page, so 400 records at 10/page = 40 inline buttons). | The footer grid is `1fr auto 1fr` and simply grows. | Structural change to a tested footer. |
| **R8** | Wire `useModalDialog` into the three `.crew-dialog` dialogs and the schedule importer, so all nine dialogs in the cluster get Escape, a focus trap, initial focus and focus return. | Four of nine have `role="dialog" aria-modal="true"` and none of that behaviour. The record is right that this is a fix, not a regression. | **Keyboard behaviour**, so out of scope for a presentation-only brief. The `.pdx` opt-in in §2 already delivers the visual and z-index half without it. |
| **R9** | Delete the `ProjectThumb` component (`App.tsx:27013`). | Confirmed dead. | Keep `imageThemes` (four live call sites) **and** keep `.project-thumb`'s CSS (the class is still applied at `App.tsx:29801` and styled in four places). Source deletion in a file another session is editing. |
| **R10** | Retire the card-era dead CSS: ~1,800 lines across `crews-`, `equipment-` and `materials-redesign.css` plus roughly half of `projects-redesign.css`'s 1,219. | Confirmed unreachable by grep. | **Only after** auditing cross-page reuse: `.crew-directory-card` and `.crew-status-pill` are alive because **Field Updates** reuses them, and `.cc-*` names are shared vocabulary with `dashboard-redesign.css`. Do it last, under the computed-style harness, so any regression is attributable. |
| **R11** | Add field-level validation to the four dialogs (no `required`, `aria-required`, `aria-invalid`, `pattern` or per-field message exists anywhere in `App.tsx:34872-37060`). | A user cannot tell which field is blocking a disabled submit. | Behaviour. |
| **R12** | Trim `CrewStatusLegend` to the three statuses `Crew["status"]` can actually hold. | "In Progress" and "Unavailable" can never appear in a row. | `App.test.tsx:745-751` asserts all five labels → the test must be edited in the same commit. |
| **R13** | Re-base the legend's five raw hexes (`#10b981`, `#0b4df5`, `#ff3045`, `#3478f6`, `#94a3b8`) onto the token set. | They are the cluster's only un-tokenised colours and three of them are a different blue and a different red from the accent and the semantic red. | Five rendered colours change. |
| **R14** | Add `aria-describedby` to the three `.crew-dialog` dialogs (their sub-copy is currently unannounced; the `.pdx` dialogs all have it). | Consistency and screen-reader parity. | Accessibility markup change; safe but not presentational. |
| **R15** | Give the Remove-Equipment confirm button a per-item accessible name (`"Confirm remove <name>"`), matching Crews' `"Confirm delete <crew name>"`. | Today it is `"Remove Equipment"`, identical to the dialog's own `h2`. | Breaks `tests/index-pages.test.tsx:419` unless updated in the same commit. |
| **R16** | Delete `--wx-serif` from `projects-`, `equipment-`, `materials-` and `project-dialog-redesign.css` and rewrite the 14 reads to `var(--bf-font-sans)` (decision #4). | Correct, and required by the decision. | **Not a zero-pixel change in this cluster**: 3 of the 14 reads are live and nine dialog titles go from Palatino to Inter (finding 0.3a). Ship it with a screenshot, not as cleanup. `.crew-rx` has neither the declaration nor a read, so Crews needs no edit. |

---

# 6. Open questions

1. **Q1 — the two lying controls.** The `h1`'s chevron looks like a view dropdown and only resets the
   view (`aria-label "Show all <page>"`, `title "All <page>"`); the "Filter" chip and the "Advanced
   filters" link both only call `clearXFilters()`, and the chip's own title reads "Use the filters
   below". In a cleaner surface they will read as broken. No test touches any of them, so the
   behaviour is free — but relabelling is copy, and building the promised filter panel is a feature.
   **Which?**
2. **Q2 — three un-sortable columns among eleven sortable ones.** Forecast finish (the one users would
   most want), Contract and Location on Projects; Capacity, Equipment, Current job, Labor mix on
   Crews; Current job, Readiness phrase on Equipment; Quantity, Job, Schedule impact on Materials.
   The inconsistency will look like a bug in a cleaner table. Sorting is logic; leave or fix?
3. **Q3 — the silently swallowed forecast fetch.** `fetchScheduleStatus()` rejection is caught and
   ignored, so Forecast finish stays `"—"` for every row and the `±Nd` chip never appears, with no
   message. A dense surface can afford a 12px muted line ("Forecast unavailable") in the toolbar's
   right slot — that is **new copy**, so it needs sign-off.
4. **Q4 — Address and Value are displayed but not searchable** (the haystack is name + location + type
   + status + scheduleHealth + manager). A search box that misses two visible columns is a UX defect,
   but the fix is logic.
5. **Q5 — the stuck edit dialog.** If the project being edited disappears from `data.projects` on a
   reload, the `editingProject` guard fails, **no dialog renders**, and `projectModalMode` stays
   `"edit"` — the row link appears dead until another open/close cycle. Presentation cannot fix it.
6. **Q6 — the permanently disabled Project Manager select** when no user has role "Project Manager" or
   "Superintendent": zero options, submit never enables, no message. Same shape as Q3.
7. **Q7 — page state is clamped but not reset.** Narrowing a filter then widening it snaps back to the
   previously held page rather than page 1, and the selection Sets are never cleared by a view, filter,
   search or page change, so "N selected" can count rows that are off screen.
8. **Q8 — `"Invalid Date"`.** A material whose `deliveryDate` is `""` renders that literal in the
   Delivery-date cell, because `formatDate()` handles only `"Pending"` and `/^\d{4}-\d{2}-\d{2}$/`.
9. **Q9 — two reveal contracts.** The app is being corrected to `threshold: 0.16 / rootMargin -6%`,
   but the two marketing product pages in this record run **local** observers at `0.14 / -6%`. Leave
   them (they are `.welcome-rx`, and the source file is the reference) or unify?
10. **Q10 — the display-register ceiling, if the reviewer disagrees with finding 0.3b.** This mapping
    ships preserve's `--bf-app-title` `clamp(22px,1.9vw,26px)` and relies on the existing 42px
    `.pdx-title` rung for the display register. If a reviewer wants the *page* title in that register
    too, the one-line change is hybrid's `clamp(32px, 3.6vw, 46px)` on the four index `h1`s — with two
    knock-ons that must be priced: the figure would have to move to `clamp(24px,2vw,30px)` to keep the
    internal ladder, and the `h1`'s inline 26px caret button plus the `.hs-page-tag` pill both need
    re-aligning against a 46px cap line.
11. **Q11 — cross-cluster coordination, four files.** `hs-index.css` is shared with **Field Updates,
    Bookmarks, Contacts and the Gantt page**; `project-dialog-redesign.css` (`.pdx`) is shared with
    **Contacts, Companies, Deals, Crews and Field-update** dialogs — seven families across six pages;
    `styles.css`'s `.crew-dialog` / `.primary-button` / `.outline-button` are global; and the global
    scrollbar and focus ring live in `redesign.css`. Every §1 decision in this document lands on those
    files, so the operations, sales, field and schedule mappings must agree on: the eyebrow rule, the
    r18 card rung, the flat progress fills, the `thead` fill, the pill-invert hover, and the
    blue-page / ink-modal / red-danger button rule from finding 0.3d.

---

# 7. Tests touched — the whole cluster in one table

| Test | Asserts (abbreviated) | Verdict |
|---|---|---|
| `tests/index-pages.test.tsx:37` | Projects: `h1 /^Projects/`, "Active Projects", "Add project", tablist "Project views" + 3 tab names + `aria-selected`, row via "Edit Riverside Office Building" with "In Progress"/"On Track"/"62%"/"Matt Johnson", `checkbox "Select …"`, search + health/manager filter round-trips | **passes unchanged** |
| `tests/index-pages.test.tsx:80` | Add project → "Not Started"/"0%" → footer `/^2 projects/`; labels "Project Name"/"Location"/"Address"/"Target Completion"; button exactly "Create Project"; POST body | **passes unchanged** |
| `tests/index-pages.test.tsx:154` | Row link → "72%"/"Monitor"; labels "Project Name"/"% Complete"/"Schedule Health"; "Save Changes"; PATCH body | **passes unchanged** |
| `tests/index-pages.test.tsx:204` | "Delete Riverside Office Building" → dialog "Delete project" → "Confirm delete …" → DELETE → "No projects added yet" | **passes unchanged** |
| `tests/index-pages.test.tsx` `findIndexCard()` | `h1` is level 1 and lives inside a `<section>` | **passes unchanged — and it is the constraint that forbids restructuring `.hs-index-card`** |
| `tests/index-pages.test.tsx:236` | Crews: tablist "Crew views", row with "Mike Johnson"/"8 workers", "Edit Concrete Crew 1", dialog labels, "Save Crew", PATCH | **passes unchanged** |
| `tests/index-pages.test.tsx:299` | Crews: "Delete Concrete Crew 1" → `/^Delete crew/` → "Confirm delete Concrete Crew 1" → DELETE → "No crews added yet" | **passes unchanged** |
| `tests/index-pages.test.tsx:338` | Equipment: "Total Equipment", "Add Equipment", tablist "Equipment views", row "In Use", "Remove Concrete Pump #2", both empty copies, "Search equipment" | **passes unchanged** |
| `tests/index-pages.test.tsx:352` | Equipment: `getAllByRole(... "Edit <name>")[0]` — the row **link** and the row **pencil** share an accessible name | **passes unchanged — and both labels and their DOM order are frozen because of it** |
| `tests/index-pages.test.tsx:370` | Equipment: dialog "Add Equipment", four labels, POST body | **passes unchanged** |
| `tests/index-pages.test.tsx:419` | Equipment: "Edit Equipment"/"Save Equipment"/PATCH, then "Remove Equipment"/DELETE via `within(dialog)`, then "No equipment added yet" | **passes unchanged**; would need an update only if **R15** ships |
| `tests/index-pages.test.tsx:474 / :487` | Materials: "Total Materials", "Ready Now", "Add Material", tablist "Material views", row via `checkbox "Select Ready Mix Concrete"` with "Ready"/"120 yd3", "Ordered" tab empty copy, both labels | **passes unchanged — and it is why the per-row checkbox may not be removed or relabelled** |
| `tests/index-pages.test.tsx:21-23` | `equipmentUnlockedFixture` (`selectedProducts: ["equipment-tracking"]`) proving the add-on gate | **unaffected** |
| `App.test.tsx:656` | "New Project" dialog: the six prefills, "Create Project" starts disabled | **passes unchanged** |
| `App.test.tsx:673 / :714` | `role="alert"` "Project could not be created." / "… updated."; dialog stays mounted | **passes unchanged** |
| `App.test.tsx:698` | "Edit Project" + prefills, via **unscoped** `getByLabelText("Location"/"Type"/"Status"/"Schedule Health"/"% Complete")` | **passes unchanged — those labels must stay unique page-wide and `% Complete` must stay `type="number"`** |
| `App.test.tsx:736` | Crews: heading exactly "Crews", "Total Crews", "Search crews", the "Crew statuses" region, Add Crew → dialog "Add Crew" + three labels + "Labors & Operators" | **passes unchanged** |
| `App.test.tsx:745-751` | The five legend labels inside "Crew statuses" | **passes unchanged**; blocks **R12** |
| `App.test.tsx:762 / :777` | Add Material dialog labels; POST body | **passes unchanged** |
| `App.test.tsx:824 / :836 / :850` | Crew size preview = 5; add/remove role; POST body shape | **passes unchanged** |
| `App.test.tsx:907 / :921` | "Edit Crew" prefills + enabled "Save Crew"; Cancel issues no PATCH | **passes unchanged** |
| `App.test.tsx:243` | The "Equipment Tracking lesson" tutorial step spotlighting `equipment-page-title` | **passes unchanged iff `DocHeader` keeps `data-tutorial-id` on the `h1`** |
| `tests/tutorial.test.tsx:155` | The crew gate stays locked until a crew is created — depends on `crew-add-button` and `crew-dialog` existing and on the row appearing | **passes unchanged iff both ids stay on their current elements** |
| `schedule/ScheduleImportDialog.test.tsx:87 / :114 / :123` | Preview → import → report; the `.mpp` refusal; the server reason + hint and the return to `choose` | **passes unchanged** (the `.pdx` class addition is additive; no query is class-based) |
| `schedule/boundary.test.ts` | No schedule markup in `App.tsx`; no `/gantt-/` className there | **unaffected** — nothing named `bf-sched-*`, and the importer edit is inside `schedule/` |
| `tests/landing-menus.test.tsx` | The Product menu that links to both marketing pages | **passes unchanged** |
| `tests/map.test.tsx:103` | The equivalent locked-row-prompts-not-navigates assertion (Map) | **unaffected**, cited as the pattern the Equipment lock relies on |
| **New — `density.test.ts`** | Reads `app-shell-daylight.css` raw via the `?raw` glob `boundary.test.ts` already uses; fails on any `font-size` literal in a `.bf-shell` rule outside the §1.4 ladder, on any selector that **renames** rather than prefixes an existing one, and on any `linear-gradient` in a `.hs-progress-track` rule | **new file, additive** |

**Expected suite delta: 0 failures, 0 edits to existing tests.** The three files to run first, in
order: `tests/index-pages.test.tsx` (all 8 cases in this cluster) → `tests/tutorial.test.tsx:155` →
`schedule/ScheduleImportDialog.test.tsx`.

**Surfaces in this cluster that no test covers** — so they need a manual walkthrough against the
records' item lists, not a green suite: the three Projects rail panels (Project Alerts, Upcoming
Milestones, Portfolio Health — 18 information items, 6 actions, 2 charts), the "Get Equipment
Tracking" AddOnPrompt, the `CrewStatusLegend`'s two impossible statuses, and both marketing product
pages (29 information items, 8 actions).

---

# 8. Build order for this cluster

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append `--bf-app-*` + `--bf-lift-dense` + `--bf-app-reveal-*` to `design-tokens.css`; re-base `--bf-focus-ring` to `rgba(47,107,255,0.12)`; correct `useHudMotion` to `0.16` / `-6%` | 2 | none |
| **B** | The four index documents, purely in `app-shell-daylight.css`: the eyebrow rule (66 elements), the dissolved card / KPI / panel frames, the r18 table stage, the flat progress fills, the pill invert, the focus rings on the five selects, the 27px rhythm, the 1140px measure + `.bf-doc-bleed` | 1 new (shell's) | low — CSS only, and `.bf-shell` is the kill switch |
| **C** | Port `figure-row.tsx`, `segmented-pills.tsx`, `scroll-edge.tsx`, `document-page.tsx`; wire them to the 4 pages (17 tiles, 17 tabs, 4 tables, 4 headers). **`DocHeader` must render the `h1` itself with its id, its caret and its `data-tutorial-id` in place** | 4 new + `App.tsx` ×4 pages | **medium** — the only phase that touches `App.tsx`, in the file a parallel session is editing (recorded failure mode: a black screen with an empty `#root` and no console errors). Do it one page at a time, Projects last (it has the rail). |
| **D** | The `.pdx` opt-in: one class each on 4 backdrops + 4 dialog shells; extend `.pdx .pdx-form > label` to include `.crew-form > label`; split `.hs-upd-dialog` / `.hs-addon-dialog` before restyling the AddOnPrompt | `App.tsx` ×3, `schedule/ScheduleImportDialog.tsx`, 2 CSS | low — additive classes; fixes the z-index-30-under-the-FAB bug for free |
| **E** | Decision #4 executed here (**R16**), with a screenshot of the nine dialog titles before/after | 4 CSS | low, but **visible** |
| **F** | `density.test.ts` | 1 new test | none |
| **G** | Dead-CSS sweep (**R10**), last, under the computed-style harness | 4 CSS | low, attributable |

**Acceptance for this cluster:** the 8 `tests/index-pages.test.tsx` cases, the 11 `App.test.tsx`
cases, `tests/tutorial.test.tsx:155` and the 3 importer cases all pass with **zero test edits**; a
computed-style diff over the 4 pages confirms `th`/`td` heights, `thead` sticky offsets,
`.hs-progress` min-width and every frozen metric in §1.3 are unmoved while every colour, radius and
shadow changed; the 42 column heads all compute to `11.5px / 650 / 0.045em / uppercase / #8a877e`;
`document.querySelectorAll("[data-reveal]")` on each page returns exactly 3 nodes, all with static
class strings, and each carries `.in` after the observer flush; a manual walk of the six uncovered
surfaces above; and a keyboard pass proving all five `<select>`s now show a focus ring and every
hover-revealed row action is reachable by Tab.
