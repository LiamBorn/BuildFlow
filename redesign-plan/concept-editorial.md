# Concept: The Editorial Sidebar

**One-line thesis.** The app does not feel like the marketing site because its navigation has no
words in it. Replace the 56px icon rail and its hover-only flyouts with a 264px labelled,
grouped, collapsible sidebar built in the Welcome Page's language — and translate that language to
density by one rule: **halve the display type, keep the body type, quarter the rhythm, change
nothing about colour, radius, shadow or easing.**

---

## 1. The argument

### 1.1 The rail is the reason the app reads as a different product

The Welcome Page's navigation is a 64px light-paper bar of real words at real sizes over one flat
`#f5f6fa` ground. Cross the auth funnel and navigation becomes nine 40×40 glyphs on `#14203a` navy
with zero text, whose sub-pages exist only while a pointer is held still. Nothing about the
palette causes that gap — `DESIGN_TOKENS.md` proves 13 of the shared tokens are already unanimous
across 15 scopes. The gap is that one surface speaks and the other gestures.

Three concrete symptoms, all measured, not asserted:

1. **No labels.** 22 of the app's pages have names (`navItems`, `App.tsx:643`). Zero of those
   names are on screen until you hover. The rail shows 9 glyphs and a gear.
2. **Six extra motion moves.** The rail alone runs `hs-rail-pop` (spring + tilt),
   `hs-rail-draw` (SVG stroke redraw), `hs-rail-ring` (blue ring pulse) and `hs-tag-ping`
   (infinite dot pulse); the top bar adds `hs-top-spin`, `hs-top-gear`, `hs-top-bell`,
   `hs-top-badge`, `hs-top-twinkle`. The design language has exactly four hover moves — lift,
   invert, slide, tilt. Stroke-redraw and bell-swing are a fifth, sixth and seventh grammar, and
   mixing grammars is precisely what `DESIGN_TOKENS.md` names as the thing that makes a page read
   as incoherent.
3. **Navy chrome against a `#f5f6fa` ground.** The site's rule is *one ground, end to end, no
   banding*. The shell puts a 56px navy bar and a 56px navy rail around a paper page — two
   grounds, hard-banded, before any content renders.

### 1.2 The hover-only flyout is also an accessibility defect, not just a style problem

This is the part that makes the change necessary rather than merely nice. From
`inventory/app-shell.json` (`risks[6]`), verified against `App.tsx:20516-20712`:

- The flyout opens on `onMouseEnter` of `.hs-rail-slot` and on `onFocus` of the hub button.
  **There is no click or tap path.** `onClick` on a hub button does the opposite — it sets
  `setOpenHubId(null)` and navigates.
- Therefore on a touch device, tapping `Schedule` lands you on the Schedule landing page and the
  flyout closes. Month, Week, List, Kanban, Matrix and Gantt are **unreachable from the
  navigation**. Same for `Crews` under Operations, `Companies`/`Deals` under Sales, `Materials`
  under Resources, `Map & Field Ops`/`DelayIQs` under Field. That is **13 of 22 pages with no
  navigation path on a phone or tablet.** The only fallback is ⌘K, which requires a hardware
  keyboard.
- The per-page **bookmark star** lives inside the flyout and reveals on row hover
  (`.hs-flyout-star` opacity 0 → 1). On touch it is doubly unreachable: inside a surface that
  cannot open, revealed by an event that cannot fire.
- The rail flyout is also load-bearing for **add-on discovery**: the locked-page tooltip
  (`.hs-flyout-tip`, `role="tooltip"`, `aria-describedby="hs-addon-tip-<page>"`) is hover/focus
  only, so a touch user hits the `AddOnPrompt` with no prior explanation.
- Compounding it, at `≤560px` `app-shell-hubspot.css:1125` sets `display: none` on the bookmarks
  star, the create `+`, the help button and the settings gear. The help button carries
  `data-tutorial-id="tutorial-restart-button"` and the tutorial's wrap-up step spotlights it — so
  **on a phone the guided tutorial cannot be started and its final step targets an element that
  does not exist.**
- And there is **no hamburger and no drawer anywhere in the codebase.** Responsive behaviour is
  pure CSS subtraction across 30 breakpoints. Nothing is ever relocated; things are only removed.

A labelled sidebar fixes all six at once, because a labelled sidebar has no hidden layer: the
sub-pages are in the document, reachable by tap, keyboard and screen reader, and the same DOM
folds into a drawer on a phone.

### 1.3 Why *editorial* and not just "wider"

The Welcome Page's grammar for a list of links already exists in this repo — the landing side menu
is `components/ui/interactive-hover-links.tsx`, whose rows are real type with a directional slide
and which already takes a `role` prop so it can sit inside a `role="menu"`. The sidebar is that
component's dense sibling: eyebrow-labelled groups, generous row padding, one accent used once per
screen. It is the same idea at 0.5× the type and 0.25× the rhythm.

---

## 2. The density translation, with numbers

The tension is real: the site's smallest display size (38px) is larger than the app's largest
(22px `h1`), and the site breathes 108px between sections while the dashboard shows 13px rows.
Resolve it with one stated ratio rather than case-by-case taste.

### 2.1 What carries over **literally** — same value, no rescale

| Thing | Value, unchanged from the site |
|---|---|
| Ground | `#f5f6fa` end to end. Top bar and sidebar both become the ground. Only cards are `#ffffff`. No banding. |
| Accent | `#2f6bff`, one accent. **Budget: at most one blue element visible in the nav at a time** — the active row. Nothing else in the sidebar is blue. |
| Gradient trio | Still spent on exactly three things. In the shell the only slot is the AI sparkle (`--wx-g-blue` → `--wx-g-purple`); the rail's blue glow and the violet Beta dot are *not* gradients and stay flat. |
| Radius ladder | `999px` pills and the active spine, `12px` popovers, `8px` nav rows, `18px` cards. |
| Shadow ladder | `--bf-shadow-card` / `-raised` / `-float` / `-card-hover` verbatim from `design-tokens.css`. |
| Easing | `--bf-ease: cubic-bezier(0.22,1,0.36,1)` for everything; `--bf-ease-size: cubic-bezier(0.4,0,0.2,1)` for the two height/grid transitions only. |
| Interaction durations | `0.18s` press, `0.25s` hover, `0.28s` move, `0.30s` panel. |
| Hover grammar | Four moves, no fifth. Nav rows and menu rows = **slide** `translateX(var(--bf-slide))` = 3px. Content cards = **lift**. Pills = **invert**. Mocks = **tilt**. |
| One-shot reveals | `threshold 0.16`, `rootMargin '0px 0px -6% 0px'`, then `unobserve` — on page **content** only. See §7.3: never on the shell. |
| Copy measures | `52ch` lede, `44ch` body, `26ch` caption. Unchanged, because `ch` rescales itself with the font size. |
| Page measure | `1140px` (`--bf-measure-page`) on index and detail pages. |
| Typeface | Inter only. `--wx-serif` is deleted (see §8.4). |
| Focus ring | `0 0 0 4px rgba(47,107,255,0.12)` — the site's ring with the app's accent substituted. |

