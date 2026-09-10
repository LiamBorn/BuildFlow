/* ============================================================================
   CPM engine — pure TypeScript, no framework imports (CLAUDE.md rule 1).
   calendar.ts: working-day arithmetic (spec §6.1).
   schedule.ts: duration resolution, Kahn ordering + cycle reporting, forward
   and backward passes, float and criticality (spec §6.2 – §6.4).
   Tests live in __tests__/ and gate every UI phase (spec §6.5).
   ========================================================================== */
export * from "./calendar";
export * from "./schedule";
