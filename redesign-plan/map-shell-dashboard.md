# Redesign mapping — cluster **shell-dashboard**

Screen-by-screen mapping of `inventory/app-shell.json` (its 16 screens, plus 3 that its
`completenessCheck` says need their own design pass — the loading screen, the error screen and
`PageReleaseTag` — plus 1 non-visual contract screen for the routing layer; `SavedViewsFlyout` is
folded into the flyout screen and `DashboardSkeleton` is a dashboard screen) and
`inventory/dashboard.json` (23 screens), against the chosen shell concept **preserve / "Daylight
Rail"**
(`plan/concept-preserve.md`) and the measured language in `DESIGN_TOKENS.md`.

**43 screens mapped. 273 information items and 154 actions placed** — app-shell's 130/94 and
dashboard's 143/60, plus the items each record's `completenessCheck` adds (the routing contract, the
`superseded` chip value, `relativeTime()`'s full value set, `projectName()`'s "Unassigned",
`isDisruptiveWeatherAlert`'s nine elided keywords, the four unrecorded `aria-label`s, the assistant's
second import message and its `title` attributes, the KPI baseline asymmetry, and the rest).
Nothing in either record is dropped. Everything I think *should* go is listed in §12 "Proposed
removals, needs approval" and is still shipped until someone signs it off.

---

## 0. What is fixed before this document starts

| Fixed | Value |
|---|---|
| No Tailwind, no shadcn | Ported components go in `client/src/components/ui/` as inline styles + one inline `<style>` block, shadcn tokens mapped onto `--wx-*` with literal fallbacks — the shape of `display-cards.tsx` / `stagger-cards.tsx` |
| Accent | `#2f6bff`. Welcome Page and `.acct-split` move to it |
| `--wx-amber` | stays `#0032b0` in its 7 scopes. Renders as it renders today |
| `--wx-serif` | deleted from the 10 app scopes; its 27 reads rewritten to `var(--bf-font-sans)` |
| Shell geometry | `--hs-topbar-h: 56px`, `--hs-rail-w: 56px`, rail 40×40 buttons, flyout `left: var(--hs-rail-w)` + `offsetTop` — frozen |
| Board geometry | `DASH_COLS 6`, `DASH_ROW_UNIT 40`, `DASH_GAP 16` — frozen (§4) |
| Business logic | untouched. No API call, data model, state shape, auth path or save/load behaviour changes anywhere in this mapping |

**How it ships (from the concept, unchanged):** one new stylesheet
`client/src/app-shell-daylight.css`, appended as the last `main.tsx` import after
`app-shell-hubspot.css`; one new class `bf-shell` added to `shellClassName` (App.tsx:2795);
every rule in the new file is an existing selector with `.bf-shell` prefixed onto it. Deleting
the word `bf-shell` reverts the whole cluster. No `:where()` (jsdom breaker), no `!important`,
no import reordering.

One correction to the concept's §5e: it writes the palette rule as
`.bf-shell ~ .cmdk-backdrop, .cmdk-backdrop { … }`. `CommandPalette` is a **child** of the shell
div (App.tsx:2807, immediately inside 2806), so the sibling combinator matches nothing and only
the unscoped half carries the rule — which also puts one rule outside the kill switch. Write it
`.hs-shell.bf-shell .cmdk-backdrop`.

---

## 1. The density register — how the language translates to 13px surfaces

### 1.1 Two corrections to the concept's own premise, both measured today

The concept states (§3b, §12.2) that *"nothing in the app exceeds 26px"* and therefore *"no
surface in the product occupies the display register at all."* Both are false on this cluster's
own pages, and the truth is much better for fidelity:

| Element | File | Live value |
|---|---|---|
| `.ss-figure strong` — the Schedule Status headline number, **on the Dashboard** | `schedule.css:384` | **`clamp(44px, 6vw, 64px)` / 750 / `-0.03em` / lh 1** |
| `.hs-home-greeting` — the Dashboard's `h1` | `hs-home.css:917` | **`clamp(26px, 3vw, 32px)` / 650 / `-0.02em` / lh 1.1** |
| `.ss-facts dd` | `schedule.css:449` | 22px / 750 |
| `.kpi-card strong` | `hs-home.css:1091` | 28px / 700 / `-0.02em` |
| `.cc-stat-value` | `hs-home.css:1083` | 26px |

`hs-home.css` re-frames `.ss-band` (border, 8px radius, no shadow, no hover) but **never touches
`.ss-figure`** — I grepped every `ss-` selector in the file (hits at 947/955/958/1034/1046/2016/2027
only). So the Dashboard's real type ceiling today is **64px**, not 26px, and the display register
is already occupied by exactly the right kind of element: a single portfolio figure, once, above
the board.

Second correction: the concept freezes the board panel `h2` at **14.5px/650** citing
`hs-home.css:1233`'s `-3px` "17px head row" calibration. There are **two** declarations of
`.dash-rx.hs-home .hs-widget-head h2` at identical specificity — `hs-home.css:985` (14.5px/650)
and `hs-home.css:1507` (15px/700). The later one wins. The live value is **15px/700**, and 15px/700
is what produces the 17px box the `-3px` is calibrated against. **Freeze 15px/700**, not 14.5px.

### 1.2 What carries over LITERALLY — same value, no rescale

Verbatim from `DESIGN_TOKENS.md`, applied to every surface in this cluster:

- **One ground.** `#f5f6fa` end to end, chrome included. Sections transparent over it. No banding.
- **Ink / muted / faint.** `#1c1c1a` / `#575550` / `#8a877e`. This retires the third ink
  (`--hsx-ink` / `--hsh-ink` `#14203a`) as a *text* colour everywhere in the cluster.
- **Hairlines.** `rgba(28,28,26,0.13)` and `rgba(28,28,26,0.07)`.
- **Card fill** `#ffffff`. **Accent** `#2f6bff`, one.
- **Radius ladder** `999 / 26 / 20 / 18 / 12 / 8` + `50%`. Radius does **not** scale with density:
  an 18px corner on a 300px card is a sheet of paper, a 14px corner is a widget. No 14px rung is
  introduced anywhere in this cluster, and no rung is retired.
- **Shadow ladder**, all seven steps verbatim.
- **Easing** `cubic-bezier(0.22,1,0.36,1)`; `cubic-bezier(0.4,0,0.2,1)` only for height/grid.
- **Interaction durations** `.18 / .25 / .28 / .3s`. **Entrance** `.7–1.0s`, once, outside the board.
- **Hover grammar, four moves, no fifth**: lift cards · invert pills · slide directional links ·
  tilt product mocks (in-app: the re-scaled spotlight, §3.2).
- **One-shot reveals**: `.in` then `unobserve`.
- **Copy measures in `ch`**, never px: `--bf-app-prose: 62ch` on every run of prose in the cluster.
- **Inter, one family.** Italic `em` is the only display accent.
- **THE EYEBROW DOES NOT RESCALE.** `11.5px / 650 / 0.045em / uppercase / #8a877e`, at ×1, is the
  single highest-yield rule in the set. It is applied to every label role in this cluster:
  `.ss-eyebrow` (today 12px/700/`0.06em`/`#575550`), `.kpi-card p`, `.hs-kpi-label`,
  `.hs-menu-head`, `.hs-flyout` head (today 14px/700 white), `.cmdk-group`,
  `.notifications-panel` eyebrow, `.dashboard-feed-panel` eyebrow, `.bf-breeze` "Suggested",
  `.hs-home-hidden` label, the `.hs-upd-*` eyebrow, and — the one that pays for the rest —
  **`.hs-index .hs-table thead th`** (today 12.5px/650/`0.01em` on a `#fafbfd` fill; the fill goes
  transparent to the ground, `12.5px → 11.5px`, `0.01em → 0.045em`, `uppercase`, `#8a877e`,
  bottom border `rgba(28,28,26,0.13)`). Column heads are the most-repeated text in the product.

### 1.3 What gets RESCALED — with the numbers

| Role | Welcome Page | This cluster | Factor |
|---|---|---|---|
| Display figure | stat `clamp(46px,5.4vw,72px)` | `--bf-app-display: clamp(44px,6vw,64px)` — **the measured value, unchanged**; weight `750 → 700`, tracking `-0.03em` kept | ÷1.1 |
| Page hero | feature hero `clamp(38px,5vw,78px)` | `--bf-app-hero: clamp(28px,3vw,38px)` — the Dashboard greeting; **the 38px cap is the Welcome Page's own display floor**, so the two ladders touch at one rung | ÷2.05 |
| Page title | section h2 `clamp(32px,4.4vw,54px)` | `--bf-app-title: clamp(22px,1.9vw,26px)` / 600 / `-0.02em` / 1.14 — never below today's 22px | ÷2.08 |
| Card / section head | row h3 `clamp(26px,3vw,38px)` | `--bf-app-section: 16px` / 600 / `-0.01em` (off-board), `--bf-app-panel: 15px` / 700 **frozen** on the board | ÷2.4 |
| Figure | proof `clamp(42px,4.8vw,60px)` | `--bf-app-figure-lg: 28px` (KPI) · `--bf-app-figure: 26px` (stat) · `--bf-app-figure-sm: 22px` (band fact), all `+ tabular-nums` | ÷2.1 |
| Lede | `clamp(16px,1.35vw,19px)` | `--bf-app-lede: 14.5px`, measure `62ch` | ÷1.3 |
| Body | 15–16px | `--bf-app-row: 13px` / 1.45, `--bf-app-row-strong: 13.5px` / 600 | ÷1.2 |
| Eyebrow | 11.5–13px | `11.5px` — **×1, see §1.2** | ×1 |
| Section rhythm | `clamp(76px,12vh,130px)` → 108px @1440 | off-board stack `--bf-rhythm-dense` (20–34px → **30px**, which is what `.dx-inner` already has); **on-board gap is `DASH_GAP: 16px` and cannot move** | ÷3.6 |
| Bottom tail | footer air | `--bf-app-tail: 72px` (today 56px) — free, nothing competes below the last row | ÷1.5 |
| Card hover lift | `translateY(-6px)` | `--bf-lift-dense: -4px`, and only on cards that navigate | ÷1.5 |
| Page measure | 1140px | **1140px is kept as `.wx-main`'s value and is not imposed here.** The Dashboard column is 880px (measured, `hs-home.css:1391` beats `:853`); the board needs its 6 columns. `.bf-doc-bleed` (§2.3) lets a wide board escape a measure instead of the measure being abandoned | n/a |

**Deviation from the concept, declared:** it sets `--bf-app-lede: 14px`. The measured value is
14.5px (`hs-home.css:926`). Shrinking it half a pixel reflows the header and buys nothing, so the
token is **14.5px**. Same reasoning freezes the date line at 13px/600 and the panel `h2` at 15px/700.

### 1.4 The one sentence that proves one system at two volumes

Stated as jumps against each source's own internal range, which is checkable:

- Welcome Page: body floor **12px** → hero cap **96px** = **8.00×**.
- This cluster: micro **11px** → display cap **64px** = **5.82×**. Row **13px** → title **26px** =
  **2.00×**; row **13px** → display **64px** = **4.92×**.
- **The product's range is 73% of the marketing page's, on one continuous ladder with no rung
  invented and no rung skipped:** 11 · 11.5 · 12 · 13 · 13.5 · 14.5 · 15 · 16 · 22 · 26 · 28 ·
  22–26 · 28–38 · 44–64.

There is no within-product type seam: one ladder serves the shell, the Dashboard and the board.
The only frozen rungs are 15px (panel `h2`) and 46/42px (table row/head heights), and both are
frozen for a stated mechanical reason, not for density doctrine.

### 1.5 Accent budget, expressed as a count

**At most one blue element visible in the nav at a time.** Enforced, not asserted:

| Element | Today | New | Note |
|---|---|---|---|
| Active rail hub | `#2f6bff` fill | `#2f6bff` fill | the one blue |
| Bookmarks star `.has-items` | gold `#f0b354` | `#2f6bff` | **declared visible change** — the filled-vs-outline distinction still carries the information |
| Flyout star on | gold `#e8a33d` | `#2f6bff` | same |
| `.bm-tile.is-starred` border | `rgba(240,179,84,.55)` | `rgba(47,107,255,.35)` | same |
| Rail/flyout/menu `Beta` pill | violet `#a78bfa` / `#7c3aed` | `#6d28d9` on a 10%-alpha fill | re-based, not retired: it is a *state* word, not an accent, and it is never in the nav at the same time as an active-hub blue **unless the active hub is Sales** — in that case the pill is inside an open flyout and the hub fill is the same blue, so the count holds at one hue plus one state colour |
| AI sparkle | blue→purple gradient | the trio (§1.6) | the app's one licensed gradient |

### 1.6 The gradient trio: one licensed use in-app, three forced flat

Licensed: **the top-bar AI sparkle** (`linear-gradient(96deg,#4285f4 0%,#9b72cb 54%,#d96570 100%)`)
— the sanctioned `.wx-grad-ai` role. Named and forced flat, so the licence means something:

1. `.hs-progress` track gradient → flat `rgba(28,28,26,0.07)` with a `#2f6bff` fill.
2. `.primary-button` gradient → flat `#2f6bff`.
3. The Settings `.sx-dot` gradient → flat `#2f6bff` (Settings is a neighbouring cluster; the rule
   is listed here because the licence is shell-wide).
4. Found while doing it: a leftover pre-blue **orange** `--shadow-accent: rgba(251,133,0,…)`. It is
   dead weight from before the blue era; retire it with the `--wx-serif` sweep.

In this cluster the trio also survives in two places I am **not** touching because they are content,
not chrome: the What's-new starburst's `HS_UPDATE_RAY_COLORS` (`#2f6bff / #9b72cb / #d96570 /
#4285f4`, **JS literals in App.tsx:3071** — a re-palette has to touch TypeScript, not CSS) and its
`#4285f4 → #9b72cb` sparkle gradient. Both are already the trio's own values.

### 1.7 The light-chrome hairline — the one thing all four concepts under-priced

Flipping the chrome to paper deletes the app's only strong "I am inside the workspace" colour
anchor. After the flip, the entire state distinction between the marketing page and the workspace
is carried by `1px rgba(28,28,26,0.07)` and a `blur(14px)`. **This needs to be verified on an
uncalibrated monitor, not asserted.** The decision this mapping ships:

- Top bar: `rgba(245,246,250,0.82)` + `backdrop-filter: blur(14px) saturate(140%)`, bottom hairline
  `rgba(28,28,26,0.07)`, `box-shadow: none`.
- Rail: **opaque `#f5f6fa`** (the flyout needs ground under it), right hairline
  `rgba(28,28,26,0.07)`.
- **The hairline is promoted one step to `rgba(28,28,26,0.13)` if the verification fails.** That is
  a one-token change (`--hs-line-on-navy`), it is reversible, and the acceptance list (§14) carries
  it as a required check with a named outcome rather than a hope.

### 1.8 Flipping the chrome by token VALUES, not by rewriting rules

340 `--hsx-*` and 113 `--hsh-*` consumers already read through these names. So the flip is eight
values on `.hs-shell.bf-shell` and nothing else:

```css
.hs-shell.bf-shell {
  --hs-navy:            #f5f6fa;   /* the ground, not a band */
  --hs-navy-2:          #ffffff;   /* was the flyout fill */
  --hs-navy-3:          rgba(28, 28, 26, 0.05);
  --hs-text-on-navy:    #1c1c1a;
  --hs-muted-on-navy:   #575550;
  --hs-dim-on-navy:     #8a877e;
  --hs-line-on-navy:    rgba(28, 28, 26, 0.07);   /* §1.7's dial */
  --hs-ink:             #1c1c1a;   /* retires the third ink */
}
```

Cheapest possible route to "one ground, no banding", and revertable in one commit. Everything else
in the new stylesheet is surface (radius, shadow, type, motion) on top of that.

---

## 2. The tokens this cluster adds

### 2.1 Appended to `client/src/design-tokens.css`

All under the already-unused `--bf-` prefix, so the file stays pixel-inert until a rule reads it.

```css
:root {
  /* ---- dense type register — one ladder, 11px → 64px --------------------- */
  --bf-app-display:        clamp(44px, 6vw, 64px); /* measured on .ss-figure strong; UNCHANGED */
  --bf-app-display-track:  -0.03em;
  --bf-app-hero:           clamp(28px, 3vw, 38px); /* dashboard greeting; 38px = Welcome's display floor */
  --bf-app-hero-track:     -0.025em;
  --bf-app-title:          clamp(22px, 1.9vw, 26px);
  --bf-app-title-track:    -0.02em;
  --bf-app-title-lead:     1.14;
  --bf-app-panel:          15px;    /* FROZEN — board panel h2; the drag handle's -3px is
                                       calibrated against the 17px box 15px/700 produces */
  --bf-app-section:        16px;    /* off-board card / section head */
  --bf-app-figure-lg:      28px;    /* KPI value */
  --bf-app-figure:         26px;    /* stat value */
  --bf-app-figure-sm:      22px;    /* status-band fact */
  --bf-app-figure-track:   -0.02em;
  --bf-app-lede:           14.5px;  /* measured, NOT 14px — see §1.3 */
  --bf-app-row-strong:     13.5px;
  --bf-app-row:            13px;
  --bf-app-meta:           12px;
  --bf-app-eyebrow:        11.5px;
  --bf-app-eyebrow-track:  0.045em;
  --bf-app-micro:          11px;
  --bf-app-lead-row:       1.45;

  /* ---- dense measures ---------------------------------------------------- */
  --bf-app-prose:          62ch;
  --bf-app-gutter-y:       clamp(18px, 2vw, 28px);
  --bf-app-gutter-x:       clamp(18px, 2.4vw, 32px);
  --bf-app-tail:           72px;    /* free air at the foot of a page */

  /* ---- dense motion: the reveal arithmetic (§3.1) ------------------------ */
  --bf-reveal-shift-dense:   12px;
  --bf-dur-reveal-dense:     0.55s;
  --bf-reveal-stagger-dense: 50ms;

  /* ---- the fourth hover move, re-scaled --------------------------------- */
  --bf-lift-dense:         -4px;
  --bf-spotlight-r:        220px;
  --bf-spotlight-a:        0.06;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --bf-lift-dense: 0px;
    --bf-spotlight-a: 0;
    --bf-reveal-shift-dense: 0px;
    --bf-dur-reveal-dense: 0.3s;      /* matches what dashboard-redesign.css:844 already does:
                                         shorten to .3s rather than remove */
    --bf-reveal-stagger-dense: 0ms;
  }
}
```

### 2.2 Two corrections to `design-tokens.css` as it stands

Both follow from decision #2 (the accent is `#2f6bff`):

```css
--bf-focus-ring: 0 0 0 4px rgba(47, 107, 255, 0.12);   /* was rgba(26, 115, 232, 0.12) */
```

and the `#1a73e8` literal in its comment block. In-app that is 14 literal migrations
(`dashboard-redesign.css` ×4 — including the `.kpi-card-button:focus-visible` ring at
`dashboard-redesign.css:302`, which is `rgba(26,115,232,.28)` and is the effective ring on the
Dashboard — plus `projects-` ×3, `schedule.css` ×2, `equipment-`/`materials-`/`field-updates-` ×1
each, `design-tokens.css` ×1, and `sidebar-redesign.css` ×3 which is being deleted).

### 2.3 One additive utility

```css
.bf-doc-bleed { width: 100%; max-width: none; margin-inline: 0; }
```

Applied to a dense board or a wide table inside a measured column, so the measure is escaped by the
one element that needs it instead of being abandoned for the whole page. In this cluster it is used
on `.dash-board` at ≥1281px only (§Panel board) and nowhere else.

---

## 3. Motion contract for this cluster

### 3.1 The reveal arithmetic — the numbers, and why the current ones are wrong here

Today `[data-reveal]` on the Dashboard is `translateY(28px)` over `0.9s` with a `90ms` stagger.
A 46px alert row moved 28px travels **61% of its own height**, and at 0.9s the page is still
settling when the eye arrives. Dense surfaces need a shorter throw:

```
--bf-reveal-shift-dense: 12px    (26% of a 46px row, 8% of a 150px panel)
--bf-dur-reveal-dense:   0.55s
--bf-reveal-stagger-dense: 50ms
```

Attached to **sections, never rows or cells. Budget: six per page.**

**The Dashboard is over budget at 11.** Today: `.hs-home-head`, the `.ss-band`, three rail panel
bodies (alerts / recommendations / approvals), the apps section, the quick row, the Recent-activity
section, the TimeCard section, plus `[data-reveal-stagger]` on `.cc-stat-grid` and `.kpi-grid`.

**The six that stay:** `.hs-home-head` · `.ss-band` · `.cc-stat-grid` (stagger) · `.kpi-grid`
(stagger) · the Recent-activity section · the TimeCard section.

**The five that lose `data-reveal`** (attribute removed from the JSX; the CSS rest state is
`opacity: 0`, so removing the attribute simply renders them immediately): the three
`.cc-panel > .cc-list` bodies, `.cc-apps-grid`'s section, and `.cc-quick`. Reason: they are rows
inside a panel, and the panel sits on a drag surface where an entrance animation fights the board's
own `0.26s` reflow transition.

**The board itself never becomes a reveal target.** `.dash-board` takes `is-editing` / `is-move` /
`is-resize` / `is-stacked` dynamically, and `.dash-block` takes `is-dragging` / `is-resizing` /
`is-landing` — a dynamic `className` on a `[data-reveal]` element wipes the imperatively-added
`.in` and leaves the element at `opacity: 0` forever. Documented failure mode in this repo.
`.cc-main` is also excluded, for a second reason: it **is** the `data-tutorial-id
="dashboard-production-context"` anchor, and a reveal's `translateY` on a spotlit element
mis-places the tutorial light.

### 3.2 Correction to the concept: the reveal contract lives in TWO files, not one

The concept says aligning the observer to the documented contract is *"one line, ten page roots."*
It is **two** edits. `client/src/useHudMotion.ts:50` has `{ threshold: 0.12, rootMargin: "0px 0px
-5% 0px" }` and serves ten page roots — **but the Dashboard does not call `useHudMotion`.** It
holds its own duplicated copy of the effect at `App.tsx:25773-25800`, with the same two numbers plus
a `MutationObserver` for late-mounting targets (the status band). Both must go to
`threshold: 0.16, rootMargin: "0px 0px -6% 0px"`, or the Dashboard silently keeps the old contract.

### 3.3 The four hover moves, and where each one lives in this cluster

| Move | Applies to | Does **not** apply to |
|---|---|---|
| **Lift** `translateY(var(--bf-lift-dense))` + `--bf-shadow-card-hover`, `0.28s var(--bf-ease)` | `.bm-tile`, `.cc-app`, `.tc-dash-card`, `.kpi-card-button`, `.cc-stat`, `.ss-project`, the KPI-feed rows — every card whose whole boundary navigates or opens something | **`.dash-block`** — it is a drag target; a lift fights the grip. It gets **drag-lift** instead (the existing `is-dragging` drop-shadow), and the spotlight at rest |
| **Invert** outline pill → ink fill | `.hs-btn`-class controls, `.topbar-verify`, `.error-screen-back`, `.hs-home-empty-btn`, `.dash-reset`, `.hs-home-customize`, `.hs-home-hidden-chip`, `.cc-btn.ghost` | the AI FAB (floating pills lift, anchored pills invert — declared micro-deviation) |
| **Slide** `translateX(var(--bf-slide))` = 3px | every menu row (flyout item, `.hs-menu` row, notification row, bookmark row, `.cmdk` row), every directional link (`.cc-link`, `.hs-bookmarks-add`, `.hs-home-promo-action`, `View all …`) — the icon slides, not the text | table cells, KPI tiles |
| **Tilt**, re-scaled to **spotlight** | `.dash-block` (12 panels), `.cc-panel > .cc-list`, `.hs-flyout`, `.hs-index-card` | anything with 13px text that also moves: the real tilt survives only where it already exists, on `.kpi-card` via `DxTilt` (max 7°), which is kept |

### 3.4 Keyframes: every name survives

`hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping`, `hs-tag-in`, `hs-pop`,
`hs-flyout-in`, `hs-top-spin`, `hs-top-gear`, `hs-top-bell`, `hs-top-badge`, `hs-top-twinkle`,
`hsh-rise`, `hsh-fade-in`, `hs-dropslot-in`, `dash-land`, `dash-skel-shimmer`, `dx-pulse`,
`dx-fade-up`, `bm-rise`, `hs-upd-fade`, `hs-upd-pop`, `hs-upd-pulse`, `bfz-in`, `bfz-pop`,
`bfz-rise`, `bfz-pulse` — **values change, names never do.** The four
`prefers-reduced-motion` blocks in `app-shell-hubspot.css` (~673, ~855, ~942, ~1115) plus the
blocks in `hs-home.css` (1741, 1948, 2069), `dashboard-redesign.css` (843), `hs-breeze.css` (862),
`hs-update-modal.css` (195) and `bookmarks-page.css` (167) null them **by name**; a rename silently
un-nulls them.

Where a keyframe should stop running, it is **removed from the four/ten existing reduced-motion
blocks by editing those blocks**, never by leaving an orphan. Exactly two new names ship:
`bf-shell-in` (the once-only chrome entrance) and `bf-pop` / `bf-fade` (the palette), and the new
file carries exactly **one** new `prefers-reduced-motion` block nulling only those. No eleventh
pattern.

### 3.5 `backdrop-filter` is licensed on the TOP BAR ONLY

The tutorial draws its scrim as a `0 0 0 9999px` box-shadow on a positioned element, and
`backdrop-filter` makes an element a containing block for `position: fixed` descendants — a new one
above a spotlit element mis-places the light. So:

- **Top bar: licensed.** Its menus are `position: absolute`, and the tutorial overlay is a sibling
  at `z-index: 80` above the bar's `40`. **Still a required browser check** (§14) because
  `tutorial-restart-button` is inside it and is the wrap-up step's anchor.
- **Everything else: an opaque `var(--wx-bg)` / `#fff`.** Rail, flyout, all four menus, the
  notifications panel, sticky sub-navs, the palette dialog, the AI panel. The ground is flat, so a
  blur buys nothing there anyway.
- The rail already reads `color-mix(… 78%, transparent) + blur(10px)` on the **Settings** rail
  (`settings-redesign.css`); that one is a neighbouring cluster and stays as it is.

---

## 4. The cluster warning, answered: `DASH_COLS` / `DASH_ROW_UNIT` / `DASH_GAP`

**None of the three change. No saved layout is migrated, re-fitted or invalidated.**

| Constant | Value | Status |
|---|---|---|
| `DASH_COLS` | 6 | frozen |
| `DASH_ROW_UNIT` | 40 | frozen |
| `DASH_GAP` | 16 | frozen |
| `grid-auto-rows: 40px` (`hs-home.css`, independently declared) | 40px | frozen |
| `DashboardSkeleton`'s hand-mirrored 6-column / 40px grid | — | frozen |
| Panel ids `today alerts recommendations approvals quick stats kpis apps weather readiness conflicts inspections` | — | frozen, not one renamed |
| `DASH_LAYOUT_DEFAULT`, `dashPanelLimits`, `DASH_STACKED_ORDER` | — | frozen |
| `StoredBoard` shape, `reconcileLayout`, the account-then-device read order, the 600ms debounce, the unmount flush, the empty-string reset | — | frozen |

**What happens to already-saved `dash:layout` values: nothing.** `x/y/w/h` are cell coordinates,
`cellSize()` and `itemRect()` read the same three constants, so every saved board resolves to the
same pixels it does today. `reconcileLayout` drops unknown ids — and no id is renamed, so no saved
board loses a panel.

**The one real consequence, stated plainly.** Five panels (`today`, `readiness`, `weather`,
`conflicts`, `inspections`) currently render **frameless** — `.cc-legacy-panel` gets only
`display: grid; gap: 10px`, so their rows sit bare on the `#f5f6fa` ground under a frameless
header. Giving them the same white paper card every other panel has adds `1px + 14px` top and
bottom = **+30px of chrome** inside those five panels.

- **Fresh (unstored) boards re-fit automatically.** `panelLayout.fit` measures real layout on a
  `rAF` pass and converts with `rowsForHeight(px) = ceil((px + 16) / 56)`; +30px is 0–1 extra row.
