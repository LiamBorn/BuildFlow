/* =========================================================================
   Environment loader — MUST be the first import in index.ts.

   Populates process.env from server/.env before any other module (app.ts,
   email.ts) evaluates, so SMTP_* / SALES_EMAIL / URL config is available at
   import time. Uses Node's built-in env-file parser (Node 20.12+), so there
   is no dependency to install. Safe to run with no .env present.

   Copy .env.example → .env and fill it in to configure email delivery.
   ========================================================================= */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// server/.env lives one level up from this file (server/src/loadEnv.ts).
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    console.warn(`[env] could not load ${envPath}:`, error instanceof Error ? error.message : error);
  }
}
