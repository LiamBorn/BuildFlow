/* =========================================================================
   BuildFlow AI — real Claude behind the "Ask BuildFlow AI" prompt.

   Uses the official Anthropic SDK (claude-opus-5, adaptive thinking, streamed).
   Mirrors email.ts: without a Claude credential (see aiConnection) it runs in
   "DEMO MODE" and the client falls back to its built-in simulated answers, so the
   whole flow works before any credential is added. The SDK is imported lazily so
   the server runs fine even if the package isn't installed until you go live.
   ========================================================================= */
import {
  tradeProfileFor,
  type BusinessTypeId,
  type BootstrapPayload,
  type CreateProjectInput,
  type CreateJobInput
} from "@buildflow/shared";
import type Anthropic from "@anthropic-ai/sdk";

/* Claude Opus 5 — the current generation, and the same price per token as the Opus 4.8 this
   asked for before ($5/$25 per MTok). ANTHROPIC_MODEL still overrides it, so an operator can
   pin an older one or move to a cheaper tier without a deploy.

   Note for anyone changing this: the `thinking: { type: "adaptive" }` below is NOT optional
   decoration. On Opus 4.8 and 4.7, omitting `thinking` runs the request with thinking OFF;
   Opus 5 has it on by default. Setting it explicitly is what makes this behave the same
   whichever of the two the env var names. `budget_tokens` is rejected outright on both. */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
/** The model every BuildFlow AI call uses: the website's questions and imports, and the Mac's voice. */
export const AI_MODEL = MODEL;

/**
 * How many questions a person may ask BuildFlow AI in an hour, whichever door they come in by: the
 * website's "Ask BuildFlow AI" and the Mac's voice (desktopAsk.ts) count against ONE allowance, so a
 * second door is not a second forty. Each question is a paid call once credit is on the account.
 */
export const AI_QUESTION_LIMIT = { bucket: "ai-ask", max: 40, windowMs: 60 * 60 * 1000 } as const;

// A project + its jobs, ready to create through the backend (matches the client's
// ImportProjectSpec). crewId is optional (round-robin assignment).
export type ImportJobSpec = Omit<CreateJobInput, "projectId"> & { crewId?: string };
export type ImportProjectSpec = { input: CreateProjectInput; jobs: ImportJobSpec[] };
export type ImportResult = { mode: "live" | "demo"; plan?: ImportProjectSpec[] };

/**
 * Where BuildFlow AI's calls go, read from the environment. There are two ways in:
 *
 * - The operator's own Anthropic credential (ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN). The SDK
 *   reads it itself and calls Anthropic directly. It wins when present, because setting it is
 *   a deliberate choice to use that account.
 * - Replit AI Integrations ("Anthropic, Replit managed"). Replit hands the app
 *   AI_INTEGRATIONS_ANTHROPIC_API_KEY and AI_INTEGRATIONS_ANTHROPIC_BASE_URL — a key for
 *   Replit's endpoint and that endpoint's address — and bills the calls to the Replit
 *   account's credits. Both are needed: the key without its address would go to Anthropic,
 *   which does not know it.
 *
 * null when neither is configured, which is demo mode.
 */
export function aiConnection(
  env: NodeJS.ProcessEnv = process.env
): { via: "anthropic" | "replit"; options: { apiKey?: string; baseURL?: string } } | null {
  if (env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()) return { via: "anthropic", options: {} };
  const apiKey = env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim();
  /* Replit's address ends in /v1, for clients that append only the endpoint. The Anthropic SDK
     appends /v1/messages itself, so with it left in, every request went to …/v1/v1/messages and
     came back 404 — on the published app, 2026-09-24, until this. */
  const baseURL = env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  if (apiKey && baseURL) return { via: "replit", options: { apiKey, baseURL } };
  return null;
}

/** True when a Claude credential is configured, either way aiConnection accepts. */
export function isAiConfigured(): boolean {
  return aiConnection() !== null;
}

/** The SDK's client class. A type only: the module itself is imported lazily, in aiClient. */
type AnthropicSdk = typeof Anthropic;

