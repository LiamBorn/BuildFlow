import Foundation

// MARK: - Left ⌃ + left ⌥: tap for the inbox, hold to talk

/// Modifier bits as they arrive in an event's raw flags (IOLLEvent.h). The low
/// 16 bits are device-dependent and tell the left key from the right one.
public enum ModifierBits {
    public static let leftControl: UInt64 = 0x0001    // NX_DEVICELCTLKEYMASK
    public static let leftShift: UInt64 = 0x0002      // NX_DEVICELSHIFTKEYMASK
    public static let rightShift: UInt64 = 0x0004     // NX_DEVICERSHIFTKEYMASK
    public static let leftCommand: UInt64 = 0x0008    // NX_DEVICELCMDKEYMASK
    public static let rightCommand: UInt64 = 0x0010   // NX_DEVICERCMDKEYMASK
    public static let leftOption: UInt64 = 0x0020     // NX_DEVICELALTKEYMASK
    public static let rightOption: UInt64 = 0x0040    // NX_DEVICERALTKEYMASK
    public static let rightControl: UInt64 = 0x2000   // NX_DEVICERCTLKEYMASK

    public static let capsLock: UInt64 = 1 << 16      // NX_ALPHASHIFTMASK: a latch, not a key being held
    public static let shift: UInt64 = 1 << 17
    public static let control: UInt64 = 1 << 18
    public static let option: UInt64 = 1 << 19
    public static let command: UInt64 = 1 << 20
    public static let function: UInt64 = 1 << 23      // NX_SECONDARYFNMASK

    /// Anything that, held with ⌃⌥, makes it some other shortcut.
    public static let others: UInt64 = shift | command | function | leftShift | rightShift | leftCommand | rightCommand
        | rightOption | rightControl

    /// flagsChanged key codes.
    public static let leftControlKey: UInt16 = 59
    public static let leftOptionKey: UInt16 = 58
    public static let rightControlKey: UInt16 = 62
    public static let rightOptionKey: UInt16 = 61
}

/// How many keys and clicks the session has seen (`CGEventSource.counterForEventType`).
/// If any goes up while the chord is held, the chord was part of another shortcut.
public struct InputCounters: Equatable {
    public var keyDown: UInt32
    public var leftMouseDown: UInt32
    public var rightMouseDown: UInt32
    public var otherMouseDown: UInt32

    public init(keyDown: UInt32 = 0, leftMouseDown: UInt32 = 0, rightMouseDown: UInt32 = 0, otherMouseDown: UInt32 = 0) {
        self.keyDown = keyDown
        self.leftMouseDown = leftMouseDown
        self.rightMouseDown = rightMouseDown
        self.otherMouseDown = otherMouseDown
    }

    /// Something happened since `baseline` (compared with !=, so a counter wrapping round still counts).
    public func moved(since baseline: InputCounters) -> Bool { self != baseline }
}

public enum ChordEvent: Equatable {
    /// A clean tap: toggle the inbox.
    case toggleInbox
    /// Held past the threshold: start listening.
    case talkBegan
    /// Let go after talking: send what was heard.
    case talkEnded
    /// Another key, a click or another modifier joined while talking: stop and send nothing.
    case talkCancelled
    /// The chord went down while BuildFlow was speaking: stop speaking (this chord won't also toggle).
    case stopSpeaking
}

/// The chord as a state machine, fed the modifier flags (from flagsChanged
/// events, or a poll of the session's flags) and the session's key and click
/// counters, so it can be checked without a keyboard.
///
/// - Tap: left ⌃ and left ⌥ both down, in either order, then either let go
///   before `holdThreshold` (counted from the moment BOTH are down) → toggle.
/// - Hold: both still down at `holdThreshold` → talk; letting go of either → send.
/// - Anything else joining from the moment the first of the two goes down
///   (another key, a click, ⌘ ⇧ fn, a right-hand ⌃ or ⌥) → nothing before the
///   threshold, and a cancelled talk after it.
/// - After it fires, or is spoiled, nothing more happens until both keys are
///   up, so letting go of one and then the other acts once.
public struct ChordRecognizer: Equatable {
    public static let holdThreshold: TimeInterval = 0.35

    public enum Phase: Equatable {
        case idle
        /// One of the two is down, nothing else has happened yet.
        case partial(baseline: InputCounters)
        /// Both down and clean since `since`.
        case armed(since: Date, baseline: InputCounters, quiet: Bool)
        case talking(baseline: InputCounters)
        /// Done with this press (fired, or spoiled): wait for both keys to come up.
        case waitingForRelease
    }

