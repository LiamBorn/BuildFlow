import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, openAppPage, respondToBuildflowApi, state } from "../test/appHarness";

/**
 * Map & Field Ops since 2026-09-22 (mapops/): the page stands on the Schedule pages' board —
 * the same title row, control row, panels and entrance — and its sections are the live map with
 * every site and machine on it, a "Needs attention" rail beside the map, ForecastIQ's read of
 * the weather at each site, the machine list, today's jobs, the field updates and the route tools.
 *
 * What is recorded here is what the page CLAIMS: where a machine is (its site), where it is going
 * (the next job elsewhere that asks for its kind), which jobs the weather touches and from which
 * source, and that the route tools kept their behaviour through the move. The map itself is
 * Leaflet, which needs a sized element jsdom cannot give it; the pins are also an accessible
 * list, and that list is what the tests press.
 *
 * The page is an add-on: it only opens when "map-field-ops" is in the workspace's selected
 * products (or the plan includes it), so each test unlocks it up front.
 */

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
  await screen.findByRole("heading", { name: "Every site, live." });
}

/* The fixture has one site, one machine and two jobs on it. A second site ten miles off with a
   job that asks for the pump is what gives the machine somewhere to GO. The clock under test is
   Tue 16 Jun 2026, noon (test/setup.ts). */
const HARBORVIEW = {
  ...bootstrapFixture.projects[0],
  id: "p-harborview",
  name: "Harborview Apartments",
  slug: "harborview-apartments",
  address: "Harbor District, Austin, TX",
  latitude: 30.4011,
  longitude: -97.7186
};
const POUR_AT_HARBORVIEW = {
  ...bootstrapFixture.jobs[0],
  id: "j-harborview-pour",
  projectId: "p-harborview",
  name: "Harborview Apartments",
  phase: "Concrete - Podium Slab",
  location: "Harbor District, Austin",
  startDate: "2026-06-17",
  endDate: "2026-06-17",
  startTime: "7:00 AM",
  requiredEquipment: "Concrete Pump",
  status: "Confirmed" as const
};

