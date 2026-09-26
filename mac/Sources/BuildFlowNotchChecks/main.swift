// Checks for the notch's logic. XCTest isn't available with the Command Line
// Tools, so this is a plain executable: `swift run BuildFlowNotchChecks`.
// It prints each failure and exits 1 if there were any.
import BuildFlowNotchKit
import CoreGraphics
import Foundation

var failures = 0
var passed = 0

func check(_ ok: Bool, _ what: String, file: StaticString = #fileID, line: UInt = #line) {
    if ok { passed += 1 } else { failures += 1; print("FAIL \(line): \(what)") }
}

func equal<T: Equatable>(_ a: T, _ b: T, _ what: String, line: UInt = #line) {
    check(a == b, "\(what): got \(a), expected \(b)", line: line)
}

func near(_ a: Double, _ b: Double, _ tol: Double, _ what: String, line: UInt = #line) {
    check(abs(a - b) <= tol, "\(what): got \(a), expected \(b) ± \(tol)", line: line)
}

var ny = Calendar(identifier: .gregorian)
ny.timeZone = TimeZone(identifier: "America/New_York")!

/// "2026-09-26 08:12" or "2026-09-26 09:25:08" in New York time.
func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.calendar = ny
    f.timeZone = ny.timeZone
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = s.count > 16 ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm"
    guard let d = f.date(from: s) else { fatalError("bad date \(s)") }
    return d
}

// MARK: Part of the day and wording

for (time, part) in [("05:00", PartOfDay.morning), ("11:59", .morning), ("12:00", .afternoon), ("16:59", .afternoon),
                     ("17:00", .evening), ("21:59", .evening), ("22:00", .late), ("23:30", .late),
                     ("01:00", .late), ("04:59", .late)] {
    equal(PartOfDay.at(at("2026-09-26 \(time)"), calendar: ny), part, "part of day at \(time)")
}
equal(GreetingWording.text(part: .morning, firstName: "Liam"), "Good morning, Liam", "morning wording")
equal(GreetingWording.text(part: .afternoon, firstName: "Liam"), "Good afternoon, Liam", "afternoon wording")
equal(GreetingWording.text(part: .evening, firstName: "Liam"), "Good evening, Liam", "evening wording")
equal(GreetingWording.text(part: .late, firstName: "Liam"), "Working late, Liam", "late wording")
equal(GreetingWording.text(part: .afternoon, firstName: "Liam", welcomeBack: true), "Welcome back, Liam", "welcome back wording")
equal(GreetingWording.text(part: .morning, firstName: "  "), "Good morning", "no first name")

equal(GreetingPlanner.partKey(for: at("2026-09-26 08:12"), calendar: ny), "2026-09-26#morning", "morning key")
equal(GreetingPlanner.partKey(for: at("2026-09-26 23:00"), calendar: ny), "2026-09-26#late", "late key before midnight")
equal(GreetingPlanner.partKey(for: at("2026-09-27 01:00"), calendar: ny), "2026-09-26#late", "1 AM belongs to the night before")
equal(GreetingPlanner.partKey(for: at("2026-09-27 05:00"), calendar: ny), "2026-09-27#morning", "5 AM starts a new morning")

// MARK: Once per part of the day

func decide(_ now: String, _ trigger: GreetingTrigger, _ memory: GreetingMemory,
            enabled: Bool = true, fullScreen: Bool = false) -> GreetingDecision {
    GreetingPlanner.decide(now: at(now), trigger: trigger, memory: memory, firstName: "Liam",
                           enabled: enabled, fullScreenFrontmost: fullScreen, calendar: ny)
}

do {
    // The plan's "done when": lid open at 8:12 greets once; unlocking at 8:40 shows nothing.
    var m = GreetingMemory()
    let first = decide("2026-09-26 08:12", .wake, m)
    equal(first.text, "Good morning, Liam", "8:12 lid open")
    m = GreetingPlanner.remember(first, trigger: .wake, memory: m)
    equal(m.lastPartKey, "2026-09-26#morning", "morning used up")
    m = GreetingPlanner.wentAway(at: at("2026-09-26 08:30"), memory: m)
    equal(decide("2026-09-26 08:40", .unlock, m), .skip(.alreadyShownThisPart), "8:40 unlock shows nothing")

    // Launch at login greets too.
    equal(decide("2026-09-26 13:05", .launch, GreetingMemory()).text, "Good afternoon, Liam", "launch in the afternoon")
}

do {
    // 1 AM: "Working late", and only once for the whole night.
    let evening = GreetingMemory(lastPartKey: "2026-09-26#evening")
    let d = decide("2026-09-27 01:00", .unlock, evening)
    equal(d.text, "Working late, Liam", "1 AM after an evening greeting")
    let m = GreetingPlanner.remember(d, trigger: .unlock, memory: evening)
    equal(m.lastPartKey, "2026-09-26#late", "1 AM uses up the night that began on the 26th")
    equal(decide("2026-09-27 03:30", .wake, m), .skip(.alreadyShownThisPart), "3:30 AM the same night")
    let shownAt11 = GreetingMemory(lastPartKey: "2026-09-26#late")
    equal(decide("2026-09-27 01:00", .unlock, shownAt11), .skip(.alreadyShownThisPart), "23:00 greeting covers 1 AM")
    equal(decide("2026-09-27 05:10", .wake, m).text, "Good morning, Liam", "the next morning greets again")
}

do {
    // Back after 3 h+ away says "Welcome back" (when it greeted earlier the same day).
    var m = GreetingMemory(lastPartKey: "2026-09-26#morning")
    m = GreetingPlanner.wentAway(at: at("2026-09-26 09:00"), memory: m)
    m = GreetingPlanner.wentAway(at: at("2026-09-26 10:00"), memory: m)
    equal(m.awaySince, at("2026-09-26 09:00"), "away keeps the earliest time")
    let d = decide("2026-09-26 12:30", .unlock, m)
    equal(d, .show(text: "Welcome back, Liam", part: .afternoon, welcomeBack: true, partKey: "2026-09-26#afternoon"),
          "3.5 h away")
    let after = GreetingPlanner.remember(d, trigger: .unlock, memory: m)
    equal(after.awaySince, nil, "coming back ends the away time")
    equal(after.lastPartKey, "2026-09-26#afternoon", "welcome back uses up the afternoon")

    let exactly3h = GreetingMemory(lastPartKey: "2026-09-26#morning", awaySince: at("2026-09-26 09:30"))
    equal(decide("2026-09-26 12:30", .unlock, exactly3h).text, "Welcome back, Liam", "exactly 3 h away")

    let twoHours = GreetingMemory(lastPartKey: "2026-09-26#morning", awaySince: at("2026-09-26 10:30"))
    equal(decide("2026-09-26 12:30", .unlock, twoHours).text, "Good afternoon, Liam", "2 h away is not welcome back")

    let overnight = GreetingMemory(lastPartKey: "2026-09-26#late", awaySince: at("2026-09-26 23:00"))
    equal(decide("2026-09-27 07:00", .wake, overnight).text, "Good morning, Liam", "first greeting of a day is the time of day")

    let awayButSamePart = GreetingMemory(lastPartKey: "2026-09-26#morning", awaySince: at("2026-09-26 05:30"))
    equal(decide("2026-09-26 09:00", .unlock, awayButSamePart), .skip(.alreadyShownThisPart), "still once per part")

    let launchAfterAway = GreetingMemory(lastPartKey: "2026-09-26#morning", awaySince: at("2026-09-26 08:00"))
    equal(decide("2026-09-26 13:00", .launch, launchAfterAway).text, "Good afternoon, Liam", "launch always says the time of day")
}

do {
    // Settings, full screen, and Replay.
    let m = GreetingMemory(lastPartKey: "2026-09-26#morning", awaySince: at("2026-09-26 11:00"))
    equal(decide("2026-09-26 13:00", .unlock, m, enabled: false), .skip(.disabled), "greeting turned off")
    let fs = decide("2026-09-26 13:00", .unlock, m, fullScreen: true)
    equal(fs, .skip(.fullScreen), "never over a full-screen app")
    equal(GreetingPlanner.remember(fs, trigger: .unlock, memory: m).lastPartKey, "2026-09-26#morning",
          "a full-screen skip doesn't use up the afternoon")
    let replay = decide("2026-09-26 09:00", .replay, m, enabled: false, fullScreen: true)
    equal(replay.text, "Good morning, Liam", "Replay always shows")
    equal(GreetingPlanner.remember(replay, trigger: .replay, memory: m), m, "Replay doesn't touch the memory")
}

do {
    let suite = "com.buildflow.mac.checks"
    let defaults = UserDefaults(suiteName: suite)!
    defaults.removePersistentDomain(forName: suite)
    let store = GreetingStore(defaults: defaults)
    equal(store.enabled, true, "greeting on by default")
    equal(store.speakAloud, false, "speaking off by default")
    store.memory = GreetingMemory(lastPartKey: "2026-09-26#evening", awaySince: at("2026-09-26 18:00"))
    equal(GreetingStore(defaults: defaults).memory,
          GreetingMemory(lastPartKey: "2026-09-26#evening", awaySince: at("2026-09-26 18:00")), "memory survives a relaunch")
    store.memory = GreetingMemory(lastPartKey: "2026-09-26#evening", awaySince: nil)
    equal(store.memory.awaySince, nil, "away time clears")
    defaults.removePersistentDomain(forName: suite)
}

// MARK: Motion numbers

do {
    let e = GreetingTimeline.writeEasing
    equal(e.value(at: 0), 0, "easing starts at 0")
    equal(e.value(at: 1), 1, "easing ends at 1")
    var last = -1.0, monotonic = true
    for i in 0...100 { let v = e.value(at: Double(i) / 100); if v < last - 1e-9 { monotonic = false }; last = v }
    check(monotonic, "writing easing never goes backwards")
    near(CubicBezier(0, 0, 1, 1).value(at: 0.3), 0.3, 1e-6, "linear bezier")
    near(CubicBezier(0.25, 0.1, 0.25, 1).value(at: 0.5), 0.8024, 0.001, "CSS ease at 50%")
    near(GreetingTimeline.reveal(at: 0), -0.08, 1e-9, "nothing written before the delay")
    near(GreetingTimeline.reveal(at: 2.05), 1, 1e-9, "all written after 1.7 s")
    let mid = GreetingTimeline.reveal(at: 1.2)
    check(mid > 0.2 && mid < 0.9, "half-way through writing: \(mid)")
    equal(GreetingTimeline.trace(at: 0).opacity, 0, "edge light off at first")
    near(GreetingTimeline.trace(at: 0.3 + 1.05).opacity, 1, 1e-9, "edge light on mid-way")
    near(GreetingTimeline.trace(at: 0.3 + 1.05).angle, -160, 1e-9, "edge light half-way round")
    near(GreetingTimeline.trace(at: 2.5).opacity, 0, 1e-9, "edge light off after ~2 s")
}

