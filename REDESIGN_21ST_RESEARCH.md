# Phase 2: 21st.dev research

Researched 2026-09-10 against the catalogue at https://21st.dev/community/templates, the 21st MCP
search, and the pricing page. **Nothing was downloaded, purchased, or signed in to.**

## What your key actually buys

The API key added to this session is on the **free tier**.

| Capability | Free tier | Builder plan |
|---|---|---|
| Search and previews | Unlimited | Unlimited |
| Component code retrieval | **2 per day** | Unlimited |
| Template download | **Paid plan only** | Unlimited |
| Theme CSS | Free | Free |
| AI generation (sketch, iterate) | Disabled | Builder + AI only |

Builder is **$6 per month billed yearly**. Builder + AI is $15. Team is $7.50 per seat.

One important distinction the catalogue makes: templates marked **"Included in Plan"** are
open-source projects that 21st rehosts at a pinned commit, and every one of the candidates below
says so on its page: *"We host the code ourselves, pinned to one commit. Downloading it is part of
a paid plan."* Templates marked with a **price** are sold by their authors and are **not** covered
by any plan.

**This is the rule-4 stop.** Every template worth using here needs either a plan or a purchase. Per
your instructions I stopped rather than routing around it. I want to be precise about the choice
you have, though: all three shortlisted templates are MIT-licensed with their upstream GitHub
repository named on the 21st page, so the code is legitimately free from the author directly. Going
to GitHub is not a licence workaround; it is the licence working as intended. But it does mean not
using 21st for the thing you connected it for, so it is your call, not mine.

## The constraint that matters more than cost

Every 21st template and every component install assumes Tailwind and shadcn:

```
npx shadcn@latest add "https://21st.dev/r/<author>/<component>"
```

BuildFlow's client has none of that. `client/package.json` has no `tailwindcss`, `postcss`,
`autoprefixer`, `class-variance-authority`, `clsx` or `tailwind-merge`, and there is no
`components.json` or `tailwind.config`. What it has instead is 60,798 lines of hand-written CSS
across 57 stylesheets loaded in a hand-tuned order that ends with a comment reading *"loads last so
it wins"*, 24 CSS variable namespaces, 249 inline style objects (203 of them in `App.tsx`), and a
scroll-reveal engine that adds a class imperatively so a dynamic `className` leaves elements
invisible. Appendix B of `REDESIGN_INVENTORY.md` has all ten obstacles with the evidence for each.

The repo also already has a **proven recipe for using 21st components without Tailwind**: nine
components in `client/src/components/ui/` were ported by rewriting them as inline styles plus one
scoped stylesheet, with the shadcn tokens mapped onto `--wx-*`. That recipe is the reason option 3
below is real rather than a consolation prize.

## Shortlist

### 1. Shadcn Dashboard and Landing — recommended for the app shell

https://21st.dev/community/templates/shadcn-dashboard-landing

- **Upstream:** `shadcnstore/shadcn-dashboard-landing-template`, MIT, pinned at `65fc112`
- **Why it fits:** it is the only candidate that **ships a Vite build alongside the Next.js one**,
  which is this repo's bundler. It is also the only one whose premise is BuildFlow's exact problem:
  a dashboard and a matching landing page as one design, which is precisely the seam you are
  trying to close.
- **Covers:** app shell, sidebar navigation, dashboard layout, and the landing page that pairs with
  it, so the visual bridge is designed rather than improvised.
- **Does not cover:** anything scheduling. No Gantt, Kanban, matrix, week board or calendar. No
  drag-and-resize panel board. Nothing for 23 routes, six schedule views, or a 17-category
  settings screen.
- **Cost:** plan required to download from 21st; free from GitHub under MIT.

### 2. Next Shadcn Admin Dashboard — recommended for auth, tables and settings

https://21st.dev/community/templates/next-shadcn-admin-dashboard

- **Upstream:** `arhamkhnz/next-shadcn-admin-dashboard`, MIT, pinned at `6dd9ab0`
- **Why it fits:** it carries the three things candidate 1 is thin on and that BuildFlow is heavy
  on. Its **auth screens** matter now that the 7-page funnel is in scope. Its **data tables** map
  onto the Sales hub indexes, the List schedule view and TimeCard. Its **theme presets** show a
  worked pattern for the palette reconciliation.
