import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone BuildFlow Sales & Customer-Service Desk. It's its own site/app, but
// stays LINKED to BuildFlow: every /api/* call is proxied to the BuildFlow backend
// on :4300, so the console reads & writes live leads / tasks / support threads with
// no CORS setup (same pattern as the HUD client and the admin portal).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5490,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4300"
    }
  }
});
