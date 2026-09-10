/* =========================================================================
   notify.ts — outbound OPERATIONAL notifications.

   Alerts the people running a job when something changes: a delayIQ is reported,
   a crew gets a new assignment, or an assignment double-books a crew. Fans out
   across channels, same "wired now, live when configured" pattern as email.ts:

     - email : reuses email.ts sendMail (already works via SMTP / Ethereal / LOG).
     - sms   : Twilio REST (no SDK) — logs until TWILIO_* is set.
     - push  : logs the payload until a web-push provider (VAPID) + stored client
               subscriptions exist; the channel is wired end-to-end and ready to
               swap in web-push/FCM once the client registers a service worker.

   Recipients: users/crews don't carry contact fields yet, so email goes to the
   org's login accounts (the PMs) + OPS_NOTIFY_EMAIL, and SMS to OPS_NOTIFY_SMS.
   When the app starts collecting crew emails/phones, resolve them into the
   `recipients` passed to sendOpsNotice — no other change needed.

   NEVER THROWS — a failed notification must not break the operation that fired it.
   ========================================================================= */
import { sendMail } from "./email.js";

export type NotifyChannel = "email" | "sms" | "push";
export type OpsRecipients = { emails: string[]; phones: string[] };
export type OpsNotice = {
  kind: "delayIQ" | "assignment" | "conflict" | "variance" | "digest";
  subject: string; // email subject / push title
  heading: string; // short headline
  lines: string[]; // body detail lines
  sms: string; // one-line SMS / push text
};

