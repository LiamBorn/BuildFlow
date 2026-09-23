import type {
  BootstrapPayload,
  BusinessTypeId,
  CreateCrewInput,
  PermissionLevel,
  CreateEquipmentInput,
  CreateJobInput,
  CreateMaterialInput,
  CreateProjectInput,
  Crew,
  DelayIQ,
  Equipment,
  FieldUpdate,
  Job,
  Material,
  Phase,
  Project,
  ProjectScheduleStatus,
  ScheduleAssignment,
  ScheduleVariance,
  Status,
  UpdateCrewInput,
  UpdateEquipmentInput,
  UpdateMaterialInput,
  UpdatePhaseInput,
  UpdateProjectInput,
  PlanId,
  OnboardingProductId,
  User,
  TeamInvite,
  InvitePreview,
  CrewClash,
  WorkCalendarSetting,
  CreateJobDependencyInput,
  JobDependency,
  RebookMove,
  RebookResult,
  WeeklyDigest,
  WorkspacesPayload
} from "@buildflow/shared";

const configuredApiBaseUrl =
  (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";

function localDevApiBaseUrl() {
  if (typeof window === "undefined") return "";
  const { hostname, port, protocol } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocalHost && (port === "5173" || port === "5174")) {
    return `${protocol}//${hostname}:4300`;
  }
  return "";
}

/** This browser tab, for the live feed: a write carries it so the tab does not flash its own change back at itself. */
export const CLIENT_ID = (() => {
  const random = globalThis.crypto;
  if (random && "randomUUID" in random) return random.randomUUID();
  return `tab-${Math.random().toString(36).slice(2)}`;
})();

