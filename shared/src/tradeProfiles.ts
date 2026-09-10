/* ============================================================================
   tradeProfiles.ts — what BuildFlow becomes for each construction trade
   ----------------------------------------------------------------------------
   One profile per business type, shared by client and server so the picker,
   the seeded workspace, the runtime copy and the AI all describe the SAME
   trade the same way. The seed (server/businessProfiles.ts) reads phases,
   readiness checks and the weather rule from here; the client reads crew
   types, delayIQ categories, material units, AI starters and page copy.

   Adding a trade: add it to `businessTypeOptions` in index.ts, then the
   `Record<BusinessTypeId, …>` below fails to compile until a profile exists —
   the type system is the checklist.
   ========================================================================== */

import type { BusinessTypeId } from "./index";

export type TradeIcon =
  | "road"
  | "concrete"
  | "roof"
  | "gc"
  | "excavation"
  | "utilities"
  | "framing"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "masonry"
  | "drywall"
  | "landscaping"
  | "painting";

export type TradeTone = "blue" | "violet" | "green" | "teal" | "orange";

export type TradeProfile = {
  id: BusinessTypeId;
  label: string;
  /** One line under the name on the picker card. */
  tagline: string;
  /** One sentence for previews and the dashboard banner. */
  description: string;
  icon: TradeIcon;
  tone: TradeTone;
  /** The crews this trade actually fields — Schedule filter + crew defaults. */
  crewTypes: string[];
  /** Production phases in the order the work runs. */
  phases: string[];
  /** What has to be true before a crew rolls. */
  readinessChecks: string[];
  /** The ways THIS trade loses days — replaces a generic delay list. */
  delayIQCategories: string[];
  /** How this trade counts material, for quantity hints. */
  materialUnits: string[];
  /** The weather rule the trade plans around. */
  weather: { title: string; rule: string };
  /** Starter prompts for BuildFlow AI, in the trade's own language. */
  aiStarters: string[];
  /** What the AI should know about running this trade before it answers. */
  aiContext: string;
};

