# BuildFlow — Motion & Entrance Animation Spec

**Purpose:** build a single reusable motion system that drives the opening Dashboard entrance and every subsequent page in BuildFlow. Derived from a reference dashboard recording (the "Exylon" clip). This spec describes _behavior and timing_, not visual design — BuildFlow keeps its own navy/amber palette.

**How to use this file:** Claude Code should read it in full before writing code, then implement Phase 1 → Phase 6 in order, stopping after each phase for review.

---

## 0. Stack assumptions

Confirm these before starting; if the repo differs, adapt rather than restructure the app.

| Assumption    | Default                                 | If different                                                                |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Framework     | React 18 + Vite (or Next.js App Router) | Same primitives, swap the route-transition layer                            |
| Styling       | Tailwind CSS                            | Keep tokens in CSS custom properties, not Tailwind config                   |
| Animation lib | **Framer Motion** (`motion`)            | GSAP is acceptable; do not mix both                                         |
| Charts        | Recharts                                | If already using another lib, keep it — do not swap libraries for this work |
| Numbers       | Custom `useCountUp` hook                | No extra dependency                                                         |

**Do not** introduce a second animation library, a scroll library, or Lottie. Everything here is achievable with Framer Motion + CSS + SVG `stroke-dasharray`.

### How BuildFlow actually differs (resolved 2026-09-19)

| Assumption      | BuildFlow                                                                  | Resolution                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 18 + Vite | React **19** + Vite 8                                                      | Same primitives. No route layer at all — pages swap on a `page` state value, so §4's route transition is a content-beat replay, not a router hook. |
| Tailwind        | **No Tailwind.** Hand-written CSS, `app-shell-client-desk.css` loaded last | Tokens live in CSS custom properties, as the table's own fallback says.                                                                            |
| Framer Motion   | **Already a dependency** (`framer-motion@12`)                              | Used as specified. No second library added.                                                                                                        |
| Recharts        | Already a dependency                                                       | Kept.                                                                                                                                              |
| `useCountUp`    | `components/ui/animated-figure.tsx` already does this                      | Kept and re-pointed at the tokens rather than replaced.                                                                                            |

One structural constraint governs the whole build: **the Dashboard's panels are positioned and dragged by an inline `style.transform`** (`board/panelBoard.tsx`). A Framer `motion.div` entrance on a panel would fight that inline transform — the exact defect already recorded against the deal board's DragOverlay. So panels keep a **CSS-keyframe** entrance, and the tokens are published into CSS as `--bfm-*` custom properties so both halves read one set of numbers. `tests/motion-tokens.test.ts` fails if the two ever drift.

---

## 1. Motion token system

`client/src/motion/tokens.ts`. Every animation in the app pulls from here. No raw duration or easing values anywhere else in the codebase.

```ts
export const DUR = {
  instant: 0.12, // hover color, icon tint
  fast: 0.22, // buttons, chips, tooltips
  base: 0.4, // standard element entrance
  slow: 0.6, // card / panel entrance
  chart: 0.9, // path draw, bar growth
  count: 1.4 // number count-up
} as const;

export const EASE = {
  out: [0.22, 1, 0.36, 1], // expo-out feel
  soft: [0.33, 1, 0.68, 1],
  inOut: [0.65, 0, 0.35, 1],
  bar: [0.16, 1, 0.3, 1]
} as const;

export const STAGGER = {
  icon: 0.04,
  char: 0.035,
  card: 0.09,
  row: 0.14,
  bar: 0.055,
  cell: 0.012
} as const;

export const MOTION = {
  rise: 16,
  riseL: 24,
  blur: 10,
  blurT: 6,
  scale: 0.97
} as const;
```

### Reduced motion (non-negotiable)

`useReducedMotion()` wrapping Framer's hook. When true:

- all entrance animations collapse to a **150ms opacity fade only** — no transform, no blur, no stagger
- count-ups jump straight to the final value
- chart paths render fully drawn
- hover states still change color (color is not motion)

Ship this in Phase 1, not as a retrofit.

---

## 2. Core primitives

`client/src/motion/` is the only animation surface. Feature code composes them; feature code never calls `motion.div` with inline variants.

### 2.1 `<AppFrame>` — first-paint shell

Wraps the entire authenticated app. On mount (once per session): `opacity 0→1`, `scale 0.985→1`, `blur(10px)→blur(0)`, `DUR.slow`, `EASE.out`. Background gradient is **static**.

### 2.2 `<Reveal>` — the workhorse