- **Stored boards do not re-fit** (fit only runs while `!panelLayout.stored`) and are **not**
  migrated. Those five panels keep their saved height and the extra 30px is absorbed by the body's
  existing `overflow: auto`, which promotes the body to `role="region"` + `aria-label` +
  `tabIndex 0` + `.is-scrollable` through the existing ResizeObserver. That is graceful, it is the
  contract the page already has, and it is pinned by `App.test.tsx:1361`.
- **The alternative was rejected**: moving the frame up onto `.dash-block` would change
  `block.offsetHeight - body.clientHeight` (the chrome term in the fit measurement) for **all
  twelve** panels instead of five, and would put a border between the drag handle and the head that
  `hs-home.css:1233`'s `:has(+ .hs-widget-head) { top: -3px }` is calibrated against.
- Padding is `14px 16px` on the five, not the `16px 18px` the three list panels use, specifically to
  hold the chrome growth to 30px. Declared inconsistency, chosen for the arithmetic.

**`DASH_GAP` also means the board cannot take the rhythm token.** The concept's §6b proposes
`gap: var(--bf-rhythm-dense)` (20–34px) "between top-level cards". On the board that gap **is**
`DASH_GAP`, baked into `itemRect()` and the `.dash-cell` painting. It stays 16px. The rhythm token
applies to the off-board stack only — `.dx-inner`'s gap, which is already **30px**, i.e. already
inside `--bf-rhythm-dense`'s 20–34px range. So rhythm on this page is one token substitution with
zero pixel change, plus the 72px tail.

---

## 5. The card licence, and the counted boundary audit for this cluster

**The licence, grep-checkable doctrine:** a white bordered rectangle is licensed only if
**(1)** its boundary is itself interactive — draggable, resizable, dismissible, clickable-as-a-whole
— or **(2)** it is a viewport clipping a scrolling world. Everything else is a section of one sheet,
separated by whitespace and hairlines.

### 5.1 The audit, counted at 1440px on the default board

| Surface | Resting boundaries today | After | Licence |
|---|---|---|---|
| 3 list panels (alerts, recommendations, approvals) | 3 (`.cc-panel > .cc-list`) | 3 | (1) drag/resize/hide + (2) `overflow: auto` body |
| Quick Actions | 1 (`.cc-quick`) | 1 | (1) |
| 5 legacy panels (today, readiness, weather, conflicts, inspections) | **0 — content bare on the ground** | 5 | (1) — the fix, not a cut |
| Performance | 3 (`.cc-stat` tiles) | 3 | (1) each tile is a drag target |
| Operational KPIs | 4 (`.kpi-card` buttons) | 4 | (1) each is a `<button>` and a drag target |
| BuildFlow Apps | 6 (5 `.cc-app` + `.cc-app.add`) | 6 | (1) each navigates |
| Status band | 1 | 1 | (2) it clips a scrolling project list |
| Promo / verify notice (at most one, test-enforced) | 1 | 1 | (1) dismissible |
| Recent activity split card | 2 (card + `.hs-split-list` left border & tint) | **1** | **cut**: the inner pane keeps its `--hsh-hover` tint, loses its border — it is a section of one sheet |
| KPI live feed | 1 | 1 | (2) it is a drill-down region inside a frameless panel body |
| TimeCard | 6 cards | 6 | (1) each is a button |
| **Total** | **28** | **32** | |

The count goes **up**, and that is the honest answer: this cluster's problem was never too many
frames, it was **five panels with none** while their neighbours had one, on a page whose ground is
about to go flat. Six of today's boundaries would be meaningless under the licence and only one
actually is (`.hs-split-list`'s border); the other five candidates all turn out to be `<button>`s
or drag targets. Where I *do* forbid a frame: rows inside any list, the icon chips
(`.cc-alert-ico`, `.cc-rec-ico`, `.cc-appr-dot`, `.kpi-icon` — fills, not boundaries), the legend
rows, and the notification rows.

### 5.2 Surface species

Every licensed frame in this cluster becomes the Welcome Page's **light paper card**:
`background: #fff`, `1px solid rgba(28,28,26,0.07)`, **radius 18px**, `box-shadow: 0 10px 30px
rgba(28,28,26,0.05)`. Today they are `1px solid #e6e8f0` at **8px** with `box-shadow: none`
(`--hsh-radius`) — a Material-era widget. The two floating tiers keep the ladder's upper rungs:
popovers and panels **18px** with `--bf-shadow-float`, the two biggest modal objects
(`.hs-upd-dialog`, `.cmdk-dialog`) **26px / 20px** with `--bf-shadow-stage`. **No 14px rung is
introduced and no rung is retired.**

---

## 6. Shared components — reuse first

| Component | Status | Used by |
|---|---|---|
| `components/ui/text-shimmer.tsx` | **exists (58 lines) — reuse, no new file** | the loading screen's "Loading BuildFlow HUD", the AI panel's Thinking / import labels (already), `.dash-skel-line` |
| `components/ui/quantum-cloud-loader.tsx` | exists — unchanged | AI panel thinking row |
| `components/ui/interactive-hover-links.tsx` | exists — **the repo's own Welcome-page grammar for a list of links**; reuse its `translateX` timing as the source of the 3px menu-row slide so the flyout and the marketing nav share one gesture | flyout rows, `.hs-menu` rows, `.cmdk` rows (styling reference only — no markup change) |
| **`components/ui/rail-tooltip.tsx`** | **new port** — 21st.dev "Animated Tooltip" | 9 rail hubs + rail gear + 8 top-bar icon buttons |
| **`components/ui/spotlight-surface.tsx`** | **new port** — 21st.dev "Card Spotlight" | `.dash-block` ×12, `.cc-panel > .cc-list`, `.hs-flyout`, `.hs-index-card` |

Both new files follow the nine existing ports exactly: plain markup, inline `style` objects,
**one** inline `<style>` block for `::before` / `:hover` / `@media`, shadcn tokens mapped to
`--wx-*` with literal fallbacks (`var(--wx-blue, #2f6bff)`), a
`@media (prefers-reduced-motion: reduce)` rule **inside** that same block, and a header comment
naming the source and the token mapping.

**`RailTooltip`** — `{ label, hint?, side?, delay = 380, children }`. Ink pill `#1c1c1a`/`#fdfcf9`,
radius 8px, `11.5px/600`, padding `6px 10px`, offset 12px, `--bf-shadow-raised`, `opacity 0→1` +
`translateX(-4px)→0` over `0.18s var(--bf-ease)`, 380ms in / 80ms out. **The bubble is
`aria-hidden="true"` with no role** — the wrapped button already carries the identical string in its
`aria-label`, a `role="tooltip"` would double-announce it, and it must not collide with
`tests/map.test.tsx`'s `[role='tooltip']` query (the add-on tip). Existing `title` attributes are
**kept** — the inventory records them as information.

**`SpotlightSurface`** — `{ radius = 220, alpha = 0.06, as = "div", className, children }`. A
`::before` at `inset: 0; border-radius: inherit; pointer-events: none` painting
`radial-gradient(var(--sp-r) circle at var(--sp-x) var(--sp-y), rgba(47,107,255,var(--sp-a)),
transparent 70%)`, `opacity 0→1` on hover over `0.25s`. **Reads `--mx`/`--my` when the page root
publishes them** — the Dashboard's own pointer effect (App.tsx:25751) and `useHudMotion` both do, so
on this cluster's pages it adds **zero** listeners; it falls back to a rAF-throttled `pointermove`
bound on `pointerenter` only where those variables are absent (the shell itself). Reduced motion:
`--sp-a: 0`, no transition.

**Not ported, and why:** a count-up for figures (`test/setup.ts` stubs `IntersectionObserver` as a
no-op, so a naive count-up renders `0` forever under test, and tests read figures directly —
`.cc-spark-line`'s `d`, `.dash-block h2`; figures get `tabular-nums` instead, which is the real
legibility win). A top-bar overflow cluster (it would put `tutorial-restart-button` behind
`display: none` and silently kill the tutorial's last step). A `<Reveal>` wrapper component (it
invites dynamic classNames onto reveal targets — the documented trap).

---

## 7. Class-name additivity — the review gate

**The frame adds classes and never replaces a pinned one.** Every new wrapper and every new
selector prefixes; nothing renames. The new stylesheet's header ships this comment block, and the
new file zeroes the inherited border/radius/shadow from the `bf-` side so the pinned class keeps
its name while the new one carries the look:

```html
<div className="schedule-kpis bf-figures">   <!-- not "bf-figures" -->
  <div className="kpi-card bf-figure">       <!-- not "bf-figure" -->
```

### Pin list for this cluster (~40 selectors; assertions live in the test files named in §13)

`.dash-block` · `.dash-block h2` (order assertions) · `.dash-block-body` ·
`.dash-block-body.is-scrollable` · `.dash-board` · `.dash-drag-handle` · `.dash-hide` ·
`.dash-resize` · `.dash-cells` · `.dash-cell` · `.dash-placeholder` · `.dash-ghost` ·
`[data-dash-drag-id]` · `.dash-board-live` · `.dash-skel-block` · `.dash-skel-line` ·
`.dash-skel-head` · `.dash-skel-strip` · `.dash-skel-board` · `.cc-stat` · `.cc-spark` ·
`.cc-spark-line` · `.cc-spark-fill` · `.cc-trend.flat` · `.kpi-card` · `.kpi-card-button` ·
`.kpi-icon` · `.cc-link` · `.cc-rec-btn` · `.cc-btn` · `.cc-sev` · `.cc-appr-error` ·
`.hs-home-promo` · `.business-context-verify` · `.business-context-banner` ·
`.hs-home-meta` · `.hs-home-hidden` · `.hs-home-empty` · `.hs-home-empty-btn` · `.hs-home-seg` ·
`.ss-band` · `.ss-strip` · `.ss-strip.ss-failed` · `.ss-retry` · `.ss-figure` · `.ss-facts` ·
`.ss-projects` · `.hs-split-row` · `.hs-split-tag` · `.dashboard-feed-panel` ·
`.dashboard-feed-row` · `.dashboard-feed-empty` · `.inline-empty-state` · `.badge` ·
`.panel-note` · `.resource-row` · `.legend-list` · `time[datetime]` · `.hs-rail-slot` ·
`.hs-rail-btn` · `.hs-rail-tag` · `.hs-flyout` · `.hs-flyout-item` · `.hs-flyout-star` ·
`.hs-flyout-tip` · `.hs-menu` · `.hs-menu-head` · `.hs-menu-tag` · `.user-settings-menu` ·
`.notifications-panel` · `.notifications-list` · `.topbar-verify` · `.search-box` ·
`.hs-settings-button` · `.hs-bookmarks-count` · `.hs-bookmarks-menu` · `.hs-bookmarks-empty` ·
`.bm-tile` · `.bm-tile-lock` · `.bm-count` · `.bm-group` · `.bm-empty` · `.cmdk-backdrop` ·
`.cmdk-dialog` · `.cmdk-list` · `.cmdk-label` · `.cmdk-group` · `.cmdk-hint` · `.cmdk-empty` ·
`.hs-upd-dialog` · `.hs-addon-dialog` · `.hs-upd-backdrop` · `.hs-upd-spotlight` ·
`.buildflow-tutorial-overlay` · `.buildflow-tutorial-spotlight` · `.buildflow-tutorial-meter` ·
`.buildflow-tutorial-requirement` · `.bf-breeze` and every `.bf-breeze-*` ·
`.hc-assistant` · `.loading-screen` · `.error-screen` · `.error-screen-actions` ·
`.error-screen-back` · **every `[data-tutorial-id]`** · **every `[data-reveal]` /
`[data-reveal-stagger]`** · the `.active` class on the Settings rail button.

**Grep the new stylesheet for any renamed selector before merge — there should be none.**

### The three invariants that get written into the source as DO-NOT-MOVE comments

Pasted above `.hs-rail-slot` in `App.tsx` (Sidebar, ~20573) even though this concept never touches
the handler — it is the trap that would cost the most and it is currently undocumented:

```tsx
/* INVARIANT — DO NOT MOVE (30+ tests depend on it):
   1. onMouseEnter lives on the ROW WRAPPER (.hs-rail-slot), not on the header <button>, and
      never as onPointerEnter. React synthesises mouseenter from mouseover, and
      test/appHarness.tsx fires fireEvent.mouseOver(hubButton) to open the flyout for 30
      openAppPage() call sites and 3 openSchedule() call sites.
   2. The slot is also the anchor whose offsetTop sets --hs-flyout-top. Padding, animation or
      scroll on the slot makes every flyout drift.
   3. Flyout sub-items keep role="menuitem". Downgrading them to plain buttons makes
      getByRole("button", { name: /^Schedule/ }) ambiguous against the hub button. */
```

Second comment, above `.settings-panel-inner` (neighbouring cluster, but the trap is shell-owned):
its keyed `sx-rise` stagger must **never** become `data-reveal` — `useHudMotion`'s reveal effect has
deps `[rootRef]` only and never re-queries after a key change, while the CSS rest state is
`opacity: 0`, so the panel would go permanently blank with no error.

Third, above `DASH_ROW_UNIT` in `dashGrid.ts`: `hs-home.css` independently declares
`grid-auto-rows: 40px` and `DashboardSkeleton` hand-mirrors the 6-column grid; all three move
together or none do.

---

## 8. Two new test files (additive; they lock in the two UX defects every concept agrees on)

### 8.1 `tests/shell-nav.test.tsx`

1. **A hub sub-page is reachable by click alone**, with no `mouseOver` anywhere in the test.
2. With `matchMedia` stubbed to ≤560px, **`Create new`, `Bookmarks`, `Settings` and
   `Help and tutorial` are all still reachable** (today all four are `display: none`).
3. **All 21 `data-tutorial-id="nav-<page>"` anchors are in the document.** *21, not 22* — `navItems`
   (App.tsx:643) has exactly 21 entries: dashboard, bookmarks, schedule, gantt, month, week, list,
   kanban, matrix, projects, crews, contacts, companies, deals, timecard, equipment, materials,
   field, map, delayIQs, reports. `settings` is not one of them; `navHubs` sums to the same 21.
4. **A locked flyout row still prompts instead of navigating** (Map / Equipment / TimeCard).
5. `useShellBreakpoint()` **defaults to `false` when `matchMedia` is absent**, with the reason
   commented — every media-gated component in this cluster needs that exact shape:

```ts
/* jsdom's setup.ts stub answers matches:false for every query, and some environments have no
   matchMedia at all. Defaulting to false keeps the desktop path under test, which is what
   appHarness depends on. */
const useShellBreakpoint = (q: string) =>
  typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false;
```

### 8.2 `density.test.ts` — makes design drift a build failure, not a review comment

Reads the new stylesheet **raw** with the `?raw` glob `schedule/boundary.test.ts` already uses
(`import.meta.glob('/src/**/*.css', { query: '?raw' })`), parses it, and fails on:

- any `font-size` literal in `app-shell-daylight.css` that is not `var(--bf-app-*)`;
- any `border-radius` literal outside the ladder `999 / 26 / 20 / 18 / 12 / 8 / 50%` — **and
  specifically on `14px`**, the widget rung this cluster is leaving;
- any `cubic-bezier(` that is not `var(--bf-ease)` / `var(--bf-ease-size)`;
- any colour literal outside the closed set (`#1c1c1a #575550 #8a877e #f5f6fa #ffffff #fdfcf9
  #2f6bff #6d28d9 #188038 #c5221f #0032b0` + the trio + `rgba(28,28,26,*)` + `rgba(47,107,255,*)`);
- any selector in the new file that **renames** rather than prefixes an existing one (every
  selector must contain `.bf-shell` and at least one pinned class);
- `:where(` anywhere (jsdom breaker) and `!important` anywhere in the new file.

Closed-token allowlist: colour, radius, shadow, easing, hover amplitude and the reveal contract are
**mechanically unable to be re-scoped at all**. This is the only mechanism proposed anywhere that
stops the next session quietly introducing a fifth type scale.

---

# 9. The shell — 20 screens

## App shell frame (`.app-shell.hs-shell`)

- **Today:** A full-width navy `#14203a` top bar over a 2-column body of a 56px navy icon rail plus
  a light content area, hosting every global overlay. On Settings both the bar and the rail are
  withheld.
- **Becomes:** Identical geometry, daylight surface. `.hs-shell.bf-shell` re-values the eight tokens
  in §1.8, so the bar and the rail stop opting out of `--hs-paper` and the whole shell is one
  `#f5f6fa` ground with two `rgba(28,28,26,0.07)` hairlines. Body grid, the
  `grid-template-columns: var(--hs-rail-w) minmax(0,1fr)` and the Settings single-column collapse
  are untouched. `.content-scroll` padding goes `22px 28px 34px` →
  `var(--bf-app-gutter-y) var(--bf-app-gutter-x) var(--bf-app-tail)` = `28px / 32px / 72px` at 1440
  and `18px / 18px / 72px` at 480. **The `-28px` side value is load-bearing** — `.dash-rx`'s
  `margin: -22px -28px -34px` bleed is arithmetic against it — so the Dashboard's bleed is retuned
  in the same commit to `margin-block-start: calc(-1 * var(--bf-app-gutter-y))` /
  `margin-inline: calc(-1 * var(--bf-app-gutter-x))` /
  `margin-block-end: calc(-1 * var(--bf-app-tail))`. `schedule-phone.css:293-300`'s
  `.hs-shell .content-scroll:has(.gantt-page.hs-index) { padding-inline: 8px }` is reconciled to
  `var(--bf-app-gutter-x)`'s floor in the same pass. No shared component renders the frame; it is
  the one place the new stylesheet writes structure-adjacent values.
- **Every information item placed (8/8):** (1) the `.hs-shell` token block → re-valued in place,
  §1.8, same names; (2) the body grid → unchanged, documented in the new file's header; (3) the five
  per-page modifier classes `app-shell / schedule-shell / reports-shell / settings-shell /
  sidebar-collapsed` → all kept, `bf-shell` appended as a sixth (`sidebar-collapsed` is inert today
  and stays inert — see §12); (4) content wrapper classes `main-panel` / `settings-main-panel` /
  `content-scroll` / `settings-content-scroll` → kept, padding re-tokenised as above; (5) "top bar
  and rail hidden on Settings" → **changes**: the TopBar is now rendered on Settings (see Settings
  note below), the rail stays out; (6) "Loading BuildFlow HUD" → its own screen; (7)
  `DashboardSkeleton` → its own screen; (8) the error text / `BuildFlow data is unavailable.`
  fallback → its own screen.
- **Every action placed (6/6):** `openAppPage(page)`, `setPage(page)`, the `Cmd/Ctrl+K` window
  listener, the error screen's two actions, the `openSettingsPage()` / `closeSettingsPage()` round
  trip and `openSettingsView(view)` / `openSettingsBilling(productId)` — **all six unchanged, zero
  edits.** Presentation-only concept. Six modal mounts (`CommandPalette`, `BreezeAssistant`,
  `AskAiButton`, `AddOnPrompt`, `ProductUpdateModal`, `BuildFlowTutorial`) keep their exact mounting
  model, including the always-mounted-and-`display:none` AI panel that
  `schedule/viewKeys.ts dialogIsOpen()` depends on.
- **States:** loading and error get their own screens below. No empty state. No add-on lock at this
  level (the lock is `setPage`'s gate → `AddOnPrompt`).
- **Motion:** `.hs-topbar` and `.hs-rail` get `bf-shell-in` (`opacity 0→1`, bar `translateY(-8px)→0`,
  rail `translateX(-8px)→0`, `0.7s var(--bf-ease) both`, rail +60ms). It runs exactly once because
  the shell never remounts on page change, and it is a **CSS animation, not `data-reveal`** —
  `shellClassName` is computed. No reveal on the frame. No skeleton (the frame is what the skeleton
  sits inside).
- **Tests touched:** `App.test.tsx:1085` (transient API failure) — **passes unchanged**;
  `App.test.tsx:1109` (Dashboard shape while loading) — **passes unchanged**;
  `tests/settings.test.tsx:83` (Settings open/close round trip) — **needs re-running first, may
  need no change**: the TopBar now renders on Settings, and this test's assertions are about
  `settingsReturnPage`, not about the bar's absence. If it proves brittle, the TopBar-on-Settings
  item is severable on its own (§12, item R6).

## Top bar (`TopBar` / `.topbar.hs-topbar`)

- **Today:** A 56px navy row: brand, a read-only search decoy, the AI sparkle, then a CSS-`order`ed
  cluster of bookmarks star, create `+`, verify pill, bell, help, settings, divider, account.
- **Becomes:** 56px frozen. `background: rgba(245,246,250,0.82)` + `backdrop-filter: blur(14px)
  saturate(140%)`, bottom hairline `rgba(28,28,26,0.07)`, `box-shadow: none`, `color: #1c1c1a` —
  the Welcome nav's recipe verbatim at 56px instead of 64px. `padding: 0 14px 0 10px`, `gap: 14px`,
  `position: sticky`, `z-index: 40`, single row at every width, **JSX order untouched** (the bell
  must still precede the account control) and the CSS `order` values untouched (create 1 · help 2 ·
  settings 3 · notifications 4 · divider 5 · account 6). Shared components: `RailTooltip` wraps the
  8 icon buttons; nothing else is new.
- **Every information item placed (14/14):** (1) `BuildFlowLogoMark` → 30px, unchanged asset,
  `hs-rail-pop` keeps its spring; (2) the "BuildFlow" wordmark → `17px/750` → `16.5px/700/-0.02em`
  `#1c1c1a`, still hidden below 1040px; (3) the search placeholder + Search icon + `⌘K` `<kbd>` →
  the pill (`height: 36px`, `border-radius: 999px`, `#fff`, `1px solid rgba(28,28,26,0.13)`,
  `padding: 0 12px 0 14px`; input `13.5px/500` `#1c1c1a`, placeholder `#8a877e`; the `kbd` chip
  `rgba(28,28,26,0.05)` / radius 6px / `11px` / `#575550`, still hidden below 1040px);
  (4) the AI sparkle's title/aria → unchanged strings, the button re-based onto the trio (§1.6);
  (5) the star's `aria-label "Bookmarks (N)"` + `title` + `.has-items` → strings unchanged, gold →
  `#2f6bff` with `fill: currentColor`, **and pinned to `opacity: 0.55` below 1024px instead of
  opacity-0-until-hover** (see the flyout screen for why); (6) `.hs-bookmarks-count` → stays a blue
  999px pill, `11px/700`; (7) `aria-label "Create new"` → unchanged; (8) the bell's `.bubble` count →
  unchanged, blue pill; (9) the help button's `aria-label` / `title` /
  `data-tutorial-id="tutorial-restart-button"` → **all three unchanged and now visible at every
  width**; (10) `aria-label "Settings"` on `.hs-settings-button` → unchanged; (11)
  `.hs-topbar-divider` → `1px × 22px` `rgba(28,28,26,0.13)`, still hidden below 760px; (12) the
  account button's `aria-label "<Name> account"` + avatar initials + `ChevronDown` → **the trailing
  word `account` is asserted by three test files and does not change**; avatar 30px `50%` `#2f6bff`
  with `#fff` initials, chevron `#575550`; (13) "identity is the real active user, never hard-coded"
  → unchanged, no data path touched; (14) the CSS `order` cluster → unchanged.
- **Every action placed (10/10):** brand → `goTo('dashboard')`; the search `<label>` click **and**
  the read-only input's focus → `onOpenSearch` (**the element is restyled and never restructured** —
  `appHarness.enterDashboard()` and `completeOnboarding()` both gate on
  `findByLabelText("Search BuildFlow")`, making this the single most dangerous element in the
  shell); AI sparkle → `askAi()`; star → toggles the bookmarks menu; `+` → toggles Create new; bell
  → toggles the panel; help → `onStartTutorial()`; settings → `onOpenSettings()`; account → toggles
  the account menu; the four independent document-level outside-mousedown closers → all four kept,
  as are the per-trigger `Escape` handlers and the asymmetric close matrix (help and settings close
  notifications + account; the bell closes account only; the settings gear also closes create; only
  `goTo()`/`askAi()` close create + notifications + account; only the star closes all three
  others). **Nothing is re-wired.** `[aria-expanded="true"]` keeps its open-state wash, now
  `rgba(28,28,26,0.05)` + `#1c1c1a`.
- **States:** no empty/loading/error of its own (the verify pill has its own screen). The five
  popovers it owns are their own screens. No add-on lock.
- **Motion (10/10 animations kept, values re-timed onto `var(--bf-ease)` and the four interaction
  durations):** `hs-rail-draw`, `hs-top-spin` (including the 45° rotate while `aria-expanded`),
  `hs-top-gear`, `hs-top-bell`, `hs-top-badge`, `hs-top-twinkle`, `hs-rail-pop`, `hs-pop`
  (`0.16s → 0.22s`), the search `:focus-within` transition (now `border-color: #2f6bff` +
  `var(--bf-focus-ring)`), and the reduced-motion block at `app-shell-hubspot.css:673` — **extended
  in place, same names.** Icon buttons: 36px, radius `8px → 12px`, rest `#575550`, hover
  `rgba(28,28,26,0.05)` + `#1c1c1a`, `:focus-visible` → `var(--bf-focus-ring)` (was a 0.45-alpha ring
  built for navy), press `scale(var(--bf-press-scale))`. Hover move: **slide** on the brand, nothing
  on the icon buttons beyond the wash. Reveals: none — the bar gets `bf-shell-in` once (§App shell
  frame). Skeleton: none; the bar renders before the workspace resolves.
- **Tests touched:** `App.test.tsx:247` (restart tutorial from the top bar) — passes unchanged;
  `:612` (no Demo role) — unchanged; `:623` (Settings from the reports username button) — unchanged;
  `:634` (Settings from the account menu) — unchanged; `:1263` (email confirmation moved to the top
  bar, ≤1 notice above the board) — unchanged, `.topbar-verify` stays one instance in the bar;
  `tests/tutorial.test.tsx:286` (bell panel + **DOM order**: bell precedes account) — unchanged,
  re-ordering stays CSS-`order`-only; `tests/settings.test.tsx:113` (≥2 buttons named exactly
  `Settings`) — unchanged, both gears keep both names; `tests/schedule.test.tsx:44` (Settings from
  the Week page account menu) — unchanged.

## Notification center panel

- **Today:** An absolutely-positioned panel under the bell with a `0 24px 64px` shadow, radius 8px,
  border `#e2e4f3`, holding the 7 most recent derived events.
- **Becomes:** Radius **18px**, `#fff`, border `rgba(28,28,26,0.07)`, `--bf-shadow-float`, and it
  finally gets an entrance (`hs-pop 0.22s var(--bf-ease)`). **Geometry frozen**:
  `width: min(420px, 100vw - 32px)`, `max-height: min(620px, 100vh - 128px)`, `overflow: hidden`,
  and the inner `.notifications-list` scrolling at `min(520px, 100vh - 230px)`. Head: eyebrow
  "Notifications" at `11.5px/650/0.045em/uppercase/#8a877e` over the `h2` "Recent BuildFlow
  activity" at `--bf-app-section` (16px/600/-0.01em). Rows: `strong` `13.5px/600`, `p`
  `12px/500 #575550` capped at `var(--bf-app-prose)`, `time` `11.5px #8a877e`. Icon chip radius
  `12px`, all six tones kept, re-based onto the `--hsx-*-soft` fills. `section aria-label "Recent
  BuildFlow activity"` unchanged. `SpotlightSurface` is **not** applied (a 420px popover is not a
  page surface).
- **Every information item placed (11/11):** the eyebrow + heading (1) as above; the seven item
  types (2–8: field update, weather, DelayIQ, assignment, inspection, material, equipment) keep
  every title string, every detail template, every icon and every tone rule verbatim — `tone-red /
  amber / blue / green / violet / slate` (11) become the six chip fills; the per-item relative
  `<time>` from `formatNotificationTimestamp` (9) keeps its two branches (date-only → `formatDate`,
  timestamp → `formatDateTime`) and renders at `11.5px #8a877e`; "sorted newest-first, sliced to 7"
  (10) unchanged. Also carried from the record's `completenessCheck`: every `detail` lowercases the
  status, and equipment items are stamped `new Date().toISOString()` on every render so they always
  sort first — **both reproduced exactly; neither is a styling problem** (see §12 R2).
