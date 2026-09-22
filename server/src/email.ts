/* =========================================================================
   Waitlist email sender  (waitlist — removable feature)

   Sends the waitlist confirmation + launch emails over SMTP. Configure real
   delivery with env vars:
       SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
       SMTP_SECURE ("true" for port 465), SMTP_FROM (e.g. "BuildFlow <hi@you.com>")
   Works with any SMTP provider (Gmail, Mailjet, SendGrid, Resend, Postmark…).

   Without SMTP_HOST it runs in "LOG MODE": emails are printed to the server
   console instead of being sent, so the whole flow is testable before you add
   credentials. Set EMAIL_MODE=ethereal (no credentials needed) to instead do a
   real SMTP round-trip to a throwaway Ethereal test inbox — each message logs a
   preview URL you can open in the browser to see the rendered email. sendMail
   never throws — a failed send won't break a signup.

   To remove the waitlist entirely, delete this file along with the waitlist
   table + methods in database.ts and the waitlist routes in app.ts.
   ========================================================================= */
import nodemailer, { type Transporter } from "nodemailer";

const FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "BuildFlow <hello@buildflow.com>";

type MailMode = "smtp" | "ethereal" | "log";

let cached: { transporter: Transporter | null; mode: MailMode } | undefined;

/* Resolve the transport once and cache it. Three modes, in priority order:
     1. SMTP_HOST set        → real delivery via your provider          ("smtp")
     2. EMAIL_MODE=ethereal  → real SMTP round-trip to a nodemailer
                               throwaway test inbox (no real recipients,
                               no credentials), a preview URL per message ("ethereal")
     3. otherwise            → LOG MODE: printed to the console          ("log")
   Ethereal needs network to provision its test account; if that fails we fall
   back to LOG MODE so a signup never breaks. */
async function getTransport(): Promise<{ transporter: Transporter | null; mode: MailMode }> {
  // Tests never touch the network: signup, verification, reset and invites all
  // send mail, and an Ethereal account round-trip per test is what made the
  // suite flaky. Log mode prints the message and returns immediately.
  if (process.env.NODE_ENV === "test" && !process.env.BUILDFLOW_TEST_REAL_MAIL) {
    return { transporter: null, mode: "log" };
  }
  if (cached !== undefined) return cached;

  const host = process.env.SMTP_HOST;
  if (host) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    cached = { transporter, mode: "smtp" };
    return cached;
  }

  const wantEthereal = process.env.EMAIL_MODE === "ethereal" || process.env.SMTP_ETHEREAL === "1" || process.env.SMTP_ETHEREAL === "true";
  if (wantEthereal) {
    try {
      const account = await nodemailer.createTestAccount();
      const transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass }
      });
      cached = { transporter, mode: "ethereal" };
      return cached;
    } catch (error) {
      console.error(
        "📧 Ethereal test inbox could not be provisioned (offline?):",
        error instanceof Error ? error.message : error,
        "— falling back to LOG MODE."
      );
    }
  }

  cached = { transporter: null, mode: "log" };
  return cached;
}

export type MailResult = { ok: boolean; mode: MailMode; previewUrl?: string };

/* `content` is the file itself. With `encoding: "base64"` it is the base64 TEXT and
   nodemailer decodes it; without one it is taken as the raw bytes. */
export type MailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
  encoding?: "base64";
};
export async function sendMail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  const { transporter, mode } = await getTransport();
  if (!transporter) {
    console.log(
      `\n📧 [email · LOG MODE — set SMTP_* env vars to send for real]\n   To:      ${msg.to}\n   Subject: ${msg.subject}\n   ${msg.text.replace(/\n/g, "\n   ")}\n`
    );
    return { ok: true, mode: "log" };
  }
  try {
    const info = await transporter.sendMail({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments
    });
    if (mode === "ethereal") {
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      console.log(
        `\n📧 [email · ETHEREAL — test inbox, not a real recipient]\n   To:      ${msg.to}\n   Subject: ${msg.subject}\n   Preview: ${previewUrl ?? "(no preview url returned)"}\n`
      );
      return { ok: true, mode, previewUrl };
    }
    return { ok: true, mode };
  } catch (error) {
    console.error("[email] send failed:", error instanceof Error ? error.message : error);
    return { ok: false, mode };
  }
}

