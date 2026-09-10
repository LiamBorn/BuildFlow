# Phase 3: the redesign plan

**Awaiting your approval. No UI has changed.** Branch `redesign/dashboard-21st`.

This is the readable plan. The detailed working is in `redesign-plan/`, 1.7MB across 12 documents,
and every claim below points at the file that carries the evidence.

How it was produced: four independent shell designs were written against `DESIGN_TOKENS.md` and the
inventory, then scored by three judges on separate criteria, then the winner was used to map all
226 target screens, plus a motion plan and a settings plan. Fifteen agents, no errors.

## 1. The shell: Daylight Rail

Four concepts were scored out of 30. The judges verified claims against source line by line rather
than taking proposals at their word.

| Concept | Fidelity | Preservation | Feasibility | Total |
|---|---:|---:|---:|---:|
| **Daylight Rail** (`concept-preserve.md`) | 8 | **9** | **9** | **26** |
| Calm Canvas (`concept-canvas.md`) | **9** | 8 | 7 | 24 |
| Brief & Board (`concept-hybrid.md`) | 8.5 | 5 | 6 | 19.5 |
| The Editorial Sidebar (`concept-editorial.md`) | 7 | 6 | 4 | 17 |

**Daylight Rail's thesis, and why it won.** The app does not read as a different product because
its type is 13px. It reads that way because of five specific things, none of which need vertical
space to fix:

1. The dark `#14203a` chrome band, which is the one thing the design language explicitly forbids.
2. Cards at 14px and 12px radius with a `0 1px 2px` shadow instead of the ladder's `18-20px` and
   `0 10px 30px / .05`.
3. A third ink: `#14203a` page titles, where the language has two inks and one accent.
4. No hover grammar at all, plus four stray durations outside the two bands.
5. A doubled accent: the blue, plus a gold bookmark star, plus a violet beta pill.

Fix those five and it is the same product. None of them requires touching `--hs-topbar-h` at 56px,
`--hs-rail-w` at 56px, `DASH_COLS`/`ROW_UNIT`/`GAP`, the flyout's `offsetTop` arithmetic, or a
single accessible name the test harness navigates by.

The feasibility judge scored it 9 because it is the only proposal whose delivery mechanism verified
correct against the source. The preservation judge scored it 9 because it touches no load-bearing
DOM and proves that item by item.

**Editorial lost on evidence, not taste.** The judges found a self-contradiction on surface
treatment, an unenforced one-accent rule, and a proposed test asserting 22 nav pages when
`navItems` has 21. Critically it is non-incremental by construction: the shell renders once at
`App.tsx:2806` for all 23 routes, so replacing the sidebar and moving the bar from 56px to 64px
lands everywhere at once. Its best ideas are grafted below rather than lost.

### How it ships

Nothing in the CSS load order is reordered. One import is appended after the sheet that currently
wins, and one word is added to the shell's class list:

```ts
import "./app-shell-hubspot.css"; // loads last so it wins
import "./app-shell-daylight.css"; // the Welcome Page's language over that shell
```

```ts
const shellClassName = ["app-shell", "bf-shell", …]   // delete "bf-shell" to revert the entire concept
```

Every rule in the new file takes an existing selector verbatim and prefixes `.bf-shell`. That makes
each new rule exactly one class more specific and later in the cascade, so it wins without
`!important` and without editing the file it overrides. No `:where()` anywhere, because that is a
documented jsdom breaker in this repo. About 640 lines, one file, one scope, one kill switch.

`sidebar-redesign.css` goes in the same phase: 307 lines scoped to `.sidebar-rx`, which appears
nowhere in `App.tsx`. Net stylesheet count stays 57.

### The translation, with numbers

Carried over **literally**: the ground `#f5f6fa` with transparent sections, all three inks, both
hairlines, the white card fill, the single `#2f6bff` accent, the gradient trio spent on exactly one
in-app thing, the full radius ladder, all seven shadow steps, both easing curves, both duration
bands, the four hover moves, the one-shot reveal contract, `ch` measures for prose, and Inter as
the only family.

**Re-scaled** for density, with the compression factor:

