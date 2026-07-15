import type { LeadStatus, Priority } from "./api";

export const money = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: n % 1000 === 0 ? 0 : 1 })}k` : `$${n.toLocaleString()}`;

export const moneyFull = (n: number) => `$${n.toLocaleString()}`;

export function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dueLabel(iso: string): { text: string; overdue: boolean } {
  const d = new Date(iso);
  const overdue = d.getTime() < Date.now();
  const text = d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { text, overdue };
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?"
  );
}

// Pipeline stages in board order (open stages only — Won/Lost are terminal).
export const STAGES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal"];

// Map each lead status to one of the design-system tones (--cc-*).
export const statusTone: Record<LeadStatus, string> = {
  New: "blue",
  Contacted: "violet",
  Qualified: "green",
  Proposal: "amber",
  Won: "green",
  Lost: "red"
};

export const priorityTone: Record<Priority, string> = {
  Low: "blue",
  Normal: "violet",
  High: "amber",
  Urgent: "red"
};
