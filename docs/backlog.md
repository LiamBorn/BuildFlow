# Backlog

Features taken out of the product for now, to come back in a later update. Each entry says what
the feature was, where its code lives in history, and what putting it back involves, so a future
update starts from the last working version rather than from memory.

## Map & Field Ops

**Removed** 2026-09-22 (the same day it was rebuilt). **Last working version:** commit `4669d61`
("Map & Field Ops: rebuilt on the Schedule pages' board, with a real map") — every file below is
at that commit exactly as it ran, with its tests green (client suite 84 files / 853 tests).

What it was: a page on the Schedule pages' board with a live map of every site and machine
(Leaflet, CARTO tiles), each machine's next move read off the schedule (`fleet.ts`), ForecastIQ's
weather read at every site (Open-Meteo, with the workspace's weather alerts as the stated
fallback — `forecast.ts`), a "Needs attention" rail, and the truck-route / optimizer tools.

The code, at `4669d61`:
- `client/src/mapops/` — `MapOpsPage.tsx`, `LiveMap.tsx`, `fleet.ts`, `forecast.ts`, `geo.ts`,
  `mapops.css`, and their tests
- `client/src/components/ui/expand-map.tsx` + `client/src/expand-map.css` — the "Job sites" cards
- `client/src/tests/map.test.tsx` — the page's integration tests
- `client/src/hs-contacts.css` is unrelated (see the Sales hub below)

Putting it back:
1. `git checkout 4669d61 -- client/src/mapops client/src/components/ui/expand-map.tsx client/src/expand-map.css client/src/tests/map.test.tsx`
2. `npm install leaflet@1.9.4 @types/leaflet@1.9.22 -w client`
3. Restore the hooks the removal took out of `client/src/App.tsx` — the commit that removed the
   feature is the map of them: the `"map"` member of `Page`, the rail entry and the Field hub's page
   list, the render branch, `ADD_ON_PAGE_LOCKS.map`, the `map-field-ops` entries in `programRegistry`
   and `ADD_ON_CATALOG`, the tutorial's `productSteps["map-field-ops"]` and the `map-page-title`
   spotlight id, the `document.title` branch, the replay condition, and the three marketing links
   re-pointed to `"dashboard"` (the solutions entry, the product page's "See it live", the explore
   card).
4. Put `map-field-ops` back into `onboardingProductOptions` in `shared/src/index.ts` (the server's
   `selectedProducts` validation and the client's `OnboardingProductId` union follow from it).
5. Re-add the sheets to `client/src/main.tsx` (`expand-map.css`, `leaflet/dist/leaflet.css`,
   `mapops/mapops.css`), `.mx-goal` to `PILL_GROUPS` in `motion/SegmentPill.tsx`, and
   `mapops/mapops.css` to `pillSheets` and `.map-ops-page` to `PAGE_ROOTS` in
   `tests/page-openings.test.ts`; the skin's two `--bfm-shift` page-root lists take `.map-ops-page`
   back; the harness's `HUB_OF` maps it to the Field hub and `openMapFieldOps` returns.
6. Smaller things the removal also took: the tutorial's map scene (`TutorialStage.tsx`, the
   `"map"` shape and `product-map-field-ops`), the Schedule's weather alert opening the page
   (`schedule/alerts.tsx` sends it to DelayIQs now), the 3.5 release entry in the product
   updates, the four marketing footers' "Map Ops" link, and the server test's product selection
   (`server/test/api.test.ts` names `equipment-tracking` instead).

Still on the site (deliberately left, and worth a decision when the feature returns or if it
does not): the marketing product page `#map-field-ops`, the solutions page
`#solutions-map-field-ops`, the "Map Ops" explore card, and the pricing copy that names Map &
Field Ops as a $12 add-on included with Business. Their "open the app" links go to the Dashboard
for now.

## Sales category (the in-app CRM: Contacts, Companies, Deals)

**Removed** 2026-09-22. **Last working version:** commit `4669d61` (the commit before the removal;
the hub had not changed since `1d4867b`).

