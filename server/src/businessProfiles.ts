import type {
  BootstrapPayload,
  BusinessTypeId,
  Crew,
  Delay,
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
  phases: string[];
  jobs: string[];
  crews: Array<Pick<Crew, "name" | "specialty" | "lead" | "size" | "capacity" | "utilization" | "icon" | "status" | "laborMix">>;
  equipment: Array<Pick<Equipment, "name" | "type" | "status">>;
  materials: Array<Pick<Material, "name" | "status" | "quantity">>;
  readiness: string[];
  delay: Pick<Delay, "category" | "title" | "impactDays" | "severity" | "status" | "description">;
  inspectionTitles: [string, string, string];
  weather: Pick<WeatherAlert, "title" | "details" | "severity">;
};

const profileUsers: User[] = [
  { id: "u-matt", name: "Matt Johnson", role: "Project Manager", title: "Project Manager", avatar: "MJ" },
  { id: "u-jessica", name: "Jessica Lee", role: "Superintendent", title: "Superintendent", avatar: "JL" },
  { id: "u-carlos", name: "Carlos Ramirez", role: "Crew Lead", title: "Crew Lead", avatar: "CR" }
];

const phaseStatuses: Phase["status"][] = ["On Track", "On Track", "At Risk", "Not Started", "Not Started", "Delayed"];
const phaseColors = ["#16a34a", "#1976d2", "#f59e0b", "#0f4c81", "#7c3aed", "#ef4444"];
const jobStatuses: Job["status"][] = ["Confirmed", "Ready", "On Site", "Planned", "Delayed", "Ready to Start"];
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

function compactCrew(trade: string, name: string, specialty: string, lead: string, icon: string, utilization: number): TradeTemplate["crews"][number] {
  return {
    name,
    specialty,
    lead,
    size: 6,
    capacity: 40,
    utilization,
    icon,
    status: utilization > 84 ? "Overbooked" : utilization > 55 ? "Scheduled" : "Available",
    laborMix: [
      { category: "Labor", role: `${trade} Lead Hands`, count: 2 },
      { category: "Labor", role: `${trade} Laborers`, count: 2 },
      { category: "Operator", role: "Equipment Operator", count: 1 }
    ]
  };
}

