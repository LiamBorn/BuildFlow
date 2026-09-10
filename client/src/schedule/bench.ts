/**
 * A generated workspace of any size, for measuring the schedule pages at scale
 * (P3.5: every page under 100 ms with 2,000 jobs). In development, `?bench=2000`
 * on a schedule deep link renders the pages against a 2,000-job workspace built
 * from the real one; the tests build the same workspace to render each page.
 */
import { useMemo } from "react";
import type { BootstrapPayload, Crew, Job, JobDependency, Phase, Project, ScheduleAssignment, Status } from "@buildflow/shared";
import { addDays, parseIsoDate, toIsoDate } from "../components/ui/gantt";

export type BenchOptions = { jobs?: number; crews?: number; projects?: number; weekStart?: string };

/** A small deterministic generator, so a run is the same run every time. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIALTIES = ["Concrete", "Framing", "MEP", "Sitework", "Finishes", "Steel", "Paving", "Roofing"];
const TOWNS = ["Pinecrest", "Riverside", "Harborview", "Summit", "Westlake", "Oak Hill", "Mueller", "Hyde Park"];
const KINDS = ["Medical", "Tower", "Depot", "Campus", "Plaza", "Terminal", "Center", "Yard"];
const PHASES = [
  "Mobilization",
  "Mass Excavation",
  "Foundations",
  "Slab on Grade",
  "Framing",
  "Rough-in",
  "Envelope",
  "Finishes",
  "Punch List"
];
const STATUSES: Status[] = [
  "Planned",
  "Planned",
  "Ready",
  "Confirmed",
  "Confirmed",
  "In Progress",
  "In Progress",
  "On Site",
  "At Risk",
  "Complete"
];

/**
 * Builds on the real payload (people, settings, the work calendar) and replaces
 * projects, crews, jobs and bookings with generated ones. Bookings fill crew-days
 * without double-booking, so the visible week is a full board.
 */
