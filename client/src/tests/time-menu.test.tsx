/**
 * The program's time list (components/ui/timeMenu.tsx).
 *
 * The popup behind `<input type="time">` is the browser's — on TimeCard's Time in and Time out
 * it was Chrome's dark hour / minute / AM-PM columns beside the program's own white dropdowns,
 * which is what the ask was about (2026-09-27). This layer draws the program's dropdown list
 * instead and leaves the native input as the value, so what matters is the same as for the
 * calendar: the choice reaches the field's `onChange`, the digits can still be typed, and a
 * field outside the program keeps the native picker.
 *
 * jsdom lays nothing out, so the field is given a box: WHERE the press lands is what decides
 * between opening the list and editing the time.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TimeMenuLayer } from "../components/ui/timeMenu";
import { isInOwnPopup } from "../components/ui/selectMenu";

/** A time field inside the shell, labelled the way TimeCard's are (a wrapping <label>). */
function Harness({
  onChange,
  value = "09:00",
  outside = false,
  step,
  min,
  max
}: {
  onChange?: (value: string) => void;
  value?: string;
  outside?: boolean;
  step?: number;
  min?: string;
  max?: string;
}) {
  return (
    <>
      <TimeMenuLayer />
      <div className={outside ? "welcome-page" : "app-shell hs-shell bf-shell"}>
        <label>
          <span>Time in</span>
          <input type="time" defaultValue={value} step={step} min={min} max={max} onChange={(event) => onChange?.(event.target.value)} />
        </label>
      </div>
    </>
  );
}

const WIDTH = 230;

function field(): HTMLInputElement {
  const input = screen.getByLabelText("Time in") as HTMLInputElement;
  input.getBoundingClientRect = () =>
    ({ left: 0, right: WIDTH, top: 0, bottom: 44, width: WIDTH, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return input;
}

/** A MouseEvent named "pointerdown": jsdom has no PointerEvent and would drop clientX. */
const pressAt = (input: HTMLInputElement, clientX: number) =>
  act(() => {
    input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX }));
  });
const pressGlyph = (input: HTMLInputElement) => pressAt(input, WIDTH - 8);
const pressDigits = (input: HTMLInputElement) => pressAt(input, 24);

const list = () => screen.queryByRole("listbox", { name: "Time in" });
const rows = () => within(screen.getByRole("listbox", { name: "Time in" })).getAllByRole("option");
const row = (label: string) => within(screen.getByRole("listbox", { name: "Time in" })).getByRole("option", { name: label });

describe("the program's time list", () => {
  it("opens from the clock glyph as the program's dropdown, every quarter hour, the field's time checked", () => {
    render(<Harness />);
    expect(list()).toBeNull();

    pressGlyph(field());

    const menu = screen.getByRole("listbox", { name: "Time in" });
    // it IS the dropdown list: the same portal and rows section 53 dresses and section 64 animates
    expect(menu.className).toBe("bfsel-menu");
    expect(menu.parentElement?.classList.contains("bfsel")).toBe(true);
    expect(rows()[0].className).toBe("bfsel-item");
    expect(rows()).toHaveLength(96);
    expect(rows()[0]).toHaveTextContent("12:00 AM");
    expect(rows()[95]).toHaveTextContent("11:45 PM");
    expect(row("9:00 AM")).toHaveAttribute("aria-selected", "true");
    expect(row("9:15 AM")).toHaveAttribute("aria-selected", "false");
  });

  it("leaves a press on the digits alone, so a time can still be typed", () => {
    render(<Harness />);
    pressDigits(field());
    expect(list()).toBeNull();
  });

  it("writes the chosen time back through the field, so its handler runs", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    pressGlyph(input);
    fireEvent.click(row("4:30 PM"));

    expect(onChange).toHaveBeenCalledWith("16:30");
    expect(input.value).toBe("16:30");
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  /* "Clock in now" sets 9:42, and a list of quarter hours would otherwise hide what the field says. */
  it("gives a time off the quarter hours its own row, in order and checked", () => {
    render(<Harness value="09:42" />);
    pressGlyph(field());
    const labels = rows().map((option) => option.textContent);
    expect(labels).toHaveLength(97);
    expect(labels.indexOf("9:42 AM")).toBe(labels.indexOf("9:30 AM") + 1);
    expect(row("9:42 AM")).toHaveAttribute("aria-selected", "true");
  });

  it("honours the field's step, min and max", () => {
    render(<Harness step={1800} min="06:00" max="18:00" value="" />);
    pressGlyph(field());
    const labels = rows().map((option) => option.textContent);
    expect(labels[0]).toBe("6:00 AM");
    expect(labels.at(-1)).toBe("6:00 PM");
    expect(labels).toHaveLength(25);
  });

  it("opens on Alt+ArrowDown, walks on the arrows and chooses on Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    const menu = screen.getByRole("listbox", { name: "Time in" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("09:30");
  });

  it("takes Escape for itself, so a dialog behind it stays open", () => {
    render(<Harness />);
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    try {
      pressGlyph(field());
      fireEvent.keyDown(screen.getByRole("listbox", { name: "Time in" }), { key: "Escape" });
      expect(list()).toBeNull();
      expect(behind).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", behind);
    }
  });

  /* 96 rows always scroll, and the capture-phase scroll listener on window hears the list's
     own scroll too — if it closed on that, the list could never be scrolled. */
  it("stays open while its own rows scroll, and closes when the page does", () => {
    render(<Harness />);
    pressGlyph(field());
    fireEvent.scroll(screen.getByRole("listbox", { name: "Time in" }));
    expect(list()).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(list()).toBeNull();
  });

  it("counts as the owning panel's own popup, and closes on a press outside", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = field();
    pressGlyph(input);
    expect(isInOwnPopup(row("9:15 AM"))).toBe(true);

    fireEvent.pointerDown(document.body, { bubbles: true });
    expect(list()).toBeNull();
    expect(input.value).toBe("09:00");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a time field outside the program to the browser", () => {
    render(<Harness outside />);
    pressGlyph(field());
    expect(list()).toBeNull();
  });
});
