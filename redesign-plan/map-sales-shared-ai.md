# Cluster map: **sales-shared-ai**

Screen-by-screen redesign mapping for the Sales hub (Contacts / Companies / Deals), the shared
index + bookmarks + legacy primitive layer that ten pages stand on, and every AI module —
against the chosen shell concept **"preserve" (Daylight Rail)** plus the grafts the judges
required.

**33 screens mapped** from three inventory records, plus **21 further surfaces** the three
completeness audits added, each given an explicit home in §6.

Source records:
- `/private/tmp/claude-501/-Users-liamsantos-Desktop-BuildFlow-BuildFlow-Claude/162c7a22-0a48-4733-9e28-d93850cdf4ff/scratchpad/inventory/sales-hub.json` (11 screens, 124 information, 120 actions)
- `/private/tmp/claude-501/-Users-liamsantos-Desktop-BuildFlow-BuildFlow-Claude/162c7a22-0a48-4733-9e28-d93850cdf4ff/scratchpad/inventory/bookmarks-index-shared.json` (10 screens)
- `/private/tmp/claude-501/-Users-liamsantos-Desktop-BuildFlow-BuildFlow-Claude/162c7a22-0a48-4733-9e28-d93850cdf4ff/scratchpad/inventory/ai-modules.json` (12 screens, 120 information, 75 actions)

---

## 0. Two things I verified in source that change the plan

Both are in this cluster, both contradict a claim the concept documents rely on, and both were
read out of the files rather than inferred.

### 0.1 The app **does** render serif, and it renders it at display size

`project-dialog-redesign.css:25` declares `--wx-serif: "Iowan Old Style", "Palatino Linotype",
Palatino, "Book Antiqua", Georgia, "Times New Roman", serif` and `:160` consumes it:

```css
.pdx .pdx-title {
  font-family: var(--wx-serif);
  font-size: clamp(28px, 3.4vw, 42px);
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.06;
}
```

I grepped every one of the 57 stylesheets: **no sheet after `project-dialog-redesign.css`
(main.tsx import 21) mentions `.pdx-title` at all.** Nothing overrides it. So every
`Create Contact` / `Edit Company` / `Delete <name>?` title in this cluster — and the Project and
Crew dialogs, which share `.pdx` — really is Palatino at up to 42px.

`DESIGN_TOKENS.md` §2 concluded "nothing renders serif" from a walk of the Dashboard, Projects,
Materials, Field Updates and DelayIQs **pages**. Dialogs were not opened. Decision #4 (delete
`--wx-serif`) is therefore **not inert here**: it is a declared visible change on 7 dialog
families in this cluster. It also makes them *more* faithful, because the Welcome Page's display
accent is `font-style: italic` on `em`, "not a second family" — which is exactly what is left
when the Palatino stack goes. See §3/S-2 and §7.1.

### 0.2 This cluster contains the app's only display-register type

Preserve's honest shortfall #2 says "nothing in the app exceeds 26px, while the Welcome Page's
*smallest* display size is 38px, so after the re-skin no surface in the product occupies the
display register at all."

`clamp(28px, 3.4vw, 42px)` on `.pdx-title` already occupies it. I keep that rung and land it on
**`clamp(28px, 3.2vw, 38px)`** — 38px is precisely the Welcome Page's display floor
(`--bf-type-display: clamp(38px, 5vw, 78px)`). One rung of the two ladders is then *identical*,
which is the only place in the product where the marketing type scale is reachable without
inventing a size. It costs nothing: the type is already there.

---

## 1. The translation, with numbers

### 1.1 Carries over **literally** — same value, no rescale

| Thing | Value | Where it lands in this cluster |
|---|---|---|
| Ground | `#f5f6fa`, one ground, sections transparent | `.contacts-page` negative-margin ground already computes `--hsx-paper #f5f6fa`; `.hs-board` paper strip; the AI panel's `--bfz-paper` |
| Ink / muted / faint | `#1c1c1a` / `#575550` / `#8a877e` | replaces `--hsx-ink #14203a` (the third ink) on 6 index titles, 3 drawer `h2`s, `.hs-cell-num`, `.hs-name`, `.bm-tile-open`, `--bfz-navy` |
| Hairlines | `rgba(28,28,26,0.13)` / `rgba(28,28,26,0.07)` | replaces `--hsx-line #e6e8f0`, `--hsx-line-soft #eef0f4`, `--hsc-line #e6e8f0`, `--bfz-line #e6e8f0` |
| Card fill | `#ffffff` | unchanged everywhere |
| Accent | `#2f6bff`, one | already correct in all four of this cluster's token blocks |
| Radius ladder | `999 / 26 / 20 / 18 / 12 / 8` + `50%` | full map in §1.4 |
| Shadow ladder | all seven steps verbatim | full map in §1.5 |
| Easing | `cubic-bezier(0.22,1,0.36,1)`; `cubic-bezier(0.4,0,0.2,1)` only for height/grid | replaces `0.12s ease` (table rows), `0.14s ease` (hover-reveal stars), `0.15s ease`, `0.16s ease` (~40 rules across `hs-index.css`, `bookmarks-page.css`, `hs-contacts.css`) |
| Interaction durations | `.18s` press · `.25s` hover · `.28s` transform · `.3s` panel | same rules |
| Hover grammar | four moves, no fifth | full map in §1.6 |
| Reveal contract | `threshold 0.16`, `rootMargin '0px 0px -6% 0px'`, add `.in`, **unobserve** | `useHudMotion.ts:50` goes `0.12 → 0.16` and `-5% → -6%` |
| Eyebrow | **`11.5px / 650 / 0.045em` uppercase `#8a877e` — ×1, the one role that does NOT re-scale** | §1.3 |
| Copy measures in `ch` | `--bf-app-prose: 62ch`, written `max-width: min(var(--bf-app-prose), 100%)` | every prose run: 9 index empty-state bodies, `.bm-empty span`, `.hs-bookmarks-empty`, `.hs-flyout-tip`, all AI answer bodies, `.diq` lead, `.sv-drawer` sub, add-on `where-to-get-it`, notice banners |
| Typeface | Inter only; italic `em` is the only display accent | §0.1 — this is what deleting `--wx-serif` delivers |

### 1.2 The eyebrow rule, grafted verbatim (highest-yield rule in the set)

`11.5px / 650 / 0.045em` uppercase `#8a877e`, at ×1, becomes:

