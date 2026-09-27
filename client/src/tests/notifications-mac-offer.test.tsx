/**
 * The notifications drawer offers BuildFlow for Mac, which puts these same notifications in the
 * MacBook's notch (2026-09-26). The offer sits at the drawer's foot for someone reading on a Mac,
 * until they hide it; the "more" menu keeps a way to it for everyone. Both open the download
 * page (#mac) in a new tab, as Settings › Devices does, so the app stays where it is.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/** The browser the drawer is read in: its user agent, and how many touch points it has (an iPad's Safari also says "Macintosh"). */
function readIn(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

const openBell = () => {
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  return screen.getByRole("region", { name: "Recent BuildFlow activity" });
};
const offerIn = (panel: HTMLElement) => within(panel).queryByRole("complementary", { name: "BuildFlow for Mac" });

describe("the notifications drawer offers BuildFlow for Mac", () => {
  installAppHarness();
  beforeEach(() => {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith("bf:mac-offer:")) window.localStorage.removeItem(key);
  });
  afterEach(() => {
    // back to jsdom's own navigator, which the rest of the suite reads
    delete (window.navigator as { userAgent?: string }).userAgent;
    delete (window.navigator as { maxTouchPoints?: number }).maxTouchPoints;
  });

  it("offers it at the drawer's foot to someone on a Mac, opening the download page in a new tab", async () => {
    readIn(MAC_SAFARI);
    render(<App />);
    await enterDashboard();
    const panel = openBell();

    const offer = offerIn(panel);
    expect(offer).not.toBeNull();
    expect(within(offer!).getByText("Get these in your Mac's notch")).toBeInTheDocument();
    expect(within(offer!).getByText(/Press Control \+ Option to open them/)).toBeInTheDocument();
    const get = within(offer!).getByRole("link", { name: "Get BuildFlow for Mac" });
    expect(get).toHaveAttribute("href", "/#mac");
    expect(get).toHaveAttribute("target", "_blank");
    expect(get.getAttribute("rel")).toContain("noopener");
    // it is not one of the notifications: the rows stay what they were
    expect(offer!.closest(".bfnt-list")).toBeNull();
  });

  it("stays hidden for that person once they hide it, the next time the drawer opens too", async () => {
    readIn(MAC_SAFARI);
    render(<App />);
    await enterDashboard();
    let panel = openBell();
    fireEvent.click(within(panel).getByRole("button", { name: "Hide the BuildFlow for Mac offer" }));
    expect(offerIn(panel)).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Close notifications" }));
    panel = openBell();
    expect(offerIn(panel)).toBeNull();
    expect(Object.keys(window.localStorage).some((key) => key.startsWith("bf:mac-offer:hidden:"))).toBe(true);
  });

  it("offers nothing at the foot on Windows or on an iPad, but the more menu still leads to it", async () => {
    readIn(WINDOWS_CHROME);
    const { unmount } = render(<App />);
    await enterDashboard();
    let panel = openBell();
    expect(offerIn(panel)).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "More notification actions" }));
    const item = within(panel).getByRole("menuitem", { name: "Get BuildFlow for Mac" });
    expect(item).toHaveAttribute("href", "/#mac");
    expect(item).toHaveAttribute("target", "_blank");
    unmount();

    readIn(MAC_SAFARI, 5); // an iPad's Safari: "Macintosh", with a touch screen
    render(<App />);
    await enterDashboard();
    panel = openBell();
    expect(offerIn(panel)).toBeNull();
  });
});
