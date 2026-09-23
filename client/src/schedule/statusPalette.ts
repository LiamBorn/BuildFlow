/**
 * The one status palette and status/priority lists the schedule views share: the
 * Gantt bars, the legend and the job drawer all read from here.
 */
import { JOB_STATUSES, type Job, type Status } from "@buildflow/shared";
import type { GanttStatus } from "../components/ui/gantt";

/* The status palette reads the Colors set (app-shell-client-desk.css §47) through its hint
   tokens, so a status is the same colour everywhere and follows whichever set the workspace
   chose: `color` is the solid bar and the dot, `fill`/`edge` the tone's wash and its edge,
   `ink` the text on that wash. One tone per meaning — ready is the information tone, in
   progress the accent, confirmed / on site / complete the ok tone, delayIQed / at risk the
   bad tone, planned and not started the second ink — and every `color` clears 3:1 as a solid
   bar on the white card in the Default set (ganttDesign.test.ts resolves the tokens and
   measures it). */
const OK = { fill: "var(--bf-color-ok-wash)", edge: "var(--bf-color-ok-edge)", ink: "var(--bf-color-ok)" };
const INFO = { fill: "var(--bf-color-info-wash)", edge: "var(--bf-color-info-edge)", ink: "var(--bf-color-info)" };
const ACCENT = { fill: "var(--bf-color-accent-wash)", edge: "var(--bf-color-accent-fill)", ink: "var(--bf-color-accent)" };
const BAD = { fill: "var(--bf-color-bad-wash)", edge: "var(--bf-color-bad-edge)", ink: "var(--bf-color-bad)" };
const FLAT = { fill: "var(--bf-hover)", edge: "var(--bf-line-solid)", ink: "var(--bf-ink-muted)" };
export const STATUS_PALETTE: Record<Status, GanttStatus> = {
  "Not Started": { id: "Not Started", name: "Not Started", color: "var(--bf-ink-muted)", ...FLAT },
  Planned: { id: "Planned", name: "Planned", color: "var(--bf-ink-muted)", ...FLAT },
  Ready: { id: "Ready", name: "Ready", color: "var(--bf-color-info)", ...INFO },
  "Ready to Start": { id: "Ready to Start", name: "Ready to Start", color: "var(--bf-color-info)", ...INFO },
  Confirmed: { id: "Confirmed", name: "Confirmed", color: "var(--bf-color-ok)", ...OK },
  "In Progress": { id: "In Progress", name: "In Progress", color: "var(--bf-color-accent)", ...ACCENT },
  "On Site": { id: "On Site", name: "On Site", color: "var(--bf-color-ok)", ...OK },
  DelayIQed: { id: "DelayIQed", name: "DelayIQed", color: "var(--bf-color-bad)", ...BAD },
  Complete: { id: "Complete", name: "Complete", color: "var(--bf-color-ok)", ...OK },
  "At Risk": { id: "At Risk", name: "At Risk", color: "var(--bf-color-bad)", ...BAD }
};

/** The statuses in workflow order: the legend's order, and the order of the job panel's list. */
export const STATUSES: Status[] = [...JOB_STATUSES];

/**
 * The statuses a person sets by hand in the job panel (asked for on 2026-09-23 as "Confirmed" and
 * two more): pencilled in, booked, done. The other seven stay in the program — the Kanban's lanes,
 * the Add-job picker and imports still set them — and a job already in one of them keeps it: the
 * panel lists the job's own status with these three, so opening a job and saving it never changes
 * its status by accident.
 */
export const PANEL_STATUSES: Status[] = ["Planned", "Confirmed", "Complete"];

/** The job panel's Status list for a job now at `current`, in workflow order. */
export const panelStatuses = (current: Status): Status[] =>
  STATUSES.filter((status) => status === current || PANEL_STATUSES.includes(status));

/** Most pressing first: the order every priority list shows. */
export const PRIORITIES: Job["priority"][] = ["High", "Medium", "Normal"];

/**
 * What each priority is called on screen (asked for on 2026-09-23: Mandatory, Medium, Low). The
 * stored values are older than the names and stay as they are, so no saved job, import or API
 * caller has to change: High is shown as Mandatory and Normal as Low.
 */
export const PRIORITY_LABEL: Record<Job["priority"], string> = { High: "Mandatory", Medium: "Medium", Normal: "Low" };