/** Answer Nominatim (geocode + autocomplete) and OSRM (routing); everything else is BuildFlow's API. */
function stubThirdPartyFetches({ suggestions, onAddressSearch, onRoute }: { suggestions: Array<Record<string, unknown>>; onAddressSearch?: () => void; onRoute?: () => void }) {
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
  address: { house_number: "1", road: "Old Ferry Road", city: "Bristol", state: "Rhode Island", postcode: "02809", country: "United States" }
};
const OLD_FARM_ROAD = {
  display_name: "1 Old Farm Road, Berkley, Massachusetts, 02779, United States",
  lat: "41.8501",
  lon: "-71.0851",
  address: { house_number: "1", road: "Old Farm Road", town: "Berkley", state: "Massachusetts", postcode: "02779", country: "United States" }
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
    expect(screen.queryByRole("heading", { name: "Every site, live." })).not.toBeInTheDocument();

    fireEvent.click(within(prompt).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Get Map & Field Ops" })).not.toBeInTheDocument());
  });

  it("stands on the Schedule pages' board, with every site and machine on the map", async () => {
    unlockMapAddOn();
    // no weather in this one: the fixture's alert sits at the edge of the 48-hour horizon, on which
    // side depends on the machine's time zone, and a pin wearing a hold would change its name
    state.bootstrapPayload = { ...bootstrapFixture, weatherAlerts: [] };
    render(<App />);
    await openMap();

    // the Schedule pages' host: the same board, the same title row, the same controls
    const page = document.querySelector(".map-ops-page") as HTMLElement;
    expect(page.classList.contains("sched-rx")).toBe(true);
    expect(page.querySelector(".dash-rx.hs-home.sched-board-host")).not.toBeNull();
    expect(page.querySelector(".schedule-title-row.dx-hero")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Customize/ })).toBeInTheDocument();
    expect(screen.getByText(/1 machine across 1 site\./)).toBeInTheDocument();

    // the sections, as panels on the board
    for (const title of ["Live map", "ForecastIQ · weather", "Equipment", "Today's field jobs", "Field updates", "Routes", "Job sites"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }

    // the map's pins, as a list: the site with its open jobs, and the machine on it
    const pins = screen.getByRole("list", { name: "Map pins" });
    expect(within(pins).getByRole("button", { name: "Riverside Office Building, 2 jobs" })).toBeInTheDocument();
    expect(within(pins).getByRole("button", { name: "Concrete Pump #2 at Riverside Office Building" })).toBeInTheDocument();

    // the status chips count the fleet: the pump is on its site
    const chips = screen.getByRole("group", { name: "Fleet status" });
    expect(within(chips).getByRole("button", { name: /On site/ })).toHaveTextContent("1");
    expect(within(chips).getByRole("button", { name: /Moving/ })).toHaveTextContent("0");
    expect(screen.getByText("1 of 1 machine placed")).toBeInTheDocument();
  });

  it("says where a machine is and, once picked, where it is going and by when", async () => {
    unlockMapAddOn();
    /* The pump is on the Riverside pour through Wednesday (the fixture); Harborview's pour is
       Thursday at seven, so it can get there once the slab is done. */
    state.bootstrapPayload = {
      ...bootstrapFixture,
      projects: [...bootstrapFixture.projects, HARBORVIEW],
      jobs: [...bootstrapFixture.jobs, { ...POUR_AT_HARBORVIEW, startDate: "2026-06-18", endDate: "2026-06-18" }],
      weatherAlerts: []
    };
    render(<App />);
    await openMap();

    // the Equipment section: the machine, its site, and the next place the schedule sends it
    const fleet = screen.getByRole("list", { name: "Machines" });
    const row = within(fleet).getByRole("button", { name: /Concrete Pump #2/ });
    expect(row).toHaveTextContent("Pump · Riverside Office Building");
    expect(row).toHaveTextContent("Harborview Apartments · Thu 7:00 AM");
    expect(row).toHaveAttribute("aria-pressed", "false");

    // no card until a machine is picked
    expect(screen.queryByRole("article", { name: /Concrete Pump #2: where it is/ })).not.toBeInTheDocument();

    fireEvent.click(row);
    const card = await screen.findByRole("article", { name: "Concrete Pump #2: where it is and where it is going" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByText("Riverside Office Building")).toBeInTheDocument();
    expect(within(card).getByText("Harborview Apartments")).toBeInTheDocument();
    expect(within(card).getByText("Needed by").nextElementSibling).toHaveTextContent("Thu 7:00 AM");
    // the drive is an estimate until a live route answers (the harness's stand-in OSRM does not)
    expect(within(card).getByText("Drive").nextElementSibling).toHaveTextContent(/\d+ min · \d+\.\d mi \(est\.\)/);
    // what needs it, what keeps it, and when to leave — once the slab is done, on time
    expect(within(card).getByText(/Concrete - Podium Slab at Harborview Apartments needs a pump in 2 days\. It is on Concrete - Level 3 Slab at Riverside Office Building through Wednesday\. Leaving by \d{1,2}:\d{2} (AM|PM) gets it there in time\./)).toBeInTheDocument();
    expect(within(card).getByText("On time")).toBeInTheDocument();

    // the pin list agrees, and pressing the machine there clears the pick
    const pins = screen.getByRole("list", { name: "Map pins" });
    const pin = within(pins).getByRole("button", { name: "Concrete Pump #2 at Riverside Office Building" });
    expect(pin).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pin);
    await waitFor(() => expect(screen.queryByRole("article", { name: /Concrete Pump #2: where it is/ })).not.toBeInTheDocument());
  });

  it("puts a late move first under Needs attention, and opens the machine's record from its card", async () => {
    // Equipment Tracking is an add-on of its own; without it the card's "Open in Equipment" would
    // open the add-on prompt rather than the page
    window.localStorage.setItem("buildflow.selectedProducts", JSON.stringify([MAP_ADD_ON, "equipment-tracking"]));
    // the pump is needed at Harborview two hours ago and is still on the Riverside pour
    state.bootstrapPayload = {
      ...bootstrapFixture,
      projects: [...bootstrapFixture.projects, HARBORVIEW],
      jobs: [...bootstrapFixture.jobs, { ...POUR_AT_HARBORVIEW, startDate: "2026-06-16", endDate: "2026-06-16", startTime: "10:00 AM" }]
    };
    render(<App />);
    await openMap();

    const rail = screen.getByRole("complementary", { name: "Needs attention" });
    const first = within(rail).getAllByRole("button")[0];
    expect(first).toHaveTextContent("Concrete Pump #2");
    expect(first).toHaveTextContent("Late");
    expect(first).toHaveTextContent(/Needed at Harborview Apartments 2h ago and still at Riverside Office Building on Concrete - Level 3 Slab\./);
    /* Still ON SITE, not moving: the Riverside pour keeps it through tomorrow. "Moving" is a
       machine with nothing keeping it; this one is late because something does. */
    const chips = screen.getByRole("group", { name: "Fleet status" });
    expect(within(chips).getByRole("button", { name: /On site/ })).toHaveTextContent("1");
    expect(within(chips).getByRole("button", { name: /Moving/ })).toHaveTextContent("0");

    fireEvent.click(first);
    const card = await screen.findByRole("article", { name: "Concrete Pump #2: where it is and where it is going" });
    expect(within(card).getByText("Late")).toBeInTheDocument();
    expect(within(card).getByText("Behind by").nextElementSibling).toHaveTextContent(/\d+ min/);
    expect(within(card).getByText(/It cannot get there in time from here/)).toBeInTheDocument();

    // "Open in Equipment" leaves for the Equipment index with this machine under the reader's eye
    fireEvent.click(within(card).getByRole("button", { name: "Open in Equipment" }));
    // the Equipment index (its own root class — the map page has an "Equipment" section heading too)
    await waitFor(() => expect(document.querySelector(".equip-rx")).not.toBeNull());
    // the route transition keeps the leaving page for its exit beat, inert and hidden, then drops it
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Every site, live." })).not.toBeInTheDocument());
  });

  it("reads the weather from the workspace's alerts when the forecast cannot be reached, and says so", async () => {
    unlockMapAddOn();
    // the harness answers every unknown URL with a 200 that is not a forecast: not clear skies
    state.bootstrapPayload = {
      ...bootstrapFixture,
      weatherAlerts: [{ id: "wa-1", projectId: "p-riverside", title: "Heavy rain expected", details: "1.25-2.00 in with gusts to 30 mph.", severity: "High", startsAt: "2026-06-17T06:00:00" }]
    };
    render(<App />);
    await openMap();

    expect(await screen.findByText("From your weather alerts — the forecast service could not be reached")).toBeInTheDocument();
    // both open jobs at Riverside run on the 17th, into the rain: the headline counts jobs, not blocks
    const headline = await screen.findByText(/jobs at weather risk in the next 48 hours/);
    await waitFor(() => expect(headline.previousElementSibling).toHaveTextContent("2"));
    const matrix = screen.getByRole("table", { name: "Weather risk by site and time" });
    expect(within(matrix).getAllByText("rain hold").length).toBeGreaterThan(0);
    expect(screen.getByText(/rain-outs likely/)).toHaveTextContent("2 rain-outs likely");

    // the site's pin wears the hold while Weather is on, and drops it when Weather is off
    const pins = screen.getByRole("list", { name: "Map pins" });
    expect(within(pins).getByRole("button", { name: "Riverside Office Building, 2 jobs, weather hold" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weather" }));
    expect(within(pins).getByRole("button", { name: "Riverside Office Building, 2 jobs" })).toBeInTheDocument();

    // the rail names the hold too
    const rail = screen.getByRole("complementary", { name: "Needs attention" });
    expect(within(rail).getByText("Weather hold")).toBeInTheDocument();
  });

  it("lists the field updates and sends the composer to the Field Updates page", async () => {
    unlockMapAddOn();
    state.bootstrapPayload = {
      ...bootstrapFixture,
      fieldUpdates: [
        ...bootstrapFixture.fieldUpdates,
        { id: "fu-2", projectId: "p-riverside", jobId: "j-unassigned", userId: "u-matt", message: "Tenant finish package staged on level 2.", status: "Ready", createdAt: "2026-06-16T11:05:00.000Z", photos: [] }
      ]
    };
    render(<App />);
    await openMap();

    const updates = screen.getByRole("list", { name: "Field updates" });
    const first = within(updates).getByText("Steel framing installation progressing.").closest("article") as HTMLElement;
    expect(within(first).getByText("Carlos Ramirez")).toBeInTheDocument();
    expect(within(first).getByText("Teammate - Riverside Office Building")).toBeInTheDocument();
    expect(within(first).getByText("On Site")).toBeInTheDocument();
    const second = within(updates).getByText("Tenant finish package staged on level 2.").closest("article") as HTMLElement;
    expect(within(second).getByText("Matt Johnson")).toBeInTheDocument();
    expect(within(second).getByText("Owner - Downtown Retail Buildout")).toBeInTheDocument();

    /* The old page's composer toggled a textarea whose "Save" saved nothing. The real composer
       lives on the Field Updates page, so that is where the button goes. */
    fireEvent.click(screen.getByRole("button", { name: "Add field update" }));
    expect(await screen.findByRole("heading", { name: "Field Updates" })).toBeInTheDocument();
  });

  it("keeps the optimized plan and a truck route from clobbering each other", async () => {
    stubThirdPartyFetches({ suggestions: [{ display_name: "500 Congress Ave, Austin, TX 78701", name: "500 Congress Ave", lat: "30.2685", lon: "-97.7420" }] });
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
    // and a truck route turns the Traffic layer on, so it is drawn
    expect(screen.getByRole("button", { name: "Traffic" })).toHaveAttribute("aria-pressed", "true");

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
    stubThirdPartyFetches({ suggestions: [OLD_FERRY_ROAD], onAddressSearch: () => (addressSearchCalls += 1), onRoute: () => (routingCalls += 1) });
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