### 2.2 What gets **rescaled** for density

| Role | Site value | App value | Ratio |
|---|---|---|---|
| Page `h1` | `clamp(32px, 4.4vw, 54px)` / `-0.01em` / `1.08` | `clamp(24px, 2.2vw, 30px)` / `-0.02em` / `1.14` | 0.56 |
| Eyebrow / kicker | `13px` / 600 / `0.08em` | `11px` / 600 / `0.085em` | 0.85 |
| Lede under a page head | `clamp(16px, 1.35vw, 19px)` | `14.5px` / 500 / `1.5` / `52ch` | 0.76 |
| Big figure (KPI, stat tile) | `clamp(46px, 5.4vw, 72px)` / `-0.02em` | `clamp(26px, 2.4vw, 34px)` / `-0.02em` | 0.47 |
| Panel / card title | `clamp(26px, 3vw, 38px)` | `15px` / 600 / `-0.01em` | ~0.5 |
| Body | 15–16px | `13.5px` / 500 | 0.87 |
| **Table cell** | — | `13px` / 500 — **unchanged from today** | 1.0 |
| **Column header** | — | `11.5px` / 600 / `0.06em` / `--wx-faint` — **unchanged** | 1.0 |
| Micro / meta | 13px | `12px` | 0.92 |
| Section beat | `clamp(76px, 12vh, 130px)` → 108px @1440 | `--bf-rhythm-dense: clamp(20px, 3vh, 34px)` → **28px** @900 tall | 0.26 |
| Head → first panel | `54px` (`--bf-rhythm-head`) | `18px` | 0.33 |
| Card interior padding | 26–30px | `18px` | 0.65 |
| Card radius | 18–20px | `14px` panels, `12px` popovers | 0.7 |
| Card hover lift | `-6px` | **`-3px`** — new token `--bf-lift-dense` | 0.5 |
| Content column padding | — | `28px 32px 40px` (today `22px 28px 34px`) | 1.2 |

**The rule, memorably:** *display type halves, body type holds, rhythm quarters, everything else is
identical.* A 44px table row lifting 6px reads as broken, which is why `--bf-lift-dense` exists;
a 13px cell rendered at 15px would cost a row per screen, which is why body type holds.

### 2.3 New additive tokens (three only, all `--bf-*`, all collision-free)

```css
/* appended to client/src/design-tokens.css */
--bf-lift-dense:   -3px;                       /* card lift on dense surfaces */
--bf-type-page-h1: clamp(24px, 2.2vw, 30px);   /* the dense display step */
--bf-type-tile:    clamp(26px, 2.4vw, 34px);   /* the dense figure step */

/* and their reduced-motion half, inside the existing @media block */
@media (prefers-reduced-motion: reduce) { :root { --bf-lift-dense: 0px; } }
```

Nothing else is added. The shell geometry tokens live on `.hs-shell` alongside the ones already
there (§4.1).

---

## 3. The sidebar

### 3.1 Geometry

```css
.hs-shell {
  --hs-topbar-h:  64px;   /* was 56px — the site's nav height */
  --hs-sidebar-w: 264px;  /* expanded */
  --hs-sidebar-c: 72px;   /* opt-in collapsed */
  --hs-rail-w:    var(--hs-sidebar-w);  /* kept as an alias so nothing that reads it breaks */
}
.hs-shell .hs-body { grid-template-columns: var(--hs-sidebar-w) minmax(0, 1fr); }
```

Sidebar surface: `background: #f5f6fa` (the one ground — **not** a second colour),
`border-right: 1px solid var(--wx-line-soft)`, `padding: 16px 12px 12px`, `overflow-y: auto`,
`position: sticky; top: var(--hs-topbar-h); height: calc(100vh - var(--hs-topbar-h))`.
**No `transform`, no `filter`, no `contain`, no `will-change` on the sidebar or any ancestor of a
row** — the tutorial spotlight measures with `getBoundingClientRect` and a new containing block
mis-places the light (`risks[3]`).

### 3.2 Type and spacing, exact

| Element | Spec |
|---|---|
| Group eyebrow | `11px` / 600 / `text-transform: uppercase` / `letter-spacing: 0.085em` / `color: var(--wx-faint)` / `margin: 0 0 6px 10px` |
| Group header row (a hub) | height `36px`, padding `0 8px 0 10px`, radius `8px`, gap `10px`, icon `18px`, label `13.5px` / 600 |
| Page row (a sub-item) | height `34px`, padding `0 8px 0 32px`, radius `8px`, gap `10px`, icon `16px`, label `13.5px` / 500 |
| Single-page row (Home, Bookmarks, Reporting, TimeCard) | header geometry, label `13.5px` / 600 |
| Row hover | `background: rgba(28,28,26,0.045)`; label `translateX(3px)`; `transition: background .18s ease, transform .18s var(--bf-ease)` |
| Row active | `background: rgba(47,107,255,0.08)`; label `color: #2f6bff`, weight 600; `::before` spine `3px × 16px`, radius `999px`, `background: #2f6bff`, `left: 6px`, animating `scaleY(0)→(1)` over `0.28s var(--bf-ease)` |
| Gap between groups | `18px` |
| Gap between eyebrow sections | `22px` |
| Footer (Settings + collapse) | separated by `1px solid var(--wx-line-soft)`, `padding-top: 10px`, `margin-top: 14px` |
| Release pill | `10.5px` / 700 / uppercase, `padding: 1px 6px`, radius `999px`; `NEW` = `#2f6bff` on `rgba(47,107,255,0.10)`, `BETA` = `#7c3aed` on `rgba(124,58,237,0.10)`. Same two strings, same two colours as today, re-cased to the site's pill recipe. |
| Recommended dot | `6px`, `#2f6bff`, after the label — unchanged |
| Bookmark star | `24×24` hit area at the row's right edge; `opacity 0 → 1` on `:hover` / `:focus-within`; starred stays `opacity 1`, `#e8a33d`, `fill: currentColor` — unchanged colours. **Below 1024px it renders at `opacity 0.55` permanently** (touch has no hover). |

