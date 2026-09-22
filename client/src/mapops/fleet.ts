/**
 * Where every machine is, and where it goes next (2026-09-22).
 *
 * WHAT THE DATA KNOWS. A machine has no GPS in this program. What it has is a site — the
 * project it is assigned to, which has coordinates — and the jobs ask for machines by kind
 * (`job.requiredEquipment`: "Boom Lift", "Concrete Pump"). So "where it is" is its site, and
 * "where it is going" is the next job somewhere else that needs a machine like it and has no
 * such machine of its own. Both are read off records the schedule already keeps; nothing here
 * is invented, and a machine with no site says so ("at the yard") rather than being placed.
 *
 * WHAT "MOVING" MEANS HERE. Without a position feed, a machine is moving when the next job that
 * needs it elsewhere has started — or starts today — and nothing keeps it where it is. Its pin
 * stays on the site it left from; the route and the ETA show where it is going. That is the
 * honest reading of a schedule: what should be on the road, not a dot pretending to be it.
 *
 * DRIVE TIME is straight-line distance with a road factor at a working speed, labelled an
 * estimate. The page replaces it with the live road route when a machine is selected.
 */
import type { BootstrapPayload, Equipment, Job, Project } from "@buildflow/shared";
import { haversineMiles } from "./geo";

export type FleetState = "on-site" | "moving" | "down" | "yard";
export type MoveRisk = "on-time" | "tight" | "late";

export type Move = {
  /** Where it is going. */
  to: Project;
  /** The job that needs it there. */
  job: Job;
  neededBy: Date;
  distanceMiles: number;
  /** An estimate until the live route replaces it. */
  etaMinutes: number;
  /** Minutes between arriving (if it left now) and being needed; negative is late. */
  slackMinutes: number;
  risk: MoveRisk;
};

export type Machine = {
  equipment: Equipment;
  /** The site it is on — the project it is assigned to. Null at the yard. */
  site: Project | null;
  state: FleetState;
  /** The job keeping it where it is, if one does. */
  job: Job | null;
  move: Move | null;
  /** One sentence on why it needs a look, or null when nothing does. */
  attention: string | null;
};

/** A job asking for a kind of machine the fleet does not have. */
export type Gap = { job: Job; project: Project; needed: string; neededBy: Date };

export type Fleet = { machines: Machine[]; gaps: Gap[] };

/** Roads are longer than the line between two points; a machine on a trailer is not fast. */
const ROAD_FACTOR = 1.25;
const TOW_SPEED_MPH = 35;
const LOAD_MINUTES = 20;
/** Less than two hours of slack is a move worth watching. */
const TIGHT_MINUTES = 120;

/** "7:00 AM" on a YYYY-MM-DD, in local time — the start the schedule shows. */
export function jobStart(job: Job): Date {
  const [year, month, day] = job.startDate.split("-").map(Number);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(job.startTime.trim());
  let hours = 7;
  let minutes = 0;
  if (match) {
    hours = Number(match[1]) % 12;
    minutes = Number(match[2]);
    if (match[3] && match[3].toUpperCase() === "PM") hours += 12;
  }
  return new Date(year, (month || 1) - 1, day || 1, hours, minutes);
}

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/#\s*\d+\w*$/, "")
    .replace(/\b\d+\w*\b/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);

/**
 * Does this machine answer a job's ask? The ask is a kind ("Boom Lift"); the machine has a type
 * ("Lift") and a name ("Boom Lift #4"). It matches when the ask IS the type, or the name says
 * the ask ("Boom Lift #4" for "Boom Lift", "Excavator 320" for "Excavator"), or the ask names
 * the type and nothing the name contradicts ("Concrete Pump" for a "Pump #3"). A bare number in either is not a
 * word — the "320" in "Excavator 320" is a model, not a kind.
 */
export function matchesEquipment(required: string, equipment: Equipment): boolean {
  const ask = words(required);
  if (ask.length === 0) return false;
  const type = words(equipment.type);
  const name = words(equipment.name);
  const asks = ask.join(" ");
  if (type.join(" ") === asks) return true;
  if (name.join(" ") === asks) return true;
  if (name.length >= ask.length && name.slice(0, ask.length).join(" ") === asks) return true;
  if (type.length === 0 || !type.every((word) => ask.includes(word))) return false;
  // the ask is the type plus qualifiers: the name must carry them, or carry none of its own —
  // "Concrete Pump" is answered by "Pump #3" but not by "Trash Pump #1", and a "Scissor Lift"
  // job is not answered by a "Boom Lift" however much they share a type
  const qualifiers = ask.filter((word) => !type.includes(word));
  const named = name.filter((word) => !type.includes(word));
  return qualifiers.every((word) => name.includes(word)) || named.length === 0;
}

const covers = (job: Job, day: string) => job.startDate <= day && day <= job.endDate;
const byStart = (a: Job, b: Job) => jobStart(a).getTime() - jobStart(b).getTime();

export function estimateDrive(from: Project, to: Project): { distanceMiles: number; etaMinutes: number } {
  const distanceMiles = haversineMiles(from, to) * ROAD_FACTOR;
  return { distanceMiles, etaMinutes: Math.round(LOAD_MINUTES + (distanceMiles / TOW_SPEED_MPH) * 60) };
}