| Today | Becomes |
|---|---|
| `.hs-index .hs-table thead th` — `42px` tall, `background #fafbfd`, `12.5px/650`, `letter-spacing 0.01em`, `color --hsx-mut` | height **42px frozen**, `background: transparent` (the card's white shows through), `11.5px/650/0.045em`, `text-transform: uppercase`, `color #8a877e`, bottom border `rgba(28,28,26,0.13)` |
| `.hs-index .hs-kpi-label` — `11.5px/600 --hsx-mut` | `11.5px/650/0.045em` uppercase `#8a877e` (size already correct) |
| `.hs-record-highlights span` — `10.5px/700/0.08em` uppercase `#8a92a6` | the canonical eyebrow |
| `.hs-record-props dt` — `11px/700` | the canonical eyebrow |
| `.hs-menu-head`, `.hs-flyout-head`, `.hs-bookmark-hub` `em` | the canonical eyebrow |
| Bookmarks group `h2` — `11.5px`, `0.06em`, `--hsx-mut` | the canonical eyebrow (tracking `0.06em → 0.045em`) |
| `.diq-kicker`, `.ss-band` eyebrow, `.sim-*` block labels, `.sx-eyebrow`, `.pdx-eyebrow`, the AI panel's `Suggested` / sidebar list heads | the canonical eyebrow |

**53 selectors across 8 stylesheets land on one rule.** Column heads and property labels are the
most-repeated text in this cluster; this single rule buys more family resemblance than any other
line in the plan.

### 1.3 Gets **re-scaled** for density — the numbers

Appended to `client/src/design-tokens.css` (preserve §3c, plus the two rungs this cluster needs):

```css
:root {
  --bf-app-display:       clamp(28px, 3.2vw, 38px);  /* NEW — stage objects only (.pdx/.sim/.hs-upd titles) */
  --bf-app-display-track: -0.015em;
  --bf-app-display-lead:  1.06;
  --bf-app-title:         clamp(22px, 1.9vw, 26px);  /* index h1, drawer h2 floor */
  --bf-app-title-track:   -0.02em;
  --bf-app-title-lead:    1.14;
  --bf-app-section:       16px;                      /* card head h2, drawer section h3 */
  --bf-app-panel:         14.5px;                    /* dashboard panel h2 — FROZEN */
  --bf-app-figure:        clamp(20px, 1.6vw, 26px);
  --bf-app-figure-track:  -0.02em;
  --bf-app-lede:          14px;
  --bf-app-row-strong:    13.5px;
  --bf-app-row:           13px;
  --bf-app-meta:          12px;
  --bf-app-eyebrow:       11.5px;
  --bf-app-eyebrow-track: 0.045em;
  --bf-app-micro:         11px;
  --bf-app-lead-row:      1.45;
  --bf-app-prose:         62ch;
  --bf-app-gutter-y:      clamp(18px, 2vw, 28px);
  --bf-app-gutter-x:      clamp(18px, 2.4vw, 32px);
  --bf-app-tail:          72px;   /* NEW — the free rhythm at the foot of a page */
  --bf-lift-dense:        -4px;
  --bf-spotlight-r:       220px;
  --bf-spotlight-a:       0.06;
  --bf-tilt-dense:        5deg;   /* NEW — DxTilt's ±7deg re-scaled */
  --bf-focus-ring:        0 0 0 4px rgba(47, 107, 255, 0.12);  /* CORRECTED off #1a73e8 */
}
@media (prefers-reduced-motion: reduce) {
  :root { --bf-lift-dense: 0px; --bf-spotlight-a: 0; --bf-tilt-dense: 0deg; }
}
```

**The compression factors, stated against the source's own internal range:**

| Role | Welcome Page | Here | Factor |
|---|---|---|---|
| Stage title | `clamp(38px,5vw,78px)` display | `clamp(28px,3.2vw,38px)` `.pdx-title` | ÷2.05 at the ceiling, **×1.00 at the Welcome floor** |
| Page title | hero `clamp(46px,6.8vw,96px)` | `clamp(22px,1.9vw,26px)` | ÷3.69 |
| Section head | h2 `clamp(32px,4.4vw,54px)` | `16px` | ÷3.38 |
| Figure | stat `clamp(46px,5.4vw,72px)` | `clamp(20px,1.6vw,26px)` | ÷2.77 |
| Lede | `clamp(16px,1.35vw,19px)` | `14px` @ 62ch | ÷1.36 |
| Body | 15–16px | `13px/1.45` | ÷1.2 |
| **Eyebrow** | 11.5–13px | **11.5px** | **×1** |
| Card rhythm | `clamp(76px,12vh,130px)` → 108px | `clamp(20px,3vh,34px)` → 27px | ÷4.0 |
| **Page tail** | 108px | **72px** | **÷1.5** |
| Card head margin | `0 auto 54px` | `0 0 12px` | ÷4.5 |
| Card lift | `translateY(-6px)` | `translateY(-4px)` | ÷1.5 |
| Mock tilt | pointer `--rx/--ry` | DxTilt ±7deg → **±5deg** | ÷1.4 |

**The checkable sentence:** the row-to-title jump is `13px → 26px = 2.00×`; including this
cluster's one stage rung it is `11px → 38px = 3.45×`. The Welcome Page's own range is
`11.5px → 96px = 8.35×`. **The product's type range is 41% of the marketing page's, on one
continuous ladder whose top rung (38px) is shared exactly.** Rhythm compresses 4.0× and type
3.4×, close enough that the two read as one system at two volumes — except at the foot of a page,
where the 72px tail is Welcome-scale air that costs nothing because nothing competes below the
last row.

**Deliberately not carried over:** the 1140px `.wx-main` measure. A 12-column Contacts table, a
7-lane Deal board and a 6-column dashboard need the width. Prose is capped in `ch` instead, and
`.bf-doc-bleed` is available where a measure does exist so a dense board can escape it rather
than forcing the measure to be abandoned.

### 1.4 Radius map

| Rung | Surfaces in this cluster |
|---|---|
| `999px` | `.hs-search`, `.hs-chip`, `.hs-btn`, `.hs-btn-primary`, `.hs-badge` (+`tone-teal/slate/orange`), `.hs-view-count`, `.hs-count-pill`, `.hs-page-tag`(+`.beta`), `.hs-flyout-tag`, `.hs-menu-tag`, `.hs-bookmarks-count`, `.hs-task-pill`, deal priority pills `.p-low/.p-medium/.p-high`, `.hs-delta`, `.diq-sev`, `.diq-slip`, `.cc-sev-*`, `.sim-grade`, `.badge` (already a pill via `redesign.css:233`), the AI panel's chips/quick-action pills, `.hc-assistant-fab` |
| `26px` | `.pdx-dialog`, `.pdx-confirm`, `.sim-dialog`, `.hs-upd-dialog`, `.hs-addon-dialog` — the stage objects |
| `20px` | `.bf-breeze-main` / `.bf-breeze-dock` (the AI panel), `.cmdk-dialog` |
| `18px` | `.hs-index-card`, `.hs-kpi`, `.bm-tile`, `.hs-flyout`, `.hs-menu`, `.hs-bookmarks-menu`, `.notifications-panel`, `.dash-block`, `.diq-panel`, `.sv-drawer`, `.panel`, `.hs-board-col`, `.hs-deal-card`, `.hs-record` top-left/bottom-left corners only (it is flush right) |
| `12px` | `.hs-kpi-ico`, `.cc-stat-ico`, `.bm-tile-icon` (was 8px), `.hs-timeline-ico`, `.hs-flyout-tip`, `.hs-btn-icon`, `.hs-record-action` chips, `.hs-index-title button` (was 6px), `.cc-app` icon squares, `.qc-loader` stage frame, `.hs-upd-spotlight` outline radius (already 12px) |
| `8px` | `<kbd>` chips, `.hs-thumbs`, `<code>` chips in the import findings, `.form-stack input/select/textarea` (was 7px) |
| `50%` | `.hs-avatar`, `.hs-record-avatar`, `.hs-bookmarks` dots, `.diq-kicker` dot, `.pdx` eyebrow dot, `.hs-board-dot` |

**Retired radii:** `14px` (`.hs-index-card`), `10px` (`.hs-table-wrap`, `.hs-record-composer`,
`.hs-record-card`, `.hs-record-highlights > div`, `.hs-timeline-ico`), `6px` / `7px` / `9px`
(`--r-sm`). Radius does **not** scale with density: an 18px corner on a 300px card is a sheet of
paper, a 14px corner is a widget. The ladder is literal.

### 1.5 Shadow map

| Step | Surfaces |
|---|---|
| `0 10px 30px rgba(28,28,26,0.05)` card at rest | `.hs-index-card` (was `0 1px 2px rgba(20,32,58,0.04)`), `.bm-tile`, `.panel` (was `0 16px 34px rgba(31,56,88,0.06)`), `.diq-panel`, `.hs-board-col` |
| `0 4px 12px rgba(28,28,26,0.08)` small raised | `.hs-btn-primary` (was `0 6px 16px rgba(47,107,255,0.28)` → tinted `0 4px 12px rgba(47,107,255,0.2)`), `.hs-deal-card` at rest, `.kpi-icon` (drops its inset white highlight) |
| `0 8px 22px rgba(28,28,26,0.2)` ink pill | `.hs-flyout-tip`, `.hs-record-notice`, the AI FAB |
| `0 26px 60px rgba(28,28,26,0.12)` card hover | every **licensed** card hover (§1.6) |
| `0 24px 70px rgba(28,28,26,0.14)` floating panel | `.hs-flyout`, `.hs-menu`, `.hs-bookmarks-menu`, `.notifications-panel`, `.hs-record` (was `-24px 0 60px rgba(20,32,58,0.22)` — a navy-tinted directional shadow), `.bf-breeze` panels |
| `0 34px 64px rgba(28,28,26,0.13)` stage | `.pdx-dialog`, `.sim-dialog`, `.hs-addon-dialog`, `.cmdk-dialog` |
| `0 0 0 4px rgba(47,107,255,0.12)` focus | every `:focus-visible` — see §2.7, the focus ring is currently **orange and beaten** |

### 1.6 Hover grammar — four moves, and the card licence that decides which

**The two-clause card licence, as grep-checkable doctrine.** A white bordered rectangle is
licensed only if:
1. its boundary is itself interactive (draggable, resizable, dismissible, or the control's own
   hit target), **or**
2. it is a viewport clipping a scrolling world.

Only a licensed frame may take the **lift**. Unlicensed frames lose their outline (§2.4) and
never lift.

| Move | Value | Applied to |
|---|---|---|
| **1 Lift** | `translateY(-4px)` + card-hover shadow, `0.28s var(--bf-ease)` | `.bm-tile` (clause 1 — the whole boundary opens a page; was `-1px`), `.hs-deal-card` (clause 1 — draggable *and* its title navigates; replaces the bespoke `0 6px 16px` hover), `.cc-app` cards, `.kpi-card-button` (was `-3px`), the AI panel's 4 quick-action cards, `#ai-overview` module cards and `.wi-feature` cards at the marketing `-6px` |
| **2 Invert** | outline → `#1c1c1a` / `#fdfcf9` | `.hs-btn`, `.pdx-cancel`, `.hs-empty .hs-btn` ("Try again"), `.sim-actions` secondary ("Choose a different file", "Cancel", "View my projects"), `.diq` "Notify affected trades", `.sv-drawer` "Keep the plan", `.hs-home-empty-btn` ("See resolved"), the add-on prompt's "Not now", `.topbar-verify` |
| **3 Slide** | `translateX(3px)` | `.hs-flyout-item`, `.hs-flyout-view`, `.hs-menu` rows, `.hs-bookmark-row`, `.hs-bookmarks-add` icon, `.hs-record-card-row` links, `.hs-panel-link`, every "View all" / "Details" / "Manage" link, the table row's trailing `.hs-cell-actions` cluster, `.cc-rec` "Review", `.hs-link` underline offset, "Open the schedule ↗", `.aix-module` arrow |
| **4 Tilt** | pointer `--rx/--ry`, clamped to `var(--bf-tilt-dense)` = **±5deg** | **`DxTilt` already exists and already does this** (`schedule/parts/shared.tsx:71`, ±7deg on every dashboard KPI card). It is kept, clamped to ±5deg, and **given the `prefers-reduced-motion` guard it currently lacks in JS**. Its dense substitute, `SpotlightSurface` (§2.3), covers the surfaces that cannot tilt |

**This is where my cluster beats preserve's own §12.1 shortfall:** preserve says the fourth move
"has no home in the app". It does — `DxTilt`, an ±7deg pointer-driven perspective tilt, is a
shared primitive in this cluster's `bookmarks-index-shared` record and is already wrapped around
every dashboard KPI card. It is the Welcome Page's move, literally, already shipping. It needed a
reduced-motion guard, not an invention.

**Explicitly never lifts:** `.hs-index-card` (static container), `.hs-kpi` (static figure),
`.dash-block` (draggable — a lift fights the resize grip; drag-lift only), `.hs-record-card`
(frame retired anyway), `.hs-table` rows (background wash + move 3 on the action cluster only),
`.hs-board-col` (a droppable, so its boundary is licensed and it keeps its `.is-over` ring — but
a *lane* does not lift, it rings).

---

## 2. Shared machinery for this cluster

### 2.1 One stylesheet, one class, one kill switch

Nothing in `main.tsx` is reordered. One line is appended after
`import "./app-shell-hubspot.css"`:

```ts
import "./app-shell-daylight.css"; // the Welcome Page's language over that shell — loads after it
```

Every rule is the existing selector with `.bf-shell` prefixed and nothing else, so each new rule
is exactly one class more specific *and* later in the cascade. No `!important`. **No `:where()`**
— a documented jsdom breaker in this repo.

**Correction to preserve §5e I am carrying:** its palette rule
`.bf-shell ~ .cmdk-backdrop, .cmdk-backdrop { … }` uses a sibling combinator, but
`CommandPalette` renders as a **child** of the shell (`App.tsx:2807`, inside the div at 2806), so
the first selector matches nothing and only the unscoped second one carries the rule — which
escapes the concept's own one-word kill switch. Written correctly:
`.hs-shell.bf-shell .cmdk-backdrop`.

**Cluster-specific trap the concept's recipe does not cover.** `hs-contacts.css` scopes the page
ground, the 5-across KPI grid and the entrance tweens to `.contacts-page` — a class **Companies
and Deals also carry**. Six shared primitives (`.hs-cell-none`, `.hs-link-plain`,
`.hs-cell-actions.three`, `tone-teal`, `tone-slate`, `tone-orange`) exist **only** under that
scope. The new sheet must therefore write `.bf-shell .contacts-page …`, never `.bf-shell
.hs-index …`, for those six, or Companies and Deals lose them. And the `--hsx-*` block is
declared **three times with duplicated literals** (`hs-index.css:11`, `schedule.css:5217`,
`expand-map.css:9`) — all three get the same eight new values or the Gantt page and the map cards
band against everything else.

### 2.2 Class-name additivity, and the pin list as a review gate

**The rule: the new stylesheet and any new wrapper ADDS classes and never replaces a pinned
one.** Where an additive class is genuinely needed, the pattern is
`<div className="schedule-kpis bf-figures">` → `<div className="kpi-card bf-figure">`, with the
new scope zeroing the inherited border/radius/shadow **from the `bf-` side**.

In practice this cluster needs **zero** JSX class edits, because the `.bf-shell`-prefix recipe
reaches every selector. That is deliberate: it is the cheapest possible protection for the 22
`querySelector` assertions and the ~40 pinned selectors, and it avoids the volume problem — 11
hand-written index blocks and 185 `className="hs-kpi…"` sites — that a wrapper migration would
create in the one file a parallel session is editing.

Shipped as a comment block at the top of `app-shell-daylight.css`:

```
/* PINNED — these class names, ids, roles and accessible names are asserted by the suite,
   by the tutorial, or by the what's-new spotlight. ADD classes; never rename or replace.

   Structure:  h1 whose text STARTS WITH the page name, inside a <section>   (findIndexCard)
   Ids:        #contacts-index-title #companies-index-title #deals-index-title
               #bookmarks-title #bookmarks-all-title #dashboard-kpi-feed
               #hs-addon-title #hs-addon-desc #schedule-import-title #delayiq-title-input
   Index:      .hs-index .hs-index-card .hs-index-head .hs-index-title .hs-page-tag(.beta)
               .hs-index-actions .hs-index-grid .hs-index-rail .hs-index-main
               .hs-kpis .hs-kpi .hs-kpi-ico .hs-kpi-label .hs-kpi-value .hs-kpi-note
               .hs-views .hs-view .hs-view-count .hs-toolbar .hs-search .hs-chip
               .hs-quickfilters .hs-qf .hs-qf.is-set .hs-qf-link .hs-perpage
               .hs-table-wrap .hs-table .hs-cell-check .hs-cell-name .hs-row-name .hs-avatar
               .hs-link .hs-link-plain .hs-row-sub .hs-cell-muted .hs-cell-none .hs-cell-num
               .hs-cell-wrap .hs-name .hs-thumbs .hs-badge .hs-progress .hs-progress-track
               .hs-delta .hs-cell-actions(.two/.three) .hs-row-action(.edit) .sorted
               .hs-empty .hs-index-foot .hs-count-pill .hs-pagination .hs-page-btn
               .hs-foot-right .hs-panel .hs-panel-head .hs-panel-link .is-selected
   Bookmarks:  .bm-tile .bm-tile-open .bm-tile-icon .bm-tile-label .bm-tile-lock
               .bm-tile-star(.is-on) .bm-tiles .bm-groups .bm-group .bm-count .bm-empty
               .hs-bookmarks-btn(.has-items) .hs-bookmarks-count .hs-bookmarks-menu
               .hs-bookmarks-empty .hs-bookmark-row(.is-current) .hs-bookmark-hub
               .hs-bookmark-remove .hs-bookmarks-add
   Chrome:     .hs-rail-slot .hs-rail-btn(.active/.recommended) .hs-rail-tag
               .hs-flyout .hs-flyout-head .hs-flyout-row .hs-flyout-item(.active/.locked)
               .hs-flyout-star(.is-on) .hs-flyout-tag .hs-flyout-tip .hs-flyout-upgrade
               .hs-flyout-views .hs-flyout-view .hs-flyout-label
   Sales:      .contacts-page .companies-page .deals-page .hs-record .hs-record-layer
               .hs-record-backdrop .hs-record-top .hs-record-head .hs-record-actions
               .hs-record-action .hs-record-composer .hs-record-composer-head
               .hs-record-section .hs-record-highlights .hs-record-props .hs-record-card
               .hs-record-card-wide .hs-record-list .hs-record-empty .hs-record-notice
               .hs-timeline-item .hs-timeline-ico .hs-task-pill .hs-layout-toggle
               .hs-board .hs-board-col(.is-over) .hs-board-dot .hs-board-empty
               .hs-board-dropslot .hs-deal-card(.is-dragging/.is-landing) .hs-deal-overlay
               .hs-deal-card-title .hs-stage-track .hs-stage-step(.done/.current)
               .pdx .pdx-dialog .pdx-crew .pdx-contact .pdx-confirm .pdx-form .pdx-title
               .pdx-cancel .pdx-save .pdx-save.pdx-danger .contact-form .contact-form-wide
               .form-error
   AI:         .bf-breeze(.is-open) .bf-breeze-side .bf-breeze-quick .bf-breeze-drop
               .bf-breeze-cloud .hs-ai-button .hc-assistant .hc-assistant-fab
               .qc-loader(.is-compact) .qc-stage .qc-particle .qc-dot
               .sim-dialog .sim-drop(.dragging) .sim-ring .sim-grade .sim-forecastIQ-meter
               .sim-band-track .sim-findings .sim-sev-* .sim-cloud .sim-actions
               .diq-panel .diq-kicker .diq-risk .diq-sev .diq-slip .diq-trigger .diq-pushes
               .diq-actions .diq-chain .diq-clear .diq-loading .diq-error .spin
               .cc-rec .cc-sev-* .cc-approval .cc-appr-* .cc-app .cc-app-badge .cc-list
               .cc-alert .cc-alert-time .cc-empty-line .cc-spark .cc-spark-line
               .fp-progress[data-reporting] .sv-drawer .ss-band .ss-strip(.ss-failed)
               .ss-project-track .sched-cpm .sched-cpm-error .is-on/.is-late/.is-early
   Legacy:     .page-stack .page-title .kpi-grid .kpi-card .kpi-card-button .kpi-icon
               .badge + every statusTone() class .panel .panel-header .panel-note
               .inline-empty-state .empty-state .dashboard-feed-empty .resource-row
               .table-head .table-row .form-stack .select-box .primary-button
               .outline-button .icon-button .export-button .toggle-button .search-box
   Tutorial:   EVERY [data-tutorial-id] — in this cluster: contacts-page-title
               contact-add-button contact-dialog companies-page-title company-add-button
               deals-page-title deal-add-button bookmarks-page-title crews-page-title
               crew-add-button crew-dialog equipment-page-title materials-page-title
               field-page-title delayIQs-page-title schedule-saved-views
               schedule-status-band schedule-alerts nav-<page> x21
               tutorial-restart-button
   Accessible names: see §2.9. Nothing in this cluster renames one.
*/
```

### 2.3 Shared components — reuse first

**Reused unchanged (4):**
- `components/ui/quantum-cloud-loader.tsx` — already the single "AI is working" signature at 5
  sites. Keep. Tokens re-based: `--qc-blue` is already `#2f6bff`; `--qc-red #f87171` /
  `--qc-yellow #facc15` / `--qc-green #4ade80` re-base onto the gradient trio's siblings
  (`#d96570` / `#f9ab00` / `#34a853`) so the loader is the app's second licensed trio use, not a
  fifth palette.
- `components/ui/text-shimmer.tsx` — already on "Thinking…" and the import step labels; **and it
  is the one AI keyframe with no `prefers-reduced-motion` guard.** Add one inside its own inline
  `<style>` block, the way the other eight ported components do it.
- `components/ui/interactive-hover-links.tsx` — already renders the landing AI mega-menu's hover
  blurbs and images. Keep; it is the repo's own Welcome-page grammar for a list of links.
- `components/ui/display-cards.tsx` — already renders the landing "BuildFlow AI" band's three
  stacked cards. Keep.

**New ports (2), both from the winning concept, both additive wrappers that change no selector
and no accessible name:**
- `components/ui/rail-tooltip.tsx` (21st.dev "Animated Tooltip"). Ink pill `#1c1c1a`/`#fdfcf9`,
  radius 8px, `11.5px/600`, padding `6px 10px`, offset 12px, `0 4px 12px rgba(28,28,26,0.08)`,
  `opacity 0→1` + `translateX(-4px)→0` over `0.18s var(--bf-ease)`, 380ms in / 80ms out. **The
  bubble is `aria-hidden="true"` with no role** — the wrapped button already carries the string
  in its `aria-label`, and a `role="tooltip"` here would both double-announce and collide with
  the 22-selector list's `[role='tooltip']` query (which is `.hs-flyout-tip`). In this cluster it
  wires to the bookmarks star trigger, the AI sparkle, and the two record-drawer icon buttons
  whose only label today is a `title`.
- `components/ui/spotlight-surface.tsx` (21st.dev "Card Spotlight"). `radius 220px`,
  `alpha 0.06`, `::before` radial at `--sp-x/--sp-y`, `opacity 0→1` over `0.25s var(--bf-ease)`.
  **Reads `--mx/--my` when the page root publishes them** — `useHudMotion` already sets those on
  ten page roots including all three Sales pages — so on those pages it adds zero listeners. In
  this cluster it wraps `.hs-index-card`, `.hs-kpi`, `.hs-flyout`, `.bm-tile`. **Never on an
  element with a computed className and `data-reveal`** — `.hs-index-main` carries `data-reveal`
  and `opacity: 0`, and a dynamic className there wipes the imperative `.in` forever.

**Two things I am explicitly NOT extracting, with reasons:**
- **A shared `paper-drawer.tsx` for the three record drawers.** Tempting (they already share
  `.hs-record*` unscoped) and *safe* by test count (zero tests). Rejected anyway: it is ~700
  lines of `App.tsx` churn in the file a parallel session is editing, this repo has a recorded
  failure mode for exactly that (black screen, empty `#root`, no console errors), and a
  stylesheet delivers the identical visual result. This is the judged flaw in hybrid's
  `floating-panel.tsx`; I am not repeating it.
- **A count-up on the KPI figures.** `test/setup.ts` stubs `IntersectionObserver` as a no-op, so
  under test the observer never fires and a naive count-up renders `0` forever; and the figures
  are read directly by `querySelector`. Figures get `font-variant-numeric: tabular-nums` instead,
  which is the real legibility win.

### 2.4 The counted boundary audit for this cluster

| Surface | Resting outlined rectangles today | After | The ones named meaningless |
|---|---|---|---|
| **Contacts / Companies / Deals index** | **8** — 5 `.hs-kpi` (1px `#e6e8f0`, 14px, `0 1px 2px`), `.hs-index-card`, `.hs-table-wrap` (1px, 10px), `.hs-search` pill | **2** | the 5 KPI outlines and the table-wrap outline. The wrap's border is a **double frame** 22px inside the card's — the single most visible boundary in the cluster. It goes; the card becomes the clipping viewport (`overflow: hidden`, 18px corners), so the first and last rows clip to the radius and the sticky 42px `thead` rides the card's own edge |
| Survivors and why | | | `.hs-index-card` — clause 2, a viewport clipping a horizontally scrolling `min-width: 720px` table with a sticky header. `.hs-search` — clause 1, the pill *is* the input's hit target and it is the one element that inverts on `:focus-within` |
| KPI tiles after | | | `background: #fff`, radius 18px, **no border, no shadow**, `gap: 14px`. The eyebrow label and the tabular figure carry the separation, exactly as the Welcome Page's proof figures do |
| **Contact record drawer** | **7** — 3 `.hs-record-highlights > div` (1px, 10px), 4 `.hs-record-card` (1px, 10px) | **0 at rest, 1 when a composer opens** | all 7. Highlights become a 3-up figure row (eyebrow + `13.5px/650` value, no box). Association cards become `.hs-record-section`-style blocks separated by the `rgba(28,28,26,0.07)` hairline the file **already uses** for its sections, each with an eyebrow head. `.hs-record-composer` keeps its frame — clause 1, it has Cancel and a submit, its boundary is dismissible |
| **Company record drawer** | **5** — 3 highlights, 2 cards | **0** | all 5 |
| **Deal record drawer** | **5** — 3 highlights, 2 cards | **0** | all 5. `.hs-stage-track` is not a frame and keeps its geometry |
| **Bookmarks page** | 2 `.hs-index-card` + N `.bm-tile` | unchanged | none. Every `.bm-tile`'s whole boundary opens a page (clause 1), so all of them are licensed — and they are the one surface in this cluster that already lifts |
| **Deals board** | 7 `.hs-board-col` + N `.hs-deal-card` | unchanged | none. A lane is a `useDroppable` target and a card is `useDraggable` — clause 1 twice over |

**Total: 25 resting outlined rectangles across the cluster's five densest surfaces become 4.**
Eighteen of the twenty-one removed are named above.

### 2.5 Motion contract

**Reveal arithmetic, grafted.** A 30px shift on a 46px table row moves it 65% of its own height,
and at 1s the page is still settling when the eye arrives. So in-app:
**12px / 0.55s / 50ms stagger, attached to sections and never to rows or cells, six per page
max.** Plus the engine correction in `useHudMotion.ts:50`: `threshold 0.12 → 0.16`,
`rootMargin '0px 0px -5%' → '-6%'`.

Per-page reveal budgets in this cluster:

| Page | Reveal targets after | Removed |
|---|---|---|
| Contacts / Companies / Deals | **2** — `.hs-kpis`, `.hs-index-main` (both already `data-reveal`) | `hsc-rise` on each of the 5 KPI tiles (`0.05s × --i`); `hsc-row-in` on **every** `tbody tr` (whose `--i` is never set on Companies/Deals, so all rows already share delay 0); `hsc-rise` on each `.hs-timeline-item` (`0.05s × --i`) |
| Bookmarks | **2** — the two `.hs-index-card`s carry `bm-rise` | `bm-rise` on all 40+ `.bm-tile`s. It is un-staggered, `both`-filled, and **replays on every render pass that remounts tiles** — so starring one page re-animates the whole catalogue. Moving it up to the two cards fixes that without adding `data-reveal` (which the tiles' remount would defeat) |
| DelayIQs rail | **1** — the `DelayEarlyWarning` `<section>` (already `data-reveal`) | none |
| Dashboard AI panels | already `data-reveal` per panel | none; but see the `.dash-block` warning below |

**Keyframe names are preserved, values change.** `hsc-fade`, `hsc-slide-in`, `hsc-rise`,
`hsc-row-in`, `bm-rise`, `sv-drawer-in`, `bfz-in`, `bfz-pop`, `bfz-rise`, `bfz-pulse`,
`quantum-red/blue/yellow/green`, `hs-deal-lift`, `hs-deal-land`, `hs-dropslot-in`, `hs-upd-pulse`,
`pdx-backdrop-in`, `pdx-dialog-in`, `pdx-field-in`, `pdx-pulse`, `cc-text-shimmer`, `sx-rise`.
Four `prefers-reduced-motion` blocks in this cluster null them **by name**
(`hs-contacts.css:886`, `hs-contacts.css:1452`, `bookmarks-page.css:167`,
`field-variance.css:296`) and a rename silently un-nulls them.

**Where I remove an animation from a selector I edit those blocks in place rather than leaving
them orphaned.** Concretely: `hs-contacts.css:893-894` lists `.contacts-page .hs-kpi` and
`.contacts-page .hs-table tbody tr` under `animation: none` — both selectors lose their animation
in the new design, so those two lines come out of the reduce block in the same commit.
`bookmarks-page.css:167` gains `.bookmarks-page .bm-tile-star` (its `color`/`background` 0.16s
transition is the one gap in an otherwise guarded sheet).

**Three hard motion rules for this cluster:**
1. **The Settings AI panel must never become `data-reveal`.** `.settings-panel-inner` is keyed by
   `activeSettingsView`, and `useHudMotion`'s reveal effect has deps `[rootRef]` only — it never
   re-queries after a key change, while the CSS rest state is `opacity: 0`. Settings keeps
   `sx-rise` or the panel goes permanently blank with no error.
2. **`.hs-kpis` and `.hs-index-main` classNames must stay static string literals.** Both carry
   `data-reveal` with an `opacity: 0` rest state (`hs-contacts.css:47-54`), so if `.in` never
   lands the **entire index page is invisible**, not merely un-animated. This is the single
   highest-risk motion coupling in the cluster.
3. **`SpotlightSurface` never wraps `.dash-block`'s reveal target.** `.dash-block` takes
   `is-dragging` / `is-resizing` / `is-landing` dynamically; the documented failure is a dynamic
   className wiping the imperatively-added `.in`.

**The deal drop choreography is frozen whole.** `DEAL_DROP_ANIMATION` `{ duration: 340,
easing: cubic-bezier(0.22,1,0.36,1) }` is **already the signature curve**; `hs-deal-land` starts
at `delay 0.32s` to land exactly as the 340ms drop animation ends; `hs-deal-lift` runs 0.3s;
`hs-dropslot-in` 0.22s; the 1200ms `is-landing` timer; and `.hs-deal-card.is-dragging {
animation: none }` is **load-bearing** because the mount animation's `both` fill would otherwise
pin `opacity: 1`. Changing any one duration breaks a three-part illusion. Only colours, radius
and shadow change here.

### 2.6 backdrop-filter licence, and the gradients that die

**Licensed in-app on the TOP BAR ONLY.** The tutorial spotlight draws its scrim as a 9999px
`box-shadow`, and any new containing block above a spotlit element mis-places the light. The
ground is flat, so a blur buys nothing anywhere else.

In this cluster that means **`.hs-record-backdrop`'s `backdrop-filter: blur(2px)` goes**, along
with its navy `rgba(20,32,58,0.42)` scrim → a flat `rgba(28,28,26,0.28)`. Declared visible
change. Same for the AI panel's surfaces (no `backdrop-filter` there today — keep it that way);
`display-cards.tsx`'s internal `blur(6px)` stays because it is a marketing-page component with no
tutorial anchor inside it.

**HYBRID's rule, enforced where hybrid broke it:** no new `transform`, `filter`, `contain` or
`will-change` may be added to any **ancestor** of a `[data-tutorial-id]` element. In this cluster
the anchors at risk are `contact-dialog` (inside `.pdx-dialog`, which already has two
`filter: blur(44px)` aurora **siblings** — siblings are fine, ancestors are not),
`schedule-alerts`, `schedule-status-band`, `schedule-saved-views` and the six `*-page-title`
spotlight targets. `SpotlightSurface` uses a `::before` radial and **no transform**, which is why
it is safe to wrap `.hs-index-card` even though `contacts-page-title` lives inside it.

**The trio's in-app uses, counted: two.**
1. the top-bar AI sparkle (`linear-gradient(96deg, #4285f4 0%, #9b72cb 54%, #d96570 100%)`) — the
   sanctioned `.wx-grad-ai` role;
2. **`.pdx .pdx-title em`** — already `linear-gradient(105deg, var(--wx-g-blue),
   var(--wx-g-purple) 55%, var(--wx-g-coral))` clipped to text on the italic emphasis inside a
   display-register title. That is *structurally identical* to the Welcome hero's `em`, which is
   one of the trio's three licensed marketing uses. Keeping it is the faithful call; it is a
   declared deviation from "exactly one in-app use" and needs sign-off (§7.18).

**And the gradients that die for it — named, as required:**

| Gradient | Where | Becomes |
|---|---|---|
| `.hs-progress-track` default `#4285f4 → #9b72cb` (+ amber/red/green variants) | shared index chrome; Projects' progress cell | flat `#2f6bff`; the tone variants flat `--hsx-amber/-red/-green` |
| `.primary-button` `linear-gradient(180deg, #2e69ff, #2f6bff)` | `redesign.css`; the DelayIQs rail "Add DelayIQ", every legacy form submit | flat `#2f6bff` |
| `.dashboard-feed-empty`'s "soft vertical gradient" (`redesign.css:368`) | the shared feed panel's empty state | flat, dashed `rgba(28,28,26,0.13)` box |
| `.app-shell` `radial-gradient(1200px 460px at 80% -10%, rgba(21,104,201,0.05)) over linear-gradient(180deg, #eef3f9, #f5f6fe 44%)` | **the whole app ground** (`redesign.css`) | **flat `#f5f6fa`.** This is the "one ground" rule; today the app ground is a two-stop gradient with a blue bloom, which is the banding the Welcome Page explicitly forbids |

**Plus the pre-blue leftovers found while doing it** — four orange survivors in
`redesign.css`, on a product whose `--orange` token is literally defined as `#2f6bff`:

| Leftover | Value | Becomes |
|---|---|---|
| `--shadow-accent` | `0 10px 24px rgba(251,133,0,0.26)` | `0 4px 12px rgba(47,107,255,0.2)` |
| `--focus` | `rgba(251,133,0,0.3)` | folded into `--bf-focus-ring` |
| `::selection` | `rgba(251,133,0,0.22)` | `rgba(47,107,255,0.16)` |
| `.primary-button:hover` box-shadow | `0 14px 30px rgba(251,133,0,.36)` + `filter: brightness(1.04)` | `0 8px 22px rgba(47,107,255,0.28)`, no filter |
| `.kpi-card-button` hover border | `rgba(251,133,0,0.34)` | `rgba(47,107,255,0.28)` |
| `.search-box:focus-within` | border `rgba(251,133,0,0.55)` + 4px `var(--focus)` | `#2f6bff` + `var(--bf-focus-ring)` |
| `.panel-note` border | `rgba(247,181,0,0.28)` | `rgba(28,28,26,0.13)` |

### 2.7 The focus ring, which is currently orange **and** beaten

`redesign.css` sets the global ring as
`:where(a, button, input, select, textarea, [tabindex]):focus-visible { outline: 3px solid var(--focus) }`.
Two problems, both verified:
1. `--focus` is `rgba(251,133,0,0.3)` — orange.
2. `:where()` is **zero specificity**, so any authored rule beats it. `styles.css` alone has 36
   `outline: 0` / `outline: none` declarations and 20+ authored `:focus-visible` rules that set
   `outline: 0`. The concrete failure in this cluster:
   `.form-stack input, .form-stack select, .form-stack textarea { outline: 0 }`
   (`styles.css:12407`) has specificity `0,1,1` and beats the `0,1,0` ring — so **every field in
   the shared form language, including the "Log DelayIQ" form inside the shared index rail, has
   no focus indicator at all.** And `:where()` is unreliable in jsdom (documented in this repo),
   so no test can see it either way.

Fix, in the new sheet: `.bf-shell :is(a, button, input, select, textarea, [tabindex]):focus-visible
{ outline: 0; box-shadow: var(--bf-focus-ring) }` — `:is()` carries the specificity of its most
specific argument, so with the `.bf-shell` prefix it is `0,2,0` and beats the 36 `outline: 0`
rules without `!important`. **`:is()` and not `:where()`, deliberately.** Plus an explicit
re-declaration on `.bf-shell .form-stack :is(input, select, textarea):focus-visible` so the
one proven failure is fixed by name as well as by cascade.

### 2.8 Two new test files (grafted, and both worth having here)

**`client/src/tests/density.test.ts`** — reads the new stylesheet raw with the `?raw` glob that
`schedule/boundary.test.ts` already uses (`import.meta.glob('/src/**/*.{css,ts,tsx}', { query: '?raw' })`),
parses `app-shell-daylight.css`, and **fails the build** if:
- any `font-size` literal appears that is not one of the `--bf-app-*` values;
- any `border-radius` literal appears outside `999 / 26 / 20 / 18 / 12 / 8 / 50%`;
- any `box-shadow` appears outside the seven ladder steps plus the focus ring;
- any `cubic-bezier` appears other than the two sanctioned curves;
- any selector **renames** rather than prefixes an existing one (a selector in the new file whose
  final compound does not appear in the pre-change sheets);
- `backdrop-filter` appears on any selector other than `.hs-shell.bf-shell .topbar.hs-topbar`;
- `:where(` appears at all.

Colour, radius, shadow, easing, hover and reveals are **mechanically unable** to be re-scoped.
This is the only mechanism in the plan that makes fidelity drift a build failure rather than a
review comment.

**`client/src/tests/shell-nav.test.tsx`** — three guards this cluster owns:
- a hub sub-page is reachable **by click alone**, with no `mouseOver` (today 13 of 21 pages have
  no navigation path on touch; Companies and Deals are two of them);
- with `matchMedia` stubbed to ≤560px, **Create new / Bookmarks / Settings / Help are all still
  reachable** (today all four are `display: none` there, so a phone user cannot open the star
  menu or start the tutorial);
- a locked row still **prompts** instead of navigating (`tests/map.test.tsx:103` covers Map;
  this adds the flyout-star and `.bm-tile` paths, which no test touches).

Plus `useShellBreakpoint()` **defaulting to `false` when `matchMedia` is absent, with the reason
commented** — every media-gated component needs that exact shape.

### 2.9 The invariant comments to paste into `App.tsx`

Two blocks, above the rail slot and above the Sales page roots. The first is the trap that would
cost the most and it is currently undocumented in the source:

```tsx
/* INVARIANT — DO NOT MOVE (30 openAppPage call sites + 3 openSchedule depend on it):
   onMouseEnter lives on the ROW WRAPPER (.hs-rail-slot), not the header <button>, and it is
   onMouseEnter, never onPointerEnter. React delegates mouseenter from mouseover and the harness
   fires fireEvent.mouseOver(hubButton). Moving it to the button, or to a pointer event, opens
   nothing under test and breaks nearly every test at once.
   Sub-items keep role="menuitem": downgrading them to plain buttons makes
   getByRole("button", {name: /^Schedule/}) ambiguous against the hub button.
   .hs-flyout-star is a SIBLING of the menuitem, not a child — that is what keeps the
   menuitem's accessible name equal to the page label. */
```

```tsx
/* INVARIANT — .hs-kpis and .hs-index-main carry data-reveal, and hs-contacts.css:47-54 gives
   them opacity:0 as their REST state. Their className must stay a static string literal.
   A computed className wipes the .in class useHudMotion adds imperatively, and the whole
   Contacts / Companies / Deals page renders invisible with no error. */
```

### 2.10 Accent budget, expressed as a count and actually enforced

**Rule: one blue element per surface, and at most one named non-blue accent per surface.**

| Surface | Today | After | Count |
|---|---|---|---|
| Top bar | `#2f6bff` (active states, count badge) + gold `#f0b354` star + the trio on the sparkle | one blue (badge/active) + the sparkle's licensed trio | 2 hues → 1 + the licensed trio |
| Rail | `#2f6bff` active + `#2f6bff` NEW dot + `#a78bfa` BETA dot | one blue (the `.active` hub; the NEW dot goes `#fff` when its hub is active, so it never doubles the blue) + one violet `#6d28d9` for BETA | 3 → 2, named |
| Sales flyout | blue NEW + violet BETA ×2 + violet upgrade arrow + gold star | `#2f6bff` NEW on `rgba(47,107,255,0.10)`, `#6d28d9` BETA on `rgba(109,40,217,0.10)`, upgrade arrow `#2f6bff`, star `#2f6bff` | 3 → 2, named |
| Bookmarks page | blue tile icons + gold star + `rgba(240,179,84,0.55)` starred border | blue tile icons + blue filled star; the amber tile border → `rgba(47,107,255,0.24)` | 2 → 1 |
| Index page | blue accents + 8 badge tones + 6 KPI icon tones | unchanged — status tones are **data**, not accent | n/a |

**The honest part editorial skipped:** "one accent, full stop" is not reachable without deleting
the NEW-vs-BETA distinction, which the brief forbids. So the budget is stated as *one blue plus
one named non-blue per surface*, which is countable, enforceable, and a real reduction from three
hues to two in the rail and from two to one in the top bar and on the Bookmarks page. The gold
star retires in **all three** of its sites (top-bar trigger `#f0b354`, flyout star `#e8a33d`,
`.bm-tile-star.is-on` `#e8a33d` + the amber tile border) — the filled-vs-outline distinction that
actually carries the information is untouched.

### 2.11 The light-chrome hairline, decided rather than asserted

All four concepts treat the light-chrome flip as pure gain. It is not: a light bar on a light
ground deletes the app's only strong "I am inside the workspace" colour anchor, leaving one
`rgba(28,28,26,0.07)` hairline and a `blur(14px)` to carry the whole state distinction.

**Decision for this cluster's surfaces:** the top bar keeps `rgba(245,246,250,0.82)` + blur, but
its bottom border steps **up** one rung to `rgba(28,28,26,0.13)` (the strong hairline, not the
soft one), and the rail's right border does the same. `#f5f6fa` chrome against `#f5f6fa` ground
with a 7%-alpha line is not reliably visible; with a 13%-alpha line it is. **Verified on an
uncalibrated monitor before merge, not asserted** — that check is in the acceptance list (§9).

---

## 3. Screen-by-screen: Sales hub (11)

### S-0. Contacts index

**Today.** `<div className="page-stack contacts-page hs-index">`: a 5-tile KPI strip, then one
white 14px-radius index card holding the title + actions, a 5-tab saved-view strip, a
search/filter/sort toolbar, 4 quick-filter selects, a 10-column checkbox table inside its own
bordered wrap, and a count/pagination/export footer.

**Becomes.** Same three blocks, one ground, no double frames.
- **Frame:** the page ground goes flat `#f5f6fa` (it inherits the retired `.app-shell` gradient
  today). Gutters `var(--bf-app-gutter-y) var(--bf-app-gutter-x)` → 28/32px at 1440, 18/18 at
  480; **`padding-bottom: var(--bf-app-tail)` = 72px**. The negative-margin ground trick
  (`margin: -22px -28px -34px; padding: 22px 28px 34px; min-height: calc(100% + 56px)`) is
  re-expressed against the same tokens so it stops silently misaligning when shell padding moves.
- **KPI strip:** `.hs-kpis` gap `12px → 14px`; each `.hs-kpi` **loses its border and shadow**,
  keeps `#fff` at radius 18px. `.hs-kpi-label` → the eyebrow (`11.5px/650/0.045em` uppercase
  `#8a877e`). `.hs-kpi-value` → `var(--bf-app-figure)` = `clamp(20px,1.6vw,26px)` / 700 /
  `-0.02em` / `tabular-nums`. `.hs-kpi-ico` chip 34×34 at radius 12px, six tones kept, re-based
  onto the `--hsx-*-soft` fills. The five-column grid and its own breakpoints (980px → 3 cols,
  720px → 2) are unchanged. Wrapped in `SpotlightSurface`.
- **Index card:** border `rgba(28,28,26,0.07)`, radius **18px**, `0 10px 30px rgba(28,28,26,0.05)`,
  padding `20px 22px 18px`, **`overflow: hidden`** so the table clips to the corners.
  `gap: var(--bf-rhythm-dense)` (20–34px) between the strip and the card, replacing the flat
  16px. Wrapped in `SpotlightSurface`.
- **Head:** `h1#contacts-index-title` → `var(--bf-app-title)` = `clamp(22px,1.9vw,26px)` / 600 /
  `-0.02em` / `1.14`, colour `#1c1c1a` (off `--hsx-ink #14203a`, the third ink). Its chevron
  button 26px at radius 12px (was 6px). The `New` pill: `11px/700` uppercase, 999px, `#2f6bff`.
  Head margin `0 0 12px`.
- **Saved views:** `.hs-view` `13.5px/600`, per-tab lucide icon at 15px `#8a877e` → `#2f6bff`
  when active, 2px bottom border `transparent → #2f6bff`, `.hs-view-count` 999px pill
  `rgba(28,28,26,0.07) → rgba(47,107,255,0.10)/#2f6bff` when active. Strip stays
  `overflow-x: auto`.
- **Toolbar:** `.hs-search` **keeps its 999px outline** (the one licensed pill boundary),
  `min-width: 280px`, 36px, `:focus-within` → `#2f6bff` + `var(--bf-focus-ring)` (replacing the
  3px `rgba(47,107,255,0.14)` ring). `.hs-chip` pills 999px, `.active` →
  `rgba(47,107,255,0.08)`/`#2f6bff`. `.hs-toolbar-right` count → `var(--bf-app-meta)` `#575550`.
- **Quick filters:** `.hs-qf` borderless select pills unchanged in structure; `.is-set` keeps its
  blue label (it is the only cue for which filters are on, alongside `Filter · N`).
- **Table:** row height **46px frozen**, `thead` **42px frozen**, `min-width: 720px` frozen,
  `.hs-table-wrap` keeps `overflow-x: auto` but **loses its 1px border and 10px radius**.
  `thead th` → transparent fill + the eyebrow (§1.2), bottom border `rgba(28,28,26,0.13)`,
  `position: sticky; top: 0` kept. `td` → `13px/500/1.45`, bottom border
  `rgba(28,28,26,0.07)`; `.hs-row-name .hs-link` → `13.5px/600`; `.hs-row-sub` →
  `var(--bf-app-meta)` `#8a877e` at 340px ellipsis. `tbody tr:hover` `#f6f8fc →
  rgba(28,28,26,0.035)` over `0.18s var(--bf-ease)` **and the trailing action cluster slides 3px**
  (move 3). `tr.is-selected` `#f2f6ff → rgba(47,107,255,0.06)` — noting it doubles as "the
  workspace's currently selected project" on Projects, so the tone stays a wash, not a border.
  Sort chevron keeps `#2f6bff`.
- **Footer:** `.hs-count-pill` 999px, `.hs-page-btn` 999px with `aria-current="page"` →
  `rgba(47,107,255,0.10)`/`#2f6bff`; `.hs-perpage` as a `.hs-qf`; Export as `.hs-btn`.
- **Boundary count: 8 → 2** (§2.4).

**Every information item placed (22/22).**
1–5. The five KPI tiles (Total contacts / New this month / Open leads / Customers / Unassigned)
→ the borderless figure tiles: eyebrow label, tabular figure, 12px-radius tone chip. Values,
icons and tones unchanged.
6. Title `Contacts` + `data-tutorial-id=contacts-page-title` + the blue `New` pill → the card
head at `var(--bf-app-title)`; pill 999px `11px/700`.
7. The five saved-view counts → `.hs-view-count` pills, values unchanged.
8. Toolbar `<filtered> of <total>` → `.hs-toolbar-right`, `12px` `#575550`.
9. `Filter` + ` · N` → the Filter chip's label; `.is-set` blue on the affected `.hs-qf`s carries
the same information a second way.
10. `Sort by <sortLabel>` (7 mappings) → the Sort chip's label, unchanged strings.
11. Row avatar, 2-letter initials, hash-toned blue/green/violet/amber/teal → `.hs-avatar` 30px
`50%`, all five tones kept (`tone-blue`/`tone-teal` live only under `.contacts-page` — see §2.1).
12. Row name sub-line (interest → source → `leadLifecycle`, all 5 fallback strings) →
`.hs-row-sub` `12px` `#8a877e`.
13. Row email `mailto:` + `title 'Email <name>'` → `.hs-link.hs-link-plain`, non-bold variant
kept, slide 3px on hover.
14. Row phone `tel:` + `title 'Call <name>'` or `--` → same.
15. Row sales rep or the muted `No owner` → `.hs-cell-none` (scoped to `.contacts-page`).
16. Row company or `--` → `.hs-cell-muted`.
17. Row last activity relative label + the full `formatDateTime` **in the `title` attribute**
(the exact timestamp exists nowhere else) → unchanged cell, `title` preserved verbatim.
18. Row lead-status badge, 6 tones → `.hs-badge` 999px `11px/700` with its 6px `currentColor`
dot; `tone-teal`/`tone-slate` kept.
19. Row lead-created `formatDate` (`Sep 7, 2026`) → `.hs-cell-muted`.
20. Footer count pill `<N> contact/contacts` + ` · N selected` → `.hs-count-pill`.
21. Footer `Refreshed <time>` → `.hs-foot-right` meta, `12px` `#575550`.
22. Pagination: every page number (no truncation), Prev / Next, `aria-current="page"` → 999px
`.hs-page-btn`s. **The unbounded footer row is preserved as-is** — truncation would be a
behaviour change (§7.20).

Plus, from the completeness audit: the 5 saved-view tab **icons** (ContactRound / Users /
ListTodo / Handshake / CheckCircle2) → 15px, `#8a877e` → `#2f6bff` when active. The default sort
(`created`/`desc`) that decides whether the Sort chip renders `.active` → unchanged logic.
`.hs-qf.is-set`'s blue → kept. The `Filter` chip's two `title` strings (`Clear filters` /
`Use the filters below` — the only place the chip's no-op is explained) → kept verbatim. The
`--` vs `—` placeholder inconsistency → **preserved per page** (§7.21).

**Every action placed (26/26).**
1. Refresh (RotateCcw, `title 'Refresh contacts'`) → `.hs-btn-icon` 30px radius 12px, press
`scale(0.94)`.
2–3. Export ×2 (header Upload, footer Download) → `.hs-btn` / `.hs-btn-icon`, both invert on
hover. Both still export the **filtered** list to `buildflow-contacts.csv` with its 11 columns
(incl. Source and Deal value, which appear in no table column).
4. `Create contact` + `data-tutorial-id=contact-add-button` → `.hs-btn-primary` 999px `13px/600`
`padding 8px 16px`, `#2f6bff`, `0 4px 12px rgba(47,107,255,0.2)`, hover `#1f57e0` +
`0 8px 22px rgba(47,107,255,0.28)`. **Stays blue** — `#2f6bff` is already the action colour in
all eleven app scopes and inverting it to the Welcome Page's ink pill would re-teach the product
for doctrine. Declared deviation.
5. Title chevron, `aria-label 'Show all contacts'` + `title 'All contacts'` → 26px radius 12px.
6. 5 saved-view tabs (`role=tablist aria-label 'Contact views'`, `role=tab`, `aria-selected`) →
restyled only; they still reset to page 1 and still **do not** clear the quick filters.
7. Search input, `aria-label 'Search contacts'`, placeholder `Search name, email, phone, company`
→ inside the pill; label and placeholder verbatim.
8. Filter chip → `clearContactFilters()`; both `title`s kept.
9. Sort chip → toggles direction; chevron rotates 180° inline.
10. 7 sortable column headers → `thead th button` at the eyebrow size; `.sorted` full-opacity
blue chevron. **No `aria-sort` is added** — that would be a behaviour change, and it is logged in
§7.22 as a proposed a11y fix needing approval.
11–12. Header checkbox `aria-label 'Select all contacts on this page'` and per-row
`Select <name>` → 16px, `accent-color: #2f6bff`, `.hs-cell-check` 44px.
13. Row name link `aria-label 'Open <name>'` → `.hs-link`, slide on hover.
14–16. The three hover-reveal row actions — Call (Phone, only with a phone), Text
(MessageSquareText, only with a phone), Edit (Pencil, `.edit`) → `.hs-cell-actions.three`
(styled only under `.contacts-page`), `opacity 0 → 1` over `0.18s var(--bf-ease)` on
`tr:hover` **and `:focus-visible`**, with `@media (hover: none)` still pinning them visible.
**Plus the EDITORIAL graft: below 1024px they are pinned at `opacity: 0.55` instead of 0**, so a
tablet user can see that actions exist. And a fix worth taking while here: the default
`.hs-row-action` hover tint is destructive **red**, so Contacts' Call and Text buttons hover like
a delete control; they get `.edit`'s blue tint (`hs-index.css:802-810`), leaving red for actual
destructive actions.
17. Row email / phone anchors → `mailto:` / `tel:`, unchanged.
18–21. The four quick-filter selects (Sales rep / Create date incl. its unique `Today` option /
Last activity / Lead status), `aria-label 'Filter contacts by <facet>'` → `.hs-qf`; every option
string and every `aria-label` verbatim. **Contacts' `Today` option is deliberately not
normalised** to match Companies/Deals (§7.21).
22. `Advanced filters` / `Clear filters` link (`.hs-qf-link`) → `13px/600` `#2f6bff`, icon slides
3px.
23. Pagination Prev / numbers / Next → as above.
24. Per-page select (10/25/50/100, `aria-label 'Contacts per page'`, options read `10 per page` …)
→ `.hs-qf.hs-perpage`.
25. Reacts to the top-bar `Create new → Contact` `createSignal` nonce → unchanged; **including
the never-cleared-nonce re-entry behaviour**, which is preserved rather than "fixed" (§7.23).
26. Reacts to `openRecordRequest` from Companies/Deals → unchanged.

**States.**
- *Empty (zero contacts):* `.hs-empty` → 28px `#8a877e` glyph, title `15px/700` `#1c1c1a`, body
  `13px` `#8a877e` at `min(62ch, 100%)`, 44px vertical padding, **no frame** (the card is the
  frame). Copy verbatim: `No contacts yet` / `Create your first contact, or import a list, to
  start working leads.`
- *No match:* `No contacts match that view` / `Try another view, or search by name, email, phone,
  company or sales rep.` — and the footer (count, pagination, per-page, Export) **still renders
  below it**, as today.
- *Loading:* `Loading contacts…` + the ContactRound glyph in the same `.hs-empty` block. **No
  skeleton is added.** A skeleton here would need row-count assumptions the page does not have,
  and `.hs-empty` is already the honest answer.
- *Error:* `Contacts could not be loaded` + the server message at 62ch + a `Try again` `.hs-btn`
  with RotateCcw that **inverts** on hover. Note the fallback copy differs from the shared hook's
  (`Contacts could not be loaded.` vs `Sales data could not be loaded.`) because Contacts
  duplicates `useSalesData` inline — **not unified during a visual pass** (§7.24).
- *Add-on lock:* none. Contacts is not in `ADD_ON_PAGE_LOCKS`.
- *What's-new spotlight:* `contacts-page-title` is a live `UPDATE_ENTRIES` v3.7 spotlight target.
  `.hs-upd-spotlight` keeps its 3px `#2f6bff` outline at 6px offset, 12px radius, `hs-upd-pulse
  1.1s ×3`, 4200ms, reduced-motion guarded. **Nothing new may become an ancestor of this `h1`
  with a transform** — which is why `SpotlightSurface` uses a `::before` and no transform.

**Motion.** Hover moves: **3** (slide) on the name link, the action cluster and the
`Advanced filters` link; **2** (invert) on Export / Try again; **4**'s dense substitute
(`SpotlightSurface`) on the strip and the card. **No lift** — neither the strip nor the card is
licensed. Reveals: **2** (`.hs-kpis`, `.hs-index-main`) at 12px / 0.55s. Retired: the 5-tile
`hsc-rise` stagger and the per-row `hsc-row-in` (§2.5). Skeleton: none — `.hs-empty` stands in.

**Tests touched.** `testAnchors` records **no test file covers the Sales hub**. But this screen
shares `hs-index.css` with the five pages that *are* covered, so the real exposure is
`tests/index-pages.test.tsx` (12 tests): `findIndexCard()` does
`getByRole('heading', {level:1, name:/^<Page>/}).closest('section')` — **the `h1` stays an `h1`,
stays inside `<section class="hs-index-card">`, and stays un-prefixed.** Every pinned ARIA string
(`Project views`, `Edit <record>`, `Select <record>`, `Search projects`,
`Filter projects by schedule health`, `No projects found`, and the KPI labels `Active Projects` /
`Total Equipment` / `Total Materials` / `Ready Now`) is untouched. **All 12 keep passing
unchanged.** `data-tutorial-id="contacts-page-title"` / `"contact-add-button"` /
`"contact-dialog"` all survive; the v3.7 spotlight path is exercised by hand (§9).

---

### S-1. Contact record drawer (`ContactRecordPanel`)

**Today.** A 600px right-hand drawer portalled to body over a navy blurred scrim: a top bar, an
avatar + `h2` header with meta links and tags, a 6-tile action row, a notice banner, three
bordered highlight tiles, a two-column property `dl`, a filterable month-grouped timeline, and
four bordered association cards. Focus-trapped by `useModalDialog`.

**Becomes.** The same drawer, with **seven inner frames replaced by the hairline-and-eyebrow
grammar the file already uses for its sections**.
- **Frame:** `.hs-record` `width: min(600px, 100%)`, flush right, radius **18px on its left
  corners only**, shadow → `0 24px 70px rgba(28,28,26,0.14)` (off the navy-tinted
  `-24px 0 60px rgba(20,32,58,0.22)`). `.hs-record-backdrop` → flat `rgba(28,28,26,0.28)`,
  **`backdrop-filter: blur(2px)` removed** (§2.6). Padding `16px 22px 28px` → `16px 22px 72px`
  (the free tail).
- **Header:** avatar 44px `50%`, all tones kept. `h2` **stays 22px**, weight `700 → 600`,
  `-0.02em`. `.hs-record-sub` `13.5px` `#575550`. Meta links `13px` `#2f6bff`, slide 3px.
  Tags: status badge 999px + owner chip 999px.
- **Action row:** `role=group aria-label 'Contact actions'`, 6 tiles, `aria-pressed`; icon chip
  radius 12px, label `12px/600`; `.disabled` at `opacity .55` with its `title` intact.
  `@media (max-width: 640px)` still drops it to 3 columns.
- **Sections:** `.hs-record-section` padding `18px 0 6px → 22px 0 10px`, bottom hairline
  `rgba(28,28,26,0.07)` (already there), `:last-child` still borderless. Section `h3`
  `15px/700 → var(--bf-app-section)` = `16px/600/-0.01em`.
- **Highlights → a figure row.** `.hs-record-highlights > div` loses `1px solid` + `10px`; the
  three become a 3-up grid of eyebrow + `13.5px/650` value. Exactly the Welcome Page's proof
  figures, at the dense volume.
- **Properties:** `dt` → the canonical eyebrow; `dd` → `13px/500`; two columns, `.hs-record-prop-wide`
  spanning both, 640px → one column. All unchanged structurally.
- **Timeline:** month `h4` → the eyebrow. `.hs-timeline-ico` radius `10px → 12px`, all 7 tones
  kept (+ the orange and red variants the audit found). The 2px `::before` rail hidden on
  `:last-child` is kept — it is the one connector in the cluster and it is correct.
- **Association cards → sections.** The four `.hs-record-card`s lose `1px` + `10px` and become
  hairline-separated blocks with an eyebrow head and the same right-hand head button.
  `.hs-record-card:last-child { grid-column: 1 / -1 }` and `.hs-record-card-wide` keep their
  spans. `.hs-record-card-row` links slide 3px.
- **Composers:** `.hs-record-composer` **keeps its frame** — clause 1, dismissible. Border
  `rgba(28,28,26,0.07)`, radius `10px → 12px`, fill `#f5f6fa`, `hsc-rise` retimed to 0.3s on
  `var(--bf-ease)`. `:focus-within` on inputs → `var(--bf-focus-ring)`.
- **Notice:** `.hs-record-notice` → an ink pill treatment (radius 12px,
  `0 8px 22px rgba(28,28,26,0.2)`) for `tone-info`, tinted fills for success/error, body at 62ch.
- **Boundary count: 7 → 0 at rest, 1 with a composer open** (§2.4).

**Every information item placed (19/19).**
1. Back link `Contacts` (ArrowLeft) → `.hs-record-back`, slide 3px.
2. Avatar initials, hash tone → 44px `50%`.
3. `h2` = lead.name → 22px/600.
4. Sub-line (company or `No company`, + ` · interest`) → `.hs-record-sub`.
5. Header email/phone meta links → `.hs-record-meta`, `#2f6bff`. *(Audit note: on the Company
   drawer this whole row collapses when both are absent — preserved.)*
6. Status badge + owner chip → 999px pills.
7. Action-row labels Note / Email / Call / Text / Task / Meeting + the two `title`s for a
   phoneless contact → the 6 tiles.
8. **All 11 notice-copy variants** (note saved; email sent; email sent via the test inbox +
   `View the message`; email not configured → logged + "Open in Mail app"; call logged; text
   sent; texting not carrier-connected → Messages hand-off; task created; the meeting's
   5-part assembled string; copied phone) → the notice banner, **verbatim**. This copy carries
   real operational meaning (smtp vs ethereal vs log-only, carrier-connected vs hand-off);
   shortening it would make the app claim it sent something it did not. Plus the audit's
   additions: the meeting notice's `View the invitation` link label, the three notice icons
   (CheckCircle2 / AlertTriangle / Bell) and the trailing ` ↗` on every outbound link.
9. Highlights: Create date / Lifecycle stage / Last activity date → the 3-up figure row.
10. `About this contact` — all 14 `dt/dd` pairs plus the wide Notes row → the property list,
    eyebrow `dt`s. **Interest and Team size are display-only** (they arrive from marketing forms
    and exist in no dialog) — the redesign must not make the list look editable.
11. `Recent activities` head + search input + the type select whose first option reads
    `Activity (<visible>/<total>)` → `.hs-record-sec-head` with the eyebrow head and a
    `.hs-record-search` pill. *(The total always counts the synthetic `Created` item, so it is
    `activities.length + 1` — preserved.)*
12. Month `h4` headings (`September 2026`, Intl month+year) → the eyebrow.
13. Timeline item: 7 type labels, `<time>` `formatDateTime`, summary → `.hs-timeline-*`.
14. The always-present synthetic `Created` item → unchanged.
15. `Companies (0|1)` card → a section; avatar first letter, name (link or plain), sub-line
    (industry / `Primary company` / ` · domain` / ` · N people`).
16. `Deals (N)` card → a section; `$` avatar toned by stage, name link, `value · closes <date>`,
    the 7 stage **short** badges (Appointment / Qualified / Presentation / Decision maker /
    Contract sent / Won / Lost).
17. `Meetings (N)` card → a section; month/day date block, title,
    `<start datetime> – <end time>` + ` · location`, and the invitation line whose exact strings
    are `email` / `email and sms` / `sms` (from `notifiedVia.replace('+',' and ')`), hidden
    entirely when `none`. *(The audit's correction is honoured: the rendered label is
    `Meetings (N)`, not `Meetings (N upcoming)`; N is the upcoming count under the
    `endsAt >= now - 3600000ms` window.)*
18. `Tasks (N)` card → a section; checkbox + title, `.hs-task-pill` for Low/High only, assignee
    or `Unassigned`, ` · notes`, `<time>` due date, `.done` struck/faded. *(N is the **open**
    count while the list renders **all** tasks — including the state where the head says
    `Tasks (0)` and the body is full. Preserved as a documented quirk, §7.25.)*
19. SMS counter `<n> characters · <k> message/messages` with `.over` past 160 → `12px` meta,
    `.over` → `--hsx-red`.

Plus the audit's **12 composer head blocks**, which appear in no inventory list and are the
largest single omission: `New note` / *Saved to this contact's timeline for the whole team*;
`New email` / *Sent from BuildFlow and logged on the timeline*; `Call <first>` / *Dial from this
device, then log how it went*; `Text <first>` / *To <phone>*; `New task` / *Assigned to you ·
<name>*; `Schedule a meeting` / *<first> gets an invitation with a calendar file* (the only place
the app says an `.ics` is attached). → `.hs-record-composer-head`: `<strong>` at
`var(--bf-app-row-strong)`, `<small>` at `var(--bf-app-meta)` `#8a877e`, at 62ch. All twelve
strings verbatim. Plus the 5 composer placeholders, the 3 explanatory `title`s
(`Compose this email in your mail client instead`, `Send this text from Messages on this device
instead`, `Place the call with your phone or desk app`), and the 7-entry
`CONTACT_ACTIVITY_META` icon+tone key.

**Every action placed (19/19).**
1. Back / Close (X, both `aria-label` and `title`) / backdrop click / Escape → unchanged.
   **`useModalDialog`'s document-capture Escape handler with `stopPropagation` is untouched**, so
   Escape still closes the drawer even with a composer open and text typed. That loses an unsent
   draft; it is existing behaviour and changing it is a behaviour change (§7.26).
2. Lead-status select → the two-call sequence (`updateSalesLead` then `createSalesActivity` type
   `stage` with `Lead status changed from X to Y`) then reload; a failure of either surfaces as
   the page-level `Lead status could not be changed.` while the select has already moved.
   Unchanged.
3. Edit (Pencil) → the parent's edit dialog.
4. Delete (Trash2, `aria-label 'Delete contact'` + matching `title`) → the parent's confirm.
5. 6 action toggles (`aria-pressed`), clicking the active one collapses it, each clears the
   notice → unchanged.
6–11. The six composers, each with its full field set, its Cancel, its submit and its API call
(`createSalesActivity` / `POST …/email` / `…/calls` / `…/text` / `createSalesTask` /
`POST …/meetings` with the browser time zone) → unchanged. **Including the per-composer
validation the audit surfaced, which is stricter than the shared `busy` flag:** Save note needs
text; Send email needs **both** subject and body; Send text needs a body; Create task needs a
title **and** a due date; Schedule meeting needs title **and** date **and** time; Log call needs
nothing. Forms also submit on Enter through `onSubmit` with the same guards repeated.
12. Notice dismiss (X, `aria-label 'Dismiss'`); success/info auto-clear at 9s, errors persist.
13. Activity search (`aria-label 'Search activities'`, placeholder `Search activities`).
14. Activity type select (`aria-label 'Filter activities'`, 8 options).
15. `+ Schedule` / `+ Add` head buttons → open the meeting / task composer; slide 3px.
16. Task checkbox → `updateSalesTask({done})` then reload.
17. Company link → `onOpenRecord('companies', id)`.
18. Deal links → `onOpenRecord('deals', id)`.
19. Header and property-list `mailto:` / `tel:` anchors + the Call composer's `Copy` (clipboard)
and `Call now` (`tel:`), the email composer's `Open in Mail app` (`mailto:` with subject+body)
and the text composer's `Open in Messages` (`sms:` with body, plus the `window.location.href`
fallback when the server is not carrier-connected). **All plain anchors, unchanged** — any change
to how they render can break the un-configured-server path.

Plus the audit's action note: **initial focus is the back button, not a field.** `useModalDialog`
looks for `.pdx-form input, select, textarea`, which no drawer contains, so focus lands on
`focusables()[0]`. Preserved, and logged in §7.27 as a proposed fix.

**States.** *Empties (6):* the filtered-timeline line `No activities match that filter.` and the
four association-card lines, all at 62ch, plus the per-field `--` fallbacks (including the two
`--`s an unnamed contact renders for first/last name, and `Sales rep`'s `No owner` rather than
`--`). *Loading:* every composer's submit label swaps (`Saving…` / `Sending…` / `Logging…` /
`Creating…` / `Scheduling…`) and disables; one shared `busy` flag blocks a second action.
*Errors:* the 7 fallback strings + the meeting-invitation-failed tone + the clipboard fallback
`tone-info`. *Add-on lock:* none.

**Motion.** `hsc-fade` on the backdrop (0.2s, **no blur**), `hsc-slide-in` 0.32s
`translateX(40px) → 0` — already the signature curve, kept. `hsc-rise` on the opening composer
and the notice, retimed. **`hsc-rise` per timeline item is retired** (rows are never reveal
targets); the timeline is one section. Hover: **3** (slide) on back, meta links, card rows, head
buttons; **2** (invert) on Cancel; action tiles keep their chip transition. Skeleton: none — the
drawer only mounts once the record exists.

**Tests touched.** No automated test. The v3.7 what's-new copy is the only written contract
(`Call, text, email, note, task and meeting actions log straight to the contact's timeline.`) and
all six actions survive. **This is one of three surfaces in the cluster with zero coverage**
(with the star menu and the Bookmarks page) and it is walked by hand against the 19 + 12
information items and 19 actions above (§9).

---

### S-2. Create / Edit Contact dialog

**Today.** The shared `.pdx` system portalled to body (`crew-dialog-backdrop pdx` /
`pdx-dialog pdx-crew pdx-contact`), focus-trapped, focus on the first field. A pulsing-dot
eyebrow, a **Palatino** title at `clamp(28px, 3.4vw, 42px)` whose `em` is gradient-clipped, sub-copy,
a two-column form, and two blurred aurora blobs behind the header.

**Becomes. This is the cluster's one display-register surface** (§0.2).
- **Frame:** `.pdx-dialog` radius **26px** (the stage rung), `0 34px 64px rgba(28,28,26,0.13)`,
  border `rgba(28,28,26,0.07)`, fill `#fff`. Backdrop flat, no `backdrop-filter`.
- **Title:** `font-family: var(--wx-serif)` **deleted** → the Inter stack, per decision #4.
  Size `clamp(28px,3.4vw,42px)` → **`var(--bf-app-display)` = `clamp(28px, 3.2vw, 38px)`**,
  weight 500 kept, `-0.015em` kept, `1.06` kept. `em` keeps `font-style: italic` and keeps its
  trio gradient — which is now *more* faithful, because the Welcome Page's display accent is
  "`font-style: italic` on `em`, not a second family". 38px is exactly the Welcome Page's display
  floor: **the two ladders meet at this one rung.**
- **Eyebrow:** `Contact` + the pulsing dot → the canonical eyebrow (`11.5px/650/0.045em`).
  `pdx-pulse 2.6s infinite` keeps its name and its reduced-motion null.
- **Sub-copy:** `var(--bf-app-lede)` = 14px `#575550` at 62ch.
- **Form:** `.pdx-form` **name frozen** — `useModalDialog` finds the first field via
  `.pdx-form input, select, textarea`, and renaming it silently breaks initial focus in every
  dialog in the app. Labels → the canonical eyebrow; inputs `13px/500`, radius 8px, border
  `rgba(28,28,26,0.13)`, `:focus-visible` → `var(--bf-focus-ring)`. Two columns, Notes spanning
  both, 640px → one column.
- **Aurora blobs:** the two `filter: blur(44px)` radial spans stay. They are **siblings** of the
  `data-tutorial-id="contact-dialog"` node, not ancestors, so the containing-block rule is not
  violated — and nothing new may be added above it (§2.6).

**Every information item placed (6/6).** 1. Eyebrow `Contact` + dot → the eyebrow.
2. Title `Create <em>Contact</em>` / `Edit <em>Contact</em>` → the display title, italic
gradient `em`. 3–4. Both sub-copy strings → the lede. 5. All 10 field labels → eyebrow labels.
6. All 6 placeholders → `#8a877e`. Plus the audit's addition: the **resting** submit labels
`Create Contact` / `Save Contact`.

**Every action placed (5/5).** 1. Close X (`aria-label 'Close Create Contact'` /
`'Close Edit Contact'`) → `.hs-btn-icon` radius 12px. 2. Cancel (`.pdx-cancel`) → outline pill
that **inverts**. 3. Submit (`.pdx-save`) → blue pill, disabled until first name is non-empty and
email > 2 chars, or while saving. 4. Escape. 5. Tab wraps at both ends. All unchanged.

Plus the audit's action: **`openEdit`'s silent value coercion** — a lead Source outside
`LEAD_SOURCES` falls back to `Other`, so opening Edit and saving can change a value the user
never touched. Preserved (it is logic), flagged in §7.28.

**States.** No empty. *Loading:* submit → `Creating Contact` / `Saving Contact`, disabled.
*Error:* `<p className="form-error contact-form-wide" role="alert">` with the server message or
`Contact could not be saved.` → `13px` `--hsx-red` on a `rgba(197,34,31,0.08)` fill, radius 12px,
at 62ch. *Add-on lock:* none.

**Motion.** `pdx-backdrop-in` 0.32s, `pdx-dialog-in` 0.52s on `var(--pdx-ease)` → re-pointed at
`var(--bf-ease)`, `pdx-field-in` staggered on the fields at the reveal arithmetic (12px / 0.55s /
50ms), `pdx-pulse` 2.6s infinite. **All four keep their names** — `project-dialog-redesign.css`'s
reduced-motion block nulls them by name. Hover: **2** (invert) on Cancel.

**Tests touched.** `data-tutorial-id="contact-dialog"` is the only anchor and it survives.
`tests/index-pages.test.tsx` asserts the **Crew** and **Equipment** dialogs by name
(`Edit Crew`, `Crew Name`, `Foreman`, `Count for role 1`, `Save Crew`, `Remove Equipment`,
`/^Correct this report/`, `Save changes`) — all of which render through this same `.pdx` system.
**No accessible name changes, so all keep passing.** But the serif deletion changes the rendered
typeface on those dialogs too, which is why §7.1 needs sign-off before this ships.

---

### S-3. Delete Contact confirm

**Today.** The `.pdx-confirm` variant, opened from the drawer's trash button.

**Becomes.** Radius 26px, stage shadow, the same display title at `var(--bf-app-display)` with
the italic gradient `em` around the contact's name, eyebrow, body at 62ch.

**Information (3/3).** 1. Eyebrow `Remove contact`. 2. Title `Delete <em><name></em>?`.
3. Body `This removes the contact and its activity history for everyone in sales. This cannot be
undone.` — verbatim, at 62ch.

**Actions (4/4).** 1. Close X. 2. `Keep contact` (`.pdx-cancel`) → outline pill, **inverts**.
3. `Delete contact` (`.pdx-save.pdx-danger`) → a **red** pill, `--hsx-red #c5221f`, 999px,
`0 4px 12px rgba(197,34,31,0.2)`. Red is data here (destruction), not accent, so it does not
count against the accent budget. 4. Escape.

**States.** *Loading:* `Deleting…`, disabled. *Error:* `form-error role=alert` —
`Contact could not be deleted.` or the server message. No empty, no lock.

**Motion.** The same four `pdx-*` keyframes. Hover: **2** on Keep contact.

**Tests touched.** None (`testAnchors: none`). `tests/index-pages.test.tsx` asserts the sibling
confirms (`/^Delete crew/`, `Confirm delete <name>`, `Remove Equipment`) through the same CSS —
unchanged names, keeps passing.

---

### S-4. Companies index

**Today.** `page-stack contacts-page companies-page hs-index` — the same index card, but every
row is a rollup (its contacts by name match, its deals by `companyId`, open count/value, won
value, newest activity across the company and its people). A violet `Beta` pill.

**Becomes.** Identical treatment to S-0 — same frame, same borderless KPI figures, same
transparent-eyebrow `thead`, same table-wrap collapse, same 72px tail, same
`SpotlightSurface` wrapping, same boundary count **8 → 2**. Two differences:
- The `Beta` pill: `#7c3aed → #6d28d9` (the `--hsx-violet` that already exists in the token
  block), `11px/700` uppercase on 999px. This is the page's **one named non-blue accent**
  (§2.10); the primary button is the page's one blue.
- 12 columns rather than 10, so `min-width: 720px` + `overflow-x: auto` matter more; the card's
  `overflow: hidden` clips the scroll to the 18px corners.

**Every information item placed (17/17).**
1–5. The five KPIs (Total companies / New this month / With open deals / Customers / Open
pipeline) → borderless figure tiles; icons and tones unchanged.
6. `h1#companies-index-title` + `data-tutorial-id=companies-page-title` + the violet `Beta` →
the card head.
7. The five saved-view counts → `.hs-view-count` pills.
8. `<filtered> of <total>` → `.hs-toolbar-right`.
9. `Sort by <7 keys>` → the Sort chip.
10. Row avatar = first letter, hash-toned → `.hs-avatar` 30px.
11. Row name sub-line = industry or the literal `Company` → `.hs-row-sub`.
12. Row domain as an external `https://<domain>` link (`target=_blank rel=noreferrer`) or `--` →
`.hs-link.hs-link-plain`, slide 3px.
13. Row open-deals `<count> · <currency>` or `--` → `.hs-cell-muted`.
14. Row contacts count, right-aligned → `.hs-cell-num`, `tabular-nums`.
15. Row last-activity relative label + `formatDateTime` `title` → unchanged.
16. Footer `<N> company/companies` + ` · N selected` → `.hs-count-pill`.
17. Footer `Refreshed <time>` → the footer meta.

Plus the audit: the 5 tab icons (Building2 / Users / ListTodo / Handshake / CheckCircle2), the
tablist name `Company views`, the default sort `name`/`asc`, and the CSV's 13 columns (which
split `Open amount` and `Won amount` apart, unlike the `N · $X` cell).

