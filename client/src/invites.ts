/**
 * Checking a list of invite drafts before any of it is sent — shared by the signup flow's last
 * step (onboarding/InviteTeamPage.tsx) and Settings › People, which both let an owner type a few
 * addresses and pick what each may do.
 *
 * Moved out of App.tsx on 2026-09-22 when the onboarding step left for onboarding/: a module there
 * cannot import from App.tsx (App imports it), and two copies of the same validation would drift.
 *
 * Blank rows are skipped rather than refused — a form that starts with three empty rows should
 * not complain about the two nobody used.
 */
import type { InviteDraft } from "./api";

/* Deliberately loose: the server does the real check; this only catches "jordan" or
   "jordan@reyes" before a round trip. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkInviteRows(rows: InviteDraft[]): { valid: InviteDraft[]; errors: Record<number, string> } {
  const errors: Record<number, string> = {};
  const valid: InviteDraft[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const email = row.email.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      errors[index] = "Enter a valid email address.";
      return;
    }
    if (seen.has(email)) {
      errors[index] = "Already in the list.";
      return;
    }
    seen.add(email);
    valid.push({ email, permission: row.permission });
  });
  return { valid, errors };
}