/* Boot-time status check. Logged once at startup so the operator immediately
   knows whether real email is on. In LOG MODE it says so; when SMTP_* is set it
   actually opens a connection (transporter.verify) and reports success/failure,
   turning silent misconfiguration into a loud line in the server log. */
export async function reportMailStatus(): Promise<void> {
  const { transporter, mode } = await getTransport();
  const salesEmail = process.env.SALES_EMAIL ?? process.env.SMTP_USER;
  if (mode === "log") {
    console.warn(
      "📧 Email: LOG MODE — SMTP_HOST is not set. Contact-Sales & waitlist emails are printed to this console only and are NOT delivered. Set SMTP_* in server/.env to send for real, or EMAIL_MODE=ethereal to send to a viewable test inbox."
    );
    return;
  }
  if (mode === "ethereal") {
    console.log(
      `📧 Email: ETHEREAL TEST MODE — messages do a real SMTP round-trip to a throwaway inbox (no real recipients) and each send logs a preview URL. Sending as "${FROM}", sales leads → ${salesEmail ?? "sales@buildflow.com"}. Set SMTP_* in server/.env for real delivery.`
    );
    return;
  }
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ?? "587";
  try {
    await transporter!.verify();
    console.log(`📧 Email: LIVE — SMTP ${host}:${port} verified, sending as "${FROM}". Sales leads → ${salesEmail}.`);
  } catch (error) {
    console.error(
      `📧 Email: SMTP is configured (${host}:${port}) but the connection FAILED: ${error instanceof Error ? error.message : error}. ` +
        "Emails will not send until this is fixed — check SMTP_HOST/PORT/USER/PASS/SECURE in server/.env."
    );
  }
  if (!salesEmail) {
    console.warn('📧 ⚠️  SALES_EMAIL is not set — sales lead notifications fall back to the default "sales@buildflow.com".');
  }
}

/* ────────────────────────────── templates ──────────────────────────────── */
const shell = (inner: string) =>
  `<!doctype html><html><body style="margin:0;background:#f5f6fa;padding:32px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1c1a">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
  `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid rgba(28,28,26,0.08);border-radius:16px">` +
  `<tr><td style="padding:34px 36px">${inner}</td></tr></table>` +
  `<p style="color:#8a877e;font-size:12px;margin:18px 0 0">BuildFlow · Production scheduling for construction teams</p>` +
  `</td></tr></table></body></html>`;

export function waitlistConfirmationEmail(publicUrl: string) {
  const subject = "You're on the BuildFlow waitlist 🎉";
  const text =
    `Thanks for joining the BuildFlow waitlist!\n\n` +
    `We're building the command center for construction crews, schedules, and materials — ` +
    `and you're now in line for early access before launch, founding-member pricing, and a ` +
    `heads-up the day we go live.\n\nWe'll email you the moment early access opens.\n` +
    `Preview BuildFlow: ${publicUrl}\n\nWe appreciate you being early. — The BuildFlow team`;
  const html = shell(
    `<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">You're on the list 🎉</h1>` +
      `<p style="font-size:14px;line-height:1.6;color:#575550;margin:0 0 16px">Thanks for joining the <strong>BuildFlow</strong> waitlist. We're building the command center for construction crews, schedules, and materials — and you're now in line for:</p>` +
      `<ul style="font-size:14px;line-height:1.7;color:#575550;margin:0 0 22px;padding-left:18px"><li>Early access before launch</li><li>Founding-member pricing</li><li>A heads-up the day we go live</li></ul>` +
      `<a href="${publicUrl}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">Preview BuildFlow →</a>` +
      `<p style="font-size:13px;color:#8a877e;margin:22px 0 0">We appreciate you being early. — The BuildFlow team</p>`
  );
  return { subject, html, text };
}