// MARK: Example inbox → the mock-up's words

let exampleURL = ExampleInboxSource.defaultURL()
check(exampleURL != nil, "example-inbox.json found")
let inbox: InboxSnapshot = {
    do { return try ExampleInboxSource(url: exampleURL!, calendar: ny).load() } catch {
        print("FAIL: example inbox didn't decode: \(error)"); exit(1)
    }
}()

equal(inbox.me.firstName, "Liam", "first name")
equal(inbox.notifications.count, 3, "notifications")
equal(inbox.jobs.count, 4, "jobs")
equal(inbox.meetings.count, 3, "meetings")
equal(inbox.tasks.count, 3, "tasks")

do {
    // 9:05: the inbox moment in the mock-up.
    let p = InboxPresenter(inbox: inbox, now: at("2026-09-26 09:05"), calendar: ny)
    equal(p.count(for: .notifications), 3, "unseen on the bell tab")
    equal(p.count(for: .tasks), 2, "tasks due today on the tasks tab")
    equal(p.count(for: .jobs), nil, "no count on jobs")

    let n = p.card(for: .notifications)
    equal(n.title, "Notifications", "notifications card")
    equal(n.note, "Mark all read", "notifications note")
    equal(n.rows.map(\.title), ["Rebar delivery slipping 2 days", "Crew 2 reported framing at 60%", "Footing inspection moved to Thu"], "notification titles")
    equal(n.rows.map(\.subtitle), ["Harbor Point · DelayIQ", "Oak Ridge · Field update", "Maple St. Plaza · Inspection"], "notification subtitles")
    equal(n.rows.map(\.trailing), [.text("12m"), .text("40m"), .text("1h")], "notification ages")
    equal(n.rows.map(\.tone), [.warn, .ok, .info], "notification tones")
    equal(n.rows.map(\.icon), [.triangleAlert, .activity, .checkSquare], "notification icons")
    check(n.rows.allSatisfy(\.unread), "all unread")
    equal(n.rows.first?.target, .notification("delayIQ-d12"), "a row knows what it opens")

    let j = p.card(for: .jobs)
    equal(j.title, "Upcoming jobs", "jobs card")
    equal(j.rows.map(\.title), ["Footings pour", "Framing, level 2", "Site grading", "Curb forms"], "my jobs first")
    equal(j.rows.prefix(3).map(\.subtitle), ["Maple St. Plaza · Crew 2 · Rain hold", "Oak Ridge · Crew 4 · In Progress",
                                             "Harbor Point · Crew 1 · Rain watch"], "job subtitles")
    equal(j.rows.prefix(3).map(\.trailing), [.twoLine("Today", "7:00"), .twoLine("Today", "7:30"), .twoLine("Mon", "6:30")], "job times")
    equal(j.rows.prefix(3).map(\.icon), [.cloudRain, .hardHatSmall, .cloudRain], "job icons")
    equal(j.rows.prefix(3).map(\.tone), [.bad, .brand, .warn], "hold is red, watch amber")

    let m = p.card(for: .meetings)
    equal(m.title, "Meetings", "meetings card")
    equal(m.note, "Google + Outlook", "calendars")
    equal(m.rows.map(\.title), ["Standup", "Owner walkthrough", "Sub coordination"], "meeting titles")
    equal(m.rows.map(\.subtitle), ["Google Meet", "Maple St. Plaza · on site", "Microsoft Teams"], "meeting subtitles")
    equal(m.rows.map(\.trailing), [.join("https://meet.google.com/"), .text("1:00 PM"), .text("3:30 PM")], "Join, then times")
    equal(m.rows.map(\.tone), [.ok, .muted, .muted], "meeting tones")

    let t = p.card(for: .tasks)
    equal(t.title, "Waiting on you", "tasks card")
    equal(t.note, "2 today", "tasks note")
    equal(t.rows.map(\.title), ["Call the rain day", "Approve 2 time cards", "Permit posted on site"], "task titles")
    equal(t.rows.map(\.subtitle), ["By 2 PM · Maple St. Plaza · WeatherIQ", "Today · Week of Sep 21 · Time cards", "Oak Ridge · Readiness"], "task subtitles")
    equal(t.rows.map(\.trailing), [.buttons([RowButton(id: "cancel", label: "Call it off", primary: true),
                                             RowButton(id: "keep", label: "Keep it on", primary: false)]),
                                   .buttons([RowButton(id: "approve", label: "Approve", primary: true)]),
                                   .text("Fri")], "task buttons, else the due day")
    equal(t.rows.map(\.icon), [.cloudRainSmall, .clock, .listSmall], "task icons")

    equal(p.todayHeader, "Sat, Sep 26", "today header")
    let today = p.todayRows()
    equal(today.map(\.title), ["Up next", "Next job", "Weather"], "today rows")
    equal(today.map(\.subtitle), ["Standup in 25 min", "Footings pour · 7:00", "Rain from 2 PM · Maple St. Plaza"], "today subtitles")
    equal(today.map(\.trailing), [.join("https://meet.google.com/"), .text("Crew 2"), .text("Hold")], "today trailing")
    equal(InboxPresenter(inbox: inbox, now: at("2026-09-26 07:10"), calendar: ny).nextJob?.name, "Framing, level 2", "next job still to start")
}

do {
    let p = InboxPresenter(inbox: inbox, now: at("2026-09-26 09:25:08"), calendar: ny)
    equal(p.liveActivity(), LiveActivity(icon: .video, tone: .ok, label: "Standup", countdown: "4:52"), "live: Standup in 4:52")
    let early = InboxPresenter(inbox: inbox, now: at("2026-09-26 09:05"), calendar: ny)
    equal(early.liveActivity(), nil, "no live activity 25 min out")
    equal(early.previewLiveActivity().label, "Standup", "preview still shows the next meeting")
    let jobSoon = InboxPresenter(inbox: inbox, now: at("2026-09-26 06:35"), calendar: ny)
    equal(jobSoon.liveActivity()?.label, "Footings pour", "a job within 30 min")
    equal(jobSoon.liveActivity()?.countdown, "25:00", "job countdown")

    equal(p.weatherHoldAlert(), AlertContent(icon: .cloudRain, tone: .warn, status: "Weather hold",
                                              title: "Maple St. Plaza · Footings pour",
                                              subtitle: "Rain likely from 2 PM. Call the day off, or keep it?"), "weather hold alert")
}

do {
    let p = InboxPresenter(inbox: inbox, now: at("2026-09-26 08:12"), calendar: ny)
    equal(p.dayLine(), ["3 jobs today", "Standup at 9:30", "Rain after 2 PM"], "greeting day line at 8:12")
    let late = InboxPresenter(inbox: inbox, now: at("2026-09-26 15:00"), calendar: ny)
    equal(late.dayLine(), ["3 jobs today", "Sub coordination at 3:30 PM", "Rain today"], "day line at 3 PM")
    equal(VoiceContent.example.question, "What's Crew 2 doing tomorrow?", "voice question")
}

do {
    // Rebasing keeps the example looking like today.
    let target = at("2026-10-01 08:12")
    let moved = ExampleInboxSource.rebase(inbox, to: target, calendar: ny)
    equal(moved.jobs.map(\.date), ["2026-10-01", "2026-10-01", "2026-10-01", "2026-10-03"], "job days move by 5")
    equal(moved.tasks.map(\.due), ["2026-10-01T14:00", "2026-10-01", "2026-10-07"], "task days move, times stay")
    equal(moved.jobs[0].weather?.start, "2026-10-01T14:00", "weather moves with its job")
    equal(moved.today, "2026-10-01", "today moves")
    let p = InboxPresenter(inbox: moved, now: target, calendar: ny)
    equal(p.dayLine(), ["3 jobs today", "Standup at 9:30", "Rain after 2 PM"], "rebased day line")
    equal(ExampleInboxSource.rebase(inbox, to: at("2026-09-26 20:00"), calendar: ny), inbox, "same day, no change")
}

do {
    let json = #"{"me":{"firstName":"Ana"},"notifications":[{"id":"n","title":"t","at":"2026-09-26T11:48:00.123Z","read":true}]}"#
    let s = try? InboxDecoding.decode(Data(json.utf8))
    equal(s?.me.firstName, "Ana", "minimal inbox decodes")
    equal(s?.jobs.count, 0, "missing lists are empty")
    equal(s?.notifications.first?.alertable, false, "a row that doesn't say it can alert, can't")
    let whole = InboxDecoding.parseISO8601("2026-09-26T11:48:00Z")!
    check(s?.notifications.first.map { abs($0.at.timeIntervalSince(whole) - 0.123) < 0.001 } ?? false,
          "fractional-second dates decode")
}

do {
    equal(TimeText.clock(hour: 7, minute: 0, style: .compact), "7:00", "compact AM")
    equal(TimeText.clock(hour: 15, minute: 30, style: .compact), "3:30 PM", "compact PM")
    equal(TimeText.clock(hour: 0, minute: 5, style: .full), "12:05 AM", "midnight")
    equal(TimeText.clock(hour: 14, minute: 0, style: .hourly), "2 PM", "hourly")
    equal(TimeText.countdown(from: at("2026-09-26 09:25:08"), to: at("2026-09-26 09:30")), "4:52", "countdown")
    equal(TimeText.age(from: at("2026-09-26 09:00"), to: at("2026-09-26 09:00")), "now", "age now")
    equal(TimeText.age(from: at("2026-09-24 09:00"), to: at("2026-09-26 09:00")), "2d", "age days")
}

// MARK: Geometry

