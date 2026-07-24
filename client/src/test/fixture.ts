import type { BootstrapPayload } from "@buildflow/shared";

export const bootstrapFixture: BootstrapPayload = {
  users: [
    { id: "u-matt", name: "Matt Johnson", role: "Project Manager", title: "Project Manager", avatar: "MJ" },
    { id: "u-carlos", name: "Carlos Ramirez", role: "Crew Lead", title: "Crew Lead - Crew 2", avatar: "CR" }
  ],
  activeUser: { id: "u-matt", name: "Matt Johnson", role: "Project Manager", title: "Project Manager", avatar: "MJ" },
  projects: [
    {
      id: "p-riverside",
      name: "Riverside Office Building",
      slug: "riverside-office",
      location: "Downtown, Austin, TX",
      address: "123 Riverfront Blvd, Austin, TX 78701",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-09-04",
      percentComplete: 62,
      scheduleHealth: "On Track",
      status: "In Progress",
      image: "office-building",
      latitude: 30.2672,
      longitude: -97.7431
    }
  ],
  phases: [
    {
      id: "phase-1",
      projectId: "p-riverside",
      name: "Foundation",
      status: "At Risk",
      percentComplete: 78,
      startDate: "2026-06-17",
      endDate: "2026-07-14",
      color: "#1976d2",
      sequence: 1
    }
  ],
  jobs: [
    {
      id: "j-riverside-concrete",
      projectId: "p-riverside",
      name: "Riverside Office Building",
      phase: "Concrete - Level 3 Slab",
      location: "Downtown, Austin",
      startDate: "2026-06-15",
      endDate: "2026-06-17",
      startTime: "7:00 AM",
      endTime: "3:30 PM",
      requiredLabor: 8,
      requiredEquipment: "Concrete Pump",
      materialsStatus: "Delivered",
      status: "Confirmed",
      priority: "High",
      notes: "Slab pour.",
      percentComplete: 0
    },
    {
      id: "j-unassigned",
      projectId: "p-riverside",
      name: "Downtown Retail Buildout",
      phase: "Interior Finishes",
      location: "Downtown, Austin",
      startDate: "2026-06-16",
      endDate: "2026-06-17",
      startTime: "8:00 AM",
      endTime: "2:00 PM",
      requiredLabor: 4,
      requiredEquipment: "Scissor Lift",
      materialsStatus: "Delivered",
      status: "Planned",
      priority: "Normal",
      notes: "Tenant improvement finish package.",
      percentComplete: 0
    }
  ],
  crews: [
    {
      id: "crew-concrete",
      name: "Concrete Crew 1",
      specialty: "Concrete",
      lead: "Mike Johnson",
      size: 8,
      capacity: 40,
      utilization: 80,
      icon: "cement-truck",
      status: "Scheduled",
      laborMix: [
        { category: "Labor", role: "Finishers", count: 4 },
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Pump Operator", count: 1 }
      ]
    }
  ],
  equipment: [
    { id: "eq-pump", name: "Concrete Pump #2", type: "Pump", status: "In Use", assignedTo: "p-riverside" }
  ],
  materials: [
    {
      id: "mat-concrete",
      projectId: "p-riverside",
      name: "Ready Mix Concrete",
      status: "Ready",
      deliveryDate: "2026-06-16",
      quantity: "120 yd3"
    }
  ],
  assignments: [
    {
      id: "as-1",
      jobId: "j-riverside-concrete",
      crewId: "crew-concrete",
      date: "2026-06-15",
      status: "Confirmed",
      conflicts: []
    }
  ],
  dependencies: [],
  variances: [],
  fieldUpdates: [
    {
      id: "fu-1",
      projectId: "p-riverside",
      jobId: "j-riverside-concrete",
      userId: "u-carlos",
      message: "Steel framing installation progressing.",
      status: "On Site",
      createdAt: "2026-06-16T09:18:00.000Z",
      photos: []
    }
  ],
  delayIQs: [
    {
      id: "delayIQ-rain",
      projectId: "p-riverside",
      category: "Weather",
      title: "Heavy Rain DelayIQ",
      impactDays: 4,
      severity: "Medium",
      status: "Monitoring",
      reportedAt: "2026-06-12",
      description: "Site prep slowed by rain."
    }
  ],
  readiness: [
    { id: "ready-1", projectId: "p-riverside", label: "Contract Signed", complete: true, dueDate: "2026-03-12" }
  ],
  inspections: [
    {
      id: "insp-1",
      projectId: "p-riverside",
      title: "Foundation Inspection",
      scheduledAt: "2026-06-23T10:00:00.000Z",
      status: "Upcoming"
    }
  ],
  weatherAlerts: [
    {
      id: "wa-1",
      projectId: "p-riverside",
      title: "Heavy rain expected",
      details: "Rain and gusts.",
      severity: "Medium",
      startsAt: "2026-06-18T12:00:00.000Z"
    }
  ]
};
