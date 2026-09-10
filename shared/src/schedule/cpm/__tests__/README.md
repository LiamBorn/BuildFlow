CPM engine tests. `npm run test:cpm` (from the repo root) runs only this folder.

- Phase 2: calendar.ts — weekend spanning, holiday inside a duration, Saturday exception, blackout pushes forward, negative day counts, zero-day span.
- Phase 3: schedule.ts — the ten cases in spec §6.5 with hand-verified values, including the 2,000-activity performance case.

Never edit a test to make the engine pass. If a test fails, the engine is wrong.
