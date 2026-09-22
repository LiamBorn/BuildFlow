/**
 * First run: an empty workspace reaches a booked week from the Schedule landing
 * alone. Four steps with the forms right there — a crew, a project, a job (added
 * or imported), a booking — and, for a trial, sample data that loads in one click
 * and leaves in one click.
 */
import { useState, type FormEvent } from "react";
import { Check, Sparkles } from "lucide-react";
import type { BootstrapPayload } from "@buildflow/shared";
import { createCrew, createProject, loadSampleData, removeSampleData } from "../api";
import type { ScheduleTarget } from "./links";
import { toIsoDate, addDays } from "../components/ui/gantt";

const TRADES = ["Concrete", "Framing", "Sitework", "Excavation", "Asphalt", "Electrical", "Plumbing", "HVAC", "Roofing", "Finishes"];

/** True while the workspace is missing any of the four things a booked week needs. */
export function firstRunNeeded(data: Pick<BootstrapPayload, "crews" | "projects" | "jobs" | "assignments">) {
  return data.crews.length === 0 || data.projects.length === 0 || data.jobs.length === 0 || data.assignments.length === 0;
}

export function FirstRunPanel({
  headless = false,
  data,
  reload,
  onNotice,
  onAddJob,
  onImport,
  onOpenPage
}: {
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
  data: BootstrapPayload;
  reload: () => Promise<void>;
  onNotice?: (text: string, options?: { error?: boolean }) => void;
  /** Opens the landing's job picker on the first crew (needs a crew and a project). */
  onAddJob: () => void;
  /** Opens the schedule import dialog (P6 / MS Project files). */
  onImport: () => void;
  onOpenPage: (page: ScheduleTarget) => void;
}) {
  const [crewName, setCrewName] = useState("");
  const [crewLead, setCrewLead] = useState("");
  const [specialty, setSpecialty] = useState(TRADES[0]);
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState(() => toIsoDate(addDays(new Date(), 90)));
  const [busy, setBusy] = useState<string | null>(null);

  const hasCrew = data.crews.length > 0;
  const hasProject = data.projects.length > 0;
  const hasJob = data.jobs.length > 0;
  const hasBooking = data.assignments.length > 0;
  if (!firstRunNeeded(data) && !data.sampleData) return null;

  const fail = (what: string, error: unknown) =>
    onNotice?.(`Could not ${what}: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
  const run = async (step: string, work: () => Promise<void>) => {
    setBusy(step);
    try {
      await work();
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const addCrew = (event: FormEvent) => {
    event.preventDefault();
    const name = crewName.trim();
    if (!name) return;
    void run("crew", async () => {
      try {
        await createCrew({
          name,
          specialty,
          foreman: crewLead.trim() || "Crew lead",
          laborMix: [{ category: "Labor", role: "Laborers", count: 4 }]
        });
        setCrewName("");
        setCrewLead("");
        onNotice?.(`${name} is ready to book.`);
      } catch (error) {
        fail("create the crew", error);
      }
    });
  };
  // a project needs someone to answer for it; whoever is setting the workspace up will do
  const manager = data.activeUser ?? data.users[0];
  const addProject = (event: FormEvent) => {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    void run("project", async () => {
      try {
        await createProject({
          name,
          location: location.trim() || "On site",
          address: location.trim() || "On site",
          type: "Commercial",
          contractType: "Fixed Price",
          managerId: manager.id,
          targetCompletion: target,
          percentComplete: 0,
          status: "Planned",
          scheduleHealth: "On Track"
        });
        setProjectName("");
        onNotice?.(`${name} created — now add its first job.`);
      } catch (error) {
        fail("create the project", error);
      }
    });
  };
  const loadSample = () =>
    void run("sample", async () => {
      try {
        await loadSampleData();
        onNotice?.("Sample data loaded — explore every view, then remove it from here when you are ready for your own work.");
      } catch (error) {
        fail("load sample data", error);
      }
    });
  const removeSample = () =>
    void run("sample", async () => {
      try {
        await removeSampleData();
        onNotice?.("Sample data removed. The workspace is yours.");
      } catch (error) {
        fail("remove sample data", error);
      }
    });

  if (data.sampleData) {
    return (
      <section
        className={`sched-home-section sched-firstrun is-sample${headless ? " is-headless" : ""}`}
        aria-label="Sample data"
        data-tutorial-id="schedule-first-run"
      >
        {headless ? (
          <p className="sched-section-note">
            Every view is showing the starter workspace for your trade. Remove it when you are ready for your own work.
          </p>
        ) : (
          <header>
            <h2>
              <Sparkles size={16} aria-hidden="true" /> Exploring with sample data
            </h2>
            <span>Every view is showing the starter workspace for your trade. Remove it when you are ready for your own work.</span>
          </header>
        )}
        <footer className="sched-firstrun-foot">
          <button type="button" className="sched-rail-link" disabled={busy !== null} onClick={removeSample}>
            {busy === "sample" ? "Removing…" : "Remove sample data"}
          </button>
        </footer>
      </section>
    );
  }

  const step = (done: boolean, label: string) => (
    <span className={`sched-firstrun-mark${done ? " is-done" : ""}`} aria-hidden="true">
      {done ? <Check size={14} /> : label}
    </span>
  );

  return (
    <section
      className={`sched-home-section sched-firstrun${headless ? " is-headless" : ""}`}
      aria-label="Set up your schedule"
      data-tutorial-id="schedule-first-run"
    >
      {headless ? (
        <p className="sched-section-note">Four steps from an empty workspace to a booked week — all from here.</p>
      ) : (
        <header>
          <h2>Set up your schedule</h2>
          <span>Four steps from an empty workspace to a booked week — all from here.</span>
        </header>
      )}
      <ol className="sched-firstrun-steps">
        <li className={hasCrew ? "is-done" : ""}>
          {step(hasCrew, "1")}
          <div>
            <strong>Create a crew</strong>
            {hasCrew ? (
              <em>{data.crews.length === 1 ? data.crews[0].name : `${data.crews.length} crews`} — ready to book.</em>
            ) : (
              <form className="sched-firstrun-form" onSubmit={addCrew}>
                <input
                  aria-label="Crew name"
                  placeholder="Crew name (Concrete Crew 1)"
                  value={crewName}
                  onChange={(event) => setCrewName(event.target.value)}
                  required
                />
                <input
                  aria-label="Crew lead"
                  placeholder="Crew lead"
                  value={crewLead}
                  onChange={(event) => setCrewLead(event.target.value)}
                />
                <select aria-label="Trade" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
                  {TRADES.map((trade) => (
                    <option key={trade}>{trade}</option>
                  ))}
                </select>
                <button type="submit" disabled={busy !== null || !crewName.trim()}>
                  {busy === "crew" ? "Creating…" : "Create crew"}
                </button>
              </form>
            )}
          </div>
        </li>
        <li className={hasProject ? "is-done" : ""}>
          {step(hasProject, "2")}
          <div>
            <strong>Create a project</strong>
            {hasProject ? (
              <em>{data.projects.length === 1 ? data.projects[0].name : `${data.projects.length} projects`}.</em>
            ) : (
              <form className="sched-firstrun-form" onSubmit={addProject}>
                <input
                  aria-label="Project name"
                  placeholder="Project name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  required
                />
                <input
                  aria-label="Location"
                  placeholder="Location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
                <input aria-label="Target completion" type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
                <button type="submit" disabled={busy !== null || !projectName.trim()}>
                  {busy === "project" ? "Creating…" : "Create project"}
                </button>
              </form>
            )}
          </div>
        </li>
        <li className={hasJob ? "is-done" : ""}>
          {step(hasJob, "3")}
          <div>
            <strong>Add a job</strong>
            {hasJob ? (
              <em>{data.jobs.length === 1 ? data.jobs[0].name : `${data.jobs.length} jobs`}.</em>
            ) : (
              <em>Add one on the first crew this week, or import a schedule from Primavera P6 or Microsoft Project.</em>
            )}
            <div className="sched-firstrun-actions">
              <button
                type="button"
                className="sched-book"
                disabled={!hasCrew || !hasProject}
                onClick={onAddJob}
                title={hasCrew && hasProject ? "Add a job on the first crew this week" : "A crew and a project first"}
              >
                Add a job
              </button>
              <button type="button" className="sched-rail-link" onClick={onImport}>
                Import a schedule
              </button>
            </div>
          </div>
        </li>
        <li className={hasBooking ? "is-done" : ""}>
          {step(hasBooking, "4")}
          <div>
            <strong>Book it on the Week board</strong>
            <em>
              {hasBooking
                ? "Booked — the week is on the board."
                : "A job added here is booked on its crew the same day; a queued job can be dragged onto any crew's day on the Week board."}
            </em>
            {hasJob && !hasBooking && (
              <div className="sched-firstrun-actions">
                <button type="button" className="sched-book" onClick={() => onOpenPage("week")}>
                  Open the Week board
                </button>
              </div>
            )}
          </div>
        </li>
      </ol>
      <footer className="sched-firstrun-foot">
        <span>Just exploring? Load the starter workspace for your trade and remove it whenever you like.</span>
        <button
          type="button"
          className="sched-rail-link"
          disabled={busy !== null || hasProject}
          title={hasProject ? "Sample data loads into an empty workspace" : undefined}
          onClick={loadSample}
        >
          {busy === "sample" ? "Loading…" : "Load sample data"}
        </button>
      </footer>
    </section>
  );
}
