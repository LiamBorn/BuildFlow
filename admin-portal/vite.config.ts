import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone BuildFlow Admin Portal. It's its own site/app, but stays LINKED to
// BuildFlow: every /api/* call is proxied to the BuildFlow backend on :4300, so
// the panel reads live workspace data with no CORS setup (same pattern as the
// HUD client).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5480,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4300"
    }
  }
});
