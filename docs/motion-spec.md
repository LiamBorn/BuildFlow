# BuildFlow — Motion & Entrance Animation Spec

**Purpose:** build a single reusable motion system that drives the opening Dashboard entrance and every subsequent page in BuildFlow. Derived from a reference dashboard recording (the "Exylon" clip). This spec describes *behavior and timing*, not visual design — BuildFlow keeps its own navy/amber palette.

**How to use this file:** Claude Code should read it in full before writing code, then implement Phase 1 → Phase 6 in order, stopping after each phase for review.

---

## 0. Stack assumptions

Confirm these before starting; if the repo differs, adapt rather than restructure the app.

| Assumption | Default | If different |
|---|---|---|
| Framework | React 18 + Vite (or Next.js App Router) | Same primitives, swap the route-transition layer |
| Styling | Tailwind CSS | Keep tokens in CSS custom properties, not Tailwind config |
| Animation lib | **Framer Motion** (`motion`) | GSAP is acceptable; do not mix both |
| Charts | Recharts | If already using another lib, keep it — do not swap libraries for this work |
| Numbers | Custom `useCountUp` hook | No extra dependency |

**Do not** introduce a second animation library, a scroll library, or Lottie. Everything here is achievable with Framer Motion + CSS + SVG `stroke-dasharray`.

### How BuildFlow actually differs (resolved 2026-09-19)

| Assumption | BuildFlow | Resolution |
|---|---|---|
| React 18 + Vite | React **19** + Vite 8 | Same primitives. No route layer at all — pages swap on a `page` state value, so §4's route transition is a content-beat replay, not a router hook. |
| Tailwind | **No Tailwind.** Hand-written CSS, `app-shell-client-desk.css` loaded last | Tokens live in CSS custom properties, as the table's own fallback says. |
| Framer Motion | **Already a dependency** (`framer-motion@12`) | Used as specified. No second library added. |
| Recharts | Already a dependency | Kept. |
| `useCountUp` | `components/ui/animated-figure.tsx` already does this | Kept and re-pointed at the tokens rather than replaced. |

One structural constraint governs the whole build: **the Dashboard's panels are positioned and dragged by an inline `style.transform`** (`board/panelBoard.tsx`). A Framer `motion.div` entrance on a panel would fight that inline transform — the exact defect already recorded against the deal board's DragOverlay. So panels keep a **CSS-keyframe** entrance, and the tokens are published into CSS as `--bfm-*` custom properties so both halves read one set of numbers. `tests/motion-tokens.test.ts` fails if the two ever drift.

---

## 1. Motion token system

`client/src/motion/tokens.ts`. Every animation in the app pulls from here. No raw duration or easing values anywhere else in the codebase.