/**
 * A client on whichever connection aiConnection found, with the SDK it came from (for its error
 * classes), or null in demo mode. The SDK is imported here, lazily, so the server runs without it.
 */
export async function aiClient(): Promise<{ client: InstanceType<AnthropicSdk>; sdk: AnthropicSdk; via: "anthropic" | "replit" } | null> {
  const connection = aiConnection();
  if (!connection) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return { client: new Anthropic(connection.options), sdk: Anthropic, via: connection.via };
}

/**
 * The refusal fallback, for a request that can take it, or null.
 *
 * Claude Opus 5 runs safety classifiers, and one can decline a request: HTTP 200 with
 * `stop_reason: "refusal"`, not an error. Anthropic's recommendation for this model is to opt into
 * server-side fallbacks, and `"default"` lets Anthropic pick the substitute by the refusal's category
 * (a cyber-category one goes to Claude Opus 4.8) instead of this code pinning a model that will one
 * day be retired. A declined request is then answered by the fallback inside the same call and the
 * same stream; a refusal that still comes back means the whole chain declined.
 *
 * Only on Anthropic's own API, and only for the models that have the classifiers. Fallbacks are a
 * Claude API feature: the Replit AI Integrations endpoint is a proxy that nothing here has seen pass
 * the beta through, and a 400 there would silence every voice answer. An ANTHROPIC_MODEL that names
 * an older model gets nothing to fall back from.
 */
