/**
 * What the Labeled sidebar holds, section by section, against the reference it was asked for with
 * (Linear's sidebar, 2026-09-27). Kept out of App.tsx, which is edited by more than one person at a
 * time; App passes the callbacks, this says what goes where.
 *
 *   reference                       BuildFlow
 *   Inbox · My issues · Agent       Inbox (the bell's list) · My time (TimeCard) · BuildFlow AI
 *   Workspace: Projects · Views ·   Workspace: Projects · Crews · More (Inventory, Field Updates,
 *     More                            DelayIQs, Reports, Bookmarks)
 *   Your teams + : a team, folding  Your team + : the workspace, folding its home (the Dashboard)
 *     Home · Issues · Projects ·      and the Schedule's pages; + adds a workspace
 *     Views
 *   Try: Import issues · Invite     Try: Import a schedule · Invite people · Connect a calendar
 *     people · Connect GitHub         (Settings' Import, People and Mail & Calendar)
 */
import {
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  ClipboardList,
  Clock,
  FileText,
  FileUp,
  House,
  Inbox,
  LineChart,
  ShieldAlert,
  Sparkles,
  SquareKanban,
  Star,
  UserPlus,
  Users,
  Warehouse
} from "lucide-react";
import type { SideCreateItem, SideEntry, SideGroup } from "./LabeledSidebar";

const page = (id: string, label: string, icon: SideEntry["icon"]): SideEntry => ({ kind: "page", page: id, label, icon });

/** Compose: where each thing is made, so the menu says where it goes rather than pretending to open a form. */
export const LABELED_CREATE: SideCreateItem[] = [
  { id: "job", label: "Job", where: "Schedule", icon: CalendarClock, page: "schedule" },
  { id: "project", label: "Project", where: "Projects", icon: Building2, page: "projects" },
  { id: "crew", label: "Crew", where: "Crews", icon: Users, page: "crews" },
  { id: "field", label: "Field update", where: "Field Updates", icon: ClipboardList, page: "field" },
  { id: "time", label: "Time entry", where: "TimeCard", icon: Clock, page: "timecard" },
  { id: "report", label: "Report", where: "Reports", icon: FileText, page: "reports" }
];

export function labeledSections({
  onOpenInbox,
  onAskAi,
  onOpenSetting,
  workspaceTitle,
  onAddWorkspace
}: {
  onOpenInbox: () => void;
  onAskAi: () => void;
  /** A Settings category: "import", "people", "mailCalendar". */
  onOpenSetting: (view: "import" | "people" | "mailCalendar") => void;
  /** The workspace's own name, which stands where the reference's team does. */
  workspaceTitle: string;
  /** Null when no further workspace can be made. */
  onAddWorkspace: (() => void) | null;
}): { primary: SideEntry[]; groups: SideGroup[] } {
  return {
    primary: [
      { kind: "action", id: "inbox", label: "Inbox", icon: Inbox, onSelect: onOpenInbox, opens: "dialog" },
      page("timecard", "My time", Clock),
      // named as the top bar's spark is, so the assistant comes out of this row too (motion/PanelGoo)
      { kind: "action", id: "ai", label: "BuildFlow AI", ariaLabel: "Ask BuildFlow AI", icon: Sparkles, onSelect: onAskAi, opens: "dialog" }
    ],
    groups: [
      {
        id: "workspace",
        label: "Workspace",
        entries: [page("projects", "Projects", Building2), page("crews", "Crews", Users)],
        more: [
          page("inventory", "Inventory", Warehouse),
          page("field", "Field Updates", ClipboardList),
          page("delayIQs", "DelayIQs", ShieldAlert),
          page("reports", "Reports", LineChart),
          page("bookmarks", "Bookmarks", Star)
        ]
      },
      {
        id: "team",
        label: "Your team",
        add: onAddWorkspace ? { label: "Add a workspace", onSelect: onAddWorkspace } : null,
        team: {
          id: "workspace-home",
          label: workspaceTitle,
          initial: (workspaceTitle.trim()[0] ?? "B").toUpperCase(),
          entries: [
            page("dashboard", "Home", House),
            page("schedule", "Schedule", CalendarDays),
            page("month", "Month", CalendarRange),
            page("kanban", "Kanban", SquareKanban),
            page("gantt", "Gantt Chart", ChartGantt)
          ]
        }
      },
      {
        id: "try",
        label: "Try",
        entries: [
          { kind: "action", id: "import", label: "Import a schedule", icon: FileUp, onSelect: () => onOpenSetting("import") },
          { kind: "action", id: "invite", label: "Invite people", icon: UserPlus, onSelect: () => onOpenSetting("people") },
          {
            kind: "action",
            id: "calendar",
            label: "Connect a calendar",
            icon: CalendarClock,
            onSelect: () => onOpenSetting("mailCalendar")
          }
        ]
      }
    ]
  };
}
