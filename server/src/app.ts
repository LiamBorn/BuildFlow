import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Response } from "express";
import { z } from "zod";
import { businessTypeOptions, type Status } from "@buildflow/shared";
import { BuildFlowStore, toAccount, DEMO_ACCOUNT_EMAIL, type Account, type Org } from "./database.js";
import { StoreManager } from "./stores.js";
import { parseCookies, verifyPassword, SESSION_COOKIE, sessionCookieOptions } from "./auth.js";
import { askBuildFlowAI, buildAiContext, importScheduleFromImages } from "./ai.js";

// Attach the authenticated account/org to the request (set by the ops auth gate).
declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
    org?: Org;
  }
}
import { sendMail, contactSalesThankYouEmail, contactSalesLeadEmail, type SalesLead } from "./email.js";
import { waitlistConfirmationEmail, waitlistLaunchEmail } from "./email.js"; // waitlist (removable feature)
import type Stripe from "stripe";
import {
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  isBillingConfigured,
  isWebhookConfigured,
  billingMode,
  configuredPlans,
  planForPriceId
} from "./billing.js";
import { sendOpsNotice, assignmentNotice, conflictNotice, delayNotice, type OpsRecipients } from "./notify.js";

const statuses: [Status, ...Status[]] = [
  "Not Started",
  "Ready",
  "Ready to Start",
  "Planned",
  "Confirmed",
  "In Progress",
  "On Site",
  "Delayed",
  "Complete",
  "At Risk"
];

const scheduleHealthValues = ["On Track", "Monitor", "At Risk", "Complete"] as const;

const assignSchema = z.object({
  jobId: z.string().min(1),
  crewId: z.string().min(1),
  date: z.string().min(10),
  status: z.enum(statuses).optional()
});

const assignmentPatchSchema = z.object({
  jobId: z.string().min(1).optional(),
  crewId: z.string().min(1).optional(),
  date: z.string().min(10).optional(),
  status: z.enum(statuses).optional()
});

const jobPatchSchema = z.object({
  status: z.enum(statuses).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  materialsStatus: z.enum(["Delivered", "Ordered", "Missing", "Waiting on Delivery"]).optional(),
  notes: z.string().optional(),
  priority: z.enum(["High", "Medium", "Normal"]).optional()
});

const jobSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phase: z.string().trim().min(1),
  location: z.string().trim().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  requiredLabor: z.number().int().positive(),
  requiredEquipment: z.string().trim().min(1),
  materialsStatus: z.enum(["Delivered", "Ordered", "Missing", "Waiting on Delivery"]),
  status: z.enum(statuses),
  priority: z.enum(["High", "Medium", "Normal"]),
  notes: z.string()
});

const projectPatchSchema = z.object({
  name: z.string().trim().min(1),
  location: z.string().trim().min(1),
  address: z.string().trim().min(1),
  type: z.string().trim().min(1),
  contractType: z.string().trim().min(1),
  managerId: z.string().trim().min(1),
  targetCompletion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  percentComplete: z.number().int().min(0).max(100),
  status: z.enum(statuses),
  scheduleHealth: z.enum(scheduleHealthValues)
});

const fieldUpdateSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().optional(),
  userId: z.string().min(1),
  message: z.string().min(3),
  status: z.enum(statuses),
  photos: z.array(z.string()).optional()
});

const delaySchema = z.object({
  projectId: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(3),
  impactDays: z.number().int().nonnegative(),
  severity: z.enum(["Low", "Medium", "High"]),
  status: z.enum(["Open", "Monitoring", "Resolved"]),
  description: z.string().min(3)
});

const crewRoleCountSchema = z.object({
  category: z.enum(["Labor", "Operator"]),
  role: z.string().trim().min(1),
  count: z.number().int().positive()
});

const crewSchema = z.object({
  name: z.string().trim().min(1),
  specialty: z.string().trim().min(1),
  foreman: z.string().trim().min(1),
  laborMix: z.array(crewRoleCountSchema).min(1)
});

const equipmentSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  status: z.enum(["Available", "In Use", "Maintenance"]),
  assignedTo: z.string().trim().min(1).optional()
});

const materialSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(["Ready", "Ordered", "Waiting on Delivery", "Missing"]),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.string().trim().min(1)
});

const businessProfileSchema = z.object({
  businessType: z.enum(businessTypeOptions)
});

// waitlist (removable feature): email signup validation
const waitlistEmailSchema = z.object({
  email: z.string().trim().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address")
});

// contact sales: potential-customer lead validation
const contactSalesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"),
  phone: z.string().trim().max(60).optional().default(""),
  company: z.string().trim().min(1).max(160),
  teamSize: z.string().trim().min(1).max(40),
  interest: z.string().trim().min(1).max(60),
  message: z.string().trim().max(4000).optional().default("")
});

// ── Sales & Customer-Service Desk validation ───────────────────────────────
const departmentEnum = z.enum(["sales", "support"]);
const leadStatusEnum = z.enum(["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"]);
const salesLeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(320),
  company: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(60).optional(),
  teamSize: z.string().trim().max(40).optional(),
  interest: z.string().trim().max(80).optional(),
  status: leadStatusEnum.optional(),
  value: z.number().int().nonnegative().max(100_000_000).optional(),
  owner: z.string().trim().max(120).optional(),
  source: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(4000).optional()
});
const salesLeadPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().min(3).max(320).optional(),
  company: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(60).optional(),
  teamSize: z.string().trim().max(40).optional(),
  interest: z.string().trim().max(80).optional(),
  status: leadStatusEnum.optional(),
  value: z.number().int().nonnegative().max(100_000_000).optional(),
  owner: z.string().trim().max(120).optional(),
  source: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(4000).optional()
});
const salesTaskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().trim().min(1),
  leadId: z.string().trim().min(1).nullable().optional(),
  department: departmentEnum.optional()
});
const salesTaskPatchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  dueAt: z.string().trim().min(1).optional()
});
const salesActivitySchema = z.object({
  leadId: z.string().trim().min(1),
  type: z.enum(["note", "call", "email", "meeting", "stage"]),
  summary: z.string().trim().min(1).max(600)
});
const supportPriorityEnum = z.enum(["Low", "Normal", "High", "Urgent"]);
const supportConversationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(320),
  company: z.string().trim().max(160).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  priority: supportPriorityEnum.optional(),
  department: departmentEnum.optional()
});
const supportMessageSchema = z.object({
  author: z.enum(["customer", "agent"]),
  body: z.string().trim().min(1).max(4000)
});
const supportConversationPatchSchema = z.object({
  status: z.enum(["open", "pending", "closed"]).optional(),
  priority: supportPriorityEnum.optional()
});
const supportAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address."),
  role: z.enum(["Admin", "Agent"]).optional()
});

const billingCheckoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  period: z.enum(["monthly", "yearly"]),
  seats: z.number().int().min(1).max(1000).optional(),
  email: z.string().email().optional(),
  origin: z.string().url().optional()
});
const billingPortalSchema = z.object({
  email: z.string().email().optional(),
  customerId: z.string().optional(),
  origin: z.string().url().optional()
});

/* Map a verified Stripe webhook event onto our subscriptions table. Only the
   events we care about are handled; anything else is acknowledged and ignored.
   Fields that shift between Stripe API versions are read through a permissive view. */
function handleBillingEvent(store: BuildFlowStore, event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    store.upsertSubscription({
      id: subId ?? session.id,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      planId: session.metadata?.planId ?? null,
      period: session.metadata?.period ?? null,
      seats: session.metadata?.seats ? Number(session.metadata.seats) : null,
      status: "active",
      raw: session
    });
    return;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const view = sub as unknown as {
      metadata?: Record<string, string>;
      current_period_end?: number;
      items?: { data?: Array<{ quantity?: number; price?: { id?: string }; current_period_end?: number }> };
    };
    const item = view.items?.data?.[0];
    const priceId = item?.price?.id ?? null;
    const mapped = planForPriceId(priceId);
    const periodEndUnix = view.current_period_end ?? item?.current_period_end;
    store.upsertSubscription({
      id: sub.id,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      priceId,
      planId: mapped?.plan ?? view.metadata?.planId ?? null,
      period: mapped?.period ?? view.metadata?.period ?? null,
      seats: item?.quantity ?? (view.metadata?.seats ? Number(view.metadata.seats) : null),
      status: sub.status,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      raw: sub
    });
  }
}

