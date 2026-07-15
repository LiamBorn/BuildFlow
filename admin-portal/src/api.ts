// The portal is a separate site but stays LINKED to BuildFlow: it reads live
// object counts from the BuildFlow backend (Vite proxies /api → :4300).

export type BootstrapData = {
  projects: unknown[];
  jobs: unknown[];
  crews: unknown[];
  equipment: unknown[];
  materials: unknown[];
};

// Representative fallback (matches a fresh BuildFlow seed) so the panel always
// renders even if the backend isn't running.
const FALLBACK: BootstrapData = {
  projects: Array.from({ length: 5 }),
  jobs: Array.from({ length: 9 }),
  crews: Array.from({ length: 6 }),
  equipment: Array.from({ length: 6 }),
  materials: Array.from({ length: 5 })
};

export async function fetchBuildFlowData(): Promise<{ data: BootstrapData; live: boolean }> {
  try {
    const res = await fetch("/api/bootstrap");
    if (!res.ok) throw new Error(`bootstrap ${res.status}`);
    const json = (await res.json()) as Partial<BootstrapData>;
    return {
      data: {
        projects: json.projects ?? [],
        jobs: json.jobs ?? [],
        crews: json.crews ?? [],
        equipment: json.equipment ?? [],
        materials: json.materials ?? []
      },
      live: true
    };
  } catch {
    return { data: FALLBACK, live: false };
  }
}

// Where the main BuildFlow HUD is served in this dev environment.
export const BUILDFLOW_URL = "http://localhost:5301";
