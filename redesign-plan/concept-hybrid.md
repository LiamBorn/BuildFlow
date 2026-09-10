# Concept: **Brief & Board**

*Two densities, one language. An app-shell and page-frame proposal for BuildFlow.*

---

## 1. Thesis

The Welcome Page and the Week board are not two design languages. They are one language spoken at
two volumes.

Every honest attempt to put a marketing page's rhythm on an operational tool fails in the same
place: someone takes `clamp(76px, 12vh, 130px)` — 108px at 1440px — and applies it between a
dashboard's greeting and its first panel, and now the user sees three rows of data per screen. The
usual reaction is to abandon the language on "the app pages", which is how a product ends up with a
beautiful front door and a 2011 admin panel behind it. That is exactly what BuildFlow has today: a
1,883-rule `.welcome-rx` scope next to a 46px table row.

So the proposal is to state the volume difference **as a contract instead of as a drift**, with two
named tiers, a closed nine-token list of what may differ between them, and three published ratios:

> **Half the air. 0.57× the display type. The same body text.**

That third clause is the load-bearing one and it is the reason this is one system rather than two.
The text a scheduler actually reads for eight hours — a job name in a cell, a crew's hours, a
status pill, a tooltip — is **13px in both tiers**, in the same weight, on the same measure in `ch`,
in the same ink. Only the headline voice and the space around it change. Two tiers that share their
body copy, their entire palette, their entire radius ladder, their entire shadow ladder, one easing
curve, four hover moves and one reveal contract are one design system with a volume knob. Two tiers
that diverge on colour or interaction are two design systems, and this plan makes that mechanically
impossible (§7).

The tiers are:

- **Brief** — surfaces you *read and leave*. You arrive to find out what is true, form an
  intention, and click into something else. Dashboard, Schedule landing, Reports, Bookmarks, the
  auth funnel, and the four full-viewport shell screens. These get the Welcome Page's rhythm and
  display type near-literally.
- **Board** — surfaces you *work in and stay in*. Rows, cells, lanes, bars, forms. Week, Month,
  List, Kanban, Matrix, Gantt, the four index families, the Sales indexes, Map, TimeCard, Settings,
  and every dialog. These get a deliberately compressed variant of the identical token set.

The names matter for the same reason `--wx-serif` is a trap: a tier called "dense" invites someone
to make things denser. A tier called **Board** tells you what it is for.

---

## 2. The classification rule

Not taste. A surface is **Board** if **any** of the following is true:

1. It renders a scrollable collection of homogeneous rows, cells, lanes or bars — a table, a board,
   a calendar grid, a kanban column, a Gantt track.
2. Its primary interaction is direct manipulation of records: drag, drop, inline edit, status
   change, checkbox select, bulk action.
3. It is a form with more than four inputs.

Otherwise it is **Brief**.

Two structural rules keep the boundary from turning to mush:

- **The tier is a property of the page, never of a zone inside a page.** A Board page's header is
  Board-tier type. There is no "big title on a dense page" escape hatch.
- **Nesting is one-directional: `.bf-board` may sit inside `.bf-brief`, never the reverse.** This is
  the single legal exception, and it exists because the Dashboard genuinely is a Brief page that
  contains fourteen Board regions (the panel bodies). `density.css` ships a guard rule and
  `density.test.ts` asserts no source file emits a `bf-brief` class inside a `bf-board` subtree.

---

## 3. Every route's tier

All 23 values of the `Page` union, plus the shell screens and the seven in-scope welcome views.
**No page is dropped, merged, renamed or re-homed.**

| Route (`page`) | Tier | Why |
|---|---|---|
| `dashboard` | **Brief** (board region `.bf-board`) | Read-and-leave; the panel board is a nested Board region |
| `bookmarks` | **Brief** | Card groups you scan, then leave |
| `schedule` (landing) | **Brief** | Rule 1 fails: it is bands + KPIs + a preview, not a collection |
| `month` | **Board** | Calendar grid, drag-to-date |
| `week` | **Board** | Crew × day grid, drag-drop |
| `list` | **Board** | Day-grouped table |
| `kanban` | **Board** | 5 lanes, drag between statuses |
| `matrix` | **Board** | Crew × day load cells |
| `gantt` | **Board** | Bars + dependency links |
| `projects` | **Board** | Index table + editor dialog |
| `crews` | **Board** | Card collection + inline actions |
| `contacts` / `companies` / `deals` | **Board** | HubSpot-style index tables + record drawers |
| `equipment` / `materials` | **Board** | Index tables |
| `field` (Field Updates) | **Board** | Update collection with % reports |
| `map` | **Board** | Job-site card collection |
| `delayIQs` | **Board** | Warning collection with accept/reject |
| `reports` | **Brief** | Read-and-leave; charts and figures, no manipulation |
| `timecard` | **Board** | Punch rows, editable |
| `settings` | **Board** | 17 categories of forms (rule 3) |
| `welcome` | untouched | It *is* the Brief tier's source; only `--wx-blue` → `#2f6bff` |

**Auth funnel (7 welcome views) — all Brief:** `createAccount`, `login`, `forgotPassword`,
`resetPassword`, `verifyEmail`, `businessType`, `additionalProducts`, plus the invite/accept pair.
`.acct-split` keeps its class name and its two-column geometry; it gains the Brief tier tokens and
`--wx-blue: #2f6bff`. The 14 trade cards keep their exact accessible names.

**Shell screens (all Brief):** `.loading-screen`, `.loading-screen.error-screen`,
`DashboardSkeleton`, and the two `.hs-upd-*` dialogs ("What's new", add-on prompt) — the last two
because they *sell*, which is a Brief job. Every other dialog in the product is Board.

**The chrome (top bar, rail, flyout, palette, notifications, menus) is Board, permanently.** It is
13px type at 56px heights on every page, including Brief pages. Chrome that changed scale with the
page underneath it would be the single worst thing this proposal could do.

---

## 4. What carries over literally

Byte-identical in both tiers. These are declared **once** at `:root` and never re-declared inside a
tier scope; `density.test.ts` greps for re-declarations and fails the build if one appears.

**Ground and palette** — one flat ground `#f5f6fa` end to end, no light/dark section banding
anywhere, including the chrome (§8.1). `--wx-ink #1c1c1a`, `--wx-mut #575550`,
`--wx-faint #8a877e`, `--wx-line rgba(28,28,26,0.13)`, `--wx-line-soft rgba(28,28,26,0.07)`,
`--wx-card #ffffff`.