`opacity 0→1`, `y +16→0`, `blur(10px)→0`; `DUR.base`, `EASE.out`, `once: true`.

### 2.3 `<StaggerGroup>` / `<StaggerItem>`

Parent orchestrates `staggerChildren` + `delayChildren`. Takes a `stagger` token, not a number.

### 2.4 `<TextReveal>` — the title effect

Splits a string into characters (spaces preserved, `aria-label` on the wrapper, `aria-hidden` on each span). Per character: `opacity 0→1`, `blur(6px)→0`, `y 8→0`, `DUR.base`, stagger `STAGGER.char`. Use on **page titles only** (`h1`).

### 2.5 `<CountUp>` — numeric roll

`Intl.NumberFormat` preserved mid-count; `requestAnimationFrame`; **tabular-nums**; fires only when its parent card enters, never on every data refresh.

### 2.6 `<AnimatedBars>`

Vertical: `scaleY 0→1`, `transformOrigin: bottom`, stagger `STAGGER.bar`, `DUR.chart`, `EASE.bar`. Horizontal segmented: sequential, each segment starting at ~60% of the previous one's duration.

### 2.7 `<AnimatedLine>` / `<AnimatedArea>`

`strokeDasharray = pathLength`, animate `strokeDashoffset: pathLength → 0` over `DUR.chart`, `EASE.out`. Area fill and dots fade in at `+0.35s`. Axis labels and gridlines fade in at `DUR.fast` before the draw.

### 2.8 `<CellGrid>` — hex/heat map

`opacity 0→1`, `scale 0.4→1`, staggered by **distance from center** (`STAGGER.cell` × radial index) so it blooms outward.

### 2.9 `<HoverCard>` / `<ChartTooltip>`

Card hover `y: -2` + shadow, `DUR.instant`, no scale. Bar hover → solid fill + value chip. Line hover → snapping crosshair + tooltip that flips near the edge.

---

## 3. Opening Dashboard choreography

| t (ms) | Element              | Motion                                                 |
| ------ | -------------------- | ------------------------------------------------------ |
| 0      | App frame            | fade + scale 0.985→1 + blur 10→0, 600ms                |
| 260    | Logo                 | Reveal, y=8                                            |
| 320    | Active nav pill      | Reveal + subtle scale 0.9→1                            |
| 360    | Nav icon row         | StaggerGroup, `STAGGER.icon`                           |
| 520    | Date / user avatar   | Reveal                                                 |
| 640    | Left rail icons      | StaggerGroup top→down, `STAGGER.icon` ×1.5             |
| 760    | **Page title**       | TextReveal, per-char                                   |
| 900    | Filter controls      | StaggerGroup, `STAGGER.icon`                           |
| 1040   | KPI strip card       | Reveal, y=24, blur                                     |
| 1140   | KPI columns          | StaggerGroup `STAGGER.card`; CountUp on its own reveal |
| 1400   | Row 2 cards          | StaggerGroup `STAGGER.card`, y=24                      |
| 1550   | Row 2 chart contents | line draw + cell bloom, +150ms from their card         |
| 1700   | Row 3 cards          | StaggerGroup `STAGGER.card`                            |
| 1850   | Row 3 chart contents | bars grow, line draw, CountUps                         |
| ~3250  | settled              | all count-ups complete                                 |

**Reference is ~3.6s. Ship at ~2.4s.** Compress by shortening `delayChildren` between rows (`STAGGER.row` 0.14 → 0.09) and overlapping chart draws with card entrances. Keep the _order_, tighten the _gaps_.

### First-load gating

- Full chrome sequence (frame, nav, rail) **once per session**, stored in `sessionStorage`. Later navigations animate content only.
- Never on data refresh, filter change, or tab switch — those get a 120ms cross-fade.
- Skeletons hold layout while data loads; the entrance plays when data is ready.

---

## 4. Applying this to every other page

Every page uses the same three-beat structure, built once as `<PageShell>`:

```
<PageShell title="Schedule">
  <PageShell.Metrics>  ...KPI cards...     </PageShell.Metrics>
  <PageShell.Row>      ...primary panels... </PageShell.Row>
  <PageShell.Row>      ...secondary...      </PageShell.Row>
</PageShell>
```

`PageShell` owns: title TextReveal → metrics row → content rows. **No page implements its own entrance timing.**

### Route transitions

Outgoing `opacity → 0`, `y: -8`, 180ms `EASE.inOut`; incoming replays the content beats (title onward) but **not** the frame/nav/rail.

### Page-type recipes

