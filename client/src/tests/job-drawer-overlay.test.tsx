/**
 * WHERE THE JOB DRAWER IS PAINTED (2026-09-20).
 *
 * Reported for the third time, and the same sentence each time: "make it so that the user is
 * able to scroll up & down of the job right side bar." The drawer's scroller has been right
 * since 2026-09-17 — `.gantt-drawer-body` is `flex: 1; min-height: 0; overflow-y: auto`, guarded
 * in side-panels.test.ts, and a real wheel over it moves it (measured in the running app: 218px,
 * its full range, with the page behind staying put). What people are describing is the HEADER
 * being under the top bar. It sits outside the scroller, so no amount of scrolling reaches it,
 * and the job's name, its project line and the close disc all went with it.
 *
 * The drawer's layer already asks for the right thing — `position: fixed; inset: 0; z-index: 95`,
 * over the top bar's 40 and the rail's 30. It never got to make that case, because it was
 * rendered as a child of the page and a z-index is only read within its own stacking context.
 * The page is two of them: `.schedule-page` (z-index 60, `isolation: isolate`) inside `.bfm-page`
 * (z-index 1, skin §79, added 2026-09-19 for the page you are leaving — which is when this
 * regressed). The top bar is a sibling of those, so it painted over everything they contain.
 *
 * jsdom lays nothing out and applies no CSS, so it cannot see a stacking context. What it CAN
 * see is the thing that causes one to apply: whether the layer is inside the page at all. That is
 * the fact this file pins, along with the two it depends on — that the portal keeps the
 * `.gantt-page` scope every rule for the drawer is written against, and that it stays inside the
 * shell, which is why it needs no dark palette of its own (measured on a dark shell:
 * `--bf-surface: #1b1b19`, painting rgb(27, 27, 25) under rgb(244, 243, 240)).
 */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Job } from "@buildflow/shared";
import { JobDrawer } from "../schedule/parts/JobDrawer";

const JOB: Job = {
  id: "job-1",
  projectId: "proj-1",
  name: "Tech Ridge TPO Install",
  phase: "Membrane Weld",
  location: "North Austin",
  startDate: "2026-09-11",
  endDate: "2026-09-11",
  startTime: "07:00",
  endTime: "15:30",
  requiredLabor: 4,
  requiredEquipment: "",
  materialsStatus: "Missing",
  status: "In Progress",
  priority: "Medium",
  notes: "",
  percentComplete: 0
};

/** The real ancestry: shell → body → rail + the page, itself wrapped by the page-swap layer. */
const Shell = ({ open }: { open: boolean }) => (
  <div className="app-shell hs-shell bf-shell">
    <header className="topbar hs-topbar" />
    <div className="hs-body">
      <aside className="sidebar hs-rail" />
      <section className="content-scroll">
        <div className="bfm-page">
          <div className="schedule-page month-page page-stack sched-rx gantt-page" data-testid="page">
            {open && (
              <JobDrawer
                job={JOB}
                projectName="Tech Ridge TPO Install"
                crews="Service Crew 5"
                links={[]}
                jobsById={new globalThis.Map()}
                onClose={() => {}}
                onOpenSchedule={() => {}}
                onSave={async () => {}}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  </div>
);

/**
 * Closed, THEN opened — never both in one commit, which is how the app does it: `selected` starts
 * null in schedule/page.tsx, so the drawer is always mounted by a click with the shell long since
 * in the document. Rendering them together would resolve the host before there is an `.app-shell`
 * to find, and the panel has to mount in a single commit (useModalDialog reads its ref in an
 * effect with `[]` deps), so there is no second pass to correct it on.
 */
function open() {
  const view = render(<Shell open={false} />);
  view.rerender(<Shell open />);
  const layer = document.querySelector(".gantt-drawer-layer");
  expect(layer, "the drawer did not render at all").not.toBeNull();
  return { view, layer: layer as HTMLElement };
}

describe("the job drawer is an overlay, not part of the page", () => {
  it("renders outside every stacking context the page makes", () => {
    const { layer } = open();
    const page = document.querySelector('[data-testid="page"]');
    expect(page, "the page host is missing from the fixture").not.toBeNull();
    expect(page!.contains(layer), "the drawer is inside .schedule-page again — z-index 95 cannot beat the top bar from in there").toBe(
      false
    );
    expect(document.querySelector(".bfm-page")!.contains(layer), "and inside .bfm-page").toBe(false);
    cleanup();
  });

  it("keeps the .gantt-page scope its every rule is written against", () => {
    const { layer } = open();
    /* `.gantt-page .gantt-drawer-layer` sets the fixed geometry, and ~30 more rules dress what is
       inside it. A portal that dropped this class would leave an unstyled panel. */
    expect(layer.closest(".gantt-page"), "the portal lost the .gantt-page scope").not.toBeNull();
    cleanup();
  });

  it("stays inside the shell, so the shell's mode reaches it", () => {
    const { layer } = open();
    /* Not `document.body`: the skin writes `.app-shell.hs-shell.bf-shell .gantt-page .gantt-drawer`
       for this panel, and a body portal would match none of it — nor inherit the dark tokens. */
    expect(layer.closest(".app-shell"), "the drawer left the shell").not.toBeNull();
    cleanup();
  });

  it("marks the body while it is up, and unmarks it on the way out", () => {
    const { view } = open();
    expect(document.body.classList.contains("bf-job-drawer-open"), "the rail has nothing to react to").toBe(true);
    view.rerender(<Shell open={false} />);
    expect(document.body.classList.contains("bf-job-drawer-open"), "the rail would never come back").toBe(false);
    cleanup();
  });
});
