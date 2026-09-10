/**
 * The one status palette and status/priority lists the schedule views share: the
 * Gantt bars, the legend and the job drawer all read from here.
 */
import { JOB_STATUSES, type Job, type Status } from "@buildflow/shared";
import type { GanttStatus } from "../components/ui/gantt";

/* The status palette the rest of the program already uses: the dot is the
   status badge's ink, the bar is the Schedule board card's fill and edge. */
export const STATUS_PALETTE: Record<Status, GanttStatus> = {
  "Not Started": { id: "Not Started", name: "Not Started", color: "#8a92a6", fill: "#f6f7fe", edge: "#d8e2ee", ink: "#575550" },
  Planned: { id: "Planned", name: "Planned", color: "#0032af", fill: "#f6f7fe", edge: "#d8e2ee", ink: "#0032af" },
  Ready: { id: "Ready", name: "Ready", color: "#138a42", fill: "#edf2ff", edge: "#5f8af8", ink: "#0032af" },
  "Ready to Start": { id: "Ready to Start", name: "Ready to Start", color: "#0032af", fill: "#edf2ff", edge: "#5f8af8", ink: "#0032af" },
  Confirmed: { id: "Confirmed", name: "Confirmed", color: "#138a42", fill: "#ecfbf3", edge: "#9eecc4", ink: "#138a42" },
  "In Progress": { id: "In Progress", name: "In Progress", color: "#1f52e0", fill: "#eef0fd", edge: "#9ec3ff", ink: "#1f52e0" },
  "On Site": { id: "On Site", name: "On Site", color: "#138a42", fill: "#ecfbf3", edge: "#9eecc4", ink: "#138a42" },
  DelayIQed: { id: "DelayIQed", name: "DelayIQed", color: "#c62828", fill: "#fff2f2", edge: "#ffb6b6", ink: "#c62828" },
  Complete: { id: "Complete", name: "Complete", color: "#138a42", fill: "#ecfbf3", edge: "#9eecc4", ink: "#138a42" },
  "At Risk": { id: "At Risk", name: "At Risk", color: "#c62828", fill: "#fff2f2", edge: "#ffb6b6", ink: "#c62828" }
};

/** The statuses in workflow order: the drawer's list and the legend's order. */
export const STATUSES: Status[] = [...JOB_STATUSES];
export const PRIORITIES: Job["priority"][] = ["High", "Medium", "Normal"];