| Role | Welcome Page | Dense app | Factor |
|---|---|---|---:|
| Largest type | `clamp(46px, 6.8vw, 96px)` | page `h1` `clamp(22px, 1.9vw, 26px)` | 3.7 |
| Second display | `clamp(32px, 4.4vw, 54px)` | card head 16px/600 | 3.4 |
| Figure | `clamp(46px, 5.4vw, 72px)` | KPI `clamp(20px, 1.6vw, 26px)` | 2.8 |
| Lede | `clamp(16px, 1.35vw, 19px)` | page subtitle 14px at 62ch | 1.36 |
| Body | 15 to 16px | table row 13px at 1.45 | 1.2 |
| **Eyebrow** | 11.5 to 13px | **11.5px/650/0.045em, unchanged** | **1.0** |
| Section rhythm | 108px at 1440 | 27px between cards | 4.0 |

The shape of the ladder is preserved and the span is compressed. The Welcome Page runs body to hero
at 6.4x; the app runs row to title at 2.0x. Rhythm compresses 4.0x and type 3.5x, close enough that
the two read as one system at two zoom levels.

**The single highest-yield rule, which all three judges independently picked out:** the eyebrow is
the one role that does not re-scale. The same 11.5px uppercase `#8a877e` label carries over at 1:1
and becomes the table's `thead th`, the KPI label, the settings group heading and the card kicker.
It is the thread that makes a 13px table and a 96px hero look related.

### Grafted from the losing concepts, on the judges' instruction

- **From Canvas, the two-clause card licence:** a frame is licensed only if its boundary is itself
  interactive, or if it clips a scrolling world. Everything else loses its border, radius and
  shadow and is separated by rhythm instead. Canvas counted the resting boundaries per page; that
  audit is applied, and the counts are in the mapping files.
- **From Canvas, class-name additivity as a review gate:** new wrappers and rules only ever add
  classes, never replace a pinned one.
- **From Editorial, invariants written into the component as a header comment**, naming the tests
  that depend on the structure, so the next person cannot move it innocently.
- **From Editorial, an additive `tests/shell-nav.test.tsx`** guarding click-only reachability of
  every hub sub-page and the presence of each `data-tutorial-id="nav-<page>"` anchor. Kept under
  the winner because the hover-only flyout is an accessibility defect regardless of concept.
- **From Editorial, the touch rescue:** bookmark stars pinned to 0.55 opacity below 1024px instead
  of hidden until hover, and add-on tooltips reachable without a pointer.
- **From Preserve, keep every existing keyframe name** and change only its values, because four
  existing reduced-motion blocks reference them by name.

## 2. Every category keeps its home

Nothing moves. The rail keeps all ten entries and every flyout keeps its pages: Home, Bookmarks,
Schedule (landing, month, week, list, kanban, matrix, gantt), Operations, Sales (Contacts,
Companies, Deals), Resources (Crews, Equipment, Materials), Field (Field Updates, DelayIQs, Map &
Field Ops), Reporting, TimeCard, Settings. The bookmark star menu, create menu, search, notification
bell, account menu, AI sparkle and every tutorial anchor stay where they are, re-skinned.

Two changes to the shell's behaviour, both additive:

- The rail becomes focusable and its flyouts open on click as well as hover, so touch users can
  reach more than a hub's first page. Today 13 of 22 pages have no navigation route on a phone.
- Settings rejoins the shell's **top bar only** by deleting `page !== "settings" &&` at
  `App.tsx:2809`. The icon rail stays out. This is the only item in the whole plan with real test
  exposure, and it is fully severable: drop it and nothing else changes.

## 3. Screen-by-screen mapping

All 226 target screens are mapped, with every information item and action individually placed.

| Cluster | Screens | Items placed | Tests touched | File |
|---|---:|---:|---:|---|
| Auth funnel | 33 | 253 | 27 | `redesign-plan/map-auth.md` |
| Shell and Dashboard | 43 | 427 | 29 | `redesign-plan/map-shell-dashboard.md` |
| Schedule, all 7 pages | 38 | 869 | 25 | `redesign-plan/map-schedule.md` |
| Projects, Crews, Equipment, Materials | 26 | 389 | 29 | `redesign-plan/map-operations.md` |
| Field, DelayIQs, Reports, Map, TimeCard | 47 | 637 | 36 | `redesign-plan/map-field-reporting.md` |
| Sales, Bookmarks, shared, AI | 48 | 963 | 16 | `redesign-plan/map-sales-shared-ai.md` |
| **Total** | **235** | **3,538** | **162** | |

