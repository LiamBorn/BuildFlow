# BuildFlow on Replit

One Replit app runs all of BuildFlow's customer-facing side on one address:

- the landing page and the marketing site,
- signing in and registering,
- the program itself (Dashboard, Schedule, Projects, Crews and the rest),
- and the API behind them, under `/api`.

It is one process. `npm run build` writes the pages to `client/dist`. `npm start`, with
`NODE_ENV=production`, runs the API server, which serves those pages as well
(`server/src/serveClient.ts`). On Replit it listens on port 5000, mapped to the public port 80
(`.replit`); anywhere else it defaults to 4300.

Those are the only apps in the repository: the Dev Admin Panel and the Sales & Support Desk
consoles left it on 2026-09-23 (README, "Removed from the repo").

## Getting it onto Replit

1. On Replit, **Create App → Import from GitHub** and choose `LiamBorn/BuildFlow`. The repository is
   private, so Replit asks for access to it.
2. **Switch to the branch `redesign/dashboard-21st`** in Replit's Git pane. New work lands on that
   branch; `main` was brought up to it on 2026-09-23 and only moves when someone moves it.
   Alternatively, make `redesign/dashboard-21st` the default branch on GitHub before importing.
3. Press **Run**. The first run installs, builds and starts, which takes a few minutes. The preview
   shows the landing page.
4. To give it a public address, use **Publish → Reserved VM**. The build and run commands come
   from `.replit`.

**If Replit's Agent offers to change the setup, decline.**
- **Its own sign-in (Replit Auth, which is Clerk).** BuildFlow has its own sign-in and register.
- **A new run setup or more ports.** A published Replit app may expose exactly one port, the one on
  80. An extra port, or a server on a port that is not mapped to 80, fails the publish.

On 2026-09-24 the Agent had done all of these in the imported copy, and that copy was reset to
GitHub.

## Secrets (Tools → Secrets)

None is needed for a first look. Without them, the AI gives demo answers, emails are written to
the log instead of sent, billing is off, and Google and Microsoft sign-in say they are not switched
on.

| Secret | What it turns on |
| --- | --- |
| `BUILDFLOW_PUBLIC_URL`, `BUILDFLOW_CLIENT_URL` | The app's own address (for example `https://buildflow.<you>.replit.app/`), used in email links, sign-in return addresses and the weekly digest. **Set these once the address exists.** |
| `ANTHROPIC_API_KEY` | BuildFlow AI answers for real. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM` | Emails really go out: verification, invites, resets, digests. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Paid plans. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Sign-in and Meetings calendars with Google and Microsoft. Register these redirect URIs with the provider, using the app's address in place of `<address>`: `<address>/api/auth/oauth/google/callback`, `<address>/api/auth/oauth/microsoft/callback`, `<address>/api/calendar/google/callback` and `<address>/api/calendar/microsoft/callback`. |
| `OPS_ADMIN_TOKEN` | Opens the ops endpoints under `/api/ops` (take and list backups, platform counts, runtime stats), sent as the `x-ops-token` header. In production, leaving it unset keeps them closed. |

`server/.env.example` describes every setting. Never put real values in the repository; Replit's
Secrets are where they belong.

## Know this before real customers use it

- **The data is still SQLite files** in `server/data`: one main file and one per workspace.
  When `DATABASE_URL` is present, Replit PostgreSQL also stores each complete file as a `bytea`
  image. On startup, the server loads the saved images before opening SQLite; only on the first
  start with no saved images does it import existing local files. The development and published
  apps use their separate Replit PostgreSQL databases, so their users and workspaces stay separate.
  The schema is recorded in `server/sql/file-images.sql` and has been applied to the development
  database. Publish applies that development schema to the separate production database; do not
  choose the Publish option that overwrites production data with development data. Do not enable
  the app before the schema is present; an unreachable database
  stops startup rather than allowing empty data. File changes are coalesced and retried, deletes
  remove the saved image, and shutdown flushes pending writes. A newer server fences older
  servers from writing stale images during a publish. Backups remain local in `server/data/backups`;
  the restore CLI updates the saved image after restoring while the API is stopped.
  Without `DATABASE_URL` (or during tests), BuildFlow remains file-only.
- **A visitor who opens the program without signing in lands in the shared demo workspace.** Every
  such visitor sees the same one, including whatever the others changed in it.