- **Every action placed (4/4):** bell toggle, `Escape` on the bell, outside mousedown, and **"items
  are read-only — no click target, no mark-as-read, no view-all"**. The rows therefore get the
  hover wash + 3px slide **only if** they become interactive, which they do not — so they get
  **no hover state at all**, which is the honest signal that they are not clickable. That is a
  deliberate reversal of the concept's §5d line ("Row hover: wash + translateX(3px)"): a hover
  affordance on a dead row is exactly the incoherence the four-move grammar exists to prevent.
- **States:** **empty — none exists today.** The list renders nothing and the `.bubble` hides at 0.
  Adding copy is new copy, so it is flagged, not shipped: proposed `"No BuildFlow activity yet."`
  (§12 R1). Until it is signed off, a fresh workspace shows an empty 420px card, and the new file
  gives that card `min-height: 0` so it collapses to its head rather than showing a tall void. No
  loading, no error, no lock.
- **Motion:** entrance `hs-pop` (new here, same name as the other menus). No reveal (it is a
  popover, not a page section). No skeleton. Hover moves: **none** (see above). Reduced motion:
  covered by the existing `app-shell-hubspot.css:673` block, extended by name.
- **Tests touched:** `tests/tutorial.test.tsx:286` — asserts `aria-expanded` flips, the region
  appears/disappears, and that "Field update posted", "Weather alert added" and "Schedule assignment
  updated" all render inside it. **Passes unchanged** — no string, role or structure moves.

## Account menu (`.user-settings-menu`)

- **Today:** A `role="menu"` popover with the identity block and two menuitems. It never carries
  `.hs-menu`, so — a recorded correction — **it has no entrance animation and no transition at all**.
- **Becomes:** Radius `12px → 18px`, `#fff`, border `rgba(28,28,26,0.07)`, `--bf-shadow-float`, and
  it **gains `hs-pop 0.22s var(--bf-ease)`** so the four popovers finally behave alike. Identity
  block: avatar 30px `50%` `#2f6bff`, `strong` `13.5px/600 #1c1c1a`, `em` (the role) `11.5px
  #8a877e` non-italic. Menu rows `13.5px/500 #1c1c1a` with the wash + **3px slide**. `id`s
  `account-menu` / `reports-account-menu` unchanged, `role="menu"`, `aria-label "Account menu"`
  unchanged.
- **Every information item placed (2/2):** the identity block (avatar initials + `<strong>` name +
  `<em>` role) and the `role="menu"` / `aria-label "Account menu"` pair — both preserved verbatim.
- **Every action placed (3/3):** `Settings` menuitem (with its `title="Settings"`) → close +
  `onOpenSettings()`; `Log out` menuitem (`title="Log out"`) → close + `onLogout()` →
  `apiLogout()`, clear, return to welcome; `Escape` on the trigger + outside mousedown. Also
  preserved from the record's additional risks: **a second click of the trigger closes it**
  (asserted by `tests/settings.test.tsx`).
- **States:** the only recorded state is "logout swallows `apiLogout` failures and clears local
  state regardless" — untouched. No empty/loading/lock.
- **Motion:** `hs-pop` (new here). Rows: **slide**. No reveal, no skeleton. At ≤680px
  `styles.css:14071` flips it to `right: auto; left: 0` and `min(290px, 100vw - 28px)` — kept, and
  the new `≤640px` tier aligns the `.hs-menu`s with it so all four popovers flip at one width.
- **Tests touched:** `App.test.tsx:612`, `App.test.tsx:634`, `tests/settings.test.tsx:113` (name,
  role, `Settings` menuitem with `title="Settings"`, no "Demo role" text) — **all pass unchanged.**

## Create new menu (`.hs-menu`)

- **Today:** A right-anchored 208px dropdown with a head, 7 iconed entries and release pills.
- **Becomes:** Radius `10px → 18px`, `--bf-shadow-float`, `hs-pop 0.16s → 0.22s var(--bf-ease)` with
  `translateY(-6px) scale(0.98) → none`. Geometry frozen: `top: calc(100% + 8px); right: 0;
  min-width: 208px; transform-origin: top right; z-index: 60`. Head → eyebrow. Rows `13.5px/500` +
  wash + **3px slide**. Pills → `#2f6bff` / `#6d28d9` on 10%-alpha fills, radius 999px,
  `10.5px/700` uppercase.
- **Every information item placed (3/3):** the head "Create new" → eyebrow; all 7 entries with
  their icons and destinations (Project→projects, Scheduled job→schedule, Crew→crews,
  Contact→contacts, Company→companies, Deal→deals, Field update→field) → verbatim; the
  `.hs-menu-tag` `New`/`Beta` from `pageReleaseTag()` → kept, violet re-based. As of 2026-09-10 that
  renders **New on Contact and Beta on Company + Deal** — a date-relative value set, re-checked at
  build time, not hard-coded.
- **Every action placed (3/3):** any entry → `goTo(page)`; Contact / Company / Deal **additionally**
  call `onCreateRecord(page)` → `createRequest {page, nonce}` → the Sales page's `createSignal`
  opens its create dialog — the bridge is untouched; toggle from `+` (which keeps its
  `title="Create new"` as well as its `aria-label`), `Escape`, outside mousedown.
