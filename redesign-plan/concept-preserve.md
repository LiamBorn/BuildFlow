# Concept: **Daylight Rail**

> The rail stays. The light changes.
>
> One of four independent app-shell proposals. This is the low-risk one: it does not move a single
> pixel of load-bearing geometry, and it argues that it does not have to.

---

## 1. Thesis

**The Welcome Page's feel is carried by its palette, its surfaces, its accent, its curve and its
hover grammar — not by its layout.** Cover the marketing page's 108px section gaps and 96px hero
and you still recognise it instantly: one flat `#f5f6fa` ground with no banding, white paper cards
with a 1px hairline and a soft 30px shadow, Inter at 500/600, exactly one blue, a 999/26/20/18/12/8
radius ladder, `cubic-bezier(0.22, 1, 0.36, 1)` on everything, four hover moves and no fifth, and
reveals that fire once and never replay.

Every one of those nine things is a *surface* property. Not one of them needs vertical space.

What actually makes today's app read as a different product is not that its type is 13px. It is
that:

1. **The chrome is a dark band.** `--hs-navy #14203a` on the top bar and rail is the one thing the
   Welcome Page explicitly forbids — "there is no alternating light/dark section banding anywhere
   on the page." The app opens with a 56px dark band and then a 56px dark column down the left.
2. **The surfaces are the wrong species.** `.hs-index-card` is `radius: 14px` with
   `box-shadow: 0 1px 2px rgba(20, 32, 58, 0.04)`; `.dash-block` is 12px. The Welcome Page's paper
   card is 18–20px with `0 10px 30px rgba(28, 28, 26, 0.05)`. One is a Material-era table card, the
   other is a sheet of paper. That single difference is most of the family resemblance.
3. **There are three inks.** `--hsx-ink #14203a` (page titles), `--hsx-text #1c1c1a` (body),
   `--cc-*`/`--hsh-*` copies of both. The Welcome Page has two: `--wx-ink #1c1c1a` and
   `--wx-mut #575550`.
4. **There is no hover grammar.** Rows get a background wash, cards get nothing, links get nothing.
   Four different durations (`0.12s`, `0.14s`, `0.15s`, `0.18s`) and mostly `ease`, not the curve.
5. **The accent is doubled.** `#2f6bff` plus a gold `#f0b354`/`#e8a33d` star plus a violet
   `#7c3aed`/`#a78bfa` beta pill. The Welcome Page has one accent and spends its gradient trio on
   exactly three things.

Fix those five and the app is the same product. None of the five requires touching
`--hs-topbar-h: 56px`, `--hs-rail-w: 56px`, `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`,
`DASH_GAP = 16`, the rail→flyout `offsetTop` maths, or a single accessible name the harness
navigates by.

**So: preserve the rail, and re-skin it into daylight.**

---

## 2. Why the geometry is genuinely load-bearing (the case for not touching it)

Not sentiment — four hard couplings, all verified:

| Coupling | Evidence | What breaks if geometry moves |
|---|---|---|
| `hs-breeze.css` hard-codes the chrome | `hs-breeze.css:17-18` `top: 56px; left: 56px`, `:43` `width: min(600px, calc(100vw - 56px))` | The AI panel overlaps or gaps against the bar/rail. It reads literals, not `--hs-topbar-h`/`--hs-rail-w`. |
| The flyout is positioned from `offsetTop` | `App.tsx:20561` `setFlyoutTop(anchor.offsetTop)`; `.hs-flyout { left: var(--hs-rail-w); top: var(--hs-flyout-top) }`; a 10px invisible `::before` bridge; a 140ms close timer | Padding, animation or scroll on `.hs-rail-slot` makes flyouts drift or close mid-pointer-travel. |
| `dashGrid` layouts are persisted | `DASH_COLS = 6`, `DASH_ROW_UNIT = 40`, `DASH_GAP = 16`, independently re-declared as `grid-auto-rows: 40px` in `hs-home.css:2046`; users hold layouts in `dash:layout` | Row unit or column count changes silently re-flows every saved board. |
| The harness navigates by rail hub → flyout menuitem | `test/appHarness.tsx` `openAppPage()` / `openSchedule()`; `HUB_OF` maps 7 pages to 4 hubs; hub matched by `^<Hub>( \(.*\))?$`; `fireEvent.mouseOver(hub)` then `fireEvent.click(menuitem)` | Nearly all of the 346 tests, at once. |

A concept that keeps all four intact spends its entire budget on *appearance*, which is where the
family resemblance actually lives.

---

## 3. The translation: what carries over literally, what gets re-scaled

### 3a. Carries over **literally** — same value, no adjustment

| Thing | Value, unchanged from `DESIGN_TOKENS.md` |
|---|---|
| Ground | `#f5f6fa`, one ground, end to end, sections transparent. (`--hs-paper` is already this — the chrome just stops opting out of it.) |
| Ink / muted / faint | `#1c1c1a` / `#575550` / `#8a877e` |
| Hairlines | `rgba(28, 28, 26, 0.13)` and `rgba(28, 28, 26, 0.07)` |
| Card fill | `#ffffff` |
| Accent | `#2f6bff`, exactly one |
| Gradient trio | `#4285f4 → #9b72cb @54% → #d96570`, spent in-app on **one** thing: the AI sparkle (the sanctioned `.wx-grad-ai` role) |
| Radius ladder | `999 / 26 / 20 / 18 / 12 / 8` px, plus `50%` for avatars and dots |
| Shadow ladder | all seven steps verbatim: `0 10px 30px /.05`, `0 4px 12px /.08`, `0 8px 22px /.2`, `0 26px 60px /.12`, `0 24px 70px /.14`, `0 34px 64px /.13`, focus `0 0 0 4px` |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` everywhere; `cubic-bezier(0.4, 0, 0.2, 1)` only for height/grid |
| Interaction durations | `0.18s` press · `0.25s` hover · `0.28s` transform · `0.3s` panel |
| Entrance durations | `0.7s`–`1.0s`, once |
| Hover grammar | four moves: lift cards, invert pills, slide directional links, tilt mocks |
| Reveal contract | `threshold: 0.16`, `rootMargin: '0px 0px -6% 0px'`, add `.in`, **unobserve**. One-shot. |
| Copy measures in `ch` | prose gets a `ch` cap, never a px cap |
| Typeface | Inter, one family, no second face; italic `em` is the only display accent |

### 3b. Gets **re-scaled** for density — with the numbers and the compression factor

| Role | Welcome Page | Daylight Rail (dense) | Factor |
|---|---|---|---|
| Largest type on the surface | hero `clamp(46px, 6.8vw, 96px)` | page `h1` `clamp(22px, 1.9vw, 26px)`, `-0.02em`, `1.14` | ÷3.7 |
| Second display | section h2 `clamp(32px, 4.4vw, 54px)` | card head `16px`/600/`-0.01em` | ÷3.4 |
| Figure | stat `clamp(46px, 5.4vw, 72px)`, `-0.02em` | KPI `clamp(20px, 1.6vw, 26px)`, `-0.02em`, `tabular-nums` | ÷2.8 |
| Lede | `clamp(16px, 1.35vw, 19px)` | page subtitle `14px`, measure `62ch` | ÷1.36 |
| Body | 15–16px | table/list row `13px`, `1.45` | ÷1.2 |
| Eyebrow / label | 11.5–13px, accent-coloured | `11.5px`/650/`0.045em`/uppercase/`#8a877e` — **the same element, same size** | ×1 |
| Section rhythm | `clamp(76px, 12vh, 130px)` → 108px @1440 | between top-level cards `clamp(20px, 3vh, 34px)` → 27px @900 tall (`--bf-rhythm-dense`, already declared) | ÷4.0 |
| Inside a card | head margin `0 auto 54px` | head margin `0 0 12px` | ÷4.5 |
| Page gutter | page measure 1140px centred | `clamp(18px, 2vw, 28px) clamp(18px, 2.4vw, 32px) 40px`, **no max-width** | n/a |
| Card hover lift | `translateY(-6px)` | `translateY(-4px)` on cards under 200px tall (`--bf-lift-dense`) | ÷1.5 |
| Ring alpha on paper | `rgba(26,115,232,0.12)` focus | rail ring animation alpha `0.45 → 0.14` | ÷3.2 |

