export type UserRole = "Project Manager" | "Superintendent" | "Crew Lead";

export const businessTypeOptions = [
  "Asphalt",
  "Concrete",
  "Roofing",
  "General Contractor",
  "Excavation",
  "Utilities",
  "Framing",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Masonry",
  "Drywall",
  "Landscaping",
  "Painting"
] as const;

export type BusinessTypeId = (typeof businessTypeOptions)[number];

export const onboardingProductOptions = [
  {
    id: "map-field-ops",
    label: "Map & Field Ops",
    description: "Track vehicles, equipment, and design traffic routes."
  },
  {
    id: "field-updates-delays",
    label: "Field Updates & Delays",
    description: "Capture crew updates, delay causes, photos, and recovery notes."
  },
  {
    id: "production-reports",
    label: "Production Reports",
    description: "Review backlog, schedule health, utilization, and weekly progress."
  },
  {
    id: "materials-readiness",
    label: "Materials Readiness",
    description: "Track delivery status and flag missing materials before dispatch."
  },
  {
    id: "equipment-tracking",
    label: "Equipment Tracking",
    description: "See equipment assignment, usage, and maintenance status."
  },
  {
    id: "crew-scheduling",
    label: "Crew Scheduling",
    description: "Plan crews by capacity, trade, day, and ready work."
  },
  {
    id: "schedule-ai",
    label: "Schedule AI",
    description: "Spot conflicts and turn blockers into recovery suggestions."
  }
] as const;

export type OnboardingProductId = (typeof onboardingProductOptions)[number]["id"];

export type User = {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  avatar: string;
};

export type Status =
  | "Not Started"
  | "Ready"
  | "Ready to Start"
  | "Planned"
  | "Confirmed"
  | "In Progress"
  | "On Site"
  | "Delayed"
  | "Complete"
  | "At Risk";

export type Project = {
  id: string;
  name: string;
  slug: string;
  location: string;
  address: string;
  type: string;
  contractType: string;
  managerId: string;
  targetCompletion: string;
  percentComplete: number;
  scheduleHealth: "On Track" | "Monitor" | "At Risk" | "Complete";
  status: Status;
  image: string;
  latitude: number;
  longitude: number;
};

export type UpdateProjectInput = Pick<
  Project,
  | "name"
  | "location"
  | "address"
  | "type"
  | "contractType"
  | "managerId"
  | "targetCompletion"
  | "percentComplete"
  | "status"
  | "scheduleHealth"
>;

export type CreateProjectInput = UpdateProjectInput;

export type Phase = {
  id: string;
  projectId: string;
  name: string;
  status: "On Track" | "At Risk" | "Delayed" | "Not Started";
  percentComplete: number;
  startDate: string;
  endDate: string;
  color: string;
  sequence: number;
};

export type Job = {
  id: string;
  projectId: string;
  name: string;
  phase: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  requiredLabor: number;
  requiredEquipment: string;
  materialsStatus: "Delivered" | "Ordered" | "Missing" | "Waiting on Delivery";
  status: Status;
  priority: "High" | "Medium" | "Normal";
  notes: string;
};

export type CreateJobInput = Omit<Job, "id">;

export type CrewRoleCategory = "Labor" | "Operator";

export type CrewLaborMixItem = {
  category: CrewRoleCategory;
  role: string;
  count: number;
};

export type CreateCrewInput = {
  name: string;
  specialty: string;
  foreman: string;
  laborMix: CrewLaborMixItem[];
};

export type UpdateCrewInput = CreateCrewInput;

export type Crew = {
  id: string;
  name: string;
  specialty: string;
  lead: string;
  size: number;
  capacity: number;
  utilization: number;
  icon: string;
  status: "Available" | "Scheduled" | "Overbooked";
  laborMix: CrewLaborMixItem[];
};

export type Equipment = {
  id: string;
  name: string;
  type: string;
  status: "Available" | "In Use" | "Maintenance";
  assignedTo?: string;
};

export type CreateEquipmentInput = Omit<Equipment, "id">;

export type UpdateEquipmentInput = CreateEquipmentInput;

export type Material = {
  id: string;
  projectId: string;
  name: string;
  status: "Ready" | "Ordered" | "Waiting on Delivery" | "Missing";
  deliveryDate: string;
  quantity: string;
};

export type CreateMaterialInput = Omit<Material, "id">;

export type ScheduleAssignment = {
  id: string;
  jobId: string;
  crewId: string;
  date: string;
  status: Status;
  conflicts: string[];
};

export type FieldUpdate = {
  id: string;
  projectId: string;
  jobId?: string;
  userId: string;
  message: string;
  status: Status;
  createdAt: string;
  photos: string[];
};

export type Delay = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  impactDays: number;
  severity: "Low" | "Medium" | "High";
  status: "Open" | "Monitoring" | "Resolved";
  reportedAt: string;
  description: string;
};

export type ReadinessItem = {
  id: string;
  projectId: string;
  label: string;
  complete: boolean;
  dueDate: string;
};

export type Inspection = {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string;
  status: "Upcoming" | "Ready" | "Complete";
};

export type WeatherAlert = {
  id: string;
  projectId?: string;
  title: string;
  details: string;
  severity: "Low" | "Medium" | "High";
  startsAt: string;
};

export type ResourcesPayload = {
  crews: Crew[];
  equipment: Equipment[];
  materials: Material[];
};

export type BootstrapPayload = {
  users: User[];
  activeUser: User;
  projects: Project[];
  jobs: Job[];
  crews: Crew[];
  equipment: Equipment[];
  materials: Material[];
  assignments: ScheduleAssignment[];
  fieldUpdates: FieldUpdate[];
  delays: Delay[];
  readiness: ReadinessItem[];
  phases: Phase[];
  inspections: Inspection[];
  weatherAlerts: WeatherAlert[];
};
