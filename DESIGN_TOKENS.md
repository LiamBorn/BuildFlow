# BuildFlow design tokens

The Welcome Page's design language, measured from source and verified in the running app on
2026-09-10. These values are the source of truth the dashboard is being matched to.

Every value below was read out of `client/src/welcome-redesign.css` (4,030 lines) or observed as a
computed style in the browser. Nothing here is inferred from a screenshot.

## The headline finding

**The two ends are not far apart on colour. They are far apart on rhythm.**

Every app scope already declares the same token names as the Welcome Page, and for most tokens the
same values. Measured across the 15 scopes that declare them, 13 tokens are unanimous:

| Token | Value | Scopes agreeing |
|---|---|---|
| `--wx-ink` | `#1c1c1a` | 16 |
| `--wx-mut` | `#575550` | 15 |
| `--wx-card` | `#ffffff` | 15 |
| `--wx-line` | `rgba(28, 28, 26, 0.13)` | 15 |
| `--wx-line-soft` | `rgba(28, 28, 26, 0.07)` | 15 |
| `--wx-g-blue` | `#4285f4` | 15 |
| `--wx-g-purple` | `#9b72cb` | 15 |
| `--wx-g-coral` | `#d96570` | 15 |
| `--wx-green` | `#188038` | 8 |
| `--wx-red` | `#c5221f` | 9 |
| `--wx-g-green` | `#34a853` | 3 |
| `--wx-g-amber` | `#f9ab00` | 3 |
| `--wx-win` | `#202124` | 6 |

So the redesign is not a palette overhaul. What actually differs is spacing, type scale, surface
treatment and motion, plus exactly three token conflicts listed in the next section.

## Three token conflicts that need your decision

These are the only places where the Welcome Page and the app disagree on a shared token name. All
three were confirmed live in the running app, not just read from CSS.

**1. The accent blue.** The Welcome Page is Google blue, the app is BuildFlow blue.

| Scope | `--wx-blue` |
|---|---|
| `.welcome-rx`, `.acct-split`, `.careers-apply-page` | `#1a73e8` |
| `.dash-rx`, `.sched-rx`, `.proj-rx`, `.crew-rx`, `.equip-rx`, `.mat-rx`, `.field-rx`, `.delayIQ-rx`, `.sidebar-rx`, `.hc-assistant`, `.pdx` | `#2f6bff` |

Eleven app scopes use `#2f6bff`. Three signed-out scopes use `#1a73e8`. One of them has to win, and
it is a brand call rather than a technical one. Note that the auth split screen (`.acct-split`)
currently sits on the Welcome Page's blue, so whichever way this goes, the funnel follows it.

**2. `--wx-serif` renders a serif in the app's dialogs.** In ten app scopes the token still holds:

```
"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif
```

On the Welcome Page the same token holds the Inter sans stack instead.

**Corrected 2026-09-10.** An earlier draft of this file said nothing rendered serif. That was
wrong, and wrong in a way worth recording: I had walked the Dashboard, Projects, Materials, Field
Updates and DelayIQs **pages** and counted zero serif elements, and concluded the token was dead.
I never opened a **dialog**. On the page surfaces the conclusion holds, because a later stylesheet
overrides all 27 rules there. In dialogs it does not:

| Surface | Rule | Renders |
|---|---|---|
| Project add/edit dialog title | `project-dialog-redesign.css:158` | Iowan Old Style, **42px**, weight 500 |
| Crew, equipment, material dialog headings | `.equip-rx / .mat-rx .crew-dialog-header h2` | Iowan Old Style, 24px |

Verified in the browser: the "New Project" dialog's title computes to
`"Iowan Old Style", "Palatino Linotype", …` at `42px`. Nothing after import 21 in `main.tsx`
mentions `.pdx-title`, so nothing overrides it. Nine dialog titles across six pages are affected.

So this is not dead weight to delete quietly. It is **the single most visible typographic
mismatch between the app and the Welcome Page**: the largest display type anywhere in the signed-in
product is a 42px serif, in a language that is otherwise Inter-only. The token should be retired
and those nine titles restated in Inter, which is a deliberate visual change to flag rather than a
cleanup to slip in.

