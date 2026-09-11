/**
 * The weekly digest: "what changed this week" — moved jobs, new crew conflicts,
 * slipped milestones — as the difference between two Monday snapshots of the
 * plan. The snapshot is taken once per week (the first time anything asks) and
 * kept as it was, so Monday's email always compares Monday with Monday.
 */
import type { WeeklyDigest, WeeklyDigestConflict } from "@buildflow/shared";
import { localIsoDate } from "@buildflow/shared";
import type { BuildFlowStore } from "../database.js";
import { sendOpsNotice, type OpsNotice, type OpsRecipients } from "../notify.js";
import type { StoreManager } from "../stores.js";

export type PlanJob = { id: string; name: string; projectId: string; project: string; startDate: string; endDate: string; status: string };
export type PlanBooking = { id: string; jobId: string; crewId: string; crewName: string; date: string };
export type PlanMilestone = { id: string; title: string; project: string; date: string };
/** The plan as it stood on a Monday: every job's dates, every booking, every milestone. */
export type PlanSnapshot = { weekOf: string; capturedAt: string; jobs: PlanJob[]; bookings: PlanBooking[]; milestones: PlanMilestone[] };

export function shiftDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before `iso` — the key a week's snapshot is filed under. */
export function mondayOf(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const weekday = date.getUTCDay();
  return shiftDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

/** Today where the workspace is. The UTC day picks the wrong Monday for part of every day. */
export const todayIso = () => localIsoDate();

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

/** The plan right now, filed under `weekOf`. */
export function takePlanSnapshot(store: BuildFlowStore, weekOf: string): PlanSnapshot {
  const projects = store.projects();
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "Project";
  const crews = store.crews();
  const crewName = (id: string) => crews.find((crew) => crew.id === id)?.name ?? "Crew";
  return {
    weekOf,
    capturedAt: new Date().toISOString(),
    jobs: store.jobs().map((job) => ({
      id: job.id,
      name: job.name,
      projectId: job.projectId,
      project: projectName(job.projectId),
      startDate: job.startDate,
      endDate: job.endDate,
      status: job.status
    })),
    bookings: store.assignments().map((booking) => ({
      id: booking.id,
      jobId: booking.jobId,
      crewId: booking.crewId,
      crewName: crewName(booking.crewId),
      date: booking.date.slice(0, 10)
    })),
    milestones: [
      ...store
        .phases()
        .filter((phase) => phase.endDate)
        .map((phase) => ({
          id: `phase-${phase.id}`,
          title: `${phase.name} complete`,
          project: projectName(phase.projectId),
          date: phase.endDate
        })),
      ...projects
        .filter((project) => project.targetCompletion)
        .map((project) => ({
          id: `project-${project.id}`,
          title: "Target completion",
          project: project.name,
          date: project.targetCompletion
        }))
    ]
  };
}

/** A crew booked on two jobs the same day. */
export function conflictsOf(snapshot: PlanSnapshot): WeeklyDigestConflict[] {
  const jobName = new Map(snapshot.jobs.map((job) => [job.id, job.name]));
  const byCrewDay = new Map<string, WeeklyDigestConflict & { jobIds: Set<string> }>();
  for (const booking of snapshot.bookings) {
    const key = `${booking.crewId}|${booking.date}`;
    const entry = byCrewDay.get(key) ?? {
      crewId: booking.crewId,
      crewName: booking.crewName,
      date: booking.date,
      jobs: [],
      jobIds: new Set<string>()
    };
    if (!entry.jobIds.has(booking.jobId)) {
      entry.jobIds.add(booking.jobId);
      entry.jobs.push(jobName.get(booking.jobId) ?? booking.jobId);
    }
    byCrewDay.set(key, entry);
  }
  return [...byCrewDay.values()]
    .filter((entry) => entry.jobIds.size > 1)
    .sort((a, b) => a.date.localeCompare(b.date) || a.crewName.localeCompare(b.crewName))
    .map(({ crewId, crewName, date, jobs }) => ({ crewId, crewName, date, jobs }));
}

/** Everything that changed between two snapshots. With no earlier snapshot there is nothing to compare, only totals. */
export function diffPlanSnapshots(before: PlanSnapshot | null, after: PlanSnapshot): WeeklyDigest {
  const beforeJobs = new Map((before?.jobs ?? []).map((job) => [job.id, job]));
  const movedJobs = after.jobs
    .flatMap((job) => {
      const was = beforeJobs.get(job.id);
      if (!was || (was.startDate === job.startDate && was.endDate === job.endDate)) return [];
      return [
        {
          id: job.id,
          name: job.name,
          project: job.project,
          from: { startDate: was.startDate, endDate: was.endDate },
          to: { startDate: job.startDate, endDate: job.endDate },
          days: daysBetween(was.startDate, job.startDate)
        }
      ];
    })
    .sort((a, b) => a.to.startDate.localeCompare(b.to.startDate));
  const newJobs = before
    ? after.jobs
        .filter((job) => !beforeJobs.has(job.id))
        .map((job) => ({ id: job.id, name: job.name, project: job.project, startDate: job.startDate }))
    : [];
  const key = (conflict: WeeklyDigestConflict) => `${conflict.crewId}|${conflict.date}`;
  const afterConflicts = conflictsOf(after);
  const beforeConflicts = before ? conflictsOf(before) : [];
  const beforeKeys = new Set(beforeConflicts.map(key));
  const afterKeys = new Set(afterConflicts.map(key));
  const beforeMilestones = new Map((before?.milestones ?? []).map((milestone) => [milestone.id, milestone]));
  const slippedMilestones = after.milestones
    .flatMap((milestone) => {
      const was = beforeMilestones.get(milestone.id);
      if (!was || milestone.date <= was.date) return [];
      return [
        {
          id: milestone.id,
          title: milestone.title,
          project: milestone.project,
          from: was.date,
          to: milestone.date,
          days: daysBetween(was.date, milestone.date)
        }
      ];
    })
    .sort((a, b) => b.days - a.days);
  return {
    weekOf: after.weekOf,
    previousWeekOf: before?.weekOf ?? null,
    capturedAt: after.capturedAt,
    movedJobs,
    newJobs,
    newConflicts: before ? afterConflicts.filter((conflict) => !beforeKeys.has(key(conflict))) : [],
    clearedConflicts: beforeConflicts.filter((conflict) => !afterKeys.has(key(conflict))).length,
    slippedMilestones,
    totals: { jobs: after.jobs.length, bookings: after.bookings.length, conflicts: afterConflicts.length }
  };
}

/** This week's digest: takes this Monday's snapshot if nobody has yet, and compares it with the newest earlier one. */
export function weeklyDigestFor(store: BuildFlowStore, today = todayIso()): WeeklyDigest {
  const weekOf = mondayOf(today);
  // the store keeps snapshots as JSON; this module is the one that shapes them
  const current = (store.planSnapshot(weekOf) as PlanSnapshot | null) ?? store.recordPlanSnapshot(takePlanSnapshot(store, weekOf));
  return diffPlanSnapshots(store.previousPlanSnapshot(weekOf) as PlanSnapshot | null, current);
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const later = (days: number) =>
  days === 0 ? "same start" : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ${days > 0 ? "later" : "earlier"}`;

/** The Week board on a week, as a link into the app. */
export const weekLink = (appUrl: string, weekOf: string) => `${appUrl.replace(/\/?$/, "/")}#schedule/week?w=${weekOf}`;

/** The email: a line per change, in the order a planner reads them; with `appUrl`, a link to the week. */
export function digestNotice(digest: WeeklyDigest, orgName: string, appUrl?: string): OpsNotice {
  const changes = digest.movedJobs.length + digest.newConflicts.length + digest.slippedMilestones.length + digest.newJobs.length;
  const lines: string[] = [];
  if (!digest.previousWeekOf) {
    lines.push(`First snapshot, taken ${day(digest.weekOf)} — next Monday's digest will compare the plan against it.`);
  } else if (changes === 0 && digest.clearedConflicts === 0) {
    lines.push(`Nothing moved since the snapshot of ${day(digest.previousWeekOf)}.`);
  } else {
    lines.push(`Compared with the plan on ${day(digest.previousWeekOf)}:`);
  }
  if (digest.movedJobs.length > 0) {
    lines.push(`${plural(digest.movedJobs.length, "job")} moved:`);
    for (const move of digest.movedJobs)
      lines.push(`  • ${move.name} (${move.project}) — ${later(move.days)}, now ${day(move.to.startDate)} to ${day(move.to.endDate)}`);
  }
  if (digest.newConflicts.length > 0) {
    lines.push(`${plural(digest.newConflicts.length, "new crew conflict")}:`);
    for (const conflict of digest.newConflicts)
      lines.push(`  • ${conflict.crewName} on ${day(conflict.date)} — ${conflict.jobs.join(" and ")}`);
  }
  if (digest.clearedConflicts > 0) lines.push(`${plural(digest.clearedConflicts, "conflict")} cleared.`);
  if (digest.slippedMilestones.length > 0) {
    lines.push(`${plural(digest.slippedMilestones.length, "milestone")} slipped:`);
    for (const milestone of digest.slippedMilestones)
      lines.push(
        `  • ${milestone.title} (${milestone.project}) — ${day(milestone.from)} → ${day(milestone.to)} (+${plural(milestone.days, "day")})`
      );
  }
  if (digest.newJobs.length > 0) {
    lines.push(`${plural(digest.newJobs.length, "new job")}:`);
    for (const job of digest.newJobs) lines.push(`  • ${job.name} (${job.project}) starting ${day(job.startDate)}`);
  }
  lines.push(
    `The plan now: ${plural(digest.totals.jobs, "job")}, ${plural(digest.totals.bookings, "booking")}, ${plural(digest.totals.conflicts, "crew conflict")}.`
  );
  if (appUrl) lines.push(`Open the week: ${weekLink(appUrl, digest.weekOf)}`);
  const headline =
    changes === 0
      ? `No schedule changes this week at ${orgName}`
      : `${plural(digest.movedJobs.length, "job")} moved, ${plural(digest.newConflicts.length, "new conflict")}, ${plural(digest.slippedMilestones.length, "milestone")} slipped`;
  return {
    kind: "digest",
    subject: `What changed this week — ${orgName}, week of ${day(digest.weekOf)}`,
    heading: headline,
    lines,
    sms: `BuildFlow week of ${day(digest.weekOf)}: ${headline}.`
  };
}

/** The org's sign-in accounts — the planners — plus OPS_NOTIFY_EMAIL / OPS_NOTIFY_SMS, as every ops notice uses. */
export function digestRecipients(mainStore: BuildFlowStore, orgId: string): OpsRecipients {
  const emails = mainStore.all<{ email: string }>("SELECT email FROM accounts WHERE orgId = ?", [orgId]).map((row) => row.email);
  const extra = process.env.OPS_NOTIFY_EMAIL?.trim();
  if (extra) emails.push(extra);
  const phones = (process.env.OPS_NOTIFY_SMS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { emails: [...new Set(emails)], phones };
}

export const DIGEST_SENT_KEY = "digest:lastSentWeek";

/** Emails this week's digest to the org and remembers the week, so the scheduler sends it once. */
export async function sendWeeklyDigest(
  store: BuildFlowStore,
  mainStore: BuildFlowStore,
  org: { id: string; name: string },
  today = todayIso(),
  appUrl?: string
) {
  const digest = weeklyDigestFor(store, today);
  const recipients = digestRecipients(mainStore, org.id);
  await sendOpsNotice(digestNotice(digest, org.name, appUrl), recipients);
  store.setWorkspaceSetting(DIGEST_SENT_KEY, digest.weekOf);
  return { digest, recipients: recipients.emails.length };
}

/**
 * Monday's email, once per org per week: runs on the digest weekday from the
 * digest hour on (DIGEST_WEEKDAY, 1 = Monday; DIGEST_HOUR, default 7, local
 * time) and skips orgs already sent this week. WEEKLY_DIGEST=off turns it off.
 */
export async function runWeeklyDigests(manager: StoreManager, now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  if ((env.WEEKLY_DIGEST ?? "on").toLowerCase() === "off") return [];
  const weekday = Number(env.DIGEST_WEEKDAY ?? 1);
  const hour = Number(env.DIGEST_HOUR ?? 7);
  if (now.getDay() !== weekday || now.getHours() < hour) return [];
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekOf = mondayOf(today);
  const appUrl = env.BUILDFLOW_CLIENT_URL ?? "http://localhost:5175/";
  const sent: string[] = [];
  for (const org of manager.main.all<{ id: string; name: string }>("SELECT id, name FROM orgs")) {
    const store = await manager.getOrgStore(org.id);
    if (store.workspaceSetting(DIGEST_SENT_KEY) === weekOf) continue;
    await sendWeeklyDigest(store, manager.main, org, today, appUrl);
    sent.push(org.id);
  }
  return sent;
}

/** Checks every half hour whether Monday's digests are due; never keeps the process alive. */
export function startWeeklyDigestScheduler(manager: StoreManager, intervalMs = 30 * 60_000) {
  const tick = () =>
    runWeeklyDigests(manager)
      .then((sent) => {
        if (sent.length > 0) console.log(`📬 Weekly digest sent for ${plural(sent.length, "org")}.`);
      })
      .catch((error: unknown) => console.error("📬 Weekly digest failed:", error instanceof Error ? error.message : error));
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return timer;
}
