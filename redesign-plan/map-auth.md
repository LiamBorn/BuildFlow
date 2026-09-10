# Auth cluster — screen-by-screen redesign mapping

Cluster: **auth** (signup · onboarding · recovery · invites). 33 screens/states mapped, 253
information items and 109 actions placed, 30 form inputs preserved.

Source records (read in full, including every `completenessCheck` block):
`inventory/auth-signup.json` · `inventory/auth-onboarding.json` · `inventory/auth-recovery.json` ·
`inventory/auth-invites.json`.

Design language: `/Users/liamsantos/Documents/Production Scheduling/DESIGN_TOKENS.md`.
Shell/density system: **"preserve" (Daylight Rail)**, `plan/concept-preserve.md`, plus the grafts the
judges required.

Verified in source before writing (not re-derived from the records):
`client/src/account-redesign.css` (1,839 lines — base block, the wide variant, the aside, the viz,
the three reduced-motion blocks and the landing-parity block at :1055–1300),
`client/src/App.tsx:6485–6547` (`ACCT_VIZ_LANES`, `AcctScheduleViz`),
`client/src/design-tokens.css`, `client/src/components/ui/text-shimmer.tsx` (the porting
convention).

---

## 0. How the language translates to the funnel

### 0.1 The funnel is already the closest surface in the product to the Welcome Page

`account-redesign.css:1055–1300` is a "landing-page parity" block, declared last so it wins at equal
specificity. It already puts the **form column** on `#f5f6fa` paper, Inter, the ink pill CTA, 48px
hairline fields and the landing's `.wx-title` recipe (`clamp(30px, 4vw, 40px)` / 500 / `-0.025em`).

That changes what this cluster's job is. Preserve's honest shortfall §12.2 — *"nothing in the app
exceeds 26px while the Welcome Page's smallest display size is 38px, so after the re-skin no surface
in the product occupies the display register at all"* — **is not true of the funnel.** The auth h1 is
already 40px at its cap. The funnel is the product's one display-register surface and its one
product-window surface, and the highest-value thing this mapping can do is *not break that* while
closing the four gaps the parity block deliberately left open:

| Gap | Where | Fix |
|---|---|---|
| The accent is the Welcome Page's `#1a73e8`, not the app's `#2f6bff` | `.acct-split` token block | Decision #2, executed (§0.3) |
| The **aside was explicitly left untouched** — a navy radial gradient, the product's 4th gradient recipe | `account-redesign.css:695–1010` | Re-base onto the documented dark product-window palette (§0.4) |
| Four inks and five greys survive below the parity block | `#070b12`, `#0b0e14`, `#141922`, `#47505f`, `#6f7785`, `#8a909c`, `#9aa0ab`, `#a7adb7`, `#d7dbe2`, `#c3c9d4` | Re-base onto `#1c1c1a / #575550 / #8a877e` + the two hairlines (§0.4) |
| No eyebrow role, no radius ladder, no hover grammar below the parity block | `.acct-sec-head`, `.acct-pick`, `.acct-plan`, `.acct-invite-*`, `.acct-preview-*` | §0.2, §0.5 |

### 0.2 What carries over literally, and what re-scales

**Literally, x1, no adjustment** (10 of these are already in place — marked ✓):

| Thing | Value |
|---|---|
| Ground | `#f5f6fa`, form column, end to end ✓ |
| Ink / muted / faint | `#1c1c1a` / `#575550` / `#8a877e` (✓ in the parity block; **not** below it) |
| Hairlines | `rgba(28,28,26,0.13)` and `rgba(28,28,26,0.07)` |
| Card fill | `#ffffff` ✓ |
| Accent | `#2f6bff`, exactly one (was `#1a73e8`) |
| Gradient trio | `#4285f4 → #9b72cb @54% → #d96570` — spent in this cluster on **one** thing: the aside's three auroras, i.e. the sanctioned product-window role |
| Radius ladder | `999 / 26 / 20 / 18 / 12 / 8` + `50%` |
| Shadow ladder | all seven steps verbatim on paper surfaces (the dark window keeps its own, §0.4) |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)`; `cubic-bezier(0.4, 0, 0.2, 1)` only for height/grid |
| Interaction durations | `.18s` press · `.25s` hover · `.28s` transform · `.3s` panel |
| Entrance | `0.55s` `acct-rise`, once, `both` ✓ — already inside the 0.7–1.0s band's lower half and already one-shot |
| **The eyebrow** | `11.5px / 650 / 0.045em` uppercase — **the x1 rule, grafted verbatim from preserve** |
| Hover grammar | four moves, no fifth (§0.5) |
| Copy measures in `ch` | prose gets a `ch` cap, never a px cap |
| Typeface | Inter, one family; italic `em` is the only display accent ✓ |
| The product window | the aside **is** the Welcome Page's dark window + stage; this is the one place it exists in the product |

**Re-scaled for the funnel — the auth register.** The funnel sits between the marketing page and the
dense app, and the numbers say so:

| Role | Welcome Page | Auth register | Factor | Status |
|---|---|---|---|---|
| Page title (`.acct-head h1`) | hero `clamp(46px, 6.8vw, 96px)` | `clamp(30px, 4vw, 40px)` / 500 / `-0.025em` / `1.05` | ÷2.4 from hero, ÷1.35 from section h2 | **FROZEN — today's value.** It is already the landing's `.wx-title`. New: `max-width: 24ch` |
| Aside display quote | feature hero `clamp(38px, 5vw, 78px)` | `clamp(26px, 2.6vw, 36px)`, measure `15ch` | ÷2.2 | unifies today's two values (`clamp(28,3vw,40)` narrow / `clamp(24,2.4vw,32)` wide) |
| Lede (`.acct-head p`) | `clamp(16px, 1.35vw, 19px)` | `15.5px` / 500, measure `46ch` | ÷1.23 | size FROZEN; the `ch` cap is new |
| Section head (`.acct-sec-head h2`) | section h2 `clamp(32px, 4.4vw, 54px)` | `17px` / 600 / `-0.01em` / `#1c1c1a` | ÷3.2 | from `15px/700/#070b12` |
| Figure (`.acct-plan-price`) | stat `clamp(46px, 5.4vw, 72px)` / `-0.02em` | `22px` / 700 / `-0.02em` / `tabular-nums` / **ink** | ÷3.3 | from `19px/800/#2f6bff` |
| Field label | — | `13px` / 600 / `#575550` | — | FROZEN (weight 700 → 600) |
| Input text | body 15–16px | `15px` / 500 | ÷1.05 | FROZEN |
| Card title (`.acct-pick-copy strong`) | row h3 `clamp(26px, 3vw, 38px)` | `13.5px` / 700 → **650** | ÷2.8 | size FROZEN |
| Card body (`.acct-pick-copy em`) | row body 44ch | `12px` / 500 / `1.45` | — | FROZEN (see the ellipsis note, screen 10) |
| Hint / field error | — | `12.5px` / 600 | — | FROZEN |
| **Eyebrow / label** | 11.5–13px | `11.5px` / 650 / `0.045em` uppercase | **×1** | from `13px/600` sentence case |
| Micro (chips, result outcome) | — | `12px` / 600 | — | FROZEN |
| Section rhythm | `clamp(76px, 12vh, 130px)` → 108px @1440 | `.acct-sec + .acct-sec` = `var(--bf-rhythm-dense)` (20–34px, 27px @900 tall) | ÷4.0 | from a flat 12px `.acct-form` gap |
| Field rhythm | — | `16px` inner gap, `6px` label→control, `12px` field→field | — | FROZEN — a form's beat is not a page's beat |
| Bottom tail | — | **72px** below the last control in the scrolling column | — | **new — the CANVAS graft.** Nothing competes for space below the last row, so this is the one place Welcome-scale air is free |
| Page measure | 1140px | `min(100%, 400px)` / `640px` wide | — | FROZEN. This is a *form* measure, not a page measure; prose is capped in `ch` instead |
| Card lift | `translateY(-6px)` | `translateY(-4px)` | ÷1.5 | from `-2px`. A 6px lift on a 60px card moves it 10% of its own height |

**The ladder sentence (the HYBRID graft, stated as jumps against the source's own internal range):**

> The funnel runs hint `12.5px` → title `40px` = **3.20×**.
> The dense app runs row `13px` → title `26px` = **2.00×**.
> The Welcome Page runs body `12px` → hero `96px` = **8.00×**.
> Every auth rung sits between the app's and the marketing page's, in order and without a gap:
> `26 → 40 → 54` for titles (×1.54, ×1.35), `13 → 15.5 → 19` for ledes, `11.5 → 11.5 → 11.5` for
> eyebrows. **One ladder, three volumes**, and the funnel is the rung that makes the other two look
> like the same system — because it is the screen a person sees immediately after the marketing page
> and immediately before the dashboard.

Deliberately **not** carried over: the 108px section beat (a form is not a page), the 1140px page
measure, and any type size above 40px.

### 0.3 Tokens to add

Append to `client/src/design-tokens.css` (all under the already-unused `--bf-` prefix, so the file
stays pixel-inert until something reads it). This block is the *auth* companion to preserve's
`--bf-app-*` block; the two never collide because no selector reads both.

```css
:root {
  /* ---- auth register: the funnel, between the marketing page and the app ---- */
  --bf-auth-title:         clamp(30px, 4vw, 40px);  /* FROZEN at today's value */
  --bf-auth-title-track:   -0.025em;
  --bf-auth-title-lead:    1.05;
  --bf-auth-title-measure: 24ch;   /* no-op in the 400px column; bites only on the wide steps */
  --bf-auth-quote:         clamp(26px, 2.6vw, 36px);  /* the aside display quote, unified */
  --bf-auth-lede:          15.5px;
  --bf-auth-lede-measure:  46ch;
  --bf-auth-sec:           17px;
  --bf-auth-label:         13px;
  --bf-auth-field:         15px;
  --bf-auth-row:           13.5px;
  --bf-auth-figure:        22px;    /* plan price */
  --bf-auth-hint:          12.5px;
  --bf-auth-micro:         12px;
  --bf-auth-eyebrow:       11.5px;
  --bf-auth-eyebrow-track: 0.045em;

  --bf-auth-tail:          72px;   /* the bottom tail on a scrolling form column */
  --bf-auth-prose:         52ch;   /* every run of prose in the funnel: hints, empty states,
                                      OAuth banners, the held-invite note, email body copy */

  /* the funnel's one dark surface — the Welcome Page's product-window palette, verbatim */
  --bf-win:        #202124;
  --bf-win-2:      #2b2c2f;
  --bf-win-ink:    #e8eaed;
  --bf-win-mut:    #9aa0a6;
  --bf-win-green:  #81c995;
  --bf-win-amber:  #fdd663;
  --bf-win-blue:   #8ab4f8;
  --bf-win-line:   rgba(255, 255, 255, 0.16);
  --bf-win-fill:   rgba(22, 20, 28, 0.78);   /* the .wx-mock recipe */
  --bf-win-shadow: 0 26px 60px -30px rgba(0, 0, 0, 0.75);  /* see §0.4 */
}
```

Two **corrections** to `design-tokens.css` as it stands, both consequences of decision #2 (shared
with preserve §3c — make them once):

```css
--bf-focus-ring: 0 0 0 4px rgba(47, 107, 255, 0.12);   /* was rgba(26, 115, 232, 0.12) */
```

and the `#1a73e8` literal in its comment block.

Decision #4, executed for this cluster: **`--wx-serif` is not declared on `.acct-split` and is not
read by any `.acct-*` rule** (verified — `apply-redesign.css` is the auth-adjacent file that declares
it, and it styles the careers apply page, not the funnel). Nothing to delete here; the deletion lands
in preserve's Phase G.

Decision #3, executed: `--wx-amber` is **not declared and not read** anywhere in `account-redesign.css`.
The strength meter's amber is a literal `#e0a23c`, and the held-invite amber is a literal `#a8721b`.
Both stay exactly as they render (§0.4). Nothing in this cluster touches the seven `#0032b0` scopes.

### 0.4 Every literal being retired, named

The CANVAS graft says name the gradients you force flat, and name what dies for the one you keep.

**Gradients.** The funnel has three. One is retired, one is kept as the licensed trio, one is kept as
the window's mesh:

1. **RETIRED — `.acct-aside` background** (`account-redesign.css:701`):
   `radial-gradient(125% 120% at 18% 12%, #2a4bff 0%, #1b2a6b 46%, #0b1030 100%)`.
   This is the product's fourth gradient recipe, it is a *brand-navy* field that fights `#2f6bff`, and
   it is the reason the funnel's aside reads as a different product from the marketing page's product
   window. It becomes the documented dark window:
   `background: var(--bf-win)` with `radial-gradient(125% 120% at 18% 12%, var(--bf-win-2) 0%, var(--bf-win) 58%, #1a1b1d 100%)`
   — a 2-stop tonal wash inside one hue, not a hue journey. **This is the largest declared visible
   change in the cluster. Revert = one declaration.**
2. **KEPT, and re-based onto the trio — the three auroras** (`:711–740`). `#4f7bff → #4285f4`
   (`--wx-g-blue`), `#9b6ecb → #9b72cb` (`--wx-g-purple`), `#d96570` **already exactly**
   `--wx-g-coral`. Sizes (420/360/300px), positions, opacities (.55/.42/.26) and `blur(50px)` all
   **frozen** — 50px is the repo's perf-learned value and matches the documented discipline
   ("aurora blur is 50px, not 90px") exactly.
3. **KEPT as-is — `.acct-viz-sweep`** `linear-gradient(100deg, transparent, rgba(255,255,255,0.13), transparent)`.
   A light sweep across a dark window is the product-window's animated-mesh role, not a brand
   gradient. It does not count against the trio's budget.

**Colour literals** (every one verified in source):

| Literal | Where | Becomes | Why |
|---|---|---|---|
| `#1a73e8` | `.acct-split { --wx-blue }` :1076 | `#2f6bff` | decision #2 |
| `#070b12` | `.acct-head h1` :108, `.acct-sec-head h2` :449 | `var(--wx-ink)` `#1c1c1a` | the navy-era 4th ink (h1 already overridden by parity; the h2 is not) |
| `#0b0e14` | `.acct-brand strong` :83 | `var(--wx-ink)` | overridden by parity already; delete the base literal |
| `#141922` | `.acct-input` :135, `.acct-select option` | `var(--wx-ink)` | 5th ink |
| `#47505f` | `.acct-field label` :121, `.acct-remember` :218 | `var(--wx-mut)` `#575550` | |
| `#637083` | `.acct-back` :56 | `var(--wx-mut)` | |
| `#6f7785` | `.acct-head p`, `.acct-hint`, `.acct-invite-remove`, **and the `.acct-select` chevron data-URI stroke `%236f7785`** | `#575550` / `#8a877e` per role | the data-URI is this cluster's "leftover orange": a hidden literal no grep for `#6f7785` in a colour position would find |
| `#8a909b`, `#8a909c`, `#9aa0ab`, `#a7adb7` | `.acct-pw-toggle`, `.acct-pick-copy em`, `.acct-sec-head span` / `.acct-divider em` / `.acct-optional`, `.acct-select[data-empty]` | `var(--wx-faint)` `#8a877e` | four greys → one |
| `#d7dbe2` | `.acct-pick` / `.acct-plan` / `.acct-pick-check` (1.5px), `.acct-invite-remove`, `.acct-invite-results li` | `rgba(28,28,26,0.13)` **at 1px** | 1.5px is not on the hairline ladder |
| `#c3c9d4` | `.acct-pick:hover` border :491 | `rgba(28,28,26,0.25)` | matches the parity block's `.acct-input:hover` |
| `#e6e8ec` | `.acct-divider span`, `.acct-eyebrow` border, `.acct-strength-bar` track | `rgba(28,28,26,0.07)` (rules) / `rgba(28,28,26,0.09)` (the meter track needs to read as *unfilled*, not as a line) | |
| `#f8f9fb` | `.acct-eyebrow` fill :424 | `rgba(255,255,255,0.65)` | already what parity declares; delete the base literal |
| `#f5f9ff` | `.acct-pick.selected` bg :500 | `rgba(47,107,255,0.06)` | the accent at 6%, the app's selected-row value |
| `rgba(11,14,20,0.28)` | `.acct-pick:hover` shadow :492 | `var(--bf-shadow-card-hover)` `0 26px 60px rgba(28,28,26,0.12)` | navy-era shadow ink |
| `#ffffff` on the aside | `.acct-aside { color }` :700 | `var(--bf-win-ink)` `#e8eaed` | |
| `rgba(255,255,255,.9/.6/.5/.66/.72/.62/.7/.86)` | 8 sites across `.acct-viz-*`, `.acct-aside-quote cite`, `.acct-preview-*` | `var(--bf-win-ink)` / `var(--bf-win-mut)` | 8 alpha-whites → 2 tokens |
| `#bcd0ff` | `.acct-aside-type em` :776 | `var(--bf-win-blue)` `#8ab4f8` | the window's own accent |
| `#48e5a3` | `.acct-viz-live` + its pulse ring | `var(--bf-win-green)` `#81c995` | |
| `#4f7bff` / `#35c8f0` / `#9b6ecb` | `.acct-viz-job-blue/-cyan/-violet` | `var(--bf-win-blue)` `#8ab4f8` / `var(--bf-win-green)` `#81c995` / `#9b72cb` (`--wx-g-purple`) | three lane tones stay three tones, on the window palette |
| `#f2a63b` | `acct-viz-job-tone` 0–45% | `var(--bf-win-amber)` `#fdd663` | the double-book amber |
| `rgba(255,255,255,0.07)` | `.acct-viz-card` fill :832 | `var(--bf-win-fill)` `rgba(22,20,28,0.78)` | the `.wx-mock` recipe verbatim |

**Deliberately NOT re-based, with reasons** (so nobody "fixes" them later):

- **The strength ramp** `#e6e8ec → #d96570 → #e0a23c → #2f9e6b → #1f8a58` and its three label inks
  `#b4404b / #a8721b / #1f8a58`. This is a five-step *semantic ramp* and DESIGN_TOKENS.md ships no
  ramp — substituting `--wx-red` / `--wx-g-amber` / `--wx-green` would give a brighter amber and a
  darker green at the wrong contrast. Only the unfilled track joins the hairline family. Note score 1
  is *already* `--wx-g-coral` `#d96570`.
- **`.acct-error`** `#b42318` on `#fef3f2` / `1px #fecdc9`, and **`.acct-success`** `#1f5f41` on
  `rgba(47,158,107,.1)` / `rgba(47,158,107,.28)`. The ladder has no error or success rung and the
  contrast is load-bearing on the one paragraph a failing form depends on. **Only the radius moves**
  (error `9px → 12px`; success is already 12).
- **`.acct-invite-results li[data-status]`** `#1f8a58` sent / `#a8721b` held / `#6f7785 → #8a877e`
  skipped. Three outcomes, three hues, and the hue *is* the information.
- **The six `.acct-pick-ico` tones** (`tone-blue/violet/purple/green/teal/orange`, `#e8f0fe`+`#2f6bff`,
  `#efe8f8`+`#6d28d9`, `#e2f1e6`+`#188038`, `#d9f1f0`+`#0f766e`, `#feecdc`+`#c2410c`). These carry
  `TradeProfile.tone`, they are the same six tones `programRegistry` and the in-app KPI chips use, and
  preserve keeps them in-app ("six tones kept"). A categorical encoding is not an accent. The tile
  radius joins the ladder (`10px → 12px`) and nothing else changes.
