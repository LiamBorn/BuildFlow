/**
 * The Kanban's five lanes and which statuses sit in each — one source for the
 * board, its drop handler and the tests.
 */
import type { Status } from "@buildflow/shared";

export type KanbanLane = { key: string; label: string; status: Status; match: Status[]; tone: string };

export const KANBAN_LANES: KanbanLane[] = [
  { key: "planned", label: "Planned", status: "Planned", match: ["Not Started", "Planned"], tone: "slate" },
  { key: "ready", label: "Ready", status: "Ready", match: ["Ready", "Ready to Start", "Confirmed"], tone: "blue" },
  { key: "progress", label: "In Progress", status: "In Progress", match: ["In Progress", "On Site"], tone: "violet" },
  { key: "blocked", label: "Blocked", status: "DelayIQed", match: ["DelayIQed", "At Risk"], tone: "red" },
  { key: "done", label: "Complete", status: "Complete", match: ["Complete"], tone: "green" }
];

/** The lane a job with this status sits in. */
export function kanbanLaneOf(status: Status): KanbanLane | undefined {
  return KANBAN_LANES.find((lane) => lane.match.includes(status));
}

/**
 * The status a drop on a lane gives the job — the lane's own — or null when the
 * job already sits in that lane (dropped back where it came from) or the target is not a lane.
 */
export function kanbanMove(sourceStatus: Status | undefined, targetStatus: Status | undefined): Status | null {
  const lane = targetStatus ? KANBAN_LANES.find((candidate) => candidate.status === targetStatus) : undefined;
  if (!lane || (sourceStatus && lane.match.includes(sourceStatus))) return null;
  return lane.status;
}
