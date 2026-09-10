/**
 * One status per job everywhere: the filters, the drawer, the palette and the Kanban
 * lanes all read the one shared list, and every status has a lane and a tone.
 */
import { JOB_STATUSES } from "@buildflow/shared";
import { describe, expect, it } from "vitest";
import { KANBAN_LANES, kanbanLaneOf } from "./lanes";
import { statusTone } from "./scheduleUtils";
import { STATUSES, STATUS_PALETTE } from "./statusPalette";
import { SCHEDULE_STATUSES } from "./useScheduleContext";

describe("one status list", () => {
  it("is the shared list on the filters, the drawer and the palette", () => {
    expect(SCHEDULE_STATUSES).toEqual([...JOB_STATUSES]);
    expect(STATUSES).toEqual([...JOB_STATUSES]);
    expect(Object.keys(STATUS_PALETTE).sort()).toEqual([...JOB_STATUSES].sort());
  });

  it("gives every status a Kanban lane, and every lane only real statuses", () => {
    for (const status of JOB_STATUSES) expect(kanbanLaneOf(status), status).toBeDefined();
    for (const lane of KANBAN_LANES) for (const status of lane.match) expect(JOB_STATUSES).toContain(status);
  });

  it("gives every status its own tone class", () => {
    expect(new Set(JOB_STATUSES.map(statusTone)).size).toBe(JOB_STATUSES.length);
  });
});
