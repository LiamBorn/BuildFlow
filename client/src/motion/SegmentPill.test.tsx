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
import { PILL } from "./tokens";

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

  it("travels Settings' rail between sections, and reaches the button outside them", async () => {
    // The rail is the group, not a section of it, which is the whole reason it
    // works: its categories are split across four headed sections and the
    // BuildFlow AI button sits outside all of them, so any per-section group
    // could reach neither the other sections nor that button.
    const rail = document.createElement("aside");
    rail.className = "settings-rail";
    const sections = [0, 1].map((_n) => {
      const section = document.createElement("section");
      section.className = "settings-nav-group";
      section.append(document.createElement("h2"));
      return section;
    });
    const item = (label: string, section: HTMLElement) => {
      const button = document.createElement("button");
      button.className = "settings-nav-item";
      button.textContent = label;
      section.append(button);
      return button;
    };
    const preferences = item("Preferences", sections[0]);
    const team = item("Team", sections[1]);
    const ai = document.createElement("button");
    ai.className = "settings-ai-button active";
    rail.append(sections[0], sections[1], ai);
    document.body.append(rail);

    // two levels between an item and the rail, with the heading's height inside
    // the section's own offset: the walk has to accumulate both
    layOut(sections[0], 0, 180, rail);
    Object.defineProperty(sections[0], "offsetTop", { value: 120, configurable: true });
    layOut(sections[1], 0, 180, rail);
    Object.defineProperty(sections[1], "offsetTop", { value: 300, configurable: true });
    layOut(preferences, 0, 180, sections[0]);
    Object.defineProperty(preferences, "offsetTop", { value: 22, configurable: true });
    layOut(team, 0, 180, sections[1]);
    Object.defineProperty(team, "offsetTop", { value: 22, configurable: true });
    layOut(ai, 0, 180, rail);
    Object.defineProperty(ai, "offsetTop", { value: 520, configurable: true });
    Object.defineProperty(ai, "offsetHeight", { value: 40, configurable: true });

    render(<SegmentPill />);
    // it starts on the one category that is NOT inside a section
    expect(read(rail), "the AI button, measured against the rail").toEqual({ mark: "live", x: "0px", w: "180px", h: "40px" });
    expect(rail.style.getPropertyValue("--bfm-pill-y")).toBe("520px");

    ai.classList.remove("active");
    preferences.classList.add("active");
    await settle();
    expect(rail.style.getPropertyValue("--bfm-pill-y"), "120 (section) + 22 (item)").toBe("142px");
    expect(read(rail).h, "and the item's own height, not the section's").toBe("31px");

    // and across a heading, into the next section
    preferences.classList.remove("active");
    team.classList.add("active");
    await settle();
    expect(rail.style.getPropertyValue("--bfm-pill-y"), "300 + 22").toBe("322px");
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

describe("the stretch", () => {
  /*
   * Asked for on 2026-09-20. It is an ADDITION, not a correction: the reference
   * clip does not stretch. Tracking its pill's own edges through one move, frame
   * by frame, the two never diverge by more than 1.3 percentage points of their
   * own travel — rounded corners, not a leading edge.
   *
   * jsdom has no Web Animations API, so `animate` is stubbed here and the frames
   * it would have been given are read back. That is the whole of what this layer
   * decides; the browser does the interpolating.
   */
  const captureFrames = () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
    (Element.prototype as unknown as { animate: unknown }).animate = function (frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      return { cancel() {} } as unknown as Animation;
    };
    return calls;
  };

  /** A rail-shaped group: a column of options, which is how Settings' moves. */
  const column = (tops: number[]) => {
    const host = document.createElement("div");
    host.className = "settings-rail";
    const items = tops.map((top, i) => {
      const button = document.createElement("button");
      button.className = i === 0 ? "settings-nav-item active" : "settings-nav-item";
      host.append(button);
      layOut(button, 0, 244, host);
      Object.defineProperty(button, "offsetTop", { value: top, configurable: true });
      Object.defineProperty(button, "offsetHeight", { value: 34, configurable: true });
      return button;
    });
    document.body.append(host);
    return { host, items };
  };

  /** The pill's box at each stop, read back out of the keyframes. */
  const boxes = (frames: Keyframe[]) =>
    frames.map((f) => {
      const m = String(f.transform).match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!;
      return { x: +m[1], y: +m[2], w: parseFloat(String(f.width)), h: parseFloat(String(f.height)) };
    });

  afterEach(() => {
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });

  it("runs the pill's leading edge ahead of its trailing one, so the box flexes", async () => {
    const calls = captureFrames();
    const { host, items } = column([0, 48, 96, 144, 192]);
    render(<SegmentPill />);
    expect(calls, "the first placement has nowhere to come from").toHaveLength(0);

    items[0].classList.remove("active");
    items[4].classList.add("active");
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].options.pseudoElement, "the pill IS the group's ::before").toBe("::before");
    const box = boxes(calls[0].frames);
    // it starts and ends the height of an option…
    expect(box[0].h).toBeCloseTo(34, 1);
    expect(box[box.length - 1].h).toBeCloseTo(34, 1);
    // …and is longer than that in between, which is the whole point
    const peak = Math.max(...box.map((b) => b.h));
    expect(peak).toBeGreaterThan(40);

    // moving DOWN, the bottom edge is the one that leads: it has covered more of
    // its own travel than the top edge has, everywhere in the middle of the move
    const top0 = box[0].y;
    const top1 = box[box.length - 1].y;
    const bottom0 = box[0].y + box[0].h;
    const bottom1 = box[box.length - 1].y + box[box.length - 1].h;
    const middle = box.slice(3, -3);
    for (const b of middle) {
      const topProgress = (b.y - top0) / (top1 - top0);
      const bottomProgress = (b.y + b.h - bottom0) / (bottom1 - bottom0);
      expect(bottomProgress, "the leading edge is ahead").toBeGreaterThan(topProgress);
    }
    host.remove();
  });

  it("leads with the other edge when the pill travels the other way", async () => {
    const calls = captureFrames();
    const { host, items } = column([0, 48, 96, 144, 192]);
    render(<SegmentPill />);
    items[0].classList.remove("active");
    items[4].classList.add("active");
    await settle();
    calls.length = 0;

    items[4].classList.remove("active");
    items[0].classList.add("active");
    await settle();

    const box = boxes(calls[0].frames);
    const middle = box.slice(3, -3);
    const top0 = box[0].y;
    const top1 = box[box.length - 1].y;
    const bottom0 = box[0].y + box[0].h;
    const bottom1 = box[box.length - 1].y + box[box.length - 1].h;
    for (const b of middle) {
      const topProgress = (b.y - top0) / (top1 - top0);
      const bottomProgress = (b.y + b.h - bottom0) / (bottom1 - bottom0);
      expect(topProgress, "going up, the TOP edge leads").toBeGreaterThan(bottomProgress);
    }
    host.remove();
  });

  it("leads with the right edge going right, and the left edge coming back", async () => {
    // The rail is a column, but nine of the eleven groups are ROWS — the Dashboard's
    // approval toggle, the view switchers, Timecards' tabs — so the horizontal axis
    // is the common case. It had no test until a mutation that deleted it outright
    // left this file green.
    const calls = captureFrames();
    const host = document.createElement("div");
    host.className = "hs-home-seg";
    const made = [0, 120, 260].map((left, i) => {
      const button = document.createElement("button");
      button.className = i === 0 ? "active" : "";
      host.append(button);
      layOut(button, left, 110, host);
      return button;
    });
    document.body.append(host);
    render(<SegmentPill />);

    made[0].classList.remove("active");
    made[2].classList.add("active");
    await settle();
    const going = boxes(calls[0].frames);
    expect(Math.max(...going.map((b) => b.w)), "it flexes sideways too").toBeGreaterThan(130);
    const rightLeads = going.slice(3, -3).every((b) => {
      const l = (b.x - going[0].x) / (going[going.length - 1].x - going[0].x);
      const r =
        (b.x + b.w - (going[0].x + going[0].w)) / (going[going.length - 1].x + going[going.length - 1].w - (going[0].x + going[0].w));
      return r > l;
    });
    expect(rightLeads, "going right, the right edge leads").toBe(true);

    calls.length = 0;
    made[2].classList.remove("active");
    made[0].classList.add("active");
    await settle();
    const back = boxes(calls[0].frames);
    const leftLeads = back.slice(3, -3).every((b) => {
      const l = (b.x - back[0].x) / (back[back.length - 1].x - back[0].x);
      const r = (b.x + b.w - (back[0].x + back[0].w)) / (back[back.length - 1].x + back[back.length - 1].w - (back[0].x + back[0].w));
      return l > r;
    });
    expect(leftLeads, "coming back, the left edge leads").toBe(true);
    host.remove();
  });

  it("caps the stretch, so a long move flexes rather than smears", async () => {
    const calls = captureFrames();
    // an option most of a screen away: without the cap the bulge is a third of
    // the lead times the distance, which is 75px on a 34px pill
    const { host, items } = column([0, 900]);
    render(<SegmentPill />);
    items[0].classList.remove("active");
    items[1].classList.add("active");
    await settle();

    const peak = Math.max(...boxes(calls[0].frames).map((b) => b.h));
    expect(peak - 34, "capped").toBeLessThanOrEqual(PILL.stretchCap + 1);
    expect(peak - 34, "and still visibly stretched").toBeGreaterThan(PILL.stretchCap * 0.7);
    host.remove();
  });

  it("does not stretch a pill that is not going anywhere", async () => {
    const calls = captureFrames();
    const { host, items } = column([0, 48]);
    render(<SegmentPill />);

    // re-marked as selected without having moved: there is no direction to lead in
    items[0].setAttribute("aria-pressed", "true");
    await settle();
    expect(calls, "nothing to lead with").toHaveLength(0);

    // and a label that merely grows shifts the box's centre, so it counts as a
    // move — but of 8px, which is a bulge of about a pixel. Worth animating on
    // the same timing as everything else; not worth flexing for.
    Object.defineProperty(items[0], "offsetWidth", { value: 260, configurable: true });
    items[0].setAttribute("aria-pressed", "false");
    await settle();
    if (calls.length > 0) {
      const peak = Math.max(...boxes(calls[0].frames).map((b) => b.w));
      expect(peak - 260, "a resize in place barely flexes").toBeLessThan(2);
    }
    host.remove();
  });

  it("leaves the move to the sheet when less motion is asked for", async () => {
    const calls = captureFrames();
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: /reduced-motion/.test(q),
      media: q,
      addEventListener() {},
      removeEventListener() {}
    })) as unknown as typeof window.matchMedia;
    const { host, items } = column([0, 48, 96]);
    render(<SegmentPill />);
    items[0].classList.remove("active");
    items[2].classList.add("active");
    await settle();
    window.matchMedia = real;

    expect(calls).toHaveLength(0);
    // and the pill still ARRIVES — the properties are written either way
    expect(host.style.getPropertyValue("--bfm-pill-y")).toBe("96px");
    host.remove();
  });

  it("still places the pill when the browser cannot animate a pseudo-element", async () => {
    (Element.prototype as unknown as { animate: unknown }).animate = function () {
      throw new TypeError("pseudoElement not supported");
    };
    const { host, items } = column([0, 48, 96]);
    render(<SegmentPill />);
    items[0].classList.remove("active");
    items[2].classList.add("active");
    await settle();
    // the sheet's own transition carries the move, exactly as it did before
    expect(host.style.getPropertyValue("--bfm-pill-y")).toBe("96px");
    expect(host.dataset.bfmPill).toBe("live");
    host.remove();
  });
});