What it was: the rail's Sales hub — a HubSpot-style Contacts index with a record panel (call,
text, email, note, task, meeting), a Companies index with roll-ups, and a Deals board with drag
between stages — reading the shared backend's sales tables through `/api/sales/*`.

The code, at `4669d61`:
- `client/src/App.tsx` — `ContactsPage`, `ContactRecordPanel`, `CompaniesPage`,
  `CompanyRecordPanel`, `DealsPage`, `DealBoardColumn`, `DealCardFace`, `DealBoardCard`,
  `DealDragLayer`, `DealRecordPanel`, `useSalesData` and their helpers (one contiguous region,
  ~4,900 lines, between `EquipmentModalMode` and `CrewsPage`)
- `client/src/api.ts` — the `Sales*` types and the `fetchSalesBootstrap` … `deleteSalesDeal`
  functions (the block headed "Sales contacts")
- `client/src/hs-contacts.css` — the Contacts index and the record panel
- `client/src/tests/record-panel-overlay.test.tsx`, and the Sales cases in
  `client-desk-skin.test.tsx`, `dashboard-entrance.test.tsx`, `side-panels.test.ts`,
  `motion-language.test.ts` (the Deals board's drag-overlay exemption, whose skin rule went too),
  `dark-mode-gaps.test.ts` and `motion/PanelGoo.test.tsx`
- The record layer's place in the right-panel lists: `motion/PanelGoo.tsx`,
  `components/ui/panelExit.tsx`, and the dropdown/calendar gates in `components/ui/selectMenu.tsx`
  and `dateMenu.tsx` (with the skin's inert-glyph rule and the test that pins the three copies)
- The skin (`app-shell-client-desk.css`) sections for the Contacts page, the record layer and the
  Deals board, and four rules in `app-shell-daylight.css`

**Not removed:** the server's `/api/sales/*` and `/api/support/*` routes and their tables, which the
standalone Sales & Support Desk (`sales-desk/`, port 5490) runs on. That console is a separate
product surface and was left untouched.

Putting it back: `git show 4669d61:client/src/App.tsx` for the region, `api.ts` for the client
functions, `git checkout 4669d61 -- client/src/hs-contacts.css client/src/tests/record-panel-overlay.test.tsx`,
then the hooks in `App.tsx` (the three `Page` members, the rail entries and the Sales hub, the
render branches with `salesOpenRequest`/`openSalesRecord`, `BETA_PAGES`, the replay condition,
the 3.7 release entry, `OVERVIEW_RELEASE_PRODUCT.contacts`), the sheet import in `main.tsx`, the
page roots in `tests/page-openings.test.ts` and the skin's shift lists, the harness's `HUB_OF`,
and the guard-test cases the removal commit shows.

## Schedule: the Week board, the List and the Matrix

**Removed** 2026-09-22. **Last working version:** commit `4669d61` (the commit before the removal;
the pages had not changed since the board-order work of 2026-09-18). The Schedule category keeps
the landing, Month, Kanban and Gantt Chart.

What they were: three of the Schedule category's views, each on its own page in the shared
schedule frame (`schedule/page.tsx`) — **Week**, the crew × day board with the unbooked queue
beside it (drag a card to re-book, drag a queued job onto a crew's day, "Add job" in any cell);
**List**, the week's bookings in time order under seven day sections (drag a row to another
day); **Matrix**, a shaded cell per crew and day with the week's load, conflicts and each crew's
utilisation. All three were addressed by the shared week (`weekStart`), stepped it, and carried it
in their links (`#schedule/week?w=…`, `/list`, `/matrix`).

The code, at `4669d61`:
- `client/src/schedule/pages/WeekPage.tsx`, `ListPage.tsx`, `MatrixPage.tsx`
- `client/src/schedule/parts/matrix.tsx` (`ScheduleMatrixView`); in `parts/week.tsx` the crew-day
  `ScheduleCell`, the booking card `ScheduleJobCard` and the queue chip `DraggableJob` (only the
  "Add job" picker stayed); `CrewLabel` in `parts/shared.tsx`; `WeekStepper` and `ThisWeekButton`
  in `schedule/page.tsx`; `weekRebook`/`listRebook` in `schedule/rebook.ts`; `cellKey`,
  `indexAssignmentsByCell` and `assignmentsForCell` in `scheduleUtils.ts`
- Their sheets' rules: the Week/List/Matrix sections of `app-shell-client-desk.css`, the crew
  column and matrix rules of `schedule-phone.css`, the board/queue/list/matrix rules of
  `schedule.css`, the `.week-stepper` rules of `styles.css`, and the tutorial's crew-board shape
  (`bftu-board*` in `tutorial-stage.css`, `"board"` in `TutorialStage.tsx`)
- Their tests: the Week/List/Matrix describes of `schedule/pages.test.tsx` (the shared behaviour
  they carried — conflicts, undo, stale rows, refresh failures, transactional writes, dialogs,
  export notices — is proved on the Month now), the Week-board cases of `tests/schedule.test.tsx`
  (ported to the Month), `weekRebook`/`listRebook` in `rebook.test.ts`, the Week row-windowing
  case in `scale.test.tsx`, and the three skin cases in `client-desk-skin.test.tsx`

What the removal re-pointed (all at the Month calendar unless said): the landing's queue "Book"
and the frame's `onBooked` (the job's month), the Crew Availability panel's "View all"/"Manage
Crews" (the Crews page), the two booking alerts (`schedule/alerts.tsx`, `page: "month"` on that
week), the first-run step 4 button, the notification target `kind: "schedule"` (`App.tsx`), the
Dashboard's "Today's plan" link, the tutorial's three core schedule lessons (`schedule-overview`,
`open-job-form`, `submit-job` on `month-calendar`; the tour's `schedule-filters` stop), the 3.9
and 3.6 release entries, the server's booking-notice link (`#schedule/month?m=…&crew=…`) and the
weekly digest's link (`#schedule?w=…`, the landing). View keys are 1–3 (Month, Gantt Chart,
Kanban). A link to a retired page (`#schedule/week`, `/list`, `/matrix`, or the old `?view=Week`)
still lands: `parseScheduleHash` maps it to the Month, and the week it carries brings the month
along (`RETIRED_PAGES` in `useScheduleContext.ts`); a saved view or star bookmark on one is dropped
on read.

