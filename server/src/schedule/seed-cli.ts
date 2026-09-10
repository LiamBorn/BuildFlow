/* Seed the Route 9 Resurfacing demo project into the main database and run it
   through the CPM engine. Usage (from server/): npm run seed:schedule
   Stop the dev server first — it holds its own in-memory copy of the file and
   would overwrite this write on its next save. When the server is running it
   seeds the same project itself on boot. */
import "../loadEnv.js";
import { BuildFlowStore } from "../database.js";
import { ScheduleRepository } from "./repository.js";
import { PAVING_PROJECT_NUMBER, seedPavingSchedule } from "./seed.js";

const store = await BuildFlowStore.create(undefined, false, { seedDemo: true });
const seeded = seedPavingSchedule(store);
const projectId = seeded?.projectId ?? store.get<{ id: string }>("SELECT id FROM projects WHERE number = ?", [PAVING_PROJECT_NUMBER])?.id;
if (!projectId) throw new Error("Seed did not produce a project");
console.log(seeded ? `Seeded Route 9 Resurfacing (${projectId})` : `Route 9 Resurfacing already present (${projectId})`);

const repo = new ScheduleRepository(store);
const run = repo.runAndStore(projectId);
if (!run) throw new Error("Project vanished");
const { data, result } = run;
const code = (id: string): string => data.activities.find((a) => a.id === id)?.code ?? id;
console.log(
  `Activities ${data.activities.length} · relationships ${data.relationships.length} · crews ${data.crews.length} · calendars ${data.calendars.length}`
);
console.log(
  `Data date ${data.project.dataDate} · project ${result.projectStart} → ${result.projectFinish} · ${result.criticalPath.length} critical · ${result.stats.elapsedMs.toFixed(1)}ms`
);
console.log(`Critical path: ${result.criticalPath.map(code).join(" → ")}`);
if (result.cycles.length) console.log(`Cycles: ${result.cycles.map((c) => c.map(code).join(" → ")).join(" | ")}`);
for (const w of result.warnings) console.log(`warning [${w.code}] ${w.message}`);
for (const a of data.activities) {
  const r = result.activities[a.id];
  const flag = r.isCritical ? "*" : " ";
  console.log(
    `${flag} ${a.code}  ${a.name.padEnd(44)} ${String(r.duration).padStart(3)}d  ${r.earlyStart ?? "—"} → ${r.earlyFinish ?? "—"}  TF ${String(r.totalFloat).padStart(3)}`
  );
}