**Every action placed (21/21).** Refresh (`title 'Refresh companies'`); Export ×2 →
`buildflow-companies.csv`; `Create company` + `data-tutorial-id=company-add-button`; title
chevron (`aria-label 'Show all companies'`, `title 'All companies'`); the 5 saved-view tabs;
Search (`aria-label 'Search companies'`, placeholder `Search name, domain, industry, city,
contact`, matching 8 fields incl. every associated contact name); Filter chip → `clearFilters()`;
Sort chip; 7 sortable headers; header + row checkboxes (`Select all companies on this page` /
`Select <name>`); row name link → the drawer; the **two** hover-reveal actions Edit / Delete
(`.hs-cell-actions.two`, `title 'Edit company'` / `'Delete company'`) — same reveal treatment,
same 1024px `opacity: 0.55` graft, red kept for Delete and blue for Edit; row domain (new tab)
and phone (`tel:`); the four quick filters (`Filter companies by owner` / `…by industry` /
`…by create date` / `…by last activity`, the industry union of `COMPANY_INDUSTRIES` + everything
in the data); `Advanced filters` / `Clear filters`; pagination + per-page (`Companies per page`);
`createSignal` and `openRecordRequest`. All restyled, none renamed.

**States.** The four `.hs-empty` variants verbatim (`Loading companies…`; `No companies yet` /
`Create your first company, or add contacts with a company name.`; `No companies match that
view` / `Try another view, or search by name, domain, industry or city.`; `Companies could not be
loaded` + error + `Try again`); the two dialog busy labels; the three error channels — including
`useSalesData`'s different fallback `Sales data could not be loaded.` No add-on lock.
`companies-page-title` is **not** a live tutorial or spotlight target (audit-confirmed), so it is
a dead hook — kept anyway, because a future update entry may point at it.

**Motion.** As S-0: reveals 2, hover moves 3 / 2 / spotlight, per-tile and per-row animations
retired.

**Tests touched.** No test. Same `hs-index.css` blast radius as S-0 →
`tests/index-pages.test.tsx` (12) keeps passing unchanged.

---

### S-5. Company record drawer (`CompanyRecordPanel`)

**Today.** A read-only drawer (no composers): identity, three bordered highlights, a property
list, two bordered association cards (its people, its deals), and up to 12 merged activities.

**Becomes.** Same treatment as S-1 — flat scrim, floating-panel shadow, 18px left corners,
`h2` 22px/600, hairline sections with eyebrow heads, **5 inner frames → 0**, 72px tail. No
composer, so there is never a licensed inner boundary here.

**Every information item placed (10/10).** 1. Back link `Companies`. 2. First-letter avatar +
`h2`. 3. Sub-line = industry or `Company` + ` · City, ST`. 4. Meta links: domain (Globe → new
tab) and phone (`tel:`) — **and the whole `.hs-record-meta` row collapses when both are absent**,
losing a line rather than printing `--`; preserved. 5. Tags: a green `Customer` badge when
`wonAmount > 0`, a blue `<N> open deal/deals` badge, the owner chip. 6. Highlights: Create date /
Open pipeline / Last activity date → the 3-up figure row. 7. `About this company` — all 12 pairs
+ the wide Notes row → the eyebrow `dl`. 8. `Contacts (N)` → a hairline section: initials avatar,
name link, `email · phone`, status badge. 9. `Deals (N)` → a hairline section: `$` avatar toned by
stage, name link, `amount · closes <date> · <contact>`, stage short badge. 10. `Recent
activities` — up to 12 across the company's contacts, each `<type> · <contact name>` + timestamp
+ summary → the timeline.

**Every action placed (6/6).** Back / Close X / backdrop / Escape; Edit (Pencil); Delete
(Trash2, `aria-label 'Delete company'` + `title`); contact links → `onOpenRecord('contacts', id)`;
deal links → `onOpenRecord('deals', id)`; domain (new tab) and phone (`tel:`). Unchanged.

**States.** The four empties verbatim (`See the people associated with this company.`;
`Track the revenue opportunities associated with this company.`; `Activity on this company's
contacts shows up here.`; per-field `--`), at 62ch. No loading of its own (it mounts only once
the rollup exists). No error of its own — edit/delete errors surface in the parent dialogs. No
lock.

**Motion.** `hsc-fade` (no blur) + `hsc-slide-in`; per-timeline-item `hsc-rise` retired; the
640px collapse kept. Hover: **3** on back, links and card rows.

**Tests touched.** None. Hand-walked (§9).

---

### S-6. Create / Edit Company dialog + Delete Company confirm

**Today.** The same `.pdx` system with a company-shaped grid, plus the `.pdx-confirm`.

**Becomes.** Exactly S-2 / S-3: radius 26px, `var(--bf-app-display)` title with the italic
gradient `em`, Inter (serif deleted), eyebrow labels, 8px inputs, 62ch sub-copy, aurora blobs
kept as siblings.