**3. Two "amber" tokens hold blues.** Seven app scopes declare `--wx-amber: #0032b0`, a dark blue.
Crews declares the same token as `#b45309`, an actual amber. This one renders: the "Planned" badge
on the Schedule page computes to `rgb(0, 50, 176)`, and the token also drives `.health.amber`, the
`ready-to-start` badges, the variance review pill and the medium-severity pill. So a
warning-coloured semantic is blue on most pages and amber on Crews.

There is a second one, found later: **`--tc-amber: #0b4ae8`** (`timecard.css:11`), also a blue, so
every "amber" pill on TimeCard renders blue too: the overtime approval, the Overtime 1.5x badge,
Apprentice, Conditional lien and the OT stat chip.

**Decision taken:** both stay exactly as they render for now, revisited in Phase 4. Worth knowing
that the chrome flip makes this louder rather than quieter, because a blue "Planned" badge sitting
beside the `#2f6bff` accent is far more noticeable on a paper ground than it was against the
current navy chrome.

## Colour

The Welcome Page's full token block, `welcome-redesign.css:11`:

```css
--wx-bg:        #f5f6fa;   /* the single page ground; sections are transparent over it */
--wx-bg-2:      #eaedf3;
--wx-ink:       #1c1c1a;
--wx-mut:       #575550;
--wx-faint:     #8a877e;
--wx-line:      rgba(28, 28, 26, 0.13);
--wx-line-soft: rgba(28, 28, 26, 0.07);
--wx-card:      #ffffff;
--wx-blue:      #1a73e8;   /* the one accent: eyebrows, kickers, stat labels, icon tints, links */

/* the gradient trio, reserved for exactly three things */
--wx-g-blue:    #4285f4;
--wx-g-purple:  #9b72cb;   /* stops at 52-55% */
--wx-g-coral:   #d96570;

/* the dark "product window" palette */
--wx-win:       #202124;
--wx-win-2:     #2b2c2f;
--wx-win-ink:   #e8eaed;
--wx-win-mut:   #9aa0a6;
--wx-win-green: #81c995;
--wx-win-amber: #fdd663;
--wx-win-blue:  #8ab4f8;
```

Two rules govern colour use, and both matter more than the values:

- **One accent.** `--wx-blue` carries every eyebrow, kicker, stat label, icon tint and link. The
  gradient trio is spent on exactly three things: the hero's `em`, `.wx-grad-ai`, and the hairline
  above the hero badge. Nothing else gets a gradient.
- **One ground.** The page is `#f5f6fa` end to end. Sections are transparent and let it through.
  There is no alternating light/dark section banding anywhere on the page.

## Typography

One typeface: **Inter**, everywhere.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

`--wx-serif` is a legacy token name whose value on the Welcome Page is that same Inter stack; the
name survives so every heading referencing it flips in one place. The display accent is
`font-style: italic` on `em`, not a second family. `ui-monospace` appears once, in a marquee logo
treatment.

Weights in use, by frequency: **600** (40 rules), **700** (34), **500** (24), **800** (5), **650** (1).
Headings sit at 500 on `.wx-*` and 600 on `.cpx-*`.

The scale is entirely `clamp()`ed. Measured values:

| Role | Size | Tracking | Leading |
|---|---|---|---|
| Hero title | `clamp(46px, 6.8vw, 96px)` | `-0.025em` | `1.02` |
| Feature hero | `clamp(38px, 5vw, 78px)` | `-0.03em` | `1.02` |
| `cpx` statement | `clamp(2.5rem, 5vw, 5.5rem)` | `-0.035em` | `1.05` |
| Section h2 | `clamp(32px, 4.4vw, 54px)` | `-0.01em` | `1.08` |
| Stat figure | `clamp(46px, 5.4vw, 72px)` | | |
| Proof figure | `clamp(42px, 4.8vw, 60px)` | `-0.02em` | |
| Row h3 | `clamp(26px, 3vw, 38px)` | | `1.12` |
| Lede | `clamp(16px, 1.35vw, 19px)` | | |
| Body | 13px to 16px | | |

Copy measures are set in `ch`, not px: 52ch lede, 44ch row body, 54ch explainer, 30ch stat helper,
26ch proof caption, 20ch band heading, 17 to 20ch hero title, 16ch footer tagline.

