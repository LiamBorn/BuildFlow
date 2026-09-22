/**
 * The guided tour of the Schedule category: the landing, the filters, and one stop
 * per view. It slots into the app tutorial (App.tsx buildTutorialSteps) after the
 * Month calendar lessons; each stop names the page it lives on and the anchor it
 * spotlights (a data-tutorial-id on that page).
 */
import type { SchedulePage } from "./useScheduleContext";

export type ScheduleTourTargetId =
  | "schedule-views"
  | "schedule-status-band"
  | "schedule-filters-button"
  | "schedule-alerts"
  | "month-calendar"
  | "gantt-timeline"
  | "kanban-lanes";

export type ScheduleTourStep = {
  id: string;
  title: string;
  shortTitle: string;
  body: string;
  page: SchedulePage;
  targetId: ScheduleTourTargetId;
};

export const scheduleTourSteps: ScheduleTourStep[] = [
  {
    id: "schedule-landing",
    title: "The whole plan, at a glance",
    shortTitle: "Schedule",
    body: "Schedule is the landing: status, alerts, field variances, the unbooked queue, and a card for each view. Press 1 to 3 anywhere in Schedule to jump between the views; ⌘K finds any page.",
    page: "schedule",
    targetId: "schedule-views"
  },
  {
    id: "schedule-status",
    title: "Where the plan stands",
    shortTitle: "Status",
    body: "The status band compares the forecast with the plan across every project — on plan, drifting, or at risk — and moves as the field reports progress.",
    page: "schedule",
    targetId: "schedule-status-band"
  },
  {
    id: "schedule-filters",
    title: "Filters that follow you",
    shortTitle: "Filters",
    body: "Project, crew type, crew, region and statuses filter every schedule view the same way, and the month you pick travels with you from view to view.",
    page: "month",
    targetId: "schedule-filters-button"
  },
  {
    id: "month-view",
    title: "Month: every job on its start day",
    shortTitle: "Month",
    body: "The calendar shows jobs, milestones and holidays. Drag a chip to another day and the job's bookings move with it.",
    page: "month",
    targetId: "month-calendar"
  },
  {
    id: "gantt-view",
    title: "Gantt Chart: bars, links and the critical path",
    shortTitle: "Gantt",
    body: "Every job is a bar on the timeline, grouped by project, with dependency arrows and the critical path; the readout shows the finish date and the slip against the baseline.",
    page: "gantt",
    targetId: "gantt-timeline"
  },
  {
    id: "kanban-view",
    title: "Kanban: jobs by status",
    shortTitle: "Kanban",
    body: "Five lanes from Planned to Complete. Drag a card into another lane to move the job along; Undo takes it back.",
    page: "kanban",
    targetId: "kanban-lanes"
  }
];
