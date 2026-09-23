/**
 * Every recharts chart in App.tsx, in one module that loads on demand.
 *
 * Why this file exists at all: recharts and its d3 dependencies are 393 kB raw / 113 kB gzipped,
 * a fifth of the whole JS bundle, and App.tsx imported them at the top level. Charts are drawn on
 * four signed-in pages -- Dashboard, Projects, Reports and DelayIQs -- so every visitor reading
 * the marketing pages downloaded the charting library and never rendered a chart with it. A static
 * import cannot be deferred, and recharts primitives cannot be lazily loaded one at a time either:
 * BarChart and PieChart inspect their children and would not recognise a Suspense wrapper. So the
 * unit that moves has to be a whole chart, which is what each export here is.
 *
 * These are deliberately thin. They hold the recharts JSX exactly as App.tsx had it, including the
 * literal radii, ticks, domains and colour tokens, so that nothing about the rendering changes --
 * the point of the exercise is where the bytes go, not how the charts look. Anything that came
 * from App.tsx's own scope, like the backlog tooltip, arrives as a prop rather than moving here.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ReactElement } from "react";

export type DonutSlice = { name: string; value: number; color: string };
export type ImpactBar = { name: string; days: number };
export type PlannedActualRow = { month: string; planned: number; actual: number };
export type BacklogRow = { month: string; backlog: number };

/** The Dashboard's material-readiness ring and the Projects page's health ring: same chart, different radii. */
export function DonutChart({
  data,
  width = "100%",
  height,
  innerRadius,
  outerRadius,
  paddingAngle,
  stroke
}: {
  data: DonutSlice[];
  /** ResponsiveContainer takes a number of pixels or a percentage literal, not any string. */
  width?: number | `${number}%`;
  height: number;
  innerRadius: number;
  outerRadius: number;
  paddingAngle: number;
  stroke?: string;
}) {
  return (
    <ResponsiveContainer width={width} height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={paddingAngle}
          stroke={stroke}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/** DelayIQs › Impact ForecastIQ: days of impact per delay. */
export function ImpactBarChart({ data }: { data: ImpactBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(28, 28, 26, 0.07)" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip />
        <Bar dataKey="days" fill="var(--bf-color-bad)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Reports › planned against actual hours by month. */
export function PlannedActualChart({ data }: { data: PlannedActualRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={8} margin={{ top: 10, right: 18, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="var(--bf-line-solid)" strokeDasharray="4 6" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--bf-ink-faint)", fontSize: 12 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          ticks={[0, 1500, 3000, 4500, 6000]}
          domain={[0, 6500]}
          tick={{ fill: "var(--bf-ink-faint)", fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: "var(--bf-hover)" }} />
        <Bar dataKey="planned" fill="var(--bf-color-series-1)" radius={[5, 5, 0, 0]} barSize={22} />
        <Bar dataKey="actual" fill="var(--bf-color-series-2)" radius={[5, 5, 0, 0]} barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Reports › backlog forecast. The tooltip is App.tsx's own, passed in rather than moved. */
export function BacklogChart({ data, tooltip }: { data: BacklogRow[]; tooltip: ReactElement }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 18, bottom: 6, left: -8 }}>
        <CartesianGrid stroke="var(--bf-line-solid)" strokeDasharray="4 6" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--bf-ink-faint)", fontSize: 12 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          ticks={[0, 2000, 4000, 6000, 8000]}
          domain={[0, 8200]}
          tick={{ fill: "var(--bf-ink-faint)", fontSize: 12 }}
        />
        <Tooltip content={tooltip} cursor={{ stroke: "#ccd5df", strokeWidth: 2 }} />
        <Line
          type="monotone"
          dataKey="backlog"
          stroke="var(--bf-color-series-2)"
          strokeWidth={3}
          dot={{ fill: "var(--bf-color-series-2)", r: 5, stroke: "var(--bf-color-series-2)" }}
          activeDot={{ fill: "var(--bf-color-series-2)", r: 6, stroke: "#ffffff", strokeWidth: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