do {
    // Measured on the MacBook Air M2: 1470×956, notch x 646–825, 32 pt, menu bar 37 pt.
    let air = ScreenFacts(frame: CGRect(x: 0, y: 0, width: 1470, height: 956),
                          visibleFrame: CGRect(x: 0, y: 50, width: 1470, height: 869), safeAreaTop: 32,
                          auxiliaryTopLeft: CGRect(x: 0, y: 924, width: 646, height: 32),
                          auxiliaryTopRight: CGRect(x: 825, y: 924, width: 645, height: 32))
    let g = NotchGeometry.compute(air)
    check(g.hasNotch, "the Air has a notch")
    equal(g.notchRect, CGRect(x: 646, y: 924, width: 179, height: 32), "notch rect")
    equal(g.menuBarHeight, 37, "menu bar height")
    let canvas = NotchMetrics.canvas
    equal(g.panelFrame(), CGRect(x: 735.5 - canvas.width / 2, y: 956 - canvas.height, width: canvas.width, height: canvas.height),
          "panel centred on the notch, top on the screen's top")
    let resting = NotchMetrics.spec(for: .resting, notch: g.notchSize)
    equal(g.shapeRect(resting), g.notchRect, "at rest the shape is exactly the notch")
    for state in NotchState.allCases {
        let s = NotchMetrics.spec(for: state, notch: g.notchSize)
        check(s.width >= 179 && s.height >= 32, "\(state) never smaller than the notch")
        check(s.outerWidth <= canvas.width * 0.97 && s.height <= canvas.height * 0.93,
              "\(state) plus its spring overshoot fits the canvas")
        check(s.radius <= s.height - s.ear, "\(state) radius fits under its ears")
    }
    equal(NotchMetrics.spec(for: .inbox, notch: g.notchSize), ShapeSpec(width: 690, height: 306, radius: 36, ear: 14), "inbox size")
    equal(NotchMetrics.spec(for: .greeting, notch: g.notchSize), ShapeSpec(width: 580, height: 190, radius: 36, ear: 14), "greeting size")
    equal(NotchMetrics.spec(for: .alert, notch: g.notchSize), ShapeSpec(width: 450, height: 108, radius: 28, ear: 12), "alert size")
    equal(NotchMetrics.spec(for: .voice, notch: g.notchSize), ShapeSpec(width: 570, height: 250, radius: 34, ear: 14), "voice size")
    equal(NotchMetrics.spec(for: .live, notch: g.notchSize), ShapeSpec(width: 356, height: 32, radius: 12, ear: 7), "live size")

    let external = ScreenFacts(frame: CGRect(x: 1470, y: 0, width: 1920, height: 1080),
                               visibleFrame: CGRect(x: 1470, y: 0, width: 1920, height: 1055), safeAreaTop: 0,
                               auxiliaryTopLeft: nil, auxiliaryTopRight: nil)
    let e = NotchGeometry.compute(external)
    check(!e.hasNotch, "external screen has no notch")
    equal(e.notchRect.size, CGSize(width: 179, height: 25), "drawn notch: 179 wide, menu-bar tall")
    near(Double(e.notchRect.midX), 1470 + 960, 0.5, "drawn notch centred")
    equal(e.notchRect.maxY, 1080, "drawn notch at the top")
    let hidden = ScreenFacts(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080),
                             visibleFrame: CGRect(x: 0, y: 0, width: 1920, height: 1080), safeAreaTop: 0,
                             auxiliaryTopLeft: nil, auxiliaryTopRight: nil)
    equal(NotchGeometry.compute(hidden).notchRect.height, 24, "auto-hidden menu bar")

    // "Standup" at 13 pt is 52.1 pt: the live activity widens so it clears the camera.
    equal(NotchMetrics.liveWidth(leftContent: 22 + 8 + 52.1, rightContent: 12 + 6 + 30, notchWidth: 179), 384, "live width for Standup")
    equal(NotchMetrics.liveWidth(leftContent: 22 + 8 + 20, rightContent: 40, notchWidth: 179), 356, "short label keeps 356")
    equal(NotchMetrics.liveWidth(leftContent: 600, rightContent: 40, notchWidth: 179), 520, "very long label is capped")
}

// MARK: Left ⌃ + left ⌥: tap for the inbox, hold to talk

/// Plays a chord the way the app feeds it: flagsChanged events, plus a tick every 30 ms while not idle.
struct ChordScript {
    static let t0 = Date(timeIntervalSince1970: 2000)
    var r = ChordRecognizer()
    var now: Double = 0                     // ms
    var counters = InputCounters(keyDown: 100, leftMouseDown: 50, rightMouseDown: 5, otherMouseDown: 0)
    var events: [ChordEvent] = []
    var speaking = false

    static let base: UInt64 = 0x100        // NX_NONCOALSESCEDMASK: always set in real flags
    static let lc = base | ModifierBits.control | ModifierBits.leftControl
    static let la = base | ModifierBits.option | ModifierBits.leftOption
    static let both = lc | la
    static let none = base

    func t(_ ms: Double) -> Date { Self.t0.addingTimeInterval(ms / 1000) }

    mutating func wait(until ms: Double) {
        while now + 30 <= ms {
            now += 30
            if !r.isIdle { events += r.tick(counters: counters, at: t(now)) }
        }
        now = ms
    }

    mutating func flags(_ f: UInt64, key: UInt16?, at ms: Double) {
        wait(until: ms)
        events += r.flagsChanged(f, keyCode: key, counters: counters, at: t(ms), speaking: speaking)
    }

    mutating func keyPress(at ms: Double) { wait(until: ms); counters.keyDown &+= 1 }
    mutating func click(at ms: Double) { wait(until: ms); counters.leftMouseDown &+= 1 }

    /// ⌃ down, ⌥ down, ⌥ up, ⌃ up at the given times.
    mutating func chord(_ ctlDown: Double, _ altDown: Double, _ altUp: Double, _ ctlUp: Double, extra: UInt64 = 0) {
        flags(Self.lc | extra, key: 59, at: ctlDown)
        flags(Self.both | extra, key: 58, at: altDown)
        flags(Self.lc | extra, key: 58, at: altUp)
        flags(Self.none | extra, key: 59, at: ctlUp)
    }
}

do {
    var s = ChordScript()
    s.chord(0, 40, 150, 170)
    equal(s.events, [.toggleInbox], "a left ⌃⌥ tap toggles, once, on the release")
    equal(s.r.phase, .idle, "and it's ready again")

    s = ChordScript()
    s.flags(ChordScript.la, key: 58, at: 0)
    s.flags(ChordScript.both, key: 59, at: 60)
    s.flags(ChordScript.la, key: 59, at: 120)
    s.flags(ChordScript.none, key: 58, at: 140)
    equal(s.events, [.toggleInbox], "either order: ⌥ first works too")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    let rightAlt = ChordScript.lc | ModifierBits.option | ModifierBits.rightOption
    s.flags(rightAlt, key: 61, at: 40)
    s.flags(ChordScript.lc, key: 61, at: 150)
    s.flags(ChordScript.none, key: 59, at: 170)
    equal(s.events, [], "left ⌃ + right ⌥ does nothing")

    s = ChordScript()
    s.flags(ChordScript.base | ModifierBits.control | ModifierBits.rightControl, key: 62, at: 0)
    s.flags(ChordScript.base | ModifierBits.control | ModifierBits.rightControl | ModifierBits.option | ModifierBits.leftOption, key: 58, at: 40)
    s.flags(ChordScript.base | ModifierBits.control | ModifierBits.rightControl, key: 58, at: 150)
    s.flags(ChordScript.none, key: 62, at: 170)
    equal(s.events, [], "right ⌃ + left ⌥ does nothing")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.keyPress(at: 90)                      // ⌃⌥← and friends
    s.flags(ChordScript.lc, key: 58, at: 150)
    s.flags(ChordScript.none, key: 59, at: 170)
    equal(s.events, [], "⌃⌥ plus another key does nothing")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.keyPress(at: 100)
    s.flags(ChordScript.lc, key: 58, at: 105)  // released before the next 30 ms tick: the release still sees the key
    s.flags(ChordScript.none, key: 59, at: 110)
    equal(s.events, [], "a key just before the release still counts")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.click(at: 100)
    s.flags(ChordScript.lc, key: 58, at: 200)
    s.flags(ChordScript.none, key: 59, at: 220)
    equal(s.events, [], "⌃⌥-click does nothing")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.flags(ChordScript.both | ModifierBits.shift | ModifierBits.leftShift, key: 56, at: 80)
    s.flags(ChordScript.both, key: 56, at: 120)
    s.flags(ChordScript.lc, key: 58, at: 150)
    s.flags(ChordScript.none, key: 59, at: 170)
    equal(s.events, [], "⌃⌥⇧ does nothing, even after ⇧ comes up")

    for (name, extra, key) in [("⌘", ModifierBits.command | ModifierBits.leftCommand, UInt16(55)),
                               ("fn", ModifierBits.function, UInt16(63))] {
        s = ChordScript()
        s.flags(ChordScript.base | extra, key: key, at: 0)
        s.chord(20, 60, 150, 170, extra: extra)
        s.flags(ChordScript.none, key: key, at: 200)
        equal(s.events, [], "\(name) held with ⌃⌥ does nothing")
    }

    s = ChordScript()
    s.flags(ChordScript.la, key: 58, at: 0)
    s.keyPress(at: 50)                      // ⌥-e, an accent
    s.flags(ChordScript.both, key: 59, at: 120)
    s.flags(ChordScript.la, key: 59, at: 200)
    s.flags(ChordScript.none, key: 58, at: 220)
    equal(s.events, [], "a key typed with ⌥ before ⌃ joins spoils the press")

    s = ChordScript()
    s.chord(0, 300, 400, 420)
    equal(s.events, [.toggleInbox], "⌃ then ⌥ 300 ms later counts, and is a tap: the threshold starts when both are down")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 300)
    s.wait(until: 640)
    equal(s.events, [], "340 ms after both are down: not talking yet")
    s.wait(until: 700)
    equal(s.events, [.talkBegan], "past 350 ms after both are down: talking")
    s.flags(ChordScript.lc, key: 58, at: 1500)
    s.flags(ChordScript.none, key: 59, at: 1520)
    equal(s.events, [.talkBegan, .talkEnded], "letting go sends, once")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.flags(ChordScript.lc, key: 58, at: 150)
    s.flags(ChordScript.both, key: 58, at: 200)    // ⌥ again while ⌃ is still down
    s.flags(ChordScript.lc, key: 58, at: 260)
    s.flags(ChordScript.none, key: 59, at: 300)
    equal(s.events, [.toggleInbox], "letting go of one key, then the other, toggles once")

    s = ChordScript()
    s.chord(0, 40, 150, 170)
    s.chord(600, 640, 750, 770)
    equal(s.events, [.toggleInbox, .toggleInbox], "two taps in a row: open, then close")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.keyPress(at: 200)
    s.wait(until: 1000)
    s.flags(ChordScript.lc, key: 58, at: 1000)
    s.flags(ChordScript.none, key: 59, at: 1020)
    equal(s.events, [], "a key before the threshold: nothing, and no talk later")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.wait(until: 600)
    s.keyPress(at: 610)
    s.wait(until: 660)
    equal(s.events, [.talkBegan, .talkCancelled], "a key after the threshold cancels the talk within a tick")
    s.flags(ChordScript.lc, key: 58, at: 900)
    s.flags(ChordScript.none, key: 59, at: 920)
    equal(s.events, [.talkBegan, .talkCancelled], "and letting go sends nothing")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.wait(until: 500)
    s.click(at: 520)
    s.flags(ChordScript.lc, key: 58, at: 700)
    s.flags(ChordScript.none, key: 59, at: 720)
    equal(s.events, [.talkBegan, .talkCancelled], "a click during the hold cancels")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.wait(until: 500)
    s.flags(ChordScript.both | ModifierBits.command | ModifierBits.leftCommand, key: 55, at: 520)
    equal(s.events, [.talkBegan, .talkCancelled], "⌘ joining a talk cancels it at once")

    s = ChordScript()
    s.speaking = true
    s.chord(0, 40, 150, 170)
    equal(s.events, [.stopSpeaking], "⌃⌥ while BuildFlow speaks stops the speech, and doesn't toggle")
    s.speaking = false
    s.chord(600, 640, 750, 770)
    equal(s.events, [.stopSpeaking, .toggleInbox], "the next tap toggles again")

    s = ChordScript()
    s.speaking = true
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.speaking = false
    s.wait(until: 500)
    s.flags(ChordScript.lc, key: 58, at: 800)
    s.flags(ChordScript.none, key: 59, at: 820)
    equal(s.events, [.stopSpeaking, .talkBegan, .talkEnded], "holding through it asks a new question")

    s = ChordScript()
    let caps = ModifierBits.capsLock
    s.chord(0, 40, 150, 170, extra: caps)
    equal(s.events, [.toggleInbox], "caps lock left on doesn't get in the way")

    s = ChordScript()
    s.flags(ChordScript.lc, key: 59, at: 0)
    s.flags(ChordScript.both, key: 58, at: 40)
    s.flags(ChordScript.both, key: 61, at: 80)     // a right ⌥ event whose bit we never saw
    s.flags(ChordScript.lc, key: 58, at: 150)
    s.flags(ChordScript.none, key: 59, at: 170)
    equal(s.events, [], "the key code cross-check: a right ⌥ event spoils it")

    s = ChordScript()
    s.flags(ChordScript.lc, key: nil, at: 0)
    s.flags(ChordScript.both, key: nil, at: 60)
    s.flags(ChordScript.none, key: nil, at: 150)
    equal(s.events, [.toggleInbox], "polled flags (no key codes) work the same")

    s = ChordScript()
    s.flags(ChordScript.base | ModifierBits.control | ModifierBits.option, key: nil, at: 0)
    s.flags(ChordScript.none, key: nil, at: 100)
    equal(s.events, [], "flags without the left/right bits never count")

    var reset = ChordRecognizer()
    _ = reset.flagsChanged(ChordScript.both, keyCode: 58, counters: InputCounters(), at: ChordScript.t0)
    _ = reset.tick(counters: InputCounters(), at: ChordScript.t0.addingTimeInterval(0.4))
    equal(reset.reset(), [.talkCancelled], "reset cancels a talk in progress")
    equal(reset.phase, .waitingForRelease, "and waits for the keys to come up")
    equal(ChordRecognizer.holdThreshold, 0.35, "hold threshold")
}