**One accent: `#2f6bff`.** Eyebrows, kickers, stat labels, icon tints, links, active nav, focus.
Per the fixed decision, the Welcome Page and `.acct-split` move to it from `#1a73e8`.

**The gradient trio, with one licensed extension.** `--wx-g-blue #4285f4` → `--wx-g-purple #9b72cb`
at 52–55% → `--wx-g-coral #d96570` keeps its three Welcome uses and gains a **fourth and final**
licensed use in-app: **the AI affordance** — the top-bar sparkle, the assistant panel header, the
quantum-cloud loader, and `.dx-title em` where it already renders. Nothing else, ever. Writing the
fourth use down is what stops it becoming the fifth and the ninth.

**The radius ladder, whole:** `999px` pill / `26px` stage / `20px` card / `18px` panel / `12px`
control / `8px` chip. Both tiers draw from all six. They differ in *which rung a given element
picks*, not in the ladder — a Brief KPI tile is 20px, a Board table card is 12px, and both are on
the ladder.

**The shadow ladder, whole:**

```
0 10px 30px rgba(28,28,26,0.05)   card at rest
0 4px 12px  rgba(28,28,26,0.08)   small raised element
0 8px 22px  rgba(28,28,26,0.2)    ink pill at rest
0 26px 60px rgba(28,28,26,0.12)   card hover
0 24px 70px rgba(28,28,26,0.14)   floating panel  ← every flyout, menu, drawer, tooltip
0 34px 64px rgba(28,28,26,0.13)   stage
0 0 0 4px   rgba(47,107,255,0.12) focus ring       ← re-based onto #2f6bff
```

**Motion, whole.** `--bf-ease: cubic-bezier(0.22,1,0.36,1)` on everything;
`cubic-bezier(0.4,0,0.2,1)` only for height and grid transitions. Interaction 0.18–0.30s, entrance
0.70–1.00s. No tier gets faster or slower motion than the other — a Board surface that animated
faster would read as a different product.

**The four hover moves, and no fifth.** Lift cards `translateY(-6px)` + deeper shadow · invert
pills (outline → ink fill) · slide directional links (arrow `translateX(3px)`, gap 8→11px) · tilt
product mocks (pointer `--rx`/`--ry`). Menu rows keep their 2–3px `translateX` nudge. Board surfaces
get **lift at −3px instead of −6px on rows** — the one place a move is scaled rather than shared,
because a 46px row lifting 6px collides with its neighbour. That is a scale change to an existing
move, not a fifth move.

**The reveal contract, exactly.** `IntersectionObserver`, `threshold: 0.16`,
`rootMargin: '0px 0px -6% 0px'`, add `.in`, **unobserve**. Rest state
`opacity: 0; transform: translateY(30px)`, 1s on the signature curve, stagger
`calc(var(--i,0) * 90ms)`; the `data-reveal-stagger` variant runs children at 0.75s with 0.04/0.12/
0.20/0.28/0.36s delays. One-shot is the rule; scrolling back never replays.

**Copy measures, in `ch`, in both tiers.** 52ch lede, 44ch body, 26ch caption. A Board page's empty
state, helper line and tooltip body all measure 44ch / 26ch exactly as the Welcome Page's do. This
is deliberately *not* rescaled: `ch` units already track font size, so the same token yields a
narrower box at 13px than at 17px and the line-length rhythm is preserved for free.

**The spacing ladder** — `--bf-space-1..9` = 4 / 8 / 12 / 16 / 22 / 30 / 40 / 54 / 72px, already
shipped in `design-tokens.css`. Both tiers spend from it exclusively, plus exactly two inherited
legacy values that get named so they stop being magic numbers:
`--bf-inset-cell: 14px` (the index table's `padding: 0 14px`) and `--bf-row-h: 46px` (its row
height). Nothing else off-ladder is legal.

**Weights.** 500 body · 600 heads and medium · 700 bold · 800 heavy. Identical in both tiers. The
`650`/`750` one-offs in `hs-index.css` and `schedule.css` normalise to 600 and 700.

**Inter only**, and `--wx-serif` is **deleted** from all ten app scopes and its 27 reading rules
rewritten to `--bf-font-sans`. Per the fixed decision, it is not carried forward. `--wx-amber:
#0032b0` is left exactly as it renders today in all seven scopes.

---

## 5. What gets rescaled — the closed list

Exactly **nine** tokens differ between the tiers. There is no tenth, and a test enforces that.

| # | Token | Brief | Board | Ratio |
|---|---|---|---|---|
| 1 | `--bf-title` | `clamp(32px, 3.6vw, 46px)` | `clamp(22px, 2vw, 26px)` | 0.565 |
| 2 | `--bf-h2` | `clamp(24px, 2.4vw, 32px)` | `18px` | 0.563 |
| 3 | `--bf-h3` | `20px` | `13px` | 0.650 † |
| 4 | `--bf-figure` | `clamp(34px, 3.4vw, 44px)` | `clamp(22px, 2.2vw, 25px)` | 0.568 |
| 5 | `--bf-lede` | `clamp(15px, 1.15vw, 17px)` | `13px` | 0.765 † |
| 6 | `--bf-beat` | `clamp(56px, 7vh, 84px)` → 63px @900h | `30px` | 0.476 |
| 7 | `--bf-stack` | `30px` | `16px` | 0.533 |
| 8 | `--bf-head-gap` | `22px` | `12px` | 0.545 |
| 9 | `--bf-pad` | `28px` | `14px` | 0.500 |

† floored. Rungs 3 and 5 want 11.4px and 9.7px at a true 0.57. They stop at **13px**, the body
floor, because below 13px a block head stops reading as a head and a lede stops reading as prose.
**The ratio governs display type only.** Every rung at or below 13px is shared, not scaled — which
is the whole argument of §1.

**The published ratios:** display type **0.57×**, rhythm **≈0.50×**, body and below **1.00×**.

### 5a. Brief scale, in full

| Role | Size | Weight | Tracking | Leading | Colour |
|---|---|---|---|---|---|
| Page title | `clamp(32px, 3.6vw, 46px)` | 600 | −0.02em | 1.06 | `--wx-ink` |
| Section head (h2) | `clamp(24px, 2.4vw, 32px)` | 600 | −0.015em | 1.10 | `--wx-ink` |
| Block head (h3) | 20px | 600 | −0.01em | 1.15 | `--wx-ink` |
| KPI figure | `clamp(34px, 3.4vw, 44px)` | 700 | −0.02em | 1.00 | `--wx-ink` |
| Lede | `clamp(15px, 1.15vw, 17px)` | 500 | 0 | 1.50 | `--wx-mut` |
| Body | 15px | 500 | 0 | 1.50 | `--wx-mut` |
| Meta | 13px | 500 | 0.005em | 1.40 | `--wx-faint` |
| Eyebrow | 12px | 700 | 0.14em, uppercase | 1.00 | `#2f6bff` |

