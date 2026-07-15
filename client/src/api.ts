import type {
  BootstrapPayload,
  BusinessTypeId,
  CreateCrewInput,
  CreateEquipmentInput,
  CreateJobInput,
  CreateMaterialInput,
  CreateProjectInput,
  Crew,
  Delay,
  Equipment,
  FieldUpdate,
  Job,
  Material,
  Project,
  ScheduleAssignment,
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

export function login(input: { email: string; password: string }) {
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

export function createFieldUpdate(input: Omit<FieldUpdate, "id" | "createdAt" | "photos"> & { photos?: string[] }) {
  return request<FieldUpdate>("/api/field-updates", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createDelay(input: Omit<Delay, "id" | "reportedAt">) {
  return request<Delay>("/api/delays", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