**Information (6/6).** 1. Eyebrow `Company`; title `Create <em>Company</em>` /
`Edit <em>Company</em>`. 2–3. Both sub-copy strings verbatim (incl. *"Its contacts follow a
renamed company."*). 4. All 8 field labels → eyebrow labels. 5. All 6 placeholders. 6. The
confirm's eyebrow `Remove company`, title `Delete <em><name></em>?`, body *"Its contacts and
deals are kept, but they will no longer be linked to this company. This cannot be undone."* Plus
the audit's resting labels `Create Company` / `Save Company`.

**Actions (3/3).** Cancel / Close / Escape; Submit → `createSalesCompany` /
`updateSalesCompany`, disabled until the name is non-empty, **domain normalised on submit**
(protocol and path stripped — which is what makes the row and drawer `https://<domain>` links
safe, and there is no validation message for nonsense); confirm `Keep company` /
`Delete company` (`.pdx-danger` red pill). Plus the audit's coercion note: an Industry outside
`COMPANY_INDUSTRIES` falls back to `Other` on open (§7.28).

**Form inputs (8/8).** Company name (autofocus, full width), Domain, Industry (all 12 options),
Phone, Company owner, City, State, Notes (rows=3, full width) — every option string kept.

**States.** `Creating Company` / `Saving Company` / `Deleting…`; `form-error role=alert`
`Company could not be saved.` / `Company could not be deleted.` No empty, no lock.

**Motion.** The four `pdx-*` keyframes, names kept, values retimed.

**Tests touched.** None directly; the shared `.pdx` change is covered under S-2.

---

### S-7. Deals pipeline — board layout

**Today.** A 7-lane `@dnd-kit` drag-and-drop pipeline inside the same index card, on a paper
strip that scrolls horizontally. Dropping writes the stage optimistically, PATCHes, reloads.

**Becomes.** The frame and toolbar are S-0's; the board itself is **the cluster's most heavily
licensed surface and changes least**.
- **Card + KPIs + toolbar:** as S-0 (boundary count 8 → 2; the table-wrap frame does not exist in
  board layout, so the board's 8 are 5 KPIs + the index card + the search pill + the `.hs-board`
  strip's own edge).
- **`.hs-board`:** keeps `overflow-x: auto`; its ground goes flat `#f5f6fa` (the paper it already
  wants). `touch-action: none` on cards is untouched — touch behaviour here is delicate.
- **`.hs-board-col`:** **licensed, clause 1** (a `useDroppable` keyed `stage-<Stage>`). Radius
  `18px`, border `rgba(28,28,26,0.07)`, `0 10px 30px rgba(28,28,26,0.05)`. `.is-over` keeps its
  blue border + 3px blue ring, re-based to `rgba(47,107,255,0.24)`, and its header tint to
  `rgba(47,107,255,0.06)`. **A lane rings; it does not lift.**
- **Lane header:** the tone dot at `50%`, the stage name at `var(--bf-app-row-strong)`, and
  `<count> · <currency>` at `var(--bf-app-meta)` `tabular-nums`. The 7 dot tones — blue, teal,
  violet, amber, **orange**, green, red — all kept; `.hs-board-dot` carries its own full tone set
  and orange exists only for `Contract sent`.
- **`.hs-deal-card`:** **licensed twice** (draggable, and its title navigates). Radius `18px`,
  `0 4px 12px rgba(28,28,26,0.08)` at rest, hover **lift** `-4px` +
  `0 26px 60px rgba(28,28,26,0.12)` (replacing the bespoke `0 6px 16px`). The 6px `PointerSensor`
  activation distance is what keeps clicking the title from starting a drag — **frozen**.
- **Amount:** `var(--bf-app-figure)`'s floor, `20px/700/-0.02em/tabular-nums` — the one figure on
  the card.

**Every information item placed (14/14).**
1–5. The five KPIs (Open pipeline / Weighted pipeline / Closing this month / Closed won / Win
rate incl. its `--` when nothing is closed) → borderless figure tiles.
6. `h1#deals-index-title` + `data-tutorial-id=deals-page-title` + the violet `Beta`.
7. The six saved-view counts.
8. The 7 lanes in order with their tones and probabilities (20/40/60/80/90/100/0) → the lane
headers.
9. Lane header dot + name + `<count> · <sum>`.
10. Lane `aria-label '<stage> · <N> deals'` inside `role=list 'Deal pipeline'` → unchanged.
11. Card face: name (blue link button), the amount in large type, the meta row (CalendarClock +
the 5 close labels `Closes in Nd` / `Closes today` / `Nd overdue` / `Closed <date>` /
`No close date`; Building2 company; ContactRound contact), the footer (priority pill + owner
initials with `title` = owner or `No owner`, `--` when none) → all preserved.
12. Overdue labels get `.hs-cell-overdue` red → kept; red is data.
13. Footer drop hint `Drag a deal card to move it to another stage` → the footer meta,
`12px` `#8a877e`.
14. Footer `<N> deal/deals · <sum>` + ` · N selected` → `.hs-count-pill`.

Plus the audit: the 6 tab icons (Handshake / Users / Sparkles / CalendarClock / CheckCircle2 /
AlertTriangle), the tablist name `Deal views`, the default sort `closeDate`/`asc`, the CSV's 10
columns, and **dnd-kit's screen-reader layer** — the visually hidden instructions node, the
`aria-live` announcements, and the `role='button' tabIndex=0 aria-roledescription='draggable'`
spread onto every card `<article>`. That layer promises a keyboard path the app does not
implement (`PointerSensor` only, no `KeyboardSensor`). **It is preserved untouched** and logged in
§7.29 — a redesign must not advertise keyboard drag it does not have, and must not remove
dnd-kit's own a11y layer either.

**Charts (1/1).** The pipeline *is* the visualization — 7 lanes with per-lane count and sum, plus
the weighted-pipeline KPI from the per-stage probabilities. No chart library, and none added.

**Every action placed (17/17).** Layout toggle (`role=group aria-label 'Layout'`, two
`.hs-btn-icon`s with `aria-pressed` and `title 'Board'` / `'Table'`, Kanban and Table2 icons) →
radius 12px, `.active` → `rgba(47,107,255,0.08)` + a blue border; drag a card between lanes (the
whole optimistic `stageOverrides` → `.is-landing` 1200ms → PATCH → reload → clear sequence
**frozen**, including the fact that dragging a second card within 1.2s cancels the first card's
pulse); card title button → the drawer; Refresh (`title 'Refresh deals'`); Export ×2 →
`buildflow-deals.csv`; `Create deal` + `data-tutorial-id=deal-add-button`; title chevron
(`aria-label 'Show all deals'`, `title 'All deals'`); the 6 tabs; Search (`aria-label 'Search
deals'`, placeholder `Search deal, company, contact, owner`, matching 7 fields); Filter chip;
Sort chip; the five quick filters (`Filter deals by owner` / `…by stage` / `…by close date` /
`…by priority` / `…by company`) with every option string; `Advanced filters` / `Clear filters`;
`createSignal` and `openRecordRequest`. All restyled, none renamed.

**States.** *Per-lane empty:* `Drop a deal here` in a dashed `.hs-board-empty` →
`rgba(28,28,26,0.13)` dashed, radius 12px, `12px` `#8a877e`. *Page empty:* `No deals yet` /
`Create your first deal to start tracking the pipeline.` *Loading:* `Loading deals…` in
`.hs-empty`; a dropped card renders in its new lane immediately while the PATCH is in flight.
*Error:* `Deal could not be moved.` (the card snaps back when the override clears) and the
initial-fetch error in `.hs-empty`. **The board deliberately never renders `No deals match that
view`** — filters that match nothing leave 7 empty lanes each reading `Drop a deal here`. That is
existing behaviour, it is easy to mistake for a bug, and removing the lanes would remove the
targets users drag into. **Preserved exactly**, and logged in §7.30. No add-on lock.

**Motion.** Hover: **1** (lift, `-4px`) on cards; **2** (invert) on Export; **3** (slide) on the
title link. The drag choreography — `hs-deal-lift` 0.3s, `hs-deal-land` 0.75s at `delay 0.32s`,
`hs-dropslot-in` 0.22s `scaleY(0.6)→1`, `DEAL_DROP_ANIMATION` 340ms on the signature curve,
`.is-dragging { animation: none }` — is **frozen whole**, names and values, and its
reduced-motion block (`hs-contacts.css:1452`) is untouched. `hsc-row-in` on card mount is
**retired** (cards are rows) and that selector comes out of the reduce list.
Reveals: 2. Skeleton: none.

**Tests touched.** No unit test. The v3.7 release copy pins the feature set
(`a pipeline board you drag between stages, a table view, weighted pipeline and win-rate KPIs,
and a deal record with Mark won / Mark lost`) and all of it survives. `tests/index-pages.test.tsx`
unaffected.

---

### S-8. Deals table layout

**Today.** The same filtered set as a sortable, paginated 12-column checkbox table.

**Becomes.** S-0's table treatment exactly — transparent eyebrow `thead` at 42px, 46px rows,
the table-wrap frame collapsed into the card's 18px `overflow: hidden`, row wash +
3px action-cluster slide, `.hs-page-btn` pills. Boundary count **8 → 2**.

**Every information item placed (9/9).** 1. The same five KPIs, tabs, toolbar and quick filters
as the board. 2. Row avatar `$` toned by stage → `.hs-avatar`, all stage tones incl. orange.
3. Row name sub-line = company → contact's company string → `No company` → `.hs-row-sub`.
4. Stage badge, full name, `DEAL_STAGE_META` toned → `.hs-badge` 999px. 5. Amount right-aligned →
`.hs-cell-num` `tabular-nums`. 6. Close date + `.hs-cell-overdue` red + the raw date in `title` →
unchanged. 7. Priority pill `.p-low` / `.p-medium` / `.p-high`, defaulting to Medium → 999px
`11px/700`. 8. Last activity relative + `formatDateTime` `title`. 9. Footer `<N> deals ·
<sum>` + selection count; **pagination appears only in table layout** — preserved.

**Every action placed (8/8).** 7 sortable headers (Deal name / Stage / Amount / Close date /
Owner / Last activity / Create date, with amount/created/lastActivity defaulting desc; Company,
Contact and Priority deliberately **not** sortable); header checkbox `Select all deals on this
page` + `Select <deal name>`; name link → the drawer; Company cell button →
`onOpenRecord('companies')`; Contact cell button → `onOpenRecord('contacts')`; the two
hover-reveal actions Edit / Delete (`title 'Edit deal'` / `'Delete deal'`); pagination + per-page
(`Deals per page`); layout toggle back to Board. All restyled, none renamed.

**States.** `No deals match that view` / `Try another view, or search by deal, company, contact
or owner.` — **this branch is table-only.** Plus the shared `No deals yet`, `Loading deals…`,
`Deals could not be loaded`, and `Deal could not be moved.` when a stage change from the drawer
fails. No lock.

**Motion.** Row `hsc-row-in` **retired**; hover moves **3** (slide) on links and the action
cluster; sort chevrons rotate. Reveals: 2.

**Tests touched.** None. Same shared-chrome exposure as S-0.

---

### S-9. Deal record drawer (`DealRecordPanel`)

**Today.** A right-hand drawer with a clickable 6-step pipeline stage track, Mark won / Mark
lost, three bordered highlights, a property list including the weighted amount, two bordered
association cards, and the contact's 10 newest activities.

**Becomes.** S-1's drawer treatment — flat scrim, floating-panel shadow, 18px left corners,
`h2` 22px/600, hairline sections with eyebrow heads, **5 inner frames → 0**, 72px tail. The stage
track is the one bespoke object and it keeps its geometry:
- `.hs-stage-track` (`aria-label 'Pipeline stages'`): 6 steps, markers at `50%`, connector
  hairline `rgba(28,28,26,0.13)`; `.done` → `#2f6bff` filled; `.current` → `#2f6bff` with a
  `var(--bf-focus-ring)`-alpha halo; step labels at the eyebrow size. Hover lightens the marker
  (a fifth micro-move? No — it is a **state change on a control**, not a hover move, the same
  class as a menu row's wash).

**Every information item placed (10/10).** 1. Back link `Deals`. 2. `$` avatar toned by stage +
`h2` = deal name. 3. Sub-line `<amount> · <company> · <contact>` with parts omitted when absent.
4. Tags: stage badge (full name), `<priority> priority` pill, owner chip. 5. The stage track's 6
short labels with `.done` / `.current`, and none done for a Closed lost deal. 6. Highlights:
Amount / Close date / Stage probability → the 3-up figure row. 7. `About this deal` — all 10
pairs incl. Weighted amount (`amount × probability`, rounded), Close date's ` · in N days` /
` · N days overdue` suffix for open deals, and the literal Pipeline value `Sales pipeline` — plus
the wide Notes row. 8. `Company` card → a hairline section: first-letter avatar, name link,
`<industry> · <domain>`. 9. `Contact` card → a hairline section: initials avatar, name link,
`<email> · <phone>`. 10. `Recent activities` — the linked contact's 10 newest.

**Charts (1/1).** `.hs-stage-track` is a stepped pipeline progress indicator, not a chart series.
Kept as-is.

**Every action placed (7/7).** Back / Close X / backdrop / Escape; the `aria-label 'Deal stage'`
select → `onMove(stage)` on the same optimistic PATCH path as a board drop **including the
landing pulse**; any stage-track step button (`title` = the full stage name) → `onMove`;
`Mark lost` (AlertTriangle) and `Mark won` (CheckCircle2), shown only while the deal is open →
the danger and success pill variants; Edit (Pencil); Delete (Trash2, `aria-label 'Delete deal'` +
`title`); company and contact links → `onOpenRecord`. Unchanged.

**States.** The four empties verbatim (`No company linked to this deal yet.`; `No contact linked
to this deal yet.`; `Activity with <contact name> shows up here.`; `Link a contact to see the
activity behind this deal.`) at 62ch. No loading of its own — stage moves apply optimistically in
the parent. A failed move surfaces as the parent's `Deal could not be moved.` No lock.

**Motion.** `hsc-fade` (no blur) + `hsc-slide-in`; per-item `hsc-rise` retired; the 640px
collapse kept. Hover: **3** on back, links and card rows; **2** on Mark lost/won's outline
variant.

**Tests touched.** None. Hand-walked.

---

### S-10. Create / Edit Deal dialog + Delete Deal confirm

**Today.** The `.pdx` dialog with a company→contact dependency: choosing a company narrows the
Contact select and clears a contact that no longer belongs.

**Becomes.** Exactly S-2 / S-3.

**Information (8/8).** 1. Eyebrow `Deal`; title `Create <em>Deal</em>` / `Edit <em>Deal</em>`.
2–3. Both sub-copy strings. 4. All 9 field labels → eyebrow labels. 5. All 3 placeholders.
6. Contact options append ` · <company>` when no company is selected in the form. 7. The new-deal
defaults (stage `Appointment scheduled`, priority `Medium`, owner = the active user, close date
30 days out). 8. The confirm's eyebrow `Remove deal`, title `Delete <em><name></em>?`, body
*"This removes the deal from the pipeline for everyone in sales. This cannot be undone."* Plus the
resting labels `Create Deal` / `Save Deal`.

**Actions (4/4).** Cancel / Close / Escape; Submit (disabled until the name is non-empty); the
Company `onChange` dependency; the confirm's `Keep deal` / `Delete deal` (`.pdx-danger`). Plus
the audit's coercion: a missing priority falls back to `Medium` on open.

**Form inputs (9/9).** Deal name (autofocus, full width), Deal stage (7), Amount USD (min 0 step
500), Close date, Deal owner, Company, Contact, Priority (3), Notes (rows=3, full width).

**States.** `Creating Deal` / `Saving Deal` / `Deleting…`; `Deal could not be saved.` /
`Deal could not be deleted.` No empty, no lock.

**Motion.** The four `pdx-*` keyframes.

**Tests touched.** None directly.

---

## 4. Screen-by-screen: Bookmarks + shared index + legacy primitives (10)

### B-0. Bookmarks page — the "Bookmarks" (starred pages) card

**Today.** `hs-index` page with no toolbar and no footer — the only one. An `h1`, a count line,
then one group section per rail hub in rail order, each a `repeat(auto-fill, minmax(214px,1fr))`
grid of 214px tiles. A tile is a body button plus a 40px star button behind a left hairline;
starred tiles carry an amber-tinted border and a filled amber star.

**Becomes.** The tile grid is the one surface in this cluster that is already the Welcome Page's
grammar — a licensed frame that lifts — so it changes least and gains the most.
- **Frame:** `.hs-index-card` at 18px / `rgba(28,28,26,0.07)` / `0 10px 30px rgba(28,28,26,0.05)`;
  `.bookmarks-page .hs-index-main` gap `20px → var(--bf-rhythm-dense)`; `padding-bottom: 72px`.
  `.hs-index-head` keeps `align-items: baseline`.
- **Head:** `h1#bookmarks-title` → `var(--bf-app-title)` / 600 / `-0.02em`. The count line
  (`.bm-count`) → `var(--bf-app-meta)` `#575550`. **No chevron button and no toolbar** — that
  asymmetry against the nine record index pages is preserved (§7.31), but the eyebrow group heads
  now tie it visually to the family in a way it is not today.
- **Group heads:** `h2` `11.5px` / `0.06em` / `--hsx-mut` → the **canonical eyebrow**
  (`11.5px/650/0.045em/#8a877e`), hub icon 15px `#8a877e`. Group gap `20px`, tile gap `10px → 12px`.
- **Tiles:** `.bm-tile` — **licensed, clause 1**. Border `rgba(28,28,26,0.07)`, radius **18px**,
  `0 10px 30px rgba(28,28,26,0.05)`. Hover: **lift `-4px`** (was `-1px`) +
  `0 26px 60px rgba(28,28,26,0.12)`, border → `rgba(28,28,26,0.13)` (was `#c9d0dc`), over
  `0.28s var(--bf-ease)` (was `0.16s ease` ×3). `.bm-tile-open` `13.5px/600` `#1c1c1a`,
  padding `12px 4px 12px 12px` kept. `.bm-tile-icon` 32×32, radius `8px → 12px`,
  `rgba(47,107,255,0.10)` fill / `#2f6bff` icon. Wrapped in `SpotlightSurface`.
- **Star:** `.bm-tile-star` 40px, left divider `rgba(28,28,26,0.07)`, rest `#b6bfcf → #8a877e`,
  hover `rgba(28,28,26,0.05)` / `#2f6bff`. **`.is-on` gold `#e8a33d` → `#2f6bff`** with
  `fill: currentColor`, and `.bm-tile.is-starred`'s amber border `rgba(240,179,84,0.55)` →
  `rgba(47,107,255,0.24)`. Declared visible change (§2.10); the filled-vs-outline distinction that
  carries the information is untouched.

**Every information item placed (12/12).**
1. `h1 'Bookmarks'` (`id=bookmarks-title`, `.hs-index-title`,
`data-tutorial-id="bookmarks-page-title"`) → the card head.
2. `PageReleaseTag` for `bookmarks` — blue `New` / violet `Beta` / nothing → 999px `11px/700`
pill; **`.hs-page-tag` is styled only under `.hs-index .hs-index-title`, which this title
matches**, so it works here (unlike the six schedule frames — see B-6).
3. Count line `<N> page` / `<N> pages starred` → `.bm-count` at `var(--bf-app-meta)`.
4. Count suffix ` · <N> view/views` → same line.
5. One group per hub with ≥1 star, in rail order, `Bookmarks` filtered out → unchanged.
6. Group heading = hub icon 15px + hub label → the eyebrow.
7. Tile page icon 17px in a 32×32 soft-blue square → radius 12px.
8. Tile page label from `navItemByPage` (all 20 strings) → `13.5px/600`, `nowrap` +
`text-overflow: ellipsis` kept.
9. Tile lock affordance — CircleArrowUp 15px `--hsx-violet` for the three `ADD_ON_PAGE_LOCKS`
pages → **`#6d28d9`**, this surface's one named non-blue accent.
10. Tile star state — filled + tinted border → blue as above.
11. Tooltips `Open <label>` on the body, `Remove bookmark` / `Bookmark for quick access` on the
star → kept verbatim; the star also gets `RailTooltip` so touch users get a visible label.
12. Star `aria-label 'Remove <label> from bookmarks'` / `'Bookmark <label>'` + `aria-pressed` →
verbatim.

Plus the audit's additions: the unstarred star colour `#b6bfcf`, the 40px width and the left
hairline divider, `.bm-tile-open`'s exact padding, the `.bm-tiles` 214px grid, and the fact that
`readBookmarks()` validates every stored id against `new Set(navItems.map(i => i.page))` and
**silently drops unknown pages** — so a renamed `Page` constant empties a person's bookmarks.
That is a hard constraint on the whole redesign: **no `Page` union value may be renamed.**

**Every action placed (5/5).**
1. Click a tile body → `open()` → `setPage(target)`, or `onRequestAddOn(productId)` for a locked
page → the add-on prompt. Unchanged.
2. Click the star → `onToggleBookmark(page)` → `useBookmarks.toggle` → rewrites
`bf:nav:bookmarks:<userId>`; the tile leaves this card immediately and the top-bar count updates.
Unchanged.
3. Hover a tile → **lift** (move 1), retimed and deepened as above.
4. Hover a star → wash + blue.
5. **No search, no filter, no sort, no pagination, no bulk select, no export** — the only
`.hs-index` page without toolbar/footer chrome. Preserved deliberately (§7.31).

**States.** *Empty (both stores empty):* `.bm-empty` — the 22px Star icon **goes blue** (it was
amber), `strong 'No bookmarks yet'` at `15px/700`, then the body string verbatim
(*"Star any page below, or hover a category in the sidebar and use the star there. Bookmarks
show up in the star menu at the top of every screen."*) at `min(62ch, 100%)` (was a 460px cap),
dashed `rgba(28,28,26,0.13)`, radius `12px → 18px`, centred. **The copy needs one word changed —
see §7.32 — because "hover a category in the sidebar" is the instruction that does not work on
touch, and the click path this plan adds makes it wrong.** Flagged, not changed.
*The branch quirk:* 0 starred pages + ≥1 pinned view returns `null` for **both** the groups and
`.bm-empty` (`App.tsx:20472`), leaving a title, a count line and the view tiles with no
explanation. **Preserved as-is** and logged in §7.33 — it is a real bug, but fixing it is a
behaviour change.
*Loading:* none local (the page renders after bootstrap; bookmarks read synchronously from
localStorage in a `useState` initialiser). *Error:* none surfaced — `readBookmarks()` swallows
throws and the toggle's `setItem` is try/caught (`// private mode: the stars just do not
persist`), so a private-window user silently loses persistence. **Preserved**, logged in §7.34.
*Add-on lock:* the CircleArrowUp + the prompt, as above.

**Motion.** Hover: **1** (lift). Reveals: **2** — `bm-rise` moves off the 40+ tiles and onto the
two `.hs-index-card`s, retimed to 12px / 0.55s on `var(--bf-ease)` (it is `8px / 0.4s` today).
That fixes the replay-on-remount flaw without adding `data-reveal` (which the tiles' remount
would defeat anyway). This page still does **not** use `useHudMotion`, `[data-reveal]` or the
`.dx-bg` auroras — and that stays true, so `SpotlightSurface` here falls back to its own
rAF-throttled `pointermove`. `bookmarks-page.css:167`'s reduce block gains
`.bookmarks-page .bm-tile-star` (its colour/background transition is the one gap). Skeleton:
none.

**Tests touched.** **No test renders `BookmarksPage`.** The nearest coverage is
`schedule/linkBookmarks.test.ts` (4 hook-level tests), which this screen does not touch.
`data-tutorial-id="bookmarks-page-title"` is confirmed **not** a `TutorialTargetId` member and
not a spotlight target — a dead hook, kept. **Zero-coverage surface: hand-walked (§9).**

---

### B-1. Bookmarks page — "Schedule views" pinned-link tiles

**Today.** `ScheduleLinkTiles` renders its own `.bm-groups` block inside the first card — so the
card can hold two sibling 20px-gap grids — with a `Link2` head and one always-starred tile per
pinned Schedule view.

**Becomes.** The same tiles under B-0's treatment, plus **one real fix**: the tile's "sub-line"
is not a sub-line. `<small>{link.detail}</small>` renders **inside** `.bm-tile-label`, which is
`nowrap` + `overflow: hidden` + `ellipsis`, and **no stylesheet anywhere declares
`.bm-tile-label small`** (verified by grep across all 57 sheets) — so the detail renders inline
after the label at the browser default ~0.8em, same ink, usually clipped.

The redesign realises the intended two-line tile, in CSS only, without touching the component:

```css
.bf-shell .bookmarks-page .bm-tile-label       { white-space: normal; }
.bf-shell .bookmarks-page .bm-tile-label small { display: block; margin-top: 2px;
  font-size: var(--bf-app-meta); font-weight: 500; color: #8a877e;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

The label keeps its own single-line clamp via a nested rule; the detail gets its own line at the
meta size. **This is a visible change to a surface with no test — declared in §7.7.**

**Every information item placed (6/6).** 1. `section aria-label 'Schedule views'` + `h2` =
`Link2` 15px + the label → the eyebrow head. 2. Tile icon `Link2` 17px in the 32×32 square →
radius 12px. 3. Tile label (`Week · week of Jun 22`, `Month · June 2026`,
`Schedule · week of today`, `Kanban`, `Gantt`) → `13.5px/600`. 4. Sub-line
(`describeSavedView()` of the filters) → **its own line** at `12px` `#8a877e`, as above.
5. Always `.is-starred` + `.bm-tile-star.is-on` + `aria-pressed="true"` → the blue filled star
and the blue-tinted border. 6. `title 'Open <label> · <detail>'` → verbatim.

Plus the audit: this component wraps itself in its **own** `.bm-groups`, so the first card holds
two 20px grid gaps rather than one flow. Preserved; the `--bf-rhythm-dense` gap now reads as
deliberate rhythm rather than an accident.

**Every action placed (3/3).** 1. Click a tile → `openScheduleLink(link)` → sets
`window.location.hash` to the stored hash; the schedule router applies the week/month and
filters. 2. Click the filled star → `onRemove` → `toggleLinkBookmark` writes
`bf:nav:links:<userId>` and dispatches the `bf:nav:links` `CustomEvent` so the top-bar menu and
this page stay in step. 3. Renders `null` at `links.length === 0`. All unchanged.

**States.** No own empty (returns `null`). No loading. *Error:* `readLinkBookmarks()` validates
each entry (page must be a `SchedulePage`, hash must start with `#schedule`, label must be a
string) and silently drops the rest — corrupt entries vanish with no message. Preserved. No lock.

**Motion.** Inherits `bm-rise` from the card (not the tile) and the licensed **lift**.

**Tests touched.** **`schedule/linkBookmarks.test.ts` (3 named tests) pins the exact
label / hash / detail strings these tiles print:** `'names the page, the week or month it shows,
and its filters — the link is the identity'`, `'pin and unpin by their link, per person, and
survive a reload'`, `'keep every star menu in step through the hook'`. All three are **hook-level
and DOM-free**, so all three keep passing unchanged — the label/hash/detail strings are produced
by `scheduleLinkFor` / `describeSavedView`, which this plan does not touch. The two-line CSS fix
changes only how the already-asserted `detail` string is laid out.

---

### B-2. Bookmarks page — the "All pages" catalogue card

**Today.** A second `hs-index-card` holding the whole page catalogue, hub by hub, so any page can
be starred from one place.

**Becomes.** B-0's treatment. `h1#bookmarks-all-title` at `var(--bf-app-title)`; **no release
pill, no chevron** — preserved. Helper line at `var(--bf-app-meta)`. `gap:
var(--bf-rhythm-dense)` between the two cards, so the second card finally reads as a second
beat rather than a 16px continuation.

**Every information item placed (5/5).** 1. `h1 'All pages'`. 2. Helper `.bm-count`
`Star a page to pin it to quick access`. 3. Every hub in `navHubs` order with its icon + label
heading — Home / Bookmarks (skipped) / Schedule (7) / Operations (2) / **Sales (Contacts,
Companies, Deals)** / Resources (2) / Field (3) / Reporting (1) / TimeCard (1) → eyebrow heads.
4. Per-tile starred state against the live array + the lock arrow for map / equipment / timecard.
5. A hub whose list is empty after removing `bookmarks` renders `null`.

**Every action placed (2/2).** 1. Tile body → open, or the add-on prompt. 2. Tile star → toggle;
the tile here flips and the page appears/disappears in the card above. Unchanged.

**States.** No empty (the catalogue is static). No loading, no error. Lock: the CircleArrowUp +
the prompt.

**Motion.** `bm-rise` now on **the card**, not on all ~21 tiles — which is precisely the reveal
arithmetic's "attached to sections, never rows" and it fixes the whole-catalogue re-animation on
every star toggle. Hover: **1** (lift) per tile.

**Tests touched.** None.

---

### B-3. Top-bar bookmarks star menu

**Today.** A 20px Star `.icon-button.hs-bookmarks-btn` that fills gold `#f0b354` when
`.has-items`, a blue count badge, and a `min-width: 264px` `role="menu"` popover with a head, page
rows (icon + label + a right-aligned muted hub name), view rows, and one or two blue footer
actions.

**Becomes.** Present on every in-app page — **including Settings**, once the `page !== "settings"`
TopBar guard is dropped (preserve §6g). That is a genuine gain here: today Settings is the one
surface with no star menu at all.
- **Trigger:** 36px `.hs-btn-icon` at radius 12px, rest `#575550`. **`.has-items` gold `#f0b354`
  → `#2f6bff`** with `fill: currentColor`. `:focus-visible` → `var(--bf-focus-ring)`.
  `RailTooltip` wired with `label = 'Bookmarked pages'`.
- **Badge:** `.hs-bookmarks-count` stays a blue 999px pill at `9.5px`.
- **Menu:** `.hs-bookmarks-menu` radius `10px → 18px`, `0 24px 70px rgba(28,28,26,0.14)`, border
  `rgba(28,28,26,0.07)`, `hs-pop 0.16s → 0.22s var(--bf-ease)`; `min-width: 264px` **frozen**.
  Wrapped in `SpotlightSurface`.
- **Head:** `.hs-menu-head 'Bookmarks'` → the canonical eyebrow.
- **Rows:** `13.5px/500` `#1c1c1a`, icon 16px `#8a877e`; hover wash `rgba(28,28,26,0.05)`
  **plus `translateX(3px)`** (move 3). `.is-current` keeps its wash. `.hs-bookmark-hub` `em` →
  the eyebrow at `#8a877e`.
- **Footer:** `.hs-bookmarks-add` `13px/600` `#2f6bff` on a top hairline; its icon slides 3px.

**Every information item placed (8/8).** 1. The 20px Star trigger + `.has-items` → blue.
2. `.hs-bookmarks-count` = `bookmarks.length + links.length` → the blue pill, hidden at 0.
3. `aria-label 'Bookmarks (<N>)'` where N counts **only page bookmarks** — inconsistent with the
visible badge. **Preserved verbatim**; the mismatch is logged in §7.36 as a one-line fix needing
approval. 4. `title 'Bookmarked pages'` + `aria-haspopup="menu"` + `aria-expanded`. 5. Head label
`Bookmarks`. 6. Page row: icon + label + the right-aligned `<em class=hs-bookmark-hub>` hub name
(found via `navHubs.find(h => h.pages.includes(target))`); `.is-current` for the page you are on.
7. View row: `Link2` + label + detail in the **same** `.hs-bookmark-hub` class — one class
carrying two different kinds of information. Preserved. 8. Both footer action rows: on a schedule
page `Bookmark this view · <label>` / `Unpin this view · <label>` with the detail as `title`; and
always `Bookmark <current page label>` / `Remove <current page label>`.

Plus the audit: **the menu maps `bookmarks` in insertion order while the Bookmarks page re-groups
the identical array into rail order** — two orderings of one list. Preserved (it is state, not
presentation), logged in §7.37.

**Every action placed (9/9).** 1. Star click → toggles the menu and closes the Create,
Notifications and Account menus first. 2. Escape on the trigger. 3. Outside `mousedown` (guarded
by `bookmarkMenuRef`). 4. Page row → close + `goTo(page)`. 5. Row `×` (`.hs-bookmark-remove`,
hover-revealed 14px X, `stopPropagation`, `aria-label 'Remove <label> from bookmarks'`,
`title 'Remove bookmark'`) → `onToggleBookmark`. **The `×` gets the EDITORIAL graft too: pinned
at `opacity: 0.55` below 1024px** rather than 0-until-hover, because today it is unreachable on
touch. 6. View row → close + `openScheduleLink`. 7. View row `×` → `onToggleLink`. *(The audit's
detail: a page row uses a lucide `<X size={14}/>` while a view row uses a literal `×` glyph —
same class, different metrics. **Preserved**, and the new sheet gives both a fixed 14px box so
they align.)* 8. `Bookmark this view` → `onToggleLink(scheduleLinkFor(page, readScheduleContext,
data))`, capturing the live week/month + filters. 9. `Bookmark <page>` → `onToggleBookmark`.

**States.** *Empty:* `.hs-bookmarks-empty` — *"No bookmarks yet. Hover a category in the sidebar
and star a page to keep it here."* at `12.5px`, colour `#7b8698 → #8a877e`, cap `244px →
min(62ch, 100%)` (which at 12.5px resolves inside the 264px menu, so `min()` is load-bearing
here, not decorative). **Same copy problem as B-0's empty state** — §7.32. No loading, no error,
no lock.

**Motion.** Row `×` reveal `0.14s ease → 0.18s var(--bf-ease)`, hover red-on-`#fbe4e2` kept
(destructive, so red is data). `.hs-bookmarks-add` background `0.15s → 0.25s var(--bf-ease)`.
`hs-pop` retimed, **name kept** (`app-shell-hubspot.css:1116`'s reduce block nulls the `×`
transition by selector and gains the new one). Hover: **3** (slide) on rows and the footer icon.

**Tests touched.** **No DOM test renders this menu.** Only the hook-level
`schedule/linkBookmarks.test.ts`, which is untouched. **Zero-coverage surface: hand-walked, and
covered by the new `tests/shell-nav.test.tsx`'s ≤560px reachability guard** (§2.8) — which is the
first automated test this surface will ever have.

---

### B-4. Rail flyout page star (hover-reveal)

**Today.** A 14px Star per flyout row, `.hs-flyout-star`, 30px wide, `opacity: 0` until the row
is hovered or the button is focused; filled amber `#e8a33d` when on. **Doubly unreachable on
touch:** it lives inside a surface that cannot open without a pointer, and it is revealed by an
event that cannot fire.

**Becomes.** Both halves fixed, and the star re-based.
- `.hs-flyout-star` **gold `#e8a33d` → `#2f6bff`**, `fill: currentColor` when `.is-on`; reveal
  transition `0.14s ease → 0.18s var(--bf-ease)`.
- **The EDITORIAL touch rescue, grafted:** below 1024px the star is pinned at `opacity: 0.55`
  instead of 0-until-hover, so it is visible before it is hovered.
- **The flyout itself becomes reachable by tap** via preserve §5c's coarse-pointer branch gated
  on `matchMedia('(hover: none)').matches` — which `test/setup.ts` answers `false` for every
  query, so `fireEvent.click(hub)` still navigates under test. **The gate must be `(hover: none)`,
  never a width or a touch-event sniff** — that is the difference between this and the
  ungated version the judges failed.
- **The star must stay a SIBLING of the `role="menuitem"` button, never a child** — that is what
  keeps the menuitem's accessible name equal to the page label, which
  `appHarness.openAppPage()` matches with "starts with the page label" across 30 call sites.

**Every information item placed (4/4).** 1. The 14px Star, 30px slot, `opacity: 0` → the above.
2. A starred page keeps its star visible and filled → blue `.is-on`. 3. The Bookmarks row itself
is not starrable (`starrable = hubPage !== 'bookmarks'`, *"starring it would be circular"*) →
unchanged. 4. Everything else in the row — page icon, label, `New`/`Beta` `.hs-flyout-tag`, the
`CircleArrowUp` `.hs-flyout-upgrade`, and the `.hs-flyout-tip` tooltip carrying the add-on title
+ pitch → tags to `#2f6bff` / `#6d28d9` on 10%-alpha fills; upgrade arrow `#2f6bff`; the tip
becomes an **ink pill** (`#1c1c1a` / `#fdfcf9`, radius 12px,
`0 8px 22px rgba(28,28,26,0.2)`), width 244px and its `::before` arrow frozen, body at 62ch.

**Every action placed (2/2).** 1. Click the star → `stopPropagation` + `onToggleBookmark`.
2. `aria-pressed`; `aria-label 'Remove <label> from bookmarks'` / `'Bookmark <label>'`;
`title 'Remove bookmark'` / `'Bookmark for quick access'`. All verbatim.

Plus **the EDITORIAL graft this surface needs most: `.hs-flyout-tip` fires on `:focus-within` as
well as `:hover`.** Today the add-on explanation never precedes the `AddOnPrompt` for a keyboard
or touch user — they get the prompt with no warning. One selector.

**States.** No empty, loading, or error. *Lock:* `.hs-flyout-item.locked` keeps its dimmed
treatment and its `aria-describedby` → the tip's id, and clicking still **prompts** rather than
navigating.

**Motion.** The reveal transition retimed; `app-shell-hubspot.css:1116`'s reduce block covers it
by selector. Hover: **3** (slide) on the row wrapper.

**Tests touched.** No test targets the star. But `tests/map.test.tsx:103` (`Get Map & Field Ops`)
asserts that a **locked flyout item prompts instead of navigating** — flyout changes here are
CSS-only plus the two additive handlers, and all three copies of `lockedAddOnForPage` are
untouched, so it keeps passing. `appHarness.openAppPage()` (30 call sites) and
`openSchedule()` (3) depend on the hub name regex `/^<Hub>( \(.*\))?$/` and on the menuitem's
name starting with the page label — **neither changes**. The new `tests/shell-nav.test.tsx` adds
the first coverage: click-only reachability, and the locked-row prompt on this path.

---

### B-5. Saved views flyout rows (Schedule hub)

**Today.** A second flyout head (`Saved views`) inside `.hs-flyout-views`, then one
`.hs-flyout-item.hs-flyout-view` per named view: a `Pin` 14px, the name, and an `<em>` with
`describeSavedView()`. **Its CSS lives in `schedule.css:1945-1965`, not in the shell sheet.**

**Becomes.** The same rows, re-skinned **in the new sheet under
`.bf-shell .hs-flyout .hs-flyout-views …`** — because if it is missed, the Schedule hub's flyout
gets a navy-era block sitting inside a white 18px card. This is the trap the completeness check
flagged and it is easy to miss precisely because the selector lives in a different file.
- Divider hairline → `rgba(28,28,26,0.07)`; second head → the canonical eyebrow;
  `.hs-flyout-label` `13.5px/500` `#1c1c1a`; the `<em>` → `var(--bf-app-meta)` `#8a877e` with its
  **160px ellipsis clamp frozen**; `Pin` 14px `#8a877e`; row hover wash + `translateX(3px)`.

**Every information item placed (3/3).** 1. The second `.hs-flyout-head` `Saved views` → the
eyebrow. 2. Per row: `Pin` + name + the `<em>` filter reading. 3. Renders `null` with no saved
views. Plus the audit: `.hs-flyout-item` is **shared** with the page rows, so restyling the
flyout row restyles saved views — which is the point, and is why the two must be re-skinned
together.

**Every action placed (1/1).** Click a row → `openSavedView(activeUser.id, view, onOpenPage)` —
navigates to the view's page and applies its filters. Unchanged.

**States.** Hidden entirely when empty. No loading, error or lock. *And the audit's silent
failure, preserved:* `MAX_SAVED_VIEWS = 12`, with `persist()` keeping the **last** twelve
(`slice(-12)`) while `serializeSavedViews()` caps the **first** twelve (`slice(0,12)`), and a
failed `setUserSetting` swallowed — so a person can save a view, see the chip, and lose it on
reload with no notice. Logged in §7.35.

**Motion.** Inherits the flyout's `hs-flyout-in` entrance (0.16s → 0.2s `var(--bf-ease)`, **name
kept**). Hover: **3**.

**Tests touched.** **`schedule/pages.test.tsx:478-486` matches the row by
`role='menuitem'` with name `/Morning board/`** — the row must stay a `menuitem` whose accessible
name starts with the view name. It does; CSS-only change. **Keeps passing unchanged.**

---

### B-6. Shared index-page chrome (`.hs-index`) — the pattern ten pages stand on

**Today.** One reusable language — a token block, KPI strip, white 14px index card, saved-view
tabs, search/filter/sort toolbar, quick-filter selects, a 46px-row checkbox table with a sticky
`#fafbfd` 42px `thead` inside its own bordered wrap, and a pagination/count/export footer — used
by Bookmarks, Projects, Contacts, Companies, Deals, Crews, Equipment, Materials, Field Updates
and DelayIQs. **`hs-index.css` has no `prefers-reduced-motion` block and no dark block; every
colour is a literal light hex.**

**Becomes.** This is the highest-leverage screen in the cluster: one sheet, ten pages, and it is
where the eyebrow rule and the boundary audit pay off. Everything in §1 and §2 lands here.

**Every information item placed (19/19).**
1. **The `--hsx-*` token block** (`hs-index.css:11`) — 8 of its 20 values change, and the
   **same 8 are written into all three duplicate declarations** (`hs-index.css:11`,
   `schedule.css:5217` on `.gantt, .gantt-menu`, `expand-map.css:9`):
   `--hsx-ink #14203a → #1c1c1a`, `--hsx-mut #575550` (already right),
   `--hsx-faint #8a877e` (already right), `--hsx-line #e6e8f0 → rgba(28,28,26,0.13)`,
   `--hsx-line-soft #eef0f4 → rgba(28,28,26,0.07)`, `--hsx-paper #f5f6fa` (already right),
   `--hsx-hover #f6f8fc → rgba(28,28,26,0.035)`, `--hsx-blue-soft #e8f0fe →
   rgba(47,107,255,0.10)`. `--hsx-blue #2f6bff`, the green/amber/red/violet pairs and
   `--hsx-ease` (already the signature curve) are unchanged. `--hsx-sans` stays the Inter stack.
2. **KPI strip** — borderless figure tiles (§1.2, §2.4): `auto-fit minmax(170px,1fr)` kept, 34×34
   chip at radius 12px with its six tones, eyebrow label, `var(--bf-app-figure)` value with its
   optional `<small>` unit, `.hs-kpi-note` at `var(--bf-app-meta)` (which on Projects prints
   `<delta> <note>`).
3. **`.hs-index-grid`** — `minmax(0,1fr)` + a **330px sticky rail at `top: 74px`**, collapsing at
   1240px. Used by only **2 of 10** pages (Projects, DelayIQs), so it is **not** treated as part
   of the shared pattern. The `top: 74px` literal is re-expressed as
   `calc(var(--hs-topbar-h) + 18px)` so it stops being a second hard-coded copy of the bar height.
4. **Index card** — 18px / `rgba(28,28,26,0.07)` / `0 10px 30px rgba(28,28,26,0.05)` /
   `20px 22px 18px` / `overflow: hidden`.
5. **Card head** — `h1` at `var(--bf-app-title)`/600 `#1c1c1a`; the 26px chevron at radius 12px
   (`aria-label 'Show all <things>'` on all nine record pages, absent on Bookmarks);
   `.hs-index-actions` on the right, `gap: 8px`.
6. **`.hs-page-tag`** — 999px, `11px/700` uppercase, `#2f6bff` / `.beta #6d28d9`. **And the fix
   the completeness check found: it is styled ONLY as `.hs-index .hs-index-title .hs-page-tag`,
   while the six schedule view frames render the same `PageReleaseTag` inside `.dx-title`, which
   that selector does not match — so month / week / list / kanban / matrix / gantt currently
   render the bare word "New" as unstyled inline text.** One unscoped rule in the new file
   (`.bf-shell .hs-page-tag`) fixes all six. Verified: grep for `page-tag` across all 57 sheets
   hits only `hs-index.css`.
7. **Buttons** — `.hs-btn` 999px, `min-height 36px`, transparent + `1px rgba(28,28,26,0.13)`,
   `13.5px/600`, **inverts** to `#1c1c1a`/`#fdfcf9`; `.hs-btn-primary` 999px `13px/600` blue with
   `0 4px 12px rgba(47,107,255,0.2)` (was `0 6px 16px rgba(47,107,255,0.28)`), hover `#1f57e0`;
   `.hs-btn-icon` 30–36px square at radius 12px, wash on hover, `scale(0.94)` press;
   `:disabled` `opacity .55`.
8. **Saved-view tabs** — as S-0, **with the per-tab lucide icon** on all nine tablists (styled at
   `hs-index.css:286`, recoloured blue when `.active`). All eight recorded tab sets kept verbatim,
   **plus the DelayIQ set the inventory missed**: `All delayIQs` (ShieldAlert) / `Open`
   (AlertTriangle) / `Monitoring` (Gauge) / `Resolved` (CheckCircle2), each with a live count.
9. **Toolbar** — `.hs-search` 999px `min 280px` (the one licensed pill), the two `.hs-chip`s,
   `.hs-toolbar-right`'s `<filtered> of <total>`. **`.hs-search kbd` is styled but no index page
   renders one — dead CSS, not ported** (§7.54).
10. **Quick filters** — `.hs-qf` borderless pills with their absolutely-positioned ChevronDown,
    `.is-set` blue, then `.hs-qf-link` reading `Clear filters` / `Advanced filters`. **The facet
    name is the `<option value='all'>` itself**, exposed to AT only through
    `aria-label 'Filter <things> by <facet>'` — every one of those 13+ labels verbatim.
11. **Table** — `.hs-table-wrap` keeps `overflow-x: auto`, **loses its border and 10px radius**;
    `.hs-table` `min-width: 720px`, separate borders, **46px rows frozen**, `nowrap` cells,
    **sticky 42px `thead` frozen** with its `#fafbfd` fill going transparent (§1.2).
12. **`sortHeader`** — `.sorted` + the button + the 180°-rotated ChevronDown at full-opacity
    blue. No `aria-sort` today; not added (§7.22).
13. **Cell primitives** — `.hs-cell-check` 44px / 16px checkbox / `accent-color: #2f6bff`;
    `.hs-cell-name` min 240px; `.hs-row-name` → `.hs-avatar` 30px `50%` (all 8 tones, noting
    Projects' avatar ignores them for an inline `projectAvatarThemes` background) +
    `.hs-link` (blue 700 → `13.5px/600`, underline on hover with a 3px offset, slide 3px) +
    `.hs-row-sub` (`12px` `#8a877e`, 340px ellipsis); `.hs-cell-muted` `13px`;
    `.hs-cell-num` `tabular-nums`; `.hs-cell-wrap` 260–420px; `.hs-name` `13.5px/600`;
    `.hs-thumbs` 28px chips at radius 8px (`aria-hidden`, max 3 photos, followed by the text
    count `No photos attached` / `<N> photo(s)` which is what the test asserts). Plus
    `.hs-cell-none` and `.hs-link-plain`, **both styled only under `.contacts-page`** — so their
    rules go in the `.contacts-page` scope, not the `.hs-index` one (§2.1).
14. **`.hs-badge`** — 999px, 6px `currentColor` dot `::before`, `11px/700`; tones green / amber /
    red / blue / violet **+ teal + slate + orange**, the last three added by `hs-contacts.css`.
15. **`.hs-progress`** — 6px track, **gradient `#4285f4 → #9b72cb` forced flat `#2f6bff`**, tone
    variants flat; plus the bold `tabular-nums` percentage.
16. **`.hs-delta`** — `.ahead` green-soft / `.behind` red-soft, printing `±Nd`, 999px.
17. **Row states** — `tr:hover` → `rgba(28,28,26,0.035)` over `0.18s var(--bf-ease)`;
    `tr.is-selected` → `rgba(47,107,255,0.06)`. **Noting `is-selected` is
    `isChecked || id === selectedProjectId`, so the highlight doubles as "the workspace's current
    project"** — which is why it stays a wash, not a border.
18. **Footer** — `1fr auto 1fr`: `.hs-count-pill`, `.hs-pagination` (Prev + every page number,
    **no truncation**, + Next + a `.hs-qf.hs-perpage` reading `10 per page` / `25 per page` /
    `50 per page`), and `.hs-foot-right`'s Export. **The footer still renders below `.hs-empty`
    when filters hide every row** — preserved.
19. **Rail panels** — `.hs-panel` 18px / `0 10px 30px rgba(28,28,26,0.05)`, `.hs-panel-head h2` →
    `var(--bf-app-section)`, `.hs-panel-link` blue text button that slides 3px. **The audit's
    correction is honoured: Projects' three rails are `Project Alerts` (link `View all` →
    DelayIQs), `Upcoming Milestones` (`View all` → Schedule) and `Portfolio Health` (link
    `Details` → Reports)** — not the three the inventory named. Their contents are mapped in §6.3.

**Every action placed (14/14).** Saved-view tab → set view + page 1; title chevron → view `all`;
type in `.hs-search` → filter + page 1; Filter chip → clear-or-no-op with its two `title`s;
Sort chip → `toggleSort(key)`; any `.hs-qf` → apply + page 1; `Clear filters` /
`Advanced filters`; header checkbox `Select all <things> on this page` + per-row `Select <name>`;
row name `.hs-link` → editor dialog (`aria-label 'Edit <name>'`) or, on Contacts/Companies/Deals,
the record drawer; row hover → `.hs-row-action` fade-in **plus the 1024px `opacity: 0.55` graft**,
with `@media (hover: none)` still pinning them, the `.edit` blue / plain red distinction kept and
Contacts' Call/Text re-tinted blue (S-0); Prev / number / Next + per-page; Export → client-side
CSV; the per-page primary action; rail `.hs-panel-link`s.

**Plus the ten primary-action labels verbatim, with their inconsistent casing preserved**:
`Import schedule` + `Add project`, `Create contact`, `Create company`, `Create deal`, `Add Crew`,
`Add Equipment`, `Add Material`, `Add Field Update`, `Log DelayIQ`, and **none** on Bookmarks.
Normalising `Add project` vs `Add Crew` would break `tests/index-pages.test.tsx` — **do not
normalise** (§7.38). And `.hs-index-actions` on DelayIQs is **conditional**
(`canCreate = role !== 'Crew Lead' && projects.length > 0`), so a Crew Lead or an empty workspace
sees an index head with no actions at all — the head's layout must not assume an actions slot.

**Table columns (2/2 groups).** Projects' 12-column archetype and its 8 sortable keys (name,
status, health, progress, target, manager, type, value — with Forecast finish, Contract and
Location deliberately **not** sortable) → unchanged. Plus, from the audit, **`Materials` is a
read-only instance**: a plain `<span class="hs-name">`, no `.hs-link`, no `.hs-cell-actions`
column, no row hover actions at all — so "hover a row for actions" does not hold for every index
page and the new sheet must not assume the column exists.

**Charts (1/1 → corrected).** The inventory says "no true chart in the shared chrome". The audit
proves otherwise and I honour the correction: the **Projects rail holds a Recharts donut**
(`ResponsiveContainer h=150`, `Pie innerRadius 48 / outerRadius 68 / paddingAngle 2 / stroke
none`, one `<Cell>` per health slice, a `.proj-health-center` overlay printing the total and
`Projects`, a `.proj-health-legend` of dot + name + a `.proj-health-bar` + `<N>%`, and a
`No data` fallback) and the **DelayIQs rail holds a Recharts BarChart** (`h=220`, `CartesianGrid
rgba(28,28,26,.07)` — already the right hairline, `XAxis`/`YAxis` with no tick or axis lines,
`Tooltip`, `Bar fill #d96570 radius [6,6,0,0]`) with an `InlineEmptyState` fallback. Both keep
their geometry; only the surrounding panel frame, the eyebrow head and the legend type change.
`#d96570` is a **trio member used as data ink**, which is legitimate — a chart series is data, not
accent.

**States.** `.hs-empty` — 28px icon, `15px/700` title, `13px` `#8a877e` body at
`min(62ch, 100%)`, 44px vertical padding, **frameless** (the card is the frame). It distinguishes
"nothing yet" from "nothing matches" per page, and **every one of the audit's per-page strings is
kept verbatim**: `No projects added yet` / `Create your first project to start building the
schedule.`, `No projects found` / `Adjust the search or filters to see more projects.`,
`No crews added yet`, `No equipment matches that search`, `No equipment added yet`,
`No materials match that search`. `hs-contacts.css:162`'s `.hs-empty .hs-btn` (so some empty
states carry a CTA) → the inverting outline pill. *Loading:* **no skeleton anywhere in the
chrome, and none added** — index pages render only after the App-level bootstrap resolves.
*Error:* none in the chrome; failures surface on the App-level data-error screen. *Lock:* handled
by `openAppPage()` diverting to the prompt.

**Motion.** Every `0.12s` / `0.15s` / `0.16s` `ease` in the sheet → the four interaction
durations on `var(--bf-ease)`. Hover: **2** (invert) on `.hs-btn`; **3** (slide) on `.hs-link`,
`.hs-panel-link`, the row action cluster and `.hs-qf-link`; **spotlight** on `.hs-index-card` and
`.hs-kpi`; **no lift** anywhere in the chrome (nothing here is licensed except the search pill,
which inverts, and the card, which is a viewport). Reveals: the chrome itself carries none —
`Contacts`/`Companies`/`Deals` are the only index pages with `[data-reveal]`; the six `-rx` pages
carry `.dx-bg` + `.dx-cursor` and run `useHudMotion` but have **no** `[data-reveal]` on their
index content (audit-verified, correcting the inventory). **`hs-index.css` gains its first
`prefers-reduced-motion` block**, nulling the transitions the new sheet adds — closing the gap
that made adding motion to the shared chrome unsafe.

**Tests touched — this is the highest-exposure screen in the cluster.**
`tests/index-pages.test.tsx` (14 anchors / 12 tests). Every one **keeps passing unchanged**, and
here is why, item by item:
- `findIndexCard()` = `getByRole('heading', {level:1, name:/^<title>/}).closest('section')` — the
  `h1` stays an `h1`, stays inside `<section class="hs-index-card">`, and gains no prefix. The
  only change to it is `font-size`, `font-weight`, `letter-spacing` and `color`.
- `'lists projects in the index table with saved views, search and quick filters'` — asserts
  `Project views`, `aria-selected` on `All projects`, the tabs `Active` / `At risk`, the link
  `Edit Riverside Office Building`, the cells `In Progress` / `On Track` / `62%` /
  `Matt Johnson`, the checkbox `Select Riverside Office Building`, the copy
  `No projects found`, and the labels `Filter projects by schedule health` /
  `Filter projects by manager`. **None of these is a class or a style; all survive.** Note `62%`
  comes from `.hs-progress`, whose gradient goes flat — the text is unaffected.
- the four Projects mutation tests, the two Crews tests, the three Equipment tests, the Materials
  test and the two Field Updates tests — all match on accessible names in `.pdx` dialogs
  (`Edit Crew`, `Crew Name`, `Foreman`, `Count for role 1`, `Save Crew`, `/^Delete crew/`,
  `Confirm delete <name>`, `Add Equipment`, `Edit Equipment`, `Equipment Type`,
  `Remove Equipment`, `/^Correct this report/`, `Update`, `Status`, `Save changes`) and on the
  KPI labels `Active Projects` / `Total Equipment` / `Total Materials` / `Ready Now`. **All
  restyled, none renamed.**
- `Equipment`'s duplicated accessible name (`Edit <name>` on both the name link and the pencil,
  handled with `getAllByRole(...)[0]`) — **deliberately not "fixed"** (§7.39).
- `tests/index-pages.test.tsx:541-543` asserts the **Field Updates inline composer**
  (`getByLabelText('Field update project')` and `('Field update job')`) is still on the page,
  which the shared chrome's `formInputs` list does not mention. The composer stays; its labels
  are styled as eyebrows and its fields get the `:focus-visible` ring `.form-stack`'s
  `outline: 0` currently steals (§2.7).
- `tests/index-pages.test.tsx:551` pins the field-update PATCH response shape
  `{ update, variance: null }` — untouched, this is a presentation-only plan.
- `test/appHarness.tsx:121-129 openAppPage()` is how all 12 navigate, and it depends on the rail
  chrome twice (hub name regex; menuitem name starting with the page label). **Neither changes**;
  the star stays a sibling (B-4).

---

### B-7. Shared legacy primitives (`styles.css`) — PageTitle / Badge / Panel / InlineEmptyState / ResourceRow / kpi-card / table-row / empty-state / buttons

**Today.** The pre-HubSpot language the reskinned pages still lean on: the layout stack, the page
header, the stat card, the section panel, the status badge, two empty states and the button
family — plus a `:root` token set in which `--orange` is literally `#2f6bff` and `--yellow` is
`#0046f7`.

**Becomes.** Re-skinned in place under `.bf-shell`, with the single-use primitives left alone and
the token contradictions resolved.

**Every information item placed (14/14).**
1. **`PageTitle`** — `h1` 27px + a muted `<p>` + an actions slot on a `--line` bottom border.
   **Used exactly once** (`App.tsx:38889`, the Reports page). → `var(--bf-app-title)` /600, sub
   at `var(--bf-app-lede)` 62ch, border `rgba(28,28,26,0.07)`. Effectively dead, but **kept**
   because Reports renders it and its `data-tutorial-id` slot is live.
2. **`Badge`** — `<span class="badge <statusTone(status)>">`, `26px` min-height, `12px/800`,
   `nowrap`, four tone lists keyed on lowercased-hyphenated status strings, **with anything
   outside them falling through to the blue default**. 15 call sites. → 999px (which
   `redesign.css:233` already forces, at weight 750 — the `6px` radius in `styles.css:12448` is
   already dead), `var(--bf-app-micro)` `11px/700`, the four tone pairs re-based onto
   `--hsx-green/-amber/-red/-blue` softs. **The allow-list is re-derived by hand, not
   re-themed** — `DelayIQ Reported` maps to `delayiq-reported`, which is in none of the three
   lists and renders blue today, a live example of the silent fall-through. Preserved.
   **And the blast radius is real: 8 of the 15 call sites are in `WelcomeDemoScene`**, the
   marketing landing page's demo mocks — so restyling `.badge` changes the public site. That is
   acceptable here only because the Welcome Page is the target language; verified in §9.
3. **`Panel`** — `<section class="panel" data-reveal?>` + `.panel-header` (h2 + an optional
   right-hand text button with `aria-pressed`). 9 call sites: Map & Field Ops ×4, DelayIQs ×3, 2
   others; titles `Travel Time Overview` (action `View details`), `Crew View` / `Log DelayIQ`,
   `DelayIQ Categories`, `Impact ForecastIQ`. → radius 18px (from `8px`, lifted to `12px` by
   `redesign.css`), `0 10px 30px rgba(28,28,26,0.05)` (from `0 16px 34px rgba(31,56,88,0.06)`),
   head `h2` → `var(--bf-app-section)`, the head button slides 3px and drops its `#0a4ea0` hover
   for `#2f6bff`.
4. **`InlineEmptyState`** — dashed `#cbd8e7`, `8px`, `#f6f7fe`, `min-height 96px`, a 28px icon,
   a `14px/900` title and a `12px/700` non-italic `<em>`. 10 call sites. → dashed
   `rgba(28,28,26,0.13)`, radius 12px, fill `rgba(28,28,26,0.02)`, title `13.5px/600`, `<em>`
   `12px/500` `#8a877e` at 62ch. Copy verbatim (`No delayIQ forecastIQ yet` / `ForecastIQ starts
   once delayIQs are logged.`).
5. **`.empty-state`** — the left-aligned grid variant → same treatment, `justify-items: start`
   kept, `svg opacity .9` kept.
6. **`ResourceRow`** — 30px icon column + title/detail + a `Badge`, `min-height 54px`, blue icon.
   3 call sites. → icon at radius 12px, title `13.5px/600`, detail `12px` `#8a877e`.
7. **`.kpi-grid` / `.kpi-card`** — a 4-column `minmax(180px,1fr)` grid at 18px gap, a 108px
   flex card, `.kpi-card-button` with `translateY(-3px)` + `--shadow-card-hover` + a
   `rgba(251,133,0,0.34)` hover border, `strong` at 800 `tabular-nums`. **`.kpi-grid` has exactly
   one consumer** (the Dashboard KPI board, with `data-reveal-stagger`) and the bare class
   `kpi-card` appears nowhere in `App.tsx` — it arrives only through `<KpiCard>`. → radius 18px,
   `0 10px 30px rgba(28,28,26,0.05)`, lift **`-4px`** (licensed: `.kpi-card-button` is a
   disclosure control whose whole boundary is the target), hover border
   `rgba(47,107,255,0.28)`, `strong` → `var(--bf-app-figure)`/700, label → the eyebrow,
   `.kpi-icon` at radius 12px **dropping its inset white highlight** (a Material-era bevel).
8. **Buttons** — `.icon-button` / `.outline-button` / `.primary-button` / `.export-button` /
   `.toggle-button`. → `.primary-button`'s `linear-gradient(180deg,#2e69ff,#2f6bff)` **flat
   `#2f6bff`** with `0 4px 12px rgba(47,107,255,0.2)`; its hover drops
   `0 14px 30px rgba(251,133,0,.36)` and `filter: brightness(1.04)` for
   `0 8px 22px rgba(47,107,255,0.28)`; `.outline-button` **inverts**; `.icon-button` washes and
   presses `scale(0.94)`; all radii → the ladder (`--r-sm 9px` retired). `.primary-button.danger-button`
   keeps red.
9. **`.search-box`** — the top-bar magnifier + **read-only** input + the `⌘K` `<kbd>`. → the
   999px pill of preserve §5a; `:focus-within`'s orange ring → `#2f6bff` +
   `var(--bf-focus-ring)`. **It stays a read-only `<input aria-label="Search BuildFlow">` inside
   its `<label>` with both `onClick` and `onFocus`** — `enterDashboard()` gates on
   `findByLabelText("Search BuildFlow")`, so this is the single most dangerous element in the
   shell to restructure. Restyled only. The `<kbd>` prints a hardcoded Mac `⌘K` on every
   platform; **preserved** (§7.40).
10. **`.table-head` / `.table-row`** — `12px/800` uppercase muted 34px heads and 58px rows with a
    `rgba(21,104,201,0.04)` hover, still used by `.data-table` / `.project-table-grid`. → the
    head becomes the **canonical eyebrow**, the row wash becomes `rgba(28,28,26,0.035)`. Row
    height 58px frozen.
11. **`.page-stack`** — the grid every in-app page root uses, 18px gap; `.hs-index.page-stack`
    overrides its columns to `minmax(0,1fr)` so a `nowrap` table cannot blow the card out.
    **Both frozen**; the gap goes to `var(--bf-rhythm-dense)` and the stack gains
    `padding-bottom: var(--bf-app-tail)`.
12. **`.panel-note`** — a 12px inline note, `#e6edff` on a `rgba(247,181,0,0.28)` border. →
    `rgba(47,107,255,0.06)` on `rgba(28,28,26,0.13)`, radius 12px, 62ch.
13. **`.legend-list i`** dots with a 3px `rgba(15,35,58,0.04)` halo → `rgba(28,28,26,0.04)`.
14. **The base `:root` tokens** (`styles.css:1`) — `--navy #061c30`, `--navy-2 #092a45`,
    `--orange #2f6bff` (renamed but now blue), `--blue #2f6bff`, `--green #20b15a`,
    `--red #ef4444`, `--yellow #0046f7`, `--violet #6d45d8`, `--line #e2e4f3`,
    `--muted #6b7a90`, `--panel #fff`, `--soft #f5f6fe`, page background `#ebedfb`, the Inter
    stack, `font-synthesis: none`. → the page background goes **flat `#f5f6fa`** (from `#ebedfb`);
    `--line → rgba(28,28,26,0.13)`; `--muted → #575550`; `--soft → #f5f6fa`. **`--orange` and
    `--yellow` keep their misleading names** — renaming a token consumed 500+ times is a refactor,
    not a re-skin — but both are logged in §7.41.

**Every action placed (4/4).** 1. `Panel`'s optional header button → `onAction()` with
`aria-pressed`. 2. `PageTitle`'s actions slot. 3. `.kpi-card-button` → opens/closes the matching
dashboard feed (an ARIA disclosure: `aria-expanded` + `aria-controls="dashboard-kpi-feed"`).
4. The globals `button:disabled { cursor: not-allowed; opacity: .62 }` and
`button,input,select,textarea { font: inherit }`. All unchanged.

Plus the four shared primitives the audit found, all of which live here:
- **`KpiCard`** (`schedule/parts/shared.tsx:16`) — with an `onClick` it renders
  `<button class="kpi-card kpi-card-button [active]" aria-expanded aria-controls>`; without one,
  a plain `<div class="kpi-card">`. Inner markup `.kpi-icon <tone>` + 32px icon + `<p>label</p>`
  + `<strong>value</strong>` + `<span>delta</span>`. **Its `title` prop is "What the number
  counts" — basis information that exists only as a tooltip**, so `RailTooltip` is wired to it
  to make that reachable on touch.
- **`DxTilt`** (`:71`) — the ±7deg pointer tilt on every dashboard KPI card. **This is the fourth
  hover move, already shipping** (§1.6). Clamped to `var(--bf-tilt-dense)` = ±5deg and **given
  the `prefers-reduced-motion` guard it lacks in JS** — the one behavioural line this cluster
  adds, and it is an accessibility fix.
- **`ScheduleBadge`** (`:98`) — a second consumer of `.badge` + `statusTone` that **relabels
  `Ready to Start` to `Ready`**, so the same status prints different text depending on which
  component renders it. Preserved; logged in §7.42.
- **`ScheduleSelect` / `.select-box`** (`:103`) — `label.select-box > select[aria-label]` +
  ChevronDown(16), the pre-hs sibling of `.hs-qf`. → the same borderless pill treatment so the
  two stop reading as different controls.
- **`.form-stack`** (`styles.css:8883` + `12400`) — grid, 10px gap; label `#415672`/800; inputs
  full-width, `1px --line`, `7px` radius, `10px 12px`, `#10203f`, **`outline: 0`**; textarea
  `min-height 130px`. 4 call sites incl. the DelayIQs rail form. → labels become eyebrows, inputs
  radius 8px on `rgba(28,28,26,0.13)`, colour `#1c1c1a`, and **`outline: 0` is replaced by
  `var(--bf-focus-ring)`** — the one proven focus failure in the cluster (§2.7).

**States.** *Empties (3):* `InlineEmptyState`, `.empty-state`, and `.dashboard-feed-empty`
(`No items to show` / `This category is clear right now.`). *Loading:* **no shared skeleton
primitive exists anywhere in this area, and none is added.** *Error:* the App-level data-error
screen is the only shared error surface (`styles.css:13621`, whose own comment names
`Back to log in` as the escape hatch).

**Motion.** `redesign.css`'s card family (`.kpi-card`, `.dashboard-feed-panel`, `.panel`,
`.resource-card`, `.project-hero`, `.project-switcher`) unifies on a 220ms
box-shadow/transform/border transition → `var(--bf-dur-hover)` on `var(--bf-ease)`. **The second
`!important` pass (`redesign.css:295-341`) forces `--r-md` + `--shadow-card` on ~28 module card
classes and gives seven a `translateY(-2px)` lift** — that `!important` block is the one place
the new sheet cannot win by specificity, so **it is edited in place**: `--r-md` becomes 18px and
the seven lifts become `var(--bf-lift-dense)`, rather than fighting it. `.nav-item`'s 160ms and
`:active translateX(1px)` → the press duration. **`redesign.css` has no
`prefers-reduced-motion` block, so its hover lifts and 220ms transitions apply even under reduced
motion — it gains one**, reading the amplitude tokens so it degrades for free.