Rhythm: page pad `40px clamp(24px, 3vw, 40px) 84px` · beat between sections `clamp(56px, 7vh, 84px)`
· stack between blocks `30px` · head→content `22px` · card interior `28px` · measure **1140px**
(literal carry-over) centred in the content box.

**Why 63px and not 108px.** The Welcome Page has twelve sections and a scroll narrative; the beat
is the narrative's punctuation. A Brief app surface has two to four sections and one hard
requirement: its first real data block must land above the fold at 1440×900 with 56px of chrome
above it. 63px is the largest beat that satisfies that on the Dashboard (40 pad + 46 title + 22 gap
+ 24 subtitle + 63 beat = 195px, leaving 649px of board). The vw coefficient drops from 4.4 to 3.6
and the cap from 54px to 46px for the same structural reason: the content box is
`100vw − 56px − 2×40px`, not `100vw`, so the same visual weight needs a smaller coefficient. These
are derivations from the Welcome curve, not a retreat from it — at 1440px the Brief title is 46px
against the Welcome h2's 54px, a 0.85 ratio.

### 5b. Board scale, in full

| Role | Size | Weight | Tracking | Leading | Colour |
|---|---|---|---|---|---|
| Page title | `clamp(22px, 2vw, 26px)` | 600 | −0.015em | 1.15 | `--wx-ink` |
| Section head | 18px | 600 | −0.01em | 1.20 | `--wx-ink` |
| Block / card head | 13px | 600 | 0 | 1.30 | `--wx-ink` |
| KPI figure | `clamp(22px, 2.2vw, 25px)` | 700 | −0.015em | 1.05 | `--wx-ink` |
| **Table row, primary cell** | **13px** | **500** | **0** | **1.35** | `--wx-ink` |
| Table row, secondary cell | 11.5px | 500 | 0 | 1.35 | `--wx-mut` |
| Table header cell | 11px | 700 | 0.08em, uppercase | 1.00 | `--wx-faint` |
| Status pill / badge | 11px | 600 | 0.01em | 1.00 | tone ink on tone-soft |
| Micro / timestamp | 11px | 500 | 0 | 1.30 | `--wx-faint` |
| Eyebrow | 11px | 700 | 0.12em, uppercase | 1.00 | `#2f6bff` |

Rhythm: page pad `24px clamp(20px, 3vw, 32px) 48px` · beat `30px` · stack `16px` · head→content
`12px` · cell inset `14px` · **no max-width** — a table gets the full content box and scrolls inside
its own `overflow-x: auto` wrapper (already the pattern in `hs-index.css`, and the reason it exists
is documented there).

**Row geometry, named.** Table row **46px** (unchanged, so no index page reflows). Week board:
crew label column `clamp(136px, 14%, 184px)` (unchanged) · header **56px** (from 72px, matching the
chrome module) · crew row min-height **132px** (from 164px, ×0.80) · crew name **15px** (from 17px).
Kanban card: 14px pad, 12px radius, 13px/600 title, 11.5px meta. Matrix tooltip 11.5px on
`--wx-ink` at 8px radius. **Gantt row heights are not touched** — `gantt.tsx` owns them and
`boundary.test.ts` guards it.

### 5c. The three jumps, stated

| From | To | Ratio |
|---|---|---|
| Board table row (13px) | Board page title (26px) | **2.00×** |
| Board page title (26px) | Brief page title (46px) | **1.77×** |
| Board table row (13px) | Brief page title (46px) | **3.54×** |

3.54× is the honest size of the gap between "the smallest thing you read all day" and "the biggest
thing on a Brief page". The Welcome Page's own internal range is 12px eyebrow → 96px hero, i.e.
**8.0×**. So the product's range is less than half the marketing page's, which is exactly what an
operational tool should be — and both live on one continuous ladder.

---

## 6. The Dashboard exception, stated plainly

`dashGrid.ts` hard-codes `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16`, `hs-home.css`
independently declares `grid-auto-rows: 40px`, and **users have layouts persisted against those
numbers** in the `dash:layout` setting. Nineteen tests in `dashGrid.test.ts` assert on them.

Therefore, on the Dashboard and nowhere else:

- `DASH_COLS`, `DASH_ROW_UNIT`, `DASH_GAP` and `grid-auto-rows: 40px` are **untouched**.
- The board's inner measure stays **1280px** (not 1140px), because the column width is what a saved
  layout is implicitly keyed to.
- The Brief tier applies to everything *outside* the board — greeting, status strip, page pad, the
  beat between the header and the board — and the board itself carries `.bf-board`, which is what
  makes its 16px gap the Board-tier `--bf-stack` rather than an off-system number.
- Panel *chrome* is fully redesignable: 12px radius, `--wx-line-soft` border, `--bf-shadow-card` at
  rest, `--bf-shadow-card-hover` on lift, 13px/600 header, 12px head-gap. Nothing there is
  load-bearing for the grid engine.

This is the one place where a persisted user artefact outranks the design language, and saying so
out loud is cheaper than discovering it from a support ticket.

---

## 7. What stops this becoming two design systems

Five mechanisms, four of them testable.

1. **The closed nine.** The nine tokens of §5 are the complete list. Every other token is declared
   once at `:root` in `design-tokens.css` and *may not appear inside* `.bf-brief` or `.bf-board`.
   `density.test.ts` reads `density.css` raw (Vite's `?raw` glob, the pattern `boundary.test.ts`
   already uses), parses the two tier blocks, and fails if either declares a property outside the
   nine-name allowlist. A tenth token requires editing the test, which requires a human decision.

2. **The body floor is shared, not scaled.** 13px body, 11.5px secondary, 11px micro are identical
   in both tiers. There is no "Board body" token to drift.

3. **One-directional nesting.** `.bf-board` inside `.bf-brief` is legal; the reverse is not. Tested
   by grep over sources. This is what stops "a dense strip on a Brief page" and "a big title on a
   Board page" from being invented independently on eleven pages.

