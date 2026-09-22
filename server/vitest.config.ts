import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test here builds a real SQLite database from the whole migration chain
    // (25 versions and counting) before it makes a single request, which costs 1-2s
    // on its own. Run in parallel across 8 workers that setup routinely overran
    // vitest's 5s default, so the suite reported dozens of timeouts that were pure
    // contention — the same files pass one at a time. These limits are deliberately
    // generous: they are here to catch a genuine hang, not to police how long a
    // fixture takes to build.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
