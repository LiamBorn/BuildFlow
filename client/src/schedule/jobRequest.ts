/**
 * "Open this job's drawer": asked for from outside the schedule pages — a record link
 * (`#open/job/<id>`, ../openLinks.ts) — and answered by whichever schedule page is showing, or the one
 * about to mount. The drawer is each page's own state (page.tsx), so the request waits here until a
 * page takes it, and a page already on screen is told by an event.
 */
export const JOB_REQUEST_EVENT = "bf:open-job";

let requested: string | null = null;

/** Ask for a job's drawer. The Month (or whichever schedule page shows) opens it as it mounts, or at once if it is up. */
export function requestJobDrawer(jobId: string) {
  requested = jobId;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(JOB_REQUEST_EVENT));
}

/** The job asked for, once. */
export function takeJobRequest(): string | null {
  const jobId = requested;
  requested = null;
  return jobId;
}
