# BuildFlow motion plan

**Scope.** The motion half of the dashboard redesign, on the chosen shell concept ("preserve" /
*Daylight Rail*), with the eight grafts the judges required. Presentation only: no business logic,
no data model, no API call, no state management, no auth, no save/load behaviour. Every page,
route, label, column, chart, input, button action and string that exists today still exists
afterwards.

**Sources.** `DESIGN_TOKENS.md` (Motion section), `concept-preserve.md` in full,
`inventory/states-and-motion.json` including its `completenessCheck`, plus `client/src/design-tokens.css`,
`client/src/useHudMotion.ts`, `components/ui/text-shimmer.tsx` and `components/ui/stagger-cards.tsx`
read directly. Every number below that is asserted about the current code was re-verified against
the source in this session; where the inventory or a concept document is wrong, §11 says so and
gives the evidence.

**One correction up front, because it changes the recipe.** The graft brief says the four
`prefers-reduced-motion` blocks in `app-shell-hubspot.css` "null them BY NAME and a rename silently
un-nulls them." They do not null by name. All four null by **selector**:

```
line  673: .hs-shell .hs-topbar .icon-button svg, … { animation: none; transition: none; transform: none }
line  855: .hs-shell .hs-flyout-tag, .hs-shell .hs-menu-tag, .hs-shell .hs-rail-tag { animation: none }
line  942: .hs-shell .hs-flyout, .hs-shell .hs-menu { animation: none }
           .hs-shell .hs-rail-btn svg, …:hover::before { animation: none; transition: none; transform: none }
line 1115: .hs-shell .hs-flyout-star, .hs-shell .hs-bookmark-remove { transition: none }
```

Renaming a keyframe is therefore **harmless** to these blocks. What is *not* harmless is the
re-skin's own recipe. Those selectors carry 2–3 classes. The recipe is "take the existing selector
verbatim and prefix `.bf-shell`", which produces 3–4 classes — so **every animation rule the new
stylesheet writes out-specifies the reduce block that was nulling it, and reduced motion silently
comes back on across the whole chrome.** The hazard is prefixing, not renaming.

The consequence runs through this entire document and is stated once as a hard rule:

> **RULE R.** For every selector in `app-shell-daylight.css` that declares `animation`,
> `transition` or `transform`, the *same* `.bf-shell`-prefixed selector string must also appear
> inside that file's own `@media (prefers-reduced-motion: reduce)` block. The new file never
> relies on an inherited reduce block. `density.test.ts` asserts the pairing 1:1 (§12.3).

We still keep every keyframe name (§10) — for cascade hygiene, diffability and because the
`animation: none` selector families stay meaningful — but the *reason* is not the one the brief
gave.

---

## 1. The translation: what carries over literally, what re-scales

The type argument for this redesign is that the product's range is narrower than the marketing
page's but sits on the same ladder. The motion argument is sharper and easier to defend, because
**motion re-scales on amplitude, not on time.**

### 1a. Stated as jumps against the source's own internal range

| Band | Welcome Page | Dashboard | Factor |
|---|---|---|---|
| Interaction floor | `0.18s` press | `0.18s` press | **×1.00** |
| Interaction ceiling | `0.30s` panel | `0.30s` panel | **×1.00** |
| Entrance | `0.70s`–`1.00s` | `0.55s` | ×0.55–0.79 |
| Reveal shift | `30px` | `12px` | ×0.40 |
| Reveal stagger | `90ms` | `50ms` | ×0.56 |
| Card hover lift | `-6px` | `-4px` | ×0.67 |
| Directional slide | `3px` | `3px` | **×1.00** |
| Press scale | `0.94` | `0.94` | **×1.00** |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` | same | **×1.00** |

**The internal range.** The Welcome Page's own motion spans `0.18s → 1.00s`, a ratio of **5.6×**.
The dashboard's spans `0.18s → 0.55s`, a ratio of **3.1×**. The product's motion range is a little
over half the marketing page's, **on one continuous ladder whose bottom rung is identical**. That
sentence is checkable and it is the motion twin of the type argument ("row 13px → title 26px =
2.00× against the Welcome Page's 12px → 96px = 8.0×").

Amplitude: Welcome runs reveal-shift `30px` → hover-lift `-6px` = 5.0× of travel. The dashboard
runs `12px` → `-4px` = 3.0×. Same compression, same direction.

**The `×1.00` rungs are the family resemblance.** Just as the eyebrow is the one type role that does
not re-scale (11.5px/650/0.045em, carried over verbatim onto every `thead th`), **the interaction
band is the one motion range that does not re-scale**. A button press, a row hover, a menu row
nudge and a pill inversion feel byte-identical in the app and on the marketing site. Those are the
gestures a user performs hundreds of times a day. Entrance motion — which a user experiences once
per navigation — is where the compression is spent. That is the correct place to spend it, and it
is why this half of the language survives the translation better than rhythm does.

### 1b. Carries over literally — same value, no adjustment

| Thing | Value |
|---|---|
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` — `--bf-ease`. 220 literal occurrences today; the redesign adds zero more (§12.3 assertion 1) |
| Second curve | `cubic-bezier(0.4, 0, 0.2, 1)` — `--bf-ease-size`, height and grid only |
| Interaction durations | `0.18` / `0.25` / `0.28` / `0.30`s — `--bf-dur-press` / `-hover` / `-move` / `-panel` |
| Directional slide | `3px` — `--bf-slide` |
| Press scale | `0.94` — `--bf-press-scale` |
| Focus ring | `0 0 0 4px` — `--bf-focus-ring`, re-based to the `#2f6bff` alpha (§2) |
| Reveal contract shape | mark `data-reveal` → IO adds `.in` → **unobserve**. One-shot. Never replays. |
| IO parameters | `threshold: 0.16`, `rootMargin: '0px 0px -6% 0px'` — the app is at `0.12` / `-5%` today and moves onto the documented contract |
| Hover grammar | exactly four moves: lift, invert, slide, tilt. No fifth. |
| Reduced-motion idiom | **clamp, do not remove** for entrances (`0.3s`); remove for infinite loops. Ten existing blocks already do this; extend, do not reinvent. |
| Ambient loops pause off-screen | already true of the auroras; stays true |

### 1c. Re-scaled for density — with the numbers

| Role | Welcome | Dashboard | Why |
|---|---|---|---|
| Entrance duration | `0.7`–`1.0s` | `0.55s` (`--bf-app-reveal-dur`) | see 1d |
| Reveal shift | `30px` (`--bf-reveal-shift`) | `12px` (`--bf-app-reveal-shift`) | see 1d |
| Reveal stagger | `90ms` | `50ms` (`--bf-app-reveal-stagger`) | six steps must finish inside the entrance band |
| Reveals per page | unbounded (a scrolling marketing page) | **six**, hard cap (`--bf-app-reveal-max`) | a dense page has no scroll runway; most of it is above the fold at mount |
| Card lift | `-6px` (`--bf-lift`) | `-4px` (`--bf-lift-dense`) | a 132px card lifting 6px moves 4.5% of its height; the marketing card moves 1.4% |
| Land-ring alpha | n/a | `0.50 → 0.24` | on navy 0.5 read as a highlight; on `#f5f6fa` it reads as an error |
| Live-flash alpha | n/a | ring `0.45 → 0.20`, fill `0.14 → 0.06` | same reason |
| Tilt amplitude | pointer-driven, unbounded on a 420px mock | `±7deg` capped (`--bf-tilt-max`), unchanged from today | already correct; it gains a reduce guard it never had |

### 1d. The reveal arithmetic, done properly (CANVAS graft)

A 30px shift is not a fixed quantity of motion — it is a fraction of the moved object's own
height, and that fraction is what the eye reads.

| Revealed element | Height | 30px is | 12px is |
|---|---|---|---|
| Welcome feature-row visual | ~420px | 7.1% | — |
| Index card wrapping a 25-row table (42 + 25×46) | 1,192px | 2.5% | **1.0%** |
| `.dash-block`, 5 rows (5×40 + 4×16) | 264px | 11.4% | **4.5%** |
| KPI card | 132px | 22.7% | **9.1%** |
| Table row | 46px | **65.2%** | 26.1% |

> **RULE A — the 8% rule.** A reveal shift may not exceed **8% of the revealed element's own
> height**. At `12px` that licenses anything **≥150px tall** and forbids everything shorter. Table
> rows (46px), list rows, calendar cells, badges, chips, KPI cards (132px, 9.1% — *just* over)
> and every cell in every board are therefore **not reveal targets**. Reveals attach to
> **sections**: a card, a band, a strip, a board — never a row and never a cell.

Duration follows from the cap. Six steps × 50ms = 250ms for the last step to start, + 550ms =
**800ms for the page to settle**. The Welcome Page settles at 450ms + 1000ms = **1.45s**. 1.8×
faster, matching the 0.55 duration factor. At the old numbers (`0.9s` + `90ms × i`, and up to 15
reveal rules per page scope) a dashboard that fires 8 reveals is still settling at **1.53s** — and
because there is no router (§3) that happens on *every* navigation, not once.

---

## 2. Tokens: the exact additions to `client/src/design-tokens.css`

Appended, all under the `--bf-` prefix that nothing else reads, so the file stays pixel-inert until
`app-shell-daylight.css` consumes it. Two existing values are corrected.

```css
:root {
  /* ---- dense motion: the app-side companion to the entrance band -------- */
  --bf-app-reveal-shift:   12px;   /* RULE A: ≤8% of the revealed element's height */
  --bf-app-reveal-dur:     0.55s;
  --bf-app-reveal-stagger: 50ms;
  --bf-app-reveal-max:     6;      /* documentation; read by density.test.ts */

  /* ---- durations the four interaction steps do not cover ---------------- */
  --bf-dur-flash:      0.75s;  /* the land ring — dash-land / hs-deal-land / hsg-land */
  --bf-dur-live:       6s;     /* sched-live-flash; mirrors LIVE_FLASH_MS = 6000 */
  --bf-dur-skeleton:   1.4s;   /* dash-skel-shimmer — frozen at today's value */
  --bf-dur-drag:       0.26s;  /* board reflow; mirrors DASH_SORT_TRANSITION */
  --bf-dur-drop:       0.26s;  /* mirrors DASH_DROP_ANIMATION */
  --bf-dur-drop-lane:  0.34s;  /* mirrors DEAL_DROP_ANIMATION — a longer flight */
  --bf-dur-chart:      0.6s;   /* recharts bars and lines */
  --bf-dur-chart-pie:  0.4s;   /* recharts pie sweep */
  --bf-dur-cell:       0.4s;   /* schedCellIn — the banded stagger */
  --bf-stagger-band:   40ms;   /* schedCellIn's per-row delay */
  --bf-stagger-card:   25ms;   /* hsc-row-in's per-card delay, capped at 8 (§4c) */

  /* ---- the fourth hover move, re-scaled -------------------------------- */
  --bf-lift-dense:   -4px;
  --bf-tilt-max:     7deg;     /* DxTilt's existing default, now tokenised and guardable */
  --bf-spotlight-r:  220px;
  --bf-spotlight-a:  0.06;
}

/* Extend, do not reinvent: the app's ten existing blocks CLAMP entrances to 0.3s
   rather than removing them, and null infinite loops. Both idioms are kept. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --bf-app-reveal-shift:   0px;
    --bf-app-reveal-dur:     0.3s;   /* the app's clamp value, not the Welcome Page's 0.4s */
    --bf-app-reveal-stagger: 0ms;
    --bf-dur-flash:          0.01s;
    --bf-dur-cell:           0.3s;
    --bf-stagger-band:       0ms;
    --bf-stagger-card:       0ms;
    --bf-dur-chart:          0s;
    --bf-dur-chart-pie:      0s;
    --bf-lift-dense:         0px;
    --bf-tilt-max:           0deg;
    --bf-spotlight-a:        0;
  }
}
```

**Two corrections to the file as it stands**, both consequences of the fixed decision that the
accent is `#2f6bff`:

```css
--bf-focus-ring: 0 0 0 4px rgba(47, 107, 255, 0.12);   /* was rgba(26, 115, 232, 0.12) */
```

and the `#1a73e8` literal in its comment block. Also found while auditing: a leftover
`--shadow-accent` carrying `rgba(251, 133, 0, …)` from the pre-blue era — an orange accent shadow
in a product whose accent is blue. Retire it in the cleanup phase (§13 phase G).

**Amplitude tokens degrade for free.** `--bf-lift`, `--bf-lift-small`, `--bf-slide`,
`--bf-press-scale`, `--bf-reveal-shift` and `--bf-reveal-stagger` already zero in the file's reduce
block; the new `--bf-lift-dense`, `--bf-tilt-max`, `--bf-spotlight-a`, `--bf-app-reveal-*` and
`--bf-stagger-*` now do too. **Any rule written as `translateY(var(--bf-lift-dense))` or
`rotateX(var(--ry))` bounded by `--bf-tilt-max` therefore needs no reduce rule of its own.** That
is the cheapest way to satisfy RULE R: prefer a token-driven amplitude over a hard-coded one
everywhere it is possible, and RULE R's pairing assertion only has to cover what is left.

---

## 3. Page transitions between routes

**There is no router.** `page` is React state; the shell is rendered once at `App.tsx:2806` for all
23 `Page` values and never remounts. So "page transition" is a misnomer for what actually happens:

1. The shell (`.hs-shell`, top bar, rail, flyouts, FAB, BreezeAssistant, tutorial overlay,
   CommandPalette) **does not remount and must not animate.**
2. The page body component unmounts and a different one mounts.
3. `useHudMotion(rootRef)` runs fresh on the new root: it adds `.dx-ready`, queries
   `[data-reveal], [data-reveal-stagger]`, and installs a new IntersectionObserver.
4. **Every reveal target above the fold is intersecting the moment it is observed, so it fires
   immediately.** The one-shot IO does not mean once per session — it means once per *mount*.

**Therefore: the reveal cascade *is* the page transition, and it runs on every navigation.** That
is the single most important fact in this section and the reason §1d's numbers matter. At today's
values a click on Home costs a 1.4–1.5s settle; at the new values it costs 0.8s.

### 3a. What animates

| Surface | Motion | Duration | Easing | Token |
|---|---|---|---|---|
| Shell, first paint only | `bf-shell-in` — **opacity 0 → 1 only** | `0.7s` | `var(--bf-ease)` | `--bf-dur-enter` |
| Rail, first paint only | same, `animation-delay: 60ms` | `0.7s` | `var(--bf-ease)` | `--bf-dur-enter` |
| Page body, every navigation | the reveal cascade, ≤6 steps | `0.55s` + `50ms × i` | `var(--bf-ease)` | `--bf-app-reveal-dur`, `--bf-app-reveal-stagger`, `--bf-app-reveal-shift` |
| Dashboard board handoff | `bf-fade` on `.dash-board` (skeleton → real board) | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |
| Loading / error screen | `bf-fade` in | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |

**`bf-shell-in` is opacity-only, and that is deliberate.** The obvious version translates the bar
`-8px` and the rail `-8px`. Both are rejected: a non-`none` `transform` (or the independent
`translate` property) makes an element a containing block for `position: fixed` descendants, and
`data-tutorial-id="tutorial-restart-button"` lives **inside the top bar**. The tutorial overlay is a
sibling at `z-index: 80` and its spotlight is positioned from CSS variables, so today the geometry
is fine — but adding a transform to a tutorial anchor's ancestor is exactly the class of bug the
inventory warns about, and there is no test for it (`data-tutorial-id` failures are silent). An
opacity fade gives a hard guarantee at the cost of an 8px settle. Take the guarantee.

Corollary, stated as a rule the whole plan obeys:

> **RULE T.** No new `transform`, `filter`, `backdrop-filter`, `contain` or `will-change` may be
> added to `.hs-shell`, `.hs-body`, `.hs-main`, `.hs-topbar`, `.sidebar.hs-rail`, or any page-root
> element (`.dash-rx`, `.sched-rx`, `.proj-rx`, `.crew-rx`, `.equip-rx`, `.mat-rx`, `.field-rx`,
> `.delayIQ-rx`, `.settings-rx`) — every one of them is an ancestor of at least one of the 40
> static `data-tutorial-id` anchors.
>
> **The one licensed exception is `backdrop-filter: blur(14px) saturate(140%)` on
> `.hs-shell.bf-shell .topbar.hs-topbar`** (CANVAS graft: backdrop-filter is licensed in-app on the
> top bar only). It is licensed because the top bar has no `position: fixed` descendants — its four
> menus are `absolute` — and because the tutorial spotlight is drawn as a `9999px` box-shadow on a
> *sibling* overlay, not on a descendant. It gets a **browser check of the wrap-up step at 1440px,
> 768px and 375px**, not a shrug (§13, acceptance). Sticky sub-navs use an opaque `var(--wx-bg)`
> instead; the ground is flat so a blur buys nothing there anyway.

`bf-shell-in` is a **CSS animation on a static class, not a `data-reveal`.** `shellClassName` is
computed (`App.tsx:2795`), and a dynamic `className` on a `[data-reveal]` element wipes the
imperatively-added `.in` and strands the element at `opacity: 0` forever. That is a documented
failure in this repo (`data-reveal-static-classname`) and it is the reason this is an animation.

### 3b. What must NOT animate, and why

1. **No container crossfade or slide on route change.** The page body wrapper gets nothing. An
   opacity fade there would re-run on every one of the 23 routes *and* on every schedule view-key
   press, and during the fade the tutorial spotlight would be dimming the very control a gated step
   requires the user to click.
