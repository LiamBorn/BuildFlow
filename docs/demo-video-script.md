# BuildFlow — 60-Second Demo Video Script & Storyboard

A production-ready shot-by-shot script for a 60-second product demo aimed at
**construction buyers** (GCs, concrete, roofing, utilities, excavation) who want
to *see it work*. The arc is: **the Monday-morning pain → BuildFlow solves it →
call to action.**

Most shots are **screen recordings of the real app** (the product is built — record
the actual screens listed in the Shot List), intercut with a little jobsite B-roll
(you already have `hero-jobsite.mp4`, `hero-paving.mp4`, `hero-plant.mp4` in
`client/public/`).

- **Runtime:** 60s · **Aspect:** 16:9, 1920×1080 · **Frame rate:** 30fps
- **Two cuts recommended:** (1) full VO+music version; (2) a **muted, caption-driven**
  version for social/autoplay (most feeds autoplay muted).

---

## Storyboard

| Time | On screen (visual) | Voiceover (VO) | On-screen caption |
|---|---|---|---|
| **0:00–0:05** | Fast montage: a scribbled whiteboard schedule, a foreman on the phone, a "where's my crew?" text thread. Jobsite B-roll flash. | "Every Monday starts the same — crews double-booked, materials missing, and a storm nobody planned for." | **Monday, 6:47 AM.** |
| **0:05–0:12** | Hard cut to the BuildFlow **Schedule** board loading clean. Calm. | "BuildFlow puts your whole production week on one board." | **One board. The whole week.** |
| **0:12–0:24** | Screen-record: **drag a job onto a crew** across the week. A red **double-booking warning** appears as a crew is over-capacity; user drops it on the next open slot. | "Drag crews onto jobs by the day. BuildFlow flags double-bookings and capacity limits *before* dispatch — not after." | **Catches conflicts before they cost you.** |
| **0:24–0:34** | Screen-record: **Materials Readiness** — jobs ranked by what's ready; a job shows "Waiting on rebar," another flips to "Ready." | "Every job is ranked by what's actually ready — deliveries, permits, locates — so crews only roll to work that can start." | **No more wasted truck rolls.** |
| **0:34–0:44** | Screen-record: a **weather alert** banner; click **Schedule AI** → at-risk jobs animate out of the storm days and re-slot. Quick B-roll of dark sky. | "When weather hits, Schedule AI moves the at-risk work and rebuilds the week in seconds." | **Weather-proof your schedule.** |
| **0:44–0:52** | Screen-record: **Field Updates** (a foreman's photo pins to the timeline) → **Map & Field Ops** showing crews/routes across sites. | "The field updates from their phones — you see every crew, job, and delay in real time." | **The office and the field, in sync.** |
| **0:52–0:60** | BuildFlow logo on clean bg; the animated schedule settles behind. End card. | "BuildFlow. Run the whole jobsite from one command center." | **Join the waitlist → buildflow.com** |

---

## Voiceover script (clean read)

> Every Monday starts the same — crews double-booked, materials missing, and a storm nobody planned for.
> BuildFlow puts your whole production week on one board.
> Drag crews onto jobs by the day. BuildFlow flags double-bookings and capacity limits before dispatch — not after.
> Every job is ranked by what's actually ready — deliveries, permits, locates — so crews only roll to work that can start.
> When weather hits, Schedule AI moves the at-risk work and rebuilds the week in seconds.
> The field updates from their phones — you see every crew, job, and delay in real time.
> BuildFlow. Run the whole jobsite from one command center.

*Read length ≈ 55–58s at a natural pace — leaves room for the end card. Tone: calm,
confident, plain-spoken. Think "foreman who's seen it all," not "hype startup."*

---

## Shot list — real app screens to record

Record these at 1920×1080, hide any personal data, use the seeded demo data:

1. **Schedule** (`#`/login → Schedule) — the week board; drag a job between crews; trigger the double-book warning.
2. **Materials Readiness** — the readiness-ranked job list; a "Waiting on …" → "Ready" flip.
3. **Delays / Schedule AI** — a weather alert + the AI reschedule that moves jobs off the storm days.
4. **Field Updates** — a photo pinning to the project timeline.
5. **Map & Field Ops** — crews/routes on the map.
6. **Dashboard (AI Command Center)** — a 1–2s establishing shot of the whole board for the intro (0:05).

> Tip: record each interaction slowly and steadily, then speed-ramp in the edit. Cursor
> movements should be deliberate — the viewer needs to follow what's happening.

---

## Production notes

- **Music:** understated, building — light percussion/tension in the pain open (0:00–0:05),
  resolves to a clean, forward pulse at 0:05. Duck under the VO.
- **Captions:** burn in the on-screen captions above — they carry the story in the **muted
  autoplay** cut. Keep them ≤5 words, high-contrast.
- **Brand:** use the palette from the site — cool grey `#f5f6fa`, ink `#1c1c1a`, blue
  `#1a73e8`; logo from `client/public/buildflow-logo.png`. End card can reuse the
  `og-image.png` composition.
- **Pace:** ~7 cuts in 60s. Don't linger — construction buyers scan fast.
- **Accessibility:** ship a captioned `.vtt` track for the on-site player (add a
  `<track kind="captions">` if you host the MP4 locally).

---

## Publishing the finished video

The site is already wired for it. In `client/src/App.tsx`, set **one line**:

```ts
const DEMO_VIDEO_SRC = "/demo.mp4";                          // drop the file in client/public/, OR
const DEMO_VIDEO_SRC = "https://www.youtube.com/embed/<id>"; // a YouTube/Vimeo EMBED url
```

Optionally set `DEMO_VIDEO_POSTER = "/demo-poster.jpg"`. The **"Watch the 60-second
demo"** button in the hero's `#demo` section opens the accessible modal player
automatically — local MP4s use a `<video controls>`, embed URLs use an autoplay
`<iframe>`. No other changes needed.