**The shape of the ladder is preserved, the span is compressed.** Welcome runs body→hero at 6.4×.
Daylight runs row→title at 2.0×. Rhythm compresses 4.0× and type compresses ~3.5×, which is close
enough that the two feel like the same system at two zoom levels rather than two systems.

Deliberately **does not** carry over: the 1140px page measure (a 6-column board and a 12-column
table need the width), and any display size at all (nothing in the app exceeds 26px).

### 3c. The tokens, exactly

Append to `client/src/design-tokens.css` (all new names under the already-unused `--bf-` prefix, so
this file stays pixel-inert until something reads it):

```css
:root {
  /* ---- dense type scale: the app-side companion to --bf-type-* ---------- */
  --bf-app-title:        clamp(22px, 1.9vw, 26px);  /* page h1 — never below today's 22px */
  --bf-app-title-track:  -0.02em;
  --bf-app-title-lead:   1.14;
  --bf-app-section:      16px;                       /* card / section head */
  --bf-app-panel:        14.5px;                     /* dashboard panel h2 — FROZEN, see §6f */
  --bf-app-figure:       clamp(20px, 1.6vw, 26px);   /* KPI value */
  --bf-app-figure-track: -0.02em;
  --bf-app-lede:         14px;
  --bf-app-row-strong:   13.5px;                     /* primary cell, menu row */
  --bf-app-row:          13px;                       /* table cell, list row */
  --bf-app-meta:         12px;                       /* timestamp, secondary */
  --bf-app-eyebrow:      11.5px;                     /* uppercase label / column head */
  --bf-app-eyebrow-track: 0.045em;
  --bf-app-micro:        11px;                       /* badge, pill text */
  --bf-app-lead-row:     1.45;

  /* ---- dense measures --------------------------------------------------- */
  --bf-app-prose:        62ch;   /* every run of prose in-app: empty states, tutorial body,
                                    add-on copy, AI messages, tooltips */
  --bf-app-gutter-y:     clamp(18px, 2vw, 28px);
  --bf-app-gutter-x:     clamp(18px, 2.4vw, 32px);

  /* ---- the fourth hover move, re-scaled -------------------------------- */
  --bf-lift-dense:       -4px;
  --bf-spotlight-r:      220px;
  --bf-spotlight-a:      0.06;
}
@media (prefers-reduced-motion: reduce) {
  :root { --bf-lift-dense: 0px; --bf-spotlight-a: 0; }
}
```

Two **corrections** to `design-tokens.css` as it stands, both consequences of decision #2 (the
accent is `#2f6bff`):

```css
--bf-focus-ring: 0 0 0 4px rgba(47, 107, 255, 0.12);  /* was rgba(26, 115, 232, 0.12) */
```

and the `#1a73e8` literal in its comment block. The full accent migration is 15 `#1a73e8`
occurrences across 12 files plus 55 `rgba(26, 115, 232, …)` occurrences across 21 files — but only
**14 of those are inside app scopes** (`dashboard-redesign.css` ×4, `projects-redesign.css` ×3,
`schedule.css` ×2, `equipment-` / `materials-` / `field-updates-redesign.css` ×1 each,
`design-tokens.css` ×1, `sidebar-redesign.css` ×3 which is being deleted anyway). The other 56 are
the Welcome Page and the auth split moving to the app blue, which is decision #2 already made.

And decision #4, executed: delete `--wx-serif` from its 10 app-scope declarations
(`dashboard-`, `projects-`, `project-dialog-`, `crews-`(n/a), `equipment-`, `materials-`,
`field-updates-`, `delayIQs-`, `apply-redesign.css`, `sidebar-redesign.css`, `schedule.css:679`)
and rewrite the `var(--wx-serif)` reads in those same app scopes (27 rules) to
`var(--bf-font-sans)`. `welcome-redesign.css:34` keeps its declaration — its value already *is* the
Inter stack, and the marketing scopes are not in scope.

---

## 4. How it ships: one class, one stylesheet, one kill switch

The CSS load order in `main.tsx` is hand-tuned and ends with
`import "./app-shell-hubspot.css"; // loads last so it wins`. Reordering regresses everything, so
**nothing is reordered.** One line is appended:

```ts
import "./app-shell-hubspot.css"; // HubSpot-style app shell — loads last so it wins
import "./app-shell-daylight.css"; // the Welcome Page's language over that shell — loads after it
```

and one string is added to `shellClassName` (`App.tsx:2795`):

```ts
const shellClassName = [
  "app-shell",
  "bf-shell",                       // ← the re-skin's scope; delete this word to revert the concept
  page === "schedule" ? "schedule-shell" : "",
  …
```

**The specificity recipe, applied mechanically to every rule in the new file:** take the existing
selector verbatim and prefix `.bf-shell`. Nothing else. That guarantees each new rule is exactly
one class more specific than the rule it replaces *and* later in the cascade, so it wins without
`!important` and without touching the file it overrides:

| Existing | New |
|---|---|
| `.hs-shell .topbar.hs-topbar` (3) | `.bf-shell .hs-shell .topbar.hs-topbar` → written `.hs-shell.bf-shell .topbar.hs-topbar` (4) |
| `.hs-index .hs-index-card` (2) | `.bf-shell .hs-index .hs-index-card` (3) |
| `.dash-rx.hs-home .dash-board .dash-block` (4) | `.bf-shell .dash-rx.hs-home .dash-board .dash-block` (5) |

No `:where()` anywhere — it is a documented jsdom breaker in this repo. No `!important`. Estimated
size: **~640 lines**, one file, one scope. `sidebar-redesign.css` (307 lines, `.sidebar-rx`, which
appears nowhere in `App.tsx`) is deleted along with its `main.tsx` import in the same phase, so the
stylesheet count goes 57 → 58 → 57.

---

## 5. The chrome, surface by surface

### 5a. Top bar — 56px, paper, translucent

Geometry frozen: `height: 56px`, `padding: 0 14px 0 10px`, `gap: 14px`, `position: sticky`,
`z-index: 40`, single row at every width, DOM order untouched (the bell must still precede the
account control — `tests/tutorial.test.tsx:286`), CSS `order` values untouched
(create 1 · help 2 · settings 3 · notifications 4 · divider 5 · account 6).

```css
.hs-shell.bf-shell .topbar.hs-topbar {
  background: rgba(245, 246, 250, 0.82);
  backdrop-filter: blur(14px) saturate(140%);
  border-bottom: 1px solid rgba(28, 28, 26, 0.07);
  box-shadow: none;                      /* a hairline, never a shadow — the Welcome nav's recipe */
  color: #1c1c1a;
}
```

That is the Welcome Page's nav verbatim (`rgba(245, 246, 250, 0.82)` + backdrop blur) at 56px
instead of 64px.

- **Brand** `17px/750` → `16.5px/700/-0.02em`, colour `#1c1c1a`. Mark stays 30px. Hover wash
  `rgba(255,255,255,0.08)` → `rgba(28,28,26,0.05)`. `hs-rail-pop` keeps its name, keeps its spring.
- **Search** becomes a pill — the Welcome Page's only search-shaped grammar:
  `height: 36px; border-radius: 999px; background: #fff; border: 1px solid rgba(28,28,26,0.13);
  padding: 0 12px 0 14px`. Input `13.5px/500`, colour `#1c1c1a`, placeholder `#8a877e`.
  `:focus-within { border-color: #2f6bff; box-shadow: var(--bf-focus-ring) }`. The `⌘K` `<kbd>`
  chip: `background: rgba(28,28,26,0.05); border-radius: 6px; font-size: 11px; color: #575550`.
  **It stays a read-only `<input aria-label="Search BuildFlow">` inside its `<label>` with both
  `onClick` and `onFocus`** — `enterDashboard()` gates on `findByLabelText("Search BuildFlow")`, so
  this is the single most dangerous element in the shell to restructure. Restyled only.
- **AI sparkle** keeps its gradient, re-based to the trio:
  `linear-gradient(96deg, #4285f4 0%, #9b72cb 54%, #d96570 100%)`, radius 999px, 36px.
  `hs-top-twinkle` unchanged. This is the app's one licensed use of the gradient.
