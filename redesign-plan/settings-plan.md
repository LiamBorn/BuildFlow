# Settings — redesign plan

> Area: `page === "settings"` — the shell, the 14 `SettingsView` categories and the two extra
> Billing sub-surfaces that render inside one of them (17 screens in `inventory/settings.json`).
>
> Shell concept: **preserve / "Daylight Rail"** (`plan/concept-preserve.md`), with the judges' grafts
> from canvas, hybrid and editorial applied. Settings is the one surface that concept named as its
> single genuine test exposure and as *severable* (§6g, §10 risk #1), so this file is written to be
> shippable on its own and revertable in two lines.
>
> Presentation only. No API call, no data model, no save/load path, no auth and no piece of copy
> changes in the default plan. Everything that would change behaviour is quarantined in **§8** and
> **§9**, is individually numbered, and is marked **NEEDS APPROVAL**.

---

## 0. Five things the inventory and the winning concept got wrong, verified in source

The plan below depends on these, so they are stated first with file and line.

| # | Claim | Verified correction |
|---|---|---|
| 0.1 | concept-preserve §12.2: "nothing in the app exceeds 26px", "the largest thing on any app page is 26px" | False for Settings, twice. `settings-redesign.css:412-419` puts the page `h1` at `clamp(26px, 3vw, 33px)/750`, and `settings-redesign.css:1288-1293` puts `.sx-plan-price strong` at **40px/800/-0.02em**. Settings, not the Dashboard, is where the product comes closest to the Welcome Page's display register — its 40px figure is 0.87× Welcome's *smallest* stat figure (46px). This changes the density argument for this area: Settings does not need a display register invented for it, it needs the one it already has put on the ladder. |
| 0.2 | inventory `animations` for Billing part 1: ".settings-status-pill and .settings-owner-summary are static blue pills" | The status pill has **four** `data-status`-driven variants and its default is **grey**, in `account-redesign.css:1796-1820` (grey `#f0f1f4`/`#47505f` for `free` + `enterprise`, amber `rgba(224,162,60,.16)`/`#a8721b` for `trial`, red `rgba(217,101,112,.16)`/`#b4404b` for `trial_expired`, green `rgba(47,158,107,.14)`/`#1f8a58` for `active`). `.settings-owner-summary` *is* blue (`settings-redesign.css:843-856`). The inventory's own `completenessCheck` already carries this correction; it is repeated here because §5.6 acts on it. |
| 0.3 | DESIGN_TOKENS.md: "One typeface: **Inter**, everywhere" | Settings is the one place in the app where a **serif actually renders**: `settings-redesign.css:1147` sets `.sx-plans-title { font-family: Georgia, "Times New Roman", serif }` as a hard-coded literal (not `--wx-serif`, so decision #4's deletion does not reach it) inside `.settings-rx`, which wins on specificity. "Plans that grow with you" is drawn in Georgia today. §5.4 kills it. |
| 0.4 | inventory `crossCutting`: "17 selects … 13 toggles … 7 action buttons" | 15 uncontrolled selects, 14 `SettingsToggle`s, 8 dead action buttons — 37 controls in 37 static rows. §6 enumerates all 37 and reconciles the arithmetic per view. |
| 0.5 | inventory: Work calendar "default … a six-day week `[1,2,3,4,5,6]`" | `defaultWorkCalendar()` (`shared/src/index.ts:630`) also seeds `constructionHolidays(year)` **and** `constructionHolidays(year+1)` = 14 rows, so a fresh workspace opens with a populated list, the documented empty state is unreachable in practice, and two of the three "Add &lt;year&gt; holidays" buttons ship already disabled. §6.7 designs for the populated case first and keeps the empty state. |

---

## 1. The translation: Welcome Page language at Settings' density

### 1a. Carries over **literally** — same value, no rescale

These are the nine surface properties concept-preserve identifies as carrying the family resemblance.
Every one applies to Settings unchanged.

| Thing | Value | Where it lands in Settings |
|---|---|---|
| One ground | `#f5f6fa`, sections transparent, no banding | already `settings-redesign.css:15-52`; the change is that the *rail* and the *section cards* stop opting out (§5.2, §5.3) |
| Ink / muted / faint | `#1c1c1a` / `#575550` / `#8a877e` | already declared in `.settings-rx`; the change is that `#47505f`, `#6f7785`, `#10203f` (a fourth and fifth ink, in `account-redesign.css` and legacy `styles.css`) stop showing (§5.6) |
| Hairlines | `rgba(28,28,26,0.13)` / `rgba(28,28,26,0.07)` | already declared; `#dfe3ec`, `#eceff5`, `#e8f0fe` literals in the `.wc-*` block get re-tokenised (§6.6) |
| Card fill | `#ffffff` | rail, plan cards, add-on cards |
| **One accent** | `#2f6bff`, and an accent **budget expressed as a count** | at most **one** accent-filled element per region: 1 in the rail, **0** in the page header, 1 per card. Enforced, including on the two `aria-current` controls (§4.3) — the graft the losing concept declared and did not enforce |
| Gradient trio | `#4285f4 → #9b72cb @54% → #d96570` | in Settings it appears on **exactly one view**, `buildflowAi`, on two glyphs (the header icon square and the rail spotlight's Sparkles). Three gradients die for it (§5.5) |
| Radius ladder | `999 / 26 / 20 / 18 / 12 / 8` (+`50%`) | Settings uses `999 / 18 / 12 / 8`. **Radius does not rescale with density** — an 18px corner is a sheet of paper, a 14px corner is a widget — so today's `14px` (header icon) and `11px` (selects, nav rows) move onto the ladder rather than the ladder moving to them. This is the exact point editorial contradicted itself on |
| Shadow ladder | the seven steps verbatim | `--bf-shadow-card` at rest and `--bf-shadow-card-hover` on lift, on the six licensed cards; **no shadow anywhere else** in the area. Two off-ladder shadows die: `0 14px 34px /.06` and `0 24px 48px /.10` (`settings-redesign.css:439,448`) |
| Easing | `cubic-bezier(0.22,1,0.36,1)`; the size curve only for height/grid | Settings is already almost compliant — `sx-rise`, `sx-plan-in`, `.sx-seg-ind`, `.plans-billing-indicator` and the `PriceCounter` tween all use it. The nine `0.18s ease` / `0.2s ease` / `0.3s ease` transitions move to `var(--bf-ease)` |
| Interaction durations | `.18` press · `.25` hover · `.28` transform · `.3` panel | replaces four ad-hoc durations |
| Hover grammar | four moves: **lift** cards, **invert** pills, **slide** directional links, **tilt** mocks | Settings gets three of the four: lift (plan + add-on cards only), invert (`.acct-primary`, `.outline-button`, `.wc-day`), slide (nav rows keep their `translateX(2px)` → `var(--bf-slide)` 3px; `.acct-invite-add`'s "+ Add another"). Tilt has no home here; the page-scale `.dx-cursor` glow already is the re-scaled fourth move (§7) |
| Reveal contract | `threshold 0.16`, `rootMargin '0px 0px -6% 0px'`, add `.in`, **unobserve** | **Settings must never join it.** See the invariant in §7.1 — this is a real, silent, page-blanking bug |
| Copy measures in `ch` | prose gets a `ch` cap | every helper line, hint, notice and description in the area goes to `var(--bf-app-prose)` = `62ch`, replacing `max-width: 620px` and `640px` px caps |
| Eyebrow | `11.5px / 650 / 0.045em / uppercase / #8a877e` — **×1, no rescale** | the highest-yield single rule in the set. Settings has **five** eyebrow-shaped roles and gets all five onto it (§5.1) |
| The 72px bottom tail | Welcome-scale air is free at the foot of a page | already true: `settings-redesign.css:305` is `padding: 46px … 72px`. It stays at 72px at **every** width (today the narrow tier drops it to 60px) |

### 1b. Gets **re-scaled** — with the numbers and the factor

| Role | Welcome Page | Settings | Factor |
|---|---|---|---|
| Largest figure | stat `clamp(46px, 5.4vw, 72px)`, `-0.02em` | plan price **`clamp(32px, 3.4vw, 40px)`**, `-0.02em`, `800`, `+ tabular-nums` (today a fixed `40px/800`) | ÷1.8 at the ceiling |
| Hero / page title | hero `clamp(46px, 6.8vw, 96px)` | page `h1` `clamp(26px, 3vw, 33px)`, `-0.02em`, `1.05`, weight `750 → 700` | ÷2.9 |
| Section h2 | `clamp(32px, 4.4vw, 54px)` | section head **`16px`/600/`-0.01em`** (today `15px/700`) | ÷3.4 |
| Second display | row `h3` `clamp(26px, 3vw, 38px)` | the plans title `clamp(22px, 1.9vw, 26px)`/600 (today `30px` Georgia) | ÷1.5 |
| Lede | `clamp(16px, 1.35vw, 19px)` | page-header `p` `14.5px` (unchanged), capped `62ch` (today `640px`) | ÷1.3 |
| Body | 15–16px | row title `14px/650` (**frozen**), helper `13px/500/1.5` | ÷1.15 |
| Eyebrow | 11.5–13px | `11.5px/650/0.045em` uppercase `#8a877e` | **×1** |
| Micro | — | badge / pill `11px/700/0.06em` uppercase | — |
| Section rhythm | `clamp(76px, 12vh, 130px)` → 108px @1440 | `--bf-rhythm-dense` `clamp(20px, 3vh, 34px)` → 27px @900 tall (today a flat `22px`) | ÷4.0 |
| Section head margin | `0 auto 54px` | `0 0 12px` | ÷4.5 |
| Page measure | 1140px | `min(920px, 100%)` for the document column (**kept**), with `.bf-doc-bleed` letting the plan grid and the add-on grid reach `1040px` (`--bf-measure-hero`) | ÷1.24 |
| Card lift | `translateY(-6px)` | `translateY(-4px)` (`--bf-lift-dense`), plan + add-on cards only | ÷1.5 |
| Focus ring | `0 0 0 4px rgba(26,115,232,0.12)` | `0 0 0 4px rgba(47,107,255,0.12)` (re-based to decision #2), replacing three different `3px` rings at `.14`/`.16`/`.18` alpha | ÷1.33 in width, unified in alpha |

### 1c. One system at two volumes — the checkable sentence

Stated against the source's own internal range, the way the judges asked:

- Settings runs **helper 13px → plan price 40px = 3.08×**, or **eyebrow 11.5px → 40px = 3.48×**.
- The Welcome Page runs **body 12px → hero 96px = 8.0×**.
- Settings' range is **0.43× the marketing page's, on one continuous ladder**, and the eyebrow rung is
  shared at 1:1 between them.
- Rhythm compresses ÷4.0 and type compresses ÷2.9 at the title, ÷1.8 at the figure. The two ends of
  the compression are within 2.2× of each other, which is why this reads as one system at two zoom
  levels rather than two systems.

Settings is also the **only** app surface that occupies the display register at all (0.1). That is
worth saying plainly: after this work, the product's largest type lives on its Billing page.

### 1d. The token block

Appended to `client/src/design-tokens.css` (additive, `--bf-` prefix, pixel-inert until read). The
first four already exist in concept-preserve's §3c block; only the three marked **new** are specific
to this area.

```css
:root {
  --bf-app-title:         clamp(22px, 1.9vw, 26px);   /* the plans title */
  --bf-app-title-hero:    clamp(26px, 3vw, 33px);     /* NEW — the Settings page h1, today's value */
  --bf-app-figure-hero:   clamp(32px, 3.4vw, 40px);   /* NEW — the plan price, today's ceiling */
  --bf-app-section:       16px;
  --bf-app-lede:          14.5px;                     /* NEW — the page-header paragraph, today's value */
  --bf-app-row-strong:    14px;                       /* the settings row title — FROZEN, see §5.1 */
  --bf-app-row:           13px;
  --bf-app-eyebrow:       11.5px;
  --bf-app-eyebrow-track: 0.045em;
  --bf-app-micro:         11px;
  --bf-app-prose:         62ch;
  --bf-lift-dense:        -4px;
}
@media (prefers-reduced-motion: reduce) { :root { --bf-lift-dense: 0px; } }
```

Plus the two corrections concept-preserve already schedules: `--bf-focus-ring` re-based to
`rgba(47,107,255,0.12)`, and `--wx-serif` deleted from its 10 app-scope declarations. Neither is
declared inside `.settings-rx` today, so neither touches this area — but 0.3's Georgia literal does,
and it is this area's job.

---

## 2. Information architecture

### 2a. The arithmetic

The inventory lists **17 screens**. They are not 17 peers:

| | Count | What they are |
|---|---|---|
| Categories | **14** | the `SettingsView` union (`App.tsx:22312-22327`), each one rail label + one `h1` + a panel |
| Shell | 1 | the two-pane page itself (rail + panel + close) |
| Billing sub-surfaces | 2 | `SettingsBillingPlans` (`App.tsx:21448`) and the Add-ons block (`App.tsx:21536-21600`), which render *inside* the `billing` category, under its status panel |
| **= inventory screens** | **17** | |
| Rail controls carrying `aria-current` | **15** | 14 nav items + the bottom BuildFlow AI spotlight, which is a deliberate second door to the `buildflowAi` category |

So the IA question is: are those 14 categories in the right 4 groups, and do the 2 Billing
sub-surfaces belong where they are.

### 2b. The grouping, and why it is defensible

The four groups are kept **verbatim**, in order, with all 14 labels and all 14 memberships unchanged.
The axis they already encode is **scope of effect**, and it is the right axis for a settings surface
because it answers the only question a user brings to one ("if I change this, who else notices?"):

| Group (unchanged) | Scope of effect | Categories (unchanged, in order) |
|---|---|---|
| **Account** | just me, just this login/device | &lt;first name&gt; · Preferences · Notifications · Mail & Calendar |
| **Workspace** | everyone in the org, and the data the schedule runs on | General · Work calendar · People · Import |
| **Features** | optional capabilities, on or off for the workspace | BuildFlow AI · Connections · Public schedules |
| **Admin** | governance and money | Teams · Security · Billing |

Three reasons not to re-cut it, in descending strength:

1. **It is already correct on its own axis.** Every one of the 37 static rows and 5 live panels obeys
   the scope axis of its group, with exactly one exception (2c.1). A regroup would buy nothing.
2. **The grouping is content, not chrome.** `tests/settings.test.tsx:146-149` asserts the four group
   names exist as *headings inside the rail*, and lines 152-169 pin all 14 `[rail label, h1, panel h2]`
   triples. The group names are load-bearing information under this brief's "keep all existing
   information" rule, which means the honest move is to render them better (§5.1 puts them on the
   eyebrow), not to renegotiate them.
3. **A 14-item, 4-group rail is the right size for one screen.** 14 items × 38px + 4 headings + the
   account card + the AI button = ~700px, which fits a 100vh rail above 760px of viewport and
   scrolls inside it below that (`overflow-y: auto` at `settings-redesign.css:128`). Nothing needs
   collapsing, so no category needs to be hidden behind a disclosure at desktop width.

### 2c. The two IA defects that are real, and what happens to each

1. **"Workspace defaults" appears twice, in two different groups, meaning two different things.**
   In *Preferences* (Account group) it holds `Schedule alert summaries` and `Default landing page` —
   both per-person, both about what you see on arrival. In *General* (Workspace group) it holds
   `Time zone` and `Production week` — both genuinely org-wide. They also generate the **same slug id**
   (`settings-workspace-defaults`, from `App.tsx:22439-22447`), so the two views ship colliding
   `aria-labelledby` targets. Resolved by renaming the Preferences one (§3, the only heading rename in
   this plan). The General one keeps the name, because on the scope axis it is the one that earns it.
2. **Two people-shaped categories in two groups, with contradictory vocabulary.** `People` (Workspace)
   is the live roster on `Project Manager / Superintendent / Crew Lead` (`TEAM_ROLE_OPTIONS`); `Teams`
   (Admin) is three placeholders whose `Default role` select offers `Member / Admin / Visitor`.
   **`Teams` does not move.** Moving a placeholder category next to the live roster would imply the
   placeholders work, which is the opposite of what §2d is for. The vocabulary clash is a content bug,
   logged as **§9.6 NEEDS APPROVAL**.

### 2d. The second dimension: commitment tier (a visual axis, not a regroup)

The measured fact that matters most for this area's UX is not which group a category is in. It is
that **5 of 14 categories are wired to an API and 9 are not**:

| Tier | Categories | What persists |
|---|---|---|
| **Live** (5) | &lt;first name&gt;, General, Work calendar, People, Billing | real writes: `PATCH /api/auth/account`, `PATCH /api/org`, `POST /api/business-profile`, `PUT /api/schedule/work-calendar`, the five `/api/team*` calls, `POST /api/billing/{checkout,portal}` |
| **Session** (9) | Preferences, Notifications, Mail & Calendar, Import, BuildFlow AI, Connections, Public schedules, Teams, Security | nothing. 14 toggles live in `SettingsPage` state and die when Settings closes; 15 selects are uncontrolled and reset on **every category switch** (`.settings-panel-inner` is keyed at `App.tsx:22905`); 8 buttons have no handler |

The redesign's rule for this, stated as a prohibition so it is enforceable and needs no new copy:

> **No affordance introduced by the new stylesheet may imply persistence on a Session-tier row.**
> No saved chips, no success ticks, no green, no "Saved" microcopy, no dirty/clean indicator, no
> optimistic checkmark. Session rows get the neutral control species and nothing else.

Deliberately **rejected**: marking the Session tier in the rail (a dot, a "preview" tag, dimming).
That would be *new information* about the product's state, it would read as "broken", and it is not a
presentation change. The two honest fixes — wire them up, or label them — are **§9.5 NEEDS APPROVAL**.

### 2e. Every screen's home (nothing moves, nothing becomes unreachable)

| # | Inventory screen | Home after the redesign | Doors into it |
|---|---|---|---|
| 1 | Settings shell | `page === "settings"`, two-pane, now inside the shell top bar (§4) | top-bar gear (`App.tsx:21143-21154`), rail gear (`App.tsx:20613-20620`), account-menu `Settings` item (`App.tsx:21179-21197`) — all three kept |
| 2 | Account → &lt;first name&gt; | Account group, item 1 | rail |
| 3 | Account → Preferences | Account group, item 2 — **still the default view** (`initialView ?? "preferences"`) | rail, and every door in row 1 |
| 4 | Account → Notifications | Account group, item 3 | rail |
| 5 | Account → Mail & Calendar | Account group, item 4 | rail |
| 6 | Workspace → General | Workspace group, item 1 | rail; also the Billing error "Pick your trade under General first" points here |
| 7 | Workspace → Work calendar | Workspace group, item 2 | rail |
| 8 | Workspace → People | Workspace group, item 3 | rail |
| 9 | Workspace → Import | Workspace group, item 4 | rail |
| 10 | Features → BuildFlow AI | Features group, item 1 | rail item **and** the rail's bottom spotlight button (both kept, both `aria-current`) |
| 11 | Features → Connections | Features group, item 2 | rail |
| 12 | Features → Public schedules | Features group, item 3 | rail |
| 13 | Admin → Teams | Admin group, item 1 | rail |
| 14 | Admin → Security | Admin group, item 2 | rail |
| 15 | Admin → Billing (status panel) | Admin group, item 3 — first block in the view | rail; `openSettingsView("billing")` from the Dashboard's "choose a plan" (`App.tsx:2848`); the Stripe return `?from=settings` (`App.tsx:2381-2384`) |
| 16 | Billing → "Plans that grow with you" | second block of the `billing` view, under the status panel, unchanged order | same as 15 |
| 17 | Billing → Add-ons | third block of the `billing` view, `id="settings-addons"` kept | same as 15, plus `openSettingsBilling(productId)` from the add-on prompt (`App.tsx:2717-2722`), which still scrolls the matching card into view and pulses it |

---

## 3. Every heading, old text → new text

Renames are the exception, not the rule. **One** heading changes text (3.1). Everything else in this
table is listed to prove it is unchanged, because 14 `h1`s, 14 `h2`s and 4 group headings are pinned
by `tests/settings.test.tsx`.

### 3a. The one rename

| Where | Old text | New text | Why |
|---|---|---|---|
| Preferences, 4th section | `Workspace defaults` | **`Opening BuildFlow`** | §2c.1: the name belongs to General's org-wide section, and both rows here (`Schedule alert summaries`, `Default landing page`) are about what you see when you arrive. Also removes the colliding `settings-workspace-defaults` slug id. **No row title, no row description and no option value changes.** |

### 3b. Pinned by a test — unchanged, verbatim

| View | Rail label | `h1` | `h2` asserted by the test |
|---|---|---|---|
| profile | &lt;first name&gt; (`Liam`) | &lt;first name&gt; | `Name and email` |
| preferences | `Preferences` | `Preferences` | `Appearance` |
| notifications | `Notifications` | `Notifications` | `Alerts` |
| mailCalendar | `Mail & Calendar` | `Mail & Calendar` | `Calendar` |
| general | `General` | `General` | `Company and trade` |
| workCalendar | `Work calendar` | `Work calendar` | `Working week` |
| people | `People` | `People` | `Team` |
| import | `Import` | `Import` | `Import tools` |
| buildflowAi | `BuildFlow AI` | `BuildFlow AI` | `AI assistance` |
| connections | `Connections` | `Connections` | `Connected apps` |
| publicSchedules | `Public schedules` | `Public schedules` | `Sharing` |
| teams | `Teams` | `Teams` | `Team setup` |
| security | `Security` | `Security` | `Protection` |
| billing | `Billing` | `Billing` | `<Plan> plan` + status pill |

Rail group headings, unchanged: `Account`, `Workspace`, `Features`, `Admin`.

### 3c. Not pinned, and still unchanged

`Input options`, `Language & time` (Preferences) · `Workspace defaults` (General) · `Holidays`
(Work calendar) · `Members (n)`, `Pending invites (n)`, `Invite people` (People) · `Access defaults`
(People) · `Team setup` (Teams) · `Plans that grow with you`, `Add-ons` (Billing) · the four eyebrows
`Account settings` / `Workspace settings` / `Feature settings` / `Admin settings` · the five panel
kickers `Your login` / `Workspace` / `People` / `Plan & billing`.

Heading **levels** are frozen too (`h1` page title; `h2` section and feature-panel heads; `h3`
`Members (n)` / `Pending invites (n)` / `Invite people`; `h3` `Add-ons`), because three of the test's
queries pass `level` and the rest would become ambiguous if a level moved.

> **Uppercase is not a rename.** Five roles move to `text-transform: uppercase` (§5.1). CSS
> `text-transform` does not enter the accessible-name computation and jsdom applies no CSS at all, so
> `Members (2)`, `Plan & billing` and the rest keep their exact strings in the DOM and in every query.

---

## 4. Chrome: Settings rejoins the shell — top bar yes, icon rail no

### 4a. What is true today

While `page === "settings"`, `App.tsx:2809` and `App.tsx:2828` render **neither** the `TopBar` **nor**
the `Sidebar`, and both shell grids collapse to one column (`styles.css:7534`,
`app-shell-hubspot.css:44-46`). Settings is the only in-app surface with no chrome at all: no global
search, no notifications, no Create, no account menu, no page rail, no brand-home. `⌘K` still works
(the listener at `App.tsx:2596-2606` is unconditional and `CommandPalette` is rendered *outside* the
guard at `App.tsx:2807`), so the palette is the only keyboard exit — and `paletteCommands()` contains
no `Settings` command, so the palette can leave Settings but never enter it.

### 4b. The decision

**Render the `TopBar` on Settings. Do not render the `Sidebar`.** One-line change: delete
`page !== "settings" && ` from the TopBar guard at `App.tsx:2809`; leave the Sidebar guard at
`App.tsx:2828` exactly as it is.

Four things this buys, none of which needs new copy or a new component:

1. **It supplies the missing email-confirm action.** Settings surfaces the unverified-email blocker
   **twice** — `"<email> is not confirmed yet."` in the profile panel and `"Invites go out once you
   confirm your own email. New ones are held until then."` plus a disabled `Resend` on every held
   invite in People — and offers no way to fix it. The only resend control in the product is
   `VerifyEmailBadge` (`App.tsx:7664-7687`, `aria-label="Confirm <email>: resend the confirmation
   email"`), and it is mounted at `App.tsx:21082` **inside the TopBar**. Rendering the top bar makes
   the fix for both blockers visible on the same screen as the blockers. This is the strongest single
   argument in this section and it costs one line.
2. **It fixes "no exit once scrolled."** The close X is `position: absolute` (`settings-redesign.css:307`)
   and the sticky rail has no back control, so on the long Billing view the only exit scrolls away. A
   sticky top bar is an exit at every scroll offset. §5.7 additionally makes the X itself sticky.
3. **It removes the only chrome-less page**, which is the within-product seam DESIGN_TOKENS' "one
   ground, one nav" thesis exists to prevent — and the seam the judges penalised in another concept.
4. **It re-uses a surface that is already being re-skinned** by the shell phase (concept-preserve
   §5a), so Settings inherits the paper top bar for free.

Why the **icon rail stays out** — three couplings, all verified, any one of which is enough:

1. **A new reachable dead end.** The rail's flyouts contain locked add-on rows; clicking one opens
   `AddOnPrompt`, whose "Purchase in Billing" calls `openSettingsBilling(productId)` →
   `openSettingsPage()`. `SettingsPage` is already mounted, and `activeSettingsView` is
   `useState(initialView ?? "preferences")` (`App.tsx:22377`) — a *prop* change does not move a
   `useState` initialiser. So from inside Settings that button would set the deep-link state and
   change nothing on screen. Fixing it needs an effect that syncs `activeSettingsView` to
   `initialView`, i.e. a state-management change the brief forbids (it is logged as **§9.3**).
2. **The gear would clobber the return page.** `openSettingsPage()` (`App.tsx:2706-2709`) sets
   `settingsReturnPage` to `dashboard` when `page === "settings"`. With the rail rendered, its gear
   (`App.tsx:20613-20620`) is clickable *on* Settings, so one stray click silently rewrites where
   "Close settings" goes — the behaviour `tests/settings.test.tsx:88-108` asserts (close returns to
   the Schedule landing, not the dashboard).
3. **It is not a CSS-only change.** Both shell grids explicitly collapse for `settings-shell`, so the
   rail column would have to be restored in `app-shell-hubspot.css` and `styles.css` — and Settings
   would then carry 56 + 276 = **332px** of chrome, on a page whose own rail already collapses at
   900px.

Rendering the rail is therefore proposed separately as **§9.4 NEEDS APPROVAL**, bundled with its own
fix for (1) and (2). Until then, one consequence is declared and *not* fixed: the add-on notice
`"<program> is now part of your workspace — find it in the left rail."` still names a rail that is
not on screen. Rewording it is copy (**§9.7**).

### 4c. What that means for the two `aria-current="page"` controls (`tests/settings.test.tsx:179`)

The assertion is:

```ts
expect(within(rail).getAllByRole("button", { current: "page" })).toHaveLength(label === "BuildFlow AI" ? 2 : 1);
```

with `rail = await screen.findByLabelText("Settings categories")` — the `<aside>` at `App.tsx:22858`.

**It is scoped to that `<aside>`.** So:

- Adding chrome **outside** the aside cannot change the count. The top bar contributes no
  `aria-current` at all; even the rail gear, if §9.4 ever lands, carries only `className="… active"`
  and no `aria-current` (`App.tsx:20613-20620`) — verified, not assumed.
- The count is therefore a contract on **exactly 15 controls in exactly one DOM copy**: the 14
  `.settings-nav-item` buttons and the one `.settings-ai-button`. Exactly one is current, except on
  `buildflowAi` where the nav item and the spotlight are both current — which is the whole point of
  the `? 2 : 1`.

Five things this plan is therefore **forbidden** to do, written into the stylesheet header (§10.3):

| Forbidden | Why it would break line 179 |
|---|---|
| A second copy of the nav list for narrow widths (a drawer, a sheet, a duplicate strip) | jsdom applies no CSS, so both copies are in the accessible tree: the count doubles to 2 (or 4 on `buildflowAi`), and `App.test.tsx:648`'s `getByRole("button", { name: "Preferences" })` becomes ambiguous |
| Giving the narrow-layout disclosure button `aria-current` | 2 (or 3) |
| Marking a group as current when a child is | +1 per active group |
| Dropping the AI spotlight, or its `aria-current` | `buildflowAi` yields 1, not 2 |
| Adding `aria-current` to the close button, or to a "you are here" breadcrumb | +1 on every view |

The narrow layout in §7 is built to that constraint: **one aside, one list, re-flowed by CSS**, and the
one new control it adds carries `aria-expanded` — never `aria-current` — and a fixed `aria-label`
(`"Change settings category"`) so its accessible name can never collide with a category label.

And the accent budget is honoured *without* touching the count: on `buildflowAi` two controls are
`aria-current` but only **one is blue** — the nav item keeps the `#2f6bff` fill, while the spotlight's
current state is ink on `--wx-bg-2` with the licensed trio gradient on its Sparkles glyph (§5.5).
Today both are blue, which is the unenforced-budget flaw the judges called out; here it is enforced.

### 4d. The offsets the top bar costs — all four sites

The top bar is `position: sticky; top: 0; height: var(--hs-topbar-h)` (56px, frozen). Four rules
currently assume Settings owns the full viewport. All four are re-based **from the new stylesheet**,
which loads last, so no existing file is edited:

| Site | Today | New |
|---|---|---|
| `settings-redesign.css:43` `.settings-rx` | `min-height: 100vh` | `min-height: calc(100vh - var(--hs-topbar-h))` |
| `settings-redesign.css:115` `.settings-rx .settings-page` | `min-height: 100vh` | `min-height: calc(100vh - var(--hs-topbar-h))` |
| `settings-redesign.css:123,127` `.settings-rx .settings-rail` | `top: 0; height: 100vh` | `top: var(--hs-topbar-h); height: calc(100vh - var(--hs-topbar-h))` |
| `styles.css:12684` `.settings-content-scroll` | `min-height: 100vh` | `min-height: calc(100vh - var(--hs-topbar-h))` |

Two further `100vh` sites in the area are the **legacy pre-reskin** block (`styles.css:12692`
`.settings-page`, `styles.css:12703` `.settings-rail`). They are already beaten on specificity by
`.settings-rx` and are left alone — but they are why removing the `.settings-rx` wrapper would
resurrect the navy design, and they are on the grep list in §11.4.

Also re-based while in the file: `styles.css:12678-12681` `.settings-main-panel { background: #f4f7fb }`
— a navy-era ground painted *behind* `.settings-rx`'s `#f5f6fa`. Three units apart, invisible, and
dead weight: it goes `transparent` so there is one ground and one painter.

### 4e. Newly reachable pre-existing bugs (declared, not introduced)

Rendering the top bar puts three existing exits on Settings that were previously palette-only. Each
routes through `openAppPage()`, which — unlike `closeSettingsPage()` (`App.tsx:2724-2728`) — does not
clear `settingsInitialView` / `settingsFocusAddOn`. So leaving Settings by the brand-home button, a
search result, or the help button (which starts the tutorial, whose first step navigates away via
`App.tsx:21260-21263`) leaves the deep-link state set, and the **next** gear click reopens Settings on
Billing with an add-on card pulsing instead of on Preferences.

This is the recorded STALE DEEP LINK bug and `⌘K` already triggers it today; the top bar adds doors,
not the bug. The one-line fix is **§9.2 NEEDS APPROVAL**. The plan ships correctly without it.

---

## 5. The surface system

### 5.1 The eyebrow, grafted verbatim — five roles, one rule

`11.5px / 650 / letter-spacing 0.045em / uppercase / #8a877e`, at ×1, no rescale. Settings has five
eyebrow-shaped roles; four of them are wrong today in different ways, and one is already right:

| Role | Today | New |
|---|---|---|
| Rail group heading (`.settings-nav-group h2`, `settings-redesign.css:200-209`) | `11px / 700 / 0.06em` uppercase `--wx-faint` — **already the eyebrow**, to within 0.5px | `11.5 / 650 / 0.045em`. The one place the app already renders the Welcome Page's eyebrow; the nudge is cosmetic and it is the proof the rule fits |
| Page-header eyebrow (`.sx-eyebrow`, `:374-389`) | a **bordered pill** on `rgba(255,255,255,0.7)`, `12px / 600 / 0.01em`, `text-transform: none`, with a gradient dot | the eyebrow: no border, no fill, no pill. `11.5 / 650 / 0.045em` uppercase `#8a877e`. The `.sx-dot` survives as a flat 6px `#2f6bff` disc (§5.5). Kills one resting boundary and one gradient |
| Feature-panel kicker (`.settings-team-kicker`, `:833-842`) | `11.5 / 700 / 0.04em` uppercase, **violet** `--cc-violet` | same geometry, colour → `#8a877e`. The violet is the second accent the budget forbids. Icon (18px lucide) → `#8a877e`, 16px |
| List heads `Members (n)` / `Pending invites (n)` / `Invite people` (`h3`, `:823-831`) | ~13px body-weight headings | the eyebrow. These are the same role as a table's `thead th`: a repeated structural label above a list, which is exactly why the graft buys so much here |
| Micro labels (`.settings-workspace-line span`, `.settings-members-heading span`, `.settings-invite-fields label span`, `:870-878`) | `11px / 700 / 0.05em` uppercase `--wx-faint` | `11px / 700 / 0.06em` — kept as the **micro** rung (badges and field labels), one step below the eyebrow, so the two roles stay distinguishable |

**Frozen next to it:** the row title stays `14px / 650` (`settings-redesign.css:480-486`) and the row
helper stays `13px / 500 / 1.5`. Both are the most-repeated text in the area after the eyebrow, both
are already on the ladder, and moving either would move 37 rows for nothing.

### 5.2 The card licence, applied and counted

The grafted licence: *a white bordered rectangle is licensed only if (1) its boundary is itself
interactive (draggable, resizable, dismissible), or (2) it is a viewport clipping a scrolling world.*

Applied strictly, **Settings would have zero cards** — nothing here is draggable and nothing clips a
scrolling world. That is nearly the right answer, and the Welcome Page says why: *"sections are
transparent and let it through"* — the marketing page groups with **a heading and air**, never with a
box. So the section card does not need a licence; it needs to be dissolved into the source's own move.

One declared amendment, because Settings has a case the licence does not cover:

> **Clause 3 (declared amendment, this area only).** A frame is licensed when it is one of a set of
> **peer alternatives the reader is choosing between**, because the frame is what makes the set
> countable. That covers the 2 plan cards and the 4 add-on cards, and nothing else in the area. It is
> the Welcome Page's own pricing-card treatment at 0.7 scale, and it is the reason those six surfaces
> keep paper, a hairline, `--bf-shadow-card` and the lift — while every other surface loses all four.

The counted audit, on the two busiest views:

| View | Resting boundaries today | After | Named as meaningless |
|---|---|---|---|
| **Billing** | **14** — status-panel card, owner-summary pill, status pill, kicker, plans block, `.sx-seg` segmented control, 2 plan cards, the in-card billing-period control, 4 add-on cards, header eyebrow pill, header icon square (+ 2 select boxes, counted as form controls) | **8** — 2 plan cards, 4 add-on cards, `.sx-seg`, the billing-period control | status-panel card frame, owner-summary pill border, kicker, plans-block edge, eyebrow pill, icon square |
| **Preferences** | **6** — 4 section cards, eyebrow pill, icon square | **0** (plus 4 selects and 4 toggles, which are controls, not frames) | all six |

Across the 14 views that is **19 panel frames removed** — 15 `.settings-section` cards (Preferences 4;
Notifications, Mail & Calendar, General, Work calendar, People, Import, BuildFlow AI, Connections,
Public schedules, Teams, Security 1 each) plus the 4 `.settings-team-section` panels (profile,
General, People, Billing) — **and 28 header frames** (an eyebrow pill and an icon square on every one
of the 14 views). **Six card frames are kept**, all of them peer alternatives. The rule a reader can
see: **paper means "pick one of these"; everything else is a band on the ground.**

What replaces the dissolved section card, exactly:

```
.settings-section  →  a band:  no background, no border, no radius, no shadow, no hover lift
                      h2       16px / 600 / -0.01em / #1c1c1a, margin 0 0 12px
                      rows     unchanged geometry (min-height 72px, 28px gap, border-top hairline)
                      between bands  gap: var(--bf-rhythm-dense)   /* 20–34px, was a flat 22px */
```

The row's `border-top: 1px solid rgba(28,28,26,0.07)` is what carries the grouping visually now, and
it is already there (`settings-redesign.css:469`). The first row of a band drops its top hairline so
the `h2` owns the edge.

Two consequences, both wanted:

- **Static surfaces never lift.** `.settings-section:hover { translateY(-3px) }` goes away. Mixing a
  lift onto a non-interactive surface is the incoherence the four-move grammar exists to prevent, and
  it is also why the `sx-rise` `fill-mode: backwards` constraint (recorded risk: "switching to
  `both`/`forwards` would clobber the card hover lift") stops mattering — it is kept anyway, because
  it is still correct for the plan and add-on cards.
- **The row hover survives**: `.settings-row:hover { background: var(--wx-bg) }` becomes
  `rgba(28,28,26,0.035)` over `0.18s var(--bf-ease)` — the same wash the shell phase gives table rows.

### 5.3 The rail: paper, opaque, and the hairline decision

```css
.settings-rx.bf-settings .settings-rail {
  top: var(--hs-topbar-h);
  height: calc(100vh - var(--hs-topbar-h));
  background: #ffffff;                              /* was color-mix(--wx-card 78%, transparent) */
  backdrop-filter: none;                            /* was blur(10px) */
  border-right: 1px solid rgba(28, 28, 26, 0.07);
}
```

Three reasons, in order:

1. **The backdrop-filter licence.** The graft is explicit: `backdrop-filter` is licensed in-app on the
   **top bar only**; sticky sub-navs use an opaque fill. The Settings rail is a sticky sub-nav. It is
   also (per the inventory's own note) a compositing context sitting over three `blur(50px)` aurora
   blobs — the exact paint-perf hotspot this repo has already tuned down once.
2. **Legibility.** Today the auroras bleed *under* the 14 nav labels at 78% opacity. Opaque paper
   stops that; the auroras still show through the panel column, which is where they belong.
3. **The state anchor.** The judges' shared criticism of all four concepts is that a light chrome on a
   light ground deletes the "I am inside the workspace" anchor and leaves one hairline to carry it.
   Here the rail↔panel edge carries **two** signals: a value step (`#ffffff` vs `#f5f6fa`, ~4% luminance)
   **and** the hairline. It does not depend on the hairline alone. That is the decision, and §13 makes
   it a check on an uncalibrated monitor rather than an assertion.

Rail internals: nav row radius `11px → 12px`; rest `#575550` with an `#8a877e` glyph; hover
`rgba(28,28,26,0.05)` + `translateX(var(--bf-slide))` (2px → 3px, the menu-row nudge); focus-visible
gets `var(--bf-focus-ring)` in place of the `3px/0.16` ring; `.active` keeps
`background: var(--cc-blue-soft)` + `#2f6bff` — the rail's **one** accent element. Row min-height
`38px` on desktop, `44px` at ≤900px (touch).

### 5.4 Type: the serif dies

`.sx-plans-title` (`settings-redesign.css:1144-1152`) goes from `Georgia, "Times New Roman", serif` at
`30px/600` to `var(--bf-font-sans)` at `var(--bf-app-title)` = `clamp(22px, 1.9vw, 26px)` / `600` /
`-0.01em`, still centred. This is the only rendering serif in the app (0.3) and DESIGN_TOKENS allows
exactly one family. The string `Plans that grow with you` is unchanged.

The rest of the type map is §1b. Two freezes worth restating because they are calibrated against
other numbers: the row title (`14px/650`) and the page-header lede (`14.5px`).

### 5.5 Gradients: one lives, three die, plus a leftover

DESIGN_TOKENS: the trio is *"spent on exactly three things"* on the marketing page, and the graft
licenses **one** in-app use — the AI. Naming the ones that die, as the judges required:

| Gradient | Today | Fate |
|---|---|---|
| `.sx-header-icon` 46px square | `linear-gradient(135deg, --wx-g-blue, --wx-g-purple)` + `0 12px 26px rgba(66,92,244,0.32)` on **every** view | **Dies on 13 views.** Becomes a flat 32px glyph in `#8a877e` with no fill, no shadow, no box — the frame is one of the boundaries §5.2 removes. **Survives on `buildflowAi` only**, where the glyph *is* the AI: full trio at `linear-gradient(96deg, #4285f4 0%, #9b72cb 54%, #d96570 100%)`, radius 12px. Selected by a new `data-view` attribute (§10.2) |
| `.sx-dot` (`:390-395`) | `linear-gradient(135deg, g-blue, g-purple)` on an 8px disc | **Dies** — the graft names this one explicitly. Flat 6px `#2f6bff` disc |
| `.settings-ai-button svg` | flat `--cc-violet` `#6d28d9` | **becomes the trio** (the second licensed AI use), which is also how the accent budget is met on `buildflowAi` (§4c) |
| `.hs-progress` track, `.primary-button` (shell-wide) | gradient | die in the shell phase; named here because the Work calendar's Save is a `.primary-button` and the Billing/People submits are `.acct-primary` |
| `--shadow-accent: rgba(251,133,0, …)` | a leftover **orange** from the pre-blue era | die with the shell phase; grep-checked in §11.4 so it does not survive in this area |

Net: the trio appears in Settings on **one view, on two glyphs**. Everywhere else the accent is flat
`#2f6bff` and there is at most one of it per region.

### 5.6 Colour: two parallel semantic palettes, unified without editing the shared file

The area runs two sets of semantics with different values, because half of its rules live in
`settings-redesign.css` (`--cc-*` tokens) and half in `account-redesign.css` (raw literals), and
`account-redesign.css` loads **later** (`main.tsx:36` vs `:29`) so its literals win:

| Semantic | `settings-redesign.css` | `account-redesign.css` | New (single value) |
|---|---|---|---|
| accent | `--cc-blue #2f6bff`, soft `#e8f0fe` | `#1f4fc2` on `rgba(47,107,255,0.12)` (`.settings-me-tag`) | `#2f6bff` on `rgba(47,107,255,0.10)` |
| warning | `--cc-amber #b45309`, soft `#fdf0dc` | `#a8721b` on `rgba(224,162,60,0.16)` (`.settings-sample-tag`, `trial` pill) | `#b45309` on `#fdf0dc` |
| danger | `--cc-red #c5221f`, soft `#fbe4e2` | `#b4404b` on `rgba(217,101,112,0.16)` (`trial_expired` pill, `.is-billing`) | `#c5221f` on `#fbe4e2` |
| success | `--cc-green #188038`, soft `#e2f1e6` | `#1f8a58` on `rgba(47,158,107,0.14)` (`active` pill) | `#188038` on `#e2f1e6` |
| neutral | — | `#f0f1f4` / `#47505f` (`.settings-role-pill`, default status pill); `#eef1f6` / `#6f7785` (pending avatar) | `--wx-bg-2 #eaedf3` / `--wx-mut #575550` |

`account-redesign.css` is **not edited** — it is shared with the login and onboarding flow, and the
inventory's own warning is that restyling Settings must not break onboarding. Every value above is
re-declared in the new stylesheet at higher specificity (`.settings-rx.bf-settings …`), which loads
last, so the onboarding funnel keeps every byte of its current styling.

**Which state is which colour does not change.** The four `data-status` variants of
`.settings-status-pill` stay four, mapped exactly as today (grey `free`/`enterprise`, amber `trial`,
red `trial_expired`, green `active`); they just land on the app's one amber, one red, one green. The
pill's type goes `12px/700/0.02em` → `11.5px/700/0.045em` uppercase, which puts it on the eyebrow's
tracking without changing its string (`toHaveTextContent("Trial · 14 days left")` reads `textContent`).

Two colour changes that are visible and therefore declared:

1. `.settings-owner-summary` / `.settings-owner-badge` (`:843-856`): a **blue** pill (`--cc-blue-soft`
   fill, `rgba(47,107,255,0.24)` border, `#2f6bff` text) → neutral (`--wx-bg-2` fill,
   `rgba(28,28,26,0.07)` border, `#575550` text). It is a *summary* (`5 seats · $100/mo`,
   `1 with logins · 1 sample`), not an action, and the accent budget gives the card's one blue to its
   CTA. Both strings are unchanged, so `getByText("5 seats · $100/mo")` and
   `getByText("1 with logins · 1 sample")` are unaffected.
2. `.settings-team-kicker`'s violet → `#8a877e` (§5.1).

### 5.7 Controls, buttons, and the disabled affordance

| Control | Today | New |
|---|---|---|
| `select` (15 of them; `:496-531`) | `min-height 42px`, radius **11px**, `min-width 188px`, `padding 0 38px 0 13px` for the native chevron, focus `--cc-blue` + `3px rgba(47,107,255,.16)` | radius **12px** (the ladder), geometry and the native chevron **unchanged**, focus → `var(--bf-focus-ring)`. `color-scheme: light` on `.settings-rx` (`:52`) is **kept** — deleting it gives dark OS dropdowns |
| `SettingsToggle` (14; `App.tsx:22930`) | 48×28 pill, `0.2s ease` to `--cc-blue`, 20px knob `translateX(20px)` on `0.22,1,0.36,1`, focus `3px rgba(47,107,255,.18)` | same geometry (it is already a pill, already on the curve), durations → `--bf-dur-press`/`--bf-dur-hover`, focus → `var(--bf-focus-ring)`. The knob keeps its curve |
| `.acct-primary` (Save, Save name, Apply trade, Send invites, Update plan, checkout, portal) | blue fill | blue pill `999px`, `13px/600`, `--bf-shadow-raised` tinted, hover `#1f57e0` + `--bf-shadow-pill` tinted. Blue stays the in-app primary (concept-preserve's declared deviation) |
| `.outline-button` (Add holiday, 3 × Add year, Discard changes) | outlined | pill that **inverts** to `#1c1c1a`/`#fdfcf9` on hover — hover move #2 |
| `.acct-link-btn` (Resend, Switch to Free instead) | plain link | `13px/600` `#2f6bff`, icon/label slides `var(--bf-slide)` on hover — move #3 |
| `.settings-action-button` (the 8 dead ones) | hover lift + blue border + blue shadow | **neutral outline pill, no lift, no blue.** §2d's prohibition: a placeholder must not out-signal a live control. Geometry and labels (`Manage`, `Upload`, `Import`, `Add file`, `Connect`, `Configure`, `Open`, `View log`) unchanged |
| `.settings-close-button` (`:307-335`) | `position: absolute; top 24 right 28`, 42×42, radius 12, hover `translateY(-1px) rotate(90deg)` | **sticky** (§7.3), same 42×42, radius 12, same hover, `aria-label="Close settings"` unchanged |
| `.wc-day` weekday chips (7) | 999px border pill with a **native visible checkbox** inside, no transition, no `:focus-visible` | keeps the native checkbox in the DOM (it is the control), gains `transition: … var(--bf-dur-press) var(--bf-ease)` and a `:focus-visible { box-shadow: var(--bf-focus-ring) }` on the `label`, and `is-on` moves off the `#e8f0fe`/`#1a3f9e` literals onto `rgba(47,107,255,0.10)`/`#2f6bff` |

**The disabled affordance is a trap and it is handled explicitly.** Nothing in
`settings-redesign.css` styles `:disabled`; all ~12 disabled states in the area
(`Apply trade`, `Save name`, `Save`, `Send invites`, `Resend`, `Update plan`, `Add holiday`,
`Discard changes`, `Save work calendar`, 3 × `Add <year> holidays`) rely on the global
`button:disabled { cursor: not-allowed; opacity: .62 }` at `styles.css:49-52` plus
`.acct-primary:disabled` (`account-redesign.css:267`). The new stylesheet therefore **re-declares
`:disabled` for every button species it restyles**, at the same `.62` opacity and
`cursor: not-allowed`, and adds `box-shadow: none; transform: none` so a disabled pill cannot lift.
Without this, twelve disabled controls would look enabled — the single most likely regression in this
file.

### 5.8 A11Y-1: rows get an accessible description (in scope, no name changes)

`renderSettingsSections` (`App.tsx:22439-22459`) emits `<div class="settings-row"><div><strong>title</strong><p>desc</p></div>{control}</div>`.
The `<strong>` is not a `<label>`, there is no `id`/`htmlFor` and no `aria-describedby`, so all 15
selects and 14 toggles are named only by their duplicated `aria-label` and **the helper line is
announced to nobody**.

Fix, three lines, presentation/a11y only:

```tsx
const descId = `${sectionId}-${slug(row.title)}-desc`;
<p id={descId}>{row.description}</p>
{isValidElement(row.control) ? cloneElement(row.control, { "aria-describedby": descId }) : row.control}
```

plus one prop forwarded on `SettingsToggle` (`App.tsx:22930`), which today accepts
`{ checked, label, onChange }` only and would silently drop the attribute.

**Why this cannot break a test:** `aria-label` wins over `<label>`/content in the accessible-name
computation, and `aria-describedby` contributes to the *description*, never the name. All 29
label-based queries (`getByLabelText("Theme")`, `getByLabelText("Role for Sam Ortiz")`, …) resolve
exactly as they do today.

### 5.9 Dead CSS in the area (do not re-skin it)

16 classes in `settings-redesign.css` render nothing: `.settings-profile-section`,
`.settings-avatar-edit`, `.settings-avatar-preview`, `.settings-avatar-actions`,
`.settings-avatar-buttons`, `.settings-avatar-file`, `.settings-bio-field`, `.settings-bio-label`,
`.settings-bio-count`, `.settings-profile-role`, `.settings-role-readonly`,
`.settings-primary-action`, `.settings-workspace-line`, `.settings-invite-fields`,
`.settings-invite-status`, plus the `@container` rule fed by `.settings-invite-form`'s live
`container-type` (the invite form actually lays out on `.acct-invite-row` from
`account-redesign.css:1651`). `.settings-avatar-img` **is** reachable — through the always-null
`profileImage` state (`App.tsx:22380`, `useState<string | null>(null)`) — and stays.

The new stylesheet writes **no** rule for any of the 16. Deleting their ~180 lines from
`settings-redesign.css` is optional cleanup, scheduled last in §10.4 so a regression is attributable.

### 5.10 Components: nothing new, and why

The repo has no Tailwind, no shadcn, no `cn()` and no `@/` alias; the nine ported components in
`client/src/components/ui/` follow one recipe (read `display-cards.tsx` and
`interactive-hover-links.tsx`): one file, plain markup, inline `style` objects for anything that can
be inline, **one** inline `<style>` string for the parts that cannot (`::before`, `:hover`, `@media`),
shadcn tokens mapped onto `--wx-*` with literal fallbacks (`var(--wx-blue, #2f6bff)`), a
`@media (prefers-reduced-motion: reduce)` rule **inside that same block**, and a header comment naming
the source and the mapping.

**This area needs none of them.** Its controls are already primitives that exist and are tested:
15 native `<select>`s, one `SettingsToggle` primitive used 14 times (`App.tsx:22930`), text / email /
date / number inputs on `.acct-input`, `InviteRows` (`App.tsx:7692`), `VerifyEmailBadge`
(`App.tsx:7664`, arriving via the top bar), `useModalDialog` (`App.tsx:22979`) and the `.pdx` confirm
dialog (`App.tsx:28207-28270`). The only new markup in the whole plan is two wrappers
(`.sx-close-bar`, `.sx-rail-toggle`) and one hook (`useShellBreakpoint`) — none of which is a
component in the `components/ui/` sense, and none of which has an animation, a pseudo-element or a
token mapping to own.

Three ports were considered and rejected:

| Considered | Rejected because |
|---|---|
| An animated tooltip on the 8 handler-less buttons | It would add a hover-only explanation layer to controls whose problem is that they do nothing. §2d's answer is to make them quieter, not to annotate them. A tooltip is also the wrong medium for the fix that is actually wanted (§9.5) |
| A card-spotlight on the plan and add-on cards | The page already has the re-scaled fourth hover move: `.dx-cursor`, a 480px `--mx`/`--my` glow, already tuned for paint (§6.1). A second, per-card spotlight would be two pointer-tracking effects on one screen — the incoherence the four-move grammar exists to prevent |
| A shared segmented-control replacing `.sx-seg` **and** `BillingToggle` | Both are `role="tablist"` with sliding indicators already on the signature curve, and both sit inside the Billing view's asserted region. Replacing their markup to gain nothing visual is exactly the "refactor a load-bearing DOM for a change a stylesheet could deliver" the judges penalised. Their real defect is a11y (§9.17), which is 25 lines *inside* the existing markup |

If a port is ever added to this area, two extra constraints apply on top of the recipe: it must not
use `data-reveal` (§7.1), and its class prefix must not match `/sched-/` or `/gantt-/`
(`schedule/boundary.test.ts`).

---

## 6. Every field, toggle, select, button, card, pill, notice and helper line

Nothing in this section is removed, merged or reworded. The one heading rename is 3.1. "Band" means
the dissolved section card of §5.2. All 37 static rows keep their exact title and description strings
and their exact option value sets.

**Control census, reconciled per view** (the 0.4 correction):

| View | toggles | selects | dead buttons | live controls | rows |
|---|---|---|---|---|---|
| Preferences | 4 | 4 | 0 | 0 | 8 |
| Notifications | 3 | 0 | 0 | 0 | 3 |
| Mail & Calendar | 2 | 1 | 0 | 0 | 3 |
| General (static half) | 0 | 2 | 0 | — | 2 |
| People (static half) | 1 | 1 | 1 (`Manage`) | — | 3 |
| Import | 0 | 0 | 3 (`Upload`, `Import`, `Add file`) | 0 | 3 |
| BuildFlow AI | 1 | 2 | 0 | 0 | 3 |
| Connections | 1 | 0 | 2 (`Connect`, `Configure`) | 0 | 3 |
| Public schedules | 1 | 2 | 0 | 0 | 3 |
| Teams | 0 | 2 | 1 (`Open`) | 0 | 3 |
| Security | 1 | 1 | 1 (`View log`) | 0 | 3 |
| **Total** | **14** | **15** | **8** | | **37** |

### 6.1 Shell (screen 1)

| Item | Change |
|---|---|
| Rail account card: avatar glyph (`data.activeUser.avatar`, `?` fallback) or `<img class="settings-avatar-img">` | avatar → 40px, `50%`, `#2f6bff` fill / `#fff` initials (the app's avatar species). `<img>` path kept |
| Rail account card name — **hard-coded `"Liam Santos"`** (`App.tsx:22864`) | text unchanged (wiring it to `data.activeUser.name` is **§9.1 NEEDS APPROVAL**). Type → `14px/650`; the existing `overflow:hidden`/`ellipsis`/`nowrap` in a `46px | minmax(0,1fr)` grid (`:158-164`) is kept and re-checked against a long real name in §13 |
| Rail account card role — hard-coded `"Project Manager"` (`App.tsx:22865`) | text unchanged; type → micro `11px/700/0.06em` uppercase `#8a877e` |
| 4 rail group headings `Account` / `Workspace` / `Features` / `Admin` | → eyebrow (§5.1) |
| 14 rail nav items, each with its lucide glyph | radius 12px, `translateX(3px)` hover, `--bf-focus-ring`, one accent for the active one (§5.3) |
| Rail bottom spotlight `BuildFlow AI` + Sparkles | active state → ink on `--wx-bg-2`, Sparkles → the trio (§5.5). Radius 12px, `min-height 44px`, hover keeps `translateY(-2px)` |
| 4 panel eyebrow strings (`Account settings`, `Workspace settings`, `Feature settings`, `Admin settings`) | → eyebrow, pill dissolved (§5.1) |
| `.sx-dot` before the eyebrow | flat 6px `#2f6bff` (§5.5) |
| `.sx-header-icon` = the active item's glyph, `Settings` fallback | flat `#8a877e` 32px glyph, no frame; the trio only on `buildflowAi` (§5.5) |
| `h1#settings-title` = the active view title | `var(--bf-app-title-hero)` `clamp(26,3vw,33)`, weight `750 → 700`, `-0.02em`, `1.05` |
| Header `<p>` = the active view description | `14.5px` `#575550`, cap `620px → var(--bf-app-prose)` |
| Per-section `h2` + generated `id` + `aria-labelledby` | `16px/600/-0.01em`; the slug mechanism is untouched (3.1 changes one input to it) |
| Per-row `<strong>` title, `<p>` helper, right-aligned control | title frozen `14px/650`; helper `13px/500/1.5` capped `62ch`; helper gains an `id` + `aria-describedby` (§5.8) |
| Close button `X`, `aria-label="Close settings"` | sticky (§7.3) |
| The 3 `.dx-aurora` blobs + `.dx-cursor` | kept, values untouched (`blur(50px)`, `opacity .55`, 480px glow). This is the re-scaled fourth hover move for this page and it is already tuned; §7.4 adds its missing reduced-motion clause |
| Ask-AI FAB + `BreezeAssistant` suppressed while `page === "settings"` (`App.tsx:2989-2994`) | **kept exactly.** Settings stays a page, not a modal or a drawer, so the suppression stays valid |

### 6.2 Account → &lt;first name&gt; (screen 2) — `AccountSettingsPanel`

Feature panel only, `sections: []`.

| Item | Change |
|---|---|
| Kicker `Your login` + Users glyph | eyebrow, violet → `#8a877e` |
| `h2` `Name and email`, `aria-labelledby="settings-account-title"` | `16px/600` |
| Verification line, 3 states: `<email> is confirmed.` / `<email> is not confirmed yet.` / `Signed in to the demo workspace.` | strings unchanged; `13px/500`; the unconfirmed state's ink → `--cc-amber #b45309`, the confirmed → `--cc-green #188038`, demo → `#575550`. **The action that resolves it is now on screen** via the top bar's `VerifyEmailBadge` (§4b.1) |
| `Your name` — `<input type=text id=settings-account-name class=acct-input autoComplete=name>` | radius 11 → 12, focus ring unified; `.is-invalid` keeps the danger border |
| `Email` — `<input type=email id=settings-account-email autoComplete=email>`, **disabled without `data.account`** | same; `:disabled` re-declared (§5.7) |
| Helper `Changing it sends a confirmation link to the new address.` | `13px/500`, `62ch` |
| `Save` / `Saving…`, disabled while busy or without an account | primary pill |
| Notice `Nothing to save.` | `.acct-success` neutral ink (it is not a success — see §9.8) |
| Notice `Saved.` / `Saved. We sent a confirmation link to <email> — open it to confirm the new address.` | green `#188038`, `62ch` |
| Field error `Enter your name.` | `.acct-field-error`, `12px/600` `#c5221f` |
| Field error `Enter a valid email address.` (`EMAIL_PATTERN`, `App.tsx:6558`) | same |
| Server field errors on `name` / `email` | same channel |
| Panel error `<p class="acct-error" role="alert">` + fallback `Could not save.` | danger band: `#fbe4e2` ground, `#c5221f` ink, radius 12, `62ch` |

### 6.3 Account → Preferences (screen 3) — the default view

4 bands, 8 rows, 4 selects + 4 toggles. Every string unchanged except the 3.1 heading.

| Band | Row title | Helper | Control + values |
|---|---|---|---|
| `Appearance` | `Theme` | `Choose a theme for BuildFlow on this device.` | select `Use system setting` / `Light` / `Dark` |
| `Input options` | `Use Enter to add a new line` | `Applies to notes, field updates, delayIQ comments, and support messages.` | toggle `enterAddsLine`, default **off** |
| `Language & time` | `Language` | `Choose the language you want to use in BuildFlow.` | select `English (US)` / `Spanish` / `French` |
| `Language & time` | `Number format` | `Choose how numbers, currencies, and quantities are formatted.` | select `Default` / `1,234.56` / `1.234,56` |
| `Language & time` | `Always show text direction controls` | `Show direction controls in editors, regardless of the language you are using.` | toggle `showDirectionControls`, default **on** |
| `Language & time` | `Start week on Monday` | `This changes how calendars and schedule boards start each week.` | toggle `startWeekMonday`, default **on** |
| **`Opening BuildFlow`** (was `Workspace defaults`) | `Schedule alert summaries` | `Show compact readiness and delayIQ alerts when opening the production schedule.` | toggle `scheduleAlerts`, default **on** |
| **`Opening BuildFlow`** | `Default landing page` | `Choose where BuildFlow opens after login.` | select `Dashboard` / `Schedule` / `Reports` |

All 8 are Session tier: §2d's prohibition applies, so no row gains a saved/applied indicator.

### 6.4 Account → Notifications (screen 4)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Alerts` | `Desktop digest` | `Bundle lower-priority updates into a single desktop summary.` | toggle `desktopDigest`, default **on** |
| `Alerts` | `Field push alerts` | `Notify you immediately when field updates affect the active schedule.` | toggle `fieldPushAlerts`, default **on** |
| `Alerts` | `Weekly summary` | `Send a Monday overview of schedule health, backlog, and delayIQ recovery.` | toggle `weeklySummary`, default **off** |

### 6.5 Account → Mail & Calendar (screen 5)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Calendar` | `Calendar sync` | `Push scheduled jobs and milestone dates to your connected calendar.` | toggle `calendarSync`, default **on** |
| `Calendar` | `Reminder window` | `Choose when BuildFlow reminds you before critical schedule events.` | select `15 minutes before` / `1 hour before` / `1 day before` |
| `Calendar` | `Email replies` | `Attach email replies to the related project activity stream.` | toggle `emailReplies`, default **off** |

### 6.6 Workspace → General (screen 6) — `WorkspaceSettingsPanel` + 1 band

| Item | Change |
|---|---|
| Kicker `Workspace` + Building2 | eyebrow |
| `h2` `Company and trade`, `aria-labelledby="settings-workspace-title"` | `16px/600` |
| Intro `The name everyone sees, and the trade BuildFlow shapes its phases, checks, categories and AI around.` | `13px/500`, `62ch` |
| `Company name` input, placeholder `Your company` / `Loading…` before the session resolves | radius 12, unified focus. The `Loading…` placeholder state is kept (it is the only signal that `GET /api/auth/me` is in flight) |
| `Trade` select: placeholder `Choose a trade` + **14** options rendered `<Trade> — <tagline>` (Asphalt `Paving, milling and overlays`; Concrete `Foundations, slabs and structure`; Roofing `Tear-off, dry-in and membrane`; General Contractor `Coordinating every trade on site`; Excavation `Mass earthwork, trenching and haul-off`; Utilities `Water, storm, sewer and ductbank`; Framing `Walls, floors, shear and hardware`; Electrical `Rough-in, gear and energize`; Plumbing `Underground, top-out and fixtures`; HVAC `Duct, equipment set and startup`; Masonry `Block, brick, grout and scaffold`; Drywall `Stud, hang, tape and finish`; Landscaping `Grading, irrigation and planting`; Painting `Prep, prime and coats`) | all 15 option strings unchanged; the select's `min-width` rises to `260px` so a `Trade — tagline` line stops truncating at desktop width, and to `100%` at ≤560px |
| Trade hint `Changing it never touches your projects, crews or schedule. It re-tunes the copy, DelayIQ categories, material units and the AI.` | `13px/500`, `62ch` |
| `Save name` / `Saving…`; `Apply trade` / `Applying…` (disabled while busy, on an invalid `BusinessTypeId`, or when it equals `data.businessType`) | primary pills; `:disabled` re-declared |
| Notice `Company name saved.` | green |
| Notice `BuildFlow is now tuned for <trade lower-cased> work. Your projects and crews are untouched.` | green, `62ch` |
| Errors `Enter your company name.` / `Could not save the name.` / `Could not change the trade.` in one `role="alert"` | danger band |
| Band `Workspace defaults` → `Time zone` / `Use the correct time zone for field updates and schedule deadlines.` | select `America/New_York` / `America/Chicago` / `America/Los_Angeles` |
| Band `Workspace defaults` → `Production week` / `Choose the planning cadence used in schedule boards.` | select `Monday - Friday` / `Sunday - Saturday` / `Custom` |

### 6.7 Workspace → Work calendar (screen 7) — `WorkCalendarPanel`

The odd one out: it renders `className="settings-section wc-panel"`, so today it inherits the section
card **including the hover lift** and carries **two** `h2`s under one `aria-labelledby="wc-title"`.

| Item | Change |
|---|---|
| Card frame | dissolves like every other section (§5.2). The lift goes. It becomes two bands in one `<section>`: `Working week` and `Holidays` |
| `h2` `Working week` (`id="wc-title"`) and `h2` `Holidays` | both `16px/600`. `Holidays` is unassociated today; **§9.9 NEEDS APPROVAL** would give it its own `<section aria-labelledby>` (a DOM change) — not done by default |
| 7 weekday chips `Sun … Sat` in `role="group" aria-label="Weekdays crews work"`, `.is-on` for chosen days | §5.7: transition + focus ring added, `#e8f0fe`/`#1a3f9e` literals → `rgba(47,107,255,0.10)`/`#2f6bff`, native checkbox kept in the DOM |
| Hint `Booked days are counted against these; a job's duration on the Gantt Chart and its float are measured in these days.` | `13px/500`, `62ch` |
| Holiday rows: `Wed, Jun 17, 2026` (its own `toLocaleDateString`) · name · remove | grid `200px | minmax(0,1fr) | auto` kept (collapses at 640px, name spanning both — kept); date → `13px/600` `tabular-nums`; name → `13px/500`; row hairline `--wx-line-soft` |
| Remove button `aria-label="Remove <name>"`, hover `#fbe4e2`/`#c5221f` | label unchanged; hover on the unified danger pair; **no confirm** — see §8.3 |
| Empty state `No holidays yet — crews work every working weekday.` | kept, `62ch`. It is unreachable on a fresh workspace (0.5) but reachable after removing all 14 seeded rows |
| `Holiday date` `<input type=date>` + `Holiday name` `<input type=text placeholder="Name (Company picnic)">` | radius 12, unified focus. The name field silently trims and truncates at 80 chars and empties to the literal `Holiday` (`shared/src/index.ts:635-652`); surfacing that is **§9.10** |
| `Add holiday` (`.outline-button` + CalendarPlus, disabled until a date is set) | invert on hover |
| 3 × `Add <year> holidays` for this year, +1, +2 — bulk-adds the 7 `constructionHolidays(year)` (`New Year's Day`, `Memorial Day`, `Juneteenth`, `Independence Day`, `Labor Day`, `Thanksgiving`, `Christmas Day`, on observed dates; the 4 skipped federal days are `Martin Luther King Jr. Day`, `Presidents' Day`, `Columbus Day`, `Veterans Day`), each disabled once its year is complete | labels unchanged. **Two of the three ship disabled** (0.5), so the `:disabled` re-declaration in §5.7 is what keeps them honest; they sit in a row that wraps at ≤560px |
| `Discard changes` (`.outline-button`, disabled unless dirty) | invert on hover |
| `Save work calendar` / `Saving…` (`.primary-button`, disabled unless dirty) | primary pill. When `dirty`, Save takes the band's one accent and Discard drops to a plain outline — the only draft-state signal, and it needs no new copy (§8.3) |
| Status line `.wc-status role="status"`: `Saved. The schedule, the critical path and the KPIs count with this now.` **and** `Could not save: <message>` | strings unchanged. The failure string currently renders in hard-coded **green** (`:1611-1615`) and is announced politely — the only panel in the area with no `role="alert"` channel. Presentation-only half of the fix ships now: `.wc-status` colour is driven by a `data-state` the panel already knows (`status.startsWith("Could not save")` is not a DOM signal, so the CSS split needs a class) → **§9.11 NEEDS APPROVAL** for the 2-line class, and until then the colour goes **neutral `#575550`** rather than lying green |
| The dirty check `JSON.stringify(draft) !== JSON.stringify(saved)` | untouched. Field order in the draft is load-bearing — reordering it makes the panel permanently dirty |

### 6.8 Workspace → People (screen 8) — `TeamSettingsPanel` + 1 band

| Item | Change |
|---|---|
| Kicker `People` + Users | eyebrow |
| `h2` `Team` (`id="settings-team-title"`) | `16px/600` |
| Intro `Everyone who can sign in to this workspace, plus invites still waiting on an answer.` | `13px/500`, `62ch` |
| Summary pill `<n> with logins · <m> sample` | blue → neutral (§5.6.1), string unchanged |
| Unverified-owner notice `Invites go out once you confirm your own email. New ones are held until then.` + MailCheck, `role="status"` | `.business-context-verify` re-skinned in the new scope only (the class is shared with the Dashboard and onboarding): `#fdf0dc` ground, `#b45309` ink, radius 12, `62ch`. **The resend control it implies is now on screen** (§4b.1) |
| `h3` `Members (<count>)` | eyebrow (§5.1) |
| Member row: 40px initials avatar, name, `<em class="settings-me-tag">you</em>`, `<em class="settings-sample-tag">Sample</em>`, sub-line = `user.title` / `Seeded example — safe to remove` / `No login yet` | avatar → `50%`; tags → micro `11px/700/0.06em` uppercase, `you` on the unified accent pair, `Sample` on the unified amber pair, both still de-italicised; name `14px/650`; sub-line `13px/500` `#8a877e` |
| Member role: editable `<select aria-label="Role for <name>">` (`Project Manager` / `Superintendent` / `Crew Lead`) when `team.canManage`, else `.settings-role-pill` | select radius 12, `min-width 170px` kept; pill → neutral (`--wx-bg-2`/`#575550`), `12.5px/600` kept. **Both stay in place** — the pill is the only role display a non-manager gets |
| Remove sample member, Trash2, `aria-label="Remove <name>"` → `DELETE /api/team/users/<id>`, notice `<name> removed.` | label unchanged, hover on the unified danger pair. **Gains a confirm — §8.1** |
| `h3` `Pending invites (<count>)` (block omitted when zero) | eyebrow |
| Invite row: `@` avatar `.is-pending`, email, `Sent <date> · expires <date>` **or** `Held until your email is confirmed` | `@` avatar → `--wx-bg-2`/`#575550` (deliberately quieter than the member avatars, as today); dates keep `formatDate()`; two date formats coexist in the area (`Jun 17, 2026` here vs `Wed, Jun 17, 2026` in the Work calendar) and **stay** — unifying them changes user-visible strings no test pins (**§9.12**) |
| Invite role pill | neutral |
| `Resend` (`.acct-link-btn`, disabled while the owner's email is unverified) | slide on hover; `:disabled` re-declared |
| Withdraw invite, Trash2, `aria-label="Withdraw invite for <email>"` → `DELETE /api/team/invites/<id>`, notice `Invite for <email> withdrawn.` | label unchanged. **Gains a confirm — §8.2** |
| `h3` `Invite people` + copy `Each person gets an email with a link that drops them straight into this workspace with the role you pick.` | eyebrow + `13px/500`/`62ch` |
| `InviteRows` (`App.tsx:7692`): per row an email input (`aria-label` via sr-only `Email <n>`, placeholder `teammate@company.com`) and a role select (sr-only `Role <n>`, 3 options, default `Crew Lead`) | inputs radius 12; the layout stays on `.acct-invite-row` (`account-redesign.css:1651`), re-skinned in the new scope only so onboarding is untouched |
| `+ Add another` (max 20 rows) | `13px/600` `#2f6bff`, `+` slides `3px` on hover. It disappears silently at 20 rows (**§9.13**) |
| Remove-row `X`, `aria-label="Remove row <n>"`, shown at 2+ rows | 30px icon button, radius 12, danger hover. Not destructive of saved data → no confirm |
| `Send invites` / `Sending…` | primary pill |
| Invite notice, up to 3 clauses space-joined: `<n> invite(s) sent.` · `<n> held until you confirm your email.` · `<emails> already has/have an account.` | assembly untouched (it is asserted verbatim); rendered green, `62ch`. It can render as an **empty** `role="status"` paragraph (all three clauses falsy) — presentation fix: `.acct-success:empty { display: none }`, which removes an empty 22px gap and no information |
| Errors `Could not load the team.` / `Could not send invites.` / `Something went wrong.` | danger band. The sticky-error bug (`act()` clears `notice` but never `error`, `App.tsx:21663-21674`) is **§9.14** |
| Per-row errors `Enter a valid email address.` / `Already in the list.` + `aria-invalid` + `.is-invalid` | strings, attribute and class unchanged |
| Band `Access defaults` → `Invite approvals` / `Require an admin review before new members join BuildFlow.` | toggle `inviteApprovals`, default **on** |
| Band `Access defaults` → `Default role` / `Choose the starting role for newly invited users.` | select `Member` / `Admin` / `Visitor` — **kept verbatim**, vocabulary clash logged as §9.6 |
| Band `Access defaults` → `Seat management` / `Review active members, pending invites, and team assignments.` | dead `Manage` button → neutral outline, no lift, no blue (§5.7) |
| Cross-wired disable: every member's role select is `disabled={busy}` where `busy` is the **invite form's** flag (`App.tsx:21734`) | **§9.15** — pressing `Send invites` greys the whole roster |

### 6.9 Workspace → Import (screen 9)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Import tools` | `Schedule spreadsheet` | `Import jobs, crew assignments, dates, and status from a spreadsheet.` | dead `Upload` |
| `Import tools` | `Project list` | `Add project names, managers, target dates, and health status.` | dead `Import` |
| `Import tools` | `Material catalog` | `Load material names, quantities, and readiness states.` | dead `Add file` |

All three go neutral-outline. Note for whoever wires them: the product already has a real importer
(`server/src/import/*`, `POST /api/import/schedule/{preview,commit}`) reachable from the Schedule
page — connecting row 1 to it is a feature, not a re-skin.

### 6.10 Features → BuildFlow AI (screen 10)

| Band | Row | Helper | Control |
|---|---|---|---|
| `AI assistance` | `Schedule suggestions` | `Let BuildFlow suggest sequencing, crew moves, and readiness follow-ups.` | toggle `aiSuggestions`, default **on** |
| `AI assistance` | `AI tone` | `Choose how AI-generated notes should sound in reports and updates.` | select `Concise` / `Detailed` / `Executive summary` |
| `AI assistance` | `Review mode` | `Decide whether AI drafts need approval before they are shared.` | select `Always review` / `Review external only` / `Auto-save drafts` |

This is the **one view** where the gradient trio renders (§5.5): the header glyph and the rail
spotlight's Sparkles. Both `aria-current` controls stay; only the nav item is blue (§4c).

### 6.11 Features → Connections (screen 11)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Connected apps` | `Maps provider` | `Use connected maps for field routes and jobsite locations.` | toggle `connectedMaps`, default **on** |
| `Connected apps` | `Accounting export` | `Send labor hours and job cost summaries to accounting.` | dead `Connect` |
| `Connected apps` | `Document storage` | `Link photos, reports, and project documents to your storage provider.` | dead `Configure` |

### 6.12 Features → Public schedules (screen 12)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Sharing` | `Public schedule links` | `Allow shareable read-only views for selected projects.` | toggle `publicSchedules`, default **off** |
| `Sharing` | `Link expiration` | `Choose how long public links remain active.` | select `7 days` / `30 days` / `Never` |
| `Sharing` | `Visible details` | `Decide whether public views include crews, materials, and delayIQ notes.` | select `Milestones only` / `Milestones and crews` / `Full read-only view` |

### 6.13 Admin → Teams (screen 13)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Team setup` | `Default team` | `Choose where new people are placed when they join BuildFlow.` | select `Operations` / `Field` / `Estimating` |
| `Team setup` | `Team directory` | `Review active teams, assigned users, and workspace access.` | dead `Open` |
| `Team setup` | `Crew visibility` | `Control which teams can see and edit crew schedules.` | select `All teams` / `Assigned teams` / `Admins only` |

### 6.14 Admin → Security (screen 14)

| Band | Row | Helper | Control |
|---|---|---|---|
| `Protection` | `Two-factor authentication` | `Require a second sign-in step for managers and admins.` | toggle `twoFactor`, default **on** |
| `Protection` | `Session timeout` | `Automatically sign users out after inactivity.` | select `8 hours` / `12 hours` / `24 hours` |
| `Protection` | `Audit log` | `Review account access, schedule edits, and shared link changes.` | dead `View log` |

**There is no danger zone in this area and this plan does not invent one.** No delete-workspace, no
leave-workspace, no delete-account, no change-password, and no way to remove a *real* teammate (the
Trash2 renders only for `user.isSample`). Adding any of those is a feature. If one is ever approved,
its home is this band — that is the only reservation made here.

### 6.15 Admin → Billing part 1 (screen 15) — `SettingsBillingPanel`

| Item | Change |
|---|---|
| Kicker `Plan & billing` + CreditCard; `<section data-status={billingStatus}>` | eyebrow; the `data-status` hook is **load-bearing** for the pill and is kept |
| `h2` `<Plan name> plan` + `<em class="settings-status-pill">` | `16px/600`; pill on the four unified state pairs (§5.6), `11.5px/700/0.045em` uppercase |
| The 5 pill labels: `Subscribed` · `Trial · <n> day/days left` · `Trial ended` · `Enterprise` · `Free` | unchanged, including the `ceil((trialEndsAt - now)/86400000)` floor-at-0 maths |
| The 4 status paragraphs (trial_expired / trial / active / enterprise / free — 5 strings) | unchanged, `13px/500`, `62ch` |
| Summary pill `<seats> seat/seats` + ` · $<priceMonthly × seats>/mo`, `—` when seats are unknown | blue → neutral; `tabular-nums` added so the figure stops re-flowing |
| `Add a payment method now` / `Add a payment method` (trial_expired wording) / `Opening checkout…` → `POST /api/billing/checkout` | primary pill |
| `Manage billing` / `Opening…` (status `active`) → `POST /api/billing/portal` | primary pill |
| `Switch to Free instead` (`.acct-link-btn`) → the `setTimeout(0)` + `applyPlanWith("free")` fresh-value path (`App.tsx:22110-22114`) | slide on hover. **The setTimeout path is preserved byte for byte** — it exists because the plan state has not flushed |
| `Plan` select, 4 options `<name> — <price> <priceNote lower-cased>` (`Free — $0 per user / month`, `Pro — $20 …`, `Business — $48 …`, `Enterprise — Custom …`) | radius 12; `min-width 260px` so the longest option stops truncating |
| `Seats` `<input type=number min=1 max=1000>`, clamped + rounded on change | radius 12, `tabular-nums`, `width 96px` |
| `Update plan` / `Saving…`, disabled when plan **and** seats equal the saved values | primary pill; `:disabled` re-declared (the test asserts it is disabled on arrival) |
| Footer hint: `$0 / month.` / `$<total localised> / month for <n> seat/seats on <plan>.` / `Custom pricing — sales will size Enterprise.` + the appended ` Paid plans start with a 14-day trial; nothing is charged until a payment method is added.` | unchanged, `13px/500`, `62ch` |
| Notices `You're on Free. Nothing will be charged.` / `Plan set to <plan> for <n> seat/seats.` | green, `62ch` |
| Errors `Pick your trade under General first, then choose a plan.` · the Stripe-not-configured server message · `Billing isn't connected yet. Your plan is saved; nothing is charged until it is.` · `Billing isn't connected yet.` · `Could not start checkout.` · `Could not open billing.` · `Could not change the plan.` | danger band, `role="alert"` kept, `62ch` |
| The **empty action row**: `.settings-billing-actions` renders for `trial`/`trial_expired`/`active` but every button inside is further gated on `paid`, so a `trial` org on `free`/`enterprise` gets an empty flex div with `margin-top: 16px` | presentation-only fix: `.settings-billing-actions:empty { display: none }`. No logic touched, no information lost |
| Two disagreeing totals: the header pill uses **saved** seats, the footer hint uses the **draft** seats, so mid-edit the panel shows two different monthly figures (`App.tsx:22081-22086` vs `:22164-22172`); and the pill shows `—` while the field shows `5` when `data.seats` is null | **§9.16** — both are genuine and both need a data decision, not a style |

### 6.16 Admin → Billing part 2 (screen 16) — `SettingsBillingPlans`

| Item | Change |
|---|---|
| Title `Plans that grow with you` | Georgia 30px → Inter `clamp(22,1.9vw,26)`/600 (§5.4) |
| Segmented control `role="tablist" aria-label="Plan audience"`, tabs `Individual` (Pro + Business) / `Team & Enterprise` (Business + Enterprise), sliding `.sx-seg-ind` | roles, labels and the slide kept; the pill goes on the radius ladder (999px) and the indicator on `--bf-ease`. It is an incomplete tablist (no `tabpanel`, no `aria-controls`, no arrow keys) — **§9.17** |
| 2 plan cards per segment: tone icon square, name, tagline, price, unit line, CTA, note, separator, feature head, feature list | **licensed frames (clause 3)**: paper, `rgba(28,28,26,0.07)` hairline, radius **18px** (already 18 — the one surface in the area that is already on the ladder), `--bf-shadow-card` at rest, `translateY(-4px)` + `--bf-shadow-card-hover` on hover. The off-ladder `0 20px 46px /.06` dies |
| Taglines `Live crew scheduling, readiness, and reporting` / `Cross-project dispatch and field control` / `Custom workflows and priority support` / `Demo of BuildFlow` | unchanged |
| CTAs `Downgrade to Pro` / `Manage plan` / `Contact sales` / `Start free demo` — **no `onClick`** | strings unchanged. They lose the blue: **the card's one accent goes to the price**, and every CTA renders as a neutral outline pill. This is the §2d prohibition applied to the sharpest case in the area — today the dead `Manage plan` is the *blue primary* on the page while the live `Update plan` sits above it in the same view (**§9.18** to wire them) |
| Notes `No commitment · Cancel anytime` / `Tailored onboarding` | unchanged, micro rung |
| Feature heads `Everything in Free and:` / `Everything in Pro, plus:` / `Everything in Business, plus:` / `Includes:` | unchanged → eyebrow |
| 9 feature bullets with Check glyphs (Pro: `Unlimited crew schedules`, `Readiness rules and alerts`, `Weekly production reporting`; Business: `Cross-project dispatch planning`, `Advanced field permissions`, `Route and equipment coordination`; Enterprise: `Custom onboarding and workflows`, `Executive schedule health views`, `Priority support and security review`), with any leading `Everything in …` entry filtered out | unchanged; Check glyph → `#188038`, 14px; text `13px/500` |
| Price: the Pro card's `AnimatedPlanPrice` + `Monthly`/`Yearly` `BillingToggle` (`role="tablist" aria-label="Billing period"`, `Save 20%` chip, default **yearly**) with note `Per user / month` / `Per user / mo · billed yearly`; other paid cards `From $<price>` + `USD / user · billed monthly`; Enterprise `Custom` + `Custom pricing` | all strings unchanged. The figure goes on `--bf-app-figure-hero` `clamp(32px,3.4vw,40px)`/800/`-0.02em` **+ `font-variant-numeric: tabular-nums`** — which also fixes a real defect: the `PriceCounter` tweens the number with framer's `animate()` over 0.6s and proportional digits make the whole line re-flow every frame |
| `current: true` is **hard-coded on the Business card** (`SETTINGS_PLAN_CARDS`, `App.tsx:21420`) regardless of the org's plan, so the highlighted card can contradict the status panel above it | the highlight is re-based from "blue CTA + blue-tinted border/shadow" to a single `2px` accent ring on the card edge and nothing else — no new label, no new copy. It is still wrong whenever the data disagrees, so the underlying bug is **§9.19** |
| `.sx-plans { max-width: 940px }` inside a 920px column | gets `.bf-doc-bleed` so the pair can reach `1040px` (`--bf-measure-hero`) above 1200px of viewport, instead of being silently clamped to 920px. The grid stacks at 720px (kept) |
| Footer `*Usage limits apply.` (`href="#usage-limits"`, `preventDefault`ed) + `Prices and plans are subject to change at BuildFlow's discretion.` | strings unchanged; the dead anchor renders as body text with an underline on hover — it must not read as a working link (**§9.20** to remove or wire it) |

### 6.17 Admin → Billing part 3 (screen 17) — Add-ons

| Item | Change |
|---|---|
| `h3` `Add-ons` (`id="sx-addons-title"`) + copy `Programs you can add to any plan. Business and Enterprise include them all.` | eyebrow + `13px/500`/`62ch` |
| 4 cards: `Map & Field Ops` (Map, green) `Track vehicles, equipment, and design traffic routes.` **$12** · `Equipment Tracking` (Wrench, teal) `See equipment assignment, usage, and maintenance status.` **$9** · `Time Cards` (Clock, blue) `Log crew hours against jobs, then approve them for payroll and job costing.` **$8** · `AI` (Sparkles, violet) `Spot conflicts, answer questions, and turn blockers into recovery suggestions.` **$15**, all `per user / month` | **licensed frames (clause 3)**: paper, hairline, radius 18, `--bf-shadow-card`, lift on hover. The four tone colours are kept as *glyph tints only* (they are the programs' identity across the product), which is the one place the accent budget is read per-card rather than per-page |
| Owned chip `Added` + Check, plus `.owned` tinted ground | chip → micro rung on the unified success pair; the tinted ground → `rgba(24,128,56,0.06)` |
| Included chip `Included with your plan` + Check | same species, neutral pair |
| `Add to plan` button | the card's **one** accent: blue primary pill |
| Notice `<program label> is now part of your workspace — find it in the left rail.` (`role="status"`) | string unchanged. It names a rail Settings does not render (§4b); **§9.7** |
| `focusAddOn` arrival: 120ms then `scrollIntoView({block:"center", behavior:"smooth"})` + `.focused` (blue ring + `sx-addon-pulse` ×2) | kept, keyframe **name kept**, ring re-based to `var(--bf-focus-ring)`'s alpha; both the smooth scroll and the pulse gain their missing reduced-motion clause (§7.4) |
| Grid: 1 column under 820px | kept; `.bf-doc-bleed` to 1040px above 1200px |
| No empty state (fixed catalogue of 4), no error path (local state + `localStorage`) | unchanged |

---

## 7. The narrow layout, designed — and the motion rules

### 7.1 The invariant that comes first

> **INVARIANT — DO NOT MOVE.** `.settings-panel-inner` is keyed by `activeSettingsView`
> (`App.tsx:22905`) and its children animate with the `sx-rise` keyframe. It must **never** be given
> `data-reveal` / `data-reveal-stagger`, and neither must anything inside it. `useHudMotion`'s reveal
> effect has deps `[rootRef]` only: it queries `[data-reveal]` **once** and never re-queries after a
> key change, while the CSS resting state for a reveal target is `opacity: 0`. Converting Settings to
> the reveal engine therefore leaves the panel **permanently blank, with no error, on every category
> switch after the first.** Settings keeps `sx-rise`. This is why the area has zero reveal targets
> today and it must stay that way.

That comment block goes at the top of the new stylesheet and above the `key={activeSettingsView}` in
`App.tsx`. Two corollaries:

- The `useHudMotion` alignment the shell phase makes (`threshold 0.12 → 0.16`,
  `rootMargin -5% → -6%`) does not affect this area: Settings uses only the hook's pointer half
  (`--mx`/`--my`/`--px`/`--py` and the `.dx-ready` class), and that half is untouched.
- The `nth-child` stagger is defined for children **1–6 only** (`0.02 / 0.10 / 0.18 / 0.26 / 0.34 /
  0.42s`, `settings-redesign.css:349-366`). Billing already renders 3 top-level children (header +
  status panel + plans). Nothing in this plan adds a top-level child to `.settings-panel-inner`, and
  the sticky close bar (§7.3) is a child of `.settings-panel`, **not** of `.settings-panel-inner`, so
  the stagger's `nth-child` counting is untouched. If a 7th child is ever added, extend the list.

### 7.2 What is wrong with the narrow layout today

At ≤900px (`settings-redesign.css:1079-1106`) the page is not a smaller version of the desktop
screen, it is a different one, produced entirely by subtraction:

- `.settings-page` → one column; `.settings-rail` → `position: static`, `flex-direction: row`,
  `flex-wrap: wrap`;
- `.settings-nav-groups` → `grid-auto-flow: column; overflow-x: auto` — **a horizontally scrolling
  strip of four labelled groups with no scroll affordance**: no edge fade, no snap, no scrollbar
  styling, and no auto-scroll to the active item, so a person on a phone whose active category is
  `Billing` (group 4 of 4) opens the page scrolled to `Account` with no indication that ten more
  categories exist to the right;
- the account card loses its bottom rule, the AI button loses its top margin;
- the panel padding drops to `34px / clamp(20px,5vw,44px) / 60px`;
- the close `X` stays `position: absolute` in a panel that now starts **below the whole rail**;
- and `.settings-row` only stacks at ≤560px, so between 561 and 900px a 188px-wide select and a
  62ch helper share a 28px-gap two-column grid.

### 7.3 The design: one aside, one list, a sticky category sheet

Constraint from §4c: **one DOM copy of the aside, 15 `aria-current`-capable controls, no duplicate
accessible names.** The design is a reflow of the existing markup plus exactly one new control.

**≥901px — unchanged two-pane**, with the four offsets of §4d and the sticky close bar.

**≤900px — the category sheet:**

```
┌─ top bar (sticky, 56px) ─────────────────────────────────────────┐
├─ the aside, sticky at top: var(--hs-topbar-h) ───────────────────┤
│  [LS] Liam Santos            Preferences            [chevron]    │  56px, opaque #fff
│  ── (expanded) ──────────────────────────────────────────────────│
│  ACCOUNT            WORKSPACE          FEATURES      ADMIN       │  2 cols ≤900, 1 col ≤560
│  Liam               General            BuildFlow AI  Teams       │
│  Preferences        Work calendar      Connections   Security    │
│  …                  …                  …             Billing     │
│  [ BuildFlow AI ]                                                │
└──────────────────────────────────────────────────────────────────┘
   the panel, on the ground, 28/24/72 padding
```

- The aside becomes `position: sticky; top: var(--hs-topbar-h); z-index: 6`, `background: #ffffff`
  (opaque — the same licence as §5.3, no `backdrop-filter`), with a bottom hairline instead of a
  right one.
- **Collapsed row = the existing account card + one new disclosure button.** Nothing is duplicated
  and nothing is hidden: identity, the current category and the way to change it all live in 56px.
- The new control:
  ```tsx
  <button type="button" className="sx-rail-toggle"
          aria-expanded={railOpen} aria-controls="settings-nav-groups"
          aria-label="Change settings category"        /* fixed name — never a category label */
          onClick={() => setRailOpen(o => !o)}>
    <span>{activeLabel}</span><ChevronDown size={16} />
  </button>
  ```
  `aria-label` overrides the visible text in the accessible-name computation, so
  `getByRole("button", { name: "Preferences" })` (`App.tsx` test at `App.test.tsx:648`) stays
  **singular** even in the DOM. It carries `aria-expanded`, never `aria-current`, so
  `settings.test.tsx:179` is untouched.
- It is rendered behind `useShellBreakpoint("(max-width: 900px)")`, which returns **`false` when
  `matchMedia` is absent or stubbed** — `test/setup.ts` answers `matches: false` for every query — so
  under test the control does not exist at all. Belt *and* braces.
  ```ts
  /** Media query as state. Defaults to false when matchMedia is missing (jsdom, SSR) so a
      media-gated control simply does not render under test. Same shape as the shell's. */
  function useShellBreakpoint(query: string): boolean { … }
  ```
- `.settings-nav-groups` becomes `id="settings-nav-groups"`, a **2-column grid** (`1fr` at ≤560px) of
  the four groups — no horizontal scrolling anywhere — collapsed with
  `grid-template-rows: 0fr → 1fr` + `overflow: hidden` on `--bf-ease-size` (the height curve), which
  keeps all 15 buttons in the DOM at every width and every state.
- Picking a category collapses the sheet: the nav item's handler becomes
  `onClick={() => { setActiveSettingsView(item.id); setRailOpen(false); }}`. One extra state write,
  no behaviour change (the sheet does not exist above 900px or under test).
- Nav rows go to `min-height: 44px` at ≤900px; group headings keep the eyebrow.
- `.settings-ai-button` sits at the end of the expanded region, full-width, `margin-top: 8px`
  (today's `margin-top: 0` at narrow width is a subtraction artefact).

**≤560px:**

- the sheet grid goes to one column;
- `.settings-row` keeps today's `grid-template-columns: 1fr` stack, and the control block gets
  `justify-self: start; width: 100%` with `select { width: 100% }` — so a select stops being a
  188px island in a 320px column;
- `.settings-team-heading` and the members heading keep their 1-column stack;
- the invite form stays on `.acct-invite-row`'s own ≤560px rule in `account-redesign.css:1715`;
- the Work calendar's holiday list keeps its 640px collapse (`1fr | auto`, name spanning both);
- the 3 `Add <year> holidays` buttons wrap instead of overflowing;
- **the panel's bottom padding stays 72px** (today 60px) — the tail is free.

**Panel padding by tier:** `46px clamp(28px,6vw,90px) 72px` ≥901 · `28px 24px 72px` ≤900 ·
`24px 18px 72px` ≤560. That is *more* air at the top on desktop than the current narrow tier and
*less* waste on a phone, which is the same arithmetic the shell phase applies to content gutters.

### 7.4 The close button becomes sticky

```tsx
<div className="sx-close-bar">            {/* child of .settings-panel, NOT of .settings-panel-inner */}
  <button className="settings-close-button" aria-label="Close settings" …/>
</div>
```

```css
.settings-rx.bf-settings .sx-close-bar {
  position: sticky;
  top: var(--sx-sticky-top);          /* calc(var(--hs-topbar-h) + 12px) ≥901px */
  height: 0;                          /* takes no space: the panel's 46px top padding holds it */
  display: flex; justify-content: flex-end; z-index: 3;
}
@media (max-width: 900px) { .settings-rx.bf-settings { --sx-sticky-top: calc(var(--hs-topbar-h) + 68px); } }
```

The button keeps its 42×42 geometry, its 12px radius, its `rotate(90deg)` hover and its
`aria-label="Close settings"`. The wrapper is a *new DOM node* and it matters where it goes: inside
`.settings-panel` it is invisible to the `nth-child` stagger; inside `.settings-panel-inner` it would
shift every delay by one and silently kill the header's entrance.

### 7.5 Motion and reduced motion

**Keyframe names are kept, values change.** `sx-rise` (`:1068`), `sx-plan-in` (`:1220`),
`sx-addon-pulse` (`:1505`). The existing reduce block (`:1125-1137`) nulls by **selector**, not by
name, so renaming would not un-null it — but renaming would still orphan the four selectors, and
there is no reason to rename anything.

**The reduced-motion gap is the real work here.** Today the block covers only the account card, the
four nav groups, the AI button, the panel children and the aurora transforms. Six things run at full
amplitude with reduce on. The new stylesheet adds **one** block (extending the pattern, not inventing
an eleventh one) that covers:

| Uncovered today | Handling under reduce |
|---|---|
| `sx-plan-in` (both plan cards, replays on segment change) | `animation: none` |
| `sx-addon-pulse` (focused add-on, runs twice) | `animation: none` |
| `.sx-seg-ind` slide (`transform 0.32s`) | `transition: none` |
| `.plans-billing-indicator` slide (`styles.css:4866`, `transform + width 0.34s`) | `transition: none` |
| `.dx-cursor` 480px follow glow (`position: fixed`, `--mx`/`--my`) | `opacity: 0` |
| the new sheet's `0fr → 1fr` height transition | `transition: none` |
| every new hover lift | already free — `--bf-lift-dense` zeroes in `design-tokens.css`'s reduce block |

Two of them are **JS**, so CSS cannot reach them. Both get a 3-line guard, motion-only:

1. `PriceCounter` (`App.tsx:1418`) tweens the dollar figure with framer's `animate()` over 0.6s. Under
   reduce it must set the final value directly. The displayed number, its formatting and its final
   state are identical either way.
2. The add-on `scrollIntoView({ block: "center", behavior: "smooth" })` becomes
   `behavior: prefersReduce ? "auto" : "smooth"`. The card still ends up centred and still gets
   `.focused`.

**Durations and curve:** the nine `0.18s ease` / `0.2s ease` / `0.3s ease` transitions in
`settings-redesign.css` move to `var(--bf-dur-press|hover|panel) var(--bf-ease)`. `sx-rise` keeps its
`0.55–0.6s` and its `fill-mode: backwards` — backwards is deliberate (it releases the finished state
so nothing clobbers a hover transform), and it is also what makes the keyed replay safe.

---

## 8. The three unconfirmed destructive actions

The inventory's finding, verified: there is **no** `window.confirm` and **no** dialog anywhere in
`App.tsx` 21400-22960, which is why every screen's `modals` array is empty. Three actions delete
something on one click. Meanwhile the product already ships a house pattern for exactly this — the
`.pdx` confirm (`App.tsx:28207-28270`, `project-dialog-redesign.css`), a portalled
`role="dialog" aria-modal="true"` with `useModalDialog` handling Escape, the Tab trap, initial focus
and focus restore, a `Cancel`, and a danger button named `Confirm delete <name>`. It is asserted in
`tests/index-pages.test.tsx:226` and `:328`, so it is known-good.

### 8.1 `Remove <name>` — remove a sample member — **NEEDS APPROVAL**

`DELETE /api/team/users/<id>`, fires on click, irreversible (the seeded user cannot be re-created from
the UI). Proposal: reuse the `.pdx` confirm.

| | Spec |
|---|---|
| Trigger | the existing Trash2 button, `aria-label="Remove <name>"` — **unchanged**, so `settings.test.tsx:210` still finds it |
| Dialog | `role="dialog" aria-modal="true"`, portalled to `document.body`, `useModalDialog(ref, close, true)` |
| Eyebrow | `Confirm remove` |
| Title (`h2`) | `Remove teammate` |
| Body | `<name>` + their role, then: `They lose access to this workspace. Seeded example — safe to remove.` for a sample user |
| Buttons | `Cancel` · danger `Remove teammate` with `aria-label="Confirm remove <name>"` |
| Error | shown **inside** the dialog on `.form-error role="alert"` — which also fixes the sticky-error path (§9.14) for this action, because the failure never reaches the panel's un-cleared `error` state |
| Surface + motion | **inherited from `.pdx`, unchanged.** The dialog portals to `document.body`, so it sits outside `.settings-rx` and outside this file's scope — it takes whatever the shared modal system gives every other confirm in the product, which is the point of reusing it |

### 8.2 `Withdraw invite for <email>` — **NEEDS APPROVAL**

`DELETE /api/team/invites/<id>`, fires on click, irreversible (the emailed link dies immediately; a
re-invite is a different link and the recipient may already hold the first).

Same pattern. Eyebrow `Confirm withdraw`; title `Withdraw invite`; body = the email plus
`Sent <date> · expires <date>` or `Held until your email is confirmed`, then
`The link in their email stops working.`; buttons `Cancel` · `Withdraw invite` with
`aria-label="Confirm withdraw invite for <email>"`. The trigger keeps
`aria-label="Withdraw invite for <email>"` so `settings.test.tsx:216` still finds it.

### 8.3 `Remove <holiday>` — **no confirm, and that is the recommendation**

This one is different in kind and should be treated differently:

- it mutates a **local draft**, not the server;
- it is already reversible by an on-screen control, `Discard changes`;
- nothing persists until `Save work calendar` (`PUT /api/schedule/work-calendar`);
- and a fresh workspace ships **14** seeded holidays (0.5), so removing several in a row is the
  normal case. A modal on each of 14 rows would be hostile.

A confirm would therefore protect nothing and cost a lot. What the row actually lacks is a signal
that the removal is *pending*. The presentation-only half of that ships in the default plan and
needs no approval and no new copy:

- the removed row leaves with a `160ms` opacity/height fade on `--bf-ease-size` (nulled under reduce);
- while `dirty`, `Save work calendar` takes the band's one accent (blue primary) and `Discard changes`
  drops to a plain outline — so "there is something unsaved here" is legible from the button pair
  that already exists;
- and the two buttons become `position: sticky; bottom: 0` inside the band at ≤560px, so on a phone
  the escape hatch does not scroll away below 14 rows.

The stronger version — an explicit `Unsaved changes` marker next to the `Holidays` head — is **new
copy** and is logged as **§9.21 NEEDS APPROVAL**.

### 8.4 Two adjacent facts, stated so they are not mistaken for omissions

- **There is no danger zone** in this area at all (§6.14). The three actions above are the whole set.
- **Removing an invite row** (`Remove row <n>`) and **toggling the last remaining weekday** are *not*
  destructive: the first discards an unsent draft row, and the second is refused outright by
  `toggleDay` (it returns `current.workingDays` when the set would empty). The second is a **silent**
  refusal — the chip simply does not respond, with no explanation. Presentation-only mitigation in the
  default plan: when only one working day remains, that chip gets `cursor: default` and
  `aria-disabled` is **not** set (the control is still a real checkbox and setting it would change
  semantics) — instead the chip's `:active` press-scale is suppressed so it reads as unresponsive
  rather than broken. Saying *why* in words is **§9.22**.

---

## 9. The approval register — everything that would change behaviour or copy

None of these is in the default plan. Each is independently shippable, each is a defect the inventory
or this pass found in source, and each is sized. **All 25 need approval.**

| # | Defect (verified) | Fix | Size | Risk |
|---|---|---|---|---|
| **8.1** | `Remove <name>` deletes a teammate on one click, irreversibly | `.pdx` confirm dialog | ~55 lines | low — the trigger's `aria-label` is unchanged; no test clicks it |
| **8.2** | `Withdraw invite for <email>` kills an emailed link on one click | `.pdx` confirm dialog | ~55 lines | low — same |
| **9.1** | The rail account card hard-codes `"Liam Santos"` / `"Project Manager"` (`App.tsx:22864-22865`) while the rail label and every panel use `data.activeUser`. The test suite signs in *as Liam*, so the bug is invisible under test | read `data.activeUser.name` / `.role` | 2 lines | low, but it changes what a real user sees, so it is copy-adjacent; the 46px-grid ellipsis must be re-checked with a long name |
| **9.2** | `openAppPage()` does not clear `settingsInitialView` / `settingsFocusAddOn` (only `closeSettingsPage()` does, `App.tsx:2724-2728`), so leaving Settings by ⌘K — and, after §4b, by the brand button, a search result or the help button — reopens Settings on Billing with an add-on pulsing | clear both in `openAppPage`, or route the top bar's nav callbacks through `closeSettingsPage` while `page === "settings"` | 2 lines | low |
| **9.3** | A prop change to `initialView` cannot move `activeSettingsView` (`useState(initialView ?? "preferences")`, `App.tsx:22377`) | `useEffect(() => { if (initialView) setActiveSettingsView(initialView) }, [initialView, focusAddOn])` | 3 lines | medium — it is state management, and a naive `key` on `SettingsPage` instead would reset all 14 toggles |
| **9.4** | Settings renders no page rail, so 21 pages are unreachable without closing it, and the add-on notice names a rail that is not there | render `Sidebar` on Settings; requires 9.2 **and** 9.3, plus restoring the rail column in `app-shell-hubspot.css:44` and `styles.css:7534`, plus a `page === "settings"` guard on the rail gear so it stops clobbering `settingsReturnPage` | ~20 lines across 4 files | **medium-high** — §4b lists the three couplings |
| **9.5** | 9 of 14 categories persist nothing: 14 toggles die with the page, 15 uncontrolled selects reset on **every** category switch (the keyed remount at `App.tsx:22905`), 8 buttons have no handler | either wire them to `/api/me/settings/<key>` (the mechanism the dashboard layout already uses) or label them | large | high — it is the feature the area is missing |
| **9.6** | `Default role` offers `Member / Admin / Visitor`; the real roster is `Project Manager / Superintendent / Crew Lead` (`TEAM_ROLE_OPTIONS`) | align the option set | 1 line, but it is user-visible copy | low |
| **9.7** | `"<program> is now part of your workspace — find it in the left rail."` names a rail Settings does not render | reword, or land 9.4 | 1 string | low |
| **9.8** | `Nothing to save.` renders in the **success** channel (`.acct-success`, green) though nothing happened | move it to a neutral channel | 1 line + 1 class | low |
| **9.9** | The Work calendar has two `h2`s (`Working week`, `Holidays`) under one `aria-labelledby="wc-title"`, so `Holidays` is unassociated | give `Holidays` its own `<section aria-labelledby>` | 4 lines | low — but it adds a landmark the region query could see, so run `settings.test.tsx` first |
| **9.10** | The holiday name is silently trimmed, truncated to 80 chars, and replaced with the literal `Holiday` when blank (`shared/src/index.ts:635-652`); the list is also de-duplicated by date and re-sorted, and `Add holiday` on an existing date **silently replaces** that row | surface it: `maxLength={80}`, and helper copy | 2 lines + 1 string | low |
| **9.11** | `.wc-status` is hard-coded green (`settings-redesign.css:1611-1615`) and always `role="status"`, so `Could not save: <message>` renders as a success and is announced politely. It is the only panel in the area with no `role="alert"` channel | add an `is-error` class + `role="alert"` when the string is a failure | 4 lines | low |
| **9.12** | Two date formats in one area: `Jun 17, 2026` (`formatDate()`, invites + trial end) vs `Wed, Jun 17, 2026` (the Work calendar's own `toLocaleDateString`) | unify on `formatDate()` | 6 lines | low, but it changes visible strings |
| **9.13** | `+ Add another` disappears at 20 invite rows with no explanation | keep it, disabled, with a reason | 2 lines + 1 string | low |
| **9.14** | `TeamSettingsPanel.act()` clears `notice` but never `error` (`App.tsx:21663-21674`), and `load()` clears it only on a successful GET — so a failed role change leaves a red `role="alert"` sitting above later green successes | `setError("")` in `act()` | 1 line | low |
| **9.15** | Every member's role `<select>` is `disabled={busy}` where `busy` is the **invite form's** flag (`App.tsx:21734`) — `Send invites` greys the whole roster | separate the two busy flags | 3 lines | low |
| **9.16** | Billing shows two different monthly totals while Seats is being edited (header pill = **saved** seats, footer hint = **draft** seats, `App.tsx:22081-22086` vs `:22164-22172`), and shows `—` in the pill against `5` in the field when `data.seats` is null | pick one source per surface | 4 lines | low, but it is a product decision |
| **9.17** | Two `role="tablist"`s with no `role="tabpanel"`, no `aria-controls` and no arrow-key handler (there is no `onKeyDown` anywhere in the settings subtree): `.sx-seg` (`Plan audience`) and `BillingToggle` (`Billing period`) | add `aria-controls` + a roving-tabindex arrow handler | ~25 lines | low |
| **9.18** | Three plan-card CTAs (`Downgrade to Pro`, `Manage plan`, `Contact sales`) have no handler while the live `Update plan` / checkout / portal buttons sit above them in the same view — two competing plan-change affordances, and today the dead one is the blue primary | wire the CTAs to the panel's own handlers, or remove them | ~15 lines | medium — `Contact sales` needs a destination |
| **9.19** | `SETTINGS_PLAN_CARDS` hard-codes `current: true` on **Business** (`App.tsx:21420`) regardless of the org's plan, so the highlighted card can contradict the status panel above it | derive `current` from `data.selectedPlan` | 3 lines | low |
| **9.20** | `*Usage limits apply.` is an `<a href="#usage-limits">` whose click is `preventDefault`ed — a link to nowhere | wire it or make it text | 1 line | low |
| **9.21** | Removing a holiday looks committed; nothing says the draft is unsaved | an `Unsaved changes` marker by the `Holidays` head | 1 string | low |
| **9.22** | Toggling the last remaining working day is refused **silently** by `toggleDay` | say why | 1 string | low |
| **9.23** | `paletteCommands()` has no `Settings` entry, so ⌘K can *leave* Settings but never *enter* it — and ⌘K is the page's only keyboard exit | add one command | 2 lines | low |

**Ordering recommendation if only a few are approved:** 8.1, 8.2 (data loss) → 9.14, 9.11, 9.8
(lying about state) → 9.1, 9.7 (lying about facts) → 9.2, 9.23 (navigation) → 9.5 (the real feature).

---

## 10. Files, scope class, and build order

### 10.1 Files

| File | Change | Size |
|---|---|---|
| **NEW** `client/src/settings-daylight.css` | the whole re-skin, every rule prefixed `.settings-rx.bf-settings` (or `.hs-shell.bf-shell` for the four offset rules of §4d) | ~520 lines |
| `client/src/main.tsx` | **one appended import**, after the shell phase's, so it wins everything: `import "./settings-daylight.css"; // Settings in the Welcome Page's language — loads after the shell` | 1 line |
| `client/src/design-tokens.css` | append `--bf-app-title-hero`, `--bf-app-figure-hero`, `--bf-app-lede` (§1d) | 3 lines |
| `client/src/App.tsx` | 9 edits, all enumerated in 10.2 | ~60 lines |
| **NEW** `client/src/tests/settings-density.test.ts` | the mechanical drift guard (§11.3) | ~70 lines |
| **NEW** `client/src/tests/settings-nav.test.tsx` | the standing nav/reachability guard (§11.2) | ~90 lines |
| `client/src/settings-redesign.css` | **untouched** in the default plan; the optional last-phase cleanup deletes the 16 orphan blocks of §5.9 | 0 / -180 |
| `client/src/account-redesign.css` | **untouched** — shared with login + onboarding | 0 |
| `client/src/styles.css` | **untouched** — its two settings rules are overridden from the new file | 0 |
| `client/src/schedule/WorkCalendarPanel.tsx` | **untouched** — the `.wc-*` re-skin is entirely CSS. (It stays in `schedule/`: moving it would put settings markup where `boundary.test.ts` polices the schedule tree) | 0 |

**The CSS load order is not reordered.** `main.tsx` is hand-tuned and ends with the comment
"loads last so it wins"; one line is appended after it and nothing moves.

### 10.2 The App.tsx edits, exactly

| # | Site | Edit |
|---|---|---|
| a | `App.tsx:2809` | delete `page !== "settings" && ` from the TopBar guard (§4b). The Sidebar guard at `:2828` and the Ask-AI/Breeze suppression at `:2989-2994` are **not** touched |
| b | `App.tsx:22849` | `className="settings-rx"` → `className="settings-rx bf-settings"` — a **literal**, so the class stays static (the dynamic-className-on-a-reveal-target trap does not apply here, and this keeps it that way). Deleting the word `bf-settings` reverts the entire concept |
| c | `App.tsx:22905` | add `data-view={activeSettingsView}` to `.settings-panel-inner`, next to the existing `key`. Drives the one licensed gradient (§5.5) and any future per-view rule. The `key` is unchanged |
| d | `App.tsx:22902-22904` | wrap the close button in `<div className="sx-close-bar">` — a child of `.settings-panel`, **never** of `.settings-panel-inner` (§7.4) |
| e | Preferences' 4th section title | `"Workspace defaults"` → `"Opening BuildFlow"` (§3.1) — the only string change in the default plan |
| f | `SettingsPage` | `useShellBreakpoint("(max-width: 900px)")` + `const [railOpen, setRailOpen] = useState(false)`; the `.sx-rail-toggle` button; `id="settings-nav-groups"` on the groups wrapper (`App.tsx:22868`); `setRailOpen(false)` appended to the nav item's `onClick` (§7.3) |
| g | `App.tsx:22439-22459` + `:22930` | A11Y-1: a `desc` id, `cloneElement(row.control, { "aria-describedby": descId })`, and `aria-describedby` forwarded by `SettingsToggle` (§5.8) |
| h | `App.tsx:1418` + the add-on focus effect | the two reduced-motion guards (§7.5) |
| i | above `App.tsx:22905` | the **DO-NOT-MOVE** comment of §7.1, pasted into the source |

### 10.3 The stylesheet's header comment block (ships verbatim)

```
/* settings-daylight.css — Settings in the Welcome Page's language.
   Scope: .settings-rx.bf-settings (one class more specific than settings-redesign.css,
   and later in the cascade). Loads after app-shell-hubspot.css. No :where() — a documented
   jsdom breaker in this repo. No !important. Nothing is reordered.

   ADDITIVITY: this file and its wrappers ADD classes and never replace a pinned one.
   Pinned by tests or by JS — do not rename, do not remove, do not reorder:
     .settings-rx  .settings-page  .settings-rail  .settings-nav-groups  .settings-nav-group
     .settings-nav-item  .active            <- App.test.tsx:648 asserts the literal class "active"
     .settings-ai-button  .active           <- one of the two aria-current controls
     .settings-panel  .settings-panel-inner (keyed) .settings-close-button
     .settings-page-header  .sx-eyebrow  .sx-dot  .sx-header-icon  .sx-header-head
     .settings-section  .settings-row  .settings-team-section  .settings-team-heading
     .settings-team-kicker  .settings-owner-summary  .settings-members-heading
     .settings-member-list  .settings-member-row  .settings-member-identity
     .settings-member-avatar[.is-pending]  .settings-member-controls  .settings-member-remove
     .settings-me-tag  .settings-sample-tag  .settings-role-pill  .settings-role-select
     .settings-status-pill  .settings-billing-panel[data-status]  .settings-billing-actions
     .settings-inline-form[-2]  .settings-invite-form  .settings-invite-submit
     .settings-action-button  .settings-toggle[.active]  .settings-avatar-img
     .sx-plans  .sx-plans-title  .sx-seg  .sx-seg-ind  .sx-seg-opt  .sx-plan-grid
     .sx-plan-card  .sx-plan-cta  .sx-plan-price  .sx-addon-card[.owned][.focused]
     .wc-panel  .wc-days  .wc-day[.is-on]  .wc-list  .wc-date  .wc-name  .wc-remove
     .wc-add  .wc-years  .wc-actions  .wc-hint  .wc-status
     .acct-* and .business-context-verify  <- SHARED WITH LOGIN + ONBOARDING: re-skin only
                                              inside this scope, never in account-redesign.css
     #settings-title  #wc-title  #settings-{account,workspace,team,billing}-title
     #sx-addons-title  #settings-addons  and every generated #settings-<slug> section id

   NEVER: data-reveal / data-reveal-stagger anywhere in this subtree. useHudMotion's reveal
   effect has deps [rootRef] only and never re-queries after .settings-panel-inner's key
   changes, and the CSS rest state is opacity:0 — the panel would go permanently blank with
   no error. Settings keeps sx-rise.
   NEVER: backdrop-filter (top bar only, shell-wide licence). NEVER: a second copy of the
   category list (breaks settings.test.tsx:179 and App.test.tsx:648).
   NEVER: a font-size literal — every size comes from a --bf-app-* token (enforced by
   tests/settings-density.test.ts). */
```

### 10.4 Build order

| Phase | Work | Files | Risk |
|---|---|---|---|
| **A** | append the 3 tokens to `design-tokens.css` | 1 | none — additive, unread until phase C |
| **B** | create `settings-daylight.css` with only the scope class + the header comment; add the `main.tsx` import; add `bf-settings` to the class string (10.2b) | 3 | none — an empty file changes no pixel, and the revert is one word |
| **C** | type + colour + surface: the eyebrow's five roles, the band (dissolved section card), the rail, controls, `:disabled`, the gradient decisions, the two-palette unification, the serif | 1 | low — CSS only |
| **D** | the Billing sub-surfaces: plan cards, add-on cards, the two segmented controls, `tabular-nums` on the price and the seats, `.bf-doc-bleed`, the two `:empty` rules | 1 | low — CSS only |
| **E** | the top bar on Settings (10.2a) + the four `100vh` offsets + the sticky close bar (10.2d) | 1 new + `App.tsx` | **medium** — the one phase with real test exposure. Run `tests/settings.test.tsx` and `App.test.tsx` before anything else |
| **F** | the narrow tier: the category sheet, `useShellBreakpoint`, `railOpen`, the ≤560px control stack, the 72px tail (10.2f) | 1 new + `App.tsx` | low-medium |
| **G** | motion: durations onto the tokens, the one new reduce block, the two JS guards (10.2h) | 1 new + `App.tsx` | low |
| **H** | A11Y-1 (10.2g), `data-view` (10.2c), the DO-NOT-MOVE comment (10.2i), the 3.1 rename (10.2e) | `App.tsx` | low |
| **I** | the two new test files | 2 new | none |
| **J** | *optional* cleanup: delete the 16 orphan blocks from `settings-redesign.css` | 1 | low — do it last so a regression is attributable |

Phases E and F are the only ones that touch `App.tsx` structurally, and each is independently
revertable. Phase E can be dropped entirely (Settings then keeps its own chrome) without affecting
C, D, F, G or H — which is the severability concept-preserve claimed for this area, kept intact.

**Concurrency note:** `App.tsx` is 39,194 lines and a parallel session may be editing it. This repo
has a recorded failure mode for exactly that (a black screen with an empty `#root` and no console
errors from concurrent `App.tsx` churn). All nine edits in 10.2 are small and local; do them in one
sitting, in one phase each, and re-read the file before each.

---

## 11. Tests

### 11.1 `client/src/tests/settings.test.tsx` — all 9, and how each stays green

**Expected edits to this file: zero.**

| Line | Test | What it pins | Why it holds |
|---|---|---|---|
| **83** | opens Settings from the top-bar account menu and closes back to the page it came from | `"Liam Santos account"` button + `aria-expanded="false"`; `role="menu"` named `Account menu`; the menu's `Liam Santos` / `Project Manager` text; `menuitem` `Log out`; `menuitem` `Settings`; `h1` `Preferences`; `getByLabelText("Settings categories")`; the Preferences rail button's `aria-current="page"`; the Schedule landing heading absent then present; `"Close settings"`; `queryByLabelText("Settings categories")` gone after close | Every one of those is either in the TopBar (untouched markup — only restyled by the shell phase) or in the aside (same 15 buttons, same aside, same `aria-label`). The **close path is untouched**: `closeSettingsPage()` and `settingsReturnPage` are not edited, and the close button keeps its `aria-label` and its `onClick` — only its `position` changes and it gains one wrapper `div` that no query looks at. Rendering the TopBar on Settings adds nothing named `Preferences`, `Close settings` or `Settings categories`. |
| **113** | keeps the account menu and the Settings controls on every rail hub | `≥2` buttons named exactly `Settings` on **six app pages**; the account menu's contents on each; then `getAllByRole("button", {name:"Settings"})[0]` opens `Preferences` | Runs entirely **before** Settings opens, on pages where nothing in this plan renders. The `≥2` comes from the top-bar gear + the rail gear, both untouched. Note the direction of the inequality: rendering the top bar on Settings can only ever *add* a third `Settings` button while on Settings, and this assertion never runs there |
| **142** | switches between every Settings category from the category rail | the 4 group headings **as headings inside the rail**; all 14 `[label, h1, h2]` triples; `aria-current="page"` on the clicked button; and **line 179**: exactly 1 current button in the rail, 2 on `BuildFlow AI` | §3 freezes all 14 labels, all 14 `h1`s, all 14 asserted `h2`s and their levels, and the 4 group headings; §3.1's rename touches a heading this test does not assert (`Appearance` is the pinned one for Preferences). Line 179 is answered in §4c: one aside, one list, 15 `aria-current`-capable controls, the new disclosure carries `aria-expanded` only, and the narrow tier is CSS reflow — no second copy. Uppercasing five roles does not touch any accessible name |
| **184** | shows the Team roster with you/Sample tags and the pending invites | `region` named `Team`; `Pending invites (1)`; `Members (2)`; `1 with logins · 1 sample`; the held-notice **absent** for a confirmed owner; `you`; `Owner`; `Project Manager`; no `Remove` on your own row; `Sample`; `Seeded example — safe to remove`; `Remove Carlos Ramirez`; `/^Sent .* · expires /`; `Crew Lead`; an **enabled** `Resend`; `Withdraw invite for sam.rivera@buildflow.test` | Every string and every `aria-label` is unchanged (§6.8). The `region` name comes from `h2#settings-team-title` = `Team`, which keeps its text and its level. The two tags stay `<em>` elements with their classes; only their colour values move. `Remove`/`Withdraw` keep their labels even under §8.1/§8.2, because the confirm sits *behind* the same trigger |
| **220** | sends invites, reports held ones, refuses bad emails | the held-notice copy; `Enter a valid email address.` + `aria-invalid="true"`; **no** POST on an invalid row; `+ Add another`; `Email 1` / `Role 1` / `Email 2` / `Role 2`; `Role 2` defaults to `Crew Lead`; `findByRole("status", {name: ""})`; the exact joined notice `1 held until you confirm your email. carlos@buildflow.test already has an account.`; the trimmed + lower-cased POST body; `Pending invites (2)`; `Held until your email is confirmed`; a **disabled** `Resend`; the form reset to one blank row | The invite form's markup, labels, validation strings, notice assembly and POST body are all untouched. The one nearby change — `.acct-success:empty { display: none }` — is CSS and cannot affect `findByRole("status")` in jsdom (no CSS is applied), and the notice in this test is non-empty anyway |
| **292** | renames the company and re-tunes the trade from General | `region` `Company and trade`; `getByLabelText("Company name")` prefilled from `/api/auth/me`; `Save name` → `Company name saved.` + `PATCH /api/org {name:"Santos Concrete"}`; `getByLabelText("Trade")` value `""`; `Apply trade` disabled → enabled → the tuned notice → `POST /api/business-profile {businessType:"Concrete"}` → disabled again | Labels, both buttons, both notices, both request bodies and the disabled logic are untouched; the panel is restyled only. The `Trade` select's `min-width` change is cosmetic and `getByLabelText` reads the `aria-label`/`<label for>` pair, not the width |
| **350** | updates the login name and email from the profile panel | `h1` = `Liam`; `region` `Name and email`; `<email> is not confirmed yet.`; `Your name` / `Email` values; `Nothing to save.` with **no** PATCH; `Enter a valid email address.` with no PATCH; then the confirmation-link notice and the exact PATCH body | All six strings and both labels are unchanged. §9.8 (moving `Nothing to save.` out of the success channel) is **approval-gated and not in the default plan**, and even if it lands it is a class change, not a text change, so `getByText` still finds it |
| **406** | shows the trial on Billing, starts checkout, and can fall back to Free | `region` `/^Pro plan/`; the `h2` `toHaveTextContent("Trial · 14 days left")`; `/Nothing is charged during the trial\./`; `5 seats · $100/mo`; `Plan` = `pro`; `Seats` = `5`; `Update plan` **disabled**; the exact checkout POST body; the `role="alert"` message; `Switch to Free instead` → the Free notice + the exact profile POST; then `/^Free plan/` and **no** `Add a payment method now` | The status pill's uppercase is CSS, so `toHaveTextContent` is unaffected; the summary pill's string is unchanged (only its colour); `Update plan`'s disabled logic is untouched and its `:disabled` styling is *re-declared* rather than lost (§5.7); the `setTimeout(0)` fresh-value path in `Switch to Free instead` is preserved byte for byte; `Add a payment method now` keeps its label, and the `.settings-billing-actions:empty` rule is CSS-only and irrelevant in jsdom |
| **456** | lets the owner change a member's role from the Team panel | `getByLabelText("Role for Sam Ortiz")` value; `Role for Liam Santos` present; change → `Sam Ortiz is now a Superintendent.` + `PATCH /api/team/users/u-sam {role:"Superintendent"}` + the select's new value | The per-member select keeps its `aria-label`, its option set and its handler; only radius, focus ring and pill colours move. §9.15 (splitting the cross-wired `busy` flag) is approval-gated and would only ever make this test *more* robust |

### 11.2 The other five files that touch this area

| File | Assertion | Why it holds |
|---|---|---|
| `App.test.tsx:634-654` | `heading` `Preferences`; the exact Preferences description string; `Close settings`; **`getByRole("button", {name:"Preferences"})` singular** with `toHaveClass("active")`; `queryByRole("button", {name:"BuildFlow Scheduler"})` absent; `queryByText("Stay on schedule.")` absent | The literal class `active` on `.settings-nav-item` is **kept** (it is in the pin list, §10.3) — the plan restyles `.active`, it does not replace it with a data attribute. The *singular* query is why the narrow layout may not duplicate the list and why the disclosure button carries a fixed `aria-label` (§7.3). `BuildFlow Scheduler` exists nowhere in the source any more (grepped: only the assertion itself), so it is vacuously true and stays so — the top bar's brand control is not named that |
| `App.test.tsx:1263-1279` | the email-confirmation notice lives in the top bar (`/Confirm liam@example.com/`), `document.querySelector(".business-context-verify")` is **null**, and `≤1` of `.hs-home-promo, .business-context-verify, .business-context-banner` is on screen | Runs on the **dashboard**, not on Settings, so rendering the top bar on Settings cannot reach it. Worth knowing anyway: People's held-invite notice uses `.business-context-verify`, so if a future test ever counted those classes *while Settings is open*, this is the class to watch |
| `tests/schedule.test.tsx:44-59` | opens Settings from the Week page account menu and asserts `findByLabelText("Settings categories")` | the aside keeps its element and its `aria-label` |
| `schedule/workCalendar.test.ts` | `constructionHolidays` observed dates (2027 included) and `normalizeWorkCalendar`'s six-day default + tidying | pure shared-module tests; `WorkCalendarPanel.tsx` is not edited and `shared/` is not touched |
| `schedule/boundary.test.ts` | fails the build if schedule markup moves into `App.tsx`, if a `/sched-/`-ish schedule name is declared there, or if a `gantt-` className appears there | nothing moves into `App.tsx`; the three new class names are `bf-settings`, `sx-close-bar`, `sx-rail-toggle`; `WorkCalendarPanel.tsx` **stays in `schedule/`** so no stray `/src/*` file matches `/sched/i` |
| `schedule/pages.test.tsx` | holidays flagged on the timeline / Week / Matrix / List — the downstream consumers of what the Work calendar saves | the panel's save path (`PUT /api/schedule/work-calendar`) and its `normalizeWorkCalendar` draft are untouched |

### 11.3 NEW `client/src/tests/settings-density.test.ts` — drift becomes a build failure

The graft: a test that reads the stylesheet **raw** and fails on anything outside a closed allowlist,
using the `?raw` glob `schedule/boundary.test.ts:14` already uses.

```ts
const css = import.meta.glob("/src/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sheet = css["/src/settings-daylight.css"];
```

| Check | Fails when |
|---|---|
| **type** | any `font-size:` whose value is not `var(--bf-app-*)` — no literals, no fifth type scale |
| **radius** | any `border-radius:` outside `999px / 26px / 20px / 18px / 12px / 8px / 50% / inherit / var(--bf-radius-*)` — this is what stops `14px` and `11px` coming back |
| **colour** | any hex or `rgb(`/`rgba(` literal outside the closed set of §1a + §5.6 (the two hairline alphas, `#1c1c1a`, `#575550`, `#8a877e`, `#ffffff`, `#f5f6fa`, `#eaedf3`, `#2f6bff`, `#1f57e0`, `#b45309`, `#c5221f`, `#188038`, the four state fills, the trio's three, `#fdfcf9`) |
| **easing** | any `cubic-bezier(` other than `0.22, 1, 0.36, 1` and `0.4, 0, 0.2, 1` (or the two `--bf-ease*` tokens) |
| **duration** | any `transition`/`animation` duration not drawn from `--bf-dur-*` (or `0s`) |
| **hover** | any `translateY(` in a `:hover` rule whose value is not `var(--bf-lift-dense)` / `var(--bf-lift*)` / `-1px` / `-2px` |
| **scope** | any selector that does not begin `.settings-rx.bf-settings`, `.hs-shell.bf-shell`, `@media`, `@keyframes` or `:root` — proves the file cannot leak, and that the four offset rules are the only shell-level ones |
| **renames** | any class in a selector that does not already appear in `settings-redesign.css`, `account-redesign.css`, `App.tsx` or `WorkCalendarPanel.tsx`, except the three declared new ones (`bf-settings`, `sx-close-bar`, `sx-rail-toggle`) — this is the "adds classes, never replaces a pinned one" rule, mechanised |
| **banned** | `:where(` (a documented jsdom breaker here), `!important`, `backdrop-filter` (top-bar-only licence), `data-reveal` |
| **reduce** | the file contains at least one `@media (prefers-reduced-motion: reduce)` block, and every `@keyframes` it declares is named inside one |

Two of these would have caught the exact fidelity failures the judges found in the losing concepts
(the radius check catches "rescaled to 14px"; the colour check catches a second accent).

### 11.4 NEW `client/src/tests/settings-nav.test.tsx` — the standing guard

Additive, ~90 lines, five `it`s. It converts the three things this plan promises but no existing test
covers into green checks.

| Guard | Assertion |
|---|---|
| 1. the aria-current contract | for each of the 14 categories: exactly 1 `aria-current="page"` button inside `getByLabelText("Settings categories")`, and exactly 2 for `BuildFlow AI` — the same shape as `settings.test.tsx:179` but as a standing invariant of the *aside*, so a future narrow-layout refactor cannot quietly duplicate the list |
| 2. one button per label, document-wide | `getAllByRole("button", { name: "Preferences" })` has length 1 **while Settings is open with the top bar rendered** — the guard for `App.test.tsx:648` |
| 3. narrow reachability | with `window.matchMedia` locally stubbed to `matches: true` for `(max-width: 900px)`: the disclosure button exists, is named `Change settings category`, has `aria-expanded="false"`, has **no** `aria-current`, and all 14 categories are still reachable by `fireEvent.click` alone (no `mouseOver`) with the panel `h1` changing each time |
| 4. the exits | `Close settings` returns to the page Settings was opened from; and with the top bar rendered, the account button and `Search BuildFlow` are both present on Settings (so the page is no longer chrome-less) |
| 5. no reveal targets | `container.querySelectorAll("[data-reveal], [data-reveal-stagger]")` inside `.settings-rx` is empty — the §7.1 invariant as a test, because the failure mode is a blank page with no error |

### 11.5 Run order

`tests/settings.test.tsx` (9) → `App.test.tsx` (the two Settings tests, then the file) →
`tests/settings-nav.test.tsx` (new) → `tests/settings-density.test.ts` (new) →
`schedule/boundary.test.ts` (8) → `tests/schedule.test.tsx` (11) → `schedule/workCalendar.test.ts` →
the full 346.

Phase E is the one that can go red. If it does, drop phase E: the rest of the plan does not depend on
it, which is the whole reason it is sequenced fifth rather than first.

---

## 12. Checked in source and found safe (so it is not re-litigated later)

| Worry | Verified |
|---|---|
| Rendering the top bar adds a bookmarkable identity Settings does not have | No. The "bookmark this page" footer is gated `{currentPage && navItemByPage[currentPage] && …}` (`App.tsx:21024`), and `settings` is not in `navItems` — so on Settings the bookmarks menu lists existing bookmarks and offers no add action. Graceful, and unchanged |
| `App.test.tsx:648`'s `queryByRole("button", {name:"BuildFlow Scheduler"})` would start matching the brand button | No. The brand button is `aria-label="BuildFlow home"` (`App.tsx:20926`). The string `BuildFlow Scheduler` appears nowhere in `client/src` except that assertion — it is vacuously true today and stays so |
| The top bar's help button would start a tutorial with no anchors on screen | The tutorial's own effect navigates away first: `if (!activeStep.page \|\| activeStep.page === page) return; onNavigate(activeStep.page)` (`App.tsx:21260-21263`). It leaves Settings before spotlighting. The only consequence is the stale deep-link state of §4e / §9.2 |
| Settings has tutorial anchors that a new sticky/blur ancestor could mis-place | It has **none**: no `data-tutorial-id` anywhere in the area. That is also why the `.pdx` confirm dialogs of §8 are safe here — and why the §5.3 removal of `backdrop-filter` is a free win rather than a requirement |
| `dialogIsOpen()` in `schedule/viewKeys.ts` could see the new confirm dialog and swallow the 1–6 schedule view keys | The confirms only mount while `page === "settings"`, where no schedule view is rendered and no view key is bound. `BreezeAssistant`'s always-mounted/`display:none` model — the thing `dialogIsOpen()` actually depends on — is untouched |
| The `.pdx` dialog would inherit `.settings-rx`'s tokens, or lose them | Neither: it is `createPortal(..., document.body)` and carries its own `.pdx` scope from `project-dialog-redesign.css`. That is the point of reusing it |
| `color-scheme: light` on `.settings-rx` could be lost with the re-skin | It is on the pin list (§10.3) and explicitly kept. Deleting it gives every one of the 15 selects an OS-dark popup |
| Restyling `.acct-*` / `.business-context-verify` breaks login and onboarding | Impossible by construction: every such rule in the new file is prefixed `.settings-rx.bf-settings`, and `account-redesign.css` is not edited |
| `WorkCalendarPanel` moving out of `schedule/` | It does not move. `boundary.test.ts` polices that tree and there is no reason to touch it — the re-skin is CSS |

---

## 13. Where this plan falls short

1. **Settings still has no display register above 40px, and 40px is a price, not a title.** After the
   work, the biggest thing on the page is a dollar figure on one of 14 categories. The page `h1` at
   `clamp(26px, 3vw, 33px)` is 2.9× smaller than the Welcome Page's hero. Nothing here changes that,
   and this plan explicitly declines to inflate the `h1` past today's value because the panel is a
   form column, not a landing page.
2. **Rhythm compresses ÷4.0 and that is a real loss.** 27px between bands is not 108px between
   sections. The two places the source's rhythm survives literally are the 72px foot and the 102px of
   air above the eyebrow (56px bar + 46px padding) — one of which was already there. Everywhere else
   Settings will read as *tighter*, not merely *smaller*.
3. **The 1140px page measure is abandoned** for a 920px document column, with `.bf-doc-bleed` as the
   only escape (two grids). That is the right call for a form and it is still a deviation.
4. **Nine of fourteen categories remain honest-looking and inert.** The plan makes them *stop
   pretending* (§2d) but it cannot make them work. A person who toggles `Two-factor authentication`
   still sees a satisfying 20px knob slide and still gets nothing. The negative rule is a mitigation,
   not a fix, and §9.5 is the largest item in the register for a reason.
5. **The rail keeps hiding what the app's rail hides.** With `Sidebar` out (§4b), Settings still has
   no path to the other 21 pages except `Close settings` or ⌘K. That is better than today (the top bar
   is a real exit) and worse than the labelled nav the marketing site has. §9.4 is the honest fix and
   it is deliberately not in the default plan.
6. **The light chrome question is answered for this surface, not settled for the product.** The
   rail↔panel edge gets a value step **and** a hairline (§5.3), so it does not rest on
   `rgba(28,28,26,0.07)` alone — but that is one edge on one page. The shell-wide version of the same
   question (a light top bar on a light ground) is the flaw all four concepts share and it is decided
   in the shell phase, not here.
7. **`--wx-amber` is untouched per decision #3 — and Settings makes it louder, not quieter.** No
   `.settings-rx` rule reads `--wx-amber`, so this area renders no blue "warning". But it *does* ship
   three ambers today (`--cc-amber #b45309`, the pill's `#a8721b` on `rgba(224,162,60,.16)`, and
   `#fdf0dc`), and §5.6 collapses them to one. When the app-wide `#0032b0` "amber" sits beside this
   page's real `#b45309` amber, the existing inconsistency becomes easier to see, not harder. That is
   faithful rendering of a decision already made, and it is flagged rather than hidden.
8. **Two dead affordance families survive on purpose.** 8 handler-less buttons and a link to nowhere
   stay on screen, restyled to be quieter. A re-skin that deleted them would be the content change
   this brief forbids; a re-skin that made them look primary would be the lie §2d forbids. Quiet is
   the only remaining option and it is a compromise.
9. **The narrow layout adds one control and one boolean of state.** It is the minimum the design
   needs (a 14-item list cannot live in a 56px sticky row), but it is still an addition to a
   presentation-only brief, and it is the only place this plan adds a control the product did not have.

---

## 14. Acceptance

**Green suite.** All 346 tests pass with **zero edits** to existing test files, plus the two new files
(§11.3, §11.4). Run order in §11.5.

**Inventory walk.** Every item in `inventory/settings.json` is ticked against the running app:
17 screens · 37 static rows with their exact titles, descriptions and option sets · 14 toggles with
their default states · 15 selects · 8 dead buttons · 5 live panels · the 15 Trade options with their
taglines · the 4 plans and their price strings · the 4 add-ons with prices and `includedIn` sets · the
5 `billingStatus` copy variants **and all four `data-status` pill colours** (only `trial` and `free`
are test-covered, so `active`, `trial_expired` and `enterprise` are set by hand in a fixture and
screenshotted) · 7 holiday names on observed dates in 3 years · the 3 verification-line states · every
validation string · every notice string · every loading label · every empty state.

**Computed-style diff**, before/after, over the 14 categories at 1440px:

- every `border-radius` lands on `999 / 18 / 12 / 8 / 50%`, and **no** element computes `14px` or `11px`;
- every `box-shadow` is one of the seven ladder steps or `none`;
- every `transition-timing-function` is one of the two curves;
- **no `font-size` on a frozen surface moved**: the row `<strong>` is `14px`, the row `<p>` is `13px`,
  the page-header `<p>` is `14.5px`, the plan price ceiling is `40px`;
- the eyebrow computes `11.5px / 650 / 0.045em / uppercase / rgb(138,135,126)` in all five roles;
- exactly one element per region computes `rgb(47,107,255)` as a background;
- the gradient trio appears on **exactly two** elements, both only on the `buildflowAi` view;
- `font-family` computes to Inter on **every** element, including `.sx-plans-title`.

**By hand, in a browser** (these are the parts no test can see):

1. The hairline decision (§5.3) on an **uncalibrated external monitor**, not just the laptop panel:
   is the rail↔panel edge legible at 1440px and at 2560px? If not, the fallback is a `#fbfbfd` rail,
   not a heavier hairline.
2. The tutorial from step 1 to the wrap-up, started from the **dashboard**, at 1440 / 768 / 375px —
   Settings is not on the path, but §4b changes what the top bar renders and the wrap-up spotlights a
   top-bar control.
3. All four billing statuses, plus the **empty action row** case (a `trial` org on `free`), plus a
   `data.seats: null` org (the `—` vs `5` mismatch of §9.16 must be *visible and unchanged*, not
   accidentally papered over).
4. The narrow sheet at 900 / 768 / 560 / 375px: open it on `Billing` (group 4) and confirm the active
   category is legible **without scrolling**, which is the defect §7.2 exists to fix.
5. Work calendar with **14 seeded holidays** (the real default, 0.5): remove three, watch the Save/
   Discard emphasis, discard, re-check. Then the same at 375px with the sticky action pair.
6. People with a long real name and a long email, at 375px — the rail account card's ellipsis and the
   member row's `1fr | auto` grid.
7. `prefers-reduced-motion: reduce` on: no `sx-rise`, no `sx-plan-in`, no `sx-addon-pulse`, no segment
   slide, no billing-period slide, **no `.dx-cursor` glow**, no price tween, no smooth scroll, no lift.
8. Every one of the ~12 disabled controls of §5.7 still *looks* disabled.
9. Tab through the whole page: rail → sheet toggle → close → header → every row control → every panel
   button, with a visible `--bf-focus-ring` at each stop and no focus trap.
