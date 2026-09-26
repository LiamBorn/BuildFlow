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

/// Timings for the written script and the edge light, measured from the video and
/// matching the mock-up's CSS (`write 1.7s cubic-bezier(.45,.05,.4,1) .35s`,
/// `trace 2.1s linear .3s`).
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

    /// The edge light: opacity (fades in over the first 12 %, out over the last 15 %)
    /// and the angle of its bright end in CSS conic degrees (20° → -340°, one full turn).
    public static func trace(at elapsed: Double) -> (opacity: Double, angle: Double) {
        let t = (elapsed - traceDelay) / traceDuration
        if t <= 0 { return (0, 20) }
        if t >= 1 { return (0, -340) }
        let opacity: Double
        if t < 0.12 { opacity = t / 0.12 } else if t > 0.85 { opacity = (1 - t) / 0.15 } else { opacity = 1 }
        return (opacity, 20 - 360 * t)
    }
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
