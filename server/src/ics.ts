/**
 * A crew's bookings as an iCalendar feed a phone can subscribe to. Events carry
 * the job's clock times as floating local times (the crew's day, wherever the
 * site is); a job with no readable times becomes an all-day event.
 */
import type { Crew, Job, Project, ScheduleAssignment } from "@buildflow/shared";

const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (m) => `\\${m}`);
const fold = (line: string) => {
  // RFC 5545: lines longer than 75 octets continue on the next line after a space
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
};
const clock = (text: string | undefined) => {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(text ?? "");
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return { hours, minutes };
};
const stamp = (iso: string, time: { hours: number; minutes: number }) =>
  `${iso.replace(/-/g, "")}T${String(time.hours).padStart(2, "0")}${String(time.minutes).padStart(2, "0")}00`;
const nextDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
};

export function buildCrewCalendar(input: {
  crew: Crew;
  assignments: ScheduleAssignment[];
  jobs: Job[];
  projects: Project[];
  /** The calendar's name in the phone's list. */
  name: string;
  now?: Date;
}): string {
  const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const dtstamp = (input.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BuildFlow//Crew schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H"
  ];
  for (const assignment of input.assignments.filter((item) => item.crewId === input.crew.id)) {
    const job = jobsById.get(assignment.jobId);
    if (!job) continue;
    const day = assignment.date.slice(0, 10);
    const start = clock(job.startTime);
    const end = clock(job.endTime);
    const project = projectsById.get(job.projectId)?.name;
    const description = [
      project,
      job.phase,
      `Status: ${job.status}`,
      assignment.conflicts.length ? `Conflicts: ${assignment.conflicts.join(", ")}` : "",
      job.notes
    ]
      .filter(Boolean)
      .join("\n");
    lines.push("BEGIN:VEVENT", `UID:${assignment.id}@buildflow`, `DTSTAMP:${dtstamp}`);
    if (start && end) {
      lines.push(
        `DTSTART:${stamp(day, start)}`,
        `DTEND:${stamp(day, end.hours * 60 + end.minutes > start.hours * 60 + start.minutes ? end : { hours: 23, minutes: 59 })}`
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay(day)}`);
    }
    lines.push(`SUMMARY:${escapeText(job.name)}`);
    if (job.location) lines.push(`LOCATION:${escapeText(job.location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
