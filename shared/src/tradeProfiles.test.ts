/**
 * The trade table is data, and TypeScript already checks its shape: `Record<BusinessTypeId,
 * TradeProfile>` means every trade is present and every field is the right type. What it
 * cannot check is whether the data is USABLE — an empty crew list, a blank label, or an `id`
 * that does not match the key it is filed under all typecheck perfectly.
 *
 * That last one is the reason this file exists. A trade is added by copying the one above it,
 * and forgetting to change `id` leaves a profile that looks right in the picker and resolves
 * to the wrong trade everywhere the id is the key: the seed, the DelayIQ categories, the units
 * and the AI's context. Nothing else in the codebase would notice.
 */
import { describe, expect, it } from "vitest";
import { businessTypeOptions } from "./index";
import { tradeProfileFor, tradeProfiles } from "./tradeProfiles";

const entries = Object.entries(tradeProfiles);

describe("the trade table", () => {
  it("has a profile for every trade the product offers, and no extras", () => {
    expect(Object.keys(tradeProfiles).sort()).toEqual([...businessTypeOptions].sort());
  });

  /** The copy-paste this file was written for. */
  it("files every profile under its own id", () => {
    for (const [key, profile] of entries) {
      expect(profile.id, `"${key}" is filed under a different id`).toBe(key);
    }
  });

  it("gives each trade its own name and tagline", () => {
    const labels = entries.map(([, p]) => p.label);
    expect(new Set(labels).size, "two trades share a label").toBe(labels.length);
    const taglines = entries.map(([, p]) => p.tagline);
    expect(new Set(taglines).size, "two trades share a tagline").toBe(taglines.length);
  });
});

describe("every profile is actually usable", () => {
  /**
   * Each of these drives something a person sees, and an empty one fails quietly: no crews
   * in the Schedule filter, no phases to seed, a DelayIQ list with nothing in it, an AI that
   * opens with no suggestions.
   */
  it.each(entries)("%s carries the lists its consumers read", (key, profile) => {
    expect(profile.crewTypes.length, `${key} fields no crews`).toBeGreaterThan(0);
    expect(profile.phases.length, `${key} has no phases to seed`).toBeGreaterThan(0);
    expect(profile.readinessChecks.length, `${key} has nothing to check before rolling`).toBeGreaterThan(0);
    expect(profile.delayIQCategories.length, `${key} has no way to lose a day`).toBeGreaterThan(0);
    expect(profile.materialUnits.length, `${key} counts material in nothing`).toBeGreaterThan(0);
    expect(profile.aiStarters.length, `${key} gives the AI nothing to open with`).toBeGreaterThan(0);
  });

  it.each(entries)("%s has no blank text where a sentence belongs", (key, profile) => {
    for (const field of ["label", "tagline", "description", "aiContext"] as const) {
      expect(profile[field].trim(), `${key}.${field} is blank`).not.toBe("");
    }
    expect(profile.weather.title.trim(), `${key} has no weather rule title`).not.toBe("");
    expect(profile.weather.rule.trim(), `${key} has no weather rule`).not.toBe("");
  });

  it.each(entries)("%s lists nothing twice", (key, profile) => {
    for (const field of ["crewTypes", "phases", "readinessChecks", "delayIQCategories", "materialUnits"] as const) {
      const list = profile[field];
      expect(new Set(list).size, `${key}.${field} repeats an entry`).toBe(list.length);
    }
  });
});

describe("looking a profile up", () => {
  it("answers for a real trade", () => {
    expect(tradeProfileFor("Asphalt")?.label).toBeTruthy();
  });

  /** "" is the state before anyone has chosen, not a missing trade. */
  it("answers null before a trade has been picked, rather than throwing", () => {
    expect(tradeProfileFor("")).toBeNull();
  });
});
