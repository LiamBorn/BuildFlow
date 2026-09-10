import { tradeProfiles } from "@buildflow/shared";
import type {
  BootstrapPayload,
  BusinessTypeId,
  Crew,
  DelayIQ,
  Equipment,
  FieldUpdate,
  Inspection,
  Job,
  Material,
  Phase,
  Project,
  ReadinessItem,
  ScheduleAssignment,
  User,
  WeatherAlert
} from "@buildflow/shared";

type TradeTemplate = {
  projectType: string;
  projectNames: [string, string, string];
  locationPrefix: string;
  jobs: string[];
  crews: Array<Pick<Crew, "name" | "specialty" | "lead" | "size" | "capacity" | "utilization" | "icon" | "status" | "laborMix">>;
  equipment: Array<Pick<Equipment, "name" | "type" | "status">>;
  materials: Array<Pick<Material, "name" | "status" | "quantity">>;
  delayIQ: Pick<DelayIQ, "category" | "title" | "impactDays" | "severity" | "status" | "description">;
  inspectionTitles: [string, string, string];
};

const profileUsers: User[] = [
  { id: "u-matt", name: "Matt Johnson", role: "Project Manager", title: "Project Manager", avatar: "MJ" },
  { id: "u-jessica", name: "Jessica Lee", role: "Superintendent", title: "Superintendent", avatar: "JL" },
  { id: "u-carlos", name: "Carlos Ramirez", role: "Crew Lead", title: "Crew Lead", avatar: "CR" }
];

const phaseStatuses: Phase["status"][] = ["On Track", "On Track", "At Risk", "Not Started", "Not Started", "DelayIQed"];
const phaseColors = ["#16a34a", "#1976d2", "#f59e0b", "#0f4c81", "#7c3aed", "#ef4444"];
const jobStatuses: Job["status"][] = ["Confirmed", "Ready", "On Site", "Planned", "DelayIQed", "Ready to Start"];
const materialStatuses: Job["materialsStatus"][] = ["Delivered", "Delivered", "Ordered", "Delivered", "Missing", "Waiting on Delivery"];
const materialDates = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20"];
const jobDates = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20"];
const locations = ["Downtown Austin", "North Austin", "South Austin"];
const addresses = [
  "123 Riverfront Blvd, Austin, TX 78701",
  "4800 Seton Center Pkwy, Austin, TX 78759",
  "6201 McKinney Falls Pkwy, Austin, TX 78744"
];
const coordinates = [
  [30.2672, -97.7431],
  [30.4011, -97.7479],
  [30.1837, -97.7211]
] as const;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type LaborMix = Crew["laborMix"];
/** [category, role, count] — terse so 13 trades × 5 crews stays readable. */
type MixSpec = Array<[Crew["laborMix"][number]["category"], string, number]>;
const mix = (spec: MixSpec): LaborMix => spec.map(([category, role, count]) => ({ category, role, count }));

function compactCrew(
  name: string,
  specialty: string,
  lead: string,
  icon: string,
  utilization: number,
  laborMix: LaborMix
): TradeTemplate["crews"][number] {
  return {
    name,
    specialty,
    lead,
    // headcount is the sum of the roles, not a fixed 6 — a two-tech testing
    // crew and a seven-hand paving crew should not read the same size
    size: laborMix.reduce((sum, item) => sum + item.count, 0),
    capacity: 40,
    utilization,
    icon,
    status: utilization > 84 ? "Overbooked" : utilization > 55 ? "Scheduled" : "Available",
    laborMix
  };
}