export const tradeProfiles: Record<BusinessTypeId, TradeProfile> = {
  Asphalt: {
    id: "Asphalt",
    label: "Asphalt",
    tagline: "Paving, milling and overlays",
    description: "Plan around plant slots, trucking cycles and the temperature window every lift depends on.",
    icon: "road",
    tone: "orange",
    crewTypes: ["Milling", "Asphalt Paving", "Compaction", "Lane Closures", "Pavement Markings"],
    phases: ["Traffic Control", "Milling", "Base Prep", "Tack Coat", "Binder Course", "Surface Course", "Compaction", "Striping"],
    readinessChecks: [
      "Lane closure permit",
      "Plant slot confirmed",
      "Trucking plan set",
      "Traffic control plan",
      "Weather window checked",
      "Density testing booked"
    ],
    delayIQCategories: [
      "Plant / trucking",
      "Temperature window",
      "Rain on pavement",
      "Lane closure permit",
      "Milling breakdown",
      "Density failure"
    ],
    materialUnits: ["tons", "gal", "sq yd", "lane-miles"],
    weather: {
      title: "Temperature window watch",
      rule: "Surface course needs dry pavement and air temperatures above 50 °F through compaction."
    },
    aiStarters: [
      "Is tomorrow's plant slot covered?",
      "Which lifts are at risk from the forecast?",
      "Are trucking cycles keeping up with the paver?",
      "What's still missing for the lane closure?"
    ],
    aiContext:
      "This workspace runs an asphalt paving business. Work moves in lifts (milling → tack → binder → surface → compaction → striping) and lives or dies on three things: the mix plant's load window, enough trucks to keep the paver moving without stopping, and a temperature/dry-pavement window for placement and compaction. Lane closures need permits and traffic control. Density testing signs off each lift. Speak in tons, lifts, plant slots, truck cycles and closure windows."
  },
  Concrete: {
    id: "Concrete",
    label: "Concrete",
    tagline: "Foundations, slabs and structure",
    description: "Sequence forms, rebar, inspections and pours so the truck line never waits on a signature.",
    icon: "concrete",
    tone: "blue",
    crewTypes: ["Formwork", "Rebar", "Pour", "Finishing", "Pump Support"],
    phases: ["Layout", "Formwork", "Rebar", "Embed Checks", "Pour", "Cure and Strip"],
    readinessChecks: [
      "Mix design approved",
      "Pump booked",
      "Rebar released",
      "Embeds checked",
      "Pour cards signed",
      "Cylinder testing booked"
    ],
    delayIQCategories: [
      "Ready-mix supply",
      "Pre-pour inspection",
      "Rebar / embed release",
      "Pump availability",
      "Heat or freeze",
      "Cylinder break failure"
    ],
    materialUnits: ["cy", "tons", "sq ft", "lf"],
    weather: {
      title: "Pour weather watch",
      rule: "Heat and wind shorten finishing time; freezing temperatures need blankets or a pour delay."
    },
    aiStarters: [
      "Are we ready to pour tomorrow?",
      "Which pours are waiting on inspection?",
      "Is the pump booked for the slab?",
      "Any rebar packages still not released?"
    ],
    aiContext:
      "This workspace runs a concrete contractor. Work moves layout → formwork → rebar → embed/pre-pour inspection → pour → cure and strip. A pour cannot start until the inspection is signed and the ready-mix and pump are booked; once trucks are rolling, spacing and weather (heat, wind, freeze) decide the finish. Cylinder breaks sign off strength before loading or stripping. Speak in cubic yards, pours, pump slots, inspection sign-offs and cure days."
  },
  Roofing: {
    id: "Roofing",
    label: "Roofing",
    tagline: "Tear-off, dry-in and membrane",
    description: "Never open a roof you can't close — every tear-off is planned against the dry-in window.",
    icon: "roof",
    tone: "teal",
    crewTypes: ["Tear-Off", "Dry-In", "Membrane", "Sheet Metal", "Service"],
    phases: ["Tear-Off", "Dry-In", "Insulation", "Membrane", "Flashing", "Punch"],
    readinessChecks: [
      "Fall protection staged",
      "Material loaded",
      "Tear-off dumpster set",
      "Deck scan complete",
      "Weather window checked",
      "Warranty detail approved"
    ],
    delayIQCategories: [
      "Rain / dry-in window",
      "Wind above lift limit",
      "Deck repair found",
      "Material loading",
      "Warranty detail",
      "Fall-protection setup"
    ],
    materialUnits: ["squares", "rolls", "boards", "lf"],
    weather: {
      title: "Rain window watch",
      rule: "Tear-off pauses if temporary dry-in can't be finished before rain; wind limits crane and hoist lifts."
    },
    aiStarters: [
      "Can we tear off tomorrow and still dry in?",
      "Which roofs are exposed if it rains?",
      "Is the membrane loaded for Harborview?",
      "Any deck repairs holding up dry-in?"
    ],
    aiContext:
      "This workspace runs a roofing contractor. Every day's plan is a bet against the weather: you only tear off what you can dry in before rain, and wind limits hoist and crane lifts. Work moves tear-off → dry-in → insulation → membrane → flashing → punch. Deck damage found during tear-off is the classic surprise. Fall protection has to be staged before anyone goes up. Speak in squares, dry-in windows, tear-off zones and rain days."
  },
  "General Contractor": {
    id: "General Contractor",
    label: "General Contractor",
    tagline: "Coordinating every trade on site",
    description: "Keep subcontractors sequenced, inspections booked and the owner walk on the calendar.",
    icon: "gc",
    tone: "blue",
    crewTypes: ["Supervision", "Carpentry", "Punch", "Logistics", "Safety"],
    phases: ["Mobilization", "Rough-In", "Inspections", "Finishes", "Punch", "Closeout"],
    readinessChecks: [
      "Submittals released",
      "Subcontractors confirmed",
      "Inspection calendar",
      "Access plan",
      "Material staging",
      "Owner walk scheduled"
    ],
    delayIQCategories: [
      "Trade coordination",
      "Inspection sequence",
      "Submittal / RFI",
      "Owner decision",
      "Site access / logistics",
      "Subcontractor no-show"
    ],
    materialUnits: ["units", "pallets", "lots", "each"],
    weather: {
      title: "Delivery access watch",
      rule: "Storms affect exterior deliveries and loading-dock access; exterior trades hold on lightning."
    },
    aiStarters: [
      "Which trades are stacked on the same area this week?",
      "What inspections are booked and what's blocking them?",
      "Any submittals holding a sub from starting?",
      "What's on the owner walk?"
    ],
    aiContext:
      "This workspace runs a general contractor coordinating subcontractors. The GC rarely self-performs the critical path; its job is sequence — releasing areas trade by trade (MEP rough-in before drywall, drywall before paint), keeping inspections booked in the right order, clearing submittals and RFIs before a sub mobilizes, and holding the owner to decisions. Speak in trade handoffs, area releases, inspection sequence, submittals and punch."
  },
  Excavation: {
    id: "Excavation",
    label: "Excavation",
    tagline: "Mass earthwork, trenching and haul-off",
    description: "Run cut-and-haul cycles against locates, erosion controls and whatever the ground turns out to be.",
    icon: "excavation",
    tone: "orange",
    crewTypes: ["Mass Earthwork", "Trenching", "Haul-Off", "Grade Check", "Backfill"],
    phases: ["Survey", "Clearing", "Mass Cut", "Haul-Off", "Trench", "Backfill"],
    readinessChecks: [
      "Locates complete",
      "Spoils route approved",
      "Erosion controls set",
      "Survey stakes checked",
      "Dump site confirmed",
      "Compaction testing booked"
    ],
    delayIQCategories: [
      "Wet subgrade",
      "Utility locate / strike",
      "Haul-road conditions",
      "Unsuitable soils",
      "Compaction test failure",
      "Dump site closure"
    ],
    materialUnits: ["cy", "loads", "tons", "lf"],
    weather: {
      title: "Rain and haul road watch",
      rule: "Soft haul roads slow truck cycles after overnight rain; wet subgrade needs a proof-roll before backfill."
    },
    aiStarters: [
      "Are locates clear for the trench run?",
      "How many haul cycles did we lose to the rain?",
      "Which areas are waiting on a proof-roll?",
      "Is the dump site confirmed for Thursday?"
    ],
    aiContext:
      "This workspace runs an excavation contractor. Production is measured in cubic yards moved and truck cycles per hour; the plan moves survey → clearing → mass cut → haul-off → trench → backfill and compaction. Nothing digs before locates clear, erosion controls are in, and the spoils route and dump site are confirmed. Rain turns haul roads to soup and wet subgrade fails proof-rolls. Speak in cubic yards, cycles, locates, proof-rolls and lifts of backfill."
  },
  Utilities: {
    id: "Utilities",
    label: "Utilities",
    tagline: "Water, storm, sewer and ductbank",
    description: "Open trench, lay pipe, tie in and test — with 811 locates and shutdown notices done first.",
    icon: "utilities",
    tone: "teal",
    crewTypes: ["Pipe", "Conduit", "Tie-In", "Testing", "Patch"],
    phases: ["Locates", "Trench", "Pipe / Conduit", "Tie-In", "Test", "Backfill"],
    readinessChecks: [
      "811 locates clear",
      "Shutdown notice sent",
      "Pipe delivered",
      "Testing kit staged",
      "Bypass plan ready",
      "Backfill source confirmed"
    ],
    delayIQCategories: [
      "Unmarked crossing",
      "Shutdown window",
      "Pressure test failure",
      "Trench water",
      "Pipe / fitting delivery",
      "Traffic control"
    ],
    materialUnits: ["lf", "sticks", "each", "tons"],
    weather: {
      title: "Trench water watch",
      rule: "Rain may require pump-down before morning trench work; open trench is fenced and plated overnight."
    },
    aiStarters: [
      "Is the shutdown notice out for the tie-in?",
      "Which runs still have locates pending?",
      "Did the pressure test pass on Run 1?",
      "How much pipe is on site vs. planned?"
    ],
    aiContext:
      "This workspace runs a utility contractor installing water, storm, sewer and electrical ductbank. Work moves locates → trench → pipe/conduit → tie-in → test → backfill and patch. The tie-in is the choke point: it needs a shutdown window agreed with the owner, a bypass plan and everyone on site the same morning. Unmarked crossings found while digging are the classic delay, and a failed pressure test reopens finished work. Speak in linear feet, runs, tie-ins, shutdown windows and test results."
  },
  Framing: {
    id: "Framing",
    label: "Framing",
    tagline: "Walls, floors, shear and hardware",
    description: "Stand walls, deck floors and nail off shear on a lumber drop and inspection rhythm.",
    icon: "framing",
    tone: "orange",
    crewTypes: ["Wall Framing", "Decking", "Shear Wall", "Hardware", "Punch"],
    phases: ["Layout", "Wall Panels", "Decking", "Shear", "Hardware", "Inspection"],
    readinessChecks: [
      "Lumber drop complete",
      "Layout approved",
      "Hardware released",
      "Lift reserved",
      "Shear schedule set",
      "Inspection booked"
    ],
    delayIQCategories: [
      "Lumber / panel delivery",
      "Hardware release",
      "Framing inspection",
      "Wind on lifts",
      "Layout / RFI",
      "Crane or lift availability"
    ],
    materialUnits: ["studs", "sheets", "lf", "bundles"],
    weather: {
      title: "Wind lift watch",
      rule: "High gusts pause exterior sheathing and boom-lift work; wet lumber stays stacked."
    },
    aiStarters: [
      "Is the lumber drop on site for Level 3?",
      "Which shear walls are waiting on hardware?",
      "When is the framing inspection booked?",
      "Any levels blocked by wind tomorrow?"
    ],
    aiContext:
      "This workspace runs a framing contractor. Production runs level by level: layout → wall panels → floor decking → shear nail-off → hardware → framing inspection. Crews stall when a lumber or panel drop is late, when hold-down hardware isn't released, or when the inspector hasn't signed the level below. Wind grounds boom lifts. Speak in levels, walls stood, sheets, hardware releases and inspection sign-offs."
  },
  Electrical: {
    id: "Electrical",
    label: "Electrical",
    tagline: "Rough-in, gear and energize",
    description: "Pull rough-in behind the framers and land the gear before the energize date slips.",
    icon: "electrical",
    tone: "violet",
    crewTypes: ["Underground", "Rough-In", "Panel", "Lighting", "Trim"],
    phases: ["Underground", "Rough-In", "Panel Set", "Trim", "Testing", "Energize"],
    readinessChecks: [
      "Sleeves laid out",
      "Panel release confirmed",
      "Lift reserved",
      "Fixture package checked",
      "Power shutdown scheduled",
      "Inspection booked"
    ],
    delayIQCategories: [
      "Switchgear lead time",
      "Rough inspection",
      "Area not released",
      "Utility / energize date",
      "Fixture package",
      "Shutdown window"
    ],
    materialUnits: ["ft", "each", "boxes", "panels"],
    weather: {
      title: "Exterior rough-in watch",
      rule: "Storms pause exterior conduit runs and rooftop equipment feeds; lightning clears lifts."
    },
    aiStarters: [
      "Is the switchgear still on track for energize?",
      "Which areas are released for rough-in?",
      "When's the rough inspection?",
      "Are the fixture packages checked in?"
    ],
    aiContext:
      "This workspace runs an electrical contractor. Work moves underground → rough-in → panel/gear set → trim → testing → energize. The long pole is always the gear: switchgear and panelboards have lead times measured in months, and the energize date depends on both the gear landing and the utility. Rough-in can only go into areas the framers have released and must pass inspection before it's covered. Speak in circuits, feeders, panel schedules, gear deliveries and the energize date."
  },
  Plumbing: {
    id: "Plumbing",
    label: "Plumbing",
    tagline: "Underground, top-out and fixtures",
    description: "Get underground in before the slab and top-out passed before the walls close.",
    icon: "plumbing",
    tone: "blue",
    crewTypes: ["Underground", "Top-Out", "Fixture", "Testing", "Service"],
    phases: ["Underground", "Top-Out", "Pressure Test", "Fixtures", "Trim", "Final"],
    readinessChecks: [
      "Sleeves approved",
      "Pipe delivered",
      "Test pump staged",
      "Fixture release checked",
      "Water shutdown scheduled",
      "Inspection booked"
    ],
    delayIQCategories: [
      "Pressure test retake",
      "Slab / area release",
      "Fixture delivery",
      "Inspection",
      "Water shutdown",
      "Wet underground"
    ],
    materialUnits: ["lf", "sticks", "each", "fixtures"],
    weather: {
      title: "Underground water watch",
      rule: "Wet trench conditions slow underground waste; pump-down before bedding pipe."
    },
    aiStarters: [
      "Is underground done before the slab pour?",
      "Which top-outs are waiting on a test?",
      "Are fixtures released for Riverside?",
      "When's the water shutdown scheduled?"
    ],
    aiContext:
      "This workspace runs a plumbing contractor. Work is gated by other trades: underground waste and water go in before the slab pours, top-out has to pass a pressure test before walls close, and fixtures wait on finished floors and walls. A failed test reopens work. Water shutdowns for tie-ins need the owner's notice. Speak in linear feet, top-outs, pressure tests, fixture counts and slab and wall release dates."
  },
  HVAC: {
    id: "HVAC",
    label: "HVAC",
    tagline: "Duct, equipment set and startup",
    description: "Hang duct behind the framers, set the units by crane and land startup before turnover.",
    icon: "hvac",
    tone: "teal",
    crewTypes: ["Duct", "Equipment Set", "Piping", "Controls", "TAB Support"],
    phases: ["Layout", "Duct", "Equipment Set", "Piping", "Controls", "Startup"],
    readinessChecks: [
      "Roof curb ready",
      "Crane booked",
      "Equipment released",
      "Duct sections staged",
      "Controls drawings approved",
      "Startup tech scheduled"
    ],
    delayIQCategories: [
      "Equipment delivery",
      "Crane pick / wind",
      "Roof curb not ready",
      "Controls drawings",
      "Startup tech availability",
      "Duct inspection"
    ],
    materialUnits: ["lbs", "lf", "units", "each"],
    weather: {
      title: "Crane wind watch",
      rule: "High winds cancel rooftop-unit crane picks; picks need a clear morning window."
    },
    aiStarters: [
      "Is the crane booked for the RTU set?",
      "Which units are delayed from the factory?",
      "Are the roof curbs ready?",
      "When is startup and balance scheduled?"
    ],
    aiContext:
      "This workspace runs a mechanical/HVAC contractor. Duct and piping rough in behind the framers; the visible milestone is equipment set — rooftop units and air handlers arriving on a truck and going up by crane in a wind-safe window onto curbs the roofer has to have ready. Controls and startup/test-and-balance close it out before turnover. Factory equipment delivery shifts are the classic delay. Speak in duct sections, units, crane picks, curbs and startup dates."
  },
  Masonry: {
    id: "Masonry",
    label: "Masonry",
    tagline: "Block, brick, grout and scaffold",
    description: "Lay block and brick off tagged scaffold with mortar, grout lifts and cold-weather protection planned.",
    icon: "masonry",
    tone: "orange",
    crewTypes: ["CMU", "Brick", "Scaffold", "Grout", "Cleanup"],
    phases: ["Layout", "Scaffold", "Block", "Brick", "Grout", "Clean Down"],
    readinessChecks: [
      "Scaffold tagged",
      "Block delivered",
      "Mortar silo set",
      "Lintels released",
      "Grout inspection booked",
      "Washdown area ready"
    ],
    delayIQCategories: [
      "Brick / block delivery",
      "Scaffold inspection",
      "Grout lift inspection",
      "Cold weather protection",
      "Lintel / steel release",
      "Mortar supply"
    ],
    materialUnits: ["block", "brick", "bags", "cy"],
    weather: {
      title: "Cold weather masonry watch",
      rule: "Fresh masonry needs protection below 40 °F; rain washes out fresh mortar joints."
    },
    aiStarters: [
      "Is the scaffold tagged for tomorrow?",
      "How much block is on site vs. this week's plan?",
      "Which walls are waiting on a grout inspection?",
      "Do we need cold-weather protection this week?"
    ],
    aiContext:
      "This workspace runs a masonry contractor. Crews lay CMU and brick veneer off scaffold that has to be inspected and tagged each day; grout goes in by lift with an inspection before each one. Production depends on block and brick deliveries staged where the wall is, mortar supply, and lintels/steel released on time. Cold and rain both stop the wall. Speak in block and brick counts, courses, grout lifts, scaffold tags and wall sections."
  },
  Drywall: {
    id: "Drywall",
    label: "Drywall",
    tagline: "Stud, hang, tape and finish",
    description: "Hang and finish behind rough-in, coat by coat, with humidity and area releases driving the pace.",
    icon: "drywall",
    tone: "violet",
    crewTypes: ["Metal Stud", "Board Hang", "Tape", "Texture", "Punch"],
    phases: ["Framing", "Board Hang", "Tape", "Texture", "Sand", "Punch"],
    readinessChecks: [
      "Board stocked",
      "Framing signed off",
      "Lift reserved",
      "Humidity checked",
      "Texture sample approved",
      "Punch list issued"
    ],
    delayIQCategories: [
      "Predecessor trade release",
      "Above-ceiling inspection",
      "Board delivery",
      "Humidity / dry time",
      "Texture sample",
      "Punch rework"
    ],
    materialUnits: ["sheets", "buckets", "lf", "boxes"],
    weather: {
      title: "Humidity drying watch",
      rule: "High humidity extends compound dry time between coats; heat in unconditioned space helps."
    },
    aiStarters: [
      "Which areas are released for board?",
      "What's the dry time looking like this week?",
      "Is the above-ceiling inspection done on Level 2?",
      "Is the texture sample approved?"
    ],
    aiContext:
      "This workspace runs a drywall contractor. Everything waits on release: an area can't be boarded until MEP rough-in and the above-ceiling inspection are done, and finishing runs coat by coat with dry time set by humidity. Work moves metal stud → hang → tape → texture → sand → punch. Late area releases from the GC and MEP trades are the classic delay. Speak in sheets, areas released, coats, dry days and punch."
  },
  Landscaping: {
    id: "Landscaping",
    label: "Landscaping",
    tagline: "Grading, irrigation and planting",
    description: "Grade, run irrigation and plant on nursery deliveries and a watering plan the heat can't beat.",
    icon: "landscaping",
    tone: "green",
    crewTypes: ["Irrigation", "Planting", "Hardscape", "Fine Grade", "Maintenance"],
    phases: ["Grading", "Irrigation", "Hardscape", "Planting", "Mulch", "Punch"],
    readinessChecks: [
      "Plant delivery confirmed",
      "Irrigation layout marked",
      "Soil amendment staged",
      "Water source checked",
      "Hardscape base ready",
      "Owner plant walk scheduled"
    ],
    delayIQCategories: [
      "Nursery substitution",
      "Irrigation pressure test",
      "Heat / watering",
      "Hardscape base",
      "Owner plant approval",
      "Plant delivery"
    ],
    materialUnits: ["plants", "cy", "pallets", "lf"],
    weather: {
      title: "Heat watering watch",
      rule: "High heat means morning planting only and extra watering cycles; frost stops planting."
    },
    aiStarters: [
      "Is the plant delivery confirmed for Thursday?",
      "Which beds are still waiting on irrigation?",
      "Did the owner approve the tree substitution?",
      "What's the watering plan for this heat?"
    ],
    aiContext:
      "This workspace runs a landscape contractor. Work moves fine grading → irrigation → hardscape → planting → mulch → punch. Plants are living inventory: nursery deliveries and substitutions need owner approval, and heat dictates morning-only planting with a watering plan. Irrigation has to pass a pressure test before beds close. Speak in plant counts, beds, zones, deliveries and watering cycles."
  },
  Painting: {
    id: "Painting",
    label: "Painting",
    tagline: "Prep, prime and coats",
    description: "Prep and coat the areas other trades release, with color approvals and cure time built in.",
    icon: "painting",
    tone: "violet",
    crewTypes: ["Prep", "Spray", "Roller", "Touch-Up", "Final Punch"],
    phases: ["Prep", "Prime", "First Coat", "Second Coat", "Touch-Up", "Final Walk"],
    readinessChecks: [
      "Color schedule approved",
      "Areas released",
      "Material tinted",
      "Ventilation set",
      "Lift reserved",
      "Punch tags issued"
    ],
    delayIQCategories: [
      "Area not released",
      "Color / mockup approval",
      "Drywall punch open",
      "Humidity / cure",
      "Exterior weather",
      "Touch-up rework"
    ],
    materialUnits: ["gal", "rolls", "cases", "each"],
    weather: {
      title: "Exterior coating weather watch",
      rule: "Exterior coatings need dry surfaces, low wind and temperatures above the product minimum through cure."
    },
    aiStarters: [
      "Which rooms are released for paint?",
      "Is the color schedule approved for Riverside?",
      "Any areas still waiting on drywall punch?",
      "Can we coat the exterior this week?"
    ],
    aiContext:
      "This workspace runs a painting contractor. Painters are last in line: rooms are only paintable once drywall punch closes and the area is released, colors have to be approved off a mockup, and each coat needs cure time that humidity stretches. Exterior work needs dry, calm, warm-enough weather through cure. Speak in rooms released, coats, gallons, mockup approvals and cure days."
  }
};

/** Profile lookup that tolerates the "" state before a trade is chosen. */
export function tradeProfileFor(businessType: BusinessTypeId | ""): TradeProfile | null {
  return businessType ? tradeProfiles[businessType] : null;
}