Each entry gives the screen as it is today, what it becomes, where every figure and action lands,
its empty, loading, error and add-on-lock states, its motion, and which tests it touches.

**Nothing is removed.** Where a mapping argues something should go, it is listed under "proposed
removals, needs approval" rather than dropped. Those are collected in section 6 below.

## 4. Motion

`redesign-plan/motion-plan.md`, 1,567 lines. Every item carries an exact duration, easing, and the
token in `design-tokens.css` that holds it.

The governing idea: **motion re-scales on amplitude, not on time.** The interaction band carries
over at 1:1, because 0.25s feels the same on a 13px row as on a 96px hero. What compresses is
distance.

Four rules came out of it that are worth stating here:

- **No page transitions.** There is no router; the shell renders once for all 23 routes and never
  remounts, so a route change has nothing to animate. Attempting one would fight the reveal
  observer, which is one-shot by contract.
- **The 8% rule.** A reveal's shift may not exceed 8% of the revealed element's own height. At a
  12px shift that licenses anything 150px or taller, which is why panels reveal and table rows do
  not.
- **Stagger bands, not items.** The repo already does this correctly in the Month view, which
  staggers 42 cells in 6 bands by week index, and incorrectly elsewhere. The correct pattern wins.
- **To reduce a page's reveals, delete the `data-reveal` attribute, never the CSS.** The hidden
  rest state is gated on the attribute plus `.dx-ready`, so removing the CSS leaves elements
  invisible. This is the trap that has bitten this repo before.

Reduced motion extends the existing 10 blocks rather than replacing them. Recharts animation is a
prop rather than CSS, so `prefers-reduced-motion` never reaches it; that is called out as a known
gap rather than papered over.

## 5. Settings

`redesign-plan/settings-plan.md`, 1,533 lines. All 14 categories stay reachable and every field,
toggle, select, plan card, seat control, invite row, danger-zone action, validation message and
helper line is accounted for.

- The card licence is applied and counted: Billing goes from 14 resting boundaries to 8,
  Preferences from 6 to 0, with 19 panel frames and 28 header frames removed across 14 views.
- The eyebrow graft applies here too. Settings already has five eyebrow-shaped roles and the rail
  group headings are already close to the target, making this the one place the app already speaks
  the language.
- **Exactly one heading is renamed**, listed old to new: Preferences' "Workspace defaults" becomes
  "Opening BuildFlow", because it currently collides in name, group and generated slug with a
  General heading.
- The narrow layout below 900px is designed properly rather than by subtraction. Today it is a
  horizontally scrolling category strip with no scroll affordance.
- `settings.test.tsx:179`'s two-`aria-current` requirement is scoped `within(getByLabelText(
  "Settings categories"))`, so it is a contract on 15 controls in one container and survives.

## 6. What needs your approval

Everything below changes behaviour or copy, so none of it ships without a yes.

1. **Nine dialog titles come off the serif.** Correcting my Phase 1 error: `--wx-serif` is not
   dead. The project dialog title renders Iowan Old Style at **42px**, verified in the browser, and
   the crew, equipment and material dialog headings at 24px. That is the largest display type in
   the signed-in product, in a language that is otherwise Inter-only. Retiring it is a visible
   change to nine titles.
2. **The three unconfirmed destructive actions get confirmations.** Removing a teammate,
   withdrawing an invite and one other have no confirmation step today. Adding one changes
   behaviour.
3. **Two dead controls get a disabled treatment.** Quick Actions "More" and Apps "Add App" have no
   handler. They stay rendered but stop promising an action. The alternative is to remove them.
4. **The notification panel's empty state** needs new copy; a fresh workspace currently shows an
   empty 420px card. Any wording is new, so it is flagged rather than written.
5. **Settings rejoining the top bar** (see section 2), which is the one item with real test
   exposure and is severable.
6. **Two pre-existing bugs the re-skin would otherwise prettify.** Opening a bookmarked schedule
   view is a no-op in-app, and the release pill renders unstyled on all six schedule view pages.
   Both are recorded in the inventory. Fixing them is a behaviour change; leaving them means
   polishing a dead control.

Two things I am explicitly **not** proposing to fix, per your Phase 4 decision: `--wx-amber` at
`#0032b0` and `--tc-amber` at `#0b4ae8`, both blues. Be aware the chrome flip makes them louder,
because a blue "Planned" badge beside the blue accent is more visible on paper than against navy.