- **Icon buttons** 36px, radius `8px → 12px` (onto the ladder), rest colour `#575550`,
  hover/`[aria-expanded="true"]` `background: rgba(28,28,26,0.05); color: #1c1c1a`,
  `:focus-visible { box-shadow: var(--bf-focus-ring) }` (was a 0.45-alpha ring built for navy).
- **Bookmarks star** `.has-items` gold `#f0b354` → `#2f6bff` with `fill: currentColor`. **Declared
  visible change**, made in service of "one accent"; the filled-vs-outline distinction that carries
  the information is untouched. Count badge `.hs-bookmarks-count` stays a blue pill.
- **Verify-email pill** `.topbar-verify`: pill geometry `999px`, `12px/600`, border
  `1px solid rgba(28,28,26,0.13)`, hover **inverts** to `#1c1c1a`/`#fdfcf9` (move #2). All four
  label states and both aria strings unchanged.
- **Divider** `1px × 22px`, `rgba(28,28,26,0.13)`.
- **Account button** avatar 30px `50%`, `#2f6bff` fill, `#fff` initials; chevron `#575550`.

### 5b. Rail — 56px, paper, and finally focusable

```css
.hs-shell.bf-shell .sidebar.hs-rail {
  background: #f5f6fa;                              /* opaque: the flyout needs ground under it */
  border-right: 1px solid rgba(28, 28, 26, 0.07);
  color: #575550;
}
```

Frozen: `width: var(--hs-rail-w)`, `position: sticky; top: var(--hs-topbar-h)`,
`height: calc(100vh - var(--hs-topbar-h))`, `overflow: visible`, `padding: 10px 0`,
`.hs-rail-list { gap: 6px }`, `.hs-rail-slot` and its `onMouseEnter`, button `40×40`.

| State | Today (navy) | Daylight |
|---|---|---|
| rest | `transparent` / `#b9c6d8` | `transparent` / `#575550`, radius `10px → 12px` |
| hover · `.open` · focus | `rgba(255,255,255,0.10)` / `#fff` | `rgba(28,28,26,0.05)` / `#1c1c1a` |
| `:focus-visible` | **`outline: 0` and nothing else** | `+ box-shadow: var(--bf-focus-ring)` — fixes the recorded weakness that the rail's focus affordance is weaker than the top bar's |
| `.active` | `#2f6bff` + `0 6px 16px rgba(47,107,255,0.38)` | `#2f6bff` + `0 4px 12px rgba(47,107,255,0.24)` (the `--bf-shadow-raised` step, tinted) |
| `.recommended::after` | 6px blue + `0 0 0 2px #14203a` | 6px blue + `0 0 0 2px #f5f6fa` |
| `.hs-rail-tag` New / Beta | `#2f6bff` / `#a78bfa` | `#2f6bff` / `#6d28d9` (the light-on-navy violet disappears on paper) |
| `hs-rail-ring` | `rgba(47,107,255,0.45)` pulse | same keyframe, alpha `0.14` |
| bottom hairline | `rgba(255,255,255,0.08)` | `rgba(28,28,26,0.07)` |

`hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping` all **keep their names** — the four
`prefers-reduced-motion` blocks in `app-shell-hubspot.css` (lines ~673, ~855, ~942, ~1115) null them
by name, and renaming would silently un-null them.

**Short-viewport fix (pure CSS, no JS, no scroll):** 9 hubs × 46px + gear 48px + padding 20px =
**482px** of rail, so today's rail overflows with no scroll and no affordance below ~540px of
viewport height (a landscape phone, a half-height window).

```css
@media (max-height: 620px) {
  .hs-shell.bf-shell .hs-rail-list { gap: 4px; }
  .hs-shell.bf-shell .hs-rail-btn  { width: 36px; height: 36px; }   /* 9×40 + 48 + 20 = 428px */
}
```

I deliberately do **not** make the list scrollable, because `setFlyoutTop(anchor.offsetTop)` is not
scroll-adjusted and a scrolled list would mis-place every flyout. If a 10th hub ever lands, the fix
is `setFlyoutTop(anchor.offsetTop - list.scrollTop)` plus `overflow-y: auto` on `.hs-rail-list`
only (never on the `aside`, which must stay `overflow: visible` so flyouts escape) — noted here so
the next person does not discover it the hard way.

### 5c. Flyout — the same 12px-off-the-rail popover, in paper

```css
.hs-shell.bf-shell .hs-flyout {
  background: #fff;
  border: 1px solid rgba(28, 28, 26, 0.07);
  border-radius: 18px;                       /* was 12px — floating panels sit at 18 */
  box-shadow: 0 24px 70px rgba(28, 28, 26, 0.14);   /* --bf-shadow-float */
  padding: 10px;
  animation: hs-flyout-in 0.2s var(--bf-ease) both;  /* was 0.16s */
}
```

Frozen: `position: absolute; left: var(--hs-rail-w); top: var(--hs-flyout-top)`, `min-width: 228px`,
the 10px `::before` bridge, the 140ms close timer, `role="menu"`, `aria-label="<Hub> menu"`,
`transform-origin: left top`.

- Head: `14px/700` white → **eyebrow**: `11.5px/650`, `0.045em`, uppercase, `#8a877e`.
- Item: `13.5px/500`, `#1c1c1a`; icon 16px `#8a877e`.
- Hover: `rgba(28,28,26,0.05)` **plus `translateX(3px)`** — move #3, the menu-row nudge.
- Active: `rgba(47,107,255,0.08)` fill, `#2f6bff` text, weight 650 (was a 14% white wash).
- `.hs-flyout-tag`: NEW `#2f6bff` on `rgba(47,107,255,0.10)`; BETA `#6d28d9` on
  `rgba(109,40,217,0.10)`; `10.5px/700` uppercase, radius 999px.
- `.hs-flyout-star`: gold `#e8a33d` → `#2f6bff`, `fill: currentColor` when on. Reveal transition
  `0.14s → 0.18s var(--bf-ease)`. `aria-pressed`, both aria-labels, both titles unchanged.
- `.hs-flyout-tip` (the add-on tooltip, `role="tooltip"`, `aria-describedby`): navy bubble → **ink
  pill** `#1c1c1a`/`#fdfcf9`, radius 12px, `box-shadow: 0 8px 22px rgba(28,28,26,0.2)`, body capped
  at `var(--bf-app-prose)`. Width 244px and the `::before` arrow unchanged.
- `.hs-flyout-upgrade` (CircleArrowUp) → `#2f6bff`.
- **`SavedViewsFlyout` is styled in `schedule.css:1945-1965`, not in the shell CSS.** Its divider
  hairline, `.hs-flyout-view` row and the `em`'s 160px ellipsis clamp must be re-skinned in the new
  file too (`.bf-shell .hs-flyout .hs-flyout-views …`) or the Schedule hub's flyout will have a
  navy-era block sitting inside a white card. This is the trap the inventory's completeness check
  flagged; it is easy to miss because the selector lives in a different file.

**Two additive behaviour fixes** (no test covers either; both are recorded gaps):

1. **Escape and focus-out close the flyout.** Today nothing closes it but a 140ms mouse-leave timer
   or an item click — tab a hub open, tab away, and it stays on screen forever. Add
   `onKeyDown={(e) => { if (e.key === "Escape") setOpenHubId(null); }}` on the `aside` and
   `onBlur`-with-`relatedTarget`-outside → `scheduleClose()`. This matches what all four top-bar
   menus already do.
2. **A tap path for coarse pointers.** Today a touch user can only reach a hub's *first* page.
   Change the hub `onClick` to:

```ts
onClick={(event) => {
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
  if (coarse && hub.pages.length > 1) {
    setOpenHubId((open) => (open === hub.id ? null : hub.id));
    setFlyoutTop((event.currentTarget.parentElement as HTMLElement).offsetTop);
    return;
  }
  /* …the existing navigate-to-first-unlocked-page branch, byte for byte… */
}}
```

  The jsdom `matchMedia` stub in `test/setup.ts` returns `matches: false` for every query, so
  `coarse` is always `false` under test and `fireEvent.click(hub)` keeps navigating — which is
  exactly what `appHarness.openSchedule()` (no view) depends on. **This is the reason the gate is
  written as `(hover: none)` and not as a touch-event sniff or a width breakpoint.**

### 5d. The four top-bar menus

All four keep their markup, roles, ids, item labels, titles, ordering, Escape handling and
outside-mousedown closers. Surface only:

| | Today | Daylight |
|---|---|---|
| `.hs-menu` (Create, and the base) | radius 10px, `0 20px 48px rgba(15,35,64,0.2)`, `hs-pop 0.16s` | radius 18px, `0 24px 70px rgba(28,28,26,0.14)`, `hs-pop 0.22s var(--bf-ease)`, `translateY(-6px) scale(0.98)` → none |
| `.hs-menu-head` | 12px muted | eyebrow `11.5px/650/0.045em` uppercase `#8a877e` |
| menu row | 13px, wash on hover | `13.5px/500` `#1c1c1a`, hover wash **+ `translateX(3px)`** |
| `.hs-menu-tag` New/Beta | `#2f6bff` / `#7c3aed` solid | `#2f6bff` / `#6d28d9` on 10%-alpha fills, `999px` |
| `.hs-bookmarks-menu` | as `.hs-menu` | same, plus `.hs-bookmarks-empty` copy capped at `var(--bf-app-prose)`; `.hs-bookmark-hub` `em` → `11.5px` `#8a877e` |
| `.hs-bookmarks-add` footer | 13px link | `13px/600`, `#2f6bff`, icon slides `3px` on hover (move #3) |
| `.notifications-panel` | radius **8px**, `0 24px 64px rgba(15,23,42,0.18)`, border `#e2e4f3` | radius 18px, `0 24px 70px rgba(28,28,26,0.14)`, border `rgba(28,28,26,0.07)`. `width: min(420px, 100vw - 32px)` and both max-heights frozen. |
| notification item | icon chip 6 tones, `strong` + `p` + `time` | chip radius `12px`, tones re-based onto `--hsx-*-soft` fills; `strong` `13.5px/600`; `p` `12px/500` `#575550` capped `var(--bf-app-prose)`; `time` `11.5px` `#8a877e`. Row hover: wash + `translateX(3px)`. |
| `.user-settings-menu` | radius 12px, **no entrance animation at all** | radius 18px, and it finally gets `hs-pop` — a recorded inconsistency (it never carried `.hs-menu`, so it never animated) |

The bell's synthesized 7-item feed has no empty state today. Adding one is **new copy** and
therefore out of scope for a re-skin; I flag it rather than sneak it in: proposed
`"No BuildFlow activity yet."`, needs sign-off before it ships.

### 5e. Command palette

`command-palette.css` has zero keyframes and zero transitions today. Add, carefully:

```css
.bf-shell ~ .cmdk-backdrop, .cmdk-backdrop { animation: bf-fade 0.18s var(--bf-ease) both; }
.cmdk-dialog { animation: bf-pop 0.22s var(--bf-ease) both; }  /* opacity + translateY(-8px) scale(0.985) */
```

Surface: dialog radius → 20px, `#fff`, border `rgba(28,28,26,0.07)`,
`box-shadow: 0 34px 64px rgba(28,28,26,0.13)` (the stage step — it is the one full-page-modal
object in the shell). Input `15px/500`; `.cmdk-label` `13.5px/600`; `.cmdk-group` `11.5px` `#8a877e`;
`.cmdk-hint kbd` chip `rgba(28,28,26,0.05)`/`6px`/`11px`; `[aria-selected="true"]` row
`rgba(47,107,255,0.08)` + `#2f6bff` + `translateX(3px)`; footer legend `11.5px` `#8a877e`.

**The animation is CSS on an already-mounted node.** Mounting stays synchronous, because the
palette resets its query and focuses the input in a `requestAnimationFrame` and anything that delays
mount races that focus — a recorded hazard, and the reason there is no JS transition here.

Also worth fixing while in the file (a recorded gap, 3 lines, no test): `.cmdk-list` is capped at
`min(52vh, 420px)` and nothing scrolls the highlighted row into view, so arrowing past the fold
moves `aria-activedescendant` off screen. Add a `scrollIntoView({ block: "nearest" })` on index
change.

### 5f. AI FAB, AI panel, modals, tutorial, loading/error

- **`AskAiButton`** — 52px ink pill, `#1c1c1a`, `999px`. Shadow → `0 8px 22px rgba(28,28,26,0.2)`,
  hover → `0 14px 34px rgba(28,28,26,0.28)` + `translateY(-3px)`. *Declared micro-deviation:* the
  Welcome grammar for a pill is **invert**, but this pill floats over content at rest and inverting
  it to an outline would read as it breaking. Floating pills lift; anchored pills invert.
- **`BreezeAssistant`** — `hs-breeze.css`'s `top: 56px; left: 56px; width: min(600px, 100vw - 56px)`
  literals stay valid because the chrome does not move; I still change them to
  `var(--hs-topbar-h)` / `var(--hs-rail-w)` so the next concept does not inherit the trap.
  `--bfz-navy` and friends re-base onto ink/paper. **Do not touch the mounting model**: the panel
  must stay always-mounted and hidden via `display: none` on `.bf-breeze:not(.is-open)` — showing
  it with `opacity` instead, or mounting it conditionally, breaks `schedule/viewKeys.ts`
  `dialogIsOpen()` and with it the 1–6 schedule view keys. Panel surface: radius 20px,
  `--bf-shadow-float`; composer `:focus-within` gets `--bf-focus-ring`; the quick-action stagger
  (`--i` from `:nth-child(2|3|4)`, `calc(.14s + .05s * var(--i))`) is retimed onto `--bf-ease` with
  the same delays, and the cards must stay four and stay in order or the stagger silently breaks.
- **`.hs-upd-dialog`** (What's new **and** the add-on prompt share it) — radius → 26px (the stage
  step: these are the two biggest objects in the app), `--bf-shadow-stage`, body copy capped at
  `var(--bf-app-prose)`. Split the shared base into `.hs-upd-dialog` + a `.hs-addon-dialog`
  override *before* touching either, or restyling one restyles the other. Neither dismisses on a
  backdrop click today and this concept does not change that (`useModalDialog` handles Escape, a
  Tab trap, initial focus and focus restore — all preserved).
- **Guided tutorial** — all 19 `data-tutorial-id` anchors untouched, `TutorialTargetId` untouched.
  Panel radius → 20px, `--bf-shadow-float`, body `13px/1.5` capped at `var(--bf-app-prose)`;
  `max-height: calc(100vh - 128px); overflow: auto` and `pointer-events: none` on the overlay with
  `auto` only on the panel are all frozen (that is what keeps the spotlit control clickable, which
  is what makes the gated steps satisfiable). Scrim stays the 9999px box-shadow.
  **Required manual check:** the wrap-up step spotlights `tutorial-restart-button`, which now sits
  inside a `backdrop-filter` ancestor. `backdrop-filter` makes an element a containing block for
  `position: fixed` descendants; the top bar has none (its menus are `absolute`), and the overlay is
  a sibling at `z-index: 80` above the bar's `40`, so it should paint over correctly — but this is
  exactly the class of bug the inventory warns about, so it gets a browser check, not a shrug.
- **Loading screen** — copy `"Loading BuildFlow HUD"` unchanged, `Loader2 .spin` unchanged; ground
  `#f5f6fa`, text `18px/600` `#1c1c1a`, and the existing `components/ui/text-shimmer.tsx` (58
  lines, already ported) wraps the string. No new file.
- **Error screen** — `AlertTriangle` unchanged, message unchanged, both actions unchanged
  (`"Try again"` → `runBootstrap`, `.error-screen-back` `"Back to log in"` → `returnToWelcome`).
  Primary → blue pill, secondary → outline pill that inverts on hover, message capped at
  `var(--bf-app-prose)`.
- **`DashboardSkeleton`** — `role="status"`, `aria-label="Loading your dashboard"`, `aria-busy` and
  its `DASH_LAYOUT_DEFAULT` block shapes all unchanged; `.dash-skel-block` radius 12 → 18px, border
  → `rgba(28,28,26,0.07)`; `.dash-skel-line` gets a 1.6s `--bf-ease-size` shimmer, nulled under
  reduced motion. **`grid-auto-rows: 40px` here stays 40px** — it mirrors `DASH_ROW_UNIT`.

---

## 6. The content surfaces (where 226 screens actually live)

The shell is 16 screens; the same stylesheet has to make the other 210 belong. Six rules do it.

### 6a. Page header

Every index page's `h1.hs-index-title` and the schedule frame's `h1.dx-title`:
`var(--bf-app-title)` / 600 / `var(--bf-app-title-track)` / `#1c1c1a` (was `22px`/650/`#14203a`,
the third ink). Its inline chevron button 26px → radius 12px. Subtitle/lede where one exists:
`var(--bf-app-lede)` `#575550`, `max-width: var(--bf-app-prose)`.

**Fix `.hs-page-tag` while here.** `PageReleaseTag` is styled only by
`hs-index.css:978 .hs-index .hs-index-title .hs-page-tag`, and the six schedule view pages render
it inside `.dx-title`, which that selector does not match — so month/week/list/kanban/matrix/gantt
currently render the bare word "New" as unstyled inline text next to their `h1`. One unscoped rule
in the new file (`.bf-shell .hs-page-tag`) fixes all six.

### 6b. Cards

```css
.bf-shell .hs-index .hs-index-card {
  border: 1px solid rgba(28, 28, 26, 0.07);   /* was #e6e8f0 */
  border-radius: 18px;                         /* was 14px */
  box-shadow: 0 10px 30px rgba(28, 28, 26, 0.05);  /* was 0 1px 2px rgba(20,32,58,.04) */
  padding: 20px 22px 18px;                     /* was 18px 22px 16px */
}
```

A card wrapping a table also gets `overflow: hidden` so the first and last rows clip to the 18px
corners. Card head `h2` → `var(--bf-app-section)`/600/`-0.01em`; head margin `0 0 12px`.
Between top-level cards: `gap: var(--bf-rhythm-dense)` (20–34px, was a flat 16px) — this is the
whole rhythm story on a dense page, and it is the only spacing number that changes.

Cards **lift only if they navigate**: `.bm-tile`, `.cc-apps-grid > *`, the Map job-site cards, the
Schedule landing's view cards → `translateY(var(--bf-lift-dense))` + `--bf-shadow-card-hover` over
`0.28s var(--bf-ease)`. Static cards (KPIs, tables, panels) never lift — mixing lift onto
non-interactive surfaces is precisely the incoherence the four-move grammar exists to prevent.

### 6c. KPI strip

`.hs-kpi` radius → 18px, `--bf-shadow-card`, gap `12px → 14px`.
`.hs-kpi-label` → eyebrow (`var(--bf-app-eyebrow)`/650/`0.045em`/uppercase/`#8a877e`).
`.hs-kpi-value` → `var(--bf-app-figure)`/700/`var(--bf-app-figure-track)` +
`font-variant-numeric: tabular-nums`. `.hs-kpi-note` → `var(--bf-app-meta)` `#575550`.
`.hs-kpi-ico` chip radius → 12px, six tones kept, re-based onto the `--hsx-*-soft` fills.

### 6d. Tables

Row height **46px frozen** and `thead` `42px` frozen — they set how many rows fit a screen and how
the sticky header offsets read.

- `thead th`: background `#fafbfd` → `transparent`, bottom border `rgba(28,28,26,0.13)`,
  `12.5px/650` → `var(--bf-app-eyebrow)`/650/`0.045em` uppercase `#8a877e`. The column head becomes
  the Welcome Page's stat label. This one change does more for the family resemblance than any other
  rule in the file, because column heads are the most-repeated text in the product.
- `td`: `var(--bf-app-row)`/500/`1.45`; the primary cell `var(--bf-app-row-strong)`/600 `#1c1c1a`;
  bottom border `rgba(28,28,26,0.07)`.
- `tbody tr:hover`: `#f6f8fc` → `rgba(28,28,26,0.035)` over `0.18s var(--bf-ease)`, and the row's
  trailing chevron/action slides `3px` (move #3).
- `tr.is-selected`: `#f2f6ff` → `rgba(47,107,255,0.06)`.
- Sort arrow keeps `#2f6bff`. `min-width: 720px` + `.hs-table-wrap` overflow frozen — that is what
  keeps a nowrap table from blowing the card to 1900px.

### 6e. Buttons

Three variants, mapped from the Welcome Page's three:

| App | Spec | Hover |
|---|---|---|
| `.hs-btn-primary` | `999px`, `13px/600`, `padding: 8px 16px`, `#2f6bff`/`#fff`, `0 4px 12px rgba(47,107,255,0.2)` | `#1f57e0`, `0 8px 22px rgba(47,107,255,0.28)` |
| `.hs-btn` | `999px`, transparent, `1px solid rgba(28,28,26,0.13)`, `#1c1c1a` | **inverts** to `#1c1c1a`/`#fdfcf9` (move #2) |
| `.hs-btn-icon` | `12px`, 30px square, transparent | wash `rgba(28,28,26,0.05)`; press `scale(0.94)` |

*Declared deviation:* the Welcome Page's primary is the ink pill and blue is reserved for accents.
In-app the primary stays **blue**, because `#2f6bff` is already the action colour across all eleven
app scopes and inverting that would re-teach the whole product for the sake of doctrine. The ink
pill is used in-app for exactly one thing — the AI FAB — which is where the marketing page uses it.

### 6f. Dashboard panel board

Frozen, all of it: `DASH_COLS 6`, `DASH_ROW_UNIT 40`, `DASH_GAP 16`, `grid-auto-rows: 40px`, the
absolute-positioned `.dash-block` with its four `0.26s cubic-bezier(0.22,1,0.36,1)` transitions
(already the right curve), `.dash-block-body { overflow: auto }`, the drag handle, the resize grip,
the eleven promoted panels, `dash:layout` persistence.

Surface only: `.dash-block` radius 12 → 18px, border → `rgba(28,28,26,0.07)`, shadow →
`--bf-shadow-card`.

**Panel `h2` stays exactly `14.5px`.** `hs-home.css:1233` reads
`.dash-block > .dash-drag-handle:has(+ .hs-widget-head) { top: -3px } /* 17px head row */` — that
`-3px` is calibrated against a 17px head row, which is what 14.5px/650 produces. Change the panel
title size and every drag handle on the board drifts. Tracking goes to `-0.01em` and the colour to
`#1c1c1a`; the size does not move. This is the clearest single example of why a dense surface cannot
simply adopt a marketing type scale.

Panels do **not** lift on hover — they are draggable, and a lift fights the grip. They get the
spotlight instead (§7.2), which is the re-scaled fourth move.

### 6g. Settings

Today the top bar is not rendered at all while `page === "settings"`, so the Settings page has no
search, no bell, no account menu, no AI, no bookmarks and no brand-home — it is the only in-app
surface with no chrome, and `"Close settings"` is the only way out.

**Render the `TopBar` on Settings** (delete the `page !== "settings" &&` guard on the TopBar only;
the rail stays out, because Settings has its own 276px category rail and `.settings-shell .hs-body`
collapses the grid to one column). Four CSS values follow:

```css
.bf-shell .settings-rx .settings-rail { top: var(--hs-topbar-h); height: calc(100vh - var(--hs-topbar-h)); }
.bf-shell .settings-rx .settings-page { min-height: calc(100vh - var(--hs-topbar-h)); }
.bf-shell .settings-content-scroll    { min-height: calc(100vh - var(--hs-topbar-h)); }
```

Then Settings is re-skinned like any other page: `.settings-rx`'s 239 rules keep their structure;
the rail's `color-mix(in srgb, var(--wx-card) 78%, transparent)` + `blur(10px)` already matches the
Welcome nav recipe and stays. The three ambient `dx-*` aurora blobs and `.dx-cursor` stay (they are
`--mx`/`--my`-driven, which is the same publisher the spotlight reads).

This is the **one item in the whole concept with genuine test exposure** — see §10 — and it is
independent of everything else, so it can be dropped without touching the rest.

---

## 7. Components to port (repo convention, not Tailwind)

Following the nine that exist: one file in `client/src/components/ui/`, plain markup, **inline
`style` objects** for anything that can be inline, **one inline `<style>` block** for the parts that
cannot (`::before`, `:hover`, `@media`), shadcn tokens mapped onto `--wx-*` with literal fallbacks
(`var(--wx-blue, #2f6bff)`), a `@media (prefers-reduced-motion: reduce)` rule *inside* that same
block, and a header comment naming the source and the token mapping — exactly the shape of
`stagger-cards.tsx` and `display-cards.tsx`.

### 7.1 `components/ui/rail-tooltip.tsx` — port of 21st.dev "Animated Tooltip"

The rail is nine unlabelled icons whose only affordance is a hover flyout and a native `title`
(≈1s browser delay, OS-styled, invisible to touch). A real tooltip is the cheapest legibility win
available without widening the rail.

```tsx
export function RailTooltip({
  label, hint, side = "right", delay = 380, children
}: { label: string; hint?: string; side?: "right" | "bottom"; delay?: number; children: ReactNode }): ReactNode
```

- Renders `children` inside a `position: relative` wrapper plus one bubble span.
- **The bubble is `aria-hidden="true"`.** The wrapped button already carries the identical string in
  its `aria-label`; making the bubble a `role="tooltip"` with `aria-describedby` would double-announce
  it and, worse, could alter the button's computed accessible name — which is exactly what
  `appHarness` matches on. Visual only, by design.
- Ink pill: `#1c1c1a` / `#fdfcf9`, radius 8px, `11.5px/600`, padding `6px 10px`, offset 12px,
  `box-shadow: 0 4px 12px rgba(28,28,26,0.08)`, `opacity 0 → 1` + `translateX(-4px) → 0` over
  `0.18s var(--bf-ease)`; 380ms in, 80ms out (a `setTimeout` cleared on leave/blur).
- Optional `hint` renders a second line in `rgba(253,252,249,0.62)` — used for the ⌘K chip on the
  search button and for `"New"`/`"Beta"` on a tagged hub.
- Reduced motion: appears instantly, no translate.
- Wired to: the 9 rail hubs, the rail gear, and the 8 top-bar icon buttons. Existing `title`
  attributes are **kept** — the inventory records them as information.

### 7.2 `components/ui/spotlight-surface.tsx` — port of 21st.dev "Card Spotlight"

This is the answer to "the fourth hover move has no home in the app." The Welcome Page's signature
is a product mock tilting under the pointer inside a lit stage. A dashboard panel cannot tilt — it
is draggable, resizable, and full of 13px text that would smear. But the *gesture* — the surface
acknowledging where the pointer is — re-scales cleanly to a low-amplitude radial highlight.

```tsx
export function SpotlightSurface({
  radius = 220, alpha = 0.06, as = "div", className = "", children, ...rest
}: SpotlightSurfaceProps): ReactNode
```

- Paints a `::before` at `inset: 0; border-radius: inherit; pointer-events: none;
  background: radial-gradient(var(--sp-r) circle at var(--sp-x) var(--sp-y),
  rgba(47,107,255,var(--sp-a)), transparent 70%)`, `opacity: 0 → 1` on hover over
  `0.25s var(--bf-ease)`. A `::before` is why this needs the inline `<style>` block.
- **Reads `--mx`/`--my` if the page root publishes them** — `useHudMotion` already sets
  `--mx`/`--my`/`--px`/`--py` on ten page roots, so on those pages the component adds **zero**
  listeners. It falls back to its own rAF-throttled `pointermove`, bound on `pointerenter` and
  unbound on `pointerleave`, only where those variables are absent (the shell itself).
- Reduced motion: `--sp-a: 0` and no transition — an ambient pointer effect is exactly what
  reduced-motion should remove, and `--bf-spotlight-a` already zeroes in the token file's reduce
  block.
- Wired to: `.dash-block` (11 panels), `.hs-index-card`, `.hs-kpi`, `.hs-flyout`. Wrapping is
  additive — the element keeps its own className, so no selector and no test query changes.
- **Trap it must not fall into:** never put `data-reveal` on a SpotlightSurface whose `className`
  is computed. `.dash-block` takes `is-dragging`/`is-resizing`/`is-landing` dynamically, and this
  repo has a documented failure where a dynamic className on a `[data-reveal]` element wipes the
  imperatively-added `.in` and leaves it at `opacity: 0` forever.

### 7.3 Reuse, don't port: `components/ui/text-shimmer.tsx`

Already in the repo at 58 lines. Use it for the loading screen's `"Loading BuildFlow HUD"` and the
AI panel's thinking row. Zero new files.

### 7.4 Three things I am explicitly **not** porting, and why

- **A count-up for KPI figures.** `test/setup.ts` stubs `IntersectionObserver` with a no-op, so
  under test the observer never fires and a naive count-up would render `0` forever; and tests read
  figures directly (`.sched-matrix-util`, `.sched-matrix-total b`, `.dash-block h2`). Even a
  hardened version (reduced-motion snap + IO guard + 1600ms timeout, the way the Welcome Page's
  `WxCounter` was hardened) is a real risk for a decorative gain. Rejected. Figures get
  `font-variant-numeric: tabular-nums` instead, which is the actual legibility win.
- **An `<Overflow>`/`<Toolbar>` cluster for the top bar.** Unnecessary: once icon buttons go 36 →
  32px at ≤560px the cluster fits at 320px (§8), and any overflow menu would put
  `data-tutorial-id="tutorial-restart-button"` behind a `display: none`, which silently kills the
  tutorial's final step. Rejected.
- **A `<Reveal>` wrapper component.** The reveal engine is CSS plus `useHudMotion`'s imperative
  `.in`. A component would invite dynamic classNames onto reveal targets — the documented trap.
  Rejected; use the `data-reveal` attribute on static-className elements only.

---

## 8. Responsive model — the rail stays, the subtraction stops

Today: six breakpoints of pure CSS subtraction, no hamburger, no drawer, and at ≤560px the
bookmarks star, create `+`, help and settings buttons are `display: none`. That means **a phone user
cannot start the tutorial** — and the tutorial's own last step spotlights a button that does not
exist at that width.

The rail stays 56px at every width (15% of a 375px screen; HubSpot ships the same). The fix is to
stop hiding things:

| Width | Today | Daylight Rail |
|---|---|---|
| ≥1041px | full bar | full bar; gutters `28px / 32px` |
| ≤1040px | brand word and `⌘K` chip hidden; gap 10px | unchanged (both are redundant affordances) |
| ≤760px | search `flex-basis: 110px`; divider hidden | unchanged |
| **≤640px (new)** | — | icon buttons 36 → 34px; `.hs-menu`s widen to `min(300px, 100vw - 20px)`; account menu flips to `left: 0` (styles.css already does this at 680px — align the two) |
| **≤560px** | **star, create, help, settings all `display: none`** | **nothing is hidden.** Icon buttons → 32px; the search pill collapses to a 36px icon button — `.search-box { width: 36px; padding: 0; justify-content: center }` with `.search-box input { width: 0; min-width: 0; padding: 0; opacity: 0 }`, so the `<input aria-label="Search BuildFlow">` **stays in the DOM and stays focusable through its `<label>`**. Budget at 375px: brand 30 + 7×32 + account 44 + 8 gaps ×4 + padding 14 = **344px**. Fits. |
| **≤380px (new)** | — | one control hides: `.hs-settings-button`. It is the only one with two other homes at that width (the rail gear and the account menu's `Settings` item), so no action is lost. Budget: **312px**. |
| ≤620px **tall** (new) | rail overflows silently | rail buttons 36px, gap 4px → 428px of rail |
| ≤720px | verify label → icon; tutorial → bottom sheet; AI sidebar hidden, panel full-width; quick-actions 4 → 2 cols | unchanged |
| ≤560px | What's-new dialog padding 32/22/26, starburst 130px | unchanged |

Net effect: **at every width, every top-bar action stays reachable and the tutorial anchor stays
visible.** That is a concrete UX repair delivered by CSS arithmetic, with no new component, no
drawer, and no test surface.

Content gutters go from a fixed `22px 28px 34px` to
`var(--bf-app-gutter-y) var(--bf-app-gutter-x) 40px` → `28px / 32px / 40px` at 1440 (slightly more
air than today) and `18px / 18px / 40px` at 480 (meaningfully less waste than today's fixed 28px on
a phone).

---

## 9. Motion and reduced motion

**One curve.** Every transition in the new file uses `var(--bf-ease)`; height and grid transitions
use `var(--bf-ease-size)`. Every `0.12s ease` / `0.14s` / `0.15s` / `0.18s ease` / `0.2s` in the
shell is replaced by the four interaction durations (`--bf-dur-press` `.18s`, `--bf-dur-hover`
`.25s`, `--bf-dur-move` `.28s`, `--bf-dur-panel` `.3s`).

**Keep every keyframe name.** `hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping`,
`hs-tag-in`, `hs-pop`, `hs-flyout-in`, `hs-top-spin`, `hs-top-gear`, `hs-top-bell`, `hs-top-badge`,
`hs-top-twinkle` — the four existing `prefers-reduced-motion` blocks null them **by name**, and
renaming one silently un-nulls it. Values change, names do not. Two new names only: `bf-shell-in`
and `bf-pop`/`bf-fade` for the palette.

**Shell entrance, once.** `.bf-shell .hs-topbar { animation: bf-shell-in 0.7s var(--bf-ease) both }`
and the rail the same with a 60ms delay (`opacity 0 → 1`, `translateY(-8px) → 0` for the bar,
`translateX(-8px) → 0` for the rail). It runs exactly once because the shell never remounts on page
change. It is a **CSS animation, not a `data-reveal`** — `shellClassName` is computed, and a dynamic
className on a reveal target is the documented way to make an element invisible forever in this
repo.

**One-shot reveals, aligned to the contract.** `useHudMotion.ts` already unobserves on first
intersection (so it is already one-shot) but uses `threshold: 0.12, rootMargin: '0px 0px -5% 0px'`.
Change those two numbers to `0.16` and `-6%` so the app matches the documented contract exactly. One
line, ten page roots, no test.

Optionally (guarded, not required): the ten near-identical `.<scope>.dx-ready [data-reveal]` blocks
in `dashboard-`, `projects-`, `crews-`, `equipment-`, `materials-`, `field-updates-`,
`delayIQs-redesign.css`, `schedule.css` and `settings-redesign.css` collapse into one
`.bf-shell.dx-ready [data-reveal]` block reading `--bf-reveal-shift`, `--bf-dur-reveal` and
`--bf-reveal-stagger`. Do this only with a computed-style diff, because the per-scope blocks are not
byte-identical.

**Reduced motion.** Extend the ten existing blocks; add exactly one new block, in the new file, that
nulls only what the new file adds (`bf-shell-in`, `bf-pop`, `bf-fade`, the spotlight opacity, the
tooltip translate, the skeleton shimmer). Amplitude tokens (`--bf-lift`, `--bf-lift-dense`,
`--bf-slide`, `--bf-press-scale`, `--bf-spotlight-a`) already zero in `design-tokens.css`'s reduce
block, so any rule that reads them degrades for free. No eleventh pattern.

---

## 10. Test risk, honestly

**346 tests, 37 files. I expect to edit zero of them.** Here is every place that claim could be
wrong, ranked.

| Risk | Files / tests | Why it holds | Mitigation |
|---|---|---|---|
| **1. Rendering the TopBar on Settings** — the one genuine exposure | `tests/settings.test.tsx` (9) | The `≥2 buttons named "Settings"` assertion runs *before* entering Settings; `getByLabelText("Settings categories")` is the Settings page's own rail, not the primary nav; the post-close `queryByLabelText("Settings categories")` absence is unaffected | Run this file first. If it is brittle, drop §6g — it is independent of everything else |
| **2. The `"Search BuildFlow"` label** | `appHarness.enterDashboard()` + `completeOnboarding()` → effectively **all 62 App.test.tsx + 52 tests/*.tsx + the pages that route through them** | The `<label>`-wrapped read-only `<input aria-label="Search BuildFlow">` is restyled, never restructured; at ≤560px it goes `width: 0; opacity: 0`, not `display: none`, and jsdom applies no CSS anyway | Never touch that JSX. Assert it in review |
| **3. Rail hub accessible names** | `tests/settings.test.tsx:113` (`^<Hub>( \(.*\))?$` over Schedule/Operations/Resources/Field/Reporting/Home), `appHarness.openAppPage()`, `openSchedule()` | `aria-label`/`title` construction (`${hub.label} (${hubTag})` / `${hub.label} · ${hubTag}`) is untouched; only colours, radius and the ring change | — |
| **4. `fireEvent.mouseOver(hub)` must open the flyout** | every `openAppPage()` caller | The `onMouseEnter` stays on `.hs-rail-slot` (React maps it from `mouseover`). Moving it to the button, or to `pointerenter`, would break this | Do not move the handler |
| **5. `fireEvent.click(hub)` must still navigate** | `appHarness.openSchedule()` (no view) → `tests/schedule.test.tsx` (11), `schedule/pages.test.tsx` (41) | The new tap-to-open branch is gated on `matchMedia("(hover: none)").matches`, and `test/setup.ts` stubs `matchMedia` to `matches: false` for every query | The gate must be `(hover: none)`, never a width or touch-event sniff |
| **6. `sched-` / `gantt-` in App.tsx** | `schedule/boundary.test.ts` (8) — it greps `App.tsx` and fails the build | New classes use the `bf-` prefix; new components live in `components/ui/`, which the boundary test does not police for schedule names | Never name anything `bf-sched-*` |
| **7. Palette entrance racing the rAF focus** | `components/CommandPalette.test.tsx` (4) | Motion is a CSS animation on an already-mounted node; mount stays synchronous; no JS transition, no delayed portal | — |
| **8. Class-name assertions** | 22 `querySelector` strings across the DOM tests: `.dash-block h2`, `.cc-spark`, `.cc-spark-line`, `.sched-matrix-util`, `.sched-matrix-total b`, `.sched-list-day`, `.sched-kanban`, `.sched-cal-cell`, `.schedule-job`, `.sched-view-key`, `.sched-firstrun-steps li.is-done`, `.gantt-status`, `.gantt-sidebar`, `.schedule-kpis .kpi-card`, `.hs-home-promo`, `.business-context-*`, `[role='tooltip']` | Every one of these classes survives; the concept renames **nothing**. `[role='tooltip']` is the add-on flyout tip, whose role is preserved — and `RailTooltip`'s bubble is deliberately `aria-hidden` with no role, so it cannot collide with that query | Grep the new stylesheet for any renamed selector before merge — there should be none |
| **9. DOM order of bell vs account** | `tests/tutorial.test.tsx:286` | Re-ordering is done with CSS `order` only, exactly as today; JSX order untouched | — |
| **10. Locked flyout item must prompt, not navigate** | `tests/map.test.tsx:103` (`Get Map & Field Ops`) | Flyout changes are CSS-only; all three copies of `lockedAddOnForPage` untouched | — |
| **11. Persisted dashboard layouts** | `dashGrid.test.ts` (19) + real users' `dash:layout` | `DASH_COLS`/`DASH_ROW_UNIT`/`DASH_GAP` and `grid-auto-rows: 40px` all frozen | — |
| **12. Verify-email notice count** | `App.test.tsx:1263` | `.topbar-verify` stays in the top bar, one instance | — |
| **13. Tutorial spotlight placement** | no test — `data-tutorial-id` failures are silent | 19 anchors untouched; `tutorial-restart-button` now visible at every width instead of vanishing below 560px. The new `backdrop-filter` on the top bar is the one theoretical hazard (containing block for fixed descendants) | **Manual browser check of the wrap-up step**, plus the 5 tests in `tests/tutorial.test.tsx` |

**Unprotected by any test, so it must be preserved by reading the code:** the bookmarks star menu,
the Bookmarks page, and the whole `BreezeAssistant` panel. All three are restyled here; all three
need a manual walkthrough against the inventory's item lists rather than a green suite.

**Files run first, in order:** `tests/settings.test.tsx` (9) → `schedule/boundary.test.ts` (8) →
`components/CommandPalette.test.tsx` (4) → `tests/tutorial.test.tsx` (5) → `tests/map.test.tsx` (7)
→ `tests/schedule.test.tsx` (11) → the full suite.

---

## 11. Every nav category's home (nothing moves)

| Category | Home | Notes |
|---|---|---|
| Home | rail slot 1, `Grid2X2` → `dashboard` | unchanged |
| Bookmarks | rail slot 2, `Star` → `bookmarks` | unchanged; the page keeps its `bookmarks-page-title` tutorial anchor |
| Schedule | rail slot 3, flyout of 7 (Schedule, Gantt Chart, Month, Week, List, Kanban, Matrix) + the `Saved views` sub-head | unchanged; **`SavedViewsFlyout`'s CSS lives in `schedule.css` and must be re-skinned there too** |
| Operations | rail slot 4 (Projects, Crews) | unchanged |
| Sales | rail slot 5 (Contacts, Companies, Deals) | unchanged; `Sales (New)` + NEW/BETA/BETA pills preserved |
| Resources | rail slot 6 (Equipment, Materials) | unchanged |
| Field | rail slot 7 (Field Updates, Map & Field Ops, DelayIQs) | unchanged; Map keeps its add-on lock, tip and upgrade arrow |
| Reporting | rail slot 8 (Reports) | unchanged |
| TimeCard | rail slot 9 | unchanged |
| Settings | rail bottom gear **+** top-bar gear **+** account-menu item | all three kept (the test needs ≥2 buttons named exactly `Settings`); Settings **gains** the top bar |
| Bookmark star menu | top bar, position unchanged | star gold → accent blue (declared); all rows, both `×` controls, both footer actions, the empty-state copy preserved |
| Create `+` menu | top bar, unchanged | 7 entries, `New`/`Beta` pills, the 45° rotate while open, and the `onCreateRecord` bridge for Contacts/Companies/Deals |
| Search | top bar, unchanged element, pill styling | at ≤560px an icon button; the input and its `aria-label` never leave the DOM |
| Notification bell | top bar, unchanged | 7 synthesized items, six tones, relative `<time>`, read-only; panel widths/heights frozen |
| Account menu | top bar, unchanged | identity + `Settings` + `Log out`; gains the `hs-pop` entrance it never had |
| AI sparkle | top bar, unchanged | the app's one licensed gradient |
| AI FAB | fixed bottom-right, unchanged | ink pill, lift on hover |
| Guided tutorial | top-bar help button, `data-tutorial-id="tutorial-restart-button"` | **now visible at every width** — today it is `display: none` below 560px |
| Browser Back/Forward | `popstate`, `#schedule/<page>?…` | untouched; presentation-only concept |

---

## 12. Where this falls short of the Welcome Page (the honest part)

The angle is "lowest risk that still genuinely reads as the same product." It does read as the same
product. It does not read as the *same page*. Nine specific shortfalls:

1. **No stage, no product window.** The Welcome Page's signature move — a mock floating in a
   `#faf8ee` stage (radius 26px, `perspective: 1200px`, `isolation: isolate`) over an animated mesh,
   tilting under the pointer — has no in-app equivalent and this concept does not invent one. The
   spotlight is a 1/10-amplitude substitute for the tilt; it is not the same gesture, and nothing
   substitutes for the stage.
2. **No display type anywhere.** The largest thing on any app page is 26px. The Welcome Page's
   *smallest* display size is 38px. Someone who scrolls the marketing site and then signs in will
   feel the type drop by ~3.7×. That is inherent to 13px rows and this concept accepts it rather
   than pretending otherwise.
3. **No rhythm.** 20–34px between cards is not 108px between sections. The app will always feel
   *tighter*, not merely *smaller*. Rhythm is the one dimension of the language that genuinely does
   not survive the translation.
4. **The rail still hides its labels.** A 56px icon rail with tooltips is less legible than a worded
   nav, full stop. I keep it because `hs-breeze.css`'s literals, the flyout's `offsetTop` maths and
   the harness's navigation path all stand on 56px. A labelled 240px sidebar would read closer to
   the marketing site; a competing concept should propose it, and should be believed when it says
   the test cost is real.
5. **Hover is still the primary desktop path to sub-pages.** I add Escape, focus-out and a
   coarse-pointer tap path, but the interaction model is unchanged: on a desktop you still discover
   a hub's pages by hovering. That is a HubSpot idiom, not a Welcome Page idiom.
6. **The gradient trio appears once.** On the marketing page it is a recognisable signature across
   three deliberate places. In-app it is one 36px button. The product's most distinctive colour move
   is essentially absent from the product.
7. **`--wx-amber` stays `#0032b0`.** Per decision #3 the warning semantic renders as a dark blue in
   seven scopes and as a real amber in Crews. Against navy chrome that inconsistency was camouflaged;
   against paper chrome, a blue "Planned"/"ready-to-start"/medium-severity badge sitting beside the
   `#2f6bff` accent will be *more* visible, not less. This concept renders it faithfully and flags
   that the flip makes the existing inconsistency louder.
8. **The bell gets prettier, not better.** Seven synthesized items, no read model, no per-item
   action, no "view all", and equipment items stamped `new Date().toISOString()` on every render so
   they always sort first and can consume the whole cap. A re-skin cannot fix that; fixing it is a
   feature change.
9. **The 24 token namespaces survive.** This concept adds `--bf-app-*` and re-values `--hs-*`/
   `--hsx-*`/`--cc-*` inside one new scope. It does not collapse them, and it does not promote
   `--wx-*` to `:root` (which is not inert — unscoped rules use `var(--wx-ink, #14203a)`-style
   fallbacks that differ from the canonical values). Reconciliation stays Phase 4 work, and this
   concept makes it neither easier nor harder.

---

## 13. Build order

| Phase | Work | Files touched | Risk |
|---|---|---|---|
| **A** | Append `--bf-app-*` to `design-tokens.css`; re-base `--bf-focus-ring` to the `#2f6bff` alpha; align `useHudMotion` to `0.16` / `-6%` | 2 | none — additive tokens plus two numbers |
| **B** | Create `client/src/app-shell-daylight.css`; add its import as the new last line of `main.tsx`; add `"bf-shell"` to `shellClassName` | 3 | none; deleting the word `bf-shell` reverts the whole concept |
| **C** | Chrome: top bar, rail, flyout (**including the `schedule.css` saved-views block**), the four menus, notifications panel, palette, AI FAB, `hs-breeze.css`'s literals → tokens | 1 new + 2 | low, CSS only |
| **D** | Surfaces: `hs-index` cards / tables / KPIs / page titles, `.hs-page-tag`, `.dash-block`, buttons | 1 new | low, CSS only |
| **E** | Port `rail-tooltip.tsx` and `spotlight-surface.tsx`; wire tooltips to 18 buttons, spotlight to panels/cards | 2 new + `App.tsx` (Sidebar, TopBar, 2 card sites) | low — additive wrappers, no selector or name changes |
| **F** | Responsive tiers (1040 / 760 / **640** / 560 / **380** / **max-height 620**); flyout Escape + focus-out; coarse-pointer tap path; TopBar on Settings + the 3 Settings offsets | 1 new + `App.tsx` + `settings-redesign.css` + `styles.css` | **medium** — the only phase with test exposure (§10.1, §10.5) |
| **G** | Cleanup: delete `--wx-serif` from 10 app scopes and rewrite 27 reads to `var(--bf-font-sans)`; delete `sidebar-redesign.css` (307 dead lines) + its import; delete the inert `collapsed`/`onToggleCollapsed` props and the `sidebar-collapsed` class; migrate the 14 in-app `#1a73e8`/`rgba(26,115,232,…)` literals | ~14 | low, but do it last so a regression is attributable |

**Acceptance:** the full 346 pass; a computed-style diff over the 16 shell screens and the six index
pages confirms every colour/radius/shadow changed and no font-size on a frozen surface
(`.dash-block h2`, `th`, `td`, row heights) moved; a manual walk of the inventory's 130 shell
information items and 94 shell actions, with special attention to the three surfaces no test covers
(bookmarks star menu, Bookmarks page, `BreezeAssistant`); and a browser run of the tutorial from
step 1 to the wrap-up at 1440px, 768px and 375px.