Fully expanded, 9 groups + 22 pages + 4 eyebrows + footer ≈ **884px** tall. So the default is
*the active group expanded, the rest collapsed* (≈ 470px), which fits a 720px laptop without
scrolling.

### 3.3 Every existing nav category, and where it lands

Four group eyebrows. Nine hubs. All 22 page labels intact, all 9 hub labels intact.

| Eyebrow | Hub (accessible name, unchanged) | Rows inside |
|---|---|---|
| **Workspace** | `Home` (single) | → `dashboard` |
| | `Bookmarks` (single) | → `bookmarks` |
| **Plan** | `Schedule` (group, 7) | Schedule · Gantt Chart · Month · Week · List · Kanban · Matrix, then the **Saved views** block |
| | `Operations` (group, 2) | Projects · Crews |
| | `Resources` (group, 2) | Equipment · Materials |
| **Field ops** | `Field` (group, 3) | Field Updates · Map & Field Ops · DelayIQs |
| | `TimeCard` (single) | → `timecard` |
| **Business** | `Sales` (group, 3) | Contacts · Companies · Deals |
| | `Reporting` (single) | → `reports` |
| *(footer)* | `Settings` | → `openSettingsPage()` |

Notes on the mapping:

- Row order inside Schedule follows `navHubs` exactly (`schedule, month, week, list, kanban,
  matrix, gantt`) — the table above lists them in `navItems` display order for readability;
  **build order must be `navHubs` order** so `hub.pages[0]` stays `schedule` and clicking the
  header still lands on the landing page.
- The **Saved views** block (`SavedViewsFlyout`, `schedule/SavedViewsBar.tsx:101`) stays appended
  to the Schedule group, with its `Saved views` sub-head, Pin icon, view name and `<em>` filter
  description. Its CSS lives in **`schedule.css:1945-1965`** under `.hs-flyout .hs-flyout-views`,
  not in the shell stylesheet — that block must be re-scoped to `.bf-nav-views` in the same file
  or the divider hairline and the 160px ellipsis clamp are silently lost.
- The eyebrow strings `Workspace`, `Plan`, `Field ops`, `Business` are **the only new copy in
  this proposal.** They are `<div>`s, not controls, so no `getByRole` query can collide with a hub
  name. `Field ops` is deliberately not `Field` so no `getByText("Field")` becomes ambiguous.
  If literally-no-new-copy is required, drop them and keep the 22px section gaps — the design
  degrades gracefully to pure spacing groups.

### 3.4 The collapse toggle, and the three presentations of one DOM

One `<EditorialNav>` renders in three presentations. Same JSX, same roles, same accessible names —
only CSS and one wrapper change.

1. **Expanded** (≥1024px, default). 264px, in the grid.
2. **Collapsed** (≥1024px, opt-in). 72px, icons centred, labels `sr-only`, `title` on each header.
   Hovering or focusing a header lifts the sidebar to 264px as an **overlay**
   (`position: absolute; width: var(--hs-sidebar-w); box-shadow: var(--bf-shadow-float);
   background: var(--wx-card)`) rather than opening a separate 228px flyout — so the collapsed
   mode is a *peek of the same list*, not a return to the old hidden layer, and clicking the
   chevron pins it. Persisted per user per device as `bf:nav:collapsed:<userId>` in
   `localStorage`, using the same read/write/try-catch shape as `readBookmarks` (`App.tsx:653`).
   **No backend, no new API call, no change to any payload.**
3. **Drawer** (≤1023px). §5.

Toggle control: a chevron button in the sidebar footer,
`aria-label="Collapse navigation"` / `"Expand navigation"`, `aria-expanded`,
`aria-controls="bf-nav"`. It is a *separate* button from the hub headers so no header's accessible
name ever changes.

**Auto-collapse suggestion (flag for the user, not a default):** the six schedule view pages, the
Gantt and Map & Field Ops are horizontally hungry. Auto-collapsing on those eight pages, remembered
separately, recovers 192px where it matters. I have *not* baked this in because it makes the nav
width change under the user, which is its own irritation.

### 3.5 Component structure — the repo's recipe

Two new files in `client/src/components/ui/`, following the nine that exist. No Tailwind, no
`cn`, no `@/` alias; shadcn tokens mapped onto the existing custom properties; a header comment
naming the source; a `role` passthrough prop exactly as `interactive-hover-links.tsx` already does;
`prefers-reduced-motion` handled in the stylesheet.

**`client/src/components/ui/editorial-nav.tsx`** (~330 lines)

```tsx
/* Ported from 21st.dev "Sidebar 07 / grouped collapsible nav" (shadcn + Tailwind)
   into this codebase's conventions: no Tailwind, no `cn`, no `@/` alias — inline
   styles for the dynamic bits plus one scoped stylesheet (editorial-shell.css),
   with the shadcn sidebar tokens mapped onto the app tokens:
     sidebar            -> --wx-bg        (#f5f6fa, the one ground)
     sidebar-foreground -> --wx-ink
     sidebar-border     -> --wx-line-soft
     sidebar-accent     -> rgba(47,107,255,0.08)
     sidebar-primary    -> --wx-blue      (#2f6bff)
     muted-foreground   -> --wx-faint

   INVARIANT — DO NOT MOVE (30 tests depend on it):
   onMouseEnter lives on the ROW WRAPPER (.bf-nav-slot), not on the header
   <button>. React delegates mouseenter from mouseover, and the test harness
   fires `mouseOver(hubButton)`; putting the handler on the button, or swapping
   it for onPointerEnter, breaks openAppPage() for every area test at once.
   See test/appHarness.tsx openAppPage(). */
export type EditorialNavGroup = {
  id: string;
  label: string;                       // the hub label — the accessible name
  icon: LucideIcon;
  tag?: "New" | "Beta" | null;
  active?: boolean;
  recommended?: boolean;
  tutorialId?: string;                 // data-tutorial-id, single-page hubs
  onActivate: () => void;              // click the header: navigate to page[0]
  rows: EditorialNavRow[];             // empty => rendered as a single row
  footer?: ReactNode;                  // the Schedule group's Saved views block
};
export type EditorialNavRow = {
  id: string;
  label: string;
  icon: LucideIcon;
  tag?: "New" | "Beta" | null;
  active?: boolean;
  recommended?: boolean;
  locked?: boolean;
  tip?: { title: string; body: string } | null;
  tutorialId?: string;
  starrable?: boolean;
  starred?: boolean;
  onActivate: () => void;
  onToggleStar?: () => void;
};
export type EditorialNavProps = {
  groups: EditorialNavGroup[];
  presentation: "expanded" | "collapsed" | "drawer";
  openGroupId: string | null;
  onPeekGroup: (id: string) => void;   // hover/focus
  onPinGroup: (id: string) => void;    // chevron click
  footer?: ReactNode;                  // Settings row + collapse toggle
  id?: string;                         // "bf-nav"
};
```

