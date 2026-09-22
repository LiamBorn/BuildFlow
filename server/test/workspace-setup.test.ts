/**
 * Reading a workspace's plan and add-ons back out.
 *
 * These settings are stored as text and read on every bootstrap, which makes them the one
 * place where yesterday's data meets today's code. A product that has since been withdrawn,
 * a plan that has been renamed, a seats value someone put a word in — each has to come back
 * as something the app can render, because the alternative is a workspace that cannot open.
 *
 * Written while "map-field-ops" was being withdrawn from onboardingProductOptions: accounts
 * that picked it still have it in their settings row, and nothing tested what happens to
 * them. The reader filters against the live list, so the answer is that it is dropped — this
 * pins that, and does it without naming the withdrawn id, so the test keeps its meaning for
 * whichever product is withdrawn next.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { onboardingProductOptions, planOptions } from "@buildflow/shared";
import { BuildFlowStore } from "../src/database.js";

const freshStore = () => BuildFlowStore.create(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-setup-")), "store.sqlite"), true);

/** Write the raw setting the way onboarding does, then read it back through the accessor. */
async function storedProducts(raw: string) {
  const store = await freshStore();
  store.setWorkspaceSetting("selectedProducts", raw);
  return store.workspaceSetup().selectedProducts;
}

describe("add-ons a workspace picked", () => {
  it("reads back the products that are still offered", async () => {
    const live = onboardingProductOptions.slice(0, 2).map((o) => o.id);
    expect(await storedProducts(JSON.stringify(live))).toEqual(live);
  });

  /**
   * The case this file was written for. A product can be withdrawn from the catalogue while
   * accounts still have it stored; it must vanish from the answer rather than reaching the
   * client as an id it no longer has a page for.
   */
  it("drops a product that is no longer offered, and keeps the rest", async () => {
    const live = onboardingProductOptions[0].id;
    const result = await storedProducts(JSON.stringify(["a-product-we-withdrew", live]));
    expect(result).toEqual([live]);
    expect(result).not.toContain("a-product-we-withdrew");
  });

  it("returns nothing rather than throwing when the row is not what it should be", async () => {
    // Each of these has been a real shape at some point: unset, truncated, or the wrong type.
    for (const raw of ["", "[", "null", '"map-field-ops"', "{}", "[1,2,3]"]) {
      await expect(storedProducts(raw), `"${raw}" should read as no products`).resolves.toEqual([]);
    }
  });
});

describe("the plan and the seat count", () => {
  it("reads a real plan back", async () => {
    const store = await freshStore();
    store.setWorkspaceSetting("selectedPlan", planOptions[1]);
    expect(store.workspaceSetup().selectedPlan).toBe(planOptions[1]);
  });

  it("reports no plan rather than a plan that no longer exists", async () => {
    const store = await freshStore();
    store.setWorkspaceSetting("selectedPlan", "legacy-tier-we-retired");
    expect(store.workspaceSetup().selectedPlan, "a retired plan is not a plan").toBeNull();
  });

  it("only believes a seat count that is a positive number", async () => {
    const store = await freshStore();
    for (const [raw, expected] of [
      ["12", 12],
      ["0", null],
      ["-3", null],
      ["", null],
      ["lots", null]
    ] as const) {
      store.setWorkspaceSetting("seats", raw);
      expect(store.workspaceSetup().seats, `seats="${raw}"`).toBe(expected);
    }
  });
});
