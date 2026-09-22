/**
 * Which plan to put in front of a new workspace, from two answers: roughly what the
 * business bills a month, and how many people are in it (onboarding step 4, 2026-09-22).
 *
 * This is a RULE, written out, not a model. The answers are two bands each, the plans are
 * four, and the boundaries between them are the product's own: Free stops at five seats
 * (`FREE_PLAN_SEATS`, the same number `productPlans` prints as "Limited Users: 5 users
 * included"), Business is the tier whose whole pitch is several projects at once, and
 * Enterprise is a custom seat count. A rule can be read, tested and explained on the card
 * in one sentence, which is what the `reason` is for — the person is shown WHY, not asked
 * to trust a verdict.
 *
 * Both answers are optional (the step has Skip, and revenue has "Prefer not to say"). With
 * neither, the recommendation is Pro: the entry paid tier, on a trial, with unlimited
 * seats — the plan the most crews land on when they know nothing else yet.
 */
import type { PlanId } from "@buildflow/shared";

export const REVENUE_OPTIONS = [
  { id: "starting", label: "Just starting out" },
  { id: "under25k", label: "Under $25k / month" },
  { id: "25k-100k", label: "$25k – $100k / month" },
  { id: "100k-500k", label: "$100k – $500k / month" },
  { id: "500k-2m", label: "$500k – $2M / month" },
  { id: "2m+", label: "$2M+ / month" },
  { id: "private", label: "Prefer not to say" }
] as const;
export type RevenueBand = (typeof REVENUE_OPTIONS)[number]["id"];

/**
 * `seats` is what the band becomes on the plan — every plan is priced per seat, and
 * onboarding has always recorded a seat count on the org. A band's seats are the number a
 * crew that size actually puts on the schedule, not the band's upper edge: a 16–50 person
 * business does not buy fifty logins on day one.
 */
export const TEAM_OPTIONS = [
  { id: "solo", label: "Just me", seats: 1 },
  { id: "2-5", label: "2 – 5", seats: 5 },
  { id: "6-15", label: "6 – 15", seats: 10 },
  { id: "16-50", label: "16 – 50", seats: 25 },
  { id: "51-200", label: "51 – 200", seats: 75 },
  { id: "200+", label: "200+", seats: 200 }
] as const;
export type TeamBand = (typeof TEAM_OPTIONS)[number]["id"];

/** The seat count recorded when the team size was skipped — the same default the old plan step used. */
export const DEFAULT_SEATS = 5;
/** Free's cap. `productPlans` says "Limited Users: 5 users included"; this is that number. */
export const FREE_PLAN_SEATS = 5;

export type Recommendation = {
  plan: PlanId;
  seats: number;
  /** One sentence for the card: why this plan, in terms of what was answered. */
  reason: string;
};

export const revenueLabel = (band: RevenueBand | null) => REVENUE_OPTIONS.find((option) => option.id === band)?.label ?? null;
export const teamLabel = (band: TeamBand | null) => TEAM_OPTIONS.find((option) => option.id === band)?.label ?? null;
export const teamSeats = (band: TeamBand | null) => TEAM_OPTIONS.find((option) => option.id === band)?.seats ?? DEFAULT_SEATS;

export function recommendPlan(revenue: RevenueBand | null, team: TeamBand | null): Recommendation {
  const seats = teamSeats(team);
  const people = teamLabel(team);
  const money = revenueLabel(revenue);

  // Past what a per-seat plan is built for: the seat count is negotiated, not picked.
  if (team === "200+" || revenue === "2m+") {
    return {
      plan: "enterprise",
      seats,
      reason: `${team === "200+" ? "A team of 200 or more" : "At $2M a month or more"}, the schedule runs across divisions and regions. Enterprise is a custom seat count, your own onboarding and a security review.`
    };
  }
  // Several projects at once is what Business exists for.
  if (team === "51-200" || revenue === "500k-2m") {
    return {
      plan: "business",
      seats,
      reason: `${team === "51-200" ? "With 51 to 200 people" : "At $500k to $2M a month"}, more than one project runs at a time. Business adds cross-project dispatch, route and equipment coordination, and field permissions.`
    };
  }
  // More people than Free seats, or more work than a capped schedule holds.
  if (team === "6-15" || team === "16-50" || revenue === "25k-100k" || revenue === "100k-500k") {
    const why =
      team === "6-15" || team === "16-50"
        ? `A crew of ${people} is past Free's ${FREE_PLAN_SEATS} seats`
        : `At ${money?.replace(" / month", " a month")}, there is more schedule than Free's cap holds`;
    return {
      plan: "pro",
      seats,
      reason: `${why}. Pro is unlimited seats, the full production calendar, crew capacity and readiness rules — on a 14-day trial.`
    };
  }
  // Nothing to go on: the plan most crews start on.
  if (team === null && (revenue === null || revenue === "private")) {
    return {
      plan: "pro",
      seats,
      reason: `Most crews start on Pro: unlimited seats, the full production calendar and readiness rules, on a 14-day trial. Free is one click away if that is too much.`
    };
  }
  // Five or fewer people and early revenue: Free covers it.
  return {
    plan: "free",
    seats,
    reason: `${people ? `${people === "Just me" ? "On your own" : `With ${people} people`}` : "Starting out"}, Free covers it: the calendar, work orders and exports for up to ${FREE_PLAN_SEATS} people. Move up whenever the crew grows.`
  };
}
