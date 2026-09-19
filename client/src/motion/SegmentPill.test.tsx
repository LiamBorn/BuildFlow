/**
 * The selected option is a pill that travels — docs/motion-spec.md §5's last row.
 *
 * jsdom lays nothing out, so every option here is given the offsets a browser
 * would measure. What these cases hold is the part that is this program's: which
 * option the layer calls selected, what it writes on the group, and the two-step
 * gate that decides whether the pill is allowed to move yet.
 */
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentPill } from "./SegmentPill";

/**
 * Give an element the box a browser would have measured, and the offsetParent it
 * would have had. jsdom lays nothing out and reports offsetParent as null, and
 * the layer walks that chain up to the group — so a test that only stubbed the
 * offsets would be measuring something no browser would agree with.
 */
const layOut = (el: HTMLElement, left: number, width: number, parent?: HTMLElement) => {
  Object.defineProperty(el, "offsetLeft", { value: left, configurable: true });
  Object.defineProperty(el, "offsetTop", { value: 4, configurable: true });
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: 31, configurable: true });
  Object.defineProperty(el, "offsetParent", { value: parent ?? el.parentElement, configurable: true });
};

/** A group shaped like the Dashboard's, with `selected` marked the way it marks it. */
const group = (selected: 0 | 1 | null) => {
  const host = document.createElement("div");
  host.className = "hs-home-seg";
  const open = document.createElement("button");
  open.textContent = "Open";
  const resolved = document.createElement("button");
  resolved.textContent = "Resolved";
  host.append(open, resolved);
  layOut(open, 4, 62, host);
  layOut(resolved, 68, 85, host);
  if (selected !== null) {
    const chosen = selected === 0 ? open : resolved;
    chosen.classList.add("active");
    chosen.setAttribute("aria-pressed", "true");
  }
  document.body.append(host);
  return { host, open, resolved };
};

const read = (host: HTMLElement) => ({
  mark: host.dataset.bfmPill,
  x: host.style.getPropertyValue("--bfm-pill-x"),
  w: host.style.getPropertyValue("--bfm-pill-w"),
  h: host.style.getPropertyValue("--bfm-pill-h")
});

/** MutationObserver callbacks are microtasks; let them run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("the travelling pill", () => {
  it("puts the pill on the selected option, at its measured box", () => {
    const { host } = group(1);
    render(<SegmentPill />);
    expect(read(host)).toEqual({ mark: "live", x: "68px", w: "85px", h: "31px" });
  });

  it("moves it when the selection moves", async () => {
    const { host, open, resolved } = group(0);
    render(<SegmentPill />);
    expect(read(host).x).toBe("4px");

    // both markers move, as the real control moves them — a group that left a
    // stale aria-pressed behind would still be pointing at its old option
    open.classList.remove("active");
    open.setAttribute("aria-pressed", "false");
    resolved.classList.add("active");
    resolved.setAttribute("aria-pressed", "true");
    await settle();

    expect(read(host).x, "travelled to the other option").toBe("68px");
    expect(read(host).w, "and took its width").toBe("85px");
  });

  it("is live by the time it returns, never a frame later", () => {
    // The gate was a requestAnimationFrame, which does not fire in a background
    // tab: the group stayed `placed`, the sheet defines no transition in that
    // state, and the pill teleported instead of travelling. Nothing may wait for
    // a frame — this reads the mark in the same tick the layer mounted.
    const { host } = group(0);
    render(<SegmentPill />);
    expect(host.dataset.bfmPill).toBe("live");
  });

  it("measures a NESTED option, which is where the icon rail keeps its mark", () => {
    // the rail marks the BUTTON inside its slot, and the slot is taller than the
    // button — measuring the child would draw a pill the wrong size in the wrong place
    const host = document.createElement("div");
    host.className = "hs-rail-list";
    const slot = document.createElement("div");
    slot.className = "hs-rail-slot";
    const button = document.createElement("button");
    button.className = "hs-rail-btn active";
    slot.append(button);
    host.append(slot);
    document.body.append(host);
    layOut(slot, 0, 44, host);
    Object.defineProperty(slot, "offsetTop", { value: 96, configurable: true });
    layOut(button, 4, 36, slot);
    Object.defineProperty(button, "offsetTop", { value: 4, configurable: true });
    Object.defineProperty(button, "offsetHeight", { value: 36, configurable: true });

    render(<SegmentPill />);
    expect(read(host).w, "the button's width, not the slot's").toBe("36px");
    expect(read(host).x, "and its offset accumulated up to the group").toBe("4px");
    expect(host.style.getPropertyValue("--bfm-pill-y"), "96 + 4").toBe("100px");
  });

  it("paints no pill when it cannot measure the option against the group", () => {
    // the group is not a positioned ancestor, so the offsetParent chain misses it
    const { host, resolved } = group(1);
    Object.defineProperty(resolved, "offsetParent", { value: document.body, configurable: true });
    render(<SegmentPill />);
    expect(host.dataset.bfmPill).toBeUndefined();
  });

  it("paints no pill for a group with nothing selected", () => {
    const { host } = group(null);
    render(<SegmentPill />);
    expect(host.dataset.bfmPill).toBeUndefined();
  });

  it("reads the other ways a group says which option is selected", async () => {
    const host = document.createElement("div");
    host.className = "pref-segmented";
    const light = document.createElement("button");
    const dark = document.createElement("button");
    host.append(light, dark);
    layOut(light, 4, 50, host);
    layOut(dark, 54, 60, host);
    dark.setAttribute("aria-checked", "true"); // a radiogroup, not a pressed button
    document.body.append(host);

    render(<SegmentPill />);
    expect(read(host).x).toBe("54px");

    dark.setAttribute("aria-checked", "false");
    light.setAttribute("aria-checked", "true");
    await settle();
    expect(read(host).x).toBe("4px");
  });

  it("finds a group that arrives after it mounted, as a panel or a portal does", async () => {
    render(<SegmentPill />);
    const { host } = group(1);
    await settle();
    expect(read(host)).toEqual({ mark: "live", x: "68px", w: "85px", h: "31px" });
  });
});