**This is the biggest gap.** The Welcome Page's smallest display size is larger than the
dashboard's largest. The dashboard's most common font size is 13px, and 12px is second.

## Spacing and measure

| Thing | Value |
|---|---|
| Section beat (`.wx-section`) | `padding: clamp(76px, 12vh, 130px) 0` |
| Loud beat (`.wx-band`) | `clamp(80px, 13vh, 140px)` |
| Product section (`.cpx-section`) | `clamp(64px, 9vw, 120px)` |
| Feature row stack | `gap: clamp(70px, 10vh, 110px)` |
| Section head | `margin: 0 auto 54px` |
| Page measure | 1140px (`.wx-main`) |
| Wide bands | 1180px |
| Feature hero | 1040px |
| Section head | 640px |
| Nav height | 64px, `rgba(245, 246, 250, 0.82)` with backdrop blur |

Observed in the browser: section padding resolves to **108px** top and bottom at 1440px wide, and
117px for bands. For comparison, the dashboard's inner column is 880px with a 22px gap and a 56px
top bar.

## Radius, surfaces and shadow

`--wx-radius: 20px` is the base. Radii actually in use, by frequency: `999px` (18 rules, every
pill), `50%` (12, avatars and dots), `12px` (7), `--wx-radius` (5), `18px` (4), `11px` (4), `6px` (4),
`26px` (3, product stages).

Two card surfaces, from one recipe:

**Light paper card.** `background: var(--wx-card)` or `#fffdf9`, `1px solid var(--wx-line-soft)`,
radius 18 to 20px, `box-shadow: 0 10px 30px rgba(28, 28, 26, 0.05)`. On hover it lifts to
`translateY(-6px)` with `0 26px 60px rgba(28, 28, 26, 0.12)`.

**Dark glass card** (`.wx-mock`). Remaps the `--wx-*` tokens locally rather than introducing new
ones: `--wx-card: rgba(22, 20, 28, 0.78)`, `--wx-ink: #f4f2ed`,
`--wx-line: rgba(255, 255, 255, 0.16)`.

**The product-window treatment** is the page's signature move and the dashboard has no equivalent.
A mock never sits on the page ground. It floats inside a `#faf8ee` stage (`.wx-row-visual`, radius
26px, `1px solid rgba(28, 28, 26, 0.08)`, `0 24px 60px rgba(28, 28, 26, 0.08)`,
`perspective: 1200px`, `isolation: isolate`, `overflow: hidden`) over an animated mesh, and tilts
under the pointer.

The shadow ladder, in order of use:

```css
0 10px 30px rgba(28, 28, 26, 0.05)    /* card at rest */
0 4px 12px  rgba(28, 28, 26, 0.08)    /* small raised element */
0 8px 22px  rgba(28, 28, 26, 0.2)     /* ink pill at rest */
0 26px 60px rgba(28, 28, 26, 0.12)    /* card hover */
0 24px 70px rgba(28, 28, 26, 0.14)    /* floating panel */
0 34px 64px rgba(28, 28, 26, 0.13)    /* stage */
0 0 0 4px   rgba(26, 115, 232, 0.12)  /* focus ring */
```

## Buttons

Three variants, `welcome-redesign.css:1066` and `:1836`.

| Variant | Spec |
|---|---|
| `.wx-btn-ink` | Pill, `padding: 14px 26px`, radius 999px, 15.5px/600, `background: var(--wx-ink)`, `color: #fdfcf9`, `box-shadow: 0 8px 22px rgba(28,28,26,0.2)`. Hover goes to `#000` with `0 14px 34px rgba(28,28,26,0.28)`. |
| `.wx-btn-line` | Transparent with a `1px solid var(--wx-line)` border, same pill geometry. Hover inverts to the ink fill. |
| `.wx-btn-paper` | Light fill on dark surfaces. |

One transition spec covers all of them:

```css
transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.25s ease,
            background 0.25s ease,
            border-color 0.25s ease;
```

Press feedback on icon buttons is `scale(0.94)`. The primary calls to action instead get a magnetic
pointer-follow (strength 0.34) that springs back on that same 0.28s curve.

