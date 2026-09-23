# BuildFlow

Construction production scheduling & field command center — coordinate crews, project phases, materials, field updates, and delays from one place.

## Monorepo layout

| Path | What |
|------|------|
| `client/` | Vite + React web app — the landing page, sign-up and login, the BuildFlow app, and the marketing site |
| `server/` | Express + SQLite (`sql.js`) API |
| `shared/` | Types shared between client and server |

## Getting started

```bash
npm install
npm run dev        # API (:4300) + client (:5173) together
```

- Client dev server: http://localhost:5173 (proxies `/api` → `:4300`)
- API: http://localhost:4300

## Configuration

All integrations run in a safe demo/log mode until configured. Copy the example env files and fill in only what you need:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

- **Email** (`server/.env`) — SMTP for notifications/waitlist/sales; `EMAIL_MODE=ethereal` gives a no-credential test inbox.
- **Billing** (`server/.env`) — Stripe secret key + per-plan price IDs for subscription checkout.
- **AI** (`server/.env`) — `ANTHROPIC_API_KEY` for real Claude answers (else demo mode).
- **Notifications** (`server/.env`) — channels + Twilio / ops recipients for delay & conflict alerts.
- **Analytics** (`client/.env`) — Plausible / GA4 / PostHog.

## Build & test

```bash
npm run typecheck  # tsc across shared, the client and the server — the one that checks everything
npm run lint       # eslint across all three
npm test           # every workspace's suite (see the note below)
npm run build      # production build: shared, then the client
npm run test:perf  # the CPM wall-clock targets, on a quiet machine
```

Two things worth knowing before you trust a green run.

`npm run build` type-checks **shared and the client only**, because those are the
two it builds. The server is covered by `npm run typecheck`, not by the build.

`npm test` runs each workspace's suite in turn and keeps going when one fails, so
one run reports every workspace, and it exits non-zero if any of them failed. To
look at one project on its own:

```bash
npm --workspace client run test
npm --workspace server run test
```

And read the exit code, not the last line — `npm test | tail` reports the exit
code of `tail`, which is always 0.

The client suite is capped at four workers (`client/vite.config.ts`). On an
8-core machine that is both faster and more reliable than the default: a full run
uncapped failed nine unrelated tests on timeouts and took 129s, and capped it
passes in ~85s.

## Data layer

The API uses SQLite via `sql.js`, seeded with demo data on first boot. Schema changes are versioned migrations (SQLite `user_version`) applied to every store; backups snapshot to `server/data/backups/`. The `server/data/` directory is gitignored.

## Removed from the repo

On 2026-09-23 the repo was cut down to the landing page, sign-up and login, the
BuildFlow app and its marketing site. Removed: the Dev Admin Panel (`admin-portal/`),
the Sales & Support Desk (`sales-desk/`) and the API routes only it used
(`/api/sales/*`, `/api/support/*`), and the planning and design documents
(`docs/backlog.md`, `docs/motion-spec.md`, `docs/demo-video-script.md`, `design/`,
`redesign-plan/`, `REDESIGN_*.md`, `DESIGN_TOKENS.md`). The database
tables the desk used are still created, so existing rows are kept, and contact-sales
leads are still saved to `sales_leads`.

Code comments still cite `docs/motion-spec.md` and `docs/backlog.md`. Those
documents are in the history at `f847d4e`, for example:

```bash
git show f847d4e:docs/motion-spec.md
```
