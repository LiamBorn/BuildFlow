/**
 * Inventory — the Resources category's one page (2026-09-23). Every piece of equipment and every
 * material line in one list, each with its status; add, edit and remove from the same right-side
 * drawer every editing panel in the program uses. See ./inventory.ts for why it is one list and what
 * it replaced.
 *
 * It is the program's index page, not a new design: the KPI strip, the index card (title ⌄ + Add,
 * saved-view tabs with the travelling pill, search / filter / sort, quick filters, the checkbox table,
 * the footer with paging and Export), the aurora field and the cursor glow — the same markup the
 * Projects, Crews, Field Updates and DelayIQs pages wear, so the skin's index-page sections, the
 * entrance cascade and the dark palette reach it through its root, `.inv-rx`. The drawer is the
 * `.pdx` editing drawer (skin sections 65 and 70), portalled to <body> for the reason the Crews
 * page gives: the page root sets `isolation: isolate`, which would trap the drawer under the top bar.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Warehouse,
  Wrench,
  X
} from "lucide-react";
import type { BootstrapPayload, Equipment, Material } from "@buildflow/shared";
import { createEquipment, createMaterial, deleteEquipment, deleteMaterial, updateEquipment, updateMaterial } from "../api";
import { AnimatedFigure } from "../components/ui/animated-figure";
import { formatDate } from "../formatDate";
import { TextReveal } from "../motion";
import { useRecordFocus, type RecordFocusRequest } from "../recordFocus";
import { useModalDialog } from "../schedule/hooks";
import { useHudMotion } from "../useHudMotion";
import {
  DEFAULT_STATUS,
  EQUIPMENT_STATUSES,
  KIND_LABEL,
  MATERIAL_STATUSES,
  clearInventoryViewRequest,
  filterInventory,
  inventoryCounts,
  inventoryCsv,
  inventoryItems,
  inView,
  peekInventoryViewRequest,
  sortInventory,
  todayIso,
  type InventoryItem,
  type InventoryKind,
  type InventorySortKey,
  type InventoryStatus,
  type InventoryView
} from "./inventory";

const KIND_ICON: Record<InventoryKind, typeof Wrench> = { equipment: Wrench, material: Boxes };

/** The className for an index row: selected, and/or lit because a notification pointed at it. */
const rowClass = (selected: boolean, focused: boolean) =>
  [selected ? "is-selected" : "", focused ? "is-bf-focused" : ""].filter(Boolean).join(" ") || undefined;

const rowKey = (item: InventoryItem) => `${item.kind}:${item.id}`;

type EditorState = { mode: "add"; kind: InventoryKind } | { mode: "edit"; item: InventoryItem };

export type InventoryPageProps = {
  data: BootstrapPayload;
  reload: () => Promise<void>;
  /** A notification pointed at one of these rows (../recordFocus). */
  focus?: RecordFocusRequest;
  /** The Quantity field's example, in the trade's own units ("420 tons" for asphalt). */
  quantityHint?: string;
};

