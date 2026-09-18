/**
 * A LANE'S OWN ORDER on the Kanban (2026-09-17).
 *
 * Asked for: "when moving a job within the Kanban, make it able to overlap and move other jobs —
 * drag one between two jobs and it goes there." A lane was a drop target and nothing more: a card
 * dropped anywhere in it took the lane's status and then sat wherever the board's own sort put it.
 * Now each lane is a list a planner arranges, and the arrangement is theirs: kept as the person's
 * `schedule:kanban-order` setting, so it follows them to another device rather than living in one
 * browser.
 *
 * The RULES are no longer here. Asked for on the other Schedule boards a day later, they moved to
 * ../boardOrder, which the Week, Month and List pages arrange their own sections with; this file
 * is the Kanban's name for them, its setting key, and the one thing that is its own — a lane's
 * items are jobs, so `idOf` is a job's id.
 */
import type { Job } from "@buildflow/shared";
import {
  MAX_GROUP_ORDER,
  insertInGroup,
  moveInGroup,
  orderGroupItems,
  parseBoardOrder,
  placeInGroup,
  serializeBoardOrder,
  type BoardHover,
  type BoardOrder
} from "./boardOrder";

export const KANBAN_ORDER_KEY = "schedule:kanban-order";

export type KanbanOrder = BoardOrder;

export const MAX_LANE_ORDER = MAX_GROUP_ORDER;
export const parseKanbanOrder = parseBoardOrder;
export const serializeKanbanOrder = serializeBoardOrder;
export const moveInLane = moveInGroup;
export const insertInLane = insertInGroup;

const jobId = (job: Job) => job.id;

/** A lane's jobs in the order it shows them. */
export function orderLaneJobs(jobs: Job[], ids: string[] | undefined): Job[] {
  return orderGroupItems(jobs, ids, jobId);
}

/** A lane's jobs with the carried one among them, at the place it would land. */
export function placeInLane(jobs: Job[], carried: Job, overId: string | null): Job[] {
  return placeInGroup(jobs, carried, overId, jobId);
}

export type { BoardHover };