Putting it back:
1. `git checkout 4669d61 -- client/src/schedule/pages/WeekPage.tsx client/src/schedule/pages/ListPage.tsx client/src/schedule/pages/MatrixPage.tsx client/src/schedule/parts/matrix.tsx`,
   then `git show 4669d61:client/src/schedule/parts/week.tsx` (the cell, card and chip),
   `parts/shared.tsx` (`CrewLabel`), `page.tsx` (the stepper and "This week"), `rebook.ts`,
   `scheduleUtils.ts` and `parts/index.ts` (`export * from "./matrix"`).
2. Put `"week"`, `"list"`, `"matrix"` back into `SCHEDULE_PAGES` and `LINK_KEYS` (all three carry
   `weekStart`), `SCHEDULE_VIEW_KEYS` (1 Month, 2 Week, 3 List, 4 Gantt, 5 Kanban, 6 Matrix),
   `WEEK_PAGES` in `linkBookmarks.ts`, the landing's `views` cards, `tour.ts` (`list-view`,
   `matrix-view`, the filters stop on the Week), `ScheduleAlertPage` (`"week"`), and drop the
   `RETIRED_PAGES` mapping.
3. In `App.tsx`: the three `Page` members, the rail entries and the Schedule hub's page list, the
   three render branches, the tutorial target ids `schedule-board`/`schedule-add-job-button` and
   the lessons on the Week, the notification target, the release entries, the Dashboard link.
4. The sheets: the removal commit's diff of `app-shell-client-desk.css`, `schedule.css`,
   `schedule-phone.css`, `app-shell-daylight.css`, `styles.css`, `redesign.css`,
   `tutorial-stage.css`; the `"board"` shape in `TutorialStage.tsx` (and the scene test's count).
5. The tests named above, from the same commit; the harness's `openSchedule` view names.