// MARK: Full screen

do {
    let air = (bounds: CGRect(x: 0, y: 0, width: 1470, height: 956), safeAreaTop: CGFloat(32))
    let fullBelowCamera = WindowFacts(ownerPID: 42, layer: 0, bounds: CGRect(x: 0, y: 32, width: 1470, height: 924))
    let fullWhole = WindowFacts(ownerPID: 42, layer: 0, bounds: CGRect(x: 0, y: 0, width: 1470, height: 956))
    let zoomed = WindowFacts(ownerPID: 42, layer: 0, bounds: CGRect(x: 0, y: 37, width: 1470, height: 919))
    let overlay = WindowFacts(ownerPID: 42, layer: 25, bounds: CGRect(x: 0, y: 0, width: 1470, height: 956))
    check(FullScreenCheck.frontmostIsFullScreen(frontmostPID: 42, windows: [fullBelowCamera], screens: [air]), "full screen below the camera")
    check(FullScreenCheck.frontmostIsFullScreen(frontmostPID: 42, windows: [fullWhole], screens: [air]), "full screen whole display")
    check(!FullScreenCheck.frontmostIsFullScreen(frontmostPID: 42, windows: [zoomed], screens: [air]), "a zoomed window isn't full screen")
    check(!FullScreenCheck.frontmostIsFullScreen(frontmostPID: 7, windows: [fullWhole], screens: [air]), "another app's full-screen window")
    check(!FullScreenCheck.frontmostIsFullScreen(frontmostPID: 42, windows: [overlay], screens: [air]), "overlay levels don't count")
    check(!FullScreenCheck.frontmostIsFullScreen(frontmostPID: nil, windows: [fullWhole], screens: [air]), "no frontmost app")
}

// MARK: Icon paths

do {
    func box(_ d: String) -> CGRect { SVGPath.cgPath(d).boundingBoxOfPath }
    func nearRect(_ a: CGRect, _ b: CGRect, _ what: String, line: UInt = #line) {
        check(abs(a.minX - b.minX) < 0.05 && abs(a.minY - b.minY) < 0.05 && abs(a.width - b.width) < 0.05 && abs(a.height - b.height) < 0.05,
              "\(what): got \(a), expected \(b)", line: line)
    }
    nearRect(box("M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"), CGRect(x: 9, y: 2, width: 6, height: 13), "mic capsule")
    nearRect(box("M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z"), CGRect(x: 9, y: 9, width: 6, height: 6), "circle from two arcs")
    nearRect(box("M4.9 19.1 7 17"), CGRect(x: 4.9, y: 17, width: 2.1, height: 2.1), "implicit line-to after M")
    nearRect(box("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"), CGRect(x: 3, y: 2, width: 18, height: 15), "bell with S")
    let lens = box("m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5")
    check(abs(lens.minX - 16) < 0.05 && abs(lens.maxX - 22) < 0.05 && lens.minY > 7.3 && lens.minY < 7.6
          && lens.maxY > 16.4 && lens.maxY < 16.7, "packed numbers (.5.5, .8-.4): \(lens)")
    let rain = box("M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2")
    check(rain.minX > 1 && rain.minY > 1 && rain.maxX < 23 && rain.maxY < 17, "cloud stays in its 24-unit box: \(rain)")
    let two = SVGPath.cgPath("M12 2v3M12 19v3")
    nearRect(two.boundingBoxOfPath, CGRect(x: 12, y: 2, width: 0, height: 20), "two subpaths")
}

// MARK: Connect: PKCE (RFC 7636) and the hand-off