4. **One frame component owns every page header.** `PageFrame` (§10.1) is the only thing in the
   product that renders an eyebrow, a title, a release pill, a subtitle and an action slot. It takes
   `tier="brief" | "board"` and picks the type from tokens. A page cannot get a bespoke header
   without deleting a component from its JSX, which is visible in review.

5. **Colour, radius, shadow, easing, hover and reveals cannot be tier-scoped at all**, because they
   are not in the nine. A Board surface physically cannot have its own accent, its own card shadow,
   or its own hover move without failing test 1.

The residual risk this does not cover: someone writing a raw `font-size: 15px` in a Board scope
instead of reading a token. That is a review problem, not a systems problem, and the existing
review of a 60,798-line CSS estate is where it already lives.

---

## 8. The app shell

The shell is the reason a two-tier system is even feasible: it is the constant that both tiers hang
from. Four fixed points, then the changes.

**Fixed points, deliberately not moved.** Top bar **56px**. Rail **56px**. Rail sticky at
`top: 56px`, `height: calc(100vh - 56px)`. Body grid `grid-template-columns: 56px minmax(0,1fr)`.
These are load-bearing far beyond the shell: `hs-breeze.css` hard-codes `top: 56px / left: 56px`,
`hs-home.css` computes `min-height: calc(100vh - 56px)`, and the flyout positions itself from a rail
slot's `offsetTop`. Keeping 56/56 buys the entire assistant panel, the tutorial spotlight and the
flyout geometry for free. *Robustness fix with zero pixel change:* `hs-breeze.css` and the three
other files that hard-code the numbers are rewritten to read `var(--hs-topbar-h)` and
`var(--hs-rail-w)`, so the next person who wants 60px can have it.

### 8.1 The chrome moves to paper

Today the bar and rail are navy `#14203a` with 8–14% white washes. The Welcome language has **one
ground and no light/dark banding anywhere on the page**. A navy chrome above a `#f5f6fa` page is
banding, and it is the single largest reason the app does not read as the same product as its front
door. So the chrome moves to paper — and it moves in **eight token values on `.hs-shell`**, not a
rewrite, because 340 `--hsx-*` and 113 `--hsh-*` consumers already read through these names:

```css
.hs-shell {
  --hs-navy:          rgba(245, 246, 250, 0.82);  /* the bar ground + backdrop-filter: blur(18px) */
  --hs-navy-2:        #ffffff;                    /* flyouts, menus */
  --hs-navy-3:        #f0f2f6;                    /* hover wash */
  --hs-text-on-navy:  #1c1c1a;
  --hs-muted-on-navy: #575550;
  --hs-dim-on-navy:   #8a877e;
  --hs-line-on-navy:  rgba(28, 28, 26, 0.07);
  --hs-blue:          #2f6bff;                    /* unchanged */
}
```

`rgba(245,246,250,0.82)` + `backdrop-filter: blur(18px)` is the Welcome nav treatment literally,
at 56px instead of 64px. The rail becomes `--wx-card` with a `--wx-line-soft` right hairline.

Four files hard-code the old hexes and must be touched by hand or the chrome half-flips — this is
already flagged in the app-shell risk register: **`hs-breeze.css`** (re-declares `--bfz-navy:
#14203a`), **`styles.css`** (the tutorial block's `#2f6bff` literals — those stay, they are already
correct), **`assistant-global.css`** (declares its own `--wx-*` set), and **`schedule.css`
lines 1945–1965** (the `SavedViewsFlyout` block inside the rail flyout, whose divider and
`.hs-flyout-view em` 160px ellipsis live there, not in the shell stylesheet).

### 8.2 Top bar — every control's home

Three zones. Nothing is removed; the action-cluster **DOM order is untouched** because
`tests/tutorial.test.tsx:286` asserts the bell precedes the account control in the DOM. Visual order
keeps coming from CSS `order` (create 1 · help 2 · settings 3 · notifications 4 · divider 5 ·
account 6), which is why a visual reshuffle is free and a JSX reshuffle is not.

| Zone | Contents | Spec |
|---|---|---|
| A — left, 232px | Brand mark 30px + "BuildFlow" wordmark | wordmark 15px/600, hidden <1040px (unchanged) |
| B — centre, flex, max 520px | Search launcher | 36px tall, `999px`, `#fff`, `1px --wx-line-soft`, 13px placeholder "Search BuildFlow", `⌘K` `<kbd>` at 11px/600 in an 8px chip; `focus-within` → `--bf-focus-ring`. **Stays a `readOnly` input inside its `<label>` with both `onClick` and `onFocus` opening the palette** — the risk register is explicit that changing this breaks the palette's discovery affordance |
| C — right | AI sparkle · bookmarks star · create + · verify-email badge · bell · help · settings gear · divider · account | icon buttons 32px, `12px` radius, 18px icon at 1.75 stroke, `--wx-mut` at rest, `--hs-navy-3` + `--wx-ink` on hover, `aria-expanded="true"` → `#e8f0fe` + `#2f6bff` (preserves "the trigger stays lit while its menu is open") |

Per control:

- **AI sparkle** — keeps its gradient (licensed use 4 of 4). `hs-top-twinkle` 0.8s kept.
- **Bookmarks star** — `aria-label "Bookmarks (N)"`, the blue count pill, and the whole star menu
  are kept verbatim. **One colour change:** the `.has-items` gold `#f0b354` and the flyout star's
  `#e8a33d` become `#2f6bff` filled. One accent means one accent; a gold that appears in exactly
  two places is the beginning of a second palette. *Flagged as a deliberate change to existing
  rendering.*
- **Create +** — all 7 entries, all icons, all New/Beta pills, the `goTo` + `onCreateRecord` split
  and the 45° rotate-while-open kept exactly.
- **Verify-email badge** — all four label states kept; **it no longer collapses to an icon at
  720px**, because "Confirm email" is the only route to invites and billing and a phone user
  currently gets an unlabelled envelope.
- **Bell** — all 7 synthesized items, all six tone classes, all copy, the 420px × 620px panel and
  the inner 520px scroll kept. Restyled to `#fff` / `18px` / `--bf-shadow-float`, 13px title,
  11.5px detail, 28px tone-soft icon chip at 8px radius. **One net-new string:** an empty state,
  "No activity yet." — the panel has none today and renders blank in a fresh workspace. Listed
  here so it can be vetoed; nothing else in this plan adds or reworks copy.
