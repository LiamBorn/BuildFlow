/**
 * The program's calendar (components/ui/dateMenu.tsx).
 *
 * The popup behind `<input type="date">` is the browser's, so it was the one surface
 * left that ignored the skin — a gray panel with a system-blue selection, which is
 * what the ask was about. This layer draws the calendar instead and leaves the native
 * input as the value, so what matters here is the same as for the dropdown list: the
 * choice must reach the field's existing `onChange`, the field must keep its typing,
 * and the marketing pages must keep the native picker.
 *
 * jsdom lays nothing out, so every rect is zero unless a test gives the field a box —
 * which these do, because WHERE in the field the press lands is what decides between
 * opening the calendar and editing the date text.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DateMenuLayer } from "../components/ui/dateMenu";

/** A date field inside the shell, the way every enhanced one sits. */
function Harness({
  onChange,
  value = "2026-10-29",
  outside = false,
  min,
  max
}: {
  onChange?: (value: string) => void;
  value?: string;
  outside?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <>
      <DateMenuLayer />
      <div className={outside ? "welcome-page" : "app-shell hs-shell bf-shell"}>
        <input
          type="date"
          aria-label="Target completion"
          defaultValue={value}
          min={min}
          max={max}
          onChange={(event) => onChange?.(event.target.value)}
        />
      </div>
    </>
  );
}

const WIDTH = 220;

/** Give the field a real box, so the icon zone at its end has somewhere to be. */
function field(): HTMLInputElement {
  const input = screen.getByLabelText("Target completion") as HTMLInputElement;
  input.getBoundingClientRect = () =>
    ({ left: 0, right: WIDTH, top: 0, bottom: 36, width: WIDTH, height: 36, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return input;
}

/**
 * A press on the calendar glyph at the end of the field, and one on the date text.
 *
 * Dispatched as a MouseEvent named "pointerdown" rather than through
 * `fireEvent.pointerDown`: jsdom has no PointerEvent, so Testing Library falls back to
 * a plain Event and the coordinates are dropped — and WHERE the press lands is the
 * whole point of these two helpers. The dispatch is wrapped in `act` because that is
 * what fireEvent would have done: without it the layer's state change never renders.
 */
const pressAt = (input: HTMLInputElement, clientX: number) =>
  act(() => {
    input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX }));
  });
const pressGlyph = (input: HTMLInputElement) => pressAt(input, WIDTH - 8);
const pressText = (input: HTMLInputElement) => pressAt(input, 24);

const calendar = () => screen.queryByRole("dialog", { name: /Choose a date/ });
const day = (label: string) => within(screen.getByRole("dialog", { name: /Choose a date/ })).getByRole("gridcell", { name: label });

const todayValue = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

describe("the program's calendar", () => {
  it("opens from the field's glyph on the month it holds, with that day marked", () => {
    render(<Harness />);
    expect(calendar()).toBeNull();

    pressGlyph(field());

    const panel = screen.getByRole("dialog", { name: "Choose a date for Target completion" });
    expect(within(panel).getByText("October 2026")).toBeInTheDocument();
    expect(day("October 29, 2026")).toHaveAttribute("aria-selected", "true");
    // six weeks, every month, so the panel never changes height as you step through
    expect(within(panel).getAllByRole("gridcell")).toHaveLength(42);
    // and the days either side of the month are there to be clicked, marked as outside
    expect(day("September 27, 2026").className).toContain("is-outside");
  });

  /* The split that keeps typing: the glyph opens the calendar, the date text does not. */
  it("leaves a press on the date text alone, so the field can still be typed into", () => {
    render(<Harness />);
    pressText(field());
    expect(calendar()).toBeNull();
  });

  /** The whole point: the native input is still the value, so onChange must fire. */
  it("writes the chosen day back through the field, so the existing handler runs", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    pressGlyph(input);
    fireEvent.click(day("October 21, 2026"));

    expect(onChange).toHaveBeenCalledWith("2026-10-21");
    expect(input.value).toBe("2026-10-21");
    // and it closes behind the choice, with the field focused again
    expect(calendar()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("offers the same Today and Clear the browser's picker did", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    pressGlyph(input);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(input.value).toBe(todayValue());

    pressGlyph(input);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(input.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("steps months, and opens on the key the browser's picker opened on", () => {
    render(<Harness />);
    const input = field();

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    const panel = screen.getByRole("dialog", { name: /Choose a date/ });
    expect(within(panel).getByText("October 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(within(panel).getByText("September 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(within(panel).getByText("November 2026")).toBeInTheDocument();
  });

  it("walks the grid on the arrows and chooses on Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    const panel = screen.getByRole("dialog", { name: /Choose a date/ });
    fireEvent.keyDown(panel, { key: "ArrowRight" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("2026-10-30");
  });

  /* Escape belongs to the topmost layer. The calendar is a portal to the body, so a
     dialog holding the field sees the same keypress: before this was taken in the
     capture phase and stopped, one Escape closed the calendar AND the dialog behind
     it (measured in the Edit Project dialog). */
  it("takes Escape for itself, so the dialog behind it stays open", () => {
    render(<Harness />);
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    try {
      pressGlyph(field());
      fireEvent.keyDown(screen.getByRole("dialog", { name: /Choose a date/ }), { key: "Escape" });
      expect(calendar()).toBeNull();
      expect(behind).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", behind);
    }
  });

  it("closes on a press outside, leaving the value alone", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    pressGlyph(input);
    expect(calendar()).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { bubbles: true });
    expect(calendar()).toBeNull();
    expect(input.value).toBe("2026-10-29");
    expect(onChange).not.toHaveBeenCalled();
  });

  /* Opening a calendar and then closing the dialog unmounts the field; the panel has to
     go with it rather than stay on screen anchored to a removed element. */
  it("closes when the field it belongs to leaves the page", async () => {
    const { rerender } = render(<Harness />);
    pressGlyph(field());
    expect(calendar()).toBeInTheDocument();

    rerender(
      <>
        <DateMenuLayer />
        <div className="app-shell hs-shell bf-shell">another page</div>
      </>
    );
    await waitFor(() => expect(calendar()).toBeNull());
  });

  it("honours the field's own min and max", () => {
    render(<Harness min="2026-10-10" max="2026-10-20" />);
    pressGlyph(field());
    expect(day("October 9, 2026")).toBeDisabled();
    expect(day("October 15, 2026")).toBeEnabled();
    expect(day("October 21, 2026")).toBeDisabled();
  });

  /* The sign-in screens and the marketing pages are outside the shell's language and
     keep the browser's own picker, so the layer must not reach them. */
  it("leaves date fields outside the program alone", () => {
    render(<Harness outside />);
    pressGlyph(field());
    expect(calendar()).toBeNull();
  });
});
