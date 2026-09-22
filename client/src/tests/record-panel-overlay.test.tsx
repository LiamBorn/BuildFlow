/**
 * WHERE THE SALES RECORD PANELS ARE PAINTED (2026-09-20).
 *
 * The Contacts, Companies and Deals records open the same overlay: `.hs-record-layer`, which is
 * `position: fixed; inset: 0; z-index: 95` (hs-contacts.css) so it covers the shell's top bar
 * (z-index 40) and its icon rail (30). A z-index is only read inside its own stacking context,
 * though, and the page is one: `.bfm-page` — the page-swap wrapper — is `position: relative;
 * z-index: 1` since skin section 79. Rendered as a child of the page, the layer would be sealed
 * under a bar that is a sibling of `.bfm-page`'s ancestors, and the record's header — the back
 * button, the name, Edit/Delete/Close — would sit behind it. That header is OUTSIDE the panel's
 * scroller (`.hs-record` scrolls; `.hs-record-top` is sticky within it), so no amount of
 * scrolling would reach it. People report that as "the panel is cut off at the top".
 *
 * This is the same defect the Gantt job drawer had (job-drawer-overlay.test.tsx), and all three
 * of these panels already avoid it the same way: each `return createPortal(…, document.body)`,
 * which is what skin section 23b's tokens are written for — `body:has(.app-shell…) .hs-record-layer`
 * restates the dark palette there, because a portal outside the shell cannot inherit it.
 *
 * jsdom lays nothing out and applies no CSS, so it cannot see a stacking context. What it CAN see
 * is the thing that causes one to apply: whether the layer is inside the page at all, and where it
 * went instead. That is what this file pins, for all three pages, plus the property that keeps the
 * panel keyboard-usable — it mounts in ONE commit, so `useModalDialog`'s effect finds the ref and
 * moves focus in. Resolving a portal host in a layout effect instead would render nothing on the
 * first pass, and that effect (deps `[isOpen, dialogRef]`) never runs again to correct it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { SalesBootstrap } from "../api";
import { enterDashboard, installAppHarness, openAppPage, respondToBuildflowApi } from "../test/appHarness";

const LEAD: SalesBootstrap["leads"][number] = {
  id: "lead-1",
  name: "Diego Alvarez",
  email: "diego@summitridge.build",
  phone: "+1 415 555 0142",
  company: "Summit Ridge Builders",
  teamSize: "25-50",
  interest: "Crew Scheduling",
  status: "New",
  value: 12000,
  owner: "Sales Rep",
  source: "Website",
  notes: "Inbound from pricing page.",
  createdAt: "2026-06-09T21:06:00.000Z",
  lastActivityAt: "2026-06-15T15:10:00.000Z"
};

const COMPANY = {
  id: "co-1",
  name: "Bluepeak Site Services",
  domain: "bluepeaksite.com",
  industry: "Excavation & sitework",
  phone: "+1 312 555 0177",
  city: "",
  state: "",
  owner: "Sales Rep",
  notes: "",
  createdAt: "2026-06-01T21:06:00.000Z",
  lastActivityAt: "2026-06-15T15:11:00.000Z"
} satisfies NonNullable<SalesBootstrap["companies"]>[number];

const DEAL = {
  id: "deal-1",
  name: "Crew Scheduling — Summit Ridge",
  stage: "Qualified to buy",
  amount: 12000,
  closeDate: "2026-07-21",
  companyId: "co-1",
  leadId: "lead-1",
  owner: "Sales Rep",
  priority: "Medium",
  notes: "",
  createdAt: "2026-06-02T21:06:00.000Z",
  lastActivityAt: "2026-06-15T15:11:00.000Z"
} satisfies NonNullable<SalesBootstrap["deals"]>[number];

const SALES: SalesBootstrap = { leads: [LEAD], tasks: [], activities: [], meetings: [], companies: [COMPANY], deals: [DEAL] };

/** The one record open on screen. There is never more than one; the helpers below assert that. */
function layer() {
  const found = document.querySelectorAll(".hs-record-layer");
  expect(found.length, `expected exactly one open record panel, found ${found.length}`).toBe(1);
  return found[0] as HTMLElement;
}

/**
 * Open a Sales page and then one record on it — two commits, the way the app does it: every
 * `open*Id` starts null, so the panel is only ever mounted by a click, long after the page.
 * Rendering the page with a record already open would not exercise the mount this file is about.
 */