- **Help / tutorial** — `data-tutorial-id="tutorial-restart-button"` and the exact accessible name
  "Help and tutorial" are untouched, and it **stays in the top bar at every width** (icon-only
  below 560px). This is a required fix: the tutorial's wrap-up step spotlights this button, and it
  is `display: none`'d below 560px today, so the guided tour cannot be started *or finished* on a
  phone.
- **Settings gear** — kept, name "Settings" unchanged (a test asserts ≥2 buttons carry that name).
- **Account menu** — identity block, role line, `Settings` and `Log out` menuitems with their
  `title` attributes, all kept. It gains the `hs-pop` 0.16s entrance the inventory wrongly believed
  it already had (it is a `.user-settings-menu`, never a `.hs-menu`, so `hs-pop` never applied).

**Settings gains the chrome.** Today `page === "settings"` renders no TopBar and no Sidebar at all,
so the one place a user goes to change things is also the one place with no search, no AI, no
notifications and no way back except the page's own control. The shell renders on Settings like
everywhere else, `.settings-shell`'s single-column body collapse is dropped, and the rail gear gets
`aria-current="page"`. **This is the single highest-risk item in the plan (§14) and is severable.**

### 8.3 Rail and flyouts — fixing hover-only

Rail unchanged structurally: 56px, nine hubs in the same order, 40×40 buttons, the Settings gear
pinned below a hairline, `data-tutorial-id="nav-<page>"` on single-page hub buttons, the release
dot, the recommended dot, `hs-rail-pop` / `hs-rail-draw` / `hs-rail-ring` / `hs-tag-ping` all kept.
Restyled: rest `--wx-mut`, hover `--hs-navy-3` + `--wx-ink`, active `#2f6bff` fill with a
`0 8px 22px rgba(47,107,255,0.22)` glow. **`focus-visible` gains a real ring** —
`0 0 0 3px rgba(47,107,255,0.45)`, matching what the top-bar buttons already have and the rail
conspicuously does not.

Three behavioural fixes, all additive:

1. **A tap path.** Today there is *no click path to a flyout* — hover and focus only — so a touch
   user can only ever reach a hub's first page. Now: tapping a hub **navigates to its first
   unlocked page as it does today, and pins the flyout open**. Navigation-on-click is preserved
   exactly (`appHarness.openSchedule()` clicks the hub and expects to land on the Schedule
   landing), and the pinned panel gives touch users the other six pages.
2. **Escape and blur close it.** Today nothing closes the flyout on Escape or blur: tab a hub open,
   tab away, and it stays on screen forever. Now Escape on the hub button and `focusout` of the
   subtree both close, matching what all four top-bar menus already do. The 140ms delayed
   mouse-leave close and the 10px invisible `::before` pointer bridge are kept untouched — the risk
   register is explicit that touching them makes flyouts drift.
3. **The flyout goes to paper.** 228px min-width and `left: 56px / top: var(--hs-flyout-top)` kept.
   `#fff`, `18px` radius, `1px --wx-line-soft`, `--bf-shadow-float`, `hs-flyout-in` 0.16s kept.
   Item 13px/500; active → `#e8f0fe` + `#2f6bff` + 600 (replacing the 14% white wash). The locked
   `.hs-flyout-tip` bubble becomes `--wx-ink` with white text at 244px — ink tooltips are the
   Welcome grammar. `SavedViewsFlyout` is restyled *in `schedule.css`* alongside it.

### 8.4 The phone shelf — the missing mobile model

There is no hamburger and no drawer anywhere in BuildFlow today. Responsive behaviour is pure CSS
subtraction across 30 breakpoints, and at ≤560px the bookmarks star, create +, help and settings
buttons are simply `display: none`'d. The 56px rail is present at every width, eating 15% of a
375px screen to show nine icons whose sub-pages are unreachable without hover.

**≤720px, CSS-only reflow of the same DOM:**

- The rail unpins from the left and becomes a **56px bottom bar**:
  `position: fixed; inset: auto 0 0 0; flex-direction: row`. Five visible slots — Home, Schedule,
  Field, Reporting, More — with the other four hubs reachable through More. The DOM order and the
  full set of nine buttons are unchanged; the extra four are `order`-ed into the sheet's slot and
  `display: none`'d in the bar, exactly the mechanism the top bar already uses.
- The body grid becomes single-column with `padding-bottom: 56px`.
- `--hs-flyout-top` is only honoured above 720px. Below it, `.hs-flyout` becomes
  `position: fixed; inset: auto 0 56px 0; max-height: 62vh` with a `translateY(12px)` → 0 entrance
  on the signature curve. One media block, no JS branch.

**The "More" sheet** is the only net-new DOM in the shell, and it is gated on
`window.matchMedia('(max-width: 720px)')`. The test setup stubs `matchMedia` to always return
`matches: false`, so the sheet **never mounts in jsdom** and contributes **zero** new accessible
names to the 175 DOM-rendering tests. It lists all nine hubs and all 21 pages by their exact
existing labels, plus the bookmarks star, create + and settings gear that vanish at 560px today.
The help button is *not* in the sheet — it stays in the bar so the tutorial anchor never moves.

Ports of the same DOM at ≤560px: brand collapses to the mark (existing), search collapses to a
36px icon button that opens the palette, the verify badge keeps its label.

### 8.5 Every nav category's home

Nothing is re-homed. Hub membership, hub order, hub labels and page labels are **byte-identical**,
because `appHarness.HUB_OF` maps pages to hubs by name and `tests/settings.test.tsx:113` matches
each hub with `^<Hub>( \(.*\))?$`. A taxonomy change would break ~175 tests to fix a problem nobody
reported. This shell redesign is about *reachability and density*, not taxonomy.

| Rail hub | Pages | Tier of those pages | Desktop | Phone |
|---|---|---|---|---|
| Home | dashboard | Brief | rail slot 1 | bar slot 1 |
| Bookmarks | bookmarks | Brief | rail slot 2 | More sheet |
| Schedule | schedule, month, week, list, kanban, matrix, gantt | Brief landing + 6 Board | rail slot 3 + flyout | bar slot 2 + flyout sheet |
| Operations | projects, crews | Board | rail slot 4 + flyout | More sheet |
| Sales | contacts, companies, deals | Board | rail slot 5 + flyout | More sheet |
| Resources | equipment, materials | Board | rail slot 6 + flyout | More sheet |
| Field | field, map, delayIQs | Board | rail slot 7 + flyout | bar slot 3 + flyout sheet |
| Reporting | reports | Brief | rail slot 8 | bar slot 4 |
| TimeCard | timecard | Board | rail slot 9 | More sheet |
| Settings | settings | Board | rail bottom gear + top-bar gear | More sheet + top-bar gear |