**Tests touched.** No test targets these primitives by class. `Badge` text is asserted
indirectly — `tests/index-pages.test.tsx` expects the row text `In Progress` from
`<Badge status={project.status}/>`. Text unchanged, **keeps passing**.

---

### B-8. `DashboardFeedPanel` (shared live-feed panel)

**Today.** The drill-down for a dashboard KPI, opened by clicking a KPI tile: a `role="region"`
with an eyebrow, an `h2`, a live summary sentence and a list of rows each carrying a `Badge`.

**Becomes.** Radius 18px, `0 10px 30px rgba(28,28,26,0.05)`, border `rgba(28,28,26,0.07)`; the
eyebrow becomes the canonical eyebrow (from `#7c8aa1` / `0.09em` to `#8a877e` / `0.045em`); `h2`
→ `var(--bf-app-section)`; the summary `<p>` → `var(--bf-app-lede)` at 62ch; rows at
`13.5px/600` `<strong>` + `12px` `#8a877e` `<em>` + the 999px badge, with a
`rgba(28,28,26,0.035)` hover wash and a 3px slide.

**Every information item placed (6/6).** 1. `section role="region" id="dashboard-kpi-feed"
aria-label '<title> live feed'` — **the id is `aria-controls`' target on `KpiCard`, frozen.**
2. Eyebrow `Live feed`. 3. `h2` = one of `Today's Jobs` / `Crews Scheduled Today` /
`Equipment In Use` / `DelayIQed Projects`. 4. The four computed summary shapes, verbatim
(`<N> job(s) active on <date>. <±N vs last week>.` etc.). 5. Per-row `<strong>` + `<em>` detail
— all four detail shapes incl. `No assigned jobs listed` and the `scheduleHealth` fallback.
6. Badges = the raw record status strings.

**Every action placed (2/2).** 1. Close (`.icon-button`, 18px X,
`aria-label 'Close <title> live feed'`) → `setActiveFeed(null)`. 2. Clicking the same KPI tile
again also closes it (the `DashKpiCard` toggle). Unchanged.

**States.** `.dashboard-feed-empty` — `No items to show` / `This category is clear right now.`
→ dashed `rgba(28,28,26,0.13)`, radius 12px, **its soft vertical gradient forced flat** (§2.6),
title `13.5px/600`. No loading, error or lock.

**Motion.** Inherits the shared card transition; **no entrance animation, and none added** — it
appears in response to a click, and an entrance would fight the disclosure. Hover: **3** on rows.

**Tests touched.** None.

---

### B-9. Global chrome (`redesign.css`) — focus ring, scrollbars, selection, token layer

**Today.** The one global polish layer, whose own header comment claims it is "Loaded LAST so it
wins at equal specificity" — **which is now false**: it is import 2 of 62 and loses to ~55 later
sheets.

**Becomes.** The layer stays where it is (reordering regresses everything) and its **values** are
corrected, because that is what actually renders. Everything here is in §2.6 and §2.7; the
placement:

**Every information item placed (8/8).**
1. **The `:root` tokens** — `--shadow-xs` / `-card` / `-card-hover` / `-pop` → the ladder's
   raised / card / card-hover / float steps; `--shadow-accent` `rgba(251,133,0,0.26)` →
   `rgba(47,107,255,0.2)`; `--r-sm 9px` retired in favour of 8px, `--r-md 12px` → 18px,
   `--r-lg 16px` → 20px; `--line-soft #e7edf6` → `rgba(28,28,26,0.07)`;
   `--ink-strong #0d1f3c` → `#1c1c1a`; `--ink-soft #5b6b82` → `#575550`;
   `--focus rgba(251,133,0,0.3)` → folded into `--bf-focus-ring`.
2. `html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility }` → kept.
3. **`.app-shell` background** — `radial-gradient(1200px 460px at 80% -10%,
   rgba(21,104,201,0.05), transparent 62%)` over `linear-gradient(180deg, #eef3f9, #f5f6fe 44%)`
   → **flat `#f5f6fa`.** This is the "one ground" rule, and it is the largest single colour
   change in the plan: today the app ground is a two-stop gradient with a blue bloom, which is
   exactly the banding the Welcome Page forbids.
4. `::selection rgba(251,133,0,0.22)` → `rgba(47,107,255,0.16)`.
5. **Scrollbars** — `scrollbar-width: thin`, `scrollbar-color: #c6d3e5 transparent`, an 11×11
   `::-webkit-scrollbar` with a `#c6d3e5` 999px thumb inset by a 3px transparent border
   (`background-clip: content-box`), hovering `#a9bcd4` → thumb `rgba(28,28,26,0.18)` hovering
   `rgba(28,28,26,0.28)`, geometry and the inset trick unchanged.
6. **The focus ring** — `:where(...)` → `.bf-shell :is(...)` with `box-shadow:
   var(--bf-focus-ring)` (§2.7). `:where()` is removed, not restyled: it is both zero-specificity
   (beaten by 36 `outline: 0` rules) and a documented jsdom breaker.
7. **Topbar** `rgba(255,255,255,0.82)` + `saturate(1.4) blur(11px)` + a `--line-soft` bottom
   border → `rgba(245,246,250,0.82)` + `blur(14px) saturate(140%)` + `1px
   rgba(28,28,26,0.13)` (the strong hairline, per §2.11). **The only licensed `backdrop-filter`
   in the app.**
8. Notification / support popovers (`.notifications-panel`, `.support-chat-panel`) → radius 18px
   + `0 24px 70px rgba(28,28,26,0.14)`.

**Actions.** None (`actions: none`).

**States.** None of its own.

**Motion.** No keyframes; only transitions (cards 220ms, buttons 150ms, nav 160ms, tables 140ms)
and hover transforms → the four interaction durations on `var(--bf-ease)`. **It gains its first
`prefers-reduced-motion` block**, reading the amplitude tokens.

**Tests touched.** None. `:where()`'s invisibility in jsdom means no test can observe the focus
change either way — which is exactly why it must be verified in a browser (§9).

---

## 5. Screen-by-screen: AI modules (12)

### A-0. BuildFlow AI assistant panel (`BreezeAssistant`) — docked + expanded

> **CLUSTER-CRITICAL CONSTRAINT, stated before anything else.** The panel is a `createPortal` to
> `document.body`, `position: fixed`, `top: 56px`, `left: 56px`, hidden by
> `.bf-breeze:not(.is-open) { display: none }`. It **must stay always-mounted and hidden by that
> `display: none` rule.** Showing it with `opacity`/`visibility`, or mounting it conditionally,
> breaks `schedule/viewKeys.ts`'s `dialogIsOpen()` and with it the **schedule 1–6 view
> shortcuts**. And per this repo's own recorded trap, an author `display` rule beats `[hidden]`,
> so nothing in the new sheet may declare `display` on `.bf-breeze` or any ancestor. The
> `aria-hidden={!open}` on the panel root stays.
>
> Its `top: 56px` / `left: 56px` / `width: min(600px, 100vw - 56px)` literals stay **valid**
> because the chosen concept freezes `--hs-topbar-h` and `--hs-rail-w` at 56px. They are still
> rewritten to `var(--hs-topbar-h)` / `var(--hs-rail-w)` so the next concept does not inherit the
> trap — a change that is a no-op today by construction.

**Today.** A HubSpot-Breeze-style chat with two layouts (docked card beside the rail; expanded
across the content with a left sidebar): a hero prompt, a Suggested list, four quick-action cards,
a conversation thread with a quantum-cloud thinking row, a composer with attach / tools / voice /
send, an attachment strip, a full-panel drop overlay, and a Tools popover naming five Claude
models. It also runs the photo/video schedule migration, which writes real data.

**Becomes.** The same panel with paper surfaces, one curve and one ink.
- **Frame:** `.bf-breeze` padding 14px kept; the docked card and the expanded main get radius
  **20px** (the base card rung — this is the largest floating object in the app after the
  dialogs), `#fff`, border `rgba(28,28,26,0.07)`, `0 24px 70px rgba(28,28,26,0.14)`.
  **No `backdrop-filter`** (§2.6). Tokens re-based: `--bfz-navy #14203a → #1c1c1a`,
  `--bfz-line #e6e8f0 → rgba(28,28,26,0.13)`, `--bfz-faint #8a92a6 → #8a877e`,
  `--bfz-paper #f5f6fa` and `--bfz-blue #2f6bff` already correct, `--bfz-ease` already the
  signature curve.
- **Header:** `BuildFlow AI` + the Sparkles mark → `var(--bf-app-section)` 16px/600; the mark
  keeps the **licensed trio gradient**.
- **Hero:** the empty-thread heading → `var(--bf-app-title)` = `clamp(22px,1.9vw,26px)`/600/
  `-0.02em`, at 62ch. This is the one place in the app where an *empty* state carries the page's
  largest type, which is exactly the Welcome Page's grammar.
- **Thread:** user bubbles → `rgba(47,107,255,0.08)` on `#1c1c1a`, radius 18px with one 8px
  corner; assistant bubbles → transparent on the panel ground with the Sparkles mark, body
  `13.5px/1.5` at **62ch** (today they run the full panel width, which at 600px is ~72ch — the
  single biggest readability win in the panel). Bullet lists `13px/1.45`. Follow-up suggestion
  chips → 999px outline pills that **invert** (move 2).
- **Suggested list:** the `Suggested` head + Lightbulb → the canonical eyebrow; rows `13.5px/500`
  with a 3px slide (move 3).
- **Quick actions:** the four cards → radius 18px, `#fff`, `0 10px 30px rgba(28,28,26,0.05)`,
  hover **lift `-4px`** (licensed, clause 1 — the whole card fires a question). **They must stay
  four and stay in order** or the `:nth-child(2|3|4)`-driven `--i` stagger
  (`calc(.14s + .05s * var(--i))`) silently breaks.
- **Composer:** radius 18px, `:focus-within` → `var(--bf-focus-ring)`; the auto-grow textarea's
  120px cap frozen; the `+` / mic / Tools / send buttons → 32–36px at radius 12px with
  `scale(0.94)` press; send is a blue 999px circle.
- **Tools popover:** radius 18px, `0 24px 70px rgba(28,28,26,0.14)`, head → the eyebrow, rows
  `13.5px/500` + a `12px` `#8a877e` description + the model name at `11px` `#8a877e`.
- **Expanded sidebar:** ground `#f5f6fa` (it is a second surface, so the hairline between it and
  the white main is `rgba(28,28,26,0.13)`), brand row `16px/600`, search field a 999px pill, nav
  rows `13.5px/500` with a 3px slide, list heads → the eyebrow, rows `13px` + `12px` `#8a877e`
  meta.
- **Drop overlay:** `rgba(245,246,250,0.92)` with a dashed `rgba(47,107,255,0.4)` inset, copy at
  `var(--bf-app-section)`.

**Every information item placed (26/26).**
1. Panel title `BuildFlow AI` + Sparkles (hidden in the header when expanded) → the header.
2. Both empty-thread headings (`What's on your mind, {FirstName}?` docked /
`Ask me anything, {FirstName}` expanded) → the hero at `var(--bf-app-title)`.
3. User and assistant bubbles → as above.
4. Per-assistant-message paragraph + optional bullet list + optional follow-up chips → as above.
5. Thinking row: `CloudLoader` + `TextShimmer 'Thinking…'` → kept, both components reused.
6. Import progress row: the loader + the **four** cycling step labels verbatim
(`Reading your schedule from N file(s)…` → `Detecting jobs, phases, and projects…` →
`Adding jobs and projects to your BuildFlow schedule…` → `Optimizing the imported schedule…`).
7. The attachment note appended to answers (`(I see N attached file(s) — I can't read their
contents yet…)`) → verbatim, 62ch.
8. `Suggested` head + its three items (`What's at risk this week?`,
`Suggestions to optimize my week`, `Switch from another scheduler`) → the eyebrow + rows.
9. The four quick-action cards (Summarize / Optimize / How do I / Risks) with their icons.
10. Composer placeholder `Ask BuildFlow AI or @ mention a project`.
11. Listening banner `Listening… speak your question` + the pulsing dot (`bfz-pulse` 1s
infinite, name kept).
12. The three voice hints verbatim.
13. Tools menu header `AI models by capability` → the eyebrow.
14. **All five `AI_TOOLS` rows with their exact model names** — `Weather Integration · Live
conditions + site-impact reads · Claude Haiku 4.5`; `Schedule Suggestions · Sequencing & week
look-ahead · Claude Sonnet 5`; `Crew Suggestions · Load balancing & assignments · Claude Sonnet
5`; `DelayIQ Detection · Real-time schedule-risk signals · Claude Haiku 4.5`;
`Route Optimization · Crew & material routing · Claude Opus 4.8`. **Verbatim** — these are
user-visible model names and a re-skin must not drop or rename them.
15. Disclaimer `AI-generated content may be inaccurate.` → `11.5px` `#8a877e`, always visible.
16. Expanded sidebar: brand row, search field, nav (New chat / Chats / Artifacts / Projects |
Memories / Prompts), and the list title tracking the active view.
17. Chats rows: title (first 64 chars of the first user message) + formatted date-time.
18. Artifacts rows: `Imported schedule` + `N project(s) built on the schedule`.
19. Projects rows: name + `{percentComplete}% · {scheduleHealth}`.
20. Memories lines (live counts): `N projects, N crews and N jobs on the schedule`;
`N equipment items and N material lines tracked`; `N open delayIQ(s) right now`;
`Signed in as {userName}`.
21. Prompts library: the trade starters + the six fixed entries.
22. Attachment strip (`aria-label 'Attached media'`) — image thumb or muted inline `<video>` with
a PlayCircle overlay, per-item remove → thumbs at radius 12px.
23. Drop overlay copy `Drop a photo or video to attach`.
24. `Open the schedule ↗` link (appears after a successful import) → `13px/600` `#2f6bff`,
slides 3px.
25. **The whole `buildAiAnswer` output surface** — optimization suggestions (crew rebalance with
both utilisation %s, jobs blocked on materials, the worst High-severity delay with `+impact`
days, assignment-conflict count, open readiness items, upcoming inspections, weather alerts by
severity, at-risk projects), risk lists, the per-delay line
`{title} — {project} · {severity} · +{n}d · {status}`, the per-crew line
`{name} ({specialty}) — {utilization}% · {status} · lead {lead}`, material counts, readiness
counts, assignment lines, weather lines, inspection lines, equipment counts, latest field
updates, milestones/targets, the portfolio health split, and the greeting/capabilities answer →
all of it renders through the bubble's paragraph + bullet-list treatment at 62ch. **No copy
touched.**
26. `AI_FEATURE_HELP`'s ~20 keyword-matched "how do I…" answers → same.

Plus the audit's additions, all placed: the **56 trade-specific starters** (14 `tradeProfiles` ×
4, e.g. Concrete's `Are we ready to pour tomorrow?`) driven through `aiStartersFor(profile)`,
which wraps them with `Switch from another scheduler` and `Suggestions to optimize my week`; the
**three `GENERIC_AI_STARTERS`** no-trade fallbacks (`What's at risk this week?`,
`How's crew capacity?`, `Any material shortages?`), also used sliced to 3 on the greeting answer;
each profile's `aiContext` (sent with the question, so the answer voice is trade-scoped); the
**second post-import message** `And here's how I optimized the imported plan:` with its four
fixed bullets, verbatim; `buildScheduleImportPlan`'s three named demo projects
(`Elm Street Office Fit-Out`, `Harborview Tenant Improvement`, `Ridgeline Warehouse Slab`) whose
names appear in the report bullets and then in the workspace; the Dashboard `Check Weather`
action's verbatim question; and **all 14 aria-labels / titles** (`Add photo or video` /
`Attach a photo or video`; `Talk to BuildFlow AI` ↔ `Stop voice input` with `aria-pressed`;
`Send`; `Close BuildFlow AI` / `Close`; `New chat`; `Expand the assistant` ↔
`Collapse the assistant` with `title 'Expand'`/`'Collapse'`; the sidebar's own
`Collapse the assistant`; `<nav aria-label='Assistant'>`; `aria-haspopup='menu'` +
`aria-expanded` on the Tools chip; `Remove {name}` per thumb; `aria-label={name}` on video thumbs
and `alt={name}` on images).

**Every action placed (32/32).** All 32 are restyled and none is moved:
top-bar sparkle `.hs-ai-button` (`aria-label 'Ask BuildFlow AI'`) with its
navigate-to-dashboard fallback when no `onAskAi` is supplied; the floating `Ask AI` FAB; Escape
(skipped while the Tools menu is open); the 80ms focus-the-composer timeout; typing in the
auto-grow textarea; Enter submits / Shift+Enter newlines; the send button (disabled while
thinking/importing or blank); each Suggested item; the four quick actions (Summarize → `Summarize
my portfolio status`; Optimize → `Suggestions to optimize my week`; **How do I → pre-fills
`How do I ` and focuses, does not send**; Risks → `What's at risk this week?`); follow-up chips;
the `+` file picker (`accept image/*,video/*`, multiple); drag-to-attach with its depth-counted
`dragenter/over/leave` and the `data-dragging` attribute; per-thumb remove (which **revokes the
object URL**); the Tools chip and its five `role=menuitemcheckbox` toggles (all five start
enabled); outside-click / Escape closing the Tools menu; the mic chip (rendered **only** when
`SpeechRecognition` exists — the redesigned composer must not reserve or assume that slot);
New chat (archives into Recents, max 20); Expand / Collapse; Close; sidebar search
(`aria-label 'Search chats, prompts and memories'`); sidebar nav; a Recents row (archives the
current thread first, then removes the reopened one); an Artifacts row → Schedule; a Projects row
→ `Give me a status read on {name}`; a Prompts row; `Open the schedule ↗` → Schedule;
`isScheduleImportIntent`'s loose regex routing to the import flow; the import flow itself
(base64-encode → `POST /api/ai/import-schedule` → real `createProject` / `createJob` /
`assignJob` in a loop → `reload()`); and the dashboard `Check Weather` bridge via
`requestDashboardAiAsk`.

Three action-side constraints the re-skin must respect:
- **The attachment lifecycle is manual.** Object URLs are created per file and revoked on remove,
  on send, and in an unmount cleanup reading `attachmentsRef` — and `runImport` must fetch the
  blob **before** the revoke. Restructuring the composer leaks blob URLs or breaks the import.
- **The import writes real data with no undo**, and `isScheduleImportIntent` already fires on
  loose phrasing. The redesign must not make it *easier* to trigger — so the drop overlay stays a
  deliberate two-step (drop, then send), and no quick-action card is wired to it.
- **The Tools toggles are decorative** (`enabledTools` is never sent to the server). A re-skin
  that makes them look more functional deepens the honesty gap the dashboard tests exist to
  close. They keep their current visual weight.

**States.**
*Empties (5):* the hero + Suggested + quick actions; `No chats`; `No artifacts yet — schedules
BuildFlow AI builds for you show up here.`; the import-with-no-attachments reply (verbatim, 62ch);
and `Everything looks healthy across your N projects — no urgent risks, blocked materials, or
overbooked crews right now.`
*Loading (4):* the thinking bubble (`CloudLoader` + `TextShimmer` at `duration 1.3 / spread 1.4`);
the deliberate 1100–1800ms demo-mode delay; the import bubble with its ~850–950ms beats; and the
disabled send while busy. **`CloudLoader` is the skeleton** — this panel has no other, and none is
added.
*Errors (5):* a live Claude failure silently falling back to the simulated answer (mode `demo`);
the zero-jobs import failure copy verbatim; partial-failure tolerance; the crew-already-booked
skip report verbatim; and the three voice errors. **The UI never tells the user which mode it is
in — preserved** (§7.44).
*Add-on lock:* **none, deliberately.** AI is not in `ADD_ON_PAGE_LOCKS`
(`// AI ships in every tier, so it never locks a page`), so the AI `AddOnPrompt` and the
flyout up-arrow tip are dead code paths for AI. Wiring them would change entitlement behaviour.
*Responsive:* at ≤720px (`hs-breeze.css:844-861`) the panel loses its 56px left offset
(`left: 0`, padding 8px), the docked width becomes `100vw`, quick actions drop to 2 columns, the
expanded main gets a full 16px radius — and **`.bf-breeze-side` is `display: none`, so on a phone
the entire sidebar (Chats / Artifacts / Projects / Memories / Prompts and its search) is
unreachable.** This plan does **not** silently delete a surface: it moves the sidebar's five
views into a horizontal 999px-pill tab strip above the thread at ≤720px, so every list stays
reachable. Declared change (§7.9).

**Motion.** `bfz-in` (panel slide `translateX(-16px) scale(.985)`), `bfz-pop` (hero mark),
`bfz-rise` (hero copy, messages, chips, quick actions, tools menu — retimed to the reveal
arithmetic, 12px / 0.55s / 50ms), `bfz-pulse` (listening dot) — **all four keep their names**;
`hs-breeze.css:872`'s reduce block nulls them by name. `CloudLoader`'s four particle orbits
(`quantum-red 3.8s` / `-blue 5.6s` / `-yellow 3.1s` / `-green 6.4s`, alternate, on `var(--qc-ease)`)
kept, tones re-based (§2.3). `TextShimmer`'s inline `cc-text-shimmer` **gains a reduced-motion
guard** — the one AI keyframe without one. The thread's smooth scroll-to-bottom keeps its
`typeof threadRef.current?.scrollTo === 'function'` guard **verbatim** — jsdom lacks it, and an
effect that throws there unmounts the whole tree.
Hover: **1** (lift) on quick-action cards and Recents/Prompts rows? — no: rows get **3** (slide);
**2** (invert) on suggestion chips; **1** on the four cards only.
Reveals: none (this is an overlay, not a scrolled page). Skeleton: `CloudLoader`.

**Tests touched (3 anchors).**
- `tests/settings.test.tsx:163` — the triple `['BuildFlow AI','BuildFlow AI','AI assistance']`
  must all render. Untouched (that is A-7).
- `tests/settings.test.tsx:179` — the AI settings category must have **exactly two**
  `aria-current='page'` buttons. Untouched.
- `tests/landing-menus.test.tsx:64` — the AI menu item `BuildFlow AI` → `href '#buildflow-ai'`
  with sub-label `AI tools for work`. Untouched (A-9's chrome).
- `tests/landing-menus.test.tsx:70-76` — `Schedule AI` / `Readiness AI` / `Field AI` are **not**
  rows while `Weather Integration` / `Schedule Suggestions` / `Route Optimization` **are**.
  Untouched.
**All keep passing unchanged.** The one live risk is the always-mounted/`display: none` contract,
which no test covers directly but which `schedule/viewKeys.ts`'s `dialogIsOpen()` and the 1–6
shortcut tests depend on — so it is a named review gate, not a hope (§9).

---

### A-1. AI schedule import dialog (P6 / MS Project) with schedule health check

**Today.** A three-stage dialog on the shared `.project-dialog` shell: choose (drop zone + three
format help cards), preview (a health teaser with a score ring, stats, per-project blocks with
phase chips and a sample activity table, and a warnings block), and done (the full health check —
score ring, grade pill, ForecastIQ completion panel with a dual meter, a P10–P90 confidence band,
health stats and a findings list). Nothing is written until Import is pressed.

**Becomes. The most information-dense AI visual in the app, and the one hardest to preview** — so
it changes conservatively: chart geometry frozen, chrome re-skinned.
- **Frame:** `.sim-dialog` radius **26px** (stage), `0 34px 64px rgba(28,28,26,0.13)`, border
  `rgba(28,28,26,0.07)`, `#fff`. Title → `var(--bf-app-display)` at
  `clamp(28px,3.2vw,38px)`/500, sub → `var(--bf-app-lede)` at 62ch.
- **Drop zone:** `.sim-drop` dashed `rgba(28,28,26,0.13)` → `rgba(47,107,255,0.4)` on
  `.dragging`, radius 18px, fill `rgba(28,28,26,0.02)` → `rgba(47,107,255,0.04)`, copy at
  `var(--bf-app-section)` + `var(--bf-app-meta)`.
- **Format help cards:** the three lose their frames (unlicensed) and become hairline-separated
  rows with an eyebrow title + `13px` body at 62ch.
- **Blocks:** every `.sim-*` block head → the canonical eyebrow; every stat label → the eyebrow;
  every figure → `var(--bf-app-figure)` with `tabular-nums`.
- **Score ring:** `.sim-ring` geometry **frozen** (`r=34`, `strokeDasharray`/`offset` from the
  score, the four `sim-tone-good/warn/risk/bad` classes, the `/ 100` label, the
  `stroke-dashoffset` transition). Tones re-based onto `--hsx-green/-amber/-red` + `#c5221f`.
- **ForecastIQ meter and confidence band:** `.sim-forecastIQ-meter` and `.sim-band-track`
  geometry **frozen** — the percent-complete fill, the time-elapsed tick, the P10–P90 track, the
  P50/P80 ticks, the plan marker and the `role="img"` + descriptive `aria-label`. Track fills go
  flat (no gradients), legend keys at the eyebrow size.
- **Sample activity table:** the shared table treatment — 42px eyebrow `thead` on a transparent
  fill, 46px rows, `13px` cells.
- **Findings:** `.sim-findings` rows lose their frames; each becomes a hairline row with a
  severity dot, an eyebrow-cased severity word, a `13.5px/600` title, a `13px` detail at 62ch,
  `<code>` chips at radius 8px on `rgba(28,28,26,0.05)`, and the `+N more` overflow.

**Every information item placed (19/19).** 1. Title `Import a schedule` + sub *"Bring an existing
Primavera P6 or Microsoft Project schedule into BuildFlow."* 2. Drop-zone copy
(`Drop your schedule file here` / `Primavera P6 export (.xer) or Microsoft Project XML (.xml)`).
3. The three format help cards verbatim, including *"Why not .mpp? — It's an undocumented binary
format — save it as XML first."* 4. Preview source row (detected label + filename + CheckCircle2).
5. Health teaser (ring + grade pill + headline). 6. The five preview stats (activities read, jobs
to create, phases, milestones, relationships, all locale-formatted) → the figure row. 7. Per-project
block (name; `{jobCount} jobs · {phases} phases · finishes {targetCompletion}`; phase chips each
with `title '{startDate} → {endDate}'`). 8. The sample activity table. 9. `+ N more activities`.
10. `Before you import` + every server warning, at 62ch. 11. Post-commit
`Imported N job(s) and N phase(s) into {project names}`. 12. Health hero (ring, grade pill,
`Schedule health check`, headline). 13. **The ForecastIQ completion panel** — heading
`ForecastIQ completion`, the five status badges (`Not started yet` / `On track` / `Slipping` /
`At risk` / `Complete`) with their Trending up/down icon, `Planned finish` → `Projected finish`,
and `Variance` as `on plan` / `N days late` / `N days early`. 14. The dual meter + its legend
(`{n}% complete`, `{n}% of time elapsed`). 15. The confidence band —
`{odds}% chance of hitting your {planFinish} plan date`, the P10–P90 track with P50/P80 ticks and
the plan marker, and the three legend keys (`Your plan`, `P50 · coin-flip`, `P80 · confident`)
each with its date. 16. The method sentence from `confidence.method` (or `forecastIQ.method`).
17. The five health stats (activities, complete, in progress, not started, links) → the figure
row. 18. The findings list. 19. The B/KB/MB file-size helper for the over-limit message.

Plus the audit: the ring's literal `/ 100` label; the verdict-pill thresholds (odds ≥70 `good`,
≥40 `warn`, else `bad`); the ForecastIQ panel tone rule (`good` for on_track|complete, `bad` when
`slipDays > 20`, else `warn`); **the visually inverted badge icon (TrendingUp when LATE,
TrendingDown when early)** — preserved as-is, and flagged (§7.47); the **six finding ids with
fixed severities** (`resource-conflicts` high, `behind-schedule` high, `late-start` medium,
`open-ends` medium, `leads` low, `long-duration` low, sorted by `severityRank`); the grade
thresholds (≥85 Healthy, ≥70 Monitor, ≥50 At Risk, else Critical); and **all four headline shapes
plus the four method sentences** verbatim, including `No dated activities to forecastIQ from.` and
`Only N% complete against M% of the timeline — too little progress to project a reliable finish.`

**Table columns (4/4).** Activity / Phase / Start / Finish → the shared table treatment.

**Charts (3/3).** All three geometries frozen (§ above); only fills, hairlines and label type
change. `CartesianGrid`-style hairlines land on `rgba(28,28,26,0.07)`, which the sibling DelayIQs
chart **already uses**.

**Every action placed (8/8).** `Choose file` (opens the hidden `accept '.xer,.xml,.mpp'` input);
drag onto the drop zone (`.dragging` class, first file read); picking a file →
`previewScheduleImport` → the preview stage; `Choose a different file` → back to choose;
`Import & see full health check` → `commitScheduleImport` → `onImported()`; `Cancel` /
`View my projects` (the same right-hand button, relabelled at the done stage); the close icon
(`aria-label 'Close schedule import'` — **test-pinned**); and the file input clearing after each
change so the same file can be re-picked after an error. All restyled, none renamed.