async function openRecord(page: "Contacts" | "Companies" | "Deals", rowName: string) {
  render(<App />);
  await enterDashboard();
  await openAppPage(page);
  const opener = await screen.findByRole("button", { name: rowName });
  expect(document.querySelector(".hs-record-layer"), "a record was already open before the click").toBeNull();
  fireEvent.click(opener);
  await waitFor(() => expect(document.querySelector(".hs-record-layer")).not.toBeNull());
  return { opener, layer: layer() };
}

describe("the sales record panels are overlays, not part of the page", () => {
  installAppHarness();
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/sales/bootstrap")) return new Response(JSON.stringify(SALES), { status: 200 });
        return respondToBuildflowApi(input);
      })
    );
  });

  /* The Deals board is the page's default layout, so its card title is the opener there; the
     other two open from the name cell of their index table, whose label is "Open <name>". */
  const CASES = [
    { page: "Contacts", rowName: `Open ${LEAD.name}`, pageClass: ".contacts-page", title: LEAD.name },
    { page: "Companies", rowName: `Open ${COMPANY.name}`, pageClass: ".companies-page", title: COMPANY.name },
    { page: "Deals", rowName: DEAL.name, pageClass: ".deals-page", title: DEAL.name }
  ] as const;

  for (const record of CASES) {
    describe(record.page, () => {
      it("renders outside .bfm-page, the stacking context that would bury it", async () => {
        const { layer: panel } = await openRecord(record.page, record.rowName);
        /* EVERY .bfm-page, not the first one. PageSwap keeps the page you are leaving on screen
           beside the one arriving, so a `querySelector` here can hand back the outgoing clone —
           which contains nothing — and the assertion passes while the live page holds the panel. */
        const swaps = [...document.querySelectorAll(".bfm-page")];
        expect(swaps.length, "no page-swap wrapper on screen, so this test proves nothing").toBeGreaterThan(0);
        expect(
          swaps.some((swap) => swap.contains(panel)),
          "the record layer is inside .bfm-page again — z-index 95 cannot beat the top bar from in there"
        ).toBe(false);
      });

      it("renders outside its own page section too", async () => {
        const { layer: panel } = await openRecord(record.page, record.rowName);
        const hosts = [...document.querySelectorAll(record.pageClass)];
        expect(hosts.length, `no ${record.pageClass} on screen, so this test proves nothing`).toBeGreaterThan(0);
        expect(
          hosts.some((host) => host.contains(panel)),
          `the record layer is back inside ${record.pageClass}`
        ).toBe(false);
      });

      it("lands on <body>, which is the host skin section 23b writes its dark palette for", async () => {
        const { layer: panel } = await openRecord(record.page, record.rowName);
        /* `body:has(.app-shell…[data-bf-mode="dark"]) .hs-record-layer` is how the panel gets
           --bf-surface: #1b1b19 and --bf-ink: #f4f3f0 on a dark shell (measured in the running
           app). A host anywhere else is a different set of rules and has to be checked as one. */
        expect(panel.parentElement, "the record layer left document.body").toBe(document.body);
      });

      it("is the record the row asked for, and it claims the keyboard", async () => {
        const { layer: panel } = await openRecord(record.page, record.rowName);
        expect(panel.querySelector("h2")?.textContent).toBe(record.title);
        /* Not asserted here: that focus lands inside the panel on the commit it opens. It does —
           measured in the running app, `document.activeElement` is the panel's own back button —
           but useModalDialog keeps only controls with an `offsetParent`, and jsdom lays nothing
           out, so every one of them is filtered away and nothing is ever focused under this
           runner. What jsdom can still hold is the claim that makes focus the panel's to move. */
        const dialog = panel.querySelector('[role="dialog"]');
        expect(dialog, "the record panel is not a dialog any more").not.toBeNull();
        expect(dialog!.getAttribute("aria-modal")).toBe("true");
      });

      it("takes the layer with it when it closes", async () => {
        const { layer: panel } = await openRecord(record.page, record.rowName);
        fireEvent.click(panel.querySelector(".hs-record-back") as HTMLElement);
        await waitFor(() => expect(document.querySelector(".hs-record-layer")).toBeNull());
      });
    });
  }
});
