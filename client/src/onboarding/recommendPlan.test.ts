/**
 * The plan rule (onboarding step 5, 2026-09-22): two bands in, one plan out, and a reason
 * that names the answer it came from. The boundaries here are the product's own — Free's
 * five seats, Business's several-projects pitch, Enterprise's custom seat count.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SEATS, FREE_PLAN_SEATS, recommendPlan, REVENUE_OPTIONS, TEAM_OPTIONS } from "./recommendPlan";

describe("recommendPlan", () => {
  it("keeps five or fewer people on early revenue on Free", () => {
    expect(recommendPlan("starting", "solo").plan).toBe("free");
    expect(recommendPlan("under25k", "2-5").plan).toBe("free");
    // one answer alone is enough when it points at Free
    expect(recommendPlan(null, "2-5").plan).toBe("free");
    expect(recommendPlan("under25k", null).plan).toBe("free");
    expect(recommendPlan("private", "solo").plan).toBe("free");
  });

  it("moves a crew past Free's seat cap onto Pro, and says that is why", () => {
    const six = recommendPlan("under25k", "6-15");
    expect(six.plan).toBe("pro");
    expect(six.reason).toContain(`Free's ${FREE_PLAN_SEATS} seats`);
    expect(recommendPlan("starting", "16-50").plan).toBe("pro");
    // or revenue alone, past what a capped schedule holds
    expect(recommendPlan("25k-100k", "solo").plan).toBe("pro");
    expect(recommendPlan("100k-500k", null).plan).toBe("pro");
  });

  it("puts a multi-project business on Business", () => {
    expect(recommendPlan("500k-2m", "2-5").plan).toBe("business");
    expect(recommendPlan("under25k", "51-200").plan).toBe("business");
  });

  it("sends a custom-sized operation to Enterprise", () => {
    expect(recommendPlan("2m+", "solo").plan).toBe("enterprise");
    expect(recommendPlan("starting", "200+").plan).toBe("enterprise");
  });

  it("recommends Pro when there is nothing to go on", () => {
    // the step was skipped, or revenue was declined and the team size skipped
    expect(recommendPlan(null, null).plan).toBe("pro");
    expect(recommendPlan("private", null).plan).toBe("pro");
    expect(recommendPlan(null, null).reason).toMatch(/Most crews start on Pro/);
  });

  it("turns the team band into the seat count the plan is priced on", () => {
    expect(recommendPlan(null, "solo").seats).toBe(1);
    expect(recommendPlan(null, "16-50").seats).toBe(25);
    expect(recommendPlan(null, "200+").seats).toBe(200);
    // skipped: the same default the old plan step used
    expect(recommendPlan("25k-100k", null).seats).toBe(DEFAULT_SEATS);
  });

  it("ranks the bands the way the labels read", () => {
    // the options are the order they are shown in; the rule above assumes it
    expect(REVENUE_OPTIONS.map((o) => o.id)).toEqual(["starting", "under25k", "25k-100k", "100k-500k", "500k-2m", "2m+", "private"]);
    expect(TEAM_OPTIONS.map((o) => o.seats)).toEqual([1, 5, 10, 25, 75, 200]);
  });
});
