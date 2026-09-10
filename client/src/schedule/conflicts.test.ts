import { describe, expect, it } from "vitest";
import type { CrewClash } from "@buildflow/shared";
import { ApiError } from "../api";
import { clashSentence, clashesOf, withConflictAsk } from "./conflicts";

const clash: CrewClash = {
  crewId: "c-1",
  crewName: "Concrete Crew 1",
  date: "2026-09-09",
  jobId: "j-1",
  jobName: "Riverside",
  movingJobId: "j-2",
  movingJobName: "Pinecrest"
};
const conflict = () => new ApiError("Concrete Crew 1 is on Riverside that day", 409, undefined, "conflict", { clashes: [clash] });

describe("book anyway?", () => {
  it("reads the clashes off a 409 and nothing else", () => {
    expect(clashesOf(conflict())).toEqual([clash]);
    expect(clashesOf(new ApiError("Not found", 404))).toBeNull();
    expect(clashesOf(new Error("offline"))).toBeNull();
    expect(clashSentence([clash])).toBe("Concrete Crew 1 is on Riverside that day");
    expect(clashSentence([clash, clash])).toBe("Concrete Crew 1 is on Riverside that day (and 1 more)");
  });

  it("asks once, then writes with force on a yes and not at all on a no", async () => {
    const calls: boolean[] = [];
    const write = async (force: boolean) => {
      calls.push(force);
      if (!force) throw conflict();
      return "booked";
    };
    expect(await withConflictAsk(write, async () => true)).toBe("booked");
    expect(calls).toEqual([false, true]);
    calls.length = 0;
    expect(await withConflictAsk(write, async () => false)).toBeNull();
    expect(calls).toEqual([false]);
  });

  it("lets other errors through untouched", async () => {
    await expect(
      withConflictAsk(
        async () => {
          throw new Error("offline");
        },
        async () => true
      )
    ).rejects.toThrow("offline");
  });
});