## Motion

**One easing curve carries the whole page:** `cubic-bezier(0.22, 1, 0.36, 1)`, used in 18 rules.
The only other curve is `cubic-bezier(0.4, 0, 0.2, 1)`, used twice for height and grid transitions.

Durations cluster in two bands. Interaction is 0.18s to 0.3s. Entrance is 0.7s to 1.0s.

**Hover grammar, in four moves.** Every hover on the page is one of these, and mixing them is what
makes a page feel incoherent:

1. **Lift** — cards. `translateY(-5px)` or `-6px` plus a deeper shadow.
2. **Invert** — pills. Outline becomes ink fill.
3. **Slide** — directional links. Arrow `translateX(3px)`, or gap grows 8px to 11px.
4. **Tilt** — product mocks. Pointer-driven `--rx` and `--ry`.

Menu rows add a 2px to 3px `translateX` nudge.

**Scroll reveal, exactly.** Mark an element `data-reveal`. A root-level `IntersectionObserver` with
`threshold: 0.16` and `rootMargin: '0px 0px -6% 0px'` adds `.in` and then **unobserves it**. The CSS
resting state is `opacity: 0; transform: translateY(30px)`, transitioning both over `1s` on the
signature curve, with `transition-delay: calc(var(--i, 0) * 90ms)` for stagger. The stagger variant
`data-reveal-stagger` runs its children at 0.75s with delays of 0.04s, 0.12s, 0.2s, 0.28s, 0.36s.

**One-shot is the rule.** Reveals unobserve. The typewriter disconnects on first intersection. The
counters disconnect after running. Scrolling back up never replays anything. Only ambient loops run
continuously (aurora parallax, bloom mesh, marquee, dot pulse, levitation, footer wave), and each
pauses or nulls itself off-screen.

**Reduced motion is already complete**, across 10 `@media (prefers-reduced-motion: reduce)` blocks,
and it is deliberately inconsistent: reveals are shortened to 0.4s on the home page but fully
disabled on product pages. Every infinite keyframe is nulled. The redesign must extend this, not
reinvent it.

**Performance discipline**, learned the hard way in this repo: aurora blur is 50px, not 90px.
`will-change: transform` appears only on the auroras, floats, marquee track and footer letters.
Bloom fields pause off-screen against a continuous clock.

**Accessibility conventions worth copying.** Every type animation renders three layers: a
`visibility: hidden` ghost that reserves layout, an `aria-hidden` absolutely positioned animated
layer, and one screen-reader-only node carrying the real string, so a heading is announced exactly
once. Decorative fields are `aria-hidden` plus `inert`.

## Where the tokens live now, and where they should live

The brief asked for the tokens to go into a Tailwind config so everything pulls from one place.
**There is no Tailwind in this repo** and adding it is the open question in the Phase 3 plan. The
equivalent single source of truth here is a CSS custom-property layer.

Today there is no single layer. There are 24 separate namespaces:

| Namespace | Uses | Declarations |
|---|---|---|
| `--wx-*` | 2,930 | 263 |
| `--cc-*` | 521 | 116 |
| `--hsx-*` | 340 | 43 |
| `--cpx-*` | 200 | 40 |
| `--hsh-*` | 113 | 10 |
| `--hs-*` | 110 | 17 |
| `--sc-*` | 80 | 8 |
| `--bfz-*` | 72 | 7 |
| `--tc-*` | 64 | 14 |
| 15 more | under 60 each | |

`--wx-*` is re-declared per scope rather than once globally, which is why the same token name can
carry two values in two places. Promoting it to `:root` is **not** an inert change: several rules
outside any scope use `var(--wx-ink, #14203a)` and `var(--wx-line, #dfe3ec)` style fallbacks that
differ from the canonical values, so a global layer would change what they resolve to.

So this file ships `client/src/design-tokens.css` with only the **additive** part of the system: the
spacing, rhythm, type-scale, easing, duration and shadow tokens that do not exist yet and therefore
collide with nothing. It is imported first and changes no rendered pixel. Reconciling the 24
existing namespaces onto it is the first task of Phase 4, and it needs the three decisions above
plus the computed-style verification harness that was used to prove the earlier stylesheet merge
was lossless.
