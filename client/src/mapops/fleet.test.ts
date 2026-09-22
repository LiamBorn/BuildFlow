/**
 * Where each machine is, and where it goes next — read off the records, never invented.
 *
 * What is recorded here: that a machine is placed at the project it is assigned to and nowhere
 * else; that a job's ask ("Boom Lift") finds the right machine by name, type or kind and not by
 * a model number; that the next move is the earliest job ELSEWHERE that has no machine of its
 * own; that "moving", "late" and "tight" come from the clock against the schedule; and that a
 * job nobody can answer is reported as a gap rather than quietly matched to the wrong machine.
 */
import { describe, expect, it } from "vitest";
import type { Equipment, Job, Project } from "@buildflow/shared";
import { attentionOrder, buildFleet, describeLead, jobStart, matchesEquipment } from "./fleet";

const project = (id: string, name: string, latitude: number, longitude: number): Project => ({
  id,
  name,
  slug: id,
  location: "Austin, TX",
  address: `${name}, Austin, TX`,
  type: "Commercial",
  contractType: "GMP",
  managerId: "u-matt",
  targetCompletion: "2026-12-01",
  percentComplete: 20,
  scheduleHealth: "On Track",
  status: "In Progress",
  image: "office-building",
  latitude,
  longitude
});

const job = (id: string, projectId: string, requiredEquipment: string, startDate: string, endDate = startDate, startTime = "7:00 AM"): Job => ({
  id,
  projectId,
  name: id,
  phase: `${requiredEquipment} work`,
  location: "Austin",
  startDate,
  endDate,
  startTime,
  endTime: "3:30 PM",
  requiredLabor: 4,
  requiredEquipment,
  materialsStatus: "Delivered",
  status: "Confirmed",
  priority: "Normal",
  notes: "",
  percentComplete: 0
});

const machine = (id: string, name: string, type: string, status: Equipment["status"], assignedTo?: string): Equipment => ({ id, name, type, status, assignedTo });

// Harborview and Pinecrest are ~10 miles apart in the demo; Riverside sits between
const harborview = project("p-harborview", "Harborview Apartments", 30.2633, -97.7502);
const pinecrest = project("p-pinecrest", "Pinecrest Medical Center", 30.4011, -97.7186);
const riverside = project("p-riverside", "Riverside Office Building", 30.2672, -97.7431);
const NOW = new Date(2026, 8, 22, 9, 0); // Tue 22 Sep 2026, 9:00 local

describe("matching a job's ask to a machine", () => {
  const lift = machine("eq-lift", "Boom Lift #4", "Lift", "In Use");
  const pump = machine("eq-pump", "Concrete Pump #2", "Pump", "In Use");
  const excavator = machine("eq-ex", "Excavator 320", "Excavator", "In Use");

  it("reads the ask against the name, the type and the kind", () => {
    expect(matchesEquipment("Boom Lift", lift)).toBe(true);
    expect(matchesEquipment("Concrete Pump", pump)).toBe(true);
    expect(matchesEquipment("Excavator", excavator)).toBe(true);
    expect(matchesEquipment("Lift", lift)).toBe(true);
  });

  it("does not hand a scissor-lift job to a boom lift, or a paver job to anything", () => {
    expect(matchesEquipment("Scissor Lift", lift)).toBe(false);
    expect(matchesEquipment("Paver", excavator)).toBe(false);
    expect(matchesEquipment("", lift)).toBe(false);
  });

  it("lets a machine named only by its type answer a more particular ask, and refuses one that says otherwise", () => {
    expect(matchesEquipment("Concrete Pump", machine("eq-p3", "Pump #3", "Pump", "Available"))).toBe(true);
    expect(matchesEquipment("Concrete Pump", machine("eq-tp", "Trash Pump #1", "Pump", "Available"))).toBe(false);
  });

  it("treats a model number as a model, not a kind", () => {
    // "320" is not what a job asks for
    expect(matchesEquipment("320", excavator)).toBe(false);
  });
});

