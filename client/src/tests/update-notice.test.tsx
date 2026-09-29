/**
 * The update notification (updates/UpdateNotice.tsx, 2026-09-27).
 *
 * The ask: show the user when an update is available; let them update now, schedule it, or deny
 * it; and show it ONLY when the developer published an update — which here means the server's
 * release number (GET /api/release) is newer than the one this copy was built from.
 *
 * The page's clock is pinned (src/test/setup.ts: 2026-06-16, noon). The scheduling cases also fake
 * the timers, because what they prove is what happens hours later.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CURRENT_RELEASE, type AppRelease } from "@buildflow/shared";
import { UpdateNotice } from "../updates/UpdateNotice";
import { decisionKey, readDecision } from "../updates/releaseWatch";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOON = new Date("2026-06-16T12:00:00");

const NEXT: AppRelease = {
  version: "4.0",
  publishedAt: "2026-06-16",
  title: "Crew chat, on every job",
  highlights: ["Message a crew from its job.", "Photos go with the message.", "Read receipts for the foreman.", "A fourth line nobody sees."]
};

/** The server's answer to /api/release. A plain object: a real Response reads its body on a stream. */
const serverSays = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body }))
  );

/** Let the first ask (a fetch, then its JSON) land and render. */
const settle = () =>
  act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });

const card = () => screen.queryByRole("region", { name: "BuildFlow update" });

const withTimers = () => vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"], now: NOON });

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  // back to setup.ts's clock: the date pinned, the timers real
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date"], now: NOON });
});