export function riskOf(slackMinutes: number): MoveRisk {
  if (slackMinutes < 0) return "late";
  if (slackMinutes < TIGHT_MINUTES) return "tight";
  return "on-time";
}

/** "in 2h 10m", "2h 10m ago", "in 3 days" — how far off a moment is, for a card. */
export function describeLead(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
  const ago = minutes < 0;
  const abs = Math.abs(minutes);
  const text =
    abs < 60 ? `${abs}m` : abs < 60 * 24 ? `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}` : `${Math.round(abs / (60 * 24))} days`;
  return ago ? `${text} ago` : `in ${text}`;
}

/**
 * The fleet, read off the records: every machine placed at its site with the job that keeps it
 * there and the next job elsewhere that needs it, plus the jobs no machine can answer.
 */
export function buildFleet(data: Pick<BootstrapPayload, "equipment" | "projects" | "jobs">, now: Date): Fleet {
  const today = localDay(now);
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const open = data.jobs.filter((job) => job.status !== "Complete" && job.endDate >= today).sort(byStart);

  /** Which machines already answer a job where it is: a job at a site with such a machine assigned there is covered. */
  const coveredAt = (job: Job) => data.equipment.some((item) => item.assignedTo === job.projectId && matchesEquipment(job.requiredEquipment, item));

  const machines: Machine[] = data.equipment.map((equipment) => {
    const site = equipment.assignedTo ? (projects.get(equipment.assignedTo) ?? null) : null;
    const asksFor = (job: Job) => matchesEquipment(job.requiredEquipment, equipment);
    const here = site ? open.filter((job) => job.projectId === site.id && asksFor(job)) : [];
    const job = here.find((item) => covers(item, today)) ?? here[0] ?? null;
    const elsewhere = open.filter((item) => site === null || item.projectId !== site.id).filter(asksFor).filter((item) => !coveredAt(item));
    const next = elsewhere[0] ?? null;

    let move: Move | null = null;
    if (next && site) {
      const to = projects.get(next.projectId);
      if (to) {
        const { distanceMiles, etaMinutes } = estimateDrive(site, to);
        const neededBy = jobStart(next);
        // it can only leave once whatever keeps it here is done
        const freeAt = job && jobStart(job) <= neededBy ? new Date(Math.max(now.getTime(), new Date(`${job.endDate}T23:59:59`).getTime())) : now;
        const leavesAt = job && covers(job, today) && job.endDate > today ? freeAt : now;
        const slackMinutes = Math.round((neededBy.getTime() - leavesAt.getTime()) / 60000) - etaMinutes;
        move = { to, job: next, neededBy, distanceMiles, etaMinutes, slackMinutes, risk: riskOf(slackMinutes) };
      }
    }

    let state: FleetState;
    if (equipment.status === "Maintenance") state = "down";
    else if (!site) state = "yard";
    else if (move && (!job || !covers(job, today) || job.endDate <= today) && move.neededBy.getTime() - now.getTime() <= 24 * 60 * 60000) state = "moving";
    else state = "on-site";

    let attention: string | null = null;
    if (state === "down") {
      const waiting = next ?? here[0] ?? null;
      if (waiting) {
        const at = projects.get(waiting.projectId);
        attention = `Down for maintenance while ${waiting.phase} at ${at?.name ?? "a site"} needs ${aKind(equipment)} ${describeLead(now, jobStart(waiting))}.`;
      }
    } else if (state === "yard" && next) {
      const at = projects.get(next.projectId);
      attention = `At the yard with ${at?.name ?? "a site"} needing ${aKind(equipment)} ${describeLead(now, jobStart(next))}. Assign it to a site to put it on the map.`;
    } else if (move && move.risk === "late") {
      attention = `Needed at ${move.to.name} ${describeLead(now, move.neededBy)} and still at ${site?.name}${job ? ` on ${job.phase}` : ""}.`;
    } else if (move && move.risk === "tight") {
      attention = `${move.to.name} needs it ${describeLead(now, move.neededBy)}; the drive from ${site?.name} leaves ${move.slackMinutes} min to spare.`;
    }

    return { equipment, site, state, job, move, attention };
  });

  const gaps: Gap[] = open
    .filter((job) => job.requiredEquipment.trim() && !data.equipment.some((item) => matchesEquipment(job.requiredEquipment, item)))
    .flatMap((job) => {
      const project = projects.get(job.projectId);
      return project ? [{ job, project, needed: job.requiredEquipment, neededBy: jobStart(job) }] : [];
    });

  return { machines, gaps };
}

/** "an excavator", "a boom lift" — the machine's kind, said in a sentence. */
export function aKind(equipment: Equipment): string {
  const kind = equipment.type.trim().toLowerCase() || "machine";
  return `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`;
}

export const FLEET_STATE_LABEL: Record<FleetState, string> = {
  "on-site": "On site",
  moving: "Moving",
  down: "Down",
  yard: "At the yard"
};

/** The machines that need a look first: late moves, then tight ones, then down and yard machines with work waiting. */
export function attentionOrder(fleet: Fleet): Machine[] {
  const rank = (machine: Machine) =>
    machine.move?.risk === "late" ? 0 : machine.move?.risk === "tight" ? 1 : machine.state === "down" ? 2 : machine.state === "yard" ? 3 : 4;
  return fleet.machines.filter((machine) => machine.attention).sort((a, b) => rank(a) - rank(b));
}
