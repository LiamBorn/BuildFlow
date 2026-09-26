/**
 * The bell's rows: the shared notification list (@buildflow/shared `buildNotificationItems`, which
 * the server also builds for the Mac) with an icon per kind, in the shape the drawer has always
 * drawn. Until 2026-09-26 the list itself was built here in the browser only, in App.tsx.
 */
import {
  buildNotificationItems,
  type BootstrapPayload,
  type NotificationDestination,
  type NotificationKind,
  type NotificationRecordRef,
  type NotificationTone
} from "@buildflow/shared";
import { CalendarDays, CheckCircle2, ClipboardList, CloudSun, PackageCheck, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";

/**
 * Where the work a notification is about actually lives — what "bring me to it" resolves to: a
 * record on an index page, a Dashboard panel for weather and inspections (which have no page of
 * their own), or the schedule at a week and crew. The shared list decides it (`opens`).
 */
export type NotificationTarget = NotificationDestination;

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  timestamp: string;
  tone: NotificationTone;
  icon: LucideIcon;
  /** The project it is about, where there is one: what the "Projects I manage" tab filters on. */
  projectId?: string;
  /** Where clicking the row goes. A row with nowhere to go is drawn as plain text, not a dead link. */
  target?: NotificationTarget;
  /** The record it is about, as { kind, id }. */
  record: NotificationRecordRef;
  /** False for equipment, which is stamped "now" on every build and so must never read as news. */
  alertable: boolean;
};

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  fieldUpdate: ClipboardList,
  weatherConflict: CloudSun,
  weatherAlert: CloudSun,
  delayIQ: ShieldAlert,
  assignment: CalendarDays,
  inspection: CheckCircle2,
  material: PackageCheck,
  equipment: Wrench
};

/** Every notification, newest first, as the bell draws them. */
export function bellNotificationItems(data: BootstrapPayload, now: number = Date.now()): NotificationItem[] {
  return buildNotificationItems(data, now).map(({ opens, target, ...item }) => ({
    ...item,
    icon: KIND_ICON[item.kind],
    target: opens,
    record: target
  }));
}