Globals: **search** → top bar zone B at every width (icon-only ≤560px) → ⌘K palette. **Create +** →
top bar ≥560px, More sheet below. **Bell** → top bar at every width. **Account** → top bar at
every width. **AI sparkle** → top bar at every width, plus the floating `Ask AI` FAB (unchanged,
`z-index: 60`, `bottom: clamp(16px,3vw,32px)`; on phones it rises to `bottom: 72px` to clear the
bottom bar). **Bookmark star menu** → top bar ≥560px, More sheet below; the menu itself and the
Bookmarks page are unchanged in content — including, deliberately, the known dead
`openScheduleLink()` control (BUG-1, a `location.hash` write that no in-app listener hears). It is
preserved as-is, because fixing it is a behaviour change and this is a presentation plan; it is
flagged for a separate ticket. **Tutorial anchors** → `nav-<page>` on rail buttons and flyout items
(unmoved), `tutorial-restart-button` on the top-bar help button (unmoved, and now present at every
width).

**Hard rule for the tutorial:** the spotlight is `getBoundingClientRect` + a body-wide
`MutationObserver` writing CSS custom properties, and its scrim is a 9999px `box-shadow`, not an
overlay. So **no new `transform`, `filter`, `contain` or `will-change` may be added to any ancestor
of a `data-tutorial-id` element**, and no new stacking context may wrap the rail or top bar. The
rail's existing `scale(1.08)` hover is on the spotlit element itself, which is why it works today;
it stays there and moves no further up the tree.

### 8.6 Command palette and the two dialogs

**Palette** — `command-palette.css` has no keyframes and no transitions today, so entrance motion
is net-new and must be added carefully: the palette resets its query and focuses the input in a
`requestAnimationFrame`, so **the animation runs on already-mounted DOM** (`animation: cmdk-in
0.18s var(--bf-ease) both` on the dialog, opacity-only on the backdrop) and nothing delays mount.
Restyled Board-tier: `#fff`, `20px` radius, `--bf-shadow-float`, input 15px, row label 13px/500,
group 11px `--wx-faint`, `<kbd>` 11px in an 8px chip, active row `#e8f0fe` + `#2f6bff`. Every
command, group, keyword, hint key and the `Nothing matches "…"` empty state are unchanged. The
four `CommandPalette.test.tsx` tests assert on roles and names only, so they stay green.

**The two `.hs-upd-*` dialogs are split first.** "What's new" and the add-on prompt currently share
one class base, so restyling one restyles the other. Split into `.bf-dialog` (the shared Brief
shell: `#fff`, `20px`, `--bf-shadow-float`, a `#f5f6fa` backdrop at 0.72 with `blur(6px)`) plus
`.hs-upd-dialog` / `.hs-addon-dialog` skins. `useModalDialog`'s Escape + tab-wrap + focus-restore
contract is untouched, and **no backdrop-click dismissal is added** — the inventory wrongly claims
one exists; adding it would be a behaviour change.

---

## 9. Motion, and where reveals are allowed

**Reveals are Brief-tier only.** Marked: the Brief page header (title + subtitle as one
`data-reveal`), Brief section heads, Brief KPI tiles (`data-reveal-stagger`), the Bookmarks card
groups, the Reports groups, the Schedule landing's bands, and the auth funnel's aside. Not marked:
any chrome, any table, any board cell, any dialog, any Board surface below the fold. A 200-row table
cannot stagger, and chrome that can be invisible is a bug, not an animation.

**The documented trap, resolved by rule.** `useHudMotion.ts` queries `[data-reveal]` and adds `.in`
imperatively; the CSS rest state is `opacity: 0`, so a *dynamic* className on such an element leaves
it invisible forever. Therefore: **every `[data-reveal]` element in this plan carries a literal
string className, and the tier class (`bf-brief` / `bf-board`) is applied to an ancestor, never to
a revealing element.** That is checkable by grep and belongs in the review checklist.

**Reduced motion: extend, do not reinvent.** The ten existing
`@media (prefers-reduced-motion: reduce)` blocks are left alone, including their deliberate
inconsistency (reveals shortened to 0.4s on the home page, fully disabled on product pages).
`density.css` adds an **eleventh** block covering only what this plan introduces: the nav sheet's
slide, the mobile flyout's `translateY`, the palette entrance, the account menu's `hs-pop`, and the
Board row lift. `design-tokens.css` already nulls `--bf-lift`, `--bf-slide`, `--bf-reveal-shift` and
`--bf-reveal-stagger` under reduced motion, so anything reading tokens is covered for free.

**Performance discipline, inherited.** Blur stays ≤50px. `will-change: transform` appears only where
it already does. Nothing new animates `box-shadow` on a scroll container. The bottom-bar and sheet
transitions are `transform`/`opacity` only.

**Do not use `:where()` in `density.css`.** It breaks under jsdom in this repo (already learned the
hard way on the glyph-portal work). Plain descendant selectors and the existing scope discipline
only.

---

## 10. Components to port

Repo recipe, verified against `components/ui/stagger-cards.tsx`: no Tailwind, no `cn`, no `@/`
alias — a typed generic component, inline `style` objects for anything geometric, **one scoped
`<style>` block inside the component**, shadcn tokens mapped onto `--wx-*` **with fallbacks**
(`var(--wx-blue, #2f6bff)`), a `prefers-reduced-motion` rule inside that same block, and a doc
comment at the top naming the 21st.dev source and what was changed.

Three new ports. Four existing ones reused.

### 10.1 `components/ui/page-frame.tsx` — the tier frame

The single component that makes 23 pages consistent, and the enforcement point for §7 item 4.

```tsx
/* Ported from 21st.dev "page header / section heading" into this codebase's
   conventions: no Tailwind, no `cn`, no `@/` alias — inline styles plus one
   scoped <style> block, shadcn tokens mapped onto the app tokens
   (foreground → --wx-ink, muted-foreground → --wx-mut, primary → --wx-blue,
   border → --wx-line-soft). Renders the one page header in the product: an
   eyebrow, a title with its release pill, a subtitle and an actions slot, at
   whichever density the surface declares. */
export type PageFrameProps = {
  tier: "brief" | "board";
  eyebrow?: string;
  title: ReactNode;              // may contain <em> for the gradient accent
  releaseTag?: ReactNode;        // the existing <PageReleaseTag />, unchanged
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};
```