The group's rendered shape — the harness contract made visible:

```tsx
<div className="bf-nav-slot" onMouseEnter={() => onPeekGroup(group.id)}>
  <button
    type="button"
    className="bf-nav-head"
    aria-label={group.tag ? `${group.label} (${group.tag})` : group.label}   /* unchanged */
    title={group.tag ? `${group.label} · ${group.tag}` : group.label}        /* unchanged */
    aria-haspopup={isSingle ? undefined : "menu"}                            /* unchanged */
    aria-expanded={isSingle ? undefined : isOpen}                            /* unchanged */
    data-tutorial-id={isSingle ? group.tutorialId : undefined}               /* unchanged */
    onFocus={() => onPeekGroup(group.id)}                                    /* unchanged */
    onClick={group.onActivate}                                              /* navigates */
  >…</button>

  {!isSingle && (
    <button type="button" className="bf-nav-chevron"
      aria-label={isOpen ? `Collapse ${group.label}` : `Expand ${group.label}`}
      aria-controls={`bf-nav-group-${group.id}`}
      onClick={() => onPinGroup(group.id)} />        /* the ONLY collapse path */
  )}

  {!isSingle && (
    <div id={`bf-nav-group-${group.id}`} className="bf-nav-group"
         role="menu" aria-label={`${group.label} menu`}>   /* unchanged role + name */
      {group.rows.map(row => (
        <div className="bf-nav-row" key={row.id}>
          <button type="button" role="menuitem"             /* unchanged role */
            data-tutorial-id={row.tutorialId}               /* nav-<page>, unchanged */
            aria-describedby={row.locked ? `hs-addon-tip-${row.id}` : undefined}
            onClick={row.onActivate}>…</button>
          {row.starrable && <button className="bf-nav-star" aria-pressed={row.starred}
            aria-label={row.starred ? `Remove ${row.label} from bookmarks`
                                    : `Bookmark ${row.label}`} …/>}
        </div>
      ))}
      {group.footer}
    </div>
  )}
</div>
```

Four things in that snippet are non-negotiable and are the whole reason the test suite survives:
`onMouseEnter` on the wrapper; the header's `aria-label` formula; `role="menu"` +
`aria-label="<Hub> menu"`; and `role="menuitem"` on every sub-item. The last one is the subtlest —
today's sub-items are `<button role="menuitem">`, and the role override is what stops
`getByRole("button", { name: /^Schedule/ })` from matching *both* the Schedule hub and the
Schedule page row. Downgrade them to plain buttons and `settings.test.tsx:113` throws "found
multiple elements" on the first iteration.

**`client/src/components/ui/nav-drawer.tsx`** (~120 lines) — §5.

**`client/src/useShellBreakpoint.ts`** (~24 lines) — a `matchMedia` hook that returns
`false` when `window.matchMedia` is absent or unstubbed, so jsdom always renders the desktop
presentation and the existing DOM shape is byte-comparable.

**`client/src/editorial-shell.css`** (~620 lines) — the one scoped stylesheet, `.hs-shell`-scoped,
imported **last** in `main.tsx` (after `app-shell-hubspot.css`). Append-only ordering change; the
"loads last so it wins" comment moves down one line. This is the safest possible way to touch a
hand-tuned 62-import order.

---

## 4. The top bar

Kept at parity in content, moved to the site's treatment.

### 4.1 Treatment

| Property | Today | Proposed |
|---|---|---|
| Height | `56px` | `64px` (`--hs-topbar-h`), the site's nav height |
| Background | `#14203a` solid | `rgba(245, 246, 250, 0.82)` + `backdrop-filter: blur(18px)` — the site's nav, verbatim |
| Border | `1px solid rgba(255,255,255,0.08)` | `1px solid var(--wx-line-soft)` |
| Text | `#ecf4ff` | `var(--wx-ink)` `#1c1c1a`; muted `var(--wx-mut)` |
| Brand | `17px` / 750 white | `17px` / 700 ink, mark 30px unchanged, `-0.02em` |
| Search box | `8px` radius, `rgba(255,255,255,0.1)` | `999px` pill, `#ffffff`, `1px solid var(--wx-line)`, `36px` tall, `min(420px, 100%)`, `13.5px`; focus adds `--bf-focus-ring` |
| Icon buttons | `40×40`, white-wash hover | `36×36`, radius `999px`, hover `rgba(28,28,26,0.05)`, press `scale(0.94)` |
| Divider | hairline, hidden `<760px` | `1px × 20px` `var(--wx-line-soft)`, unchanged breakpoint |

The bar becomes the same ground as the page and the sidebar. One ground, end to end, exactly as
`DESIGN_TOKENS.md` requires — and the banding that makes the shell look like a different product
disappears without touching a single label.

### 4.2 Every control, and what happens to it

