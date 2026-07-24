import { describe, expect, it } from "vitest";
import { buildImportPlan } from "./map.js";
import { parseIsoDurationHours, parseMspdi } from "./mspdi.js";
import { detectFormat, parseSchedule } from "./index.js";
import { ScheduleImportError } from "./types.js";
import { parseXer } from "./xer.js";

/* A small but real-shaped P6 export: two WBS bands (one nested), a summary row,
   a milestone, an undated activity, relationships with lag, and a resource. */
const XER = [
  "ERMHDR\t19.12\t2026-07-16\tProject\tadmin\tAdmin User\tdbxDatabaseNoName\tProject Management\tUSD",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tplan_start_date\tplan_end_date",
  "%R\t4821\tRIVERSIDE\t2026-08-03 08:00\t2026-11-20 17:00",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id\tproj_node_flag",
  "%R\t900\t4821\t1\tRIVER\tRiverside Tower\t\tY",
  "%R\t901\t4821\t2\tSUB\tSubstructure\t900\tN",
  "%R\t902\t4821\t3\tSUP\tSuperstructure\t900\tN",
  "%R\t903\t4821\t4\tSLAB\tSlabs\t902\tN",
  "%T\tRSRC",
  "%F\trsrc_id\trsrc_short_name\trsrc_name",
  "%R\t51\tCONC\tConcrete Crew",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code\tphys_complete_pct\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\ttarget_drtn_hr_cnt",
  "%R\t1001\t4821\t901\tA1000\tExcavate footings\tTT_Task\tTK_Complete\t100\t2026-08-03 08:00\t2026-08-07 17:00\t2026-08-03 08:00\t2026-08-06 17:00\t40",
  "%R\t1002\t4821\t901\tA1010\tPour foundations\tTT_Task\tTK_Active\t45\t2026-08-10 08:00\t2026-08-14 17:00\t\t\t40",
  "%R\t1003\t4821\t903\tA1020\tLevel 2 slab pour\tTT_Task\tTK_NotStart\t0\t2026-08-17 08:00\t2026-08-21 17:00\t\t\t40",
  "%R\t1004\t4821\t902\tM100\tTopping out\tTT_FinMile\tTK_NotStart\t0\t2026-11-20 17:00\t2026-11-20 17:00\t\t\t0",
  "%R\t1005\t4821\t902\tWBS10\tSuperstructure rollup\tTT_WBS\tTK_NotStart\t0\t2026-08-17 08:00\t2026-11-20 17:00\t\t\t0",
  "%R\t1006\t4821\t901\tA1030\tUndated placeholder\tTT_Task\tTK_NotStart\t0\t\t\t\t\t0",
  "%T\tTASKPRED",
  "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
  "%R\t1\t1002\t1001\tPR_FS\t0",
  "%R\t2\t1003\t1002\tPR_SS\t16",
  "%T\tTASKRSRC",
  "%F\ttaskrsrc_id\ttask_id\trsrc_id",
  "%R\t1\t1002\t51",
  "%E"
].join("\n");

/* MSPDI equivalent: outline hierarchy, a summary row, UID 0 project summary,
   a milestone, an FS link with lag, and an assignment. */
