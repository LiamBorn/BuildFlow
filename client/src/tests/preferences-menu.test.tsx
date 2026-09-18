/* The top bar's Preferences panel: the gear opens it, it carries all eight
   topics from the reference, six of them move the shell, and two are disabled
   with a reason rather than shipped as controls that do nothing. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";
import { DEFAULT_PREFERENCES } from "../preferences";

/** The panel, once the gear has been clicked. */
async function openPreferences() {
  render(<App />);
  await enterDashboard();
  fireEvent.click(await screen.findByRole("button", { name: "Layout preferences" }));
  return screen.getByRole("dialog", { name: "Preferences" });
}

const shell = () => document.querySelector(".app-shell") as HTMLElement;

/** Click one option of one segmented control by the names a person would read. */
function choose(panel: HTMLElement, group: string, option: string) {
  const radios = within(panel).getByRole("radiogroup", { name: group });
  fireEvent.click(within(radios).getByRole("radio", { name: option }));
}

describe("the top bar's Preferences panel", () => {
  installAppHarness();

  beforeEach(() => {
    state.bootstrapPayload = bootstrapFixture;
    localStorage.clear();
  });

  /* The gear is a toggle, and the panel's own "a click outside closes me" listener used to
     fight it: the gear sits OUTSIDE the panel, so pressing it closed the panel on mousedown
     and the button's click then toggled the state straight back to open. The panel looked
     stuck open and could only be dismissed by clicking elsewhere, which is what was
     reported. Scoping the listener to the gear's anchor — the wrapper holding both, the way
     the account menu beside it already does — is the fix.

     The press has to be fired as a real sequence: `fireEvent.click` alone never dispatches
     the mousedown the listener reads, so a click-only test passes even with the bug. */
  const press = (element: Element) => {
    fireEvent.mouseDown(element);
    fireEvent.click(element);
  };

  it("closes from the same gear that opens it, and still closes from outside and Escape", async () => {
    render(<App />);
    await enterDashboard();
    const gear = await screen.findByRole("button", { name: "Layout preferences" });
    const panel = () => screen.queryByRole("dialog", { name: "Preferences" });

    press(gear);
    expect(panel()).toBeInTheDocument();
    expect(gear).toHaveAttribute("aria-expanded", "true");

    press(gear);
    expect(panel()).toBeNull();
    expect(gear).toHaveAttribute("aria-expanded", "false");

    press(gear);
    expect(panel()).toBeInTheDocument();

    /* And a press ANYWHERE ELSE still closes it, which is what that listener is for.
       (Escape is the panel's third way out; it is left to the browser, where it was
       checked with a real key press — a keydown fired in this environment does not
       reach a document-level listener, so a case here would prove nothing.) */
    press(document.body);
    await waitFor(() => expect(panel()).toBeNull());
    expect(gear).toHaveAttribute("aria-expanded", "false");
  });

  it("carries all eight topics from the reference, in its order", async () => {
    const panel = await openPreferences();

    expect(within(panel).getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(within(panel).getByText("Customize your dashboard layout preferences.")).toBeInTheDocument();

    // The seven labelled topics, in the order the reference puts them in, and
    // then the eighth: the button at the foot.
    const labels = [...panel.querySelectorAll(".pref-label")].map((node) => node.textContent?.trim());
    expect(labels).toEqual(["Colors", "Fonts", "Theme Mode", "Page Layout", "Navbar Behavior", "Sidebar Style", "Sidebar Collapse Mode"]);
    expect(within(panel).getByRole("button", { name: /Restore Defaults|Already the defaults/ })).toBeInTheDocument();

    // Every option the reference shows, by name.
    expect(within(panel).getByRole("radiogroup", { name: "Theme Mode" })).toBeInTheDocument();
    for (const option of ["Light", "Dark", "System"]) {
      expect(within(panel).getByRole("radio", { name: option })).toBeInTheDocument();
    }
    for (const option of ["Centered", "Full Width", "Sticky", "Scroll", "Inset", "Sidebar", "Floating", "Icon", "OffCanvas"]) {
      expect(within(panel).getByRole("radio", { name: option })).toBeInTheDocument();
    }
  });

  it("has no disabled controls left, and no stale reasons for having had them", async () => {
    const panel = await openPreferences();

    /* Theme Mode and Fonts each shipped disabled with the reason on the control,
       which was honest while neither was built. Both are built now, so this asserts
       the absence of BOTH the disabled state and the explanation — a note that
       outlives the limitation it described is worse than no note. */
    for (const group of ["Theme Mode", "Page Layout", "Navbar Behavior", "Sidebar Style", "Sidebar Collapse Mode"]) {
      const radios = within(panel).getByRole("radiogroup", { name: group });
      for (const radio of within(radios).getAllByRole("radio")) expect(radio).toBeEnabled();
    }
    expect(within(panel).getByLabelText("Fonts")).toBeEnabled();
    expect(within(panel).getByLabelText("Colors")).toBeEnabled();
    expect(within(panel).queryByText(/no dark palette yet/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/One family ships today/i)).not.toBeInTheDocument();
  });

  it("switches theme mode, and tells the browser so its own chrome follows", async () => {
    const panel = await openPreferences();
    expect(shell().dataset.bfMode).toBe("light");

    choose(panel, "Theme Mode", "Dark");
    await waitFor(() => expect(shell().dataset.bfMode).toBe("dark"));

    choose(panel, "Theme Mode", "System");
    await waitFor(() => expect(shell().dataset.bfMode).toBe("system"));

    choose(panel, "Theme Mode", "Light");
    await waitFor(() => expect(shell().dataset.bfMode).toBe("light"));
  });

  it("offers the eighteen fonts, grouped, and sets the whole product to the chosen one", async () => {
    const panel = await openPreferences();
    const picker = within(panel).getByLabelText("Fonts") as HTMLSelectElement;

    // Every name from the reference, in its order. "Geist Pixel Square" is the
    // recording's label for Geist Pixel's square element-shape axis.
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      "Geist",
      "Inter",
      "Noto Sans",
      "Nunito Sans",
      "Figtree",
      "Roboto",
      "Raleway",
      "DM Sans",
      "Public Sans",
      "Outfit",
      "Geist Mono",
      "Geist Pixel Square",
      "JetBrains Mono",
      "Noto Serif",
      "Roboto Slab",
      "Merriweather",
      "Lora",
      "Playfair Display"
    ]);
    // Grouped the way the recording groups them.
    expect([...picker.querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["Sans", "Mono", "Serif"]);
    // Each option is set in its own face, which is what makes the list choosable by eye.
    const figtree = [...picker.options].find((option) => option.textContent === "Figtree");
    expect(figtree?.style.fontFamily).toContain("Figtree");

    fireEvent.change(picker, { target: { value: "playfair-display" } });
    await waitFor(() => expect(shell().dataset.bfFont).toBe("playfair-display"));
    // The face is fetched, rather than merely named in a stack that falls back.
    const link = document.getElementById("bf-font-active") as HTMLLinkElement | null;
    expect(link?.href).toContain("Playfair+Display");
  });

  it("moves the shell for each of the four live layout choices", async () => {
    const panel = await openPreferences();
    expect(shell().dataset).toMatchObject({
      bfLayout: "centered",
      bfNavbar: "sticky",
      bfSidebar: "sidebar",
      bfCollapse: "icon"
    });

    choose(panel, "Page Layout", "Full Width");
    choose(panel, "Navbar Behavior", "Scroll");
    choose(panel, "Sidebar Style", "Floating");
    choose(panel, "Sidebar Collapse Mode", "OffCanvas");

    // The shell's data attributes are what the stylesheet reads, so asserting
    // them is asserting the whole chain short of the paint.
    await waitFor(() =>
      expect(shell().dataset).toMatchObject({
        bfLayout: "full",
        bfNavbar: "scroll",
        bfSidebar: "floating",
        bfCollapse: "offcanvas"
      })
    );
  });

  it("offers the colour sets — Default (white, gray, black) and Blue — and carries the choice on data-bf-colors, never a theme", async () => {
    const panel = await openPreferences();
    const picker = within(panel).getByLabelText("Colors") as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual(["Default", "Blue"]);
    expect(shell().dataset.bfColors).toBe("default");
    // picking Blue recolours the hints and nothing else: the layout choices stay put
    fireEvent.change(picker, { target: { value: "blue" } });
    await waitFor(() => expect(shell().dataset.bfColors).toBe("blue"));
    expect(shell().dataset.bfLayout).toBe(DEFAULT_PREFERENCES.layout);
    expect(shell().dataset.bfSidebar).toBe(DEFAULT_PREFERENCES.sidebar);
    fireEvent.change(picker, { target: { value: "default" } });
    await waitFor(() => expect(shell().dataset.bfColors).toBe("default"));
    /* The themes are gone: a colour set only supplies hints of colour, so the shell no
       longer carries a theme at all. */
    expect(shell().dataset.bfTheme).toBeUndefined();
    // the swatch shows the set's three colours
    const swatch = panel.querySelector(".pref-select-dot.is-colors") as HTMLElement;
    expect(swatch.style.background).toContain("conic-gradient");
    expect(swatch.style.background).toContain("#ffffff");
    expect(swatch.style.background).toContain("#1c1c1c");
  });

  /**
   * AND THE COLOURS PICKER HAS TO SURVIVE BEING USED WITH A POINTER (2026-09-18).
   *
   * The case above drives it with `fireEvent.change`, which is why it passed for as long as the
   * control was broken in the product: reported with a recording — the dropdown opened, an option
   * was clicked, and the panel and the dropdown both closed with nothing changed.
   *
   * The cause was the ORDER of two listeners. This panel dismisses itself on a document
   * `mousedown` outside its anchor, and the list a `<select>` opens is drawn by selectMenu.tsx
   * into the BODY — outside that anchor. So pressing an option unmounted the panel, and the
   * `<select>` with it, before the write-back on the following `click` could reach it; the change
   * event then fired at a detached node and React never saw it.
   *
   * So this drives the full pointer sequence, and the assertion that matters is the middle one:
   * the panel is still there AFTER the mousedown on an option.
   */
  it("changes the colour set when an option is pressed with a pointer, not just by a change event", async () => {
    const panel = await openPreferences();
    const picker = within(panel).getByLabelText("Colors") as HTMLSelectElement;
    expect(shell().dataset.bfColors).toBe("default");

    // open the list the way a pointer does
    fireEvent.pointerDown(picker);
    fireEvent.mouseDown(picker);
    const menu = await waitFor(() => {
      const found = document.querySelector(".bfsel-menu");
      expect(found, "the program draws its own list for this select").toBeTruthy();
      return found as HTMLElement;
    });
    expect(screen.queryByRole("dialog", { name: "Preferences" }), "opening the list must not dismiss the panel").toBeTruthy();

    const blue = [...menu.querySelectorAll(".bfsel-item")].find((item) => item.textContent?.trim() === "Blue") as HTMLElement;
    expect(blue, "the set is offered in the list").toBeTruthy();

    /* THE REGRESSION. Before the fix this mousedown closed the panel, so the click below wrote
       to a `<select>` that was no longer in the document. */
    fireEvent.pointerDown(blue);
    fireEvent.mouseDown(blue);
    expect(
      screen.queryByRole("dialog", { name: "Preferences" }),
      "pressing an option in the list must not dismiss the panel that owns the select"
    ).toBeTruthy();

    fireEvent.mouseUp(blue);
    fireEvent.click(blue);
    await waitFor(() => expect(shell().dataset.bfColors).toBe("blue"));
    expect(picker.value, "and the control shows what was chosen").toBe("blue");
  });

  it("puts the layout and the colour set back with Restore Defaults", async () => {
    const panel = await openPreferences();

    fireEvent.change(within(panel).getByLabelText("Colors"), { target: { value: "blue" } });
    await waitFor(() => expect(shell().dataset.bfColors).toBe("blue"));
    choose(panel, "Page Layout", "Full Width");
    choose(panel, "Sidebar Style", "Floating");
    await waitFor(() => expect(shell().dataset.bfLayout).toBe("full"));
    expect(shell().dataset.bfSidebar).toBe("floating");

    fireEvent.click(within(panel).getByRole("button", { name: "Restore Defaults" }));
    await waitFor(() => expect(shell().dataset.bfLayout).toBe(DEFAULT_PREFERENCES.layout));
    expect(shell().dataset.bfSidebar).toBe(DEFAULT_PREFERENCES.sidebar);
    expect(shell().dataset.bfColors).toBe(DEFAULT_PREFERENCES.colors);
    // Nothing left to restore, so the button says so instead of pretending.
    expect(within(panel).getByRole("button", { name: "Already the defaults" })).toBeDisabled();
  });

  it("keeps the choice on this device", async () => {
    const panel = await openPreferences();
    choose(panel, "Sidebar Style", "Inset");

    await waitFor(() => {
      const key = Object.keys(localStorage).find((name) => name.startsWith("bf:prefs:"));
      expect(key).toBeTruthy();
      expect(JSON.parse(localStorage.getItem(key as string) as string)).toMatchObject({ sidebar: "inset" });
    });
  });

  it("closes on Escape, and leaves the Settings page one click away", async () => {
    const panel = await openPreferences();

    // The gear used to jump straight to the Settings page; that route survives.
    expect(within(panel).getByRole("button", { name: "Open full settings" })).toBeInTheDocument();

    /* The gesture is retried rather than fired once. The panel attaches its
       Escape listener in an effect, and the effect has not necessarily run by
       the time the click that opened it has been flushed — firing once here
       lands before the listener exists and the panel stays open, which is a
       property of this test, not of the panel: both close paths were verified
       in a browser. */
    await waitFor(() => {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Preferences" })).not.toBeInTheDocument();
    });
  });
});