```ts
export const DUR = {
  instant: 0.12,   // hover color, icon tint
  fast:    0.22,   // buttons, chips, tooltips
  base:    0.40,   // standard element entrance
  slow:    0.60,   // card / panel entrance
  chart:   0.90,   // path draw, bar growth
  count:   1.40,   // number count-up
} as const;

export const EASE = {
  out:      [0.22, 1, 0.36, 1],      // expo-out feel
  soft:     [0.33, 1, 0.68, 1],
  inOut:    [0.65, 0, 0.35, 1],
  bar:      [0.16, 1, 0.3, 1],
} as const;

export const STAGGER = {
  icon:  0.04, char: 0.035, card: 0.09, row: 0.14, bar: 0.055, cell: 0.012,
} as const;

export const MOTION = {
  rise: 16, riseL: 24, blur: 10, blurT: 6, scale: 0.97,
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

| t (ms) | Element | Motion |
|---|---|---|
| 0 | App frame | fade + scale 0.985→1 + blur 10→0, 600ms |
| 260 | Logo | Reveal, y=8 |
| 320 | Active nav pill | Reveal + subtle scale 0.9→1 |
| 360 | Nav icon row | StaggerGroup, `STAGGER.icon` |
| 520 | Date / user avatar | Reveal |
| 640 | Left rail icons | StaggerGroup top→down, `STAGGER.icon` ×1.5 |
| 760 | **Page title** | TextReveal, per-char |
| 900 | Filter controls | StaggerGroup, `STAGGER.icon` |
| 1040 | KPI strip card | Reveal, y=24, blur |
| 1140 | KPI columns | StaggerGroup `STAGGER.card`; CountUp on its own reveal |
| 1400 | Row 2 cards | StaggerGroup `STAGGER.card`, y=24 |
| 1550 | Row 2 chart contents | line draw + cell bloom, +150ms from their card |
| 1700 | Row 3 cards | StaggerGroup `STAGGER.card` |
| 1850 | Row 3 chart contents | bars grow, line draw, CountUps |
| ~3250 | settled | all count-ups complete |

**Reference is ~3.6s. Ship at ~2.4s.** Compress by shortening `delayChildren` between rows (`STAGGER.row` 0.14 → 0.09) and overlapping chart draws with card entrances. Keep the *order*, tighten the *gaps*.

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

| Element | Rest → Hover | Duration |
|---|---|---|
| Card | shadow sm → md, `y: -2` | `DUR.instant` |
| Icon button | bg transparent → tint | `DUR.instant` |
| Primary button | brightness +4%, `scale: 0.98` press | `DUR.instant` |
| Bar (chart) | tint → solid + value chip | `DUR.fast` |
| Chart point | crosshair snap + tooltip | `DUR.fast` |
| Nav pill | active pill travels via `layoutId` | `DUR.fast`, `EASE.soft` |
| Dropdown | fade + `y: -6 → 0` | `DUR.fast` |

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

| §4 asks for | What shipped | Why |
|---|---|---|
| `PageShell` component | The beats live in the sheet (§74a), keyed on page-root classes | Pages are rendered inline in a 40k-line `App.tsx` that another session edits concurrently. A shared **timing source** is what §4 is actually after — "no page implements its own entrance timing" — and re-pointing the rules where they stand achieves it without restructuring the app. |
| Route transition: outgoing `opacity → 0, y: -8` | **Not built.** Incoming replays the content beats, as specified | The outgoing half needs the page switch wrapped in `AnimatePresence` so the old page stays mounted while it fades. Any cheaper version delays the swap, and §9.6 forbids motion delaying interactivity. |
| Gantt bars in `STAGGER.bar` order **by start date** | Staggered by **row**, capped at 6 bands | A bar is placed and dragged by an inline `left`/`width`; threading an order through `GanttFeatureList`'s render prop would put another inline property on the element the drag owns. Rows are already ordered by project then date, so down the page ≈ across it. Six bands because the arrows and markers wait for the last bar to *finish drawing* — every extra band costs the settle twice, and twelve put the marker at 3.1s. |
| Crew / list views: first **12** rows | First **8** | The cap already in the sheet; tighter than the spec, same effect. |
| `layoutId` nav pill | **Built 2026-09-19, without `layoutId`** — see below | |

### §5's travelling pill (2026-09-19)

Built from a second reference clip, and MEASURED off it rather than taken from §5's row: tracking the pill's own pixels frame by frame through one move gives ~470ms on `cubic-bezier(0.3, 1, 0.6, 0.85)` — a spring, which is faster off the line and slower through the middle than any of §1's four curves (`EASE.out`, the closest, is about twice as far from the data). `DUR.pill` and `EASE.pill` are that measurement; §5's `DUR.fast` + `EASE.soft` is less than half the duration and visibly snappier than the reference.

Both edges interpolate, so the pill changes WIDTH to fit its target rather than sliding at a fixed size — the half that makes a narrow option beside a wide one look right.

Not `layoutId`, which needs the indicator rendered inside the active child — a change at every call site in a 40k-line `App.tsx` another session is editing. `motion/SegmentPill.tsx` writes two custom properties onto the group element instead and the group's own `::before` is the pill (skin §78). React owns nothing it touches, it serves any group named in `PILL_GROUPS` including ones inside body portals, and with no JS the selected option simply keeps the background it always had.

Selection only, not hover: the reference never moves the pill on hover, and the pill IS the dark background the selected option's light text sits on — parked under a merely-hovered option it would put that option's muted ink on its own fill.

**Rolled out to ten groups (2026-09-19):** the Dashboard's approval toggle, Preferences' radio rows, the view switcher on nine index pages, Timecards' sections and its breakdown, the Gantt's range, the notifications filters, BuildFlow AI's nav, the map's optimisation goal, and the icon rail. Two shapes the mechanism had to grow for: the rail marks the **button inside its slot**, so the selected element is found at any depth and measured itself (a slot-sized pill would be wrong in both size and place); and the rail is a **column of discs**, which needed only `--bfm-pill-fill` and `--bfm-pill-radius` per group. Measuring walks the offsetParent chain rather than `getBoundingClientRect`, because the shell carries a CSS `zoom` (skin §42) that scales a client rect but not an offset.

Groups deliberately left out: the command palette (keyboard-driven rows that scroll under the selection), Settings' navigation (items split across sections, so a pill would have to jump a heading), and anything whose "active" is a button's own state rather than one option out of several.

---

## 9. Constraints — do not violate

1. No hard-coded timings outside `motion/tokens.ts`.
2. No second animation library.
3. Entrance animations run **once** per mount, never on data updates, filter changes, or scroll-back.
4. Reduced-motion support ships in Phase 1, not bolted on later.
5. No animated backgrounds, no looping ambient motion, no parallax.
6. Motion never delays interactivity — buttons are clickable the instant they render, even mid-fade.
7. Keep BuildFlow's existing palette and typography. Timing and behavior only; do not import the reference's blue.