It reads `--bf-title`, `--bf-h2`, `--bf-lede`, `--bf-head-gap`, `--bf-pad`, `--bf-measure` from the
tier scope it is inside — no size literals in the component. `data-reveal` goes on the header
`<div>` with a literal className, per §9.

**It also fixes BUG-2.** The release pill is currently only styled by
`hs-index.css: .hs-index .hs-index-title .hs-page-tag`, and `schedule/page.tsx` renders it inside
`.dx-title` — which is not `.hs-index-title` — so month/week/list/kanban/matrix/gantt all render the
bare word "New" as unstyled inline text today. `PageFrame` owns the pill and `density.css` styles it
unscoped: Brief 11px/700 in a `999px` `#2f6bff` pill, Board 10.5px, Beta on `--cc-violet #6d28d9`.

`SchedulePageFrame` **keeps its name and its call sites** and delegates to `PageFrame` with
`tier="board"` — `boundary.test.ts` asserts every schedule page except Gantt matches
`<SchedulePageFrame`.

### 10.2 `components/ui/nav-sheet.tsx` — the phone hub sheet

Ported from a 21st.dev bottom-sheet/drawer. Full-height sheet from the bottom bar, drag-to-dismiss
plus an ink scrim, focus trap, Escape close, `role="dialog"` + `aria-modal` + `aria-label="All
pages"`. Renders the nine hubs as sections and the 21 pages as `role="menuitem"` rows using their
exact existing labels, icons, release pills and lock arrows, and hosts the star, create + and
settings controls that vanish at 560px today.

Gated on `window.matchMedia('(max-width: 720px)')` with the `matchMedia`/`addEventListener("change")`
pattern `stagger-cards.tsx` already uses. Because the test stub returns `matches: false`
unconditionally, it mounts nowhere in the suite.

### 10.3 `components/ui/floating-panel.tsx` — the one popover surface

The flyout, the four top-bar menus, the notifications panel and the record drawers are six
independently styled floating surfaces today (`app-shell-hubspot.css`, `topbar-redesign.css` and
`styles.css` each own some of it). One ported panel primitive: `#fff`, `18px` radius,
`1px --wx-line-soft`, `--bf-shadow-float`, a 0.16s `hs-pop`-equivalent entrance keyed to a
`placement` prop, plus the Escape/outside-mousedown/focus-restore behaviour those six surfaces
currently implement in four separate `useEffect`s.

The rail flyout's markup moves out of `App.tsx` into it. That is a *reduction* of App.tsx (39,194
lines) and is safe for `boundary.test.ts`, which only forbids markup moving *into* App.tsx, forbids
the string `sched-` in App.tsx, and forbids a `gantt-` className there. **The new class prefix is
`bf-`, which trips none of those patterns** — worth stating, because a prefix like `sched-panel`
would fail the build.

### 10.4 Reused as-is

- `text-shimmer.tsx` → the workspace loading screen's "Loading BuildFlow HUD" line, replacing the
  bare `Loader2 .spin`.
- `quantum-cloud-loader.tsx` → the same screen's mark. Already the AI-thinking loader, so the
  gradient trio's licensed AI use covers it.
- `display-cards.tsx` → Brief-tier KPI tiles on the Dashboard status strip and the Reports page.
- `interactive-hover-links.tsx` → the nav sheet's page rows, giving phones the same slide-on-hover
  grammar the landing mega-menus already use.

---

## 11. CSS plan

**No import is reordered.** `main.tsx`'s hand-tuned order ends with `app-shell-hubspot.css` and the
comment "loads last so it wins"; reordering regresses everything. Two files change position in the
list, and only by being added at the two ends:

1. `design-tokens.css` — **first** (already is). Gains the nine tier-token *names* with the Brief
   values as `:root` defaults, so an unclassified surface degrades to Brief rather than to nothing.
2. `density.css` — **new, imported last, after `app-shell-hubspot.css`**. It contains, and contains
   only: the two tier scopes (`.bf-brief` / `.bf-board`, nine declarations each), the eight-token
   chrome re-palette on `.hs-shell`, the unscoped `.hs-page-tag` fix, the `.bf-dialog` split, the
   phone-shelf media block, and the eleventh reduced-motion block. Everything else stays where it
   is and keeps winning where it wins.

Files edited by hand for the hard-coded colours the token flip cannot reach: `hs-breeze.css`
(`--bfz-navy`, and the `top: 56px / left: 56px` → token rewrite), `assistant-global.css` (its own
`--wx-*` set), `schedule.css` 1945–1965 (`SavedViewsFlyout`), `hs-index.css` (`650`/`750` weights →
600/700, `--hsx-*` re-based on the shared tokens).

Deleted: `sidebar-redesign.css` (307 lines, `.sidebar-rx` appears nowhere in `App.tsx` — 43 dead
rules), the `Sidebar`'s inert `collapsed` / `onToggleCollapsed` props and the inert
`sidebar-collapsed` shell class, `.hs-shell .hs-flyout-divider` (matches nothing),
`.hc-assistant-fab.open` (never set), and `--wx-serif` with its 27 reading rules.

---

## 12. Build order

1. **Tokens.** Add the nine names to `design-tokens.css`; create `density.css` with the two scopes;
   write `density.test.ts` (the closed-nine allowlist + the nesting grep). No pixel moves yet.
2. **Chrome re-palette.** The eight `.hs-shell` values plus the four hand-edited files. One visible
   change, fully revertable, and the whole app reads as one product at the end of it.
3. **`PageFrame` + `floating-panel`.** Port both; migrate `SchedulePageFrame` to delegate; migrate
   the flyout and the four menus. Fixes BUG-2 as a side effect.
4. **Tier every route.** Apply `.bf-brief` / `.bf-board` per §3; delete the per-scope size literals
   the tokens now cover. Dashboard first (it exercises the nesting rule), then the six schedule
   views, then the indexes.
5. **Reachability.** Flyout tap-to-pin + Escape/blur close; the phone shelf; `nav-sheet`; the help
   button at every width; the verify badge's label at every width.
6. **Motion + shell screens.** Reveals on Brief surfaces; palette entrance; account menu entrance;
   the loading/error/skeleton screens; the eleventh reduced-motion block.
7. **Optional, severable.** Render the chrome on Settings.

---

## 13. Test risk, honestly