const MSPDI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Harborview.mpp</Name>
  <Title>Harborview Apartments</Title>
  <SaveVersion>14</SaveVersion>
  <StartDate>2026-09-01T08:00:00</StartDate>
  <FinishDate>2026-12-18T17:00:00</FinishDate>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Harborview Apartments</Name><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task>
      <UID>1</UID><ID>1</ID><Name>Sitework</Name>
      <OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel>
      <Summary>1</Summary><Milestone>0</Milestone>
      <Start>2026-09-01T08:00:00</Start><Finish>2026-09-25T17:00:00</Finish>
      <Duration>PT160H0M0S</Duration><PercentComplete>20</PercentComplete>
    </Task>
    <Task>
      <UID>2</UID><ID>2</ID><Name>Clear and grub</Name>
      <OutlineNumber>1.1</OutlineNumber><OutlineLevel>2</OutlineLevel>
      <Summary>0</Summary><Milestone>0</Milestone>
      <Start>2026-09-01T08:00:00</Start><Finish>2026-09-10T17:00:00</Finish>
      <Duration>PT64H0M0S</Duration><PercentComplete>100</PercentComplete>
    </Task>
    <Task>
      <UID>3</UID><ID>3</ID><Name>Mass excavation</Name>
      <OutlineNumber>1.2</OutlineNumber><OutlineLevel>2</OutlineLevel>
      <Summary>0</Summary><Milestone>0</Milestone>
      <Start>2026-09-11T08:00:00</Start><Finish>2026-09-25T17:00:00</Finish>
      <Duration>PT88H0M0S</Duration><PercentComplete>0</PercentComplete>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
    </Task>
    <Task>
      <UID>4</UID><ID>4</ID><Name>Notice to proceed</Name>
      <OutlineNumber>2</OutlineNumber><OutlineLevel>1</OutlineLevel>
      <Summary>0</Summary><Milestone>1</Milestone>
      <Start>2026-09-01T08:00:00</Start><Finish>2026-09-01T08:00:00</Finish>
      <Duration>PT0H0M0S</Duration><PercentComplete>0</PercentComplete>
    </Task>
  </Tasks>
  <Resources><Resource><UID>1</UID><Name>Site Crew</Name></Resource></Resources>
  <Assignments><Assignment><UID>1</UID><TaskUID>3</TaskUID><ResourceUID>1</ResourceUID></Assignment></Assignments>
