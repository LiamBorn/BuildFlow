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

  it("carries all eight topics from the reference, in its order", async () => {
    const panel = await openPreferences();

    expect(within(panel).getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(within(panel).getByText("Customize your dashboard layout preferences.")).toBeInTheDocument();

    // The seven labelled topics, in the order the reference puts them in, and
    // then the eighth: the button at the foot.
    const labels = [...panel.querySelectorAll(".pref-label")].map((node) => node.textContent?.trim());
    expect(labels).toEqual([
      "Theme Preset",
      "Fonts",
      "Theme Mode",
      "Page Layout",
      "Navbar Behavior",
      "Sidebar Style",
      "Sidebar Collapse Mode"
    ]);
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

  it("disables the two topics that have nothing to switch to, and says why", async () => {
    const panel = await openPreferences();

    // No dark palette exists in the product, so Light / Dark / System is inert
    // on purpose and says so, rather than being a switch onto nothing.
    const mode = within(panel).getByRole("radiogroup", { name: "Theme Mode" });
    for (const option of ["Light", "Dark", "System"]) {
      expect(within(mode).getByRole("radio", { name: option })).toBeDisabled();
    }
    expect(within(panel).getByText(/no dark palette yet/i)).toBeInTheDocument();

    // One font family ships.
    expect(within(panel).getByLabelText("Fonts")).toBeDisabled();
    expect(within(panel).getByText(/One family ships today/i)).toBeInTheDocument();
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

  it("lets a preset move several choices at once, and Restore Defaults put them all back", async () => {
    const panel = await openPreferences();

    fireEvent.change(within(panel).getByLabelText("Theme Preset"), { target: { value: "wide" } });
    await waitFor(() => expect(shell().dataset.bfLayout).toBe("full"));
    expect(shell().dataset.bfSidebar).toBe("floating");

    fireEvent.click(within(panel).getByRole("button", { name: "Restore Defaults" }));
    await waitFor(() => expect(shell().dataset.bfLayout).toBe(DEFAULT_PREFERENCES.layout));
    expect(shell().dataset.bfSidebar).toBe(DEFAULT_PREFERENCES.sidebar);
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
