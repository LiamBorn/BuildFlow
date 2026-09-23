import { defineConfig, type PluginOption } from "vitest/config";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_PORT = 4300;

/** Resolve true when something is already listening on `port`, else false fast. */
function isPortUp(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port: number, totalMs: number): Promise<boolean> {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (await isPortUp(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Ensure the BuildFlow API is running on :4300 before this dev server serves a
 * request. The frontend proxies every `/api` call there, so when the backend is
 * down — which it constantly is, because the launch configs only start a
 * frontend — every login and data fetch fails with a raw "502". This makes
 * starting ANY frontend guarantee the backend.
 *
 * Idempotent + shared: if :4300 is already up (another frontend started it, or a
 * terminal is running it), we reuse it. When we do start it, it's detached and
 * unref'd so it OUTLIVES this frontend — the next frontend on any port reuses the
 * same backend instead of the whole thing dying when one tab is closed. Logs go
 * to server/.dev-backend.log.
 */
function ensureBackend(): PluginOption {
  return {
    name: "buildflow-ensure-backend",
    apply: "serve",
    async configureServer(server) {
      const log = (msg: string) => server.config.logger.info(`\x1b[36m[backend]\x1b[0m ${msg}`);
      if (await isPortUp(BACKEND_PORT)) {
        log(`API already running on :${BACKEND_PORT} — reusing it.`);
        return;
      }

      const serverDir = path.resolve(dirname, "../server");
      const logPath = path.join(serverDir, ".dev-backend.log");
      log(`API not detected on :${BACKEND_PORT} — starting it (logs → server/.dev-backend.log)…`);

      try {
        const out = fs.openSync(logPath, "a");
        const child = spawn("npm", ["run", "dev"], {
          cwd: serverDir,
          detached: true,
          // Persist beyond this frontend; capture logs to a file since we unref.
          stdio: ["ignore", out, out],
          // Force PORT=4300: the frontend's own PORT (e.g. 5318) is in process.env,
          // and the backend reads PORT — without this override it binds the
          // frontend's port and the /api proxy still can't find it.
          env: { ...process.env, PORT: String(BACKEND_PORT) }
        });
        child.on("error", (err) => log(`could not start the API: ${err.message}. Start it manually: npm --prefix server run dev`));
        child.unref();

        const ready = await waitForPort(BACKEND_PORT, 30000);
        log(ready ? `API is up on :${BACKEND_PORT}.` : `API did not come up in time — check server/.dev-backend.log.`);
      } catch (err) {
        log(`failed to launch the API (${err instanceof Error ? err.message : err}). Start it manually: npm --prefix server run dev`);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), ensureBackend()],
  server: {
    // Honour a harness/CI-assigned PORT so the dev server can be placed on a free
    // port; 5173 stays the default when nothing assigns one. The API port is
    // separate and fixed (BACKEND_PORT), so moving the frontend is always safe.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        // A clearer line than a bare 502 if the API is momentarily down/starting.
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            // eslint-disable-next-line no-console
            console.warn(`\x1b[33m[proxy]\x1b[0m /api → :${BACKEND_PORT} unreachable (${err.message}). Is the backend running?`);
            const response = res as unknown as {
              headersSent?: boolean;
              writeHead?: (status: number, headers: Record<string, string>) => void;
              end?: (chunk: string) => void;
            };
            if (response && typeof response.writeHead === "function" && !response.headersSent) {
              response.writeHead(503, { "Content-Type": "application/json" });
              response.end?.(JSON.stringify({ error: "BuildFlow API is starting or unavailable. Retry in a moment." }));
            }
          });
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    // whole-app renders take seconds on a busy machine or a CI runner; vitest's 5 s default is too tight
    testTimeout: 20000,
    /* Half the cores, not all of them.
       Nearly every file here renders the entire app into jsdom, so a worker is not a cheap
       unit of work: at one per core the suite competes with itself, and on 2026-09-23 a full
       run failed nine tests across five unrelated files — the landing drawer, Schedule
       customize, Schedule pages, Settings, the tutorial — every one of them a 20 s timeout,
       and all 149 passed when those five files were run together on their own. Failures that
       move from run to run, and vanish in isolation, are contention rather than defects, and a
       suite that goes red for reasons unrelated to your change is one people learn to ignore.
       This costs wall-clock and buys back the signal. It also leaves room for a parallel
       session's build, which is the normal state of this repo. */
    maxWorkers: 4
  }
});
