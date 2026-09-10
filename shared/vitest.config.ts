import { defineConfig } from "vitest/config";

// The CPM engine is pure TypeScript, so its tests run in node — no DOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    passWithNoTests: true
  }
});