export function updatesSubscriptionEmail(publicUrl: string) {
  const subject = "You're subscribed to BuildFlow updates";
  const text =
    `Thanks for subscribing to the BuildFlow changelog.\n\n` +
    `From now on you'll get an email each time we ship — new pages, improvements to the ` +
    `schedule, and the fixes that came out of the field. No marketing, just what changed.\n\n` +
    `Read the changelog: ${publicUrl}/#updates\n\n` +
    `You can unsubscribe from any of these emails. — The BuildFlow team`;
  const html = shell(
    `<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">You're subscribed</h1>` +
      `<p style="font-size:14px;line-height:1.6;color:#575550;margin:0 0 16px">You'll get an email each time <strong>BuildFlow</strong> ships. Expect:</p>` +
      `<ul style="font-size:14px;line-height:1.7;color:#575550;margin:0 0 22px;padding-left:18px"><li>New pages and products as they land</li><li>Improvements to the schedule your crews run</li><li>The fixes that came out of the field</li></ul>` +
      `<a href="${publicUrl}/#updates" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">Read the changelog →</a>` +
      `<p style="font-size:13px;color:#8a877e;margin:22px 0 0">You can unsubscribe from any of these emails. — The BuildFlow team</p>`
  );
  return { subject, html, text };
}

export function waitlistLaunchEmail(publicUrl: string) {
  const subject = "BuildFlow is live 🚀";
  const text =
    `BuildFlow has launched!\n\n` +
    `The day is here — your early access is ready. Put your crews, schedules, materials, ` +
    `and field updates on one command center.\n\nGet started: ${publicUrl}\n\n` +
    `Thank you for being one of the first to join. — The BuildFlow team`;
  const html = shell(
    `<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">BuildFlow is live 🚀</h1>` +
      `<p style="font-size:14px;line-height:1.6;color:#575550;margin:0 0 18px">The day is here — <strong>BuildFlow has launched</strong>, and your early access is ready. Put your crews, schedules, materials, and field updates on one command center.</p>` +
      `<a href="${publicUrl}" style="display:inline-block;background:linear-gradient(90deg,#18ccfc,#6344f5 55%,#ae48ff);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px">Get started →</a>` +
      `<p style="font-size:13px;color:#8a877e;margin:22px 0 0">Thank you for being one of the first to join. — The BuildFlow team</p>`
  );
  return { subject, html, text };
}