function enabledChannels(): Set<NotifyChannel> {
  const raw = (process.env.NOTIFY_CHANNELS ?? "email")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(raw.filter((c): c is NotifyChannel => c === "email" || c === "sms" || c === "push"));
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/* ── SMS via Twilio REST (no SDK; logs until configured) ──────────────────── */
export async function sendSms(to: string, body: string): Promise<{ ok: boolean; mode: "twilio" | "log" }> {
  if (!smsConfigured()) {
    console.log(`📱 [sms · LOG MODE — set TWILIO_* to send] → ${to}: ${body}`);
    return { ok: true, mode: "log" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const params = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else params.set("From", process.env.TWILIO_FROM!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    if (!res.ok) {
      console.error(`📱 [sms] Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { ok: false, mode: "twilio" };
    }
    return { ok: true, mode: "twilio" };
  } catch (error) {
    console.error("📱 [sms] send failed:", error instanceof Error ? error.message : error);
    return { ok: false, mode: "twilio" };
  }
}

/* ── Push (stub until VAPID keys + stored client subscriptions exist) ─────── */
async function sendPush(title: string, body: string): Promise<{ ok: boolean; mode: "log" }> {
  const why = pushConfigured()
    ? "VAPID set, but no stored client subscriptions yet"
    : "LOG MODE — set VAPID_* and register client push subscriptions";
  console.log(`🔔 [push · ${why}] ${title}: ${body}`);
  return { ok: true, mode: "log" };
}

/* ── Email body ───────────────────────────────────────────────────────────── */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function noticeHtml(notice: OpsNotice): string {
  const accent = notice.kind === "conflict" ? "#c2410c" : notice.kind === "delayIQ" ? "#b45309" : "#1a73e8";
  const rows = notice.lines
    .map((l) => `<p style="font-size:14px;line-height:1.6;color:#575550;margin:0 0 8px">${escapeHtml(l)}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#ffffff">
    <p style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${accent};margin:0 0 6px">BuildFlow · ${escapeHtml(notice.kind)}</p>
    <h1 style="font-size:20px;font-weight:600;margin:0 0 14px;color:#1c1c1a">${escapeHtml(notice.heading)}</h1>
    ${rows}
    <p style="font-size:12px;color:#8a877e;margin:18px 0 0">You're receiving this because you manage this workspace in BuildFlow.</p>
  </div>`;
}

/* ── Notice builders ──────────────────────────────────────────────────────── */
export function assignmentNotice(a: { crew: string; job: string; project?: string; date: string; foreman?: string }): OpsNotice {
  const where = a.project ? ` (${a.project})` : "";
  return {
    kind: "assignment",
    subject: `New assignment: ${a.crew} → ${a.job}`,
    heading: `${a.crew} is scheduled for ${a.job}`,
    lines: [`Crew: ${a.crew}${a.foreman ? ` — foreman ${a.foreman}` : ""}`, `Job: ${a.job}${where}`, `Date: ${a.date}`],
    sms: `BuildFlow: ${a.crew} assigned to ${a.job}${where} on ${a.date}.`
  };
}
export function conflictNotice(a: { crew: string; job: string; project?: string; date: string; conflicts: string[] }): OpsNotice {
  const where = a.project ? ` (${a.project})` : "";
  return {
    kind: "conflict",
    subject: `⚠️ Crew conflict: ${a.crew} double-booked on ${a.date}`,
    heading: `Double-booking flagged for ${a.crew}`,
    lines: [`Crew: ${a.crew}`, `Job: ${a.job}${where}`, `Date: ${a.date}`, ...a.conflicts.map((c) => `Conflict: ${c}`)],
    sms: `BuildFlow ⚠️: ${a.crew} double-booked on ${a.date} (${a.job}). Review the schedule.`
  };
}
export function delayIQNotice(a: {
  project?: string;
  title: string;
  category: string;
  impactDays: number;
  severity: string;
  description?: string;
}): OpsNotice {
  return {
    kind: "delayIQ",
    subject: `DelayIQ reported${a.project ? ` on ${a.project}` : ""}: ${a.title}`,
    heading: `${a.severity} delayIQ: ${a.title}`,
    lines: [
      a.project ? `Project: ${a.project}` : "",
      `Category: ${a.category}`,
      `Impact: ${a.impactDays} day${a.impactDays === 1 ? "" : "s"}`,
      `Severity: ${a.severity}`,
      a.description ? `Details: ${a.description}` : ""
    ].filter(Boolean),
    sms: `BuildFlow: ${a.severity} delayIQ${a.project ? ` on ${a.project}` : ""} — ${a.title} (+${a.impactDays}d).`
  };
}

/**
 * DelayIQ early-warning: a job is trending late and drags downstream trades with
 * it. Sent when a PM chooses to warn the affected trades — proactive, before the
 * slip is a fact, which is the whole point.
 */
export function delayImpactNotice(a: {
  project?: string;
  jobName: string;
  trade: string;
  varianceDays: number;
  projectSlipDays: number;
  severity: string;
  affectedTrades: string[];
  downstreamCount: number;
}): OpsNotice {
  const trades = a.affectedTrades.length ? a.affectedTrades.join(", ") : "no downstream trades yet";
  return {
    kind: "delayIQ",
    subject: `Heads-up: ${a.jobName} trending ${a.varianceDays} day${a.varianceDays === 1 ? "" : "s"} behind${a.project ? ` on ${a.project}` : ""}`,
    heading: `${a.trade} is trending late — it pushes ${a.downstreamCount} downstream activit${a.downstreamCount === 1 ? "y" : "ies"}`,
    lines: [
      a.project ? `Project: ${a.project}` : "",
      `Activity: ${a.jobName} (${a.trade})`,
      `Trending: ${a.varianceDays} working day${a.varianceDays === 1 ? "" : "s"} behind its planned finish`,
      a.projectSlipDays > 0
        ? `Project finish at risk: +${a.projectSlipDays} day${a.projectSlipDays === 1 ? "" : "s"} if unchecked`
        : "Downstream buffer is absorbing it for now",
      `Affected trades: ${trades}`,
      "",
      "This is an early warning from BuildFlow DelayIQ — the plan hasn't changed. Plan around it now while there's still room."
    ].filter((line, index, all) => line !== "" || index < all.length - 1),
    sms: `BuildFlow DelayIQ: ${a.jobName} trending ${a.varianceDays}d behind${a.project ? ` on ${a.project}` : ""} — pushes ${trades}.`
  };
}

/* ── Dispatch across the enabled channels — fire-and-forget, never throws ──── */
export async function sendOpsNotice(notice: OpsNotice, recipients: OpsRecipients): Promise<void> {
  try {
    const channels = enabledChannels();
    if (channels.size === 0) return;
    const html = noticeHtml(notice);
    const text = [notice.heading, "", ...notice.lines].join("\n");
    const jobs: Promise<unknown>[] = [];
    if (channels.has("email")) for (const to of recipients.emails) jobs.push(sendMail({ to, subject: notice.subject, html, text }));
    if (channels.has("sms")) for (const to of recipients.phones) jobs.push(sendSms(to, notice.sms));
    if (channels.has("push")) jobs.push(sendPush(notice.subject, notice.sms));
    if (jobs.length === 0) {
      console.log(`🔔 [notify] ${notice.kind}: no recipients resolved (add org accounts or set OPS_NOTIFY_EMAIL/SMS).`);
      return;
    }
    await Promise.allSettled(jobs);
  } catch (error) {
    console.error("[notify] dispatch failed:", error instanceof Error ? error.message : error);
  }
}

/* ── Boot banner ──────────────────────────────────────────────────────────── */
/**
 * A field report says the plan is wrong in a way that moves the project finish.
 * Deliberately reserved for High severity — a variance the network absorbs is a
 * drawer item, not something worth a PM's phone buzzing on a Saturday.
 */
export function varianceNotice(a: {
  project: string;
  job: string;
  reportedPercent: number;
  plannedPercent: number;
  varianceDays: number;
  projectSlipDays: number;
  reporter: string;
}): OpsNotice {
  const late = a.varianceDays > 0;
  const drift = Math.abs(a.varianceDays);
  return {
    kind: "variance",
    subject: `Schedule variance on ${a.project}: ${a.job} forecastIQs ${drift} day${drift === 1 ? "" : "s"} ${late ? "late" : "early"}`,
    heading: `${a.job} — reported ${a.reportedPercent}% against a plan of ${a.plannedPercent}%`,
    lines: [
      `Project: ${a.project}`,
      `Reported by: ${a.reporter}`,
      `Progress: ${a.reportedPercent}% actual vs ${a.plannedPercent}% planned`,
      `ForecastIQ: ${drift} working day${drift === 1 ? "" : "s"} ${late ? "late" : "early"}`,
      `Project finish moves: ${a.projectSlipDays} day${a.projectSlipDays === 1 ? "" : "s"}`,
      "",
      "The master schedule has NOT been changed. Review and accept or reject this variance in BuildFlow → Schedule → Field variances."
    ].filter((line, index, all) => line !== "" || index < all.length - 1),
    sms: `BuildFlow: ${a.job} on ${a.project} reported ${a.reportedPercent}% (plan ${a.plannedPercent}%) — project finish +${a.projectSlipDays}d if accepted. Review in Schedule.`
  };
}

export function reportNotifyStatus(): void {
  const channels = [...enabledChannels()];
  const detail = channels
    .map((c) =>
      c === "email"
        ? "email (uses the email transport above)"
        : c === "sms"
          ? smsConfigured()
            ? "SMS LIVE (Twilio)"
            : "SMS LOG MODE (set TWILIO_*)"
          : pushConfigured()
            ? "push (VAPID set — needs client subscriptions)"
            : "push LOG MODE (set VAPID_* + client subscriptions)"
    )
    .join("; ");
  const extra = [process.env.OPS_NOTIFY_EMAIL && "OPS_NOTIFY_EMAIL", process.env.OPS_NOTIFY_SMS && "OPS_NOTIFY_SMS"].filter(Boolean);
  console.log(
    `🔔 Notifications: channels [${channels.join(", ") || "none"}]${detail ? ` — ${detail}` : ""}. ` +
      `Recipients: org account emails${extra.length ? ` + ${extra.join(" + ")}` : ""}. Events: delayIQs · new assignments · crew conflicts · critical-path field variances.`
  );
}
