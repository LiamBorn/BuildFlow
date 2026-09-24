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
| `BUILDFLOW_DATA_FILE` | Where the databases and their backups live. Unset means `server/data`, which a published app does not keep — see below. |

`server/.env.example` describes every setting. Never put real values in the repository; Replit's
Secrets are where they belong.

## Know this before real customers use it

- **SQLite is the working copy; PostgreSQL is the durable copy** when `DATABASE_URL` is present.
  The main account/demo image and each workspace image are stored as byte-for-byte `bytea`
  images, not relational BuildFlow tables. Startup hydrates the local working files before
  opening stores. The first PostgreSQL-backed start imports existing local workspace images;
  later starts use PostgreSQL images rather than stale local workspace files. Workspace saves
  and deletions are queued, retried, flushed on shutdown, and fenced against older servers.
  The schema is in `server/sql/file-images.sql` and must exist in **development** before running.
  A missing/unreachable PostgreSQL database stops startup rather than opening disk-only data.
  Without `DATABASE_URL` (or during tests), BuildFlow remains file-only. Backups stay local
  under the configured data directory and are not copied to PostgreSQL; they are not durable
  restore points for a published app.
- **Before a future Publish:** development and production are separate databases. Publish the
  two-table schema through Replit's schema promotion; never select an option that copies
  development records over production. If a previous production VM has files that are *only
  on its disk*, export them separately **before** replacing that VM and reconcile them with
  the production PostgreSQL images. This workspace currently has no production database
  attached, so production-only disk files cannot be inventoried here. Do not import development
  records into production.
- **Restore:** stop the API, run `npm --workspace server run restore` to list local snapshots,
  then `npm --workspace server run restore -- --latest` (or specify a workspace base or snapshot
  filename). The CLI verifies the selected SQLite image, preserves the replaced image as a new
  local snapshot, and commits only the restored workspace image to PostgreSQL before success.
  Do not swap SQLite files while the API is running: its in-memory stores would overwrite them.
- **`BUILDFLOW_DATA_FILE` sets the local data location.** It moves the main database, per-workspace
  databases, and local backups together. This setting does not make the files durable by itself;
  PostgreSQL makes the workspace files durable when a database is attached.
- **A visitor who opens the program without signing in lands in the shared demo workspace.** Every
  such visitor sees the same one, including whatever the others changed in it.