export function refusalFallback(via: "anthropic" | "replit", model: string = MODEL): { betas: string[]; fallbacks: "default" } | null {
  if (via !== "anthropic") return null;
  if (!/^claude-(opus-5|fable-5|mythos-5)/.test(model)) return null;
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

/**
 * What a failed call means for the person asking.
 *
 * - "not-connected": retrying will not help until the operator does something. The key is wrong or
 *   revoked (401), not allowed (403), the model is not available to the account (404; Replit's
 *   production endpoint answered exactly that for claude-opus-5 on 2026-09-25), or the account cannot
 *   pay (a 402 billing_error, or the 400 "Your credit balance is too low" this account answered the
 *   same day -- a plain invalid_request_error, whose message is the only thing that says so).
 *   This is demo mode, as much as having no key is.
 * - "aborted": we stopped it ourselves, because the person hung up.
 * - "unavailable": anything else -- overloaded, rate limited, a network failure. Worth another try.
 */
export function aiFailure(error: unknown, sdk: AnthropicSdk): "not-connected" | "aborted" | "unavailable" {
  if (error instanceof sdk.APIUserAbortError) return "aborted";
  if (error instanceof sdk.AuthenticationError || error instanceof sdk.PermissionDeniedError || error instanceof sdk.NotFoundError) {
    return "not-connected";
  }
  if (error instanceof sdk.APIError && (error.status === 402 || error.type === "billing_error")) return "not-connected";
  if (error instanceof sdk.BadRequestError && /credit balance/i.test(error.message)) return "not-connected";
  return "unavailable";
}

export type AiResult = { mode: "live" | "demo"; answer?: string };

const SYSTEM = `You are BuildFlow AI, an assistant embedded in a construction production-scheduling command center. You help project managers and superintendents run their week — crews, jobs, schedules, materials readiness, delayIQs, and schedule risk.

Answer using ONLY the workspace snapshot provided in the user message. Be concrete: reference the real project names, crews, dates, and numbers from the snapshot. Never invent projects, crews, or figures that aren't there — if the snapshot doesn't contain the answer, say so plainly.

Format for a busy field leader: open with a one-line takeaway, then 2–5 short bullet points. Keep it tight and skimmable. Plain text only (no markdown headers).`;

/**
 * A job's priority in the words the screen uses. The job panel names the stored High, Medium and
 * Normal as Mandatory, Medium and Low (2026-09-23), so an answer says "Mandatory" where the person
 * sees it.
 */
const PRIORITY_WORD: Record<string, string> = { High: "Mandatory", Medium: "Medium", Normal: "Low" };

/** Compact, model-friendly summary of the workspace the question is about. */
export function buildAiContext(data: BootstrapPayload): string {
  const lines: string[] = [];
  const cap = <T>(arr: T[] | undefined, n: number): T[] => (arr ?? []).slice(0, n);
  lines.push(`WORKSPACE SNAPSHOT (as of ${new Date().toISOString().slice(0, 10)})`);

  const projects = data.projects ?? [];
  lines.push(`\nProjects (${projects.length}):`);
  for (const p of cap(projects, 12)) {
    lines.push(
      `- ${p.name} — ${p.type}, ${p.percentComplete}% complete, ${p.scheduleHealth}, status ${p.status}, target ${p.targetCompletion}`
    );
  }

  const crews = data.crews ?? [];
  lines.push(`\nCrews (${crews.length}):`);
  for (const c of cap(crews, 12)) {
    lines.push(`- ${c.name} — ${c.specialty}, lead ${c.lead}, size ${c.size}, utilization ${c.utilization}%, status ${c.status}`);
  }

  const jobs = data.jobs ?? [];
  const atRisk = jobs.filter((j) => ["At Risk", "DelayIQed", "On Site"].includes(j.status) || j.materialsStatus === "Missing");
  lines.push(`\nJobs: ${jobs.length} total; ${atRisk.length} at-risk/delayIQed/waiting-on-materials.`);
  for (const j of cap(atRisk, 10)) {
    lines.push(
      `- ${j.name} (${j.phase}) — status ${j.status}, priority ${PRIORITY_WORD[j.priority] ?? j.priority}, materials ${j.materialsStatus}, ${j.startDate}→${j.endDate}`
    );
  }

  const delayIQs = data.delayIQs ?? [];
  if (delayIQs.length) {
    lines.push(`\nOpen delayIQs (${delayIQs.length}):`);
    for (const d of cap(delayIQs, 8)) {
      lines.push(
        `- ${(d as { title?: string; reason?: string }).title ?? (d as { reason?: string }).reason ?? "DelayIQ"} — ${(d as { days?: number }).days ?? "?"} day(s), ${(d as { severity?: string }).severity ?? ""} ${(d as { description?: string }).description ?? ""}`.trim()
      );
    }
  }

  const materials = data.materials ?? [];
  const needMaterials = materials.filter((m) => {
    const status = (m as { status?: string; readiness?: number }).status;
    return status && status !== "Ready" && status !== "Delivered";
  });
  if (needMaterials.length) {
    lines.push(`\nMaterials needing attention (${needMaterials.length}):`);
    for (const m of cap(needMaterials, 8)) {
      lines.push(`- ${(m as { name?: string }).name ?? "Material"} — ${(m as { status?: string }).status ?? ""}`.trim());
    }
  }

  const weather = data.weatherAlerts ?? [];
  if (weather.length) {
    lines.push(`\nWeather alerts (${weather.length}):`);
    for (const w of cap(weather, 5)) {
      lines.push(`- ${(w as { title?: string; summary?: string }).title ?? (w as { summary?: string }).summary ?? "Weather alert"}`);
    }
  }

  return lines.join("\n");
}

/**
 * The trade the customer runs, as a paragraph for a system prompt, so answers use the trade's own
 * vocabulary and constraints (plant slots for asphalt, pour cards for concrete, dry-in windows for
 * roofing) instead of generic construction talk. Empty when the workspace has no trade.
 */
export function tradeContext(businessType: BusinessTypeId | "" | undefined): string {
  const profile = tradeProfileFor(businessType ?? "");
  if (!profile) return "";
  return `TRADE: ${profile.aiContext}
The crews this business fields: ${profile.crewTypes.join(", ")}. Its production phases run: ${profile.phases.join(" → ")}. The ways it typically loses days: ${profile.delayIQCategories.join("; ")}. Weather rule it plans around: ${profile.weather.rule} Use this trade's units (${profile.materialUnits.join(", ")}) and terms when they fit the question.`;
}

/** The website assistant's system prompt, with the trade folded in. */
export function tradeSystemPrompt(businessType: BusinessTypeId | "" | undefined): string {
  const trade = tradeContext(businessType);
  return trade ? `${SYSTEM}\n\n${trade}` : SYSTEM;
}

/** Ask Claude a question about the workspace. Returns {mode:"demo"} (no answer)
    when unconfigured or on error, so the caller can fall back to the simulation. */
export async function askBuildFlowAI(question: string, context: string, businessType?: BusinessTypeId | ""): Promise<AiResult> {
  try {
    const ai = await aiClient();
    if (!ai) return { mode: "demo" };
    const stream = ai.client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" }, // snappy, cost-aware for an interactive Q&A
      system: tradeSystemPrompt(businessType),
      messages: [{ role: "user", content: `${context}\n\nQuestion: ${question}` }]
    });
    const message = await stream.finalMessage();
    const answer = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { mode: "live", answer: answer || "I couldn't produce an answer for that one." };
  } catch (error) {
    console.error("[ai] request failed:", error instanceof Error ? error.message : error);
    return { mode: "demo" }; // fall back to the built-in simulation
  }
}