| Control | Fate |
|---|---|
| **Hamburger** (new) | First in DOM, before the brand. `36×36`, `aria-label="Open navigation"` / `"Close navigation"`, `aria-expanded`, `aria-controls="bf-nav"`. Rendered only when `useShellBreakpoint()` reports `≤1023px`, so it is absent in jsdom and the existing DOM is unchanged there. |
| **Brand** | Unchanged: `aria-label="BuildFlow home"` → `goTo("dashboard")`. Word still hides `<1040px`, mark stays. |
| **Search** | Unchanged behaviour and markup — still a `readOnly` input inside a `<label>` with `onClick` + `onFocus` → palette, still `aria-label="Search BuildFlow"`, still a `⌘K` `<kbd>` chip hidden `<1040px`. **Do not make it a real input** (`risks[11]`); `enterDashboard()` awaits `findByLabelText("Search BuildFlow")` and 117 tests depend on it. Restyled to a white pill only. |
| **AI sparkle** | Kept, `aria-label="Ask BuildFlow AI"`. Keeps the blue→purple gradient — the shell's one gradient slot. `hs-top-twinkle` deleted; hover is background + `scale(0.94)` press. |
| **Bookmarks star** | Kept, `aria-label="Bookmarks (N)"`, `title="Bookmarked pages"`, gold `#f0b354` when `.has-items`, blue count badge `bookmarks.length + links.length`. Menu restyled (§4.3). **At `≤560px` it moves into the drawer's Quick actions instead of being `display:none`.** |
| **Create `+`** | Kept, `aria-label="Create new"`, all 7 entries (Project, Scheduled job, Crew, Contact, Company, Deal, Field update). `hs-top-spin` decoration deleted, but the **45° rotation while `aria-expanded`** is kept — that is state, not ornament. At `≤560px` moves into the drawer. |
| **Verify-email badge** | Kept exactly, still gated on `account.emailVerifiedAt == null`. Restyled to a light amber pill (`--wx-amber` untouched anywhere). |
| **Notification bell** | Kept, `aria-label="Notifications"`, `.bubble` count, 7-item cap, **and its position before the account control in DOM order** — `tests/tutorial.test.tsx:286` asserts that. `hs-top-bell` and `hs-top-badge` deleted. Stays in the bar at every width. |
| **Help / tutorial** | Kept, `aria-label="Help and tutorial"`, `title="Help & tutorial"`, `data-tutorial-id="tutorial-restart-button"`. **Stays visible at `≤560px`** — the tutorial's wrap-up step spotlights it, so it cannot go behind a drawer. This is a bug fix, stated as one. |
| **Settings gear** | Kept, `aria-label="Settings"`, `.hs-settings-button`. `hs-top-gear` deleted. At `≤560px` moves into the drawer — the sidebar's own `Settings` row and the account menu's `Settings` item both remain, so there are still ≥2 controls named `Settings` at every width. |
| **Account avatar** | Kept, `aria-label="<Name> account"`, initials from `data.activeUser.avatar`, `ChevronDown`. `hs-rail-pop` deleted. Stays in the bar at every width. |
| **CSS `order` cluster** | Kept as CSS `order` (create 1 · help 2 · settings 3 · notifications 4 · divider 5 · account 6). Visual re-ordering via CSS keeps `tutorial.test.tsx:286` green; re-ordering the JSX may not (`risks[9]`). **Do not touch the JSX order.** |

### 4.3 The four popovers

`.hs-bookmarks-menu`, `.hs-menu` (Create new), `#notifications-panel`, `#account-menu` — all four
keep their ids, roles, `aria-label`s, every row, every count and every action. One shared recipe
replaces four:

```
background: var(--wx-card);            /* #fff */
border: 1px solid var(--wx-line-soft);
border-radius: 12px;                   /* --bf-radius-control */
box-shadow: var(--bf-shadow-float);    /* 0 24px 70px rgba(28,28,26,0.14) */
padding: 8px;
row: 32px tall, 13.5px/500, radius 8px, gap 10px
row hover: background rgba(28,28,26,0.045) + label translateX(3px)
head:  11px/600 uppercase 0.085em var(--wx-faint), padding 6px 10px 4px
entrance: opacity 0 + translateY(-4px) -> none, 0.18s var(--bf-ease)   /* retimed hs-pop */
```

Each keeps its own document-level `mousedown` outside-click closer and its own `Escape` handler —
four separate `useEffect`s, untouched.

The notification bell's known shortcomings (no empty state, no read/unread, hard cap at 7, no
"view all") are **not** fixed here. `risks[7]` is right that anything richer is a new feature. It
gets the new surface recipe and nothing else, and it will still look thin in a fresh workspace.

---

## 5. The mobile drawer the shell has never had

### 5.1 Breakpoints

| Width | Nav |
|---|---|
| ≥1240px | Sidebar 264px, in the grid |
| 1024–1239px | Sidebar 232px, in the grid (row/eyebrow type unchanged; only the width and the row `padding-left` on sub-rows drop 32px → 28px) |
| ≤1023px | Sidebar leaves the grid (`grid-template-columns: minmax(0,1fr)`) and becomes the drawer; hamburger appears |
| ≤560px | Drawer plus the relocated Quick actions block |

### 5.2 The drawer

```css
.hs-shell .bf-nav.is-drawer {
  position: fixed;
  inset: var(--hs-topbar-h) auto 0 0;
  z-index: 60;                      /* above the 40 of the sticky bar, below the palette */
  width: min(320px, 86vw);
  background: var(--wx-card);       /* a sheet, so it reads as ON the ground, not part of it */
  border-right: 1px solid var(--wx-line-soft);
  box-shadow: var(--bf-shadow-float);
  transform: translateX(-100%);
  transition: transform 0.3s var(--bf-ease);   /* --bf-dur-panel */
}
.hs-shell .bf-nav.is-drawer.is-open { transform: translateX(0); }
.hs-shell .bf-nav-scrim {
  position: fixed; inset: var(--hs-topbar-h) 0 0 0; z-index: 55;
  background: rgba(28, 28, 26, 0.42);
  opacity: 0; pointer-events: none;
  transition: opacity 0.25s ease;
}
.hs-shell .bf-nav-scrim.is-open { opacity: 1; pointer-events: auto; }
```

Behaviour, all in `nav-drawer.tsx`:

- Portalled to `document.body`, like `BreezeAssistant` already is.
- `role="dialog"`, `aria-modal="true"`, `aria-label="Primary navigation"`, `id="bf-nav"`.
- Opens from the hamburger; closes on scrim click, `Escape`, a successful navigation, and a
  `matchMedia` change back above 1023px.
- Focus moves to the drawer's first row on open; focus **returns to the hamburger** on close.
- Focus trap over the drawer's own tabbables (`Tab` / `Shift+Tab` wrap). Reuse the pattern in
  `useModalDialog` (`App.tsx:22979`) rather than writing a second one.
- Scroll lock: `overflow: hidden` on `.hs-shell`, **not** on `document.body` (a body lock jumps
  scroll position on iOS).
- In the drawer, **all groups render expanded** — a phone user should see the whole map on one
  scroll, not hunt for chevrons. `overflow-y: auto`, `-webkit-overflow-scrolling: touch`.
- Bookmark stars render at `opacity 0.55` permanently (no hover on touch).
- Locked-page tooltips render on `:focus-within` as well as `:hover`, so the add-on explanation is
  reachable by tap.

### 5.3 The `≤560px` fix

Today four controls are `display:none`'d and their functions become unreachable. Instead, the
drawer grows a final block:

