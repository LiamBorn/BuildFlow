/**
 * The Inventory — the Resources category for v1 (2026-09-23).
 *
 * Asked for from a v1 scoping note: "Resources (Equipment, Materials) — fine to keep, but for v1
 * this probably just needs to be a list/inventory with status, not a full asset-management
 * system." So it is ONE list: every piece of equipment and every material line, each with the
 * status it has. The full Equipment and Materials pages it replaced (utilization and readiness
 * bars, the current job, the schedule impact) are in the backlog (docs/backlog.md).
 *
 * The two kinds keep their own records and their own words for status — a machine is Available,
 * In Use or in Maintenance; a material line is Ready, Ordered, Waiting on Delivery or Missing — so
 * an item carries its kind, and nothing here pretends the two share a vocabulary. What they do
 * share is the reading a planner needs at a glance: ready to use, or needing attention.
 *
 * Pure functions, so the rules are tested without rendering the page (inventory.test.ts).
 */
import type { BootstrapPayload, Equipment, Material } from "@buildflow/shared";

export type InventoryKind = "equipment" | "material";
export type InventoryStatus = Equipment["status"] | Material["status"];
/** The tones the index pages' badges and avatars already wear (hs-badge tone-*). */
export type InventoryTone = "green" | "blue" | "amber" | "red";

export const EQUIPMENT_STATUSES: readonly Equipment["status"][] = ["Available", "In Use", "Maintenance"];
export const MATERIAL_STATUSES: readonly Material["status"][] = ["Ready", "Ordered", "Waiting on Delivery", "Missing"];

/** The status a new item starts on: a machine you add is usually on the yard, a material usually on order. */
export const DEFAULT_STATUS: Record<InventoryKind, InventoryStatus> = { equipment: "Available", material: "Ordered" };

export const KIND_LABEL: Record<InventoryKind, string> = { equipment: "Equipment", material: "Material" };

export type InventoryItem = {
  /** The record's own id. Equipment and material ids never collide (`eq-…` / `mat-…`). */
  id: string;
  kind: InventoryKind;
  name: string;
  /** Equipment: its type ("Pump"). Material: its quantity ("120 yd3"). */
  detail: string;
  /** What the Quantity column reads: a material's own quantity, or one unit for a machine. */
  quantity: string;
  status: InventoryStatus;
  tone: InventoryTone;
  /** The project it is on. A machine may be on none; a material line always belongs to one. */
  projectId: string | null;
  /** The project's name, or "Unassigned". */
  projectName: string;
  /** Materials only: the delivery date (YYYY-MM-DD). */
  deliveryDate: string | null;
  /** Available equipment, or a material that is Ready. */
  ready: boolean;
  /** Equipment in Maintenance, or a material that is Missing or still Waiting on Delivery. */
  attention: boolean;
};

export function statusTone(status: InventoryStatus): InventoryTone {
  switch (status) {
    case "Available":
    case "Ready":
      return "green";
    case "Waiting on Delivery":
      return "amber";
    case "Maintenance":
    case "Missing":
      return "red";
    case "In Use":
    case "Ordered":
    default:
      return "blue";
  }
}

export const isReady = (status: InventoryStatus) => status === "Available" || status === "Ready";
export const needsAttention = (status: InventoryStatus) =>
  status === "Maintenance" || status === "Missing" || status === "Waiting on Delivery";

/**
 * The order a status sorts in: what needs attention first, then what is committed, then what is
 * ready. Sorting by status alphabetically would put "Available" at the top and "Missing" in the
 * middle, which is the opposite of what a planner sorting by status is looking for.
 */
const STATUS_ORDER: readonly InventoryStatus[] = [
  "Missing",
  "Maintenance",
  "Waiting on Delivery",
  "Ordered",
  "In Use",
  "Ready",
  "Available"
];
export const statusRank = (status: InventoryStatus) => {
  const index = STATUS_ORDER.indexOf(status);
  return index < 0 ? STATUS_ORDER.length : index;
};

type InventorySource = Pick<BootstrapPayload, "equipment" | "materials" | "projects">;