/* ── Schedule import (Claude vision) ─────────────────────────────────────────
   Read uploaded image(s) of the user's OTHER scheduler and extract a project/job
   plan. Returns {mode:"demo"} when unconfigured / unreadable / on error, so the
   client falls back to its built-in sample plan. */
const IMAGE_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
type DataUrlImage = { media_type: string; data: string };
function parseDataUrl(url: string): DataUrlImage | null {
  const m = /^data:(.+?);base64,(.*)$/s.exec(url);
  if (!m) return null;
  const media_type = m[1].split(";")[0];
  return IMAGE_MEDIA.has(media_type) ? { media_type, data: m[2] } : null;
}

const MATERIALS = ["Delivered", "Ordered", "Missing", "Waiting on Delivery"] as const;
const PRIORITIES = ["High", "Medium", "Normal"] as const;
function pick<T extends readonly string[]>(list: T, value: unknown, fallback: T[number]): T[number] {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  const hit = list.find((o) => o.toLowerCase() === v) as T[number] | undefined;
  if (hit) return hit;
  if (v.includes("ready")) return "Delivered" as T[number];
  return fallback;
}
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const soon = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const IMPORT_SYSTEM = `You extract construction schedules from images. The user uploads a photo, screenshot, or export of their CURRENT scheduling tool (Excel, MS Project, Procore, Smartsheet, a printed Gantt chart, or a whiteboard). Read it and return the projects and their jobs/activities so they can be rebuilt in BuildFlow.

Respond with ONLY a JSON object — no prose, no markdown, no code fences — of exactly this shape:
{"projects":[{"name":str,"location":str,"address":str,"type":str,"targetCompletion":"YYYY-MM-DD","jobs":[{"name":str,"phase":str,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","requiredLabor":int,"materialsStatus":"Delivered|Ordered|Missing|Waiting on Delivery","priority":"High|Medium|Normal","notes":str}]}]}

Rules: extract the REAL names, phases, and dates visible in the image. If a field isn't shown, infer a sensible value (near-term dates within the next ~8 weeks, labor 3–8). Only include projects/jobs actually present. Keep it under 6 projects.`;

export async function importScheduleFromImages(imageUrls: string[], data: BootstrapPayload): Promise<ImportResult> {
  if (!aiConnection()) return { mode: "demo" };
  const images = imageUrls
    .map(parseDataUrl)
    .filter((x): x is DataUrlImage => x !== null)
    .slice(0, 6);
  if (images.length === 0) return { mode: "demo" }; // nothing Claude can read (e.g. only a video)
  try {
    const ai = await aiClient();
    if (!ai) return { mode: "demo" };
    const message = await ai.client.messages
      .stream({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: IMPORT_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.media_type as "image/png", data: img.data }
              })),
              {
                type: "text" as const,
                text: "Extract every project and job from these image(s) into the JSON shape. Return only the JSON."
              }
            ]
          }
        ]
      })
      .finalMessage();

    const text = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const json = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(json) as { projects?: unknown[] };
    const plan = normalizePlan(parsed.projects ?? [], data);
    return plan.length ? { mode: "live", plan } : { mode: "demo" };
  } catch (error) {
    console.error("[ai] schedule import failed:", error instanceof Error ? error.message : error);
    return { mode: "demo" };
  }
}

