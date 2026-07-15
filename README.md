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
npm run build      # type-check (tsc) + production build (vite)
npm test           # workspace tests (vitest)
```

## Data layer

The API uses SQLite via `sql.js`, seeded with demo data on first boot. Schema changes are versioned migrations (SQLite `user_version`) applied to every store; backups snapshot to `server/data/backups/`. The `server/data/` directory is gitignored.
