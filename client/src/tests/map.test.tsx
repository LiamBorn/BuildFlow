import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, openAppPage, respondToBuildflowApi, state } from "../test/appHarness";

// Map & Field Ops since 2026-09-06: the embedded dispatch map is gone. "Live Map" is a
// grid of expandable job-site cards (one per project, with its job count, status and
// coordinates), beside the Field Updates list and the surviving route tools (trucker
// destination autocomplete + traffic routing, route optimization).
//
// The page is an add-on: it only opens when "map-field-ops" is in the workspace's
// selected products (or the plan includes it), so each test unlocks it up front.

const MAP_ADD_ON = "map-field-ops";

function unlockMapAddOn() {
  window.localStorage.setItem("buildflow.selectedProducts", JSON.stringify([MAP_ADD_ON]));
}

/** Sign in, dismiss a tutorial if one starts, and open Map & Field Ops from the Field hub. */
async function openMap() {
  await enterDashboard();
  const skipTutorial = screen.queryByRole("button", { name: "Skip Tutorial" });
  if (skipTutorial) fireEvent.click(skipTutorial);
  await openAppPage("Map & Field Ops");
  await screen.findByRole("heading", { name: "Job sites" });
}

/** Answer Nominatim (geocode + autocomplete) and OSRM (routing); everything else is BuildFlow's API. */
function stubThirdPartyFetches({
  suggestions,
  onAddressSearch,
  onRoute
}: {
  suggestions: Array<Record<string, unknown>>;
  onAddressSearch?: () => void;
  onRoute?: () => void;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        onAddressSearch?.();
        return new Response(JSON.stringify(suggestions), { status: 200 });
      }
      if (url.includes("router.project-osrm.org")) {
        onRoute?.();
        return new Response(
          JSON.stringify({
            routes: [
              {
                distance: 8046.7,
                duration: 900,
                geometry: {
                  coordinates: [
                    [-97.7431, 30.2672],
                    [-97.742, 30.2685]
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    })
  );
}

const OLD_FERRY_ROAD = {
  display_name: "1 Old Ferry Road, Bristol, Rhode Island, 02809, United States",
  lat: "41.6712",
  lon: "-71.2662",
  address: {
    house_number: "1",
    road: "Old Ferry Road",
    city: "Bristol",
    state: "Rhode Island",
    postcode: "02809",
    country: "United States"
  }
};
const OLD_FARM_ROAD = {
  display_name: "1 Old Farm Road, Berkley, Massachusetts, 02779, United States",
  lat: "41.8501",
  lon: "-71.0851",
  address: {
    house_number: "1",
    road: "Old Farm Road",
    town: "Berkley",
    state: "Massachusetts",
    postcode: "02779",
    country: "United States"
  }
};

describe("Map & Field Ops", () => {
  installAppHarness();

  it("prompts for the Map & Field Ops add-on when the workspace has not unlocked it", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Map & Field Ops");

    // The page stays closed; the add-on prompt opens instead.
    const prompt = await screen.findByRole("dialog", { name: "Get Map & Field Ops" });
    expect(within(prompt).getByText(/Live vehicle and equipment locations, traffic routing/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job sites" })).not.toBeInTheDocument();

    fireEvent.click(within(prompt).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Get Map & Field Ops" })).not.toBeInTheDocument());
  });

  it("shows one expandable job-site card per project with its job count, status and coordinates", async () => {
    unlockMapAddOn();
    render(<App />);
    await openMap();

    // Header totals come from the sites in view and their (filtered) jobs.
    const sites = screen.getByRole("region", { name: "Job sites" });
    expect(within(sites).getByText(/1 site · 2 jobs in\s*view/)).toBeInTheDocument();
    expect(within(within(sites).getByLabelText("Site statuses")).getByText("In Progress")).toBeInTheDocument();

    // One card per project, named by the site and its job count.
    const card = within(sites).getByRole("button", { name: "Riverside Office Building, 2 jobs" });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(within(card).getByText("Downtown, Austin, TX · In Progress")).toBeInTheDocument();
    expect(within(card).getByText("Live")).toBeInTheDocument();
    expect(within(card).queryByText("30.2672° N, 97.7431° W")).not.toBeInTheDocument();

    // Expanding the card reveals the site's coordinates; collapsing hides them again.
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(await within(card).findByText("30.2672° N, 97.7431° W")).toBeInTheDocument();

    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(within(card).queryByText("30.2672° N, 97.7431° W")).not.toBeInTheDocument());
  });

  it("recounts site jobs through the filters and empties the grid when nothing matches", async () => {
    unlockMapAddOn();
    render(<App />);
    await openMap();

    // Only the High-priority job is left at the site once the priority filter narrows the jobs.
    fireEvent.change(screen.getByLabelText("Priority filter"), { target: { value: "High" } });
    const sites = screen.getByRole("region", { name: "Job sites" });
    expect(await within(sites).findByRole("button", { name: "Riverside Office Building, 1 job" })).toBeInTheDocument();
    expect(within(sites).getByText(/1 site · 1 job in\s*view/)).toBeInTheDocument();

    // A status no job carries removes the site from the grid entirely.
    fireEvent.click(screen.getByRole("button", { name: "More Filters" }));
    fireEvent.change(await screen.findByLabelText("Status filter"), { target: { value: "Complete" } });
    expect(await within(sites).findByText("No sites match these filters.")).toBeInTheDocument();
    expect(within(sites).queryByRole("button", { name: /Riverside Office Building/ })).not.toBeInTheDocument();
    expect(within(sites).getByText(/0 sites · 0 jobs in\s*view/)).toBeInTheDocument();
  });

  it("lists field updates beside the sites and opens the update composer", async () => {
    unlockMapAddOn();
    state.bootstrapPayload = {
      ...bootstrapFixture,
      fieldUpdates: [
        ...bootstrapFixture.fieldUpdates,
        {
          id: "fu-2",
          projectId: "p-riverside",
          jobId: "j-unassigned",
          userId: "u-matt",
          message: "Tenant finish package staged on level 2.",
          status: "Ready",
          createdAt: "2026-06-16T11:05:00.000Z",
          photos: []
        }
      ]
    };
    render(<App />);
    await openMap();

    const panel = screen.getByRole("heading", { name: "Field Updates" }).closest("section") as HTMLElement;
    expect(panel).not.toBeNull();

    // Each update shows who posted it, the job it belongs to, its status and the note.
    const firstUpdate = within(panel).getByText("Steel framing installation progressing.").closest("article") as HTMLElement;
    expect(within(firstUpdate).getByText("Carlos Ramirez")).toBeInTheDocument();
    expect(within(firstUpdate).getByText("Teammate - Riverside Office Building")).toBeInTheDocument();
    expect(within(firstUpdate).getByText("On Site")).toBeInTheDocument();

    const secondUpdate = within(panel).getByText("Tenant finish package staged on level 2.").closest("article") as HTMLElement;
    expect(within(secondUpdate).getByText("Matt Johnson")).toBeInTheDocument();
    expect(within(secondUpdate).getByText("Owner - Downtown Retail Buildout")).toBeInTheDocument();

    // The add button toggles the note composer open, then reads as the save action.
    expect(within(panel).queryByLabelText("Update note")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Add Field Update" }));
    expect(within(panel).getByLabelText("Update note")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Save Field Update" })).toBeInTheDocument();
  });

  it("keeps the optimized plan and a truck route from clobbering each other", async () => {
    stubThirdPartyFetches({
      suggestions: [{ display_name: "500 Congress Ave, Austin, TX 78701", name: "500 Congress Ave", lat: "30.2685", lon: "-97.7420" }]
    });
    unlockMapAddOn();
    render(<App />);
    await openMap();

    // Stats are derived from the real geometry, not placeholders.
    expect(screen.queryByText("No route data yet")).not.toBeInTheDocument();
    const driveTimeLabel = screen.getByText("Estimated total drive time");
    const readDriveTime = () => driveTimeLabel.parentElement?.querySelector("strong")?.textContent ?? "";
    const fastestTime = readDriveTime();
    expect(fastestTime).toMatch(/\d/);
    expect(screen.getByText(/drive time vs current routes/)).toBeInTheDocument();

    // The optimization goal actually moves the numbers.
    fireEvent.click(screen.getByRole("button", { name: "Least Fuel" }));
    expect(await screen.findByText(/fuel burn vs current routes/)).toBeInTheDocument();
    expect(readDriveTime()).not.toEqual(fastestTime);

    // Persist the optimized plan.
    fireEvent.click(screen.getByRole("button", { name: "Optimize Routes" }));
    expect(await screen.findByRole("button", { name: "Optimized" })).toBeInTheDocument();

    // A truck route must coexist with the plan, not replace it.
    fireEvent.change(screen.getByLabelText("Trucker destination address"), { target: { value: "500 Congress Ave, Austin, TX" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Traffic Route" }));

    expect(await screen.findByText("Fastest truck route")).toBeInTheDocument();
    // This note only renders when the optimized plan survived alongside the truck route.
    expect(screen.getByText("Your optimized plan is saved underneath — clear this route to return to it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optimized" })).toBeInTheDocument();

    // Clearing the truck route drops it back to the preserved plan.
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    await waitFor(() => expect(screen.queryByText("Fastest truck route")).not.toBeInTheDocument());
    expect(screen.queryByText("Your optimized plan is saved underneath — clear this route to return to it.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optimized" })).toBeInTheDocument();
  });

  it("suggests trucker destination addresses as the user types", async () => {
    let nominatimCalls = 0;
    stubThirdPartyFetches({ suggestions: [OLD_FERRY_ROAD, OLD_FARM_ROAD], onAddressSearch: () => (nominatimCalls += 1) });
    unlockMapAddOn();
    render(<App />);
    await openMap();

    const input = screen.getByRole("combobox", { name: "Trucker destination address" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1 old" } });

    // The debounced autocomplete surfaces matching addresses with a two-line label.
    expect(await screen.findByText("1 Old Ferry Road")).toBeInTheDocument();
    expect(screen.getByText("Bristol, Rhode Island")).toBeInTheDocument();
    expect(screen.getByText("1 Old Farm Road")).toBeInTheDocument();
    expect(nominatimCalls).toBeGreaterThan(0);
    expect(input).toHaveAttribute("aria-expanded", "true");
    // (scoped to the suggestion listbox: the filter <select>s carry <option>s of their own)
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);

    // Choosing a suggestion fills the field and dismisses the list.
    fireEvent.click(screen.getByText("1 Old Ferry Road"));
    expect(input.value).toContain("1 Old Ferry Road");
    await waitFor(() => expect(screen.queryByText("1 Old Farm Road")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("routes to a picked suggestion without re-geocoding it", async () => {
    let addressSearchCalls = 0;
    let routingCalls = 0;
    stubThirdPartyFetches({
      suggestions: [OLD_FERRY_ROAD],
      onAddressSearch: () => (addressSearchCalls += 1),
      onRoute: () => (routingCalls += 1)
    });
    unlockMapAddOn();
    render(<App />);
    await openMap();

    const input = screen.getByRole("combobox", { name: "Trucker destination address" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1 Old Ferry" } });
    fireEvent.click(await screen.findByText("1 Old Ferry Road"));
    const searchesAfterPick = addressSearchCalls;

    fireEvent.click(screen.getByRole("button", { name: "Create Traffic Route" }));

    const card = (await screen.findByText("Fastest truck route")).closest("article") as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText("1 Old Ferry Road")).toBeInTheDocument();
    // The route starts from the selected job site (its name shortened for the card).
    expect(within(card).getByText("Riverside Office Bldg")).toBeInTheDocument();
    // The picked coordinates are reused, so no extra geocode lookup fires — only routing.
    expect(addressSearchCalls).toEqual(searchesAfterPick);
    expect(routingCalls).toBeGreaterThan(0);
  });
});