- **Schedule / Gantt:** bars draw left→right in `STAGGER.bar` order by start date; dependency arrows after; today-line wipes last. Not on zoom or pan.
- **Crew / list views:** first 12 rows stagger `STAGGER.icon`, then instant.
- **Timecards / tables:** header fades, rows fade as a block, totals CountUp.
- **Analytics:** full chart treatment.
- **Modals / drawers:** scale 0.96→1 + fade 200ms, backdrop 150ms; drawers slide 240ms `EASE.out`.

---

## 5. Micro-interactions (apply globally)

| Element        | Rest → Hover                        | Duration                |
| -------------- | ----------------------------------- | ----------------------- |
| Card           | shadow sm → md, `y: -2`             | `DUR.instant`           |
| Icon button    | bg transparent → tint               | `DUR.instant`           |
| Primary button | brightness +4%, `scale: 0.98` press | `DUR.instant`           |
| Bar (chart)    | tint → solid + value chip           | `DUR.fast`              |
| Chart point    | crosshair snap + tooltip            | `DUR.fast`              |
| Nav pill       | active pill travels via `layoutId`  | `DUR.fast`, `EASE.soft` |
| Dropdown       | fade + `y: -6 → 0`                  | `DUR.fast`              |

---

## 6. Performance rules

- Animate **only** `opacity`, `transform`, `filter`.
- `will-change` only while animating.
- Blur is the expensive part: cap at 10px, never blur a container holding more than one card, drop blur under 768px.
- Under ~80 animated nodes on first paint. Past that, animate containers, not children.
- Verify 60fps in a 4× CPU-throttled profile before calling a phase done.

---

## 7. File structure

```
client/src/motion/
  tokens.ts            # durations, easings, stagger, distances
  useReducedMotion.ts
  useCountUp.ts
  AppFrame.tsx
  Reveal.tsx
  Stagger.tsx
  TextReveal.tsx
  CountUp.tsx
  charts/
  index.ts
client/src/components/layout/
  PageShell.tsx
```

---

## 8. Build phases & acceptance criteria

**Phase 1 — Foundation.** `tokens.ts`, `useReducedMotion`, `Reveal`, `StaggerGroup/Item`.
**Phase 2 — Chrome.** `AppFrame`, nav assembly, rail assembly, `layoutId` nav pill, session gating.
**Phase 3 — Title & numbers.** `TextReveal`, `CountUp`.
**Phase 4 — Charts.** `AnimatedBars`, `AnimatedLine`, `CellGrid`, hover states, `ChartTooltip`.
**Phase 5 — PageShell + dashboard.** Assemble against the §3 timeline, compress to ~2.4s.
**Phase 6 — Rollout.** Schedule, Crew, Timecards, Analytics; route transitions; §5 hover table app-wide.

### What Phase 6 shipped (2026-09-19)

Fifteen page cascades and thirteen menu cascades were re-pointed at the beats — `80+70`, `120+90`, `440+90`, `520+60`, `620`, `40`, `160+90`, `120+180`, `420+70`, `560+50`, `760`, `800+50`, `960+60`, `1000+50` and `60+30 … 120+70` are all gone. `tests/page-openings.test.ts` is the acceptance criterion as a test: it fails on any literal timing in the sheet's motion outside a reduce block.

Departures from §4, each deliberate:

| §4 asks for                                     | What shipped                                                   | Why                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageShell` component                           | The beats live in the sheet (§74a), keyed on page-root classes | Pages are rendered inline in a 40k-line `App.tsx` that another session edits concurrently. A shared **timing source** is what §4 is actually after — "no page implements its own entrance timing" — and re-pointing the rules where they stand achieves it without restructuring the app. |
| Route transition: outgoing `opacity → 0, y: -8` | **Built 2026-09-19** — see below                               |                                                                                                                                                                                                                                                                                           |

### The route transition (2026-09-19)

`motion/PageSwap.tsx` and skin §79. The incoming half was already there — every page's beats replay on mount — so this is only the outgoing half: `opacity → 0`, `y: -8`, 180ms `EASE.inOut`, measured in the running app as `180ms cubic-bezier(0.65, 0, 0.35, 1)`.

`mode="wait"` would have been simpler and is wrong: it holds the incoming page back until the outgoing one finishes, so for 180ms there is no page at all, and §9.6 says motion never delays interactivity. Overlapping instead means the document briefly holds TWO pages, and the whole of the work is making the leaving one count for nothing while it goes — out of the layout (`mode="popLayout"`), behind and deaf to the pointer (its `exit` variant), and **`inert` + `aria-hidden`**.

That last part was not optional. Without it a screen reader finds two pages and reads both, and thirteen existing tests failed with "Found multiple elements" because every query for "the heading" found it twice. One test also had to change its claim: the page being left is no longer gone in the same tick, so it now waits for the removal rather than asserting it immediately.

App.tsx gains three lines: an import and a wrapper around the existing `{page === "x" && …}` chain, which is untouched.
| Gantt bars in `STAGGER.bar` order **by start date** | Staggered by **row**, capped at 6 bands | A bar is placed and dragged by an inline `left`/`width`; threading an order through `GanttFeatureList`'s render prop would put another inline property on the element the drag owns. Rows are already ordered by project then date, so down the page ≈ across it. Six bands because the arrows and markers wait for the last bar to _finish drawing_ — every extra band costs the settle twice, and twelve put the marker at 3.1s. |
| Crew / list views: first **12** rows | First **8** | The cap already in the sheet; tighter than the spec, same effect. |
| `layoutId` nav pill | **Built 2026-09-19, without `layoutId`** — see below | |

### §5's travelling pill (2026-09-19)

Built from a second reference clip, and MEASURED off it rather than taken from §5's row: tracking the pill's own pixels frame by frame through one move gives ~470ms on `cubic-bezier(0.3, 1, 0.6, 0.85)` — a spring, which is faster off the line and slower through the middle than any of §1's four curves (`EASE.out`, the closest, is about twice as far from the data). `DUR.pill` and `EASE.pill` are that measurement; §5's `DUR.fast` + `EASE.soft` is less than half the duration and visibly snappier than the reference.

Both edges interpolate, so the pill changes WIDTH to fit its target rather than sliding at a fixed size — the half that makes a narrow option beside a wide one look right.

Not `layoutId`, which needs the indicator rendered inside the active child — a change at every call site in a 40k-line `App.tsx` another session is editing. `motion/SegmentPill.tsx` writes two custom properties onto the group element instead and the group's own `::before` is the pill (skin §78). React owns nothing it touches, it serves any group named in `PILL_GROUPS` including ones inside body portals, and with no JS the selected option simply keeps the background it always had.

Selection only, not hover: the reference never moves the pill on hover, and the pill IS the dark background the selected option's light text sits on — parked under a merely-hovered option it would put that option's muted ink on its own fill.

**Rolled out to eleven groups (2026-09-19):** the Dashboard's approval toggle, Preferences' radio rows, the view switcher on nine index pages, Timecards' sections and its breakdown, the Gantt's range, the notifications filters, BuildFlow AI's nav, the map's optimisation goal, the icon rail, and Settings' category rail. Two shapes the mechanism had to grow for: the rail marks the **button inside its slot**, so the selected element is found at any depth and measured itself (a slot-sized pill would be wrong in both size and place); and the rail is a **column of discs**, which needed only `--bfm-pill-fill` and `--bfm-pill-radius` per group. Measuring walks the offsetParent chain rather than `getBoundingClientRect`, because the shell carries a CSS `zoom` (skin §42) that scales a client rect but not an offset.

Groups deliberately left out: the command palette (keyboard-driven rows that scroll under the selection), and anything whose "active" is a button's own state rather than one option out of several.

**The stretch (2026-09-20).** The pill's leading edge runs ahead of its trailing one, so the box flexes in the direction it is going and settles as it lands.

Worth recording plainly: **the reference clip does not do this.** Tracking its pill's own painted edges through one move, frame by frame, the two never diverge by more than **1.3 percentage points** of their own travel — that is the rounded corners, not a leading edge. A wide pill crossing two labels mid-slide looks like a stretch in a still frame, and that is what it was read as here. This is an addition that was asked for, not a correction.

**The onboarding's trade tiles (2026-09-22)** are the twelfth group, asked for as "some sort of clean effect for when a user selects" a trade. Same engine, one difference in the sheet: a grid of bordered tiles gets a RING above the tiles rather than the fill beneath them — a fill travelling under the grid would cross two tiles' own borders on the way. The tile's grey fill, its icon's colour (a small spring, `DUR.base` on `EASE.soft`) and a check badge change in place as the ring arrives; the first choice fades in where it lands (`placed` flushed at opacity 0, `live` carries it up). The ring lives in `onboarding.css`, since the flow is outside the shell and §78 cannot reach it.

It cannot be a transition. Both edges of a `transform` + `width` pair are tied to the same two values, so a move between two options of the same width cannot change length on the way — whatever easing either property is given. `left`/`right` would express it directly and is what this wanted to be, but §6 is "animate only opacity, transform and filter" and those two are layout. So `motion/SegmentPill.tsx` emits 18 stops onto the group's `::before` through the Web Animations API, as `transform` + `width` + `height` — the pair §78 was already animating. Not `scaleX`: a fully-rounded pill scaled sideways has elliptical ends.

`PILL.lead` (0.35) is a fraction of the travel rather than a second curve — the leading edge runs `EASE.pill` at 1 + lead times the rate, arrives early, and waits while the trailing edge catches up. One number to justify instead of four. Each axis is measured separately, so a column's pill leads with its bottom edge going down and its top edge coming back.

`PILL.stretchCap` (28px) is why it flexes rather than smears: the bulge is about a third of the lead times the distance, so an option four sections down Settings' rail would otherwise take on 75px of extra length. Measured live: 37px of travel gives 4.3px of stretch, 111px gives 12.8px, 148px gives 17px, and the cap holds everything past ~226px at 28px. The cap is turned back into a smaller `lead` rather than clamped later, so the bulge stays a curve instead of growing a flat top.

The sheet's transition stays, and carries the move on its own under reduced motion or where a pseudo-element cannot be animated.

**Settings' rail was one of those, and should not have been (2026-09-19).** It was excluded on the grounds that its categories are split across four headed sections and a pill would have to jump a heading to get between them — the right observation, the wrong conclusion. The group is the WHOLE RAIL, not one section: the pill travels the column and passes behind the headings, which is the thing itself rather than an obstacle to it. Taking the rail also reaches the BuildFlow AI button, a category like the others that sits outside every section and that no per-section group could ever have included.

The rail is also the one group the sheet must NOT give `position: relative`. It is already positioned — `sticky`, which is what holds it beside a panel taller than the window — and the layer needs a positioned group, not that exact value.

---

### Settings, finally on the beats (2026-09-19)

Asked for as "put all the animations within the Dashboard as well as the pages and put it within the Settings page". Most of what that names was already true: Settings is in §4's list, so it declares `--bfm-shift`, and the Preferences view it hosts has had both the travelling pill (`.pref-segmented`) and the gooey menus (`.pref-menu`, plus every `<select>` and date field through the two portal layers) since those were built.

What was not true is the sentence in "What Phase 6 shipped" that says Settings "opens the way the Dashboard does". Settings was the one page whose own cascade was never re-pointed: `settings-redesign.css` still opened it on nineteen hand-picked literals — 0.55s rises at 0.04/0.1/0.16/0.22/0.28/0.36s down the rail, 0.6s rises at 0.02/0.1/0.18/0.26/0.34/0.42s down the panel, a 0.5s plan card every 0.08s, and a 0.32s slide under the billing segment. Skin **§81** makes the claim a fact; the numbers are not copied there, every rule reads the beats in §74a.

**The rows drop (2026-09-19, second pass).** Asked for with a clip of the Companies page opening: _"the animation should look like a list dropping all the information (like how the pages within the dashboard look)."_ Read frame by frame that page is three things — at 0.27s the card is a blurred slab with its head writing itself; at 0.55s the head and column labels are sharp and the ROWS are arriving one after another down the table, each still blurred and 8px low when the one above has landed; at 0.82s it is finished.

Settings had the first two. Its sections landed as whole cards, so a panel of nine settings rows arrived as one slab of nine — the thing the reference never does. The rows now carry the same cascade the index tables do, off the same beats and staggers, read from the rules that drive those tables rather than copied from them.

Three details the reference decides, not taste:

- **The blur is inherited, never repeated.** The block sets `--bfe-blur` and every row inside reads it, exactly as the index card does. A row declaring its own would double it.
- **A section's `h2` stays out of the cascade.** It arrives with its block, the way the table's column labels are already sharp while the rows are still coming.
- **The drop carries on down the page.** Settings stacks several blocks in one panel, which an index page does not, so a row waits for its own block as well as for its place in it (`--bfe-b` × `STAGGER.card` + `--bfe-r` × `STAGGER.icon`). Without the first term every block restarts the same cascade at the same instant and two lists drop in parallel. The block's rank needs a name of its own because a row sets `--bfe-r` for itself and would otherwise shadow it.

Measured in a browser at 520ms into a switch, one section reads 0.88 / 0.76 / 0.55 / 0.22 / 0.00 down its rows with the blur rising to meet it, and the next section 0.48 / 0.11 / 0.00 — the reference's own gradient.

Two things the pill forced, both of which are better motion anyway:

- **The rail rises as one block and its contents only fade.** The pill is the rail's own `::before`, placed by measured offsets — and an offset does not see a transform. While each nav section slid up independently, the pill sat at the final resting place of an item that had not arrived there yet, detached from it for the whole entrance. Moving the transform up to the rail puts the pill inside it, so the two can never come apart.
- **The panel comes out of the category you picked** (§81c, on §64's numbers). Picking a category re-keys `.settings-panel-inner`, so a whole new panel arrives and `PanelGoo` measures the item that was pressed. The page's first open is deliberately not that: it arrives from the top bar's gear, and a panel morphing out of the chrome while the rail is still assembling is two openings at once — so the layer only spends a rect taken from a CATEGORY control, and the panel otherwise keeps the beats.

Billing's own two-option switch (`.sx-seg-ind`) is the travelling selection built a second time by hand, before §78 existed. Its markup stays — it works, and with exactly two options nothing has to be measured — but it now travels on `DUR.pill`/`EASE.pill` like every other selection in the program.

---

### Settings' buttons, by what pressing one commits you to (2026-09-20)

Asked for with the same segmented-control clip §5's pill came from: _"look through the animations, effects and tweening within the Settings page, then customize the effects for the different buttons."_

**What the clip argues** is not the pill — that was built in §78 — it is that a control's treatment is chosen for the control. Five segmented controls sit side by side and no two are dressed the same: a white disc behind an icon, a solid fill behind a label, a raised card with a shadow, a tinted pill, a card with a rule beside it.

**What Settings had**, measured rather than read: fourteen kinds of button and twelve of them doing the same two things — rise 2px, take a bigger shadow (`translateY(-2px)` appears 43 times in the skin). Three were on `transition: all`, which animates whatever happens to change, layout included. Durations ran 0.12 / 0.16 / 0.18 / 0.2 / 0.22s with no two families agreeing. And **there was no `:active` rule anywhere in the file** — `DUR.instant` had been published as `--bf-dur-press` and put in transition lists for a state nobody had written, so nothing in the program moved under the finger.

Skin **§82** gives them six gestures, grouped by what pressing one commits you to:

| family                                                                                        | hover                                      | press                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| committing (`acct-primary`, `settings-primary-action`, `sx-addon-cta`, `sx-plan-cta.primary`) | rises 2px                                  | `translateY(0) scale(0.97)`          |
| secondary (`settings-action-button`, `acct-link-btn`)                                         | stays put, ground tint                     | `scale(0.97)`                        |
| destructive (`settings-member-remove`, `wc-remove`)                                           | **never rises** — danger tint, glyph 1.12× | `scale(0.92)`                        |
| dismiss (`settings-close-button`)                                                             | glyph turns 90°, disc tints                | `scale(0.9)`                         |
| choosing (`settings-nav-item`, `sx-seg-opt`)                                                  | tint; ink on the pill's curve              | `translateY(1px)` — _into_ the track |
| the toggle (`settings-toggle`)                                                                | —                                          | the knob squeezes to 26px            |

Three of those are judgements the clip does not make and the product needed anyway. **Destructive never rises**: every other button uses that as "come and press me", and the control that takes a teammate off the workspace should not be the one saying it. **Secondary does not lift** because it sits _inside_ a row rather than on top of one, and a row lifting a piece of itself reads as the row coming apart. **Choosing presses in** because those are options in a groove, not buttons on a surface — the opposite of a lift.

The line between committing and secondary is what the button WRITES, not how big it is: "Add to workspace" is a solid pill that buys an add-on, so it commits.

The toggle's knob now travels on `DUR.pill` / `EASE.pill` — the pair measured off this clip for §78 — so the one thing on the page that slides has the same character as the thing in the video.

---

### The Dashboard's panels are carried like Schedule jobs (2026-09-20)

Asked for with a clip of the Month board: _"use the same animation/tween effect from the jobs within the schedule and put it within the Dashboard Customize section/widget movings — wherever the job is going it will slowly tween that direction."_

It is the same function, not a second one: `scheduleCarryLean` out of `schedule/parts/carry.tsx`, with `SCHEDULE_CARRY_EASE` exported beside it so the smoothing constant exists once. A carried panel used to take a fixed `rotate(-1.5deg)` — a tilt, but the same tilt whichever way it was going, which is the half of the gesture that says nothing.

Two things the Dashboard needed around it, both of which are where a second copy of the gesture would otherwise have grown:

- **The panel's position moved off `transform` onto the individual `translate` property.** The lean writes `transform` every frame and React writes the offset on every pointer event; two writers on one property at pointer rate clobber each other. They compose in the spec's own order (`translate` → `rotate` → `scale` → `transform`), which is the same order the Schedule's overlay and its clone are already in.
- **The lean runs on its own frame loop**, not off the pointer — for the reason the Schedule's does: it has to keep easing back to square after the hand _stops_, and a hand that has stopped sends no pointer events. The loop measures the panel's own box each frame, so it needs nothing from the drag state and cannot disagree with it. The box is divided by the board's CSS zoom, because a client rect is scaled by it and the lean's constants were fitted in unscaled pixels.

Measured on the real board: dragging right banks **+4.55°**, left **−4.34°**, and a brisk diagonal reaches a 6.55° three-dimensional tip. Let the hand rest mid-drag and the bank eases from −2.85° to **−0.02°** without a single pointer event — which is the thing the separate loop buys.

The Schedule's other half — the DragOverlay clone and the dashed slot it leaves behind — is _not_ copied here. The Dashboard's board already leaves a placeholder well and drags the real panel rather than a clone, so the only thing missing was the lean.

---

## 9. Constraints — do not violate

1. No hard-coded timings outside `motion/tokens.ts`.
2. No second animation library.
3. Entrance animations run **once** per mount, never on data updates, filter changes, or scroll-back.
4. Reduced-motion support ships in Phase 1, not bolted on later.
5. No animated backgrounds, no looping ambient motion, no parallax.
6. Motion never delays interactivity — buttons are clickable the instant they render, even mid-fade.
7. Keep BuildFlow's existing palette and typography. Timing and behavior only; do not import the reference's blue.

---

## 10. What else moves, and where it lives

Not everything in this program's motion is this spec's. Two effects predate it and keep their own sections in `app-shell-client-desk.css`, on the `--bf-*` names rather than `--bfm-*`:

- **§64 — a dropdown comes out of its own button.** Every menu's first frame IS the control that opened it; the panel's own blur stands in for the metaball threshold, because the trigger is in the shell and the menus are portals on the body, so no filter can fuse them for real. Five custom properties let one keyframe serve every menu, and `selectMenu.tsx` measures the real control.
- **§80 — six more panels on the same effect (2026-09-19).** `motion/PanelGoo.tsx` measures whatever was pressed, in the click's capture phase — the floating "Ask AI" button unmounts the instant its panel opens, and a row that opens a record can be gone by the next render. It serves BuildFlow AI (§80, §80b), the five right-side panels (§80c) — the dialogs, the Contacts record, the Gantt's job drawer, the add-job form and the section picker, which all used to arrive from the right edge on `bfe-drawer-in` — and the icon rail's flyout (§80d), which slid in 6px and had no exit at all.

  The flyout is the odd one out twice over: it opens on HOVER, so it is measured from the rail button the pointer is on rather than the last thing clicked; and it is not a portal on the body, so `panelExit.tsx` returns its copy to the rail. That is why that file puts a copy back in the node's own parent rather than on the body.

  They are measured two different ways because they arrive two different ways: the assistant is always mounted and opened by a class, the five panels mount when they open. Both close by the same morph reversed — for the panels, `panelExit.tsx` already puts a copy back to play the exit, and `cloneNode` carries the measured numbers and the mark into it, so the copy knows where to go without being measured again. A centred confirm is deliberately excluded: it never went to the edge, so it does not come out of one.

Both use `--bf-dur-panel` and `--bf-ease-size` — a box changing size, which is what the size curve is for — rather than any of §1's entrance pairs.

---

## A section comes into focus (2026-09-20)

Asked for with a second clip, against the Dashboard's sections: *"change the dashboard animation for all the sections/widgets showing up — make sure to match the animation like the video reference."*

**What the clip does that the first reference did not: its cards do not travel.** Measured frame by frame (25fps source, so 40ms is the resolution limit): a third of the way into a card's arrival, its figures sit on **exactly the same baseline** as the finished card beside them — a 24px rise would read as ~16px of offset at that point, and there is none — while the content is plainly out of focus and the card's own border has not arrived yet. Blocks arrive in reading order, roughly 120–160ms apart, and their figures count up. That is a **focus-in**: opacity and blur, no movement.

So `.dash-board .dash-block` plays **`bfe-focus`** (skin §74h) instead of `bfe-lift`. The keyframe carries no `transform` at all, which is a second, smaller win against the constraint at the top of this document: the board's inline placement and the hover lift are now untouched for the whole 600ms rather than merely after it.

Three things deliberately did NOT change:

- **The order and the stagger.** What the clip re-cuts is the shape of one section's arrival, not the sequence — `--bfm-beat-board` + row + column stands.
- **The duration.** The clip's own per-block timing could not be measured honestly: the recording zooms while it plays, which drags the sharpness curve around after ~0.8s. `--bfm-dur-slow` was tuned for a thirteen-panel board and stays.
- **Less motion** (§74j) — still a plain fade, since its `animation` shorthand names `bfe-lift` and overrides the name.

One thing had to: **a section's contents stop sliding too** (`--bfe-y: 0`). Eight pixels of contents sliding inside a card that is standing still is the one thing the clip never shows. They keep their own beat, as a fade.

**Phones keep the lift** (§74i). The blur is the expensive half and is dropped there, and with it gone `bfe-focus` is a bare fade — so on a phone the panels take `bfe-lift` and its rise back. The shape the clip asks for is the one a phone cannot afford.

---

## Signing up in five steps (2026-09-22)

Asked for with a recording of another product's onboarding, against the signup page and the three
onboarding pages that followed it: *"redesign the signup page & onboarding … five easy steps … make
sure to add the animations/effects from the video, and the same colours."* Built as
`client/src/onboarding/` (OnboardingFlow, OnboardingPreview, PlanStep, recommendPlan) on
`onboarding.css`; App.tsx renders it for `#create-account`, `#business-type` and
`#additional-products`, and the login form keeps its own page.

