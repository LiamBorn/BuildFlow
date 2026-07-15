// Throwaway check of the AI endpoint in DEMO mode. Run: `npx tsx _aicheck.ts`
import { createApp } from "./src/app.js";
import { isAiConfigured, buildAiContext } from "./src/ai.js";

const app = await createApp({ dataFile: "./data/_aitest.sqlite", reset: true });
const server = app.listen(4398);
const base = "http://localhost:4398";
const ok = (c: boolean) => (c ? "PASS" : "❌ FAIL");

async function post(path: string, body: unknown) {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

try {
  const health = await fetch(base + "/api/health").then((r) => r.json());
  console.log(ok(health.ok === true), "server boots + health:", JSON.stringify(health));
  console.log(ok(isAiConfigured() === false), "no ANTHROPIC_API_KEY here → isAiConfigured()=false");

  const ask = await post("/api/ai/ask", { question: "What's at risk this week?" });
  console.log(ok(ask.status === 200 && ask.json?.mode === "demo" && !ask.json?.answer), "POST /api/ai/ask (no key) → 200 {mode:'demo'}:", ask.status, JSON.stringify(ask.json));

  const empty = await post("/api/ai/ask", { question: "   " });
  console.log(ok(empty.status === 400), "empty question → 400:", empty.status);

  // The context the model would receive is grounded in real workspace data.
  const anyStore = (app.locals.storeManager?.main) as any;
  if (anyStore) {
    const ctx = buildAiContext(anyStore.bootstrap());
    const grounded = ctx.includes("Projects (") && ctx.includes("Crews (") && ctx.length > 120;
    console.log(ok(grounded), "buildAiContext() is grounded in real data:", ctx.split("\n")[0], `(${ctx.length} chars)`);
    console.log("   context preview:", JSON.stringify(ctx.slice(0, 180)) + "…");
  }
} catch (e) {
  console.error("❌ RUNTIME ERROR:", e);
} finally {
  server.close();
  process.exit(0);
}
