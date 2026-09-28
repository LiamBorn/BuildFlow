import Foundation

// MARK: - Wording

/// The four parts of the day. "Late" runs 22:00–4:59 and belongs to the day it
/// started on, so 23:00 and 1:00 are the same part.
public enum PartOfDay: String, CaseIterable {
    case morning, afternoon, evening, late

    public static func at(_ date: Date, calendar: Calendar) -> PartOfDay {
        let h = calendar.component(.hour, from: date)
        switch h {
        case 5..<12: return .morning
        case 12..<17: return .afternoon
        case 17..<22: return .evening
        default: return .late
        }
    }

    public var salutation: String {
        switch self {
        case .morning: return "Good morning"
        case .afternoon: return "Good afternoon"
        case .evening: return "Good evening"
        case .late: return "Working late"
        }
    }
}

public enum GreetingWording {
    public static let welcomeBack = "Welcome back"

    public static func text(part: PartOfDay, firstName: String, welcomeBack: Bool = false) -> String {
        let lead = welcomeBack ? Self.welcomeBack : part.salutation
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? lead : "\(lead), \(name)"
    }
}

// MARK: - When it shows

public enum GreetingTrigger: String {
    case launch, wake, unlock
    /// "Replay greeting" in the menu: always shows, never uses up the part of the day.
    case replay
}

/// What the greeting remembers between launches (kept in UserDefaults).
public struct GreetingMemory: Equatable {
    /// The part of the day the greeting last showed in, e.g. "2026-09-26#morning".
    public var lastPartKey: String?
    /// When the Mac last went to sleep or locked, while it is away.
    public var awaySince: Date?

    public init(lastPartKey: String? = nil, awaySince: Date? = nil) {
        self.lastPartKey = lastPartKey
        self.awaySince = awaySince
    }
}

public enum GreetingSkip: String, Equatable {
    case disabled, fullScreen, alreadyShownThisPart
}

public enum GreetingDecision: Equatable {
    case show(text: String, part: PartOfDay, welcomeBack: Bool, partKey: String)
    case skip(GreetingSkip)

    public var text: String? {
        if case let .show(text, _, _, _) = self { return text }
        return nil
    }
}

public enum GreetingPlanner {
    /// Back after this long away says "Welcome back" instead of repeating the time of day.
    public static let welcomeBackAfter: TimeInterval = 3 * 3600

    /// "2026-09-26#morning"; at 1 AM on the 27th it is still "2026-09-26#late".
    public static func partKey(for date: Date, calendar: Calendar) -> String {
        let part = PartOfDay.at(date, calendar: calendar)
        var day = date
        if part == .late, calendar.component(.hour, from: date) < 5 {
            day = calendar.date(byAdding: .day, value: -1, to: date) ?? date
        }
        return "\(DayString.string(day, calendar: calendar))#\(part.rawValue)"
    }

    static func dayOf(_ key: String?) -> Substring? {
        key?.split(separator: "#").first
    }

    /// Decide whether a trigger shows the greeting, and with what words.
    /// - Once per part of the day (morning, afternoon, evening, late).
    /// - Never while a full-screen app is in front (and that doesn't use up the part).
    /// - "Welcome back" when the Mac was away 3 h or more and the greeting already
    ///   showed earlier the same day, so the first greeting of a day is always
    ///   the time of day.
    public static func decide(now: Date, trigger: GreetingTrigger, memory: GreetingMemory, firstName: String,
                              enabled: Bool, fullScreenFrontmost: Bool, calendar: Calendar) -> GreetingDecision {
        let part = PartOfDay.at(now, calendar: calendar)
        let key = partKey(for: now, calendar: calendar)
        if trigger == .replay {
            return .show(text: GreetingWording.text(part: part, firstName: firstName), part: part, welcomeBack: false, partKey: key)
        }
        guard enabled else { return .skip(.disabled) }
        guard !fullScreenFrontmost else { return .skip(.fullScreen) }
        guard memory.lastPartKey != key else { return .skip(.alreadyShownThisPart) }

        var welcomeBack = false
        if trigger != .launch, let away = memory.awaySince, now.timeIntervalSince(away) >= welcomeBackAfter,
           let lastDay = dayOf(memory.lastPartKey), lastDay == dayOf(key) {
            welcomeBack = true
        }
        return .show(text: GreetingWording.text(part: part, firstName: firstName, welcomeBack: welcomeBack),
                     part: part, welcomeBack: welcomeBack, partKey: key)
    }

    /// The memory after a decision: a shown greeting uses up its part; coming back
    /// from sleep or lock ends the away time either way.
    public static func remember(_ decision: GreetingDecision, trigger: GreetingTrigger, memory: GreetingMemory) -> GreetingMemory {
        var m = memory
        if trigger == .replay { return m }
        if case let .show(_, _, _, key) = decision { m.lastPartKey = key }
        // Launch, wake and unlock all mean the person is back.
        m.awaySince = nil
        return m
    }