function compactTemplate(
  trade: Exclude<BusinessTypeId, "Asphalt">,
  input: {
    projectType: string;
    projectNames: [string, string, string];
    locationPrefix: string;
    phases: string[];
    jobs: string[];
    crewSpecialties: [string, string, string, string, string];
    equipment: [string, string, string, string, string, string];
    materials: [string, string, string, string, string, string];
    readiness: [string, string, string, string, string, string];
    delayCategory: string;
    delayTitle: string;
    delayDescription: string;
    inspectionTitles: [string, string, string];
    weatherTitle: string;
    weatherDetails: string;
  }
): TradeTemplate {
  return {
    projectType: input.projectType,
    projectNames: input.projectNames,
    locationPrefix: input.locationPrefix,
    phases: input.phases,
    jobs: input.jobs,
    crews: input.crewSpecialties.map((specialty, index) =>
      compactCrew(trade, `${specialty} Crew ${index + 1}`, specialty, ["Sam Patel", "Dana Brooks", "Priya Patel", "Morgan Lee", "Anthony Russo"][index], ["users", "wrench", "truck", "hard-hat", "map"][index], [78, 64, 72, 46, 88][index])
    ),
    equipment: input.equipment.map((name, index) => ({
      name,
      type: name.replace(/ #?\d+$/g, ""),
      status: (index === 4 ? "Maintenance" : index < 3 ? "In Use" : "Available") as Equipment["status"]
    })),
    materials: input.materials.map((name, index) => ({
      name,
      status: (["Ready", "Ready", "Ordered", "Ready", "Missing", "Waiting on Delivery"] as Material["status"][])[index],
      quantity: ["18 loads", "42 units", "7 pallets", "260 ft", "Pending", "12 kits"][index]
    })),
    readiness: input.readiness,
    delay: {
      category: input.delayCategory,
      title: input.delayTitle,
      impactDays: 3,
      severity: "Medium",
      status: "Open",
      description: input.delayDescription
    },
    inspectionTitles: input.inspectionTitles,
    weather: {
      title: input.weatherTitle,
      details: input.weatherDetails,
      severity: "Medium"
    }
  };
}

const asphaltTemplate: TradeTemplate = {
  projectType: "Asphalt",
  projectNames: ["I-35 Asphalt Overlay", "Tech Ridge Parking Lot", "Riverside Road Resurface"],
  locationPrefix: "Asphalt production",
  phases: ["Traffic Control", "Milling", "Base Prep", "Tack Coat", "Binder Course", "Surface Course", "Compaction", "Striping"],
  jobs: ["Mainline Milling", "Aggregate Base Prep", "Tack Coat Application", "Binder Course Paving", "Surface Course Paving", "Final Compaction", "Layout and Striping"],
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
  readiness: ["Lane closure permit", "Plant slot confirmed", "Trucking plan set", "Traffic control plan", "Weather window checked", "Density testing booked"],
  delay: {
    category: "Plant / trucking",
    title: "Mix plant slot moved",
    impactDays: 2,
    severity: "High",
    status: "Open",
    description: "Binder and surface course work need resequencing after the asphalt plant moved the morning load window."
  },
  inspectionTitles: ["Density Testing", "Surface Smoothness Review", "Striping Layout Approval"],
  weather: {
    title: "Temperature window watch",
    details: "Surface course needs dry pavement and air temperatures above 50 degrees F through compaction.",
    severity: "Medium"
  }
};

const compactTemplates: Record<Exclude<BusinessTypeId, "Asphalt">, TradeTemplate> = {
  Concrete: compactTemplate("Concrete", {
    projectType: "Concrete",
    projectNames: ["Riverside Slab Package", "North Austin Foundation", "South Yard Tilt-Up Panels"],
    locationPrefix: "Concrete placement",
    phases: ["Layout", "Formwork", "Rebar", "Embed Checks", "Pour", "Cure and Strip"],
    jobs: ["Footing Layout", "Wall Formwork", "Rebar Placement", "Embed Inspection", "Slab Pour", "Cure and Strip Forms"],
    crewSpecialties: ["Formwork", "Rebar", "Pour", "Finishing", "Pump Support"],
    equipment: ["Concrete Pump #2", "Laser Screed #1", "Telehandler #3", "Vibrator Set #4", "Ride-On Trowel #5", "Rebar Bender #6"],
    materials: ["Ready Mix Concrete", "Rebar Package", "Anchor Bolts", "Cure Compound", "Vapor Barrier", "Expansion Joint"],
    readiness: ["Mix design approved", "Pump booked", "Rebar released", "Embeds checked", "Pour cards signed", "Cylinder testing booked"],
    delayCategory: "Concrete supply",
    delayTitle: "Ready mix truck spacing",
    delayDescription: "Truck spacing is wider than plan and may extend the slab pour window.",
    inspectionTitles: ["Rebar Inspection", "Embed Inspection", "Cylinder Break Review"],
    weatherTitle: "Pour weather watch",
    weatherDetails: "Heat and wind may shorten finishing time during afternoon pours."
  }),
  Roofing: compactTemplate("Roofing", {
    projectType: "Roofing",
    projectNames: ["Harborview Roof Replacement", "Tech Ridge TPO Install", "Riverside Leak Repair"],
    locationPrefix: "Roofing production",
    phases: ["Tear-Off", "Dry-In", "Insulation", "Membrane", "Flashing", "Punch"],
    jobs: ["Safety Setup", "Tear-Off Zone A", "Deck Repair", "Insulation Install", "Membrane Weld", "Flashing and Punch"],
    crewSpecialties: ["Tear-Off", "Dry-In", "Membrane", "Sheet Metal", "Service"],
    equipment: ["Roof Hoist #1", "Telehandler #2", "Safety Cart #3", "Welding Kit #4", "Dump Trailer #5", "Sheet Metal Brake #6"],
    materials: ["TPO Membrane", "ISO Insulation", "Fastener Buckets", "Flashing Metal", "Sealant Cases", "Walk Pads"],
    readiness: ["Fall protection staged", "Material loaded", "Tear-off dumpster set", "Deck scan complete", "Weather window checked", "Warranty detail approved"],
    delayCategory: "Weather",
    delayTitle: "Dry-in window at risk",
    delayDescription: "Forecasted rain may block tear-off until temporary dry-in is ready.",
    inspectionTitles: ["Deck Inspection", "Membrane Probe Test", "Final Roof Walk"],
    weatherTitle: "Rain window watch",
    weatherDetails: "Tear-off should pause if dry-in cannot be completed before afternoon showers."
  }),
  "General Contractor": compactTemplate("General Contractor", {
    projectType: "General Contractor",
    projectNames: ["Downtown Retail Buildout", "Riverside Office Renovation", "North Austin Shell Finish"],
    locationPrefix: "GC coordination",
    phases: ["Mobilization", "Rough-In", "Inspections", "Finishes", "Punch", "Closeout"],
    jobs: ["Mobilize Site", "Coordinate MEP Rough-In", "Frame and Drywall", "Inspection Walk", "Finish Sequence", "Punch List Push"],
    crewSpecialties: ["Supervision", "Carpentry", "Punch", "Logistics", "Safety"],
    equipment: ["Scissor Lift #2", "Forklift #3", "Job Box Set #4", "Temp Power Cart #5", "Cleanup Trailer #6", "Layout Laser #7"],
    materials: ["Framing Package", "Door Hardware", "Ceiling Tile", "Paint Kit", "Safety Supplies", "Closeout Labels"],
    readiness: ["Submittals released", "Subcontractors confirmed", "Inspection calendar", "Access plan", "Material staging", "Owner walk scheduled"],
    delayCategory: "Trade coordination",
    delayTitle: "Inspection sequence conflict",
    delayDescription: "MEP and framing inspections need resequencing before finishes can start.",
    inspectionTitles: ["Rough-In Inspection", "Above-Ceiling Inspection", "Substantial Completion Walk"],
    weatherTitle: "Delivery access watch",
    weatherDetails: "Morning storms may affect exterior deliveries and loading dock access."
  }),
  Excavation: compactTemplate("Excavation", {
    projectType: "Excavation",
    projectNames: ["Pinecrest Mass Excavation", "South Austin Detention Pond", "Riverside Utility Trench"],
    locationPrefix: "Excavation production",
    phases: ["Survey", "Clearing", "Mass Cut", "Haul-Off", "Trench", "Backfill"],
    jobs: ["Survey Stakes", "Clear and Grub", "Mass Cut Area A", "Load and Haul", "Utility Trench", "Backfill and Compact"],
    crewSpecialties: ["Mass Earthwork", "Trenching", "Haul-Off", "Grade Check", "Backfill"],
    equipment: ["Excavator 320", "Dozer D6", "Loader 938", "Haul Truck Fleet", "Plate Compactor", "Trench Box Set"],
    materials: ["Select Fill", "Bedding Stone", "Silt Fence", "Trench Plates", "Fuel Delivery", "Geotextile Fabric"],
    readiness: ["Locates complete", "Spoils route approved", "Erosion controls set", "Survey stakes checked", "Dump site confirmed", "Compaction testing booked"],
    delayCategory: "Site conditions",
    delayTitle: "Wet subgrade delay",
    delayDescription: "Wet subgrade needs drying and proof-roll approval before backfill.",
    inspectionTitles: ["Erosion Control Check", "Trench Safety Review", "Compaction Test"],
    weatherTitle: "Rain and haul road watch",
    weatherDetails: "Soft haul roads may slow truck cycles after overnight rain."
  }),
  Utilities: compactTemplate("Utilities", {
    projectType: "Utilities",
    projectNames: ["Riverside Water Main", "Tech Ridge Storm Line", "South Austin Electric Ductbank"],
    locationPrefix: "Utility production",
    phases: ["Locates", "Trench", "Pipe / Conduit", "Tie-In", "Test", "Backfill"],
    jobs: ["Utility Locates", "Open Trench Run 1", "Pipe Bedding", "Main Tie-In", "Pressure Test", "Backfill and Patch"],
    crewSpecialties: ["Pipe", "Conduit", "Tie-In", "Testing", "Patch"],
    equipment: ["Mini Excavator #1", "Vac Truck #2", "Fusion Machine #3", "Utility Truck #4", "Plate Compactor #5", "Generator #6"],
    materials: ["Ductile Pipe", "PVC Conduit", "Valve Box Set", "Bedding Stone", "Tracer Wire", "Patch Asphalt"],
    readiness: ["811 locates clear", "Shutdown notice sent", "Pipe delivered", "Testing kit staged", "Bypass plan ready", "Backfill source confirmed"],
    delayCategory: "Locate conflict",
    delayTitle: "Unknown crossing found",
    delayDescription: "Crew found an unmarked crossing and needs daylighting before tie-in.",
    inspectionTitles: ["Open Trench Inspection", "Pressure Test", "Patch Acceptance"],
    weatherTitle: "Trench water watch",
    weatherDetails: "Rain could require pump-down before morning trench work."
  }),
  Framing: compactTemplate("Framing", {
    projectType: "Framing",
    projectNames: ["Harborview Wood Frame", "Riverside Tenant Framing", "North Austin Podium Walls"],
    locationPrefix: "Framing production",
    phases: ["Layout", "Wall Panels", "Decking", "Shear", "Hardware", "Inspection"],
    jobs: ["Layout Lines", "Wall Panel Install", "Floor Decking", "Shear Wall Nail-Off", "Hardware Install", "Framing Inspection Prep"],
    crewSpecialties: ["Wall Framing", "Decking", "Shear Wall", "Hardware", "Punch"],
    equipment: ["Boom Lift #4", "Forklift #5", "Framing Saw Set", "Compressor Cart", "Material Rack", "Laser Layout Kit"],
    materials: ["Stud Packs", "Sheathing", "Hangars", "Anchor Hardware", "Nails and Fasteners", "Blocking Lumber"],
    readiness: ["Lumber drop complete", "Layout approved", "Hardware released", "Lift reserved", "Shear schedule set", "Inspection booked"],
    delayCategory: "Material",
    delayTitle: "Hardware release delay",
    delayDescription: "Hold-down hardware is late and may block shear wall close-in.",
    inspectionTitles: ["Framing Inspection", "Shear Wall Inspection", "Hardware Walk"],
    weatherTitle: "Wind lift watch",
    weatherDetails: "High gusts may pause exterior sheathing and boom lift work."
  }),
  Electrical: compactTemplate("Electrical", {
    projectType: "Electrical",
    projectNames: ["Riverside Electrical Rough-In", "Tech Ridge Service Upgrade", "Harborview Lighting Package"],
    locationPrefix: "Electrical production",
    phases: ["Underground", "Rough-In", "Panel Set", "Trim", "Testing", "Energize"],
    jobs: ["Underground Conduit", "Branch Rough-In", "Panel Set", "Lighting Rough-In", "Device Trim", "Megger Test and Energize"],
    crewSpecialties: ["Underground", "Rough-In", "Panel", "Lighting", "Trim"],
    equipment: ["Conduit Bender #1", "Scissor Lift #2", "Wire Tugger #3", "Gang Box #4", "Generator #5", "Megger Tester #6"],
    materials: ["EMT Conduit", "Copper Wire", "Panelboards", "Lighting Fixtures", "Device Boxes", "Switchgear"],
    readiness: ["Sleeves laid out", "Panel release confirmed", "Lift reserved", "Fixture package checked", "Power shutdown scheduled", "Inspection booked"],
    delayCategory: "Gear lead time",
    delayTitle: "Switchgear delivery risk",
    delayDescription: "Switchgear delivery is at risk and may affect energization sequence.",
    inspectionTitles: ["Underground Inspection", "Rough Electrical Inspection", "Final Electrical Inspection"],
    weatherTitle: "Exterior rough-in watch",
    weatherDetails: "Storms may pause exterior conduit and rooftop equipment feeds."
  }),
  Plumbing: compactTemplate("Plumbing", {
    projectType: "Plumbing",
    projectNames: ["Pinecrest Plumbing Rough-In", "Riverside Restroom Core", "Harborview Domestic Water"],
    locationPrefix: "Plumbing production",
    phases: ["Underground", "Top-Out", "Pressure Test", "Fixtures", "Trim", "Final"],
    jobs: ["Underground Waste", "Domestic Water Top-Out", "Sleeve Firestopping", "Pressure Test", "Fixture Set", "Trim and Final"],
    crewSpecialties: ["Underground", "Top-Out", "Fixture", "Testing", "Service"],
    equipment: ["Mini Excavator #1", "Pipe Threader #2", "Scissor Lift #3", "Fusion Kit #4", "Hydro Test Pump #5", "Material Cart #6"],
    materials: ["PVC Pipe", "Copper Pipe", "Fixture Carriers", "Valves", "Fixtures", "Firestop Kits"],
    readiness: ["Sleeves approved", "Pipe delivered", "Test pump staged", "Fixture release checked", "Water shutdown scheduled", "Inspection booked"],
    delayCategory: "Inspection",
    delayTitle: "Pressure test retake",
    delayDescription: "A pressure test retake may push fixture set work by one production day.",
    inspectionTitles: ["Underground Plumbing", "Top-Out Inspection", "Final Plumbing"],
    weatherTitle: "Underground water watch",
    weatherDetails: "Wet trench conditions may slow underground waste installation."
  }),
  HVAC: compactTemplate("HVAC", {
    projectType: "HVAC",
    projectNames: ["Tech Ridge Rooftop Units", "Riverside Duct Rough-In", "Pinecrest Mechanical Room"],
    locationPrefix: "HVAC production",
    phases: ["Layout", "Duct", "Equipment Set", "Piping", "Controls", "Startup"],
    jobs: ["Duct Layout", "Main Duct Install", "RTU Set", "Refrigerant Piping", "Controls Rough-In", "Startup and Balance"],
    crewSpecialties: ["Duct", "Equipment Set", "Piping", "Controls", "TAB Support"],
    equipment: ["Crane Slot #1", "Duct Lift #2", "Scissor Lift #3", "Vac Pump #4", "Welding Cart #5", "Balance Hood #6"],
    materials: ["Sheet Metal Duct", "RTUs", "Refrigerant Pipe", "VAV Boxes", "Controls Cable", "Grilles and Diffusers"],
    readiness: ["Roof curb ready", "Crane booked", "Equipment released", "Duct sections staged", "Controls drawings approved", "Startup tech scheduled"],
    delayCategory: "Equipment",
    delayTitle: "RTU delivery shift",
    delayDescription: "Rooftop unit delivery moved, requiring crane and duct tie-in resequencing.",
    inspectionTitles: ["Duct Inspection", "Equipment Set Review", "Startup Report"],
    weatherTitle: "Crane wind watch",
    weatherDetails: "High winds may affect rooftop unit crane picks."
  }),
  Masonry: compactTemplate("Masonry", {
    projectType: "Masonry",
    projectNames: ["Riverside Block Walls", "Harborview Brick Veneer", "Tech Ridge Screen Wall"],
    locationPrefix: "Masonry production",
    phases: ["Layout", "Scaffold", "Block", "Brick", "Grout", "Clean Down"],
    jobs: ["Wall Layout", "Scaffold Setup", "CMU Install", "Brick Veneer", "Grout Cells", "Clean and Seal"],
    crewSpecialties: ["CMU", "Brick", "Scaffold", "Grout", "Cleanup"],
    equipment: ["Masonry Scaffold #1", "Telehandler #2", "Mortar Mixer #3", "Grout Pump #4", "Saw Station #5", "Material Basket #6"],
    materials: ["CMU Block", "Face Brick", "Mortar", "Grout", "Lintels", "Wall Ties"],
    readiness: ["Scaffold tagged", "Block delivered", "Mortar silo set", "Lintels released", "Grout inspection booked", "Washdown area ready"],
    delayCategory: "Material staging",
    delayTitle: "Brick delivery split",
    delayDescription: "Brick delivery was split and the veneer crew needs resequencing.",
    inspectionTitles: ["Reinforcement Inspection", "Grout Lift Inspection", "Final Masonry Walk"],
    weatherTitle: "Cold weather masonry watch",
    weatherDetails: "Low overnight temperatures may require protection for fresh masonry."
  }),
  Drywall: compactTemplate("Drywall", {
    projectType: "Drywall",
    projectNames: ["Riverside Interior Buildout", "Harborview Unit Board", "Tech Ridge Corridor Finish"],
    locationPrefix: "Drywall production",
    phases: ["Framing", "Board Hang", "Tape", "Texture", "Sand", "Punch"],
    jobs: ["Metal Stud Layout", "Board Hang Area A", "Tape First Coat", "Texture Corridor", "Sand and Touch-Up", "Punch Units"],
    crewSpecialties: ["Metal Stud", "Board Hang", "Tape", "Texture", "Punch"],
    equipment: ["Drywall Lift #1", "Scissor Lift #2", "Texture Rig #3", "Material Cart #4", "Sanding Station #5", "Panel Hoist #6"],
    materials: ["Drywall Board", "Metal Studs", "Joint Compound", "Corner Bead", "Texture Mix", "Fasteners"],
    readiness: ["Board stocked", "Framing signed off", "Lift reserved", "Humidity checked", "Texture sample approved", "Punch list issued"],
    delayCategory: "Predecessor trade",
    delayTitle: "Rough-in wall release late",
    delayDescription: "MEP rough-in areas were released late and board hanging must be resequenced.",
    inspectionTitles: ["Framing Inspection", "Above-Ceiling Review", "Finish Level Walk"],
    weatherTitle: "Humidity drying watch",
    weatherDetails: "High humidity may extend compound dry times between coats."
  }),
  Landscaping: compactTemplate("Landscaping", {
    projectType: "Landscaping",
    projectNames: ["Riverside Streetscape", "Pinecrest Irrigation", "Tech Ridge Planting"],
    locationPrefix: "Landscape production",
    phases: ["Grading", "Irrigation", "Hardscape", "Planting", "Mulch", "Punch"],
    jobs: ["Fine Grade Beds", "Irrigation Mainline", "Paver Walk Prep", "Tree Planting", "Mulch Install", "Punch and Cleanup"],
    crewSpecialties: ["Irrigation", "Planting", "Hardscape", "Fine Grade", "Maintenance"],
    equipment: ["Skid Steer #1", "Mini Excavator #2", "Trencher #3", "Water Truck #4", "Plate Compactor #5", "Sod Roller #6"],
    materials: ["Plant Material", "Irrigation Pipe", "Pavers", "Topsoil", "Mulch", "Sod"],
    readiness: ["Plant delivery confirmed", "Irrigation layout marked", "Soil amendment staged", "Water source checked", "Hardscape base ready", "Owner plant walk scheduled"],
    delayCategory: "Nursery supply",
    delayTitle: "Tree delivery substitution",
    delayDescription: "Nursery substitution needs owner approval before the planting crew can finish.",
    inspectionTitles: ["Irrigation Pressure Test", "Planting Walk", "Final Landscape Punch"],
    weatherTitle: "Heat watering watch",
    weatherDetails: "High heat requires morning planting and extra watering cycles."
  }),
  Painting: compactTemplate("Painting", {
    projectType: "Painting",
    projectNames: ["Riverside Interior Paint", "Harborview Corridor Coatings", "Tech Ridge Exterior Repaint"],
    locationPrefix: "Painting production",
    phases: ["Prep", "Prime", "First Coat", "Second Coat", "Touch-Up", "Final Walk"],
    jobs: ["Mask and Prep", "Prime Walls", "First Coat Area A", "Second Coat Corridors", "Door Frame Touch-Up", "Final Punch Paint"],
    crewSpecialties: ["Prep", "Spray", "Roller", "Touch-Up", "Final Punch"],
    equipment: ["Airless Sprayer #1", "Scissor Lift #2", "Drying Fans #3", "Masking Station #4", "Pressure Washer #5", "Paint Cart #6"],
    materials: ["Primer", "Wall Paint", "Exterior Coating", "Masking Film", "Caulk", "Touch-Up Kits"],
    readiness: ["Color schedule approved", "Areas released", "Material tinted", "Ventilation set", "Lift reserved", "Punch tags issued"],
    delayCategory: "Area release",
    delayTitle: "Finish areas not released",
    delayDescription: "Several rooms are not ready for paint because drywall punch is still open.",
    inspectionTitles: ["Mockup Approval", "Coverage Review", "Final Paint Walk"],
    weatherTitle: "Exterior coating weather watch",
    weatherDetails: "Wind and humidity may affect exterior coating application."
  })
};

const templates: Record<BusinessTypeId, TradeTemplate> = {
  Asphalt: asphaltTemplate,
  ...compactTemplates
};

export function createBusinessProfile(businessType: BusinessTypeId): BootstrapPayload {
  const template = templates[businessType];
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
      scheduleHealth: (["On Track", "Monitor", "At Risk"] as Project["scheduleHealth"][])[index],
      status: (["In Progress", "Ready to Start", "Delayed"] as Project["status"][])[index],
      image: index === 0 ? "parking-garage" : index === 1 ? "warehouse" : "office-building",
      latitude,
      longitude
    };
  });

  const phases: Phase[] = projectIds.flatMap((projectId, projectIndex) =>
    template.phases.slice(0, 6).map((name, index) => ({
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
      notes: `${businessType} production task for ${phase.toLowerCase()} with crew, equipment, readiness, and material constraints tracked.`
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
    status: index === 2 ? "Delayed" : "On Site",
    createdAt: `2026-06-1${6 + index}T09:18:00.000Z`,
    photos: []
  }));

  const delays: Delay[] = [
    {
      id: `delay-${baseSlug}-primary`,
      projectId: projectIds[2],
      reportedAt: "2026-06-16",
      ...template.delay
    },
    {
      id: `delay-${baseSlug}-weather`,
      projectId: projectIds[0],
      category: "Weather",
      title: template.weather.title,
      impactDays: 1,
      severity: template.weather.severity,
      status: "Monitoring",
      reportedAt: "2026-06-15",
      description: template.weather.details
    }
  ];

  const readiness: ReadinessItem[] = projectIds.flatMap((projectId) =>
    template.readiness.map((label, index) => ({
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
      title: template.weather.title,
      details: template.weather.details,
      severity: template.weather.severity,
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
    fieldUpdates,
    delays,
    readiness,
    phases,
    inspections,
    weatherAlerts
  };
}