/* ──────────────────────── contact sales templates ──────────────────────────
   Two transactional emails fired when a lead submits the Contact Sales form:
   a thank-you to the customer, and a lead notification to the sales inbox.
   User-supplied fields are HTML-escaped before they go into the markup. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

export type SalesLead = {
  name: string;
  email: string;
  phone?: string;
  company: string;
  teamSize: string;
  interest: string;
  message: string;
};

const leadRow = (label: string, value: string) =>
  `<tr><td style="color:#8a877e;padding:2px 14px 2px 0;white-space:nowrap;vertical-align:top">${label}</td><td style="vertical-align:top">${value}</td></tr>`;

// Sent to the person who filled out the form.
export function contactSalesThankYouEmail(lead: SalesLead) {
  const first = lead.name.trim().split(/\s+/)[0] || "there";
  const subject = "Thanks for contacting BuildFlow sales";
  const text =
    `Hi ${first},\n\n` +
    `Thanks for reaching out to BuildFlow sales. We've received your request about ` +
    `${lead.interest.toLowerCase()} and a specialist will get back to you within one business day.\n\n` +
    `What you sent us:\n` +
    `  Company:       ${lead.company}\n` +
    `  Team size:     ${lead.teamSize}\n` +
    `  Interested in: ${lead.interest}\n` +
    (lead.message ? `  Notes:         ${lead.message}\n` : "") +
    `\nTalk soon,\nThe BuildFlow sales team`;
  const html = shell(
    `<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">Thanks, ${escapeHtml(first)} 👋</h1>` +
      `<p style="font-size:14px;line-height:1.6;color:#575550;margin:0 0 16px">Thanks for reaching out to <strong>BuildFlow sales</strong>. We've received your request about <strong>${escapeHtml(lead.interest.toLowerCase())}</strong> — a specialist will get back to you <strong>within one business day</strong>.</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.7;color:#575550;margin:0 0 20px">` +
      leadRow("Company", escapeHtml(lead.company)) +
      leadRow("Team size", escapeHtml(lead.teamSize)) +
      leadRow("Interested in", escapeHtml(lead.interest)) +
      (lead.message ? leadRow("Notes", escapeHtml(lead.message)) : "") +
      `</table>` +
      `<p style="font-size:13px;color:#8a877e;margin:0">Talk soon — The BuildFlow sales team</p>`
  );
  return { subject, html, text };
}

// Sent to the sales department when a new lead comes in.
export function contactSalesLeadEmail(lead: SalesLead) {
  const subject = `New sales lead: ${lead.company} · ${lead.interest}`;
  const text =
    `New potential customer via the Contact Sales page:\n\n` +
    `  Name:      ${lead.name}\n` +
    `  Email:     ${lead.email}\n` +
    (lead.phone ? `  Phone:     ${lead.phone}\n` : "") +
    `  Company:   ${lead.company}\n` +
    `  Team size: ${lead.teamSize}\n` +
    `  Interest:  ${lead.interest}\n` +
    `  Message:   ${lead.message || "(none)"}\n\n` +
    `Reply to ${lead.email} to follow up.`;
  const html = shell(
    `<p style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#1a73e8;margin:0 0 6px">New sales lead</p>` +
      `<h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${escapeHtml(lead.company)}</h1>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.8;color:#575550;margin:0 0 18px">` +
      leadRow("Name", escapeHtml(lead.name)) +
      leadRow("Email", `<a href="mailto:${escapeHtml(lead.email)}" style="color:#1a73e8">${escapeHtml(lead.email)}</a>`) +
      (lead.phone ? leadRow("Phone", `<a href="tel:${escapeHtml(lead.phone)}" style="color:#1a73e8">${escapeHtml(lead.phone)}</a>`) : "") +
      leadRow("Team size", escapeHtml(lead.teamSize)) +
      leadRow("Interested in", escapeHtml(lead.interest)) +
      `</table>` +
      (lead.message
        ? `<p style="font-size:13.5px;line-height:1.6;color:#575550;margin:0 0 18px;padding:14px 16px;background:#f5f6fa;border-radius:10px">${escapeHtml(lead.message)}</p>`
        : "") +
      `<a href="mailto:${escapeHtml(lead.email)}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">Reply to ${escapeHtml(lead.name.trim().split(/\s+/)[0] || "lead")} →</a>`
  );
  return { subject, html, text };
}

/* ── in-app feedback ───────────────────────────────────────────────────────
   The "Give feedback" tab on the Dashboard. The server fills in WHO is writing —
   the workspace and the signed-in person — so the person only types the
   feedback; the identification is what the recipient asked for. */