    /// The Mac slept or locked. Keeps the earliest start if it happens twice.
    public static func wentAway(at date: Date, memory: GreetingMemory) -> GreetingMemory {
        var m = memory
        if m.awaySince == nil { m.awaySince = date }
        return m
    }
}

// MARK: - Persistence and settings

public final class GreetingStore {
    public enum Key {
        public static let enabled = "greeting.enabled"
        public static let speak = "greeting.speak"
        public static let lastPartKey = "greeting.lastPartKey"
        public static let awaySince = "greeting.awaySince"
    }

    public let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.register(defaults: [Key.enabled: true, Key.speak: false])
    }

    public var enabled: Bool {
        get { defaults.bool(forKey: Key.enabled) }
        set { defaults.set(newValue, forKey: Key.enabled) }
    }

    public var speakAloud: Bool {
        get { defaults.bool(forKey: Key.speak) }
        set { defaults.set(newValue, forKey: Key.speak) }
    }

    public var memory: GreetingMemory {
        get {
            GreetingMemory(lastPartKey: defaults.string(forKey: Key.lastPartKey),
                           awaySince: defaults.object(forKey: Key.awaySince) as? Date)
        }
        set {
            defaults.set(newValue.lastPartKey, forKey: Key.lastPartKey)
            if let away = newValue.awaySince { defaults.set(away, forKey: Key.awaySince) } else { defaults.removeObject(forKey: Key.awaySince) }
        }
    }
}

// MARK: - The greeting's motion, as numbers

/// Timings for the written script and the rim light, measured from the video: the script writes in
/// 1.7 s after 0.35 s, while a light runs once along the shape's rim.
public enum GreetingTimeline {
    public static let writeDelay: Double = 0.35
    public static let writeDuration: Double = 1.7
    public static let writeEasing = CubicBezier(0.45, 0.05, 0.4, 1)
    public static let traceDelay: Double = 0.3
    public static let traceDuration: Double = 2.1
    /// How long the greeting stays before it folds back into the notch.
    public static let holdDuration: Double = 4.2

    /// Where the soft edge of the writing mask is, from -0.08 (nothing shown) to 1 (all written).
    public static func reveal(at elapsed: Double) -> Double {
        let t = min(max((elapsed - writeDelay) / writeDuration, 0), 1)
        return -0.08 + 1.08 * writeEasing.value(at: t)
    }

    /// The rim light as the greeting opens.
    public static func trace(at elapsed: Double) -> RimTrace {
        RimTrace.at(elapsed, delay: traceDelay, duration: traceDuration)
    }
}

/// The light that runs once along the black shape's rim as it opens (f01 of the reference): down
/// the left side from under the ear, round the foot, and up the right side.
public struct RimTrace: Equatable {
    /// 0 … 1: faded in over the first 12 % of its run and out over the last 15 %.
    public let opacity: Double
    /// How far along the rim the light has run: 0 at the left ear, 1 at the right.
    public let head: Double

    public init(opacity: Double, head: Double) {
        self.opacity = opacity
        self.head = head
    }

    public static let off = RimTrace(opacity: 0, head: 0)

    /// The trace `elapsed` seconds after a shape opened; off before `delay` and after `delay + duration`.
    public static func at(_ elapsed: Double, delay: Double, duration: Double) -> RimTrace {
        let t = (elapsed - delay) / duration
        guard t > 0, t < 1 else { return .off }
        let opacity: Double
        if t < 0.12 { opacity = t / 0.12 } else if t > 0.85 { opacity = (1 - t) / 0.15 } else { opacity = 1 }
        return RimTrace(opacity: opacity, head: t)
    }

    /// Any other opening (an alert, voice, the dropdown opened by hovering): a quicker run.
    public static let openDelay: Double = 0.18
    public static let openDuration: Double = 1.1
    public static func opening(at elapsed: Double) -> RimTrace { at(elapsed, delay: openDelay, duration: openDuration) }
}

/// CSS-style cubic-bezier easing (the same solver browsers use).
public struct CubicBezier: Equatable {
    let ax, bx, cx, ay, by, cy: Double

    public init(_ p1x: Double, _ p1y: Double, _ p2x: Double, _ p2y: Double) {
        cx = 3 * p1x
        bx = 3 * (p2x - p1x) - cx
        ax = 1 - cx - bx
        cy = 3 * p1y
        by = 3 * (p2y - p1y) - cy
        ay = 1 - cy - by
    }

    func sampleX(_ t: Double) -> Double { ((ax * t + bx) * t + cx) * t }
    func sampleY(_ t: Double) -> Double { ((ay * t + by) * t + cy) * t }
    func sampleDX(_ t: Double) -> Double { (3 * ax * t + 2 * bx) * t + cx }

    func solveX(_ x: Double) -> Double {
        var t = x
        for _ in 0..<8 {
            let err = sampleX(t) - x
            if abs(err) < 1e-7 { return t }
            let d = sampleDX(t)
            if abs(d) < 1e-6 { break }
            t -= err / d
        }
        var lo = 0.0, hi = 1.0
        t = x
        while lo < hi {
            let v = sampleX(t)
            if abs(v - x) < 1e-7 { return t }
            if x > v { lo = t } else { hi = t }
            t = (hi - lo) / 2 + lo
            if hi - lo < 1e-9 { break }
        }
        return t
    }

