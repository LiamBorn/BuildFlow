/**
 * The BuildFlow AI composer's field.
 *
 * The panel is ALWAYS MOUNTED (so a conversation survives closing it) and is
 * `display: none` while closed. The field sizes itself to its content, and that pass
 * used to run once at mount — against a textarea with no layout box, which measures 0.
 * It wrote `height: 0px` and nothing re-measured until the text changed, so the first
 * time the panel was opened the placeholder showed as a clipped sliver and the first
 * keystroke healed it. Reported with two screenshots: the field as it should look, and
 * the sliver "the first time clicking on the button to get into the page".
 *
 * jsdom lays nothing out, so `scrollHeight` is 0 here exactly as it is in a browser for
 * a hidden panel — which makes this the case the bug lived in.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("the BuildFlow AI composer", () => {
  installAppHarness();

  it("never keeps a height it measured without a layout box, so the first open shows the whole field", async () => {
    render(<App />);
    await enterDashboard();
    /* Queried through the DOM while the panel is shut: it is `aria-hidden` there, so the
       accessibility-tree queries cannot see it — which is the point of the case. */
    const field = document.querySelector(".bf-breeze-composer textarea") as HTMLTextAreaElement;
    expect(field).toBeTruthy();
    expect(field.rows).toBe(1);
    expect(field.style.height).toBe("");

    /* The top bar's sparkle button. Queried by class because several surfaces offer the
       same "Ask BuildFlow AI" action and only this one is the top row's. */
    const button = document.querySelector(".hs-ai-button") as HTMLButtonElement;
    expect(button).toBeTruthy();
    fireEvent.click(button);

    // now it is in the tree, and still wearing its own one-row height
    expect(screen.getByRole("textbox", { name: "Ask BuildFlow AI" })).toBe(field);
    expect(field.style.height).toBe("");
  });

  it("floors the field at a full line, whatever the size-to-content pass measures", () => {
    const sheet = readFileSync(join(SRC, "hs-breeze.css"), "utf8");
    const rule = sheet.split(".bf-breeze-composer textarea {")[1].split("}")[0];
    // 1.5em is one line at this sheet's 15px and at the skin's 13px, both on line-height 1.5
    expect(rule).toMatch(/min-height: 1\.5em;/);
    expect(rule).toMatch(/max-height: 140px;/);
  });
});