2. **No exit animation. No `AnimatePresence` around the page switch.** An exit requires holding the
   outgoing page's DOM mounted while the incoming one mounts. That puts two copies of every
   `data-tutorial-id` in the tree — breaking `schedule/pages.test.tsx:431` ("has its anchor on the
   page for every stop") — and makes every name-scoped `getByRole` ambiguous for the duration.
   Hard no.
3. **No View Transitions API.** `document.startViewTransition` snapshots the whole document, which
   would freeze the tutorial overlay and the always-mounted `BreezeAssistant` mid-transition. jsdom
   has no support, so it would silently no-op under test and diverge from production — the worst
   possible failure shape for a suite that is the only guard on 346 behaviours.
4. **The scroll reset stays instant.** `scroll-behavior` must not become `smooth` on any route
   change path (there are two — see the `hud-updates-deeplink` note), because a smooth scroll
   changes what the IntersectionObserver sees at observe time and would make the reveal cascade
   non-deterministic.
5. **The Schedule frame must never gain a `key`.** Verified: `schedule/page.tsx:602-607` holds
   `rootRef` on the frame and calls `useHudMotion` at `:603`; the frame carries exactly two reveal
   targets (`.schedule-title-row.dx-hero` at `:615`, `.schedule-control-row` at `:628`), both gated
   on `data-reveal={motion || undefined}`, and **none of the six board pages carries `data-reveal`
   on the board at all** (grep of `schedule/`: only `ScheduleStatusBand.tsx:118/:156` and
   `SchedulePage.tsx:521/:583`). Because `useHudMotion`'s effect deps are `[rootRef]` and a ref
   object is stable, the reveals fire once when Schedule is entered and **never again across the
   1–6 view keys**. That is already correct and it is the fastest route change in the product (a
   keystroke). Adding a `key` to the frame, or moving a reveal onto a board, would make every
   keypress cost a 0.55s fade. Freeze it, and comment it in the source.
6. **Settings must never be converted to `data-reveal`** (CANVAS graft — a real bug nobody else
   spotted, and I verified the mechanism). `.settings-panel-inner` is React-keyed by
   `activeSettingsView`, and `useHudMotion`'s reveal effect has deps `[rootRef]` **only**, so it
   never re-queries after a key change. The CSS rest state is `opacity: 0` gated on `.dx-ready`,
   which is already on the root. Result: the panel would go **permanently blank with no error** on
   the first category switch. Settings keeps `sx-rise` (`settings-redesign.css:1068`) and its
   `animation-fill-mode: backwards` — which is load-bearing, not a mistake: it releases the hidden
   start state after the stagger delay so hover transforms are not clobbered.

### 3c. The reveal-budget audit, and the safe direction to cut

Today the app-side scopes declare **12–15 reveal rules each**: `dashboard-redesign` 12,
`delayIQs-redesign` 13, `projects-redesign` 13, `crews-redesign` 15, `equipment-redesign` 15,
`field-updates-redesign` 15, `materials-redesign` 15, `schedule.css` 11, `hs-home` 1. The budget of
six is a cap on **rendered attribute sites per page**, not on CSS rules.

> **RULE B — cut attributes, never the CSS.** To reduce a page's reveal count, delete the
> `data-reveal` **attribute** from the JSX. The element then renders at `opacity: 1` because the
> hidden rest state is gated on `[data-reveal]`. Never delete the `.dx-ready` gate or the rest
> state — an element left with the attribute and no rule is harmless; an element left hidden with
> no observer is invisible forever.

The six, named:

| Page | The six reveals |
|---|---|
| Dashboard (`.dash-rx.hs-home`) | 1 greeting header · 2 Schedule Status band · 3 announcement banner / trial notice · 4 performance-tile strip *as one `[data-reveal-stagger]`* · 5 **the panel board as one unit** · 6 the field-updates split panel |
| Index page (Projects / Crews / Equipment / Materials / Field / DelayIQs) | 1 title row · 2 KPI strip (stagger) · 3 quick-filter + tab row · 4 the table card · 5 the footer count + pagination row · 6 spare |
| Schedule frame | 1 title row · 2 control row · (landing adds 3 `.schedule-layout`, 4 `.schedule-page-footer`) — already inside budget |
| Sales (Contacts / Companies / Deals) | 1 title row · 2 KPI strip (stagger) · 3 view tabs · 4 the table or board card · 5 footer · 6 spare |

The panel board is item 5 as **one** reveal, never eleven. Eleven panels at 50ms is 500ms of
staggered arrival on a layout the user themselves arranged and has already seen — and each panel is
absolutely positioned from `dash:layout`, so revealing them individually animates a geometry the
user configured. One reveal on `.dash-board`, or preferably the `bf-fade` handoff from the skeleton
(§6c), which is the beat that already exists.

---

## 4. List and card entrance, the stagger rule, and where staggering is wrong

### 4a. Entrance, by surface

| Surface | Motion today | Motion after | Duration | Easing | Token |
|---|---|---|---|---|---|
| Index card wrapping a table | `[data-reveal]` on the card, 0.9s / 28px | same, on the card | `0.55s` / `12px` | `--bf-ease` | `--bf-app-reveal-dur` / `-shift` |
| Table rows (6 workspace index tables) | **none** | **none** — stays none | — | — | — |
| Table rows (3 Sales tables) | `hsc-row-in` 0.36s, `25ms × index`, unbounded | **retired from `tbody tr`** (§11 BUG 3) | — | — | — |
| KPI strip | `[data-reveal-stagger]`, 0.75s, 40/120/200/280/360ms | same shape, retimed | `0.55s` + `50ms × i` | `--bf-ease` | `--bf-app-reveal-stagger` |
| Gantt KPIs | `hsg-rise` 0.5s, `50ms × --i` (`--i` 0..3) | keep the name, retime | `0.55s` + `50ms × i` | `--bf-ease` | `--bf-app-reveal-*` |
| Month calendar cells | `schedCellIn` 0.5s, `55ms × --d` where `--d` = **weekIndex** | keep — **this is the model** | `0.4s` + `40ms × band` | `--bf-ease` | `--bf-dur-cell`, `--bf-stagger-band` |
| Deal cards | `hsc-row-in` 0.36s, `25ms × index` | keep, **index capped at 8** | `0.36s` + `25ms × min(i,8)` | `--bf-ease` | `--bf-stagger-card` |
| Kanban cards | none | none — `LANE_WINDOW` windows them; motion on windowed content misleads | — | — | — |
| `.dash-block` panels, first paint | none | none — `bf-fade` on the board instead | `0.18s` | `--bf-ease` | `--bf-dur-press` |
| Announcement banner | `hsh-rise` 0.5s | keep the name, retime | `0.55s` | `--bf-ease` | `--bf-app-reveal-dur` |
| Sales timeline items | `hsc-rise` 0.4s, per-item | keep, cap the index at 8 | `0.4s` + `25ms × min(i,8)` | `--bf-ease` | `--bf-stagger-card` |
| Record drawer | `hsc-fade` 0.2s backdrop + `hsc-slide-in` 0.32s panel | keep both names | `0.18s` / `0.3s` | `--bf-ease` | `--bf-dur-press` / `--bf-dur-panel` |
| Gantt drawer | `hsg-fade` 0.2s + `hsg-slide-in` 0.32s | keep both names | `0.18s` / `0.3s` | `--bf-ease` | `--bf-dur-press` / `--bf-dur-panel` |
| `.pdx` dialogs | `pdx-backdrop-in` 0.32s + `pdx-dialog-in` 0.52s + `pdx-field-in` stagger | keep all three | `0.18s` / `0.55s` / `0.4s` + `40ms × i` | `--bf-ease` | `--bf-dur-press` / `--bf-app-reveal-dur` / `--bf-dur-cell` |
| What's-new + AddOnPrompt dialogs | `hs-upd-fade` 0.18s + `hs-upd-pop` 0.26s | keep both | `0.18s` / `0.28s` | `--bf-ease` | `--bf-dur-press` / `--bf-dur-move` |
| Command palette | **nothing — hard-cuts in** | `bf-fade` backdrop + `bf-pop` dialog | `0.18s` / `0.25s` | `--bf-ease` | `--bf-dur-press` / `--bf-dur-hover` |
| Rail flyout | `hs-flyout-in` 0.16s | keep the name | `0.25s` | `--bf-ease` | `--bf-dur-hover` |
| Top-bar menus | `hs-pop` 0.16s | keep the name | `0.25s` | `--bf-ease` | `--bf-dur-hover` |
| Account menu | **nothing — no entrance at all** | gains `hs-pop` | `0.25s` | `--bf-ease` | `--bf-dur-hover` |
| Field-variance drawer | `sv-drawer-in` 0.22s | keep | `0.25s` | `--bf-ease` | `--bf-dur-hover` |
| Bookmarks page tiles | `bm-rise` 0.4s | keep | `0.55s` | `--bf-ease` | `--bf-app-reveal-dur` |
| Settings panel | `sx-rise` 0.6s + 6-step stagger, **replays on every category switch** | keep the keyframe and `fill-mode: backwards`; retime | `0.4s` + `40ms × i` | `--bf-ease` | `--bf-dur-cell`, `--bf-stagger-band` |
| AI panel | `bfz-in` 0.32s, `bfz-rise` 0.32–0.5s, `bfz-pop` 0.5s, 4-card stagger | keep all four names, retime | `0.3s` / `0.4s` / `0.55s` | `--bf-ease` | as above |

**On the Command palette.** `command-palette.css` has **zero** transitions and **zero** animations —
the palette hard-cuts in, and next to a system that animates every other overlay that reads as
broken. The entrance is added as **CSS on an already-mounted node**, never as a JS transition:
`CommandPalette` resets its query and focuses the input in a `requestAnimationFrame`, and anything
that delays mount races that focus (`components/CommandPalette.test.tsx:12` asserts "renders
nothing while closed"). Mounting stays synchronous.

**On Settings replaying.** `sx-rise` on `.settings-panel-inner > *` runs on every category switch
because the wrapper is keyed. Today's last item lands at `0.42s + 0.6s = 1.02s`. Retimed to
`0.4s + 40ms × 5 = 0.6s`. It *should* replay — the panel genuinely re-renders and the stagger is
what makes the new category legible — so this is the one licensed exception to the one-shot rule,
and it is licensed precisely because it is not a scroll reveal. §3b.6 explains why it can never
become one.

### 4b. The stagger rule

> **RULE S — stagger bands, never items.** A stagger index must come from a **bounded structural
> position** (row band, column, nth-child, a fixed set of 4–6 siblings), never from a data array's
> index. If the count is data-driven, cap it: `min(index, 8)` in JSX, or a CSS
> `:nth-child(n+9)` catch-all (the pattern `crews-redesign.css` already uses at `:nth-child(n+7)`).
> Total stagger travel may not exceed **250ms** (five steps at 50ms), because the whole entrance
> must settle inside 800ms.

The repo already contains one correct and one incorrect implementation of the same idea, 60 lines
apart in product terms:

- **Correct** — `schedule/parts/month.tsx:148` sets `--d` to `cell.weekIndex`, so a 42-cell month
  grid staggers in **6 bands**; the last band starts at 275ms.
- **Incorrect** — `App.tsx:30673` sets `--i` to the raw row `index`, and `hs-contacts.css:79-81`
  reads `animation-delay: calc(0.025s * var(--i, 0))` with `fill-mode: both`. See §11 BUG 3.

### 4c. Where staggering is wrong

1. **Table rows.** Any table. The delay is unbounded, `fill-mode: both` holds the row at
   `opacity: 0` for its whole delay, and the rows remount on every page change, filter change and
   search keystroke. Retired from `.contacts-page .hs-table tbody tr`; never added to the six
   workspace tables. The keyframe `hsc-row-in` survives for `.hs-deal-card` (a bounded lane).
2. **Anything under 150px tall** — RULE A. Rows, cells, chips, badges, pills, `kbd` chips.
3. **Cells in a grid.** Stagger the band. A per-cell stagger on a 7×6 month grid is 42 steps.
4. **The panel board.** Eleven user-arranged, absolutely-positioned panels. One `bf-fade` on the
   board.
5. **Windowed or virtualized lists.** `LANE_WINDOW` = 24 Kanban cards, `QUEUE_WINDOW` = 30 queue
   chips, `EAGER_ROWS` = 12 Week crew rows with the rest as `.crew-row.is-lazy` placeholders,
   `DEFAULT_VISIBLE_ROWS` = 24 Gantt rows with `.gantt-row-spacer` for the skipped ones,
   `GANTT_ROW_CAP` = **300** (the inventory says 200 in two places; `GanttPage.tsx:159` and
   `scale.test.tsx:106/:109` both pin 300). A stagger over a window is a lie about the data: the
   25th card arrives with no delay while the 24th waited 600ms. Windowed content gets no entrance.
   `schedule/scale.test.tsx:125` pins 40 `.crew-row`, 28 `.crew-row.is-lazy` and 28
   `.crew-row.is-lazy .schedule-cell` — the placeholders are load-bearing.
6. **Anything whose parent re-renders on a keystroke.** The search boxes filter live.
7. **The six schedule board views.** They have no `data-reveal` today; keep it that way (§3b.5).

---

## 5. Hover and press, mapped onto the four-move grammar

The two-clause card licence (CANVAS graft) decides which surfaces get which move, and it is
grep-checkable doctrine:

> **RULE C — the card licence.** A white bordered rectangle is licensed only if (1) its boundary is
> itself interactive — draggable, resizable, dismissible — **or** (2) it is a viewport clipping a
> scrolling world. A licensed-by-(1) frame gets **drag** feedback and never **lift**. A
> licensed-by-(2) frame gets neither. Only a card whose whole body navigates gets **lift**.

That single rule is why `.dash-block` is off hover-lift and on drag-lift, and it is what stops the
grammar from decaying into "everything moves a bit."

### Move 1 — LIFT (cards that navigate)

`transform: translateY(var(--bf-lift-dense))` = `-4px`, plus `box-shadow: var(--bf-shadow-card-hover)`.
Duration `var(--bf-dur-move)` = **0.28s**, easing `var(--bf-ease)`.

| Applies to | Reason |
|---|---|
| `.bm-tile` (Bookmarks page tiles) | whole tile navigates |
| `.cc-apps-grid > *` (Home app tiles) | whole tile navigates |
| Map job-site cards (`expand-map`'s `.lm-*` wrapper) | whole card opens |
| Schedule landing view cards | whole card navigates; each also prints its 1–6 `kbd` chip |
| `.hs-index-card` **only where the whole card is a link** | most are not — see below |
| Project cards, Crew directory cards | whole card opens the record |

**Never lifts:** `.dash-block` (draggable → clause 1 → drag feedback), `.hs-kpi` and
`.hs-kpi` figures (static readouts), `.kpi-card` (it carries **tilt** — move 4), `thead`, any
table card wrapping a scrolling world (clause 2), `.hs-flyout` / `.hs-menu` / `.notifications-panel`
(they are already floating), `.sched-kan-card` and `.schedule-job` at rest (they are drag sources).

Mixing lift onto a non-interactive surface is precisely the incoherence the four-move grammar
exists to prevent, and it is the most common way a re-skin loses the language.

### Move 2 — INVERT (pills)

Outline becomes ink fill. Transition `background-color`, `border-color`, `color` over
`var(--bf-dur-hover)` = **0.25s**, easing `var(--bf-ease)`.

| Applies to | Rest | Hover |
|---|---|---|
| `.hs-btn` | transparent, `1px solid rgba(28,28,26,0.13)`, `#1c1c1a` | `#1c1c1a` fill, `#fdfcf9` text |
| `.topbar-verify` | pill, `12px/600`, hairline border | inverts; all four label states and both aria strings unchanged |
| `.sched-undo` | `1px currentColor`, 999px, transparent | inverts; `:disabled { opacity: 0.6 }` kept. **The accessible name `Undo` is pinned in six places** (`schedule/pages.test.tsx:197/:220/:270/:298/:723/:759`) — restyle only |
| `.error-screen-back` ("Back to log in") | outline pill | inverts. Retires its off-curve `background 0.16s ease, border-color 0.16s ease` |
| `.hs-upd-btn-secondary` ("Not now") | outline pill | inverts |
| `.sv-reject` ("Keep the plan") | outline pill | inverts |

**Declared micro-deviation, carried over from the concept:** `AskAiButton` (the 52px ink FAB) and
`.hc-assistant-fab` **lift** rather than invert — `translateY(-3px)` + `var(--bf-shadow-pill-hover)`
over `var(--bf-dur-move)`. A pill that floats over content at rest would read as *breaking* if it
inverted to an outline. Rule: **floating pills lift; anchored pills invert.**

**Declared deviation on the primary button:** `.hs-btn-primary` stays **blue** (`#2f6bff` →
`#1f57e0` on hover, shadow `0 4px 12px rgba(47,107,255,0.2)` → `0 8px 22px rgba(47,107,255,0.28)`),
not the Welcome Page's ink pill. `#2f6bff` is already the action colour across all eleven app scopes
and inverting that relationship would re-teach the whole product for the sake of doctrine. The ink
pill is spent in-app on exactly one thing — the AI FAB — which is where the marketing page uses it.

### Move 3 — SLIDE (directional links and menu rows)

`transform: translateX(var(--bf-slide))` = `3px`, duration `var(--bf-dur-press)` = **0.18s**,
easing `var(--bf-ease)`. Paired with the background wash `rgba(28,28,26,0.05)`.

Applies to: every `.hs-flyout-item`; every row in the four top-bar menus (Create, Bookmarks,
Account, and the notifications list); the trailing chevron / `.hs-row-action` cluster on a hovered
table row; `.hs-bookmarks-add`'s icon; `.cmdk-item[aria-selected="true"]`; the **eight** "View all"
links (`View all approvals on the schedule page`, `View all early warnings`, `View all project
alerts`, `View all field updates`, `View all materials`, `View all equipment`, `Open the Week
board`, `View all inspections on the projects page`) — each keeps its distinct `aria-label`;
`.gantt-menu` items; the Gantt right-click menu's five-to-nine items.

**The hover-reveal control layer keeps its reveal, and gains a touch path** (EDITORIAL graft). This
is an entire class of *actions* that is invisible in any screenshot a redesign works from, so it is
trivially dropped. It must not be:

- **12 `.hs-row-action` buttons**, each with an `aria-label` and a `title`: `Delete <project>` /
  `Delete project`; `Call <lead>` / `Call`; `Text <lead>` / `Text`; `Edit <lead>` / `Edit contact`;
  `Edit <company>` / `Edit company`; `Delete <company>` / `Delete company`; `Edit <deal>` /
  `Edit deal`; `Delete <deal>` / `Delete deal`; `Delete <crew>` / `Delete crew`;
  `Edit <equipment>` / `Edit equipment`; `Remove <equipment>` / `Remove equipment`;
  `Correct field update from <user>` / `Correct this report`.
- **`.card-delete`** on Project and Crew cards: `opacity 0 + translateY(-3px) scale(0.94)` →
  visible on card `:hover` / `:focus-within` over `0.22s` → retimed to `var(--bf-dur-hover)`.
- **`.dash-drag-handle`**, `.dash-hide`, `.dash-resize` — revealed on panel `:hover` /
  `:focus-visible`, plus a `::after` tooltip.
- **`.hs-flyout-star`** / `.hs-bookmark-remove`, `.hs-flyout-tip`, `.hs-flyout-upgrade`,
  `.sched-matrix-tip`, `.sched-cal-add`, `.map-marker-label`.

Only **three** files ship an `@media (hover: none)` always-visible fallback
(`projects-redesign.css:1081`, `crews-redesign.css:499`, `hs-index.css:822`). Everything else in
that list is unreachable on a touch device. Two fixes:

```css
/* Touch and small screens: the control layer stops being a hover secret. */
@media (max-width: 1023px), (hover: none) {
  .bf-shell .hs-flyout-star,
  .bf-shell .hs-bookmark-remove,
  .bf-shell .dash-drag-handle,
  .bf-shell .dash-hide,
  .bf-shell .dash-resize,
  .bf-shell .sched-cal-add { opacity: 0.55; transform: none; }
}
```

and the locked add-on tooltip fires on **`:focus-within` as well as `:hover`** —
`.hs-flyout-tip` (`role="tooltip"`, `id="hs-addon-tip-<page>"`, wired by `aria-describedby`) is
today doubly unreachable on touch: it sits inside a surface that cannot open and is revealed by an
event that cannot fire, so the explanation never precedes the `AddOnPrompt`. `tests/map.test.tsx:103`
pins the prompt's accessible name `Get Map & Field Ops` and the button name `Close`; the tip's
`role` and both aria wires are preserved exactly.

### Move 4 — TILT (the app's product-mock equivalent) — it already exists

The Welcome Page's signature is a product mock tilting under the pointer inside a lit stage. **The
app already has the tilt**, and the inventory's completeness check is right that it is the app's
most-used interactive motion after `data-reveal`, and right that nobody catalogued it:

`DxTilt` (`schedule/parts/shared.tsx:75-95`) writes `--rx` / `--ry` on every `pointermove` at
`±7deg` and resets them on `pointerleave`. Six stylesheets read it into the same composed
transform — `dashboard-redesign.css:284`, `schedule.css:1002`, `projects-redesign.css:297`,
`equipment-redesign.css:244`, `materials-redesign.css:244`, `field-updates-redesign.css:244`:

```css
transform: translateY(var(--lift, 0px)) rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg));
```

`--lift` is the hover token composed into the *same* transform (`-6px` on cards, `-4px` on
directory cards). **This is why a redesign cannot swap the transform property** — and it is the
same lesson `sb-nav-in` encoded by animating `translate` rather than `transform`
(`sidebar-redesign.css:132`) and `sx-rise` encoded with `animation-fill-mode: backwards`
(`settings-redesign.css:1064`). Both look like mistakes and are not. That paragraph goes into the
new stylesheet's header comment, because `sidebar-redesign.css` is being deleted and the lesson
would leave with it.

Decision: **keep the tilt, tokenise its bound, and give it the reduce guard it has never had.**
`max` becomes `var(--bf-tilt-max)` (7deg, zeroed under reduce), and the composed transition goes
from `0.34s` to `var(--bf-dur-move)` (0.28s). See §11 BUG 1 — the missing guard is a real bug, not
a style choice.

**Where the tilt cannot go, the spotlight goes instead.** A `.dash-block` cannot tilt: it is
draggable, resizable, and full of 13px text that would smear. The *gesture* — the surface
acknowledging where the pointer is — re-scales to a low-amplitude radial highlight
(`components/ui/spotlight-surface.tsx`, §7): a `::before` at `inset: 0; border-radius: inherit;
pointer-events: none` painting `radial-gradient(var(--bf-spotlight-r) circle at var(--sp-x)
var(--sp-y), rgba(47,107,255,var(--bf-spotlight-a)), transparent 70%)`, `opacity 0 → 1` over
`var(--bf-dur-hover)`. It reads `--mx` / `--my` if the page root publishes them — `useHudMotion`
already sets them on ten roots — so on those pages it adds **zero** listeners.

### Press

`transform: scale(var(--bf-press-scale))` = `0.94`, `var(--bf-dur-press)` = **0.18s**, on
`:active` for every icon button (`.hs-btn-icon`, the eight top-bar icon buttons, the rail's nine
hubs and gear, `.dash-hide`, `.dash-resize`, `.hs-row-action`, the palette's rows).

**The chrome's nine gesture keyframes are press feedback, not a fifth hover move.** `hs-rail-pop`
(spring), `hs-rail-draw` (stroke redraw), `hs-rail-ring` (ring pulse), `hs-top-spin` (create `+`),
`hs-top-gear`, `hs-top-bell` (swing), `hs-top-badge` (bubble hop), `hs-top-twinkle` (AI sparkle),
`hs-tag-in`/`hs-tag-ping`. Editorial proposed deleting nine of them; the judges called that
defensible on grammar but noted it must be done by editing the four reduce blocks, not by leaving
them orphaned. **My call: keep all of them, keep their names and their uses, cut the amplitude, and
re-classify them.** Values only:

| Keyframe | Today | After | Reason |
|---|---|---|---|
| `hs-rail-pop` | `scale 1.24 / -9deg` at 35% | `1.08 / -3deg` | a 24% overshoot on a 40px button on a light ground reads as a bounce, not a spring |
| `hs-top-spin` | `200deg / scale 1.2` at 60% | `180deg`, no scale | the rotation carries the meaning; the scale was decoration |
| `hs-top-bell` | six-step swing `0/16/-13/9/-6/3/0` deg, 0.9s | three-step `0/10/-6/0`, `0.55s` | 0.9s is outside every duration band in the system |
| `hs-top-twinkle` | `1.3 / 18deg` at 30% | `1.12 / 8deg` | it sits on the one licensed gradient; it should sparkle, not spin |
| `hs-rail-ring` | `rgba(47,107,255,0.55)` → 12px | alpha `0.14`, same geometry | 0.55 was built for navy |
| `hs-tag-ping` | 2.4s **infinite** | 2.4s, `animation-iteration-count: 3` | see below |
| `hs-rail-draw` | 0.6s stroke redraw | **0.6s, unchanged** — but see the optional note |
| `hs-top-gear`, `hs-top-badge`, `hs-tag-in` | — | unchanged | already inside the bands |

**The accent budget, expressed as a motion count** (EDITORIAL graft, actually enforced this time):

> **RULE N — at most one blue element visible in the nav at a time, and at most one infinite
> animation running in the chrome at a time.**

`hs-tag-ping` is `2.4s infinite` on `.hs-rail-tag`, and two hubs can carry tags simultaneously
(Sales `New` plus a `Beta`) — two blue rings pinging forever, in a nav that is supposed to hold one
blue. It already stops (`animation: none`) once its hub is active, which proves the author agreed
it should stop; three iterations makes it stop for everyone. **Declared visible change.** The same
rule retires the gold bookmarks star (`#f0b354`/`#e8a33d` → `#2f6bff` with `fill: currentColor`,
the filled-vs-outline distinction that carries the information untouched) and re-bases the violet
Beta pill (`#7c3aed`/`#a78bfa` → `#6d28d9`, because light-on-navy violet disappears on paper).
Editorial claimed the discipline and skipped both costs; they are declared here.

**Optional, not recommended:** `hs-rail-draw` is the one member of the set with no counterpart
anywhere on the Welcome Page — a `stroke-dasharray: 120` redraw on every `svg` child of every
hovered rail and top-bar icon button, 17 buttons. Retiring it *by use* (drop the selector, keep the
keyframe declared and nulled) would be defensible. I do not recommend it: it is the chrome's
signature, it is already nulled under reduce at `app-shell-hubspot.css:942`, and the redesign has
enough declared visible changes.

---

## 6. Loading skeletons

### 6a. The shape rule

> **RULE K.** A skeleton is licensed only where the real content's geometry is **known before the
> data arrives**, and it must be drawn from the **same source** as the real layout. Where geometry
> is data-dependent, a skeleton is a lie — use a labelled indicator inside the real frame instead.

`DashboardSkeleton` already obeys both halves: it renders one block per entry in
`DASH_LAYOUT_DEFAULT` and writes `gridColumn: x+1 / span w`, `gridRow: y+1 / span h` inline against
`grid-auto-rows: 40px`, so it is *geometrically the same board*. That coupling is also its risk
(`dashGrid.test.ts`, 19 tests, plus real users' persisted `dash:layout`): change the column count,
the row unit or the default layout and the skeleton silently desyncs from the page it stands in
for. `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16` and `grid-auto-rows: 40px` are all
**frozen**.

### 6b. The three-tier ladder

| Tier | When | Shape | Motion |
|---|---|---|---|
| **A — geometric skeleton** | geometry known from a constant | real grid, real row heights, shimmer lines | `dash-skel-shimmer` `1.4s` `ease-in-out` infinite (`--bf-dur-skeleton`) |
| **B — shaped placeholder** | geometry partly known (a table's row height is, its row count is not) | the **real frame** at the real row height, N shimmer rows, the real copy | same shimmer |
| **C — labelled indicator** | geometry unknown, or the wait is under ~400ms | `.spin` + a word, or a busy button label | `spin 1s linear infinite` |

Tier C keeps every existing site and every string: `.diq-loading` "Scanning the schedule…",
`'Loading…'` in `ExportMenu`'s `.helper-text`, "Comparing snapshots…" (`WeeklyDigest`), "Checking
where the plan stands…" (`.ss-strip.ss-empty.is-compact`), "Checking the schedule…"
(`.cc-empty-line`), "Saving…" on the work calendar and the CPM Re-baseline, and all ~30 busy button
labels ("Saving…", "Sending…", "Logging…", "Creating…", "Scheduling…", "Deleting…", "Applying…",
"Opening checkout…", "Importing…", "Joining…", "Undoing…"). **Note the eight that use three dots
rather than the ellipsis character** — `Scheduling...` (`week.tsx:366`), `Finding Route...`
(`App.tsx:29646`), `Adding...` (`:29522`), `Saving...` (`:38192`), `Building workspace...`
(`:7407`), plus the placeholders `Search for anything...` (`:19812`) and
`Crew progress, materials, safety notes...` (`:37954`, `:38170`). Standardising them is a **copy
change and therefore out of scope**; flagged, not sneaked in.

### 6c. The three surfaces the inventory flags

**1. Full-viewport loading screen** (`.loading-screen`, `App.tsx:2765`, `styles.css:13610`).
Today: `Loader2 .spin` + the literal `"Loading BuildFlow HUD"`, hard-cut in, ground `#f4f7fb`
(not the token ground), colour `#173055` (the third ink).

- Ground → `#f5f6fa`; text → `18px/600` `#1c1c1a`; entrance → `bf-fade` `0.18s` `var(--bf-ease)`.
- The string is wrapped in the **already-ported** `components/ui/text-shimmer.tsx` (58 lines) at
  `duration={1.6}`. Zero new files. The copy, the `Loader2` and the `.spin` are unchanged.
- **It does not get a skeleton, and RULE K is the reason.** This gate sits *above* the shell for
  all 23 routes, so at that moment the destination page is unknown; any skeleton would be the wrong
  shape for 22 of them.
- `retryTransient` (`App.tsx:39130`) — 400/900/1600ms backoff on 5xx and network failures, never on
  4xx, wrapping `loadBootstrap` and `apiDemoLogin` — is invisible loading resilience and is
  **untouched**. `App.test.tsx:1085` ("rides out a transient API failure instead of dead-ending on
  the error screen") asserts `/starting or unavailable/` never renders and `bootstrapCalls >= 3`.

**2. Error screen** (`.loading-screen.error-screen`).
Today: hard-cut, no entrance; `.error-screen-back` transitions `background 0.16s ease,
border-color 0.16s ease` — an off-curve duration that appears nowhere in the token set.

- Entrance → `bf-fade` `0.18s` `var(--bf-ease)`.
- **`AlertTriangle` gets no animation.** An error must not wiggle, pulse or spin; motion on an error
  icon reads as a retry in progress.
- Both actions unchanged: `"Try again"` → `runBootstrap`, `.error-screen-back` `"Back to log in"` →
  `returnToWelcome`. Primary → blue pill (`var(--bf-dur-hover)`), secondary → invert-on-hover pill.
  Message capped at `var(--bf-app-prose)`; the fallback string
  `"BuildFlow data is unavailable."` unchanged.
- The auth path deliberately does **not** reach this screen (`enterAfterAuth` lets the error
  propagate so the login form shows it inline, commented at `App.tsx:2510-2545`). Unchanged.

**3. `DashboardSkeleton`** (`App.tsx:25601`, `hs-home.css:2040-2073`).
Frozen: `role="status"`, `aria-label="Loading your dashboard"`, `aria-busy="true"`, the three
greeting lines (40% / 64% at 26px / 52%), the 128px status-band strip, one block per
`DASH_LAYOUT_DEFAULT` entry with its inline grid position, three shimmer lines per block
(40% / 80% / 64%), and `grid-auto-rows: 40px`. `App.test.tsx:1109` asserts the
`role="status"` / name pair appears then disappears.

- `.dash-skel-block` radius `12px → 18px`; border → `rgba(28,28,26,0.07)`.
- `.dash-skel-line`'s three-stop gradient re-based onto the ground:
  `#f5f6fa → #eaedf3 → #f5f6fa` at `background-size: 200% 100%`.
- `dash-skel-shimmer` stays **1.4s ease-in-out infinite** (`--bf-dur-skeleton`) and stays nulled
  under reduce (`hs-home.css:2069`). An `ease-in-out` breathing loop is correct here; the house
  curve overshoots and would make the band snap.
- **New: the handoff.** Today the skeleton hard-cuts to the real board. `.dash-board { animation:
  bf-fade 0.18s var(--bf-ease) both }` — the beat that makes the whole bootstrap feel like one
  motion instead of two states.

### 6d. Two more surfaces that need a tier, and four that must not get one

**Needs Tier B — the three Sales index tables.** They genuinely fetch (`sales === null &&
!loadError`), and today the loading state is the *empty* state's shape: `"Loading contacts…"` /
`"Loading companies…"` / `"Loading deals…"` rendered inside `.hs-empty`, which is a 44px centred
block. So the card collapses to 44px and then jumps to full height when the data lands.

Fix that preserves every string: keep the four-branch `<strong>` ternary and its `<span>` mirror
exactly (`'Loading contacts…'` → `'<Entity> could not be loaded'` → `'No <entity> yet'` → `'No
<entity> match that view'`), and render it inside a `.bf-skel` frame of **six shimmer rows at the
real 46px row height** so the card holds its size. The `thead` stays rendered — its seven column
heads are the eyebrow role and they are known before the data. Nothing is added to the accessible
tree beyond the `role="status"` the frame carries.

**Needs Tier C only — the trucker address autocomplete.** `"Searching addresses…"` currently renders
as an `<li class='trucker-suggestions-empty'>` — a loading line rendered through the empty slot.
Keep the string, keep the slot, add nothing.

**Must NOT get one:**

1. **The six workspace index tables** (Projects, Crews, Equipment, Materials, Field updates,
   DelayIQs). They render from already-loaded bootstrap data — there is no async, so there is no
   loading state and adding one would be **inventing a state**. Say so in the stylesheet header so
   nobody adds it in a later session.
2. **The panel board.** `DashboardSkeleton` already covers that beat.
3. **The Gantt, Week, Month, Kanban, Matrix and List boards.** They render from the same loaded
   data; their placeholders (`.crew-row.is-lazy`, `.gantt-row-spacer`, `.gantt-sidebar-item.is-empty`)
   are *virtualization* placeholders, a different state family, and `schedule/scale.test.tsx:112/:125`
   pins their heights and counts. Do not shimmer them — a shimmer says "data is coming", and the
   data is already here.
4. **The five empty-state visual languages.** `.hs-empty`, `.hs-home-empty`/`.cc-empty-line`,
   `.schedule-empty-state`, the dashed slots (`.sched-kan-empty`, `.hs-board-empty`,
   `.map-site-empty`, `.dashboard-feed-empty`) and `.empty-state`/`.inline-empty-state`. Unifying
   them is the highest-leverage empty-state change in the product and it is **out of scope for a
   motion plan** — but note the constraint it creates: whatever a future session does there must
   keep every one of the ~40 unlisted copy strings the completeness check enumerates (the five
   Dashboard legacy panel empties, the four Map panel empties, the six Reports "no data yet" basis
   sentences, the WeekPage three-branch queue helper, the schedule-landing queue overflow line, and
   the three delete-confirmation consequence summaries), plus the em-dash `—` missing-value
   convention at ~20 sites. Eight literal strings are pinned by tests: `No materials added yet`,
   `No projects added yet`, `No crews added yet`, `No equipment added yet`, `No jobs are trending
   behind. Nothing to recommend today.`, `No approvals waiting on you`,
   `Schedule status couldn't load.`, `Drop a job here`.

---

## 7. Chart reveals (the recharts surfaces), and whether they replay

**Eleven surfaces, enumerated.** `grep -c '<ResponsiveContainer'` → App.tsx **5**, TimeCard.tsx **6**:

| # | Site | Chart | Height |
|---|---|---|---|
| 1 | `App.tsx:26250` | Dashboard materials-readiness donut (`PieChart` + `Pie`, `innerRadius 42`) | 190 |
| 2 | `App.tsx:28156` | Projects health donut (`PieChart` + `Pie` + `Cell`, "No data" fallback) | 150 |
| 3 | `App.tsx:38756` | Reports delay-impact `BarChart` over `data.delayIQs` | 220 |
| 4 | `App.tsx:38928` | Reports planned-vs-actual hours `BarChart` | 260 |
| 5 | `App.tsx:38962` | Reports backlog-forecast `RechartsLineChart` | 260 |
| 6–11 | `TimeCard.tsx:1202, 1312, 1327, 1348, 1494, 1678` | labour-cost bars, three approval-filter charts, a pie, a 40px sparkline strip | 260 / 220 ×3 / 180 / **40** |

**Today, verified:** `isAnimationActive`, `animationDuration` and `animationBegin` appear **nowhere**
in `client/src` (grep, zero hits). So all eleven run recharts' defaults — roughly **1500ms** grow-in
for bars and lines, **400ms** sweep for pies, on recharts' own `ease` — with no reduced-motion gate
of any kind. That is the largest single block of unmanaged motion in the product.

### 7a. The reveal

```tsx
// Bars and lines
animationBegin={0} animationDuration={600} animationEasing="ease-out"
// Pies
animationBegin={0} animationDuration={400}
// The 40px sparkline strip at TimeCard.tsx:1678
isAnimationActive={false}
```

`600ms` is `--bf-dur-chart`; `400ms` is `--bf-dur-chart-pie`. Both sit inside the entrance band and
below the 800ms page-settle budget, so a chart finishes with the page rather than after it.

**Declared deviation on easing.** recharts' `animationEasing` accepts only
`'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'`. **A cubic-bezier cannot be
expressed**, so the house curve is genuinely unavailable here. `ease-out` is the nearest of the five
to `cubic-bezier(0.22, 1, 0.36, 1)` (both decelerate, neither overshoots visibly at 600ms). This is
the one place in the plan where `var(--bf-ease)` cannot be used, and it is a library limit, not a
choice.

**The 40px strip is `isAnimationActive={false}` on purpose.** A 600ms grow on a 40px chart is not a
reveal, it is noise; and RULE A already forbids a 12px reveal on a 40px object.

**The inline-SVG `Sparkline` on the Dashboard performance tiles gets nothing, and never will.** It
is hand-drawn SVG with no animation today. A `pathLength` draw would need `stroke-dasharray` from
`getTotalLength()`, which **jsdom returns 0 for** — so the line would render invisible under test,
and on a genuinely zero-length path (a single reading) in production too. `App.test.tsx:1509`
reads `.cc-spark-line` and `:1523` asserts `.cc-spark` is `null` for a tile with no honest
comparison. Leave it alone. Its three-state trend ladder (`up`/`down` with `'<+|−>N pts vs last
week'`, `flat` with the literal `'Held vs last week'`, and `{}` → **no** `.cc-trend` row and **no**
`<Sparkline>` at all) is deliberate and commented at `App.tsx:23432`; the redesign restyles it and
changes none of the three branches.

### 7b. Do they replay? No — and today they do

> **RULE H — a chart animates on mount only.**

recharts applies `animationDuration` to **data updates as well as mount**. Two of the eleven sit
directly behind a filter: `App.tsx:38756` re-derives its array from `data.delayIQs` on every filter
change, and `TimeCard.tsx:1312/:1327/:1348` sit behind the Pending / Overtime / Flagged / All
`role="tablist"`. So today, clicking a TimeCard approval tab re-grows the bars over 1.5s. That is
exactly the replay the one-shot rule forbids, and it is why setting `animationDuration` alone is
not enough.

There is no per-update flag in recharts. The mechanism is to hold the flag in state and drop it
after the first run — one small shared hook, so there is one place:

```tsx
/** recharts animates on every data change; the house rule is one-shot.
 *  Default `false` when matchMedia is absent — the same shape every media-gated
 *  helper in this redesign uses. test/setup.ts stubs matches:false, so under test
 *  `active` starts true, exactly as today: no test behaviour changes. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useChartAnimation() {
  const [active, setActive] = useState(() => !prefersReducedMotion());
  return { isAnimationActive: active, onAnimationEnd: () => setActive(false) };
}
```

Spread onto each `<Bar>` / `<Line>` / `<Pie>`. Under reduce it starts `false`, so the chart paints
its final state immediately — which is the correct reduced-motion behaviour for a chart (the *data*
must never be withheld, only the animation).

**Why this is safe for the suite:** `test/setup.ts:57` stubs `matchMedia` to `matches: false` for
every query, so `active` starts `true` and the charts behave under test exactly as they do today,
where 346 tests pass with recharts animating. No test reads a bar's geometry; the only chart
assertions in the suite are on the inline `Sparkline`.

---

## 8. Drag and resize feedback

One grammar across all three boards — **lift → neighbours glide → dashed slot marks the target →
the dropped thing pulses once it settles** — and the good news is that all three are already on the
house curve. The work is amplitude, alpha, one 20ms bug, and reduce coverage.

### 8a. Dashboard panel board (`#dashboard`)

Everything geometric is **frozen**: `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16`,
`grid-auto-rows: 40px` (independently re-declared in `hs-home.css`), the absolute-positioned
`.dash-block`, `dash:layout` persistence, `DashDragLayer`'s reading of dnd-kit's `active` state
rather than the start/end callbacks (so a drag cancelled before its start commits does not strand
the page in `.is-rearranging`), and the `.dash-board-live` `role="status" aria-live="polite"`
announcer that speaks one cell per keyboard nudge.

| Stage | Today | After | Duration | Easing | Token |
|---|---|---|---|---|---|
| Pick up (source) | `.dash-rx.hs-home .dash-block.is-dragging` → 2px dashed `#8b95ab`, tile fill `#e2e5ec`, children `visibility: hidden` | dash → `rgba(28,28,26,0.22)`, tile → `#eaedf3`. Geometry, `visibility: hidden` and the SVG tile data-URI unchanged | — | — | — |
| Pick up (overlay ghost) | `DashDragGhost` (`App.tsx:23478`), `filter: drop-shadow(0 26px 40px rgba(20,32,58,.22)) drop-shadow(0 6px 12px rgba(20,32,58,.12))`, `cursor: grabbing` | re-based to `drop-shadow(0 26px 60px rgba(28,28,26,0.12))` + `drop-shadow(0 4px 12px rgba(28,28,26,0.08))` — the card-hover and raised steps as filters | `0.28s` | `var(--bf-ease)` | `--bf-dur-move` |
| Neighbours glide | `DASH_SORT_TRANSITION = { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }` | **frozen** | `260ms` | house curve | mirrored by `--bf-dur-drag` |
| Drop settle | `DASH_DROP_ANIMATION = { duration: 260, … }` | **frozen** | `260ms` | house curve | mirrored by `--bf-dur-drop` |
| Board reflow | `.dash-block` transitions `top` / `left` / `width` / `height` each `0.26s cubic-bezier(0.22,1,0.36,1)` | **frozen** | `0.26s` | house curve | `--bf-dur-drag` |
| Slot | `hs-dropslot-in` `0.22s`, `opacity 0 + scaleY(0.6) → none`, `transform-origin: top center`; `.dash-placeholder` = 2px dashed `#8b95ab` on `rgba(232,240,254,.7)` | keep the name; retone to `rgba(28,28,26,0.22)` on `rgba(47,107,255,0.06)` | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |
| Cell grid hint | `hsh-fade-in` `0.18s ease-out` on `.dash-cells`; each `.dash-cell` a plain `#e2e5ec` rounded rect | keep the name; cell → `#eaedf3`, radius → 8px | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |
| Land | `dash-land` `0.75s`, box-shadow ring `0 → 10px → 0` at `rgba(47,107,255,.5)` | keep the name and the geometry; **alpha `0.5 → 0.24`** | `0.75s` | `var(--bf-ease)` | `--bf-dur-flash` |
| Resize | `.is-resizing` → `transition: none` + 2px blue outline | **frozen** | `0s` | — | — |

**Three things that look like candidates for tidying and must not be touched.**

1. **The two JS constants keep their literal `cubic-bezier` strings.** dnd-kit takes a JS string, not
   a CSS variable, so `DASH_SORT_TRANSITION` and `DASH_DROP_ANIMATION` cannot read
   `var(--bf-ease)`. They are the **only** licensed literals left in the motion layer. Both get a
   comment naming `--bf-dur-drag` / `--bf-dur-drop` / `--bf-ease` so the pair can never drift, and
   `density.test.ts` asserts the numbers still match the tokens (§12.3 assertion 11).
2. **`.dash-block`'s four separate transitions must not become `transition: all`.** `.is-resizing`
   sets `transition: none`, and `all` would additionally kill the border and shadow transitions the
   new file adds.
3. **`.is-resizing`'s blue ring must stay an `outline`, not a `box-shadow`.** A box-shadow would join
   the shadow ladder, could be clipped by the card's `overflow: hidden`, and would compose with the
   drag filter.

**Panels do not hover-lift** — RULE C clause 1. A lift fights the grip, and the grip is a
hover-revealed control (`hs-home.css:731`) whose reveal would then be competing with a 4px
translate. They get the **spotlight** instead (§5, move 4), and `SpotlightSurface` must **never**
carry `data-reveal`: `.dash-block` takes `is-dragging` / `is-resizing` / `is-landing` dynamically,
and a dynamic `className` on a reveal target wipes the imperative `.in`.

**Keyboard nudge, and the reduce pairing that matters.** The grip carries the app's only
`aria-keyshortcuts` (`'ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown
Shift+ArrowLeft Shift+ArrowRight'`) with `aria-label` `'Move <panel>. Arrow keys move it one cell;
hold Shift to resize.'` (`App.tsx:23596-23600`). Under reduce the 0.26s glide becomes instant — the
block jumps — **and the `.dash-board-live` announcement still fires**. Removing the animation must
never remove the announcement; that is the correct pairing and it is the reason the announcer reads
dnd-kit state rather than the transition.

### 8b. Schedule boards (Week / Month / Kanban / Matrix / List / Gantt)

**Sensors frozen, all of them.** `MouseSensor { activationConstraint: { distance: 4 } }`,
`TouchSensor { delay: 250, tolerance: 8 }` (the 250ms press is what keeps a swipe scrolling the
page instead of picking up a card — the single most important motion number on a phone),
`KeyboardSensor` with `scheduleKeyboardCoordinates` (Space/Enter to pick up, arrows to move, Space
to drop, Escape to cancel), and `scheduleCollision` = `pointerWithin` falling back to
`rectIntersection` for keyboard drags. `schedule/dragKeyboard.test.ts` pins the coordinates and
`schedule/lanes.test.ts:24` pins the no-op drops.

| Stage | Today | After | Duration | Easing | Token |
|---|---|---|---|---|---|
| Card pick up | **nothing** — Week / Month / Kanban cards have no lift keyframe at all; only the Gantt bar springs | **reuse `hs-deal-lift` by name** on `.schedule-job.is-dragging`, `.sched-act.is-dragging`, `.sched-kan-card.is-dragging` | `0.28s` | `var(--bf-ease)` | `--bf-dur-move` |
| `hs-deal-lift` values | `scale 1 → 1.06 / rotate 1.8deg` at 60% → `1.03 / 1deg` | **`1 → 1.03 / 0.9deg` at 60% → `1.02 / 0.4deg`** | — | — | — |
| Gantt bar pick up | `hsg-lift` `0.3s`, `scaleY(1.12) / scaleX(1.01)` at 60%, shadow `0 18px 36px rgba(20,32,58,.24)` | keep the name and the squash (a bar is bar-shaped); shadow → `0 18px 36px rgba(28,28,26,0.16)` | `0.28s` | `var(--bf-ease)` | `--bf-dur-move` |
| Write in flight | `sched-pending` `0.9s ease-in-out infinite alternate`, opacity `0.5 → 0.8`, `pointer-events: none`, `aria-busy` on the card | **keep everything** — meaning-bearing | `0.9s` | `ease-in-out` (declared exception) | — |
| Another planner's edit | `sched-live-flash` `6s ease-out both`, ring `rgba(47,107,255,.45)` → 10px, fill `rgba(47,107,255,.14)`; `LIVE_FLASH_MS = 6000`; a 999px blue pill at `top:-9px right:8px` carrying the editor's name | keep the name, the 6s and the pill; **ring alpha `0.45 → 0.20`, fill `0.14 → 0.06`** | `6s` | `ease-out` | `--bf-dur-live` |
| Month cells | `schedCellIn` `0.5s`, `55ms × --d` (`--d` = `weekIndex`, 0..5) | keep — **the model stagger**; retime | `0.4s` + `40ms × band` | `var(--bf-ease)` | `--bf-dur-cell`, `--bf-stagger-band` |
| Gantt bar land | `hsg-land` `0.75s`, `scale 0.97 → 1.02` with a 10px blue ring | keep the name; ring alpha → `0.24` | `0.75s` | `var(--bf-ease)` | `--bf-dur-flash` |
| Gantt drag tip | `hs-pop` `0.16s` on `.gantt-drag-tip` | keep the name | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |
| Gantt context menu | `hs-pop` `0.16s` on `.gantt-menu` (portaled, `role="menu"`) | keep the name | `0.25s` | `var(--bf-ease)` | `--bf-dur-hover` |
| Notice strip | no entrance on `.sched-rx`; `hsg-rise 0.36s` on the Gantt page only | **unify**: `hsg-rise` on every page's `.gantt-status` | `0.28s` | `var(--bf-ease)` | `--bf-dur-move` |

**The notice strip is the app's only toast-like transient and it must not be replaced.** There is
no toast system anywhere in the repo (`grep toast|snackbar` → zero hits in TSX, TS and CSS).
Transient feedback is done three unrelated ways: (1) this `<p class='gantt-status'>` with
`role="status" aria-live="polite"` and a 4s / 8s dwell (`schedule/hooks.tsx:51`), (2) the Sales
record drawer's `.hs-record-notice` with `tone-success` / `-info` / `-error`, a 9s self-clear for
non-errors and a manual `×`, and (3) Settings' `.acct-success` / `.sx-addons-notice` green lines
that clear when the next action starts. **Introducing one toast primitive would replace all three
and is a feature change, not a re-skin.** Out of scope, flagged. Restyle each in place; keep the
4s/8s and 9s timers, keep `role="status"`, keep the `Undo` accessible name.

**`.gantt-status` alone gets an entrance because it currently has one on exactly one of the seven
pages** — a visible inconsistency, fixed by extending the existing keyframe rather than adding one.

### 8c. Deal board (`#deals`)

| Stage | Today | After | Duration | Easing | Token |
|---|---|---|---|---|---|
| Pick up | `hs-deal-lift` `0.3s`, paired shadow `0 26px 52px rgba(20,32,58,.28)` on the `DragOverlay` card | re-valued (§8b); shadow → `0 26px 60px rgba(28,28,26,0.12)` | `0.28s` | `var(--bf-ease)` | `--bf-dur-move` |
| Flight | `DEAL_DROP_ANIMATION = { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }` | **frozen at 340** | `340ms` | house curve | `--bf-dur-drop-lane` |
| Land | `hs-deal-land` `0.75s`, `animation-delay: 0.32s`, 12px blue ring | **`animation-delay: 0.34s`** (§11 BUG 4); ring alpha → `0.24` | `0.75s` | `var(--bf-ease)` | `--bf-dur-flash` |
| Slot | `hs-dropslot-in` `0.22s` on `.hs-board-dropslot` | keep the name; retone the dash | `0.18s` | `var(--bf-ease)` | `--bf-dur-press` |
| Lane empty | `'Drop a deal here'` (`.hs-board-empty`, dashed `#d6dae4`) rendered only when the lane has no deals **and** no incoming drag | copy and condition unchanged; dash → `rgba(28,28,26,0.13)` | — | — | — |
| Deal card entrance | `hsc-row-in` `0.36s`, `25ms × index` | keep; **index capped at 8** (RULE S) | `0.36s` | `var(--bf-ease)` | `--bf-stagger-card` |

**`340ms` and `260ms` are both correct and must stay different.** They are not an inconsistency: a
cross-column flight on the deal board covers several hundred pixels, while a panel reflow inside a
6-column grid covers tens. Two distances, two durations. That is the *one* legitimate reason for two
drop durations in the system, and stating it is what stops a future session from "unifying" them.

---

## 9. Reduced motion, item by item

The repo's convention is **clamp entrances, remove loops**, across ten existing blocks, and
`DESIGN_TOKENS.md` records it as deliberate. Extended, never reinvented. The new stylesheet adds
**exactly one** new `@media (prefers-reduced-motion: reduce)` block, containing only what the new
file itself introduces — plus the RULE R pairing for everything it re-declares.

`test/setup.ts:57` stubs `matchMedia` to `matches: false` for every query, so **every branch below
is untested**. That is the strongest argument for making the pairing mechanical (§12.3) rather than
a review comment.

| Item | Normal | Reduced motion | Mechanism |
|---|---|---|---|
| `bf-shell-in` | opacity, `0.7s` | `animation: none`, `opacity: 1` | new file's own block |
| Reveal cascade | `12px` / `0.55s` / `50ms` | `0px` / `0.3s` / `0ms` | `--bf-app-reveal-*` zero in `design-tokens.css` — free |
| `useHudMotion` reveal | IO adds `.in` on intersect | **all targets get `.in` immediately** | already implemented, `useHudMotion.ts:38` |
| `useHudMotion` pointer vars | `pointermove` → `--mx/--my/--px/--py` on every frame | **listener never installed** | **NEW guard** — §11 BUG 2 |
| `.dx-cursor` (480px pointer glow, 8 pages) | follows the pointer | `display: none` | **NEW** — §11 BUG 2 |
| `.dx-aurora-1/2/3` parallax | `translate(--px*±16/20/12px, --py*±12/14/10px)`, `blur(50px)` | `transform: none !important` | already covered in 8 sheets |
| **`DxTilt` / `.kpi-card` tilt** | `±7deg` | `--bf-tilt-max: 0deg` **and** `transform: translateY(var(--lift,0px)) !important` in the six sheets | **NEW** — §11 BUG 1 |
| `SpotlightSurface` | `--bf-spotlight-a: 0.06` | `0`, no transition | token zeroes — free |
| Card lift | `-4px` | `--bf-lift-dense: 0px` | token zeroes — free |
| Pill invert | `0.25s` colour transition | **kept** — a colour change is not motion | intentional |
| Directional slide | `3px` | `--bf-slide: 0px` | token zeroes — free |
| Press scale | `0.94` | `--bf-press-scale: 1` | token zeroes — free |
| 9 chrome gesture keyframes | as §5 | `animation: none` | 4 existing blocks **+ the RULE R re-pairing in the new file** |
| `hs-tag-ping` | 2.4s × 3 | `animation: none` | `app-shell-hubspot.css:855` + re-paired |
| `hs-pop`, `hs-flyout-in` | `0.25s` | `animation: none` | `:942` + re-paired |
| `bf-fade`, `bf-pop` (palette, loading, error, board handoff) | `0.18s` / `0.25s` | `animation: none` | new file's own block |
| `dash-skel-shimmer` | `1.4s` infinite | `animation: none` | `hs-home.css:2069` — already |
| Panel board glide / drop / slot / cells | `0.26s` / `0.22s` / `0.18s` | `animation: none`, `transition: none`; **the announcer still fires** | `hs-home.css:1951` + `:820` — already |
| `dash-land` | `0.75s` ring | `animation: none` | `hs-home.css:1951` — already |
| `hs-deal-lift` / `-land` / `hs-dropslot-in` / record drawer / composer / KPIs / timeline / table rows | as §8c | covered | `hs-contacts.css:886` + `:1452` — already |
| `sched-pending` | `0.9s` infinite alternate | `animation: none`; **`aria-busy` and the 0.5 opacity stay** | `schedule.css:1500` (`.sched-rx .is-pending`) — already |
| `sched-live-flash` | `6s` | `animation: none`; **the pill still renders** | `schedule.css:1834` (`.sched-rx .is-live`) — already, and correct: the information survives, only the ring stops |
| **`schedCellIn`** (42 Month cells) | `0.4s` + banded stagger | `animation: none` | **NEW** — §11 BUG 8 |
| `.sched-matrix-tip` | reveal transition | `transition: none` | `schedule.css:2201` — already |
| `.sched-kan-card` | transition | clamped to `0.01s` | `schedule.css:3429` — already |
| Gantt family (frame, KPIs, status, drawer, backdrop, bar lift/land, drag tip, menu, add helper, `.gantt-feature`) | as §8b | `animation: none`, `transition: none` | `schedule.css:5244` — already |
| `.ss-band` | transition | covered | `schedule.css:561` — already |
| `.pdx` dialog family (dialog, labels, `.form-error`, actions, labor-mix row, dot, close hover) | as §4a | covered | `project-dialog-redesign.css:699` — already |
| `sv-drawer-in` | `0.25s` | covered | `field-variance.css:294` — already |
| `hs-upd-fade` / `-pop` / `-pulse` | `0.18s` / `0.28s` / `1.1s × 3` | covered — **and this also covers the AddOnPrompt**, which reuses the same two keyframes | `hs-update-modal.css:195` — already |
| `sx-rise` / `sx-plan-in` / `sx-addon-pulse` | as §4a | covered | `settings-redesign.css:1125` — already |
| `bfz-in` / `-rise` / `-pop` / `-pulse` | as §4a | covered | `hs-breeze.css` block — already |
| `quantum-*` (4 orbits) | `3.1`–`6.4s` infinite | `.qc-particle { animation: none }` | `quantum-cloud-loader.css:196` — already |
| `spin` (`.spin`, 3 call sites) | `1s linear infinite` | **kept** — a spinner that stops is a broken spinner; the reduced-motion exception every guideline grants | intentional, documented in the new file's header |
| **recharts (11 surfaces)** | `600` / `400ms` | `isAnimationActive: false` from mount — the data paints instantly | **NEW** — §11 BUG 5 |
| **`expand-map.tsx` (~20 framer animations)** | springs, `pathLength` draws, 6 staggered building fades, pin drop | **all gated on a `useReducedMotion()` read**; the map still renders complete | **NEW** — §11 BUG 6 |
| **`TextShimmer`** | `cc-text-shimmer` infinite | **`animation: none` written into the inline style object** — it cannot be reached from CSS | **NEW** — §11 BUG 7 |
| **`tcRowIn`** (2.2s new-row flash) | `2.2s` | clamped to `0.3s`, **not removed** — it identifies the row you just added | **NEW** — §11 BUG 9 |
| **`.hc-assistant-fab`** hover lift | `translateY(-3px)` `0.22s` | `transform: none`, `transition: none` | **NEW** — §11 BUG 9 |
| `.buildflow-tutorial-spotlight` | `top`/`left`/`width`/`height` each `180ms ease` | `transition: none` — **the spotlight jumps, which is correct**; a reduced-motion user should not watch the light travel | **NEW**; `pointer-events: none` on the overlay with `auto` only on the panel stays frozen (that is what keeps a spotlit control clickable, which is what makes the gated steps satisfiable) |
| `.sim-drop` (import dropzone) | `border-color` / `background` `0.16s ease` | `transition: none` | **NEW**, and retimes off the off-curve `0.16s ease` |
| Files with motion and **no** reduce block | — | each gains one | `assistant-global.css`, `timecard.css`, `delayiq.css`, `hs-index.css`, `redesign.css`, `topbar-redesign.css`, `compare-plans-`, `contact-sales-`, `integrations-`, `legal-`, `reviews-`, `templates-partners-redesign.css` — **twelve files**, machine-verified. (`schedule-phone.css` and `command-palette.css` have nothing to guard *today*; `command-palette.css` gains motion in this plan, so it gains a block.) |
| `schedule-phone.css` | zero transitions, zero animations, zero reduce block | **needs a phone pass**: it inherits every desktop timing wholesale, and its breakpoint ladder is 900 / 720 / **640**px with 640 mirrored in JS by `narrowViewport()` / `useNarrowViewport()` (`schedule/hooks.tsx:222-243`) | flagged; any new motion that lands on a schedule board must be checked at 640px |

### 9a. The one new block, and the shape of every media-gated helper

```css
/* app-shell-daylight.css — the file's own reduce block.
   RULE R: every selector above that declares animation / transition / transform
   appears here too, at the same specificity. density.test.ts asserts the pairing. */
@media (prefers-reduced-motion: reduce) {
  .hs-shell.bf-shell .hs-topbar,
  .hs-shell.bf-shell .sidebar.hs-rail { animation: none; opacity: 1; }
  .bf-shell .cmdk-backdrop,
  .bf-shell .cmdk-dialog,
  .bf-shell .dash-board { animation: none; }
  .bf-shell .sched-rx .sched-cal-cell { animation: none; }
  .bf-shell .dx-cursor { display: none; }
  /* … and the .bf-shell re-pairing of the nine chrome gestures the four
     inherited blocks used to null at lower specificity … */
}
```

Every JS-side gate uses one shape, and the reason is commented at each site
(EDITORIAL graft, `useShellBreakpoint()`'s exact form):

```ts
/** Defaults to false when matchMedia is absent — a server render, an old
 *  browser, or jsdom before test/setup.ts installs its stub. Never assume the
 *  query is answerable. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

And the coarse-pointer gate stays `matchMedia("(hover: none)")` — never a width breakpoint and
never a touch-event sniff — because `test/setup.ts` answers `false` to every query, which is what
keeps `appHarness.openSchedule()`'s `fireEvent.click(hub)` navigating for 33 nav call sites.

---

## 10. The 145 keyframes: retired, kept, renamed

**Census, re-derived this session.** `grep -c '@keyframes' client/src/*.css` → **152 declarations**
across 36 files, resolving to **145 distinct names**, because `dx-pulse` is declared **seven** times
with an identical body and `dx-fade-up` twice. Two more are declared **inline in TSX** and will not
be found by a CSS-only sweep: `cc-text-shimmer` (`components/ui/text-shimmer.tsx:48`) and
`dcx-fade-in` (`components/ui/display-cards.tsx:161`). Distinct total: **147**.

Split by side: **58 distinct app-side CSS names** (+2 inline), **70** Welcome-page-scoped, **17**
legacy `styles.css` welcome-demo names.

### 10a. Renamed onto the token system: **none. Zero.**

That is the headline of this section and it is deliberate.

- The four `app-shell-hubspot.css` reduce blocks null by **selector**, so renaming would not break
  them — but it would not help either.
- The house curve is already tokenised **eight** times under different names (`--hs-ease`,
  `--hsx-ease` ×2, `--hsc-ease`, `--bfz-ease`, `--pdx-ease`, `--cpx-ease`, and now `--bf-ease`) —
  all the same value. Consolidating **variable** names is Phase 4 token work with a computed-style
  harness behind it. Consolidating **keyframe** names buys nothing: a keyframe name is not read by
  any rule except its own `animation` shorthand.
- A keyframe rename fails **silently**: an `animation: <missing-name>` is simply ignored, with no
  build error, no console warning and no test failure (`hs-index.css` has zero keyframes and zero
  tests on motion). Sixty renames with a silent failure mode is the worst risk-to-reward ratio in
  the plan.

**Every surviving keyframe keeps its name. Only values change.**

### 10b. Retired — 7 names, 8 duplicate declarations

| Name | Why | Evidence |
|---|---|---|
| `sb-nav-in` | `sidebar-redesign.css` is deleted — 307 lines scoped `.sidebar-rx`, which appears **nowhere** in `App.tsx` (the inventory records the scope as 43 rules, "entirely dead") | its `translate`-not-`transform` lesson moves into the new file's header comment |
| `sb-dot` | same file | — |
| `crew-dx-pulse` | a rename of `dx-pulse` with an identical body; `crews-redesign.css:194`. Its selector `.crew-rx .dx-dot` is nulled **by selector** under reduce, so pointing it at `dx-pulse` is inert | — |
| `pdx-pulse` | the eighth copy of the same body; `project-dialog-redesign.css:148`. `.pdx-dot` is nulled by selector at `:699` | — |
| **6 of the 7 `dx-pulse` declarations** | identical bodies in `dashboard-`, `delayIQs-`, `equipment-`, `materials-`, `field-updates-`, `projects-redesign.css` and `schedule.css`. Keep **one** declaration; the name resolves globally, so deleting six changes no pixel | the most-repeated real animation declaration in the repo (`dx-pulse 2.6s ease-in-out infinite` ×7) |
| `scheduleAiFloat` | **orphan.** Its only consumer is `.schedule-ai-orbit-icon` (`styles.css:2763`), and `schedule-ai-orbit-icon` appears in **zero** `.tsx` files | machine-verified |
| `floaty` | **orphan.** Only consumer `.welcome-orbit`; `welcome-orbit` appears in zero `.tsx` files | machine-verified |
| `rotateWelcomeWord` | **orphan.** Only consumer `.welcome-word-pill span`; `welcome-word` appears in zero `.tsx` files | machine-verified |

The last three are Welcome-side, so they are free deletions rather than dashboard work — take them
in the cleanup phase (§13 G) so a regression is attributable. Everything else in `styles.css`'s
legacy family (`demoCursor`, `demoCursorDrag`, `demoCursorRoute`, `demoSceneFade`,
`demoColumnFloat`, `demoCardMove`, `demoPhotoPop`, `demoHelperFloat`, `demoNoteIn`, `demoTaskSlide`,
`dashRoute`, `reportPulse`, `solutionFloat`, `welcomeMenuIn`) **is still live** — `demo-cursor`,
`demo-field-scene`, `demo-map-scene`, `demo-kanban-column`, `demo-job-card`, `demo-report-bars`,
`demo-photo`, `welcome-mega-menu` and `solution-spark` all appear in `App.tsx`. Do not touch them;
they are the Welcome-side demo player, out of scope.

Net: **152 → 144 declarations, 145 → 138 distinct names.**

### 10c. Added — 3 names

| Name | Where | Motion | Duration | Token |
|---|---|---|---|---|
| `bf-shell-in` | top bar, rail, first paint only | `opacity: 0 → 1` (no transform — RULE T) | `0.7s` | `--bf-dur-enter` |
| `bf-fade` | palette backdrop, loading screen, error screen, `.dash-board` handoff | `opacity: 0 → 1` | `0.18s` | `--bf-dur-press` |
| `bf-pop` | palette dialog | `opacity: 0 + translateY(-8px) scale(0.985) → none` | `0.25s` | `--bf-dur-hover` |

**138 + 3 = 141 distinct CSS keyframes** after the redesign, from 145. `density.test.ts` enforces
this as a **closed allowlist**: no fourth `bf-*` keyframe may appear in the new file (§12.3
assertion 6).

### 10d. Kept and re-valued — 24

Values only; names, selectors and use sites unchanged. Amplitude and alpha, because the ground went
from navy to `#f5f6fa` and the surfaces got 3.5× smaller.

`hs-rail-pop` · `hs-rail-ring` · `hs-top-spin` · `hs-top-bell` · `hs-top-twinkle` · `hs-tag-ping`
(infinite → 3) · `hs-pop` · `hs-flyout-in` · `hsh-rise` · `hsh-fade-in` · `dash-land` ·
`dash-skel-shimmer` (gradient stops only) · `hs-dropslot-in` · `hs-deal-lift` (amplitude halved,
**and now shared with the three schedule boards**) · `hs-deal-land` (**delay 0.32 → 0.34s — a bug
fix**) · `hsc-rise` · `hsc-row-in` (retired from `tbody tr`, kept for `.hs-deal-card` with a capped
index) · `hsc-fade` · `hsc-slide-in` · `schedCellIn` (0.5 → 0.4s, 55 → 40ms) · `hsg-rise`
(**extended to all seven schedule pages' `.gantt-status`**) · `hsg-lift` · `hsg-land` ·
`sched-live-flash` (alphas only).

### 10e. Kept untouched — 31 app-side

`hs-rail-draw` · `hs-top-gear` · `hs-top-badge` · `hs-tag-in` · `dx-pulse` (one declaration) ·
`dx-fade-up` · `sched-pending` · `hsg-fade` · `hsg-slide-in` · `pdx-backdrop-in` · `pdx-dialog-in` ·
`pdx-field-in` · `hs-upd-fade` · `hs-upd-pop` · `hs-upd-pulse` · `sv-drawer-in` · `sx-rise` ·
`sx-plan-in` · `sx-addon-pulse` · `bfz-in` · `bfz-rise` · `bfz-pop` · `bfz-pulse` · `bm-rise` ·
`tcRowIn` (gains a reduce clamp; the keyframe itself is unchanged) · `quantum-red` · `quantum-blue` ·
`quantum-yellow` · `quantum-green` · `spin` · `cc-text-shimmer` (gains a JS guard; the keyframe is
unchanged) · `dcx-fade-in`.

**`--qc-ease: cubic-bezier(0.37, 0, 0.63, 1)` stays.** It is the only easing in the repo that is
neither the house curve nor a plain `ease`, and it is correct: the four quantum orbits are
continuous loops on differently-paced cycles (3.8 / 5.6 / 3.1 / 6.4s, the last `alternate`), and a
symmetric sine-ish curve is what makes them read as orbits rather than as bounces. A declared,
reasoned exception — not an oversight.

### 10f. Motion that carries meaning and must not be dropped

Restated because a re-skin loses these first, and none of them is decoration:

`sched-pending` (a write is in flight — paired with `aria-busy`) · `sched-live-flash` **plus the
live pill** (someone else changed this; the pill is the information, the ring is the motion) ·
`dash-land` / `hs-deal-land` / `hsg-land` (your drop landed **here** — the same expanding-blue-ring
pulse at three scales) · `tcRowIn` (this is the row you just added) · `hs-upd-pulse` (the feature
you asked to be shown, exactly 3 iterations) · `sx-addon-pulse` (the deep-linked add-on card,
exactly 2) · `upd-target-flash` (the deep-linked release entry) · `.crew-row.is-lazy` and
`.gantt-row-spacer` (not drawn yet — a *state*, not an absence).

---

## 11. Motion that is a bug, not a style

Ranked by how many users hit it. Every claim was re-verified against source in this session; the
machine checks were a brace-matching parse of every `@media (prefers-reduced-motion: reduce)` block
in all 57 stylesheets.

### BUG 1 — the KPI card's 3D pointer tilt has no reduced-motion guard (39 sites, 6 files)

`DxTilt` (`schedule/parts/shared.tsx:75-95`) writes `--rx` / `--ry` on every `pointermove` at
`±7deg` with no `matchMedia` check. Six stylesheets compose them:
`dashboard-redesign.css:284`, `schedule.css:1002`, `projects-redesign.css:297`,
`equipment-redesign.css:244`, `materials-redesign.css:244`, `field-updates-redesign.css:244`.

The reduce block at `dashboard-redesign.css:844-858` touches `.dash-rx .kpi-card` **only** to set
`transition-duration: 0.2s` — which makes the tilt *snappier*, not still — and then two rules later
nulls `.dash-rx .dx-aurora` with `transform: none !important`. **The author knew the idiom and used
it on the aurora and not on the card.** `schedule.css:1437` has the identical shape.

A brace-matched scan of every reduce block in all 57 sheets finds **zero** mentions of `--rx`,
`--ry` or `.dx-tilt`. A user who has set "reduce motion" gets a **14° 3D swing** on 39 cards,
tracking their pointer. That is not a style choice; it is the one guard that was missed.

**Fix:** `max = var(--bf-tilt-max)` (zeroed under reduce), plus
`transform: translateY(var(--lift, 0px)) !important` in each of the six reduce blocks so `--lift`
still composes.

### BUG 2 — `.dx-cursor` and `useHudMotion`'s pointer loop ignore reduced motion (8 pages)

`.dx-cursor` is a **480px fixed radial glow** that follows the pointer via
`left: var(--mx); top: var(--my)`, `translate(-50%,-50%)`, mounted on eight page roots
(`App.tsx:22855, 26666, 27706, 35132, 35949, 36658, 37494, 38378`) and styled in nine sheets. The
machine scan finds it in **zero** reduce blocks.

The evidence that this is an oversight and not a decision is inside one file. `useHudMotion.ts` has
two effects. The **second** checks
`window.matchMedia("(prefers-reduced-motion: reduce)").matches` and short-circuits. The **first** —
the one that installs the `window` `pointermove` listener and the `requestAnimationFrame` loop that
publishes `--mx/--my/--px/--py` — checks nothing. Same file, same hook, one guard.

**Fix:** guard the first effect with the same read (which also removes the rAF loop for reduce
users, a free perf win), and `.bf-shell .dx-cursor { display: none }` in the new file's reduce
block.

### BUG 3 — the Contacts table row stagger is unbounded, and holds the last row invisible for up to 1.25s

`hs-contacts.css:79-81`:

```css
.contacts-page .hs-table tbody tr {
  animation: hsc-row-in 0.36s var(--hsc-ease) both;
  animation-delay: calc(0.025s * var(--i, 0));
}
```

`--i` is the raw array index (`App.tsx:30673`, `style={{ "--i": index }}`), and the per-page
selector offers **10 / 25 / 50** (`App.tsx:28070`, default 25). `animation-fill-mode: both` means
the row sits at `opacity: 0` for the **whole** delay. So:

| Rows per page | Last row invisible until | Readable at |
|---|---|---|
| 10 | 225ms | 585ms |
| **25** (default) | **600ms** | **960ms** |
| 50 | **1,250ms** | **1,610ms** |

And the rows remount on every page change, every view-tab change, every filter change and every
search keystroke that changes the result set. The bottom of the table is unreadable for roughly a
second, repeatedly, during exactly the interaction the stagger was meant to decorate.

**The same product contains the correct implementation.** `schedule/parts/month.tsx:148` sets `--d`
to `cell.weekIndex`, so a 42-cell month grid staggers in **six bands** and the last band starts at
275ms. Same idea, bounded by structure instead of by data.

**Fix:** retire the animation from `.contacts-page .hs-table tbody tr` (RULE S / §4c). Keep the
keyframe for `.hs-deal-card`, where the lane is bounded, with the index capped at 8. Note the
side-effect worth having: `hs-index.css` has zero keyframes, so the six workspace index tables have
**no** row entrance while the three Sales tables do — the two families of index page already look
different in motion, and this fix converges them on the quieter one.

### BUG 4 — `hs-deal-land` starts 20ms before the flight it is supposed to follow

`hs-contacts.css:1403-1404`:

```css
animation: hs-deal-land 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
animation-delay: 0.32s;
```

against `App.tsx:34573`:

```ts
const DEAL_DROP_ANIMATION = { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
```

The inventory records the intent as "animation-delay 0.32s so it fires after the flight."
320 < 340. The land ring begins while the `DragOverlay` ghost is still 20ms from its target, so on
a slow frame the ring appears next to the card rather than around it. **Fix: `0.34s`**, and a
`density.test.ts` assertion that the two numbers stay equal (§12.3, assertion 11).

### BUG 5 — recharts animates on every data change, unthrottled and ungated (11 surfaces)

`isAnimationActive`, `animationDuration` and `animationBegin` appear **nowhere** in `client/src`
(grep, zero hits), so all eleven `ResponsiveContainer` surfaces run recharts' defaults: ~1500ms
grow for bars and lines, ~400ms sweep for pies, on recharts' own `ease`, **and they re-run whenever
the data array's identity changes**.

Two are directly behind filters: `App.tsx:38756` re-derives from `data.delayIQs`, and
`TimeCard.tsx:1312/:1327/:1348` sit behind the Pending / Overtime / Flagged / All `role="tablist"`.
Clicking a tab re-grows the bars over a second and a half. There is no reduced-motion gate on any of
the eleven, which makes recharts the largest block of unmanaged motion in the product. §7.

### BUG 6 — `expand-map.tsx`'s ~20 framer animations ignore `prefers-reduced-motion`

`expand-map.css:316` is the file's only reduce block and it kills a single `.lm-surface`
transition. Everything else still runs: `useSpring { stiffness: 300, damping: 30 }` over a ±8°
`rotateX`/`rotateY` tilt, the expand spring `{ stiffness: 400, damping: 35 }` from height 140 to
280, four `pathLength` road draws at 0.5–0.8s with per-index delays, **six** staggered building
fades at 0.5/0.55/0.6/0.65/0.7/0.75s, a pin drop spring `{ stiffness: 400, damping: 20, delay: 0.3 }`,
and eight smaller tweens. **framer-motion does not read the media query on its own.** Fix: one
`prefersReducedMotion()` read at the top of the component, passed into every `transition` as
`{ duration: 0 }`. The map still renders complete — only the choreography stops.

### BUG 7 — `TextShimmer`'s infinite loop cannot be reached from CSS at all

`components/ui/text-shimmer.tsx:39` puts

```
animation: `cc-text-shimmer ${duration}s linear infinite`
```

inside the **inline `style` object**, while the component's own `<style>` block at line 46 declares
only the keyframe. An inline style declaration cannot be overridden by a
`@media (prefers-reduced-motion: reduce)` rule in any stylesheet without `!important`. **This is the
only motion in the repo with that property** — every other loop can be stopped by a CSS rule
somewhere. And the plan expands its footprint (the loading screen, §6c). Fix: read
`prefersReducedMotion()` in the component and omit the `animation` property, keeping the gradient so
the text still renders in `baseColor`.

### BUG 8 — `schedCellIn` has no reduced-motion guard, so the whole Month grid still slides

`schedule.css:2372` puts `animation: schedCellIn 0.5s cubic-bezier(0.22,1,0.36,1) both` on **every**
`.sched-cal-cell`. A brace-matched parse of `schedule.css`'s seven reduce blocks — lines 561, 1437,
1500, 1834, 2201, 3429, 5244 — yields their complete selector list: `.ss-band`; `.dx-dot`,
`[data-reveal]`, `.kpi-card`/`.schedule-job`/`.unassigned-card`, `.dx-aurora`; `.is-pending`;
`.is-live`; `.sched-matrix-tip`; `.sched-kan-card`; and the Gantt family. **`.sched-cal-cell` is not
among them.** So a reduced-motion user opening the Month view watches a 42-cell grid rise in six
bands. Fix: one selector in the new file's reduce block.

### BUG 9 — two stylesheets with live motion have no reduced-motion block at all

Machine-verified: `timecard.css` → **0** reduce blocks, and `assistant-global.css` → **0**.

- `tcRowIn` is a **2.2s** `var(--tc-green-soft) → transparent` background flash on the timecard row
  you just added. It is meaning-bearing, so it should **shorten to 0.3s**, not stop.
- `.hc-assistant-fab` is a fixed `z-60` "Ask AI" launcher on **every** app page with a
  `translateY(-3px)` hover lift on the house curve — and there is no rule anywhere that stops it.

Ten more files declare transitions with no reduce coverage: `delayiq.css`, `hs-index.css`,
`redesign.css`, `topbar-redesign.css`, `compare-plans-`, `contact-sales-`, `integrations-`,
`legal-`, `reviews-` and `templates-partners-redesign.css`. Twelve files total, each gaining one
block (§9).

### BUG 10 — the trap this redesign would walk into: prefixing out-specifies the reduce blocks

Not a pre-existing defect — a defect the plan would *create*, and the one the graft brief
mis-diagnosed. Full text of all four blocks is in the header of this document. Their specificity is
2–3 classes plus an element. The recipe "prefix `.bf-shell`" produces 3–4. **Every animation rule
the new file writes therefore out-specifies the reduce block that was nulling it, and reduced motion
silently comes back on across the whole chrome** — with no test to catch it, because
`test/setup.ts:57` stubs `matchMedia` to `matches: false` so every reduced-motion branch in the
product is untested.

RULE R and `density.test.ts` assertion 3 exist for exactly this. It is the single highest-value
assertion in the new test file.

### BUG 11 — `useHudMotion` lacks the MutationObserver its Dashboard twin has (10 page roots)

`App.tsx:25798-25806` adds a `MutationObserver` to the Dashboard's inlined copy of the reveal
effect, with the comment: *"Panels that mount after their own fetch resolves — the schedule status
band is one — miss that first query, and without this they stay at opacity 0 for the life of the
page."*

`useHudMotion.ts` has **no such watcher**, and it is the hook used by Settings (`App.tsx:22379`),
Contacts (`:27342`, `:30110`), Companies (`:32221`, `:33412`), Deals (`:34874`), Crews (`:35725`),
Equipment (`:36472`), Field (`:37256`), DelayIQs (`:38226`) and `schedule/page.tsx:593`. Any
`[data-reveal]` block that mounts after its own fetch on those ten roots is **invisible forever**.
This is live, not theoretical: the three Sales pages genuinely fetch (`sales === null`).

**Fix:** port the seven-line watcher into `useHudMotion` verbatim, then delete the Dashboard's
inlined duplicate in favour of the hook. The two effects are otherwise equivalent — the Dashboard
copy has deps `[]`, the hook has `[rootRef]`, and a ref object is stable, so `[rootRef]` is
effectively `[]`. Two divergent behaviours become one, and the hook's own reveal effect keeps its
`[rootRef]` deps, which is what §3b.6 depends on for Settings.

### Deliberate choices that look like bugs — do not "fix" these

| Looks wrong | Actually | Evidence |
|---|---|---|
| `sx-rise` uses `animation-fill-mode: backwards` | so the hidden start state applies **during** the stagger delay and releases after, leaving hover transforms alone | comment at `settings-redesign.css:1064` |
| `sb-nav-in` animates the `translate` property, not `transform` | so a hover `transform` still composes — `--lift` and `--rx`/`--ry` share one transform (§5 move 4) | comment at `sidebar-redesign.css:132`; the file is being deleted, so **the lesson moves into the new file's header** |
| `.dash-block.is-dragging` sets `visibility: hidden` on its children | the content is flying in the `DragOverlay`; hiding the source is what makes the ghost the only copy | `hs-home.css:1305` |
| `.is-resizing { transition: none }` | a resize must track the pointer exactly; any transition lags the grip | `hs-home.css` |
| reduce **clamps** reveals to `0.3s` instead of `0` | deliberate and consistent across ten blocks — the layout still settles, so nothing appears to teleport | `DESIGN_TOKENS.md`, Motion |
| `.spin` keeps running under reduce | a spinner that stops is a broken spinner; the standard exception | 3 call sites: `App.tsx:2772`, `DelayEarlyWarning.tsx:100`, `:183` |
| `sched-pending` is on `ease-in-out`, not the house curve | a breathing loop on an overshooting curve pumps; `ease-in-out` is right for an `infinite alternate` | `schedule.css:1472` |
| `340ms` (deals) ≠ `260ms` (panels) | two distances, two durations (§8c) | `App.tsx:34573` vs `:23459` |
| `TouchSensor { delay: 250 }` | the press delay is what lets a swipe scroll instead of picking up a card | `schedule/hooks.tsx:22` |
| `--qc-ease` is a fifth curve | four orbits on a symmetric sine-ish curve; the house curve would make them bounce | `quantum-cloud-loader.css` |

### Not motion, but found while auditing and worth one line each

- **`.hs-page-tag` is unstyled on six pages.** `PageReleaseTag` is styled only by
  `hs-index.css:978 .hs-index .hs-index-title .hs-page-tag`, and month / week / list / kanban /
  matrix / gantt render it inside `.dx-title`, which that selector does not match — so those six
  pages render the bare word "New" as unstyled inline text. One unscoped rule fixes all six.
- **`.notification-item.blue` has no CSS rule.** `buildNotificationItems` emits
  red / green / amber / **blue** / slate / violet; the stylesheet styles amber / green / red /
  slate / violet. Every Low-severity weather alert and every conflict-free assignment lands on the
  unstyled tone.
- **Equipment notification items are stamped `new Date().toISOString()` on every render**, so they
  always sort first and can consume the whole 7-item cap. A re-skin cannot fix that; fixing it is a
  data change.
- **The notification centre has no empty state.** An empty `notificationItems` renders an empty
  `.notifications-list`. Adding one is **new copy** and therefore out of scope; flagged rather than
  sneaked in. Proposed if signed off: `"No BuildFlow activity yet."`
- **`.cmdk-list` is capped at `min(52vh, 420px)` and nothing scrolls the highlighted row into
  view**, so arrowing past the fold moves `aria-activedescendant` off screen. Three lines:
  `scrollIntoView({ block: "nearest" })` on index change. Motion-adjacent and worth doing while the
  palette file is open.

---

## 12. Making it stick

### 12.1 Class-name additivity (CANVAS graft, promoted to a review gate)

> **RULE X.** The new stylesheet and any new wrapper **adds** classes and never **replaces** a
> pinned one. `<div className="schedule-kpis bf-figures">` → `<div className="kpi-card bf-figure">`,
> with the new `bf-` scope **zeroing** the inherited border / radius / shadow rather than the old
> class being removed.

The pin list ships as a comment block at the top of `app-shell-daylight.css` — ~40 selectors across
22 `querySelector` assertions: `.schedule-kpis .kpi-card`, `.sched-matrix-util`,
`.sched-matrix-total b`, `.dash-block h2`, `.dash-block-body.is-scrollable`, `.hs-home-promo`,
`.cc-spark`, `.cc-spark-line`, `.cc-trend.flat`, `.sched-list-day`, `.sched-kanban`,
`.sched-cal-cell`, `.schedule-job`, `.sched-view-key`, `.sched-firstrun-steps li.is-done`,
`.gantt-status`, `.gantt-sidebar`, `.gantt-row-spacer`, `.crew-row.is-lazy`,
`.crew-row.is-lazy .schedule-cell`, `.business-context-*`, `[role='tooltip']`, `.active` on the
Settings rail button, and **every** `[data-tutorial-id]`.

### 12.2 The DO-NOT-MOVE header comment (EDITORIAL graft — the best artifact in the four documents)

Pasted above the rail slot in `App.tsx` **even though this concept never touches the handler**,
because it is the trap that would cost the most and it is currently undocumented in the source:

```tsx
/* INVARIANT — DO NOT MOVE (30 tests depend on it):
   onMouseEnter lives on the ROW WRAPPER (.hs-rail-slot), not the header <button>.
   React delegates mouseenter from mouseover and the harness fires
   mouseOver(hubButton) — appHarness.openAppPage() has 30 call sites and
   openSchedule() has 3. Moving it to the button, or to onPointerEnter, breaks
   all 33 at once.
   Sub-items keep role="menuitem": downgrading them to plain buttons makes
   getByRole("button", { name: /^Schedule/ }) ambiguous.
   setFlyoutTop(anchor.offsetTop) is NOT scroll-adjusted, so .hs-rail-list must
   never scroll. If a 10th hub lands: setFlyoutTop(anchor.offsetTop - list.scrollTop)
   plus overflow-y: auto on .hs-rail-list ONLY (never on the <aside>, which must
   stay overflow: visible so flyouts escape). */
```

A second header comment goes at the top of `app-shell-daylight.css` carrying: RULE R, RULE T,
RULE A, RULE S, RULE B, RULE C, RULE X, the pin list, the `translate`-not-`transform` lesson
inherited from the deleted `sidebar-redesign.css`, the "six index tables need no loading state"
note, and the `.settings-panel-inner` warning.

### 12.3 `density.test.ts` — the motion half (HYBRID graft)

Implemented with the `?raw` glob `schedule/boundary.test.ts` already uses
(`import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw' })`, extended to `*.css`). This is the only
mechanism in the plan that makes design-language drift a **build failure** rather than a review
comment.

| # | Assertion |
|---|---|
| 1 | **Zero literal `cubic-bezier(`** in `app-shell-daylight.css`. Every timing function is `var(--bf-ease)` or `var(--bf-ease-size)`. |
| 2 | **Zero literal durations** in the new file. Every `s` / `ms` value is a `var(--bf-dur-*)` / `var(--bf-app-reveal-*)` / `var(--bf-stagger-*)` token, outside `@keyframes` percentage stops. |
| 3 | **RULE R pairing.** For every selector in the new file declaring `animation`, `transition` or `transform`, the identical selector string appears inside the file's own `@media (prefers-reduced-motion: reduce)` block. *The single highest-value assertion here — BUG 10 is otherwise invisible.* |
| 4 | **Zero `:where(`** anywhere in the new file — a documented jsdom breaker in this repo. |
| 5 | **Zero `!important`** outside the reduce block. |
| 6 | **Closed keyframe allowlist**: the new file declares exactly `bf-shell-in`, `bf-fade`, `bf-pop` and nothing else. |
| 7 | **No `data-reveal` on a dynamic className.** Grep `App.tsx` and `schedule/**` for an element carrying both `data-reveal` and `className={` (template literal or conditional) — mechanically enforces the documented trap. |
| 8 | **`backdrop-filter` appears exactly once** in the new file, on `.hs-shell.bf-shell .topbar.hs-topbar` (RULE T). |
| 9 | `useHudMotion.ts` contains `threshold: 0.16` and `-6%`, **and** a `matchMedia` read in **both** effects (BUG 2), **and** a `MutationObserver` (BUG 11). |
| 10 | `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16` and `grid-auto-rows: 40px` unchanged. |
| 11 | `DEAL_DROP_ANIMATION.duration` in ms **equals** the `hs-deal-land` `animation-delay` in ms (BUG 4), and `DASH_SORT_TRANSITION.duration` / `DASH_DROP_ANIMATION.duration` equal `--bf-dur-drag` / `--bf-dur-drop`. |
| 12 | **No font-size literal** in the new file outside the `--bf-app-*` allowlist — the type half of the same guard, which stops a fifth type scale being reintroduced quietly. |
| 13 | Every `ResponsiveContainer` in `App.tsx` and `TimeCard.tsx` has a sibling `<Bar>` / `<Line>` / `<Pie>` carrying `animationDuration` or `isAnimationActive` (BUG 5). |

### 12.4 `tests/shell-nav.test.tsx` — the additive guard (EDITORIAL graft), kept under this winner

Not the concept, just the file. Its guards lock the two UX defects every proposal agrees on and
cover three surfaces no test touches today (the bookmarks star menu, the Bookmarks page,
`BreezeAssistant`):

1. A hub's sub-page is reachable **by click alone**, with **no `mouseOver`**.
2. With `matchMedia` stubbed to ≤560px, **Create new / Bookmarks / Settings / Help are all still
   reachable** (today all four are `display: none` at that width, so a phone user cannot start the
   tutorial — and the tutorial's own last step spotlights a button that does not exist there).
3. Every `data-tutorial-id="nav-<page>"` anchor is present for all **21** pages — **not 22**.
   `navItems` at `App.tsx:643` has 21 entries (dashboard, bookmarks, schedule, gantt, month, week,
   list, kanban, matrix, projects, crews, contacts, companies, deals, timecard, equipment,
   materials, field, map, delayIQs, reports); `settings` is **not** one of them, and `navHubs` sums
   to the same 21. Editorial's version of this test fails as written.
4. A locked row still **prompts** instead of navigating (`tests/map.test.tsx:103`'s sibling).

---

## 13. Build order

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append the motion tokens to `design-tokens.css`; re-base `--bf-focus-ring` to the `#2f6bff` alpha; align `useHudMotion` to `0.16` / `-6%`; guard its **first** effect (BUG 2); port the `MutationObserver` (BUG 11) and delete the Dashboard's inlined duplicate | 2 | none — additive tokens plus two numbers and two guards |
| **B** | Create `app-shell-daylight.css` with its header comment (rules + pin list) and its reduce block **first, before any animation rule** (RULE R); append its import as the new last line of `main.tsx`; add `"bf-shell"` to `shellClassName` | 3 | none — deleting the word `bf-shell` reverts everything |
| **C** | Chrome motion: the nine gesture keyframes re-valued; `hs-pop` / `hs-flyout-in` retimed; the account menu gains `hs-pop`; `bf-shell-in`; palette `bf-fade`/`bf-pop` + `scrollIntoView`; `hs-tag-ping` → 3 iterations; the RULE R re-pairing for every one | 1 new + 2 | low — CSS only, but this is where BUG 10 lives |
| **D** | Surface motion: the reveal retime; the six-per-page attribute audit (RULE B — delete attributes, never CSS); `hsc-row-in` retired from `tbody tr` (BUG 3); `schedCellIn` retimed + guarded (BUG 8); `hsg-rise` extended to all seven `.gantt-status`; hover grammar wired to the four moves + RULE C | 1 new + ~4 | low |
| **E** | Drag: `hs-deal-lift` re-valued and shared with the three schedule boards; `hs-deal-land` delay → `0.34s` (BUG 4); land-ring and live-flash alphas; the two JS constants get their drift comments (values frozen) | 1 new + 2 | low |
| **F** | Charts: `animationDuration` / `animationEasing` / `useChartAnimation` on all 11 surfaces (BUG 5) | `App.tsx`, `TimeCard.tsx` | **medium** — 11 JSX sites in the file a parallel session may also be editing |
| **G** | Reduce coverage for the twelve unguarded files; `DxTilt` bound + guard (BUG 1); `expand-map` framer gate (BUG 6); `TextShimmer` JS guard (BUG 7); `tcRowIn` clamp + `.hc-assistant-fab` (BUG 9); tutorial spotlight; `.sim-drop` | ~15 | **medium** — the largest file count, all additive |
| **H** | Skeletons: loading screen `TextShimmer` + ground; error screen `bf-fade` + pill inversion; `DashboardSkeleton` radius/border/gradient + the `.dash-board` handoff; the three Sales Tier-B frames | 1 new + 2 | low |
| **I** | Cleanup: delete `sidebar-redesign.css` (307 dead lines) + its import, moving its `translate` lesson into the new header; collapse 6 duplicate `dx-pulse` declarations and retire `crew-dx-pulse` / `pdx-pulse`; delete the 3 orphan keyframes; retire `--shadow-accent`'s orange; delete `--wx-serif` from its 10 app scopes and rewrite the 27 reads to `var(--bf-font-sans)` | ~14 | low — **do it last so any regression is attributable** |
| **J** | `density.test.ts` + `tests/shell-nav.test.tsx` | 2 new | none — the guards |

**Files run first, in order:** `tests/settings.test.tsx` (9) → `schedule/boundary.test.ts` (8) →
`components/CommandPalette.test.tsx` (4) → `tests/tutorial.test.tsx` (5) → `tests/map.test.tsx` (7)
→ `tests/schedule.test.tsx` (11) → `schedule/scale.test.tsx` → `App.test.tsx` (62) → the full 346.

**Acceptance.**

1. **All 346 pass, zero test files edited.** Two new files added (§12.3, §12.4).
2. **A computed-style diff** over the 16 shell screens, the six index pages and the seven schedule
   views confirming: every `transition-timing-function` resolves to `cubic-bezier(0.22, 1, 0.36, 1)`
   or `cubic-bezier(0.4, 0, 0.2, 1)`; every duration is one of the token values; and **no
   font-size, row height or `.dash-block h2` size moved** (that last one is frozen at `14.5px`
   because `hs-home.css:1233` reads `.dash-block > .dash-drag-handle:has(+ .hs-widget-head) { top:
   -3px } /* 17px head row */`, and `-3px` is calibrated against the 17px row that `14.5px/650`
   produces — change the panel title size and every drag handle on the board drifts).
3. **The same diff run twice with `prefers-reduced-motion: reduce` forced**, asserting that every
   `animation-name` resolves to `none` except `spin`, and every `transition-duration` is `≤0.3s`.
   This is the only way to see BUG 10, because the suite's `matchMedia` stub cannot.
4. **A browser walk of the tutorial from step 1 to the wrap-up at 1440px, 768px and 375px**, because
   the wrap-up spotlights `tutorial-restart-button`, which now sits inside a `backdrop-filter`
   ancestor and is now visible at every width instead of vanishing below 560px.
5. **A manual walk of the three surfaces no test covers** — the bookmarks star menu, the Bookmarks
   page, `BreezeAssistant` — against the inventory's item lists.
6. **A phone pass on the schedule boards at 900 / 720 / 640px**, because `schedule-phone.css`
   declares no timings of its own and inherits every desktop value.
7. **A drag pass on all three boards** with a throttled CPU, checking that the land ring encloses
   the card on the deal board (BUG 4) and that the keyboard nudge still announces under reduce.

---

## 14. Where this motion plan falls short — the honest part

1. **There is no in-app equivalent of the product-window stage, and this plan does not invent one.**
   The Welcome Page's signature is a mock floating in a `#faf8ee` stage (radius 26px,
   `perspective: 1200px`, `isolation: isolate`) over an animated mesh, tilting under the pointer.
   The tilt survives (it already existed, on `.kpi-card`); the **stage** does not, and the
   spotlight is a 1/10-amplitude substitute for the gesture, not a substitute for the stage.
2. **The gradient trio animates once, on a 36px button.** `hs-top-twinkle` on the AI sparkle is the
   product's only licensed use. Three gradients die for it and are named here rather than left
   implicit: the `.hs-progress` track, `.primary-button`, and the Settings `.sx-dot` — all forced
   flat, plus the leftover orange `rgba(251,133,0)` `--shadow-accent` found while doing it. On the
   marketing page the trio is a recognisable signature across three deliberate places; in the
   product it is one button.
3. **Rhythm does not translate and motion cannot rescue it.** 20–34px between cards is not 108px
   between sections. The one place Welcome-scale air is free is the **72px bottom tail** (nothing
   competes for space below the last row), and `.bf-doc-bleed` lets a dense board escape the
   literally-carried-over 1140px `.wx-main` measure instead of forcing the measure to be abandoned.
   Neither is motion. Motion makes the app feel like the same product; it cannot make it feel like
   the same page.
4. **Every reduced-motion branch remains untested.** `test/setup.ts:57` stubs `matchMedia` to
   `matches: false` for every query, so all 18 `matchMedia` call sites in `App.tsx`, the one in
   `useHudMotion.ts`, the two in `glyph-portal.tsx` and the two in `stagger-cards.tsx` run only
   their non-reduced branch under test. `density.test.ts` assertion 3 and acceptance item 3 are
   static and computed-style substitutes for a test that cannot exist without changing the stub —
   and changing the stub is a 346-test blast radius.
5. **`--wx-amber` renders `#0032b0` — a blue — in seven scopes and a real amber in Crews**, per the
   fixed decision. Against navy chrome that inconsistency was camouflaged. Against paper chrome, a
   blue "Planned" / "ready-to-start" / medium-severity badge sitting beside the `#2f6bff` accent
   will be **more** visible, not less, and RULE N's "one blue in the nav" makes the contrast in the
   *content* louder rather than quieter. Rendered faithfully; flagged as amplified.
6. **The light-chrome flip deletes the app's only strong "I am inside the workspace" colour
   anchor.** A light bar on a light ground leaves one `rgba(28,28,26,0.07)` hairline and a
   `blur(14px)` to carry the whole state distinction, and no proposal treated this as a cost. It
   needs a decision **verified on an uncalibrated monitor**, not asserted: if the hairline does not
   hold, the fallback is `--wx-line` at `0.13` on the bottom border only (never a shadow, which
   would break the Welcome nav's hairline recipe), and the fallback must not become `#fff` on the
   rail — that reintroduces exactly the banding the flip set out to remove.
7. **The bell gets prettier, not better.** Seven synthesized items, no read model, no per-item
   action, no "view all", no empty state, one unstyled tone, and equipment items re-stamped on
   every render so they always sort first. A re-skin cannot fix that; fixing it is a feature change.
8. **Two of the eleven charts still replay on filter, until phase F lands.** `useChartAnimation` is
   the fix and it is a JSX edit in `App.tsx` and `TimeCard.tsx` — the largest App.tsx footprint in
   this plan (11 sites), in the file a parallel session may also be editing. This repo has a
   recorded failure mode for exactly that (a black screen with an empty `#root` and no console
   errors from concurrent App.tsx churn). Phase F should not run concurrently with other App.tsx
   work.
9. **The five empty-state visual languages survive.** Unifying `.hs-empty`, `.hs-home-empty` /
   `.cc-empty-line`, `.schedule-empty-state`, the four dashed slots and
   `.empty-state` / `.inline-empty-state` is the highest-leverage empty-state change in the product,
   and it is out of scope here because it is copy-adjacent and touches ~40 unlisted strings plus
   eight that tests pin. This plan restyles each in place and changes none of them.