    public func value(at x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        return sampleY(solveX(x))
    }
}

// MARK: - The dropdown's header: the greeting every time it opens

/// How the inbox was brought up, which decides whether its greeting plays.
public enum InboxOpening: String, CaseIterable {
    /// Left ⌃ + left ⌥ tapped while it was closed.
    case chord
    /// A click on the notch (at rest, a countdown, an alert), or Show Inbox in the menu.
    case click
    /// The pointer resting on the notch.
    case hover
}

/// The greeting at the top of the dropdown, in the website Dashboard's words (@buildflow/shared
/// `greetingFor`): the time of day, "Working late" from 22:00 to 4:59, and "Welcome back" for the
/// whole visit when it began after three hours or more away.
public enum HeaderGreeting {
    public static func text(now: Date, firstName: String, awayBeforeVisit: TimeInterval?, calendar: Calendar) -> String {
        let welcomeBack = (awayBeforeVisit ?? 0) >= GreetingPlanner.welcomeBackAfter
        return GreetingWording.text(part: PartOfDay.at(now, calendar: calendar), firstName: firstName, welcomeBack: welcomeBack)
    }
}

extension GreetingPlanner {
    /// How long the Mac had been away (asleep, locked, or BuildFlow not running) when this visit
    /// began, if it knows: read at launch, wake and unlock, before `remember` clears it.
    public static func awayBefore(now: Date, memory: GreetingMemory) -> TimeInterval? {
        memory.awaySince.map { max(0, now.timeIntervalSince($0)) }
    }
}

/// The dropdown's opening, as numbers. Opened by ⌃⌥ or a click, the shape opens first as the
/// greeting (the reference's f01): the script writes itself in white while a light runs along the
/// rim, and the day line comes in under it. After `greetingHold` the shape springs into the full
/// dropdown and its parts cascade in: the tabs and the buttons beside the camera, the list, and the
/// Today card. Opened by hovering, or with Reduce Motion on, the dropdown is simply there.
public enum InboxIntro {
    public enum Part: Int, CaseIterable {
        case chips, tabs, list, today
    }

    /// The script, written within the greeting (quicker than the lid's).
    public static let writeDelay: Double = 0.15
    public static let writeDuration: Double = 0.95
    public static let writeEasing = CubicBezier(0.45, 0.05, 0.4, 1)
    /// The rim light, run once while the greeting shows.
    public static let traceDelay: Double = 0.25
    public static let traceDuration: Double = 0.95
    /// How long the greeting shows before the shape springs into the dropdown.
    public static let greetingHold: Double = 1.3
    /// Each part's entrance: the website's base duration on its entrance curve (motion/tokens.ts DUR.base, EASE.out).
    public static let partDuration: Double = 0.4
    public static let partEasing = CubicBezier(0.22, 1, 0.36, 1)
    /// How far a part rises as it comes in, in points.
    public static let rise: Double = 10

    /// When a part starts coming in, in seconds after the dropdown was asked for: the day line under
    /// the script, then, once the shape has sprung open, the tabs, the list and Today a card-stagger apart.
    public static func start(_ part: Part) -> Double {
        switch part {
        case .chips: return 0.55
        case .tabs: return greetingHold + 0.08
        case .list: return greetingHold + 0.16
        case .today: return greetingHold + 0.24
        }
    }

    /// Everything in place.
    public static var settled: Double { start(.today) + partDuration }

    public static func plays(_ opening: InboxOpening, reduceMotion: Bool) -> Bool {
        guard !reduceMotion else { return false }
        switch opening {
        case .chord, .click: return true
        case .hover: return false
        }
    }

    /// Whether the shape is still the greeting, `elapsed` seconds after the dropdown was asked for.
    public static func showsGreeting(at elapsed: Double, playing: Bool) -> Bool {
        playing && elapsed < greetingHold
    }

    /// The script's mask edge, -0.08 (nothing written) … 1 (all written); written at once when the
    /// opening doesn't play.
    public static func reveal(at elapsed: Double, playing: Bool) -> Double {
        guard playing else { return 1 }
        let t = min(max((elapsed - writeDelay) / writeDuration, 0), 1)
        return -0.08 + 1.08 * writeEasing.value(at: t)
    }

    /// The rim light while the greeting shows; opened by hovering, the quicker run of any opening.
    public static func trace(at elapsed: Double, playing: Bool) -> RimTrace {
        playing ? RimTrace.at(elapsed, delay: traceDelay, duration: traceDuration) : RimTrace.opening(at: elapsed)
    }

    /// How far a part has come in, 0…1.
    public static func progress(_ part: Part, at elapsed: Double, playing: Bool) -> Double {
        guard playing else { return 1 }
        return partEasing.value(at: min(max((elapsed - start(part)) / partDuration, 0), 1))
    }
}