function compactTemplate(input: {
  projectType: string;
  projectNames: [string, string, string];
  locationPrefix: string;
  jobs: string[];
  crewSpecialties: [string, string, string, string, string];
  /** Real roles per crew, in crewSpecialties order — what the crew actually fields. */
  laborMixes: [MixSpec, MixSpec, MixSpec, MixSpec, MixSpec];
  equipment: [string, string, string, string, string, string];
  materials: [string, string, string, string, string, string];
  /** How the trade counts each material — tons, cy, squares, lf — not "42 units". */
  quantities: [string, string, string, string, string, string];
  delayIQCategory: string;
  delayIQTitle: string;
  delayIQDescription: string;
  inspectionTitles: [string, string, string];
}): TradeTemplate {
  return {
    projectType: input.projectType,
    projectNames: input.projectNames,
    locationPrefix: input.locationPrefix,
    jobs: input.jobs,
    crews: input.crewSpecialties.map((specialty, index) =>
      compactCrew(
        `${specialty} Crew ${index + 1}`,
        specialty,
        ["Sam Patel", "Dana Brooks", "Priya Patel", "Morgan Lee", "Anthony Russo"][index],
        ["users", "wrench", "truck", "hard-hat", "map"][index],
        [78, 64, 72, 46, 88][index],
        mix(input.laborMixes[index])
      )
    ),
    equipment: input.equipment.map((name, index) => ({
      name,
      type: name.replace(/ #?\d+$/g, ""),
      status: (index === 4 ? "Maintenance" : index < 3 ? "In Use" : "Available") as Equipment["status"]
    })),
    materials: input.materials.map((name, index) => ({
      name,
      status: (["Ready", "Ready", "Ordered", "Ready", "Missing", "Waiting on Delivery"] as Material["status"][])[index],
      quantity: input.quantities[index]
    })),
    delayIQ: {
      category: input.delayIQCategory,
      title: input.delayIQTitle,
      impactDays: 3,
      severity: "Medium",
      status: "Open",
      description: input.delayIQDescription
    },
    inspectionTitles: input.inspectionTitles
  };
}

const asphaltTemplate: TradeTemplate = {
  projectType: "Asphalt",
  projectNames: ["I-35 Asphalt Overlay", "Tech Ridge Parking Lot", "Riverside Road Resurface"],
  locationPrefix: "Asphalt production",
  jobs: [
    "Mainline Milling",
    "Aggregate Base Prep",
    "Tack Coat Application",
    "Binder Course Paving",
    "Surface Course Paving",
    "Final Compaction",
    "Layout and Striping"
  ],
  crews: [
    {
      name: "Milling Crew 1",
      specialty: "Milling",
      lead: "Sam Patel",
      size: 7,
      capacity: 40,
      utilization: 82,
      icon: "road",
      status: "Scheduled",
      laborMix: [
        { category: "Labor", role: "Ground Laborers", count: 3 },
        { category: "Operator", role: "Milling Machine Operator", count: 1 },
        { category: "Operator", role: "Skid Steer Operator", count: 1 },
        { category: "Labor", role: "Sweeper / Cleanup", count: 1 }
      ]
    },
    {
      name: "Paving Crew 2",
      specialty: "Asphalt Paving",
      lead: "Dana Brooks",
      size: 8,
      capacity: 44,
      utilization: 86,
      icon: "paver",
      status: "Overbooked",
      laborMix: [
        { category: "Labor", role: "Screed Hands", count: 2 },
        { category: "Labor", role: "Rakers", count: 3 },
        { category: "Operator", role: "Paver Operator", count: 1 },
        { category: "Operator", role: "Dump Person", count: 1 }
      ]
    },
    {
      name: "Roller Crew 3",
      specialty: "Compaction",
      lead: "Priya Patel",
      size: 5,
      capacity: 36,
      utilization: 74,
      icon: "roller",
      status: "Scheduled",
      laborMix: [
        { category: "Operator", role: "Breakdown Roller Operator", count: 1 },
        { category: "Operator", role: "Pneumatic Roller Operator", count: 1 },
        { category: "Operator", role: "Finish Roller Operator", count: 1 },
        { category: "Labor", role: "Density Tech Assistant", count: 1 }
      ]
    },
    {
      name: "Traffic Control Crew 4",
      specialty: "Lane Closures",
      lead: "Morgan Lee",
      size: 6,
      capacity: 32,
      utilization: 58,
      icon: "traffic-cone",
      status: "Available",
      laborMix: [
        { category: "Labor", role: "Flaggers", count: 3 },
        { category: "Labor", role: "Device Setup", count: 2 }
      ]
    },
    {
      name: "Striping Crew 5",
      specialty: "Pavement Markings",
      lead: "Anthony Russo",
      size: 4,
      capacity: 32,
      utilization: 48,
      icon: "paint",
      status: "Available",
      laborMix: [
        { category: "Labor", role: "Layout Techs", count: 2 },
        { category: "Operator", role: "Striping Truck Operator", count: 1 }
      ]
    }
  ],
  equipment: [
    { name: "Wirtgen Milling Machine #1", type: "Milling Machine", status: "In Use" },
    { name: "Vogele Asphalt Paver #3", type: "Asphalt Paver", status: "In Use" },
    { name: "Steel Double Drum Roller #2", type: "Double Drum Roller", status: "In Use" },
    { name: "Pneumatic Roller #5", type: "Pneumatic Roller", status: "Available" },
    { name: "Tack Distributor Truck #4", type: "Tack Distributor", status: "Maintenance" },
    { name: "Dump Truck Fleet A", type: "Dump Trucks", status: "Available" }
  ],
  materials: [
    { name: "HMA Surface Mix", status: "Ready", quantity: "420 tons" },
    { name: "Binder Mix", status: "Ready", quantity: "310 tons" },
    { name: "Aggregate Base", status: "Ordered", quantity: "680 tons" },
    { name: "Tack Oil", status: "Waiting on Delivery", quantity: "2,400 gal" },
    { name: "Striping Paint", status: "Ready", quantity: "140 gal" },
    { name: "Temporary Traffic Devices", status: "Missing", quantity: "48 cones / 12 barrels" }
  ],
  delayIQ: {
    category: "Plant / trucking",
    title: "Mix plant slot moved",
    impactDays: 2,
    severity: "High",
    status: "Open",
    description: "Binder and surface course work need resequencing after the asphalt plant moved the morning load window."
  },
  inspectionTitles: ["Density Testing", "Surface Smoothness Review", "Striping Layout Approval"]
};

const compactTemplates: Record<Exclude<BusinessTypeId, "Asphalt">, TradeTemplate> = {
  Concrete: compactTemplate({
    projectType: "Concrete",
    projectNames: ["Riverside Slab Package", "North Austin Foundation", "South Yard Tilt-Up Panels"],
    locationPrefix: "Concrete placement",
    jobs: ["Footing Layout", "Wall Formwork", "Rebar Placement", "Embed Inspection", "Slab Pour", "Cure and Strip Forms"],
    crewSpecialties: ["Formwork", "Rebar", "Pour", "Finishing", "Pump Support"],
    laborMixes: [
      [
        ["Labor", "Form Carpenters", 3],
        ["Labor", "Form Laborers", 2],
        ["Operator", "Telehandler Operator", 1]
      ],
      [
        ["Labor", "Rodbusters", 4],
        ["Labor", "Rebar Helpers", 1]
      ],
      [
        ["Labor", "Pour Hands", 3],
        ["Labor", "Vibrator Hands", 2],
        ["Operator", "Screed Operator", 1]
      ],
      [
        ["Labor", "Finishers", 3],
        ["Operator", "Trowel Machine Operator", 1]
      ],
      [
        ["Operator", "Pump Operator", 1],
        ["Labor", "Hose Hands", 2],
        ["Labor", "Washout / Cleanup", 1]
      ]
    ],
    equipment: ["Concrete Pump #2", "Laser Screed #1", "Telehandler #3", "Vibrator Set #4", "Ride-On Trowel #5", "Rebar Bender #6"],
    materials: ["Ready Mix Concrete", "Rebar Package", "Anchor Bolts", "Cure Compound", "Vapor Barrier", "Expansion Joint"],
    quantities: ["240 cy", "18 tons", "96 each", "40 gal", "12,000 sq ft", "600 lf"],
    delayIQCategory: "Concrete supply",
    delayIQTitle: "Ready mix truck spacing",
    delayIQDescription: "Truck spacing is wider than plan and may extend the slab pour window.",
    inspectionTitles: ["Rebar Inspection", "Embed Inspection", "Cylinder Break Review"]
  }),
  Roofing: compactTemplate({
    projectType: "Roofing",
    projectNames: ["Harborview Roof Replacement", "Tech Ridge TPO Install", "Riverside Leak Repair"],
    locationPrefix: "Roofing production",
    jobs: ["Safety Setup", "Tear-Off Zone A", "Deck Repair", "Insulation Install", "Membrane Weld", "Flashing and Punch"],
    crewSpecialties: ["Tear-Off", "Dry-In", "Membrane", "Sheet Metal", "Service"],
    laborMixes: [
      [
        ["Labor", "Tear-Off Laborers", 4],
        ["Labor", "Debris Chute Hand", 1],
        ["Operator", "Hoist Operator", 1]
      ],
      [
        ["Labor", "Roofers", 3],
        ["Labor", "Fastener Hands", 2]
      ],
      [
        ["Labor", "Membrane Installers", 3],
        ["Labor", "Welder / Seam Tech", 2]
      ],
      [
        ["Labor", "Sheet Metal Mechanics", 2],
        ["Labor", "Flashing Hands", 1]
      ],
      [["Labor", "Service Techs", 2]]
    ],
    equipment: ["Roof Hoist #1", "Telehandler #2", "Safety Cart #3", "Welding Kit #4", "Dump Trailer #5", "Sheet Metal Brake #6"],
    materials: ["TPO Membrane", "ISO Insulation", "Fastener Buckets", "Flashing Metal", "Sealant Cases", "Walk Pads"],
    quantities: ["180 squares", "320 boards", "24 buckets", "900 lf", "16 cases", "40 pads"],
    delayIQCategory: "Weather",
    delayIQTitle: "Dry-in window at risk",
    delayIQDescription: "ForecastIQ shows rain may block tear-off until temporary dry-in is ready.",
    inspectionTitles: ["Deck Inspection", "Membrane Probe Test", "Final Roof Walk"]
  }),
  "General Contractor": compactTemplate({
    projectType: "General Contractor",
    projectNames: ["Downtown Retail Buildout", "Riverside Office Renovation", "North Austin Shell Finish"],
    locationPrefix: "GC coordination",
    jobs: ["Mobilize Site", "Coordinate MEP Rough-In", "Frame and Drywall", "Inspection Walk", "Finish Sequence", "Punch List Push"],
    crewSpecialties: ["Supervision", "Carpentry", "Punch", "Logistics", "Safety"],
    laborMixes: [
      [
        ["Labor", "Superintendent", 1],
        ["Labor", "Assistant Super", 1],
        ["Labor", "Field Engineer", 1]
      ],
      [
        ["Labor", "Carpenters", 3],
        ["Labor", "Carpenter Helpers", 1]
      ],
      [
        ["Labor", "Punch Carpenters", 2],
        ["Labor", "Painter / Patch", 1]
      ],
      [
        ["Operator", "Forklift Operator", 1],
        ["Labor", "Material Handlers", 2]
      ],
      [
        ["Labor", "Safety Coordinator", 1],
        ["Labor", "Flaggers", 1]
      ]
    ],
    equipment: ["Scissor Lift #2", "Forklift #3", "Job Box Set #4", "Temp Power Cart #5", "Cleanup Trailer #6", "Layout Laser #7"],
    materials: ["Framing Package", "Door Hardware", "Ceiling Tile", "Paint Kit", "Safety Supplies", "Closeout Labels"],
    quantities: ["1 lot", "48 sets", "14 pallets", "60 gal", "8 cases", "1 lot"],
    delayIQCategory: "Trade coordination",
    delayIQTitle: "Inspection sequence conflict",
    delayIQDescription: "MEP and framing inspections need resequencing before finishes can start.",
    inspectionTitles: ["Rough-In Inspection", "Above-Ceiling Inspection", "Substantial Completion Walk"]
  }),
  Excavation: compactTemplate({
    projectType: "Excavation",
    projectNames: ["Pinecrest Mass Excavation", "South Austin Detention Pond", "Riverside Utility Trench"],
    locationPrefix: "Excavation production",
    jobs: ["Survey Stakes", "Clear and Grub", "Mass Cut Area A", "Load and Haul", "Utility Trench", "Backfill and Compact"],
    crewSpecialties: ["Mass Earthwork", "Trenching", "Haul-Off", "Grade Check", "Backfill"],
    laborMixes: [
      [
        ["Operator", "Excavator Operator", 1],
        ["Operator", "Dozer Operator", 1],
        ["Labor", "Spotters", 2]
      ],
      [
        ["Operator", "Excavator Operator", 1],
        ["Labor", "Pipe Laborers", 2],
        ["Labor", "Trench Safety Hand", 1]
      ],
      [
        ["Operator", "Loader Operator", 1],
        ["Operator", "Haul Truck Drivers", 4]
      ],
      [
        ["Labor", "Grade Checker", 1],
        ["Labor", "Survey Hand", 1]
      ],
      [
        ["Operator", "Compactor Operator", 1],
        ["Labor", "Backfill Laborers", 2]
      ]
    ],
    equipment: ["Excavator 320", "Dozer D6", "Loader 938", "Haul Truck Fleet", "Plate Compactor", "Trench Box Set"],
    materials: ["Select Fill", "Bedding Stone", "Silt Fence", "Trench Plates", "Fuel Delivery", "Geotextile Fabric"],
    quantities: ["1,800 cy", "220 tons", "1,400 lf", "10 each", "1,200 gal", "6 rolls"],
    delayIQCategory: "Site conditions",
    delayIQTitle: "Wet subgrade delayIQ",
    delayIQDescription: "Wet subgrade needs drying and proof-roll approval before backfill.",
    inspectionTitles: ["Erosion Control Check", "Trench Safety Review", "Compaction Test"]
  }),
  Utilities: compactTemplate({
    projectType: "Utilities",
    projectNames: ["Riverside Water Main", "Tech Ridge Storm Line", "South Austin Electric Ductbank"],
    locationPrefix: "Utility production",
    jobs: ["Utility Locates", "Open Trench Run 1", "Pipe Bedding", "Main Tie-In", "Pressure Test", "Backfill and Patch"],
    crewSpecialties: ["Pipe", "Conduit", "Tie-In", "Testing", "Patch"],
    laborMixes: [
      [
        ["Operator", "Excavator Operator", 1],
        ["Labor", "Pipe Layers", 2],
        ["Labor", "Top Man", 1]
      ],
      [
        ["Labor", "Conduit Installers", 2],
        ["Labor", "Duct Bank Hands", 2]
      ],
      [
        ["Labor", "Tie-In Mechanics", 2],
        ["Operator", "Vac Truck Operator", 1],
        ["Labor", "Valve Hand", 1]
      ],
      [["Labor", "Test Techs", 2]],
      [
        ["Labor", "Patch Crew", 2],
        ["Operator", "Plate Compactor Operator", 1]
      ]
    ],
    equipment: ["Mini Excavator #1", "Vac Truck #2", "Fusion Machine #3", "Utility Truck #4", "Plate Compactor #5", "Generator #6"],
    materials: ["Ductile Pipe", "PVC Conduit", "Valve Box Set", "Bedding Stone", "Tracer Wire", "Patch Asphalt"],
    quantities: ["1,200 lf", "60 sticks", "8 each", "140 tons", "1,500 ft", "22 tons"],
    delayIQCategory: "Locate conflict",
    delayIQTitle: "Unknown crossing found",
    delayIQDescription: "Crew found an unmarked crossing and needs daylighting before tie-in.",
    inspectionTitles: ["Open Trench Inspection", "Pressure Test", "Patch Acceptance"]
  }),
  Framing: compactTemplate({
    projectType: "Framing",
    projectNames: ["Harborview Wood Frame", "Riverside Tenant Framing", "North Austin Podium Walls"],
    locationPrefix: "Framing production",
    jobs: ["Layout Lines", "Wall Panel Install", "Floor Decking", "Shear Wall Nail-Off", "Hardware Install", "Framing Inspection Prep"],
    crewSpecialties: ["Wall Framing", "Decking", "Shear Wall", "Hardware", "Punch"],
    laborMixes: [
      [
        ["Labor", "Framers", 4],
        ["Labor", "Framing Helpers", 2]
      ],
      [
        ["Labor", "Deck Framers", 3],
        ["Operator", "Forklift Operator", 1]
      ],
      [["Labor", "Nail-Off Framers", 3]],
      [["Labor", "Hardware Installers", 2]],
      [["Labor", "Punch Framers", 2]]
    ],
    equipment: ["Boom Lift #4", "Forklift #5", "Framing Saw Set", "Compressor Cart", "Material Rack", "Laser Layout Kit"],
    materials: ["Stud Packs", "Sheathing", "Hangars", "Anchor Hardware", "Nails and Fasteners", "Blocking Lumber"],
    quantities: ["2,400 studs", "620 sheets", "380 each", "140 each", "30 boxes", "180 lf"],
    delayIQCategory: "Material",
    delayIQTitle: "Hardware release delayIQ",
    delayIQDescription: "Hold-down hardware is late and may block shear wall close-in.",
    inspectionTitles: ["Framing Inspection", "Shear Wall Inspection", "Hardware Walk"]
  }),
  Electrical: compactTemplate({
    projectType: "Electrical",
    projectNames: ["Riverside Electrical Rough-In", "Tech Ridge Service Upgrade", "Harborview Lighting Package"],
    locationPrefix: "Electrical production",
    jobs: ["Underground Conduit", "Branch Rough-In", "Panel Set", "Lighting Rough-In", "Device Trim", "Megger Test and Energize"],
    crewSpecialties: ["Underground", "Rough-In", "Panel", "Lighting", "Trim"],
    laborMixes: [
      [
        ["Labor", "Electricians", 2],
        ["Labor", "Apprentices", 2],
        ["Operator", "Mini Excavator Operator", 1]
      ],
      [
        ["Labor", "Journeyman Electricians", 3],
        ["Labor", "Apprentices", 2]
      ],
      [
        ["Labor", "Gear Electricians", 2],
        ["Labor", "Apprentice", 1]
      ],
      [
        ["Labor", "Lighting Electricians", 2],
        ["Labor", "Apprentice", 1],
        ["Operator", "Lift Operator", 1]
      ],
      [["Labor", "Trim Electricians", 2]]
    ],
    equipment: ["Conduit Bender #1", "Scissor Lift #2", "Wire Tugger #3", "Gang Box #4", "Generator #5", "Megger Tester #6"],
    materials: ["EMT Conduit", "Copper Wire", "Panelboards", "Lighting Fixtures", "Device Boxes", "Switchgear"],
    quantities: ["4,200 ft", "18,000 ft", "6 panels", "240 each", "36 boxes", "1 lineup"],
    delayIQCategory: "Gear lead time",
    delayIQTitle: "Switchgear delivery risk",
    delayIQDescription: "Switchgear delivery is at risk and may affect energization sequence.",
    inspectionTitles: ["Underground Inspection", "Rough Electrical Inspection", "Final Electrical Inspection"]
  }),
  Plumbing: compactTemplate({
    projectType: "Plumbing",
    projectNames: ["Pinecrest Plumbing Rough-In", "Riverside Restroom Core", "Harborview Domestic Water"],
    locationPrefix: "Plumbing production",
    jobs: ["Underground Waste", "Domestic Water Top-Out", "Sleeve Firestopping", "Pressure Test", "Fixture Set", "Trim and Final"],
    crewSpecialties: ["Underground", "Top-Out", "Fixture", "Testing", "Service"],
    laborMixes: [
      [
        ["Labor", "Plumbers", 2],
        ["Labor", "Apprentices", 1],
        ["Operator", "Mini Excavator Operator", 1]
      ],
      [
        ["Labor", "Journeyman Plumbers", 3],
        ["Labor", "Apprentices", 1]
      ],
      [
        ["Labor", "Fixture Setters", 2],
        ["Labor", "Apprentice", 1]
      ],
      [
        ["Labor", "Test Tech", 1],
        ["Labor", "Apprentice", 1]
      ],
      [["Labor", "Service Plumbers", 2]]
    ],
    equipment: ["Mini Excavator #1", "Pipe Threader #2", "Scissor Lift #3", "Fusion Kit #4", "Hydro Test Pump #5", "Material Cart #6"],
    materials: ["PVC Pipe", "Copper Pipe", "Fixture Carriers", "Valves", "Fixtures", "Firestop Kits"],
    quantities: ["1,600 lf", "900 lf", "42 each", "64 each", "88 fixtures", "20 kits"],
    delayIQCategory: "Inspection",
    delayIQTitle: "Pressure test retake",
    delayIQDescription: "A pressure test retake may push fixture set work by one production day.",
    inspectionTitles: ["Underground Plumbing", "Top-Out Inspection", "Final Plumbing"]
  }),
  HVAC: compactTemplate({
    projectType: "HVAC",
    projectNames: ["Tech Ridge Rooftop Units", "Riverside Duct Rough-In", "Pinecrest Mechanical Room"],
    locationPrefix: "HVAC production",
    jobs: ["Duct Layout", "Main Duct Install", "RTU Set", "Refrigerant Piping", "Controls Rough-In", "Startup and Balance"],
    crewSpecialties: ["Duct", "Equipment Set", "Piping", "Controls", "TAB Support"],
    laborMixes: [
      [
        ["Labor", "Sheet Metal Installers", 3],
        ["Labor", "Duct Helpers", 2]
      ],
      [
        ["Labor", "Rigging Mechanics", 2],
        ["Operator", "Crane Signal Person", 1],
        ["Labor", "Set Helpers", 2]
      ],
      [
        ["Labor", "Pipefitters", 2],
        ["Labor", "Brazers", 1]
      ],
      [["Labor", "Controls Techs", 2]],
      [
        ["Labor", "TAB Techs", 1],
        ["Labor", "Helper", 1]
      ]
    ],
    equipment: ["Crane Slot #1", "Duct Lift #2", "Scissor Lift #3", "Vac Pump #4", "Welding Cart #5", "Balance Hood #6"],
    materials: ["Sheet Metal Duct", "RTUs", "Refrigerant Pipe", "VAV Boxes", "Controls Cable", "Grilles and Diffusers"],
    quantities: ["9,500 lbs", "6 units", "1,100 lf", "28 each", "6,000 ft", "160 each"],
    delayIQCategory: "Equipment",
    delayIQTitle: "RTU delivery shift",
    delayIQDescription: "Rooftop unit delivery moved, requiring crane and duct tie-in resequencing.",
    inspectionTitles: ["Duct Inspection", "Equipment Set Review", "Startup Report"]
  }),
  Masonry: compactTemplate({
    projectType: "Masonry",
    projectNames: ["Riverside Block Walls", "Harborview Brick Veneer", "Tech Ridge Screen Wall"],
    locationPrefix: "Masonry production",
    jobs: ["Wall Layout", "Scaffold Setup", "CMU Install", "Brick Veneer", "Grout Cells", "Clean and Seal"],
    crewSpecialties: ["CMU", "Brick", "Scaffold", "Grout", "Cleanup"],
    laborMixes: [
      [
        ["Labor", "Block Masons", 4],
        ["Labor", "Mason Tenders", 3]
      ],
      [
        ["Labor", "Brick Masons", 3],
        ["Labor", "Mason Tenders", 2]
      ],
      [
        ["Labor", "Scaffold Erectors", 3],
        ["Operator", "Telehandler Operator", 1]
      ],
      [
        ["Labor", "Grout Hands", 2],
        ["Operator", "Grout Pump Operator", 1]
      ],
      [["Labor", "Washdown Laborers", 2]]
    ],
    equipment: ["Masonry Scaffold #1", "Telehandler #2", "Mortar Mixer #3", "Grout Pump #4", "Saw Station #5", "Material Basket #6"],
    materials: ["CMU Block", "Face Brick", "Mortar", "Grout", "Lintels", "Wall Ties"],
    quantities: ["9,600 block", "24,000 brick", "140 bags", "48 cy", "22 each", "6 boxes"],
    delayIQCategory: "Material staging",
    delayIQTitle: "Brick delivery split",
    delayIQDescription: "Brick delivery was split and the veneer crew needs resequencing.",
    inspectionTitles: ["Reinforcement Inspection", "Grout Lift Inspection", "Final Masonry Walk"]
  }),
  Drywall: compactTemplate({
    projectType: "Drywall",
    projectNames: ["Riverside Interior Buildout", "Harborview Unit Board", "Tech Ridge Corridor Finish"],
    locationPrefix: "Drywall production",
    jobs: ["Metal Stud Layout", "Board Hang Area A", "Tape First Coat", "Texture Corridor", "Sand and Touch-Up", "Punch Units"],
    crewSpecialties: ["Metal Stud", "Board Hang", "Tape", "Texture", "Punch"],
    laborMixes: [
      [
        ["Labor", "Stud Framers", 3],
        ["Labor", "Helpers", 1]
      ],
      [
        ["Labor", "Hangers", 4],
        ["Operator", "Panel Hoist Operator", 1]
      ],
      [
        ["Labor", "Tapers", 3],
        ["Labor", "Finishers", 1]
      ],
      [
        ["Labor", "Texture Sprayers", 2],
        ["Labor", "Masking Hand", 1]
      ],
      [["Labor", "Punch Finishers", 2]]
    ],
    equipment: ["Drywall Lift #1", "Scissor Lift #2", "Texture Rig #3", "Material Cart #4", "Sanding Station #5", "Panel Hoist #6"],
    materials: ["Drywall Board", "Metal Studs", "Joint Compound", "Corner Bead", "Texture Mix", "Fasteners"],
    quantities: ["1,400 sheets", "3,200 studs", "90 buckets", "2,200 lf", "40 bags", "24 boxes"],
    delayIQCategory: "Predecessor trade",
    delayIQTitle: "Rough-in wall release late",
    delayIQDescription: "MEP rough-in areas were released late and board hanging must be resequenced.",
    inspectionTitles: ["Framing Inspection", "Above-Ceiling Review", "Finish Level Walk"]
  }),
  Landscaping: compactTemplate({
    projectType: "Landscaping",
    projectNames: ["Riverside Streetscape", "Pinecrest Irrigation", "Tech Ridge Planting"],
    locationPrefix: "Landscape production",
    jobs: ["Fine Grade Beds", "Irrigation Mainline", "Paver Walk Prep", "Tree Planting", "Mulch Install", "Punch and Cleanup"],
    crewSpecialties: ["Irrigation", "Planting", "Hardscape", "Fine Grade", "Maintenance"],
    laborMixes: [
      [
        ["Labor", "Irrigation Techs", 2],
        ["Operator", "Trencher Operator", 1],
        ["Labor", "Laborers", 1]
      ],
      [
        ["Labor", "Planting Crew", 4],
        ["Labor", "Crew Lead", 1]
      ],
      [
        ["Labor", "Paver Installers", 3],
        ["Operator", "Skid Steer Operator", 1]
      ],
      [
        ["Operator", "Skid Steer Operator", 1],
        ["Labor", "Rake Hands", 2]
      ],
      [["Labor", "Maintenance Crew", 2]]
    ],
    equipment: ["Skid Steer #1", "Mini Excavator #2", "Trencher #3", "Water Truck #4", "Plate Compactor #5", "Sod Roller #6"],
    materials: ["Plant Material", "Irrigation Pipe", "Pavers", "Topsoil", "Mulch", "Sod"],
    quantities: ["640 plants", "3,800 lf", "14 pallets", "160 cy", "90 cy", "4,200 sq ft"],
    delayIQCategory: "Nursery supply",
    delayIQTitle: "Tree delivery substitution",
    delayIQDescription: "Nursery substitution needs owner approval before the planting crew can finish.",
    inspectionTitles: ["Irrigation Pressure Test", "Planting Walk", "Final Landscape Punch"]
  }),
  Painting: compactTemplate({
    projectType: "Painting",
    projectNames: ["Riverside Interior Paint", "Harborview Corridor Coatings", "Tech Ridge Exterior Repaint"],
    locationPrefix: "Painting production",
    jobs: ["Mask and Prep", "Prime Walls", "First Coat Area A", "Second Coat Corridors", "Door Frame Touch-Up", "Final Punch Paint"],
    crewSpecialties: ["Prep", "Spray", "Roller", "Touch-Up", "Final Punch"],
    laborMixes: [
      [
        ["Labor", "Prep Painters", 3],
        ["Labor", "Masking Hands", 1]
      ],
      [
        ["Labor", "Spray Painters", 2],
        ["Labor", "Backroller", 1],
        ["Operator", "Lift Operator", 1]
      ],
      [["Labor", "Roller Painters", 3]],
      [["Labor", "Touch-Up Painters", 2]],
      [["Labor", "Punch Painters", 2]]
    ],
    equipment: ["Airless Sprayer #1", "Scissor Lift #2", "Drying Fans #3", "Masking Station #4", "Pressure Washer #5", "Paint Cart #6"],
    materials: ["Primer", "Wall Paint", "Exterior Coating", "Masking Film", "Caulk", "Touch-Up Kits"],
    quantities: ["120 gal", "260 gal", "180 gal", "36 rolls", "14 cases", "20 kits"],
    delayIQCategory: "Area release",
    delayIQTitle: "Finish areas not released",
    delayIQDescription: "Several rooms are not ready for paint because drywall punch is still open.",
    inspectionTitles: ["Mockup Approval", "Coverage Review", "Final Paint Walk"]
  })
};

const templates: Record<BusinessTypeId, TradeTemplate> = {
  Asphalt: asphaltTemplate,
  ...compactTemplates
};

export function createBusinessProfile(businessType: BusinessTypeId): BootstrapPayload {
  const template = templates[businessType];
  // phases, readiness checks and the weather rule live on the shared trade
  // profile so the seeded workspace and the running app describe the trade
  // the same way
  const profile = tradeProfiles[businessType];
  const baseSlug = slugify(businessType);
  const projectIds = template.projectNames.map((_, index) => `p-${baseSlug}-${index + 1}`);
  const projects: Project[] = template.projectNames.map((name, index) => {
    const [latitude, longitude] = coordinates[index];
    return {
      id: projectIds[index],
      name,
      slug: slugify(name),
      location: `${template.locationPrefix}, ${locations[index]}`,
      address: addresses[index],
      type: template.projectType,
      contractType: ["Fixed Price", "GMP", "Unit Price"][index],
      managerId: index === 1 ? "u-jessica" : "u-matt",
      targetCompletion: ["2026-07-30", "2026-08-21", "2026-09-04"][index],
      percentComplete: [52, 24, 68][index],
      // Contract values so a brand-new account's portfolio band and backlog
      // report show dollars on day one instead of "not priced".
      value: [2_400_000, 1_150_000, 3_800_000][index],
      scheduleHealth: (["On Track", "Monitor", "At Risk"] as Project["scheduleHealth"][])[index],
      status: (["In Progress", "Ready to Start", "DelayIQed"] as Project["status"][])[index],
      image: index === 0 ? "parking-garage" : index === 1 ? "warehouse" : "office-building",
      latitude,
      longitude
    };
  });

  const phases: Phase[] = projectIds.flatMap((projectId, projectIndex) =>
    profile.phases.slice(0, 6).map((name, index) => ({
      id: `phase-${baseSlug}-${projectIndex + 1}-${slugify(name)}`,
      projectId,
      name,
      status: phaseStatuses[(index + projectIndex) % phaseStatuses.length],
      percentComplete: Math.max(0, 100 - index * 16 - projectIndex * 8),
      startDate: materialDates[Math.min(index, materialDates.length - 1)],
      endDate: materialDates[Math.min(index + 1, materialDates.length - 1)] ?? "2026-06-21",
      color: phaseColors[index % phaseColors.length],
      sequence: index + 1
    }))
  );

  const jobs: Job[] = template.jobs.slice(0, 7).map((phase, index) => {
    const projectIndex = index % projectIds.length;
    return {
      id: `job-${baseSlug}-${slugify(phase)}`,
      projectId: projectIds[projectIndex],
      name: template.projectNames[projectIndex],
      phase,
      location: locations[projectIndex],
      startDate: jobDates[Math.min(index, jobDates.length - 1)],
      endDate: jobDates[Math.min(index + (index === 0 ? 1 : 0), jobDates.length - 1)],
      startTime: index % 2 === 0 ? "7:00 AM" : "8:00 AM",
      endTime: index % 2 === 0 ? "3:30 PM" : "4:00 PM",
      requiredLabor: [7, 6, 5, 8, 6, 4, 5][index] ?? 5,
      requiredEquipment: template.equipment[index % template.equipment.length].type,
      materialsStatus: materialStatuses[index % materialStatuses.length],
      status: jobStatuses[index % jobStatuses.length],
      priority: (index === 0 || index === 3 ? "High" : index === 4 ? "Medium" : "Normal") as Job["priority"],
      notes: `${businessType} production task for ${phase.toLowerCase()} with crew, equipment, readiness, and material constraints tracked.`,
      // A generated workspace has no field history yet — progress starts at zero
      // and only the crew's own reports move it.
      percentComplete: 0
    };
  });

  const crews: Crew[] = template.crews.map((crew, index) => ({
    id: `crew-${baseSlug}-${index + 1}`,
    ...crew
  }));

  const equipment: Equipment[] = template.equipment.map((item, index) => ({
    id: `eq-${baseSlug}-${index + 1}`,
    ...item,
    assignedTo: index < 3 ? projectIds[index % projectIds.length] : undefined
  }));

  const materials: Material[] = template.materials.map((item, index) => ({
    id: `mat-${baseSlug}-${index + 1}`,
    projectId: projectIds[index % projectIds.length],
    name: item.name,
    status: item.status,
    deliveryDate: materialDates[index % materialDates.length],
    quantity: item.quantity
  }));

  const assignments: ScheduleAssignment[] = jobs.slice(0, 6).map((job, index) => ({
    id: `as-${baseSlug}-${index + 1}`,
    jobId: job.id,
    crewId: crews[index % crews.length].id,
    date: jobDates[index % jobDates.length],
    status: job.status,
    conflicts: index === 4 ? ["Missing materials"] : []
  }));

  const fieldUpdates: FieldUpdate[] = projects.map((project, index) => ({
    id: `fu-${baseSlug}-${index + 1}`,
    projectId: project.id,
    jobId: jobs[index]?.id,
    userId: index === 2 ? "u-jessica" : "u-carlos",
    message: `${businessType} crew update: ${jobs[index]?.phase ?? "production"} is ${index === 2 ? "waiting on readiness items" : "moving on schedule"}.`,
    status: index === 2 ? "DelayIQed" : "On Site",
    createdAt: `2026-06-1${6 + index}T09:18:00.000Z`,
    photos: []
  }));

  const delayIQs: DelayIQ[] = [
    {
      id: `delayIQ-${baseSlug}-primary`,
      projectId: projectIds[2],
      reportedAt: "2026-06-16",
      ...template.delayIQ
    },
    {
      id: `delayIQ-${baseSlug}-weather`,
      projectId: projectIds[0],
      category: "Weather",
      title: profile.weather.title,
      impactDays: 1,
      severity: "Medium",
      status: "Monitoring",
      reportedAt: "2026-06-15",
      description: profile.weather.rule
    }
  ];

  const readiness: ReadinessItem[] = projectIds.flatMap((projectId) =>
    profile.readinessChecks.map((label, index) => ({
      id: `ready-${projectId}-${index + 1}`,
      projectId,
      label,
      complete: index < 3,
      dueDate: index < 3 ? `2026-06-1${index + 2}` : "Pending"
    }))
  );

  const inspections: Inspection[] = template.inspectionTitles.map((title, index) => ({
    id: `insp-${baseSlug}-${index + 1}`,
    projectId: projectIds[index],
    title,
    scheduledAt: `2026-06-${23 + index}T10:00:00.000Z`,
    status: index === 0 ? "Ready" : "Upcoming"
  }));

  const weatherAlerts: WeatherAlert[] = [
    {
      id: `wa-${baseSlug}-1`,
      projectId: projectIds[0],
      title: profile.weather.title,
      details: profile.weather.rule,
      severity: "Medium",
      startsAt: "2026-06-18T12:00:00.000Z"
    }
  ];

  return {
    users: profileUsers,
    activeUser: profileUsers[0],
    projects,
    jobs,
    crews,
    equipment,
    materials,
    assignments,
    // Profile workspaces start with no precedence network; CPM links are added
    // as the plan is built out.
    dependencies: [],
    fieldUpdates,
    // No reports yet, so nothing has disagreed with the plan.
    variances: [],
    delayIQs,
    readiness,
    phases,
    inspections,
    weatherAlerts
  };
}