- **Covers:** multiple dashboard layouts, auth screens, data tables, theme presets.
- **Does not cover:** it is Next.js only. The layouts and component structure port; the app router
  and any server components do not. No scheduling views here either.
- **Cost:** plan required to download from 21st; free from GitHub under MIT.

### 3. Component-level assembly on the repo's existing recipe — recommended if Tailwind is not adopted

https://21st.dev/community/components

- **Why it fits:** it is the only option with **zero dependency risk**, and the repo has already
  done it nine times. You keep the working cascade, the drag engine, the reveal system and the
  test suite, and spend the effort on the design rather than on a migration.
- **Covers:** the individual pieces, picked per need. Concrete candidates found in search:
  `arunjdass/dashboard-sidebar` (dual-theme shell with collapsible multi-tier nav),
  `unlumen/sidebar-001` (spring hover highlight, animated active indicator, drag-to-resize),
  `originui/table` and `7ovr/team-members-data-table` (sortable, selectable, bulk actions,
  column visibility, pagination), `cnippet-dev/settings-sidebar-accordion` (grouped settings nav),
  `cnippet-dev/v-skeleton-8` (a skeleton that mirrors a sidebar dashboard, useful for the
  loading state the inventory flagged as missing a design pass).
- **Does not cover:** no overall art direction. The shell composition and page rhythm would come
  from `DESIGN_TOKENS.md` and the Welcome Page, not from 21st.
- **Cost:** the free tier's 2 retrievals per day makes this impractical at any pace. Builder at $6
  per month makes it unlimited. This is the option where the $6 genuinely pays for itself.

## Ruled out, with reasons

**Open SaaS** (https://21st.dev/community/templates/open-saas, `wasp-lang/open-saas`, MIT). It is a
full-stack starter built on Wasp with Prisma, its own auth and Stripe integration. BuildFlow
already has Express, sql.js with a versioned migration chain, scrypt auth, and Stripe. Adopting it
means replacing the backend, which your rule 2 forbids. Its admin dashboard alone is not better
than candidates 1 or 2.

**Qronos AI/SaaS Product Template** (`$69`, by Monolyth Dev). Two problems. It is a per-template
purchase not covered by any plan, and the catalogue classifies it as a **website template**, not a
dashboard. Its scheduler theming is marketing-page styling, and BuildFlow's marketing pages are
already the design reference. Buying it would be paying for the half you do not need.

## Recommendation

**Two templates as reference, components as the build material, and one decision from you.**

Candidates 1 and 2 are worth reading either way, because between them they cover the shell, auth,
tables and settings, and reading them costs nothing but time. Neither can be dropped in: no
template in the catalogue has a Gantt chart, a crew-by-day matrix, a resizable panel board, or a
23-route information architecture, which is most of BuildFlow.

That leaves the real fork, which is the Phase 3 decision:

**Option A: adopt Tailwind v4 alongside the existing CSS.** Unlocks templates and components
directly. Tailwind v4 can import its theme and utilities layers without preflight, which is what
makes coexistence plausible at all, but that needs proving in a spike before anyone relies on it.
The risk is real and it is concentrated in the 249 inline style objects that would silently beat
any utility class, and in the order-dependent cascade.

**Option B: no Tailwind. Port components with the recipe the repo already uses.** Lower risk,
slower per component, and 21st becomes a source of patterns rather than a foundation. This is what
the repo has actually been doing successfully.

**Option C: Tailwind confined to new shell components only,** with a prefix, and the existing pages
untouched until each is deliberately migrated. Highest ceiling, most moving parts.

My recommendation is **B, with $6 spent on Builder** so component retrieval stops being rationed.
It matches how this codebase already works, it puts the design effort into rhythm and type where
`DESIGN_TOKENS.md` shows the actual gap is, and it does not bet a 39,194-line file and a 300-test
suite on a cascade migration. If you want the templates' shell wholesale rather than as reference,
that is option A and I will scope it honestly, including what it would put at risk.

## A note on the 21st MCP tools

`search` works well and is free. `get_inspiration` was not useful here: it returned this account's
existing bookmarks ranked by stopword overlap, with `contextApplied: false` and rationales like
"Matches with, icon, mode". `generate` and `iterate_generation` are unavailable on the free tier.
So the practical free surface is search plus preview images, which is enough for shortlisting and
not enough for building.