describe("the update notification", () => {
  it("offers a release newer than this copy: its number, title and first three lines", async () => {
    serverSays(NEXT);
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();

    const region = card();
    expect(region).not.toBeNull();
    expect(region).toHaveClass("bfupd");
    // measured before it is seen, so the gooey entrance starts on the bell (skin section 85)
    expect(region).toHaveAttribute("data-bfupd-ready", "true");
    const inside = within(region as HTMLElement);
    expect(inside.getByText("Update available")).toBeInTheDocument();
    expect(inside.getByText("BuildFlow 4.0")).toBeInTheDocument();
    expect(inside.getByText("Published June 16, 2026")).toBeInTheDocument();
    expect(inside.getByText("Crew chat, on every job")).toBeInTheDocument();
    expect(inside.getAllByRole("listitem")).toHaveLength(3);
    // the program's own pills, ink for the one that acts
    expect(inside.getByRole("button", { name: "Update now" })).toHaveClass("hs-btn", "hs-btn-primary");
    expect(inside.getByRole("button", { name: "Schedule" })).toHaveClass("hs-btn");
    expect(inside.getByRole("button", { name: "Skip this update" })).toBeInTheDocument();
  });

  /* "The only way this update will pop up on the screen is if the developer published a new update." */
  it.each([
    ["the same release", CURRENT_RELEASE, true],
    ["an older release (a rollback)", { ...NEXT, version: "3.1" }, true],
    ["an error while a publish starts up", { ok: false, error: "Database unavailable." }, false],
    ["something that is not a release", "<!doctype html>", true]
  ])("shows nothing when the server answers with %s", async (_label, body, ok) => {
    serverSays(body, ok);
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(card()).toBeNull();
  });

  it("shows nothing when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(card()).toBeNull();
  });

  it("updates right then and there", async () => {
    serverSays(NEXT);
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("skips this release for good on this device, and asks again about a later one", async () => {
    serverSays(NEXT);
    const first = render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Skip this update" }));
    expect(readDecision("4.0")).toEqual({ choice: "skipped" });
    // it goes back into the bell: a leaving copy, then nothing
    expect(card()).toHaveAttribute("data-bfupd-leaving", "true");
    first.unmount();

    const second = render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(card()).toBeNull();
    second.unmount();

    serverSays({ ...NEXT, version: "4.1" });
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(screen.getByText("BuildFlow 4.1")).toBeInTheDocument();
  });

  it("schedules it: the day's times, the choice kept, and at that time a minute's countdown and the update", async () => {
    withTimers();
    serverSays(NEXT);
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    const options = within(card() as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(options).toEqual([
      "In an hour1:00 PM",
      "At the end of the day5:00 PM",
      "Tonight8:00 PM",
      "Before work tomorrow6:00 AM",
      "Back"
    ]);

    fireEvent.click(screen.getByRole("button", { name: /At the end of the day/ }));
    const fivePm = new Date("2026-06-16T17:00:00").getTime();
    expect(readDecision("4.0")).toEqual({ choice: "scheduled", at: fivePm });
    expect(within(card() as HTMLElement).getByText("Update scheduled")).toBeInTheDocument();
    expect(within(card() as HTMLElement).getByText("5:00 PM")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(card()).toBeNull();

    // nothing happens before five...
    act(() => {
      vi.advanceTimersByTime(fivePm - Date.now() - 60_000);
    });
    expect(card()).toBeNull();
    // ...then a minute's warning
    act(() => {
      vi.advanceTimersByTime(75_000);
    });
    expect(within(card() as HTMLElement).getByText("Updating BuildFlow")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(reload).toHaveBeenCalled();
  });

  it("lets a scheduled update be put off an hour when its time comes", async () => {
    withTimers();
    // chosen earlier, and already due when this copy starts
    window.localStorage.setItem(decisionKey("4.0"), JSON.stringify({ choice: "scheduled", at: NOON.getTime() - 1 }));
    serverSays(NEXT);
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    await settle();

    expect(within(card() as HTMLElement).getByText("Updating BuildFlow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Postpone an hour" }));
    expect(readDecision("4.0")).toEqual({ choice: "scheduled", at: NOON.getTime() + 60 * 60_000 });
    act(() => {
      vi.advanceTimersByTime(59 * 60_000);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it("holds a choice made in another tab", async () => {
    serverSays(NEXT);
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(card()).not.toBeNull();

    window.localStorage.setItem(decisionKey("4.0"), JSON.stringify({ choice: "skipped" }));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: decisionKey("4.0") }));
    });
    expect(card()).toHaveAttribute("data-bfupd-leaving", "true");
  });

  it("forgets choices about releases this copy already runs", async () => {
    window.localStorage.setItem(decisionKey(CURRENT_RELEASE.version), JSON.stringify({ choice: "skipped" }));
    window.localStorage.setItem(decisionKey("4.0"), JSON.stringify({ choice: "skipped" }));
    serverSays(CURRENT_RELEASE);
    render(<UpdateNotice reload={vi.fn()} />);
    await settle();
    expect(window.localStorage.getItem(decisionKey(CURRENT_RELEASE.version))).toBeNull();
    expect(window.localStorage.getItem(decisionKey("4.0"))).not.toBeNull();
  });

  /* Publishing an update is two numbers moving together: the "What's new" entry people see after
     updating, and the release the server reports. If they disagree, people are offered one release
     and greeted by another — or offered nothing at all. */
  it("keeps the release number equal to the newest What's new entry", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    const newest = /const UPDATE_ENTRIES: UpdateEntryData\[\] = \[\s*\{\s*version: "([^"]+)"/.exec(app)?.[1];
    expect(newest, "the newest What's new entry has a version").toBeTruthy();
    expect(CURRENT_RELEASE.version).toBe(newest);
  });

  /* "The same colors, animations, effects, and tweens": the card is the program's own pieces. */
  it("wears the program's card, comes out of the bell on the gooey entrance, and staggers its parts", () => {
    const css = readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8").replace(/\s+/g, " ");
    const S = ".app-shell.hs-shell.bf-shell";
    expect(css).toContain(`${S} .bfupd[data-bfupd-ready="true"] { animation: bfe-goo var(--bf-dur-panel) var(--bf-ease-size) backwards; }`);
    expect(css).toContain(`${S} .bfupd[data-bfupd-leaving="true"] { animation: bfe-goo var(--bf-dur-panel) var(--bf-ease-size) reverse both;`);
    expect(css).toContain(`${S} .bfupd > * { --bfe-r: 0; animation: bfe-row var(--bf-dur-enter) var(--bf-ease) backwards;`);
    const card = /\.app-shell\.hs-shell\.bf-shell \.bfupd \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(card).toContain("border-radius: var(--bf-radius-panel);");
    expect(card).toContain("background: var(--bf-surface);");
    expect(card).toContain("box-shadow: var(--bf-shadow-float);");
    // under the panels and the popups, never over the work
    expect(card).toContain("z-index: 94;");
    // and still for anyone who asked for less motion
    // section 85's own reduce block: the one that follows its "RULE R" note (later sections have theirs)
    const reduce = css.split("RULE R: no morph and no stagger")[1]?.split("@media (prefers-reduced-motion: reduce)")[1]?.split("}\n}")[0] ?? "";
    expect(reduce).toContain(`${S} .bfupd[data-bfupd-ready="true"]`);
    expect(reduce).toContain(`${S} .bfupd > * { animation: none; }`);
  });
});
