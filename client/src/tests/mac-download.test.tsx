/* BuildFlow for Mac's download page (#mac, MacDownloadPage.tsx) and the links to it.
   Every route check here LOADS the URL (history.replaceState before render) rather than clicking to
   it, because clicking goes through pushState and would pass even if the router could not resolve
   the hash. The Download button reads /downloads/mac/latest.json, which release.sh writes; the tests
   answer it the three ways the server can: a release, no release yet (404), and no answer at all. */
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { DevicesSettingsPanel } from "../DevicesSettingsPanel";
import { formatDownloadSize, MAC_LATEST_URL, parseMacRelease } from "../MacDownloadPage";
import { installAppHarness, respondToBuildflowApi } from "../test/appHarness";

const RELEASE = {
  name: "BuildFlow for Mac",
  version: "0.1.0",
  build: 1,
  file: "BuildFlow-0.1.0.dmg",
  url: "https://build-flow.replit.app/downloads/mac/BuildFlow-0.1.0.dmg",
  length: 4_812_345,
  sha256: "a".repeat(64),
  minimumSystemVersion: "13.0",
  hardware: "universal",
  publishedAt: "2026-09-26T18:00:00.000Z"
};

/** The fake server, with latest.json answered by `latest`. */
function stubLatest(latest: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith(MAC_LATEST_URL)) return latest();
    return respondToBuildflowApi(input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("latest.json, read defensively", () => {
  it("takes a release as release.sh writes it", () => {
    expect(parseMacRelease(RELEASE)).toMatchObject({ version: "0.1.0", file: "BuildFlow-0.1.0.dmg", hardware: "universal" });
  });

  it("refuses anything that would make the button point somewhere else", () => {
    for (const file of ["../secret.dmg", "BuildFlow.dmg", "BuildFlow-0.1.0.zip", "https://evil.example/BuildFlow-0.1.0.dmg"]) {
      expect(parseMacRelease({ ...RELEASE, file }), file).toBeNull();
    }
    expect(parseMacRelease({ ...RELEASE, version: "latest" })).toBeNull();
    expect(parseMacRelease({ ...RELEASE, length: 0 })).toBeNull();
    expect(parseMacRelease(null)).toBeNull();
    expect(parseMacRelease("BuildFlow-0.1.0.dmg")).toBeNull();
  });

  it("sizes a download the way Finder does", () => {
    expect(formatDownloadSize(4_812_345)).toBe("4.8 MB");
    expect(formatDownloadSize(12_000_000)).toBe("12.0 MB");
    expect(formatDownloadSize(640_000)).toBe("640 KB");
  });
});

describe("the #mac page, loaded cold", () => {
  installAppHarness();

  beforeEach(() => {
    window.history.replaceState(null, "", "/#mac");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("opens from its URL, names itself in the tab, and offers the latest release", async () => {
    const fetchMock = stubLatest(() => new Response(JSON.stringify(RELEASE), { status: 200 }));
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Your day, in the notch." })).toBeInTheDocument();
    expect(document.title).toBe("BuildFlow for Mac — BuildFlow");
    const download = await screen.findByRole("link", { name: "Download for Mac" });
    expect(download).toHaveAttribute("href", "/downloads/mac/BuildFlow-0.1.0.dmg");
    expect(download).toHaveAttribute("download", "BuildFlow-0.1.0.dmg");
    expect(screen.getByText("Version 0.1.0 · 4.8 MB · macOS 13 or later")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(MAC_LATEST_URL))).toBe(true);

    // what it does, what it needs
    for (const name of ["A greeting", "Your inbox", "Voice", "Requirements"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.getByText("macOS 13 Ventura or later")).toBeInTheDocument();
    expect(screen.getByText("Apple silicon or Intel")).toBeInTheDocument();
    // the shortcut, as the app has it: left Control + Option opens the notch, and held, talks
    expect(screen.getByText("Press Control + Option (left side) to open BuildFlow in the notch. Hold them to talk.")).toBeInTheDocument();
    expect(screen.getByText(/Hold Control \+ Option to talk/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/⌥ ?Space|Option-Space|Option \+ Space/);
    expect(screen.getByText(/A Mac with a notch works best/)).toBeInTheDocument();
  });

  it("says plainly that macOS will warn, and exactly how to open it anyway", async () => {
    stubLatest(() => new Response(JSON.stringify(RELEASE), { status: 200 }));
    render(<App />);

    const card = (await screen.findByRole("heading", { level: 3, name: "The first time you open it" })).closest("article")!;
    const steps = within(card)
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/drag BuildFlow into Applications/);
    expect(steps[1]).toMatch(/Control-click \(or right-click\) BuildFlow, choose Open, then choose Open again/);
    expect(steps[2]).toMatch(/System Settings › Privacy & Security/);
    expect(steps[2]).toMatch(/Open Anyway/);
    expect(within(card).getByText(/isn.t signed by Apple yet/)).toBeInTheDocument();
    // the checksum, to check the download against
    expect(within(card).getByText("a".repeat(64))).toBeInTheDocument();
  });

  it("says the download is on its way when there is no release yet, instead of a dead link", async () => {
    stubLatest(() => new Response("Not found", { status: 404 }));
    render(<App />);

    expect(await screen.findByText("The first release is on its way. Check back soon.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download coming soon" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Download for Mac" })).toBeNull();
  });

  it("says so when the download can't be reached", async () => {
    stubLatest(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<App />);

    expect(await screen.findByText(/couldn't reach the download just now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download coming soon" })).toBeDisabled();
  });

  it("tells an Apple silicon-only release apart from a universal one", async () => {
    stubLatest(() => new Response(JSON.stringify({ ...RELEASE, hardware: "arm64" }), { status: 200 }));
    render(<App />);

    expect(await screen.findByText("A Mac with Apple silicon")).toBeInTheDocument();
    expect(screen.queryByText("Apple silicon or Intel")).toBeNull();
  });
});

describe("the ways to the #mac page", () => {
  installAppHarness();

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("is in the Product column of a product page's footer", async () => {
    window.history.replaceState(null, "", "/#crew-scheduling");
    render(<App />);

    const footer = await screen.findByRole("navigation", { name: "Footer" });
    expect(within(footer).getByRole("link", { name: "BuildFlow for Mac" })).toHaveAttribute("href", "#mac");
  });

  it("is in Settings › Devices, opening the site's page in a new tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ devices: [] }), { status: 200 }))
    );
    render(<DevicesSettingsPanel />);

    const link = await screen.findByRole("link", { name: "Download BuildFlow for Mac" });
    expect(link).toHaveAttribute("href", "/#mac");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