do {
    // RFC 7636 Appendix B.
    equal(PKCE.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          "RFC 7636 appendix B challenge")
    equal(PKCE.base64url(Data([3, 236, 255, 224, 193])), "A-z_4ME", "base64url, no padding")
    let v = PKCE.makeVerifier()
    equal(v.count, 43, "verifier is 43 characters")
    check(PKCE.isValidVerifier(v), "verifier uses unreserved characters only: \(v)")
    check(PKCE.makeVerifier() != v, "verifiers are random")
    equal(PKCE.challenge(for: v).count, 43, "challenge is 43 characters")
    check(PKCE.isValidState(PKCE.makeState()), "state fits the server's shape")
    check(!PKCE.isValidVerifier("short"), "a short verifier is refused")

    let origin = URL(string: "https://build-flow.replit.app")!
    let flow = ConnectFlow(origin: origin, deviceName: "Liam's MacBook Air + A&B", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", state: "state-123.~_x")
    let items = URLComponents(url: flow.url, resolvingAgainstBaseURL: false)!.queryItems!
    func q(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
    equal(flow.url.path, "/desktop/connect", "connect page path")
    equal(q("code_challenge"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "challenge in the URL")
    equal(q("code_challenge_method"), "S256", "S256")
    equal(q("state"), "state-123.~_x", "state in the URL")
    equal(q("redirect_uri"), "buildflow://connect", "redirect uri")
    equal(q("device_name"), "Liam's MacBook Air + A&B", "device name survives + and &")
    check(!flow.url.absoluteString.contains("+ A"), "a literal + is escaped so a form decoder doesn't read a space")

    equal(flow.readCallback(URL(string: "buildflow://connect?code=abc123&state=state-123.~_x")!), .code("abc123"), "callback with the code")
    equal(flow.readCallback(URL(string: "buildflow://connect?code=abc123&state=someone-else")!), .wrongState, "state must match")
    equal(flow.readCallback(URL(string: "buildflow://connect?code=abc123")!), .wrongState, "state must be there")
    equal(flow.readCallback(URL(string: "buildflow://connect?error=access_denied&state=state-123.~_x")!), .denied, "Cancel on the page")
    equal(flow.readCallback(URL(string: "buildflow://other?code=abc&state=state-123.~_x")!), .malformed, "not a connect answer")
    equal(flow.readCallback(URL(string: "buildflow://connect?state=state-123.~_x")!), .malformed, "no code")

    equal(ServerOrigin.resolve(nil), ServerOrigin.defaultOrigin, "default origin")
    equal(ServerOrigin.resolve("http://127.0.0.1:4417/"), URL(string: "http://127.0.0.1:4417")!, "a local debug server")
    equal(ServerOrigin.resolve("http://example.com"), ServerOrigin.defaultOrigin, "plain http elsewhere is refused")
    equal(ServerOrigin.resolve("https://staging.example.com/app?x=1"), URL(string: "https://staging.example.com")!, "path and query dropped")
    equal(ServerOrigin.keychainAccount(URL(string: "http://127.0.0.1:4417")!), "http://127.0.0.1:4417", "keychain account")

    let store = MemoryDeviceKeyStore()
    try? store.save("bfd_one", for: URL(string: "http://127.0.0.1:4417")!)
    equal(store.key(for: URL(string: "http://127.0.0.1:4417")!), "bfd_one", "key filed under its server")
    equal(store.key(for: origin), nil, "another server never sees it")
}

// MARK: Server-sent events

do {
    func parseAll(_ chunks: [Data]) -> [SSEItem] {
        var p = SSEParser()
        var out: [SSEItem] = []
        for c in chunks { out += p.feed(c) }
        out += p.finish()
        return out
    }
    let stream = "event: inbox\ndata: {\"etag\":\"\\\"bfi-1\\\"\"}\n\n: ping\n\nevent: revoked\n\n"
    let whole = parseAll([Data(stream.utf8)])
    equal(whole, [.event(SSEEvent(event: "inbox", data: #"{"etag":"\"bfi-1\""}"#)), .comment("ping"),
                  .event(SSEEvent(event: "revoked", data: ""))], "inbox, ping, revoked")
    let bytes = Array(stream.utf8)
    equal(parseAll(bytes.map { Data([$0]) }), whole, "one byte at a time")
    for cut in 1..<bytes.count {
        let parts = [Data(bytes[..<cut]), Data(bytes[cut...])]
        if parseAll(parts) != whole { check(false, "split at byte \(cut)"); break }
    }
    equal(parseAll([Data("data: a\ndata: b\n\ndata:no-space\n\ndata:  two\n\n".utf8)]),
          [.event(SSEEvent(data: "a\nb")), .event(SSEEvent(data: "no-space")), .event(SSEEvent(data: " two"))], "multi-line data")
    equal(parseAll([Data("retry: 5000\n\nevent: inbox\ndata: {\"etag\":null}\n\n: ping\n\nevent: revoked\ndata: {\"code\":\"device_revoked\"}\n\n".utf8)]),
          [.retry(5000), .event(SSEEvent(event: "inbox", data: #"{"etag":null}"#)), .comment("ping"),
           .event(SSEEvent(event: "revoked", data: #"{"code":"device_revoked"}"#))], "the events stream as built: retry, catch-up, ping, revoked")
    let crlf = Array("event: text\r\ndata: {\"delta\":\"caf\u{E9}\"}\r\n\r\ndata: 2\r\r".utf8)
    let crlfWhole = parseAll([Data(crlf)])
    equal(crlfWhole, [.event(SSEEvent(event: "text", data: "{\"delta\":\"caf\u{E9}\"}")), .event(SSEEvent(data: "2"))], "CRLF and CR")
    equal(parseAll(crlf.map { Data([$0]) }), crlfWhole, "CRLF and a two-byte é split across chunks")
    equal(parseAll([Data("\u{FEFF}data: x\n\n".utf8)]), [.event(SSEEvent(data: "x"))], "a byte-order mark is skipped")
    equal(parseAll([Data("retry: 3000\nid: 7\ndata: y\n\n".utf8)]), [.retry(3000), .event(SSEEvent(data: "y", id: "7"))], "retry and id")
    equal(parseAll([Data("data: half an event".utf8)]), [], "an unfinished event is dropped when the stream ends")
    equal(parseAll([Data("\n\n:\n\n".utf8)]), [.comment("")], "blank lines alone dispatch nothing")

    var b = ReconnectBackoff()
    equal((0..<7).map { _ in b.next() }, [1, 2, 5, 10, 30, 30, 30], "reconnect backoff")
    b.reset()
    equal(b.next(), 1, "backoff starts over after a connection")
}

// MARK: The real DesktopInbox (fixture built by server buildDesktopInbox)

// mac/Fixtures/desktop-inbox.json: server/test/desktop-inbox.test.ts's workspace (plus an unbooked
// job and a pending variance) through buildDesktopInbox, with the wave-2 contract's additions:
// a `url` on every row and task paths rewritten to /api/desktop/tasks/<taskId>/<actionId>.
// Saturday 26 Sep 2026, 9:00 AM in Chicago.
var chicago = Calendar(identifier: .gregorian)
chicago.timeZone = TimeZone(identifier: "America/Chicago")!
let fixtureURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().appendingPathComponent("Fixtures/desktop-inbox.json")
let fixtureData = (try? Data(contentsOf: fixtureURL)) ?? Data()
let real: InboxSnapshot = {
    do { return try InboxDecoding.decode(fixtureData) } catch {
        print("FAIL: the real inbox fixture didn't decode: \(error)"); exit(1)
    }
}()
let fixtureNow = InboxDecoding.parseISO8601("2026-09-26T14:00:00.000Z")!

do {
    equal(real.version, 1, "version")
    equal(real.today, "2026-09-26", "today")
    equal(real.me, Me(firstName: "Liam", name: "liam santos", workspace: "Keating Paving", role: "owner", userId: "u-liam",
                      greeting: InboxGreeting(kind: "morning", text: "Good morning, Liam")), "me")
    equal(real.counts, InboxCounts(notifications: 6, unseen: 6, unread: 6, tasks: 4, jobsToday: 2, meetingsToday: 2), "counts")
    equal(real.notifications.map(\.id), ["equipment-eq-1", "delayIQ-d12", "field-fu-9", "weather-conflict-wx-j31-2026-09-26",
                                         "assignment-a1", "assignment-a2"], "notification ids, newest first")
    let eq = real.notifications[0]
    check(!eq.alertable && eq.kind == "equipment" && eq.tone == "amber", "equipment is amber but can never alert")
    let d = real.notifications[1]
    equal(d.title, "DelayIQ being tracked", "delayIQ title")
    equal(d.sub, "Rebar delivery slipping is open on Maple St. Plaza with 2 day impact.", "delayIQ sub")
    equal(d.tone, "red", "delayIQ tone")
    equal(d.at, InboxDecoding.parseISO8601("2026-09-26T13:48:00Z")!, "delayIQ time")
    equal(d.target, RecordRef(kind: "delayIQ", id: "d12"), "delayIQ target")
    equal(d.url, "https://build-flow.replit.app/delayIQs/d12", "delayIQ url")
    check(d.alertable && !d.seen && !d.read, "delayIQ can alert, unseen, unread")
    let a1 = real.notifications[4]
    check(a1.atIsDay && DayString.string(a1.at, calendar: .current) == "2026-09-26", "a day-only time decodes as that day")

    equal(real.jobs.map(\.id), ["j31", "j50", "j40"], "jobs, mine first")
    equal(real.jobs[0].weather, JobWeather(severity: "hold", cause: "rain", status: "open", reason: "0.30 in of rain",
                                           start: "2026-09-26T14:00", end: "2026-09-26T15:30", conflictId: "wx-j31-2026-09-26"), "job weather")
    equal(real.jobs[0].crewIds, ["c2"], "crew ids")
    equal(real.jobs[1].crews, [], "an unbooked job has no crew")
    check(real.jobs[0].mine && !real.jobs[2].mine, "mine")

    equal(real.meetings.map(\.title), ["Standup", "Owner walkthrough", "Monday review"], "meetings")
    equal(real.meetings[0].joinUrl, "https://meet.google.com/abc-defg-hij", "join url")
    equal(real.meetings[1].joinUrl, nil, "an empty join url is none")
    equal(real.meetings[1].location, "Maple St. Plaza", "location")
    equal(real.calendar, InboxCalendars(connected: ["google", "microsoft"], failed: []), "calendars")

    equal(real.tasks.map(\.kind), ["schedule-change", "weather-call", "unbooked-job", "readiness"], "task kinds")
    let book = real.tasks[2].actions[0]
    equal(book.request, TaskRequest(method: "POST", path: "/api/desktop/tasks/unbooked-j50/book",
                                    body: ["jobId": .string("j50"), "date": .string("2026-09-29")], needs: ["crewId"]), "book needs a crew")
    equal(real.tasks[0].actions.map(\.request.body), [["userId": .string("u-liam")], ["userId": .string("u-liam")]], "variance body as given")
    equal(real.tasks[1].dueClock, "14:00", "due time")
    equal(real.tasks[3].url, nil, "a null url")
    equal(real.crewChoices, [InboxCrew(id: "c2", name: "Crew 2"), InboxCrew(id: "c4", name: "Crew 4")], "crews to choose from")
    check(["Maple St. Plaza", "Oak Ridge", "Crew 2", "Footings pour"].allSatisfy(real.vocabulary.contains), "speech hints: \(real.vocabulary)")

    let p = InboxPresenter(inbox: real, now: fixtureNow, calendar: chicago)
    equal(p.count(for: .notifications), 6, "the tab shows the bell's unseen count")
    equal(p.count(for: .tasks), 2, "two tasks today")
    let n = p.card(for: .notifications)
    equal(n.rows.map(\.trailing), [.text("now"), .text("12m"), .text("40m"), .text("2h"), .text("Today"), .text("Today")], "ages")
    equal(n.rows.map(\.tone), [.warn, .bad, .ok, .bad, .muted, .muted], "tones: blue reads as news")
    equal(n.rows.map(\.icon), [.hardHatSmall, .triangleAlert, .activity, .cloudRain, .calendar, .calendar], "icons")
    let j = p.card(for: .jobs)
    equal(j.rows.map(\.subtitle), ["Maple St. Plaza · Crew 2 · Rain hold", "Maple St. Plaza · No crew · Confirmed",
                                   "Oak Ridge · Crew 4 · In Progress"], "real job subtitles")
    equal(j.rows.map(\.trailing), [.twoLine("Today", "7:00"), .twoLine("Tue", "7:00"), .twoLine("Today", "7:30")], "real job times")
    let m = p.card(for: .meetings)
    equal(m.rows.map(\.trailing), [.join("https://meet.google.com/abc-defg-hij"), .text("1:00 PM"), .text("Mon 10:00")], "real meeting times")
    equal(m.rows.map(\.subtitle), ["Google Meet", "Maple St. Plaza", "Google Calendar"], "real meeting subtitles")
    let t = p.card(for: .tasks)
    equal(t.rows.map(\.id), ["weather-call-wx-j31-2026-09-26", "variance-v7", "unbooked-j50", "readiness-r1"], "tasks by when they're due")
    equal(t.rows.map(\.trailing).last, .text("Fri"), "a task with no actions shows its day")
    equal(t.rows[2].trailing, .buttons([RowButton(id: "book", label: "Book a crew", primary: true)]), "book a crew")
    equal(t.rows[0].subtitle, "By 2 PM · Footings pour · Maple St. Plaza · Rain: 0.30 in of rain, Saturday 2–3:30 PM", "rain call subtitle")
    equal(p.todayRows().map(\.subtitle), ["Standup in 10 min", "Footings pour · 7:00", "Rain from 2 PM · Maple St. Plaza"], "real today card")
    equal(p.dayLine(), ["2 jobs today", "Standup at 9:10", "Rain after 2 PM"], "real greeting day line")
    equal(p.liveActivity(), LiveActivity(icon: .video, tone: .ok, label: "Standup", countdown: "10:00"), "meeting countdown")
    let dawn = InboxPresenter(inbox: real, now: InboxDecoding.parseISO8601("2026-09-26T11:40:00Z")!, calendar: chicago)
    equal(dawn.liveActivity(), LiveActivity(icon: .hardHatSmall, tone: .brand, label: "Footings pour", countdown: "20:00"), "job countdown")
    let quiet = InboxPresenter(inbox: real, now: InboxDecoding.parseISO8601("2026-09-26T13:40:00Z")!, calendar: chicago)
    equal(quiet.liveActivity(), nil, "30 min before the meeting and no job soon: rest")
    equal(InboxPresenter.alert(for: d), AlertContent(icon: .triangleAlert, tone: .bad, status: "DelayIQ", title: "DelayIQ being tracked",
                                                     subtitle: d.sub, notificationId: "delayIQ-d12"), "a DelayIQ alert")
    equal(InboxPresenter.alert(for: real.notifications[3]).status, "Weather hold", "a red weather conflict is a hold")
}

// MARK: One thing at a time; alerts once

do {
    let live = LiveActivity(icon: .video, tone: .ok, label: "Standup", countdown: "4:52")
    equal(NotchPriority.ambient(talking: true, alertPending: true, live: live), .voice, "talking beats everything")
    equal(NotchPriority.ambient(talking: false, alertPending: true, live: live), .alert, "an alert beats a countdown")
    equal(NotchPriority.ambient(talking: false, alertPending: false, live: live), .live, "a countdown beats resting")
    equal(NotchPriority.ambient(talking: false, alertPending: false, live: nil), .resting, "otherwise rest")
    // The presenter puts a meeting within 15 min before a job within 30.
    var both = InboxSnapshot(me: Me(firstName: "Liam"))
    both.meetings = [InboxMeeting(id: "m", title: "Standup", startsAt: at("2026-09-26 09:10"))]
    both.jobs = [InboxJob(id: "j", name: "Pour", project: "P", date: "2026-09-26", start: "09:05", mine: true)]
    equal(InboxPresenter(inbox: both, now: at("2026-09-26 09:00"), calendar: ny).liveActivity()?.label, "Standup", "meeting before job")
    both.meetings = []
    equal(InboxPresenter(inbox: both, now: at("2026-09-26 09:00"), calendar: ny).liveActivity()?.label, "Pour", "then the job")
    both.jobs[0].mine = false
    equal(InboxPresenter(inbox: both, now: at("2026-09-26 09:00"), calendar: ny).liveActivity(), nil, "only my jobs count down")

    var tracker = AlertTracker()
    let off = QuietHours.off
    equal(tracker.take(real, at: fixtureNow, quiet: off, calendar: chicago), [], "the first read only learns what's there")
    equal(tracker.take(real, at: fixtureNow, quiet: off, calendar: chicago), [], "nothing new, nothing shown")
    func note(_ id: String, _ kind: String, _ tone: String, alertable: Bool = true, seen: Bool = false, minutesAgo: Double = 1) -> InboxNotification {
        InboxNotification(id: id, kind: kind, title: id, tone: tone, at: fixtureNow.addingTimeInterval(-60 * minutesAgo), seen: seen, alertable: alertable)
    }
    var next = real
    next.notifications = [note("delayIQ-new", "delayIQ", "amber", minutesAgo: 1), note("weather-new", "weatherConflict", "red", minutesAgo: 2),
                          note("equipment-eq-9", "equipment", "amber", alertable: true), note("field-ok", "fieldUpdate", "green"),
                          note("seen-red", "delayIQ", "red", seen: true)] + real.notifications
    equal(tracker.take(next, at: fixtureNow, quiet: off, calendar: chicago).map(\.id), ["weather-new", "delayIQ-new"],
          "new red and amber alert, red first; never equipment, green or something already seen")
    equal(tracker.take(next, at: fixtureNow, quiet: off, calendar: chicago), [], "each one once")
    var night = next
    night.notifications.insert(note("delayIQ-late", "delayIQ", "red"), at: 0)
    let quietHours = QuietHours(enabled: true, start: 22 * 60, end: 7 * 60)
    equal(tracker.take(night, at: at("2026-09-26 23:30"), quiet: quietHours, calendar: ny), [], "quiet hours hold it back")
    equal(tracker.take(night, at: at("2026-09-27 08:00"), quiet: quietHours, calendar: ny), [], "and it doesn't alert later: it waits in the inbox")

    check(quietHours.contains(at("2026-09-26 23:00"), calendar: ny), "11 PM is quiet")
    check(quietHours.contains(at("2026-09-26 06:59"), calendar: ny), "6:59 AM is quiet")
    check(!quietHours.contains(at("2026-09-26 07:00"), calendar: ny), "7 AM isn't")
    check(!quietHours.contains(at("2026-09-26 12:00"), calendar: ny), "noon isn't")
    check(QuietHours(enabled: true, start: 13 * 60, end: 14 * 60).contains(at("2026-09-26 13:30"), calendar: ny), "a daytime span")
    check(!QuietHours.off.contains(at("2026-09-26 23:00"), calendar: ny), "off is never quiet")
    equal(quietHours.label, "10 PM – 7 AM", "quiet hours label")
}

// MARK: Read and seen, batched to one call a second

do {
    let t0 = Date(timeIntervalSince1970: 5000)
    var buffer = InboxStateBuffer()
    equal(buffer.take(now: t0), nil, "nothing to send")
    buffer.mark(seen: ["a", "b"])
    equal(buffer.take(now: t0), InboxStateChange(seen: ["a", "b"]), "the first call goes at once")
    buffer.mark(read: ["b"])
    equal(buffer.dueAt(now: t0.addingTimeInterval(0.3)), t0.addingTimeInterval(1), "the next waits out the second")
    equal(buffer.take(now: t0.addingTimeInterval(0.5)), nil, "not yet")
    buffer.mark(seen: ["c"], read: ["b", "c"])
    equal(buffer.take(now: t0.addingTimeInterval(1)), InboxStateChange(seen: ["c"], read: ["b", "c"]), "marks in the same second go together")
    buffer.mark(read: ["d"], allRead: true)
    equal(buffer.take(now: t0.addingTimeInterval(2.5)), InboxStateChange(allRead: true), "all read covers the single reads")
    buffer.restore(InboxStateChange(seen: ["e"]))
    check(buffer.hasPending, "a failed call's marks come back")

    let marked = real.marking(seen: ["delayIQ-d12"], read: ["field-fu-9"])
    equal(InboxPresenter(inbox: marked, now: fixtureNow, calendar: chicago).count(for: .notifications), 4, "marking updates the tab at once")
    equal(marked.counts?.unread, 5, "and the unread count")
    equal(real.marking(allRead: true).notifications.filter { !$0.read }.count, 0, "mark all read")
}

// MARK: Speaking sentence by sentence

do {
    let answer = "Crew 2 is framing at Oak Ridge tomorrow, 7:00 to 3:30. Rain is likely after 2 PM, so starting an hour early would finish the day dry."
    var rng = SystemRandomNumberGenerator()
    for _ in 0..<20 {
        var s = SentenceSplitter()
        var spoken: [String] = []
        var rest = Substring(answer)
        while !rest.isEmpty {
            let n = Int.random(in: 1...9, using: &rng)
            spoken += s.feed(String(rest.prefix(n)))
            rest = rest.dropFirst(n)
        }
        if let last = s.flush() { spoken.append(last) }
        if spoken != ["Crew 2 is framing at Oak Ridge tomorrow, 7:00 to 3:30.",
                      "Rain is likely after 2 PM, so starting an hour early would finish the day dry."] {
            check(false, "split in random chunks: \(spoken)")
            break
        }
    }
    var s = SentenceSplitter()
    equal(s.feed("Meet at Maple St. Plaza at 7. Bring the pump."), ["Meet at Maple St. Plaza at 7."], "St. doesn't end a sentence")
    equal(s.flush(), "Bring the pump.", "the last sentence waits for the end")
    equal(s.feed("It's 0.30 in of rain."), [], "a decimal isn't cut, and a final stop waits")
    equal(s.feed(" Is Crew 2 free? Yes! "), ["It's 0.30 in of rain.", "Is Crew 2 free?", "Yes!"], "question and exclamation marks")
    equal(s.flush(), nil, "nothing left")
    equal(s.feed("Starts at 7 a.m. tomorrow.\nThen "), ["Starts at 7 a.m. tomorrow.", ], "a.m. and a line break")
    equal(s.flush(), "Then", "flush")
    equal(s.feed("J. Smith said \"done.\" Next"), ["J. Smith said \"done.\""], "an initial and a closing quote")
    _ = s.flush()
    let long = String(repeating: "word ", count: 80)
    check(!s.feed(long).isEmpty, "a run-on answer is spoken in pieces")

    var h = ConversationHistory()
    for i in 1...4 { h.record(question: "q\(i)", answer: "a\(i)", at: at("2026-09-26 09:0\(i)")) }
    let sent = h.forQuestion(at: at("2026-09-26 09:05"))
    equal(sent.count, 6, "at most six turns")
    equal(sent.first, Turn(role: "user", text: "q2"), "the oldest are dropped")
    equal(sent.last, Turn(role: "assistant", text: "a4"), "the newest kept")
    equal(h.forQuestion(at: at("2026-09-26 09:30")), [], "a conversation left for 10 minutes is forgotten")

    equal(AskEvent.from(SSEEvent(event: "text", data: #"{"delta":"Hi"}"#)), .text("Hi"), "text event")
    equal(AskEvent.from(SSEEvent(event: "done", data: #"{"mode":"demo"}"#)), .done(mode: "demo"), "done event")
    equal(AskEvent.from(SSEEvent(event: "error", data: #"{"code":"rate_limited","message":"x"}"#)), .failed(code: "rate_limited", message: "x"), "error event")
    let pj = #"{"id":"p1","kind":"schedule_change","summary":"Start Framing at 6 AM instead of 7 AM.","jobId":"j40","jobName":"Framing","project":"Oak Ridge","change":{"field":"start","from":"7 AM","to":"6 AM","fromValue":"07:00","toValue":"06:00"},"expiresAt":"2026-09-26T14:10:00.000Z"}"#
    guard case let .proposal(prop)? = AskEvent.from(SSEEvent(event: "proposal", data: pj)) else { fatalError("proposal didn't decode") }
    equal(prop.change.fromValue, .string("07:00"), "fromValue")
    equal(prop.change.toValue, .string("06:00"), "toValue")
    equal(ProposalCard(prop, calendar: chicago), ProposalCard(id: "p1", jobId: "j40", subject: "Oak Ridge · Framing", verb: "starts",
                                                              from: "7 AM", to: "6 AM"), "the proposal card uses the server's words")
    let bare = Proposal(id: "p2", summary: "", jobId: "j", jobName: "Pour", project: "Maple",
                        change: .init(field: "date", from: .string(""), to: .string(""), fromValue: .string("2026-09-28"), toValue: .string("2026-09-29")))
    equal(ProposalCard(bare, calendar: chicago).to, "Tue, Sep 29", "without words, the card formats the raw value")
    let dateWords = #"{"id":"p3","kind":"schedule_change","summary":"x","jobId":"j","jobName":"Pour","project":"Maple","change":{"field":"date","from":"Monday, September 28","to":"Tuesday, September 29","fromValue":"2026-09-28","toValue":"2026-09-29"},"expiresAt":"2026-09-26T14:10:00.000Z"}"#
    if case let .proposal(p3)? = AskEvent.from(SSEEvent(event: "proposal", data: dateWords)) {
        equal(ProposalCard(p3, calendar: chicago).to, "Tuesday, September 29", "date words kept as the server wrote them")
    } else { check(false, "date proposal decodes") }
    equal(Proposal.display(.string("2026-09-29"), calendar: chicago), "Tue, Sep 29", "a date on the card")
    equal(AskEvent.plainWords(code: "rate_limited", message: ""), "That's 40 questions this hour, BuildFlow's limit. Ask again a little later.", "rate limit words")
}

// MARK: Plain words

do {
    equal(DesktopError.http(status: 400, code: "invalid_grant", message: nil, retryAfter: nil).connectWords,
          "That connection expired or was already used. Choose Connect this Mac… again.", "invalid_grant")
    equal(DesktopError.http(status: 403, code: "demo_account", message: nil, retryAfter: nil).connectWords,
          "The demo workspace can't connect a Mac. Sign in to BuildFlow with your own account, then connect again.", "demo_account")
    equal(DesktopError.http(status: 409, code: "device_limit", message: "This account already has 10 Macs connected. Disconnect one in Settings › Devices.", retryAfter: nil).connectWords,
          "This account already has 10 Macs connected. Disconnect one in Settings › Devices.", "device_limit says the server's words")
    equal(DesktopError.http(status: 429, code: nil, message: nil, retryAfter: 600).connectWords,
          "Too many tries in a row. Wait 10 minutes, then try again.", "429 with Retry-After")
    equal(DesktopError.unauthorized(code: "device_revoked").plainWords,
          "This Mac was disconnected from BuildFlow. Connect it again to see your inbox.", "revoked")
    equal(DesktopClient.retryAfter("120"), 120, "Retry-After seconds")
    let later = DesktopClient.retryAfter("Sat, 26 Sep 2026 14:05:00 GMT", now: fixtureNow)
    equal(later, 300, "Retry-After as a date")
    equal(TaskOutcome.conflict(nil).plainWords(label: "Accept", title: "x"),
          "Someone changed this since your inbox was read. Nothing changed; take another look.", "409 words")
    equal(TaskOutcome.conflict("This changed since your inbox was read. Look again before you answer.").plainWords(label: "Accept", title: "x"),
          "This changed since your inbox was read. Look again before you answer.", "409: the server's words as they are")
    equal(TaskOutcome.forbidden(nil).plainWords(label: "Accept", title: "x"), "Your role can't do that. An Owner or Admin can.", "403 words")
    equal(TaskOutcome.forbidden("Your workspace role does not allow this. Ask an owner or admin.").plainWords(label: "Accept", title: "x"),
          "Your workspace role does not allow this. Ask an owner or admin.", "403: the server's words")
    equal(TaskOutcome.notOnTeam.plainWords(label: "Accept", title: "x"),
          "This login isn't on the workspace's team yet, so BuildFlow can't answer for you. An Owner or Admin can add you.", "404 no_user words")
    equal(TaskOutcome.gone.plainWords(label: "Accept", title: "x"), "That's already been handled, so nothing changed.", "404 words")
    equal(ProposalOutcome.conflict(nil).plainWords, "The job changed since this was suggested. Nothing changed; ask again.", "proposal 409 words")
    equal(ProposalOutcome.conflict("Crew 4 is already booked that day. Nothing was changed.").plainWords,
          "Crew 4 is already booked that day. Nothing was changed. Ask again.", "proposal 409: the server's words")
    equal(AskEvent.plainWords(code: "rate_limited", message: "That's a lot of questions at once. Try again in 12 minutes."),
          "That's a lot of questions at once. Try again in 12 minutes.", "an error event says the server's words when it sends some")
    equal(ProposalOutcome.gone.plainWords, "That suggestion has expired. Nothing changed; ask again.", "proposal 404 words")
}

// MARK: The client against an in-process fake server (URLProtocol)

final class FakeServer: URLProtocol {
    struct Reply {
        var status: Int
        var headers: [String: String] = [:]
        var chunks: [Data] = []
        init(_ status: Int, headers: [String: String] = [:], _ chunks: [Data] = []) {
            self.status = status
            self.headers = headers
            self.chunks = chunks
        }
        init(_ status: Int, json: String, headers: [String: String] = [:]) {
            self.init(status, headers: headers.merging(["Content-Type": "application/json"]) { a, _ in a }, [Data(json.utf8)])
        }
    }
    struct Seen {
        var method: String
        var url: URL
        var headers: [String: String]
        var body: Data
        func json() -> [String: JSONValue] { (try? JSONDecoder().decode([String: JSONValue].self, from: body)) ?? [:] }
    }
    static let lock = NSLock()
    static var replies: [(match: (Seen) -> Bool, reply: (Seen) -> Reply)] = []
    static var seen: [Seen] = []

    static func reset() { lock.lock(); replies = []; seen = []; lock.unlock() }
    static func on(_ match: @escaping (Seen) -> Bool, _ reply: @escaping (Seen) -> Reply) {
        lock.lock(); replies.append((match, reply)); lock.unlock()
    }
    static func requests() -> [Seen] { lock.lock(); defer { lock.unlock() }; return seen }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buf, maxLength: buf.count)
                if n <= 0 { break }
                body.append(buf, count: n)
            }
            stream.close()
        }
        let s = Seen(method: request.httpMethod ?? "GET", url: request.url!,
                     headers: request.allHTTPHeaderFields ?? [:], body: body)
        Self.lock.lock()
        Self.seen.append(s)
        let handler = Self.replies.last(where: { $0.match(s) })?.reply
        Self.lock.unlock()
        let reply = handler?(s) ?? Reply(404, json: #"{"error":"not here"}"#)
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        for chunk in reply.chunks { client?.urlProtocol(self, didLoad: chunk) }
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

func path(_ p: String, _ method: String = "GET") -> (FakeServer.Seen) -> Bool {
    { $0.url.path == p && $0.method == method }
}

@MainActor
func waitUntil(_ seconds: Double = 5, _ condition: () -> Bool) async -> Bool {
    let end = Date().addingTimeInterval(seconds)
    while Date() < end {
        if condition() { return true }
        try? await Task.sleep(nanoseconds: 10_000_000)
    }
    return condition()
}

let fakeOrigin = URL(string: "http://127.0.0.1:4999")!
let fakeSession = DesktopClient.makeSession(protocolClasses: [FakeServer.self])

do {
    // The token exchange keeps the key and never returns it.
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore()
    let client = DesktopClient(origin: fakeOrigin, keys: keys, appVersion: "0.1.0 (1)", session: fakeSession)
    FakeServer.on(path("/api/desktop/token", "POST")) { _ in
        .init(201, json: #"{"key":"bfd_fresh","device":{"id":"dev-1","name":"Liam's MacBook Air","platform":"macOS 13.3","appVersion":"0.1.0 (1)","workspace":{"id":"org","name":"Keating Paving"},"createdAt":"x","lastSeenAt":null,"revokedAt":null}}"#)
    }
    let device = try? await client.exchange(code: "code-1", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", deviceName: "Liam's MacBook Air", platform: "macOS 13.3")
    equal(device?.id, "dev-1", "exchange answers the device")
    equal(keys.key(for: fakeOrigin), "bfd_fresh", "the key is kept in the store")
    let tokenCall = FakeServer.requests().last!
    equal(tokenCall.headers["Authorization"], nil, "no key is sent to get a key")
    equal(tokenCall.json()["code_verifier"], .string("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "verifier sent")
    equal(tokenCall.json()["app_version"], .string("0.1.0 (1)"), "app version in the body")
    equal(tokenCall.headers[DesktopClient.appVersionHeader], "0.1.0 (1)", "app version header")

    for (status, body, code) in [(400, #"{"error":"x","code":"invalid_grant"}"#, "invalid_grant"),
                                 (403, #"{"error":"x","code":"demo_account"}"#, "demo_account"),
                                 (409, #"{"error":"x","code":"device_limit"}"#, "device_limit")] {
        FakeServer.on(path("/api/desktop/token", "POST")) { _ in .init(status, json: body) }
        do {
            try await client.exchange(code: "c", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", deviceName: nil, platform: nil)
            check(false, "\(code) should fail")
        } catch let e as DesktopError {
            equal(e.code, code, "token error \(status)")
        } catch { check(false, "\(code): \(error)") }
    }
    FakeServer.on(path("/api/desktop/token", "POST")) { _ in .init(429, json: #"{"error":"slow down"}"#, headers: ["Retry-After": "900"]) }
    do {
        try await client.exchange(code: "c", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", deviceName: nil, platform: nil)
    } catch let e as DesktopError {
        equal(e.connectWords, "Too many tries in a row. Wait 15 minutes, then try again.", "429 Retry-After read")
    } catch { check(false, "429: \(error)") }
    equal(keys.key(for: fakeOrigin), "bfd_fresh", "a failed exchange keeps the old key")
}

do {
    // ETag / If-None-Match, headers, then a 401 that deletes the key.
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore()
    try? keys.save("bfd_test", for: fakeOrigin)
    let client = DesktopClient(origin: fakeOrigin, keys: keys, appVersion: "0.1.0 (1)", session: fakeSession)
    var unauthorizedCalls = 0
    client.onUnauthorized = { _ in unauthorizedCalls += 1 }
    var version = 1
    FakeServer.on(path("/api/desktop/inbox")) { s in
        let tag = "\"bfi-\(version)\""
        if s.headers["If-None-Match"] == tag { return .init(304, headers: ["ETag": tag]) }
        return .init(200, headers: ["ETag": tag, "Content-Type": "application/json", "Cache-Control": "private, no-cache"], [fixtureData])
    }
    let first = try? await client.fetchInbox(timeZone: "America/Chicago")
    equal(first, .fresh(real, etag: "\"bfi-1\""), "a first read is fresh")
    let r1 = FakeServer.requests().last!
    equal(r1.headers["Authorization"], "Bearer bfd_test", "bearer key")
    equal(r1.headers[DesktopClient.appVersionHeader], "0.1.0 (1)", "app version header on every call")
    equal(r1.headers["If-None-Match"], nil, "no If-None-Match without a copy")
    equal(URLComponents(url: r1.url, resolvingAgainstBaseURL: false)?.queryItems, [URLQueryItem(name: "tz", value: "America/Chicago")], "tz")
    let second = try? await client.fetchInbox(timeZone: "America/Chicago")
    equal(second, .notModified(real), "304 hands back the copy")
    equal(FakeServer.requests().last!.headers["If-None-Match"], "\"bfi-1\"", "If-None-Match sent")
    version = 2
    let third = try? await client.fetchInbox(timeZone: "America/Chicago")
    equal(third.map { if case .fresh(_, let tag) = $0 { return tag } else { return nil } } ?? nil, "\"bfi-2\"", "a change is fresh again")
    equal(client.lastInboxETag, "\"bfi-2\"", "new etag kept")

    FakeServer.on(path("/api/desktop/inbox")) { _ in .init(401, json: #"{"error":"gone","code":"device_revoked"}"#) }
    do {
        _ = try await client.fetchInbox(timeZone: "America/Chicago")
        check(false, "401 should throw")
    } catch let e as DesktopError {
        equal(e, .unauthorized(code: "device_revoked"), "401 carries its code")
    } catch { check(false, "401: \(error)") }
    equal(keys.key(for: fakeOrigin), nil, "any 401 deletes the key")
    equal(unauthorizedCalls, 1, "and says so once")
    let before = FakeServer.requests().count
    do { _ = try await client.me(); check(false, "no key, no call") } catch let e as DesktopError {
        equal(e, .notConnected, "without a key nothing is sent")
    } catch {}
    equal(FakeServer.requests().count, before, "no request without a key")

    // 404 (a server without the Mac inbox yet) is plain words, and the key stays.
    try? keys.save("bfd_test", for: fakeOrigin)
    client.clearCache()
    FakeServer.on(path("/api/desktop/inbox")) { _ in .init(404, json: #"{"error":"Not found"}"#) }
    do { _ = try await client.fetchInbox(timeZone: "UTC") } catch let e as DesktopError {
        equal(e.plainWords, "This BuildFlow server doesn't have that for Macs yet.", "404 words")
    } catch {}
    equal(keys.key(for: fakeOrigin), "bfd_test", "a 404 keeps the key")
}

do {
    // Task actions go exactly as given, needs first; the key never leaves /api/desktop on this origin.
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore(keys: [ServerOrigin.keychainAccount(fakeOrigin): "bfd_test"])
    let client = DesktopClient(origin: fakeOrigin, keys: keys, session: fakeSession)
    let book = real.tasks[2].actions[0]
    equal(try? await client.perform(book), .needs(["crewId"]), "a missing crew is asked for first")
    equal(FakeServer.requests().count, 0, "and nothing is sent")
    FakeServer.on(path("/api/desktop/tasks/unbooked-j50/book", "POST")) { _ in .init(200, json: #"{"ok":true,"etag":"\"bfi-9\""}"#) }
    equal(try? await client.perform(book, filling: ["crewId": .string("c2")]), .done(etag: "\"bfi-9\""), "booked")
    equal(FakeServer.requests().last!.json(), ["jobId": .string("j50"), "date": .string("2026-09-29"), "crewId": .string("c2")], "body as given plus the crew")
    let accept = real.tasks[0].actions[0]
    for (status, body, outcome) in [(404, #"{"code":"task_gone"}"#, TaskOutcome.gone),
                                    (404, #"{"code":"no_user","error":"This login has no place on the workspace's team yet."}"#, .notOnTeam),
                                    (403, #"{"code":"forbidden","error":"Your workspace role does not allow this. Ask an owner or admin.","need":"variance.resolve"}"#,
                                     .forbidden("Your workspace role does not allow this. Ask an owner or admin.")),
                                    (409, #"{"code":"conflict","message":"The job moved."}"#, .conflict("The job moved.")),
                                    (400, #"{"code":"invalid_request","needs":["crewId"]}"#, .needs(["crewId"]))] {
        FakeServer.on(path("/api/desktop/tasks/variance-v7/accept", "POST")) { _ in .init(status, json: body) }
        equal(try? await client.perform(accept), outcome, "task answer \(status)")
    }
    equal(FakeServer.requests().last!.json(), ["userId": .string("u-liam")], "the variance body as given")
    func tz(_ seen: FakeServer.Seen) -> String? {
        URLComponents(url: seen.url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "tz" })?.value
    }
    equal(tz(FakeServer.requests().last!), TimeZone.current.identifier, "tz on the task post")
    let evil = TaskAction(id: "x", label: "x", request: TaskRequest(path: "https://evil.example/api/desktop/steal"))
    let evil2 = TaskAction(id: "x", label: "x", request: TaskRequest(path: "//evil.example/api/desktop/steal"))
    let evil3 = TaskAction(id: "x", label: "x", request: TaskRequest(path: "/api/other/thing"))
    let count = FakeServer.requests().count
    for a in [evil, evil2, evil3] {
        do { _ = try await client.perform(a); check(false, "\(a.request.path) should be refused") } catch {}
    }
    equal(FakeServer.requests().count, count, "a path off this server's /api/desktop never gets the key")

    FakeServer.on(path("/api/desktop/inbox/state", "POST")) { _ in .init(200, json: #"{"etag":"\"bfi-3\""}"#) }
    equal(try? await client.postInboxState(InboxStateChange(seen: ["a"], read: ["a"])), "\"bfi-3\"", "state answers the etag")
    equal(FakeServer.requests().last!.json(), ["seen": .array([.string("a")]), "read": .array([.string("a")])], "state body")
    equal(tz(FakeServer.requests().last!), TimeZone.current.identifier, "tz on the state post")
    client.timeZone = { "America/Chicago" }
    FakeServer.on(path("/api/desktop/me")) { _ in .init(200, json: #"{"firstName":"Liam","name":"liam santos","workspace":"Keating Paving","role":"owner"}"#) }
    _ = try? await client.me()
    equal(tz(FakeServer.requests().last!), "America/Chicago", "tz on every device call, from the client's zone")
    client.timeZone = { TimeZone.current.identifier }

    FakeServer.on(path("/api/desktop/proposals/p 1/accept", "POST")) { _ in .init(200, json: #"{"ok":true,"job":{}}"#) }
    FakeServer.on(path("/api/desktop/proposals/p2/accept", "POST")) { _ in
        .init(409, json: #"{"error":"Crew 4 is already booked that day. Nothing was changed.","message":"Crew 4 is already booked that day. Nothing was changed.","code":"conflict","reason":"clash"}"#)
    }
    FakeServer.on(path("/api/desktop/proposals/p3/accept", "POST")) { _ in .init(404, json: #"{"code":"proposal_gone"}"#) }
    FakeServer.on(path("/api/desktop/proposals/p4/accept", "POST")) { _ in .init(403, json: #"{"code":"forbidden"}"#) }
    FakeServer.on(path("/api/desktop/proposals/p2/reject", "POST")) { _ in .init(200, json: #"{"ok":true}"#) }
    equal(try? await client.acceptProposal(id: "p 1"), .accepted, "accept")
    equal(FakeServer.requests().last!.url.path, "/api/desktop/proposals/p 1/accept", "the id is escaped in the path")
    equal(try? await client.acceptProposal(id: "p2"), .conflict("Crew 4 is already booked that day. Nothing was changed."), "accept 409, with the server's words")
    equal(try? await client.acceptProposal(id: "p3"), .gone, "accept 404")
    equal(try? await client.acceptProposal(id: "p4"), .forbidden(nil), "accept 403")
    equal(try? await client.rejectProposal(id: "p2"), .rejected, "reject")
}

do {
    // Asking: the answer streams in split chunks; history and tz go with it.
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore(keys: [ServerOrigin.keychainAccount(fakeOrigin): "bfd_test"])
    let client = DesktopClient(origin: fakeOrigin, keys: keys, session: fakeSession)
    let pj = #"{"id":"p1","kind":"schedule_change","summary":"Start at 6","jobId":"j40","jobName":"Framing","project":"Oak Ridge","change":{"field":"start","from":"07:00","to":"06:00"},"expiresAt":"2026-09-26T14:10:00.000Z"}"#
    let body = "event: text\ndata: {\"delta\":\"Crew 2 is fra\"}\n\n: ping\n\nevent: text\ndata: {\"delta\":\"ming. Rain later.\"}\n\nevent: proposal\ndata: \(pj)\n\nevent: done\ndata: {\"mode\":\"demo\"}\n\n"
    let bytes = Array(body.utf8)
    FakeServer.on(path("/api/desktop/ask", "POST")) { _ in
        .init(200, headers: ["Content-Type": "text/event-stream"], [Data(bytes[..<17]), Data(bytes[17..<40]), Data(bytes[40...])])
    }
    var got: [AskEvent] = []
    do {
        for try await e in client.ask(text: "What's Crew 2 doing?", history: (1...8).map { Turn(role: $0 % 2 == 1 ? "user" : "assistant", text: "t\($0)") }, timeZone: "America/Chicago") {
            got.append(e)
        }
    } catch { check(false, "ask threw \(error)") }
    equal(got.count, 4, "text, text, proposal, done")
    equal(got.first, .text("Crew 2 is fra"), "first delta")
    equal(got.last, .done(mode: "demo"), "demo mode")
    let askCall = FakeServer.requests().last!
    equal(askCall.headers["Accept"], "text/event-stream", "asks for a stream")
    equal(askCall.json()["text"], .string("What's Crew 2 doing?"), "question text")
    equal(askCall.json()["tz"], .string("America/Chicago"), "tz")
    if case let .array(h)? = askCall.json()["history"] { equal(h.count, 6, "history capped at six turns") } else { check(false, "history sent") }

    FakeServer.on(path("/api/desktop/ask", "POST")) { _ in .init(429, json: #"{"error":"limit"}"#) }
    var limited: [AskEvent] = []
    do { for try await e in client.ask(text: "x", history: [], timeZone: "UTC") { limited.append(e) } } catch {}
    equal(limited, [.failed(code: "rate_limited", message: "")], "a 429 reads as the rate limit")
}

do {
    // The live inbox: a nudge re-reads, a dropped stream reconnects, `event: revoked` stops and deletes the key.
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore(keys: [ServerOrigin.keychainAccount(fakeOrigin): "bfd_test"])
    let client = DesktopClient(origin: fakeOrigin, keys: keys, session: fakeSession)
    var connections = 0
    FakeServer.on(path("/api/desktop/inbox")) { _ in .init(200, headers: ["ETag": "\"bfi-\(connections)\""], [fixtureData]) }
    FakeServer.on(path("/api/desktop/events")) { _ in
        connections += 1
        if connections < 3 { return .init(200, headers: ["Content-Type": "text/event-stream"], [Data(": ping\n\nevent: inbox\ndata: {\"etag\":null}\n\n".utf8)]) }
        return .init(200, headers: ["Content-Type": "text/event-stream"], [Data("event: revoked\ndata: {}\n\n".utf8)])
    }
    let sync = InboxSync(client: client, pollInterval: 3600)
    var waits: [TimeInterval] = []
    sync.sleep = { s in waits.append(s); try? await Task.sleep(nanoseconds: 20_000_000) }
    var inboxes = 0
    var revokedWith: DesktopError?
    sync.onInbox = { _ in inboxes += 1 }
    sync.onRevoked = { revokedWith = $0 }
    sync.start()
    check(await waitUntil { revokedWith != nil }, "revoked arrives")
    equal(revokedWith, .unauthorized(code: "device_revoked"), "revoked is a 401 in effect")
    equal(keys.key(for: fakeOrigin), nil, "event: revoked deletes the key")
    check(!sync.isRunning, "the sync stops")
    check(sync.reads >= 2, "the first read and a nudge's re-read: \(sync.reads)")
    equal(connections, 3, "reconnected after each drop")
    equal(waits, [1, 1], "backoff starts over after each good connection")
    check(inboxes >= 1, "the inbox arrived")
}

do {
    // A sync's first read hands over the inbox even when the client already had it (304).
    FakeServer.reset()
    let keys = MemoryDeviceKeyStore(keys: [ServerOrigin.keychainAccount(fakeOrigin): "bfd_test"])
    let client = DesktopClient(origin: fakeOrigin, keys: keys, session: fakeSession)
    FakeServer.on(path("/api/desktop/inbox")) { s in
        s.headers["If-None-Match"] == "\"bfi-1\"" ? .init(304) : .init(200, headers: ["ETag": "\"bfi-1\""], [fixtureData])
    }
    FakeServer.on(path("/api/desktop/events")) { _ in .init(200, headers: ["Content-Type": "text/event-stream"], [Data("event: revoked\n\n".utf8)]) }
    _ = try? await client.fetchInbox(timeZone: "UTC")
    let sync = InboxSync(client: client, pollInterval: 3600)
    var got = 0
    sync.onInbox = { _ in got += 1 }
    sync.start()
    check(await waitUntil { got == 1 }, "the first read of a sync is handed over even on a 304")
    sync.stop()
}

print("\(passed) checks passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
