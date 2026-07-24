import type {
  BootstrapPayload,
  BusinessTypeId,
  CreateCrewInput,
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
  Project,
  ScheduleAssignment,
  ScheduleVariance,
  Status,
  UpdateCrewInput,
  UpdateEquipmentInput,
  UpdateProjectInput
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

function apiUrl(url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${configuredApiBaseUrl || localDevApiBaseUrl()}${url}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      credentials: "include", // send/receive the bf_session auth cookie
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      },
      ...options
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `Could not reach the BuildFlow API: ${error.message}`
        : "Could not reach the BuildFlow API."
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function loadBootstrap() {
  return request<BootstrapPayload>("/api/bootstrap");
}

// ── Authentication ──────────────────────────────────────────────────────────
export type Account = { id: string; orgId: string; email: string; name: string; role: string; createdAt: string };
export type Org = { id: string; name: string; plan: string; createdAt: string };
export type AuthSession = { account: Account; org: Org };

export function signup(input: { email: string; password: string; name: string; orgName?: string }) {
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

/** Restore the current session on load (401 if not signed in). */
export function fetchSession() {
  return request<AuthSession>("/api/auth/me");
}

// ── BuildFlow AI ────────────────────────────────────────────────────────────
export type AiAskResult = { mode: "live" | "demo"; answer?: string };

/** Ask BuildFlow AI. Returns {mode:"demo"} (no answer) when Claude isn't
    configured or on error, so the caller falls back to the built-in simulation. */
export function askAi(question: string) {
  return request<AiAskResult>("/api/ai/ask", { method: "POST", body: JSON.stringify({ question }) });
}

/** Read uploaded schedule image(s) with Claude vision → a project/job plan.
    {mode:"demo"} (no plan) when Claude isn't configured; caller uses its sample. */
export type ImportScheduleResult = { mode: "live" | "demo"; plan?: unknown[] };
export function importSchedule(images: string[]) {
  return request<ImportScheduleResult>("/api/ai/import-schedule", { method: "POST", body: JSON.stringify({ images }) });
}

export function applyBusinessProfile(businessType: BusinessTypeId) {
  return request<BootstrapPayload>("/api/business-profile", {
    method: "POST",
    body: JSON.stringify({ businessType })
  });
}

export function assignJob(input: { jobId: string; crewId: string; date: string; status?: Status }) {
  return request<ScheduleAssignment>("/api/schedule/assign", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateScheduleAssignment(
  id: string,
  input: Partial<Pick<ScheduleAssignment, "jobId" | "crewId" | "date" | "status">>
) {
  return request<ScheduleAssignment>(`/api/schedule/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

/** Snapshot the current plan as the baseline that variance is measured against. */
export function setScheduleBaseline() {
  return request<BootstrapPayload>("/api/schedule/baseline", { method: "POST" });
}

export function updateJob(id: string, input: Partial<Job>) {
  return request<Job>(`/api/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
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

export function updateProject(id: string, input: UpdateProjectInput) {
  return request<Project>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
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
      error instanceof Error && error.message
        ? `Could not reach the BuildFlow API: ${error.message}`
        : "Could not reach the BuildFlow API."
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string; code?: string };
  if (!response.ok) {
    throw new ScheduleImportRequestError(
      payload.error ?? `Request failed: ${response.status}`,
      payload.hint,
      payload.code
    );
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
