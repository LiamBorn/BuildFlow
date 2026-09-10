/* ============================================================================
   REST surface for the Schedule Creation Tool. Auth-gated and tenant-bound by
   the "/api/schedule-tool" prefix in app.ts, so `store` is the caller's org.
   ========================================================================== */
import type { Express, Response } from "express";
import { z } from "zod";
import type { BuildFlowStore } from "../database.js";
import { RepositoryError, ScheduleRepository } from "./repository.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");
const id = z.string().trim().min(1);

const activitySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string(),
  wbsId: id.nullable().optional(),
  durationMode: z.enum(["fixed", "production"]),
  fixedDuration: z.number().nonnegative().nullable().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().nullable().optional(),
  productionRate: z.number().positive().nullable().optional(),
  crewCount: z.number().int().positive().nullable().optional(),
  calendarId: id,
  crewId: id.nullable().optional(),
  constraint: z
    .object({ type: z.enum(["SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"]), date: isoDate })
    .nullable()
    .optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  actualStart: isoDate.nullable().optional(),
  actualFinish: isoDate.nullable().optional(),
  stationStart: z.string().nullable().optional(),
  stationEnd: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().optional()
});

const relationshipSchema = z.object({
  predecessorId: id,
  successorId: id,
  type: z.enum(["FS", "SS", "FF", "SF"]),
  lag: z.number().int().optional()
});

const calendarSchema = z.object({
  name: z.string().trim().min(1),
  workdays: z.array(z.boolean()).length(7),
  hoursPerDay: z.number().positive().optional(),
  holidays: z.array(isoDate).optional(),
  exceptions: z.array(isoDate).optional(),
  blackoutRanges: z.array(z.object({ start: isoDate, end: isoDate, reason: z.string() })).optional()
});