**States.** *Empties (3):* the choose stage is the empty state; the clean-findings line
*"No structural issues found — logic, durations, and resourcing all look clean."*; and Import
disabled at zero jobs. *Loading (3):* the reading stage (`CloudLoader compact` +
`Reading your schedule…` inside the drop zone); the committing stage (`role=status
aria-live=polite` + `CloudLoader` + `Importing your schedule…` + `{N} job(s) into {M}
project(s)`); and the `Importing…` label with every footer button disabled. *Errors (5):* the
`role=alert` block (AlertTriangle + a bold message + an optional hint) at 62ch; the client-side
`.mpp` guard with its hint verbatim; the 24MB guard with its hint verbatim; the server
`ScheduleImportRequestError` message + hint (preview failure → choose, commit failure → preview);
and the unknown-throw fallback `Something went wrong reading that file.` No add-on lock.

**Motion.** The `.dragging` transition retimed to `var(--bf-dur-hover)`; the ring's
`stroke-dashoffset` transition kept; `CloudLoader` orbits kept; the shared
`pdx-backdrop-in`/`pdx-dialog-in` entrance kept by name. Hover: **2** (invert) on the three
secondary footer buttons; **3** (slide) on the `+N more` disclosure. Reveals: none (a dialog).
Skeleton: `CloudLoader`.

**Tests touched (4 anchors).** `schedule/ScheduleImportDialog.test.tsx:87` (*previews a dropped
file through the API, then imports it and reports what it made*), `:114` (*refuses a .mpp before
any request, with the way out*), `:123` (*shows the server's reason and hint when the preview
fails, and goes back to choosing a file*), and `:37` (the fixture pinning the
`ScheduleForecastIQ` shape). All four match on **copy and API behaviour**, not on classes or
styles, and every string above is verbatim. **All four keep passing unchanged.**

---

### A-2. DelayIQ early warning panel ("What's trending behind")

**Today.** The proactive, read-only half of the schedule loop, in the DelayIQs page's 330px
sticky rail: a kicker, a heading, a count chip, a lead paragraph, then one risk card per job with
a severity pill, a slip chip, a trigger line, a date move, downstream trade chips and an
expandable chain table.

**Becomes.** A licensed panel (it is a `data-reveal` section with an internal expandable world),
re-skinned onto paper.
- **Frame:** `.diq-panel` radius 18px, `#fff`, border `rgba(28,28,26,0.07)`,
  `0 10px 30px rgba(28,28,26,0.05)`.
- **Head:** `.diq-kicker` `DelayIQ · Early warning` + its status dot → the canonical eyebrow with
  a `50%` dot. Heading `What's trending behind` → `var(--bf-app-section)` 16px/600. The count chip
  → a 999px pill. Lead → `var(--bf-app-lede)` at 62ch.
- **Risk cards:** unlicensed at rest (their boundary does nothing) → they lose their frames and
  become hairline-separated rows, which also fixes the current nesting of a bordered card inside
  a bordered panel inside a bordered rail. Severity pill 999px `11px/700`; slip chip 999px;
  trigger line `13px`; the date move `13px` with `tabular-nums`; trade chips 999px
  `11px` on `rgba(28,28,26,0.05)`.
- **Chain table:** the shared table treatment inside the expanded row — 42px eyebrow `thead`
  transparent, 46px rows, the `critical` tag as a 999px red pill (data, not accent).
- **Actions:** `Notify affected trades` → an outline pill that **inverts**; `See what it pushes
  (N)` → a text button that **slides 3px** with its ChevronDown rotating via `.open`.

**Every information item placed (13/13).** 1. Kicker + dot. 2. Heading. 3. Count chip
(`All clear` when empty, else `N at risk · M high`). 4. The lead paragraph verbatim (*"An early
read from the live schedule — the plan hasn't changed. Warn the trades now, or resolve the slip in
the variance drawer."*). 5. Severity pill (High / Medium / Low) with its TriangleAlert and
`aria-label '{severity} severity'`. 6. Job name + trade. 7. Slip chip `Finish +Nd` or the soft
`Float absorbing`. 8. Trigger line (`Overdue to start — N working day(s) late` /
`Trending N working day(s) behind`). 9. The `behind_pace` suffix
`· {percentComplete}% done vs {plannedPercent}% planned`. 10. Date move `current end → forecast
end` (short month/day, UTC). 11. `Pushes {trade, trade…}` chips, or *"Nothing downstream yet — it
slips only itself for now."* 12. The expandable chain table. 13. The as-of date in the all-clear
copy. Plus the audit: the outer `<section aria-label='DelayIQ early warning'>` with its rail class
`span-2`; the all-clear fallback to the literal `today` when the payload is null; and the fact
that `notifyDelayImpact` returns `{ notified, severity }` which the UI discards (it only shows
`Affected trades notified`).

**Table columns (4/4).** Downstream activity / Trade / Pushed to / Slip.

**Every action placed (3/3).** 1. `See what it pushes (N)` ↔ `Hide what it pushes (N)` per card
(only with downstream work). 2. `Notify affected trades` → `POST /api/delayiq/early-warning/notify`
with the `jobId`; becomes `Retry notify` on failure and is replaced by `Affected trades notified`
on success. 3. One `GET /api/delayiq/early-warning` on mount — **no manual refresh control here**,
and none is added.

**States.** *Empties (2):* the all-clear block (CheckCircle2 + `Nothing trending behind.` /
`Every in-progress activity is keeping pace with its plan as of {date}.`) and the per-card
no-downstream line, both at 62ch. *Loading (2):* `Scanning the schedule…` with a spinning
`Loader2` (`.spin` from `styles.css:13647`), and the notify button's spinner. **`.spin` is the
skeleton**; none is added. *Errors (2):* the fetch-failure block (AlertTriangle + the message,
defaulting to `Unable to load early warnings.`) and the `Retry notify` label. *Add-on lock:*
none — but the panel lives on the DelayIQs page, which is reachable from the Field hub whose
sibling Map page **is** locked, so the rail must render correctly when its neighbour is a locked
row.

**Motion.** The section carries `data-reveal` → **1 reveal**, retimed to 12px / 0.55s. Card and
button transitions → the four interaction durations on `var(--bf-ease)`. `delayiq.css` has **no
`@keyframes` of its own** and gains none. Hover: **2** (invert) on Notify; **3** (slide) on the
disclosure. Skeleton: the `.spin` loader.

**Tests touched (2 anchors).** `App.test.tsx:962-984` (the `earlyWarningPayload` fixture:
Drywall behind pace, pushes Paint) and `App.test.tsx:1010-1012`, which asserts the content
`'Drywall — Riverside Office Building'` and
`'3 working days behind pace · pushes Paint'` — **rendered via the dashboard's AI
Recommendations panel from the same endpoint**, not via this panel. Copy unchanged, **both keep
passing**.

---

### A-3. Dashboard "AI Recommendations" panel

**Today.** A draggable board panel (id `recommendations`, default slot `x:3 y:4 w:3 h:5`) showing
the top four at-risk jobs as recommendations with a Review action. Deliberately honest: with no
risks it says so.

**Becomes.** `.dash-block` treatment from the concept — radius **12 → 18px**, border
`rgba(28,28,26,0.07)`, `0 10px 30px rgba(28,28,26,0.05)` — with everything geometric frozen:
`DASH_COLS 6`, `DASH_ROW_UNIT 40`, `DASH_GAP 16`, `grid-auto-rows: 40px`, the four
`0.26s cubic-bezier(0.22,1,0.36,1)` transitions (**already the right curve**),
`.dash-block-body { overflow: auto }`, the drag handle, the resize grip and `dash:layout`
persistence.
- **Panel `h2` stays exactly `14.5px`.** `hs-home.css:1233` reads
  `.dash-block > .dash-drag-handle:has(+ .hs-widget-head) { top: -3px } /* 17px head row */` —
  that `-3px` is calibrated against a 17px head row, which is what `14.5px/650` produces. Change
  the panel title size and every drag handle on the board drifts. Tracking → `-0.01em`, colour →
  `#1c1c1a`; **size frozen.** This is the clearest example in the cluster of why a dense surface
  cannot simply adopt a marketing type scale.
- **Rows:** `.cc-rec` → hairline-separated rows (unlicensed frames go), severity chip 999px
  `11px/700` via `cc-sev-{severity.toLowerCase()}`, title `13.5px/600`, meta `12px` `#8a877e` at
  62ch, icon at radius 12px.
- **`.dash-block` never hover-lifts** — it is draggable, and a lift fights the grip. It gets
  `SpotlightSurface` instead, and its existing drag/resize/landing transforms are its motion.

**Every information item placed (6/6).** 1. Heading `AI Recommendations` + Sparkles → the
frozen 14.5px panel head. 2. Severity chip. 3. Title `{jobName}` or `{jobName} — {projectName}`.
4. Meta `{N} working day(s) behind pace|late to start · pushes {job, job}+N`, or just the behind
clause. 5. Icon = AlertTriangle on the critical path, TrendingUp otherwise. 6. Capped at the first
four risks. Plus the audit: the chip class is `cc-sev-{lowercased}` and resolved approvals reuse
the same chip as `cc-sev-accepted` / `cc-sev-rejected`.

**Every action placed (4/4).** 1. `View all` (`aria-label 'View all early warnings'`) →
DelayIQs — a text link that **slides 3px**. 2. Per-row `Review` (`aria-label 'Review {title}'`) →
DelayIQs — a 999px outline pill that **inverts**. 3. `Try again` on failure → bumps
`earlyWarningTick` and refetches. 4. Drag/resize on the board. All names verbatim.

**States.** *Empty:* `No jobs are trending behind. Nothing to recommend today.` — **test-pinned
verbatim.** *Loading:* `Checking the schedule…` *Error:* `Couldn't check for early warnings.` +
a `Try again` (RefreshCcw) inside `.hs-home-empty`. No lock. *Phone:* `DASH_STACKED_ORDER` puts
this panel **6th** and Pending Approvals **4th**; `dashPanelLimits` gives every AI panel
`minW 2 / minH 2 / maxW 6`. Unchanged.

**Motion.** The panel carries `data-reveal` → counted in the dashboard's budget (that cluster's
map owns the total). Hover: **2** on Review, **3** on View all, spotlight on the panel.
`.dash-block` never lifts.

**Tests touched (3 anchors).** `App.test.tsx:1068` (*says so when no jobs are trending behind
instead of inventing a recommendation* — asserts the exact empty copy); `:1010` (the real
recommendation text); and `:1020-1029`, which asserts the **removed invented copy never returns**:
`Lookahead Risk Scan`, `Active AI Workflows`, `Re-sequence drywall`, `Add 1 carpentry crew`,
`Cost Performance`, `Production Trend (Backlog)`, `Change Order #CO-129`, `Timecard Exception`,
`vs last 7 days`. **This is an honesty guard, and a redesign is exactly the moment someone
re-adds a plausible-looking AI panel.** Nothing here adds copy. **All three keep passing
unchanged.**

---

### A-4. Field variance proposal loop — field capture (`.fp-*`), PM review drawer (`.sv-*`), dashboard Pending Approvals

**Today.** Three surfaces, one loop: a percent-complete toggle + slider in the Field Updates
composer raises a priced, CPM-rippled variance **proposal**; a PM accepts or rejects it in an
inline drawer on the Schedule landing; and the dashboard mirrors it as Pending Approvals with an
Open/Resolved segment. **Nothing moves until a PM accepts.**

**Becomes.** Re-skinned in three places, with the honesty copy untouched and the slider's
plan-vs-actual gauge treated as a chart.
- **Field capture:** `.fp-progress` radius 18px, `rgba(28,28,26,0.07)`, its
  `[data-reporting="on"]` border/background transition retimed to `var(--bf-dur-hover)`; the
  toggle label → `13.5px/600` with the Gauge at 16px; the readout `{n}%` →
  `var(--bf-app-figure)` `tabular-nums` with `complete` at the eyebrow size; the 0/50/100 ticks
  at `11px` `#8a877e`; the custom slider track → `rgba(28,28,26,0.13)` with a `#2f6bff` fill, a
  `50%` thumb and `var(--bf-focus-ring)` on `:focus-visible`; the planned-today reference mark →
  a `#8a877e` tick.
- **Review drawer:** `.sv-drawer` — an **inline `<section>`**, not an overlay — radius 18px,
  `#fff`, `0 10px 30px rgba(28,28,26,0.05)`; head `Field variances` + ShieldAlert →
  `var(--bf-app-section)`, sub at 62ch; review-card frames go (unlicensed) → hairline rows;
  numbers at `var(--bf-app-figure)`'s floor with `tabular-nums`; the field photo at radius 12px;
  the note `<blockquote>` on a 2px `rgba(47,107,255,0.24)` left rule at `13px/1.5` 62ch; the cite
  line at `12px` `#8a877e`; the impact list icons at 16px `#8a877e`; the ripple `<details>`
  summary **slides 3px**.
- **Dashboard approvals:** `.cc-approval` rows → hairline rows in the 18px `.dash-block`, title
  `13.5px/600`, meta `12px` `#8a877e`, the side figure at `var(--bf-app-figure)`'s floor with
  `tabular-nums`, `<time>` at `11.5px`, the status chip 999px.

**Every information item placed (12/12).** 1. Toggle label `Report percent complete` + Gauge.
2. Readout `{n}%` + `complete`. 3. The 0/50/100 ticks. 4. `Planned today: {n}%` + the drift tag
(`{n}% behind plan` at ≤-5, `{n}% ahead of plan` at ≥+5, else `on plan`). 5. **The post-submit
confirmation, verbatim** — `Progress logged — and it flagged a schedule variance.` /
`You reported X% against a plan of Y%.` / `That forecastIQs the project N day(s) late.` or
`The schedule has float to absorb it.` / *"The dates haven't changed — a project manager reviews
it first."* 6. The drawer head + its sub, verbatim. 7. Review card head (the job's phase, falling
back to the job name; the project name; the severity pill). 8. Evidence (photo, note blockquote,
`{reporter} · {short date}` cite). 9. Numbers (`Reported {n}%`, `Planned {n}%`,
`ForecastIQ finish {date}` late/early coloured, `plan {date}` beneath). 10. The impact list —
`On the critical path` (Zap) or `{n} day(s) of float` (Clock);
`ForecastIQs {n} day(s) late|early` (TrendingUp); `Project finish moves {n} day(s)` or
`Project finish holds — float absorbs it` (ArrowRight). 11. The ripple `<details>`
`Pushes N downstream job(s)` with per-row `{currentStart} → {proposedStart} +Nd`. 12. The
dashboard row (title, `{project} · {severity} severity · critical path`, the side figure,
relative time, and the resolved chip `accepted` / `rejected`).

Plus the audit: the side figure has **three** forms — `+N working day(s)`, `−N working day(s)`
and the literal `On plan` at drift 0; the Resolved list is capped at 12; and every row wraps
`relativeTime(at)` in a real `<time dateTime={at}>`.

**Charts (1/1).** The field progress slider **is** a plan-vs-actual gauge (fill + planned-today
reference). Kept as a control, not converted to a chart component.

**Every action placed (11/11).** 1. Check/uncheck `Report percent complete` (disabled until a
job is linked). 2. Drag the range (0–100 step 5, `aria-label 'Percent complete'`,
`aria-describedby fp-progress-plan`). 3. Submit the field update (`percentComplete` sent only
when the toggle is on **and** a job is linked). 4. Dismiss the confirmation
(`aria-label 'Dismiss'`). 5. `Accept → schedule` (Check) → `acceptVariance(id, userId)` +
reload → a blue 999px pill. 6. `Keep the plan` → `rejectVariance` → an outline pill that
**inverts**. 7. Expand/collapse the ripple `<details>`. 8. The dashboard Open/Resolved segmented
toggle (`aria-label 'Approval view'`) → two 999px pills in a `rgba(28,28,26,0.05)` track.
9. `Approve the {title} variance` → the accept POST. 10. `Reject the {title} variance` → the
reject POST. 11. `View all` (`aria-label 'View all approvals on the schedule page'`) → Schedule,
slides 3px. **Every aria-label verbatim — four of them are test-pinned.**

**States.** *Empties (4):* `Link a job above to report progress against it.`; the drawer renders
**nothing at all** with no pending variances; the dashboard's `No approvals waiting on you`
(Open) / `Nothing has been resolved yet` (Resolved) — **both test-pinned verbatim**; and the
review card's `No note attached.` **Plus the audit's find: the dashboard empty state has an
action, not just copy** — an `.hs-home-empty-btn` with an ArrowRight labelled `See resolved` (in
Open) or `Back to open` (in Resolved) that flips the segment. It becomes an inverting outline
pill. *Loading:* Accept/Reject disable while `resolvingVarianceId` matches; the dashboard Approve
shows `Saving…`. *Errors:* the Schedule page notice
`Could not {accept|reject} the variance: {reason}` — **an unresolved variance is the safe
failure** — and the dashboard's `.cc-appr-error role=alert` line. No lock.

**Motion.** `sv-drawer-in` 0.22s (**name kept**; `field-variance.css:296` nulls it by name);
`.fp-progress[data-reporting]` retimed; the slider's `focus-visible` ring → `var(--bf-focus-ring)`;
`data-reveal` on the schedule layout that hosts the drawer. Hover: **2** (invert) on
`Keep the plan` and the empty-state button; **3** (slide) on `View all` and the `<details>`
summary. Skeleton: none — the surfaces render from already-loaded data.

**Tests touched (5 anchors).** `App.test.tsx:987` (*shows real field variances as Pending
Approvals and none of the invented dashboard copy* — asserts `Concrete - Level 3 Slab`,
`+3 working days`, `Riverside Office Building · High severity · critical path`); `:1032`
(*approves a variance on the server and drops it from the open list* — POSTs
`/api/schedule/variances/v-1/accept`, then the row appears under Resolved with `accepted`);
`:1336` (*rejects a variance on the server and keeps nothing waiting*); `:1315-1332` (the Reject
button's `aria-label` is pinned); and `tests/index-pages.test.tsx:551` (the field-update PATCH
response shape `{ update, variance: null }`). **All five match on copy, aria-labels and API
behaviour — none on classes. All keep passing unchanged.**

---

### A-5. CPM engine readout (`ScheduleCpmSummary`)

**Today.** A four-figure strip inside the `.filter-strip` on the Schedule landing **and on the
Gantt page** (`schedule/pages/GanttPage.tsx:499` — a second mount the inventory's entryPoint
omits), plus a Re-baseline button.

**Becomes.** The figure-row grammar, which is what it already almost is: four eyebrow-labelled
figures on the strip's ground, no frames.
- Labels → the canonical eyebrow; values → `var(--bf-app-figure)`'s floor (`20px/700/-0.02em`)
  with `tabular-nums`; `Critical path`'s `{n} <small>of {m}</small>` keeps its `<small>` at
  `var(--bf-app-meta)`; the `is-late` / `is-early` / **`is-on`** tone classes re-based onto
  `--hsx-red` / `--hsx-green` / `#575550`; the leading `GanttChartSquare` at 16px `#8a877e`;
  `Re-baseline` → an outline pill that **inverts**.

**Every information item placed (5/5).** 1. `Project finish` — the inclusive last working day,
formatted, or `—`. 2. `Critical path` — `{criticalPath.length} of {total tasks}`. 3. `vs baseline`
— `On plan` / `+Nd` (`is-late`) / `-Nd` (`is-early`) / `—`. 4. `Negative float` — the count of
tasks with `totalFloat < 0`, **shown only when > 0**, styled `is-late`. 5. The
`GanttChartSquare` leading icon.

**Every action placed (1/1).** `Re-baseline` → saves the current dates as the baseline; label
becomes `Saving…` while busy, disabled while busy. Unchanged.

**States.** *Empty:* `buildScheduleCpm` returns `null` with zero jobs, so the readout simply does
not render — **no empty state, and none added** (the honest answer). *Loading:* the `Saving…`
label. *Error:* a cycle → `role=alert` `Circular dependency — the network can't be scheduled.`
with the cycle rendered as `a → b → c` in `.sched-cpm-error` → `13px` `--hsx-red` on
`rgba(197,34,31,0.08)`, radius 12px, at 62ch. No lock.

**Motion.** None of its own — it inherits `.filter-strip` / `.sched-cpm` styling and the page's
`data-reveal`, and gains nothing. Hover: **2** (invert) on Re-baseline.

**Tests touched (2 anchors).** `schedule/cpm.test.ts` (5 named tests: *is nothing without jobs*;
*finds the critical path and the finish on a working-day axis*; *keeps an unlinked job where it is
planned, so the finish is the plan's finish*; *measures slip against the baseline in working
days*; *reports a cycle instead of scheduling one*) and `client/src/cpm.test.ts` (20+ engine
tests). **All are pure-engine tests with no DOM. All keep passing unchanged** — this plan changes
no logic. **`boundary.test.ts` constraint:** nothing here may be named `bf-sched-*` and no
`className` matching `/gantt-/` may appear in `App.tsx`; the readout's second mount lives in
`schedule/pages/GanttPage.tsx`, which is outside `App.tsx`, so it is unaffected.

---

### A-6. Schedule Status band — the "AI-forecast" completion readout (ForecastIQ surface)

**Today.** Four render paths: the **full** form on the Dashboard, a **compact** strip on the
Schedule landing and on the **Reports** page, plus failed and empty strips. (The audit corrects
the inventory here: the full form mounts **only** on the Dashboard, and the second compact mount
is **Reports**, not Projects. Projects has no band — it has the Forecast finish column, §6.6.)

**Becomes.** The figure-row grammar again, with the per-project rows as a hairline list.
- Eyebrow `Schedule Status` + its dot → the canonical eyebrow; the as-of line
  `Forecast from reported pace · {date}` → `var(--bf-app-meta)` `#8a877e`.
- **The headline figure** — magnitude + `day(s) ahead` / `day(s) behind` →
  `var(--bf-app-figure)` at its **ceiling** (`clamp(20px,1.6vw,26px)` → 26px on the Dashboard),
  `tabular-nums`, with `is-ahead` / `is-behind` tone classes on `--hsx-green` / `--hsx-red`. This
  is the largest figure in the cluster and it earns the top of the dense ladder.
- Week-over-week delta → `13px` with its TrendingUp/Down at 16px, or the muted fallback at
  `12px` `#8a877e`.
- The facts list → a figure row: eyebrow label + `tabular-nums` value.
- Per-project rows → hairline rows: name `13.5px/600`, `.ss-project-track` (geometry frozen,
  `--ss-progress`-driven, fill flat `#2f6bff`), percent `tabular-nums`, `±Nd`, and the forecast
  finish with its CalendarDays.
- Compact strip → a single 999px-pill row of the same figures, with `Forecast finish {date}`
  behind its Sparkles.

**Every information item placed (6/6).** 1. Eyebrow + dot + as-of line. 2. The headline figure.
3. The week-over-week delta, including the muted
`Tracking from this week — the first comparison lands next week`. 4. The facts list —
`Portfolio complete` with a ±pts delta; `Projects behind` N of M; `Reporting jobs` N of M;
`Portfolio value` compact currency with `{X} to go` or `{n} of {m} not priced` (**and it renders
only when `projects.length > 0`**). 5. Per-project rows. 6. The compact strip's five figures.

Plus the audit: **all four render paths carry `aria-label='Schedule status'` and
`data-tutorial-id='schedule-status-band'`** (the tour anchor — it must survive, and nothing may
become a transforming ancestor of it), the failed and empty strips also carry `role='status'`, and
the compact strip's `Forecast finish` is a derived **MAX** of every project's `forecastFinish`,
not a portfolio field.

**Every action placed (2/2).** 1. Click a project row → `onOpenProjects` → Projects; the row
gets a `rgba(28,28,26,0.035)` wash and a 3px slide. 2. `Retry` on a failed fetch → an inverting
outline pill.

**States.** *Empties (2):* the compact
`No dated projects yet — the status band fills in as work is planned.` at 62ch, and the full form
returning `null` with no payload — **so the Dashboard and Reports show nothing rather than a
fabricated band. Preserved; this is the honesty rule.** *Loading:* the compact
`Checking where the plan stands…` *Error:* `Schedule status couldn't load.` + `Retry`
(`.ss-strip.ss-failed`, `role=status`). No lock.

**Motion.** `data-reveal` on both forms → retimed to 12px / 0.55s. Hover: **3** (slide) on rows;
**2** (invert) on Retry. Skeleton: none — the loading strip is the skeleton.

**Tests touched (1 anchor).** `data-tutorial-id="schedule-status-band"` is the tour anchor and
must survive a redesign. It does. No unit test. **Nothing to update.**

---

### A-7. Settings → BuildFlow AI (feature settings)

**Today.** Three workspace switches, of which **only** `Schedule suggestions` has state
(`aiSuggestions`) and **none** has an effect — nothing in the app reads any of them.

**Becomes.** Restyled inside the Settings overlay, and **it gains the top bar** (preserve §6g
drops the `page !== "settings"` TopBar guard), so search, the bell, the account menu, the AI
sparkle, the bookmarks star and brand-home all become reachable from Settings for the first time.
- Eyebrow `Feature settings` → the canonical eyebrow; title `BuildFlow AI` →
  `var(--bf-app-title)`; description → `var(--bf-app-lede)` at 62ch; section heading
  `AI assistance` → the eyebrow; rows → hairline rows with a `13.5px/600` label and a `12px`
  `#8a877e` description at 62ch; the toggle track 999px on `rgba(28,28,26,0.13)` → `#2f6bff`;
  the two selects → the borderless `.hs-qf` pill treatment.
- **`.settings-panel-inner` must keep `sx-rise` and must never become `data-reveal`** — it is
  keyed by `activeSettingsView`, and `useHudMotion`'s reveal effect has deps `[rootRef]` only, so
  it never re-queries after a key change while the CSS rest state is `opacity: 0`. Converting it
  leaves Settings **permanently blank with no error** (§2.5).
- **The three ambient `dx-*` aurora blobs and `.dx-cursor` stay** — they are `--mx`/`--my`-driven,
  the same publisher `SpotlightSurface` reads.

**Every information item placed (6/6).** 1. Eyebrow `Feature settings`. 2. Title `BuildFlow AI`.
3. Description *"Control AI suggestions that help summarize blockers, schedule risk, and next
actions."* 4. Section heading `AI assistance`. 5. Row `Schedule suggestions — Let BuildFlow
suggest sequencing, crew moves, and readiness follow-ups.` 6. Rows `AI tone — Choose how
AI-generated notes should sound in reports and updates.` and `Review mode — Decide whether AI
drafts need approval before they are shared.` All verbatim.

**Every action placed (4/4).** 1. The `Schedule suggestions` toggle (default on). 2. `AI tone`
select — Concise / Detailed / Executive summary. 3. `Review mode` select — Always review / Review
external only / Auto-save drafts. 4. **Both** the rail nav item `BuildFlow AI` (Sparkles) **and**
the separate bottom-of-rail `.settings-ai-button` open this category, and **both** get
`aria-current='page'` when active. **They must stay two separate controls.**

**States.** No empty, loading or error (there is nothing to load). Lives inside the Settings
overlay, where the assistant panel is suppressed (`page === 'settings'`). No lock. **The honesty
constraint: three controls, one with state, none with an effect. The re-skin must not make the
panel look more capable than it is** — so the two inert selects keep the same visual weight as
the live toggle rather than gaining emphasis (§7.46).

**Motion.** `sx-rise`, keyed on the active view. Hover: **3** (slide) on the rail rows.

**Tests touched (2 anchors).** `tests/settings.test.tsx:163` — the triple
`['BuildFlow AI','BuildFlow AI','AI assistance']` must all render: unchanged.
`tests/settings.test.tsx:179` — **exactly two `aria-current='page'` buttons in the rail for this
one category**: preserved, because both controls survive. **Both keep passing unchanged.** The
one real exposure in the whole concept is rendering the TopBar on Settings, which touches this
file's other 7 tests — the `≥2 buttons named "Settings"` assertion runs *before* entering
Settings, `getByLabelText("Settings categories")` is the Settings page's own rail (not the
primary nav), and the post-close `queryByLabelText` absence is unaffected. **Run
`tests/settings.test.tsx` first; if it is brittle, drop the TopBar-on-Settings change — it is
independent of everything else in this cluster.**

---

### A-8. Schedule AI marketing page (`#schedule-ai` / `#buildflow-ai`)

**Today.** A public product page on the `.cs-page` welcome system. Every "panel" is a static
`aria-hidden` mock; no live data.

**Becomes.** This is a **Welcome-register** surface, not a dense one, so it takes the marketing
scale literally: hero `var(--bf-type-hero)` = `clamp(46px,6.8vw,96px)`, section h2
`var(--bf-type-h2)`, row h3 `var(--bf-type-h3)`, lede `var(--bf-type-lede)` at 52ch, section
rhythm `var(--bf-rhythm-section)` = 108px at 1440, page measure **1140px** (`.wx-main` applies
here — it is a marketing page), card lift `-6px`, reveals at the full 30px / 1s / 90ms. The only
change is the **accent**: `#1a73e8 → #2f6bff` per decision #2, which is the funnel following the
app.

**Every information item placed (11/11).** 1. Eyebrow `Schedule AI`. 2. The rotating `h1` prefix
`Schedule AI that thinks ` + all six `scheduleAiPhrases` (`a day ahead.`, `a week ahead.`,
`ahead of risk.`, `before you do.`, `one step ahead.`, `ahead of delayIQs.`). 3. The hero sub,
verbatim, at 52ch. 4. The hero mock `Schedule AI · Tomorrow` with its prompt chip and **all four
rows** verbatim (Concrete 1 double-booked / CLASH; Move slab → Concrete 3 / FIX; Rebar delivery
running late / RISK; Framing 2 has capacity / READY). 5. The explore band's eyebrow
`The AI planning layer`, `h2` `Everything Schedule AI should do.` and its sub. 6. The lead
feature mock `Tomorrow readiness · ranked` with all four `readyRows` verbatim. 7. The lead
feature `h3` `An always-on planning assistant.` 8. Feature grid 1 — `h3` `Spot conflicts before
they cost a day` with its `Conflict scan` mock, and `h3` `Rank ready work automatically`.
9. Feature grid 2 — `h3` `Draft recovery plans in seconds` and `h3` `Explain every change`.
10. The why-it-matters band `h2` `AI that protects the day, with humans in charge.` and its three
cards (Keep humans in control / Protect the promised date / Reclaim hours every week), verbatim.
11. The welcome footer's Product / Resources / Company columns.

**Every action placed (4/4).** 1. `Get BuildFlow →` (`WxMagnetic`, `aria-label 'Get BuildFlow'`)
→ enters the dashboard — keeps its magnetic pointer-follow at strength 0.34 springing back on the
0.28s curve. 2. `See it live` (PlayCircle, `aria-label 'See Schedule AI live'`) → the Schedule
page. 3. Footer links. 4. Reached from the landing AI menu item `BuildFlow AI` and the Product
menu item `Schedule AI`.

**States.** No empty, loading, error or lock — it is static marketing.

**Motion.** All five kept at marketing amplitude: the pointer auroras via `--mx/--my/--px/--py`
on rAF; the page's **own** `IntersectionObserver` at `threshold 0.14 / rootMargin '0px 0px -6%'`
→ **aligned to `0.16`** so it matches the documented contract (the `-6%` is already right);
`WxRotatingHeadline` with its `sr-only` a11y line (the three-layer convention: a
`visibility: hidden` ghost reserving layout, an `aria-hidden` animated layer, and one
screen-reader node carrying the real string, so the heading is announced exactly once);
`WxTilt` on the hero stage (`max 6, restRx 3, restRy -9`) — **move 4, at full marketing
amplitude**; `WxMagnetic`; and the per-card `--i` stagger on `.cs-feature`. Hover: all four
moves, at marketing scale.

**Tests touched (2 anchors).** `App.test.tsx:257` (*opens the Schedule AI page from the BuildFlow
AI direct hash route*) and `tests/landing-menus.test.tsx:113` (*opens the Schedule AI page from
the BuildFlow AI menu item*, asserting the `h1` `Schedule AI that thinks a day ahead.`, the `h2`
`Everything Schedule AI should do.`, the `h3` `Spot conflicts before they cost a day`, and the
hash `#buildflow-ai`). **Every asserted string is verbatim; both keep passing unchanged.** Note
the `h1` assertion pins the **first** rotating phrase, so the phrase order must not change.

---

### A-9. AI automation marketing pages (5, one shared template)

**Today.** One config-driven template (`automationConfigs` → `WelcomeAutomationPage`) rendered
five times — `#weather-integration`, `#schedule-suggestions`, `#crew-suggestions`,
`#delayIQ-detection`, `#route-optimization` — all on `weather-redesign.css`'s `.wi-*` scope.
Entirely static; none is wired to an AI endpoint.

**Becomes.** Welcome register, exactly as A-8, and **one change to any of them changes all
five** — which is the point: five pages, one stylesheet, one accent migration.
- Hero title `var(--bf-type-display)`, `h2`s `var(--bf-type-h2)`, features `var(--bf-type-h3)`,
  body at 44ch, rhythm 108px, measure 1140px, lift `-6px`, reveals 30px / 1s / 90ms.
- The per-page `--wi-glow` custom property stays (it is the config's identity), re-based so every
  glow is a `#2f6bff` alpha rather than five hues — **one accent, five intensities.**
- Accent `#1a73e8 → #2f6bff`.

**Every information item placed (7/7).** 1. Per page: eyebrow (the capability name), `heroTitle`,
`heroSub`, the glow colour, and the hero card (`cardIcon`, `cardTitle`, `cardSubject`, and
`cardRows` of three columns each with a `clear|rain|wind|storm` tone — e.g. Weather's
`Mon / 72° / Clear`). **The three columns are `wi-fd-day` / `wi-fd-temp` / `wi-fd-label` separated
by a dot** (audit). 2. The showcase band — `showcaseHead` eyebrow, `showcaseTitle` `h2`, and
exactly two items each with title, text, a `blue|lavender` tone and either a **board mock** (a bar
label + weekday columns of tone-coloured chips) or a **list mock** (a bar label + label/flag/tone
rows). 3. The capabilities band — eyebrow `Capabilities`, `featuresTitle` `h2`, and the 6–8
feature cards **per page, all named**: Weather (`Live forecastIQ overlay`, `Risk thresholds`,
`Safe work windows`, `Crew alerts`, `DelayIQ prevention`, `Historical patterns`); Schedule
Suggestions (`Ranked by impact`, `Capacity-aware`, `Readiness-first`, `Deadline guard`,
`Dependency-safe`, `One-click apply`, `Explains every move`); Crew Suggestions (`Skill matching`,
`Load balancing`, `Location-aware`, `Equipment fit`, `Availability`, `Explains the match`);
DelayIQ Detection (`Early warning`, `Root-cause signals`, `Field-driven`, `Impact mapping`,
`Recovery options`, `Nothing slips silently`); Route Optimization (`Smart sequencing`,
`Travel-time aware`, `Job clustering`, `Site access checks`). 4. The how-it-works band — the fake
console (`consoleTitle` + `consoleLines` of tag/text with an `ok` flag + a blinking caret) beside
eyebrow `How it works`, `stepsTitle` `h2` and a numbered 3-step `<ol>`. 5. The customer quote band
(`quote`, `quoteName`, `quoteOrg`), whose section is `aria-label`'d `{capability} customer quote`.
6. The CTA band (eyebrow `Get started`, `ctaTitle` `h2`, `ctaText`). 7. The shared welcome footer.

**Every action placed (4/4).** 1. Hero primary `Open live schedule` → the Schedule page.
2. Hero secondary `Get BuildFlow` → the dashboard. 3. CTA primary `Open live schedule`; CTA
secondary `Back to home`. **(All four labels from the audit — the inventory recorded only their
destinations.)** 4. Reached from the landing AI mega-menu via `aiAutomationRoutes`.

**Charts (2/2).** The board mock (a fake week board of tone-coloured day columns) and the list
mock (a fake risk list of label + flag rows). Both are `aria-hidden` decoration and both keep
their geometry; only tones and label type change.

**States.** None — static marketing.

**Motion.** `automationParticles` — **30 deterministic drifting particles rendered twice** (the
hero `.wi-particles` and a dimmed set inside the console) with per-particle x / delay / duration /
size / drift → kept, and **the whole field gets `aria-hidden` + `inert`** per the Welcome Page's
own convention for decorative fields. `data-reveal` on every section plus the per-item `--i`
stagger on `.wi-feature` and `.wi-step`. The blinking console caret. The `--wi-glow` hero glow.
**Every infinite keyframe here must appear in a reduced-motion null** — the particle field is the
largest ambient loop in the cluster and it must pause or null off-screen against a continuous
clock, the way the Welcome Page's bloom fields do. Hover: lift on `.wi-feature` at `-6px`.

**Tests touched (1 anchor).** `tests/landing-menus.test.tsx:74-76` — `Weather Integration`,
`Schedule Suggestions` and `Route Optimization` must be AI-menu rows. Untouched, **keeps
passing**.

---

### A-10. AI overview page (`#ai-overview`)

**Today.** The marketing hub indexing the AI sub-programs, on the shared `WelcomeOverviewPage`
with `layout: 'showcase'` (`.aix-*`) and a **purple** accent (`accentBg #efe9fb`,
`accentInk #7b3ff4`).

**Becomes.** Welcome register. **The one substantive change: the purple accent goes to
`#2f6bff`.** A per-page accent is the opposite of "one accent", and this is the AI hub — the one
page where the licensed trio can carry the identity instead. So `accentInk #7b3ff4 → #2f6bff` and
`accentBg #efe9fb → rgba(47,107,255,0.08)`, with the band's gradient line keeping `wx-grad-ai`
(a licensed marketing trio use). Declared visible change (§7.6).

**Every information item placed (7/7).** 1. Eyebrow `AI overview`; title
`Intelligence that keeps crews moving.` 2. The sub, verbatim, at 52ch. 3. Both intro paragraphs
(predictable break causes; ranked ready-to-act suggestions rather than another dashboard).
4. Stage caption `AI, working inside your schedule`. 5. The modules band — eyebrow
`What the AI does`, title `Signals in. Recovery out.`, and **all eight module cards** with their
kickers, titles, texts and icons: `Schedule AI` (→ `#buildflow-ai`, with `/ai-chat-composer.png`
and its descriptive alt), `Weather risk` (→ `#weather-integration`), `Schedule suggestions`
(→ `#schedule-suggestions`), `Crew suggestions` (→ `#crew-suggestions`), `DelayIQ detection`
(→ `#delayIQ-detection`), `Route optimization` (→ `#route-optimization`), **`Readiness scoring`
(no route)** and **`Recovery plans` (no route)**. 6. The band — eyebrow `BuildFlow AI`, lead
`Conflicts spotted.`, the gradient line `Recovery suggested.` and its supporting sentence.
7. The gallery band — eyebrow `AI in the field`, title `What the AI catches for you.` and all
four stat cards (`Weather delayIQs / 3 days / earlier warning`; `Double-bookings / 0 / surprise
conflicts`; `Missing materials / 100% / readiness checks`; `Missed milestones / -40% / fewer
slips`) → the marketing figure treatment at `var(--bf-type-figure)`.

**Every action placed (2/2).** 1. Module cards with a hash navigate; **the two without one are
inert.** 2. Reached by clicking the AI mega-menu heading (`overviewMenuRoutes.ai`).

**States.** None. **Honesty constraint:** `Readiness scoring` and `Recovery plans` describe
capabilities that **do not exist as features**. A redesign that gives them affordances — a hover
lift, a cursor change, an arrow — would be inventing modules. So they render with the card's
**static** treatment: no lift, no arrow, no pointer cursor (§7.48).

**Motion.** `.aix-hero` + `.aix-dots` — a full-bleed masked radial dot grid that drifts, pure CSS,
no canvas → kept, `aria-hidden` + `inert`, and nulled under reduced motion. The shared welcome
reveal/stagger conventions. Hover: lift `-6px` on the **six routed** cards only.

**Tests touched.** None (`testAnchors: none`).

---

### A-11. Quantum cloud "thinking" loader (shared AI motion primitive)

**Today.** `components/ui/quantum-cloud-loader.tsx` (one of the nine already-ported components) —
four glowing particles on long orbits at different speeds, `aria-hidden`, the caller always owning
the announced text. Used at five sites: the assistant thread, the assistant's import steps, the
schedule-import reading stage, the schedule-import commit stage, and the Field Updates dropzone.

**Becomes.** **The single visual signature for "BuildFlow AI is working", kept as-is** — it is
already the repo's own port convention (plain markup, inline styles, one companion stylesheet,
tokens with literal fallbacks, a `prefers-reduced-motion` block inside it). Two changes only:
- **Tones re-based onto the licensed trio's family:** `--qc-red #f87171 → #d96570`,
  `--qc-yellow #facc15 → #f9ab00`, `--qc-green #4ade80 → #34a853`; `--qc-blue` is already
  `#2f6bff`. So the loader stops being a fifth palette and becomes the trio in motion — which is
  a *use* of the licensed gradient family, not a sixth accent.