**348 `it()`s across 37 files.** 173 are pure logic (`cpm`, `dashGrid`, `scheduleUtils`, `filters`,
`week`, `kpis`, `rebook`, `linkBookmarks`, `viewKeys`, …) and a presentation-only change cannot
reach them. **175 render DOM** and assert on class names and exact accessible names:

| File | `it()`s | Risk | Why |
|---|---:|---|---|
| `App.test.tsx` | 67 | **low**, 1 test medium | Roles + names all preserved. `:634` "opens the Settings page from the account menu" is exposed by §8.2's Settings-chrome item |
| `schedule/pages.test.tsx` | 41 | **low** | `SchedulePageFrame` keeps its name and call sites; only its internals change |
| `tests/index-pages.test.tsx` | 12 | **low** | Row height 46px and cell inset 14px unchanged, so no reflow; names untouched |
| `tests/schedule.test.tsx` | 11 | **low** | `:44` opens Settings from the Week page account menu — menu markup preserved |
| `tests/settings.test.tsx` | 9 | **HIGH** | `:113` asserts ≥2 buttons named "Settings" (passes with 2 or 3). But rendering the chrome on the Settings page can produce duplicate accessible names for singular `getByRole` queries in this file and in `App.test.tsx:634` |
| `tests/landing-menus.test.tsx` | 9 | **none** | Auth re-accent is token values only; `.acct-split` and all 14 trade-card names preserved |
| `tests/map.test.tsx` | 7 | **low** | `:103` clicks a *locked* flyout `menuitem` and expects the "Get Map & Field Ops" dialog — the flyout keeps `role="menu"`/`menuitem`, its labels, its lock arrow and `onRequestAddOn` |
| `schedule/scale.test.tsx` | 6 | **low** | Board-tier sizes are CSS; jsdom loads no CSS |
| `tests/tutorial.test.tsx` | 5 | **low** | `:286` asserts the bell precedes the account control **in the DOM** — JSX order untouched, visual order still comes from CSS `order`. Anchors unmoved |
| `components/CommandPalette.test.tsx` | 4 | **low** | Restyle only; the entrance animates already-mounted DOM so it cannot race the `rAF` focus |
| `schedule/boundary.test.ts` | 8 | **low but sharp** | Guards `/sched-/` anywhere in App.tsx, `className=…gantt-` in App.tsx, one page module per view, and `<SchedulePageFrame` on six pages. The `bf-` prefix trips none of it; extracting the flyout *out of* App.tsx is allowed |

**The highest-risk path, named.** `appHarness` reaches the dashboard by clicking through the auth
funnel — `findByRole("heading", { name: "Welcome back." })`, then
`getByRole("button", { name: "Create an account" })`, then a trade card by accessible name — and
`openAppPage()` does `fireEvent.mouseOver(hubButton)` on `^<Hub>( \(.*\))?$` followed by
`findByRole("menuitem", …)`. Nearly every one of the 175 goes through it. This plan therefore
**changes none of those strings and none of that structure**: the heading text, the button name, the
14 card names, the nine hub names, the `button`/`menuitem` roles and the mouseover-opens-the-flyout
behaviour are all preserved, and the new tap path is *added alongside* hover rather than replacing
it. `openSchedule()` with no view still clicks the hub and still lands on
`"The whole plan, at a glance."`.

**Two structural facts that buy most of the safety.** (1) jsdom loads no CSS, so every type-scale,
rhythm, colour and radius number in §5 is untestable and therefore unbreakable. (2) the test setup
stubs `matchMedia` to `matches: false` unconditionally, so the nav sheet and every other
media-gated component mounts nowhere in the suite.

**Expected failures if the plan is built as written:** 0, with item 7 (Settings chrome) deferred.
**2–5** in `tests/settings.test.tsx` and `App.test.tsx` if item 7 ships, all of the "found multiple
elements" kind, all fixed by scoping those queries to `within(topBar)` / `within(rail)`. If touching
test files is unacceptable, drop item 7; the rest of the plan is independent of it.

---

## 14. Weaknesses

1. **The classification rule has genuine edge cases.** Crews and Map are card collections that read
   like Brief surfaces and classify as Board; Settings' Preferences panel is four toggles and
   classifies as Board only via a fourth-input technicality. Somebody will argue about Crews. The
   mitigation is that the argument is cheap — the tier is one class on one wrapper — but the rule is
   not self-evidently right on those three pages.
2. **The chrome-to-paper flip is the biggest single visual change in the plan** and the least
   reversible in perception terms. A navy rail is BuildFlow's most recognisable surface, and the
   eight-token flip means the whole app changes character in one commit. It is the right call for
   "one ground, no banding", but it should be reviewed on a screenshot before step 2 is merged, not
   after.
3. **Two tiers is one more concept than one tier**, and the closed-nine test only enforces the
   token layer. Nothing mechanically stops the twelfth engineer from writing
   `font-size: 15px` inside a Board scope; §7 item 5 covers colour and shadow drift but not
   hand-written sizes.
4. **The Dashboard exception is real and permanent.** 1280px and `DASH_GAP: 16` are off the Brief
   measure and off the Brief stack, justified by persisted `dash:layout` data. It will read as an
   inconsistency to anyone who does not know why, so the comment in `density.css` has to carry the
   reason, not just the number.
5. **The `--bf-h3` and `--bf-lede` floors break the stated ratio** (0.65 and 0.765 against 0.57).
   That is honest but it means "0.57× the display type" is true of three rungs out of five, and a
   reader who checks the table will notice.
6. **The phone shelf is designed but unproven**, and it is the one part of the plan that no test
   will ever exercise — precisely because `matchMedia` is stubbed false. It needs real-device QA at
   375px, 390px and 430px, and the bottom bar's five-slot choice (Home / Schedule / Field /
   Reporting / More) is a judgement about what a foreman opens most, not a measurement.
7. **BUG-1 is preserved as a dead control.** The bookmarked-schedule-view rows in the star menu and
   on the Bookmarks page write `location.hash` and nothing in-app listens, so they only work on a
   fresh page load. Faithfully preserving them means shipping a redesigned dead affordance. Correct
   for a presentation-only plan; wrong for the user, and it needs its own ticket.
8. **One net-new string** ("No activity yet." in the notification panel) and **two colour retreats**
   (the bookmark gold `#f0b354` / `#e8a33d` → `#2f6bff`, the Beta violet `#7c3aed` / `#a78bfa` →
   `--cc-violet #6d28d9`). All three are deliberate and flagged, but they are changes to existing
   rendering in a plan whose first rule is that nothing changes without saying so.
