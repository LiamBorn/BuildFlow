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
  invitablePermissionLevels,
  isPermissionLevel,
  permissionLevelLabels,
  type PermissionLevel,
  type TeamInvite,
  type User,
  type OnboardingProductId,
  type PlanId,
  localIsoDate,
  passwordProblem,
  portfolioScheduleStatus,
  JOB_STATUSES,
  projectScheduleStatus,
  scheduleCalendarFor,
  type ScheduleVariance,
  type WorkspaceSummary,
  type WorkspacesPayload
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
  type Org,
  type WorkspaceMemberRow
} from "./database.js";
import type { ScheduleAssignment, ScheduleLiveEvent, WeatherWindow } from "@buildflow/shared";
import { StoreManager } from "./stores.js";
import { ScheduleLiveHub } from "./schedule/live.js";
import { sendWeeklyDigest, weeklyDigestFor } from "./schedule/digest.js";
import { createRateLimiter, createLoginGuard, createBackendFromEnv, humanSeconds, clientIp } from "./rateLimit.js";
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
  stateSecretWarning,
  type OAuthProvider
} from "./oauth.js";
import {
  CALENDAR_PROVIDERS,
  calendarAuthorizeUrl,
  calendarConfigured,
  calendarPopupPage,
  exchangeCalendarCode,
  fetchCalendarEvents,
  refreshCalendarTokens,
  sortEvents,
  type CalendarEvent,
  type CalendarProvider
} from "./calendar.js";
import { assertRoutePolicyCovers, can, demoLockOn, installRoutePolicy, outranks } from "./permissions.js";
import crypto from "node:crypto";
import {
  parseCookies,
  verifyPassword,
  secretsMatch,
  cookiesAreSecure,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieOptions
} from "./auth.js";
import { askBuildFlowAI, buildAiContext, importScheduleFromImages } from "./ai.js";
import { analyzeSchedule, buildImportPlan, parseSchedule, ScheduleImportError } from "./import/index.js";
import { detectDelayRisks } from "./delayiq.js";
import { activeSites, forecastForSites, placeForQuery, WeatherUnavailableError } from "./weather.js";
import { detectConflicts, parseClock, rescheduleDates, weatherCheckFor } from "./weatherConflicts.js";
import { createRequestLogger } from "./requestLog.js";
import { metrics } from "./metrics.js";

// Attach the authenticated account/org to the request (set by the ops auth gate).
declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
    org?: Org;
    /** This session is the shared demo: it may read, and change nothing (permissions.ts). */
    readOnlyDemo?: boolean;
  }
}
import {
  sendMail,
  contactSalesThankYouEmail,
  feedbackEmail,
  contactSalesLeadEmail,
  type MailAttachment,
  type SalesLead,
  verifyEmailMessage,
  resetPasswordMessage,
  inviteMessage
} from "./email.js";
import { updatesSubscriptionEmail, waitlistConfirmationEmail, waitlistLaunchEmail } from "./email.js"; // waitlist (removable feature)
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
  type OpsRecipients
} from "./notify.js";
import { buildMoveProposal, detectVariance, gradeSeverity } from "./variance.js";
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

/* A phase's dates, either on its own: the Month calendar's completion marker writes the finish. */
const phasePatchSchema = z
  .object({ startDate: isoDate.optional(), endDate: isoDate.optional() })
  .refine((body) => body.startDate !== undefined || body.endDate !== undefined, "Nothing to change");

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

const weatherLocationSchema = z.object({
  query: z.string().trim().min(2).max(200)
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
/* "Give feedback", from the Dashboard tab. Only the words are the person's; who they are and
   which workspace they are in come from the session, never from the body. */
const FEEDBACK_MAX_FILES = 3;
const FEEDBACK_MAX_BYTES = 10 * 1024 * 1024;
/* An attachment arrives as a data URL: the whole file, base64, inside the JSON body.
   Every part of it is the sender's claim, so none of it is taken on trust — the media
   type has to LOOK like one (a stray newline would otherwise land in a mail header)
   and only base64 is accepted, because that is the one form whose size can be read
   off the text without decoding it. */
const FEEDBACK_DATA_URL = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,]*)*;base64,([A-Za-z0-9+/]*={0,2})$/i;
const FEEDBACK_MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

const feedbackSchema = z.object({
  category: z.enum(["idea", "bug", "praise", "other"]).default("other"),
  message: z.string().trim().min(1, "Please write a few words.").max(4000),
  page: z.string().trim().max(80).default("dashboard"),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().max(200).default(""),
        type: z.string().trim().max(120).default(""),
        // bounded well above the decoded cap: base64 inflates by a third, and the
        // string is measured properly a moment later
        dataUrl: z.string().max(FEEDBACK_MAX_BYTES * 2)
      })
    )
    .max(FEEDBACK_MAX_FILES, `Up to ${FEEDBACK_MAX_FILES} files, please.`)
    .default([])
});

/* What to tell the caller when middleware — the body parser, in practice — rejected the
   request before any route saw it. Deliberately does not repeat the parser's own message,
   which describes the parser ("request entity too large", "Unexpected token } in JSON"). */
function clientErrorMessage(status: number, type: unknown): string {
  if (status === 413) return "That request is too large.";
  if (type === "entity.parse.failed") return "That request body is not valid JSON.";
  if (status === 400) return "That request could not be read.";
  return "That request was refused.";
}

/* A file name out of a browser is a string like any other — it can carry a path, a
   newline, or nothing at all. Reduce it to something a mail client can write to disk. */
function safeFileName(raw: string) {
  const cleaned = raw
    // A newline in a file name is how a header gets injected into the mail below, so
    // matching this control range IS the point rather than an oversight.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "attachment";
}

/* Turns the posted data URLs into mail attachments. The check that matters is the
   TOTAL size of the set, and it is measured from the base64 text BEFORE any of it is
   decoded — so an oversized body is refused rather than allocated. */
function feedbackAttachments(posted: { name: string; type: string; dataUrl: string }[]) {
  const files: MailAttachment[] = [];
  const listed: { name: string; size: number }[] = [];
  let total = 0;
  for (const one of posted) {
    const match = FEEDBACK_DATA_URL.exec(one.dataUrl);
    if (!match) return { ok: false as const, error: "That file could not be read. Please try attaching it again." };
    const base64 = match[2] ?? "";
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    total += size;
    if (total > FEEDBACK_MAX_BYTES) {
      return {
        ok: false as const,
        error: `Attachments have to come to under ${Math.round(FEEDBACK_MAX_BYTES / (1024 * 1024))}MB in all.`
      };
    }
    const name = safeFileName(one.name);
    // the data URL's own media type wins: it is the one that describes what was encoded
    const contentType = match[1] ?? (FEEDBACK_MEDIA_TYPE.test(one.type) ? one.type : undefined);
    files.push({ filename: name, content: base64, encoding: "base64", contentType });
    listed.push({ name, size });
  }
  return { ok: true as const, files, listed };
}

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

/**
 * An origin the CALLER supplied, resolved to one we are willing to send a person to.
 *
 * Three places need this: the origin in an emailed link — a verification link, an invite, a password
 * reset — and the post-payment redirect on the two billing routes, which accept an `origin` in the
 * request BODY as well as the header. Each had grown its own fallback chain; this is the one rule.
 * The emailed reset link is the sharpest case and the rest of this comment is about it.
 *
 * These carry a token, so whoever owns the origin owns the token. The origin used to be
 * `req.headers.origin` whenever it looked like a URL, and any client can send any Origin it likes:
 *
 *   curl -X POST <site>/api/auth/reset/request -H 'Origin: https://evil.example' -d '{"email":"…"}'
 *
 * That answers 200 either way (deliberately, so nobody can enumerate accounts), and the person whose
 * address it was then receives a genuine BuildFlow email — real sender, real wording, real token —
 * whose link points at evil.example. The token sits in the fragment, so evil.example's SERVER never
 * sees it, but its page reads `location.hash` in one line. One click is an account.
 *
 * So: once the deployment has told us its own address, that address wins and the header is only
 * consulted through the allowlist. `safeReturnTo` does the comparing, the same way the OAuth return
 * is already checked — and it lets a localhost origin through, which is fine here because a link to
 * the victim's own machine is no use to anyone else.
 *
 * With BUILDFLOW_CLIENT_URL unset there is nothing trustworthy to prefer, so the header is still
 * used rather than sending everyone a localhost link — that is the shape a developer runs, where the
 * client is on another port entirely. A published deployment in that state is warned about at
 * startup by `emailLinkWarning` below, because it is the one case where this is still open.
 */
export function trustedAppOrigin(args: {
  originHeader: string | undefined;
  configuredClientUrl: string | undefined;
  fallback: string;
  allowed: string[];
}): string {
  const header = typeof args.originHeader === "string" && /^https?:\/\//.test(args.originHeader) ? args.originHeader : undefined;
  if (args.configuredClientUrl?.trim()) return safeReturnTo(header, args.allowed);
  return (header ?? args.fallback).replace(/\/+$/, "");
}

/**
 * Said once when a proxy is plainly in front and TRUST_PROXY has not been set.
 *
 * Unset is the SAFE default and stays that way: `req.ip` is then the socket address, which a client
 * cannot choose, so nobody can mint a fresh rate-limit bucket per request. What it cannot do is tell
 * two visitors apart behind a load balancer, because every request then arrives from the proxy and
 * shares one bucket. That is not a small degradation:
 *
 *   · the ops lockout counts ten wrong tokens and then refuses — from ONE address. Shared, one
 *     scanner locks out the operator too, which is the moment they most need those routes.
 *   · the public ceilings become global rather than per visitor, so one caller's ten waitlist
 *     signups spend everybody's.
 *   · `req.secure` is false, so HSTS is never sent, however the connection really arrived.
 *
 * .replit passes TRUST_PROXY=1, so a Replit deployment is right by default. This exists for the
 * deployment that is not, and it is conditioned on a forwarded header actually being present rather
 * than on NODE_ENV — a server genuinely exposed with nothing in front should hear nothing, and a
 * developer behind a tunnel should hear it. Once per process: a line per request would be the
 * recoverLock mistake, thousands of copies burying the log somebody is reading.
 */