- `.qc-stage`'s frame (176×96 inside a `min-height: 200px`, `.is-compact` 56px) gets radius 12px
  where a frame shows at all; the geometry is otherwise frozen.

**Every information item placed (2/2).** 1. **No text of its own** — four coloured particles (red
fast inner, blue large outer, yellow centre, green slow orbital). Preserved, `aria-hidden`.
2. The `compact` prop for a chat bubble and the `className` for per-site sizing → both preserved;
the five call sites' classes (`.bf-breeze-cloud`, `.field-dropzone-cloud`, `.sim-cloud` ×2) all
keep their names.

**Actions.** None.

**States.** **It IS the loading state** for: assistant thinking, assistant import steps,
schedule-file reading, schedule commit, and field-update file reading/uploading. No empty, error
or lock. `--qc-ease cubic-bezier(0.37,0,0.63,1)` is a **third** curve in the estate — kept,
because it is a symmetric ease-in-out for a continuous orbit, which is exactly the case the
signature overshoot curve reads badly on. Declared and reasoned, not silently retained (§7.51).

**Motion.** `quantum-red 3.8s` / `quantum-blue 5.6s` / `quantum-yellow 3.1s` /
`quantum-green 6.4s`, all `alternate` on `var(--qc-ease)`, with `animation: none` under
`prefers-reduced-motion` at `quantum-cloud-loader.css:198`. **Names, durations and the reduce
block all frozen.** This is an ambient loop, so it must pause off-screen — it already only mounts
while something is loading, which satisfies the rule.

**Tests touched.** None.

---

## 6. Surfaces the completeness audits added — every one given a home

The three records' `completenessCheck` blocks name **27 surfaces** their own screen lists do not
cover. Thirteen are transient or partial states that belong inside a screen already mapped above;
they are cross-referenced first. The remaining fourteen get their own entries.

### 6.0 Already placed above

| Audit-added surface | Home |
|---|---|
| What's-new spotlight on `contacts-page-title` (and `crews-` / `field-` / `materials-page-title`) — the 260ms/14×150ms poll, `scrollIntoView`, `.hs-upd-spotlight` 3px outline at 6px offset, `hs-upd-pulse 1.1s ×3`, 4200ms | S-0 States; B-6 information item 6. **`hs-update-modal.css` is added to this cluster's stylesheet list** — the inventory omitted it |
| dnd-kit's screen-reader layer (hidden instructions node, `aria-live` announcements, `role='button' tabIndex=0 aria-roledescription='draggable'` per card) | S-7 information, preserved untouched (§7.29) |
| Re-entry state: `createRequest` / `salesOpenRequest` never cleared, so the create dialog and the last cross-linked drawer re-open on return | S-0 action 25, preserved (§7.23) |
| Contact drawer Tasks card with only completed tasks (`Tasks (0)` over a full list) | S-1 information 18 (§7.25) |
| Company drawer with no domain and no phone (the whole meta row collapses) | S-5 information 4 |
| Deals Board/Table layout toggle (`role=group aria-label 'Layout'`, two `aria-pressed` `.hs-btn-icon`s, `title 'Board'`/`'Table'`) | S-7 action 1 |
| Field Updates inline composer on an `.hs-index` page (`Field update project` / `Field update job`) | B-6 tests + `formInputs` |
| Sales navigation chrome — rail `Sales (New)` / `title 'Sales · New'` + the `.hs-rail-tag` dot; flyout rows `Contacts`+blue NEW, `Companies`+violet BETA, `Deals`+violet BETA; the same pills as `.hs-menu-tag` in Create new | B-4 information 4; §2.10's accent budget; and §6.14 below for the fourth pill class |
| `.hs-search kbd` styled but never rendered; `.hs-view-add` and `.hs-qf-mini` with zero consumers | §7.54 (dead CSS, not ported) |
| `.hs-index-rail` at `top: 74px` — a second hard-coded copy of the bar height | B-6 information 3 |
| `.form-stack`'s `outline: 0` beating the global ring | §2.7; B-7 |
| Three bookmark stores with three semantics (two localStorage, one server-side `schedule:views`) + `MAX_SAVED_VIEWS = 12`'s `slice(-12)` vs `slice(0,12)` mismatch | B-5 States (§7.35) |
| `.hc-assistant-fab.open` — a 52px collapsed FAB state defined in CSS that no React code ever sets | §7.54 (dead CSS) |

### 6.1 Saved Views bar (`SavedViewsBar`) — the on-page half of saved views

**Today.** `div.sched-views-bar aria-label 'Saved views'` with
`data-tutorial-id='schedule-saved-views'`: a `Pin(13)` + a `Views` label, then one
`.sched-view-chip` per view (a name button plus a sibling `×`), an empty line, a `+ Save view`
button and an inline naming form. **The flyout half is B-5; this is the surface the inventory
omitted entirely.**

**Becomes.** A 999px-pill chip strip on the Schedule landing's filter row.
`Views` label → the canonical eyebrow with the `Pin` at 13px `#8a877e`. Each `.sched-view-chip`
→ a 999px pill, `13px/500`, border `rgba(28,28,26,0.13)`; **`.is-active` stays on the chip
WRAPPER, not the button** (a test asserts the parent element carries it) and renders as
`rgba(47,107,255,0.08)` + `#2f6bff` + weight 600. The sibling `×` at 14px `#8a877e`, hovering
red, **pinned at `opacity: 0.55` below 1024px** (it is another hover-reveal control). `+ Save
view` → an outline pill that **inverts**, `:disabled` at `opacity .55` with its `title`
preserved. The naming form → an inline 999px input pill + a blue `Save` pill + an inverting
`Cancel`.

**Information (7).** 1. The `Views` label + `Pin`. 2. Per chip the view name, with
`title '<describeSavedView> . opens <Page>'`. 3. The `×`'s `aria-label 'Remove saved view
<name>'`. 4. `.is-active` on the wrapper when `sameFilters(view.filters, current)`. 5. The empty
line *"Pin a filter set and your morning view is one click."*, shown only with no views and the
form closed. 6. `+ Save view`'s **two** `title`s — `Save the filters on screen as a view` /
`Set a filter first, then save it as a view`. 7. The form's `aria-label 'View name'`,
placeholder `Name this view`, `maxLength 40`, and the `Save` / `Cancel` labels. All verbatim.

**Actions (5).** 1. Click a chip → `apply({...CLEAR_SCHEDULE_FILTERS, ...view.filters})` and,
when `view.page !== ` the current page, `onOpenPage(view.page)` — **so a chip can navigate.**
2. Click `×` → `remove(view.id)` → rewrites the server-side `schedule:views` setting + reload.
3. `+ Save view` → opens the form; **disabled unless `hasFilters(current)`**. 4. Submit →
`save(name, page, context)`, capturing **filters only** (`viewFilters` deliberately drops the
week and month); `Cancel` abandons; blank/whitespace rejected by both the disabled submit and an
early return. 5. Keyboard: the input `autoFocus`es.

**States.** *Empty:* the one line above. *Loading:* none. *Error:* a failed `setUserSetting` is
swallowed (`// the pins stay for this session`), so a person can save a view, see the chip, and
lose it on reload with no notice — **preserved** (§7.35). No lock.