const wbsSchema = z.object({
  parentId: id.nullable().optional(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sortOrder: z.number().optional()
});

const baselineSchema = z.object({
  name: z.string().trim().min(1),
  capturedAt: z.string().optional(),
  snapshot: z.record(z.string(), z.object({ earlyStart: isoDate, earlyFinish: isoDate }))
});

const projectPatchSchema = z.object({
  number: z.string().optional(),
  dataDate: isoDate.optional(),
  defaultCalendarId: id.optional()
});

const crewPatchSchema = z.object({
  color: z.string().optional(),
  defaultProductionRate: z.number().nonnegative().nullable().optional(),
  defaultUnit: z.string().nullable().optional()
});

const resultsSchema = z.object({
  activities: z.array(
    z.object({
      id,
      earlyStart: isoDate.nullable(),
      earlyFinish: isoDate.nullable(),
      lateStart: isoDate.nullable(),
      lateFinish: isoDate.nullable(),
      totalFloat: z.number().int().nullable(),
      freeFloat: z.number().int().nullable(),
      isCritical: z.boolean().nullable()
    })
  )
});

function fail(res: Response, error: unknown): void {
  if (error instanceof RepositoryError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error("[schedule-tool]", error instanceof Error ? error.message : error);
  res.status(500).json({ error: "Schedule request failed" });
}

export function registerScheduleToolRoutes(app: Express, store: BuildFlowStore): void {
  const repo = new ScheduleRepository(store);
  const base = "/api/schedule-tool/projects/:projectId";

  app.get(base, (req, res) => {
    try {
      const data = repo.loadProject(req.params.projectId);
      if (!data) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(data);
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch(base, (req, res) => {
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json(repo.updateProject(req.params.projectId, parsed.data));
    } catch (error) {
      fail(res, error);
    }
  });

  /** Server-side recalculation: load → engine → cache → return both. */
  app.post(`${base}/run`, (req, res) => {
    try {
      const out = repo.runAndStore(req.params.projectId);
      if (!out) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(out);
    } catch (error) {
      fail(res, error);
    }
  });

  /** Client-side recalculation writes its cached dates back here. */
  app.post(`${base}/results`, (req, res) => {
    const parsed = resultsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json({ updated: repo.applyScheduleResults(req.params.projectId, parsed.data.activities) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post(`${base}/bootstrap`, (req, res) => {
    try {
      res.json({ created: repo.bootstrapFromJobs(req.params.projectId) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post(`${base}/baselines`, (req, res) => {
    const parsed = z.object({ name: z.string().optional() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(repo.captureBaseline(req.params.projectId, parsed.data.name ?? ""));
    } catch (error) {
      fail(res, error);
    }
  });

  app.put(`${base}/activities/:id`, (req, res) => {
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const b = parsed.data;
      res.json(
        repo.saveActivity({
          id: req.params.id,
          projectId: req.params.projectId,
          code: b.code,
          name: b.name,
          wbsId: b.wbsId ?? null,
          durationMode: b.durationMode,
          fixedDuration: b.fixedDuration ?? undefined,
          quantity: b.quantity ?? undefined,
          unit: b.unit ?? undefined,
          productionRate: b.productionRate ?? undefined,
          crewCount: b.crewCount ?? undefined,
          calendarId: b.calendarId,
          crewId: b.crewId ?? null,
          constraint: b.constraint ?? undefined,
          percentComplete: b.percentComplete ?? 0,
          actualStart: b.actualStart ?? undefined,
          actualFinish: b.actualFinish ?? undefined,
          stationStart: b.stationStart ?? undefined,
          stationEnd: b.stationEnd ?? undefined,
          notes: b.notes ?? undefined,
          sortOrder: b.sortOrder ?? 0
        })
      );
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete(`${base}/activities/:id`, (req, res) => {
    try {
      repo.deleteActivity(req.params.id);
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });

  app.put(`${base}/relationships/:id`, (req, res) => {
    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json(repo.saveRelationship({ ...parsed.data, lag: parsed.data.lag ?? 0, id: req.params.id, projectId: req.params.projectId }));
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete(`${base}/relationships/:id`, (req, res) => {
    try {
      repo.deleteRelationship(req.params.id);
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });

  app.put(`${base}/calendars/:id`, (req, res) => {
    const parsed = calendarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json(
        repo.saveCalendar({
          id: req.params.id,
          projectId: req.params.projectId,
          name: parsed.data.name,
          workdays: parsed.data.workdays,
          hoursPerDay: parsed.data.hoursPerDay ?? 8,
          holidays: parsed.data.holidays ?? [],
          exceptions: parsed.data.exceptions ?? [],
          blackoutRanges: parsed.data.blackoutRanges ?? []
        })
      );
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete(`${base}/calendars/:id`, (req, res) => {
    try {
      repo.deleteCalendar(req.params.id);
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });

  app.put(`${base}/wbs/:id`, (req, res) => {
    const parsed = wbsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json(
        repo.saveWbs({
          id: req.params.id,
          projectId: req.params.projectId,
          parentId: parsed.data.parentId ?? null,
          code: parsed.data.code,
          name: parsed.data.name,
          sortOrder: parsed.data.sortOrder ?? 0
        })
      );
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete(`${base}/wbs/:id`, (req, res) => {
    try {
      repo.deleteWbs(req.params.id);
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });

  app.put(`${base}/baselines/:id`, (req, res) => {
    const parsed = baselineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      res.json(
        repo.saveBaseline({
          id: req.params.id,
          projectId: req.params.projectId,
          name: parsed.data.name,
          capturedAt: parsed.data.capturedAt ?? new Date().toISOString(),
          snapshot: parsed.data.snapshot
        })
      );
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete(`${base}/baselines/:id`, (req, res) => {
    try {
      repo.deleteBaseline(req.params.id);
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch("/api/schedule-tool/crews/:id", (req, res) => {
    const parsed = crewPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      repo.updateCrew(req.params.id, {
        color: parsed.data.color,
        defaultProductionRate: parsed.data.defaultProductionRate === null ? undefined : parsed.data.defaultProductionRate,
        defaultUnit: parsed.data.defaultUnit === null ? undefined : parsed.data.defaultUnit
      });
      res.status(204).send();
    } catch (error) {
      fail(res, error);
    }
  });
}
