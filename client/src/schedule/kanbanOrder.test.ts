/**
 * A lane's own order on the Kanban: which jobs it shows in which order, and what a drop does to
 * that order. The board and the save are elsewhere (parts/kanban.tsx, pages/KanbanPage.tsx); these
 * are the rules, so they can be asked without a board.
 */
import { describe, expect, it } from "vitest";
import type { Job } from "@buildflow/shared";
import {
  MAX_LANE_ORDER,
  insertInLane,
  moveInLane,
  orderLaneJobs,
  parseKanbanOrder,
  placeInLane,
  serializeKanbanOrder
} from "./kanbanOrder";

const job = (id: string) => ({ id }) as Job;
const ids = (jobs: Job[]) => jobs.map((one) => one.id);

describe("a lane's order", () => {
  it("shows the cards the planner placed first, then the rest as the board had them", () => {
    const lane = [job("a"), job("b"), job("c"), job("d")];
    expect(ids(orderLaneJobs(lane, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
    // an order naming a job that has left the lane, or nothing at all, changes nothing
    expect(ids(orderLaneJobs(lane, ["gone", "b"]))).toEqual(["b", "a", "c", "d"]);
    expect(ids(orderLaneJobs(lane, []))).toEqual(["a", "b", "c", "d"]);
    expect(ids(orderLaneJobs(lane, undefined))).toEqual(["a", "b", "c", "d"]);
  });

  it("puts a card where it was dropped inside its own lane, either way up the list", () => {
    const lane = ["a", "b", "c", "d"];
    // carried DOWN onto c: it takes c's place and c closes up behind it
    expect(moveInLane(lane, "a", "c")).toEqual(["b", "c", "a", "d"]);
    // carried UP onto b: it takes b's place and b moves down
    expect(moveInLane(lane, "d", "b")).toEqual(["a", "d", "b", "c"]);
    // the lane's own space, below the cards, is the end of the lane
    expect(moveInLane(lane, "b", null)).toEqual(["a", "c", "d", "b"]);
    // dropped back on itself, or a card the lane does not hold: nothing moves
    expect(moveInLane(lane, "b", "b")).toEqual(lane);
    expect(moveInLane(lane, "b", "nope")).toEqual(lane);
    expect(moveInLane(lane, "nope", "a")).toEqual(lane);
  });

  it("lands a card from another lane where it was dropped, before the card under it", () => {
    const lane = ["a", "b", "c"];
    expect(insertInLane(lane, "x", "b")).toEqual(["a", "x", "b", "c"]);
    expect(insertInLane(lane, "x", "a")).toEqual(["x", "a", "b", "c"]);
    // the lane's space, an empty lane, or a card it does not hold: the end
    expect(insertInLane(lane, "x", null)).toEqual(["a", "b", "c", "x"]);
    expect(insertInLane([], "x", null)).toEqual(["x"]);
    expect(insertInLane(lane, "x", "nope")).toEqual(["a", "b", "c", "x"]);
    // and a card already in the lane is moved, not doubled
    expect(insertInLane(lane, "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("draws a card held over another lane among its cards, at the place it would land", () => {
    const lane = [job("a"), job("b"), job("c")];
    const carried = job("x");
    // the carried job is not one of the lane's own, so it comes in whole
    expect(ids(placeInLane(lane, carried, "b"))).toEqual(["a", "x", "b", "c"]);
    expect(ids(placeInLane(lane, carried, "a"))).toEqual(["x", "a", "b", "c"]);
    // over the lane's own space, or an empty lane: the end of it
    expect(ids(placeInLane(lane, carried, null))).toEqual(["a", "b", "c", "x"]);
    expect(ids(placeInLane([], carried, null))).toEqual(["x"]);
  });

  it("reads a stored arrangement leniently and writes one the setting can hold", () => {
    expect(parseKanbanOrder('{"ready":["a","b"],"done":["c"]}')).toEqual({ ready: ["a", "b"], done: ["c"] });
    // anything broken is dropped, never the whole arrangement
    expect(parseKanbanOrder('{"ready":["a",7,null,"b"],"bad":"nope","empty":[]}')).toEqual({ ready: ["a", "b"] });
    expect(parseKanbanOrder("not json")).toEqual({});
    expect(parseKanbanOrder("[1,2]")).toEqual({});
    expect(parseKanbanOrder(null)).toEqual({});
    // the server's setting holds 8,000 characters, so a lane is capped either way through
    const long = Array.from({ length: MAX_LANE_ORDER + 10 }, (_, index) => `job-${index}`);
    expect(parseKanbanOrder(JSON.stringify({ ready: long })).ready).toHaveLength(MAX_LANE_ORDER);
    expect(JSON.parse(serializeKanbanOrder({ ready: long, empty: [] }))).toEqual({ ready: long.slice(0, MAX_LANE_ORDER) });
  });
});