**What the recording does, measured at 40ms** (a 57fps source, so 40ms is the resolution):

| beat | measured | rung used |
|---|---|---|
| the preview and the counter move | at once — the next card is on the right while the old form is still whole | synchronous |
| the outgoing form fades, as one piece | ~160ms | `DUR.exit` 180ms |
| the column stands empty | ~120ms | `STAGGER.row` 140ms |
| each incoming element comes into focus | ~160ms, blur and opacity, **no travel** | `DUR.fast` 220ms, `MOTION.blurT` 6px |
| one element to the next, top to bottom | ~100ms | `STAGGER.card` 90ms |
| the plan page's gradient | at once | — |
| the plan card, as one unit | starts ~160ms later, ~200ms in | `STAGGER.row`, `DUR.base` |

The elements do not travel: the heading sits on the same pixel in its first blurred frame and its
settled one (frames 36.80 and 37.36). That is the same shape as the Dashboard's `bfe-focus` above,
arrived at from a different reference, and it is what keeps the layout still while a form is
retyped — a field that slid in under a moving cursor would be the thing the recording never shows.

**Verified in the running page** by sampling the DOM through one transition: at +100ms the frame had
already turned from rose to mint and the counter read "Step 2 of 5" while the old pane was at
opacity 1; at +200ms the pane was at 0.35; at +340ms the new heading was mounted with every beat at
0; at +420ms the first beat was at 0.90 and the rest still 0. The plan card's animation, seeked:
0 at 0 and 140ms, 0.92 at 300ms, 1 at 540ms.