export function proxyHeaderWarning(trustProxySet: boolean, headers: { [key: string]: unknown }): string | null {
  if (trustProxySet) return null;
  if (!headers["x-forwarded-for"] && !headers["x-forwarded-proto"]) return null;
  return (
    "🛡️  ⚠️  A request arrived with X-Forwarded-* headers but TRUST_PROXY is not set, so BuildFlow is " +
    "treating the proxy as the client. Every visitor then shares one rate-limit bucket — one caller can " +
    "spend the public ceilings for everyone and lock everyone out of /api/ops — and HSTS is never sent " +
    "because the connection looks like plain http. Set TRUST_PROXY=1 for a single proxy in front."
  );
}

/** Said at startup when a published deployment has not told us its own address. */
export function emailLinkWarning(vars: { NODE_ENV?: string; BUILDFLOW_CLIENT_URL?: string } = process.env): string | null {
  if (vars.NODE_ENV !== "production") return null;
  if (vars.BUILDFLOW_CLIENT_URL?.trim()) return null;
  return (
    "🔗 ⚠️  BUILDFLOW_CLIENT_URL is not set. Emailed verification, invite and password-reset links — and the " +
    "redirect after a Stripe checkout — are therefore built from the origin the CALLER supplied, which any " +
    "client can set to any address. A stranger can make BuildFlow email one of your users a real reset link " +
    "pointing at their site. Set BUILDFLOW_CLIENT_URL to this app's address; it then wins over the caller."
  );
}

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

  /* Auth abuse controls. One backend shared by both, so the sign-in cap and the per-email
     lock are counted in the same place: Redis when REDIS_URL is set — which is what makes
     the limits hold across more than one API instance — and in this process otherwise.
     See rateLimit.ts, including why an unreachable Redis falls back rather than refusing. */
  const limitBackend = createBackendFromEnv();
  const limiter = createRateLimiter(limitBackend);
  const loginGuard = createLoginGuard(limitBackend);
  /* The same primitive again, for the ops token, keyed on the caller rather than an account.
     Ten wrong tokens in fifteen minutes from one address buys a fifteen-minute lockout. */
  const opsGuard = createLoginGuard(limitBackend, 10, 15 * 60_000, 15 * 60_000);
  const HOUR = 60 * 60 * 1000;
  const QUARTER = 15 * 60 * 1000;
  const VERIFY_TTL_MS = 24 * HOUR;
  const RESET_TTL_MS = HOUR;
  /** The origins that ARE this app: the configured client URL, and the public URL when it differs. */
  const appOrigins = () => [clientUrl.replace(/\/+$/, ""), (process.env.BUILDFLOW_PUBLIC_URL ?? clientUrl).replace(/\/+$/, "")];
  /** Where a billing redirect may land. Same rule; the body may offer an origin here as well as the header. */
  const redirectBase = (req: express.Request, supplied?: string) =>
    trustedAppOrigin({
      originHeader: supplied ?? (typeof req.headers.origin === "string" ? req.headers.origin : undefined),
      configuredClientUrl: process.env.BUILDFLOW_CLIENT_URL,
      fallback: process.env.BUILDFLOW_PUBLIC_URL ?? "http://localhost:5315",
      allowed: appOrigins()
    });
  /** The web app's origin for emailed links. See trustedAppOrigin — the caller is not trusted once configured. */
  const appOriginFor = (req: express.Request) =>
    trustedAppOrigin({
      originHeader: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
      configuredClientUrl: process.env.BUILDFLOW_CLIENT_URL,
      fallback: clientUrl,
      allowed: appOrigins()
    });
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
    invite: { email: string; permission: PermissionLevel },
    token: string,
    inviterName: string,
    orgName: string
  ) => {
    const link = `${appOriginFor(req)}/#accept-invite?token=${encodeURIComponent(token)}`;
    await sendMail({ to: invite.email, ...inviteMessage(inviterName, orgName, permissionLevelLabels[invite.permission], link) });
  };
  // Tests read tokens back from the response instead of parsing log-mode email.
  const exposeTokens = process.env.NODE_ENV === "test" || process.env.BUILDFLOW_EXPOSE_AUTH_TOKENS === "1";

  const app = express();

  /* Said once, at startup, because the failure it describes does not announce itself: a rejected
     sign-in looks like the provider's fault. Only printed when a provider is actually configured. */
  {
    const providers = { ...configuredProviders(), ...calendarConfigured() };
    const warning = stateSecretWarning(Object.values(providers).some(Boolean));
    if (warning) console.warn(warning);
    const links = emailLinkWarning();
    if (links) console.warn(links);
  }
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
  /**
   * Whether to believe X-Forwarded-For.
   *
   * Express only derives `req.ip` from that header once it knows which proxies to trust,
   * and every rate limiter in this file keys on `req.ip` via clientIp(). Leaving it unset
   * is therefore the safe default — the socket address is used, and a client cannot choose
   * its own limiter bucket. Behind a load balancer the real address is *only* in the
   * header, so a deployment that has one sets TRUST_PROXY: "1" for a single proxy in
   * front (the common case), "true" to trust the whole chain, or a comma-separated list
   * of proxy IPs/subnets. Set this to the number of proxies you actually run; "true"
   * behind a proxy that does not overwrite the header puts the spoof back.
   */
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true" ? true : trustProxy);
  }
  /* Noticed from a real request rather than from the environment: the question is not whether someone
     MEANT to run a proxy, it is whether one is there and being ignored. See proxyHeaderWarning. */
  let saidAboutProxy = false;
  app.use((req, _res, next) => {
    if (!saidAboutProxy) {
      const warning = proxyHeaderWarning(Boolean(trustProxy), req.headers);
      if (warning) {
        saidAboutProxy = true;
        console.warn(warning);
      }
    }
    next();
  });
  /* Every route registered from here on gets its permission check prepended, and any route
     with no entry in ROUTE_POLICY throws as it is registered. See server/src/permissions.ts. */
  installRoutePolicy(app);
  // Expose the store manager to the server entrypoint (backup scheduler/boot snapshot) + ops routes.
  app.locals.storeManager = manager;
  // So the entrypoint can say at boot whether the auth limits are shared or per-process.
  app.locals.rateLimitBackend = limitBackend.kind;
  const clientUrl = process.env.BUILDFLOW_CLIENT_URL ?? "http://localhost:5175/";

  // Cross-origin cookies require an explicit origin + credentials (NOT "*").
  // Allow any localhost dev port, plus any origin listed in CORS_ORIGIN (prod).
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // A dev machine serves the client from some localhost port, so those origins are waved
  // through — but only off production. In production the allowlist is CORS_ORIGIN and
  // nothing else: these responses carry credentials, so anything the browser will let
  // read them is something that can read a signed-in workspace.
  const allowLocalhostOrigins = process.env.NODE_ENV !== "production";
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl / same-origin / server-to-server
        if (allowLocalhostOrigins && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        return cb(null, allowedOrigins.includes(origin));
      },
      credentials: true
    })
  );
  /* Baseline response headers. This API answers JSON and one text/calendar feed, so the
     cheap, no-configuration protections are the right ones: never let a browser re-guess
     a response's type, never let the JSON be framed, and never leak a feed URL (which
     carries its key in the query string) into another site's referer log. */
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    /* HSTS only when the connection really is secure — `req.secure` reads x-forwarded-proto through
       `trust proxy`, which TRUST_PROXY sets and .replit passes. Sending it over plain http would pin
       a developer's browser to https for localhost, which is a thing you then have to go and undo in
       browser settings. No `preload`: that is a submission to a list shipped inside browsers, and it
       is not this file's decision to make on someone's domain. */
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  });
  /* Before the body parsers on purpose: a request the parser refuses (413, 400) never
     reaches a route, and is exactly the kind you want a line for. It reads req.org and
     req.account, which the auth gate below sets long before the response finishes. */
  app.use(createRequestLogger());
  /**
   * Body limits, per route rather than one number for the whole API.
   *
   * A handful of routes genuinely carry megabytes: a field update's photos, a feedback
   * report's attachments, the images the AI importer reads a schedule out of, and a P6 or
   * MS Project file. Those needed 25mb — but the limit was applied to EVERY route, so any
   * caller, signed in or not, could make the server buffer 25MB by posting it to
   * /api/auth/login. A few concurrent requests is then a memory-exhaustion DoS that costs
   * an attacker nothing.
   *
   * The four that need the room get it by path; everything else gets 2mb, which is still
   * twenty times Express's own default and far more than any of these JSON shapes. Paths
   * are lowercased before the test: case-sensitive routing means an odd-cased path will
   * 404 at the router, but the choice of parser should not depend on that happening first.
   */
  const largeBodyParser = express.json({ limit: "25mb" });
  const standardBodyParser = express.json({ limit: "2mb" });
  const wantsLargeBody = (rawPath: string) => {
    const p = rawPath.toLowerCase();
    return (
      p.startsWith("/api/field-updates") || // photos, on the POST and the PATCH
      p.startsWith("/api/import/schedule") || // a posted .xer / MSP XML file
      p === "/api/ai/import-schedule" || // up to six images of someone else's schedule
      p === "/api/feedback" // up to three attachments
    );
  };
  // The Stripe webhook must read the RAW body to verify its signature, so it's the
  // one route that skips JSON parsing (it uses express.raw() locally instead).
  app.use((req, res, next) => {
    if (req.path === "/api/billing/webhook") return next();
    return (wantsLargeBody(req.path) ? largeBodyParser : standardBodyParser)(req, res, next);
  });

  // ── Auth gate: protect the customer HUD data routes and bind the tenant store.
  // Only these prefixes are gated; auth/health/waitlist/contact-sales/billing
  // stay public and use mainStore (ALS unset).
  const OPS_PREFIXES = [
    "/api/bootstrap",
    "/api/business-profile",
    "/api/projects",
    /* A phase belongs to a project and lives in the tenant file beside it. It was NOT
       here until 2026-09-20, and the symptom was the Month calendar: dragging a phase's
       "<name> Complete" marker to another day answered "Phase not found", because `store`
       had fallen through to mainStore and the caller's phase is not in it. The 404 is the
       kinder half — the seeded ids are deterministic per TRADE PROFILE, not per
       workspace (businessProfiles.ts: `phase-<trade>-<n>-<name>`), so where an id does
       exist in the main store the same request writes to the wrong database instead. */
    "/api/phases",
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
    // WeatherIQ forecasts the caller's own job sites, so it reads their projects.
    "/api/weather",
    // Team (invites, sample teammates) and org (name) live behind the session too.
    "/api/team",
    "/api/org",
    "/api/me",
    // A person's own workspaces: listing, creating and switching all need the login resolved.
    "/api/workspaces",
    /* Step 1 of the workspace-permissions plan. These were public, and being public was
       not merely a missing permission check — it was a live defect. `store` (:551) is a
       Proxy that resolves to `orgStoreALS.getStore() ?? mainStore`, so a route outside
       this gate never binds a tenant and silently reads the SHARED main store. So
       /api/ai/ask has always shipped mainStore's bootstrap to Claude instead of the
       caller's own workspace: wrong answers for the customer, and the wrong data
       leaving the building. `req.account` was also always undefined there, so the
       bootstrap was built for nobody.
       Billing is here because the plan makes it Owner-only, and a permission cannot be
       checked on a request that has no account attached. */
    "/api/ai",
    "/api/billing"
  ];
  /**
   * Paths that sit UNDER a gated prefix but must stay public, checked before the prefix
   * match so the prefix list can stay coarse.
   * - The Stripe webhook is called by Stripe, which has no session cookie. It is
   *   authenticated instead by verifying the signature header (:2629), which is the
   *   stronger check for that caller.
   * - Billing status is the plan catalogue and whether Stripe is wired. It holds no
   *   workspace data, and the public pricing page is its natural caller.
   * - Checkout must answer a visitor who has no workspace yet, because requiring a session
   *   would mean you have to sign up before you can pay. A caller who DOES have a session
   *   is buying for their workspace, and the route policy requires the Owner for that --
   *   see AnonymousOrCapability in permissions.ts. This is why the gate below resolves a
   *   session whenever a cookie is present rather than only on gated paths: without an
   *   identity on a public path, "open to a visitor, Owner-only inside a workspace" is not
   *   expressible.
   */
  const PUBLIC_EXCEPTIONS = new Set(["/api/billing/webhook", "/api/billing/status", "/api/billing/checkout"]);
  /**
   * Whether this path needs a session, compared in one case so no spelling of it can disagree
   * with the router about which route it is. `/api/delayIQs` is the one prefix with capitals of
   * its own, which is why both sides are folded rather than just the incoming path.
   */
  const OPS_PREFIXES_LOWER = OPS_PREFIXES.map((prefix) => prefix.toLowerCase());
  const isOpsPath = (path: string) => {
    const p = path.toLowerCase();
    if (PUBLIC_EXCEPTIONS.has(p)) return false;
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

  /**
   * Two separate jobs, in this order, because they are not the same question:
   *   1. WHO is calling — resolved whenever a session cookie is present, on every path.
   *   2. Whether this path REQUIRES a caller, and if so, binding their tenant store.
   *
   * Splitting them is what lets a public route still know who it is talking to. One route
   * needs that (starting a checkout: open to a visitor with no workspace, Owner-only for a
   * caller who has one), and the alternative was a second authorization mechanism living
   * inside a handler, invisible to the policy table.
   *
   * A public path gets identity and nothing else: the ALS is left unset, so `store` still
   * resolves to mainStore there exactly as before. The extra work on an unauthenticated
   * request is one short-circuit on a missing cookie.
   */
  app.use(async (req, res, next) => {
    const gated = isOpsPath(req.path);
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = token ? mainStore.getSession(token) : undefined;
    if (!session) {
      if (!gated) return next();
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    req.account = session.account;
    req.org = session.org;
    /* The demo is one shared account in one shared workspace, handed to every signed-out visitor as
       an owner. Marked here, where the session is read, so the permission guard can refuse its writes
       without permissions.ts having to know what a demo is — or having to import the data layer to
       find out.

       Only where the address is public. On a developer's machine, and in the test suite, the demo is
       the sandbox you work in: it is the identity most of these tests sign in as, and locking it
       would be locking the workbench rather than the shop window. DEMO_READ_ONLY forces it either
       way — which is also how the tests for it get a locked demo without pretending to be deployed. */
    req.readOnlyDemo = demoLockOn() && session.account.email === DEMO_ACCOUNT_EMAIL;
    // Identity is enough for a public path; only a gated one binds the tenant store.
    if (!gated) return next();
    try {
      const orgStore = await manager.getOrgStore(session.org.id);
      orgStoreALS.run(orgStore, () => next());
    } catch {
      res.status(500).json({ error: "Workspace unavailable." });
    }
  });

  app.get("/", (req, res, next) => {
    // One process serving the built pages too (serveClient.ts, a deployment): the landing page is here.
    if (req.app.locals.servesPages) return next();
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
    // Constant-time: this route is outside the session gate on purpose, so the key in the
    // link is the only thing standing between a guess and the workspace's whole schedule.
    if (!secretsMatch(String(req.query.key ?? ""), orgStore.calendarFeedKey())) {
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

  /* Answered true unconditionally, which made it useless as a health check: a load
     balancer reading it would keep sending traffic to an instance whose database had
     stopped answering, because the only thing it proved was that the process could still
     serve a route. It now does a trivial read and reports 503 when that fails, which is
     the signal a balancer acts on. The main store is the right one to ask — it holds the
     auth tables, so nothing works without it — and asking every tenant file instead would
     make the check as expensive as the thing it protects. */
  app.get("/api/health", (_req, res) => {
    try {
      if (!mainStore.ping()) throw new Error("database did not answer");
      res.json({ ok: true });
    } catch (error) {
      console.error("[health] database unreachable:", error instanceof Error ? error.message : error);
      res.status(503).json({ ok: false, error: "Database unavailable." });
    }
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
  /**
   * The session payload the client keeps. `demo` marks the shared demo login, which is not a real
   * signup; `readOnly` says that demo is locked here.
   *
   * The client cannot work the second one out for itself. Whether the demo is locked depends on where
   * the server is running — on by default in production, off on a developer's machine, and either way
   * with DEMO_READ_ONLY — so `demo: true` means "writable sandbox" on a laptop and "look, do not
   * touch" on a public address. Telling the client rather than letting it infer is also what keeps
   * one rule: permissions.ts decides, and the UI reports the same decision instead of keeping a copy
   * that can drift from it.
   */
  const sessionPayload = (account: Account, org: Org) => {
    const demo = account.email === DEMO_ACCOUNT_EMAIL;
    return { account, org, demo, readOnly: demo && demoLockOn() };
  };
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

  app.post("/api/auth/login", limiter.byIp("login", 30, QUARTER), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }
    // Five wrong passwords lock the email for fifteen minutes — the answer is
    // the same whether or not the account exists, so this reveals nothing.
    const locked = await loginGuard.lockedFor(parsed.data.email);
    if (locked > 0) {
      res.setHeader("Retry-After", String(locked));
      res
        .status(429)
        .json({ error: `Too many sign-in attempts. Try again in ${humanSeconds(locked)}, or reset your password.`, retryAfterSec: locked });
      return;
    }
    const row = mainStore.getAccountRowByEmail(parsed.data.email);
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      await loginGuard.noteFailure(parsed.data.email);
      res.status(401).json({ error: "Incorrect email or password." });
      return;
    }
    await loginGuard.clear(parsed.data.email);
    const org = mainStore.getOrg(row.orgId);
    if (!org) {
      res.status(500).json({ error: "Account workspace is missing." });
      return;
    }
    issueSession(res, toAccount(row), org, parsed.data.remember ?? true);
    res.json(sessionPayload(toAccount(row), org));
  });

  // Credential-free demo sign-in — powers "Preview the live demo".
  /* Generous on purpose: this is the fallback the client uses when a bootstrap comes back 401, so a
     visitor can reach it a few times in a session legitimately. The limit is here to stop a script
     minting sessions by the thousand, not to ration the demo. */
  app.post("/api/auth/demo", limiter.byIp("demo", 30, QUARTER), async (_req, res) => {
    const row = mainStore.getAccountRowByEmail(DEMO_ACCOUNT_EMAIL);
    const org = row ? mainStore.getOrg(row.orgId) : undefined;
    if (!row || !org) {
      res.status(500).json({ error: "Demo account is unavailable." });
      return;
    }
    const demo = toAccount(row);
    // The demo is shared, so a fresh look at it starts with just the demo workspace: the
    // workspaces the last visitor created beside it go, files and all (2026-09-15).
    for (const membership of mainStore.workspacesForAccount(demo.id)) {
      if (membership.kind !== "extra") continue;
      mainStore.removeWorkspace(membership.orgId);
      await manager.dropOrgStore(membership.orgId);
    }
    // The demo workspace is seeded, never onboarded, so it never recorded the "trade picked"
    // date that says onboarding is done -- and switching BACK to it from a workspace the demo
    // created went to onboarding, which turns a demo session away. It is set up; say so.
    if (!mainStore.onboardingCompletedAt()) mainStore.setWorkspaceSetting("onboardingCompletedAt", new Date().toISOString());
    issueSession(res, demo, org);
    res.json({ account: demo, org });
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

  /* ── Google Calendar / Outlook, read-only ────────────────────────────────
     The Dashboard's Meetings panel. Same credentials as sign-in above, a wider
     scope, and the refresh token kept so the connection outlives the redirect.
     See server/src/calendar.ts for what has to be registered with each provider
     before any of this can do anything; until then `configured` is false and the
     panel says so rather than offering a button that cannot work. */
  const CAL_COOKIE = "bf_cal";
  const CAL_COOKIE_PATH = "/api/calendar";
  /* `popup`: the Meetings panel opened the consent page in a small window and is waiting on it, so the
     callback answers THAT window (calendarPopupPage) instead of sending the tab back to the app. */
  type CalendarState = { provider: CalendarProvider; state: string; verifier: string; returnTo: string; popup: boolean; issuedAt: number };
  const isCalProvider = (value: string): value is CalendarProvider => (CALENDAR_PROVIDERS as string[]).includes(value);
  const calCallbackUri = (req: express.Request, provider: CalendarProvider) => `${apiOriginFor(req)}/api/calendar/${provider}/callback`;
  const calDone = (res: Response, returnTo: string, params: { calendar: string; provider?: string; reason?: string }, popup = false) => {
    res.clearCookie(CAL_COOKIE, { path: CAL_COOKIE_PATH });
    if (popup) {
      res.status(200).type("html").send(calendarPopupPage(params, returnTo));
      return;
    }
    const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    res.redirect(`${returnTo}/?${query.toString()}#dashboard`);
  };

  /** An access token that is good right now, refreshing and re-storing it when it is not. */
  const calendarAccessToken = async (accountId: string, provider: CalendarProvider): Promise<string | null> => {
    const row = mainStore.calendarConnection(accountId, provider);
    if (!row) return null;
    // a minute of head room, so a token does not expire mid-request
    if (row.accessToken && row.expiresAt > Date.now() + 60_000) return row.accessToken;
    try {
      const fresh = await refreshCalendarTokens(provider, row.refreshToken);
      mainStore.updateCalendarTokens(accountId, provider, {
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken ?? row.refreshToken,
        expiresAt: fresh.expiresAt
      });
      return fresh.accessToken;
    } catch {
      // A refresh token the provider has revoked cannot be recovered, and leaving the row would
      // make the panel claim a connection that no longer works. Drop it; the panel offers Connect.
      mainStore.deleteCalendarConnection(accountId, provider);
      return null;
    }
  };

  app.get("/api/calendar/status", (req, res) => {
    const configured = calendarConfigured();
    const rows = mainStore.calendarConnectionsForAccount(req.account!.id);
    res.json({
      providers: Object.fromEntries(
        CALENDAR_PROVIDERS.map((provider) => {
          const row = rows.find((candidate) => candidate.provider === provider);
          // `email` is the only thing about a connection the client is ever told
          return [provider, { configured: configured[provider], connected: Boolean(row), email: row?.email ?? "" }];
        })
      )
    });
  });

  app.get("/api/calendar/:provider/start", limiter.byIp("calendar-start", 30, QUARTER), (req, res) => {
    const provider = String(req.params.provider);
    const allowedReturn = appOrigins();
    const returnTo = safeReturnTo(typeof req.query.returnTo === "string" ? req.query.returnTo : undefined, allowedReturn);
    const popup = req.query.mode === "popup";
    if (!isCalProvider(provider)) {
      calDone(res, returnTo, { calendar: "error", reason: "unknown_provider" }, popup);
      return;
    }
    const { verifier, challenge } = pkcePair();
    // The state says which way the answer goes ("p." a window, "r." the tab) as well as proving the
    // callback is ours, so even a callback whose cookie has gone answers in the right form.
    const state = `${popup ? "p" : "r"}.${crypto.randomBytes(24).toString("base64url")}`;
    const url = calendarAuthorizeUrl(provider, { redirectUri: calCallbackUri(req, provider), state, challenge });
    if (!url) {
      calDone(res, returnTo, { calendar: "error", reason: "not_configured", provider }, popup);
      return;
    }
    res.cookie(CAL_COOKIE, signState<CalendarState>({ provider, state, verifier, returnTo, popup, issuedAt: Date.now() }), {
      httpOnly: true,
      sameSite: "lax",
      // Was `req.secure`, which is false behind a TLS-terminating proxy — see cookiesAreSecure.
      secure: cookiesAreSecure(req),
      path: CAL_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_MS
    });
    res.redirect(url);
  });

  app.get("/api/calendar/:provider/callback", async (req, res) => {
    const provider = String(req.params.provider);
    // This app has no cookie-parser: it reads cookies with auth.ts's own `parseCookies`,
    // which is what the sign-in callback below does too. `req.cookies` is always undefined
    // here, and reaching for it is why the first version of this route saw no state at all.
    const saved = readState<CalendarState>(parseCookies(req.headers.cookie)[CAL_COOKIE]);
    const returnTo = saved?.returnTo ?? clientUrl.replace(/\/+$/, "");
    // answered in a window if it was started from one; with no cookie left, the state's own mark says so
    const popup = saved ? saved.popup === true : typeof req.query.state === "string" && req.query.state.startsWith("p.");
    if (!isCalProvider(provider) || !saved || saved.provider !== provider) {
      calDone(res, returnTo, { calendar: "error", reason: "state_mismatch" }, popup);
      return;
    }
    if (typeof req.query.state !== "string" || req.query.state !== saved.state) {
      calDone(res, returnTo, { calendar: "error", reason: "state_mismatch" }, popup);
      return;
    }
    if (typeof req.query.error === "string") {
      calDone(res, returnTo, { calendar: "error", reason: req.query.error }, popup);
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      calDone(res, returnTo, { calendar: "error", reason: "no_code" }, popup);
      return;
    }
    try {
      const tokens = await exchangeCalendarCode(provider, {
        code,
        redirectUri: calCallbackUri(req, provider),
        verifier: saved.verifier
      });
      mainStore.saveCalendarConnection({
        accountId: req.account!.id,
        provider,
        email: tokens.email,
        refreshToken: tokens.refreshToken ?? "",
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt
      });
      calDone(res, returnTo, { calendar: "connected", provider }, popup);
    } catch (error) {
      calDone(res, returnTo, { calendar: "error", reason: error instanceof Error ? error.message.slice(0, 80) : "exchange_failed" }, popup);
    }
  });

  /* The meetings between two instants (`from`, `to`, ISO), up to 62 days apart: the panel asks
     for the month it shows, which covers its day and week views too. Without them, the next two
     days, as the first version of the panel asked for. */
  app.get("/api/calendar/events", async (req, res) => {
    let from = new Date();
    let to = new Date(from.getTime() + 48 * 60 * 60 * 1000);
    if (req.query.from !== undefined || req.query.to !== undefined) {
      const asked = (value: unknown) => (typeof value === "string" && value ? new Date(value) : null);
      const start = asked(req.query.from);
      const end = asked(req.query.to);
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      if (end.getTime() - start.getTime() > 62 * 24 * 60 * 60 * 1000) {
        res.status(400).json({ error: "range_too_wide" });
        return;
      }
      from = start;
      to = end;
    }
    const events: CalendarEvent[] = [];
    const failed: CalendarProvider[] = [];
    for (const provider of CALENDAR_PROVIDERS) {
      const token = await calendarAccessToken(req.account!.id, provider);
      if (!token) continue;
      try {
        events.push(...(await fetchCalendarEvents(provider, token, from, to)));
      } catch {
        // one provider being unreachable must not blank the other's meetings
        failed.push(provider);
      }
    }
    res.json({ events: sortEvents(events), failed, fetchedAt: new Date().toISOString(), from: from.toISOString(), to: to.toISOString() });
  });

  app.delete("/api/calendar/:provider", (req, res) => {
    const provider = String(req.params.provider);
    if (!isCalProvider(provider)) {
      res.status(400).json({ error: "unknown_provider" });
      return;
    }
    mainStore.deleteCalendarConnection(req.account!.id, provider);
    res.json({ ok: true });
  });

  // The button lands here; we build the provider URL and send the browser on.
  app.get("/api/auth/oauth/:provider/start", limiter.byIp("oauth-start", 30, QUARTER), (req, res) => {
    const provider = String(req.params.provider);
    const allowedReturn = appOrigins();
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
        secure: cookiesAreSecure(req)
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
      await loginGuard.clear(account.email);
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
    const perEmail = await limiter.hit("reset-email", email, 3, HOUR);
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
  app.post("/api/auth/reset", limiter.byIp("reset", 20, QUARTER), async (req, res) => {
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
    await loginGuard.clear(account.email);
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
      permission: invite.permission,
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
      // The invite decides this now. It used to be hardcoded, which is the reason there was
      // no way to have an Admin in a workspace at all.
      role: invite.permission,
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: TERMS_VERSION
    });
    // Following the emailed invite proves the address.
    const verified = mainStore.markEmailVerified(account.id) ?? account;
    mainStore.markInviteAccepted(invite.id);
    try {
      const orgStore = await manager.getOrgStore(org.id);
      // A free-text title so the roster row reads as somebody; what they MAY do is
      // their account's level, which lives in the control database, not here.
      orgStore.createTeammateUser(verified, "Teammate");
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
  // Returns {mode:"demo"} when no ANTHROPIC_API_KEY is set, and the client falls back to its
  // simulated answers. These are NOT public any more, whatever this comment used to say: both have an
  // entry in ROUTE_POLICY (ask = schedule.read, import = import.commit) and answer over req.orgStore,
  // which is what the note below used to be waiting for. The out-of-date half mattered — it reads like
  // nothing is in front of these, and what is actually in front of them is the only thing standing
  // between a stranger and a bill, so see costLimit.
  const aiAskSchema = z.object({
    question: z.string().trim().min(1).max(2000),
    // the trade the workspace was set up for — shapes the answer's vocabulary
    businessType: z.enum(businessTypeOptions).optional()
  });
  /**
   * A ceiling on the routes whose cost is paid by somebody outside this process.
   *
   * Two spend money and one spends a person's attention. The AI pair reach a bill: each call reaches
   * Anthropic, and import-schedule sends up to six images of up to 20MB as vision input, which is the
   * most expensive request BuildFlow can make. POST /api/feedback reaches an inbox a person reads, with
   * up to three attachments of up to 10MB each, and is a read-only-demo exception on purpose — so it is
   * the one route a locked demo can use to send something outward. All three are reachable by any
   * visitor, because a signed-out page load takes a demo session and the demo is an owner: "requires a
   * session" is not a ceiling, it is one extra POST.
   *
   * Keyed per account where there is a real one, and per address otherwise. The demo account is
   * SHARED, so keying it by account would put every visitor in one bucket and let the first spend the
   * afternoon's allowance for everybody; keying a real customer by address would make one office share
   * one allowance. Each half of that is wrong for the other case, which is why it is not just byIp.
   *
   * Fails open, like byIp and unlike opsGate: the backend already falls back to counting in process,
   * so reaching the catch means something unforeseen, and a customer who cannot ask a question is a
   * worse outcome than a few calls that went uncounted. opsGate is the opposite because letting an
   * uncounted request past an AUTH gate hands over the ops routes.
   */
  const countedActor = (req: express.Request) =>
    req.account && req.account.email !== DEMO_ACCOUNT_EMAIL ? `acct:${req.account.id}` : clientIp(req);
  const costLimit =
    (bucket: string, max: number, windowMs: number): express.RequestHandler =>
    (req, res, next) => {
      limiter
        .hit(bucket, countedActor(req), max, windowMs)
        .then((result) => {
          if (result.ok) return next();
          res.setHeader("Retry-After", String(result.retryAfterSec));
          res.status(429).json({
            error: `That is a lot of questions at once. Try again in ${humanSeconds(result.retryAfterSec)}.`,
            retryAfterSec: result.retryAfterSec
          });
        })
        .catch((error: unknown) => {
          console.error("[ai] letting a request through after an unexpected limiter failure:", error);
          next();
        });
    };

  app.post("/api/ai/ask", costLimit("ai-ask", 40, HOUR), async (req, res) => {
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
  app.post("/api/ai/import-schedule", costLimit("ai-import", 6, HOUR), async (req, res) => {
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
    if (payload.workspaceTrial) {
      // a workspace created beside the first one: a dated free trial whatever its plan
      if (!payload.trialEndsAt) return "trial";
      return new Date(payload.trialEndsAt).getTime() > Date.now() ? "trial" : "trial_expired";
    }
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

  /**
   * Put each roster row's permission level on it, resolved as the payload is serialised.
   *
   * It has to happen HERE and not in the tenant store, because the two halves live in
   * different databases: the roster is per-org, the level is on `accounts` in the control
   * database, and only this layer can see both. Deriving it on read rather than keeping a
   * copy on the roster row is the point — a copy could disagree with the level the server
   * actually authorizes on, and that is the kind of disagreement nobody notices until it
   * matters. Null for a row with no login: a seeded example, or someone removed.
   */
  const withPermissions = <T extends { users: User[]; activeUser?: User }>(payload: T, orgId: string): T => {
    const levels = new Map<string, PermissionLevel>();
    for (const account of mainStore.accountsForOrg(orgId)) levels.set(account.id, account.role);
    const resolve = (user: User): User => ({ ...user, permission: (user.accountId && levels.get(user.accountId)) || null });
    const users = payload.users.map(resolve);
    return {
      ...payload,
      users,
      ...(payload.activeUser ? { activeUser: resolve(payload.activeUser) } : {})
    };
  };

  app.get("/api/bootstrap", (req, res) => {
    // Gated route: req.account is the signed-in person, who is the active user.
    // `readOnly` rides along so the shell can say so before anyone clicks: the permission guard
    // already refuses these writes, and this is the same decision reported rather than a second one.
    res.json({
      ...withPermissions(withBilling(store.bootstrap(req.account?.id), req.account), req.org!.id),
      ...(req.readOnlyDemo ? { readOnly: true } : {})
    });
  });

  /* ── Team: people in the workspace + open invites ────────────────────────── */
  const inviteView = (row: {
    id: string;
    email: string;
    permission?: string;
    invitedBy: string;
    createdAt: string;
    expiresAt: string;
    sentAt: string | null;
  }): TeamInvite => ({
    id: row.id,
    email: row.email,
    // Optional on the way in and defaulted here, so a row written before migration 21
    // reads back as what it will actually become.
    permission: isPermissionLevel(row.permission) ? row.permission : "member",
    invitedBy: mainStore.getAccountById(row.invitedBy)?.name ?? "A teammate",
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    sentAt: row.sentAt
  });

  app.get("/api/team", (req, res) => {
    /**
     * The level rides on each person, put there by withPermissions above. It used to be a
     * separate `permissions` map keyed by accountId, on the grounds that a roster row can
     * outlive its login (migration 22) and would then have no level — which is true, and is
     * exactly what `permission: null` says, on the row itself, where the screen needs it.
     */
    res.json({
      ...withPermissions({ users: store.users() }, req.org!.id),
      invites: mainStore.openInvites(req.org!.id).map(inviteView),
      // Whether this person may change what a teammate may do. It asks the same question the
      // route itself asks, so the control and the endpoint cannot disagree — which since the
      // job titles went (migration 25) means the Owner alone, because an Admin who can mint
      // another Admin is an Owner by a longer route.
      canManage: can(req.account!.role, "team.permission"),
      emailVerified: Boolean(req.account?.emailVerifiedAt)
    });
  });

  const inviteSchema = z.object({
    invites: z
      .array(
        z.object({
          email: z.string().trim().email("Enter a valid email address.").max(320),
          /* Defaulted so every caller that predates this field keeps sending a Member — which
             is what acceptance used to hardcode. "owner" is not in the enum at all:
             ownership is transferred, not emailed. */
          permission: z.enum(invitablePermissionLevels).default("member")
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
      /**
       * An Admin may invite Members, and only the Owner may invite an Admin. Without this
       * an Admin can mint another Admin, which makes Admin and Owner the same role by a
       * slightly longer route.
       *
       * Refused per row rather than for the whole request: a batch of twenty where one line
       * asked for too much should send the other nineteen and say which one it skipped.
       */
      if (item.permission !== "member" && !can(account.role, "team.permission")) {
        results.push({ email, status: "skipped", reason: "Only the workspace owner can invite an admin." });
        continue;
      }
      const { invite, token } = mainStore.createInvite({
        orgId: org.id,
        email,
        permission: item.permission,
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

  /**
   * Sets a teammate's PERMISSION LEVEL — Admin or Member.
   *
   * This route used to set a job title out of a fixed list of three (Project Manager,
   * Superintendent, Crew Lead), which decided nothing and was the only "role" anybody could
   * see. The titles were removed on 2026-09-19; the level a person holds is the only role
   * now, so this is the route that changes it, and its policy row moved from "team.title"
   * (Owner + Admin) to "team.permission" (Owner only) because that is where the capability
   * list already put it: an Admin who can mint another Admin is an Owner by a longer route.
   *
   * Three refusals, the same ones removal makes, for the same reasons:
   *   - not yourself. An Owner demoting themselves leaves the workspace unowned, and a
   *     person who could raise their own level would make every other rule decorative.
   *   - only downwards. The subject must rank BELOW the actor as they stand.
   *   - never to Owner. Ownership is transferred (POST /api/org/transfer), which is a
   *     different thing with different rules: it moves the level off somebody.
   */
  app.patch("/api/team/users/:id", (req, res) => {
    const parsed = z.object({ permission: z.enum(invitablePermissionLevels) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose Admin or Member." });
      return;
    }
    const user = store.getUser(String(req.params.id));
    if (!user) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    if (!user.accountId) {
      res.status(400).json({ error: "That person has no login yet, so there is nothing to set." });
      return;
    }
    const actor = req.account!;
    if (user.accountId === actor.id) {
      res.status(403).json({ error: "You cannot change your own access. Transfer ownership instead." });
      return;
    }
    const subject = mainStore.getAccountById(user.accountId);
    if (!subject || !mainStore.accountsForOrg(req.org!.id).some((one) => one.id === subject.id)) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    if (!outranks(actor.role, subject.role)) {
      res.status(403).json({ error: `You cannot change what ${permissionLevelLabels[subject.role]}s may do.` });
      return;
    }
    const updated = mainStore.setAccountPermission(subject.id, req.org!.id, parsed.data.permission);
    if (!updated) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    res.json({ user: { ...user, permission: parsed.data.permission } });
  });

  /**
   * Takes someone off the team. Two kinds of person, one route, because the client has one button.
   *
   * A seeded sample teammate is deleted outright: nothing real ever happened to them.
   *
   * A real person is different, and the difference is the whole design. Their roster row is what
   * every field report, variance and project they touched points at, and projects.managerId and
   * field_updates.userId are both NOT NULL, so deleting the row would delete a construction record
   * and leave columns pointing at nothing. So removal takes away ACCESS, not history: the login and
   * its sessions and reset tokens are destroyed, and the roster row is unlinked and stamped
   * removedAt. They cannot sign in; everything they did still reads correctly.
   *
   * Three refusals, in the order a person would think of them:
   *   - not yourself. Removing yourself is leaving, which is a different route with different rules.
   *   - only downwards. An Admin may remove a Member, never another Admin and never the Owner --
   *     this is the first production use of outranks(), and without it Admin and Owner are the same
   *     role by a longer route.
   *   - never the last Owner. A workspace nobody owns cannot be billed, transferred or closed.
   */
  app.delete("/api/team/users/:id", async (req, res) => {
    const userId = String(req.params.id);
    const row = store.teammateRow(userId);
    if (!row) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }

    if (!row.accountId) {
      // A sample row, or someone already removed. removeSampleUser refuses anything that is not
      // genuinely a seeded sample, so the message stays true for the already-removed case.
      if (!store.removeSampleUser(userId)) {
        res.status(400).json({ error: "Only sample teammates can be removed here.", code: "not_removable" });
        return;
      }
      res.status(204).end();
      return;
    }

    const target = mainStore.getAccountById(row.accountId);
    if (!target || target.orgId !== req.org!.id) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    if (target.id === req.account!.id) {
      res.status(409).json({ error: "You cannot remove yourself. Leave the workspace instead.", code: "self_remove" });
      return;
    }
    /* Equal ranks cannot act on each other, so this one rule carries three: an Admin cannot remove
       another Admin, nobody can remove an Owner, and therefore the workspace can never be left
       without one. There is deliberately no separate "this is the last owner" branch -- with
       outranks() written this way no request can reach it, and a guard no request can reach reads
       as protection while providing none. An Owner's way out is to transfer and then leave. */
    if (!outranks(req.account!.role, target.role)) {
      /* Deliberately no `need`. Every other 403 in this server names the capability the guard
         checked, and holding it is what would let the caller through -- but this refusal is about
         RANK, and no capability grants it. Naming one would tell the client to ask for a permission
         that would not help. */
      res.status(403).json({
        error: `You cannot remove ${permissionLevelLabels[target.role]}. Only someone above them can.`,
        code: "outranked"
      });
      return;
    }

    /* The tenant half first, deliberately. If the second half fails the person still has a working
       login and a roster row that ensureAccountUser will re-link, which is recoverable. The other
       order leaves a live account with nothing on the roster to address it by. There is no
       transaction spanning the two databases -- they are separate sql.js files. */
    const revoked = store.revokeTeammateAccess(userId);
    mainStore.purgeAccount(target.id);
    res.status(200).json({
      removed: { id: userId, name: revoked?.name ?? row.name },
      /* projects.managerId is NOT NULL, so these still point at the removed person's roster row and
         still render their name. Nobody but the caller can say who should take the work, so this
         reports it rather than reassigning to whoever happens to be first on the roster. */
      stillManaging: revoked?.managing ?? []
    });
  });

  /**
   * Hands the workspace to somebody else. Owner only, and the only way an Owner stops being one.
   *
   * The outgoing Owner becomes an Admin rather than losing their place: they keep running the work,
   * which is almost always what a handover means, and a workspace is never left with nobody in it.
   *
   * WHAT THIS DOES NOT DO, stated here because it is invisible otherwise: it does not move the Stripe
   * subscription. `subscriptions` has no orgId column and is resolved by the requester's email, so
   * after a transfer the new Owner's email will not find the row the old Owner's did. Making billing
   * follow ownership means a column on subscriptions and a backfill -- a separate change, not a side
   * effect of a role update. Until then a transferred workspace needs its billing re-attached.
   */
  app.post("/api/org/transfer", (req, res) => {
    const parsed = z.object({ accountId: z.string().trim().min(1, "Choose who should own the workspace.") }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Choose who should own the workspace." });
      return;
    }
    const actor = req.account!;
    const target = mainStore.getAccountById(parsed.data.accountId);
    if (!target || target.orgId !== req.org!.id) {
      res.status(404).json({ error: "That person is not in this workspace." });
      return;
    }
    if (target.id === actor.id) {
      res.status(409).json({ error: "You already own this workspace.", code: "already_owner" });
      return;
    }

    const owner = mainStore.setAccountRole(target.id, "owner");
    const former = mainStore.setAccountRole(actor.id, "admin");
    if (!owner || !former) {
      res.status(500).json({ error: "Ownership could not be transferred. Nothing was changed." });
      return;
    }
    // The tenant database keeps its own display copy of who the owner is, and it is sticky.
    store.moveOwnerTitle(actor.id, target.id);
    res.json({ owner, former, billingFollowsOwner: false });
  });

  /**
   * Leaves the workspace. Granted to an Admin and a Member and deliberately NOT to an Owner -- the
   * policy table refuses them before this handler runs, because a workspace with no owner cannot be
   * billed, transferred or closed. An Owner transfers first.
   *
   * `accounts.orgId` is a single NOT NULL column with no membership table, so there is no
   * representable state for an account that belongs to no workspace: leaving IS deleting the login.
   * The roster row stays, unlinked, for the same reason a removal keeps it -- the work is a record.
   */
  app.post("/api/org/leave", (req, res) => {
    const actor = req.account!;
    // Belt and braces behind the policy. An Owner should never reach here; if the table is ever
    // edited so that they can, this still refuses rather than orphaning a workspace.
    if (actor.role === "owner") {
      res.status(403).json({
        error: "You own this workspace, so you cannot leave it. Transfer ownership first.",
        code: "owner_cannot_leave"
      });
      return;
    }
    const row = store.users().find((user) => user.accountId === actor.id);
    if (row) store.revokeTeammateAccess(row.id);
    mainStore.purgeAccount(actor.id);
    // Cleared the same way POST /api/auth/logout clears it. clearCookie has to be given matching
    // attributes to actually remove the cookie, and sessionCookieOptions() carries a maxAge that
    // does not belong on a deletion.
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(200).json({ left: true });
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

  /* ── Workspaces: one login, several BuildFlow programs (2026-09-15) ──────────
     A person's first workspace is the org their login was created in; they can create up to
     EXTRA_WORKSPACE_LIMIT more, each a separate org with its own data file, trade, team and a
     WORKSPACE_TRIAL_DAYS free trial. The session's org is the ACTIVE workspace: creating one
     switches to it, so the onboarding that follows (trade, plan, invites -- the same questions
     the first workspace answered) sets up the new one, and the switcher moves the session
     between them. A workspace is called by its trade -- "Roofing" -- with the company beneath. */
  const EXTRA_WORKSPACE_LIMIT = 3;
  const WORKSPACE_TRIAL_DAYS = 7;
  const workspaceSummary = async (membership: WorkspaceMemberRow, activeOrgId: string): Promise<WorkspaceSummary> => {
    const orgStore = await manager.getOrgStore(membership.orgId);
    const businessType = orgStore.businessType();
    return {
      id: membership.orgId,
      name: membership.orgName,
      title: businessType || membership.orgName,
      businessType,
      kind: membership.kind,
      role: isPermissionLevel(membership.role) ? membership.role : "member",
      active: membership.orgId === activeOrgId,
      onboardingCompletedAt: orgStore.onboardingCompletedAt(),
      trialEndsAt: orgStore.isWorkspaceTrial() ? orgStore.workspaceSetup().trialEndsAt : null,
      createdAt: membership.orgCreatedAt
    };
  };
  const workspacesPayload = async (account: Account, activeOrgId: string): Promise<WorkspacesPayload> => {
    mainStore.ensureHomeMembership(account);
    const workspaces: WorkspaceSummary[] = [];
    for (const membership of mainStore.workspacesForAccount(account.id)) workspaces.push(await workspaceSummary(membership, activeOrgId));
    return {
      workspaces,
      activeId: activeOrgId,
      limit: EXTRA_WORKSPACE_LIMIT,
      remaining: Math.max(0, EXTRA_WORKSPACE_LIMIT - mainStore.extraWorkspaceCount(account.id))
    };
  };

  app.get("/api/workspaces", async (req, res) => {
    res.json(await workspacesPayload(req.account!, req.org!.id));
  });

  app.post("/api/workspaces", async (req, res) => {
    const account = req.account!;
    // The shared demo creates workspaces like anyone else (asked 2026-09-15); "Preview the
    // live demo" clears the ones the last visitor left, so the demo never fills up.
    mainStore.ensureHomeMembership(account);
    if (mainStore.extraWorkspaceCount(account.id) >= EXTRA_WORKSPACE_LIMIT) {
      res.status(409).json({
        error: `You can create up to ${EXTRA_WORKSPACE_LIMIT} workspaces beyond your first, and this account already has ${EXTRA_WORKSPACE_LIMIT}.`,
        code: "workspace_limit"
      });
      return;
    }
    // The company carries over; the trade -- and with it the workspace's title -- is chosen at
    // the onboarding that follows.
    const org = mainStore.createOrg(req.org!.name);
    mainStore.addWorkspaceMember(account.id, org.id, account.role, "extra");
    try {
      const orgStore = await manager.getOrgStore(org.id);
      orgStore.ensureAccountUser(account);
      orgStore.startWorkspaceTrial(WORKSPACE_TRIAL_DAYS);
    } catch (error) {
      console.error("[workspaces] could not prepare the new workspace:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "The new workspace could not be created. Please try again." });
      return;
    }
    mainStore.switchSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], org.id);
    res.status(201).json({ ...(await workspacesPayload(account, org.id)), session: sessionPayload(account, org) });
  });

  app.post("/api/workspaces/:id/switch", async (req, res) => {
    const account = req.account!;
    const orgId = String(req.params.id);
    mainStore.ensureHomeMembership(account);
    const org = mainStore.getOrg(orgId);
    if (!org || !mainStore.workspaceMembership(account.id, orgId)) {
      res.status(404).json({ error: "That workspace isn't one of yours.", code: "not_member" });
      return;
    }
    mainStore.switchSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], orgId);
    res.json({ ...(await workspacesPayload(account, orgId)), session: sessionPayload(account, org) });
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
    /**
     * This one route carries two different permissions, which is why the check is here and
     * not in the table. Naming the trade and the products is a workspace setting; the plan
     * and the seat count are the commercial relationship, and the plan makes those the
     * Owner's alone. Until now any signed-in person in the workspace could change both --
     * the clearest live escalation in the codebase.
     *
     * Onboarding sends selectedPlan on its first call, and the person completing onboarding
     * is the Owner of the workspace they just created, so that path is unaffected.
     */
    const commercial = selectedPlan !== undefined || seats !== undefined;
    if (commercial && !can(req.account!.role, "billing.plan")) {
      res.status(403).json({
        error: "Only the workspace owner can change the plan or the seat count.",
        code: "forbidden",
        need: "billing.plan"
      });
      return;
    }
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

  /**
   * Imported projects need somebody named as the manager. Anyone on the roster will do:
   * the job titles this used to filter on were removed on 2026-09-19, and managing a
   * project is an assignment rather than a rank.
   */
  const importManagerId = (): string | undefined => store.users()[0]?.id;

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

  /* A phase's finish line, moved on its own. Every phase draws a "<name> Complete" marker on the
     Month calendar and a planner can drag it, the same gesture that moves a job — so this writes
     the phase's own dates and touches nothing else: the jobs inside it keep theirs, because a
     planner moving a milestone is saying when the phase is DUE, not rescheduling the work. */
  app.patch("/api/phases/:id", (req, res) => {
    const parsed = phasePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const current = store.phase(String(req.params.id));
    if (!current) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    const span = { startDate: parsed.data.startDate ?? current.startDate, endDate: parsed.data.endDate ?? current.endDate };
    if (!spanIsForwards(span)) {
      res.status(400).json({ error: "The finish cannot be before the start", field: "endDate" });
      return;
    }
    const phase = store.updatePhase(String(req.params.id), parsed.data);
    if (!phase) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    res.json(phase);
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
    /* This takes every job in the project and every booking on them, and until now it was the one
       destructive schedule write that told nobody -- so deleting forty jobs left another planner's
       tab showing all forty, while deleting one of them announced itself. */
    announce(req, { kind: "jobs", op: "delete", ids: [] });
  });

  app.delete("/api/jobs/:id", (req, res) => {
    const id = String(req.params.id);
    if (!store.deleteJob(id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.status(204).send();
    // Jobs are the one thing whose every write announces itself, and a deletion is the change most
    // worth telling another planner's open tab about. After the response, like all twelve other
    // announce sites: the caller should not wait on a broadcast to other people's tabs.
    announce(req, { kind: "jobs", op: "delete", ids: [id] });
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
      // every booking has a URL: the email opens the Month calendar on that month, filtered to that crew
      notice.lines.push(
        `Open the Month calendar: ${clientUrl.replace(/\/?$/, "/")}#schedule/month?m=${assignment.date.slice(0, 7)}-01&crew=${assignment.crewId}`
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
  /* ── WeatherIQ (2026-09-23) ──────────────────────────────────────────────────
     The coming week at every active job site, read from Open-Meteo on the server and cached there
     (weather.ts), and every job day its weather reaches inside the job's own hours
     (weatherConflicts.ts), kept in weather_conflicts so the person in charge's decision sticks. A
     provider that cannot be reached is a 502 the panel says out loud, never an empty forecast that
     would read as a week without weather. */

  /** The locations Owners and Admins set, by project. */
  const weatherCustom = () => new Map(store.weatherLocations().map((location) => [location.projectId, location]));
  /** The workspace's working days, on an axis from the earliest job, so a reschedule can count in working days. */
  const weatherCalendar = (jobs: Array<{ startDate: string }>) =>
    scheduleCalendarFor(
      jobs.reduce((min, job) => (job.startDate < min ? job.startDate : min), localIsoDate()),
      store.workCalendar()
    );
  /** A project by id (store.project() answers with the project's whole bundle). */
  const weatherProject = (id: string) => store.projects().find((project) => project.id === id);
  /** The roster row of the signed-in person: who called a day off, kept it, or moved a site. */
  const weatherActor = (req: express.Request) => store.users().find((user) => user.accountId === req.account?.id)?.id ?? "";
  /** "13:00" → "1:00 PM", for the sentences a delay is logged with. */
  const clockWords = (hhmm: string) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  };
  const CAUSE_TITLE: Record<string, string> = {
    lightning: "Lightning",
    rain: "Rain",
    snow: "Snow",
    wind: "Wind",
    heat: "Heat",
    cold: "Cold",
    fog: "Fog"
  };

  app.get("/api/weather/forecast", async (_req, res) => {
    const today = localIsoDate();
    const jobs = store.jobs();
    const projects = store.projects();
    let forecast: Awaited<ReturnType<typeof forecastForSites>>;
    try {
      forecast = await forecastForSites(activeSites(projects, jobs, today), Date.now(), weatherCustom());
    } catch (error) {
      if (!(error instanceof WeatherUnavailableError)) throw error;
      res.status(502).json({ error: "The forecast service could not be reached." });
      return;
    }
    const calendar = weatherCalendar(jobs);
    const drafts = detectConflicts({ sites: forecast.sites, jobs, projects, isWorkingDay: (date) => calendar.isWorkingDay(date), today });
    const lastDay = forecast.sites.reduce((last, site) => {
      const end = site.days[site.days.length - 1]?.date ?? today;
      return end > last ? end : last;
    }, today);
    store.reconcileWeatherConflicts(drafts, { projectIds: forecast.sites.map((site) => site.projectId), from: today, to: lastDay });
    res.json({ ...forecast, conflicts: store.weatherConflicts({ from: today }) });
  });

  /**
   * The person in charge calls a job's day off for weather. Everything a lost day means lands at
   * once (store.cancelWeatherConflict): the crews booked on it that day are released, the delay is
   * logged, and the reschedule is raised as a pending variance of kind "weather" — the job moved to
   * the next day it can work, priced through the network so the PM sees what else moves and whether
   * the project's finish does. Accepting or rejecting it is the variance routes' job, as for any
   * other proposed change to the plan.
   */
  app.post("/api/weather/conflicts/:id/cancel", async (req, res) => {
    const conflict = store.weatherConflict(String(req.params.id));
    if (!conflict || (conflict.status !== "open" && conflict.status !== "kept")) {
      res.status(404).json({ error: "No open weather conflict with that id." });
      return;
    }
    const job = store.job(conflict.jobId);
    const project = weatherProject(conflict.projectId);
    if (!job || !project) {
      res.status(404).json({ error: "That job is no longer on the schedule." });
      return;
    }
    /* The site's own weather decides where the job can go. Calling a day off has to work while the
       forecast cannot be read — so it goes on, on the working calendar alone — but then the dates
       were never checked against the weather, and the reschedule SAYS so (`weatherCheck`), for
       whoever decides it, in the drawer or in Pending Approvals, however much later. The same goes
       for a day past the last one the forecast covers. */
    let site: { windows: WeatherWindow[]; days: Array<{ date: string }> } | undefined;
    try {
      site = (await forecastForSites([project], Date.now(), weatherCustom())).sites[0];
    } catch (error) {
      if (!(error instanceof WeatherUnavailableError)) throw error;
    }
    const jobs = store.jobs();
    const calendar = weatherCalendar(jobs);
    const dates = rescheduleDates({ job, lostDate: conflict.date, calendar, windows: site?.windows ?? [] });
    const weatherCheck = weatherCheckFor({
      job,
      lostDate: conflict.date,
      dates,
      forecastDays: site ? site.days.map((day) => day.date) : null
    });
    const moved = buildMoveProposal(jobs, store.dependencies(), job.id, dates.start, dates.end, calendar);
    const proposal = moved ? { ...moved, weatherCheck } : null;
    const shift = calendar.toIndex(dates.end) - calendar.toIndex(job.endDate);
    const day = new Date(`${conflict.date}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
    const window = `${clockWords(conflict.start.slice(11, 16))}–${clockWords(conflict.end.slice(11, 16))}`;
    const hours = [parseClock(job.startTime), parseClock(job.endTime)].every(Boolean) ? ` (${job.startTime}–${job.endTime})` : "";
    const result = store.cancelWeatherConflict(conflict.id, {
      userId: weatherActor(req),
      delayIQ: {
        projectId: conflict.projectId,
        category: "Weather",
        title: `${CAUSE_TITLE[conflict.cause] ?? "Weather"} called off ${job.phase}`,
        impactDays: 1,
        severity: conflict.severity === "hold" ? "High" : "Medium",
        status: "Open",
        description: `${conflict.reason.charAt(0).toUpperCase()}${conflict.reason.slice(1)} forecast ${window} on ${day} at ${project.name}, inside the job's working hours${hours}. Called off in WeatherIQ.`
      },
      variance: proposal
        ? {
            projectId: conflict.projectId,
            jobId: job.id,
            // a weather variance has no field report behind it; the conflict it came from stands in
            fieldUpdateId: conflict.id,
            kind: "weather",
            severity: gradeSeverity(Math.max(0, shift), proposal.projectSlipDays, proposal.criticalPath),
            reportedPercent: job.percentComplete ?? 0,
            plannedPercent: job.percentComplete ?? 0,
            varianceDays: shift,
            proposal
          }
        : null
    });
    if (!result) {
      res.status(404).json({ error: "No open weather conflict with that id." });
      return;
    }
    res.json(result);
    if (result.releasedAssignmentIds.length > 0) announce(req, { kind: "assignments", op: "unbook", ids: result.releasedAssignmentIds });
  });

  /** The person in charge keeps the day on. The conflict stays on the record and stops asking. */
  app.post("/api/weather/conflicts/:id/keep", (req, res) => {
    const kept = store.keepWeatherConflict(String(req.params.id), weatherActor(req));
    if (!kept) {
      res.status(404).json({ error: "No open weather conflict with that id." });
      return;
    }
    res.json(kept);
  });

  /** An Owner or Admin says where a project's forecast should be read: an address, a ZIP code or a town. */
  app.put("/api/weather/locations/:projectId", async (req, res) => {
    const parsed = weatherLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const project = weatherProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    let point: Awaited<ReturnType<typeof placeForQuery>>;
    try {
      point = await placeForQuery(parsed.data.query);
    } catch (error) {
      if (!(error instanceof WeatherUnavailableError)) throw error;
      res.status(502).json({ error: "The place lookup could not be reached. Try again in a minute." });
      return;
    }
    if (!point) {
      res.status(404).json({
        error: `No town or ZIP code matched "${parsed.data.query}". Try a ZIP code, or a town and state such as "Round Rock, TX".`
      });
      return;
    }
    res.json(
      store.setWeatherLocation({
        projectId: project.id,
        query: parsed.data.query,
        place: point.place,
        latitude: point.latitude,
        longitude: point.longitude,
        updatedAt: new Date().toISOString(),
        updatedBy: weatherActor(req)
      })
    );
  });

  /** Back to the project's own address. */
  app.delete("/api/weather/locations/:projectId", (req, res) => {
    const project = weatherProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    store.clearWeatherLocation(project.id);
    res.status(204).end();
  });

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

  /* A line's status (and anything else about it) changes from the Inventory's edit drawer. */
  app.patch("/api/materials/:id", (req, res) => {
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!store.project(parsed.data.projectId)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const material = store.updateMaterial(String(req.params.id), parsed.data);
    if (!material) {
      res.status(404).json({ error: "Material not found" });
      return;
    }
    res.json(material);
  });

  app.delete("/api/materials/:id", (req, res) => {
    if (!store.deleteMaterial(String(req.params.id))) {
      res.status(404).json({ error: "Material not found" });
      return;
    }
    res.status(204).send();
  });

  /* ── waitlist (removable feature) ─────────────────────────────────────────
     Pre-launch email capture. POST /api/waitlist saves the email + sends a
     confirmation ("thanks for joining"); POST /api/waitlist/announce broadcasts
     the launch email. Emails go through server/src/email.ts (SMTP env, logs
     until configured). To remove: delete these routes, the email import above,
     the waitlist schema, server/src/email.ts, and the waitlist table + methods
     in database.ts. ──────────────────────────────────────────────────────── */
  const waitlistPublicUrl = process.env.BUILDFLOW_PUBLIC_URL ?? clientUrl;

  /* ── Updates page "Subscribe" ───────────────────────────────────────────
     Changelog subscription, separate from the waitlist above: this list is
     "email me each release", the waitlist is "tell me when you launch", and
     they send different confirmations. ─────────────────────────────────── */
  app.get("/api/updates/subscribe", (_req, res) => {
    res.json({ count: store.updateSubscriberCount() });
  });

  // Same shape as the waitlist, and the same reason: it emails the address it is given.
  app.post("/api/updates/subscribe", limiter.byIp("updates-subscribe", 10, HOUR), async (req, res) => {
    const parsed = waitlistEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }
    const result = store.addUpdateSubscriber(parsed.data.email);
    let emailed = false;
    if (!result.alreadySubscribed) {
      const sent = await sendMail({ to: result.email, ...updatesSubscriptionEmail(waitlistPublicUrl) });
      emailed = sent.ok;
    }
    res.status(201).json({ ok: true, count: result.count, alreadySubscribed: result.alreadySubscribed, emailed });
  });

  app.get("/api/waitlist", (_req, res) => {
    res.json({ count: store.waitlistCount() });
  });

  /* Limited because it EMAILS THE ADDRESS IN THE BODY. Unlimited, on a public address with SMTP
     configured, that is a way to make BuildFlow send mail to anyone, as fast as a script can ask —
     which is how a sending domain ends up on a blocklist — and a way to fill the table while doing
     it. Ten an hour is the same allowance signing up already had; a person joins a waitlist once. */
  app.post("/api/waitlist", limiter.byIp("waitlist", 10, HOUR), async (req, res) => {
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

  /* Tighter than the other two, because this one emails the sender AND the sales address: an
     unlimited version floods an inbox somebody has to read. Five an hour still covers a person who
     sends, corrects and re-sends. */
  app.post("/api/contact-sales", limiter.byIp("contact-sales", 5, HOUR), async (req, res) => {
    const parsed = contactSalesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please include your name, a valid work email, and your company." });
      return;
    }
    const lead: SalesLead = parsed.data;
    // Keep the lead on record (sales_leads), so it is not lost while email runs in log mode...
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

  /* ── In-app feedback ──────────────────────────────────────────────────────
     The "Give feedback" tab on the Dashboard. Every signed-in person can use it, and
     every message lands in one inbox WITH the company attached: the route reads the
     workspace and the person off the session, so the recipient always knows who wrote.
     The address is the one the product owner asked for; FEEDBACK_EMAIL overrides it. */
  const feedbackInbox = process.env.FEEDBACK_EMAIL ?? "ljsantos020803@gmail.com";
  app.post("/api/feedback", costLimit("feedback", 10, HOUR), async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please write a few words." });
      return;
    }
    const attached = feedbackAttachments(parsed.data.attachments);
    if (!attached.ok) {
      res.status(400).json({ error: attached.error });
      return;
    }
    const account = req.account!;
    const org = req.org!;
    const result = await sendMail({
      to: feedbackInbox,
      ...feedbackEmail({
        category: parsed.data.category,
        message: parsed.data.message,
        page: parsed.data.page,
        company: { id: org.id, name: org.name, plan: org.plan },
        person: { name: account.name, email: account.email, role: account.role },
        sentAt: new Date().toISOString(),
        attachments: attached.listed
      }),
      attachments: attached.files
    });
    if (!result.ok) {
      // sendMail never throws, so a transport failure is the one case the person must hear about
      res.status(502).json({ error: "Your feedback could not be sent right now. Please try again in a moment." });
      return;
    }
    res.status(201).json({ ok: true, mode: result.mode });
  });
  /* ───────────────────────── end feedback ─────────────────────────────────── */

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
    const base = redirectBase(req, parsed.data.origin);
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
    const base = redirectBase(req, origin);
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
      return typeof provided === "string" && secretsMatch(provided, required);
    }
    /* No token configured. The localhost fallback below is a dev convenience and must stay
       one: a deployed API almost always sits behind a reverse proxy on the same host, so
       EVERY request arrives from 127.0.0.1 and this check would wave the whole internet
       through to the platform's object counts and to a backup trigger that writes files.
       In production an unset OPS_ADMIN_TOKEN closes these routes instead of opening them. */
    if (process.env.NODE_ENV === "production") return false;
    const ip = req.socket.remoteAddress ?? "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  };
  const backupsDir = () => path.join(path.dirname(mainStore.dataFilePath), "backups");

  /**
   * The ops routes' guard, with a lockout on wrong tokens.
   *
   * These four are reachable from the public address and `OPS_ADMIN_TOKEN` is the only thing in
   * front of them — and behind them are the platform's object counts, its runtime stats and a
   * backup trigger that writes files. secretsMatch() is constant-time, so a guess learns nothing
   * from timing, but nothing stopped a caller from simply guessing as fast as it could ask.
   *
   * A per-request ceiling was the wrong tool and is why this was left alone earlier: the callers
   * here are monitors, a monitor polls, and a limit low enough to slow a guesser would have
   * throttled the thing you need working when something else is wrong. A lockout on FAILURE has
   * no such tension. A caller with the right token never touches it — and a success clears what
   * came before, so the fix-the-config-and-retry loop does not accumulate.
   *
   * Only armed when a token is configured. Without one these routes are already closed in
   * production, and there is no secret to protect, so counting attempts would only replace a 403
   * that tells you to set OPS_ADMIN_TOKEN with a 429 that does not.
   */
  const opsGate: express.RequestHandler = (req, res, next) => {
    const required = process.env.OPS_ADMIN_TOKEN?.trim();
    const key = `ops:${clientIp(req)}`;
    const refuse = () => res.status(403).json({ error: "Forbidden. Set OPS_ADMIN_TOKEN and send it as the x-ops-token header." });

    void (async () => {
      if (!required) return opsAuthorized(req) ? next() : refuse();

      const lockedSec = await opsGuard.lockedFor(key);
      if (lockedSec > 0) {
        res.setHeader("Retry-After", String(lockedSec));
        res.status(429).json({
          error: `Too many attempts. Try again in ${humanSeconds(lockedSec)}.`,
          retryAfterSec: lockedSec
        });
        return;
      }
      if (opsAuthorized(req)) {
        await opsGuard.clear(key);
        return next();
      }
      await opsGuard.noteFailure(key);
      refuse();
    })().catch((error: unknown) => {
      /* The opposite of the rate limiter's choice, deliberately. That one lets a request through
         when it cannot count, because a limiter that fails closed is an outage. This is an AUTH
         gate: failing open would hand over the ops routes to whatever made the counting break. */
      console.error("[ops] gate failed; refusing:", error);
      if (!res.headersSent) refuse();
    });
  };

  app.post("/api/ops/backup", opsGate, async (req, res) => {
    const retain = process.env.BACKUP_RETAIN ? Number(process.env.BACKUP_RETAIN) : undefined;
    try {
      const files = manager.backupAll(retain).map((f) => path.basename(f));
      res.status(201).json({ ok: true, count: files.length, files });
    } catch (error) {
      console.error("[ops] backup failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Backup failed." });
    }
  });

  app.get("/api/ops/backups", opsGate, (req, res) => {
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

  /* Platform object counts for the operator. Same OPS_ADMIN_TOKEN guard as the backup
     routes above — this is the credential the operator already holds.

     Why this route exists at all: the admin console it was written for (removed from the
     repo on 2026-09-23) used to read /api/bootstrap, which is session-gated, so an
     anonymous call always 401'd and the console silently rendered a hardcoded fallback
     that happened to match a fresh seed. It looked like live data and was a constant.

     /api/bootstrap could not be the answer even with a credential. It returns the CALLER'S
     OWN workspace, and an operator token has no workspace — there is no "this workspace"
     for a platform console. So the honest number is the platform-wide total, which is what
     this returns, and the gate on /api/bootstrap is untouched.

     It answers in integers only. Counting happens in SQL (store.objectCounts()), so the
     contract values and crew rates that made /api/bootstrap worth gating are never read,
     let alone sent. */
  /* Runtime counters: how much and how fast, where /api/ops/metrics above says how much
     data exists. Same operator guard. Prometheus text with ?format=prometheus, JSON
     otherwise, so it is readable both by a scraper and by a person with curl. Nothing
     identifying is in it — see metrics.ts. */
  app.get("/api/ops/stats", opsGate, (req, res) => {
    if (String(req.query.format ?? "") === "prometheus") {
      res.type("text/plain; version=0.0.4").send(metrics.prometheus());
      return;
    }
    res.json(metrics.snapshot());
  });

  app.get("/api/ops/metrics", opsGate, async (req, res) => {
    try {
      const { workspaces, cold, totals } = await manager.objectCounts();
      const objects = totals.projects + totals.jobs + totals.crews + totals.equipment + totals.materials;
      res.json({ generatedAt: new Date().toISOString(), workspaces, coldWorkspaces: cold, objects, byKind: totals });
    } catch (error) {
      console.error("[ops] metrics failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Could not read platform metrics." });
    }
  });
  /* ─────────────────────────── end ops ─────────────────────────────────────── */

  registerScheduleToolRoutes(app, store);

  /* Last thing before the app is handed back: prove the policy and the router still agree. */
  assertRoutePolicyCovers(app);

  /**
   * The backstop for anything a route threw and did not handle.
   *
   * There was no error handler at all, which left Express's default one in charge — and
   * that one answers an HTML page, with the stack trace in it unless NODE_ENV is exactly
   * "production". A deploy that forgets that one variable was publishing its source
   * layout to anyone who could provoke a 500. This answers the same JSON shape as every
   * other failure here, keeps the detail in the server log where it is useful, and must
   * stay last: Express picks a handler by arity, so all four parameters are load-bearing
   * even though `next` is unused.
   */
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    /* Not everything that reaches here is the server's fault. The body parser rejects an
       oversized body with a 413 and malformed JSON with a 400, and both arrive as errors
       carrying their own status. Answering 500 to those tells the caller their own mistake
       was ours, and hides a body limit that is set too low behind "something went wrong" —
       so a status the middleware chose is passed through, with a message written for the
       person rather than the parser's internal wording. Anything without one is genuinely
       unhandled: logged in full, reported as 500, and never described to the caller. */
    const carried = err as { status?: unknown; statusCode?: unknown; type?: unknown };
    const status =
      typeof carried?.status === "number" ? carried.status : typeof carried?.statusCode === "number" ? carried.statusCode : 500;
    if (status >= 400 && status < 500) {
      if (!res.headersSent) res.status(status).json({ error: clientErrorMessage(status, carried?.type) });
      return;
    }
    console.error("[api] unhandled error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
