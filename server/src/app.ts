import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Response } from "express";
import { z } from "zod";
import {
  businessTypeOptions,
  PASSWORD_MIN_LENGTH,
  onboardingProductOptions,
  planOptions,
  type BillingStatus,
  type BootstrapPayload,
  type InvitePreview,
  type TeamInvite,
  type OnboardingProductId,
  type PlanId,
  localIsoDate,
  passwordProblem,
  portfolioScheduleStatus,
  JOB_STATUSES,
  projectScheduleStatus,
  scheduleCalendarFor,
  type ScheduleVariance
} from "@buildflow/shared";
import {
  BuildFlowStore,
  DependencyError,
  RebookConflictError,
  StaleWriteError,
  clashMessage,
  toAccount,
  DEMO_ACCOUNT_EMAIL,
  type Account,
  type Org
} from "./database.js";
import type { ScheduleAssignment, ScheduleLiveEvent } from "@buildflow/shared";
import { StoreManager } from "./stores.js";
import { ScheduleLiveHub } from "./schedule/live.js";
import { sendWeeklyDigest, weeklyDigestFor } from "./schedule/digest.js";
import { createRateLimiter, createLoginGuard, humanSeconds } from "./rateLimit.js";
import {
  OAUTH_COOKIE,
  OAUTH_STATE_TTL_MS,
  OAUTH_PROVIDERS,
  authorizeUrl,
  configuredProviders,
  exchangeCode,
  pkcePair,
  providerConfig,
  readState,
  safeReturnTo,
  signState,
  type OAuthProvider
} from "./oauth.js";
import crypto from "node:crypto";
import { parseCookies, verifyPassword, SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "./auth.js";
import { askBuildFlowAI, buildAiContext, importScheduleFromImages } from "./ai.js";
import { analyzeSchedule, buildImportPlan, parseSchedule, ScheduleImportError } from "./import/index.js";
import { detectDelayRisks } from "./delayiq.js";

// Attach the authenticated account/org to the request (set by the ops auth gate).
declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
    org?: Org;
  }
}
import {
  sendMail,
  contactSalesThankYouEmail,
  contactSalesLeadEmail,
  type SalesLead,
  verifyEmailMessage,
  resetPasswordMessage,
  inviteMessage
} from "./email.js";
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
import {
  sendOpsNotice,
  assignmentNotice,
  conflictNotice,
  delayIQNotice,
  delayImpactNotice,
  varianceNotice,
  sendSms,
  smsConfigured,
  type OpsRecipients
} from "./notify.js";
import { detectVariance } from "./variance.js";
import { buildCrewCalendar } from "./ics.js";
import { registerScheduleToolRoutes } from "./schedule/routes.js";
import { seedPavingSchedule } from "./schedule/seed.js";

const statuses = JOB_STATUSES; // the one status list, shared with the client

const scheduleHealthValues = ["On Track", "Monitor", "At Risk", "Complete"] as const;

/** Every date a schedule route takes is a plain day. "banana", a timestamp or a half-typed date is a 400, not a row. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD");
/** A job's span cannot run backwards; the message says which way round it should be. */
const spanIsForwards = <T extends { startDate?: string; endDate?: string }>(value: T) =>
  !value.startDate || !value.endDate || value.endDate >= value.startDate;
const SPAN_MESSAGE = { message: "The finish cannot be before the start", path: ["endDate"] };

/* A booking has no status of its own — it wears its job's — so none of these accept one. */
const assignSchema = z.object({
  jobId: z.string().min(1),
  crewId: z.string().min(1),
  date: isoDate,
  /** The planner has seen the clash and chooses to double-book. */
  force: z.boolean().optional()
});

const assignmentPatchSchema = z.object({
  jobId: z.string().min(1).optional(),
  crewId: z.string().min(1).optional(),
  date: isoDate.optional(),
  force: z.boolean().optional()
});

/* A re-book: everything one drop touches, applied together (see store.rebook). */
/** The job fields a save may change besides its dates: the drawer's, on a PATCH or on a re-book's job step. */
const jobEditsSchema = z.object({
  status: z.enum(statuses).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  materialsStatus: z.enum(["Delivered", "Ordered", "Missing", "Waiting on Delivery"]).optional(),
  notes: z.string().optional(),
  priority: z.enum(["High", "Medium", "Normal"]).optional()
});
/** The row as the caller last read it. Optional: only a client that read one can send it. */
const rowVersion = z.number().int().positive().optional();

const rebookMoveSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    id: z.string().min(1),
    crewId: z.string().min(1).optional(),
    date: isoDate.optional(),
    version: rowVersion
  }),
  z.object({ op: z.literal("book"), jobId: z.string().min(1), crewId: z.string().min(1), date: isoDate }),
  z.object({ op: z.literal("unbook"), id: z.string().min(1) }),
  jobEditsSchema
    .extend({ op: z.literal("job"), id: z.string().min(1), startDate: isoDate, endDate: isoDate, version: rowVersion })
    .refine(spanIsForwards, SPAN_MESSAGE)
]);
const rebookSchema = z.object({ moves: z.array(rebookMoveSchema).min(1).max(200), force: z.boolean().optional() });

const workCalendarSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  holidays: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(1).max(80) })).max(400)
});

const jobPatchSchema = jobEditsSchema
  .extend({ startDate: isoDate.optional(), endDate: isoDate.optional(), version: rowVersion })
  .refine(spanIsForwards, SPAN_MESSAGE);

const jobSchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    phase: z.string().trim().min(1),
    location: z.string().trim().min(1),
    startDate: isoDate,
    endDate: isoDate,
    startTime: z.string().trim().min(1),
    endTime: z.string().trim().min(1),
    requiredLabor: z.number().int().positive(),
    requiredEquipment: z.string().trim().min(1),
    materialsStatus: z.enum(["Delivered", "Ordered", "Missing", "Waiting on Delivery"]),
    status: z.enum(statuses),
    priority: z.enum(["High", "Medium", "Normal"]),
    notes: z.string()
  })
  .refine(spanIsForwards, SPAN_MESSAGE);

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
  scheduleHealth: z.enum(scheduleHealthValues),
  // whole dollars; omitted or null means "not priced", which reporting treats
  // differently from a contract genuinely worth nothing
  value: z
    .number()
    .int()
    .min(0)
    .max(100_000_000_000)
    .nullish()
    .transform((v) => v ?? undefined)
});

const fieldUpdateSchema = z
  .object({
    projectId: z.string().min(1),
    jobId: z.string().optional(),
    userId: z.string().min(1),
    message: z.string().min(3),
    status: z.enum(statuses),
    photos: z.array(z.string()).optional(),
    percentComplete: z.number().int().min(0).max(100).optional()
  })
  .refine((value) => value.percentComplete == null || Boolean(value.jobId), {
    message: "percentComplete requires a jobId — progress has to be reported against a job.",
    path: ["percentComplete"]
  });

const varianceResolutionSchema = z.object({
  userId: z.string().min(1),
  note: z.string().trim().max(500).optional()
});

const delayIQSchema = z.object({
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
  laborMix: z.array(crewRoleCountSchema).min(1),
  /**
   * Hourly rate per worker, in dollars; omitted = the specialty's default, which is what the
   * form's placeholder promises. Zero is refused rather than stored: it used to be accepted and
   * then read as a real price, putting a whole week of booked work on the board at $0.
   */
  rate: z
    .number()
    .positive({ message: "An hourly rate must be more than $0 — leave it empty to use the specialty default." })
    .max(10000)
    .optional()
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
  businessType: z.enum(businessTypeOptions),
  // What the owner picked on the plan step. Optional so older clients (and the
  // Settings trade picker) can send the trade alone.
  selectedPlan: z.enum(planOptions).optional(),
  selectedProducts: z
    .array(z.enum(onboardingProductOptions.map((option) => option.id) as [OnboardingProductId, ...OnboardingProductId[]]))
    .max(onboardingProductOptions.length)
    .optional(),
  seats: z.number().int().min(1).max(1000).optional()
});
const PLAN_LABELS: Record<PlanId, string> = { free: "Free", pro: "Pro", business: "Business", enterprise: "Enterprise" };

// waitlist (removable feature): email signup validation
const waitlistEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address")
});

// contact sales: potential-customer lead validation
const contactSalesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"),
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
  company: z.string().trim().max(160).default(""), // "company, if any"
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
  company: z.string().trim().max(160).optional(),
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
  department: departmentEnum.optional(),
  assignee: z.string().trim().max(120).optional(),
  priority: z.enum(["Low", "Normal", "High"]).optional(),
  notes: z.string().trim().max(2000).optional()
});
const salesTaskPatchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  dueAt: z.string().trim().min(1).optional()
});
/* Contact record actions (Contacts page → record panel). */
const salesEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  from: z.string().trim().max(120).optional()
});
const salesTextSchema = z.object({ body: z.string().trim().min(1).max(600) });
/* Companies + Deals (the Sales hub's other pages). */
const salesCompanyCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  domain: z.string().trim().max(160).optional(),
  industry: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(60).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(60).optional(),
  owner: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional()
});
const salesCompanyPatchSchema = salesCompanyCreateSchema.partial();
const dealStageEnum = z.enum([
  "Appointment scheduled",
  "Qualified to buy",
  "Presentation scheduled",
  "Decision maker bought-in",
  "Contract sent",
  "Closed won",
  "Closed lost"
]);
const salesDealCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  stage: dealStageEnum.optional(),
  amount: z.number().int().nonnegative().max(1_000_000_000).optional(),
  closeDate: z.string().trim().max(40).optional(),
  companyId: z.string().trim().min(1).nullable().optional(),
  leadId: z.string().trim().min(1).nullable().optional(),
  owner: z.string().trim().max(120).optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  notes: z.string().trim().max(4000).optional()
});
const salesDealPatchSchema = salesDealCreateSchema.partial();
const salesCallLogSchema = z.object({
  outcome: z.enum(["Connected", "Left voicemail", "No answer", "Busy", "Wrong number"]),
  durationMinutes: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(2000).optional()
});
const salesMeetingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  location: z.string().trim().max(240).optional(),
  agenda: z.string().trim().max(2000).optional(),
  organizer: z.string().trim().max(120).optional(),
  notify: z.boolean().optional(),
  timeZone: z.string().trim().max(64).optional()
});
const salesActivitySchema = z.object({
  leadId: z.string().trim().min(1),
  type: z.enum(["note", "call", "email", "meeting", "stage", "text"]),
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
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address."),
  role: z.enum(["Admin", "Agent"]).optional()
});

const billingCheckoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  period: z.enum(["monthly", "yearly"]),
  seats: z.number().int().min(1).max(1000).optional(),
  email: z.string().email().optional(),
  origin: z.string().url().optional(),
  /** Where Stripe sends the person back: the pricing page (default), straight into the app after onboarding, or Settings › Billing. */
  returnTo: z.enum(["plans", "onboarding", "settings"]).optional()
});
const billingPortalSchema = z.object({
  email: z.string().email().optional(),
  customerId: z.string().optional(),
  origin: z.string().url().optional(),
  returnTo: z.enum(["plans", "settings"]).optional()
});

/* Map a verified Stripe webhook event onto our subscriptions table. Only the
   events we care about are handled; anything else is acknowledged and ignored.
   Fields that shift between Stripe API versions are read through a permissive view. */
/** Shift an ISO date by whole days, staying on the date axis (no timezone drift). */
function shiftDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before `iso` — the key a week's snapshot is filed under. */
function mondayOf(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = Sunday
  return shiftDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

function handleBillingEvent(store: BuildFlowStore, event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    store.upsertSubscription({
      id: subId ?? session.id,
      customerId: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
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
      customerId: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
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

/** Bump when the Terms or Privacy Policy change materially; stored on each account at signup. */
const TERMS_VERSION = "2026-09";

export async function createApp(options: { dataFile?: string; reset?: boolean } = {}) {
  const mainStore = await BuildFlowStore.create(options.dataFile, options.reset);
  const manager = new StoreManager(mainStore);
  // Demo workspace: the Route 9 Resurfacing paving job for the Schedule Creation
  // Tool (40 activities, three crews). Guarded on its job number; skipped under
  // vitest so API tests keep their expected project counts.
  if (!process.env.VITEST) {
    try {
      const seeded = seedPavingSchedule(mainStore);
      if (seeded) console.log("🗓️  Seeded Route 9 Resurfacing (schedule demo project)");
    } catch (error) {
      console.error("🗓️  Schedule demo seed failed:", error instanceof Error ? error.message : error);
    }
  }
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
    const phones = (process.env.OPS_NOTIFY_SMS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { emails: [...new Set(emails)], phones };
  };

  // Auth abuse controls — per process, per app instance (see rateLimit.ts).
  const limiter = createRateLimiter();
  const loginGuard = createLoginGuard();
  const HOUR = 60 * 60 * 1000;
  const QUARTER = 15 * 60 * 1000;
  const VERIFY_TTL_MS = 24 * HOUR;
  const RESET_TTL_MS = HOUR;
  /** The web app's origin for emailed links: the caller's origin in dev, the configured client URL otherwise. */
  const appOriginFor = (req: express.Request) => {
    const origin = typeof req.headers.origin === "string" && /^https?:\/\//.test(req.headers.origin) ? req.headers.origin : clientUrl;
    return origin.replace(/\/+$/, "");
  };
  const sendVerificationEmail = async (req: express.Request, account: { id: string; name: string; email: string }) => {
    const token = mainStore.createAuthToken(account.id, "verify", VERIFY_TTL_MS);
    const link = `${appOriginFor(req)}/#verify-email?token=${encodeURIComponent(token)}`;
    const message = verifyEmailMessage(account.name, link);
    await sendMail({ to: account.email, ...message });
    return token;
  };
  const INVITE_TTL_MS = 7 * 24 * HOUR;
  const sendInviteEmail = async (
    req: express.Request,
    invite: { email: string; role: string },
    token: string,
    inviterName: string,
    orgName: string
  ) => {
    const link = `${appOriginFor(req)}/#accept-invite?token=${encodeURIComponent(token)}`;
    await sendMail({ to: invite.email, ...inviteMessage(inviterName, orgName, invite.role, link) });
  };
  // Tests read tokens back from the response instead of parsing log-mode email.
  const exposeTokens = process.env.NODE_ENV === "test" || process.env.BUILDFLOW_EXPOSE_AUTH_TOKENS === "1";

  const app = express();
  /**
   * A route answers only to the case it was registered with.
   *
   * Express matches case-insensitively by default, so `/API/bootstrap` was the same route as
   * `/api/bootstrap` to the router — and a different string to the session gate below, which
   * compares against lowercase literals. Changing the case of a path therefore skipped the gate
   * entirely: no session required, no tenant bound, the handler running against the main store.
   * `GET /API/bootstrap` returned the whole workspace to a caller with no cookie, and
   * `POST /API/schedule/assign` reached the write.
   *
   * This is one of the two halves of the fix, and the gate lowercasing what it compares is the
   * other. Either would close it; both mean neither has to be right on its own.
   */
  app.set("case sensitive routing", true);
  // Expose the store manager to the server entrypoint (backup scheduler/boot snapshot) + ops routes.
  app.locals.storeManager = manager;
  const clientUrl = process.env.BUILDFLOW_CLIENT_URL ?? "http://localhost:5175/";

  // Cross-origin cookies require an explicit origin + credentials (NOT "*").
  // Allow any localhost dev port, plus any origin listed in CORS_ORIGIN (prod).
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    "/api/bootstrap",
    "/api/business-profile",
    "/api/projects",
    "/api/jobs",
    "/api/schedule",
    "/api/field-updates",
    "/api/delayIQs",
    "/api/resources",
    "/api/crews",
    "/api/equipment",
    "/api/materials",
    // Schedule import writes projects/jobs into the caller's own workspace, so it
    // must be gated and tenant-bound like the rest of the ops routes.
    "/api/import",
    // The Schedule Creation Tool reads and writes the caller's own activities.
    "/api/schedule-tool",
    // DelayIQ early-warning reads the caller's own schedule and can notify their
    // team, so it's gated + tenant-bound too.
    "/api/delayiq",
    // Team (invites, sample teammates) and org (name) live behind the session too.
    "/api/team",
    "/api/org",
    "/api/me"
  ];
  /**
   * Whether this path needs a session, compared in one case so no spelling of it can disagree
   * with the router about which route it is. `/api/delayIQs` is the one prefix with capitals of
   * its own, which is why both sides are folded rather than just the incoming path.
   */
  const OPS_PREFIXES_LOWER = OPS_PREFIXES.map((prefix) => prefix.toLowerCase());
  const isOpsPath = (path: string) => {
    const p = path.toLowerCase();
    return OPS_PREFIXES_LOWER.some((pre) => p === pre || p.startsWith(`${pre}/`));
  };
  // The schedule's live feed: every schedule write announces itself to the org's other open tabs.
  const live = new ScheduleLiveHub();
  app.locals.live = live;
  const announce = (req: express.Request, event: Pick<ScheduleLiveEvent, "kind" | "op" | "ids">) => {
    if (!req.org) return;
    const client = req.headers["x-buildflow-client"];
    live.publish(req.org.id, {
      ...event,
      by: { id: req.account?.id ?? "", name: req.account?.name ?? "Someone" },
      client: typeof client === "string" ? client : null,
      at: new Date().toISOString()
    });
  };

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

  /* The crew calendar feed: outside the session gate on purpose (a phone's calendar app cannot sign in);
     the key in the link is the workspace's feed secret. */
  app.get("/api/feeds/:orgId/:crewId.ics", async (req, res) => {
    const orgId = String(req.params.orgId);
    const org = mainStore.getOrg(orgId);
    if (!org) {
      res.status(404).type("text/plain").send("Unknown workspace");
      return;
    }
    let orgStore: BuildFlowStore;
    try {
      orgStore = await manager.getOrgStore(orgId);
    } catch {
      res.status(500).type("text/plain").send("Workspace unavailable");
      return;
    }
    if (String(req.query.key ?? "") !== orgStore.calendarFeedKey()) {
      res.status(403).type("text/plain").send("This calendar link is not valid");
      return;
    }
    const crew = orgStore.crews().find((item) => item.id === String(req.params.crewId));
    if (!crew) {
      res.status(404).type("text/plain").send("Unknown crew");
      return;
    }
    const ics = buildCrewCalendar({
      crew,
      assignments: orgStore.assignments(),
      jobs: orgStore.jobs(),
      projects: orgStore.projects(),
      name: `BuildFlow · ${crew.name}`
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${crew.name.replace(/[^\w.-]+/g, "-")}.ics"`);
    res.setHeader("Cache-Control", "no-cache");
    res.send(ics);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // ── Authentication (public) ───────────────────────────────────────────────
  /* Signup validation answers per field so the form can put the message under
     the input it belongs to. `field` is the input name; `code` lets the client
     react to a specific case (an existing email offers "log in instead"). */
  const signupSchema = z.object({
    email: z.string().trim().email("Enter a valid email address.").max(320, "That email is too long."),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(200, "Password is too long (200 characters max)."),
    name: z.string().trim().min(1, "Enter your name.").max(120, "Name is too long (120 characters max)."),
    // The company becomes the workspace everyone else is invited into, so it
    // is no longer optional and no longer invented from the person's name.
    orgName: z.string().trim().min(2, "Enter your company name.").max(160, "Company name is too long (160 characters max)."),
    acceptTerms: z.literal(true, { message: "Please agree to the Terms & Conditions and Privacy Policy." }),
    remember: z.boolean().optional()
  });
  const signupFieldFor = (path: readonly PropertyKey[]) => {
    const key = String(path[0] ?? "");
    return key === "orgName" ? "company" : key === "acceptTerms" ? "terms" : key;
  };
  const loginSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200),
    // "Keep me signed in" — omitted by older clients / the demo route, so it
    // defaults to the previous behaviour (a persistent SESSION_TTL_MS cookie).
    remember: z.boolean().optional()
  });
  // `remember: false` issues a browser-session cookie instead, so closing the
  // browser signs the account out. The session row itself is unchanged — the
  // cookie is the credential, so dropping it is what ends the sign-in.
  /** The session payload the client keeps: `demo` marks the shared demo login, which is not a real signup. */
  const sessionPayload = (account: Account, org: Org) => ({ account, org, demo: account.email === DEMO_ACCOUNT_EMAIL });
  const issueSession = (res: Response, account: Account, org: Org, remember = true) => {
    const { token } = mainStore.createSession(account.id, org.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(remember ? SESSION_TTL_MS : null));
  };

  app.post("/api/auth/signup", limiter.byIp("signup", 10, HOUR), async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res
        .status(400)
        .json({ error: issue?.message ?? "Check the form and try again.", field: issue ? signupFieldFor(issue.path) : undefined });
      return;
    }
    const { email, password, name, orgName, remember } = parsed.data;
    // Same policy as the form's live meter (shared package), enforced here so
    // a hand-made request can't skip it.
    const weak = passwordProblem(password, email);
    if (weak) {
      res.status(400).json({ error: weak, field: "password", code: "weak_password" });
      return;
    }
    if (mainStore.emailExists(email)) {
      res.status(409).json({ error: "An account with this email already exists.", field: "email", code: "email_taken" });
      return;
    }
    const org = mainStore.createOrg(orgName);
    const account = mainStore.createAccount({
      orgId: org.id,
      email,
      password,
      name,
      role: "owner",
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: TERMS_VERSION
    });
    // The owner is a person in their own workspace from the first second, so
    // nothing they do is attributed to a seeded name.
    try {
      const orgStore = await manager.getOrgStore(org.id);
      orgStore.ensureAccountUser(account);
    } catch (error) {
      console.error("[signup] could not create the owner's workspace user:", error instanceof Error ? error.message : error);
    }
    // "Keep me signed in" now applies to signup too — unticked on a shared
    // site computer means closing the browser signs the new account out.
    issueSession(res, account, org, remember ?? true);
    // The confirmation email goes out in the background; signup never waits on SMTP.
    sendVerificationEmail(req, account).catch((error) =>
      console.error("[auth] verification email failed:", error instanceof Error ? error.message : error)
    );
    res.status(201).json(sessionPayload(account, org));
  });

  app.post("/api/auth/login", limiter.byIp("login", 30, QUARTER), (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }
    // Five wrong passwords lock the email for fifteen minutes — the answer is
    // the same whether or not the account exists, so this reveals nothing.
    const locked = loginGuard.lockedFor(parsed.data.email);
    if (locked > 0) {
      res.setHeader("Retry-After", String(locked));
      res
        .status(429)
        .json({ error: `Too many sign-in attempts. Try again in ${humanSeconds(locked)}, or reset your password.`, retryAfterSec: locked });
      return;
    }
    const row = mainStore.getAccountRowByEmail(parsed.data.email);
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      loginGuard.noteFailure(parsed.data.email);
      res.status(401).json({ error: "Incorrect email or password." });
      return;
    }
    loginGuard.clear(parsed.data.email);
    const org = mainStore.getOrg(row.orgId);
    if (!org) {
      res.status(500).json({ error: "Account workspace is missing." });
      return;
    }
    issueSession(res, toAccount(row), org, parsed.data.remember ?? true);
    res.json(sessionPayload(toAccount(row), org));
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

  /* ── Sign in with Google / Microsoft (OpenID Connect) ───────────────────── */
  const isProvider = (value: string): value is OAuthProvider => (OAUTH_PROVIDERS as string[]).includes(value);
  const apiOriginFor = (req: express.Request) => {
    const configured = process.env.BUILDFLOW_API_URL?.trim();
    if (configured) return configured.replace(/\/+$/, "");
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol;
    return `${proto}://${req.get("host")}`;
  };
  const oauthCallbackUri = (req: express.Request, provider: OAuthProvider) => `${apiOriginFor(req)}/api/auth/oauth/${provider}/callback`;
  const oauthFail = (res: Response, returnTo: string, reason: string) => {
    res.clearCookie(OAUTH_COOKIE, { path: "/api/auth/oauth" });
    res.redirect(`${returnTo}/?oauth=error&reason=${encodeURIComponent(reason)}#create-account`);
  };

  app.get("/api/auth/oauth/status", (_req, res) => {
    res.json({ providers: configuredProviders() });
  });

  // The button lands here; we build the provider URL and send the browser on.
  app.get("/api/auth/oauth/:provider/start", limiter.byIp("oauth-start", 30, QUARTER), (req, res) => {
    const provider = String(req.params.provider);
    const allowedReturn = [clientUrl.replace(/\/+$/, ""), (process.env.BUILDFLOW_PUBLIC_URL ?? clientUrl).replace(/\/+$/, "")];
    const returnTo = safeReturnTo(typeof req.query.returnTo === "string" ? req.query.returnTo : undefined, allowedReturn);
    if (!isProvider(provider)) {
      oauthFail(res, returnTo, "unknown_provider");
      return;
    }
    const config = providerConfig(provider);
    if (!config) {
      oauthFail(res, returnTo, "not_configured");
      return;
    }
    const mode = req.query.mode === "login" ? "login" : "signup";
    const acceptTerms = req.query.terms === "1";
    if (mode === "signup" && !acceptTerms) {
      oauthFail(res, returnTo, "terms_required");
      return;
    }
    const { verifier, challenge } = pkcePair();
    const state = crypto.randomBytes(24).toString("base64url");
    const nonce = crypto.randomBytes(24).toString("base64url");
    res.cookie(
      OAUTH_COOKIE,
      signState({
        provider,
        state,
        verifier,
        nonce,
        mode,
        acceptTerms,
        remember: req.query.remember !== "0",
        returnTo,
        issuedAt: Date.now()
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/api/auth/oauth",
        maxAge: OAUTH_STATE_TTL_MS,
        secure: process.env.NODE_ENV === "production"
      }
    );
    res.redirect(authorizeUrl(provider, config, { redirectUri: oauthCallbackUri(req, provider), state, challenge, nonce }));
  });

  // The provider sends the browser back here with a code (or an error).
  app.get("/api/auth/oauth/:provider/callback", limiter.byIp("oauth-callback", 30, QUARTER), async (req, res) => {
    const provider = String(req.params.provider);
    const saved = readState(parseCookies(req.headers.cookie)[OAUTH_COOKIE]);
    const returnTo = saved?.returnTo ?? clientUrl.replace(/\/+$/, "");
    if (!isProvider(provider) || !saved || saved.provider !== provider) {
      oauthFail(res, returnTo, "state_missing");
      return;
    }
    if (typeof req.query.error === "string") {
      oauthFail(res, returnTo, req.query.error === "access_denied" ? "cancelled" : "provider_error");
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state || state !== saved.state) {
      oauthFail(res, returnTo, "state_mismatch");
      return;
    }
    const config = providerConfig(provider);
    if (!config) {
      oauthFail(res, returnTo, "not_configured");
      return;
    }
    let identity;
    try {
      identity = await exchangeCode(config, {
        code,
        redirectUri: oauthCallbackUri(req, provider),
        verifier: saved.verifier,
        nonce: saved.nonce
      });
    } catch (error) {
      console.error(`[oauth] ${provider} exchange failed:`, error instanceof Error ? error.message : error);
      oauthFail(res, returnTo, "exchange_failed");
      return;
    }
    if (!identity.emailVerified) {
      oauthFail(res, returnTo, "email_unverified");
      return;
    }
    res.clearCookie(OAUTH_COOKIE, { path: "/api/auth/oauth" });

    const existing = mainStore.getAccountRowByEmail(identity.email);
    if (existing) {
      // Sign in. The provider vouches for the address, so an unconfirmed
      // password account becomes confirmed by signing in this way.
      const org = mainStore.getOrg(existing.orgId);
      if (!org) {
        oauthFail(res, returnTo, "workspace_missing");
        return;
      }
      const account = mainStore.markEmailVerified(existing.id) ?? toAccount(existing);
      loginGuard.clear(account.email);
      issueSession(res, account, org, saved.remember);
      res.redirect(`${returnTo}/?oauth=login`);
      return;
    }
    if (saved.mode === "login") {
      // No account for that address; do not create one behind their back.
      oauthFail(res, returnTo, "no_account");
      return;
    }
    // Sign up: a new org named after the company domain (or the person), the
    // owner account without a password, and the owner as a workspace user.
    const domain = identity.email.split("@")[1] ?? "";
    const personal = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|mail)\./i.test(domain);
    const orgName =
      personal || !domain
        ? `${(identity.name || identity.email.split("@")[0]).split(" ")[0]}'s Company`
        : domain
            .split(".")[0]
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    const org = mainStore.createOrg(orgName);
    const account = mainStore.createAccount({
      orgId: org.id,
      email: identity.email,
      password: crypto.randomBytes(32).toString("base64url"), // unusable; "Forgot password?" sets a real one
      name: identity.name || identity.email.split("@")[0],
      role: "owner",
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: TERMS_VERSION,
      authProvider: provider,
      providerSubject: identity.subject,
      emailVerifiedAt: new Date().toISOString()
    });
    try {
      const orgStore = await manager.getOrgStore(org.id);
      orgStore.ensureAccountUser(account);
    } catch (error) {
      console.error("[oauth] could not create the owner's workspace user:", error instanceof Error ? error.message : error);
    }
    issueSession(res, account, org, saved.remember);
    res.redirect(`${returnTo}/?oauth=signup#business-type`);
  });

  /* ── Email verification ─────────────────────────────────────────────────── */
  // Re-send the confirmation link to the signed-in account.
  app.post("/api/auth/verify/request", limiter.byIp("verify-request", 5, QUARTER), async (req, res) => {
    const session = mainStore.getSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!session) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    if (session.account.emailVerifiedAt) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    try {
      const token = await sendVerificationEmail(req, session.account);
      res.json({ ok: true, ...(exposeTokens ? { debugToken: token } : {}) });
    } catch (error) {
      console.error("[auth] verification email failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "We couldn't send the email just now. Please try again." });
    }
  });

  // The link in the email lands here.
  app.post("/api/auth/verify", limiter.byIp("verify", 20, QUARTER), (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const account = mainStore.consumeAuthToken(token, "verify");
    if (!account) {
      res
        .status(400)
        .json({ error: "This confirmation link is invalid or has expired. Request a new one from your workspace.", code: "token_invalid" });
      return;
    }
    const verified = mainStore.markEmailVerified(account.id);
    // Invites written while the address was unconfirmed go out now.
    const org = mainStore.getOrg(account.orgId);
    for (const held of mainStore.unsentInvites(account.orgId)) {
      const refreshed = mainStore.refreshInvite(held.id, account.orgId, INVITE_TTL_MS);
      if (refreshed && org) {
        sendInviteEmail(req, refreshed.invite, refreshed.token, account.name, org.name).catch((error) =>
          console.error("[team] held invite failed to send:", error instanceof Error ? error.message : error)
        );
      }
    }
    res.json({ ok: true, account: verified });
  });

  /* ── Forgot password ────────────────────────────────────────────────────── */
  // Always answers 200 so nobody can learn which emails have accounts.
  app.post("/api/auth/reset/request", limiter.byIp("reset-request", 5, QUARTER), async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email().max(320) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter the email you signed up with.", field: "email" });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const perEmail = limiter.hit("reset-email", email, 3, HOUR);
    const row = perEmail.ok ? mainStore.getAccountRowByEmail(email) : undefined;
    let debugToken: string | undefined;
    if (row) {
      try {
        const token = mainStore.createAuthToken(row.id, "reset", RESET_TTL_MS);
        const link = `${appOriginFor(req)}/#reset-password?token=${encodeURIComponent(token)}`;
        await sendMail({ to: row.email, ...resetPasswordMessage(row.name, link) });
        if (exposeTokens) debugToken = token;
      } catch (error) {
        console.error("[auth] reset email failed:", error instanceof Error ? error.message : error);
      }
    }
    res.json({ ok: true, ...(debugToken ? { debugToken } : {}) });
  });

  // The link in the email lands here with the new password.
  app.post("/api/auth/reset", limiter.byIp("reset", 20, QUARTER), (req, res) => {
    const parsed = z.object({ token: z.string().min(1), password: z.string().min(PASSWORD_MIN_LENGTH).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, field: "password" });
      return;
    }
    // Peek at the account first so the password policy can check "not your email".
    const account = mainStore.consumeAuthToken(parsed.data.token, "reset");
    if (!account) {
      res.status(400).json({ error: "This reset link is invalid or has already been used. Request a new one.", code: "token_invalid" });
      return;
    }
    const weak = passwordProblem(parsed.data.password, account.email);
    if (weak) {
      // Give the token back: the person is real, the password just needs work.
      const fresh = mainStore.createAuthToken(account.id, "reset", RESET_TTL_MS);
      res.status(400).json({ error: weak, field: "password", code: "weak_password", token: fresh });
      return;
    }
    mainStore.setAccountPassword(account.id, parsed.data.password);
    loginGuard.clear(account.email);
    // Following the emailed link proves the address, so count it as verified.
    const verified = mainStore.markEmailVerified(account.id) ?? account;
    const org = mainStore.getOrg(verified.orgId);
    if (!org) {
      res.status(500).json({ error: "Account workspace is missing." });
      return;
    }
    issueSession(res, verified, org, true);
    res.json({ account: verified, org });
  });

  /* ── Account edits: name, email (a new email starts verification over) ──── */
  app.patch("/api/auth/account", limiter.byIp("account", 30, QUARTER), async (req, res) => {
    const session = mainStore.getSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!session) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    const parsed = z
      .object({
        name: z.string().trim().min(1, "Enter your name.").max(120, "Name is too long (120 characters max).").optional(),
        email: z.string().trim().email("Enter a valid email address.").max(320).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({ error: issue?.message ?? "Check the form and try again.", field: String(issue?.path[0] ?? "") });
      return;
    }
    const nextEmail = parsed.data.email?.toLowerCase();
    const emailChanged = Boolean(nextEmail && nextEmail !== session.account.email);
    if (emailChanged && mainStore.emailExists(nextEmail!)) {
      res.status(409).json({ error: "An account with this email already exists.", field: "email", code: "email_taken" });
      return;
    }
    const account = mainStore.updateAccount(session.account.id, { name: parsed.data.name, email: emailChanged ? nextEmail : undefined });
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    if (parsed.data.name !== undefined) {
      // keep the workspace person in step with the login
      try {
        const orgStore = await manager.getOrgStore(session.org.id);
        orgStore.renameAccountUser(account.id, account.name);
      } catch (error) {
        console.error("[account] workspace user rename failed:", error instanceof Error ? error.message : error);
      }
    }
    if (emailChanged) {
      sendVerificationEmail(req, account).catch((error) =>
        console.error("[auth] verification email failed:", error instanceof Error ? error.message : error)
      );
    }
    res.json({ account, verificationSent: emailChanged });
  });

  /* ── Invites: the public half (the invited person has no session yet) ────── */
  app.get("/api/auth/invite/:token", limiter.byIp("invite-peek", 30, QUARTER), (req, res) => {
    const invite = mainStore.inviteByToken(String(req.params.token));
    const org = invite ? mainStore.getOrg(invite.orgId) : undefined;
    const inviter = invite ? mainStore.getAccountById(invite.invitedBy) : undefined;
    if (!invite || !org) {
      res.status(404).json({ error: "This invite is invalid, was withdrawn, or has expired. Ask for a new one.", code: "invite_invalid" });
      return;
    }
    const preview: InvitePreview = {
      email: invite.email,
      role: invite.role,
      orgName: org.name,
      inviterName: inviter?.name ?? "A teammate",
      expiresAt: invite.expiresAt
    };
    res.json(preview);
  });

  app.post("/api/auth/invite/accept", limiter.byIp("invite-accept", 10, HOUR), async (req, res) => {
    const parsed = z
      .object({
        token: z.string().min(1),
        name: z.string().trim().min(1, "Enter your name.").max(120),
        password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`).max(200),
        acceptTerms: z.literal(true, { message: "Please agree to the Terms & Conditions and Privacy Policy." }),
        remember: z.boolean().optional()
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({ error: issue?.message ?? "Check the form and try again.", field: signupFieldFor(issue?.path ?? []) });
      return;
    }
    const invite = mainStore.inviteByToken(parsed.data.token);
    const org = invite ? mainStore.getOrg(invite.orgId) : undefined;
    if (!invite || !org) {
      res.status(400).json({ error: "This invite is invalid, was withdrawn, or has expired. Ask for a new one.", code: "invite_invalid" });
      return;
    }
    const weak = passwordProblem(parsed.data.password, invite.email);
    if (weak) {
      res.status(400).json({ error: weak, field: "password", code: "weak_password" });
      return;
    }
    if (mainStore.emailExists(invite.email)) {
      res.status(409).json({ error: "An account with this email already exists. Sign in instead.", field: "email", code: "email_taken" });
      return;
    }
    const account = mainStore.createAccount({
      orgId: org.id,
      email: invite.email,
      password: parsed.data.password,
      name: parsed.data.name,
      role: "member",
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: TERMS_VERSION
    });
    // Following the emailed invite proves the address.
    const verified = mainStore.markEmailVerified(account.id) ?? account;
    mainStore.markInviteAccepted(invite.id);
    try {
      const orgStore = await manager.getOrgStore(org.id);
      orgStore.createTeammateUser(verified, invite.role);
    } catch (error) {
      console.error("[team] could not create the teammate's workspace user:", error instanceof Error ? error.message : error);
    }
    issueSession(res, verified, org, parsed.data.remember ?? true);
    res.status(201).json(sessionPayload(verified, org));
  });

  app.get("/api/auth/me", (req, res) => {
    const session = mainStore.getSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json(sessionPayload(session.account, session.org));
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
  const aiAskSchema = z.object({
    question: z.string().trim().min(1).max(2000),
    // the trade the workspace was set up for — shapes the answer's vocabulary
    businessType: z.enum(businessTypeOptions).optional()
  });
  app.post("/api/ai/ask", async (req, res) => {
    const parsed = aiAskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ask a question." });
      return;
    }
    try {
      const result = await askBuildFlowAI(parsed.data.question, buildAiContext(store.bootstrap(req.account?.id)), parsed.data.businessType);
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
      const result = await importScheduleFromImages(parsed.data.images, store.bootstrap(req.account?.id));
      res.json(result);
    } catch (error) {
      console.error("[ai] /api/ai/import-schedule failed:", error instanceof Error ? error.message : error);
      res.json({ mode: "demo" });
    }
  });

  /* Where the org stands with money, from the trial it started at onboarding
     and any Stripe subscription on the owner's email (main store). */
  const billingStatusFor = (payload: BootstrapPayload, account?: { email: string }): BillingStatus => {
    const sub = account ? mainStore.getSubscriptionByEmail(account.email) : undefined;
    if (sub && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due")) return "active";
    if (payload.selectedPlan === "enterprise") return "enterprise";
    if (payload.selectedPlan === "pro" || payload.selectedPlan === "business") {
      if (!payload.trialEndsAt) return "trial";
      return new Date(payload.trialEndsAt).getTime() > Date.now() ? "trial" : "trial_expired";
    }
    return "free";
  };
  const withBilling = (payload: BootstrapPayload, account?: { email: string; emailVerifiedAt?: string | null }): BootstrapPayload => ({
    ...payload,
    billingStatus: billingStatusFor(payload, account),
    account: account ? { email: account.email, emailVerifiedAt: account.emailVerifiedAt ?? null } : null
  });

  app.get("/api/bootstrap", (req, res) => {
    // Gated route: req.account is the signed-in person, who is the active user.
    res.json(withBilling(store.bootstrap(req.account?.id), req.account));
  });

  /* ── Team: people in the workspace + open invites ────────────────────────── */
  const inviteView = (row: {
    id: string;
    email: string;
    role: string;
    invitedBy: string;
    createdAt: string;
    expiresAt: string;
    sentAt: string | null;
  }): TeamInvite => ({
    id: row.id,
    email: row.email,
    role: row.role as TeamInvite["role"],
    invitedBy: mainStore.getAccountById(row.invitedBy)?.name ?? "A teammate",
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    sentAt: row.sentAt
  });

  app.get("/api/team", (req, res) => {
    res.json({
      users: store.users(),
      invites: mainStore.openInvites(req.org!.id).map(inviteView),
      // Only the login that created the org changes what people are.
      canManage: req.account?.role === "owner",
      emailVerified: Boolean(req.account?.emailVerifiedAt)
    });
  });

  const inviteSchema = z.object({
    invites: z
      .array(
        z.object({
          email: z.string().trim().email("Enter a valid email address.").max(320),
          role: z.enum(["Project Manager", "Superintendent", "Crew Lead"])
        })
      )
      .min(1, "Add at least one email.")
      .max(20, "Invite up to 20 people at a time.")
  });
  app.post("/api/team/invites", limiter.byIp("invite", 60, HOUR), async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the emails and try again." });
      return;
    }
    const account = req.account!;
    const org = req.org!;
    // Invites are written either way; they only go OUT once the inviter's own
    // address is confirmed (see /api/auth/verify), which is what keeps an
    // unverified signup from being a spam cannon.
    const canSend = Boolean(account.emailVerifiedAt);
    const results: Array<{ email: string; status: "sent" | "held" | "skipped"; reason?: string }> = [];
    for (const item of parsed.data.invites) {
      const email = item.email.toLowerCase();
      if (email === account.email || mainStore.emailExists(email)) {
        results.push({ email, status: "skipped", reason: "Already has a BuildFlow account." });
        continue;
      }
      const { invite, token } = mainStore.createInvite({
        orgId: org.id,
        email,
        role: item.role,
        invitedBy: account.id,
        ttlMs: INVITE_TTL_MS,
        sent: canSend
      });
      if (canSend) {
        try {
          await sendInviteEmail(req, invite, token, account.name, org.name);
          results.push({ email, status: "sent" });
        } catch (error) {
          console.error("[team] invite email failed:", error instanceof Error ? error.message : error);
          results.push({ email, status: "held", reason: "Email could not be sent; resend from Settings." });
        }
      } else {
        results.push({ email, status: "held", reason: "Goes out when you confirm your email." });
      }
    }
    res.status(201).json({ results, invites: mainStore.openInvites(org.id).map(inviteView), emailVerified: canSend });
  });

  app.post("/api/team/invites/:id/resend", limiter.byIp("invite", 60, HOUR), async (req, res) => {
    const account = req.account!;
    const org = req.org!;
    if (!account.emailVerifiedAt) {
      res.status(403).json({ error: "Confirm your own email first — then invites can go out.", code: "email_unverified" });
      return;
    }
    const refreshed = mainStore.refreshInvite(String(req.params.id), org.id, INVITE_TTL_MS);
    if (!refreshed) {
      res.status(404).json({ error: "That invite is no longer open." });
      return;
    }
    try {
      await sendInviteEmail(req, refreshed.invite, refreshed.token, account.name, org.name);
      res.json({ ok: true, invite: inviteView(refreshed.invite) });
    } catch (error) {
      console.error("[team] invite email failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "We couldn't send the email just now. Please try again." });
    }
  });

  app.delete("/api/team/invites/:id", (req, res) => {
    if (!mainStore.revokeInvite(String(req.params.id), req.org!.id)) {
      res.status(404).json({ error: "That invite is no longer open." });
      return;
    }
    res.status(204).end();
  });

  // Owners set what a teammate is in the workspace: Project Manager, Superintendent or Crew Lead.
  app.patch("/api/team/users/:id", (req, res) => {
    if (req.account?.role !== "owner") {
      res.status(403).json({ error: "Only the workspace owner can change roles." });
      return;
    }
    const parsed = z.object({ role: z.enum(["Project Manager", "Superintendent", "Crew Lead"]) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose Project Manager, Superintendent or Crew Lead." });
      return;
    }
    const user = store.updateUserRole(String(req.params.id), parsed.data.role);
    if (!user) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    res.json({ user });
  });

  // Seeded sample teammates can go; real people (linked to a login) cannot be removed here.
  app.delete("/api/team/users/:id", (req, res) => {
    if (!store.removeSampleUser(String(req.params.id))) {
      res.status(400).json({ error: "Only sample teammates can be removed here." });
      return;
    }
    res.status(204).end();
  });

  /* ── Per-person settings: tutorial progress and the like ─────────────────── */
  app.put("/api/me/settings/:key", (req, res) => {
    // room for a saved Dashboard board (a dozen panels is ~700 characters), not just a word
    const parsed = z.object({ value: z.string().max(8000) }).safeParse(req.body);
    const key = String(req.params.key);
    if (!parsed.success || !/^[a-z0-9:_.-]{1,120}$/i.test(key)) {
      res.status(400).json({ error: "Provide a setting key and a string value." });
      return;
    }
    // The person behind the request: their linked workspace user, or the demo's
    // active user when signed in to the shared demo store.
    const me = store.bootstrap(req.account?.id).activeUser;
    if (!me) {
      res.status(404).json({ error: "No workspace user for this login yet." });
      return;
    }
    store.setUserSetting(me.id, key, parsed.data.value);
    res.json({ ok: true, key, value: parsed.data.value });
  });

  /* ── Org: the company name ───────────────────────────────────────────────── */
  app.patch("/api/org", (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(2, "Enter your company name.").max(160) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter your company name.", field: "name" });
      return;
    }
    const org = mainStore.updateOrgName(req.org!.id, parsed.data.name);
    res.json({ org });
  });

  app.post("/api/business-profile", (req, res) => {
    const parsed = businessProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { businessType, selectedPlan, selectedProducts, seats } = parsed.data;
    const payload = store.applyBusinessProfile(businessType, req.account, { selectedPlan, selectedProducts, seats });
    // The org record (main store) carries the plan label the admin tools read.
    if (selectedPlan && req.org) mainStore.updateOrgPlan(req.org.id, PLAN_LABELS[selectedPlan]);
    res.json(withBilling(payload, req.account));
  });

  // ── Schedule import: Primavera P6 (.xer) and MS Project XML (MSPDI) ──────────
  // Two steps on purpose: nobody commits a 2,000-activity schedule sight-unseen,
  // so /preview parses and reports without writing anything, and /commit re-parses
  // and inserts. The file itself is never stored server-side.
  const scheduleImportSchema = z.object({
    filename: z.string().min(1).max(260),
    content: z.string().min(1),
    defaultLocation: z.string().max(200).optional()
  });

  /** Imported projects need an owner BuildFlow accepts (PM/superintendent). */
  const importManagerId = (): string | undefined => {
    const users = store.users();
    const manager = users.find((user) => user.role === "Project Manager" || user.role === "Superintendent");
    return manager?.id ?? users[0]?.id;
  };

  const planScheduleImport = (body: unknown) => {
    const parsed = scheduleImportSchema.safeParse(body);
    if (!parsed.success) {
      throw new ScheduleImportError("bad_request", "A filename and file content are required.");
    }
    const managerId = importManagerId();
    if (!managerId) {
      throw new ScheduleImportError(
        "no_manager",
        "This workspace has no people yet, so imported projects would have no manager.",
        "Finish workspace setup first, then import your schedule."
      );
    }
    const schedule = parseSchedule(parsed.data.filename, parsed.data.content);
    const plan = buildImportPlan(schedule, { managerId, defaultLocation: parsed.data.defaultLocation });
    // The health check runs on the rich parsed schedule (relationships, resources,
    // actuals) — the things map() has to drop — so it's computed here, before the
    // mapping, and returned alongside the plan for both preview and commit.
    const health = analyzeSchedule(schedule);
    return { plan, health };
  };

  /** ScheduleImportError is user-actionable (wrong file, .mpp, no activities) —
   *  422 with the reason and the fix, never a bare 500. */
  const sendImportError = (res: Response, error: unknown) => {
    if (error instanceof ScheduleImportError) {
      res.status(422).json({ error: error.message, hint: error.hint, code: error.code });
      return true;
    }
    return false;
  };

  app.post("/api/import/schedule/preview", (req, res) => {
    try {
      const { plan, health } = planScheduleImport(req.body);
      res.json({
        format: plan.format,
        source: plan.source,
        stats: plan.stats,
        warnings: plan.warnings,
        health,
        projects: plan.projects.map((project) => ({
          name: project.input.name,
          targetCompletion: project.input.targetCompletion,
          phases: project.phases.map((phase) => ({ name: phase.name, startDate: phase.startDate, endDate: phase.endDate })),
          jobCount: project.jobs.length,
          // Enough of a sample to recognise your own schedule, without shipping
          // 2,000 rows back to the browser just to render a preview.
          sampleJobs: project.jobs.slice(0, 8).map((job) => ({
            name: job.name,
            phase: job.phase,
            startDate: job.startDate,
            endDate: job.endDate,
            status: job.status
          }))
        }))
      });
    } catch (error) {
      if (sendImportError(res, error)) return;
      res.status(500).json({ error: "Unable to read that schedule file." });
    }
  });

  app.post("/api/import/schedule/commit", (req, res) => {
    try {
      const { plan, health } = planScheduleImport(req.body);
      if (plan.projects.length === 0) {
        res.status(422).json({
          error: "That schedule has no importable activities.",
          hint: "Every row was a summary/roll-up or had no dates.",
          code: "nothing_to_import"
        });
        return;
      }
      const created = store.importSchedule(plan.projects);
      res.status(201).json({
        format: plan.format,
        source: plan.source,
        warnings: plan.warnings,
        health,
        created: {
          projects: created.projects.map((project) => ({ id: project.id, name: project.name, slug: project.slug })),
          jobs: created.jobs,
          phases: created.phases
        }
      });
    } catch (error) {
      if (sendImportError(res, error)) return;
      res.status(500).json({ error: "Unable to import that schedule file." });
    }
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
    const project = store.project(String(req.params.id));
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
    if (!store.project(String(req.params.id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!store.canManageProject(parsed.data.managerId)) {
      res.status(400).json({ error: "Project manager must be a project manager or superintendent" });
      return;
    }
    const project = store.updateProject(String(req.params.id), parsed.data);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  /* Cascades to the project's jobs, phases, materials, assignments and field
     records — see store.deleteProject(). */
  app.delete("/api/projects/:id", (req, res) => {
    if (!store.deleteProject(String(req.params.id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(204).send();
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
    const job = store.createJob(parsed.data);
    res.status(201).json(job);
    announce(req, { kind: "jobs", op: "job", ids: [job.id] });
  });

  app.patch("/api/jobs/:id", (req, res) => {
    const parsed = jobPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const current = store.job(String(req.params.id));
    if (!current) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    // one date may move on its own; what counts is the span the job ends up with
    const span = { startDate: parsed.data.startDate ?? current.startDate, endDate: parsed.data.endDate ?? current.endDate };
    if (!spanIsForwards(span)) {
      res.status(400).json({ error: "The finish cannot be before the start", field: "endDate" });
      return;
    }
    const { version, ...edits } = parsed.data;
    let job;
    try {
      job = store.updateJob(String(req.params.id), edits, version);
    } catch (error) {
      // Somebody else replaced the row between the read and this write: say so and change nothing.
      if (error instanceof StaleWriteError) {
        res.status(409).json({ error: error.message, code: error.code, current: error.current });
        return;
      }
      throw error;
    }
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
    announce(req, { kind: "jobs", op: "job", ids: [job.id] });
  });

  app.get("/api/schedule", (_req, res) => {
    res.json(store.assignments());
  });

  /** The CPM precedence network the Gantt schedules against. */
  /* The working week and holidays: org data the CPM engine, the calendar and the KPIs read. */
  app.get("/api/schedule/work-calendar", (_req, res) => {
    res.json(store.workCalendar());
  });
  app.put("/api/schedule/work-calendar", (req, res) => {
    const parsed = workCalendarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(store.setWorkCalendar(parsed.data));
    announce(req, { kind: "calendar", op: "calendar", ids: [] });
  });

  /* One calendar-feed link per crew; a phone subscribes to it with no sign-in, the key in the link is the pass. */
  app.get("/api/schedule/feeds", (req, res) => {
    const key = store.calendarFeedKey();
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      crews: store
        .crews()
        .map((crew) => ({ id: crew.id, name: crew.name, url: `${base}/api/feeds/${req.org?.id ?? "demo"}/${crew.id}.ics?key=${key}` }))
    });
  });

  app.get("/api/schedule/dependencies", (_req, res) => {
    res.json(store.dependencies());
  });

  /* A dependency drawn on the Gantt. 409 with a code (self | duplicate | cycle) when the network refuses it. */
  const dependencySchema = z.object({
    predecessorId: z.string().min(1),
    successorId: z.string().min(1),
    type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
    lagDays: z.number().int().min(-365).max(365).default(0)
  });
  app.post("/api/schedule/dependencies", (req, res) => {
    const parsed = dependencySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const link = store.createDependency(parsed.data);
      res.status(201).json(link);
      announce(req, { kind: "jobs", op: "job", ids: [link.predecessorId, link.successorId] });
    } catch (error) {
      if (error instanceof DependencyError) {
        res.status(409).json({ error: error.message, code: error.code });
        return;
      }
      res.status(404).json({ error: error instanceof Error ? error.message : "Could not link the jobs" });
    }
  });
  app.delete("/api/schedule/dependencies/:id", (req, res) => {
    const link = store.deleteDependency(String(req.params.id));
    if (!link) {
      res.status(404).json({ error: "Dependency not found" });
      return;
    }
    res.status(204).send();
    announce(req, { kind: "jobs", op: "job", ids: [link.predecessorId, link.successorId] });
  });

  /** Re-baseline: snapshot the current plan as the thing variance is measured from. */
  app.post("/api/schedule/baseline", (_req, res) => {
    res.json(store.setBaseline());
  });

  /* The email / text a booking earns: the crew's new day — or the clash, when it double-books. */
  const notifyAssignment = (req: express.Request, assignment: ScheduleAssignment) => {
    try {
      const job = store.get<{ name: string; projectId: string }>("SELECT name, projectId FROM jobs WHERE id = ?", [assignment.jobId]);
      const crew = store.get<{ name: string; lead: string }>("SELECT name, lead FROM crews WHERE id = ?", [assignment.crewId]);
      const project = job ? store.project(job.projectId) : undefined;
      const ctx = {
        crew: crew?.name ?? assignment.crewId,
        job: job?.name ?? assignment.jobId,
        project: project?.project.name,
        date: assignment.date
      };
      const notice = assignment.conflicts.length
        ? conflictNotice({ ...ctx, conflicts: assignment.conflicts })
        : assignmentNotice({ ...ctx, foreman: crew?.lead });
      // every week has a URL: the email opens the Week board on that week, that crew
      notice.lines.push(
        `Open the Week board: ${clientUrl.replace(/\/?$/, "/")}#schedule/week?w=${mondayOf(assignment.date)}&crew=${assignment.crewId}`
      );
      if (req.org) void sendOpsNotice(notice, opsRecipients(req.org.id));
    } catch (notifyErr) {
      console.error("[notify] assignment notice failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }
  };
  /* 409: the crew is already booked that day. Nothing was written; the client asks "book anyway?" and retries with force. */
  const answerClash = (res: Response, clashes: Parameters<typeof clashMessage>[0]) => {
    res.status(409).json({ error: clashMessage(clashes), code: "conflict", clashes });
  };

  /* What changed this week: this Monday's plan snapshot against the previous one. */
  app.get("/api/schedule/digest", (_req, res) => {
    res.json(weeklyDigestFor(store));
  });

  /** Email this week's digest to the org's planners now (the scheduler does it on Monday mornings). */
  app.post("/api/schedule/digest/send", async (req, res) => {
    const org = req.org!;
    const { digest, recipients } = await sendWeeklyDigest(store, mainStore, { id: org.id, name: org.name }, undefined, clientUrl);
    res.json({ ok: true, weekOf: digest.weekOf, recipients });
  });

  /* Sample data for a trial: the trade's starter workspace into an empty workspace, and out again. */
  app.post("/api/schedule/sample-data", (req, res) => {
    const parsed = z.object({ businessType: z.enum(businessTypeOptions).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const businessType = parsed.data.businessType ?? (store.businessType() || businessTypeOptions[0]);
    try {
      const result = store.loadSampleData(businessType);
      res.status(result.alreadyLoaded ? 200 : 201).json({ ok: true, ...result });
      if (!result.alreadyLoaded) announce(req, { kind: "jobs", op: "job", ids: [] });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Could not load sample data" });
    }
  });

  app.delete("/api/schedule/sample-data", (req, res) => {
    const removed = store.removeSampleData();
    res.json({ ok: true, removed: removed ? removed.projectIds.length : 0 });
    if (removed) announce(req, { kind: "jobs", op: "job", ids: [] });
  });

  /* One Server-Sent Events stream per open tab: schedule changes the org's other tabs made. */
  app.get("/api/schedule/events", (req, res) => {
    live.subscribe(req.org!.id, res);
  });

  app.post("/api/schedule/assign", (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { force, ...input } = parsed.data;
    try {
      // A job sits on a crew's day once: booking it there again answers with the booking it already has,
      // writes nothing, and asks nothing — there is no new clash to weigh.
      const already = store.bookingFor(input.jobId, input.crewId, input.date);
      if (already) {
        res.status(200).json(already);
        return;
      }
      const clashes = store.crewClashes(input.crewId, input.date, input.jobId);
      if (clashes.length > 0 && !force) {
        answerClash(res, clashes);
        return;
      }
      const assignment = store.assignJob(input);
      res.status(201).json(assignment);
      announce(req, { kind: "assignments", op: "book", ids: [assignment.id, assignment.jobId] });
      // Notify PMs of the new assignment — or the crew conflict if it double-books.
      notifyAssignment(req, assignment);
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
    const id = String(req.params.id);
    const { force, ...updates } = parsed.data;
    const current = store.assignment(id);
    if (!current) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const clashes = store.crewClashes(updates.crewId ?? current.crewId, updates.date ?? current.date, updates.jobId ?? current.jobId, id);
    if (clashes.length > 0 && !force) {
      answerClash(res, clashes);
      return;
    }
    let assignment;
    try {
      assignment = store.updateAssignment(id, updates);
    } catch (error) {
      // a crew or a job the move names but the workspace does not have
      res.status(404).json({ error: error instanceof Error ? error.message : "Assignment failed" });
      return;
    }
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.json(assignment);
    announce(req, { kind: "assignments", op: "move", ids: [assignment.id, assignment.jobId] });
    if (clashes.length > 0) notifyAssignment(req, assignment);
  });

  app.delete("/api/schedule/:id", (req, res) => {
    const id = String(req.params.id);
    // nothing was there to unbook: say so, and do not tell the other tabs a booking vanished
    if (!store.deleteAssignment(id)) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.status(204).send();
    announce(req, { kind: "assignments", op: "unbook", ids: [id] });
  });

  /* Everything one drop touches, in one transaction: a failed re-book changes nothing. */
  app.post("/api/schedule/rebook", (req, res) => {
    const parsed = rebookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = store.rebook(parsed.data.moves, { force: parsed.data.force });
      res.json(result);
      const booksSomething = parsed.data.moves.some((move) => move.op === "book");
      announce(req, {
        kind: "assignments",
        op: booksSomething ? "book" : "move",
        ids: [...result.assignments.flatMap((a) => [a.id, a.jobId]), ...result.removed, ...result.jobs.map((job) => job.id)]
      });
      for (const assignment of result.assignments) {
        if (assignment.conflicts.length > 0 || booksSomething) notifyAssignment(req, assignment);
      }
    } catch (error) {
      if (error instanceof RebookConflictError) {
        answerClash(res, error.clashes);
        return;
      }
      // A step written against a row somebody else has replaced: the whole batch is refused.
      if (error instanceof StaleWriteError) {
        res.status(409).json({ error: error.message, code: error.code, current: error.current });
        return;
      }
      res.status(404).json({ error: error instanceof Error ? error.message : "Re-book failed" });
    }
  });

  app.get("/api/field-updates", (_req, res) => {
    res.json(store.fieldUpdates());
  });

  /**
   * The field half of the progress loop.
   *
   * A report is evidence, so it always lands: the update is logged and the
   * reported percent is written straight onto the job. What it never does is
   * move a planned date. When the reported progress implies the plan is wrong,
   * the schedule consequence is priced through CPM and parked as a *pending*
   * variance for a PM to accept or reject — the plan is left exactly as it was.
   *
   * Responds with `{ update, variance }`; `variance` is null when the report
   * agrees with the plan, which is the common case.
   */
  app.post("/api/field-updates", (req, res) => {
    const parsed = fieldUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const update = store.createFieldUpdate(parsed.data);
    const { jobId, percentComplete, status } = parsed.data;

    if (jobId == null || percentComplete == null) {
      res.status(201).json({ update, variance: null });
      return;
    }

    // The crew's number is theirs — write it through before anything else, so a
    // failure to price the schedule never loses the report.
    store.applyFieldProgress(jobId, percentComplete, update.createdAt);

    const jobs = store.jobs();
    const detection = detectVariance(jobs, store.dependencies(), jobId, percentComplete, status, update.createdAt, store.workCalendar());
    if (!detection) {
      res.status(201).json({ update, variance: null });
      return;
    }

    const variance = store.recordVariance({
      projectId: parsed.data.projectId,
      jobId,
      fieldUpdateId: update.id,
      kind: detection.kind,
      severity: detection.severity,
      reportedPercent: percentComplete,
      plannedPercent: detection.plannedPercent,
      varianceDays: detection.varianceDays,
      proposal: detection.proposal
    });
    res.status(201).json({ update, variance });

    // Tell the PM a decision is waiting — fire-and-forget, never breaks the write.
    try {
      const detail = store.project(parsed.data.projectId);
      const job = jobs.find((item) => item.id === jobId);
      const reporter = store.get<{ name: string }>("SELECT name FROM users WHERE id = ?", [parsed.data.userId]);
      if (req.org && detail && job && variance.severity === "High")
        void sendOpsNotice(
          varianceNotice({
            project: detail.project.name,
            job: job.name,
            reportedPercent: percentComplete,
            plannedPercent: detection.plannedPercent,
            varianceDays: detection.varianceDays,
            projectSlipDays: detection.proposal.projectSlipDays,
            reporter: reporter?.name ?? "the field"
          }),
          opsRecipients(req.org.id)
        );
    } catch {
      /* notification is best-effort */
    }
  });

  /**
   * Correct a report that was filed wrong.
   *
   * Runs the same half of the progress loop the POST does, because an edited
   * percent is still a claim about where the work is: the number lands on the
   * job, and any schedule consequence is re-priced as a *pending* variance for a
   * PM. It never moves a date on its own. Re-pricing is safe to repeat because
   * `recordVariance` supersedes the open variance on that job — a correction
   * replaces the question in the PM's queue instead of stacking a second one.
   */
  app.patch("/api/field-updates/:id", (req, res) => {
    const parsed = fieldUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const update = store.updateFieldUpdate(String(req.params.id), parsed.data);
    if (!update) {
      res.status(404).json({ error: "Field update not found" });
      return;
    }

    const { jobId, percentComplete, status } = parsed.data;
    if (jobId == null || percentComplete == null) {
      res.json({ update, variance: null });
      return;
    }

    store.applyFieldProgress(jobId, percentComplete, update.createdAt);

    const jobs = store.jobs();
    const detection = detectVariance(jobs, store.dependencies(), jobId, percentComplete, status, update.createdAt, store.workCalendar());
    if (!detection) {
      res.json({ update, variance: null });
      return;
    }

    const variance = store.recordVariance({
      projectId: parsed.data.projectId,
      jobId,
      fieldUpdateId: update.id,
      kind: detection.kind,
      severity: detection.severity,
      reportedPercent: percentComplete,
      plannedPercent: detection.plannedPercent,
      varianceDays: detection.varianceDays,
      proposal: detection.proposal
    });
    res.json({ update, variance });
  });

  /**
   * Where every project stands against its own plan, plus the week-over-week move.
   *
   * Three numbers per project, all derived — none stored on the project record:
   * a forecast finish (from the pace crews are actually reporting), the working
   * days that lands ahead of or behind plan, and duration-weighted percent
   * complete. The portfolio row averages them for the headline.
   *
   * The first request in any calendar week also writes that week's snapshot, so
   * next week has a real prior reading to compare against. Capture is
   * idempotent per (week, project) — the first reading of a week is the one
   * kept, so the delta measures Monday-to-Monday rather than drifting with
   * whenever someone happened to load the page.
   */
  app.get("/api/schedule/status", (_req, res) => {
    const asOf = localIsoDate();
    const jobs = store.jobs();
    const projects = store.projects();
    // the forecast runs on the workspace's own working days and holidays (Settings › Work calendar)
    const calendar = scheduleCalendarFor(
      jobs.reduce((min, job) => (job.startDate < min ? job.startDate : min), asOf),
      store.workCalendar()
    );

    const statuses = projects
      .map((project) =>
        projectScheduleStatus(
          project.id,
          jobs.filter((job) => job.projectId === project.id),
          asOf,
          calendar,
          project.percentComplete
        )
      )
      .filter((status): status is NonNullable<typeof status> => status !== null);
    const portfolio = portfolioScheduleStatus(statuses);

    // Monday of the current week, as the snapshot key.
    const weekOf = mondayOf(asOf);
    const priorWeek = mondayOf(shiftDays(weekOf, -7));
    const prior = store.scheduleSnapshots(priorWeek);
    const priorFor = (projectId: string) => prior.find((row) => row.projectId === projectId);

    // The Dashboard's Performance tiles, read here exactly as the Dashboard
    // reads them, so a week's delta compares like with like.
    const crews = store.crews();
    const onTrackProjects = projects.filter(
      (project) => project.scheduleHealth === "On Track" || project.scheduleHealth === "Complete"
    ).length;
    const crewUtilization = crews.length > 0 ? Math.round(crews.reduce((sum, crew) => sum + crew.utilization, 0) / crews.length) : null;
    store.recordScheduleSnapshot({
      weekOf,
      projectId: "",
      daysAhead: portfolio.daysAhead,
      percentComplete: portfolio.percentComplete,
      forecastFinish: "",
      plannedFinish: "",
      onTrackProjects,
      projects: projects.length,
      crewUtilization
    });
    for (const status of statuses) {
      store.recordScheduleSnapshot({
        weekOf,
        projectId: status.projectId,
        daysAhead: status.daysAhead,
        percentComplete: status.percentComplete,
        forecastFinish: status.forecastFinish,
        plannedFinish: status.plannedFinish
      });
    }

    const priorPortfolio = priorFor("");
    res.json({
      asOf,
      weekOf,
      portfolio: {
        ...portfolio,
        // null, not 0, when there is no prior week — the client shows nothing
        // rather than implying a flat week that was never measured.
        daysAheadDelta: priorPortfolio ? portfolio.daysAhead - priorPortfolio.daysAhead : null,
        percentDelta: priorPortfolio ? portfolio.percentComplete - priorPortfolio.percentComplete : null
      },
      projects: statuses.map((status) => {
        const was = priorFor(status.projectId);
        const project = projects.find((item) => item.id === status.projectId);
        return {
          ...status,
          name: project?.name ?? "Project",
          daysAheadDelta: was ? status.daysAhead - was.daysAhead : null,
          percentDelta: was ? status.percentComplete - was.percentComplete : null
        };
      }),
      // the portfolio's weekly readings, oldest first and this week's included —
      // the Dashboard trends its tiles on them; a measure a week never held is null
      history: store.scheduleSnapshotHistory(12).map((row) => ({
        weekOf: row.weekOf,
        daysAhead: row.daysAhead,
        percentComplete: row.percentComplete,
        onTrackProjects: row.onTrackProjects ?? null,
        projects: row.projects ?? null,
        crewUtilization: row.crewUtilization ?? null
      }))
    });
  });

  app.get("/api/schedule/variances", (req, res) => {
    const status = req.query.status;
    if (typeof status === "string" && !["pending", "accepted", "rejected", "superseded"].includes(status)) {
      res.status(400).json({ error: "Unknown variance status." });
      return;
    }
    res.json(store.variances(status as ScheduleVariance["status"] | undefined));
  });

  /** Believe the field: apply the proposal to the master schedule. */
  app.post("/api/schedule/variances/:id/accept", (req, res) => {
    const parsed = varianceResolutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = store.acceptVariance(String(req.params.id), parsed.data.userId, parsed.data.note);
    if (!result) {
      res.status(404).json({ error: "No pending variance with that id." });
      return;
    }
    res.json(result);
    announce(req, { kind: "jobs", op: "dates", ids: result.movedJobIds });
  });

  /** Keep the plan. The report and the disagreement both stay on the record. */
  app.post("/api/schedule/variances/:id/reject", (req, res) => {
    const parsed = varianceResolutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const variance = store.rejectVariance(String(req.params.id), parsed.data.userId, parsed.data.note);
    if (!variance) {
      res.status(404).json({ error: "No pending variance with that id." });
      return;
    }
    res.json(variance);
  });

  app.get("/api/delayIQs", (_req, res) => {
    res.json(store.delayIQs());
  });

  app.post("/api/delayIQs", (req, res) => {
    const parsed = delayIQSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const delayIQ = store.createDelayIQ(parsed.data);
    res.status(201).json(delayIQ);
    // Notify PMs that a delayIQ was reported — fire-and-forget, never breaks the write.
    try {
      const project = store.project(delayIQ.projectId);
      if (req.org)
        void sendOpsNotice(
          delayIQNotice({
            project: project?.project.name,
            title: delayIQ.title,
            category: delayIQ.category,
            impactDays: delayIQ.impactDays,
            severity: delayIQ.severity,
            description: delayIQ.description
          }),
          opsRecipients(req.org.id)
        );
    } catch (notifyErr) {
      console.error("[notify] delayIQ notice failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }
  });

  // ── DelayIQ early-warning: what's trending late, and what it pushes ─────────
  // Read-only, proactive — no field report needed. Never mutates the plan;
  // accepting a slip stays the PM's call through the variance drawer.
  app.get("/api/delayiq/early-warning", (_req, res) => {
    // the day where the workspace is, not the UTC day: an overdue call is a day apart otherwise
    const asOf = localIsoDate();
    const risks = detectDelayRisks(store.jobs(), store.dependencies(), asOf, store.workCalendar());
    res.json({ asOf, risks });
  });

  // Follow-on: notify the affected downstream trades about one warning. A PM
  // action (not blanket auto-fire) so an early *trend* doesn't cry wolf to the
  // whole site — flip to automatic later behind a per-org setting.
  app.post("/api/delayiq/early-warning/notify", (req, res) => {
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
    if (!jobId) {
      res.status(400).json({ error: "A jobId is required." });
      return;
    }
    const risk = detectDelayRisks(store.jobs(), store.dependencies(), localIsoDate(), store.workCalendar()).find(
      (item) => item.jobId === jobId
    );
    if (!risk) {
      res.status(404).json({ error: "That job isn't currently trending behind." });
      return;
    }
    const project = store.project(risk.projectId);
    res.status(202).json({ notified: risk.affectedTrades, severity: risk.severity });
    if (req.org) {
      try {
        void sendOpsNotice(
          delayImpactNotice({
            project: project?.project.name,
            jobName: risk.jobName,
            trade: risk.trade,
            varianceDays: risk.varianceDays,
            projectSlipDays: risk.projectSlipDays,
            severity: risk.severity,
            affectedTrades: risk.affectedTrades,
            downstreamCount: risk.downstream.length
          }),
          opsRecipients(req.org.id)
        );
      } catch (notifyErr) {
        console.error("[notify] delay impact notice failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
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
    const crew = store.updateCrew(String(req.params.id), parsed.data);
    if (!crew) {
      res.status(404).json({ error: "Crew not found" });
      return;
    }
    res.json(crew);
  });

  app.delete("/api/crews/:id", (req, res) => {
    if (!store.deleteCrew(String(req.params.id))) {
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
    const equipment = store.updateEquipment(String(req.params.id), parsed.data);
    if (!equipment) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    res.json(equipment);
  });

  app.delete("/api/equipment/:id", (req, res) => {
    if (!store.deleteEquipment(String(req.params.id))) {
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
    const { plan, period, seats, email, returnTo } = parsed.data;
    const origin = parsed.data.origin ?? req.headers.origin ?? process.env.BUILDFLOW_PUBLIC_URL ?? "http://localhost:5315";
    const base = origin.replace(/\/+$/, "");
    // After onboarding or from Settings the person is signed in, so land them in the app, not on the pricing page.
    const suffix = returnTo === "onboarding" ? "&from=onboarding" : returnTo === "settings" ? "&from=settings" : "#compare-plans";
    try {
      const result = await createCheckoutSession({
        plan,
        period,
        seats: seats ?? 1,
        email,
        successUrl: `${base}/?checkout=success&plan=${plan}${suffix}`,
        cancelUrl: `${base}/?checkout=cancelled${suffix}`
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
    const sub = customerId ? store.getSubscriptionByCustomer(customerId) : email ? store.getSubscriptionByEmail(email) : undefined;
    const resolvedCustomer = customerId ?? sub?.customerId ?? undefined;
    if (!resolvedCustomer) {
      res.status(404).json({ error: "No subscription found for that account yet." });
      return;
    }
    const base = (origin ?? req.headers.origin ?? process.env.BUILDFLOW_PUBLIC_URL ?? "http://localhost:5315").replace(/\/+$/, "");
    try {
      const result = await createPortalSession({
        customerId: resolvedCustomer,
        returnUrl: parsed.data.returnTo === "settings" ? `${base}/?from=settings` : `${base}/#compare-plans`
      });
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
    const lead = store.updateSalesLead(String(req.params.id), parsed.data);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json(lead);
  });

  app.delete("/api/sales/leads/:id", (req, res) => {
    if (!store.deleteSalesLead(String(req.params.id))) {
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
    const task = store.updateSalesTask(String(req.params.id), parsed.data);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  app.delete("/api/sales/tasks/:id", (req, res) => {
    if (!store.deleteSalesTask(String(req.params.id))) {
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

  /* ── Companies + Deals ──────────────────────────────────────────────────── */
  app.post("/api/sales/companies", (req, res) => {
    const parsed = salesCompanyCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.status(201).json(store.createSalesCompany(parsed.data));
  });
  app.patch("/api/sales/companies/:id", (req, res) => {
    const parsed = salesCompanyPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const company = store.updateSalesCompany(String(req.params.id), parsed.data);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });
  app.delete("/api/sales/companies/:id", (req, res) => {
    if (!store.deleteSalesCompany(String(req.params.id))) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.status(204).send();
  });
  app.post("/api/sales/deals", (req, res) => {
    const parsed = salesDealCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const deal = store.createSalesDeal(parsed.data);
    if (deal.leadId)
      store.createSalesActivity({ leadId: deal.leadId, type: "stage", summary: `Deal created: ${deal.name} · ${deal.stage}` });
    res.status(201).json(deal);
  });
  app.patch("/api/sales/deals/:id", (req, res) => {
    const parsed = salesDealPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const before = store.salesDeal(String(req.params.id));
    const deal = store.updateSalesDeal(String(req.params.id), parsed.data);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    // a stage move shows up on the associated contact's timeline, HubSpot-style
    if (before && before.stage !== deal.stage && deal.leadId) {
      store.createSalesActivity({
        leadId: deal.leadId,
        type: "stage",
        summary: `Deal "${deal.name}" moved from ${before.stage} to ${deal.stage}`
      });
    }
    res.json(deal);
  });
  app.delete("/api/sales/deals/:id", (req, res) => {
    if (!store.deleteSalesDeal(String(req.params.id))) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    res.status(204).send();
  });

  /* ── Contact record actions: Email · Text · Call log · Meeting ──────────────
     Each one does the real thing through the services already wired into the
     backend (sendMail: SMTP / test inbox / log mode; sendSms: Twilio or log
     mode) and writes the touch to the contact's timeline. ─────────────────── */
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const formatWhen = (iso: string, timeZone?: string) => {
    for (const tz of [timeZone, "UTC"]) {
      try {
        return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: tz ?? undefined }).format(new Date(iso));
      } catch {
        /* try the next zone */
      }
    }
    return new Date(iso).toUTCString();
  };
  const icsStamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const icsEscape = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  app.post("/api/sales/leads/:id/email", async (req, res) => {
    const lead = store.salesLead(String(req.params.id));
    if (!lead) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const parsed = salesEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { subject, body, from } = parsed.data;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1c1a">${body
      .split(/\n{2,}/)
      .map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("")}${from ? `<p style="font-size:13px;color:#8a877e;margin-top:22px">${escapeHtml(from)} · BuildFlow</p>` : ""}</div>`;
    const result = await sendMail({ to: lead.email, subject, text: body, html });
    const activity = store.createSalesActivity({
      leadId: lead.id,
      type: "email",
      summary: result.ok
        ? `${result.mode === "log" ? "Email logged (delivery not configured)" : "Email sent"}: ${subject}`
        : `Email failed to send: ${subject}`
    });
    res.status(result.ok ? 201 : 502).json({ ok: result.ok, mode: result.mode, previewUrl: result.previewUrl, activity });
  });

  app.post("/api/sales/leads/:id/text", async (req, res) => {
    const lead = store.salesLead(String(req.params.id));
    if (!lead) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    if (!lead.phone) {
      res.status(400).json({ error: "This contact has no phone number." });
      return;
    }
    const parsed = salesTextSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await sendSms(lead.phone, parsed.data.body);
    const delivered = result.ok && result.mode === "twilio";
    const activity = store.createSalesActivity({
      leadId: lead.id,
      type: "text",
      summary: `${delivered ? "Text sent" : result.ok ? "Text (sent from your phone)" : "Text failed"}: ${parsed.data.body}`
    });
    res.status(result.ok ? 201 : 502).json({ ok: result.ok, delivered, mode: result.mode, configured: smsConfigured(), activity });
  });

  app.post("/api/sales/leads/:id/calls", (req, res) => {
    const lead = store.salesLead(String(req.params.id));
    if (!lead) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const parsed = salesCallLogSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { outcome, durationMinutes, notes } = parsed.data;
    const summary = `Call · ${outcome}${durationMinutes ? ` · ${durationMinutes} min` : ""}${notes ? ` — ${notes}` : ""}`;
    res.status(201).json(store.createSalesActivity({ leadId: lead.id, type: "call", summary }));
  });

  app.post("/api/sales/leads/:id/meetings", async (req, res) => {
    const lead = store.salesLead(String(req.params.id));
    if (!lead) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const parsed = salesMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      res.status(400).json({ error: "The meeting has to end after it starts." });
      return;
    }
    const meeting = store.createSalesMeeting({
      leadId: lead.id,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      agenda: input.agenda,
      organizer: input.organizer
    });
    const when = formatWhen(meeting.startsAt, input.timeZone);
    const organizer = meeting.organizer || "Your BuildFlow contact";
    const salesEmail = process.env.SALES_EMAIL ?? "sales@buildflow.com";
    let email: Awaited<ReturnType<typeof sendMail>> | null = null;
    let sms: Awaited<ReturnType<typeof sendSms>> | null = null;
    if (input.notify !== false) {
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BuildFlow//Sales Meetings//EN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        `UID:${meeting.id}@buildflow`,
        `DTSTAMP:${icsStamp(meeting.createdAt)}`,
        `DTSTART:${icsStamp(meeting.startsAt)}`,
        `DTEND:${icsStamp(meeting.endsAt)}`,
        `SUMMARY:${icsEscape(meeting.title)}`,
        meeting.location ? `LOCATION:${icsEscape(meeting.location)}` : "",
        meeting.agenda ? `DESCRIPTION:${icsEscape(meeting.agenda)}` : "",
        `ORGANIZER;CN=${icsEscape(organizer)}:mailto:${salesEmail}`,
        `ATTENDEE;CN=${icsEscape(lead.name)};RSVP=TRUE:mailto:${lead.email}`,
        "END:VEVENT",
        "END:VCALENDAR"
      ]
        .filter(Boolean)
        .join("\r\n");
      const text = [
        `Hi ${lead.name.split(" ")[0]},`,
        "",
        `${organizer} has scheduled a meeting with you.`,
        "",
        `${meeting.title}`,
        `When: ${when}`,
        meeting.location ? `Where: ${meeting.location}` : "",
        meeting.agenda ? `Agenda: ${meeting.agenda}` : "",
        "",
        "The invitation is attached — add it to your calendar. Reply to this email if the time doesn't work.",
        "",
        "— BuildFlow"
      ]
        .filter((line) => line !== "")
        .join("\n");
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
        <p style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2f6bff;margin:0 0 8px">Meeting invitation</p>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;color:#14203a">${escapeHtml(meeting.title)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#575550;margin:0 0 16px">Hi ${escapeHtml(lead.name.split(" ")[0])}, ${escapeHtml(organizer)} has scheduled a meeting with you.</p>
        <table style="border-collapse:collapse;font-size:14px;color:#14203a"><tr><td style="padding:4px 12px 4px 0;color:#8a877e">When</td><td style="padding:4px 0">${escapeHtml(when)}</td></tr>${
          meeting.location
            ? `<tr><td style="padding:4px 12px 4px 0;color:#8a877e">Where</td><td style="padding:4px 0">${escapeHtml(meeting.location)}</td></tr>`
            : ""
        }${meeting.agenda ? `<tr><td style="padding:4px 12px 4px 0;color:#8a877e;vertical-align:top">Agenda</td><td style="padding:4px 0">${escapeHtml(meeting.agenda).replace(/\n/g, "<br>")}</td></tr>` : ""}</table>
        <p style="font-size:13px;line-height:1.6;color:#575550;margin:18px 0 0">The invitation is attached — add it to your calendar. Reply to this email if the time doesn't work.</p>
        <p style="font-size:12px;color:#8a877e;margin:18px 0 0">Sent from BuildFlow</p>
      </div>`;
      email = await sendMail({
        to: lead.email,
        subject: `Meeting invitation: ${meeting.title} · ${when}`,
        text,
        html,
        attachments: [{ filename: "invite.ics", content: ics, contentType: "text/calendar; method=REQUEST" }]
      });
      if (lead.phone && smsConfigured()) {
        sms = await sendSms(
          lead.phone,
          `${organizer} scheduled "${meeting.title}" with you on ${when}. Details were emailed to ${lead.email}.`
        );
      }
      const via =
        [email.ok && email.mode !== "log" ? "email" : "", sms?.ok && sms.mode === "twilio" ? "sms" : ""].filter(Boolean).join("+") ||
        "none";
      store.setSalesMeetingNotified(meeting.id, via);
      meeting.notifiedVia = via;
    }
    const activity = store.createSalesActivity({
      leadId: lead.id,
      type: "meeting",
      summary: `Meeting scheduled: ${meeting.title} · ${when}${meeting.location ? ` · ${meeting.location}` : ""}${
        input.notify === false
          ? ""
          : meeting.notifiedVia === "none"
            ? " · invitation logged (delivery not configured)"
            : ` · invitation sent by ${meeting.notifiedVia.replace("+", " and ")}`
      }`
    });
    res.status(201).json({ meeting, activity, notification: { email, sms } });
  });

  app.get("/api/support/conversations", (req, res) => {
    const dept = departmentEnum.safeParse(req.query.department);
    res.json(store.supportConversations(dept.success ? dept.data : undefined));
  });

  app.get("/api/support/conversations/:id/messages", (req, res) => {
    res.json(store.supportMessages(String(req.params.id)));
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
    const message = store.addSupportMessage(String(req.params.id), parsed.data);
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
    const conversation = store.updateSupportConversation(String(req.params.id), parsed.data);
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
    const result = store.deleteSupportAgent(String(req.params.id));
    if ("error" in result) {
      res.status(result.error.includes("owner") ? 403 : 404).json({ error: result.error });
      return;
    }
    res.status(204).send();
  });
  /* ─────────────────── end Sales & Customer-Service Desk ───────────────────── */

  registerScheduleToolRoutes(app, store);

  return app;
}