    public let holdThreshold: TimeInterval
    public private(set) var phase: Phase = .idle
    public private(set) var flags: UInt64 = 0

    public init(holdThreshold: TimeInterval = ChordRecognizer.holdThreshold) {
        self.holdThreshold = holdThreshold
    }

    public var isIdle: Bool { phase == .idle }
    public var isTalking: Bool { if case .talking = phase { return true } else { return false } }

    static func bothDown(_ f: UInt64) -> Bool {
        f & ModifierBits.leftControl != 0 && f & ModifierBits.leftOption != 0
    }

    static func eitherDown(_ f: UInt64) -> Bool {
        f & (ModifierBits.leftControl | ModifierBits.leftOption) != 0
    }

    /// A flagsChanged event (with its key code) or a polled snapshot (`keyCode` nil).
    /// `speaking`: BuildFlow is talking right now.
    public mutating func flagsChanged(_ raw: UInt64, keyCode: UInt16? = nil, counters: InputCounters, at t: Date,
                                      speaking: Bool = false) -> [ChordEvent] {
        flags = raw
        // A flagsChanged from any key but left ⌃ or left ⌥ means another key took part, even as it comes up.
        let foreignKey = keyCode.map { $0 != ModifierBits.leftControlKey && $0 != ModifierBits.leftOptionKey } ?? false
        let spoiledBy = foreignKey || raw & ModifierBits.others != 0
        switch phase {
        case .idle:
            guard Self.eitherDown(raw) else { return [] }
            if spoiledBy { phase = .waitingForRelease; return [] }
            guard Self.bothDown(raw) else { phase = .partial(baseline: counters); return [] }
            return arm(at: t, baseline: counters, speaking: speaking)
        case let .partial(baseline):
            if spoiledBy || counters.moved(since: baseline) { phase = .waitingForRelease; return [] }
            if !Self.eitherDown(raw) { phase = .idle; return [] }
            guard Self.bothDown(raw) else { return [] }
            return arm(at: t, baseline: baseline, speaking: speaking)
        case let .armed(since, baseline, quiet):
            if spoiledBy || counters.moved(since: baseline) { phase = .waitingForRelease; return [] }
            if !Self.bothDown(raw) {
                phase = .waitingForRelease
                // Let go. A tap that only stopped the speech doesn't also toggle.
                return quiet ? [] : [.toggleInbox]
            }
            return tick(counters: counters, at: t, since: since, baseline: baseline)
        case let .talking(baseline):
            if spoiledBy || counters.moved(since: baseline) { phase = .waitingForRelease; return [.talkCancelled] }
            if !Self.bothDown(raw) { phase = .waitingForRelease; return [.talkEnded] }
            return []
        case .waitingForRelease:
            if !Self.eitherDown(raw) { phase = .idle }
            return []
        }
    }

    private mutating func arm(at t: Date, baseline: InputCounters, speaking: Bool) -> [ChordEvent] {
        phase = .armed(since: t, baseline: baseline, quiet: speaking)
        return speaking ? [.stopSpeaking] : []
    }

    /// Every ~30 ms while not idle: the hold threshold, and keys or clicks in between.
    public mutating func tick(counters: InputCounters, at t: Date) -> [ChordEvent] {
        switch phase {
        case let .partial(baseline):
            if counters.moved(since: baseline) { phase = .waitingForRelease }
            return []
        case let .armed(since, baseline, _):
            if counters.moved(since: baseline) { phase = .waitingForRelease; return [] }
            return tick(counters: counters, at: t, since: since, baseline: baseline)
        case let .talking(baseline):
            if counters.moved(since: baseline) { phase = .waitingForRelease; return [.talkCancelled] }
            return []
        default:
            return []
        }
    }

    private mutating func tick(counters: InputCounters, at t: Date, since: Date, baseline: InputCounters) -> [ChordEvent] {
        guard t.timeIntervalSince(since) >= holdThreshold else { return [] }
        phase = .talking(baseline: baseline)
        return [.talkBegan]
    }

    /// Forget a press in progress (e.g. the app lost track of the keys). A talk in progress is cancelled.
    public mutating func reset() -> [ChordEvent] {
        let wasTalking = isTalking
        phase = Self.eitherDown(flags) ? .waitingForRelease : .idle
        return wasTalking ? [.talkCancelled] : []
    }
}