</Project>`;

describe("XER parser", () => {
  const parsed = parseXer(XER);

  it("reads the header, project and activities", () => {
    expect(parsed.format).toBe("xer");
    expect(parsed.source).toBe("Primavera P6 (XER 19.12)");
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0]).toMatchObject({ name: "RIVERSIDE", start: "2026-08-03", finish: "2026-11-20" });
    expect(parsed.activities).toHaveLength(6);
  });

  it("drops the project root node from the WBS but keeps real bands", () => {
    expect(parsed.wbs.map((node) => node.name)).toEqual(["Substructure", "Superstructure", "Slabs"]);
    expect(parsed.wbs.find((node) => node.name === "Slabs")?.parentId).toBe("902");
  });

  it("prefers actual dates over planned ones", () => {
    const done = parsed.activities.find((activity) => activity.code === "A1000")!;
    // target_end_date is the 7th, act_end_date is the 6th — the actual wins.
    expect(done.finish).toBe("2026-08-06");
    const notStarted = parsed.activities.find((activity) => activity.code === "A1010")!;
    expect(notStarted.start).toBe("2026-08-10");
  });

  it("classifies milestones and summary rows", () => {
    expect(parsed.activities.find((a) => a.code === "M100")?.isMilestone).toBe(true);
    expect(parsed.activities.find((a) => a.code === "WBS10")?.isSummary).toBe(true);
    expect(parsed.activities.find((a) => a.code === "A1000")?.isSummary).toBe(false);
  });

  it("reads relationships with type and lag, and resources", () => {
    const pour = parsed.activities.find((a) => a.code === "A1010")!;
    expect(pour.predecessors).toEqual([{ predecessorId: "1001", type: "FS", lagHours: 0 }]);
    expect(pour.resourceNames).toEqual(["Concrete Crew"]);
    const slab = parsed.activities.find((a) => a.code === "A1020")!;
    expect(slab.predecessors).toEqual([{ predecessorId: "1002", type: "SS", lagHours: 16 }]);
  });

  it("looks values up by field name, not column position", () => {
    // Same data, columns reordered and an extra one added — exactly what a
    // different P6 version/export setting produces.
    const reordered = [
      "ERMHDR\t20.12\t2026-07-16\tProject\tadmin\tAdmin\tdbx\tPM\tUSD",
      "%T\tTASK",
      "%F\ttask_name\tguid\ttask_id\tstatus_code\tproj_id\ttarget_end_date\ttask_code\ttask_type\ttarget_start_date",
      "%R\tPour foundations\t{abc}\t1002\tTK_Active\t4821\t2026-08-14 17:00\tA1010\tTT_Task\t2026-08-10 08:00",
      "%E"
    ].join("\n");
    const result = parseXer(reordered);
    expect(result.activities[0]).toMatchObject({
      externalId: "1002",
      code: "A1010",
      name: "Pour foundations",
      start: "2026-08-10",
      finish: "2026-08-14"
    });
  });

  it("tolerates rows with missing trailing columns", () => {
    const short = [
      "%T\tTASK",
      "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_start_date\ttarget_end_date",
      "%R\t7\t1\tA10\tShort row",
      "%E"
    ].join("\n");
    const result = parseXer(short);
    expect(result.activities[0]).toMatchObject({ code: "A10", name: "Short row" });
    expect(result.activities[0].start).toBeUndefined();
  });

  it("rejects a file with no activities", () => {
    expect(() => parseXer("ERMHDR\t19.12\n%T\tPROJECT\n%F\tproj_id\n%R\t1\n%E")).toThrow(ScheduleImportError);
  });
});

describe("MSPDI parser", () => {
  const parsed = parseMspdi(MSPDI);

  it("reads the project and drops the UID 0 summary row", () => {
    expect(parsed.format).toBe("mspdi");
    expect(parsed.projects[0]).toMatchObject({ name: "Harborview Apartments", start: "2026-09-01" });
    expect(parsed.activities.map((a) => a.externalId)).toEqual(["1", "2", "3", "4"]);
  });

  it("turns the outline into a WBS tree", () => {
    expect(parsed.wbs).toHaveLength(1);
    expect(parsed.wbs[0]).toMatchObject({ externalId: "1", name: "Sitework", parentId: undefined });
    // 1.1 and 1.2 hang off the "Sitework" summary (UID 1).
    expect(parsed.activities.find((a) => a.externalId === "2")?.wbsId).toBe("1");
    expect(parsed.activities.find((a) => a.externalId === "3")?.wbsId).toBe("1");
  });

  it("converts LinkLag (tenths of a minute) into hours", () => {
    // 4800 tenths of a minute = 480 minutes = 8h.
    expect(parsed.activities.find((a) => a.externalId === "3")?.predecessors).toEqual([
      { predecessorId: "2", type: "FS", lagHours: 8 }
    ]);
  });

  it("reads milestones, durations and assignments", () => {
    expect(parsed.activities.find((a) => a.externalId === "4")?.isMilestone).toBe(true);
    expect(parsed.activities.find((a) => a.externalId === "2")?.durationHours).toBe(64);
    expect(parsed.activities.find((a) => a.externalId === "3")?.resourceNames).toEqual(["Site Crew"]);
  });

  it("parses ISO-8601 durations", () => {
    expect(parseIsoDurationHours("PT80H0M0S")).toBe(80);
    expect(parseIsoDurationHours("PT7H30M0S")).toBe(7.5);
    expect(parseIsoDurationHours("P2DT4H0M0S")).toBe(52);
    expect(parseIsoDurationHours("garbage")).toBeUndefined();
  });

  it("rejects XML that isn't MSPDI", () => {
    expect(() => parseMspdi("<?xml version='1.0'?><rss><channel/></rss>")).toThrow(/no <Project> element/);
  });
});

describe("format detection", () => {
  it("recognises xer and mspdi by content and extension", () => {
    expect(detectFormat("schedule.xer", XER)).toBe("xer");
    expect(detectFormat("schedule.xml", MSPDI)).toBe("mspdi");
    expect(detectFormat("no-extension", XER)).toBe("xer");
  });

  it("rejects binary .mpp with an actionable hint rather than failing to parse", () => {
    try {
      detectFormat("plan.mpp", "ÐÏà¡±ábinary junk");
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ScheduleImportError);
      expect((error as ScheduleImportError).code).toBe("mpp_unsupported");
      expect((error as ScheduleImportError).hint).toMatch(/Save As/);
    }
  });

  it("rejects an unknown format", () => {
    expect(() => detectFormat("notes.txt", "just some text")).toThrow(/Unrecognised schedule file/);
  });

  it("rejects an empty file", () => {
    expect(() => parseSchedule("empty.xer", "   ")).toThrow(/empty/);
  });
});

describe("mapping to BuildFlow", () => {
  const plan = buildImportPlan(parseXer(XER), { managerId: "u-matt", defaultLocation: "Austin, TX" });

  it("creates one project with flattened phases", () => {
    expect(plan.projects).toHaveLength(1);
    const project = plan.projects[0];
    expect(project.input).toMatchObject({ name: "RIVERSIDE", managerId: "u-matt", targetCompletion: "2026-11-20" });
    // "Slabs" is nested under "Superstructure", so it collapses into that band.
    expect(project.phases.map((phase) => phase.name)).toEqual(["Substructure", "Superstructure"]);
  });

  it("skips summary and undated rows, keeping real work", () => {
    expect(plan.stats.summariesSkipped).toBe(1);
    expect(plan.stats.undatedSkipped).toBe(1);
    expect(plan.stats.jobs).toBe(4);
    expect(plan.projects[0].jobs.map((job) => job.name)).not.toContain("Superstructure rollup");
    expect(plan.projects[0].jobs.map((job) => job.name)).not.toContain("Undated placeholder");
  });

  it("maps percent complete onto job status", () => {
    const jobs = plan.projects[0].jobs;
    expect(jobs.find((job) => job.name === "Excavate footings")?.status).toBe("Complete");
    expect(jobs.find((job) => job.name === "Pour foundations")?.status).toBe("In Progress");
    expect(jobs.find((job) => job.name === "Level 2 slab pour")?.status).toBe("Planned");
  });

  it("preserves relationships in the notes, in the scheduler's vocabulary", () => {
    const slab = plan.projects[0].jobs.find((job) => job.name === "Level 2 slab pour")!;
    expect(slab.notes).toContain("Predecessors: A1010 SS+16h");
    expect(slab.notes).toContain("Activity A1020");
    const pour = plan.projects[0].jobs.find((job) => job.name === "Pour foundations")!;
    expect(pour.notes).toContain("Predecessors: A1000 FS");
    expect(pour.requiredEquipment).toBe("Concrete Crew");
  });

  it("derives phase bounds from the activities inside them", () => {
    const substructure = plan.projects[0].phases.find((phase) => phase.name === "Substructure")!;
    expect(substructure.startDate).toBe("2026-08-03");
    expect(substructure.endDate).toBe("2026-08-14");
  });

  it("reports what it could not carry across", () => {
    expect(plan.warnings.join(" ")).toMatch(/relationship\(s\) were read/);
    expect(plan.warnings.join(" ")).toMatch(/Crew assignments, materials status/);
  });

  it("maps an MSPDI schedule too", () => {
    const mspdiPlan = buildImportPlan(parseMspdi(MSPDI), { managerId: "u-matt" });
    expect(mspdiPlan.projects[0].input.name).toBe("Harborview Apartments");
    expect(mspdiPlan.projects[0].phases.map((p) => p.name)).toEqual(["Sitework", "Imported"]);
    // The milestone has no summary parent, so it lands in the catch-all band.
    expect(mspdiPlan.projects[0].jobs.find((job) => job.name === "Notice to proceed")?.phase).toBe("Imported");
    expect(mspdiPlan.stats.milestones).toBe(1);
  });
});
