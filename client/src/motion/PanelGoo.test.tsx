/**
 * BuildFlow AI comes out of the button you asked with — skin §80, which is
 * skin §64's effect applied to the assistant.
 *
 * jsdom measures nothing, so every box here is given the rect a browser would
 * have returned. What these cases hold is the part that is this program's:
 * WHICH button is measured, when the numbers may be written, and what happens
 * when there is no button to measure at all.
 */
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelGoo } from "./PanelGoo";

const rect = (el: Element, left: number, top: number, width: number, height: number) => {
  el.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
};

/** The shell's two ways in, and the always-mounted panel they open. */
const world = () => {
  document.body.innerHTML = `
    <div class="app-shell hs-shell bf-shell">
      <button class="hs-ai-button" aria-label="Ask BuildFlow AI"></button>
      <button class="hc-assistant-fab" aria-label="Ask BuildFlow AI"></button>
    </div>
    <div class="bf-breeze"><div class="bf-breeze-main"></div></div>`;
  const spark = document.querySelector<HTMLElement>(".hs-ai-button")!;
  const fab = document.querySelector<HTMLElement>(".hc-assistant-fab")!;
  const panel = document.querySelector<HTMLElement>(".bf-breeze")!;
  const surface = document.querySelector<HTMLElement>(".bf-breeze-main")!;
  rect(spark, 540, 8, 36, 36);
  rect(fab, 976, 758, 104, 40);
  rect(surface, 136, 170, 372, 546);
  return { spark, fab, panel, surface };
};

/** Opening is a class on the panel — the mounting model this must not change. */
const open = (panel: HTMLElement) => panel.classList.add("is-open");
const close = (panel: HTMLElement) => panel.classList.remove("is-open");
const settle = () => new Promise((r) => setTimeout(r, 0));

const read = (surface: HTMLElement) => ({
  mark: surface.dataset.bfmGoo,
  dx: surface.style.getPropertyValue("--bf-goo-dx"),
  y: surface.style.getPropertyValue("--bf-goo-y"),
  x: surface.style.getPropertyValue("--bf-goo-x"),
  h: surface.style.getPropertyValue("--bf-goo-h")
});

afterEach(() => {
  // ALWAYS, not at the end of the case that switched them on: a fake-timer case
  // that throws first leaves them fake, and every later case that waits on a real
  // setTimeout then hangs for ever rather than failing.
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = "";
});