describe("placing the fleet", () => {
  it("puts a machine at the project it is assigned to and nowhere else", () => {
    const fleet = buildFleet(
      { projects: [harborview, pinecrest], equipment: [machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview")], jobs: [] },
      NOW
    );
    expect(fleet.machines[0].site?.id).toBe("p-harborview");
    expect(fleet.machines[0].state).toBe("on-site");
    expect(fleet.machines[0].move).toBeNull();
    expect(fleet.machines[0].attention).toBeNull();
  });

  it("says a machine with no site is at the yard, and does not place it", () => {
    const fleet = buildFleet({ projects: [harborview], equipment: [machine("eq-truck", "Utility Truck #8", "Truck", "Available")], jobs: [] }, NOW);
    expect(fleet.machines[0].site).toBeNull();
    expect(fleet.machines[0].state).toBe("yard");
  });

  it("finds where it goes next: the earliest job elsewhere that has no machine of its own", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest, riverside],
        equipment: [machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview")],
        jobs: [
          job("j-later", "p-riverside", "Boom Lift", "2026-09-30"),
          job("j-next", "p-pinecrest", "Boom Lift", "2026-09-24", "2026-09-25", "8:00 AM"),
          job("j-other-kind", "p-pinecrest", "Excavator", "2026-09-23")
        ]
      },
      NOW
    );
    const [lift] = fleet.machines;
    expect(lift.move?.to.id).toBe("p-pinecrest");
    expect(lift.move?.job.id).toBe("j-next");
    expect(lift.move?.neededBy).toEqual(new Date(2026, 8, 24, 8, 0));
    // ~10 road miles at a towing speed, with loading: an estimate, and a plausible one
    expect(lift.move?.distanceMiles).toBeGreaterThan(8);
    expect(lift.move?.distanceMiles).toBeLessThan(16);
    expect(lift.move?.etaMinutes).toBeGreaterThan(30);
    expect(lift.move?.etaMinutes).toBeLessThan(60);
    expect(lift.move?.risk).toBe("on-time");
    // two days out with nothing keeping it: not moving yet
    expect(lift.state).toBe("on-site");
  });

  it("does not send a machine to a site that already has one like it", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest],
        equipment: [
          machine("eq-lift-a", "Boom Lift #4", "Lift", "In Use", "p-harborview"),
          machine("eq-lift-b", "Boom Lift #5", "Lift", "In Use", "p-pinecrest")
        ],
        jobs: [job("j-covered", "p-pinecrest", "Boom Lift", "2026-09-23")]
      },
      NOW
    );
    expect(fleet.machines.find((m) => m.equipment.id === "eq-lift-a")?.move).toBeNull();
  });

  it("calls a machine moving when its next job elsewhere is due today and nothing keeps it", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest],
        equipment: [machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview")],
        jobs: [job("j-today", "p-pinecrest", "Boom Lift", "2026-09-22", "2026-09-23", "1:00 PM")]
      },
      NOW
    );
    expect(fleet.machines[0].state).toBe("moving");
    expect(fleet.machines[0].move?.risk).toBe("on-time");
  });

  it("says a move is late when it is needed sooner than it can get there, and puts it first", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest],
        equipment: [
          machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview"),
          machine("eq-pump", "Concrete Pump #2", "Pump", "In Use", "p-harborview")
        ],
        jobs: [
          // needed an hour ago, ten miles away
          job("j-late", "p-pinecrest", "Boom Lift", "2026-09-22", "2026-09-22", "8:00 AM"),
          // needed in 90 minutes: tight, not late
          job("j-tight", "p-pinecrest", "Concrete Pump", "2026-09-22", "2026-09-22", "10:30 AM")
        ]
      },
      NOW
    );
    const lift = fleet.machines.find((m) => m.equipment.id === "eq-lift")!;
    const pump = fleet.machines.find((m) => m.equipment.id === "eq-pump")!;
    expect(lift.move?.risk).toBe("late");
    expect(lift.attention).toMatch(/Needed at Pinecrest Medical Center 1h ago and still at Harborview Apartments/);
    expect(pump.move?.risk).toBe("tight");
    expect(pump.attention).toMatch(/needs it in 1h 30m/);
    expect(attentionOrder(fleet).map((m) => m.equipment.id)).toEqual(["eq-lift", "eq-pump"]);
  });

  it("holds a machine on the job that keeps it, and counts the move from when that job ends", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest],
        equipment: [machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview")],
        jobs: [
          job("j-here", "p-harborview", "Boom Lift", "2026-09-21", "2026-09-24"),
          job("j-there", "p-pinecrest", "Boom Lift", "2026-09-24", "2026-09-24", "7:00 AM")
        ]
      },
      NOW
    );
    const [lift] = fleet.machines;
    expect(lift.job?.id).toBe("j-here");
    expect(lift.state).toBe("on-site");
    // it cannot leave until the 24th is over, and Pinecrest wants it that morning
    expect(lift.move?.risk).toBe("late");
  });

  it("flags a down machine that a job is waiting on", () => {
    const fleet = buildFleet(
      {
        projects: [harborview, pinecrest],
        equipment: [machine("eq-ex", "Excavator 320", "Excavator", "Maintenance", "p-pinecrest")],
        jobs: [job("j-dig", "p-pinecrest", "Excavator", "2026-09-24")]
      },
      NOW
    );
    expect(fleet.machines[0].state).toBe("down");
    expect(fleet.machines[0].attention).toMatch(/^Down for maintenance while Excavator work at Pinecrest Medical Center needs an excavator in 2 days\./);
  });

  it("reports a job nobody can answer as a gap, not a match", () => {
    const fleet = buildFleet(
      {
        projects: [harborview],
        equipment: [machine("eq-lift", "Boom Lift #4", "Lift", "In Use", "p-harborview")],
        jobs: [job("j-pave", "p-harborview", "Paver", "2026-09-25"), job("j-done", "p-harborview", "Paver", "2026-09-10")]
      },
      NOW
    );
    // the past job is over and does not count
    expect(fleet.gaps.map((gap) => gap.job.id)).toEqual(["j-pave"]);
    expect(fleet.gaps[0].needed).toBe("Paver");
    expect(fleet.machines[0].move).toBeNull();
  });
});

describe("the small words", () => {
  it("reads a job's start from its date and its clock time", () => {
    expect(jobStart(job("j", "p", "Lift", "2026-09-24", "2026-09-24", "1:30 PM"))).toEqual(new Date(2026, 8, 24, 13, 30));
    expect(jobStart(job("j", "p", "Lift", "2026-09-24", "2026-09-24", "12:15 AM"))).toEqual(new Date(2026, 8, 24, 0, 15));
    // an unreadable time falls to the working day's start rather than midnight
    expect(jobStart(job("j", "p", "Lift", "2026-09-24", "2026-09-24", "first thing"))).toEqual(new Date(2026, 8, 24, 7, 0));
  });

  it("says how far off a moment is the way a person would", () => {
    expect(describeLead(NOW, new Date(2026, 8, 22, 9, 45))).toBe("in 45m");
    expect(describeLead(NOW, new Date(2026, 8, 22, 11, 10))).toBe("in 2h 10m");
    expect(describeLead(NOW, new Date(2026, 8, 22, 7, 0))).toBe("2h ago");
    expect(describeLead(NOW, new Date(2026, 8, 25, 9, 0))).toBe("in 3 days");
  });
});
