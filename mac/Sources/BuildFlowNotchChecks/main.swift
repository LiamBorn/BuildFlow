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
    equal(p.count(for: .notifications), 3, "unread on the bell tab")
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

    let j = p.card(for: .jobs)
    equal(j.title, "Upcoming jobs", "jobs card")
    equal(j.note, "Projects I manage", "jobs note")
    equal(j.rows.map(\.title), ["Footings pour", "Framing, level 2", "Site grading"], "my jobs first")
    equal(j.rows.map(\.subtitle), ["Maple St. Plaza · Crew 2 · Confirmed", "Oak Ridge · Crew 4 · In Progress",
                                   "Harbor Point · Crew 1 · Rain watch"], "job subtitles")
    equal(j.rows.map(\.trailing), [.twoLine("Today", "7:00"), .twoLine("Today", "7:30"), .twoLine("Mon", "6:30")], "job times")
    equal(j.rows.map(\.icon), [.hardHatSmall, .hardHatSmall, .cloudRain], "job icons")

    let m = p.card(for: .meetings)
    equal(m.title, "Meetings today", "meetings card")
    equal(m.note, "Google + Outlook", "calendars")
    equal(m.rows.map(\.title), ["Standup", "Owner walkthrough", "Sub coordination"], "meeting titles")
    equal(m.rows.map(\.subtitle), ["Google Meet · 6 people", "Maple St. Plaza · on site", "Microsoft Teams"], "meeting subtitles")
    equal(m.rows.map(\.trailing), [.join("https://meet.google.com/"), .text("1:00 PM"), .text("3:30 PM")], "Join, then times")
    equal(m.rows.map(\.tone), [.ok, .muted, .muted], "meeting tones")

    let t = p.card(for: .tasks)
    equal(t.title, "Waiting on you", "tasks card")
    equal(t.note, "2 today", "tasks note")
    equal(t.rows.map(\.title), ["Call the rain day", "Approve 2 time cards", "Permit posted on site"], "task titles")
    equal(t.rows.map(\.subtitle), ["Maple St. Plaza · WeatherIQ", "Week of Sep 21 · Time cards", "Oak Ridge · Readiness"], "task subtitles")
    equal(t.rows.map(\.trailing), [.text("By 2 PM"), .text("Today"), .text("Fri")], "task dues")
    equal(t.rows.map(\.icon), [.cloudRainSmall, .clock, .listSmall], "task icons")

    equal(p.todayHeader, "Sat, Sep 26", "today header")
    let today = p.todayRows()
    equal(today.map(\.title), ["Up next", "Next job", "Weather"], "today rows")
    equal(today.map(\.subtitle), ["Standup in 25 min", "Footings pour · 7:00", "61° · rain after 2 PM"], "today subtitles")
    equal(today.map(\.trailing), [.join("https://meet.google.com/"), .text("Crew 2"), .text("Maple St.")], "today trailing")
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
    equal(moved.tasks.map(\.due), ["14:00", "2026-10-01", "2026-10-07"], "task days move, times stay")
    let p = InboxPresenter(inbox: moved, now: target, calendar: ny)
    equal(p.dayLine(), ["3 jobs today", "Standup at 9:30", "Rain after 2 PM"], "rebased day line")
    equal(ExampleInboxSource.rebase(inbox, to: at("2026-09-26 20:00"), calendar: ny), inbox, "same day, no change")
}

do {
    let json = #"{"me":{"firstName":"Ana"},"notifications":[{"id":"n","title":"t","at":"2026-09-26T11:48:00.123Z","read":true}]}"#
    let s = try? InboxDecoding.decode(Data(json.utf8))
    equal(s?.me.firstName, "Ana", "minimal inbox decodes")
    equal(s?.jobs.count, 0, "missing lists are empty")
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

// MARK: ⌥Space

do {
    let t0 = Date(timeIntervalSince1970: 1000)
    var r = HoldTapRecognizer(holdThreshold: 0.3)
    r.press(at: t0)
    equal(r.tick(at: t0.addingTimeInterval(0.1)), nil, "no hold yet")
    equal(r.release(at: t0.addingTimeInterval(0.15)), .tap, "quick press is a tap")

    r.press(at: t0)
    r.press(at: t0.addingTimeInterval(0.2)) // key repeat
    equal(r.tick(at: t0.addingTimeInterval(0.35)), .holdBegan, "held past the threshold")
    equal(r.tick(at: t0.addingTimeInterval(0.5)), nil, "hold begins once")
    equal(r.release(at: t0.addingTimeInterval(2)), .holdEnded, "letting go ends the hold")

    r.press(at: t0)
    equal(r.release(at: t0.addingTimeInterval(0.6)), .holdEnded, "late release without a tick still ends a hold")
    equal(r.release(at: t0.addingTimeInterval(0.7)), nil, "release without press")
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

print("\(passed) checks passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
