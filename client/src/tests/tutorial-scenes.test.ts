/**
 * Every tutorial step shows the screen it is about.
 *
 * The demonstration each step plays comes from `TUTORIAL_SCENES`, keyed by the step's own
 * id. Add a step and forget to give it a scene and nothing breaks — it just quietly falls
 * back to a generic one, which is exactly the regression this file exists to name. jsdom
 * applies no CSS, so the shapes themselves cannot be checked here; that the right shape is
 * CHOSEN can.
 */
import { describe, expect, it } from "vitest";
import type { OnboardingProductId } from "@buildflow/shared";
import { buildTutorialSteps } from "../App";
import { TUTORIAL_SCENES, sceneForStep } from "../TutorialStage";

/** Every step the tutorial can build: the core, the Schedule tour and all four add-ons. */
const everyStep = () =>
  buildTutorialSteps({
    selectedBusinessType: "Asphalt",
    selectedPlanId: "business",
    selectedProductIds: ["schedule-ai", "time-cards", "map-field-ops", "equipment-tracking"] as OnboardingProductId[]
  });

describe("the tutorial's demonstrations", () => {
  it("gives every step a scene of its own, by name", () => {
    const missing = everyStep()
      .filter((step) => !TUTORIAL_SCENES[step.id])
      .map((step) => `${step.id} ("${step.title}")`);
    expect(missing, "these steps would fall back to a generic demonstration").toEqual([]);
  });

  it("has no scene for a step that no longer exists", () => {
    const ids = new Set(everyStep().map((step) => step.id));
    expect(Object.keys(TUTORIAL_SCENES).filter((id) => !ids.has(id))).toEqual([]);
  });

  /** The screens the steps actually teach, spot-checked where getting it wrong would show. */
  it("matches the screen each step is about", () => {
    const scene = (id: string) => TUTORIAL_SCENES[id];
    expect(scene("month-view").shape).toBe("calendar");
    expect(scene("kanban-view").shape).toBe("lanes");
    expect(scene("gantt-view").shape).toBe("timeline");
    expect(scene("schedule-overview").shape).toBe("board");
    expect(scene("product-map-field-ops").shape).toBe("map");
    expect(scene("schedule-status").shape).toBe("status");
    // a step that asks you to OPEN something clicks; one that asks you to SAVE fills
    expect(scene("open-crew-form").action).toBe("click");
    expect(scene("submit-crew").action).toBe("fill");
    expect(scene("open-job-form").action).toBe("click");
    expect(scene("submit-job").action).toBe("fill");
  });

  it("uses all eleven shapes, so none is dead weight", () => {
    const used = new Set(Object.values(TUTORIAL_SCENES).map((entry) => entry.shape));
    expect(used.size).toBe(11);
  });

  /** And a step with no named scene still gets a sensible one from what it declares. */
  it("falls back from the step's own gate and target", () => {
    expect(sceneForStep({ title: "x", body: "y", validation: "crewDialogOpen" })).toEqual({ shape: "table", action: "click" });
    expect(sceneForStep({ title: "x", body: "y", validation: "crewCreated" })).toEqual({ shape: "form", action: "fill" });
    expect(sceneForStep({ title: "x", body: "y", targetId: "month-calendar" })).toEqual({ shape: "calendar", action: "drag" });
    expect(sceneForStep({ title: "x", body: "y", targetId: "kanban-lanes" })).toEqual({ shape: "lanes", action: "drag" });
    expect(sceneForStep({ title: "x", body: "y" })).toEqual({ shape: "tiles", action: "read" });
  });
});