export function InventoryPage({ data, reload, focus, quantityHint = "Example: 24 bundles" }: InventoryPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);
  // the view the caller asked for (the Dashboard's "View all materials"), read once and then let go
  const [view, setView] = useState<InventoryView>(() => peekInventoryViewRequest());
  useEffect(() => clearInventoryViewRequest(), []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortKey, setSortKey] = useState<InventorySortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [indexPage, setIndexPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [removing, setRemoving] = useState<InventoryItem | null>(null);

  const items = useMemo(() => inventoryItems(data), [data]);
  const counts = inventoryCounts(items);
  const shown = sortInventory(filterInventory(items, { view, query, status: statusFilter, project: projectFilter }), sortKey, sortDir);
  const pageCount = Math.max(1, Math.ceil(shown.length / perPage));
  const currentPage = Math.min(indexPage, pageCount);
  const paged = shown.slice((currentPage - 1) * perPage, currentPage * perPage);
  const activeFilters = [statusFilter, projectFilter].filter((value) => value !== "all").length;
  const allPagedSelected = paged.length > 0 && paged.every((item) => selected.has(rowKey(item)));

  const views: Array<{ id: InventoryView; label: string; icon: typeof Wrench }> = [
    { id: "all", label: "All items", icon: Warehouse },
    { id: "equipment", label: "Equipment", icon: Wrench },
    { id: "materials", label: "Materials", icon: Boxes },
    { id: "attention", label: "Needs attention", icon: AlertTriangle }
  ];
  const viewCount = (id: InventoryView) => items.filter((item) => inView(item, id)).length;

  const clearFilters = () => {
    setStatusFilter("all");
    setProjectFilter("all");
    setQuery("");
    setIndexPage(1);
  };
  /* A notification pointed at one of these rows: clear the saved view and every filter that could
     hide it, turn to the page it lands on, and light it. */
  const focusedId = useRecordFocus(
    focus ?? null,
    shown.map((item) => item.id),
    perPage,
    setIndexPage,
    () => {
      setView("all");
      clearFilters();
    }
  );

  const toggleSort = (key: InventorySortKey) => {
    if (sortKey === key) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortHeader = (key: InventorySortKey, label: string, className = "") => (
    <th className={`${className}${sortKey === key ? " sorted" : ""}`.trim()}>
      <button type="button" onClick={() => toggleSort(key)}>
        {label}
        <ChevronDown style={{ transform: sortKey === key && sortDir === "desc" ? "rotate(180deg)" : undefined }} />
      </button>
    </th>
  );
  const toggleRow = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAllRows = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      paged.forEach((item) => (allPagedSelected ? next.delete(rowKey(item)) : next.add(rowKey(item))));
      return next;
    });
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([inventoryCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "buildflow-inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  // a new item starts as the kind the planner is looking at
  const openAdd = () => setEditor({ mode: "add", kind: view === "materials" ? "material" : "equipment" });

  return (
    <div className="page-stack inventory-page inv-rx hs-index" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      <div className="hs-kpis">
        <div className="hs-kpi">
          <span className="hs-kpi-ico tone-blue">
            <Wrench />
          </span>
          <div className="hs-kpi-body">
            <span className="hs-kpi-label">Equipment</span>
            <span className="hs-kpi-value">
              <AnimatedFigure text={String(counts.equipment)} />
            </span>
          </div>
        </div>
        <div className="hs-kpi">
          <span className="hs-kpi-ico tone-violet">
            <Boxes />
          </span>
          <div className="hs-kpi-body">
            <span className="hs-kpi-label">Materials</span>
            <span className="hs-kpi-value">
              <AnimatedFigure text={String(counts.materials)} />
            </span>
          </div>
        </div>
        <div className="hs-kpi">
          <span className="hs-kpi-ico tone-green">
            <CheckCircle2 />
          </span>
          <div className="hs-kpi-body">
            <span className="hs-kpi-label">Ready to Use</span>
            <span className="hs-kpi-value">
              <AnimatedFigure text={String(counts.ready)} />
            </span>
          </div>
        </div>
        <div className="hs-kpi">
          <span className={`hs-kpi-ico tone-${counts.attention > 0 ? "red" : "green"}`}>
            <AlertTriangle />
          </span>
          <div className="hs-kpi-body">
            <span className="hs-kpi-label">Needs Attention</span>
            <span className="hs-kpi-value">
              <AnimatedFigure text={String(counts.attention)} />
            </span>
          </div>
        </div>
      </div>

      <div className="hs-index-main">
        <section className="hs-index-card" aria-labelledby="inventory-index-title">
          <div className="hs-index-head">
            <h1 className="hs-index-title" id="inventory-index-title" data-tutorial-id="inventory-page-title">
              <TextReveal text="Inventory" nested />
              <button type="button" aria-label="Show all items" title="All items" onClick={() => setView("all")}>
                <ChevronDown size={16} />
              </button>
            </h1>
            <div className="hs-index-actions">
              <button className="hs-btn hs-btn-primary" type="button" onClick={openAdd}>
                <Plus size={16} /> Add item
              </button>
            </div>
          </div>

          <div className="hs-views" role="tablist" aria-label="Inventory views">
            {views.map((option) => {
              const ViewIcon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={view === option.id}
                  className={`hs-view${view === option.id ? " active" : ""}`}
                  onClick={() => {
                    setView(option.id);
                    setIndexPage(1);
                  }}
                >
                  <ViewIcon />
                  {option.label}
                  <span className="hs-view-count">{viewCount(option.id)}</span>
                </button>
              );
            })}
          </div>

          <div className="hs-toolbar">
            <label className="hs-search">
              <Search size={15} />
              <input
                aria-label="Search inventory"
                placeholder="Search inventory"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIndexPage(1);
                }}
              />
            </label>
            <button
              type="button"
              className={`hs-chip${activeFilters ? " active" : ""}`}
              onClick={clearFilters}
              title={activeFilters ? "Clear filters" : "Use the filters below"}
            >
              <SlidersHorizontal />
              Filter{activeFilters ? ` · ${activeFilters}` : ""}
            </button>
            <button type="button" className={`hs-chip${sortKey !== "name" ? " active" : ""}`} onClick={() => toggleSort("status")}>
              <ChevronDown style={{ transform: sortKey === "status" && sortDir === "desc" ? "rotate(180deg)" : undefined }} />
              Sort by {sortKey}
            </button>
            <div className="hs-toolbar-right">
              <span className="hs-cell-muted">
                {shown.length} of {items.length}
              </span>
            </div>
          </div>

          <div className="hs-quickfilters">
            <label className={`hs-qf${statusFilter !== "all" ? " is-set" : ""}`}>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setIndexPage(1);
                }}
                aria-label="Filter inventory by status"
              >
                <option value="all">Status</option>
                {[...EQUIPMENT_STATUSES, ...MATERIAL_STATUSES].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </label>
            <label className={`hs-qf${projectFilter !== "all" ? " is-set" : ""}`}>
              <select
                value={projectFilter}
                onChange={(event) => {
                  setProjectFilter(event.target.value);
                  setIndexPage(1);
                }}
                aria-label="Filter inventory by project"
              >
                <option value="all">Project</option>
                <option value="">Unassigned</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </label>
            {activeFilters > 0 && (
              <button type="button" className="hs-qf-link" onClick={clearFilters}>
                <SlidersHorizontal />
                Clear filters
              </button>
            )}
          </div>

          {paged.length > 0 ? (
            <div className="hs-table-wrap">
              <table className="hs-table">
                <thead>
                  <tr>
                    <th className="hs-cell-check">
                      <input
                        type="checkbox"
                        aria-label="Select all items on this page"
                        checked={allPagedSelected}
                        onChange={toggleAllRows}
                      />
                    </th>
                    {sortHeader("name", "Item", "hs-cell-name")}
                    {sortHeader("kind", "Kind")}
                    {sortHeader("status", "Status")}
                    <th>Quantity</th>
                    {sortHeader("project", "Project")}
                    <th className="hs-cell-actions two" aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const KindIcon = KIND_ICON[item.kind];
                    const key = rowKey(item);
                    const isChecked = selected.has(key);
                    return (
                      <tr key={key} data-bf-focus={item.id} className={rowClass(isChecked, focusedId === item.id)}>
                        <td className="hs-cell-check">
                          <input type="checkbox" aria-label={`Select ${item.name}`} checked={isChecked} onChange={() => toggleRow(key)} />
                        </td>
                        <td className="hs-cell-name">
                          <div className="hs-row-name">
                            <span className={`hs-avatar tone-${item.tone}`}>
                              <KindIcon size={15} />
                            </span>
                            <div>
                              <button
                                type="button"
                                className="hs-link"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => setEditor({ mode: "edit", item })}
                              >
                                {item.name}
                              </button>
                              <span className="hs-row-sub">
                                {item.kind === "equipment" ? item.detail : `Delivery ${formatDate(item.deliveryDate ?? "")}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="hs-cell-muted">{KIND_LABEL[item.kind]}</td>
                        <td>
                          <span className={`hs-badge tone-${item.tone}`}>{item.status}</span>
                        </td>
                        <td className="hs-cell-num">{item.quantity}</td>
                        <td className="hs-cell-muted">{item.projectName}</td>
                        <td className="hs-cell-actions two">
                          <button
                            type="button"
                            className="hs-row-action edit"
                            aria-label={`Edit ${item.name}`}
                            title="Edit item"
                            onClick={() => setEditor({ mode: "edit", item })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="hs-row-action"
                            aria-label={`Remove ${item.name}`}
                            title="Remove item"
                            onClick={() => setRemoving(item)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="hs-empty">
              <Warehouse size={28} />
              <strong>{items.length === 0 ? "Nothing in inventory yet" : "Nothing matches that search"}</strong>
              <span>
                {items.length === 0
                  ? "Add equipment and materials to see what you have and where each one stands."
                  : "Try a name, a type, a status or a project."}
              </span>
            </div>
          )}

          <div className="hs-index-foot">
            <span className="hs-count-pill">
              {shown.length} {shown.length === 1 ? "item" : "items"}
              {selected.size ? ` · ${selected.size} selected` : ""}
            </span>
            <div className="hs-pagination">
              <button type="button" className="hs-page-btn" disabled={currentPage <= 1} onClick={() => setIndexPage(currentPage - 1)}>
                <ChevronLeft size={14} /> Prev
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`hs-page-btn${pageNumber === currentPage ? " active" : ""}`}
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                  onClick={() => setIndexPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                className="hs-page-btn"
                disabled={currentPage >= pageCount}
                onClick={() => setIndexPage(currentPage + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
              <label className="hs-qf hs-perpage">
                <select
                  value={perPage}
                  onChange={(event) => {
                    setPerPage(Number(event.target.value));
                    setIndexPage(1);
                  }}
                  aria-label="Items per page"
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
                <ChevronDown />
              </label>
            </div>
            <div className="hs-foot-right">
              <button type="button" className="hs-btn" onClick={exportCsv}>
                <Download size={15} /> Export
              </button>
            </div>
          </div>
        </section>
      </div>

      {editor && (
        <InventoryItemDrawer
          editor={editor}
          data={data}
          quantityHint={quantityHint}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await reload();
          }}
        />
      )}
      {removing && (
        <InventoryRemoveDialog
          item={removing}
          onClose={() => setRemoving(null)}
          onRemoved={async () => {
            setRemoving(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** Add or edit one item, in the program's right-side editing drawer. */
function InventoryItemDrawer({
  editor,
  data,
  quantityHint,
  onClose,
  onSaved
}: {
  editor: EditorState;
  data: BootstrapPayload;
  quantityHint: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = editor.mode === "edit" ? editor.item : null;
  const source: Equipment | Material | undefined = editing
    ? editing.kind === "equipment"
      ? data.equipment.find((unit) => unit.id === editing.id)
      : data.materials.find((line) => line.id === editing.id)
    : undefined;
  const [kind, setKind] = useState<InventoryKind>(editing ? editing.kind : editor.mode === "add" ? editor.kind : "equipment");
  const [name, setName] = useState(editing?.name ?? "");
  const [status, setStatus] = useState<InventoryStatus>(editing?.status ?? DEFAULT_STATUS[kind]);
  const [type, setType] = useState(source && "type" in source ? source.type : "");
  const [quantity, setQuantity] = useState(source && "quantity" in source ? source.quantity : "");
  const [deliveryDate, setDeliveryDate] = useState(source && "deliveryDate" in source ? source.deliveryDate : todayIso());
  // a machine may be on no project; a material line always belongs to one
  const [projectId, setProjectId] = useState(editing ? (editing.projectId ?? "") : kind === "material" ? (data.projects[0]?.id ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useModalDialog<HTMLElement>(onClose);

  const statuses: readonly InventoryStatus[] = kind === "equipment" ? EQUIPMENT_STATUSES : MATERIAL_STATUSES;
  const canSubmit =
    name.trim().length > 0 &&
    (kind === "equipment"
      ? type.trim().length > 0
      : quantity.trim().length > 0 && projectId.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate));
  const title = editing ? "Edit" : "Add";
  const saveLabel = editing ? (busy ? "Saving" : "Save item") : busy ? "Adding" : "Add item";

  const changeKind = (next: InventoryKind) => {
    setKind(next);
    setStatus(DEFAULT_STATUS[next]);
    if (next === "material" && !projectId) setProjectId(data.projects[0]?.id ?? "");
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "equipment") {
        const input = {
          name,
          type,
          status: status as Equipment["status"],
          assignedTo: projectId || undefined
        };
        if (editing) await updateEquipment(editing.id, input);
        else await createEquipment(input);
      } else {
        const input = { projectId, name, status: status as Material["status"], deliveryDate, quantity };
        if (editing) await updateMaterial(editing.id, input);
        else await createMaterial(input);
      }
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The item could not be saved.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="project-dialog-backdrop pdx" role="presentation">
      <section
        className="project-dialog pdx-dialog inventory-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-dialog-title"
        aria-describedby="inventory-dialog-description"
        ref={panelRef}
      >
        <div className="pdx-glow" aria-hidden="true">
          <span className="pdx-aurora pdx-aurora-1" />
          <span className="pdx-aurora pdx-aurora-2" />
        </div>
        <header className="project-dialog-header pdx-head">
          <div>
            <span className="pdx-eyebrow">
              <span className="pdx-dot" />
              Inventory
            </span>
            <h2 id="inventory-dialog-title" className="pdx-title">
              {title} <em>item</em>
            </h2>
            <p className="pdx-sub" id="inventory-dialog-description">
              {editing
                ? editing.kind === "equipment"
                  ? "Update this machine's details and status."
                  : "Update this material line's details and status."
                : "Add a piece of equipment or a material line, with its status."}
            </p>
          </div>
          <button className="pdx-close" aria-label={`Close ${title} item`} type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form className="project-form pdx-form inventory-form" onSubmit={submit}>
          <label className="project-form-wide">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "equipment" ? "Example: Boom Lift #5" : "Example: Structural Steel Beams"}
            />
          </label>
          <label>
            <span>Kind</span>
            <select
              value={kind}
              disabled={Boolean(editing)}
              title={editing ? "An item keeps its kind. Remove it and add it again to change it." : undefined}
              onChange={(event) => changeKind(event.target.value as InventoryKind)}
            >
              <option value="equipment">Equipment</option>
              <option value="material">Material</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as InventoryStatus)}>
              {statuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {kind === "equipment" ? (
            <>
              <label>
                <span>Type</span>
                <input value={type} onChange={(event) => setType(event.target.value)} placeholder="Example: Lift" />
              </label>
              <label>
                <span>Project</span>
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Quantity</span>
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={quantityHint} />
              </label>
              <label>
                <span>Delivery date</span>
                <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
              </label>
              <label className="project-form-wide">
                <span>Project</span>
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  {data.projects.length === 0 && <option value="">Create a project first</option>}
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && (
            <p className="form-error project-form-wide" role="alert">
              {error}
            </p>
          )}
          <div className="project-dialog-actions pdx-actions project-form-wide">
            <button className="pdx-cancel" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="pdx-save" disabled={!canSubmit || busy} type="submit">
              {saveLabel}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}

/** Remove one item, after a confirmation — the program's `.pdx-confirm` card. */
function InventoryRemoveDialog({ item, onClose, onRemoved }: { item: InventoryItem; onClose: () => void; onRemoved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useModalDialog<HTMLElement>(onClose);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (item.kind === "equipment") await deleteEquipment(item.id);
      else await deleteMaterial(item.id);
      await onRemoved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The item could not be removed.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="project-dialog-backdrop pdx" role="presentation">
      <section
        className="project-dialog pdx-dialog pdx-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-remove-title"
        aria-describedby="inventory-remove-description"
        ref={panelRef}
      >
        <div className="pdx-glow" aria-hidden="true">
          <span className="pdx-aurora pdx-aurora-1" />
          <span className="pdx-aurora pdx-aurora-2" />
        </div>
        <header className="pdx-head">
          <div>
            <span className="pdx-eyebrow">
              <span className="pdx-dot" />
              Confirm remove
            </span>
            <h2 id="inventory-remove-title" className="pdx-title">
              Remove <em>item</em>
            </h2>
            <p className="pdx-sub" id="inventory-remove-description">
              This takes it out of the inventory and the Dashboard.
            </p>
          </div>
          <button className="pdx-close" aria-label="Close Remove item" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="pdx-body">
          <div className="pdx-summary">
            <span>
              {KIND_LABEL[item.kind]} · {item.detail}
            </span>
            <strong>{item.name}</strong>
          </div>
          <p className="pdx-note">
            {item.status} · {item.projectName}.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="pdx-actions">
            <button className="pdx-cancel" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="pdx-danger" disabled={busy} type="button" aria-label={`Confirm remove ${item.name}`} onClick={confirm}>
              <Trash2 size={17} /> {busy ? "Removing" : "Remove item"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
