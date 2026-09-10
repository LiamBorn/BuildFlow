/**
 * The arrows are drawn from what the chart renders: bars found by data-feature-id,
 * x from the chart's geometry. jsdom lays nothing out, so y is 0 here — the elbow
 * shapes themselves are covered in ganttLinks.test.ts.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JobDependency } from "@buildflow/shared";
import { GanttFeatureItem, GanttFeatureList, GanttProvider, GanttTimeline, type GanttFeature } from "../components/ui/gantt";
import { GanttDependencyLinks } from "./GanttDependencyLinks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = { id: "Planned", name: "Planned", color: "#0032af" };
const feature = (id: string, start: string, end: string): GanttFeature => ({
  id,
  name: id.toUpperCase(),
  startAt: new Date(`${start}T00:00:00`),
  endAt: new Date(`${end}T00:00:00`),
  status
});
const rows = [feature("a", "2026-09-07", "2026-09-09"), feature("b", "2026-09-09", "2026-09-11"), feature("c", "2026-09-07", "2026-09-08")];
const links: JobDependency[] = [
  { id: "l1", predecessorId: "a", successorId: "b", type: "FS", lagDays: 2 },
  { id: "l2", predecessorId: "c", successorId: "zzz-not-on-the-chart", type: "FS", lagDays: 0 }
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("GanttDependencyLinks", () => {
  it("draws one arrow per link whose both ends are on the chart, red on the critical path", async () => {
    await act(async () => {
      root.render(
        <GanttProvider range="daily" sidebarWidth={0}>
          <GanttTimeline>
            <GanttFeatureList>
              {rows.map((row) => (
                <GanttFeatureItem key={row.id} {...row} />
              ))}
            </GanttFeatureList>
            <GanttDependencyLinks
              links={links}
              rows={rows.map((row) => ({ id: row.id, name: row.name, startAt: row.startAt, endAt: row.endAt }))}
              critical={new Set(["a", "b"])}
            />
          </GanttTimeline>
        </GanttProvider>
      );
    });
    const paths = [...container.querySelectorAll(".gantt-links > path")];
    expect(paths).toHaveLength(1);
    expect(paths[0].querySelector("title")?.textContent).toBe("A → B (FS +2d)");
    expect(paths[0].classList.contains("is-critical")).toBe(true);
    // a finish-to-start link leaves a's right edge and enters b's left edge — the same day, so the same x
    expect(paths[0].getAttribute("d")).toMatch(/^M(\d+(?:\.\d+)?) 0 H.* H\1$/);
  });
});
