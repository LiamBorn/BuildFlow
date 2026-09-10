/**
 * The dependency arrows drawn over the Gantt Chart's bars. Bars are found by
 * their data-feature-id inside the timeline, so the arrows follow whatever the
 * chart renders; x comes from the chart's own geometry, y from where each bar
 * row actually landed.
 */
import { useLayoutEffect, useState } from "react";
import type { JobDependency } from "@buildflow/shared";
import { getOffset, useGantt } from "../components/ui/gantt";
import { linkAnchors, linkPath, type BarGeometry } from "./ganttLinks";

// jsdom has no CSS.escape; job ids are plain, so a quote-safe fallback is enough
const escapeId = (id: string) =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/["\\]/g, (match) => `\\${match}`);

export type GanttLinkRow = { id: string; name: string; startAt: Date; endAt: Date };

type Drawn = { id: string; d: string; critical: boolean; title: string };

export function GanttDependencyLinks({ links, rows, critical }: { links: JobDependency[]; rows: GanttLinkRow[]; critical: Set<string> }) {
  const gantt = useGantt();
  const [drawn, setDrawn] = useState<{ paths: Drawn[]; width: number; height: number }>({ paths: [], width: 0, height: 0 });

  useLayoutEffect(() => {
    const timeline = gantt.timelineRef.current;
    const list = timeline?.querySelector<HTMLElement>(".gantt-feature-list");
    if (!timeline || !list) return;
    const measure = () => {
      const listRect = list.getBoundingClientRect();
      const bars = new Map<string, BarGeometry>();
      for (const row of rows) {
        const el = list.querySelector<HTMLElement>(`.gantt-feature[data-feature-id="${escapeId(row.id)}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        bars.set(row.id, {
          left: getOffset(row.startAt, gantt),
          right: getOffset(row.endAt, gantt),
          y: rect.top - listRect.top + rect.height / 2
        });
      }
      const names = new Map(rows.map((row) => [row.id, row.name]));
      const paths: Drawn[] = [];
      for (const link of links) {
        const predecessor = bars.get(link.predecessorId);
        const successor = bars.get(link.successorId);
        if (!predecessor || !successor) continue;
        const { from, to } = linkAnchors(link.type, predecessor, successor);
        const lag = link.lagDays ? ` ${link.lagDays > 0 ? "+" : ""}${link.lagDays}d` : "";
        paths.push({
          id: link.id,
          d: linkPath(from, to),
          critical: critical.has(link.predecessorId) && critical.has(link.successorId),
          title: `${names.get(link.predecessorId)} → ${names.get(link.successorId)} (${link.type}${lag})`
        });
      }
      setDrawn({ paths, width: list.scrollWidth, height: list.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [gantt, links, rows, critical]);

  if (drawn.paths.length === 0) return null;
  return (
    <svg className="gantt-links" width={drawn.width} height={drawn.height} aria-hidden="true">
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" />
        </marker>
        <marker
          id="gantt-arrow-critical"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
          className="is-critical"
        >
          <path d="M0 0 L8 4 L0 8 Z" />
        </marker>
      </defs>
      {drawn.paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          className={path.critical ? "is-critical" : undefined}
          markerEnd={`url(#${path.critical ? "gantt-arrow-critical" : "gantt-arrow"})`}
        >
          <title>{path.title}</title>
        </path>
      ))}
    </svg>
  );
}
