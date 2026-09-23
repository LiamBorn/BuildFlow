import { afterEach, describe, expect, it } from "vitest";
import type { Equipment, Material, Project } from "@buildflow/shared";
import {
  INVENTORY_CSV_HEADER,
  clearInventoryViewRequest,
  filterInventory,
  inventoryCounts,
  inventoryCsv,
  inventoryItems,
  peekInventoryViewRequest,
  requestInventoryView,
  sortInventory,
  statusTone,
  todayIso,
  type InventoryFilters
} from "./inventory";

const projects = [
  { id: "p-1", name: "Riverside Office Building" },
  { id: "p-2", name: "Harborview Apartments" }
] as Project[];
const equipment: Equipment[] = [
  { id: "eq-pump", name: "Concrete Pump #2", type: "Pump", status: "In Use", assignedTo: "p-1" },
  { id: "eq-lift", name: "Boom Lift #4", type: "Lift", status: "Available" },
  { id: "eq-dig", name: "Excavator 320", type: "Excavator", status: "Maintenance", assignedTo: "p-2" }
];
const materials: Material[] = [
  { id: "mat-mix", projectId: "p-1", name: "Ready Mix Concrete", status: "Ready", deliveryDate: "2026-06-16", quantity: "120 yd3" },
  {
    id: "mat-steel",
    projectId: "p-2",
    name: "Structural Steel",
    status: "Waiting on Delivery",
    deliveryDate: "2026-06-20",
    quantity: "24 beams"
  },
  { id: "mat-rebar", projectId: "p-2", name: "Rebar #5", status: "Missing", deliveryDate: "2026-06-18", quantity: "3 tons" },
  { id: "mat-tack", projectId: "p-1", name: "Tack Coat", status: "Ordered", deliveryDate: "2026-06-25", quantity: "400 gal" }
];
const items = inventoryItems({ equipment, materials, projects });
const all: InventoryFilters = { view: "all", query: "", status: "all", project: "all" };
const names = (list: { name: string }[]) => list.map((item) => item.name);

describe("the inventory list", () => {
  it("holds every machine and every material line, each with its own status and the reading they share", () => {
    expect(items).toHaveLength(7);
    const pump = items.find((item) => item.id === "eq-pump");
    expect(pump).toMatchObject({
      kind: "equipment",
      detail: "Pump",
      quantity: "1 unit",
      status: "In Use",
      tone: "blue",
      projectId: "p-1",
      projectName: "Riverside Office Building",
      deliveryDate: null,
      ready: false,
      attention: false
    });
    // a machine on no project reads "Unassigned"
    expect(items.find((item) => item.id === "eq-lift")).toMatchObject({ projectId: null, projectName: "Unassigned", ready: true });
    const steel = items.find((item) => item.id === "mat-steel");
    expect(steel).toMatchObject({
      kind: "material",
      detail: "24 beams",
      quantity: "24 beams",
      projectName: "Harborview Apartments",
      deliveryDate: "2026-06-20",
      tone: "amber",
      attention: true
    });
  });

  it("gives each status the tone the index pages already use for it", () => {
    expect(["Available", "Ready"].map((status) => statusTone(status as never))).toEqual(["green", "green"]);
    expect(["In Use", "Ordered"].map((status) => statusTone(status as never))).toEqual(["blue", "blue"]);
    expect(statusTone("Waiting on Delivery")).toBe("amber");
    expect(["Maintenance", "Missing"].map((status) => statusTone(status as never))).toEqual(["red", "red"]);
  });

  it("counts what the KPI strip shows: each kind, what is ready and what needs attention", () => {
    expect(inventoryCounts(items)).toEqual({ total: 7, equipment: 3, materials: 4, ready: 2, attention: 3 });
  });
});