// Map Claude's lightweight extraction onto valid, backend-ready specs: fill the
// operational fields BuildFlow needs, coerce enums/dates, assign crews round-robin.
function normalizePlan(rawProjects: unknown[], data: BootstrapPayload): ImportProjectSpec[] {
  // Whoever is importing, or the first person on the roster. This used to look for a
  // "Project Manager" or "Superintendent" job title; those were removed on 2026-09-19 and
  // there is nothing to put in their place — managing a project is an assignment, not a rank.
  const managerId = data.activeUser?.id ?? data.users[0]?.id ?? "";
  const crews = data.crews ?? [];
  let cursor = 0;
  const nextCrew = () => (crews.length ? crews[cursor++ % crews.length]?.id : undefined);

  const out: ImportProjectSpec[] = [];
  for (const rp of (rawProjects as Record<string, unknown>[]).slice(0, 6)) {
    if (!rp || typeof rp !== "object") continue;
    const name = String(rp.name ?? "").trim();
    if (!name) continue;
    const address = String(rp.address ?? "").trim() || String(rp.location ?? "").trim() || "Imported site";
    const input: CreateProjectInput = {
      name,
      location: String(rp.location ?? "").trim() || "Imported",
      address,
      type: String(rp.type ?? "").trim() || "Commercial",
      contractType: "Lump Sum",
      managerId,
      targetCompletion: isYmd(rp.targetCompletion) ? (rp.targetCompletion as string) : soon(60),
      percentComplete: 0,
      status: "Planned",
      scheduleHealth: "On Track"
    };
    const rawJobs = Array.isArray(rp.jobs) ? (rp.jobs as Record<string, unknown>[]) : [];
    const jobs: ImportJobSpec[] = [];
    rawJobs.slice(0, 12).forEach((rj, i) => {
      const jname = String(rj?.name ?? "").trim();
      if (!jname) return;
      jobs.push({
        name: jname,
        phase: String(rj.phase ?? "").trim() || "General",
        location: address,
        startDate: isYmd(rj.startDate) ? (rj.startDate as string) : soon(7 + i * 3),
        endDate: isYmd(rj.endDate) ? (rj.endDate as string) : soon(9 + i * 3),
        startTime: "07:00",
        endTime: "15:30",
        requiredLabor: Math.min(20, Math.max(1, Math.round(Number(rj.requiredLabor) || 4))),
        requiredEquipment: String(rj.requiredEquipment ?? "").trim() || "Hand tools",
        materialsStatus: pick(MATERIALS, rj.materialsStatus, "Ordered"),
        status: "Planned",
        priority: pick(PRIORITIES, rj.priority, "Medium"),
        notes: String(rj.notes ?? "").trim() || "Imported from your uploaded schedule",
        crewId: nextCrew()
      });
    });
    if (jobs.length) out.push({ input, jobs });
  }
  return out;
}

/* Boot-time status line, logged once at startup (like reportMailStatus). */
export function reportAiStatus(): void {
  const connection = aiConnection();
  if (connection?.via === "replit") {
    console.log(
      `🤖 BuildFlow AI: LIVE — "Ask BuildFlow AI" calls go to Claude (${MODEL}) through Replit AI Integrations, billed to the Replit account's credits.`
    );
  } else if (connection) {
    console.log(`🤖 BuildFlow AI: LIVE — "Ask BuildFlow AI" calls go to Claude (${MODEL}) on this server's own Anthropic credential.`);
  } else {
    console.warn(
      '🤖 BuildFlow AI: DEMO MODE — no Claude credential, so "Ask BuildFlow AI" uses the built-in simulated answers. On Replit, enable AI Integrations for Anthropic; elsewhere, set ANTHROPIC_API_KEY in server/.env.'
    );
  }
}
