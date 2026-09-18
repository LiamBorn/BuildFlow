/**
 * The program's dropdown list (components/ui/selectMenu.tsx).
 *
 * The thing under test is a layer over the native control, so what matters is that
 * the control stays the value: choosing a row must reach the same `onChange` the
 * system popup used to, or ninety dropdowns quietly stop working. The other half is
 * scope — the marketing pages and the sign-in screens keep the native list.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SelectMenuLayer } from "../components/ui/selectMenu";

/** A select inside the shell, the way every enhanced one sits. */
function Harness({ onChange, outside = false }: { onChange?: (value: string) => void; outside?: boolean }) {
  return (
    <>
      <SelectMenuLayer />
      <div className={outside ? "welcome-page" : "app-shell hs-shell bf-shell"}>
        <select aria-label="Colors" defaultValue="default" onChange={(event) => onChange?.(event.target.value)}>
          <option value="default">Default</option>
          <option value="blue">Blue</option>
        </select>
      </div>
    </>
  );
}

const press = (element: Element) => fireEvent.pointerDown(element, { bubbles: true });

describe("the program's dropdown list", () => {
  it("opens on the control and offers its options, with the current one marked", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Colors");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    press(select);

    const list = screen.getByRole("listbox", { name: "Colors" });
    const rows = within(list).getAllByRole("option");
    expect(rows.map((row) => row.textContent)).toEqual(["Default", "Blue"]);
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
    expect(rows[1]).toHaveAttribute("aria-selected", "false");
  });

  /** The whole point: the native control is still the value, so onChange must fire. */
  it("writes the choice back through the control, so the existing handler runs", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const select = screen.getByLabelText("Colors") as HTMLSelectElement;

    press(select);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Blue" }));

    expect(onChange).toHaveBeenCalledWith("blue");
    expect(select.value).toBe("blue");
    // and it closes behind the choice, with the control focused again
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(select);
  });

  /* Closing the list returns focus to the control, and a `select.focus()` is programmatic —
     which Chrome treats as focus-visible on a control that takes keyboard input, so the focus
     ring appeared the moment a choice was made by mouse, on a pill that had none before the
     click. The list marks that one focus so the skin can keep the ring off it (section 55),
     and the mark is cleared by the next real interaction. A list opened from the keyboard is
     never marked, because there the ring is the point. */
  it("marks the focus it hands back after a mouse choice, and leaves a keyboard choice to ring", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Colors") as HTMLSelectElement;

    press(select);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Blue" }));
    expect(document.activeElement).toBe(select);
    expect(select.dataset.bfselQuiet).toBe("true");

    fireEvent.keyDown(select, { key: "Tab" });
    expect(select.dataset.bfselQuiet).toBeUndefined();

    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Default" }));
    expect(document.activeElement).toBe(select);
    expect(select.dataset.bfselQuiet).toBeUndefined();
  });

  it("closes on Escape and on a press outside, leaving the value alone", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const select = screen.getByLabelText("Colors") as HTMLSelectElement;

    /* Escape belongs to the TOPMOST layer. This list is a portal to the body, so a
       dialog holding the control sees the same keypress: until it was taken in the
       capture phase and stopped, one Escape closed the list AND the dialog behind it
       (measured on the Schedule's New Activity form, which closed with the list). */
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    press(select);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(behind).not.toHaveBeenCalled();
    document.removeEventListener("keydown", behind);

    press(select);
    press(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(select.value).toBe("default");
    expect(onChange).not.toHaveBeenCalled();
  });

  /* Opening a dropdown and then changing page unmounts the control; the list has to go
     with it rather than stay on screen anchored to a removed element. */
  it("closes when the control it belongs to leaves the page", async () => {
    const { rerender } = render(<Harness />);
    press(screen.getByLabelText("Colors"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(
      <>
        <SelectMenuLayer />
        <div className="app-shell hs-shell bf-shell">another page</div>
      </>
    );
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("opens on the keys the native control opens on, so a keyboard sees the same list", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Colors");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  /* The sign-in screens and the marketing pages are outside the shell's language and
     keep the native list, so the layer must not reach them. */
  it("leaves selects outside the program alone", () => {
    render(<Harness outside />);
    press(screen.getByLabelText("Colors"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("leaves a disabled or multiple select alone", () => {
    render(
      <>
        <SelectMenuLayer />
        <div className="app-shell hs-shell bf-shell">
          <select aria-label="Off" disabled>
            <option value="a">A</option>
          </select>
          <select aria-label="Many" multiple>
            <option value="a">A</option>
          </select>
        </div>
      </>
    );
    /* Queried by class rather than by role: a `<select multiple>` IS a listbox in the
       accessibility tree, so the role would match the control itself and prove nothing. */
    press(screen.getByLabelText("Off"));
    expect(document.querySelector(".bfsel-menu")).toBeNull();
    press(screen.getByLabelText("Many"));
    expect(document.querySelector(".bfsel-menu")).toBeNull();
  });
});