describe("the views and filters", () => {
  it("narrows by the saved view: a kind, or what needs attention", () => {
    expect(filterInventory(items, { ...all, view: "equipment" }).every((item) => item.kind === "equipment")).toBe(true);
    expect(filterInventory(items, { ...all, view: "materials" })).toHaveLength(4);
    expect(names(filterInventory(items, { ...all, view: "attention" })).sort()).toEqual(["Excavator 320", "Rebar #5", "Structural Steel"]);
  });

  it("searches the name, the type or quantity, the kind, the status and the project", () => {
    expect(names(filterInventory(items, { ...all, query: "pump" }))).toEqual(["Concrete Pump #2"]);
    expect(names(filterInventory(items, { ...all, query: "beams" }))).toEqual(["Structural Steel"]);
    expect(filterInventory(items, { ...all, query: "material" })).toHaveLength(4);
    expect(names(filterInventory(items, { ...all, query: "maintenance" }))).toEqual(["Excavator 320"]);
    expect(filterInventory(items, { ...all, query: "harborview" })).toHaveLength(3);
    expect(filterInventory(items, { ...all, query: "forklift" })).toEqual([]);
  });

  it("filters by an exact status, and by project with unassigned as its own choice", () => {
    expect(names(filterInventory(items, { ...all, status: "Ready" }))).toEqual(["Ready Mix Concrete"]);
    expect(names(filterInventory(items, { ...all, project: "" }))).toEqual(["Boom Lift #4"]);
    expect(filterInventory(items, { ...all, project: "p-1" })).toHaveLength(3);
  });
});

describe("sorting", () => {
  it("sorts by name by default, both ways", () => {
    expect(names(sortInventory(items, "name", "asc"))[0]).toBe("Boom Lift #4");
    expect(names(sortInventory(items, "name", "desc"))[0]).toBe("Tack Coat");
  });

  it("sorts by status with what needs attention first, not alphabetically", () => {
    expect(sortInventory(items, "status", "asc").map((item) => item.status)).toEqual([
      "Missing",
      "Maintenance",
      "Waiting on Delivery",
      "Ordered",
      "In Use",
      "Ready",
      "Available"
    ]);
  });

  it("breaks a tie on kind or project by name, so the order is stable", () => {
    const equipmentFirst = sortInventory(items, "kind", "asc");
    expect(names(equipmentFirst.slice(0, 3))).toEqual(["Boom Lift #4", "Concrete Pump #2", "Excavator 320"]);
    expect(names(sortInventory(items, "project", "asc")).slice(0, 3)).toEqual(["Excavator 320", "Rebar #5", "Structural Steel"]);
  });

  it("does not reorder the list it was given", () => {
    const before = names(items);
    sortInventory(items, "status", "asc");
    expect(names(items)).toEqual(before);
  });
});

describe("the export", () => {
  it("writes one quoted row per item under the header, escaping quotes", () => {
    const csv = inventoryCsv(
      inventoryItems({ equipment: [{ ...equipment[0], name: 'Pump "Big" #2' }], materials: [materials[1]], projects })
    );
    const [header, pump, steel] = csv.split("\n");
    expect(header).toBe(INVENTORY_CSV_HEADER.map((cell) => `"${cell}"`).join(","));
    expect(pump).toBe('"Pump ""Big"" #2","Equipment","Pump","In Use","Riverside Office Building",""');
    expect(steel).toBe('"Structural Steel","Material","24 beams","Waiting on Delivery","Harborview Apartments","2026-06-20"');
  });
});

describe("opening the page on a view", () => {
  afterEach(() => clearInventoryViewRequest());

  it("hands the page the view it was asked for, and nothing once that has been let go", () => {
    expect(peekInventoryViewRequest()).toBe("all");
    requestInventoryView("materials");
    // peeked, not consumed: React may run a state initializer twice
    expect(peekInventoryViewRequest()).toBe("materials");
    expect(peekInventoryViewRequest()).toBe("materials");
    clearInventoryViewRequest();
    expect(peekInventoryViewRequest()).toBe("all");
  });

  it("dates a new material line today, as a local calendar day", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