export function inventoryItems(data: InventorySource): InventoryItem[] {
  const projectName = (id: string | null | undefined) =>
    id ? (data.projects.find((project) => project.id === id)?.name ?? "Unassigned") : "Unassigned";
  const equipment = data.equipment.map((unit): InventoryItem => ({
    id: unit.id,
    kind: "equipment",
    name: unit.name,
    detail: unit.type,
    quantity: "1 unit",
    status: unit.status,
    tone: statusTone(unit.status),
    projectId: unit.assignedTo ?? null,
    projectName: projectName(unit.assignedTo),
    deliveryDate: null,
    ready: isReady(unit.status),
    attention: needsAttention(unit.status)
  }));
  const materials = data.materials.map((line): InventoryItem => ({
    id: line.id,
    kind: "material",
    name: line.name,
    detail: line.quantity,
    quantity: line.quantity,
    status: line.status,
    tone: statusTone(line.status),
    projectId: line.projectId,
    projectName: projectName(line.projectId),
    deliveryDate: line.deliveryDate,
    ready: isReady(line.status),
    attention: needsAttention(line.status)
  }));
  return [...equipment, ...materials];
}

/** The saved-view tabs across the top of the index card. */
export type InventoryView = "all" | "equipment" | "materials" | "attention";

export function inView(item: InventoryItem, view: InventoryView) {
  if (view === "equipment") return item.kind === "equipment";
  if (view === "materials") return item.kind === "material";
  if (view === "attention") return item.attention;
  return true;
}

export type InventoryFilters = {
  view: InventoryView;
  query: string;
  /** A status, or "all". */
  status: string;
  /** A project id, "" for unassigned, or "all". */
  project: string;
};

export function filterInventory(items: InventoryItem[], filters: InventoryFilters): InventoryItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (!inView(item, filters.view)) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.project !== "all" && (item.projectId ?? "") !== filters.project) return false;
    if (!query) return true;
    return [item.name, item.detail, KIND_LABEL[item.kind], item.status, item.projectName].join(" ").toLowerCase().includes(query);
  });
}

export type InventorySortKey = "name" | "kind" | "status" | "project";

export function sortInventory(items: InventoryItem[], key: InventorySortKey, dir: "asc" | "desc"): InventoryItem[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name);
  return [...items].sort((a, b) => {
    switch (key) {
      case "kind":
        return sign * a.kind.localeCompare(b.kind) || byName(a, b);
      case "status":
        return sign * (statusRank(a.status) - statusRank(b.status)) || byName(a, b);
      case "project":
        return sign * a.projectName.localeCompare(b.projectName) || byName(a, b);
      case "name":
      default:
        return sign * byName(a, b);
    }
  });
}

export function inventoryCounts(items: InventoryItem[]) {
  return {
    total: items.length,
    equipment: items.filter((item) => item.kind === "equipment").length,
    materials: items.filter((item) => item.kind === "material").length,
    ready: items.filter((item) => item.ready).length,
    attention: items.filter((item) => item.attention).length
  };
}

export const INVENTORY_CSV_HEADER = ["Item", "Kind", "Type / quantity", "Status", "Project", "Delivery date"] as const;

export function inventoryCsv(items: InventoryItem[]): string {
  const rows = items.map((item) => [item.name, KIND_LABEL[item.kind], item.detail, item.status, item.projectName, item.deliveryDate ?? ""]);
  return [INVENTORY_CSV_HEADER as readonly string[], ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Today as a local calendar day (YYYY-MM-DD) — the default delivery date for a new material line. */
export function todayIso(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* ── Opening the page on a view ────────────────────────────────────────────────────────────────
   The Dashboard's "View all materials" should land on the Materials view, not on everything. Pages
   are chosen by id alone, so the caller leaves the view here just before it navigates, and the page
   reads it as it mounts. It is only PEEKED during render — React's StrictMode runs a state
   initializer twice, and a read that consumed the request would hand the second run "all" — and
   cleared once the page has mounted. */
let pendingView: InventoryView | null = null;

export function requestInventoryView(view: InventoryView) {
  pendingView = view;
}

export function peekInventoryViewRequest(): InventoryView {
  return pendingView ?? "all";
}

export function clearInventoryViewRequest() {
  pendingView = null;
}
