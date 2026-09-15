/**
 * When the setup stage shows, and when it stays out of the way.
 *
 * The animation itself is CSS and jsdom applies none of it, so what is testable — and what
 * actually matters — is the promise it makes about the wait: it never flashes for a fast
 * setup, it never disappears mid-flight once it has appeared, and it never pads the work.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupStage, useSetupStage } from "../SetupStage";

/** A probe that renders the stage exactly the way the onboarding step does. */
function Probe({ running, delayMs, minMs }: { running: boolean; delayMs?: number; minMs?: number }) {
  const visible = useSetupStage(running, delayMs, minMs);
  return visible ? <SetupStage /> : null;
}

const onStage = () => screen.queryByRole("status");

describe("the setup stage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says what is happening, and says it to a screen reader", () => {
    render(<SetupStage />);
    const stage = screen.getByRole("status");
    expect(stage).toHaveAttribute("aria-busy", "true");
    expect(stage).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Getting your workspace ready")).toBeInTheDocument();
  });

  it("takes a label, so the caption can name what is being built", () => {
    render(<SetupStage label="Getting Keating Paving ready" />);
    expect(screen.getByText("Getting Keating Paving ready")).toBeInTheDocument();
  });

  it("stays out of the way until the wait has earned it", () => {
    render(<Probe running delayMs={350} minMs={900} />);
    expect(onStage()).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(349));
    expect(onStage()).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2));
    expect(onStage()).toBeInTheDocument();
  });

  /**
   * The whole reason for the delay: a setup that lands in 200ms must show nothing at all.
   * Asserted WHILE the work is still running, not just at the end — checking only the end
   * state passes even with the delay removed, because the stage would have come and gone.
   */
  it("never appears for a setup that finishes before the delay", () => {
    const view = render(<Probe running delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(200));
    expect(onStage(), "appeared before the delay was up").not.toBeInTheDocument();
    view.rerender(<Probe running={false} delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(4000));
    expect(onStage()).not.toBeInTheDocument();
  });

  /** And the reason for the floor: once it is up it cannot blink out mid-animation. */
  it("holds for the floor when the work lands just after it appears", () => {
    const view = render(<Probe running delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(360));
    expect(onStage()).toBeInTheDocument();

    view.rerender(<Probe running={false} delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(800));
    expect(onStage(), "gone before the floor was up").toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(200));
    expect(onStage()).not.toBeInTheDocument();
  });

  /** It covers the wait; it does not extend it. A long setup clears the floor on its own. */
  it("goes as soon as a long setup finishes, with no extra hold", () => {
    const view = render(<Probe running delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onStage()).toBeInTheDocument();

    view.rerender(<Probe running={false} delayMs={350} minMs={900} />);
    act(() => void vi.advanceTimersByTime(1));
    expect(onStage()).not.toBeInTheDocument();
  });
});