export async function createApp(options: { dataFile?: string; reset?: boolean } = {}) {
  const mainStore = await BuildFlowStore.create(options.dataFile, options.reset);
  const manager = new StoreManager(mainStore);
  // Per-request operational store. Auth-gated routes run inside an ALS context
  // holding the requester's org store; everything else falls back to mainStore
  // (which owns the global auth/waitlist/sales/billing tables). This routes the
  // existing `store.X()` calls to the right tenant with NO per-route changes.
  const orgStoreALS = new AsyncLocalStorage<BuildFlowStore>();
  const store = new Proxy({} as BuildFlowStore, {
    get(_target, prop) {
      const active = orgStoreALS.getStore() ?? mainStore;
      const value = (active as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(active) : value;
    }
  });

  // Who gets operational notifications for an org: its login accounts (the PMs) +
  // optional ops contacts. Users/crews carry no contact fields yet — wire them in here later.
  const opsRecipients = (orgId: string): OpsRecipients => {
    const emails = mainStore.all<{ email: string }>("SELECT email FROM accounts WHERE orgId = ?", [orgId]).map((r) => r.email);
    const extraEmail = process.env.OPS_NOTIFY_EMAIL?.trim();
    if (extraEmail) emails.push(extraEmail);
    const phones = (process.env.OPS_NOTIFY_SMS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return { emails: [...new Set(emails)], phones };
  };

  const app = express();
  // Expose the store manager to the server entrypoint (backup scheduler/boot snapshot) + ops routes.
  app.locals.storeManager = manager;
  const clientUrl = process.env.BUILDFLOW_CLIENT_URL ?? "http://localhost:5175/";

  // Cross-origin cookies require an explicit origin + credentials (NOT "*").
  // Allow any localhost dev port, plus any origin listed in CORS_ORIGIN (prod).
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl / same-origin / server-to-server
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        return cb(null, allowedOrigins.includes(origin));
      },
      credentials: true
    })
  );
  // Field updates can carry base64 photo/file attachments, so allow a larger body than the 100kb default.
  const jsonParser = express.json({ limit: "25mb" });
  // The Stripe webhook must read the RAW body to verify its signature, so it's the
  // one route that skips JSON parsing (it uses express.raw() locally instead).
  app.use((req, res, next) => (req.path === "/api/billing/webhook" ? next() : jsonParser(req, res, next)));

  // ── Auth gate: protect the customer HUD data routes and bind the tenant store.
  // Only these prefixes are gated; auth/health/waitlist/contact-sales/sales/
  // support/billing stay public and use mainStore (ALS unset).
  const OPS_PREFIXES = [
    "/api/bootstrap", "/api/business-profile", "/api/projects", "/api/jobs", "/api/schedule",
    "/api/field-updates", "/api/delays", "/api/resources", "/api/crews", "/api/equipment", "/api/materials"
  ];
  const isOpsPath = (p: string) => OPS_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
  app.use(async (req, res, next) => {
    if (!isOpsPath(req.path)) return next();
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = mainStore.getSession(token);
    if (!session) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    req.account = session.account;
    req.org = session.org;
    try {
      const orgStore = await manager.getOrgStore(session.org.id);
      orgStoreALS.run(orgStore, () => next());
    } catch {
      res.status(500).json({ error: "Workspace unavailable." });
    }
  });

  app.get("/", (_req, res) => {
    res.redirect(clientUrl);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // ── Authentication (public) ───────────────────────────────────────────────
  const signupSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(120),
    orgName: z.string().trim().max(160).optional()
  });
  const loginSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200)
  });
  const issueSession = (res: Response, account: Account, org: Org) => {
    const { token } = mainStore.createSession(account.id, org.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  };

  app.post("/api/auth/signup", (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid email and a password of at least 8 characters." });
      return;
    }
    const { email, password, name, orgName } = parsed.data;
    if (mainStore.emailExists(email)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    const org = mainStore.createOrg(orgName || `${name}'s Company`);
    const account = mainStore.createAccount({ orgId: org.id, email, password, name, role: "owner" });
    issueSession(res, account, org);
    res.status(201).json({ account, org });
  });

  app.post("/api/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }
    const row = mainStore.getAccountRowByEmail(parsed.data.email);
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      res.status(401).json({ error: "Incorrect email or password." });
      return;
    }
    const org = mainStore.getOrg(row.orgId);
    if (!org) {
      res.status(500).json({ error: "Account workspace is missing." });
      return;
    }
    issueSession(res, toAccount(row), org);
    res.json({ account: toAccount(row), org });
  });

  // Credential-free demo sign-in — powers "Preview the live demo".
  app.post("/api/auth/demo", (_req, res) => {
    const row = mainStore.getAccountRowByEmail(DEMO_ACCOUNT_EMAIL);
    const org = row ? mainStore.getOrg(row.orgId) : undefined;
    if (!row || !org) {
      res.status(500).json({ error: "Demo account is unavailable." });
      return;
    }
    issueSession(res, toAccount(row), org);
    res.json({ account: toAccount(row), org });
  });

  app.get("/api/auth/me", (req, res) => {
    const session = mainStore.getSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({ account: session.account, org: session.org });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) mainStore.deleteSession(token);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  // ── BuildFlow AI: real Claude behind the "Ask BuildFlow AI" prompt ──────────
  // Public for now (uses the demo workspace); once auth is fully wired, move to
  // OPS_PREFIXES so it answers over req.orgStore. Returns {mode:"demo"} when no
  // ANTHROPIC_API_KEY is set, and the client falls back to its simulated answers.
  const aiAskSchema = z.object({ question: z.string().trim().min(1).max(2000) });
  app.post("/api/ai/ask", async (req, res) => {
    const parsed = aiAskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ask a question." });
      return;
    }
    try {
      const result = await askBuildFlowAI(parsed.data.question, buildAiContext(store.bootstrap()));
      res.json(result);
    } catch (error) {
      console.error("[ai] /api/ai/ask failed:", error instanceof Error ? error.message : error);
      res.json({ mode: "demo" }); // never break the prompt — let the client simulate
    }
  });

  // Schedule import via Claude vision: read uploaded image(s) of another scheduler
  // → a project/job plan the client creates. {mode:"demo"} → client uses its sample.
  const aiImportSchema = z.object({ images: z.array(z.string().max(20_000_000)).min(1).max(6) });
  app.post("/api/ai/import-schedule", async (req, res) => {
    const parsed = aiImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Attach at least one schedule image." });
      return;
    }
    try {
      const result = await importScheduleFromImages(parsed.data.images, store.bootstrap());
      res.json(result);
    } catch (error) {
      console.error("[ai] /api/ai/import-schedule failed:", error instanceof Error ? error.message : error);
      res.json({ mode: "demo" });
    }
  });

  app.get("/api/bootstrap", (_req, res) => {
    res.json(store.bootstrap());
  });

  app.post("/api/business-profile", (req, res) => {
    const parsed = businessProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(store.applyBusinessProfile(parsed.data.businessType));
  });

  app.get("/api/projects", (_req, res) => {
    res.json(store.projects());
  });

  app.post("/api/projects", (req, res) => {
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!store.canManageProject(parsed.data.managerId)) {
      res.status(400).json({ error: "Project manager must be a project manager or superintendent" });
      return;
    }
    res.status(201).json(store.createProject(parsed.data));
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = store.project(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  app.patch("/api/projects/:id", (req, res) => {
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!store.project(req.params.id)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!store.canManageProject(parsed.data.managerId)) {
      res.status(400).json({ error: "Project manager must be a project manager or superintendent" });
      return;
    }
    const project = store.updateProject(req.params.id, parsed.data);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  app.get("/api/jobs", (_req, res) => {
    res.json(store.jobs());
  });

  app.post("/api/jobs", (req, res) => {
    const parsed = jobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!store.project(parsed.data.projectId)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(201).json(store.createJob(parsed.data));
  });

  app.patch("/api/jobs/:id", (req, res) => {
    const parsed = jobPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const job = store.updateJob(req.params.id, parsed.data);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  app.get("/api/schedule", (_req, res) => {
    res.json(store.assignments());
  });

  app.post("/api/schedule/assign", (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const assignment = store.assignJob(parsed.data);
      res.status(201).json(assignment);
      // Notify PMs of the new assignment — or the crew conflict if it double-books.
      // Gather context synchronously (the tenant store is bound now), then send async.
      try {
        const job = store.get<{ name: string; projectId: string }>("SELECT name, projectId FROM jobs WHERE id = ?", [assignment.jobId]);
        const crew = store.get<{ name: string; lead: string }>("SELECT name, lead FROM crews WHERE id = ?", [assignment.crewId]);
        const project = job ? store.project(job.projectId) : undefined;
        const ctx = { crew: crew?.name ?? assignment.crewId, job: job?.name ?? assignment.jobId, project: project?.name, date: assignment.date };
        const notice = assignment.conflicts.length
          ? conflictNotice({ ...ctx, conflicts: assignment.conflicts })
          : assignmentNotice({ ...ctx, foreman: crew?.lead });
        if (req.org) void sendOpsNotice(notice, opsRecipients(req.org.id));
      } catch (notifyErr) {
        console.error("[notify] assignment notice failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : "Assignment failed" });
    }
  });

  app.patch("/api/schedule/:id", (req, res) => {
    const parsed = assignmentPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const assignment = store.updateAssignment(req.params.id, parsed.data);
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.json(assignment);
  });

  app.delete("/api/schedule/:id", (req, res) => {
    store.deleteAssignment(req.params.id);
    res.status(204).send();
  });

  app.get("/api/field-updates", (_req, res) => {
    res.json(store.fieldUpdates());
  });

  app.post("/api/field-updates", (req, res) => {
    const parsed = fieldUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createFieldUpdate(parsed.data));
  });

  app.get("/api/delays", (_req, res) => {
    res.json(store.delays());
  });

  app.post("/api/delays", (req, res) => {
    const parsed = delaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const delay = store.createDelay(parsed.data);
    res.status(201).json(delay);
    // Notify PMs that a delay was reported — fire-and-forget, never breaks the write.
    try {
      const project = store.project(delay.projectId);
      if (req.org)
        void sendOpsNotice(
          delayNotice({
            project: project?.name,
            title: delay.title,
            category: delay.category,
            impactDays: delay.impactDays,
            severity: delay.severity,
            description: delay.description
          }),
          opsRecipients(req.org.id)
        );
    } catch (notifyErr) {
      console.error("[notify] delay notice failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }
  });

  app.get("/api/resources", (_req, res) => {
    res.json(store.resources());
  });

  app.post("/api/crews", (req, res) => {
    const parsed = crewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createCrew(parsed.data));
  });

  app.patch("/api/crews/:id", (req, res) => {
    const parsed = crewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const crew = store.updateCrew(req.params.id, parsed.data);
    if (!crew) {
      res.status(404).json({ error: "Crew not found" });
      return;
    }
    res.json(crew);
  });

  app.delete("/api/crews/:id", (req, res) => {
    if (!store.deleteCrew(req.params.id)) {
      res.status(404).json({ error: "Crew not found" });
      return;
    }
    res.status(204).send();
  });

  app.post("/api/equipment", (req, res) => {
    const parsed = equipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createEquipment(parsed.data));
  });

  app.patch("/api/equipment/:id", (req, res) => {
    const parsed = equipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const equipment = store.updateEquipment(req.params.id, parsed.data);
    if (!equipment) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    res.json(equipment);
  });

  app.delete("/api/equipment/:id", (req, res) => {
    if (!store.deleteEquipment(req.params.id)) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    res.status(204).send();
  });

  app.post("/api/materials", (req, res) => {
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!store.project(parsed.data.projectId)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(201).json(store.createMaterial(parsed.data));
  });

  /* ── waitlist (removable feature) ─────────────────────────────────────────
     Pre-launch email capture. POST /api/waitlist saves the email + sends a
     confirmation ("thanks for joining"); POST /api/waitlist/announce broadcasts
     the launch email. Emails go through server/src/email.ts (SMTP env, logs
     until configured). To remove: delete these routes, the email import above,
     the waitlist schema, server/src/email.ts, and the waitlist table + methods
     in database.ts. ──────────────────────────────────────────────────────── */
  const waitlistPublicUrl = process.env.BUILDFLOW_PUBLIC_URL ?? clientUrl;

  app.get("/api/waitlist", (_req, res) => {
    res.json({ count: store.waitlistCount() });
  });

  app.post("/api/waitlist", async (req, res) => {
    const parsed = waitlistEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }
    const result = store.addWaitlistSubscriber(parsed.data.email);
    let emailed = false;
    if (!result.alreadyJoined) {
      const sent = await sendMail({ to: result.email, ...waitlistConfirmationEmail(waitlistPublicUrl) });
      emailed = sent.ok;
    }
    res.status(201).json({ ok: true, count: result.count, alreadyJoined: result.alreadyJoined, emailed });
  });

  // Admin-only launch broadcast. Guarded by WAITLIST_ADMIN_TOKEN so it can never
  // fire accidentally: returns 503 until that env var is set, then requires a
  // matching `x-waitlist-token` header. Sends the launch email to everyone not
  // yet notified and marks them notified.
  app.post("/api/waitlist/announce", async (req, res) => {
    const token = process.env.WAITLIST_ADMIN_TOKEN;
    if (!token) {
      res.status(503).json({ error: "Launch broadcast disabled — set WAITLIST_ADMIN_TOKEN to enable it." });
      return;
    }
    if (req.get("x-waitlist-token") !== token) {
      res.status(401).json({ error: "Invalid or missing x-waitlist-token header." });
      return;
    }
    const pending = store.pendingWaitlistSubscribers();
    const template = waitlistLaunchEmail(waitlistPublicUrl);
    const notified: string[] = [];
    for (const email of pending) {
      const sent = await sendMail({ to: email, ...template });
      if (sent.ok) notified.push(email);
    }
    store.markWaitlistNotified(notified);
    res.json({ ok: true, notified: notified.length, pending: pending.length });
  });
  /* ─────────────────────────── end waitlist ──────────────────────────────── */

  /* ── contact sales ────────────────────────────────────────────────────────
     A potential customer submits the "Talk to sales" form. We email them a
     thank-you confirmation and notify the sales department of the new lead.
     Both go through the shared SMTP sender (server/src/email.ts) — it runs in
     LOG MODE until SMTP_* env vars are set. Point SALES_EMAIL at your real
     sales inbox to route lead notifications there. ──────────────────────────── */
  const salesEmail = process.env.SALES_EMAIL ?? process.env.SMTP_USER ?? "sales@buildflow.com";

  app.post("/api/contact-sales", async (req, res) => {
    const parsed = contactSalesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please include your name, a valid work email, and your company." });
      return;
    }
    const lead: SalesLead = parsed.data;
    // Persist the lead so it lands live in the Sales & Support Desk console...
    store.createSalesLead({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      teamSize: lead.teamSize,
      interest: lead.interest,
      source: "Contact Sales",
      status: "New",
      notes: lead.message
    });
    // ...then thank the customer and notify sales in parallel; sendMail never throws.
    const [thanks, notify] = await Promise.all([
      sendMail({ to: lead.email, ...contactSalesThankYouEmail(lead) }),
      sendMail({ to: salesEmail, ...contactSalesLeadEmail(lead) })
    ]);
    res.status(201).json({
      ok: true,
      emailed: { customer: thanks.ok, sales: notify.ok },
      mode: thanks.mode
    });
  });
  /* ───────────────────────── end contact sales ────────────────────────────── */

  /* ── Billing / subscriptions (Stripe) ─────────────────────────────────────
     Turns the pricing plans into real Stripe Checkout subscriptions. Runs in a
     safe "not configured" mode until STRIPE_SECRET_KEY + price IDs are set in
     server/.env (see server/src/billing.ts). Card data never touches this server
     — Checkout is hosted by Stripe. ──────────────────────────────────────────── */
  app.get("/api/billing/status", (_req, res) => {
    res.json({
      configured: isBillingConfigured(),
      mode: billingMode(),
      webhookReady: isWebhookConfigured(),
      plans: configuredPlans()
    });
  });

  app.post("/api/billing/checkout", async (req, res) => {
    const parsed = billingCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a plan (pro or business), a billing period, and an optional seat count." });
      return;
    }
    const { plan, period, seats, email } = parsed.data;
    const origin = parsed.data.origin ?? req.headers.origin ?? process.env.BUILDFLOW_PUBLIC_URL ?? "http://localhost:5315";
    const base = origin.replace(/\/+$/, "");
    try {
      const result = await createCheckoutSession({
        plan,
        period,
        seats: seats ?? 1,
        email,
        successUrl: `${base}/?checkout=success&plan=${plan}#compare-plans`,
        cancelUrl: `${base}/?checkout=cancelled#compare-plans`
      });
      // 200 with configured:false is intentional — it's a normal "billing not connected
      // yet" state the pricing UI shows as a notice, not a server error.
      if (!result.ok) {
        res.status(200).json({ configured: false, reason: result.reason, message: result.message });
        return;
      }
      res.status(200).json({ configured: true, url: result.url });
    } catch (error) {
      console.error("[billing] checkout failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "Could not start checkout. Please try again." });
    }
  });

  app.post("/api/billing/portal", async (req, res) => {
    const parsed = billingPortalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide the email or Stripe customer id to manage." });
      return;
    }
    if (!isBillingConfigured()) {
      res.status(200).json({ configured: false, message: "Billing isn't connected yet." });
      return;
    }
    const { email, customerId, origin } = parsed.data;
    const sub = customerId
      ? store.getSubscriptionByCustomer(customerId)
      : email
        ? store.getSubscriptionByEmail(email)
        : undefined;
    const resolvedCustomer = customerId ?? sub?.customerId ?? undefined;
    if (!resolvedCustomer) {
      res.status(404).json({ error: "No subscription found for that account yet." });
      return;
    }
    const base = (origin ?? req.headers.origin ?? process.env.BUILDFLOW_PUBLIC_URL ?? "http://localhost:5315").replace(/\/+$/, "");
    try {
      const result = await createPortalSession({ customerId: resolvedCustomer, returnUrl: `${base}/#compare-plans` });
      if (!result.ok) {
        res.status(200).json({ configured: false, message: result.message });
        return;
      }
      res.status(200).json({ configured: true, url: result.url });
    } catch (error) {
      console.error("[billing] portal failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "Could not open the billing portal. Please try again." });
    }
  });

  // Stripe → us. Raw body (see the JSON-parser carve-out above) so the signature verifies.
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(req.body as Buffer, req.headers["stripe-signature"] as string | undefined);
    } catch (error) {
      console.error("[billing] webhook signature verification failed:", error instanceof Error ? error.message : error);
      res.status(400).json({ error: "Invalid signature" });
      return;
    }
    try {
      handleBillingEvent(store, event);
    } catch (error) {
      console.error("[billing] webhook handler error:", error instanceof Error ? error.message : error);
    }
    res.json({ received: true });
  });
  /* ─────────────────────────── end billing ─────────────────────────────────── */

  /* ── Ops / data — backups ─────────────────────────────────────────────────
     Admin-guarded snapshot + restore-point listing for the SQLite data layer.
     Guard: OPS_ADMIN_TOKEN sent as the `x-ops-token` header (or ?token=). When
     that env var is unset, calls are allowed from localhost only (dev
     convenience). backupAll() snapshots the main DB + every open tenant DB into
     data/backups/, each pruned to BACKUP_RETAIN. ─────────────────────────────── */
  const opsAuthorized = (req: express.Request): boolean => {
    const required = process.env.OPS_ADMIN_TOKEN?.trim();
    if (required) {
      const provided = (req.headers["x-ops-token"] as string | undefined) ?? (req.query.token as string | undefined);
      return provided === required;
    }
    const ip = req.socket.remoteAddress ?? "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  };
  const backupsDir = () => path.join(path.dirname(mainStore.dataFilePath), "backups");

  app.post("/api/ops/backup", (req, res) => {
    if (!opsAuthorized(req)) {
      res.status(403).json({ error: "Forbidden. Set OPS_ADMIN_TOKEN and send it as the x-ops-token header." });
      return;
    }
    const retain = process.env.BACKUP_RETAIN ? Number(process.env.BACKUP_RETAIN) : undefined;
    try {
      const files = manager.backupAll(retain).map((f) => path.basename(f));
      res.status(201).json({ ok: true, count: files.length, files });
    } catch (error) {
      console.error("[ops] backup failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Backup failed." });
    }
  });

  app.get("/api/ops/backups", (req, res) => {
    if (!opsAuthorized(req)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const dir = backupsDir();
    let backups: Array<{ file: string; size: number; modified: string }> = [];
    try {
      backups = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sqlite"))
        .map((f) => {
          const st = fs.statSync(path.join(dir, f));
          return { file: f, size: st.size, modified: st.mtime.toISOString() };
        })
        .sort((a, b) => (a.modified < b.modified ? 1 : -1));
    } catch {
      /* backups dir not created yet */
    }
    res.json({ dir, count: backups.length, backups });
  });
  /* ─────────────────────────── end ops ─────────────────────────────────────── */

  /* ── Sales & Customer-Service Desk API ────────────────────────────────────
     Powers the standalone BuildFlow Sales & Support Desk (sales-desk/, port
     5490). It's a separate app but stays LINKED to BuildFlow through these
     routes on the shared backend — the same pattern as the admin portal. ──── */
  app.get("/api/sales/bootstrap", (_req, res) => {
    res.json(store.salesBootstrap());
  });

  app.post("/api/sales/leads", (req, res) => {
    const parsed = salesLeadCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createSalesLead(parsed.data));
  });

  app.patch("/api/sales/leads/:id", (req, res) => {
    const parsed = salesLeadPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const lead = store.updateSalesLead(req.params.id, parsed.data);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json(lead);
  });

  app.delete("/api/sales/leads/:id", (req, res) => {
    if (!store.deleteSalesLead(req.params.id)) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.status(204).send();
  });

  app.post("/api/sales/tasks", (req, res) => {
    const parsed = salesTaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createSalesTask(parsed.data));
  });

  app.patch("/api/sales/tasks/:id", (req, res) => {
    const parsed = salesTaskPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const task = store.updateSalesTask(req.params.id, parsed.data);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  app.delete("/api/sales/tasks/:id", (req, res) => {
    if (!store.deleteSalesTask(req.params.id)) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(204).send();
  });

  app.post("/api/sales/activities", (req, res) => {
    const parsed = salesActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createSalesActivity(parsed.data));
  });

  app.get("/api/support/conversations", (req, res) => {
    const dept = departmentEnum.safeParse(req.query.department);
    res.json(store.supportConversations(dept.success ? dept.data : undefined));
  });

  app.get("/api/support/conversations/:id/messages", (req, res) => {
    res.json(store.supportMessages(req.params.id));
  });

  app.post("/api/support/conversations", (req, res) => {
    const parsed = supportConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createSupportConversation(parsed.data));
  });

  app.post("/api/support/conversations/:id/messages", (req, res) => {
    const parsed = supportMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const message = store.addSupportMessage(req.params.id, parsed.data);
    if (!message) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(201).json(message);
  });

  app.patch("/api/support/conversations/:id", (req, res) => {
    const parsed = supportConversationPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const conversation = store.updateSupportConversation(req.params.id, parsed.data);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conversation);
  });

  // Customer Support team roster (owner/admin adds & removes teammates).
  app.get("/api/support/agents", (_req, res) => {
    res.json(store.supportAgents());
  });

  app.post("/api/support/agents", (req, res) => {
    const parsed = supportAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please include a name and a valid email address." });
      return;
    }
    const result = store.createSupportAgent(parsed.data);
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.delete("/api/support/agents/:id", (req, res) => {
    const result = store.deleteSupportAgent(req.params.id);
    if ("error" in result) {
      res.status(result.error.includes("owner") ? 403 : 404).json({ error: result.error });
      return;
    }
    res.status(204).send();
  });
  /* ─────────────────── end Sales & Customer-Service Desk ───────────────────── */

  return app;
}