**Colour.** White, near-black, mid greys, and three pastel gradients sampled from the recording —
rose while the questions are about the person, mint once they are about the business, peach for its
size — plus the plan page's own. The recording's progress bar is blue; this product has no blue
anywhere (skin §46), so the bar is ink.

**Less motion**: every beat becomes a `--bfm-reduced` fade with no delay, the exit is the same fade,
and the flow moves to the next step without waiting for the old one to leave.

**The whole way in is on the same page (2026-09-22).** `onboarding/AuthShell.tsx` is the frame the
four single screens share — signing in, and the three an emailed link lands on (`ResetPasswordPage`,
`VerifyEmailPage`, `AcceptInvitePage`). They wear the flow's column, card and beats without its
progress block, which is what `.onb-solo` means: one screen, not a step of five. `--onb-pane-top`
adds that block's 25px back, so every heading in the family is held at the same height (measured at
y=192, and 57px over the phone's own 32px) and moving between them does not shift the page under the
reader. `usePaneSwap` carries each of their state changes on the steps' own exit/gap/enter —
login into forgot-password, "Confirming…" into its answer, "Checking your invite…" into the form.

The flow's last step, "Who runs the work with you?" (`InviteTeamPage`, `#invite-team`), joined the same
day. It is the flow's TAIL rather than a single screen, so `AuthShell` draws the flow's own progress
block for it — full, and labelled "Last step" — instead of the solo offset; its heading lands on the
same y=192. Sending swaps to the answer on the same exit/gap/enter, and each invitee's row on the
card's tray arrives on the beats' own focus-in.