export function makeLargeWorkspace(base: BootstrapPayload, options: BenchOptions = {}): BootstrapPayload {
  const jobCount = options.jobs ?? 2000;
  const crewCount = options.crews ?? 40;
  const projectCount = options.projects ?? 25;
  const next = random(20260615);
  const monday = parseIsoDate(options.weekStart ?? toIsoDate(new Date()));
  const baseProject = base.projects[0];
  const baseCrew = base.crews[0];
  const baseJob = base.jobs[0];
  const day = (offset: number) => toIsoDate(addDays(monday, offset));

  const projects: Project[] = Array.from({ length: projectCount }, (_, index) => ({
    ...baseProject,
    id: `bench-p-${index + 1}`,
    name: `${TOWNS[index % TOWNS.length]} ${KINDS[Math.floor(index / TOWNS.length) % KINDS.length]} ${index + 1}`,
    slug: `bench-project-${index + 1}`,
    location: `${TOWNS[index % TOWNS.length]}, Austin`,
    targetCompletion: day(60 + (index % 6) * 14),
    percentComplete: Math.floor(next() * 90),
    status: "In Progress"
  }));
  const crews: Crew[] = Array.from({ length: crewCount }, (_, index) => ({
    ...baseCrew,
    id: `bench-c-${index + 1}`,
    name: `${SPECIALTIES[index % SPECIALTIES.length]} Crew ${index + 1}`,
    specialty: SPECIALTIES[index % SPECIALTIES.length],
    lead: `Lead ${index + 1}`,
    size: 4 + (index % 6),
    rate: 80 + (index % 5) * 10
  }));
  const phases: Phase[] = projects.flatMap((project, index) => [
    {
      id: `bench-ph-${index}-a`,
      projectId: project.id,
      name: "Foundations",
      status: "On Track",
      percentComplete: 40,
      startDate: day(-30),
      endDate: day(20 + (index % 5)),
      color: "#1976d2",
      sequence: 1
    },
    {
      id: `bench-ph-${index}-b`,
      projectId: project.id,
      name: "Structure",
      status: "Not Started",
      percentComplete: 0,
      startDate: day(21),
      endDate: day(50 + (index % 9)),
      color: "#7b1fa2",
      sequence: 2
    }
  ]);

  const jobs: Job[] = [];
  const assignments: ScheduleAssignment[] = [];
  const dependencies: JobDependency[] = [];
  const bookedCrewDays = new Set<string>();
  const lastJobOfProject = new Map<string, string>();
  for (let index = 0; index < jobCount; index++) {
    const project = projects[index % projectCount];
    const specialtyIndex = Math.floor(next() * SPECIALTIES.length);
    const startOffset = Math.floor(next() * 84) - 42; // twelve weeks around this week
    const duration = 1 + Math.floor(next() * 5);
    const startDate = day(startOffset);
    const endDate = day(startOffset + duration - 1);
    const job: Job = {
      ...baseJob,
      id: `bench-j-${index + 1}`,
      projectId: project.id,
      name: `${PHASES[index % PHASES.length]} ${Math.floor(index / PHASES.length) + 1}`,
      phase: PHASES[index % PHASES.length],
      location: project.location,
      startDate,
      endDate,
      requiredLabor: 2 + Math.floor(next() * 8),
      status: STATUSES[Math.floor(next() * STATUSES.length)],
      priority: next() < 0.2 ? "High" : "Normal",
      percentComplete: startOffset < 0 ? Math.floor(next() * 100) : 0,
      baselineStart: startDate,
      baselineEnd: endDate
    };
    jobs.push(job);
    // one crew of the job's trade, booked on every day of the job the crew still has free
    const candidates = crews.filter((crew) => crew.specialty === SPECIALTIES[specialtyIndex]);
    const crew = candidates[Math.floor(next() * candidates.length)] ?? crews[index % crews.length];
    for (let offset = 0; offset < duration; offset++) {
      const date = day(startOffset + offset);
      const key = `${crew.id}|${date}`;
      if (bookedCrewDays.has(key)) continue;
      bookedCrewDays.add(key);
      assignments.push({
        id: `bench-a-${assignments.length + 1}`,
        jobId: job.id,
        crewId: crew.id,
        date,
        status: job.status,
        conflicts: []
      });
    }
    const previous = lastJobOfProject.get(project.id);
    if (previous)
      dependencies.push({ id: `bench-d-${dependencies.length + 1}`, predecessorId: previous, successorId: job.id, type: "FS", lagDays: 0 });
    lastJobOfProject.set(project.id, job.id);
  }

  return { ...base, projects, crews, phases, jobs, assignments, dependencies };
}

/* ── the dev switch: `?bench=<n>` on a schedule deep link ── */
let benchSize = 0;
const cache = new WeakMap<BootstrapPayload, { size: number; data: BootstrapPayload }>();

const readBench = (url: string) => {
  const match = /[?&]bench=(\d+)/.exec(url);
  if (match) benchSize = Number(match[1]);
};

/** The bench size asked for on the hash, sticky for the session once seen (`bench=0` turns it off). */
export function currentBenchSize(): number {
  if (!import.meta.env.DEV || typeof window === "undefined") return 0;
  readBench(window.location.href);
  return benchSize;
}

/** The page's data, or the generated workspace while a bench is on (development only). */
export function useBenchData(data: BootstrapPayload): BootstrapPayload {
  const size = currentBenchSize();
  return useMemo(() => {
    if (size <= 0) return data;
    const hit = cache.get(data);
    if (hit && hit.size === size) return hit.data;
    const built = makeLargeWorkspace(data, {
      jobs: size,
      crews: Math.max(8, Math.round(size / 50)),
      projects: Math.max(4, Math.round(size / 80))
    });
    cache.set(data, { size, data: built });
    return built;
  }, [data, size]);
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  readBench(window.location.href);
  // the app rewrites a deep link to its canonical form before the page renders; the event still carries the URL as typed
  window.addEventListener("hashchange", (event) => readBench(event.newURL));
  (window as unknown as { buildflowBench?: (size: number) => void }).buildflowBench = (size: number) => {
    benchSize = size;
  };
}
