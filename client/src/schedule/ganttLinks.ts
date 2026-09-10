/**
 * Dependency arrows on the Gantt Chart: where a link leaves its predecessor and
 * enters its successor, and the elbow drawn between the two.
 */
import type { DependencyType } from "@buildflow/shared";

export type LinkPoint = { x: number; y: number };
export type BarGeometry = { left: number; right: number; y: number };

/** The bar edges a link joins: FS finish→start, SS start→start, FF finish→finish, SF start→finish. */
export function linkAnchors(type: DependencyType, predecessor: BarGeometry, successor: BarGeometry): { from: LinkPoint; to: LinkPoint } {
  const from = { x: type === "SS" || type === "SF" ? predecessor.left : predecessor.right, y: predecessor.y };
  const to = { x: type === "FF" || type === "SF" ? successor.right : successor.left, y: successor.y };
  return { from, to };
}

/**
 * An orthogonal path from `from` to `to`, leaving to the right and arriving from the
 * left. When the successor starts before the predecessor's edge, or shares its row, the
 * path loops out and back, halfway between the rows (or just under a shared row).
 */
export function linkPath(from: LinkPoint, to: LinkPoint, stub = 12): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  // another row, and the successor does not start before the predecessor's edge: one elbow
  if (to.y !== from.y && to.x >= from.x) {
    return `M${r(from.x)} ${r(from.y)} H${r(from.x + stub)} V${r(to.y)} H${r(to.x)}`;
  }
  const midY = from.y === to.y ? from.y + stub * 1.5 : from.y + (to.y - from.y) / 2;
  return `M${r(from.x)} ${r(from.y)} H${r(from.x + stub)} V${r(midY)} H${r(to.x - stub)} V${r(to.y)} H${r(to.x)}`;
}