describe("the assistant's gooey open", () => {
  it("starts the panel on the button that was pressed", async () => {
    const { spark, panel, surface } = world();
    render(<PanelGoo />);
    spark.click();
    open(panel);
    await settle();

    // 540 - 136 across, 8 - 170 up, and as wide and tall as a 36px button is
    // against a 372x546 panel
    expect(read(surface)).toEqual({ mark: "true", dx: "404px", y: "-162px", x: "0.0968", h: "0.0659" });
  });

  it("measures the OTHER button when that is the one pressed", async () => {
    const { fab, panel, surface } = world();
    render(<PanelGoo />);
    fab.click();
    open(panel);
    await settle();

    // the floating button is a wide pill in the far corner, so the panel starts
    // as that pill — which is the whole point of measuring rather than assuming
    expect(read(surface)).toEqual({ mark: "true", dx: "840px", y: "588px", x: "0.2796", h: "0.0733" });
  });

  it("leaves the panel its old entrance when nothing was pressed", async () => {
    // a keyboard route, or any way in with no click behind it: there is no box
    // to come out of, and a guessed one would be worse than none
    const { panel, surface } = world();
    render(<PanelGoo />);
    open(panel);
    await settle();
    expect(surface.dataset.bfmGoo).toBeUndefined();
  });

  it("keeps the numbers until it has finished going back, then takes them off", async () => {
    // 2026-09-19: they used to go the moment the panel closed. They cannot now —
    // the way back is the same morph in reverse, and it needs them the whole way.
    const { spark, panel, surface } = world();
    render(<PanelGoo />);
    spark.click();
    open(panel);
    await settle();
    expect(surface.dataset.bfmGoo).toBe("true");

    close(panel);
    await settle();
    expect(surface.dataset.bfmGoo, "still going back along them").toBe("true");

    surface.dispatchEvent(new Event("animationend"));
    expect(surface.dataset.bfmGoo, "or the animation could never play twice").toBeUndefined();
  });

  it("holds the panel in the layout while it shrinks back into the button", async () => {
    // it is hidden by `display: none` the instant `is-open` goes, so without this
    // there is no frame in which anything could be animated
    const { spark, panel } = world();
    render(<PanelGoo />);
    spark.click();
    open(panel);
    await settle();

    close(panel);
    await settle();
    expect(panel.classList.contains("bfm-closing"), "kept in the layout").toBe(true);

    // and let go again, so the next case does not inherit a panel mid-exit
    panel.querySelector(".bf-breeze-main")!.dispatchEvent(new Event("animationend"));
    expect(panel.classList.contains("bfm-closing")).toBe(false);
  });

  it("does not spin when the panel is closed and was never measured", async () => {
    // THE BUG THIS WAS WRITTEN FOR, and it was mine. `classList.remove` writes the
    // `class` attribute whether or not the class was on it, and MutationObserver
    // records an attribute being SET rather than changing — so a bare remove()
    // inside this layer's own observer re-fired it, which removed again, for ever.
    // "Closed and never measured" is the state the shell mounts in, so it locked
    // the browser's main thread the instant you signed in, and hung the suite.
    const { panel } = world();
    let classWrites = 0;
    const spy = new MutationObserver(() => {
      classWrites += 1;
    });
    spy.observe(panel, { attributes: true, attributeFilter: ["class"] });

    render(<PanelGoo />);
    await settle();
    spy.disconnect();

    expect(classWrites, "it has no business touching the class here at all").toBe(0);
  });

  it("stops leaving at once when it is opened again mid-flight", async () => {
    const { spark, panel, surface } = world();
    render(<PanelGoo />);
    spark.click();
    open(panel);
    await settle();
    close(panel);
    await settle();
    expect(panel.classList.contains("bfm-closing")).toBe(true);

    spark.click();
    open(panel);
    await settle();
    expect(panel.classList.contains("bfm-closing"), "it is arriving, not leaving").toBe(false);
    expect(surface.dataset.bfmGoo, "and measured again for the way in").toBe("true");
  });

  it("does not dress a close as a return when there was never a way in", async () => {
    const { panel } = world();
    render(<PanelGoo />);
    open(panel);
    await settle();
    close(panel);
    await settle();
    expect(panel.classList.contains("bfm-closing")).toBe(false);
  });

  /** A right-side panel, mounted the way React mounts one: into the body. */
  const openPanel = (cls: string, surfaceCls: string, box: [number, number, number, number]) => {
    const panel = document.createElement("div");
    panel.className = cls;
    const surface = document.createElement("div");
    surface.className = surfaceCls;
    panel.append(surface);
    rect(surface, ...box);
    document.body.append(panel);
    return surface;
  };

  it("starts a right-side panel on whatever opened it", async () => {
    const { spark } = world();
    render(<PanelGoo />);
    spark.click(); // any clickable serves: a button, a row, a menu item

    const surface = openPanel("schedule-dialog-backdrop", "schedule-job-picker", [900, 100, 480, 700]);
    await settle();

    // 540 - 900 across and 8 - 100 up, at a 36px button against a 480x700 panel
    expect(read(surface)).toEqual({ mark: "true", dx: "-360px", y: "-92px", x: "0.0750", h: "0.0514" });
  });

  it("gives all four of them the same treatment", async () => {
    const { spark } = world();
    render(<PanelGoo />);
    const each: Array<[string, string]> = [
      ["pdx", "pdx-dialog"],
      ["gantt-drawer-layer", "gantt-drawer"],
      ["schedule-dialog-backdrop", "schedule-job-picker"],
      ["bfsp", "bfsp-drawer"]
    ];
    for (const [panel, surface] of each) {
      spark.click();
      const node = openPanel(panel, surface, [900, 100, 480, 700]);
      await settle();
      expect(node.dataset.bfmGoo, panel).toBe("true");
    }
  });

  it("leaves a centred confirm alone — it never went to the edge", async () => {
    const { spark } = world();
    render(<PanelGoo />);
    spark.click();
    const surface = openPanel("pdx", "pdx-dialog pdx-confirm", [500, 200, 420, 300]);
    await settle();
    expect(surface.dataset.bfmGoo).toBeUndefined();
  });

  it("does not dress a panel on its way OUT as one arriving", async () => {
    // panelExit.tsx puts a copy of a leaving panel back, carrying the numbers it
    // already has; measuring it again would send it somewhere new to die
    const { spark } = world();
    render(<PanelGoo />);
    spark.click();
    const leaving = document.createElement("div");
    leaving.className = "pdx bf-panel-exit";
    const surface = document.createElement("div");
    surface.className = "pdx-dialog";
    leaving.append(surface);
    rect(surface, 900, 100, 480, 700);
    document.body.append(leaving);
    await settle();
    expect(surface.dataset.bfmGoo).toBeUndefined();
  });

  it("leaves a panel opened with no click behind it on its old drawer", async () => {
    world();
    render(<PanelGoo />);
    const surface = openPanel("bfsp", "bfsp-drawer", [900, 100, 480, 700]);
    await settle();
    expect(surface.dataset.bfmGoo).toBeUndefined();
  });

  it("starts the rail's flyout on the button the pointer is on, not the last thing clicked", async () => {
    // the flyout is the one panel here opened by HOVER — there is no click to
    // measure, and measuring the last CLICK would send it out of something the
    // pointer left long ago
    const { spark } = world();
    const rail = document.createElement("div");
    rail.className = "hs-rail-slot";
    const railBtn = document.createElement("button");
    railBtn.className = "hs-rail-btn";
    rail.append(railBtn);
    document.body.append(rail);
    rect(rail, 8, 300, 36, 36);

    render(<PanelGoo />);
    spark.click(); // a click somewhere else first, which must NOT win
    // jsdom has no PointerEvent; the listener only reads event.target
    rail.dispatchEvent(new Event("pointerover", { bubbles: true }));

    const flyout = document.createElement("div");
    flyout.className = "hs-flyout";
    rect(flyout, 60, 290, 340, 200);
    document.body.append(flyout);
    await settle();

    // 8 - 60 across and 300 - 290 down, at a 36px button against a 340x200 panel
    expect(read(flyout)).toEqual({ mark: "true", dx: "-52px", y: "10px", x: "0.1059", h: "0.1800" });
  });

  it("leaves the flyout alone when the pointer was never on the rail", async () => {
    const { spark } = world();
    render(<PanelGoo />);
    spark.click();
    const flyout = document.createElement("div");
    flyout.className = "hs-flyout";
    rect(flyout, 60, 290, 340, 200);
    document.body.append(flyout);
    await settle();
    expect(flyout.dataset.bfmGoo, "a click is not a hover").toBeUndefined();
  });

  it("starts the feedback dialog on the tab at the edge, confirm markup and all", async () => {
    // "Give feedback" is built on the confirm's markup but is not a confirmation:
    // it is opened from a button at the screen's edge, so it comes out of it
    const { spark } = world();
    render(<PanelGoo />);
    spark.click();
    const backdrop = document.createElement("div");
    backdrop.className = "project-dialog-backdrop pdx bffb";
    const dialog = document.createElement("div");
    dialog.className = "project-dialog pdx-dialog pdx-confirm bffb-dialog";
    backdrop.append(dialog);
    rect(dialog, 400, 200, 540, 620);
    document.body.append(backdrop);
    await settle();

    expect(dialog.dataset.bfmGoo).toBe("true");
    expect(dialog.style.getPropertyValue("--bf-goo-dx")).toBe("140px");
    expect(dialog.style.getPropertyValue("--bf-goo-y")).toBe("-192px");
  });

  it("still leaves a real confirm alone", async () => {
    const { spark } = world();
    render(<PanelGoo />);
    spark.click();
    const backdrop = document.createElement("div");
    backdrop.className = "project-dialog-backdrop pdx";
    const dialog = document.createElement("div");
    dialog.className = "project-dialog pdx-dialog pdx-confirm";
    backdrop.append(dialog);
    rect(dialog, 400, 200, 420, 300);
    document.body.append(backdrop);
    await settle();

    expect(dialog.dataset.bfmGoo, "a confirmation never went to the edge").toBeUndefined();
  });

  /** Settings' rail, and the keyed panel that a category swaps out. */
  const settings = () => {
    document.body.innerHTML = `
      <div class="app-shell hs-shell bf-shell">
        <button class="hs-gear" aria-label="Settings"></button>
        <div class="settings-rx"><section class="settings-page">
          <aside class="settings-rail">
            <section class="settings-nav-group">
              <button class="settings-nav-item">Preferences</button>
            </section>
            <button class="settings-ai-button">BuildFlow AI</button>
          </aside>
          <div class="settings-panel"></div>
        </section></div>
      </div>`;
    const gear = document.querySelector<HTMLElement>(".hs-gear")!;
    const item = document.querySelector<HTMLElement>(".settings-nav-item")!;
    const ai = document.querySelector<HTMLElement>(".settings-ai-button")!;
    rect(gear, 1180, 8, 32, 32);
    rect(item, 40, 300, 180, 34);
    rect(ai, 40, 620, 180, 40);
    return { gear, item, ai };
  };

  /** React re-keys it, so a whole new panel ARRIVES where the old one was. */
  const swapPanel = () => {
    const host = document.querySelector<HTMLElement>(".settings-panel")!;
    host.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "settings-panel-inner";
    rect(inner, 320, 120, 920, 800);
    host.append(inner);
    return inner;
  };

  it("brings Settings' panel out of the category that was picked", async () => {
    const { item } = settings();
    render(<PanelGoo />);
    item.click();
    const inner = swapPanel();
    await settle();

    // 40 - 320 across and 300 - 120 down, a 180x34 item against a 920x800 panel
    expect(read(inner)).toEqual({ mark: "true", dx: "-280px", y: "180px", x: "0.1957", h: "0.0425" });
  });

  it("measures the BuildFlow AI category the same way, though it sits outside the sections", async () => {
    const { ai } = settings();
    render(<PanelGoo />);
    ai.click();
    const inner = swapPanel();
    await settle();
    expect(read(inner).y, "620 - 120").toBe("500px");
  });

  it("leaves the panel its page beats when Settings was opened from the chrome", async () => {
    // the gear is a clickable like any other, so `clicked` holds it — but a panel
    // morphing out of the top bar while the rail is still assembling is two
    // openings at once, and only a CATEGORY may start this one
    const { gear } = settings();
    render(<PanelGoo />);
    gear.click();
    const inner = swapPanel();
    await settle();
    expect(read(inner).mark).toBeUndefined();
  });

  it("spends the category, so the next panel to mount does not inherit it", async () => {
    const { item } = settings();
    render(<PanelGoo />);
    item.click();
    const first = swapPanel();
    await settle();
    expect(read(first).mark).toBe("true");

    // something else mounts a panel with no category behind it
    const second = swapPanel();
    await settle();
    expect(read(second).mark, "one rect belongs to the one panel it opened").toBeUndefined();
  });

  it("never writes numbers it could not measure", async () => {
    const { spark, panel, surface } = world();
    rect(surface, 0, 0, 0, 0); // the panel is still display:none as far as layout knows
    render(<PanelGoo />);
    spark.click();
    open(panel);
    await settle();
    expect(surface.dataset.bfmGoo, "a zero box would put the panel nowhere").toBeUndefined();
  });
});