## 7. Where this honestly falls short

The winning concept's own list, kept because it is the truest part of it:

- **No product window.** The Welcome Page's signature move, a mock floating in a `#faf8ee` stage
  over an animated mesh, has no in-app equivalent and this plan does not invent one.
- **No display type anywhere.** The largest thing on any app page is 26px; the Welcome Page's
  smallest display size is 38px. Signing in drops the type about 3.7x. That is inherent to 13px
  rows.
- **No rhythm.** 27px between cards is not 108px between sections. The app will always feel
  tighter, not merely smaller. Rhythm is the one dimension that does not survive translation.
- **The rail still hides its labels.** A 56px icon rail with tooltips is less legible than a worded
  nav. It is kept because the 56px literals, the flyout arithmetic and the harness's navigation
  path all stand on it. Editorial was right that a labelled sidebar would read closer to the
  marketing site, and right that the test cost is real.
- **The gradient trio appears once**, on a 36px button, where the marketing page makes it a
  signature across three places.
- **The 24 token namespaces survive.** Nothing is collapsed and `--wx-*` is not promoted to
  `:root`, because that is not inert. Reconciliation stays Phase 4.

## 8. Order of implementation

Each step ends with the app working, the build green and the suite passing. Nothing proceeds on a
red suite.

| # | Step | Why here |
|---|---|---|
| 0 | Re-measure `.gantt-frame`'s `calc(100vh - 336px)` in the browser | The 336px is today's chrome summed; the h1 grows. Guessing overflows every load. |
| 1 | Append the `--bf-*` tokens the plan adds; delete `sidebar-redesign.css` | Pure addition plus a proven-dead deletion. |
| 2 | `app-shell-daylight.css` and the `bf-shell` class: chrome, rail, flyout, menus, palette | The kill switch exists from here on. |
| 3 | Base primitives: buttons, inputs, cards, badges, tables, modals | Everything downstream inherits these. |
| 4 | Dashboard and the panel board | Highest-traffic surface; the board's stored-layout question is settled here. |
| 5 | Auth funnel | Deliberately early: it is the highest test risk, so it gets the most remaining runway. |
| 6 | Schedule, all seven pages | Densest surfaces, and `boundary.test.ts` guards them. |
| 7 | Projects, Crews, Equipment, Materials | Already closest to the target language. |
| 8 | Field, DelayIQs, Reports, Map, TimeCard | Reports takes the biggest change and has the least test cover. |
| 9 | Sales, Bookmarks, shared index chrome, AI surfaces | Shared primitives are settled by now. |
| 10 | Settings | Largest single area; benefits from every primitive being final. |
| 11 | Motion pass | Layouts must be stable first, per your brief. |
| 12 | Verification against `REDESIGN_INVENTORY.md` | 4,890 checkboxes, then build, lint, types, tests, and three widths. |

Two operational notes. The other Claude session in this repo has been editing `schedule.css`, six
schedule components, `server/src/database.ts` and CI within the last few hours, and steps 2, 3 and
6 touch the same files; that session should pause or we should agree file ownership before step 2.
And the 98 at-risk items the mappings identified are each pinned to a file, a line and a failure
mechanism; they are the review checklist for each step, not a preamble to be skimmed.

## 9. Reading order

| If you want | Read |
|---|---|
| The shell design in full | `redesign-plan/concept-preserve.md` |
| Why the others lost | `concept-canvas.md`, `concept-hybrid.md`, `concept-editorial.md` |
| What happens to a specific screen | the matching `redesign-plan/map-*.md` |
| The motion contract | `redesign-plan/motion-plan.md` |
| Settings | `redesign-plan/settings-plan.md` |
| The measured design language | `DESIGN_TOKENS.md` |
| The acceptance checklist | `REDESIGN_INVENTORY.md` |