**Motion.** No entrance of its own; the chips inherit the filter row's `data-reveal`. Hover:
**2** (invert) on `+ Save view` and `Cancel`; the chip gets a wash, not a lift (a pill inverts,
and an *active* pill is already inverted, so an active chip's hover only deepens).

**Tests touched.** **`schedule/pages.test.tsx:447-476` ("Saved views") is the strictest test in
this cluster:** `getByLabelText('Saved views')`, a button named **exactly** `+ Save view`
(including the leading `+`), `getByLabelText('View name')`, a submit named `Save`,
`Remove saved view <name>`, **that the chip's PARENT element carries `.is-active`**, that clearing
filters dims it, that `+ Save view` is disabled with no filters, and the persisted shape
`{name, page, filters}` under `schedule:views`. **Every one of those survives — the `.is-active`
class stays on the wrapper and `+ Save view` keeps its `+`. Keeps passing unchanged.**

### 6.2 Add-on upsell prompt (`AddOnPrompt`)

**Today.** One of only two modals the Bookmarks page can open, recorded in the inventory as a
single line. It is a full screen: a portal + `.hs-upd-backdrop role=presentation`, a
`section.hs-upd-dialog.hs-addon-dialog role=dialog aria-modal
aria-labelledby=hs-addon-title aria-describedby=hs-addon-desc`, a close X, an 84px
`.hs-addon-art tone-<tone>` tile with the program icon at 38px and a `CircleArrowUp` badge, an
eyebrow, an `h2`, a concatenated description, a "Where to get it" block and two actions.

**Becomes.** A stage object: radius **26px**, `0 34px 64px rgba(28,28,26,0.13)`, border
`rgba(28,28,26,0.07)`, backdrop flat `rgba(28,28,26,0.28)` with **no blur**.
**`.hs-upd-dialog` is shared with the What's-new dialog, so the shared base is split into
`.hs-upd-dialog` + a `.hs-addon-dialog` override *before* either is touched** — otherwise
restyling one restyles the other. The art tile → radius 20px, `tone-violet` (which shares its
rule with `tone-purple`) re-based to `rgba(109,40,217,0.10)` / `#6d28d9` — the AI add-on's only
colour identity. Eyebrow → the canonical eyebrow; `h2` → `var(--bf-app-display)`
(it is a stage); description and the where-block at 62ch; the `CreditCard` icon at 16px `#8a877e`.

**Information (8).** 1. The close X (`aria-label 'Close'`). 2. The 84px art tile + 38px program
icon + the `CircleArrowUp` badge. 3. Eyebrow `Add-on · <price> <unit>` (`$12` / `$9` / `$8`, and
`$15` for AI). 4. `h2` `Get <program label>`. 5. The description, which **concatenates**
`programRegistry.description` + `ADD_ON_CATALOG.pitch`. 6. The `Where to get it` block:
*"Settings → Billing → Add-ons: add <label> to your <current plan> plan for <price> <unit>. It
comes included with the <included plans> plans."*, falling back to `your plan` with no plan
selected. 7–8. The two action labels `Purchase in Billing` (ShoppingCart) and `Not now`. All
verbatim.

**Actions (4).** 1. `Purchase in Billing` → `onGoToBilling` → `openSettingsBilling(productId)`,
which deep-links Settings → Billing and focuses that add-on (`setSettingsInitialView` +
`setSettingsFocusAddOn`) → a blue 999px pill. 2. `Not now` → an inverting outline pill. 3. The X.
4. Escape, with focus returning to the tile that opened it (`useModalDialog`). **No backdrop-click
close and no body scroll lock — unchanged.**

**States.** No empty, loading or error. **It IS the add-on lock state** for `map-field-ops`,
`equipment-tracking` and `time-cards`, reached from a `.bm-tile`, a flyout row or
`openAppPage()`. **For AI it is dead code** (§6.7).

**Motion.** Inherits the `.hs-upd-*` entrance. Hover: **2** on `Not now`.

**Tests touched.** None directly; `tests/map.test.tsx:103` (`Get Map & Field Ops`) asserts a
locked flyout row **prompts** — which means this dialog's `h2` string is effectively pinned.
`Get <label>` is unchanged. **Keeps passing.**

### 6.3 Projects `.hs-index-rail` panels — Project Alerts / Upcoming Milestones / Portfolio Health

**Today.** Three panels the inventory named wrongly and whose contents it missed entirely. One of
them holds a **real Recharts donut**.

**Becomes.** Three `.hs-panel`s at radius 18px / `0 10px 30px rgba(28,28,26,0.05)`, each with an
eyebrow head and a sliding link, in the 330px sticky rail (`top: calc(var(--hs-topbar-h) + 18px)`).

**Information (12).** **Panel 1 `Project Alerts`** + link `View all` → DelayIQs; body `.cc-list`
of `.cc-alert` rows = a `tone-<tone>` icon square (radius 12px), a `13.5px/600` title, a `12px`
`#8a877e` meta line and a right-aligned `.cc-alert-time` "ago" at `11.5px`; empty
`.cc-empty-line` *"No active alerts right now."* **Panel 2 `Upcoming Milestones`** + `View all` →
Schedule; `.proj-miles-list` rows = `.proj-mile-ico` `CalendarDays(16)`, a `13.5px/600` title,
the project name at `12px` `#8a877e`, and `.proj-mile-date` `formatScheduleDate`; empty
*"No upcoming milestones."* **Panel 3 `Portfolio Health`** + a link labelled **`Details`** (not
`View all`) → Reports, containing the donut: `ResponsiveContainer h=150`,
`Pie innerRadius 48 outerRadius 68 paddingAngle 2 stroke none`, one `<Cell>` per health slice, a
`.proj-health-center` overlay printing the total and the word `Projects`, a
`.proj-health-legend` of colour dot + name + a `.proj-health-bar` percentage bar + `<N>%`, and a
`No data` fallback. **Chart geometry frozen**; the legend's name → `13px`, its percentage →
`tabular-nums`, the bar's fill flat, the centre total → `var(--bf-app-figure)` and the word
`Projects` → the canonical eyebrow.

**Actions (3).** The three navigations: `View all` → DelayIQs, `View all` → Schedule, `Details`
→ Reports. All slide 3px.

**States.** The three empty lines verbatim + the donut's `No data`. No loading, error or lock.

**Motion.** Panels inherit the page's `.dx-bg`/`.dx-cursor` ambience; **no `[data-reveal]` on
Projects' index content** (audit-verified). Hover: **3** on the links.

**Tests touched.** `tests/index-pages.test.tsx` asserts nothing in the rail. Unchanged.

### 6.4 DelayIQs `.hs-index-rail` as a form host — Log DelayIQ / Crew View / DelayIQ Categories / Impact ForecastIQ

**Today.** The same rail holds `<DelayEarlyWarning/>` (A-2) **plus** a legacy `Panel` whose title
flips on role, containing a real `.form-stack` form, **plus** a `DelayIQ Categories` panel, **plus**
an `Impact ForecastIQ` Recharts bar chart. Rail order: DelayEarlyWarning → the form panel →
Categories → Impact ForecastIQ.

**Becomes.** Four `.hs-panel`s at radius 18px in the sticky rail, each with an eyebrow head.
The form gets the `.form-stack` treatment from B-7 — **including the `:focus-visible` ring its
`outline: 0` currently steals**, which is the one proven focus failure in the cluster.

**Information (10).** 1. The panel title flipping on role — `Crew View` for a Crew Lead,
`Log DelayIQ` otherwise. 2–4. The form: a Project `<select>`, a `DelayIQ title` `<input
id=delayiq-title-input>` with placeholder *"Example: Inspection moved to Friday"*, and a
`.primary-button` `Add DelayIQ` (**gradient forced flat**, §2.6). 5–6. The **two mutually
exclusive** `.empty-state` branches: *"Create a project first"* / *"DelayIQs need a project
before they can be logged."* and *"Report delayIQs through field updates"* / *"Crew leads can flag
status from the Field Updates page."* 7–8. `DelayIQ Categories` — one `ResourceRow` per
`tradeProfile.delayIQCategories` with detail *"Tracked impact category"* and a **hardcoded**
`Monitor` badge, falling back to the six defaults (Weather / Material shortage / Labor shortage /
Equipment issue / Inspection delayIQ / Site condition). 9–10. `Impact ForecastIQ` — a `BarChart`
of every delayIQ (`x = delayIQ.title.slice(0,12)`, `y = delayIQ.impactDays`, `fill #d96570`,
`radius [6,6,0,0]`, 220px tall) with an `InlineEmptyState` (LineChart icon,
`No delayIQ forecastIQ yet`, `ForecastIQ starts once delayIQs are logged.`). **Chart geometry
frozen**; `#d96570` is a trio member used as **data ink**, which is legitimate.

**Actions (2).** 1. The `Log DelayIQ` primary action in `.hs-index-actions` calls
`focusDelayIQForm` — it **scrolls/focuses this rail form** rather than opening a dialog. 2. The
form's own `Add DelayIQ` submit. Plus the Recharts tooltip, which is the chart's only
interaction — **it must not become a button.**

**States.** The two role-gated empty branches + the chart's `InlineEmptyState`. **And the
conditional head:** `canCreate = role !== 'Crew Lead' && projects.length > 0`, so a Crew Lead or
an empty workspace sees an index head with **no actions at all** — the head layout must not
assume an actions slot. No lock.

**Motion.** The rail's panels; `DelayEarlyWarning`'s one `data-reveal`. Hover: **3** on the
Categories rows; **2** on the outline buttons.

**Tests touched.** None. The DelayIQ tablist (`All delayIQs` / `Open` / `Monitoring` /
`Resolved`, `aria-label 'DelayIQ views'`) is placed in B-6 information item 8.

### 6.5 Route Optimization panel — Map & Field Ops *(page frame owned by the `map-timecard` cluster)*

**Today.** The **only in-app surface named after one of the five AI capabilities in the
assistant's Tools menu**, and it wears the Sparkles mark. The `ai-modules` record's
"Adjacent-but-not-AI — do not relabel" list names `WeeklyDigest`, `alerts.tsx`, `conflicts.ts` and
`CommandPalette` but not this, so a redesigner has no instruction either way. **Instruction: it is
AI-named and deterministic (`createSavedMapRoutes`). Keep the Sparkles, keep the name, add no
intelligence claim.**

**Becomes.** A `.panel` at radius 18px with an eyebrow head, a figure row for the drive-time
readout, and a 999px segmented control for the goal.

**Information (6).** 1. Panel title `Route Optimization`; the panel action label toggles
`Optimize all routes` → `Optimized` (`actionPressed`), **omitted entirely when `hasRouteData` is
false**. 2. `Estimated total drive time` + the figure → the eyebrow + `var(--bf-app-figure)`.
3. `↓ {savings}% {savingsLabel} vs current routes` — the three pairs **18% `drive time`** (Fastest
Time), **15% `fuel burn`** (Least Fuel), **13% `time & fuel`** (Balanced). 4. The `dl` First Stop /
Last Stop / Total Distance, with Total Distance falling back to the literal `Pending` and drive
time to `0m` → the eyebrow `dl`. 5. The segmented group `role=group aria-label 'Optimization
goal'` with `Fastest Time` / `Least Fuel` / `Balanced`, each `aria-pressed` → 999px pills in a
`rgba(28,28,26,0.05)` track. 6. The empty state (`InlineEmptyState`, Route icon,
`No route data yet`, *"Add jobs and project locations before optimizing routes."*). Plus the
trucker route planner sharing this panel (its combobox, `Create Traffic Route` /
`Finding Route...`, the `Fastest truck route` result card, and *"Your optimized plan is saved
underneath — clear this route to return to it."*).

**Actions (3).** 1. The Sparkles primary `Optimize Routes` → `optimizeRoutes()` (recomputes and
saves the plan, sets Optimized, stamps `lastSynced`) → a blue 999px pill **keeping its Sparkles**.
2. The panel-header action `Optimize all routes` → the same call, sliding 3px. 3. Pick a goal →
changes both the drive-time figure and the savings label live.

**States.** The `No route data yet` empty; the `Optimized` pressed state, which **persists across
a truck-route detour**. No loading beyond the button label; no error; no lock (the Map page itself
is add-on-locked, which is the `map-timecard` cluster's concern).

**Motion.** Hover: **2** (invert) on the goal pills and the panel action; **1** (lift) on the
route result card. `styles.css` owns `.route-goal-control` and `.route-optimizer-grid` — **added
to this cluster's stylesheet list**, which the inventory omitted.

**Tests touched.** **`tests/map.test.tsx:205-244`** (*keeps the optimized plan and a truck route
from clobbering each other*) pins: the **absence** of `No route data yet`, the strings
`Estimated total drive time`, `/drive time vs current routes/`, `/fuel burn vs current routes/`,
the `Least Fuel` button, the `Optimize Routes` button and the resulting `Optimized` button name.
**Every one is verbatim above. Keeps passing unchanged** — and this is the test anchor the
inventory missed, so it would have been the redesign's first surprise.

### 6.6 The five further ForecastIQ-branded readouts *(three cross-cluster)*

The record's `crossCutting` claims "the only ForecastIQ-branded UI is: the import dialog's panel,
the variance card's `ForecastIQ finish`, and the Schedule Status band's Sparkles `Forecast
finish`." **That is false, and so is "the Schedule Status band is the only place the product shows
a forecast finish with a Sparkles mark."** Five more exist. All five get the same treatment —
eyebrow labels, `var(--bf-app-figure)` values, frozen chart geometry, flat fills:

1. **TimeCard `Labor forecastIQ`** *(cluster: map-timecard)* — a `SectionCard` titled
   `Labor forecastIQ`, subtitle *"Projected hours from current burn rate"*, icon **Sparkles**; a
   Recharts `AreaChart` with a forecast area `stroke #1568c9` and a `linearGradient` fill id
   `tcForecastIQ` (0.35 → 0), plus an `actual` `Line #20b15a` with `r=4` dots; `XAxis dataKey
   'week'`, `YAxis domain [1200, 1800]`, `CartesianGrid strokeDasharray '4 6'`,
   `Tooltip cursor stroke #ccd5df`; 220px inside `.tc-chart`. → `stroke #1568c9 → #2f6bff`, the
   grid dash → `rgba(28,28,26,0.07)`, the tooltip cursor → `rgba(28,28,26,0.13)`; **the area's
   `linearGradient` stays — a chart fill is data ink, not accent** (§2.6's kill list is about
   *decorative* gradients). Only interaction: the Recharts tooltip. `timecard.css` owns
   `.tc-chart` — added to the stylesheet list.
2. **DelayIQs `Impact ForecastIQ`** — §6.4.
3. **Reports `Backlog ForecastIQ (Hours)`** *(cluster: field-delayiq-reports)* — the `PageTitle`
   subtitle *"Production analytics, utilization, and backlog ForecastIQ."* plus a card heading
   `Backlog ForecastIQ (Hours)` over a Recharts `LineChart`. Under the shared chrome the subtitle
   → `var(--bf-app-lede)` at 62ch and the card heading → `var(--bf-app-section)`. Its surrounding
   controls (a `Report period` select — Last 6 Months / Last Quarter / Year to Date — and Export)
   → `.hs-qf` + `.hs-btn`. **Reports is also the second compact `ScheduleStatusBand` mount**
   (A-6).
4. **Map `Weather at Job Sites` → the full local ForecastIQ manager** *(cluster: map-timecard)* —
   the real in-app counterpart of the "Weather Integration" capability, and **every string is
   ForecastIQ vocabulary**: the panel action `View full forecastIQ` ↔ `Hide full forecastIQ`; the
   current-conditions card (temperature, `Partly Cloudy`, location, `Precip:`, `Wind:`,
   `Humidity:`) plus a 4-day strip of buttons (`THU 82 / 64`, `FRI 85 / 66`, `SAT 87 / 68`,
   `SUN 83 / 64`); the `role='region' aria-label='Full local forecastIQ'`; the add form (label
   `Add local forecastIQ`, input `aria-label`/placeholder `City, town, or ZIP code`); the helper
   `ZIP resolves to {city}`; the submit `Add ForecastIQ` → `Adding...`; a
   `<p className="form-error" role="alert">`; the empty `No saved forecastIQs yet.` with a
   `CloudSun`; and per saved card the location, `ZIP {zip}` or the condition, `{temp} F`,
   `Precip {x} • Wind {y}`, a Humidity/Condition `dl`, the day highs/lows, an `active` class, and
   a delete with `aria-label 'Delete forecastIQ for {location} ZIP {zip}'` — **capped at 5,
   newest first.** Actions: the panel toggle, the four day buttons (which open the full region),
   `Add ForecastIQ`, `Use ForecastIQ` per card, and the per-card Delete. → eyebrow labels, figure
   temperatures, 999px day pills, cards at radius 18px that **lift** (clause 1 —
   `Use ForecastIQ` makes the whole card actionable), the form on B-7's `.form-stack` treatment
   with the focus ring restored. `styles.css` owns `.map-full-forecastIQ`,
   `.map-forecastIQ-search`, `.map-local-forecastIQ-*` and `.map-delete-forecastIQ-button` —
   added to the stylesheet list.
5. **Projects index `Forecast finish` column** — the `<th>` `Forecast finish`; the cell
   `<Sparkles size={12}/>` + `formatDate(forecast.forecastFinish)` or the em dash `—`; a
   `+Nd`/`−Nd` `.hs-delta` chip appended **inside the Schedule health cell** when a forecast
   exists; and the CSV header list carrying `Forecast finish` between `Target completion` and
   `Project manager`. The source comment documents the honesty rule: *a project with no jobs has
   nothing to forecast from, so the row simply omits it.* → the shared table treatment;
   the Sparkles at 12px `#2f6bff`; the delta chip 999px. **The column is deliberately not in the
   `sortKey` union** (§7.52).

**Tests touched (all five).** None asserts any of it. `tests/map.test.tsx` covers the Route panel
(§6.5) but not the weather manager. All five are hand-walked (§9).

### 6.7 The "AI" add-on product — onboarding picker, Settings → Billing, and the dead prompt

**Today.** An entire commercial surface for the AI, in three places, absent from the inventory —
and it encodes a **product contradiction** the marketing pages assert the opposite of.

**Becomes.** Each of the three places takes its host cluster's treatment; the content is placed
here so nothing is lost.

**Information (7).** 1. `onboardingProductOptions` entry: id **`schedule-ai`** (the id is kept
for stored selections), label `AI`, description *"Spot conflicts, answer questions, and turn
blockers into recovery suggestions."* 2. `programRegistry['schedule-ai']`: icon Sparkles, tone
`violet`, `primaryPage 'schedule'`, `relatedPages []`. 3. `ADD_ON_CATALOG['schedule-ai']`: price
`$15`, unit `per user / month`, `includedIn ['pro','business','enterprise']` (**not Free**), pitch
*"Conflict detection, plain-language answers, and recovery suggestions across the schedule."*
4. The onboarding step `What additional products do you want to use?` → section
`Additional products` / `Choose one or more` → an `.acct-pick` checkbox card with the Sparkles
`tone-violet` icon, the label `AI`, that description and an `.acct-pick-check` tick →
*(cluster: auth-onboarding)* radius 18px, the tick blue, the card **lifts** (clause 1).
5. Settings → Billing → Add-ons (`#settings-addons`, *"Programs you can add to any plan. Business
and Enterprise include them all."*) → an `.sx-addon-card` for AI showing `$15` /
`per user / month` and one of three states: `Added` / `Included with your plan` / an
`Add to plan` button → *(cluster: settings)* radius 18px, the price at
`var(--bf-app-figure)`, the unit at the eyebrow size. 6. The post-add
`role=status` notice *"AI is now part of your workspace — find it in the left rail."*
7. `addOnTipCopy`'s nav-flyout tooltip titled `AI add-on` with the price and plan names → the ink
pill of B-4, **now firing on `:focus-within` as well as `:hover`.**

**Actions (3).** 1. Toggle the `AI` checkbox during onboarding (persists via
`readStoredProducts`). 2. `Add to plan` for AI (calls `onAddProduct`, shows the notice).
3. `AddOnPrompt`'s `Purchase in Billing` / `Not now` / Close — **dead for AI**, live for the other
three add-ons (§6.2).

**States.** The three add-on card states; the `role=status` notice. **The gotcha, preserved:** AI
is deliberately **not** in `ADD_ON_PAGE_LOCKS` (`// AI ships in every tier, so it never locks a
page`), so the AI `AddOnPrompt` and the up-arrow tip are unreachable code paths. **Wiring them
would change entitlement behaviour.**

**The product contradiction, surfaced not resolved.** The plans-overview band says *"Schedule AI
ships in every tier — conflict detection and recovery suggestions from day one, never a paid
add-on."* while `ADD_ON_CATALOG` prices it at $15/user/month, excludes Free, and Settings →
Billing sells it. The in-app comment sides with the marketing copy. **This needs a product
decision before either surface is re-skinned** (§8.4), because the redesign will make both
statements more prominent, not less.

**Tests touched.** `tests/settings.test.tsx` covers the Settings rail but asserts nothing about
the add-ons grid. None to update.

### 6.8 Landing home "BuildFlow AI" band *(cluster: welcome-reference)*

**Today.** The AI's headline presence on the landing home, with a rotating-phrase `h2` and a
stacked-card component.

**Becomes.** Welcome register, `#1a73e8 → #2f6bff`, and **it already uses a ported component** —
`DisplayCards` — so nothing new is needed.

**Information (4).** 1. Eyebrow `BuildFlow AI`. 2. `h2` `Conflicts spotted. ` +
`WxRotatingWord` (`className wx-grad-ai` — a **licensed** marketing trio use) rotating all six
`aiRecoveryPhrases` (`Recovery suggested.`, `Fixes proposed.`, `Recovery planned.`,
`Solutions surfaced.`, `Plans recommended.`, `Recovery mapped.`). 3. `WxTypeIn`'s char-by-char
reveal of *"Schedule AI ranks ready work, flags double-booked crews, and turns weather and delayIQ
signals into recovery plans before the morning meeting."* — with its **three-layer a11y
convention** (ghost + `aria-hidden` animated layer + one `sr-only` node) intact. 4. `DisplayCards`
= three stacked cards: `AlertTriangle` / `Double-booked` / `Concrete 1, two pours` /
`Caught before dispatch` / `var(--wx-g-coral)`; `CloudSun` / `Weather risk` /
`Rain on Thursday's pour` / `Flagged 3 days out` / `var(--wx-g-amber, #f9ab00)`; `PackageCheck` /
`Material late` / `Rebar slipped to Friday` / `Recovery suggested` / `var(--wx-g-blue)`. All
verbatim; the three accents are **trio members used as card tints on a marketing page**, which is
licensed there.

**Actions (1).** None of its own; the `DisplayCards` stack reacts to hover (its own
`-skew-y-[8deg]`-derived transform, which is the **tilt** move at marketing amplitude).

**States.** None. **Motion.** `dcx-fade-in 700ms` on the signature curve + the per-card 700ms
transforms; the rotating word; `WxTypeIn`. Its internal `backdrop-filter: blur(6px)` is
**permitted** — it is a marketing component with no tutorial anchor inside it (§2.6).

**Tests touched.** None.

### 6.9 Landing "Switch in minutes" AI migration section (`#switch`) *(cluster: welcome-reference)*

**Today.** The public counterpart of the assistant's photo/video import — an AI-branded three-step
screen with before/after mocks. Absent from the inventory.

**Becomes.** Welcome register; the two mocks take the **product-window treatment** (a `#faf8ee`
stage at radius 26px, `1px rgba(28,28,26,0.08)`, `0 24px 60px rgba(28,28,26,0.08)`,
`perspective: 1200px`, `isolation: isolate`, `overflow: hidden`) with the **tilt** move — the one
place in this cluster where the Welcome Page's signature move applies literally.

**Information (7).** 1. Eyebrow `Switch in minutes`; `h2` *"Already scheduling somewhere else?
Bring it with you."*; the body naming the AI photo/file read verbatim. 2. The before card: tag
`Your current scheduler`, a fake spreadsheet grid (WK 24 / Mon–Thu, Crew 1–3, one
`wx-switch-clash` `??` cell), and a file chip `schedule.xlsx`. 3. The bridge: Sparkles + the label
`BuildFlow AI reads it` + an arrow. 4. The after card: tag `Live in BuildFlow`, a crew×day block
board (Concrete pour / Inspect / Formwork / Roofing in tone-blue/slate/violet/green), and a chip
`Conflicts resolved · optimized`. 5–7. The three steps with their icons and bodies:
`Upload what you've got` (FileText), `AI reads the schedule` (Sparkles — *"It pulls out crews,
jobs, dates, and dependencies — and flags conflicts already hiding in your week."*),
`Your live schedule lands` (CalendarDays). Plus the note *"Free white-glove migration when you
switch — done for you."*

**Actions (1).** `WxMagnetic` CTA `Join the waitlist` (Sparkles,
`aria-label 'Join the waitlist'`) → `window.location.hash = '#waitlist'`.

**States.** None. **Motion.** Reveals at marketing amplitude; **tilt** on both mocks; magnetic on
the CTA. **Tests touched.** None.

### 6.10 The landing "AI" mega-menu / mobile accordion *(cluster: welcome-reference)*

**Today.** Cited only as an entry point and a test anchor, never inventoried as a surface. Its
hover blurbs and hover images are exactly the hover-reveal information a redesign drops silently.

**Becomes.** **It already uses a ported component** — `interactive-hover-links.tsx`, the repo's own
Welcome-page grammar for a list of links — so nothing new is needed. Restyled only: rows
`13.5px/500`, headings → the canonical eyebrow, the panel picture at radius 20px, rows slide 3px.

**Information (8).** 1. Menu label `AI`; dropdown intro *"AI that keeps the schedule moving"*.
2. The side-menu section head: blurb *"BuildFlow AI and the automations behind it"* + image
`/ai-chat-composer.png`. 3. Column 1 heading `Assistants` with **the only menu item in the whole
nav carrying an inline detail**: `{ title: 'BuildFlow AI', detail: 'AI tools for work' }`.
4. Column 2 heading `Automation` with `Weather Integration`, `Schedule Suggestions`,
`Crew Suggestions`, `DelayIQ Detection`, `Route Optimization`. 5. The five per-item hover blurbs
verbatim (`Forecasts folded into the plan`, `Next best moves for planners`,
`The right crew for the job`, `Slips caught before they spread`, `Shorter drives between sites`).
6. The six per-item hover images (`/ai-chat-composer.png` + five distinct Unsplash photos).
7. `Schedule AI` also appears in the **Product** menu with blurb *"Suggestions that keep the plan
moving"*. 8. **Every item is a real `<a href>`** (`getMenuItemHref`) as well as a click handler.

**Actions (4).** 1. Click the **heading** `AI` → `#ai-overview`. 2. Click `BuildFlow AI` →
`#buildflow-ai`. 3. Click any Automation item → its hash. 4. Hover any item → swaps the panel's
picture and line.

**States.** None. **Motion.** The ported component's own hover choreography — **move 3 (slide)**,
which is what `interactive-hover-links` implements.

**Tests touched (2).** `tests/landing-menus.test.tsx:64` pins the item title + href + the
sub-label `AI tools for work`; `:70-76` pins that `Schedule AI` / `Readiness AI` / `Field AI` are
**not** rows while the three automations **are**. Both verbatim. **Keep passing unchanged.**

### 6.11 Dashboard "BuildFlow Apps" panel — the "Schedule Intelligence" AI card *(cluster: dashboard)*

**Today.** A full-width board panel (default slot `x:0 y:26 w:6 h:6`) whose first card is
explicitly AI, with an `Active` badge. The inventory mentions `.cc-app*` only as a CSS note.

**Becomes.** `.dash-block` at radius 18px with the frozen `14.5px` panel head; the five cards
→ radius 18px, `#fff`, `0 10px 30px rgba(28,28,26,0.05)`, icon squares at radius 12px, titles
`13.5px/600`, bodies `12px` `#8a877e` at 62ch, hover **lift `-4px`** (clause 1 — the card
navigates).

**Information (8).** 1. The heading `BuildFlow Apps` (a **body-owned** heading, which is why
`DASH_SECTION_ICONS` deliberately has no icon for it). 2. Card 1: Gauge, tone blue,
`Schedule Intelligence` — *"AI-powered lookahead and risk detection."* → Schedule. 3–6. The four
siblings: `Crew Planner` (*Optimize crew allocation and demand.*), `Material Navigator`
(*Track, forecastIQ, and align material needs.*), `Field Insights` (*Daily logs, photos, and
field summaries.*), `Cost Analyzer` (*Monitor budgets and cost trends.*). 7. **Every card carries
a static `Active` badge whether or not the add-on is owned** — a 999px `11px/700` pill on
`rgba(28,28,26,0.05)` with `#575550` text, **not** green and **not** blue, because it is not a
live entitlement (§7.49). 8. A trailing `.cc-app.add` tile with a Plus and the label `Add App`.

**Actions (3).** 1. `Manage` in the section head → Reports, slides 3px. 2. The Schedule
Intelligence card → Schedule. 3. **`Add App` is a button with no `onClick` — inert.** It keeps
its current appearance and gains **no** hover lift and no pointer cursor, so it does not promise
an action it does not have (§7.49).

**States.** None. **Motion.** Panel `data-reveal`; hover **1** on the four routed cards only.
**Tests touched.** None.

### 6.12 Guided-tour "AI lesson" step *(cluster: settings / onboarding, anchor in `schedule/alerts.tsx`)*

**Today.** The only in-app place the product teaches its AI — and **it points at Schedule Alerts,
the very module the record files under "Adjacent-but-not-AI (do not relabel)."** That ambiguity is
exactly what the list exists to resolve, and it is absent from both sides of it.

**Instruction:** the product itself presents Schedule Alerts as the AI add-on's in-app surface.
Keep the step, keep its target, and **do not relabel `alerts.tsx`** — it stays a deterministic
rule check with an AI lesson pointing at it. Both facts are true.

**Information (6).** 1. Step id `product-schedule-ai`, title and shortTitle both `AI lesson`.
2. Body *"Scheduling Alerts surface conflicts, material blockers, and work that needs planner
review before the day is published."* 3. `page 'schedule'`, `targetId 'schedule-alerts'` — so the
spotlight lands on `ScheduleAlertsPanel`. 4. It appears **only** when the AI product is among
`selectedProductIds`. 5. The target panel's own copy: `h2 'Schedule Alerts'`, `section aria-label
'Schedule alerts'`, a `View all` head link and a `View all alerts` foot button, per-alert
title/detail/ago, and the **four derived alert kinds** (Double-booked crew / the open DelayIQ /
`Weather delayIQ expected` / `Missing materials`) with tones `danger|warning|info` and per-alert
destinations (the week board on that week / DelayIQs / Map / Materials). 6. The empty line
*"No schedule alerts for what is in view."*

**Becomes.** The panel takes B-7's `.panel` treatment (radius 18px, eyebrow head, hairline rows,
999px tone pills, 3px slide on `View all`). **The tutorial panel and its 9999px box-shadow scrim
are untouched, and `data-tutorial-id='schedule-alerts'` must not gain a transforming ancestor.**

**Actions (2).** Advance/skip the AI lesson; click through to an alert's owning page.

**States.** The empty line. **Motion.** The tutorial's own; `pointer-events: none` on the overlay
with `auto` only on the panel is **frozen** — that is what keeps the spotlit control clickable.

**Tests touched.** `tests/tutorial.test.tsx` (5 tests) does not assert this step, but it does
assert the bell-before-account DOM order (`:286`) and the restart button. Unchanged.

### 6.13 Help Center "Ask AI" FAB — the second `AskAiButton` mount *(cluster: welcome-reference)*

**Today.** The record describes the FAB as "rendered on every page except Settings" and treats it
as an assistant opener. **There is a second, semantically different mount on a PUBLIC page where
`onAsk = onOpenDashboard` — clicking `Ask AI` there enters the dashboard rather than opening the
panel.** And **it uses `MessageCircle` (19px), not Sparkles**, which contradicts the record's own
iconography note.

**Becomes.** Both mounts get the ink-pill treatment (52px, `#1c1c1a`, 999px,
`0 8px 22px rgba(28,28,26,0.2)`, hover `0 14px 34px rgba(28,28,26,0.28)` + `translateY(-3px)`).
*Declared micro-deviation:* the Welcome grammar for a pill is **invert**, but this pill floats over
content at rest and inverting it to an outline would read as it breaking. **Floating pills lift;
anchored pills invert.** The icon difference is **preserved** — MessageCircle on the marketing
page, Sparkles in-app — and flagged (§7.50), because the two buttons genuinely do different
things and the icon is the only cue.

**Information (4).** 1. The `MessageCircle` 19px icon. 2. `aria-label 'Ask BuildFlow AI'`, visible
label `Ask AI`, a fixed bottom-right pill (`assistant-global.css` `.hc-assistant` /
`.hc-assistant-fab`). 3. `.hc-assistant-fab.open` — a 52px circular collapsed state defined in
CSS that **no React code ever sets** (§7.54). 4. The AI-copy FAQ answer *"Minutes. Import your
current schedule — even a photo of a whiteboard or spreadsheet — and BuildFlow turns it into real
projects, crews, and assignments you can start optimizing right away."*

**Actions (1).** Click `Ask AI` on `#help-center` → **enters the dashboard**, not the panel.

**States.** None. **Motion.** Hover **lift** `-3px` (the floating-pill exception).
**Tests touched.** None.

### 6.14 Rail hub chrome — the fourth release-pill class *(shared chrome)*

**Today.** The record names three release-pill class names. **There are four**, and the fourth is
the one the accent budget has to price.

**Information (5).** 1. `.hs-page-tag` (index titles). 2. `.hs-flyout-tag` (flyout rows).
3. **`.hs-rail-tag`** — an `aria-hidden` dot drawn **on the hub icon**, `#2f6bff` for NEW and
`#a78bfa` for BETA. 4. The hub `aria-label`/`title` text itself: `'<Hub> (New)'` / `'<Hub> (Beta)'`
when **any** page in the hub carries a release tag, plain `'<Hub>'` otherwise, with
`title '<Hub> · <tag>'`. 5. `.hs-rail-btn`'s `.recommended` state when a bought add-on's pages
live in that hub, and the fact that `aria-haspopup`/`aria-expanded` are **omitted entirely for
single-page hubs** (home, bookmarks, reporting, timecard).

**Becomes.** `.hs-rail-tag` NEW `#2f6bff` → `#fff` **when its hub is `.active`** (so the rail never
shows two blues) and `#2f6bff` otherwise; BETA `#a78bfa → #6d28d9` (the light-on-navy violet
disappears on paper). `.recommended::after`'s `0 0 0 2px #14203a` ring → `0 0 0 2px #f5f6fa`.
`hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring` and `hs-tag-ping` **keep their names**; the ring's
pulse alpha goes `0.45 → 0.14`.

**Actions.** The hub click navigates to `hub.pages.find(p => !lockedAddOnForPage(p)) ?? hub.pages[0]`
and opens the add-on prompt when the whole hub is locked; the flyout opens on **hover and on
`onFocus`** and closes on a 140ms delayed timer cancelled by re-entering the flyout; **a
single-page hub still opens a flyout on hover even though clicking navigates straight through.**
All unchanged, plus the coarse-pointer tap path (B-4).

**Tests touched.** `tests/settings.test.tsx:113` matches `^<Hub>( \(.*\))?$` over Schedule /
Operations / Resources / Field / Reporting / Home; `appHarness.openAppPage()` and `openSchedule()`
depend on the same. **The `aria-label`/`title` construction is untouched — only colours, radius
and the ring change. Keeps passing unchanged.**

### 6.15 Crew Scheduling product page — AI reason cards behind a press-to-reveal `+` *(cluster: welcome-reference)*

**Today.** AI copy behind progressive disclosure — **the class of hidden content a visual redesign
loses first.**

**Information (5).** 1. `reason-5`: label `BuildFlow AI`, title *"Slips spotted before they
spread."*, text *"DelayIQ watches for jobs trending behind and shows the downstream chain with a
recovery suggestion."*, and the hidden `more` *"Ask BuildFlow AI about the week in plain language;
weather is folded into the forecast so a rain day is planned, not discovered."* 2. `reason-4`:
label `Switch in minutes`, text *"Import Primavera P6 and Microsoft Project files, or let BuildFlow
AI read a photo of last week's plan."*, hidden `more` *"The import previews projects, jobs, and
crews before anything is created, so you can check the mapping first."* 3. `reason-2`'s hidden
`more`, which describes the variance loop verbatim: *"A percent-complete report from the field
raises a priced, CPM-rippled variance the PM accepts or rejects — dates never move on their
own."* 4. The media-slot note for reason-5: *"Card 5 · BuildFlow AI — an early-warning card with a
recovery suggestion"*. 5. `CREW_SHEET_PRODUCTS`' row `Schedule AI` → `#schedule-ai`.

**Becomes.** `.cpx-*` Welcome register (this page already runs at `clamp(2.5rem,5vw,5.5rem)` for
its statement, and it keeps that). The `+` control → a 999px icon pill that **inverts**; the
revealed `more` copy at 44ch. **All three hidden strings must still be reachable** — a redesign
that removes the `+` in favour of always-visible copy is acceptable; one that removes the copy is
not.

**Actions (2).** Press a card's `+` to reveal; the `Schedule AI` sheet row → `#schedule-ai`.

**States.** None. **Motion.** The height transition on `var(--bf-ease-size)` (a height change is
exactly the case the second curve exists for). **Tests touched.** None.

---

## 7. Declared changes and proposed removals — needs approval

Nothing in this cluster is dropped. What follows is (a) **visible changes** this plan makes
deliberately and (b) **things I believe should go or be fixed but have not touched**, because
they are content, copy or behaviour rather than presentation.

**A. Declared visible changes — made, and here is what they cost**

| # | Change | Where | Reasoning / cost |
|---|---|---|---|
| **7.1** | **`--wx-serif` deleted → the `.pdx` dialog titles stop rendering Palatino** | Contact / Company / Deal create+edit+delete dialogs, and the shared Project and Crew dialogs — 7 families | Decision #4, executed. **This is the one place deletion is not inert** (§0.1) and `DESIGN_TOKENS.md` does not know it, because the audit walked pages and not dialogs. It is also a *fidelity gain*: the Welcome Page's display accent is italic `em`, "not a second family". **Needs sign-off because it changes rendered type on 7 dialogs, one of which (`Edit Crew`) is asserted by 4 tests — by name only, so they pass either way.** |
| **7.2** | **21 of 25 resting outlined rectangles removed** | 5 KPI tiles × 3 Sales pages, the `.hs-table-wrap` frame on all 10 index pages, 7 + 5 + 5 record-drawer inner cards, the `.diq-risk` cards, the `.cc-rec` / `.cc-approval` rows, the `.sim-*` format cards and findings rows | The two-clause card licence (§1.6) and the counted audit (§2.4). Fills and radii are kept where a tile must stay separable; only the outline and the shadow go. The single most visible one is the table wrap's border sitting 22px inside the card's. |
| **7.3** | **Four decorative gradients forced flat + seven orange leftovers re-based** | `.hs-progress` track, `.primary-button`, `.dashboard-feed-empty`, **the whole `.app-shell` ground**; `--shadow-accent`, `--focus`, `::selection`, `.primary-button:hover`, `.kpi-card-button` border, `.search-box` ring, `.panel-note` border | "One ground, no banding" plus the pre-blue-era cleanup (§2.6). The `.app-shell` ground is the largest single colour change in the plan. Chart fills (`tcForecastIQ`, `#d96570` bars, the trio in `DisplayCards`) are **data ink and stay.** |
| **7.4** | **The gold bookmark star retires in all three sites** | top-bar trigger `#f0b354`, flyout star `#e8a33d`, `.bm-tile-star.is-on` `#e8a33d` + the `rgba(240,179,84,0.55)` tile border | The accent budget as a count (§2.10). The filled-vs-outline distinction that carries the information is untouched. Preserve and hybrid both retire it and say so; editorial claimed the discipline and skipped the cost. |
| **7.5** | **`.hs-record-backdrop` loses `backdrop-filter: blur(2px)` and its navy tint** | the three record drawers | The backdrop-filter licence: top bar only, because the tutorial spotlight's 9999px box-shadow mis-places against any new containing block (§2.6). |
| **7.6** | **`.aix-*` purple accent → `#2f6bff`** | `#ai-overview` | `accentInk #7b3ff4` is a per-page accent, which is the opposite of "one accent" — and this is the AI hub, where the licensed trio can carry the identity instead (A-10). |
| **7.7** | **The `.bm-tile-label small` two-line fix** | Bookmarks → Schedule views tiles | The detail is currently clipped inline at the browser default because **no sheet styles `.bm-tile-label small`**. Realising the intended two-line tile is a visible change to a surface with no test (B-1). |
| **7.8** | **`bm-rise` moves from ~60 tiles to the two cards; `hsc-rise`/`hsc-row-in` come off tiles, rows and timeline items** | Bookmarks, Contacts, Companies, Deals | The reveal arithmetic (§2.5): 12px / 0.55s / 50ms, sections never rows, six per page. Also fixes the whole-catalogue re-animation on every star toggle. **The two `prefers-reduced-motion` blocks that null those animations by name are edited in the same commit** so nothing is orphaned. |
| **7.9** | **The AI panel's expanded sidebar becomes a pill tab strip at ≤720px instead of `display: none`** | `.bf-breeze-side` | Today the entire sidebar — Chats / Artifacts / Projects / Memories / Prompts and its search — is **unreachable on a phone**. This plan does not silently delete a surface. |
| **7.10** | **`DxTilt` clamped ±7deg → ±5deg and given a JS reduced-motion guard** | every dashboard KPI card | It currently has **no** reduced-motion guard in JS. This is the fourth hover move, and the guard is an accessibility fix, not a style choice. |
| **7.11** | **Hover-reveal controls pinned at `opacity: 0.55` below 1024px** | `.hs-row-action` (10 index pages), `.hs-flyout-star`, `.hs-bookmark-remove`, `.sched-view-chip`'s `×` | The EDITORIAL touch rescue. Today three of the four are unreachable or invisible on touch and tablet; the `@media (hover: none)` override only covers `.hs-row-action`. |
| **7.12** | **`.hs-flyout-tip` fires on `:focus-within` as well as `:hover`** | rail flyout add-on tooltips | Today the add-on explanation never precedes the `AddOnPrompt` for a keyboard or touch user. One selector. |
| **7.13** | **Contacts' Call and Text row actions stop hovering red** | `.hs-cell-actions.three` | `.hs-row-action`'s default hover tint is destructive red and only `.edit` is blue, so today Call and Text hover like a delete control. |
| **7.14** | **The chrome hairline steps up to `rgba(28,28,26,0.13)`** | top-bar bottom border, rail right border | The light-on-light state anchor (§2.11). **Verified on an uncalibrated monitor before merge, not asserted** — this is the one thing all four concepts treated as free. |
| **7.15** | **The global focus ring moves from `:where()` to `.bf-shell :is()` and from orange to blue** | every focusable element, and by name on `.form-stack` | `:where()` is zero-specificity, beaten by 36 `outline: 0` rules, invisible to jsdom, and a documented jsdom breaker. `.form-stack`'s fields have **no focus indicator at all** today (§2.7). |
| **7.16** | **`redesign.css:295-341`'s `!important` block is edited in place** (`--r-md` → 18px, the seven `-2px` lifts → `var(--bf-lift-dense)`) | ~28 module card classes across crews / equipment / materials / field / reports / forecast / map / schedule / settings | It is the one place the new sheet cannot win by specificity, so it is edited rather than fought. |
| **7.17** | **`hs-index.css` and `redesign.css` each gain their first `prefers-reduced-motion` block** | shared index chrome; the global layer | Neither has one today, which is what made adding motion to the shared chrome unsafe. Both read the amplitude tokens so they degrade for free. |
| **7.18** | **The trio gets a second in-app use** | `.pdx .pdx-title em` | A declared deviation from "spent on exactly one thing in-app". The `em` is structurally identical to the Welcome hero's `em`, which is one of the trio's three licensed marketing uses, and deleting the serif makes it *more* faithful. **Needs sign-off.** |
| **7.19** | **`--qc-*` particle tones re-based onto the trio family** | the quantum cloud loader, 5 sites | Stops the loader being a fifth palette; makes it the trio in motion. |

**B. Proposed removals and fixes — NOT made, needs approval**

| # | Item | Why I did not touch it |
|---|---|---|
| **7.20** | **Truncate the index pagination.** Every page number renders with no ellipsis (`Array.from({length: pageCount})`), so the footer row grows without bound. | Adding truncation is a behaviour change and changes what `aria-current="page"` can land on. |
| **7.21** | **Normalise the `--` vs `—` placeholder split.** Projects prints an em dash (Forecast finish, Value); Contacts / Companies / Deals print a double hyphen (phone, company). | A redesign is exactly when this gets "tidied" — and it is user-visible copy on 12 columns. Recommend `—` everywhere, in one commit, with sign-off. |
| **7.22** | **Add `aria-sort` to sortable headers.** `sortHeader` marks the column with a `.sorted` class and an inline chevron transform only; there is no `aria-sort` anywhere. | A real a11y gap and a one-line fix, but it changes the accessibility tree that 12 tests query. Recommend doing it as its own change with the tests updated in the same commit. |
| **7.23** | **Clear `createRequest` / `salesOpenRequest` after use.** They are never cleared, so leaving a Sales page and coming back re-mounts it with the old nonce and the create dialog re-opens — as does the last cross-linked drawer. | Reproducible, and very easy to "fix away" during a re-skin. It is state management, which the brief excludes. |
| **7.24** | **Unify Contacts' inline loader with `useSalesData`.** Contacts duplicates the hook, with a different error fallback (`Contacts could not be loaded.` vs `Sales data could not be loaded.`). | Refactoring during a visual pass risks changing error copy. Recommend after. |
| **7.25** | **The Tasks card head/body mismatch.** `Tasks (N)` counts **open** tasks while the body renders **all** tasks, so `Tasks (0)` can sit over a full struck-through list. | Fixing it means choosing whether N or the list changes — a content decision. |
| **7.26** | **Escape in a record drawer discards an unsent composer draft.** `useModalDialog` listens on `document` in the capture phase and `stopPropagation`s, so there is no "Escape cancels the composer first" step. | A real data-loss path, and a genuinely good fix — but it is behaviour, and it touches a hook every dialog in the app shares. |
| **7.27** | **Record-drawer initial focus lands on the back button.** `useModalDialog` looks for `.pdx-form input, select, textarea`, which no drawer contains. | Changing the focus target changes the keyboard entry point on three surfaces with zero tests. |
| **7.28** | **`openEdit`'s silent value coercion.** A Source outside `LEAD_SOURCES`, an Industry outside `COMPANY_INDUSTRIES`, or a missing deal Priority is rewritten to `Other`/`Other`/`Medium` on open — so opening Edit and saving can change a value the user never touched. | Data behaviour, not presentation. Worth fixing; not here. |
| **7.29** | **dnd-kit's a11y layer promises a keyboard path that does not exist.** Its default instructions node says arrow keys move the item, but only a `PointerSensor` is configured, and every card is `tabIndex=0 role=button` yet inert on Enter/Space. | Either add a `KeyboardSensor` (a feature) or override the announcements (copy). Both are out of scope, and **removing dnd-kit's a11y layer would be worse.** Recommend adding the sensor. |
| **7.30** | **The Deals board never renders `No deals match that view`.** Filters that match nothing leave 7 empty lanes each reading `Drop a deal here`. | It looks like a bug and is easy to "fix" in a way that removes the lanes users drag into. Recommend a filtered-empty banner **above** the lanes, keeping them. |
| **7.31** | **The Bookmarks page has no chevron and no toolbar** while all nine record index pages do, so it reads as a different family despite opting into `.hs-index`. | Adding a toolbar to a page with nothing to filter would be inventing UI. The eyebrow group heads now tie it to the family visually, which is as far as presentation can go. |
| **7.32** | **The empty-state copy tells the user to hover.** `.bm-empty`: *"…or hover a category in the sidebar and use the star there."* and `.hs-bookmarks-empty`: *"Hover a category in the sidebar and star a page to keep it here."* | This plan **adds a click path** for coarse pointers (B-4), which makes "hover" wrong on touch. Both strings need one word changed (`hover` → `open`). **Copy change, needs approval.** |
| **7.33** | **The Bookmarks page's null branch.** 0 starred pages + ≥1 pinned view returns `null` for both the groups and `.bm-empty`, leaving a title, a count line and the view tiles with no explanation. | A real bug (`App.tsx:20472`). Fixing it means writing new copy for a fourth state. |
| **7.34** | **Private-mode persistence fails silently.** `readBookmarks()` swallows throws; the toggle's `setItem` is try/caught with `// private mode: the stars just do not persist`. | The user gets no notice. Surfacing it is new copy and a new state. |
| **7.35** | **Saved views: `MAX_SAVED_VIEWS = 12` with `persist()` keeping the last twelve and `serializeSavedViews()` capping the first twelve**, and a swallowed `setUserSetting` failure — so a person can save a view, see the chip, and lose it on reload with no message. | Two separate bugs in state, both worth fixing, neither presentational. |
| **7.36** | **The star menu's `aria-label 'Bookmarks (<N>)'` counts pages only while the badge counts pages + views.** | Screen-reader and visual counts disagree. One-line fix; it changes an accessible name, so it needs its own commit. |
| **7.37** | **Two orderings of one list.** The top-bar menu maps `bookmarks` in insertion order; the Bookmarks page re-groups the same array into rail order. | Defensible either way; picking one is a product call. |
| **7.38** | **Primary-action label casing is inconsistent** (`Add project` vs `Add Crew` vs `Create contact` vs `Add Equipment` vs `Log DelayIQ`). | **Do not normalise** — `tests/index-pages.test.tsx` matches these exact names, and they are user-visible copy. |
| **7.39** | **Equipment duplicates an accessible name** (`Edit <name>` on both the name link and the pencil; the test uses `getAllByRole(...)[0]` and comments on it). | A genuine a11y defect, deliberately not "fixed" because doing so requires the test to change in the same commit. |
| **7.40** | **The top-bar `<kbd>` prints a hardcoded Mac `⌘K` on every platform**, and there is no `aria-keyshortcuts` on the only shortcut in the area. | Platform detection is behaviour; the `aria-keyshortcuts` addition changes the accessibility tree. |
| **7.41** | **`--orange` is literally `#2f6bff` and `--yellow` is `#0046f7`.** | Renaming a token consumed 500+ times is a refactor, not a re-skin. The **values** are corrected where they render orange (7.3); the misleading names survive. |
| **7.42** | **`ScheduleBadge` relabels `Ready to Start` → `Ready`** while `Badge` prints the full string, so one status renders two different words depending on which component draws it. | Copy. Recommend picking one. |
| **7.43** | **`statusTone()`'s silent fall-through.** Any status outside the three allow-lists renders in the blue default with no warning — `DelayIQ Reported` is a live example. | The allow-list is re-derived by hand (B-7) rather than re-themed, but adding a dev warning is code. |
| **7.44** | **The app never says whether an AI answer came from Claude or the built-in simulation.** Every call returns `{mode:'live'\|'demo'}` and the UI drops it. | Surfacing it is new copy and arguably a new product commitment. Flagged because a re-skin that makes the panel look more polished widens the honesty gap. |
| **7.45** | **The Tools menu's five toggles are decorative** (`enabledTools` is never sent) and the model names can drift from the server default (`claude-opus-4-8`). | Wiring them is a feature. Their current visual weight is preserved deliberately. |
| **7.46** | **Settings → BuildFlow AI: three controls, one with state, none with an effect.** | Same reasoning. The two inert selects keep the same visual weight as the live toggle rather than gaining emphasis. |
| **7.47** | **The import dialog's ForecastIQ badge icon is visually inverted** — `TrendingUp` when LATE, `TrendingDown` when early. | Reads as a bug; may be deliberate ("the number is going up"). Needs a product answer, not a CSS change. |
| **7.48** | **`#ai-overview`'s `Readiness scoring` and `Recovery plans` describe features that do not exist**, and the assistant's post-import "here's how I optimized the plan" bullets are fixed copy, not analysis. | The cards render **static** — no lift, no arrow, no pointer cursor — so the re-skin does not give them affordances. Removing or relabelling the copy is a marketing decision. |
| **7.49** | **`BuildFlow Apps`' `Active` badge is static on all five cards regardless of ownership, and `Add App` is a button with no handler.** | The badge renders neutral (not green, not blue) and `Add App` gains no hover lift and no pointer cursor, so neither promises what it cannot do — but the honest fix is to wire or remove them. |
| **7.50** | **Two `Ask AI` FABs, same label, different behaviour** (in-app opens the panel with Sparkles; `#help-center` enters the dashboard with `MessageCircle`). | The icon is the only cue. Preserved; recommend relabelling the marketing one. |
| **7.51** | **`--qc-ease: cubic-bezier(0.37,0,0.63,1)` is a third curve in the estate.** | Kept deliberately: it is a symmetric ease-in-out for a continuous orbit, which is exactly the case the signature overshoot curve reads badly on. Declared rather than silently retained. |
| **7.52** | **Projects' `Forecast finish` column is not sortable** while every neighbour is (it is absent from the `sortKey` union). | Adding it is logic. Flagged so it is a decision rather than an oversight. |
| **7.53** | **`ai-film-redesign.css` — 897 dead lines** styling `.ai-film` / `.wx-demo-frame-film`, which nothing renders, still imported at `main.tsx:31` with a comment claiming it must load LAST. | **Proposed removal.** Deleting it changes the import count (62 → 61) in a hand-tuned order, so it wants its own commit and a computed-style diff. Leaving it costs 897 lines of confusing precedent. |
| **7.54** | **Dead CSS in the shared sheet, not ported:** `.hs-view-add` and `.hs-qf-mini` (zero markup consumers), `.hs-search kbd` (styled but never rendered by an index page), and `.hc-assistant-fab.open` (a 52px collapsed FAB state no React code sets). | **Proposed removal**, verified by grep. Not deleted in the same pass as the re-skin so a regression stays attributable. |
| **7.55** | **`sidebar-redesign.css` — 307 dead lines** on `.sidebar-rx`, which appears nowhere in `App.tsx`, plus the inert `collapsed` / `onToggleCollapsed` props and the `sidebar-collapsed` class. | **Proposed removal** (it is also the concept's phase G). Three of the 14 in-app `#1a73e8` literals live in it, so deleting it shrinks the accent migration too. |
| **7.56** | **The AI product contradiction.** The plans band says Schedule AI *"ships in every tier … never a paid add-on"*; `ADD_ON_CATALOG` prices it at `$15 per user / month`, excludes Free, and Settings → Billing sells it. | **This needs a product decision before either surface is re-skinned**, because the redesign makes both statements more prominent. |

---

## 8. Open questions

1. **Does `--wx-serif`'s deletion have sign-off now that we know it renders?** It changes the
   typeface on 7 dialog families (§7.1). My recommendation is yes — it makes the `.pdx` title
   *more* faithful, and 38px Inter italic with the trio gradient is a better reading of the
   Welcome hero than 42px Palatino. But `DESIGN_TOKENS.md` needs the correction recorded, because
   its "nothing renders serif" line is the basis for calling the deletion inert.
2. **Is the trio's second in-app use accepted?** `.pdx .pdx-title em` (§7.18). If not, the `em`
   falls back to `#1c1c1a` italic and the app has no gradient outside the 36px AI sparkle.
3. **`.pdx-title` at `clamp(28px, 3.2vw, 38px)`, or dialled back?** This is the cluster's — and
   the app's — only display-register type. 38px is exactly the Welcome Page's display floor,
   which makes the two ladders continuous at one rung. The alternative is
   `clamp(26px, 2.6vw, 34px)`, which is quieter above a ten-field two-column form but breaks the
   shared rung. **I recommend 38px** and I recommend seeing it on the Deal dialog (nine fields)
   before deciding.
4. **The AI entitlement contradiction (§7.56)** — free in every tier, or a $15 add-on? Both
   surfaces exist and the redesign makes both louder.
5. **The two empty-state copy strings that say "hover" (§7.32).** One word each. Without the
   change, the plan ships a click path the copy denies.
6. **Is the `rgba(28,28,26,0.13)` chrome hairline enough of a state anchor on a light ground
   (§7.14)?** This must be looked at, not reasoned about. If it is not, the fallbacks in order of
   preference are: (a) keep the rail at `#f5f6fa` but give the top bar a 2px hairline; (b) give
   the rail a `rgba(28,28,26,0.02)` tint, which is a second ground and therefore banding; (c)
   accept the flip and rely on the blur. Editorial's `#fff` fallback reintroduces exactly the
   banding it set out to remove and should not be used.
7. **Does the `.hs-upd-dialog` / `.hs-addon-dialog` base split (§6.2) belong to this cluster or
   the dashboard's?** The What's-new dialog is a shell surface; the add-on prompt is reachable from
   my `.bm-tile`s and flyout rows. The split must happen **once**, before either is restyled, or
   restyling one restyles the other. Whoever goes first should own it.
8. **Who owns the five cross-cluster AI readouts (§6.5, §6.6)?** The Route Optimization panel and
   the weather ForecastIQ manager live on Map & Field Ops (`map-timecard`), Labor forecastIQ on
   TimeCard (`map-timecard`), Backlog ForecastIQ on Reports (`field-delayiq-reports`). Their
   *content* is mapped here because it is AI-branded and the AI record owns it; their *page frame*
   belongs to those clusters. The eyebrow/figure/flat-fill treatment must be identical in both
   maps or the family resemblance breaks at exactly the surfaces users compare.

---

## 9. Build order and acceptance for this cluster

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append `--bf-app-*` (incl. the two new rungs `--bf-app-display` and `--bf-app-tail`, and `--bf-tilt-dense`); re-base `--bf-focus-ring`; align `useHudMotion.ts:50` to `0.16` / `-6%` | `design-tokens.css`, `useHudMotion.ts` | none |
| **B** | Create `app-shell-daylight.css` with the PINNED comment block (§2.2) at its top; append its import as the new last line of `main.tsx`; add `"bf-shell"` to `shellClassName` | 3 | none — deleting the word `bf-shell` reverts everything |
| **C** | The shared layers, in this order because they are the substrate for the other 30 screens: the three duplicate `--hsx-*` blocks → 8 new values; `hs-index.css`'s eyebrow `thead` + boundary collapse + buttons + cells + footer + its first reduce block; `redesign.css`'s tokens, ground, focus ring, `::selection`, scrollbars and its `!important` block; `styles.css`'s legacy primitives | 6 | **medium** — this is where `tests/index-pages.test.tsx` (12) lives |
| **D** | Sales: `hs-contacts.css` (KPI grid, drawers, composers, timeline, board, dialogs) + the `.contacts-page`-scoped six; `project-dialog-redesign.css` (the 26px stage, the display title, **the serif deletion**) | 2 | low |
| **E** | Bookmarks + flyout: `bookmarks-page.css` (tiles, stars, `bm-rise` relocation, the `small` fix, its reduce block); the `schedule.css:1945` saved-views block; `.hs-flyout-tip`'s `:focus-within` | 3 | low |
| **F** | AI: `hs-breeze.css` (surfaces, tokens, the ≤720px tab strip, the literals → `var()`); `delayiq.css`; `field-variance.css`; the `.sim-*` block in `schedule.css`; `quantum-cloud-loader.css` tones; `text-shimmer.tsx`'s reduce guard; `hs-home.css`'s `.cc-rec` / `.cc-approval` / `.cc-app` | 7 | low — **and the always-mounted `display:none` contract on `.bf-breeze` is a named review gate, not a hope** |
| **G** | Ports: `rail-tooltip.tsx`, `spotlight-surface.tsx`; wire tooltips to the star trigger, the AI sparkle, the two drawer icon buttons and `KpiCard`'s `title`; wire spotlight to `.hs-index-card` / `.hs-kpi` / `.hs-flyout` / `.bm-tile`; `DxTilt`'s clamp + reduce guard | 2 new + `App.tsx` + `shared.tsx` | low — additive wrappers, no selector or name changes |
| **H** | The two new tests: `density.test.ts`, `shell-nav.test.tsx`; the two invariant comments (§2.9) | 2 new + `App.tsx` | none |
| **I** | Cleanup, last so a regression stays attributable: the 14 in-app `#1a73e8`/`rgba(26,115,232,…)` literals; the dead CSS (§7.54); `sidebar-redesign.css` (§7.55); `ai-film-redesign.css` (§7.53) — each its own commit | ~18 | low |

**Run these files first, in order:** `tests/index-pages.test.tsx` (12) → `tests/settings.test.tsx`
(9, because of TopBar-on-Settings) → `schedule/boundary.test.ts` (8) → `schedule/pages.test.tsx`
(41, for Saved views + the flyout menuitem) → `schedule/linkBookmarks.test.ts` (4) →
`schedule/ScheduleImportDialog.test.tsx` (4) → `tests/map.test.tsx` (7, for Route Optimization) →
`App.test.tsx` (62, for the variance loop and the honesty guards) → the full 346.

**Expected test edits in this cluster: zero.** Every anchor is an accessible name, an id, a role,
a class name or a copy string, and none of them changes.

**Acceptance:**
1. All 346 pass with no test file edited.
2. `density.test.ts` passes — meaning no font-size, radius, shadow, easing or `backdrop-filter`
   outside the allowlist made it into the new sheet, and no selector was renamed.
3. A **computed-style diff** over the 33 screens confirms: every colour, radius and shadow
   changed as specified, and **no font-size on a frozen surface moved** — specifically
   `.dash-block h2` = 14.5px, `.hs-index .hs-table thead th` height = 42px, `tbody tr` height =
   46px, `.hs-table` `min-width` = 720px, `.hs-record` width = `min(600px, 100%)`,
   `.hs-flyout` `min-width` = 228px, `.hs-bookmarks-menu` `min-width` = 264px, `.bf-breeze`
   `top`/`left` = 56px, `grid-auto-rows` = 40px.
4. A **hand walk of the four zero-coverage surfaces** against their item lists above: the three
   record drawers (S-1 19+12 information / 19 actions; S-5 10/6; S-9 10/7), the Bookmarks page
   (B-0 12/5, B-1 6/3, B-2 5/2), the top-bar star menu (B-3 8/9), and the whole `BreezeAssistant`
   (A-0 26+audit / 32).
5. **The AI panel's mount contract, verified by hand:** open the panel, close it, press `1`–`6`
   on a schedule page, and confirm the view shortcuts still fire — i.e. `dialogIsOpen()` still
   reads the panel as closed because it is `display: none` and still mounted.
6. **The tutorial, run in a browser from step 1 to the wrap-up at 1440 / 768 / 375px**, with
   particular attention to `contacts-page-title`, `schedule-status-band`, `schedule-alerts`,
   `contact-dialog`, `crew-dialog` and `tutorial-restart-button` — the last of which is now
   visible below 560px for the first time.
7. **The what's-new v3.7 spotlight**, clicked through `Show me where it is`, landing on
   `contacts-page-title` with its outline and three pulses intact.
8. **The chrome hairline looked at on an uncalibrated monitor** (§7.14, §8.6) — not reasoned
   about.
9. **A deal dragged between lanes at 1440px and on a touch device**, confirming the three-part
   illusion (ghost, overlay lift, landing pulse at `delay 0.32s` against a 340ms drop) is intact.
10. **`Optimize Routes` → `Optimized` with a truck route on top** (`tests/map.test.tsx:205-244`'s
    scenario) run by hand as well as in the suite, because it is the audit-added anchor the
    inventory missed.
