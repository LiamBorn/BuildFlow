/**
 * WHAT A LEAVING PANEL'S COPY IS ALLOWED TO BE.
 *
 * panelExit.tsx puts a clone of a closing panel back so it has something to animate away. The
 * clone is a PICTURE of a panel — and these hold the two ways a picture can be mistaken for the
 * real thing.
 *
 * Both were found on 2026-09-20, from one flake: `tutorial.test.tsx`'s "keeps the schedule job
 * tutorial gate locked until a job is created and assigned" failed on an idle machine and passed
 * on a loaded one. The crew dialog it closes in the PREVIOUS case was still parked on the body —
 * wearing `data-tutorial-id="crew-dialog"`, which is the whole of the tutorial's "is the Add Crew
 * form open" gate — so the next case's gate was already open when it got there. Nothing collected
 * the copy but its own 420ms real-time timer, and RTL's `cleanup()` cannot reach it: it is parked
 * on the body, not in the container RTL made.
 */
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelExitLayer } from "./panelExit";

/** The observer delivers on a microtask; a real timeout is past every one of them. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A crew dialog as App.tsx portals it: `.pdx` backdrop, the tutorial's anchor on the panel. */
const openCrewDialog = () => {
  const backdrop = document.createElement("div");
  backdrop.className = "crew-dialog-backdrop pdx";
  backdrop.innerHTML = `
    <section class="crew-dialog pdx-dialog" role="dialog" aria-labelledby="crew-dialog-title" data-tutorial-id="crew-dialog">
      <h2 id="crew-dialog-title">Add Crew</h2>
    </section>`;
  document.body.append(backdrop);
  return backdrop;
};

const ghosts = () => document.querySelectorAll(".bf-panel-exit");
/** Exactly what the tutorial's `targetExists` asks — see `tutorialStepIsSatisfied` in App.tsx. */
const targetExists = (id: string) => Boolean(document.querySelector(`[data-tutorial-id="${id}"]`));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("the copy of a panel on its way out", () => {
  it("goes back where the panel was, so there is something to animate", async () => {
    render(<PanelExitLayer />);
    openCrewDialog().remove();
    await settle();

    expect(ghosts()).toHaveLength(1);
    // still a `.pdx` backdrop, because the exit's CSS is written against those classes
    expect(ghosts()[0]).toHaveClass("crew-dialog-backdrop", "pdx");
    // and inert: for the ~140ms it is up, nobody should be able to reach into it
    expect(ghosts()[0]).toHaveAttribute("aria-hidden", "true");
    expect(ghosts()[0]).toHaveAttribute("inert");
  });

  it("does not answer to the names the app finds the LIVE panel by", async () => {
    render(<PanelExitLayer />);
    const dialog = openCrewDialog();
    expect(targetExists("crew-dialog")).toBe(true);

    dialog.remove();
    await settle();

    // the copy is up …
    expect(ghosts()).toHaveLength(1);
    // … and the dialog is still gone as far as anything looking for it is concerned. This is the
    // flake: the tutorial's gate is `targetExists("crew-dialog")` and nothing more, so a copy
    // wearing the anchor unlocks a step whose form has already closed.
    expect(targetExists("crew-dialog")).toBe(false);
    // `id` goes for the same reason it always has: two `crew-dialog-title`s make every
    // `aria-labelledby` and `<label for>` in the document ambiguous.
    expect(document.querySelectorAll("#crew-dialog-title")).toHaveLength(0);
  });

  it("is taken away when the app that made it unmounts", async () => {
    const view = render(<PanelExitLayer />);
    openCrewDialog().remove();
    await settle();
    expect(ghosts()).toHaveLength(1);

    view.unmount();

    // Not left to its own 420ms timer: the copy is parked outside React, on the body, so an
    // unmount is the last moment anything knows it is there. A copy that outlives its tree haunts
    // whatever renders next — the next page in the app, or the next case in a test file.
    expect(ghosts()).toHaveLength(0);
    // nothing of the panel is left on the body at all — no stray `.pdx`, and nothing still
    // answering to the anchor. (The one div left is RTL's own container; `unmount()` does not
    // take that, `cleanup()` does.)
    expect(document.querySelector(".pdx")).toBeNull();
    expect(targetExists("crew-dialog")).toBe(false);
  });
});