- **States:** none recorded, none added. The one modal it opens (the target page's create dialog)
  belongs to the Sales cluster.
- **Motion (3/3):** `hs-pop`, `hs-tag-in 0.35s` on the pills, and the trigger's 45° rotate while
  open — all three names kept.
- **Tests touched:** none recorded for this screen. It is covered indirectly by `App.test.tsx`'s
  dashboard entry (the `+` is in the bar). **No test changes.**

## Bookmarks star menu (`.hs-bookmarks-menu`)

- **Today:** A `.hs-menu`-shaped popover listing starred pages grouped with their hub label, then
  bookmarked schedule views, then a footer star/link toggle for whatever is on screen.
- **Becomes:** The `.hs-menu` surface above (18px, float shadow, `hs-pop`). Head "Bookmarks" →
  eyebrow. Rows `13.5px/500` + wash + 3px slide; `.is-current` → `rgba(47,107,255,0.06)` fill with
  `#2f6bff` text at weight 650 (was a flat hover-grey, which read as a hover, not a state).
  `.hs-bookmark-hub` `em` → `11.5px #8a877e` non-italic. `.hs-bookmarks-empty` copy capped at
  `var(--bf-app-prose)`. Footer `.hs-bookmarks-add` → `13px/600 #2f6bff`, icon slides 3px on hover.
- **Every information item placed (5/5):** (1) head "Bookmarks" → eyebrow; (2) per-page row = nav
  icon + label + `<em class="hs-bookmark-hub">` hub name → kept, `em` re-typed; (3) `.is-current` on
  the row for the page on screen → re-coloured as a state, not a hover; (4) bookmarked schedule
  **views** (`ScheduleLinkMenu`): `Link2` icon, the link label ("Week · week of Jun 16") and the
  filter description as the `<em>` → kept verbatim; (5) the per-user per-device storage keys
  `bf:nav:bookmarks:<userId>` / `bf:nav:links:<userId>` and the `bf:nav:links` CustomEvent → **not
  touched** (no data path changes).
- **Every action placed (7/7):** row click → close + `goTo(page)`; **row-hover-reveal `×`**
  (`.hs-bookmark-remove`, `aria-label "Remove <label> from bookmarks"`, `stopPropagation`) → kept,
  and **pinned to `opacity: 0.55` below 1024px** instead of opacity-0-until-hover, so touch users
  can reach it; schedule-view row click → `openScheduleLink(link)`; schedule-view row `×` →
  `onToggleLink(link)`; footer link toggle "Bookmark this view · <label>" / "Unpin this view ·
  <label>" with the filter description as its `title`; footer star toggle "Bookmark <page label>" /
  "Remove <page label>"; `Escape` on the trigger + outside mousedown. **`openScheduleLink` is a
  confirmed no-op inside the app (BUG-1)** — it assigns `location.hash`, which fires `hashchange`,
  and in app mode only `popstate` is listened for. This mapping **preserves the control exactly as
  it is** and flags it (§12 R3): fixing it is a behaviour change and this is a presentation-only
  brief.
- **States:** empty → `"No bookmarks yet. Hover a category in the sidebar and star a page to keep it
  here."` — copy unchanged, capped at 62ch, with a 22px `Star` glyph above it in `#8a877e` (today it
  is bare text). Error → localStorage write failures stay swallowed ("the stars just do not
  persist"). No loading, no lock.
- **Motion:** `hs-pop` entrance; the `×` reveal transition `0.14s → var(--bf-dur-press)`
  `var(--bf-ease)`, and it fires on `:hover` **and `:focus-within`**. No reveal, no skeleton.
- **Tests touched:** **none — zero coverage.** This is one of three surfaces in the cluster
  protected only by reading the code, so its 5 information items and 7 actions get a manual
  walkthrough against the record (§14), and `tests/shell-nav.test.tsx` newly asserts the star itself
  is reachable at ≤560px.

## Verify email badge (`.topbar-verify`)

- **Today:** A pill in the bar with four label states, rendered only when `data.account` exists and
  `emailVerifiedAt` is null.
- **Becomes:** True pill geometry — `border-radius: 999px`, `padding: 6px 12px`, `12px/600`, border
  `1px solid rgba(28,28,26,0.13)`, transparent fill, `#1c1c1a`; **hover inverts** to
  `#1c1c1a`/`#fdfcf9` (hover move #2). `.is-sent` keeps its green tint, re-based onto `#188038` at
  10% alpha with `#188038` text.
- **Every information item placed (4/4):** the `MailCheck` icon + the four labels (`Confirm email` /
  `Sending…` / `Sent` / `Try again`) → verbatim; `title "Confirm <email> to unlock team invites and
  billing"` → verbatim; both `aria-label` branches → verbatim; the ≤720px collapse to
  `font-size: 0` leaving only the icon (`hs-home.css:2121`) → **kept as-is**, with the `aria-label`
  still carrying the full string.
- **Every action placed (1/1):** click → `apiRequestEmailVerification()`, disabled while sending and
  after a successful send. Unchanged.
- **States:** loading → `Sending…` + disabled (opacity 0.55, no spinner added); error → `Try again`
  and clickable again; sent → `.is-sent`. No empty, no lock.
- **Motion:** the existing `background`/`border-color` `0.18s` hover transition is re-timed onto
  `var(--bf-dur-hover) var(--bf-ease)` and extended to `color` so the invert reads as one move. No
  reveal, no skeleton.
- **Tests touched:** `App.test.tsx:1263` — **passes unchanged** (it counts notices; the pill stays
  one instance in the bar).

## Sidebar icon rail (`Sidebar` / `aside.sidebar.hs-rail`)

- **Today:** 56px navy column, 9 hubs of 40×40 icons, a bottom Settings gear, hover/focus-only
  flyouts, and `:focus-visible` that sets `outline: 0` and nothing else.
- **Becomes:** 56px frozen. `background: #f5f6fa` (**opaque** — the flyout needs ground under it),
  right hairline `rgba(28,28,26,0.07)`, `color: #575550`. Frozen with it:
  `position: sticky; top: var(--hs-topbar-h)`, `height: calc(100vh - var(--hs-topbar-h))`,
  `overflow: visible`, `padding: 10px 0`, `.hs-rail-list { gap: 6px }`, `.hs-rail-slot` and its
  `onMouseEnter`, and the 40×40 button. Button radius `10px → 12px`.

| State | Today | New |
|---|---|---|
| rest | transparent / `#b9c6d8` | transparent / `#575550` |
| hover · `.open` · focus | `rgba(255,255,255,0.10)` / `#fff` | `rgba(28,28,26,0.05)` / `#1c1c1a` |
| `:focus-visible` | `outline: 0`, nothing else | **`+ box-shadow: var(--bf-focus-ring)`** — fixes the recorded weakness that the rail's focus affordance is weaker than the bar's |
| `.active` | `#2f6bff` + `0 6px 16px rgba(47,107,255,0.38)` | `#2f6bff` + `0 4px 12px rgba(47,107,255,0.24)` |
| `.recommended::after` | 6px blue + `0 0 0 2px #14203a` | 6px blue + `0 0 0 2px #f5f6fa` |
| `.hs-rail-tag` New / Beta | `#2f6bff` / `#a78bfa` | `#2f6bff` / `#6d28d9` |
| `hs-rail-ring` | `rgba(47,107,255,0.45)` | same keyframe, alpha `0.14` |
| bottom hairline above the gear | `rgba(255,255,255,0.08)` | `rgba(28,28,26,0.07)` |

Shared component: **`RailTooltip`** on all 9 hubs and the gear (ink pill, 12px offset, 380ms,
`aria-hidden`), which is the cheapest legibility win available without widening the rail — nine
unlabelled glyphs whose only affordance today is a hover flyout and a ~1s OS `title`.

- **Every information item placed (10/10):** (1) `aside aria-label "Primary navigation"` + inner
  `nav aria-label "Hubs"` → unchanged; (2) the 9 hubs in order with their icons and page groupings →
  unchanged, and `HUB_OF` in the harness therefore still resolves; (3) the **21** `navItems` labels
  → unchanged (the record says 22; `App.tsx:643` has 21 — corrected, and `tests/shell-nav.test.tsx`
  asserts 21); (4) `.active` hub resolution → unchanged logic, new fill values; (5) `.open` and
  hover → as tabled; (6) `.recommended` 6px dot → kept, ring re-based to the paper ground; (7)
  `.hs-rail-tag` 7px release dot **and the `aria-label`/`title` suffixes `"<Hub> (New)"` /
  `"<Hub> · New"`** → strings untouched (`tests/settings.test.tsx:113` matches
  `^<Hub>( \(.*\))?$`); (8) the bottom Settings gear (`aria-label` and `title` both exactly
  `Settings`) with its top hairline → kept, both names kept; (9) `data-tutorial-id="nav-<page>"` on
  single-page hub buttons → kept; (10) "56px wide, sticky top 56px, height calc(100vh − 56px),
  overflow visible so flyouts escape" → all four frozen.
- **Every action placed (6/6):** `onMouseEnter` on `.hs-rail-slot` → `openHub(hubId, anchor)` +
  `setFlyoutTop(anchor.offsetTop)` — **the handler does not move, and the DO-NOT-MOVE comment in
  §7 is pasted above it**; `onFocus` on the button → same flyout (the button passes
  `event.currentTarget.parentElement`, i.e. the slot, so both paths agree); `onMouseLeave` on the
  aside or the flyout → the 140ms `scheduleClose()` with its 10px `::before` bridge → both frozen;
  hub click → navigate to the hub's first unlocked page, or `onRequestAddOn` when the whole hub is
  locked → **unchanged**, plus a coarse-pointer branch (below); the gear → `onOpenSettings()`;
  `aria-haspopup="menu"` + `aria-expanded` on multi-page hubs only → unchanged.

  **Added, gated:** a tap path for coarse pointers. `onClick` first checks
  `window.matchMedia("(hover: none)").matches`; when true **and** the hub has >1 page it toggles the
  flyout and sets `setFlyoutTop(parentElement.offsetTop)`, otherwise it runs the existing navigate
  branch byte for byte. `test/setup.ts:57` stubs `matchMedia` to `matches: false` for every query,
  so `coarse` is always false under test and `fireEvent.click(hub)` keeps navigating — which is what
  `appHarness.openSchedule()` (no view) depends on. **The gate must be `(hover: none)`, never a
  width query and never a touch-event sniff.**
- **States:** no empty/loading/error. Add-on lock: a fully-locked hub raises `AddOnPrompt` — path
  unchanged, and all three copies of `lockedAddOnForPage` (App 2271, Sidebar 20544, BookmarksPage
  20401) stay in step because none of them is edited.
- **Motion (6/6):** `hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring` (alpha 0.45→0.14), `hs-tag-ping`
  (still suppressed on the active hub), the button's `background 0.18s` + `transform 0.2s`
  (re-timed to `var(--bf-dur-press)` / `var(--bf-dur-move)` on `var(--bf-ease)`), and the
  `prefers-reduced-motion` block at `app-shell-hubspot.css:942` — **extended in place, every name
  kept.** Hover moves: none of the four (a 40px glyph is not a card, a pill, a link or a mock); it
  gets the wash plus its existing spring. No reveal (`bf-shell-in` once). No skeleton.

  **Short-viewport fix, pure CSS:** 9 hubs × 46px + gear 48px + padding 20px = **482px**, so the
  rail overflows silently below ~540px of viewport height today.
  `@media (max-height: 620px) { .hs-rail-list { gap: 4px } .hs-rail-btn { width: 36px; height: 36px } }`
  → 9×40 + 48 + 20 = **428px**. The list is deliberately **not** made scrollable, because
  `setFlyoutTop(anchor.offsetTop)` is not scroll-adjusted; if a 10th hub ever lands the fix is
  `offsetTop - list.scrollTop` plus `overflow-y: auto` on `.hs-rail-list` only (never on the
  `aside`, which must stay `overflow: visible`).
- **Tests touched:** `tests/settings.test.tsx:113` — iterates Schedule / Operations / Resources /
  Field / Reporting / Home by that regex, **clicks** each hub and expects navigation, and asserts the
  rail gear opens Settings' "Preferences" heading. **Passes unchanged** (names, structure and the
  click branch are all preserved; the tap branch is gated off under jsdom).
  `test/appHarness.tsx openAppPage()` — **passes unchanged**, and is the reason the `onMouseEnter`
  invariant is now a source comment.

## Rail hub flyout (`.hs-flyout`) — including the `SavedViewsFlyout` block

- **Today:** A 228px navy-2 `#1b2a47` popover at 12px radius, absolutely positioned at
  `left: 56px; top: var(--hs-flyout-top)`, listing the hub's pages with icons, release pills,
  add-on lock arrows, a hover-reveal bookmark star, and — for Schedule only — the person's saved
  views.
- **Becomes:** `#fff`, border `rgba(28,28,26,0.07)`, radius **18px** (floating panels sit at 18),
  `--bf-shadow-float`, `padding: 10px`, `hs-flyout-in 0.16s → 0.2s var(--bf-ease)`. Frozen:
  `position: absolute; left: var(--hs-rail-w); top: var(--hs-flyout-top)`, `min-width: 228px`, the
  10px `::before` bridge, the 140ms close timer, `role="menu"`, `aria-label "<Hub> menu"`,
  `transform-origin: left top`, and **`role="menuitem"` on every sub-item** (downgrading them makes
  `getByRole("button", {name: /^Schedule/})` ambiguous). Head `14px/700` white → **eyebrow**.
  Item `13.5px/500 #1c1c1a`, icon 16px `#8a877e`. `SpotlightSurface` wraps the panel.
- **Every information item placed (10/10):** (1) head = hub label → eyebrow; (2) per-page 16px icon
  + `.hs-flyout-label` → as above, hover = wash + **3px slide** (hover move #3, the menu-row nudge);
  (3) `.hs-flyout-tag` `NEW`/`BETA` uppercase 10.5px → `#2f6bff` on `rgba(47,107,255,0.10)` /
  `#6d28d9` on `rgba(109,40,217,0.10)`, radius 999px; (4) the recommended 6px blue dot after the
  label → kept; (5) `.active` (14% white wash, weight 650) → `rgba(47,107,255,0.08)` fill, `#2f6bff`
  text, weight 650; (6) `.locked` + the `CircleArrowUp` `.hs-flyout-upgrade` → kept, arrow →
  `#2f6bff`; (7) `.hs-flyout-tip` (`role="tooltip"`, `id="hs-addon-tip-<page>"`, referenced by
  `aria-describedby`, 244px, bold title + `addOnTipCopy(productId)` body, `::before` arrow) → navy
  bubble becomes an **ink pill** `#1c1c1a`/`#fdfcf9`, radius 12px, `--bf-shadow-pill`, body capped at
  `var(--bf-app-prose)`; **width 244px, the arrow and the `role="tooltip"` are all frozen** because
  `tests/map.test.tsx` queries that role; (8) the `.hs-flyout-star` on every page except `bookmarks`
  (`aria-pressed`, both `aria-label`s, both `title`s) → strings unchanged, gold `#e8a33d` →
  `#2f6bff` with `fill: currentColor` when on; (9) the Schedule hub's `SavedViewsFlyout` — "Saved
  views" sub-head, one row per view with a `Pin` icon, the view name and an `<em>` describing its
  filters → kept, sub-head → eyebrow, `em` → `11.5px #8a877e`; (10) "228px min-width, navy-2, 12px
  radius, left 56px" → re-surfaced as above with the position frozen.

  **`SavedViewsFlyout`'s CSS lives in `schedule.css:1945-1965`, not in the shell CSS** — the
  `.hs-flyout .hs-flyout-views` divider hairline, `.hs-flyout-view`, and the `em`'s 160px ellipsis
  clamp. The new file must carry `.bf-shell .hs-flyout .hs-flyout-views …` too, or the Schedule
  hub's flyout gets a navy-era block sitting inside a white card. This is the trap the record's
  completeness check flagged and it is easy to miss because the selector is in another file.
  Also: **`.hs-shell .hs-flyout-divider` (`app-shell-hubspot.css:768`) matches nothing** — the only
  divider comes from `schedule.css`'s `.hs-flyout-views` `border-top`. Dead rule, listed in §12 R7.
- **Every action placed (4/4):** page menuitem click → close + `setPage(page)`, or
  `onRequestAddOn(productId)` when locked → **flyout changes are CSS-only, so
  `tests/map.test.tsx:103` still gets the dialog and not the page**; star click →
  `onToggleBookmark(page)` with `stopPropagation`; saved-view row click → `openSavedView(userId,
  view, onOpenPage)`; mouse-enter cancels the pending close, mouse-leave restarts the 140ms timer.

  **Two additive behaviour fixes, neither covered by any test, both recorded gaps:**
  1. **`Escape` and focus-out close it.** Today nothing closes it but the mouse-leave timer or an
     item click — tab a hub open, tab away, and it stays on screen forever.
     `onKeyDown` → `Escape` → `setOpenHubId(null)` on the `aside`, plus `onBlur` with
     `relatedTarget` outside → `scheduleClose()`. This is what all four top-bar menus already do.
  2. **The star is reachable on touch.** Today it is doubly unreachable: inside a surface that
     cannot open without hover, revealed by an event that cannot fire. The rail's coarse-pointer tap
     path opens the surface; `opacity: 0.55` below 1024px (instead of 0-until-hover) reveals the
     control. The locked-page tip also fires on **`:focus-within`** as well as `:hover`, so the
     add-on explanation can precede the `AddOnPrompt` for a keyboard or touch user.
- **States:** empty → `SavedViewsFlyout` returns `null` at `views.length === 0` (no "no saved views"
  copy) — **unchanged**, no copy added. Add-on lock → `.locked` + arrow + tip, as above. No
  loading/error.
- **Motion (5/5):** `hs-flyout-in` (0.16→0.2s), `hs-tag-in 0.35s`, the item's `background`/`color`
  `0.15s` (→ `var(--bf-dur-press)`), the tip's `0.14s` reveal (→ `var(--bf-dur-press)`, now also on
  `:focus-visible`/`:focus-within`), and the star's `0.14s` reveal (→ `var(--bf-dur-press)`). Names
  kept. Hover moves: **slide** on rows. Reveal: none (popover). Skeleton: none.
- **Tests touched:** `tests/map.test.tsx:103` — **passes unchanged** (CSS-only; the locked row still
  prompts, and `[role='tooltip']` is still exactly one element because `RailTooltip`'s bubble is
  deliberately `aria-hidden` with no role). `test/appHarness.tsx openAppPage()` — **passes
  unchanged.**

## Command palette (⌘K)

- **Today:** A `role="dialog"` overlay with a combobox input, a listbox of pages and schedule views,
  and a footer legend. `command-palette.css` has **zero** keyframes and **zero** transitions.
- **Becomes:** Dialog radius **20px**, `#fff`, border `rgba(28,28,26,0.07)`,
  `--bf-shadow-stage` (it is the one full-page-modal object in the shell). Input `15px/500`;
  `.cmdk-label` `13.5px/600`; `.cmdk-group` → eyebrow; `.cmdk-hint kbd` chip
  `rgba(28,28,26,0.05)` / 6px / `11px`; `[aria-selected="true"]` row `rgba(47,107,255,0.08)` +
  `#2f6bff` + **3px slide**; footer legend `11.5px #8a877e`. New motion, carefully:
  `.hs-shell.bf-shell .cmdk-backdrop { animation: bf-fade 0.18s var(--bf-ease) both }` and
  `.cmdk-dialog { animation: bf-pop 0.22s var(--bf-ease) both }` (`opacity` +
  `translateY(-8px) scale(0.985)`). **Both are CSS animations on an already-mounted node** — mount
  stays synchronous, because the palette resets its query and focuses the input in a
  `requestAnimationFrame` and anything that delays mount races that focus.
- **Every information item placed (7/7):** (1) the input's placeholder `"Jump to a page or a view…"`
  and its full ARIA set (`role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`,
  `aria-controls="cmdk-list"`, `aria-activedescendant`, `aria-label "Search pages and views"`) →
  every attribute unchanged; (2) `role="listbox" #cmdk-list` with `role="option"` +
  `aria-selected` rows → unchanged; (3) per-row `.cmdk-label` / `.cmdk-group` / `.cmdk-hint` → as
  above; (4) the 14 non-schedule `navItems` in group "Pages" → unchanged; (5) `scheduleCommands`
  ("Schedule" with its keywords, plus one `<Label> view` per `SCHEDULE_VIEW_KEYS` with hints Month 1
  · Week 2 · List 3 · Gantt Chart 4 · Kanban 5 · Matrix 6) → unchanged; (6) the
  `label + group + keywords` case-insensitive filter → unchanged (`filterCommands` is exported and
  unit-tested); (7) the footer legend `↑ ↓ move` / `↵ open` / `esc close` as `kbd` chips →
  unchanged. Also carried from the record's completeness check: **there is no Settings entry** (it is
  not in `navItems`) and only the six schedule views carry a `hint` — reproduced, not "fixed".
- **Every action placed (9/9):** `Cmd/Ctrl+K` toggle (ignoring Alt, `preventDefault`); the top-bar
  search box's click **and** focus; typing filters and resets the highlight to 0; `ArrowDown` /
  `ArrowUp` clamped; `Enter` closes then runs; `Escape` closes; row click runs; row `mouseenter`
  moves the highlight; backdrop `mousedown` closes while `mousedown` inside `stopPropagation`s; and
  the open-reset (query, index, `rAF` focus). **All nine unchanged.**
  **One recorded gap fixed (3 lines, no test):** `.cmdk-list` is capped at `min(52vh, 420px)` and
  nothing scrolls the highlighted row into view, so arrowing past the fold moves
  `aria-activedescendant` off screen. Add `scrollIntoView({ block: "nearest" })` on index change.
- **States:** empty → `Nothing matches “<query>”` (`.cmdk-empty`), copy verbatim, now `13px #575550`
  capped at 62ch. No loading, no error, no lock.
- **Motion:** `bf-fade` + `bf-pop` (the only two new keyframe names in the cluster besides
  `bf-shell-in`), both nulled in the new file's single `prefers-reduced-motion` block. Hover moves:
  **slide** on rows. No reveal, no skeleton.
- **Tests touched:** `components/CommandPalette.test.tsx:12 / :17 / :30 / :45` — **all four pass
  unchanged.** The risk is motion racing the `rAF` focus, and it is retired by making the motion CSS
  on an already-mounted node with no JS transition and no delayed portal.

## Ask AI floating launcher (`AskAiButton` / `.hc-assistant`)

- **Today:** A 52px ink `#1c1c1a` pill with a `MessageCircle` icon and the word "Ask AI", fixed
  bottom-right at `clamp(16px, 3vw, 32px)`, `z-index: 60`, hidden while the assistant is open and on
  Settings.
- **Becomes:** Unchanged geometry and position. Shadow → `--bf-shadow-pill`
  (`0 8px 22px rgba(28,28,26,0.2)`), hover → `--bf-shadow-pill-hover` + `translateY(-3px)` over
  `var(--bf-dur-move) var(--bf-ease)`. **Declared micro-deviation:** the Welcome grammar for a pill
  is *invert*, but this pill floats over content at rest and inverting it to an outline would read
  as it breaking. **Floating pills lift; anchored pills invert.**
- **Every information item placed (3/3):** the `MessageCircle` + "Ask AI" label + `aria-label "Ask
  BuildFlow AI"` → verbatim; the 52px / ink / 999px / fixed-clamp / `z-index: 60` geometry → kept;
  `assistant-global.css` existing purely so the Help Center's `.hc-*` rules light up app-wide (with
  the Help Center's own scoped rules still winning there) → **unchanged, and named as a file the
  re-palette must touch** because it declares its own `--wx-*` set. `help-redesign.css:797-1090` is
  its more-specific twin and is listed in §12 R8 as a cross-cluster follow-up.
- **Every action placed (2/2):** click → `onAsk()` → `openDashboardAssistant()` →
  `setAssistantOpen(true)`; the second instance on the Help Center welcome page (App.tsx:20009)
  wired to `onOpenDashboard` → both unchanged. `.hc-assistant-fab.open`
  (`assistant-global.css:52`) never matches in the app shell — dead, §12 R7.
- **States:** none recorded. It simply does not render while the assistant is open or on Settings.
- **Motion:** lift, on the existing `0.22s cubic-bezier(0.22,1,0.36,1)` re-tokenised to
  `var(--bf-dur-move) var(--bf-ease)`. No reveal, no skeleton. Reduced motion: `--bf-lift`-family
  tokens already zero, so the lift degrades for free.
- **Tests touched:** none recorded. No test changes.

## BuildFlow AI assistant panel (`BreezeAssistant` / `.bf-breeze`)

- **Today:** A portalled, always-mounted `role="dialog"` panel hard-positioned at `top: 56px;
  left: 56px`, in two modes (`.is-docked` at `min(600px, 100vw - 56px)`, `.is-expanded` full width
  with a sidebar), on its own navy `--bfz-*` palette.
- **Becomes:** Same mounting model, same position, daylight surface. Panel radius **20px**,
  `--bf-shadow-float`, `#fff`, border `rgba(28,28,26,0.07)`. `--bfz-navy` / `--bfz-blue` /
  `--bfz-paper` / `--bfz-line` re-based onto ink/accent/paper/hairline **as values, keeping the
  names** (they are read across `hs-breeze.css`). `hs-breeze.css:17,18,43`'s literals
  `top: 56px; left: 56px; width: min(600px, 100vw - 56px)` stay *valid* because the chrome does not
  move, but are rewritten to `var(--hs-topbar-h)` / `var(--hs-rail-w)` so the next concept does not
  inherit the trap. Composer `:focus-within` → `var(--bf-focus-ring)`. Every run of prose (hero,
  message bodies, memories, empty states, tool descriptions) capped at `var(--bf-app-prose)`.
  Type: hero heading `--bf-app-hero`'s floor (28px), "Suggested" → eyebrow, message body
  `--bf-app-row-strong` / 1.5, sidebar item `strong` `13.5px/600` + `em` `11.5px #8a877e`, composer
  `13.5px`, footnote `11.5px #8a877e`. **Three things must not change:** (a) the panel stays
  always-mounted and hidden via `display: none` on `.bf-breeze:not(.is-open)` — showing it with
  `opacity`, or mounting it conditionally, breaks `schedule/viewKeys.ts dialogIsOpen()` and with it
  the 1–6 schedule view keys; (b) `.bf-breeze` stays `pointer-events: none` with
  `> * { pointer-events: auto }`, which is what keeps the page behind interactive (it is **not**
  modal and has no outside-click close); (c) the four quick-action cards stay four and stay in
  order, because their stagger is `--i` from `:nth-child(2|3|4)` with
  `calc(.14s + .05s * var(--i))`.
- **Every information item placed (24/24):** (1) always-mounted + `aria-hidden` when closed →
  unchanged; (2) the `top: 56px / left: 56px` position → unchanged, tokenised; (3) the docked header
  (sparkle mark + "BuildFlow AI" + `ChevronDown`) → `--bf-app-section`; (4) the hero (38px `Sparkles`
  mark and either "Ask me anything, `<FirstName>`" or "What's on your mind, `<FirstName>`?") →
  copy verbatim, heading at 28px/600/-0.025em; (5) the `Suggested` list with its `Lightbulb` and its
  three questions → eyebrow head, rows as pills that **invert** on hover; (6) the four quick-action
  cards (Summarize / Optimize / How do I / Risks) → paper cards at 18px that **lift** by
  `--bf-lift-dense`; (7) thread message classes `.user` / `.assistant` with the 13px `Sparkles`
  mark, paragraph, optional `<ul>` and suggestion chips → unchanged structure, chips become
  inverting pills; (8) composer placeholder "Ask BuildFlow AI or @ mention a project" + the
  auto-growing 120px cap → unchanged; (9) the footnote "AI-generated content may be inaccurate." →
  verbatim, `11.5px #8a877e`; (10) the tools menu (`role="menu"`, `aria-label "AI models by
  capability"`, its head, and all **five** `AI_TOOLS` rows with icon + name + description + italic
  model name — Weather Integration / Claude Haiku 4.5, Schedule Suggestions / Claude Sonnet 5, Crew
  Suggestions / Claude Sonnet 5, DelayIQ Detection / Claude Haiku 4.5, Route Optimization / Claude
  Opus 4.8 — each `role="menuitemcheckbox"` with `aria-checked` and a `Check` tick, all five
  enabled at start) → every string and role unchanged, surface → 18px + `--bf-shadow-float`,
  head → eyebrow, the italic model name is the **one** place the italic-`em` display accent is used
  in-app; (11) the expanded sidebar head + `PanelLeftClose` → unchanged; (12) the sidebar search
  (`aria-label "Search chats, prompts and memories"`, placeholder "Search…") → unchanged, styled as
  the search pill at 32px; (13) the sidebar nav (`aria-label "Assistant"`: New chat, Chats,
  Artifacts, Projects, separator, Memories, Prompts) → unchanged, rows slide 3px; (14) the list
  label switching Recents / Artifacts / Projects / Memories / Prompts → eyebrow; (15) Recents rows
  (History icon, first user message truncated to 64 chars, `formatDateTime(at)`, capped at 20) →
  unchanged; (16) Artifacts rows ("Imported schedule", "`<N>` projects built on the schedule") →
  unchanged; (17) Projects rows (name, "`<percentComplete>`% · `<scheduleHealth>`") → unchanged;
  (18) the four Memories paragraphs → verbatim, rendered as `<p class="bf-breeze-side-memory">`
  (read-only, **not** buttons — so they get no hover state); (19) the Prompts library
  (`aiStartersFor(profile)` then the six fixed prompts) → verbatim; (20) the voice states
  (`.bf-breeze-voice` live region "Listening… speak your question" with a pulsing dot, and
  `.bf-breeze-voice-hint` `role="status"`) → unchanged; (21) attachment thumbs
  (`aria-label "Attached media"`, image or muted inline `<video>`, `PlayCircle` overlay, per-thumb
  `×` labelled `Remove <file name>`) → unchanged, thumb radius → 12px; (22) the drop overlay "Drop a
  photo or video to attach" + `ImagePlus` → verbatim; (23) the four import-progress labels →
  verbatim, through `TextShimmer`; (24) the thinking copy "Thinking…" through `TextShimmer` beside
  `CloudLoader` → unchanged. Plus, from the record's completeness check: the four short `title`
  attributes distinct from the aria-labels (Collapse / Expand / Close / New chat / "Attach a photo
  or video"), the visible word **"Tools"** + `ChevronDown` on the tools chip, the mic's flipping
  `aria-label` ("Talk to BuildFlow AI" / "Stop voice input"), the sidebar search **actually
  filtering** every list, and the second post-import assistant message ("And here's how I optimized
  the imported plan:" + its four fixed bullets + its two suggestion chips) → all preserved verbatim.
- **Every action placed (17/17):** open from the bar sparkle or the FAB; `Escape` closes (unless the
  Tools menu is open); the 80ms focus-the-composer on open; expand/collapse (`Maximize2` /
  `Minimize2` with both aria-labels) plus the sidebar's `PanelLeftClose`; close `×`
  (`aria-label "Close BuildFlow AI"`); New chat from the header `Pencil` and the sidebar row (archive
  → clear → switch to Chats → refocus); submit via `Enter` (Shift+Enter newlines) or the `ArrowUp`
  send button (`aria-label "Send"`, disabled while thinking/importing or blank); `ask()` with its
  `apiAskAi` → live-or-simulated fallback; suggestion chips re-asking; attach via the `+`
  (`aria-label "Add photo or video"`) and drag-and-drop with the depth-counted
  `dragenter`/`dragleave` and the `data-dragging` attribute; remove an attachment (revoking the
  object URL); the Tools chip toggle with its outside-mousedown and `Escape` closers and per-row
  capability toggles; the mic chip (`aria-pressed`, Web Speech, transcript streaming, auto-send on
  final, second press stops); the schedule-migration path (`isScheduleImportIntent` → `runImport` →
  base64 → `apiImportSchedule` → real `createProject`/`createJob`/`assignJob` → `reload()`); the
  "Open the schedule" `ArrowUpRight` link → `onNavigate('schedule')`; the sidebar row behaviours
  (Projects → "Give me a status read on `<project>`", Prompts → ask that prompt, Artifacts →
  navigate to the schedule); the dashboard bridge (`requestDashboardAiAsk` → `assistantOpener()` then
  `dashboardAiAsk()`, **two module-level singletons registered from two different components** —
  App at 2265-2271 and the panel at 24886-24893 — both must survive); and the jsdom-guarded
  scroll-to-bottom. **Also preserved as recorded**: "How do I" does **not** ask — it sets the
  composer to the literal string `"How do I "` and focuses it; and a Recents reopen **also** removes
  that chat from Recents after archiving the current one. **Zero behaviour edits.**
- **States:** 4 empty (the hero state with Suggested + Quick actions shown only then; "No chats";
  "No artifacts yet — schedules BuildFlow AI builds for you show up here."; the
  "Switch from another scheduler" no-attachment reply) → all four verbatim, capped at 62ch. 2 loading
  (the `CloudLoader` + `TextShimmer` "Thinking…" at duration 1.3 / spread 1.4; the import row with
  the current step label) → unchanged. 5 error (backend unreachable mid-import; crew-already-booked
  skip count; unreadable-attachments note; the three voice messages; silent `apiAskAi` fallback) →
  all verbatim. No add-on lock (AI never locks a page).
- **Motion (7/7):** `bfz-in`, `bfz-pop`, `bfz-rise` (all four durations), `bfz-pulse`, `TextShimmer`,
  the `CloudLoader` particles, and the `prefers-reduced-motion` block at `hs-breeze.css:862` —
  **every name kept**, values re-timed onto `var(--bf-ease)` with the stagger delays unchanged.
  Hover moves: **lift** on the quick-action cards, **invert** on the suggestion/chip pills,
  **slide** on the sidebar rows. Reveal: none — this is a panel, not a page. Skeleton: none (the
  thinking row is the loading affordance). The five visual state hooks
  (`.bf-breeze-msg.is-thinking`, `.bf-breeze-chip.listening`, `.bf-breeze-send:disabled`,
  `.bf-breeze-composer:focus-within`, `.bf-breeze[data-dragging="true"] .bf-breeze-drop`) are all
  re-skinned and all keep their selectors. At ≤720px the quick-action grid stays 4→2 columns and
  `.is-docked` stays `width: 100vw; left: 0`.
- **Tests touched:** **no dedicated test file.** `schedule/viewKeys.ts dialogIsOpen()` and its tests
  depend on the mounted-but-hidden contract — preserved, so **they pass unchanged**. This is the
  second of three surfaces with no coverage: its 24 information items and 17 actions get the manual
  walkthrough in §14.

## "What's new" product update modal (`ProductUpdateModal`)

- **Today:** A portalled `role="dialog"` with an eyebrow, an entry title and description, a
  hand-rolled 12-ray starburst SVG, and three actions.
- **Becomes:** Radius **26px** (the stage rung — this and the add-on prompt are the two biggest
  objects in the app), `--bf-shadow-stage`, `#fff`, border `rgba(28,28,26,0.07)`. Body copy capped
  at `var(--bf-app-prose)`. Eyebrow → the 11.5px rule. Title → `--bf-app-title`'s cap (26px/600).
  **The shared base is split before either is touched**: `.hs-upd-dialog` keeps the common surface
  and a new `.hs-addon-dialog` override carries the add-on prompt's differences, so restyling one
  does not restyle the other. **It does not dismiss on a backdrop click today and it still does
  not** — `.hs-upd-backdrop` is `role="presentation"` with no handler, and `useModalDialog` handles
  only `Escape`, a Tab wrap-around trap, initial focus and focus-restore-to-opener. All four
  behaviours preserved.
- **Every information item placed (4/4):** (1) the `Sparkles` eyebrow "What's new" + `· v<version>`
  + `· <dateLabel>` → verbatim; (2) the entry title as `h2` and its description as the body with
  `aria-describedby="hs-upd-desc"` → verbatim; (3) the inline starburst (12 alternating rays cycling
  `HS_UPDATE_RAY_COLORS` `#2f6bff / #9b72cb / #d96570 / #4285f4`, plus the four-point sparkle path
  filled `#4285f4 → #9b72cb`) → **unchanged, including the fact that those colours are JS literals
  in `App.tsx:3071`**; they are already the trio's values, so no re-palette is needed; (4) the
  `bf:updates:seen:<userId>` gating plus the tutorial-active and Settings suppressions → unchanged.
- **Every action placed (4/4):** close `×` (`aria-label "Close what's new"`) →
  `dismissPendingUpdate()`; "Show me where it is" (`MapPin`) → dismiss + `openAppPage(entry.page)` +
  `spotlightUpdateTarget(entry.spotlight)` with its **14 retries at 150ms**, the 260ms delay, the
  `scrollIntoView({block:'center', behavior:'smooth'})` and the 4200ms `.hs-upd-spotlight` class;
  "Learn more" (`ArrowUpRight`) → dismiss + `window.open('#updates/update-<dateTime>', '_blank')`;
  `useModalDialog(dialogRef, onClose, true)`. All four unchanged. The two buttons become the
  primary/secondary pills of §Buttons (blue fill / inverting outline).
- **States:** error → the blocked-popup fallback (same-tab navigate + reload) unchanged. No empty,
  no loading, no lock.
- **Motion (4/4):** `hs-upd-fade 0.18s`, `hs-upd-pop 0.26s cubic-bezier(0.22,1,0.36,1)` (already the
  right curve — re-expressed as `var(--bf-ease)`), `hs-upd-pulse 1.1s ×3` on the destination page's
  spotlight ring, and the `hs-update-modal.css:195` reduced-motion block → **all four names kept,
  the block extended in place.** `spotlightUpdateTarget` adds `hs-upd-spotlight` **directly to a
  page element**, so when the shared base is split that one rule must stay global. At ≤560px
  `hs-update-modal.css:186` shrinks the padding to `32px 22px 26px` and the starburst to 130px —
  kept, and it applies to the add-on prompt too because of the shared base.
- **Tests touched:** none recorded. No test changes.

## Add-on program prompt (`AddOnPrompt`)

- **Today:** A portalled `role="dialog"` named `Get <Program>`, rendered as
  `.hs-upd-dialog.hs-addon-dialog`, explaining an add-on and routing to Billing.
- **Becomes:** The split `.hs-addon-dialog` surface: radius 26px, `--bf-shadow-stage`, body at 62ch.
  The program art tile keeps its tone tint, its 38px icon and its `CircleArrowUp` badge; tile radius
  → 18px. Eyebrow → the 11.5px rule. Title → 26px/600. The "Where to get it" block becomes a
  hairline-topped section of the same sheet (`1px solid rgba(28,28,26,0.07)`, no second frame — the
  card licence forbids a box inside a box here).
- **Every information item placed (7/7):** (1) the three locks (`map → map-field-ops`,
  `equipment → equipment-tracking`, `timecard → time-cards`; AI never locks a page) → unchanged;
  (2) the tone-tinted art tile with its 38px icon + badge → kept; (3) the eyebrow
  "Add-on · `<price>` `<unit>`" with all four prices (Map & Field Ops $12, Equipment Tracking $9,
  Time Cards $8, AI $15 per user / month) → verbatim; (4) the title `Get <Program label>` →
  verbatim (`tests/map.test.tsx` matches the accessible name); (5) the body = description + catalog
  pitch, e.g. "Live vehicle and equipment locations, traffic routing, and field operations on one
  map." → **verbatim, and asserted by test**; (6) the "Where to get it" `CreditCard` block:
  "Settings → Billing → Add-ons: add `<Program>` to your `<Plan>` plan for `<price>` `<unit>`. It
  comes included with the `<Business and Enterprise>` plans." → verbatim, **including the recorded
  fallback branch** with no plan selected ("…to your plan for…"); (7) the included-plan names from
  `addOnIncludedPlanNames()` joined with "and" → unchanged.
- **Every action placed (4/4):** "Purchase in Billing" (`ShoppingCart`) →
  `openSettingsBilling(productId)` with `focusAddOn`; "Not now" → `onClose`; close `×`
  (`aria-label "Close"` — **the exact name the test clicks**) → `onClose`; `useModalDialog`'s trap,
  `Escape` and focus round-trip. Unchanged. Primary → blue pill, "Not now" → inverting outline pill.
- **States:** this **is** the add-on lock state for the whole cluster. Every locked destination in
  it — the rail's fully-locked hub, the flyout's locked row, the Bookmarks page's locked tile, the
  Dashboard's "View all equipment", every TimeCard card and "Get TimeCard" — raises this one dialog.
  No empty/loading/error.
- **Motion (1/1):** reuses `hs-upd-fade` + `hs-upd-pop`. Names kept.
- **Tests touched:** `tests/map.test.tsx:103` — asserts the dialog name `Get Map & Field Ops`, the
  pitch text, that the Map page's "Job sites" heading does **not** render, and that the button named
  `Close` dismisses it. **Passes unchanged.** `App.test.tsx:154` (plan required, add-on not) —
  **passes unchanged.**

## Guided tutorial overlay (`BuildFlowTutorial`)

- **Today:** A `pointer-events: none` overlay whose panel re-enables `auto`, drawing a spotlight as a
  2px `#2f6bff` border with a `0 0 0 9999px rgba(6,18,35,.42)` box-shadow scrim, plus a progress row,
  a step card and a lesson pill row.
- **Becomes:** Panel radius **20px**, `--bf-shadow-float`, `#fff`; body `13px/1.5` capped at
  `var(--bf-app-prose)`; step title `--bf-app-section` (16px/600); the progress percentage
  `--bf-app-figure-sm` (22px/700 + `tabular-nums`); the `.buildflow-tutorial-meter` bar becomes a
  999px track (`rgba(28,28,26,0.07)`) with a `#2f6bff` fill; lesson pills become 999px pills —
  `.active` = `#2f6bff` fill on `#fff` text, `.done` = `#188038` at 10% alpha with `#188038` text
  and its tick, rest = outline that inverts on hover; the requirement notice
  (`role="status"`, `.buildflow-tutorial-requirement`) keeps its blue tint, re-based to
  `rgba(47,107,255,0.08)` with `#1c1c1a` text and a `#2f6bff` left rule. **Frozen, all of it:** the
  19 anchor strings and `TutorialTargetId`; `max-height: calc(100vh - 128px); overflow: auto` on the
  panel; `pointer-events: none` on the overlay with `auto` only on the panel (this is what keeps the
  spotlit control clickable, which is what makes the gated steps satisfiable at all); the 9999px
  box-shadow scrim; the `--tutorial-spotlight-*` custom properties and their 180ms glide; the
  `scrollIntoView({block:'center', inline:'center'})`; and the ≤720px bottom-sheet
  (`inset: 12px; max-height: 62vh`, action row stacked).
- **Every information item placed (11/11):** (1) the progress row ("Step `<n>` of `<total>`" + the
  bold percentage + the meter) → verbatim; (2) the step `h2` + body → verbatim; (3) the requirement
  notice → verbatim; (4) the lesson pill row (`aria-label "Tutorial lessons"`, every step's
  `shortTitle`, `.active` / `.done`) → verbatim; (5) all **seven** core steps with their titles,
  targets, gates and requirement strings → verbatim; (6) all **eight** `scheduleTourSteps` with
  their titles and targets → verbatim; (7) the four per-add-on lessons → verbatim; (8) the final
  "Tutorial complete" / "Wrap-up" step with its body and its `tutorial-restart-button` target →
  verbatim; (9) `[data-tutorial-id]` as a load-bearing contract → **26 occurrences in App.tsx, none
  renamed, none removed, none hidden at any width the tutorial can run at**; (10) the shell-owned
  anchors (`nav-<page>` ×21, `tutorial-restart-button`, `bookmarks-page-title`) → kept; (11) the
  persistence contract (`createTutorialSetupKey`, the server `tutorial:<setupKey>` setting, the local
  `buildflow.tutorial.status:<setupKey>` mirror, server-preferred reads) → untouched.
- **Every action placed (10/10):** the auto-navigate when the step names another page; "Skip
  Tutorial" → `onSkip` → status `skipped`; "Back" (disabled on step 0); "Next" / "Finish" (disabled
  while the gate is unsatisfied) → advance or `onFinish` → `completed`; restart from the top bar's
  Help button; the four gate checks (`crewDialogOpen`, `crewCreated`, `jobDialogOpen`,
  `jobScheduled`); the `MutationObserver` on `document.body` bumping `domVersion`; the spotlight
  rect + 8px padding written into the custom properties; `chooseTutorialPanelPosition`'s
  left/right/below/above cascade with its 18px margin and top-right fallback; and the resize +
  capture-phase scroll re-measure. **All ten unchanged.**
- **States:** error → a missing anchor sets `spotlightRect` and `panelPosition` to `null`, so the
  overlay dims nothing and the panel falls back to `top: 104px; right: 26px` — **a redesign that
  renames an anchor breaks the step silently**, which is why the anchors are on the pin list and why
  §14 walks the tutorial end-to-end in a browser at three widths; `apiSetUserSetting` failures stay
  fire-and-forget. No empty, no loading, no lock. **The ≤560px defect is fixed, not reproduced:**
  `app-shell-hubspot.css:1136-1139` currently `display: none`s the help button below 560px, so the
  tutorial's own final step spotlights an element that does not exist and the light silently goes
  dark. Nothing in the top bar is hidden at any width any more (§Responsive).
- **Motion (4/4):** the spotlight's `top/left/width/height` 180ms transition, the meter's 180ms
  width transition, the overlay's pointer-events model, and the ≤720px bottom sheet → all kept,
  re-expressed on `var(--bf-ease-size)` (a size transition, so the second curve). No reveal (an
  overlay is never a reveal target — and the reveal transform on an ancestor would mis-place the
  light). No skeleton. **`backdrop-filter` hazard:** the top bar is now a `backdrop-filter` ancestor
  of `tutorial-restart-button`. `backdrop-filter` makes an element a containing block for
  `position: fixed` descendants; the bar has none (its menus are `absolute`) and the overlay is a
  sibling at `z-index: 80` above the bar's `40`, so it should paint over correctly — **but this is
  exactly the class of bug the record warns about, so it is a required browser check, not a shrug.**
- **Tests touched:** `tests/tutorial.test.tsx:112 / :136 / :155 / :183` — **all pass unchanged**;
  `App.test.tsx:228` (personalised tutorial with the interpolated setup sentence and the two add-on
  lesson pills) — **passes unchanged**; `App.test.tsx:247` (restart from the top bar) — **passes
  unchanged**.

## Bookmarks page (`BookmarksPage`)

- **Today:** `.page-stack.bookmarks-page.hs-index`, two cards: what is starred grouped by rail hub,
  and every page in the app. Tiles are `auto-fill, minmax(214px, 1fr)` with **no width breakpoints
  at all**.
- **Becomes:** Two paper cards at 18px with `--bf-shadow-card` on the flat ground, separated by
  `var(--bf-rhythm-dense)` (30px), page tail 72px. `h1` → `--bf-app-title` (clamp 22→26px, 600,
  `-0.02em`, `#1c1c1a` — retiring the third ink). Group heads → eyebrow with the hub icon at 14px
  `#8a877e`. `.bm-count` → `--bf-app-meta` `#575550`. Tiles: paper cards at 18px that **lift** by
  `--bf-lift-dense` (their whole boundary navigates — licensed); icon chip radius 12px; label
  `13.5px/600`. `.bm-tile.is-starred` border `rgba(240,179,84,.55)` → `rgba(47,107,255,0.35)`
  (§1.5). Sub-line "Star a page to pin it to quick access" → `--bf-app-lede` at 62ch. Tiles gain the
  breakpoint they never had: `minmax(214px,1fr)` → `minmax(180px,1fr)` below 560px, so a 375px phone
  gets two columns instead of one 214px column with 100px of waste.
- **Every information item placed (7/7):** (1) Card 1 `h1` "Bookmarks" with
  `data-tutorial-id="bookmarks-page-title"` and its inline `<PageReleaseTag page="bookmarks" />` →
  kept, **and the record's own correction is honoured: the element is there, the pill is not**
  (`pageReleaseTag('bookmarks')` returns `null` today) — the new `.bf-shell .hs-page-tag` rule
  therefore changes nothing here and everything on the six schedule pages (see the next screen);
  (2) `.bm-count` "`<N>` page(s) starred" + " · `<N>` view(s)" → verbatim; (3) one `.bm-group` per
  hub with starred pages, in rail order, headed by the hub icon + label → kept; (4) `.bm-tile`
  contents (nav icon chip, page label, the `CircleArrowUp` `.bm-tile-lock` glyph on add-on pages, the
  star button) → kept, lock glyph `#2f6bff`; (5) `.is-starred` → re-coloured; (6) the "Schedule
  views" section (`Link2` heading, per-tile label + filter description as `<small>`) → kept,
  `small` → `11.5px #8a877e`; (7) Card 2 `h1` "All pages" + its sub-line + every hub and every page
  except `bookmarks` itself → kept.
- **Every action placed (4/4):** tile open button (`title "Open <label>"`) → `setPage(page)`, or
  `AddOnPrompt` via `onRequestAddOn` when locked; tile star (`aria-pressed`, both aria-labels, both
  titles) → `onToggleBookmark(page)`; schedule-view tile open → `openScheduleLink(link)` (**the
  BUG-1 no-op — preserved as-is, flagged in §12 R3**); schedule-view tile star (always `.is-on`) →
  `onToggleLink(link)`.
- **States:** empty → `.bm-empty` with its 22px `Star`, `<strong>No bookmarks yet</strong>` and the
  full second sentence → **copy verbatim**, glyph `#8a877e`, prose at 62ch, still suppressed when
  only schedule-view links exist. No loading, no error. Add-on lock → the lock glyph + the prompt.
- **Motion (3/3):** `bm-rise 0.4s` tile entrance → kept by name, retimed to
  `var(--bf-dur-reveal-dense)` with a `--bf-reveal-stagger-dense` (50ms) step; the tile hover
  transition → the lift; the star's colour + fill when on. The `prefers-reduced-motion` block at
  `bookmarks-page.css:167` is **extended in place**. Reveal: the two cards are the page's **two**
  reveal targets — well inside the six-per-page budget. Skeleton: none (the page is synchronous).
- **Tests touched:** **none — zero coverage.** Third of the three unprotected surfaces; its 7
  information items and 4 actions get the manual walkthrough in §14.

## Workspace loading screen (`.loading-screen`) — *added; the record catalogues it only as a state*

- **Today:** A full-viewport `.loading-screen` (`styles.css:13610`) with a `Loader2 .spin` and the
  copy "Loading BuildFlow HUD".
- **Becomes:** Ground `#f5f6fa`, centred column, text `18px/600 #1c1c1a` wrapped in the existing
  **`components/ui/text-shimmer.tsx`** (58 lines, already ported — **no new file**), the `Loader2
  .spin` kept at 20px `#2f6bff`. Gutters `var(--bf-app-gutter-*)`.
- **Every information item placed (1/1 from the shell frame's list):** the copy
  "Loading BuildFlow HUD" → **verbatim**, and it is the only route-level loading copy other than the
  Dashboard's skeleton.
- **Every action placed:** none exist. It has no controls.
- **States:** it *is* a state, and it is the loading state for every route except `dashboard`.
- **Motion:** `.spin` kept by name; `TextShimmer` (framer-motion) is nulled under reduced motion by
  the component's own internal block. No reveal.
- **Tests touched:** `App.test.tsx:1109` asserts the Dashboard route shows the skeleton *instead of*
  this — **passes unchanged**.

## Workspace error screen (`.loading-screen.error-screen`) — *added; likewise*

- **Today:** The same full-viewport frame plus an `AlertTriangle`, the API error text (or
  "BuildFlow data is unavailable."), and `.error-screen-actions` holding two buttons.
- **Becomes:** Ground `#f5f6fa`; `AlertTriangle` 22px `#c5221f`; message `--bf-app-lede` `#1c1c1a`
  capped at `var(--bf-app-prose)`; "Try again" → the blue primary pill; `.error-screen-back`
  "Back to log in" → the **inverting** outline pill. It is deliberately **not** given a card: a
  full-viewport message on the flat ground is one sheet, and the card licence would forbid the frame.
- **Every information item placed (1/1):** the message and its `BuildFlow data is unavailable.`
  fallback → verbatim.
- **Every action placed (2/2, from the shell frame's action list):** "Try again" → `runBootstrap()`;
  "Back to log in" → `returnToWelcome()`. Both unchanged. Also recorded here so it is not lost:
  `retryTransient` (App.tsx:39130) retries bootstrap 3× at 400/900/1600ms on network errors and any
  5xx, never on 4xx — which is why this screen is rare; and the demo-session fallback
  (App.tsx:2308-2325) silently calls `apiDemoLogin()` on a 401 and retries, so the shell can be
  occupied by an anonymous demo session. **Neither mechanism is touched.**
- **States:** it *is* the error state. No empty/loading/lock.
- **Motion:** none today, none added (a failure state should not animate in). No reveal.
- **Tests touched:** `App.test.tsx:1085` exercises the transient-failure path — **passes
  unchanged**.

## `PageReleaseTag` (`.hs-page-tag`) — *added; a shell-owned component injected into other pages*

- **Today:** `pageReleaseTag()` renders a `New`/`Beta` pill in **four** places: the rail hub dot, the
  flyout pill, the Create-new pill, and beside a page title. The fourth is **broken**: the only rule
  is `hs-index.css:978 .hs-index .hs-index-title .hs-page-tag`, and `schedule/page.tsx:612` renders
  it inside `<h1 className="dx-title">`, which that selector does not match. There is no unscoped
  `.hs-page-tag` rule in any of the 57 stylesheets. As of 2026-09-10 month / week / list / kanban /
  matrix / gantt all carry a "New" tag, so **all six schedule pages render the bare word "New" as
  unstyled inline text** beside their `h1`.
- **Becomes:** **One unscoped-within-the-shell rule fixes all six**:
  `.bf-shell .hs-page-tag { … }` — 999px pill, `10.5px/700`, uppercase, `letter-spacing: 0.045em`,
  `#2f6bff` on `rgba(47,107,255,0.10)`; `.bf-shell .hs-page-tag.beta` → `#6d28d9` on
  `rgba(109,40,217,0.10)`. The existing `.hs-index .hs-index-title .hs-page-tag` rule stays (it is
  more specific and now agrees with the general one).
- **Every information item placed (1/1):** the tag's two values (`New` for `NEW_TAG_DAYS = 30` days
  after an `UPDATE_ENTRIES` entry `introduces` a page, `Beta` for `BETA_PAGES` = companies, deals) →
  logic untouched; the value set is date-relative and must be re-checked at build time.
- **Every action placed:** none — it is a label.
- **States:** absent when `pageReleaseTag()` returns `null` (e.g. `bookmarks` today).
- **Motion:** `hs-tag-in 0.35s` where it already applies. No reveal.
- **Tests touched:** none asserts on the pill. **No test changes**, and the fix is visible on six
  pages at once, so it belongs in the acceptance walkthrough.

## Shell routing, tab title and entry surfaces — *added; no visual chrome, but recorded information*

- **Today:** (and unchanged) Schedule pages live at `#schedule/<page>?…`. `App.tsx:2465-2483`
  pushes a history entry when the page changes to a *different* schedule page, `replaceState`s when
  it is the same page or a non-schedule page, and pushes the bare URL when leaving a schedule link.
  `App.tsx:2492-2501` handles `popstate`: a schedule hash writes the schedule context and sets the
  page, otherwise `event.state.page` restores it. **Browser Back/Forward is working navigation in
  this shell.** The tab title is shell-owned and page-dependent (`Map & Field Ops · BuildFlow` on
  `map`, else `BuildFlow — Construction Scheduling & Field Command Center`, App.tsx:2417-2425). Every
  page change scrolls the window to top, explicitly skipped when the user agent contains `jsdom`
  (App.tsx:2409-2415). Four query-string entry routes are handled in `runBootstrap` and each
  rewrites the URL with `replaceState`: `?from=onboarding` → `openAppPage('dashboard')`,
  `?from=settings` → `openSettingsView('billing')`, `?oauth=login` → `enterAfterAuth()`,
  `?oauth=signup` → strip and stay on the hash; plus the no-param path with
  `onboardingCompletedAt` set and a schedule deep link → `openAppPage('dashboard')`.
- **Becomes:** **Nothing. Zero edits.** This screen exists so the routing layer is on the record as
  something the redesign must not disturb, and so one specific hazard is written down: **the scroll
  restoration and both `scrollIntoView` calls assume the window is the scroller.** If any new
  wrapper in this cluster becomes a scroll container, page-change scroll-to-top, the tutorial
  spotlight and the What's-new spotlight all land on the wrong scroller. The new stylesheet
  therefore adds no `overflow` to any ancestor of `.content-scroll`, and `density.test.ts` has no
  business here — this one is a review-gate line item.
- **Every information item placed (6/6 from the record's `missingInformation`):** the history /
  `popstate` contract, the tab title, the scroll restoration and its jsdom skip, the four
  query-string routes, the demo-session fallback, and `retryTransient`'s 3×400/900/1600ms backoff —
  all six preserved verbatim, all six documented here rather than in a screen that could be
  restyled.
- **Every action placed (1/1):** Browser Back / Forward → `popstate` → page restore, including a
  schedule view's week and filters from the hash via `writeScheduleContext`. Unchanged.
- **States:** none — this screen renders nothing.
- **Motion:** none, and none may be added: no reveal, no transform, no new scroll container anywhere on the path (see above).
- **Tests touched:** none directly. `App.test.tsx`'s demo-login and query-string paths run through `runBootstrap` and pass unchanged.

## Responsive model for the shell — the rail stays, the subtraction stops

The rail stays 56px at every width (15% of a 375px screen; HubSpot ships the same). Nothing is
hidden that carries an action.

| Width | Today | New |
|---|---|---|
| ≥1041px | full bar | full bar; gutters 28px / 32px |
| ≤1040px | brand word + `⌘K` chip hidden, gap 10px | unchanged (both are redundant affordances) |
| **≤1024px (new)** | — | hover-reveal control layer pinned visible: `.hs-flyout-star` and `.hs-bookmark-remove` go to `opacity: 0.55` instead of 0-until-hover; the locked-page tip fires on `:focus-within` too |
| ≤760px | search `flex-basis: 110px`, divider hidden | unchanged |
| **≤640px (new)** | — | icon buttons 36 → 34px; the three `.hs-menu`s widen to `min(300px, 100vw - 20px)`; they flip to `left: 0` in step with the account menu, which `styles.css:14071` already does at 680px — **the two are aligned at one width** |
| **≤560px** | **star, create, help and settings are all `display: none`** | **nothing is hidden.** Icon buttons → 32px; the search pill collapses to a 36px icon button (`.search-box { width: 36px; padding: 0; justify-content: center }` + `.search-box input { width: 0; min-width: 0; padding: 0; opacity: 0 }`) so **the `<input aria-label="Search BuildFlow">` stays in the DOM and stays focusable through its `<label>`**. Budget at 375px: brand 30 + 7×32 + account 44 + 4×8 gaps + 14 padding = **344px. Fits.** |
| **≤380px (new)** | — | exactly one control hides: `.hs-settings-button`. It is the only one with two other homes at that width (the rail gear and the account menu's `Settings` item), so no action is lost — and `tests/settings.test.tsx:113`'s "≥2 buttons named Settings" still holds because the rail gear remains. Budget: **312px** |
| **≤620px tall (new)** | rail overflows silently at 482px | rail buttons 36px, gap 4px → 428px |
| ≤720px | verify label → icon, tutorial → bottom sheet, AI sidebar hidden + panel full-width, AI quick-actions 4 → 2 cols | unchanged |
| ≤680px | account menu flips to `left: 0`, `min(290px, 100vw - 28px)` | unchanged (and now aligned with the other menus at 640px) |
| ≤560px | What's-new padding `32/22/26`, starburst 130px (also applies to the add-on prompt) | unchanged |

Net effect: **at every width every top-bar action stays reachable and the tutorial's wrap-up anchor
stays visible.** Delivered by CSS arithmetic — no drawer, no hamburger, no new component, and one
new test file (§8.1) that fails if it ever regresses.

---

# 10. The Dashboard — 23 screens

## Dashboard (Home) page shell

- **Today:** `<div className="dash-rx hs-home">` with `is-customizing` / `is-rearranging`
  modifiers, an **880px** centred column (`hs-home.css:1391` beats `:853`'s 1280px at equal
  specificity), root padding `24px clamp(20px,3vw,40px) 56px`, `min-height: calc(100vh - 56px)`,
  ground `#f5f6fa`, and a `margin: -22px -28px -34px` bleed over the shell's content padding. The
  `.dx-bg` aurora field and `.dx-cursor` are still in the JSX with the pointer handler still writing
  `--mx/--my/--px/--py` every frame, but `hs-home.css:848` sets them `display: none`.
- **Becomes:** Same 880px column (**the measure that is kept is the app's own, not the Welcome
  Page's 1140px** — and the board escapes it with `.bf-doc-bleed` at ≥1281px only, where 6 columns
  at 880px would put a KPI tile below 128px). Column gap `30px` → `var(--bf-rhythm-dense)`, which
  resolves to **30px** at a 900px-tall viewport: a token substitution with zero pixel change. Root
  padding-bottom `56px` → `var(--bf-app-tail)` = **72px** — the one place Welcome-scale air is free,
  because nothing competes for space below the last row. The bleed is re-expressed against the
  gutter tokens (see §App shell frame) so the `-28px` arithmetic cannot drift. Ground already
  `#f5f6fa`; the `--hsh-ink #14203a` text token is re-valued to `#1c1c1a` (§1.8) and the `--wx-*`
  block that `~135` declarations in `dashboard-redesign.css` and `~53` in `hs-home.css` read is left
  **in place** — deleting it would make the older layer resolve empty. All rules are written
  `.bf-shell .dash-rx.hs-home …` so the shared `KpiCard`, `ScheduleStatusBand` and `TimeCard` cards
  keep today's rendering on Schedule / Reports / TimeCard until those clusters' mappings land
  (declared interim seam, §13 open question O3).
- **Every information item placed (7/7):** (1) the root classes and both modifiers → kept, `bf-`
  nothing added at this level (the shell class carries the scope); (2) the `.dx-bg` / three
  `.dx-aurora` / `.dx-cursor` nodes → **still rendered, still `display: none`** (removing them is a
  JSX change and a paint-perf improvement, so it is proposed in §12 R4, not taken); (3) the
  `--mx/--my/--px/--py` custom properties → **kept and now consumed**: `SpotlightSurface` reads them,
  so the pointer work that is dead today starts paying for itself with zero new listeners; (4) the
  inner column (880px, gap 22→30px) → as above, and the record's 1280px figure is corrected;
  (5) ground / `min-height` / Inter → kept, `min-height: calc(100vh - 56px)` stays literal because
  the bar height stays 56px (this is the second of only two `calc(100vh - 56px)` sites in the CSS
  estate — the other is `project-dialog-redesign.css:58` — and both are safe **only** because the bar
  does not move); (6) the `--hsh-*` token block → re-valued (ink) not renamed; (7) the `--cc-*` tone
  tokens (blue / green / amber / red / violet / orange, each with a `-soft`) → **kept exactly**,
  because they are a shared vocabulary across materials, equipment, delayIQs, projects and settings.
- **Every action placed (3/3):** the pointer-parallax `rAF` writer → kept (now consumed); the
  scroll-reveal effect with `.dx-ready`, its `IntersectionObserver` and its `MutationObserver` for
  late-mounting targets → kept, **with `threshold: 0.12 → 0.16` and `rootMargin: -5% → -6%` here as
  well as in `useHudMotion.ts` (§3.2)**, and the reduced-motion / missing-IO branch that adds `.in`
  to everything at once → kept; the two coexisting drag systems (the board's own pointer engine and
  the dnd-kit `DndContext` with `PointerSensor` distance 6 and `dashCollisionDetection`) → **not
  unified, not touched.**
- **States:** loading → `DashboardSkeleton` (own screen); error → the generic error screen (own
  screen), reached only after `retryTransient` gives up. No empty state at page level. No lock.
- **Motion (4/4):** `dx-pulse 2.6s` on `.dx-dot` → kept by name; `[data-reveal]` → shift
  `28px → var(--bf-reveal-shift-dense)` (12px), duration `0.9s → var(--bf-dur-reveal-dense)`
  (0.55s), stagger `90ms → var(--bf-reveal-stagger-dense)` (50ms), curve unchanged;
  `[data-reveal-stagger] > *` → shift `22px → 12px`, `0.75s → 0.55s`, per-child delays
  `0.04/0.12/0.2/0.28/0.36/0.44s` → `0/50/100/150/200/250ms`; the `prefers-reduced-motion` block at
  `dashboard-redesign.css:843` → **extended in place**, keeping its "shorten to .3s rather than
  remove" behaviour (which is why `--bf-dur-reveal-dense` becomes 0.3s under reduce rather than 0).
  Reveal targets on this page: **six**, listed in §3.1. Hover moves at page level: none.
- **Tests touched:** `App.test.tsx:489` and `:550` (open the dashboard) — pass unchanged;
  `App.test.tsx:1085` — passes unchanged; `tests/tutorial.test.tsx:286` — passes unchanged.

## Greeting header (`hs-home-head`)

- **Today:** A `[data-reveal]` header: date line with a pulsing dot, the greeting `h1` at
  `clamp(26px,3vw,32px)/650`, a subtitle, the dot-separated meta fact line, and a topline action row
  holding Reset layout + Customize, with the promo, the customize hint, the hidden-panel chips and
  the trial notice below.
- **Becomes:** The one place on this page that takes the **display** register up a rung: the
  greeting goes to `--bf-app-hero` = `clamp(28px, 3vw, 38px)` / **600** / `-0.025em` / 1.05. **38px
  is the Welcome Page's own feature-hero floor**, so the marketing ladder and the product ladder
  touch at exactly one rung, and the cost is +6.6px of vertical on one line above the board — which
  I have checked against the fold (§14). Date line frozen at `13px/600` with the `.dx-dot` kept.
  Subtitle → `--bf-app-lede` (14.5px, unchanged) `#575550` capped at `var(--bf-app-prose)`. Meta
  fact line → `--bf-app-meta` (12px) `#8a877e` with the separators as `·`, unchanged markup. The
  topline actions become the §Buttons controls: `Customize` and `Reset layout` are **inverting
  outline pills** (999px, `13px/600`, `padding: 6px 14px`), and `Customize.active` becomes
  `rgba(47,107,255,0.08)` + `#2f6bff` + weight 650 rather than the `--hsh-blue-soft` fill. Hidden-panel
  chips → 999px inverting pills. The trial notice keeps `.business-context-verify.is-billing` and
  `role="status"`, re-based to `rgba(47,107,255,0.08)` with a `#2f6bff` `CreditCard` and its
  "Choose a plan" as the blue primary pill. Header block reveal: **1 of the page's 6.**
- **Every information item placed (7/7):** (1) the date line (`.dx-dot` + the full
  `toLocaleDateString('en-US', {weekday, month, day, year})` string from `dashboardToday` at 12:00
  local) → verbatim; (2) the greeting (`Good morning` <12h / `Good afternoon` <17h / `Good evening`,
  plus `, <capitalised first name>` falling back to `there`) → verbatim, re-typed; (3) the subtitle
  "Your AI-powered hub for construction scheduling, insights, and execution." → verbatim;
  (4) the meta fact line (`aria-label "Selected BuildFlow setup"`,
  `data-tutorial-id="dashboard-setup-banner"`, dot-separated, empty facts dropped: "`<BusinessType>`
  workspace" or "BuildFlow workspace" · "`<Plan>` plan" · "N seat/seats" · "Trial ends `<date>`" only
  while `billingStatus === 'trial'` · "Selected products: `<comma list>`") → **verbatim, and it is a
  tutorial anchor, so no reveal transform and no new transform/filter/contain may be added to it or
  any ancestor**; (5) the trial-expired notice copy → verbatim; (6) the customize hint (`role=
  "status"`, `GripVertical`, "Drag any panel by its handle to rearrange this page, or hide one from
  its corner. Your layout follows your account.") → verbatim at 62ch; (7) the hidden-panels group
  (`role="group"`, `aria-label "Hidden panels"`, the uppercase `EyeOff` label with its `.04em`
  tracking → the 11.5px/0.045em eyebrow, and one chip per hidden panel with an `Eye` icon + the
  panel's title) → verbatim.
- **Every action placed (6/6):** `Reset layout` (`.dash-reset`, `RotateCcw`, its full `title`, only
  rendered when **not** stacked **and** (`layoutCustomized || customizing`), `:disabled` at opacity
  .45 / `not-allowed`) → unchanged, restyled; `Customize` / `Done` (`.hs-home-customize`, `Settings`
  icon, `aria-pressed`, both `title`s, only when not stacked) → unchanged; the promo's two actions →
  its own screen; hidden-panel chip (`aria-label "Show <Title>"`, `title "Put this panel back on the
  board"`) → `panelLayout.show(id)`, unchanged; the trial notice's "Choose a plan" → `onOpenBilling()`
  → Settings › Billing, unchanged. **Also recorded here, from the dashboard record's
  `missingActions`: panels can be moved, resized and arrow-nudged WITHOUT entering Customize** —
  `editable={!stacked}`, and only the Hide badge is gated on `customizing`. The redesign preserves
  that exactly, so `Customize` keeps being what it actually is: a *pin the controls visible* toggle,
  not a mode gate. The hint copy already says "Drag any panel by its handle", which is true at all
  times.
- **States:** no empty/loading/error of its own. The trial-expired notice is the nearest thing to a
  lock and is preserved verbatim, including the test-enforced rule that **at most one** notice sits
  above the board (promo **or** trial-expired **or** verify).
- **Motion (3/3):** the whole header is `[data-reveal]` → now 12px / 0.55s; `.dx-dot`'s `dx-pulse`
  → kept by name; the `background`/`border-color` `0.15s` transitions on Customize / Reset / chips →
  re-timed to `var(--bf-dur-hover) var(--bf-ease)` and extended to `color` so the invert reads as one
  move. **Added state, transient:** arriving from the v3.0 product-update entry's "show me where it
  is" path adds `.hs-upd-spotlight` to the meta line (3px `#2f6bff` outline at 6px offset, radius
  12px, `hs-upd-pulse 1.1s ×3`) for 4200ms — recorded here because it is a real dashboard state the
  record had no entry for, and it is disabled under reduced motion by
  `hs-update-modal.css:195`. Skeleton: `.dash-skel-head`'s three bars (own screen).
- **Tests touched:** `App.test.tsx:1157` (Customize and Reset hidden when stacked) — passes
  unchanged; `App.test.tsx:1208` (`[data-tutorial-id="dashboard-setup-banner"]` exists, its text
  matches `/workspace/`, `.business-context-banner` is gone) — passes unchanged;
  `App.test.tsx:1268` (`.business-context-verify` null and
  `.hs-home-promo` + `.business-context-verify` + `.business-context-banner` ≤ 1) — passes
  unchanged. The names `Customize` (exact `/^Customize$/`), `/Reset layout/`, `Hidden panels`,
  `Hide Weather Impact` and `Show Weather Impact` are all on the pin list.

## Gantt promo banner (`hs-home-promo`)

- **Today:** A purple `#efe8f8` block (ink `#3b1d70`, body `#4c2a86`, **no border**, radius 8px)
  with an `h2`, a paragraph and two actions, time-boxed to `GANTT_PROMO_UNTIL = 2026-10-06`.
- **Becomes:** A paper card at **18px** with `1px solid rgba(28,28,26,0.07)` and `--bf-shadow-card`,
  on the flat ground — **not** a coloured band, because "one ground, no banding" is the rule the
  page is being measured against. The purple survives as the accent *inside* it: an eyebrow
  `#6d28d9` and a `#6d28d9` icon, with the `h2` at `--bf-app-section` `#1c1c1a` and the body at
  `--bf-app-row` `#575550` capped at 62ch. **Declared visible change** — a filled violet band is the
  single loudest contradiction of the language on this page, and the pill+eyebrow treatment keeps the
  announcement legible as a distinct object while the ground stays one colour.
- **Every information item placed (4/4):** (1) `h2` "Try the new Gantt Chart" → verbatim; (2) the
  body "Every job on one timeline, grouped by project. Drag a bar to move a job or an edge to change
  its dates." → verbatim; (3) the three gating conditions (`announcementIsLive(dashboardToday)` with
  `GANTT_PROMO_UNTIL`, `bf:home:promo:gantt !== 'dismissed'`, and
  `billingStatus !== 'trial_expired'`) → untouched; (4) the purple treatment → re-expressed as
  above. Plus `aria-label="Product announcement"` on the `<section>` (from the record's
  completeness check) → kept.
- **Every action placed (2/2):** "Open the Gantt Chart" (`.hs-home-promo-action`, `ArrowRight`) →
  `setPage('gantt')`, restyled as a **slide** link (icon `translateX(3px)`); the `×`
  (`.hs-home-promo-close`, `aria-label "Dismiss this announcement"`) → `dismissPromo()` + the
  per-device localStorage write. Both hover states (`:1464`, `:1483`) kept and re-timed.
- **States:** absent when any of the three gates fails. No empty/loading/error/lock.
- **Motion (1/1):** `hsh-rise 0.5s cubic-bezier(0.22,1,0.36,1) both` → **name kept**, curve
  re-expressed as `var(--bf-ease)`, and it stays disabled by the existing `hs-home.css:1741`
  reduced-motion block. It is **not** converted to `data-reveal` (that would spend one of the six and
  would put a reveal on a conditionally-mounted node).
- **Tests touched:** `announcements.test.ts:5` and `:10` — pass unchanged (pure date logic);
  `App.test.tsx:1268` — passes unchanged (`.hs-home-promo` keeps its class name and stays one node).

## Schedule Status band (`ScheduleStatusBand`, full `.ss-band`)

- **Today:** On the Dashboard `hs-home.css:1034` re-frames it flat — `1px solid --hsh-line`, radius
  8px, `#fff`, `box-shadow: none` — and `:1046` neuters its hover to `transform: none` with a
  `0 1px 3px` shadow. **The 18px lifting band with the `0 14px 34px` shadow exists only on Schedule
  and Reports.** Its `.ss-figure strong` renders at `clamp(44px,6vw,64px)/750` on all three pages.
- **Becomes:** The flattening is **reversed on the Dashboard**, because `schedule.css`'s original
  values *are* the language: radius **18px**, `1px solid rgba(28,28,26,0.07)`, `#fff`,
  `--bf-shadow-card` (`0 10px 30px rgba(28,28,26,0.05)` — the paper card's shadow, replacing
  `0 14px 34px rgba(28,28,26,0.06)`), and the **lift is restored** at `--bf-lift-dense` (−4px) with
  `--bf-shadow-card-hover`. The licence permits the lift because the band's rows navigate. Type:
  `.ss-figure strong` **keeps `clamp(44px,6vw,64px)` and `-0.03em`**, weight `750 → 700` (the ladder
  has no 750 rung); `.ss-figure span` keeps `clamp(18px,2vw,24px)/600`; `.ss-eyebrow` `12px/700/
  0.06em/#575550` → the **11.5px/650/0.045em/#8a877e** eyebrow; `.ss-asof` → `--bf-app-meta`
  `#8a877e`; `.ss-facts dt` → eyebrow; `.ss-facts dd` → `--bf-app-figure-sm` (22px) weight
  `750 → 700` + `tabular-nums`; `.ss-facts dd em` → `11.5px #8a877e`; `.ss-project-name` →
  `--bf-app-row-strong`; `.ss-project-pct` / `.ss-project-days` → `--bf-app-row` + `tabular-nums`;
  `.ss-project-finish` → `--bf-app-meta` `#8a877e`; the `.ss-project-track` becomes a 999px track
  (`rgba(28,28,26,0.07)`) with a `#2f6bff` fill, `--ss-progress` untouched. Padding `22px 24px 20px`
  kept. **All of it is scoped `.bf-shell .dash-rx.hs-home …`** so Schedule and Reports are unchanged
  until their clusters land (O3).
- **Every information item placed (8/8):** (1) the eyebrow (`.dx-dot` + "Schedule Status") →
  verbatim; (2) the as-of line "Forecast from reported pace · `<formatted asOf>`" → verbatim;
  (3) the headline figure (`|daysAhead|` + `day`/`days` + `ahead`/`behind`, with `.is-ahead` /
  `.is-behind` recolouring) → verbatim, `is-behind` → `#c5221f`; (4) the week-over-week delta
  (`.ss-delta.up/.down`, `TrendingUp`/`TrendingDown`, "Improved"/"Slipped" by N day(s) from last
  week, where "improved" means the gap moved toward on-time on either side of plan) → verbatim;
  (5) the no-prior-snapshot line `.ss-delta.is-muted` "Tracking from this week — the first
  comparison lands next week" → verbatim; (6) all four facts — "Portfolio complete" → N% with an
  optional "+N pts" em; "Projects behind" → N with "of N"; "Reporting jobs" → N with "of N";
  "Portfolio value" (only when projects were passed) → compact currency with either
  "`<compact>` to go" or "N of N not priced" → verbatim, **including the four edge cases the
  record's completeness check adds**: an em dash `—` when projects are passed but none are priced,
  "`<compact>` to go" only when `priced > 0 && unpriced === 0`, "N of N not priced" whenever
  `unpriced > 0`, `compactMoney` at 0 fraction digits ≥$10M else 1, and a negative `percentDelta`
  rendering as "−N pts" with the em dropped entirely at 0 or null; (7) the per-project list — name,
  track, percent, `+Nd`/`−Nd` with `.ahead`/`.behind`, `CalendarDays` + forecast finish → verbatim;
  (8) the portfolio-value maths → untouched. Plus `aria-label="Schedule status"` on the **full**
  band (not only the failed strip) → kept.
- **Every action placed (2/2):** any `.ss-project` row → `onOpenProjects()` → `setPage('projects')`
  — the row is the lift target; `.ss-retry` → refetch `/api/schedule/status` with its attempt
  counter. Unchanged.
- **States:** empty → on the Dashboard the band **returns `null`** while loading or with no
  portfolio / no dated projects, so **nothing is shown at all** → unchanged, no placeholder
  invented. (The compact `.ss-strip.ss-empty` copy belongs to the Schedule landing cluster.)
  Loading → nothing on the Dashboard; the reveal `MutationObserver` picks the band up when it mounts
  — **this is why that observer must survive the reveal-budget edit**. Error →
  `.ss-strip.ss-failed` (`role="status"`, `aria-label "Schedule status"`) with `AlertTriangle` +
  "Schedule status couldn't load." + `Retry` → copy verbatim, glyph `#c5221f`, Retry as an inverting
  outline pill. No lock.
- **Motion (3/3):** `[data-reveal]` on the band → **2 of the page's 6**, now 12px / 0.55s; the
  hover lift → **restored** at −4px (the record's claim that it lifts today is wrong on this page —
  see §1.1-adjacent correction); `dx-pulse` on the eyebrow dot → kept by name. Hover move: **lift**
  on the band, and the project rows get the wash + a 3px slide on the forecast-date side.
  Skeleton: `.dash-skel-strip`'s 128px `--cc-blue-soft` block at 0.55 opacity (own screen).
- **Tests touched:** `App.test.tsx:1133` (says so and offers Retry when status cannot load) —
  **passes unchanged**; `schedule/tour.ts:45` targets `data-tutorial-id="schedule-status-band"` —
  the anchor is untouched, and **the band must not become a reveal-transformed ancestor of itself**:
  it already is a reveal target, so the tutorial step that spotlights it can only run after the
  reveal has fired. That is true today and stays true; it is noted so nobody "optimises" the
  observer away.

## Panel board (`DashBoard`) — the drag/resize grid

- **Today:** A 6-column / 40px-row grid holding 12 absolutely-positioned panels. `.dash-block`
  itself has **no background, border or radius** — it is `position: relative` only; the white 8px
  card is the panel's inner body, and five panels have no card at all. Grip in the gutter, dotted
  resize corner, hover-revealed controls, a grey cell grid and a dashed placeholder while dragging.
- **Becomes:** **Geometry frozen, all of it** (§4). What changes is species and consistency:
  - The panel's frame stays at the **body** level and becomes the paper card: radius `8px → 18px`,
    border `#e6e8f0 → rgba(28,28,26,0.07)`, `box-shadow: none → --bf-shadow-card`, on
    `.cc-panel > .cc-list`, `.hs-card`, `.cc-quick` — **and, newly, on `.cc-legacy-panel`** at
    `padding: 14px 16px` so the five frameless panels stop sitting bare on the ground (§4 spells out
    the +30px chrome consequence and why stored boards are safe).
  - The header stays **outside** the card, `margin: 0 0 10px`, `h2` **frozen at 15px/700** with
    tracking → `-0.01em` and colour → `#1c1c1a`. The 16px icon → `#8a877e`.
  - `.dash-block` gets **no hover lift** — it is a drag target and a lift fights the grip. It gets
    `SpotlightSurface` instead (radius 220px, alpha 0.06, reading the root's `--mx/--my`, zero new
    listeners), which is the fourth hover move re-scaled from a 1200px-perspective tilt to a
    low-amplitude radial highlight. **`SpotlightSurface` must never be given `data-reveal`** —
    `.dash-block` takes `is-dragging` / `is-resizing` / `is-landing` dynamically and a dynamic
    className on a reveal target wipes the imperative `.in` forever.
  - Controls: grip 26px at radius 12px, rest `#6b7590 → #575550`, hover
    `rgba(28,28,26,0.05)` + `#1c1c1a`; the `::after` "Drag to move" tooltip becomes the ink pill
    (`#1c1c1a`/`#fdfcf9`, radius 8px, `11.5px/600`) so it matches `RailTooltip`; `.dash-hide` 26px
    circle → an inverting outline chip; `.dash-resize`'s dotted triangle keeps its radial-gradient
    dots and `clip-path`, turning `#2f6bff` on hover; `.is-customizing`'s dashed outline →
    `1px dashed rgba(47,107,255,0.4)` at 6px offset, unchanged.
  - `.bf-doc-bleed` on `.dash-board` at ≥1281px only, so six columns get 1140–1180px instead of
    880px and a KPI tile clears 128px. Below that the board stays inside the 880px column.
- **Every information item placed (11/11):** (1) `DASH_LAYOUT_DEFAULT`'s twelve positions →
  **frozen, verbatim**; (2) `dashPanelLimits` (minW 3 for stats/kpis/quick, minW 2 otherwise, minH 2,
  maxW 6) → frozen; (3) `DASH_STACKED_ORDER` (today, quick, kpis, approvals, alerts,
  recommendations, weather, stats, readiness, conflicts, inspections, apps) → frozen; (4) the grip's
  full contract (`GripVertical` 16px, `left: -22px/-6px`, the `::after` tooltip, its `aria-label
  "Move <Title>. Arrow keys move it one cell; hold Shift to resize."`, its `title`, and its
  `aria-keyshortcuts` listing all eight arrow combinations) → **every string verbatim**; (5) the Hide
  badge (`EyeOff` 14px, 26px circle at `-8px/-8px`, `aria-label "Hide <Title>"`, its `title`, only
  while customizing) → verbatim; (6) the resize handle (`aria-label "Resize <Title>"`,
  `title "Drag to resize"`, `opacity: 0` until hover / customizing / resizing) → verbatim; (7) the
  widget header and its **eight** icons (quick=SlidersHorizontal, stats=Gauge, kpis=HardHat,
  readiness=Boxes, weather=CloudSun, conflicts=Wrench, inspections=CalendarDays,
  today=CalendarClock) plus the four panels that render their own heading (apps, approvals, alerts,
  recommendations) → verbatim; (8) the body's measured a11y contract (`role="region"`,
  `aria-label "<Title> contents"`, `tabIndex 0` and `.is-scrollable` **only** when
  `scrollHeight > clientHeight + 1` via ResizeObserver, `tabIndex -1` otherwise) → **untouched, and
  the `:focus-visible` ring it depends on is re-based to `var(--bf-focus-ring)` while keeping
  `overscroll-behavior: contain`**; (9) the editing chrome (`.is-editing` + `.is-move`/`.is-resize`,
  the `.dash-cells` grid of `rows*6` `aria-hidden` spans, the dashed `.dash-placeholder`
  `2px dashed #8b95ab` on `rgba(232,240,254,.7)`) → kept, placeholder re-coloured to
  `2px dashed rgba(47,107,255,0.45)` on `rgba(47,107,255,0.06)` so the board's one editing colour is
  the accent; (10) the computed board height `rows*40 + (rows-1)*16` (+3 rows while dragging) →
  frozen; (11) `.dash-board-live` (`role="status"`, `aria-live="polite"`, visually hidden) → its own
  screen.
- **Every action placed (7/7):** pointer-drag the grip to MOVE with the full `snapDragCell`
  contract (HALF_COLS 3; outer third → half width in that half; middle third or past either side
  edge → full width; past the top → half width on row 0; past the floor → half width there;
  neighbours pushed above where that fits, else below, then compacted upward) → **untouched**;
  pointer-drag the corner to RESIZE (`snapDelta` rounding, width capped by the room to the right,
  overlapped panels pushed down then compacted) → untouched; keyboard on a focused grip
  (Arrow = move one cell, Shift+Arrow = resize one cell) → untouched; the Hide badge →
  `panelLayout.hide(id)` → untouched; commit on pointerup with the `.is-landing` 900ms flag →
  untouched; fit-to-content on a **fresh (unstored)** board only, with its `rAF` pass reading
  `getComputedStyle` padding, `block.offsetHeight - body.clientHeight` for the chrome and
  `content.offsetHeight/scrollHeight`, converting via `rowsForHeight(px) = ceil((px+16)/56)`,
  clamped to `minH..14`, kept in memory and never saved → **untouched, and §4 states exactly what the
  +30px of new chrome on five panels does to it**; the ≤900px stacked mode (all drag/resize/nudge
  become no-ops, bodies go `overflow: visible`, panels render in `DASH_STACKED_ORDER`) → untouched,
  **and the 900px breakpoint's four independent declarations move together or not at all**
  (`DashBoard`'s `matchMedia`, `Dashboard`'s `stackedBoard` `matchMedia`, `hs-home.css:1938+`, and
  the skeleton's `hs-home.css:2070`) — this mapping does not move it.
- **States:** no empty/loading/error at board level. Not add-on gated. The page-wide cursor
  overrides during a drag (`.is-rearranging * { cursor: grabbing !important }` and
  `.dash-board.is-resize * { cursor: nwse-resize !important }`) are **kept**, `!important` included —
  they predate the new file, and `density.test.ts`'s `!important` ban applies only to
  `app-shell-daylight.css`.
- **Motion (11/11):** `.dash-block`'s `top/left/width/height` `0.26s cubic-bezier(0.22,1,0.36,1)`
  → **already the right curve**, re-expressed as `var(--bf-ease)`; `.is-dragging`'s `z-index: 30`,
  0.18s width transition, `drop-shadow(0 26px 40px rgba(20,32,58,.22))` + `0 6px 12px` and
  `cursor: grabbing` → the shadow ink re-based to `rgba(28,28,26,…)`, everything else kept — **this
  is the drag-lift that replaces a hover-lift**; `.is-resizing`'s 2px `#2f6bff` outline with
  `transition: none` → kept; `.is-landing`'s `dash-land 0.75s` blue ring pulse → kept by name;
  `.dash-cells`' `hsh-fade-in 0.18s` → kept by name; `.dash-placeholder`'s `hs-dropslot-in 0.22s` +
  its 0.18s geometry transitions → kept by name; the grip tooltip's `0.12s` reveal (suppressed while
  `.is-rearranging`) → re-timed to `var(--bf-dur-press)`; `.is-customizing`'s dashed outline → kept;
  the lifted-card look for stat/kpi drags (dashed outline, `visibility: hidden` children, the
  grey-tile SVG data-URI background) → kept, **and its `background-color: var(--hsh-paper)` gets the
  fallback it never had** (`--hsh-paper` is used at `hs-home.css:1295` and **defined nowhere**, so
  the declaration is invalid at computed-value time and the tile sits on a transparent ground —
  fixed to `var(--hsh-paper, #f5f6fa)`); `.dash-ghost` (the DragOverlay clone: full-size white card,
  `0 26px 60px rgba(20,32,58,.26)`, `DASH_DROP_ANIMATION` 260ms) → shadow re-inked, radius 8 → 18px
  to match its source, and **the `[data-dash-drag-id]` querySelector clone trick with its
  id/transform stripping and its `.dx-tilt { transform: none !important }` is untouched**; the
  `prefers-reduced-motion` block at `hs-home.css:1948-1961` → **extended in place**. Reveal: **the
  board is never a reveal target** (§3.1). Skeleton: `.dash-skel-board` (own screen).
- **Tests touched:** `App.test.tsx:1234` (stacked order via `.dash-block h2`) — passes unchanged;
  `App.test.tsx:1361` (overflowing body tabbable, fitted body not) — **passes unchanged, and is the
  test that makes §4's "stored boards scroll rather than clip" claim checkable**;
  `App.test.tsx:1479` (hide → Hidden panels → one PUT) — passes unchanged; `App.test.tsx:1457`
  (account board hydrated to the device, Reset PUTs `''`) — passes unchanged;
  `dashGrid.test.ts` — **19 `it(` blocks** (the record says 20; there are 19 at lines 24-214) —
  **all pass unchanged, because not one engine constant, function or id moves.**

## Board persistence (`usePersistentLayout` / `usePersistentOrder`)

- **Today:** The board lives on the account as the user setting `dash:layout` and is mirrored to
  `bf:dash:layout:<userId>`, with stat and KPI orders in their own device keys.
- **Becomes:** **Nothing. Zero edits, zero migration.** This screen is in the mapping so the answer
  to the cluster warning is on the record next to the mechanism it concerns.
- **Every information item placed (6/6):** (1) `StoredBoard = { items, hidden }` plus the
  bare-array back-compat path in `parseStoredBoard` → untouched; (2) the read order (account copy
  from `serverUserSettings['dash:layout']`, hydrated into the device key on read, then the device
  copy) → untouched; (3) `bf:dash:stats:<userId>` default `['st-sched','st-ontrack','st-labor']` →
  untouched; (4) `bf:dash:kpis:<userId>` default
  `['kpi-jobs','kpi-crews','kpi-equip','kpi-delayIQs']` → untouched; (5) `layoutCustomized`'s
  three-way definition gating Reset → untouched; (6) `reconcileLayout` keeping known positions,
  silently dropping unknown ids and appending new defaults below → untouched, **and no panel id is
  renamed, so no saved board loses a panel.**
- **Every action placed (4/4):** the immediate device write + the 600ms debounced account PUT with
  its unmount flush and swallowed failure; Reset writing an **empty string** to
  `/api/me/settings/dash:layout` and removing the localStorage key; the one-time push of a
  device-only board up to the account when the person changes; and every read/write being
  try/catch-wrapped. All four untouched. (Recorded from the completeness check: the key is
  URL-encoded on the wire — `/api/me/settings/dash%3Alayout` — while the test asserts the
  unencoded string; that is a test-fixture detail, not a behaviour, and it is not touched.)
- **States:** none — persistence has no rendered state of its own.
- **Motion:** none, and none added.
- **Tests touched:** `App.test.tsx:1457` and `App.test.tsx:1479` — **pass unchanged.**

## Panel 1 — Today's plan (`today`)

- **Today:** The first panel on the board (0,0 3×6): crews with work today in start-time order, then
  active jobs nobody is on. **Frameless** — `.cc-legacy-panel` gives it only `display: grid; gap: 10px`.
- **Becomes:** Gains the paper card (18px, `rgba(28,28,26,0.07)`, `--bf-shadow-card`,
  `padding: 14px 16px`) — one of the five §4 covers. Header outside the card (`CalendarClock` 16px +
  15px/700). Crew group `h3` → `--bf-app-row-strong` (13.5px/600) with its lead suffix at 500
  `#575550`; group heads separated by a `rgba(28,28,26,0.07)` hairline rather than whitespace alone.
  Rows: the `<time>` start in `#2f6bff` `--bf-app-row` + **`tabular-nums`** in a 64px column (the
  64px + 1fr row layout is kept), the phase in `--bf-app-row-strong`/600 `#1c1c1a`, the meta line in
  `--bf-app-meta` `#575550`. The unassigned group keeps its amber treatment
  (`--cc-amber #b45309` / `--cc-amber-soft #fdf0dc`) — **it reads `--cc-amber`, not `--wx-amber`, so
  decision #3 does not touch it.** Rows get **no hover state** (they are not clickable).
- **Every information item placed (6/6):** (1) the header → as above; (2) one
  `<section className="cc-today-group" aria-label="<Crew> today">` per crew with work today, sorted
  by earliest start → verbatim; (3) the crew `h3` with its ` · <lead name>` muted suffix → verbatim;
  (4) the job row (`<time dateTime={today}>` start or `—`, the phase falling back to the name, and
  the meta joining project + location with ` · ` plus ` · until <endTime>` when present) →
  verbatim; (5) the unassigned group (`.is-unassigned`, `aria-label "Unassigned today"`, `h3`
  "Unassigned today" + " · N active job/jobs with no crew", amber heading, amber time, amber-tinted
  rows) → verbatim; (6) "only crews with at least one job today; jobs looked up from a
  `globalThis.Map`" → **untouched, and the `globalThis.` qualifier stays** (`Map` is a lucide import
  in App.tsx). Also placed: `projectName()`'s `"Unassigned"` fallback for an unknown `projectId`.
- **Every action placed (1/1):** the "Week board" link (`.cc-link.cc-legacy-more`,
  `aria-label "Open the Week board"`) → `setPage('week')`. Becomes a **slide** link in the header's
  right slot, `12.5px/600` outline chip → 999px inverting pill.
- **States:** empty → `InlineEmptyState` (`CalendarClock`): title "Nothing on the board today",
  detail "Book crews onto jobs from the Week board and the day shows up here." → **copy verbatim**;
  the shared `.inline-empty-state` becomes glyph `#8a877e` 22px, title `--bf-app-row-strong`, detail
  `--bf-app-meta` `#575550` at 62ch, no frame of its own (it is inside the panel's card). No
  loading/error/lock.
- **Motion (1/1):** inherits the board transitions; **no panel-specific keyframes and none added**;
  its `data-reveal` was never present. Hover: none. Skeleton: a `.dash-skel-block` at 0,0 3×6.
- **Tests touched:** `App.test.tsx:1387` (region `/Concrete Crew 1 today/`, "7:00 AM",
  `/Riverside Office Building · Downtown, Austin/`, the `h3` lead suffix, **"Today's plan" as the
  FIRST `.dash-block h2`**, and the "Open the Week board" button) — **passes unchanged**;
  `App.test.tsx:1412` (region "Unassigned today", `h3 /2 active jobs with no crew/`, 2 listitems) —
  **passes unchanged.**

## Panel 2 — Project Alerts (`alerts`)

- **Today:** Its own `.cc-panel-head` heading, a framed `.cc-list` body, and at most three rows: the
  newest open delay, the newest weather alert, the newest short material.
- **Becomes:** The paper card at 18px on `.cc-panel > .cc-list` (`padding: 16px 18px` kept).
  Heading (`AlertTriangle` 16px + 15px/700 `#1c1c1a`) stays outside it. Rows: the toned icon square
  → radius 12px (a fill, not a boundary), `strong` → `--bf-app-row-strong`, the meta → `--bf-app-meta`
  `#575550`, the right-aligned `<time>` → `11.5px #8a877e` + `tabular-nums`. Row separators become
  `rgba(28,28,26,0.07)` hairlines. Rows are not clickable → **no hover state**.
- **Every information item placed (5/5):** (1) the heading → as above; (2) the `.cc-alert` row shape
  (toned icon square `.tone-red/.tone-amber/.tone-blue`, bold title, muted meta, right-aligned
  `<time dateTime>` via `relativeTime()`) → verbatim, **and `relativeTime()`'s full value set is
  placed**: "just now" · "Nm ago" · "Nh ago" · "Nd ago" · "in Nm" · "in Nh" · "in Nd", a
  `YYYY-MM-DD` value read at 12:00 local, and **an unparseable timestamp returning `''` so the
  `<time>` renders empty** — the new type rules must therefore not rely on the element having
  content (no `::before` bullet, no fixed min-width that would leave a gap); (3) row 1 (red,
  `AlertTriangle`, the first open delayIQ: its title, "`<Project>` · N day impact", `reportedAt`) →
  verbatim; (4) row 2 (amber, `CloudSun`, the first weather alert: "Weather delayIQ expected",
  "`<Project|All sites>` · `<alert title>`", `startsAt`) → verbatim — **and the record's correction is
  honoured: this row uses `data.weatherAlerts` UNFILTERED, so it can show a weather alert that the
  Weather Impact panel deliberately hides**; no styling change hides that, and it is listed as an
  open question (O5) rather than "fixed"; (5) row 3 (blue, `Truck`, the first Missing / Waiting on
  Delivery material: "Material delivery delayIQed", "`<Material>` · `<Project>`", `deliveryDate`) →
  verbatim.
- **Every action placed (1/1):** "View all" (`.cc-link`, `aria-label "View all project alerts"`) →
  `setPage('delayIQs')`. Slide link in the header's right slot.
- **States:** empty → `<p className="cc-empty-line">No active alerts right now.</p>` → **copy
  verbatim**, `--bf-app-row` `#575550` at 62ch. No loading/error/lock.
- **Motion (1/1):** the body is `[data-reveal]` today → **removed** (it is one of the five over
  budget, §3.1); the panel now renders immediately. Hover: none. Skeleton: a `.dash-skel-block` at
  3,0 3×4.
- **Tests touched:** `App.test.tsx:1289` ("Heavy Rain DelayIQ" inside the panel and at least one
  `time[datetime]` in the block) — **passes unchanged**; `App.test.tsx:1361` uses this panel's body
  as the overflowing region — **passes unchanged**, and it is the reason the `.is-scrollable`
  measurement must keep working after the padding change (it does: the measurement is dynamic).

## Panel 3 — AI Recommendations (`recommendations`)

- **Today:** Its own heading, a framed list of up to 4 DelayIQ early warnings, each with a severity
  chip, a meta line and a Review button.
- **Becomes:** The paper card. Heading `Sparkles` 16px + 15px/700 — **the `Sparkles` glyph stays
  `#8a877e` like every other panel icon; it does not get the gradient** (the trio's one in-app
  licence is the top-bar sparkle, §1.6). Row: icon square radius 12px, title `--bf-app-row-strong`,
  the severity chip `.cc-sev.cc-sev-<severity>` → a 999px pill at `--bf-app-micro` (11px/700) with
  its existing tone fills (**value set: High red / Medium amber / Low green**), meta →
  `--bf-app-meta`, and `Review` → a 999px inverting outline pill at `12.5px/600`.
- **Every information item placed (5/5):** (1) the heading → as above; (2) the `.cc-rec` row shape
  (`AlertTriangle` when the job is on the critical path else `TrendingUp`; the severity chip; the
  bold title; the muted meta; the Review button) → verbatim; (3) the title ("the job name, or
  `<Job> — <Project>` when they differ") → verbatim; (4) the meta ("N working day/days behind pace"
  or "late to start" for an `overdue_start` risk, then " · pushes `<Job A>`, `<Job B>`" and "+N"
  beyond two) → verbatim; (5) "refetches when `earlyWarningTick` changes or `data.jobs.length` /
  `data.assignments.length` change" → untouched.
- **Every action placed (3/3):** "View all" (`aria-label "View all early warnings"`) →
  `setPage('delayIQs')`; per-row `Review` (`.cc-rec-btn`, `aria-label "Review <title>"`) →
  `setPage('delayIQs')`; "Try again" in the failed state → bumps `earlyWarningTick`. All three
  unchanged.
- **States:** empty (ready, nothing to say) → "No jobs are trending behind. Nothing to recommend
  today." → verbatim; loading → "Checking the schedule…" while `state === 'loading'` with no payload
  → verbatim; error → the `.hs-home-empty` block "Couldn't check for early warnings." +
  `.hs-home-empty-btn` with `RefreshCcw` reading "Try again" → verbatim, the block becoming a
  hairline-topped section (no second frame) with the button as an inverting outline pill. **Plus the
  state the record missed and this mapping must render:** `earlyWarning` is never cleared on
  failure, so a failed **refetch** shows the error block **above the previous recommendations**. The
  new file gives that combination an explicit treatment — the error block sits above a
  `rgba(28,28,26,0.07)` hairline with the stale list below at `opacity: 0.62` — so a stale list
  reads as stale instead of as current. **This is a visual change to an existing state, not a new
  state**, and it is listed in §12 R5 for sign-off because it changes what a person infers.
  No lock (AI never locks a page).
- **Motion (1/1):** the body is `[data-reveal]` → **removed** (over budget). The `.cc-sev` chips are
  static pills. Hover: **invert** on Review, **slide** on View all. Skeleton: `.dash-skel-block` at
  3,4 3×5.
- **Tests touched:** `App.test.tsx:1068` (says so when nothing is trending behind) — passes
  unchanged; `App.test.tsx:987` ("Drywall — Riverside Office Building",
  `/3 working days behind pace · pushes Paint/`, and that the invented copy "Re-sequence drywall",
  "Add 1 carpentry crew", "Lookahead Risk Scan", "Active AI Workflows" **never appears**) — passes
  unchanged, **and the new file introduces no placeholder copy of any kind**;
  `App.test.tsx:1314` (a button named `/^Review Drywall/`) — passes unchanged.

## Panel 4 — Pending Approvals (`approvals`)

- **Today:** Its own heading, a segmented Open/Resolved toggle, and a framed list of variance rows
  with Approve/Reject or a status chip. **Its heading "Pending Approvals" is the dashboard's ready
  signal in ~15 tests.**
- **Becomes:** The paper card. Heading `ClipboardCheck` 16px + 15px/700. The segmented control
  (`.hs-home-seg`, `role="group"`, `aria-label "Approval view"`) becomes a 999px **pill pair**:
  outline rest, `#2f6bff` fill + `#fff` on `.active`, `aria-pressed` untouched — the invert move at
  segment scale. Rows: `.cc-appr-dot` kept as a fill; title `--bf-app-row-strong`; meta
  `--bf-app-meta` `#575550`; the drift figure `--bf-app-row-strong`/700 + **`tabular-nums`**; the
  `<time>` `11.5px #8a877e`. Action buttons keep `min-width: 92px` and their right alignment;
  `Approve` → blue primary pill, `Reject` → inverting outline pill.
- **Every information item placed (9/9):** (1) the heading → as above; (2) the segmented toggle →
  as above; (3) the `.cc-approval` row shape (dot, main block of bold title + muted meta, side block
  of bold drift + relative `<time>`) → verbatim; (4) the title (variance job phase → job name →
  "Unknown job") → verbatim; (5) the meta ("`<Project>` · `<severity>` severity" plus " · critical
  path") → verbatim, with `projectName()`'s "Unassigned" fallback placed; (6) the side figure
  ("On plan" at 0 drift, else "+N working day/days" late or "−N working day/days" early) →
  verbatim; (7) the timestamp (`detectedAt` pending, `resolvedAt` falling back to `detectedAt`
  resolved) → verbatim; (8) the two list rules (Open = every pending variance newest `detectedAt`
  first; Resolved = the 12 most recent non-pending newest `resolvedAt` first) → verbatim; (9) the
  resolved status chip `.cc-sev.cc-sev-<status>` reading "accepted" / "rejected" → verbatim, **and
  the third value the record missed is placed: `superseded`**, which `hs-home.css:1997` already
  styles amber (`--cc-amber-soft` / `--cc-amber`) — so the chip's real value set is
  accepted (green) / rejected (red) / superseded (amber), and all three get the 999px pill.
- **Every action placed (6/6):** the Open / Resolved segments → `setApprovalView`; "View all"
  (`aria-label "View all approvals on the schedule page"`) → `setPage('schedule')`; `Approve`
  (`.cc-btn.primary`, `aria-label "Approve the <title> variance"`) → `POST
  /api/schedule/variances/<id>/accept` then `reload()`, with the label becoming "Saving…" and both
  buttons disabling; `Reject` (`.cc-btn.ghost`, `aria-label "Reject the <title> variance"`) → the
  reject POST then `reload()`; the single-flight `resolvingVarianceId` guard; and the empty-state
  button toggling views ("See resolved" / "Back to open" with `ArrowRight`). **All six unchanged —
  no note field is added and `movedJobIds` is still discarded** (the API returns it; surfacing which
  jobs the CPM ripple moved would be a feature, so it is O6, not a change).
- **States:** empty → `.hs-home-empty` "No approvals waiting on you" (Open) / "Nothing has been
  resolved yet" (Resolved), each with its `.hs-home-empty-btn` → copy verbatim, block becomes a
  hairline-topped section, button an inverting pill; loading → "Saving…" + both disabled (opacity
  0.55, no spinner added); error → `<p className="cc-appr-error" role="alert">Could not
  <accept|reject> it: <message>. Nothing changed.</p>` → **copy and role verbatim**, re-based to
  `rgba(197,34,31,0.08)` with `#c5221f` text at 62ch. No lock.
- **Motion (1/1):** the body is `[data-reveal]` → **removed** (over budget). Hover: **invert** on
  Approve/Reject/segments, **slide** on View all. Skeleton: `.dash-skel-block` at 0,6 3×6.
- **Tests touched:** `App.test.tsx:987` ("Concrete - Level 3 Slab", "+3 working days",
  `/Riverside Office Building · High severity · critical path/`, the named Approve button) — passes
  unchanged; `App.test.tsx:1032` (accept POST, "No approvals waiting on you", the row moving to
  Resolved with the text "accepted") — passes unchanged; `App.test.tsx:1337` (reject POST,
  "rejected") — passes unchanged; `App.test.tsx:495` / `:550` use the heading **"Pending
  Approvals"** as the ready signal — **that exact string is frozen and is on the pin list.**

## Panel 5 — Quick Actions (`quick`)

- **Today:** One framed card (`.cc-quick`, `padding: 14px 16px`) of six 40px pill buttons at 11px
  radius, `13.5px/600`, white with a soft shadow.
- **Becomes:** The card goes to 18px + `--bf-shadow-card`. The buttons go to **999px pills**
  (`--bf-radius-pill`, 36px tall, `13px/600`, `padding: 0 14px`, icon 15px `#575550`) that **invert**
  to `#1c1c1a`/`#fdfcf9` on hover — retiring the 11px radius, which is not on the ladder, and
  retiring the per-button shadow (a pill inside a card does not need one). Grid wraps as it does now.
- **Every information item placed (3/3):** (1) the header (`SlidersHorizontal` + "Quick Actions") →
  verbatim; (2) all six buttons with their icons — "Update Progress" (`RefreshCcw`), "Look Ahead"
  (`TrendingUp`), "Rebalance Crew" (`Users`), "Check Weather" (`CloudSun`), "Create Report"
  (`FileText`), "More" (`SlidersHorizontal`) → **verbatim, all six, including "More"**; (3) "the
  whole row sits in one bordered white card" → kept, re-surfaced.
- **Every action placed (6/6):** "Update Progress" → `setPage('field')`; "Look Ahead" →
  `setPage('schedule')`; "Rebalance Crew" → `setPage('crews')`; "Check Weather" →
  `requestDashboardAiAsk('Check the weather outlook for my active jobsites this week and tell me
  which scheduled jobs are at risk from it. Recommend what to move or protect.')` → opens the
  always-mounted AI panel and submits — **the prompt string and the two module-level singletons are
  untouched**; "Create Report" → `setPage('reports')`; **"More" has no `onClick` — a dead control.**
  It is **kept and rendered**, and because it does nothing it is given the **disabled pill
  treatment** (`opacity: 0.45`, `cursor: not-allowed`) rather than a hover invert that would promise
  an action. Honest, reversible, and it does not change the DOM. Removing it is R9.
- **States:** none. (No empty state — the six are hard-coded.)
- **Motion (1/1):** `.cc-quick` is `[data-reveal]` → **removed** (over budget); each button's
  `transform 0.2s cubic-bezier(0.22,1,0.36,1)` + `box-shadow`/`background 0.2s` → re-timed to
  `var(--bf-dur-hover) var(--bf-ease)` and re-pointed at the invert. Hover: **invert**. Skeleton:
  `.dash-skel-block` at 0,12 3×4.
- **Tests touched:** `App.test.tsx:1234` ("Quick Actions" sorts before "Pending Approvals" when
  stacked) — passes unchanged; `App.test.tsx:1361` ("Quick Actions contents" region is `tabindex
  -1` because it does not overflow) — **passes unchanged, and is the one test the pill height change
  could disturb**: 40px → 36px buttons make the body *shorter*, so it stays non-overflowing. Noted
  as a check, not a risk.

## Panel 6 — Performance (`stats`)

- **Today:** Three framed, dnd-kit-sortable stat tiles, each with a 34px toned icon square, a label,
  a 26px value, an inline hand-rolled SVG sparkline and a foot row of trend chip + note.
- **Becomes:** Each `.cc-stat` becomes a paper card at **18px** with `--bf-shadow-card` (licensed:
  the tile is a drag target) and **keeps its hover lift**, re-scaled to `--bf-lift-dense` (−4px)
  from today's −4px with a deeper shadow → `--bf-shadow-card-hover`, on
  `0.32s → var(--bf-dur-move)`. Icon square 34px → radius 12px. Label → the **eyebrow**. Value →
  `--bf-app-figure` (26px, unchanged) / 700 / `-0.02em` + **`tabular-nums`**; its `<small>` suffix →
  `--bf-app-meta` `#575550`. Trend chip → a 999px pill at `--bf-app-micro`: `.up` green, `.down`
  red, `.flat` **deliberately grey** (`rgba(28,28,26,0.05)` ground, `#575550` text — the visual half
  of the honesty rule), `.flag` amber. Note → `--bf-app-meta` `#8a877e`. The sparkline keeps its
  exact geometry.
- **Every information item placed (9/9):** (1) the header (`Gauge` + "Performance") → verbatim;
  (2) tile 1 "Schedule Performance" (`Gauge`, tone blue, "`<N>`%", note "of projects on track",
  `round(onTrack/total*100)` over `scheduleHealth` 'On Track' or 'Complete') → verbatim; (3) tile 2
  "Projects On Track" (`CheckCircle2`, tone green, "`<N>`" + a `<small>` "of `<total>`", note "by
  schedule health") → verbatim; (4) tile 3 "Labor Utilization" (`HardHat`, tone amber, "`<N>`%",
  note "average across crews") → verbatim; (5) the tile chrome → as above; (6) the foot row (trend
  chip with `TrendingUp`/`TrendingDown`/`Minus`/`AlertTriangle` reading "+N pts vs last week",
  "−N vs last week" or "Held vs last week", plus the note) → **every string verbatim**; (7) **the
  honesty rule** — no prior weekly reading → **no trend, no delta and no sparkline at all**, the tile
  shows its value alone → **preserved, and it is test-enforced**; (8) the sparkline (inline SVG
  `viewBox 0 0 100 30`, `preserveAspectRatio="none"`, `aria-hidden`, `.cc-spark-fill` area under
  `.cc-spark-line`, coloured through `tone-*` / `currentColor`) → **untouched, including its
  arithmetic** (`y = 30 − ((v−min)/(max−min || 1))*24 − 3`, `x = i*(100/(n−1))`, fill closing
  `L100,30 L0,30 Z`, and the `spark.length > 1` render guard so a single-point series draws
  nothing); (9) the spark series rule (up to 8 consecutive prior weekly readings plus today; **a
  week with no reading ENDS the line** — nothing interpolated) → untouched.
- **Every action placed (2/2):** drag a tile side to side to reorder (`useSortable`, scope
  `'stats'`, `rectSortingStrategy`, the whole card as the drag surface, order persisted to
  `bf:dash:stats:<userId>`) → untouched; the panel itself moves/resizes like any panel with
  `minW 3` → untouched. **Recorded and preserved knowingly: there is NO keyboard path to reordering
  these tiles** — `useSortable`'s `attributes` are never spread, there is no
  `setActivatorNodeRef`, and only `PointerSensor` is registered, so the `<article>` is not focusable
  and no `KeyboardSensor` exists. Fixing it is a behaviour change (O7); the mapping therefore does
  **not** give `.cc-stat` a `:focus-visible` ring it cannot receive, which would be a lie.
- **States:** empty → no dedicated state: with no data the tiles read "0%" / "0 of 0" and carry no
  trend or spark → **unchanged**; loading → trends fill in after `/api/schedule/status` resolves,
  values shown meanwhile → unchanged; error → a failed status fetch is swallowed and the tiles stay
  trendless → unchanged. No lock.
- **Motion (3/3):** `.cc-stat-grid` is `[data-reveal-stagger]` → **kept — 3 of the page's 6** — with
  child delays `0.04/0.12/0.2s → 0/50/100ms` and shift 22px → 12px; `.cc-stat:hover`'s −4px lift →
  kept, re-tokenised; `DASH_SORT_TRANSITION` 260ms with the dragging tile's dashed grey-tile
  placeholder and `visibility: hidden` children → kept. Hover: **lift**. Skeleton:
  `.dash-skel-block` at 0,16 6×5.
- **Tests touched:** `App.test.tsx:1289` (tiles read 100%, "1 of 1", 80%) — passes unchanged;
  `App.test.tsx:1516` ("+100 pts vs last week", "+1 vs last week", "+10 pts vs last week", and
  **`.cc-spark-line`'s `d` has exactly 2 points**) — **passes unchanged, and is the reason the SVG
  arithmetic is frozen**; `App.test.tsx:1528` ("Held vs last week" on a `.cc-trend.flat`, no
  `/vs last week/` on the other two, `.cc-spark` absent) — **passes unchanged, and is the reason
  `.cc-trend.flat` stays grey.**

## Panel 7 — Operational KPIs (`kpis`)

- **Today:** Four framed, sortable, clickable `KpiCard` buttons (from `schedule/parts/shared.tsx`,
  shared with every schedule page) with a 40px toned icon square, a 12px label, a 28px value and a
  delta line; a click opens that KPI's live feed underneath. Hover adds a `DxTilt` pointer tilt.
- **Becomes:** Each `.kpi-card-button` becomes a paper card at **18px** with `--bf-shadow-card`
  (licensed twice over: it is a `<button>` and a drag target) and gains the **lift** at
  `--bf-lift-dense`, replacing today's hover treatment of `box-shadow: 0 1px 3px` + a border
  darkening. `.active` keeps its blue rim and goes to
  `box-shadow: 0 0 0 3px rgba(47,107,255,0.12)` (already that value). Icon square stays 40px, radius
  `10px → 12px`, glyph forced to 20px as it is today (the authored `size={32}` and the base 66px
  gradient circle are both overridden here and **stay overridden only inside
  `.bf-shell .dash-rx.hs-home`**, so the schedule pages' 66px circle is untouched). Label
  (`.kpi-card p`, 12px/600/`0.02em`, no uppercase) → the **eyebrow** (11.5px/650/`0.045em`/
  uppercase/`#8a877e`). Value (`strong`, 28px/700/`-0.02em`) → kept + **`tabular-nums`**. Delta
  (`span`) → `--bf-app-meta` `#575550`, `overflow-wrap: anywhere` kept for the 390px case.
- **Every information item placed (8/8):** (1) the header (`HardHat` + "Operational KPIs") →
  verbatim; (2) the grid (`repeat(4, minmax(0,1fr))` full-page, `auto-fit minmax(128px,1fr)` inside a
  narrowed panel; 2 columns ≤1080px, 1 ≤720px) → **kept, and this is why the board takes
  `.bf-doc-bleed` at ≥1281px** — four tiles at 128px need the width; (3) tile 1 "Today's Jobs"
  (`HardHat`, tone orange, jobs active today; delta "`<first job name>` +N more" or "No jobs
  scheduled today" + " · `<±N vs last week | same as last week>`") → verbatim; (4) tile 2 "Crews
  Scheduled Today" (`Users`, tone blue, distinct crews with an assignment today; the crew names
  summarised or "No crews scheduled today" + the comparison) → verbatim; (5) tile 3 "Equipment In
  Use" (`Wrench`, tone yellow, status 'In Use'; asset names or "No equipment currently in use" +
  " · N% of fleet") → verbatim; (6) tile 4 "DelayIQed Projects" (`AlertTriangle`, tone red,
  projects with status 'DelayIQed'; project names or "No delayIQed projects" + the comparison) →
  verbatim — **and the record's correction is placed: this tile's comparison uses a DIFFERENT
  baseline** (distinct `projectIds` of non-Resolved delayIQs with `reportedAt` in
  `[weekDays[0].date − 7, weekDays[0].date)`, i.e. the prior calendar week from this week's Monday,
  where the other two compare against `dashboardLastWeekSameDay`); no styling change hides that, and
  it is O8; (7) the card chrome including `aria-expanded` and
  `aria-controls="dashboard-kpi-feed"` → verbatim; (8) `.active` on the open tile → kept. Also
  placed: **"today" is frozen at module load** — `dashboardToday`, `dashboardLastWeekSameDay` and
  `weekDays` are module-level constants, so every "today" count here never rolls over in a
  long-lived tab while the greeting's `hsHour` does. Preserved exactly; O9.
- **Every action placed (3/3):** click a tile → toggle that KPI's feed (`setActiveFeed`), clicking
  the open one closes it; drag to reorder (`useSortable` scope `'kpis'`, persisted to
  `bf:dash:kpis:<userId>`); hover → **`DxTilt`**'s perspective tilt following the pointer (max 7°,
  writing `--rx`/`--ry`) → **kept**. This is the one place in the cluster where the Welcome Page's
  literal *tilt* move survives, so it is not replaced by the spotlight; the two are mutually
  exclusive on the same element, and `DxTilt` wins here.
- **States:** empty → with no data the tiles read 0 with "No jobs scheduled today" / "No crews
  scheduled today" / "No equipment currently in use" / "No delayIQed projects" → **all four
  verbatim**. No loading/error/lock.
- **Motion (4/4):** `.kpi-grid` is `[data-reveal-stagger]` → **kept — 4 of the page's 6** — retimed
  as above; `DxTilt` → kept, and it is still forced to `transform: none !important` inside the drag
  ghost; the `:hover` / `.active` states → as above; `DASH_SORT_TRANSITION` 260ms with the dashed
  placeholder → kept. `:focus-visible` → `var(--bf-focus-ring)`, replacing the two competing rings
  (`dashboard-redesign.css:302`'s `3px rgba(26,115,232,.28)` which currently wins, and
  `styles.css:8623`'s `3px rgba(15,76,129,.24)`) — one ring, on the accent, and it retires two of
  the 14 `#1a73e8`-family literals. Hover: **lift + tilt**. Skeleton: `.dash-skel-block` at 0,21 6×5.
- **Tests touched:** `App.test.tsx:526` (`aria-expanded` flips false→true and the feed regions
  appear) — passes unchanged; `App.test.tsx:1289` ("Today's Jobs" reads 2, "Equipment In Use" reads
  1) — passes unchanged; `App.test.tsx:1234` ("Operational KPIs" before "Pending Approvals" when
  stacked) — passes unchanged.

## KPI live feed panel (`DashboardFeedPanel`)

- **Today:** An inline `role="region"` drill-down rendered under the KPI grid, with an eyebrow, an
  `h2`, a summary paragraph and one row per item, each row a bold title over an `<em>` detail with a
  `Badge` on the right. It is framed (`#fff`, 8px, `--hsh-line`).
- **Becomes:** Keeps its frame (licensed by clause 2 — it is a drill-down viewport inside a panel
  body that has no frame of its own) at radius **18px** with `--bf-shadow-card`. Eyebrow "Live feed"
  → the 11.5px rule. `h2` → `--bf-app-section` (16px/600). Summary → `--bf-app-row` `#575550` at
  62ch. Rows: title `--bf-app-row-strong`, `<em>` `--bf-app-meta` `#8a877e` non-italic, separated by
  `rgba(28,28,26,0.07)` hairlines; rows are not clickable → **no hover state**. `Badge` →
  §Shared badge below.
- **Every information item placed (7/7):** (1) the container
  (`.dashboard-feed-panel`, `id="dashboard-kpi-feed"`, `role="region"`,
  `aria-label "<Title> live feed"`) → verbatim; (2) the header trio → as above; (3) feed "Today's
  Jobs" (summary "N job/jobs active on `<date>`. `<comparison>`."; rows = job name + "phase ·
  startTime - endTime · location" + a status `Badge`) → verbatim; (4) feed "Crews Scheduled Today"
  (summary; rows = crew name + "`<lead>` · `<job names summarised | No assigned jobs listed>`" + a
  crew status `Badge`) → verbatim; (5) feed "Equipment In Use" (summary "N asset/assets in use. N%
  of fleet committed."; rows = asset name + "type · project (or Unassigned) · current job phase" +
  a `Badge`) → verbatim; (6) feed "DelayIQed Projects" (summary; rows = project name + "`<location>`
  · `<delay title>` · N day impact" or the project's `scheduleHealth`) → verbatim; (7) the
  `.dashboard-feed-row` layout → as above.

  **The shared `Badge` is placed here once for the whole cluster.** `className = \`badge
  ${status.toLowerCase().replaceAll(' ','-')}\`` with three tones and a base fallback: **green** =
  confirmed · on-site · ready · complete · available · scheduled · upcoming; **blue** =
  ready-to-start · planned · medium · monitor · ordered · waiting-on-delivery; **red** = delayIQed ·
  high · maintenance · missing · at-risk · open · overbooked; **base** `#e8f1ff`/`#1f52e0` for
  anything else. In the new language every badge becomes a **999px pill** at `--bf-app-micro`
  (11px/700), `min-height: 22px` (from 26px), tones re-based onto the `--cc-*-soft` fills with the
  `--cc-*` ink, and the base pill onto `rgba(47,107,255,0.10)`/`#2f6bff` — **the 6px radius and the
  800 weight are retired** (neither is on the ladder). **`--wx-amber` is not involved**: the badge
  tones read `--cc-*`, so decision #3's blue-named-amber is untouched here.
- **Every action placed (2/2):** the close button (`.icon-button`, `X` 18px,
  `aria-label "Close <Title> live feed"`) → `setActiveFeed(null)`; re-clicking the open tile also
  closes it. **Recorded and preserved: `Escape` does NOT close this** — it registers no key handler
  and takes no focus, because it is an inline region and not a dialog. The mapping does **not** give
  it dialog affordances it does not have (O10).
- **States:** empty → `.dashboard-feed-empty` `<strong>No items to show</strong>` +
  `<span>This category is clear right now.</span>` → **copy verbatim**, at 62ch. No
  loading/error/lock.
- **Motion (1/1):** `dx-fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both` → **name kept**, curve
  re-expressed, duration → `var(--bf-dur-panel)` (0.3s) so an inline panel opening feels like a
  panel and not like a page section. No reveal (it mounts on click, and a reveal target that mounts
  after the observer's first query is exactly what the `MutationObserver` was added for — spending
  it here would be waste). Skeleton: none (it never exists during bootstrap).
- **Tests touched:** `App.test.tsx:526` (regions "Today's Jobs live feed" and "Equipment In Use live
  feed", their headings, and the row detail "Pump · Riverside Office Building · Concrete - Level 3
  Slab") — **passes unchanged.**

## Panel 8 — BuildFlow Apps (`apps`)

- **Today:** Its own `.cc-sec-head` with a "Manage" link, then a grid of five framed app tiles plus a
  dashed "Add App" tile. Each tile carries an inline green `Active` pill with a 6px dot.
- **Becomes:** Tiles become paper cards at **18px** with `--bf-shadow-card` that **lift** by
  `--bf-lift-dense` (each navigates — licensed). Icon square 36px → radius 12px, tones kept. Tile
  title → `--bf-app-row-strong`, description → `--bf-app-meta` `#575550` at 44ch (a two-line
  description is body copy, so it takes the shorter measure). The `Active` pill → 999px at
  `--bf-app-micro` on `--cc-green-soft`/`--cc-green`, its 6px `::before` dot kept, its
  `margin-top: 12px` kept — **the record's correction is honoured: it is an inline pill under the
  description, not a corner badge.** The `.cc-app.add` tile keeps its dashed border, transparent
  ground and its `--wx-card`/`--cc-blue` hover, re-based to `rgba(28,28,26,0.13)` dashed at 18px.
- **Every information item placed (9/9):** (1) the section head (`h2` "BuildFlow Apps" + the
  "Manage" link) → verbatim; (2) the grid (`repeat(3, minmax(0,1fr))` full-page, `auto-fit
  minmax(128px,1fr)` narrowed; 2 columns ≤820px, 1 ≤560px) → kept; (3–7) all five tiles with their
  icons, tones, copy and destinations — "Schedule Intelligence" (`Gauge`, blue, "AI-powered
  lookahead and risk detection." → schedule) · "Crew Planner" (`Users`, green, "Optimize crew
  allocation and demand." → crews) · "Material Navigator" (`Boxes`, amber, "Track, forecastIQ, and
  align material needs." → materials) · "Field Insights" (`ImagePlus`, violet, "Daily logs, photos,
  and field summaries." → field) · "Cost Analyzer" (`DollarSign`, orange, "Monitor budgets and cost
  trends." → reports) → **every string verbatim, including "forecastIQ"**; (8) the `Active` pill on
  every tile → as above; (9) the trailing `.cc-app.add` tile (`Plus` 22px over "Add App") → kept.
  Also placed: `aria-label` on the section is not recorded for this one, and none is added.
- **Every action placed (3/3):** "Manage" (`.cc-link`) → `setPage('reports')` — a **slide** link;
  each app tile → `setPage(its page)`; **"Add App" has no `onClick` — a dead control.** Kept and
  rendered, and given the same disabled treatment as "More" (dashed border at `opacity: 0.45`,
  `cursor: not-allowed`, no hover) so it stops advertising an action it does not have. Removing it
  is R9.
- **States:** none — "the five apps are a hard-coded catalogue". No empty/loading/error/lock.
- **Motion (1/1):** the section is `[data-reveal]` → **removed** (over budget); the `.cc-app` hover
  → the lift. Skeleton: `.dash-skel-block` at 0,26 6×6.
- **Tests touched:** `App.test.tsx:1457` ("Schedule Intelligence" disappears when the apps panel is
  hidden and returns on Reset) — **passes unchanged.**

## Panel 9 — Weather Impact (`weather`)

- **Today:** **Frameless.** A `.weather-alert` block with a 74px `CloudSun` (CSS-shrunk to 44px,
  amber) beside the alert title, the date, the details and an "Affects …" line, plus a
  `.panel-note.warning`.
- **Becomes:** Gains the paper card (§4's five). Glyph stays 44px, colour `--cc-amber #b45309`.
  Title → `--bf-app-row-strong`, date → `--bf-app-meta` `#8a877e`, details and the "Affects" line →
  `--bf-app-row` `#575550` at 62ch. **`.panel-note.warning` renders BLUE today** and this mapping
  preserves that: the `warning` modifier is styled nowhere (`redesign.css:285` styles bare
  `.panel-note` amber and is overridden inside `.dash-rx`), so the note is the base blue
  (`#d2defb` ground, `#03257c` text, `#0733a1` icon, 12px padding, 12px radius, 13px inside
  `.cc-legacy-panel`). Re-based onto `rgba(47,107,255,0.08)` / `#1c1c1a` / `#2f6bff` at radius 12px
  and `--bf-app-row` — **still blue.** Reading `warning` as amber would change what the page says,
  so it is O11, not a change.
- **Every information item placed (4/4):** (1) the header (`CloudSun` + "Weather Impact") →
  verbatim; (2) the alert block (74px→44px glyph, bold title, formatted start date, details,
  "Affects `<job names summarised | active jobs>`") → verbatim; (3) the warning note
  (`AlertTriangle` + "N active job(s) may be impacted") → verbatim, still blue; (4) the
  disruptive/impact rules → untouched, **and the full keyword list is placed** (the record elides
  nine): lightning, thunder, storm, heavy rain, rain, downpour, flood, wind, gust, **hail, tornado,
  snow, ice, sleet, freeze, heat, fog, visibility**, matched case-insensitively against
  `` `${title} ${details}` ``, with severity `High` short-circuiting to true.
- **Every action placed (1/1):** **none inside the panel** — the follow-through is the "Check
  Weather" quick action and the AI panel. Recorded as-is; **no action is invented**, and the panel
  therefore gets no hover state at all.
- **States:** empty → `InlineEmptyState` (`CloudSun`): "No disruptive weather this week" /
  "Forecast alerts that overlap an active job show up here." → **copy verbatim**. No
  loading/error/lock.
- **Motion (1/1):** inherits the board transitions; nothing added. Skeleton: `.dash-skel-block` at
  0,32 3×5.
- **Tests touched:** `App.test.tsx:489` ("No disruptive weather this week" on the default fixture) —
  passes unchanged; `App.test.tsx:500` ("Heavy rain expected" and "1 active job(s) may be
  impacted") — passes unchanged; `App.test.tsx:1479` (**"Hide Weather Impact" / "Show Weather
  Impact"** — this is the panel the hide/show test drives) — **passes unchanged, and both names are
  on the pin list.**

## Panel 10 — Material Readiness (`readiness`)

- **Today:** **Frameless.** A recharts donut at 48% width / 190px height beside a hand-built legend
  list.
- **Becomes:** Gains the paper card (§4's five). The donut is **unchanged**:
  `ResponsiveContainer width 48% height 190`, `PieChart > Pie(dataKey 'value', innerRadius 42,
  outerRadius 78, paddingAngle 1)`, one `<Cell>` per status, no tooltip, no recharts `<Legend>`.
  Slice colours stay the `statusColors` set — **Ready `#16a34a`, Ordered `#2c7be5`, Waiting on
  Delivery `#f59e0b`, Missing `#ef4444`, fallback `#64748b`** — and are **deliberately not
  re-palettised**: they are a data encoding shared with the Materials page, and changing them in one
  place only would break the correspondence. Flagged as O12 for the Materials cluster to decide
  once. Legend: swatch `<i>` → 10px round, status name → `--bf-app-row` `#575550`, count →
  `--bf-app-row-strong`/700 right-aligned with **`tabular-nums`** (it already is), rows separated by
  hairlines.
- **Every information item placed (5/5):** (1) the header (`Boxes` + "Material Readiness") →
  verbatim; (2) the donut spec → unchanged; (3) the slice colours → unchanged; (4) the legend list
  (swatch, status name, bold right-aligned count with tabular numerals) → kept, re-typed; (5) "counts
  are a tally of `data.materials` by status (`materialReadiness`, App.tsx:39111)" → untouched.
- **Every action placed (1/1):** "View all" (`.cc-link.cc-legacy-more`,
  `aria-label "View all materials"`) → `setPage('materials')` — a **slide** link.
- **States:** empty → `InlineEmptyState` (`Boxes`): "No materials added yet" / "Add materials after
  creating a project to track readiness." → **copy verbatim**. No loading/error/lock.
- **Motion (1/1):** recharts' own default pie animation → **kept**, and the recharts polish rules at
  `dashboard-redesign.css:811` are kept with their stroke/font values re-based onto the ink and
  `--bf-app-meta`. Under `prefers-reduced-motion` the pie's `isAnimationActive` is **not** disabled
  today; the new reduced-motion block does **not** touch it either (it would be a props change, not
  CSS) — logged as O13. Skeleton: `.dash-skel-block` at 3,32 3×6.
- **Tests touched:** `App.test.tsx:1191` (clicks "View all materials" and asserts the Materials
  `h1`) — passes unchanged; `App.test.tsx:1208` ("Material Readiness" is inside a `.dash-block`) —
  passes unchanged.

## Panel 11 — Equipment Conflicts (`conflicts`)

- **Today:** **Frameless.** Up to three `ResourceRow` entries: a 22px `Wrench`, the asset name, a
  detail, and a status `Badge`.
- **Becomes:** Gains the paper card (§4's five). `.resource-row` becomes a hairline-separated row of
  one sheet: glyph 20px `#8a877e`, name `--bf-app-row-strong`, detail `--bf-app-meta` `#575550`,
  `Badge` → the 999px pill (§KPI live feed). Rows are not clickable → **no hover state**.
- **Every information item placed (3/3):** (1) the header (`Wrench` + "Equipment Conflicts") →
  verbatim; (2) up to 3 `ResourceRow`s (22px `Wrench`, bold asset name, "`<type>` assigned", status
  `Badge`) → verbatim; (3) the source rule (`data.equipment` filtered to `status !== 'Available'`,
  sliced to 3) → untouched.
- **Every action placed (1/1):** "View all" (`aria-label "View all equipment"`) →
  `setPage('equipment')`. **Recorded correction placed:** `equipment` is add-on-locked
  (`ADD_ON_PAGE_LOCKS`), so this button can raise the **`AddOnPrompt`** instead of navigating. The
  record lists it as a plain `setPage`. Behaviour untouched; the button therefore keeps its
  destination wording and the prompt is the honest outcome. No visual "locked" affordance is added
  here, because adding one would change what the page claims (O14).
- **States:** empty → `InlineEmptyState` (`Wrench`): "No equipment conflicts yet" / "Equipment
  assignments will appear after assets are added." → **copy verbatim**. Add-on lock → the prompt, as
  above. No loading/error.
- **Motion (1/1):** inherits the board transitions; nothing added. Skeleton: `.dash-skel-block` at
  0,37 3×5.
- **Tests touched:** `App.test.tsx:1208` ("Equipment Conflicts" is a `.dash-block`) — passes
  unchanged; `App.test.tsx:1289` (the block's text is **not** `/No equipment conflicts yet/`) —
  passes unchanged.

## Panel 12 — Upcoming Inspections (`inspections`)

- **Today:** **Frameless.** Up to four `ResourceRow` entries.
- **Becomes:** Gains the paper card (§4's five), with the same `ResourceRow` treatment as Equipment
  Conflicts so the two read as one species.
- **Every information item placed (2/2):** (1) the header (`CalendarDays` + "Upcoming
  Inspections") → verbatim; (2) up to 4 `ResourceRow`s (22px `CalendarDays`, bold inspection title,
  the project name as the detail, a status `Badge`) → verbatim, with `projectName()`'s "Unassigned"
  fallback placed.
- **Every action placed (1/1):** "View all" (`aria-label "View all inspections on the projects
  page"`) → `setPage('projects')` — a **slide** link.
- **States:** empty → `InlineEmptyState` (`CalendarDays`): "No inspections scheduled yet" /
  "Inspection dates will appear after projects are created." → **copy verbatim**. No
  loading/error/lock.
- **Motion (1/1):** inherits the board transitions; nothing added. Skeleton: `.dash-skel-block` at
  3,38 3×5.
- **Tests touched:** `App.test.tsx:1208` ("Upcoming Inspections" is a `.dash-block`) — passes
  unchanged; `App.test.tsx:1289` ("Foundation Inspection" inside the panel) — passes unchanged.

## Recent activity split card (below the board)

- **Today:** A section head with a "View all" link over a two-up card: copy on the left, a
  `--hsh-hover`-tinted list on the right with a **left border**. **Not** a board panel — it sits
  outside the `DndContext` and cannot be moved, resized or hidden.
- **Becomes:** **One** paper card at 18px with `--bf-shadow-card` — the split's inner pane keeps its
  `--hsh-hover` tint but **loses its left border**, becoming a section of one sheet
  (the single cut in §5.1's audit). Section head: `History` 16px `#8a877e` + `h2` at
  `--bf-app-section`. Left half: `h3` → `--bf-app-row-strong`/600, `p` → `--bf-app-row` `#575550` at
  **44ch** (it is body copy, not a lede). Right half rows: the 24px avatar stays a `50%` circle on
  `#2f6bff` with `#fff` initials at `--bf-app-micro`, the single-line ellipsised text →
  `--bf-app-row` (its `title` attribute carrying the full string is kept), the `.hs-split-tag` chip →
  the 999px pill. Rows are not clickable → **no hover state**. Below 760px it still collapses to one
  column with the tint's separator becoming a top hairline.
- **Every information item placed (6/6):** (1) the section head (`History` + "Recent activity" +
  "View all") → verbatim; (2) the left half (`h3` "Never miss a field report", `p` "Every note,
  photo and percent your crews post from site lands here, newest first, so nothing waits for a
  phone call.") → **copy verbatim**; (3) the right half (`.hs-split-list`, tinted, up to 4 rows) →
  kept, border cut; (4) the row (24px avatar from `avatar` initials → the first two letters
  uppercased → `'FI'` from "Field"; the text "`<Author name | Field crew>` · `<message>`",
  single-line, ellipsised, with a full-text `title`; a `.hs-split-tag` status chip) → verbatim;
  (5) the source (`data.fieldUpdates` sorted `createdAt` desc, sliced to 4) → untouched; (6) the
  760px collapse → kept. Also placed: `aria-label="Recent activity"` on the `<section>` → kept.
- **Every action placed (2/2):** "View all" (`.cc-link`, `aria-label "View all field updates"`) →
  `setPage('field')` — a slide link; "Open field updates" (`.hs-home-empty-btn`, `ClipboardList`) →
  `setPage('field')` — an inverting pill.
- **States:** empty → a single `.hs-split-row` containing "No field reports yet today." → **copy
  verbatim**. No loading/error/lock.
- **Motion (1/1):** the section is `[data-reveal]` → **kept — 5 of the page's 6.** Hover: **slide**
  on the two links only. Skeleton: none (it is below the skeleton's board and the skeleton does not
  mirror it — unchanged).
- **Tests touched:** `tests/tutorial.test.tsx:286` relies on the dashboard showing the same field
  update as the notifications bell — **passes unchanged.**

## TimeCard cards (below the board)

- **Today:** A six-card overview at the foot of the page, locked behind the add-on until purchased.
  Also outside the board.
- **Becomes:** Six paper cards at 18px with `--bf-shadow-card` that **lift** by `--bf-lift-dense`
  (every card is a button — licensed). Section head: `Clock` 18px + "TimeCard" at
  `--bf-app-section`, plus the `Add-on` chip as a 999px pill (`CircleArrowUp`, its `title` kept).
  Card label → the **eyebrow**; figure → `--bf-app-figure` (26px) + **`tabular-nums`**; sub →
  `--bf-app-meta` `#575550`. The locked state's rules at `hs-home.css:1358+` are re-based:
  `opacity` kept, the lock chip on `rgba(47,107,255,0.10)`/`#2f6bff`.
- **Every information item placed (7/7):** (1) the section head with its `Add-on` chip and full
  `title` ("TimeCard is an add-on — choose it to see where to get it") → verbatim; (2) card 1
  "Active crews today" (`Users`, blue, distinct crews with entries today, sub "N.N hrs logged
  today") → verbatim; (3) card 2 "Hours this week" (`Clock`, green, rounded total, sub "N% of N
  budgeted") → verbatim; (4) card 3 "OT pending approval" (`Timer`, amber, rounded pending OT, sub
  "N timecards") → verbatim; (5) card 4 "Crew utilization" (`Gauge`, violet, a percent, sub
  "scheduled capacity") → verbatim; (6) card 5, wide, "Labor cost trending" (`TrendingUp`, green,
  the latest actual as compact currency plus a signed `+NK`/`-NK` chip with `up`/`down`, and a
  sparkline) → verbatim — **and the record's completeness note is carried: card 5's numbers come
  from the module-level `laborCostTrend` fixture in `TimeCard.tsx:1665`, not from workspace data**,
  which matters because the "no invented copy" contract governs the rest of the page. Preserved
  as-is and raised as O15; (7) card 6 "Crews with pending approvals" (`ClipboardCheck`, red, the
  count, sub = the first two crew names joined by ", " or "All approved") → verbatim. Also placed:
  `aria-label="TimeCard overview"` on the `<section>` → kept.
- **Every action placed (2/2):** the header button "Open TimeCard" (`ArrowRight`) →
  `setPage('timecard')`, or **"Get TimeCard"** (`CircleArrowUp`, `.locked`) when the add-on is not
  unlocked → the `AddOnPrompt` path; every card is a button → the same `onOpen`. Unchanged. Note:
  `timecard` is one of the three `ADD_ON_PAGE_LOCKS`, so on a locked workspace **all seven controls
  land on the prompt** — that is today's behaviour and it is preserved.
- **States:** empty → card 6 reads "All approved" when nothing is pending → verbatim. Add-on lock →
  the `Add-on` chip + "Get TimeCard" + the prompt. No loading/error.
- **Motion (1/1):** the wrapping section is `[data-reveal]` → **kept — 6 of the page's 6**; the
  card sparkline is a `recharts` `LineChart` (`ResponsiveContainer height 40`, `Line type monotone
  dataKey 'actual' stroke #fb8500 strokeWidth 2`, dots off) → **stroke `#fb8500` is the last orange
  in the cluster**; it is re-based to `#2f6bff` **only if** O15 resolves in favour of real data
  (an orange line on a fixture is two problems, and re-colouring it would disguise one). Until then
  it stays `#fb8500`, declared. Hover: **lift**. Skeleton: none (below the board).
- **Tests touched:** none recorded. No test changes; the six cards and both header states go into
  the §14 walkthrough.

## Loading skeleton (`DashboardSkeleton`)

- **Today:** `<div className="dash-rx hs-home dash-skeleton" role="status" aria-label="Loading your
  dashboard" aria-busy="true">` painting the page's shape — three head bars, a status-strip
  placeholder, and a **real** 6-column / 40px-row grid whose 12 blocks are positioned from
  `DASH_LAYOUT_DEFAULT`.
- **Becomes:** `.dash-skel-block` radius `12px → 18px`, border → `rgba(28,28,26,0.07)`, fill `#fff`,
  `--bf-shadow-card` — i.e. **the same paper card the real panels get**, which is the whole point of
  a shape skeleton. `.dash-skel-line` keeps its three widths (w-40 / w-80 / w-64) and its
  `.tall` 26px variant, re-based onto `rgba(28,28,26,0.07)`. `.dash-skel-strip`'s 128px
  `--cc-blue-soft` block at 0.55 opacity → kept, re-based to `rgba(47,107,255,0.08)`.
  **`grid-auto-rows: 40px` and the hand-mirrored `DASH_LAYOUT_DEFAULT` positions stay exactly as
  they are** (§4).
- **Every information item placed (6/6):** (1) the root with `role="status"`, **`aria-label
  "Loading your dashboard"`** and `aria-busy="true"` → verbatim (the accessible name is asserted);
  (2) `.dash-skel-head`'s three bars → kept; (3) `.dash-skel-strip` → kept; (4)
  `.dash-skel-board`'s real 6-column grid positioned via `gridColumn '<x+1> / span <w>'` and
  `gridRow '<y+1> / span <h>'` → **frozen**; (5) `.dash-skel-block`'s three shimmer lines → kept;
  (6) the ≤900px single-column / 120px-min-height collapse → kept.
- **Every action placed:** none — it has no controls.
- **States:** it **is** the Dashboard route's loading state; every other route falls back to the
  "Loading BuildFlow HUD" spinner screen.
- **Motion (1/1):** `dash-skel-shimmer 1.4s ease-in-out infinite` (a 3-stop gradient sweeping
  `background-position 200% → -200%`) → **name kept**, and it stays disabled by the existing
  `hs-home.css:2069` reduced-motion block. **The one addition:** the head bars can reuse
  `components/ui/text-shimmer.tsx` only if a string is present — they are bars, not text, so they do
  **not**; no new component. No reveal (the skeleton unmounts before the observer matters).
- **Tests touched:** `App.test.tsx:1109` (`role="status"` named "Loading your dashboard" appears,
  then disappears once "Pending Approvals" renders) — **passes unchanged.**

## Live-region announcements (keyboard nudging)

- **Today:** A visually-hidden `role="status" aria-live="polite"` region speaking the result of every
  arrow-key move or resize.
- **Becomes:** **Nothing visual changes** — it is `1×1` with `clip-path: inset(50%)` and must stay
  that way. The one thing the new file must not do is give it `display: none` or `visibility:
  hidden` through any generic "hide visually" utility, which would stop it being announced. The
  new stylesheet therefore declares **no** visually-hidden utility at all and leaves the existing
  inline rules alone.
- **Every information item placed (6/6):** (1) the region's classes and ARIA → frozen; (2) "`<Title>`
  moved to column `<x+1>`, row `<y+1>`" → verbatim; (3) "`<Title>` is now `<w>` of 6 columns wide and
  `<h>` rows tall" → verbatim (**and it says "of 6", which is another reason `DASH_COLS` cannot
  change without a copy change**); (4) "`<Title>` cannot move further left|right|up|down" →
  verbatim; (5) "`<Title>` cannot get any smaller|larger here" → verbatim; (6) "nudging is a no-op
  and says nothing while the board is stacked" → untouched.
- **Every action placed (1/1):** arrow keys move one cell, Shift+arrow resizes one cell, both
  committing through `onChange` and setting `.is-landing` → untouched.
- **States:** none.
- **Motion (1/1):** the focused grip keeps `opacity: 1` with a blue outline
  (`.dash-drag-handle:focus-visible`) → re-based to `var(--bf-focus-ring)` plus the existing
  `#2f6bff` outline, so the grip's focus state is the strongest in the cluster (it is the only
  keyboard drag affordance in the product).
- **Tests touched:** `dashGrid.test.ts` covers the underlying `moveItem`/`resizeItem` semantics; the
  announcements themselves are not asserted. **No test changes**, and the four strings go into the
  §14 walkthrough with a screen reader.
---

## 11. Shared control specs used above (§Buttons, §Links, §Empty states)

Three button variants, mapped from the Welcome Page's three, used everywhere in this cluster:

| App | Spec | Hover |
|---|---|---|
| primary (`Try again`, `Approve`, `Purchase in Billing`, `Choose a plan`, `Open the Gantt Chart`) | `999px`, `13px/600`, `padding: 8px 16px`, `#2f6bff` / `#fff`, `0 4px 12px rgba(47,107,255,0.2)` | `#1f57e0`, `0 8px 22px rgba(47,107,255,0.28)` |
| secondary (`Customize`, `Reset layout`, `Reject`, `Not now`, `Back to log in`, `Retry`, `View all …`, hidden-panel chips, `.hs-home-empty-btn`, the segmented pair) | `999px`, transparent, `1px solid rgba(28,28,26,0.13)`, `#1c1c1a`, `13px/600` | **inverts** to `#1c1c1a` / `#fdfcf9` |
| icon (`.hs-btn-icon`, `.icon-button`, `.dash-hide`, the feed's `X`) | radius `12px`, 30–36px square, transparent, `#575550` | wash `rgba(28,28,26,0.05)`, press `scale(var(--bf-press-scale))` |

**Declared deviation:** the Welcome Page's primary is the *ink* pill and blue is reserved for
accents. In-app the primary stays **blue**, because `#2f6bff` is already the action colour across all
eleven app scopes and inverting that would re-teach the whole product for the sake of doctrine. The
ink pill is used in-app for exactly one thing — the AI FAB — which is where the marketing page uses
it.

**Directional links** (`.cc-link`, `.hs-bookmarks-add`, `.hs-home-promo-action`, every "View all …"):
`13px/600` `#2f6bff`, no underline at rest, the trailing icon sliding `var(--bf-slide)` (3px) on
hover. Where the link currently renders as a small bordered chip (`hs-home.css:1000`,
`12.5px/600`, radius 6px) it becomes the secondary pill above, so the page has one control species
instead of two.

**`InlineEmptyState` / `.hs-home-empty` / `.cc-empty-line`** (used by 9 screens in this cluster):
glyph 22px `#8a877e`, title `--bf-app-row-strong` `#1c1c1a`, detail `--bf-app-meta` `#575550` capped
at `var(--bf-app-prose)`, centred, **no frame of its own** (it always sits inside a panel that
already has one), and any action rendered as the secondary pill.

---

## 12. Proposed removals — needs approval. **Nothing here is removed by this mapping.**

| # | Item | Why I would remove it | Shipped anyway as |
|---|---|---|---|
| R1 | The notification panel's missing empty state | A fresh workspace shows an empty 420px card. Proposed copy: **"No BuildFlow activity yet."** That is *new copy*, so it is out of scope for a re-skin | the card collapses to its head (`min-height: 0`) |
| R2 | Equipment notification items stamped `new Date().toISOString()` on every render | They always sort first and can consume most of the 7-item cap, pushing real field updates, weather and assignments out of the panel. A behaviour bug, not a styling one | reproduced exactly |
| R3 | `openScheduleLink()` — the bookmarked-schedule-view open (BUG-1) | It only rewrites `location.hash`, which fires `hashchange`; in app mode only `popstate` is listened for, so **the control is dead inside the app** and works only on a fresh page load. Preserving it faithfully preserves a dead control. Fix = route through `openAppPage` + `writeScheduleContext`, or add a `hashchange` listener | both call sites (star menu row, Bookmarks tile) shipped exactly as they are |
| R4 | `.dx-bg` / three `.dx-aurora` / `.dx-cursor` JSX nodes on the Dashboard | `display: none` under `.hs-home`, so they are dead paint work — and the aurora is a recorded paint-perf hotspot. Removing the nodes is a JSX change | still rendered, still hidden; the `--mx/--my` writer they justified is now consumed by `SpotlightSurface`, so the pointer work stops being wasted |
| R5 | AI Recommendations' stale-list-under-error treatment | The 0.62 opacity + hairline I propose is a *visual* change to an existing state, and it changes what a person infers from a stale list. Needs sign-off | if declined: the error block simply sits above the stale list as it does today |
| R6 | Rendering the TopBar on the Settings page | It is the only in-app surface with no chrome — no search, no bell, no account menu, no AI, no bookmarks, no brand-home, and `"Close settings"` is the only way out. It is also **the one item in this cluster with genuine test exposure** (`tests/settings.test.tsx`, 9 tests) and is fully severable | proposed, with the three `calc(100vh - var(--hs-topbar-h))` follow-ups named; drop it and nothing else in the mapping changes |
| R7 | Three dead rules | `.hs-shell .hs-flyout-divider` (`app-shell-hubspot.css:768`) matches nothing; `.hc-assistant-fab.open` (`assistant-global.css:52`) never matches in the app shell; `sidebar-redesign.css` is 307 lines of `.sidebar-rx` that appears nowhere in `App.tsx` | `sidebar-redesign.css` **is** deleted (it is dead code, agreed in the concept's build order, and its 3 `#1a73e8` literals go with it); the two orphan rules are left in place pending approval |
| R8 | `help-redesign.css:797-1090`'s `.help-center-page .hc-assistant*` twin | It is the more-specific sibling of `assistant-global.css` and will diverge from the re-skinned FAB. It is a **different cluster's** file | untouched; flagged for the Help Center cluster |
| R9 | The two dead controls: Quick Actions' **"More"** and Apps' **"Add App"** | Neither has an `onClick`. A test asserts every `.cc-link` / `.cc-rec-btn` / `.cc-btn` **inside `.dash-board`** has a handler — these two sit outside that selector, which is how they slipped through | both shipped, both given the disabled treatment (`opacity: 0.45`, `cursor: not-allowed`, no hover) so they stop promising an action |
| R10 | `--wx-serif`'s 10 app-scope declarations and its 27 reads | Decision #4, already made: a dead Palatino stack that will silently render serif the moment new work consumes it | **deleted** — this is the one approved removal, and the reads become `var(--bf-font-sans)` |
| R11 | The leftover orange `--shadow-accent: rgba(251,133,0,…)` | Pre-blue-era dead weight found while auditing the gradients | retired with the R10 sweep |

---

## 13. Open questions

| # | Question |
|---|---|
| O1 | **The hairline test (§1.7).** Does `1px rgba(28,28,26,0.07)` + `blur(14px)` read as "inside the workspace" on an uncalibrated monitor once the navy is gone? If not, promote `--hs-line-on-navy` to `rgba(28,28,26,0.13)`. Needs a human looking at a real screen, not a screenshot diff. |
| O2 | **The greeting at 38px.** `clamp(28px,3vw,38px)` puts one 38px line above the board and is the only rung where the product ladder touches the marketing one. A reviewer who wants the display register dialled back should cut it to `clamp(26px,2.4vw,32px)` — today's value — and keep everything else; the status band's 44–64px figure carries the register either way. |
| O3 | **The shared-component seam.** `KpiCard`, `ScheduleStatusBand` and the `Badge` are shared with Schedule / Reports / TimeCard. All my rules are scoped `.bf-shell .dash-rx.hs-home …`, so those pages keep today's look until their clusters land — a deliberate interim seam. Confirm the phasing, or lift the shared rules to `.bf-shell` and re-skin four pages at once. |
| O4 | **`.ss-figure strong` weight 750 → 700.** The ladder has no 750 rung, but this is the biggest number in the product. Confirm. |
| O5 | Project Alerts' weather row reads `data.weatherAlerts` **unfiltered**, so it can show an alert the Weather Impact panel deliberately hides (`isDisruptiveWeatherAlert`). Intended? |
| O6 | `acceptVariance` returns `movedJobIds` and the Dashboard discards it, so the person is never told which jobs the CPM ripple moved. Surfacing it is a feature. Wanted? |
| O7 | The Performance and KPI tiles have **no keyboard reorder path** (`useSortable`'s `attributes` never spread, no `setActivatorNodeRef`, `PointerSensor` only) while the panels have full arrow-key nudging. Fix, or accept and document? |
| O8 | "DelayIQed Projects" compares against the **prior calendar week from this week's Monday**, while the other two KPIs compare against `dashboardLastWeekSameDay`. Same phrase, two baselines. Intended? |
| O9 | `dashboardToday` / `dashboardLastWeekSameDay` / `weekDays` are **module-level constants**, so a long-lived tab never rolls over at midnight while the greeting's `hsHour` does. Accept? |
| O10 | The KPI live feed is an inline region with no `Escape` and no focus management. Accept, or give it dialog semantics (a behaviour change)? |
| O11 | `.panel-note.warning` has **no rule**, so the Weather Impact note renders **blue**. Should `warning` become amber (a change to what the page says) or stay blue? |
| O12 | The Material Readiness donut's `statusColors` (`#16a34a / #2c7be5 / #f59e0b / #ef4444 / #64748b`) are a **data encoding shared with the Materials page** and are not on the token ladder. Re-palettise once, across both, or freeze? |
| O13 | Recharts' pie and line animations are props (`isAnimationActive`), not CSS, so `prefers-reduced-motion` does not reach them. Wire the media query into props (a JSX change) or accept? |
| O14 | "View all equipment" can raise the `AddOnPrompt` instead of navigating, with no visual signal that it is gated. Add a lock glyph (changes what the button claims) or leave it? |
| O15 | TimeCard card 5's figures come from the module-level `laborCostTrend` **fixture**, not workspace data, on a page whose "no invented copy" contract is test-enforced. Fix the data, or label the card? Its `#fb8500` sparkline stroke stays orange until this resolves. |
| O16 | `--hsh-paper` is **used and never defined** (`hs-home.css:1295`), so the drag placeholder's ground is transparent. I add the fallback `var(--hsh-paper, #f5f6fa)`; confirm `#f5f6fa` is the intent. |

---

## 14. Tests touched — the whole cluster in one table

**346 tests, 37 files. Expected edits to existing tests: zero. New files: two (§8).**

| Test | Screen(s) | Verdict |
|---|---|---|
| `App.test.tsx:154` | Add-on prompt | passes unchanged |
| `App.test.tsx:228`, `:247` | Tutorial, Top bar | passes unchanged |
| `App.test.tsx:489`, `:500`, `:550` | Dashboard shell, Weather Impact | passes unchanged |
| `App.test.tsx:526` | KPIs, KPI live feed | passes unchanged |
| `App.test.tsx:612`, `:623`, `:634` | Account menu, Top bar | passes unchanged |
| `App.test.tsx:987`, `:1032`, `:1068`, `:1337` | Approvals, AI Recommendations | passes unchanged |
| `App.test.tsx:1085`, `:1109` | Shell frame, error screen, skeleton | passes unchanged |
| `App.test.tsx:1133` | Status band | passes unchanged |
| `App.test.tsx:1157`, `:1208`, `:1263/1268` | Greeting header, promo, verify pill | passes unchanged |
| `App.test.tsx:1191` | Material Readiness | passes unchanged |
| `App.test.tsx:1234` | Board stacked order, Quick Actions, KPIs | passes unchanged |
| `App.test.tsx:1289`, `:1314` | Alerts, Performance, KPIs, Conflicts, Inspections | passes unchanged |
| `App.test.tsx:1361` | Board body a11y contract | passes unchanged — **and it is the test that verifies §4's "stored boards scroll rather than clip"** |
| `App.test.tsx:1387`, `:1412` | Today's plan | passes unchanged |
| `App.test.tsx:1457`, `:1479` | Board persistence, Apps, Weather Impact | passes unchanged |
| `App.test.tsx:1516`, `:1528` | Performance honesty rule | passes unchanged — **the reason the sparkline arithmetic and `.cc-trend.flat`'s grey are frozen** |
| `dashGrid.test.ts` (**19** `it(`, lines 24-214) | Board engine | passes unchanged — no constant, function or id moves |
| `announcements.test.ts:5`, `:10` | Promo | passes unchanged |
| `components/CommandPalette.test.tsx:12/17/30/45` | Palette | passes unchanged — motion is CSS on an already-mounted node, so it cannot race the `rAF` focus |
| `tests/tutorial.test.tsx:112/136/155/183` | Tutorial | passes unchanged |
| `tests/tutorial.test.tsx:286` | Bell panel (+ DOM order), Recent activity | passes unchanged — re-ordering stays CSS-`order`-only |
| `tests/map.test.tsx:103` | Flyout lock, Add-on prompt | passes unchanged — CSS-only; `[role='tooltip']` stays exactly one element because `RailTooltip`'s bubble is `aria-hidden` with no role |
| `tests/settings.test.tsx:113` | Rail hubs, both `Settings` gears | passes unchanged — names, the `^<Hub>( \(.*\))?$` regex surface, and the click-navigates branch all preserved |
| `tests/settings.test.tsx:83` + the other 8 | Settings | **run first.** The only genuine exposure, and it comes from R6 (TopBar on Settings) alone. If brittle, drop R6 |
| `tests/schedule.test.tsx:44` | Top bar on the Week page | passes unchanged |
| `schedule/boundary.test.ts` (8) | guard | passes unchanged — new classes use the `bf-` prefix, new components live in `components/ui/`, and **nothing is named `bf-sched-*` or `*gantt-*`** |
| `test/appHarness.tsx` (`enterDashboard`, `completeOnboarding`, `openAppPage` ×30, `openSchedule` ×3) | everything | passes unchanged — `Search BuildFlow`'s label, the rail's `onMouseEnter`-on-the-slot, `role="menuitem"` sub-items, and the click-navigates branch are all frozen, and the coarse-pointer tap path is gated on `matchMedia("(hover: none)")` which `test/setup.ts` answers `false` |
| **new** `tests/shell-nav.test.tsx` | Rail, flyout, top bar | **added** — 5 assertions (§8.1), including the corrected **21** nav anchors |
| **new** `density.test.ts` | the new stylesheet | **added** — closed-token allowlist parsed from `?raw` (§8.2) |

**Unprotected by any test, so preserved by reading the code and walked manually:** the bookmarks
star menu, the Bookmarks page, and the whole `BreezeAssistant` panel (24 information items, 17
actions).

**Run order:** `tests/settings.test.tsx` → `schedule/boundary.test.ts` →
`components/CommandPalette.test.tsx` → `tests/tutorial.test.tsx` → `tests/map.test.tsx` →
`tests/schedule.test.tsx` → `dashGrid.test.ts` → the full suite.

---

## 15. Acceptance

1. **346 pass**, plus the two new files green.
2. **Computed-style diff** over the 20 shell screens and the 23 dashboard screens confirming that
   every colour, radius, shadow and easing changed, and that **no font-size on a frozen surface
   moved**: `.dash-block h2` (15px), `.hs-index .hs-table thead th` height (42px) and `td` height
   (46px), `.ss-figure strong` (`clamp(44px,6vw,64px)`), `.kpi-card strong` (28px),
   `.cc-stat-value` (26px), `.hs-home-sub` (14.5px), `.hs-home-date` (13px).
3. **Board arithmetic unchanged**: `DASH_COLS 6` / `DASH_ROW_UNIT 40` / `DASH_GAP 16` /
   `grid-auto-rows: 40px`, a saved `dash:layout` resolving to identical pixels before and after, and
   a **fresh** board re-fitting cleanly with the five newly-framed panels.
4. **Rows above the fold**, counted at 1440×900 with the greeting at 38px: the board's first row
   must start no lower than it does today +7px. If it does, O2 is exercised.
5. **The hairline check (O1)** on an uncalibrated monitor, with a named outcome.
6. **A browser run of the tutorial from step 1 to the wrap-up at 1440px, 768px and 375px**,
   confirming the spotlight lands on `dashboard-setup-banner`, on `schedule-status-band`, and on
   `tutorial-restart-button` **through the top bar's new `backdrop-filter`**.
7. **A manual walk of the three uncovered surfaces** against the record's item lists: the bookmarks
   star menu (5 info / 7 actions), the Bookmarks page (7 / 4), `BreezeAssistant` (24 / 17).
8. **A screen-reader pass** over the board's four announcement strings and the panel-body
   `role="region"` tab stops.
9. **Grep proof** that the new stylesheet renames nothing: every selector contains `.bf-shell` and
   at least one pinned class; zero `:where(`; zero `!important`; zero `14px` radius.

---

## 16. Build order for this cluster

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append `--bf-app-*` (§2.1); re-base `--bf-focus-ring`; align **both** reveal observers to `0.16` / `-6%` (`useHudMotion.ts:50` **and** `App.tsx:25773`) | 3 | none |
| **B** | Create `app-shell-daylight.css`; add its import as the new last line of `main.tsx`; add `"bf-shell"` to `shellClassName` | 3 | none — deleting the word reverts everything |
| **C** | Chrome: the eight token values, top bar, rail, flyout (**including the `schedule.css:1945-1965` saved-views block**), the four menus, notifications panel, palette, AI FAB, `hs-breeze.css`'s literals → tokens, `.bf-shell .hs-page-tag` (fixes six pages at once) | 1 new + 3 | low, CSS only |
| **D** | Dashboard surfaces: the five newly-framed panels, panel cards 8→18px, the eyebrow rule, buttons/badges/links/empty states, `.bf-doc-bleed`, the 72px tail, the `--hsh-paper` fallback | 1 new | low, CSS only |
| **E** | Reveal budget: remove `data-reveal` from the five over-budget targets; retime the two stagger blocks | `App.tsx` (5 attributes) | low |
| **F** | Port `rail-tooltip.tsx` + `spotlight-surface.tsx`; wire tooltips to 18 buttons and the spotlight to the panels/cards/flyout | 2 new + `App.tsx` | low — additive wrappers, no selector or name changes |
| **G** | Responsive tiers (1040 / **1024** / 760 / **640** / 560 / **380** / **max-height 620**); flyout `Escape` + focus-out; the coarse-pointer tap path; the three DO-NOT-MOVE comments; **R6 (TopBar on Settings) last, on its own commit** | 1 new + `App.tsx` + `settings-redesign.css` + `styles.css` | **medium** — the only phase with test exposure, and R6 is severable |
| **H** | Add `tests/shell-nav.test.tsx` and `density.test.ts` | 2 new | none |
| **I** | Cleanup: delete `--wx-serif` from 10 app scopes and rewrite its 27 reads; delete `sidebar-redesign.css` + its import + the inert `collapsed`/`onToggleCollapsed` props and the `sidebar-collapsed` class; retire `--shadow-accent`; migrate the 14 in-app `#1a73e8`/`rgba(26,115,232,…)` literals | ~14 | low — last, so a regression is attributable |

Stylesheet count: 57 → 58 (phase B) → **57** (phase I deletes `sidebar-redesign.css`).
