/**
 * A small workspace for the inbox tests: two projects (one Liam manages, one Carlos does), four jobs
 * across the coming week, a crew booked on some of them, and one of everything waiting on someone.
 * "Today" is Saturday, September 26, 2026; the working week is Monday to Saturday.
 */
import type { BootstrapPayload, Job } from "../index";

export const TODAY = "2026-09-26";

const job = (fields: Partial<Job> & Pick<Job, "id" | "projectId" | "phase" | "startDate" | "endDate">): Job => ({
  name: fields.phase,
  location: "",
  startTime: "7:00 AM",
  endTime: "3:30 PM",
  requiredLabor: 4,
  requiredEquipment: "",
  materialsStatus: "Delivered",
  status: "Confirmed",
  priority: "Normal",
  notes: "",
  percentComplete: 0,
  ...fields
});

export const inboxData = (): BootstrapPayload => ({
  users: [
    { id: "u-liam", name: "Liam Santos", permission: "owner", title: "Owner", avatar: "LS" },
    { id: "u-carlos", name: "Carlos Ramirez", permission: "member", title: "Superintendent", avatar: "CR" },
    { id: "u-ana", name: "Ana Diaz", permission: "admin", title: "PM", avatar: "AD" }
  ],
  activeUser: { id: "u-liam", name: "Liam Santos", permission: "owner", title: "Owner", avatar: "LS" },
  projects: [
    {
      id: "p-maple",
      name: "Maple St. Plaza",
      slug: "maple",
      location: "",
      address: "",
      type: "",
      contractType: "",
      managerId: "u-liam",
      targetCompletion: "2026-12-01",
      percentComplete: 20,
      scheduleHealth: "On Track",
      status: "In Progress",
      image: "",
      latitude: 0,
      longitude: 0
    },
    {
      id: "p-oak",
      name: "Oak Ridge",
      slug: "oak",
      location: "",
      address: "",
      type: "",
      contractType: "",
      managerId: "u-carlos",
      targetCompletion: "2026-12-01",
      percentComplete: 40,
      scheduleHealth: "Monitor",
      status: "In Progress",
      image: "",
      latitude: 0,
      longitude: 0
    },
    {
      id: "p-harbor",
      name: "Harbor Point",
      slug: "harbor",
      location: "",
      address: "",
      type: "",
      contractType: "",
      managerId: "u-ana",
      targetCompletion: "2026-12-01",
      percentComplete: 5,
      scheduleHealth: "On Track",
      status: "Planned",
      image: "",
      latitude: 0,
      longitude: 0
    }
  ],
  phases: [],
  jobs: [
    job({ id: "j-footings", projectId: "p-maple", phase: "Footings pour", startDate: "2026-09-26", endDate: "2026-09-26" }),
    job({
      id: "j-framing",
      projectId: "p-oak",
      phase: "Framing, level 2",
      startDate: "2026-09-21",
      endDate: "2026-10-09",
      startTime: "7:30 AM",
      status: "In Progress"
    }),
    job({
      id: "j-grading",
      projectId: "p-harbor",
      phase: "Site grading",
      startDate: "2026-09-27",
      endDate: "2026-09-29",
      startTime: "6:30 AM",
      status: "Planned"
    }),
    job({
      id: "j-curbs",
      projectId: "p-maple",
      phase: "Curbs",
      startDate: "2026-09-30",
      endDate: "2026-10-01",
      startTime: "",
      endTime: "",
      status: "Planned"
    }),
    job({ id: "j-done", projectId: "p-maple", phase: "Survey", startDate: "2026-09-26", endDate: "2026-09-26", status: "Complete" }),
    job({ id: "j-later", projectId: "p-maple", phase: "Paving", startDate: "2026-10-05", endDate: "2026-10-09", status: "Planned" })
  ],
  crews: [
    {
      id: "c2",
      name: "Crew 2",
      specialty: "Concrete",
      lead: "",
      size: 6,
      capacity: 40,
      utilization: 50,
      icon: "",
      status: "Scheduled",
      laborMix: []
    },
    {
      id: "c4",
      name: "Crew 4",
      specialty: "Framing",
      lead: "",
      size: 6,
      capacity: 40,
      utilization: 50,
      icon: "",
      status: "Scheduled",
      laborMix: []
    }
  ],
  equipment: [{ id: "eq-1", name: "Pump", type: "Pump", status: "In Use", assignedTo: "p-maple" }],
  materials: [],
  assignments: [
    { id: "a1", jobId: "j-footings", crewId: "c2", date: "2026-09-26", status: "Confirmed", conflicts: [] },
    { id: "a2", jobId: "j-framing", crewId: "c4", date: "2026-09-26", status: "In Progress", conflicts: [] },
    { id: "a3", jobId: "j-framing", crewId: "c2", date: "2026-09-26", status: "In Progress", conflicts: [] },
    { id: "a4", jobId: "j-grading", crewId: "c2", date: "2026-09-28", status: "Planned", conflicts: [] },
    // an old booking, before the window: not the curbs' crew
    { id: "a0", jobId: "j-curbs", crewId: "c4", date: "2026-09-20", status: "Planned", conflicts: [] }
  ],
  dependencies: [],
  fieldUpdates: [],
  variances: [
    {
      id: "v-maple",
      projectId: "p-maple",
      jobId: "j-footings",
      fieldUpdateId: "fu-1",
      kind: "slip",
      severity: "High",
      status: "pending",
      reportedPercent: 20,
      plannedPercent: 60,
      varianceDays: 2,
      detectedAt: "2026-09-25T15:00:00.000Z",
      proposal: {
        currentStart: "2026-09-26",
        currentEnd: "2026-09-26",
        proposedStart: "2026-09-26",
        proposedEnd: "2026-09-29",
        ripple: [],
        projectSlipDays: 2,
        criticalPath: true,
        totalFloatDays: 0
      }
    },
    {
      id: "v-oak",
      projectId: "p-oak",
      jobId: "j-framing",
      fieldUpdateId: "fu-2",
      kind: "ahead",
      severity: "Low",
      status: "pending",
      reportedPercent: 70,
      plannedPercent: 60,
      varianceDays: -1,
      detectedAt: "2026-09-25T16:00:00.000Z",
      proposal: {
        currentStart: "2026-09-21",
        currentEnd: "2026-10-09",
        proposedStart: "2026-09-21",
        proposedEnd: "2026-10-08",
        ripple: [],
        projectSlipDays: 0,
        criticalPath: false,
        totalFloatDays: 3
      }
    },
    {
      id: "v-done",
      projectId: "p-maple",
      jobId: "j-footings",
      fieldUpdateId: "fu-0",
      kind: "slip",
      severity: "Medium",
      status: "accepted",
      reportedPercent: 10,
      plannedPercent: 30,
      varianceDays: 1,
      detectedAt: "2026-09-20T15:00:00.000Z",
      proposal: {
        currentStart: "2026-09-26",
        currentEnd: "2026-09-26",
        proposedStart: "2026-09-26",
        proposedEnd: "2026-09-27",
        ripple: [],
        projectSlipDays: 1,
        criticalPath: false,
        totalFloatDays: 0
      }
    }
  ],
  delayIQs: [],
  readiness: [
    { id: "r-permit", projectId: "p-maple", label: "Permit posted on site", complete: false, dueDate: "2026-10-02" },
    { id: "r-late", projectId: "p-maple", label: "Survey stakes", complete: false, dueDate: "2026-09-20" },
    { id: "r-far", projectId: "p-maple", label: "Final walk", complete: false, dueDate: "2026-11-20" },
    { id: "r-done", projectId: "p-maple", label: "Contract", complete: true, dueDate: "2026-09-10" },
    { id: "r-oak", projectId: "p-oak", label: "Trusses delivered", complete: false, dueDate: "2026-09-28" }
  ],
  inspections: [],
  weatherAlerts: [],
  weatherConflicts: [
    {
      id: "wx-j-footings-2026-09-26",
      jobId: "j-footings",
      projectId: "p-maple",
      date: "2026-09-26",
      cause: "rain",
      severity: "hold",
      start: "2026-09-26T14:00",
      end: "2026-09-26T15:30",
      reason: "0.30 in of rain",
      assigneeId: "u-liam",
      status: "open",
      detectedAt: "2026-09-26T10:00:00.000Z",
      updatedAt: "2026-09-26T10:00:00.000Z"
    },
    {
      id: "wx-j-grading-2026-09-28",
      jobId: "j-grading",
      projectId: "p-harbor",
      date: "2026-09-28",
      cause: "wind",
      severity: "watch",
      start: "2026-09-28T09:00",
      end: "2026-09-28T12:00",
      reason: "gusts to 28 mph",
      assigneeId: "u-ana",
      status: "open",
      detectedAt: "2026-09-26T10:00:00.000Z",
      updatedAt: "2026-09-26T10:00:00.000Z"
    },
    {
      id: "wx-old",
      jobId: "j-framing",
      projectId: "p-oak",
      date: "2026-09-24",
      cause: "rain",
      severity: "hold",
      start: "2026-09-24T09:00",
      end: "2026-09-24T12:00",
      reason: "rain",
      assigneeId: "u-carlos",
      status: "open",
      detectedAt: "2026-09-23T10:00:00.000Z",
      updatedAt: "2026-09-23T10:00:00.000Z"
    }
  ],
  workCalendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }
});
