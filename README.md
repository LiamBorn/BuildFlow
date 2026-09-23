# BuildFlow

Construction production scheduling & field command center — coordinate crews, project phases, materials, field updates, and delays from one place.

## Monorepo layout

| Path | What |
|------|------|
| `client/` | Vite + React web app — the HUD plus the marketing / welcome site |
| `server/` | Express + SQLite (`sql.js`) API |
| `shared/` | Types shared between client and server |
| `admin-portal/` | Standalone internal admin console (Vite) |
| `sales-desk/` | Standalone sales & support CRM console (Vite) |

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
npm run typecheck  # tsc across all five projects — the one that checks everything
npm run lint       # eslint across all five
npm test           # every suite (see the note below)
npm run build      # production build: shared, then the client
npm run test:perf  # the CPM wall-clock targets, on a quiet machine
```

Two things worth knowing before you trust a green run.

`npm run build` type-checks **shared and the client only**, because those are the
two it builds. The server and the two consoles are covered by `npm run typecheck`,
not by the build.

`npm test` is an `&&` chain: the workspaces run first, and if any of them fails,
admin-portal and sales-desk never run at all. A failure early on therefore hides
whatever came after it. Run a project on its own when you want a complete answer:

```bash
npm --workspace client run test
npm --prefix admin-portal test
```

And read the exit code, not the last line — `npm test | tail` reports the exit
code of `tail`, which is always 0.

The client suite is capped at four workers (`client/vite.config.ts`). On an
8-core machine that is both faster and more reliable than the default: a full run
uncapped failed nine unrelated tests on timeouts and took 129s, and capped it
passes in ~85s.

## Data layer

The API uses SQLite via `sql.js`, seeded with demo data on first boot. Schema changes are versioned migrations (SQLite `user_version`) applied to every store; backups snapshot to `server/data/backups/`. The `server/data/` directory is gitignored.