export type FeedbackEntry = {
  category: string;
  message: string;
  page: string;
  company: { id: string; name: string; plan: string };
  person: { name: string; email: string; role: string };
  sentAt: string;
  /* what the person attached — the files themselves ride on the message, this is
     only so the body says what is there without anyone having to scroll down */
  attachments?: { name: string; size: number }[];
};

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function feedbackEmail(entry: FeedbackEntry) {
  const label = FEEDBACK_LABELS[entry.category] ?? entry.category;
  const files = entry.attachments ?? [];
  const fileList = files.map((one) => `${one.name} (${fileSize(one.size)})`).join(", ");
  const subject = `BuildFlow feedback from ${entry.company.name} · ${label}`;
  const text =
    `New feedback from inside BuildFlow:\n\n` +
    `  Company:  ${entry.company.name} (${entry.company.plan} plan, workspace ${entry.company.id})\n` +
    `  From:     ${entry.person.name} <${entry.person.email}> · ${entry.person.role}\n` +
    `  Kind:     ${label}\n` +
    `  Page:     ${entry.page}\n` +
    `  Sent:     ${entry.sentAt}\n` +
    (files.length ? `  Attached: ${fileList}\n` : "") +
    `\n${entry.message}\n\n` +
    `Reply to ${entry.person.email} to follow up.`;
  const html = shell(
    `<p style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#1a73e8;margin:0 0 6px">Feedback · ${escapeHtml(label)}</p>` +
      `<h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${escapeHtml(entry.company.name)}</h1>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.8;color:#575550;margin:0 0 18px">` +
      leadRow("Company", `${escapeHtml(entry.company.name)} · ${escapeHtml(entry.company.plan)} plan`) +
      leadRow("Workspace", escapeHtml(entry.company.id)) +
      leadRow("From", `${escapeHtml(entry.person.name)} · ${escapeHtml(entry.person.role)}`) +
      leadRow("Email", `<a href="mailto:${escapeHtml(entry.person.email)}" style="color:#1a73e8">${escapeHtml(entry.person.email)}</a>`) +
      leadRow("Page", escapeHtml(entry.page)) +
      leadRow("Sent", escapeHtml(entry.sentAt)) +
      (files.length ? leadRow(files.length === 1 ? "Attached" : `Attached (${files.length})`, escapeHtml(fileList)) : "") +
      `</table>` +
      `<p style="font-size:14px;line-height:1.6;color:#1c1c1a;margin:0 0 18px;padding:14px 16px;background:#f5f6fa;border-radius:10px;white-space:pre-wrap">${escapeHtml(entry.message)}</p>` +
      `<a href="mailto:${escapeHtml(entry.person.email)}" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">Reply to ${escapeHtml(entry.person.name.trim().split(/\s+/)[0] || "them")} →</a>`
  );
  return { subject, html, text };
}

const FEEDBACK_LABELS: Record<string, string> = {
  idea: "Idea",
  bug: "Something is broken",
  praise: "Praise",
  other: "Other"
};

/* ── account emails: verify address, reset password ─────────────────────── */

function accountEmailShell(title: string, intro: string, buttonLabel: string, link: string, footer: string) {
  const text = `${title}\n\n${intro}\n\n${buttonLabel}: ${link}\n\n${footer}`;
  const html = `
    <div style="font-family:Inter,ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1c1c1a;line-height:1.5">
      <p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a877e">BuildFlow</p>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-.01em">${title}</h1>
      <p style="margin:0 0 22px;font-size:15px;color:#4a4944">${intro}</p>
      <p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#2f6bff;color:#fff;text-decoration:none;font-weight:600">${buttonLabel}</a></p>
      <p style="margin:0 0 6px;font-size:12.5px;color:#8a877e">If the button does not work, paste this into your browser:</p>
      <p style="margin:0 0 22px;font-size:12.5px;word-break:break-all"><a href="${link}" style="color:#2f6bff">${link}</a></p>
      <p style="margin:0;font-size:12.5px;color:#8a877e">${footer}</p>
    </div>`;
  return { html, text };
}

export function verifyEmailMessage(name: string, link: string) {
  return {
    subject: "Confirm your email for BuildFlow",
    ...accountEmailShell(
      `Confirm it's you, ${name.split(" ")[0] || "there"}.`,
      "Tap the button to confirm this is your address. That unlocks inviting your team and managing billing.",
      "Confirm my email",
      link,
      "This link works for 24 hours. If you did not create a BuildFlow account, ignore this email."
    )
  };
}

export function resetPasswordMessage(name: string, link: string) {
  return {
    subject: "Reset your BuildFlow password",
    ...accountEmailShell(
      `Reset your password, ${name.split(" ")[0] || "there"}.`,
      "Someone asked to reset the password for this BuildFlow account. If that was you, set a new one below.",
      "Choose a new password",
      link,
      "This link works for one hour and can be used once. If you did not ask for this, your password is unchanged — you can ignore this email."
    )
  };
}

export function inviteMessage(inviterName: string, orgName: string, role: string, link: string) {
  return {
    subject: `${inviterName} invited you to ${orgName} on BuildFlow`,
    ...accountEmailShell(
      `Join ${orgName} on BuildFlow.`,
      `${inviterName} invited you to their workspace as a ${role}. Set a password and you're in — crews, schedule and field updates included.`,
      "Accept the invite",
      link,
      "This invite works for seven days. If you weren't expecting it, you can ignore this email."
    )
  };
}