```
eyebrow "Quick actions"
  row  Create new         -> the same createActions menu, rendered inline in the drawer
  row  Bookmarks (N)      -> the same star menu contents, rendered inline
  row  Settings           -> onOpenSettings()
```

`Help and tutorial`, `Notifications` and the account button **stay in the top bar at every width**
— the tutorial spotlights the help button and the bell/account pair carries the DOM-order
assertion. Net effect: at 375px wide the bar holds hamburger · mark · search · sparkle · help ·
bell · account (7 × 36px + search = fits), and nothing at all is unreachable. That is the first
time the phone layout is complete.

This block is gated on `useShellBreakpoint("(max-width: 1023px)")`, so it does **not** render in
jsdom and adds no controls to the 117 existing whole-app tests.

---

## 6. Everything else the shell owns

| Surface | Fate |
|---|---|
| **⌘K command palette** | Behaviour untouched. Restyled to the popover recipe at `min(640px, calc(100vw - 32px))`, radius `18px`, `--bf-shadow-float`. **No entrance animation** — the palette resets its query and focuses its input inside a `requestAnimationFrame`, and an animation that delays mount races that focus (`risks[12]`). |
| **Ask AI floating launcher** | Kept, fixed bottom-right, hidden while the assistant is open. Keeps the gradient. `56px` circle, `--bf-shadow-pill`. |
| **BuildFlow AI assistant panel** | Behaviour untouched. `hs-breeze.css` currently hard-codes `top: 56px`, `left: 56px`, `width: min(600px, calc(100vw - 56px))` and re-declares `--bfz-navy: #14203a`. Those become `top: var(--hs-topbar-h, 64px)`, `left: var(--hs-sidebar-w, 264px)`, `width: min(600px, calc(100vw - var(--hs-sidebar-w, 264px)))`, and at `≤1023px` `left: 0` + full width (the sidebar is off-canvas). **This file must be edited in the same commit or the panel overlaps the chrome.** |
| **"What's new" modal + add-on prompt** | Both keep every string and action. They share `.hs-upd-*` classes (`risks[13]`) — split the shared base into `.bf-dialog` first, then restyle, or restyling one silently restyles the other. `spotlightUpdateTarget()` keeps working because every `data-tutorial-id` survives. |
| **Guided tutorial** | Every anchor preserved. `nav-<page>` moves from the flyout item to the sidebar row — same element type, same attribute, and now *always in the document* rather than only while hovered, which makes the spotlight more reliable, not less. `tutorial-restart-button` stays in the top bar at every width. The scrim is a `9999px` box-shadow, not an overlay, so **no new stacking context may sit above it** — `z-index` on the sidebar is `30` (below the bar's `40`) and the drawer's `60` only exists while the drawer is open, when the tutorial is not running. |
| **Bookmarks page** | Untouched by this concept beyond the shared index restyle. Note `BUG-1` from the completeness check: opening a bookmarked schedule **view** only rewrites `location.hash` and is a no-op in-app. This concept **preserves the dead control as-is** and flags it — fixing it is a routing change, which the brief forbids in this pass. |
| **Loading / error screens, DashboardSkeleton** | Kept verbatim in content: `Loading BuildFlow HUD`, `BuildFlow data is unavailable.`, `Try again`, `Back to log in`, `role="status"` + `aria-label="Loading your dashboard"`. Restyled to the paper ground. The skeleton must keep rendering `DASH_LAYOUT_DEFAULT` shapes at `grid-auto-rows: 40px`. |
| **Release pill `<PageReleaseTag>`** | `BUG-2`: it is unstyled on all six schedule view pages because `schedule/page.tsx` renders it inside `.dx-title`, not `.hs-index-title`, so `New` currently prints as bare inline text on Month/Week/List/Kanban/Matrix/Gantt. Fix by adding **one unscoped `.hs-page-tag` rule** in `editorial-shell.css`. Two lines, six pages fixed. |
| **Settings page** | **Parity in Phase 1: no top bar, no sidebar, single-column `.settings-shell`, exactly as today.** This is the concept's honest hole (§9.3) and its Phase 2 item. |

---

## 7. Motion

### 7.1 Deleted — 7 keyframes, because they are a fifth grammar

`hs-rail-pop`, `hs-rail-draw`, `hs-rail-ring`, `hs-tag-ping`, `hs-top-spin` (decorative half),
`hs-top-gear`, `hs-top-bell`, `hs-top-badge`, `hs-top-twinkle`. Nine names, seven behaviours.
None of them is lift, invert, slide or tilt. Removing them is the single largest step toward the
shell reading as the same product as the site, and it also removes an infinite animation
(`hs-tag-ping`, 2.4s) from a sticky element.

### 7.2 Kept and added — the complete shell motion inventory afterwards

| Move | Spec |
|---|---|
| Nav row hover | `background 0.18s ease` + label `translateX(3px)` `0.18s var(--bf-ease)` — **slide** |
| Active spine | `scaleY(0) → (1)` `0.28s var(--bf-ease)` |
| Group expand / collapse | `grid-template-rows: 0fr → 1fr`, `0.26s var(--bf-ease-size)` — the non-overshoot curve, because overshoot on a height reads as a glitch. `max-height` fallback for older engines. No per-row stagger: stagger is for entrances, not navigation. |
| Icon-button press | `scale(0.94)` (`--bf-press-scale`) `0.18s` |
| Create `+` state | `rotate(45deg)` while `aria-expanded` — state indicator, kept |
| Popover entrance | `opacity 0 + translateY(-4px) → none`, `0.18s var(--bf-ease)` |
| Drawer | `translateX(-100%) → 0`, `0.3s var(--bf-ease)`; scrim `opacity 0.25s ease` |
| Collapsed peek | `width 72px → 264px` + `--bf-shadow-float`, `0.26s var(--bf-ease-size)` |

Eight moves for the whole shell, against roughly twenty today.

### 7.3 Two traps this concept must not walk into

1. **`[data-reveal]` must never appear anywhere in the shell.** The engine
   (`client/src/useHudMotion.ts`) adds `.in` imperatively from an `IntersectionObserver`, CSS
   rests at `opacity: 0`, and a *dynamic* `className` on such an element wipes the imperative class
   and leaves it invisible forever. Sidebar rows have dynamic classNames by definition (`active`,
   `locked`, `recommended`, `open`). **No reveal on nav rows, popovers, the drawer or the top bar.**
   One-shot reveals stay where they already are: page content.
2. **No new containing block above a spotlit element.** No `transform`, `filter`, `contain` or
   `will-change` on `.hs-shell`, `.hs-body`, `.bf-nav`, `.bf-nav-slot` or `.bf-nav-group`. The
   drawer's `transform` is fine because the drawer is never open while the tutorial runs, but say
   so in a comment so nobody "optimises" the sidebar with a `translateZ(0)`.

### 7.4 Reduced motion — extend, do not reinvent

The repo has 10 `@media (prefers-reduced-motion: reduce)` blocks, four of them in
`app-shell-hubspot.css` (~673, ~855, ~942, ~1115). Those four shrink as their rules are deleted;
they are **edited, not removed**. `editorial-shell.css` adds **one** new block, the eleventh, which
must null exactly four things:

```css
@media (prefers-reduced-motion: reduce) {
  .hs-shell .bf-nav-group { transition: none; }          /* jump the height */
  .hs-shell .bf-nav.is-drawer { transition: none; }      /* appear, don't slide */
  .hs-shell .bf-nav-scrim { transition: none; }
  .hs-shell .bf-nav-head::before,
  .hs-shell .bf-nav-row .bf-nav-item::before { transition: none; transform: none; }
}
```

`--bf-slide`, `--bf-lift`, `--bf-lift-dense` and `--bf-press-scale` already zero themselves in
`design-tokens.css`'s existing reduced-motion block, so every hover move is handled by the token
layer and needs no repetition here. That is the whole point of that file and this concept leans on
it rather than re-declaring.

---

## 8. What changes on disk

### 8.1 New files (4)

| File | ~Lines | What |
|---|---|---|
| `client/src/components/ui/editorial-nav.tsx` | 330 | the one nav DOM, three presentations |
| `client/src/components/ui/nav-drawer.tsx` | 120 | portal, scrim, focus trap, Escape, scroll lock |
| `client/src/useShellBreakpoint.ts` | 24 | jsdom-safe `matchMedia` hook |
| `client/src/editorial-shell.css` | 620 | the one scoped stylesheet, imported last |

### 8.2 Edited files (7)

| File | Change |
|---|---|
| `client/src/App.tsx` | `Sidebar` (20516-20712, ~197 lines) becomes a ~70-line adapter that maps `navHubs`/`navItems` to `EditorialNavGroup[]` and renders `<EditorialNav>`; `TopBar` (20796-21222) gains the hamburger and loses nothing. **No change to `setPage`, `openAppPage`, `openSettingsPage`, the routing effect, `runBootstrap`, `retryTransient`, the demo fallback, or any API call.** |
| `client/src/main.tsx` | append `import "./editorial-shell.css";` after line 62; delete line 27 (`sidebar-redesign.css`). One append, one delete — no reorder. |
| `client/src/app-shell-hubspot.css` | delete the rail + flyout blocks (81 selector lines, ~330 lines with their media/reduced-motion rules); retune the top-bar block to paper; keep all four reduced-motion blocks |
| `client/src/hs-breeze.css` | the three hard-coded `56px` → the shell tokens, plus a `≤1023px` full-width dock |
| `client/src/schedule.css` | re-scope `.hs-flyout .hs-flyout-views` (1945-1965) → `.bf-nav-views`, same rules |
| `client/src/topbar-redesign.css` | 189 lines; audit for navy literals that fight the paper bar |
| `client/src/design-tokens.css` | append the three tokens in §2.3 |

### 8.3 Deleted files (1)

`client/src/sidebar-redesign.css` — 312 lines, `.sidebar-rx`, **entirely dead** (43 rules, zero
reachable). `risks[8]` notes that leaving it invites someone to "fix" a sidebar that no longer
exists. Deleting it is why the net CSS line count barely moves: **+620 new, −312 dead, −330
removed from the shell = −22 lines** across 60,798.

### 8.4 The four fixed decisions, honoured

1. **No Tailwind, no shadcn.** Two ported components in `components/ui/` as inline styles + one
   scoped stylesheet, shadcn sidebar tokens mapped onto `--wx-*`, following the nine that exist.
2. **Accent `#2f6bff`.** Used in the shell in exactly three places: the active row's spine and
   label, the count badges, and the focus ring at 12% alpha. The Welcome Page and `.acct-split`
   move to it in the same pass (`--wx-blue: #1a73e8` → `#2f6bff` in `.welcome-rx`,
   `.acct-split`, `.careers-apply-page`), which also brings the focus ring to
   `rgba(47,107,255,0.12)`.
3. **`--wx-amber` untouched.** It stays `#0032b0` in its 7 scopes and `#b45309` in `.crew-rx`, and
   renders exactly as it does today. The verify-email pill and every `.health.amber` keep reading
   it unchanged.
4. **`--wx-serif` deleted.** Remove the declaration from the 10 app scopes and rewrite the 27
   `var(--wx-serif)` references to `var(--bf-font-sans)`. Every one of them is already overridden,
   so this is provably inert — verify with the computed-style harness before and after, then the
   Palatino trap is gone for good.

---

## 9. Test risk, honestly

### 9.1 The exposure

346 tests / 37 files pass today. Measured against the source:

- **117 whole-app tests** ride the shell: `App.test.tsx` (63), `tests/settings.test.tsx` (11),
  `tests/schedule.test.tsx` (11), `tests/index-pages.test.tsx` (12), `tests/landing-menus.test.tsx`
  (8), `tests/map.test.tsx` (7), `tests/tutorial.test.tsx` (5). All seven use
  `installAppHarness()`.
- **30 call sites** ride the nav click path specifically: `openAppPage` × 30
  (`index-pages` 13, `App.test.tsx` 14, `map` 3) and `openSchedule` × 3 (`schedule` 2,
  `settings` 1).
- **87 call sites** reach the dashboard through the auth funnel
  (`enterDashboard` / `completeOnboarding`): `App.test.tsx` 43, `index-pages` 13, `schedule` 10,
  `settings` 10, `tutorial` 8, `map` 3.

### 9.2 What I claim, and the five invariants it rests on

**Test files changed: 0. Test files added: 1.**

The proposal is designed so the harness's exact strings and structure survive:

1. `fireEvent.mouseOver(hubButton)` still reveals the group, because `onMouseEnter` stays on the
   **row wrapper** (today `.hs-rail-slot`, tomorrow `.bf-nav-slot`) and React delegates
   `mouseenter` from `mouseover`. **Moving it onto the `<button>` or swapping it for
   `onPointerEnter` breaks all 30 nav call sites at once.** It is commented as an invariant in the
   component header.
2. Hub headers keep the accessible-name formula `hubTag ? \`${label} (${tag})\` : label`, so
   `new RegExp("^Operations( \\(.*\\))?$")` and `/^Schedule( \(.*\))?$/i` still match one button.
3. Sub-items keep `role="menuitem"` and their exact `navItems` labels, so
   `findByRole("menuitem", { name: /^Projects/ })` still matches one element **and** the Schedule
   hub button does not collide with the Schedule page row under
   `getByRole("button", { name: /^Schedule/ })`.
4. Clicking a hub header still navigates to `hub.pages.find(unlocked) ?? hub.pages[0]`, so
   `openSchedule()`'s no-view branch still lands on "The whole plan, at a glance." and
   `settings.test.tsx:113`'s loop over `["Schedule","Operations","Resources","Field","Reporting","Home"]`
   still works. Collapse lives on a **separate chevron button**, precisely so the header's click
   stays a navigation.
5. Both gears keep `aria-label="Settings"` and the top-bar gear stays **first in DOM**, so
   `findAllByRole("button", { name: "Settings" })` still returns ≥2 and `[0]` still opens
   Preferences. The drawer's third `Settings` row is `matchMedia`-gated and absent in jsdom.

Plus three inherited constraints I am not disturbing: the bell stays before the account control in
**JSX** order (`tutorial.test.tsx:286`); the search input keeps
`aria-label="Search BuildFlow"` and its `readOnly` label wrapper (every `enterDashboard`); no
schedule markup and no `/gantt-/` className enters `App.tsx` (`schedule/boundary.test.ts` fails
the build on either).

### 9.3 Where I am actually exposed

| Risk | Which tests | Why |
|---|---|---|
| The `mouseOver` invariant | **30 call sites, 7 files** | One refactor of the handler's host element and most of the suite reds at once. Highest single risk in the proposal. |
| `map.test.tsx:103` locked-item path | 1 | Clicking the locked `Map & Field Ops` row must open `Get Map & Field Ops` and **not** navigate. The `onActivate` branch is copied verbatim; still worth running first. |
| `settings.test.tsx:113` `[0]` ordering | 1 | If anyone renders the sidebar before the top bar in the JSX, `[0]` becomes the sidebar gear. Both open Settings, so it would still pass — but only by luck. Keep the order. |
| jsdom + `matchMedia` | 0 today, all new drawer tests | `useShellBreakpoint()` returning `false` unstubbed is what keeps the desktop DOM byte-identical. If someone "improves" the default to `true`, the drawer renders in every test and adds duplicate `Settings` / `Create new` controls. Comment it. |
| The drawer, the star menu, the Bookmarks page and `BreezeAssistant` have **zero** existing coverage | 0 | `risks[12]` is explicit about this. Behaviour there must be preserved by reading the code, not by running the suite. |
| CSS-only regressions | 0 | 30 breakpoints, 57 stylesheets, no visual regression tests. Verify in the browser at 1440 / 1240 / 1024 / 820 / 560 / 375, on every one of the 23 routes, and re-run the computed-style harness for the `--wx-serif` deletion. |

### 9.4 The one new test file

`client/src/tests/shell-nav.test.tsx`, ~6 tests, all additive:

1. a sub-page is reachable by **click alone** — no `mouseOver` — from a collapsed group
   (the accessibility fix, asserted);
2. the chevron collapses a group without navigating (header name unchanged, page unchanged);
3. with `matchMedia` stubbed to `≤1023px`: the hamburger opens the drawer, `Escape` closes it, and
   focus returns to the hamburger;
4. with `matchMedia` stubbed to `≤560px`: `Create new`, `Bookmarks`, `Settings` and
   `Help and tutorial` are all reachable (the phone-parity regression guard);
5. every `data-tutorial-id="nav-<page>"` is in the document for all 22 pages;
6. a locked row still opens its `AddOnPrompt` and does not navigate.

---

## 10. Weaknesses

1. **264px is 208px of new chrome.** On a 1440px screen the Matrix grid, the Week board and the
   Gantt lose real horizontal room, and those are the pages where horizontal room *is* the product.
   The collapse toggle mitigates it — but a collapsed sidebar is an icon rail, so on exactly the
   pages that need the width most, the concept partly reverts to the thing it replaced. The
   auto-collapse idea in §3.4 papers over it at the cost of a nav that resizes under the user.
2. **Four strings of new copy.** `Workspace`, `Plan`, `Field ops`, `Business` do not exist today.
   The brief forbids dropping and rewording, not adding, but a grouped sidebar without eyebrows is
   just spacing — so the concept's central "grouped sections" claim leans on the one thing that
   isn't strictly parity.
3. **Settings keeps no sidebar in Phase 1.** The concept's headline promise is that you can always
   see where you are and leave in one click; on the app's largest page (17 screens, 130 fields)
   that promise has a hole, because `page === "settings"` renders neither chrome and 11 settings
   tests plus the `settings-shell` single-column grid guard it. Phase 2, named and scoped, is not
   the same as done.
4. **The drawer is unprotected.** It is the largest genuinely new surface, it has zero existing
   coverage, and it needs a `matchMedia`-stubbing discipline this repo has never used. The four
   new tests are a floor, not a net.
5. **Deleting 7 keyframes is a taste call.** The stroke-redraw, the ring pulse and the bell swing
   are somebody's deliberate delight. The four-move grammar justifies removing them, but a quieter
   shell can read as a cheaper shell, and there is no test and no metric that will tell us which
   way it landed.
6. **A scrolling nav is where the spotlight breaks.** Nine groups fully expanded is ~884px; on a
   1366×720 laptop with a 64px bar the sidebar scrolls, and the tutorial spotlight, which measures
   with `getBoundingClientRect` against a `9999px` box-shadow scrim, is at its least reliable
   inside a scroll container. Active-group-only expansion keeps it under 470px in the common case,
   but "common" is not "always".
7. **Two doors to the same room.** `Bookmarks` is now a labelled top-level sidebar row *and* a
   top-bar star menu *and* a page. All three exist today so all three are kept, but a redesign that
   makes navigation legible also makes that redundancy legible for the first time.
8. **The `#f5f6fa` sidebar on a `#f5f6fa` page is one hairline apart.** It honours "one ground"
   literally, and it is the boldest colour move here — but it depends entirely on
   `rgba(28,28,26,0.07)` reading correctly on every panel. On a cheap or badly calibrated site
   monitor the nav may not visually separate from the content at all, and the fallback (a `#ffffff`
   sidebar) quietly reintroduces the banding the concept set out to remove.