- **`--wx-amber`**: not present in this cluster at all (decision #3 needs no action here).

**The accent budget, stated as a count and then actually enforced** (the EDITORIAL graft, minus its
self-contradiction — I name every exemption instead of claiming none):

> At most **one** accent-role element visible per screen at rest. The accent role is: eyebrow accents,
> kickers, links, icon tints and the selected state's border/fill/check.
> **Exempt, named:** (a) the six categorical `.acct-pick-ico` tones, because they encode the trade, not
> a state — and the selected trade card already flips its tile to ink `#1c1c1a on #fdfcf9`, which is
> exactly why the count stays at one; (b) *selection marks*, which are one role and may repeat, because
> their repetition is the information (4 ticked add-ons = 4 checks).

Counted, on the two screens where it bites:

| Screen | Accent-role elements today | After |
|---|---|---|
| Additional products, plan + 4 add-ons chosen | 4 blue plan prices + 1 selected plan border/check + 4 selected add-on checks + 1 `tone-blue` tile = **10** | 1 selected plan + 4 selection checks (one role) = **1 role, 5 marks**; prices go ink |
| Business type, trade chosen | selected border + ring + check + 3 remaining `tone-blue` tiles = **6** | 1 (the selected card; its own tile is ink, the other tiles are categorical) |
| Log in | `.acct-back:hover` blue + `.acct-link-btn` "Forgot password?" + `.acct-toggle-copy button` + eyebrow dot (already ink) = **3** | 1 (the two link-buttons share the *link* role; `.acct-back` goes muted-to-ink like the parity block's rule) |

**The two-clause card licence (the CANVAS graft), with the funnel's counted boundary audit.**

> A white/bordered rectangle is licensed only if **(1)** its boundary is itself interactive
> (clickable, draggable, resizable, dismissible), or **(2)** it is a viewport clipping a scrolling or
> animated world.
> Two narrow extensions, named because the funnel needs them: **(3) state** — a boundary is licensed
> when it is the sole carrier of a state that must survive colour-blindness (the error and success
> panels, the unchecked check-bubble); **(4) precedent** — a boundary is licensed when the object is a
> literal instance of one the source page itself frames (the hero badge → `.acct-eyebrow`).

| Surface | Resting boundaries today | Licensed by | After |
|---|---|---|---|
| 14 × `.acct-pick` | 14 | clause 1 (the border *is* the radio's hit area) | 14, at 1px hairline, **and they keep the lift** |
| 14 × `.acct-pick-check` | 14 | clause 3 | 14 |
| `.acct-eyebrow` | 1 | clause 4 | 1 |
| `.acct-aside` / `.acct-viz-card` / `.acct-viz-track` ×4 / `.acct-preview` | 7 | clause 2 | 7 |
| `.acct-error` / `.acct-success` | 1 | clause 3 | 1 |
| **~20 × `.acct-preview-chip`** | **20** | **none** — a text token is neither interactive nor a viewport | **0.** Drop the `1px rgba(255,255,255,0.18)` border; keep the `rgba(255,255,255,0.10)` fill (a fill is not a boundary) |
| **up to 20 × `.acct-invite-results li`** | **up to 20** | **none** — a result row is neither interactive nor a viewport | **0.** Drop the border and the 12px radius; separate rows with one `border-bottom: 1px solid rgba(28,28,26,0.07)` rule. This is the same row grammar preserve gives in-app tables |
| `.acct-input` / `.acct-select` / `.acct-invite-remove` / `.acct-plan` | 3–4 + 4 | clause 1 | unchanged count, 1px hairline |

**Net: Business type goes 56 → 36 resting boundaries; the invite results panel goes up to 20 → 0
boxes plus n−1 rules.** Both numbers are grep-checkable against the new stylesheet.

### 0.5 The four hover moves in the funnel

Every hover in the cluster is one of these four, and there is no fifth:

| Move | Applied to | Spec |
|---|---|---|
| **1 · Lift** (cards) | `.acct-pick` (14 trades + 4 add-ons), `.acct-plan` (4) | `translateY(-4px)` + `var(--bf-shadow-card-hover)` over `var(--bf-dur-move)` `var(--bf-ease)`. From `-2px` + a navy-ink shadow. Reads `--bf-lift-dense`, which already zeroes in the token file's reduce block |
| **2 · Invert** (pills) | `.acct-provider` (Google / Microsoft) | transparent + `1px` hairline → `#1c1c1a` fill / `#fdfcf9` text. Today it has a fill-only hover |
| **2′ · The ink pill's own hover** | `.acct-primary` (every CTA in the funnel) | `#1c1c1a → #000`, `0 8px 22px → 0 14px 34px`. **Already exact** in the parity block — frozen. An anchored ink pill deepens; it does not invert into an outline |
| **3 · Slide** (directional) | `.acct-primary svg` (ArrowRight) `translateX(3px)` — **already exact, frozen**; `.acct-back`'s leading `←` `translateX(-3px)`; `.acct-invite-add` ("+ Add another") `translateX(3px)`; the `.acct-select-chevron` keeps its `rotate(180deg)` on focus (a state, not a hover) | `var(--bf-slide)`, `var(--bf-dur-hover)` |
| **4 · Tilt** (product mocks) | **`.acct-viz-card` inside `.acct-viz`** — the funnel is the only surface in the product that can carry move 4 honestly | pointer-driven `--rx`/`--ry`, amplitude **±4deg** (the marketing mocks go harder; this card holds 10.5px text), `perspective: 1200px` + `isolation: isolate` on `.acct-viz` (the stage). Severable — see §0.8 |

Not a hover move, and therefore left as a colour change: `.acct-field-error .acct-inline-link`,
`.acct-link-btn`, `.acct-toggle-copy button`, `.acct-pw-toggle`, `.acct-invite-remove` (whose instant
red swap gets `var(--bf-dur-hover)` so it stops being the one un-transitioned control on the page).

### 0.6 Motion, reduced motion, and the keyframe-name freeze

**Keep every keyframe NAME.** The funnel's nine are `acct-rise`, `acct-dot-pulse`, `acct-viz-rise`,
`acct-viz-pulse`, `acct-viz-job-in`, `acct-viz-job-fix`, `acct-viz-job-tone`, `acct-viz-sweep` and
`wx-blink`. **Three** `prefers-reduced-motion` blocks null them **by name** —
`account-redesign.css:1024–1045`, `:1352–1357` (which carries `.acct-preview` / `.acct-preview-row` and
is the one most easily lost in a consolidation) and `:1508–1513` (`.acct-strength-bar span`) — plus
`WxTypewriter`'s own `matchMedia` snap. **Values change, names do not, and all three blocks are
extended in place, never merged.** Renaming one silently un-nulls it.

**The 12s locked period is load-bearing and frozen.** `acct-viz-job-in`, `-fix`, `-tone` and
`-sweep` all run 12s so the per-bar inline `animationDelay` (0.2 / 0.55 / 0.9 / 1.25 / 1.6 / 1.95 /
2.3 / 2.65s) stays offset on every repeat. Changing one duration desynchronises the double-book story
on the second loop. Only *colours* change inside `acct-viz-job-tone`.

**Verified, and it matters for the reduce path:** `.acct-viz-job.is-fix` has **no background-color of
its own** — its colour comes only from `acct-viz-job-tone`. Under reduced motion (`animation: none`) it
falls back to its tone class, and `ACCT_VIZ_LANES` gives the fix bar `tone: "blue"`. So the parked bar
renders in the *resolved* colour at `translateX(150%)`, which is exactly right. Re-basing
`.acct-viz-job-blue` to `--bf-win-blue` preserves that; giving `.is-fix` an amber base colour would
break it and make the static board read as an overlap bug.

**The ambient-loop licence is satisfied without new code.** The Welcome Page requires every infinite
loop to pause or null itself off-screen. The aside is either fully in view (`100dvh`, ≥900px) or
`display: none` (<900px), so the six viz loops are never running off-screen. State it; add nothing.

**Stagger, capped.** `.acct-pick` runs `calc(0.26s + var(--i) * 0.045s)`. At 14 trade cards the last
one starts at 0.845s and finishes at ~1.35s — past the documented 0.7–1.0s entrance band, and over
canvas's "budget six reveals per page". Cap the index instead of re-timing anything:

```css
.acct-split .acct-pick { animation-delay: calc(0.26s + min(var(--i, 0), 8) * 0.045s); }
```

Last six cards land together at 0.62s; the grid is settled by 1.12s. `--i` is written by React as a
unitless number, so `min()` resolves. `.acct-plan`'s `calc(0.4s + var(--i) * 0.05s)` (4 cards, worst
case 0.55s) needs no cap. Both interval values (45ms, 50ms) are **frozen** — they already sit inside
the reveal contract's 40–90ms band.

**No `data-reveal` anywhere in this cluster, and this is deliberate.** These are single-viewport
pages; on ≥900px the scroll container is `.acct-form-col`, not the window; and the `[data-reveal]`
rest state (`opacity: 0`) is declared only inside the ten page scopes (`.dash-rx`, `.sched-rx`, …),
none of which is an ancestor here — so adding the attribute would either do nothing or, if someone
later scoped it, leave the funnel permanently blank. `acct-rise` already satisfies the one-shot
contract: `both`, on mount, never replayed. The repo's documented trap (a dynamic `className` on a
`[data-reveal]` element wipes the imperative `.in`) is avoided by not opting in.

**Optional, guarded:** align `useHudMotion.ts` to `threshold: 0.16` / `rootMargin: '0px 0px -6% 0px'`.
That is preserve's Phase A change; it does not touch the funnel and is listed here only so the two
mappings do not both edit the same two numbers.

**One new motion primitive: `.acct-busy-rail`.** Four of this cluster's in-flight states have no
signal but a disabled button's copy, and the worst of them (§screen 7) legitimately holds for ~3s and
four requests. Add a 2px accent hairline across the top of the form column, driven by a `data-busy`
attribute on the existing `<main className="acct-split">`:

```css
.acct-split[data-busy] .acct-form-col::before {
  content: ""; position: absolute; inset: 0 0 auto; height: 2px;
  background: linear-gradient(90deg, transparent, var(--wx-blue), transparent);
  animation: acct-busy 1.4s var(--bf-ease-size) infinite;   /* new name, nulled in the :1024 block */
}
@media (prefers-reduced-motion: reduce) {
  .acct-split[data-busy] .acct-form-col::before { animation: none; background: var(--wx-blue); opacity: .5; }
}
```

`::before`, so **no new DOM node and no new accessible name**. Six JSX sites gain
`data-busy={busy || undefined}` on their existing `<main>` (create-account, additional-products,
invite-team, accept-invite, reset-password, verify-email). The button copy stays the announced signal.

**Rejected: `components/ui/text-shimmer.tsx` on the two text-only loading heads.** It sets
`color: transparent` with `background-clip: text`; on the verify and accept-invite "checking" screens
the `h1` is the page's only content, so a clip failure or a forced-colours mode leaves a blank screen.
Its inline `<style>` also has no `prefers-reduced-motion` block today — worth a 3-line fix by whoever
does use it (preserve wants it for "Loading BuildFlow HUD"), but not worth the hazard here.

### 0.7 How it ships

One new stylesheet, one new import line, no reordering, one-word revert.

`main.tsx` ends with a hand-tuned order (`app-shell-hubspot.css` "loads last so it wins"). Nothing is
reordered; one line is appended after preserve's:

```ts
import "./app-shell-hubspot.css";   // HubSpot-style app shell — loads last so it wins
import "./app-shell-daylight.css";  // the shell re-skin (concept: preserve)
import "./auth-daylight.css";       // the signed-out funnel on the same language — after both
```

**The specificity recipe:** every rule in `auth-daylight.css` reuses the *existing* selector, already
containing `.acct-split`, and wins by **cascade order at equal specificity** — the identical mechanism
the parity block uses today (its own comment says so). No `:where()` (a documented jsdom breaker in
this repo), no `!important`, no new scope class, **zero JSX class changes**. Estimated ~520 lines.

Two exceptions to the `.acct-split` scope, stated so the boundary is explicit:

- **`.acct-invite-*` rules are written unscoped**, because `InviteRows` renders in both the funnel and
  Settings › Team (`App.tsx:21632`), where there is no `.acct-split` ancestor. The component is one
  component and should look like one. `tests/settings.test.tsx:220–284` asserts behaviour and copy,
  not styling, so this is safe — but it is a cross-cluster edit and the settings mapping must know.
- **Everything else stays `.acct-split`-scoped**, which means the shared atoms `.acct-input`,
  `.acct-primary`, `.acct-field-error`, `.acct-hint`, `.acct-success` keep their old look inside
  Settings' `.settings-inline-form` (`account-redesign.css:1724+`). That is a deliberate hand-off, not
  an oversight: **the settings cluster owns those five atoms**, and `tests/settings.test.tsx:376/:398`
  pins two of its strings verbatim.

**Phases** (each independently revertable):

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | Append the `--bf-auth-*` + `--bf-win-*` block; re-base `--bf-focus-ring` | `design-tokens.css` | none (additive, unread) |
| **B** | Create `auth-daylight.css`; add the import; ship §0.2/§0.4/§0.5 for the **form column** only | 1 new + `main.tsx` | low, CSS only |
| **C** | The aside: dark window ground, trio auroras, `.wx-mock` viz card, window inks, the preview panel | same file | low, CSS only — **the one big visible change** |
| **D** | `.acct-busy-rail` + `data-busy` on 6 `<main>` elements; the three DO-NOT-MOVE comments; the `.acct-pick` focus fix; the `min()` stagger cap | same file + `App.tsx` (6 attrs, 3 comments) | low — no copy, no roles, no names |
| **E** | Port `components/ui/auth-stage.tsx`, wrap `AcctScheduleViz`'s card | 1 new + `App.tsx` (1 wrapper) | low, severable |
| **F** | Delete the now-dead parity block (`account-redesign.css:1055–1300`) after a computed-style diff | `account-redesign.css` | **medium** — do it last, alone, with the diff |

Phase F answers the question both records ask and neither resolves — *"account-redesign.css is a
two-layer file; any rewrite must decide which layer is canonical"*. Answer: **`auth-daylight.css` is
canonical.** Until Phase F the parity block is harmlessly shadowed; after it there is one layer.

### 0.8 Shared components

**Reuse, do not port** (four existing pieces carry most of this cluster):

1. **`AcctScheduleViz`** (`App.tsx:6519`) — the one aside mock, shared by all six split screens
   *"so the branded panel reads as one continuous surface while the form column advances"*.
   Restyled entirely through CSS. **Not extracted, not parameterised.**
2. **`WxTypewriter`** (`App.tsx:4308`) — the aside quote on all six. Untouched JS; only
   `--bf-auth-quote` changes. Its three-layer a11y pattern (ghost / `aria-hidden` real / sr-only
   `.wx-type-a11y`) stays, even though inside an `aria-hidden` aside the sr-only node is inert.
3. **`InviteRows` + `checkInviteRows`** (`App.tsx:7692` / `:7767`) — shared with Settings › Team.
   CSS only. **Do not restructure**: `appHarness` and `settings.test.tsx` both walk it, and
   `settings.test.tsx:169–172` reads `(productCheckbox as HTMLInputElement).checked`.
4. **The strength meter** (`.acct-strength*`) — already one CSS block serving three screens (signup,
   reset, accept). **Explicitly rejected: extracting it into `components/ui/`.** It would restructure
   the DOM of the signup form that 79 test references walk, to gain nothing a CSS block does not
   already give. The only change it needs is a missing rule (§screen 9).

**One new file** — `client/src/components/ui/auth-stage.tsx` (~70 lines), following the nine existing
ports exactly (plain markup, inline `style` objects, one inline `<style>` block for `::before` /
`:hover` / `@media`, shadcn tokens mapped onto `--wx-*` with literal fallbacks, a
`prefers-reduced-motion` rule *inside* that block, and a header comment naming the source and the
mapping — the shape of `text-shimmer.tsx` and `stagger-cards.tsx`):

```tsx
export function AuthStage({ children }: { children: ReactNode }): ReactNode
```

- Wraps the aside's mock in the Welcome Page's **stage**: `perspective: 1200px`,
  `isolation: isolate`, `overflow: hidden`, and publishes `--rx` / `--ry` from a rAF-throttled
  `pointermove` **bound on `pointerenter` and unbound on `pointerleave`** (the repo's paint-perf
  discipline: three 50px-blur auroras and six 12s loops are already on this surface).
- Amplitude ±4deg. Reduced motion: renders a plain `div`, **binds no listener at all**.
- Adds **no** accessible content (the aside is `aria-hidden="true"` wholesale, and the wrapper must not
  change that).
- **No containing-block hazard**, checked: no `position: fixed` descendant and no
  `data-tutorial-id` anywhere in the funnel (the tutorial arms on the Dashboard, after `#invite-team`).
  This is the same class of bug preserve schedules a browser check for on the top bar; here it is
  provably absent.
- Severable: delete the wrapper, keep the CSS.

**Explicitly not ported:** a count-up for the seat total (`test/setup.ts` stubs
`IntersectionObserver` as a no-op and `App.test.tsx:175` reads `/\$240 \/ month/` directly — a
decorative gain against a real risk); a `<Reveal>` wrapper (§0.6); a floating-panel/dialog abstraction
(this cluster has zero modals).

### 0.9 Invariants written into the source

Three comment blocks, no code change. The EDITORIAL graft ("write the harness contract into the
component as a DO-NOT-MOVE header") applies with more force here than anywhere in the app, because
**the whole suite walks this cluster**.

Above `WelcomeCreateAccountPage` (`App.tsx:6587`):

```
/* INVARIANT — DO NOT MOVE. The majority of the client suite walks this component.
   1. The email <label> text is MODE-DEPENDENT: "Work email" in signup, "Email" in login
      AND in forgot. appHarness.enterDashboard() (79 refs across 6 test files) finds it with
      findByLabelText("Email"); appHarness.signUp() finds it with "Work email". Unifying them
      breaks most of the suite at once. This is a bigger blast radius than openCreateAccount().
   2. The terms <label> wraps EXACTLY the four words "I agree to the". Both legal links are
      SIBLINGS OUTSIDE it — that is what makes getByLabelText("I agree to the") work, and it is
      also why opening a link does not tick the box.
   3. Verbatim, matched by accessible name: headings "Create your workspace." / "Welcome back.";
      buttons "Create account" / "Sign in" / "Log in" / "Create an account"; placeholder
      "name@company.com".
   4. EXACTLY ONE role="alert" may be visible at a time — App.test.tsx:120 uses findByRole("alert")
      SINGULAR. Do not add a form-level error summary above the fields, even though client
      validate() can raise five field errors in one tick.
   5. Provider buttons must be ABSENT, never disabled, when unconfigured (App.test.tsx:48-53).
   6. mode is local state and the hash never changes: signup/login/forgot all live at
      #create-account. Splitting them into routes breaks openCreateAccount()'s
      nav "Login…" -> "Welcome back." -> "Create an account" path. */
```

Above `WelcomeBusinessTypePage` (`App.tsx:7066`):

```
/* INVARIANT — DO NOT MOVE. Every test that reaches the app walks this screen.
   The 14 trade radios' accessible name must stay the TRADE LABEL ALONE:
   aria-labelledby -> the <strong>, aria-describedby -> the <em> tagline. App.test.tsx:142 does
   getByRole("radio", { name: businessType }) for all 14 and appHarness.chooseBusinessType()
   does the same. Heading "What type of Business do you own" (no question mark, mid-sentence
   capital B), radiogroup name "Business type", button "Get BuildFlow". */
```

Above `InviteRows` (`App.tsx:7692`):

```
/* SHARED with Settings > Team (App.tsx:21632). tests/settings.test.tsx:220-284 asserts this
   editor's button name ("Send invites"), that an invalid email makes NO POST, the POST body
   shape { invites: [{ email, role }] }, and the reset to one blank row — and it submits via
   fireEvent.submit(form) because the <form> has no noValidate, so native constraint validation
   intercepts a click. In onboarding the same primary button reads "Skip for now" while every
   row is blank; appHarness:177 and App.test.tsx:190 click that exact string. */
```

### 0.10 The byte-identical string ledger

This is the cluster's core risk surface. **Every string below is frozen — copy changes here are
test-breaking, not cosmetic.** Nothing in this mapping changes any of them; `text-transform:
uppercase` is used wherever a case change is wanted, so the DOM string stays identical.

**Tier 1 — breaks most of the 346 tests at once**

| String | Where | Consumer |
|---|---|---|
| `Email` (login/forgot label) | screen 2, 3 | `appHarness.enterDashboard()` → **79 refs / 6 files** |
| `Password` (label) | screens 1, 2, 21, 24 | same |
| `Sign in` (button) | screen 2 | same |
| `Search BuildFlow` (aria-label) | app shell — the gate `enterDashboard()` awaits | same (preserve §10.2 owns it) |
| `Login from welcome navigation` (aria-label) | landing nav | `appHarness.openCreateAccount()` |
| `Welcome back.` (heading) | screen 2 | same |
| `Create an account` (button) | screen 2 | same |
| `Your name`, `Company`, `Work email`, `I agree to the` (labels) | screen 1 | `appHarness.signUp()` |
| `Create account` (button) | screen 1 | same |
| `What type of Business do you own` (heading) | screen 10 | `appHarness.signUp()` tail |
| the 14 trade labels, as radio accessible names | screen 10 | `appHarness.chooseBusinessType()`, `App.test.tsx:142` |
| `Get BuildFlow` (button) | screen 10 | same |
| `Business type` (radiogroup name) | screen 10 | `App.test.tsx:135` |
| `Map & Field Ops`, `Equipment Tracking`, `Time Cards`, `AI` — as **substrings of the checkbox's own accessible name** (label + description, on a real `<input type="checkbox">`) | screen 13 | `appHarness.chooseProductsAndPlan()` |
| `Select Free plan` / `Select Pro plan` / `Select Business plan` / `Select Enterprise plan` (aria-label) **on elements whose role is `button`** | screen 13 | same, `App.test.tsx:168/177` |
| `Continue to BuildFlow` (button) | screen 13 | same |
| `Continue without add-ons` (button) | screen 13 | `App.test.tsx:168` |
| `Seats` (label), value `5` | screen 13 | `App.test.tsx:170` |
| `Skip for now` (button) | screen 18 | `appHarness:177`, `App.test.tsx:190` |
| `What additional products do you want to use?` (heading) | screen 13 | `App.test.tsx:150` |

**Tier 2 — breaks a named test**

`Create your workspace.` · `name@company.com` (placeholder) · `Log in` (button) ·
`Password must be at least 8 characters.` (as the **single** `role="alert"`) ·
`Track vehicles, equipment, and design traffic routes.` (as free text) · `$240 / month` (spacing
around the slash) · `Confirm liam@example.com…` (the `VerifyEmailBadge` aria-label *pattern*
`Confirm <email>: resend the confirmation email`) · `Send invites` (Settings) ·
`Your BuildFlow workspace is ready` (the post-onboarding dialog name) · the POST body key order
`{businessType, selectedPlan, selectedProducts, seats}` and the three `localStorage` keys.

**Tier 3 — no client test, and therefore only this inventory records it.** Every string on the forgot
flow, both reset screens, all three verify screens, all three accept-invite screens, the nine OAuth
reason strings, the strength labels, the personal-email hint, the company hint, the `Log in instead`
link, the per-email invite results and the three email templates. **These are the ones a redesign
drops silently.** Each is placed explicitly in the screens below.

**One collision to keep apart:** `Continue to BuildFlow` is the label of *both* the
additional-products submit (`App.tsx:7407`, matched by exact name) and the verify-email success button
(`App.tsx:7627`). They must never render in the same tree. Nothing in this mapping brings them
together, and no verify banner may be added to the products step.

---

## S0. The shared split chassis (`.acct-split` / `.acct-split-wide`)

Not a screen — the frame **eight** screens inherit (`#create-account`, `#business-type`,
`#additional-products`, `#invite-team`, `#accept-invite`, `#reset-password`, `#verify-email`, plus the
waitlist-adjacent view). Mapped once here; every screen below inherits it by reference.

- **Today:** `<main className="acct-split[ acct-split-wide]" id="<view>" aria-labelledby="<view>-title">`.
  One column below 900px; `1.04fr 1fr` at ≥900px (`1.32fr 1fr` wide). The wide variant pins itself to
  `100vh/100dvh` with `overflow: hidden` so the split is its own scroll container and only
  `.acct-form-col` scrolls, top-aligned. Form column: `#f5f6fa` paper, `padding: clamp(28px,5vh,56px)
  clamp(20px,5vw,48px)`, centred. Inner: `min(100%, 400px)` (`640px` wide), `display: grid`,
  `gap: 16px`, `animation: acct-rise 0.55s cubic-bezier(.22,1,.36,1) both`. Right: the aside, a navy
  radial with three auroras, `display: none` below 900px, `aria-hidden="true"` wholesale. Marketing nav
  and footer suppressed for all eight views (`App.tsx:3713–3726`).
- **Becomes:** the same chassis, **all geometry frozen**, re-skinned:
  - **Frozen, and why:** the `1fr` / `1.04fr 1fr` / `1.32fr 1fr` ratios; `height: 100dvh` +
    `overflow: hidden` + `.acct-form-col { overflow-y: auto; justify-content: flex-start }` on the wide
    variant (the CSS's own comment records that `position: sticky` is unavailable and that
    `justify-content: center` in a scroll container puts overflow *above* the scrollport — a documented
    trap, and note the onboarding record's correction that the `.welcome-page` reason is now stale
    (`styles.css:54` is `overflow-x: clip`), so this must be **re-tested, not re-derived**, before
    anyone touches it); `min(100%,400px)` / `640px`; the 900px breakpoint; `min-height: 100vh` **and**
    `100dvh` (dropping the `dvh` fallback re-introduces the iOS Safari clipped-viewport bug);
    `.acct-split { position: relative; z-index: 1 }` and `.acct-preview { position: relative; z-index: 1 }`
    (the auroras sit under them); the `aria-labelledby` → `h1` wiring on all eight; the nav/footer
    suppression list.
  - **Changed:** the form column gains `padding-bottom: max(clamp(28px,5vh,56px), var(--bf-auth-tail))`
    → the **72px tail** (the one place Welcome-scale air is free); `.acct-head h1` gains
    `max-width: var(--bf-auth-title-measure)` and `.acct-head p` gains `var(--bf-auth-lede-measure)`;
    `.acct-form` section-to-section beat goes `12px → var(--bf-rhythm-dense)` while field-to-field stays
    `12px` and label-to-control stays `6px`; the aside becomes the dark product window (§0.4).
  - **One unified focus recipe.** Today there are three: `.acct-input:focus` an ink ring
    (`rgba(28,28,26,0.08)`, parity), `.acct-pick:focus-within` a blue ring
    (`rgba(47,107,255,0.14)`), `.acct-remember input:focus-visible` a 2px outline, and **no authored
    `:focus-visible` at all on `.acct-primary`, `.acct-invite-remove` or `.acct-pw-toggle`** (verified —
    a real keyboard regression waiting for anyone who removes the UA outline). All of them become
    `box-shadow: var(--bf-focus-ring)` = `0 0 0 4px rgba(47,107,255,0.12)`, the documented value, on
    `:focus-visible`, plus a `border-color: var(--wx-blue)` where there is a border.
  - **The `.acct-pick` focus bug, fixed.** `:focus-within` fires on mouse-click (clicking the label
    focuses the visually-hidden radio), so the ring persists after a click and is nearly identical to
    `.selected`. Replace with `.acct-pick:has(input:focus-visible)`. Precedent: `hs-home.css:1233`
    already ships `:has()`. Zero test exposure — jsdom loads no CSS in this suite.
  - **Radius map:** inputs/selects `13 → 12`; cards (`.acct-pick`, `.acct-plan`) `13 → 18`; icon tiles
    `10 → 12`; `.acct-error` `9 → 12`; `.acct-preview` `16 → 18`; unchanged at `999` (pills, chips,
    eyebrow), `50%` (check bubbles, dots, auroras), `18` (`.acct-viz-card`), `12`
    (`.acct-invite-remove`, `.acct-success`).
  - **Borders:** every `1.5px` goes to `1px` at `rgba(28,28,26,0.13)`.
- **Every information item placed:** the chassis carries no copy of its own. The **brand lockup**
  (`BuildFlowLogoMark` + `BuildFlow`, `.acct-brand`, 32px mark / `17px` / 700 / `-0.01em` ink) and the
  **`← Back to …` control** (`13.5px`, weight 700 → 600, `#575550`, hover ink, arrow slides `-3px`)
  appear on every screen that has them and are placed once here rather than repeated 8×.
- **Every action placed:** none of its own. `.acct-back`'s target differs per screen and is placed per
  screen.
- **States:** empty/loading/error are per screen. Chassis-level: `data-busy` drives
  `.acct-busy-rail`. No add-on lock exists in the funnel (the products step *creates* the locks; it
  never displays one).
- **Motion:** `acct-rise` (frozen: 0.55s, `translateY(14px)`, `both`, one-shot). No scroll reveal
  (§0.6). Skeleton: **none, deliberately** — `if (page === "welcome")` returns at `App.tsx:2748`
  *before* the `if (isLoading)` gate at `:2766`, so the funnel can never be replaced by
  `DashboardSkeleton` or the loading screen. Any in-flight signal must live inside the page:
  the frozen busy copy plus `.acct-busy-rail`.
- **Tests touched:** none directly. The chassis is CSS-only and the `data-busy` attribute carries no
  role, name or text. All 346 keep passing unchanged.

---

## 1. Create account (signup mode) — `#create-account`, `mode === "signup"`

- **Today:** the full-bleed split; a 400px form column with 5 fields, 2 checkboxes, an optional
  provider block and a mode switch; the branded aside at ≥900px. The form column is already on the
  landing's paper/ink/pill language (parity block); everything below it is not.
- **Becomes:** the same DOM, same order, in the auth register. Header stack, top to bottom, in the
  400px column with a 16px inner gap: `.acct-back` → `.acct-brand` → `.acct-eyebrow` pill (999px,
  hairline border, `rgba(255,255,255,0.65)` fill, ink pulsing dot, text now
  `11.5px/650/0.045em` **uppercase via `text-transform`** — the DOM string
  `Launching September 21st` is untouched) → `h1` at `var(--bf-auth-title)` capped at 24ch → lede at
  `15.5px`/`46ch`. Then `.acct-form` (12px field gap, `var(--bf-rhythm-dense)` before the checks
  group): five fields at 48px / radius 12 / hairline / `15px`, labels `13px/600/#575550`, hints
  `12.5px/#8a877e` capped at `var(--bf-auth-prose)`; the strength meter (screen 9); the checks group;
  the ink pill submit at 48px/999px; the divider; the provider grid (screen 8); the mode-switch line.
  72px tail. Shared components: the chassis (S0), the strength meter block, `AcctScheduleViz` +
  `WxTypewriter` + `AuthStage` in the aside.
- **Every information item placed (20 of 20):**
  1. `← Back to BuildFlow` → `.acct-back`, top-left of the column, arrow slides `-3px` on hover.
  2. Brand lockup → `.acct-brand` (S0).
  3. Eyebrow chip `Launching September 21st` + pulsing dot → the `.acct-eyebrow` pill, uppercased by CSS.
  4. `h1#create-account-title` `Create your workspace.` → `var(--bf-auth-title)`, 24ch.
  5. Sub-headline `Coordinate crews, materials, and schedules in one place.` → lede, 46ch.
  6. Label `Your name` → `.acct-field label`. 7. `Company` → same.
  8. Company helper `This becomes your workspace name. You can rename it later in Settings.` →
     `.acct-hint#account-company-hint`, `12.5px/#8a877e`, `var(--bf-auth-prose)`.
  9. Label `Work email` → same recipe. **Byte-frozen and mode-dependent (§0.9).**
  10. Personal-domain hint (`That looks like a personal address…`) → `.acct-hint#account-email-hint`,
      same recipe, appears under the email field when the domain is in `PERSONAL_EMAIL_DOMAINS` (18
      domains, unchanged).
  11. Label `Password` → same. 12. Password helper (`At least 8 characters. A longer phrase…`) →
      `.acct-hint#account-password-hint`, prose-capped.
  13. Strength meter — 4 segment bars + `Password strength` + the bold verdict → screen 9.
  14. Terms line `I agree to the` + `Terms & Conditions` + ` and ` + `Privacy Policy` + `.` → the
      `.acct-terms` row inside `.acct-checks`. **The `<label>` still wraps exactly the four words and
      both links stay outside it.** Links get the *link* accent role (`#2f6bff`, underline offset 3px).
  15. `Keep me signed in for 30 days` → `.acct-remember`, `13.5px`, `#575550`, `accent-color: #2f6bff`.
  16. Divider `or continue with` → `.acct-divider`, the two rules at `rgba(28,28,26,0.07)`, the `em`
      at `11.5px/650/0.045em` uppercase `#8a877e` (the eyebrow role — this is a label, not a sentence).
  17. Provider labels `Google` / `Microsoft` + the `G` mark and the four-square mark → screen 8;
      both marks keep their brand colours and their `aria-hidden` wrappers.
  18. Mode switch `Existing user? ` + button `Log in` → `.acct-toggle-copy`, `#575550`, the button ink
      + underlined (frozen).
  19. Submit copy `Create account` / `Creating your workspace…` → the ink pill; busy copy frozen.
  20. The aside — brand row, the `Live schedule` card (pulsing live dot, `Live schedule`, `Mon — Fri`
      via `&mdash;`), the four lane labels `Framing` / `Concrete` / `Electrical` / `Roofing`, the
      typewriter line `Where crews, projects, and schedules ` + em `run as one.`, and the cite
      `Run the whole jobsite from one place.` → the dark product window (§0.4), quote at
      `var(--bf-auth-quote)` / 15ch, em in `--bf-win-blue`, cite `14px` in `--bf-win-mut`.
- **Every action placed (13 of 13):** (1) `← Back to BuildFlow` → `showWelcomeHome`. (2) submit →
  client `validate()` then `apiSignup({email, password, name, orgName: company, acceptTerms, remember})`.
  (3) implicit Enter submit, `if (busy) return` guard. (4) the show/hide toggle — 44px, absolutely
  positioned over the input, `.acct-input.has-toggle` keeps the right padding (**both must stay in
  sync**; radius change does not affect it), `Eye`/`EyeOff` 18px, `aria-label` `Show password` /
  `Hide password` frozen. (5) `Terms & Conditions` → `#terms`. (6) `Privacy Policy` → `#privacy`.
  (7) terms checkbox → `setAcceptTerms` + clears the `terms` error. (8) remember checkbox (default
  **true**). (9) `Google` → `startWithProvider('google')`, **terms-gated** (unticked ⇒ set
  `fieldErrors.terms`, do not navigate). (10) `Microsoft` → same. (11) `Log in` → `setMode('login')`.
  (12) `Log in instead` — the inline link **inside the email field error**, after a 409 `email_taken`
  → `switchToLogin()`, keeping the typed email. Styled as `.acct-inline-link`: bare button, `#2f6bff`,
  underlined, `:focus-visible` ring. (13) typing → `clearField(field)`.
  Keyboard: the only tab stops are back → the 5 controls → the toggle → the 2 legal links → the 2
  checkboxes → submit → the providers → the mode switch; there is no Escape and no shortcut, and the
  aside is outside the tab order (`aria-hidden`). Unchanged.
- **States:** *Empty* — the mount state; no autofocus today and **none added** (its siblings
  `App.tsx:7521/8014` do autofocus, so this is an inconsistency a redesign gets blamed for either way
  — listed under needs-approval rather than changed silently). *Loading* — submit disabled with
  `Creating your workspace…` (`opacity .65`, `not-allowed`) + `.acct-busy-rail`; the provider block is
  simply **absent** until `/api/auth/oauth/status` answers (never a disabled sign-in button — the code
  comment is explicit and `App.test.tsx:48–53` asserts absence). *Error* — up to **five** simultaneous
  `role="alert"` field paragraphs from one client `validate()`, or exactly **one** from the server
  (which returns `issues[0]` and whose handler *replaces* the map); the page-level
  `.acct-error#account-error` banner for anything no field owns: network
  (`Could not reach the BuildFlow API: <reason>`), `Something went wrong. Please try again.`, the
  429 (`Too many attempts. Try again in <N seconds|N minutes>.` — signup is 10/hour per IP and the
  429 **pre-empts every field message**), the zod fallback `Check the form and try again.`, and the
  nine OAuth return strings (screen 5). The panel keeps its red pair and gains radius 12 and a
  `var(--bf-auth-prose)` cap so a variable-length `humanSeconds()` sentence wraps to a readable measure
  instead of the full 400px. *Add-on lock* — none.
- **Motion:** move 2′ on the submit pill, move 2 on the providers, move 3 on `.acct-back`; no lift (no
  cards here). Reveals on scroll: **no** — `acct-rise` once on `.acct-form-inner`, plus
  `acct-dot-pulse` on the eyebrow dot, the six 12s aside loops, `wx-blink`, and `WxTypewriter`'s
  350ms + 28–58ms/char (re-keyed on `mode`, so a mode switch retypes — frozen). Strength bars keep
  their `background .25s` transition (nulled by the `:1508` block). Skeleton: none (S0).
- **Tests touched:** `App.test.tsx:42` (heading, 4 labels, placeholder, `Create account`, the unchecked
  `I agree to the`, `Log in`, hash, providers absent) — **passes unchanged**; `:62` (provider gate,
  alert text, start-URL params) — **unchanged**; `:120` (the single `role="alert"`, no signup call) —
  **unchanged, and constrains the design** (no error summary); `:~132`, `:~420` (four plan CTAs) —
  **unchanged**; `appHarness.tsx:146 signUp()` — **unchanged**; `server/test/api.test.ts:41`, `:184`,
  `server/test/oauth.test.ts:102/110/139` — untouched (server).

---

## 2. Log in (login mode) — `#create-account`, `mode === "login"`

- **Today:** the same component and the same mounted node, with the name/company/hints/meter/terms
  removed, a `Forgot password?` link added to the password label row, and a legal footnote below.
- **Becomes:** the same stack as screen 1, minus what login does not render. The one new structural
  detail: `.acct-label-row` (label left, `Forgot password?` right, baseline-aligned) gets the eyebrow
  treatment on neither side — the label stays `13px/600` and the link takes the *link* role
  (`#2f6bff`, `12.5px/600`). This screen is the **single most test-load-bearing screen in the product**:
  `appHarness.enterDashboard()` drives it directly and is referenced 79 times across 6 files.
- **Every information item placed (14 of 14):** (1) `← Back to BuildFlow`; (2) brand lockup;
  (3) eyebrow chip `Launching September 21st`; (4) `h1` `Welcome back.` **[Tier 1 frozen]**;
  (5) lede `Sign in to your production workspace.`; (6) label `Email` **[Tier 1 frozen — NOT
  "Work email"]**; (7) label `Password` + `Forgot password?` in the same `.acct-label-row`;
  (8) `Keep me signed in for 30 days`; (9) divider `or continue with` + providers; (10) mode switch
  `New to BuildFlow? ` + `Create an account` **[Tier 1 frozen]**; (11) the login-only legal footnote
  `By continuing, you agree to the Terms & Conditions and Privacy Policy.` → `.acct-legal`, `12.5px`,
  `#8a877e`, links `#575550`, prose-capped **(note: the record's forgot-mode entry wrongly lists this
  as not-rendered in forgot; it is gated on `!isSignup`, so it renders in BOTH login and forgot —
  placed again on screen 3)**; (12) submit `Sign in` / `Signing in…` **[Tier 1 frozen]**; (13) the
  aside, with its own typewriter line `Welcome back to your ` + em `command center.` and the shared
  cite; (14) the explicit **not-rendered** set — name, company, company hint, personal-email hint,
  password hint, strength meter, terms checkbox — preserved as *not rendered* (no placeholder, no
  disabled field, no reserved space).
- **Every action placed (9 of 9):** back → `onBack`; submit → `apiLogin({email, password, remember})`
  → `EVENTS.login` → `enterAfterAuth()`; Enter submits; show/hide toggle; `Forgot password?` →
  `setMode('forgot')` + `setResetSent(false)` + clears errors; remember (default true; false ⇒ a
  browser-session cookie); `Google` / `Microsoft` → `startWithProvider(mode: 'login')` with **no terms
  gate** (the footnote covers it); `Create an account` → `setMode('signup')`; the footnote's two
  anchors → `#terms` / `#privacy`.
- **States:** *Loading* — `Signing in…` disabled + `.acct-busy-rail`; providers absent until status
  resolves. *Error* — all page-level, all in the one `.acct-error`: `Incorrect email or password.`
  (**deliberately not attributed to a field — a redesign that forces every error under an input would
  leak which half was wrong; this constraint is written into the ledger**); the lockout
  `Too many sign-in attempts. Try again in <N>, or reset your password.` (screen 30); the IP cap
  30/15min; `Enter your email and password.` (400); `Account workspace is missing.` (500); the network
  strings; and the deliberate one — a valid login whose `loadWorkspace()` fails rethrows into
  `submit()`'s catch and **the person stays on this form with the reason inline** (`App.tsx:2524`).
  Per-field: `Enter your email address.` / `Enter a valid email address.` / `Enter your password.`
  *Empty* — mount state. *Add-on lock* — none.
- **Motion:** identical to screen 1 minus the meter transition; `WxTypewriter` re-keys on `mode` and
  retypes. No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:101` (heading `Welcome back.`, button `Sign in`, `Your name`
  absent, then back to `Create your workspace.`) — **unchanged**; `:62` login half —
  **unchanged**; `appHarness.tsx:91–99 enterDashboard()` and `:103 openCreateAccount()` —
  **unchanged, and the reason every string above is frozen**; `server/test/api.test.ts:184` — server.

---

## 3. Forgot password — request form (`mode === "forgot"`)

- **Today:** the same node again, reduced to one email field and one CTA, with the eyebrow chip and
  the signup-mode aside copy still in place.
- **Becomes:** the shortest form in the funnel and the one that most benefits from the tail: back →
  brand → eyebrow → `h1` → lede → one 48px field → submit → mode switch, 72px of air below. Same
  atoms, same register.
- **Every information item placed (10 of 10):** (1) `← Back to BuildFlow`; (2) brand lockup +
  (3) eyebrow chip `Launching September 21st` (unchanged in this mode); (4) `h1`
  `Reset your password.`; (5) lede `Enter your email and we'll send a link to choose a new one.`;
  (6) the email label — **renders `Email`** (`isSignup` is false), placed as the mode-dependent label
  and flagged in the ledger; (7) submit `Send reset link` / `Sending…`; (8) mode switch
  `Remembered it? ` + `Back to sign in`; (9) the not-rendered set (password field, toggle, meter,
  terms, remember, divider, providers) — preserved as not-rendered, **with the record's correction
  applied: `.acct-legal` DOES render here** (`!isSignup`), so the footnote from screen 2 is placed on
  this screen too; (10) the aside's copy mismatch — it still types the **signup** line
  `Where crews, projects, and schedules run as one.` because the copy branches on `isSignup` only.
  **Preserved exactly as-is, and flagged**: fixing it is a copy change (needs-approval), and *not*
  flagging it means the redesign gets blamed for introducing it.
  Also placed: the personal-email hint is gated on `isSignup` and so never appears here — preserved.
- **Every action placed (5 of 5):** back → `onBack`; submit →
  `apiRequestPasswordReset(email.trim())` → `setResetSent(true)`; Enter submits;
  `Back to sign in` → `setMode('login')` (the toggle reads `mode === "login" ? "signup" : "login"`, so
  from forgot it always lands on login) + `setResetSent(false)`; typing → `clearField('email')`.
- **States:** *Loading* — `Sending…` disabled + rail. *Error* — per-field
  `Enter the email you signed up with.` (empty) / `Enter a valid email address.` (malformed, validated
  inline in `submit()`); page-level for a thrown request, else
  `Something went wrong. Please try again.`; the 429 `Too many attempts. Try again in <N>.` (5/15min
  per IP). **Two behaviours preserved verbatim:** there is deliberately **no** "no such account"
  error (the route always answers 200, so existence is never revealed); and forgot mode's catch is
  `setError(err.message)` with **no field routing**, so even the server's `field: "email"` 400 lands in
  the page-level banner. Both are rendered faithfully. *Empty* — mount. *Add-on lock* — none.
- **Motion:** `acct-rise` does **not** replay on the mode switch (the same node re-renders) —
  preserved, and it is why the mode switch needs no new motion. Dot pulse, aside loops and the
  re-keyed typewriter continue. No reveal, no skeleton.
- **Tests touched:** **none exist** — no client test hits forgot mode. `server/test/api.test.ts:135`
  covers the endpoint. Nothing to update; everything above is Tier 3, recorded only here.

---

## 4. Forgot password — link sent (`mode === "forgot"`, `resetSent === true`)

- **Today:** the request form with a green `.acct-success` panel added and **the submit button removed
  from the DOM entirely**; the email input stays visible and editable with no way to resend.
- **Becomes:** the same, with the success panel promoted to the screen's primary object: `.acct-success`
  keeps its green pair, radius 12, `13.5px`, and gains a `var(--bf-auth-prose)` cap so the sentence
  wraps at 52ch instead of the column width; the bolded email inside it keeps `#143f2b`. Because the
  submit is gone, the 72px tail now sits directly under the panel, which is the one place in the funnel
  where Welcome-scale air actually reads as intentional.
- **Every information item placed (4 of 4):** (1) the panel
  `If there's a BuildFlow account for <b>{email}</b>, a reset link is on its way. It works for one
  hour.` → `.acct-success` `role="status"`, prose-capped, the `<b>` unchanged; (2) the `h1` stays
  `Reset your password.` and the lede stays `Enter your email and we'll send a link to choose a new
  one.` — **both preserved unchanged, including the fact that they do not become a success headline**;
  (3) the email input remains visible **and editable** above the panel; (4) mode switch
  `Remembered it? ` + `Back to sign in`.
- **Every action placed (4 of 4):** (1) the submit button is **removed** in this state
  (`!(mode === "forgot" && resetSent)`) — no resend affordance, and editing the email does not bring it
  back because `resetSent` clears only on a mode switch. **Reproduced exactly**, and flagged for
  approval rather than "fixed"; (2) `Back to sign in` → `setMode('login')` + `setResetSent(false)`;
  (3) `← Back to BuildFlow` → `onBack`; (4) the emailed link lands on `#reset-password?token=…`,
  a different component → screens 24–25.
- **States:** this **is** the terminal state. No loading. No error is reachable (the only submit path
  is gone). The silent per-email cap (3/hour, `limiter.hit('reset-email')`) still answers 200, so
  **this panel is shown even when no email was sent** — the copy is hedged (`If there's a BuildFlow
  account…`) but not for that reason. Preserved and flagged.
- **Motion:** `.acct-success` has **no entrance today**. It gains one: `acct-rise 0.55s` (the existing
  keyframe, no new name), because a panel that replaces a button should arrive rather than pop. Nulled
  by the `:1024` block via the `.acct-form-inner` list — extend that selector list, do not add a fourth
  block. Aside loops continue. No reveal, no skeleton.
- **Tests touched:** **none** (no client test asserts the reset-sent copy).

---

## 5. Provider sign-in return — error banner (`?oauth=error&reason=…`)

- **Today:** the `URLSearchParams` effect (deps `[]`, so mount-only) maps eight reasons to eight
  sentences in the page-level `.acct-error`, forces signup mode for `no_account`, and scrubs the query
  with `replaceState`.
- **Becomes:** presentation-only. The banner is the same `.acct-error` (red pair, radius 12,
  `13px/600`) now capped at `var(--bf-auth-prose)` and placed **above the submit button** exactly where
  it is today. Because `oauthFail` always appends `#create-account` (`app.ts:849`), the view is forced
  by the redirect — the record's own correction — so no routing changes.
- **Every information item placed (9 of 9):** the eight mapped strings, verbatim and unreworded —
  `cancelled` → `Sign-in was cancelled. You can try again or use your email.`; `no_account` →
  `There's no BuildFlow account for that email yet. Create one below, or sign in with a different
  address.`; `email_unverified` → `That provider hasn't confirmed the email on the account. Use an
  address they have verified, or sign up with your email.`; `terms_required` → `Please agree to the
  Terms & Conditions and Privacy Policy before continuing with a provider.`; `not_configured` →
  `That sign-in option isn't set up yet. Use your email for now.`; `state_missing` / `state_mismatch`
  → `That sign-in took too long or the browser lost track of it. Please try again.`;
  `exchange_failed` → `The provider didn't complete sign-in. Please try again or use your email.`;
  plus the unknown fallback `Sign-in with that provider didn't complete. Please try again or use your
  email.` — and (9) all of them render in the one `role="alert"` banner. **Also placed, from the
  record's completeness block:** the three server reasons the client never maps — `unknown_provider`,
  `provider_error`, `workspace_missing` — which silently take the fallback string. Named here so the
  next person knows the fallback is load-bearing, not decorative.
- **Every action placed (4 of 4):** (1) the effect's
  `history.replaceState(null, '', pathname + hash)` scrub; (2) `no_account` additionally switches to
  signup mode; (3) any keystroke → `clearField` → the banner is dismissed; (4) retry the provider or
  fall back to the email form.
- **States:** this **is** the error surface. No loading, no empty, no lock.
- **Motion:** none of its own — the banner appears in place and `acct-rise` has already played.
  It does **not** get an entrance: the alert must be present at first paint for `role="alert"` to be
  announced on mount, and animating it in risks a screen reader reading a mid-transition node.
  Stated deliberately.
- **Tests touched:** `server/test/oauth.test.ts:139` (produces the reasons) and `:104`
  (`oauth=error&reason=not_configured`) — server-side, **unchanged**. No client test asserts this copy;
  it is Tier 3.

---

## 6. Provider sign-in return — success (`?oauth=login`, `?oauth=signup#business-type`)

- **Today:** **not a component state at all** — handled in `App.runBootstrap` (`App.tsx:2385–2397`),
  which is why a component-scoped inventory missed it. `oauth=login` scrubs the query then calls
  `enterAfterAuth()`; `oauth=signup` scrubs it and lets the server-appended `#business-type` hash drive
  onboarding, bypassing the `onboardingCompletedAt` branch entirely. What renders during it is
  whichever auth screen the URL resolves to, with no signal.
- **Becomes:** the same routing, unchanged, plus the one thing it lacks — a visible in-flight state.
  Because the return trip lands on `#create-account` (login) or `#business-type` (signup) *before*
  bootstrap resolves, both screens paint fully and then swap. `data-busy` is set from
  `runBootstrap`'s in-flight flag on those two mounts, so `.acct-busy-rail` runs across the top of the
  form column and the swap reads as a step rather than a flicker. No copy, no new node, no role.
- **Every information item placed:** the record lists none for this state (it is a routing state).
  Placed from its description: the two exact redirects `http://localhost:5432/?oauth=signup#business-type`
  and `http://localhost:5432/?oauth=login` (pinned by `oauth.test.ts:110`) are **URL contracts, not
  UI** — nothing in this mapping touches `safeReturnTo`, the scrub, or the hash.
- **Every action placed:** (1) the App-level `history.replaceState(pathname + hash)` scrub — distinct
  from screen 5's component-level scrub; (2) `void enterAfterAuth().catch(() => undefined)` for
  `oauth=login`; (3) `safeReturnTo` allow-listing (`app.ts:858`) silently rewriting an unexpected
  origin — untouched, and named so nobody "improves" it (`oauth.test.ts:152` pins that
  `https://evil.example` never reaches the cookie).
- **States:** *Loading* — the rail (new). *Error* — a failure here becomes screen 5's banner.
  **Also placed: provider signup never asks for a company** — the org name is derived from the email
  domain, or `<First>'s Company` for a personal domain (`app.ts:963–972`). That contradicts the
  company field's promise (`This becomes your workspace name`) sitting immediately above the provider
  buttons on screen 1. The redesign **must not group them tighter**, which is the one layout
  consequence of this state: the divider + provider block keeps its full `var(--bf-rhythm-dense)`
  separation from the fields above it.
- **Motion:** the rail only. No reveal, no skeleton.
- **Tests touched:** `server/test/oauth.test.ts:110/135/152` — server, **unchanged**.

---

## 7. Post-auth workspace load (in-flight) — the state the record corrects

- **Today:** the record's `loadingStates` claim ("the loading screen replaces the auth page") is
  **wrong, and the correction is load-bearing for this mapping**: `page` starts `"welcome"` and
  `if (page === "welcome")` returns at `App.tsx:2748`, *before* the `if (isLoading)` gate at `:2766`,
  and `enterAfterAuth`'s `finally` clears `isLoading` before it routes. So **the auth form stays on
  screen for the entire workspace load**, with a disabled `Creating your workspace…` /
  `Signing in…` / `Joining…` / `Saving…` / `Opening…` button as the only feedback — through
  `retryTransient(loadBootstrap)` with `[400, 900, 1600]ms` backoff, i.e. up to four requests and
  several seconds.
- **Becomes:** the honest version of exactly that. The form stays (it must — see S0), keeps its frozen
  busy copy, and gains `.acct-busy-rail`. Nothing else changes: no overlay, no skeleton, no spinner
  glyph (the funnel has none anywhere and adding one to a single screen would be a fifth motion
  vocabulary).
- **Every information item placed:** the busy copy of all six submit buttons, each frozen and placed
  on its own screen (1, 2, 18, 21, 24, 27).
- **Every action placed (2):** (1) `retryTransient`'s automatic retry — 3 attempts,
  `[400, 900, 1600]ms`, only on 5xx or "could not reach"; (2) the 401 branch's automatic
  `apiDemoLogin()` + retry.
- **States:** the **signup → demo-fallback bounce**, placed as its own state because nothing else
  records it: if the post-signup bootstrap answers 401, `loadWorkspace` silently demo-logs-in and
  retries, `demoFallback.current = true`, the onboarding guard sees `session.demo` and calls
  `showCreateAccountPage()` — **the new owner is dumped back on the signup form with no error and no
  explanation.** Two consequences for this mapping: (a) the rail must stop when the bounce happens, or
  the signup form paints with a running progress bar and no reason — so `data-busy` is cleared on the
  guard's redirect path; (b) an explanatory line here would be **new copy** and is therefore listed
  under needs-approval, not added. Also placed: `initialMode` is read **once**
  (`useState(initialMode)`), so a bounce "to create-account" on an already-mounted component **lands on
  whatever mode was showing** — preserved, flagged, not fixed.
- **Motion:** the rail (nulled under reduced motion to a static 50%-opacity accent line). No reveal,
  no skeleton.
- **Tests touched:** `App.test.tsx:1085` exercises the transient-failure path (preserve's inventory
  records it) — **unchanged**, since the rail is a `::before` with no role or text.

---

## 8. Provider row — four layouts, not one

- **Today:** four distinct visual states that the record only mentions in passing: **neither**
  configured (no divider, no buttons — what the tests assert), **google only** and **microsoft only**
  (`.acct-providers-single`, one full-width pill), and **both** (a 2-up grid, `1fr 1fr`, 10px gap).
- **Becomes:** all four preserved, on the invert grammar. `.acct-provider` goes to a 46px outline pill
  (`999px`, `1px rgba(28,28,26,0.13)`, transparent, ink, weight 600 — already the parity block's
  recipe) and **inverts** to `#1c1c1a` / `#fdfcf9` on hover (move 2). `.acct-providers-single` keeps its
  single full-width pill. The neither-configured state keeps the entire divider + block **absent from
  the DOM** — never disabled, never a skeleton, per the code comment *"a disabled sign-in button costs
  trust"* and `App.test.tsx:48–53`.
- **Every information item placed:** the two labels `Google` / `Microsoft`; the `.acct-google-mark`
  (`G`, `#4285f4`, weight 800, 15px) and `.acct-ms-mark` (four 7px squares `#f25022` / `#7fba00` /
  `#00a4ef` / `#ffb900` in a 2×2 grid, 2px gap), **both inside `aria-hidden` spans, both keeping their
  brand colours** — a third-party brand mark is not this product's accent and is exempt from the
  accent budget by definition; the divider label `or continue with`.
- **Every action placed:** `startWithProvider(provider)` → `window.location.assign(apiOauthStartUrl(…))`
  with `mode`, `remember=0|1`, `terms=1`, `returnTo=<origin>`; terms-gated in signup, ungated in login.
- **States:** *Loading* — absent, not disabled (the whole point). *Error* — screen 5.
- **Motion:** move 2 on hover; `:focus-visible` gains the accent ring (it has none today). No entrance
  of its own — the block appears when the status fetch resolves, and **it must not animate in**: an
  entrance on an async-mounted pair of buttons reads as a layout shift, and the 400px column has no
  reserved space for it.
- **Tests touched:** `App.test.tsx:48–53` (absence) and `:62` (the start URL) — **unchanged**;
  `oauth.test.ts:102/104` — server.

---

## 9. Password strength meter — five states, one CSS block, three screens

- **Today:** four 5px segment pills (`aria-hidden`, radius 999, 4-col grid, 4px gap, track `#e6e8ec`,
  `background .25s`) plus an `aria-live="polite"` label row reading `Password strength` and a bold
  verdict. Rendered on **three** screens (signup, reset-password, accept-invite) whenever
  `password.length > 0`. `data-score` drives the fills: `1` → `#d96570`, `2` → `#e0a23c` ×2, `3` →
  `#2f9e6b` ×3, `4` → `#1f8a58` ×4; the `<b>` recolours `#b4404b` / `#a8721b` / `#1f8a58`.
- **Becomes:** the same block, on the ladder, with the missing state added. Bars stay 5px/999px (a
  meter is not a card); the track goes to `rgba(28,28,26,0.09)`; the label row goes to
  `11.5px/650/0.045em` uppercase `#8a877e` for the words `Password strength` (**the eyebrow role — this
  is a stat label, exactly the Welcome Page's use**) with the verdict `<b>` staying `12px/600` in its
  score colour so the one piece of information keeps the one piece of colour. The four ramp colours are
  **not** re-based (§0.4).
- **Every information item placed (5 states of 5):** `data-score="0"` → **four grey bars with the
  label `Too weak`** — reachable at 1–3 characters and **the only state where the bar and the verdict
  disagree, because there is no `[data-score="0"]` rule at all today**. Fix, 3 lines:
  `.acct-strength[data-score="0"] .acct-strength-bar span:first-child { background: #d96570 }` so one
  pill lights in the weakest colour and the bar agrees with the word. `1` → one `#d96570`; `2` → two
  `#e0a23c`; `3` → three `#2f9e6b`; `4` → four `#1f8a58`. All five verdict strings
  (`Too weak` / `Weak` / `Fair` / `Strong` / `Very strong`) frozen, and the pinning rule preserved: any
  policy problem forces score 0 (len<4) or 1 with the label `Too weak`.
- **Every action placed:** none — it is a derived display. Its inputs: `passwordStrength(password)` on
  signup and accept (with the email) and **without the email on reset** (`App.tsx:7454/7460`), so on
  the reset screen the client meter is blind to the "don't use your email" rule and only the server can
  catch it. Preserved exactly, and named so nobody "unifies" the call signature and changes what the
  server answers.
- **States:** not rendered at all at `length === 0` (only the `.acct-hint` shows). The bars keep
  `aria-hidden="true"`; the `aria-live="polite"` label is the only announced signal.
- **Motion:** `background .25s ease` per segment — the only transition, and it is nulled by the
  **third** reduced-motion block (`:1508–1513`), which must be extended in place, not merged.
  No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:120` asserts the shared string
  `Password must be at least 8 characters.` through a **singular** `role="alert"` — the meter is
  `aria-hidden` and adds no alert, so **unchanged**. No test asserts any meter visual; the five states
  above are Tier 3.

---

## 10. Business type — step 1, no trade chosen (initial state) — `#business-type`

- **Today:** the **wide** split. A 640px form column holding back → brand → `h1` → lede → a
  `role="radiogroup"` of 14 trade cards in a 2-column grid → the submit. No eyebrow, no step
  indicator. The aside adds a fifth block: the `.acct-preview` glass panel, whose empty state explains
  what a trade buys. Every test that reaches the app walks this screen.
- **Becomes:** the same DOM in the auth register. The 640px column: `.acct-back` → `.acct-brand` →
  `h1` at `var(--bf-auth-title)` capped 24ch → lede at 46ch → `var(--bf-rhythm-dense)` →
  the 14-card grid (`.acct-pick-grid.acct-trade-grid`, 2 cols, 10px gap frozen) → `var(--bf-rhythm-dense)`
  → submit → **72px tail** (this is the screen the tail was added for: the column is the scroller and
  today the last card and the button sit against the bottom edge). Each card: `1px rgba(28,28,26,0.13)`,
  **radius 18** (the paper-card rung — a 300×62px card at 18px reads as a sheet, at 13px as a widget),
  `#fff`, `13px 14px` padding frozen, a 36×36 tone tile at **radius 12**, `.acct-pick-copy strong` at
  `13.5px/650`, `em` at `12px/500/#8a877e`, a 20px check circle at `1px rgba(28,28,26,0.13)`.
  Selected: `1px #2f6bff` + `rgba(47,107,255,0.06)` fill + `0 0 0 3px rgba(47,107,255,0.12)` ring +
  filled blue check + **the icon tile flips to ink `#1c1c1a on #fdfcf9`** (frozen — it is what keeps
  the accent budget at one). Shared components: chassis (S0), `AcctScheduleViz`, `WxTypewriter`,
  `AuthStage`.
- **Every information item placed (30 of 30):**
  1. The layout — `<main className="acct-split acct-split-wide" id="business-type"
     aria-labelledby="business-type-title">`, nav and footer suppressed, no breadcrumb. Frozen (S0).
  2. `← Back to account details` → `.acct-back` (its own literal arrow glyph inside the string,
     untouched; the arrow slides `-3px` on hover via `translateX` on the button's text? **No** — because
     the glyph is *inside the string*, the slide is applied to the whole button label, not a child.
     Stated so nobody wraps the glyph in a span, which would change the accessible name).
  3. Brand lockup → `.acct-brand`.
  4. `h1#business-type-title` `What type of Business do you own` — **no question mark, mid-sentence
     capital B. Tier 1 frozen.**
  5. Lede `Pick your trade — BuildFlow sets up crews, phases, readiness checks and its AI around it.`
     → 46ch.
  6. **No eyebrow chip and no step indicator on this step** → preserved as an absence. The eyebrow
     appears only on step 2, so the two steps genuinely look like different products; adding an
     indicator is **new copy and a new heading candidate** (`findByRole("heading")` collision risk) and
     is listed under needs-approval, not added. Note the CSS's own numbering disagrees with everyone:
     `account-redesign.css:1517` calls the plan step "registration step 3", `:1547` forgot/verify
     "step 4", `:1626` invites "step 5" — i.e. create-account is step 1 and this is step 2. Any future
     indicator must reconcile with that, not with the records' "step 1 / step 2".
  7. The `div role="radiogroup" aria-label="Business type"` wrapper → unchanged. **Tier 1 frozen.**
  8–21. **All 14 trade cards**, each keeping its label, its tagline, its 18px lucide icon in a 36×36
     tone tile and its 20px check bubble: `Asphalt` / *Paving, milling and overlays* / road / orange ·
     `Concrete` / *Foundations, slabs and structure* / concrete / blue · `Roofing` / *Tear-off, dry-in
     and membrane* / roof / teal · `General Contractor` / *Coordinating every trade on site* / gc /
     blue · `Excavation` / *Mass earthwork, trenching and haul-off* / excavation / orange ·
     `Utilities` / *Water, storm, sewer and ductbank* / utilities / teal · `Framing` / *Walls, floors,
     shear and hardware* / framing / orange · `Electrical` / *Rough-in, gear and energize* /
     electrical / violet · `Plumbing` / *Underground, top-out and fixtures* / plumbing / blue ·
     `HVAC` / *Duct, equipment set and startup* / hvac / teal · `Masonry` / *Block, brick, grout and
     scaffold* / masonry / orange · `Drywall` / *Stud, hang, tape and finish* / drywall / violet ·
     `Landscaping` / *Grading, irrigation and planting* / landscaping / green · `Painting` /
     *Prep, prime and coats* / painting / violet.
     **The tagline's clipping is preserved and is a hard constraint on the type scale:**
     `.acct-trade-grid .acct-pick-copy em` is `white-space: nowrap` + `text-overflow: ellipsis`, so
     *any* increase in the tagline's font size silently truncates more taglines. This is the single
     concrete reason `--bf-auth-*` freezes `12px` for card body copy instead of re-scaling it — and it
     is worth stating that the longest tagline (`Mass earthwork, trenching and haul-off`, 38 chars) at
     12px in a ~230px copy slot is already at the edge.
  22. The full option order (`businessTypeOptions`) → unchanged; the grid is source-ordered, no
      re-sorting, no grouping.
  23. The icon mapping (`TRADE_ICONS`: road=Construction, concrete=Layers, roof=Warehouse, gc=HardHat,
      excavation=Shovel, utilities=Droplets, framing=Hammer, electrical=Zap, plumbing=Wrench, hvac=Fan,
      masonry=BrickWall, drywall=Building2, landscaping=Trees, painting=Paintbrush) → unchanged.
      **Memory hazard restated in the new stylesheet's header:** lucide names shadow globals in
      `App.tsx`, and an unimported `TRADE_ICONS` glyph renders `<undefined/>` and blanks `#root` with
      no console error.
  24. Submit `Get BuildFlow` (no trailing icon on this step) → the ink pill. **Tier 1 frozen**, and
      the missing `ArrowRight` is preserved: this step's button must **not** gain the icon, or move 3
      appears on a step where the next action is not "forward through a purchase".
  25. The aside as a whole (`aria-hidden="true"`) → the dark product window.
  26. The `AcctScheduleViz` card content — green pulsing live dot, `Live schedule`, right-aligned
      `Mon — Fri`, four lanes `Framing` / `Concrete` / `Electrical` / `Roofing`, 8 bars with inline
      `left`/`width` %, per-bar delays 0.2–2.65s, the `fix: true` second Electrical bar → §0.4 palette,
      geometry frozen.
  27. Typewriter, unselected (`key="empty"`): `Production scheduling for ` + em `every trade.` →
      `var(--bf-auth-quote)`, 15ch, em in `--bf-win-blue`.
  28. Cite `Run the whole jobsite from one place.` → `14px`, `--bf-win-mut`.
  29. Preview title `Your workspace will include` → **the eyebrow role at x1**: `11.5px/650/0.045em`
      uppercase, `--bf-win-mut` (from `11px/700/0.12em` — the tracking comes back to the ladder).
  30. Preview empty copy `Choose a trade and BuildFlow shapes its crews, production phases, readiness
      checks, delayIQ categories and AI around how that business actually runs.` →
      `.acct-preview-empty`, `13px/1.5`, `--bf-win-mut`, capped at `var(--bf-auth-prose)`.
- **Every information item placed — the 5 form inputs:** the 14 `<input type="radio"
  name="business-type">` (value = the `BusinessTypeId`), visually hidden but focusable
  (`position:absolute; opacity:0; 1px; pointer-events:none` — frozen), **accessible name from
  `aria-labelledby="business-type-<slug>-label"` = the trade name ALONE, tagline on
  `aria-describedby="…-desc"`** (Tier 1 frozen; the slug rule `toLowerCase().replace(/[^a-z0-9]+/g,'-')`
  keeps `general-contractor`); the JS-only "exactly one checked" rule; the message
  `Choose your trade to continue.`; the clear-on-change behaviour; and the absence of any text field,
  select, search or filter over the 14 — preserved (adding a filter is a feature change).
- **Every action placed (6 of 6):** (1) `← Back to account details` → `showCreateAccountPage()`, which
  **does not log the new owner out** and lands them on the signup form — preserved and flagged;
  (2) clicking any card (the whole `<label>` is the hit area) → `setBusinessType` + clears the error +
  re-keys the typewriter and the preview; (3) keyboard — native radiogroup semantics: Tab reaches the
  checked radio (or the first), arrows move **and select**, Space selects; no custom `onKeyDown`
  (frozen), and the visible focus affordance moves from `:focus-within` to
  `:has(input:focus-visible)` (S0) so a mouse click no longer leaves a ring that mimics `.selected`;
  (4) submit `Get BuildFlow` → `isBusinessTypeId` guard → `handleBusinessTypeSelected` →
  `track(tradeChosen)` → `setPendingBusinessType` → `showAdditionalProductsPage()`; Enter does the same;
  (5) **nothing is persisted or POSTed on this step** — preserved (so no "saving" state may be added);
  (6) no Skip, no "do this later", no logout, no help link, no OAuth — preserved as absences.
- **States:** *Empty* — the aside's empty-state copy (item 30) is the only empty state; the grid is
  never empty. *Loading* — **none visible, and none may be added**: the step renders synchronously and
  the only async work is the session guard (screen 16), which shows no spinner and can replace the page
  a beat later; a gate or spinner here would delay the render the tests `await`
  (`findByRole("heading", …)`). *Error* — `Choose your trade to continue.` in `.acct-error role="alert"`
  between the grid and the submit, with the radiogroup's `aria-describedby` pointing at
  `business-type-error` (this step wires it; step 2 does not — see screen 13); no network error exists
  on this step. *Add-on lock* — none.
- **Motion:** move 1 (lift, `-4px`) on all 14 cards; move 3 on `.acct-back`; move 2′ on the pill;
  move 4 on the aside card. Reveals on scroll: **no** — `acct-rise` on `.acct-form-inner` plus the
  per-card stagger `calc(0.26s + min(var(--i),8) * 0.045s)` (§0.6 — the cap is what brings 14 cards
  inside the entrance band), the check-bubble spring `cubic-bezier(0.34,1.56,0.64,1)` (frozen — it is
  the one licensed overshoot in the funnel and it belongs to a state change, not an entrance), the
  icon-tile `background/border .16s`, the preview rows' `calc(0.06s + var(--i)*0.06s)` stagger, the six
  12s aside loops, `wx-blink`. Skeleton: none (S0).
- **Tests touched:** `App.test.tsx:135` (heading, radiogroup name, **all 14 radios by trade name**,
  hash, then `Roofing` + `Get BuildFlow` → the products heading and hash) — **passes unchanged**;
  `appHarness.tsx:145 signUp()` tail and `:159 chooseBusinessType()` — **unchanged**; and by transitivity
  every suite that calls `completeOnboarding()` — **unchanged**. This is the screen where a careless
  accessible-name change costs the whole suite, which is why the invariant comment (§0.9) goes above
  the component even though this mapping never touches its JSX.

---

## 11. Business type — a trade is selected (live workspace preview)

- **Today:** the same screen answering the selection: the card locks in, the typewriter re-keys and
  retypes with the trade name, and the aside's `<dl>` re-keys and replays to list what the seeded
  workspace will contain.
- **Becomes:** the same, with the preview panel promoted to a proper dark-glass panel: `.acct-preview`
  keeps `rgba(255,255,255,0.08)` + `backdrop-filter: blur(14px)` + `var(--bf-win-line)`, radius
  `16 → 18`, and its own nested scroll area on ≥900px (frozen — see States). Chips lose their outline
  and keep their fill (§0.4's counted audit: **20 resting boundaries → 0**), staying `12px/600`,
  `999px`, `4px 10px`, `nowrap`, in `--bf-win-ink`.
  **Backdrop-filter licence:** the CANVAS graft restricts `backdrop-filter` in-app to the top bar
  because the tutorial spotlight draws a 9999px box-shadow scrim. This panel is licensed because it is
  a genuine dark-glass surface (the `.wx-mock` recipe), it sits inside an `aria-hidden` decorative
  aside, and there is **no `data-tutorial-id` and no `position: fixed` descendant anywhere in the
  funnel** — verified, not assumed.
- **Every information item placed (20 of 20):** (1) the selected card's treatment (screen 10);
  (2) the typewriter's selected line `Production scheduling tuned for ` + em `<trade lowercased>
  crews.` — including the raw-lowercase artefacts (`general contractor crews.`, `hvac crews.`),
  **preserved as-is**, since "fixing" the casing is a copy change; (3) preview title
  `Your workspace will include`; (4) the description = `TradeProfile.description`, `13.5px/1.5` in
  `--bf-win-ink` at `rgba(…,0.86)` → `--bf-win-ink`, prose-capped; (5) the four rows in their **fixed
  order** — `Crews` (all `crewTypes`), `Phases` (all `phases`), `Readiness checks`
  (`readinessChecks.slice(0,4)`), `DelayIQ categories` (`delayIQCategories.slice(0,4)`) — with the
  `dt` at `12px/600` `--bf-win-mut` and each `dd` a wrapped chip list; **the two truncations
  (`slice(0,4)` of 6) are preserved exactly** — showing all six would be a content change;
  (6–19) **all 14 per-trade payloads** (description + 5 crew chips + 6–8 phase chips + 4 readiness
  chips + 4 DelayIQ chips, for Asphalt, Concrete, Roofing, General Contractor, Excavation, Utilities,
  Framing, Electrical, Plumbing, HVAC, Masonry, Drywall, Landscaping, Painting) → the same chip list;
  no copy is touched, no list is re-ordered, nothing is summarised; (20) the fields the profile carries
  but the UI never surfaces — `materialUnits`, `weather.title` / `weather.rule`, `aiStarters`,
  `aiContext`, and readiness/delay items 5–6 → **preserved as absences**; surfacing them is a content
  change and is listed under needs-approval.
- **Every action placed (3 of 3):** (1) re-clicking another card switches the selection and re-keys
  both the typewriter and the `<dl>`; (2) `Get BuildFlow` → step 2; (3) `← Back to account details` →
  `#create-account`, and **the selection is not restored on return** (the page initialises
  `useState<BusinessTypeId|"">("")` and never reads `pendingBusinessType`) — preserved and flagged.
- **States:** *Error* — never shown in this mode (selection clears it). *Empty* — n/a. *Loading* —
  none. **The nested scroll state:** on ≥900px a tall trade turns `.acct-preview` into its own
  scroller (`overflow-y: auto`, `overscroll-behavior: contain`, a thin white scrollbar,
  `account-redesign.css:1359–1395`) and the aside top-aligns with the quote pushed down by
  `margin-top: auto`. **All of it frozen**, because it only appears for tall trades (General
  Contractor, Concrete) and is exactly the kind of thing a re-layout leaves clipped. The scrollbar
  colours re-base onto `--bf-win-mut`.
- **Motion:** typewriter replay on key change (350ms empty lead-in each time — the `.wx-type-ghost`
  layer holds the box so the panel does not reflow; **preserve the ghost**); the `<dl>`'s row stagger
  replay; the check spring; the tile colour transition. Move 1 on the cards, move 4 on the viz card.
  **`WxTypewriter` reads `prefers-reduced-motion` once per mount with no change listener** — recorded,
  and fixing it (a `matchMedia` change listener) is listed under needs-approval since it is a JS
  behaviour change. No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:146` (`getByRole("radio", {name: "Roofing"})`) — **unchanged**.
  **No test asserts any aside preview copy** (it is `aria-hidden`), which the record correctly calls
  the freest part of the screen to redesign — and is exactly why this mapping places all 14 payloads
  explicitly instead of trusting them to survive.

---

## 12. Business type — `hasWork` variant (re-tuning a populated workspace)

- **Today:** the same screen with two copy changes when `data.projects.length > 0`: the preview title
  becomes `What changes for your workspace` and a reassurance paragraph appears under the description.
- **Becomes:** identical treatment to screens 10–11; the note gets its own visual weight inside the
  glass panel — `.acct-preview-desc.acct-preview-note` keeps `13.5px/1.5` but sits on a
  `border-top: 1px solid var(--bf-win-line)` with `var(--bf-space-3)` above it, so a promise about
  destructive behaviour reads as a distinct statement rather than a second paragraph. That is a
  boundary licensed by clause 3 (state).
- **Every information item placed (4 of 4):** (1) the title swap `What changes for your workspace`
  (replacing `Your workspace will include`) — both strings kept; (2) the note `Your existing projects,
  crews and schedule stay exactly as they are. BuildFlow re-tunes its phases, readiness checks,
  DelayIQ categories and AI around <trade lowercased> work.`, prose-capped; (3) everything else (h1,
  lede, 14 cards, `Get BuildFlow`, the aside) identical; (4) the note renders **only** when a trade is
  selected *and* `hasWork` — so before a selection the promise is invisible. Preserved and flagged
  (moving it into the empty state is a copy change).
- **Every action placed (1 of 1):** identical to the default state.
- **States:** identical. **One state placed from the record's completeness block:** an anonymous
  visitor to `#business-type` gets a demo session from `loadWorkspace`'s 401 self-heal, so `data` is
  the *populated demo workspace* and `hasWork` is **true** — meaning this variant paints for a frame
  before the guard bounces them to `#create-account` (screen 16). The rail (§0.6) is what keeps that
  frame legible as a transition.
- **Motion:** identical.
- **Tests touched:** **none** — no client test covers `hasWork: true`; the server-side guarantee
  (`applyBusinessProfile` only seeds an *empty* workspace) is exercised in the store.

---

## 13. Additional products — step 2 (add-ons + plan + seats), initial state — `#additional-products`

- **Today:** the tallest screen in the funnel: a 640px column with three sectioned questions
  (4 add-on cards, 4 plan cards, a seats field), an eyebrow chip, a state-dependent submit and a
  footer hint. The column is the only scroller. The aside has no preview panel and is not re-keyed.
- **Becomes:** the same three sections, in the auth register, with the rhythm doing the work the
  section heads currently do alone. Column: back → brand → eyebrow pill → `h1` (24ch) → lede (46ch) →
  **`var(--bf-rhythm-dense)`** → §1 head + 4 cards → **`var(--bf-rhythm-dense)`** → §2 head + 4 plans
  → **`var(--bf-rhythm-dense)`** → §3 head + seats + total → error slot → submit → footer hint →
  **72px tail**. Section heads: `.acct-sec-head h2` at `17px/600/-0.01em/#1c1c1a` (from
  `15px/700/#070b12`) with the right-aligned hint at `11.5px/650/0.045em` uppercase `#8a877e` (the
  eyebrow role — `Choose one or more` / `Choose one` / `Every plan is priced per seat` are stat labels,
  and uppercasing them via CSS keeps the DOM strings byte-identical). `.acct-sec { gap: 10px }` frozen.
  Cards: the screen-10 recipe (1px hairline, radius 18, `-4px` lift). Plans: 4-col grid (10px gap
  frozen), radius 18, `.acct-plan-price` at `22px/700/-0.02em/tabular-nums/**ink**` and the priceNote
  at the eyebrow (so `Per User / Month` renders uppercase and the four blue prices become one accent
  budget of zero at rest), the absolute top-right check keeping its spring.
- **Every information item placed (26 of 26):**
  1. Layout — `.acct-split.acct-split-wide#additional-products`, nav/footer suppressed, `100dvh` pin,
     form column the only scroller. Frozen (S0).
  2. `← Back to business type` → `.acct-back`.
  3. Brand lockup.
  4. Eyebrow chip: pulsing dot + `Set up your workspace` → the pill, uppercased by CSS.
  5. `h1#additional-products-title` `What additional products do you want to use?` — **Tier 1 frozen.**
  6. Trade-aware lede — `BuildFlow for ${businessType}` or the fallback `Choose your BuildFlow setup`
     → both preserved (the fallback is screen 15's tell).
  7. §1 head `Additional products` + hint `Choose one or more`.
  8–11. The four add-on cards, each a real `<input type="checkbox">` inside a `<label>` whose full text
     is the accessible name: `Map & Field Ops` / *Track vehicles, equipment, and design traffic
     routes.* / lucide `Map` / tone-green · `Equipment Tracking` / *See equipment assignment, usage, and
     maintenance status.* / `Wrench` / tone-teal · `Time Cards` / *Log crew hours against jobs, then
     approve them for payroll and job costing.* / `Clock` / tone-blue · `AI` / *Spot conflicts, answer
     questions, and turn blockers into recovery suggestions.* / `Sparkles` / tone-violet (id
     `schedule-ai`, kept for back-compat). **Tier 1 frozen: the description must stay INSIDE the
     `<label>`** (that is what makes `findByLabelText(/Map & Field Ops/)` work) **and the control must
     stay a real checkbox** (`appHarness` reads `.checked` before clicking) — which rules out
     converting these cards into buttons, switches or `aria-pressed` tiles.
  12. `Only 4 add-ons exist here on purpose` — the base-product note from `shared/src/index.ts`
     (crew scheduling, projects, materials readiness, field updates & delayIQs and production reports
     ship in the base product) → preserved as an absence of choices, not surfaced as copy.
  13. **Prices are not shown here** even though `ADD_ON_CATALOG` carries them → preserved as an
     absence. The record's own correction applies: the real prices are **$12 / $9 / $8 / $15** per user
     per month (not $8/$8/$8/$15), and 3 of the 4 are *included* in Business and Enterprise, so the
     seat total only understates the bill on Free/Pro. Surfacing them is a copy + billing change →
     needs-approval.
  14. §2 head `What type of plan?` + hint `Choose one`.
  15–18. The four plan cards: `Free` / `$0`, `Pro` / `$20`, `Business` / `$48`, `Enterprise` /
     `Custom`, each with `Per User / Month`. `plan.detail` (`Demo of BuildFlow`) and
     `recommended: true` on Business are **not rendered here** → preserved as absences (no badge).
  19. No feature lists, no monthly/yearly toggle, no 20% yearly discount on this step → preserved.
  20. §3 head `How many people will use BuildFlow?` + hint `Every plan is priced per seat`.
  21. Seats label `Seats`, default **5** → **Tier 1 frozen** (`toHaveValue(5)`).
  22. Seat total, no plan yet: `Pick a plan to see your monthly total.` → `.acct-seats-total`,
     `aria-live="polite"`, `13px`, `#575550`, the `<b>` ink.
  23. Submit, nothing ticked: `Continue without add-ons` + `ArrowRight`, **disabled until a plan is
     chosen** → **Tier 1 frozen** (and the test asserts the *same button node* becomes enabled, so the
     button must not be re-mounted on state change).
  24. Footer hint `Add-ons are optional. You can turn any of them on later in Settings.` →
     `.acct-hint.acct-hint-center`, `12.5px/#8a877e`, prose-capped, centred.
  25. The aside — 3 auroras, `BuildFlow` lockup, the `Live schedule` card, typewriter
     `Pick the tools your ` + em `crews run on.`, cite `Run the whole jobsite from one place.`, and
     **no `.acct-preview` panel** (the aside is shorter here and is *not* re-keyed, so it types once) →
     preserved exactly, including the absence.
  26. No step indicator, no legal line, no tax line, no currency selector, no coupon field, no
     talk-to-sales link (even for Enterprise) → preserved as absences; each is a content change.
- **Every action placed (11 of 11):** (1) `← Back to business type` → `showBusinessTypePage()`
  (and on a first run the picks are lost both ways — flagged); (2) toggling a product card →
  `toggleProduct(id)`, multi-select, **click order is the POSTed order**; (3) clicking a plan
  (`<button type="button" aria-pressed aria-label="Select <Name> plan">`) → single-select, **no way to
  unselect** (preserved); (4) seats `onChange` → `Math.min(1000, Math.max(1, Math.round(Number(v) || 1)))`
  — clamped and rounded on every keystroke, so clearing snaps to 1 (preserved, including the
  consequence that the field can never be invalid); (5) submit → `submitProducts()` → `isProductPlanId`
  guard → `setIsSubmitting(true)` → `onContinue`; (6) `finishOnboarding` → `track(planChosen)` →
  `setPendingSetup` → `onCompleteOnboarding({… destinationPage: 'inviteTeam'})`; (7) `completeOnboarding`
  → `POST /api/business-profile` → `syncUserSettings` → `track(onboardingCompleted)` →
  `createTutorialSetupKey` → 6 state setters → 3 `localStorage` writes; (8) for pro/business:
  `apiFetchSession` + `apiStartCheckout` → screen 17; (9) otherwise `window.location.hash =
  '#invite-team'` + arm the tutorial; (10) Enter inside the seats input submits the form — **and the
  disabled default button is the only double-submit guard** (there is no `if (busy) return` inside
  `submitProducts`), so **the submit must stay a real disabled `<button type="submit">`**; (11) no
  Skip, no logout, no contact-sales, no help link → preserved.
  Also placed: the seats input's **native** interactions — Up/Down arrows and the spinner step by 1
  (`step={1}`), and `min`/`max` make it a constraint-validation target on implicit submit, which can
  never fail because `onChange` clamps first.
- **States:** *Empty* — `Pick a plan to see your monthly total.` plus the button label
  `Continue without add-ons` and the footer hint together are the "no add-ons is fine" signal; no add-on
  selected is a legitimate end state. *Loading* — `Building workspace...` (**literal three dots, not an
  ellipsis character — frozen**), the `ArrowRight` removed, the button disabled, **the rest of the form
  still interactive**, and `isSubmitting` **never reset on success** (deliberate: the page is navigated
  away from, possibly to Stripe). The button re-flows by ~18px+gap when the icon leaves and returns —
  fix that with `min-width` on the pill rather than by keeping a ghost icon, so the copy stays frozen.
  Plus `.acct-busy-rail`. *Error* — `Choose a BuildFlow plan to continue.` in
  `.acct-error role="alert" id="additional-products-error"` between §3 and the submit; **the id is
  wired to nothing** today (step 1 does wire its radiogroup) — adding `aria-describedby` on the plan
  radiogroup is a 1-attribute a11y repair listed under needs-approval, keeping `role="alert"` either
  way. Provisioning failures land in the same paragraph, and the record's correction is placed here:
  a 400 from `POST /api/business-profile` sends `{ error: <zod flatten object> }`, which `ApiError`
  stringifies, so **the alert can literally read `[object Object]`** for an unknown trade, >4 products,
  an unknown product id or seats outside 1..1000. The redesign renders it faithfully; making it
  readable is a server change and is flagged. Also placed: the 401 `Please sign in to continue.` and
  the 500 `Workspace unavailable.` from the ops gate, and the two network strings — all in the same
  slot. Stripe failures are **deliberately not** an error state (swallowed with a `console.warn`, the
  server has already started the trial). No limiter covers this route, so no 429 can reach it.
  *Add-on lock* — **none on this screen, and none may be added**: this is where the locks are
  *decided* (`ADD_ON_PAGE_LOCKS` gates `map` / `equipment` / `timecard` later, and `isAddOnUnlocked()`
  opens a page only if the add-on was ticked here or the plan includes it). A lock badge here would be
  new copy.
- **Motion:** move 1 on the 4 product cards and the 4 plans (`-4px`); move 2′ + move 3 on the pill
  (`ArrowRight` `translateX(3px)`, frozen); move 4 on the aside card. `acct-rise` on the inner; the
  product stagger `calc(0.26s + min(var(--i),8)*0.045s)` and the plan stagger
  `calc(0.4s + var(--i)*0.05s)` (4 cards, no cap needed) so plans still land after products; the two
  check springs; `acct-dot-pulse`; the six 12s loops; one-shot typewriter. No reveal. Skeleton: none —
  and note the aside is **not** re-keyed here, so unlike step 1 the panel never answers the user's
  selections; making it answer is a content change and is listed under needs-approval.
- **Tests touched:** `App.test.tsx:150/151` (heading + hash) — **unchanged**; `:153` (the free-text
  `Map & Field Ops` and its description, the four `Select <Plan> plan` **buttons**, the disabled
  `Continue without add-ons`, `Seats` = 5, the same node enabling, `/\$240 \/ month/`, the relabel to
  `Continue to BuildFlow`) — **unchanged, and it is the reason the plan cards keep `role="button"`**;
  `:180` (the byte-for-byte POST body and key order, the three `localStorage` keys) — **unchanged**
  (nothing in this mapping touches the request); `:228` (the tutorial dialog copy derived from these
  picks) — **unchanged**; `appHarness.tsx:167 chooseProductsAndPlan()` — **unchanged**;
  `tests/tutorial.test.tsx:112/136/155/183` — **unchanged**.

---

## 14. Additional products — plan selected (the four seat-total copy modes)

- **Today:** one `aria-live="polite"` paragraph with four copy modes, plus the selected-card treatment
  and the submit relabel.
- **Becomes:** the total becomes the screen's one figure: `.acct-seats-total` keeps `13px` for the
  sentence and its `<b>` goes to `var(--bf-auth-figure)` `22px/700/-0.02em` with `tabular-nums`, ink,
  on the same baseline grid as the plan prices — so the money reads as a figure and the sentence around
  it reads as a lede. `.acct-seats` keeps its `grid 140px 1fr` / `align-items: end` (frozen) and its
  ≤560px single-column collapse.
- **Every information item placed (8 of 8):** (1) Mode A `Pick a plan to see your monthly total.`;
  (2) Mode B `<b>$0 / month</b> — Free for the whole team.` (em dash, the `<b>` inside the live
  region); (3) Mode C `<b>${total} / month</b> for {seats} {seat|seats} on {plan.name}. Starts with a
  14-day trial; nothing is charged today.` — including `toLocaleString('en-US')` separators
  (`$48,000 / month`) and **the frozen `$240 / month` spacing**; (4) Mode D
  `<b>Custom pricing</b> — sales will size Enterprise for {seats} {seat|seats}.` (the plan name is
  hard-coded `Enterprise` in this branch — preserved); (5) the singular/plural switch at
  `seats === 1`; (6) the selected plan card — blue border/fill + ring + filled top-right check;
  (7) the selected product cards + the submit relabel to `Continue to BuildFlow`; (8) the 14-day trial
  promise, honoured server-side by `recordWorkspaceSetup` (stamps `trialEndsAt` for pro/business,
  deletes it for free/enterprise) → unchanged.
  **Also placed, unreworded:** the Free plan's self-conflict — the card says `$0` / `Per User / Month`
  while the total says `$0 / month — Free for the whole team.` Both strings stay; reconciling them is a
  copy change.
- **Every action placed (3 of 3):** (1) changing seats live-updates the total inside the live region
  — **and because `onChange` clamps on every keystroke, every character re-announces**; the redesign
  changes nothing here, and a debounce would be a behaviour change (flagged); (2) switching plans
  swaps the copy mode; (3) un-ticking every add-on reverts the label to `Continue without add-ons`
  while staying enabled.
- **States:** no error, no empty, no loading of its own.
- **Motion:** **no transition on the total** — a text swap (preserved: cross-fading a live region's
  content is how you get a screen reader to read half a sentence). The figure's size change does not
  animate. Move 1 on the cards; the check spring on selection.
- **Tests touched:** `App.test.tsx:175` (`/\$240 \/ month/`) and `:170` (`Seats` = 5) —
  **both pass unchanged**; the `<b>` size change does not affect `getByText`.

---

## 15. Additional products — submitting, failed submit, no-trade entry, and pre-filled re-entry

Four states the record's completeness block adds, grouped because they share one screen and one fix.

- **Today:** (a) *submitting* — covered in screen 13. (b) *after a failed submit* — the red alert
  shows, `isSubmitting` is back to false, and the button label has been recomputed, so **the failure
  state is visually identical to the initial state plus one alert**, with nothing marking what was
  sent. (c) *entered with no trade* (`businessType === ""`, reachable by bookmark, Back/Forward or a
  reload) — the lede falls back to `Choose your BuildFlow setup` and submitting silently POSTs
  `fallbackBusinessType = 'General Contractor'`; the person never sees which trade their workspace is
  being seeded as. (d) *re-entry by an already-onboarded org* — the guard checks only session presence
  and `session.demo`, never `onboardingCompletedAt`, so the whole flow can be re-run; `readStoredPlan`
  / `readStoredProducts` make the step paint **pre-filled**, already enabled and already reading
  `Continue to BuildFlow` on first paint, while **seats silently resets to 5** even for an 8-seat org.
- **Becomes:** all four preserved exactly, with two presentation-only affordances that add no copy:
  1. **The failed-submit state gets a visual anchor.** The `.acct-error` paragraph is the only
     difference from the initial state, so it moves nowhere but gains
     `scroll-margin-block: var(--bf-space-6)` and the form column scrolls it into view
     (`block: "nearest"`) when it appears — a CSS + 1-line behaviour that does not touch focus (moving
     focus would change what `findByRole("alert")` announces first). On a 640px column that is 3
     sections tall, an alert above the submit is otherwise off-screen.
  2. **The pre-filled state is not disguised.** No "restored" badge (new copy). The selected cards use
     the same treatment as a fresh selection, which is honest: they *are* selected.
- **Every information item placed:** (a) `Building workspace...` (frozen, three literal dots);
  (b) the recomputed labels `Continue to BuildFlow` / `Continue without add-ons`;
  (c) the fallback lede `Choose your BuildFlow setup` and the invisible `General Contractor` default;
  (d) the pre-filled plan/add-on marks and the reset `Seats` value of 5.
- **Every action placed:** the Stripe hop can hold `Building workspace...` through `apiFetchSession` +
  `apiStartCheckout` before a full-page `assign` — with **no interstitial copy** and **no
  `beforeunload` guard** (preserved). `isSubmitting` is reset **only** on failure.
- **States:** as above. *Add-on lock* — none.
- **Motion:** the rail during submit; nothing new on failure (an entrance on a `role="alert"` risks a
  mid-transition announcement — same rule as screen 5). No reveal, no skeleton.
- **Tests touched:** none of the four states is covered by any test. `App.test.tsx:180` walks the
  success path only. **Unchanged.**

---

## 16. Onboarding session guard, resume, and malformed-hash routing

- **Today:** `onboardingViews = ['businessType','additionalProducts','inviteTeam']`. Entering any of
  them fires `apiFetchSession()`; no session or `session.demo` ⇒ `showCreateAccountPage()`. There is
  **no loading state** — the step paints in full and can then be swapped for `#create-account`.
- **Becomes:** unchanged routing, unchanged guard, plus the rail so the swap reads as a transition
  rather than a flash of the wrong screen. **No gate, no spinner, no delay** — the tests `await
  findByRole("heading", …)` on first paint, so anything that defers the render is disqualified.
- **Every information item placed (7 of 7):** (1) the guard's own rule and its code comment's reason
  (*signed out, the API's self-heal would hand the trade/plan to the shared DEMO org*); (2) the absence
  of a loading/skeleton during the check — preserved deliberately; (3) the resume path — onboarding is
  "done" only when the org carries `onboardingCompletedAt`, so `enterAfterAuth` (used by signup, login,
  password reset **and** accept-invite) sends any account without it to `#business-type`; (4) direct
  hash entry works, and the session guard is the only thing between an anonymous visitor and the step;
  (5) OAuth return — a new provider signup arrives with `?oauth=signup` and `#business-type` already on
  the URL; (6) deep-link suppression — the schedule auto-open is gated on `onboardingCompletedAt`, so a
  half-onboarded account is never yanked to a schedule page; (7) browser Back/Forward re-syncs
  `welcomeView` on `hashchange` and **remounts step 1 with an empty selection**.
- **Every action placed (3 of 3):** the automatic redirect to `#create-account` (no/demo session), the
  automatic redirect to `#business-type` (signed in without the stamp), and the automatic hash change
  to `#invite-team` after step 2 (or a full-page Stripe redirect).
- **States:** *Modal* — the record lists the post-invite tutorial dialog `Your BuildFlow workspace is
  ready` with `Skip Tutorial`; it belongs to the dashboard/tutorial cluster and is placed here only as
  the funnel's exit (Tier 2 frozen name). *Empty* — the record's "a newly provisioned workspace is
  intentionally blank" is a **test-fixture artefact**: in production `applyBusinessProfile` seeds a
  populated starter workspace (projects, jobs, crews, a week of schedule, `isSample: true` teammates).
  That correction matters to this mapping because it makes screen 10's promise (`Your workspace will
  include …`) **literal**, which raises the stakes on the 14 payloads placed in screen 11 and is why
  none of them may be trimmed. *Error* — a failed `loadWorkspace` after auth surfaces App's
  `Unable to load BuildFlow data` screen, which always keeps a route back to the welcome page
  (preserve's cluster owns that screen's re-skin; this mapping only records the hand-off).
  **Two mechanical corrections placed:** `/api/auth/me` answers 401 for a signed-out visitor, so
  `apiFetchSession()` **rejects** and the redirect always comes from the `.catch()` branch — the
  `!session` test is unreachable, and because the catch cannot tell "signed out" from "API
  unreachable", **one flaky request throws a legitimately signed-in owner back to `#create-account`
  and loses the trade choice.** And: `#business-type` / `#additional-products` are matched by **exact
  string equality**, unlike `#reset-password` / `#verify-email` / `#accept-invite` which use
  `startsWith`, so `#business-type?utm=x` or a trailing slash silently renders the **marketing home**
  with full nav — there is no 404 state for the onboarding routes. Both are recorded, neither is
  "fixed" here (routing is out of scope for a presentation-only brief).
- **Motion:** the rail only. No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:135` (the hash assertions) — **unchanged**;
  `appHarness.tsx:181 completeOnboarding()` (which swaps `bootstrapPayload` between the steps to mirror
  provisioning) — **unchanged**; `tests/tutorial.test.tsx:112/136` — **unchanged**.

---

## 17. Stripe hand-off and its return leg (the path that skips two screens)

- **Today:** for `pro` / `business` with Stripe configured, `completeOnboarding` returns early:
  `apiStartCheckout` then `window.location.assign(checkout.url)`. `#invite-team` is **never rendered**
  and the tutorial is **never armed** on that path. The return trip lands on
  `/?checkout=success&plan=<plan>&from=onboarding` (or `…cancelled…`), and `runBootstrap`'s
  `from=onboarding` branch `replaceState`s the query away and calls `openAppPage('dashboard')`. An
  abandoned (cancelled) checkout still lands in the workspace on the server-started 14-day trial.
- **Becomes:** routing untouched. Two presentation consequences:
  1. **The last frame before leaving the SPA is `Building workspace...` on a disabled pill.** With the
     rail running, that frame reads as "still working" rather than "stuck" — which is the entire
     available fix, because any interstitial copy would be new copy and any confirmation step would be
     a flow change.
  2. **The return leg paints the Dashboard, not the funnel**, so it belongs to preserve's cluster. The
     hand-off note: `from=onboarding` must keep scrubbing the query *before* `openAppPage`, or the
     dashboard's own URL handling sees a stale `checkout=` param.
- **Every information item placed:** the two success/cancel URL shapes and the `returnTo: 'onboarding'`
  contract — URL contracts, not UI, and untouched.
- **Every action placed:** `apiStartCheckout({plan, period: 'monthly', seats, email, returnTo:
  'onboarding'})`; `track(checkoutStarted)`; `window.location.assign`; the swallowed failure path
  (`console.warn '[billing] checkout unavailable, continuing on trial'`) falling through to
  `#invite-team`.
- **States:** *Error* — three billing strings exist and are **deliberately never shown** (the 400
  `Choose a plan (pro or business), a billing period, and an optional seat count.`, the 502
  `Could not start checkout. Please try again.`, and the 200 `{configured:false}` "billing not
  connected" notice). Recorded so a redesign does not "discover" them and start rendering them —
  that would be new copy on a path the product intentionally keeps silent.
- **Motion:** the rail; then a full-page navigation. No reveal, no skeleton.
- **Tests touched:** none client-side. `server/test/api.test.ts:99–126` (plan/products/seats echoed
  with `billingStatus: 'trial'`) — server, **unchanged**.

---

## 18. Invite team — editor (the last onboarding step) — `#invite-team`

- **Today:** the wide split with a 640px column: brand → `Last step` eyebrow → `h1` → sub-paragraph →
  three prefilled-but-empty invite rows (email + role select + remove) → `+ Add another` → a
  state-dependent primary → an optional secondary skip. The row editor is **shared with Settings ›
  Team**. `Skip for now` is the single most test-load-bearing button in the funnel after the login
  form.
- **Becomes:** the same DOM in the auth register, with the row grid frozen and the results-row grammar
  changed (screen 19). Column: back **absent on this screen** (there is no `.acct-back` in
  `WelcomeInviteTeamPage` — preserved as an absence) → brand → eyebrow pill (`Last step`, uppercased
  by CSS) → `h1` (24ch) → sub-paragraph (46ch) → `var(--bf-rhythm-dense)` → `.acct-invite-rows`
  (10px gap frozen) → `+ Add another` → `var(--bf-rhythm-dense)` → primary → secondary → **72px tail**.
  Row: `grid minmax(0,1.6fr) minmax(150px,1fr) auto`, `align-items: start` (frozen — it is what stops a
  row error from pushing the role select down), `.acct-field { gap: 4px }` frozen, the 40×44 remove
  button at radius 12 with `margin-top: 2px` frozen, collapsing to one column at ≤560px with the
  remove button `justify-self: end`. Inputs and selects join the ladder at radius 12 / 1px hairline;
  the select's chevron data-URI stroke goes `%236f7785 → %23575550`. Shared components: `InviteRows`
  (unchanged JSX), the chassis, the aside trio.
- **Every information item placed (17 of 17):**
  1. Brand lockup → `.acct-brand`.
  2. Eyebrow pill: pulsing dot + `Last step` — **the only progress signal in a three-step funnel**;
     preserved as-is (no counter, no stepper).
  3. `h1#invite-team-title` `Who runs the work with you?` → 24ch.
  4. Sub-paragraph `Invite your supers and crew leads now, or later from Settings. They get an email
     with a link that puts them straight into this workspace.` → 46ch.
  5. Three rows on mount with roles preset `Superintendent`, `Crew Lead`, `Crew Lead`.
  6. Per-row placeholder `teammate@company.com`.
  7. The role dropdown's option list = `TEAM_ROLE_OPTIONS` exactly: `Project Manager`,
     `Superintendent`, `Crew Lead` — and **no Owner/Admin option** (preserved as an absence).
  8. The sr-only labels `Email 1` / `Role 1` / `Email 2` / `Role 2` / … numbered by `index + 1` →
     `.acct-sr-only` (frozen utility). **These are the rows' only labels**; there is no visible column
     header and none is added (a header would be new copy and a new `getByText` surface).
  9. The remove control's accessible name `Remove row 1` / `Remove row 2` / … (icon-only) → frozen.
  10. `+ Add another` → `.acct-link-btn.acct-invite-add`, `13px`, the *link* accent role, gaining
      move 3 (`translateX(3px)`).
  11. The two per-row messages `Enter a valid email address.` and `Already in the list.` → screen's
      error state.
  12. The three-way primary label `Skip for now` (all boxes blank) / `Send invites` (any text) /
      `Sending…` (in flight) → **Tier 1 frozen, all three**, on the one button node.
  13. No legal line, no OAuth, **no back link**, no nav, no footer → preserved as absences.
  14. The aside (`aria-hidden`): brand row, the `Live schedule` card with its four lanes, eight bars
      and the amber double-book that self-resolves → the dark window (§0.4).
  15. The aside quote `The whole crew, ` + em `one schedule.` → `var(--bf-auth-quote)` / 15ch.
      **Note the record's correction:** the aside is *not* byte-identical across screens — under
      `.acct-split-wide` the quote is `clamp(24px,2.4vw,32px)` and the split is `1.32fr 1fr`, versus
      `clamp(28px,3vw,40px)` and `1.04fr 1fr` on `.acct-split`. `var(--bf-auth-quote)`
      (`clamp(26px,2.6vw,36px)`) **unifies the two**, which is the one place this mapping deliberately
      converges rather than freezes — the aside's whole purpose is to read as one continuous surface,
      and two type sizes for the same object defeated that.
  16. The cite `Run the whole jobsite from one place.` → `14px`, `--bf-win-mut`.
  17. The aside is `display: none` below 900px → screen 33.
- **Every action placed (10 of 10):** (1) typing in a row email → `update(index, {email})`;
  (2) the role `<select>` → patches that row; (3) the remove button (rendered only while
  `rows.length > 1`) → filters the index out — **and it does not clear the index-keyed `errors` map, so
  a message can sit under the wrong row until the next submit** (preserved; keying errors by a stable
  row id is a JS change and is flagged); (4) `+ Add another` (only while `rows.length < 20`) → appends
  `{email: "", role: "Crew Lead"}`; (5) form submit → `checkInviteRows` → early return on any error →
  `onDone()` if zero valid rows (**a blank submit is a legitimate skip**) → else `apiSendInvites(valid)`
  and swap to the results; (6) Enter in any email submits; (7) `Skip for now` (`.acct-link-btn.acct-hint-center`,
  rendered only when at least one box has text) → `onDone()`, discarding what was typed with no
  confirmation; (8) `onDone` = `finishInviteStep` → `setPendingSetup(null)` → `openAppPage('dashboard')`
  → the tutorial dialog; (9) `track(invitesSent, {count, held, source: 'onboarding'})` on a successful
  POST, plus `trackPageView(welcomeView)` on entry; (10) the signed-out/demo guard (screen 16) — this
  screen cannot be reached by pasting the hash while signed out, and the redirect lands on
  `#create-account` in **signup** mode (`showCreateAccountPage`), not login.
  Keyboard, placed: the tab order interleaves the remove buttons (email 1 → role 1 → remove 1 → email 2
  → … → `+ Add another` → primary → secondary), **focus is never moved** on add or remove, and the
  remove button has no authored `:focus-visible` — S0's unified ring fixes the last of those three.
- **States:** *Empty* — **the default state is the empty state**: three blank rows, no zero-state
  illustration, and the button already reading `Skip for now`. Removing down to one row hides every
  remove button; reaching **20 rows hides `+ Add another` with no counter and no explanation** (so the
  server's `Invite up to 20 people at a time.` is unreachable from the UI) — preserved; a "18 of 20"
  counter is new copy. *Loading* — `Sending…`, disabled, `ArrowRight` suppressed, **everything else
  still live**, guarded only by `if (busy) return` at the top of `submit()`; plus the rail. **The
  in-flight race is preserved and named:** the secondary `Skip for now` has **no `disabled={busy}`**,
  so it can be clicked mid-POST — the invites are still created and sent, but the results panel and
  the held hint are never shown. Adding the guard is a 1-word behaviour change and is flagged rather
  than slipped in. *Error* — per-row `.acct-field-error` (`12.5px/600`, `#b4404b`, `flex wrap`,
  `gap 0 8px`, baseline) with `.acct-input.is-invalid` + `aria-invalid`, carrying
  `Enter a valid email address.` or `Already in the list.` — and **these row errors have no
  `role="alert"`** (unlike the accept-invite form's), so they are not announced. Preserved and flagged.
  Whole-form `.acct-error role="alert"`: the server 400s (`Add at least one email.` and
  `Invite up to 20 people at a time.` — **both unreachable through this UI**, per the record's own
  correction; `Enter a valid email address.`; `Check the emails and try again.`), the ops-gate 401
  `Please sign in to continue.` (the most likely real failure, and absent from the record's own error
  list), the 500 `Workspace unavailable.`, the 429 (`invite`, 60/hour per IP) and the two network
  strings. **Errors clear only on the next submit — typing does not clear a row's message** (preserved).
  **Native validation is a distinct state, placed:** the `<form>` has no `noValidate` and every box is
  `type="email"`, so a real browser intercepts `not-an-email` with its own bubble and `checkInviteRows`
  never runs — the app's own message is only reachable for near-misses like `sam@company` that pass
  `type=email` but fail `EMAIL_PATTERN`. **This mapping changes neither**, because
  `settings.test.tsx:253–255` encodes the current behaviour by submitting the form directly; choosing
  between native bubbles and app messages is a real design decision and is listed under
  needs-approval. *Add-on lock* — none.
- **Motion:** move 3 on `+ Add another` and on the pill's `ArrowRight`; move 2′ on the pill; move 4 on
  the aside card; **no lift** (a row is not a card — clause 1 licenses the row's controls, not a frame
  around the row). `acct-rise` on the inner (**and it does not replay when the form swaps to the
  results list — same element**); `acct-dot-pulse`; the six 12s loops; `wx-blink`; the remove button's
  instant red hover gains `var(--bf-dur-hover)` so it stops being the one un-transitioned control.
  No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:189–190` (`Skip for now`) — **passes unchanged**;
  `appHarness.tsx:177–178` (the same click, walked by **every** suite that calls
  `completeOnboarding()` / `chooseProductsAndPlan()`) — **unchanged**;
  `tests/settings.test.tsx:220–284` (the shared editor: `Send invites`, no POST on an invalid email,
  the POST body shape, the reset to one blank row, and the `role="status"` notice) — **unchanged, and
  it is why `InviteRows` is restyled and never restructured**; `server/test/api.test.ts:220–331` —
  server.

---

## 19. Invite team — results / sent state

- **Today:** `results !== null` swaps the `<form>` for a `<ul class="acct-invite-results">`; the head
  (brand, `Last step`, `h1`, sub-paragraph) **stays unchanged** — there is no success headline. Each
  `<li data-status>` is a bordered white 12px-radius box with the email left and the outcome right. A
  conditional hint appears when any result is held. One button out.
- **Becomes:** the same list, re-grammared as **rows, not boxes** — the §0.4 audit's second counted
  win. `.acct-invite-results li` loses its `1px #d7dbe2` border and its 12px radius and keeps its
  `10px 14px` padding and its `flex / space-between / wrap / gap 6px 14px`; rows are separated by
  `border-bottom: 1px solid rgba(28,28,26,0.07)` with none on the last, all inside one white card
  (`#fff`, radius 18, `1px rgba(28,28,26,0.07)`, `var(--bf-shadow-card)`, `overflow: hidden` so the
  first and last rows clip to the corners). That is exactly the table treatment preserve gives in-app,
  at the funnel's scale: **up to 20 boxes → 1 card + n−1 rules.** The email goes `13.5px/600` ink; the
  outcome keeps its three semantic colours at `12px/600`.
- **Every information item placed (8 of 8):** (1) the head stays — brand, `Last step`, `Who runs the
  work with you?`, and the same sub-paragraph — **preserved deliberately, including the fact that it
  does not become a success headline**; (2) the `<ul>` with one `<li data-status="sent|held|skipped">`
  per address, `<strong>{email}</strong>` left, the outcome `<span>` right; (3) the outcome copy
  exactly — `sent` → `Invite sent` (green `#1f8a58`, 600); `held` → `Will send once you confirm your
  email` (amber `#a8721b`, 600); anything else → `result.reason` if present, else the literal
  `Skipped` (grey, now `#8a877e`); (4) the three server-authored reasons that appear verbatim in that
  slot — `Already has a BuildFlow account.` (skipped; also covers inviting yourself), `Goes out when
  you confirm your email.` (held), `Email could not be sent; resend from Settings.` (held after an
  SMTP throw); (5) the conditional held hint `We emailed you a confirmation link at signup. Open it
  and the held invites go out automatically.` → `.acct-hint`, prose-capped, shown when any result is
  held — **this is the third in-product pointer at `#verify-email`** and it is placed here, on screen
  29 and on screen 31 so the set is complete; (6) no count summary, no "3 invites sent" roll-up, no
  per-row resend or undo, no way back to the editor → preserved as absences; (7) the invite email the
  recipient receives → screen 32; (8) the aside unchanged.
- **Every action placed (3 of 3):** (1) `Open BuildFlow` (with `ArrowRight` 18) → `onDone()` →
  `finishInviteStep` → `openAppPage('dashboard')` → the tutorial dialog; (2) no other controls — the
  editor, the remove buttons, `+ Add another` and `Skip for now` are all gone, and there is no
  "invite more" affordance and no link to Settings › Team (preserved); (3) results are terminal for the
  session — re-entering `#invite-team` remounts a fresh 3-row form.
- **States:** *Empty* — unreachable (zero valid rows short-circuits to `onDone()`), so the list is
  never empty. *Loading* — none; and clicking `Open BuildFlow` gives **no** pending feedback because
  the bootstrap happens on the dashboard side (preserved). *Error* — none in this branch: a
  whole-request failure keeps the person on the editor. **Mixed outcomes are shown as data, not
  errors** — a run where every address was skipped still renders as a success panel with three grey
  `Already has a BuildFlow account.` lines and no corrective advice (preserved and flagged).
- **Motion:** **none of its own today** — `acct-rise` already played on the same
  `.acct-form-inner` element, so the results appear with no transition. It gains one, correctly: the
  results `<ul>` is given its own `acct-rise 0.55s both` (existing keyframe, no new name) and its rows
  the `calc(0.06s + var(--i)*0.06s)` stagger already used by `.acct-preview-row`, capped at
  `min(var(--i),8)`. Both must be added to the `:1024` reduced-motion block's selector list. Note the
  record's structural observation: the panel lives inside `<div className="acct-form">` and therefore
  inherits the form's grid — which is why the motion goes on the `<ul>` and its `<li>`s rather than on
  the shared wrapper. Move 2′ on the pill, move 3 on its arrow, move 4 on the aside. No reveal, no
  skeleton.
- **Tests touched:** `server/test/api.test.ts:243–247` (the two result payloads this panel formats) —
  server, **unchanged**; `tests/settings.test.tsx:234–238` (the same `{results, invites,
  emailVerified}` response shape) — **unchanged**. No client test renders the funnel's results panel;
  everything above is Tier 3.

---

## 20. Accept invite — checking (preview in flight) — `#accept-invite?token=…`

- **Today:** `.acct-split` (**not** the wide variant), so the form column is vertically centred at
  `1.04fr 1fr`. Head only: brand, `h1` `Checking your invite…`, `One moment.` The body renders `null`.
  No eyebrow, no controls, no spinner, no `aria-busy`, no live region.
- **Becomes:** the same head, centred, with the rail as its only new signal. The `h1` stays plain ink
  at `var(--bf-auth-title)` — **not** wrapped in a shimmer (§0.6's rejection: `color: transparent` on
  the page's only content is a progressive-enhancement hazard). The 72px tail is inert here (the
  column does not scroll). Shared components: the chassis, the aside trio.
- **Every information item placed (7 of 7):** (1) brand lockup; (2) `h1#accept-invite-title`
  `Checking your invite…` (U+2026, frozen); (3) `One moment.`; (4) **no eyebrow/step pill on this
  page** → preserved as an absence; (5) no form and no buttons while both `preview` and `previewError`
  are empty → preserved; (6) the aside — auroras, brand, the `Live schedule` board, and its own quote
  `Your crew is ` + em `already on the board.` with the shared cite → the dark window; (7) this page
  uses `.acct-split`, so the columns are `1.04fr 1fr` and the form column is centred — frozen, and it
  is why the quote-size unification (screen 18, item 15) matters: this screen and `#invite-team` sit
  next to each other in the same flow with two different aside type sizes today.
- **Every action placed (3 of 3):** (1) the mount effect — `tokenFromHash()`, early return when
  empty (the state was already `failed`), else `apiVerifyEmail`-shaped `GET /api/auth/invite/{token}`;
  (2) the `cancelled` cleanup flag preventing a post-unmount state write; (3)
  `trackPageView("acceptInvite")` on entry — **and the record's finding is placed here: that pageview
  sends the full URL** (`window.location.href` for Plausible/PostHog, `pathname + hash` for GA),
  which contains `?token=<the one-time invite credential>`. Recorded as a real leak; fixing it is an
  analytics change (needs-approval), and nothing in this mapping widens it.
- **States:** *Loading* — **the whole screen is the loading state**, carried by text alone. Two gaps
  preserved-and-flagged rather than fixed: there is **no timeout and no retry** (a hung request leaves
  `Confirming…`-style copy forever with nothing to press), and **no `aria-live`/`role="status"`**, so
  the resolution is never announced. *Empty* — this **is** the null-body state: head only, no skeleton
  rows. *Error* — resolves into screen 21 or 22. *Add-on lock* — none.
  **Two more states placed from the record's completeness block:** (a) this screen can **never** show
  the app's loading or error chrome (`page === "welcome"` returns before both gates), so a bootstrap
  failure behind it is invisible; (b) `runBootstrap` runs on mount for every visitor and
  `loadWorkspace`'s 401 branch **demo-logs-in and retries**, so a brand-new invitee is quietly signed
  into the shared demo org while reading this screen and keeps that cookie if they abandon. Both are
  presentation-invisible today and stay that way; they are recorded because they explain why
  `#invite-team` needs its `!session || session.demo` guard.
- **Motion:** `acct-rise` on the inner (mount only) plus the rail; the aside's full loop set. Because
  `acct-rise` is `both` on the same element, **the head does not re-animate when the body fills in** —
  content appears under a settled heading. Preserved; the body's own entrance is added on screen 21.
  No reveal. Skeleton: **none, and deliberately none** — a skeleton implies known content, and this
  request decides whether there is any content at all.
- **Tests touched:** **no client test renders this view.** `server/test/api.test.ts:268`
  (`GET /api/auth/invite/not-a-token` → 404) covers the endpoint. **Unchanged.**

---

## 21. Accept invite — set password and join (valid invite)

- **Today:** the preview resolves and the body fills with a 4-control form: name, a read-only email,
  a password with a toggle and the strength meter, and the terms checkbox. `autoFocus` on the name
  input takes effect asynchronously, a beat after the head text swaps. No client test covers any of
  it.
- **Becomes:** the auth register applied to the funnel's only form that is *not* protected by a test —
  which is why every string below is placed explicitly. Column (centred, 400px): brand → `h1` (24ch)
  → sub-paragraph (46ch) → `var(--bf-rhythm-dense)` → `.acct-form` with the four controls at 48px /
  radius 12 / hairline → the meter → the checks group → the ink pill. Shared components: the chassis,
  the strength meter block (screen 9), the aside trio. **The read-only email field keeps its
  `readOnly` + `aria-readonly` and stays focusable**, and gains the one visual distinction it lacks:
  `background: rgba(28,28,26,0.035)` and `color: var(--wx-mut)` so "you cannot change this" is legible
  without a disabled control (a `disabled` input would leave the tab order and lose the value from any
  future form serialisation).
- **Every information item placed (13 of 13):** (1) brand lockup; (2) `h1` `Join ${preview.orgName}.`
  (e.g. `Join Asphalt Co.`) → `var(--bf-auth-title)`, 24ch; (3) the sub-paragraph
  `${preview.inviterName} invited you as a ${preview.role}. Set a password for ${preview.email} and
  you're in.` → 46ch, with `inviterName` falling back to `A teammate` server-side; (4) the
  `InvitePreview` payload `{email, role, orgName, inviterName, expiresAt}` — **and `expiresAt` is
  fetched but never rendered**, even though the invite email promises seven days. Preserved as an
  absence; adding an "expires in N days" line is free information but **new copy** and must handle the
  already-expired case where no preview exists → needs-approval; (5) label `Your name` + placeholder
  `Sam Ortiz`; (6) label `Email` (read-only, prefilled); (7) the read-only hint `This is the address
  the invite was sent to. It's already confirmed.` → `.acct-hint`, prose-capped; (8) label `Password`
  + placeholder `At least 8 characters`; (9) the strength meter (screen 9) — computed **with**
  `preview.email`, so the "email in password" rule is live here (unlike the reset screen);
  (10) the terms line: the `<label>` text is exactly `I agree to the`, then `Terms & Conditions`
  (`#terms`), then `and`, then `Privacy Policy` (`#privacy`), then a period — **the same
  label-boundary invariant as screen 1, and the same reason**; (11) submit `Join ${preview.orgName}`
  (no trailing period) / `Joining…`; (12) the absences — no eyebrow, no "already have an account?"
  toggle, no OAuth, no remember checkbox (`remember: true` is hard-coded), no back link, no nav, no
  footer; (13) the aside with `Your crew is already on the board.`
- **Every action placed (8 of 8):** (1) typing the name → clears the name error optimistically;
  (2) typing the password → clears the password error and re-renders the meter; (3) the show/hide
  toggle (`Eye`/`EyeOff` 18px, `aria-label` `Show password` / `Hide password`, 44px, inside
  `.acct-input-wrap`, the input carrying `.has-toggle` for the right pad) — **and it sets no
  `aria-pressed`, so it announces as a plain button**; adding one is a 1-attribute a11y repair
  (needs-approval, since it changes what a screen reader says); (4) the terms checkbox → clears its
  error; (5) submit → validate name / `passwordProblem(password, preview.email)` / terms → else
  `onAccept({token, name, password, acceptTerms: true, remember: true})`; (6) Enter in name or password
  submits, and `autoFocus` on `#invite-name` starts the caret there; (7) the two legal anchors —
  **plain hash links that navigate away from a half-filled form with no state preservation and no way
  back** (the person must re-open the emailed link and retype). Preserved and flagged as the cluster's
  worst remaining UX trap; (8) `onAccept` = `handleAcceptInvite` → `POST /api/auth/invite/accept`
  (sets the cookie) → `enterAfterAuth()` → the dashboard.
- **States:** *Empty* — no empty state (the form only renders once a preview exists). *Loading* —
  `Joining…`, disabled, **every input still editable**, `busy` reset **only** in the catch (deliberate
  double-submit protection during navigation), plus the rail; and because
  `page === "welcome"` returns before the loading gate, **this screen with its locked button is what
  the person looks at for the whole bootstrap** (screen 7). *Error* — field errors as
  `.acct-field-error role="alert"` under the offending input (`Enter your name.`, the three password
  strings, and `Please agree to the Terms & Conditions and Privacy Policy.` under `.acct-checks`, with
  `.acct-terms.is-invalid` painting a `2px #d96570` outline on the box itself); whole-form
  `.acct-error role="alert"` for any `ApiError` whose `field` is not `password`, else `Something went
  wrong. Please try again.` Placed verbatim: the 400 `This invite is invalid, was withdrawn, or has
  expired. Ask for a new one.` (**which lands mid-form and leaves the form fully usable against a dead
  token, with no "request a new invite" affordance** — preserved and flagged); the 400 `weak_password`
  routed to the field; the **409 `An account with this email already exists. Sign in instead.`**,
  which surfaces at the top of the form where **there is no sign-in control** (the `Sign in instead`
  button exists only in the invalid-invite branch) — preserved as its own state and flagged, because
  the copy tells the person to do something the screen does not offer; the 429s (`invite-accept`
  10/hour, `invite-peek` 30/15min); the network strings; and the record's addition — the accept route's
  zod fallback `Check the form and try again.` plus the **raw zod defaults** that leak for
  `password.max(200)`, `name.max(120)` and `token.min(1)` (unauthored messages of the "Too big: expected
  string to have <=200 characters" shape), rendered verbatim in `.acct-error`. Also placed: the server
  routes `field` to `name`/`password`/`terms`/`token`, but **the client only checks `password`**, so a
  server `Enter your name.` appears at the top of the form instead of under its input. Preserved;
  reusing signup's `isSignupField` router here is a JS change (needs-approval). Field errors clear on
  the next keystroke; the top-level one persists until the next submit. *Add-on lock* — none.
- **Motion:** move 2′ on the pill; move 4 on the aside; no lift (no cards). `acct-rise` played on the
  head at mount, so **the form appears with no motion of its own** — it gains the same
  `acct-rise 0.55s both` on the `.acct-form` element (existing keyframe, added to the `:1024` block's
  selector list), which is the honest fix for a body that materialises under a settled heading.
  The strength bars keep their `.25s`; the input focus transition stays `.16s` → `var(--bf-dur-hover)`.
  **Placed: the async `autoFocus` is today's only de-facto announcement of the resolve** — it stays,
  and the caret jump is now preceded by the form's own entrance so it reads as arrival rather than a
  jolt. No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:274–282` (the preview payload interpolated into the `h1`
  and sub-paragraph), `:286–297` (the common-password rule the meter mirrors; a successful accept),
  `:300–305` (the accepted teammate lands past onboarding), `:436–440` — all server, **unchanged**.
  **No client test renders this page**, so its labels, placeholders, hint and button copy are unpinned
  — the ledger's Tier 3 and the reason for the item-by-item placement above.

---

## 22. Accept invite — invalid / expired / already-used / missing token

- **Today:** head + one button. The sub-paragraph is whichever error string applies. The
  `request a new one`-style inline control does not exist here; the single control is `Sign in instead`.
- **Becomes:** the funnel's cleanest terminal screen: brand → `h1` → the reason as body copy →
  `var(--bf-rhythm-dense)` → one ink pill. The reason moves out of plain body copy into the
  `.acct-error` panel (red pair, radius 12, `role="alert"`, prose-capped) — the same promotion screen
  25 gets, and for the same reason: a rate-limit or expired-link sentence rendered as a lede is
  indistinguishable from an explanation.
- **Every information item placed (6 of 6):** (1) brand lockup; (2) `h1` `This invite didn't work.`;
  (3) the sub-paragraph = the `previewError` string, one of: `This invite link is missing its token.`
  (set locally when the hash carries no token) · the server 404 `This invite is invalid, was
  withdrawn, or has expired. Ask for a new one.` (**covering expired >7 days, revoked and
  already-accepted with one message — no distinction**) · the `invite-peek` 429 `Too many attempts.
  Try again in {N}.` · `Could not reach the BuildFlow API: {message}` · the local fallback
  `This invite is invalid or has expired.`; (4) the absences — no eyebrow, no form, no field, no
  org/owner name (the preview never resolved, so there is nothing to show), no "email the person who
  invited you" hint, no support link → all preserved; (5) `Sign in instead`; (6) the aside unchanged —
  **the celebratory panel still runs behind a failure message**, preserved as-is, and the only mitigation
  this mapping applies is that the dark window is a calmer surface behind a failure than the bright navy
  radial was.
- **Every action placed (3 of 3):** (1) `Sign in instead` → `onLogin` → `showLoginPage()` →
  `#create-account` in login mode — **and it destroys the invite URL** (the new hash is pushed, so the
  token is gone from the address bar and the only way back is the email); (2) no "request a new
  invite", no retry (a transient failure or a 429 needs a manual reload, because the effect only runs
  on token change); (3) the whole page has exactly **one** interactive element in this state.
- **States:** this **is** the failure/empty state. *Loading* — none (terminal). Every error case is
  enumerated above, including the misleading one: **a throttled but valid link reads as a broken
  invite**, because the 429 is rendered as the invite's own failure sentence. Preserved and flagged
  (distinguishing 429 from 404 is a copy change). Once `previewError` is set nothing clears it — the
  state is permanent for that mount.
- **Motion:** `acct-rise` on the inner (mount only); the aside's full loop set. **Nothing signals the
  transition from `Checking your invite…` to the failure head** — the text swaps in place under a
  settled container. Preserved *except* that the `.acct-error` panel and the button now arrive with the
  `.acct-form`-level `acct-rise` added on screen 21, so the failure body announces itself the same way
  the success body does. No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:268` and `:295–297` — server, **unchanged**. No client
  test covers this branch; the `h1` and the button name are unpinned (Tier 3).

---

## 23. Accept invite — re-entry with a spent token while signed in

- **Today:** `openAppPage` clears the hash with `history.pushState` (not `replaceState`), so after
  joining, the previous history entry is still `#accept-invite?token=…`. Back changes the URL and
  `welcomeView` **without changing the rendered page** (`page` is already `"dashboard"`); a **reload**
  on that entry remounts the accept page, the token now 404s, and screen 22 renders — offering
  `Sign in instead` to somebody who already has a live session. The same shape applies to
  `#invite-team` (Back then reload re-opens a fresh 3-row editor after onboarding).
- **Becomes:** unchanged behaviour, because changing `pushState` to `replaceState` alters history
  semantics and is not presentation. What this mapping does is make sure the screen it lands on is
  the *correct* one: screen 22's promoted `.acct-error` panel means the person reads a stated reason
  instead of a lede, and the pill they are offered is the one control on the page.
- **Every information item placed:** the record lists no items for this state beyond screen 22's,
  all of which are placed there.
- **Every action placed (2):** (1) browser Back after leaving either screen — the URL and
  `welcomeView` change but the render does not; (2) a reload from that entry remounts the step (a
  fresh editor) or the dead invite. Both preserved.
- **States:** the dead-end above. Also placed here for completeness: `App.tsx`'s `popstate` listener
  reads `event.state?.page`, which `pushState(null, …)` leaves `undefined`, so it is a **no-op** for
  every funnel transition — which is why Back behaves as described, and why two Backs from step 2 land
  on `#create-account` while still signed in.
- **Motion:** whatever the remounted screen brings. No reveal, no skeleton.
- **Tests touched:** none. **Unchanged.**

---

## 24. Reset password — valid token — `#reset-password?token=…`

- **Today:** `.acct-split` (centred, `1.04fr 1fr`). One field, one meter, one CTA, one back link, and
  a sub-line that makes a factual promise. Every error — including a 429, an expired link and a
  missing workspace — renders in the 12.5px per-field slot under the password input.
- **Becomes:** the auth register, plus **one structural fix: a correct error hierarchy.** Column:
  back → brand → `h1` (24ch) → lede (46ch) → `var(--bf-rhythm-dense)` → the field (48px, radius 12,
  hairline, `has-toggle`) → the meter → the pill → **72px tail**. The error slot splits by ownership,
  which is the whole point: **`weak_password` and the client policy strings stay in
  `.acct-field-error` under the input** (they are about the value the person typed), while
  `token_invalid`, the 429, `Account workspace is missing.` and the network strings are promoted to the
  bordered **`.acct-error role="alert"` panel above the field** (they are about the request). Both
  components already exist in the CSS and this screen currently uses neither of them correctly.
- **Every information item placed (16 of 16):** (1) `← Back to sign in` → `.acct-back`, arrow slides
  `-3px`; (2) brand lockup; (3) `h1#reset-password-title` `Choose a new password.` → 24ch;
  (4) the valid-token lede `You'll be signed in as soon as it's saved. Other devices are signed out.`
  → 46ch — **and it must not be softened**: `setAccountPassword` deletes every session row for the
  account, so the sentence is literally true (`api.test.ts:180`); (5) label `New password`
  (`htmlFor="reset-password-input"`); (6) placeholder `At least 8 characters`; (7) the default helper
  `At least 8 characters. A longer phrase with a number or symbol is strongest. Avoid common words and
  your email.` → `.acct-hint#reset-password-hint`, prose-capped; (8) the strength meter, rendered only
  while `password.length > 0` → screen 9; (9) the five verdict strings; (10) the scoring rule the
  visual must keep honest (start at 1; +1 at ≥12 chars; +1 at ≥3 of the four character classes; +1 at
  ≥16 or ≥14-with-all-four; capped at 4); (11) **the note that this page calls both helpers WITHOUT
  the email**, so the client meter is blind to the "don't use your email" rule and only the server can
  catch it — preserved exactly (screen 9); (12) the button's rest label
  `Save password and sign in`; (13) the absences — no step indicator, no eyebrow chip, no legal line,
  no OAuth, no "keep me signed in" → preserved, **and the last one matters**: the reset grants a
  **persistent 30-day session** (`issueSession(…, true)`) with no checkbox and no copy saying so,
  unlike login and signup which both expose `.acct-remember`. Recorded; adding either the checkbox or
  the sentence is a behaviour/copy change → needs-approval; (14) the aside (`aria-hidden`) — brand,
  the `Live schedule` card with the four lanes `Framing` / `Concrete` / `Electrical` / `Roofing` and
  eight bars (the record's "five crew lanes" is **wrong** — `ACCT_VIZ_LANES` has four lanes × two bars,
  and the `is-fix` bar is the **second Electrical** one; verified in source); (15) the aside quote
  `Back on the ` + em `schedule in a minute.`; (16) the shared cite.
  **Also placed:** the screen never names the account it is resetting — no email echo, no "for
  <email>" — and there is **no confirm-password field and no hidden `autocomplete="username"` input**,
  so most password managers cannot associate the new value with an account. Both are absences, both
  preserved, both flagged (a hidden username input is a 1-line, zero-copy fix and is the single
  highest-value item on the needs-approval list).
- **Every action placed (9 of 9):** (1) `← Back to sign in` → `showLoginPage()` → `#create-account` in
  **login** mode (not the forgot form, so the person still has to find `Forgot password?` again);
  (2) the show/hide toggle (`Eye`/`EyeOff` 18, `aria-label` frozen); (3) typing clears the error,
  which swaps `.acct-field-error` back to `.acct-hint` and drops `aria-invalid`; (4) submit →
  `preventDefault` → `if (busy) return` → client `passwordProblem(password)` first (no request if it
  fails) → `onReset(token, password)`; (5) `handleResetPassword` → `apiResetPassword` →
  `enterAfterAuth()`; (6) `enterAfterAuth` → `#business-type` without the stamp, else
  `openAppPage("dashboard")` — **which `pushState`-clears the hash and takes the one-time token out of
  the address bar**; (7) the invalid-link branch's inline recovery button (screen 25);
  (8) `autoFocus` on the password input — the field owns focus on arrival (frozen; note its siblings
  on screen 1 do *not* autofocus, which is the inconsistency listed under needs-approval);
  (9) **no resend and no "send me a new link" on this screen** — the only route to a fresh link is
  Back → `Forgot password?` → `Send reset link`. Preserved.
- **States:** *Empty* — no password typed ⇒ no meter, only the hint. *Loading* — `Saving…` (U+2026,
  frozen), disabled, **the input stays enabled**, and `setBusy(false)` lives **only** in the catch, so
  after a successful POST the button stays disabled reading `Saving…` until `enterAfterAuth` swaps the
  page — fine today because navigation always follows, and **a redesign that adds an interstitial or an
  animated success step would expose a permanently disabled button.** Stated as a hard constraint; the
  rail carries the wait instead. *Error* — split by ownership as above. Every string placed:
  `Password must be at least 8 characters.` · `That password is too common. Pick something harder to
  guess.` · `Don't use your email address in your password.` (**server-only on this screen**) ·
  `This reset link is invalid or has already been used. Request a new one.` (`token_invalid`) ·
  `Too many attempts. Try again in <N>.` (`reset`, 20/15min) · `Account workspace is missing.` (500) ·
  the network strings · `Request failed: <status>` (the fourth shape, when an error response has no
  JSON `error` key — e.g. an HTML 502 from a proxy) · `Something went wrong. Please try again.`
  **The behaviour that must survive, restated because it is invisible and load-bearing:** on a weak
  password the server has already **consumed** the token and returns a **fresh one** in the 400 body;
  `App.tsx:7469–7474` reads `err.token` and calls `setToken(fresh)` so the second attempt works. Drop
  that branch and everyone who first types a weak password is dead-ended on a spent token
  (`api.test.ts:169–175`). *The third, unnamed state:* because `invalidLink` is only `!token`, an
  **expired, consumed or superseded** token renders the full form and fails only after the person types
  a password — and the promoted `.acct-error` panel is precisely what makes that failure legible.
  *Post-reset failure asymmetry, placed:* the password is changed and the token spent **before**
  `enterAfterAuth` runs, so a `loadWorkspace` failure lands in the *field* slot and a person whose
  password **did** change reads what looks like a validation error. The ownership split fixes exactly
  this: that message is a request failure and goes in the panel. *`aria-describedby` flip:* it
  alternates between `#reset-password-hint` and `#reset-password-error`, and the hint node is
  **removed** when an error shows — so the policy guidance disappears when it is most needed. With the
  split, the hint stays mounted and the input is described by **both** ids. That is a 2-line change
  with no copy change and it is the one a11y repair this mapping adopts outright. *Add-on lock* — none.
- **Motion:** move 2′ on the pill; move 3 on `.acct-back`; move 4 on the aside. `acct-rise` on the
  inner; the meter's `background .25s` (nulled by the `:1508` block); `wx-blink`; the six 12s loops.
  The promoted `.acct-error` gets **no** entrance (`role="alert"` — screen 5's rule). No reveal.
  Skeleton: none.
- **Tests touched:** `server/test/api.test.ts:135` (the fresh-token handoff, single-use tokens, the
  session issued, every older session signed out, the old password refused) — server, **unchanged**;
  `App.test.tsx:120` pins the shared string `Password must be at least 8 characters.` through the
  *signup* form (the same helper backs this page) — **unchanged**. **No client test renders
  `#reset-password`** — no coverage of the invalid-link branch, the meter or the toggle. Two new tests
  are budgeted below.

---

## 25. Reset password — no token / malformed link (invalid-link state)

- **Today:** `invalidLink = !token` renders the head plus a bordered `.acct-error` panel **instead of
  the form**. The panel's inline recovery control is `.acct-inline-link`, whose only two rules are
  scoped `.acct-field-error .acct-inline-link` — so inside `.acct-error` it inherits **nothing** and
  paints as the browser's default grey chrome button in the browser's default font, inside a red panel.
- **Becomes:** the same structure, with that bug fixed by making the rule ownership explicit: the
  inline-link recipe (bare button, accent, underlined, `text-underline-offset: 3px`,
  `:focus-visible` ring) is re-declared for **both** parents —
  `.acct-field-error .acct-inline-link, .acct-error .acct-inline-link` — so the sentence reads as a
  sentence with a link in it, which is what the markup already says it is. The panel keeps its red
  pair, gains radius 12 and the prose cap.
- **Every information item placed (5 of 5):** (1) the same chrome — `← Back to sign in`, brand
  lockup, and **the same `h1` `Choose a new password.`** (preserved: it does not become an error
  headline); (2) the swapped lede `This link is missing its token.`; (3) the panel's sentence, built
  from three nodes — `Open the link from the email we sent, or ` + the inline button
  `request a new one` + `.` — all three preserved exactly, including the fragment boundaries;
  (4) the whole `<form>` (field, meter, hint, button) is **not rendered** in this state → preserved;
  (5) the aside identical to screen 24, including the same `Back on the schedule in a minute.` quote.
- **Every action placed (3 of 3):** (1) the inline `request a new one` → `onBack` → `showLoginPage()`
  → `#create-account` in login mode — **it does not open the forgot-password form**, so the person
  still has to find `Forgot password?` themselves. Preserved and flagged (routing it to
  `mode: 'forgot'` is a 1-line behaviour change and is on the needs-approval list, where it is the
  second-highest-value item); (2) `← Back to sign in` → the same handler; (3) no form, no submit, and
  nothing autofocused in this branch (the input does not exist).
- **States:** this **is** the empty/dead-end state for the route. It **cannot distinguish "missing
  token" from "expired token"** — an expired or already-used token still looks valid to
  `tokenFromHash()`, so it renders screen 24's full form and fails after submit. Preserved; verifying
  the token on arrival is a behaviour change → needs-approval.
- **Motion:** `acct-rise` on the inner; the aside set; **the `.acct-error` panel has no animation of
  its own** and gains none (`role="alert"`). No reveal, no skeleton.
- **Tests touched:** **none.** No test covers this branch — one of the two new tests below.

---

## 26. Verify email — checking (auto-confirms on arrival) — `#verify-email?token=…`

- **Today:** the initial state whenever `tokenFromHash()` is non-empty. Fires the confirmation itself
  in a mount effect — there is no button to press. `h1` `Confirming your email…`, body `One moment.`,
  **zero controls**, no back link anywhere in the component, no spinner, no `aria-busy`, no live
  region.
- **Becomes:** identical to screen 20's treatment — centred head at `var(--bf-auth-title)`, plain ink,
  plus the rail. No shimmer on the `h1` (§0.6). No skeleton (a skeleton implies known content).
- **Every information item placed (7 of 7):** (1) `h1#verify-email-title` `Confirming your email…`
  (U+2026, frozen); (2) `One moment.`; (3) brand lockup; (4) **no back link at all** — preserved as an
  absence (unlike the reset page, this component has no `.acct-back`); (5) **no button while
  `state === "checking"`** (`{state !== "checking" && …}`) → preserved; (6) no spinner, no progress bar,
  no skeleton — the loading state is carried entirely by the two strings; (7) the aside — brand, the
  `Live schedule` board, the quote `One address, ` + em `one workspace.`, the shared cite.
- **Every action placed (2 of 2):** (1) the mount effect — `tokenFromHash()`; empty ⇒ return (the
  state was already `failed`); else `apiVerifyEmail(token)` → `POST /api/auth/verify`, with a
  `cancelled` cleanup flag preventing a post-unmount write; (2) **no user action is possible in this
  state.**
- **States:** *Loading* — the whole screen, text only. *Error* — any rejection transitions to screen
  28. **The StrictMode hazard, placed because it will waste somebody's afternoon:** `main.tsx` wraps
  `<App />` in `<StrictMode>`, so in dev the effect runs twice against a **one-time** token; the
  `cancelled` flag blocks the first pass's state write but **not its network call**, so the second
  call gets the 400 and the dev screen shows `That link didn't work.` **on a link that actually
  worked.** Anyone redesigning this page from a real local link (which is how `exposeTokens` /
  `BUILDFLOW_EXPOSE_AUTH_TOKENS=1` is meant to be used) will chase a phantom bug. A `useRef`
  once-guard fixes it; it is a JS change → needs-approval, listed with the note that **it should
  probably be taken before this screen is redesigned, not after.**
- **Motion:** `acct-rise` on the inner (mount only) + the rail; the aside set. **There is no
  transition between checking → verified/failed** — the `h1` swaps in place and the button pops in
  unanimated. Fixed the same way as screen 21: the body block (the button, or the failure copy) gets
  its own `acct-rise 0.55s both`, keyed on `state`, so the outcome arrives instead of appearing. The
  head deliberately does **not** re-animate. No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:135` (bogus token → 400; real token → 200 with
  `emailVerifiedAt`; replay → 400) — server, **unchanged**. **No client test renders this page.**

---

## 27. Verify email — confirmed (success)

- **Today:** `h1` `Email confirmed.`, one factual sub-line, one button. No icon, no checkmark, no
  badge, no "what happens next" list, and the confirmed address is not echoed.
- **Becomes:** the same three elements in the auth register. **No success icon is added** — the funnel
  has no icon vocabulary (the only glyphs are the two `Eye` variants, the trade/product icons and the
  arrow), and a green tick would be a fifth vocabulary on the one screen that needs it least. What it
  gains instead is the `.acct-success` panel it never used: the sub-line moves into the existing green
  status component (`rgba(47,158,107,.1)` fill, `rgba(47,158,107,.28)` border, radius 12, `13.5px`,
  `#1f5f41`, prose-capped) — the same component the forgot flow uses, which makes "this worked" a
  surface rather than a sentence, using zero new copy and zero new colour.
- **Every information item placed (6 of 6):** (1) `h1` `Email confirmed.`; (2) the sub-line
  `Inviting your team and managing billing are unlocked for this workspace.` → the `.acct-success`
  panel — and it is **factually backed** (`app.ts:1032–1042` releases every held invite for the org on
  confirmation and re-mails it on a refreshed 7-day token), so it must not be softened; (3) the button
  `Continue to BuildFlow` — **Tier 2 frozen, and the collision with the additional-products button
  (§0.10) means these two must never render in one tree**; (4) no icon/checkmark/badge → preserved as
  an absence (see above); (5) no "what happens next" list and no email echo → preserved;
  (6) the aside unchanged (`One address, one workspace.`).
- **Every action placed (2 of 2):** (1) `Continue to BuildFlow` → `proceed()`: `setBusy(true)`,
  `await onContinue().catch(() => false)`, and on a falsey result `setBusy(false)` + `onLogin()`;
  (2) `onContinue` = `handleAfterVerify` → `apiFetchSession()`; a session ⇒ `enterAfterAuth()` and
  return true; no session ⇒ return false. **So this one button has two destinations** — into the
  workspace, or silently onto the sign-in form (when the link was opened in a different browser or on
  a phone) — **and it says `Continue to BuildFlow` in both cases.** Preserved exactly; giving the two
  paths honest copy is a copy change → needs-approval, where it is flagged as the third-highest-value
  item. No secondary action, no skip, no back → preserved.
- **States:** *Loading* — `Opening…` (U+2026, frozen), disabled, plus the rail; `busy` is reset before
  the fall-through to `onLogin()`. *Error* — **there is none**: a throw from `onContinue` is swallowed
  by `.catch(() => false)` and the person is routed to the login form with no explanation. Preserved
  and flagged. *Empty* — n/a. *Add-on lock* — none.
- **Motion:** `acct-rise` runs on `.acct-form-inner` at mount and **is not re-run when the state flips
  to verified** — so the success body gains the state-keyed `acct-rise` added on screen 26; the
  `.acct-success` panel is that body. Move 2′ on the pill; move 4 on the aside. No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:135`, `:220` (confirmation unlocks invites) and `:334`
  (changing the account email restarts verification, i.e. **this screen is reachable more than once per
  account**) — server, **unchanged**. No client test renders it.

---

## 28. Verify email — failed (invalid, expired, already-used, or no token)

- **Today:** one failure screen for every bad-link case, reached immediately when there is no token
  (the initial state is `failed` and the effect returns early) or after the POST rejects. The reason
  is rendered as plain body copy, not in a panel.
- **Becomes:** screen 22's treatment: `h1` → the reason promoted into the `.acct-error role="alert"`
  panel (radius 12, prose-capped) → the pill. One reason, one panel, one control.
- **Every information item placed (8 of 8):** (1) `h1` `That link didn't work.`; (2) the sub-line =
  the server's message when there is one, else the fallback — the three concrete texts placed
  verbatim: `This confirmation link is invalid or has expired. Request a new one from your workspace.`
  (server `token_invalid`) · `This confirmation link is invalid or has expired.` (the client-side
  catch fallback for a non-`Error` throw) · `Open the newest confirmation email, or request another
  one from your workspace.` (the no-token / no-message case); (3) the 429 that can also land here —
  `Too many attempts. Try again in <N>.` (`verify`, 20/15min); (4) the two network strings;
  (5) the button `Sign in`; (6) **the copy tells the person to "request another one from your
  workspace" while this signed-out page has no resend control** — the resend lives only in the
  signed-in top bar (screen 29), so the real instruction is "sign in first, then click the pill".
  Preserved and flagged; a signed-out resend would need a new endpoint
  (`POST /api/auth/verify/request` requires a session), so it is a **feature** change, not a redesign
  item; (7) verification links live **24 hours** (`VERIFY_TTL_MS`) and the email says so, but **the
  page never states the window** → preserved as an absence; (8) the aside unchanged.
  **Also placed — the single most common real-world cause of this screen, and it is in no
  `information` list:** `createAuthToken()` runs
  `UPDATE auth_tokens SET usedAt=? WHERE accountId=? AND kind=? AND usedAt IS NULL` **before**
  inserting, so issuing any new token of that kind **silently kills every earlier unused one.** Clicking
  `Send reset link` twice invalidates the first email; the resend pill invalidates the previous
  confirmation link; a Settings email change invalidates the outstanding one. Only this screen's copy
  even hints at it (`Open the NEWEST confirmation email`) and the reset screens never say it. Recorded
  here as the reason the reset flow's "superseded" case is indistinguishable from "expired".
- **Every action placed (2 of 2):** (1) `Sign in` → **the same `proceed()` handler as the success
  button**, so it first calls `apiFetchSession()`: if a session exists (common — the link was opened in
  the browser where the person is already signed in) **the failed screen silently enters the
  workspace** instead of showing a sign-in form. Preserved; both outcomes are unlabelled and the copy
  fix is on the needs-approval list; (2) no resend, no back, no support link → preserved.
- **States:** this **is** the error state, merging invalid / expired / already-consumed / superseded /
  missing-token / rate-limited / network-down into one heading, with the server message as the only
  differentiator. Preserved, and the panel promotion is what makes that differentiator legible.
  *Loading* — `Opening…` on the button while `proceed()` runs.
- **Motion:** `acct-rise` on the inner; the state-keyed body entrance from screen 26; the aside set.
  **The heading swap is unanimated** and stays so. No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:152` (invalid) and `:155` (replayed/consumed) — server,
  **unchanged**. No client test renders it.

---

## 29. VerifyEmailBadge — the in-app resend pill (the only resend for this cluster)

- **Today:** app-shell furniture — a `.topbar-verify` pill rendered on every signed-in page when
  `data.account && !data.account.emailVerifiedAt`. It is inventoried here because it mails the link
  that lands on `#verify-email`. Styled in `hs-home.css:2101–2121` for **navy** chrome
  (`1px rgba(255,255,255,.28)` border, `rgba(255,255,255,.1)` fill, `#fff`, `12.5px/600`), collapsing
  to icon-only below 720px via `font-size: 0`.
- **Becomes:** **preserve's cluster owns the re-skin** (its §5a maps `.topbar-verify` to pill geometry
  `999px`, `12px/600`, a `1px rgba(28,28,26,0.13)` border and a hover that **inverts** to
  `#1c1c1a`/`#fdfcf9` — move 2 — with all four label states and both aria strings unchanged). This
  mapping's contribution is the three constraints that re-skin must respect, none of which are in
  preserve's own record:
  1. `hs-home.css:2121` targets `.topbar-verify span` **as well as** the button, but the component
     renders its label as a **bare text node with no `<span>`** — that selector is **dead**, and only
     the `font-size: 0` on the button itself collapses the label. A re-skin that "fixes" the selector
     without checking the DOM will do nothing and be believed.
  2. The `.is-sent` state must keep a **non-white** fill distinction on light chrome. Today it is
     `rgba(111,207,142,.25)` with a transparent border, which reads against navy. On paper it needs
     the funnel's own success pair (`rgba(47,158,107,.1)` fill, `rgba(47,158,107,.28)` border) so
     "Sent" stays visibly terminal.
  3. `App.test.tsx:1263` matches the button by the **aria-label pattern** `Confirm <email>: resend the
     confirmation email` (regex `/Confirm liam@example.com/`) and asserts `.business-context-verify` is
     **absent** on the dashboard and that at most one of `.hs-home-promo` /
     `.business-context-verify` / `.business-context-banner` renders. **Tier 2 frozen.**
- **Every information item placed (8 of 8):** (1) rest label `Confirm email` + `MailCheck` 14px
  `aria-hidden`; (2) in-flight `Sending…`; (3) success `Sent` + `.is-sent`; (4) failure `Try again`;
  (5) the always-present native `title` — `Confirm <email> to unlock team invites and billing`;
  (6) the `aria-label` — `Confirmation email sent` once sent, else
  `Confirm <email>: resend the confirmation email`; (7) below 720px the label collapses to
  `font-size: 0` and the pill is icon-only, **so the copy is invisible on phones** → preserved as-is,
  and note preserve's shell mapping stops hiding top-bar controls below 560px, which makes this pill
  the one that still loses its words; (8) the related-but-separate Settings › Team line
  `.business-context-verify` — `Invites go out once you confirm your own email. New ones are held
  until then.` with the same `MailCheck` (15px) — informational, **no resend button**, and pinned as
  absent-on-dashboard by the test above.
- **Every action placed (2 of 2):** (1) click → `resend()` → `POST /api/auth/verify/request` →
  `sent` / `failed`; (2) the button is disabled while `sending` **or** `sent`, so **`Sent` is a
  permanent terminal state for the life of that mount** — no countdown, no cooldown copy, no way to
  send a second link without a remount. Preserved. And the invisible outcomes, all collapsed into two
  words: the 429 (`verify-request`, 5/15min) whose `Too many attempts. Try again in <N>.` is
  **thrown away by a bare `catch {}`** and surfaces as `Try again` — *inviting exactly the retry the
  limiter just refused*; the 401 `Please sign in to continue.` → `Try again`; the already-confirmed
  200 `{alreadyVerified: true}` → `Sent` **with no mail sent**; the 502
  `We couldn't send the email just now. Please try again.` → `Try again`. All four preserved; plumbing
  `retryAfterSec` (present in the body **and** the header, discarded by the UI) into a visible cooldown
  is a real improvement and is on the needs-approval list.
- **States:** *Empty* — the badge is absent entirely once `emailVerifiedAt` is set. *Loading* —
  `Sending…` + disabled (`cursor: default`, `opacity .85`). *Error* — `Try again`, one label for three
  causes. *Add-on lock* — none.
- **Motion:** `background .18s ease, border-color .18s ease` → `var(--bf-dur-press)`; no keyframes;
  move 2 on hover per preserve. No reveal, no skeleton.
- **Tests touched:** `App.test.tsx:1263` — **passes unchanged** (the aria-label, the class assertions
  and the at-most-one-notice rule are all untouched); `server/test/api.test.ts:150/254/342/421` —
  server.

---

## 30. Login lockout — the state that is this cluster's advertised entry point

- **Today:** five wrong passwords for one email lock it for 15 minutes
  (`createLoginGuard(5, 15min, 15min)`); the 429 carries a `Retry-After` header and the body
  `Too many sign-in attempts. Try again in <N>, or reset your password.` — **the product's only copy
  that tells a locked-out person to use the reset flow**, and `POST /api/auth/reset` is what calls
  `loginGuard.clear()` to release the lock. It renders as one more sentence in screen 2's page-level
  `.acct-error`.
- **Becomes:** the same sentence in the same panel, with two presentation changes that make the
  instruction actionable without touching a word of it:
  1. The panel's `var(--bf-auth-prose)` cap means the variable-length `humanSeconds()` sentence
     (`… in 47 seconds.` / `… in 1 minute.` / `… in 15 minutes.`) wraps to a readable measure instead
     of running the column width.
  2. `Forgot password?` — which is the action that sentence names — sits in the password field's
     `.acct-label-row`, i.e. **below** the banner. When the banner's text contains
     `reset your password`, the link keeps the *link* accent role while the rest of the screen's accent
     budget is zero, so it is the one blue thing on the page. That is the accent budget doing real
     work rather than being asserted.
- **Every information item placed:** the 429 sentence; the `Retry-After` header and the body's
  `retryAfterSec` (**both read by nothing** — no countdown, no auto-retry, no disabled-until state);
  the full rate-limit table for context, none of which has bespoke UI copy — signup 10/hour per IP,
  login 30/15min, reset-request 5/15min **plus a silent 3/hour per email**, oauth-start and
  oauth-callback 30/15min, verify 20/15min, reset 20/15min, verify-request 5/15min, invite 60/hour,
  invite-peek 30/15min, invite-accept 10/hour. Also placed: `api.test.ts:196`'s note that the signup IP
  cap **answers before validation does**, so a 429 pre-empts every field message (screen 1).
- **Every action placed:** the sanctioned route out — `Forgot password?` → screen 3 → the email →
  screen 24, whose success clears the lock. And the **second, undocumented** escape hatch: provider
  sign-in calls `markEmailVerified()` and `loginGuard.clear()` for an existing account, so a
  locked-out person can get in via Google/Microsoft — which means the lockout copy's "or reset your
  password" is not the only way out, and it is a reason the provider block must stay reachable
  (screen 8).
- **States:** this is an error state of screen 2. Nothing renders it anywhere else.
- **Motion:** none of its own (`role="alert"`, no entrance). No reveal, no skeleton.
- **Tests touched:** `server/test/api.test.ts:183–217` (`Too many sign-in attempts`, the 429 and the
  `Retry-After` header) — server, **unchanged**.

---

## 31. Settings › "Your login" — the second producer of `#verify-email` links (cross-cluster)

Placed because the recovery record's completeness pass found it and because it falsifies the claim
that `VerifyEmailBadge` is the only resend in the product. **The settings cluster owns the re-skin**;
this entry exists so nothing here is lost between the two mappings.

- **Today:** a Settings section (`aria-labelledby="settings-account-title"`, kicker `<Users size={18}/>`
  + `Your login`, `h2` `Name and email`) built from the funnel's own atoms
  (`.settings-inline-form`, `.acct-input`, `.acct-hint`, `.acct-success`).
- **Becomes:** re-skinned in the settings cluster's own file, reading the same `--bf-auth-*` tokens so
  the five shared atoms do not diverge (§0.7's declared hand-off).
- **Every information item placed:** the status paragraph's three forms — `${email} is confirmed.` /
  `${email} is not confirmed yet.` / `Signed in to the demo workspace.`; the email-field hint
  `Changing it sends a confirmation link to the new address.`; the success notice in
  `.acct-success role="status"` — `Saved. We sent a confirmation link to <email> — open it to confirm
  the new address.`, else plain `Saved.`; and `Nothing to save.` when neither field changed.
  **Two of these are pinned VERBATIM by `tests/settings.test.tsx:376` and `:398`** — Tier 2 frozen.
- **Every action placed:** Save with a changed email → `PATCH /api/auth/account` →
  `sendVerificationEmail()` **fire-and-forget** (so an SMTP failure is invisible while the UI still
  claims the link was sent) → and, per `createAuthToken`, **it invalidates the previous outstanding
  link** (screen 28). A duplicate address answers 409 `An account with this email already exists.`
  with `{field: 'email', code: 'email_taken'}`.
- **States:** as above. **Motion:** the settings cluster's `sx-rise` keyframes — and the grafted
  warning applies: `.settings-panel-inner` is keyed by the active view while `useHudMotion`'s reveal
  effect has deps `[rootRef]` and never re-queries, so **Settings must keep `sx-rise` and must never be
  converted to `data-reveal`**, or the panel goes permanently blank with no error.
- **Tests touched:** `tests/settings.test.tsx:376`, `:398` — **must keep passing unchanged**; they are
  the reason the five shared atoms are a declared hand-off rather than a silent cascade.

---

## 32. The three transactional emails — the funnel's first screen, and an HTML surface

Step 1 of both recovery flows and of the invite flow is a **rendered HTML page** that no other
artifact inventories. `accountEmailShell(headline, body, cta, link, footer)` serves all three
(`server/src/email.ts:282–321`), so restyling one restyles all three.

- **Today:** Inter / `ui-sans-serif`, `max-width: 520px`, `padding: 32px 24px`, ink `#1c1c1a`,
  `line-height: 1.5`; a `13px/700` uppercase `letter-spacing: .08em` `#8a877e` eyebrow reading
  `BuildFlow`; `h1` `22px/600/-0.01em`; intro `15px #4a4944`; the CTA an inline-block pill
  (`padding: 12px 18px`, `radius 999px`, background **`#2f6bff`**, `#fff`, weight 600); then
  `12.5px #8a877e` `If the button does not work, paste this into your browser:` plus the raw link
  (`word-break: break-all`, `#2f6bff`); then a `12.5px #8a877e` footer. Every message also ships a
  plaintext `text` variant (`<title>\n\n<intro>\n\n<buttonLabel>: <link>\n\n<footer>`).
- **Becomes:** the shell is **already** on the language — one ground, Inter, one accent, the pill, the
  `#8a877e` eyebrow. Four changes, all values:
  1. The eyebrow joins the x1 rule: `13px/700/.08em` → `11.5px/650/0.045em` uppercase `#8a877e`.
     (It is already uppercase in the source string, so nothing about the text changes.)
  2. `h1` `22px/600` → `26px/600/-0.01em`. An email is read at arm's length on a phone and 22px is
     below every rung on the ladder; 26px is the app's page-title rung and the bottom of the funnel's.
  3. Intro `15px #4a4944` → `15.5px var(--wx-mut)`-equivalent `#575550`, capped at `52ch` (emails are
     the one surface where `max-width: 520px` already does this; the `ch` cap makes it survive a
     client that overrides the width).
  4. **The CTA pill is the one real mismatch and the reason this belongs in the mapping:** it is
     `#2f6bff`, and after decision #2 that is **correct and now matches the page it opens** — but the
     page's own primary is the **ink pill**. So the email CTA and the landing page it opens still do
     not match, in the opposite direction from what the record assumed. Resolution: the email CTA
     becomes the **ink pill** (`#1c1c1a` / `#fdfcf9`, `999px`, `12px 18px`) and the raw fallback link
     stays accent `#2f6bff`. One accent, one primary, across the email and the screen it lands on.
     Declared visible change.
- **Every information item placed — verbatim, all three messages:**
  - **Verify:** subject `Confirm your email for BuildFlow`; title `Confirm it's you, <FirstName>.`
    (falling back to `there` when `name.split(' ')[0]` is empty); intro `Tap the button to confirm this
    is your address. That unlocks inviting your team and managing billing.`; CTA
    `Confirm my email`; footer `This link works for 24 hours. If you did not create a BuildFlow
    account, ignore this email.`
  - **Reset:** subject `Reset your BuildFlow password`; title `Reset your password, <FirstName>.`;
    intro `Someone asked to reset the password for this BuildFlow account. If that was you, set a new
    one below.`; CTA `Choose a new password`; footer `This link works for one hour and can be used
    once. If you did not ask for this, your password is unchanged - you can ignore this email.`
  - **Invite:** subject `{Inviter} invited you to {Org} on BuildFlow`; headline
    `Join {Org} on BuildFlow.`; body `{Inviter} invited you to their workspace as a {role}. Set a
    password and you're in — crews, schedule and field updates included.`; CTA `Accept the invite`;
    footer `This invite works for seven days. If you weren't expecting it, you can ignore this email.`
  - Plus, on all three: the fallback line `If the button does not work, paste this into your browser:`,
    the raw URL, and the plaintext variant.
  - The link shapes: `<origin>/#verify-email?token=<urlencoded>` ·
    `<origin>/#reset-password?token=<urlencoded>` · `<origin>/#accept-invite?token=…`.
- **Every action placed:** the CTA (the primary path) and **the raw pasted link (an equally supported
  second path, and the one most likely to arrive truncated — i.e. the direct producer of screens 25,
  28 and 22)**. Both preserved; the fallback line must not be dropped in a "cleaner" email.
- **States:** no loading, no error, no empty — it is a static document. The one state worth naming:
  a **superseded** link (screen 28) still looks identical in the inbox.
- **Motion:** none, and none may be added — email clients strip animation and several strip
  `<style>` entirely, which is why the shell is inline-styled. Skeleton: n/a.
- **Tests touched:** none assert email markup. `server/test/api.test.ts:150/254/342/421` obtain
  `debugToken` under `NODE_ENV === 'test' || BUILDFLOW_EXPOSE_AUTH_TOKENS === '1'` — untouched.

---

## 33. The funnel below 900px — the second layout, not "the aside hidden"

- **Today:** `.acct-aside` is `display: none` **in the base rule** and promoted to `flex` inside
  `@media (min-width: 900px)` — mobile-first, which matters because **a mobile treatment must be added
  to the base, not removed from a max-width query**. `.acct-split` drops to one `1fr` column; the form
  column keeps `padding: clamp(28px,5vh,56px) clamp(20px,5vw,48px)`; and the wide variant's `100dvh`
  pin lives **inside** the 900px query, so below it the split grows and **the window scrolls** — a
  completely different scroll model from the desktop one. Consequences: on a phone the whole branded
  panel, the `Live schedule` board and the typewriter quote vanish, and with them **the only
  explanation of what the seeded workspace will contain**. The funnel has exactly **one** breakpoint of
  its own (900px); every other query in the file belongs to a specific step
  (`.acct-pick-grid` at 1180/620, `.acct-trade-grid` at 1180/560, `.acct-plan-grid`, `.acct-seats`,
  `.acct-invite-row` at 560).
- **Becomes:** the same two layouts, with the funnel's one genuine mobile defect addressed by CSS
  alone and no DOM move:
  - **The trade preview comes back on phones.** On `#business-type` only (the `<main>` carries the id,
    so no `:has()` is needed), the aside is promoted to `display: block` below 900px with its brand
    row, the viz card and the quote all `display: none` — leaving the dark glass `.acct-preview` panel
    as a full-width block beneath the form, on the dark window ground, with the 72px tail below it.
    Four rules. The panel keeps its single DOM node and its `aria-hidden` inheritance.
  - **It stays `aria-hidden`, and that is the remaining defect.** Making the preview *announced*
    requires moving it out of the aside subtree (a JSX change), which is on the needs-approval list
    with its reasoning and its test note. This mapping fixes the visual loss, states the a11y loss,
    and does not pretend the second is solved.
  - **The `dvh` fallback is frozen** (`min-height: 100vh` **and** `100dvh`) — dropping it
    re-introduces the iOS Safari clipped-viewport bug.
  - **The two scroll models are frozen and documented in the new stylesheet's header**, including the
    record's correction that the CSS's stated reason (`.welcome-page` sets `overflow: hidden auto`) is
    **stale** — `styles.css:54` now reads `min-height: 100vh; overflow-x: clip`, changed for the
    landing hero's sticky glyph portal. So "position: sticky is not an option" must be **re-tested
    before it is relied on again**, and until someone does, the `100dvh` + `overflow: hidden` pin
    stays exactly as it is.
  - Gutters go from a fixed `clamp(20px,5vw,48px)` to the same clamp (frozen) plus the tail, so a
    375px phone keeps 20px side gutters and gains 72px of bottom air where it currently has 28px.
- **Every information item placed:** on phones, everything in the **form column** of all eight screens
  is unchanged and fully present; the aside's decorative content (brand row, `Live schedule` board with
  its 4 lanes and 8 bars, the typewriter quote, the cite) is **absent by design** and stays absent —
  it is `aria-hidden` decoration, so no information is lost; the **one exception**, the trade preview
  and its 14 payloads, is restored above.
- **Every action placed:** identical to desktop on every screen — no action is behind a hover, a
  pointer or a width anywhere in this cluster (the funnel has no hover-reveal control layer, unlike the
  app shell), so the EDITORIAL touch-rescue graft has nothing to rescue here. Stated explicitly so the
  parent can see the cluster is clean on that axis.
- **States:** all states render identically; only the aside's presence differs.
- **Motion:** below 900px the six 12s aside loops **do not run at all** (`display: none`), which is
  what satisfies the ambient-loop licence for free (§0.6) and is worth keeping in mind if the aside is
  ever promoted on mobile for more than the preview panel: promoting the viz card too would start six
  infinite animations on a phone.
- **Tests touched:** none — jsdom applies no CSS and `matchMedia` is stubbed to `matches: false` for
  every query (`test/setup.ts:57`), so no breakpoint in this cluster is observable to the suite. That
  also means **the mobile layout has zero test coverage and must be checked in a browser at 375px,
  768px and 1440px** on all eight screens.

---

## Proposed removals — needs approval

**Nothing is removed by this mapping.** Every page, route, label, field, chart, button, state and
string in the four records still exists afterwards. Four items are *candidates* for removal and are
listed here rather than acted on:

1. **The `.acct-eyebrow` chip on the forgot-password screens.** `Launching September 21st` on the
   screen where a person is locked out of their account is the funnel's least useful line, and it is
   the only place the chip appears on a non-entry screen. Removing it (a `mode !== "forgot"` gate) is a
   1-line change. **Not done** — it is copy removal.
2. **The eyebrow's launch date itself.** `LAUNCH_DATE = new Date(2026, 8, 21)` means the string will
   read `Launching September 21st` after the launch date has passed. That is a content decision with a
   deadline, not a redesign item, and it is flagged so it is not discovered in production.
3. **`.acct-viz-job-cyan`'s third tone.** Re-basing the three lane tones onto the dark-window palette
   (§0.4) means cyan becomes `--bf-win-green` `#81c995`. If the reviewer prefers two tones to three,
   the cyan class can be dropped and its two bars re-assigned to blue — **not done**, because the
   record documents three tones and the bars' colour distribution is data (`ACCT_VIZ_LANES`).
4. **The dead `.topbar-verify span` selector** in `hs-home.css:2121` (the component renders a bare
   text node). Deleting the `span` half of that selector is safe and inert. **Not done here** — the
   file belongs to preserve's cluster and it is listed in the hand-off instead.

## Proposed changes needing approval (each with its cost)

Ordered by value. Every one is a copy, behaviour or a11y change — i.e. outside "presentation only" —
and none is included in the phases above.

| # | Change | Where | Cost |
|---|---|---|---|
| 1 | Add a hidden `<input type="text" name="username" autocomplete="username" value={email}>` (visually hidden, `tabindex="-1"`, `aria-hidden`) to the reset form | screen 24 | 1 line. Today most password managers cannot associate the `new-password` value with an account, so the reset silently fails to update the saved credential. **Highest value in the list.** No copy, no visible change, but it adds a DOM node — needs approval under invariant #4 |
| 2 | Route the reset screen's `request a new one` to `mode: 'forgot'` instead of `mode: 'login'` | screen 25 | 1 line. Today the dead-end sends people to a login form and makes them re-find `Forgot password?` |
| 3 | Give screen 27's and screen 28's shared `proceed()` handler honest copy for its two destinations | screens 27, 28 | new copy. One button says `Continue to BuildFlow` whether it enters the workspace or drops the person on the sign-in form |
| 4 | A `useRef` once-guard on the verify effect (StrictMode double-fire against a one-time token) | screen 26 | ~4 lines. **Should be taken before this screen is redesigned, not after** — otherwise the redesigner debugs a phantom failure |
| 5 | `disabled={busy}` on the invite step's secondary `Skip for now` | screen 18 | 1 word. Today it can be clicked mid-POST, sending the invites but never showing the results |
| 6 | `aria-describedby` from the plan radiogroup to `#additional-products-error` | screen 13 | 1 attribute; step 1 already does it. Keep `role="alert"` |
| 7 | `role="status"` on the funnel's invite results `<ul>` | screen 19 | 1 attribute, with **parity precedent** — `settings.test.tsx` already asserts a `status` for the Settings twin |
| 8 | `role="alert"` on the invite-row field errors | screen 18 | 1 attribute; the accept form's field errors already carry it |
| 9 | `aria-pressed` on the three password toggles | screens 1, 21, 24 | 1 attribute × 3. Changes what a screen reader says |
| 10 | Key the invite-row `errors` map by a stable row id instead of the array index | screen 18 | ~10 lines. Today removing a row can leave a message under the wrong row |
| 11 | Move the trade preview out of the `aria-hidden` aside so it is announced | screens 11, 33 | a JSX move. Adds text to the accessible tree; no role query is affected, but `getByText` surfaces grow — needs a test read-through |
| 12 | Plumb `retryAfterSec` into a visible cooldown on the resend pill and the 429 banners | screens 29, 30 | new UI + copy. The value is already in the body and the header and is discarded |
| 13 | Fix forgot mode's aside copy (it types the **signup** line) | screen 3 | copy. Flagged prominently because **not** flagging it means the redesign is blamed for it |
| 14 | Route the accept form's server `field` through signup's `isSignupField` | screen 21 | ~5 lines. Today a server `Enter your name.` renders at the top of the form |
| 15 | `matchMedia` change listener in `WxTypewriter` | screens 1–3, 10–13, 18–22, 24–28 | ~6 lines. Reduced motion is read once per mount |
| 16 | A step indicator for the three-step funnel | screens 10, 13, 18 | new copy **and a new heading candidate** — must not shadow the `h1` in `findByRole("heading")`. Also must reconcile with the CSS's own numbering (create-account = step 1) |
| 17 | `autoFocus` on the first field of the signup/login form | screens 1, 2 | behaviour. Its siblings (`App.tsx:7521`, `:8014`) already autofocus, so the inconsistency is visible either way |
| 18 | A form-level error summary above the fields | screen 1 | **breaks `App.test.tsx:120`** (`findByRole("alert")` is singular). Requires a test update, and is the reason it is not in the plan |
| 19 | Real radio semantics for the four plan cards | screen 13 | **breaks `App.test.tsx:168/177` and `appHarness:173`** (`getByRole("button", {name: "Select <Plan> plan"})`). The invites record's risk line claims the tests query by aria-label rather than role; its own anchor line shows otherwise. **Conservative reading taken: the `<button aria-pressed>` role is frozen.** Fixing it needs 3 test edits |
| 20 | Verify the reset token on arrival (so expired ≠ missing) | screens 24, 25 | a new request on mount + a fourth state. Real improvement, real behaviour change |
| 21 | A resend on the signed-out verify-failed screen | screen 28 | **a new endpoint** (`verify/request` needs a session). A feature, not a redesign item |
| 22 | Surface add-on prices on the step where add-ons are chosen | screen 13 | copy + billing. Note the correct prices are **$12 / $9 / $8 / $15** and three of four are included in Business/Enterprise |
| 23 | Show `expiresAt` on the accept form ("expires in N days") | screen 21 | copy. Free information already fetched; must handle the already-expired case where no preview exists |
| 24 | An empty state for the invite results when every address was skipped | screen 19 | copy. Today three grey `Already has a BuildFlow account.` lines render as a success panel |
| 25 | Decide native bubbles vs app messages on the invite editor (`noValidate`) | screen 18 | **`settings.test.tsx:253–255` encodes the current behaviour.** A real design decision either way |

## Consolidated test impact

**346 tests, 37 files. This mapping expects to edit ZERO of them.** Everything it changes is CSS, six
`data-busy` attributes, three comment blocks, one `min()` in an `animation-delay`, one wrapper
component around an `aria-hidden` decorative card, and two `aria-describedby` id lists on the reset
input. No string, no role, no accessible name, no label boundary, no DOM order and no request changes.

| Test / anchor | Screens | Verdict |
|---|---|---|
| `appHarness.tsx:91–99 enterDashboard()` — **79 refs / 6 files** | 2 | **passes unchanged** (labels `Email` / `Password`, button `Sign in`, then `Search BuildFlow`) |
| `appHarness.tsx:103 openCreateAccount()` | 1, 2 | **unchanged** (`Login from welcome navigation` → `Welcome back.` → `Create an account`) |
| `appHarness.tsx:146 signUp()` | 1, 10 | **unchanged** (4 labels + `I agree to the` + `Create account` → the business-type heading) |
| `appHarness.tsx:159 chooseBusinessType()` | 10 | **unchanged** (radio by trade name → `Get BuildFlow`) |
| `appHarness.tsx:167 chooseProductsAndPlan()` | 13, 18 | **unchanged** (checkbox by label regex on a real `<input>`, `Select <Plan> plan` as a **button**, `Continue to BuildFlow`, `Skip for now`) |
| `appHarness.tsx:181 completeOnboarding()` | 10–19 | **unchanged** |
| `App.test.tsx:31–40` | 1, 2 | **unchanged** (both funnel entry buttons) |
| `App.test.tsx:42` | 1 | **unchanged** (heading, 4 labels, placeholder, buttons, unchecked box, hash, providers absent) |
| `App.test.tsx:62` | 1, 2, 8 | **unchanged** (provider gate, alert, start-URL params) |
| `App.test.tsx:101` | 1, 2 | **unchanged** |
| `App.test.tsx:120–131` | 1, 9, 24 | **unchanged — and it constrains the design**: `findByRole("alert")` is singular, so no error summary (needs-approval #18) |
| `App.test.tsx:135–151` | 10, 13, 16 | **unchanged** (heading, radiogroup, all 14 radios, both hashes) |
| `App.test.tsx:153–177` | 13, 14 | **unchanged** (free text, 4 plan **buttons**, disabled→enabled on the same node, `Seats`=5, `$240 / month`, the relabel) |
| `App.test.tsx:180–205` | 13, 16, 18 | **unchanged** (byte-for-byte POST body + key order, 3 `localStorage` keys, `Skip for now`, the blank-workspace empty states) |
| `App.test.tsx:189–190` | 18 | **unchanged** |
| `App.test.tsx:228` | 13, 16 | **unchanged** (the tutorial dialog copy derived from the picks) |
| `App.test.tsx:~420` (it.each, 4 plan CTAs) | 1 | **unchanged** |
| `App.test.tsx:1085` (transient-failure path) | 7 | **unchanged** (the rail is a `::before`) |
| `App.test.tsx:1263` | 29 | **unchanged** (the `Confirm <email>` aria-label pattern, `.business-context-verify` absent, at most one notice) |
| `tests/settings.test.tsx:220–284` | 18, 19 | **unchanged — and it is why `InviteRows` is restyled, never restructured** (the `.acct-invite-*` rules are written unscoped on purpose) |
| `tests/settings.test.tsx:376, :398` | 31 | **unchanged** (two verbatim strings; the five shared atoms are a declared hand-off to the settings cluster) |
| `tests/tutorial.test.tsx:109–200` | 13, 16 | **unchanged** (the setup key derives from the two onboarding answers) |
| `schedule/boundary.test.ts` | — | **unchanged**. No new class in this cluster matches `/sched-/` or `/gantt-/`, and the one new component lives in `components/ui/`, which the boundary test does not police |
| `server/test/api.test.ts:41, 76, 82, 128–140, 150, 163–165, 169–180, 183–217, 220–331, 334, 421, 436–440, 479–527` | all | **untouched** (server) |
| `server/test/oauth.test.ts:102, 104, 110–137, 139, 152` | 5, 6, 8 | **untouched** (server) |

**Two new tests budgeted** — the cluster's biggest coverage hole is that **zero client tests render
`#reset-password`, `#verify-email` or `#accept-invite`**, i.e. 9 of the 33 screens here, including
three password forms and five terminal states. Both new tests are additive:

1. `tests/auth-recovery.test.tsx` — renders `#reset-password` with and without a token and asserts:
   the invalid-link branch shows `Choose a new password.` + the panel sentence + the
   `request a new one` **button** and **no** password input; the valid-token branch shows the input,
   the toggle's `Show password` / `Hide password` flip, that a 7-character value produces
   `Password must be at least 8 characters.` with **no** `POST /api/auth/reset`, and that a
   `weak_password` 400 carrying a fresh `token` leaves the form usable for a second attempt (the
   handoff at `App.tsx:7469–7474`, currently protected by nothing on the client).
2. `tests/auth-invite-accept.test.tsx` — renders `#accept-invite?token=…` against a stubbed preview and
   asserts `Join Asphalt Co.`, the interpolated sub-paragraph, the read-only `Email`, the terms box by
   `getByLabelText("I agree to the")`, the submit named `Join Asphalt Co`, and the 404 branch's
   `This invite didn't work.` + `Sign in instead`.

Both are guards on Tier 3 strings, which is exactly where a redesign drops things silently. Neither
changes an existing file.

## Acceptance checklist

1. **The full 346 pass, unedited.** Run order (cheapest signal first):
   `App.test.tsx` → `tests/settings.test.tsx` → `tests/tutorial.test.tsx` →
   `schedule/boundary.test.ts` → the rest.
2. **A computed-style diff** over the eight split screens × 3 widths (375 / 768 / 1440) before and
   after each phase, asserting: every colour, radius, border-width and shadow in §0.4's tables
   changed; **no** `font-size` on a frozen surface moved (`.acct-head h1`, `.acct-head p`,
   `.acct-field label`, `.acct-input`, `.acct-hint`, `.acct-field-error`, `.acct-pick-copy strong`,
   `.acct-pick-copy em`, `.acct-invite-results li`); and no element's `white-space` /
   `text-overflow` changed (the trade taglines).
3. **A grep gate on `auth-daylight.css`:** zero occurrences of `:where(`, zero `!important`, zero of
   the 14 retired literals in §0.4, zero renamed selectors (every selector must already exist in
   `account-redesign.css`), and every `@keyframes` name must be one of the nine existing names plus
   `acct-busy`.
4. **A manual walk of all 253 information items** against §§1–33, with priority on the **9 screens no
   test renders** (24–28, 20–22, and the three emails) — this document is their only record.
5. **The 72px tail and the two scroll models verified in a browser** on `#business-type`,
   `#additional-products` and `#invite-team` at 1440 × 720 (a short viewport, where the wide variant's
   `100dvh` pin bites) and at 375 × 667.
6. **The trade taglines checked for new truncation** at all 14 trades — the `nowrap` + `ellipsis`
   clamp means any type or padding change silently eats copy.
7. **The reduced-motion path verified with the OS setting on**, on all eight screens: `acct-rise`
   nulled, the eyebrow dot still, the six viz loops still, `.acct-viz-job.is-fix` **parked at
   `translateX(150%)` in blue** (not amber, and not overlapping), the sweep hidden, the strength bars
   un-transitioned, the typewriter snapped to full text, the rail static, and `AuthStage` binding no
   listener. All three existing blocks extended, none merged.
8. **The email CTA rendered in a real client** (the ink-pill change) against the page it opens.
9. **Phase F's parity-block deletion done alone**, after 2 passes green, with the diff from step 2 as
   the evidence.