export function apiUrl(url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${configuredApiBaseUrl || localDevApiBaseUrl()}${url}`;
}

/**
 * A failed API call. `field` names the form input a validation message belongs
 * under (server-side rules answer per field), `code` identifies specific cases
 * the UI reacts to — e.g. "email_taken" offers "log in instead".
 */
export class ApiError extends Error {
  status: number;
  field?: string;
  code?: string;
  /** The response body, for errors that carry more than a message (a 409's clashes). */
  details?: Record<string, unknown>;
  constructor(message: string, status: number, field?: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      credentials: "include", // send/receive the bf_session auth cookie
      headers: {
        "Content-Type": "application/json",
        "X-BuildFlow-Client": CLIENT_ID,
        ...options?.headers
      },
      ...options
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `Could not reach the BuildFlow API: ${error.message}`
        : "Could not reach the BuildFlow API.",
      { cause: error }
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `Request failed: ${response.status}`,
      response.status,
      typeof body.field === "string" ? body.field : undefined,
      typeof body.code === "string" ? body.code : undefined,
      body
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** The authenticated JSON request helper, for feature modules with their own API surface (the schedule tool). */
export const apiRequest = request;

export function loadBootstrap() {
  return request<BootstrapPayload>("/api/bootstrap");
}

// ── Authentication ──────────────────────────────────────────────────────────
export type Account = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  /** The workspace permission level, not a job title. See PermissionLevel in @buildflow/shared. */
  role: PermissionLevel;
  createdAt: string;
  /** Set once the person followed the confirmation link we emailed. */
  emailVerifiedAt?: string | null;
};
export type Org = { id: string; name: string; plan: string; createdAt: string };
/** `demo` marks the shared demo login — a real signup is never demo. */
export type AuthSession = { account: Account; org: Org; demo?: boolean };

/* ── team + invites ─────────────────────────────────────────────────────── */
export type TeamPayload = { users: User[]; invites: TeamInvite[]; emailVerified: boolean; canManage?: boolean };
/** An invite carries one thing: what the person will be allowed to do once they accept. */
export type InviteDraft = { email: string; permission: PermissionLevel };
export type InviteResult = { email: string; status: "sent" | "held" | "skipped"; reason?: string };

export function fetchTeam() {
  return request<TeamPayload>("/api/team");
}
export function sendInvites(invites: InviteDraft[]) {
  return request<{ results: InviteResult[]; invites: TeamInvite[]; emailVerified: boolean }>("/api/team/invites", {
    method: "POST",
    body: JSON.stringify({ invites })
  });
}
export function resendInvite(id: string) {
  return request<{ ok: true; invite: TeamInvite }>(`/api/team/invites/${encodeURIComponent(id)}/resend`, { method: "POST" });
}
export function revokeInvite(id: string) {
  return request<void>(`/api/team/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/** Owner only: what a teammate may do in the workspace. Never to Owner — that is a transfer. */
export function updateTeamMemberPermission(id: string, permission: PermissionLevel) {
  return request<{ user: User }>(`/api/team/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ permission })
  });
}
export function removeSampleUser(id: string) {
  return request<void>(`/api/team/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/** What an invited person sees before accepting (public; the token is the credential). */
export function fetchInvitePreview(token: string) {
  return request<InvitePreview>(`/api/auth/invite/${encodeURIComponent(token)}`);
}
export function acceptInvite(input: { token: string; name: string; password: string; acceptTerms: true; remember?: boolean }) {
  return request<AuthSession>("/api/auth/invite/accept", { method: "POST", body: JSON.stringify(input) });
}
/** Name and/or email. A new email drops verification and re-sends the link. */
export function updateAccount(patch: { name?: string; email?: string }) {
  return request<{ account: Account; verificationSent: boolean }>("/api/auth/account", { method: "PATCH", body: JSON.stringify(patch) });
}
/** Save one per-person setting on the server (tutorial progress today). */
/** What changed this week: this Monday's plan snapshot against last week's. */
export function fetchScheduleDigest() {
  return request<WeeklyDigest>("/api/schedule/digest");
}

/** Email this week's digest to the org's planners now. */
export function sendScheduleDigest() {
  return request<{ ok: true; weekOf: string; recipients: number }>("/api/schedule/digest/send", { method: "POST" });
}

/** Loads the trade's starter workspace into an empty workspace, to explore with. */
export function loadSampleData(businessType?: string) {
  return request<{ ok: true; alreadyLoaded: boolean; projectIds: string[]; crewIds: string[] }>("/api/schedule/sample-data", {
    method: "POST",
    body: JSON.stringify(businessType ? { businessType } : {})
  });
}

/** Takes the sample data out again. */
export function removeSampleData() {
  return request<{ ok: true; removed: number }>("/api/schedule/sample-data", { method: "DELETE" });
}

export function setUserSetting(key: string, value: string) {
  return request<{ ok: true; key: string; value: string }>(`/api/me/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  });
}

export function renameOrg(name: string) {
  return request<{ org: Org }>("/api/org", { method: "PATCH", body: JSON.stringify({ name }) });
}

export type CheckoutStart = { configured: boolean; url?: string; reason?: string; message?: string };

/**
 * Start Stripe Checkout for a paid plan. `configured: false` is a normal
 * answer (billing not connected yet) — the caller falls back to the trial.
 */
export function startCheckout(input: {
  plan: "pro" | "business";
  period: "monthly" | "yearly";
  seats: number;
  email?: string;
  returnTo?: "plans" | "onboarding" | "settings";
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  return request<CheckoutStart>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ ...input, origin }) });
}

/** Open Stripe's customer portal (invoices, payment method, cancel). `configured: false` when billing isn't connected. */
export function openBillingPortal(input: { email?: string; returnTo?: "plans" | "settings" }) {
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  return request<{ configured: boolean; url?: string; message?: string }>("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({ ...input, origin })
  });
}

export type SignupInput = {
  email: string;
  password: string;
  name: string;
  /** The company — it becomes the workspace, so it is required. */
  orgName: string;
  /** Explicit agreement to the Terms & Conditions and Privacy Policy. */
  acceptTerms: true;
  /** `false` gets a browser-session cookie, same as login. */
  remember?: boolean;
};

export function signup(input: SignupInput) {
  return request<AuthSession>("/api/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

/** `remember: false` gets a browser-session cookie, so closing the browser signs out. */
export function login(input: { email: string; password: string; remember?: boolean }) {
  return request<AuthSession>("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
}

/** Credential-free demo sign-in — powers "Preview the live demo". */
export function demoLogin() {
  return request<AuthSession>("/api/auth/demo", { method: "POST" });
}

export function logout() {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

/* ── in-app feedback ─────────────────────────────────────────────────────── */
export type FeedbackCategory = "idea" | "bug" | "praise" | "other";
/** What a message may carry with it; the server checks the count and the size over again. */
export type FeedbackAttachment = { name: string; type: string; dataUrl: string };
/** "Give feedback": only the words and the files travel. The server adds who wrote and from which workspace. */
export function sendFeedback(input: { category: FeedbackCategory; message: string; page: string; attachments?: FeedbackAttachment[] }) {
  return request<{ ok: true; mode: string }>("/api/feedback", { method: "POST", body: JSON.stringify(input) });
}

/** Restore the current session on load (401 if not signed in). */
export function fetchSession() {
  return request<AuthSession>("/api/auth/me");
}

/* ── Sign in with Google / Microsoft ─────────────────────────────────────── */
export type OAuthProvider = "google" | "microsoft";
export function fetchOauthStatus() {
  return request<{ providers: Record<OAuthProvider, boolean> }>("/api/auth/oauth/status");
}
/** Where the provider button sends the browser. A top-level navigation, so it is a URL, not a fetch. */
export function oauthStartUrl(provider: OAuthProvider, opts: { mode: "signup" | "login"; acceptTerms?: boolean; remember?: boolean }) {
  const params = new URLSearchParams({ mode: opts.mode, remember: opts.remember === false ? "0" : "1" });
  if (opts.acceptTerms) params.set("terms", "1");
  if (typeof window !== "undefined") params.set("returnTo", window.location.origin);
  return apiUrl(`/api/auth/oauth/${provider}/start?${params.toString()}`);
}

/** Emails a reset link. Always resolves ok — the server never reveals whether the address has an account. */
export function requestPasswordReset(email: string) {
  return request<{ ok: true }>("/api/auth/reset/request", { method: "POST", body: JSON.stringify({ email }) });
}

/** Sets a new password from an emailed link and signs the person in. */
export function resetPassword(token: string, password: string) {
  return request<AuthSession>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
}

/** Re-sends the email confirmation link to the signed-in account. */
export function requestEmailVerification() {
  return request<{ ok: true; alreadyVerified?: boolean }>("/api/auth/verify/request", { method: "POST" });
}

/* ── workspaces: one login, several BuildFlow programs (2026-09-15) ──────── */
/** The person's workspaces, the active one flagged, with how many more they may create. */
export function listWorkspaces() {
  return request<WorkspacesPayload>("/api/workspaces");
}
/** Creates a workspace beside the person's first and makes it the active one; its onboarding follows. */
export function createWorkspace() {
  return request<WorkspacesPayload & { session: AuthSession }>("/api/workspaces", { method: "POST", body: "{}" });
}
/** Makes another of the person's workspaces the active one; the app re-enters on it. */
export function switchWorkspace(id: string) {
  return request<WorkspacesPayload & { session: AuthSession }>(`/api/workspaces/${encodeURIComponent(id)}/switch`, {
    method: "POST",
    body: "{}"
  });
}

/** Confirms the address from an emailed link. */
export function verifyEmail(token: string) {
  return request<{ ok: true; account: Account }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
}

// ── BuildFlow AI ────────────────────────────────────────────────────────────
export type AiAskResult = { mode: "live" | "demo"; answer?: string };

/** Ask BuildFlow AI. Returns {mode:"demo"} (no answer) when Claude isn't
    configured or on error, so the caller falls back to the built-in simulation. */
export function askAi(question: string, businessType?: BusinessTypeId | "") {
  return request<AiAskResult>("/api/ai/ask", {
    method: "POST",
    // the trade rides along so the answer uses the business's own vocabulary
    body: JSON.stringify({ question, businessType: businessType || undefined })
  });
}

/** Read uploaded schedule image(s) with Claude vision → a project/job plan.
    {mode:"demo"} (no plan) when Claude isn't configured; caller uses its sample. */
export type ImportScheduleResult = { mode: "live" | "demo"; plan?: unknown[] };
export function importSchedule(images: string[]) {
  return request<ImportScheduleResult>("/api/ai/import-schedule", { method: "POST", body: JSON.stringify({ images }) });
}

export type WorkspaceSetupInput = {
  businessType: BusinessTypeId;
  selectedPlan?: PlanId;
  selectedProducts?: OnboardingProductId[];
  seats?: number;
};

/** Records the trade (and, at onboarding, the plan, add-ons and seats) on the org and returns the workspace. */
export function applyBusinessProfile(input: BusinessTypeId | WorkspaceSetupInput) {
  const body = typeof input === "string" ? { businessType: input } : input;
  return request<BootstrapPayload>("/api/business-profile", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** Books a crew-day. Without `force` the server answers 409 (code "conflict", `clashes`) when the crew is already booked that day. */
export function assignJob(input: { jobId: string; crewId: string; date: string }, options: { force?: boolean } = {}) {
  return request<ScheduleAssignment>("/api/schedule/assign", {
    method: "POST",
    body: JSON.stringify({ ...input, force: options.force })
  });
}

export type { CrewClash, RebookMove, RebookResult };

/** Everything one drop touches, in one request and one transaction; the same 409 as assignJob when a crew would be double-booked. */
export function rebookSchedule(moves: RebookMove[], options: { force?: boolean } = {}) {
  return request<RebookResult>("/api/schedule/rebook", {
    method: "POST",
    body: JSON.stringify({ moves, force: options.force })
  });
}

/* Drops one crew-day booking. The route answers 204 with no body, so this skips request()'s JSON parse. */
export async function removeScheduleAssignment(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/schedule/${id}`), { method: "DELETE", credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `Request failed: ${response.status}`,
      response.status,
      typeof body.field === "string" ? body.field : undefined,
      typeof body.code === "string" ? body.code : undefined,
      body
    );
  }
}

/** Snapshot the current plan as the baseline that variance is measured against. */
/** A dependency drawn on the Gantt; the server answers 409 (code self | duplicate | cycle) when the network refuses it. */
export function createDependency(input: CreateJobDependencyInput) {
  return request<JobDependency>("/api/schedule/dependencies", { method: "POST", body: JSON.stringify(input) });
}

export function deleteDependency(id: string) {
  return request<void>(`/api/schedule/dependencies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setScheduleBaseline() {
  return request<BootstrapPayload>("/api/schedule/baseline", { method: "POST" });
}

/** The working week and holidays (Settings › Work calendar). */
export function fetchWorkCalendar() {
  return request<WorkCalendarSetting>("/api/schedule/work-calendar");
}
export function saveWorkCalendar(input: WorkCalendarSetting) {
  return request<WorkCalendarSetting>("/api/schedule/work-calendar", { method: "PUT", body: JSON.stringify(input) });
}
/** One calendar-feed link per crew, for a phone to subscribe to. */
export function fetchCalendarFeeds() {
  return request<{ crews: Array<{ id: string; name: string; url: string }> }>("/api/schedule/feeds");
}

/**
 * `version` is the row as the caller last read it. Sending it turns a save made against a copy
 * somebody else has replaced into a 409 the board can explain, rather than an overwrite nobody
 * is told about. Omitting it writes unconditionally, which is what the import and the seed do.
 */
export function updateJob(id: string, input: Partial<Job>, version?: number) {
  return request<Job>(`/api/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(version == null ? input : { ...input, version })
  });
}

export function createJob(input: CreateJobInput) {
  return request<Job>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createCrew(input: CreateCrewInput) {
  return request<Crew>("/api/crews", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCrew(id: string, input: UpdateCrewInput) {
  return request<Crew>(`/api/crews/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

/* Cascades to the crew's assignments — see store.deleteCrew(). */
export function deleteCrew(id: string) {
  return request<void>(`/api/crews/${id}`, {
    method: "DELETE"
  });
}

export function createEquipment(input: CreateEquipmentInput) {
  return request<Equipment>("/api/equipment", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateEquipment(id: string, input: UpdateEquipmentInput) {
  return request<Equipment>(`/api/equipment/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteEquipment(id: string) {
  return request<void>(`/api/equipment/${id}`, {
    method: "DELETE"
  });
}

export function createMaterial(input: CreateMaterialInput) {
  return request<Material>("/api/materials", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMaterial(id: string, input: UpdateMaterialInput) {
  return request<Material>(`/api/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteMaterial(id: string) {
  return request<void>(`/api/materials/${id}`, {
    method: "DELETE"
  });
}

/**
 * A phase's own dates. The Month calendar's "<phase> Complete" marker writes the finish when it is
 * dragged; the jobs inside the phase keep theirs.
 */
export function updatePhase(id: string, input: UpdatePhaseInput) {
  return request<Phase>(`/api/phases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

/**
 * A project's fields as its PATCH wants them — all of them — so a single change (the Certificate of
 * Occupancy marker moving, say) carries the rest of the project as it already is.
 */
export function projectInput(project: Project, changes: Partial<UpdateProjectInput> = {}): UpdateProjectInput {
  return {
    name: project.name,
    location: project.location,
    address: project.address,
    type: project.type,
    contractType: project.contractType,
    managerId: project.managerId,
    targetCompletion: project.targetCompletion,
    percentComplete: project.percentComplete,
    status: project.status,
    scheduleHealth: project.scheduleHealth,
    value: project.value,
    ...changes
  };
}

export function updateProject(id: string, input: UpdateProjectInput) {
  return request<Project>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteProject(id: string) {
  return request<void>(`/api/projects/${id}`, {
    method: "DELETE"
  });
}

export function createProject(input: CreateProjectInput) {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * Post a field report. The reported percent (if any) writes straight through to
 * the job; the planned dates never move here. `variance` comes back non-null
 * only when the report implies the plan is wrong — that's a proposal awaiting a
 * PM, not a change that has happened.
 */
export function createFieldUpdate(input: Omit<FieldUpdate, "id" | "createdAt" | "photos"> & { photos?: string[] }) {
  return request<{ update: FieldUpdate; variance: ScheduleVariance | null }>("/api/field-updates", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * Correct a report. Same response shape as createFieldUpdate: an edited percent
 * is re-priced into a fresh pending variance, which supersedes the open one on
 * that job rather than queueing a second question for the PM.
 */
export function updateFieldUpdate(id: string, input: Omit<FieldUpdate, "id" | "createdAt" | "photos"> & { photos?: string[] }) {
  return request<{ update: FieldUpdate; variance: ScheduleVariance | null }>(`/api/field-updates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

/** Portfolio + per-project schedule position, with the week-over-week move. */
export type ScheduleStatusProject = ProjectScheduleStatus & {
  name: string;
  /** null when there is no prior week stored yet — show nothing rather than a fake flat delta. */
  daysAheadDelta: number | null;
  percentDelta: number | null;
};
/**
 * One week's portfolio reading, as the Dashboard trends it. The tile measures
 * were added after the first weeks were captured, so they are null on those.
 */
export type ScheduleWeekReading = {
  weekOf: string;
  daysAhead: number;
  percentComplete: number;
  onTrackProjects: number | null;
  projects: number | null;
  crewUtilization: number | null;
};
export type ScheduleStatusResponse = {
  asOf: string;
  weekOf: string;
  portfolio: {
    daysAhead: number;
    percentComplete: number;
    projects: number;
    behindProjects: number;
    reportingJobs: number;
    totalJobs: number;
    daysAheadDelta: number | null;
    percentDelta: number | null;
  };
  projects: ScheduleStatusProject[];
  /** Weekly readings, oldest first and this week's included; absent from an older server. */
  history?: ScheduleWeekReading[];
};

export function fetchScheduleStatus() {
  return request<ScheduleStatusResponse>("/api/schedule/status");
}

export function fetchVariances(status?: ScheduleVariance["status"]) {
  return request<ScheduleVariance[]>(`/api/schedule/variances${status ? `?status=${status}` : ""}`);
}

/** Believe the field: apply the proposal to the master schedule. */
export function acceptVariance(id: string, userId: string, note?: string) {
  return request<{ variance: ScheduleVariance; movedJobIds: string[] }>(`/api/schedule/variances/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({ userId, note })
  });
}

/** Keep the plan. The report and the disagreement both stay on the record. */
export function rejectVariance(id: string, userId: string, note?: string) {
  return request<ScheduleVariance>(`/api/schedule/variances/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ userId, note })
  });
}

export function createDelayIQ(input: Omit<DelayIQ, "id" | "reportedAt">) {
  return request<DelayIQ>("/api/delayIQs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/* ── Schedule import: Primavera P6 (.xer) / MS Project XML ─────────────────── */

export type ScheduleImportStats = {
  activitiesRead: number;
  jobs: number;
  phases: number;
  milestones: number;
  summariesSkipped: number;
  undatedSkipped: number;
  relationships: number;
};

/* The health check + forecastIQ the server computes from the imported schedule —
 * the day-one value moment. Mirrors ScheduleHealth in server/src/import/analyze.ts. */
export type ScheduleHealthFinding = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  count: number;
  sample: string[];
};

/** Probabilistic finish band from the Monte Carlo run over remaining CPM logic.
 *  Mirrors FinishConfidence in server/src/import/montecarlo.ts. */
export type FinishConfidence = {
  iterations: number;
  planFinish: string;
  p10: string;
  p50: string;
  p80: string;
  p90: string;
  onTimeProbability: number;
  p50SlipDays: number;
  p80SlipDays: number;
  method: string;
};

export type ScheduleForecastIQ = {
  dataDate: string;
  plannedFinish?: string;
  projectedFinish?: string;
  slipDays: number;
  percentComplete: number;
  percentTimeElapsed: number;
  scheduleIndex: number;
  status: "not_started" | "on_track" | "slipping" | "at_risk" | "complete";
  method: string;
  confidence?: FinishConfidence;
};

export type ScheduleHealth = {
  score: number;
  grade: "Healthy" | "Monitor" | "At Risk" | "Critical";
  headline: string;
  dataDate: string;
  stats: {
    activities: number;
    complete: number;
    inProgress: number;
    notStarted: number;
    milestones: number;
    relationships: number;
  };
  findings: ScheduleHealthFinding[];
  forecastIQ: ScheduleForecastIQ;
};

export type ScheduleImportPreview = {
  format: "xer" | "mspdi";
  source: string;
  stats: ScheduleImportStats;
  warnings: string[];
  health: ScheduleHealth;
  projects: {
    name: string;
    targetCompletion: string;
    phases: { name: string; startDate: string; endDate: string }[];
    jobCount: number;
    sampleJobs: { name: string; phase: string; startDate: string; endDate: string; status: Status }[];
  }[];
};

export type ScheduleImportResult = {
  format: "xer" | "mspdi";
  source: string;
  warnings: string[];
  health: ScheduleHealth;
  created: {
    projects: { id: string; name: string; slug: string }[];
    jobs: number;
    phases: number;
  };
};

export type ScheduleImportInput = { filename: string; content: string; defaultLocation?: string };

/**
 * Import failures are user-actionable ("that's a .mpp — export XML instead"), and
 * the fix lives in `hint`. The shared request() helper flattens a response to
 * `body.error` alone, so these routes get their own reader that keeps hint/code.
 */
export class ScheduleImportRequestError extends Error {
  hint?: string;
  code?: string;
  constructor(message: string, hint?: string, code?: string) {
    super(message);
    this.name = "ScheduleImportRequestError";
    this.hint = hint;
    this.code = code;
  }
}

async function scheduleImportRequest<T>(url: string, input: ScheduleImportInput): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch (error) {
    throw new ScheduleImportRequestError(
      error instanceof Error && error.message ? `Could not reach the BuildFlow API: ${error.message}` : "Could not reach the BuildFlow API."
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string; code?: string };
  if (!response.ok) {
    throw new ScheduleImportRequestError(payload.error ?? `Request failed: ${response.status}`, payload.hint, payload.code);
  }
  return payload as T;
}

/** Parse and report only — writes nothing. */
export function previewScheduleImport(input: ScheduleImportInput) {
  return scheduleImportRequest<ScheduleImportPreview>("/api/import/schedule/preview", input);
}

/** Create the projects/phases/jobs the preview described. */
export function commitScheduleImport(input: ScheduleImportInput) {
  return scheduleImportRequest<ScheduleImportResult>("/api/import/schedule/commit", input);
}

/* ── DelayIQ early-warning ─────────────────────────────────────────────────
 * Mirrors server/src/delayiq.ts. Proactive, read-only: what's trending late
 * and the downstream chain it pushes. */
export type DownstreamPush = {
  jobId: string;
  jobName: string;
  trade: string;
  currentEnd: string;
  pushedEnd: string;
  shiftDays: number;
  critical: boolean;
};

export type DelayRisk = {
  jobId: string;
  jobName: string;
  trade: string;
  projectId: string;
  kind: "behind_pace" | "overdue_start";
  currentEnd: string;
  forecastEnd: string;
  varianceDays: number;
  percentComplete: number;
  plannedPercent: number;
  severity: "High" | "Medium" | "Low";
  onCriticalPath: boolean;
  projectSlipDays: number;
  downstream: DownstreamPush[];
  affectedTrades: string[];
};

export type DelayEarlyWarning = { asOf: string; risks: DelayRisk[] };

export function fetchDelayEarlyWarning() {
  return request<DelayEarlyWarning>("/api/delayiq/early-warning");
}

/** Warn the affected downstream trades about one risk (PM-triggered). */
export function notifyDelayImpact(jobId: string) {
  return request<{ notified: string[]; severity: string }>("/api/delayiq/early-warning/notify", {
    method: "POST",
    body: JSON.stringify({ jobId })
  });
}

/* ── Google Calendar / Outlook, for the Dashboard's Meetings panel ─────────
   The connect flow is a full-page redirect to the provider, so it is a plain
   link rather than a fetch: `calendarConnectUrl` is what the button opens. The
   other three are ordinary calls. See server/src/calendar.ts for what has to be
   registered with each provider before any of it can connect. */

export type CalendarProviderId = "google" | "microsoft";

/** Per provider: whether this deployment has credentials, and whether this person has connected. */
export type CalendarStatus = {
  providers: Record<CalendarProviderId, { configured: boolean; connected: boolean; email: string }>;
};

/** One meeting, already normalised by the server whichever provider it came from. */
export type CalendarMeeting = {
  id: string;
  provider: CalendarProviderId;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  joinUrl: string;
  attendees: string[];
};

export type CalendarFeed = {
  events: CalendarMeeting[];
  /** Providers that are connected but could not be reached on this fetch. */
  failed: CalendarProviderId[];
  fetchedAt: string;
};

export function calendarStatus(): Promise<CalendarStatus> {
  return request<CalendarStatus>("/api/calendar/status");
}

export function calendarFeed(): Promise<CalendarFeed> {
  return request<CalendarFeed>("/api/calendar/events");
}

/**
 * Where the Connect button goes. A full-page navigation, not a fetch: the provider
 * has to show its own consent screen, and it sends the browser back to `returnTo`
 * with `?calendar=connected` or `?calendar=error&reason=…`.
 */
export function calendarConnectUrl(provider: CalendarProviderId): string {
  const returnTo = typeof window === "undefined" ? "" : window.location.origin;
  return apiUrl(`/api/calendar/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`);
}

export function disconnectCalendar(provider: CalendarProviderId): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/calendar/${provider}`, { method: "DELETE" });
}
